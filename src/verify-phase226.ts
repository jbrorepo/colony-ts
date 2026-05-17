/**
 * Phase 226 Verification Script - Launch Alpha 0 LLM Swarm Execution
 *
 * Verifies real AgentLoop-backed swarm stage execution, detailed status,
 * durable resume, and bounded retry without live network calls.
 *
 * Run: bun run src/verify-phase226.ts
 */

import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import {
  ColonySwarmRuntime,
  JsonSwarmRunStore,
  createAgentLoopSwarmStageRunner,
} from "./orchestrator";
import { buildSwarmCommandPayload } from "./gateway-swarm";
import { SlashCommandParser, executeCommand } from "./gateway";
import { Caste } from "./caste/enums";
import { LLMProvider, type CompletionParams } from "./llm/base";
import {
  createLLMResponse,
  type LLMChunk,
  type LLMMessage,
  type LLMResponse,
  type ModelInfo,
} from "./llm/models";
import { providerManager } from "./llm/provider-manager";
import { AgentLoop } from "./runtime/loop";
import { createAgentSession } from "./runtime/session";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  assert(actual === expected, `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}\n  ${title}\n${"=".repeat(60)}`);
}

class AlphaSwarmProvider extends LLMProvider {
  readonly prompts: string[] = [];
  failuresRemaining = 0;

  constructor() {
    super("alpha_swarm_mock");
  }

