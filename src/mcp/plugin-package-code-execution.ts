import { relative, resolve } from "path";

import type { PluginPackagePlanAction, PluginPackagePlanActionRecord } from "./plugin-package-discovery";
import {
  createPluginPackageCodeExecutionPreflight,
  type PluginPackageCodeExecutionApproval,
  type PluginPackageCodeExecutionCommand,
  type PluginPackageCodeExecutionPreflight,
} from "./plugin-package-code-execution-policy";
import type { PluginPackageInstallUpdateReceipt } from "./plugin-package-execution";
import { normalizePluginMcpSidecarDefinition, pluginMcpSidecarTrustSignature } from "./plugin-sidecar-config";
import type { NormalizedPluginMcpSidecarDefinition } from "./plugin-sidecar-config";

export interface PluginPackageCodeExecutionExecutorRequest {
  executable: "bun" | "npm";
  arguments: string[];
  cwd: string;
  kind: "test" | "build" | "lint" | "custom";
  package: {
    name: string;
    version: string;
    digest: string;
  };
  sidecar: {
    id: string;
    kind: string;
  };
  signature: string;
}

export interface PluginPackageCodeExecutionExecutorResult {
  code: number;
  stdout?: string;
  stderr?: string;
}

export type PluginPackageCodeExecutionExecutor = (
  request: PluginPackageCodeExecutionExecutorRequest,
) => Promise<PluginPackageCodeExecutionExecutorResult> | PluginPackageCodeExecutionExecutorResult;

export type PluginPackageCodeExecutionReceiptBlockedReason =
  | "approval_required"
  | "approval_signature_mismatch"
  | "unsupported_action"
  | "invalid_plugin_signature"
  | "invalid_sidecar_kind"
  | "install_receipt_required"
  | "install_receipt_mismatch"
  | "package_path_escape"
  | "lifecycle_script_rejected"
  | "unsafe_package_code_command"
  | "preflight_required"
  | "preflight_mismatch"
  | "executor_failed";

export interface PluginPackageCodeExecutionRequest {
  action: PluginPackagePlanActionRecord;
  installReceipt?: PluginPackageInstallUpdateReceipt;
  preflight?: PluginPackageCodeExecutionPreflight;
  approval: PluginPackageCodeExecutionApproval;
  packageRoot: string;
  packagePath: string;
  executor: PluginPackageCodeExecutionExecutor;
  timestamp?: string | Date;
}

export interface PluginPackageCodeExecutionStepReceipt {
  executable: "bun" | "npm" | "<redacted>";
  arguments: string[];
  kind: "test" | "build" | "lint" | "custom" | "<redacted>";
  cwd: "<redacted>";
  code: number;
  stdoutPreview: string;
  stderrPreview: string;
}

