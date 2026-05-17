import type {
  PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntry,
  PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntryState,
  PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteView,
} from "./plugin-package-marketplace-lifecycle-default-ux-command-palette";

export type PluginPackageMarketplaceLifecycleDefaultUxCommandBriefSection =
  | "ready_commands"
  | "approval_remediation";

export type PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState =
  | "ready_to_copy"
  | "blocked_missing_approval"
  | "blocked_approval_mismatch"
  | "blocked_approval_expired";

export interface PluginPackageMarketplaceLifecycleDefaultUxCommandBriefInput {
  commandPaletteView: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteView;
  audience?: "operator" | "reviewer";
  includeSections?: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefSection[];
  includeStates?: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState[];
  maxLines?: number;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLine {
  lineId: string;
  paletteEntryId: string;
  promptId: string;
  requestId: string;
  phase: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntry["phase"];
  section: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefSection;
  lineState: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState;
  commandId: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntry["commandId"];
  commandLabel: string;
  copyText: string;
  displayText: string;
  nextAction: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntry["nextAction"];
  executionMode: "operator_only";
  hostActionAllowed: false;
  briefMutable: false;
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
  safetyBadges: string[];
}

export interface PluginPackageMarketplaceLifecycleDefaultUxCommandBriefView {
  recordType: "mcp_plugin_package_marketplace_lifecycle_default_ux_command_brief_view";
  timestamp: string;
  catalogId: string;
  commandPaletteRecordType: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteView["recordType"];
  sourceEntryCount: number;
  lineCount: number;
  audience: "operator" | "reviewer";
  sections: {
    readyCommands: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLine[];
    approvalRemediation: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLine[];
  };
  summary: {
    total: number;
    readyCommands: number;
    approvalRemediation: number;
    readyToCopy: number;
    blockedMissingApproval: number;
    blockedApprovalMismatch: number;
    blockedApprovalExpired: number;
    omittedBySectionFilter: number;
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

const COMMAND_BRIEF_WARNINGS = [
  "Plugin marketplace lifecycle default UX command briefs are read-only projections derived from command palettes.",
  "Brief lines prepare copy-safe operator command text only and do not execute host requests, collect approvals, or activate sidecars.",
  "Brief display and copy text preserve descriptor-only handoff boundaries and redact package sources, registry URLs, approval signatures, and secrets.",
];

export function createPluginPackageMarketplaceLifecycleDefaultUxCommandBrief(
  input: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefInput,
): PluginPackageMarketplaceLifecycleDefaultUxCommandBriefView {
  const includedSections = normalizeIncludedSections(input.includeSections);
  const includedStates = normalizeIncludedStates(input.includeStates);
  const allEntries = [
    ...input.commandPaletteView.groups.hostHandoffRequests,
    ...input.commandPaletteView.groups.approvalRemediation,
  ];
  const allLines = allEntries.map(projectLine);
  const sectionScoped = allLines.filter((line) => includedSections.has(line.section));
  const stateScoped = sectionScoped.filter((line) => includedStates.has(line.lineState));
  const capped = stateScoped.slice(0, safeMaxLines(input.maxLines));

  return freezeView({
    recordType: "mcp_plugin_package_marketplace_lifecycle_default_ux_command_brief_view",
    timestamp: toIso(input.timestamp ?? new Date()),
    catalogId: safeId(input.commandPaletteView.catalogId),
    commandPaletteRecordType: input.commandPaletteView.recordType,
    sourceEntryCount: input.commandPaletteView.entryCount,
    lineCount: capped.length,
    audience: input.audience === "reviewer" ? "reviewer" : input.commandPaletteView.audience,
    sections: {
      readyCommands: capped.filter((line) => line.section === "ready_commands"),
      approvalRemediation: capped.filter((line) => line.section === "approval_remediation"),
    },
    summary: summarizeLines(
      allLines,
      allLines.length - sectionScoped.length,
      sectionScoped.length - stateScoped.length,
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
    warnings: [...COMMAND_BRIEF_WARNINGS],
  });
}

function projectLine(
  entry: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntry,
): PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLine {
  const lineState = lineStateForEntry(entry.entryState);
  const section = sectionForLineState(lineState);
  const packageName = safeLabel(entry.package.name);
  const commandLabel = safeLabel(entry.commandLabel);
  const requestId = safeId(entry.requestId);

  return {
    lineId: `brief-${safeId(entry.entryId)}`,
    paletteEntryId: safeId(entry.entryId),
    promptId: safeId(entry.promptId),
    requestId,
    phase: entry.phase,
    section,
    lineState,
    commandId: entry.commandId,
    commandLabel,
    copyText: safeCommandText(entry.commandPreview),
    displayText: `${commandLabel}: ${packageName} (request ${requestId})`,
    nextAction: entry.nextAction,
    executionMode: "operator_only",
    hostActionAllowed: false,
    briefMutable: false,
    defaultLiveExecution: false,
    package: {
      name: packageName,
      version: safeLabel(entry.package.version),
      digest: safeDigest(entry.package.digest),
      source: "<redacted>",
    },
    sidecar: {
      id: safeLabel(entry.sidecar.id),
      kind: safeLabel(entry.sidecar.kind),
    },
    safetyBadges: safeBadges(entry.safetyBadges, lineState),
  };
}

function lineStateForEntry(
  state: PluginPackageMarketplaceLifecycleDefaultUxCommandPaletteEntryState,
): PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState {
  switch (state) {
    case "ready_to_show_command":
      return "ready_to_copy";
    case "blocked_missing_approval":
      return "blocked_missing_approval";
    case "blocked_approval_mismatch":
      return "blocked_approval_mismatch";
    case "blocked_approval_expired":
      return "blocked_approval_expired";
  }
}

function sectionForLineState(
  state: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState,
): PluginPackageMarketplaceLifecycleDefaultUxCommandBriefSection {
  return state === "ready_to_copy" ? "ready_commands" : "approval_remediation";
}

function summarizeLines(
  lines: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLine[],
  omittedBySectionFilter: number,
  omittedByStateFilter: number,
  omittedByCap: number,
): PluginPackageMarketplaceLifecycleDefaultUxCommandBriefView["summary"] {
  return {
    total: lines.length,
    readyCommands: countSection(lines, "ready_commands"),
    approvalRemediation: countSection(lines, "approval_remediation"),
    readyToCopy: countState(lines, "ready_to_copy"),
    blockedMissingApproval: countState(lines, "blocked_missing_approval"),
    blockedApprovalMismatch: countState(lines, "blocked_approval_mismatch"),
    blockedApprovalExpired: countState(lines, "blocked_approval_expired"),
    omittedBySectionFilter: Math.max(0, omittedBySectionFilter),
    omittedByStateFilter: Math.max(0, omittedByStateFilter),
    omittedByCap: Math.max(0, omittedByCap),
  };
}

function countSection(
  lines: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLine[],
  section: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefSection,
): number {
  return lines.filter((line) => line.section === section).length;
}

function countState(
  lines: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLine[],
  state: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState,
): number {
  return lines.filter((line) => line.lineState === state).length;
}

function normalizeIncludedSections(
  includeSections: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefSection[] | undefined,
): Set<PluginPackageMarketplaceLifecycleDefaultUxCommandBriefSection> {
  const all: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefSection[] = [
    "ready_commands",
    "approval_remediation",
  ];
  if (includeSections === undefined || includeSections.length === 0) return new Set(all);
  return new Set(includeSections.filter((section) => all.includes(section)));
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

function safeMaxLines(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return Number.MAX_SAFE_INTEGER;
  return Math.min(value, 1000);
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

function safeBadges(
  badges: string[],
  lineState: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState,
): string[] {
  const clean = badges.map(safeLabel).filter((badge) => badge !== "<redacted>");
  if (lineState === "ready_to_copy") clean.push("copy-safe");
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
  view: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefView,
): PluginPackageMarketplaceLifecycleDefaultUxCommandBriefView {
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
