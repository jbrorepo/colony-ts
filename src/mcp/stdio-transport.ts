import { scrubSecrets } from "../security/log-sanitizer";
import type {
  McpJsonRpcId,
  McpJsonRpcRequest,
  McpJsonRpcResponse,
} from "./protocol";
import type {
  AbortableMcpTransport,
  McpTransport,
  McpTransportContext,
} from "./transport";

export interface StdioMcpTransportOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  transportContext?: Omit<McpTransportContext, "transportKind">;
  maxLineBytes?: number;
  maxStderrBytes?: number;
}

export interface StdioMcpTransportDiagnostics {
  command: string;
  pending: number;
  closed: boolean;
  stderrTail: string;
  transportContext: McpTransportContext;
}

type StdioSubprocess = Bun.PipedSubprocess;

interface PendingRequest {
  resolve: (response: McpJsonRpcResponse) => void;
  reject: (error: Error) => void;
}

const DEFAULT_MAX_LINE_BYTES = 1024 * 1024;
const DEFAULT_MAX_STDERR_BYTES = 8 * 1024;
const GENERIC_FAILURE = "MCP stdio transport failed";

export class StdioMcpTransport implements AbortableMcpTransport {
  private readonly _command: string;
  private readonly _args: string[];
  private readonly _cwd: string | undefined;
  private readonly _env: Record<string, string>;
  private readonly _transportContext: McpTransportContext;
  private readonly _maxLineBytes: number;
  private readonly _maxStderrBytes: number;
  private readonly _encoder = new TextEncoder();
  private readonly _stdoutDecoder = new TextDecoder();
  private readonly _stderrDecoder = new TextDecoder();
  private readonly _pending = new Map<McpJsonRpcId, PendingRequest>();
  private _proc: StdioSubprocess | null = null;
  private _stdoutBuffer = "";
  private _stderrTail = "";
  private _closed = false;

  constructor(options: StdioMcpTransportOptions) {
    this._command = validateCommand(options.command);
    this._args = validateArgs(options.args ?? []);
    this._cwd = validateOptionalString(options.cwd, "cwd");
    this._env = options.env ? { ...validateEnv(options.env) } : defaultChildEnv();
    this._transportContext = {
      transportKind: "stdio",
      ...(options.transportContext ?? {}),
    };
    this._maxLineBytes = positiveInteger(options.maxLineBytes, DEFAULT_MAX_LINE_BYTES);
    this._maxStderrBytes = positiveInteger(options.maxStderrBytes, DEFAULT_MAX_STDERR_BYTES);
  }

  async send(request: McpJsonRpcRequest, context: McpTransportContext = {}): Promise<McpJsonRpcResponse> {
    return await this._send(request, context);
  }

  async sendAbortable(
    request: McpJsonRpcRequest,
    context: McpTransportContext,
    abortSignal: AbortSignal,
  ): Promise<McpJsonRpcResponse> {
    return await this._send(request, context, abortSignal);
  }

  private async _send(
    request: McpJsonRpcRequest,
    _context: McpTransportContext = {},
    abortSignal?: AbortSignal,
  ): Promise<McpJsonRpcResponse> {
    if (this._closed) {
      throw new Error(GENERIC_FAILURE);
    }
    if (abortSignal?.aborted) {
      this._failTransport();
      throw new Error(GENERIC_FAILURE);
    }
    if (this._pending.has(request.id)) {
      throw new Error(GENERIC_FAILURE);
    }
    const proc = this._ensureStarted();
    const line = JSON.stringify(request) + "\n";
    if (this._encoder.encode(line).length > this._maxLineBytes) {
      throw new Error(GENERIC_FAILURE);
    }

    return await new Promise<McpJsonRpcResponse>((resolve, reject) => {
      const removeAbortListener = addAbortListener(abortSignal, () => {
        this._failTransport();
      });
      this._pending.set(request.id, {
        resolve: (response) => {
          removeAbortListener();
          resolve(response);
        },
        reject: (error) => {
          removeAbortListener();
          reject(error);
        },
      });
      try {
        if (abortSignal?.aborted) {
          this._failTransport();
          return;
        }
        proc.stdin.write(line);
      } catch {
        this._pending.delete(request.id);
        removeAbortListener();
        reject(new Error(GENERIC_FAILURE));
        this._failTransport();
      }
    });
  }

  async close(): Promise<void> {
    if (this._closed) return;
    this._closed = true;
    this._rejectPending();
    const proc = this._proc;
    this._proc = null;
    if (!proc) return;
    try {
      proc.stdin.end();
    } catch {
      // Process may already have exited.
    }
    try {
      proc.kill();
    } catch {
      // Process may already have exited.
    }
    try {
      await proc.exited;
    } catch {
      // Close is best-effort and must remain idempotent.
    }
  }

  diagnostics(): StdioMcpTransportDiagnostics {
    return {
      command: this._command,
      pending: this._pending.size,
      closed: this._closed,
      stderrTail: scrubStdioDiagnostics(this._stderrTail),
      transportContext: { ...this._transportContext },
    };
  }

