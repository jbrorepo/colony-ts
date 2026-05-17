/**
 * Phase 25 Verification Script - Coordinator Queue and Messaging
 *
 * Covers the second Phase 4 multi-agent slice:
 *   1. Coordinator task queue and worker assignment
 *   2. Worker lifecycle integration for task claim/complete/fail
 *   3. Direct inter-agent mailbox messages
 *
 * Run: bun run src/verify-phase25.ts
 */

import { Caste } from "./caste/enums";
import { ColonyAgentRegistry } from "./agents";
import { ColonyCoordinator } from "./orchestrator";

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

async function verifyCoordinatorQueueAssignment(): Promise<void> {
  section("1. Coordinator Queue Assignment");

  const registry = new ColonyAgentRegistry();
  const coordinator = new ColonyCoordinator({ registry });
  const worker = await registry.spawnWorker({
    role: "worker",
    caste: Caste.FORGE_CARVERS,
    objective: "Implement queued tasks.",
  });
  registry.markReady(worker.workerId);

  const task = coordinator.enqueueTask({
    title: "Build queue primitive",
    objective: "Implement coordinator queue assignment.",
    requiredRole: "worker",
    priority: 5,
    metadata: { phase: 4 },
  });

  assert(task.taskId.startsWith("task_"), "Queued task has stable task id prefix");
  assertEqual(task.status, "queued", "New task starts queued");
  assertEqual(task.requiredRole, "worker", "Queued task preserves required role");
  assertEqual(task.metadata.phase, 4, "Queued task preserves metadata");
  assertEqual(coordinator.listTasks({ status: "queued" }).length, 1, "Coordinator lists queued tasks");

  const assignment = coordinator.claimNextTask(worker.workerId);
  assertEqual(assignment?.task.status, "assigned", "Worker claims queued task");
  assertEqual(assignment?.task.assignedWorkerId, worker.workerId, "Claim records assigned worker");
  assertEqual(assignment?.worker.state, "running", "Claim starts worker task");
  assertEqual(assignment?.worker.currentTask?.taskId, task.taskId, "Worker current task matches claimed task");
  assertEqual(coordinator.listTasks({ status: "queued" }).length, 0, "Claim removes task from queued view");
  assertEqual(coordinator.listTasks({ workerId: worker.workerId }).length, 1, "Coordinator filters tasks by assigned worker");
}

async function verifyCoordinatorCompletionAndFailure(): Promise<void> {
  section("2. Coordinator Completion and Failure");

  const registry = new ColonyAgentRegistry();
  const coordinator = new ColonyCoordinator({ registry });
  const worker = await registry.spawnWorker({
    role: "worker",
    caste: Caste.FORGE_CARVERS,
    objective: "Complete queued tasks.",
  });
  registry.markReady(worker.workerId);

  const task = coordinator.enqueueTask({
    title: "Complete queue primitive",
    objective: "Complete a coordinator task.",
    requiredRole: "worker",
  });
  coordinator.claimNextTask(worker.workerId);

  const completed = coordinator.completeTask(task.taskId, worker.workerId, "Queue primitive complete");
  assertEqual(completed.status, "completed", "Coordinator completes assigned task");
  assertEqual(completed.result?.summary, "Queue primitive complete", "Completed task stores result summary");
  assertEqual(registry.inspectWorker(worker.workerId)?.state, "idle", "Completing task returns worker to idle");

  const failTask = coordinator.enqueueTask({
    title: "Fail queue primitive",
    objective: "Fail a coordinator task.",
    requiredRole: "worker",
  });
  coordinator.claimNextTask(worker.workerId);
  const failed = coordinator.failTask(failTask.taskId, worker.workerId, "worker crashed");
  assertEqual(failed.status, "failed", "Coordinator fails assigned task");
  assertEqual(failed.failureReason, "worker crashed", "Failed task stores reason");
  assertEqual(registry.inspectWorker(worker.workerId)?.state, "failed", "Failing task marks worker failed");

  const missingAssignment = coordinator.claimNextTask("wrk_missing");
  assertEqual(missingAssignment, null, "Missing worker cannot claim task");
}

async function verifyInterAgentMessaging(): Promise<void> {
  section("3. Inter-Agent Messaging");

  const registry = new ColonyAgentRegistry();
  const coordinator = new ColonyCoordinator({ registry });
  const planner = await registry.spawnWorker({
    role: "planner",
    caste: Caste.ELDEST_ARCHITECT,
    objective: "Plan work.",
  });
  const reviewer = await registry.spawnWorker({
    role: "reviewer",
    caste: Caste.WATCHER_SWARM,
    objective: "Review work.",
  });

  const message = coordinator.sendMessage({
    fromWorkerId: planner.workerId,
    toWorkerId: reviewer.workerId,
    kind: "handoff",
    content: "Please review the queue primitive.",
    taskId: "task_review",
  });

  assert(message.messageId.startsWith("msg_"), "Inter-agent message has stable message id prefix");
  assertEqual(message.status, "delivered", "Valid inter-agent message is delivered");
  assertEqual(message.fromWorkerId, planner.workerId, "Message preserves sender");
  assertEqual(message.toWorkerId, reviewer.workerId, "Message preserves recipient");

  const inbox = coordinator.inbox(reviewer.workerId);
  assertEqual(inbox.length, 1, "Recipient inbox receives message");
  assertEqual(inbox[0]?.content, "Please review the queue primitive.", "Inbox preserves message content");

  const read = coordinator.markMessageRead(message.messageId, reviewer.workerId);
  assertEqual(read?.status, "read", "Recipient can mark message read");
  assert(Boolean(read?.readAt), "Read message records read timestamp");

  const rejected = coordinator.sendMessage({
    fromWorkerId: planner.workerId,
    toWorkerId: "wrk_missing",
    kind: "status",
    content: "This should fail.",
  });
  assertEqual(rejected.status, "failed", "Message to missing worker fails");
  assert(rejected.failureReason?.includes("recipient") ?? false, "Missing recipient failure is explicit");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 25 Verification (Coordinator Queue and Messaging)\n");

  await verifyCoordinatorQueueAssignment();
  await verifyCoordinatorCompletionAndFailure();
  await verifyInterAgentMessaging();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 25: Coordinator queue and messaging is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
