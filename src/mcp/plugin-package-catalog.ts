import { appendFile, mkdir, readFile } from "fs/promises";
import { dirname, join } from "path";

import type {
  PluginPackageImportPlan,
  PluginPackagePlanAction,
  PluginPackagePlanActionRecord,
} from "./plugin-package-discovery";
import { normalizePluginMcpSidecarDefinition, pluginMcpSidecarTrustSignature } from "./plugin-sidecar-config";
import type { NormalizedPluginMcpSidecarDefinition, PluginMcpSidecarKind } from "./plugin-sidecar-config";

export interface PluginPackageCatalogApproval {
  approved: boolean;
  approvedBy?: string;
  reason?: string;
}

export interface PluginPackageCatalogStagingRequest {
  plan: PluginPackageImportPlan;
  catalogId: string;
  approval: PluginPackageCatalogApproval;
  timestamp?: string | Date;
}

export interface PluginPackageCatalogBlockedAction {
  sequence: number;
  action: PluginPackagePlanAction;
  package: {
    name: string;
    version: string;
    source: "<redacted>";
    digest: string;
  };
  sidecar: {
    id: string;
    kind: PluginMcpSidecarKind | "unknown";
  };
  reason:
    | "approval_required"
    | "not_catalog_write_action"
    | "invalid_plugin_signature"
    | "invalid_sidecar_kind"
    | "invalid_plan_boundary";
}

export interface PluginPackageCatalogCandidateRecord {
  recordType: "mcp_plugin_package_catalog_candidate";
  catalogId: string;
  sequence: number;
  timestamp: string;
  action: "import" | "update";
  status: "staged";
  dryRun: true;
  activation: false;
  package: {
    name: string;
    version: string;
    source: "<redacted>";
    digest: string;
  };
  sidecar: {
    id: string;
    kind: PluginMcpSidecarKind | "unknown";
  };
  reasons: string[];
  warnings: string[];
  signature: string;
  approval: {
    approved: true;
    approvedBy?: string;
    reason: "<redacted>";
  };
}

export interface PluginPackageCatalogStagingResult {
  status: "staged" | "blocked";
  catalogId: string;
  dryRun: true;
  activation: false;
  records: PluginPackageCatalogCandidateRecord[];
  blocked: PluginPackageCatalogBlockedAction[];
  warnings: string[];
}

export interface JsonPluginPackageCatalogStagingStoreOptions {
  rootDir: string;
}

export interface PluginPackageLiveCatalogRequest {
  catalogId: string;
  candidates: unknown[];
  approval: PluginPackageCatalogApproval;
  timestamp?: string | Date;
}

export interface PluginPackageLiveCatalogRollbackRequest {
  catalogId: string;
  records: unknown[];
  approval: PluginPackageCatalogApproval;
  timestamp?: string | Date;
}

export interface PluginPackageLiveCatalogBlockedRecord {
  sequence: number;
  signature: string;
  package: {
    name: string;
    version: string;
    source: "<redacted>";
    digest: string;
  };
  sidecar: {
    id: string;
    kind: PluginMcpSidecarKind | "unknown";
  };
  reason:
    | "approval_required"
    | "invalid_candidate"
    | "invalid_live_record"
    | "invalid_plugin_signature"
    | "catalog_mismatch";
}

export interface PluginPackageLiveCatalogRecord {
  recordType: "mcp_plugin_package_catalog_live_record";
  catalogId: string;
  sequence: number;
  timestamp: string;
  status: "live_disabled" | "rolled_back";
  enabled: false;
  activation: false;
  package: {
    name: string;
    version: string;
    source: "<redacted>";
    digest: string;
  };
  sidecar: {
    id: string;
    kind: PluginMcpSidecarKind;
  };
  signature: string;
  sourceCandidate: {
    catalogId: string;
    sequence: number;
    signature: string;
    timestamp: string;
  };
  rollbackOf?: string;
  warnings: string[];
  approval: {
    approved: true;
    approvedBy?: string;
    reason: "<redacted>";
  };
}

