import { describe, test, expect } from "bun:test";
import { DaemonControlPlaneHost } from "../../daemon/control-plane";
import { handleWebUIRequest } from "../../daemon/web-ui";
import { McpServerRegistry } from "../../mcp/server-registry";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeHost(registry?: McpServerRegistry): DaemonControlPlaneHost {
  return new DaemonControlPlaneHost({ mcpServerRegistry: registry });
}

const BASE = "http://localhost/";

const VALID_BODY = {
  id: "github-mcp",
  kind: "http",
  endpoint: "https://api.github.com/mcp",
  description: "GitHub MCP server",
  allowedTools: ["github.list_issues", "github.create_pr"],
  tags: ["github", "essential"],
  trusted: false,
};

// ---------------------------------------------------------------------------
// 503 when unconfigured
// ---------------------------------------------------------------------------

describe("MCP REST API (C6) — 503 when registry is unconfigured", () => {
  test("GET /api/v1/mcp/servers returns 503", async () => {
    const host = makeHost();
    const res = await handleWebUIRequest(host, new Request(`${BASE}api/v1/mcp/servers`));
    expect(res!.status).toBe(503);
  });

  test("POST /api/v1/mcp/servers returns 503", async () => {
    const host = makeHost();
    const res = await handleWebUIRequest(
      host,
      new Request(`${BASE}api/v1/mcp/servers`, {
        method: "POST",
        body: JSON.stringify(VALID_BODY),
      }),
    );
    expect(res!.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/mcp/servers
// ---------------------------------------------------------------------------

describe("GET /api/v1/mcp/servers — list", () => {
  test("returns empty list when registry has no servers", async () => {
    const registry = new McpServerRegistry({ configPath: null });
    const host = makeHost(registry);
    const res = await handleWebUIRequest(host, new Request(`${BASE}api/v1/mcp/servers`));
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { ok: boolean; count: number; servers: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.count).toBe(0);
    expect(body.servers).toEqual([]);
  });

  test("returns added servers", async () => {
    const registry = new McpServerRegistry({ configPath: null });
    await registry.upsert({
      id: "alpha",
      kind: "http",
      endpoint: "https://a.example.com",
      description: "",
      allowedTools: [],
      tags: [],
      trusted: false,
    });
    const host = makeHost(registry);
    const res = await handleWebUIRequest(host, new Request(`${BASE}api/v1/mcp/servers`));
    const body = (await res!.json()) as { count: number; servers: Array<{ id: string }> };
    expect(body.count).toBe(1);
    expect(body.servers[0].id).toBe("alpha");
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/mcp/servers
// ---------------------------------------------------------------------------

describe("POST /api/v1/mcp/servers — add", () => {
  test("creates a new server (201)", async () => {
    const registry = new McpServerRegistry({ configPath: null });
    const host = makeHost(registry);
    const res = await handleWebUIRequest(
      host,
      new Request(`${BASE}api/v1/mcp/servers`, {
        method: "POST",
        body: JSON.stringify(VALID_BODY),
      }),
    );
    expect(res!.status).toBe(201);
    const body = (await res!.json()) as { ok: boolean; server: { id: string } };
    expect(body.ok).toBe(true);
    expect(body.server.id).toBe("github-mcp");
  });

  test("returns 400 on invalid id", async () => {
    const registry = new McpServerRegistry({ configPath: null });
    const host = makeHost(registry);
    const res = await handleWebUIRequest(
      host,
      new Request(`${BASE}api/v1/mcp/servers`, {
        method: "POST",
        body: JSON.stringify({ ...VALID_BODY, id: "Invalid Capital ID" }),
      }),
    );
    expect(res!.status).toBe(400);
  });

  test("returns 400 on http:// endpoint", async () => {
    const registry = new McpServerRegistry({ configPath: null });
    const host = makeHost(registry);
    const res = await handleWebUIRequest(
      host,
      new Request(`${BASE}api/v1/mcp/servers`, {
        method: "POST",
        body: JSON.stringify({ ...VALID_BODY, endpoint: "http://insecure.example.com" }),
      }),
    );
    expect(res!.status).toBe(400);
  });

  test("returns 400 on duplicate without replace", async () => {
    const registry = new McpServerRegistry({ configPath: null });
    const host = makeHost(registry);
    await handleWebUIRequest(
      host,
      new Request(`${BASE}api/v1/mcp/servers`, {
        method: "POST",
        body: JSON.stringify(VALID_BODY),
      }),
    );
    const res = await handleWebUIRequest(
      host,
      new Request(`${BASE}api/v1/mcp/servers`, {
        method: "POST",
        body: JSON.stringify(VALID_BODY),
      }),
    );
    expect(res!.status).toBe(400);
  });

  test("replace:true overwrites existing entry", async () => {
    const registry = new McpServerRegistry({ configPath: null });
    const host = makeHost(registry);
    await handleWebUIRequest(
      host,
      new Request(`${BASE}api/v1/mcp/servers`, {
        method: "POST",
        body: JSON.stringify(VALID_BODY),
      }),
    );
    const res = await handleWebUIRequest(
      host,
      new Request(`${BASE}api/v1/mcp/servers`, {
        method: "POST",
        body: JSON.stringify({ ...VALID_BODY, description: "updated", replace: true }),
      }),
    );
    expect(res!.status).toBe(201);
    const body = (await res!.json()) as { server: { description: string } };
    expect(body.server.description).toBe("updated");
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/mcp/servers/:id
// ---------------------------------------------------------------------------

describe("GET /api/v1/mcp/servers/:id — inspect", () => {
  test("returns the server entry", async () => {
    const registry = new McpServerRegistry({ configPath: null });
    await registry.upsert({ ...VALID_BODY, kind: "http" });
    const host = makeHost(registry);

    const res = await handleWebUIRequest(host, new Request(`${BASE}api/v1/mcp/servers/github-mcp`));
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { server: { id: string } };
    expect(body.server.id).toBe("github-mcp");
  });

  test("returns 404 for unknown id", async () => {
    const registry = new McpServerRegistry({ configPath: null });
    const host = makeHost(registry);
    const res = await handleWebUIRequest(host, new Request(`${BASE}api/v1/mcp/servers/nonexistent`));
    expect(res!.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/mcp/servers/:id
// ---------------------------------------------------------------------------

describe("DELETE /api/v1/mcp/servers/:id — remove", () => {
  test("removes the server", async () => {
    const registry = new McpServerRegistry({ configPath: null });
    await registry.upsert({ ...VALID_BODY, kind: "http" });
    const host = makeHost(registry);

    const res = await handleWebUIRequest(
      host,
      new Request(`${BASE}api/v1/mcp/servers/github-mcp`, { method: "DELETE" }),
    );
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { removed: boolean };
    expect(body.removed).toBe(true);
    expect(registry.snapshot().count).toBe(0);
  });

  test("returns 404 for unknown id", async () => {
    const registry = new McpServerRegistry({ configPath: null });
    const host = makeHost(registry);
    const res = await handleWebUIRequest(
      host,
      new Request(`${BASE}api/v1/mcp/servers/nope`, { method: "DELETE" }),
    );
    expect(res!.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Trust management
// ---------------------------------------------------------------------------

describe("POST/DELETE /api/v1/mcp/servers/:id/trust", () => {
  test("POST grants trust", async () => {
    const registry = new McpServerRegistry({ configPath: null });
    await registry.upsert({ ...VALID_BODY, kind: "http" });
    const host = makeHost(registry);

    const res = await handleWebUIRequest(
      host,
      new Request(`${BASE}api/v1/mcp/servers/github-mcp/trust`, { method: "POST" }),
    );
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { server: { trusted: boolean } };
    expect(body.server.trusted).toBe(true);
  });

  test("DELETE revokes trust", async () => {
    const registry = new McpServerRegistry({ configPath: null });
    await registry.upsert({ ...VALID_BODY, kind: "http", trusted: true });
    const host = makeHost(registry);

    const res = await handleWebUIRequest(
      host,
      new Request(`${BASE}api/v1/mcp/servers/github-mcp/trust`, { method: "DELETE" }),
    );
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as { server: { trusted: boolean } };
    expect(body.server.trusted).toBe(false);
  });

  test("404 for unknown server on trust", async () => {
    const registry = new McpServerRegistry({ configPath: null });
    const host = makeHost(registry);
    const res = await handleWebUIRequest(
      host,
      new Request(`${BASE}api/v1/mcp/servers/missing/trust`, { method: "POST" }),
    );
    expect(res!.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Capability advertisement
// ---------------------------------------------------------------------------

describe("MCP capability advertisement", () => {
  test("/api/v1/health includes mcp.servers when registry is configured", async () => {
    const registry = new McpServerRegistry({ configPath: null });
    const host = makeHost(registry);
    const res = await handleWebUIRequest(host, new Request(`${BASE}api/v1/health`));
    const body = (await res!.json()) as { capabilities: string[] };
    expect(body.capabilities).toContain("mcp.servers");
  });

  test("/api/v1/health excludes mcp.servers when registry is absent", async () => {
    const host = makeHost();
    const res = await handleWebUIRequest(host, new Request(`${BASE}api/v1/health`));
    const body = (await res!.json()) as { capabilities: string[] };
    expect(body.capabilities).not.toContain("mcp.servers");
  });
});
