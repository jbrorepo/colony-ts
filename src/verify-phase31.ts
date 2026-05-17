/**
 * Phase 31 Verification Script - MCP Foundation
 *
 * Covers the second Phase 5 tools/skills/MCP slice:
 *   1. Minimal MCP JSON-RPC initialize and tools/list server/client flow
 *   2. Existing ToolRegistry exposure as MCP tools
 *   3. MCP tool call adapter with fail-closed approval behavior
 *
 * Run: bun run src/verify-phase31.ts
 */

import {
  InProcessMcpClient,
  InProcessMcpServer,
  McpToolAdapter,
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

function createFixture(opts: {
  approvedSignatures?: Map<string, string>;
} = {}): {
  registry: ToolRegistry;
  executor: ToolExecutor;
  adapter: McpToolAdapter;
} {
  const registry = new ToolRegistry();
  registry.register(
    createToolDefinition("echo_text", "Echo Text", {
      description: "Echoes input text for MCP smoke tests.",
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
    (args: Record<string, unknown>) => `echo:${String(args.text)}`,
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
    () => "wrote file",
  );

  const executor = new ToolExecutor(registry);
  return {
    registry,
    executor,
    adapter: new McpToolAdapter(registry, executor, {
      exposedToolIds: ["echo_text", "write_file"],
      approvalVerifier: (proof, call) => (
        opts.approvedSignatures?.get(proof.approvalId) === call.signature
        && proof.signature === call.signature
      ),
    }),
  };
}

async function verifyInitializeAndList(): Promise<void> {
  section("1. MCP Initialize and Tool Listing");

  const { adapter } = createFixture();
  const server = new InProcessMcpServer({
    name: "colony-test-mcp",
    version: "0.1.0",
    toolAdapter: adapter,
  });
  const client = new InProcessMcpClient(server);

  const init = await client.initialize({ clientName: "phase31", clientVersion: "0.0.1" });
  assertEqual(init.protocolVersion, "2024-11-05", "MCP initialize reports protocol version");
  assertEqual(init.serverInfo.name, "colony-test-mcp", "MCP initialize reports server name");
  assertEqual(init.capabilities.tools.listChanged, false, "MCP initialize reports static tool list");

  const tools = await client.listTools();
  assertEqual(tools.tools.length, 2, "MCP tools/list exposes registered tools");
  assertEqual(tools.tools[0]?.name, "echo_text", "MCP tools sort by name");
  assertEqual(tools.tools[0]?.inputSchema.type, "object", "MCP tool keeps object input schema");
  assert(tools.tools.some((tool) => tool.name === "write_file"), "MCP tools/list includes approval-gated tool metadata");
}

async function verifyToolCalls(): Promise<void> {
  section("2. MCP Tool Calls");

  const { adapter } = createFixture();
  const client = new InProcessMcpClient(new InProcessMcpServer({
    name: "colony-test-mcp",
    version: "0.1.0",
    toolAdapter: adapter,
  }));

  const result = await client.callTool("echo_text", { text: "hello" });
  assertEqual(result.isError, false, "MCP callTool succeeds for non-approval tool");
  assertEqual(result.content[0]?.type, "text", "MCP callTool returns text content");
  assertEqual(result.content[0]?.text, "echo:hello", "MCP callTool returns executor output");

  const invalid = await client.callTool("echo_text", { text: "hello", extra: true });
  assertEqual(invalid.isError, true, "MCP callTool surfaces validation failure");
  assert(invalid.content[0]?.text.includes("Validation error"), "MCP validation failure keeps error detail");
}

async function verifyApprovalBoundary(): Promise<void> {
  section("3. MCP Approval Boundary");

  const { adapter } = createFixture();
  const client = new InProcessMcpClient(new InProcessMcpServer({
    name: "colony-test-mcp",
    version: "0.1.0",
    toolAdapter: adapter,
  }));

  const denied = await client.callTool("write_file", { path: "out.txt" });
  assertEqual(denied.isError, true, "Approval-gated MCP tool fails closed by default");
  assert(denied.content[0]?.text.includes("Approval required"), "Approval denial explains required approval");

  const callerApproved = await client.callTool("write_file", { path: "out.txt" }, { approved: true });
  assertEqual(callerApproved.isError, true, "Caller-supplied approval boolean cannot execute approval-gated MCP tool");

  const args = { path: "out.txt" };
  const approvalId = "apr_phase31";
  const signature = approvalSignature("write_file", args);
  const approvedFixture = createFixture({
    approvedSignatures: new Map([[approvalId, signature]]),
  });
  const approvedClient = new InProcessMcpClient(new InProcessMcpServer({
    name: "colony-test-mcp",
    version: "0.1.0",
    toolAdapter: approvedFixture.adapter,
  }));
  const approved = await approvedClient.callTool("write_file", args, {
    approvalId,
    approvalSignature: signature,
  });
  assertEqual(approved.isError, false, "Verifier-approved MCP proof can execute approval-gated tool");
  assertEqual(approved.content[0]?.text, "wrote file", "Approved MCP tool returns executor output");
}

async function verifyProtocolErrors(): Promise<void> {
  section("4. MCP Protocol Errors");

  const { adapter } = createFixture();
  const server = new InProcessMcpServer({
    name: "colony-test-mcp",
    version: "0.1.0",
    toolAdapter: adapter,
  });

  const malformed = await server.handle({ jsonrpc: "2.0", id: 1, method: "unknown/method" });
  assertEqual(malformed.error?.code, -32601, "Unknown MCP method returns method-not-found error");

  const missingName = await server.handle({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { arguments: {} },
  });
  assertEqual(missingName.error?.code, -32602, "Invalid MCP tool call params return invalid-params error");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 31 Verification (MCP Foundation)\n");

  await verifyInitializeAndList();
  await verifyToolCalls();
  await verifyApprovalBoundary();
  await verifyProtocolErrors();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 31: MCP foundation is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
