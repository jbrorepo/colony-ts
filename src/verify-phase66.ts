/**
 * Phase 66 Verification Script - MCP Transport Bridge
 *
 * Proves MCP client/server can communicate through a transport-agnostic
 * JSON-RPC request/response seam before adding real stdio, HTTP, or plugin
 * transports.
 *
 * Run: bun run src/verify-phase66.ts
 */

import {
  InProcessMcpClient,
  InProcessMcpServer,
  InProcessMcpTransport,
  McpToolAdapter,
  type McpJsonRpcRequest,
  type McpJsonRpcResponse,
  type McpTransport,
} from "./mcp";
import { approvalSignature } from "./runtime/approval";
import {
  ToolExecutor,
  ToolRegistry,
  createToolDefinition,
} from "./runtime/tools-registry";

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

interface Fixture {
  calls: string[];
  server: InProcessMcpServer;
  transport: InProcessMcpTransport;
}

function createFixture(validProofs = new Map<string, string>()): Fixture {
  const calls: string[] = [];
  const registry = new ToolRegistry();
  registry.register(
    createToolDefinition("echo_text", "Echo Text", {
      description: "Echoes input text for MCP transport smoke tests.",
      category: "read",
      requiresApproval: false,
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
        },
        required: ["text"],
        additionalProperties: false,
      },
      returns: { type: "string" },
    }),
    (args: Record<string, unknown>) => {
      calls.push(`echo:${String(args.text)}`);
      return `echo:${String(args.text)}`;
    },
  );
  registry.register(
    createToolDefinition("write_file", "Write File", {
      description: "Approval-gated write fixture.",
      category: "file",
      requiresApproval: true,
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
        additionalProperties: false,
      },
      returns: { type: "string" },
    }),
    (args: Record<string, unknown>) => {
      calls.push(`write:${String(args.path)}`);
      return `wrote:${String(args.path)}`;
    },
  );

  const executor = new ToolExecutor(registry);
  const adapter = new McpToolAdapter(registry, executor, {
    exposedToolIds: ["echo_text", "write_file"],
    approvalVerifier: (proof, call) => (
      validProofs.get(proof.approvalId) === call.signature
      && proof.signature === call.signature
    ),
  });
  const server = new InProcessMcpServer({
    name: "colony-test-mcp",
    version: "0.1.0",
    toolAdapter: adapter,
  });
  return {
    calls,
    server,
    transport: new InProcessMcpTransport(server),
  };
}

class RecordingTransport implements McpTransport {
  readonly requests: McpJsonRpcRequest[] = [];

  constructor(private readonly inner: McpTransport) {}

  async send(request: McpJsonRpcRequest): Promise<McpJsonRpcResponse> {
    this.requests.push(JSON.parse(JSON.stringify(request)) as McpJsonRpcRequest);
    return await this.inner.send(request);
  }
}

class StaticTransport implements McpTransport {
  constructor(private readonly response: McpJsonRpcResponse | Error) {}

  async send(_request: McpJsonRpcRequest): Promise<McpJsonRpcResponse> {
    if (this.response instanceof Error) throw this.response;
    return this.response;
  }
}

class JsonSerializingTransport implements McpTransport {
  constructor(private readonly inner: McpTransport) {}

  async send(request: McpJsonRpcRequest): Promise<McpJsonRpcResponse> {
    const serialized = JSON.parse(JSON.stringify(request)) as McpJsonRpcRequest;
    return await this.inner.send(serialized);
  }
}

async function expectRejects(label: string, run: () => Promise<unknown>, check?: (error: Error) => boolean): Promise<void> {
  try {
    await run();
    assert(false, label);
  } catch (error) {
    assert(error instanceof Error && (check ? check(error) : true), label);
  }
}

