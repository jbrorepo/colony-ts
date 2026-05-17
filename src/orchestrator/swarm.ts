import { randomUUID } from "crypto";
import { appendFile, mkdir, readFile } from "fs/promises";
import { dirname, join } from "path";

import { MethodCaste } from "../caste/enums";
import type {
  AgentWorkerSnapshot,
  ColonyAgentRegistry,
} from "../agents";
import { ColonyAgentRegistry as DefaultColonyAgentRegistry } from "../agents";
import {
  ColonyCoordinator,
  type CoordinatorExecutionSnapshot,
  type CoordinatorTaskSnapshot,
} from "./coordinator";
import type { AgentLoop } from "../runtime/loop";
import {
  WorkflowEngine,
  WorkflowRuntimeRunner,
  createAgentLoopTaskStep,
  createAgentLoopWorkflowHandler,
  type WorkflowRun,
  type WorkflowStore,
} from "../workflow";

export type SwarmRunStatus = "running" | "completed" | "failed" | "cancelled";
export type SwarmExecutionMode = "coordinator_only" | "llm";
export type SwarmStage = "plan" | "execute" | "review";
export type SwarmStageStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export interface SwarmStageArtifact {
  type: string;
  name: string;
  content?: string;
  uri?: string;
  metadata?: Record<string, unknown>;
}

export interface SwarmStageArtifactReview {
  type: string;
  name: string;
  uri?: string;
  contentBytes: number;
  preview?: string;
  metadataKeys: string[];
  externalContent: boolean;
}

export interface SwarmStageSnapshot {
  stage: SwarmStage;
  status: SwarmStageStatus;
  taskId?: string;
  workerId?: string;
  attempts: number;
  startedAt?: string;
  endedAt?: string;
  summary?: string;
  artifacts: SwarmStageArtifact[];
  artifactCount: number;
  artifactReview?: SwarmStageArtifactReview[];
  totalTokens?: number;
  estimatedCostUsd?: number;
  failureReason?: string;
  awaitingApproval?: {
    reason?: string;
    requiredApprover?: string;
    requestedAt?: string;
  };
  retryHistory?: SwarmStageAttemptHistory[];
  updatedAt: string;
}

export interface SwarmStageAttemptHistory {
  attempt: number;
  status: SwarmStageStatus;
  summary?: string;
  failureReason?: string;
  startedAt?: string;
  endedAt?: string;
  artifactCount: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  updatedAt: string;
}

export interface SwarmStageRunnerInput {
  runId: string;
  title: string;
  objective: string;
  stage: SwarmStage;
  attempt: number;
  task?: CoordinatorTaskSnapshot;
  worker?: AgentWorkerSnapshot;
  previousStages: SwarmStageSnapshot[];
}

export interface SwarmStageRunnerResult {
  summary: string;
  artifacts?: SwarmStageArtifact[];
  totalTokens?: number;
  estimatedCostUsd?: number;
}

export interface SwarmStageRunner {
  runStage(input: SwarmStageRunnerInput): Promise<SwarmStageRunnerResult>;
}

export interface AgentLoopSwarmStageRunnerOptions {
  createLoop: (input: SwarmStageRunnerInput) => AgentLoop | Promise<AgentLoop>;
  prompt?: (input: SwarmStageRunnerInput) => string;
}

export interface StartSwarmObjectiveOptions {
  objective: string;
  title?: string;
  metadata?: Record<string, unknown>;
  executionMode?: SwarmExecutionMode;
  maxAttempts?: number;
  approvalRequired?: boolean;
  requiredApprover?: string;
}

export interface SwarmRunSnapshot {
  runId: string;
  title: string;
  objective: string;
  status: SwarmRunStatus;
  executionMode: SwarmExecutionMode;
  maxAttempts: number;
  execution: CoordinatorExecutionSnapshot;
  workers: AgentWorkerSnapshot[];
  tasks: CoordinatorTaskSnapshot[];
  stages: SwarmStageSnapshot[];
  workerCount: number;
  taskCount: number;
  assignedTaskCount: number;
  completedTaskCount: number;
  failedTaskCount: number;
  cancelledTaskCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SwarmRunStore {
  save(snapshot: SwarmRunSnapshot): Promise<void>;
  load(): Promise<SwarmRunSnapshot[]>;
}

export interface JsonSwarmRunStoreOptions {
  rootDir: string;
}

export interface ColonySwarmRuntimeOptions {
  registry?: ColonyAgentRegistry;
  coordinator?: ColonyCoordinator;
  store?: SwarmRunStore;
  llmRunner?: SwarmStageRunner;
}

interface SwarmRunRecord {
  runId: string;
  title: string;
  objective: string;
  executionId: string;
  workerIds: string[];
  executionMode: SwarmExecutionMode;
  maxAttempts: number;
  stages: Map<SwarmStage, SwarmStageSnapshot>;
  createdAt: string;
  updatedAt: string;
}

export class ColonySwarmRuntime {
  readonly registry: ColonyAgentRegistry;
  readonly coordinator: ColonyCoordinator;
  private readonly _runs = new Map<string, SwarmRunRecord>();
  private readonly _persistedSnapshots = new Map<string, SwarmRunSnapshot>();
  private readonly _store?: SwarmRunStore;
  private readonly _llmRunner?: SwarmStageRunner;

  constructor(options: ColonySwarmRuntimeOptions = {}) {
    this.registry = options.registry ?? new DefaultColonyAgentRegistry();
    this.coordinator = options.coordinator ?? new ColonyCoordinator({ registry: this.registry });
    this._store = options.store;
    this._llmRunner = options.llmRunner;
  }

