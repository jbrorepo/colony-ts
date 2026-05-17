/**
 * Phase 74 Verification Script - Trusted MCP HTTP Server Configuration
 *
 * Proves HTTP MCP servers cannot be connected from ad-hoc config: a named
 * HTTPS endpoint definition must pass validation and carry an exact operator
 * approval signature before Colony creates the guarded fetch-backed transport.
 *
 * Run: bun run src/verify-phase74.ts
 */

import {
  InProcessMcpClient,
  buildHttpMcpServerApprovalRequest,
  buildHttpMcpServerOperatorInspection,
  createApprovedHttpMcpServerTrust,
  createTrustedHttpMcpClient,
  httpMcpServerTrustSignature,
  projectHttpMcpConnectionTrustEvent,
  type HttpMcpServerDefinition,
  type McpJsonRpcRequest,
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

function trustedDefinition(overrides: Partial<HttpMcpServerDefinition> = {}): HttpMcpServerDefinition {
  return {
    id: "phase74-fixture",
    endpoint: "https://mcp.phase74.example/rpc",
    bearerToken: "SHOULD_NOT_LEAK_TOKEN_12345",
    allowedTools: ["echo_text"],
    ...overrides,
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function fixtureResponse(request: McpJsonRpcRequest): unknown {
  if (request.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "phase74-http", version: "0.1.0" },
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
          { name: "echo_text", description: "Echo trusted text.", inputSchema: { type: "object" } },
          { name: "write_file", description: "Unsafe fixture tool.", inputSchema: { type: "object" } },
        ],
      },
    };
  }
  return {
    jsonrpc: "2.0",
    id: request.id,
    result: {
      content: [{ type: "text", text: `trusted-http:${String((request.params as { name?: unknown } | undefined)?.name)}` }],
      isError: false,
    },
  };
}

async function verifyApprovalRequestAndSignature(): Promise<void> {
  section("1. Approval Request and Signature");

  const definition = trustedDefinition();
  const request = buildHttpMcpServerApprovalRequest(definition);
  assertEqual(request.serverId, "phase74-fixture", "Approval request carries server id");
  assertEqual(request.riskLevel, "medium", "Approval request marks HTTP MCP connection as medium risk");
  assert(request.summary.includes("phase74-fixture"), "Approval request summary names the server");
  assert(request.details.includes("endpoint: https://mcp.phase74.example/rpc"), "Approval request exposes sanitized endpoint");
  assert(request.details.includes("auth: bearer token present"), "Approval request reports auth presence");
  assert(!request.details.includes("SHOULD_NOT_LEAK"), "Approval request does not expose bearer token");
  assert(request.warnings.some((warning) => warning.includes("remote MCP")), "Approval request warns about remote MCP access");

  const same = trustedDefinition();
  assertEqual(
    httpMcpServerTrustSignature(definition),
    httpMcpServerTrustSignature(same),
    "HTTP trust signature is stable for equivalent definitions",
  );
  assert(
    httpMcpServerTrustSignature(definition) !== httpMcpServerTrustSignature(trustedDefinition({ allowedTools: ["other_tool"] })),
    "HTTP trust signature changes when allowlist policy changes",
  );
  assert(
    httpMcpServerTrustSignature(definition) !== httpMcpServerTrustSignature(trustedDefinition({ bearerToken: "DIFFERENT_TOKEN_VALUE_1234567890" })),
    "HTTP trust signature changes when bearer token changes",
  );
  assert(
    httpMcpServerTrustSignature(trustedDefinition({ headers: { "x-colony-mode": "read-only" } }))
      !== httpMcpServerTrustSignature(trustedDefinition({ headers: { "x-colony-mode": "write-enabled" } })),
    "HTTP trust signature changes when custom header values change",
  );
}

