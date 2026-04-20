/**
 * Tool permission system for The Colony agent runtime.
 *
 * 1:1 port of colony/runtime/tool_permissions.py — provides per-agent
 * and per-caste tool allowlists, denylists, and execution policies for
 * shell commands, HTTP requests, and file access.
 *
 * Permission resolution priority:
 *   agent-specific  >  caste-specific  >  global defaults
 */

import { normalize, basename, extname, isAbsolute } from "path";
import {
  PermissionBehavior,
  PermissionReasonSource,
  createPermissionDecision,
  type PermissionDecision,
} from "../security/permission-decision";
import { BashSecurityClassifier } from "./bash-security-classifier";
import { BashValidatorPipeline } from "../security/bash-validator";

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

export class PermissionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

// ---------------------------------------------------------------------------
// Policy models
// ---------------------------------------------------------------------------

export interface ShellPolicy {
  allowedCommands: string[];
  blockedCommands: string[];
  blockedPatterns: string[];
  maxOutputBytes: number;
  maxTimeoutSeconds: number;
}

export interface HttpPolicy {
  allowedDomains: string[];
  blockedDomains: string[];
  allowedSchemes: string[];
  maxResponseBytes: number;
  maxTimeoutSeconds: number;
  blockPrivateIps: boolean;
}

export interface FilePolicy {
  allowedPaths: string[];
  blockedPaths: string[];
  maxFileSizeBytes: number;
  allowedExtensions: string[];
  blockedExtensions: string[];
}

// ---------------------------------------------------------------------------
// Default policy factories
// ---------------------------------------------------------------------------

export function defaultShellPolicy(): ShellPolicy {
  return {
    allowedCommands: [],
    blockedCommands: [
      "sudo", "su", "chmod 777*", "chown*", "mount*", "umount*",
      "dd*", "mkfs*", "fdisk*", "shutdown*", "reboot*", "init*",
    ],
    blockedPatterns: [
      String.raw`rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|--force\s+)*/\s*$`,
      String.raw`rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|--force\s+)*/[a-z]+`,
      String.raw`>\s*/dev/sd`,
      String.raw`:\(\)\s*\{`,
      String.raw`\|\s*sh\b`,
      String.raw`curl\s+.*\|\s*bash`,
      String.raw`wget\s+.*\|\s*bash`,
    ],
    maxOutputBytes: 1_048_576,
    maxTimeoutSeconds: 120,
  };
}

export function defaultHttpPolicy(): HttpPolicy {
  return {
    allowedDomains: [],
    blockedDomains: [
      "169.254.169.254",     // AWS metadata
      "metadata.google.internal", // GCP metadata
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "[::]",
      "[::1]",
    ],
    allowedSchemes: ["http", "https"],
    maxResponseBytes: 1_048_576,
    maxTimeoutSeconds: 60,
    blockPrivateIps: true,
  };
}

export function defaultFilePolicy(): FilePolicy {
  return {
    allowedPaths: [],
    blockedPaths: [
      ".*",           // hidden files/dirs
      "__pycache__/*",
      "*.pyc",
      ".git/*",
      ".env",
      "*.key",
      "*.pem",
      "*.cert",
    ],
    maxFileSizeBytes: 52_428_800,
    allowedExtensions: [],
    blockedExtensions: [".exe", ".dll", ".so", ".dylib", ".bin"],
  };
}

// ---------------------------------------------------------------------------
// ToolPermissions
// ---------------------------------------------------------------------------

export interface ToolPermissions {
  agentId: string;
  caste: string;
  allowlist: string[];
  denylist: string[];
  shellPolicy: ShellPolicy;
  httpPolicy: HttpPolicy;
  filePolicy: FilePolicy;
}

export function defaultToolPermissions(
  overrides: Partial<ToolPermissions> = {},
): ToolPermissions {
  return {
    agentId: overrides.agentId ?? "",
    caste: overrides.caste ?? "",
    allowlist: overrides.allowlist ?? [],
    denylist: overrides.denylist ?? [],
    shellPolicy: overrides.shellPolicy ?? defaultShellPolicy(),
    httpPolicy: overrides.httpPolicy ?? defaultHttpPolicy(),
    filePolicy: overrides.filePolicy ?? defaultFilePolicy(),
  };
}

