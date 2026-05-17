import type {
  PluginPackageMarketplaceLifecycleApprovalPacket,
  PluginPackageMarketplaceLifecycleApprovalPacketsView,
  PluginPackageMarketplaceLifecycleApprovalSubject,
} from "./plugin-package-marketplace-lifecycle-approval-packets";
import type { PluginPackageMarketplaceLifecycleRunbookPhase } from "./plugin-package-marketplace-lifecycle-runbook";
import type { PluginPackageMarketplaceLifecycleHandoffActionKind } from "./plugin-package-marketplace-lifecycle-handoff";
import type { PluginPackageMarketplaceLifecycleState } from "./plugin-package-marketplace-lifecycle-status";

export type PluginPackageMarketplaceLifecycleApprovalReviewState =
  | "ready_for_operator_handoff"
  | "missing_approval"
  | "approval_mismatch"
  | "approval_expired";

export interface PluginPackageMarketplaceLifecycleApprovalReviewEvidence {
  packetId: string;
  approvalSubject: PluginPackageMarketplaceLifecycleApprovalSubject;
  approved: boolean;
  approvalSignature?: string;
  approver?: string;
  expiresAt?: string | Date;
}

export interface PluginPackageMarketplaceLifecycleApprovalReviewRequest {
  approvalPacketsView: PluginPackageMarketplaceLifecycleApprovalPacketsView;
  approvalEvidence?: PluginPackageMarketplaceLifecycleApprovalReviewEvidence[];
  audience?: "operator" | "reviewer";
  includeReviewStates?: PluginPackageMarketplaceLifecycleApprovalReviewState[];
  maxItems?: number;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceLifecycleApprovalReviewItem {
  reviewId: string;
  packetId: string;
  stepId: string;
  phase: PluginPackageMarketplaceLifecycleRunbookPhase;
  entryId: string;
  displayName: string;
  lifecycleState: PluginPackageMarketplaceLifecycleState;
  actionKind: PluginPackageMarketplaceLifecycleHandoffActionKind;
  executionMode: "operator_only";
  approvalRequired: true;
  approvalSubject: PluginPackageMarketplaceLifecycleApprovalSubject;
  reviewState: PluginPackageMarketplaceLifecycleApprovalReviewState;
  hostActionAllowed: false;
  nextAction:
    | "request_operator_handoff"
    | "collect_matching_approval"
    | "refresh_expired_approval";
  approvalEvidence: {
    present: boolean;
    subjectMatched: boolean;
    approved: boolean;
    expired: boolean;
    approver: string;
    signature: "<redacted>";
    expiresAt?: string;
  };
  approvalPrompt: string;
  approvalChecklist: string[];
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

export interface PluginPackageMarketplaceLifecycleApprovalReviewView {
  recordType: "mcp_plugin_package_marketplace_lifecycle_approval_review_view";
  timestamp: string;
  catalogId: string;
  approvalPacketsRecordType: PluginPackageMarketplaceLifecycleApprovalPacketsView["recordType"];
  sourcePacketCount: number;
  packetReviewCount: number;
  audience: "operator" | "reviewer";
  reviews: PluginPackageMarketplaceLifecycleApprovalReviewItem[];
  summary: {
    total: number;
    readyForOperatorHandoff: number;
    missingApprovals: number;
    approvalMismatches: number;
    approvalExpired: number;
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

const APPROVAL_REVIEW_WARNINGS = [
  "Plugin marketplace lifecycle approval reviews are read-only projections over approval packets and supplied approval evidence.",
  "Ready approval review items still require an operator-owned handoff path; the review view itself never performs host actions.",
  "Approval evidence signatures, raw registry URLs, nested handoff bodies, warnings, and next actions are not copied into review output.",
];

export function createPluginPackageMarketplaceLifecycleApprovalReview(
  request: PluginPackageMarketplaceLifecycleApprovalReviewRequest,
): PluginPackageMarketplaceLifecycleApprovalReviewView {
  const timestamp = toIso(request.timestamp ?? new Date());
  const evidenceByPacketId = indexEvidence(request.approvalEvidence ?? []);
  const allReviews = request.approvalPacketsView.packets.map((packet) =>
    projectApprovalReviewItem(packet, evidenceByPacketId.get(packet.packetId), timestamp),
  );
  const includedStates = normalizeIncludedStates(request.includeReviewStates);
  const stateScopedReviews = allReviews.filter((review) => includedStates.has(review.reviewState));
  const cappedReviews = stateScopedReviews.slice(0, safeMaxItems(request.maxItems));

  return freezeView({
    recordType: "mcp_plugin_package_marketplace_lifecycle_approval_review_view",
    timestamp,
    catalogId: safeId(request.approvalPacketsView.catalogId),
    approvalPacketsRecordType: request.approvalPacketsView.recordType,
    sourcePacketCount: request.approvalPacketsView.packetCount,
    packetReviewCount: cappedReviews.length,
    audience: request.audience === "reviewer" ? "reviewer" : "operator",
    reviews: cappedReviews,
    summary: summarizeReview(
      allReviews,
      allReviews.length - stateScopedReviews.length,
      stateScopedReviews.length - cappedReviews.length,
    ),
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    warnings: [...APPROVAL_REVIEW_WARNINGS],
  });
}

function projectApprovalReviewItem(
  packet: PluginPackageMarketplaceLifecycleApprovalPacket,
  evidence: PluginPackageMarketplaceLifecycleApprovalReviewEvidence | undefined,
  timestamp: string,
): PluginPackageMarketplaceLifecycleApprovalReviewItem {
  const state = reviewStateForEvidence(packet, evidence, timestamp);
  const expiresAt = evidence?.expiresAt === undefined ? undefined : toIso(evidence.expiresAt);
  return {
    reviewId: `review-${safeId(packet.packetId)}`,
    packetId: safeId(packet.packetId),
    stepId: safeId(packet.stepId),
    phase: packet.phase,
    entryId: safeId(packet.entryId),
    displayName: safeLabel(packet.displayName),
    lifecycleState: packet.lifecycleState,
    actionKind: packet.actionKind,
    executionMode: "operator_only",
    approvalRequired: true,
    approvalSubject: packet.approvalSubject,
    reviewState: state,
    hostActionAllowed: false,
    nextAction: nextActionForState(state),
    approvalEvidence: {
      present: evidence !== undefined,
      subjectMatched: evidence?.approvalSubject === packet.approvalSubject,
      approved: evidence?.approved === true,
      expired: state === "approval_expired",
      approver: safeLabel(evidence?.approver ?? "<redacted>"),
      signature: "<redacted>",
      ...(expiresAt === undefined ? {} : { expiresAt }),
    },
    approvalPrompt: safeChecklistText(packet.approvalPrompt),
    approvalChecklist: packet.approvalChecklist.map(safeChecklistText).filter((item) => item !== "<redacted>").slice(0, 8),
    package: {
      name: safeLabel(packet.package.name),
      version: safeLabel(packet.package.version),
      source: "<redacted>",
      digest: safeDigest(packet.package.digest),
    },
    sidecar: {
      id: safeLabel(packet.sidecar.id),
      kind: safeLabel(packet.sidecar.kind),
    },
  };
}

function reviewStateForEvidence(
  packet: PluginPackageMarketplaceLifecycleApprovalPacket,
  evidence: PluginPackageMarketplaceLifecycleApprovalReviewEvidence | undefined,
  timestamp: string,
): PluginPackageMarketplaceLifecycleApprovalReviewState {
  if (evidence === undefined) return "missing_approval";
  if (evidence.approvalSubject !== packet.approvalSubject || evidence.approved !== true) {
    return "approval_mismatch";
  }
  if (isExpired(evidence.expiresAt, timestamp)) return "approval_expired";
  return "ready_for_operator_handoff";
}

function nextActionForState(
  state: PluginPackageMarketplaceLifecycleApprovalReviewState,
): PluginPackageMarketplaceLifecycleApprovalReviewItem["nextAction"] {
  switch (state) {
    case "ready_for_operator_handoff":
      return "request_operator_handoff";
    case "approval_expired":
      return "refresh_expired_approval";
    case "missing_approval":
    case "approval_mismatch":
      return "collect_matching_approval";
  }
}

function summarizeReview(
  reviews: PluginPackageMarketplaceLifecycleApprovalReviewItem[],
  omittedByStateFilter: number,
  omittedByCap: number,
): PluginPackageMarketplaceLifecycleApprovalReviewView["summary"] {
  return {
    total: reviews.length,
    readyForOperatorHandoff: countState(reviews, "ready_for_operator_handoff"),
    missingApprovals: countState(reviews, "missing_approval"),
    approvalMismatches: countState(reviews, "approval_mismatch"),
    approvalExpired: countState(reviews, "approval_expired"),
    omittedByStateFilter: Math.max(0, omittedByStateFilter),
    omittedByCap: Math.max(0, omittedByCap),
  };
}

function countState(
  reviews: PluginPackageMarketplaceLifecycleApprovalReviewItem[],
  state: PluginPackageMarketplaceLifecycleApprovalReviewState,
): number {
  return reviews.filter((review) => review.reviewState === state).length;
}

function indexEvidence(
  evidence: PluginPackageMarketplaceLifecycleApprovalReviewEvidence[],
): Map<string, PluginPackageMarketplaceLifecycleApprovalReviewEvidence> {
  const index = new Map<string, PluginPackageMarketplaceLifecycleApprovalReviewEvidence>();
  for (const item of evidence) {
    const packetId = safeId(item.packetId);
    if (packetId !== "<redacted>" && !index.has(packetId)) {
      index.set(packetId, item);
    }
  }
  return index;
}

function normalizeIncludedStates(
  includeReviewStates: PluginPackageMarketplaceLifecycleApprovalReviewState[] | undefined,
): Set<PluginPackageMarketplaceLifecycleApprovalReviewState> {
  const all: PluginPackageMarketplaceLifecycleApprovalReviewState[] = [
    "ready_for_operator_handoff",
    "missing_approval",
    "approval_mismatch",
    "approval_expired",
  ];
  if (includeReviewStates === undefined || includeReviewStates.length === 0) return new Set(all);
  return new Set(includeReviewStates.filter((state) => all.includes(state)));
}

function safeMaxItems(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return Number.MAX_SAFE_INTEGER;
  return Math.min(value, 1000);
}

function isExpired(value: string | Date | undefined, timestamp: string): boolean {
  if (value === undefined) return false;
  const expiresAt = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(expiresAt.getTime())) return true;
  return expiresAt.getTime() <= new Date(timestamp).getTime();
}

function safeId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]{1,160}$/.test(value) || looksSecret(value)) {
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
  view: PluginPackageMarketplaceLifecycleApprovalReviewView,
): PluginPackageMarketplaceLifecycleApprovalReviewView {
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