  async startObjective(options: StartSwarmObjectiveOptions): Promise<SwarmRunSnapshot> {
    const now = new Date().toISOString();
    const title = options.title ?? "Swarm execution";
    const executionMode = options.executionMode ?? "coordinator_only";
    const maxAttempts = clampAttempts(options.maxAttempts);
    const [planner, worker, reviewer] = await Promise.all([
      this.registry.spawnWorker({
        role: "planner",
        caste: MethodCaste.COMMAND_ANT,
        objective: `Plan: ${options.objective}`,
        metadata: { swarmRole: "planner", ...options.metadata },
      }),
      this.registry.spawnWorker({
        role: "worker",
        caste: MethodCaste.OPER_ANT,
        objective: `Execute: ${options.objective}`,
        metadata: { swarmRole: "worker", ...options.metadata },
      }),
      this.registry.spawnWorker({
        role: "reviewer",
        caste: MethodCaste.CONSULT_ANT,
        objective: `Review: ${options.objective}`,
        metadata: { swarmRole: "reviewer", ...options.metadata },
      }),
    ]);

    const workers = [planner, worker, reviewer].map((spawned) => {
      this.registry.markReady(spawned.workerId);
      return spawned.workerId;
    });

    const execution = this.coordinator.startFanOutExecution({
      title,
      objective: options.objective,
      metadata: {
        swarm: true,
        ...options.metadata,
      },
      children: [
        {
          title: "Plan",
          objective: `Plan the work: ${options.objective}`,
          requiredRole: "planner",
          priority: 30,
          metadata: { swarmStage: "plan" },
        },
        {
          title: "Execute",
          objective: `Execute the work: ${options.objective}`,
          requiredRole: "worker",
          priority: 20,
          approval: options.approvalRequired
            ? {
              reason: `Approval required before executing swarm objective: ${options.objective}`,
              requiredApprover: options.requiredApprover,
            }
            : undefined,
          metadata: { swarmStage: "execute" },
        },
        {
          title: "Review",
          objective: `Review the work: ${options.objective}`,
          requiredRole: "reviewer",
          priority: 10,
          metadata: { swarmStage: "review" },
        },
      ],
    });

    const run: SwarmRunRecord = {
      runId: newSwarmRunId(),
      title,
      objective: options.objective,
      executionId: execution.executionId,
      workerIds: workers,
      executionMode,
      maxAttempts,
      stages: new Map(SWARM_STAGE_ORDER.map((stage) => [
        stage,
        initialStageSnapshot(stage, now),
      ])),
      createdAt: now,
      updatedAt: now,
    };
    this._runs.set(run.runId, run);
    this.coordinator.dispatchFanOutExecution(execution.executionId, workers);
    let snapshot = this._snapshot(run);
    await this._saveSnapshot(snapshot);
    if (executionMode === "llm") {
      snapshot = await this._runLlmStages(run);
    }
    return snapshot;
  }

  inspectRun(runId: string): SwarmRunSnapshot | null {
    const run = this._runs.get(runId);
    return run ? this._snapshot(run) : this._persistedSnapshots.get(runId) ?? null;
  }

