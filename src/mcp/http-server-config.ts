import { createHash } from "crypto";

import { InProcessMcpClient } from "./client";
import {
  HttpMcpTransport,
  type HttpMcpTransportDiagnostics,
} from "./http-transport";
import {
  GuardedMcpTransport,
  type GuardedMcpTransportOptions,
  type McpTransport,
  type McpTransportContext,
} from "./transport";
import type {
  McpJsonRpcRequest,
  McpJsonRpcResponse,
} from "./protocol";

type HttpFetch = (input: string, init?: RequestInit) => Promise<Response>;
type HttpResolveHostname = (hostname: string) => Promise<ReadonlyArray<{ address: string; family: 4 | 6 }>>;

export interface HttpMcpServerDefinition {
  id: string;
  endpoint: string;
  headers?: Record<string, string>;
  bearerToken?: string;
  allowedTools?: string[];
  allowedMethods?: string[];
  allowedResourceUris?: string[];
  allowedResourceUriPrefixes?: string[];
  origin?: string;
  pluginId?: string;
  clientId?: string;
  timeoutMs?: number;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  maxJsonDepth?: number;
  maxConcurrent?: number;
}

export interface NormalizedHttpMcpServerDefinition {
  id: string;
  endpoint: string;
  headerNames: string[];
  headerValueHashes: Record<string, string>;
  bearerTokenPresent: boolean;
  bearerTokenHash?: string;
  allowedTools: string[];
  allowedMethods: string[];
  allowedResourceUris: string[];
  allowedResourceUriPrefixes: string[];
  origin: string;
  pluginId: string;
  clientId: string;
  timeoutMs?: number;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  maxJsonDepth?: number;
  maxConcurrent?: number;
}

interface RuntimeHttpMcpServerDefinition extends NormalizedHttpMcpServerDefinition {
  headers: Record<string, string>;
  bearerToken?: string;
}

export interface HttpMcpServerTrustApproval {
  approved: boolean;
  signature: string;
  approvedBy?: string;
  reason?: string;
}

export interface HttpMcpServerApprovalRequest {
  serverId: string;
  signature: string;
  riskLevel: "medium";
  summary: string;
  details: string;
  warnings: string[];
}

export interface HttpMcpServerOperatorInspection {
  valid: true;
  serverId: string;
  signature: string;
  riskLevel: "medium";
  endpoint: string;
  protocol: "https:";
  host: string;
  headers: {
    count: number;
    names: string[];
  };
  auth: {
    bearerTokenPresent: boolean;
  };
  origin: string;
  pluginId: string;
  clientId: string;
  allowedMethods: string[];
  allowedTools: string[];
  allowedResourceUris: string[];
  allowedResourceUriPrefixes: string[];
  warnings: string[];
}

export type HttpMcpConnectionTrustEventStage =
  | "approval_requested"
  | "connection_allowed"
  | "connection_denied"
  | "config_rejected";

export type HttpMcpConnectionTrustEventOutcome = "pending" | "allowed" | "denied" | "rejected";

export interface HttpMcpConnectionTrustEvent {
  eventType: "mcp_http_trust";
  timestamp: string;
  stage: HttpMcpConnectionTrustEventStage;
  outcome: HttpMcpConnectionTrustEventOutcome;
  resource: string;
  signature: string;
  config: HttpMcpServerOperatorInspection | InvalidHttpMcpServerOperatorInspection;
  approval: {
    present: boolean;
    approved: boolean | null;
    signatureMatches: boolean | null;
    approvedBy?: string;
    reason?: string;
  };
}

interface InvalidHttpMcpServerOperatorInspection {
  valid: false;
  serverId: "<invalid>";
  signature: "";
  riskLevel: "medium";
  endpoint: "<invalid>";
  protocol: "https:";
  host: "<invalid>";
  headers: {
    count: 0;
    names: [];
  };
  auth: {
    bearerTokenPresent: false;
  };
  origin: "<invalid>";
  pluginId: "<invalid>";
  clientId: "<invalid>";
  allowedMethods: [];
  allowedTools: [];
  allowedResourceUris: [];
  allowedResourceUriPrefixes: [];
  warnings: string[];
}

