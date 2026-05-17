/**
 * Phase 85 Verification Script - MCP Resource List/Read Support
 *
 * Proves MCP resources/list and resources/read are available as resource
 * operations, remain distinct from tool execution, and fail closed across
 * client, server, guarded transport, and operator visibility surfaces.
 *
 * Run: bun run src/verify-phase85.ts
 */

import {
  GuardedMcpTransport,
  InProcessMcpClient,
  InProcessMcpServer,
  InProcessMcpTransport,
  MCP_ERROR,
  McpResourceAdapter,
  buildMcpResourceOperatorInspection,
  type McpJsonRpcRequest,
  type McpJsonRpcResponse,
  type McpToolAdapter,
  type McpTransport,
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

async function expectRejects(label: string, run: () => Promise<unknown> | unknown, check?: (error: Error) => boolean): Promise<void> {
  try {
    await run();
    assert(false, label);
  } catch (error) {
    assert(error instanceof Error && (check ? check(error) : true), label);
  }
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

class EmptyToolAdapter {
  calls = 0;

  listTools() {
    return [];
  }

  async callTool() {
    this.calls++;
    return {
      content: [{ type: "text" as const, text: "tool-called" }],
      isError: false,
    };
  }
}

class MethodResponseTransport implements McpTransport {
  constructor(private readonly responses: Record<string, unknown>) {}

  async send(request: McpJsonRpcRequest): Promise<McpJsonRpcResponse> {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: this.responses[request.method],
    };
  }
}

class RecordingTransport implements McpTransport {
  readonly requests: McpJsonRpcRequest[] = [];

  constructor(private readonly response: McpJsonRpcResponse) {}

  async send(request: McpJsonRpcRequest): Promise<McpJsonRpcResponse> {
    this.requests.push(request);
    return this.response;
  }
}

class EchoResourceTransport implements McpTransport {
  async send(request: McpJsonRpcRequest): Promise<McpJsonRpcResponse> {
    if (request.method === "resources/list") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          resources: [
            { uri: "colony://runtime/status", name: "Allowed status" },
            { uri: "colony://secret/status", name: "SHOULD_NOT_LEAK_TOKEN_12345" },
          ],
        },
      };
    }
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        contents: [
          { uri: "colony://secret/status", mimeType: "text/plain", text: "SHOULD_NOT_LEAK_TOKEN_12345" },
        ],
      },
    };
  }
}

function resourceAdapter(): McpResourceAdapter {
  return new McpResourceAdapter({
    resources: [
      {
        uri: "file:///workspace/docs/public.md",
        name: "Public plan",
        description: "Operator-visible project plan",
        mimeType: "text/markdown",
        contents: [
          {
            uri: "file:///workspace/docs/public.md",
            mimeType: "text/markdown",
            text: "public resource body",
          },
        ],
      },
      {
        uri: "colony://runtime/status",
        name: "Runtime status",
        description: "Runtime state snapshot",
        mimeType: "application/json",
        contents: [
          {
            uri: "colony://runtime/status",
            mimeType: "application/json",
            text: "{\"status\":\"ok\"}",
          },
        ],
      },
    ],
  });
}

function createResourceServer(
  adapter = resourceAdapter(),
  toolAdapter: Partial<McpToolAdapter> & { calls?: number } = new EmptyToolAdapter(),
): InProcessMcpServer {
  return new InProcessMcpServer({
    name: "colony-resource-test",
    version: "0.1.0",
    toolAdapter: toolAdapter as unknown as McpToolAdapter,
    resourceAdapter: adapter,
  });
}

