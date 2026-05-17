import {
  buildPluginMcpSidecarApprovalRequest,
  normalizePluginMcpSidecarDefinition,
  pluginMcpSidecarTrustSignature,
  type NormalizedPluginMcpSidecarDefinition,
  type PluginMcpSidecarApprovalRequest,
  type PluginMcpSidecarDefinition,
  type PluginMcpSidecarKind,
} from "./plugin-sidecar-config";

export type PluginPackagePlanAction = "import" | "update" | "keep" | "review" | "reject";

export interface PluginPackageSidecarManifest {
  id: string;
  sidecarId: string;
  sidecarKind?: PluginMcpSidecarKind;
  declaredCapabilities?: string[];
  allowedTools?: string[];
  allowedMethods?: string[];
  allowedResourceUris?: string[];
  allowedResourceUriPrefixes?: string[];
  origin?: string;
  pluginId?: string;
  clientId?: string;
  timeoutMs?: number;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  maxJsonDepth?: number;
  maxConcurrent?: number;
  expectedProtocolVersion?: string;
  expectedServerName?: string;
  expectedServerVersion?: string;
}

export interface PluginPackageManifest {
  packageName: string;
  packageVersion: string;
  packageSource: string;
  packageDigest: string;
  reviewed?: boolean;
  sidecars: PluginPackageSidecarManifest[];
}

export interface PluginPackageRegistrySignatureMetadata {
  keyId: string;
  algorithm: string;
  signature: string;
}

export interface PluginPackageRegistryMetadata {
  packageName: string;
  packageVersion: string;
  packageSource?: string;
  packageDigest: string;
  registryUrl?: string;
  fetchedAt?: string;
  integrity?: string;
  signatures?: PluginPackageRegistrySignatureMetadata[];
}

export interface PluginPackageRegistryMetadataRecord {
  verified: true;
  registryUrl?: string;
  fetchedAt?: string;
  checksum: {
    digest: string;
    integrity?: string;
  };
  signatures: Array<{
    keyId: string;
    algorithm: string;
    signature: "<redacted>";
  }>;
}

export interface PluginPackagePlannerOptions {
  installedSignatures?: Record<string, string>;
  acceptUnknownSidecars?: boolean;
  registryMetadata?: Record<string, PluginPackageRegistryMetadata>;
}

export interface PluginPackagePlanActionRecord {
  action: PluginPackagePlanAction;
  dryRun: true;
  package: {
    name: string;
    version: string;
    source: string;
    digest: string;
  };
  sidecar: {
    id: string;
    kind: PluginMcpSidecarKind | "unknown";
  };
  reasons: string[];
  warnings: string[];
  commandPreview: string;
  registryMetadata?: PluginPackageRegistryMetadataRecord;
  signature?: string;
  definition?: NormalizedPluginMcpSidecarDefinition;
  approvalRequest?: PluginMcpSidecarApprovalRequest;
}

export interface PluginPackageImportPlan {
  dryRun: true;
  approvalRequired: true;
  totalActions: number;
  importCount: number;
  updateCount: number;
  keepCount: number;
  reviewCount: number;
  rejectCount: number;
  actions: PluginPackagePlanActionRecord[];
  warnings: string[];
}

const SAFE_PACKAGE_WARNINGS = [
  "Dry-run only: no package files are written, installed, executed, or started.",
  "Explicit approval is required before package writes, install/update, sidecar start, or durable catalog persistence.",
  "No live registry fetch is performed; registry metadata must be supplied by the host when used.",
  "supplied registry metadata can enrich checksum/signature planning, but cannot activate packages by itself.",
  "Manifest-declared capabilities are planning metadata only until separately reviewed and approved.",
];
const MCP_METHODS = new Set(["initialize", "tools/list", "tools/call", "resources/list", "resources/read"]);
const SIDECAR_KINDS = new Set<PluginMcpSidecarKind>(["local-sidecar", "daemon-bridge", "app-bridge", "unknown"]);
const NUMERIC_GUARD_LIMITS: Record<string, number> = {
  timeoutMs: 300_000,
  maxRequestBytes: 10 * 1024 * 1024,
  maxResponseBytes: 10 * 1024 * 1024,
  maxJsonDepth: 128,
  maxConcurrent: 64,
};

