import {
  executeApprovedPluginPackageInstallUpdate,
  type PluginPackageInstallUpdateApproval,
  type PluginPackageInstallUpdateExecutor,
  type PluginPackageInstallUpdateReceipt,
} from "./plugin-package-execution";
import type { PluginPackageMarketplaceInstallUpdateHandoff } from "./plugin-package-marketplace-install-handoff";
import type { PluginPackagePlanActionRecord } from "./plugin-package-discovery";

export type PluginPackageMarketplaceInstallUpdateHandoffExecutionBlockedReason =
  | "handoff_not_ready"
  | "action_mismatch"
  | "approval_required"
  | "approval_signature_mismatch"
  | "package_mismatch"
  | "sidecar_mismatch"
  | "install_update_blocked"
  | "install_update_failed";

export interface PluginPackageMarketplaceInstallUpdateHandoffExecutionRequest {
  handoff: PluginPackageMarketplaceInstallUpdateHandoff;
  action: PluginPackagePlanActionRecord;
  approval: PluginPackageInstallUpdateApproval;
  packageRoot: string;
  packagePath: string;
  executor: PluginPackageInstallUpdateExecutor;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceInstallUpdateHandoffExecutionReceipt {
  recordType: "mcp_plugin_package_install_update_handoff_execution_receipt";
  timestamp: string;
  status: "completed" | "failed" | "blocked";
  blockedReason?: PluginPackageMarketplaceInstallUpdateHandoffExecutionBlockedReason;
  hostActionExecuted: boolean;
  networkFetched: false;
  packageInstalled: boolean;
  packageExecuted: false;
  activation: false;
  sidecarStarted: false;
  catalogMutated: false;
  credentialsPersisted: false;
  requiresInjectedExecutor: true;
  handoff: {
    catalogId: string;
    entryId: string;
    action: "import" | "update" | "<blocked>";
    approvalSignature: string;
    hostActionKind: "plugin_package_install_update" | "<blocked>";
  };
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
    approved: boolean;
    approvedBy?: string;
    reason: "<redacted>";
  };
  installUpdateReceipt: {
    present: boolean;
    recordType: string;
    status: string;
    blockedReason?: string;
    action: string;
    signature: string;
    hostActionExecuted: boolean;
    stepCount: number;
    latestStepCode?: number;
  };
  warnings: string[];
}

const HANDOFF_EXECUTION_WARNINGS = [
  "Marketplace install/update handoff execution requires a ready redacted handoff, exact approval, a confined package path, and an injected executor.",
  "This receipt delegates to the existing approved package install/update helper; it does not fetch registries, execute package code, activate sidecars, start sidecars, mutate catalogs, or persist credentials.",
  "Executor output, package sources, approval reasons, and sidecar bodies remain redacted.",
];

export async function executeApprovedPluginPackageMarketplaceInstallUpdateHandoff(
  request: PluginPackageMarketplaceInstallUpdateHandoffExecutionRequest,
): Promise<PluginPackageMarketplaceInstallUpdateHandoffExecutionReceipt> {
  const timestamp = toIso(request.timestamp ?? new Date());
  const handoffCheck = validateReadyHandoff(request.handoff);
  if (handoffCheck !== "ok") {
    return block(receiptBase(timestamp, request, undefined), handoffCheck);
  }

  const actionCheck = validateActionMatchesHandoff(request.action, request.handoff);
  if (actionCheck !== "ok") {
    return block(receiptBase(timestamp, request, undefined), actionCheck);
  }

  if (!isPlainRecord(request.approval) || request.approval.approved !== true) {
    return block(receiptBase(timestamp, request, undefined), "approval_required");
  }
  if (request.approval.signature !== request.handoff.approval.signature) {
    return block(receiptBase(timestamp, request, undefined), "approval_signature_mismatch");
  }

  const installUpdateReceipt = await executeApprovedPluginPackageInstallUpdate({
    action: request.action,
    approval: request.approval,
    packageRoot: request.packageRoot,
    packagePath: request.packagePath,
    commands: request.handoff.commands,
    executor: request.executor,
    timestamp,
  });

  if (installUpdateReceipt.status === "completed") {
    return {
      ...receiptBase(timestamp, request, installUpdateReceipt),
      status: "completed",
      hostActionExecuted: installUpdateReceipt.steps.length > 0,
      packageInstalled: true,
    };
  }
  if (installUpdateReceipt.status === "failed") {
    return {
      ...receiptBase(timestamp, request, installUpdateReceipt),
      status: "failed",
      blockedReason: "install_update_failed",
      hostActionExecuted: installUpdateReceipt.steps.length > 0,
    };
  }
  return block(receiptBase(timestamp, request, installUpdateReceipt), "install_update_blocked");
}

function validateReadyHandoff(
  handoff: PluginPackageMarketplaceInstallUpdateHandoff,
): "ok" | "handoff_not_ready" | "approval_signature_mismatch" {
  if (!isPlainRecord(handoff) || handoff.recordType !== "mcp_plugin_package_install_update_handoff") {
    return "handoff_not_ready";
  }
  if (
    handoff.status !== "ready"
    || (handoff.action !== "import" && handoff.action !== "update")
    || handoff.hostAction?.kind !== "plugin_package_install_update"
    || handoff.hostAction?.executorPath !== "executeApprovedPluginPackageInstallUpdate"
    || handoff.hostAction?.requiresInjectedExecutor !== true
  ) {
    return "handoff_not_ready";
  }
  if (safeSignature(handoff.approval?.signature) === "<redacted>") {
    return "approval_signature_mismatch";
  }
  return "ok";
}

