import type { PluginPackagePlanAction, PluginPackagePlanActionRecord } from "./plugin-package-discovery";
import type {
  PluginPackageInstallUpdateApproval,
  PluginPackageInstallUpdateReceipt,
} from "./plugin-package-execution";
import {
  normalizePluginMcpSidecarDefinition,
  pluginMcpSidecarTrustSignature,
  type NormalizedPluginMcpSidecarDefinition,
  type PluginMcpSidecarDefinition,
  type PluginMcpSidecarTrustApproval,
} from "./plugin-sidecar-config";
import type { PluginMcpSidecarSupervisorSnapshot } from "./plugin-sidecar-supervisor";

export interface PluginPackageSidecarActivationSupervisor {
  start(
    definition: PluginMcpSidecarDefinition,
    approval: PluginMcpSidecarTrustApproval,
  ): Promise<PluginMcpSidecarSupervisorSnapshot> | PluginMcpSidecarSupervisorSnapshot;
}

export type PluginPackageSidecarActivationBlockedReason =
  | "approval_required"
  | "approval_signature_mismatch"
  | "unsupported_action"
  | "invalid_plugin_signature"
  | "invalid_sidecar_kind"
  | "install_receipt_required"
  | "install_receipt_mismatch"
  | "supervisor_start_failed";

export interface PluginPackageSidecarActivationRequest {
  action: PluginPackagePlanActionRecord;
  installReceipt?: PluginPackageInstallUpdateReceipt;
  approval: PluginPackageInstallUpdateApproval;
  supervisor: PluginPackageSidecarActivationSupervisor;
  timestamp?: string | Date;
}

export interface PluginPackageSidecarActivationReceipt {
  recordType: "mcp_plugin_package_sidecar_activation_receipt";
  timestamp: string;
  status: "completed" | "failed" | "blocked";
  blockedReason?: PluginPackageSidecarActivationBlockedReason;
  action: Extract<PluginPackagePlanAction, "import" | "update"> | "<blocked>";
  dryRun: false;
  activation: boolean;
  sidecarStarted: boolean;
  registryFetched: false;
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
  signature: string;
  approval: {
    approved: boolean;
    approvedBy?: string;
    reason: "<redacted>";
  };
  installReceipt: {
    present: boolean;
    recordType: string;
    status: string;
    action: string;
    signature: string;
    stepCount: number;
    timestamp?: string;
  };
  supervisor: {
    serverId: string;
    signature: string;
    state: string;
    restartCount: number;
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
  };
  warnings: string[];
}

type TrustedAction = {
  signature: string;
  definition: NormalizedPluginMcpSidecarDefinition;
};

type NormalizedActivationApproval = {
  approved: boolean;
  signature: string;
  approvedBy?: string;
  reason: "<redacted>";
};

const ACTIVATION_WARNINGS = [
  "Plugin package sidecar activation is approval-gated and uses an injected supervisor.",
  "Activation requires a completed install/update receipt for the same trusted plugin package signature.",
  "Activation receipts do not fetch registries, execute package lifecycle code, persist credentials, or expose transport/client internals.",
];