// ---------------------------------------------------------------------------
// Caste default permissions — 1:1 with Python _get_caste_defaults()
// ---------------------------------------------------------------------------

function getCasteDefaults(): Record<string, ToolPermissions> {
  return {
    // Root Queen — full access, no restrictions
    root_queen: defaultToolPermissions({
      caste: "root_queen",
      shellPolicy: { ...defaultShellPolicy(), blockedCommands: [], blockedPatterns: [] },
      httpPolicy: { ...defaultHttpPolicy(), blockedDomains: [] },
      filePolicy: { ...defaultFilePolicy(), blockedPaths: [], blockedExtensions: [] },
    }),

    // Eldest Architect — broad access for system design
    eldest_architect: defaultToolPermissions({ caste: "eldest_architect" }),

    // Assist-Ant — user-facing, HTTP and file access, limited shell
    assist_ant: defaultToolPermissions({
      caste: "assist_ant",
      denylist: ["shell_exec"],
    }),

    // Shield Generals — security caste, broader shell access
    shield_generals: defaultToolPermissions({
      caste: "shield_generals",
      shellPolicy: {
        ...defaultShellPolicy(),
        blockedCommands: ["sudo", "su", "shutdown*", "reboot*"],
      },
      filePolicy: { ...defaultFilePolicy(), blockedPaths: [], blockedExtensions: [] },
    }),

    // Watcher Swarm — monitoring, read-heavy, limited writes
    watcher_swarm: defaultToolPermissions({
      caste: "watcher_swarm",
      shellPolicy: {
        ...defaultShellPolicy(),
        allowedCommands: [
          "cat", "grep", "find", "ls", "ps", "top", "df", "du",
          "head", "tail", "wc", "curl", "dig", "nslookup",
          "ping", "traceroute", "netstat", "ss",
        ],
      },
    }),

    // Forge Carvers — builders, full file access, moderate shell
    forge_carvers: defaultToolPermissions({
      caste: "forge_carvers",
      filePolicy: { ...defaultFilePolicy(), blockedExtensions: [] },
    }),

    // Core Shapers — infrastructure, broad access
    core_shapers: defaultToolPermissions({ caste: "core_shapers" }),

    // Liaison Ants — communication-focused, HTTP yes, limited shell/file
    liaison_ants: defaultToolPermissions({
      caste: "liaison_ants",
      denylist: ["shell_exec"],
    }),

    // Ledger Ants — data/accounting, read-heavy
    ledger_ants: defaultToolPermissions({
      caste: "ledger_ants",
      shellPolicy: {
        ...defaultShellPolicy(),
        allowedCommands: [
          "cat", "grep", "wc", "sort", "uniq", "awk", "sed", "head", "tail", "cut",
        ],
      },
    }),

    // Lore Burrow — knowledge/documentation, read-heavy
    lore_burrow: defaultToolPermissions({
      caste: "lore_burrow",
      shellPolicy: {
        ...defaultShellPolicy(),
        allowedCommands: ["cat", "grep", "find", "ls", "head", "tail", "wc"],
      },
    }),

    // Nameless Swarm — adversarial testing, restricted by default
    nameless_swarm: defaultToolPermissions({
      caste: "nameless_swarm",
      denylist: ["shell_exec"],
      httpPolicy: { ...defaultHttpPolicy(), allowedDomains: [] },
      filePolicy: { ...defaultFilePolicy(), allowedPaths: ["data/*", "temp/*"] },
    }),
  };
}

// ---------------------------------------------------------------------------
// Glob matching (fnmatch equivalent)
// ---------------------------------------------------------------------------

