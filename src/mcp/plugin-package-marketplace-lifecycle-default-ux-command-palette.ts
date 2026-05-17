import type {
  PluginPackageMarketplaceLifecycleDefaultUxPlanCommandKind,
  PluginPackageMarketplaceLifecycleDefaultUxPlanNextAction,
  PluginPackageMarketplaceLifecycleDefaultUxPlanPrompt,
  PluginPackageMarketplaceLifecycleDefaultUxPlanView,
} from "./plugin-package-marketplace-lifecycle-default-ux-plan";
import type { PluginPackageMarketplaceLifecycleRunbookPhase } from "./plugin-package-marketplace-lifecycle-runbook";

export type PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntryState =
  | "ready_to_show_command"
  | "blocked_missing_approval"
  | "blocked_approval_mismatch"
  | "blocked_approval_expired";

export type PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteGroup =
  | "host_handoff_requests"
  | "approval_remediation";

export interface PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteInput {
  defaultUxPlanView: PluginPackageMarketplaceLifecycleDefaultUxPlanView;
  audience?: "operator" | "reviewer";
  includeGroups?: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteGroup[];
  includeStates?: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntryState[];
  maxEntries?: number;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntry {
  entryId: string;
  promptId: string;
  queueItemId: string;
  requestId: string;
  phase: PluginPackageMarketplaceLifecycleRunbookPhase;
  group: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteGroup;
  entryState: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntryState;
  commandKind: PluginPackageMarketplaceLifecycleDefaultUxPlanCommandKind;
  commandId: PluginPackageMarketplaceLifecycleDefaultUxPlanPrompt["defaultCommandId"];
  commandLabel: string;
  commandPreview: string;
  renderMode: "operator_prompt";
  executionMode: "operator_only";
  hostActionAllowed: false;
  paletteMutable: false;
  defaultLiveExecution: false;
  nextAction: PluginPackageMarketplaceLifecycleDefaultUxPlanNextAction;
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
    requestKind: PluginPackageMarketplaceLifecycleDefaultUxPlanPrompt["hostRequestSummary"]["requestKind"];
    payloadMode: "descriptor_only";
    approvalSubject: string;
    source: "<redacted>";
  };
  safetyBadges: string[];
}

