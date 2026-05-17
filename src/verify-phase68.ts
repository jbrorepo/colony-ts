/**
 * Phase 68 Verification Script - MCP Server-Side Error Redaction
 *
 * Proves MCP JSON-RPC server responses do not expose raw secrets to external
 * clients before real stdio, HTTP, or plugin transports are exposed.
 *
 * Run: bun run src/verify-phase68.ts
 */

import {
  InProcessMcpServer,
  MCP_ERROR,
  textToolResult,
  type McpJsonRpcResponse,
  type McpToolAdapter,
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

function secretFree(response: McpJsonRpcResponse): boolean {
  return !JSON.stringify(response).includes("SHOULD_NOT_LEAK_TOKEN_12345")
    && !JSON.stringify(response).includes("Bearer super-secret-token");
}

function responseMessage(response: McpJsonRpcResponse): string {
  return response.error?.message ?? "";
}

function createServer(adapter: Partial<McpToolAdapter>): InProcessMcpServer {
  return new InProcessMcpServer({
    name: "colony-test-mcp",
    version: "0.1.0",
    toolAdapter: adapter as unknown as McpToolAdapter,
  });
}

async function verifyMethodErrorRedaction(): Promise<void> {
  section("1. Method Error Redaction");

  const server = createServer({
    listTools: () => [],
    callTool: async () => textToolResult("ok"),
  });
  const response = await server.handle({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/secret=SHOULD_NOT_LEAK_TOKEN_12345",
  });

  assertEqual(response.error?.code, MCP_ERROR.methodNotFound, "Unknown MCP method returns method-not-found");
  assert(secretFree(response), "Unknown method error does not echo secret method text");
  assert(!responseMessage(response).includes("tools/secret"), "Unknown method error does not echo raw method name");
}

async function verifyInternalErrorRedaction(): Promise<void> {
  section("2. Internal Error Redaction");

  const listServer = createServer({
    listTools: () => {
      throw new Error("list failed secret=SHOULD_NOT_LEAK_TOKEN_12345");
    },
    callTool: async () => textToolResult("ok"),
  });
  const listResponse = await listServer.handle({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
  });
  assertEqual(listResponse.error?.code, MCP_ERROR.internalError, "tools/list exceptions return internal error");
  assert(secretFree(listResponse), "tools/list internal error does not leak exception text");
  assertEqual(responseMessage(listResponse), "MCP internal error", "tools/list internal error is generic");

  const callServer = createServer({
    listTools: () => [],
    callTool: async () => {
      throw new Error("Bearer super-secret-token");
    },
  });
  const callResponse = await callServer.handle({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "leaky_tool", arguments: {} },
  });
  assertEqual(callResponse.error?.code, MCP_ERROR.internalError, "tools/call exceptions return internal error");
  assert(secretFree(callResponse), "tools/call internal error does not leak exception text");
  assertEqual(responseMessage(callResponse), "MCP internal error", "tools/call internal error is generic");
}

