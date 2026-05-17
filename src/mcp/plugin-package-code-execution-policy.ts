import { relative, resolve } from "path";

import type { PluginPackagePlanAction, PluginPackagePlanActionRecord } from "./plugin-package-discovery";
import type {
  PluginPackageInstallUpdateApproval,
  PluginPackageInstallUpdateReceipt,
} from "./plugin-package-execution";
import {
  normalizePluginMcpSidecarDefinition,
  pluginMcpSidecarTrustSignature,
  type NormalizedPluginMcpSidecarDefinition,
} from "./plugin-sidecar-config";

export type PluginPackageCodeExecutionExecutable = "bun" | "npm";
export type PluginPackageCodeExecutionKind = "test" | "build" | "lint" | "custom";

export interface PluginPackageCodeExecutionCommand {
  executable: PluginPackageCodeExecutionExecutable;
  arguments: string[];
  kind: PluginPackageCodeExecutionKind;
}

export type PluginPackageCodeExecutionApproval = PluginPackageInstallUpdateApproval;

export type PluginPackageCodeExecutionBlockedReason =
  | "approval_required"
  | "approval_signature_mismatch"
  | "unsupported_action"
  | "invalid_plugin_signature"
  | "invalid_sidecar_kind"
  | "install_receipt_required"
  | "install_receipt_mismatch"
  | "package_path_escape"
  | "lifecycle_script_rejected"
  | "unsafe_package_code_command";

export interface PluginPackageCodeExecutionPreflightRequest {
  action: PluginPackagePlanActionRecord;
  installReceipt?: PluginPackageInstallUpdateReceipt;
  approval: PluginPackageCodeExecutionApproval;
  packageRoot: string;
  packagePath: string;
  command: PluginPackageCodeExecutionCommand;
  timestamp?: string | Date;
}

export interface PluginPackageCodeExecutionPreflight {
  recordType: "mcp_plugin_package_code_execution_preflight";
  timestamp: string;
  status: "ready" | "blocked";
  blockedReason?: PluginPackageCodeExecutionBlockedReason;
  action: Extract<PluginPackagePlanAction, "import" | "update"> | "<blocked>";
  dryRun: false;
  hostActionRequired: boolean;
  packageExecuted: false;
  executorCalled: false;
  registryFetched: false;
  activation: false;
  sidecarStarted: false;
  catalogMutated: false;
  credentialsPersisted: false;
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
  hostAction: {
    type: "execute_plugin_package_code";
    command: {
      executable: PluginPackageCodeExecutionExecutable | "<redacted>";
      arguments: string[];
      kind: PluginPackageCodeExecutionKind | "<redacted>";
      cwd: "<redacted>";
    };
    maxAttempts: 1;
    destructive: false;
  };
  warnings: string[];
}

type TrustedAction = {
  signature: string;
  definition: NormalizedPluginMcpSidecarDefinition;
};

type NormalizedCodeApproval = {
  approved: boolean;
  signature: string;
  approvedBy?: string;
  reason: "<redacted>";
};

const PREFLIGHT_WARNINGS = [
  "Plugin package code execution is a high-risk host action and remains blocked by default.",
  "This preflight does not execute package code, start sidecars, fetch registries, mutate catalogs, or persist credentials.",
  "Lifecycle scripts and shell-like commands are rejected before any host action is produced.",
];
const ALLOWED_EXECUTABLES = new Set<PluginPackageCodeExecutionExecutable>(["bun", "npm"]);
const ALLOWED_RUN_TARGETS = new Set(["test", "build", "lint"]);
const LIFECYCLE_TERMS = new Set([
  "install",
  "ci",
  "add",
  "remove",
  "update",
  "upgrade",
  "preinstall",
  "postinstall",
  "prepare",
  "prepublish",
  "prepack",
  "postpack",
  "start",
  "restart",
]);

