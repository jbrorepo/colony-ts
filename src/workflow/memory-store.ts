import type { WorkflowRun, WorkflowStore } from "./types";

export class MemoryWorkflowStore implements WorkflowStore {
  private readonly _runs = new Map<string, WorkflowRun>();

  async saveRun(run: WorkflowRun): Promise<void> {
    this._runs.set(run.id, JSON.parse(JSON.stringify(run)) as WorkflowRun);
  }

  async loadRun(runId: string): Promise<WorkflowRun | null> {
    const run = this._runs.get(runId);
    return run ? (JSON.parse(JSON.stringify(run)) as WorkflowRun) : null;
  }
}