export function planPluginPackageManifest(
  manifest: PluginPackageManifest,
  options: PluginPackagePlannerOptions = {},
): PluginPackageImportPlan {
  return buildPlan([manifest], options);
}

export function planPluginPackageManifests(
  manifests: PluginPackageManifest[],
  options: PluginPackagePlannerOptions = {},
): PluginPackageImportPlan {
  return buildPlan(manifests, options);
}

function buildPlan(
  manifests: PluginPackageManifest[],
  options: PluginPackagePlannerOptions,
): PluginPackageImportPlan {
  const actions: PluginPackagePlanActionRecord[] = [];
  if (!Array.isArray(manifests)) {
    actions.push(rejectAction("<invalid>", "<invalid>", "invalid_manifest_batch"));
  } else {
    for (const manifest of manifests) {
      actions.push(...planOneManifest(manifest, options));
    }
  }
  actions.sort((a, b) => `${a.package.name}:${a.sidecar.id}`.localeCompare(`${b.package.name}:${b.sidecar.id}`));
  return {
    dryRun: true,
    approvalRequired: true,
    totalActions: actions.length,
    importCount: actions.filter((action) => action.action === "import").length,
    updateCount: actions.filter((action) => action.action === "update").length,
    keepCount: actions.filter((action) => action.action === "keep").length,
    reviewCount: actions.filter((action) => action.action === "review").length,
    rejectCount: actions.filter((action) => action.action === "reject").length,
    actions,
    warnings: [...SAFE_PACKAGE_WARNINGS],
  };
}

function planOneManifest(
  manifest: PluginPackageManifest,
  options: PluginPackagePlannerOptions,
): PluginPackagePlanActionRecord[] {
  if (!isPlainRecord(manifest)) {
    return [rejectAction("<invalid>", "<invalid>", "invalid_manifest")];
  }
  const sidecars = Array.isArray(manifest.sidecars) ? manifest.sidecars : [];
  if (sidecars.length === 0) {
    return [rejectAction(safePackageName(manifest.packageName), "<missing>", "missing_sidecars")];
  }

  const duplicateIds = duplicateSidecarIds(sidecars);
  return [...sidecars]
    .sort((a, b) => safeAuditLabel(a?.id).localeCompare(safeAuditLabel(b?.id)))
    .map((sidecar) => {
      if (!isPlainRecord(sidecar)) {
        return rejectAction(safePackageName(manifest.packageName), "<invalid>", "invalid_sidecar_manifest");
      }
      const duplicate = duplicateIds.has(String(sidecar.id));
      return planOneSidecar(manifest, sidecar, options, duplicate);
    });
}