async function verifyFailClosedConfig(): Promise<void> {
  section("2. Fail-Closed Config and Approval");

  const definition = trustedDefinition();
  await expectRejects(
    "Unapproved HTTP server definitions cannot create transports",
    () => createTrustedHttpMcpClient(definition, { approved: false, signature: httpMcpServerTrustSignature(definition) }),
    (error) => error.message.includes("MCP HTTP server is not trusted"),
  );
  await expectRejects(
    "Stale HTTP approval signatures cannot create transports",
    () => createTrustedHttpMcpClient(definition, { approved: true, signature: "mcp-http:stale" }),
    (error) => error.message.includes("MCP HTTP server is not trusted"),
  );
  await expectRejects(
    "Plain HTTP endpoints are rejected before transport creation",
    () => createTrustedHttpMcpClient(trustedDefinition({ endpoint: "http://mcp.phase74.example/rpc" }), createApprovedHttpMcpServerTrust(trustedDefinition({ endpoint: "http://mcp.phase74.example/rpc" }))),
    (error) => error.message.includes("MCP HTTP server config rejected"),
  );
  await expectRejects(
    "HTTP endpoint query strings are rejected before transport creation",
    () => createTrustedHttpMcpClient(trustedDefinition({ endpoint: "https://mcp.phase74.example/rpc?token=SHOULD_NOT_LEAK_TOKEN_12345" }), createApprovedHttpMcpServerTrust(trustedDefinition({ endpoint: "https://mcp.phase74.example/rpc?token=SHOULD_NOT_LEAK_TOKEN_12345" }))),
    (error) => error.message.includes("MCP HTTP server config rejected") && !error.message.includes("SHOULD_NOT_LEAK"),
  );
  await expectRejects(
    "HTTP endpoint fragments are rejected before transport creation",
    () => createTrustedHttpMcpClient(trustedDefinition({ endpoint: "https://mcp.phase74.example/rpc#secret" }), createApprovedHttpMcpServerTrust(trustedDefinition({ endpoint: "https://mcp.phase74.example/rpc#secret" }))),
    (error) => error.message.includes("MCP HTTP server config rejected"),
  );
  await expectRejects(
    "Secret-like bearer token labels are rejected generically",
    () => createTrustedHttpMcpClient(trustedDefinition({ bearerToken: "" }), createApprovedHttpMcpServerTrust(trustedDefinition({ bearerToken: "" }))),
    (error) => error.message.includes("MCP HTTP server config rejected"),
  );
}

async function verifyTrustedClientFlow(): Promise<void> {
  section("3. Trusted Client Flow");

  const definition = trustedDefinition();
  const seen: { calls: number; headers?: Headers; url?: string } = { calls: 0 };
  const session = createTrustedHttpMcpClient(definition, createApprovedHttpMcpServerTrust(definition), {
    timeoutMs: 1_000,
    resolveHostname: async () => [{ address: "93.184.216.34", family: 4 as const }],
    fetchImpl: async (input, init) => {
      seen.calls++;
      seen.url = String(input);
      seen.headers = new Headers(init?.headers);
      const request = JSON.parse(String(init?.body)) as McpJsonRpcRequest;
      return jsonResponse(fixtureResponse(request));
    },
  });
  assertEqual(session.context.origin, "https://mcp.phase74.example", "Trusted session derives stable HTTP origin");
  assertEqual(session.context.pluginId, "phase74-fixture", "Trusted session derives stable plugin id");
  assert(session.server.allowedMethods.includes("tools/call"), "Trusted session allows tools/call when tools are allowlisted");
  assert(!("httpTransport" in session), "Trusted session does not expose raw HTTP transport");
  assert(!("headers" in session.server), "Trusted session server snapshot does not expose raw header values");
  assert(!("bearerToken" in session.server), "Trusted session server snapshot does not expose bearer token");
  assert(!JSON.stringify(session.server).includes("SHOULD_NOT_LEAK"), "Trusted session server snapshot does not serialize bearer token");

  const client = new InProcessMcpClient(session.transport);
  const init = await client.initialize();
  assertEqual(init.serverInfo.name, "phase74-http", "Trusted HTTP client initializes server");
  const tools = await client.listTools();
  assertEqual(tools.tools.length, 2, "Trusted HTTP client can inspect server tools");
  const called = await client.callTool("echo_text", { text: "hello" });
  assertEqual(called.content[0]?.text, "trusted-http:echo_text", "Trusted HTTP client calls allowlisted tool");
  assertEqual(seen.url, "https://mcp.phase74.example/rpc", "Trusted HTTP client sends to sanitized endpoint");
  assertEqual(seen.headers?.get("authorization"), "Bearer SHOULD_NOT_LEAK_TOKEN_12345", "Trusted HTTP client sends bearer token only over trusted transport");
  await expectRejects(
    "Trusted HTTP client rejects non-allowlisted tool calls before fetch",
    () => client.callTool("write_file", { path: "out.txt" }),
    (error) => error.message.includes("MCP transport failed"),
  );
  assertEqual(seen.calls, 3, "Rejected trusted HTTP tool calls do not reach fetch");
}

