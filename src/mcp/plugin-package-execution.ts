import { relative, resolve } from "path";

import type { PluginPackagePlanAction, PluginPackagePlanActionRecord } from "./plugin-package-discovery";
import { normalizePluginMcpSidecarDefinition, pluginMcpSidecarTrustSignature } from "./plugin-sidecar-config";
import type { NormalizedPluginMcpSidecarDefinition } from "./plugin-sidecar-config";

export type PluginPackageInstallUpdateExecutable = "bun" | "npm";

export interface PluginPackageInstallUpdateCommand {
  executable: PluginPackageInstallUpdateExecutable;
  arguments: string[];
}

export interface PluginPackageInstallUpdateExecutorRequest {
  executable: PluginPackageInstallUpdateExecutable;
  arguments: string[];
  cwd: string;
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

export interface PluginPackageInstallUpdateExecutorResult {
  code: number;
  stdout?: string;
  stderr?: string;
}

export type PluginPackageInstallUpdateExecutor = (
  request: PluginPackageInstallUpdateExecutorRequest,
) => Promise<PluginPackageInstallUpdateExecutorResult> | PluginPackageInstallUpdateExecutorResult;

export interface PluginPackageInstallUpdateApproval {
  approved: boolean;
  signature: string;
  approvedBy?: string;
  reason?: string;
}

export type PluginPackageInstallUpdateBlockedReason =
  | "approval_required"
  | "approval_signature_mismatch"
  | "unsupported_action"
  | "invalid_plugin_signature"
  | "invalid_sidecar_kind"
  | "package_path_escape"
  | "invalid_install_command"
  | "executor_failed";

export interface PluginPackageInstallUpdateRequest {
  action: PluginPackagePlanActionRecord;
  approval: PluginPackageInstallUpdateApproval;
  packageRoot: string;
  packagePath: string;
  commands?: PluginPackageInstallUpdateCommand[];
  executor: PluginPackageInstallUpdateExecutor;
  timestamp?: string | Date;
}

export interface PluginPackageInstallUpdateStepReceipt {
  executable: PluginPackageInstallUpdateExecutable;
  arguments: string[];
  cwd: "<redacted>";
  code: number;
  stdoutPreview: string;
  stderrPreview: string;
}

export interface PluginPackageInstallUpdateReceipt {
  recordType: "mcp_plugin_package_install_update_receipt";
  timestamp: string;
  status: "completed" | "failed" | "blocked";
  blockedReason?: PluginPackageInstallUpdateBlockedReason;
  action: Extract<PluginPackagePlanAction, "import" | "update"> | "<blocked>";
  dryRun: false;
  activation: false;
  sidecarStarted: false;
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
  steps: PluginPackageInstallUpdateStepReceipt[];
  warnings: string[];
}

interface NormalizedPluginPackageInstallUpdateApproval {
  approved: boolean;
  signature: string;
  approvedBy?: string;
  reason: "<redacted>";
}

const EXECUTION_WARNINGS = [
  "Plugin package install/update execution is approval-gated and uses an injected executor.",
  "Lifecycle scripts are disabled by policy with --ignore-scripts.",
  "Execution receipts do not activate plugin catalog records, start sidecars, fetch registries, or persist credentials.",
];
const ALLOWED_EXECUTABLES = new Set<PluginPackageInstallUpdateExecutable>(["bun", "npm"]);
const FORBIDDEN_ARGUMENTS = new Set([
  "run",
  "exec",
  "x",
  "dlx",
  "start",
  "node",
  "sh",
  "bash",
  "cmd",
  "powershell",
  "pwsh",
  "postinstall",
  "preinstall",
  "prepare",
]);

export async function executeApprovedPluginPackageInstallUpdate(
  request: PluginPackageInstallUpdateRequest,
): Promise<PluginPackageInstallUpdateReceipt> {
  const timestamp = toIso(request.timestamp ?? new Date());
  const trusted = trustedAction(request.action);
  const base = receiptBase(timestamp, request.action, trusted, normalizeApproval(request.approval), []);

  if (request.action.action !== "import" && request.action.action !== "update") {
    return block(base, "unsupported_action");
  }
  if (trusted === undefined) {
    return block(base, "invalid_plugin_signature");
  }
  if (trusted.definition.sidecarKind === "unknown") {
    return block(base, "invalid_sidecar_kind");
  }
  const approval = normalizeApproval(request.approval);
  if (!approval.approved) {
    return block(receiptBase(timestamp, request.action, trusted, approval, []), "approval_required");
  }
  if (approval.signature !== trusted.signature) {
    return block(receiptBase(timestamp, request.action, trusted, approval, []), "approval_signature_mismatch");
  }
  const packageCwd = confinedPackagePath(request.packageRoot, request.packagePath);
  if (packageCwd === undefined) {
    return block(receiptBase(timestamp, request.action, trusted, approval, []), "package_path_escape");
  }
  const commands = request.commands ?? defaultInstallCommands();
  if (!Array.isArray(commands) || commands.length === 0 || commands.length > 4 || commands.some((command) => !validInstallCommand(command))) {
    return block(receiptBase(timestamp, request.action, trusted, approval, []), "invalid_install_command");
  }

  const steps: PluginPackageInstallUpdateStepReceipt[] = [];
  for (const command of commands) {
    let result: PluginPackageInstallUpdateExecutorResult;
    try {
      result = await request.executor({
        executable: command.executable,
        arguments: [...command.arguments],
        cwd: packageCwd,
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

    const code = safeCode(result.code);
    steps.push({
      executable: command.executable,
      arguments: safeArguments(command.arguments),
      cwd: "<redacted>",
      code,
      stdoutPreview: safePreview(result.stdout),
      stderrPreview: safePreview(result.stderr),
    });
    if (code !== 0) {
      return {
        ...receiptBase(timestamp, request.action, trusted, approval, steps),
        status: "failed",
        blockedReason: "executor_failed",
      };
    }
  }

  return {
    ...receiptBase(timestamp, request.action, trusted, approval, steps),
    status: "completed",
  };
}

function trustedAction(
  action: PluginPackagePlanActionRecord,
): { signature: string; definition: NormalizedPluginMcpSidecarDefinition } | undefined {
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
  trusted: { signature: string; definition: NormalizedPluginMcpSidecarDefinition } | undefined,
  approval: NormalizedPluginPackageInstallUpdateApproval,
  steps: PluginPackageInstallUpdateStepReceipt[],
): PluginPackageInstallUpdateReceipt {
  return {
    recordType: "mcp_plugin_package_install_update_receipt",
    timestamp,
    status: "blocked",
    action: action.action === "import" || action.action === "update" ? action.action : "<blocked>",
    dryRun: false,
    activation: false,
    sidecarStarted: false,
    registryFetched: false,
    package: trusted === undefined
      ? {
        name: safeLabel(action.package?.name),
        version: safeLabel(action.package?.version),
        source: "<redacted>",
        digest: safeDigest(action.package?.digest),
      }
      : {
        name: safeLabel(trusted.definition.packageName),
        version: safeLabel(trusted.definition.packageVersion),
        source: "<redacted>",
        digest: safeDigest(trusted.definition.packageDigest),
      },
    sidecar: trusted === undefined
      ? {
        id: safeLabel(action.sidecar?.id),
        kind: safeLabel(action.sidecar?.kind),
      }
      : {
        id: safeLabel(trusted.definition.id),
        kind: safeLabel(trusted.definition.sidecarKind),
      },
    signature: trusted?.signature ?? "<redacted>",
    approval: {
      approved: approval.approved,
      ...(approval.approvedBy === undefined ? {} : { approvedBy: approval.approvedBy }),
      reason: "<redacted>",
    },
    steps,
    warnings: [...EXECUTION_WARNINGS],
  };
}

function block(
  base: PluginPackageInstallUpdateReceipt,
  reason: PluginPackageInstallUpdateBlockedReason,
): PluginPackageInstallUpdateReceipt {
  return {
    ...base,
    status: "blocked",
    blockedReason: reason,
    steps: [],
  };
}

function normalizeApproval(value: unknown): NormalizedPluginPackageInstallUpdateApproval {
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

function defaultInstallCommands(): PluginPackageInstallUpdateCommand[] {
  return [{ executable: "bun", arguments: ["install", "--ignore-scripts", "--frozen-lockfile"] }];
}

function validInstallCommand(command: PluginPackageInstallUpdateCommand): boolean {
  if (!isPlainRecord(command) || !ALLOWED_EXECUTABLES.has(command.executable)) return false;
  if (!Array.isArray(command.arguments) || command.arguments.length === 0 || command.arguments.length > 32) return false;
  if (command.arguments.some((argument) => !validArgument(argument))) return false;
  const normalized = command.arguments.map((argument) => argument.toLowerCase());
  if (!normalized.includes("--ignore-scripts")) return false;
  if (normalized.some((argument) => FORBIDDEN_ARGUMENTS.has(argument))) return false;
  if (command.executable === "bun") {
    return normalized[0] === "install";
  }
  return normalized[0] === "install" || normalized[0] === "ci";
}

function validArgument(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 160
    && !/[\0\r\n]/.test(value)
    && !/[;&|<>`]/.test(value)
    && !/\$\(/.test(value)
    && !looksSecret(value);
}

function safeArguments(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => safeLabel(value)).slice(0, 32);
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
