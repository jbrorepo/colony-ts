import type {
  PluginPackageRegistryFetchApproval,
  PluginPackageRegistryFetchHandoff,
} from "./plugin-package-registry-boundary";

export interface PluginPackageRegistryFetchExecutorRequest {
  method: "GET";
  url: string;
  timeoutMs: number;
  maxResponseBytes: number;
  expectedContentType: "application/json";
  approvalSignature: string;
  expectedMetadata: {
    packageName: string;
    packageVersion: string;
    packageDigest: string;
  };
}

export interface PluginPackageRegistryFetchExecutorResult {
  status: number;
  headers?: Record<string, string>;
  bodyText?: string;
}

export type PluginPackageRegistryFetchExecutor = (
  request: PluginPackageRegistryFetchExecutorRequest,
) => Promise<PluginPackageRegistryFetchExecutorResult> | PluginPackageRegistryFetchExecutorResult;

export type PluginPackageRegistryFetchExecutionBlockedReason =
  | "approval_required"
  | "approval_signature_mismatch"
  | "handoff_not_ready"
  | "executor_failed"
  | "http_status_rejected"
  | "content_type_rejected"
  | "oversized_response"
  | "invalid_metadata_json"
  | "invalid_registry_metadata"
  | "metadata_identity_mismatch"
  | "metadata_digest_mismatch"
  | "metadata_registry_url_mismatch";

export interface PluginPackageRegistryFetchExecutionReceipt {
  recordType: "mcp_plugin_package_registry_fetch_execution_receipt";
  timestamp: string;
  status: "completed" | "failed" | "blocked";
  blockedReason?: PluginPackageRegistryFetchExecutionBlockedReason;
  handoffSignature: string;
  registryFetched: boolean;
  hostNetworkExecuted: boolean;
  colonyNetworkExecuted: false;
  credentialsPersisted: false;
  packageExecuted: false;
  activation: false;
  catalogMutated: false;
  hostAction: {
    type: "fetch_plugin_registry_metadata";
    method: "GET";
    registryUrl: string;
    status?: number;
    contentType?: string;
    responseBytes?: number;
  };
  package: {
    name: string;
    version: string;
    source: "<redacted>";
    digest: string;
  };
  metadata?: {
    packageName: string;
    packageVersion: string;
    registryUrl?: string;
    fetchedAt?: string;
    checksum: {
      digest: string;
      integrity?: string;
    };
    signatures: Array<{
      keyId: string;
      algorithm: string;
      signature: "<redacted>";
    }>;
  };
  warnings: string[];
}

const EXECUTION_WARNINGS = [
  "Registry metadata was obtained only through an injected host executor.",
  "Colony did not create a built-in registry client or persist credentials.",
  "The receipt is redacted and does not persist raw response bodies, approval reasons, package sources, or signature material.",
  "Fetched metadata remains planning input only; it does not execute package code, activate sidecars, or mutate catalogs.",
];

export async function executeApprovedPluginPackageRegistryFetch(input: {
  handoff: PluginPackageRegistryFetchHandoff;
  approval: PluginPackageRegistryFetchApproval;
  executor: PluginPackageRegistryFetchExecutor;
  timestamp?: string | Date;
}): Promise<PluginPackageRegistryFetchExecutionReceipt> {
  const timestamp = toIso(input.timestamp ?? new Date());
  const base = receiptBase(timestamp, input.handoff);
  const approval = normalizeApproval(input.approval);

  if (!approval.approved) {
    return block(base, "approval_required");
  }
  if (approval.signature !== input.handoff.signature) {
    return block(base, "approval_signature_mismatch");
  }
  if (input.handoff.status !== "ready" || input.handoff.hostActionRequired !== true) {
    return block(base, "handoff_not_ready");
  }

  let result: PluginPackageRegistryFetchExecutorResult;
  try {
    result = await input.executor({
      method: input.handoff.hostAction.method,
      url: input.handoff.hostAction.registryUrl,
      timeoutMs: input.handoff.hostAction.timeoutMs,
      maxResponseBytes: input.handoff.hostAction.maxResponseBytes,
      expectedContentType: input.handoff.hostAction.expectedContentType,
      approvalSignature: input.handoff.signature,
      expectedMetadata: { ...input.handoff.expectedMetadata },
    });
  } catch {
    return fail({ ...base, hostNetworkExecuted: true }, "executor_failed");
  }

  const status = Number.isInteger(result.status) ? result.status : 0;
  const contentType = contentTypeHeader(result.headers);
  const bodyText = typeof result.bodyText === "string" ? result.bodyText : "";
  const responseBytes = byteLength(bodyText);
  const withHostResult: PluginPackageRegistryFetchExecutionReceipt = {
    ...base,
    hostNetworkExecuted: true,
    hostAction: {
      ...base.hostAction,
      status,
      ...(contentType === undefined ? {} : { contentType: safeAuditLabel(contentType) }),
      responseBytes,
    },
  };

  if (status !== 200) {
    return fail(withHostResult, "http_status_rejected");
  }
  if (contentType === undefined || !contentType.toLowerCase().includes("application/json")) {
    return fail(withHostResult, "content_type_rejected");
  }
  if (responseBytes > input.handoff.hostAction.maxResponseBytes) {
    return fail(withHostResult, "oversized_response");
  }

  const parsed = parseJsonMetadata(bodyText);
  if (parsed === undefined) {
    return fail(withHostResult, "invalid_metadata_json");
  }
  const validation = validateMetadata(parsed, input.handoff);
  if (validation.reason !== undefined) {
    return fail(withHostResult, validation.reason);
  }

  return freezeReceipt({
    ...withHostResult,
    status: "completed",
    registryFetched: true,
    metadata: validation.metadata,
  });
}

