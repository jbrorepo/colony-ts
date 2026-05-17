/**
 * Phase 23 Verification Script - Daemon Remote Actions
 *
 * Covers the third Phase 6 daemon/control-plane slice:
 *   1. Typed remote session lifecycle/recovery actions over DaemonControlPlaneClient
 *   2. Typed remote workflow start/inspect/approve actions over DaemonControlPlaneClient
 *
 * Run: bun run src/verify-phase23.ts
 */

import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { Caste } from "./caste/enums";
import {
  DaemonControlPlaneClient,
  DaemonControlPlaneHost,
  DaemonHttpControlPlaneServer,
} from "./daemon";
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

async function verifyRemoteSessionRecoveryActions(): Promise<void> {
  section("1. Remote Session Recovery Actions");

  const host = new DaemonControlPlaneHost();
  const server = new DaemonHttpControlPlaneServer({
    host,
    hostname: "127.0.0.1",
    port: 0,
    authToken: "secret",
  });

  await server.start();
  try {
    const client = new DaemonControlPlaneClient({
      baseUrl: server.url,
      authToken: "secret",
    });

    const described = await client.describe("req_action_describe");
    assertEqual(described.ok, true, "Remote action client describes daemon");
    assert(described.capabilities?.includes("sessions.inspect") ?? false, "Remote action client sees inspect capability");

    const created = await client.createSession({
      requestId: "req_action_create",
      agentId: "remote_recovery_agent",
      caste: Caste.ASSIST_ANT,
      tenantScope: "workspace-recovery",
      metadata: { recovery: true },
    });
    assertEqual(created.ok, true, "Remote action client creates recoverable session");
    assertEqual(created.session?.metadata.recovery, true, "Created session preserves recovery metadata");

    const sessionId = created.session?.sessionId ?? "";
    const listed = await client.listSessions({ requestId: "req_action_list" });
    assertEqual(listed.ok, true, "Remote action client lists recoverable sessions");
    assertEqual(listed.sessions?.[0]?.sessionId, sessionId, "Remote action list includes created session");

    const inspected = await client.inspectSession(sessionId, "req_action_inspect");
    assertEqual(inspected.ok, true, "Remote action client inspects recoverable session");
    assertEqual(inspected.session?.tenantScope, "workspace-recovery", "Inspected session keeps tenant scope");

    const closed = await client.closeSession(sessionId, "req_action_close");
    assertEqual(closed.ok, true, "Remote action client closes recoverable session");
    assertEqual(closed.session?.state, "closed", "Closed recoverable session reports closed state");
  } finally {
    await server.stop();
  }
}

async function verifyRemoteWorkflowApprovalActions(): Promise<void> {
  section("2. Remote Workflow Approval Actions");

  const dir = await mkdtemp(join(tmpdir(), "colony-daemon-actions-"));
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
    const server = new DaemonHttpControlPlaneServer({
      host,
      hostname: "127.0.0.1",
      port: 0,
      authToken: "secret",
    });

    await server.start();
    try {
      const client = new DaemonControlPlaneClient({
        baseUrl: server.url,
        authToken: "secret",
      });

      const templates = await client.listWorkflowTemplates("req_action_templates");
      assertEqual(templates.ok, true, "Remote action client lists workflow templates");
      assert(templates.workflow?.templates?.some((template) => template.id === "approval_gated_delivery") ?? false, "Remote templates include approval-gated delivery");

      const started = await client.startWorkflowTemplate({
        requestId: "req_action_start",
        templateRequestId: "wf_action_start",
        templateId: "approval_gated_delivery",
        workflowId: "wf_remote_action_delivery",
        title: "Remote approval action",
        objective: "Approve a remote workflow through the typed client.",
        requiredApprover: "ops-lead",
      });
      assertEqual(started.ok, true, "Remote action client starts workflow");
      assertEqual(started.workflow?.snapshot?.status, "paused", "Remote started workflow pauses for approval");
      assertEqual(started.workflow?.snapshot?.awaitingStepId, "approval", "Remote started workflow exposes approval step");

      const runId = started.workflow?.snapshot?.runId ?? "";
      const inspected = await client.inspectWorkflow(runId, "req_action_workflow_inspect", "wf_action_inspect");
      assertEqual(inspected.ok, true, "Remote action client inspects workflow");
      assertEqual(inspected.workflow?.snapshot?.runId, runId, "Remote workflow inspect returns requested run");

      const approved = await client.approveWorkflow({
        requestId: "req_action_approve",
        approvalRequestId: "wf_action_approve",
        runId,
        stepId: "approval",
        approvedBy: "ops-lead",
      });
      assertEqual(approved.ok, true, "Remote action client approves workflow");
      assertEqual(approved.workflow?.snapshot?.status, "paused", "Remote workflow policy approval pauses at cost gate");
      assertEqual(approved.workflow?.snapshot?.awaitingStepId, "cost_gate", "Remote workflow exposes Account-ant cost gate");

      const costApproved = await client.approveWorkflow({
        requestId: "req_action_cost_approve",
        approvalRequestId: "wf_action_cost_approve",
        runId,
        stepId: "cost_gate",
        approvedBy: "ops-lead",
      });
      assertEqual(costApproved.ok, true, "Remote action client approves workflow cost gate");
      assertEqual(costApproved.workflow?.snapshot?.status, "completed", "Remote workflow approval completes run");
    } finally {
      await server.stop();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 23 Verification (Daemon Remote Actions)\n");

  await verifyRemoteSessionRecoveryActions();
  await verifyRemoteWorkflowApprovalActions();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 23: Daemon remote actions are GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
