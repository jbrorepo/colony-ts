import {
  executeApprovedPluginPackageSidecarActivation,
  type PluginPackageSidecarActivationReceipt,
  type PluginPackageSidecarActivationSupervisor,
} from "./plugin-package-activation";
import type { PluginPackageMarketplaceActivationHandoff } from "./plugin-package-activation-handoff";
import type { PluginPackagePlanActionRecord } from "./plugin-package-discovery";
import type {
  PluginPackageInstallUpdateApproval,
  PluginPackageInstallUpdateReceipt,
} from "./plugin-package-execution";

export type PluginPackageMarketplaceActivationHandoffExecutionBlockedReason =
  | "handoff_not_ready"
  | "signature_mismatch"
  | "approval_required"
  | "approval_signature_mismatch"
  | "install_receipt_mismatch"
  | "activation_failed";

export interface PluginPackageMarketplaceActivationHandoffExecutionRequest {
  handoff: PluginPackageMarketplaceActivationHandoff;
  action: PluginPackagePlanActionRecord;
  installReceipt?: PluginPackageInstallUpdateReceipt;
  approval: PluginPackageInstallUpdateApproval;
  supervisor: PluginPackageSidecarActivationSupervisor;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceActivationHandoffExecutionReceipt {
  recordType: "mcp_plugin_package_activation_handoff_execution_receipt";
  timestamp: string;
  status: "completed" | "failed" | "blocked";
  blockedReason?: PluginPackageMarketplaceActivationHandoffExecutionBlockedReason;
  hostActionExecuted: boolean;
  activation: boolean;
  sidecarStarted: boolean;
  networkFetched: false;
  packageInstalled: false;
  packageExecuted: false;
  catalogMutated: false;
  credentialsPersisted: false;
  requiresInjectedSupervisor: true;
  handoff: {
    catalogId: string;
    entryId: string;
    sidecarSignature: string;
    approvalSignature: string;
    hostActionKind: "start_plugin_package_sidecar" | "<blocked>";
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
  installReceipt: {
    present: boolean;
    status: string;
    action: string;
    signature: string;
  };
  activationReceipt: {
    present: boolean;
    recordType: string;
    status: string;
    blockedReason?: string;
    activation: boolean;
    sidecarStarted: boolean;
    registryFetched: false;
    supervisorState: string;
  };
  warnings: string[];
}

const HANDOFF_EXECUTION_WARNINGS = [
  "Marketplace activation handoff execution requires a ready redacted handoff, exact approval, a matching install/update receipt, and an injected supervisor.",
  "This receipt delegates to the existing approved package sidecar activation helper; it does not install packages, fetch registries, execute package code, mutate catalogs, or persist credentials.",
  "Supervisor lifecycle details, package sources, approval reasons, and sidecar bodies remain redacted.",
];

export async function executeApprovedPluginPackageMarketplaceActivationHandoff(
  request: PluginPackageMarketplaceActivationHandoffExecutionRequest,
): Promise<PluginPackageMarketplaceActivationHandoffExecutionReceipt> {
  const timestamp = toIso(request.timestamp ?? new Date());
  const base = receiptBase(timestamp, request, undefined);
  const handoffCheck = validateReadyHandoff(request.handoff);
  if (handoffCheck !== "ok") {
    return block(base, handoffCheck);
  }

  const signature = safeSignature(request.handoff.sidecarSignature);
  if (
    signature === "<redacted>"
    || request.action.signature !== signature
    || request.handoff.hostAction.sidecarSignature !== signature
    || request.handoff.hostAction.approvalSignature !== signature
  ) {
    return block(base, "signature_mismatch");
  }
  if (request.action.sidecar?.id !== request.handoff.sidecar.id || request.action.sidecar?.kind !== request.handoff.sidecar.kind) {
    return block(base, "signature_mismatch");
  }
  if (request.action.package?.name !== request.handoff.package.name || request.action.package?.version !== request.handoff.package.version) {
    return block(base, "signature_mismatch");
  }

  if (!isPlainRecord(request.installReceipt) || request.installReceipt.signature !== signature || request.installReceipt.status !== "completed") {
    return block(receiptBase(timestamp, request, undefined), "install_receipt_mismatch");
  }
  if (!isPlainRecord(request.approval) || request.approval.approved !== true) {
    return block(receiptBase(timestamp, request, undefined), "approval_required");
  }
  if (request.approval.signature !== signature) {
    return block(receiptBase(timestamp, request, undefined), "approval_signature_mismatch");
  }

  const activationReceipt = await executeApprovedPluginPackageSidecarActivation({
    action: request.action,
    installReceipt: request.installReceipt,
    approval: request.approval,
    supervisor: request.supervisor,
    timestamp,
  });

  if (activationReceipt.status === "completed") {
    return {
      ...receiptBase(timestamp, request, activationReceipt),
      status: "completed",
      hostActionExecuted: true,
      activation: true,
      sidecarStarted: true,
    };
  }
  if (activationReceipt.status === "failed") {
    return {
      ...receiptBase(timestamp, request, activationReceipt),
      status: "failed",
      blockedReason: "activation_failed",
      hostActionExecuted: true,
    };
  }
  return block(receiptBase(timestamp, request, activationReceipt), activationBlockedReason(activationReceipt));
}

function validateReadyHandoff(
  handoff: PluginPackageMarketplaceActivationHandoff,
): "ok" | "handoff_not_ready" | "signature_mismatch" {
  if (!isPlainRecord(handoff) || handoff.recordType !== "mcp_plugin_package_activation_handoff") {
    return "handoff_not_ready";
  }
  if (
    handoff.status !== "ready"
    || handoff.hostActionRequired !== true
    || handoff.requiresInjectedSupervisor !== true
    || handoff.hostAction.kind !== "start_plugin_package_sidecar"
    || handoff.hostAction.supervisorPath !== "executeApprovedPluginPackageSidecarActivation"
  ) {
    return "handoff_not_ready";
  }
  const signature = safeSignature(handoff.sidecarSignature);
  if (signature === "<redacted>" || handoff.hostAction.sidecarSignature !== signature || handoff.hostAction.approvalSignature !== signature) {
    return "signature_mismatch";
  }
  return "ok";
}

function activationBlockedReason(
  activationReceipt: PluginPackageSidecarActivationReceipt,
): PluginPackageMarketplaceActivationHandoffExecutionBlockedReason {
  switch (activationReceipt.blockedReason) {
    case "approval_required":
      return "approval_required";
    case "approval_signature_mismatch":
      return "approval_signature_mismatch";
    case "install_receipt_required":
    case "install_receipt_mismatch":
      return "install_receipt_mismatch";
    case "supervisor_start_failed":
      return "activation_failed";
    default:
      return "signature_mismatch";
  }
}

function receiptBase(
  timestamp: string,
  request: PluginPackageMarketplaceActivationHandoffExecutionRequest,
  activationReceipt: PluginPackageSidecarActivationReceipt | undefined,
): PluginPackageMarketplaceActivationHandoffExecutionReceipt {
  const signature = safeSignature(request.handoff?.sidecarSignature);
  return {
    recordType: "mcp_plugin_package_activation_handoff_execution_receipt",
    timestamp,
    status: "blocked",
    hostActionExecuted: false,
    activation: false,
    sidecarStarted: false,
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    requiresInjectedSupervisor: true,
    handoff: {
      catalogId: safeLabel(request.handoff?.catalogId),
      entryId: safeLabel(request.handoff?.entryId),
      sidecarSignature: signature,
      approvalSignature: safeSignature(request.handoff?.hostAction?.approvalSignature),
      hostActionKind: request.handoff?.hostAction?.kind === "start_plugin_package_sidecar" ? "start_plugin_package_sidecar" : "<blocked>",
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
    installReceipt: summarizeInstallReceipt(request.installReceipt),
    activationReceipt: summarizeActivationReceipt(activationReceipt),
    warnings: [...HANDOFF_EXECUTION_WARNINGS],
  };
}

function block(
  base: PluginPackageMarketplaceActivationHandoffExecutionReceipt,
  reason: PluginPackageMarketplaceActivationHandoffExecutionBlockedReason,
): PluginPackageMarketplaceActivationHandoffExecutionReceipt {
  return {
    ...base,
    status: "blocked",
    blockedReason: reason,
    hostActionExecuted: false,
    activation: false,
    sidecarStarted: false,
  };
}

function summarizeInstallReceipt(
  receipt: PluginPackageInstallUpdateReceipt | undefined,
): PluginPackageMarketplaceActivationHandoffExecutionReceipt["installReceipt"] {
  if (!isPlainRecord(receipt)) {
    return {
      present: false,
      status: "<missing>",
      action: "<missing>",
      signature: "<redacted>",
    };
  }
  return {
    present: true,
    status: safeLabel(receipt.status),
    action: safeLabel(receipt.action),
    signature: safeSignature(receipt.signature),
  };
}

function summarizeActivationReceipt(
  receipt: PluginPackageSidecarActivationReceipt | undefined,
): PluginPackageMarketplaceActivationHandoffExecutionReceipt["activationReceipt"] {
  if (!isPlainRecord(receipt)) {
    return {
      present: false,
      recordType: "<missing>",
      status: "<missing>",
      activation: false,
      sidecarStarted: false,
      registryFetched: false,
      supervisorState: "not_started",
    };
  }
  return {
    present: true,
    recordType: receipt.recordType === "mcp_plugin_package_sidecar_activation_receipt" ? receipt.recordType : "<redacted>",
    status: safeLabel(receipt.status),
    ...(receipt.blockedReason === undefined ? {} : { blockedReason: safeLabel(receipt.blockedReason) }),
    activation: receipt.activation === true,
    sidecarStarted: receipt.sidecarStarted === true,
    registryFetched: false,
    supervisorState: safeLabel(receipt.supervisor?.state),
  };
}

function safeSignature(value: unknown): string {
  return typeof value === "string" && /^mcp-plugin:[a-f0-9]{24}$/i.test(value) ? value : "<redacted>";
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

function safeLabel(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "<redacted>";
  const clean = value.replace(/[\0\r\n]/g, "");
  return looksSecret(clean) || looksHighEntropy(clean) ? "<redacted>" : clean.slice(0, 120);
}

function looksSecret(value: string): boolean {
  return /(secret|token|password|credential|bearer|api[_-]?key|SHOULD_NOT_LEAK)/i.test(value);
}

function looksHighEntropy(value: string): boolean {
  if (value.length < 32) return false;
  const compact = value.replace(/[-_:./@]/g, "");
  if (compact.length < 32) return false;
  if (/^[A-Fa-f0-9]{32,}$/.test(compact)) return true;
  if (/^[A-Za-z0-9+/=_-]{32,}$/.test(compact)) {
    return new Set(compact).size >= 16;
  }
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
