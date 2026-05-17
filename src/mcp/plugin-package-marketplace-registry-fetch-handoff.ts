import {
  createApprovedPluginPackageRegistryFetchHandoff,
  type PluginPackageRegistryFetchHandoff,
} from "./plugin-package-registry-boundary";
import {
  planPluginPackageManifest,
  type PluginPackagePlanAction,
  type PluginPackagePlannerOptions,
} from "./plugin-package-discovery";
import type { PluginPackageMarketplaceCatalogEntry } from "./plugin-package-marketplace";

export type PluginPackageMarketplaceRegistryFetchHandoffStatus = "ready" | "blocked";

export type PluginPackageMarketplaceRegistryFetchHandoffBlockedReason =
  | "entry_not_found"
  | "registry_url_missing"
  | "registry_url_unsafe"
  | "action_not_fetchable"
  | "approval_signature_mismatch";

export interface PluginPackageMarketplaceRegistryFetchHandoffRequest {
  catalogId: string;
  entries: PluginPackageMarketplaceCatalogEntry[];
  entryId: string;
  registryUrl?: string;
  installedSignatures?: PluginPackagePlannerOptions["installedSignatures"];
  approvalSignature: string;
  approvedBy?: string;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceRegistryFetchHandoff {
  recordType: "mcp_plugin_package_marketplace_registry_fetch_handoff";
  timestamp: string;
  status: PluginPackageMarketplaceRegistryFetchHandoffStatus;
  blockedReason?: PluginPackageMarketplaceRegistryFetchHandoffBlockedReason;
  catalogId: string;
  entry: {
    entryId: string;
    displayName: string;
  };
  action: Exclude<PluginPackagePlanAction, "reject"> | "<blocked>";
  package: {
    name: string;
    version: string;
    source: "<redacted>";
    digest: string;
  };
  sidecar: {
    id: string;
    kind: string;
  };
  approval: {
    required: true;
    signature: string;
    approvedBy?: string;
  };
  hostAction: {
    kind: "plugin_package_registry_metadata_fetch";
    executorPath: "executeApprovedPluginPackageRegistryFetch";
    requiresInjectedExecutor: true;
    registryUrl: string;
    timeoutMs: number;
    maxResponseBytes: number;
    expectedContentType: "application/json";
  };
  registryFetchHandoff: PluginPackageRegistryFetchHandoff;
  networkFetched: false;
  packageInstalled: false;
  packageExecuted: false;
  activation: false;
  sidecarStarted: false;
  catalogMutated: false;
  credentialsPersisted: false;
  warnings: string[];
}

const HANDOFF_WARNINGS = [
  "Marketplace registry fetch handoff is a redacted host-action descriptor only.",
  "The handoff requires explicit approval plus an injected host executor before registry metadata can be fetched.",
  "The handoff delegates to the existing registry fetch boundary and does not fetch registries, install packages, execute package code, activate sidecars, start sidecars, mutate catalogs, or persist credentials.",
];

const EMPTY_REGISTRY_HANDOFF_CANDIDATE = {
  packageName: "<invalid>",
  packageVersion: "<invalid>",
  packageSource: "<invalid>",
  packageDigest: "<invalid>",
  registryUrl: "<invalid>",
};

export function createPluginPackageMarketplaceRegistryFetchHandoff(
  request: PluginPackageMarketplaceRegistryFetchHandoffRequest,
): PluginPackageMarketplaceRegistryFetchHandoff {
  const timestamp = toIso(request.timestamp ?? new Date());
  const entry = selectEntry(request.entries, request.entryId);
  if (entry === undefined) {
    return block(base(timestamp, request, undefined, undefined, emptyRegistryHandoff(timestamp)), "entry_not_found");
  }

  const registryUrl = typeof request.registryUrl === "string" ? request.registryUrl : "";
  if (registryUrl.length === 0) {
    return block(base(timestamp, request, entry, undefined, emptyRegistryHandoff(timestamp)), "registry_url_missing");
  }

  const plan = planPluginPackageManifest(entry.manifest, { installedSignatures: request.installedSignatures });
  const action = plan.actions[0];
  if (action === undefined || action.action === "reject") {
    return block(base(timestamp, request, entry, action, emptyRegistryHandoff(timestamp)), "action_not_fetchable");
  }

  const registryFetchHandoff = createApprovedPluginPackageRegistryFetchHandoff({
    candidate: {
      packageName: entry.manifest.packageName,
      packageVersion: entry.manifest.packageVersion,
      packageSource: entry.manifest.packageSource,
      packageDigest: entry.manifest.packageDigest,
      registryUrl,
    },
    approval: {
      approved: true,
      signature: request.approvalSignature,
      approvedBy: request.approvedBy,
    },
    timestamp,
  });
  const baseRecord = base(timestamp, request, entry, action, registryFetchHandoff);

  if (registryFetchHandoff.status !== "ready") {
    return block(baseRecord, mapRegistryBlockedReason(registryFetchHandoff.blockedReason));
  }

  return {
    ...baseRecord,
    status: "ready",
  };
}

function base(
  timestamp: string,
  request: PluginPackageMarketplaceRegistryFetchHandoffRequest,
  entry: PluginPackageMarketplaceCatalogEntry | undefined,
  action: ReturnType<typeof planPluginPackageManifest>["actions"][number] | undefined,
  registryFetchHandoff: PluginPackageRegistryFetchHandoff,
): PluginPackageMarketplaceRegistryFetchHandoff {
  const source = action?.package ?? {
    name: entry?.manifest?.packageName,
    version: entry?.manifest?.packageVersion,
    digest: entry?.manifest?.packageDigest,
  };
  return {
    recordType: "mcp_plugin_package_marketplace_registry_fetch_handoff",
    timestamp,
    status: "blocked",
    catalogId: safeId(request.catalogId),
    entry: {
      entryId: safeId(entry?.entryId),
      displayName: safeLabel(entry?.displayName),
    },
    action: isFetchableAction(action?.action) ? action.action : "<blocked>",
    package: {
      name: safeLabel(source.name),
      version: safeLabel(source.version),
      source: "<redacted>",
      digest: safeDigest(source.digest),
    },
    sidecar: {
      id: safeLabel(action?.sidecar?.id),
      kind: safeLabel(action?.sidecar?.kind),
    },
    approval: {
      required: true,
      signature: safeRegistryFetchSignature(registryFetchHandoff.signature),
      ...(request.approvedBy === undefined ? {} : { approvedBy: safeLabel(request.approvedBy) }),
    },
    hostAction: {
      kind: "plugin_package_registry_metadata_fetch",
      executorPath: "executeApprovedPluginPackageRegistryFetch",
      requiresInjectedExecutor: true,
      registryUrl: safeRegistryUrl(registryFetchHandoff.hostAction?.registryUrl),
      timeoutMs: safePositiveInteger(registryFetchHandoff.hostAction?.timeoutMs, 15_000),
      maxResponseBytes: safePositiveInteger(registryFetchHandoff.hostAction?.maxResponseBytes, 32 * 1024),
      expectedContentType: "application/json",
    },
    registryFetchHandoff,
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    warnings: [...HANDOFF_WARNINGS, ...registryFetchHandoff.warnings],
  };
}

function block(
  record: PluginPackageMarketplaceRegistryFetchHandoff,
  reason: PluginPackageMarketplaceRegistryFetchHandoffBlockedReason,
): PluginPackageMarketplaceRegistryFetchHandoff {
  return {
    ...record,
    status: "blocked",
    blockedReason: reason,
    hostAction: {
      ...record.hostAction,
      registryUrl: reason === "registry_url_unsafe" ? "<redacted>" : record.hostAction.registryUrl,
    },
  };
}

function emptyRegistryHandoff(timestamp: string): PluginPackageRegistryFetchHandoff {
  return createApprovedPluginPackageRegistryFetchHandoff({
    candidate: EMPTY_REGISTRY_HANDOFF_CANDIDATE,
    approval: { approved: false, signature: "" },
    timestamp,
  });
}

function mapRegistryBlockedReason(
  reason: PluginPackageRegistryFetchHandoff["blockedReason"],
): PluginPackageMarketplaceRegistryFetchHandoffBlockedReason {
  if (reason === "unsafe_registry_url") return "registry_url_unsafe";
  if (reason === "approval_required" || reason === "approval_signature_mismatch") return "approval_signature_mismatch";
  return "action_not_fetchable";
}

function selectEntry(
  entries: PluginPackageMarketplaceCatalogEntry[],
  entryId: string,
): PluginPackageMarketplaceCatalogEntry | undefined {
  if (!Array.isArray(entries) || !safeId(entryId)) return undefined;
  return entries.find((entry) => entry.entryId === entryId);
}

function isFetchableAction(action: unknown): action is Exclude<PluginPackagePlanAction, "reject"> {
  return action === "import" || action === "update" || action === "keep" || action === "review";
}

function safePositiveInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) && typeof value === "number" && value > 0 && value <= 1_000_000
    ? value
    : fallback;
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
  return looksSecret(clean) || looksHighEntropy(clean) ? "<redacted>" : clean.slice(0, 120);
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

function safeRegistryFetchSignature(value: unknown): string {
  return typeof value === "string" && /^mcp-registry-fetch:[a-f0-9]{24}$/i.test(value) ? value : "<redacted>";
}

function safeRegistryUrl(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value === "<redacted>" || looksSecret(value)) return "<redacted>";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return "<redacted>";
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "<redacted>";
  }
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
