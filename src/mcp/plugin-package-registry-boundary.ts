import { createHash } from "crypto";

export interface PluginPackageRegistryFetchCandidate {
  packageName: string;
  packageVersion: string;
  packageSource: string;
  packageDigest: string;
  registryUrl: string;
  reason?: string;
}

export interface PluginPackageRegistryFetchApproval {
  approved: boolean;
  signature: string;
  approvedBy?: string;
  reason?: string;
}

export type PluginPackageRegistryFetchBlockedReason =
  | "invalid_candidate"
  | "unsafe_registry_url"
  | "approval_required"
  | "approval_signature_mismatch";

export interface PluginPackageRegistryFetchApprovalRequest {
  valid: boolean;
  blockedReason?: Extract<PluginPackageRegistryFetchBlockedReason, "invalid_candidate" | "unsafe_registry_url">;
  signature: string;
  riskLevel: "high";
  summary: string;
  details: string;
  package: {
    name: string;
    version: string;
    source: "<redacted>";
    digest: string;
  };
  registry: {
    url: string;
    host: string;
  };
  warnings: string[];
}

export interface PluginPackageRegistryFetchHandoff {
  recordType: "mcp_plugin_package_registry_fetch_handoff";
  timestamp: string;
  status: "ready" | "blocked";
  blockedReason?: PluginPackageRegistryFetchBlockedReason;
  signature: string;
  registryFetched: false;
  networkExecuted: false;
  credentialsPersisted: false;
  packageExecuted: false;
  activation: false;
  hostActionRequired: boolean;
  package: {
    name: string;
    version: string;
    source: "<redacted>";
    digest: string;
  };
  expectedMetadata: {
    packageName: string;
    packageVersion: string;
    packageDigest: string;
  };
  approval: {
    approved: boolean;
    approvedBy?: string;
    reason: "<redacted>";
  };
  hostAction: {
    type: "fetch_plugin_registry_metadata";
    method: "GET";
    registryUrl: string;
    timeoutMs: number;
    maxResponseBytes: number;
    expectedContentType: "application/json";
  };
  warnings: string[];
}

const REGISTRY_FETCH_WARNINGS = [
  "No network request has been executed by Colony.",
  "This is a host-owned network boundary; a trusted host must fetch metadata and pass it back as supplied registry metadata.",
  "The handoff must not persist credentials, execute package code, activate sidecars, or mutate plugin catalogs.",
  "Fetched metadata remains untrusted until the package planner validates package identity, source, digest, and signature summaries.",
];
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 32 * 1024;

export function pluginPackageRegistryFetchSignature(
  candidate: PluginPackageRegistryFetchCandidate,
): string {
  const normalized = normalizeCandidate(candidate);
  const signatureInput = {
    packageName: normalized.packageName,
    packageVersion: normalized.packageVersion,
    packageSource: normalized.packageSource,
    packageDigest: normalized.packageDigest.toLowerCase(),
    registryUrl: normalized.registryUrl,
  };
  const digest = createHash("sha256")
    .update(JSON.stringify(sortJsonValue(signatureInput)))
    .digest("hex");
  return `mcp-registry-fetch:${digest.slice(0, 24)}`;
}

export function buildPluginPackageRegistryFetchApprovalRequest(
  candidate: PluginPackageRegistryFetchCandidate,
): PluginPackageRegistryFetchApprovalRequest {
  const validation = validateCandidate(candidate);
  const normalized = normalizeCandidate(candidate);
  const signature = pluginPackageRegistryFetchSignature(normalized);
  const safeRegistry = validation.safeRegistryUrl ?? safeRegistrySummary(normalized.registryUrl);
  return {
    valid: validation.reason === undefined,
    ...(validation.reason === undefined ? {} : { blockedReason: validation.reason }),
    signature,
    riskLevel: "high",
    summary: `Fetch supplied plugin registry metadata for ${safeAuditLabel(normalized.packageName)} ${safeAuditLabel(normalized.packageVersion)}`,
    details: [
      `package: ${safeAuditLabel(normalized.packageName)}`,
      `version: ${safeAuditLabel(normalized.packageVersion)}`,
      "source: <redacted>",
      `digest: ${safeDigest(normalized.packageDigest)}`,
      `registry: ${safeRegistry.url}`,
      "boundary: host-owned metadata fetch only",
    ].join("\n"),
    package: {
      name: safeAuditLabel(normalized.packageName),
      version: safeAuditLabel(normalized.packageVersion),
      source: "<redacted>",
      digest: safeDigest(normalized.packageDigest),
    },
    registry: safeRegistry,
    warnings: [...REGISTRY_FETCH_WARNINGS],
  };
}