export interface PluginPackageLiveCatalogResult {
  status: "promoted" | "rolled_back" | "blocked";
  catalogId: string;
  activation: false;
  records: PluginPackageLiveCatalogRecord[];
  blocked: PluginPackageLiveCatalogBlockedRecord[];
  warnings: string[];
}

export interface JsonPluginPackageLiveCatalogStoreOptions {
  rootDir: string;
}

type NormalizedCatalogApproval = {
  approved: boolean;
  approvedBy?: string;
  reason: "<redacted>";
};

const CATALOG_FILE = "plugin-package-catalog-candidates.jsonl";
const LIVE_CATALOG_FILE = "plugin-package-live-catalog.jsonl";
const CATALOG_WARNINGS = [
  "Catalog candidates are staged metadata only and cannot install packages, execute code, fetch registries, or start sidecars.",
  "Promotion into an active package catalog remains a separate approval and activation step.",
  "Package source, approval request details, and trusted sidecar config bodies are intentionally omitted.",
];
const LIVE_CATALOG_WARNINGS = [
  "Live catalog records are disabled metadata only and cannot install packages, execute code, fetch registries, or start sidecars.",
  "Enabling a live catalog record remains a separate future approval-gated step.",
  "Rollback records are metadata tombstones only and do not execute uninstall or sidecar-stop hooks.",
];
const SIDECAR_KINDS = new Set<PluginMcpSidecarKind | "unknown">(["local-sidecar", "daemon-bridge", "app-bridge", "unknown"]);
const STAGED_RECORDS = new WeakSet<PluginPackageCatalogCandidateRecord>();
const LIVE_RECORDS = new WeakSet<PluginPackageLiveCatalogRecord>();

export function stagePluginPackageCatalogRecords(
  request: PluginPackageCatalogStagingRequest,
): PluginPackageCatalogStagingResult {
  const catalogId = safeId(request.catalogId);
  const timestamp = toIso(request.timestamp ?? new Date());
  const approval = normalizeApproval(request.approval);
  const stagedRecords: PluginPackageCatalogCandidateRecord[] = [];
  const blocked: PluginPackageCatalogBlockedAction[] = [];
  const validPlanBoundary = request.plan?.dryRun === true && request.plan.approvalRequired === true && Array.isArray(request.plan.actions);

  const actions = Array.isArray(request.plan?.actions) ? request.plan.actions : [];
  actions.forEach((action, sequence) => {
    const projected = projectBlockedAction(action, sequence, "not_catalog_write_action");
    if (!validPlanBoundary || action.dryRun !== true) {
      blocked.push({ ...projected, reason: "invalid_plan_boundary" });
      return;
    }
    if (action.action !== "import" && action.action !== "update") {
      blocked.push(projected);
      return;
    }
    if (!approval.approved) {
      blocked.push({ ...projected, reason: "approval_required" });
      return;
    }
    const trusted = trustedAction(action);
    if (trusted === undefined) {
      blocked.push({ ...projected, reason: "invalid_plugin_signature" });
      return;
    }
    if (trusted.definition.sidecarKind === "unknown") {
      blocked.push({ ...projected, reason: "invalid_sidecar_kind" });
      return;
    }
    stagedRecords.push(markStagedRecord(normalizeCatalogRecord({
      recordType: "mcp_plugin_package_catalog_candidate",
      catalogId,
      sequence,
      timestamp,
      action: action.action,
      status: "staged",
      dryRun: true,
      activation: false,
      package: {
        name: safeLabel(trusted.definition.packageName),
        version: safeLabel(trusted.definition.packageVersion),
        source: "<redacted>",
        digest: safeDigest(trusted.definition.packageDigest),
      },
      sidecar: {
        id: safeLabel(trusted.definition.id),
        kind: trusted.definition.sidecarKind,
      },
      reasons: safeLabels(action.reasons),
      warnings: [...CATALOG_WARNINGS, ...safeLabels(action.warnings)],
      signature: trusted.signature,
      approval: requireApprovedApproval(approval),
    })));
  });

  const records = blocked.length === 0 ? stagedRecords : [];
  return {
    status: records.length > 0 && blocked.length === 0 ? "staged" : "blocked",
    catalogId,
    dryRun: true,
    activation: false,
    records,
    blocked,
    warnings: [...CATALOG_WARNINGS],
  };
}

