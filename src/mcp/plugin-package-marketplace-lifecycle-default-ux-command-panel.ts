import type {
  PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptLine,
  PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptSection,
  PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptView,
} from "./plugin-package-marketplace-lifecycle-default-ux-command-transcript";
import type { PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState } from "./plugin-package-marketplace-lifecycle-default-ux-command-brief";

export type PluginPackageMarketplaceLifecycleDefaultUxCommandPanelLane =
  | "ready_commands"
  | "approval_remediation"
  | "safety_summary";

export interface PluginPackageMarketplaceLifecycleDefaultUxCommandPanelInput {
  commandTranscriptView: PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptView;
  audience?: "operator" | "reviewer";
  includeLanes?: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelLane[];
  includeStates?: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState[];
  maxCards?: number;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceLifecycleDefaultUxCommandPanelCard {
  cardId: string;
  transcriptLineId: string;
  briefLineId: string;
  paletteEntryId: string;
  promptId: string;
  requestId: string;
  phase: PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptLine["phase"];
  lane: Exclude<PluginPackageMarketplaceLifecycleDefaultUxCommandPanelLane, "safety_summary">;
  cardState: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState;
  title: string;
  subtitle: string;
  body: string;
  copyText: string;
  terminalHint: string;
  nextAction: PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptLine["nextAction"];
  executionMode: "operator_only";
  hostActionAllowed: false;
  panelMutable: false;
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

export interface PluginPackageMarketplaceLifecycleDefaultUxCommandPanelView {
  recordType: "mcp_plugin_package_marketplace_lifecycle_default_ux_command_panel_view";
  timestamp: string;
  catalogId: string;
  commandTranscriptRecordType: PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptView["recordType"];
  sourceTranscriptLineCount: number;
  panelCardCount: number;
  audience: "operator" | "reviewer";
  panelTitle: "Plugin lifecycle commands";
  lanes: {
    readyCommands: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelCard[];
    approvalRemediation: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelCard[];
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

const COMMAND_PANEL_WARNINGS = [
  "Plugin marketplace lifecycle default UX command panels are read-only projections derived from command transcripts.",
  "Panel cards are operator display helpers only and do not execute host requests, collect approvals, or activate sidecars.",
  "Panel fields preserve descriptor-only handoff boundaries and redact package sources, registry URLs, approval signatures, and secrets.",
];

export function createPluginPackageMarketplaceLifecycleDefaultUxCommandPanel(
  input: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelInput,
): PluginPackageMarketplaceLifecycleDefaultUxCommandPanelView {
  const includedLanes = normalizeIncludedLanes(input.includeLanes);
  const includedStates = normalizeIncludedStates(input.includeStates);
  const allCards = [
    ...input.commandTranscriptView.sections.readyCommands,
    ...input.commandTranscriptView.sections.approvalRemediation,
  ].map(projectCard);
  const laneScoped = allCards.filter((card) => includedLanes.has(card.lane));
  const stateScoped = laneScoped.filter((card) => includedStates.has(card.cardState));
  const capped = stateScoped.slice(0, safeMaxCards(input.maxCards));
  const safetySummary = includedLanes.has("safety_summary")
    ? input.commandTranscriptView.sections.safetySummary.map(safeSummaryLine)
    : [];

  return freezeView({
    recordType: "mcp_plugin_package_marketplace_lifecycle_default_ux_command_panel_view",
    timestamp: toIso(input.timestamp ?? new Date()),
    catalogId: safeId(input.commandTranscriptView.catalogId),
    commandTranscriptRecordType: input.commandTranscriptView.recordType,
    sourceTranscriptLineCount: input.commandTranscriptView.transcriptLineCount,
    panelCardCount: capped.length,
    audience: input.audience === "reviewer" ? "reviewer" : input.commandTranscriptView.audience,
    panelTitle: "Plugin lifecycle commands",
    lanes: {
      readyCommands: capped.filter((card) => card.lane === "ready_commands"),
      approvalRemediation: capped.filter((card) => card.lane === "approval_remediation"),
      safetySummary,
    },
    summary: summarizeCards(
      allCards,
      safetySummary.length,
      allCards.length - laneScoped.length,
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
    warnings: [...COMMAND_PANEL_WARNINGS],
  });
}

function projectCard(
  line: PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptLine,
): PluginPackageMarketplaceLifecycleDefaultUxCommandPanelCard {
  const packageName = safeLabel(line.package.name);
  const requestId = safeId(line.requestId);
  const commandLabel = safeLabel(line.commandLabel);

  return {
    cardId: `panel-${safeId(line.transcriptLineId)}`,
    transcriptLineId: safeId(line.transcriptLineId),
    briefLineId: safeId(line.briefLineId),
    paletteEntryId: safeId(line.paletteEntryId),
    promptId: safeId(line.promptId),
    requestId,
    phase: line.phase,
    lane: line.section,
    cardState: line.lineState,
    title: commandLabel,
    subtitle: `${packageName} v${safeLabel(line.package.version)} request ${requestId}`,
    body: safeText(line.text),
    copyText: safeCommandText(line.copyText),
    terminalHint: safeText(line.terminalHint),
    nextAction: line.nextAction,
    executionMode: "operator_only",
    hostActionAllowed: false,
    panelMutable: false,
    defaultLiveExecution: false,
    package: {
      name: packageName,
      version: safeLabel(line.package.version),
      digest: safeDigest(line.package.digest),
      source: "<redacted>",
    },
    sidecar: {
      id: safeLabel(line.sidecar.id),
      kind: safeLabel(line.sidecar.kind),
    },
    badges: safeBadges(line.safetyBadges, line.lineState),
  };
}

function summarizeCards(
  cards: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelCard[],
  safetySummaryLines: number,
  omittedByLaneFilter: number,
  omittedByStateFilter: number,
  omittedByCap: number,
): PluginPackageMarketplaceLifecycleDefaultUxCommandPanelView["summary"] {
  return {
    total: cards.length,
    readyCommands: countLane(cards, "ready_commands"),
    approvalRemediation: countLane(cards, "approval_remediation"),
    safetySummaryLines,
    readyToCopy: countState(cards, "ready_to_copy"),
    blockedMissingApproval: countState(cards, "blocked_missing_approval"),
    blockedApprovalMismatch: countState(cards, "blocked_approval_mismatch"),
    blockedApprovalExpired: countState(cards, "blocked_approval_expired"),
    omittedByLaneFilter: Math.max(0, omittedByLaneFilter),
    omittedByStateFilter: Math.max(0, omittedByStateFilter),
    omittedByCap: Math.max(0, omittedByCap),
  };
}

function countLane(
  cards: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelCard[],
  lane: Exclude<PluginPackageMarketplaceLifecycleDefaultUxCommandPanelLane, "safety_summary">,
): number {
  return cards.filter((card) => card.lane === lane).length;
}

function countState(
  cards: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelCard[],
  state: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState,
): number {
  return cards.filter((card) => card.cardState === state).length;
}

function normalizeIncludedLanes(
  includeLanes: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelLane[] | undefined,
): Set<PluginPackageMarketplaceLifecycleDefaultUxCommandPanelLane> {
  const all: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelLane[] = [
    "ready_commands",
    "approval_remediation",
    "safety_summary",
  ];
  if (includeLanes === undefined || includeLanes.length === 0) return new Set(all);
  return new Set(includeLanes.filter((lane) => all.includes(lane)));
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

function safeMaxCards(value: unknown): number {
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
  return looksSecret(clean) || looksHighEntropy(clean) || clean.includes("://") ? "<redacted>" : clean.slice(0, 280);
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
  if (state === "ready_to_copy") clean.push("panel-ready");
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
  view: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelView,
): PluginPackageMarketplaceLifecycleDefaultUxCommandPanelView {
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
