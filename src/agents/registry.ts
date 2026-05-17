import { randomUUID } from "crypto";

import { SessionState, type Caste } from "../caste/enums";
import {
  type AgentSession,
  type SessionConfig,
  SessionManager,
} from "../runtime/session";

export type AgentWorkerRole =
  | "planner"
  | "worker"
  | "reviewer"
  | "observer"
  | (string & {});

export type AgentWorkerLifecycleState =
  | "spawned"
  | "idle"
  | "running"
  | "paused"
  | "stopped"
  | "failed";

export interface AgentWorkerTaskRef {
  taskId: string;
  summary: string;
  assignedAt: string;
}

export interface AgentWorkerResult {
  summary: string;
  completedAt: string;
}

export interface AgentWorkerSessionSnapshot {
  sessionId: string;
  agentId: string;
  caste: string;
  tenantScope: string;
  state: string;
  messageCount: number;
  totalIterations: number;
  totalTokensUsed: number;
}

export interface AgentWorkerSnapshot {
  workerId: string;
  agentId: string;
  sessionId: string;
  role: AgentWorkerRole;
  caste: string;
  objective: string;
  tenantScope: string;
  parentAgentId?: string;
  state: AgentWorkerLifecycleState;
  statusReason: string;
  currentTask?: AgentWorkerTaskRef;
  lastResult?: AgentWorkerResult;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
  session: AgentWorkerSessionSnapshot;
}

export interface AgentWorkerLifecycleEvent {
  workerId: string;
  state: AgentWorkerLifecycleState;
  reason: string;
  timestamp: string;
  taskId?: string;
}

export interface SpawnAgentWorkerOptions {
  role: AgentWorkerRole;
  caste: Caste | string;
  objective: string;
  tenantScope?: string;
  parentAgentId?: string;
  metadata?: Record<string, unknown>;
  sessionConfig?: Partial<SessionConfig>;
}

export interface AgentWorkerListFilter {
  role?: AgentWorkerRole;
  caste?: Caste | string;
  state?: AgentWorkerLifecycleState;
}

export interface StartWorkerTaskOptions {
  taskId: string;
  summary: string;
}

interface AgentWorkerRecord {
  workerId: string;
  session: AgentSession;
  role: AgentWorkerRole;
  objective: string;
  parentAgentId?: string;
  state: AgentWorkerLifecycleState;
  statusReason: string;
  currentTask?: AgentWorkerTaskRef;
  lastResult?: AgentWorkerResult;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface ColonyAgentRegistryOptions {
  sessionManager?: SessionManager;
}

export class ColonyAgentRegistry {
  private readonly _sessionManager: SessionManager;
  private readonly _workers = new Map<string, AgentWorkerRecord>();
  private readonly _events = new Map<string, AgentWorkerLifecycleEvent[]>();

  constructor(options: ColonyAgentRegistryOptions = {}) {
    this._sessionManager = options.sessionManager ?? new SessionManager();
  }

  async spawnWorker(options: SpawnAgentWorkerOptions): Promise<AgentWorkerSnapshot> {
    const now = new Date().toISOString();
    const workerId = newWorkerId();
    const agentId = newAgentId();
    const session = await this._sessionManager.createSession({
      agentId,
      caste: options.caste,
      tenantScope: options.tenantScope,
      config: options.sessionConfig,
      metadata: {
        workerId,
        workerRole: options.role,
        parentAgentId: options.parentAgentId,
        ...options.metadata,
      },
    });
    const worker: AgentWorkerRecord = {
      workerId,
      session,
      role: options.role,
      objective: options.objective,
      parentAgentId: options.parentAgentId,
      state: "spawned",
      statusReason: "worker spawned",
      createdAt: now,
      updatedAt: now,
      metadata: { ...options.metadata },
    };

    this._workers.set(workerId, worker);
    this._recordEvent(worker, "worker spawned");
    return snapshotWorker(worker);
  }

  inspectWorker(workerId: string): AgentWorkerSnapshot | null {
    const worker = this._workers.get(workerId);
    return worker ? snapshotWorker(worker) : null;
  }

  listWorkers(filter: AgentWorkerListFilter = {}): AgentWorkerSnapshot[] {
    return [...this._workers.values()]
      .filter((worker) => {
        if (filter.role && worker.role !== filter.role) return false;
        if (filter.caste && String(worker.session.caste) !== String(filter.caste)) return false;
        if (filter.state && worker.state !== filter.state) return false;
        return true;
      })
      .map(snapshotWorker);
  }

  workerEvents(workerId: string): AgentWorkerLifecycleEvent[] {
    return (this._events.get(workerId) ?? []).map((event) => ({ ...event }));
  }

  markReady(workerId: string): AgentWorkerSnapshot {
    const worker = this._workerOrFailed(workerId);
    if (worker.state === "failed") return snapshotWorker(worker);
    if (worker.state !== "spawned") {
      return this._fail(worker, `Cannot mark worker ready from ${worker.state}`);
    }
    return this._transition(worker, "idle", "worker ready");
  }