  async complete(messages: LLMMessage[], params?: CompletionParams): Promise<LLMResponse> {
    const prompt = messages.map((message) => message.content).join("\n");
    this.prompts.push(prompt);
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("transient alpha swarm failure");
    }
    const stage = prompt.includes("Stage: review")
      ? "review"
      : prompt.includes("Stage: execute")
        ? "execute"
        : "plan";
    return createLLMResponse(`alpha ${stage} complete`, params?.model ?? "alpha-swarm-model", this.providerName, {
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      finishReason: "stop",
    });
  }

  async *stream(_messages: LLMMessage[], params?: CompletionParams): AsyncIterable<LLMChunk> {
    const response = await this.complete(_messages, params);
    yield {
      delta: response.content,
      model: params?.model ?? "alpha-swarm-model",
      finishReason: "stop",
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  listModels(): ModelInfo[] {
    return [{
      modelId: "alpha-swarm-model",
      provider: this.providerName,
      contextWindow: 8192,
      supportsStreaming: true,
      supportsEmbedding: false,
      supportsToolUse: false,
    }];
  }
}

function createLoopForStage(provider: AlphaSwarmProvider, stageCaste: Caste): AgentLoop {
  providerManager.register(provider.providerName, provider);
  return new AgentLoop({
    session: createAgentSession({
      agentId: `alpha-${stageCaste}`,
      caste: stageCaste,
    }),
    config: {
      tenant: "launch-alpha0",
      model: "alpha-swarm-model",
      maxIterations: 1,
      cavemanBridge: false,
    },
    usageTracker: null,
    llmConfig: {
      defaults: { provider: provider.providerName, model: "alpha-swarm-model" },
      providers: { [provider.providerName]: { defaultModel: "alpha-swarm-model" } },
      casteModels: {
        eldest_architect: { provider: provider.providerName, model: "alpha-swarm-model" },
        forge_carvers: { provider: provider.providerName, model: "alpha-swarm-model" },
        watcher_swarm: { provider: provider.providerName, model: "alpha-swarm-model" },
      },
      failover: {},
    },
  });
}

async function verifyAgentLoopBackedSwarm(): Promise<void> {
  section("1. AgentLoop-backed swarm execution");
  const provider = new AlphaSwarmProvider();
  const runner = createAgentLoopSwarmStageRunner({
    createLoop: ({ stage }) => createLoopForStage(
      provider,
      stage === "plan"
        ? Caste.ELDEST_ARCHITECT
        : stage === "execute"
          ? Caste.FORGE_CARVERS
          : Caste.WATCHER_SWARM,
    ),
  });
  const runtime = new ColonySwarmRuntime({ llmRunner: runner });
  const run = await runtime.startObjective({
    title: "Alpha swarm",
    objective: "Prepare alpha launch notes.",
    executionMode: "llm",
  });

  assertEqual(run.executionMode, "llm", "Swarm records llm execution mode");
  assertEqual(run.status, "completed", "LLM swarm completes all stages");
  assertEqual(run.completedTaskCount, 3, "Coordinator tasks complete from LLM stage results");
  assert(run.stages.every((stage) => stage.status === "completed"), "All stage snapshots complete");
  assert(run.stages.some((stage) => stage.artifactCount > 0), "Stage artifacts are persisted");
  assert(provider.prompts.some((prompt) => prompt.includes("Stage: plan")), "AgentLoop prompt includes plan stage");
  assert(provider.prompts.some((prompt) => prompt.includes("Stage: execute")), "AgentLoop prompt includes execute stage");
  assert(provider.prompts.some((prompt) => prompt.includes("Stage: review")), "AgentLoop prompt includes review stage");
}

async function verifyDurableResumeAndRetry(): Promise<void> {
  section("2. Durable resume and retry");
  const root = await mkdtemp(join(tmpdir(), "colony-alpha-swarm-"));
  try {
    const provider = new AlphaSwarmProvider();
    const runner = createAgentLoopSwarmStageRunner({
      createLoop: ({ stage }) => createLoopForStage(provider, stage === "review" ? Caste.WATCHER_SWARM : Caste.FORGE_CARVERS),
    });
    const store = new JsonSwarmRunStore({ rootDir: root });
    const runtime = new ColonySwarmRuntime({ store, llmRunner: runner });
    provider.failuresRemaining = 1;
    const failedRun = await runtime.startObjective({
      objective: "Exercise retry.",
      executionMode: "llm",
      maxAttempts: 1,
    });
    assertEqual(failedRun.status, "failed", "Initial transient failure records failed run");
    assert(failedRun.stages.some((stage) => stage.status === "failed"), "Failed stage is visible");

    const restarted = new ColonySwarmRuntime({
      store: new JsonSwarmRunStore({ rootDir: root }),
      llmRunner: runner,
    });
    await restarted.loadPersistedRuns();
    const retried = await restarted.retryStage(failedRun.runId, "plan");
    assertEqual(retried?.status, "completed", "Retry can complete a persisted failed run");
    assert(retried?.stages.every((stage) => stage.status === "completed") ?? false, "Retry resumes downstream stages");

    const resumed = await restarted.resumeRun(failedRun.runId);
    assertEqual(resumed?.runId, failedRun.runId, "Resume keeps original run id");
    assertEqual(resumed?.status, "completed", "Resume preserves completed persisted run");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyGatewaySurface(): Promise<void> {
  section("3. /swarm status, resume, retry commands");
  const parser = new SlashCommandParser();
  const llm = parser.tryHandle('/swarm llm "ship alpha notes"');
  assertEqual(llm.action?.kind, "start_swarm", "/swarm llm emits start action");
  assertEqual(llm.data.executionMode, "llm", "/swarm llm records execution mode");

  const runs = [
    {
      runId: "swarm_alpha",
      title: "Alpha",
      objective: "Launch alpha",
      status: "failed" as const,
      executionMode: "llm" as const,
      maxAttempts: 2,
      execution: {
        executionId: "exec_alpha",
        title: "Alpha",
        objective: "Launch alpha",
        status: "failed" as const,
        taskIds: [],
        completedTaskIds: [],
        failedTaskIds: [],
        cancelledTaskIds: [],
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        metadata: {},
      },
      workers: [],
      tasks: [],
      stages: [
        {
          stage: "plan" as const,
          status: "failed" as const,
          attempts: 1,
          artifacts: [],
          artifactCount: 0,
          failureReason: "mock failure",
          updatedAt: new Date(0).toISOString(),
        },
      ],
      workerCount: 0,
      taskCount: 0,
      assignedTaskCount: 0,
      completedTaskCount: 0,
      failedTaskCount: 1,
      cancelledTaskCount: 0,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
  ];
  const detail = buildSwarmCommandPayload(["status", "swarm_alpha"], { runs });
  assert(detail.output.includes("Stage Details"), "/swarm status <id> renders stage detail");
  assert(detail.output.includes("mock failure"), "/swarm status <id> renders failure reason");

  const resume = parser.tryHandle("/swarm resume swarm_alpha");
  assertEqual(resume.action?.kind, "resume_swarm", "/swarm resume emits resume action");
  const retry = parser.tryHandle("/swarm retry swarm_alpha plan");
  assertEqual(retry.action?.kind, "retry_swarm_stage", "/swarm retry emits retry action");

  const actions: string[] = [];
  await executeCommand(resume, {
    submitChat: async () => {},
    exitApp: () => {},
    resetSession: () => {},
    requestCompaction: async () => {},
    setBudgetCap: () => {},
    showSystemMessage: (message) => actions.push(`system:${message}`),
    showErrorMessage: (message) => actions.push(`error:${message}`),
    resumeSwarm: async (runId) => {
      actions.push(`resume:${runId}`);
      return "resumed swarm_alpha";
    },
  });
  assert(actions.includes("resume:swarm_alpha"), "Executor routes resume swarm action");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 226 Verification (Alpha LLM Swarm)\n");
  await verifyAgentLoopBackedSwarm();
  await verifyDurableResumeAndRetry();
  await verifyGatewaySurface();

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 226: alpha LLM swarm is GREEN.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
