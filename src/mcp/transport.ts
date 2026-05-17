import {
  MCP_ERROR,
  type McpJsonRpcRequest,
  type McpJsonRpcResponse,
} from "./protocol";
import type { InProcessMcpServer } from "./server";

export interface McpTransportContext {
  transportKind?: "in-process" | "stdio" | "http" | "plugin" | "unknown";
  origin?: string;
  pluginId?: string;
  clientId?: string;
  bearerToken?: string;
}

export interface McpTransport {
  send(request: McpJsonRpcRequest, context?: McpTransportContext): Promise<McpJsonRpcResponse>;
}

export interface AbortableMcpTransport extends McpTransport {
  sendAbortable(
    request: McpJsonRpcRequest,
    context: McpTransportContext,
    abortSignal: AbortSignal,
  ): Promise<McpJsonRpcResponse>;
}

export class InProcessMcpTransport implements McpTransport {
  private readonly _server: InProcessMcpServer;

  constructor(server: InProcessMcpServer) {
    this._server = server;
  }

  async send(request: McpJsonRpcRequest, _context?: McpTransportContext): Promise<McpJsonRpcResponse> {
    return await this._server.handle(request);
  }
}

export interface GuardedMcpTransportOptions {
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  maxJsonDepth?: number;
  timeoutMs?: number;
  maxConcurrent?: number;
  allowedMethods?: string[];
  allowedTools?: string[];
  allowedResourceUris?: string[];
  allowedResourceUriPrefixes?: string[];
  allowedOrigins?: string[];
  allowedPluginIds?: string[];
  requiredBearerToken?: string;
}

const DEFAULT_MAX_REQUEST_BYTES = 256 * 1024;
const DEFAULT_MAX_RESPONSE_BYTES = 512 * 1024;
const DEFAULT_MAX_JSON_DEPTH = 32;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_CONCURRENT = 8;

export class GuardedMcpTransport implements McpTransport {
  private readonly _inner: McpTransport;
  private readonly _maxRequestBytes: number;
  private readonly _maxResponseBytes: number;
  private readonly _maxJsonDepth: number;
  private readonly _timeoutMs: number;
  private readonly _maxConcurrent: number;
  private readonly _allowedMethods: Set<string> | null;
  private readonly _allowedTools: Set<string> | null;
  private readonly _allowedResourceUris: Set<string> | null;
  private readonly _allowedResourceUriPrefixes: string[];
  private readonly _allowedOrigins: Set<string> | null;
  private readonly _allowedPluginIds: Set<string> | null;
  private readonly _requiredBearerToken: string | null;
  private _inFlight = 0;

  constructor(inner: McpTransport, options: GuardedMcpTransportOptions = {}) {
    this._inner = inner;
    this._maxRequestBytes = positiveInteger(options.maxRequestBytes, DEFAULT_MAX_REQUEST_BYTES);
    this._maxResponseBytes = positiveInteger(options.maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES);
    this._maxJsonDepth = positiveInteger(options.maxJsonDepth, DEFAULT_MAX_JSON_DEPTH);
    this._timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
    this._maxConcurrent = positiveInteger(options.maxConcurrent, DEFAULT_MAX_CONCURRENT);
    this._allowedMethods = options.allowedMethods ? new Set(options.allowedMethods) : null;
    this._allowedTools = options.allowedTools ? new Set(options.allowedTools) : null;
    this._allowedResourceUris = options.allowedResourceUris ? new Set(options.allowedResourceUris.map(readResourceUri)) : null;
    this._allowedResourceUriPrefixes = options.allowedResourceUriPrefixes
      ? options.allowedResourceUriPrefixes.map(readResourcePrefix)
      : [];
    this._allowedOrigins = options.allowedOrigins ? new Set(options.allowedOrigins) : null;
    this._allowedPluginIds = options.allowedPluginIds ? new Set(options.allowedPluginIds) : null;
    this._requiredBearerToken = options.requiredBearerToken ?? null;
  }

