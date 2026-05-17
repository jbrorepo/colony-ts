import type { PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState } from "./plugin-package-marketplace-lifecycle-default-ux-command-brief";
import type {
  PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestItem,
  PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestView,
} from "./plugin-package-marketplace-lifecycle-default-ux-command-panel-digest";

export type PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardSection =
  | "ready_commands"
  | "approval_remediation"
  | "safety_summary";

export interface PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardInput {
  commandPanelDigestView: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestView;
  audience?: "operator" | "reviewer";
  includeSections?: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardSection[];
  includeStates?: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState[];
  maxItems?: number;
  includeClipboardText?: boolean;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardItem {
  clipboardItemId: string;
  digestItemId: string;
  cardId: string;
  transcriptLineId: string;
  briefLineId: string;
  requestId: string;
  phase: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestItem["phase"];
  section: Exclude<PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardSection, "safety_summary">;
  itemState: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState;
  label: string;
  copyText: string;
  clipboardLine: string;
  terminalHint: string;
  nextAction: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestItem["nextAction"];
  executionMode: "operator_only";
  hostActionAllowed: false;
  clipboardMutable: false;
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

export interface PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardView {
  recordType: "mcp_plugin_package_marketplace_lifecycle_default_ux_command_panel_digest_clipboard_view";
  timestamp: string;
  catalogId: string;
  commandPanelDigestRecordType: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestView["recordType"];
  sourceDigestItemCount: number;
  clipboardItemCount: number;
  audience: "operator" | "reviewer";
  clipboardTitle: "Plugin lifecycle command clipboard";
  sections: {
    readyCommands: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardItem[];
    approvalRemediation: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardItem[];
    safetySummary: string[];
    clipboardText: string;
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
    clipboardTextLineCount: number;
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

const DIGEST_CLIPBOARD_WARNINGS = [
  "Plugin marketplace lifecycle default UX command panel digest clipboard packets are read-only projections derived from digest items.",
  "Clipboard packets are operator copy helpers only; they do not execute commands, fetch registries, install packages, collect approvals, or activate sidecars.",
  "Clipboard text is bounded and redacted; package sources, registry URLs, approval signatures, and secrets are not persisted.",
];

export function createPluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboard(
  input: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardInput,
): PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardView {
  const includedSections = normalizeIncludedSections(input.includeSections);
  const includedStates = normalizeIncludedStates(input.includeStates);
  const allItems = [
    ...input.commandPanelDigestView.groups.readyCommands,
    ...input.commandPanelDigestView.groups.approvalRemediation,
  ].map(projectClipboardItem);
  const sectionScoped = allItems.filter((item) => includedSections.has(item.section));
  const stateScoped = sectionScoped.filter((item) => includedStates.has(item.itemState));
  const capped = stateScoped.slice(0, safeMaxItems(input.maxItems));
  const safetySummary = includedSections.has("safety_summary")
    ? input.commandPanelDigestView.groups.safetySummary.map(safeSummaryLine)
    : [];
  const clipboardText = input.includeClipboardText === false ? "" : buildClipboardText(capped, safetySummary);

  return freezeView({
    recordType: "mcp_plugin_package_marketplace_lifecycle_default_ux_command_panel_digest_clipboard_view",
    timestamp: toIso(input.timestamp ?? new Date()),
    catalogId: safeId(input.commandPanelDigestView.catalogId),
    commandPanelDigestRecordType: input.commandPanelDigestView.recordType,
    sourceDigestItemCount: input.commandPanelDigestView.digestItemCount,
    clipboardItemCount: capped.length,
    audience: input.audience === "reviewer" ? "reviewer" : input.commandPanelDigestView.audience,
    clipboardTitle: "Plugin lifecycle command clipboard",
    sections: {
      readyCommands: capped.filter((item) => item.section === "ready_commands"),
      approvalRemediation: capped.filter((item) => item.section === "approval_remediation"),
      safetySummary,
      clipboardText,
    },
    summary: summarizeItems(
      allItems,
      safetySummary.length,
      allItems.length - sectionScoped.length,
      sectionScoped.length - stateScoped.length,
      stateScoped.length - capped.length,
      clipboardText,
    ),
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    defaultLiveExecution: false,
    warnings: [...DIGEST_CLIPBOARD_WARNINGS],
  });
}

function projectClipboardItem(
  item: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestItem,
): PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardItem {
  const label = safeText(item.heading);
  const copyText = safeCommandText(item.copyText);
  const section = item.group;

  return {
    clipboardItemId: `clipboard-${safeId(item.digestItemId)}`,
    digestItemId: safeId(item.digestItemId),
    cardId: safeId(item.cardId),
    transcriptLineId: safeId(item.transcriptLineId),
    briefLineId: safeId(item.briefLineId),
    requestId: safeId(item.requestId),
    phase: item.phase,
    section,
    itemState: item.itemState,
    label,
    copyText,
    clipboardLine: safeClipboardLine(formatClipboardLine(label, copyText, item.itemState)),
    terminalHint: safeText(item.terminalHint),
    nextAction: item.nextAction,
    executionMode: "operator_only",
    hostActionAllowed: false,
    clipboardMutable: false,
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
    badges: safeBadges(item.badges, item.itemState),
  };
}

function formatClipboardLine(
  label: string,
  copyText: string,
  state: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState,
): string {
  if (state === "ready_to_copy") return `${label}: ${copyText}`;
  return `${label}: blocker ${state}; copy ${copyText} only after remediation.`;
}

function buildClipboardText(
  items: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardItem[],
  safetySummary: string[],
): string {
  const itemLines = items.map((item) => item.clipboardLine);
  const safetyLines = safetySummary.map((line) => `Safety: ${line}`);
  return [...itemLines, ...safetyLines].map(safeClipboardLine).join("\n").slice(0, 4000);
}

function summarizeItems(
  items: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardItem[],
  safetySummaryLines: number,
  omittedBySectionFilter: number,
  omittedByStateFilter: number,
  omittedByCap: number,
  clipboardText: string,
): PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardView["summary"] {
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
    clipboardTextLineCount: clipboardText.length === 0 ? 0 : clipboardText.split("\n").length,
  };
}

function countSection(
  items: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardItem[],
  section: Exclude<PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardSection, "safety_summary">,
): number {
  return items.filter((item) => item.section === section).length;
}

function countState(
  items: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardItem[],
  state: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState,
): number {
  return items.filter((item) => item.itemState === state).length;
}

function normalizeIncludedSections(
  includeSections: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardSection[] | undefined,
): Set<PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardSection> {
  const all: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardSection[] = [
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

function safeClipboardLine(value: unknown): string {
  if (typeof value !== "string") return "<redacted>";
  const clean = value.replace(/[\0\r]/g, " ").replace(/\s+/g, " ").trim();
  return looksSecret(clean) || looksHighEntropy(clean) || clean.includes("://") ? "<redacted>" : clean.slice(0, 360);
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
  state: PluginPackageMarketplaceLifecycleDefaultUxCommandBriefLineState,
): string[] {
  const clean = badges.map(safeLabel).filter((badge) => badge !== "<redacted>");
  if (state === "ready_to_copy") clean.push("clipboard-ready");
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
  view: PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardView,
): PluginPackageMarketplaceLifecycleDefaultUxCommandPanelDigestClipboardView {
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
