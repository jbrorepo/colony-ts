import {
  executeApprovedPluginPackageRegistryFetch,
  type PluginPackageRegistryFetchExecutionReceipt,
  type PluginPackageRegistryFetchExecutor,
} from "./plugin-package-registry-fetch-execution";
import type { PluginPackageRegistryFetchApproval } from "./plugin-package-registry-boundary";
import type { PluginPackageMarketplaceRegistryFetchHandoff } from "./plugin-package-marketplace-registry-fetch-handoff";

export type PluginPackageMarketplaceRegistryFetchHandoffExecutionAction = "fetch_registry_metadata";

export type PluginPackageMarketplaceRegistryFetchHandoffExecutionBlockedReason =
  | "handoff_not_ready"
  | "action_mismatch"
  | "approval_required"
  | "approval_signature_mismatch"
  | "registry_fetch_blocked"
  | "registry_fetch_failed";

export interface PluginPackageMarketplaceRegistryFetchHandoffExecutionRequest {
  handoff: PluginPackageMarketplaceRegistryFetchHandoff;
  action: PluginPackageMarketplaceRegistryFetchHandoffExecutionAction;
  approval: PluginPackageRegistryFetchApproval;
  executor: PluginPackageRegistryFetchExecutor;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceRegistryFetchHandoffExecutionReceipt {
  recordType: "mcp_plugin_package_marketplace_registry_fetch_handoff_execution_receipt";
  timestamp: string;
  status: "completed" | "failed" | "blocked";
  blockedReason?: PluginPackageMarketplaceRegistryFetchHandoffExecutionBlockedReason;
  hostNetworkExecuted: boolean;
  registryFetched: boolean;
  colonyNetworkExecuted: false;
  networkFetched: false;
  packageInstalled: false;
  packageExecuted: false;
  activation: false;
  sidecarStarted: false;
  catalogMutated: false;
  credentialsPersisted: false;
  requiresInjectedExecutor: true;
  handoff: {
    catalogId: string;
    entryId: string;
    action: PluginPackageMarketplaceRegistryFetchHandoffExecutionAction | "<blocked>";
    marketplaceAction: PluginPackageMarketplaceRegistryFetchHandoff["action"];
    approvalSignature: string;
    hostActionKind: "plugin_package_registry_metadata_fetch" | "<blocked>";
    executorPath: "executeApprovedPluginPackageRegistryFetch" | "<blocked>";
  };
  package: {
    name: string;
    version: string;
    source: "<redacted>";
    digest: string;
  };
  sidecar: {
    id: string;
    kind: string;
  };
  registry: {
    url: string;
    expectedContentType: "application/json" | "<blocked>";
    timeoutMs: number;
    maxResponseBytes: number;
  };
  approval: {
    approved: boolean;
    approvedBy?: string;
    reason: "<redacted>";
  };
  registryFetchReceipt: {
    present: boolean;
    recordType: string;
    status: string;
    blockedReason?: string;
    handoffSignature: string;
    hostNetworkExecuted: boolean;
    registryFetched: boolean;
    statusCode?: number;
    contentType?: string;
    responseBytes?: number;
  };
  warnings: string[];
}

const HANDOFF_EXECUTION_WARNINGS = [
  "Marketplace registry fetch handoff execution requires a ready redacted handoff, exact approval, and an injected host executor.",
  "This receipt delegates to the existing approved registry-fetch helper; Colony does not create a built-in registry client.",
  "Fetched registry metadata remains planning input only; it does not install packages, execute package code, activate sidecars, start sidecars, mutate catalogs, or persist credentials.",
  "Registry response bodies, approval reasons, package sources, and signature material remain redacted.",
];

export async function executeApprovedPluginPackageMarketplaceRegistryFetchHandoff(
  request: PluginPackageMarketplaceRegistryFetchHandoffExecutionRequest,
): Promise<PluginPackageMarketplaceRegistryFetchHandoffExecutionReceipt> {
  const timestamp = toIso(request.timestamp ?? new Date());
  const handoffCheck = validateReadyHandoff(request.handoff);
  if (handoffCheck !== "ok") {
    return block(receiptBase(timestamp, request, undefined), handoffCheck);
  }

  if (request.action !== "fetch_registry_metadata") {
    return block(receiptBase(timestamp, request, undefined), "action_mismatch");
  }

  if (!isPlainRecord(request.approval) || request.approval.approved !== true) {
    return block(receiptBase(timestamp, request, undefined), "approval_required");
  }
  if (request.approval.signature !== request.handoff.approval.signature) {
    return block(receiptBase(timestamp, request, undefined), "approval_signature_mismatch");
  }

  const registryFetchReceipt = await executeApprovedPluginPackageRegistryFetch({
    handoff: request.handoff.registryFetchHandoff,
    approval: request.approval,
    executor: request.executor,
    timestamp,
  });

  if (registryFetchReceipt.status === "completed") {
    return {
      ...receiptBase(timestamp, request, registryFetchReceipt),
      status: "completed",
      hostNetworkExecuted: registryFetchReceipt.hostNetworkExecuted === true,
      registryFetched: registryFetchReceipt.registryFetched === true,
    };
  }
  if (registryFetchReceipt.status === "failed") {
    return {
      ...receiptBase(timestamp, request, registryFetchReceipt),
      status: "failed",
      blockedReason: "registry_fetch_failed",
      hostNetworkExecuted: registryFetchReceipt.hostNetworkExecuted === true,
      registryFetched: false,
    };
  }
  return block(receiptBase(timestamp, request, registryFetchReceipt), "registry_fetch_blocked");
}

function validateReadyHandoff(
  handoff: PluginPackageMarketplaceRegistryFetchHandoff,
): "ok" | "handoff_not_ready" | "approval_signature_mismatch" {
  if (!isPlainRecord(handoff) || handoff.recordType !== "mcp_plugin_package_marketplace_registry_fetch_handoff") {
    return "handoff_not_ready";
  }
  if (
    handoff.status !== "ready"
    || handoff.hostAction?.kind !== "plugin_package_registry_metadata_fetch"
    || handoff.hostAction?.executorPath !== "executeApprovedPluginPackageRegistryFetch"
    || handoff.hostAction?.requiresInjectedExecutor !== true
    || handoff.registryFetchHandoff?.recordType !== "mcp_plugin_package_registry_fetch_handoff"
    || handoff.registryFetchHandoff?.status !== "ready"
    || handoff.registryFetchHandoff?.hostActionRequired !== true
  ) {
    return "handoff_not_ready";
  }
  const handoffSignature = safeRegistryFetchSignature(handoff.approval?.signature);
  if (handoffSignature === "<redacted>" || handoffSignature !== safeRegistryFetchSignature(handoff.registryFetchHandoff.signature)) {
    return "approval_signature_mismatch";
  }
  return "ok";
}

function receiptBase(
  timestamp: string,
  request: PluginPackageMarketplaceRegistryFetchHandoffExecutionRequest,
  registryFetchReceipt: PluginPackageRegistryFetchExecutionReceipt | undefined,
): PluginPackageMarketplaceRegistryFetchHandoffExecutionReceipt {
  return {
    recordType: "mcp_plugin_package_marketplace_registry_fetch_handoff_execution_receipt",
    timestamp,
    status: "blocked",
    hostNetworkExecuted: false,
    registryFetched: false,
    colonyNetworkExecuted: false,
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    requiresInjectedExecutor: true,
    handoff: {
      catalogId: safeId(request.handoff?.catalogId),
      entryId: safeId(request.handoff?.entry?.entryId),
      action: request.action === "fetch_registry_metadata" ? "fetch_registry_metadata" : "<blocked>",
      marketplaceAction: safeMarketplaceAction(request.handoff?.action),
      approvalSignature: safeRegistryFetchSignature(request.handoff?.approval?.signature),
      hostActionKind: request.handoff?.hostAction?.kind === "plugin_package_registry_metadata_fetch"
        ? "plugin_package_registry_metadata_fetch"
        : "<blocked>",
      executorPath: request.handoff?.hostAction?.executorPath === "executeApprovedPluginPackageRegistryFetch"
        ? "executeApprovedPluginPackageRegistryFetch"
        : "<blocked>",
    },
    package: {
      name: safeLabel(request.handoff?.package?.name),
      version: safeLabel(request.handoff?.package?.version),
      source: "<redacted>",
      digest: safeDigest(request.handoff?.package?.digest),
    },
    sidecar: {
      id: safeLabel(request.handoff?.sidecar?.id),
      kind: safeLabel(request.handoff?.sidecar?.kind),
    },
    registry: {
      url: safeRegistryUrl(request.handoff?.hostAction?.registryUrl),
      expectedContentType: request.handoff?.hostAction?.expectedContentType === "application/json" ? "application/json" : "<blocked>",
      timeoutMs: safePositiveInteger(request.handoff?.hostAction?.timeoutMs, 15_000),
      maxResponseBytes: safePositiveInteger(request.handoff?.hostAction?.maxResponseBytes, 32 * 1024),
    },
    approval: {
      approved: request.approval?.approved === true,
      ...(request.approval?.approvedBy === undefined ? {} : { approvedBy: safeLabel(request.approval.approvedBy) }),
      reason: "<redacted>",
    },
    registryFetchReceipt: summarizeRegistryFetchReceipt(registryFetchReceipt),
    warnings: [...HANDOFF_EXECUTION_WARNINGS],
  };
}

function block(
  base: PluginPackageMarketplaceRegistryFetchHandoffExecutionReceipt,
  reason: PluginPackageMarketplaceRegistryFetchHandoffExecutionBlockedReason,
): PluginPackageMarketplaceRegistryFetchHandoffExecutionReceipt {
  return {
    ...base,
    status: "blocked",
    blockedReason: reason,
    hostNetworkExecuted: false,
    registryFetched: false,
  };
}

function summarizeRegistryFetchReceipt(
  receipt: PluginPackageRegistryFetchExecutionReceipt | undefined,
): PluginPackageMarketplaceRegistryFetchHandoffExecutionReceipt["registryFetchReceipt"] {
  if (!isPlainRecord(receipt)) {
    return {
      present: false,
      recordType: "<missing>",
      status: "<missing>",
      handoffSignature: "<redacted>",
      hostNetworkExecuted: false,
      registryFetched: false,
    };
  }
  return {
    present: true,
    recordType: receipt.recordType === "mcp_plugin_package_registry_fetch_execution_receipt" ? receipt.recordType : "<redacted>",
    status: safeReason(receipt.status),
    ...(receipt.blockedReason === undefined ? {} : { blockedReason: safeReason(receipt.blockedReason) }),
    handoffSignature: safeRegistryFetchSignature(receipt.handoffSignature),
    hostNetworkExecuted: receipt.hostNetworkExecuted === true,
    registryFetched: receipt.registryFetched === true,
    ...(safeHttpStatus(receipt.hostAction?.status) === undefined ? {} : { statusCode: safeHttpStatus(receipt.hostAction?.status) }),
    ...(receipt.hostAction?.contentType === undefined ? {} : { contentType: safeLabel(receipt.hostAction.contentType) }),
    ...(safeResponseBytes(receipt.hostAction?.responseBytes) === undefined
      ? {}
      : { responseBytes: safeResponseBytes(receipt.hostAction?.responseBytes) }),
  };
}

function safeMarketplaceAction(value: unknown): PluginPackageMarketplaceRegistryFetchHandoff["action"] {
  return value === "import" || value === "update" || value === "keep" || value === "review" ? value : "<blocked>";
}

function safePositiveInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) && typeof value === "number" && value > 0 && value <= 1_000_000
    ? value
    : fallback;
}

