import { describe, test, expect } from "bun:test";
import { readFile } from "fs/promises";
import { join } from "path";
import {
  searchPluginRegistry,
  formatPluginSearchResults,
  DEFAULT_REGISTRY_URL,
  type PluginRegistryEntry,
} from "../../mcp/plugin-registry-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const SEED_REGISTRY_PATH = join(REPO_ROOT, "registry", "v1", "index.json");

/** Build a fetch impl that reads the in-repo registry JSON file. */
async function makeLocalFetch(): Promise<typeof fetch> {
  const body = await readFile(SEED_REGISTRY_PATH, "utf-8");
  return (async () => {
    return new Response(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

/** Build a fetch impl that always returns the given response. */
function staticFetch(status: number, body: string): typeof fetch {
  return (async () => new Response(body, { status })) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// Seed registry integrity
// ---------------------------------------------------------------------------

describe("Plugin registry seed (C4) — repo-shipped registry/v1/index.json", () => {
  test("parses and returns all seeded plugins on empty query", async () => {
    const fetchImpl = await makeLocalFetch();
    const result = await searchPluginRegistry("", { fetchImpl });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results.length).toBeGreaterThanOrEqual(10);
    expect(result.registryUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("every seeded plugin has the required fields", async () => {
    const fetchImpl = await makeLocalFetch();
    const result = await searchPluginRegistry("", { fetchImpl });
    if (!result.ok) throw new Error(result.error);

    for (const entry of result.results) {
      expect(entry.id).toMatch(/^[a-z][a-z0-9-]{2,63}$/);
      expect(entry.name.length).toBeGreaterThanOrEqual(2);
      expect(entry.description.length).toBeGreaterThanOrEqual(20);
      expect(entry.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(entry.author.length).toBeGreaterThanOrEqual(2);
      expect(entry.tags.length).toBeGreaterThanOrEqual(1);
      expect(typeof entry.verified).toBe("boolean");
      expect(entry.source).toMatch(/^(npm:|github:)/);
    }
  });

  test("plugin ids are unique", async () => {
    const fetchImpl = await makeLocalFetch();
    const result = await searchPluginRegistry("", { fetchImpl });
    if (!result.ok) throw new Error(result.error);

    const ids = result.results.map((e) => e.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// Query filtering
// ---------------------------------------------------------------------------

describe("searchPluginRegistry — filtering", () => {
  test("matches by id substring", async () => {
    const fetchImpl = await makeLocalFetch();
    const result = await searchPluginRegistry("git", { fetchImpl });
    if (!result.ok) throw new Error(result.error);

    expect(result.results.length).toBeGreaterThanOrEqual(2); // colony-git and colony-github
    for (const entry of result.results) {
      const matches =
        entry.id.toLowerCase().includes("git") ||
        entry.name.toLowerCase().includes("git") ||
        entry.description.toLowerCase().includes("git") ||
        entry.tags.some((t) => t.toLowerCase().includes("git"));
      expect(matches).toBe(true);
    }
  });

  test("matches by tag", async () => {
    const fetchImpl = await makeLocalFetch();
    const result = await searchPluginRegistry("essential", { fetchImpl });
    if (!result.ok) throw new Error(result.error);

    expect(result.results.length).toBeGreaterThanOrEqual(1);
    for (const entry of result.results) {
      expect(entry.tags).toContain("essential");
    }
  });

  test("matches by description token", async () => {
    const fetchImpl = await makeLocalFetch();
    const result = await searchPluginRegistry("Postgres", { fetchImpl });
    if (!result.ok) throw new Error(result.error);

    expect(result.results.some((r) => r.id === "colony-postgres")).toBe(true);
  });

  test("case-insensitive matching", async () => {
    const fetchImpl = await makeLocalFetch();
    const upper = await searchPluginRegistry("BROWSER", { fetchImpl });
    const lower = await searchPluginRegistry("browser", { fetchImpl });
    if (!upper.ok || !lower.ok) throw new Error("expected both queries to succeed");

    expect(upper.results.map((r) => r.id).sort()).toEqual(
      lower.results.map((r) => r.id).sort(),
    );
  });

  test("empty results for query that matches nothing", async () => {
    const fetchImpl = await makeLocalFetch();
    const result = await searchPluginRegistry("xyzzy-nonexistent-tag-2026", {
      fetchImpl,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("searchPluginRegistry — error handling", () => {
  test("returns error result on HTTP 500", async () => {
    const result = await searchPluginRegistry("git", {
      fetchImpl: staticFetch(500, "Internal Server Error"),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("500");
  });

  test("returns error result on HTTP 404", async () => {
    const result = await searchPluginRegistry("git", {
      fetchImpl: staticFetch(404, "Not Found"),
    });
    expect(result.ok).toBe(false);
  });

  test("returns error result on invalid JSON", async () => {
    const result = await searchPluginRegistry("git", {
      fetchImpl: staticFetch(200, "not valid json {{{"),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("JSON");
  });

  test("returns error result on JSON missing plugins array", async () => {
    const result = await searchPluginRegistry("git", {
      fetchImpl: staticFetch(200, JSON.stringify({ version: "1", updated: "2026-01-01" })),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("format");
  });

  test("returns error result on fetch throwing", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const result = await searchPluginRegistry("git", { fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("ECONNREFUSED");
  });
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe("formatPluginSearchResults", () => {
  test("renders an empty-result message when no matches", async () => {
    const fetchImpl = await makeLocalFetch();
    const result = await searchPluginRegistry("xyzzy-nonexistent", { fetchImpl });
    const formatted = formatPluginSearchResults(result, "xyzzy-nonexistent");

    expect(formatted).toContain("No plugins found");
    expect(formatted).toContain("xyzzy-nonexistent");
  });

  test("renders a populated result list with verified badges", async () => {
    const fetchImpl = await makeLocalFetch();
    const result = await searchPluginRegistry("git", { fetchImpl });
    const formatted = formatPluginSearchResults(result, "git");

    expect(formatted).toContain("colony-git");
    expect(formatted).toContain("[verified]");
    expect(formatted).toContain("/plugins preflight");
  });

  test("renders an error message for failed search", () => {
    const formatted = formatPluginSearchResults(
      { ok: false, error: "Could not reach plugin registry: ECONNREFUSED" },
      "anything",
    );
    expect(formatted).toContain("Plugin registry search failed");
    expect(formatted).toContain("ECONNREFUSED");
  });
});

// ---------------------------------------------------------------------------
// Default URL sanity
// ---------------------------------------------------------------------------

describe("DEFAULT_REGISTRY_URL", () => {
  test("points at the v1 schema path", () => {
    expect(DEFAULT_REGISTRY_URL).toContain("/v1/");
    expect(DEFAULT_REGISTRY_URL).toContain("index.json");
    expect(DEFAULT_REGISTRY_URL).toMatch(/^https:\/\//);
  });
});

// ---------------------------------------------------------------------------
// Type re-export sanity
// ---------------------------------------------------------------------------

describe("PluginRegistryEntry type", () => {
  test("seed entries are assignable to PluginRegistryEntry", async () => {
    const fetchImpl = await makeLocalFetch();
    const result = await searchPluginRegistry("", { fetchImpl });
    if (!result.ok) throw new Error(result.error);

    // Pure TS check — if results is PluginRegistryEntry[] this assignment
    // type-checks. The test exists for the runtime side-effect of access.
    const first: PluginRegistryEntry = result.results[0];
    expect(first.id).toBeTruthy();
  });
});