function planOneSidecar(
  manifest: PluginPackageManifest,
  sidecar: PluginPackageSidecarManifest,
  options: PluginPackagePlannerOptions,
  duplicate: boolean,
): PluginPackagePlanActionRecord {
  const packageSummary = safePackageSummary(manifest);
  const sidecarSummary = {
    id: safeAuditLabel(sidecar.id),
    kind: safeSidecarKind(sidecar.sidecarKind),
  };
  const rejectReasons = validateManifestShape(manifest, sidecar);
  if (duplicate) rejectReasons.push("duplicate_sidecar_id");
  if (rejectReasons.length > 0) {
    return rejectedManifestAction(packageSummary.name, sidecarSummary, rejectReasons);
  }
  const registry = findRegistryMetadata(manifest, options.registryMetadata);
  const registryValidation = validateRegistryMetadata(manifest, registry);
  if (registryValidation.reasons.length > 0) {
    return rejectedManifestAction(packageSummary.name, sidecarSummary, registryValidation.reasons);
  }

  const definition: PluginMcpSidecarDefinition = {
    id: sidecar.id,
    packageName: manifest.packageName,
    packageVersion: manifest.packageVersion,
    packageSource: manifest.packageSource,
    packageDigest: manifest.packageDigest,
    sidecarId: sidecar.sidecarId,
    sidecarKind: sidecar.sidecarKind ?? "unknown",
    declaredCapabilities: sidecar.declaredCapabilities ?? [],
    allowedTools: sidecar.allowedTools ?? [],
    allowedMethods: sidecar.allowedMethods,
    allowedResourceUris: sidecar.allowedResourceUris ?? [],
    allowedResourceUriPrefixes: sidecar.allowedResourceUriPrefixes ?? [],
    origin: sidecar.origin,
    pluginId: sidecar.pluginId,
    clientId: sidecar.clientId,
    timeoutMs: sidecar.timeoutMs,
    maxRequestBytes: sidecar.maxRequestBytes,
    maxResponseBytes: sidecar.maxResponseBytes,
    maxJsonDepth: sidecar.maxJsonDepth,
    maxConcurrent: sidecar.maxConcurrent,
    expectedProtocolVersion: sidecar.expectedProtocolVersion,
    expectedServerName: sidecar.expectedServerName,
    expectedServerVersion: sidecar.expectedServerVersion,
  };

  let normalized: NormalizedPluginMcpSidecarDefinition;
  try {
    normalized = normalizePluginMcpSidecarDefinition(definition);
  } catch {
    return rejectedManifestAction(packageSummary.name, sidecarSummary, ["invalid_sidecar_definition"]);
  }

  const reviewReasons: string[] = [];
  if (manifest.reviewed !== true) reviewReasons.push("unreviewed_manifest");
  if (normalized.sidecarKind === "unknown" && options.acceptUnknownSidecars !== true) {
    reviewReasons.push("unknown_sidecar_kind");
  }
  if (reviewReasons.length > 0) {
    return baseAction("review", packageSummary, {
      id: safeAuditLabel(normalized.id),
      kind: normalized.sidecarKind,
    }, reviewReasons, registryValidation.record);
  }

  const signature = pluginMcpSidecarTrustSignature(normalized);
  const existing = options.installedSignatures?.[normalized.id];
  const action: PluginPackagePlanAction = existing === signature ? "keep" : existing === undefined ? "import" : "update";
  return {
    ...baseAction(action, safePackageSummary(normalized), {
      id: safeAuditLabel(normalized.id),
      kind: normalized.sidecarKind,
    }, action === "keep" ? ["signature_current"] : existing === undefined ? ["missing_local"] : ["signature_changed"], registryValidation.record),
    signature,
    definition: cloneDefinition(normalized),
    approvalRequest: buildPluginMcpSidecarApprovalRequest(normalized),
  };
}

