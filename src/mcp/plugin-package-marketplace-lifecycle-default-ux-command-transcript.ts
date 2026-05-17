import type {
  PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLine,
  PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState,
  PluginPackageMarketplaceLifecycleDefaultUxCommandBriefSection,
  PluginPackageMarketplaceLifecycleDefaultUxCommandBriefView,
} from "./plugin-package-marketplace-lifecycle-default-ux-command-brief";

export type PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptSection =
  | PluginPackageMarketplaceLifecycleDefaultUxCommandBriefSection
  | "safety_summary";

export interface PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptInput {
  commandBriefView: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefView;
  audience?: "operator" | "reviewer";
  includeSections?: PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptSection[];
  includeStates?: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState[];
  maxLines?: number;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptLine {
  transcriptLineId: string;
  briefLineId: string;
  paletteEntryId: string;
  promptId: string;
  requestId: string;
  phase: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLine["phase"];
  section: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefSection;
  lineState: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState;
  commandId: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLine["commandId"];
  commandLabel: string;
  text: string;
  copyText: string;
  terminalHint: string;
  nextAction: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLine["nextAction"];
  executionMode: "operator_only";
  hostActionAllowed: false;
  transcriptMutable: false;
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

export interface PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptView {
  recordType: "mcp_plugin_package_marketplace_lifecycle_default_ux_command_transcript_view";
  timestamp: string;
  catalogId: string;
  commandBriefRecordType: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefView["recordType"];
  sourceLineCount: number;
  transcriptLineCount: number;
  audience: "operator" | "reviewer";
  sections: {
    readyCommands: PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptLine[];
    approvalRemediation: PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptLine[];
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

const COMMAND_TRANSCRIPT_WARNINGS = [
  "Plugin marketplace lifecycle default UX command transcripts are read-only projections derived from command briefs.",
  "Transcript lines are terminal-display helpers only and do not execute host requests, collect approvals, or activate sidecars.",
  "Transcript text preserves descriptor-only handoff boundaries and redacts package sources, registry URLs, approval signatures, and secrets.",
];

const SAFETY_SUMMARY_LINES = [
  "Operator-only transcript: copy and run only after reviewing the host handoff request outside Colony.",
  "No registry fetch, package install, package-code execution, activation, sidecar start, or catalog mutation is performed.",
  "No credentials, approval signatures, registry URLs, package sources, or private host payloads are persisted in this view.",
  "Default live execution remains disabled; this is a bounded display projection over existing command briefs.",
];

export function createPluginPackageMarketplaceLifecycleDefaultUxCommandTranscript(
  input: PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptInput,
): PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptView {
  const includedSections = normalizeIncludedSections(input.includeSections);
  const includedStates = normalizeIncludedStates(input.includeStates);
  const allLines = [
    ...input.commandBriefView.sections.readyCommands,
    ...input.commandBriefView.sections.approvalRemediation,
  ].map(projectLine);
  const sectionScoped = allLines.filter((line) => includedSections.has(line.section));
  const stateScoped = sectionScoped.filter((line) => includedStates.has(line.lineState));
  const capped = stateScoped.slice(0, safeMaxLines(input.maxLines));
  const safetySummary = includedSections.has("safety_summary") ? [...SAFETY_SUMMARY_LINES] : [];

  return freezeView({
    recordType: "mcp_plugin_package_marketplace_lifecycle_default_ux_command_transcript_view",
    timestamp: toIso(input.timestamp ?? new Date()),
    catalogId: safeId(input.commandBriefView.catalogId),
    commandBriefRecordType: input.commandBriefView.recordType,
    sourceLineCount: input.commandBriefView.lineCount,
    transcriptLineCount: capped.length,
    audience: input.audience === "reviewer" ? "reviewer" : input.commandBriefView.audience,
    sections: {
      readyCommands: capped.filter((line) => line.section === "ready_commands"),
      approvalRemediation: capped.filter((line) => line.section === "approval_remediation"),
      safetySummary,
    },
    summary: summarizeLines(
      allLines,
      safetySummary.length,
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
    warnings: [...COMMAND_TRANSCRIPT_WARNINGS],
  });
}

function projectLine(
  line: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLine,
): PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptLine {
  const phase = safeLabel(line.phase);
  const commandLabel = safeLabel(line.commandLabel);
  const packageName = safeLabel(line.package.name);
  const requestId = safeId(line.requestId);

  return {
    transcriptLineId: `transcript-${safeId(line.lineId)}`,
    briefLineId: safeId(line.lineId),
    paletteEntryId: safeId(line.paletteEntryId),
    promptId: safeId(line.promptId),
    requestId,
    phase: line.phase,
    section: line.section,
    lineState: line.lineState,
    commandId: line.commandId,
    commandLabel,
    text: `[${phase}] ${commandLabel}: ${packageName} (request ${requestId})`,
    copyText: safeCommandText(line.copyText),
    terminalHint: terminalHintForLine(line),
    nextAction: line.nextAction,
    executionMode: "operator_only",
    hostActionAllowed: false,
    transcriptMutable: false,
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
    safetyBadges: safeBadges(line.safetyBadges),
  };
}

function terminalHintForLine(line: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLine): string {
  if (line.section === "ready_commands") {
    return "operator-only: copy this descriptor command only after reviewing the host handoff request.";
  }
  if (line.lineState === "blocked_approval_expired") {
    return "operator-only: refresh the expired approval before copying any related host request command.";
  }
  if (line.lineState === "blocked_approval_mismatch") {
    return "operator-only: replace mismatched approval evidence before copying any related host request command.";
  }
  return "operator-only: collect the missing approval before copying any related host request command.";
}

function summarizeLines(
  lines: PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptLine[],
  safetySummaryLines: number,
  omittedBySectionFilter: number,
  omittedByStateFilter: number,
  omittedByCap: number,
): PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptView["summary"] {
  return {
    total: lines.length,
    readyCommands: countSection(lines, "ready_commands"),
    approvalRemediation: countSection(lines, "approval_remediation"),
    safetySummaryLines,
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
  lines: PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptLine[],
  section: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefSection,
): number {
  return lines.filter((line) => line.section === section).length;
}

function countState(
  lines: PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptLine[],
  state: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState,
): number {
  return lines.filter((line) => line.lineState === state).length;
}

function normalizeIncludedSections(
  includeSections: PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptSection[] | undefined,
): Set<PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptSection> {
  const all: PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptSection[] = [
    "ready_commands",
    "approval_remediation",
    "safety_summary",
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

function safeBadges(badges: string[]): string[] {
  const clean = badges.map(safeLabel).filter((badge) => badge !== "<redacted>");
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
  view: PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptView,
): PluginPackageMarketplaceLifecycleDefaultUxCommandTranscriptView {
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