export interface TrustedHttpMcpClientOptions {
  fetchImpl?: HttpFetch;
  resolveHostname?: HttpResolveHostname;
  timeoutMs?: number;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  maxJsonDepth?: number;
  maxConcurrent?: number;
}

export interface TrustedHttpMcpClientSession {
  server: NormalizedHttpMcpServerDefinition;
  approval: HttpMcpServerTrustApproval;
  context: McpTransportContext;
  transport: McpTransport;
  client: InProcessMcpClient;
  diagnostics(): HttpMcpTransportDiagnostics;
  close(): Promise<void>;
}

const DEFAULT_ALLOWED_METHODS = ["initialize", "tools/list"] as const;
const TOOL_CALL_METHOD = "tools/call";
const RESOURCE_LIST_METHOD = "resources/list";
const RESOURCE_READ_METHOD = "resources/read";
const MCP_METHODS = new Set<string>(["initialize", "tools/list", TOOL_CALL_METHOD, RESOURCE_LIST_METHOD, RESOURCE_READ_METHOD]);
const HTTP_TRUST_WARNINGS = [
  "Trusted HTTP MCP servers can expose remote tools and data to the active session.",
  "Approval is exact to this endpoint, header names, authentication presence, and allowlist policy.",
  "remote MCP failures are sanitized before operator display.",
];
const FORBIDDEN_HEADER_NAMES = new Set([
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

export function buildHttpMcpServerApprovalRequest(
  definition: HttpMcpServerDefinition,
): HttpMcpServerApprovalRequest {
  const server = normalizeHttpMcpServerRuntimeDefinition(definition);
  return {
    serverId: server.id,
    signature: httpMcpServerTrustSignature(server),
    riskLevel: "medium",
    summary: `Connect trusted HTTP MCP server: ${server.id}`,
    details: [
      `server: ${server.id}`,
      `endpoint: ${redactedEndpoint(server.endpoint)}`,
      `auth: ${server.bearerTokenPresent ? "bearer token present" : "none"}`,
      `headers: ${safeAuditLabels(server.headerNames).join(", ") || "(none)"}`,
      `origin: ${safeAuditLabel(server.origin)}`,
      `plugin: ${safeAuditLabel(server.pluginId)}`,
      `allowed methods: ${safeAuditLabels(server.allowedMethods).join(", ")}`,
      `allowed tools: ${safeAuditLabels(server.allowedTools).join(", ") || "(list-only)"}`,
      `allowed resource URIs: ${safeAuditLabels(server.allowedResourceUris).join(", ") || "(none)"}`,
      `allowed resource URI prefixes: ${safeAuditLabels(server.allowedResourceUriPrefixes).join(", ") || "(none)"}`,
    ].join("\n"),
    warnings: [...HTTP_TRUST_WARNINGS],
  };
}

export function httpMcpServerTrustSignature(definition: HttpMcpServerDefinition): string {
  const server = normalizeHttpMcpServerRuntimeDefinition(definition);
  const signatureInput = {
    id: server.id,
    endpoint: server.endpoint,
    headerNames: server.headerNames,
    headerValueHashes: server.headerValueHashes,
    bearerTokenPresent: server.bearerTokenPresent,
    bearerTokenHash: server.bearerTokenHash ?? null,
    allowedTools: server.allowedTools,
    allowedMethods: server.allowedMethods,
    allowedResourceUris: server.allowedResourceUris,
    allowedResourceUriPrefixes: server.allowedResourceUriPrefixes,
    origin: server.origin,
    pluginId: server.pluginId,
    clientId: server.clientId,
    timeoutMs: server.timeoutMs ?? null,
    maxRequestBytes: server.maxRequestBytes ?? null,
    maxResponseBytes: server.maxResponseBytes ?? null,
    maxJsonDepth: server.maxJsonDepth ?? null,
    maxConcurrent: server.maxConcurrent ?? null,
  };
  const digest = createHash("sha256")
    .update(JSON.stringify(sortJsonValue(signatureInput)))
    .digest("hex");
  return `mcp-http:${digest.slice(0, 24)}`;
}

export function createApprovedHttpMcpServerTrust(
  definition: HttpMcpServerDefinition,
  opts: { approvedBy?: string; reason?: string } = {},
): HttpMcpServerTrustApproval {
  return {
    approved: true,
    signature: httpMcpServerTrustSignature(definition),
    approvedBy: opts.approvedBy,
    reason: opts.reason,
  };
}

export function buildHttpMcpServerOperatorInspection(
  definition: HttpMcpServerDefinition,
): HttpMcpServerOperatorInspection {
  return operatorInspectionFromNormalized(normalizeHttpMcpServerRuntimeDefinition(definition));
}

export function projectHttpMcpConnectionTrustEvent(
  definition: HttpMcpServerDefinition,
  approval: HttpMcpServerTrustApproval | undefined,
  opts: { stage?: HttpMcpConnectionTrustEventStage; timestamp?: string | Date } = {},
): HttpMcpConnectionTrustEvent {
  const timestamp = toIso(opts.timestamp ?? new Date());
  const stage = opts.stage ?? "approval_requested";
  let config: HttpMcpServerOperatorInspection | InvalidHttpMcpServerOperatorInspection;
  let signature = "";
  try {
    const server = normalizeHttpMcpServerRuntimeDefinition(definition);
    signature = httpMcpServerTrustSignature(server);
    config = operatorInspectionFromNormalized(server);
  } catch {
    config = invalidOperatorInspection();
  }

  const signatureMatches = approval === undefined || !config.valid
    ? null
    : approval.signature === signature;
  const outcome = connectionTrustOutcome(stage, config.valid, approval, signatureMatches);
  return {
    eventType: "mcp_http_trust",
    timestamp,
    stage,
    outcome,
    resource: config.valid ? `mcp:http:${safeAuditLabel(config.serverId)}` : "mcp:http:<invalid>",
    signature,
    config,
    approval: {
      present: approval !== undefined,
      approved: approval?.approved ?? null,
      signatureMatches,
      ...(approval?.approvedBy === undefined ? {} : { approvedBy: safeAuditLabel(approval.approvedBy) }),
      ...(approval?.reason === undefined ? {} : { reason: "<redacted>" }),
    },
  };
}

export function createTrustedHttpMcpClient(
  definition: HttpMcpServerDefinition,
  approval: HttpMcpServerTrustApproval,
  options: TrustedHttpMcpClientOptions = {},
): TrustedHttpMcpClientSession {
  const server = normalizeHttpMcpServerRuntimeDefinition(definition);
  const expectedSignature = httpMcpServerTrustSignature(server);
  if (approval.approved !== true || approval.signature !== expectedSignature) {
    throw new Error("MCP HTTP server is not trusted");
  }

  const context: McpTransportContext = {
    transportKind: "http",
    origin: server.origin,
    pluginId: server.pluginId,
    clientId: server.clientId,
  };
  const httpTransport = new HttpMcpTransport({
    endpoint: server.endpoint,
    headers: server.headers,
    bearerToken: server.bearerToken,
    fetchImpl: options.fetchImpl,
    resolveHostname: options.resolveHostname,
    timeoutMs: options.timeoutMs ?? server.timeoutMs,
    maxRequestBytes: options.maxRequestBytes ?? server.maxRequestBytes,
    maxResponseBytes: options.maxResponseBytes ?? server.maxResponseBytes,
  });
  const guarded = new GuardedMcpTransport(httpTransport, toGuardOptions(server, options));
  const transport = new ContextualMcpTransport(guarded, context);
  const client = new InProcessMcpClient(transport);
  return {
    server: publicHttpMcpServerDefinition(server),
    approval: { ...approval },
    context,
    transport,
    client,
    diagnostics: () => httpTransport.diagnostics(),
    close: async () => {},
  };
}

export function normalizeHttpMcpServerDefinition(
  definition: HttpMcpServerDefinition,
): NormalizedHttpMcpServerDefinition {
  return publicHttpMcpServerDefinition(normalizeHttpMcpServerRuntimeDefinition(definition));
}

function normalizeHttpMcpServerRuntimeDefinition(
  definition: HttpMcpServerDefinition,
): RuntimeHttpMcpServerDefinition {
  try {
    const id = validateServerId(definition.id);
    const endpoint = validateEndpoint(definition.endpoint);
    const headers = validateHeaders(definition.headers ?? {});
    const headerNames = Object.keys(headers).sort();
    const headerValueHashes = hashRecordValues(headers);
    const bearerToken = validateBearerToken(definition.bearerToken);
    const allowedTools = uniqueSorted(validateStringArray(definition.allowedTools ?? [], "allowed tool"));
    const allowedResourceUris = uniqueSorted(validateStringArray(definition.allowedResourceUris ?? [], "allowed resource URI"));
    const allowedResourceUriPrefixes = uniqueSorted(validateStringArray(definition.allowedResourceUriPrefixes ?? [], "allowed resource URI prefix"));
    const allowedMethods = normalizeAllowedMethods(
      definition.allowedMethods,
      allowedTools,
      allowedResourceUris,
      allowedResourceUriPrefixes,
    );
    const endpointUrl = new URL(endpoint);
    const origin = validateOptionalString(definition.origin, "origin") ?? endpointUrl.origin;
    const pluginId = validateOptionalString(definition.pluginId, "plugin id") ?? id;
    const clientId = validateOptionalString(definition.clientId, "client id") ?? "colony";
    return {
      id,
      endpoint,
      headerNames,
      headerValueHashes,
      headers,
      ...(bearerToken === undefined ? {} : { bearerToken }),
      bearerTokenPresent: bearerToken !== undefined,
      ...(bearerToken === undefined ? {} : { bearerTokenHash: hashSecret(bearerToken) }),
      allowedTools,
      allowedMethods,
      allowedResourceUris,
      allowedResourceUriPrefixes,
      origin,
      pluginId,
      clientId,
      ...(positiveInteger(definition.timeoutMs) === undefined ? {} : { timeoutMs: definition.timeoutMs }),
      ...(positiveInteger(definition.maxRequestBytes) === undefined ? {} : { maxRequestBytes: definition.maxRequestBytes }),
      ...(positiveInteger(definition.maxResponseBytes) === undefined ? {} : { maxResponseBytes: definition.maxResponseBytes }),
      ...(positiveInteger(definition.maxJsonDepth) === undefined ? {} : { maxJsonDepth: definition.maxJsonDepth }),
      ...(positiveInteger(definition.maxConcurrent) === undefined ? {} : { maxConcurrent: definition.maxConcurrent }),
    };
  } catch {
    throw new Error("MCP HTTP server config rejected");
  }
}

class ContextualMcpTransport implements McpTransport {
  constructor(
    private readonly inner: McpTransport,
    private readonly context: McpTransportContext,
  ) {}

  async send(request: McpJsonRpcRequest): Promise<McpJsonRpcResponse> {
    return await this.inner.send(request, this.context);
  }
}

function operatorInspectionFromNormalized(server: NormalizedHttpMcpServerDefinition): HttpMcpServerOperatorInspection {
  const endpoint = new URL(server.endpoint);
  return {
    valid: true,
    serverId: server.id,
    signature: httpMcpServerTrustSignature(server),
    riskLevel: "medium",
    endpoint: redactedEndpoint(server.endpoint),
    protocol: "https:",
    host: safeAuditLabel(endpoint.hostname),
    headers: {
      count: server.headerNames.length,
      names: safeAuditLabels(server.headerNames),
    },
    auth: {
      bearerTokenPresent: server.bearerTokenPresent,
    },
    origin: safeAuditLabel(server.origin),
    pluginId: safeAuditLabel(server.pluginId),
    clientId: safeAuditLabel(server.clientId),
    allowedMethods: safeAuditLabels(server.allowedMethods),
    allowedTools: safeAuditLabels(server.allowedTools),
    allowedResourceUris: safeAuditLabels(server.allowedResourceUris),
    allowedResourceUriPrefixes: safeAuditLabels(server.allowedResourceUriPrefixes),
    warnings: [...HTTP_TRUST_WARNINGS],
  };
}

function invalidOperatorInspection(): InvalidHttpMcpServerOperatorInspection {
  return {
    valid: false,
    serverId: "<invalid>",
    signature: "",
    riskLevel: "medium",
    endpoint: "<invalid>",
    protocol: "https:",
    host: "<invalid>",
    headers: {
      count: 0,
      names: [],
    },
    auth: {
      bearerTokenPresent: false,
    },
    origin: "<invalid>",
    pluginId: "<invalid>",
    clientId: "<invalid>",
    allowedMethods: [],
    allowedTools: [],
    allowedResourceUris: [],
    allowedResourceUriPrefixes: [],
    warnings: [...HTTP_TRUST_WARNINGS, "Config rejected before HTTP MCP connection."],
  };
}

function toGuardOptions(
  server: RuntimeHttpMcpServerDefinition,
  options: TrustedHttpMcpClientOptions,
): GuardedMcpTransportOptions {
  return {
    allowedMethods: server.allowedMethods,
    allowedTools: server.allowedTools,
    allowedResourceUris: server.allowedResourceUris,
    allowedResourceUriPrefixes: server.allowedResourceUriPrefixes,
    allowedOrigins: [server.origin],
    allowedPluginIds: [server.pluginId],
    timeoutMs: options.timeoutMs ?? server.timeoutMs,
    maxRequestBytes: options.maxRequestBytes ?? server.maxRequestBytes,
    maxResponseBytes: options.maxResponseBytes ?? server.maxResponseBytes,
    maxJsonDepth: options.maxJsonDepth ?? server.maxJsonDepth,
    maxConcurrent: options.maxConcurrent ?? server.maxConcurrent,
  };
}

function normalizeAllowedMethods(
  methods: string[] | undefined,
  allowedTools: string[],
  allowedResourceUris: string[],
  allowedResourceUriPrefixes: string[],
): string[] {
  const requested = methods === undefined
    ? [
        ...DEFAULT_ALLOWED_METHODS,
        ...(allowedTools.length > 0 ? [TOOL_CALL_METHOD] : []),
        ...(allowedResourceUris.length > 0 || allowedResourceUriPrefixes.length > 0
          ? [RESOURCE_LIST_METHOD, RESOURCE_READ_METHOD]
          : []),
      ]
    : methods;
  const normalized = uniqueSorted(validateStringArray(requested, "allowed method"));
  for (const method of normalized) {
    if (!MCP_METHODS.has(method)) throw new Error("unsupported method");
  }
  if (normalized.includes(TOOL_CALL_METHOD) && allowedTools.length === 0) {
    throw new Error("tools/call requires allowed tools");
  }
  if (normalized.includes(RESOURCE_READ_METHOD)
    && allowedResourceUris.length === 0
    && allowedResourceUriPrefixes.length === 0) {
    throw new Error("resources/read requires allowed resources");
  }
  return normalized;
}

function validateEndpoint(endpoint: string): string {
  const raw = validateString(endpoint, "endpoint");
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("endpoint must be https");
  if (url.username || url.password || url.search || url.hash) throw new Error("endpoint must be redaction-safe");
  if (isUnsafeLiteralHost(url.hostname)) throw new Error("unsafe endpoint host");
  return url.toString();
}

function validateHeaders(headers: Record<string, string>): Record<string, string> {
  if (!isPlainRecord(headers)) throw new Error("invalid headers");
  const out: Record<string, string> = {};
  const lowerNames = new Set<string>();
  for (const [key, value] of Object.entries(headers)) {
    const name = validateHeaderName(key);
    if (lowerNames.has(name)) throw new Error("duplicate header");
    lowerNames.add(name);
    if (FORBIDDEN_HEADER_NAMES.has(name)) throw new Error("forbidden header");
    out[name] = validateHeaderValue(value);
  }
  return out;
}

function validateHeaderName(value: string): string {
  if (typeof value !== "string" || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value)) {
    throw new Error("invalid header name");
  }
  return value.toLowerCase();
}

function validateHeaderValue(value: string): string {
  const clean = validateString(value, "header value");
  if (looksSecret(clean)) throw new Error("secret header value rejected");
  return clean;
}

function validateBearerToken(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const clean = validateString(value, "bearer token");
  if (clean.length === 0) throw new Error("empty bearer token");
  return clean;
}

function validateServerId(id: string): string {
  if (typeof id !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(id)) {
    throw new Error("invalid server id");
  }
  return id;
}

function validateStringArray(values: string[], label: string): string[] {
  if (!Array.isArray(values)) throw new Error(`invalid ${label} list`);
  return values.map((value) => validateString(value, label));
}

function validateOptionalString(value: string | undefined, label: string): string | undefined {
  if (value === undefined) return undefined;
  return validateString(value, label);
}

function validateString(value: string, label: string): string {
  if (typeof value !== "string" || /[\0\r\n]/.test(value)) {
    throw new Error(`invalid ${label}`);
  }
  return value;
}

function connectionTrustOutcome(
  stage: HttpMcpConnectionTrustEventStage,
  valid: boolean,
  approval: HttpMcpServerTrustApproval | undefined,
  signatureMatches: boolean | null,
): HttpMcpConnectionTrustEventOutcome {
  if (!valid || stage === "config_rejected") return "rejected";
  if (stage === "approval_requested") return "pending";
  return approval?.approved === true && signatureMatches === true ? "allowed" : "denied";
}

function redactedEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  const pathParts = url.pathname.split("/").map((part) => part.length > 0 ? safeAuditLabel(part) : part);
  url.pathname = pathParts.join("/");
  return url.toString();
}

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function hashRecordValues(values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(values).sort()) {
    out[key] = hashSecret(values[key]);
  }
  return out;
}