async function verifyResourceListAndRead(): Promise<void> {
  section("1. MCP Resource List and Read");

  const client = new InProcessMcpClient(createResourceServer());
  const init = await client.initialize();
  assertEqual(init.capabilities.resources.listChanged, false, "Initialize advertises static MCP resource capability");

  const listed = await client.listResources();
  assertEqual(listed.resources.length, 2, "Client lists MCP resources");
  assertEqual(listed.resources[0]?.uri, "colony://runtime/status", "Resources are sorted by URI");
  assertEqual(listed.resources[1]?.mimeType, "text/markdown", "Resource metadata preserves mime type");

  const read = await client.readResource("file:///workspace/docs/public.md");
  assertEqual(read.contents.length, 1, "Client reads one resource content item");
  assertEqual(read.contents[0]?.text, "public resource body", "Resource read returns text body");
  assertEqual(read.contents[0]?.uri, "file:///workspace/docs/public.md", "Resource read preserves content URI");
}

async function verifyResourcesStayDistinctFromTools(): Promise<void> {
  section("2. Resources Are Distinct From Tool Execution");

  const toolAdapter = new EmptyToolAdapter();
  const server = createResourceServer(resourceAdapter(), toolAdapter);
  const client = new InProcessMcpClient(server);
  const tools = await client.listTools();
  const resources = await client.listResources();
  await client.readResource("colony://runtime/status");

  assertEqual(tools.tools.length, 0, "Resource server does not register resources as MCP tools");
  assert(resources.resources.some((resource) => resource.uri === "colony://runtime/status"), "Resources are visible through resources/list");
  assertEqual(toolAdapter.calls, 0, "Reading resources does not invoke McpToolAdapter.callTool");

  const toolCall = await server.handle({
    jsonrpc: "2.0",
    id: 22,
    method: "tools/call",
    params: { name: "resources/read", arguments: { uri: "colony://runtime/status" } },
  });
  assertEqual(toolCall.result && (toolCall.result as { isError?: boolean }).isError, false, "Tool path remains tool adapter controlled");
  assertEqual(toolAdapter.calls, 1, "A resources/read-looking tool name still uses tool execution only when explicitly called as a tool");
}

