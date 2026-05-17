import { randomUUID } from "crypto";

import {
  type AgentWorkerRole,
  type AgentWorkerSnapshot,
  ColonyAgentRegistry,
} from "../agents";
import { SessionBudget } from "../llm/budget-gate";
import {
  PolicyDecision,
  type SecurityPolicyEngine,
} from "../security/policy";

export type CoordinatorTaskStatus =
  | "queued"
  | "assigned"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";

export type InterAgentMessageKind =
  | "status"
  | "handoff"
  | "question"
  | "result"
  | (string & {});

export type InterAgentMessageStatus =
  | "delivered"
  | "read"
  | "failed";

export interface CoordinatorTaskResult {
  summary: string;
  completedAt: string;
}

export interface CoordinatorTaskBudget {
  estimatedTokens?: number;
  estimatedUsd?: number;
}

export interface CoordinatorApprovalPolicy {
  reason?: string;
  requiredApprover?: string;
}

export interface CoordinatorSecurityIntent {
  action: string;
  resource: string;
  metadata?: Record<string, unknown>;
}

export type CoordinatorPolicyDecisionSource =
  | "budget"
  | "approval"
  | "security";

export type CoordinatorPolicyDecisionStatus =
  | "allowed"
  | "denied"
  | "awaiting_approval"
  | "audit";

