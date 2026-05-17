import type {
  WorkflowApprovalPolicy,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowStepBudget,
} from "./types";
import { createAgentLoopTaskStep } from "./agent-loop-task";
import { MethodCaste } from "../caste/enums";
import {
  createGitHubPrHandoffWorkflow,
  type GitHubIssueInput,
} from "../github-pr-handoff";

export type WorkflowTaskTemplateKind = "plan" | "execute" | "verify" | "review";

export interface WorkflowTemplateDescriptor {
  id: "agent_loop_linear" | "approval_gated_delivery" | "github_pr_handoff";
  title: string;
  phase: number;
  description: string;
}

export interface WorkflowTaskTemplateOptions {
  id: string;
  objective: string;
  title?: string;
  task?: string;
  dependsOn?: string[];
  maxAttempts?: number;
  budget?: WorkflowStepBudget;
}

export interface LinearAgentLoopWorkflowTaskOptions {
  id: string;
  kind: WorkflowTaskTemplateKind;
  title?: string;
  task?: string;
  maxAttempts?: number;
  budget?: WorkflowStepBudget;
}

export interface LinearAgentLoopWorkflowOptions {
  id: string;
  title: string;
  objective: string;
  version?: string;
  tasks: LinearAgentLoopWorkflowTaskOptions[];
  defaultBudget?: WorkflowStepBudget;
  defaultMaxAttempts?: number;
}

export interface ApprovalGatedDeliveryWorkflowOptions {
  id: string;
  title: string;
  objective: string;
  version?: string;
  requiredApprover?: string;
  approvalReason?: string;
  defaultBudget?: WorkflowStepBudget;
  defaultMaxAttempts?: number;
}

export interface GitHubPrHandoffTemplateOptions {
  id: string;
  issue: GitHubIssueInput;
  workspaceRoot: string;
  requiredApprover?: string;
}

export interface MethodWorkflowOptions {
  id: string;
  objective: string;
  title?: string;
  version?: string;
  requiredApprover?: string;
  defaultBudget?: WorkflowStepBudget;
  defaultMaxAttempts?: number;
}

const TEMPLATE_DESCRIPTORS: WorkflowTemplateDescriptor[] = [
  {
    id: "agent_loop_linear",
    title: "Linear AgentLoop Workflow",
    phase: 3,
    description: "Chains reusable AgentLoop-backed task steps in source order.",
  },
  {
    id: "approval_gated_delivery",
    title: "Approval-Gated Delivery Workflow",
    phase: 3,
    description: "Plans, pauses for operator approval, executes, and verifies delivery.",
  },
  {
    id: "github_pr_handoff",
    title: "Local-First GitHub PR Handoff",
    phase: 6,
    description: "Dry-run issue intake, approval-gated local branch/worktree workflow, verification, and approval-gated PR handoff.",
  },
];

const KIND_TITLES: Record<WorkflowTaskTemplateKind, string> = {
  plan: "Plan",
  execute: "Execute",
  verify: "Verify",
  review: "Review",
};

const KIND_TASK_PREFIX: Record<WorkflowTaskTemplateKind, string> = {
  plan: "Plan the work",
  execute: "Execute the approved work",
  verify: "Verify the result",
  review: "Review the result",
};

export function listWorkflowTemplates(): WorkflowTemplateDescriptor[] {
  return TEMPLATE_DESCRIPTORS.map((template) => ({ ...template }));
}

export function createWorkflowTaskTemplateStep(
  kind: WorkflowTaskTemplateKind,
  options: WorkflowTaskTemplateOptions,
): WorkflowStep {
  const title = options.title ?? KIND_TITLES[kind];
  return createAgentLoopTaskStep({
    id: options.id,
    title,
    task: options.task ?? `${KIND_TASK_PREFIX[kind]}: ${options.objective}`,
    dependsOn: options.dependsOn,
    maxAttempts: options.maxAttempts,
    budget: options.budget,
    metadata: { methodTaskKind: kind },
  });
}