async function verifyInvalidParamsRemainUsefulAndSafe(): Promise<void> {
  section("3. Invalid Params Stay Useful and Safe");

  const server = createServer({
    listTools: () => [],
    callTool: async () => textToolResult("ok"),
  });
  const missingName = await server.handle({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { arguments: {} },
  });
  assertEqual(missingName.error?.code, MCP_ERROR.invalidParams, "Invalid params return invalid-params");
  assert(responseMessage(missingName).includes("non-empty name"), "Invalid params keep useful validation detail");
  assert(secretFree(missingName), "Invalid params response is secret-free");

  const proxyParams = new Proxy({}, {
    get(target, property, receiver) {
      if (property === "name") {
        throw new Error("secret=SHOULD_NOT_LEAK_TOKEN_12345");
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const proxyResponse = await server.handle({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: proxyParams,
  });
  assertEqual(proxyResponse.error?.code, MCP_ERROR.internalError, "Param parser trap returns internal error");
  assert(secretFree(proxyResponse), "Param parser trap does not leak thrown secret text");
  assertEqual(responseMessage(proxyResponse), "MCP internal error", "Param parser trap error is generic");

  const accessorParams: Record<string, unknown> = {};
  Object.defineProperty(accessorParams, "name", {
    enumerable: true,
    get() {
      throw new Error("secret=SHOULD_NOT_LEAK_TOKEN_12345");
    },
  });
  const accessorResponse = await server.handle({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: accessorParams,
  });
  assertEqual(accessorResponse.error?.code, MCP_ERROR.internalError, "Param accessor trap returns internal error");
  assert(secretFree(accessorResponse), "Param accessor trap does not leak thrown secret text");
  assertEqual(responseMessage(accessorResponse), "MCP internal error", "Param accessor trap error is generic");
}

async function verifyTopLevelRequestBoundary(): Promise<void> {
  section("4. Top-Level Request Boundary");

  const server = createServer({
    listTools: () => [],
    callTool: async () => textToolResult("ok"),
  });

  const jsonrpcTrap = new Proxy({}, {
    get(target, property, receiver) {
      if (property === "jsonrpc") {
        throw new Error("secret=SHOULD_NOT_LEAK_TOKEN_12345");
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const jsonrpcTrapResponse = await server.handle(jsonrpcTrap as never);
  assertEqual(jsonrpcTrapResponse.error?.code, MCP_ERROR.invalidRequest, "Top-level request trap returns invalid request");
  assertEqual(jsonrpcTrapResponse.id, null, "Top-level request trap uses null response id");
  assert(secretFree(jsonrpcTrapResponse), "Top-level request trap does not leak thrown secret text");

  const idAccessorRequest = {
    jsonrpc: "2.0",
    method: "initialize",
  };
  Object.defineProperty(idAccessorRequest, "id", {
    enumerable: true,
    get() {
      throw new Error("secret=SHOULD_NOT_LEAK_TOKEN_12345");
    },
  });
  const idAccessorResponse = await server.handle(idAccessorRequest as never);
  assertEqual(idAccessorResponse.error?.code, MCP_ERROR.invalidRequest, "Top-level id accessor trap returns invalid request");
  assertEqual(idAccessorResponse.id, null, "Top-level id accessor trap uses null response id");
  assert(secretFree(idAccessorResponse), "Top-level id accessor trap does not leak thrown secret text");

  const invalidIdResponse = await server.handle({
    jsonrpc: "2.0",
    id: { secret: "SHOULD_NOT_LEAK_TOKEN_12345" },
    method: "tools/unknown",
  } as never);
  assertEqual(invalidIdResponse.error?.code, MCP_ERROR.invalidRequest, "Object JSON-RPC id is rejected");
  assertEqual(invalidIdResponse.id, null, "Invalid JSON-RPC id uses null response id");
  assert(secretFree(invalidIdResponse), "Invalid JSON-RPC id is not reflected into response");

  const nanIdResponse = await server.handle({
    jsonrpc: "2.0",
    id: Number.NaN,
    method: "tools/unknown",
  } as never);
  assertEqual(nanIdResponse.error?.code, MCP_ERROR.invalidRequest, "NaN JSON-RPC id is rejected");
  assertEqual(nanIdResponse.id, null, "NaN JSON-RPC id uses null response id");

  const infiniteIdResponse = await server.handle({
    jsonrpc: "2.0",
    id: Number.POSITIVE_INFINITY,
    method: "tools/unknown",
  } as never);
  assertEqual(infiniteIdResponse.error?.code, MCP_ERROR.invalidRequest, "Infinite JSON-RPC id is rejected");
  assertEqual(infiniteIdResponse.id, null, "Infinite JSON-RPC id uses null response id");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 68 Verification (MCP Server-Side Error Redaction)\n");

  await verifyMethodErrorRedaction();
  await verifyInternalErrorRedaction();
  await verifyInvalidParamsRemainUsefulAndSafe();
  await verifyTopLevelRequestBoundary();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 68: MCP server-side error redaction is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
