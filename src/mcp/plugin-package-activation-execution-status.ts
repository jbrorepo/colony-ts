import type {
  PluginPackageMarketplaceActivationEntryReadiness,
  PluginPackageMarketplaceActivationReadinessView,
  PluginPackageMarketplaceActivationSidecarReadiness,
} from "./plugin-package-activation-readiness";
import type { PluginPackageMarketplaceActivationHandoffExecutionReceipt } from "./plugin-package-activation-handoff-execution";

export type PluginPackageMarketplaceActivationExecutionState =
  | "not_executed"
  | "blocked"
  | "failed"
  | "completed"
  | "active";

export interface PluginPackageMarketplaceActivationExecutionStatusRequest {
  readinessView: PluginPackageMarketplaceActivationReadinessView;
  executionReceipts?: PluginPackageMarketplaceActivationHandoffExecutionReceipt[];
  activeSidecarSignatures?: string[];
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceActivationExecutionSidecarStatus {
  sidecarId: string;
  kind: string;
  signature: string;
  state: PluginPackageMarketplaceActivationExecutionState;
  readinessState: string;
  activation: false;
  sidecarStarted: false;
  receipt: {
    present: boolean;
    status: string;
    blockedReason?: string;
    hostActionExecuted: boolean;
    activation: boolean;
    sidecarStarted: boolean;
    supervisorState: string;
    timestamp?: string;
  };
  nextActions: string[];
}

export interface PluginPackageMarketplaceActivationExecutionEntryStatus {
  entryId: string;
  displayName: string;
  package: {
    name: string;
    version: string;
    source: "<redacted>";
    digest: string;
  };
  sidecars: PluginPackageMarketplaceActivationExecutionSidecarStatus[];
}

export interface PluginPackageMarketplaceActivationExecutionStatusView {
  recordType: "mcp_plugin_package_activation_execution_status_view";
  timestamp: string;
  catalogId: string;
  approvalRequired: true;
  networkFetched: false;
  packageInstalled: false;
  packageExecuted: false;
  activation: false;
  sidecarStarted: false;
  catalogMutated: false;
  credentialsPersisted: false;
  totalEntries: number;
  shownEntries: number;
  entries: PluginPackageMarketplaceActivationExecutionEntryStatus[];
  warnings: string[];
}

const STATUS_WARNINGS = [
  "Activation execution status is read-only receipt projection and performs no sidecar start by itself.",
  "Only execution receipts that match the readiness entry, package, sidecar, and trusted signature are attached.",
  "Package sources, approval reasons, supervisor internals, credentials, and transport details remain redacted.",
];

export function createPluginPackageMarketplaceActivationExecutionStatus(
  request: PluginPackageMarketplaceActivationExecutionStatusRequest,
): PluginPackageMarketplaceActivationExecutionStatusView {
  const timestamp = toIso(request.timestamp ?? new Date());
  const receipts = matchingReceiptMap(request.executionReceipts);
  const active = safeSignatureSet(request.activeSidecarSignatures);
  const entries = (Array.isArray(request.readinessView?.entries) ? request.readinessView.entries : [])
    .map((entry) => renderEntry(entry, receipts, active))
    .sort((left, right) => `${left.displayName}:${left.entryId}`.localeCompare(`${right.displayName}:${right.entryId}`));

  return freezeView({
    recordType: "mcp_plugin_package_activation_execution_status_view",
    timestamp,
    catalogId: safeId(request.readinessView?.catalogId),
    approvalRequired: true,
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    totalEntries: Array.isArray(request.readinessView?.entries) ? request.readinessView.entries.length : 0,
    shownEntries: entries.length,
    entries,
    warnings: [...STATUS_WARNINGS],
  });
}

function renderEntry(
  entry: PluginPackageMarketplaceActivationEntryReadiness,
  receipts: Map<string, PluginPackageMarketplaceActivationHandoffExecutionReceipt>,
  active: Set<string>,
): PluginPackageMarketplaceActivationExecutionEntryStatus {
  return {
    entryId: safeId(entry?.entryId),
    displayName: safeLabel(entry?.displayName),
    package: {
      name: safeLabel(entry?.package?.name),
      version: safeLabel(entry?.package?.version),
      source: "<redacted>",
      digest: safeDigest(entry?.package?.digest),
    },
    sidecars: (Array.isArray(entry?.sidecars) ? entry.sidecars : []).map((sidecar) => renderSidecar(entry, sidecar, receipts, active)),
  };
}

function renderSidecar(
  entry: PluginPackageMarketplaceActivationEntryReadiness,
  sidecar: PluginPackageMarketplaceActivationSidecarReadiness,
  receipts: Map<string, PluginPackageMarketplaceActivationHandoffExecutionReceipt>,
  active: Set<string>,
): PluginPackageMarketplaceActivationExecutionSidecarStatus {
  const signature = safeSignature(sidecar?.signature);
  const receipt = signature === "<redacted>" ? undefined : receipts.get(signature);
  const matchingReceipt = receipt !== undefined && receiptMatchesReadiness(receipt, entry, sidecar) ? receipt : undefined;
  const activePresent = signature !== "<redacted>" && active.has(signature);
  const state = activePresent ? "active" : statusState(matchingReceipt);

  return {
    sidecarId: safeLabel(sidecar?.sidecarId),
    kind: safeLabel(sidecar?.kind),
    signature,
    state,
    readinessState: safeLabel(sidecar?.state),
    activation: false,
    sidecarStarted: false,
    receipt: summarizeReceipt(matchingReceipt),
    nextActions: nextActions(state),
  };
}

function statusState(
  receipt: PluginPackageMarketplaceActivationHandoffExecutionReceipt | undefined,
): PluginPackageMarketplaceActivationExecutionState {
  if (receipt === undefined) return "not_executed";
  if (receipt.status === "completed") return "completed";
  if (receipt.status === "failed") return "failed";
  if (receipt.status === "blocked") return "blocked";
  return "not_executed";
}

function nextActions(state: PluginPackageMarketplaceActivationExecutionState): string[] {
  switch (state) {
    case "not_executed":
      return ["Create an explicit activation handoff before execution can be inspected."];
    case "blocked":
      return ["Resolve the blocked activation receipt before retrying the operator handoff."];
    case "failed":
      return ["Inspect the failed supervisor receipt and retry the activation handoff only after approval remains valid."];
    case "completed":
      return ["Inspect running sidecar state through supervisor status; do not rerun activation unless a fresh approval path requires it."];
    case "active":
      return ["Inspect running sidecar state through supervisor status; no activation is performed by this view."];
  }
}

function matchingReceiptMap(receipts: unknown): Map<string, PluginPackageMarketplaceActivationHandoffExecutionReceipt> {
  const result = new Map<string, PluginPackageMarketplaceActivationHandoffExecutionReceipt>();
  if (!Array.isArray(receipts)) return result;
  for (const receipt of receipts) {
    if (!isValidReceiptShape(receipt)) continue;
    const signature = safeSignature(receipt.handoff.sidecarSignature);
    if (signature === "<redacted>" || receipt.handoff.approvalSignature !== signature) continue;
    const previous = result.get(signature);
    if (previous === undefined || receiptTime(receipt) >= receiptTime(previous)) {
      result.set(signature, receipt);
    }
  }
  return result;
}

function isValidReceiptShape(value: unknown): value is PluginPackageMarketplaceActivationHandoffExecutionReceipt {
  if (!isPlainRecord(value)) return false;
  if (value.recordType !== "mcp_plugin_package_activation_handoff_execution_receipt") return false;
  if (value.status !== "completed" && value.status !== "failed" && value.status !== "blocked") return false;
  if (value.networkFetched !== false || value.packageInstalled !== false || value.packageExecuted !== false) return false;
  if (value.catalogMutated !== false || value.credentialsPersisted !== false) return false;
  if (value.requiresInjectedSupervisor !== true) return false;
  if (!isPlainRecord(value.handoff) || !isPlainRecord(value.package) || !isPlainRecord(value.sidecar)) return false;
  if (safeSignature(value.handoff.sidecarSignature) === "<redacted>") return false;
  if (looksSecret(value.package.name) || looksSecret(value.package.version) || looksSecret(value.sidecar.id) || looksSecret(value.sidecar.kind)) return false;
  return true;
}

function receiptMatchesReadiness(
  receipt: PluginPackageMarketplaceActivationHandoffExecutionReceipt,
  entry: PluginPackageMarketplaceActivationEntryReadiness,
  sidecar: PluginPackageMarketplaceActivationSidecarReadiness,
): boolean {
  return receipt.handoff.entryId === entry.entryId
    && receipt.handoff.sidecarSignature === sidecar.signature
    && safeLabel(receipt.package.name) === safeLabel(entry.package.name)
    && safeLabel(receipt.package.version) === safeLabel(entry.package.version)
    && safeDigest(receipt.package.digest) === safeDigest(entry.package.digest)
    && safeLabel(receipt.sidecar.id) === safeLabel(sidecar.sidecarId)
    && safeLabel(receipt.sidecar.kind) === safeLabel(sidecar.kind);
}

function summarizeReceipt(
  receipt: PluginPackageMarketplaceActivationHandoffExecutionReceipt | undefined,
): PluginPackageMarketplaceActivationExecutionSidecarStatus["receipt"] {
  if (receipt === undefined) {
    return {
      present: false,
      status: "<missing>",
      hostActionExecuted: false,
      activation: false,
      sidecarStarted: false,
      supervisorState: "not_started",
    };
  }
  return {
    present: true,
    status: safeLabel(receipt.status),
    ...(receipt.blockedReason === undefined ? {} : { blockedReason: safeLabel(receipt.blockedReason) }),
    hostActionExecuted: receipt.hostActionExecuted === true,
    activation: receipt.activation === true,
    sidecarStarted: receipt.sidecarStarted === true,
    supervisorState: safeLabel(receipt.activationReceipt?.supervisorState),
    timestamp: safeTimestamp(receipt.timestamp),
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

function safeTimestamp(value: unknown): string {
  if (typeof value !== "string" || value.length > 40 || /[\0\r\n]/.test(value)) return "<redacted>";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "<redacted>";
}

function receiptTime(receipt: PluginPackageMarketplaceActivationHandoffExecutionReceipt): number {
  const date = new Date(receipt.timestamp);
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
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
  if (/^[A-Za-z0-9+/=_-]{32,}$/.test(compact)) {
    return new Set(compact).size >= 16;
  }
  return false;
}

function freezeView(
  view: PluginPackageMarketplaceActivationExecutionStatusView,
): PluginPackageMarketplaceActivationExecutionStatusView {
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
