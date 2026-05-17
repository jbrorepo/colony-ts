/**
 * Phase 231 Verification Script - Local Web-Control Operator UX
 *
 * Covers Alpha 2 local web-control depth:
 *   1. Local-only shell/state/action routing rejects public hosts by default
 *   2. Read shell renders daemon, provider, workflow, swarm, and channel status
 *   3. Mutation-enabled shell renders approved local action handoff controls
 *   4. Mutating handoffs require web.mutate scope, local host, allowed action, and approval
 *   5. No direct mutation execution, public hosting, secret echo, or arbitrary content exposure
 *
 * Run: bun run src/verify-phase231.ts
 */

import { DaemonAuthPolicy } from "./daemon";
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
  assert(actual === expected, `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}\n  ${title}\n${"=".repeat(60)}`);
}

function authPolicy(): DaemonAuthPolicy {
  return new DaemonAuthPolicy({
    tokens: [
      { token: "read-token", label: "reader", scopes: ["web.read"] },
      { token: "mutate-token", label: "operator", scopes: ["web.read", "web.mutate"] },
    ],
  });
}

function fixtureState() {
  return {
    generatedAt: "2026-05-13T03:52:20.709Z",
    daemon: {
      transport: "http",
      endpoint: "http://127.0.0.1:4317/api/daemon?token=SHOULD_NOT_LEAK",
      capabilities: ["daemon.describe", "workflow.automation", "swarm.status"],
      auth: { required: true, tokenCount: 2 },
    },
    providers: {
      selected: "ollama",
      model: "llama3.1",
      health: "ready",
      candidates: [
        { provider: "ollama", model: "llama3.1", health: "ready", lastError: "none" },
        { provider: "anthropic", model: "claude", health: "missing_key", apiKey: "sk-ant-SHOULD_NOT_LEAK" },
      ],
    },
    workflowRuns: [
      {
        runId: "wf_alpha2",
        title: "private workflow title",
        objective: "private workflow objective",
        status: "paused",
        completedSteps: 2,
        totalSteps: 4,
        artifactCount: 1,
      },
    ],
    swarmRuns: [
      {
        runId: "swarm_alpha2",
        title: "private swarm title",
        status: "failed",
        workerCount: 3,
        taskCount: 3,
        completedTaskCount: 1,
        failedTaskCount: 1,
        messages: [{ content: "private swarm transcript" }],
      },
    ],
    channels: {
      status: {
        enabledCount: 0,
        connectedCount: 0,
        deliveryCount: 0,
      },
      contractCount: 3,
      sessionRouteCount: 1,
    },
    metadata: {
      transcript: "private transcript body",
      safe: "not operator status",
    },
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

async function verifyLocalOnlyBoundary(): Promise<void> {
  section("1. Local-only shell boundary");
  const publicShell = await handleWebControlRequest(
    new Request("https://example.com/control", {
      headers: { authorization: "Bearer read-token" },
    }),
    { state: fixtureState(), authPolicy: authPolicy() },
  );
  assertEqual(publicShell.status, 403, "Public host shell is rejected");
  const publicText = await publicShell.text();
  assert(publicText.includes("\"publicHosting\":false"), "Public host rejection states no public hosting");

  const publicState = await handleWebControlRequest(
    new Request("https://example.com/control/state", {
      headers: { authorization: "Bearer read-token" },
    }),
    { state: fixtureState(), authPolicy: authPolicy() },
  );
  assertEqual(publicState.status, 403, "Public host state endpoint is rejected");
}

async function verifyOperatorShellRendering(): Promise<void> {
  section("2. Local operator shell rendering");
  const response = await handleWebControlRequest(
    new Request("http://localhost/control", {
      headers: { authorization: "Bearer read-token" },
    }),
    { state: fixtureState(), authPolicy: authPolicy() },
  );
  const html = await response.text();
  assertEqual(response.status, 200, "Local shell renders");
  assert(html.includes("Colony Local Control"), "Shell uses local control title");
  assert(html.includes("Provider"), "Shell renders provider section");
  assert(html.includes("ollama"), "Shell renders selected provider");
  assert(html.includes("llama3.1"), "Shell renders selected model");
  assert(html.includes("wf_alpha2"), "Shell renders workflow run id");
  assert(html.includes("swarm_alpha2"), "Shell renders swarm run id");
  assert(html.includes("Channels"), "Shell renders channel status");
  assert(!html.includes("private workflow objective"), "Shell omits private workflow objective");
  assert(!html.includes("private swarm transcript"), "Shell omits private swarm transcript");
  assert(!html.includes("SHOULD_NOT_LEAK"), "Shell redacts secret values");
  assert(!html.match(/<form|data-action=/i), "Read-only shell has no mutation controls");
}

async function verifyMutationControls(): Promise<void> {
  section("3. Approved local action handoff controls");
  const response = await handleWebControlRequest(
    new Request("http://127.0.0.1/control", {
      headers: { authorization: "Bearer mutate-token" },
    }),
    {
      state: fixtureState(),
      authPolicy: authPolicy(),
      mutation: { enabled: true, allowedActions: ["resume_swarm", "retry_swarm_stage"] },
    },
  );
  const html = await response.text();
  assertEqual(response.status, 200, "Mutation-enabled local shell renders");
  assert(html.includes("Local action handoff enabled"), "Shell labels local action mode");
  assert(html.includes("data-action=\"resume_swarm\""), "Shell renders resume action control");
  assert(html.includes("data-action=\"retry_swarm_stage\""), "Shell renders retry action control");
  assert(!html.includes("cancel_swarm"), "Shell hides disallowed action control");
  assert(!html.match(/https?:\/\/example\.com|public listener/i), "Shell does not advertise public hosting");
}

async function verifyMutationHandoffGuardrails(): Promise<void> {
  section("4. Mutation handoff guardrails");
  const missingScope = await handleWebControlRequest(
    new Request("http://localhost/control/action", {
      method: "POST",
      headers: { authorization: "Bearer read-token" },
      body: JSON.stringify({ action: "resume_swarm", runId: "swarm_alpha2", approved: true }),
    }),
    {
      state: fixtureState(),
      authPolicy: authPolicy(),
      mutation: { enabled: true },
    },
  );
  const missingBody = await readJson(missingScope);
  assertEqual(missingScope.status, 403, "Mutation rejects missing web.mutate scope");
  assertEqual(missingBody.requiredScope, "web.mutate", "Missing scope response names required scope");

  const notApproved = await handleWebControlRequest(
    new Request("http://localhost/control/action", {
      method: "POST",
      headers: { authorization: "Bearer mutate-token" },
      body: JSON.stringify({ action: "resume_swarm", runId: "swarm_alpha2", approved: false }),
    }),
    {
      state: fixtureState(),
      authPolicy: authPolicy(),
      mutation: { enabled: true },
    },
  );
  assertEqual(notApproved.status, 403, "Mutation rejects missing explicit approval");

  const accepted = await handleWebControlRequest(
    new Request("http://localhost/control/action", {
      method: "POST",
      headers: { authorization: "Bearer mutate-token" },
      body: JSON.stringify({ action: "resume_swarm", runId: "swarm_alpha2", approved: true }),
    }),
    {
      state: fixtureState(),
      authPolicy: authPolicy(),
      mutation: { enabled: true },
    },
  );
  const body = await readJson(accepted);
  assertEqual(accepted.status, 202, "Approved local mutation handoff is accepted");
  assertEqual(body.executed, false, "Accepted handoff does not execute directly");
  assertEqual(body.publicHosting, false, "Accepted handoff is not public hosting");
  assertEqual(body.execution, "host-mediated", "Accepted handoff remains host-mediated");
}

function verifySerializedProviderProjection(): void {
  section("5. Serialized provider projection");
  const state = serializeWebControlState(fixtureState());
  const json = JSON.stringify(state);
  assertEqual(state.provider?.selected, "ollama", "Serialized state includes selected provider");
  assertEqual(state.provider?.model, "llama3.1", "Serialized state includes selected model");
  assertEqual(state.provider?.candidateCount, 2, "Serialized state counts provider candidates");
  assert(!json.includes("SHOULD_NOT_LEAK"), "Serialized provider state redacts secret values");
  assert(!json.includes("private transcript body"), "Serialized state omits arbitrary transcript bodies");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 231 Verification (Local Web-Control Operator UX)\n");
  await verifyLocalOnlyBoundary();
  await verifyOperatorShellRendering();
  await verifyMutationControls();
  await verifyMutationHandoffGuardrails();
  verifySerializedProviderProjection();

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 231: local web-control operator UX is GREEN.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
