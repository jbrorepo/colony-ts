import type {
  PluginPackageMarketplaceLifecycleApprovalReviewItem,
  PluginPackageMarketplaceLifecycleApprovalReviewState,
  PluginPackageMarketplaceLifecycleApprovalReviewView,
} from "./plugin-package-marketplace-lifecycle-approval-review";
import type { PluginPackageMarketplaceLifecycleHandoffActionKind } from "./plugin-package-marketplace-lifecycle-handoff";
import type { PluginPackageMarketplaceLifecycleRunbookPhase } from "./plugin-package-marketplace-lifecycle-runbook";
import type { PluginPackageMarketplaceLifecycleState } from "./plugin-package-marketplace-lifecycle-status";

export type PluginPackageMarketplaceLifecycleApprovalHandoffState =
  | "ready_for_operator_handoff"
  | "blocked_missing_approval"
  | "blocked_approval_mismatch"
  | "blocked_approval_expired";

export type PluginPackageMarketplaceLifecycleApprovalHandoffOperatorAction =
  | "prepare_metadata_handoff"
  | "prepare_install_update_handoff"
  | "prepare_activation_readiness_handoff"
  | "prepare_activation_handoff"
  | "collect_matching_approval"
  | "refresh_expired_approval";

export interface PluginPackageMarketplaceLifecycleApprovalHandoffRequest {
  approvalReviewView: PluginPackageMarketplaceLifecycleApprovalReviewView;
  audience?: "operator" | "reviewer";
  includePhases?: PluginPackageMarketplaceLifecycleRunbookPhase[];
  includeActionKinds?: PluginPackageMarketplaceLifecycleHandoffActionKind[];
  maxHandoffs?: number;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceLifecycleApprovalHandoffDescriptor {
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
  approvalSubject: PluginPackageMarketplaceLifecycleApprovalReviewItem["approvalSubject"];
  handoffState: PluginPackageMarketplaceLifecycleApprovalHandoffState;
  hostActionAllowed: false;
  operatorAction: PluginPackageMarketplaceLifecycleApprovalHandoffOperatorAction;
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

export interface PluginPackageMarketplaceLifecycleApprovalHandoffView {
  recordType: "mcp_plugin_package_marketplace_lifecycle_approval_handoff_view";
  timestamp: string;
  catalogId: string;
  approvalReviewRecordType: PluginPackageMarketplaceLifecycleApprovalReviewView["recordType"];
  sourceReviewCount: number;
  handoffCount: number;
  audience: "operator" | "reviewer";
  handoffs: PluginPackageMarketplaceLifecycleApprovalHandoffDescriptor[];
  summary: {
    total: number;
    readyForOperatorHandoff: number;
    blockedMissingApproval: number;
    blockedApprovalMismatch: number;
    blockedApprovalExpired: number;
    omittedByPhaseFilter: number;
    omittedByActionFilter: number;
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

const APPROVAL_HANDOFF_WARNINGS = [
  "Plugin marketplace lifecycle approval handoffs are read-only descriptors derived from approval review state.",
  "Ready approval handoffs still require an operator-owned execution path; this view never performs host actions.",
  "Blocked approval handoffs preserve missing, mismatched, and expired approval reasons without copying approval signatures, raw URLs, or nested host actions.",
];

export function createPluginPackageMarketplaceLifecycleApprovalHandoff(
  request: PluginPackageMarketplaceLifecycleApprovalHandoffRequest,
): PluginPackageMarketplaceLifecycleApprovalHandoffView {
  const includedPhases = normalizeIncludedPhases(request.includePhases);
  const includedActionKinds = normalizeIncludedActionKinds(request.includeActionKinds);
  const allHandoffs = request.approvalReviewView.reviews.map(projectApprovalHandoff);
  const phaseScoped = allHandoffs.filter((handoff) => includedPhases.has(handoff.phase));
  const actionScoped = phaseScoped.filter((handoff) => includedActionKinds.has(handoff.actionKind));
  const capped = actionScoped.slice(0, safeMaxHandoffs(request.maxHandoffs));

  return freezeView({
    recordType: "mcp_plugin_package_marketplace_lifecycle_approval_handoff_view",
    timestamp: toIso(request.timestamp ?? new Date()),
    catalogId: safeId(request.approvalReviewView.catalogId),
    approvalReviewRecordType: request.approvalReviewView.recordType,
    sourceReviewCount: request.approvalReviewView.packetReviewCount,
    handoffCount: capped.length,
    audience: request.audience === "reviewer" ? "reviewer" : "operator",
    handoffs: capped,
    summary: summarizeHandoffs(
      allHandoffs,
      allHandoffs.length - phaseScoped.length,
      phaseScoped.length - actionScoped.length,
      actionScoped.length - capped.length,
    ),
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    warnings: [...APPROVAL_HANDOFF_WARNINGS],
  });
}

function projectApprovalHandoff(
  review: PluginPackageMarketplaceLifecycleApprovalReviewItem,
): PluginPackageMarketplaceLifecycleApprovalHandoffDescriptor {
  const handoffState = handoffStateForReview(review.reviewState);
  return {
    handoffId: `approval-handoff-${safeId(review.reviewId)}`,
    reviewId: safeId(review.reviewId),
    packetId: safeId(review.packetId),
    stepId: safeId(review.stepId),
    phase: review.phase,
    entryId: safeId(review.entryId),
    displayName: safeLabel(review.displayName),
    lifecycleState: review.lifecycleState,
    actionKind: review.actionKind,
    executionMode: "operator_only",
    approvalSubject: review.approvalSubject,
    handoffState,
    hostActionAllowed: false,
    operatorAction: operatorActionForReview(review),
    operatorChecklist: checklistForReview(review, handoffState),
    package: {
      name: safeLabel(review.package.name),
      version: safeLabel(review.package.version),
      source: "<redacted>",
      digest: safeDigest(review.package.digest),
    },
    sidecar: {
      id: safeLabel(review.sidecar.id),
      kind: safeLabel(review.sidecar.kind),
    },
  };
}

function handoffStateForReview(
  state: PluginPackageMarketplaceLifecycleApprovalReviewState,
): PluginPackageMarketplaceLifecycleApprovalHandoffState {
  switch (state) {
    case "ready_for_operator_handoff":
      return "ready_for_operator_handoff";
    case "missing_approval":
      return "blocked_missing_approval";
    case "approval_mismatch":
      return "blocked_approval_mismatch";
    case "approval_expired":
      return "blocked_approval_expired";
  }
}

function operatorActionForReview(
  review: PluginPackageMarketplaceLifecycleApprovalReviewItem,
): PluginPackageMarketplaceLifecycleApprovalHandoffOperatorAction {
  switch (review.reviewState) {
    case "missing_approval":
    case "approval_mismatch":
      return "collect_matching_approval";
    case "approval_expired":
      return "refresh_expired_approval";
    case "ready_for_operator_handoff":
      return readyOperatorActionForActionKind(review.actionKind);
  }
}

function readyOperatorActionForActionKind(
  actionKind: PluginPackageMarketplaceLifecycleHandoffActionKind,
): PluginPackageMarketplaceLifecycleApprovalHandoffOperatorAction {
  switch (actionKind) {
    case "collect_registry_metadata_evidence":
    case "resolve_metadata_gate":
    case "inspect_metadata_failure":
      return "prepare_metadata_handoff";
    case "prepare_metadata_bound_install_update_handoff":
    case "inspect_install_receipt":
      return "prepare_install_update_handoff";
    case "collect_activation_readiness":
    case "inspect_activation_receipt":
      return "prepare_activation_readiness_handoff";
    case "prepare_metadata_bound_activation_handoff":
    case "inspect_sidecar_status":
      return "prepare_activation_handoff";
  }
}

function checklistForReview(
  review: PluginPackageMarketplaceLifecycleApprovalReviewItem,
  handoffState: PluginPackageMarketplaceLifecycleApprovalHandoffState,
): string[] {
  if (handoffState === "blocked_missing_approval") {
    return [
      "Collect explicit approval matching the approval subject before preparing any host handoff.",
      `Approval subject: ${review.approvalSubject}.`,
    ];
  }
  if (handoffState === "blocked_approval_mismatch") {
    return [
      "Discard mismatched approval evidence for this packet.",
      `Collect approval that exactly matches ${review.approvalSubject}.`,
    ];
  }
  if (handoffState === "blocked_approval_expired") {
    return [
      "Refresh expired approval evidence before preparing any host handoff.",
      `Approval subject: ${review.approvalSubject}.`,
    ];
  }
  return [
    operatorChecklistLeadForAction(review.actionKind),
    "Use only the operator-owned handoff path; this descriptor performs no host action.",
    ...review.approvalChecklist,
  ]
    .map(safeChecklistText)
    .filter((item) => item !== "<redacted>")
    .slice(0, 8);
}

function operatorChecklistLeadForAction(actionKind: PluginPackageMarketplaceLifecycleHandoffActionKind): string {
  switch (actionKind) {
    case "collect_registry_metadata_evidence":
      return "Prepare metadata evidence handoff using the matched approval subject.";
    case "resolve_metadata_gate":
      return "Prepare metadata gate resolution handoff using the matched approval subject.";
    case "prepare_metadata_bound_install_update_handoff":
      return "Prepare install/update handoff after confirming the metadata-bound approval.";
    case "collect_activation_readiness":
      return "Prepare activation readiness handoff after confirming install/update receipt context.";
    case "prepare_metadata_bound_activation_handoff":
      return "Prepare activation handoff after confirming metadata-bound activation approval.";
    case "inspect_metadata_failure":
    case "inspect_install_receipt":
    case "inspect_activation_receipt":
    case "inspect_sidecar_status":
      return "Prepare inspection handoff through the operator-owned review path.";
  }
}

function summarizeHandoffs(
  handoffs: PluginPackageMarketplaceLifecycleApprovalHandoffDescriptor[],
  omittedByPhaseFilter: number,
  omittedByActionFilter: number,
  omittedByCap: number,
): PluginPackageMarketplaceLifecycleApprovalHandoffView["summary"] {
  return {
    total: handoffs.length,
    readyForOperatorHandoff: countState(handoffs, "ready_for_operator_handoff"),
    blockedMissingApproval: countState(handoffs, "blocked_missing_approval"),
    blockedApprovalMismatch: countState(handoffs, "blocked_approval_mismatch"),
    blockedApprovalExpired: countState(handoffs, "blocked_approval_expired"),
    omittedByPhaseFilter: Math.max(0, omittedByPhaseFilter),
    omittedByActionFilter: Math.max(0, omittedByActionFilter),
    omittedByCap: Math.max(0, omittedByCap),
  };
}

function countState(
  handoffs: PluginPackageMarketplaceLifecycleApprovalHandoffDescriptor[],
  state: PluginPackageMarketplaceLifecycleApprovalHandoffState,
): number {
  return handoffs.filter((handoff) => handoff.handoffState === state).length;
}

function normalizeIncludedPhases(
  includePhases: PluginPackageMarketplaceLifecycleRunbookPhase[] | undefined,
): Set<PluginPackageMarketplaceLifecycleRunbookPhase> {
  const all: PluginPackageMarketplaceLifecycleRunbookPhase[] = ["metadata", "install", "activation", "inspection"];
  if (includePhases === undefined || includePhases.length === 0) return new Set(all);
  return new Set(includePhases.filter((phase) => all.includes(phase)));
}

function normalizeIncludedActionKinds(
  includeActionKinds: PluginPackageMarketplaceLifecycleHandoffActionKind[] | undefined,
): Set<PluginPackageMarketplaceLifecycleHandoffActionKind> {
  const all: PluginPackageMarketplaceLifecycleHandoffActionKind[] = [
    "collect_registry_metadata_evidence",
    "resolve_metadata_gate",
    "inspect_metadata_failure",
    "prepare_metadata_bound_install_update_handoff",
    "inspect_install_receipt",
    "collect_activation_readiness",
    "prepare_metadata_bound_activation_handoff",
    "inspect_activation_receipt",
    "inspect_sidecar_status",
  ];
  if (includeActionKinds === undefined || includeActionKinds.length === 0) return new Set(all);
  return new Set(includeActionKinds.filter((actionKind) => all.includes(actionKind)));
}

function safeMaxHandoffs(value: unknown): number {
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
  view: PluginPackageMarketplaceLifecycleApprovalHandoffView,
): PluginPackageMarketplaceLifecycleApprovalHandoffView {
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
