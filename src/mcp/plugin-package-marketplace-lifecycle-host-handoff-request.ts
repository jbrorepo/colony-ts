import type {
  PluginPackageMarketplaceLifecycleApprovalHandoffPreflightHostKind,
  PluginPackageMarketplaceLifecycleApprovalHandoffPreflightItem,
  PluginPackageMarketplaceLifecycleApprovalHandoffPreflightState,
  PluginPackageMarketplaceLifecycleApprovalHandoffPreflightView,
} from "./plugin-package-marketplace-lifecycle-approval-handoff-preflight";
import type { PluginPackageMarketplaceLifecycleHandoffActionKind } from "./plugin-package-marketplace-lifecycle-handoff";
import type { PluginPackageMarketplaceLifecycleRunbookPhase } from "./plugin-package-marketplace-lifecycle-runbook";
import type { PluginPackageMarketplaceLifecycleState } from "./plugin-package-marketplace-lifecycle-status";

export type PluginPackageMarketplaceLifecycleHostHandoffRequestState =
  | "ready_for_explicit_host_handoff_request"
  | "blocked_missing_approval"
  | "blocked_approval_mismatch"
  | "blocked_approval_expired";

export type PluginPackageMarketplaceLifecycleHostHandoffRequestKind =
  PluginPackageMarketplaceLifecycleApprovalHandoffPreflightHostKind;

export type PluginPackageMarketplaceLifecycleHostHandoffRequestOperatorCommand =
  | "request_metadata_host_handoff"
  | "request_install_update_host_handoff"
  | "request_activation_readiness_host_handoff"
  | "request_activation_host_handoff"
  | "collect_matching_approval"
  | "refresh_expired_approval";

export type PluginPackageMarketplaceLifecycleHostHandoffRequestNextAction =
  | "present_host_handoff_request"
  | "collect_matching_approval"
  | "refresh_expired_approval";

