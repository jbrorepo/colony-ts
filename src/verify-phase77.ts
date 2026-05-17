/**
 * Phase 77 Verification Script - Plugin MCP Sidecar Supervisor Foundation
 *
 * Proves production plugin fabric now has a supervisor boundary over managed
 * plugin sidecar sessions: trusted start, list/inspect/client access, redacted
 * lifecycle events, deterministic stop, failure detection, and bounded restart
 * backoff over injected transports.
 *
 * Run: bun run src/verify-phase77.ts
 */

import {
  PluginMcpSidecarSupervisor,
  createApprovedPluginMcpSidecarTrust,
  type McpJsonRpcRequest,
  type McpJsonRpcResponse,
  type McpTransport,
  type McpTransportContext,
  type PluginMcpSidecarDefinition,
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

function pluginDefinition(overrides: Partial<PluginMcpSidecarDefinition> = {}): PluginMcpSidecarDefinition {
  return {
    id: "phase77-plugin",
    packageName: "@colony/plugin-phase77",
    packageVersion: "3.0.0",
    packageSource: "skills-main",
    packageDigest: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    sidecarId: "phase77-sidecar",
    sidecarKind: "local-sidecar",
    declaredCapabilities: ["mcp.tools"],
    allowedTools: ["echo_text"],
    expectedProtocolVersion: "2024-11-05",
    expectedServerName: "phase77-plugin-sidecar",
    expectedServerVersion: "3.0.0",
    ...overrides,
  };
}

class SupervisorFixtureTransport implements McpTransport {
  calls = 0;
  closeCalls = 0;
  contexts: McpTransportContext[] = [];
  private closeFailuresRemaining: number;

  constructor(closeFailures = 0) {
    this.closeFailuresRemaining = closeFailures;
  }

  async send(request: McpJsonRpcRequest, context: McpTransportContext = {}): Promise<McpJsonRpcResponse> {
    this.calls++;
    this.contexts.push({ ...context });
    if (request.method === "initialize") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "phase77-plugin-sidecar", version: "3.0.0" },
          capabilities: { tools: { listChanged: false } },
        },
      };
    }
    if (request.method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: [{ name: "echo_text", description: "Echo plugin text.", inputSchema: { type: "object" } }],
        },
      };
    }
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        content: [{ type: "text", text: `supervised:${String((request.params as { name?: unknown } | undefined)?.name)}` }],
        isError: false,
      },
    };
  }

  async close(): Promise<void> {
    this.closeCalls++;
    if (this.closeFailuresRemaining > 0) {
      this.closeFailuresRemaining--;
      throw new Error("SHOULD_NOT_LEAK_TOKEN_STOP_12345");
    }
  }
}

class SecretLifecycleTransport implements McpTransport {
  async send(request: McpJsonRpcRequest, context: McpTransportContext = {}): Promise<McpJsonRpcResponse> {
    void context;
    if (request.method === "initialize") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "SHOULD_NOT_LEAK_TOKEN_PROTOCOL_12345",
          serverInfo: {
            name: "SHOULD_NOT_LEAK_TOKEN_SERVER_12345",
            version: "SHOULD_NOT_LEAK_TOKEN_VERSION_12345",
          },
          capabilities: { tools: { listChanged: false } },
        },
      };
    }
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: { tools: [] },
    };
  }
}