  async send(request: McpJsonRpcRequest, context: McpTransportContext = {}): Promise<McpJsonRpcResponse> {
    const guardedRequest = validateJsonBoundary(request, "MCP transport request", {
      maxBytes: this._maxRequestBytes,
      maxDepth: this._maxJsonDepth,
    }) as McpJsonRpcRequest;
    const guardedContext = cloneTransportContext(context);
    this._validateContext(guardedContext);
    this._validateAllowlist(guardedRequest);

    if (this._inFlight >= this._maxConcurrent) {
      throw new McpTransportGuardError("MCP transport concurrency limit exceeded");
    }

    this._inFlight++;
    try {
      const response = await this._sendWithTimeout(guardedRequest, guardedContext);
      const guardedResponse = validateJsonBoundary(response, "MCP transport response", {
        maxBytes: this._maxResponseBytes,
        maxDepth: this._maxJsonDepth,
      }) as McpJsonRpcResponse;
      return this._sanitizeResourceResponse(guardedRequest, guardedResponse);
    } catch (error) {
      if (error instanceof McpTransportGuardError) throw error;
      throw new McpTransportGuardError("MCP guarded transport failed");
    } finally {
      this._inFlight--;
    }
  }

  private _validateAllowlist(request: McpJsonRpcRequest): void {
    if (this._allowedMethods && !this._allowedMethods.has(request.method)) {
      throw new McpTransportGuardError("MCP method not allowed");
    }

    if (request.method === "tools/call") {
      if (!this._allowedTools) return;
      if (!isRecord(request.params) || typeof request.params.name !== "string") {
        throw new McpTransportGuardError("MCP tools/call params require a tool name");
      }
      if (!this._allowedTools.has(request.params.name)) {
        throw new McpTransportGuardError("MCP tool not allowed");
      }
      return;
    }

    if (request.method === "resources/read") {
      if (!isRecord(request.params) || typeof request.params.uri !== "string" || request.params.uri.trim().length === 0) {
        throw new McpTransportGuardError("MCP resources/read params require a resource URI");
      }
      if (!this._isResourceAllowed(readResourceUri(request.params.uri))) {
        throw new McpTransportGuardError("MCP resource not allowed");
      }
    }
  }

  private _isResourceAllowed(uri: string): boolean {
    if (this._allowedResourceUris?.has(uri)) return true;
    return this._allowedResourceUriPrefixes.some((prefix) => uri.startsWith(prefix));
  }

  private _sanitizeResourceResponse(request: McpJsonRpcRequest, response: McpJsonRpcResponse): McpJsonRpcResponse {
    if (response.error !== undefined) {
      if (isResourceMethod(request.method)) {
        return {
          jsonrpc: "2.0",
          id: response.id,
          error: {
            code: readErrorCode(response.error),
            message: "MCP resource response failed",
          },
        };
      }
      return response;
    }
    if (request.method === "resources/list") {
      if (response.result === undefined || !isRecord(response.result) || !Array.isArray(response.result.resources)) {
        throw new McpTransportGuardError("MCP resource list response invalid");
      }
      const resources: Array<Record<string, string>> = [];
      for (const resource of response.result.resources) {
        if (!isRecord(resource) || typeof resource.uri !== "string") {
          throw new McpTransportGuardError("MCP resource list response invalid");
        }
        const uri = readResourceUri(resource.uri);
        if (!this._isResourceAllowed(uri)) {
          throw new McpTransportGuardError("MCP resource not allowed");
        }
        const sanitized: Record<string, string> = { uri };
        if (typeof resource.name === "string") sanitized.name = resource.name;
        if (typeof resource.description === "string") sanitized.description = resource.description;
        if (typeof resource.mimeType === "string") sanitized.mimeType = resource.mimeType;
        resources.push(sanitized);
      }
      return {
        jsonrpc: "2.0",
        id: response.id,
        result: { resources },
      };
    }

    if (request.method !== "resources/read") return response;
    if (!isRecord(request.params) || typeof request.params.uri !== "string") {
      throw new McpTransportGuardError("MCP resources/read params require a resource URI");
    }
    const requestedUri = readResourceUri(request.params.uri);
    if (response.result === undefined || !isRecord(response.result) || !Array.isArray(response.result.contents)) {
      throw new McpTransportGuardError("MCP resource read response invalid");
    }
    const contents: Array<Record<string, string>> = [];
    for (const content of response.result.contents) {
      if (!isRecord(content) || typeof content.uri !== "string") {
        throw new McpTransportGuardError("MCP resource read response invalid");
      }
      const contentUri = readResourceUri(content.uri);
      if (contentUri !== requestedUri || !this._isResourceAllowed(contentUri)) {
        throw new McpTransportGuardError("MCP resource not allowed");
      }
      const hasText = typeof content.text === "string";
      const hasBlob = typeof content.blob === "string";
      if (hasText === hasBlob) {
        throw new McpTransportGuardError("MCP resource read response invalid");
      }
      const sanitized: Record<string, string> = { uri: contentUri };
      if (typeof content.mimeType === "string") sanitized.mimeType = content.mimeType;
      if (hasText) sanitized.text = content.text as string;
      if (hasBlob) sanitized.blob = content.blob as string;
      contents.push(sanitized);
    }
    return {
      jsonrpc: "2.0",
      id: response.id,
      result: { contents },
    };
  }

