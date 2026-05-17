/**
 * Phase 71 Verification Script - Trusted MCP Stdio Server Configuration
 *
 * Proves stdio MCP servers cannot be launched from ad-hoc config: a named
 * server definition must pass validation and carry an exact operator approval
 * signature before Colony creates the guarded child-process transport.
 *
 * Run: bun run src/verify-phase71.ts
 */

import {
  InProcessMcpClient,
  buildStdioMcpServerApprovalRequest,
  createApprovedStdioMcpServerTrust,
  createTrustedStdioMcpClient,
  stdioMcpServerTrustSignature,
  type StdioMcpServerDefinition,
} from "./mcp";
import { mkdir, writeFile } from "fs/promises";
import { join, resolve } from "path";

let passed = 0;
let failed = 0;
let fixturePath = "";

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

function fixtureScript(): string {
  return `
const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin });
function send(value) {
  process.stdout.write(JSON.stringify(value) + "\\n");
}
rl.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "phase71-trusted", version: "0.1.0" },
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
        tools: [
          { name: "echo_text", description: "Echo trusted text.", inputSchema: { type: "object" } },
          { name: "write_file", description: "Unsafe fixture tool.", inputSchema: { type: "object" } }
        ]
      }
    });
    return;
  }
  if (request.method === "tools/call") {
    send({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        content: [{ type: "text", text: "trusted:" + String(request.params && request.params.name) }],
        isError: false
      }
    });
  }
});
`;
}

function trustedDefinition(overrides: Partial<StdioMcpServerDefinition> = {}): StdioMcpServerDefinition {
  return {
    id: "phase71-fixture",
    command: process.execPath,
    args: [fixturePath],
    cwd: process.cwd(),
    allowedTools: ["echo_text"],
    ...overrides,
  };
}

async function writeFixtureScript(): Promise<string> {
  const dir = resolve(".tmp-phase71");
  await mkdir(dir, { recursive: true });
  const path = join(dir, "trusted-mcp-fixture.cjs");
  await writeFile(path, fixtureScript(), "utf8");
  return path;
}

async function verifyApprovalRequestAndSignature(): Promise<void> {
  section("1. Approval Request and Signature");

  const definition = trustedDefinition({
    env: { SAFE_MODE: "1" },
  });
  const request = buildStdioMcpServerApprovalRequest(definition);
  assertEqual(request.serverId, "phase71-fixture", "Approval request carries server id");
  assertEqual(request.riskLevel, "high", "Approval request marks stdio server launch as high risk");
  assert(request.summary.includes("phase71-fixture"), "Approval request summary names the server");
  assert(request.details.includes("env keys: SAFE_MODE"), "Approval request lists environment keys without values");
  assert(!request.details.includes("\"SAFE_MODE\":\"1\""), "Approval request does not expose environment values");
  assert(request.warnings.some((warning) => warning.includes("local code execution")), "Approval request warns about local code execution");

  const same = trustedDefinition({ env: { SAFE_MODE: "1" } });
  assertEqual(
    stdioMcpServerTrustSignature(definition),
    stdioMcpServerTrustSignature(same),
    "Trust signature is stable for equivalent definitions",
  );
  assert(
    stdioMcpServerTrustSignature(definition) !== stdioMcpServerTrustSignature(trustedDefinition({ allowedTools: ["other_tool"] })),
    "Trust signature changes when local allowlist policy changes",
  );
}

