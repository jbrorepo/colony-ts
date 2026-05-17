/**
 * Phase 233 Verification Script - Swarm Timeline And Failure Hardening
 *
 * Verifies Beta 1 swarm timeline inspection, failure injection coverage,
 * retry history preservation, cancellation preservation, and restart-safe
 * resume behavior without live network calls.
 *
 * Run: bun run src/verify-phase233.ts
 */

import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { buildSwarmCommandPayload } from "./gateway-swarm";
import {
  ColonySwarmRuntime,
  JsonSwarmRunStore,
  type SwarmStage,
  type SwarmStageRunner,
  type SwarmStageRunnerInput,
  type SwarmStageRunnerResult,
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
  assert(actual === expected, `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}\n  ${title}\n${"=".repeat(60)}`);
}

class Phase233SwarmRunner implements SwarmStageRunner {
  readonly calls: Array<{ stage: SwarmStage; attempt: number }> = [];
  failOnceStage: SwarmStage | null = null;
  alwaysFailStage: SwarmStage | null = null;
  private failed = false;

  async runStage(input: SwarmStageRunnerInput): Promise<SwarmStageRunnerResult> {
    this.calls.push({ stage: input.stage, attempt: input.attempt });
    if (this.alwaysFailStage === input.stage) {
      throw new Error(`persistent ${input.stage} failure`);
    }
    if (this.failOnceStage === input.stage && !this.failed) {
      this.failed = true;
      throw new Error(`injected ${input.stage} failure`);
    }
    return {
      summary: `${input.stage} summary attempt ${input.attempt}`,
      artifacts: [{
        type: "json",
        name: `${input.stage}-artifact.json`,
        content: JSON.stringify({
          stage: input.stage,
          attempt: input.attempt,
          api_key: "sk-phase233-secret",
          note: "review artifact content",
        }),
        metadata: {
          stage: input.stage,
          unsafe: "sk-phase233-metadata-secret",
        },
      }],
      totalTokens: 100 + input.attempt,
      estimatedCostUsd: 0.01 * input.attempt,
    };
  }
}

