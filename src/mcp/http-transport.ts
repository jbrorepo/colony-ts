import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type {
  AbortableMcpTransport,
  McpTransportContext,
} from "./transport";
import type {
  McpJsonRpcId,
  McpJsonRpcRequest,
  McpJsonRpcResponse,
} from "./protocol";

export interface HttpMcpTransportOptions {
  endpoint: string;
  headers?: Record<string, string>;
  bearerToken?: string;
  fetchImpl?: HttpFetch;
  timeoutMs?: number;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  resolveHostname?: HttpResolveHostname;
}

export interface HttpMcpTransportDiagnostics {
  endpoint: string;
  headerNames: string[];
  pending: number;
}

type HttpFetch = (input: string, init?: RequestInit) => Promise<Response>;
type HttpResolveHostname = (hostname: string) => Promise<ReadonlyArray<HttpResolvedAddress>>;

interface HttpResolvedAddress {
  address: string;
  family: 4 | 6;
}

const GENERIC_FAILURE = "MCP HTTP transport failed";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REQUEST_BYTES = 256 * 1024;
const DEFAULT_MAX_RESPONSE_BYTES = 512 * 1024;
const DEFAULT_MAX_JSON_DEPTH = 32;
const FORBIDDEN_CUSTOM_HEADERS = new Set([
  "authorization",
  "connection",
  "content-length",
  "content-type",
  "cookie",
  "host",
  "origin",
  "proxy-authenticate",
  "proxy-authorization",
  "referer",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export class HttpMcpTransport implements AbortableMcpTransport {
  private readonly _endpoint: string;
  private readonly _hostname: string;
  private readonly _diagnosticEndpoint: string;
  private readonly _headers: Record<string, string>;
  private readonly _fetch: HttpFetch;
  private readonly _resolveHostname: HttpResolveHostname;
  private readonly _timeoutMs: number;
  private readonly _maxRequestBytes: number;
  private readonly _maxResponseBytes: number;
  private _pending = 0;

  constructor(options: HttpMcpTransportOptions) {
    const endpoint = validateEndpoint(options.endpoint);
    this._endpoint = endpoint.toString();
    this._hostname = normalizeHostname(endpoint.hostname);
    this._diagnosticEndpoint = redactedEndpoint(endpoint);
    this._headers = validateHeaders(options.headers ?? {}, options.bearerToken);
    this._fetch = options.fetchImpl ?? fetch;
    this._resolveHostname = options.resolveHostname ?? defaultResolveHostname;
    this._timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
    this._maxRequestBytes = positiveInteger(options.maxRequestBytes, DEFAULT_MAX_REQUEST_BYTES);
    this._maxResponseBytes = positiveInteger(options.maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES);
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

  diagnostics(): HttpMcpTransportDiagnostics {
    return {
      endpoint: this._diagnosticEndpoint,
      headerNames: Object.keys(this._headers).sort(),
      pending: this._pending,
    };
  }

  private async _send(
    request: McpJsonRpcRequest,
    _context: McpTransportContext = {},
    abortSignal?: AbortSignal,
  ): Promise<McpJsonRpcResponse> {
    const sentRequest = serializeRequest(request, this._maxRequestBytes);
    const abort = createRelayAbortController(abortSignal, this._timeoutMs);
    this._pending++;
    try {
      await raceWithAbort(assertResolvedEndpointSafe(this._hostname, this._resolveHostname), abort.signal);
      const response = await raceWithAbort(this._fetch(this._endpoint, {
        method: "POST",
        headers: this._headers,
        body: sentRequest.body,
        redirect: "error",
        signal: abort.signal,
      }), abort.signal);
      if (!response.ok || response.redirected) throw new Error(GENERIC_FAILURE);
      const text = await raceWithAbort(readBoundedResponseText(response, this._maxResponseBytes), abort.signal);
      const parsed = JSON.parse(text) as unknown;
      return readJsonRpcResponse(parsed, sentRequest.id);
    } catch {
      throw new Error(GENERIC_FAILURE);
    } finally {
      abort.dispose();
      this._pending--;
    }
  }
}

function validateEndpoint(endpoint: string): URL {
  try {
    if (typeof endpoint !== "string" || /[\0\r\n]/.test(endpoint)) {
      throw new Error(GENERIC_FAILURE);
    }
    const url = new URL(endpoint);
    if (url.protocol !== "https:") {
      throw new Error(GENERIC_FAILURE);
    }
    if (url.username || url.password) {
      throw new Error(GENERIC_FAILURE);
    }
    if (isUnsafeEndpointHost(url.hostname)) {
      throw new Error(GENERIC_FAILURE);
    }
    return url;
  } catch {
    throw new Error(GENERIC_FAILURE);
  }
}

function redactedEndpoint(endpoint: URL): string {
  const out = new URL(endpoint.toString());
  out.username = "";
  out.password = "";
  out.search = "";
  out.hash = "";
  return out.toString();
}

function validateHeaders(headers: Record<string, string>, bearerToken: string | undefined): Record<string, string> {
  if (!isPlainRecord(headers)) throw new Error(GENERIC_FAILURE);
  const out: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };
  for (const [key, value] of Object.entries(headers)) {
    const name = validateHeaderName(key);
    if (FORBIDDEN_CUSTOM_HEADERS.has(name)) {
      throw new Error(GENERIC_FAILURE);
    }
    out[name] = validateHeaderValue(value);
  }
  if (bearerToken !== undefined) {
    if (bearerToken.length === 0) throw new Error(GENERIC_FAILURE);
    out.authorization = `Bearer ${validateHeaderValue(bearerToken)}`;
  }
  return out;
}

function validateHeaderName(value: string): string {
  if (typeof value !== "string" || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value)) {
    throw new Error(GENERIC_FAILURE);
  }
  return value.toLowerCase();
}

function validateHeaderValue(value: string): string {
  if (typeof value !== "string" || /[\0\r\n]/.test(value)) {
    throw new Error(GENERIC_FAILURE);
  }
  return value;
}

function serializeRequest(request: McpJsonRpcRequest, maxRequestBytes: number): { body: string; id: McpJsonRpcId } {
  try {
    const clone = cloneJsonBoundaryValue(request, "MCP HTTP request", 1, DEFAULT_MAX_JSON_DEPTH);
    if (!isRecord(clone) || !isJsonRpcId(clone.id)) {
      throw new Error(GENERIC_FAILURE);
    }
    const body = JSON.stringify(clone);
    if (typeof body !== "string" || new TextEncoder().encode(body).length > maxRequestBytes) {
      throw new Error(GENERIC_FAILURE);
    }
    return { body, id: clone.id };
  } catch {
    throw new Error(GENERIC_FAILURE);
  }
}

function createRelayAbortController(
  abortSignal: AbortSignal | undefined,
  timeoutMs: number,
): AbortController & { dispose(): void } {
  const controller = new AbortController() as AbortController & { dispose(): void };
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const abort = () => controller.abort();
  if (abortSignal?.aborted) controller.abort();
  else abortSignal?.addEventListener("abort", abort, { once: true });
  timeout = setTimeout(abort, timeoutMs);
  controller.dispose = () => {
    if (timeout !== undefined) clearTimeout(timeout);
    abortSignal?.removeEventListener("abort", abort);
  };
  return controller;
}

async function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new Error(GENERIC_FAILURE);
  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => queueMicrotask(() => reject(new Error(GENERIC_FAILURE)));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function readBoundedResponseText(response: Response, maxResponseBytes: number): Promise<string> {
  const body = response.body;
  if (!body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).length > maxResponseBytes) {
      throw new Error(GENERIC_FAILURE);
    }
    return text;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      if (bytes > maxResponseBytes) {
        try {
          await reader.cancel();
        } catch {
          // Best-effort cancellation after enforcing the byte bound.
        }
        throw new Error(GENERIC_FAILURE);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Reader may already be released after cancellation.
    }
  }
}

