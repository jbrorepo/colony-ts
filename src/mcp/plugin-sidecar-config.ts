import { createHash } from "crypto";

import { InProcessMcpClient } from "./client";
import {
  GuardedMcpTransport,
  type GuardedMcpTransportOptions,
  type McpTransport,
  type McpTransportContext,
} from "./transport";
import type {
  McpInitializeResult,
  McpJsonRpcRequest,
  McpJsonRpcResponse,
} from "./protocol";

export type PluginMcpSidecarKind = "local-sidecar" | "daemon-bridge" | "app-bridge" | "unknown";

export interface PluginMcpSidecarDefinition {
  id: string;
  packageName: string;
  packageVersion: string;
  packageSource: string;
  packageDigest: string;
  sidecarId: string;
  sidecarKind?: PluginMcpSidecarKind;
  declaredCapabilities?: string[];
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
  expectedProtocolVersion?: string;
  expectedServerName?: string;
  expectedServerVersion?: string;
}

export interface NormalizedPluginMcpSidecarDefinition {
  id: string;
  packageName: string;
  packageVersion: string;
  packageSource: string;
  packageDigest: string;
  sidecarId: string;
  sidecarKind: PluginMcpSidecarKind;
  declaredCapabilities: string[];
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
  expectedProtocolVersion?: string;
  expectedServerName?: string;
  expectedServerVersion?: string;
}

export interface PluginMcpSidecarTrustApproval {
  approved: boolean;
  signature: string;
  approvedBy?: string;
  reason?: string;
}

export interface PluginMcpSidecarApprovalRequest {
  serverId: string;
  signature: string;
  riskLevel: "high";
  summary: string;
  details: string;
  warnings: string[];
}

export interface PluginMcpSidecarOperatorInspection {
  valid: true;
  serverId: string;
  signature: string;
  riskLevel: "high";
  package: {
    name: string;
    version: string;
    source: string;
    digest: string;
  };
  sidecar: {
    id: string;
    kind: PluginMcpSidecarKind;
  };
  capabilities: string[];
  origin: string;
  pluginId: string;
  clientId: string;
  allowedMethods: string[];
  allowedTools: string[];
  allowedResourceUris: string[];
  allowedResourceUriPrefixes: string[];
  warnings: string[];
}

export type PluginMcpSidecarTrustEventStage =
  | "approval_requested"
  | "connection_allowed"
  | "connection_denied"
  | "config_rejected";

export type PluginMcpSidecarTrustEventOutcome = "pending" | "allowed" | "denied" | "rejected";

export interface PluginMcpSidecarTrustEvent {
  eventType: "mcp_plugin_trust";
  timestamp: string;
  stage: PluginMcpSidecarTrustEventStage;
  outcome: PluginMcpSidecarTrustEventOutcome;
  resource: string;
  signature: string;
  config: PluginMcpSidecarOperatorInspection | InvalidPluginMcpSidecarOperatorInspection;
  approval: {
    present: boolean;
    approved: boolean | null;
    signatureMatches: boolean | null;
    approvedBy?: string;
    reason?: string;
  };
}

interface InvalidPluginMcpSidecarOperatorInspection {
  valid: false;
  serverId: "<invalid>";
  signature: "";
  riskLevel: "high";
  package: {
    name: "<invalid>";
    version: "<invalid>";
    source: "<invalid>";
    digest: "<invalid>";
  };
  sidecar: {
    id: "<invalid>";
    kind: "unknown";
  };
  capabilities: [];
  origin: "<invalid>";
  pluginId: "<invalid>";
  clientId: "<invalid>";
  allowedMethods: [];
  allowedTools: [];
  allowedResourceUris: [];
  allowedResourceUriPrefixes: [];
  warnings: string[];
}

export interface TrustedPluginMcpClientOptions {
  sidecarTransport: McpTransport;
  timeoutMs?: number;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  maxJsonDepth?: number;
  maxConcurrent?: number;
}

export interface TrustedPluginMcpClientSession {
  server: NormalizedPluginMcpSidecarDefinition;
  approval: PluginMcpSidecarTrustApproval;
  context: McpTransportContext;
  transport: McpTransport;
  client: InProcessMcpClient;
  close(): Promise<void>;
}

