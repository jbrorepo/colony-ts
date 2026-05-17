import type {
  PluginPackageMarketplaceLifecycleHostHandoffRequestItem,
  PluginPackageMarketplaceLifecycleHostHandoffRequestKind,
  PluginPackageMarketplaceLifecycleHostHandoffRequestOperatorCommand,
  PluginPackageMarketplaceLifecycleHostHandoffRequestState,
  PluginPackageMarketplaceLifecycleHostHandoffRequestView,
} from "./plugin-package-marketplace-lifecycle-host-handoff-request";
import type { PluginPackageMarketplaceLifecycleHandoffActionKind } from "./plugin-package-marketplace-lifecycle-handoff";
import type { PluginPackageMarketplaceLifecycleRunbookPhase } from "./plugin-package-marketplace-lifecycle-runbook";
import type { PluginPackageMarketplaceLifecycleState } from "./plugin-package-marketplace-lifecycle-status";

export type PluginPackageMarketplaceLifecycleOperatorQueueLane =
  | "approval_blockers"
  | "metadata_requests"
  | "install_update_requests"
  | "activation_readiness_requests"
  | "activation_requests";

export type PluginPackageMarketplaceLifecycleOperatorQueueItemState =
  | "ready_for_operator_presentation"
  | "blocked_missing_approval"
  | "blocked_approval_mismatch"
  | "blocked_approval_expired";

export type PluginPackageMarketplaceLifecycleOperatorQueueAction =
  | "present_metadata_request"
  | "present_install_update_request"
  | "present_activation_readiness_request"
  | "present_activation_request"
  | "collect_matching_approval"
  | "refresh_expired_approval";

export type PluginPackageMarketplaceLifecycleOperatorQueueNextAction =
  | "present_request"
  | "collect_matching_approval"
  | "refresh_expired_approval";

