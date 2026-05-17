import type { WorkflowRuntimeHook } from "./runner";
import {
  WorkflowRuntimeRunner,
  workflowRunToRuntimeSnapshot,
} from "./runner";
import type { RuntimeWorkflowRunSnapshot } from "../runtime/runtime-snapshot";
import type {
  WorkflowDefinition,
  WorkflowStepHandlers,
} from "./types";
import { WorkflowEngine } from "./engine";
import {
  createApprovalGatedDeliveryWorkflow,
  createGitHubPrHandoffTemplateWorkflow,
  createLinearAgentLoopWorkflow,
  listWorkflowTemplates,
  type LinearAgentLoopWorkflowTaskOptions,
  type WorkflowTemplateDescriptor,
} from "./templates";
import type { GitHubIssueInput } from "../github-pr-handoff";

export type WorkflowAutomationCommand =
  | WorkflowAutomationListTemplatesCommand
  | WorkflowAutomationStartTemplateCommand
  | WorkflowAutomationApproveCommand
  | WorkflowAutomationInspectCommand;

export interface WorkflowAutomationListTemplatesCommand {
  type: "list_templates";
  requestId: string;
}

export interface WorkflowAutomationStartTemplateCommand {
  type: "start_template";
  requestId: string;
  templateId: "agent_loop_linear" | "approval_gated_delivery" | "github_pr_handoff";
  workflowId: string;
  title: string;
  objective: string;
  requiredApprover?: string;
  tasks?: LinearAgentLoopWorkflowTaskOptions[];
  githubIssue?: GitHubIssueInput;
  workspaceRoot?: string;
}

export interface WorkflowAutomationApproveCommand {
  type: "approve";
  requestId: string;
  runId: string;
  stepId: string;
  approvedBy: string;
}

export interface WorkflowAutomationInspectCommand {
  type: "inspect";
  requestId: string;
  runId: string;
}

export interface WorkflowAutomationResponse {
  ok: boolean;
  requestId: string;
  type: WorkflowAutomationCommand["type"];
  snapshot?: RuntimeWorkflowRunSnapshot;
  templates?: WorkflowTemplateDescriptor[];
  error?: string;
}

export interface WorkflowAutomationControllerOptions {
  engine: WorkflowEngine;
  handlers?: WorkflowStepHandlers;
  hooks?: WorkflowRuntimeHook[];
}

export class WorkflowAutomationController {
  private readonly _engine: WorkflowEngine;
  private readonly _handlers: WorkflowStepHandlers;
  private readonly _hooks: WorkflowRuntimeHook[];

  constructor(options: WorkflowAutomationControllerOptions) {
    this._engine = options.engine;
    this._handlers = options.handlers ?? {};
    this._hooks = options.hooks ?? [];
  }

  async handle(command: WorkflowAutomationCommand): Promise<WorkflowAutomationResponse> {
    try {
      switch (command.type) {
        case "list_templates":
          return {
            ok: true,
            requestId: command.requestId,
            type: command.type,
            templates: listWorkflowTemplates(),
          };
        case "start_template":
          return await this._startTemplate(command);
        case "approve":
          return await this._approve(command);
        case "inspect":
          return await this._inspect(command);
      }
    } catch (error) {
      return {
        ok: false,
        requestId: command.requestId,
        type: command.type,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async _startTemplate(command: WorkflowAutomationStartTemplateCommand): Promise<WorkflowAutomationResponse> {
    const runner = this._runner();
    const definition = this._definitionFor(command);
    const run = await runner.startAndRun(definition, this._handlers);
    return {
      ok: true,
      requestId: command.requestId,
      type: command.type,
      snapshot: workflowRunToRuntimeSnapshot(run),
    };
  }

  private async _approve(command: WorkflowAutomationApproveCommand): Promise<WorkflowAutomationResponse> {
    const runner = this._runner();
    const run = await runner.approveAndRun(
      command.runId,
      command.stepId,
      command.approvedBy,
      this._handlers,
    );
    return {
      ok: true,
      requestId: command.requestId,
      type: command.type,
      snapshot: workflowRunToRuntimeSnapshot(run),
    };
  }

  private async _inspect(command: WorkflowAutomationInspectCommand): Promise<WorkflowAutomationResponse> {
    const run = await this._engine.loadRun(command.runId);
    if (!run) throw new Error(`Workflow run not found: ${command.runId}`);
    return {
      ok: true,
      requestId: command.requestId,
      type: command.type,
      snapshot: workflowRunToRuntimeSnapshot(run),
    };
  }

  private _definitionFor(command: WorkflowAutomationStartTemplateCommand): WorkflowDefinition {
    if (command.templateId === "github_pr_handoff") {
      if (!command.githubIssue) throw new Error("githubIssue is required for github_pr_handoff");
      if (!command.workspaceRoot?.trim()) throw new Error("workspaceRoot is required for github_pr_handoff");
      return createGitHubPrHandoffTemplateWorkflow({
        id: command.workflowId,
        issue: command.githubIssue,
        workspaceRoot: command.workspaceRoot,
        requiredApprover: command.requiredApprover,
      });
    }

    if (command.templateId === "approval_gated_delivery") {
      return createApprovalGatedDeliveryWorkflow({
        id: command.workflowId,
        title: command.title,
        objective: command.objective,
        requiredApprover: command.requiredApprover,
      });
    }

    return createLinearAgentLoopWorkflow({
      id: command.workflowId,
      title: command.title,
      objective: command.objective,
      tasks: command.tasks && command.tasks.length > 0
        ? command.tasks
        : [
            { id: "plan", kind: "plan" },
            { id: "execute", kind: "execute" },
            { id: "verify", kind: "verify" },
          ],
    });
  }

  private _runner(): WorkflowRuntimeRunner {
    return new WorkflowRuntimeRunner({
      engine: this._engine,
      hooks: this._hooks,
    });
  }
}