export type PluginMcpSidecarLifecycleState = "connected" | "closed";

export interface PluginMcpSidecarLifecycle {
  state: PluginMcpSidecarLifecycleState;
  connectedAt: string;
  closedAt?: string;
  protocolVersion: string;
  serverInfo: {
    name: string;
    version: string;
  };
  expectations: {
    protocolVersion?: string;
    serverName?: string;
    serverVersion?: string;
  };
}

export interface ManagedTrustedPluginMcpClientSession extends TrustedPluginMcpClientSession {
  lifecycle: PluginMcpSidecarLifecycle;
}

const DEFAULT_ALLOWED_METHODS = ["initialize", "tools/list"] as const;
const TOOL_CALL_METHOD = "tools/call";
const RESOURCE_LIST_METHOD = "resources/list";
const RESOURCE_READ_METHOD = "resources/read";
const MCP_METHODS = new Set<string>(["initialize", "tools/list", TOOL_CALL_METHOD, RESOURCE_LIST_METHOD, RESOURCE_READ_METHOD]);
const SIDECAR_KINDS = new Set<PluginMcpSidecarKind>(["local-sidecar", "daemon-bridge", "app-bridge", "unknown"]);
const PLUGIN_TRUST_WARNINGS = [
  "Plugin sidecars can bridge Colony to package-provided code and external tools.",
  "Approval is exact to this plugin package identity, sidecar identity, capabilities, and allowlist policy.",
  "plugin sidecars must remain separate from stdio and HTTP MCP trust signatures.",
];

export function buildPluginMcpSidecarApprovalRequest(
  definition: PluginMcpSidecarDefinition,
): PluginMcpSidecarApprovalRequest {
  const sidecar = normalizePluginMcpSidecarDefinition(definition);
  return {
    serverId: sidecar.id,
    signature: pluginMcpSidecarTrustSignature(sidecar),
    riskLevel: "high",
    summary: `Connect trusted plugin MCP sidecar: ${sidecar.id}`,
    details: [
      `plugin: ${safeAuditLabel(sidecar.packageName)}`,
      `version: ${safeAuditLabel(sidecar.packageVersion)}`,
      `source: ${safeAuditLabel(sidecar.packageSource)}`,
      `digest: ${safeDigestLabel(sidecar.packageDigest)}`,
      `sidecar: ${safeAuditLabel(sidecar.sidecarId)}`,
      `sidecar kind: ${sidecar.sidecarKind}`,
      `capabilities: ${safeAuditLabels(sidecar.declaredCapabilities).join(", ") || "(none)"}`,
      `origin: ${safeAuditLabel(sidecar.origin)}`,
      `plugin id: ${safeAuditLabel(sidecar.pluginId)}`,
      `allowed methods: ${safeAuditLabels(sidecar.allowedMethods).join(", ")}`,
      `allowed tools: ${safeAuditLabels(sidecar.allowedTools).join(", ") || "(list-only)"}`,
      `allowed resource URIs: ${safeAuditLabels(sidecar.allowedResourceUris).join(", ") || "(none)"}`,
      `allowed resource URI prefixes: ${safeAuditLabels(sidecar.allowedResourceUriPrefixes).join(", ") || "(none)"}`,
    ].join("\n"),
    warnings: [...PLUGIN_TRUST_WARNINGS],
  };
}

export function pluginMcpSidecarTrustSignature(definition: PluginMcpSidecarDefinition): string {
  const sidecar = normalizePluginMcpSidecarDefinition(definition);
  const signatureInput = {
    id: sidecar.id,
    packageName: sidecar.packageName,
    packageVersion: sidecar.packageVersion,
    packageSource: sidecar.packageSource,
    packageDigest: sidecar.packageDigest,
    sidecarId: sidecar.sidecarId,
    sidecarKind: sidecar.sidecarKind,
    declaredCapabilities: sidecar.declaredCapabilities,
    allowedTools: sidecar.allowedTools,
    allowedMethods: sidecar.allowedMethods,
    allowedResourceUris: sidecar.allowedResourceUris,
    allowedResourceUriPrefixes: sidecar.allowedResourceUriPrefixes,
    origin: sidecar.origin,
    pluginId: sidecar.pluginId,
    clientId: sidecar.clientId,
    timeoutMs: sidecar.timeoutMs ?? null,
    maxRequestBytes: sidecar.maxRequestBytes ?? null,
    maxResponseBytes: sidecar.maxResponseBytes ?? null,
    maxJsonDepth: sidecar.maxJsonDepth ?? null,
    maxConcurrent: sidecar.maxConcurrent ?? null,
    expectedProtocolVersion: sidecar.expectedProtocolVersion ?? null,
    expectedServerName: sidecar.expectedServerName ?? null,
    expectedServerVersion: sidecar.expectedServerVersion ?? null,
  };
  const digest = createHash("sha256")
    .update(JSON.stringify(sortJsonValue(signatureInput)))
    .digest("hex");
  return `mcp-plugin:${digest.slice(0, 24)}`;
}