async function verifyFailClosedConfig(): Promise<void> {
  section("2. Fail-Closed Config and Approval");

  const definition = trustedDefinition();
  await expectRejects(
    "Unapproved stdio server definitions cannot create transports",
    () => createTrustedStdioMcpClient(definition, { approved: false, signature: stdioMcpServerTrustSignature(definition) }),
    (error) => error.message.includes("MCP stdio server is not trusted"),
  );
  await expectRejects(
    "Stale approval signatures cannot create transports",
    () => createTrustedStdioMcpClient(definition, { approved: true, signature: "mcp-stdio:stale" }),
    (error) => error.message.includes("MCP stdio server is not trusted"),
  );
  await expectRejects(
    "Shell executables are rejected before stdio transport creation",
    () => createTrustedStdioMcpClient(trustedDefinition({ command: process.platform === "win32" ? "powershell.exe" : "sh" }), createApprovedStdioMcpServerTrust(definition)),
    (error) => error.message.includes("MCP stdio server config rejected"),
  );
  await expectRejects(
    "Windows shell executable aliases are rejected before stdio transport creation",
    () => createTrustedStdioMcpClient(trustedDefinition({ command: process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "/usr/bin/bash.exe" }), createApprovedStdioMcpServerTrust(trustedDefinition({ command: process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "/usr/bin/bash.exe" }))),
    (error) => error.message.includes("MCP stdio server config rejected"),
  );
  await expectRejects(
    "PATH-only stdio commands are rejected before transport creation",
    () => createTrustedStdioMcpClient(trustedDefinition({ command: "node" }), createApprovedStdioMcpServerTrust(trustedDefinition({ command: "node" }))),
    (error) => error.message.includes("MCP stdio server config rejected"),
  );
  await expectRejects(
    "Inline eval stdio arguments are rejected before transport creation",
    () => createTrustedStdioMcpClient(trustedDefinition({ args: ["-e", "console.log('nope')"] }), createApprovedStdioMcpServerTrust(trustedDefinition({ args: ["-e", "console.log('nope')"] }))),
    (error) => error.message.includes("MCP stdio server config rejected"),
  );
  await expectRejects(
    "Inline eval assignment arguments are rejected before transport creation",
    () => createTrustedStdioMcpClient(trustedDefinition({ args: ["--eval=console.log('nope')"] }), createApprovedStdioMcpServerTrust(trustedDefinition({ args: ["--eval=console.log('nope')"] }))),
    (error) => error.message.includes("MCP stdio server config rejected"),
  );
  await expectRejects(
    "Short inline eval assignment arguments are rejected before transport creation",
    () => createTrustedStdioMcpClient(trustedDefinition({ args: ["-e=console.log('nope')"] }), createApprovedStdioMcpServerTrust(trustedDefinition({ args: ["-e=console.log('nope')"] }))),
    (error) => error.message.includes("MCP stdio server config rejected"),
  );
  await expectRejects(
    "Inline print assignment arguments are rejected before transport creation",
    () => createTrustedStdioMcpClient(trustedDefinition({ args: ["--print=console.log('nope')"] }), createApprovedStdioMcpServerTrust(trustedDefinition({ args: ["--print=console.log('nope')"] }))),
    (error) => error.message.includes("MCP stdio server config rejected"),
  );
  await expectRejects(
    "Short inline print arguments are rejected before transport creation",
    () => createTrustedStdioMcpClient(trustedDefinition({ args: ["-p", "console.log('nope')"] }), createApprovedStdioMcpServerTrust(trustedDefinition({ args: ["-p", "console.log('nope')"] }))),
    (error) => error.message.includes("MCP stdio server config rejected"),
  );
  await expectRejects(
    "Short inline print assignment arguments are rejected before transport creation",
    () => createTrustedStdioMcpClient(trustedDefinition({ args: ["-p=console.log('nope')"] }), createApprovedStdioMcpServerTrust(trustedDefinition({ args: ["-p=console.log('nope')"] }))),
    (error) => error.message.includes("MCP stdio server config rejected"),
  );
  await expectRejects(
    "Package runners are rejected before transport creation",
    () => createTrustedStdioMcpClient(trustedDefinition({ command: process.platform === "win32" ? "C:\\tools\\npx.cmd" : "/usr/bin/npx" }), createApprovedStdioMcpServerTrust(trustedDefinition({ command: process.platform === "win32" ? "C:\\tools\\npx.cmd" : "/usr/bin/npx" }))),
    (error) => error.message.includes("MCP stdio server config rejected"),
  );
  await expectRejects(
    "Shell script wrappers are rejected before transport creation",
    () => createTrustedStdioMcpClient(trustedDefinition({ command: process.platform === "win32" ? "C:\\tools\\server.sh" : "/usr/local/bin/server.sh" }), createApprovedStdioMcpServerTrust(trustedDefinition({ command: process.platform === "win32" ? "C:\\tools\\server.sh" : "/usr/local/bin/server.sh" }))),
    (error) => error.message.includes("MCP stdio server config rejected"),
  );
  await expectRejects(
    "Secret-looking environment keys are rejected before stdio transport creation",
    () => createTrustedStdioMcpClient(trustedDefinition({ env: { API_TOKEN: "SHOULD_NOT_LEAK_TOKEN_12345" } }), createApprovedStdioMcpServerTrust(trustedDefinition({ env: { API_TOKEN: "SHOULD_NOT_LEAK_TOKEN_12345" } }))),
    (error) => error.message.includes("MCP stdio server config rejected") && !error.message.includes("SHOULD_NOT_LEAK"),
  );
  await expectRejects(
    "Secret-looking environment values are rejected before stdio transport creation",
    () => createTrustedStdioMcpClient(trustedDefinition({ env: { SAFE_MODE: "SHOULD_NOT_LEAK_TOKEN_12345" } }), createApprovedStdioMcpServerTrust(trustedDefinition({ env: { SAFE_MODE: "SHOULD_NOT_LEAK_TOKEN_12345" } }))),
    (error) => error.message.includes("MCP stdio server config rejected") && !error.message.includes("SHOULD_NOT_LEAK"),
  );
}

