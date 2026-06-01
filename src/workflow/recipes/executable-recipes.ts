import { WorkflowEngine } from "../engine";
import { MemoryWorkflowStore } from "../memory-store";
import type {
  WorkflowDefinition,
  WorkflowRun,
  WorkflowStepHandler,
  WorkflowStepHandlers,
} from "../types";
import { getWorkflowRecipe, listWorkflowRecipes } from "./gstack-inspired";

export interface ExecutableWorkflowRecipe {
  id: string;
  definition: WorkflowDefinition;
  handlers: WorkflowStepHandlers;
}

export interface WorkflowRecipeRuntimeSnapshot {
  runId: string;
  recipeId: string;
  title: string;
  status: string;
  completedSteps: number;
  totalSteps: number;
  awaitingStepId?: string;
  failedStepId?: string;
  artifactCount: number;
  checkpointCount: number;
  updatedAt: number;
  nextCommand: string;
  approvalState: string;
  artifacts: Array<{ id: string; name: string; type: string }>;
}

export function listExecutableWorkflowRecipes(): ExecutableWorkflowRecipe[] {
  return listWorkflowRecipes().map((recipe) => createExecutableWorkflowRecipe(recipe.id)).filter(Boolean) as ExecutableWorkflowRecipe[];
}

export function createExecutableWorkflowRecipe(id: string): ExecutableWorkflowRecipe | null {
  const recipe = getWorkflowRecipe(id);
  if (!recipe) return null;
  const definition: WorkflowDefinition = {
    id: `recipe_${recipe.id}`,
    title: `Workflow Recipe: ${recipe.title}`,
    version: "market-parity",
    steps: [
      taskStep("scope", "Scope", `Scope ${recipe.title}: ${recipe.summary}`),
      approvalStep("approval", "Approval Checkpoint", ["scope"], "Approval required before risky host-owned recipe work."),
      ...(recipe.id === "qa" ? [taskStep("browser_verify", "Browser Verify", "Run approved browser inspection evidence.", ["approval"])] : []),
      taskStep("execute", "Execute", `Execute ${recipe.title} recipe in local-first mode.`, recipe.id === "qa" ? ["browser_verify"] : ["approval"]),
      taskStep("verify", "Verify", `Collect verification evidence for ${recipe.title}.`, ["execute"]),
      taskStep("artifact", "Artifact", `Produce bounded operator artifact for ${recipe.title}.`, ["verify"]),
    ],
  };
  const handlers: WorkflowStepHandlers = Object.fromEntries(
    definition.steps
      .filter((step) => step.kind === "task")
      .map((step) => [step.id, recipeTaskHandler(recipe.id, step.id, step.title)]),
  );
  return { id: recipe.id, definition, handlers };
}

export class WorkflowRecipeRuntime {
  private readonly store = new MemoryWorkflowStore();
  private readonly engine: WorkflowEngine;
  private readonly runRecipes = new Map<string, string>();
  private readonly snapshots = new Map<string, WorkflowRecipeRuntimeSnapshot>();

  constructor(options: { now?: () => number } = {}) {
    this.engine = new WorkflowEngine({ store: this.store, now: options.now });
  }

  async start(recipeId: string): Promise<WorkflowRecipeRuntimeSnapshot> {
    const recipe = createExecutableWorkflowRecipe(recipeId);
    if (!recipe) throw new Error(`Unknown workflow recipe: ${recipeId}`);
    const started = await this.engine.start(recipe.definition);
    this.runRecipes.set(started.id, recipe.id);
    const run = await this.engine.runUntilBlocked(started.id, recipe.handlers);
    return this.cacheSnapshot(this.snapshot(run, recipe.id));
  }

  async resume(runId: string, opts: { approvedBy?: string } = {}): Promise<WorkflowRecipeRuntimeSnapshot> {
    const run = await this.requireRun(runId);
    const recipeId = this.runRecipes.get(runId) ?? run.definitionId.replace(/^recipe_/, "");
    const recipe = createExecutableWorkflowRecipe(recipeId);
    if (!recipe) throw new Error(`Unknown workflow recipe: ${recipeId}`);
    const awaiting = Object.values(run.steps).find((step) => step.status === "awaiting_approval");
    let next = run;
    if (awaiting) {
      next = await this.engine.approveStep(runId, awaiting.id, opts.approvedBy ?? "operator");
    }
    next = await this.engine.runUntilBlocked(next.id, recipe.handlers);
    return this.cacheSnapshot(this.snapshot(next, recipe.id));
  }

