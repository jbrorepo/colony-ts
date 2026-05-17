/**
 * Phase 89 Verification Script - Read-Only Web Control Shell
 *
 * Covers P1 Web Control Shell:
 *   1. Auth-enforced GET-only web control request handling
 *   2. Read-only HTML shell over daemon/workflow/swarm/channel state
 *   3. JSON state endpoint with redaction and no mutation affordances
 *   4. No remote mutation endpoints, forms, credentials, or secret leakage
 *
 * Run: bun run src/verify-phase89.ts
 */

import {
  DaemonAuthPolicy,
  type DaemonAuthStatus,
} from "./daemon";
import {
  handleWebControlRequest,
  serializeWebControlState,
} from "./web-control";

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

function authPolicy(): DaemonAuthPolicy {
  return new DaemonAuthPolicy({
    tokens: [
      {
        token: "web-reader-token",
        label: "web-reader",
        scopes: ["web.read"],
      },
      {
        token: "session-only-token",
        label: "session-only",
        scopes: ["daemon.describe", "sessions.read", "workflow.read"],
      },
    ],
  });
}

function fixtureAuthStatus(): DaemonAuthStatus {
  return {
    required: true,
    tokenCount: 1,
    tokens: [
      {
        label: "web-reader",
    scopes: ["web.read"],
        expired: false,
      },
    ],
  };
}