  private _validateContext(context: McpTransportContext): void {
    if (this._allowedOrigins) {
      if (!context.origin || !this._allowedOrigins.has(context.origin)) {
        throw new McpTransportGuardError("MCP transport origin not allowed");
      }
    }
    if (this._allowedPluginIds) {
      if (!context.pluginId || !this._allowedPluginIds.has(context.pluginId)) {
        throw new McpTransportGuardError("MCP transport plugin not allowed");
      }
    }
    if (this._requiredBearerToken !== null) {
      if (!context.bearerToken || !constantTimeEquals(context.bearerToken, this._requiredBearerToken)) {
        throw new McpTransportGuardError("MCP transport authentication failed");
      }
    }
  }

  private async _sendWithTimeout(
    request: McpJsonRpcRequest,
    context: McpTransportContext,
  ): Promise<McpJsonRpcResponse> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const abortController = new AbortController();
    try {
      return await Promise.race([
        sendWithOptionalAbort(this._inner, request, context, abortController.signal),
        new Promise<McpJsonRpcResponse>((_resolve, reject) => {
          timeout = setTimeout(() => {
            abortController.abort();
            reject(new McpTransportGuardError("MCP transport timed out"));
          }, this._timeoutMs);
        }),
      ]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }
}

function sendWithOptionalAbort(
  transport: McpTransport,
  request: McpJsonRpcRequest,
  context: McpTransportContext,
  abortSignal: AbortSignal,
): Promise<McpJsonRpcResponse> {
  if (isAbortableTransport(transport)) {
    return transport.sendAbortable(request, context, abortSignal);
  }
  return transport.send(request, context);
}

function isAbortableTransport(transport: McpTransport): transport is AbortableMcpTransport {
  return typeof (transport as AbortableMcpTransport).sendAbortable === "function";
}

const CONTEXT_KEYS: ReadonlyArray<keyof McpTransportContext> = [
  "transportKind",
  "origin",
  "pluginId",
  "clientId",
  "bearerToken",
];
const TRANSPORT_KINDS = new Set<NonNullable<McpTransportContext["transportKind"]>>([
  "in-process",
  "stdio",
  "http",
  "plugin",
  "unknown",
]);

class McpTransportGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpTransportGuardError";
  }
}

function cloneTransportContext(context: McpTransportContext): McpTransportContext {
  try {
    if (!isRecord(context) || Object.getOwnPropertySymbols(context).length > 0) {
      throw new McpTransportGuardError("MCP guarded transport failed");
    }
    const descriptors = Object.getOwnPropertyDescriptors(context);
    const out: McpTransportContext = {};
    for (const key of CONTEXT_KEYS) {
      const descriptor = descriptors[key];
      if (descriptor === undefined) continue;
      if (!("value" in descriptor)) {
        throw new McpTransportGuardError("MCP guarded transport failed");
      }
      if (descriptor.value !== undefined && typeof descriptor.value !== "string") {
        throw new McpTransportGuardError("MCP transport context must be string-valued");
      }
      if (key === "transportKind") {
        if (descriptor.value !== undefined && !TRANSPORT_KINDS.has(descriptor.value)) {
          throw new McpTransportGuardError("MCP transport context kind invalid");
        }
        out.transportKind = descriptor.value;
      } else {
        out[key] = descriptor.value;
      }
    }
    return out;
  } catch (error) {
    if (error instanceof McpTransportGuardError) throw error;
    throw new McpTransportGuardError("MCP guarded transport failed");
  }
}

