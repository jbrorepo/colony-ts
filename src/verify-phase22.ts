/**
 * Phase 22 Verification Script - Daemon HTTP Transport
 *
 * Covers the second Phase 6 daemon/control-plane slice:
 *   1. HTTP request validation for daemon command envelopes
 *   2. Optional bearer-token boundary for remote transport
 *   3. Remote client path over a real local listener
 *
 * Run: bun run src/verify-phase22.ts
 */

import { Caste } from "./caste/enums";
import {
  DaemonControlPlaneClient,
  DaemonControlPlaneHost,
  DaemonHttpControlPlaneServer,
  handleDaemonHttpRequest,
} from "./daemon";

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

async function verifyHttpRequestValidation(): Promise<void> {
  section("1. Daemon HTTP Request Validation");

  const host = new DaemonControlPlaneHost();
  const wrongPath = await handleDaemonHttpRequest(host, new Request("http://127.0.0.1/not-daemon", {
    method: "POST",
    body: JSON.stringify({ type: "describe", requestId: "req_wrong_path" }),
  }));
  assertEqual(wrongPath.status, 404, "HTTP handler rejects wrong path");
  assertEqual((await readJson(wrongPath)).ok, false, "Wrong path returns JSON error");

  const wrongMethod = await handleDaemonHttpRequest(host, new Request("http://127.0.0.1/api/daemon", {
    method: "GET",
  }));
  assertEqual(wrongMethod.status, 405, "HTTP handler rejects non-POST method");
  assertEqual(wrongMethod.headers.get("allow"), "POST", "Wrong method advertises POST allow header");

  const badJson = await handleDaemonHttpRequest(host, new Request("http://127.0.0.1/api/daemon", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  }));
  assertEqual(badJson.status, 400, "HTTP handler rejects malformed JSON");
  assert((String((await readJson(badJson)).error ?? "")).includes("Invalid JSON"), "Malformed JSON error is explicit");

  const missingToken = await handleDaemonHttpRequest(host, new Request("http://127.0.0.1/api/daemon", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "describe", requestId: "req_missing_token" }),
  }), { authToken: "secret" });
  assertEqual(missingToken.status, 401, "HTTP handler rejects missing bearer token");

  const wrongToken = await handleDaemonHttpRequest(host, new Request("http://127.0.0.1/api/daemon", {
    method: "POST",
    headers: {
      "authorization": "Bearer wrong",
      "content-type": "application/json",
    },
    body: JSON.stringify({ type: "describe", requestId: "req_wrong_token" }),
  }), { authToken: "secret" });
  assertEqual(wrongToken.status, 403, "HTTP handler rejects wrong bearer token");

  const described = await handleDaemonHttpRequest(host, new Request("http://127.0.0.1/api/daemon", {
    method: "POST",
    headers: {
      "authorization": "Bearer secret",
      "content-type": "application/json",
    },
    body: JSON.stringify({ type: "describe", requestId: "req_auth_ok" }),
  }), { authToken: "secret" });
  const describedBody = await readJson(described);
  assertEqual(described.status, 200, "HTTP handler accepts valid command");
  assertEqual(describedBody.requestId, "req_auth_ok", "HTTP response preserves request id");
}

async function verifyRemoteClientOverLocalListener(): Promise<void> {
  section("2. Daemon Remote Client Over Local Listener");

  const host = new DaemonControlPlaneHost();
  const server = new DaemonHttpControlPlaneServer({
    host,
    hostname: "127.0.0.1",
    port: 0,
    authToken: "secret",
  });

  await server.start();
  try {
    assert(server.url.startsWith("http://127.0.0.1:"), "HTTP server exposes local listener URL");

    const client = new DaemonControlPlaneClient({
      baseUrl: server.url,
      authToken: "secret",
    });

    const described = await client.send({ type: "describe", requestId: "req_client_describe" });
    assertEqual(described.ok, true, "Remote client describes daemon host");
    assert(described.capabilities?.includes("sessions.create") ?? false, "Remote client receives host capabilities");

    const created = await client.send({
      type: "create_session",
      requestId: "req_client_create",
      agentId: "remote_http_agent",
      caste: Caste.ASSIST_ANT,
      tenantScope: "workspace-http",
    });
    assertEqual(created.ok, true, "Remote client creates session over HTTP");
    assert(created.session?.sessionId.startsWith("ses_") ?? false, "Remote created session returns id");

    const listed = await client.send({ type: "list_sessions", requestId: "req_client_list" });
    assertEqual(listed.ok, true, "Remote client lists sessions over HTTP");
    assertEqual(listed.sessions?.[0]?.sessionId, created.session?.sessionId, "Remote list includes created session");

    const unauthenticated = await fetch(server.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "describe", requestId: "req_no_auth" }),
    });
    assertEqual(unauthenticated.status, 401, "Real listener enforces bearer token");
  } finally {
    await server.stop();
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 22 Verification (Daemon HTTP Transport)\n");

  await verifyHttpRequestValidation();
  await verifyRemoteClientOverLocalListener();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 22: Daemon HTTP transport is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
