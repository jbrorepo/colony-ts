/**
 * Phase 73 Verification Script - MCP HTTP Transport Foundation
 *
 * Proves a fetch-backed HTTP MCP transport can carry JSON-RPC requests through
 * the existing client/guard seam while bounding payloads and sanitizing remote
 * failures before HTTP/plugin transports become operator-facing.
 *
 * Run: bun run src/verify-phase73.ts
 */

import {
  GuardedMcpTransport,
  InProcessMcpClient,
  type McpJsonRpcRequest,
  type McpTransportContext,
} from "./mcp";
import { HttpMcpTransport } from "./mcp/http-transport";

let passed = 0;
let failed = 0;
const safeResolveHostname = async () => [{ address: "93.184.216.34", family: 4 as const }];

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

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function fixtureResponse(request: McpJsonRpcRequest): unknown {
  if (request.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "phase73-http", version: "0.1.0" },
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
      content: [{ type: "text", text: `http:${String((request.params as { name?: unknown } | undefined)?.name)}` }],
      isError: false,
    },
  };
}

async function verifyHttpClientFlow(): Promise<void> {
  section("1. HTTP Client Flow");

  const seen: { url?: string; method?: string; headers?: Headers; body?: McpJsonRpcRequest; signals: AbortSignal[] } = { signals: [] };
  const transport = new HttpMcpTransport({
    endpoint: "https://mcp.example.test/rpc?token=SHOULD_NOT_LEAK_TOKEN_12345",
    bearerToken: "SHOULD_NOT_LEAK_TOKEN_12345",
    headers: { "x-safe": "1" },
    resolveHostname: safeResolveHostname,
    fetchImpl: async (input, init) => {
      seen.url = String(input);
      seen.method = init?.method;
      seen.headers = new Headers(init?.headers);
      assertEqual(init?.redirect, "error", "HTTP transport disables redirects");
      seen.signals.push(init?.signal as AbortSignal);
      seen.body = JSON.parse(String(init?.body)) as McpJsonRpcRequest;
      return jsonResponse(fixtureResponse(seen.body));
    },
  });
  const client = new InProcessMcpClient(transport);

  const init = await client.initialize();
  assertEqual(init.serverInfo.name, "phase73-http", "HTTP MCP client initializes through fetch transport");
  const tools = await client.listTools();
  assertEqual(tools.tools.length, 2, "HTTP MCP client lists tools through fetch transport");
  const call = await client.callTool("echo_text", { text: "hello" });
  assertEqual(call.content[0]?.text, "http:echo_text", "HTTP MCP client calls tools through fetch transport");
  assertEqual(seen.url, "https://mcp.example.test/rpc?token=SHOULD_NOT_LEAK_TOKEN_12345", "HTTP transport sends to configured endpoint");
  assertEqual(seen.method, "POST", "HTTP transport uses POST");
  assertEqual(seen.headers?.get("content-type"), "application/json", "HTTP transport sends JSON content type");
  assertEqual(seen.headers?.get("accept"), "application/json", "HTTP transport requests JSON responses");
  assertEqual(seen.headers?.get("authorization"), "Bearer SHOULD_NOT_LEAK_TOKEN_12345", "HTTP transport sends bearer token header");
  assertEqual(seen.headers?.get("x-safe"), "1", "HTTP transport sends safe custom headers");
  assertEqual(seen.body?.jsonrpc, "2.0", "HTTP transport sends JSON-RPC envelope");
  assert(seen.signals.every((signal) => signal instanceof AbortSignal), "HTTP transport passes abort signals to fetch");

  const diagnostics = transport.diagnostics();
  const serializedDiagnostics = JSON.stringify(diagnostics);
  assertEqual(diagnostics.endpoint, "https://mcp.example.test/rpc", "HTTP diagnostics redact query string");
  assert(diagnostics.headerNames.includes("authorization"), "HTTP diagnostics list header names");
  assert(!serializedDiagnostics.includes("SHOULD_NOT_LEAK"), "HTTP diagnostics do not leak bearer/query secrets");
}

