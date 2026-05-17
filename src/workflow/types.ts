export type WorkflowStepKind = "task" | "approval";

export type WorkflowRunStatus = "pending" | "running" | "paused" | "completed" | "failed";

export type WorkflowStepStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed";

export interface WorkflowStep {
  id: string;
  title: string;
  kind: WorkflowStepKind;
  dependsOn?: string[];
  maxAttempts?: number;
  budget?: WorkflowStepBudget;
  approval?: WorkflowApprovalPolicy;
  agentLoop?: WorkflowAgentLoopTask;
  metadata?: Record<string, unknown>;
}

export interface WorkflowStepBudget {
  estimatedTokens?: number;
  estimatedUsd?: number;
}

export interface WorkflowApprovalPolicy {
  reason?: string;
  requiredApprover?: string;
}

export interface WorkflowAgentLoopTask {
  task: string;
}

export interface WorkflowDefinition {
  id: string;
  title: string;
  version?: string;
  steps: WorkflowStep[];
}

export interface WorkflowValidationResult {
  ok: boolean;
  errors: string[];
  order: string[];
}

export interface WorkflowStepState {
  id: string;
  status: WorkflowStepStatus;
  attempts: number;
  startedAt?: number;
  completedAt?: number;
  lastError?: string;
  summary?: string;
  approvedBy?: string;
  approvedAt?: number;
}

export interface WorkflowArtifactInput {
  type: "markdown" | "json" | "text" | "file" | string;
  name: string;
  content?: string;
  uri?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowArtifact extends WorkflowArtifactInput {
  id: string;
  stepId: string;
  createdAt: number;
}

export interface WorkflowCheckpoint {
  id: string;
  runId: string;
  status: WorkflowRunStatus;
  completedStepIds: string[];
  artifactIds: string[];
  blockedStepId?: string;
  failedStepId?: string;
  createdAt: number;
}

export interface WorkflowRun {
  id: string;
  definitionId: string;
  definition: WorkflowDefinition;
  status: WorkflowRunStatus;
  order: string[];
  steps: Record<string, WorkflowStepState>;
  artifacts: WorkflowArtifact[];
  checkpoints: WorkflowCheckpoint[];
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowStepHandlerInput {
  run: WorkflowRun;
  step: WorkflowStep;
  attempt: number;
}

export interface WorkflowStepResult {
  summary?: string;
  artifacts?: WorkflowArtifactInput[];
}

export type WorkflowStepHandler = (input: WorkflowStepHandlerInput) => Promise<WorkflowStepResult> | WorkflowStepResult;

export type WorkflowStepHandlers = Record<string, WorkflowStepHandler>;

export interface WorkflowBudgetPolicyInput {
  run: WorkflowRun;
  step: WorkflowStep;
}

export interface WorkflowBudgetPolicyDecision {
  allowed: boolean;
  reason?: string;
  recommendation?: string;
}

export interface WorkflowBudgetPolicy {
  evaluateStep(input: WorkflowBudgetPolicyInput): Promise<WorkflowBudgetPolicyDecision> | WorkflowBudgetPolicyDecision;
  recordStepSpend?(input: WorkflowBudgetPolicyInput): Promise<void> | void;
}

export interface WorkflowStore {
  saveRun(run: WorkflowRun): Promise<void>;
  loadRun(runId: string): Promise<WorkflowRun | null>;
}