async function verifyTransportBackedClient(): Promise<void> {
  section("1. Transport-Backed Client");

  const fixture = createFixture();
  const recording = new RecordingTransport(fixture.transport);
  const client = new InProcessMcpClient(recording);

  const init = await client.initialize({ clientName: "phase66" });
  const tools = await client.listTools();
  const echo = await client.callTool("echo_text", { text: "hello" });

  assertEqual(init.serverInfo.name, "colony-test-mcp", "Transport client initializes through MCP transport");
  assert(tools.tools.some((tool) => tool.name === "echo_text"), "Transport client lists tools through MCP transport");
  assertEqual(echo.content[0]?.text, "echo:hello", "Transport client calls tools through MCP transport");
  assertEqual(recording.requests.length, 3, "Transport receives one request per client operation");
  assertEqual(recording.requests[0]?.id, 1, "Transport request ids start at 1");
  assertEqual(recording.requests[1]?.id, 2, "Transport request ids are monotonic");
  assertEqual(recording.requests[2]?.method, "tools/call", "Transport receives tools/call envelope");
}

async function verifyFailClosedResponseValidation(): Promise<void> {
  section("2. Fail-Closed Transport Response Validation");

  await expectRejects(
    "Wrong JSON-RPC version fails closed",
    () => new InProcessMcpClient(new StaticTransport({ jsonrpc: "1.0" as "2.0", id: 1, result: {} })).initialize(),
  );
  await expectRejects(
    "Response id mismatch fails closed",
    () => new InProcessMcpClient(new StaticTransport({ jsonrpc: "2.0", id: 999, result: {} })).initialize(),
  );
  await expectRejects(
    "Response with both result and error fails closed",
    () => new InProcessMcpClient(new StaticTransport({
      jsonrpc: "2.0",
      id: 1,
      result: {},
      error: { code: -32000, message: "boom" },
    })).initialize(),
  );
  await expectRejects(
    "Response without result fails closed",
    () => new InProcessMcpClient(new StaticTransport({ jsonrpc: "2.0", id: 1 })).initialize(),
  );
  await expectRejects(
    "Transport-thrown errors are sanitized",
    () => new InProcessMcpClient(new StaticTransport(new Error("transport exploded secret=SHOULD_NOT_LEAK"))).initialize(),
    (error) => !error.message.includes("SHOULD_NOT_LEAK"),
  );
  await expectRejects(
    "Transport error responses are sanitized",
    () => new InProcessMcpClient(new StaticTransport({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32000, message: "secret=SHOULD_NOT_LEAK_TOKEN_12345" },
    })).initialize(),
    (error) => !error.message.includes("SHOULD_NOT_LEAK_TOKEN_12345"),
  );
}