  startWorkerTask(workerId: string, task: StartWorkerTaskOptions): AgentWorkerSnapshot {
    const worker = this._workerOrFailed(workerId);
    if (worker.state === "failed") return snapshotWorker(worker);
    if (worker.state !== "idle" && worker.state !== "spawned") {
      return this._fail(worker, `Cannot start task from ${worker.state}`);
    }
    worker.currentTask = {
      taskId: task.taskId,
      summary: task.summary,
      assignedAt: new Date().toISOString(),
    };
    return this._transition(worker, "running", "task started", task.taskId);
  }

  pauseWorker(workerId: string, reason: string): AgentWorkerSnapshot {
    const worker = this._workerOrFailed(workerId);
    if (worker.state === "failed") return snapshotWorker(worker);
    if (worker.state !== "running") {
      return this._fail(worker, `Cannot pause worker from ${worker.state}`);
    }
    return this._transition(worker, "paused", reason, worker.currentTask?.taskId);
  }

  resumeWorker(workerId: string): AgentWorkerSnapshot {
    const worker = this._workerOrFailed(workerId);
    if (worker.state === "failed") return snapshotWorker(worker);
    if (worker.state !== "paused") {
      return this._fail(worker, `Cannot resume worker from ${worker.state}`);
    }
    return this._transition(worker, "running", "worker resumed", worker.currentTask?.taskId);
  }

  completeWorkerTask(workerId: string, summary: string): AgentWorkerSnapshot {
    const worker = this._workerOrFailed(workerId);
    if (worker.state === "failed") return snapshotWorker(worker);
    if (worker.state !== "running") {
      return this._fail(worker, `Cannot complete worker from ${worker.state}`);
    }
    worker.lastResult = {
      summary,
      completedAt: new Date().toISOString(),
    };
    const taskId = worker.currentTask?.taskId;
    worker.currentTask = undefined;
    return this._transition(worker, "idle", "task completed", taskId);
  }

  stopWorker(workerId: string, reason: string): AgentWorkerSnapshot {
    const worker = this._workerOrFailed(workerId);
    if (worker.state === "failed") return snapshotWorker(worker);
    if (worker.state === "stopped") return snapshotWorker(worker);
    worker.currentTask = undefined;
    return this._transition(worker, "stopped", reason);
  }

  private _transition(
    worker: AgentWorkerRecord,
    state: AgentWorkerLifecycleState,
    reason: string,
    taskId?: string,
  ): AgentWorkerSnapshot {
    worker.state = state;
    worker.statusReason = reason;
    worker.updatedAt = new Date().toISOString();
    this._recordEvent(worker, reason, taskId);
    return snapshotWorker(worker);
  }

  private _fail(worker: AgentWorkerRecord, reason: string): AgentWorkerSnapshot {
    worker.currentTask = undefined;
    return this._transition(worker, "failed", reason);
  }

  private _workerOrFailed(workerId: string): AgentWorkerRecord {
    const worker = this._workers.get(workerId);
    if (worker) return worker;
    const now = new Date().toISOString();
    return {
      workerId,
      session: {
        sessionId: "ses_missing",
        agentId: "agent_missing",
        caste: "unknown",
        tenantScope: "unknown",
        state: SessionState.CLOSED,
        createdAt: now,
        lastActive: now,
        history: [],
        totalIterations: 0,
        totalTokensUsed: 0,
        config: {
          maxIdleSeconds: 0,
          maxHistoryMessages: 0,
          maxTotalTokens: 0,
        },
        metadata: {},
      },
      role: "unknown",
      objective: "unknown",
      state: "failed",
      statusReason: `Worker not found: ${workerId}`,
      createdAt: now,
      updatedAt: now,
      metadata: {},
    };
  }

  private _recordEvent(worker: AgentWorkerRecord, reason: string, taskId?: string): void {
    const events = this._events.get(worker.workerId) ?? [];
    events.push({
      workerId: worker.workerId,
      state: worker.state,
      reason,
      timestamp: worker.updatedAt,
      taskId,
    });
    this._events.set(worker.workerId, events);
  }
}

export function snapshotWorker(worker: AgentWorkerRecord): AgentWorkerSnapshot {
  return {
    workerId: worker.workerId,
    agentId: worker.session.agentId,
    sessionId: worker.session.sessionId,
    role: worker.role,
    caste: String(worker.session.caste),
    objective: worker.objective,
    tenantScope: worker.session.tenantScope,
    parentAgentId: worker.parentAgentId,
    state: worker.state,
    statusReason: worker.statusReason,
    currentTask: worker.currentTask ? { ...worker.currentTask } : undefined,
    lastResult: worker.lastResult ? { ...worker.lastResult } : undefined,
    createdAt: worker.createdAt,
    updatedAt: worker.updatedAt,
    metadata: { ...worker.metadata },
    session: {
      sessionId: worker.session.sessionId,
      agentId: worker.session.agentId,
      caste: String(worker.session.caste),
      tenantScope: worker.session.tenantScope,
      state: String(worker.session.state),
      messageCount: worker.session.history.length,
      totalIterations: worker.session.totalIterations,
      totalTokensUsed: worker.session.totalTokensUsed,
    },
  };
}

function newWorkerId(): string {
  return `wrk_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function newAgentId(): string {
  return `agent_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
