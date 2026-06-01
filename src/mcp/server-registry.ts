/**
 * McpServerRegistry — first-class user-facing MCP server management (C6)
 *
 * Sits above the existing trusted HTTP / stdio MCP server infrastructure
 * (http-server-config.ts, plugin-sidecar-supervisor.ts) and provides:
 *
 *   - A persistent JSON config of "known" MCP servers (~/.colony/mcp-servers.json)
 *   - List / add / remove operations exposed through both /mcp slash commands
 *     and REST endpoints
 *   - Status reporting (configured | trusted | active) that the dashboard
 *     and CLI use to render the server list
 *
 * What this layer does NOT do:
 *   - It does not own the actual transport (HttpMcpTransport handles that)
 *   - It does not own the approval lifecycle (TrustedHttpMcpClient handles that)
 *   - It does not own per-call security (GuardedMcpTransport handles that)
 *
 * The registry's only job is to be the single source of truth for "which MCP
 * servers does this Colony installation know about, and what's their config?"
 * Everything downstream consumes its output.
 */

import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { homedir } from "os";
import { scrubSecrets } from "../security/log-sanitizer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type McpServerKind = "http" | "stdio";

export type McpServerStatus = "configured" | "trusted" | "active" | "error";

export interface McpServerEntry {
  /** Unique server id used in `/mcp call <id> ...`. */
  id: string;
  /** "http" or "stdio". */
  kind: McpServerKind;
  /** Short human-readable description shown in `/mcp list`. */
  description: string;
  /**
   * Transport-specific endpoint:
   *   - http: `https://host/path`
   *   - stdio: `<absolute-path-to-binary>`
   */
  endpoint: string;
  /** Tools the server is allowed to expose (allowlist). Empty = list-only. */
  allowedTools: string[];
  /** Tags the user added for search/filter. */
  tags: string[];
  /** Whether the user has approved this server for tool execution. */
  trusted: boolean;
  /** ISO timestamp when this server was added. */
  addedAt: string;
  /** ISO timestamp of the most-recent status check. */
  lastCheckedAt?: string;
  /** Most-recent observed status. */
  lastStatus?: McpServerStatus;
  /** Optional friendly error string from the last check. */
  lastError?: string;
}

export interface McpServerRegistrySnapshot {
  count: number;
  configPath: string | null;
  servers: McpServerEntry[];
}

