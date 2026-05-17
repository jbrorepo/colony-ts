import {
  planPluginPackageManifest,
  type PluginPackageImportPlan,
  type PluginPackagePlanActionRecord,
} from "./plugin-package-discovery";
import type { PluginPackageInstallUpdateReceipt } from "./plugin-package-execution";
import type { PluginPackageMarketplaceCatalogEntry } from "./plugin-package-marketplace";

export type PluginPackageActivationReadinessState =
  | "blocked"
  | "needs_review"
  | "needs_install_or_update_receipt"
  | "needs_activation_approval"
  | "ready_for_operator_handoff"
  | "active";

export interface PluginPackageMarketplaceActivationReadinessRequest {
  catalogId: string;
  entries: PluginPackageMarketplaceCatalogEntry[];
  completedInstallReceipts?: PluginPackageInstallUpdateReceipt[];
  approvedActivationSignatures?: string[];
  activeSidecarSignatures?: string[];
  installedSignatures?: Record<string, string>;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceActivationSidecarReadiness {
  sidecarId: string;
  kind: string;
  signature: string;
  state: PluginPackageActivationReadinessState;
  activation: false;
  sidecarStarted: false;
  installReceipt: {
    present: boolean;
    status: string;
    action: string;
    timestamp?: string;
  };
  approval: {
    present: boolean;
  };
  active: {
    present: boolean;
  };
  blockedReasons: string[];
  nextActions: string[];
}

export interface PluginPackageMarketplaceActivationEntryReadiness {
  entryId: string;
  displayName: string;
  package: {
    name: string;
    version: string;
    source: "<redacted>";
    digest: string;
  };
  sidecars: PluginPackageMarketplaceActivationSidecarReadiness[];
}

export interface PluginPackageMarketplaceActivationReadinessView {
  recordType: "mcp_plugin_package_activation_readiness_view";
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
  entries: PluginPackageMarketplaceActivationEntryReadiness[];
  warnings: string[];
}

const READINESS_WARNINGS = [
  "Activation readiness is local read-only metadata and performs no live registry fetch.",
  "Sidecar activation remains an explicit operator handoff after matching install/update receipt and exact activation approval.",
  "Readiness output redacts package sources and never exposes approval bodies, raw sidecar internals, credentials, or transport internals.",
];

export function createPluginPackageMarketplaceActivationReadiness(
  request: PluginPackageMarketplaceActivationReadinessRequest,
): PluginPackageMarketplaceActivationReadinessView {
  const timestamp = toIso(request.timestamp ?? new Date());
  const receipts = matchingReceiptMap(request.completedInstallReceipts);
  const approvals = safeSignatureSet(request.approvedActivationSignatures);
  const active = safeSignatureSet(request.activeSidecarSignatures);
  const entries = (Array.isArray(request.entries) ? request.entries : [])
    .map((entry) => renderEntry(entry, receipts, approvals, active, request.installedSignatures))
    .sort((left, right) => `${left.displayName}:${left.entryId}`.localeCompare(`${right.displayName}:${right.entryId}`));

  return freezeView({
    recordType: "mcp_plugin_package_activation_readiness_view",
    timestamp,
    catalogId: safeId(request.catalogId),
    approvalRequired: true,
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    totalEntries: Array.isArray(request.entries) ? request.entries.length : 0,
    shownEntries: entries.length,
    entries,
    warnings: [...READINESS_WARNINGS],
  });
}

function renderEntry(
  entry: PluginPackageMarketplaceCatalogEntry,
  receipts: Map<string, PluginPackageInstallUpdateReceipt>,
  approvals: Set<string>,
  active: Set<string>,
  installedSignatures: Record<string, string> | undefined,
): PluginPackageMarketplaceActivationEntryReadiness {
  const plan = planForEntry(entry, installedSignatures);
  const actions = plan.actions.length === 0
    ? [undefined]
    : plan.actions;
  const firstAction = plan.actions[0];
  return {
    entryId: safeId(entry?.entryId),
    displayName: safeLabel(entry?.displayName),
    package: {
      name: safeLabel(firstAction?.package.name ?? entry?.manifest?.packageName),
      version: safeLabel(firstAction?.package.version ?? entry?.manifest?.packageVersion),
      source: "<redacted>",
      digest: safeDigest(firstAction?.package.digest ?? entry?.manifest?.packageDigest),
    },
    sidecars: actions.map((action) => renderSidecar(action, receipts, approvals, active)),
  };
}

function renderSidecar(
  action: PluginPackagePlanActionRecord | undefined,
  receipts: Map<string, PluginPackageInstallUpdateReceipt>,
  approvals: Set<string>,
  active: Set<string>,
): PluginPackageMarketplaceActivationSidecarReadiness {
  const signature = safeSignature(action?.signature) ?? "<redacted>";
  const receipt = signature === "<redacted>" ? undefined : receipts.get(signature);
  const approvalPresent = signature !== "<redacted>" && approvals.has(signature);
  const activePresent = signature !== "<redacted>" && active.has(signature);
  const blockedReasons = safeTags(action?.reasons ?? []);
  const state = activationState(action, receipt, approvalPresent, activePresent);

  return {
    sidecarId: safeLabel(action?.sidecar.id),
    kind: safeLabel(action?.sidecar.kind),
    signature,
    state,
    activation: false,
    sidecarStarted: false,
    installReceipt: summarizeInstallReceipt(receipt),
    approval: {
      present: approvalPresent,
    },
    active: {
      present: activePresent,
    },
    blockedReasons,
    nextActions: nextActions(state),
  };
}

function activationState(
  action: PluginPackagePlanActionRecord | undefined,
  receipt: PluginPackageInstallUpdateReceipt | undefined,
  approvalPresent: boolean,
  activePresent: boolean,
): PluginPackageActivationReadinessState {
  if (action === undefined || action.action === "reject") return "blocked";
  if (action.action === "review") return "needs_review";
  if (action.action === "keep" || activePresent) return activePresent ? "active" : "needs_activation_approval";
  if (action.action !== "import" && action.action !== "update") return "blocked";
  if (receipt === undefined) return "needs_install_or_update_receipt";
  if (!approvalPresent) return "needs_activation_approval";
  return "ready_for_operator_handoff";
}

function nextActions(state: PluginPackageActivationReadinessState): string[] {
  switch (state) {
    case "blocked":
      return ["Resolve package descriptor validation failures before activation can be considered."];
    case "needs_review":
      return ["Review package descriptor and sidecar metadata before install/update or activation approval."];
    case "needs_install_or_update_receipt":
      return ["Run the approved install/update receipt path before activation readiness can proceed."];
    case "needs_activation_approval":
      return ["Collect exact operator activation approval for the trusted plugin signature."];
    case "ready_for_operator_handoff":
      return ["Create explicit operator handoff to start the sidecar through the approved supervisor path."];
    case "active":
      return ["Inspect running sidecar state through supervisor status; no activation is performed by this view."];
  }
}

function planForEntry(
  entry: PluginPackageMarketplaceCatalogEntry,
  installedSignatures: Record<string, string> | undefined,
): PluginPackageImportPlan {
  try {
    return planPluginPackageManifest(entry.manifest, { installedSignatures });
  } catch {
    return planPluginPackageManifest({
      packageName: safeLabel(entry?.manifest?.packageName),
      packageVersion: "<invalid>",
      packageSource: "<invalid>",
      packageDigest: "<invalid>",
      reviewed: false,
      sidecars: [],
    });
  }
}

function matchingReceiptMap(receipts: unknown): Map<string, PluginPackageInstallUpdateReceipt> {
  const result = new Map<string, PluginPackageInstallUpdateReceipt>();
  if (!Array.isArray(receipts)) return result;
  for (const receipt of receipts) {
    if (!isValidCompletedReceipt(receipt)) continue;
    result.set(receipt.signature, receipt);
  }
  return result;
}

function isValidCompletedReceipt(value: unknown): value is PluginPackageInstallUpdateReceipt {
  if (!isPlainRecord(value)) return false;
  return value.recordType === "mcp_plugin_package_install_update_receipt"
    && value.status === "completed"
    && (value.action === "import" || value.action === "update")
    && value.activation === false
    && value.sidecarStarted === false
    && value.registryFetched === false
    && safeSignature(value.signature) !== undefined
    && Array.isArray(value.steps)
    && value.steps.length > 0
    && value.steps.every((step) => isPlainRecord(step) && step.code === 0);
}

function summarizeInstallReceipt(
  receipt: PluginPackageInstallUpdateReceipt | undefined,
): PluginPackageMarketplaceActivationSidecarReadiness["installReceipt"] {
  if (receipt === undefined) {
    return {
      present: false,
      status: "<missing>",
      action: "<missing>",
    };
  }
  return {
    present: true,
    status: safeLabel(receipt.status),
    action: safeLabel(receipt.action),
    ...(receipt.timestamp === undefined ? {} : { timestamp: safeTimestamp(receipt.timestamp) }),
  };
}

function safeSignatureSet(values: unknown): Set<string> {
  if (!Array.isArray(values)) return new Set();
  return new Set(values.map(safeSignature).filter((value): value is string => value !== undefined));
}

function safeSignature(value: unknown): string | undefined {
  return typeof value === "string" && /^mcp-plugin:[a-f0-9]{24}$/i.test(value) ? value : undefined;
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

function safeTags(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(safeLabel).filter((value) => value !== "<redacted>"))).sort().slice(0, 24);
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

function freezeView(view: PluginPackageMarketplaceActivationReadinessView): PluginPackageMarketplaceActivationReadinessView {
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