async function verifyStartInspectClientAndStop(): Promise<void> {
  section("1. Start, Inspect, Client, and Stop");

  const transports: SupervisorFixtureTransport[] = [];
  const supervisor = new PluginMcpSidecarSupervisor({
    createTransport: () => {
      const transport = new SupervisorFixtureTransport();
      transports.push(transport);
      return transport;
    },
    now: () => new Date("2026-04-29T14:34:27.000Z"),
    restartBackoffMs: 250,
    maxRestarts: 1,
  });
  const definition = pluginDefinition();
  const snapshot = await supervisor.start(definition, createApprovedPluginMcpSidecarTrust(definition));

  assertEqual(snapshot.state, "running", "Supervisor start records running state");
  assertEqual(snapshot.serverId, "phase77-plugin", "Supervisor snapshot carries server id");
  assertEqual(snapshot.restartCount, 0, "Supervisor start begins with zero restarts");
  assertEqual(snapshot.lifecycle?.serverInfo.name, "phase77-plugin-sidecar", "Supervisor snapshot exposes managed lifecycle truth");
  assert(!("sidecarTransport" in snapshot), "Supervisor snapshot does not expose raw sidecar transport");
  assertEqual(supervisor.list().length, 1, "Supervisor list includes started sidecar");
  assertEqual(supervisor.inspect("phase77-plugin")?.state, "running", "Supervisor inspect returns running sidecar");
  const duplicate = await supervisor.start(definition, createApprovedPluginMcpSidecarTrust(definition));
  assertEqual(duplicate.state, "running", "Supervisor duplicate start for same signature is idempotent");
  assertEqual(transports.length, 1, "Supervisor duplicate start does not create a second transport");
  await expectRejects(
    "Supervisor rejects active signature changes without reusing the old session",
    () => supervisor.start(
      pluginDefinition({ packageDigest: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" }),
      createApprovedPluginMcpSidecarTrust(pluginDefinition({ packageDigest: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" })),
    ),
    (error) => error.message.includes("MCP plugin sidecar supervisor active signature conflict"),
  );
  assertEqual(transports.length, 1, "Supervisor active signature conflict does not create a second transport");

  const called = await supervisor.client("phase77-plugin").callTool("echo_text", { text: "hello" });
  assertEqual(called.content[0]?.text, "supervised:echo_text", "Supervisor client can call allowlisted plugin tool");
  assertEqual(transports[0]?.contexts[0]?.transportKind, "plugin", "Supervisor start uses pinned plugin context");
  const callCount = transports[0]?.calls ?? 0;
  await expectRejects(
    "Supervisor client preserves tool allowlist before sidecar dispatch",
    () => supervisor.client("phase77-plugin").callTool("dangerous_tool", {}),
    (error) => error.message.includes("MCP transport failed"),
  );
  assertEqual(transports[0]?.calls, callCount, "Supervisor rejected tool calls do not reach sidecar transport");

  const stopped = await supervisor.stop("phase77-plugin");
  assertEqual(stopped.state, "stopped", "Supervisor stop records stopped state");
  assertEqual(transports[0]?.closeCalls, 1, "Supervisor stop closes sidecar transport");
  await supervisor.stop("phase77-plugin");
  assertEqual(transports[0]?.closeCalls, 1, "Supervisor stop is idempotent");
  await expectRejects(
    "Supervisor client rejects stopped sidecars",
    () => supervisor.client("phase77-plugin").listTools(),
    (error) => error.message.includes("MCP plugin sidecar supervisor session is not running"),
  );
  assert(supervisor.events().some((event) => event.stage === "started"), "Supervisor emits started event");
  assert(supervisor.events().some((event) => event.stage === "stopped"), "Supervisor emits stopped event");
}

async function verifyStopFailureTruthAndRetry(): Promise<void> {
  section("2. Stop Failure Truth and Retry");

  const transports: SupervisorFixtureTransport[] = [];
  const supervisor = new PluginMcpSidecarSupervisor({
    createTransport: () => {
      const transport = new SupervisorFixtureTransport(1);
      transports.push(transport);
      return transport;
    },
    now: () => new Date("2026-04-29T14:34:27.000Z"),
  });
  const definition = pluginDefinition({ id: "phase77-stop-plugin", sidecarId: "phase77-stop-sidecar" });
  await supervisor.start(definition, createApprovedPluginMcpSidecarTrust(definition));

  await expectRejects(
    "Supervisor stop failures are generic and redacted",
    () => supervisor.stop("phase77-stop-plugin"),
    (error) => error.message === "MCP plugin sidecar supervisor stop failed" && !error.message.includes("SHOULD_NOT_LEAK"),
  );
  assertEqual(supervisor.inspect("phase77-stop-plugin")?.state, "running", "Supervisor keeps running state after failed stop");
  assertEqual(transports[0]?.closeCalls, 1, "Supervisor failed stop reaches transport once");
  const tools = await supervisor.client("phase77-stop-plugin").listTools();
  assertEqual(tools.tools.length, 1, "Supervisor keeps managed client usable after failed stop");

  const stopped = await supervisor.stop("phase77-stop-plugin");
  assertEqual(stopped.state, "stopped", "Supervisor stop retry records stopped state");
  assertEqual(transports[0]?.closeCalls, 2, "Supervisor stop can retry after close failure");
}

async function verifyFailureBackoffAndRestartLimit(): Promise<void> {
  section("3. Failure Backoff and Restart Limit");

  let currentTime = Date.parse("2026-04-29T14:34:27.000Z");
  const transports: SupervisorFixtureTransport[] = [];
  const supervisor = new PluginMcpSidecarSupervisor({
    createTransport: () => {
      const transport = new SupervisorFixtureTransport();
      transports.push(transport);
      return transport;
    },
    now: () => new Date(currentTime),
    restartBackoffMs: 1_000,
    maxRestarts: 1,
  });
  const definition = pluginDefinition({ id: "phase77-restart-plugin", sidecarId: "phase77-restart-sidecar" });
  await supervisor.start(definition, createApprovedPluginMcpSidecarTrust(definition));

  const failed = await supervisor.recordFailure("phase77-restart-plugin", "SHOULD_NOT_LEAK_TOKEN_RESTART_12345");
  assertEqual(failed.state, "backing_off", "Supervisor records backing-off state after detected failure");
  assertEqual(failed.restartCount, 1, "Supervisor increments restart count on detected failure");
  assert(failed.nextRestartAt === "2026-04-29T14:34:28.000Z", "Supervisor calculates deterministic next restart time");
  assertEqual(transports[0]?.closeCalls, 1, "Supervisor closes failed sidecar before restart");
  const failureEvent = supervisor.events().find((event) => event.stage === "failure_detected");
  assertEqual(failureEvent?.state, "failed", "Supervisor failure-detected event records failed state truth");
  await expectRejects(
    "Supervisor rejects restart before backoff expires",
    () => supervisor.restart("phase77-restart-plugin"),
    (error) => error.message.includes("MCP plugin sidecar restart backoff active"),
  );
  await expectRejects(
    "Supervisor direct start cannot bypass restart backoff",
    () => supervisor.start(definition, createApprovedPluginMcpSidecarTrust(definition)),
    (error) => error.message.includes("MCP plugin sidecar restart backoff active"),
  );
  assertEqual(transports.length, 1, "Supervisor direct start during backoff does not create a transport");

  currentTime += 1_000;
  const restarted = await supervisor.restart("phase77-restart-plugin");
  assertEqual(restarted.state, "running", "Supervisor restarts after backoff expires");
  assertEqual(transports.length, 2, "Supervisor restart creates a fresh sidecar transport");

  const terminal = await supervisor.recordFailure("phase77-restart-plugin", "second failure");
  assertEqual(terminal.state, "failed", "Supervisor records failed state after restart limit");
  await expectRejects(
    "Supervisor enforces restart limit",
    () => supervisor.restart("phase77-restart-plugin"),
    (error) => error.message.includes("MCP plugin sidecar restart limit reached"),
  );
  await expectRejects(
    "Supervisor direct start cannot bypass restart limit",
    () => supervisor.start(definition, createApprovedPluginMcpSidecarTrust(definition)),
    (error) => error.message.includes("MCP plugin sidecar restart limit reached"),
  );
  assertEqual(transports.length, 2, "Supervisor direct start after restart limit does not create a transport");
  assert(supervisor.events().every((event) => !JSON.stringify(event).includes("SHOULD_NOT_LEAK")), "Supervisor lifecycle events redact failure reasons");
}

async function verifyFailClosedStartAndNoRawSecrets(): Promise<void> {
  section("4. Fail-Closed Start and Redaction");

  const definition = pluginDefinition({ id: "phase77-denied-plugin", sidecarId: "phase77-denied-sidecar" });
  let factoryCalls = 0;
  const supervisor = new PluginMcpSidecarSupervisor({
    createTransport: () => {
      factoryCalls++;
      return new SupervisorFixtureTransport();
    },
    now: () => new Date("2026-04-29T14:34:27.000Z"),
  });

  await expectRejects(
    "Supervisor rejects stale approvals before exposing a session",
    () => supervisor.start(definition, createApprovedPluginMcpSidecarTrust(pluginDefinition())),
    (error) => error.message.includes("MCP plugin sidecar supervisor start failed"),
  );
  assertEqual(factoryCalls, 0, "Supervisor stale approvals fail before transport factory execution");
  assertEqual(supervisor.inspect("phase77-denied-plugin")?.state, "failed", "Supervisor records failed start generically");
  await expectRejects(
    "Supervisor client rejects failed start sessions",
    () => supervisor.client("phase77-denied-plugin"),
    (error) => error.message.includes("MCP plugin sidecar supervisor session is not running"),
  );
  const serialized = JSON.stringify(supervisor.events());
  assert(!serialized.includes("approvedBy"), "Supervisor lifecycle events do not expose approval actors");
  assert(!serialized.includes("reason"), "Supervisor lifecycle events do not expose approval or failure reason text");
  assert(!serialized.includes("sidecarTransport"), "Supervisor lifecycle events do not expose raw sidecar transport");
}

async function verifySnapshotLifecycleRedaction(): Promise<void> {
  section("5. Snapshot Lifecycle Redaction");

  const supervisor = new PluginMcpSidecarSupervisor({
    createTransport: () => new SupervisorFixtureTransport(),
    now: () => new Date("2026-04-29T14:34:27.000Z"),
  });
  const definition = pluginDefinition({
    id: "phase77-redacted-plugin",
    sidecarId: "phase77-redacted-sidecar",
    expectedProtocolVersion: "SHOULD_NOT_LEAK_TOKEN_PROTOCOL_12345",
    expectedServerName: "phase77-plugin-sidecar",
  });
  await expectRejects(
    "Supervisor redaction fixture fails handshake generically",
    () => supervisor.start(definition, createApprovedPluginMcpSidecarTrust(definition)),
    (error) => error.message.includes("MCP plugin sidecar supervisor start failed"),
  );

  const runningSupervisor = new PluginMcpSidecarSupervisor({
    createTransport: () => new SecretLifecycleTransport(),
    now: () => new Date("2026-04-29T14:34:27.000Z"),
  });
  const secretDefinition = pluginDefinition({
    id: "phase77-redact-lifecycle",
    sidecarId: "phase77-redact-lifecycle-sidecar",
    expectedProtocolVersion: undefined,
    expectedServerName: undefined,
    expectedServerVersion: undefined,
  });
  await runningSupervisor.start(secretDefinition, createApprovedPluginMcpSidecarTrust(secretDefinition));
  const serialized = JSON.stringify(runningSupervisor.inspect("phase77-redact-lifecycle"));
  assert(!serialized.includes("SHOULD_NOT_LEAK"), "Supervisor snapshots redact lifecycle protocol/server strings");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 77 Verification (Plugin MCP Sidecar Supervisor Foundation)\n");

  await verifyStartInspectClientAndStop();
  await verifyStopFailureTruthAndRetry();
  await verifyFailureBackoffAndRestartLimit();
  await verifyFailClosedStartAndNoRawSecrets();
  await verifySnapshotLifecycleRedaction();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 77: plugin MCP sidecar supervisor foundation is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
