/**
 * Plugin registry client — queries the hosted Colony plugin registry.
 *
 * The hosted registry is a static JSON file served from GitHub Pages or an
 * equivalent CDN. All filtering happens client-side after a single fetch, so
 * the server never receives user-typed search terms.
 *
 * Security posture:
 *  - Only connects to the configured registry URL (no redirect following beyond
 *    the HTTP stack).
 *  - Times out after 8 seconds to avoid blocking the Colony event loop.
 *  - Validates the response schema before processing.
 *  - Uses `scrubSecrets()` on any user-supplied values before logging.
 */

import { scrubSecrets } from "../security/log-sanitizer";

// ---------------------------------------------------------------------------
// Public registry URL (the default when no override is configured)
// ---------------------------------------------------------------------------

export const DEFAULT_REGISTRY_URL =
  "https://jbrorepo.github.io/colony-ts/v1/index.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single plugin entry in the hosted registry index. */
export interface PluginRegistryEntry {
  /** Unique identifier, e.g. "colony-git-tools". */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** One-line description shown in search results. */
  description: string;
  /** Semver string, e.g. "1.2.0". */
  version: string;
  /** Author or org name. */
  author: string;
  /** Searchable topic tags. */
  tags: string[];
  /**
   * Whether this plugin has been reviewed and signed by the Colony team.
   * Community plugins are safe to install, but verified plugins have passed
   * additional security and quality gates.
   */
  verified: boolean;
  /**
   * Installation source — currently `npm:<package-name>` or
   * `github:<owner>/<repo>`.
   */
  source: string;
  /** Optional link to the plugin's homepage or documentation. */
  homepageUrl?: string;
}

/** The top-level shape of the hosted registry JSON file. */
interface PluginRegistryIndex {
  version: string;
  updated: string;
  plugins: PluginRegistryEntry[];
}

/** Options for a registry search request. */
export interface PluginSearchOptions {
  /** Override the default registry URL (useful in tests or air-gapped envs). */
  registryUrl?: string;
  /** Fetch timeout in milliseconds. Default: 8000 */
  timeoutMs?: number;
  /** Custom fetch implementation (injectable for tests). Default: global fetch */
  fetchImpl?: typeof fetch;
}

/** Outcome of a search call. */
export type PluginSearchResult =
  | { ok: true; results: PluginRegistryEntry[]; registryUpdated: string }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Core client
// ---------------------------------------------------------------------------

/**
 * Search the hosted plugin registry for entries matching `query`.
 *
 * Filtering is case-insensitive and matches against id, name, description,
 * and tags. An empty query returns all registry entries.
 */
export async function searchPluginRegistry(
  query: string,
  opts: PluginSearchOptions = {},
): Promise<PluginSearchResult> {
  const url = opts.registryUrl ?? DEFAULT_REGISTRY_URL;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const fetchFn = opts.fetchImpl ?? fetch;

  let resp: Response;
  try {
    resp = await fetchFn(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "colony-cli/plugin-search",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? `Registry request timed out after ${timeoutMs}ms`
        : `Could not reach plugin registry: ${err instanceof Error ? err.message : String(err)}`;
    return { ok: false, error: message };
  }

  if (!resp.ok) {
    return { ok: false, error: `Registry returned HTTP ${resp.status}` };
  }

  let data: unknown;
  try {
    data = await resp.json();
  } catch {
    return { ok: false, error: "Registry response is not valid JSON" };
  }

  if (!isValidRegistryIndex(data)) {
    return { ok: false, error: "Registry response format is invalid" };
  }

  const term = query.trim().toLowerCase();
  const results = term
    ? data.plugins.filter(matchesQuery(term))
    : data.plugins;

  return { ok: true, results, registryUpdated: data.updated };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Format search results as a human-readable string for display in the
 * Colony terminal or web UI.
 */
export function formatPluginSearchResults(
  result: PluginSearchResult,
  query: string,
): string {
  const scrubbedQuery = scrubSecrets(query).slice(0, 100);

  if (!result.ok) {
    return [
      `Plugin registry search failed: ${result.error}`,
      "",
      `Check your internet connection or configure a local registry with:`,
      "  colony config set plugins.registryUrl <url>",
    ].join("\n");
  }

  const { results, registryUpdated } = result;

  if (results.length === 0) {
    return [
      `No plugins found matching "${scrubbedQuery}".`,
      "",
      "Try a broader search term, or browse the full registry:",
      `  ${DEFAULT_REGISTRY_URL}`,
      "",
      `Registry last updated: ${registryUpdated}`,
    ].join("\n");
  }

  const plural = results.length === 1 ? "match" : "matches";
  const lines: string[] = [
    `Plugin search: "${scrubbedQuery}" — ${results.length} ${plural}`,
    `Registry updated: ${registryUpdated}`,
    "",
  ];

  for (const entry of results) {
    const badge = entry.verified ? " [verified]" : "";
    lines.push(`  ${entry.id}${badge}`);
    lines.push(`    ${entry.name} v${entry.version} by ${entry.author}`);
    lines.push(`    ${entry.description}`);
    if (entry.tags.length > 0) {
      lines.push(`    Tags: ${entry.tags.join(", ")}`);
    }
    lines.push(`    Source: ${entry.source}`);
    if (entry.homepageUrl) {
      lines.push(`    Docs: ${entry.homepageUrl}`);
    }
    lines.push("");
  }

  lines.push("To install a plugin: /plugins preflight <id>");
  lines.push("Then: /plugins activate <id> --approved");

  return lines.join("\n").trimEnd();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function matchesQuery(term: string): (entry: PluginRegistryEntry) => boolean {
  return (entry) =>
    entry.id.toLowerCase().includes(term) ||
    entry.name.toLowerCase().includes(term) ||
    entry.description.toLowerCase().includes(term) ||
    entry.tags.some((tag) => tag.toLowerCase().includes(term));
}

function isValidRegistryIndex(data: unknown): data is PluginRegistryIndex {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const record = data as Record<string, unknown>;
  if (typeof record.version !== "string") return false;
  if (typeof record.updated !== "string") return false;
  if (!Array.isArray(record.plugins)) return false;
  return record.plugins.every(isValidRegistryEntry);
}

function isValidRegistryEntry(entry: unknown): entry is PluginRegistryEntry {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
  const e = entry as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.name === "string" &&
    typeof e.description === "string" &&
    typeof e.version === "string" &&
    typeof e.author === "string" &&
    Array.isArray(e.tags) &&
    typeof e.verified === "boolean" &&
    typeof e.source === "string"
  );
}
