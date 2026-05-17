import type { AgentLoop, LoopResult } from "../runtime/loop";
import type {
  WorkflowArtifactInput,
  WorkflowStep,
  WorkflowStepBudget,
  WorkflowStepHandler,
  WorkflowStepHandlerInput,
  WorkflowStepResult,
} from "./types";

export interface AgentLoopWorkflowStepOptions {
  id: string;
  title: string;
  task: string;
  dependsOn?: string[];
  maxAttempts?: number;
  budget?: WorkflowStepBudget;
  metadata?: Record<string, unknown>;
}

export interface AgentLoopWorkflowHandlerOptions {
  createLoop: (input: WorkflowStepHandlerInput) => AgentLoop | Promise<AgentLoop>;
  prompt?: (input: WorkflowStepHandlerInput) => string;
  artifactName?: string;
  includeResultArtifact?: boolean;
}

export function createAgentLoopTaskStep(options: AgentLoopWorkflowStepOptions): WorkflowStep {
  return {
    id: options.id,
    title: options.title,
    kind: "task",
    dependsOn: options.dependsOn ? [...options.dependsOn] : undefined,
    maxAttempts: options.maxAttempts,
    budget: options.budget ? { ...options.budget } : undefined,
    agentLoop: { task: options.task },
    metadata: options.metadata ? { ...options.metadata } : undefined,
  };
}

export function createAgentLoopWorkflowHandler(
  options: AgentLoopWorkflowHandlerOptions,
): WorkflowStepHandler {
  return async (input): Promise<WorkflowStepResult> => {
    const loop = await Promise.resolve(options.createLoop(input));
    const prompt = options.prompt ? options.prompt(input) : formatAgentLoopWorkflowPrompt(input);
    const result = await loop.run(prompt);

    if (result.terminationReason === "error" || result.terminationReason === "cost_exceeded") {
      throw new Error(result.error ?? `AgentLoop workflow task failed: ${result.terminationReason}`);
    }

    const artifacts: WorkflowArtifactInput[] = [];
    if (options.includeResultArtifact !== false) {
      artifacts.push({
        type: "json",
        name: options.artifactName ?? `${input.step.id}-agent-loop-result.json`,
        content: JSON.stringify(agentLoopWorkflowResultArtifact(result)),
      });
    }

    return {
      summary: result.finalContent || `AgentLoop completed: ${result.terminationReason}`,
      artifacts,
    };
  };
}

export function formatAgentLoopWorkflowPrompt(input: WorkflowStepHandlerInput): string {
  const task = input.step.agentLoop?.task ?? input.step.title;
  const completedDependencies = (input.step.dependsOn ?? [])
    .filter((stepId) => input.run.steps[stepId]?.status === "completed");

  const lines = [
    `Workflow: ${input.run.definition.title}`,
    `Workflow ID: ${input.run.id}`,
    `Step: ${input.step.title}`,
    `Step ID: ${input.step.id}`,
    `Attempt: ${input.attempt}`,
    `Task: ${task}`,
  ];
  if (completedDependencies.length > 0) {
    lines.push(`Completed dependencies: ${completedDependencies.join(", ")}`);
  }
  return lines.join("\n");
}

function agentLoopWorkflowResultArtifact(result: LoopResult): Record<string, unknown> {
  return {
    terminationReason: result.terminationReason,
    iterations: result.iterations,
    totalTokens: result.totalTokens,
    estimatedCostUsd: result.estimatedCostUsd,
    toolCallsExecuted: result.toolCallsExecuted,
    finalContent: result.finalContent,
    error: result.error,
  };
}
