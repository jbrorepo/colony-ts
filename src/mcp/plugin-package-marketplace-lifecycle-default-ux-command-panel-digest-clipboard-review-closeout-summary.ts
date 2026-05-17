import type { PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState } from "./plugin-package-marketplace-lifecycle-default-ux-command-brief";
import type {
  PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutItem,
  PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSection,
  PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutView,
} from "./plugin-package-marketplace-lifecycle-default-ux-command-panel-digest-clipboard-review-closeout";

export type PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummarySection =
  PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSection;

export interface PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummaryInput {
  commandPanelDigestClipboardReviewCloseoutView: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutView;
  audience?: "operator" | "reviewer";
  includeSections?: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummarySection[];
  includeStates?: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState[];
  maxItems?: number;
  includeSummaryText?: boolean;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummaryItem {
  summaryItemId: string;
  closeoutItemId: string;
  reviewItemId: string;
  clipboardItemId: string;
  digestItemId: string;
  cardId: string;
  transcriptLineId: string;
  briefLineId: string;
  requestId: string;
  phase: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutItem["phase"];
  section: Exclude<PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummarySection, "safety_summary">;
  itemState: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState;
  label: string;
  summaryLine: string;
  closeoutLine: string;
  reviewLine: string;
  copyText: string;
  clipboardLine: string;
  terminalHint: string;
  nextAction: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutItem["nextAction"];
  summaryState: "ready_to_copy" | "blocked";
  executionMode: "operator_only";
  hostActionAllowed: false;
  summaryMutable: false;
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

export interface PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummaryView {
  recordType: "mcp_plugin_package_marketplace_lifecycle_default_ux_command_panel_digest_clipboard_review_closeout_summary_view";
  timestamp: string;
  catalogId: string;
  commandPanelDigestClipboardReviewCloseoutRecordType: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutView["recordType"];
  sourceCloseoutItemCount: number;
  summaryItemCount: number;
  audience: "operator" | "reviewer";
  summaryTitle: "Plugin lifecycle command clipboard review closeout summary";
  sections: {
    readyCommands: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummaryItem[];
    approvalRemediation: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummaryItem[];
    safetySummary: string[];
    summaryText: string;
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
    readySummaryCount: number;
    blockerSummaryCount: number;
    summaryTextLineCount: number;
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

const CLIPBOARD_REVIEW_CLOSEOUT_SUMMARY_WARNINGS = [
  "Plugin marketplace lifecycle default UX command panel digest clipboard review closeout summaries are read-only projections derived from closeout packets.",
  "Summary items are operator and reviewer aids only; they do not execute commands, fetch registries, install packages, collect approvals, or activate sidecars.",
  "Summary text is bounded and redacted; package sources, registry URLs, approval signatures, and secrets are not persisted.",
];

export function createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummary(
  input: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummaryInput,
): PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummaryView {
  const includedSections = normalizeIncludedSections(input.includeSections);
  const includedStates = normalizeIncludedStates(input.includeStates);
  const allItems = [
    ...input.commandPanelDigestClipboardReviewCloseoutView.sections.readyCommands,
    ...input.commandPanelDigestClipboardReviewCloseoutView.sections.approvalRemediation,
  ].map(projectSummaryItem);
  const sectionScoped = allItems.filter((item) => includedSections.has(item.section));
  const stateScoped = sectionScoped.filter((item) => includedStates.has(item.itemState));
  const capped = stateScoped.slice(0, safeMaxItems(input.maxItems));
  const safetySummary = includedSections.has("safety_summary")
    ? input.commandPanelDigestClipboardReviewCloseoutView.sections.safetySummary.map(safeSummaryLine)
    : [];
  const summaryText = input.includeSummaryText === false ? "" : buildSummaryText(capped, safetySummary);

  return freezeView({
    recordType: "mcp_plugin_package_marketplace_lifecycle_default_ux_command_panel_digest_clipboard_review_closeout_summary_view",
    timestamp: toIso(input.timestamp ?? new Date()),
    catalogId: safeId(input.commandPanelDigestClipboardReviewCloseoutView.catalogId),
    commandPanelDigestClipboardReviewCloseoutRecordType:
      input.commandPanelDigestClipboardReviewCloseoutView.recordType,
    sourceCloseoutItemCount: input.commandPanelDigestClipboardReviewCloseoutView.closeoutItemCount,
    summaryItemCount: capped.length,
    audience: input.audience === "reviewer" ? "reviewer" : input.commandPanelDigestClipboardReviewCloseoutView.audience,
    summaryTitle: "Plugin lifecycle command clipboard review closeout summary",
    sections: {
      readyCommands: capped.filter((item) => item.section === "ready_commands"),
      approvalRemediation: capped.filter((item) => item.section === "approval_remediation"),
      safetySummary,
      summaryText,
    },
    summary: summarizeItems(
      allItems,
      safetySummary.length,
      allItems.length - sectionScoped.length,
      sectionScoped.length - stateScoped.length,
      stateScoped.length - capped.length,
      summaryText,
    ),
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    defaultLiveExecution: false,
    warnings: [...CLIPBOARD_REVIEW_CLOSEOUT_SUMMARY_WARNINGS],
  });
}

function projectSummaryItem(
  item: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutItem,
): PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummaryItem {
  const label = safeText(item.label);
  const copyText = safeCommandText(item.copyText);
  const nextAction = safeLabel(item.nextAction);
  const summaryState = item.closeoutState === "ready_to_copy" ? "ready_to_copy" : "blocked";

  return {
    summaryItemId: `summary-${safeId(item.closeoutItemId)}`,
    closeoutItemId: safeId(item.closeoutItemId),
    reviewItemId: safeId(item.reviewItemId),
    clipboardItemId: safeId(item.clipboardItemId),
    digestItemId: safeId(item.digestItemId),
    cardId: safeId(item.cardId),
    transcriptLineId: safeId(item.transcriptLineId),
    briefLineId: safeId(item.briefLineId),
    requestId: safeId(item.requestId),
    phase: item.phase,
    section: item.section,
    itemState: item.itemState,
    label,
    summaryLine: safeSummaryTextLine(formatSummaryLine(label, copyText, item.itemState, nextAction)),
    closeoutLine: safeSummaryTextLine(item.closeoutLine),
    reviewLine: safeSummaryTextLine(item.reviewLine),
    copyText,
    clipboardLine: safeSummaryTextLine(item.clipboardLine),
    terminalHint: safeText(item.terminalHint),
    nextAction: item.nextAction,
    summaryState,
    executionMode: "operator_only",
    hostActionAllowed: false,
    summaryMutable: false,
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
    badges: safeBadges(item.badges, summaryState),
  };
}

function formatSummaryLine(
  label: string,
  copyText: string,
  state: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState,
  nextAction: string,
): string {
  if (state === "ready_to_copy") return `Summary ready: ${label} -> ${copyText}`;
  return `Summary blocked: ${label} (${state}) -> ${nextAction}`;
}

function buildSummaryText(
  items: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummaryItem[],
  safetySummary: string[],
): string {
  const itemLines = items.map((item) => item.summaryLine);
  const safetyLines = safetySummary.map((line) => `Safety: ${line}`);
  return [...itemLines, ...safetyLines].map(safeSummaryTextLine).join("\n").slice(0, 5000);
}

function summarizeItems(
  items: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummaryItem[],
  safetySummaryLines: number,
  omittedBySectionFilter: number,
  omittedByStateFilter: number,
  omittedByCap: number,
  summaryText: string,
): PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummaryView["summary"] {
  return {
    total: items.length,
    readyCommands: countSection(items, "ready_commands"),
    approvalRemediation: countSection(items, "approval_remediation"),
    safetySummaryLines,
    readyToCopy: countState(items, "ready_to_copy"),
    blockedMissingApproval: countState(items, "blocked_missing_approval"),
    blockedApprovalMismatch: countState(items, "blocked_approval_mismatch"),
    blockedApprovalExpired: countState(items, "blocked_approval_expired"),
    omittedBySectionFilter: Math.max(0, omittedBySectionFilter),
    omittedByStateFilter: Math.max(0, omittedByStateFilter),
    omittedByCap: Math.max(0, omittedByCap),
    readySummaryCount: items.filter((item) => item.summaryState === "ready_to_copy").length,
    blockerSummaryCount: items.filter((item) => item.summaryState === "blocked").length,
    summaryTextLineCount: summaryText.length === 0 ? 0 : summaryText.split("\n").length,
  };
}

function countSection(
  items: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummaryItem[],
  section: Exclude<PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummarySection, "safety_summary">,
): number {
  return items.filter((item) => item.section === section).length;
}

function countState(
  items: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummaryItem[],
  state: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState,
): number {
  return items.filter((item) => item.itemState === state).length;
}

function normalizeIncludedSections(
  includeSections:
    | PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummarySection[]
    | undefined,
): Set<PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummarySection> {
  const all: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummarySection[] = [
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
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]{1,240}$/.test(value) || looksSecret(value)) {
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

function safeSummaryTextLine(value: unknown): string {
  if (typeof value !== "string") return "<redacted>";
  const clean = value.replace(/[\0\r]/g, " ").replace(/\s+/g, " ").trim();
  return looksSecret(clean) || looksHighEntropy(clean) || clean.includes("://") ? "<redacted>" : clean.slice(0, 420);
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

function safeBadges(
  badges: string[],
  summaryState: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummaryItem["summaryState"],
): string[] {
  const clean = badges
    .map(safeLabel)
    .filter((badge) => badge !== "<redacted>" && badge !== "summary-ready" && badge !== "summary-blocked");
  clean.push(summaryState === "ready_to_copy" ? "summary-ready" : "summary-blocked");
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
  view: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummaryView,
): PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardReviewCloseoutSummaryView {
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
