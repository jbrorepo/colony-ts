/**
 * Phase 28 Verification Script - /swarm Orchestrated Execution Path
 *
 * Covers the fifth Phase 4 multi-agent slice:
 *   1. Real planner/worker/reviewer swarm runtime over ColonyCoordinator
 *   2. /swarm command starts an orchestrated execution instead of active-agent chat
 *   3. /swarm status and cancel expose inspectable/cancellable swarm state
 *
 * Run: bun run src/verify-phase28.ts
 */

import { MethodCaste } from "./caste/enums";
import {
  ColonySwarmRuntime,
  type SwarmRunSnapshot,
} from "./orchestrator";
import {
  SlashCommandParser,
  executeCommand,
} from "./gateway";

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

async function verifySwarmRuntimeStartAndInspect(): Promise<void> {
  section("1. Swarm Runtime Start and Inspect");

  const runtime = new ColonySwarmRuntime();
  const run = await runtime.startObjective({
    objective: "Build and verify a queue health check.",
    title: "Queue health check swarm",
  });

  assert(run.runId.startsWith("swarm_"), "Swarm run has stable run id prefix");
  assert(run.execution.executionId.startsWith("exec_"), "Swarm run links coordinator execution");
  assertEqual(run.objective, "Build and verify a queue health check.", "Swarm run preserves objective");
  assertEqual(run.status, "running", "Swarm starts in running state");
  assertEqual(run.workers.length, 3, "Swarm spawns planner/worker/reviewer workers");
  assert(run.workers.some((worker) => worker.role === "planner" && worker.caste === MethodCaste.COMMAND_ANT), "Swarm includes Command-ant planner caste");
  assert(run.workers.some((worker) => worker.role === "worker" && worker.caste === MethodCaste.OPER_ANT), "Swarm includes Oper-ant worker caste");
  assert(run.workers.some((worker) => worker.role === "reviewer" && worker.caste === MethodCaste.CONSULT_ANT), "Swarm includes Consult-ant reviewer caste");
  assertEqual(run.tasks.length, 3, "Swarm creates three execution tasks");
  assertEqual(run.assignedTaskCount, 3, "Swarm dispatches all child tasks");
  assert(run.tasks.every((task) => task.status === "assigned"), "Swarm child tasks are assigned");

  const inspected = runtime.inspectRun(run.runId);
  assertEqual(inspected?.runId, run.runId, "Swarm runtime inspects run by swarm id");
  assertEqual(inspected?.execution.executionId, run.execution.executionId, "Swarm inspect preserves execution id");
}

async function verifySwarmRuntimeCancel(): Promise<void> {
  section("2. Swarm Runtime Cancel");

  const runtime = new ColonySwarmRuntime();
  const run = await runtime.startObjective({
    objective: "Run cancellable swarm work.",
  });

  const cancelled = await runtime.cancelRun(run.runId, "operator cancelled swarm");
  assertEqual(cancelled?.status, "cancelled", "Swarm cancellation marks run cancelled");
  assertEqual(cancelled?.execution.status, "cancelled", "Swarm cancellation cancels coordinator execution");
  assertEqual(cancelled?.cancelledTaskCount, 3, "Swarm cancellation cancels unfinished child tasks");
  assert(cancelled?.workers.every((worker) => worker.state === "stopped") ?? false, "Swarm cancellation stops assigned workers");
}

async function verifySwarmGatewayCommand(): Promise<void> {
  section("3. /swarm Gateway Command");

  const parser = new SlashCommandParser();
  const start = parser.tryHandle("/swarm build api");
  assertEqual(start.command, "swarm", "/swarm command resolves");
  assertEqual(start.action?.kind, "start_swarm", "/swarm starts orchestrated swarm action");
  assertEqual(start.data.objective, "build api", "/swarm preserves objective");
  assert(start.output.includes("Swarm execution requested"), "/swarm output announces orchestration");
  assert(!start.output.includes("active agent only"), "/swarm no longer advertises active-agent alias");

  const status = parser.tryHandle("/swarm status", {
    swarm: {
      runs: [sampleSwarmRun()],
    },
  });
  assertEqual(status.action?.kind, "display", "/swarm status is inspect-only");
  assert(status.output.includes("Swarm Runs"), "/swarm status renders run list");
  assert(status.output.includes("swarm_sample"), "/swarm status includes run id");
  assert(status.output.includes("assigned 3/3"), "/swarm status includes assignment progress");

  const cancel = parser.tryHandle("/swarm cancel swarm_sample");
  assertEqual(cancel.action?.kind, "cancel_swarm", "/swarm cancel emits cancel action");
  assertEqual(cancel.data.runId, "swarm_sample", "/swarm cancel preserves run id");
}