  private _ensureStarted(): StdioSubprocess {
    if (this._proc) return this._proc;
    try {
      this._proc = Bun.spawn<"pipe", "pipe", "pipe">([this._command, ...this._args], {
        cwd: this._cwd,
        env: this._env,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch {
      throw new Error(GENERIC_FAILURE);
    }
    void this._readStdout(this._proc.stdout);
    void this._readStderr(this._proc.stderr);
    void this._watchExit(this._proc);
    return this._proc;
  }

  private async _readStdout(stdout: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stdout.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        this._stdoutBuffer += this._stdoutDecoder.decode(value, { stream: true });
        if (this._encoder.encode(this._stdoutBuffer).length > this._maxLineBytes) {
          this._failTransport();
          return;
        }
        this._drainStdoutLines();
      }
      const tail = this._stdoutDecoder.decode();
      if (tail) this._stdoutBuffer += tail;
      if (this._stdoutBuffer.trim().length > 0) {
        this._failTransport();
      }
    } catch {
      this._failTransport();
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // Reader may already be released during process teardown.
      }
    }
  }

  private _drainStdoutLines(): void {
    while (true) {
      const newlineIndex = this._stdoutBuffer.indexOf("\n");
      if (newlineIndex < 0) return;
      const line = this._stdoutBuffer.slice(0, newlineIndex).replace(/\r$/, "");
      this._stdoutBuffer = this._stdoutBuffer.slice(newlineIndex + 1);
      if (this._encoder.encode(line).length > this._maxLineBytes) {
        this._failTransport();
        return;
      }
      if (line.trim().length === 0) continue;
      this._handleResponseLine(line);
      if (this._closed) return;
    }
  }

  private _handleResponseLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      this._failTransport();
      return;
    }
    if (!isJsonRpcResponse(parsed)) {
      this._failTransport();
      return;
    }
    const pending = this._pending.get(parsed.id);
    if (!pending) {
      this._failTransport();
      return;
    }
    this._pending.delete(parsed.id);
    pending.resolve(parsed);
  }

  private async _readStderr(stderr: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stderr.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        this._stderrTail = trimTailBytes(
          scrubStdioDiagnostics(this._stderrTail + this._stderrDecoder.decode(value, { stream: true })),
          this._maxStderrBytes,
        );
      }
    } catch {
      // Stderr is diagnostics-only; stdout/exit own request failure.
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // Reader may already be released during process teardown.
      }
    }
  }

  private async _watchExit(proc: StdioSubprocess): Promise<void> {
    try {
      await proc.exited;
    } catch {
      // Exit status is intentionally not surfaced to callers.
    }
    if (this._proc === proc && !this._closed) {
      this._failTransport();
    }
  }

  private _failTransport(): void {
    if (this._closed) return;
    this._closed = true;
    this._rejectPending();
    const proc = this._proc;
    this._proc = null;
    if (!proc) return;
    try {
      proc.stdin.end();
    } catch {
      // Process may already have exited.
    }
    try {
      proc.kill();
    } catch {
      // Process may already have exited.
    }
  }

  private _rejectPending(): void {
    const error = new Error(GENERIC_FAILURE);
    for (const pending of this._pending.values()) {
      pending.reject(error);
    }
    this._pending.clear();
  }
}

function validateCommand(command: string): string {
  const value = validateString(command, "command", false);
  if (value.trim().length === 0) throw new Error("MCP stdio command is required");
  return value;
}

function validateArgs(args: string[]): string[] {
  if (!Array.isArray(args)) throw new Error("MCP stdio args must be an array");
  return args.map((arg) => validateString(arg, "arg", true));
}

function validateEnv(env: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    out[validateString(key, "env key", false)] = validateString(value, "env value", true);
  }
  return out;
}

function validateOptionalString(value: string | undefined, label: string): string | undefined {
  if (value === undefined) return undefined;
  return validateString(value, label, false);
}

function validateString(value: string, label: string, allowNewlines: boolean): string {
  const forbidden = allowNewlines ? /[\0]/ : /[\0\r\n]/;
  if (typeof value !== "string" || forbidden.test(value)) {
    throw new Error(`MCP stdio ${label} is invalid`);
  }
  return value;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value !== undefined && value > 0 ? value : fallback;
}

function defaultChildEnv(): Record<string, string> {
  const keys = process.platform === "win32"
    ? ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP"]
    : ["PATH", "HOME", "TMPDIR", "TEMP", "TMP"];
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function trimTailBytes(text: string, maxBytes: number): string {
  if (new TextEncoder().encode(text).length <= maxBytes) return text;
  let out = text;
  while (out.length > 0 && new TextEncoder().encode(out).length > maxBytes) {
    out = out.slice(Math.max(1, Math.floor(out.length / 4)));
  }
  return out;
}

function scrubStdioDiagnostics(text: string): string {
  return scrubSecrets(text).replace(/[A-Za-z0-9][A-Za-z0-9._-]{15,}/g, "****");
}

function addAbortListener(signal: AbortSignal | undefined, onAbort: () => void): () => void {
  if (!signal) return () => {};
  signal.addEventListener("abort", onAbort, { once: true });
  return () => signal.removeEventListener("abort", onAbort);
}

function isJsonRpcResponse(value: unknown): value is McpJsonRpcResponse {
  if (!isRecord(value) || value.jsonrpc !== "2.0") return false;
  if (!("id" in value) || !isJsonRpcId(value.id)) return false;
  const hasResult = Object.prototype.hasOwnProperty.call(value, "result");
  const hasError = Object.prototype.hasOwnProperty.call(value, "error");
  if (hasResult === hasError) return false;
  if (!hasError) return true;
  return isRecord(value.error)
    && typeof value.error.code === "number"
    && typeof value.error.message === "string";
}

function isJsonRpcId(value: unknown): value is McpJsonRpcId {
  return value === null || typeof value === "string" || typeof value === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