export interface PluginPackageCodeExecutionReceipt {
  recordType: "mcp_plugin_package_code_execution_receipt";
  timestamp: string;
  status: "completed" | "failed" | "blocked";
  blockedReason?: PluginPackageCodeExecutionReceiptBlockedReason;
  action: Extract<PluginPackagePlanAction, "import" | "update"> | "<blocked>";
  dryRun: false;
  hostActionRequired: false;
  packageExecuted: boolean;
  executorCalled: boolean;
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
  preflight: {
    present: boolean;
    recordType: string;
    status: string;
    signature: string;
    command: {
      executable: "bun" | "npm" | "<redacted>";
      arguments: string[];
      kind: "test" | "build" | "lint" | "custom" | "<redacted>";
      cwd: "<redacted>";
    };
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
  step: PluginPackageCodeExecutionStepReceipt;
  warnings: string[];
}

type TrustedAction = {
  signature: string;
  definition: NormalizedPluginMcpSidecarDefinition;
};

type NormalizedApproval = {
  approved: boolean;
  signature: string;
  approvedBy?: string;
  reason: "<redacted>";
};

const EXECUTION_WARNINGS = [
  "Plugin package code execution is approval-gated and uses an injected host executor.",
  "Execution requires a ready package-code preflight for the same trusted plugin package signature.",
  "Execution receipts do not fetch registries, activate sidecars, mutate catalogs, or persist credentials.",
];

export async function executeApprovedPluginPackageCodeAction(
  request: PluginPackageCodeExecutionRequest,
): Promise<PluginPackageCodeExecutionReceipt> {
  const timestamp = toIso(request.timestamp ?? new Date());
  const trusted = trustedAction(request.action);
  const approval = normalizeApproval(request.approval);
  const base = receiptBase(timestamp, request.action, trusted, approval, request.installReceipt, request.preflight);

  if (request.action.action !== "import" && request.action.action !== "update") {
    return block(base, "unsupported_action");
  }
  if (trusted === undefined) {
    return block(base, "invalid_plugin_signature");
  }
  if (trusted.definition.sidecarKind === "unknown") {
    return block(receiptBase(timestamp, request.action, trusted, approval, request.installReceipt, request.preflight), "invalid_sidecar_kind");
  }
  if (!approval.approved) {
    return block(receiptBase(timestamp, request.action, trusted, approval, request.installReceipt, request.preflight), "approval_required");
  }
  if (approval.signature !== trusted.signature) {
    return block(receiptBase(timestamp, request.action, trusted, approval, request.installReceipt, request.preflight), "approval_signature_mismatch");
  }
  const packageCwd = confinedPackagePath(request.packageRoot, request.packagePath);
  if (packageCwd === undefined) {
    return block(receiptBase(timestamp, request.action, trusted, approval, request.installReceipt, request.preflight), "package_path_escape");
  }
  if (request.preflight === undefined || !isPlainRecord(request.preflight)) {
    return block(receiptBase(timestamp, request.action, trusted, approval, request.installReceipt, request.preflight), "preflight_required");
  }
  if (request.preflight.status !== "ready") {
    return block(
      receiptBase(timestamp, request.action, trusted, approval, request.installReceipt, request.preflight),
      request.preflight.blockedReason ?? "preflight_required",
    );
  }
  const command = commandFromPreflight(request.preflight);
  if (command === undefined) {
    return block(receiptBase(timestamp, request.action, trusted, approval, request.installReceipt, request.preflight), "preflight_mismatch");
  }
  const recreated = createPluginPackageCodeExecutionPreflight({
    action: request.action,
    installReceipt: request.installReceipt,
    approval: request.approval,
    packageRoot: request.packageRoot,
    packagePath: request.packagePath,
    command,
    timestamp: request.preflight.timestamp,
  });
  if (JSON.stringify(recreated) !== JSON.stringify(request.preflight)) {
    return block(receiptBase(timestamp, request.action, trusted, approval, request.installReceipt, request.preflight), "preflight_mismatch");
  }
  if (!request.executor || typeof request.executor !== "function") {
    return failed(receiptBase(timestamp, request.action, trusted, approval, request.installReceipt, request.preflight), undefined);
  }

  let result: PluginPackageCodeExecutionExecutorResult;
  try {
    result = await request.executor({
      executable: command.executable,
      arguments: [...command.arguments],
      cwd: packageCwd,
      kind: command.kind,
      package: {
        name: trusted.definition.packageName,
        version: trusted.definition.packageVersion,
        digest: trusted.definition.packageDigest,
      },
      sidecar: {
        id: trusted.definition.id,
        kind: trusted.definition.sidecarKind,
      },
      signature: trusted.signature,
    });
  } catch {
    result = { code: 1, stdout: "", stderr: "executor failed" };
  }

  const step = stepReceipt(command, result);
  if (step.code !== 0) {
    return failed(receiptBase(timestamp, request.action, trusted, approval, request.installReceipt, request.preflight, step), step);
  }

  return {
    ...receiptBase(timestamp, request.action, trusted, approval, request.installReceipt, request.preflight, step),
    status: "completed",
    packageExecuted: true,
    executorCalled: true,
  };
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
  approval: NormalizedApproval,
  installReceipt: PluginPackageInstallUpdateReceipt | undefined,
  preflight: PluginPackageCodeExecutionPreflight | undefined,
  step?: PluginPackageCodeExecutionStepReceipt,
): PluginPackageCodeExecutionReceipt {
  const definition = trusted?.definition;
  return {
    recordType: "mcp_plugin_package_code_execution_receipt",
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
        id: safeLabel(definition.id),
        kind: safeLabel(definition.sidecarKind),
      },
    signature: trusted?.signature ?? "<redacted>",
    approval: {
      approved: approval.approved,
      ...(approval.approvedBy === undefined ? {} : { approvedBy: approval.approvedBy }),
      reason: "<redacted>",
    },
    preflight: summarizePreflight(preflight),
    installReceipt: summarizeInstallReceipt(installReceipt),
    step: step ?? emptyStep(preflight),
    warnings: [...EXECUTION_WARNINGS],
  };
}