function validateJsonBoundary(
  value: unknown,
  label: string,
  limits: { maxBytes: number; maxDepth: number },
): unknown {
  let clone: unknown;
  try {
    clone = cloneJsonBoundaryValue(value, label, 1, limits.maxDepth);
  } catch (error) {
    if (error instanceof McpTransportGuardError) throw error;
    throw new McpTransportGuardError("MCP guarded transport failed");
  }
  const bytes = new TextEncoder().encode(JSON.stringify(clone)).length;
  if (bytes > limits.maxBytes) {
    const kind = label.includes("response") ? "response" : "request";
    throw new McpTransportGuardError(`MCP transport ${kind} too large`);
  }
  return clone;
}

function cloneJsonBoundaryValue(
  value: unknown,
  path: string,
  depth: number,
  maxDepth: number,
): unknown {
  if (depth > maxDepth) {
    const kind = path.includes("response") ? "response" : "request";
    throw new McpTransportGuardError(`MCP transport ${kind} too deep`);
  }
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new McpTransportGuardError(`${path} must be JSON-compatible`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (hasJsonStringifyHook(value) || Object.getOwnPropertySymbols(value).length > 0) {
      throw new McpTransportGuardError(`${path} must be JSON-compatible`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Object.keys(descriptors)) {
      if (key !== "length" && !isArrayIndexKey(key, value.length)) {
        throw new McpTransportGuardError(`${path} must be JSON-compatible`);
      }
    }
    const out: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined
        || descriptor.enumerable !== true
        || !("value" in descriptor)) {
        throw new McpTransportGuardError(`${path} must be JSON-compatible`);
      }
      out.push(cloneJsonBoundaryValue(descriptor.value, `${path}[${index}]`, depth + 1, maxDepth));
    }
    return out;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if ((prototype !== Object.prototype && prototype !== null)
      || hasJsonStringifyHook(value)
      || Object.getOwnPropertySymbols(value).length > 0) {
      throw new McpTransportGuardError(`${path} must be JSON-compatible`);
    }
    const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Object.keys(descriptors).sort()) {
      const descriptor = descriptors[key];
      if (descriptor === undefined
        || descriptor.enumerable !== true
        || !("value" in descriptor)
        || descriptor.value === undefined) {
        throw new McpTransportGuardError(`${path} must be JSON-compatible`);
      }
      Object.defineProperty(out, key, {
        enumerable: true,
        configurable: true,
        writable: true,
        value: cloneJsonBoundaryValue(descriptor.value, `${path}.${key}`, depth + 1, maxDepth),
      });
    }
    return out;
  }
  throw new McpTransportGuardError(`${path} must be JSON-compatible`);
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value !== undefined && value > 0 ? value : fallback;
}

function readResourceUri(value: string): string {
  if (value.trim().length === 0 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new McpTransportGuardError("MCP resource URI invalid");
  }
  if (hasDotSegment(value)) {
    throw new McpTransportGuardError("MCP resource URI invalid");
  }
  return value;
}

function readResourcePrefix(value: string): string {
  const prefix = readResourceUri(value);
  if (!prefix.endsWith("/") && !prefix.endsWith(":")) {
    throw new McpTransportGuardError("MCP resource prefix invalid");
  }
  return prefix;
}

function hasDotSegment(value: string): boolean {
  return dotSegmentIn(value) || dotSegmentIn(safeDecodeURIComponent(value));
}

function dotSegmentIn(value: string): boolean {
  return /(^|[\\/])\.{1,2}([\\/]|$)/.test(value);
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isResourceMethod(method: string): boolean {
  return method === "resources/list" || method === "resources/read";
}

function readErrorCode(value: unknown): number {
  if (isRecord(value) && typeof value.code === "number" && Number.isInteger(value.code)) {
    return value.code;
  }
  return MCP_ERROR.internalError;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArrayIndexKey(key: string, length: number): boolean {
  if (!/^(0|[1-9]\d*)$/.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length;
}

function hasJsonStringifyHook(value: object): boolean {
  let current: object | null = value;
  while (current) {
    if (Object.prototype.hasOwnProperty.call(current, "toJSON")) return true;
    current = Object.getPrototypeOf(current);
  }
  return false;
}

function constantTimeEquals(a: string, b: string): boolean {
  const maxLength = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let index = 0; index < maxLength; index++) {
    diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return diff === 0;
}