async function verifyAllowlistAndMalformedFailures(): Promise<void> {
  section("3. Guard Allowlist and Malformed Resource Results");

  const transport = new GuardedMcpTransport(new InProcessMcpTransport(createResourceServer()), {
    allowedMethods: ["initialize", "resources/list", "resources/read"],
    allowedResourceUris: ["colony://runtime/status"],
  });
  const client = new InProcessMcpClient(transport);

  const allowed = await client.readResource("colony://runtime/status");
  assertEqual(allowed.contents[0]?.text, "{\"status\":\"ok\"}", "Allowed resource URI reaches server");

  await expectRejects(
    "Disallowed resource URI is rejected before inner transport",
    () => client.readResource("file:///workspace/docs/public.md"),
    (error) => error.message.includes("transport failed"),
  );

  await expectRejects(
    "Client rejects malformed resources/list result without leaking remote text",
    () => new InProcessMcpClient(new MethodResponseTransport({
      "resources/list": {
        resources: [{
          uri: "colony://secret/SHOULD_NOT_LEAK_TOKEN_12345",
          name: "bad",
          mimeType: 123,
        }],
      },
    })).listResources(),
    (error) => error.message.includes("Invalid MCP resources/list result")
      && !error.message.includes("SHOULD_NOT_LEAK"),
  );

  await expectRejects(
    "Client rejects malformed resources/read result without leaking remote text",
    () => new InProcessMcpClient(new MethodResponseTransport({
      "resources/read": {
        contents: [{
          uri: "colony://secret/SHOULD_NOT_LEAK_TOKEN_12345",
          mimeType: "text/plain",
          text: 42,
        }],
      },
    })).readResource("colony://runtime/status"),
    (error) => error.message.includes("Invalid MCP resources/read result")
      && !error.message.includes("SHOULD_NOT_LEAK"),
  );

  const inner = new RecordingTransport({
    jsonrpc: "2.0",
    id: 1,
    result: { contents: [] },
  });
  const guarded = new GuardedMcpTransport(inner, {
    allowedMethods: ["resources/read"],
    allowedResourceUris: ["colony://runtime/status"],
  });
  await expectRejects(
    "Malformed resources/read params are rejected before inner transport",
    () => guarded.send({ jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri: 42 } }),
    (error) => error.message.includes("resource URI"),
  );
  assertEqual(inner.requests.length, 0, "Rejected resource requests do not reach inner transport");

  await expectRejects(
    "Guard rejects resources/list responses that contain disallowed resource metadata",
    () => new InProcessMcpClient(new GuardedMcpTransport(new EchoResourceTransport(), {
      allowedMethods: ["resources/list"],
      allowedResourceUris: ["colony://runtime/status"],
    })).listResources(),
    (error) => error.message.includes("transport failed") && !error.message.includes("SHOULD_NOT_LEAK"),
  );

  await expectRejects(
    "Guard rejects resources/read responses whose content URI differs from the allowed request URI",
    () => new InProcessMcpClient(new GuardedMcpTransport(new EchoResourceTransport(), {
      allowedMethods: ["resources/read"],
      allowedResourceUris: ["colony://runtime/status"],
    })).readResource("colony://runtime/status"),
    (error) => error.message.includes("transport failed") && !error.message.includes("SHOULD_NOT_LEAK"),
  );

  await expectRejects(
    "Prefix resource allowlists require a delimiter boundary",
    () => new InProcessMcpClient(new GuardedMcpTransport(new InProcessMcpTransport(createResourceServer()), {
      allowedMethods: ["resources/read"],
      allowedResourceUriPrefixes: ["file:///workspace/docs"],
    })).readResource("file:///workspace/docs/public.md"),
    (error) => error.message.includes("prefix invalid") || error.message.includes("transport failed"),
  );

  await expectRejects(
    "Prefix resource allowlists reject dot-segment path escapes",
    () => new InProcessMcpClient(new GuardedMcpTransport(new EchoResourceTransport(), {
      allowedMethods: ["resources/read"],
      allowedResourceUriPrefixes: ["file:///workspace/docs/"],
    })).readResource("file:///workspace/docs/../secret.txt"),
    (error) => error.message.includes("resource URI invalid") || error.message.includes("transport failed"),
  );

  await expectRejects(
    "Prefix resource allowlists reject encoded dot-segment path escapes",
    () => new InProcessMcpClient(new GuardedMcpTransport(new EchoResourceTransport(), {
      allowedMethods: ["resources/read"],
      allowedResourceUriPrefixes: ["file:///workspace/docs/"],
    })).readResource("file:///workspace/docs/%2e%2e/secret.txt"),
    (error) => error.message.includes("resource URI invalid") || error.message.includes("transport failed"),
  );

  await expectRejects(
    "Prefix resource allowlists reject backslash dot-segment path escapes",
    () => new InProcessMcpClient(new GuardedMcpTransport(new EchoResourceTransport(), {
      allowedMethods: ["resources/read"],
      allowedResourceUriPrefixes: ["file:///workspace/docs/"],
    })).readResource("file:///workspace/docs/..\\secret.txt"),
    (error) => error.message.includes("resource URI invalid") || error.message.includes("transport failed"),
  );

  const backslashInner = new RecordingTransport({
    jsonrpc: "2.0",
    id: 13,
    result: { contents: [] },
  });
  const backslashGuard = new GuardedMcpTransport(backslashInner, {
    allowedMethods: ["resources/read"],
    allowedResourceUriPrefixes: ["file:///workspace/docs/"],
  });
  await expectRejects(
    "Backslash dot-segment escapes are rejected before inner transport",
    () => backslashGuard.send({
      jsonrpc: "2.0",
      id: 13,
      method: "resources/read",
      params: { uri: "file:///workspace/docs/..\\secret.txt" },
    }),
    (error) => error.message.includes("resource URI invalid"),
  );
  assertEqual(backslashInner.requests.length, 0, "Backslash path escape does not reach inner transport");

  const rawList = await new GuardedMcpTransport(new RecordingTransport({
    jsonrpc: "2.0",
    id: 9,
    result: {
      resources: [{
        uri: "colony://runtime/status",
        name: "Runtime status",
        secret: "SHOULD_NOT_LEAK_TOKEN_12345",
      }],
      secret: "SHOULD_NOT_LEAK_TOKEN_12345",
    },
  }), {
    allowedMethods: ["resources/list"],
    allowedResourceUris: ["colony://runtime/status"],
  }).send({ jsonrpc: "2.0", id: 9, method: "resources/list", params: {} });
  assert(!JSON.stringify(rawList).includes("SHOULD_NOT_LEAK"), "Guarded raw resources/list response strips unvalidated fields");

  const rawListError = await new GuardedMcpTransport(new RecordingTransport({
    jsonrpc: "2.0",
    id: 14,
    error: {
      code: MCP_ERROR.internalError,
      message: "SHOULD_NOT_LEAK_TOKEN_12345",
      data: { secret: "SHOULD_NOT_LEAK_TOKEN_12345" },
    },
  }), {
    allowedMethods: ["resources/list"],
    allowedResourceUris: ["colony://runtime/status"],
  }).send({ jsonrpc: "2.0", id: 14, method: "resources/list", params: {} });
  assert(!JSON.stringify(rawListError).includes("SHOULD_NOT_LEAK"), "Guarded raw resources/list errors are redacted");
  assertEqual(rawListError.error?.message, "MCP resource response failed", "Guarded raw resources/list errors use generic messages");

  await expectRejects(
    "Guard rejects malformed raw resources/list envelopes instead of returning remote fields",
    () => new GuardedMcpTransport(new RecordingTransport({
      jsonrpc: "2.0",
      id: 11,
      result: { secret: "SHOULD_NOT_LEAK_TOKEN_12345" },
    }), {
      allowedMethods: ["resources/list"],
      allowedResourceUris: ["colony://runtime/status"],
    }).send({ jsonrpc: "2.0", id: 11, method: "resources/list", params: {} }),
    (error) => error.message.includes("resource list response invalid") && !error.message.includes("SHOULD_NOT_LEAK"),
  );

  const rawRead = await new GuardedMcpTransport(new RecordingTransport({
    jsonrpc: "2.0",
    id: 10,
    result: {
      contents: [{
        uri: "colony://runtime/status",
        mimeType: "text/plain",
        text: "status",
        secret: "SHOULD_NOT_LEAK_TOKEN_12345",
      }],
      secret: "SHOULD_NOT_LEAK_TOKEN_12345",
    },
  }), {
    allowedMethods: ["resources/read"],
    allowedResourceUris: ["colony://runtime/status"],
  }).send({ jsonrpc: "2.0", id: 10, method: "resources/read", params: { uri: "colony://runtime/status" } });
  assert(!JSON.stringify(rawRead).includes("SHOULD_NOT_LEAK"), "Guarded raw resources/read response strips unvalidated fields");

  const rawReadError = await new GuardedMcpTransport(new RecordingTransport({
    jsonrpc: "2.0",
    id: 15,
    error: {
      code: MCP_ERROR.internalError,
      message: "SHOULD_NOT_LEAK_TOKEN_12345",
      data: { secret: "SHOULD_NOT_LEAK_TOKEN_12345" },
    },
  }), {
    allowedMethods: ["resources/read"],
    allowedResourceUris: ["colony://runtime/status"],
  }).send({ jsonrpc: "2.0", id: 15, method: "resources/read", params: { uri: "colony://runtime/status" } });
  assert(!JSON.stringify(rawReadError).includes("SHOULD_NOT_LEAK"), "Guarded raw resources/read errors are redacted");
  assertEqual(rawReadError.error?.message, "MCP resource response failed", "Guarded raw resources/read errors use generic messages");

  await expectRejects(
    "Guard rejects malformed raw resources/read envelopes instead of returning remote fields",
    () => new GuardedMcpTransport(new RecordingTransport({
      jsonrpc: "2.0",
      id: 12,
      result: { secret: "SHOULD_NOT_LEAK_TOKEN_12345" },
    }), {
      allowedMethods: ["resources/read"],
      allowedResourceUris: ["colony://runtime/status"],
    }).send({ jsonrpc: "2.0", id: 12, method: "resources/read", params: { uri: "colony://runtime/status" } }),
    (error) => error.message.includes("resource read response invalid") && !error.message.includes("SHOULD_NOT_LEAK"),
  );
}

