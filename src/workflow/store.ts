import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { join } from "path";

import type { WorkflowRun, WorkflowStore } from "./types";

export interface JsonWorkflowStoreOptions {
  rootDir: string;
}

export class JsonWorkflowStore implements WorkflowStore {
  private readonly _runsDir: string;

  constructor(options: JsonWorkflowStoreOptions) {
    this._runsDir = join(options.rootDir, "workflow-runs");
  }

  async saveRun(run: WorkflowRun): Promise<void> {
    await mkdir(this._runsDir, { recursive: true });
    const target = this._runPath(run.id);
    const temp = `${target}.tmp`;
    await writeFile(temp, `${JSON.stringify(run, null, 2)}\n`, "utf8");
    await rename(temp, target);
  }

  async loadRun(runId: string): Promise<WorkflowRun | null> {
    try {
      const content = await readFile(this._runPath(runId), "utf8");
      return JSON.parse(content) as WorkflowRun;
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") return null;
      throw error;
    }
  }

  private _runPath(runId: string): string {
    return join(this._runsDir, `${safeFilePart(runId)}.json`);
  }
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}
