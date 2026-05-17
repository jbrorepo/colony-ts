import type {
  PluginPackageMarketplaceLifecycleOperatorQueueAction,
  PluginPackageMarketplaceLifecycleOperatorQueueItem,
  PluginPackageMarketplaceLifecycleOperatorQueueItemState,
  PluginPackageMarketplaceLifecycleOperatorQueueView,
} from "./plugin-package-marketplace-lifecycle-operator-queue";
import type { PluginPackageMarketplaceLifecycleRunbookPhase } from "./plugin-package-marketplace-lifecycle-runbook";
import type { PluginPackageMarketplaceLifecycleState } from "./plugin-package-marketplace-lifecycle-status";

export type PluginPackageMarketplaceLifecycleDefaultUxPlanItemState =
  | "ready_to_present_default_prompt"
  | "blocked_missing_approval"
  | "blocked_approval_mismatch"
  | "blocked_approval_expired";

export type PluginPackageMarketplaceLifecycleDefaultUxPlanCommandKind =
  | "metadata_prompt"
  | "install_update_prompt"
  | "activation_readiness_prompt"
  | "activation_prompt"
  | "approval_collection_prompt"
  | "approval_refresh_prompt";

export type PluginPackageMarketplaceLifecycleDefaultUxPlanNextAction =
  | "present_default_prompt"
  | "collect_matching_approval"
  | "refresh_expired_approval";