function safeHttpStatus(value: unknown): number | undefined {
  return Number.isInteger(value) && typeof value === "number" && value >= 100 && value <= 599 ? value : undefined;
}

function safeResponseBytes(value: unknown): number | undefined {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= 1_000_000 ? value : undefined;
}

function safeId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]{1,120}$/.test(value) || looksSecret(value)) {
    return "<redacted>";
  }
  return value;
}

function safeLabel(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "<redacted>";
  const clean = value.replace(/[\0\r\n]/g, "");
  return looksSecret(clean) || looksHighEntropy(clean) ? "<redacted>" : clean.slice(0, 120);
}

function safeReason(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9_:-]{1,80}$/i.test(value) && !looksSecret(value) ? value : "<redacted>";
}

function safeDigest(value: unknown): string {
  if (typeof value !== "string") return "<redacted>";
  if (/^sha256:[a-f0-9]{64}$/i.test(value)) {
    return `${value.slice(0, 18).toLowerCase()}...${value.slice(-8).toLowerCase()}`;
  }
  if (/^sha256:[a-f0-9]{11}\.\.\.[a-f0-9]{8}$/i.test(value)) {
    return value.toLowerCase();
  }
  return "<redacted>";
}

function safeRegistryFetchSignature(value: unknown): string {
  return typeof value === "string" && /^mcp-registry-fetch:[a-f0-9]{24}$/i.test(value) ? value : "<redacted>";
}

function safeRegistryUrl(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value === "<redacted>" || looksSecret(value)) return "<redacted>";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return "<redacted>";
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "<redacted>";
  }
}

function looksSecret(value: unknown): boolean {
  return typeof value === "string" && /(secret|token|password|credential|bearer|api[_-]?key|SHOULD_NOT_LEAK)/i.test(value);
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
