import type { PluginPackageMarketplaceLifecycleHandoffActionKind } from "./plugin-package-marketplace-lifecycle-handoff";
import type {
  PluginPackageMarketplaceLifecycleRunbookPhase,
  PluginPackageMarketplaceLifecycleRunbookStep,
  PluginPackageMarketplaceLifecycleRunbookView,
} from "./plugin-package-marketplace-lifecycle-runbook";
import type { PluginPackageMarketplaceLifecycleState } from "./plugin-package-marketplace-lifecycle-status";

export interface PluginPackageMarketplaceLifecycleApprovalPacketsRequest {
  lifecycleRunbookView: PluginPackageMarketplaceLifecycleRunbookView;
  audience?: "operator" | "reviewer";
  includePhases?: PluginPackageMarketplaceLifecycleRunbookPhase[];
  maxPackets?: number;
  timestamp?: string | Date;
}

export type PluginPackageMarketplaceLifecycleApprovalSubject =
  | "plugin-marketplace:metadata"
  | "plugin-marketplace:install-update"
  | "plugin-marketplace:activation-readiness"
  | "plugin-marketplace:activation"
  | "plugin-marketplace:inspection";

export interface PluginPackageMarketplaceLifecycleApprovalPacket {
  packetId: string;
  stepId: string;
  phase: PluginPackageMarketplaceLifecycleRunbookPhase;
  entryId: string;
  displayName: string;
  lifecycleState: PluginPackageMarketplaceLifecycleState;
  actionKind: PluginPackageMarketplaceLifecycleHandoffActionKind;
  executionMode: "operator_only";
  approvalRequired: true;
  approvalSubject: PluginPackageMarketplaceLifecycleApprovalSubject;
  approvalPrompt: string;
  approvalChecklist: string[];
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

export interface PluginPackageMarketplaceLifecycleApprovalPacketsView {
  recordType: "mcp_plugin_package_marketplace_lifecycle_approval_packets_view";
  timestamp: string;
  catalogId: string;
  runbookRecordType: PluginPackageMarketplaceLifecycleRunbookView["recordType"];
  runbookStepCount: number;
  packetCount: number;
  audience: "operator" | "reviewer";
  packets: PluginPackageMarketplaceLifecycleApprovalPacket[];
  summary: {
    total: number;
    metadataPackets: number;
    installPackets: number;
    activationPackets: number;
    inspectionPackets: number;
    omittedApprovalPackets: number;
    omittedInspectOnlySteps: number;
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

const APPROVAL_PACKET_WARNINGS = [
  "Plugin marketplace lifecycle approval packets are read-only operator/reviewer approval prompts derived from lifecycle runbook state.",
  "Approval packets do not perform registry access, install or update packages, execute package code, activate sidecars, start sidecars, mutate catalogs, or persist credentials.",
  "Approval packet text is generated from bounded action kinds; raw registry URLs, nested handoff bodies, warnings, and next actions are not copied.",
];

export function createPluginPackageMarketplaceLifecycleApprovalPackets(
  request: PluginPackageMarketplaceLifecycleApprovalPacketsRequest,
): PluginPackageMarketplaceLifecycleApprovalPacketsView {
  const includedPhases = normalizeIncludedPhases(request.includePhases);
  const phaseScopedSteps = request.lifecycleRunbookView.steps.filter((step) => includedPhases.has(step.phase));
  const approvalSteps = phaseScopedSteps
    .filter((step) => step.requiresExplicitApproval)
    .sort((left, right) => {
      const phaseDelta = phasePriority(left.phase) - phasePriority(right.phase);
      if (phaseDelta !== 0) return phaseDelta;
      const actionDelta = actionPriority(left.actionKind) - actionPriority(right.actionKind);
      if (actionDelta !== 0) return actionDelta;
      return `${left.displayName}:${left.stepId}`.localeCompare(`${right.displayName}:${right.stepId}`);
    });
  const cappedApprovalSteps = approvalSteps.slice(0, safeMaxPackets(request.maxPackets));
  const packets = cappedApprovalSteps.map(projectApprovalPacket);

  return freezeView({
    recordType: "mcp_plugin_package_marketplace_lifecycle_approval_packets_view",
    timestamp: toIso(request.timestamp ?? new Date()),
    catalogId: safeId(request.lifecycleRunbookView.catalogId),
    runbookRecordType: request.lifecycleRunbookView.recordType,
    runbookStepCount: request.lifecycleRunbookView.runbookStepCount,
    packetCount: packets.length,
    audience: request.audience === "reviewer" ? "reviewer" : "operator",
    packets,
    summary: summarizePackets(
      packets,
      approvalSteps.length - cappedApprovalSteps.length,
      phaseScopedSteps.filter((step) => !step.requiresExplicitApproval).length,
    ),
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    warnings: [...APPROVAL_PACKET_WARNINGS],
  });
}

function projectApprovalPacket(
  step: PluginPackageMarketplaceLifecycleRunbookStep,
): PluginPackageMarketplaceLifecycleApprovalPacket {
  return {
    packetId: `approval-${safeId(step.stepId)}`,
    stepId: safeId(step.stepId),
    phase: step.phase,
    entryId: safeId(step.entryId),
    displayName: safeLabel(step.displayName),
    lifecycleState: step.lifecycleState,
    actionKind: step.actionKind,
    executionMode: "operator_only",
    approvalRequired: true,
    approvalSubject: approvalSubjectForAction(step.actionKind),
    approvalPrompt: approvalPromptForAction(step.actionKind),
    approvalChecklist: step.operatorChecklist
      .map(safeChecklistText)
      .filter((item) => item !== "<redacted>")
      .slice(0, 8),
    package: {
      name: safeLabel(step.package.name),
      version: safeLabel(step.package.version),
      source: "<redacted>",
      digest: safeDigest(step.package.digest),
    },
    sidecar: {
      id: safeLabel(step.sidecar.id),
      kind: safeLabel(step.sidecar.kind),
    },
  };
}

function approvalSubjectForAction(
  actionKind: PluginPackageMarketplaceLifecycleHandoffActionKind,
): PluginPackageMarketplaceLifecycleApprovalSubject {
  switch (actionKind) {
    case "collect_registry_metadata_evidence":
    case "resolve_metadata_gate":
      return "plugin-marketplace:metadata";
    case "prepare_metadata_bound_install_update_handoff":
      return "plugin-marketplace:install-update";
    case "collect_activation_readiness":
      return "plugin-marketplace:activation-readiness";
    case "prepare_metadata_bound_activation_handoff":
      return "plugin-marketplace:activation";
    case "inspect_metadata_failure":
    case "inspect_install_receipt":
    case "inspect_activation_receipt":
    case "inspect_sidecar_status":
      return "plugin-marketplace:inspection";
  }
}

function approvalPromptForAction(actionKind: PluginPackageMarketplaceLifecycleHandoffActionKind): string {
  switch (actionKind) {
    case "collect_registry_metadata_evidence":
      return "Approve bounded registry metadata evidence collection before downstream marketplace lifecycle work.";
    case "resolve_metadata_gate":
      return "Approve metadata gate resolution before any install/update or activation handoff is prepared.";
    case "prepare_metadata_bound_install_update_handoff":
      return "Approve preparation of a metadata-bound install/update handoff; this packet itself executes no package code.";
    case "collect_activation_readiness":
      return "Approve activation readiness evidence collection after install/update receipt review.";
    case "prepare_metadata_bound_activation_handoff":
      return "Approve preparation of a metadata-bound activation handoff; this packet itself performs no activation.";
    case "inspect_metadata_failure":
      return "Review metadata failure evidence before requesting any fresh approval.";
    case "inspect_install_receipt":
      return "Review install/update receipt evidence before requesting any fresh approval.";
    case "inspect_activation_receipt":
      return "Review activation receipt evidence before requesting any fresh approval.";
    case "inspect_sidecar_status":
      return "Review sidecar status evidence without starting or activating the sidecar.";
  }
}

function summarizePackets(
  packets: PluginPackageMarketplaceLifecycleApprovalPacket[],
  omittedApprovalPackets: number,
  omittedInspectOnlySteps: number,
): PluginPackageMarketplaceLifecycleApprovalPacketsView["summary"] {
  return {
    total: packets.length,
    metadataPackets: countPhase(packets, "metadata"),
    installPackets: countPhase(packets, "install"),
    activationPackets: countPhase(packets, "activation"),
    inspectionPackets: countPhase(packets, "inspection"),
    omittedApprovalPackets: Math.max(0, omittedApprovalPackets),
    omittedInspectOnlySteps: Math.max(0, omittedInspectOnlySteps),
  };
}

function countPhase(
  packets: PluginPackageMarketplaceLifecycleApprovalPacket[],
  phase: PluginPackageMarketplaceLifecycleRunbookPhase,
): number {
  return packets.filter((packet) => packet.phase === phase).length;
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

function actionPriority(actionKind: PluginPackageMarketplaceLifecycleHandoffActionKind): number {
  switch (actionKind) {
    case "collect_registry_metadata_evidence":
      return 10;
    case "resolve_metadata_gate":
      return 20;
    case "prepare_metadata_bound_install_update_handoff":
      return 30;
    case "collect_activation_readiness":
      return 40;
    case "prepare_metadata_bound_activation_handoff":
      return 50;
    case "inspect_metadata_failure":
    case "inspect_install_receipt":
    case "inspect_activation_receipt":
    case "inspect_sidecar_status":
      return 60;
  }
}

function normalizeIncludedPhases(
  includePhases: PluginPackageMarketplaceLifecycleRunbookPhase[] | undefined,
): Set<PluginPackageMarketplaceLifecycleRunbookPhase> {
  const all: PluginPackageMarketplaceLifecycleRunbookPhase[] = ["metadata", "install", "activation", "inspection"];
  if (includePhases === undefined || includePhases.length === 0) return new Set(all);
  return new Set(includePhases.filter((phase) => all.includes(phase)));
}

function safeMaxPackets(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return Number.MAX_SAFE_INTEGER;
  return Math.min(value, 1000);
}

function safeId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]{1,160}$/.test(value) || looksSecret(value)) {
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
  view: PluginPackageMarketplaceLifecycleApprovalPacketsView,
): PluginPackageMarketplaceLifecycleApprovalPacketsView {
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
