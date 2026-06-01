import { describe, test, expect } from "bun:test";
import { buildMcpCommandPayload } from "../../gateway-mcp";
import { McpServerRegistry } from "../../mcp/server-registry";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function makeRegistryWithServers(): Promise<McpServerRegistry> {
  const reg = new McpServerRegistry({ configPath: null });
  await reg.upsert({
    id: "alpha-server",
    kind: "http",
    endpoint: "https://alpha.example.com/mcp",
    description: "Alpha test server",
    allowedTools: ["echo", "ping"],
    tags: ["test", "alpha"],
    trusted: true,
  });
  await reg.upsert({
    id: "beta-server",
    kind: "stdio",
    endpoint: "/usr/local/bin/beta-mcp",
    description: "Beta stdio server",
    allowedTools: ["read"],
    tags: ["beta"],
    trusted: false,
  });
  return reg;
}

// ---------------------------------------------------------------------------
// No-registry path
// ---------------------------------------------------------------------------

describe("buildMcpCommandPayload — registry not configured", () => {
  test("returns isError with helpful message when context.registry is null", () => {
    const payload = buildMcpCommandPayload([], { registry: null });
    expect(payload.isError).toBe(true);
    expect(payload.output).toContain("not configured");
    expect(payload.data?.action).toBe("mcp_unconfigured");
  });

  test("returns isError when context.registry is undefined", () => {
    const payload = buildMcpCommandPayload([], {});
    expect(payload.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// /mcp (default → list)
// ---------------------------------------------------------------------------

describe("buildMcpCommandPayload — list", () => {
  test("empty registry → friendly empty message", async () => {
    const reg = new McpServerRegistry({ configPath: null });
    const payload = buildMcpCommandPayload([], { registry: reg.snapshot() });
    expect(payload.isError).toBeUndefined();
    expect(payload.output).toContain("No MCP servers configured");
    expect(payload.data?.action).toBe("mcp_list_empty");
  });

  test("populated registry → renders all servers with badges", async () => {
    const reg = await makeRegistryWithServers();
    const payload = buildMcpCommandPayload([], { registry: reg.snapshot() });

    expect(payload.output).toContain("MCP servers (2)");
    expect(payload.output).toContain("alpha-server");
    expect(payload.output).toContain("beta-server");
    expect(payload.output).toContain("[http]");
    expect(payload.output).toContain("[stdio]");
    expect(payload.output).toContain("[trusted]");
    expect(payload.output).toContain("[untrusted]");
  });

  test("explicit 'list' subcommand returns same shape", async () => {
    const reg = await makeRegistryWithServers();
    const a = buildMcpCommandPayload([], { registry: reg.snapshot() });
    const b = buildMcpCommandPayload(["list"], { registry: reg.snapshot() });
    expect(a.output).toBe(b.output);
  });

  test("data.serverIds contains all configured servers", async () => {
    const reg = await makeRegistryWithServers();
    const payload = buildMcpCommandPayload(["list"], { registry: reg.snapshot() });
    expect(payload.data?.serverIds).toEqual(["alpha-server", "beta-server"]);
  });
});

// ---------------------------------------------------------------------------
// /mcp status
// ---------------------------------------------------------------------------

describe("buildMcpCommandPayload — status", () => {
  test("includes health column when recordStatus has been called", async () => {
    const reg = new McpServerRegistry({ configPath: null });
    await reg.upsert({
      id: "healthy",
      kind: "http",
      endpoint: "https://h.example.com",
      description: "",
      allowedTools: [],
      tags: [],
      trusted: true,
    });
    await reg.recordStatus("healthy", "active");

    const payload = buildMcpCommandPayload(["status"], { registry: reg.snapshot() });
    expect(payload.output).toContain("[active]");
    expect(payload.output).toContain("last checked:");
  });
});

// ---------------------------------------------------------------------------
// /mcp show <id>
// ---------------------------------------------------------------------------

describe("buildMcpCommandPayload — show", () => {
  test("renders full detail for an existing server", async () => {
    const reg = await makeRegistryWithServers();
    const payload = buildMcpCommandPayload(["show", "alpha-server"], { registry: reg.snapshot() });

    expect(payload.output).toContain("MCP server: alpha-server");
    expect(payload.output).toContain("Kind:");
    expect(payload.output).toContain("Endpoint:");
    expect(payload.output).toContain("Trusted:");
    expect(payload.output).toContain("Added:");
    expect(payload.output).toContain("Allowed tools (2)");
    expect(payload.output).toContain("echo");
    expect(payload.output).toContain("ping");
    expect(payload.output).toContain("Tags: alpha, test");
  });

  test("returns isError + 404-style message for unknown id", async () => {
    const reg = await makeRegistryWithServers();
    const payload = buildMcpCommandPayload(["show", "nonexistent"], { registry: reg.snapshot() });
    expect(payload.isError).toBe(true);
    expect(payload.output).toContain("not found");
  });

  test("missing id returns missing-arg payload", async () => {
    const reg = await makeRegistryWithServers();
    const payload = buildMcpCommandPayload(["show"], { registry: reg.snapshot() });
    expect(payload.isError).toBe(true);
    expect(payload.output).toContain("Missing required argument");
  });

  test("sanitizes id input — strips slashes and other dangerous chars", async () => {
    const reg = await makeRegistryWithServers();
    const payload = buildMcpCommandPayload(["show", "../../etc/passwd"], { registry: reg.snapshot() });
    expect(payload.isError).toBe(true);
    // The first line is "MCP server not found: <sanitized-id>" — the sanitized id
    // must not contain slashes (the real traversal vector). Dots are allowed
    // since legitimate server ids can have dots in them.
    const firstLine = payload.output.split("\n")[0];
    expect(firstLine).not.toContain("/");
    expect(firstLine).not.toContain("\\");
    expect(payload.data?.action).toBe("mcp_show_not_found");
  });
});

// ---------------------------------------------------------------------------
// /mcp trust + untrust
// ---------------------------------------------------------------------------

describe("buildMcpCommandPayload — trust/untrust", () => {
  test("trust returns a queue-message + REST hint", async () => {
    const reg = await makeRegistryWithServers();
    const payload = buildMcpCommandPayload(["trust", "alpha-server"], { registry: reg.snapshot() });
    expect(payload.output).toContain("Trust request queued");
    expect(payload.output).toContain("POST /api/v1/mcp/servers/alpha-server/trust");
    expect(payload.data?.action).toBe("mcp_trust_request");
  });

  test("untrust returns a queue-message + REST hint", async () => {
    const reg = await makeRegistryWithServers();
    const payload = buildMcpCommandPayload(["untrust", "alpha-server"], { registry: reg.snapshot() });
    expect(payload.output).toContain("Untrust request queued");
    expect(payload.output).toContain("DELETE /api/v1/mcp/servers/alpha-server/trust");
  });

  test("trust without id returns missing-arg error", async () => {
    const reg = await makeRegistryWithServers();
    const payload = buildMcpCommandPayload(["trust"], { registry: reg.snapshot() });
    expect(payload.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// /mcp help
// ---------------------------------------------------------------------------

describe("buildMcpCommandPayload — help", () => {
  test("renders usage block for 'help'", async () => {
    const reg = await makeRegistryWithServers();
    const payload = buildMcpCommandPayload(["help"], { registry: reg.snapshot() });
    expect(payload.output).toContain("MCP server registry commands");
    expect(payload.output).toContain("/mcp list");
    expect(payload.output).toContain("POST   /api/v1/mcp/servers");
  });

  test("renders usage for --help and -h aliases", async () => {
    const reg = await makeRegistryWithServers();
    const a = buildMcpCommandPayload(["--help"], { registry: reg.snapshot() });
    const b = buildMcpCommandPayload(["-h"], { registry: reg.snapshot() });
    expect(a.output).toBe(b.output);
  });
});

// ---------------------------------------------------------------------------
// Unknown subcommand
// ---------------------------------------------------------------------------

describe("buildMcpCommandPayload — unknown subcommand", () => {
  test("returns isError + suggested usage", async () => {
    const reg = await makeRegistryWithServers();
    const payload = buildMcpCommandPayload(["nonsense"], { registry: reg.snapshot() });
    expect(payload.isError).toBe(true);
    expect(payload.output).toContain("Unknown /mcp subcommand");
  });
});

// ---------------------------------------------------------------------------
// Endpoint redaction
// ---------------------------------------------------------------------------

describe("buildMcpCommandPayload — endpoint redaction", () => {
  test("strips username/password/query from http endpoints", async () => {
    const reg = new McpServerRegistry({ configPath: null });
    await reg.upsert({
      id: "redact-test",
      kind: "http",
      endpoint: "https://user:pass@example.com/mcp?token=secret",
      description: "",
      allowedTools: [],
      tags: [],
      trusted: false,
    });
    const payload = buildMcpCommandPayload(["show", "redact-test"], { registry: reg.snapshot() });
    expect(payload.output).not.toContain("user:pass");
    expect(payload.output).not.toContain("token=secret");
  });
});