function validateActionMatchesHandoff(
  action: PluginPackagePlanActionRecord,
  handoff: PluginPackageMarketplaceInstallUpdateHandoff,
): "ok" | "action_mismatch" | "approval_signature_mismatch" | "package_mismatch" | "sidecar_mismatch" {
  const signature = safeSignature(action.signature);
  if (signature === "<redacted>" || signature !== safeSignature(handoff.approval?.signature)) {
    return "approval_signature_mismatch";
  }
  if (action.action !== handoff.action) {
    return "action_mismatch";
  }
  if (
    safeLabel(action.package?.name) !== safeLabel(handoff.package?.name)
    || safeLabel(action.package?.version) !== safeLabel(handoff.package?.version)
    || safeDigest(action.package?.digest) !== safeDigest(handoff.package?.digest)
  ) {
    return "package_mismatch";
  }
  if (
    safeLabel(action.sidecar?.id) !== safeLabel(handoff.sidecar?.id)
    || safeLabel(action.sidecar?.kind) !== safeLabel(handoff.sidecar?.kind)
  ) {
    return "sidecar_mismatch";
  }
  return "ok";
}

function receiptBase(
  timestamp: string,
  request: PluginPackageMarketplaceInstallUpdateHandoffExecutionRequest,
  installUpdateReceipt: PluginPackageInstallUpdateReceipt | undefined,
): PluginPackageMarketplaceInstallUpdateHandoffExecutionReceipt {
  return {
    recordType: "mcp_plugin_package_install_update_handoff_execution_receipt",
    timestamp,
    status: "blocked",
    hostActionExecuted: false,
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    requiresInjectedExecutor: true,
    handoff: {
      catalogId: safeId(request.handoff?.catalogId),
      entryId: safeId(request.handoff?.entry?.entryId),
      action: request.handoff?.action === "import" || request.handoff?.action === "update" ? request.handoff.action : "<blocked>",
      approvalSignature: safeSignature(request.handoff?.approval?.signature),
      hostActionKind: request.handoff?.hostAction?.kind === "plugin_package_install_update" ? "plugin_package_install_update" : "<blocked>",
    },
    package: {
      name: safeLabel(request.handoff?.package?.name ?? request.action?.package?.name),
      version: safeLabel(request.handoff?.package?.version ?? request.action?.package?.version),
      source: "<redacted>",
      digest: safeDigest(request.handoff?.package?.digest ?? request.action?.package?.digest),
    },
    sidecar: {
      id: safeLabel(request.handoff?.sidecar?.id ?? request.action?.sidecar?.id),
      kind: safeLabel(request.handoff?.sidecar?.kind ?? request.action?.sidecar?.kind),
    },
    approval: {
      approved: request.approval?.approved === true,
      ...(request.approval?.approvedBy === undefined ? {} : { approvedBy: safeLabel(request.approval.approvedBy) }),
      reason: "<redacted>",
    },
    installUpdateReceipt: summarizeInstallUpdateReceipt(installUpdateReceipt),
    warnings: [...HANDOFF_EXECUTION_WARNINGS],
  };
}

function block(
  base: PluginPackageMarketplaceInstallUpdateHandoffExecutionReceipt,
  reason: PluginPackageMarketplaceInstallUpdateHandoffExecutionBlockedReason,
): PluginPackageMarketplaceInstallUpdateHandoffExecutionReceipt {
  return {
    ...base,
    status: "blocked",
    blockedReason: reason,
    hostActionExecuted: false,
    packageInstalled: false,
  };
}

function summarizeInstallUpdateReceipt(
  receipt: PluginPackageInstallUpdateReceipt | undefined,
): PluginPackageMarketplaceInstallUpdateHandoffExecutionReceipt["installUpdateReceipt"] {
  if (!isPlainRecord(receipt)) {
    return {
      present: false,
      recordType: "<missing>",
      status: "<missing>",
      action: "<missing>",
      signature: "<redacted>",
      hostActionExecuted: false,
      stepCount: 0,
    };
  }
  const steps = Array.isArray(receipt.steps) ? receipt.steps : [];
  const latest = steps[steps.length - 1];
  return {
    present: true,
    recordType: receipt.recordType === "mcp_plugin_package_install_update_receipt" ? receipt.recordType : "<redacted>",
    status: safeLabel(receipt.status),
    ...(receipt.blockedReason === undefined ? {} : { blockedReason: safeLabel(receipt.blockedReason) }),
    action: safeLabel(receipt.action),
    signature: safeSignature(receipt.signature),
    hostActionExecuted: steps.length > 0,
    stepCount: steps.length,
    ...(latest === undefined ? {} : { latestStepCode: safeCode(latest.code) }),
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

function safeSignature(value: unknown): string {
  return typeof value === "string" && /^mcp-plugin:[a-f0-9]{24}$/i.test(value) ? value : "<redacted>";
}

function safeCode(value: unknown): number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= 255 ? value : 1;
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
