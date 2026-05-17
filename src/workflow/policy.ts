import { SessionBudget } from "../llm/budget-gate";
import type {
  WorkflowBudgetPolicy,
  WorkflowBudgetPolicyDecision,
  WorkflowBudgetPolicyInput,
} from "./types";

export interface WorkflowSessionBudgetPolicyOptions {
  maxTokens?: number;
  maxUsd?: number;
  sessionId?: string;
}

export class WorkflowSessionBudgetPolicy implements WorkflowBudgetPolicy {
  private readonly _budget: SessionBudget;

  constructor(options: WorkflowSessionBudgetPolicyOptions = {}) {
    this._budget = new SessionBudget(options);
  }

  get stats(): Record<string, unknown> {
    return this._budget.getStats();
  }

  evaluateStep(input: WorkflowBudgetPolicyInput): WorkflowBudgetPolicyDecision {
    const estimate = input.step.budget ?? {};
    const result = this._budget.canSpend(
      estimate.estimatedTokens ?? 0,
      estimate.estimatedUsd ?? 0,
    );
    return {
      allowed: result.allowed,
      reason: result.reason,
      recommendation: result.recommendation,
    };
  }

  recordStepSpend(input: WorkflowBudgetPolicyInput): void {
    const estimate = input.step.budget ?? {};
    this._budget.recordSpend(
      estimate.estimatedTokens ?? 0,
      estimate.estimatedUsd ?? 0,
    );
  }
}