export interface PluginPackageMarketplaceLifecycleHostHandoffRequestInput {
  approvalHandoffPreflightView: PluginPackageMarketplaceLifecycleApprovalHandoffPreflightView;
  audience?: "operator" | "reviewer";
  includeRequestStates?: PluginPackageMarketplaceLifecycleHostHandoffRequestState[];
  includeHostKinds?: PluginPackageMarketplaceLifecycleHostHandoffRequestKind[];
  maxRequests?: number;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceLifecycleHostHandoffRequestItem {
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
  executionMode: "operator_only";
  requestState: PluginPackageMarketplaceLifecycleHostHandoffRequestState;
  hostActionAllowed: false;
  requestKind: PluginPackageMarketplaceLifecycleHostHandoffRequestKind;
  operatorCommand: PluginPackageMarketplaceLifecycleHostHandoffRequestOperatorCommand;
  nextAction: PluginPackageMarketplaceLifecycleHostHandoffRequestNextAction;
  requiredApprovalSubject: string;
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

export interface PluginPackageMarketplaceLifecycleHostHandoffRequestView {
  recordType: "mcp_plugin_package_marketplace_lifecycle_host_handoff_request_view";
  timestamp: string;
  catalogId: string;
  approvalHandoffPreflightRecordType: PluginPackageMarketplaceLifecycleApprovalHandoffPreflightView["recordType"];
  sourcePreflightCount: number;
  requestCount: number;
  audience: "operator" | "reviewer";
  requests: PluginPackageMarketplaceLifecycleHostHandoffRequestItem[];
  summary: {
    total: number;
    readyForExplicitHostHandoffRequest: number;
    blockedMissingApproval: number;
    blockedApprovalMismatch: number;
    blockedApprovalExpired: number;
    omittedByStateFilter: number;
    omittedByKindFilter: number;
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

const HOST_HANDOFF_REQUEST_WARNINGS = [
  "Plugin marketplace lifecycle host handoff requests are read-only descriptors derived from approval handoff preflight state.",
  "Ready requests package bounded metadata for an explicit operator/host handoff and never authorize Colony to perform host actions.",
  "Blocked requests preserve missing, mismatched, and expired approval reasons without copying approval signatures, raw URLs, or nested host actions.",
];

export function createPluginPackageMarketplaceLifecycleHostHandoffRequest(
  input: PluginPackageMarketplaceLifecycleHostHandoffRequestInput,
): PluginPackageMarketplaceLifecycleHostHandoffRequestView {
  const includedStates = normalizeIncludedStates(input.includeRequestStates);
  const includedKinds = normalizeIncludedKinds(input.includeHostKinds);
  const allRequests = input.approvalHandoffPreflightView.preflights.map(projectHostHandoffRequest);
  const stateScoped = allRequests.filter((request) => includedStates.has(request.requestState));
  const kindScoped = stateScoped.filter((request) => includedKinds.has(request.requestKind));
  const capped = kindScoped.slice(0, safeMaxRequests(input.maxRequests));

  return freezeView({
    recordType: "mcp_plugin_package_marketplace_lifecycle_host_handoff_request_view",
    timestamp: toIso(input.timestamp ?? new Date()),
    catalogId: safeId(input.approvalHandoffPreflightView.catalogId),
    approvalHandoffPreflightRecordType: input.approvalHandoffPreflightView.recordType,
    sourcePreflightCount: input.approvalHandoffPreflightView.preflightCount,
    requestCount: capped.length,
    audience: input.audience === "reviewer" ? "reviewer" : input.approvalHandoffPreflightView.audience,
    requests: capped,
    summary: summarizeRequests(
      allRequests,
      allRequests.length - stateScoped.length,
      stateScoped.length - kindScoped.length,
      kindScoped.length - capped.length,
    ),
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    warnings: [...HOST_HANDOFF_REQUEST_WARNINGS],
  });
}

function projectHostHandoffRequest(
  preflight: PluginPackageMarketplaceLifecycleApprovalHandoffPreflightItem,
): PluginPackageMarketplaceLifecycleHostHandoffRequestItem {
  const requestState = requestStateForPreflight(preflight.preflightState);
  const requestKind = requestKindForPreflight(preflight, requestState);
  const requiredApprovalSubject = safeLabel(preflight.hostHandoff.requiredApprovalSubject);
  return {
    requestId: `host-request-${safeId(preflight.preflightId)}`,
    preflightId: safeId(preflight.preflightId),
    handoffId: safeId(preflight.handoffId),
    reviewId: safeId(preflight.reviewId),
    packetId: safeId(preflight.packetId),
    stepId: safeId(preflight.stepId),
    phase: preflight.phase,
    entryId: safeId(preflight.entryId),
    displayName: safeLabel(preflight.displayName),
    lifecycleState: preflight.lifecycleState,
    actionKind: preflight.actionKind,
    executionMode: "operator_only",
    requestState,
    hostActionAllowed: false,
    requestKind,
    operatorCommand: operatorCommandForRequest(requestKind, requestState),
    nextAction: nextActionForRequest(requestState),
    requiredApprovalSubject,
    hostRequest: {
      requestKind,
      packageName: safeLabel(preflight.hostHandoff.packageName),
      packageVersion: safeLabel(preflight.hostHandoff.packageVersion),
      packageDigest: safeDigest(preflight.hostHandoff.packageDigest),
      sidecarId: safeLabel(preflight.hostHandoff.sidecarId),
      sidecarKind: safeLabel(preflight.hostHandoff.sidecarKind),
      approvalSubject: requiredApprovalSubject,
      source: "<redacted>",
      payloadMode: "descriptor_only",
    },
    operatorChecklist: checklistForRequest(preflight, requestState, requestKind),
    package: {
      name: safeLabel(preflight.package.name),
      version: safeLabel(preflight.package.version),
      digest: safeDigest(preflight.package.digest),
      source: "<redacted>",
    },
    sidecar: {
      id: safeLabel(preflight.sidecar.id),
      kind: safeLabel(preflight.sidecar.kind),
    },
  };
}

function requestStateForPreflight(
  state: PluginPackageMarketplaceLifecycleApprovalHandoffPreflightState,
): PluginPackageMarketplaceLifecycleHostHandoffRequestState {
  switch (state) {
    case "ready_for_host_handoff_preflight":
      return "ready_for_explicit_host_handoff_request";
    case "blocked_missing_approval":
      return "blocked_missing_approval";
    case "blocked_approval_mismatch":
      return "blocked_approval_mismatch";
    case "blocked_approval_expired":
      return "blocked_approval_expired";
  }
}

function requestKindForPreflight(
  preflight: PluginPackageMarketplaceLifecycleApprovalHandoffPreflightItem,
  state: PluginPackageMarketplaceLifecycleHostHandoffRequestState,
): PluginPackageMarketplaceLifecycleHostHandoffRequestKind {
  if (state !== "ready_for_explicit_host_handoff_request") return "approval_blocker";
  return preflight.hostHandoff.kind;
}

function operatorCommandForRequest(
  kind: PluginPackageMarketplaceLifecycleHostHandoffRequestKind,
  state: PluginPackageMarketplaceLifecycleHostHandoffRequestState,
): PluginPackageMarketplaceLifecycleHostHandoffRequestOperatorCommand {
  if (state === "blocked_approval_expired") return "refresh_expired_approval";
  if (state !== "ready_for_explicit_host_handoff_request") return "collect_matching_approval";
  switch (kind) {
    case "metadata":
      return "request_metadata_host_handoff";
    case "install_update":
      return "request_install_update_host_handoff";
    case "activation_readiness":
      return "request_activation_readiness_host_handoff";
    case "activation":
      return "request_activation_host_handoff";
    case "approval_blocker":
      return "collect_matching_approval";
  }
}

function nextActionForRequest(
  state: PluginPackageMarketplaceLifecycleHostHandoffRequestState,
): PluginPackageMarketplaceLifecycleHostHandoffRequestNextAction {
  switch (state) {
    case "ready_for_explicit_host_handoff_request":
      return "present_host_handoff_request";
    case "blocked_missing_approval":
    case "blocked_approval_mismatch":
      return "collect_matching_approval";
    case "blocked_approval_expired":
      return "refresh_expired_approval";
  }
}

function checklistForRequest(
  preflight: PluginPackageMarketplaceLifecycleApprovalHandoffPreflightItem,
  state: PluginPackageMarketplaceLifecycleHostHandoffRequestState,
  kind: PluginPackageMarketplaceLifecycleHostHandoffRequestKind,
): string[] {
  if (state === "blocked_missing_approval") {
    return [
      "Collect explicit approval matching the approval subject before presenting a host handoff request.",
      `Approval subject: ${preflight.hostHandoff.requiredApprovalSubject}.`,
    ];
  }
  if (state === "blocked_approval_mismatch") {
    return [
      "Discard mismatched approval evidence before presenting a host handoff request.",
      `Collect approval that exactly matches ${preflight.hostHandoff.requiredApprovalSubject}.`,
    ];
  }
  if (state === "blocked_approval_expired") {
    return [
      "Refresh expired approval evidence before presenting a host handoff request.",
      `Approval subject: ${preflight.hostHandoff.requiredApprovalSubject}.`,
    ];
  }

  return [
    `Present the ${kind.replace(/_/g, " ")} host handoff request to the operator before any host-owned execution.`,
    "Use this request packet as bounded metadata only; Colony has not performed the action.",
    "Require a separate execution path with matching approval evidence before invoking any injected host helper.",
    ...preflight.operatorChecklist,
  ]
    .map(safeChecklistText)
    .filter((item) => item !== "<redacted>")
    .slice(0, 8);
}

function summarizeRequests(
  requests: PluginPackageMarketplaceLifecycleHostHandoffRequestItem[],
  omittedByStateFilter: number,
  omittedByKindFilter: number,
  omittedByCap: number,
): PluginPackageMarketplaceLifecycleHostHandoffRequestView["summary"] {
  return {
    total: requests.length,
    readyForExplicitHostHandoffRequest: countState(requests, "ready_for_explicit_host_handoff_request"),
    blockedMissingApproval: countState(requests, "blocked_missing_approval"),
    blockedApprovalMismatch: countState(requests, "blocked_approval_mismatch"),
    blockedApprovalExpired: countState(requests, "blocked_approval_expired"),
    omittedByStateFilter: Math.max(0, omittedByStateFilter),
    omittedByKindFilter: Math.max(0, omittedByKindFilter),
    omittedByCap: Math.max(0, omittedByCap),
  };
}

function countState(
  requests: PluginPackageMarketplaceLifecycleHostHandoffRequestItem[],
  state: PluginPackageMarketplaceLifecycleHostHandoffRequestState,
): number {
  return requests.filter((request) => request.requestState === state).length;
}

function normalizeIncludedStates(
  includeStates: PluginPackageMarketplaceLifecycleHostHandoffRequestState[] | undefined,
): Set<PluginPackageMarketplaceLifecycleHostHandoffRequestState> {
  const all: PluginPackageMarketplaceLifecycleHostHandoffRequestState[] = [
    "ready_for_explicit_host_handoff_request",
    "blocked_missing_approval",
    "blocked_approval_mismatch",
    "blocked_approval_expired",
  ];
  if (includeStates === undefined || includeStates.length === 0) return new Set(all);
  return new Set(includeStates.filter((state) => all.includes(state)));
}

function normalizeIncludedKinds(
  includeKinds: PluginPackageMarketplaceLifecycleHostHandoffRequestKind[] | undefined,
): Set<PluginPackageMarketplaceLifecycleHostHandoffRequestKind> {
  const all: PluginPackageMarketplaceLifecycleHostHandoffRequestKind[] = [
    "metadata",
    "install_update",
    "activation_readiness",
    "activation",
    "approval_blocker",
  ];
  if (includeKinds === undefined || includeKinds.length === 0) return new Set(all);
  return new Set(includeKinds.filter((kind) => all.includes(kind)));
}

function safeMaxRequests(value: unknown): number {
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
  view: PluginPackageMarketplaceLifecycleHostHandoffRequestView,
): PluginPackageMarketplaceLifecycleHostHandoffRequestView {
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