function receiptBase(
  timestamp: string,
  handoff: PluginPackageRegistryFetchHandoff,
): PluginPackageRegistryFetchExecutionReceipt {
  return {
    recordType: "mcp_plugin_package_registry_fetch_execution_receipt",
    timestamp,
    status: "blocked",
    handoffSignature: safeAuditLabel(handoff.signature),
    registryFetched: false,
    hostNetworkExecuted: false,
    colonyNetworkExecuted: false,
    credentialsPersisted: false,
    packageExecuted: false,
    activation: false,
    catalogMutated: false,
    hostAction: {
      type: "fetch_plugin_registry_metadata",
      method: "GET",
      registryUrl: safeRegistryUrl(handoff.hostAction?.registryUrl),
    },
    package: {
      name: safeAuditLabel(handoff.package?.name),
      version: safeAuditLabel(handoff.package?.version),
      source: "<redacted>",
      digest: safeAuditLabel(handoff.package?.digest),
    },
    warnings: [...EXECUTION_WARNINGS],
  };
}

function block(
  base: PluginPackageRegistryFetchExecutionReceipt,
  reason: PluginPackageRegistryFetchExecutionBlockedReason,
): PluginPackageRegistryFetchExecutionReceipt {
  return freezeReceipt({ ...base, status: "blocked", blockedReason: reason });
}

function fail(
  base: PluginPackageRegistryFetchExecutionReceipt,
  reason: PluginPackageRegistryFetchExecutionBlockedReason,
): PluginPackageRegistryFetchExecutionReceipt {
  return freezeReceipt({ ...base, status: "failed", blockedReason: reason });
}

function validateMetadata(
  value: Record<string, unknown>,
  handoff: PluginPackageRegistryFetchHandoff,
): {
  reason?: Extract<
    PluginPackageRegistryFetchExecutionBlockedReason,
    "invalid_registry_metadata" | "metadata_identity_mismatch" | "metadata_digest_mismatch" | "metadata_registry_url_mismatch"
  >;
  metadata?: NonNullable<PluginPackageRegistryFetchExecutionReceipt["metadata"]>;
} {
  if (!validString(value.packageName, 160)
    || !validString(value.packageVersion, 80)
    || !validDigest(value.packageDigest)
    || looksSecret(value.packageName)
    || looksSecret(value.packageVersion)) {
    return { reason: "invalid_registry_metadata" };
  }
  if (value.registryUrl !== undefined && safeRegistryUrl(value.registryUrl) === "<redacted>") {
    return { reason: "invalid_registry_metadata" };
  }
  if (value.fetchedAt !== undefined && !validTimestamp(value.fetchedAt)) {
    return { reason: "invalid_registry_metadata" };
  }
  if (value.integrity !== undefined && !validIntegrity(value.integrity)) {
    return { reason: "invalid_registry_metadata" };
  }
  if (value.signatures !== undefined && !validSignatures(value.signatures)) {
    return { reason: "invalid_registry_metadata" };
  }
  if (value.packageName !== handoff.expectedMetadata.packageName || value.packageVersion !== handoff.expectedMetadata.packageVersion) {
    return { reason: "metadata_identity_mismatch" };
  }
  if (safeDigest(value.packageDigest) !== handoff.expectedMetadata.packageDigest) {
    return { reason: "metadata_digest_mismatch" };
  }
  if (value.registryUrl !== undefined && safeRegistryUrl(value.registryUrl) !== handoff.hostAction.registryUrl) {
    return { reason: "metadata_registry_url_mismatch" };
  }

  return {
    metadata: {
      packageName: safeAuditLabel(value.packageName),
      packageVersion: safeAuditLabel(value.packageVersion),
      ...(value.registryUrl === undefined ? {} : { registryUrl: safeRegistryUrl(value.registryUrl) }),
      ...(value.fetchedAt === undefined ? {} : { fetchedAt: String(value.fetchedAt) }),
      checksum: {
        digest: safeDigest(value.packageDigest),
        ...(value.integrity === undefined ? {} : { integrity: safeIntegrity(value.integrity) }),
      },
      signatures: Array.isArray(value.signatures)
        ? value.signatures.slice(0, 8).map((signature) => {
            const record = signature as Record<string, unknown>;
            return {
              keyId: safeAuditLabel(record.keyId),
              algorithm: safeAuditLabel(record.algorithm),
              signature: "<redacted>",
            };
          })
        : [],
    },
  };
}