async function verifyTimelineAndRetryHistory(): Promise<void> {
  section("1. Timeline And Retry History");

  const root = await mkdtemp(join(tmpdir(), "colony-phase233-swarm-"));
  try {
    const runner = new Phase233SwarmRunner();
    runner.failOnceStage = "execute";
    const runtime = new ColonySwarmRuntime({
      store: new JsonSwarmRunStore({ rootDir: root }),
      llmRunner: runner,
    });

    const failedRun = await runtime.startObjective({
      title: "Phase 233 Swarm",
      objective: "Exercise timeline rendering.",
      executionMode: "llm",
      maxAttempts: 2,
    });

    assertEqual(failedRun.status, "failed", "Injected execute failure records failed run");
    const failedExecute = failedRun.stages.find((stage) => stage.stage === "execute");
    assertEqual(failedExecute?.status, "failed", "Execute stage records failed status");
    assertEqual(failedExecute?.failureReason, "injected execute failure", "Execute stage records latest failure");
    assert(Boolean(failedExecute?.startedAt), "Failed execute stage records startedAt");
    assert(Boolean(failedExecute?.endedAt), "Failed execute stage records endedAt");

    const restarted = new ColonySwarmRuntime({
      store: new JsonSwarmRunStore({ rootDir: root }),
      llmRunner: runner,
    });
    await restarted.loadPersistedRuns();
    const retried = await restarted.retryStage(failedRun.runId, "execute");
    assertEqual(retried?.status, "completed", "Retry completes persisted failed run");

    const execute = retried?.stages.find((stage) => stage.stage === "execute");
    assertEqual(execute?.attempts, 2, "Retry increments execute attempt count instead of resetting history");
    assertEqual(execute?.retryHistory?.length, 1, "Retry preserves previous failed attempt history");
    assertEqual(execute?.retryHistory?.[0]?.attempt, 1, "Retry history records failed attempt number");
    assertEqual(execute?.retryHistory?.[0]?.status, "failed", "Retry history records failed attempt status");
    assertEqual(execute?.retryHistory?.[0]?.failureReason, "injected execute failure", "Retry history records failure reason");
    assert(Boolean(execute?.startedAt), "Completed execute stage records current startedAt");
    assert(Boolean(execute?.endedAt), "Completed execute stage records current endedAt");
    assertEqual(execute?.artifactCount, 1, "Completed execute stage records artifact count");
    assertEqual(execute?.artifactReview?.length, 1, "Completed execute stage records artifact review entries");
    assertEqual(execute?.artifactReview?.[0]?.name, "execute-artifact.json", "Artifact review records artifact name");
    assertEqual(execute?.artifactReview?.[0]?.type, "json", "Artifact review records artifact type");
    assertEqual(execute?.artifactReview?.[0]?.contentBytes, execute?.artifacts[0]?.content?.length, "Artifact review records content byte length");
    assert(execute?.artifactReview?.[0]?.preview?.includes("review artifact content") === true, "Artifact review records bounded preview");
    assert(execute?.artifactReview?.[0]?.preview?.includes("sk-phase233-secret") === false, "Artifact review redacts secret-like content");
    assertEqual(execute?.artifactReview?.[0]?.metadataKeys.includes("stage"), true, "Artifact review records metadata keys");
    assertEqual(execute?.totalTokens, 102, "Completed execute stage records token metadata");
    assertEqual(execute?.estimatedCostUsd, 0.02, "Completed execute stage records cost metadata");

    const detail = buildSwarmCommandPayload(["status", failedRun.runId], { runs: retried ? [retried] : [] });
    assert(detail.output.includes("Stage Timeline:"), "/swarm status renders stage timeline");
    assert(detail.output.includes("execute | completed | attempts 2"), "/swarm status renders attempt count");
    assert(detail.output.includes("tokens 102 | cost $0.0200"), "/swarm status renders token/cost metadata");
    assert(detail.output.includes("artifacts:"), "/swarm status renders artifact review section");
    assert(detail.output.includes("execute-artifact.json (json)"), "/swarm status renders artifact review name and type");
    assert(detail.output.includes("preview:"), "/swarm status renders artifact review preview");
    assert(detail.output.includes("sk-phase233-secret") === false, "/swarm status redacts artifact preview secrets");
    assert(detail.output.includes("retry history:"), "/swarm status renders retry history");
    assert(detail.output.includes("attempt 1 failed: injected execute failure"), "/swarm status renders previous failure");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyCancellationPreservedAcrossResume(): Promise<void> {
  section("2. Cancellation Preservation");

  const root = await mkdtemp(join(tmpdir(), "colony-phase233-cancel-"));
  try {
    const runner = new Phase233SwarmRunner();
    const runtime = new ColonySwarmRuntime({
      store: new JsonSwarmRunStore({ rootDir: root }),
      llmRunner: runner,
    });
    const run = await runtime.startObjective({
      title: "Phase 233 Cancel",
      objective: "Cancel before resume.",
      executionMode: "llm",
      approvalRequired: true,
      requiredApprover: "operator",
    });
    assertEqual(run.status, "running", "Approval wait leaves run resumable before cancellation");

    const cancelled = await runtime.cancelRun(run.runId, "operator cancelled phase233");
    assertEqual(cancelled?.status, "cancelled", "Cancellation records cancelled run");

    const restarted = new ColonySwarmRuntime({
      store: new JsonSwarmRunStore({ rootDir: root }),
      llmRunner: runner,
    });
    await restarted.loadPersistedRuns();
    const resumed = await restarted.resumeRun(run.runId);
    assertEqual(resumed?.status, "cancelled", "Resume preserves cancelled persisted run");
    assert(resumed?.stages.some((stage) => stage.status === "cancelled") === true, "Cancelled run preserves cancelled stage truth");
    assertEqual(runner.calls.filter((call) => call.stage === "execute").length, 0, "Cancelled resume does not rerun execute stage");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyManualRetryBound(): Promise<void> {
  section("3. Manual Retry Bound");

  const root = await mkdtemp(join(tmpdir(), "colony-phase233-retry-bound-"));
  try {
    const runner = new Phase233SwarmRunner();
    runner.alwaysFailStage = "plan";
    const runtime = new ColonySwarmRuntime({
      store: new JsonSwarmRunStore({ rootDir: root }),
      llmRunner: runner,
    });
    const initial = await runtime.startObjective({
      title: "Phase 233 Retry Bound",
      objective: "Keep retry bounded.",
      executionMode: "llm",
      maxAttempts: 1,
    });
    assertEqual(initial.status, "failed", "Persistent failure records failed run before retries");

    let latest = initial;
    for (let index = 0; index < 6; index++) {
      latest = await runtime.retryStage(initial.runId, "plan") ?? latest;
    }
    const plan = latest.stages.find((stage) => stage.stage === "plan");
    assertEqual(plan?.status, "failed", "Bounded retry remains failed after hard limit");
    assertEqual(plan?.attempts, 5, "Bounded retry stops at hard manual retry limit");
    assert(plan?.failureReason?.includes("exceeded 5 attempts") === true, "Bounded retry records hard-limit failure reason");
    assertEqual(runner.calls.filter((call) => call.stage === "plan").length, 5, "Bounded retry does not invoke stage after hard limit");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyInterruptedRunningStageResumeHistory(): Promise<void> {
  section("4. Interrupted Running Stage Resume History");

  const root = await mkdtemp(join(tmpdir(), "colony-phase233-interrupted-"));
  try {
    const runner = new Phase233SwarmRunner();
    const store = new JsonSwarmRunStore({ rootDir: root });
    const runtime = new ColonySwarmRuntime({
      store,
      llmRunner: runner,
    });
    const completed = await runtime.startObjective({
      title: "Phase 233 Interrupted",
      objective: "Preserve interrupted stage evidence.",
      executionMode: "llm",
      maxAttempts: 3,
    });
    const interruptedAt = "2026-05-13T04:00:00.000Z";
    await store.save({
      ...completed,
      status: "running",
      execution: {
        ...completed.execution,
        status: "running",
        updatedAt: interruptedAt,
      },
      stages: completed.stages.map((stage) => {
        if (stage.stage === "execute") {
          return {
            ...stage,
            status: "running",
            attempts: 1,
            startedAt: interruptedAt,
            endedAt: undefined,
            summary: undefined,
            artifacts: [],
            artifactCount: 0,
            artifactReview: [],
            totalTokens: undefined,
            estimatedCostUsd: undefined,
            failureReason: undefined,
            retryHistory: [],
            updatedAt: interruptedAt,
          };
        }
        if (stage.stage === "review") {
          return {
            ...stage,
            status: "pending",
            attempts: 0,
            startedAt: undefined,
            endedAt: undefined,
            summary: undefined,
            artifacts: [],
            artifactCount: 0,
            artifactReview: [],
            totalTokens: undefined,
            estimatedCostUsd: undefined,
            failureReason: undefined,
            retryHistory: [],
            updatedAt: interruptedAt,
          };
        }
        return stage;
      }),
      updatedAt: interruptedAt,
    });

    const restarted = new ColonySwarmRuntime({
      store: new JsonSwarmRunStore({ rootDir: root }),
      llmRunner: runner,
    });
    await restarted.loadPersistedRuns();
    const resumed = await restarted.resumeRun(completed.runId);
    assertEqual(resumed?.status, "completed", "Resume completes interrupted persisted run");
    const execute = resumed?.stages.find((stage) => stage.stage === "execute");
    assertEqual(execute?.attempts, 2, "Resume reruns interrupted running stage as next attempt");
    assertEqual(execute?.retryHistory?.length, 1, "Resume preserves interrupted running attempt history");
    assertEqual(execute?.retryHistory?.[0]?.attempt, 1, "Interrupted history records original attempt");
    assertEqual(execute?.retryHistory?.[0]?.status, "cancelled", "Interrupted history records abandoned attempt as cancelled");
    assertEqual(execute?.retryHistory?.[0]?.failureReason, "interrupted before resume", "Interrupted history records resume reason");

    const detail = buildSwarmCommandPayload(["status", completed.runId], { runs: resumed ? [resumed] : [] });
    assert(detail.output.includes("attempt 1 cancelled: interrupted before resume"), "/swarm status renders interrupted attempt history");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyApprovalWaitPreservedAcrossPersistedResume(): Promise<void> {
  section("5. Approval Wait Preservation");

  const root = await mkdtemp(join(tmpdir(), "colony-phase233-approval-"));
  try {
    const runner = new Phase233SwarmRunner();
    const store = new JsonSwarmRunStore({ rootDir: root });
    const runtime = new ColonySwarmRuntime({
      store,
      llmRunner: runner,
    });
    const run = await runtime.startObjective({
      title: "Phase 233 Approval",
      objective: "Require approval before execute.",
      executionMode: "llm",
      approvalRequired: true,
      requiredApprover: "operator",
    });

    assertEqual(run.status, "running", "Approval-gated run remains running while waiting");
    const execute = run.stages.find((stage) => stage.stage === "execute");
    assertEqual(execute?.status, "awaiting_approval", "Execute waits for approval");
    assertEqual(execute?.awaitingApproval?.requiredApprover, "operator", "Execute records required approver");
    assertEqual(runner.calls.filter((call) => call.stage === "execute").length, 0, "Execute does not run before approval");

    const restarted = new ColonySwarmRuntime({
      store: new JsonSwarmRunStore({ rootDir: root }),
      llmRunner: runner,
    });
    await restarted.loadPersistedRuns();
    const resumed = await restarted.resumeRun(run.runId);
    const resumedExecute = resumed?.stages.find((stage) => stage.stage === "execute");
    assertEqual(resumed?.status, "running", "Resume preserves approval-gated run as running");
    assertEqual(resumedExecute?.status, "awaiting_approval", "Resume preserves approval wait");
    assertEqual(resumedExecute?.awaitingApproval?.requiredApprover, "operator", "Resume preserves required approver");
    assertEqual(runner.calls.filter((call) => call.stage === "execute").length, 0, "Persisted resume does not execute stage before approval");

    const retried = await restarted.retryStage(run.runId, "execute");
    const retriedExecute = retried?.stages.find((stage) => stage.stage === "execute");
    assertEqual(retried?.status, "running", "Retry preserves approval-gated run as running");
    assertEqual(retriedExecute?.status, "awaiting_approval", "Retry preserves approval wait before execution");
    assertEqual(retriedExecute?.awaitingApproval?.requiredApprover, "operator", "Retry preserves approval metadata");
    assertEqual(runner.calls.filter((call) => call.stage === "execute").length, 0, "Retry does not execute approval-gated stage before approval");

    const detail = buildSwarmCommandPayload(["status", run.runId], { runs: retried ? [retried] : [] });
    assert(detail.output.includes("approval: Approval required before executing swarm objective"), "/swarm status renders preserved approval wait");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 233 Verification (Swarm Timeline And Failure Hardening)\n");
  await verifyTimelineAndRetryHistory();
  await verifyCancellationPreservedAcrossResume();
  await verifyManualRetryBound();
  await verifyInterruptedRunningStageResumeHistory();
  await verifyApprovalWaitPreservedAcrossPersistedResume();

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 233: swarm timeline and failure hardening is GREEN.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