export interface CoordinatorPolicyDecisionSnapshot {
  source: CoordinatorPolicyDecisionSource;
  status: CoordinatorPolicyDecisionStatus;
  allowed: boolean;
  reason?: string;
  recommendation?: string;
  matchedRule?: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface CoordinatorAwaitingApprovalSnapshot {
  reason?: string;
  requiredApprover?: string;
  requestedAt: string;
}

export type CoordinatorExecutionStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface CoordinatorTaskSnapshot {
  taskId: string;
  title: string;
  objective: string;
  requiredRole?: AgentWorkerRole;
  priority: number;
  status: CoordinatorTaskStatus;
  assignedWorkerId?: string;
  budget?: CoordinatorTaskBudget;
  approval?: CoordinatorApprovalPolicy;
  security?: CoordinatorSecurityIntent;
  policyDecisions: CoordinatorPolicyDecisionSnapshot[];
  awaitingApproval?: CoordinatorAwaitingApprovalSnapshot;
  result?: CoordinatorTaskResult;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface EnqueueCoordinatorTaskOptions {
  title: string;
  objective: string;
  requiredRole?: AgentWorkerRole;
  priority?: number;
  budget?: CoordinatorTaskBudget;
  approval?: CoordinatorApprovalPolicy;
  security?: CoordinatorSecurityIntent;
  metadata?: Record<string, unknown>;
}

export interface FanOutExecutionChildOptions extends EnqueueCoordinatorTaskOptions {}

export interface StartFanOutExecutionOptions {
  title: string;
  objective: string;
  children: FanOutExecutionChildOptions[];
  metadata?: Record<string, unknown>;
}

export interface CoordinatorTaskFilter {
  status?: CoordinatorTaskStatus;
  workerId?: string;
  requiredRole?: AgentWorkerRole;
}

export interface CoordinatorTaskAssignment {
  task: CoordinatorTaskSnapshot;
  worker: AgentWorkerSnapshot;
}

export interface CoordinatorExecutionSnapshot {
  executionId: string;
  title: string;
  objective: string;
  status: CoordinatorExecutionStatus;
  taskIds: string[];
  completedTaskIds: string[];
  failedTaskIds: string[];
  cancelledTaskIds: string[];
  result?: CoordinatorTaskResult;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface FanOutDispatchResult {
  execution: CoordinatorExecutionSnapshot;
  assignments: CoordinatorTaskAssignment[];
}

export interface InterAgentMessageSnapshot {
  messageId: string;
  fromWorkerId: string;
  toWorkerId: string;
  kind: InterAgentMessageKind;
  content: string;
  status: InterAgentMessageStatus;
  taskId?: string;
  failureReason?: string;
  createdAt: string;
  readAt?: string;
  metadata: Record<string, unknown>;
}

export interface SendInterAgentMessageOptions {
  fromWorkerId: string;
  toWorkerId: string;
  kind: InterAgentMessageKind;
  content: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
}

export interface CoordinatorBudgetPolicyDecision {
  allowed: boolean;
  reason?: string;
  recommendation?: string;
}

export interface CoordinatorBudgetPolicyInput {
  task: CoordinatorTaskSnapshot;
  worker: AgentWorkerSnapshot;
}

export interface CoordinatorBudgetPolicy {
  evaluateTask(input: CoordinatorBudgetPolicyInput): CoordinatorBudgetPolicyDecision;
  recordTaskSpend?(input: CoordinatorBudgetPolicyInput): void;
}

export interface CoordinatorSessionBudgetPolicyOptions {
  maxTokens?: number;
  maxUsd?: number;
  sessionId?: string;
}

export interface ColonyCoordinatorOptions {
  registry?: ColonyAgentRegistry;
  budgetPolicy?: CoordinatorBudgetPolicy;
  securityPolicy?: SecurityPolicyEngine;
}

interface CoordinatorTaskRecord {
  taskId: string;
  title: string;
  objective: string;
  requiredRole?: AgentWorkerRole;
  priority: number;
  status: CoordinatorTaskStatus;
  assignedWorkerId?: string;
  budget?: CoordinatorTaskBudget;
  approval?: CoordinatorApprovalPolicy;
  security?: CoordinatorSecurityIntent;
  policyDecisions: CoordinatorPolicyDecisionSnapshot[];
  awaitingApproval?: CoordinatorAwaitingApprovalSnapshot;
  result?: CoordinatorTaskResult;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

interface CoordinatorExecutionRecord {
  executionId: string;
  title: string;
  objective: string;
  status: CoordinatorExecutionStatus;
  taskIds: string[];
  result?: CoordinatorTaskResult;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

interface InterAgentMessageRecord {
  messageId: string;
  fromWorkerId: string;
  toWorkerId: string;
  kind: InterAgentMessageKind;
  content: string;
  status: InterAgentMessageStatus;
  taskId?: string;
  failureReason?: string;
  createdAt: string;
  readAt?: string;
  metadata: Record<string, unknown>;
}

export class ColonyCoordinator {
  readonly registry: ColonyAgentRegistry;
  private readonly _budgetPolicy?: CoordinatorBudgetPolicy;
  private readonly _securityPolicy?: SecurityPolicyEngine;
  private readonly _executions = new Map<string, CoordinatorExecutionRecord>();
  private readonly _tasks = new Map<string, CoordinatorTaskRecord>();
  private readonly _messages = new Map<string, InterAgentMessageRecord>();

  constructor(options: ColonyCoordinatorOptions = {}) {
    this.registry = options.registry ?? new ColonyAgentRegistry();
    this._budgetPolicy = options.budgetPolicy;
    this._securityPolicy = options.securityPolicy;
  }

  enqueueTask(options: EnqueueCoordinatorTaskOptions): CoordinatorTaskSnapshot {
    const now = new Date().toISOString();
    const task: CoordinatorTaskRecord = {
      taskId: newTaskId(),
      title: options.title,
      objective: options.objective,
      requiredRole: options.requiredRole,
      priority: options.priority ?? 0,
      status: "queued",
      budget: options.budget ? { ...options.budget } : undefined,
      approval: options.approval ? { ...options.approval } : undefined,
      security: options.security
        ? {
            ...options.security,
            metadata: { ...options.security.metadata },
          }
        : undefined,
      policyDecisions: [],
      createdAt: now,
      updatedAt: now,
      metadata: { ...options.metadata },
    };
    this._tasks.set(task.taskId, task);
    return snapshotTask(task);
  }

  listTasks(filter: CoordinatorTaskFilter = {}): CoordinatorTaskSnapshot[] {
    return [...this._tasks.values()]
      .filter((task) => {
        if (filter.status && task.status !== filter.status) return false;
        if (filter.workerId && task.assignedWorkerId !== filter.workerId) return false;
        if (filter.requiredRole && task.requiredRole !== filter.requiredRole) return false;
        return true;
      })
      .sort((left, right) => {
        if (right.priority !== left.priority) return right.priority - left.priority;
        return left.createdAt.localeCompare(right.createdAt);
      })
      .map(snapshotTask);
  }

  inspectTask(taskId: string): CoordinatorTaskSnapshot | null {
    const task = this._tasks.get(taskId);
    return task ? snapshotTask(task) : null;
  }

  claimNextTask(workerId: string): CoordinatorTaskAssignment | null {
    return this._claimNextQueuedTask(workerId);
  }

  approveTask(taskId: string, approvedBy: string): CoordinatorTaskSnapshot {
    const task = this._tasks.get(taskId);
    if (!task) return snapshotTask(failedTask(taskId, `Task not found: ${taskId}`));
    if (!task.approval) return snapshotTask(task);

    if (task.approval.requiredApprover && task.approval.requiredApprover !== approvedBy) {
      task.status = "blocked";
      task.failureReason = `Task ${taskId} requires approver ${task.approval.requiredApprover}`;
      task.updatedAt = new Date().toISOString();
      return snapshotTask(task);
    }

    const approvedAt = new Date().toISOString();
    task.status = "queued";
    task.failureReason = undefined;
    task.awaitingApproval = undefined;
    task.policyDecisions = [
      {
        source: "approval",
        status: "allowed",
        allowed: true,
        reason: task.approval.reason,
        approvedBy,
        approvedAt,
      },
      ...task.policyDecisions.filter((decision) => decision.source !== "approval"),
    ];
    task.updatedAt = approvedAt;
    return snapshotTask(task);
  }

  startFanOutExecution(options: StartFanOutExecutionOptions): CoordinatorExecutionSnapshot {
    const now = new Date().toISOString();
    const execution: CoordinatorExecutionRecord = {
      executionId: newExecutionId(),
      title: options.title,
      objective: options.objective,
      status: options.children.length > 0 ? "running" : "completed",
      taskIds: [],
      createdAt: now,
      updatedAt: now,
      metadata: { ...options.metadata },
    };
    this._executions.set(execution.executionId, execution);

    for (const child of options.children) {
      const task = this.enqueueTask({
        ...child,
        metadata: {
          ...child.metadata,
          executionId: execution.executionId,
        },
      });
      execution.taskIds.push(task.taskId);
    }

    return this._snapshotExecution(execution);
  }

  inspectExecution(executionId: string): CoordinatorExecutionSnapshot | null {
    const execution = this._executions.get(executionId);
    return execution ? this._snapshotExecution(execution) : null;
  }

  listExecutionTasks(
    executionId: string,
    filter: CoordinatorTaskFilter = {},
  ): CoordinatorTaskSnapshot[] {
    const execution = this._executions.get(executionId);
    if (!execution) return [];

    return execution.taskIds
      .map((taskId) => this._tasks.get(taskId))
      .filter((task): task is CoordinatorTaskRecord => Boolean(task))
      .filter((task) => {
        if (filter.status && task.status !== filter.status) return false;
        if (filter.workerId && task.assignedWorkerId !== filter.workerId) return false;
        if (filter.requiredRole && task.requiredRole !== filter.requiredRole) return false;
        return true;
      })
      .sort((left, right) => {
        if (right.priority !== left.priority) return right.priority - left.priority;
        return left.createdAt.localeCompare(right.createdAt);
      })
      .map(snapshotTask);
  }

  dispatchFanOutExecution(
    executionId: string,
    workerIds: string[],
  ): FanOutDispatchResult {
    const execution = this._executions.get(executionId);
    if (!execution || execution.status !== "running") {
      return {
        execution: execution
          ? this._snapshotExecution(execution)
          : this._missingExecution(executionId),
        assignments: [],
      };
    }

    const assignments: CoordinatorTaskAssignment[] = [];
    const scopedTaskIds = new Set(execution.taskIds);
    for (const workerId of workerIds) {
      const assignment = this._claimNextQueuedTask(workerId, scopedTaskIds);
      if (assignment) assignments.push(assignment);
    }
    execution.updatedAt = new Date().toISOString();

    return {
      execution: this._snapshotExecution(execution),
      assignments,
    };
  }

  collectFanIn(executionId: string): CoordinatorExecutionSnapshot {
    const execution = this._executions.get(executionId);
    if (!execution) return this._missingExecution(executionId);

    const tasks = this._executionTaskRecords(execution);
    const failed = tasks.filter((task) => task.status === "failed");
    const cancelled = tasks.filter((task) => task.status === "cancelled");
    const completed = tasks.filter((task) => task.status === "completed");

    if (cancelled.length > 0) {
      execution.status = "cancelled";
      execution.failureReason = execution.failureReason ?? "Fan-out execution has cancelled children";
      execution.updatedAt = new Date().toISOString();
      return this._snapshotExecution(execution);
    }

    if (failed.length > 0) {
      execution.status = "failed";
      execution.failureReason = failed.map((task) => task.failureReason ?? `${task.taskId} failed`).join("; ");
      execution.updatedAt = new Date().toISOString();
      return this._snapshotExecution(execution);
    }

    if (tasks.length === completed.length) {
      execution.status = "completed";
      execution.result = {
        summary: completed
          .map((task) => task.result?.summary ?? `${task.title} complete`)
          .join("\n"),
        completedAt: new Date().toISOString(),
      };
      execution.failureReason = undefined;
      execution.updatedAt = new Date().toISOString();
      return this._snapshotExecution(execution);
    }

    execution.status = "running";
    execution.updatedAt = new Date().toISOString();
    return this._snapshotExecution(execution);
  }

  cancelExecution(executionId: string, reason: string): CoordinatorExecutionSnapshot {
    const execution = this._executions.get(executionId);
    if (!execution) return this._missingExecution(executionId);

    const now = new Date().toISOString();
    for (const task of this._executionTaskRecords(execution)) {
      if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
        continue;
      }
      task.status = "cancelled";
      task.failureReason = reason;
      task.updatedAt = now;
      if (task.assignedWorkerId) {
        this.registry.stopWorker(task.assignedWorkerId, reason);
      }
    }

    execution.status = "cancelled";
    execution.failureReason = reason;
    execution.updatedAt = now;
    return this._snapshotExecution(execution);
  }

  private _claimNextQueuedTask(
    workerId: string,
    scopedTaskIds?: Set<string>,
  ): CoordinatorTaskAssignment | null {
    const worker = this.registry.inspectWorker(workerId);
    if (!worker || worker.state === "failed" || worker.state === "stopped") return null;

    const task = [...this._tasks.values()]
      .filter((candidate) => candidate.status === "queued")
      .filter((candidate) => !scopedTaskIds || scopedTaskIds.has(candidate.taskId))
      .filter((candidate) => !candidate.requiredRole || candidate.requiredRole === worker.role)
      .sort((left, right) => {
        if (right.priority !== left.priority) return right.priority - left.priority;
        return left.createdAt.localeCompare(right.createdAt);
      })
      .find((candidate) => this._prepareTaskForAssignment(candidate, worker));
    if (!task) return null;

    task.status = "assigned";
    task.assignedWorkerId = workerId;
    task.updatedAt = new Date().toISOString();

    const runningWorker = this.registry.startWorkerTask(workerId, {
      taskId: task.taskId,
      summary: task.title,
    });
    this._recordBudgetSpend(task, runningWorker);
    return {
      task: snapshotTask(task),
      worker: runningWorker,
    };
  }

  completeTask(taskId: string, workerId: string, summary: string): CoordinatorTaskSnapshot {
    const task = this._assignedTaskOrFailed(taskId, workerId);
    if (task.status === "failed") return snapshotTask(task);

    task.status = "completed";
    task.result = {
      summary,
      completedAt: new Date().toISOString(),
    };
    task.failureReason = undefined;
    task.updatedAt = new Date().toISOString();
    this.registry.completeWorkerTask(workerId, summary);
    return snapshotTask(task);
  }

  failTask(taskId: string, workerId: string, reason: string): CoordinatorTaskSnapshot {
    const task = this._assignedTaskOrFailed(taskId, workerId);
    task.status = "failed";
    task.failureReason = reason;
    task.updatedAt = new Date().toISOString();
    this.registry.pauseWorker(workerId, reason);
    this.registry.completeWorkerTask(workerId, reason);
    this.registry.stopWorker(workerId, reason);
    return snapshotTask(task);
  }

  sendMessage(options: SendInterAgentMessageOptions): InterAgentMessageSnapshot {
    const now = new Date().toISOString();
    const message: InterAgentMessageRecord = {
      messageId: newMessageId(),
      fromWorkerId: options.fromWorkerId,
      toWorkerId: options.toWorkerId,
      kind: options.kind,
      content: options.content,
      status: "delivered",
      taskId: options.taskId,
      createdAt: now,
      metadata: { ...options.metadata },
    };

    if (!this.registry.inspectWorker(options.fromWorkerId)) {
      message.status = "failed";
      message.failureReason = `Unknown sender worker: ${options.fromWorkerId}`;
    } else if (!this.registry.inspectWorker(options.toWorkerId)) {
      message.status = "failed";
      message.failureReason = `Unknown recipient worker: ${options.toWorkerId}`;
    }

    this._messages.set(message.messageId, message);
    return snapshotMessage(message);
  }

  inbox(workerId: string): InterAgentMessageSnapshot[] {
    return [...this._messages.values()]
      .filter((message) => message.toWorkerId === workerId && message.status !== "failed")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(snapshotMessage);
  }

  outbox(workerId: string): InterAgentMessageSnapshot[] {
    return [...this._messages.values()]
      .filter((message) => message.fromWorkerId === workerId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(snapshotMessage);
  }

  markMessageRead(messageId: string, workerId: string): InterAgentMessageSnapshot | null {
    const message = this._messages.get(messageId);
    if (!message || message.toWorkerId !== workerId || message.status === "failed") return null;
    message.status = "read";
    message.readAt = new Date().toISOString();
    return snapshotMessage(message);
  }

  private _assignedTaskOrFailed(taskId: string, workerId: string): CoordinatorTaskRecord {
    const task = this._tasks.get(taskId);
    if (!task) return failedTask(taskId, `Task not found: ${taskId}`);
    if (task.assignedWorkerId !== workerId || task.status !== "assigned") {
      task.status = "failed";
      task.failureReason = `Task ${taskId} is not assigned to worker ${workerId}`;
      task.updatedAt = new Date().toISOString();
    }
    return task;
  }

  private _prepareTaskForAssignment(
    task: CoordinatorTaskRecord,
    worker: AgentWorkerSnapshot,
  ): boolean {
    if (!this._evaluateApprovalPolicy(task)) return false;
    if (!this._evaluateBudgetPolicy(task, worker)) return false;
    if (!this._evaluateSecurityPolicy(task, worker)) return false;
    return task.status === "queued";
  }

  private _evaluateApprovalPolicy(task: CoordinatorTaskRecord): boolean {
    if (!task.approval) return true;
    const existingApproval = task.policyDecisions.find((decision) =>
      decision.source === "approval" && decision.allowed,
    );
    if (existingApproval) return true;

    task.status = "blocked";
    task.failureReason = undefined;
    task.awaitingApproval = {
      reason: task.approval.reason,
      requiredApprover: task.approval.requiredApprover,
      requestedAt: new Date().toISOString(),
    };
    task.policyDecisions = [
      {
        source: "approval",
        status: "awaiting_approval",
        allowed: false,
        reason: task.approval.reason ?? "Approval required before assignment",
      },
      ...task.policyDecisions.filter((decision) => decision.source !== "approval"),
    ];
    task.updatedAt = new Date().toISOString();
    return false;
  }

  private _evaluateBudgetPolicy(
    task: CoordinatorTaskRecord,
    worker: AgentWorkerSnapshot,
  ): boolean {
    if (!this._budgetPolicy || !task.budget) return true;
    const decision = this._budgetPolicy.evaluateTask({
      task: snapshotTask(task),
      worker,
    });
    task.policyDecisions = [
      {
        source: "budget",
        status: decision.allowed ? "allowed" : "denied",
        allowed: decision.allowed,
        reason: decision.reason,
        recommendation: decision.recommendation,
      },
      ...task.policyDecisions.filter((entry) => entry.source !== "budget"),
    ];
    if (decision.allowed) return true;

    task.status = "failed";
    task.failureReason = decision.reason
      ? `Coordinator budget denied: ${decision.reason}`
      : "Coordinator budget denied";
    task.updatedAt = new Date().toISOString();
    return false;
  }

  private _evaluateSecurityPolicy(
    task: CoordinatorTaskRecord,
    worker: AgentWorkerSnapshot,
  ): boolean {
    if (!this._securityPolicy || !task.security) return true;
    const evaluation = this._securityPolicy.evaluate({
      actorCaste: worker.caste,
      actorAgentId: worker.agentId,
      action: task.security.action,
      resource: task.security.resource,
      metadata: {
        workerId: worker.workerId,
        taskId: task.taskId,
        ...task.security.metadata,
      },
    });
    const allowed = evaluation.decision !== PolicyDecision.DENY;
    task.policyDecisions = [
      {
        source: "security",
        status: evaluation.decision === PolicyDecision.AUDIT ? "audit" : allowed ? "allowed" : "denied",
        allowed,
        reason: evaluation.reason,
        matchedRule: evaluation.matchedRule ?? undefined,
      },
      ...task.policyDecisions.filter((entry) => entry.source !== "security"),
    ];
    if (allowed) return true;

    task.status = "failed";
    task.failureReason = `Coordinator security denied: ${evaluation.reason}`;
    task.updatedAt = new Date().toISOString();
    return false;
  }

  private _recordBudgetSpend(
    task: CoordinatorTaskRecord,
    worker: AgentWorkerSnapshot,
  ): void {
    if (!this._budgetPolicy?.recordTaskSpend || !task.budget) return;
    this._budgetPolicy.recordTaskSpend({
      task: snapshotTask(task),
      worker,
    });
  }

  private _executionTaskRecords(execution: CoordinatorExecutionRecord): CoordinatorTaskRecord[] {
    return execution.taskIds
      .map((taskId) => this._tasks.get(taskId))
      .filter((task): task is CoordinatorTaskRecord => Boolean(task));
  }

  private _snapshotExecution(execution: CoordinatorExecutionRecord): CoordinatorExecutionSnapshot {
    const tasks = this._executionTaskRecords(execution);
    return {
      executionId: execution.executionId,
      title: execution.title,
      objective: execution.objective,
      status: execution.status,
      taskIds: [...execution.taskIds],
      completedTaskIds: tasks
        .filter((task) => task.status === "completed")
        .map((task) => task.taskId),
      failedTaskIds: tasks
        .filter((task) => task.status === "failed")
        .map((task) => task.taskId),
      cancelledTaskIds: tasks
        .filter((task) => task.status === "cancelled")
        .map((task) => task.taskId),
      result: execution.result ? { ...execution.result } : undefined,
      failureReason: execution.failureReason,
      createdAt: execution.createdAt,
      updatedAt: execution.updatedAt,
      metadata: { ...execution.metadata },
    };
  }

  private _missingExecution(executionId: string): CoordinatorExecutionSnapshot {
    const now = new Date().toISOString();
    return {
      executionId,
      title: "unknown",
      objective: "unknown",
      status: "failed",
      taskIds: [],
      completedTaskIds: [],
      failedTaskIds: [],
      cancelledTaskIds: [],
      failureReason: `Execution not found: ${executionId}`,
      createdAt: now,
      updatedAt: now,
      metadata: {},
    };
  }
}

export class CoordinatorSessionBudgetPolicy implements CoordinatorBudgetPolicy {
  private readonly _budget: SessionBudget;

  constructor(options: CoordinatorSessionBudgetPolicyOptions = {}) {
    this._budget = new SessionBudget(options);
  }

  get stats(): Record<string, unknown> {
    return this._budget.getStats();
  }

  evaluateTask(input: CoordinatorBudgetPolicyInput): CoordinatorBudgetPolicyDecision {
    const estimate = input.task.budget ?? {};
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

  recordTaskSpend(input: CoordinatorBudgetPolicyInput): void {
    const estimate = input.task.budget ?? {};
    this._budget.recordSpend(
      estimate.estimatedTokens ?? 0,
      estimate.estimatedUsd ?? 0,
    );
  }
}

export function snapshotTask(task: CoordinatorTaskRecord): CoordinatorTaskSnapshot {
  return {
    taskId: task.taskId,
    title: task.title,
    objective: task.objective,
    requiredRole: task.requiredRole,
    priority: task.priority,
    status: task.status,
    assignedWorkerId: task.assignedWorkerId,
    budget: task.budget ? { ...task.budget } : undefined,
    approval: task.approval ? { ...task.approval } : undefined,
    security: task.security
      ? {
          ...task.security,
          metadata: { ...task.security.metadata },
        }
      : undefined,
    policyDecisions: task.policyDecisions.map((decision) => ({ ...decision })),
    awaitingApproval: task.awaitingApproval ? { ...task.awaitingApproval } : undefined,
    result: task.result ? { ...task.result } : undefined,
    failureReason: task.failureReason,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    metadata: { ...task.metadata },
  };
}

export function snapshotMessage(message: InterAgentMessageRecord): InterAgentMessageSnapshot {
  return {
    messageId: message.messageId,
    fromWorkerId: message.fromWorkerId,
    toWorkerId: message.toWorkerId,
    kind: message.kind,
    content: message.content,
    status: message.status,
    taskId: message.taskId,
    failureReason: message.failureReason,
    createdAt: message.createdAt,
    readAt: message.readAt,
    metadata: { ...message.metadata },
  };
}

function failedTask(taskId: string, reason: string): CoordinatorTaskRecord {
  const now = new Date().toISOString();
  return {
    taskId,
    title: "unknown",
    objective: "unknown",
    priority: 0,
    status: "failed",
    policyDecisions: [],
    failureReason: reason,
    createdAt: now,
    updatedAt: now,
    metadata: {},
  };
}

function newExecutionId(): string {
  return `exec_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function newTaskId(): string {
  return `task_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function newMessageId(): string {
  return `msg_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