interface NormalizedApproval {
  approved: boolean;
  signature: string;
}

function normalizeApproval(value: unknown): NormalizedApproval {
  if (!isPlainRecord(value)) return { approved: false, signature: "" };
  return {
    approved: value.approved === true,
    signature: typeof value.signature === "string" ? value.signature : "",
  };
}

function parseJsonMetadata(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return isPlainRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function contentTypeHeader(headers: Record<string, string> | undefined): string | undefined {
  if (!isPlainRecord(headers)) return undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "content-type" && typeof value === "string") return value;
  }
  return undefined;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function validDigest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/i.test(value);
}

function validIntegrity(value: unknown): value is string {
  return typeof value === "string" && /^sha256-[A-Za-z0-9+/=_-]{32,128}$/.test(value) && !looksSecret(value);
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 40 || /[\0\r\n]/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function validSignatures(value: unknown): value is Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length > 8) return false;
  return value.every((item) => {
    if (!isPlainRecord(item)) return false;
    return validString(item.keyId, 120)
      && validString(item.algorithm, 80)
      && validString(item.signature, 4096)
      && !looksSecret(item.keyId)
      && !looksSecret(item.algorithm);
  });
}

function validString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && !/[\0\r\n]/.test(value);
}

function safeDigest(value: unknown): string {
  if (!validDigest(value)) return "<redacted>";
  return `${value.slice(0, 18).toLowerCase()}...${value.slice(-8).toLowerCase()}`;
}

function safeIntegrity(value: unknown): string {
  if (!validIntegrity(value)) return "<redacted>";
  return `${value.slice(0, 18)}...${value.slice(-8)}`;
}

function safeRegistryUrl(value: unknown): string {
  if (!validString(value, 240) || looksSecret(value)) return "<redacted>";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return "<redacted>";
    const hostname = url.hostname.toLowerCase();
    if (isBlockedHost(hostname)) return "<redacted>";
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "<redacted>";
  }
}

function isBlockedHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  if (hostname === "metadata.google.internal" || hostname.endsWith(".metadata.google.internal")) return true;
  if (hostname.endsWith(".local")) return true;
  if (hostname === "0.0.0.0" || hostname === "::1") return true;
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function looksSecret(value: unknown): boolean {
  return typeof value === "string" && /(secret|token|password|credential|bearer|api[_-]?key|SHOULD_NOT_LEAK)/i.test(value);
}

function safeAuditLabel(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "<redacted>";
  const clean = value.replace(/[\0\r\n]/g, "");
  return looksSecret(clean) || looksHighEntropy(clean) ? "<redacted>" : clean.slice(0, 120);
}

function looksHighEntropy(value: string): boolean {
  if (value.length < 32) return false;
  const compact = value.replace(/[-_:./@]/g, "");
  if (compact.length < 32) return false;
  if (/^[A-Fa-f0-9]{32,}$/.test(compact)) return true;
  if (/^[A-Za-z0-9+/=_-]{32,}$/.test(compact)) return new Set(compact).size >= 16;
  return false;
}

function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid timestamp");
  return date.toISOString();
}

function freezeReceipt<T extends PluginPackageRegistryFetchExecutionReceipt>(receipt: T): T {
  return Object.freeze({
    ...receipt,
    hostAction: Object.freeze({ ...receipt.hostAction }),
    package: Object.freeze({ ...receipt.package }),
    metadata: receipt.metadata === undefined ? undefined : Object.freeze({
      ...receipt.metadata,
      checksum: Object.freeze({ ...receipt.metadata.checksum }),
      signatures: Object.freeze(receipt.metadata.signatures.map((signature) => Object.freeze({ ...signature }))),
    }),
    warnings: Object.freeze([...receipt.warnings]),
  }) as T;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