  listRuns(): SwarmRunSnapshot[] {
    const live = [...this._runs.values()].map((run) => this._snapshot(run));
    const liveIds = new Set(live.map((run) => run.runId));
    const persisted = [...this._persistedSnapshots.values()].filter((run) => !liveIds.has(run.runId));
    return [...live, ...persisted]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async cancelRun(runId: string, reason: string): Promise<SwarmRunSnapshot | null> {
    const run = this._runs.get(runId);
    if (run) {
      this.coordinator.cancelExecution(run.executionId, reason);
      run.updatedAt = new Date().toISOString();
      const snapshot = this._snapshot(run);
      await this._saveSnapshot(snapshot);
      return snapshot;
    }

    const persisted = this._persistedSnapshots.get(runId);
    if (!persisted) return null;
    const cancelled = cancelPersistedSnapshot(persisted, reason);
    await this._saveSnapshot(cancelled);
    return cancelled;
  }

  async resumeRun(runId: string): Promise<SwarmRunSnapshot | null> {
    const run = this._runs.get(runId);
    if (run) {
      if (run.executionMode !== "llm") return this._snapshot(run);
      return this._runLlmStages(run);
    }

    const persisted = this._persistedSnapshots.get(runId);
    if (!persisted) return null;
    if (persisted.executionMode !== "llm" || persisted.status === "completed" || persisted.status === "cancelled") {
      return persisted;
    }
    const resumed = await this._runPersistedLlmStages(persisted);
    await this._saveSnapshot(resumed);
    return resumed;
  }

  async retryStage(runId: string, stage: SwarmStage): Promise<SwarmRunSnapshot | null> {
    const run = this._runs.get(runId);
    if (run) {
      if (run.executionMode !== "llm") return this._snapshot(run);
      resetStageAndDependents(run.stages, stage);
      return this._runLlmStages(run, stage, true);
    }

    const persisted = this._persistedSnapshots.get(runId);
    if (!persisted) return null;
    if (persisted.executionMode !== "llm" || persisted.status === "cancelled") return persisted;
    const existingStage = persisted.stages.find((entry) => entry.stage === stage);
    const retried = existingStage?.status === "awaiting_approval"
      ? preservePersistedApprovalWait(persisted, stage)
      : resetPersistedStageAndDependents(persisted, stage);
    const completed = await this._runPersistedLlmStages(retried, stage, true);
    await this._saveSnapshot(completed);
    return completed;
  }

  async loadPersistedRuns(): Promise<SwarmRunSnapshot[]> {
    if (!this._store) return [];
    const loaded = await this._store.load();
    this._persistedSnapshots.clear();
    for (const snapshot of loaded) {
      this._persistedSnapshots.set(snapshot.runId, snapshot);
    }
    return this.listRuns();
  }

  async persistRunSnapshot(runId: string): Promise<SwarmRunSnapshot | null> {
    const snapshot = this.inspectRun(runId);
    if (!snapshot) return null;
    await this._saveSnapshot(snapshot);
    return snapshot;
  }

  private async _runLlmStages(
    run: SwarmRunRecord,
    fromStage: SwarmStage = "plan",
    explicitRetry = false,
  ): Promise<SwarmRunSnapshot> {
    if (!this._llmRunner) {
      markRunStageFailure(run, fromStage, "LLM swarm runner is not configured");
      const snapshot = this._snapshot(run);
      await this._saveSnapshot(snapshot);
      return snapshot;
    }

    for (const stage of SWARM_STAGE_ORDER.slice(SWARM_STAGE_ORDER.indexOf(fromStage))) {
      const existing = run.stages.get(stage);
      if (existing?.status === "completed") continue;
      const task = this._stageTask(run.executionId, stage);
      const worker = task?.assignedWorkerId ? this.registry.inspectWorker(task.assignedWorkerId) ?? undefined : undefined;
      const attempt = (existing?.attempts ?? 0) + 1;
      const attemptLimit = explicitRetry ? MANUAL_RETRY_ATTEMPT_LIMIT : run.maxAttempts;
      if (attempt > attemptLimit) {
        markRunStageFailure(run, stage, `Swarm stage ${stage} exceeded ${attemptLimit} attempts`);
        if (task?.assignedWorkerId) this.coordinator.failTask(task.taskId, task.assignedWorkerId, `Swarm stage ${stage} exceeded ${attemptLimit} attempts`);
        this.coordinator.collectFanIn(run.executionId);
        const snapshot = this._snapshot(run);
        await this._saveSnapshot(snapshot);
        return snapshot;
      }

      if (task?.awaitingApproval) {
        run.stages.set(stage, {
          ...stageSnapshotForTask(stage, task, existing),
          status: "awaiting_approval",
          attempts: existing?.attempts ?? 0,
          awaitingApproval: { ...task.awaitingApproval },
          updatedAt: new Date().toISOString(),
        });
        const snapshot = this._snapshot(run);
        await this._saveSnapshot(snapshot);
        return snapshot;
      }

      run.stages.set(stage, {
        ...stageSnapshotForTask(stage, task, existing),
        status: "running",
        attempts: attempt,
        startedAt: new Date().toISOString(),
        endedAt: undefined,
        failureReason: undefined,
        updatedAt: new Date().toISOString(),
      });
      await this._saveSnapshot(this._snapshot(run));

      try {
        const result = await this._llmRunner.runStage({
          runId: run.runId,
          title: run.title,
          objective: run.objective,
          stage,
          attempt,
          task,
          worker,
          previousStages: stageSnapshotsFromMap(run.stages).filter((entry) => entry.stage !== stage),
        });
        const completedAt = new Date().toISOString();
        const artifacts = normalizeStageArtifacts(result.artifacts ?? []);
        run.stages.set(stage, {
          ...stageSnapshotForTask(stage, task, run.stages.get(stage)),
          status: "completed",
          attempts: attempt,
          startedAt: run.stages.get(stage)?.startedAt ?? completedAt,
          endedAt: completedAt,
          summary: readStageSummary(result.summary),
          artifacts,
          artifactCount: artifacts.length,
          artifactReview: summarizeStageArtifacts(artifacts),
          totalTokens: validOptionalNumber(result.totalTokens),
          estimatedCostUsd: validOptionalNumber(result.estimatedCostUsd),
          failureReason: undefined,
          updatedAt: completedAt,
        });
        if (task?.assignedWorkerId) {
          this.coordinator.completeTask(task.taskId, task.assignedWorkerId, result.summary);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        markRunStageFailure(run, stage, reason);
        if (task?.assignedWorkerId) this.coordinator.failTask(task.taskId, task.assignedWorkerId, reason);
        this.coordinator.collectFanIn(run.executionId);
        const snapshot = this._snapshot(run);
        await this._saveSnapshot(snapshot);
        return snapshot;
      }
    }

    this.coordinator.collectFanIn(run.executionId);
    run.updatedAt = new Date().toISOString();
    const snapshot = this._snapshot(run);
    await this._saveSnapshot(snapshot);
    return snapshot;
  }

  private async _runPersistedLlmStages(
    snapshot: SwarmRunSnapshot,
    fromStage: SwarmStage = "plan",
    explicitRetry = false,
  ): Promise<SwarmRunSnapshot> {
    if (!this._llmRunner) {
      return withPersistedStageFailure(snapshot, fromStage, "LLM swarm runner is not configured");
    }

    let current = normalizeSwarmRunSnapshot(snapshot);
    for (const stage of SWARM_STAGE_ORDER.slice(SWARM_STAGE_ORDER.indexOf(fromStage))) {
      const existing = current.stages.find((entry) => entry.stage === stage) ?? initialStageSnapshot(stage, current.updatedAt);
      if (existing.status === "completed") continue;
      if (existing.status === "awaiting_approval") {
        return preservePersistedApprovalWait(current, stage);
      }
      const attempt = existing.attempts + 1;
      const attemptLimit = explicitRetry ? MANUAL_RETRY_ATTEMPT_LIMIT : current.maxAttempts;
      if (attempt > attemptLimit) {
        return withPersistedStageFailure(current, stage, `Swarm stage ${stage} exceeded ${attemptLimit} attempts`);
      }
      const retryHistory = existing.status === "running"
        ? appendInterruptedStageRetryHistory(existing)
        : existing.retryHistory ?? [];
      current = upsertPersistedStage(current, {
        ...existing,
        status: "running",
        attempts: attempt,
        startedAt: new Date().toISOString(),
        endedAt: undefined,
        failureReason: undefined,
        retryHistory,
        updatedAt: new Date().toISOString(),
      });
      try {
        const result = await this._llmRunner.runStage({
          runId: current.runId,
          title: current.title,
          objective: current.objective,
          stage,
          attempt,
          previousStages: current.stages.filter((entry) => entry.stage !== stage),
        });
        const artifacts = normalizeStageArtifacts(result.artifacts ?? []);
        current = upsertPersistedStage(current, {
          ...existing,
          status: "completed",
          attempts: attempt,
          startedAt: current.stages.find((entry) => entry.stage === stage)?.startedAt ?? new Date().toISOString(),
          endedAt: new Date().toISOString(),
          summary: readStageSummary(result.summary),
          artifacts,
          artifactCount: artifacts.length,
          artifactReview: summarizeStageArtifacts(artifacts),
          totalTokens: validOptionalNumber(result.totalTokens),
          estimatedCostUsd: validOptionalNumber(result.estimatedCostUsd),
          failureReason: undefined,
          retryHistory,
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        return withPersistedStageFailure(current, stage, error instanceof Error ? error.message : String(error));
      }
    }
    return finalizePersistedSnapshot(current);
  }

  private _stageTask(executionId: string, stage: SwarmStage): CoordinatorTaskSnapshot | undefined {
    return this.coordinator.listExecutionTasks(executionId)
      .find((task) => task.metadata.swarmStage === stage);
  }

  private _snapshot(run: SwarmRunRecord): SwarmRunSnapshot {
    const execution = this.coordinator.inspectExecution(run.executionId)
      ?? missingExecution(run.executionId);
    const tasks = this.coordinator.listExecutionTasks(run.executionId);
    const workers = run.workerIds
      .map((workerId) => this.registry.inspectWorker(workerId))
      .filter((worker): worker is AgentWorkerSnapshot => Boolean(worker));
    const stages = mergedStageSnapshots(run.stages, tasks);
    const status = run.executionMode === "llm"
      ? statusFromStages(stages, execution.status)
      : execution.status;

    return {
      runId: run.runId,
      title: run.title,
      objective: run.objective,
      status,
      executionMode: run.executionMode,
      maxAttempts: run.maxAttempts,
      execution,
      workers,
      tasks,
      stages,
      workerCount: workers.length,
      taskCount: tasks.length,
      assignedTaskCount: tasks.filter((task) => task.status === "assigned").length,
      completedTaskCount: tasks.filter((task) => task.status === "completed").length,
      failedTaskCount: tasks.filter((task) => task.status === "failed").length,
      cancelledTaskCount: tasks.filter((task) => task.status === "cancelled").length,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  }

  private async _saveSnapshot(snapshot: SwarmRunSnapshot): Promise<void> {
    const normalized = normalizeSwarmRunSnapshot(snapshot);
    this._persistedSnapshots.set(normalized.runId, normalized);
    await this._store?.save(normalized);
  }
}

interface SwarmRunJournalRecord {
  recordType: "colony_swarm_run_snapshot";
  schemaVersion: 1;
  sequence: number;
  timestamp: string;
  run: SwarmRunSnapshot;
}

const SWARM_RUN_FILE = "swarm-runs.jsonl";

export class JsonSwarmRunStore implements SwarmRunStore {
  private readonly _filePath: string;
  private _sequence = 0;

  constructor(options: JsonSwarmRunStoreOptions) {
    this._filePath = join(options.rootDir, SWARM_RUN_FILE);
  }

  async save(snapshot: SwarmRunSnapshot): Promise<void> {
    const record: SwarmRunJournalRecord = {
      recordType: "colony_swarm_run_snapshot",
      schemaVersion: 1,
      sequence: this._sequence++,
      timestamp: new Date().toISOString(),
      run: normalizeSwarmRunSnapshot(snapshot),
    };
    await mkdir(dirname(this._filePath), { recursive: true });
    await appendFile(this._filePath, `${JSON.stringify(record)}\n`, "utf8");
  }

  async load(): Promise<SwarmRunSnapshot[]> {
    let content: string;
    try {
      content = await readFile(this._filePath, "utf8");
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") return [];
      throw new Error("Swarm run snapshot journal is invalid");
    }

    const latest = new Map<string, SwarmRunSnapshot>();
    try {
      for (const line of content.split(/\r?\n/)) {
        if (line.trim().length === 0) continue;
        const record = normalizeSwarmRunJournalRecord(JSON.parse(line) as SwarmRunJournalRecord);
        this._sequence = Math.max(this._sequence, record.sequence + 1);
        latest.set(record.run.runId, record.run);
      }
    } catch {
      throw new Error("Swarm run snapshot journal is invalid");
    }

    return [...latest.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
}

export function createAgentLoopSwarmStageRunner(
  options: AgentLoopSwarmStageRunnerOptions,
): SwarmStageRunner {
  return {
    async runStage(input): Promise<SwarmStageRunnerResult> {
      const workflowStore = new MemoryWorkflowStore();
      const engine = new WorkflowEngine({ store: workflowStore });
      const runner = new WorkflowRuntimeRunner({ engine });
      const step = createAgentLoopTaskStep({
        id: input.stage,
        title: stageTitle(input.stage),
        task: options.prompt ? options.prompt(input) : formatSwarmStagePrompt(input),
        maxAttempts: 1,
      });
      const definition = {
        id: `swarm_${input.stage}_${input.runId}`.replace(/[^A-Za-z0-9_]/g, "_"),
        title: `Swarm ${stageTitle(input.stage)}: ${input.title}`,
        version: "launch-alpha0",
        steps: [step],
      };
      const handler = createAgentLoopWorkflowHandler({
        createLoop: () => options.createLoop(input),
        prompt: () => options.prompt ? options.prompt(input) : formatSwarmStagePrompt(input),
        artifactName: `${input.stage}-agent-loop-result.json`,
      });
      const run = await runner.startAndRun(definition, { [input.stage]: handler });
      const state = run.steps[input.stage];
      if (run.status === "failed" || state?.status === "failed") {
        throw new Error(state?.lastError ?? `Swarm ${input.stage} workflow failed`);
      }
      const artifactStats = parseAgentLoopArtifactStats(run);
      return {
        summary: state?.summary ?? `${stageTitle(input.stage)} complete`,
        artifacts: run.artifacts.map((artifact) => ({
          type: artifact.type,
          name: artifact.name,
          content: artifact.content,
          uri: artifact.uri,
          metadata: artifact.metadata,
        })),
        totalTokens: artifactStats.totalTokens,
        estimatedCostUsd: artifactStats.estimatedCostUsd,
      };
    },
  };
}

class MemoryWorkflowStore implements WorkflowStore {
  private readonly _runs = new Map<string, WorkflowRun>();

  async saveRun(run: WorkflowRun): Promise<void> {
    this._runs.set(run.id, JSON.parse(JSON.stringify(run)) as WorkflowRun);
  }

  async loadRun(runId: string): Promise<WorkflowRun | null> {
    const run = this._runs.get(runId);
    return run ? JSON.parse(JSON.stringify(run)) as WorkflowRun : null;
  }
}

function normalizeSwarmRunJournalRecord(record: SwarmRunJournalRecord): SwarmRunJournalRecord {
  if (!isPlainRecord(record)
    || record.recordType !== "colony_swarm_run_snapshot"
    || record.schemaVersion !== 1
    || !Number.isInteger(record.sequence)
    || typeof record.sequence !== "number"
    || record.sequence < 0
    || record.sequence > 1_000_000
    || typeof record.timestamp !== "string") {
    throw new Error("invalid swarm record");
  }
  return {
    recordType: "colony_swarm_run_snapshot",
    schemaVersion: 1,
    sequence: record.sequence,
    timestamp: toIso(record.timestamp),
    run: normalizeSwarmRunSnapshot(record.run),
  };
}

function missingExecution(executionId: string): CoordinatorExecutionSnapshot {
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

function cancelPersistedSnapshot(snapshot: SwarmRunSnapshot, reason: string): SwarmRunSnapshot {
  const now = new Date().toISOString();
  const tasks = snapshot.tasks.map((task) => {
    if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
      return { ...task };
    }
    return {
      ...task,
      status: "cancelled" as const,
      failureReason: reason,
      updatedAt: now,
    };
  });
  const workers = snapshot.workers.map((worker) => {
    if (worker.state === "stopped" || worker.state === "failed") {
      return { ...worker };
    }
    return {
      ...worker,
      state: "stopped" as const,
      statusReason: reason,
      currentTask: undefined,
      updatedAt: now,
    };
  });
  const execution = {
    ...snapshot.execution,
    status: "cancelled" as const,
    failureReason: reason,
    cancelledTaskIds: tasks
      .filter((task) => task.status === "cancelled")
      .map((task) => task.taskId),
    failedTaskIds: tasks
      .filter((task) => task.status === "failed")
      .map((task) => task.taskId),
    completedTaskIds: tasks
      .filter((task) => task.status === "completed")
      .map((task) => task.taskId),
    updatedAt: now,
  };
  return normalizeSwarmRunSnapshot({
    ...snapshot,
    status: "cancelled",
    execution,
    workers,
    tasks,
    stages: snapshot.stages.map((stage) => (
      stage.status === "completed" || stage.status === "failed" || stage.status === "cancelled"
        ? { ...stage }
        : {
          ...stage,
          status: "cancelled" as const,
          failureReason: reason,
          updatedAt: now,
        }
    )),
    workerCount: workers.length,
    taskCount: tasks.length,
    assignedTaskCount: tasks.filter((task) => task.status === "assigned").length,
    completedTaskCount: tasks.filter((task) => task.status === "completed").length,
    failedTaskCount: tasks.filter((task) => task.status === "failed").length,
    cancelledTaskCount: tasks.filter((task) => task.status === "cancelled").length,
    updatedAt: now,
  });
}

function normalizeSwarmRunSnapshot(snapshot: SwarmRunSnapshot): SwarmRunSnapshot {
  if (!isPlainRecord(snapshot)) throw new Error("invalid swarm snapshot");
  const execution = normalizeExecution(snapshot.execution);
  const tasks = Array.isArray(snapshot.tasks) ? snapshot.tasks.map(normalizeTask) : invalidArray("tasks");
  const workers = Array.isArray(snapshot.workers) ? snapshot.workers.map(normalizeWorker) : invalidArray("workers");
  const status = readStatus(snapshot.status, ["running", "completed", "failed", "cancelled"]);
  const executionMode = snapshot.executionMode === "llm" ? "llm" : "coordinator_only";
  const maxAttempts = clampAttempts(snapshot.maxAttempts);
  const stages = Array.isArray(snapshot.stages)
    ? SWARM_STAGE_ORDER.map((stage) => (
      snapshot.stages.find((entry) => isPlainRecord(entry) && entry.stage === stage)
        ? normalizeStage(snapshot.stages.find((entry) => isPlainRecord(entry) && entry.stage === stage) as SwarmStageSnapshot)
        : stageSnapshotForTask(stage, tasks.find((task) => task.metadata.swarmStage === stage), undefined)
    ))
    : SWARM_STAGE_ORDER.map((stage) => stageSnapshotForTask(stage, tasks.find((task) => task.metadata.swarmStage === stage), undefined));
  return {
    runId: readId(snapshot.runId, "swarm_"),
    title: readText(snapshot.title, 240),
    objective: readText(snapshot.objective, 2_000),
    status,
    executionMode,
    maxAttempts,
    execution,
    workers,
    tasks,
    stages,
    workerCount: workers.length,
    taskCount: tasks.length,
    assignedTaskCount: tasks.filter((task) => task.status === "assigned").length,
    completedTaskCount: tasks.filter((task) => task.status === "completed").length,
    failedTaskCount: tasks.filter((task) => task.status === "failed").length,
    cancelledTaskCount: tasks.filter((task) => task.status === "cancelled").length,
    createdAt: toIso(snapshot.createdAt),
    updatedAt: toIso(snapshot.updatedAt),
  };
}

function normalizeExecution(execution: CoordinatorExecutionSnapshot): CoordinatorExecutionSnapshot {
  if (!isPlainRecord(execution)) throw new Error("invalid execution");
  return {
    executionId: readId(execution.executionId, "exec_"),
    title: readText(execution.title, 240),
    objective: readText(execution.objective, 2_000),
    status: readStatus(execution.status, ["running", "completed", "failed", "cancelled"]),
    taskIds: readStringArray(execution.taskIds, "task_"),
    completedTaskIds: readStringArray(execution.completedTaskIds, "task_"),
    failedTaskIds: readStringArray(execution.failedTaskIds, "task_"),
    cancelledTaskIds: readStringArray(execution.cancelledTaskIds, "task_"),
    result: isPlainRecord(execution.result) ? normalizeResult(execution.result) : undefined,
    failureReason: execution.failureReason === undefined ? undefined : readText(execution.failureReason, 1_000),
    createdAt: toIso(execution.createdAt),
    updatedAt: toIso(execution.updatedAt),
    metadata: normalizeMetadata(execution.metadata),
  };
}

function normalizeTask(task: CoordinatorTaskSnapshot): CoordinatorTaskSnapshot {
  if (!isPlainRecord(task)) throw new Error("invalid task");
  return {
    taskId: readId(task.taskId, "task_"),
    title: readText(task.title, 240),
    objective: readText(task.objective, 2_000),
    requiredRole: task.requiredRole === undefined ? undefined : readText(task.requiredRole, 80),
    priority: typeof task.priority === "number" && Number.isFinite(task.priority) ? task.priority : 0,
    status: readStatus(task.status, ["queued", "assigned", "blocked", "completed", "failed", "cancelled"]),
    assignedWorkerId: task.assignedWorkerId === undefined ? undefined : readId(task.assignedWorkerId, "wrk_"),
    budget: isPlainRecord(task.budget) ? { ...task.budget } : undefined,
    approval: isPlainRecord(task.approval) ? { ...task.approval } : undefined,
    security: isPlainRecord(task.security) ? {
      action: readText(task.security.action, 160),
      resource: readText(task.security.resource, 500),
      metadata: normalizeMetadata(task.security.metadata),
    } : undefined,
    policyDecisions: Array.isArray(task.policyDecisions)
      ? task.policyDecisions.map((decision) => ({ ...decision }))
      : [],
    awaitingApproval: isPlainRecord(task.awaitingApproval) ? { ...task.awaitingApproval } : undefined,
    result: isPlainRecord(task.result) ? normalizeResult(task.result) : undefined,
    failureReason: task.failureReason === undefined ? undefined : readText(task.failureReason, 1_000),
    createdAt: toIso(task.createdAt),
    updatedAt: toIso(task.updatedAt),
    metadata: normalizeMetadata(task.metadata),
  };
}

function normalizeWorker(worker: AgentWorkerSnapshot): AgentWorkerSnapshot {
  if (!isPlainRecord(worker) || !isPlainRecord(worker.session)) throw new Error("invalid worker");
  return {
    workerId: readId(worker.workerId, "wrk_"),
    agentId: readId(worker.agentId, "agent_"),
    sessionId: readId(worker.sessionId, "ses_"),
    role: readText(worker.role, 80),
    caste: readText(worker.caste, 80),
    objective: readText(worker.objective, 2_000),
    tenantScope: readText(worker.tenantScope, 160),
    parentAgentId: worker.parentAgentId === undefined ? undefined : readText(worker.parentAgentId, 120),
    state: readStatus(worker.state, ["spawned", "idle", "running", "paused", "stopped", "failed"]),
    statusReason: readText(worker.statusReason, 1_000),
    currentTask: isPlainRecord(worker.currentTask) ? {
      taskId: readId(worker.currentTask.taskId, "task_"),
      summary: readText(worker.currentTask.summary, 500),
      assignedAt: toIso(worker.currentTask.assignedAt),
    } : undefined,
    lastResult: isPlainRecord(worker.lastResult) ? normalizeResult(worker.lastResult) : undefined,
    createdAt: toIso(worker.createdAt),
    updatedAt: toIso(worker.updatedAt),
    metadata: normalizeMetadata(worker.metadata),
    session: {
      sessionId: readId(worker.session.sessionId, "ses_"),
      agentId: readId(worker.session.agentId, "agent_"),
      caste: readText(worker.session.caste, 80),
      tenantScope: readText(worker.session.tenantScope, 160),
      state: readText(worker.session.state, 80),
      messageCount: readNonNegativeInteger(worker.session.messageCount),
      totalIterations: readNonNegativeInteger(worker.session.totalIterations),
      totalTokensUsed: readNonNegativeInteger(worker.session.totalTokensUsed),
    },
  };
}

function normalizeResult(value: { summary?: unknown; completedAt?: unknown }): { summary: string; completedAt: string } {
  return {
    summary: readText(value.summary, 2_000),
    completedAt: toIso(value.completedAt),
  };
}

function readStatus<T extends string>(value: unknown, allowed: T[]): T {
  if (typeof value === "string" && (allowed as string[]).includes(value)) return value as T;
  throw new Error("invalid status");
}

function readId(value: unknown, prefix: string): string {
  if (typeof value === "string" && value.startsWith(prefix) && /^[A-Za-z0-9_-]{4,120}$/.test(value)) return value;
  throw new Error("invalid id");
}

function readText(value: unknown, maxLength: number): string {
  if (typeof value === "string" && value.length > 0 && value.length <= maxLength && !/[\0]/.test(value)) return value;
  throw new Error("invalid text");
}

function readNonNegativeInteger(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1_000_000_000) return value;
  throw new Error("invalid integer");
}

function readStringArray(value: unknown, prefix: string): string[] {
  if (!Array.isArray(value) || value.length > 1_000) throw new Error("invalid array");
  return value.map((entry) => readId(entry, prefix));
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  const cloned = cloneJson(value, 0);
  if (!isPlainRecord(cloned)) throw new Error("invalid metadata");
  return cloned;
}

function cloneJson(value: unknown, depth: number): unknown {
  if (depth > 12) throw new Error("metadata too deep");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("invalid metadata number");
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => cloneJson(entry, depth + 1));
  if (isPlainRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key.length > 160 || /[\0]/.test(key) || entry === undefined) throw new Error("invalid metadata key");
      out[key] = cloneJson(entry, depth + 1);
    }
    return out;
  }
  throw new Error("invalid metadata");
}

function toIso(value: unknown): string {
  const date = typeof value === "string" || value instanceof Date ? new Date(value) : new Date(Number.NaN);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid timestamp");
  return date.toISOString();
}

function invalidArray(label: string): never {
  throw new Error(`invalid ${label}`);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const SWARM_STAGE_ORDER: SwarmStage[] = ["plan", "execute", "review"];
const MANUAL_RETRY_ATTEMPT_LIMIT = 5;

function clampAttempts(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5 ? value : 2;
}

function stageTitle(stage: SwarmStage): string {
  if (stage === "plan") return "Plan";
  if (stage === "execute") return "Execute";
  return "Review";
}

function initialStageSnapshot(stage: SwarmStage, timestamp: string): SwarmStageSnapshot {
  return {
    stage,
    status: "pending",
    attempts: 0,
    artifacts: [],
    artifactCount: 0,
    updatedAt: timestamp,
  };
}

function stageSnapshotsFromMap(stages: Map<SwarmStage, SwarmStageSnapshot>): SwarmStageSnapshot[] {
  return SWARM_STAGE_ORDER.map((stage) => stages.get(stage) ?? initialStageSnapshot(stage, new Date().toISOString()));
}

function mergedStageSnapshots(
  stages: Map<SwarmStage, SwarmStageSnapshot>,
  tasks: CoordinatorTaskSnapshot[],
): SwarmStageSnapshot[] {
  return SWARM_STAGE_ORDER.map((stage) => {
    const task = tasks.find((candidate) => candidate.metadata.swarmStage === stage);
    const existing = stages.get(stage);
    return stageSnapshotForTask(stage, task, existing);
  });
}

function stageSnapshotForTask(
  stage: SwarmStage,
  task: CoordinatorTaskSnapshot | undefined,
  existing: SwarmStageSnapshot | undefined,
): SwarmStageSnapshot {
  const status = existing?.status && existing.status !== "pending"
    ? existing.status
    : taskStatusToStageStatus(task?.status);
  return {
    stage,
    status,
    taskId: task?.taskId ?? existing?.taskId,
    workerId: task?.assignedWorkerId ?? existing?.workerId,
    attempts: existing?.attempts ?? 0,
    startedAt: existing?.startedAt,
    endedAt: existing?.endedAt,
    summary: existing?.summary ?? task?.result?.summary,
    artifacts: existing?.artifacts ?? [],
    artifactCount: existing?.artifactCount ?? 0,
    totalTokens: existing?.totalTokens,
    estimatedCostUsd: existing?.estimatedCostUsd,
    failureReason: existing?.failureReason ?? task?.failureReason,
    awaitingApproval: existing?.awaitingApproval ?? (task?.awaitingApproval ? { ...task.awaitingApproval } : undefined),
    retryHistory: existing?.retryHistory ?? [],
    updatedAt: task?.updatedAt ?? existing?.updatedAt ?? new Date().toISOString(),
  };
}

function taskStatusToStageStatus(status: CoordinatorTaskSnapshot["status"] | undefined): SwarmStageStatus {
  if (status === "assigned") return "running";
  if (status === "blocked") return "awaiting_approval";
  if (status === "completed" || status === "failed" || status === "cancelled") return status;
  return "pending";
}

function statusFromStages(
  stages: SwarmStageSnapshot[],
  fallback: SwarmRunStatus,
): SwarmRunStatus {
  if (stages.some((stage) => stage.status === "cancelled")) return "cancelled";
  if (stages.some((stage) => stage.status === "failed")) return "failed";
  if (stages.every((stage) => stage.status === "completed")) return "completed";
  return fallback === "failed" || fallback === "cancelled" ? fallback : "running";
}

function resetStageAndDependents(
  stages: Map<SwarmStage, SwarmStageSnapshot>,
  fromStage: SwarmStage,
): void {
  const now = new Date().toISOString();
  for (const stage of SWARM_STAGE_ORDER.slice(SWARM_STAGE_ORDER.indexOf(fromStage))) {
    const existing = stages.get(stage);
    const retryHistory = appendStageRetryHistory(existing);
    stages.set(stage, {
      ...initialStageSnapshot(stage, now),
      taskId: existing?.taskId,
      workerId: existing?.workerId,
      attempts: stage === fromStage ? existing?.attempts ?? 0 : 0,
      retryHistory,
    });
  }
}

function markRunStageFailure(
  run: SwarmRunRecord,
  stage: SwarmStage,
  reason: string,
): void {
  const now = new Date().toISOString();
  const existing = run.stages.get(stage) ?? initialStageSnapshot(stage, now);
  run.stages.set(stage, {
    ...existing,
    status: "failed",
    startedAt: existing.startedAt ?? now,
    endedAt: now,
    failureReason: readTextSafe(reason, 1_000),
    updatedAt: now,
  });
  run.updatedAt = now;
}

function resetPersistedStageAndDependents(
  snapshot: SwarmRunSnapshot,
  fromStage: SwarmStage,
): SwarmRunSnapshot {
  let current = normalizeSwarmRunSnapshot(snapshot);
  for (const stage of SWARM_STAGE_ORDER.slice(SWARM_STAGE_ORDER.indexOf(fromStage))) {
    const existing = current.stages.find((entry) => entry.stage === stage);
    current = upsertPersistedStage(current, {
      ...initialStageSnapshot(stage, new Date().toISOString()),
      taskId: existing?.taskId,
      workerId: existing?.workerId,
      attempts: stage === fromStage ? existing?.attempts ?? 0 : 0,
      retryHistory: appendStageRetryHistory(existing),
    });
  }
  return {
    ...current,
    status: "running",
    execution: { ...current.execution, status: "running" },
    updatedAt: new Date().toISOString(),
  };
}

function preservePersistedApprovalWait(
  snapshot: SwarmRunSnapshot,
  stage: SwarmStage,
): SwarmRunSnapshot {
  const current = normalizeSwarmRunSnapshot(snapshot);
  const existing = current.stages.find((entry) => entry.stage === stage) ?? initialStageSnapshot(stage, current.updatedAt);
  const now = new Date().toISOString();
  return upsertPersistedStage(current, {
    ...existing,
    status: "awaiting_approval",
    awaitingApproval: existing.awaitingApproval,
    failureReason: undefined,
    endedAt: undefined,
    updatedAt: now,
  });
}

function upsertPersistedStage(
  snapshot: SwarmRunSnapshot,
  stage: SwarmStageSnapshot,
): SwarmRunSnapshot {
  const stages = SWARM_STAGE_ORDER.map((candidate) => (
    candidate === stage.stage
      ? normalizeStage(stage)
      : snapshot.stages.find((entry) => entry.stage === candidate) ?? initialStageSnapshot(candidate, snapshot.updatedAt)
  ));
  const status = stages.some((entry) => entry.status === "failed")
    ? "failed"
    : stages.every((entry) => entry.status === "completed")
      ? "completed"
      : "running";
  const now = new Date().toISOString();
  return normalizeSwarmRunSnapshot({
    ...snapshot,
    status,
    execution: {
      ...snapshot.execution,
      status,
      updatedAt: now,
    },
    stages,
    updatedAt: now,
  });
}

function withPersistedStageFailure(
  snapshot: SwarmRunSnapshot,
  stage: SwarmStage,
  reason: string,
): SwarmRunSnapshot {
  const existing = snapshot.stages.find((entry) => entry.stage === stage) ?? initialStageSnapshot(stage, snapshot.updatedAt);
  return upsertPersistedStage(snapshot, {
    ...existing,
    status: "failed",
    startedAt: existing.startedAt ?? new Date().toISOString(),
    endedAt: new Date().toISOString(),
    attempts: existing.attempts,
    failureReason: readTextSafe(reason, 1_000),
    updatedAt: new Date().toISOString(),
  });
}

function finalizePersistedSnapshot(snapshot: SwarmRunSnapshot): SwarmRunSnapshot {
  const now = new Date().toISOString();
  const status = snapshot.stages.every((entry) => entry.status === "completed") ? "completed" : snapshot.status;
  return normalizeSwarmRunSnapshot({
    ...snapshot,
    status,
    execution: {
      ...snapshot.execution,
      status,
      result: status === "completed"
        ? {
          summary: snapshot.stages.map((stage) => stage.summary ?? `${stage.stage} complete`).join("\n"),
          completedAt: now,
        }
        : snapshot.execution.result,
      updatedAt: now,
    },
    completedTaskCount: status === "completed" ? snapshot.taskCount : snapshot.completedTaskCount,
    failedTaskCount: status === "completed" ? 0 : snapshot.failedTaskCount,
    updatedAt: now,
  });
}

function normalizeStage(stage: SwarmStageSnapshot): SwarmStageSnapshot {
  if (!isPlainRecord(stage)) throw new Error("invalid swarm stage");
  const normalizedStage = readStatus(stage.stage, SWARM_STAGE_ORDER);
  const artifacts = Array.isArray(stage.artifacts) ? normalizeStageArtifacts(stage.artifacts) : [];
  const artifactReview = Array.isArray(stage.artifactReview)
    ? stage.artifactReview.slice(0, 10).map(normalizeStageArtifactReview)
    : summarizeStageArtifacts(artifacts);
  return {
    stage: normalizedStage,
    status: readStatus(stage.status, ["pending", "running", "awaiting_approval", "completed", "failed", "cancelled"]),
    taskId: stage.taskId === undefined ? undefined : readId(stage.taskId, "task_"),
    workerId: stage.workerId === undefined ? undefined : readId(stage.workerId, "wrk_"),
    attempts: clampAttemptsAllowZero(stage.attempts),
    startedAt: stage.startedAt === undefined ? undefined : toIso(stage.startedAt),
    endedAt: stage.endedAt === undefined ? undefined : toIso(stage.endedAt),
    summary: stage.summary === undefined ? undefined : readText(stage.summary, 2_000),
    artifacts,
    artifactCount: artifacts.length,
    artifactReview,
    totalTokens: validOptionalNumber(stage.totalTokens),
    estimatedCostUsd: validOptionalNumber(stage.estimatedCostUsd),
    failureReason: stage.failureReason === undefined ? undefined : readText(stage.failureReason, 1_000),
    awaitingApproval: isPlainRecord(stage.awaitingApproval)
      ? {
        reason: stage.awaitingApproval.reason === undefined ? undefined : readText(stage.awaitingApproval.reason, 500),
        requiredApprover: stage.awaitingApproval.requiredApprover === undefined ? undefined : readText(stage.awaitingApproval.requiredApprover, 120),
        requestedAt: stage.awaitingApproval.requestedAt === undefined ? undefined : toIso(stage.awaitingApproval.requestedAt),
      }
      : undefined,
    retryHistory: Array.isArray(stage.retryHistory)
      ? stage.retryHistory.slice(0, 10).map(normalizeStageAttemptHistory)
      : [],
    updatedAt: toIso(stage.updatedAt),
  };
}

function appendStageRetryHistory(existing: SwarmStageSnapshot | undefined): SwarmStageAttemptHistory[] {
  const current = existing?.retryHistory ?? [];
  const entry = stageAttemptHistoryEntry(existing);
  return entry ? [...current, entry].slice(-10) : current;
}

function appendInterruptedStageRetryHistory(existing: SwarmStageSnapshot | undefined): SwarmStageAttemptHistory[] {
  const current = existing?.retryHistory ?? [];
  const entry = interruptedStageAttemptHistoryEntry(existing);
  return entry ? [...current, entry].slice(-10) : current;
}

function interruptedStageAttemptHistoryEntry(stage: SwarmStageSnapshot | undefined): SwarmStageAttemptHistory | null {
  if (!stage || stage.status !== "running" || stage.attempts <= 0) return null;
  const now = new Date().toISOString();
  return normalizeStageAttemptHistory({
    attempt: stage.attempts,
    status: "cancelled",
    summary: stage.summary,
    failureReason: "interrupted before resume",
    startedAt: stage.startedAt,
    endedAt: now,
    artifactCount: stage.artifactCount,
    totalTokens: stage.totalTokens,
    estimatedCostUsd: stage.estimatedCostUsd,
    updatedAt: now,
  });
}

function stageAttemptHistoryEntry(stage: SwarmStageSnapshot | undefined): SwarmStageAttemptHistory | null {
  if (!stage || stage.attempts <= 0) return null;
  if (stage.status !== "completed" && stage.status !== "failed" && stage.status !== "cancelled") return null;
  return normalizeStageAttemptHistory({
    attempt: stage.attempts,
    status: stage.status,
    summary: stage.summary,
    failureReason: stage.failureReason,
    startedAt: stage.startedAt,
    endedAt: stage.endedAt,
    artifactCount: stage.artifactCount,
    totalTokens: stage.totalTokens,
    estimatedCostUsd: stage.estimatedCostUsd,
    updatedAt: stage.updatedAt,
  });
}

function normalizeStageAttemptHistory(value: unknown): SwarmStageAttemptHistory {
  if (!isPlainRecord(value)) throw new Error("invalid swarm retry history");
  return {
    attempt: clampAttemptsAllowZero(value.attempt),
    status: readStatus(value.status, ["completed", "failed", "cancelled"]),
    summary: value.summary === undefined ? undefined : readText(value.summary, 2_000),
    failureReason: value.failureReason === undefined ? undefined : readText(value.failureReason, 1_000),
    startedAt: value.startedAt === undefined ? undefined : toIso(value.startedAt),
    endedAt: value.endedAt === undefined ? undefined : toIso(value.endedAt),
    artifactCount: readNonNegativeInteger(value.artifactCount),
    totalTokens: validOptionalNumber(value.totalTokens),
    estimatedCostUsd: validOptionalNumber(value.estimatedCostUsd),
    updatedAt: toIso(value.updatedAt),
  };
}

function normalizeStageArtifacts(artifacts: unknown[]): SwarmStageArtifact[] {
  return artifacts.slice(0, 10).map((artifact) => {
    if (!isPlainRecord(artifact)) throw new Error("invalid swarm stage artifact");
    return {
      type: readText(artifact.type, 80),
      name: readText(artifact.name, 160),
      content: artifact.content === undefined ? undefined : readText(artifact.content, 10_000),
      uri: artifact.uri === undefined ? undefined : readText(artifact.uri, 1_000),
      metadata: artifact.metadata === undefined ? undefined : normalizeMetadata(artifact.metadata),
    };
  });
}

function summarizeStageArtifacts(artifacts: SwarmStageArtifact[]): SwarmStageArtifactReview[] {
  return artifacts.slice(0, 10).map((artifact) => {
    const content = artifact.content ?? "";
    const preview = content ? redactArtifactPreview(content) : undefined;
    return {
      type: artifact.type,
      name: artifact.name,
      uri: artifact.uri,
      contentBytes: content.length,
      preview,
      metadataKeys: artifact.metadata ? Object.keys(artifact.metadata).slice(0, 20).map((key) => readTextSafe(key, 80)) : [],
      externalContent: Boolean(artifact.uri && !artifact.content),
    };
  });
}

function normalizeStageArtifactReview(value: unknown): SwarmStageArtifactReview {
  if (!isPlainRecord(value)) throw new Error("invalid swarm artifact review");
  return {
    type: readText(value.type, 80),
    name: readText(value.name, 160),
    uri: value.uri === undefined ? undefined : readText(value.uri, 1_000),
    contentBytes: readNonNegativeInteger(value.contentBytes),
    preview: value.preview === undefined ? undefined : redactArtifactPreview(readText(value.preview, 500)),
    metadataKeys: Array.isArray(value.metadataKeys)
      ? value.metadataKeys.slice(0, 20).map((key) => readText(key, 80))
      : [],
    externalContent: value.externalContent === true,
  };
}

function redactArtifactPreview(content: string): string {
  const compact = content.replace(/\s+/g, " ").trim();
  const redacted = compact
    .replace(/\bsk-[A-Za-z0-9._-]{8,}\b/g, "[REDACTED]")
    .replace(/\b(?:api[_-]?key|token|secret|authorization)\b\s*[:=]\s*"?[^",}\s]+/gi, (match) => {
      const separatorIndex = Math.max(match.indexOf(":"), match.indexOf("="));
      const prefix = separatorIndex >= 0 ? match.slice(0, separatorIndex + 1) : "secret:";
      return `${prefix}[REDACTED]`;
    });
  return redacted.length > 240 ? `${redacted.slice(0, 237)}...` : redacted;
}

function clampAttemptsAllowZero(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 5 ? value : 0;
}

function readStageSummary(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? readTextSafe(value, 2_000) : "Swarm stage completed";
}

function readTextSafe(value: string, maxLength: number): string {
  const sanitized = value.replace(/\0/g, "").trim();
  return sanitized.length > maxLength ? sanitized.slice(0, maxLength) : sanitized || "unknown";
}

function validOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function parseAgentLoopArtifactStats(run: WorkflowRun): { totalTokens?: number; estimatedCostUsd?: number } {
  for (const artifact of run.artifacts) {
    if (!artifact.content || artifact.type !== "json") continue;
    try {
      const parsed = JSON.parse(artifact.content) as Record<string, unknown>;
      return {
        totalTokens: validOptionalNumber(parsed.totalTokens),
        estimatedCostUsd: validOptionalNumber(parsed.estimatedCostUsd),
      };
    } catch {
      continue;
    }
  }
  return {};
}

function formatSwarmStagePrompt(input: SwarmStageRunnerInput): string {
  const previous = input.previousStages
    .filter((stage) => stage.summary)
    .map((stage) => `${stage.stage}: ${stage.summary}`)
    .join("\n");
  return [
    `Swarm Run: ${input.title}`,
    `Run ID: ${input.runId}`,
    `Objective: ${input.objective}`,
    `Stage: ${input.stage}`,
    `Attempt: ${input.attempt}`,
    previous ? `Previous stages:\n${previous}` : "Previous stages: none",
    stageInstruction(input.stage),
  ].join("\n");
}

function stageInstruction(stage: SwarmStage): string {
  if (stage === "plan") {
    return "Produce a concise implementation plan. Do not claim execution.";
  }
  if (stage === "execute") {
    return "Execute the approved plan as model output only unless tools are separately approved by the runtime.";
  }
  return "Review the execution result, name risks, and state verification evidence needed.";
}

function newSwarmRunId(): string {
  return `swarm_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
