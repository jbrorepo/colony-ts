import type {
  PluginPackageMarketplaceMetadataBoundActivationReadinessEntry,
  PluginPackageMarketplaceMetadataBoundActivationReadinessView,
} from "./plugin-package-marketplace-metadata-bound-activation-readiness";
import type {
  PluginPackageMarketplaceMetadataBoundActivationHandoffExecutionReceipt,
} from "./plugin-package-marketplace-metadata-bound-activation-handoff-execution";

export type PluginPackageMarketplaceMetadataBoundActivationExecutionState =
  | "metadata_blocked"
  | "activation_not_ready"
  | "not_executed"
  | "blocked"
  | "failed"
  | "completed"
  | "active";

export interface PluginPackageMarketplaceMetadataBoundActivationExecutionStatusRequest {
  readinessView: PluginPackageMarketplaceMetadataBoundActivationReadinessView;
  executionReceipts?: PluginPackageMarketplaceMetadataBoundActivationHandoffExecutionReceipt[];
  activeSidecarSignatures?: string[];
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceMetadataBoundActivationExecutionStatusEntry {
  entryId: string;
  displayName: string;
  signature: string;
  state: PluginPackageMarketplaceMetadataBoundActivationExecutionState;
  readinessState: string;
  blockedReason?: string;
  metadataGate: {
    required: true;
    state: string;
    registryMetadataApplied: boolean;
    registryMetadataVerified: boolean;
  };
  activation: false;
  sidecarStarted: false;
  receipt: {
    present: boolean;
    recordType: string;
    status: string;
    blockedReason?: string;
    hostActionExecuted: boolean;
    activation: boolean;
    sidecarStarted: boolean;
    supervisorState: string;
    timestamp?: string;
  };
  nextActions: string[];
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

export interface PluginPackageMarketplaceMetadataBoundActivationExecutionStatusView {
  recordType: "mcp_plugin_package_marketplace_metadata_bound_activation_execution_status_view";
  timestamp: string;
  catalogId: string;
  readinessRecordType: string;
  readinessEntryCount: number;
  receiptCount: number;
  entries: PluginPackageMarketplaceMetadataBoundActivationExecutionStatusEntry[];
  summary: {
    total: number;
    metadataBlocked: number;
    activationNotReady: number;
    notExecuted: number;
    blocked: number;
    failed: number;
    completed: number;
    active: number;
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
  "Metadata-bound marketplace activation execution status is a read-only projection over Phase 256 readiness and Phase 258 execution receipts.",
  "The status view requires the metadata-bound install gate and activation readiness to remain ready before attaching execution receipts.",
  "The status view does not fetch registries, install packages, execute package code, activate sidecars, start sidecars, mutate catalogs, or persist credentials.",
];

export function createPluginPackageMarketplaceMetadataBoundActivationExecutionStatus(
  request: PluginPackageMarketplaceMetadataBoundActivationExecutionStatusRequest,
): PluginPackageMarketplaceMetadataBoundActivationExecutionStatusView {
  const timestamp = toIso(request.timestamp ?? new Date());
  const readiness = request.readinessView;
  const entries = Array.isArray(readiness?.entries) ? readiness.entries : [];
  const receipts = matchingReceiptMap(request.executionReceipts);
  const active = safeSignatureSet(request.activeSidecarSignatures);
  const projected = entries
    .map((entry) => projectEntry(entry, receipts, active))
    .sort((left, right) => `${left.displayName}:${left.entryId}`.localeCompare(`${right.displayName}:${right.entryId}`));

  return freezeView({
    recordType: "mcp_plugin_package_marketplace_metadata_bound_activation_execution_status_view",
    timestamp,
    catalogId: safeId(readiness?.catalogId),
    readinessRecordType: readiness?.recordType === "mcp_plugin_package_marketplace_metadata_bound_activation_readiness_view"
      ? readiness.recordType
      : "<redacted>",
    readinessEntryCount: entries.length,
    receiptCount: Array.isArray(request.executionReceipts) ? request.executionReceipts.length : 0,
    entries: projected,
    summary: summarizeEntries(projected),
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    warnings: [...STATUS_WARNINGS],
  });
}

function projectEntry(
  entry: PluginPackageMarketplaceMetadataBoundActivationReadinessEntry,
  receipts: Map<string, PluginPackageMarketplaceMetadataBoundActivationHandoffExecutionReceipt>,
  active: Set<string>,
): PluginPackageMarketplaceMetadataBoundActivationExecutionStatusEntry {
  const signature = safeSignature(entry?.signature);
  const prerequisiteBlock = prerequisiteBlockedReason(entry, signature);
  const receipt = prerequisiteBlock === undefined && signature !== "<redacted>" ? receipts.get(signature) : undefined;
  const matchingReceipt = receipt !== undefined && receiptMatchesReadiness(receipt, entry) ? receipt : undefined;
  const activePresent = prerequisiteBlock === undefined && signature !== "<redacted>" && active.has(signature);
  const state = executionState(entry, prerequisiteBlock, matchingReceipt, activePresent);

  return {
    entryId: safeId(entry?.entryId),
    displayName: safeLabel(entry?.displayName),
    signature,
    state,
    readinessState: safeLabel(entry?.state),
    ...(state === "metadata_blocked" || state === "activation_not_ready" || state === "blocked"
      ? { blockedReason: safeReason(prerequisiteBlock ?? matchingReceipt?.blockedReason) }
      : {}),
    metadataGate: {
      required: true,
      state: safeLabel(entry?.installExecution?.metadataGate?.state),
      registryMetadataApplied: entry?.installExecution?.metadataGate?.registryMetadataApplied === true,
      registryMetadataVerified: entry?.installExecution?.metadataGate?.registryMetadataVerified === true,
    },
    activation: false,
    sidecarStarted: false,
    receipt: summarizeReceipt(matchingReceipt),
    nextActions: nextActions(state),
    package: {
      name: safeLabel(entry?.package?.name),
      version: safeLabel(entry?.package?.version),
      source: "<redacted>",
      digest: safeDigest(entry?.package?.digest),
    },
    sidecar: {
      id: safeLabel(entry?.sidecar?.id),
      kind: safeLabel(entry?.sidecar?.kind),
    },
  };
}

function prerequisiteBlockedReason(
  entry: PluginPackageMarketplaceMetadataBoundActivationReadinessEntry,
  signature: string,
): string | undefined {
  if (
    entry?.installExecution?.metadataGate?.state !== "metadata_ready"
    || entry?.installExecution?.metadataGate?.registryMetadataApplied !== true
    || entry?.installExecution?.metadataGate?.registryMetadataVerified !== true
  ) {
    return "metadata_gate_not_ready";
  }
  if (
    entry?.installExecution?.state !== "completed"
    || entry?.installExecution?.receiptPresent !== true
    || entry?.installExecution?.packageInstalled !== true
  ) {
    return "metadata_bound_install_not_completed";
  }
  if (entry?.state === "active") return undefined;
  if (entry?.state !== "ready_for_activation_handoff") {
    return safeReason(entry?.blockedReason ?? "activation_readiness_not_ready");
  }
  if (signature === "<redacted>" || entry?.activationApproval?.present !== true) {
    return "activation_approval_not_ready";
  }
  return undefined;
}

function executionState(
  entry: PluginPackageMarketplaceMetadataBoundActivationReadinessEntry,
  prerequisiteBlock: string | undefined,
  receipt: PluginPackageMarketplaceMetadataBoundActivationHandoffExecutionReceipt | undefined,
  activePresent: boolean,
): PluginPackageMarketplaceMetadataBoundActivationExecutionState {
  if (prerequisiteBlock === "metadata_gate_not_ready") return "metadata_blocked";
  if (prerequisiteBlock !== undefined) return "activation_not_ready";
  if (entry?.state === "active" || activePresent) return "active";
  if (receipt === undefined) return "not_executed";
  if (receipt.status === "completed") return "completed";
  if (receipt.status === "failed") return "failed";
  return "blocked";
}

function nextActions(state: PluginPackageMarketplaceMetadataBoundActivationExecutionState): string[] {
  switch (state) {
    case "metadata_blocked":
      return ["Resolve the metadata-bound install gate before inspecting activation execution."];
    case "activation_not_ready":
      return ["Complete metadata-bound install/update and activation approval readiness before execution can be inspected."];
    case "not_executed":
      return ["Run the approved metadata-bound activation handoff before execution can be inspected."];
    case "blocked":
      return ["Resolve the blocked metadata-bound activation receipt before retrying the operator handoff."];
    case "failed":
      return ["Inspect the failed supervisor receipt and retry the metadata-bound activation handoff only after approval remains valid."];
    case "completed":
      return ["Inspect running sidecar state through supervisor status; do not rerun activation unless a fresh approval path requires it."];
    case "active":
      return ["Inspect running sidecar state through supervisor status; no activation is performed by this view."];
  }
}

function matchingReceiptMap(receipts: unknown): Map<string, PluginPackageMarketplaceMetadataBoundActivationHandoffExecutionReceipt> {
  const result = new Map<string, PluginPackageMarketplaceMetadataBoundActivationHandoffExecutionReceipt>();
  if (!Array.isArray(receipts)) return result;
  for (const receipt of receipts) {
    if (!isValidReceiptShape(receipt)) continue;
    const signature = safeSignature(receipt.handoff.sidecarSignature);
    if (signature === "<redacted>" || safeSignature(receipt.handoff.approvalSignature) !== signature) continue;
    const previous = result.get(signature);
    if (previous === undefined || timestampMs(receipt.timestamp) >= timestampMs(previous.timestamp)) {
      result.set(signature, receipt);
    }
  }
  return result;
}

function isValidReceiptShape(value: unknown): value is PluginPackageMarketplaceMetadataBoundActivationHandoffExecutionReceipt {
  if (!isPlainRecord(value)) return false;
  if (value.recordType !== "mcp_plugin_package_marketplace_metadata_bound_activation_handoff_execution_receipt") return false;
  if (value.status !== "completed" && value.status !== "failed" && value.status !== "blocked") return false;
  if (value.networkFetched !== false || value.packageInstalled !== false || value.packageExecuted !== false) return false;
  if (value.catalogMutated !== false || value.credentialsPersisted !== false) return false;
  if (value.requiresInjectedSupervisor !== true || value.metadataBoundInstallRequired !== true) return false;
  if (!isPlainRecord(value.handoff) || !isPlainRecord(value.package) || !isPlainRecord(value.sidecar)) return false;
  if (safeSignature(value.handoff.sidecarSignature) === "<redacted>") return false;
  if (looksSecret(value.package.name) || looksSecret(value.package.version) || looksSecret(value.sidecar.id) || looksSecret(value.sidecar.kind)) return false;
  return true;
}

function receiptMatchesReadiness(
  receipt: PluginPackageMarketplaceMetadataBoundActivationHandoffExecutionReceipt,
  entry: PluginPackageMarketplaceMetadataBoundActivationReadinessEntry,
): boolean {
  return receipt.handoff.entryId === entry.entryId
    && receipt.handoff.sidecarSignature === entry.signature
    && receipt.handoff.hostActionKind === "start_metadata_bound_plugin_package_sidecar"
    && safeLabel(receipt.package.name) === safeLabel(entry.package.name)
    && safeLabel(receipt.package.version) === safeLabel(entry.package.version)
    && safeDigest(receipt.package.digest) === safeDigest(entry.package.digest)
    && safeLabel(receipt.sidecar.id) === safeLabel(entry.sidecar.id)
    && safeLabel(receipt.sidecar.kind) === safeLabel(entry.sidecar.kind);
}

function summarizeReceipt(
  receipt: PluginPackageMarketplaceMetadataBoundActivationHandoffExecutionReceipt | undefined,
): PluginPackageMarketplaceMetadataBoundActivationExecutionStatusEntry["receipt"] {
  if (receipt === undefined) {
    return {
      present: false,
      recordType: "<missing>",
      status: "<missing>",
      hostActionExecuted: false,
      activation: false,
      sidecarStarted: false,
      supervisorState: "not_started",
    };
  }
  return {
    present: true,
    recordType: receipt.recordType,
    status: safeLabel(receipt.status),
    ...(receipt.blockedReason === undefined ? {} : { blockedReason: safeReason(receipt.blockedReason) }),
    hostActionExecuted: receipt.hostActionExecuted === true,
    activation: receipt.activation === true,
    sidecarStarted: receipt.sidecarStarted === true,
    supervisorState: safeLabel(receipt.delegatedActivationReceipt?.supervisorState),
    timestamp: safeTimestamp(receipt.timestamp),
  };
}

function summarizeEntries(
  entries: PluginPackageMarketplaceMetadataBoundActivationExecutionStatusEntry[],
): PluginPackageMarketplaceMetadataBoundActivationExecutionStatusView["summary"] {
  return {
    total: entries.length,
    metadataBlocked: entries.filter((entry) => entry.state === "metadata_blocked").length,
    activationNotReady: entries.filter((entry) => entry.state === "activation_not_ready").length,
    notExecuted: entries.filter((entry) => entry.state === "not_executed").length,
    blocked: entries.filter((entry) => entry.state === "blocked").length,
    failed: entries.filter((entry) => entry.state === "failed").length,
    completed: entries.filter((entry) => entry.state === "completed").length,
    active: entries.filter((entry) => entry.state === "active").length,
  };
}

function safeSignatureSet(values: unknown): Set<string> {
  if (!Array.isArray(values)) return new Set();
  return new Set(values.map(safeSignature).filter((value) => value !== "<redacted>"));
}

function safeSignature(value: unknown): string {
  return typeof value === "string" && /^mcp-plugin:[a-f0-9]{24}$/i.test(value) ? value : "<redacted>";
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

function safeTimestamp(value: unknown): string {
  if (typeof value !== "string" || value.length > 40 || /[\0\r\n]/.test(value)) return "<redacted>";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "<redacted>";
}

function timestampMs(value: unknown): number {
  if (typeof value !== "string") return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid timestamp");
  return date.toISOString();
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

function freezeView(
  view: PluginPackageMarketplaceMetadataBoundActivationExecutionStatusView,
): PluginPackageMarketplaceMetadataBoundActivationExecutionStatusView {
  deepFreeze(view);
  return view;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  Object.freeze(value);
  for (const entry of Object.values(value)) {
    deepFreeze(entry);
  }
  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
