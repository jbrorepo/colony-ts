import {
  planPluginPackageManifest,
  type PluginPackagePlanAction,
  type PluginPackagePlannerOptions,
  type PluginPackageRegistryMetadata,
} from "./plugin-package-discovery";
import type { PluginPackageMarketplaceCatalogEntry } from "./plugin-package-marketplace";
import type { PluginPackageMarketplaceRegistryFetchHandoff } from "./plugin-package-marketplace-registry-fetch-handoff";
import type { PluginPackageRegistryFetchExecutionReceipt } from "./plugin-package-registry-fetch-execution";

export type PluginPackageMarketplaceRegistryFetchMetadataPlanningState =
  | "metadata_missing"
  | "metadata_blocked"
  | "metadata_failed"
  | "metadata_rejected"
  | "metadata_ready";

export interface PluginPackageMarketplaceRegistryFetchMetadataPlanningRequest {
  catalogId: string;
  entries: PluginPackageMarketplaceCatalogEntry[];
  handoffs?: PluginPackageMarketplaceRegistryFetchHandoff[];
  receipts?: PluginPackageRegistryFetchExecutionReceipt[];
  registryMetadata?: Record<string, PluginPackageRegistryMetadata>;
  installedSignatures?: PluginPackagePlannerOptions["installedSignatures"];
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceRegistryFetchMetadataPlanningEntry {
  entryId: string;
  displayName: string;
  state: PluginPackageMarketplaceRegistryFetchMetadataPlanningState;
  blockedReason?: string;
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
  registry: {
    url: string;
  };
  receipt: {
    present: boolean;
    status?: PluginPackageRegistryFetchExecutionReceipt["status"];
    blockedReason?: string;
    hostNetworkExecuted: boolean;
    registryFetched: boolean;
    statusCode?: number;
    contentType?: string;
    responseBytes?: number;
  };
  metadata: {
    present: boolean;
    packageName?: string;
    packageVersion?: string;
    registryUrl?: string;
    digest?: string;
    integrity?: string;
    signatureCount: number;
  };
  plan: {
    action: PluginPackagePlanAction | "<blocked>";
    registryMetadataApplied: boolean;
    registryMetadataVerified: boolean;
    signaturePresent: boolean;
    blockedReasons: string[];
    warnings: string[];
  };
  nextActions: string[];
}

export interface PluginPackageMarketplaceRegistryFetchMetadataPlanningView {
  recordType: "mcp_plugin_package_marketplace_registry_fetch_metadata_planning_view";
  timestamp: string;
  catalogId: string;
  entryCount: number;
  handoffCount: number;
  receiptCount: number;
  networkFetched: false;
  packageInstalled: false;
  packageExecuted: false;
  activation: false;
  sidecarStarted: false;
  catalogMutated: false;
  credentialsPersisted: false;
  entries: PluginPackageMarketplaceRegistryFetchMetadataPlanningEntry[];
  warnings: string[];
}

const PLANNING_WARNINGS = [
  "Marketplace registry fetch metadata planning is a read-only projection over bundled entries, handoffs, receipts, and host-supplied metadata.",
  "A completed redacted registry-fetch receipt is not treated as full metadata; host-supplied full registry metadata is required before package planning can use it.",
  "The planning view does not fetch registries, install packages, execute package code, activate sidecars, start sidecars, mutate catalogs, or persist credentials.",
];

export function createPluginPackageMarketplaceRegistryFetchMetadataPlanning(
  request: PluginPackageMarketplaceRegistryFetchMetadataPlanningRequest,
): PluginPackageMarketplaceRegistryFetchMetadataPlanningView {
  const timestamp = toIso(request.timestamp ?? new Date());
  const entries = Array.isArray(request.entries) ? request.entries : [];
  const handoffs = Array.isArray(request.handoffs) ? request.handoffs : [];
  const receipts = Array.isArray(request.receipts) ? request.receipts : [];

  return freezeView({
    recordType: "mcp_plugin_package_marketplace_registry_fetch_metadata_planning_view",
    timestamp,
    catalogId: safeId(request.catalogId),
    entryCount: entries.length,
    handoffCount: handoffs.length,
    receiptCount: receipts.length,
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    entries: entries.map((entry) => projectEntry(entry, request, handoffs, receipts)),
    warnings: [...PLANNING_WARNINGS],
  });
}

function projectEntry(
  entry: PluginPackageMarketplaceCatalogEntry,
  request: PluginPackageMarketplaceRegistryFetchMetadataPlanningRequest,
  handoffs: PluginPackageMarketplaceRegistryFetchHandoff[],
  receipts: PluginPackageRegistryFetchExecutionReceipt[],
): PluginPackageMarketplaceRegistryFetchMetadataPlanningEntry {
  const handoff = latestHandoffForEntry(request.catalogId, entry, handoffs);
  const receipt = handoff?.status === "ready" ? latestMatchingReceipt(handoff, receipts) : undefined;
  const suppliedMetadata = findRegistryMetadata(entry, request.registryMetadata);
  const plan = planEntry(entry, request.installedSignatures, receipt, suppliedMetadata);
  const state = planningState(handoff, receipt, suppliedMetadata, plan);
  const blockedReason = stateBlockedReason(handoff, receipt, plan, state);

  return {
    entryId: safeId(entry?.entryId),
    displayName: safeLabel(entry?.displayName),
    state,
    ...(blockedReason === undefined ? {} : { blockedReason }),
    package: {
      name: safeLabel(entry?.manifest?.packageName),
      version: safeLabel(entry?.manifest?.packageVersion),
      source: "<redacted>",
      digest: safeDigest(entry?.manifest?.packageDigest),
    },
    sidecar: summarizeSidecar(entry),
    registry: {
      url: safeRegistryUrl(handoff?.hostAction?.registryUrl ?? suppliedMetadata?.registryUrl),
    },
    receipt: summarizeReceipt(receipt),
    metadata: summarizeMetadata(suppliedMetadata),
    plan,
    nextActions: nextActions(state),
  };
}

function latestHandoffForEntry(
  catalogId: string,
  entry: PluginPackageMarketplaceCatalogEntry,
  handoffs: PluginPackageMarketplaceRegistryFetchHandoff[],
): PluginPackageMarketplaceRegistryFetchHandoff | undefined {
  const safeCatalogId = safeId(catalogId);
  const safeEntryId = safeId(entry?.entryId);
  return handoffs
    .filter((handoff) => {
      return isPlainRecord(handoff)
        && handoff.recordType === "mcp_plugin_package_marketplace_registry_fetch_handoff"
        && safeId(handoff.catalogId) === safeCatalogId
        && safeId(handoff.entry?.entryId) === safeEntryId;
    })
    .sort((left, right) => timestampMs(right.timestamp) - timestampMs(left.timestamp))[0];
}

function latestMatchingReceipt(
  handoff: PluginPackageMarketplaceRegistryFetchHandoff,
  receipts: PluginPackageRegistryFetchExecutionReceipt[],
): PluginPackageRegistryFetchExecutionReceipt | undefined {
  return receipts
    .filter((receipt) => receiptMatchesHandoff(handoff, receipt))
    .sort((left, right) => timestampMs(right.timestamp) - timestampMs(left.timestamp))[0];
}

function receiptMatchesHandoff(
  handoff: PluginPackageMarketplaceRegistryFetchHandoff,
  receipt: PluginPackageRegistryFetchExecutionReceipt,
): boolean {
  return isPlainRecord(receipt)
    && receipt.recordType === "mcp_plugin_package_registry_fetch_execution_receipt"
    && receiptMatchesApproval(receipt.handoffSignature, handoff.approval?.signature)
    && safeLabel(receipt.package?.name) === safeLabel(handoff.package?.name)
    && safeLabel(receipt.package?.version) === safeLabel(handoff.package?.version)
    && safeDigest(receipt.package?.digest) === safeDigest(handoff.package?.digest)
    && safeRegistryUrl(receipt.hostAction?.registryUrl) === safeRegistryUrl(handoff.hostAction?.registryUrl);
}

function receiptMatchesApproval(receiptSignature: unknown, handoffSignature: unknown): boolean {
  const safeReceiptSignature = safeRegistryFetchSignature(receiptSignature);
  const safeHandoffSignature = safeRegistryFetchSignature(handoffSignature);
  if (safeReceiptSignature !== "<redacted>") return safeReceiptSignature === safeHandoffSignature;
  return receiptSignature === "<redacted>" && safeHandoffSignature !== "<redacted>";
}

function findRegistryMetadata(
  entry: PluginPackageMarketplaceCatalogEntry,
  records: Record<string, PluginPackageRegistryMetadata> | undefined,
): PluginPackageRegistryMetadata | undefined {
  if (!isPlainRecord(records)) return undefined;
  const manifest = entry?.manifest;
  const keys = [
    `${manifest?.packageName}@${manifest?.packageVersion}`,
    `${manifest?.packageName}`,
    `${manifest?.packageSource}`,
    `${manifest?.packageDigest}`,
  ];
  for (const key of keys) {
    const record = records[key];
    if (record !== undefined) return record;
  }
  return undefined;
}

function planEntry(
  entry: PluginPackageMarketplaceCatalogEntry,
  installedSignatures: PluginPackagePlannerOptions["installedSignatures"],
  receipt: PluginPackageRegistryFetchExecutionReceipt | undefined,
  metadata: PluginPackageRegistryMetadata | undefined,
): PluginPackageMarketplaceRegistryFetchMetadataPlanningEntry["plan"] {
  const canApplyMetadata = receipt?.status === "completed" && receipt.registryFetched === true && metadata !== undefined;
  const registryMetadata = canApplyMetadata
    ? {
      [`${entry.manifest.packageName}@${entry.manifest.packageVersion}`]: metadata,
    }
    : undefined;
  const plan = planPluginPackageManifest(entry.manifest, {
    installedSignatures,
    ...(registryMetadata === undefined ? {} : { registryMetadata }),
  });
  const action = plan.actions[0];
  return {
    action: safePlanAction(action?.action),
    registryMetadataApplied: action?.registryMetadata?.verified === true && action.action !== "reject",
    registryMetadataVerified: action?.registryMetadata?.verified === true,
    signaturePresent: typeof action?.signature === "string" && action.signature.length > 0,
    blockedReasons: safeTags(action?.reasons ?? []),
    warnings: safeTags([...(action?.warnings ?? []), ...plan.warnings]),
  };
}

function planningState(
  handoff: PluginPackageMarketplaceRegistryFetchHandoff | undefined,
  receipt: PluginPackageRegistryFetchExecutionReceipt | undefined,
  metadata: PluginPackageRegistryMetadata | undefined,
  plan: PluginPackageMarketplaceRegistryFetchMetadataPlanningEntry["plan"],
): PluginPackageMarketplaceRegistryFetchMetadataPlanningState {
  if (handoff === undefined || handoff.status === "blocked") return "metadata_blocked";
  if (receipt === undefined) return "metadata_missing";
  if (receipt.status === "failed") return "metadata_failed";
  if (receipt.status === "blocked") return "metadata_blocked";
  if (metadata === undefined) return "metadata_missing";
  if (plan.action === "reject" || !plan.registryMetadataApplied) return "metadata_rejected";
  return "metadata_ready";
}

function stateBlockedReason(
  handoff: PluginPackageMarketplaceRegistryFetchHandoff | undefined,
  receipt: PluginPackageRegistryFetchExecutionReceipt | undefined,
  plan: PluginPackageMarketplaceRegistryFetchMetadataPlanningEntry["plan"],
  state: PluginPackageMarketplaceRegistryFetchMetadataPlanningState,
): string | undefined {
  if (state === "metadata_blocked") return safeReason(handoff?.blockedReason ?? receipt?.blockedReason ?? "handoff_or_receipt_blocked");
  if (state === "metadata_failed") return safeReason(receipt?.blockedReason ?? "registry_fetch_failed");
  if (state === "metadata_rejected") return plan.blockedReasons[0] ?? "registry_metadata_rejected";
  return undefined;
}

function summarizeSidecar(entry: PluginPackageMarketplaceCatalogEntry): PluginPackageMarketplaceRegistryFetchMetadataPlanningEntry["sidecar"] {
  const sidecar = Array.isArray(entry?.manifest?.sidecars) ? entry.manifest.sidecars[0] : undefined;
  return {
    id: safeLabel(sidecar?.id),
    kind: safeLabel(sidecar?.sidecarKind),
  };
}

function summarizeReceipt(
  receipt: PluginPackageRegistryFetchExecutionReceipt | undefined,
): PluginPackageMarketplaceRegistryFetchMetadataPlanningEntry["receipt"] {
  if (receipt === undefined) {
    return {
      present: false,
      hostNetworkExecuted: false,
      registryFetched: false,
    };
  }
  return {
    present: true,
    status: receipt.status,
    ...(receipt.blockedReason === undefined ? {} : { blockedReason: safeReason(receipt.blockedReason) }),
    hostNetworkExecuted: receipt.hostNetworkExecuted === true,
    registryFetched: receipt.registryFetched === true,
    ...(safeHttpStatus(receipt.hostAction?.status) === undefined ? {} : { statusCode: safeHttpStatus(receipt.hostAction?.status) }),
    ...(receipt.hostAction?.contentType === undefined ? {} : { contentType: safeLabel(receipt.hostAction.contentType) }),
    ...(safeResponseBytes(receipt.hostAction?.responseBytes) === undefined
      ? {}
      : { responseBytes: safeResponseBytes(receipt.hostAction?.responseBytes) }),
  };
}

function summarizeMetadata(
  metadata: PluginPackageRegistryMetadata | undefined,
): PluginPackageMarketplaceRegistryFetchMetadataPlanningEntry["metadata"] {
  if (metadata === undefined) {
    return {
      present: false,
      signatureCount: 0,
    };
  }
  return {
    present: true,
    packageName: safeLabel(metadata.packageName),
    packageVersion: safeLabel(metadata.packageVersion),
    ...(metadata.registryUrl === undefined ? {} : { registryUrl: safeRegistryUrl(metadata.registryUrl) }),
    digest: safeDigest(metadata.packageDigest),
    ...(metadata.integrity === undefined ? {} : { integrity: safeIntegrity(metadata.integrity) }),
    signatureCount: Array.isArray(metadata.signatures) ? Math.min(metadata.signatures.length, 8) : 0,
  };
}

function nextActions(state: PluginPackageMarketplaceRegistryFetchMetadataPlanningState): string[] {
  switch (state) {
    case "metadata_ready":
      return ["Use the verified supplied metadata only as package planning input; install/update still requires a separate explicit approval."];
    case "metadata_rejected":
      return ["Reject or refresh the host-supplied registry metadata before using it for package planning."];
    case "metadata_failed":
      return ["Review the failed registry fetch receipt and retry through a fresh approved host execution if appropriate."];
    case "metadata_blocked":
      return ["Resolve the registry fetch handoff or receipt block before metadata can be trusted for planning."];
    case "metadata_missing":
      return ["Provide host-supplied full registry metadata alongside the completed fetch receipt before using registry metadata for planning."];
  }
}

function safePlanAction(value: unknown): PluginPackagePlanAction | "<blocked>" {
  return value === "import" || value === "update" || value === "keep" || value === "review" || value === "reject"
    ? value
    : "<blocked>";
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

function safeTags(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(safeReason).filter((value) => value !== "<redacted>"))).sort().slice(0, 32);
}

function safeReason(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9_:. -]{1,180}$/i.test(value) && !looksSecret(value)
    ? value.slice(0, 180)
    : "<redacted>";
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

function safeIntegrity(value: unknown): string {
  if (typeof value !== "string" || !/^sha256-[A-Za-z0-9+/=_-]{32,128}$/.test(value) || looksSecret(value)) {
    return "<redacted>";
  }
  return `${value.slice(0, 18)}...${value.slice(-8)}`;
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

function safeHttpStatus(value: unknown): number | undefined {
  return Number.isInteger(value) && typeof value === "number" && value >= 100 && value <= 599 ? value : undefined;
}

function safeResponseBytes(value: unknown): number | undefined {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= 1_000_000 ? value : undefined;
}

function timestampMs(value: unknown): number {
  if (typeof value !== "string") return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function freezeView(view: PluginPackageMarketplaceRegistryFetchMetadataPlanningView): PluginPackageMarketplaceRegistryFetchMetadataPlanningView {
  deepFreeze(view);
  return view;
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
