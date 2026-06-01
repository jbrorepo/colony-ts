// Thin client for the Colony daemon REST API.
//
// Wraps the v1 endpoints shipped in src/daemon/web-ui.ts:
//   GET    /api/v1/health
//   GET    /api/v1/sessions
//   POST   /api/v1/sessions
//   GET    /api/v1/swarm/runs
//   POST   /api/v1/swarm/runs
//   GET    /api/v1/swarm/runs/:id
//   POST   /api/v1/swarm/runs/:id/cancel
//   POST   /api/v1/diffs/preview
//   GET    /api/v1/mcp/servers
//
// Transport: global `fetch`. No axios / node-fetch — matches Colony's
// "no vendor SDKs in production paths" rule.
//
// Auth: bearer token from VS Code's SecretStorage (managed by extension.ts).

const DEFAULT_DAEMON_URL = "http://127.0.0.1:7878";

// ---------------------------------------------------------------------------
// Public types (mirror the server's response shapes, kept duplicated rather
// than imported to keep the extension a standalone publish target)
// ---------------------------------------------------------------------------

export interface ColonyHealth {
  ok: boolean;
  startedAt: string | null;
  capabilities: string[];
}

export interface ColonySwarmRunSnapshot {
  runId: string;
  title: string;
  objective: string;
  status: "running" | "completed" | "failed" | "cancelled";
  executionMode: string;
  stages: Array<{ stage: string; status: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface ColonyDiffLine {
  kind: "context" | "added" | "removed";
  oldLineNo: number | null;
  newLineNo: number | null;
  text: string;
}

export interface ColonyDiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: ColonyDiffLine[];
}

export interface ColonyUnifiedDiff {
  filename: string;
  unchanged: boolean;
  hunks: ColonyDiffHunk[];
  stats: { added: number; removed: number; hunkCount: number };
}

export interface ColonyMcpServer {
  id: string;
  kind: "http" | "stdio";
  description: string;
  endpoint: string;
  trusted: boolean;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ColonyDaemonError extends Error {
  readonly status: number | null;
  readonly endpoint: string;
  constructor(message: string, opts: { status?: number; endpoint: string }) {
    super(message);
    this.name = "ColonyDaemonError";
    this.status = opts.status ?? null;
    this.endpoint = opts.endpoint;
  }
}

export class ColonyDaemonUnreachableError extends ColonyDaemonError {
  constructor(endpoint: string, cause: unknown) {
    super(
      `Colony daemon not reachable at ${endpoint}. Start it with: bun run scripts/start-daemon.ts`,
      { endpoint },
    );
    this.name = "ColonyDaemonUnreachableError";
    (this as { cause?: unknown }).cause = cause;
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface ColonyClientOptions {
  daemonUrl?: string;
  getBearerToken?: () => Promise<string | undefined>;
  fetchImpl?: typeof fetch;
}

export class ColonyClient {
  private readonly _baseUrl: string;
  private readonly _getBearerToken: () => Promise<string | undefined>;
  private readonly _fetch: typeof fetch;

  constructor(options: ColonyClientOptions = {}) {
    this._baseUrl = (options.daemonUrl ?? DEFAULT_DAEMON_URL).replace(/\/+$/, "");
    this._getBearerToken = options.getBearerToken ?? (async () => undefined);
    this._fetch = options.fetchImpl ?? fetch;
  }

  get baseUrl(): string {
    return this._baseUrl;
  }

  async health(): Promise<ColonyHealth> {
    return await this._get<ColonyHealth>("/api/v1/health");
  }

  async listSwarmRuns(): Promise<ColonySwarmRunSnapshot[]> {
    const data = await this._get<{ runs: ColonySwarmRunSnapshot[] }>("/api/v1/swarm/runs");
    return data.runs ?? [];
  }

  async inspectSwarmRun(runId: string): Promise<ColonySwarmRunSnapshot> {
    const data = await this._get<{ run: ColonySwarmRunSnapshot }>(`/api/v1/swarm/runs/${encodeURIComponent(runId)}`);
    return data.run;
  }

  async startSwarmRun(input: {
    objective: string;
    title?: string;
    detached?: boolean;
    executionMode?: "llm" | "coordinator_only";
  }): Promise<ColonySwarmRunSnapshot> {
    const data = await this._post<{ run: ColonySwarmRunSnapshot }>(
      "/api/v1/swarm/runs",
      input,
    );
    return data.run;
  }

  async cancelSwarmRun(runId: string, reason?: string): Promise<ColonySwarmRunSnapshot> {
    const data = await this._post<{ run: ColonySwarmRunSnapshot }>(
      `/api/v1/swarm/runs/${encodeURIComponent(runId)}/cancel`,
      { reason },
    );
    return data.run;
  }

  async previewDiff(input: {
    oldText: string;
    newText: string;
    filename?: string;
    contextLines?: number;
  }): Promise<ColonyUnifiedDiff> {
    const data = await this._post<{ diff: ColonyUnifiedDiff }>(
      "/api/v1/diffs/preview",
      input,
    );
    return data.diff;
  }

  async listMcpServers(): Promise<ColonyMcpServer[]> {
    const data = await this._get<{ servers: ColonyMcpServer[] }>("/api/v1/mcp/servers");
    return data.servers ?? [];
  }

  // -------------------------------------------------------------------------

  private async _get<T>(path: string): Promise<T> {
    return await this._request<T>(path, { method: "GET" });
  }

  private async _post<T>(path: string, body: unknown): Promise<T> {
    return await this._request<T>(path, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
      headers: { "content-type": "application/json" },
    });
  }

  private async _request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this._baseUrl}${path}`;
    const token = await this._getBearerToken();
    const headers: Record<string, string> = {
      accept: "application/json",
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    };
    if (token) headers.authorization = `Bearer ${token}`;

    let response: Response;
    try {
      response = await this._fetch(url, { ...init, headers });
    } catch (err) {
      if (isConnectionError(err)) {
        throw new ColonyDaemonUnreachableError(this._baseUrl, err);
      }
      throw new ColonyDaemonError(
        `Request to ${path} failed: ${err instanceof Error ? err.message : String(err)}`,
        { endpoint: url },
      );
    }

    if (!response.ok) {
      let detail = "";
      try {
        const errBody = (await response.json()) as { error?: string };
        detail = errBody.error ?? "";
      } catch {
        // ignore
      }
      throw new ColonyDaemonError(
        `HTTP ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ""}`,
        { status: response.status, endpoint: url },
      );
    }

    return (await response.json()) as T;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Legacy v0.1 streaming-ask shim
//
// The original extension exposed `askColony({ prompt, onChunk })` and
// expected a streaming response. The new REST surface doesn't have a
// streaming /v1/ask endpoint — the closest equivalent is creating a
// detached swarm run and returning a confirmation. This shim preserves
// the API for `ask-about-selection.ts` so existing wiring keeps working
// while we migrate to the richer client interface.
// ---------------------------------------------------------------------------

export interface AskOptions {
  prompt: string;
  onChunk: (chunk: string) => void;
  signal?: AbortSignal;
  /** Override the default daemon URL. */
  daemonUrl?: string;
  /** Override the default bearer-token resolver. */
  getBearerToken?: () => Promise<string | undefined>;
}

export async function askColony(options: AskOptions): Promise<void> {
  const client = new ColonyClient({
    daemonUrl: options.daemonUrl,
    getBearerToken: options.getBearerToken,
  });
  try {
    const run = await client.startSwarmRun({
      objective: options.prompt,
      title: "VS Code: Ask About Selection",
      detached: true,
    });
    options.onChunk(
      [
        `Swarm run started: ${run.runId}`,
        `Status: ${run.status}`,
        ``,
        `Poll for progress with: "Colony: List Swarm Runs"`,
      ].join("\n"),
    );
  } catch (err) {
    if (err instanceof ColonyDaemonUnreachableError) {
      options.onChunk(
        `Colony daemon not running at ${err.endpoint}.\n` +
          "Start it with: bun run scripts/start-daemon.ts\n" +
          "Or use: Colony: New Session In Terminal",
      );
      return;
    }
    throw err;
  }
}

function isConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ECONNRESET") {
    return true;
  }
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeCode = (cause as NodeJS.ErrnoException).code;
    if (causeCode === "ECONNREFUSED" || causeCode === "ENOTFOUND" || causeCode === "EAI_AGAIN" || causeCode === "ECONNRESET") {
      return true;
    }
  }
  return err.name === "TypeError" && /fetch failed/i.test(err.message);
}