export function createApprovedPluginPackageRegistryFetchHandoff(input: {
  candidate: PluginPackageRegistryFetchCandidate;
  approval: PluginPackageRegistryFetchApproval;
  timestamp?: string | Date;
}): PluginPackageRegistryFetchHandoff {
  const timestamp = toIso(input.timestamp ?? new Date());
  const validation = validateCandidate(input.candidate);
  const normalized = normalizeCandidate(input.candidate);
  const signature = pluginPackageRegistryFetchSignature(normalized);
  const approval = normalizeApproval(input.approval);
  const safeRegistry = validation.safeRegistryUrl ?? safeRegistrySummary(normalized.registryUrl);
  const base = handoffBase(timestamp, normalized, signature, approval, safeRegistry);

  if (validation.reason !== undefined) {
    return block(base, validation.reason);
  }
  if (!approval.approved) {
    return block(base, "approval_required");
  }
  if (approval.signature !== signature) {
    return block(base, "approval_signature_mismatch");
  }

  return {
    ...base,
    status: "ready",
    hostActionRequired: true,
  };
}

function handoffBase(
  timestamp: string,
  candidate: PluginPackageRegistryFetchCandidate,
  signature: string,
  approval: NormalizedApproval,
  registry: { url: string; host: string },
): PluginPackageRegistryFetchHandoff {
  return {
    recordType: "mcp_plugin_package_registry_fetch_handoff",
    timestamp,
    status: "blocked",
    signature,
    registryFetched: false,
    networkExecuted: false,
    credentialsPersisted: false,
    packageExecuted: false,
    activation: false,
    hostActionRequired: false,
    package: {
      name: safeAuditLabel(candidate.packageName),
      version: safeAuditLabel(candidate.packageVersion),
      source: "<redacted>",
      digest: safeDigest(candidate.packageDigest),
    },
    expectedMetadata: {
      packageName: safeAuditLabel(candidate.packageName),
      packageVersion: safeAuditLabel(candidate.packageVersion),
      packageDigest: safeDigest(candidate.packageDigest),
    },
    approval: {
      approved: approval.approved,
      ...(approval.approvedBy === undefined ? {} : { approvedBy: approval.approvedBy }),
      reason: "<redacted>",
    },
    hostAction: {
      type: "fetch_plugin_registry_metadata",
      method: "GET",
      registryUrl: registry.url,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES,
      expectedContentType: "application/json",
    },
    warnings: [...REGISTRY_FETCH_WARNINGS],
  };
}

function block(
  base: PluginPackageRegistryFetchHandoff,
  reason: PluginPackageRegistryFetchBlockedReason,
): PluginPackageRegistryFetchHandoff {
  return {
    ...base,
    status: "blocked",
    blockedReason: reason,
    hostActionRequired: false,
    hostAction: {
      ...base.hostAction,
      registryUrl: reason === "unsafe_registry_url" ? "<redacted>" : base.hostAction.registryUrl,
    },
  };
}

interface NormalizedApproval {
  approved: boolean;
  signature: string;
  approvedBy?: string;
  reason: "<redacted>";
}

function normalizeApproval(value: unknown): NormalizedApproval {
  if (!isPlainRecord(value)) {
    return { approved: false, signature: "", reason: "<redacted>" };
  }
  return {
    approved: value.approved === true,
    signature: typeof value.signature === "string" ? value.signature : "",
    ...(value.approvedBy === undefined ? {} : { approvedBy: safeAuditLabel(String(value.approvedBy)) }),
    reason: "<redacted>",
  };
}

function validateCandidate(
  candidate: PluginPackageRegistryFetchCandidate,
): { reason?: Extract<PluginPackageRegistryFetchBlockedReason, "invalid_candidate" | "unsafe_registry_url">; safeRegistryUrl?: { url: string; host: string } } {
  if (!isPlainRecord(candidate)) return { reason: "invalid_candidate" };
  if (!validString(candidate.packageName, 160) || looksSecret(candidate.packageName)) return { reason: "invalid_candidate" };
  if (!validString(candidate.packageVersion, 80) || looksSecret(candidate.packageVersion)) return { reason: "invalid_candidate" };
  if (!validString(candidate.packageSource, 240) || looksSecret(candidate.packageSource) || !safePackageSource(candidate.packageSource)) {
    return { reason: "invalid_candidate" };
  }
  if (!validDigest(candidate.packageDigest)) return { reason: "invalid_candidate" };
  const registry = parseSafeRegistryUrl(candidate.registryUrl);
  if (registry === undefined) return { reason: "unsafe_registry_url" };
  if (candidate.reason !== undefined && !validString(candidate.reason, 240)) return { reason: "invalid_candidate" };
  return { safeRegistryUrl: registry };
}

