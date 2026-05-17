/**
 * Phase 75 Verification Script - Trusted Plugin MCP Sidecar Configuration
 *
 * Proves plugin MCP sidecars cannot be connected from ad-hoc config: a named
 * plugin package and sidecar identity must pass validation and carry an exact
 * operator approval signature before Colony creates a guarded plugin transport.
 *
 * Run: bun run src/verify-phase75.ts
 */

import {
  InProcessMcpClient,
  buildPluginMcpSidecarApprovalRequest,
  buildPluginMcpSidecarOperatorInspection,
  createApprovedPluginMcpSidecarTrust,
  createTrustedPluginMcpClient,
  pluginMcpSidecarTrustSignature,
  projectPluginMcpSidecarTrustEvent,
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
    id: "phase75-plugin",
    packageName: "@colony/plugin-phase75",
    packageVersion: "1.2.3",
    packageSource: "skills-main",
    packageDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    sidecarId: "phase75-sidecar",
    sidecarKind: "local-sidecar",
    declaredCapabilities: ["mcp.tools", "mcp.resources"],
    allowedTools: ["echo_text"],
    ...overrides,
  };
}

function fixtureResponse(request: McpJsonRpcRequest): McpJsonRpcResponse {
  if (request.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "phase75-plugin-sidecar", version: "1.0.0" },
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
          { name: "delete_workspace", description: "Unsafe fixture tool.", inputSchema: { type: "object" } },
        ],
      },
    };
  }
  return {
    jsonrpc: "2.0",
    id: request.id,
    result: {
      content: [{ type: "text", text: `plugin-sidecar:${String((request.params as { name?: unknown } | undefined)?.name)}` }],
      isError: false,
    },
  };
}

class FixturePluginTransport implements McpTransport {
  calls = 0;
  contexts: McpTransportContext[] = [];

  async send(request: McpJsonRpcRequest, context: McpTransportContext = {}): Promise<McpJsonRpcResponse> {
    this.calls++;
    this.contexts.push({ ...context });
    return fixtureResponse(request);
  }
}

class SlowPluginTransport implements McpTransport {
  async send(request: McpJsonRpcRequest, context: McpTransportContext = {}): Promise<McpJsonRpcResponse> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return fixtureResponse(request);
  }
}

