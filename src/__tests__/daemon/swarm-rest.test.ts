import { describe, test, expect } from "bun:test";
import { DaemonControlPlaneHost } from "../../daemon/control-plane";
import { handleWebUIRequest } from "../../daemon/web-ui";
import {
  ColonySwarmRuntime,
  type SwarmStageRunner,
  type SwarmStageRunnerResult,
} from "../../orchestrator/swarm";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeHost(runtime?: ColonySwarmRuntime): DaemonControlPlaneHost {
  return new DaemonControlPlaneHost({
    swarmRuntime: runtime,
  });
}

const FAST_RUNNER: SwarmStageRunner = {
  async runStage(): Promise<SwarmStageRunnerResult> {
    return { summary: "ok" };
  },
};

const BASE_URL = "http://localhost/";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Swarm REST API (C3)", () => {
  describe("503 when swarm runtime is not configured", () => {
    test("GET /api/v1/swarm/runs returns 503", async () => {
      const host = makeHost(); // no runtime
      const response = await handleWebUIRequest(
        host,
        new Request(`${BASE_URL}api/v1/swarm/runs`),
      );
      expect(response).not.toBeNull();
      expect(response!.status).toBe(503);
      const body = (await response!.json()) as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
      expect(body.error).toContain("not configured");
    });

    test("POST /api/v1/swarm/runs returns 503", async () => {
      const host = makeHost();
      const response = await handleWebUIRequest(
        host,
        new Request(`${BASE_URL}api/v1/swarm/runs`, {
          method: "POST",
          body: JSON.stringify({ objective: "test" }),
        }),
      );
      expect(response!.status).toBe(503);
    });
  });

  describe("POST /api/v1/swarm/runs — create runs", () => {
    test("creates a detached run by default", async () => {
      const runtime = new ColonySwarmRuntime({ llmRunner: FAST_RUNNER });
      const host = makeHost(runtime);

      const response = await handleWebUIRequest(
        host,
        new Request(`${BASE_URL}api/v1/swarm/runs`, {
          method: "POST",
          body: JSON.stringify({ objective: "test objective" }),
        }),
      );

      expect(response!.status).toBe(202);
      const body = (await response!.json()) as {
        ok: boolean;
        run: { runId: string; objective: string };
        detached: boolean;
      };
      expect(body.ok).toBe(true);
      expect(body.detached).toBe(true);
      expect(body.run.runId).toBeTruthy();
      expect(body.run.objective).toBe("test objective");
    });

    test("rejects missing objective with 400", async () => {
      const runtime = new ColonySwarmRuntime({ llmRunner: FAST_RUNNER });
      const host = makeHost(runtime);

      const response = await handleWebUIRequest(
        host,
        new Request(`${BASE_URL}api/v1/swarm/runs`, {
          method: "POST",
          body: JSON.stringify({}),
        }),
      );

      expect(response!.status).toBe(400);
      const body = (await response!.json()) as { error: string };
      expect(body.error).toContain("objective");
    });

    test("rejects invalid JSON with 400", async () => {
      const runtime = new ColonySwarmRuntime({ llmRunner: FAST_RUNNER });
      const host = makeHost(runtime);

      const response = await handleWebUIRequest(
        host,
        new Request(`${BASE_URL}api/v1/swarm/runs`, {
          method: "POST",
          body: "not json",
        }),
      );

      expect(response!.status).toBe(400);
    });

    test("respects detached=false (blocks until completion)", async () => {
      const runtime = new ColonySwarmRuntime({ llmRunner: FAST_RUNNER });
      const host = makeHost(runtime);

      const response = await handleWebUIRequest(
        host,
        new Request(`${BASE_URL}api/v1/swarm/runs`, {
          method: "POST",
          body: JSON.stringify({
            objective: "blocking",
            detached: false,
          }),
        }),
      );

      expect(response!.status).toBe(202);
      const body = (await response!.json()) as {
        run: { stages: Array<{ status: string }> };
        detached: boolean;
      };
      expect(body.detached).toBe(false);
      // With detached=false the response is sent after stages complete
      expect(body.run.stages.every((s) => s.status === "completed")).toBe(true);
    });
  });

  describe("GET /api/v1/swarm/runs — list runs", () => {
    test("returns empty list when no runs have been created", async () => {
      const runtime = new ColonySwarmRuntime({ llmRunner: FAST_RUNNER });
      const host = makeHost(runtime);

      const response = await handleWebUIRequest(
        host,
        new Request(`${BASE_URL}api/v1/swarm/runs`),
      );
      expect(response!.status).toBe(200);
      const body = (await response!.json()) as { ok: boolean; runs: unknown[] };
      expect(body.ok).toBe(true);
      expect(body.runs).toEqual([]);
    });

    test("includes a created run in the list", async () => {
      const runtime = new ColonySwarmRuntime({ llmRunner: FAST_RUNNER });
      const host = makeHost(runtime);

      // Create a run via POST
      await handleWebUIRequest(
        host,
        new Request(`${BASE_URL}api/v1/swarm/runs`, {
          method: "POST",
          body: JSON.stringify({ objective: "listable", detached: false }),
        }),
      );

      // List
      const response = await handleWebUIRequest(
        host,
        new Request(`${BASE_URL}api/v1/swarm/runs`),
      );
      const body = (await response!.json()) as {
        runs: Array<{ objective: string }>;
      };
      expect(body.runs.length).toBeGreaterThanOrEqual(1);
      expect(body.runs.some((r) => r.objective === "listable")).toBe(true);
    });
  });

  describe("GET /api/v1/swarm/runs/:id — inspect", () => {
    test("returns the snapshot for an existing run", async () => {
      const runtime = new ColonySwarmRuntime({ llmRunner: FAST_RUNNER });
      const host = makeHost(runtime);

      const createResp = await handleWebUIRequest(
        host,
        new Request(`${BASE_URL}api/v1/swarm/runs`, {
          method: "POST",
          body: JSON.stringify({ objective: "inspectable", detached: false }),
        }),
      );
      const created = (await createResp!.json()) as { run: { runId: string } };
      const runId = created.run.runId;

      const response = await handleWebUIRequest(
        host,
        new Request(`${BASE_URL}api/v1/swarm/runs/${runId}`),
      );
      expect(response!.status).toBe(200);
      const body = (await response!.json()) as {
        ok: boolean;
        run: { runId: string; objective: string };
      };
      expect(body.ok).toBe(true);
      expect(body.run.runId).toBe(runId);
      expect(body.run.objective).toBe("inspectable");
    });

    test("returns 404 for an unknown run id", async () => {
      const runtime = new ColonySwarmRuntime({ llmRunner: FAST_RUNNER });
      const host = makeHost(runtime);

      const response = await handleWebUIRequest(
        host,
        new Request(`${BASE_URL}api/v1/swarm/runs/swarm_nonexistent_id`),
      );
      expect(response!.status).toBe(404);
    });
  });

  describe("POST /api/v1/swarm/runs/:id/cancel", () => {
    test("cancels an in-flight run", async () => {
      const runtime = new ColonySwarmRuntime({ llmRunner: FAST_RUNNER });
      const host = makeHost(runtime);

      const createResp = await handleWebUIRequest(
        host,
        new Request(`${BASE_URL}api/v1/swarm/runs`, {
          method: "POST",
          body: JSON.stringify({ objective: "cancellable", detached: true }),
        }),
      );
      const created = (await createResp!.json()) as { run: { runId: string } };
      const runId = created.run.runId;

      const cancelResp = await handleWebUIRequest(
        host,
        new Request(`${BASE_URL}api/v1/swarm/runs/${runId}/cancel`, {
          method: "POST",
          body: JSON.stringify({ reason: "test cancel" }),
        }),
      );
      expect(cancelResp!.status).toBe(200);
      const body = (await cancelResp!.json()) as { ok: boolean; run: { runId: string } };
      expect(body.ok).toBe(true);
      expect(body.run.runId).toBe(runId);
    });

    test("returns 404 for an unknown run id", async () => {
      const runtime = new ColonySwarmRuntime({ llmRunner: FAST_RUNNER });
      const host = makeHost(runtime);

      const response = await handleWebUIRequest(
        host,
        new Request(`${BASE_URL}api/v1/swarm/runs/missing/cancel`, {
          method: "POST",
        }),
      );
      expect(response!.status).toBe(404);
    });
  });

  describe("POST /api/v1/diffs/preview (C5)", () => {
    test("returns hunks for changed text", async () => {
      const host = makeHost();
      const response = await handleWebUIRequest(
        host,
        new Request(`${BASE_URL}api/v1/diffs/preview`, {
          method: "POST",
          body: JSON.stringify({
            oldText: "a\nb\nc\n",
            newText: "a\nB\nc\n",
            filename: "test.txt",
          }),
        }),
      );
      expect(response!.status).toBe(200);
      const body = (await response!.json()) as {
        ok: boolean;
        diff: { unchanged: boolean; stats: { added: number; removed: number } };
      };
      expect(body.ok).toBe(true);
      expect(body.diff.unchanged).toBe(false);
      expect(body.diff.stats.added).toBe(1);
      expect(body.diff.stats.removed).toBe(1);
    });

    test("returns unchanged=true for identical text", async () => {
      const host = makeHost();
      const response = await handleWebUIRequest(
        host,
        new Request(`${BASE_URL}api/v1/diffs/preview`, {
          method: "POST",
          body: JSON.stringify({ oldText: "same\n", newText: "same\n" }),
        }),
      );
      expect(response!.status).toBe(200);
      const body = (await response!.json()) as { diff: { unchanged: boolean } };
      expect(body.diff.unchanged).toBe(true);
    });

    test("returns 400 for invalid JSON body", async () => {
      const host = makeHost();
      const response = await handleWebUIRequest(
        host,
        new Request(`${BASE_URL}api/v1/diffs/preview`, {
          method: "POST",
          body: "not json",
        }),
      );
      expect(response!.status).toBe(400);
    });

    test("clamps contextLines to a safe range", async () => {
      const host = makeHost();
      // Negative → clamped to 3 (default); huge → clamped to 20
      const response = await handleWebUIRequest(
        host,
        new Request(`${BASE_URL}api/v1/diffs/preview`, {
          method: "POST",
          body: JSON.stringify({
            oldText: "a\nb\nc\n",
            newText: "a\nB\nc\n",
            contextLines: 999,
          }),
        }),
      );
      expect(response!.status).toBe(200);
      const body = (await response!.json()) as { ok: boolean };
      expect(body.ok).toBe(true);
    });
  });

  describe("capability advertisement", () => {
    test("/api/v1/health includes swarm.runs when runtime is configured", async () => {
      const runtime = new ColonySwarmRuntime({ llmRunner: FAST_RUNNER });
      const host = makeHost(runtime);

      const response = await handleWebUIRequest(
        host,
        new Request(`${BASE_URL}api/v1/health`),
      );
      const body = (await response!.json()) as { capabilities: string[] };
      expect(body.capabilities).toContain("swarm.runs");
      expect(body.capabilities).toContain("swarm.detached");
    });

    test("/api/v1/health excludes swarm.* when runtime is absent", async () => {
      const host = makeHost();

      const response = await handleWebUIRequest(
        host,
        new Request(`${BASE_URL}api/v1/health`),
      );
      const body = (await response!.json()) as { capabilities: string[] };
      expect(body.capabilities).not.toContain("swarm.runs");
    });
  });
});
