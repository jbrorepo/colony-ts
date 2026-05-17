/**
 * Phase 87 Verification Script - Durable Swarm Run Snapshots
 *
 * Proves /swarm runtime state is persisted as restart-safe snapshots:
 * run metadata, worker assignments, task state, policy/approval metadata,
 * result/failure artifacts, and cancellation state survive runtime reload.
 *
 * Run: bun run src/verify-phase87.ts
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { MethodCaste } from "./caste/enums";
import {
  ColonySwarmRuntime,
  JsonSwarmRunStore,
} from "./orchestrator";

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

async function expectRejects(label: string, run: () => Promise<unknown> | unknown, check?: (error: Error) => boolean): Promise<void> {
  try {
    await run();
    assert(false, label);
  } catch (error) {
    assert(error instanceof Error && (check ? check(error) : true), label);
  }
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

async function verifyRestartSafeSnapshotLoad(): Promise<void> {
  section("1. Restart-Safe Swarm Snapshot Load");

  const root = await mkdtemp(join(tmpdir(), "colony-swarm-store-"));
  try {
    const store = new JsonSwarmRunStore({ rootDir: root });
    const runtime = new ColonySwarmRuntime({ store });
    const run = await runtime.startObjective({
      title: "Persistent swarm",
      objective: "Persist planner worker reviewer assignment state.",
      metadata: {
        approvalReason: "operator approval metadata",
        artifactPath: "artifacts/swarm-result.json",
      },
    });

    assertEqual(run.workerCount, 3, "Started swarm has worker assignments before persistence");
    assertEqual(run.assignedTaskCount, 3, "Started swarm persists assigned child tasks");
    assert(run.tasks.every((task) => task.assignedWorkerId), "Started tasks carry assigned worker ids");

    const restarted = new ColonySwarmRuntime({ store: new JsonSwarmRunStore({ rootDir: root }) });
    await restarted.loadPersistedRuns();
    const loaded = restarted.inspectRun(run.runId);

    assertEqual(loaded?.runId, run.runId, "Restarted runtime inspects persisted swarm id");
    assertEqual(loaded?.execution.executionId, run.execution.executionId, "Restarted runtime preserves execution id");
    assertEqual(loaded?.workerCount, 3, "Restarted runtime preserves worker assignment count");
    assertEqual(loaded?.taskCount, 3, "Restarted runtime preserves task count");
    assertEqual(loaded?.assignedTaskCount, 3, "Restarted runtime preserves assigned task count");
    assert(loaded?.workers.some((worker) => worker.role === "planner" && worker.caste === MethodCaste.COMMAND_ANT) ?? false, "Restarted runtime preserves planner worker metadata");
    assert(loaded?.tasks.every((task) => task.metadata.swarmStage) ?? false, "Restarted runtime preserves task metadata");
    assertEqual(loaded?.execution.metadata.artifactPath, "artifacts/swarm-result.json", "Restarted runtime preserves execution artifact metadata");
    assertEqual(restarted.listRuns()[0]?.runId, run.runId, "Restarted listRuns includes persisted run");

    const raw = await readFile(join(root, "swarm-runs.jsonl"), "utf8");
    assert(raw.endsWith("\n"), "Swarm store writes newline-delimited snapshots");
    assert(!raw.includes("SHOULD_NOT_LEAK"), "Swarm store does not contain unrelated secret marker");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyRestartSafeCancellation(): Promise<void> {
  section("2. Restart-Safe Swarm Cancellation");

  const root = await mkdtemp(join(tmpdir(), "colony-swarm-cancel-"));
  try {
    const store = new JsonSwarmRunStore({ rootDir: root });
    const runtime = new ColonySwarmRuntime({ store });
    const run = await runtime.startObjective({ objective: "Cancel after restart." });

    const restarted = new ColonySwarmRuntime({ store: new JsonSwarmRunStore({ rootDir: root }) });
    await restarted.loadPersistedRuns();
    const cancelled = await restarted.cancelRun(run.runId, "operator cancelled after restart");

    assertEqual(cancelled?.status, "cancelled", "Restarted runtime can cancel persisted swarm");
    assertEqual(cancelled?.execution.status, "cancelled", "Restarted cancellation updates execution status");
    assertEqual(cancelled?.cancelledTaskCount, 3, "Restarted cancellation marks unfinished tasks cancelled");
    assert(cancelled?.tasks.every((task) => task.status === "cancelled" && task.failureReason === "operator cancelled after restart") ?? false, "Restarted cancellation persists task failure reasons");
    assert(cancelled?.workers.every((worker) => worker.state === "stopped" && worker.statusReason === "operator cancelled after restart") ?? false, "Restarted cancellation persists worker stop state");

    const secondRestart = new ColonySwarmRuntime({ store: new JsonSwarmRunStore({ rootDir: root }) });
    await secondRestart.loadPersistedRuns();
    const loaded = secondRestart.inspectRun(run.runId);
    assertEqual(loaded?.status, "cancelled", "Cancellation state survives second restart");
    assertEqual(loaded?.execution.failureReason, "operator cancelled after restart", "Cancellation reason survives restart");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyCompletedFailedAndApprovalSnapshots(): Promise<void> {
  section("3. Results, Failures, and Approval Metadata");

  const root = await mkdtemp(join(tmpdir(), "colony-swarm-artifacts-"));
  try {
    const store = new JsonSwarmRunStore({ rootDir: root });
    const runtime = new ColonySwarmRuntime({ store });
    const run = await runtime.startObjective({ objective: "Persist mixed child outcomes." });
    const tasks = run.tasks;
    runtime.coordinator.completeTask(tasks[0]!.taskId, tasks[0]!.assignedWorkerId!, "plan artifact complete");
    runtime.coordinator.failTask(tasks[1]!.taskId, tasks[1]!.assignedWorkerId!, "worker failed with bounded reason");
    await runtime.persistRunSnapshot(run.runId);

    const reloaded = new ColonySwarmRuntime({ store: new JsonSwarmRunStore({ rootDir: root }) });
    await reloaded.loadPersistedRuns();
    const loaded = reloaded.inspectRun(run.runId);

    assertEqual(loaded?.completedTaskCount, 1, "Persisted snapshot preserves completed task count");
    assertEqual(loaded?.failedTaskCount, 1, "Persisted snapshot preserves failed task count");
    assert(loaded?.tasks.some((task) => task.result?.summary === "plan artifact complete") ?? false, "Persisted snapshot preserves result artifact summary");
    assert(loaded?.tasks.some((task) => task.failureReason === "worker failed with bounded reason") ?? false, "Persisted snapshot preserves failure artifact summary");

    const approved = loaded!.tasks[0]!;
    approved.policyDecisions.push({
      source: "approval",
      status: "allowed",
      allowed: true,
      reason: "manual approval",
      approvedBy: "lead",
      approvedAt: "2026-05-01T00:00:00.000Z",
    });
    await store.save({ ...loaded!, tasks: [approved, ...loaded!.tasks.slice(1)] });
    const approvalReload = new ColonySwarmRuntime({ store: new JsonSwarmRunStore({ rootDir: root }) });
    await approvalReload.loadPersistedRuns();
    assert(approvalReload.inspectRun(run.runId)?.tasks[0]?.policyDecisions.some((decision) => decision.approvedBy === "lead") ?? false, "Persisted snapshot preserves approval policy metadata");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyStoreFailsClosed(): Promise<void> {
  section("4. Swarm Store Fails Closed");

  const root = await mkdtemp(join(tmpdir(), "colony-swarm-bad-"));
  try {
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, "swarm-runs.jsonl"),
      "{\"recordType\":\"colony_swarm_run_snapshot\",\"run\":{\"runId\":\"swarm_bad\",\"objective\":\"SHOULD_NOT_LEAK_TOKEN\"}}\nnot-json-SHOULD_NOT_LEAK_TOKEN\n",
      "utf8",
    );
    const store = new JsonSwarmRunStore({ rootDir: root });
    await expectRejects(
      "Malformed swarm store fails with generic redacted error",
      () => store.load(),
      (error) => error.message === "Swarm run snapshot journal is invalid" && !error.message.includes("SHOULD_NOT_LEAK"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 87 Verification (Swarm Persistence)\n");

  await verifyRestartSafeSnapshotLoad();
  await verifyRestartSafeCancellation();
  await verifyCompletedFailedAndApprovalSnapshots();
  await verifyStoreFailsClosed();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 87: swarm persistence is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