async function verifyServerErrorsAndOperatorVisibility(): Promise<void> {
  section("4. Server Redaction and Operator Visibility");

  const server = createResourceServer(new McpResourceAdapter({
    resources: [
      {
        uri: "colony://secret/SHOULD_NOT_LEAK_TOKEN_12345",
        name: "secret resource SHOULD_NOT_LEAK_TOKEN_12345",
        description: "token SHOULD_NOT_LEAK_TOKEN_12345",
        mimeType: "text/plain",
        contents: [{ uri: "colony://secret/SHOULD_NOT_LEAK_TOKEN_12345", text: "hidden" }],
      },
    ],
  }));
  const unknown = await server.handle({
    jsonrpc: "2.0",
    id: 7,
    method: "resources/read",
    params: { uri: "colony://missing/SHOULD_NOT_LEAK_TOKEN_12345" },
  });
  assertEqual(unknown.error?.code, MCP_ERROR.invalidParams, "Unknown resource read fails as invalid params");
  assert(!JSON.stringify(unknown).includes("SHOULD_NOT_LEAK"), "Resource read errors are redacted");

  const inspection = buildMcpResourceOperatorInspection({
    serverId: "phase85-resource-server",
    resourceAdapter: resourceAdapter(),
    allowedResourceUris: ["colony://runtime/status"],
    allowedResourceUriPrefixes: ["file:///workspace/docs/"],
  });
  assertEqual(inspection.serverId, "phase85-resource-server", "Operator inspection preserves safe server id");
  assertEqual(inspection.resourceCount, 2, "Operator inspection reports resource count");
  assertEqual(inspection.allowedResourceUris[0], "colony://runtime/status", "Operator inspection reports exact URI allowlist");
  assertEqual(inspection.allowedResourceUriPrefixes[0], "file:///workspace/docs/", "Operator inspection reports URI-prefix allowlist");
  assert(inspection.resources.some((resource) => resource.uri === "file:///workspace/docs/public.md"), "Operator inspection lists resource metadata");
  assert(!JSON.stringify(inspection).includes("SHOULD_NOT_LEAK"), "Operator inspection redacts secret-like resource labels");

  const pluginInspection = buildMcpResourceOperatorInspection({
    serverId: "plugin-resource-server",
    resourceAdapter: resourceAdapter(),
    allowedResourceUris: ["colony://resource/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"],
  });
  assert(!JSON.stringify(pluginInspection).includes("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), "Operator inspection redacts high-entropy resource allowlists");

  const symbolInspection = buildMcpResourceOperatorInspection({
    serverId: "plugin-resource-server",
    resourceAdapter: resourceAdapter(),
    allowedResourceUris: ["colony://resource/AAAAAAAAAAAAAAAA+BBBBBBBBBBBBBBBB+CCCCCCCC"],
  });
  assert(!JSON.stringify(symbolInspection).includes("AAAAAAAAAAAAAAAA+BBBBBBBBBBBBBBBB+CCCCCCCC"), "Operator inspection redacts symbolic high-entropy resource allowlists");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 85 Verification (MCP Resources)\n");

  await verifyResourceListAndRead();
  await verifyResourcesStayDistinctFromTools();
  await verifyAllowlistAndMalformedFailures();
  await verifyServerErrorsAndOperatorVisibility();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 85: MCP resource list/read support is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