export async function executeApprovedPluginPackageSidecarActivation(
  request: PluginPackageSidecarActivationRequest,
): Promise<PluginPackageSidecarActivationReceipt> {
  const timestamp = toIso(request.timestamp ?? new Date());
  const trusted = trustedAction(request.action);
  const approval = normalizeApproval(request.approval);
  const base = receiptBase(timestamp, request.action, trusted, approval, request.installReceipt);

  if (request.action.action !== "import" && request.action.action !== "update") {
    return block(base, "unsupported_action");
  }
  if (trusted === undefined) {
    return block(base, "invalid_plugin_signature");
  }
  if (trusted.definition.sidecarKind === "unknown") {
    return block(receiptBase(timestamp, request.action, trusted, approval, request.installReceipt), "invalid_sidecar_kind");
  }
  if (!approval.approved) {
    return block(receiptBase(timestamp, request.action, trusted, approval, request.installReceipt), "approval_required");
  }
  if (approval.signature !== trusted.signature) {
    return block(receiptBase(timestamp, request.action, trusted, approval, request.installReceipt), "approval_signature_mismatch");
  }
  const receiptCheck = validateInstallReceipt(request.installReceipt, request.action.action, trusted.signature);
  if (receiptCheck !== "ok") {
    return block(receiptBase(timestamp, request.action, trusted, approval, request.installReceipt), receiptCheck);
  }
  if (!request.supervisor || typeof request.supervisor.start !== "function") {
    return {
      ...receiptBase(timestamp, request.action, trusted, approval, request.installReceipt),
      status: "failed",
      blockedReason: "supervisor_start_failed",
    };
  }

  let snapshot: PluginMcpSidecarSupervisorSnapshot;
  try {
    snapshot = await request.supervisor.start(cloneDefinition(trusted.definition), {
      approved: true,
      signature: trusted.signature,
      ...(approval.approvedBy === undefined ? {} : { approvedBy: approval.approvedBy }),
      reason: approval.reason,
    });
  } catch {
    return {
      ...receiptBase(timestamp, request.action, trusted, approval, request.installReceipt),
      status: "failed",
      blockedReason: "supervisor_start_failed",
    };
  }

  if (snapshot.state !== "running") {
    return {
      ...receiptBase(timestamp, request.action, trusted, approval, request.installReceipt, snapshot),
      status: "failed",
      blockedReason: "supervisor_start_failed",
    };
  }

  return {
    ...receiptBase(timestamp, request.action, trusted, approval, request.installReceipt, snapshot),
    status: "completed",
    activation: true,
    sidecarStarted: true,
  };
}

function validateInstallReceipt(
  receipt: PluginPackageInstallUpdateReceipt | undefined,
  action: PluginPackagePlanAction,
  signature: string,
): "ok" | "install_receipt_required" | "install_receipt_mismatch" {
  if (receipt === undefined || !isPlainRecord(receipt)) return "install_receipt_required";
  if (receipt.recordType !== "mcp_plugin_package_install_update_receipt") return "install_receipt_mismatch";
  if (receipt.status !== "completed") return "install_receipt_required";
  if (receipt.action !== action || receipt.signature !== signature) return "install_receipt_mismatch";
  if (receipt.activation !== false || receipt.sidecarStarted !== false || receipt.registryFetched !== false) {
    return "install_receipt_mismatch";
  }
  if (!Array.isArray(receipt.steps) || receipt.steps.length === 0 || receipt.steps.some((step) => !isPlainRecord(step) || step.code !== 0)) {
    return "install_receipt_mismatch";
  }
  return "ok";
}

function trustedAction(action: PluginPackagePlanActionRecord): TrustedAction | undefined {
  const signature = safeSignature(action.signature);
  if (signature === undefined || !isPlainRecord(action.definition)) return undefined;
  try {
    const definition = normalizePluginMcpSidecarDefinition(action.definition);
    return pluginMcpSidecarTrustSignature(definition) === signature ? { signature, definition } : undefined;
  } catch {
    return undefined;
  }
}

function receiptBase(
  timestamp: string,
  action: PluginPackagePlanActionRecord,
  trusted: TrustedAction | undefined,
  approval: NormalizedActivationApproval,
  installReceipt: PluginPackageInstallUpdateReceipt | undefined,
  supervisorSnapshot?: PluginMcpSidecarSupervisorSnapshot,
): PluginPackageSidecarActivationReceipt {
  const definition = trusted?.definition;
  return {
    recordType: "mcp_plugin_package_sidecar_activation_receipt",
    timestamp,
    status: "blocked",
    action: action.action === "import" || action.action === "update" ? action.action : "<blocked>",
    dryRun: false,
    activation: false,
    sidecarStarted: false,
    registryFetched: false,
    package: definition === undefined
      ? {
        name: safeLabel(action.package?.name),
        version: safeLabel(action.package?.version),
        source: "<redacted>",
        digest: safeDigest(action.package?.digest),
      }
      : {
        name: safeLabel(definition.packageName),
        version: safeLabel(definition.packageVersion),
        source: "<redacted>",
        digest: safeDigest(definition.packageDigest),
      },
    sidecar: definition === undefined
      ? {
        id: safeLabel(action.sidecar?.id),
        kind: safeLabel(action.sidecar?.kind),
      }
      : {
        id: safeLabel(definition.id),
        kind: safeLabel(definition.sidecarKind),
      },
    signature: trusted?.signature ?? "<redacted>",
    approval: {
      approved: approval.approved,
      ...(approval.approvedBy === undefined ? {} : { approvedBy: approval.approvedBy }),
      reason: "<redacted>",
    },
    installReceipt: summarizeInstallReceipt(installReceipt),
    supervisor: summarizeSupervisor(supervisorSnapshot, definition, trusted?.signature),
    warnings: [...ACTIVATION_WARNINGS],
  };
}

