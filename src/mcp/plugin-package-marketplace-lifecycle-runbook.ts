import type {
  PluginPackageMarketplaceLifecycleHandoffActionKind,
  PluginPackageMarketplaceLifecycleHandoffEntry,
  PluginPackageMarketplaceLifecycleHandoffView,
} from "./plugin-package-marketplace-lifecycle-handoff";
import type { PluginPackageMarketplaceLifecycleState } from "./plugin-package-marketplace-lifecycle-status";

export type PluginPackageMarketplaceLifecycleRunbookPhase =
  | "metadata"
  | "install"
  | "activation"
  | "inspection";

export interface PluginPackageMarketplaceLifecycleRunbookRequest {
  lifecycleHandoffView: PluginPackageMarketplaceLifecycleHandoffView;
  audience?: "operator" | "reviewer";
  includeInspectOnly?: boolean;
  maxSteps?: number;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceLifecycleRunbookStep {
  stepId: string;
  phase: PluginPackageMarketplaceLifecycleRunbookPhase;
  entryId: string;
  displayName: string;
  lifecycleState: PluginPackageMarketplaceLifecycleState;
  actionKind: PluginPackageMarketplaceLifecycleHandoffActionKind;
  executionMode: "operator_only";
  requiresExplicitApproval: boolean;
  blockedReason?: string;
  runbookText: string;
  operatorChecklist: string[];
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

export interface PluginPackageMarketplaceLifecycleRunbookView {
  recordType: "mcp_plugin_package_marketplace_lifecycle_runbook_view";
  timestamp: string;
  catalogId: string;
  handoffRecordType: PluginPackageMarketplaceLifecycleHandoffView["recordType"];
  handoffEntryCount: number;
  runbookStepCount: number;
  audience: "operator" | "reviewer";
  steps: PluginPackageMarketplaceLifecycleRunbookStep[];
  summary: {
    total: number;
    metadataSteps: number;
    installSteps: number;
    activationSteps: number;
    inspectionSteps: number;
    approvalRequiredSteps: number;
    inspectOnlySteps: number;
    omittedSteps: number;
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

const RUNBOOK_WARNINGS = [
  "Plugin marketplace lifecycle runbook is a read-only operator checklist derived from lifecycle handoff state.",
  "Lifecycle runbook does not perform registry access, install or update packages, execute package code, activate sidecars, start sidecars, mutate catalogs, or persist credentials.",
  "Runbook steps are generated from bounded action kinds; nested handoff bodies, URLs, warnings, and raw next actions are not copied.",
];

export function createPluginPackageMarketplaceLifecycleRunbook(
  request: PluginPackageMarketplaceLifecycleRunbookRequest,
): PluginPackageMarketplaceLifecycleRunbookView {
  const includeInspectOnly = request.includeInspectOnly ?? true;
  const selected = request.lifecycleHandoffView.entries
    .filter((entry) => includeInspectOnly || entry.requiresExplicitApproval)
    .sort((left, right) => {
      const phaseDelta = phasePriority(phaseForAction(left.actionKind)) - phasePriority(phaseForAction(right.actionKind));
      if (phaseDelta !== 0) return phaseDelta;
      if (left.requiresExplicitApproval !== right.requiresExplicitApproval) {
        return left.requiresExplicitApproval ? -1 : 1;
      }
      return `${left.displayName}:${left.entryId}`.localeCompare(`${right.displayName}:${right.entryId}`);
    });
  const capped = selected.slice(0, safeMaxSteps(request.maxSteps));
  const steps = capped.map((entry, index) => projectStep(entry, index));

  return freezeView({
    recordType: "mcp_plugin_package_marketplace_lifecycle_runbook_view",
    timestamp: toIso(request.timestamp ?? new Date()),
    catalogId: safeId(request.lifecycleHandoffView.catalogId),
    handoffRecordType: request.lifecycleHandoffView.recordType,
    handoffEntryCount: request.lifecycleHandoffView.handoffEntryCount,
    runbookStepCount: steps.length,
    audience: request.audience === "reviewer" ? "reviewer" : "operator",
    steps,
    summary: summarizeSteps(steps, selected.length - steps.length),
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    warnings: [...RUNBOOK_WARNINGS],
  });
}

function projectStep(
  entry: PluginPackageMarketplaceLifecycleHandoffEntry,
  index: number,
): PluginPackageMarketplaceLifecycleRunbookStep {
  const phase = phaseForAction(entry.actionKind);
  return {
    stepId: `${String(index + 1).padStart(3, "0")}-${safeId(entry.entryId)}`,
    phase,
    entryId: safeId(entry.entryId),
    displayName: safeLabel(entry.displayName),
    lifecycleState: entry.lifecycleState,
    actionKind: entry.actionKind,
    executionMode: "operator_only",
    requiresExplicitApproval: entry.requiresExplicitApproval,
    ...(entry.blockedReason === undefined ? {} : { blockedReason: safeReason(entry.blockedReason) }),
    runbookText: runbookTextForAction(entry.actionKind),
    operatorChecklist: entry.operatorChecklist.map(safeChecklistText).filter((item) => item !== "<redacted>"),
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
  };
}

function phaseForAction(
  actionKind: PluginPackageMarketplaceLifecycleHandoffActionKind,
): PluginPackageMarketplaceLifecycleRunbookPhase {
  switch (actionKind) {
    case "collect_registry_metadata_evidence":
    case "resolve_metadata_gate":
    case "inspect_metadata_failure":
      return "metadata";
    case "prepare_metadata_bound_install_update_handoff":
    case "inspect_install_receipt":
      return "install";
    case "collect_activation_readiness":
    case "prepare_metadata_bound_activation_handoff":
    case "inspect_activation_receipt":
      return "activation";
    case "inspect_sidecar_status":
      return "inspection";
  }
}

function runbookTextForAction(actionKind: PluginPackageMarketplaceLifecycleHandoffActionKind): string {
  switch (actionKind) {
    case "collect_registry_metadata_evidence":
      return "Collect approved registry metadata evidence before any install or activation step.";
    case "resolve_metadata_gate":
      return "Resolve the metadata gate before preparing downstream handoffs.";
    case "inspect_metadata_failure":
      return "Inspect metadata failure evidence and retry only through a fresh approved handoff.";
    case "prepare_metadata_bound_install_update_handoff":
      return "Prepare a metadata-bound install/update handoff for explicit operator approval.";
    case "inspect_install_receipt":
      return "Inspect the install/update receipt before retrying or advancing activation readiness.";
    case "collect_activation_readiness":
      return "Collect activation readiness evidence after install/update receipt review.";
    case "prepare_metadata_bound_activation_handoff":
      return "Prepare a metadata-bound activation handoff for explicit operator approval.";
    case "inspect_activation_receipt":
      return "Inspect the activation receipt before retrying or marking the sidecar active.";
    case "inspect_sidecar_status":
      return "Inspect sidecar status through existing supervisor status surfaces.";
  }
}

function summarizeSteps(
  steps: PluginPackageMarketplaceLifecycleRunbookStep[],
  omittedSteps: number,
): PluginPackageMarketplaceLifecycleRunbookView["summary"] {
  return {
    total: steps.length,
    metadataSteps: countPhase(steps, "metadata"),
    installSteps: countPhase(steps, "install"),
    activationSteps: countPhase(steps, "activation"),
    inspectionSteps: countPhase(steps, "inspection"),
    approvalRequiredSteps: steps.filter((step) => step.requiresExplicitApproval).length,
    inspectOnlySteps: steps.filter((step) => !step.requiresExplicitApproval).length,
    omittedSteps: Math.max(0, omittedSteps),
  };
}

function countPhase(
  steps: PluginPackageMarketplaceLifecycleRunbookStep[],
  phase: PluginPackageMarketplaceLifecycleRunbookPhase,
): number {
  return steps.filter((step) => step.phase === phase).length;
}

function phasePriority(phase: PluginPackageMarketplaceLifecycleRunbookPhase): number {
  switch (phase) {
    case "metadata":
      return 10;
    case "install":
      return 20;
    case "activation":
      return 30;
    case "inspection":
      return 40;
  }
}

function safeMaxSteps(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return Number.MAX_SAFE_INTEGER;
  return Math.min(value, 1000);
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

function safeChecklistText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "<redacted>";
  const clean = value.replace(/[\0\r\n]/g, " ").trim();
  return looksSecret(clean) || clean.includes("://") ? "<redacted>" : clean.slice(0, 180);
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
  view: PluginPackageMarketplaceLifecycleRunbookView,
): PluginPackageMarketplaceLifecycleRunbookView {
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
