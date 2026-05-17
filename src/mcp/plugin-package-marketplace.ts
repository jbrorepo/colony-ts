import {
  planPluginPackageManifest,
  type PluginPackageImportPlan,
  type PluginPackageManifest,
  type PluginPackagePlanAction,
  type PluginPackagePlannerOptions,
} from "./plugin-package-discovery";

export interface PluginPackageMarketplaceCatalogEntry {
  entryId: string;
  displayName: string;
  summary: string;
  tags?: string[];
  manifest: PluginPackageManifest;
  featured?: boolean;
}

export interface PluginPackageMarketplaceViewRequest {
  catalogId: string;
  entries: PluginPackageMarketplaceCatalogEntry[];
  query?: string;
  installedSignatures?: PluginPackagePlannerOptions["installedSignatures"];
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceEntryView {
  entryId: string;
  displayName: string;
  summary: string;
  tags: string[];
  featured: boolean;
  package: {
    name: string;
    version: string;
    source: "<redacted>";
    digest: string;
  };
  sidecarCount: number;
  approvalRequired: true;
  recommendedAction: PluginPackagePlanAction | "<blocked>";
  actionSummary: {
    importCount: number;
    updateCount: number;
    keepCount: number;
    reviewCount: number;
    rejectCount: number;
  };
  blockedReasons: string[];
  warnings: string[];
}

export interface PluginPackageMarketplaceView {
  recordType: "mcp_plugin_package_marketplace_view";
  timestamp: string;
  catalogId: string;
  query: {
    present: boolean;
    hash: string;
  };
  totalEntries: number;
  shownEntries: number;
  approvalRequired: true;
  networkFetched: false;
  packageInstalled: false;
  packageExecuted: false;
  activation: false;
  sidecarStarted: false;
  catalogMutated: false;
  credentialsPersisted: false;
  entries: PluginPackageMarketplaceEntryView[];
  warnings: string[];
}

const MARKETPLACE_WARNINGS = [
  "Marketplace view is local read-only metadata and performs no live registry fetch.",
  "Package install/update, package-code execution, sidecar activation, catalog mutation, and credential persistence remain separate approval-gated steps.",
  "Package sources and approval bodies are redacted from marketplace output.",
];

const DEFAULT_MARKETPLACE_ENTRIES: PluginPackageMarketplaceCatalogEntry[] = [
  {
    entryId: "colony-local-echo-tools",
    displayName: "Colony Local Echo Tools",
    summary: "Reviewed local-sidecar MCP echo tools for smoke-testing plugin planning.",
    tags: ["featured", "mcp", "local-sidecar", "echo"],
    featured: true,
    manifest: {
      packageName: "@colony/plugin-local-echo",
      packageVersion: "1.0.0",
      packageSource: "https://plugins.colony.local/packages/plugin-local-echo.tgz",
      packageDigest: "sha256:4141414141414141414141414141414141414141414141414141414141414141",
      reviewed: true,
      sidecars: [
        {
          id: "colony-local-echo",
          sidecarId: "colony-local-echo-sidecar",
          sidecarKind: "local-sidecar",
          declaredCapabilities: ["mcp.tools"],
          allowedTools: ["echo_text"],
          allowedMethods: ["initialize", "tools/list", "tools/call"],
          expectedProtocolVersion: "2024-11-05",
          expectedServerName: "colony-local-echo",
          expectedServerVersion: "1.0.0",
        },
      ],
    },
  },
];

export function createDefaultPluginPackageMarketplaceView(
  request: Omit<Partial<PluginPackageMarketplaceViewRequest>, "entries"> = {},
): PluginPackageMarketplaceView {
  return createPluginPackageMarketplaceView({
    catalogId: request.catalogId ?? "colony-default-marketplace",
    entries: DEFAULT_MARKETPLACE_ENTRIES,
    query: request.query,
    installedSignatures: request.installedSignatures,
    timestamp: request.timestamp,
  });
}

export function createPluginPackageMarketplaceView(
  request: PluginPackageMarketplaceViewRequest,
): PluginPackageMarketplaceView {
  const timestamp = toIso(request.timestamp ?? new Date());
  const catalogId = safeId(request.catalogId);
  const queryTerms = queryTokens(request.query);
  const entries = Array.isArray(request.entries) ? request.entries : [];
  const rendered = entries
    .map((entry) => renderEntry(entry, request.installedSignatures))
    .filter((entry) => matchesQuery(entry, queryTerms))
    .sort(compareEntries);

  return freezeView({
    recordType: "mcp_plugin_package_marketplace_view",
    timestamp,
    catalogId,
    query: {
      present: typeof request.query === "string" && request.query.trim().length > 0,
      hash: queryHash(request.query),
    },
    totalEntries: entries.length,
    shownEntries: rendered.length,
    approvalRequired: true,
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    entries: rendered,
    warnings: [...MARKETPLACE_WARNINGS],
  });
}

function renderEntry(
  entry: PluginPackageMarketplaceCatalogEntry,
  installedSignatures: PluginPackagePlannerOptions["installedSignatures"],
): PluginPackageMarketplaceEntryView {
  const plan = planForEntry(entry, installedSignatures);
  const action = plan.actions[0];
  const reasons = plan.actions.flatMap((planAction) => planAction.reasons);
  return {
    entryId: safeId(entry?.entryId),
    displayName: safeLabel(entry?.displayName),
    summary: safeLabel(entry?.summary),
    tags: safeTags(entry?.tags),
    featured: entry?.featured === true,
    package: action === undefined
      ? {
        name: safeLabel(entry?.manifest?.packageName),
        version: safeLabel(entry?.manifest?.packageVersion),
        source: "<redacted>",
        digest: safeDigest(entry?.manifest?.packageDigest),
      }
      : {
        name: safeLabel(action.package.name),
        version: safeLabel(action.package.version),
        source: "<redacted>",
        digest: safeDigest(action.package.digest),
      },
    sidecarCount: Array.isArray(entry?.manifest?.sidecars) ? Math.min(entry.manifest.sidecars.length, 64) : 0,
    approvalRequired: true,
    recommendedAction: recommendAction(plan),
    actionSummary: {
      importCount: safeCount(plan.importCount),
      updateCount: safeCount(plan.updateCount),
      keepCount: safeCount(plan.keepCount),
      reviewCount: safeCount(plan.reviewCount),
      rejectCount: safeCount(plan.rejectCount),
    },
    blockedReasons: safeTags(reasons.filter((reason) => reason !== "missing_local" && reason !== "signature_current" && reason !== "signature_changed")),
    warnings: [...MARKETPLACE_WARNINGS, ...safeTags(plan.warnings)],
  };
}

function planForEntry(
  entry: PluginPackageMarketplaceCatalogEntry,
  installedSignatures: PluginPackagePlannerOptions["installedSignatures"],
): PluginPackageImportPlan {
  try {
    return planPluginPackageManifest(entry.manifest, { installedSignatures });
  } catch {
    return planPluginPackageManifest({
      packageName: safeLabel(entry?.manifest?.packageName),
      packageVersion: "<invalid>",
      packageSource: "<invalid>",
      packageDigest: "<invalid>",
      reviewed: false,
      sidecars: [],
    } as PluginPackageManifest);
  }
}

function recommendAction(plan: PluginPackageImportPlan): PluginPackagePlanAction | "<blocked>" {
  if (plan.rejectCount > 0) return "reject";
  if (plan.reviewCount > 0) return "review";
  if (plan.updateCount > 0) return "update";
  if (plan.importCount > 0) return "import";
  if (plan.keepCount > 0) return "keep";
  return "<blocked>";
}

function matchesQuery(entry: PluginPackageMarketplaceEntryView, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = [
    entry.entryId,
    entry.displayName,
    entry.summary,
    entry.package.name,
    entry.package.version,
    ...entry.tags,
  ].join(" ").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function compareEntries(left: PluginPackageMarketplaceEntryView, right: PluginPackageMarketplaceEntryView): number {
  if (left.featured !== right.featured) return left.featured ? -1 : 1;
  return `${left.displayName}:${left.entryId}`.localeCompare(`${right.displayName}:${right.entryId}`);
}

function queryTokens(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .toLowerCase()
    .split(/[^a-z0-9._@/-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && token.length <= 40 && !looksSecret(token))
    .slice(0, 8);
}

function queryHash(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) return "q:none";
  let hash = 2166136261;
  for (const char of value.slice(0, 240)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `q:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function safeId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]{1,120}$/.test(value) || looksSecret(value)) {
    return "<redacted>";
  }
  return value;
}

function safeLabel(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "<redacted>";
  const clean = value.replace(/[\0\r\n]/g, "");
  return looksSecret(clean) || looksHighEntropy(clean) ? "<redacted>" : clean.slice(0, 160);
}

function safeTags(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(safeLabel).filter((value) => value !== "<redacted>"))).sort().slice(0, 24);
}

function safeDigest(value: unknown): string {
  if (typeof value !== "string") return "<redacted>";
  if (/^sha256:[a-f0-9]{64}$/i.test(value)) {
    return `${value.slice(0, 18).toLowerCase()}...${value.slice(-8).toLowerCase()}`;
  }
  if (/^sha256:[a-f0-9]{11}\.\.\.[a-f0-9]{8}$/i.test(value)) {
    return value.toLowerCase();
  }
  return "<redacted>";
}

function safeCount(value: unknown): number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= 1_000_000 ? value : 0;
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

function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid timestamp");
  return date.toISOString();
}

function freezeView(view: PluginPackageMarketplaceView): PluginPackageMarketplaceView {
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
