/**
 * Phase 24 Verification Script - Multi-Agent Spawn and Worker Lifecycle
 *
 * Covers the first Phase 4 multi-agent slice:
 *   1. Caste-aware worker spawn model with per-worker sessions
 *   2. Inspectable worker lifecycle transitions
 *   3. Worker listing/filtering and invalid-transition protection
 *
 * Run: bun run src/verify-phase24.ts
 */

import { Caste } from "./caste/enums";
import {
  ColonyAgentRegistry,
  type AgentWorkerLifecycleState,
} from "./agents";

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

async function verifyWorkerSpawnModel(): Promise<void> {
  section("1. Multi-Agent Worker Spawn Model");

  const registry = new ColonyAgentRegistry();
  const planner = await registry.spawnWorker({
    role: "planner",
    caste: Caste.ELDEST_ARCHITECT,
    objective: "Plan the multi-agent runtime.",
    tenantScope: "workspace-a",
    parentAgentId: "root_agent",
    metadata: { track: "phase4" },
  });

  assert(planner.workerId.startsWith("wrk_"), "Spawned worker has stable worker id prefix");
  assert(planner.agentId.startsWith("agent_"), "Spawned worker has stable agent id prefix");
  assert(planner.sessionId.startsWith("ses_"), "Spawned worker has session id");
  assertEqual(planner.role, "planner", "Spawned worker preserves role");
  assertEqual(planner.caste, Caste.ELDEST_ARCHITECT, "Spawned worker preserves caste");
  assertEqual(planner.objective, "Plan the multi-agent runtime.", "Spawned worker preserves objective");
  assertEqual(planner.tenantScope, "workspace-a", "Spawned worker preserves tenant scope");
  assertEqual(planner.parentAgentId, "root_agent", "Spawned worker preserves parent agent id");
  assertEqual(planner.state, "spawned", "Spawned worker starts in spawned state");
  assertEqual(planner.metadata.track, "phase4", "Spawned worker metadata is preserved");
  assertEqual(planner.session.messageCount, 0, "Worker session snapshot omits transcript but reports message count");

  const reviewer = await registry.spawnWorker({
    role: "reviewer",
    caste: Caste.WATCHER_SWARM,
    objective: "Review worker output.",
  });
  const allWorkers = registry.listWorkers();
  assertEqual(allWorkers.length, 2, "Registry lists all spawned workers");
  assertEqual(registry.listWorkers({ role: "planner" }).length, 1, "Registry filters workers by role");
  assertEqual(registry.listWorkers({ caste: Caste.WATCHER_SWARM })[0]?.workerId, reviewer.workerId, "Registry filters workers by caste");
}

async function verifyWorkerLifecycle(): Promise<void> {
  section("2. Worker Lifecycle Transitions");

  const registry = new ColonyAgentRegistry();
  const worker = await registry.spawnWorker({
    role: "worker",
    caste: Caste.FORGE_CARVERS,
    objective: "Implement a bounded task.",
  });

  const ready = registry.markReady(worker.workerId);
  assertEqual(ready.state, "idle", "Worker can move spawned -> idle");

  const running = registry.startWorkerTask(worker.workerId, {
    taskId: "task_build",
    summary: "Build worker lifecycle.",
  });
  assertEqual(running.state, "running", "Worker can move idle -> running");
  assertEqual(running.currentTask?.taskId, "task_build", "Running worker records task id");
  assertEqual(running.currentTask?.summary, "Build worker lifecycle.", "Running worker records task summary");

  const paused = registry.pauseWorker(worker.workerId, "waiting for operator approval");
  assertEqual(paused.state, "paused", "Worker can move running -> paused");
  assertEqual(paused.statusReason, "waiting for operator approval", "Paused worker records reason");

  const resumed = registry.resumeWorker(worker.workerId);
  assertEqual(resumed.state, "running", "Worker can move paused -> running");
  assertEqual(resumed.currentTask?.taskId, "task_build", "Resume keeps current task context");

  const completed = registry.completeWorkerTask(worker.workerId, "Lifecycle implementation complete");
  assertEqual(completed.state, "idle", "Completed task returns worker to idle");
  assertEqual(completed.lastResult?.summary, "Lifecycle implementation complete", "Completed worker records last result");
  assertEqual(completed.currentTask, undefined, "Completed task clears current task");

  const stopped = registry.stopWorker(worker.workerId, "slice complete");
  assertEqual(stopped.state, "stopped", "Worker can stop from idle");
  assertEqual(stopped.statusReason, "slice complete", "Stopped worker records reason");

  const events = registry.workerEvents(worker.workerId).map((event) => event.state);
  const expected: AgentWorkerLifecycleState[] = ["spawned", "idle", "running", "paused", "running", "idle", "stopped"];
  assertEqual(events.join(">"), expected.join(">"), "Worker lifecycle events are inspectable and ordered");
}

async function verifyInvalidLifecycleTransitions(): Promise<void> {
  section("3. Invalid Lifecycle Protection");

  const registry = new ColonyAgentRegistry();
  const worker = await registry.spawnWorker({
    role: "worker",
    caste: Caste.FORGE_CARVERS,
    objective: "Protect lifecycle transitions.",
  });

  const prematureCompletion = registry.completeWorkerTask(worker.workerId, "not running yet");
  assertEqual(prematureCompletion.state, "failed", "Completing non-running worker fails worker");
  assert(prematureCompletion.statusReason.includes("Cannot complete"), "Invalid completion failure is explicit");

  const missing = registry.inspectWorker("wrk_missing");
  assertEqual(missing, null, "Inspecting missing worker returns null");

  const missingStop = registry.stopWorker("wrk_missing", "not found");
  assertEqual(missingStop.state, "failed", "Stopping missing worker returns failed snapshot");
  assert(missingStop.statusReason.includes("Worker not found"), "Missing worker failure is explicit");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 24 Verification (Multi-Agent Spawn and Worker Lifecycle)\n");

  await verifyWorkerSpawnModel();
  await verifyWorkerLifecycle();
  await verifyInvalidLifecycleTransitions();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 24: Multi-agent spawn and worker lifecycle is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
