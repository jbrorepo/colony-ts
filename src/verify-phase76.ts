/**
 * Phase 76 Verification Script - Managed Plugin MCP Sidecar Lifecycle
 *
 * Proves trusted plugin sidecars have a managed connection path: the sidecar
 * must initialize successfully, match any signed handshake expectations, close
 * on failed handshake, and expose lifecycle truth without raw transport access.
 *
 * Run: bun run src/verify-phase76.ts
 */

import {
  connectTrustedPluginMcpClient,
  createApprovedPluginMcpSidecarTrust,
  pluginMcpSidecarTrustSignature,
  type McpJsonRpcRequest,
  type McpJsonRpcResponse,
  type McpTransport,
  type McpTransportContext,
  type PluginMcpSidecarDefinition,
} from "./mcp";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

async function expectRejects(label: string, run: () => Promise<unknown> | unknown, check?: (error: Error) => boolean): Promise<void> {
  try {
    await run();
    assert(false, label);
  } catch (error) {
    assert(error instanceof Error && (check ? check(error) : true), label);
  }
}

function pluginDefinition(overrides: Partial<PluginMcpSidecarDefinition> = {}): PluginMcpSidecarDefinition {
  return {
    id: "phase76-plugin",
    packageName: "@colony/plugin-phase76",
    packageVersion: "2.0.0",
    packageSource: "skills-main",
    packageDigest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    sidecarId: "phase76-sidecar",
    sidecarKind: "local-sidecar",
    declaredCapabilities: ["mcp.tools"],
    allowedTools: ["echo_text"],
    expectedProtocolVersion: "2024-11-05",
    expectedServerName: "phase76-plugin-sidecar",
    expectedServerVersion: "2.0.0",
    ...overrides,
  };
}

class LifecyclePluginTransport implements McpTransport {
  calls = 0;
  closeCalls = 0;
  contexts: McpTransportContext[] = [];
  private closeFailuresRemaining: number;

  constructor(
    private readonly initResult: { protocolVersion: string; name: string; version: string } = {
      protocolVersion: "2024-11-05",
      name: "phase76-plugin-sidecar",
      version: "2.0.0",
    },
    private readonly closeFailure: { failures: number; message: string } = { failures: 0, message: "close failed" },
  ) {
    this.closeFailuresRemaining = closeFailure.failures;
  }

  async send(request: McpJsonRpcRequest, context: McpTransportContext = {}): Promise<McpJsonRpcResponse> {
    this.calls++;
    this.contexts.push({ ...context });
    if (request.method === "initialize") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: this.initResult.protocolVersion,
          serverInfo: { name: this.initResult.name, version: this.initResult.version },
          capabilities: { tools: { listChanged: false } },
        },
      };
    }
    if (request.method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: [
            { name: "echo_text", description: "Echo plugin text.", inputSchema: { type: "object" } },
            { name: "dangerous_tool", description: "Unsafe fixture tool.", inputSchema: { type: "object" } },
          ],
        },
      };
    }
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        content: [{ type: "text", text: `managed-plugin:${String((request.params as { name?: unknown } | undefined)?.name)}` }],
        isError: false,
      },
    };
  }

  async close(): Promise<void> {
    this.closeCalls++;
    if (this.closeFailuresRemaining > 0) {
      this.closeFailuresRemaining--;
      throw new Error(this.closeFailure.message);
    }
  }
}

async function verifyManagedConnection(): Promise<void> {
  section("1. Managed Connection and Lifecycle");

  const definition = pluginDefinition();
  const transport = new LifecyclePluginTransport();
  const session = await connectTrustedPluginMcpClient(definition, createApprovedPluginMcpSidecarTrust(definition), {
    sidecarTransport: transport,
  });

  assertEqual(session.lifecycle.state, "connected", "Managed plugin sidecar starts connected after initialize");
  assertEqual(session.lifecycle.protocolVersion, "2024-11-05", "Managed lifecycle records negotiated protocol version");
  assertEqual(session.lifecycle.serverInfo.name, "phase76-plugin-sidecar", "Managed lifecycle records server name");
  assertEqual(session.lifecycle.serverInfo.version, "2.0.0", "Managed lifecycle records server version");
  assertEqual(transport.calls, 1, "Managed connection performs exactly one initialize during connect");
  assertEqual(transport.contexts[0]?.transportKind, "plugin", "Managed initialize uses pinned plugin context");
  assert(!("sidecarTransport" in session), "Managed session does not expose raw sidecar transport");

  const called = await session.client.callTool("echo_text", { text: "hello" });
  assertEqual(called.content[0]?.text, "managed-plugin:echo_text", "Managed plugin client calls allowlisted sidecar tool after handshake");

  await expectRejects(
    "Managed plugin client rejects non-allowlisted tools before sidecar send",
    () => session.client.callTool("dangerous_tool", {}),
    (error) => error.message.includes("MCP transport failed"),
  );
  assertEqual(transport.calls, 2, "Rejected managed sidecar tool calls do not reach sidecar transport");
  await expectRejects(
    "Managed plugin sidecar rejects post-connect initialize replays",
    () => session.client.initialize(),
    (error) => error.message.includes("MCP transport failed"),
  );
  assertEqual(transport.calls, 2, "Rejected post-connect initialize does not reach sidecar transport");

  await session.close();
  assertEqual(session.lifecycle.state, "closed", "Managed plugin sidecar lifecycle marks closed");
  assertEqual(transport.closeCalls, 1, "Managed plugin sidecar close reaches sidecar transport");
  await session.close();
  assertEqual(transport.closeCalls, 1, "Managed plugin sidecar close is idempotent");
  await expectRejects(
    "Managed plugin sidecar rejects sends after close",
    () => session.client.listTools(),
    (error) => error.message.includes("MCP transport failed"),
  );
  assertEqual(transport.calls, 2, "Managed plugin sidecar post-close calls do not reach sidecar transport");
}