function readJsonRpcResponse(value: unknown, expectedId: McpJsonRpcId): McpJsonRpcResponse {
  if (!isRecord(value) || value.jsonrpc !== "2.0") throw new Error(GENERIC_FAILURE);
  if (!("id" in value) || !isJsonRpcId(value.id) || value.id !== expectedId) {
    throw new Error(GENERIC_FAILURE);
  }
  const hasResult = Object.prototype.hasOwnProperty.call(value, "result");
  const hasError = Object.prototype.hasOwnProperty.call(value, "error");
  if (hasResult === hasError) throw new Error(GENERIC_FAILURE);
  if (hasError) {
    if (!isRecord(value.error)
      || typeof value.error.code !== "number"
      || !Number.isFinite(value.error.code)
      || typeof value.error.message !== "string") {
      throw new Error(GENERIC_FAILURE);
    }
    return {
      jsonrpc: "2.0",
      id: value.id,
      error: {
        code: value.error.code,
        message: value.error.message,
        ...(value.error.data === undefined ? {} : { data: value.error.data }),
      },
    };
  }
  return {
    jsonrpc: "2.0",
    id: value.id,
    result: value.result,
  };
}

function isJsonRpcId(value: unknown): value is McpJsonRpcId {
  return value === null || typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

function cloneJsonBoundaryValue(
  value: unknown,
  path: string,
  depth: number,
  maxDepth: number,
): unknown {
  if (depth > maxDepth) throw new Error(GENERIC_FAILURE);
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(GENERIC_FAILURE);
    return value;
  }
  if (Array.isArray(value)) {
    if (hasJsonStringifyHook(value) || Object.getOwnPropertySymbols(value).length > 0) {
      throw new Error(GENERIC_FAILURE);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Object.keys(descriptors)) {
      if (key !== "length" && !isArrayIndexKey(key, value.length)) {
        throw new Error(GENERIC_FAILURE);
      }
    }
    const out: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined
        || descriptor.enumerable !== true
        || !("value" in descriptor)) {
        throw new Error(GENERIC_FAILURE);
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
      throw new Error(GENERIC_FAILURE);
    }
    const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Object.keys(descriptors).sort()) {
      const descriptor = descriptors[key];
      if (descriptor === undefined
        || descriptor.enumerable !== true
        || !("value" in descriptor)
        || descriptor.value === undefined) {
        throw new Error(GENERIC_FAILURE);
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
  throw new Error(GENERIC_FAILURE);
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

function isUnsafeEndpointHost(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  if (host === "localhost" || host.endsWith(".localhost")) return true;

  const ipv4 = parseIpv4(host);
  if (ipv4) return isUnsafeIpv4(ipv4);

  if (isIP(host) === 6) return isUnsafeIpv6(host);
  return false;
}

async function assertResolvedEndpointSafe(
  hostname: string,
  resolveHostname: HttpResolveHostname,
): Promise<void> {
  const literalIpFamily = isIP(hostname);
  const addresses = literalIpFamily === 0
    ? await resolveHostname(hostname)
    : [{ address: hostname, family: literalIpFamily as 4 | 6 }];
  if (addresses.length === 0) throw new Error(GENERIC_FAILURE);
  for (const address of addresses) {
    if (typeof address.address !== "string" || (address.family !== 4 && address.family !== 6)) {
      throw new Error(GENERIC_FAILURE);
    }
    if (isUnsafeEndpointHost(address.address)) {
      throw new Error(GENERIC_FAILURE);
    }
  }
}

async function defaultResolveHostname(hostname: string): Promise<ReadonlyArray<HttpResolvedAddress>> {
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    return records.map((record) => ({
      address: record.address,
      family: record.family === 6 ? 6 : 4,
    }));
  } catch {
    throw new Error(GENERIC_FAILURE);
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
}

function isUnsafeIpv4(ipv4: [number, number, number, number]): boolean {
  const [a, b] = ipv4;
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
}

function isUnsafeIpv6(host: string): boolean {
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  const mappedIpv4 = parseIpv4MappedIpv6(host);
  if (mappedIpv4) return isUnsafeIpv4(mappedIpv4);
  const firstHextet = firstIpv6Hextet(host);
  if (firstHextet === null) return true;
  return (firstHextet & 0xffc0) === 0xfe80
    || (firstHextet & 0xfe00) === 0xfc00;
}

function firstIpv6Hextet(host: string): number | null {
  const first = host.split(":")[0];
  if (first === undefined || first.length === 0 || !/^[0-9a-f]{1,4}$/i.test(first)) {
    return host.startsWith("::") ? 0 : null;
  }
  const value = Number.parseInt(first, 16);
  return Number.isInteger(value) ? value : null;
}

function parseIpv4MappedIpv6(host: string): [number, number, number, number] | null {
  if (!host.startsWith("::ffff:") && !host.startsWith("0:0:0:0:0:ffff:")) return null;
  const tail = host.startsWith("::ffff:")
    ? host.slice("::ffff:".length)
    : host.slice("0:0:0:0:0:ffff:".length);
  const dotted = parseIpv4(tail);
  if (dotted) return dotted;
  const hextets = tail.split(":");
  if (hextets.length !== 2 || hextets.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) return null;
  const value = (Number.parseInt(hextets[0] ?? "", 16) << 16) | Number.parseInt(hextets[1] ?? "", 16);
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function parseIpv4(host: string): [number, number, number, number] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return Number.NaN;
    return Number(part);
  });
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }
  return octets as [number, number, number, number];
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value !== undefined && value > 0 ? value : fallback;
}

function isPlainRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