async function verifyOperatorInspectionAndEvents(): Promise<void> {
  section("4. Operator Inspection and Trust Events");

  const definition = trustedDefinition({
    clientId: "SHOULD_NOT_LEAK_TOKEN_12345",
    pluginId: "phase74-plugin",
    allowedTools: ["echo_text", "inspect_status"],
  });
  const approval = createApprovedHttpMcpServerTrust(definition, { approvedBy: "operator", reason: "contains SHOULD_NOT_LEAK_TOKEN_12345" });
  const inspection = buildHttpMcpServerOperatorInspection(definition);
  const requested = projectHttpMcpConnectionTrustEvent(definition, undefined, {
    stage: "approval_requested",
    timestamp: "2026-04-29T05:21:56.346Z",
  });
  const allowed = projectHttpMcpConnectionTrustEvent(definition, approval, {
    stage: "connection_allowed",
    timestamp: "2026-04-29T05:21:57.000Z",
  });
  const stale = projectHttpMcpConnectionTrustEvent(definition, { approved: true, signature: "mcp-http:stale" }, {
    stage: "connection_denied",
  });

  assertEqual(inspection.serverId, "phase74-fixture", "Inspection carries server id");
  assertEqual(inspection.endpoint, "https://mcp.phase74.example/rpc", "Inspection exposes sanitized endpoint");
  assertEqual(inspection.auth.bearerTokenPresent, true, "Inspection exposes bearer-token presence");
  assertEqual(inspection.allowedTools.join(","), "echo_text,inspect_status", "Inspection exposes allowed tools");
  assertEqual(requested.eventType, "mcp_http_trust", "Trust event uses stable HTTP event type");
  assertEqual(requested.outcome, "pending", "Requested HTTP trust event is pending");
  assertEqual(allowed.outcome, "allowed", "Approved exact HTTP trust event is allowed");
  assertEqual(stale.outcome, "denied", "Stale HTTP trust event is denied");
  assertEqual(allowed.approval.reason, "<redacted>", "HTTP trust event redacts approval reason");
  assertEqual(stale.approval.signatureMatches, false, "HTTP trust event reports signature mismatch");

  const serialized = JSON.stringify([inspection, requested, allowed, stale]);
  assert(!serialized.includes("SHOULD_NOT_LEAK_TOKEN_12345"), "HTTP operator/audit surfaces do not leak bearer/client/approval secrets");

  const rejected = projectHttpMcpConnectionTrustEvent(trustedDefinition({ endpoint: "http://mcp.phase74.example/rpc" }), undefined, {
    stage: "config_rejected",
    timestamp: "2026-04-29T05:21:58.000Z",
  });
  assertEqual(rejected.outcome, "rejected", "Invalid HTTP config event is rejected");
  assertEqual(rejected.config.valid, false, "Invalid HTTP config event marks config invalid");
  assert(!JSON.stringify(rejected).includes("mcp.phase74.example"), "Invalid HTTP config event does not echo rejected endpoint");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 74 Verification (Trusted MCP HTTP Server Configuration)\n");

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

  console.log("\nPhase 74: trusted MCP HTTP server configuration is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
