/**
 * Phase 65 Verification Script - MCP Approval Proof Hardening
 *
 * Proves MCP approval-gated tools cannot be executed by caller-supplied
 * approval booleans. Approval must be verifier-owned and bound to the exact
 * tool name plus normalized arguments signature.
 *
 * Run: bun run src/verify-phase65.ts
 */

import {
  InProcessMcpClient,
  InProcessMcpServer,
  McpToolAdapter,
  type McpApprovalProof,
  type McpJsonRpcResponse,
  type McpToolCallResult,
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
  adapter: McpToolAdapter;
  client: InProcessMcpClient;
  server: InProcessMcpServer;
  calls: string[];
}

function createFixture(opts: {
  validProofs?: Map<string, string>;
  verifierThrows?: boolean;
} = {}): Fixture {
  const calls: string[] = [];
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
          mode: { type: "string" },
          marker: {},
        },
        required: ["path"],
        additionalProperties: false,
      },
      returns: { type: "string" },
    }),
    (args: Record<string, unknown>) => {
      calls.push(`write:${String(args.path)}:${String(args.mode ?? "")}:${"marker" in args ? "marker" : "no-marker"}`);
      return `wrote:${String(args.path)}`;
    },
  );
  registry.register(
    createToolDefinition("delete_file", "Delete File", {
      description: "Second approval-gated fixture for proof mismatch tests.",
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
      calls.push(`delete:${String(args.path)}`);
      return `deleted:${String(args.path)}`;
    },
  );

  const executor = new ToolExecutor(registry);
  const adapter = new McpToolAdapter(registry, executor, {
    exposedToolIds: ["delete_file", "echo_text", "write_file"],
    approvalVerifier: async (proof: McpApprovalProof, call) => {
      if (opts.verifierThrows) throw new Error("verifier exploded with secret=SHOULD_NOT_LEAK");
      return opts.validProofs?.get(proof.approvalId) === call.signature
        && proof.signature === call.signature;
    },
  });
  const server = new InProcessMcpServer({
    name: "colony-test-mcp",
    version: "0.1.0",
    toolAdapter: adapter,
  });
  return {
    adapter,
    calls,
    server,
    client: new InProcessMcpClient(server),
  };
}

function proofFor(toolName: string, args: Record<string, unknown>, approvalId: string): McpApprovalProof {
  return {
    approvalId,
    signature: approvalSignature(toolName, args),
  };
}

async function verifyFailClosedApprovalBoundary(): Promise<void> {
  section("1. Fail-Closed Approval Boundary");

  const { client, server, calls } = createFixture();

  const denied = await client.callTool("write_file", { path: "out.txt" });
  assertEqual(denied.isError, true, "Approval-gated MCP tool fails closed with no proof");
  assertEqual(calls.length, 0, "No-proof denial does not execute handler");

  const callerBoolean = await client.callTool("write_file", { path: "out.txt" }, {
    approved: true,
  });
  assertEqual(callerBoolean.isError, true, "Caller-supplied approved boolean is ignored");
  assertEqual(calls.length, 0, "Caller-approved denial does not execute handler");

  const fakeProof = await client.callTool("write_file", { path: "out.txt" }, {
    approved: true,
    approvalId: "fake",
    approvalSignature: approvalSignature("write_file", { path: "out.txt" }),
  });
  assertEqual(fakeProof.isError, true, "Unknown approval proof fails closed");
  assertEqual(calls.length, 0, "Fake-proof denial does not execute handler");

  const raw = await server.handle({
    jsonrpc: "2.0",
    id: "raw-approved",
    method: "tools/call",
    params: {
      name: "write_file",
      arguments: { path: "raw.txt" },
      _meta: {
        approved: true,
        approvalId: "raw_fake",
        approvalSignature: approvalSignature("write_file", { path: "raw.txt" }),
      },
    },
  }) as McpJsonRpcResponse<McpToolCallResult>;
  assertEqual(raw.result?.isError, true, "Raw server caller-supplied approval metadata fails closed");
  assertEqual(calls.length, 0, "Raw caller-approved denial does not execute handler");
}