export interface McpServerRegistryOptions {
  /**
   * Absolute path to the persistent JSON config file. Defaults to
   * `~/.colony/mcp-servers.json`. Pass `null` to run an in-memory-only
   * registry (useful in tests).
   */
  configPath?: string | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class McpServerRegistry {
  private readonly _configPath: string | null;
  private readonly _servers = new Map<string, McpServerEntry>();
  private _loaded = false;

  constructor(options: McpServerRegistryOptions = {}) {
    this._configPath =
      options.configPath === null
        ? null
        : options.configPath ?? defaultConfigPath();
  }

  get configPath(): string | null {
    return this._configPath;
  }

  /** Load servers from the config file. Safe to call multiple times. */
  async load(): Promise<void> {
    if (this._loaded) return;
    this._loaded = true;
    if (!this._configPath) return;

    try {
      const raw = await readFile(this._configPath, "utf-8");
      const parsed = JSON.parse(raw) as { servers?: McpServerEntry[] };
      if (Array.isArray(parsed.servers)) {
        for (const entry of parsed.servers) {
          if (!isValidEntry(entry)) continue;
          this._servers.set(entry.id, sanitizeEntry(entry));
        }
      }
    } catch {
      // Missing or unreadable config is fine — start empty.
    }
  }

  /** Returns a snapshot for display/transport. Never mutates internal state. */
  snapshot(): McpServerRegistrySnapshot {
    return {
      count: this._servers.size,
      configPath: this._configPath,
      servers: [...this._servers.values()]
        .map((entry) => ({ ...entry, tags: [...entry.tags], allowedTools: [...entry.allowedTools] }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    };
  }

  /** Returns one server by id, or null. */
  get(id: string): McpServerEntry | null {
    const entry = this._servers.get(id);
    if (!entry) return null;
    return { ...entry, tags: [...entry.tags], allowedTools: [...entry.allowedTools] };
  }

  /**
   * Add or update a server entry. Persists to disk.
   *
   * Throws when:
   *   - id fails validation
   *   - endpoint is empty
   *   - kind is not "http"/"stdio"
   *   - http endpoint isn't https://
   *   - the server isn't already configured AND `replace` was not requested
   *     for an existing id
   */
  async upsert(
    input: Omit<McpServerEntry, "addedAt" | "lastCheckedAt" | "lastStatus" | "lastError">,
    options: { replace?: boolean } = {},
  ): Promise<McpServerEntry> {
    validateInput(input);
    const existing = this._servers.get(input.id);
    if (existing && !options.replace) {
      throw new Error(`MCP server already exists: ${input.id} (pass replace:true to overwrite)`);
    }
    const entry: McpServerEntry = {
      id: input.id,
      kind: input.kind,
      description: input.description.trim(),
      endpoint: input.endpoint.trim(),
      allowedTools: [...new Set(input.allowedTools)].sort(),
      tags: [...new Set(input.tags)].sort(),
      trusted: Boolean(input.trusted),
      addedAt: existing?.addedAt ?? new Date().toISOString(),
      lastCheckedAt: existing?.lastCheckedAt,
      lastStatus: existing?.lastStatus,
      lastError: existing?.lastError,
    };
    this._servers.set(entry.id, entry);
    await this._persist();
    return { ...entry, tags: [...entry.tags], allowedTools: [...entry.allowedTools] };
  }

  /** Remove a server by id. Returns true if it was present. */
  async remove(id: string): Promise<boolean> {
    const had = this._servers.delete(id);
    if (had) await this._persist();
    return had;
  }

  /** Mark a server as trusted (user-approved). */
  async setTrust(id: string, trusted: boolean): Promise<McpServerEntry | null> {
    const entry = this._servers.get(id);
    if (!entry) return null;
    entry.trusted = trusted;
    await this._persist();
    return { ...entry, tags: [...entry.tags], allowedTools: [...entry.allowedTools] };
  }

  /**
   * Update the status field after a health check. Does not invoke the check
   * itself — that's the caller's responsibility.
   */
  async recordStatus(
    id: string,
    status: McpServerStatus,
    error?: string,
  ): Promise<McpServerEntry | null> {
    const entry = this._servers.get(id);
    if (!entry) return null;
    entry.lastStatus = status;
    entry.lastCheckedAt = new Date().toISOString();
    entry.lastError = error ? scrubSecrets(error).slice(0, 200) : undefined;
    await this._persist();
    return { ...entry, tags: [...entry.tags], allowedTools: [...entry.allowedTools] };
  }

  // -------------------------------------------------------------------------

  private async _persist(): Promise<void> {
    if (!this._configPath) return;
    const data = {
      version: 1,
      updatedAt: new Date().toISOString(),
      servers: [...this._servers.values()].sort((a, b) => a.id.localeCompare(b.id)),
    };
    await mkdir(dirname(this._configPath), { recursive: true });
    await writeFile(this._configPath, JSON.stringify(data, null, 2), "utf-8");
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const ID_PATTERN = /^[a-z][a-z0-9_-]{2,63}$/;

function validateInput(
  input: Omit<McpServerEntry, "addedAt" | "lastCheckedAt" | "lastStatus" | "lastError">,
): void {
  if (!ID_PATTERN.test(input.id)) {
    throw new Error(
      `MCP server id must match ${ID_PATTERN}; got: ${JSON.stringify(input.id)}`,
    );
  }
  if (input.kind !== "http" && input.kind !== "stdio") {
    throw new Error(`MCP server kind must be "http" or "stdio"; got: ${input.kind}`);
  }
  if (!input.endpoint || typeof input.endpoint !== "string") {
    throw new Error("MCP server endpoint is required");
  }
  if (input.kind === "http" && !input.endpoint.startsWith("https://")) {
    throw new Error(
      `MCP HTTP server endpoint must be https:// (Colony rejects http:// to prevent credential leakage)`,
    );
  }
  if (input.kind === "stdio" && !input.endpoint.trim()) {
    throw new Error("MCP stdio server endpoint must be a non-empty path");
  }
  if (input.description.length > 500) {
    throw new Error("MCP server description must be <= 500 chars");
  }
  if (input.allowedTools.length > 200) {
    throw new Error("MCP server allowedTools list must be <= 200 entries");
  }
  if (input.tags.length > 20) {
    throw new Error("MCP server tags list must be <= 20 entries");
  }
}

function isValidEntry(entry: unknown): entry is McpServerEntry {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
  const e = entry as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    ID_PATTERN.test(e.id) &&
    (e.kind === "http" || e.kind === "stdio") &&
    typeof e.endpoint === "string" &&
    typeof e.description === "string" &&
    Array.isArray(e.tags) &&
    Array.isArray(e.allowedTools) &&
    typeof e.trusted === "boolean" &&
    typeof e.addedAt === "string"
  );
}

function sanitizeEntry(entry: McpServerEntry): McpServerEntry {
  return {
    id: entry.id,
    kind: entry.kind,
    description: String(entry.description ?? "").slice(0, 500),
    endpoint: String(entry.endpoint ?? ""),
    allowedTools: (entry.allowedTools ?? []).filter((t): t is string => typeof t === "string"),
    tags: (entry.tags ?? []).filter((t): t is string => typeof t === "string"),
    trusted: Boolean(entry.trusted),
    addedAt: entry.addedAt,
    lastCheckedAt: entry.lastCheckedAt,
    lastStatus: entry.lastStatus,
    lastError: entry.lastError,
  };
}

function defaultConfigPath(): string {
  const home = homedir() || process.env.USERPROFILE || process.env.HOME || ".";
  return join(home, ".colony", "mcp-servers.json");
}