export class JsonPluginPackageCatalogStagingStore {
  private readonly _catalogPath: string;

  constructor(options: JsonPluginPackageCatalogStagingStoreOptions) {
    this._catalogPath = join(options.rootDir, CATALOG_FILE);
  }

  async append(records: PluginPackageCatalogCandidateRecord[]): Promise<void> {
    if (!Array.isArray(records) || records.some((record) => !STAGED_RECORDS.has(record))) {
      throw new Error("Plugin package catalog candidate append rejected");
    }
    const lines = records.map((record) => JSON.stringify(normalizeCatalogRecord(record)));
    await mkdir(dirname(this._catalogPath), { recursive: true });
    if (lines.length > 0) {
      await appendFile(this._catalogPath, `${lines.join("\n")}\n`, "utf8");
    }
  }

  async load(): Promise<PluginPackageCatalogCandidateRecord[]> {
    let content: string;
    try {
      content = await readFile(this._catalogPath, "utf8");
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") return [];
      throw new Error("Plugin package catalog candidate journal is invalid");
    }
    const records: PluginPackageCatalogCandidateRecord[] = [];
    for (const line of content.split(/\r?\n/)) {
      if (line.trim().length === 0) continue;
      try {
        records.push(markStagedRecord(normalizeCatalogRecord(JSON.parse(line) as PluginPackageCatalogCandidateRecord)));
      } catch {
        throw new Error("Plugin package catalog candidate journal is invalid");
      }
    }
    return records;
  }
}

export function promotePluginPackageLiveCatalogRecords(
  request: PluginPackageLiveCatalogRequest,
): PluginPackageLiveCatalogResult {
  const catalogId = maybeCatalogId(request.catalogId);
  const timestamp = toIso(request.timestamp ?? new Date());
  const approval = normalizeApproval(request.approval);
  const candidates = Array.isArray(request.candidates) ? request.candidates : [];
  const promoted: PluginPackageLiveCatalogRecord[] = [];
  const blocked: PluginPackageLiveCatalogBlockedRecord[] = [];

  if (catalogId === undefined) {
    return {
      status: "blocked",
      catalogId: "<redacted>",
      activation: false,
      records: [],
      blocked: candidates.map((candidate, sequence) => projectLiveBlockedRecord(candidate, sequence, "invalid_candidate")),
      warnings: [...LIVE_CATALOG_WARNINGS],
    };
  }

  candidates.forEach((candidate, sequence) => {
    const projected = projectLiveBlockedRecord(candidate, sequence, "invalid_candidate");
    if (!approval.approved) {
      blocked.push({ ...projected, reason: "approval_required" });
      return;
    }
    if (isPlainRecord(candidate) && candidate.signature !== undefined && safeSignature(candidate.signature) === undefined) {
      blocked.push({ ...projected, reason: "invalid_plugin_signature" });
      return;
    }

    let staged: PluginPackageCatalogCandidateRecord;
    try {
      staged = normalizeCatalogRecord(candidate as PluginPackageCatalogCandidateRecord);
    } catch {
      blocked.push(projected);
      return;
    }
    if (!STAGED_RECORDS.has(candidate as PluginPackageCatalogCandidateRecord)) {
      blocked.push(projected);
      return;
    }

    if (staged.catalogId !== catalogId) {
      blocked.push({ ...projectLiveBlockedRecord(staged, sequence, "catalog_mismatch"), reason: "catalog_mismatch" });
      return;
    }
    if (safeSignature(staged.signature) === undefined) {
      blocked.push({ ...projectLiveBlockedRecord(staged, sequence, "invalid_plugin_signature"), reason: "invalid_plugin_signature" });
      return;
    }

    promoted.push(markLiveRecord(normalizeLiveCatalogRecord({
      recordType: "mcp_plugin_package_catalog_live_record",
      catalogId,
      sequence,
      timestamp,
      status: "live_disabled",
      enabled: false,
      activation: false,
      package: { ...staged.package },
      sidecar: {
        id: staged.sidecar.id,
        kind: staged.sidecar.kind,
      },
      signature: staged.signature,
      sourceCandidate: {
        catalogId: staged.catalogId,
        sequence: staged.sequence,
        signature: staged.signature,
        timestamp: staged.timestamp,
      },
      warnings: [...LIVE_CATALOG_WARNINGS, ...staged.warnings],
      approval: requireApprovedApproval(approval),
    })));
  });

  const records = blocked.length === 0 ? promoted : [];
  return {
    status: records.length > 0 && blocked.length === 0 ? "promoted" : "blocked",
    catalogId,
    activation: false,
    records,
    blocked,
    warnings: [...LIVE_CATALOG_WARNINGS],
  };
}