async function verifyExactProofExecution(): Promise<void> {
  section("2. Exact Approval Proof Execution");

  const args = { path: "out.txt", mode: "create" };
  const proof = proofFor("write_file", args, "apr_valid_write");
  const validProofs = new Map([[proof.approvalId, proof.signature]]);
  const { client, calls } = createFixture({ validProofs });

  const result = await client.callTool("write_file", args, {
    approved: true,
    approvalId: proof.approvalId,
    approvalSignature: proof.signature,
  });
  assertEqual(result.isError, false, "Valid exact approval proof executes approval-gated MCP tool");
  assertEqual(result.content[0]?.text, "wrote:out.txt", "Valid exact proof returns executor output");
  assertEqual(calls.length, 1, "Valid exact proof executes handler once");
}

async function verifyProofMismatchDenials(): Promise<void> {
  section("3. Approval Proof Mismatch Denials");

  const approvedArgs = { path: "out.txt" };
  const proof = proofFor("write_file", approvedArgs, "apr_exact");
  const validProofs = new Map([[proof.approvalId, proof.signature]]);
  const { client, calls } = createFixture({ validProofs });

  const changedArgs = await client.callTool("write_file", { path: "out.txt", mode: "append" }, {
    approvalId: proof.approvalId,
    approvalSignature: proof.signature,
  });
  assertEqual(changedArgs.isError, true, "Approval proof for changed args fails closed");

  const differentTool = await client.callTool("delete_file", approvedArgs, {
    approvalId: proof.approvalId,
    approvalSignature: proof.signature,
  });
  assertEqual(differentTool.isError, true, "Approval proof for different tool fails closed");

  const signatureMismatch = await client.callTool("write_file", approvedArgs, {
    approvalId: proof.approvalId,
    approvalSignature: approvalSignature("write_file", { path: "other.txt" }),
  });
  assertEqual(signatureMismatch.isError, true, "Approval proof with signature mismatch fails closed");

  let nonJsonRejected = false;
  try {
    await client.callTool("write_file", { path: "out.txt", marker: undefined }, {
      approvalId: proof.approvalId,
      approvalSignature: proof.signature,
    });
  } catch (error) {
    nonJsonRejected = error instanceof Error && error.message.includes("JSON-compatible");
  }
  assert(nonJsonRejected, "Client non-JSON argument changes are rejected before transport/verifier approval");

  const direct = await createFixture({ validProofs }).adapter.callTool("write_file", { path: "out.txt", marker: undefined }, {
    approvalId: proof.approvalId,
    approvalSignature: proof.signature,
  });
  assertEqual(direct.isError, true, "Direct adapter non-JSON argument changes fail closed");
  assertEqual(calls.length, 0, "Mismatched proofs never execute handlers");
}

async function verifyVerifierAndNonApprovalBehavior(): Promise<void> {
  section("4. Verifier Failure + Non-Approval Tools");

  const throwing = createFixture({ verifierThrows: true });
  const denied = await throwing.client.callTool("write_file", { path: "out.txt" }, {
    approvalId: "apr_any",
    approvalSignature: approvalSignature("write_file", { path: "out.txt" }),
  });
  assertEqual(denied.isError, true, "Verifier exceptions fail closed");
  assert(!denied.content[0]?.text.includes("SHOULD_NOT_LEAK"), "Verifier exception denial does not leak secret details");
  assertEqual(throwing.calls.length, 0, "Verifier exception does not execute handler");

  const plain = createFixture();
  const result = await plain.client.callTool("echo_text", { text: "hello" });
  assertEqual(result.isError, false, "Non-approval MCP tools execute without approval proof");
  assertEqual(result.content[0]?.text, "echo:hello", "Non-approval tool returns executor output");
  assertEqual(plain.calls.length, 1, "Non-approval tool handler executes once");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 65 Verification (MCP Approval Proof Hardening)\n");

  await verifyFailClosedApprovalBoundary();
  await verifyExactProofExecution();
  await verifyProofMismatchDenials();
  await verifyVerifierAndNonApprovalBehavior();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 65: MCP approval proof hardening is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