function block(
  base: PluginPackageSidecarActivationReceipt,
  reason: PluginPackageSidecarActivationBlockedReason,
): PluginPackageSidecarActivationReceipt {
  return {
    ...base,
    status: "blocked",
    blockedReason: reason,
    activation: false,
    sidecarStarted: false,
  };
}

function summarizeInstallReceipt(
  receipt: PluginPackageInstallUpdateReceipt | undefined,
): PluginPackageSidecarActivationReceipt["installReceipt"] {
  if (receipt === undefined || !isPlainRecord(receipt)) {
    return {
      present: false,
      recordType: "<missing>",
      status: "<missing>",
      action: "<missing>",
      signature: "<redacted>",
      stepCount: 0,
    };
  }
  return {
    present: true,
    recordType: receipt.recordType === "mcp_plugin_package_install_update_receipt" ? receipt.recordType : "<redacted>",
    status: safeLabel(receipt.status),
    action: safeLabel(receipt.action),
    signature: safeSignature(receipt.signature) ?? "<redacted>",
    stepCount: Array.isArray(receipt.steps) ? Math.min(receipt.steps.length, 16) : 0,
    ...(receipt.timestamp === undefined ? {} : { timestamp: safeTimestamp(receipt.timestamp) }),
  };
}

function summarizeSupervisor(
  snapshot: PluginMcpSidecarSupervisorSnapshot | undefined,
  definition: NormalizedPluginMcpSidecarDefinition | undefined,
  signature: string | undefined,
): PluginPackageSidecarActivationReceipt["supervisor"] {
  if (snapshot === undefined) {
    return {
      serverId: definition === undefined ? "<redacted>" : safeLabel(definition.id),
      signature: signature ?? "<redacted>",
      state: "not_started",
      restartCount: 0,
      package: {
        name: definition === undefined ? "<redacted>" : safeLabel(definition.packageName),
        version: definition === undefined ? "<redacted>" : safeLabel(definition.packageVersion),
        source: "<redacted>",
        digest: definition === undefined ? "<redacted>" : safeDigest(definition.packageDigest),
      },
      sidecar: {
        id: definition === undefined ? "<redacted>" : safeLabel(definition.sidecarId),
        kind: definition === undefined ? "<redacted>" : safeLabel(definition.sidecarKind),
      },
    };
  }
  return {
    serverId: safeLabel(snapshot.serverId),
    signature: safeSignature(snapshot.signature) ?? "<redacted>",
    state: safeLabel(snapshot.state),
    restartCount: safeCount(snapshot.restartCount),
    package: {
      name: safeLabel(snapshot.package?.name),
      version: safeLabel(snapshot.package?.version),
      source: "<redacted>",
      digest: safeDigest(snapshot.package?.digest),
    },
    sidecar: {
      id: safeLabel(snapshot.sidecar?.id),
      kind: safeLabel(snapshot.sidecar?.kind),
    },
  };
}

function normalizeApproval(value: unknown): NormalizedActivationApproval {
  if (!isPlainRecord(value)) {
    return { approved: false, signature: "", reason: "<redacted>" };
  }
  return {
    approved: value.approved === true,
    signature: typeof value.signature === "string" ? value.signature : "",
    ...(value.approvedBy === undefined ? {} : { approvedBy: safeLabel(value.approvedBy) }),
    reason: "<redacted>",
  };
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

function safeCount(value: unknown): number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= 1_000_000 ? value : 0;
}

function safeSignature(value: unknown): string | undefined {
  return typeof value === "string" && /^mcp-plugin:[a-f0-9]{24}$/i.test(value) ? value : undefined;
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

function safeTimestamp(value: unknown): string {
  if (typeof value !== "string" || value.length > 40 || /[\0\r\n]/.test(value)) return "<redacted>";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "<redacted>";
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
