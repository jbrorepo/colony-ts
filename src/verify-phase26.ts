/**
 * Phase 26 Verification Script - Fan-out/Fan-in and Cancellation
 *
 * Covers the third Phase 4 multi-agent slice:
 *   1. Fan-out execution records and child task dispatch
 *   2. Fan-in aggregation over completed/failed child tasks
 *   3. Cancellation of queued and assigned execution children
 *
 * Run: bun run src/verify-phase26.ts
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

async function verifyFanOutDispatch(): Promise<void> {
  section("1. Fan-out Dispatch");

  const registry = new ColonyAgentRegistry();
  const coordinator = new ColonyCoordinator({ registry });
  const first = await registry.spawnWorker({
    role: "worker",
    caste: Caste.FORGE_CARVERS,
    objective: "Execute fan-out child A.",
  });
  const second = await registry.spawnWorker({
    role: "worker",
    caste: Caste.FORGE_CARVERS,
    objective: "Execute fan-out child B.",
  });
  registry.markReady(first.workerId);
  registry.markReady(second.workerId);

  const execution = coordinator.startFanOutExecution({
    title: "Parallel implementation pass",
    objective: "Split implementation into independent child tasks.",
    metadata: { phase: 4 },
    children: [
      {
        title: "Implement worker A",
        objective: "Build the first independent slice.",
        requiredRole: "worker",
        priority: 10,
        metadata: { slice: "A" },
      },
      {
        title: "Implement worker B",
        objective: "Build the second independent slice.",
        requiredRole: "worker",
        priority: 9,
        metadata: { slice: "B" },
      },
    ],
  });

  assert(execution.executionId.startsWith("exec_"), "Fan-out execution has stable execution id prefix");
  assertEqual(execution.status, "running", "Fan-out execution starts running");
  assertEqual(execution.taskIds.length, 2, "Fan-out execution records child task ids");
  assertEqual(execution.metadata.phase, 4, "Fan-out execution preserves metadata");

  const queuedChildren = coordinator.listExecutionTasks(execution.executionId, { status: "queued" });
  assertEqual(queuedChildren.length, 2, "Fan-out children start queued");
  assertEqual(queuedChildren[0]?.metadata.executionId, execution.executionId, "Child task links to execution id");

  const dispatch = coordinator.dispatchFanOutExecution(execution.executionId, [
    first.workerId,
    second.workerId,
  ]);

  assertEqual(dispatch.assignments.length, 2, "Fan-out dispatch assigns both children");
  assertEqual(dispatch.execution.status, "running", "Dispatched execution remains running");
  assertEqual(registry.inspectWorker(first.workerId)?.state, "running", "First worker is running assigned child");
  assertEqual(registry.inspectWorker(second.workerId)?.state, "running", "Second worker is running assigned child");
  assertEqual(coordinator.listExecutionTasks(execution.executionId, { status: "assigned" }).length, 2, "Execution task filter sees assigned children");
}

async function verifyFanInAggregation(): Promise<void> {
  section("2. Fan-in Aggregation");

  const registry = new ColonyAgentRegistry();
  const coordinator = new ColonyCoordinator({ registry });
  const first = await registry.spawnWorker({
    role: "worker",
    caste: Caste.FORGE_CARVERS,
    objective: "Complete fan-in child A.",
  });
  const second = await registry.spawnWorker({
    role: "worker",
    caste: Caste.FORGE_CARVERS,
    objective: "Complete fan-in child B.",
  });
  registry.markReady(first.workerId);
  registry.markReady(second.workerId);

  const execution = coordinator.startFanOutExecution({
    title: "Parallel verification pass",
    objective: "Aggregate independent worker results.",
    children: [
      { title: "Verify A", objective: "Verify first slice.", requiredRole: "worker" },
      { title: "Verify B", objective: "Verify second slice.", requiredRole: "worker" },
    ],
  });
  const dispatch = coordinator.dispatchFanOutExecution(execution.executionId, [
    first.workerId,
    second.workerId,
  ]);

  const firstTask = dispatch.assignments[0]?.task;
  const secondTask = dispatch.assignments[1]?.task;
  assert(Boolean(firstTask && secondTask), "Fan-in setup assigned both child tasks");

  coordinator.completeTask(firstTask!.taskId, first.workerId, "A complete");
  const stillRunning = coordinator.collectFanIn(execution.executionId);
  assertEqual(stillRunning.status, "running", "Fan-in waits for remaining child");
  assertEqual(stillRunning.completedTaskIds.length, 1, "Fan-in tracks partial completion");

  coordinator.completeTask(secondTask!.taskId, second.workerId, "B complete");
  const completed = coordinator.collectFanIn(execution.executionId);
  assertEqual(completed.status, "completed", "Fan-in completes after all children complete");
  assert(completed.result?.summary.includes("A complete") ?? false, "Fan-in summary includes first child result");
  assert(completed.result?.summary.includes("B complete") ?? false, "Fan-in summary includes second child result");
}

async function verifyExecutionCancellation(): Promise<void> {
  section("3. Execution Cancellation");

  const registry = new ColonyAgentRegistry();
  const coordinator = new ColonyCoordinator({ registry });
  const worker = await registry.spawnWorker({
    role: "worker",
    caste: Caste.FORGE_CARVERS,
    objective: "Run cancellable fan-out child.",
  });
  registry.markReady(worker.workerId);

  const execution = coordinator.startFanOutExecution({
    title: "Cancellable execution",
    objective: "Cancel assigned and queued children.",
    children: [
      { title: "Assigned child", objective: "This child will start.", requiredRole: "worker" },
      { title: "Queued child", objective: "This child will remain queued.", requiredRole: "worker" },
    ],
  });
  coordinator.dispatchFanOutExecution(execution.executionId, [worker.workerId]);

  const cancelled = coordinator.cancelExecution(execution.executionId, "operator cancelled");
  assertEqual(cancelled.status, "cancelled", "Cancellation marks execution cancelled");
  assertEqual(cancelled.failureReason, "operator cancelled", "Cancellation stores operator reason");
  assertEqual(cancelled.cancelledTaskIds.length, 2, "Cancellation marks all unfinished child tasks cancelled");
  assertEqual(registry.inspectWorker(worker.workerId)?.state, "stopped", "Cancellation stops assigned worker");
  assertEqual(coordinator.listExecutionTasks(execution.executionId, { status: "cancelled" }).length, 2, "Cancelled execution children are inspectable");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 26 Verification (Fan-out/Fan-in and Cancellation)\n");

  await verifyFanOutDispatch();
  await verifyFanInAggregation();
  await verifyExecutionCancellation();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 26: Fan-out/fan-in and cancellation is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