function block(
  base: PluginPackageCodeExecutionReceipt,
  reason: PluginPackageCodeExecutionReceiptBlockedReason,
): PluginPackageCodeExecutionReceipt {
  return {
    ...base,
    status: "blocked",
    blockedReason: reason,
    packageExecuted: false,
    executorCalled: false,
  };
}

function failed(
  base: PluginPackageCodeExecutionReceipt,
  step: PluginPackageCodeExecutionStepReceipt | undefined,
): PluginPackageCodeExecutionReceipt {
  return {
    ...base,
    status: "failed",
    blockedReason: "executor_failed",
    packageExecuted: true,
    executorCalled: true,
    ...(step === undefined ? {} : { step }),
  };
}

function commandFromPreflight(preflight: PluginPackageCodeExecutionPreflight): PluginPackageCodeExecutionCommand | undefined {
  const command = preflight.hostAction?.command;
  if (!isPlainRecord(command)) return undefined;
  if (command.executable !== "bun" && command.executable !== "npm") return undefined;
  if (command.kind !== "test" && command.kind !== "build" && command.kind !== "lint" && command.kind !== "custom") return undefined;
  if (!Array.isArray(command.arguments) || command.arguments.some((argument) => typeof argument !== "string" || argument === "<redacted>")) {
    return undefined;
  }
  return {
    executable: command.executable,
    arguments: [...command.arguments],
    kind: command.kind,
  };
}

function stepReceipt(
  command: PluginPackageCodeExecutionCommand,
  result: PluginPackageCodeExecutionExecutorResult,
): PluginPackageCodeExecutionStepReceipt {
  return {
    executable: command.executable,
    arguments: safeArguments(command.arguments),
    kind: command.kind,
    cwd: "<redacted>",
    code: safeCode(result.code),
    stdoutPreview: safePreview(result.stdout),
    stderrPreview: safePreview(result.stderr),
  };
}

function emptyStep(preflight: PluginPackageCodeExecutionPreflight | undefined): PluginPackageCodeExecutionStepReceipt {
  const command = preflight === undefined ? undefined : commandFromPreflight(preflight);
  return {
    executable: command?.executable ?? "<redacted>",
    arguments: command === undefined ? [] : safeArguments(command.arguments),
    kind: command?.kind ?? "<redacted>",
    cwd: "<redacted>",
    code: 1,
    stdoutPreview: "",
    stderrPreview: "",
  };
}

function summarizePreflight(
  preflight: PluginPackageCodeExecutionPreflight | undefined,
): PluginPackageCodeExecutionReceipt["preflight"] {
  if (preflight === undefined || !isPlainRecord(preflight)) {
    return {
      present: false,
      recordType: "<missing>",
      status: "<missing>",
      signature: "<redacted>",
      command: { executable: "<redacted>", arguments: [], kind: "<redacted>", cwd: "<redacted>" },
    };
  }
  const command = commandFromPreflight(preflight);
  return {
    present: true,
    recordType: preflight.recordType === "mcp_plugin_package_code_execution_preflight" ? preflight.recordType : "<redacted>",
    status: safeLabel(preflight.status),
    signature: safeSignature(preflight.signature) ?? "<redacted>",
    command: {
      executable: command?.executable ?? "<redacted>",
      arguments: command === undefined ? [] : safeArguments(command.arguments),
      kind: command?.kind ?? "<redacted>",
      cwd: "<redacted>",
    },
  };
}

function summarizeInstallReceipt(
  receipt: PluginPackageInstallUpdateReceipt | undefined,
): PluginPackageCodeExecutionReceipt["installReceipt"] {
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

function normalizeApproval(value: unknown): NormalizedApproval {
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

function safeArguments(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => safeLabel(value)).slice(0, 16);
}

function safeCode(value: unknown): number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= 255 ? value : 1;
}

function safePreview(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "";
  const clean = value.replace(/[\0\r]/g, "").slice(0, 240);
  if (looksSecret(clean) || /SHOULD_NOT_LEAK/i.test(clean)) return "<redacted>";
  return clean
    .replace(/bearer\s+[A-Za-z0-9._=-]+/gi, "bearer <redacted>")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-<redacted>")
    .replace(/token[=:]\s*[A-Za-z0-9._=-]+/gi, "token=<redacted>");
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
  return /(secret|token|password|credential|bearer|api[_-]?key|SHOULD_NOT_LEAK)/i.test(value);
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
