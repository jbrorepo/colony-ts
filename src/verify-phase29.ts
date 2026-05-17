/**
 * Phase 29 Verification Script - Daemon Auth Hardening and Operator Surface
 *
 * Covers the fourth Phase 6 daemon/control-plane slice:
 *   1. Scoped bearer-token authorization for daemon HTTP commands
 *   2. Redacted daemon auth status metadata for operator views
 *   3. `/daemon` command visibility for remote endpoint/auth/session state
 *
 * Run: bun run src/verify-phase29.ts
 */

import { Caste } from "./caste/enums";
import {
  DaemonAuthPolicy,
  DaemonControlPlaneHost,
  handleDaemonHttpRequest,
} from "./daemon";
import { parseCommand, SlashCommandParser } from "./gateway";

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

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

async function verifyScopedDaemonAuth(): Promise<void> {
  section("1. Scoped Daemon HTTP Authorization");

  const host = new DaemonControlPlaneHost();
  const authPolicy = new DaemonAuthPolicy({
    tokens: [
      {
        token: "reader-token",
        label: "reader",
        scopes: ["daemon.describe", "sessions.read"],
      },
      {
        token: "operator-token",
        label: "operator",
        scopes: ["daemon.describe", "sessions.read", "sessions.write", "workflow.read", "workflow.write"],
      },
    ],
  });

  const missing = await handleDaemonHttpRequest(host, new Request("http://127.0.0.1/api/daemon", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "describe", requestId: "req_missing" }),
  }), { authPolicy });
  assertEqual(missing.status, 401, "Scoped auth rejects missing bearer token");
  assert(String((await readJson(missing)).error ?? "").includes("Missing bearer token"), "Missing token error is explicit");

  const described = await handleDaemonHttpRequest(host, new Request("http://127.0.0.1/api/daemon", {
    method: "POST",
    headers: {
      authorization: "Bearer reader-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ type: "describe", requestId: "req_reader_describe" }),
  }), { authPolicy });
  const describedBody = await readJson(described);
  assertEqual(described.status, 200, "Read-scoped token can describe daemon");
  assertEqual(describedBody.ok, true, "Read-scoped describe succeeds");
  assert(Array.isArray(describedBody.authScopes), "Describe exposes authorized scope metadata");
  assert(!(JSON.stringify(describedBody).includes("reader-token")), "Describe never echoes bearer token");

  const deniedCreate = await handleDaemonHttpRequest(host, new Request("http://127.0.0.1/api/daemon", {
    method: "POST",
    headers: {
      authorization: "Bearer reader-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      type: "create_session",
      requestId: "req_reader_create",
      agentId: "remote_agent",
      caste: Caste.ASSIST_ANT,
    }),
  }), { authPolicy });
  const deniedBody = await readJson(deniedCreate);
  assertEqual(deniedCreate.status, 403, "Read-scoped token cannot create sessions");
  assert(String(deniedBody.error ?? "").includes("sessions.write"), "Scope denial names required scope");

  const created = await handleDaemonHttpRequest(host, new Request("http://127.0.0.1/api/daemon", {
    method: "POST",
    headers: {
      authorization: "Bearer operator-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      type: "create_session",
      requestId: "req_operator_create",
      agentId: "remote_agent",
      caste: Caste.ASSIST_ANT,
      tenantScope: "workspace-auth",
    }),
  }), { authPolicy });
  const createdBody = await readJson(created);
  assertEqual(created.status, 200, "Write-scoped token can create sessions");
  assertEqual(createdBody.ok, true, "Write-scoped create succeeds");
  assert(String((createdBody.session as Record<string, unknown> | undefined)?.sessionId ?? "").startsWith("ses_"), "Created session returns id");
}

function verifyDaemonAuthStatus(): void {
  section("2. Daemon Auth Status Metadata");

  const policy = new DaemonAuthPolicy({
    tokens: [
      {
        token: "operator-token",
        label: "operator",
        scopes: ["daemon.describe", "sessions.read", "sessions.write"],
        expiresAt: "2030-01-01T00:00:00.000Z",
      },
    ],
  });

  const status = policy.status();
  assertEqual(status.required, true, "Auth status reports required boundary");
  assertEqual(status.tokenCount, 1, "Auth status reports token count");
  assertEqual(status.tokens[0]?.label, "operator", "Auth status keeps token label");
  assert(status.tokens[0]?.scopes.includes("sessions.write") ?? false, "Auth status reports scopes");
  assertEqual(status.tokens[0]?.expiresAt, "2030-01-01T00:00:00.000Z", "Auth status reports expiry");
  assert(!(JSON.stringify(status).includes("operator-token")), "Auth status redacts raw token");
}

function verifyDaemonGatewayCommand(): void {
  section("3. /daemon Operator Command");

  const parsed = parseCommand("/daemon auth");
  assertEqual(parsed.type, "daemon", "parseCommand recognizes /daemon");
  assertEqual(parsed.args[0], "auth", "parseCommand preserves /daemon view arg");

  const parser = new SlashCommandParser({
    daemon: {
      endpoint: "http://127.0.0.1:4317/api/daemon",
      transport: "http",
      startedAt: "2026-04-26T10:00:00.000Z",
      capabilities: ["sessions.create", "sessions.list", "workflow.automation"],
      auth: {
        required: true,
        tokenCount: 2,
        tokens: [
          {
            label: "reader",
            scopes: ["daemon.describe", "sessions.read"],
          },
          {
            label: "operator",
            scopes: ["daemon.describe", "sessions.read", "sessions.write", "workflow.write"],
            expiresAt: "2030-01-01T00:00:00.000Z",
          },
        ],
      },
      sessions: [
        {
          sessionId: "ses_remote",
          agentId: "agent_remote",
          caste: "assist_ant",
          tenantScope: "workspace-a",
          state: "active",
          messageCount: 3,
        },
      ],
      lastAuthFailure: {
        code: "insufficient_scope",
        requiredScope: "sessions.write",
      },
    },
  });

  const overview = parser.tryHandle("/daemon");
  assertEqual(overview.handled, true, "/daemon command resolves");
  assert(overview.output.includes("Daemon Control Plane"), "/daemon renders daemon header");
  assert(overview.output.includes("http://127.0.0.1:4317/api/daemon"), "/daemon shows endpoint");
  assert(overview.output.includes("Auth: required"), "/daemon shows auth requirement");
  assert(overview.output.includes("Tokens: 2"), "/daemon shows token count");
  assert(overview.output.includes("Sessions: 1"), "/daemon shows session count");
  assert(overview.output.includes("/daemon auth"), "/daemon teaches auth view");

  const auth = parser.tryHandle("/daemon auth");
  assert(auth.output.includes("reader"), "/daemon auth lists token labels");
  assert(auth.output.includes("sessions.write"), "/daemon auth lists scopes");
  assert(auth.output.includes("Last auth failure: insufficient_scope"), "/daemon auth shows last failure");
  assert(!auth.output.includes("operator-token"), "/daemon auth does not leak token values");

  const sessions = parser.tryHandle("/daemon sessions");
  assert(sessions.output.includes("ses_remote"), "/daemon sessions lists remote sessions");
  assert(sessions.output.includes("workspace-a"), "/daemon sessions includes tenant scope");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 29 Verification (Daemon Auth + Operator Surface)\n");

  await verifyScopedDaemonAuth();
  verifyDaemonAuthStatus();
  verifyDaemonGatewayCommand();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 29: Daemon auth hardening and operator surface are GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