async function verifyApprovalRequestAndSignature(): Promise<void> {
  section("1. Approval Request and Signature");

  const definition = pluginDefinition();
  const request = buildPluginMcpSidecarApprovalRequest(definition);
  assertEqual(request.serverId, "phase75-plugin", "Approval request carries plugin sidecar id");
  assertEqual(request.riskLevel, "high", "Approval request marks plugin sidecar as high risk");
  assert(request.summary.includes("phase75-plugin"), "Approval request summary names the plugin sidecar");
  assert(request.signature.startsWith("mcp-plugin:"), "Plugin trust signature uses plugin-specific namespace");
  assert(!request.signature.startsWith("mcp-http:"), "Plugin trust signature does not reuse HTTP namespace");
  assert(!request.signature.startsWith("mcp-stdio:"), "Plugin trust signature does not reuse stdio namespace");
  assert(request.details.includes("@colony/plugin-phase75"), "Approval request exposes safe plugin package name");
  assert(request.details.includes("phase75-sidecar"), "Approval request exposes sidecar id");
  assert(request.warnings.some((warning) => warning.includes("plugin sidecars")), "Approval request warns about plugin sidecars");

  const same = pluginDefinition();
  assertEqual(
    pluginMcpSidecarTrustSignature(definition),
    pluginMcpSidecarTrustSignature(same),
    "Plugin trust signature is stable for equivalent definitions",
  );
  assert(
    pluginMcpSidecarTrustSignature(definition) !== pluginMcpSidecarTrustSignature(pluginDefinition({ packageDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" })),
    "Plugin trust signature changes when package digest changes",
  );
  assert(
    pluginMcpSidecarTrustSignature(definition) !== pluginMcpSidecarTrustSignature(pluginDefinition({ declaredCapabilities: ["mcp.tools"] })),
    "Plugin trust signature changes when declared capabilities change",
  );
  assert(
    pluginMcpSidecarTrustSignature(definition) !== pluginMcpSidecarTrustSignature(pluginDefinition({ allowedTools: ["other_tool"] })),
    "Plugin trust signature changes when allowlist policy changes",
  );
}

async function verifyFailClosedConfig(): Promise<void> {
  section("2. Fail-Closed Config and Approval");

  const definition = pluginDefinition();
  const transport = new FixturePluginTransport();
  await expectRejects(
    "Unapproved plugin sidecars cannot create transports",
    () => createTrustedPluginMcpClient(definition, { approved: false, signature: pluginMcpSidecarTrustSignature(definition) }, { sidecarTransport: transport }),
    (error) => error.message.includes("MCP plugin sidecar is not trusted"),
  );
  await expectRejects(
    "Stale plugin sidecar approval signatures cannot create transports",
    () => createTrustedPluginMcpClient(definition, { approved: true, signature: "mcp-plugin:stale" }, { sidecarTransport: transport }),
    (error) => error.message.includes("MCP plugin sidecar is not trusted"),
  );
  await expectRejects(
    "Plugin package names with shell metacharacters are rejected generically",
    () => createTrustedPluginMcpClient(pluginDefinition({ packageName: "@colony/plugin;rm" }), createApprovedPluginMcpSidecarTrust(pluginDefinition({ packageName: "@colony/plugin;rm" })), { sidecarTransport: transport }),
    (error) => error.message.includes("MCP plugin sidecar config rejected"),
  );
  await expectRejects(
    "Plugin source query secrets are rejected generically",
    () => createTrustedPluginMcpClient(pluginDefinition({ packageSource: "https://plugins.example/package?token=SHOULD_NOT_LEAK_TOKEN_12345" }), createApprovedPluginMcpSidecarTrust(pluginDefinition({ packageSource: "https://plugins.example/package?token=SHOULD_NOT_LEAK_TOKEN_12345" })), { sidecarTransport: transport }),
    (error) => error.message.includes("MCP plugin sidecar config rejected") && !error.message.includes("SHOULD_NOT_LEAK"),
  );
  await expectRejects(
    "Plugin sidecar ids with secret-like labels are rejected generically",
    () => createTrustedPluginMcpClient(pluginDefinition({ sidecarId: "SHOULD_NOT_LEAK_TOKEN_12345" }), createApprovedPluginMcpSidecarTrust(pluginDefinition({ sidecarId: "SHOULD_NOT_LEAK_TOKEN_12345" })), { sidecarTransport: transport }),
    (error) => error.message.includes("MCP plugin sidecar config rejected"),
  );
}

async function verifyTrustedClientFlow(): Promise<void> {
  section("3. Trusted Client Flow");

  const definition = pluginDefinition();
  const fixtureTransport = new FixturePluginTransport();
  const session = createTrustedPluginMcpClient(definition, createApprovedPluginMcpSidecarTrust(definition), {
    sidecarTransport: fixtureTransport,
    timeoutMs: 1_000,
  });

  assertEqual(session.context.transportKind, "plugin", "Trusted session pins plugin transport kind");
  assertEqual(session.context.origin, "plugin://@colony/plugin-phase75/phase75-sidecar", "Trusted session derives stable plugin origin");
  assertEqual(session.context.pluginId, "phase75-plugin", "Trusted session derives stable plugin id");
  assert(session.server.allowedMethods.includes("tools/call"), "Trusted session allows tools/call when tools are allowlisted");
  assert(!("sidecarTransport" in session), "Trusted session does not expose raw plugin sidecar transport");

  const client = new InProcessMcpClient(session.transport);
  const init = await client.initialize();
  assertEqual(init.serverInfo.name, "phase75-plugin-sidecar", "Trusted plugin client initializes sidecar server");
  const tools = await client.listTools();
  assertEqual(tools.tools.length, 2, "Trusted plugin client can inspect sidecar tools");
  const called = await client.callTool("echo_text", { text: "hello" });
  assertEqual(called.content[0]?.text, "plugin-sidecar:echo_text", "Trusted plugin client calls allowlisted sidecar tool");
  assertEqual(fixtureTransport.contexts[0]?.transportKind, "plugin", "Plugin sidecar receives pinned plugin context");
  await expectRejects(
    "Trusted plugin client rejects non-allowlisted tool calls before sidecar send",
    () => client.callTool("delete_workspace", { path: "." }),
    (error) => error.message.includes("MCP transport failed"),
  );
  assertEqual(fixtureTransport.calls, 3, "Rejected plugin sidecar tool calls do not reach sidecar transport");

  const signedTimeoutDefinition = pluginDefinition({ timeoutMs: 1 });
  const slowSession = createTrustedPluginMcpClient(
    signedTimeoutDefinition,
    createApprovedPluginMcpSidecarTrust(signedTimeoutDefinition),
    {
      sidecarTransport: new SlowPluginTransport(),
      timeoutMs: 5_000,
    },
  );
  await expectRejects(
    "Runtime options cannot weaken signed plugin sidecar timeout policy",
    () => slowSession.client.initialize(),
    (error) => error.message.includes("MCP transport failed"),
  );

  const pinnedContextTransport = new FixturePluginTransport();
  const pinnedContextSession = createTrustedPluginMcpClient(definition, createApprovedPluginMcpSidecarTrust(definition), {
    sidecarTransport: pinnedContextTransport,
  });
  pinnedContextSession.context.transportKind = "http";
  pinnedContextSession.context.clientId = "mutated-client";
  await pinnedContextSession.client.initialize();
  assertEqual(pinnedContextTransport.contexts[0]?.transportKind, "plugin", "Plugin transport context stays pinned after session context mutation");
  assertEqual(pinnedContextTransport.contexts[0]?.clientId, "colony", "Plugin transport client id stays pinned after session context mutation");
}

async function verifyOperatorInspectionAndEvents(): Promise<void> {
  section("4. Operator Inspection and Trust Events");

  const definition = pluginDefinition({
    clientId: "SHOULD_NOT_LEAK_TOKEN_12345",
    packageSource: "skills-main",
    declaredCapabilities: ["mcp.tools", "mcp.prompts"],
  });
  const approval = createApprovedPluginMcpSidecarTrust(definition, { approvedBy: "operator", reason: "contains SHOULD_NOT_LEAK_TOKEN_12345" });
  const inspection = buildPluginMcpSidecarOperatorInspection(definition);
  const requested = projectPluginMcpSidecarTrustEvent(definition, undefined, {
    stage: "approval_requested",
    timestamp: "2026-04-29T05:21:56.346Z",
  });
  const allowed = projectPluginMcpSidecarTrustEvent(definition, approval, {
    stage: "connection_allowed",
    timestamp: "2026-04-29T05:21:57.000Z",
  });
  const stale = projectPluginMcpSidecarTrustEvent(definition, { approved: true, signature: "mcp-plugin:stale" }, {
    stage: "connection_denied",
  });

  assertEqual(inspection.serverId, "phase75-plugin", "Inspection carries plugin id");
  assertEqual(inspection.package.name, "@colony/plugin-phase75", "Inspection exposes safe package name");
  assertEqual(inspection.sidecar.id, "phase75-sidecar", "Inspection exposes safe sidecar id");
  assertEqual(inspection.capabilities.join(","), "mcp.prompts,mcp.tools", "Inspection exposes sorted declared capabilities");
  assertEqual(requested.eventType, "mcp_plugin_trust", "Trust event uses stable plugin event type");
  assertEqual(requested.outcome, "pending", "Requested plugin trust event is pending");
  assertEqual(allowed.outcome, "allowed", "Approved exact plugin trust event is allowed");
  assertEqual(stale.outcome, "denied", "Stale plugin trust event is denied");
  assertEqual(allowed.approval.reason, "<redacted>", "Plugin trust event redacts approval reason");
  assertEqual(stale.approval.signatureMatches, false, "Plugin trust event reports signature mismatch");

  const serialized = JSON.stringify([inspection, requested, allowed, stale]);
  assert(!serialized.includes("SHOULD_NOT_LEAK_TOKEN_12345"), "Plugin operator/audit surfaces do not leak client/approval secrets");

  const rejected = projectPluginMcpSidecarTrustEvent(pluginDefinition({ packageSource: "https://plugins.example/package?token=SHOULD_NOT_LEAK_TOKEN_12345" }), undefined, {
    stage: "config_rejected",
    timestamp: "2026-04-29T05:21:58.000Z",
  });
  assertEqual(rejected.outcome, "rejected", "Invalid plugin config event is rejected");
  assertEqual(rejected.config.valid, false, "Invalid plugin config event marks config invalid");
  assert(!JSON.stringify(rejected).includes("plugins.example"), "Invalid plugin config event does not echo rejected source");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 75 Verification (Trusted Plugin MCP Sidecar Configuration)\n");

  await verifyApprovalRequestAndSignature();
  await verifyFailClosedConfig();
  await verifyTrustedClientFlow();
  await verifyOperatorInspectionAndEvents();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 75: trusted plugin MCP sidecar configuration is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