async function verifyCloseFailureTruthAndRedaction(): Promise<void> {
  section("2. Close Failure Truth and Redaction");

  const transport = new LifecyclePluginTransport(undefined, {
    failures: 1,
    message: "close failed SHOULD_NOT_LEAK_TOKEN_CLOSE_12345",
  });
  const session = await connectTrustedPluginMcpClient(pluginDefinition(), createApprovedPluginMcpSidecarTrust(pluginDefinition()), {
    sidecarTransport: transport,
  });

  await expectRejects(
    "Managed plugin sidecar close failures are generic and redacted",
    () => session.close(),
    (error) => error.message === "MCP plugin sidecar close failed" && !error.message.includes("SHOULD_NOT_LEAK"),
  );
  assertEqual(session.lifecycle.state, "connected", "Managed plugin sidecar lifecycle stays connected after failed close");
  assertEqual(transport.closeCalls, 1, "Failed managed plugin sidecar close reaches sidecar once");

  const tools = await session.client.listTools();
  assertEqual(tools.tools.length, 2, "Managed plugin client remains usable after failed close truthfully leaves session connected");

  await session.close();
  assertEqual(session.lifecycle.state, "closed", "Managed plugin sidecar lifecycle marks closed after retry succeeds");
  assertEqual(transport.closeCalls, 2, "Managed plugin sidecar close can retry after failed close");
  await expectRejects(
    "Managed plugin sidecar rejects sends after retry close",
    () => session.client.listTools(),
    (error) => error.message.includes("MCP transport failed"),
  );
}

async function verifyHandshakeExpectations(): Promise<void> {
  section("3. Signed Handshake Expectations");

  const definition = pluginDefinition();
  assert(
    pluginMcpSidecarTrustSignature(definition) !== pluginMcpSidecarTrustSignature(pluginDefinition({ expectedServerName: "other-sidecar" })),
    "Plugin trust signature changes when expected sidecar server name changes",
  );
  assert(
    pluginMcpSidecarTrustSignature(definition) !== pluginMcpSidecarTrustSignature(pluginDefinition({ expectedProtocolVersion: "2099-01-01" })),
    "Plugin trust signature changes when expected sidecar protocol version changes",
  );

  await expectRejects(
    "Stale approvals cannot connect when handshake expectations change",
    () => connectTrustedPluginMcpClient(
      pluginDefinition({ expectedServerName: "other-sidecar" }),
      createApprovedPluginMcpSidecarTrust(definition),
      { sidecarTransport: new LifecyclePluginTransport() },
    ),
    (error) => error.message.includes("MCP plugin sidecar is not trusted"),
  );
}

async function verifyFailedHandshakeClosesSidecar(): Promise<void> {
  section("4. Failed Handshake Cleanup and Redaction");

  const transport = new LifecyclePluginTransport({
    protocolVersion: "2024-11-05",
    name: "SHOULD_NOT_LEAK_TOKEN_12345",
    version: "2.0.0",
  });
  await expectRejects(
    "Managed plugin sidecar closes transport when handshake identity mismatches",
    () => connectTrustedPluginMcpClient(pluginDefinition(), createApprovedPluginMcpSidecarTrust(pluginDefinition()), {
      sidecarTransport: transport,
    }),
    (error) => error.message.includes("MCP plugin sidecar handshake failed") && !error.message.includes("SHOULD_NOT_LEAK"),
  );
  assertEqual(transport.closeCalls, 1, "Failed plugin sidecar handshake closes sidecar transport");

  const malformed = new LifecyclePluginTransport({
    protocolVersion: "WRONG_PROTOCOL",
    name: "phase76-plugin-sidecar",
    version: "2.0.0",
  });
  await expectRejects(
    "Managed plugin sidecar rejects protocol mismatches generically",
    () => connectTrustedPluginMcpClient(pluginDefinition(), createApprovedPluginMcpSidecarTrust(pluginDefinition()), {
      sidecarTransport: malformed,
    }),
    (error) => error.message.includes("MCP plugin sidecar handshake failed"),
  );
  assertEqual(malformed.closeCalls, 1, "Protocol mismatch closes sidecar transport");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 76 Verification (Managed Plugin MCP Sidecar Lifecycle)\n");

  await verifyManagedConnection();
  await verifyCloseFailureTruthAndRedaction();
  await verifyHandshakeExpectations();
  await verifyFailedHandshakeClosesSidecar();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 76: managed plugin MCP sidecar lifecycle is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
