import {
  createPluginPackageMarketplaceInstallUpdateHandoff,
  type PluginPackageMarketplaceInstallUpdateHandoff,
} from "./plugin-package-marketplace-install-handoff";
import type { PluginPackageInstallUpdateCommand } from "./plugin-package-execution";
import type { PluginPackageMarketplaceCatalogEntry } from "./plugin-package-marketplace";
import type {
  PluginPackageMarketplaceRegistryFetchMetadataPlanningEntry,
  PluginPackageMarketplaceRegistryFetchMetadataPlanningView,
} from "./plugin-package-marketplace-registry-fetch-metadata-planning";
import type { PluginPackagePlannerOptions } from "./plugin-package-discovery";

export type PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffStatus = "ready" | "blocked";

export type PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffBlockedReason =
  | "metadata_planning_missing"
  | "entry_not_found"
  | "metadata_planning_mismatch"
  | "metadata_not_ready"
  | "action_not_installable"
  | "approval_signature_mismatch"
  | "install_handoff_blocked";

export interface PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffRequest {
  catalogId: string;
  entries: PluginPackageMarketplaceCatalogEntry[];
  metadataPlanningView: PluginPackageMarketplaceRegistryFetchMetadataPlanningView;
  entryId: string;
  installedSignatures?: PluginPackagePlannerOptions["installedSignatures"];
  approvalSignature: string;
  packageRoot: string;
  packagePath: string;
  commands?: PluginPackageInstallUpdateCommand[];
  approvedBy?: string;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceMetadataBoundInstallUpdateHandoff {
  recordType: "mcp_plugin_package_marketplace_metadata_bound_install_update_handoff";
  timestamp: string;
  status: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffStatus;
  blockedReason?: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffBlockedReason;
  catalogId: string;
  entry: {
    entryId: string;
    displayName: string;
  };
  metadataGate: {
    required: true;
    recordType: "mcp_plugin_package_marketplace_registry_fetch_metadata_planning_view" | "<blocked>";
    state: PluginPackageMarketplaceRegistryFetchMetadataPlanningEntry["state"] | "<blocked>";
    action: PluginPackageMarketplaceRegistryFetchMetadataPlanningEntry["plan"]["action"];
    registryMetadataApplied: boolean;
    registryMetadataVerified: boolean;
  };
  installUpdateHandoff: PluginPackageMarketplaceInstallUpdateHandoff;
  networkFetched: false;
  packageInstalled: false;
  packageExecuted: false;
  activation: false;
  sidecarStarted: false;
  catalogMutated: false;
  credentialsPersisted: false;
  warnings: string[];
}

const METADATA_BOUND_WARNINGS = [
  "Metadata-bound marketplace install/update handoff requires a Phase 252 metadata-ready planning entry before producing a usable install/update handoff.",
  "This wrapper delegates to the existing redacted marketplace install/update handoff helper and performs no install/update execution by itself.",
  "The wrapper does not fetch registries, install packages, execute package code, activate sidecars, start sidecars, mutate catalogs, or persist credentials.",
];

export function createPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff(
  request: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffRequest,
): PluginPackageMarketplaceMetadataBoundInstallUpdateHandoff {
  const timestamp = toIso(request.timestamp ?? new Date());
  const entry = selectEntry(request.entries, request.entryId);
  const planningEntry = findPlanningEntry(request.metadataPlanningView, request.catalogId, request.entryId);
  const installUpdateHandoff = createPluginPackageMarketplaceInstallUpdateHandoff({
    catalogId: request.catalogId,
    entries: request.entries,
    entryId: request.entryId,
    installedSignatures: request.installedSignatures,
    approvalSignature: request.approvalSignature,
    packageRoot: request.packageRoot,
    packagePath: request.packagePath,
    commands: request.commands,
    approvedBy: request.approvedBy,
    timestamp,
  });

  let blockedReason: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffBlockedReason | undefined;
  if (entry === undefined) {
    blockedReason = "entry_not_found";
  } else if (planningEntry === undefined) {
    blockedReason = "metadata_planning_missing";
  } else if (!planningEntryMatchesEntry(planningEntry, entry)) {
    blockedReason = "metadata_planning_mismatch";
  } else if (
    planningEntry.state !== "metadata_ready"
    || planningEntry.plan.registryMetadataApplied !== true
    || planningEntry.plan.registryMetadataVerified !== true
  ) {
    blockedReason = "metadata_not_ready";
  } else if (planningEntry.plan.action !== "import" && planningEntry.plan.action !== "update") {
    blockedReason = "action_not_installable";
  } else if (installUpdateHandoff.status !== "ready") {
    blockedReason = installUpdateHandoff.blockedReason === "approval_signature_mismatch"
      ? "approval_signature_mismatch"
      : installUpdateHandoff.blockedReason === "action_not_installable"
        ? "action_not_installable"
        : "install_handoff_blocked";
  }

  return freezeRecord({
    recordType: "mcp_plugin_package_marketplace_metadata_bound_install_update_handoff",
    timestamp,
    status: blockedReason === undefined ? "ready" : "blocked",
    ...(blockedReason === undefined ? {} : { blockedReason }),
    catalogId: safeId(request.catalogId),
    entry: {
      entryId: safeId(entry?.entryId ?? request.entryId),
      displayName: safeLabel(entry?.displayName),
    },
    metadataGate: summarizeMetadataGate(request.metadataPlanningView, planningEntry),
    installUpdateHandoff,
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    warnings: [...METADATA_BOUND_WARNINGS],
  });
}

function selectEntry(
  entries: PluginPackageMarketplaceCatalogEntry[],
  entryId: string,
): PluginPackageMarketplaceCatalogEntry | undefined {
  if (!Array.isArray(entries) || safeId(entryId) === "<redacted>") return undefined;
  return entries.find((entry) => entry.entryId === entryId);
}

function findPlanningEntry(
  view: PluginPackageMarketplaceRegistryFetchMetadataPlanningView,
  catalogId: string,
  entryId: string,
): PluginPackageMarketplaceRegistryFetchMetadataPlanningEntry | undefined {
  if (
    !isPlainRecord(view)
    || view.recordType !== "mcp_plugin_package_marketplace_registry_fetch_metadata_planning_view"
    || safeId(view.catalogId) !== safeId(catalogId)
    || !Array.isArray(view.entries)
  ) {
    return undefined;
  }
  const safeEntryId = safeId(entryId);
  return view.entries.find((entry) => safeId(entry.entryId) === safeEntryId);
}

function planningEntryMatchesEntry(
  planningEntry: PluginPackageMarketplaceRegistryFetchMetadataPlanningEntry,
  entry: PluginPackageMarketplaceCatalogEntry,
): boolean {
  return safeId(planningEntry.entryId) === safeId(entry.entryId)
    && safeLabel(planningEntry.package?.name) === safeLabel(entry.manifest?.packageName)
    && safeLabel(planningEntry.package?.version) === safeLabel(entry.manifest?.packageVersion)
    && safeDigest(planningEntry.package?.digest) === safeDigest(entry.manifest?.packageDigest);
}

function summarizeMetadataGate(
  view: PluginPackageMarketplaceRegistryFetchMetadataPlanningView,
  planningEntry: PluginPackageMarketplaceRegistryFetchMetadataPlanningEntry | undefined,
): PluginPackageMarketplaceMetadataBoundInstallUpdateHandoff["metadataGate"] {
  return {
    required: true,
    recordType: view?.recordType === "mcp_plugin_package_marketplace_registry_fetch_metadata_planning_view"
      ? view.recordType
      : "<blocked>",
    state: planningEntry?.state ?? "<blocked>",
    action: planningEntry?.plan?.action ?? "<blocked>",
    registryMetadataApplied: planningEntry?.plan?.registryMetadataApplied === true,
    registryMetadataVerified: planningEntry?.plan?.registryMetadataVerified === true,
  };
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

function freezeRecord(
  record: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoff,
): PluginPackageMarketplaceMetadataBoundInstallUpdateHandoff {
  deepFreeze(record);
  return record;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