  async cancel(runId: string): Promise<WorkflowRecipeRuntimeSnapshot> {
    const run = await this.requireRun(runId);
    run.status = "failed";
    run.updatedAt = Date.now();
    await this.store.saveRun(run);
    const snapshot = this.snapshot(run, this.runRecipes.get(runId) ?? run.definitionId.replace(/^recipe_/, ""));
    return this.cacheSnapshot({ ...snapshot, status: "cancelled", nextCommand: "/workflow recipes" });
  }

  async inspect(runId: string): Promise<WorkflowRecipeRuntimeSnapshot | null> {
    const run = await this.store.loadRun(runId);
    return run ? this.cacheSnapshot(this.snapshot(run, this.runRecipes.get(runId) ?? run.definitionId.replace(/^recipe_/, ""))) : null;
  }

  inspectCached(runId: string): WorkflowRecipeRuntimeSnapshot | null {
    const snapshot = this.snapshots.get(runId);
    return snapshot ? cloneSnapshot(snapshot) : null;
  }

  listCached(): WorkflowRecipeRuntimeSnapshot[] {
    return [...this.snapshots.values()]
      .map(cloneSnapshot)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  private async requireRun(runId: string): Promise<WorkflowRun> {
    const run = await this.store.loadRun(runId);
    if (!run) throw new Error(`Workflow run not found: ${runId}`);
    return run;
  }

  private snapshot(run: WorkflowRun, recipeId: string): WorkflowRecipeRuntimeSnapshot {
    const states = Object.values(run.steps);
    const awaiting = states.find((step) => step.status === "awaiting_approval");
    const failed = states.find((step) => step.status === "failed");
    return {
      runId: run.id,
      recipeId,
      title: run.definition.title,
      status: run.status,
      completedSteps: states.filter((step) => step.status === "completed").length,
      totalSteps: states.length,
      awaitingStepId: awaiting?.id,
      failedStepId: failed?.id,
      artifactCount: run.artifacts.length,
      checkpointCount: run.checkpoints.length,
      updatedAt: run.updatedAt,
      nextCommand: awaiting ? `/workflow resume ${run.id}` : run.status === "completed" ? `/workflow artifacts ${run.id}` : `/workflow inspect ${run.id}`,
      approvalState: awaiting ? `awaiting approval at ${awaiting.id}` : "none pending",
      artifacts: run.artifacts.map((artifact) => ({ id: artifact.id, name: artifact.name, type: artifact.type })),
    };
  }

  private cacheSnapshot(snapshot: WorkflowRecipeRuntimeSnapshot): WorkflowRecipeRuntimeSnapshot {
    const cloned = cloneSnapshot(snapshot);
    this.snapshots.set(cloned.runId, cloned);
    return cloneSnapshot(cloned);
  }
}

function cloneSnapshot(snapshot: WorkflowRecipeRuntimeSnapshot): WorkflowRecipeRuntimeSnapshot {
  return {
    ...snapshot,
    artifacts: snapshot.artifacts.map((artifact) => ({ ...artifact })),
  };
}

function taskStep(id: string, title: string, task: string, dependsOn?: string[]) {
  return { id, title, kind: "task" as const, dependsOn, agentLoop: { task } };
}

function approvalStep(id: string, title: string, dependsOn: string[], reason: string) {
  return { id, title, kind: "approval" as const, dependsOn, approval: { reason } };
}

function recipeTaskHandler(recipeId: string, stepId: string, title: string): WorkflowStepHandler {
  return () => ({
    summary: `${title} completed for ${recipeId}.`,
    artifacts: stepId === "artifact"
      ? [{
          type: "markdown",
          name: `${recipeId}-recipe-summary.md`,
          content: `# ${recipeId}\n\nScope summary, command evidence, artifacts, and blocked-next-action truth were recorded.`,
          metadata: { recipeId, stepId },
        }]
      : stepId === "browser_verify"
        ? [{
            type: "json",
            name: `${recipeId}-browser-evidence.json`,
            content: JSON.stringify({ untrusted: true, browserAutomation: "approved-driver-boundary" }),
            metadata: { recipeId, browserEvidence: true },
          }]
        : [{
            type: "text",
            name: `${recipeId}-${stepId}.txt`,
            content: `${title} evidence for ${recipeId}.`,
            metadata: { recipeId, stepId },
          }],
  });
}