async function verifyTrustedClientFlow(): Promise<void> {
  section("3. Trusted Client Flow");

  const definition = trustedDefinition();
  const session = createTrustedStdioMcpClient(definition, createApprovedStdioMcpServerTrust(definition), {
    timeoutMs: 1_000,
  });
  assert(session.approval.signature === stdioMcpServerTrustSignature(definition), "Trusted session exposes exact approval signature");
  assertEqual(session.context.origin, "stdio://mcp/phase71-fixture", "Trusted session derives stable stdio origin");
  assertEqual(session.context.pluginId, "phase71-fixture", "Trusted session derives stable plugin id");
  assert(session.server.allowedMethods.includes("tools/call"), "Trusted session allows tools/call when tools are allowlisted");
  assert(!("stdioTransport" in session), "Trusted session does not expose raw stdio transport");
  try {
    const client = new InProcessMcpClient(session.transport);
    const init = await client.initialize();
    assertEqual(init.serverInfo.name, "phase71-trusted", "Trusted stdio client initializes server");
    const tools = await client.listTools();
    assertEqual(tools.tools.length, 2, "Trusted stdio client can inspect server tools");
    const called = await client.callTool("echo_text", { text: "hello" });
    assertEqual(called.content[0]?.text, "trusted:echo_text", "Trusted stdio client calls allowlisted tool");
    await expectRejects(
      "Trusted stdio client rejects non-allowlisted tool calls before child execution",
      () => client.callTool("write_file", { path: "out.txt" }),
      (error) => error.message.includes("MCP transport failed"),
    );
  } finally {
    await session.close();
  }
}

async function verifyListOnlyPolicy(): Promise<void> {
  section("4. List-Only Policy");

  const definition = trustedDefinition({ allowedTools: [] });
  const session = createTrustedStdioMcpClient(definition, createApprovedStdioMcpServerTrust(definition), {
    timeoutMs: 1_000,
  });
  try {
    const client = new InProcessMcpClient(session.transport);
    await client.initialize();
    const tools = await client.listTools();
    assertEqual(tools.tools[0]?.name, "echo_text", "List-only trusted stdio client can inspect tools");
    assert(!session.server.allowedMethods.includes("tools/call"), "List-only trusted stdio policy omits tools/call");
    await expectRejects(
      "List-only trusted stdio client rejects all tool calls",
      () => client.callTool("echo_text", { text: "hello" }),
      (error) => error.message.includes("MCP transport failed"),
    );
  } finally {
    await session.close();
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 71 Verification (Trusted MCP Stdio Server Configuration)\n");
  fixturePath = await writeFixtureScript();

  await verifyApprovalRequestAndSignature();
  await verifyFailClosedConfig();
  await verifyTrustedClientFlow();
  await verifyListOnlyPolicy();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 71: trusted MCP stdio server configuration is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