function normalizeCandidate(candidate: PluginPackageRegistryFetchCandidate): PluginPackageRegistryFetchCandidate {
  return {
    packageName: typeof candidate?.packageName === "string" ? candidate.packageName : "",
    packageVersion: typeof candidate?.packageVersion === "string" ? candidate.packageVersion : "",
    packageSource: typeof candidate?.packageSource === "string" ? candidate.packageSource : "",
    packageDigest: typeof candidate?.packageDigest === "string" ? candidate.packageDigest : "",
    registryUrl: typeof candidate?.registryUrl === "string" ? candidate.registryUrl : "",
    ...(typeof candidate?.reason === "string" ? { reason: candidate.reason } : {}),
  };
}

function safePackageSource(value: string): boolean {
  try {
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
    }
    return /^[A-Za-z0-9._/@:-]{1,160}$/.test(value);
  } catch {
    return false;
  }
}

function parseSafeRegistryUrl(value: unknown): { url: string; host: string } | undefined {
  if (!validString(value, 240) || looksSecret(value)) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    if (url.username || url.password || url.search || url.hash) return undefined;
    const hostname = url.hostname.toLowerCase();
    if (isBlockedHost(hostname)) return undefined;
    return {
      url: `${url.protocol}//${url.host}${url.pathname}`,
      host: safeAuditLabel(hostname),
    };
  } catch {
    return undefined;
  }
}

function isBlockedHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  if (hostname === "metadata.google.internal" || hostname.endsWith(".metadata.google.internal")) return true;
  if (hostname.endsWith(".local")) return true;
  if (hostname === "0.0.0.0" || hostname === "::1") return true;
  const ipv4 = parseIpv4(hostname);
  if (ipv4 === undefined) return false;
  const [a, b] = ipv4;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function parseIpv4(hostname: string): [number, number, number, number] | undefined {
  const parts = hostname.split(".");
  if (parts.length !== 4) return undefined;
  const octets = parts.map((part) => Number(part));
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return undefined;
  return [octets[0]!, octets[1]!, octets[2]!, octets[3]!];
}

function safeRegistrySummary(value: unknown): { url: string; host: string } {
  const safe = parseSafeRegistryUrl(value);
  return safe ?? { url: "<redacted>", host: "<redacted>" };
}

function validDigest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/i.test(value);
}

function validString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && !/[\0\r\n]/.test(value);
}

function safeDigest(value: unknown): string {
  if (typeof value === "string" && /^sha256:[a-f0-9]{64}$/i.test(value)) {
    return `${value.slice(0, 18).toLowerCase()}...${value.slice(-8).toLowerCase()}`;
  }
  if (typeof value === "string" && /^sha256:[a-f0-9]{11}\.\.\.[a-f0-9]{8}$/i.test(value)) {
    return value.toLowerCase();
  }
  return "<redacted>";
}

function safeAuditLabel(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "<redacted>";
  const clean = value.replace(/[\0\r\n]/g, "");
  return looksSecret(clean) || looksHighEntropy(clean) ? "<redacted>" : clean.slice(0, 120);
}

function looksSecret(value: unknown): boolean {
  return typeof value === "string" && /(secret|token|password|credential|bearer|api[_-]?key|SHOULD_NOT_LEAK)/i.test(value);
}

function looksHighEntropy(value: string): boolean {
  if (value.length < 32) return false;
  const compact = value.replace(/[-_:./@]/g, "");
  if (compact.length < 32) return false;
  if (/^[A-Fa-f0-9]{32,}$/.test(compact)) return true;
  if (/^[A-Za-z0-9+/=_-]{32,}$/.test(compact)) {
    return new Set(compact).size >= 16;
  }
  return false;
}

function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid timestamp");
  return date.toISOString();
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!isPlainRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, sortJsonValue(nested)]),
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