export function rollbackPluginPackageLiveCatalogRecords(
  request: PluginPackageLiveCatalogRollbackRequest,
): PluginPackageLiveCatalogResult {
  const catalogId = maybeCatalogId(request.catalogId);
  const timestamp = toIso(request.timestamp ?? new Date());
  const approval = normalizeApproval(request.approval);
  const records = Array.isArray(request.records) ? request.records : [];
  const rollbacks: PluginPackageLiveCatalogRecord[] = [];
  const blocked: PluginPackageLiveCatalogBlockedRecord[] = [];

  if (catalogId === undefined) {
    return {
      status: "blocked",
      catalogId: "<redacted>",
      activation: false,
      records: [],
      blocked: records.map((record, sequence) => projectLiveBlockedRecord(record, sequence, "invalid_live_record")),
      warnings: [...LIVE_CATALOG_WARNINGS],
    };
  }

  records.forEach((record, sequence) => {
    const projected = projectLiveBlockedRecord(record, sequence, "invalid_live_record");
    if (!approval.approved) {
      blocked.push({ ...projected, reason: "approval_required" });
      return;
    }

    let liveRecord: PluginPackageLiveCatalogRecord;
    try {
      liveRecord = normalizeLiveCatalogRecord(record as PluginPackageLiveCatalogRecord);
    } catch {
      blocked.push(projected);
      return;
    }
    if (!LIVE_RECORDS.has(record as PluginPackageLiveCatalogRecord) || liveRecord.status !== "live_disabled") {
      blocked.push(projected);
      return;
    }

    if (liveRecord.catalogId !== catalogId) {
      blocked.push({ ...projectLiveBlockedRecord(liveRecord, sequence, "catalog_mismatch"), reason: "catalog_mismatch" });
      return;
    }

    rollbacks.push(markLiveRecord(normalizeLiveCatalogRecord({
      recordType: "mcp_plugin_package_catalog_live_record",
      catalogId,
      sequence,
      timestamp,
      status: "rolled_back",
      enabled: false,
      activation: false,
      package: { ...liveRecord.package },
      sidecar: { ...liveRecord.sidecar },
      signature: liveRecord.signature,
      sourceCandidate: { ...liveRecord.sourceCandidate },
      rollbackOf: liveRecord.signature,
      warnings: [...LIVE_CATALOG_WARNINGS],
      approval: requireApprovedApproval(approval),
    })));
  });

  const rollbackRecords = blocked.length === 0 ? rollbacks : [];
  return {
    status: rollbackRecords.length > 0 && blocked.length === 0 ? "rolled_back" : "blocked",
    catalogId,
    activation: false,
    records: rollbackRecords,
    blocked,
    warnings: [...LIVE_CATALOG_WARNINGS],
  };
}