function publicHttpMcpServerDefinition(server: RuntimeHttpMcpServerDefinition): NormalizedHttpMcpServerDefinition {
  return {
    id: server.id,
    endpoint: server.endpoint,
    headerNames: [...server.headerNames],
    headerValueHashes: { ...server.headerValueHashes },
    bearerTokenPresent: server.bearerTokenPresent,
    ...(server.bearerTokenHash === undefined ? {} : { bearerTokenHash: server.bearerTokenHash }),
    allowedTools: [...server.allowedTools],
    allowedMethods: [...server.allowedMethods],
    allowedResourceUris: [...server.allowedResourceUris],
    allowedResourceUriPrefixes: [...server.allowedResourceUriPrefixes],
    origin: server.origin,
    pluginId: server.pluginId,
    clientId: server.clientId,
    ...(server.timeoutMs === undefined ? {} : { timeoutMs: server.timeoutMs }),
    ...(server.maxRequestBytes === undefined ? {} : { maxRequestBytes: server.maxRequestBytes }),
    ...(server.maxResponseBytes === undefined ? {} : { maxResponseBytes: server.maxResponseBytes }),
    ...(server.maxJsonDepth === undefined ? {} : { maxJsonDepth: server.maxJsonDepth }),
    ...(server.maxConcurrent === undefined ? {} : { maxConcurrent: server.maxConcurrent }),
  };
}

function looksSecret(value: string): boolean {
  return /(secret|token|password|credential|bearer|api[_-]?key)/i.test(value)
    || /[A-Za-z0-9._-]{32,}/.test(value);
}

function safeAuditLabel(value: string): string {
  const clean = value.replace(/[\0\r\n]/g, "");
  return looksSecret(clean) ? "<redacted>" : clean.slice(0, 80);
}

function safeAuditLabels(values: string[]): string[] {
  return values.map(safeAuditLabel);
}

function isUnsafeLiteralHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  return host === "localhost"
    || host.endsWith(".localhost")
    || host === "::1"
    || host.startsWith("fe80:")
    || host.startsWith("fc")
    || host.startsWith("fd")
    || host.startsWith("127.")
    || host.startsWith("10.")
    || host.startsWith("192.168.")
    || host.startsWith("169.254.");
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function positiveInteger(value: number | undefined): number | undefined {
  return Number.isInteger(value) && value !== undefined && value > 0 ? value : undefined;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (isPlainRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortJsonValue(value[key]);
    }
    return out;
  }
  return value;
}

function isPlainRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