function validateManifestShape(
  manifest: PluginPackageManifest,
  sidecar: PluginPackageSidecarManifest,
): string[] {
  const reasons: string[] = [];
  if (!validString(manifest.packageName, 160) || looksSecret(manifest.packageName)) reasons.push("invalid_package_name");
  if (!validString(manifest.packageVersion, 80) || looksSecret(manifest.packageVersion)) reasons.push("invalid_package_version");
  if (!validString(manifest.packageSource, 240) || looksSecret(manifest.packageSource) || !safePackageSource(manifest.packageSource)) {
    reasons.push("invalid_package_source");
  }
  if (!validDigest(manifest.packageDigest)) reasons.push("invalid_package_digest");
  if (!validString(sidecar.id, 80) || looksSecret(sidecar.id)) reasons.push("invalid_sidecar_id");
  if (!validString(sidecar.sidecarId, 80) || looksSecret(sidecar.sidecarId)) reasons.push("invalid_runtime_sidecar_id");
  if (sidecar.sidecarKind !== undefined && !SIDECAR_KINDS.has(sidecar.sidecarKind)) reasons.push("invalid_sidecar_kind");
  reasons.push(...validateOptionalStringList(sidecar.declaredCapabilities, "invalid_capabilities"));
  reasons.push(...validateOptionalStringList(sidecar.allowedTools, "invalid_allowed_tools"));
  reasons.push(...validateOptionalStringList(sidecar.allowedMethods, "invalid_allowed_methods"));
  reasons.push(...validateOptionalStringList(sidecar.allowedResourceUris, "invalid_allowed_resource_uris"));
  reasons.push(...validateOptionalStringList(sidecar.allowedResourceUriPrefixes, "invalid_allowed_resource_uri_prefixes"));
  const allowedMethods = Array.isArray(sidecar.allowedMethods) ? sidecar.allowedMethods : [];
  const allowedTools = Array.isArray(sidecar.allowedTools) ? sidecar.allowedTools : [];
  const allowedResourceUris = Array.isArray(sidecar.allowedResourceUris) ? sidecar.allowedResourceUris : [];
  const allowedResourceUriPrefixes = Array.isArray(sidecar.allowedResourceUriPrefixes) ? sidecar.allowedResourceUriPrefixes : [];
  if (allowedMethods.some((method) => !MCP_METHODS.has(method))) reasons.push("unsupported_allowed_method");
  if (allowedMethods.includes("tools/call") && allowedTools.length === 0) reasons.push("tools_call_without_allowed_tools");
  if (allowedMethods.includes("resources/read")
    && allowedResourceUris.length === 0
    && allowedResourceUriPrefixes.length === 0) {
    reasons.push("resources_read_without_allowed_resources");
  }
  for (const [label, value] of [
    ["invalid_origin", sidecar.origin],
    ["invalid_plugin_id", sidecar.pluginId],
    ["invalid_client_id", sidecar.clientId],
    ["invalid_expected_protocol_version", sidecar.expectedProtocolVersion],
    ["invalid_expected_server_name", sidecar.expectedServerName],
    ["invalid_expected_server_version", sidecar.expectedServerVersion],
  ] as const) {
    if (value !== undefined && (!validString(value, 160) || looksSecret(value))) reasons.push(label);
  }
  for (const [label, field, value] of [
    ["invalid_timeout_ms", "timeoutMs", sidecar.timeoutMs],
    ["invalid_max_request_bytes", "maxRequestBytes", sidecar.maxRequestBytes],
    ["invalid_max_response_bytes", "maxResponseBytes", sidecar.maxResponseBytes],
    ["invalid_max_json_depth", "maxJsonDepth", sidecar.maxJsonDepth],
    ["invalid_max_concurrent", "maxConcurrent", sidecar.maxConcurrent],
  ] as const) {
    if (value !== undefined && (!positiveInteger(value) || value > NUMERIC_GUARD_LIMITS[field])) reasons.push(label);
  }
  return uniqueSorted(reasons);
}

function validateOptionalStringList(values: string[] | undefined, reason: string): string[] {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.length > 64) return [reason];
  return values.some((value) => !validString(value, 160) || looksSecret(value)) ? [reason] : [];
}

function baseAction(
  action: PluginPackagePlanAction,
  packageSummary: PluginPackagePlanActionRecord["package"],
  sidecar: PluginPackagePlanActionRecord["sidecar"],
  reasons: string[],
  registryMetadata?: PluginPackageRegistryMetadataRecord,
): PluginPackagePlanActionRecord {
  return {
    action,
    dryRun: true,
    package: packageSummary,
    sidecar,
    reasons: uniqueSorted(reasons),
    warnings: [...SAFE_PACKAGE_WARNINGS],
    commandPreview: "dry-run only; requires explicit approval before package write, install/update, sidecar start, registry fetch, or durable catalog persistence",
    ...(registryMetadata === undefined ? {} : { registryMetadata }),
  };
}

