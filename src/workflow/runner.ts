import type { RuntimeWorkflowRunSnapshot } from "../runtime/runtime-snapshot";
import type { HookCallback, HookEvent } from "../runtime/loop";
import type {
  WorkflowDefinition,
  WorkflowRun,
  WorkflowStepHandler,
  WorkflowStepHandlerInput,
  WorkflowStepHandlers,
  WorkflowStepResult,
} from "./types";
import { WorkflowEngine } from "./engine";

export type WorkflowRuntimeHookEvent = HookEvent;
export type WorkflowRuntimeHook = HookCallback;

export interface WorkflowRuntimeRunnerOptions {
  engine: WorkflowEngine;
  hooks?: WorkflowRuntimeHook[];
}

export class WorkflowRuntimeRunner {
  private readonly _engine: WorkflowEngine;
  private readonly _hooks: WorkflowRuntimeHook[];

  constructor(options: WorkflowRuntimeRunnerOptions) {
    this._engine = options.engine;
    this._hooks = options.hooks ?? [];
  }

  async startAndRun(
    definition: WorkflowDefinition,
    handlers: WorkflowStepHandlers,
  ): Promise<WorkflowRun> {
    const run = await this._engine.start(definition);
    await this._fireHook("WorkflowRunStarted", runHookData(run));
    return this._runUntilBlockedWithHooks(run.id, handlers);
  }

  async approveAndRun(
    runId: string,
    stepId: string,
    approvedBy: string,
    handlers: WorkflowStepHandlers,
  ): Promise<WorkflowRun> {
    const approved = await this._engine.approveStep(runId, stepId, approvedBy);
    await this._fireHook("WorkflowRunResumed", {
      ...runHookData(approved),
      stepId,
      approvedBy,
    });
    return this._runUntilBlockedWithHooks(runId, handlers);
  }

  private async _runUntilBlockedWithHooks(
    runId: string,
    handlers: WorkflowStepHandlers,
  ): Promise<WorkflowRun> {
    const run = await this._engine.runUntilBlocked(runId, this._wrapHandlers(handlers));
    await this._fireTerminalHook(run);
    return run;
  }

  private _wrapHandlers(handlers: WorkflowStepHandlers): WorkflowStepHandlers {
    return Object.fromEntries(
      Object.entries(handlers).map(([stepId, handler]) => [
        stepId,
        this._wrapHandler(stepId, handler),
      ]),
    );
  }

  private _wrapHandler(stepId: string, handler: WorkflowStepHandler): WorkflowStepHandler {
    return async (input: WorkflowStepHandlerInput): Promise<WorkflowStepResult> => {
      await this._fireHook("PreWorkflowStep", stepHookData(input, stepId));
      try {
        const result = await Promise.resolve(handler(input));
        await this._fireHook("PostWorkflowStep", {
          ...stepHookData(input, stepId),
          status: "completed",
          summary: result.summary,
          artifactCount: result.artifacts?.length ?? 0,
        });
        return result;
      } catch (error) {
        await this._fireHook("PostWorkflowStep", {
          ...stepHookData(input, stepId),
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    };
  }

  private async _fireTerminalHook(run: WorkflowRun): Promise<void> {
    if (run.status === "paused") {
      await this._fireHook("WorkflowRunBlocked", {
        ...runHookData(run),
        stepId: workflowAwaitingStepId(run),
      });
      return;
    }
    if (run.status === "completed") {
      await this._fireHook("WorkflowRunCompleted", runHookData(run));
      return;
    }
    if (run.status === "failed") {
      await this._fireHook("WorkflowRunFailed", {
        ...runHookData(run),
        stepId: workflowFailedStepId(run),
      });
    }
  }

  private async _fireHook(kind: string, data: Record<string, unknown>): Promise<void> {
    for (const hook of this._hooks) {
      try {
        await hook({ kind, data });
      } catch {
        // Runtime hooks are observability surfaces; failures must not break workflow execution.
      }
    }
  }
}

export function workflowRunToRuntimeSnapshot(run: WorkflowRun): RuntimeWorkflowRunSnapshot {
  return {
    runId: run.id,
    definitionId: run.definitionId,
    title: run.definition.title,
    status: run.status,
    completedSteps: run.order.filter((stepId) => run.steps[stepId]?.status === "completed").length,
    totalSteps: run.order.length,
    awaitingStepId: workflowAwaitingStepId(run),
    failedStepId: workflowFailedStepId(run),
    artifactCount: run.artifacts.length,
    checkpointCount: run.checkpoints.length,
    updatedAt: run.updatedAt,
  };
}

function runHookData(run: WorkflowRun): Record<string, unknown> {
  return {
    runId: run.id,
    definitionId: run.definitionId,
    title: run.definition.title,
    status: run.status,
    completedSteps: run.order.filter((stepId) => run.steps[stepId]?.status === "completed").length,
    totalSteps: run.order.length,
    artifactCount: run.artifacts.length,
    checkpointCount: run.checkpoints.length,
  };
}

function stepHookData(input: WorkflowStepHandlerInput, fallbackStepId: string): Record<string, unknown> {
  return {
    runId: input.run.id,
    definitionId: input.run.definitionId,
    stepId: input.step.id || fallbackStepId,
    title: input.step.title,
    attempt: input.attempt,
  };
}

function workflowAwaitingStepId(run: WorkflowRun): string | undefined {
  return run.order.find((stepId) => run.steps[stepId]?.status === "awaiting_approval")
    ?? run.checkpoints.at(-1)?.blockedStepId;
}

function workflowFailedStepId(run: WorkflowRun): string | undefined {
  return run.order.find((stepId) => run.steps[stepId]?.status === "failed")
    ?? run.checkpoints.at(-1)?.failedStepId;
}