export function createLinearAgentLoopWorkflow(
  options: LinearAgentLoopWorkflowOptions,
): WorkflowDefinition {
  const steps: WorkflowStep[] = [];
  for (const [index, task] of options.tasks.entries()) {
    steps.push(createWorkflowTaskTemplateStep(task.kind, {
      id: task.id,
      title: task.title,
      objective: options.objective,
      task: task.task,
      dependsOn: index === 0 ? undefined : [options.tasks[index - 1].id],
      maxAttempts: task.maxAttempts ?? options.defaultMaxAttempts,
      budget: cloneBudget(task.budget ?? options.defaultBudget),
    }));
  }

  return {
    id: options.id,
    title: options.title,
    version: options.version,
    steps,
  };
}

export function createApprovalGatedDeliveryWorkflow(
  options: ApprovalGatedDeliveryWorkflowOptions,
): WorkflowDefinition {
  const budget = cloneBudget(options.defaultBudget);
  const maxAttempts = options.defaultMaxAttempts;
  const approvalPolicy: WorkflowApprovalPolicy = {
    reason: options.approvalReason ?? `Approval required before executing: ${options.objective}`,
    requiredApprover: options.requiredApprover,
  };

  return {
    id: options.id,
    title: options.title,
    version: options.version,
    steps: [
      createWorkflowTaskTemplateStep("plan", {
        id: "plan",
        objective: options.objective,
        maxAttempts,
        budget,
      }),
      {
        id: "approval",
        title: "Vigil-ant Approval",
        kind: "approval",
        dependsOn: ["plan"],
        approval: approvalPolicy,
        metadata: { methodCaste: MethodCaste.VIGIL_ANT, methodGate: "risk" },
      },
      {
        id: "cost_gate",
        title: "Account-ant Cost Gate",
        kind: "approval",
        dependsOn: ["approval"],
        approval: {
          reason: `Cost and provenance gate required before executing: ${options.objective}`,
          requiredApprover: options.requiredApprover,
        },
        metadata: { methodCaste: MethodCaste.ACCOUNT_ANT, methodGate: "cost" },
      },
      createWorkflowTaskTemplateStep("execute", {
        id: "execute",
        objective: options.objective,
        dependsOn: ["cost_gate"],
        maxAttempts,
        budget,
      }),
      createWorkflowTaskTemplateStep("verify", {
        id: "verify",
        objective: options.objective,
        dependsOn: ["execute"],
        maxAttempts,
        budget,
      }),
    ],
  };
}

export function createStandardMethodWorkflow(options: MethodWorkflowOptions): WorkflowDefinition {
  const budget = cloneBudget(options.defaultBudget);
  const maxAttempts = options.defaultMaxAttempts;
  const steps: WorkflowStep[] = [
    methodTaskStep("assist_intake", "Assist-Ant Intake", MethodCaste.ASSIST_ANT, `Capture user intent: ${options.objective}`, undefined, maxAttempts, budget),
    methodTaskStep("eldest_architecture", "Eldest Architecture Direction", MethodCaste.ELDEST, `Define architecture direction: ${options.objective}`, ["assist_intake"], maxAttempts, budget),
    methodTaskStep("command_plan", "Command-ant Execution Plan", MethodCaste.COMMAND_ANT, `Plan who builds what and when: ${options.objective}`, ["eldest_architecture"], maxAttempts, budget),
    methodApprovalStep("vigil_preflight", "Vigil-ant Preflight", MethodCaste.VIGIL_ANT, `Risk gate before execution: ${options.objective}`, ["command_plan"], options.requiredApprover),
    methodApprovalStep("account_cost_gate", "Account-ant Cost Gate", MethodCaste.ACCOUNT_ANT, `Budget and provenance gate before execution: ${options.objective}`, ["vigil_preflight"], options.requiredApprover),
    methodTaskStep("develop_execute", "Develop-ant Execution", MethodCaste.DEVELOP_ANT, `Execute approved work: ${options.objective}`, ["account_cost_gate"], maxAttempts, budget),
    methodTaskStep("consult_verify", "Consult-ant Verification", MethodCaste.CONSULT_ANT, `Verify behavior and collect evidence: ${options.objective}`, ["develop_execute"], maxAttempts, budget),
    methodApprovalStep("vigil_post_review", "Vigil-ant Post-Review", MethodCaste.VIGIL_ANT, `Review resulting risk: ${options.objective}`, ["consult_verify"], options.requiredApprover),
    methodTaskStep("cogniz_memory", "Cogniz-ant Memory", MethodCaste.COGNIZ_ANT, `Record exact truth and derived knowledge separately: ${options.objective}`, ["vigil_post_review"], maxAttempts, budget),
    methodApprovalStep("queen_decision", "Queen Decision", MethodCaste.QUEEN, `Final decision for completed workflow: ${options.objective}`, ["cogniz_memory"], options.requiredApprover),
    methodTaskStep("assist_closeout", "Assist-Ant Closeout", MethodCaste.ASSIST_ANT, `Explain the approved result to the user: ${options.objective}`, ["queen_decision"], maxAttempts, budget),
  ];

  return {
    id: options.id,
    title: options.title ?? "12-Caste Standard Method Workflow",
    version: options.version,
    steps,
  };
}

