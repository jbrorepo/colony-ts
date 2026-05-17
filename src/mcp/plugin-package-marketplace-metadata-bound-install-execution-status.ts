import type { PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffExecutionReceipt } from "./plugin-package-marketplace-metadata-bound-install-handoff-execution";
import type { PluginPackageMarketplaceMetadataBoundInstallUpdateHandoff } from "./plugin-package-marketplace-metadata-bound-install-handoff";

export type PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionState =
  | "metadata_blocked"
  | "not_executed"
  | "blocked"
  | "failed"
  | "completed";

export type PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionNextAction =
  | "resolve_metadata_gate"
  | "run_approved_metadata_bound_install_update_handoff"
  | "inspect_blocked_receipt"
  | "inspect_failed_receipt"
  | "verify_installed_package";

export interface PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatusRequest {
  catalogId: string;
  handoffs: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoff[];
  receipts?: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffExecutionReceipt[];
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatusEntry {
  entryId: string;
  displayName: string;
  state: PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionState;
  blockedReason?: string;
  metadataGate: {
    required: true;
    state: string;
    registryMetadataApplied: boolean;
    registryMetadataVerified: boolean;
  };
  handoffStatus: string;
  receipt: {
    present: boolean;
    recordType: string;
    status: string;
    blockedReason?: string;
    hostActionExecuted: boolean;
    packageInstalled: boolean;
  };
  nextAction: PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionNextAction;
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
}

export interface PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatusView {
  recordType: "mcp_plugin_package_marketplace_metadata_bound_install_update_execution_status_view";
  timestamp: string;
  catalogId: string;
  handoffCount: number;
  receiptCount: number;
  entries: PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatusEntry[];
  summary: {
    total: number;
    metadataBlocked: number;
    notExecuted: number;
    blocked: number;
    failed: number;
    completed: number;
  };
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
  "Metadata-bound marketplace install/update execution status is a read-only projection over Phase 253 handoffs and Phase 254 execution receipts.",
  "The status view requires the metadata gate to remain ready before attaching execution receipts.",
  "The status view does not fetch registries, install packages, execute package code, activate sidecars, start sidecars, mutate catalogs, or persist credentials.",
];

export function createPluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatus(
  request: PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatusRequest,
): PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatusView {
  const timestamp = toIso(request.timestamp ?? new Date());
  const catalogId = safeId(request.catalogId);
  const handoffs = Array.isArray(request.handoffs) ? request.handoffs : [];
  const receipts = Array.isArray(request.receipts) ? request.receipts : [];
  const entries = handoffs.map((handoff) => projectHandoff(catalogId, handoff, receipts));

  return {
    recordType: "mcp_plugin_package_marketplace_metadata_bound_install_update_execution_status_view",
    timestamp,
    catalogId,
    handoffCount: handoffs.length,
    receiptCount: receipts.length,
    entries,
    summary: summarizeEntries(entries),
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
  catalogId: string,
  handoff: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoff,
  receipts: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffExecutionReceipt[],
): PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatusEntry {
  const metadataBlocked = metadataBlockReason(catalogId, handoff);
  const receipt = metadataBlocked === undefined ? latestMatchingReceipt(handoff, receipts) : undefined;
  const state = executionState(metadataBlocked, receipt);
  const receiptSummary = summarizeReceipt(receipt);

  return {
    entryId: safeId(handoff?.entry?.entryId),
    displayName: safeLabel(handoff?.entry?.displayName),
    state,
    ...(metadataBlocked === undefined && state !== "blocked"
      ? {}
      : { blockedReason: safeReason(metadataBlocked ?? receipt?.blockedReason) }),
    metadataGate: {
      required: true,
      state: safeLabel(handoff?.metadataGate?.state),
      registryMetadataApplied: handoff?.metadataGate?.registryMetadataApplied === true,
      registryMetadataVerified: handoff?.metadataGate?.registryMetadataVerified === true,
    },
    handoffStatus: safeLabel(handoff?.status),
    receipt: receiptSummary,
    nextAction: nextAction(state),
    package: {
      name: safeLabel(handoff?.installUpdateHandoff?.package?.name),
      version: safeLabel(handoff?.installUpdateHandoff?.package?.version),
      source: "<redacted>",
      digest: safeDigest(handoff?.installUpdateHandoff?.package?.digest),
    },
    sidecar: {
      id: safeLabel(handoff?.installUpdateHandoff?.sidecar?.id),
      kind: safeLabel(handoff?.installUpdateHandoff?.sidecar?.kind),
    },
  };
}

function metadataBlockReason(
  catalogId: string,
  handoff: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoff,
): string | undefined {
  if (
    !isPlainRecord(handoff)
    || handoff.recordType !== "mcp_plugin_package_marketplace_metadata_bound_install_update_handoff"
    || safeId(handoff.catalogId) !== catalogId
  ) {
    return "metadata_bound_handoff_not_ready";
  }
  if (
    handoff.status !== "ready"
    || handoff.metadataGate?.required !== true
    || handoff.metadataGate?.state !== "metadata_ready"
    || handoff.metadataGate?.registryMetadataApplied !== true
    || handoff.metadataGate?.registryMetadataVerified !== true
  ) {
    return handoff.blockedReason ?? "metadata_bound_handoff_not_ready";
  }
  if (
    !isPlainRecord(handoff.installUpdateHandoff)
    || handoff.installUpdateHandoff.recordType !== "mcp_plugin_package_install_update_handoff"
    || handoff.installUpdateHandoff.status !== "ready"
  ) {
    return "install_update_handoff_not_ready";
  }
  return undefined;
}

function latestMatchingReceipt(
  handoff: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoff,
  receipts: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffExecutionReceipt[],
): PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffExecutionReceipt | undefined {
  return receipts
    .filter((receipt) => matchesHandoff(handoff, receipt))
    .sort((left, right) => timestampMs(right.timestamp) - timestampMs(left.timestamp))[0];
}

function matchesHandoff(
  handoff: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoff,
  receipt: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffExecutionReceipt,
): boolean {
  return isPlainRecord(receipt)
    && receipt.recordType === "mcp_plugin_package_marketplace_metadata_bound_install_update_handoff_execution_receipt"
    && receipt.metadataGate?.required === true
    && safeLabel(receipt.metadataGate?.state) === "metadata_ready"
    && receipt.metadataGate?.registryMetadataApplied === true
    && receipt.metadataGate?.registryMetadataVerified === true
    && safeLabel(receipt.package?.name) === safeLabel(handoff.installUpdateHandoff?.package?.name)
    && safeLabel(receipt.package?.version) === safeLabel(handoff.installUpdateHandoff?.package?.version)
    && safeDigest(receipt.package?.digest) === safeDigest(handoff.installUpdateHandoff?.package?.digest)
    && safeLabel(receipt.sidecar?.id) === safeLabel(handoff.installUpdateHandoff?.sidecar?.id)
    && safeLabel(receipt.sidecar?.kind) === safeLabel(handoff.installUpdateHandoff?.sidecar?.kind);
}

function summarizeReceipt(
  receipt: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffExecutionReceipt | undefined,
): PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatusEntry["receipt"] {
  if (receipt === undefined) {
    return {
      present: false,
      recordType: "<missing>",
      status: "<missing>",
      hostActionExecuted: false,
      packageInstalled: false,
    };
  }
  return {
    present: true,
    recordType: receipt.recordType === "mcp_plugin_package_marketplace_metadata_bound_install_update_handoff_execution_receipt"
      ? receipt.recordType
      : "<redacted>",
    status: safeLabel(receipt.status),
    ...(receipt.blockedReason === undefined ? {} : { blockedReason: safeReason(receipt.blockedReason) }),
    hostActionExecuted: receipt.hostActionExecuted === true,
    packageInstalled: receipt.packageInstalled === true,
  };
}

function executionState(
  metadataBlocked: string | undefined,
  receipt: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffExecutionReceipt | undefined,
): PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionState {
  if (metadataBlocked !== undefined) return "metadata_blocked";
  if (receipt === undefined) return "not_executed";
  if (receipt.status === "completed") return "completed";
  if (receipt.status === "failed") return "failed";
  return "blocked";
}

function nextAction(
  state: PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionState,
): PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionNextAction {
  switch (state) {
    case "metadata_blocked":
      return "resolve_metadata_gate";
    case "not_executed":
      return "run_approved_metadata_bound_install_update_handoff";
    case "blocked":
      return "inspect_blocked_receipt";
    case "failed":
      return "inspect_failed_receipt";
    case "completed":
      return "verify_installed_package";
  }
}

function summarizeEntries(
  entries: PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatusEntry[],
): PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatusView["summary"] {
  return {
    total: entries.length,
    metadataBlocked: entries.filter((entry) => entry.state === "metadata_blocked").length,
    notExecuted: entries.filter((entry) => entry.state === "not_executed").length,
    blocked: entries.filter((entry) => entry.state === "blocked").length,
    failed: entries.filter((entry) => entry.state === "failed").length,
    completed: entries.filter((entry) => entry.state === "completed").length,
  };
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

function safeReason(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9_:-]{1,80}$/i.test(value) && !looksSecret(value) ? value : "<redacted>";
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