export interface PluginPackageMarketplaceLifecycleOperatorQueueInput {
  hostHandoffRequestView: PluginPackageMarketplaceLifecycleHostHandoffRequestView;
  audience?: "operator" | "reviewer";
  includeLanes?: PluginPackageMarketplaceLifecycleOperatorQueueLane[];
  includeStates?: PluginPackageMarketplaceLifecycleOperatorQueueItemState[];
  maxItems?: number;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceLifecycleOperatorQueueItem {
  queueItemId: string;
  requestId: string;
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
  requestKind: PluginPackageMarketplaceLifecycleHostHandoffRequestKind;
  lane: PluginPackageMarketplaceLifecycleOperatorQueueLane;
  itemState: PluginPackageMarketplaceLifecycleOperatorQueueItemState;
  operatorAction: PluginPackageMarketplaceLifecycleOperatorQueueAction;
  nextAction: PluginPackageMarketplaceLifecycleOperatorQueueNextAction;
  executionMode: "operator_only";
  hostActionAllowed: false;
  queueMutable: false;
  defaultLiveExecution: false;
  requestCommand: PluginPackageMarketplaceLifecycleHostHandoffRequestOperatorCommand;
  hostRequest: {
    requestKind: PluginPackageMarketplaceLifecycleHostHandoffRequestKind;
    packageName: string;
    packageVersion: string;
    packageDigest: string;
    sidecarId: string;
    sidecarKind: string;
    approvalSubject: string;
    source: "<redacted>";
    payloadMode: "descriptor_only";
  };
  operatorChecklist: string[];
  package: {
    name: string;
    version: string;
    digest: string;
    source: "<redacted>";
  };
  sidecar: {
    id: string;
    kind: string;
  };
}

export interface PluginPackageMarketplaceLifecycleOperatorQueueView {
  recordType: "mcp_plugin_package_marketplace_lifecycle_operator_queue_view";
  timestamp: string;
  catalogId: string;
  hostHandoffRequestRecordType: PluginPackageMarketplaceLifecycleHostHandoffRequestView["recordType"];
  sourceRequestCount: number;
  queueItemCount: number;
  audience: "operator" | "reviewer";
  lanes: {
    approvalBlockers: PluginPackageMarketplaceLifecycleOperatorQueueItem[];
    metadataRequests: PluginPackageMarketplaceLifecycleOperatorQueueItem[];
    installUpdateRequests: PluginPackageMarketplaceLifecycleOperatorQueueItem[];
    activationReadinessRequests: PluginPackageMarketplaceLifecycleOperatorQueueItem[];
    activationRequests: PluginPackageMarketplaceLifecycleOperatorQueueItem[];
  };
  summary: {
    total: number;
    approvalBlockers: number;
    metadataRequests: number;
    installUpdateRequests: number;
    activationReadinessRequests: number;
    activationRequests: number;
    readyForOperatorPresentation: number;
    blockedMissingApproval: number;
    blockedApprovalMismatch: number;
    blockedApprovalExpired: number;
    omittedByLaneFilter: number;
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
  defaultLiveExecution: false;
  warnings: string[];
}

const OPERATOR_QUEUE_WARNINGS = [
  "Plugin marketplace lifecycle operator queues are read-only projections derived from host handoff request descriptors.",
  "Queue lanes prepare operator UX for explicit handoff requests without enabling default live execution.",
  "Approval blockers remain separated from presentable requests and never carry approval signatures, raw URLs, or nested host actions.",
];

export function createPluginPackageMarketplaceLifecycleOperatorQueue(
  input: PluginPackageMarketplaceLifecycleOperatorQueueInput,
): PluginPackageMarketplaceLifecycleOperatorQueueView {
  const includedLanes = normalizeIncludedLanes(input.includeLanes);
  const includedStates = normalizeIncludedStates(input.includeStates);
  const allItems = input.hostHandoffRequestView.requests.map(projectQueueItem);
  const laneScoped = allItems.filter((item) => includedLanes.has(item.lane));
  const stateScoped = laneScoped.filter((item) => includedStates.has(item.itemState));
  const capped = stateScoped.slice(0, safeMaxItems(input.maxItems));

  return freezeView({
    recordType: "mcp_plugin_package_marketplace_lifecycle_operator_queue_view",
    timestamp: toIso(input.timestamp ?? new Date()),
    catalogId: safeId(input.hostHandoffRequestView.catalogId),
    hostHandoffRequestRecordType: input.hostHandoffRequestView.recordType,
    sourceRequestCount: input.hostHandoffRequestView.requestCount,
    queueItemCount: capped.length,
    audience: input.audience === "reviewer" ? "reviewer" : input.hostHandoffRequestView.audience,
    lanes: groupLanes(capped),
    summary: summarizeItems(
      allItems,
      allItems.length - laneScoped.length,
      laneScoped.length - stateScoped.length,
      stateScoped.length - capped.length,
    ),
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    defaultLiveExecution: false,
    warnings: [...OPERATOR_QUEUE_WARNINGS],
  });
}

function projectQueueItem(
  request: PluginPackageMarketplaceLifecycleHostHandoffRequestItem,
): PluginPackageMarketplaceLifecycleOperatorQueueItem {
  const itemState = itemStateForRequest(request.requestState);
  const lane = laneForRequest(request, itemState);
  return {
    queueItemId: `queue-${safeId(request.requestId)}`,
    requestId: safeId(request.requestId),
    preflightId: safeId(request.preflightId),
    handoffId: safeId(request.handoffId),
    reviewId: safeId(request.reviewId),
    packetId: safeId(request.packetId),
    stepId: safeId(request.stepId),
    phase: request.phase,
    entryId: safeId(request.entryId),
    displayName: safeLabel(request.displayName),
    lifecycleState: request.lifecycleState,
    actionKind: request.actionKind,
    requestKind: request.requestKind,
    lane,
    itemState,
    operatorAction: operatorActionForItem(request.requestKind, itemState),
    nextAction: nextActionForItem(itemState),
    executionMode: "operator_only",
    hostActionAllowed: false,
    queueMutable: false,
    defaultLiveExecution: false,
    requestCommand: request.operatorCommand,
    hostRequest: {
      requestKind: request.hostRequest.requestKind,
      packageName: safeLabel(request.hostRequest.packageName),
      packageVersion: safeLabel(request.hostRequest.packageVersion),
      packageDigest: safeDigest(request.hostRequest.packageDigest),
      sidecarId: safeLabel(request.hostRequest.sidecarId),
      sidecarKind: safeLabel(request.hostRequest.sidecarKind),
      approvalSubject: safeLabel(request.hostRequest.approvalSubject),
      source: "<redacted>",
      payloadMode: "descriptor_only",
    },
    operatorChecklist: request.operatorChecklist.map(safeChecklistText).filter((item) => item !== "<redacted>").slice(0, 8),
    package: {
      name: safeLabel(request.package.name),
      version: safeLabel(request.package.version),
      digest: safeDigest(request.package.digest),
      source: "<redacted>",
    },
    sidecar: {
      id: safeLabel(request.sidecar.id),
      kind: safeLabel(request.sidecar.kind),
    },
  };
}

function itemStateForRequest(
  state: PluginPackageMarketplaceLifecycleHostHandoffRequestState,
): PluginPackageMarketplaceLifecycleOperatorQueueItemState {
  switch (state) {
    case "ready_for_explicit_host_handoff_request":
      return "ready_for_operator_presentation";
    case "blocked_missing_approval":
      return "blocked_missing_approval";
    case "blocked_approval_mismatch":
      return "blocked_approval_mismatch";
    case "blocked_approval_expired":
      return "blocked_approval_expired";
  }
}

function laneForRequest(
  request: PluginPackageMarketplaceLifecycleHostHandoffRequestItem,
  state: PluginPackageMarketplaceLifecycleOperatorQueueItemState,
): PluginPackageMarketplaceLifecycleOperatorQueueLane {
  if (state !== "ready_for_operator_presentation") return "approval_blockers";
  switch (request.requestKind) {
    case "metadata":
      return "metadata_requests";
    case "install_update":
      return "install_update_requests";
    case "activation_readiness":
      return "activation_readiness_requests";
    case "activation":
      return "activation_requests";
    case "approval_blocker":
      return "approval_blockers";
  }
}

function operatorActionForItem(
  kind: PluginPackageMarketplaceLifecycleHostHandoffRequestKind,
  state: PluginPackageMarketplaceLifecycleOperatorQueueItemState,
): PluginPackageMarketplaceLifecycleOperatorQueueAction {
  if (state === "blocked_approval_expired") return "refresh_expired_approval";
  if (state !== "ready_for_operator_presentation") return "collect_matching_approval";
  switch (kind) {
    case "metadata":
      return "present_metadata_request";
    case "install_update":
      return "present_install_update_request";
    case "activation_readiness":
      return "present_activation_readiness_request";
    case "activation":
      return "present_activation_request";
    case "approval_blocker":
      return "collect_matching_approval";
  }
}

function nextActionForItem(
  state: PluginPackageMarketplaceLifecycleOperatorQueueItemState,
): PluginPackageMarketplaceLifecycleOperatorQueueNextAction {
  switch (state) {
    case "ready_for_operator_presentation":
      return "present_request";
    case "blocked_missing_approval":
    case "blocked_approval_mismatch":
      return "collect_matching_approval";
    case "blocked_approval_expired":
      return "refresh_expired_approval";
  }
}

function groupLanes(items: PluginPackageMarketplaceLifecycleOperatorQueueItem[]): PluginPackageMarketplaceLifecycleOperatorQueueView["lanes"] {
  return {
    approvalBlockers: items.filter((item) => item.lane === "approval_blockers"),
    metadataRequests: items.filter((item) => item.lane === "metadata_requests"),
    installUpdateRequests: items.filter((item) => item.lane === "install_update_requests"),
    activationReadinessRequests: items.filter((item) => item.lane === "activation_readiness_requests"),
    activationRequests: items.filter((item) => item.lane === "activation_requests"),
  };
}

function summarizeItems(
  items: PluginPackageMarketplaceLifecycleOperatorQueueItem[],
  omittedByLaneFilter: number,
  omittedByStateFilter: number,
  omittedByCap: number,
): PluginPackageMarketplaceLifecycleOperatorQueueView["summary"] {
  return {
    total: items.length,
    approvalBlockers: countLane(items, "approval_blockers"),
    metadataRequests: countLane(items, "metadata_requests"),
    installUpdateRequests: countLane(items, "install_update_requests"),
    activationReadinessRequests: countLane(items, "activation_readiness_requests"),
    activationRequests: countLane(items, "activation_requests"),
    readyForOperatorPresentation: countState(items, "ready_for_operator_presentation"),
    blockedMissingApproval: countState(items, "blocked_missing_approval"),
    blockedApprovalMismatch: countState(items, "blocked_approval_mismatch"),
    blockedApprovalExpired: countState(items, "blocked_approval_expired"),
    omittedByLaneFilter: Math.max(0, omittedByLaneFilter),
    omittedByStateFilter: Math.max(0, omittedByStateFilter),
    omittedByCap: Math.max(0, omittedByCap),
  };
}

function countLane(
  items: PluginPackageMarketplaceLifecycleOperatorQueueItem[],
  lane: PluginPackageMarketplaceLifecycleOperatorQueueLane,
): number {
  return items.filter((item) => item.lane === lane).length;
}

function countState(
  items: PluginPackageMarketplaceLifecycleOperatorQueueItem[],
  state: PluginPackageMarketplaceLifecycleOperatorQueueItemState,
): number {
  return items.filter((item) => item.itemState === state).length;
}

function normalizeIncludedLanes(
  includeLanes: PluginPackageMarketplaceLifecycleOperatorQueueLane[] | undefined,
): Set<PluginPackageMarketplaceLifecycleOperatorQueueLane> {
  const all: PluginPackageMarketplaceLifecycleOperatorQueueLane[] = [
    "approval_blockers",
    "metadata_requests",
    "install_update_requests",
    "activation_readiness_requests",
    "activation_requests",
  ];
  if (includeLanes === undefined || includeLanes.length === 0) return new Set(all);
  return new Set(includeLanes.filter((lane) => all.includes(lane)));
}

function normalizeIncludedStates(
  includeStates: PluginPackageMarketplaceLifecycleOperatorQueueItemState[] | undefined,
): Set<PluginPackageMarketplaceLifecycleOperatorQueueItemState> {
  const all: PluginPackageMarketplaceLifecycleOperatorQueueItemState[] = [
    "ready_for_operator_presentation",
    "blocked_missing_approval",
    "blocked_approval_mismatch",
    "blocked_approval_expired",
  ];
  if (includeStates === undefined || includeStates.length === 0) return new Set(all);
  return new Set(includeStates.filter((state) => all.includes(state)));
}

function safeMaxItems(value: unknown): number {
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
  view: PluginPackageMarketplaceLifecycleOperatorQueueView,
): PluginPackageMarketplaceLifecycleOperatorQueueView {
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