export class JsonPluginPackageLiveCatalogStore {
  private readonly _catalogPath: string;

  constructor(options: JsonPluginPackageLiveCatalogStoreOptions) {
    this._catalogPath = join(options.rootDir, LIVE_CATALOG_FILE);
  }

  async append(records: PluginPackageLiveCatalogRecord[]): Promise<void> {
    if (!Array.isArray(records) || records.some((record) => !LIVE_RECORDS.has(record))) {
      throw new Error("Plugin package live catalog append rejected");
    }
    const lines = records.map((record) => JSON.stringify(normalizeLiveCatalogRecord(record)));
    await mkdir(dirname(this._catalogPath), { recursive: true });
    if (lines.length > 0) {
      await appendFile(this._catalogPath, `${lines.join("\n")}\n`, "utf8");
    }
  }

  async load(): Promise<PluginPackageLiveCatalogRecord[]> {
    let content: string;
    try {
      content = await readFile(this._catalogPath, "utf8");
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") return [];
      throw new Error("Plugin package live catalog journal is invalid");
    }
    const records: PluginPackageLiveCatalogRecord[] = [];
    for (const line of content.split(/\r?\n/)) {
      if (line.trim().length === 0) continue;
      try {
        records.push(markLiveRecord(normalizeLiveCatalogRecord(JSON.parse(line) as PluginPackageLiveCatalogRecord)));
      } catch {
        throw new Error("Plugin package live catalog journal is invalid");
      }
    }
    return records;
  }
}

function normalizeCatalogRecord(record: PluginPackageCatalogCandidateRecord): PluginPackageCatalogCandidateRecord {
  if (!isPlainRecord(record)) throw new Error("invalid catalog record");
  rejectForbiddenDurableFields(record);
  if (record.recordType !== "mcp_plugin_package_catalog_candidate") throw new Error("invalid catalog record type");
  if (record.status !== "staged" || record.dryRun !== true || record.activation !== false) {
    throw new Error("invalid catalog boundary");
  }
  if (record.action !== "import" && record.action !== "update") throw new Error("invalid catalog action");
  if (!isPlainRecord(record.package) || !isPlainRecord(record.sidecar) || !isPlainRecord(record.approval)) {
    throw new Error("invalid catalog shape");
  }
  if (record.sidecar.kind === "unknown") throw new Error("invalid catalog sidecar kind");
  if (record.package.source !== "<redacted>") throw new Error("invalid package source");
  const signature = safeSignature(record.signature);
  if (signature === undefined) throw new Error("invalid plugin signature");
  const approval = requireApprovedApproval(normalizeApproval(record.approval));
  return {
    recordType: "mcp_plugin_package_catalog_candidate",
    catalogId: safeId(record.catalogId),
    sequence: readSequence(record.sequence),
    timestamp: toIso(record.timestamp),
    action: record.action,
    status: "staged",
    dryRun: true,
    activation: false,
    package: {
      name: safeLabel(record.package.name),
      version: safeLabel(record.package.version),
      source: "<redacted>",
      digest: safeDigest(record.package.digest),
    },
    sidecar: {
      id: safeLabel(record.sidecar.id),
      kind: safeSidecarKind(record.sidecar.kind),
    },
    reasons: safeLabels(record.reasons),
    warnings: safeLabels(record.warnings),
    signature,
    approval,
  };
}