async function verifyGuardsAndFailures(): Promise<void> {
  section("2. Guard, Bounds, and Sanitized Failures");

  let calls = 0;
  const context: McpTransportContext = {
    transportKind: "http",
    origin: "https://mcp.example.test",
    pluginId: "phase73-http",
    clientId: "phase73",
  };
  const guarded = new GuardedMcpTransport(
    new HttpMcpTransport({
      endpoint: "https://mcp.example.test/rpc",
      resolveHostname: safeResolveHostname,
      fetchImpl: async (_input, init) => {
        calls++;
        const request = JSON.parse(String(init?.body)) as McpJsonRpcRequest;
        return jsonResponse(fixtureResponse(request));
      },
    }),
    {
      allowedMethods: ["initialize", "tools/list", "tools/call"],
      allowedTools: ["echo_text"],
      allowedOrigins: ["https://mcp.example.test"],
      allowedPluginIds: ["phase73-http"],
      timeoutMs: 500,
    },
  );

  const allowed = await guarded.send({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "echo_text", arguments: {} },
  }, context);
  assertEqual(allowed.id, 1, "Guarded HTTP transport forwards allowlisted tool calls");
  await expectRejects(
    "Guarded HTTP transport rejects non-allowlisted tool calls before fetch",
    () => guarded.send({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "write_file", arguments: {} },
    }, context),
    (error) => error.message.includes("MCP tool not allowed"),
  );
  assertEqual(calls, 1, "Rejected guarded HTTP calls do not reach fetch");

  await expectRejects(
    "HTTP transport rejects unsupported URL schemes",
    () => new HttpMcpTransport({ endpoint: "file:///tmp/mcp" }).send({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    (error) => error.message === "MCP HTTP transport failed",
  );
  await expectRejects(
    "HTTP transport rejects plain HTTP endpoints",
    () => new HttpMcpTransport({ endpoint: "http://mcp.example.test/rpc" }).send({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    (error) => error.message === "MCP HTTP transport failed",
  );
  await expectRejects(
    "HTTP transport rejects localhost SSRF endpoints",
    () => new HttpMcpTransport({ endpoint: "https://localhost/rpc" }).send({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    (error) => error.message === "MCP HTTP transport failed",
  );
  await expectRejects(
    "HTTP transport rejects loopback SSRF endpoints",
    () => new HttpMcpTransport({ endpoint: "https://127.0.0.1/rpc" }).send({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    (error) => error.message === "MCP HTTP transport failed",
  );
  await expectRejects(
    "HTTP transport rejects private-network SSRF endpoints",
    () => new HttpMcpTransport({ endpoint: "https://192.168.1.10/rpc" }).send({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    (error) => error.message === "MCP HTTP transport failed",
  );
  await expectRejects(
    "HTTP transport rejects metadata SSRF endpoints",
    () => new HttpMcpTransport({ endpoint: "https://169.254.169.254/latest/meta-data" }).send({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    (error) => error.message === "MCP HTTP transport failed",
  );
  await expectRejects(
    "HTTP transport rejects IPv6 link-local SSRF endpoints",
    () => new HttpMcpTransport({ endpoint: "https://[fe90::1]/rpc" }).send({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    (error) => error.message === "MCP HTTP transport failed",
  );
  await expectRejects(
    "HTTP transport rejects IPv4-mapped IPv6 loopback endpoints",
    () => new HttpMcpTransport({ endpoint: "https://[::ffff:7f00:1]/rpc" }).send({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    (error) => error.message === "MCP HTTP transport failed",
  );
  let dnsPrivateFetches = 0;
  await expectRejects(
    "HTTP transport rejects DNS-resolved private endpoints before fetch",
    () => new HttpMcpTransport({
      endpoint: "https://public-name.example.test/rpc",
      resolveHostname: async () => [{ address: "10.0.0.5", family: 4 as const }],
      fetchImpl: async () => {
        dnsPrivateFetches++;
        return jsonResponse({});
      },
    }).send({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    (error) => error.message === "MCP HTTP transport failed",
  );
  assertEqual(dnsPrivateFetches, 0, "DNS-resolved private endpoints do not reach fetch");
  await expectRejects(
    "HTTP transport rejects URL credentials",
    () => new HttpMcpTransport({ endpoint: "https://user:SHOULD_NOT_LEAK_TOKEN_12345@mcp.example.test/rpc" }).send({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    (error) => error.message === "MCP HTTP transport failed" && !error.message.includes("SHOULD_NOT_LEAK"),
  );
  await expectRejects(
    "HTTP transport rejects header injection",
    () => new HttpMcpTransport({ endpoint: "https://mcp.example.test/rpc", headers: { "x-bad": "ok\r\nx-leak: nope" } }).send({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    (error) => error.message === "MCP HTTP transport failed",
  );
  await expectRejects(
    "HTTP transport rejects forbidden custom headers",
    () => new HttpMcpTransport({ endpoint: "https://mcp.example.test/rpc", headers: { cookie: "session=SHOULD_NOT_LEAK_TOKEN_12345" } }).send({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    (error) => error.message === "MCP HTTP transport failed" && !error.message.includes("SHOULD_NOT_LEAK"),
  );
  await expectRejects(
    "HTTP transport rejects empty bearer tokens",
    () => new HttpMcpTransport({ endpoint: "https://mcp.example.test/rpc", bearerToken: "" }).send({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    (error) => error.message === "MCP HTTP transport failed",
  );
  let unsafeRequestFetches = 0;
  const unsafeRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    toJSON() {
      return { jsonrpc: "2.0", id: 1, method: "initialize", params: "SHOULD_NOT_LEAK_TOKEN_12345" };
    },
  } as unknown as McpJsonRpcRequest;
  await expectRejects(
    "HTTP transport rejects request toJSON hooks before fetch",
    () => new HttpMcpTransport({
      endpoint: "https://mcp.example.test/rpc",
      resolveHostname: safeResolveHostname,
      fetchImpl: async () => {
        unsafeRequestFetches++;
        return jsonResponse({});
      },
    }).send(unsafeRequest),
    (error) => error.message === "MCP HTTP transport failed",
  );
  assertEqual(unsafeRequestFetches, 0, "Unsafe request hooks do not reach fetch");
  await expectRejects(
    "HTTP transport bounds request bytes before fetch",
    () => new HttpMcpTransport({
      endpoint: "https://mcp.example.test/rpc",
      resolveHostname: safeResolveHostname,
      maxRequestBytes: 16,
      fetchImpl: async () => jsonResponse({}),
    }).send({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    (error) => error.message === "MCP HTTP transport failed",
  );
  let oversizedResponseFetches = 0;
  await expectRejects(
    "HTTP transport bounds response bytes before parsing",
    () => new HttpMcpTransport({
      endpoint: "https://mcp.example.test/rpc",
      resolveHostname: safeResolveHostname,
      maxResponseBytes: 8,
      fetchImpl: async () => {
        oversizedResponseFetches++;
        return new Response(`{"jsonrpc":"2.0","id":1,"result":"${"x".repeat(100)}"}`, { status: 200 });
      },
    }).send({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    (error) => error.message === "MCP HTTP transport failed",
  );
  assertEqual(oversizedResponseFetches, 1, "Oversized HTTP response test reaches fetch once");
  await expectRejects(
    "HTTP transport sanitizes non-2xx response errors",
    () => new HttpMcpTransport({
      endpoint: "https://mcp.example.test/rpc",
      resolveHostname: safeResolveHostname,
      fetchImpl: async () => new Response("SHOULD_NOT_LEAK_TOKEN_12345", { status: 500 }),
    }).send({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    (error) => error.message === "MCP HTTP transport failed" && !error.message.includes("SHOULD_NOT_LEAK"),
  );
  const mutableRequest = { jsonrpc: "2.0", id: 1, method: "initialize" } as const;
  const mutableResponse = await new HttpMcpTransport({
    endpoint: "https://mcp.example.test/rpc",
    resolveHostname: safeResolveHostname,
    fetchImpl: async (_input, init) => {
      const sent = JSON.parse(String(init?.body)) as McpJsonRpcRequest;
      (mutableRequest as { id: number }).id = 999;
      return jsonResponse({ jsonrpc: "2.0", id: sent.id, result: {} });
    },
  }).send(mutableRequest);
  assertEqual(mutableResponse.id, 1, "HTTP transport validates response id against immutable sent request id");
  await expectRejects(
    "HTTP transport rejects malformed JSON-RPC responses",
    () => new HttpMcpTransport({
      endpoint: "https://mcp.example.test/rpc",
      resolveHostname: safeResolveHostname,
      fetchImpl: async () => jsonResponse({ jsonrpc: "2.0", id: 999, result: {} }),
    }).send({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    (error) => error.message === "MCP HTTP transport failed",
  );
  await expectRejects(
    "HTTP transport sanitizes malformed JSON response errors",
    () => new HttpMcpTransport({
      endpoint: "https://mcp.example.test/rpc",
      resolveHostname: safeResolveHostname,
      fetchImpl: async () => new Response("SHOULD_NOT_LEAK_TOKEN_12345", { status: 200 }),
    }).send({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    (error) => error.message === "MCP HTTP transport failed" && !error.message.includes("SHOULD_NOT_LEAK"),
  );
}

async function verifyAbortableHttpTransport(): Promise<void> {
  section("3. Abortable HTTP Transport");

  let observedSignal: AbortSignal | undefined;
  const guarded = new GuardedMcpTransport(
    new HttpMcpTransport({
      endpoint: "https://mcp.example.test/rpc",
      resolveHostname: safeResolveHostname,
      fetchImpl: async (_input, init) => {
        observedSignal = init?.signal as AbortSignal;
        await new Promise((_resolve, reject) => {
          observedSignal?.addEventListener("abort", () => reject(new Error("aborted: SHOULD_NOT_LEAK_TOKEN_12345")), { once: true });
        });
        return jsonResponse({});
      },
    }),
    { timeoutMs: 10 },
  );

  await expectRejects(
    "Guard timeout aborts in-flight HTTP fetch",
    () => guarded.send({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    (error) => error.message.includes("MCP transport timed out"),
  );
  assert(observedSignal?.aborted === true, "HTTP fetch receives aborted signal after guard timeout");

  const started = Date.now();
  await expectRejects(
    "Raw HTTP transport timeout rejects even when fetch ignores abort",
    () => new HttpMcpTransport({
      endpoint: "https://mcp.example.test/rpc",
      timeoutMs: 10,
      resolveHostname: safeResolveHostname,
      fetchImpl: async () => await new Promise<Response>(() => {
        // Ignore abort on purpose; the transport timeout must still reject.
      }),
    }).send({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    (error) => error.message === "MCP HTTP transport failed",
  );
  assert(Date.now() - started < 1_000, "Raw HTTP timeout rejection is bounded");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 73 Verification (MCP HTTP Transport Foundation)\n");

  await verifyHttpClientFlow();
  await verifyGuardsAndFailures();
  await verifyAbortableHttpTransport();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 73: MCP HTTP transport foundation is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
