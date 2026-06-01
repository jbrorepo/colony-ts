import { describe, test, expect } from "bun:test";
import {
  ColonySwarmRuntime,
  type SwarmStageRunner,
  type SwarmStageRunnerResult,
} from "../../orchestrator/swarm";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A stage runner that blocks on a manually-resolved promise per stage. */
function makeGatedRunner(): {
  runner: SwarmStageRunner;
  release: () => void;
  callCount: () => number;
} {
  let calls = 0;
  let pendingResolvers: Array<() => void> = [];

  const runner: SwarmStageRunner = {
    async runStage(): Promise<SwarmStageRunnerResult> {
      calls++;
      await new Promise<void>((resolve) => {
        pendingResolvers.push(resolve);
      });
      return { summary: "ok" };
    },
  };

  return {
    runner,
    release: () => {
      const fns = pendingResolvers;
      pendingResolvers = [];
      for (const fn of fns) fn();
    },
    callCount: () => calls,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ColonySwarmRuntime — detached mode (C3)", () => {
  test("startObjective with detached=true returns before the LLM stages finish", async () => {
    const { runner, release, callCount } = makeGatedRunner();
    const runtime = new ColonySwarmRuntime({ llmRunner: runner });

    const startTime = Date.now();
    const snapshot = await runtime.startObjective({
      objective: "detached-task",
      executionMode: "llm",
      detached: true,
    });
    const elapsed = Date.now() - startTime;

    // startObjective must return quickly (under 500ms) even though the
    // runner blocks indefinitely until release() is called.
    expect(elapsed).toBeLessThan(500);
    expect(snapshot.runId).toBeTruthy();
    // The plan stage may have started but not completed
    expect(snapshot.status).toBe("running");

    // Clean up: release the gated runner so the background promise settles
    // Repeatedly because each stage opens a new gate
    for (let i = 0; i < 10; i++) {
      release();
      await new Promise((r) => setTimeout(r, 5));
    }
    // Drain any remaining pending stage
    release();

    // Sanity: the runner was called at least once
    expect(callCount()).toBeGreaterThanOrEqual(1);
  });

  test("inspectRun returns a snapshot for a detached run", async () => {
    const { runner, release } = makeGatedRunner();
    const runtime = new ColonySwarmRuntime({ llmRunner: runner });

    const initial = await runtime.startObjective({
      objective: "inspectable",
      executionMode: "llm",
      detached: true,
    });

    const inspected = runtime.inspectRun(initial.runId);
    expect(inspected).not.toBeNull();
    expect(inspected?.runId).toBe(initial.runId);
    expect(inspected?.objective).toBe("inspectable");

    // Clean up
    for (let i = 0; i < 5; i++) {
      release();
      await new Promise((r) => setTimeout(r, 5));
    }
  });

  test("detached=false (default) preserves the blocking contract", async () => {
    const runner: SwarmStageRunner = {
      async runStage(): Promise<SwarmStageRunnerResult> {
        return { summary: "instant" };
      },
    };
    const runtime = new ColonySwarmRuntime({ llmRunner: runner });

    const snapshot = await runtime.startObjective({
      objective: "blocking-task",
      executionMode: "llm",
      // detached omitted → defaults to false
    });

    // All stages should have run and the snapshot should reflect that
    expect(snapshot.runId).toBeTruthy();
    // Stages are observable as complete after the await returns
    expect(snapshot.stages.every((s) => s.status === "completed")).toBe(true);
  });

  test("detached=true with coordinator_only mode is a no-op for the detach flag", async () => {
    const runtime = new ColonySwarmRuntime();

    // coordinator_only doesn't run LLM stages, so detached has no effect
    const snapshot = await runtime.startObjective({
      objective: "coordinator-task",
      executionMode: "coordinator_only",
      detached: true,
    });

    expect(snapshot.runId).toBeTruthy();
    // Status is whatever the coordinator-only flow produced
    expect(["running", "completed", "failed"]).toContain(snapshot.status);
  });

  test("multiple detached runs can be in-flight simultaneously", async () => {
    const { runner, release } = makeGatedRunner();
    const runtime = new ColonySwarmRuntime({ llmRunner: runner, maxConcurrentRuns: 5 });

    const snapshots = await Promise.all([
      runtime.startObjective({ objective: "task-1", executionMode: "llm", detached: true }),
      runtime.startObjective({ objective: "task-2", executionMode: "llm", detached: true }),
      runtime.startObjective({ objective: "task-3", executionMode: "llm", detached: true }),
    ]);

    const runIds = new Set(snapshots.map((s) => s.runId));
    expect(runIds.size).toBe(3); // all unique

    const runs = runtime.listRuns();
    expect(runs.length).toBeGreaterThanOrEqual(3);

    // Clean up
    for (let i = 0; i < 15; i++) {
      release();
      await new Promise((r) => setTimeout(r, 5));
    }
  });
});
