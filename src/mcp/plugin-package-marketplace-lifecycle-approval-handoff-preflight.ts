import type {
  PluginPackageMarketplaceLifecycleApprovalHandoffDescriptor,
  PluginPackageMarketplaceLifecycleApprovalHandoffOperatorAction,
  PluginPackageMarketplaceLifecycleApprovalHandoffState,
  PluginPackageMarketplaceLifecycleApprovalHandoffView,
} from "./plugin-package-marketplace-lifecycle-approval-handoff";
import type { PluginPackageMarketplaceLifecycleHandoffActionKind } from "./plugin-package-marketplace-lifecycle-handoff";
import type { PluginPackageMarketplaceLifecycleRunbookPhase } from "./plugin-package-marketplace-lifecycle-runbook";
import type { PluginPackageMarketplaceLifecycleState } from "./plugin-package-marketplace-lifecycle-status";

export type PluginPackageMarketplaceLifecycleApprovalHandoffPreflightState =
  | "ready_for_host_handoff_preflight"
  | "blocked_missing_approval"
  | "blocked_approval_mismatch"
  | "blocked_approval_expired";

export type PluginPackageMarketplaceLifecycleApprovalHandoffPreflightNextAction =
  | "request_explicit_host_handoff"
  | "collect_matching_approval"
  | "refresh_expired_approval";

export type PluginPackageMarketplaceLifecycleApprovalHandoffPreflightHostKind =
  | "metadata"
  | "install_update"
  | "activation_readiness"
  | "activation"
  | "approval_blocker";

