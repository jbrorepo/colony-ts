export type PluginPackageMarketplaceLifecycleState =
  | "metadata_pending"
  | "metadata_blocked"
  | "metadata_failed"
  | "install_not_executed"
  | "install_blocked"
  | "install_failed"
  | "activation_not_ready"
  | "activation_not_executed"
  | "activation_blocked"
  | "activation_failed"
  | "completed"
  | "active";

export interface PluginPackageMarketplaceLifecycleStatusRequest {
  catalogId: string;
  metadataPlanningView?: unknown;
  installStatusView?: unknown;
  activationReadinessView?: unknown;
  activationExecutionStatusView?: unknown;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceLifecycleStatusEntry {
  entryId: string;
  displayName: string;
  state: PluginPackageMarketplaceLifecycleState;
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
  stages: {
    metadata: {
      present: boolean;
      state: string;
      ready: boolean;
      blockedReason?: string;
    };
    install: {
      present: boolean;
      state: string;
      completed: boolean;
      blockedReason?: string;
    };
    activationReadiness: {
      present: boolean;
      state: string;
      ready: boolean;
      blockedReason?: string;
    };
    activationExecution: {
      present: boolean;
      state: string;
      receiptPresent: boolean;
      blockedReason?: string;
    };
  };
  nextActions: string[];
}

export interface PluginPackageMarketplaceLifecycleStatusView {
  recordType: "mcp_plugin_package_marketplace_lifecycle_status_view";
  timestamp: string;
  catalogId: string;
  entryCount: number;
  metadataPlanningEntryCount: number;
  installStatusEntryCount: number;
  activationReadinessEntryCount: number;
  activationExecutionEntryCount: number;
  entries: PluginPackageMarketplaceLifecycleStatusEntry[];
  summary: {
    total: number;
    metadataPending: number;
    metadataBlocked: number;
    metadataFailed: number;
    installNotExecuted: number;
    installBlocked: number;
    installFailed: number;
    activationNotReady: number;
    activationNotExecuted: number;
    activationBlocked: number;
    activationFailed: number;
    completed: number;
    active: number;
  };
  networkFetched: false;
  packageInstalled: false;
  packageExecuted: false;
  activation: false;
  sidecarStarted: false;
  catalogMutated: false;
  credentialsPersisted: false;
  warnings: string[];
}

interface StageRecord {
  entryId: string;
  displayName: string;
  state: string;
  blockedReason?: string;
  receiptPresent?: boolean;
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
}

interface LifecycleAccumulator {
  metadata?: StageRecord;
  install?: StageRecord;
  readiness?: StageRecord;
  execution?: StageRecord;
}

const LIFECYCLE_WARNINGS = [
  "Plugin marketplace lifecycle status is a read-only projection over marketplace metadata planning, metadata-bound install/update status, activation readiness, and activation execution status.",
  "Lifecycle status is for operator inspection only; it does not perform registry access, install or update packages, execute package code, activate sidecars, start sidecars, mutate catalogs, or persist credentials.",
  "Nested stage warnings, URLs, and raw next actions are not copied into the lifecycle board.",
];

export function createPluginPackageMarketplaceLifecycleStatus(
  request: PluginPackageMarketplaceLifecycleStatusRequest,
): PluginPackageMarketplaceLifecycleStatusView {
  const entries = new Map<string, LifecycleAccumulator>();
  mergeStage(entries, "metadata", viewEntries(request.metadataPlanningView));
  mergeStage(entries, "install", viewEntries(request.installStatusView));
  mergeStage(entries, "readiness", viewEntries(request.activationReadinessView));
  mergeStage(entries, "execution", viewEntries(request.activationExecutionStatusView));

  const projected = Array.from(entries.entries())
    .map(([entryId, accumulator]) => projectEntry(entryId, accumulator))
    .sort((left, right) => `${left.displayName}:${left.entryId}`.localeCompare(`${right.displayName}:${right.entryId}`));

  return freezeView({
    recordType: "mcp_plugin_package_marketplace_lifecycle_status_view",
    timestamp: toIso(request.timestamp ?? new Date()),
    catalogId: safeId(request.catalogId),
    entryCount: projected.length,
    metadataPlanningEntryCount: viewEntries(request.metadataPlanningView).length,
    installStatusEntryCount: viewEntries(request.installStatusView).length,
    activationReadinessEntryCount: viewEntries(request.activationReadinessView).length,
    activationExecutionEntryCount: viewEntries(request.activationExecutionStatusView).length,
    entries: projected,
    summary: summarizeEntries(projected),
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    warnings: [...LIFECYCLE_WARNINGS],
  });
}

function mergeStage(
  entries: Map<string, LifecycleAccumulator>,
  stage: "metadata" | "install" | "readiness" | "execution",
  sourceEntries: unknown[],
): void {
  for (const sourceEntry of sourceEntries) {
    const record = sanitizeStageRecord(sourceEntry);
    if (record.entryId === "<redacted>") continue;
    const existing = entries.get(record.entryId) ?? {};
    existing[stage] = record;
    entries.set(record.entryId, existing);
  }
}

function projectEntry(
  entryId: string,
  accumulator: LifecycleAccumulator,
): PluginPackageMarketplaceLifecycleStatusEntry {
  const source = accumulator.execution ?? accumulator.readiness ?? accumulator.install ?? accumulator.metadata;
  const state = lifecycleState(accumulator);
  const blockedReason = lifecycleBlockedReason(state, accumulator);
  const stages = {
    metadata: {
      present: accumulator.metadata !== undefined,
      state: accumulator.metadata?.state ?? "<missing>",
      ready: accumulator.metadata?.state === "metadata_ready",
      ...(accumulator.metadata?.blockedReason === undefined ? {} : { blockedReason: accumulator.metadata.blockedReason }),
    },
    install: {
      present: accumulator.install !== undefined,
      state: accumulator.install?.state ?? "<missing>",
      completed: accumulator.install?.state === "completed",
      ...(accumulator.install?.blockedReason === undefined ? {} : { blockedReason: accumulator.install.blockedReason }),
    },
    activationReadiness: {
      present: accumulator.readiness !== undefined,
      state: accumulator.readiness?.state ?? "<missing>",
      ready: accumulator.readiness?.state === "ready_for_activation_handoff" || accumulator.readiness?.state === "active",
      ...(accumulator.readiness?.blockedReason === undefined ? {} : { blockedReason: accumulator.readiness.blockedReason }),
    },
    activationExecution: {
      present: accumulator.execution !== undefined,
      state: accumulator.execution?.state ?? "<missing>",
      receiptPresent: accumulator.execution?.receiptPresent === true,
      ...(accumulator.execution?.blockedReason === undefined ? {} : { blockedReason: accumulator.execution.blockedReason }),
    },
  };

  return {
    entryId,
    displayName: source?.displayName ?? entryId,
    state,
    ...(blockedReason === undefined ? {} : { blockedReason }),
    package: source?.package ?? redactedPackage(),
    sidecar: source?.sidecar ?? redactedSidecar(),
    stages,
    nextActions: nextActions(state),
  };
}

function lifecycleState(accumulator: LifecycleAccumulator): PluginPackageMarketplaceLifecycleState {
  const executionState = accumulator.execution?.state;
  if (executionState === "active") return "active";
  if (executionState === "completed") return "completed";
  if (executionState === "failed") return "activation_failed";
  if (executionState === "blocked") return "activation_blocked";
  if (executionState === "metadata_blocked") return "metadata_blocked";
  if (executionState === "activation_not_ready") return "activation_not_ready";
  if (executionState === "not_executed") return "activation_not_executed";

  const readinessState = accumulator.readiness?.state;
  if (readinessState === "active") return "active";
  if (readinessState === "ready_for_activation_handoff") return "activation_not_executed";
  if (readinessState === "needs_activation_approval") return "activation_not_ready";
  if (readinessState === "metadata_blocked") return "metadata_blocked";
  if (readinessState === "install_not_executed") return "install_not_executed";
  if (readinessState === "install_blocked") return "install_blocked";
  if (readinessState === "install_failed") return "install_failed";

  const installState = accumulator.install?.state;
  if (installState === "completed") return "activation_not_ready";
  if (installState === "failed") return "install_failed";
  if (installState === "blocked") return "install_blocked";
  if (installState === "metadata_blocked") return "metadata_blocked";
  if (installState === "not_executed") return "install_not_executed";

  const metadataState = accumulator.metadata?.state;
  if (metadataState === "metadata_ready") return "install_not_executed";
  if (metadataState === "metadata_failed") return "metadata_failed";
  if (metadataState === "metadata_blocked" || metadataState === "metadata_rejected") return "metadata_blocked";
  return "metadata_pending";
}

function lifecycleBlockedReason(
  state: PluginPackageMarketplaceLifecycleState,
  accumulator: LifecycleAccumulator,
): string | undefined {
  if (state === "metadata_blocked") return firstReason(accumulator.metadata, accumulator.install, accumulator.readiness, accumulator.execution);
  if (state === "metadata_failed") return firstReason(accumulator.metadata, accumulator.install, accumulator.readiness, accumulator.execution);
  if (state === "install_blocked" || state === "install_failed") {
    return firstReason(accumulator.install, accumulator.metadata, accumulator.readiness, accumulator.execution);
  }
  if (state === "activation_not_ready" || state === "activation_blocked" || state === "activation_failed") {
    return firstReason(accumulator.execution, accumulator.readiness, accumulator.install, accumulator.metadata);
  }
  return undefined;
}

function firstReason(...records: Array<StageRecord | undefined>): string | undefined {
  for (const record of records) {
    if (record?.blockedReason !== undefined) return record.blockedReason;
  }
  return undefined;
}

function nextActions(state: PluginPackageMarketplaceLifecycleState): string[] {
  switch (state) {
    case "metadata_pending":
      return ["Provide completed marketplace registry metadata planning evidence before install/update handoff."];
    case "metadata_blocked":
      return ["Resolve the marketplace metadata gate before install/update or activation can proceed."];
    case "metadata_failed":
      return ["Inspect the failed metadata evidence and retry only through a fresh approved host handoff."];
    case "install_not_executed":
      return ["Run an approved metadata-bound install/update handoff before activation readiness can be inspected."];
    case "install_blocked":
      return ["Inspect the blocked metadata-bound install/update status before retrying the handoff."];
    case "install_failed":
      return ["Inspect the failed metadata-bound install/update receipt before activation readiness is considered."];
    case "activation_not_ready":
      return ["Collect activation readiness and approval evidence before activation handoff execution."];
    case "activation_not_executed":
      return ["Run an approved metadata-bound activation handoff before execution status can complete."];
    case "activation_blocked":
      return ["Inspect the blocked metadata-bound activation receipt before retrying the operator handoff."];
    case "activation_failed":
      return ["Inspect the failed metadata-bound activation receipt and retry only after approval remains valid."];
    case "completed":
      return ["Inspect running sidecar state through supervisor status; no activation is performed by this lifecycle view."];
    case "active":
      return ["Inspect running sidecar state through supervisor status; no activation is performed by this lifecycle view."];
  }
}

function sanitizeStageRecord(value: unknown): StageRecord {
  const record = isPlainRecord(value) ? value : {};
  const packageRecord = isPlainRecord(record.package) ? record.package : {};
  const sidecarRecord = isPlainRecord(record.sidecar) ? record.sidecar : {};
  const receiptRecord = isPlainRecord(record.receipt) ? record.receipt : {};
  const blockedReason = safeReason(record.blockedReason);

  return {
    entryId: safeId(record.entryId),
    displayName: safeLabel(record.displayName),
    state: safeLabel(record.state),
    ...(blockedReason === "<redacted>" ? {} : { blockedReason }),
    receiptPresent: receiptRecord.present === true,
    package: {
      name: safeLabel(packageRecord.name),
      version: safeLabel(packageRecord.version),
      source: "<redacted>",
      digest: safeDigest(packageRecord.digest),
    },
    sidecar: {
      id: safeLabel(sidecarRecord.id),
      kind: safeLabel(sidecarRecord.kind),
    },
  };
}

function viewEntries(view: unknown): unknown[] {
  if (!isPlainRecord(view) || !Array.isArray(view.entries)) return [];
  return view.entries;
}

function summarizeEntries(
  entries: PluginPackageMarketplaceLifecycleStatusEntry[],
): PluginPackageMarketplaceLifecycleStatusView["summary"] {
  return {
    total: entries.length,
    metadataPending: countState(entries, "metadata_pending"),
    metadataBlocked: countState(entries, "metadata_blocked"),
    metadataFailed: countState(entries, "metadata_failed"),
    installNotExecuted: countState(entries, "install_not_executed"),
    installBlocked: countState(entries, "install_blocked"),
    installFailed: countState(entries, "install_failed"),
    activationNotReady: countState(entries, "activation_not_ready"),
    activationNotExecuted: countState(entries, "activation_not_executed"),
    activationBlocked: countState(entries, "activation_blocked"),
    activationFailed: countState(entries, "activation_failed"),
    completed: countState(entries, "completed"),
    active: countState(entries, "active"),
  };
}

function countState(
  entries: PluginPackageMarketplaceLifecycleStatusEntry[],
  state: PluginPackageMarketplaceLifecycleState,
): number {
  return entries.filter((entry) => entry.state === state).length;
}

function redactedPackage(): PluginPackageMarketplaceLifecycleStatusEntry["package"] {
  return {
    name: "<redacted>",
    version: "<redacted>",
    source: "<redacted>",
    digest: "<redacted>",
  };
}

function redactedSidecar(): PluginPackageMarketplaceLifecycleStatusEntry["sidecar"] {
  return {
    id: "<redacted>",
    kind: "<redacted>",
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

function safeReason(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9_:-]{1,80}$/i.test(value) && !looksSecret(value) ? value : "<redacted>";
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
  view: PluginPackageMarketplaceLifecycleStatusView,
): PluginPackageMarketplaceLifecycleStatusView {
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
