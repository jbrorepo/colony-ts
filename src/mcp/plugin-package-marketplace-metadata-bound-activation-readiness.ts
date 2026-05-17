import type {
  PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatusEntry,
  PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatusView,
} from "./plugin-package-marketplace-metadata-bound-install-execution-status";
import type { PluginPackageMarketplaceMetadataBoundInstallUpdateHandoff } from "./plugin-package-marketplace-metadata-bound-install-handoff";

export type PluginPackageMarketplaceMetadataBoundActivationReadinessState =
  | "metadata_blocked"
  | "install_not_executed"
  | "install_blocked"
  | "install_failed"
  | "needs_activation_approval"
  | "ready_for_activation_handoff"
  | "active";

export type PluginPackageMarketplaceMetadataBoundActivationNextAction =
  | "resolve_metadata_gate"
  | "run_metadata_bound_install_update"
  | "inspect_install_block"
  | "inspect_install_failure"
  | "collect_activation_approval"
  | "create_activation_handoff"
  | "inspect_active_sidecar";

export interface PluginPackageMarketplaceMetadataBoundActivationReadinessRequest {
  installExecutionStatusView: PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatusView;
  handoffs: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoff[];
  approvedActivationSignatures?: string[];
  activeSidecarSignatures?: string[];
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceMetadataBoundActivationReadinessEntry {
  entryId: string;
  displayName: string;
  signature: string;
  state: PluginPackageMarketplaceMetadataBoundActivationReadinessState;
  blockedReason?: string;
  installExecution: {
    state: string;
    receiptPresent: boolean;
    packageInstalled: boolean;
    metadataGate: {
      required: true;
      state: string;
      registryMetadataApplied: boolean;
      registryMetadataVerified: boolean;
    };
  };
  activationApproval: {
    required: true;
    present: boolean;
  };
  active: {
    present: boolean;
  };
  nextAction: PluginPackageMarketplaceMetadataBoundActivationNextAction;
  activation: false;
  sidecarStarted: false;
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

export interface PluginPackageMarketplaceMetadataBoundActivationReadinessView {
  recordType: "mcp_plugin_package_marketplace_metadata_bound_activation_readiness_view";
  timestamp: string;
  catalogId: string;
  installStatusRecordType: string;
  installStatusEntryCount: number;
  handoffCount: number;
  entries: PluginPackageMarketplaceMetadataBoundActivationReadinessEntry[];
  summary: {
    total: number;
    metadataBlocked: number;
    installNotExecuted: number;
    installBlocked: number;
    installFailed: number;
    needsActivationApproval: number;
    readyForActivationHandoff: number;
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

const READINESS_WARNINGS = [
  "Metadata-bound activation readiness is a read-only projection over metadata-bound install/update status.",
  "A completed metadata-bound install/update status is required before activation approval or handoff can be considered.",
  "The readiness view does not fetch registries, install packages, execute package code, activate sidecars, start sidecars, mutate catalogs, or persist credentials.",
];

export function createPluginPackageMarketplaceMetadataBoundActivationReadiness(
  request: PluginPackageMarketplaceMetadataBoundActivationReadinessRequest,
): PluginPackageMarketplaceMetadataBoundActivationReadinessView {
  const timestamp = toIso(request.timestamp ?? new Date());
  const installStatus = request.installExecutionStatusView;
  const entries = Array.isArray(installStatus?.entries) ? installStatus.entries : [];
  const handoffs = Array.isArray(request.handoffs) ? request.handoffs : [];
  const handoffSignatures = handoffSignatureMap(handoffs);
  const approvals = safeSignatureSet(request.approvedActivationSignatures);
  const active = safeSignatureSet(request.activeSidecarSignatures);
  const projected = entries
    .map((entry) => projectEntry(entry, handoffSignatures, approvals, active))
    .sort((left, right) => `${left.displayName}:${left.entryId}`.localeCompare(`${right.displayName}:${right.entryId}`));

  return {
    recordType: "mcp_plugin_package_marketplace_metadata_bound_activation_readiness_view",
    timestamp,
    catalogId: safeId(installStatus?.catalogId),
    installStatusRecordType: installStatus?.recordType === "mcp_plugin_package_marketplace_metadata_bound_install_update_execution_status_view"
      ? installStatus.recordType
      : "<redacted>",
    installStatusEntryCount: entries.length,
    handoffCount: handoffs.length,
    entries: projected,
    summary: summarizeEntries(projected),
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    warnings: [...READINESS_WARNINGS],
  };
}

function projectEntry(
  entry: PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatusEntry,
  handoffSignatures: Map<string, string>,
  approvals: Set<string>,
  active: Set<string>,
): PluginPackageMarketplaceMetadataBoundActivationReadinessEntry {
  const signature = handoffSignatures.get(entryKey(entry)) ?? "<redacted>";
  const approvalPresent = signature !== "<redacted>" && approvals.has(signature);
  const activePresent = signature !== "<redacted>" && active.has(signature);
  const state = readinessState(entry, signature, approvalPresent, activePresent);
  const blockedReason = blockedReasonFor(entry, state, signature);

  return {
    entryId: safeId(entry?.entryId),
    displayName: safeLabel(entry?.displayName),
    signature,
    state,
    ...(blockedReason === undefined ? {} : { blockedReason }),
    installExecution: {
      state: safeLabel(entry?.state),
      receiptPresent: entry?.receipt?.present === true,
      packageInstalled: entry?.receipt?.packageInstalled === true,
      metadataGate: {
        required: true,
        state: safeLabel(entry?.metadataGate?.state),
        registryMetadataApplied: entry?.metadataGate?.registryMetadataApplied === true,
        registryMetadataVerified: entry?.metadataGate?.registryMetadataVerified === true,
      },
    },
    activationApproval: {
      required: true,
      present: approvalPresent,
    },
    active: {
      present: activePresent,
    },
    nextAction: nextAction(state),
    activation: false,
    sidecarStarted: false,
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

function readinessState(
  entry: PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatusEntry,
  signature: string,
  approvalPresent: boolean,
  activePresent: boolean,
): PluginPackageMarketplaceMetadataBoundActivationReadinessState {
  if (entry?.state === "metadata_blocked") return "metadata_blocked";
  if (entry?.state === "not_executed") return "install_not_executed";
  if (entry?.state === "failed") return "install_failed";
  if (entry?.state === "blocked") return "install_blocked";
  if (entry?.state !== "completed") return "install_blocked";
  if (signature === "<redacted>") return "install_blocked";
  if (activePresent) return "active";
  if (approvalPresent) return "ready_for_activation_handoff";
  return "needs_activation_approval";
}

function blockedReasonFor(
  entry: PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatusEntry,
  state: PluginPackageMarketplaceMetadataBoundActivationReadinessState,
  signature: string,
): string | undefined {
  if (state === "install_blocked" && entry?.state === "completed" && signature === "<redacted>") {
    return "matching_metadata_bound_handoff_missing";
  }
  if (
    state === "metadata_blocked"
    || state === "install_blocked"
    || state === "install_failed"
  ) {
    return safeReason(entry?.blockedReason ?? entry?.receipt?.blockedReason);
  }
  return undefined;
}

function nextAction(
  state: PluginPackageMarketplaceMetadataBoundActivationReadinessState,
): PluginPackageMarketplaceMetadataBoundActivationNextAction {
  switch (state) {
    case "metadata_blocked":
      return "resolve_metadata_gate";
    case "install_not_executed":
      return "run_metadata_bound_install_update";
    case "install_blocked":
      return "inspect_install_block";
    case "install_failed":
      return "inspect_install_failure";
    case "needs_activation_approval":
      return "collect_activation_approval";
    case "ready_for_activation_handoff":
      return "create_activation_handoff";
    case "active":
      return "inspect_active_sidecar";
  }
}

function handoffSignatureMap(
  handoffs: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoff[],
): Map<string, string> {
  const result = new Map<string, string>();
  for (const handoff of handoffs) {
    if (!isPlainRecord(handoff) || handoff.recordType !== "mcp_plugin_package_marketplace_metadata_bound_install_update_handoff") {
      continue;
    }
    if (
      handoff.status !== "ready"
      || handoff.metadataGate?.state !== "metadata_ready"
      || handoff.installUpdateHandoff?.status !== "ready"
    ) {
      continue;
    }
    const signature = safeSignature(handoff.installUpdateHandoff?.approval?.signature);
    if (signature === "<redacted>") continue;
    result.set(handoffKey(handoff), signature);
  }
  return result;
}

function entryKey(entry: PluginPackageMarketplaceMetadataBoundInstallUpdateExecutionStatusEntry): string {
  return [
    safeId(entry?.entryId),
    safeLabel(entry?.package?.name),
    safeLabel(entry?.package?.version),
    safeDigest(entry?.package?.digest),
    safeLabel(entry?.sidecar?.id),
    safeLabel(entry?.sidecar?.kind),
  ].join("|");
}

function handoffKey(handoff: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoff): string {
  return [
    safeId(handoff?.entry?.entryId),
    safeLabel(handoff?.installUpdateHandoff?.package?.name),
    safeLabel(handoff?.installUpdateHandoff?.package?.version),
    safeDigest(handoff?.installUpdateHandoff?.package?.digest),
    safeLabel(handoff?.installUpdateHandoff?.sidecar?.id),
    safeLabel(handoff?.installUpdateHandoff?.sidecar?.kind),
  ].join("|");
}

function summarizeEntries(
  entries: PluginPackageMarketplaceMetadataBoundActivationReadinessEntry[],
): PluginPackageMarketplaceMetadataBoundActivationReadinessView["summary"] {
  return {
    total: entries.length,
    metadataBlocked: entries.filter((entry) => entry.state === "metadata_blocked").length,
    installNotExecuted: entries.filter((entry) => entry.state === "install_not_executed").length,
    installBlocked: entries.filter((entry) => entry.state === "install_blocked").length,
    installFailed: entries.filter((entry) => entry.state === "install_failed").length,
    needsActivationApproval: entries.filter((entry) => entry.state === "needs_activation_approval").length,
    readyForActivationHandoff: entries.filter((entry) => entry.state === "ready_for_activation_handoff").length,
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
