import type {
  PluginPackageMarketplaceLifecycleState,
  PluginPackageMarketplaceLifecycleStatusEntry,
  PluginPackageMarketplaceLifecycleStatusView,
} from "./plugin-package-marketplace-lifecycle-status";

export type PluginPackageMarketplaceLifecycleHandoffActionKind =
  | "collect_registry_metadata_evidence"
  | "resolve_metadata_gate"
  | "inspect_metadata_failure"
  | "prepare_metadata_bound_install_update_handoff"
  | "inspect_install_receipt"
  | "collect_activation_readiness"
  | "prepare_metadata_bound_activation_handoff"
  | "inspect_activation_receipt"
  | "inspect_sidecar_status";

export interface PluginPackageMarketplaceLifecycleHandoffRequest {
  lifecycleStatusView: PluginPackageMarketplaceLifecycleStatusView;
  operatorIntent?: string;
  includeStates?: PluginPackageMarketplaceLifecycleState[];
  maxEntries?: number;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceLifecycleHandoffEntry {
  entryId: string;
  displayName: string;
  lifecycleState: PluginPackageMarketplaceLifecycleState;
  actionKind: PluginPackageMarketplaceLifecycleHandoffActionKind;
  executionMode: "operator_only";
  requiresExplicitApproval: boolean;
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
  sourceStages: {
    metadata: {
      present: boolean;
      state: string;
      ready: boolean;
    };
    install: {
      present: boolean;
      state: string;
      completed: boolean;
    };
    activationReadiness: {
      present: boolean;
      state: string;
      ready: boolean;
    };
    activationExecution: {
      present: boolean;
      state: string;
      receiptPresent: boolean;
    };
  };
  operatorChecklist: string[];
}

export interface PluginPackageMarketplaceLifecycleHandoffView {
  recordType: "mcp_plugin_package_marketplace_lifecycle_handoff_view";
  timestamp: string;
  catalogId: string;
  lifecycleRecordType: PluginPackageMarketplaceLifecycleStatusView["recordType"];
  lifecycleEntryCount: number;
  handoffEntryCount: number;
  operatorIntent: string;
  entries: PluginPackageMarketplaceLifecycleHandoffEntry[];
  summary: {
    total: number;
    approvalRequired: number;
    inspectOnly: number;
    metadataActions: number;
    installActions: number;
    activationActions: number;
    blockedOrFailed: number;
    omittedEntries: number;
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

const HANDOFF_WARNINGS = [
  "Plugin marketplace lifecycle handoff is a read-only operator plan derived from lifecycle status.",
  "Lifecycle handoff does not perform registry access, install or update packages, execute package code, activate sidecars, start sidecars, mutate catalogs, or persist credentials.",
  "Operator checklist text is generated from bounded lifecycle states; nested lifecycle next actions, URLs, and warnings are not copied.",
];

export function createPluginPackageMarketplaceLifecycleHandoff(
  request: PluginPackageMarketplaceLifecycleHandoffRequest,
): PluginPackageMarketplaceLifecycleHandoffView {
  const selectedEntries = selectEntries(
    request.lifecycleStatusView.entries,
    request.includeStates,
  );
  const cappedEntries = selectedEntries.slice(0, safeMaxEntries(request.maxEntries));
  const handoffEntries = cappedEntries.map(projectHandoffEntry);

  return freezeView({
    recordType: "mcp_plugin_package_marketplace_lifecycle_handoff_view",
    timestamp: toIso(request.timestamp ?? new Date()),
    catalogId: safeId(request.lifecycleStatusView.catalogId),
    lifecycleRecordType: request.lifecycleStatusView.recordType,
    lifecycleEntryCount: request.lifecycleStatusView.entryCount,
    handoffEntryCount: handoffEntries.length,
    operatorIntent: safeIntent(request.operatorIntent),
    entries: handoffEntries,
    summary: summarizeEntries(handoffEntries, selectedEntries.length - handoffEntries.length),
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    warnings: [...HANDOFF_WARNINGS],
  });
}

function selectEntries(
  entries: PluginPackageMarketplaceLifecycleStatusEntry[],
  includeStates: PluginPackageMarketplaceLifecycleState[] | undefined,
): PluginPackageMarketplaceLifecycleStatusEntry[] {
  const included = includeStates === undefined ? undefined : new Set(includeStates);
  return entries
    .filter((entry) => included === undefined || included.has(entry.state))
    .sort((left, right) => {
      const priorityDelta = statePriority(left.state) - statePriority(right.state);
      if (priorityDelta !== 0) return priorityDelta;
      return `${left.displayName}:${left.entryId}`.localeCompare(`${right.displayName}:${right.entryId}`);
    });
}

function projectHandoffEntry(
  entry: PluginPackageMarketplaceLifecycleStatusEntry,
): PluginPackageMarketplaceLifecycleHandoffEntry {
  const action = actionForState(entry.state);
  return {
    entryId: safeId(entry.entryId),
    displayName: safeLabel(entry.displayName),
    lifecycleState: entry.state,
    actionKind: action.kind,
    executionMode: "operator_only",
    requiresExplicitApproval: action.requiresExplicitApproval,
    ...(entry.blockedReason === undefined ? {} : { blockedReason: safeReason(entry.blockedReason) }),
    package: {
      name: safeLabel(entry.package.name),
      version: safeLabel(entry.package.version),
      source: "<redacted>",
      digest: safeDigest(entry.package.digest),
    },
    sidecar: {
      id: safeLabel(entry.sidecar.id),
      kind: safeLabel(entry.sidecar.kind),
    },
    sourceStages: {
      metadata: {
        present: entry.stages.metadata.present,
        state: safeLabel(entry.stages.metadata.state),
        ready: entry.stages.metadata.ready,
      },
      install: {
        present: entry.stages.install.present,
        state: safeLabel(entry.stages.install.state),
        completed: entry.stages.install.completed,
      },
      activationReadiness: {
        present: entry.stages.activationReadiness.present,
        state: safeLabel(entry.stages.activationReadiness.state),
        ready: entry.stages.activationReadiness.ready,
      },
      activationExecution: {
        present: entry.stages.activationExecution.present,
        state: safeLabel(entry.stages.activationExecution.state),
        receiptPresent: entry.stages.activationExecution.receiptPresent,
      },
    },
    operatorChecklist: checklistForAction(action.kind),
  };
}

function actionForState(state: PluginPackageMarketplaceLifecycleState): {
  kind: PluginPackageMarketplaceLifecycleHandoffActionKind;
  requiresExplicitApproval: boolean;
} {
  switch (state) {
    case "metadata_pending":
      return { kind: "collect_registry_metadata_evidence", requiresExplicitApproval: true };
    case "metadata_blocked":
      return { kind: "resolve_metadata_gate", requiresExplicitApproval: true };
    case "metadata_failed":
      return { kind: "inspect_metadata_failure", requiresExplicitApproval: false };
    case "install_not_executed":
      return { kind: "prepare_metadata_bound_install_update_handoff", requiresExplicitApproval: true };
    case "install_blocked":
    case "install_failed":
      return { kind: "inspect_install_receipt", requiresExplicitApproval: false };
    case "activation_not_ready":
      return { kind: "collect_activation_readiness", requiresExplicitApproval: true };
    case "activation_not_executed":
      return { kind: "prepare_metadata_bound_activation_handoff", requiresExplicitApproval: true };
    case "activation_blocked":
    case "activation_failed":
      return { kind: "inspect_activation_receipt", requiresExplicitApproval: false };
    case "completed":
    case "active":
      return { kind: "inspect_sidecar_status", requiresExplicitApproval: false };
  }
}

function checklistForAction(kind: PluginPackageMarketplaceLifecycleHandoffActionKind): string[] {
  switch (kind) {
    case "collect_registry_metadata_evidence":
      return [
        "Review the registry-fetch handoff request and approval scope.",
        "Collect bounded registry metadata evidence through an explicit host-approved path.",
      ];
    case "resolve_metadata_gate":
      return [
        "Inspect the metadata gate reason before requesting any install or activation handoff.",
        "Refresh approval only after the gate reason is understood.",
      ];
    case "inspect_metadata_failure":
      return [
        "Inspect the failed metadata receipt.",
        "Retry metadata collection only through a fresh approved handoff.",
      ];
    case "prepare_metadata_bound_install_update_handoff":
      return [
        "Review metadata-bound install/update handoff inputs.",
        "Request explicit operator approval before any package install or update.",
      ];
    case "inspect_install_receipt":
      return [
        "Inspect the install/update receipt and metadata gate state.",
        "Prepare a retry only after approval remains valid.",
      ];
    case "collect_activation_readiness":
      return [
        "Inspect install receipt and activation approval evidence.",
        "Collect readiness evidence before preparing activation handoff.",
      ];
    case "prepare_metadata_bound_activation_handoff":
      return [
        "Review activation handoff inputs and matching install receipt.",
        "Request explicit operator approval before activation execution.",
      ];
    case "inspect_activation_receipt":
      return [
        "Inspect the activation receipt and supervisor state.",
        "Retry activation only after approval remains valid.",
      ];
    case "inspect_sidecar_status":
      return [
        "Inspect sidecar status through the supervisor.",
        "Do not perform activation from the lifecycle handoff view.",
      ];
  }
}

function summarizeEntries(
  entries: PluginPackageMarketplaceLifecycleHandoffEntry[],
  omittedEntries: number,
): PluginPackageMarketplaceLifecycleHandoffView["summary"] {
  return {
    total: entries.length,
    approvalRequired: entries.filter((entry) => entry.requiresExplicitApproval).length,
    inspectOnly: entries.filter((entry) => !entry.requiresExplicitApproval).length,
    metadataActions: entries.filter((entry) => entry.actionKind.includes("metadata") || entry.actionKind.includes("registry")).length,
    installActions: entries.filter((entry) => entry.actionKind.includes("install")).length,
    activationActions: entries.filter((entry) => entry.actionKind.includes("activation")).length,
    blockedOrFailed: entries.filter((entry) => entry.lifecycleState.includes("blocked") || entry.lifecycleState.includes("failed")).length,
    omittedEntries: Math.max(0, omittedEntries),
  };
}

function statePriority(state: PluginPackageMarketplaceLifecycleState): number {
  switch (state) {
    case "metadata_blocked":
    case "metadata_failed":
    case "install_blocked":
    case "install_failed":
    case "activation_blocked":
    case "activation_failed":
      return 0;
    case "metadata_pending":
      return 10;
    case "install_not_executed":
      return 20;
    case "activation_not_ready":
      return 30;
    case "activation_not_executed":
      return 40;
    case "completed":
    case "active":
      return 50;
  }
}

function safeMaxEntries(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return Number.MAX_SAFE_INTEGER;
  return Math.min(value, 1000);
}

function safeIntent(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || looksSecret(value)) {
    return "inspect_marketplace_lifecycle";
  }
  return value.replace(/[\0\r\n]/g, "").slice(0, 120);
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
  view: PluginPackageMarketplaceLifecycleHandoffView,
): PluginPackageMarketplaceLifecycleHandoffView {
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
