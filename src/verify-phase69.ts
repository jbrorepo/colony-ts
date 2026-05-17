/**
 * Phase 69 Verification Script - MCP Result Shape Validation
 *
 * Proves MCP initialize, tools/list, and tools/call result payloads are
 * validated before external transports or adapter outputs can be trusted.
 *
 * Run: bun run src/verify-phase69.ts
 */

import {
  InProcessMcpClient,
  InProcessMcpServer,
  MCP_ERROR,
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

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
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

function createServer(adapter: Partial<McpToolAdapter>): InProcessMcpServer {
  return new InProcessMcpServer({
    name: "colony-test-mcp",
    version: "0.1.0",
    toolAdapter: adapter as unknown as McpToolAdapter,
  });
}

async function expectRejects(label: string, run: () => Promise<unknown>, check?: (error: Error) => boolean): Promise<void> {
  try {
    await run();
    assert(false, label);
  } catch (error) {
    assert(error instanceof Error && (check ? check(error) : true), label);
  }
}

function errorFreeOfSecret(error: Error): boolean {
  return !error.message.includes("SHOULD_NOT_LEAK_TOKEN_12345");
}

function responseFreeOfSecret(response: McpJsonRpcResponse): boolean {
  return !JSON.stringify(response).includes("SHOULD_NOT_LEAK_TOKEN_12345");
}

async function verifyClientResultShapeValidation(): Promise<void> {
  section("1. Client-Side Result Shape Validation");

  await expectRejects(
    "Client rejects malformed initialize result",
    () => new InProcessMcpClient(new MethodResponseTransport({
      initialize: {
        protocolVersion: 123,
        serverInfo: { name: "remote", version: "0.0.1" },
        capabilities: { tools: { listChanged: false } },
      },
    })).initialize(),
    (error) => error.message.includes("Invalid MCP initialize result") && errorFreeOfSecret(error),
  );

  await expectRejects(
    "Client rejects tools/list with non-array tools",
    () => new InProcessMcpClient(new MethodResponseTransport({
      "tools/list": { tools: "not-array" },
    })).listTools(),
    (error) => error.message.includes("Invalid MCP tools/list result") && errorFreeOfSecret(error),
  );

  await expectRejects(
    "Client rejects tools/list tool with malformed schema",
    () => new InProcessMcpClient(new MethodResponseTransport({
      "tools/list": {
        tools: [{
          name: "leaky_tool",
          description: "secret=SHOULD_NOT_LEAK_TOKEN_12345",
          inputSchema: "not-object",
        }],
      },
    })).listTools(),
    (error) => error.message.includes("Invalid MCP tools/list result") && errorFreeOfSecret(error),
  );

  const toolsWithToJson = [{
    name: "leaky_tool",
    description: "secret=SHOULD_NOT_LEAK_TOKEN_12345",
    inputSchema: {},
  }];
  Object.defineProperty(toolsWithToJson, "toJSON", {
    enumerable: false,
    value: () => [],
  });
  await expectRejects(
    "Client rejects tools/list arrays with toJSON hooks",
    () => new InProcessMcpClient(new MethodResponseTransport({
      "tools/list": { tools: toolsWithToJson },
    })).listTools(),
    (error) => error.message.includes("Invalid MCP tools/list result") && errorFreeOfSecret(error),
  );

  await expectRejects(
    "Client rejects tools/call with non-array content",
    () => new InProcessMcpClient(new MethodResponseTransport({
      "tools/call": { content: "not-array", isError: false },
    })).callTool("echo_text", {}),
    (error) => error.message.includes("Invalid MCP tools/call result") && errorFreeOfSecret(error),
  );

  await expectRejects(
    "Client rejects tools/call text item with non-string text",
    () => new InProcessMcpClient(new MethodResponseTransport({
      "tools/call": {
        content: [{ type: "text", text: { secret: "SHOULD_NOT_LEAK_TOKEN_12345" } }],
        isError: false,
      },
    })).callTool("echo_text", {}),
    (error) => error.message.includes("Invalid MCP tools/call result") && errorFreeOfSecret(error),
  );

  const contentWithExtra = [{ type: "text", text: "ok" }];
  Object.defineProperty(contentWithExtra, "nonIndex", {
    enumerable: true,
    value: "secret=SHOULD_NOT_LEAK_TOKEN_12345",
  });
  await expectRejects(
    "Client rejects tools/call content arrays with non-index properties",
    () => new InProcessMcpClient(new MethodResponseTransport({
      "tools/call": { content: contentWithExtra, isError: false },
    })).callTool("echo_text", {}),
    (error) => error.message.includes("Invalid MCP tools/call result") && errorFreeOfSecret(error),
  );
}

async function verifyServerResultShapeValidation(): Promise<void> {
  section("2. Server-Side Result Shape Validation");

  const listServer = createServer({
    listTools: () => [{
      name: "broken_tool",
      description: "secret=SHOULD_NOT_LEAK_TOKEN_12345",
      inputSchema: "not-object",
    }] as never,
    callTool: async () => ({
      content: [{ type: "text", text: "ok" }],
      isError: false,
    }),
  });
  const listResponse = await listServer.handle({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  });
  assertEqual(listResponse.error?.code, MCP_ERROR.internalError, "Server rejects malformed tools/list adapter output");
  assertEqual(listResponse.error?.message, "MCP internal error", "Server tools/list shape error is generic");
  assert(responseFreeOfSecret(listResponse), "Server tools/list shape error does not leak adapter output");

  const callServer = createServer({
    listTools: () => [],
    callTool: async () => ({
      content: "secret=SHOULD_NOT_LEAK_TOKEN_12345",
      isError: false,
    }) as never,
  });
  const callResponse = await callServer.handle({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "broken_tool", arguments: {} },
  });
  assertEqual(callResponse.error?.code, MCP_ERROR.internalError, "Server rejects malformed tools/call adapter output");
  assertEqual(callResponse.error?.message, "MCP internal error", "Server tools/call shape error is generic");
  assert(responseFreeOfSecret(callResponse), "Server tools/call shape error does not leak adapter output");

  const serverToolsWithToJson = [{
    name: "leaky_tool",
    description: "secret=SHOULD_NOT_LEAK_TOKEN_12345",
    inputSchema: {},
  }];
  Object.defineProperty(serverToolsWithToJson, "toJSON", {
    enumerable: false,
    value: () => [],
  });
  const listArrayResponse = await createServer({
    listTools: () => serverToolsWithToJson as never,
    callTool: async () => ({
      content: [{ type: "text", text: "ok" }],
      isError: false,
    }),
  }).handle({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/list",
    params: {},
  });
  assertEqual(listArrayResponse.error?.code, MCP_ERROR.internalError, "Server rejects tools/list arrays with toJSON hooks");
  assert(responseFreeOfSecret(listArrayResponse), "Server list array shape error does not leak adapter output");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 69 Verification (MCP Result Shape Validation)\n");

  await verifyClientResultShapeValidation();
  await verifyServerResultShapeValidation();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 69: MCP result shape validation is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
