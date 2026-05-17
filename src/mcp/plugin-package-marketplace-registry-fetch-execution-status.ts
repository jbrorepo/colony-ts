import type { PluginPackageMarketplaceRegistryFetchHandoff } from "./plugin-package-marketplace-registry-fetch-handoff";
import type { PluginPackageRegistryFetchExecutionReceipt } from "./plugin-package-registry-fetch-execution";

export type PluginPackageMarketplaceRegistryFetchExecutionState =
  | "not_executed"
  | "blocked"
  | "failed"
  | "completed";

export interface PluginPackageMarketplaceRegistryFetchExecutionStatusRequest {
  handoffs: PluginPackageMarketplaceRegistryFetchHandoff[];
  receipts?: PluginPackageRegistryFetchExecutionReceipt[];
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceRegistryFetchExecutionStatusEntry {
  entryId: string;
  displayName: string;
  action: PluginPackageMarketplaceRegistryFetchHandoff["action"];
  state: PluginPackageMarketplaceRegistryFetchExecutionState;
  blockedReason?: string;
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
  approval: {
    required: true;
    signature: string;
  };
  registry: {
    url: string;
  };
  receipt: {
    present: boolean;
    status?: PluginPackageRegistryFetchExecutionReceipt["status"];
    blockedReason?: string;
    hostNetworkExecuted: boolean;
    registryFetched: boolean;
    contentType?: string;
    statusCode?: number;
    responseBytes?: number;
  };
  nextActions: string[];
}

export interface PluginPackageMarketplaceRegistryFetchExecutionStatusView {
  recordType: "mcp_plugin_package_marketplace_registry_fetch_execution_status_view";
  timestamp: string;
  handoffCount: number;
  receiptCount: number;
  entries: PluginPackageMarketplaceRegistryFetchExecutionStatusEntry[];
  networkFetched: false;
  packageInstalled: false;
  packageExecuted: false;
  activation: false;
  sidecarStarted: false;
  catalogMutated: false;
  credentialsPersisted: false;
  warnings: string[];
}

const STATUS_WARNINGS = [
  "Marketplace registry fetch execution status is a read-only projection over handoffs and supplied receipts.",
  "The status view does not fetch registries, install packages, execute package code, activate sidecars, start sidecars, mutate catalogs, or persist credentials.",
  "Receipts attach only when approval signature, registry URL, package identity, and digest match the handoff.",
];

export function createPluginPackageMarketplaceRegistryFetchExecutionStatus(
  request: PluginPackageMarketplaceRegistryFetchExecutionStatusRequest,
): PluginPackageMarketplaceRegistryFetchExecutionStatusView {
  const timestamp = toIso(request.timestamp ?? new Date());
  const handoffs = Array.isArray(request.handoffs) ? request.handoffs : [];
  const receipts = Array.isArray(request.receipts) ? request.receipts : [];
  return {
    recordType: "mcp_plugin_package_marketplace_registry_fetch_execution_status_view",
    timestamp,
    handoffCount: handoffs.length,
    receiptCount: receipts.length,
    entries: handoffs.map((handoff) => projectHandoff(handoff, receipts)),
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    warnings: [...STATUS_WARNINGS],
  };
}

function projectHandoff(
  handoff: PluginPackageMarketplaceRegistryFetchHandoff,
  receipts: PluginPackageRegistryFetchExecutionReceipt[],
): PluginPackageMarketplaceRegistryFetchExecutionStatusEntry {
  const receipt = handoff.status === "ready" ? latestMatchingReceipt(handoff, receipts) : undefined;
  const state = executionState(handoff, receipt);
  return {
    entryId: safeId(handoff.entry?.entryId),
    displayName: safeLabel(handoff.entry?.displayName),
    action: safeAction(handoff.action),
    state,
    ...(state === "blocked" ? { blockedReason: safeReason(handoff.blockedReason ?? receipt?.blockedReason) } : {}),
    package: {
      name: safeLabel(handoff.package?.name),
      version: safeLabel(handoff.package?.version),
      source: "<redacted>",
      digest: safeDigest(handoff.package?.digest),
    },
    sidecar: {
      id: safeLabel(handoff.sidecar?.id),
      kind: safeLabel(handoff.sidecar?.kind),
    },
    approval: {
      required: true,
      signature: safeRegistryFetchSignature(handoff.approval?.signature),
    },
    registry: {
      url: safeRegistryUrl(handoff.hostAction?.registryUrl),
    },
    receipt: summarizeReceipt(receipt),
    nextActions: nextActions(state),
  };
}

function latestMatchingReceipt(
  handoff: PluginPackageMarketplaceRegistryFetchHandoff,
  receipts: PluginPackageRegistryFetchExecutionReceipt[],
): PluginPackageRegistryFetchExecutionReceipt | undefined {
  return receipts
    .filter((receipt) => matchesHandoff(handoff, receipt))
    .sort((left, right) => timestampMs(right.timestamp) - timestampMs(left.timestamp))[0];
}

function matchesHandoff(
  handoff: PluginPackageMarketplaceRegistryFetchHandoff,
  receipt: PluginPackageRegistryFetchExecutionReceipt,
): boolean {
  return isPlainRecord(receipt)
    && receipt.recordType === "mcp_plugin_package_registry_fetch_execution_receipt"
    && receiptMatchesApproval(receipt.handoffSignature, handoff.approval?.signature)
    && safeLabel(receipt.package?.name) === safeLabel(handoff.package?.name)
    && safeLabel(receipt.package?.version) === safeLabel(handoff.package?.version)
    && safeDigest(receipt.package?.digest) === safeDigest(handoff.package?.digest)
    && safeRegistryUrl(receipt.hostAction?.registryUrl) === safeRegistryUrl(handoff.hostAction?.registryUrl);
}

function receiptMatchesApproval(receiptSignature: unknown, handoffSignature: unknown): boolean {
  const safeReceiptSignature = safeRegistryFetchSignature(receiptSignature);
  const safeHandoffSignature = safeRegistryFetchSignature(handoffSignature);
  if (safeReceiptSignature !== "<redacted>") return safeReceiptSignature === safeHandoffSignature;

  // Registry fetch execution receipts deliberately redact high-entropy approval
  // signatures. When the receipt stores that redacted truth, package identity
  // and registry URL matching below provide the remaining binding.
  return receiptSignature === "<redacted>" && safeHandoffSignature !== "<redacted>";
}

function summarizeReceipt(
  receipt: PluginPackageRegistryFetchExecutionReceipt | undefined,
): PluginPackageMarketplaceRegistryFetchExecutionStatusEntry["receipt"] {
  if (receipt === undefined) {
    return {
      present: false,
      hostNetworkExecuted: false,
      registryFetched: false,
    };
  }
  return {
    present: true,
    status: receipt.status,
    ...(receipt.blockedReason === undefined ? {} : { blockedReason: safeReason(receipt.blockedReason) }),
    hostNetworkExecuted: receipt.hostNetworkExecuted === true,
    registryFetched: receipt.registryFetched === true,
    ...(receipt.hostAction?.contentType === undefined ? {} : { contentType: safeLabel(receipt.hostAction.contentType) }),
    ...(safeHttpStatus(receipt.hostAction?.status) === undefined ? {} : { statusCode: safeHttpStatus(receipt.hostAction?.status) }),
    ...(safeResponseBytes(receipt.hostAction?.responseBytes) === undefined
      ? {}
      : { responseBytes: safeResponseBytes(receipt.hostAction?.responseBytes) }),
  };
}

function executionState(
  handoff: PluginPackageMarketplaceRegistryFetchHandoff,
  receipt: PluginPackageRegistryFetchExecutionReceipt | undefined,
): PluginPackageMarketplaceRegistryFetchExecutionState {
  if (handoff.status === "blocked") return "blocked";
  if (receipt === undefined) return "not_executed";
  if (receipt.status === "completed") return "completed";
  if (receipt.status === "failed") return "failed";
  return "blocked";
}

function nextActions(state: PluginPackageMarketplaceRegistryFetchExecutionState): string[] {
  switch (state) {
    case "completed":
      return ["Inspect fetched registry metadata before using it as package planning input."];
    case "failed":
      return ["Review the failed registry fetch receipt and retry through a fresh approved host execution if appropriate."];
    case "blocked":
      return ["Resolve the blocked registry fetch handoff before retrying host execution."];
    case "not_executed":
      return ["Execute the approved registry fetch handoff through the injected host executor if the operator still approves."];
  }
}

function safeAction(value: unknown): PluginPackageMarketplaceRegistryFetchHandoff["action"] {
  return value === "import" || value === "update" || value === "keep" || value === "review" ? value : "<blocked>";
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

function safeReason(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9_:-]{1,80}$/i.test(value) && !looksSecret(value) ? value : "<redacted>";
}

function safeHttpStatus(value: unknown): number | undefined {
  return Number.isInteger(value) && typeof value === "number" && value >= 100 && value <= 599 ? value : undefined;
}

function safeResponseBytes(value: unknown): number | undefined {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= 1_000_000 ? value : undefined;
}

function timestampMs(value: unknown): number {
  if (typeof value !== "string") return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