export interface PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteView {
  recordType: "mcp_plugin_package_marketplace_lifecycle_default_ux_command_palette_view";
  timestamp: string;
  catalogId: string;
  defaultUxPlanRecordType: PluginPackageMarketplaceLifecycleDefaultUxPlanView["recordType"];
  sourcePromptCount: number;
  entryCount: number;
  audience: "operator" | "reviewer";
  groups: {
    hostHandoffRequests: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntry[];
    approvalRemediation: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntry[];
  };
  summary: {
    total: number;
    hostHandoffRequests: number;
    approvalRemediation: number;
    readyToShowCommand: number;
    blockedMissingApproval: number;
    blockedApprovalMismatch: number;
    blockedApprovalExpired: number;
    omittedByGroupFilter: number;
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

const COMMAND_PALETTE_WARNINGS = [
  "Plugin marketplace lifecycle default UX command palettes are read-only projections derived from default UX prompt plans.",
  "Command palette entries prepare operator display only and do not execute host requests, collect approvals, or activate sidecars.",
  "Command previews preserve descriptor-only handoff boundaries and redact package sources, registry URLs, approval signatures, and secrets.",
];

export function createPluginPackageMarketplaceLifecycleDefaultUxCommandPalette(
  input: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteInput,
): PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteView {
  const includedGroups = normalizeIncludedGroups(input.includeGroups);
  const includedStates = normalizeIncludedStates(input.includeStates);
  const allEntries = input.defaultUxPlanView.prompts.map(projectEntry);
  const groupScoped = allEntries.filter((entry) => includedGroups.has(entry.group));
  const stateScoped = groupScoped.filter((entry) => includedStates.has(entry.entryState));
  const capped = stateScoped.slice(0, safeMaxEntries(input.maxEntries));

  return freezeView({
    recordType: "mcp_plugin_package_marketplace_lifecycle_default_ux_command_palette_view",
    timestamp: toIso(input.timestamp ?? new Date()),
    catalogId: safeId(input.defaultUxPlanView.catalogId),
    defaultUxPlanRecordType: input.defaultUxPlanView.recordType,
    sourcePromptCount: input.defaultUxPlanView.promptCount,
    entryCount: capped.length,
    audience: input.audience === "reviewer" ? "reviewer" : input.defaultUxPlanView.audience,
    groups: {
      hostHandoffRequests: capped.filter((entry) => entry.group === "host_handoff_requests"),
      approvalRemediation: capped.filter((entry) => entry.group === "approval_remediation"),
    },
    summary: summarizeEntries(
      allEntries,
      allEntries.length - groupScoped.length,
      groupScoped.length - stateScoped.length,
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
    warnings: [...COMMAND_PALETTE_WARNINGS],
  });
}

function projectEntry(
  prompt: PluginPackageMarketplaceLifecycleDefaultUxPlanPrompt,
): PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntry {
  const entryState = stateForPrompt(prompt.itemState);
  const group = groupForEntryState(entryState);
  return {
    entryId: `palette-${safeId(prompt.promptId)}`,
    promptId: safeId(prompt.promptId),
    queueItemId: safeId(prompt.queueItemId),
    requestId: safeId(prompt.requestId),
    phase: prompt.phase,
    group,
    entryState,
    commandKind: prompt.commandKind,
    commandId: prompt.defaultCommandId,
    commandLabel: safeLabel(prompt.defaultCommandLabel),
    commandPreview: commandPreview(prompt.defaultCommandId, prompt.requestId),
    renderMode: "operator_prompt",
    executionMode: "operator_only",
    hostActionAllowed: false,
    paletteMutable: false,
    defaultLiveExecution: false,
    nextAction: prompt.nextAction,
    package: {
      name: safeLabel(prompt.package.name),
      version: safeLabel(prompt.package.version),
      digest: safeDigest(prompt.package.digest),
      source: "<redacted>",
    },
    sidecar: {
      id: safeLabel(prompt.sidecar.id),
      kind: safeLabel(prompt.sidecar.kind),
    },
    hostRequestSummary: {
      requestKind: prompt.hostRequestSummary.requestKind,
      payloadMode: "descriptor_only",
      approvalSubject: safeLabel(prompt.hostRequestSummary.approvalSubject),
      source: "<redacted>",
    },
    safetyBadges: safetyBadgesForState(entryState),
  };
}

function stateForPrompt(
  state: PluginPackageMarketplaceLifecycleDefaultUxPlanPrompt["itemState"],
): PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntryState {
  switch (state) {
    case "ready_to_present_default_prompt":
      return "ready_to_show_command";
    case "blocked_missing_approval":
      return "blocked_missing_approval";
    case "blocked_approval_mismatch":
      return "blocked_approval_mismatch";
    case "blocked_approval_expired":
      return "blocked_approval_expired";
  }
}

function groupForEntryState(
  state: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntryState,
): PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteGroup {
  return state === "ready_to_show_command" ? "host_handoff_requests" : "approval_remediation";
}

function commandPreview(
  commandId: PluginPackageMarketplaceLifecycleDefaultUxPlanPrompt["defaultCommandId"],
  requestId: string,
): string {
  return `${safeId(commandId)} --request ${safeId(requestId)} --mode descriptor-only --execution operator-only`;
}

function safetyBadgesForState(
  state: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntryState,
): string[] {
  const badges = ["read-only", "descriptor-only", "operator-only", "no-live-execution"];
  if (state !== "ready_to_show_command") badges.push("approval-required");
  return badges;
}

function summarizeEntries(
  entries: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntry[],
  omittedByGroupFilter: number,
  omittedByStateFilter: number,
  omittedByCap: number,
): PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteView["summary"] {
  return {
    total: entries.length,
    hostHandoffRequests: countGroup(entries, "host_handoff_requests"),
    approvalRemediation: countGroup(entries, "approval_remediation"),
    readyToShowCommand: countState(entries, "ready_to_show_command"),
    blockedMissingApproval: countState(entries, "blocked_missing_approval"),
    blockedApprovalMismatch: countState(entries, "blocked_approval_mismatch"),
    blockedApprovalExpired: countState(entries, "blocked_approval_expired"),
    omittedByGroupFilter: Math.max(0, omittedByGroupFilter),
    omittedByStateFilter: Math.max(0, omittedByStateFilter),
    omittedByCap: Math.max(0, omittedByCap),
  };
}

function countGroup(
  entries: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntry[],
  group: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteGroup,
): number {
  return entries.filter((entry) => entry.group === group).length;
}

function countState(
  entries: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntry[],
  state: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntryState,
): number {
  return entries.filter((entry) => entry.entryState === state).length;
}

function normalizeIncludedGroups(
  includeGroups: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteGroup[] | undefined,
): Set<PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteGroup> {
  const all: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteGroup[] = [
    "host_handoff_requests",
    "approval_remediation",
  ];
  if (includeGroups === undefined || includeGroups.length === 0) return new Set(all);
  return new Set(includeGroups.filter((group) => all.includes(group)));
}

function normalizeIncludedStates(
  includeStates: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntryState[] | undefined,
): Set<PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntryState> {
  const all: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntryState[] = [
    "ready_to_show_command",
    "blocked_missing_approval",
    "blocked_approval_mismatch",
    "blocked_approval_expired",
  ];
  if (includeStates === undefined || includeStates.length === 0) return new Set(all);
  return new Set(includeStates.filter((state) => all.includes(state)));
}

function safeMaxEntries(value: unknown): number {
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
  view: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteView,
): PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteView {
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
