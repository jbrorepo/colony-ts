import { relative, resolve } from "path";

import {
  planPluginPackageManifest,
  type PluginPackagePlanAction,
  type PluginPackagePlannerOptions,
} from "./plugin-package-discovery";
import type { PluginPackageInstallUpdateCommand } from "./plugin-package-execution";
import type { PluginPackageMarketplaceCatalogEntry } from "./plugin-package-marketplace";

export type PluginPackageMarketplaceInstallUpdateHandoffStatus = "ready" | "blocked";

export type PluginPackageMarketplaceInstallUpdateHandoffBlockedReason =
  | "entry_not_found"
  | "action_not_installable"
  | "approval_signature_mismatch"
  | "package_path_escape"
  | "invalid_install_command";

export interface PluginPackageMarketplaceInstallUpdateHandoffRequest {
  catalogId: string;
  entries: PluginPackageMarketplaceCatalogEntry[];
  entryId: string;
  installedSignatures?: PluginPackagePlannerOptions["installedSignatures"];
  approvalSignature: string;
  packageRoot: string;
  packagePath: string;
  commands?: PluginPackageInstallUpdateCommand[];
  approvedBy?: string;
  timestamp?: string | Date;
}

export interface PluginPackageMarketplaceInstallUpdateHandoff {
  recordType: "mcp_plugin_package_install_update_handoff";
  timestamp: string;
  status: PluginPackageMarketplaceInstallUpdateHandoffStatus;
  blockedReason?: PluginPackageMarketplaceInstallUpdateHandoffBlockedReason;
  catalogId: string;
  entry: {
    entryId: string;
    displayName: string;
  };
  action: Extract<PluginPackagePlanAction, "import" | "update"> | "<blocked>";
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
    required: true;
    signature: string;
    approvedBy?: string;
  };
  hostAction: {
    kind: "plugin_package_install_update";
    executorPath: "executeApprovedPluginPackageInstallUpdate";
    requiresInjectedExecutor: true;
    packageRoot: "<redacted>";
    packagePath: "<redacted>";
  };
  commands: PluginPackageInstallUpdateCommand[];
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
  "Marketplace install/update handoff is a redacted host-action descriptor only.",
  "The handoff requires explicit approval plus an injected executor before any install/update can occur.",
  "The handoff does not fetch registries, install packages, execute package code, activate sidecars, mutate catalogs, or persist credentials.",
];
const ALLOWED_EXECUTABLES = new Set(["bun", "npm"]);
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

export function createPluginPackageMarketplaceInstallUpdateHandoff(
  request: PluginPackageMarketplaceInstallUpdateHandoffRequest,
): PluginPackageMarketplaceInstallUpdateHandoff {
  const timestamp = toIso(request.timestamp ?? new Date());
  const entry = selectEntry(request.entries, request.entryId);
  if (entry === undefined) {
    return block(base(timestamp, request, undefined, undefined, defaultInstallCommands()), "entry_not_found");
  }

  const plan = planPluginPackageManifest(entry.manifest, { installedSignatures: request.installedSignatures });
  const action = plan.actions[0];
  const commands = request.commands ?? defaultInstallCommands();
  if (action === undefined || (action.action !== "import" && action.action !== "update")) {
    return block(base(timestamp, request, entry, action, safeCommands(commands)), "action_not_installable");
  }

  const baseRecord = base(timestamp, request, entry, action, safeCommands(commands));
  if (request.approvalSignature !== action.signature) {
    return block(baseRecord, "approval_signature_mismatch");
  }
  if (confinedPackagePath(request.packageRoot, request.packagePath) === undefined) {
    return block(baseRecord, "package_path_escape");
  }
  if (!Array.isArray(commands) || commands.length === 0 || commands.length > 4 || commands.some((command) => !validInstallCommand(command))) {
    return block(baseRecord, "invalid_install_command");
  }

  return {
    ...baseRecord,
    status: "ready",
  };
}

function base(
  timestamp: string,
  request: PluginPackageMarketplaceInstallUpdateHandoffRequest,
  entry: PluginPackageMarketplaceCatalogEntry | undefined,
  action: ReturnType<typeof planPluginPackageManifest>["actions"][number] | undefined,
  commands: PluginPackageInstallUpdateCommand[],
): PluginPackageMarketplaceInstallUpdateHandoff {
  const source = action?.package ?? {
    name: entry?.manifest?.packageName,
    version: entry?.manifest?.packageVersion,
    digest: entry?.manifest?.packageDigest,
  };
  return {
    recordType: "mcp_plugin_package_install_update_handoff",
    timestamp,
    status: "blocked",
    catalogId: safeId(request.catalogId),
    entry: {
      entryId: safeId(entry?.entryId),
      displayName: safeLabel(entry?.displayName),
    },
    action: action?.action === "import" || action?.action === "update" ? action.action : "<blocked>",
    package: {
      name: safeLabel(source.name),
      version: safeLabel(source.version),
      source: "<redacted>",
      digest: safeDigest(source.digest),
    },
    sidecar: {
      id: safeLabel(action?.sidecar?.id),
      kind: safeLabel(action?.sidecar?.kind),
    },
    approval: {
      required: true,
      signature: safeSignature(action?.signature),
      ...(request.approvedBy === undefined ? {} : { approvedBy: safeLabel(request.approvedBy) }),
    },
    hostAction: {
      kind: "plugin_package_install_update",
      executorPath: "executeApprovedPluginPackageInstallUpdate",
      requiresInjectedExecutor: true,
      packageRoot: "<redacted>",
      packagePath: "<redacted>",
    },
    commands,
    networkFetched: false,
    packageInstalled: false,
    packageExecuted: false,
    activation: false,
    sidecarStarted: false,
    catalogMutated: false,
    credentialsPersisted: false,
    warnings: [...HANDOFF_WARNINGS],
  };
}

function block(
  record: PluginPackageMarketplaceInstallUpdateHandoff,
  reason: PluginPackageMarketplaceInstallUpdateHandoffBlockedReason,
): PluginPackageMarketplaceInstallUpdateHandoff {
  return {
    ...record,
    status: "blocked",
    blockedReason: reason,
  };
}

function selectEntry(
  entries: PluginPackageMarketplaceCatalogEntry[],
  entryId: string,
): PluginPackageMarketplaceCatalogEntry | undefined {
  if (!Array.isArray(entries) || !safeId(entryId)) return undefined;
  return entries.find((entry) => entry.entryId === entryId);
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
  if (command.executable === "bun") return normalized[0] === "install";
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

function safeCommands(commands: unknown): PluginPackageInstallUpdateCommand[] {
  if (!Array.isArray(commands)) return [];
  return commands.slice(0, 4).map((command) => {
    if (!isPlainRecord(command)) return { executable: "bun", arguments: [] };
    return {
      executable: command.executable === "npm" ? "npm" : "bun",
      arguments: Array.isArray(command.arguments)
        ? command.arguments.map(safeLabel).slice(0, 32)
        : [],
    };
  });
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