async function verifyApprovalProofOverTransport(): Promise<void> {
  section("3. Approval Proof Over Transport");

  const args = { path: "out.txt" };
  const signature = approvalSignature("write_file", args);
  const approvalId = "apr_transport";
  const fixture = createFixture(new Map([[approvalId, signature]]));
  const client = new InProcessMcpClient(new RecordingTransport(fixture.transport));

  const callerBoolean = await client.callTool("write_file", args, { approved: true });
  assertEqual(callerBoolean.isError, true, "Transport calls ignore caller-supplied approval booleans");
  assertEqual(fixture.calls.length, 0, "Caller boolean over transport does not execute handler");

  const approved = await client.callTool("write_file", args, {
    approvalId,
    approvalSignature: signature,
  });
  assertEqual(approved.isError, false, "Verifier-owned exact proof executes over transport");
  assertEqual(approved.content[0]?.text, "wrote:out.txt", "Transport proof call returns executor output");
  assertEqual(fixture.calls.length, 1, "Verifier-owned exact proof executes handler once");

  await expectRejects(
    "Client rejects non-JSON arguments before verifier approval",
    () => client.callTool("write_file", { path: "out.txt", marker: undefined }, {
      approvalId,
      approvalSignature: signature,
    }),
    (error) => error.message.includes("JSON-compatible"),
  );
  assertEqual(fixture.calls.length, 1, "Object-preserving non-JSON rejection does not execute handler");

  const serializingFixture = createFixture(new Map([[approvalId, signature]]));
  const serializingClient = new InProcessMcpClient(new JsonSerializingTransport(serializingFixture.transport));
  await expectRejects(
    "Client rejects non-JSON arguments before JSON-serializing transports can erase them",
    () => serializingClient.callTool("write_file", { path: "out.txt", marker: undefined }, {
      approvalId,
      approvalSignature: signature,
    }),
    (error) => error.message.includes("JSON-compatible"),
  );
  assertEqual(serializingFixture.calls.length, 0, "JSON-serializing non-JSON rejection does not execute handler");

  const sparseFixture = createFixture(new Map([[approvalId, approvalSignature("write_file", {
    path: "out.txt",
    markers: [null],
  })]]));
  const sparseClient = new InProcessMcpClient(new JsonSerializingTransport(sparseFixture.transport));
  await expectRejects(
    "Client rejects sparse arrays before JSON-serializing transports can normalize holes",
    () => sparseClient.callTool("write_file", {
      path: "out.txt",
      markers: Array(1),
    }, {
      approvalId,
      approvalSignature: approvalSignature("write_file", {
        path: "out.txt",
        markers: [null],
      }),
    }),
    (error) => error.message.includes("JSON-compatible"),
  );
  assertEqual(sparseFixture.calls.length, 0, "JSON-serializing sparse-array rejection does not execute handler");

  const getterFixture = createFixture(new Map([[approvalId, signature]]));
  const getterClient = new InProcessMcpClient(new JsonSerializingTransport(getterFixture.transport));
  const accessorArgs: Record<string, unknown> = { path: "out.txt" };
  let getterReads = 0;
  Object.defineProperty(accessorArgs, "marker", {
    enumerable: true,
    get: () => {
      getterReads++;
      return getterReads === 1 ? "transient" : undefined;
    },
  });
  await expectRejects(
    "Client rejects accessor arguments before JSON-serializing transports can observe drift",
    () => getterClient.callTool("write_file", accessorArgs, {
      approvalId,
      approvalSignature: signature,
    }),
    (error) => error.message.includes("JSON-compatible"),
  );
  assertEqual(getterFixture.calls.length, 0, "JSON-serializing accessor rejection does not execute handler");

  const arrayAccessorFixture = createFixture(new Map([[approvalId, approvalSignature("write_file", {
    path: "out.txt",
    markers: [null],
  })]]));
  const arrayAccessorClient = new InProcessMcpClient(new JsonSerializingTransport(arrayAccessorFixture.transport));
  const accessorArray: unknown[] = [];
  let arrayGetterReads = 0;
  Object.defineProperty(accessorArray, "0", {
    enumerable: true,
    get: () => {
      arrayGetterReads++;
      return arrayGetterReads === 1 ? "transient" : undefined;
    },
  });
  await expectRejects(
    "Client rejects accessor array elements before JSON-serializing transports can observe drift",
    () => arrayAccessorClient.callTool("write_file", {
      path: "out.txt",
      markers: accessorArray,
    }, {
      approvalId,
      approvalSignature: approvalSignature("write_file", {
        path: "out.txt",
        markers: [null],
      }),
    }),
    (error) => error.message.includes("JSON-compatible"),
  );
  assertEqual(arrayAccessorFixture.calls.length, 0, "JSON-serializing array-accessor rejection does not execute handler");

  const toJsonFixture = createFixture(new Map([[approvalId, signature]]));
  const toJsonClient = new InProcessMcpClient(new JsonSerializingTransport(toJsonFixture.transport));
  try {
    Object.defineProperty(Object.prototype, "toJSON", {
      configurable: true,
      value: function inheritedToJson(this: unknown): unknown {
        if (this && typeof this === "object" && (this as Record<string, unknown>).path === "not-approved.txt") {
          return { path: "out.txt" };
        }
        return this;
      },
    });
    await expectRejects(
      "Client rejects inherited toJSON before JSON-serializing transports can rewrite args",
      () => toJsonClient.callTool("write_file", { path: "not-approved.txt" }, {
        approvalId,
        approvalSignature: signature,
      }),
      (error) => error.message.includes("JSON-compatible"),
    );
    assertEqual(toJsonFixture.calls.length, 0, "JSON-serializing inherited-toJSON rejection does not execute handler");
  } finally {
    delete (Object.prototype as { toJSON?: unknown }).toJSON;
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 66 Verification (MCP Transport Bridge)\n");

  await verifyTransportBackedClient();
  await verifyFailClosedResponseValidation();
  await verifyApprovalProofOverTransport();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 66: MCP transport bridge is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