export interface PluginPackageMarketplaceLifecycleDefaultUxPlanInput {
  operatorQueueView: PluginPackageMarketplaceLifecycleOperatorQueueView;
  audience?: "operator" | "reviewer";
  includeCommandKinds?: PluginPackageMarketplaceLifecycleDefaultUxPlanCommandKind[];
  includeStates?: PluginPackageMarketplaceLifecycleDefaultUxPlanItemState[];
  maxPrompts?: number;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceLifecycleDefaultUxPlanPrompt {
  promptId: string;
  queueItemId: string;
  requestId: string;
  phase: PluginPackageMarketplaceLifecycleRunbookPhase;
  entryId: string;
  displayName: string;
  lifecycleState: PluginPackageMarketplaceLifecycleState;
  sourceQueueAction: PluginPackageMarketplaceLifecycleOperatorQueueAction;
  commandKind: PluginPackageMarketplaceLifecycleDefaultUxPlanCommandKind;
  itemState: PluginPackageMarketplaceLifecycleDefaultUxPlanItemState;
  displayTitle: string;
  displaySummary: string;
  defaultCommandLabel: string;
  defaultCommandId:
    | "plugin.lifecycle.request.metadata"
    | "plugin.lifecycle.request.install_update"
    | "plugin.lifecycle.request.activation_readiness"
    | "plugin.lifecycle.request.activation"
    | "plugin.lifecycle.collect_approval"
    | "plugin.lifecycle.refresh_approval";
  sourceRequestCommand: PluginPackageMarketplaceLifecycleOperatorQueueItem["requestCommand"];
  nextAction: PluginPackageMarketplaceLifecycleDefaultUxPlanNextAction;
  executionMode: "operator_only";
  hostActionAllowed: false;
  promptMutable: false;
  defaultLiveExecution: false;
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
  hostRequestSummary: {
    requestKind: PluginPackageMarketplaceLifecycleOperatorQueueItem["requestKind"];
    payloadMode: "descriptor_only";
    approvalSubject: string;
    source: "<redacted>";
  };
  operatorChecklist: string[];
}

export interface PluginPackageMarketplaceLifecycleDefaultUxPlanView {
  recordType: "mcp_plugin_package_marketplace_lifecycle_default_ux_plan_view";
  timestamp: string;
  catalogId: string;
  operatorQueueRecordType: PluginPackageMarketplaceLifecycleOperatorQueueView["recordType"];
  sourceQueueItemCount: number;
  promptCount: number;
  audience: "operator" | "reviewer";
  prompts: PluginPackageMarketplaceLifecycleDefaultUxPlanPrompt[];
  summary: {
    total: number;
    metadataPrompts: number;
    installUpdatePrompts: number;
    activationReadinessPrompts: number;
    activationPrompts: number;
    approvalCollectionPrompts: number;
    approvalRefreshPrompts: number;
    readyToPresentDefaultPrompt: number;
    blockedMissingApproval: number;
    blockedApprovalMismatch: number;
    blockedApprovalExpired: number;
    omittedByKindFilter: number;
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

const DEFAULT_UX_PLAN_WARNINGS = [
  "Plugin marketplace lifecycle default UX plans are read-only projections derived from operator queue descriptors.",
  "Default prompts prepare operator presentation only and do not execute host requests, collect approvals, or activate sidecars.",
  "Prompt descriptors preserve descriptor-only handoff boundaries and redact package sources, registry URLs, approval signatures, and secrets.",
];

export function createPluginPackageMarketplaceLifecycleDefaultUxPlan(
  input: PluginPackageMarketplaceLifecycleDefaultUxPlanInput,
): PluginPackageMarketplaceLifecycleDefaultUxPlanView {
  const includedKinds = normalizeIncludedCommandKinds(input.includeCommandKinds);
  const includedStates = normalizeIncludedStates(input.includeStates);
  const sourceItems = flattenQueueItems(input.operatorQueueView);
  const allPrompts = sourceItems.map(projectPrompt);
  const kindScoped = allPrompts.filter((prompt) => includedKinds.has(prompt.commandKind));
  const stateScoped = kindScoped.filter((prompt) => includedStates.has(prompt.itemState));
  const capped = stateScoped.slice(0, safeMaxPrompts(input.maxPrompts));

  return freezeView({
    recordType: "mcp_plugin_package_marketplace_lifecycle_default_ux_plan_view",
    timestamp: toIso(input.timestamp ?? new Date()),
    catalogId: safeId(input.operatorQueueView.catalogId),
    operatorQueueRecordType: input.operatorQueueView.recordType,
    sourceQueueItemCount: input.operatorQueueView.queueItemCount,
    promptCount: capped.length,
    audience: input.audience === "reviewer" ? "reviewer" : input.operatorQueueView.audience,
    prompts: capped,
    summary: summarizePrompts(
      allPrompts,
      allPrompts.length - kindScoped.length,
      kindScoped.length - stateScoped.length,
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
    warnings: [...DEFAULT_UX_PLAN_WARNINGS],
  });
}

function flattenQueueItems(
  queue: PluginPackageMarketplaceLifecycleOperatorQueueView,
): PluginPackageMarketplaceLifecycleOperatorQueueItem[] {
  return [
    ...queue.lanes.approvalBlockers,
    ...queue.lanes.metadataRequests,
    ...queue.lanes.installUpdateRequests,
    ...queue.lanes.activationReadinessRequests,
    ...queue.lanes.activationRequests,
  ];
}

function projectPrompt(
  item: PluginPackageMarketplaceLifecycleOperatorQueueItem,
): PluginPackageMarketplaceLifecycleDefaultUxPlanPrompt {
  const itemState = promptStateForQueueItem(item.itemState);
  const commandKind = commandKindForItem(item, itemState);
  const command = defaultCommandForKind(commandKind);
  return {
    promptId: `default-ux-${safeId(item.queueItemId)}`,
    queueItemId: safeId(item.queueItemId),
    requestId: safeId(item.requestId),
    phase: item.phase,
    entryId: safeId(item.entryId),
    displayName: safeLabel(item.displayName),
    lifecycleState: item.lifecycleState,
    sourceQueueAction: item.operatorAction,
    commandKind,
    itemState,
    displayTitle: displayTitleForKind(commandKind, item),
    displaySummary: displaySummaryForItem(commandKind, itemState, item),
    defaultCommandLabel: command.label,
    defaultCommandId: command.id,
    sourceRequestCommand: item.requestCommand,
    nextAction: nextActionForPrompt(itemState),
    executionMode: "operator_only",
    hostActionAllowed: false,
    promptMutable: false,
    defaultLiveExecution: false,
    package: {
      name: safeLabel(item.package.name),
      version: safeLabel(item.package.version),
      digest: safeDigest(item.package.digest),
      source: "<redacted>",
    },
    sidecar: {
      id: safeLabel(item.sidecar.id),
      kind: safeLabel(item.sidecar.kind),
    },
    hostRequestSummary: {
      requestKind: item.hostRequest.requestKind,
      payloadMode: "descriptor_only",
      approvalSubject: safeLabel(item.hostRequest.approvalSubject),
      source: "<redacted>",
    },
    operatorChecklist: item.operatorChecklist.map(safeChecklistText).filter((entry) => entry !== "<redacted>").slice(0, 8),
  };
}

function promptStateForQueueItem(
  state: PluginPackageMarketplaceLifecycleOperatorQueueItemState,
): PluginPackageMarketplaceLifecycleDefaultUxPlanItemState {
  switch (state) {
    case "ready_for_operator_presentation":
      return "ready_to_present_default_prompt";
    case "blocked_missing_approval":
      return "blocked_missing_approval";
    case "blocked_approval_mismatch":
      return "blocked_approval_mismatch";
    case "blocked_approval_expired":
      return "blocked_approval_expired";
  }
}

function commandKindForItem(
  item: PluginPackageMarketplaceLifecycleOperatorQueueItem,
  state: PluginPackageMarketplaceLifecycleDefaultUxPlanItemState,
): PluginPackageMarketplaceLifecycleDefaultUxPlanCommandKind {
  if (state === "blocked_approval_expired") return "approval_refresh_prompt";
  if (state !== "ready_to_present_default_prompt") return "approval_collection_prompt";
  switch (item.lane) {
    case "metadata_requests":
      return "metadata_prompt";
    case "install_update_requests":
      return "install_update_prompt";
    case "activation_readiness_requests":
      return "activation_readiness_prompt";
    case "activation_requests":
      return "activation_prompt";
    case "approval_blockers":
      return "approval_collection_prompt";
  }
}

function defaultCommandForKind(
  kind: PluginPackageMarketplaceLifecycleDefaultUxPlanCommandKind,
): {
  label: string;
  id: PluginPackageMarketplaceLifecycleDefaultUxPlanPrompt["defaultCommandId"];
} {
  switch (kind) {
    case "metadata_prompt":
      return { label: "Request metadata handoff", id: "plugin.lifecycle.request.metadata" };
    case "install_update_prompt":
      return { label: "Request install/update handoff", id: "plugin.lifecycle.request.install_update" };
    case "activation_readiness_prompt":
      return { label: "Request activation-readiness handoff", id: "plugin.lifecycle.request.activation_readiness" };
    case "activation_prompt":
      return { label: "Request activation handoff", id: "plugin.lifecycle.request.activation" };
    case "approval_collection_prompt":
      return { label: "Collect matching approval", id: "plugin.lifecycle.collect_approval" };
    case "approval_refresh_prompt":
      return { label: "Refresh expired approval", id: "plugin.lifecycle.refresh_approval" };
  }
}

function displayTitleForKind(
  kind: PluginPackageMarketplaceLifecycleDefaultUxPlanCommandKind,
  item: PluginPackageMarketplaceLifecycleOperatorQueueItem,
): string {
  const name = safeLabel(item.displayName);
  switch (kind) {
    case "metadata_prompt":
      return `Metadata handoff ready: ${name}`;
    case "install_update_prompt":
      return `Install/update handoff ready: ${name}`;
    case "activation_readiness_prompt":
      return `Activation-readiness handoff ready: ${name}`;
    case "activation_prompt":
      return `Activation handoff ready: ${name}`;
    case "approval_collection_prompt":
      return `Approval required: ${name}`;
    case "approval_refresh_prompt":
      return `Approval refresh required: ${name}`;
  }
}

function displaySummaryForItem(
  kind: PluginPackageMarketplaceLifecycleDefaultUxPlanCommandKind,
  state: PluginPackageMarketplaceLifecycleDefaultUxPlanItemState,
  item: PluginPackageMarketplaceLifecycleOperatorQueueItem,
): string {
  const packageName = safeLabel(item.package.name);
  const sidecarId = safeLabel(item.sidecar.id);
  if (state === "ready_to_present_default_prompt") {
    return `${defaultCommandForKind(kind).label} for ${packageName} using descriptor-only host request ${safeId(item.requestId)} and sidecar ${sidecarId}.`;
  }
  if (state === "blocked_approval_expired") {
    return `Refresh expired approval before presenting descriptor-only host request ${safeId(item.requestId)} for ${packageName}.`;
  }
  return `Collect matching approval before presenting descriptor-only host request ${safeId(item.requestId)} for ${packageName}.`;
}

function nextActionForPrompt(
  state: PluginPackageMarketplaceLifecycleDefaultUxPlanItemState,
): PluginPackageMarketplaceLifecycleDefaultUxPlanNextAction {
  switch (state) {
    case "ready_to_present_default_prompt":
      return "present_default_prompt";
    case "blocked_missing_approval":
    case "blocked_approval_mismatch":
      return "collect_matching_approval";
    case "blocked_approval_expired":
      return "refresh_expired_approval";
  }
}

function summarizePrompts(
  prompts: PluginPackageMarketplaceLifecycleDefaultUxPlanPrompt[],
  omittedByKindFilter: number,
  omittedByStateFilter: number,
  omittedByCap: number,
): PluginPackageMarketplaceLifecycleDefaultUxPlanView["summary"] {
  return {
    total: prompts.length,
    metadataPrompts: countKind(prompts, "metadata_prompt"),
    installUpdatePrompts: countKind(prompts, "install_update_prompt"),
    activationReadinessPrompts: countKind(prompts, "activation_readiness_prompt"),
    activationPrompts: countKind(prompts, "activation_prompt"),
    approvalCollectionPrompts: countKind(prompts, "approval_collection_prompt"),
    approvalRefreshPrompts: countKind(prompts, "approval_refresh_prompt"),
    readyToPresentDefaultPrompt: countState(prompts, "ready_to_present_default_prompt"),
    blockedMissingApproval: countState(prompts, "blocked_missing_approval"),
    blockedApprovalMismatch: countState(prompts, "blocked_approval_mismatch"),
    blockedApprovalExpired: countState(prompts, "blocked_approval_expired"),
    omittedByKindFilter: Math.max(0, omittedByKindFilter),
    omittedByStateFilter: Math.max(0, omittedByStateFilter),
    omittedByCap: Math.max(0, omittedByCap),
  };
}

function countKind(
  prompts: PluginPackageMarketplaceLifecycleDefaultUxPlanPrompt[],
  kind: PluginPackageMarketplaceLifecycleDefaultUxPlanCommandKind,
): number {
  return prompts.filter((prompt) => prompt.commandKind === kind).length;
}

function countState(
  prompts: PluginPackageMarketplaceLifecycleDefaultUxPlanPrompt[],
  state: PluginPackageMarketplaceLifecycleDefaultUxPlanItemState,
): number {
  return prompts.filter((prompt) => prompt.itemState === state).length;
}

function normalizeIncludedCommandKinds(
  includeCommandKinds: PluginPackageMarketplaceLifecycleDefaultUxPlanCommandKind[] | undefined,
): Set<PluginPackageMarketplaceLifecycleDefaultUxPlanCommandKind> {
  const all: PluginPackageMarketplaceLifecycleDefaultUxPlanCommandKind[] = [
    "metadata_prompt",
    "install_update_prompt",
    "activation_readiness_prompt",
    "activation_prompt",
    "approval_collection_prompt",
    "approval_refresh_prompt",
  ];
  if (includeCommandKinds === undefined || includeCommandKinds.length === 0) return new Set(all);
  return new Set(includeCommandKinds.filter((kind) => all.includes(kind)));
}

function normalizeIncludedStates(
  includeStates: PluginPackageMarketplaceLifecycleDefaultUxPlanItemState[] | undefined,
): Set<PluginPackageMarketplaceLifecycleDefaultUxPlanItemState> {
  const all: PluginPackageMarketplaceLifecycleDefaultUxPlanItemState[] = [
    "ready_to_present_default_prompt",
    "blocked_missing_approval",
    "blocked_approval_mismatch",
    "blocked_approval_expired",
  ];
  if (includeStates === undefined || includeStates.length === 0) return new Set(all);
  return new Set(includeStates.filter((state) => all.includes(state)));
}

function safeMaxPrompts(value: unknown): number {
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
  return looksSecret(clean) || looksHighEntropy(clean) || clean.includes("://") ? "<redacted>" : clean.slice(0, 120);
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
  view: PluginPackageMarketplaceLifecycleDefaultUxPlanView,
): PluginPackageMarketplaceLifecycleDefaultUxPlanView {
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
