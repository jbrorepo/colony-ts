import { createHash } from "crypto";
import { isAbsolute } from "path";

import {
  InProcessMcpClient,
} from "./client";
import {
  StdioMcpTransport,
  type StdioMcpTransportDiagnostics,
  type StdioMcpTransportOptions,
} from "./stdio-transport";
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

export interface StdioMcpServerDefinition {
  id: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  allowedTools?: string[];
  allowedMethods?: string[];
  allowedResourceUris?: string[];
  allowedResourceUriPrefixes?: string[];
  origin?: string;
  pluginId?: string;
  clientId?: string;
  maxLineBytes?: number;
  maxStderrBytes?: number;
}

export interface StdioMcpServerTrustApproval {
  approved: boolean;
  signature: string;
  approvedBy?: string;
  reason?: string;
}

export interface StdioMcpServerApprovalRequest {
  serverId: string;
  signature: string;
  riskLevel: "high";
  summary: string;
  details: string;
  warnings: string[];
}

export interface StdioMcpServerOperatorInspection {
  valid: true;
  serverId: string;
  signature: string;
  riskLevel: "high";
  command: {
    label: string;
    absolute: true;
  };
  args: {
    count: number;
    preview: string[];
  };
  cwd: {
    present: boolean;
    redacted: string;
  };
  env: {
    count: number;
    keys: string[];
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

export type StdioMcpStartupTrustEventStage =
  | "approval_requested"
  | "startup_allowed"
  | "startup_denied"
  | "config_rejected";

export type StdioMcpStartupTrustEventOutcome = "pending" | "allowed" | "denied" | "rejected";

export interface StdioMcpStartupTrustEvent {
  eventType: "mcp_stdio_trust";
  timestamp: string;
  stage: StdioMcpStartupTrustEventStage;
  outcome: StdioMcpStartupTrustEventOutcome;
  resource: string;
  signature: string;
  config: StdioMcpServerOperatorInspection | InvalidStdioMcpServerOperatorInspection;
  approval: {
    present: boolean;
    approved: boolean | null;
    signatureMatches: boolean | null;
    approvedBy?: string;
    reason?: string;
  };
}

interface InvalidStdioMcpServerOperatorInspection {
  valid: false;
  serverId: "<invalid>";
  signature: "";
  riskLevel: "high";
  command: {
    label: "<invalid>";
    absolute: false;
  };
  args: {
    count: 0;
    preview: [];
  };
  cwd: {
    present: false;
    redacted: "<invalid>";
  };
  env: {
    count: 0;
    keys: [];
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

export interface TrustedStdioMcpClientOptions {
  timeoutMs?: number;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  maxJsonDepth?: number;
  maxConcurrent?: number;
}

export interface TrustedStdioMcpClientSession {
  server: NormalizedStdioMcpServerDefinition;
  approval: StdioMcpServerTrustApproval;
  context: McpTransportContext;
  transport: McpTransport;
  client: InProcessMcpClient;
  diagnostics(): StdioMcpTransportDiagnostics;
  close(): Promise<void>;
}

export interface NormalizedStdioMcpServerDefinition {
  id: string;
  command: string;
  args: string[];
  cwd?: string;
  env: Record<string, string>;
  allowedTools: string[];
  allowedMethods: string[];
  allowedResourceUris: string[];
  allowedResourceUriPrefixes: string[];
  origin: string;
  pluginId: string;
  clientId: string;
  maxLineBytes?: number;
  maxStderrBytes?: number;
}

const DEFAULT_ALLOWED_METHODS = ["initialize", "tools/list"] as const;
const TOOL_CALL_METHOD = "tools/call";
const RESOURCE_LIST_METHOD = "resources/list";
const RESOURCE_READ_METHOD = "resources/read";
const MCP_METHODS = new Set<string>(["initialize", "tools/list", TOOL_CALL_METHOD, RESOURCE_LIST_METHOD, RESOURCE_READ_METHOD]);
const BLOCKED_SHELL_COMMANDS = new Set([
  "bash",
  "bash.exe",
  "cmd",
  "cmd.exe",
  "cscript",
  "cscript.exe",
  "dash",
  "dash.exe",
  "fish",
  "fish.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
  "sh",
  "sh.exe",
  "wscript",
  "wscript.exe",
  "zsh",
  "zsh.exe",
]);
const BLOCKED_PACKAGE_RUNNERS = new Set([
  "bunx",
  "bunx.exe",
  "npx",
  "npx.cmd",
  "npx.exe",
  "npm",
  "npm.cmd",
  "npm.exe",
  "pipx",
  "pipx.exe",
  "pnpm",
  "pnpm.cmd",
  "pnpm.exe",
  "uvx",
  "uvx.exe",
  "yarn",
  "yarn.cmd",
  "yarn.exe",
]);
const BLOCKED_SCRIPT_EXTENSIONS = [".bash", ".bat", ".cmd", ".ps1", ".sh"];
const BLOCKED_INLINE_FLAGS = new Set(["-e", "-p", "--eval", "--print", "-c", "/c"]);
const MAX_ARG_BYTES = 64 * 1024;
const MAX_ENV_BYTES = 16 * 1024;
const STDIO_TRUST_WARNINGS = [
  "Stdio MCP servers are local code execution and must be explicitly trusted.",
  "Approval is exact to this command, argument, environment, and allowlist policy.",
];

export function buildStdioMcpServerApprovalRequest(
  definition: StdioMcpServerDefinition,
): StdioMcpServerApprovalRequest {
  const normalized = normalizeStdioMcpServerDefinition(definition);
  return {
    serverId: normalized.id,
    signature: stdioMcpServerTrustSignature(normalized),
    riskLevel: "high",
    summary: `Launch trusted stdio MCP server: ${normalized.id}`,
    details: [
      `server: ${normalized.id}`,
      `command: ${safeCommandLabel(normalized.command)}`,
      `args count: ${normalized.args.length}`,
      `cwd: ${normalized.cwd ? "<redacted>" : "(default)"}`,
      `env keys: ${safeAuditLabels(Object.keys(normalized.env).sort()).join(", ") || "(none)"}`,
      `origin: ${safeAuditLabel(normalized.origin)}`,
      `plugin: ${safeAuditLabel(normalized.pluginId)}`,
      `allowed methods: ${safeAuditLabels(normalized.allowedMethods).join(", ")}`,
      `allowed tools: ${safeAuditLabels(normalized.allowedTools).join(", ") || "(list-only)"}`,
      `allowed resource URIs: ${safeAuditLabels(normalized.allowedResourceUris).join(", ") || "(none)"}`,
      `allowed resource URI prefixes: ${safeAuditLabels(normalized.allowedResourceUriPrefixes).join(", ") || "(none)"}`,
    ].join("\n"),
    warnings: [...STDIO_TRUST_WARNINGS],
  };
}

export function stdioMcpServerTrustSignature(definition: StdioMcpServerDefinition): string {
  const normalized = normalizeStdioMcpServerDefinition(definition);
  const digest = createHash("sha256")
    .update(JSON.stringify(sortJsonValue(normalized)))
    .digest("hex");
  return `mcp-stdio:${digest.slice(0, 24)}`;
}

export function createApprovedStdioMcpServerTrust(
  definition: StdioMcpServerDefinition,
  opts: { approvedBy?: string; reason?: string } = {},
): StdioMcpServerTrustApproval {
  return {
    approved: true,
    signature: stdioMcpServerTrustSignature(definition),
    approvedBy: opts.approvedBy,
    reason: opts.reason,
  };
}

export function buildStdioMcpServerOperatorInspection(
  definition: StdioMcpServerDefinition,
): StdioMcpServerOperatorInspection {
  const server = normalizeStdioMcpServerDefinition(definition);
  return operatorInspectionFromNormalized(server);
}

export function projectStdioMcpStartupTrustEvent(
  definition: StdioMcpServerDefinition,
  approval: StdioMcpServerTrustApproval | undefined,
  opts: { stage?: StdioMcpStartupTrustEventStage; timestamp?: string | Date } = {},
): StdioMcpStartupTrustEvent {
  const timestamp = toIso(opts.timestamp ?? new Date());
  const stage = opts.stage ?? "approval_requested";
  let config: StdioMcpServerOperatorInspection | InvalidStdioMcpServerOperatorInspection;
  let signature = "";
  try {
    const server = normalizeStdioMcpServerDefinition(definition);
    signature = stdioMcpServerTrustSignature(server);
    config = operatorInspectionFromNormalized(server);
  } catch {
    config = invalidOperatorInspection();
  }

  const signatureMatches = approval === undefined || !config.valid
    ? null
    : approval.signature === signature;
  const outcome = startupTrustOutcome(stage, config.valid, approval, signatureMatches);

  return {
    eventType: "mcp_stdio_trust",
    timestamp,
    stage,
    outcome,
    resource: config.valid ? `mcp:stdio:${safeAuditLabel(config.serverId)}` : "mcp:stdio:<invalid>",
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

export function createTrustedStdioMcpClient(
  definition: StdioMcpServerDefinition,
  approval: StdioMcpServerTrustApproval,
  options: TrustedStdioMcpClientOptions = {},
): TrustedStdioMcpClientSession {
  const server = normalizeStdioMcpServerDefinition(definition);
  const expectedSignature = stdioMcpServerTrustSignature(server);
  if (approval.approved !== true || approval.signature !== expectedSignature) {
    throw new Error("MCP stdio server is not trusted");
  }

  const context: McpTransportContext = {
    transportKind: "stdio",
    origin: server.origin,
    pluginId: server.pluginId,
    clientId: server.clientId,
  };
  const stdioTransport = new StdioMcpTransport(toTransportOptions(server, context));
  const guarded = new GuardedMcpTransport(stdioTransport, toGuardOptions(server, options));
  const transport = new ContextualMcpTransport(guarded, context);
  const client = new InProcessMcpClient(transport);
  return {
    server,
    approval: { ...approval },
    context,
    transport,
    client,
    diagnostics: () => stdioTransport.diagnostics(),
    close: () => stdioTransport.close(),
  };
}

function operatorInspectionFromNormalized(server: NormalizedStdioMcpServerDefinition): StdioMcpServerOperatorInspection {
  return {
    valid: true,
    serverId: server.id,
    signature: stdioMcpServerTrustSignature(server),
    riskLevel: "high",
    command: {
      label: safeCommandLabel(server.command),
      absolute: true,
    },
    args: {
      count: server.args.length,
      preview: server.args.map(() => "<redacted>"),
    },
    cwd: {
      present: Boolean(server.cwd),
      redacted: server.cwd ? "<redacted>" : "(default)",
    },
    env: {
      count: Object.keys(server.env).length,
      keys: Object.keys(server.env).sort(),
    },
    origin: safeAuditLabel(server.origin),
    pluginId: safeAuditLabel(server.pluginId),
    clientId: safeAuditLabel(server.clientId),
    allowedMethods: safeAuditLabels(server.allowedMethods),
    allowedTools: safeAuditLabels(server.allowedTools),
    allowedResourceUris: safeAuditLabels(server.allowedResourceUris),
    allowedResourceUriPrefixes: safeAuditLabels(server.allowedResourceUriPrefixes),
    warnings: [...STDIO_TRUST_WARNINGS],
  };
}

function invalidOperatorInspection(): InvalidStdioMcpServerOperatorInspection {
  return {
    valid: false,
    serverId: "<invalid>",
    signature: "",
    riskLevel: "high",
    command: {
      label: "<invalid>",
      absolute: false,
    },
    args: {
      count: 0,
      preview: [],
    },
    cwd: {
      present: false,
      redacted: "<invalid>",
    },
    env: {
      count: 0,
      keys: [],
    },
    origin: "<invalid>",
    pluginId: "<invalid>",
    clientId: "<invalid>",
    allowedMethods: [],
    allowedTools: [],
    allowedResourceUris: [],
    allowedResourceUriPrefixes: [],
    warnings: [...STDIO_TRUST_WARNINGS, "Config rejected before stdio MCP startup."],
  };
}

function startupTrustOutcome(
  stage: StdioMcpStartupTrustEventStage,
  valid: boolean,
  approval: StdioMcpServerTrustApproval | undefined,
  signatureMatches: boolean | null,
): StdioMcpStartupTrustEventOutcome {
  if (!valid || stage === "config_rejected") return "rejected";
  if (stage === "approval_requested") return "pending";
  return approval?.approved === true && signatureMatches === true ? "allowed" : "denied";
}

export function normalizeStdioMcpServerDefinition(
  definition: StdioMcpServerDefinition,
): NormalizedStdioMcpServerDefinition {
  try {
    const id = validateServerId(definition.id);
    const command = validateCommand(definition.command);
    const args = validateStringArray(definition.args ?? [], "arg", true);
    validateArgs(args);
    const cwd = validateCwd(definition.cwd);
    const env = validateEnv(definition.env ?? {});
    const allowedTools = uniqueSorted(validateStringArray(definition.allowedTools ?? [], "allowed tool", false));
    const allowedResourceUris = uniqueSorted(validateStringArray(definition.allowedResourceUris ?? [], "allowed resource URI", false));
    const allowedResourceUriPrefixes = uniqueSorted(validateStringArray(definition.allowedResourceUriPrefixes ?? [], "allowed resource URI prefix", false));
    const allowedMethods = normalizeAllowedMethods(
      definition.allowedMethods,
      allowedTools,
      allowedResourceUris,
      allowedResourceUriPrefixes,
    );
    const origin = validateOptionalString(definition.origin, "origin", false) ?? `stdio://mcp/${id}`;
    const pluginId = validateOptionalString(definition.pluginId, "plugin id", false) ?? id;
    const clientId = validateOptionalString(definition.clientId, "client id", false) ?? "colony";
    return {
      id,
      command,
      args,
      ...(cwd === undefined ? {} : { cwd }),
      env,
      allowedTools,
      allowedMethods,
      allowedResourceUris,
      allowedResourceUriPrefixes,
      origin,
      pluginId,
      clientId,
      ...(positiveInteger(definition.maxLineBytes) === undefined ? {} : { maxLineBytes: definition.maxLineBytes }),
      ...(positiveInteger(definition.maxStderrBytes) === undefined ? {} : { maxStderrBytes: definition.maxStderrBytes }),
    };
  } catch {
    throw new Error("MCP stdio server config rejected");
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

function toTransportOptions(
  server: NormalizedStdioMcpServerDefinition,
  context: McpTransportContext,
): StdioMcpTransportOptions {
  return {
    command: server.command,
    args: server.args,
    cwd: server.cwd,
    env: server.env,
    transportContext: {
      origin: context.origin,
      pluginId: context.pluginId,
      clientId: context.clientId,
    },
    maxLineBytes: server.maxLineBytes,
    maxStderrBytes: server.maxStderrBytes,
  };
}

function toGuardOptions(
  server: NormalizedStdioMcpServerDefinition,
  options: TrustedStdioMcpClientOptions,
): GuardedMcpTransportOptions {
  return {
    allowedMethods: server.allowedMethods,
    allowedTools: server.allowedTools,
    allowedResourceUris: server.allowedResourceUris,
    allowedResourceUriPrefixes: server.allowedResourceUriPrefixes,
    allowedOrigins: [server.origin],
    allowedPluginIds: [server.pluginId],
    timeoutMs: options.timeoutMs,
    maxRequestBytes: options.maxRequestBytes,
    maxResponseBytes: options.maxResponseBytes,
    maxJsonDepth: options.maxJsonDepth,
    maxConcurrent: options.maxConcurrent,
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
  const normalized = uniqueSorted(validateStringArray(requested, "allowed method", false));
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

function validateServerId(id: string): string {
  if (typeof id !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(id)) {
    throw new Error("invalid server id");
  }
  return id;
}

function validateCommand(command: string): string {
  const value = validateString(command, "command", false);
  if (value.trim().length === 0) throw new Error("empty command");
  const basename = value.split(/[\\/]/).pop()?.toLowerCase() ?? value.toLowerCase();
  if (!isAbsolute(value)) throw new Error("command must be absolute");
  if (BLOCKED_SHELL_COMMANDS.has(basename)) throw new Error("shell command blocked");
  if (BLOCKED_PACKAGE_RUNNERS.has(basename)) throw new Error("package runner blocked");
  if (BLOCKED_SCRIPT_EXTENSIONS.some((extension) => basename.endsWith(extension))) {
    throw new Error("script wrapper blocked");
  }
  return value;
}

function validateEnv(env: Record<string, string>): Record<string, string> {
  if (!isPlainRecord(env)) throw new Error("invalid env");
  const out: Record<string, string> = {};
  const lowerKeys = new Set<string>();
  for (const key of Object.keys(env).sort()) {
    const cleanKey = validateString(key, "env key", false);
    const lowerKey = cleanKey.toLowerCase();
    if (lowerKeys.has(lowerKey)) throw new Error("duplicate env key");
    lowerKeys.add(lowerKey);
    if (/(secret|token|key|password|credential|bearer|auth)/i.test(cleanKey)) {
      throw new Error("secret env key rejected");
    }
    const cleanValue = validateString(env[key], "env value", false);
    if (looksSecret(cleanValue)) throw new Error("secret env value rejected");
    out[cleanKey] = cleanValue;
  }
  if (new TextEncoder().encode(JSON.stringify(out)).length > MAX_ENV_BYTES) {
    throw new Error("env too large");
  }
  return out;
}

function validateArgs(args: string[]): void {
  if (new TextEncoder().encode(JSON.stringify(args)).length > MAX_ARG_BYTES) {
    throw new Error("args too large");
  }
  for (const arg of args) {
    const normalizedArg = arg.trim().toLowerCase();
    if (isBlockedInlineArgument(normalizedArg)) {
      throw new Error("inline eval argument blocked");
    }
    if (looksSecret(arg)) throw new Error("secret arg rejected");
  }
}

function isBlockedInlineArgument(arg: string): boolean {
  for (const flag of BLOCKED_INLINE_FLAGS) {
    if (arg === flag || arg.startsWith(`${flag}=`)) {
      return true;
    }
  }
  return false;
}

function validateCwd(cwd: string | undefined): string {
  const value = validateOptionalString(cwd ?? process.cwd(), "cwd", false);
  if (!value || !isAbsolute(value)) throw new Error("cwd must be absolute");
  return value;
}

function validateStringArray(values: string[], label: string, allowNewlines: boolean): string[] {
  if (!Array.isArray(values)) throw new Error(`invalid ${label} list`);
  return values.map((value) => validateString(value, label, allowNewlines));
}

function validateOptionalString(value: string | undefined, label: string, allowNewlines: boolean): string | undefined {
  if (value === undefined) return undefined;
  return validateString(value, label, allowNewlines);
}

function validateString(value: string, label: string, allowNewlines: boolean): string {
  const forbidden = allowNewlines ? /[\0]/ : /[\0\r\n]/;
  if (typeof value !== "string" || forbidden.test(value)) {
    throw new Error(`invalid ${label}`);
  }
  return value;
}

function looksSecret(value: string): boolean {
  return /(secret|token|password|credential|bearer|api[_-]?key)/i.test(value)
    || /[A-Za-z0-9._-]{32,}/.test(value);
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function safeCommandLabel(command: string): string {
  return safeAuditLabel(command.split(/[\\/]/).pop() || command);
}

function safeAuditLabel(value: string): string {
  const clean = value.replace(/[\0\r\n]/g, "");
  return looksSecret(clean) ? "<redacted>" : clean.slice(0, 80);
}

function safeAuditLabels(values: string[]): string[] {
  return values.map(safeAuditLabel);
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
