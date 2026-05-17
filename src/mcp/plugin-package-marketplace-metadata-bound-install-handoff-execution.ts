import {
  executeApprovedPluginPackageMarketplaceInstallUpdateHandoff,
  type PluginPackageMarketplaceInstallUpdateHandoffExecutionBlockedReason,
  type PluginPackageMarketplaceInstallUpdateHandoffExecutionReceipt,
} from "./plugin-package-marketplace-install-handoff-execution";
import type {
  PluginPackageInstallUpdateApproval,
  PluginPackageInstallUpdateExecutor,
} from "./plugin-package-execution";
import type { PluginPackagePlanActionRecord } from "./plugin-package-discovery";
import type { PluginPackageMarketplaceMetadataBoundInstallUpdateHandoff } from "./plugin-package-marketplace-metadata-bound-install-handoff";

export type PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffExecutionBlockedReason =
  | "metadata_bound_handoff_not_ready"
  | "install_update_handoff_not_ready"
  | "action_mismatch"
  | "approval_required"
  | "approval_signature_mismatch"
  | "package_mismatch"
  | "sidecar_mismatch"
  | "install_update_blocked"
  | "install_update_failed";

export interface PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffExecutionRequest {
  handoff: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoff;
  action: PluginPackagePlanActionRecord;
  approval: PluginPackageInstallUpdateApproval;
  packageRoot: string;
  packagePath: string;
  executor: PluginPackageInstallUpdateExecutor;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffExecutionReceipt {
  recordType: "mcp_plugin_package_marketplace_metadata_bound_install_update_handoff_execution_receipt";
  timestamp: string;
  status: "completed" | "failed" | "blocked";
  blockedReason?: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffExecutionBlockedReason;
  hostActionExecuted: boolean;
  metadataGate: {
    required: true;
    state: string;
    registryMetadataApplied: boolean;
    registryMetadataVerified: boolean;
  };
  handoffExecutionReceipt: {
    present: boolean;
    recordType: string;
    status: string;
    blockedReason?: string;
    hostActionExecuted: boolean;
    packageInstalled: boolean;
  };
  networkFetched: false;
  packageInstalled: boolean;
  packageExecuted: false;
  activation: false;
  sidecarStarted: false;
  catalogMutated: false;
  credentialsPersisted: false;
  requiresInjectedExecutor: true;
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
  warnings: string[];
}

const METADATA_BOUND_EXECUTION_WARNINGS = [
  "Metadata-bound marketplace install/update execution requires a ready Phase 253 metadata-bound handoff before delegating to the existing approved install/update helper.",
  "The metadata gate must report metadata_ready with applied and verified registry metadata truth before any injected executor call is allowed.",
  "This receipt does not fetch registries, execute package code, activate sidecars, start sidecars, mutate catalogs, or persist credentials.",
];

export async function executeApprovedPluginPackageMarketplaceMetadataBoundInstallUpdateHandoff(
  request: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffExecutionRequest,
): Promise<PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffExecutionReceipt> {
  const timestamp = toIso(request.timestamp ?? new Date());
  const metadataCheck = validateMetadataBoundHandoff(request.handoff);
  if (metadataCheck !== "ok") {
    return block(receiptBase(timestamp, request, undefined), metadataCheck);
  }

  const nestedCheck = validateNestedInstallUpdateHandoff(request.handoff);
  if (nestedCheck !== "ok") {
    return block(receiptBase(timestamp, request, undefined), nestedCheck);
  }

  const handoffReceipt = await executeApprovedPluginPackageMarketplaceInstallUpdateHandoff({
    handoff: request.handoff.installUpdateHandoff,
    action: request.action,
    approval: request.approval,
    packageRoot: request.packageRoot,
    packagePath: request.packagePath,
    executor: request.executor,
    timestamp,
  });

  if (handoffReceipt.status === "completed") {
    return {
      ...receiptBase(timestamp, request, handoffReceipt),
      status: "completed",
      hostActionExecuted: handoffReceipt.hostActionExecuted,
      packageInstalled: true,
    };
  }

  if (handoffReceipt.status === "failed") {
    return {
      ...receiptBase(timestamp, request, handoffReceipt),
      status: "failed",
      blockedReason: "install_update_failed",
      hostActionExecuted: handoffReceipt.hostActionExecuted,
      packageInstalled: false,
    };
  }

  return block(receiptBase(timestamp, request, handoffReceipt), mapNestedBlockedReason(handoffReceipt.blockedReason));
}

function validateMetadataBoundHandoff(
  handoff: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoff,
): "ok" | "metadata_bound_handoff_not_ready" {
  if (!isPlainRecord(handoff) || handoff.recordType !== "mcp_plugin_package_marketplace_metadata_bound_install_update_handoff") {
    return "metadata_bound_handoff_not_ready";
  }
  if (
    handoff.status !== "ready"
    || handoff.metadataGate?.required !== true
    || handoff.metadataGate?.state !== "metadata_ready"
    || handoff.metadataGate?.registryMetadataApplied !== true
    || handoff.metadataGate?.registryMetadataVerified !== true
  ) {
    return "metadata_bound_handoff_not_ready";
  }
  return "ok";
}

function validateNestedInstallUpdateHandoff(
  handoff: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoff,
): "ok" | "install_update_handoff_not_ready" {
  const nested = handoff.installUpdateHandoff;
  if (!isPlainRecord(nested) || nested.recordType !== "mcp_plugin_package_install_update_handoff" || nested.status !== "ready") {
    return "install_update_handoff_not_ready";
  }
  return "ok";
}

function receiptBase(
  timestamp: string,
  request: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffExecutionRequest,
  handoffReceipt: PluginPackageMarketplaceInstallUpdateHandoffExecutionReceipt | undefined,
): PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffExecutionReceipt {
  return {
    recordType: "mcp_plugin_package_marketplace_metadata_bound_install_update_handoff_execution_receipt",
    timestamp,
    status: "blocked",
    hostActionExecuted: false,
    metadataGate: {
      required: true,
      state: safeLabel(request.handoff?.metadataGate?.state),
      registryMetadataApplied: request.handoff?.metadataGate?.registryMetadataApplied === true,
      registryMetadataVerified: request.handoff?.metadataGate?.registryMetadataVerified === true,
    },
    handoffExecutionReceipt: summarizeHandoffReceipt(handoffReceipt),
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    requiresInjectedExecutor: true,
    package: {
      name: safeLabel(request.handoff?.installUpdateHandoff?.package?.name ?? request.action?.package?.name),
      version: safeLabel(request.handoff?.installUpdateHandoff?.package?.version ?? request.action?.package?.version),
      source: "<redacted>",
      digest: safeDigest(request.handoff?.installUpdateHandoff?.package?.digest ?? request.action?.package?.digest),
    },
    sidecar: {
      id: safeLabel(request.handoff?.installUpdateHandoff?.sidecar?.id ?? request.action?.sidecar?.id),
      kind: safeLabel(request.handoff?.installUpdateHandoff?.sidecar?.kind ?? request.action?.sidecar?.kind),
    },
    warnings: [...METADATA_BOUND_EXECUTION_WARNINGS],
  };
}

function summarizeHandoffReceipt(
  receipt: PluginPackageMarketplaceInstallUpdateHandoffExecutionReceipt | undefined,
): PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffExecutionReceipt["handoffExecutionReceipt"] {
  if (!isPlainRecord(receipt)) {
    return {
      present: false,
      recordType: "<missing>",
      status: "<missing>",
      hostActionExecuted: false,
      packageInstalled: false,
    };
  }
  return {
    present: true,
    recordType: receipt.recordType === "mcp_plugin_package_install_update_handoff_execution_receipt"
      ? receipt.recordType
      : "<redacted>",
    status: safeLabel(receipt.status),
    ...(receipt.blockedReason === undefined ? {} : { blockedReason: safeLabel(receipt.blockedReason) }),
    hostActionExecuted: receipt.hostActionExecuted === true,
    packageInstalled: receipt.packageInstalled === true,
  };
}

function block(
  base: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffExecutionReceipt,
  reason: PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffExecutionBlockedReason,
): PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffExecutionReceipt {
  return {
    ...base,
    status: "blocked",
    blockedReason: reason,
    hostActionExecuted: false,
    packageInstalled: false,
  };
}

function mapNestedBlockedReason(
  reason: PluginPackageMarketplaceInstallUpdateHandoffExecutionBlockedReason | undefined,
): PluginPackageMarketplaceMetadataBoundInstallUpdateHandoffExecutionBlockedReason {
  switch (reason) {
    case "handoff_not_ready":
      return "install_update_handoff_not_ready";
    case "action_mismatch":
    case "approval_required":
    case "approval_signature_mismatch":
    case "package_mismatch":
    case "sidecar_mismatch":
    case "install_update_failed":
      return reason;
    case "install_update_blocked":
    default:
      return "install_update_blocked";
  }
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