function normalizeLiveCatalogRecord(record: PluginPackageLiveCatalogRecord): PluginPackageLiveCatalogRecord {
  if (!isPlainRecord(record)) throw new Error("invalid live catalog record");
  rejectForbiddenDurableFields(record);
  if (record.recordType !== "mcp_plugin_package_catalog_live_record") throw new Error("invalid live catalog record type");
  if (record.status !== "live_disabled" && record.status !== "rolled_back") throw new Error("invalid live catalog status");
  if (record.enabled !== false || record.activation !== false) throw new Error("invalid live catalog activation boundary");
  if (!isPlainRecord(record.package)
    || !isPlainRecord(record.sidecar)
    || !isPlainRecord(record.approval)
    || !isPlainRecord(record.sourceCandidate)) {
    throw new Error("invalid live catalog shape");
  }
  if (record.package.source !== "<redacted>") throw new Error("invalid package source");
  const signature = safeSignature(record.signature);
  if (signature === undefined) throw new Error("invalid plugin signature");
  const sourceSignature = safeSignature(record.sourceCandidate.signature);
  if (sourceSignature === undefined) throw new Error("invalid source signature");
  const rollbackOf = record.rollbackOf === undefined ? undefined : safeSignature(record.rollbackOf);
  if (record.status === "rolled_back" && rollbackOf === undefined) throw new Error("invalid rollback signature");
  if (record.status === "live_disabled" && record.rollbackOf !== undefined) throw new Error("invalid live rollback field");
  const sidecarKind = safeSidecarKind(record.sidecar.kind);
  if (sidecarKind === "unknown") throw new Error("invalid live sidecar kind");
  const approval = requireApprovedApproval(normalizeApproval(record.approval));
  return {
    recordType: "mcp_plugin_package_catalog_live_record",
    catalogId: readCatalogId(record.catalogId),
    sequence: readSequence(record.sequence),
    timestamp: toIso(record.timestamp),
    status: record.status,
    enabled: false,
    activation: false,
    package: {
      name: safeLabel(record.package.name),
      version: safeLabel(record.package.version),
      source: "<redacted>",
      digest: safeDigest(record.package.digest),
    },
    sidecar: {
      id: safeLabel(record.sidecar.id),
      kind: sidecarKind,
    },
    signature,
    sourceCandidate: {
      catalogId: readCatalogId(record.sourceCandidate.catalogId),
      sequence: readSequence(record.sourceCandidate.sequence),
      signature: sourceSignature,
      timestamp: toIso(record.sourceCandidate.timestamp),
    },
    ...(rollbackOf === undefined ? {} : { rollbackOf }),
    warnings: safeLabels(record.warnings),
    approval,
  };
}

function normalizeApproval(value: unknown): NormalizedCatalogApproval {
  if (!isPlainRecord(value)) {
    return { approved: false, reason: "<redacted>" };
  }
  return {
    approved: value.approved === true,
    ...(value.approvedBy === undefined ? {} : { approvedBy: safeLabel(value.approvedBy) }),
    reason: "<redacted>",
  };
}

function requireApprovedApproval(value: NormalizedCatalogApproval): PluginPackageCatalogCandidateRecord["approval"] {
  if (!value.approved) throw new Error("invalid approval");
  return {
    approved: true,
    ...(value.approvedBy === undefined ? {} : { approvedBy: value.approvedBy }),
    reason: "<redacted>",
  };
}

function projectLiveBlockedRecord(
  value: unknown,
  sequence: number,
  reason: PluginPackageLiveCatalogBlockedRecord["reason"],
): PluginPackageLiveCatalogBlockedRecord {
  const record = isPlainRecord(value) ? value : {};
  const pkg = isPlainRecord(record.package) ? record.package : {};
  const sidecar = isPlainRecord(record.sidecar) ? record.sidecar : {};
  return {
    sequence,
    signature: safeSignature(record.signature) ?? "<redacted>",
    package: {
      name: safeLabel(pkg.name),
      version: safeLabel(pkg.version),
      source: "<redacted>",
      digest: safeDigest(pkg.digest),
    },
    sidecar: {
      id: safeLabel(sidecar.id),
      kind: safeSidecarKind(sidecar.kind),
    },
    reason,
  };
}

