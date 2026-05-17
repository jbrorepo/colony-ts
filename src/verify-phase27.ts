/**
 * Phase 27 Verification Script - Coordinator Policy Propagation
 *
 * Covers the fourth Phase 4 multi-agent slice:
 *   1. Coordinator task budget policy propagation
 *   2. Approval-gated coordinator task dispatch
 *   3. Security policy evaluation before worker assignment
 *
 * Run: bun run src/verify-phase27.ts
 */

import { Caste } from "./caste/enums";
import { ColonyAgentRegistry } from "./agents";
import {
  ColonyCoordinator,
  CoordinatorSessionBudgetPolicy,
} from "./orchestrator";
import {
  PolicyDecision,
  SecurityPolicyEngine,
} from "./security/policy";

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

async function verifyBudgetPolicyPropagation(): Promise<void> {
  section("1. Budget Policy Propagation");

  const registry = new ColonyAgentRegistry();
  const budgetPolicy = new CoordinatorSessionBudgetPolicy({
    maxTokens: 1_000,
    maxUsd: 0.10,
    sessionId: "phase27-budget",
  });
  const coordinator = new ColonyCoordinator({ registry, budgetPolicy });
  const worker = await registry.spawnWorker({
    role: "worker",
    caste: Caste.FORGE_CARVERS,
    objective: "Execute budgeted task.",
  });
  registry.markReady(worker.workerId);

  const execution = coordinator.startFanOutExecution({
    title: "Budgeted execution",
    objective: "Dispatch only work within budget.",
    children: [
      {
        title: "Expensive child",
        objective: "This child exceeds budget.",
        requiredRole: "worker",
        budget: { estimatedTokens: 1_500, estimatedUsd: 0.01 },
      },
    ],
  });

  const dispatch = coordinator.dispatchFanOutExecution(execution.executionId, [worker.workerId]);
  assertEqual(dispatch.assignments.length, 0, "Over-budget child is not assigned");
  const task = coordinator.listExecutionTasks(execution.executionId)[0];
  assertEqual(task?.status, "failed", "Over-budget child fails closed");
  assert(task?.failureReason?.includes("budget") ?? false, "Budget denial reason is recorded");
  assertEqual(task?.policyDecisions[0]?.source, "budget", "Task records budget policy source");
  assertEqual(task?.policyDecisions[0]?.allowed, false, "Task records denied budget decision");
  assertEqual(budgetPolicy.stats.deniedCount, 1, "Budget policy records denial count");
  assertEqual(registry.inspectWorker(worker.workerId)?.state, "idle", "Denied budget does not start worker");
}

async function verifyApprovalPolicyPropagation(): Promise<void> {
  section("2. Approval Policy Propagation");

  const registry = new ColonyAgentRegistry();
  const coordinator = new ColonyCoordinator({ registry });
  const worker = await registry.spawnWorker({
    role: "worker",
    caste: Caste.FORGE_CARVERS,
    objective: "Execute approval-gated task.",
  });
  registry.markReady(worker.workerId);

  const task = coordinator.enqueueTask({
    title: "Approval-gated child",
    objective: "Require operator approval before assignment.",
    requiredRole: "worker",
    approval: {
      reason: "Operator must approve multi-agent write.",
      requiredApprover: "lead",
    },
  });

  const blocked = coordinator.claimNextTask(worker.workerId);
  assertEqual(blocked, null, "Unapproved task is not assigned");
  const awaiting = coordinator.inspectTask(task.taskId);
  assertEqual(awaiting?.status, "blocked", "Unapproved task is blocked");
  assertEqual(awaiting?.awaitingApproval?.requiredApprover, "lead", "Blocked task exposes required approver");
  assertEqual(awaiting?.policyDecisions[0]?.status, "awaiting_approval", "Task records awaiting approval decision");

  const wrongApprover = coordinator.approveTask(task.taskId, "other");
  assertEqual(wrongApprover.status, "blocked", "Wrong approver keeps task blocked");
  assert(wrongApprover.failureReason?.includes("requires approver lead") ?? false, "Wrong approver reason is explicit");

  const approved = coordinator.approveTask(task.taskId, "lead");
  assertEqual(approved.status, "queued", "Required approver returns task to queue");
  assertEqual(approved.awaitingApproval, undefined, "Approval clears awaiting state");
  assertEqual(approved.policyDecisions[0]?.approvedBy, "lead", "Approval decision records approver");

  const assignment = coordinator.claimNextTask(worker.workerId);
  assertEqual(assignment?.task.taskId, task.taskId, "Approved task can be assigned");
  assertEqual(assignment?.worker.state, "running", "Approved task starts worker lifecycle");
}

async function verifySecurityPolicyPropagation(): Promise<void> {
  section("3. Security Policy Propagation");

  const registry = new ColonyAgentRegistry();
  const securityPolicy = new SecurityPolicyEngine();
  securityPolicy.addRule({
    name: "phase27.deny_shell_for_forge",
    actionPattern: "tool.shell.*",
    resourcePattern: "*",
    casteList: [Caste.FORGE_CARVERS],
    decision: PolicyDecision.DENY,
    priority: 100,
  });
  const coordinator = new ColonyCoordinator({ registry, securityPolicy });
  const worker = await registry.spawnWorker({
    role: "worker",
    caste: Caste.FORGE_CARVERS,
    objective: "Execute policy-checked task.",
  });
  registry.markReady(worker.workerId);

  const task = coordinator.enqueueTask({
    title: "Denied shell child",
    objective: "This task requests denied shell access.",
    requiredRole: "worker",
    security: {
      action: "tool.shell.exec",
      resource: "workspace",
    },
  });

  const assignment = coordinator.claimNextTask(worker.workerId);
  assertEqual(assignment, null, "Security-denied task is not assigned");
  const denied = coordinator.inspectTask(task.taskId);
  assertEqual(denied?.status, "failed", "Security-denied task fails closed");
  assert(denied?.failureReason?.includes("security") ?? false, "Security denial reason is recorded");
  assertEqual(denied?.policyDecisions[0]?.source, "security", "Task records security policy source");
  assertEqual(denied?.policyDecisions[0]?.matchedRule, "phase27.deny_shell_for_forge", "Security decision records matched rule");
  assertEqual(securityPolicy.getEvaluationLog().length, 1, "Security policy evaluation is logged");
  assertEqual(registry.inspectWorker(worker.workerId)?.state, "idle", "Security denial does not start worker");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 27 Verification (Coordinator Policy Propagation)\n");

  await verifyBudgetPolicyPropagation();
  await verifyApprovalPolicyPropagation();
  await verifySecurityPolicyPropagation();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 27: Coordinator policy propagation is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