function fixtureState() {
  return {
    generatedAt: "2026-05-02T04:04:16.135Z",
    daemon: {
      endpoint: "http://127.0.0.1:4317/api/daemon?token=plain123&api_key=plain456",
      transport: "http",
      startedAt: "2026-05-02T04:00:00.000Z",
      capabilities: ["sessions.list", "workflow.automation"],
      auth: fixtureAuthStatus(),
    },
    workflowRuns: [
      {
        runId: "wfr_1",
        title: "Verify channel shell",
        objective: "private workflow objective",
        status: "running",
        completedSteps: 1,
        totalSteps: 3,
        artifactCount: 2,
      },
    ],
    swarmRuns: [
      {
        runId: "swarm_demo",
        title: "Read-only status",
        status: "running",
        workerCount: 3,
        taskCount: 3,
        assignedTaskCount: 3,
        completedTaskCount: 0,
        failedTaskCount: 0,
        cancelledTaskCount: 0,
        messages: [
          {
            role: "worker",
            content: "private swarm message",
          },
        ],
        createdAt: "2026-05-02T04:00:00.000Z",
        updatedAt: "2026-05-02T04:02:00.000Z",
      },
    ],
    channels: {
      status: {
        channels: [
          {
            channelId: "discord",
            displayName: "Discord fixture",
            enabled: false,
            connected: false,
            capabilities: ["contract_only"],
            redactedConfig: {
              token: "discord-token",
            },
          },
        ],
        enabledCount: 0,
        connectedCount: 0,
        deliveryCount: 0,
      },
      contractCount: 3,
      sessionRouteCount: 1,
    },
    metadata: {
      apiKey: "sk-secret-value",
      safe: "visible",
      transcript: "private transcript text",
      messageBody: "private message body",
      message: "private generic message",
      messages: [{ content: "private nested message" }],
      content: "private generic content",
      toolOutput: "private tool output body",
    },
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

async function verifyAuthAndReadOnlyBoundary(): Promise<void> {
  section("1. Web Control Auth and Read-Only Boundary");

  const missing = await handleWebControlRequest(
    new Request("http://127.0.0.1/control"),
    { authPolicy: authPolicy(), state: fixtureState() },
  );
  assertEqual(missing.status, 401, "Web shell rejects missing bearer token");
  assert(!JSON.stringify(await readJson(missing)).includes("web-reader-token"), "Missing-token response does not leak configured token");

  const missingPolicy = await handleWebControlRequest(
    new Request("http://127.0.0.1/control", {
      headers: { authorization: "Bearer web-reader-token" },
    }),
    { state: fixtureState() },
  );
  assertEqual(missingPolicy.status, 401, "Web shell fails closed when auth policy is not wired");

  const insufficient = await handleWebControlRequest(
    new Request("http://127.0.0.1/control", {
      headers: { authorization: "Bearer session-only-token" },
    }),
    { authPolicy: authPolicy(), state: fixtureState() },
  );
  assertEqual(insufficient.status, 403, "Web shell rejects token without web.read scope");

  const post = await handleWebControlRequest(
    new Request("http://127.0.0.1/control", {
      method: "POST",
      headers: { authorization: "Bearer web-reader-token" },
    }),
    { authPolicy: authPolicy(), state: fixtureState() },
  );
  assertEqual(post.status, 405, "Web shell rejects POST mutation attempts");
  assertEqual(post.headers.get("allow"), "GET", "Web shell only allows GET");

  const unknown = await handleWebControlRequest(
    new Request("http://127.0.0.1/control/mutate", {
      headers: { authorization: "Bearer web-reader-token" },
    }),
    { authPolicy: authPolicy(), state: fixtureState() },
  );
  assertEqual(unknown.status, 404, "Unknown web control route is not exposed");
}

async function verifyHtmlShell(): Promise<void> {
  section("2. Read-Only HTML Shell");

  const response = await handleWebControlRequest(
    new Request("http://127.0.0.1/control", {
      headers: { authorization: "Bearer web-reader-token" },
    }),
    { authPolicy: authPolicy(), state: fixtureState() },
  );
  const html = await response.text();
  assertEqual(response.status, 200, "Authorized web shell returns HTML");
  assert(response.headers.get("content-type")?.includes("text/html") ?? false, "HTML response has text/html content type");
  assert(html.includes("Colony Control Shell"), "HTML shell names Colony control shell");
  assert(html.includes("Read-only"), "HTML shell states read-only mode");
  assert(html.includes("Daemon"), "HTML shell renders daemon section");
  assert(html.includes("Workflow"), "HTML shell renders workflow section");
  assert(html.includes("Swarm"), "HTML shell renders swarm section");
  assert(html.includes("Channels"), "HTML shell renders channels section");
  assert(html.includes("No remote mutation endpoints"), "HTML shell states mutation endpoints are absent");
  assert(!html.match(/<form|method=.post|button type=.submit/i), "HTML shell contains no mutation form controls");
  assert(!html.match(/web-reader-token|secret-token|discord-token|sk-secret-value/i), "HTML shell redacts secrets");
  assert(!html.match(/Verify channel shell|Read-only status|private workflow objective|private swarm message/i), "HTML shell renders status fields without detailed work content");
}

async function verifyJsonState(): Promise<void> {
  section("3. Redacted JSON State Endpoint");

  const response = await handleWebControlRequest(
    new Request("http://127.0.0.1/control/state", {
      headers: { authorization: "Bearer web-reader-token" },
    }),
    { authPolicy: authPolicy(), state: fixtureState() },
  );
  const body = await readJson(response);
  const json = JSON.stringify(body);
  assertEqual(response.status, 200, "Authorized state endpoint returns JSON");
  assert(response.headers.get("cache-control") === "no-store", "State endpoint disables caching");
  assert(response.headers.get("x-content-type-options") === "nosniff", "State endpoint sets nosniff");
  assertEqual(body.readOnly, true, "State endpoint declares read-only mode");
  assertEqual((body.daemon as Record<string, unknown>).transport, "http", "State endpoint includes daemon state");
  assert(Array.isArray(body.workflowRuns), "State endpoint includes workflow runs");
  assert(Array.isArray(body.swarmRuns), "State endpoint includes swarm runs");
  assert(isRecord(body.channels), "State endpoint includes channel state");
  assert(!json.match(/web-reader-token|plain123|plain456|discord-token|sk-secret-value/i), "State endpoint redacts secrets");
  assert(!json.match(/private transcript text|private message body|private generic message|private nested message|private generic content|private tool output body/i), "State endpoint redacts transcript/message/content/tool output bodies");
  assert(!json.match(/Verify channel shell|Read-only status|private workflow objective|private swarm message|visible/i), "State endpoint projects status-only fields");
  assertEqual(body.metadata, undefined, "State endpoint omits arbitrary metadata");
  assert(json.includes("[REDACTED]"), "State endpoint preserves redaction marker");
}

function verifySerializer(): void {
  section("4. Pure State Serialization");

  const serialized = serializeWebControlState(fixtureState());
  const json = JSON.stringify(serialized);
  assertEqual(serialized.readOnly, true, "Serializer marks state read-only");
  assertEqual(serialized.mutationEndpoints.length, 0, "Serializer exposes no mutation endpoints");
  assert(!json.match(/visible|Verify channel shell|Read-only status|private workflow objective|private swarm message/i), "Serializer projects status-only fields");
  assert(!json.match(/plain123|plain456|discord-token|sk-secret-value|private transcript text|private message body|private generic message|private nested message|private generic content|private tool output body/i), "Serializer redacts secret-like values and body fields");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 89 Verification (Web Control Shell)\n");

  await verifyAuthAndReadOnlyBoundary();
  await verifyHtmlShell();
  await verifyJsonState();
  verifySerializer();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 89: web control shell is GREEN.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
