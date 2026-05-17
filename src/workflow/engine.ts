import type {
  WorkflowArtifact,
  WorkflowBudgetPolicy,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowStep,
  WorkflowStepHandlers,
  WorkflowStepResult,
  WorkflowStore,
} from "./types";
import { validateWorkflowDefinition } from "./validation";

export interface WorkflowEngineOptions {
  store: WorkflowStore;
  budgetPolicy?: WorkflowBudgetPolicy;
  now?: () => number;
}

export class WorkflowEngine {
  private readonly _store: WorkflowStore;
  private readonly _budgetPolicy?: WorkflowBudgetPolicy;
  private readonly _now: () => number;

  constructor(options: WorkflowEngineOptions) {
    this._store = options.store;
    this._budgetPolicy = options.budgetPolicy;
    this._now = options.now ?? (() => Date.now());
  }

  async start(definition: WorkflowDefinition): Promise<WorkflowRun> {
    const validation = validateWorkflowDefinition(definition);
    if (!validation.ok) {
      throw new Error(`Invalid workflow definition: ${validation.errors.join("; ")}`);
    }

    const timestamp = this._now();
    const run: WorkflowRun = {
      id: `wfr_${definition.id}_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
      definitionId: definition.id,
      definition: cloneDefinition(definition),
      status: "pending",
      order: validation.order,
      steps: Object.fromEntries(definition.steps.map((step) => [
        step.id,
        { id: step.id, status: "pending", attempts: 0 },
      ])),
      artifacts: [],
      checkpoints: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this._addCheckpoint(run, "pending");
    await this._save(run);
    return run;
  }

  async loadRun(runId: string): Promise<WorkflowRun | null> {
    return this._store.loadRun(runId);
  }

  async approveStep(runId: string, stepId: string, approvedBy: string): Promise<WorkflowRun> {
    const run = await this._requireRun(runId);
    const step = this._stepById(run, stepId);
    const state = run.steps[stepId];
    if (step.kind !== "approval") throw new Error(`Step ${stepId} is not an approval step`);
    if (state.status !== "awaiting_approval") throw new Error(`Step ${stepId} is not awaiting approval`);
    if (step.approval?.requiredApprover && approvedBy !== step.approval.requiredApprover) {
      throw new Error(`Step ${stepId} requires approver ${step.approval.requiredApprover}`);
    }

    const timestamp = this._now();
    state.status = "completed";
    state.approvedBy = approvedBy;
    state.approvedAt = timestamp;
    state.completedAt = timestamp;
    run.status = "running";
    this._addCheckpoint(run, "running");
    await this._save(run);
    return run;
  }

  async runUntilBlocked(runId: string, handlers: WorkflowStepHandlers): Promise<WorkflowRun> {
    const run = await this._requireRun(runId);
    if (run.status === "completed" || run.status === "failed" || run.status === "paused") {
      return run;
    }

    run.status = "running";
    await this._save(run);

    while (true) {
      const step = this._nextRunnableStep(run);
      if (!step) break;

      const state = run.steps[step.id];
      if (step.kind === "approval") {
        state.status = "awaiting_approval";
        state.startedAt ??= this._now();
        state.summary = step.approval?.reason ?? state.summary;
        run.status = "paused";
        this._addCheckpoint(run, "paused", { blockedStepId: step.id });
        await this._save(run);
        return run;
      }

      const handler = handlers[step.id];
      if (!handler) {
        state.status = "failed";
        state.lastError = `Missing workflow step handler: ${step.id}`;
        run.status = "failed";
        this._addCheckpoint(run, "failed", { failedStepId: step.id });
        await this._save(run);
        return run;
      }

      const stepCompleted = await this._executeTaskStep(run, step, handler);
      if (!stepCompleted) return run;
    }

    if (this._allStepsCompleted(run)) {
      run.status = "completed";
      this._addCheckpoint(run, "completed");
    }
    await this._save(run);
    return run;
  }

  private async _executeTaskStep(
    run: WorkflowRun,
    step: WorkflowStep,
    handler: WorkflowStepHandlers[string],
  ): Promise<boolean> {
    const state = run.steps[step.id];
    const maxAttempts = step.maxAttempts ?? 1;

    while (state.attempts < maxAttempts) {
      const budgetDecision = await this._evaluateStepBudget(run, step);
      if (!budgetDecision.allowed) {
        state.status = "failed";
        state.lastError = budgetDecision.reason
          ? `Workflow step budget denied: ${budgetDecision.reason}`
          : "Workflow step budget denied";
        run.status = "failed";
        this._addCheckpoint(run, "failed", { failedStepId: step.id });
        await this._save(run);
        return false;
      }

      const attempt = state.attempts + 1;
      state.status = "running";
      state.attempts = attempt;
      state.startedAt ??= this._now();
      await this._save(run);

      try {
        const result = await Promise.resolve(handler({ run: cloneRun(run), step, attempt }));
        this._completeTaskStep(run, step, result);
        await this._recordStepBudgetSpend(run, step);
        await this._save(run);
        return true;
      } catch (error) {
        state.lastError = error instanceof Error ? error.message : String(error);
        if (attempt >= maxAttempts) {
          state.status = "failed";
          run.status = "failed";
          this._addCheckpoint(run, "failed", { failedStepId: step.id });
          await this._save(run);
          return false;
        }
        state.status = "pending";
        await this._save(run);
      }
    }
    return false;
  }

  private async _evaluateStepBudget(run: WorkflowRun, step: WorkflowStep): Promise<{ allowed: boolean; reason?: string }> {
    if (!this._budgetPolicy || !step.budget) return { allowed: true };
    const decision = await Promise.resolve(this._budgetPolicy.evaluateStep({ run: cloneRun(run), step: cloneStep(step) }));
    return {
      allowed: decision.allowed,
      reason: decision.reason,
    };
  }

  private async _recordStepBudgetSpend(run: WorkflowRun, step: WorkflowStep): Promise<void> {
    if (!this._budgetPolicy?.recordStepSpend || !step.budget) return;
    await Promise.resolve(this._budgetPolicy.recordStepSpend({ run: cloneRun(run), step: cloneStep(step) }));
  }

  private _completeTaskStep(run: WorkflowRun, step: WorkflowStep, result: WorkflowStepResult): void {
    const timestamp = this._now();
    const state = run.steps[step.id];
    state.status = "completed";
    state.summary = result.summary;
    state.completedAt = timestamp;
    for (const artifact of result.artifacts ?? []) {
      run.artifacts.push({
        ...artifact,
        id: `wfa_${step.id}_${run.artifacts.length + 1}_${timestamp}`,
        stepId: step.id,
        createdAt: timestamp,
      });
    }
    this._addCheckpoint(run, "running");
  }

  private _nextRunnableStep(run: WorkflowRun): WorkflowStep | null {
    for (const stepId of run.order) {
      const step = this._stepById(run, stepId);
      const state = run.steps[stepId];
      if (state.status !== "pending") continue;
      const dependenciesComplete = (step.dependsOn ?? []).every((dependency) => (
        run.steps[dependency]?.status === "completed"
      ));
      if (dependenciesComplete) return step;
    }
    return null;
  }

  private _allStepsCompleted(run: WorkflowRun): boolean {
    return run.order.every((stepId) => run.steps[stepId]?.status === "completed");
  }

  private _stepById(run: WorkflowRun, stepId: string): WorkflowStep {
    const step = run.definition.steps.find((candidate) => candidate.id === stepId);
    if (!step) throw new Error(`Unknown workflow step: ${stepId}`);
    return step;
  }

  private _addCheckpoint(
    run: WorkflowRun,
    status: WorkflowRunStatus,
    options: { blockedStepId?: string; failedStepId?: string } = {},
  ): void {
    const timestamp = this._now();
    run.checkpoints.push({
      id: `wfc_${run.checkpoints.length + 1}_${timestamp}`,
      runId: run.id,
      status,
      completedStepIds: run.order.filter((stepId) => run.steps[stepId]?.status === "completed"),
      artifactIds: run.artifacts.map((artifact) => artifact.id),
      blockedStepId: options.blockedStepId,
      failedStepId: options.failedStepId,
      createdAt: timestamp,
    });
  }

  private async _requireRun(runId: string): Promise<WorkflowRun> {
    const run = await this._store.loadRun(runId);
    if (!run) throw new Error(`Workflow run not found: ${runId}`);
    return run;
  }

  private async _save(run: WorkflowRun): Promise<void> {
    run.updatedAt = this._now();
    await this._store.saveRun(run);
  }
}

function cloneDefinition(definition: WorkflowDefinition): WorkflowDefinition {
  return JSON.parse(JSON.stringify(definition)) as WorkflowDefinition;
}

function cloneRun(run: WorkflowRun): WorkflowRun {
  return JSON.parse(JSON.stringify(run)) as WorkflowRun;
}

function cloneStep(step: WorkflowStep): WorkflowStep {
  return JSON.parse(JSON.stringify(step)) as WorkflowStep;
}