export interface PluginPackageMarketplaceLifecycleApprovalHandoffPreflightRequest {
  approvalHandoffView: PluginPackageMarketplaceLifecycleApprovalHandoffView;
  audience?: "operator" | "reviewer";
  includePreflightStates?: PluginPackageMarketplaceLifecycleApprovalHandoffPreflightState[];
  maxPreflights?: number;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceLifecycleApprovalHandoffPreflightItem {
  preflightId: string;
  handoffId: string;
  reviewId: string;
  packetId: string;
  stepId: string;
  phase: PluginPackageMarketplaceLifecycleRunbookPhase;
  entryId: string;
  displayName: string;
  lifecycleState: PluginPackageMarketplaceLifecycleState;
  actionKind: PluginPackageMarketplaceLifecycleHandoffActionKind;
  executionMode: "operator_only";
  approvalSubject: PluginPackageMarketplaceLifecycleApprovalHandoffDescriptor["approvalSubject"];
  preflightState: PluginPackageMarketplaceLifecycleApprovalHandoffPreflightState;
  hostActionAllowed: false;
  operatorAction: PluginPackageMarketplaceLifecycleApprovalHandoffOperatorAction;
  nextAction: PluginPackageMarketplaceLifecycleApprovalHandoffPreflightNextAction;
  hostHandoff: {
    kind: PluginPackageMarketplaceLifecycleApprovalHandoffPreflightHostKind;
    requiredApprovalSubject: string;
    packageName: string;
    packageVersion: string;
    packageDigest: string;
    sidecarId: string;
    sidecarKind: string;
    source: "<redacted>";
  };
  operatorChecklist: string[];
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

export interface PluginPackageMarketplaceLifecycleApprovalHandoffPreflightView {
  recordType: "mcp_plugin_package_marketplace_lifecycle_approval_handoff_preflight_view";
  timestamp: string;
  catalogId: string;
  approvalHandoffRecordType: PluginPackageMarketplaceLifecycleApprovalHandoffView["recordType"];
  sourceHandoffCount: number;
  preflightCount: number;
  audience: "operator" | "reviewer";
  preflights: PluginPackageMarketplaceLifecycleApprovalHandoffPreflightItem[];
  summary: {
    total: number;
    readyForHostHandoffPreflight: number;
    blockedMissingApproval: number;
    blockedApprovalMismatch: number;
    blockedApprovalExpired: number;
    omittedByStateFilter: number;
    omittedByCap: number;
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

const APPROVAL_HANDOFF_PREFLIGHT_WARNINGS = [
  "Plugin marketplace lifecycle approval handoff preflights are read-only descriptors derived from approval handoff state.",
  "Ready preflights identify the next host-owned handoff boundary but never authorize Colony to perform host actions.",
  "Blocked preflights preserve missing, mismatched, and expired approval reasons without copying approval signatures, raw URLs, or nested host actions.",
];

export function createPluginPackageMarketplaceLifecycleApprovalHandoffPreflight(
  request: PluginPackageMarketplaceLifecycleApprovalHandoffPreflightRequest,
): PluginPackageMarketplaceLifecycleApprovalHandoffPreflightView {
  const includedStates = normalizeIncludedStates(request.includePreflightStates);
  const allPreflights = request.approvalHandoffView.handoffs.map(projectApprovalHandoffPreflight);
  const stateScoped = allPreflights.filter((preflight) => includedStates.has(preflight.preflightState));
  const capped = stateScoped.slice(0, safeMaxPreflights(request.maxPreflights));

  return freezeView({
    recordType: "mcp_plugin_package_marketplace_lifecycle_approval_handoff_preflight_view",
    timestamp: toIso(request.timestamp ?? new Date()),
    catalogId: safeId(request.approvalHandoffView.catalogId),
    approvalHandoffRecordType: request.approvalHandoffView.recordType,
    sourceHandoffCount: request.approvalHandoffView.handoffCount,
    preflightCount: capped.length,
    audience: request.audience === "reviewer" ? "reviewer" : request.approvalHandoffView.audience,
    preflights: capped,
    summary: summarizePreflights(
      allPreflights,
      allPreflights.length - stateScoped.length,
      stateScoped.length - capped.length,
    ),
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    warnings: [...APPROVAL_HANDOFF_PREFLIGHT_WARNINGS],
  });
}

function projectApprovalHandoffPreflight(
  handoff: PluginPackageMarketplaceLifecycleApprovalHandoffDescriptor,
): PluginPackageMarketplaceLifecycleApprovalHandoffPreflightItem {
  const preflightState = preflightStateForHandoff(handoff.handoffState);
  return {
    preflightId: `preflight-${safeId(handoff.handoffId)}`,
    handoffId: safeId(handoff.handoffId),
    reviewId: safeId(handoff.reviewId),
    packetId: safeId(handoff.packetId),
    stepId: safeId(handoff.stepId),
    phase: handoff.phase,
    entryId: safeId(handoff.entryId),
    displayName: safeLabel(handoff.displayName),
    lifecycleState: handoff.lifecycleState,
    actionKind: handoff.actionKind,
    executionMode: "operator_only",
    approvalSubject: handoff.approvalSubject,
    preflightState,
    hostActionAllowed: false,
    operatorAction: handoff.operatorAction,
    nextAction: nextActionForPreflight(preflightState),
    hostHandoff: {
      kind: hostKindForPreflight(handoff, preflightState),
      requiredApprovalSubject: safeLabel(handoff.approvalSubject),
      packageName: safeLabel(handoff.package.name),
      packageVersion: safeLabel(handoff.package.version),
      packageDigest: safeDigest(handoff.package.digest),
      sidecarId: safeLabel(handoff.sidecar.id),
      sidecarKind: safeLabel(handoff.sidecar.kind),
      source: "<redacted>",
    },
    operatorChecklist: checklistForPreflight(handoff, preflightState),
    package: {
      name: safeLabel(handoff.package.name),
      version: safeLabel(handoff.package.version),
      source: "<redacted>",
      digest: safeDigest(handoff.package.digest),
    },
    sidecar: {
      id: safeLabel(handoff.sidecar.id),
      kind: safeLabel(handoff.sidecar.kind),
    },
  };
}

function preflightStateForHandoff(
  state: PluginPackageMarketplaceLifecycleApprovalHandoffState,
): PluginPackageMarketplaceLifecycleApprovalHandoffPreflightState {
  switch (state) {
    case "ready_for_operator_handoff":
      return "ready_for_host_handoff_preflight";
    case "blocked_missing_approval":
      return "blocked_missing_approval";
    case "blocked_approval_mismatch":
      return "blocked_approval_mismatch";
    case "blocked_approval_expired":
      return "blocked_approval_expired";
  }
}

function nextActionForPreflight(
  state: PluginPackageMarketplaceLifecycleApprovalHandoffPreflightState,
): PluginPackageMarketplaceLifecycleApprovalHandoffPreflightNextAction {
  switch (state) {
    case "ready_for_host_handoff_preflight":
      return "request_explicit_host_handoff";
    case "blocked_missing_approval":
    case "blocked_approval_mismatch":
      return "collect_matching_approval";
    case "blocked_approval_expired":
      return "refresh_expired_approval";
  }
}

function hostKindForPreflight(
  handoff: PluginPackageMarketplaceLifecycleApprovalHandoffDescriptor,
  state: PluginPackageMarketplaceLifecycleApprovalHandoffPreflightState,
): PluginPackageMarketplaceLifecycleApprovalHandoffPreflightHostKind {
  if (state !== "ready_for_host_handoff_preflight") return "approval_blocker";
  switch (handoff.operatorAction) {
    case "prepare_metadata_handoff":
      return "metadata";
    case "prepare_install_update_handoff":
      return "install_update";
    case "prepare_activation_readiness_handoff":
      return "activation_readiness";
    case "prepare_activation_handoff":
      return "activation";
    case "collect_matching_approval":
    case "refresh_expired_approval":
      return "approval_blocker";
  }
}

function checklistForPreflight(
  handoff: PluginPackageMarketplaceLifecycleApprovalHandoffDescriptor,
  state: PluginPackageMarketplaceLifecycleApprovalHandoffPreflightState,
): string[] {
  if (state === "blocked_missing_approval") {
    return [
      "Collect explicit approval matching the approval subject before requesting host handoff.",
      `Approval subject: ${handoff.approvalSubject}.`,
    ];
  }
  if (state === "blocked_approval_mismatch") {
    return [
      "Discard mismatched approval evidence before requesting host handoff.",
      `Collect approval that exactly matches ${handoff.approvalSubject}.`,
    ];
  }
  if (state === "blocked_approval_expired") {
    return [
      "Refresh expired approval evidence before requesting host handoff.",
      `Approval subject: ${handoff.approvalSubject}.`,
    ];
  }
  return [
    "Request an explicit host handoff approval for this preflight descriptor before any host-owned execution.",
    "Use the host-handoff fields as bounded metadata only; Colony has not performed the action.",
    ...handoff.operatorChecklist,
  ]
    .map(safeChecklistText)
    .filter((item) => item !== "<redacted>")
    .slice(0, 8);
}

function summarizePreflights(
  preflights: PluginPackageMarketplaceLifecycleApprovalHandoffPreflightItem[],
  omittedByStateFilter: number,
  omittedByCap: number,
): PluginPackageMarketplaceLifecycleApprovalHandoffPreflightView["summary"] {
  return {
    total: preflights.length,
    readyForHostHandoffPreflight: countState(preflights, "ready_for_host_handoff_preflight"),
    blockedMissingApproval: countState(preflights, "blocked_missing_approval"),
    blockedApprovalMismatch: countState(preflights, "blocked_approval_mismatch"),
    blockedApprovalExpired: countState(preflights, "blocked_approval_expired"),
    omittedByStateFilter: Math.max(0, omittedByStateFilter),
    omittedByCap: Math.max(0, omittedByCap),
  };
}

function countState(
  preflights: PluginPackageMarketplaceLifecycleApprovalHandoffPreflightItem[],
  state: PluginPackageMarketplaceLifecycleApprovalHandoffPreflightState,
): number {
  return preflights.filter((preflight) => preflight.preflightState === state).length;
}

function normalizeIncludedStates(
  includeStates: PluginPackageMarketplaceLifecycleApprovalHandoffPreflightState[] | undefined,
): Set<PluginPackageMarketplaceLifecycleApprovalHandoffPreflightState> {
  const all: PluginPackageMarketplaceLifecycleApprovalHandoffPreflightState[] = [
    "ready_for_host_handoff_preflight",
    "blocked_missing_approval",
    "blocked_approval_mismatch",
    "blocked_approval_expired",
  ];
  if (includeStates === undefined || includeStates.length === 0) return new Set(all);
  return new Set(includeStates.filter((state) => all.includes(state)));
}

function safeMaxPreflights(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return Number.MAX_SAFE_INTEGER;
  return Math.min(value, 1000);
}

function safeId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]{1,180}$/.test(value) || looksSecret(value)) {
    return "<redacted>";
  }
  return value;
}

function safeLabel(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "<redacted>";
  const clean = value.replace(/[\0\r\n]/g, "");
  return looksSecret(clean) || looksHighEntropy(clean) ? "<redacted>" : clean.slice(0, 120);
}

function safeChecklistText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "<redacted>";
  const clean = value.replace(/[\0\r\n]/g, " ").trim();
  return looksSecret(clean) || clean.includes("://") ? "<redacted>" : clean.slice(0, 180);
}

function safeDigest(value: unknown): string {
  if (typeof value !== "string") return "<redacted>";
  if (/^sha256:[a-f0-9]{11}\.\.\.[a-f0-9]{8}$/i.test(value)) {
    return value.toLowerCase();
  }
  if (/^sha256:[a-f0-9]{64}$/i.test(value)) {
    return `${value.slice(0, 18).toLowerCase()}...${value.slice(-8).toLowerCase()}`;
  }
  return "<redacted>";
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
  view: PluginPackageMarketplaceLifecycleApprovalHandoffPreflightView,
): PluginPackageMarketplaceLifecycleApprovalHandoffPreflightView {
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
