/**
 * Phase 21 Verification Script - Daemon Control Plane Foundation
 *
 * Covers the first Phase 6 daemon/control-plane slice:
 *   1. Serializable daemon host capability discovery
 *   2. Remote-safe session lifecycle commands
 *   3. Workflow automation delegation through the daemon envelope
 *
 * Run: bun run src/verify-phase21.ts
 */

import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { Caste } from "./caste/enums";
import { DaemonControlPlaneHost } from "./daemon";
import {
  JsonWorkflowStore,
  WorkflowAutomationController,
  WorkflowEngine,
} from "./workflow";

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

async function verifyDaemonSessionControlPlane(): Promise<void> {
  section("1. Daemon Session Control Plane");

  const host = new DaemonControlPlaneHost();
  const described = await host.handle({ type: "describe", requestId: "req_describe" });
  assertEqual(described.ok, true, "Daemon host describes capabilities");
  assert(described.capabilities?.includes("sessions.create") ?? false, "Daemon host exposes session creation capability");
  assertEqual(JSON.parse(JSON.stringify(described)).requestId, "req_describe", "Describe response is serializable");

  const created = await host.handle({
    type: "create_session",
    requestId: "req_create",
    agentId: "remote_agent",
    caste: Caste.ASSIST_ANT,
    tenantScope: "workspace-a",
    metadata: { client: "desktop" },
    config: { maxHistoryMessages: 12 },
  });

  assertEqual(created.ok, true, "Daemon host creates remote session");
  assert(created.session?.sessionId.startsWith("ses_") ?? false, "Created session returns stable session id");
  assertEqual(created.session?.agentId, "remote_agent", "Created session preserves agent id");
  assertEqual(created.session?.caste, Caste.ASSIST_ANT, "Created session preserves caste");
  assertEqual(created.session?.tenantScope, "workspace-a", "Created session preserves tenant scope");
  assertEqual(created.session?.messageCount, 0, "Session snapshot omits transcript but reports message count");
  assertEqual(JSON.parse(JSON.stringify(created)).requestId, "req_create", "Create response is serializable");

  const sessionId = created.session?.sessionId ?? "";
  const listed = await host.handle({ type: "list_sessions", requestId: "req_list" });
  assertEqual(listed.ok, true, "Daemon host lists sessions");
  assertEqual(listed.sessions?.length, 1, "Session list includes created session");
  assertEqual(listed.sessions?.[0]?.sessionId, sessionId, "Session list carries created session id");

  const inspected = await host.handle({ type: "inspect_session", requestId: "req_inspect", sessionId });
  assertEqual(inspected.ok, true, "Daemon host inspects session");
  assertEqual(inspected.session?.sessionId, sessionId, "Inspect returns requested session");

  const closed = await host.handle({ type: "close_session", requestId: "req_close", sessionId });
  assertEqual(closed.ok, true, "Daemon host closes session");
  assertEqual(closed.session?.state, "closed", "Closed session snapshot reports closed state");

  const missing = await host.handle({ type: "inspect_session", requestId: "req_missing", sessionId: "ses_missing" });
  assertEqual(missing.ok, false, "Daemon host reports missing session");
  assert(missing.error?.includes("Session not found") ?? false, "Missing session error is explicit");
}

async function verifyDaemonWorkflowDelegation(): Promise<void> {
  section("2. Daemon Workflow Automation Delegation");

  const dir = await mkdtemp(join(tmpdir(), "colony-daemon-workflow-"));
  try {
    const engine = new WorkflowEngine({
      store: new JsonWorkflowStore({ rootDir: dir }),
    });
    const workflowController = new WorkflowAutomationController({
      engine,
      handlers: {
        plan: async () => ({ summary: "Plan complete" }),
        execute: async () => ({ summary: "Execute complete" }),
        verify: async () => ({ summary: "Verify complete" }),
      },
    });
    const host = new DaemonControlPlaneHost({ workflowController });

    const described = await host.handle({ type: "describe", requestId: "req_workflow_describe" });
    assert(described.capabilities?.includes("workflow.automation") ?? false, "Daemon host exposes workflow automation when wired");

    const started = await host.handle({
      type: "workflow",
      requestId: "req_workflow_start",
      command: {
        type: "start_template",
        requestId: "wf_start",
        templateId: "approval_gated_delivery",
        workflowId: "wf_daemon_delivery",
        title: "Daemon delivery",
        objective: "Ship daemon control-plane foundation.",
        requiredApprover: "ops-lead",
      },
    });

    assertEqual(started.ok, true, "Daemon host delegates workflow start");
    assertEqual(started.workflow?.ok, true, "Delegated workflow command succeeds");
    assertEqual(started.workflow?.snapshot?.status, "paused", "Delegated workflow returns paused snapshot");
    assertEqual(started.workflow?.snapshot?.awaitingStepId, "approval", "Delegated workflow returns awaiting approval step");
    assertEqual(JSON.parse(JSON.stringify(started)).workflow.requestId, "wf_start", "Delegated workflow response is serializable");

    const runId = started.workflow?.snapshot?.runId ?? "";
    const approved = await host.handle({
      type: "workflow",
      requestId: "req_workflow_approve",
      command: {
        type: "approve",
        requestId: "wf_approve",
        runId,
        stepId: "approval",
        approvedBy: "ops-lead",
      },
    });

    assertEqual(approved.ok, true, "Daemon host delegates workflow approval");
    assertEqual(approved.workflow?.snapshot?.status, "paused", "Delegated workflow policy approval pauses at cost gate");
    assertEqual(approved.workflow?.snapshot?.awaitingStepId, "cost_gate", "Delegated workflow awaits Account-ant cost gate");

    const costApproved = await host.handle({
      type: "workflow",
      requestId: "req_workflow_cost_approve",
      command: {
        type: "approve",
        requestId: "wf_cost_approve",
        runId,
        stepId: "cost_gate",
        approvedBy: "ops-lead",
      },
    });

    assertEqual(costApproved.ok, true, "Daemon host delegates workflow cost approval");
    assertEqual(costApproved.workflow?.snapshot?.status, "completed", "Delegated workflow approval completes run");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 21 Verification (Daemon Control Plane Foundation)\n");

  await verifyDaemonSessionControlPlane();
  await verifyDaemonWorkflowDelegation();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 21: Daemon control-plane foundation is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