function rejectAction(packageName: string, sidecarId: string, reason: string): PluginPackagePlanActionRecord {
  return rejectedManifestAction(packageName, {
    id: safeAuditLabel(sidecarId),
    kind: "unknown",
  }, [reason]);
}

function rejectedManifestAction(
  packageName: string,
  sidecar: PluginPackagePlanActionRecord["sidecar"],
  reasons: string[],
): PluginPackagePlanActionRecord {
  return baseAction("reject", {
    name: safeAuditLabel(packageName),
    version: "<redacted>",
    source: "<redacted>",
    digest: "<redacted>",
  }, sidecar, reasons);
}

function duplicateSidecarIds(sidecars: PluginPackageSidecarManifest[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const sidecar of sidecars) {
    const id = isPlainRecord(sidecar) ? String(sidecar.id) : "";
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return duplicates;
}

function cloneDefinition(definition: NormalizedPluginMcpSidecarDefinition): NormalizedPluginMcpSidecarDefinition {
  return {
    ...definition,
    declaredCapabilities: [...definition.declaredCapabilities],
    allowedTools: [...definition.allowedTools],
    allowedMethods: [...definition.allowedMethods],
    allowedResourceUris: [...definition.allowedResourceUris],
    allowedResourceUriPrefixes: [...definition.allowedResourceUriPrefixes],
  };
}

function safePackageSummary(manifest: Pick<PluginPackageManifest, "packageName" | "packageVersion" | "packageSource" | "packageDigest">): PluginPackagePlanActionRecord["package"] {
  return {
    name: safeAuditLabel(manifest.packageName),
    version: safeAuditLabel(manifest.packageVersion),
    source: safeAuditLabel(manifest.packageSource),
    digest: safeDigestLabel(manifest.packageDigest),
  };
}

function safePackageName(value: unknown): string {
  return typeof value === "string" ? safeAuditLabel(value) : "<invalid>";
}

function safeSidecarKind(value: unknown): PluginMcpSidecarKind | "unknown" {
  return typeof value === "string" && SIDECAR_KINDS.has(value as PluginMcpSidecarKind) ? value as PluginMcpSidecarKind : "unknown";
}

function findRegistryMetadata(
  manifest: PluginPackageManifest,
  records: Record<string, PluginPackageRegistryMetadata> | undefined,
): PluginPackageRegistryMetadata | undefined {
  if (!isPlainRecord(records)) return undefined;
  const keys = [
    `${manifest.packageName}@${manifest.packageVersion}`,
    `${manifest.packageName}`,
    `${manifest.packageSource}`,
    `${manifest.packageDigest}`,
  ];
  for (const key of keys) {
    const record = records[key];
    if (record !== undefined) return record;
  }
  return undefined;
}

function validateRegistryMetadata(
  manifest: PluginPackageManifest,
  metadata: PluginPackageRegistryMetadata | undefined,
): { reasons: string[]; record?: PluginPackageRegistryMetadataRecord } {
  if (metadata === undefined) return { reasons: [] };
  if (!isPlainRecord(metadata)) return { reasons: ["invalid_registry_metadata"] };

  const reasons: string[] = [];
  if (!validString(metadata.packageName, 160) || looksSecret(metadata.packageName)) reasons.push("invalid_registry_metadata");
  if (!validString(metadata.packageVersion, 80) || looksSecret(metadata.packageVersion)) reasons.push("invalid_registry_metadata");
  if (!validDigest(metadata.packageDigest)) reasons.push("invalid_registry_metadata");
  if (metadata.packageSource !== undefined
    && (!validString(metadata.packageSource, 240) || looksSecret(metadata.packageSource) || !safePackageSource(metadata.packageSource))) {
    reasons.push("invalid_registry_metadata");
  }
  if (metadata.registryUrl !== undefined
    && (!validString(metadata.registryUrl, 240) || looksSecret(metadata.registryUrl) || !safePackageSource(metadata.registryUrl))) {
    reasons.push("invalid_registry_metadata");
  }
  if (metadata.fetchedAt !== undefined && !validTimestamp(metadata.fetchedAt)) reasons.push("invalid_registry_metadata");
  if (metadata.integrity !== undefined && !validIntegrity(metadata.integrity)) reasons.push("invalid_registry_metadata");
  if (metadata.signatures !== undefined && !validRegistrySignatures(metadata.signatures)) reasons.push("invalid_registry_metadata");
  if (reasons.length > 0) return { reasons: uniqueSorted(reasons) };

  if (metadata.packageName !== manifest.packageName || metadata.packageVersion !== manifest.packageVersion) {
    reasons.push("registry_identity_mismatch");
  }
  if (metadata.packageSource !== undefined && metadata.packageSource !== manifest.packageSource) {
    reasons.push("registry_source_mismatch");
  }
  if (metadata.packageDigest.toLowerCase() !== manifest.packageDigest.toLowerCase()) {
    reasons.push("registry_digest_mismatch");
  }
  if (reasons.length > 0) return { reasons: uniqueSorted(reasons) };

  return {
    reasons: [],
    record: {
      verified: true,
      ...(metadata.registryUrl === undefined ? {} : { registryUrl: safeAuditLabel(metadata.registryUrl) }),
      ...(metadata.fetchedAt === undefined ? {} : { fetchedAt: metadata.fetchedAt }),
      checksum: {
        digest: safeDigestLabel(metadata.packageDigest),
        ...(metadata.integrity === undefined ? {} : { integrity: safeIntegrityLabel(metadata.integrity) }),
      },
      signatures: (metadata.signatures ?? []).slice(0, 8).map((signature) => ({
        keyId: safeAuditLabel(signature.keyId),
        algorithm: safeAuditLabel(signature.algorithm),
        signature: "<redacted>",
      })),
    },
  };
}

function safePackageSource(value: string): boolean {
  try {
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
    }
    return /^[A-Za-z0-9._/@:-]{1,160}$/.test(value);
  } catch {
    return false;
  }
}

