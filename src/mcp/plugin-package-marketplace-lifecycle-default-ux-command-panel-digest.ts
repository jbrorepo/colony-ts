import type {
  PluginPackageMarketplaceLifecycleDefaultUxCommandPanelCard,
  PluginPackageMarketplaceLifecycleDefaultUxCommandPanelView,
} from "./plugin-package-marketplace-lifecycle-default-ux-command-panel";
import type { PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState } from "./plugin-package-marketplace-lifecycle-default-ux-command-brief";

export type PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestGroup =
  | "ready_commands"
  | "approval_remediation"
  | "safety_summary";

export interface PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestInput {
  commandPanelView: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelView;
  audience?: "operator" | "reviewer";
  includeGroups?: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestGroup[];
  includeStates?: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState[];
  maxItems?: number;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestItem {
  digestItemId: string;
  cardId: string;
  transcriptLineId: string;
  briefLineId: string;
  requestId: string;
  phase: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelCard["phase"];
  group: Exclude<PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestGroup, "safety_summary">;
  itemState: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState;
  heading: string;
  detail: string;
  operatorLine: string;
  copyText: string;
  terminalHint: string;
  nextAction: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelCard["nextAction"];
  executionMode: "operator_only";
  hostActionAllowed: false;
  digestMutable: false;
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
  badges: string[];
}

export interface PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestView {
  recordType: "mcp_plugin_package_marketplace_lifecycle_default_ux_command_panel_digest_view";
  timestamp: string;
  catalogId: string;
  commandPanelRecordType: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelView["recordType"];
  sourcePanelCardCount: number;
  digestItemCount: number;
  audience: "operator" | "reviewer";
  digestTitle: "Plugin lifecycle command digest";
  groups: {
    readyCommands: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestItem[];
    approvalRemediation: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestItem[];
    safetySummary: string[];
  };
  summary: {
    total: number;
    readyCommands: number;
    approvalRemediation: number;
    safetySummaryLines: number;
    readyToCopy: number;
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

const COMMAND_PANEL_DIGEST_WARNINGS = [
  "Plugin marketplace lifecycle default UX command panel digests are read-only projections derived from command panels.",
  "Digest items are summary and clipboard helpers only; they do not execute host requests, collect approvals, or activate sidecars.",
  "Digest fields preserve descriptor-only handoff boundaries and redact package sources, registry URLs, approval signatures, and secrets.",
];

export function createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigest(
  input: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestInput,
): PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestView {
  const includedGroups = normalizeIncludedGroups(input.includeGroups);
  const includedStates = normalizeIncludedStates(input.includeStates);
  const allItems = [
    ...input.commandPanelView.lanes.readyCommands,
    ...input.commandPanelView.lanes.approvalRemediation,
  ].map(projectDigestItem);
  const groupScoped = allItems.filter((item) => includedGroups.has(item.group));
  const stateScoped = groupScoped.filter((item) => includedStates.has(item.itemState));
  const capped = stateScoped.slice(0, safeMaxItems(input.maxItems));
  const safetySummary = includedGroups.has("safety_summary")
    ? input.commandPanelView.lanes.safetySummary.map(safeSummaryLine)
    : [];

  return freezeView({
    recordType: "mcp_plugin_package_marketplace_lifecycle_default_ux_command_panel_digest_view",
    timestamp: toIso(input.timestamp ?? new Date()),
    catalogId: safeId(input.commandPanelView.catalogId),
    commandPanelRecordType: input.commandPanelView.recordType,
    sourcePanelCardCount: input.commandPanelView.panelCardCount,
    digestItemCount: capped.length,
    audience: input.audience === "reviewer" ? "reviewer" : input.commandPanelView.audience,
    digestTitle: "Plugin lifecycle command digest",
    groups: {
      readyCommands: capped.filter((item) => item.group === "ready_commands"),
      approvalRemediation: capped.filter((item) => item.group === "approval_remediation"),
      safetySummary,
    },
    summary: summarizeItems(
      allItems,
      safetySummary.length,
      allItems.length - groupScoped.length,
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
    warnings: [...COMMAND_PANEL_DIGEST_WARNINGS],
  });
}

function projectDigestItem(
  card: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelCard,
): PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestItem {
  const heading = safeText(card.title);
  const detail = safeText(card.subtitle);
  const body = safeText(card.body);

  return {
    digestItemId: `digest-${safeId(card.cardId)}`,
    cardId: safeId(card.cardId),
    transcriptLineId: safeId(card.transcriptLineId),
    briefLineId: safeId(card.briefLineId),
    requestId: safeId(card.requestId),
    phase: card.phase,
    group: card.lane,
    itemState: card.cardState,
    heading,
    detail,
    operatorLine: safeText(`${heading} - ${body}`),
    copyText: safeCommandText(card.copyText),
    terminalHint: safeText(card.terminalHint),
    nextAction: card.nextAction,
    executionMode: "operator_only",
    hostActionAllowed: false,
    digestMutable: false,
    defaultLiveExecution: false,
    package: {
      name: safeLabel(card.package.name),
      version: safeLabel(card.package.version),
      digest: safeDigest(card.package.digest),
      source: "<redacted>",
    },
    sidecar: {
      id: safeLabel(card.sidecar.id),
      kind: safeLabel(card.sidecar.kind),
    },
    badges: safeBadges(card.badges, card.cardState),
  };
}

function summarizeItems(
  items: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestItem[],
  safetySummaryLines: number,
  omittedByGroupFilter: number,
  omittedByStateFilter: number,
  omittedByCap: number,
): PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestView["summary"] {
  return {
    total: items.length,
    readyCommands: countGroup(items, "ready_commands"),
    approvalRemediation: countGroup(items, "approval_remediation"),
    safetySummaryLines,
    readyToCopy: countState(items, "ready_to_copy"),
    blockedMissingApproval: countState(items, "blocked_missing_approval"),
    blockedApprovalMismatch: countState(items, "blocked_approval_mismatch"),
    blockedApprovalExpired: countState(items, "blocked_approval_expired"),
    omittedByGroupFilter: Math.max(0, omittedByGroupFilter),
    omittedByStateFilter: Math.max(0, omittedByStateFilter),
    omittedByCap: Math.max(0, omittedByCap),
  };
}

function countGroup(
  items: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestItem[],
  group: Exclude<PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestGroup, "safety_summary">,
): number {
  return items.filter((item) => item.group === group).length;
}

function countState(
  items: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestItem[],
  state: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState,
): number {
  return items.filter((item) => item.itemState === state).length;
}

function normalizeIncludedGroups(
  includeGroups: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestGroup[] | undefined,
): Set<PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestGroup> {
  const all: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestGroup[] = [
    "ready_commands",
    "approval_remediation",
    "safety_summary",
  ];
  if (includeGroups === undefined || includeGroups.length === 0) return new Set(all);
  return new Set(includeGroups.filter((group) => all.includes(group)));
}

function normalizeIncludedStates(
  includeStates: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState[] | undefined,
): Set<PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState> {
  const all: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState[] = [
    "ready_to_copy",
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

function safeSummaryLine(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "Safety summary redacted.";
  const clean = value.replace(/[\0\r\n]/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length === 0 || /SHOULD_NOT_LEAK/i.test(clean) || clean.includes("://") || looksHighEntropy(clean)) {
    return "Safety summary redacted.";
  }
  return clean.slice(0, 280);
}

function safeId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]{1,180}$/.test(value) || looksSecret(value)) {
    return "<redacted>";
  }
  return value;
}

function safeCommandText(value: unknown): string {
  if (typeof value !== "string") return "<redacted>";
  const clean = value.replace(/[\0\r\n]/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length === 0 || looksSecret(clean) || clean.includes("://")) return "<redacted>";
  return /^[A-Za-z0-9._ -]+$/.test(clean) ? clean.slice(0, 240) : "<redacted>";
}

function safeText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "<redacted>";
  const clean = value.replace(/[\0\r\n]/g, " ").replace(/\s+/g, " ").trim();
  return looksSecret(clean) || looksHighEntropy(clean) || clean.includes("://") ? "<redacted>" : clean.slice(0, 360);
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

function safeBadges(badges: string[], state: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState): string[] {
  const clean = badges.map(safeLabel).filter((badge) => badge !== "<redacted>");
  if (state === "ready_to_copy") clean.push("digest-ready");
  return Array.from(new Set(clean));
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
  view: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestView,
): PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestView {
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
