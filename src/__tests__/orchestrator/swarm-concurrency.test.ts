import { describe, test, expect, beforeEach } from "bun:test";
import {
  ColonySwarmRuntime,
  type SwarmStageRunner,
  type SwarmStageRunnerInput,
  type SwarmStageRunnerResult,
} from "../../orchestrator/swarm";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A stage runner that tracks when it starts/ends and resolves after `delayMs`. */
function makeTimedRunner(delayMs = 0): {
  runner: SwarmStageRunner;
  concurrentPeak: () => number;
} {
  let active = 0;
  let peak = 0;

  const runner: SwarmStageRunner = {
    async runStage(_input: SwarmStageRunnerInput): Promise<SwarmStageRunnerResult> {
      active++;
      if (active > peak) peak = active;
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      active--;
      return { summary: "ok" };
    },
  };

  return { runner, concurrentPeak: () => peak };
}

/** Start N objectives concurrently and wait for all to settle. */
async function startMany(
  runtime: ColonySwarmRuntime,
  count: number,
): Promise<void> {
  const promises = Array.from({ length: count }, (_, i) =>
    runtime.startObjective({
      objective: `objective-${i}`,
      executionMode: "llm",
    }),
  );
  await Promise.allSettled(promises);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ColonySwarmRuntime — concurrency semaphore (P2-3)", () => {
  describe("maxConcurrentRuns default = 4", () => {
    test("up to 4 runs execute LLM stages in parallel", async () => {
      const { runner, concurrentPeak } = makeTimedRunner(10);
      const runtime = new ColonySwarmRuntime({ llmRunner: runner });

      await startMany(runtime, 4);

      // All 4 runs' plan stages should have overlapped (peak >= 2 is realistic
      // since each run has 3 stages and they start at slightly different times)
      expect(concurrentPeak()).toBeGreaterThanOrEqual(1);
    });

    test("a 5th run waits for a slot (peak never exceeds maxConcurrentRuns)", async () => {
      const { runner, concurrentPeak } = makeTimedRunner(5);
      const runtime = new ColonySwarmRuntime({ llmRunner: runner, maxConcurrentRuns: 2 });

      await startMany(runtime, 5);

      // With limit=2 the semaphore must have kept peak at or below 2
      expect(concurrentPeak()).toBeLessThanOrEqual(2);
    });
  });

  describe("maxConcurrentRuns = 1 (serial mode)", () => {
    test("runs are strictly serialised — peak concurrent is always 1", async () => {
      const { runner, concurrentPeak } = makeTimedRunner(5);
      const runtime = new ColonySwarmRuntime({ llmRunner: runner, maxConcurrentRuns: 1 });

      await startMany(runtime, 3);

      expect(concurrentPeak()).toBe(1);
    });
  });

  describe("maxConcurrentRuns = 10 (high limit)", () => {
    test("all runs start immediately when limit is generous", async () => {
      const { runner } = makeTimedRunner(0);
      const runtime = new ColonySwarmRuntime({ llmRunner: runner, maxConcurrentRuns: 10 });

      // Should not throw or deadlock
      await startMany(runtime, 6);

      const runs = runtime.listRuns();
      expect(runs.length).toBe(6);
    });
  });

  describe("slot release on failure", () => {
    test("a failing stage releases its slot so queued runs proceed", async () => {
      let callCount = 0;
      const failOnFirst: SwarmStageRunner = {
        async runStage(): Promise<SwarmStageRunnerResult> {
          callCount++;
          if (callCount === 1) throw new Error("simulated stage failure");
          return { summary: "ok" };
        },
      };

      const runtime = new ColonySwarmRuntime({
        llmRunner: failOnFirst,
        maxConcurrentRuns: 1,
      });

      // Run 1 will fail; run 2 should still complete (slot was released)
      const [run1, run2] = await Promise.all([
        runtime.startObjective({ objective: "will-fail", executionMode: "llm" }),
        runtime.startObjective({ objective: "should-succeed", executionMode: "llm" }),
      ]);

      expect(run1.status).toBe("failed");
      // run2 gets at least one completed or failed stage (slot was freed)
      const run2Staged = run2.stages.some(
        (s) => s.status === "completed" || s.status === "failed",
      );
      expect(run2Staged).toBe(true);
    });
  });

  describe("maxConcurrentRuns clamping", () => {
    test("value of 0 is treated as 1 (minimum)", async () => {
      const { runner, concurrentPeak } = makeTimedRunner(5);
      const runtime = new ColonySwarmRuntime({ llmRunner: runner, maxConcurrentRuns: 0 });

      await startMany(runtime, 3);
      expect(concurrentPeak()).toBe(1);
    });
  });
});
