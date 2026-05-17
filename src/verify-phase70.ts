/**
 * Phase 70 Verification Script - MCP Stdio Transport Foundation
 *
 * Proves a real stdio JSON-RPC transport can talk to a child process while
 * still relying on the guarded MCP boundary for external transport safety.
 *
 * Run: bun run src/verify-phase70.ts
 */

import {
  GuardedMcpTransport,
  InProcessMcpClient,
  type McpJsonRpcRequest,
  type McpJsonRpcResponse,
  type McpTransport,
  type McpTransportContext,
} from "./mcp";
import { StdioMcpTransport } from "./mcp/stdio-transport";

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

const TRUSTED_STDIO_CONTEXT: McpTransportContext = {
  transportKind: "stdio",
  origin: "stdio://phase70-fixture",
  pluginId: "phase70-fixture",
  clientId: "phase70",
};

class ContextualMcpTransport implements McpTransport {
  constructor(
    private readonly inner: McpTransport,
    private readonly context: McpTransportContext,
  ) {}

  async send(request: McpJsonRpcRequest): Promise<McpJsonRpcResponse> {
    return await this.inner.send(request, this.context);
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

function fixtureScript(mode = "normal"): string {
  return `
const readline = require("readline");
const mode = ${JSON.stringify(mode)};
const rl = readline.createInterface({ input: process.stdin });
function send(value) {
  process.stdout.write(JSON.stringify(value) + "\\n");
}
rl.on("line", async (line) => {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
    return;
  }
  if (mode === "stderr-secret") {
    process.stderr.write("secret=SHOULD_NOT_LEAK_TOKEN_12345\\n");
  }
  if (mode === "stderr-long-secret") {
    process.stderr.write("secret=" + "SHOULD_NOT_LEAK_TOKEN_12345".repeat(4) + "\\n");
  }
  if (mode === "wrong-id") {
    send({ jsonrpc: "2.0", id: 999, result: {} });
    return;
  }
  if (mode === "never") {
    return;
  }
  if (request.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "stdio-fixture", version: "0.1.0" },
        capabilities: { tools: { listChanged: false } }
      }
    });
    return;
  }
  if (request.method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        tools: [{
          name: "echo_text",
          description: "Echoes text over stdio.",
          inputSchema: { type: "object", properties: { text: { type: "string" } } }
        }]
      }
    });
    return;
  }
  if (request.method === "tools/call") {
    send({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        content: [{ type: "text", text: "stdio:" + String(request.params && request.params.name) }],
        isError: false
      }
    });
    return;
  }
  send({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "not found" } });
});
`;
}

function createTransport(mode = "normal"): StdioMcpTransport {
  return new StdioMcpTransport({
    command: process.execPath,
    args: ["-e", fixtureScript(mode)],
    transportContext: {
      origin: TRUSTED_STDIO_CONTEXT.origin,
      pluginId: TRUSTED_STDIO_CONTEXT.pluginId,
      clientId: TRUSTED_STDIO_CONTEXT.clientId,
    },
    maxStderrBytes: 128,
  });
}

function trustedClient(transport: StdioMcpTransport, options: ConstructorParameters<typeof GuardedMcpTransport>[1]): InProcessMcpClient {
  const guarded = new GuardedMcpTransport(transport, options);
  return new InProcessMcpClient(new ContextualMcpTransport(guarded, TRUSTED_STDIO_CONTEXT));
}

async function verifyStdioClientFlow(): Promise<void> {
  section("1. Stdio Client Flow");

  const transport = createTransport();
  const client = trustedClient(transport, {
    allowedMethods: ["initialize", "tools/list", "tools/call"],
    allowedTools: ["echo_text"],
    allowedOrigins: ["stdio://phase70-fixture"],
    allowedPluginIds: ["phase70-fixture"],
    timeoutMs: 1_000,
  });
  try {
    const init = await client.initialize({ clientName: "phase70" });
    assertEqual(init.serverInfo.name, "stdio-fixture", "Stdio initialize returns fixture server info");
    const listed = await client.listTools();
    assertEqual(listed.tools[0]?.name, "echo_text", "Stdio tools/list returns fixture tool");
    const called = await client.callTool("echo_text", { text: "hello" });
    assertEqual(called.content[0]?.text, "stdio:echo_text", "Stdio tools/call returns fixture output");
  } finally {
    await transport.close();
  }
}

async function verifyGuardAndSanitization(): Promise<void> {
  section("2. Guard and Sanitization");

  const disallowed = createTransport();
  const client = trustedClient(disallowed, {
    allowedMethods: ["initialize", "tools/list", "tools/call"],
    allowedTools: ["echo_text"],
    allowedOrigins: ["stdio://phase70-fixture"],
    allowedPluginIds: ["phase70-fixture"],
    timeoutMs: 1_000,
  });
  try {
    await expectRejects(
      "Guard rejects disallowed stdio tool before child execution",
      () => client.callTool("write_file", { path: "out.txt" }),
      (error) => error.message.includes("MCP transport failed"),
    );
  } finally {
    await disallowed.close();
  }

  const stderrTransport = createTransport("stderr-secret");
  const stderrClient = trustedClient(stderrTransport, {
    allowedMethods: ["initialize"],
    allowedOrigins: ["stdio://phase70-fixture"],
    allowedPluginIds: ["phase70-fixture"],
    timeoutMs: 1_000,
  });
  try {
    const init = await stderrClient.initialize();
    assertEqual(init.serverInfo.name, "stdio-fixture", "Stdio transport tolerates bounded stderr");
    assert(!stderrTransport.diagnostics().stderrTail.includes("SHOULD_NOT_LEAK"), "Stdio stderr diagnostics are redacted");
  } finally {
    await stderrTransport.close();
  }

  const truncatedSecretTransport = new StdioMcpTransport({
    command: process.execPath,
    args: ["-e", fixtureScript("stderr-long-secret")],
    transportContext: {
      origin: TRUSTED_STDIO_CONTEXT.origin,
      pluginId: TRUSTED_STDIO_CONTEXT.pluginId,
      clientId: TRUSTED_STDIO_CONTEXT.clientId,
    },
    maxStderrBytes: 20,
  });
  const truncatedSecretClient = trustedClient(truncatedSecretTransport, {
    allowedMethods: ["initialize"],
    allowedOrigins: ["stdio://phase70-fixture"],
    allowedPluginIds: ["phase70-fixture"],
    timeoutMs: 1_000,
  });
  try {
    await truncatedSecretClient.initialize();
    const tail = truncatedSecretTransport.diagnostics().stderrTail;
    assert(!tail.includes("SHOULD_NOT_LEAK"), "Stdio stderr truncation does not expose secret suffixes");
  } finally {
    await truncatedSecretTransport.close();
  }
}

async function verifyTimeoutAndResponseMatching(): Promise<void> {
  section("3. Timeout and Response Matching");

  const never = createTransport("never");
  const neverClient = trustedClient(never, {
    allowedMethods: ["initialize"],
    allowedOrigins: ["stdio://phase70-fixture"],
    allowedPluginIds: ["phase70-fixture"],
    timeoutMs: 20,
  });
  try {
    await expectRejects(
      "Guarded stdio requests time out when child does not answer",
      () => neverClient.initialize(),
      (error) => error.message.includes("MCP transport failed"),
    );
    const diagnostics = never.diagnostics();
    assertEqual(diagnostics.closed, true, "Guarded stdio timeout closes the child transport");
    assertEqual(diagnostics.pending, 0, "Guarded stdio timeout clears pending requests");
  } finally {
    await never.close();
  }

  const wrongId = createTransport("wrong-id");
  const wrongIdClient = trustedClient(wrongId, {
    allowedMethods: ["initialize"],
    allowedOrigins: ["stdio://phase70-fixture"],
    allowedPluginIds: ["phase70-fixture"],
    timeoutMs: 50,
  });
  try {
    await expectRejects(
      "Stdio transport rejects mismatched response ids",
      () => wrongIdClient.initialize(),
      (error) => error.message.includes("MCP transport failed"),
    );
  } finally {
    await wrongId.close();
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 70 Verification (MCP Stdio Transport Foundation)\n");

  await verifyStdioClientFlow();
  await verifyGuardAndSanitization();
  await verifyTimeoutAndResponseMatching();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 70: MCP stdio transport foundation is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