function validDigest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/i.test(value);
}

function validIntegrity(value: unknown): value is string {
  return typeof value === "string" && /^sha256-[A-Za-z0-9+/=_-]{32,128}$/.test(value) && !looksSecret(value);
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 40 || /[\0\r\n]/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function validRegistrySignatures(values: unknown): values is PluginPackageRegistrySignatureMetadata[] {
  if (!Array.isArray(values) || values.length > 8) return false;
  return values.every((value) => {
    if (!isPlainRecord(value)) return false;
    return validString(value.keyId, 120)
      && !looksSecret(value.keyId)
      && validString(value.algorithm, 80)
      && !looksSecret(value.algorithm)
      && validString(value.signature, 4096);
  });
}

function validString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && !/[\0\r\n]/.test(value);
}

function positiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value > 0;
}

function safeDigestLabel(value: unknown): string {
  if (!validDigest(value)) return "<redacted>";
  return `${value.slice(0, 18).toLowerCase()}...${value.slice(-8).toLowerCase()}`;
}

function safeIntegrityLabel(value: unknown): string {
  if (!validIntegrity(value)) return "<redacted>";
  return `${value.slice(0, 18)}...${value.slice(-8)}`;
}

function looksSecret(value: unknown): boolean {
  return typeof value === "string" && /(secret|token|password|credential|bearer|api[_-]?key)/i.test(value);
}

function safeAuditLabel(value: unknown): string {
  if (typeof value !== "string") return "<invalid>";
  const clean = value.replace(/[\0\r\n]/g, "");
  return looksSecret(clean) ? "<redacted>" : clean.slice(0, 80);
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