async function verifySwarmCommandExecution(): Promise<void> {
  section("4. /swarm Command Execution");

  const parser = new SlashCommandParser();
  const actions: string[] = [];
  await executeCommand(parser.tryHandle("/swarm repair index"), {
    submitChat: async (message: string) => { actions.push(`submit:${message}`); },
    startSwarm: async (objective: string) => {
      actions.push(`start:${objective}`);
      return "Started swarm runtime for repair index";
    },
    cancelSwarm: async (runId: string) => {
      actions.push(`cancel:${runId}`);
      return "Cancelled swarm runtime";
    },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async () => { actions.push("compact"); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    isRunActive: () => false,
  });

  assert(actions.includes("start:repair index"), "Executor starts swarm runtime");
  assert(!actions.some((entry) => entry.startsWith("submit:")), "Executor does not submit swarm as chat");
  assert(actions.some((entry) => entry.includes("Started swarm runtime")), "Executor surfaces swarm start result");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/swarm cancel swarm_sample"), {
    submitChat: async (message: string) => { actions.push(`submit:${message}`); },
    startSwarm: async (objective: string) => {
      actions.push(`start:${objective}`);
      return "Started swarm runtime";
    },
    cancelSwarm: async (runId: string) => {
      actions.push(`cancel:${runId}`);
      return "Cancelled swarm_sample";
    },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async () => { actions.push("compact"); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    isRunActive: () => true,
  });
  assert(actions.includes("cancel:swarm_sample"), "Executor cancels swarm while agent run active");
  assert(actions.some((entry) => entry.includes("Cancelled swarm_sample")), "Executor surfaces swarm cancel result");
}

function sampleSwarmRun(): SwarmRunSnapshot {
  const now = "2026-04-26T00:00:00.000Z";
  return {
    runId: "swarm_sample",
    objective: "Sample swarm objective",
    title: "Sample Swarm",
    status: "running",
    executionMode: "coordinator_only",
    maxAttempts: 2,
    execution: {
      executionId: "exec_sample",
      title: "Sample Swarm",
      objective: "Sample swarm objective",
      status: "running",
      taskIds: ["task_plan", "task_execute", "task_review"],
      completedTaskIds: [],
      failedTaskIds: [],
      cancelledTaskIds: [],
      createdAt: now,
      updatedAt: now,
      metadata: {},
    },
    workers: [],
    tasks: [
      sampleTask("task_plan", "assigned"),
      sampleTask("task_execute", "assigned"),
      sampleTask("task_review", "assigned"),
    ],
    stages: [
      sampleStage("plan", now),
      sampleStage("execute", now),
      sampleStage("review", now),
    ],
    workerCount: 3,
    taskCount: 3,
    assignedTaskCount: 3,
    completedTaskCount: 0,
    failedTaskCount: 0,
    cancelledTaskCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function sampleStage(stage: SwarmRunSnapshot["stages"][number]["stage"], now: string): SwarmRunSnapshot["stages"][number] {
  return {
    stage,
    status: "running",
    attempts: 0,
    artifacts: [],
    artifactCount: 0,
    updatedAt: now,
  };
}

function sampleTask(taskId: string, status: "assigned"): SwarmRunSnapshot["tasks"][number] {
  const now = "2026-04-26T00:00:00.000Z";
  return {
    taskId,
    title: taskId,
    objective: taskId,
    priority: 0,
    status,
    createdAt: now,
    updatedAt: now,
    metadata: {},
    policyDecisions: [],
  };
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 28 Verification (/swarm Orchestration)\n");

  await verifySwarmRuntimeStartAndInspect();
  await verifySwarmRuntimeCancel();
  await verifySwarmGatewayCommand();
  await verifySwarmCommandExecution();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 28: /swarm orchestration is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
