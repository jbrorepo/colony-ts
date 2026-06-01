import { describe, test, expect, beforeEach } from "bun:test";
import { MemoryWorkflowStore } from "../../workflow/memory-store";
import type { WorkflowRun } from "../../workflow/types";

function makeRun(id: string, status: WorkflowRun["status"] = "running"): WorkflowRun {
  const now = Date.now();
  return {
    id,
    definitionId: `def-${id}`,
    definition: { id: `def-${id}`, title: "test", steps: [] },
    status,
    order: [],
    steps: {},
    artifacts: [],
    checkpoints: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe("MemoryWorkflowStore (P1-3)", () => {
  let store: MemoryWorkflowStore;

  beforeEach(() => {
    store = new MemoryWorkflowStore();
  });

  test("saveRun and loadRun round-trip", async () => {
    const run = makeRun("run-1");
    await store.saveRun(run);
    const loaded = await store.loadRun("run-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe("run-1");
    expect(loaded!.status).toBe("running");
  });

  test("loadRun returns null for missing ID", async () => {
    const result = await store.loadRun("nonexistent");
    expect(result).toBeNull();
  });

  test("saveRun overwrites an existing run", async () => {
    const run = makeRun("run-2", "running");
    await store.saveRun(run);
    const updated = { ...run, status: "completed" as const };
    await store.saveRun(updated);
    const loaded = await store.loadRun("run-2");
    expect(loaded!.status).toBe("completed");
  });

  test("returned run is a deep copy — mutations do not affect stored state", async () => {
    const run = makeRun("run-3");
    await store.saveRun(run);
    const loaded = await store.loadRun("run-3");
    loaded!.status = "failed";
    const reloaded = await store.loadRun("run-3");
    expect(reloaded!.status).toBe("running");
  });

  test("multiple independent runs coexist", async () => {
    await store.saveRun(makeRun("a"));
    await store.saveRun(makeRun("b"));
    await store.saveRun(makeRun("c"));
    expect(await store.loadRun("a")).not.toBeNull();
    expect(await store.loadRun("b")).not.toBeNull();
    expect(await store.loadRun("c")).not.toBeNull();
    expect(await store.loadRun("d")).toBeNull();
  });
});