function projectBlockedAction(
  action: PluginPackagePlanActionRecord,
  sequence: number,
  reason: PluginPackageCatalogBlockedAction["reason"],
): PluginPackageCatalogBlockedAction {
  return {
    sequence,
    action: action.action,
    package: {
      name: safeLabel(action.package.name),
      version: action.action === "reject" ? "<redacted>" : safeLabel(action.package.version),
      source: "<redacted>",
      digest: action.action === "reject" ? "<redacted>" : safeDigest(action.package.digest),
    },
    sidecar: {
      id: safeLabel(action.sidecar.id),
      kind: safeSidecarKind(action.sidecar.kind),
    },
    reason,
  };
}

function safeId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]{1,120}$/.test(value) || looksSecret(value)) {
    return "<redacted>";
  }
  return value;
}

function maybeCatalogId(value: unknown): string | undefined {
  const id = safeId(value);
  return id === "<redacted>" ? undefined : id;
}

function readCatalogId(value: unknown): string {
  const id = maybeCatalogId(value);
  if (id === undefined) throw new Error("invalid catalog id");
  return id;
}

function safeSequence(value: unknown): number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= 1_000_000 ? value : 0;
}

function readSequence(value: unknown): number {
  if (Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= 1_000_000) {
    return value;
  }
  throw new Error("invalid sequence");
}

function safeSidecarKind(value: unknown): PluginMcpSidecarKind | "unknown" {
  return typeof value === "string" && SIDECAR_KINDS.has(value as PluginMcpSidecarKind | "unknown")
    ? value as PluginMcpSidecarKind | "unknown"
    : "unknown";
}

function safeLabel(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "<redacted>";
  const clean = value.replace(/[\0\r\n]/g, "");
  return looksSecret(clean) || looksHighEntropy(clean) ? "<redacted>" : clean.slice(0, 120);
}

function safeLabels(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(safeLabel))).sort();
}

function safeSignature(value: unknown): string | undefined {
  return typeof value === "string" && /^mcp-plugin:[a-f0-9]{24}$/i.test(value) ? value : undefined;
}

function trustedAction(
  action: PluginPackagePlanActionRecord,
): { signature: string; definition: NormalizedPluginMcpSidecarDefinition } | undefined {
  const signature = safeSignature(action.signature);
  if (signature === undefined || !isPlainRecord(action.definition)) return undefined;
  try {
    const definition = normalizePluginMcpSidecarDefinition(action.definition);
    return pluginMcpSidecarTrustSignature(definition) === signature ? { signature, definition } : undefined;
  } catch {
    return undefined;
  }
}

function markStagedRecord(record: PluginPackageCatalogCandidateRecord): PluginPackageCatalogCandidateRecord {
  deepFreeze(record);
  STAGED_RECORDS.add(record);
  return record;
}

function markLiveRecord(record: PluginPackageLiveCatalogRecord): PluginPackageLiveCatalogRecord {
  deepFreeze(record);
  LIVE_RECORDS.add(record);
  return record;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  Object.freeze(value);
  for (const entry of Object.values(value)) {
    deepFreeze(entry);
  }
  return value;
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

function looksSecret(value: string): boolean {
  return /(secret|token|password|credential|bearer|api[_-]?key)/i.test(value);
}

function looksHighEntropy(value: string): boolean {
  if (value.length < 32) return false;
  const compact = value.replace(/[-_:./@]/g, "");
  if (compact.length < 32) return false;
  if (/^[A-Fa-f0-9]{32,}$/.test(compact)) return true;
  if (/^[A-Za-z0-9+/=_-]{32,}$/.test(compact)) {
    const unique = new Set(compact).size;
    return unique >= 16;
  }
  return false;
}

function rejectForbiddenDurableFields(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) rejectForbiddenDurableFields(item);
    return;
  }
  if (!isPlainRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (isForbiddenDurableKey(key)) throw new Error("forbidden durable field");
    rejectForbiddenDurableFields(entry);
  }
}

function isForbiddenDurableKey(key: string): boolean {
  return /^(approvalRequest|definition|transport|client|sidecarTransport|installCommand|startSidecar|postinstall|env|cwd|args|command)$/i.test(key);
}

function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid timestamp");
  return date.toISOString();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
