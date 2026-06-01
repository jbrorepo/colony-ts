import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { mkdir, rm, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { McpServerRegistry } from "../../mcp/server-registry";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const base = join(tmpdir(), `colony-mcp-registry-${Date.now()}`);
let workdir: string;
let configPath: string;

beforeEach(async () => {
  // Fresh temp dir for each test
  workdir = join(base, `t-${Math.random().toString(36).slice(2, 10)}`);
  await mkdir(workdir, { recursive: true });
  configPath = join(workdir, "mcp-servers.json");
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

const VALID_HTTP_INPUT = {
  id: "test-server",
  kind: "http" as const,
  endpoint: "https://example.com/mcp",
  description: "Test server",
  allowedTools: ["echo", "fetch"],
  tags: ["test"],
  trusted: false,
};

// ---------------------------------------------------------------------------
// In-memory registry
// ---------------------------------------------------------------------------

describe("McpServerRegistry — in-memory (configPath=null)", () => {
  test("starts empty", async () => {
    const reg = new McpServerRegistry({ configPath: null });
    await reg.load();
    expect(reg.snapshot().count).toBe(0);
    expect(reg.snapshot().servers).toEqual([]);
  });

  test("upsert adds a server", async () => {
    const reg = new McpServerRegistry({ configPath: null });
    const entry = await reg.upsert(VALID_HTTP_INPUT);
    expect(entry.id).toBe("test-server");
    expect(entry.kind).toBe("http");
    expect(entry.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(reg.snapshot().count).toBe(1);
  });

  test("upsert rejects duplicate without replace=true", async () => {
    const reg = new McpServerRegistry({ configPath: null });
    await reg.upsert(VALID_HTTP_INPUT);
    await expect(reg.upsert(VALID_HTTP_INPUT)).rejects.toThrow(/already exists/);
  });

  test("upsert with replace=true overwrites", async () => {
    const reg = new McpServerRegistry({ configPath: null });
    await reg.upsert(VALID_HTTP_INPUT);
    const updated = await reg.upsert(
      { ...VALID_HTTP_INPUT, description: "updated description" },
      { replace: true },
    );
    expect(updated.description).toBe("updated description");
    expect(reg.snapshot().count).toBe(1);
  });

  test("remove deletes a server", async () => {
    const reg = new McpServerRegistry({ configPath: null });
    await reg.upsert(VALID_HTTP_INPUT);
    expect(await reg.remove("test-server")).toBe(true);
    expect(reg.snapshot().count).toBe(0);
  });

  test("remove returns false for unknown id", async () => {
    const reg = new McpServerRegistry({ configPath: null });
    expect(await reg.remove("does-not-exist")).toBe(false);
  });

  test("setTrust updates trusted flag", async () => {
    const reg = new McpServerRegistry({ configPath: null });
    await reg.upsert(VALID_HTTP_INPUT);

    const trusted = await reg.setTrust("test-server", true);
    expect(trusted?.trusted).toBe(true);

    const untrusted = await reg.setTrust("test-server", false);
    expect(untrusted?.trusted).toBe(false);
  });

  test("setTrust returns null for unknown id", async () => {
    const reg = new McpServerRegistry({ configPath: null });
    expect(await reg.setTrust("missing", true)).toBeNull();
  });

  test("recordStatus updates last-checked metadata", async () => {
    const reg = new McpServerRegistry({ configPath: null });
    await reg.upsert(VALID_HTTP_INPUT);

    const updated = await reg.recordStatus("test-server", "active");
    expect(updated?.lastStatus).toBe("active");
    expect(updated?.lastCheckedAt).toMatch(/^\d{4}/);
    expect(updated?.lastError).toBeUndefined();
  });

  test("recordStatus captures and truncates the error string", async () => {
    const reg = new McpServerRegistry({ configPath: null });
    await reg.upsert(VALID_HTTP_INPUT);
    const longErr = "ECONNREFUSED ".repeat(50);
    const updated = await reg.recordStatus("test-server", "error", longErr);
    expect(updated?.lastStatus).toBe("error");
    expect(updated?.lastError?.length).toBeLessThanOrEqual(200);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("McpServerRegistry — input validation", () => {
  test("rejects invalid id (uppercase)", async () => {
    const reg = new McpServerRegistry({ configPath: null });
    await expect(
      reg.upsert({ ...VALID_HTTP_INPUT, id: "BadId" }),
    ).rejects.toThrow(/id must match/);
  });

  test("rejects invalid id (too short)", async () => {
    const reg = new McpServerRegistry({ configPath: null });
    await expect(
      reg.upsert({ ...VALID_HTTP_INPUT, id: "ab" }),
    ).rejects.toThrow(/id must match/);
  });

  test("rejects http:// endpoint for http kind", async () => {
    const reg = new McpServerRegistry({ configPath: null });
    await expect(
      reg.upsert({ ...VALID_HTTP_INPUT, endpoint: "http://example.com/mcp" }),
    ).rejects.toThrow(/https:\/\//);
  });

  test("rejects empty endpoint", async () => {
    const reg = new McpServerRegistry({ configPath: null });
    await expect(
      reg.upsert({ ...VALID_HTTP_INPUT, endpoint: "" }),
    ).rejects.toThrow(/endpoint is required/);
  });

  test("rejects too many allowedTools", async () => {
    const reg = new McpServerRegistry({ configPath: null });
    const tools = Array.from({ length: 300 }, (_, i) => `tool-${i}`);
    await expect(
      reg.upsert({ ...VALID_HTTP_INPUT, allowedTools: tools }),
    ).rejects.toThrow(/<= 200/);
  });

  test("accepts stdio kind with absolute path", async () => {
    const reg = new McpServerRegistry({ configPath: null });
    const entry = await reg.upsert({
      ...VALID_HTTP_INPUT,
      kind: "stdio",
      endpoint: "/usr/local/bin/my-mcp-server",
    });
    expect(entry.kind).toBe("stdio");
  });

  test("deduplicates and sorts allowedTools", async () => {
    const reg = new McpServerRegistry({ configPath: null });
    const entry = await reg.upsert({
      ...VALID_HTTP_INPUT,
      allowedTools: ["zebra", "apple", "apple", "mango"],
    });
    expect(entry.allowedTools).toEqual(["apple", "mango", "zebra"]);
  });
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

describe("McpServerRegistry — persistence", () => {
  test("upsert writes to the config file", async () => {
    const reg = new McpServerRegistry({ configPath });
    await reg.load();
    await reg.upsert(VALID_HTTP_INPUT);

    const raw = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(1);
    expect(parsed.servers).toHaveLength(1);
    expect(parsed.servers[0].id).toBe("test-server");
  });

  test("load reads servers from the config file", async () => {
    // Write a config file by hand
    await mkdir(workdir, { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        servers: [
          {
            id: "preloaded",
            kind: "http",
            endpoint: "https://example.com",
            description: "from disk",
            allowedTools: [],
            tags: [],
            trusted: true,
            addedAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const reg = new McpServerRegistry({ configPath });
    await reg.load();
    expect(reg.snapshot().count).toBe(1);
    expect(reg.snapshot().servers[0].id).toBe("preloaded");
    expect(reg.snapshot().servers[0].trusted).toBe(true);
  });

  test("load tolerates missing config file", async () => {
    const reg = new McpServerRegistry({ configPath });
    await expect(reg.load()).resolves.toBeUndefined();
    expect(reg.snapshot().count).toBe(0);
  });

  test("load tolerates malformed JSON", async () => {
    await writeFile(configPath, "not json {{{");
    const reg = new McpServerRegistry({ configPath });
    await expect(reg.load()).resolves.toBeUndefined();
    expect(reg.snapshot().count).toBe(0);
  });

  test("remove persists the deletion", async () => {
    const reg1 = new McpServerRegistry({ configPath });
    await reg1.load();
    await reg1.upsert(VALID_HTTP_INPUT);
    await reg1.remove("test-server");

    const reg2 = new McpServerRegistry({ configPath });
    await reg2.load();
    expect(reg2.snapshot().count).toBe(0);
  });

  test("survives a load → mutate → reload cycle", async () => {
    const reg1 = new McpServerRegistry({ configPath });
    await reg1.load();
    await reg1.upsert(VALID_HTTP_INPUT);
    await reg1.setTrust("test-server", true);

    const reg2 = new McpServerRegistry({ configPath });
    await reg2.load();
    expect(reg2.snapshot().count).toBe(1);
    expect(reg2.snapshot().servers[0].trusted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Snapshot immutability
// ---------------------------------------------------------------------------

describe("McpServerRegistry — snapshot safety", () => {
  test("snapshot returns deep copies (mutating result doesn't affect registry)", async () => {
    const reg = new McpServerRegistry({ configPath: null });
    await reg.upsert(VALID_HTTP_INPUT);

    const snap = reg.snapshot();
    snap.servers[0].tags.push("mutated");
    snap.servers[0].allowedTools.push("mutated-tool");

    const snap2 = reg.snapshot();
    expect(snap2.servers[0].tags).not.toContain("mutated");
    expect(snap2.servers[0].allowedTools).not.toContain("mutated-tool");
  });

  test("get returns a copy", async () => {
    const reg = new McpServerRegistry({ configPath: null });
    await reg.upsert(VALID_HTTP_INPUT);

    const entry = reg.get("test-server")!;
    entry.tags.push("mutated");

    const fresh = reg.get("test-server")!;
    expect(fresh.tags).not.toContain("mutated");
  });
});