export function createSwarmMethodWorkflow(options: MethodWorkflowOptions): WorkflowDefinition {
  const budget = cloneBudget(options.defaultBudget);
  const maxAttempts = options.defaultMaxAttempts;
  return {
    id: options.id,
    title: options.title ?? "12-Caste Swarm Method Workflow",
    version: options.version,
    steps: [
      methodTaskStep("command_coordinate", "Command-ant Coordination", MethodCaste.COMMAND_ANT, `Prepare bounded swarm packets: ${options.objective}`, undefined, maxAttempts, budget),
      methodApprovalStep("vigil_fanout_gate", "Vigil-ant Fanout Gate", MethodCaste.VIGIL_ANT, `Approve restricted fanout: ${options.objective}`, ["command_coordinate"], options.requiredApprover),
      methodTaskStep("oper_fanout", "Oper-ant Fanout", MethodCaste.OPER_ANT, `Execute narrow worker packets only: ${options.objective}`, ["vigil_fanout_gate"], maxAttempts, budget),
      methodTaskStep("consult_aggregate", "Consult-ant Aggregation", MethodCaste.CONSULT_ANT, `Aggregate worker evidence: ${options.objective}`, ["oper_fanout"], maxAttempts, budget),
      methodTaskStep("eldest_synthesis", "Eldest Synthesis", MethodCaste.ELDEST, `Synthesize technical recommendation: ${options.objective}`, ["consult_aggregate"], maxAttempts, budget),
      methodApprovalStep("vigil_review", "Vigil-ant Review", MethodCaste.VIGIL_ANT, `Review swarm risk and evidence: ${options.objective}`, ["eldest_synthesis"], options.requiredApprover),
      methodApprovalStep("queen_decision", "Queen Decision", MethodCaste.QUEEN, `Decide final swarm outcome: ${options.objective}`, ["vigil_review"], options.requiredApprover),
    ],
  };
}

export function createGitHubPrHandoffTemplateWorkflow(
  options: GitHubPrHandoffTemplateOptions,
): WorkflowDefinition {
  return createGitHubPrHandoffWorkflow({
    id: options.id,
    issue: options.issue,
    workspaceRoot: options.workspaceRoot,
    requiredApprover: options.requiredApprover,
  });
}

function cloneBudget(budget: WorkflowStepBudget | undefined): WorkflowStepBudget | undefined {
  return budget ? { ...budget } : undefined;
}

function methodTaskStep(
  id: string,
  title: string,
  methodCaste: MethodCaste,
  task: string,
  dependsOn: string[] | undefined,
  maxAttempts: number | undefined,
  budget: WorkflowStepBudget | undefined,
): WorkflowStep {
  return createAgentLoopTaskStep({
    id,
    title,
    task,
    dependsOn,
    maxAttempts,
    budget: cloneBudget(budget),
    metadata: { methodCaste },
  });
}

function methodApprovalStep(
  id: string,
  title: string,
  methodCaste: MethodCaste,
  reason: string,
  dependsOn: string[] | undefined,
  requiredApprover: string | undefined,
): WorkflowStep {
  return {
    id,
    title,
    kind: "approval",
    dependsOn,
    approval: { reason, requiredApprover },
    metadata: { methodCaste },
  };
}