function globMatch(text: string, pattern: string): boolean {
  // Convert glob to regex
  let regex = "^";
  for (const ch of pattern) {
    if (ch === "*") regex += ".*";
    else if (ch === "?") regex += ".";
    else if (ch === "[") regex += "[";
    else if (ch === "]") regex += "]";
    else regex += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  regex += "$";
  return new RegExp(regex).test(text);
}

// ---------------------------------------------------------------------------
// ToolPermissionChecker
// ---------------------------------------------------------------------------

export class ToolPermissionChecker {
  private _global: ToolPermissions;
  private _agentPermissions = new Map<string, ToolPermissions>();
  private _castePermissions = new Map<string, ToolPermissions>();
  private _casteDefaults: Record<string, ToolPermissions>;
  private _bashClassifier = new BashSecurityClassifier();
  private _bashValidatorPipeline = new BashValidatorPipeline();

  constructor(globalPermissions?: ToolPermissions) {
    this._global = globalPermissions ?? defaultToolPermissions();
    this._casteDefaults = getCasteDefaults();
  }

  // -- Configuration ------------------------------------------------------

  setAgentPermissions(agentId: string, permissions: ToolPermissions): void {
    this._agentPermissions.set(agentId, permissions);
  }

  setCastePermissions(caste: string, permissions: ToolPermissions): void {
    const casteKey = caste.toLowerCase().replace(/ /g, "_");
    this._castePermissions.set(casteKey, permissions);
  }

  getEffectivePermissions(agentId = "", caste = ""): ToolPermissions {
    if (agentId && this._agentPermissions.has(agentId)) {
      return this._agentPermissions.get(agentId)!;
    }
    if (caste) {
      const casteKey = caste.toLowerCase().replace(/ /g, "_");
      if (this._castePermissions.has(casteKey)) {
        return this._castePermissions.get(casteKey)!;
      }
      if (casteKey in this._casteDefaults) {
        return this._casteDefaults[casteKey];
      }
    }
    return this._global;
  }

  // -- Tool-level checks --------------------------------------------------

  evaluate(
    toolId: string,
    agentId = "",
    caste = "",
  ): PermissionDecision {
    const perms = this.getEffectivePermissions(agentId, caste);

    // Denylist always wins
    if (perms.denylist.includes(toolId)) {
      const decision = createPermissionDecision(
        PermissionBehavior.DENY,
        {
          source: PermissionReasonSource.CASTE_RULE,
          detail: `Tool '${toolId}' is in denylist for caste '${caste}'`,
        },
        { agentId, caste, tool: toolId },
      );
      this._logDecision(decision);
      return decision;
    }

    // If allowlist is set, tool must be in it
    if (perms.allowlist.length > 0 && !perms.allowlist.includes(toolId)) {
      const decision = createPermissionDecision(
        PermissionBehavior.DENY,
        {
          source: PermissionReasonSource.CASTE_RULE,
          detail: `Tool '${toolId}' is not in allowlist for caste '${caste}'`,
        },
        { agentId, caste, tool: toolId },
      );
      this._logDecision(decision);
      return decision;
    }

    const decision = createPermissionDecision(
      PermissionBehavior.ALLOW,
      {
        source: PermissionReasonSource.CASTE_RULE,
        detail: `Tool '${toolId}' permitted for caste '${caste}'`,
      },
      { agentId, caste, tool: toolId },
    );
    this._logDecision(decision);
    return decision;
  }

  private _logDecision(decision: PermissionDecision): void {
    console.log(
      `[permissions] ${decision.behavior}: tool=${decision.tool} caste=${decision.caste} agent=${decision.agentId} reason=${decision.reason.detail}`,
    );
  }

  checkOrRaise(toolId: string, agentId = "", caste = ""): void {
    const decision = this.evaluate(toolId, agentId, caste);
    if (decision.behavior !== PermissionBehavior.ALLOW) {
      throw new PermissionDeniedError(
        `Tool '${toolId}' is denied for agent='${agentId}' caste='${caste}': ${decision.reason.detail}`,
      );
    }
  }

  // -- Shell command checks -----------------------------------------------

  checkShellCommand(command: string, agentId = "", caste = ""): boolean {
    const perms = this.getEffectivePermissions(agentId, caste);
    const policy = perms.shellPolicy;

    // Detect unrestricted mode (root_queen)
    const unrestricted =
      policy.blockedCommands.length === 0 &&
      policy.blockedPatterns.length === 0;

    // BashValidatorPipeline pre-filter (quote-aware, runs first)
    if (!unrestricted) {
      const failures = this._bashValidatorPipeline.run(command);
      if (failures.length > 0) {
        return false;
      }
    }

    // BashSecurityClassifier check
    if (!unrestricted) {
      const riskLevel = this._bashClassifier.classify(command);
      if (riskLevel === "blocked" || riskLevel === "dangerous") {
        return false;
      }
    }

    // Caste-based ShellPolicy check
    const cmdParts = command.trim().split(/\s+/);
    if (cmdParts.length === 0) return false;

    const baseCommand = cmdParts[0];

    // Check blocked commands (glob match)
    for (const pattern of policy.blockedCommands) {
      if (globMatch(baseCommand, pattern)) return false;
    }

    // Check blocked patterns (regex against full command)
    for (const patternStr of policy.blockedPatterns) {
      try {
        if (new RegExp(patternStr).test(command)) return false;
      } catch {
        // Invalid regex — skip
      }
    }

    // Check allowed commands (if set, base command must match)
    if (policy.allowedCommands.length > 0) {
      const allowed = policy.allowedCommands.some((pat) =>
        globMatch(baseCommand, pat),
      );
      if (!allowed) return false;
    }

    return true;
  }

  classifyShellCommand(command: string): string {
    return this._bashClassifier.classify(command);
  }

  // -- HTTP URL checks ----------------------------------------------------

  checkHttpUrl(url: string, agentId = "", caste = ""): boolean {
    const perms = this.getEffectivePermissions(agentId, caste);
    const policy = perms.httpPolicy;

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }

    // Check scheme
    if (!policy.allowedSchemes.includes(parsed.protocol.replace(":", ""))) {
      return false;
    }

    const hostname = (parsed.hostname || "").toLowerCase();

    // Check blocked domains
    for (const domain of policy.blockedDomains) {
      const d = domain.toLowerCase();
      if (hostname === d || hostname.endsWith(`.${d}`)) {
        return false;
      }
    }

    // Check allowed domains (if set, hostname must match)
    if (policy.allowedDomains.length > 0) {
      const allowed = policy.allowedDomains.some((d) => {
        const dl = d.toLowerCase();
        return hostname === dl || hostname.endsWith(`.${dl}`);
      });
      if (!allowed) return false;
    }

    return true;
  }

  // -- File path checks ---------------------------------------------------

  checkFilePath(path: string, agentId = "", caste = ""): boolean {
    const perms = this.getEffectivePermissions(agentId, caste);
    const policy = perms.filePolicy;

    const normalised = normalize(path).replace(/\\/g, "/");

    // Block traversal attempts
    if (normalised.startsWith("..") || isAbsolute(path)) return false;

    // Check blocked paths
    for (const pattern of policy.blockedPaths) {
      if (globMatch(normalised, pattern)) return false;
      const bn = basename(normalised);
      if (globMatch(bn, pattern)) return false;
    }

    // Check blocked extensions
    const ext = extname(normalised).toLowerCase();
    if (ext && policy.blockedExtensions.includes(ext)) return false;

    // Check allowed extensions
    if (policy.allowedExtensions.length > 0) {
      if (ext && !policy.allowedExtensions.includes(ext)) return false;
    }

    // Check allowed paths
    if (policy.allowedPaths.length > 0) {
      const allowed = policy.allowedPaths.some((pat) =>
        globMatch(normalised, pat),
      );
      if (!allowed) return false;
    }

    return true;
  }

  // -- Convenience --------------------------------------------------------

  listAllowedTools(
    availableToolIds: string[],
    agentId = "",
    caste = "",
  ): string[] {
    return availableToolIds
      .filter(
        (tid) =>
          this.evaluate(tid, agentId, caste).behavior ===
          PermissionBehavior.ALLOW,
      )
      .sort();
  }

  getCasteDefaults(): Record<string, ToolPermissions> {
    return { ...this._casteDefaults };
  }

  reset(): void {
    this._agentPermissions.clear();
    this._castePermissions.clear();
  }
}