export function createApprovedPluginMcpSidecarTrust(
  definition: PluginMcpSidecarDefinition,
  opts: { approvedBy?: string; reason?: string } = {},
): PluginMcpSidecarTrustApproval {
  return {
    approved: true,
    signature: pluginMcpSidecarTrustSignature(definition),
    approvedBy: opts.approvedBy,
    reason: opts.reason,
  };
}

export function buildPluginMcpSidecarOperatorInspection(
  definition: PluginMcpSidecarDefinition,
): PluginMcpSidecarOperatorInspection {
  return operatorInspectionFromNormalized(normalizePluginMcpSidecarDefinition(definition));
}

export function projectPluginMcpSidecarTrustEvent(
  definition: PluginMcpSidecarDefinition,
  approval: PluginMcpSidecarTrustApproval | undefined,
  opts: { stage?: PluginMcpSidecarTrustEventStage; timestamp?: string | Date } = {},
): PluginMcpSidecarTrustEvent {
  const timestamp = toIso(opts.timestamp ?? new Date());
  const stage = opts.stage ?? "approval_requested";
  let config: PluginMcpSidecarOperatorInspection | InvalidPluginMcpSidecarOperatorInspection;
  let signature = "";
  try {
    const sidecar = normalizePluginMcpSidecarDefinition(definition);
    signature = pluginMcpSidecarTrustSignature(sidecar);
    config = operatorInspectionFromNormalized(sidecar);
  } catch {
    config = invalidOperatorInspection();
  }

  const signatureMatches = approval === undefined || !config.valid
    ? null
    : approval.signature === signature;
  const outcome = pluginTrustOutcome(stage, config.valid, approval, signatureMatches);
  return {
    eventType: "mcp_plugin_trust",
    timestamp,
    stage,
    outcome,
    resource: config.valid ? `mcp:plugin:${safeAuditLabel(config.serverId)}` : "mcp:plugin:<invalid>",
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

export function createTrustedPluginMcpClient(
  definition: PluginMcpSidecarDefinition,
  approval: PluginMcpSidecarTrustApproval,
  options: TrustedPluginMcpClientOptions,
): TrustedPluginMcpClientSession {
  const sidecar = normalizePluginMcpSidecarDefinition(definition);
  const expectedSignature = pluginMcpSidecarTrustSignature(sidecar);
  if (approval.approved !== true || approval.signature !== expectedSignature) {
    throw new Error("MCP plugin sidecar is not trusted");
  }
  if (!options || typeof options.sidecarTransport?.send !== "function") {
    throw new Error("MCP plugin sidecar transport required");
  }

  const context: McpTransportContext = {
    transportKind: "plugin",
    origin: sidecar.origin,
    pluginId: sidecar.pluginId,
    clientId: sidecar.clientId,
  };
  const guarded = new GuardedMcpTransport(options.sidecarTransport, toGuardOptions(sidecar));
  const transport = new ContextualMcpTransport(guarded, context);
  const client = new InProcessMcpClient(transport);
  return {
    server: {
      ...sidecar,
      allowedTools: [...sidecar.allowedTools],
      allowedMethods: [...sidecar.allowedMethods],
      allowedResourceUris: [...sidecar.allowedResourceUris],
      allowedResourceUriPrefixes: [...sidecar.allowedResourceUriPrefixes],
      declaredCapabilities: [...sidecar.declaredCapabilities],
    },
    approval: { ...approval },
    context: { ...context },
    transport,
    client,
    close: async () => {
      const closeable = options.sidecarTransport as { close?: () => Promise<void> | void };
      await closeable.close?.();
    },
  };
}

export async function connectTrustedPluginMcpClient(
  definition: PluginMcpSidecarDefinition,
  approval: PluginMcpSidecarTrustApproval,
  options: TrustedPluginMcpClientOptions,
): Promise<ManagedTrustedPluginMcpClientSession> {
  const session = createTrustedPluginMcpClient(definition, approval, options);
  let closed = false;
  let closing: Promise<void> | undefined;
  try {
    const init = await session.client.initialize();
    validatePluginSidecarHandshake(session.server, init);
    const lifecycle: PluginMcpSidecarLifecycle = {
      state: "connected",
      connectedAt: new Date().toISOString(),
      protocolVersion: init.protocolVersion,
      serverInfo: {
        name: init.serverInfo.name,
        version: init.serverInfo.version,
      },
      expectations: {
        ...(session.server.expectedProtocolVersion === undefined ? {} : { protocolVersion: session.server.expectedProtocolVersion }),
        ...(session.server.expectedServerName === undefined ? {} : { serverName: session.server.expectedServerName }),
        ...(session.server.expectedServerVersion === undefined ? {} : { serverVersion: session.server.expectedServerVersion }),
      },
    };
    const close = async (): Promise<void> => {
      if (closed) return;
      if (closing !== undefined) {
        await closing;
        return;
      }
      closing = (async () => {
        try {
          await session.close();
          closed = true;
          lifecycle.state = "closed";
          lifecycle.closedAt = new Date().toISOString();
        } catch {
          closing = undefined;
          throw new Error("MCP plugin sidecar close failed");
        }
      })();
      await closing;
    };
    const transport = new LifecycleMcpTransport(session.transport, () => closed);
    const client = new InProcessMcpClient(transport);
    return {
      ...session,
      transport,
      client,
      lifecycle,
      close,
    };
  } catch {
    try {
      await session.close();
    } catch {
      // Preserve the generic handshake failure while still attempting cleanup.
    }
    throw new Error("MCP plugin sidecar handshake failed");
  }
}

class LifecycleMcpTransport implements McpTransport {
  constructor(
    private readonly inner: McpTransport,
    private readonly isClosed: () => boolean,
  ) {}

  async send(request: McpJsonRpcRequest, context?: McpTransportContext): Promise<McpJsonRpcResponse> {
    if (this.isClosed()) {
      throw new Error("MCP plugin sidecar is closed");
    }
    if (request.method === "initialize") {
      throw new Error("MCP plugin sidecar initialize already completed");
    }
    return await this.inner.send(request, context);
  }
}

export function normalizePluginMcpSidecarDefinition(
  definition: PluginMcpSidecarDefinition,
): NormalizedPluginMcpSidecarDefinition {
  try {
    const id = validateSimpleId(definition.id, "plugin sidecar id", true);
    const packageName = validatePackageName(definition.packageName);
    const packageVersion = validatePackageVersion(definition.packageVersion);
    const packageSource = validatePackageSource(definition.packageSource);
    const packageDigest = validatePackageDigest(definition.packageDigest);
    const sidecarId = validateSimpleId(definition.sidecarId, "sidecar id", true);
    const sidecarKind = validateSidecarKind(definition.sidecarKind ?? "unknown");
    const declaredCapabilities = uniqueSorted(validateStringArray(definition.declaredCapabilities ?? [], "capability").map(validateCapability));
    const allowedTools = uniqueSorted(validateStringArray(definition.allowedTools ?? [], "allowed tool"));
    const allowedResourceUris = uniqueSorted(validateStringArray(definition.allowedResourceUris ?? [], "allowed resource URI"));
    const allowedResourceUriPrefixes = uniqueSorted(validateStringArray(definition.allowedResourceUriPrefixes ?? [], "allowed resource URI prefix"));
    const allowedMethods = normalizeAllowedMethods(
      definition.allowedMethods,
      allowedTools,
      allowedResourceUris,
      allowedResourceUriPrefixes,
    );
    const origin = validateOptionalString(definition.origin, "origin") ?? `plugin://${packageName}/${sidecarId}`;
    const pluginId = validateOptionalString(definition.pluginId, "plugin id") ?? id;
    const clientId = validateOptionalString(definition.clientId, "client id") ?? "colony";
    const expectedProtocolVersion = validateOptionalString(definition.expectedProtocolVersion, "expected protocol version");
    const expectedServerName = validateOptionalString(definition.expectedServerName, "expected server name");
    const expectedServerVersion = validateOptionalString(definition.expectedServerVersion, "expected server version");
    return {
      id,
      packageName,
      packageVersion,
      packageSource,
      packageDigest,
      sidecarId,
      sidecarKind,
      declaredCapabilities,
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
      ...(expectedProtocolVersion === undefined ? {} : { expectedProtocolVersion }),
      ...(expectedServerName === undefined ? {} : { expectedServerName }),
      ...(expectedServerVersion === undefined ? {} : { expectedServerVersion }),
    };
  } catch {
    throw new Error("MCP plugin sidecar config rejected");
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

function operatorInspectionFromNormalized(sidecar: NormalizedPluginMcpSidecarDefinition): PluginMcpSidecarOperatorInspection {
  return {
    valid: true,
    serverId: sidecar.id,
    signature: pluginMcpSidecarTrustSignature(sidecar),
    riskLevel: "high",
    package: {
      name: safeAuditLabel(sidecar.packageName),
      version: safeAuditLabel(sidecar.packageVersion),
      source: safeAuditLabel(sidecar.packageSource),
      digest: safeDigestLabel(sidecar.packageDigest),
    },
    sidecar: {
      id: safeAuditLabel(sidecar.sidecarId),
      kind: sidecar.sidecarKind,
    },
    capabilities: safeAuditLabels(sidecar.declaredCapabilities),
    origin: safeAuditLabel(sidecar.origin),
    pluginId: safeAuditLabel(sidecar.pluginId),
    clientId: safeAuditLabel(sidecar.clientId),
    allowedMethods: safeAuditLabels(sidecar.allowedMethods),
    allowedTools: safeAuditLabels(sidecar.allowedTools),
    allowedResourceUris: safeAuditLabels(sidecar.allowedResourceUris),
    allowedResourceUriPrefixes: safeAuditLabels(sidecar.allowedResourceUriPrefixes),
    warnings: [...PLUGIN_TRUST_WARNINGS],
  };
}

function invalidOperatorInspection(): InvalidPluginMcpSidecarOperatorInspection {
  return {
    valid: false,
    serverId: "<invalid>",
    signature: "",
    riskLevel: "high",
    package: {
      name: "<invalid>",
      version: "<invalid>",
      source: "<invalid>",
      digest: "<invalid>",
    },
    sidecar: {
      id: "<invalid>",
      kind: "unknown",
    },
    capabilities: [],
    origin: "<invalid>",
    pluginId: "<invalid>",
    clientId: "<invalid>",
    allowedMethods: [],
    allowedTools: [],
    allowedResourceUris: [],
    allowedResourceUriPrefixes: [],
    warnings: [...PLUGIN_TRUST_WARNINGS, "Config rejected before plugin MCP sidecar connection."],
  };
}

function validatePluginSidecarHandshake(
  sidecar: NormalizedPluginMcpSidecarDefinition,
  init: McpInitializeResult,
): void {
  if (sidecar.expectedProtocolVersion !== undefined && init.protocolVersion !== sidecar.expectedProtocolVersion) {
    throw new Error("plugin sidecar protocol mismatch");
  }
  if (sidecar.expectedServerName !== undefined && init.serverInfo.name !== sidecar.expectedServerName) {
    throw new Error("plugin sidecar server mismatch");
  }
  if (sidecar.expectedServerVersion !== undefined && init.serverInfo.version !== sidecar.expectedServerVersion) {
    throw new Error("plugin sidecar version mismatch");
  }
}

function toGuardOptions(sidecar: NormalizedPluginMcpSidecarDefinition): GuardedMcpTransportOptions {
  return {
    allowedMethods: sidecar.allowedMethods,
    allowedTools: sidecar.allowedTools,
    allowedResourceUris: sidecar.allowedResourceUris,
    allowedResourceUriPrefixes: sidecar.allowedResourceUriPrefixes,
    allowedOrigins: [sidecar.origin],
    allowedPluginIds: [sidecar.pluginId],
    timeoutMs: sidecar.timeoutMs,
    maxRequestBytes: sidecar.maxRequestBytes,
    maxResponseBytes: sidecar.maxResponseBytes,
    maxJsonDepth: sidecar.maxJsonDepth,
    maxConcurrent: sidecar.maxConcurrent,
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

function pluginTrustOutcome(
  stage: PluginMcpSidecarTrustEventStage,
  valid: boolean,
  approval: PluginMcpSidecarTrustApproval | undefined,
  signatureMatches: boolean | null,
): PluginMcpSidecarTrustEventOutcome {
  if (!valid || stage === "config_rejected") return "rejected";
  if (stage === "approval_requested") return "pending";
  return approval?.approved === true && signatureMatches === true ? "allowed" : "denied";
}

function validatePackageName(value: string): string {
  const clean = validateString(value, "package name");
  if (!/^(@[A-Za-z0-9._-]{1,80}\/)?[A-Za-z0-9._-]{1,120}$/.test(clean)) {
    throw new Error("invalid package name");
  }
  if (looksSecret(clean)) throw new Error("secret package name rejected");
  return clean;
}

function validatePackageVersion(value: string): string {
  const clean = validateString(value, "package version");
  if (!/^[A-Za-z0-9._+-]{1,80}$/.test(clean)) throw new Error("invalid package version");
  if (looksSecret(clean)) throw new Error("secret package version rejected");
  return clean;
}

function validatePackageSource(value: string): string {
  const clean = validateString(value, "package source");
  if (looksSecret(clean)) throw new Error("secret package source rejected");
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean)) {
    const url = new URL(clean);
    if (url.username || url.password || url.search || url.hash) {
      throw new Error("package source must be redaction-safe");
    }
    if (url.protocol !== "https:") throw new Error("package source must be https");
    return url.toString();
  }
  if (!/^[A-Za-z0-9._/@:-]{1,160}$/.test(clean)) throw new Error("invalid package source");
  return clean;
}

function validatePackageDigest(value: string): string {
  const clean = validateString(value, "package digest");
  if (!/^sha256:[a-f0-9]{64}$/i.test(clean)) throw new Error("invalid package digest");
  return clean.toLowerCase();
}

function validateSidecarKind(value: string): PluginMcpSidecarKind {
  const clean = validateString(value, "sidecar kind") as PluginMcpSidecarKind;
  if (!SIDECAR_KINDS.has(clean)) throw new Error("invalid sidecar kind");
  return clean;
}

function validateSimpleId(value: string, label: string, rejectSecretLike: boolean): string {
  const clean = validateString(value, label);
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(clean)) throw new Error(`invalid ${label}`);
  if (rejectSecretLike && looksSecret(clean)) throw new Error(`secret ${label} rejected`);
  return clean;
}

function validateCapability(value: string): string {
  const clean = validateString(value, "capability");
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(clean)) throw new Error("invalid capability");
  if (looksSecret(clean)) throw new Error("secret capability rejected");
  return clean;
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
  if (typeof value !== "string" || value.length === 0 || /[\0\r\n]/.test(value)) {
    throw new Error(`invalid ${label}`);
  }
  return value;
}

function safeDigestLabel(value: string): string {
  return `${value.slice(0, 18)}...${value.slice(-8)}`;
}

function looksSecret(value: string): boolean {
  return /(secret|token|password|credential|bearer|api[_-]?key)/i.test(value);
}

function safeAuditLabel(value: string): string {
  const clean = value.replace(/[\0\r\n]/g, "");
  return looksSecret(clean) || hasHighEntropyToken(clean) ? "<redacted>" : clean.slice(0, 80);
}

function safeAuditLabels(values: string[]): string[] {
  return values.map(safeAuditLabel);
}

function hasHighEntropyToken(value: string): boolean {
  return value
    .split(/[/?#&=:]/g)
    .some((part) => part.length >= 32 && /[A-Za-z0-9+/%=_-]{32,}/.test(part));
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