export function createPluginPackageCodeExecutionPreflight(
  request: PluginPackageCodeExecutionPreflightRequest,
): PluginPackageCodeExecutionPreflight {
  const timestamp = toIso(request.timestamp ?? new Date());
  const trusted = trustedAction(request.action);
  const approval = normalizeApproval(request.approval);
  const base = preflightBase(timestamp, request.action, trusted, approval, request.installReceipt, request.command);

  if (request.action.action !== "import" && request.action.action !== "update") {
    return block(base, "unsupported_action");
  }
  if (trusted === undefined) {
    return block(base, "invalid_plugin_signature");
  }
  if (trusted.definition.sidecarKind === "unknown") {
    return block(preflightBase(timestamp, request.action, trusted, approval, request.installReceipt, request.command), "invalid_sidecar_kind");
  }
  if (!approval.approved) {
    return block(preflightBase(timestamp, request.action, trusted, approval, request.installReceipt, request.command), "approval_required");
  }
  if (approval.signature !== trusted.signature) {
    return block(preflightBase(timestamp, request.action, trusted, approval, request.installReceipt, request.command), "approval_signature_mismatch");
  }
  const receiptCheck = validateInstallReceipt(request.installReceipt, request.action.action, trusted.signature);
  if (receiptCheck !== "ok") {
    return block(preflightBase(timestamp, request.action, trusted, approval, request.installReceipt, request.command), receiptCheck);
  }
  const packageCwd = confinedPackagePath(request.packageRoot, request.packagePath);
  if (packageCwd === undefined) {
    return block(preflightBase(timestamp, request.action, trusted, approval, request.installReceipt, request.command), "package_path_escape");
  }
  const commandCheck = validateCommand(request.command);
  if (commandCheck !== "ok") {
    return block(preflightBase(timestamp, request.action, trusted, approval, request.installReceipt, request.command), commandCheck);
  }

  return freezePreflight({
    ...preflightBase(timestamp, request.action, trusted, approval, request.installReceipt, request.command),
    status: "ready",
    hostActionRequired: true,
  });
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

function validateCommand(command: PluginPackageCodeExecutionCommand): "ok" | "lifecycle_script_rejected" | "unsafe_package_code_command" {
  if (!isPlainRecord(command) || !ALLOWED_EXECUTABLES.has(command.executable)) return "unsafe_package_code_command";
  if (command.kind !== "test" && command.kind !== "build" && command.kind !== "lint" && command.kind !== "custom") {
    return "unsafe_package_code_command";
  }
  if (!Array.isArray(command.arguments) || command.arguments.length === 0 || command.arguments.length > 16) {
    return "unsafe_package_code_command";
  }
  if (command.arguments.some((argument) => !validArgument(argument))) return "unsafe_package_code_command";
  const normalized = command.arguments.map((argument) => argument.toLowerCase());
  if (normalized.some((argument) => LIFECYCLE_TERMS.has(argument))) return "lifecycle_script_rejected";
  if (normalized.some((argument) => argument === "exec" || argument === "x" || argument === "dlx" || argument === "-e" || argument === "--eval" || argument === "--script-shell")) {
    return "unsafe_package_code_command";
  }

  if (command.executable === "bun") {
    if (normalized[0] === "test" && command.kind === "test") return "ok";
    if (normalized[0] === "run" && ALLOWED_RUN_TARGETS.has(normalized[1] ?? "") && command.kind === normalized[1]) return "ok";
    return "unsafe_package_code_command";
  }
  if (normalized[0] === "test" && command.kind === "test") return "ok";
  if (normalized[0] === "run" && ALLOWED_RUN_TARGETS.has(normalized[1] ?? "") && command.kind === normalized[1]) return "ok";
  return "unsafe_package_code_command";
}

function preflightBase(
  timestamp: string,
  action: PluginPackagePlanActionRecord,
  trusted: TrustedAction | undefined,
  approval: NormalizedCodeApproval,
  installReceipt: PluginPackageInstallUpdateReceipt | undefined,
  command: PluginPackageCodeExecutionCommand,
): PluginPackageCodeExecutionPreflight {
  const definition = trusted?.definition;
  return {
    recordType: "mcp_plugin_package_code_execution_preflight",
    timestamp,
    status: "blocked",
    action: action.action === "import" || action.action === "update" ? action.action : "<blocked>",
    dryRun: false,
    hostActionRequired: false,
    packageExecuted: false,
    executorCalled: false,
    registryFetched: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
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
        id: safeLabel(definition.sidecarId),
        kind: safeLabel(definition.sidecarKind),
      },
    signature: trusted?.signature ?? "<redacted>",
    approval: {
      approved: approval.approved,
      ...(approval.approvedBy === undefined ? {} : { approvedBy: approval.approvedBy }),
      reason: "<redacted>",
    },
    installReceipt: summarizeInstallReceipt(installReceipt),
    hostAction: {
      type: "execute_plugin_package_code",
      command: summarizeCommand(command),
      maxAttempts: 1,
      destructive: false,
    },
    warnings: [...PREFLIGHT_WARNINGS],
  };
}

function summarizeInstallReceipt(
  receipt: PluginPackageInstallUpdateReceipt | undefined,
): PluginPackageCodeExecutionPreflight["installReceipt"] {
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

function summarizeCommand(command: PluginPackageCodeExecutionCommand): PluginPackageCodeExecutionPreflight["hostAction"]["command"] {
  return {
    executable: ALLOWED_EXECUTABLES.has(command.executable) ? command.executable : "<redacted>",
    arguments: Array.isArray(command.arguments) ? command.arguments.map((argument) => safeArgumentLabel(argument)).slice(0, 16) : [],
    kind: command.kind === "test" || command.kind === "build" || command.kind === "lint" || command.kind === "custom" ? command.kind : "<redacted>",
    cwd: "<redacted>",
  };
}

function block(
  base: PluginPackageCodeExecutionPreflight,
  reason: PluginPackageCodeExecutionBlockedReason,
): PluginPackageCodeExecutionPreflight {
  return freezePreflight({ ...base, status: "blocked", blockedReason: reason, hostActionRequired: false });
}

function normalizeApproval(value: unknown): NormalizedCodeApproval {
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

function confinedPackagePath(packageRoot: string, packagePath: string): string | undefined {
  const root = resolve(packageRoot);
  const candidate = resolve(packagePath);
  const pathFromRoot = relative(root, candidate);
  if (pathFromRoot.length === 0 || pathFromRoot.startsWith("..") || resolve(pathFromRoot) === pathFromRoot) {
    return undefined;
  }
  return candidate;
}

function validArgument(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 120
    && !/[\0\r\n]/.test(value)
    && !/[;&|<>`]/.test(value)
    && !/\$\(/.test(value)
    && !looksSecret(value);
}

function safeArgumentLabel(value: unknown): string {
  if (typeof value !== "string" || !validArgument(value)) return "<redacted>";
  return safeLabel(value);
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

function freezePreflight<T extends PluginPackageCodeExecutionPreflight>(preflight: T): T {
  return Object.freeze({
    ...preflight,
    package: Object.freeze({ ...preflight.package }),
    sidecar: Object.freeze({ ...preflight.sidecar }),
    approval: Object.freeze({ ...preflight.approval }),
    installReceipt: Object.freeze({ ...preflight.installReceipt }),
    hostAction: Object.freeze({
      ...preflight.hostAction,
      command: Object.freeze({
        ...preflight.hostAction.command,
        arguments: Object.freeze([...preflight.hostAction.command.arguments]),
      }),
    }),
    warnings: Object.freeze([...preflight.warnings]),
  }) as T;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
