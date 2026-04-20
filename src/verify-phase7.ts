/**
 * Phase 7 Verification Script — The Brain
 *
 * Validates the critical path subsystems:
 *   1. LLM Providers  — Ollama, Anthropic, OpenAI-compatible
 *   2. FailoverExecutor — candidate chain walking, circuit breakers
 *   3. AgentLoop        — configuration, cost tracking, retry classification
 *   4. PromptBuilder    — caste-aware system prompt construction
 *   5. Gateway          — expanded slash commands (10)
 *
 * Run: bun run src/verify-phase7.ts
 */

import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { OllamaProvider } from "./llm/providers/ollama";
import { LLMProvider, type CompletionParams } from "./llm/base";
import { FailoverExecutor, type FailoverEvent } from "./llm/failover-executor";
import { CircuitBreaker } from "./llm/circuit-breaker";
import { providerManager, ProviderManager } from "./llm/provider-manager";
import { ModelSelector, defaultLLMConfig } from "./llm/selector";
import {
  AgentLoop,
  CostTracker,
  CostBudgetExceededError,
  isRetryableError,
  type LoopConfig,
  DEFAULT_LOOP_CONFIG,
} from "./runtime/loop";
import { PromptBuilder } from "./runtime/prompt-builder";
import { PromptAssembler } from "./runtime/prompt-assembler";
import { IdentityRegistry, createAgentIdentity, createPersonaConfig } from "./runtime/identity";
import { Caste } from "./caste/enums";
import {
  executeCommand,
  parseCommand,
  formatHelp,
  formatStatus,
  formatCaste,
  formatPermissions,
  SlashCommandParser,
} from "./gateway";
import { createAgentSession, addMessage } from "./runtime/session";
import {
  createLLMResponse,
  emptyTokenUsage,
  type LLMChunk,
  type LLMMessage,
  type LLMResponse,
  type ModelInfo,
} from "./llm/models";
import {
  LLMConnectionError,
  LLMRateLimitError,
  LLMResponseError,
  LLMError,
} from "./llm/exceptions";
import {
  createSystemMessage,
  createUserMessage,
  createAssistantMessage,
  createToolResult,
} from "./runtime/message";
import { buildPersistedToolResultMessage } from "./runtime/tool-result-storage";
import {
  createSessionRecoverySnapshot,
  detectSessionInterruption,
  listPersistedSessions,
  loadPersistedSessionHistoryExcerpt,
  loadSessionRecovery,
  persistSessionRecovery,
  sessionRecoveryPaths,
} from "./runtime/session-recovery";
import { getDataPath, settings } from "./settings";

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("═".repeat(60));
}

// ---------------------------------------------------------------------------
// 1. OllamaProvider — Structure & Configuration
// ---------------------------------------------------------------------------

class MockStreamingProvider extends LLMProvider {
  constructor() {
    super("stream_mock");
  }

  async complete(
    _messages: LLMMessage[],
    params?: CompletionParams,
  ): Promise<LLMResponse> {
    return createLLMResponse("Hello", params?.model ?? "mock-model", this.providerName, {
      usage: {
        promptTokens: 4,
        completionTokens: 2,
        totalTokens: 6,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    });
  }

  async *stream(
    _messages: LLMMessage[],
    params?: CompletionParams,
  ): AsyncIterable<LLMChunk> {
    const model = params?.model ?? "mock-model";
    yield { delta: "Hel", model, finishReason: null };
    yield { delta: "lo", model, finishReason: "stop" };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  listModels(): ModelInfo[] {
    return [{
      modelId: "mock-model",
      provider: this.providerName,
      contextWindow: 4096,
      supportsStreaming: true,
      supportsEmbedding: false,
      supportsToolUse: false,
    }];
  }
}

function verifyOllamaProvider(): void {
  section("1. OllamaProvider — Structure & Configuration");

  const provider = new OllamaProvider({
    baseUrl: "http://localhost:11434",
    defaultModel: "llama3.2",
  });

  assertEqual(provider.providerName, "ollama", "Provider name");
  assert(typeof provider.complete === "function", "Has complete()");
  assert(typeof provider.stream === "function", "Has stream()");
  assert(typeof provider.healthCheck === "function", "Has healthCheck()");
  assert(typeof provider.listModels === "function", "Has listModels()");

  const models = provider.listModels();
  assert(models.length > 0, "Lists known models");
  assert(models.some(m => m.modelId.includes("llama")), "Includes llama model");
  assert(models.every(m => m.supportsStreaming), "All support streaming");
  assert(models.every(m => m.provider === "ollama"), "All tagged with provider");
}

// ---------------------------------------------------------------------------
// 2. FailoverExecutor — Chain Walking & Circuit Breakers
// ---------------------------------------------------------------------------

async function verifyFailoverExecutor(): Promise<void> {
  section("2. FailoverExecutor — Chain Walking & Circuit Breakers");

  // Create a mock provider getter
  const mockResponse = createLLMResponse("Hello", "test-model", "test-provider");
  let callCount = 0;

  const mockProvider = {
    providerName: "mock",
    complete: async () => { callCount++; return mockResponse; },
    stream: async function* () { yield { delta: "hi", model: "test", finishReason: null }; },
    healthCheck: async () => true,
    listModels: () => [],
    embed: async () => { throw new Error("Not supported"); },
  };

  const executor = new FailoverExecutor(
    (name: string) => {
      if (name === "mock") return mockProvider as any;
      throw new Error(`Unknown provider: ${name}`);
    },
    { maxRetriesPerProvider: 2 },
  );

  // Circuit breaker per provider
  const breaker = executor.getBreaker("mock");
  assert(breaker instanceof CircuitBreaker, "Creates breaker per provider");
  assertEqual(breaker.state, "closed", "Starts closed");

  // Health tracking
  const health = executor.getProviderHealth();
  assert("mock" in health, "Provider tracked in health");
  assertEqual(health.mock.state, "closed", "Health shows closed state");
  assertEqual(executor.lastSuccessfulCandidate, null, "No successful candidate before execution");

  // Failover event log
  assertEqual(executor.failoverEvents.length, 0, "Starts with no events");
  executor.clearEvents();
  assertEqual(executor.failoverEvents.length, 0, "Clear events works");

  await executor.complete(
    [{ providerName: "mock", modelId: "mock-model", source: "test" }],
    [{ role: "user", content: "ping" }],
  );
  assertEqual(executor.lastSuccessfulCandidate?.providerName, "mock", "Successful complete records provider");
  assertEqual(executor.lastSuccessfulCandidate?.modelId, "mock-model", "Successful complete records model");

  // Circuit breaker state transitions
  const breaker2 = executor.getBreaker("test-breaker");
  breaker2.recordFailure();
  breaker2.recordFailure();
  breaker2.recordFailure();
  assertEqual(breaker2.state, "open", "Breaker opens after threshold");
  assert(!breaker2.isAvailable(), "Open breaker blocks calls");
}

// ---------------------------------------------------------------------------
// 3. AgentLoop — Config, CostTracker, Retry Classification
// ---------------------------------------------------------------------------

function verifyAgentLoop(): void {
  section("3. AgentLoop — Config, CostTracker, Retry Logic");

  // LoopConfig defaults
  assertEqual(DEFAULT_LOOP_CONFIG.maxIterations, 20, "Default max iterations");
  assertEqual(DEFAULT_LOOP_CONFIG.timeoutSeconds, 300, "Default timeout");
  assertEqual(DEFAULT_LOOP_CONFIG.autoCompact, true, "Default auto-compact on");
  assertEqual(DEFAULT_LOOP_CONFIG.enableParallelTools, true, "Default parallel tools on");
  assertEqual(DEFAULT_LOOP_CONFIG.contextWindowTokens, 200_000, "Default context window");
  assertEqual(DEFAULT_LOOP_CONFIG.maxRetries, 3, "Default max retries");

  // CostTracker — basic tracking
  const tracker = new CostTracker("gpt-4o");
  tracker.track({
    promptTokens: 1000,
    completionTokens: 500,
    totalTokens: 1500,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
  assertEqual(tracker.totalInputTokens, 1000, "Tracks input tokens");
  assertEqual(tracker.totalOutputTokens, 500, "Tracks output tokens");
  assertEqual(tracker.totalTokens, 1500, "Tracks total tokens");
  assertEqual(tracker.callCount, 1, "Tracks call count");
  assert(tracker.estimatedCostUsd > 0, "Estimates cost > 0");

  // CostTracker — cache-aware pricing
  const cacheTracker = new CostTracker("claude-sonnet-4-5");
  cacheTracker.track({
    promptTokens: 1000,
    completionTokens: 200,
    totalTokens: 1200,
    cacheReadTokens: 5000,
    cacheWriteTokens: 2000,
  });
  assert(cacheTracker.totalTokens > 1200, "Cache tokens included in total");
  assert(cacheTracker.estimatedCostUsd > 0, "Cache-aware cost > 0");

  // CostTracker — budget enforcement
  const budgetTracker = new CostTracker("gpt-4o", 0.001);
  let budgetExceeded = false;
  try {
    budgetTracker.track({
      promptTokens: 1_000_000,
      completionTokens: 500_000,
      totalTokens: 1_500_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  } catch (e) {
    if (e instanceof CostBudgetExceededError) budgetExceeded = true;
  }
  assert(budgetExceeded, "Budget enforcement raises CostBudgetExceededError");

  // CostTracker — format summary
  const summary = tracker.formatSummary();
  assert(summary.includes("Session Cost Summary"), "Summary has header");
  assert(summary.includes("gpt-4o"), "Summary includes model name");
  assert(summary.includes("Total"), "Summary includes total row");
  assert(summary.includes("API time"), "Summary includes API time");

  // CostTracker — snapshot round-trip
  const snap = tracker.toSnapshot();
  const restored = CostTracker.fromSnapshot(snap);
  assertEqual(restored.totalInputTokens, tracker.totalInputTokens, "Snapshot preserves input tokens");
  assertEqual(restored.totalOutputTokens, tracker.totalOutputTokens, "Snapshot preserves output tokens");
  assertEqual(restored.callCount, tracker.callCount, "Snapshot preserves call count");

  const multiModelTracker = new CostTracker("gpt-4o");
  multiModelTracker.track({
    promptTokens: 2000,
    completionTokens: 500,
    totalTokens: 2500,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }, "gpt-4o", 1.25);
  multiModelTracker.track({
    promptTokens: 1500,
    completionTokens: 250,
    totalTokens: 1750,
    cacheReadTokens: 400,
    cacheWriteTokens: 100,
  }, "claude-sonnet-4-5", 2.5);
  const modelUsage = multiModelTracker.modelUsage;
  assertEqual(Object.keys(modelUsage).length, 2, "Per-model tracker stores two model rows");
  assertEqual(modelUsage["gpt-4o"]?.callCount ?? 0, 1, "Per-model tracker counts first model call");
  assertEqual(modelUsage["claude-sonnet-4-5"]?.cacheReadTokens ?? 0, 400, "Per-model tracker preserves cache reads");
  assert(Math.abs((modelUsage["claude-sonnet-4-5"]?.apiDurationS ?? 0) - 2.5) < 0.0001, "Per-model tracker preserves API duration");

  const multiSnap = multiModelTracker.toSnapshot();
  const restoredMulti = CostTracker.fromSnapshot(multiSnap);
  assertEqual(Object.keys(restoredMulti.modelUsage).length, 2, "Snapshot restores per-model usage rows");
  assertEqual(restoredMulti.modelUsage["claude-sonnet-4-5"]?.callCount ?? 0, 1, "Snapshot restores per-model call count");
  assert(restoredMulti.formatSummary().includes("claude-sonnet-4-5"), "Summary includes restored second model");

  // Retry classification
  section("3b. Retry Error Classification");

  // 429 → retry
  assert(
    isRetryableError(new LLMRateLimitError("rate limited", { provider: "test" })),
    "429 rate limit → retryable",
  );

  // 401 → no retry
  assert(
    !isRetryableError(new LLMResponseError("unauthorized", { statusCode: 401 })),
    "401 auth → NOT retryable",
  );

  // 403 → no retry
  assert(
    !isRetryableError(new LLMResponseError("forbidden", { statusCode: 403 })),
    "403 forbidden → NOT retryable",
  );

  // Connection refused → no retry
  assert(
    !isRetryableError(new Error("Connection refused")),
    "Connection refused → NOT retryable",
  );

  // Timeout → retry
  const timeoutErr = new Error("Request timed out");
  timeoutErr.name = "TimeoutError";
  assert(isRetryableError(timeoutErr), "TimeoutError → retryable");

  // Context length → no retry
  assert(
    !isRetryableError(new Error("context_length_exceeded")),
    "Context length error → NOT retryable",
  );

  // 502 → retry
  assert(
    isRetryableError(new LLMConnectionError("bad gateway", { provider: "test" })),
    "LLMConnectionError → retryable",
  );
}

// ---------------------------------------------------------------------------
// 4. PromptBuilder — Caste-Aware Prompts
// ---------------------------------------------------------------------------

function verifyPromptBuilder(): void {
  section("4. PromptBuilder — Caste-Aware Prompts");

  // Root Queen prompt
  const queenPrompt = PromptBuilder.buildSystemPrompt({
    caste: Caste.ROOT_QUEEN,
    includeManifesto: true,
  });
  assert(queenPrompt.includes("## Identity: Root Queen"), "Queen: identity header included");
  assert(queenPrompt.includes("supreme coordinator"), "Queen: identity description");
  assert(queenPrompt.includes("Manifesto"), "Queen: manifesto included");
  assert(queenPrompt.includes("Safety before success"), "Queen: manifesto principles");

  // Forge Carver prompt
  const forgePrompt = PromptBuilder.buildSystemPrompt({
    caste: Caste.FORGE_CARVERS,
    toolNames: ["file_read", "file_write", "shell_exec"],
  });
  assert(forgePrompt.includes("Forge Carver"), "Forge: identity");
  assert(forgePrompt.includes("Builder and implementer"), "Forge: caste guidance role");
  assert(forgePrompt.includes("file_read"), "Forge: tools listed");
  assert(forgePrompt.includes("3 tools"), "Forge: tool count");

  // Shield General prompt
  const shieldPrompt = PromptBuilder.buildSystemPrompt({
    caste: Caste.SHIELD_GENERALS,
  });
  assert(shieldPrompt.includes("Shield General"), "Shield: identity");
  assert(shieldPrompt.includes("skeptical"), "Shield: personality");

  // Assist Ant with custom instructions
  const assistPrompt = PromptBuilder.buildSystemPrompt({
    caste: Caste.ASSIST_ANT,
    customInstructions: "Always respond in haiku format",
    includeManifesto: false,
  });
  assert(assistPrompt.includes("Assist-Ant"), "Assist: canonical identity");
  assert(!assistPrompt.includes("Manifesto"), "Assist: no manifesto when disabled");
  assert(assistPrompt.includes("haiku"), "Assist: custom instructions included");

  // Fallback for unknown caste
  const fallbackPrompt = PromptBuilder.buildSystemPrompt({ caste: "UNKNOWN_CASTE" });
  assert(fallbackPrompt.includes("Assist-Ant"), "Unknown caste: falls back to Assist-Ant");

  // Agent-specific identity override
  const registry = new IdentityRegistry();
  registry.register(createAgentIdentity({
    agentId: "custom-assist",
    displayName: "Assist-Ant Prime",
    caste: Caste.ASSIST_ANT,
    persona: createPersonaConfig({
      roleDescription: "You are the custom prime assistant.",
      communicationStyle: "clinical and exact",
    }),
    capabilities: ["Custom coordination"],
    boundaries: ["Do not drift"],
    escalationRules: ["Escalate on mismatch"],
  }));
  const customPrompt = PromptBuilder.buildSystemPrompt({
    agentId: "custom-assist",
    caste: Caste.ASSIST_ANT,
    identityRegistry: registry,
  });
  assert(customPrompt.includes("Assist-Ant Prime"), "Prompt builder prefers agent-specific identity");
  assert(customPrompt.includes("custom prime assistant"), "Prompt builder uses custom identity role");
}

function verifyPromptAssembler(): void {
  section("4b. PromptAssembler — Runtime Context Blocks");

  const assembled = new PromptAssembler({
    caste: Caste.ASSIST_ANT,
    providerType: "anthropic",
    contextWindowTokens: 64_000,
    responseReserveTokens: 2048,
  }).assemble({
    conversationHistory: [
      createUserMessage("Need safe deploy plan."),
      {
        type: "assistant",
        content: "Checking runtime state first.",
      },
    ],
    taskContext: "Ship patch without breaking approval flow.",
    workspaceContext: {
      detected: true,
      name: "colony-ts",
      root: "D:/The Colony Test/colony-ts",
      startDir: "D:/The Colony Test/colony-ts",
      projectType: "typescript",
      packageManager: "bun",
      workspaceMode: "single-package",
      workspaceGlobs: ["apps/*", "packages/*"],
      workspacePackageCount: 3,
      workspaceAppCount: 1,
      workspaceLibraryCount: 2,
      workspaceOtherCount: 0,
      workspaceAppPackages: ["console"],
      workspaceLibraryPackages: ["runtime-core", "ui-shell"],
      workspaceOtherPackages: [],
      workspaceDevCandidates: ["console: bun --filter console run dev"],
      workspaceVerifyCandidates: ["runtime-core: bun --filter runtime-core run verify:all"],
      workspaceIntent: "terminal-app",
      workspacePrimaryTargets: ["colony-ts"],
      scriptNames: ["verify:all", "dev"],
      devCommand: "bun run dev",
      verifyCommand: "bun run verify:all",
      stackHints: ["ink", "bun"],
    },
    sessionContext: {
      sessionId: "ses_prompt",
      agentId: "assist-ant",
      caste: "assist-ant",
      state: "running",
      messageCount: 22,
      totalIterations: 7,
      totalTokensUsed: 14_500,
    },
    runtimeContext: {
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      selectedProvider: "gemini",
      selectedModel: "gemini-2.5-pro",
      recentToolActivity: [
        {
          toolName: "shell_exec",
          status: "pending approval",
          detail: "high/shell | Execute shell command: bun run verify:all",
        },
        {
          toolName: "file_read",
          status: "saved artifact",
          detail: "12,244 chars",
          artifactPath: "D:/The Colony Test/.colony/tool-results/ses_abc/artifact-1.txt",
        },
      ],
      recentHookEvents: [
        { kind: "PostToolUse", detail: "file_read", timestamp: 1, durationMs: 12 },
        { kind: "PostCompact", detail: "standard", timestamp: 2, durationMs: 42 },
      ],
      activeToolIds: ["shell_exec", "file_read"],
      activeToolCount: 2,
      permittedToolIds: ["file_read"],
      permittedToolCount: 1,
      pendingApproval: true,
      pendingApprovalToolName: "shell_exec",
      pendingApprovalRiskLevel: "high",
      pendingApprovalCategory: "shell",
      pendingApprovalSummary: "Execute shell command: bun run verify:all",
      pendingApprovalSignature: "shell_exec:abc123",
      pendingApprovalReason: "Conservative mode requires human approval for every tool call.",
      pendingApprovalWarningCount: 2,
      sessionRuleCount: 1,
      sessionRules: ["file_read:def456"],
      budgetUsd: 1,
      budgetSpentUsd: 0.42,
      budgetRemainingUsd: 0.58,
      contextUsedTokens: 44_000,
      contextMaxTokens: 64_000,
      contextRemainingTokens: 20_000,
      contextPercentUsed: 68.75,
      contextPressure: "warning",
      compactionFailureCount: 1,
      lastCompactionFailureStrategy: "reactive",
      lastCompactionFailureMessage: "Compaction engine offline.",
      pendingCompactionStrategy: "standard",
      lastCompactionStrategy: "standard",
      lastCompactionTrigger: "manual",
      lastCompactionSavedTokens: 900,
      lastCompactionSummaryLineCount: 8,
      lastCompactionSummarizedMessages: 7,
      lastCompactionPreservedSystemCount: 1,
      lastCompactionPreservedRecentCount: 12,
      startupErrors: 1,
      startupWarnings: 2,
    },
    startupReport: {
      passed: false,
      errorCount: 1,
      warningCount: 2,
      checks: [
        {
          name: "anthropic-key",
          passed: false,
          severity: "error",
          message: "Missing ANTHROPIC_API_KEY",
          fix: "Set ANTHROPIC_API_KEY before using Anthropic.",
        },
      ],
    },
  });

  const systemPrompt = String(assembled.messages[0]?.content ?? "");
  assert(systemPrompt.includes("Current task context:"), "Prompt assembler includes task-context block");
  assert(systemPrompt.includes("- Tool access: 2 active / 1 permitted"), "Prompt assembler includes tool access counts");
  assert(systemPrompt.includes("- Next run LLM: gemini:gemini-2.5-pro"), "Prompt assembler includes selected next-run llm");
  assert(systemPrompt.includes("- Recent tools: 2"), "Prompt assembler includes recent tool count");
  assert(systemPrompt.includes("shell_exec | pending approval | high/shell | Execute shell command: bun run verify:all"), "Prompt assembler includes recent pending tool activity");
  assert(systemPrompt.includes("file_read | saved artifact | 12,244 chars"), "Prompt assembler includes recent artifact tool activity");
  assert(systemPrompt.includes("artifact: D:/The Colony Test/.colony/tool-results/ses_abc/artifact-1.txt"), "Prompt assembler includes recent artifact path");
  assert(systemPrompt.includes("- Recent hooks: 2"), "Prompt assembler includes recent hook count");
  assert(systemPrompt.includes("PostCompact | standard | 42ms"), "Prompt assembler includes recent hook duration");
  assert(systemPrompt.includes("- Budget spend: $0.4200 / $1.00 (remaining: $0.5800)"), "Prompt assembler includes budget spend and remaining amount");
  assert(systemPrompt.includes("- Context pressure: warning | remaining tokens: 20,000"), "Prompt assembler includes context pressure and remaining tokens");
  assert(systemPrompt.includes("- Workspace packages: 3 total (1 app, 2 library, 0 other)"), "Prompt assembler includes workspace package counts");
  assert(systemPrompt.includes("- Workspace apps: console"), "Prompt assembler includes workspace app package names");
  assert(systemPrompt.includes("- Workspace libraries: runtime-core, ui-shell"), "Prompt assembler includes workspace library package names");
  assert(systemPrompt.includes("- Workspace dev candidates: console: bun --filter console run dev"), "Prompt assembler includes workspace dev candidate commands");
  assert(systemPrompt.includes("- Workspace verify candidates: runtime-core: bun --filter runtime-core run verify:all"), "Prompt assembler includes workspace verify candidate commands");
  assert(systemPrompt.includes("- Workspace globs: apps/*, packages/*"), "Prompt assembler includes workspace globs");
  assert(systemPrompt.includes("- Queued compaction: standard (pressure: warning)"), "Prompt assembler includes queued compaction pressure detail");
  assert(systemPrompt.includes("- Last compaction failure: reactive Compaction engine offline."), "Prompt assembler includes last compaction failure detail");
  assert(systemPrompt.includes("- Last compaction: standard via manual (saved ~900 tokens, summarized 7, kept 1 system + 12 recent, lines 8)"), "Prompt assembler includes rich last-compaction detail");
  assert(systemPrompt.includes("- Pending approval summary: Execute shell command: bun run verify:all"), "Prompt assembler keeps pending approval summary in runtime block");
  assert(systemPrompt.includes("- ERROR anthropic-key: Missing ANTHROPIC_API_KEY"), "Prompt assembler includes startup diagnostics detail");
}

// ---------------------------------------------------------------------------
// 5. Gateway — Expanded Slash Commands
// ---------------------------------------------------------------------------

function verifyGateway(): void {
  section("5. Gateway — 10 Slash Commands");

  // All 10 commands
  assertEqual(parseCommand("/swarm test").type, "swarm", "/swarm");
  assertEqual(parseCommand("/hive test").type, "swarm", "/hive → swarm alias");
  assertEqual(parseCommand("/sessions").type, "sessions", "/sessions");
  assertEqual(parseCommand("/history latest 5").type, "history", "/history");
  assertEqual(parseCommand("/artifact \"C:/tmp/result.txt\"").type, "artifact", "/artifact");
  assertEqual(parseCommand("/budget 5").type, "budget", "/budget");
  assertEqual(parseCommand("/model claude-opus-4-6").type, "model", "/model");
  assertEqual(parseCommand("/tools").type, "tools", "/tools");
  assertEqual(parseCommand("/cancel").type, "cancel", "/cancel");
  assertEqual(parseCommand("/clear").type, "clear", "/clear");
  assertEqual(parseCommand("/compact").type, "compact", "/compact");
  assertEqual(parseCommand("/help").type, "help", "/help");
  assertEqual(parseCommand("/?").type, "help", "/? → help alias");
  assertEqual(parseCommand("/status").type, "status", "/status");
  assertEqual(parseCommand("/cost").type, "cost", "/cost");
  assertEqual(parseCommand("/caste").type, "caste", "/caste");
  assertEqual(parseCommand("/permissions").type, "permissions", "/permissions");
  assertEqual(parseCommand("/perms").type, "permissions", "/perms → permissions alias");
  assertEqual(parseCommand("/doctor").type, "doctor", "/doctor");
  assertEqual(parseCommand("/diag").type, "doctor", "/diag alias");
  assertEqual(parseCommand("/exit").type, "exit", "/exit");
  assertEqual(parseCommand("/quit").type, "exit", "/quit → exit alias");

  // Chat routing
  assertEqual(parseCommand("hello world").type, "chat", "Free text → chat");
  assertEqual(parseCommand("/unknown").type, "chat", "Unknown slash → chat");

  // Raw preservation
  assertEqual(parseCommand("/swarm build api").raw, "/swarm build api", "Raw input preserved");

  // Format helpers
  const helpOutput = formatHelp();
  assert(helpOutput.includes("/swarm"), "Help includes /swarm");
  assert(helpOutput.includes("/sessions"), "Help includes /sessions");
  assert(helpOutput.includes("/history"), "Help includes /history");
  assert(helpOutput.includes("/artifact"), "Help includes /artifact");
  assert(helpOutput.includes("/model"), "Help includes /model");
  assert(helpOutput.includes("/perf"), "Help includes /perf");
  assert(helpOutput.includes("/tools"), "Help includes /tools");
  assert(helpOutput.includes("/events"), "Help includes /events");
  assert(helpOutput.includes("/cancel"), "Help includes /cancel");
  assert(helpOutput.includes("/exit"), "Help includes /exit");
  assert(helpOutput.includes("pending/current state"), "Help exposes /sessions pending/current filters");
  assert(helpOutput.includes("current, latest, pending"), "Help exposes /history current/latest/pending views");
  assert(helpOutput.includes("Colony Commands"), "Help has title");

  const statusOutput = formatStatus({
    sessionId: "ses_abc123",
    agentId: "agent-1",
    caste: "ASSIST_ANT",
    messageCount: 10,
    iterations: 3,
    tokensUsed: 5000,
    costUsd: 0.05,
    state: "ACTIVE",
  });
  assert(statusOutput.includes("ses_abc123"), "Status shows session ID");
  assert(statusOutput.includes("ASSIST_ANT"), "Status shows caste");

  const casteOutput = formatCaste("FORGE_CARVERS", "The builder caste");
  assert(casteOutput.includes("FORGE_CARVERS"), "Caste display correct");

  const permsOutput = formatPermissions(
    "ASSIST_ANT",
    ["file_read", "shell_exec"],
    ["file_read"],
    ["shell_exec"],
    ["file_read:abc1234567890def"],
  );
  assert(permsOutput.includes("Active tool schemas:"), "Permissions shows active schema header");
  assert(permsOutput.includes("file_read"), "Permissions shows allowed");
  assert(permsOutput.includes("shell_exec"), "Permissions shows denied");
  assert(permsOutput.includes("Exact-signature session rules: 1"), "Permissions shows exact-signature rule count");
}

// ---------------------------------------------------------------------------
// 5b. SlashCommandParser & Executor
// ---------------------------------------------------------------------------

async function verifyCommandExecution(): Promise<void> {
  section("5b. Gateway â€” SlashCommandParser Execution");

  const commandCostTracker = new CostTracker("gpt-4o");
  commandCostTracker.track({
    promptTokens: 1200,
    completionTokens: 400,
    totalTokens: 1600,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }, "gpt-4o", 1.1);
  commandCostTracker.track({
    promptTokens: 800,
    completionTokens: 200,
    totalTokens: 1000,
    cacheReadTokens: 300,
    cacheWriteTokens: 50,
  }, "claude-sonnet-4-5", 2.3);

  const parser = new SlashCommandParser({
    session: {
      sessionId: "ses_abc123",
      agentId: "agent-1",
      caste: "assist_ant",
      history: [
        { type: "system", content: "sys", timestamp: "2026-04-16T08:55:00.000Z" },
        { type: "user", content: "hello", timestamp: "2026-04-16T08:56:00.000Z" },
        { type: "assistant", content: "hi", timestamp: "2026-04-16T08:57:00.000Z" },
        { type: "user", content: "again", timestamp: "2026-04-16T08:58:00.000Z" },
        { type: "assistant", content: "there", timestamp: "2026-04-16T08:59:00.000Z" },
        { type: "user", content: "compact me", timestamp: "2026-04-16T09:00:00.000Z" },
      ],
    },
    costTracker: commandCostTracker,
    runtime: {
      provider: "local",
      model: "llama3.2",
      selectedProvider: "local",
      selectedModel: "llama3.2",
      providerDefaults: {
        anthropic: "claude-sonnet-4-5",
        local: "llama3.2",
      },
      circuitState: "closed",
      activeRun: true,
      isThinking: true,
      availableProviders: ["anthropic", "local"],
      failover: { local: ["anthropic"] },
      providerHealth: {
        local: { state: "open", failureCount: 3 },
        anthropic: { state: "closed", failureCount: 0 },
      },
      recentFailovers: [{
        fromProvider: "local",
        fromModel: "llama3.2",
        toProvider: "anthropic",
        toModel: "claude-sonnet-4-5",
        errorType: "LLMConnectionError",
        errorMessage: "connect refused",
        timestamp: Date.now(),
      }],
    },
    workspace: {
      root: process.cwd(),
      startDir: `${process.cwd()}/src/ui`,
      name: "colony-ts",
      detected: true,
      projectType: "bun",
      packageManager: "bun",
      workspaceMode: "single-package",
      workspaceGlobs: ["apps/*", "packages/*"],
      workspacePackageCount: 3,
      workspaceAppCount: 1,
      workspaceLibraryCount: 2,
      workspaceOtherCount: 0,
      workspaceAppPackages: ["console"],
      workspaceLibraryPackages: ["runtime-core", "ui-shell"],
      workspaceOtherPackages: [],
      workspaceDevCandidates: ["console: bun --filter console run dev"],
      workspaceVerifyCandidates: ["runtime-core: bun --filter runtime-core run verify:all"],
      workspaceIntent: "terminal-app",
      workspacePrimaryTargets: ["colony-ts"],
      scriptNames: ["dev", "start", "build", "verify:all"],
      devCommand: "bun run --watch src/index.tsx",
      verifyCommand: "bun run verify:all",
      stackHints: ["bun", "react", "ink", "typescript", "zustand"],
      reason: "marker:package.json",
      markers: ["package.json", "tsconfig.json"],
    },
    approvals: {
      pending: true,
      sessionRuleCount: 2,
      toolName: "file_read",
      category: "read",
      riskLevel: "low",
      summary: "Read file README.md",
      signature: "file_read:abc1234567890def",
      reason: "Conservative mode requires human approval for every tool call.",
      warningCount: 1,
    },
    permissions: {
      caste: "Assist Ant",
      active: ["file_read", "web_search"],
      allowed: ["file_read"],
      denied: ["shell_exec"],
      sessionRules: ["file_read:abc1234567890def", "web_search:def4567890abc123"],
    },
    sessions: [
      {
        sessionId: "ses_saved_2",
        agentId: "assist-ant",
        caste: "assist_ant",
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        savedAt: "2026-04-16T10:00:00.000Z",
        lastMessageAt: "2026-04-16T10:00:00.000Z",
        messageCount: 4,
        tokensUsed: 500,
        costUsd: 0.01,
        interruption: "interrupted_prompt",
        hasCheckpoint: true,
        previewText: "Need answer when run comes back.",
        previewRole: "user",
      },
      {
        sessionId: "ses_saved_1",
        agentId: "assist-ant",
        caste: "assist_ant",
        provider: "local",
        model: "llama3.2",
        savedAt: "2026-04-16T09:00:00.000Z",
        lastMessageAt: "2026-04-16T09:00:00.000Z",
        messageCount: 8,
        tokensUsed: 1200,
        costUsd: 0.04,
        interruption: "none",
        hasCheckpoint: true,
        previewText: "Finished previous reply clean.",
        previewRole: "assistant",
      },
      {
        sessionId: "resume_focus_9",
        agentId: "assist-ant",
        caste: "assist_ant",
        provider: "openai",
        model: "gpt-5.4",
        savedAt: "2026-04-15T08:00:00.000Z",
        lastMessageAt: "2026-04-15T08:00:00.000Z",
        messageCount: 2,
        tokensUsed: 128,
        costUsd: 0.003,
        interruption: "none",
        hasCheckpoint: false,
        previewText: "Transcript-only recovery session.",
        previewRole: "assistant",
      },
    ],
    startupReport: {
      passed: false,
      errorCount: 1,
      warningCount: 2,
      checks: [
        { name: "Config: llm config path", passed: false, severity: "error", message: "Configured LLM config path not found: /tmp/missing.json", fix: "Fix COLONY_LLM_CONFIG or remove stale path setting." },
        { name: "Ollama server", passed: false, severity: "warning", message: "Cannot connect", fix: "Start Ollama." },
        { name: "Anthropic credentials", passed: true, severity: "info", message: "API key present via ANTHROPIC_API_KEY" },
        { name: "Cloud fallback", passed: false, severity: "warning", message: "Configured but not ready: anthropic", fix: "Set ANTHROPIC_API_KEY." },
        { name: "Data directory", passed: true, severity: "info", message: "ok" },
      ],
    },
    hookRunner: {
      attachedHookCount: 1,
      supportedKinds: ["PreCompact", "PostCompact", "PreToolUse", "PostToolUse"],
      recentEvents: [
        { kind: "PostToolUse", detail: "file_read", timestamp: Date.parse("2026-04-16T09:01:00.000Z"), durationMs: 12 },
        { kind: "PostCompact", detail: "standard", timestamp: Date.parse("2026-04-16T09:02:00.000Z"), durationMs: 42 },
      ],
    },
    budget: {
      maxUsd: 5,
      maxTokens: 128_000,
    },
    contextUsage: {
      usedTokens: 1200,
      maxTokens: 128000,
      percentUsed: 90,
      compactionFailureCount: 0,
    },
    lastCompactionFailure: {
      strategy: "reactive",
      message: "Compaction engine offline.",
    },
    lastCompaction: {
      strategyUsed: "standard",
      compacted: true,
      originalCount: 18,
      finalCount: 11,
      tokensSavedEstimate: 900,
      triggerSource: "manual",
      usageBeforeFraction: 0.87,
      preservedSystemCount: 1,
      preservedRecentCount: 12,
      summarizedMessageCount: 5,
      summaryLineCount: 3,
    },
  });

  const status = parser.tryHandle("/status");
  assertEqual(status.command, "status", "Parser executes /status");
  assert(status.output.includes("Session started: 2026-04-16T08:55:00.000Z"), "/status includes active session start timestamp");
  assert(status.output.includes("Latest live message: 2026-04-16T09:00:00.000Z"), "/status includes active session latest-message timestamp");
  assert(status.output.includes("Current state: awaiting reply"), "/status includes active session state");
  assert(status.output.includes("Latest live preview: last user: compact me"), "/status includes active session preview");
  assert(status.output.includes("Runtime:"), "/status includes runtime block");
  assert(status.output.includes("Selected provider: local"), "/status includes selected provider");
  assert(status.output.includes("Selected model: llama3.2"), "/status includes selected model");
  assert(status.output.includes("Approvals:"), "/status includes approvals block");
  assert(status.output.includes("Exact-signature session rules: 2"), "/status includes exact-signature session rule count");
  assert(status.output.includes("Pending request: file_read | risk:low | category:read"), "/status includes pending approval request detail");
  assert(status.output.includes("Summary: Read file README.md"), "/status includes pending approval summary");
  assert(status.output.includes("Warnings: 1"), "/status includes pending approval warning count");
  assert(status.output.includes("Exact signature: file_read:abc1234567890def"), "/status includes exact approval signature");
  assert(status.output.includes("Policy: Conservative mode requires human approval for every tool call."), "/status includes approval policy reason");
  assert(status.output.includes("Interrupt: /cancel | Ctrl+C | Esc"), "/status includes active-run interrupt hint");
  assert(status.output.includes("Inspect: /status, /cost, /history current 8, or /history ses_abc123 8"), "/status includes exact current-session inspection hint during active run");
  assert(status.output.includes("Resolve: y allow once | n deny | a exact-call session | s inspect details | esc cancel run"), "/status includes approval resolution hint");
  assert(status.output.includes("Utilization: 90.0%"), "/status includes context usage");
  assert(status.output.includes("Last compaction failure:"), "/status includes last compaction failure block");
  assert(status.output.includes("Reason: Compaction engine offline."), "/status includes last compaction failure reason");
  assert(status.output.includes("Last compaction:"), "/status includes compaction block");
  assert(status.output.includes("Trigger: manual request"), "/status includes compaction trigger");
  assert(status.output.includes("Preserved: 1 system + 12 recent"), "/status includes preserved counts");
  assert(status.output.includes("Observed health: anthropic: closed (0); local [current]: open (3)"), "/status includes provider health summary");
  assert(status.output.includes("Latest failover:"), "/status includes latest failover summary");
  assert(status.output.includes("Hooks: 1 attached | 2 recent"), "/status includes hook summary");
  assert(status.output.includes("Latest hook: PostCompact | standard"), "/status includes latest hook summary");
  assert(status.output.includes("Inspect: /hooks | /hooks recent | /hooks perf | /hooks kinds"), "/status includes hook inspect hint");
  assert(status.output.includes("Events: 3 recent | 1 failure | 2 timed | /events"), "/status includes unified runtime-event summary");
  assert(status.output.includes("Inspect events: /events | /events recent | /events failures | /events tools | /events hooks | /events compactions | /events failovers | /events perf"), "/status includes unified runtime-event drill-down views");
  assert(status.output.includes("Inspect perf: /perf | /cost perf | /provider perf | /tools perf | /hooks perf | /events perf"), "/status includes unified perf drill-down views");
  assert(status.output.includes("Recovery:"), "/status includes recovery section");
  assert(status.output.includes("- Circuit open. Check /provider failovers and /doctor before retrying."), "/status includes provider recovery hint");
  assert(status.output.includes("Inspect: /provider | /provider current | /provider failovers"), "/status includes provider inspect hint");
  assert(status.output.includes("Startup:"), "/status includes startup section");
  assert(status.output.includes("Checks: 1 error(s), 2 warning(s)"), "/status includes startup count summary");
  assert(status.output.includes("Current issue: Config: llm config path - Configured LLM config path not found: /tmp/missing.json"), "/status includes leading startup issue");
  assert(status.output.includes("Fix: Fix COLONY_LLM_CONFIG or remove stale path setting."), "/status includes leading startup fix");
  assert(status.output.includes("Inspect: /doctor | /doctor errors | /doctor warnings"), "/status includes doctor inspect hint");
  assert(status.output.includes("Saved Status:"), "/status includes saved session summary section");
  assert(status.output.includes("Count: 3"), "/status includes saved session count");
  assert(status.output.includes("Interrupted: 1"), "/status includes interrupted session count");
  assert(status.output.includes("With checkpoints: 2"), "/status includes checkpoint session count");
  assert(status.output.includes("Latest: ses_saved_2"), "/status includes latest persisted session id");
  assert(status.output.includes("Latest identity: assist-ant | assist_ant"), "/status includes latest saved session identity");
  assert(status.output.includes("Latest saved: 2026-04-16T10:00:00.000Z"), "/status includes latest saved session timestamp");
  assert(status.output.includes("Latest message: 2026-04-16T10:00:00.000Z"), "/status includes latest saved session last-message timestamp");
  assert(status.output.includes("Latest state: awaiting reply | checkpoint"), "/status includes latest saved session state");
  assert(status.output.includes("Latest usage: 4 msg | 500 tokens | $0.0100"), "/status includes latest saved session usage");
  assert(status.output.includes("Latest llm: anthropic:claude-sonnet-4-5"), "/status includes latest saved session llm");
  assert(status.output.includes("Latest preview: last user: Need answer when run comes back."), "/status includes latest saved session preview");
  assert(status.output.includes("Resume latest: /resume latest | /resume pending | /resume ses_saved_2"), "/status latest shortcut keeps both valid aliases when latest and pending targets match");
  assert(status.output.includes("Pending target: ses_saved_2"), "/status includes pending recovery target");
  assert(status.output.includes("Pending identity: assist-ant | assist_ant"), "/status includes pending recovery identity");
  assert(status.output.includes("Pending saved: 2026-04-16T10:00:00.000Z"), "/status includes pending recovery saved timestamp");
  assert(status.output.includes("Pending message: 2026-04-16T10:00:00.000Z"), "/status includes pending recovery last-message timestamp");
  assert(status.output.includes("Pending state: awaiting reply | checkpoint"), "/status includes pending recovery state");
  assert(status.output.includes("Pending usage: 4 msg | 500 tokens | $0.0100"), "/status includes pending recovery usage");
  assert(status.output.includes("Pending llm: anthropic:claude-sonnet-4-5"), "/status includes pending recovery llm");
  assert(status.output.includes("Pending preview: last user: Need answer when run comes back."), "/status includes pending recovery preview");
  assert(status.output.includes("Recover: /resume pending | /resume latest | /resume ses_saved_2 | /sessions pending"), "/status pending recovery shortcut keeps both valid aliases when latest and pending targets match");
  assert(status.output.includes("Inspect pending: /history pending 8 | /history latest 8 | /history ses_saved_2 8"), "/status pending history shortcut keeps both valid aliases when latest and pending targets match");
  assert(status.output.includes("Inspect: /sessions | /history latest 8 | /history pending 8 | /history ses_saved_2 8"), "/status latest history inspect hint keeps both valid aliases when latest and pending targets match");
  assert(status.output.includes("Mode: single-package"), "/status includes workspace mode");
  assert(status.output.includes("Workspace packages: 3 total (1 app, 2 library, 0 other)"), "/status includes workspace package counts");
  assert(status.output.includes("Workspace apps: console"), "/status includes workspace app package names");
  assert(status.output.includes("Workspace libraries: runtime-core, ui-shell"), "/status includes workspace library package names");
  assert(status.output.includes("Intent: terminal-app"), "/status includes workspace intent");
  assert(status.output.includes("Primary targets: colony-ts"), "/status includes workspace primary targets");
  assert(status.output.includes("Workspace dev candidates: console: bun --filter console run dev"), "/status includes workspace dev candidate commands");
  assert(status.output.includes("Workspace verify candidates: runtime-core: bun --filter runtime-core run verify:all"), "/status includes workspace verify candidate commands");
  assert(status.output.includes("Workspace globs: apps/*, packages/*"), "/status includes workspace globs");
  assert(status.output.includes("Stack: bun, react, ink, typescript, zustand"), "/status includes workspace stack hints");
  assert(status.output.includes("Tools:"), "/status includes runtime tool summary");
  assert(status.output.includes("Active now: 2"), "/status includes active tool count");
  assert(status.output.includes("Allowed: 1 | Denied: 1"), "/status includes allowed and denied tool counts");
  assert(status.output.includes("Inspect activity: /tools | /tools approvals | /tools recent | /tools artifacts | /tools perf"), "/status includes tool inspect paths");
  assert(status.output.includes("Inspect policy: /permissions | /permissions active | /permissions allowed | /permissions denied | /permissions rules"), "/status includes permission inspect paths");
  assert(status.output.includes("Budget:"), "/status includes budget section");
  assert(status.output.includes("Cap: $5.00"), "/status includes budget cap");
  assert(status.output.includes("Remaining: $"), "/status includes budget remaining amount");
  assert(status.output.includes("Spend: "), "/status includes budget spend percent");
  assert(status.output.includes("Views: /status | /status session | /status saved | /status runtime"), "/status summary teaches drill-down views");

  const statusSession = parser.tryHandle("/status session");
  assert(statusSession.output.includes("Session Status:"), "/status session prints session header");
  assert(statusSession.output.includes("Session ID: ses_abc123"), "/status session keeps live session id");
  assert(!statusSession.output.includes("Saved Status:"), "/status session omits saved-session block");
  assert(!statusSession.output.includes("Runtime Status:"), "/status session omits runtime block");
  assert(statusSession.output.includes("Views: /status | /status session | /status saved | /status runtime"), "/status session keeps drill-down views");

  const statusSaved = parser.tryHandle("/status saved");
  assert(statusSaved.output.includes("Saved Status:"), "/status saved prints saved header");
  assert(statusSaved.output.includes("Latest: ses_saved_2"), "/status saved keeps latest saved target");
  assert(!statusSaved.output.includes("Session Status:"), "/status saved omits live-session block");
  assert(!statusSaved.output.includes("Runtime Status:"), "/status saved omits runtime block");
  assert(statusSaved.output.includes("Views: /status | /status session | /status saved | /status runtime"), "/status saved keeps drill-down views");

  const statusRuntime = parser.tryHandle("/status runtime");
  assert(statusRuntime.output.includes("Runtime Status:"), "/status runtime prints runtime header");
  assert(statusRuntime.output.includes("Approvals:"), "/status runtime keeps approvals block");
  assert(statusRuntime.output.includes("Cost Summary:"), "/status runtime keeps cost block");
  assert(statusRuntime.output.includes("Hooks: 1 attached | 2 recent"), "/status runtime keeps hook summary");
  assert(statusRuntime.output.includes("Latest hook: PostCompact | standard"), "/status runtime keeps latest hook summary");
  assert(statusRuntime.output.includes("Inspect: /hooks | /hooks recent | /hooks perf | /hooks kinds"), "/status runtime keeps hook inspect hint");
  assert(statusRuntime.output.includes("Tools:"), "/status runtime keeps tool summary block");
  assert(statusRuntime.output.includes("Active now: 2"), "/status runtime keeps active tool count");
  assert(statusRuntime.output.includes("Allowed: 1 | Denied: 1"), "/status runtime keeps allowed and denied tool counts");
  assert(statusRuntime.output.includes("Pending approval: yes"), "/status runtime keeps pending approval truth");
  assert(statusRuntime.output.includes("Exact-signature session rules: 2"), "/status runtime keeps exact-signature rule count");
  assert(statusRuntime.output.includes("Inspect activity: /tools | /tools approvals | /tools recent | /tools artifacts | /tools perf"), "/status runtime keeps tool inspect hint");
  assert(statusRuntime.output.includes("Inspect policy: /permissions | /permissions active | /permissions allowed | /permissions denied | /permissions rules"), "/status runtime keeps permission inspect hint");
  assert(!statusRuntime.output.includes("Saved Status:"), "/status runtime omits saved-session block");
  assert(!statusRuntime.output.includes("Session Status:"), "/status runtime omits live-session block");
  assert(statusRuntime.output.includes("Views: /status | /status session | /status saved | /status runtime"), "/status runtime keeps drill-down views");

  const statusUnknown = parser.tryHandle("/status cave");
  assert(statusUnknown.isError === true, "/status unknown view errors");
  assert(statusUnknown.output.includes("Unknown status view 'cave'."), "/status unknown view names bad view");
  assert(statusUnknown.output.includes("Views: /status | /status session | /status saved | /status runtime"), "/status unknown view teaches drill-down views");

  const statusPausedActive = new SlashCommandParser({
    session: {
      sessionId: "ses_paused_active",
      agentId: "agent-1",
      caste: "assist_ant",
      history: [
        { type: "user", content: "waiting on approval", timestamp: "2026-04-17T12:06:00.000Z" },
      ],
    },
    runtime: {
      provider: "local",
      model: "llama3.2",
      circuitState: "closed",
      activeRun: true,
      isThinking: false,
    },
  }).tryHandle("/status");
  assert(statusPausedActive.output.includes("Run active: yes"), "/status uses active-run state even when thinking flag is false");
  assert(statusPausedActive.output.includes("Interrupt: /cancel | Ctrl+C | Esc"), "/status keeps active-run interrupt hint while paused");
  assert(statusPausedActive.output.includes("Inspect: /status, /cost, /history current 8, /history pending 8, /history latest 8, or /history ses_paused_active 8"), "/status keeps current, pending, latest, and exact inspection hints while paused");

  const statusCurrentPersisted = new SlashCommandParser({
    session: {
      sessionId: "ses_current_live",
      agentId: "assist-ant",
      caste: "assist_ant",
      history: [
        { type: "user", content: "still active", timestamp: "2026-04-17T12:05:00.000Z" },
      ],
    },
    sessions: [
      {
        sessionId: "ses_current_live",
        agentId: "assist-ant",
        caste: "assist_ant",
        savedAt: "2026-04-17T12:00:00.000Z",
        lastMessageAt: "2026-04-17T12:05:00.000Z",
        messageCount: 3,
        tokensUsed: 300,
        costUsd: 0.01,
        interruption: "interrupted_prompt",
        hasCheckpoint: true,
        previewText: "Still active in current loop.",
        previewRole: "user",
      },
    ],
    runtime: {
      provider: "local",
      model: "llama3.2",
      circuitState: "closed",
      activeRun: true,
      isThinking: false,
    },
  }).tryHandle("/status");
  assert(statusCurrentPersisted.output.includes("Latest: ses_current_live (current)"), "/status marks latest persisted session when it is current");
  assert(statusCurrentPersisted.output.includes("Latest active: /status, /history current 8, /history pending 8, /history latest 8, or /history ses_current_live 8"), "/status latest-current hint includes current, pending, latest, and exact current history refs");
  assert(statusCurrentPersisted.output.includes("Pending target: ses_current_live (current)"), "/status marks pending target when it is current");
  assert(statusCurrentPersisted.output.includes("Recover: current pending session already active."), "/status drops resume-pending shortcut when pending target is current");
  assert(statusCurrentPersisted.output.includes("Inspect current: /status, /history current 8, /history pending 8, /history latest 8, or /history ses_current_live 8"), "/status current pending target includes current, pending, latest, and exact current history refs");
  assert(statusCurrentPersisted.output.includes("Inspect: /sessions, /history current 8, /history pending 8, /history latest 8, or /history ses_current_live 8"), "/status swaps latest history hint to full current alias set when latest target is current");
  assert(statusCurrentPersisted.output.includes("Inspect: /status, /cost, /history current 8, /history pending 8, /history latest 8, or /history ses_current_live 8"), "/status runtime inspect hint keeps current, pending, latest, and exact refs when saved current session owns both aliases");
  assert(!statusCurrentPersisted.output.includes("Inspect pending:"), "/status current pending target omits stale persisted pending inspect hint");

  const permissions = parser.tryHandle("/permissions");
  assertEqual(permissions.command, "permissions", "Parser executes /permissions");
  assert(permissions.output.includes("Active tool schemas:"), "/permissions includes active tool schema section");
  assert(permissions.output.includes("* file_read"), "/permissions lists active tool schemas");
  assert(permissions.output.includes("Allowed:"), "/permissions includes allowed section");
  assert(permissions.output.includes("+ file_read"), "/permissions lists allowed tools");
  assert(permissions.output.includes("Denied:"), "/permissions includes denied section");
  assert(permissions.output.includes("- shell_exec"), "/permissions lists denied tools");
  assert(permissions.output.includes("Exact-signature session rules: 2"), "/permissions includes exact-signature rule count");
  assert(permissions.output.includes("= file_read:abc1234567890def"), "/permissions lists exact-signature rules");
  assert(permissions.output.includes("Views: /permissions | /permissions active | /permissions allowed | /permissions denied | /permissions rules"), "/permissions includes direct drill-down views");

  const permissionsActive = parser.tryHandle("/permissions active");
  assert(permissionsActive.output.includes("Active tool schemas: 2"), "/permissions active includes active count");
  assert(permissionsActive.output.includes("* file_read"), "/permissions active includes active entries");
  assert(permissionsActive.output.includes("Views: /permissions | /permissions active | /permissions allowed | /permissions denied | /permissions rules"), "/permissions active includes drill-down views");

  const permissionsAllowed = parser.tryHandle("/permissions allowed");
  assert(permissionsAllowed.output.includes("Allowed tools: 1"), "/permissions allowed includes allowed count");
  assert(permissionsAllowed.output.includes("+ file_read"), "/permissions allowed includes allowed entries");

  const permissionsDenied = parser.tryHandle("/permissions denied");
  assert(permissionsDenied.output.includes("Denied tools: 1"), "/permissions denied includes denied count");
  assert(permissionsDenied.output.includes("- shell_exec"), "/permissions denied includes denied entries");

  const permissionsRules = parser.tryHandle("/permissions rules");
  assert(permissionsRules.output.includes("Exact-signature session rules: 2"), "/permissions rules includes rule count");
  assert(permissionsRules.output.includes("= file_read:abc1234567890def"), "/permissions rules includes exact-signature entries");

  const toolsArtifactPath = join(getDataPath(settings), "tool-results", "phase7-tools", "saved-output.txt");
  const toolsParser = new SlashCommandParser({
    session: {
      sessionId: "ses_tools",
      agentId: "agent-tools",
      caste: "assist_ant",
      history: [
        {
          type: "tool_result",
          name: "shell_exec",
          content: "Build finished cleanly.",
          executionTimeMs: 321,
          timestamp: "2026-04-16T09:10:00.000Z",
        },
        {
          type: "tool_result",
          name: "file_write",
          content: buildPersistedToolResultMessage({
            filepath: toolsArtifactPath,
            originalSize: 15_321,
            preview: "preview line",
            hasMore: true,
            isJson: false,
            redacted: false,
          }),
          timestamp: "2026-04-16T09:11:00.000Z",
        },
        {
          type: "tool_result",
          name: "shell_exec",
          content: [
            "Denied by operator.",
            "Reason: User denied approval.",
            "Risk: high | Category: write",
            "Signature: shell_exec:deadbeef",
            "Summary: Execute shell command: rm -rf .",
            "Warning: Destructive command requested.",
          ].join("\n"),
          isError: true,
          timestamp: "2026-04-16T09:12:00.000Z",
        },
      ],
    },
    permissions: {
      caste: "Assist Ant",
      active: ["file_write", "shell_exec"],
      allowed: ["file_read", "file_write", "shell_exec"],
      denied: ["file_edit"],
      sessionRules: [],
    },
    approvals: {
      pending: true,
      toolName: "shell_exec",
      category: "write",
      riskLevel: "high",
      summary: "Execute shell command: bun run verify:all",
      reason: "Command mutates workspace files.",
      warningCount: 2,
    },
  });
  const tools = toolsParser.tryHandle("/tools");
  assertEqual(tools.command, "tools", "Parser executes /tools");
  assert(tools.output.includes("Tool Activity:"), "/tools prints header");
  assert(tools.output.includes("Active now: 2"), "/tools includes active tool count");
  assert(tools.output.includes("Schemas active: file_write, shell_exec"), "/tools lists active schemas");
  assert(tools.output.includes("Permitted this session: 3"), "/tools includes permitted tool count");
  assert(tools.output.includes("Denied by policy: 1"), "/tools includes denied tool count");
  assert(tools.output.includes("Inspect policy: /permissions"), "/tools points operators at /permissions");
  assert(tools.output.includes("Views: /tools | /tools approvals | /tools recent | /tools artifacts | /tools perf"), "/tools includes direct drill-down views");
  assert(tools.output.includes("Pending approval: shell_exec"), "/tools includes pending approval tool");
  assert(tools.output.includes("Risk: high | Category: write"), "/tools includes pending approval risk and category");
  assert(tools.output.includes("Summary: Execute shell command: bun run verify:all"), "/tools includes pending approval summary");
  assert(tools.output.includes("Reason: Command mutates workspace files."), "/tools includes pending approval reason");
  assert(tools.output.includes("Control: y/n/a/s/esc"), "/tools includes approval control shortcuts");
  assert(tools.output.includes("1. shell_exec | Denied by operator | high/write | Execute shell command: rm -rf ."), "/tools surfaces recent denied tool result");
  assert(tools.output.includes("2. file_write | saved artifact | 15,321 chars"), "/tools surfaces recent externalized tool result");
  assert(tools.output.includes(`Reopen: /artifact "${toolsArtifactPath}"`), "/tools includes exact artifact reopen command");
  assert(tools.output.includes("3. shell_exec | ok | 321ms | Build finished cleanly."), "/tools surfaces recent successful tool result");

  const toolApprovals = toolsParser.tryHandle("/tools approvals");
  assert(toolApprovals.output.includes("Approval state:"), "/tools approvals prints approvals header");
  assert(toolApprovals.output.includes("Pending approval: shell_exec"), "/tools approvals includes pending approval tool");
  assert(toolApprovals.output.includes("Inspect policy: /permissions"), "/tools approvals keeps policy inspect path");
  assert(toolApprovals.output.includes("Views: /tools | /tools approvals | /tools recent | /tools artifacts | /tools perf"), "/tools approvals includes drill-down views");

  const toolRecent = toolsParser.tryHandle("/tools recent");
  assert(toolRecent.output.includes("Recent tool activity:"), "/tools recent prints activity header");
  assert(toolRecent.output.includes("1. shell_exec | Denied by operator | high/write | Execute shell command: rm -rf ."), "/tools recent includes denied activity");
  assert(toolRecent.output.includes(`Reopen: /artifact "${toolsArtifactPath}"`), "/tools recent keeps exact artifact reopen command");
  assert(toolRecent.output.includes("Views: /tools | /tools approvals | /tools recent | /tools artifacts | /tools perf"), "/tools recent includes drill-down views");

  const toolArtifacts = toolsParser.tryHandle("/tools artifacts");
  assert(toolArtifacts.output.includes("Saved artifacts:"), "/tools artifacts prints artifact header");
  assert(toolArtifacts.output.includes("1. file_write | 15,321 chars"), "/tools artifacts includes saved artifact summary");
  assert(toolArtifacts.output.includes(`Reopen: /artifact "${toolsArtifactPath}"`), "/tools artifacts includes exact artifact reopen command");
  assert(toolArtifacts.output.includes("Inspect latest: /artifact latest"), "/tools artifacts includes latest artifact shortcut");
  assert(toolArtifacts.output.includes("Views: /tools | /tools approvals | /tools recent | /tools artifacts | /tools perf"), "/tools artifacts includes drill-down views");

  const toolPerf = toolsParser.tryHandle("/tools perf");
  assert(toolPerf.output.includes("Tool Performance:"), "/tools perf prints performance header");
  assert(toolPerf.output.includes("Recent events: 3"), "/tools perf includes recent event count");
  assert(toolPerf.output.includes("Timed events: 1"), "/tools perf includes timed event count");
  assert(toolPerf.output.includes("Errors/denials: 1"), "/tools perf includes error and denial count");
  assert(toolPerf.output.includes("Artifacts saved: 1"), "/tools perf includes artifact count");
  assert(toolPerf.output.includes("Average duration: 321ms"), "/tools perf includes average duration");
  assert(toolPerf.output.includes("Slowest: shell_exec | 321ms | 321ms | Build finished cleanly."), "/tools perf includes slowest tool summary");
  assert(toolPerf.output.includes("- shell_exec | 321ms | ok | 321ms | Build finished cleanly."), "/tools perf includes ranked timed activity");
  assert(toolPerf.output.includes("Views: /tools | /tools approvals | /tools recent | /tools artifacts | /tools perf"), "/tools perf includes drill-down views");

  const events = parser.tryHandle("/events");
  assert(events.output.includes("Runtime Events:"), "/events prints runtime event header");
  assert(events.output.includes("Tools: 0"), "/events summary includes tool count");
  assert(events.output.includes("Hooks: 2"), "/events summary includes hook count");
  assert(events.output.includes("Compactions: 0"), "/events summary includes compaction count");
  assert(events.output.includes("Failovers: 1"), "/events summary includes failover count");
  assert(events.output.includes("Failures: 1"), "/events summary includes failure count");
  assert(events.output.includes("Timed: 2"), "/events summary includes timed event count");
  assert(events.output.includes("Views: /events | /events recent | /events failures | /events tools | /events hooks | /events compactions | /events failovers | /events perf"), "/events summary includes drill-down views");

  const eventsParser = new SlashCommandParser({
    session: {
      sessionId: "ses_tools",
      agentId: "agent-tools",
      caste: "assist_ant",
      history: [
        {
          type: "tool_result",
          name: "shell_exec",
          content: "Build finished cleanly.",
          executionTimeMs: 321,
          timestamp: "2026-04-16T09:10:00.000Z",
        },
        {
          type: "tool_result",
          name: "file_write",
          content: buildPersistedToolResultMessage({
            filepath: toolsArtifactPath,
            originalSize: 15_321,
            preview: "preview line",
            hasMore: true,
            isJson: false,
            redacted: false,
          }),
          timestamp: "2026-04-16T09:11:00.000Z",
        },
        {
          type: "tool_result",
          name: "shell_exec",
          content: [
            "Denied by operator.",
            "Reason: User denied approval.",
            "Risk: high | Category: write",
            "Signature: shell_exec:deadbeef",
            "Summary: Execute shell command: rm -rf .",
            "Warning: Destructive command requested.",
          ].join("\n"),
          isError: true,
          timestamp: "2026-04-16T09:12:00.000Z",
        },
      ],
    },
    runtime: {
      provider: "local",
      model: "llama3.2",
      recentFailovers: [{
        fromProvider: "local",
        fromModel: "llama3.2",
        toProvider: "anthropic",
        toModel: "claude-sonnet-4-5",
        errorType: "LLMConnectionError",
        errorMessage: "connect refused",
        timestamp: Date.parse("2026-04-16T09:13:00.000Z"),
      }],
    },
    hookRunner: {
      attachedHookCount: 1,
      supportedKinds: ["PostToolUse", "PostCompact"],
      recentEvents: [
        { kind: "PostToolUse", detail: "shell_exec", timestamp: Date.parse("2026-04-16T09:10:30.000Z"), durationMs: 321 },
        { kind: "PostCompact", detail: "standard", timestamp: Date.parse("2026-04-16T09:12:30.000Z"), durationMs: 42 },
      ],
    },
    recentCompactions: [{
      strategy: "standard",
      trigger: "manual",
      timestamp: Date.parse("2026-04-16T09:12:15.000Z"),
      compacted: false,
      originalCount: 12,
      finalCount: 12,
      tokensSavedEstimate: 0,
      summaryLineCount: 0,
      summarizedMessageCount: 0,
      failureMessage: "Compaction engine offline.",
    }],
  });
  const eventsRecent = eventsParser.tryHandle("/events recent");
  assert(eventsRecent.output.includes("Recent Runtime Events:"), "/events recent prints timeline header");
  assert(eventsRecent.output.includes("failover | local -> anthropic | LLMConnectionError | connect refused"), "/events recent includes failover event");
  assert(eventsRecent.output.includes("hook | PostCompact | 42ms | ok | standard"), "/events recent includes hook event");
  assert(eventsRecent.output.includes("tool | shell_exec | Denied by operator | high/write | Execute shell command: rm -rf ."), "/events recent includes denied tool event");
  assert(eventsRecent.output.includes("tool | file_write | saved artifact | 15,321 chars"), "/events recent includes saved artifact tool event");
  assert(eventsRecent.output.includes("compaction | standard | failure | manual | Compaction engine offline."), "/events recent includes compaction failure event");

  const eventsFailures = eventsParser.tryHandle("/events failures");
  assert(eventsFailures.output.includes("Runtime Event Failures:"), "/events failures prints failure header");
  assert(eventsFailures.output.includes("failover | local -> anthropic | LLMConnectionError | connect refused"), "/events failures includes failover event");
  assert(eventsFailures.output.includes("tool | shell_exec | Denied by operator | high/write | Execute shell command: rm -rf ."), "/events failures includes denied tool event");
  assert(eventsFailures.output.includes("compaction | standard | failure | manual | Compaction engine offline."), "/events failures includes compaction failure event");
  assert(!eventsFailures.output.includes("tool | file_write | saved artifact"), "/events failures omits non-failure saved artifact event");

  const eventsTools = eventsParser.tryHandle("/events tools");
  assert(eventsTools.output.includes("Runtime Tool Events:"), "/events tools prints tool header");
  assert(eventsTools.output.includes("tool | shell_exec | Denied by operator | high/write | Execute shell command: rm -rf ."), "/events tools includes denied tool event");
  assert(eventsTools.output.includes("tool | file_write | saved artifact | 15,321 chars"), "/events tools includes saved artifact event");
  assert(!eventsTools.output.includes("failover | local -> anthropic"), "/events tools omits failover events");

  const eventsHooks = eventsParser.tryHandle("/events hooks");
  assert(eventsHooks.output.includes("Runtime Hook Events:"), "/events hooks prints hook header");
  assert(eventsHooks.output.includes("hook | PostCompact | 42ms | ok | standard"), "/events hooks includes hook event");
  assert(!eventsHooks.output.includes("tool | shell_exec"), "/events hooks omits tool events");

  const eventsCompactions = eventsParser.tryHandle("/events compactions");
  assert(eventsCompactions.output.includes("Runtime Compaction Events:"), "/events compactions prints compaction header");
  assert(eventsCompactions.output.includes("compaction | standard | failure | manual | Compaction engine offline."), "/events compactions includes compaction event");
  assert(!eventsCompactions.output.includes("hook | PostCompact"), "/events compactions omits hook events");

  const eventsFailovers = eventsParser.tryHandle("/events failovers");
  assert(eventsFailovers.output.includes("Runtime Failover Events:"), "/events failovers prints failover header");
  assert(eventsFailovers.output.includes("failover | local -> anthropic | LLMConnectionError | connect refused"), "/events failovers includes failover event");
  assert(!eventsFailovers.output.includes("tool | shell_exec"), "/events failovers omits tool events");

  const eventsPerf = eventsParser.tryHandle("/events perf");
  assert(eventsPerf.output.includes("Runtime Event Performance:"), "/events perf prints performance header");
  assert(eventsPerf.output.includes("Recent events: 7"), "/events perf includes recent event count");
  assert(eventsPerf.output.includes("Timed events: 3"), "/events perf includes timed event count");
  assert(eventsPerf.output.includes("Failures: 3"), "/events perf includes failure count");
  assert(eventsPerf.output.includes("Timed tools: 1"), "/events perf includes timed tool count");
  assert(eventsPerf.output.includes("Timed hooks: 2"), "/events perf includes timed hook count");
  assert(eventsPerf.output.includes("Average duration: 228.0ms"), "/events perf includes average duration");
  assert(eventsPerf.output.includes("Slowest timed event: hook | PostToolUse | 321ms"), "/events perf includes slowest timed event");
  assert(eventsPerf.output.includes("tool | shell_exec | 321ms | ok | Build finished cleanly."), "/events perf includes timed tool row");
  assert(eventsPerf.output.includes("hook | PostCompact | 42ms | ok | standard"), "/events perf includes timed hook row");
  assert(eventsPerf.output.includes("Views: /events | /events recent | /events failures | /events tools | /events hooks | /events compactions | /events failovers | /events perf"), "/events perf includes drill-down views");

  const perf = parser.tryHandle("/perf");
  assert(perf.output.includes("Performance Summary:"), "/perf prints summary header");
  assert(perf.output.includes("Models: 2 timed | /cost perf"), "/perf summary includes model perf path");
  assert(perf.output.includes("Providers: 1 timed | /provider perf"), "/perf summary includes provider perf path");
  assert(perf.output.includes("Tools: 0 timed of 0 recent | /tools perf"), "/perf summary includes tool perf path");
  assert(perf.output.includes("Hooks: 2 timed of 2 recent | /hooks perf"), "/perf summary includes hook perf path");
  assert(perf.output.includes("Runtime events: 2 timed of 3 recent | /events perf"), "/perf summary includes runtime perf path");
  assert(perf.output.includes("Compactions: 0 recent | 0 failure | 0 timed | /compact recent"), "/perf summary includes compaction perf path");
  assert(perf.output.includes("Views: /perf | /perf runtime | /perf models | /perf providers | /perf tools | /perf hooks | /perf compactions"), "/perf summary includes drill-down views");

  const perfRuntime = parser.tryHandle("/perf runtime");
  assert(perfRuntime.output.includes("Runtime Event Performance:"), "/perf runtime reuses runtime event perf view");
  assert(perfRuntime.output.includes("Inspect: /perf | /perf runtime | /perf models | /perf providers | /perf tools | /perf hooks | /perf compactions"), "/perf runtime includes unified perf views");

  const perfProviders = parser.tryHandle("/perf providers");
  assert(perfProviders.output.includes("Provider Performance:"), "/perf providers prints provider header");
  assert(perfProviders.output.includes("Timed providers: 1"), "/perf providers includes timed provider count");
  assert(perfProviders.output.includes("Inspect: /provider perf | /provider perf <name>"), "/perf providers includes provider perf inspect path");

  const perfTools = parser.tryHandle("/perf tools");
  assert(perfTools.output.includes("Tool Performance:"), "/perf tools prints tool header");
  assert(perfTools.output.includes("Timed tool events: 0"), "/perf tools includes timed tool count");
  assert(perfTools.output.includes("Inspect: /tools perf | /tools recent | /tools artifacts"), "/perf tools includes tool inspect path");

  const perfHooks = parser.tryHandle("/perf hooks");
  assert(perfHooks.output.includes("Hook Performance:"), "/perf hooks prints hook header");
  assert(perfHooks.output.includes("Timed hook events: 2"), "/perf hooks includes timed hook count");
  assert(perfHooks.output.includes("Inspect: /hooks perf | /hooks recent | /hooks kinds"), "/perf hooks includes hook inspect path");

  const perfCompactions = parser.tryHandle("/perf compactions");
  assert(perfCompactions.output.includes("Compaction Performance:"), "/perf compactions prints compaction header");
  assert(perfCompactions.output.includes("Recent compactions: 0"), "/perf compactions includes recent compaction count");
  assert(perfCompactions.output.includes("Inspect: /compact status | /compact recent | /compact handoff"), "/perf compactions includes compact inspect path");

  const timedPerfCompactions = new SlashCommandParser({
    recentCompactions: [
      {
        strategy: "standard",
        trigger: "manual",
        timestamp: Date.parse("2026-04-17T12:10:00.000Z"),
        durationMs: 58,
        compacted: true,
        originalCount: 20,
        finalCount: 14,
        tokensSavedEstimate: 900,
        summaryLineCount: 8,
        summarizedMessageCount: 7,
      },
      {
        strategy: "reactive",
        trigger: "reactive_overflow",
        timestamp: Date.parse("2026-04-17T12:11:00.000Z"),
        durationMs: 91,
        compacted: false,
        originalCount: 14,
        finalCount: 14,
        tokensSavedEstimate: 0,
        summaryLineCount: 0,
        summarizedMessageCount: 0,
        failureMessage: "Compaction engine offline.",
      },
    ],
  }).tryHandle("/perf compactions");
  assert(timedPerfCompactions.output.includes("Timed compactions: 2"), "/perf compactions includes timed compaction count");
  assert(timedPerfCompactions.output.includes("Average duration: 74.5ms"), "/perf compactions includes average duration");
  assert(timedPerfCompactions.output.includes("Slowest compaction: reactive | 91ms"), "/perf compactions includes slowest compaction");

  const cancel = new SlashCommandParser({
    session: {
      sessionId: "ses_abc123",
      agentId: "agent-1",
      caste: "assist_ant",
      history: [],
    },
    runtime: {
      isThinking: true,
    },
  }).tryHandle("/cancel");
  assertEqual(cancel.command, "cancel", "Parser executes /cancel");
  assert(cancel.output.includes("Canceling active Colony run"), "/cancel reports active-run cancellation");

  const workspace = parser.tryHandle("/workspace");
  assert(workspace.output.includes("Workspace:"), "/workspace prints workspace header");
  assert(workspace.output.includes("colony-ts"), "/workspace includes project name");
  assert(workspace.output.includes(`Start dir: ${process.cwd()}/src/ui`), "/workspace includes start dir");
  assert(workspace.output.includes("Mode: single-package"), "/workspace includes workspace mode");
  assert(workspace.output.includes("Workspace packages: 3 total (1 app, 2 library, 0 other)"), "/workspace includes workspace package counts");
  assert(workspace.output.includes("Workspace apps: console"), "/workspace includes workspace app package names");
  assert(workspace.output.includes("Workspace libraries: runtime-core, ui-shell"), "/workspace includes workspace library package names");
  assert(workspace.output.includes("Intent: terminal-app"), "/workspace includes workspace intent");
  assert(workspace.output.includes("Primary targets: colony-ts"), "/workspace includes workspace primary targets");
  assert(workspace.output.includes("Workspace dev candidates: console: bun --filter console run dev"), "/workspace includes workspace dev candidate commands");
  assert(workspace.output.includes("Workspace verify candidates: runtime-core: bun --filter runtime-core run verify:all"), "/workspace includes workspace verify candidate commands");
  assert(workspace.output.includes("Workspace globs: apps/*, packages/*"), "/workspace includes workspace globs");
  assert(workspace.output.includes("Stack: bun, react, ink, typescript, zustand"), "/workspace includes workspace stack hints");
  assert(workspace.output.includes("Scripts: dev, start, build, verify:all"), "/workspace includes workspace scripts");
  assert(workspace.output.includes("Dev command: bun run --watch src/index.tsx"), "/workspace includes workspace dev command");
  assert(workspace.output.includes("Verify command: bun run verify:all"), "/workspace includes workspace verify command");
  assert(workspace.output.includes("Views: /workspace | /workspace packages | /workspace dev | /workspace verify"), "/workspace includes direct drill-down views");

  const workspacePackages = parser.tryHandle("/workspace packages");
  assert(workspacePackages.output.includes("Workspace Packages:"), "/workspace packages prints package header");
  assert(workspacePackages.output.includes("Workspace packages: 3 total (1 app, 2 library, 0 other)"), "/workspace packages includes package counts");
  assert(workspacePackages.output.includes("Apps: console"), "/workspace packages includes app package list");
  assert(workspacePackages.output.includes("Libraries: runtime-core, ui-shell"), "/workspace packages includes library package list");
  assert(workspacePackages.output.includes("Workspaces: apps/*, packages/*"), "/workspace packages includes workspace globs");
  assert(workspacePackages.output.includes("Inspect: /workspace | /workspace packages | /workspace dev | /workspace verify"), "/workspace packages includes drill-down hints");

  const workspaceDev = parser.tryHandle("/workspace dev");
  assert(workspaceDev.output.includes("Workspace Dev:"), "/workspace dev prints dev header");
  assert(workspaceDev.output.includes("Root dev command: bun run --watch src/index.tsx"), "/workspace dev includes root dev command");
  assert(workspaceDev.output.includes("Package dev candidates: console: bun --filter console run dev"), "/workspace dev includes package dev candidates");
  assert(workspaceDev.output.includes("Inspect: /workspace | /workspace packages | /workspace dev | /workspace verify"), "/workspace dev includes drill-down hints");

  const workspaceVerify = parser.tryHandle("/workspace verify");
  assert(workspaceVerify.output.includes("Workspace Verify:"), "/workspace verify prints verify header");
  assert(workspaceVerify.output.includes("Root verify command: bun run verify:all"), "/workspace verify includes root verify command");
  assert(workspaceVerify.output.includes("Package verify candidates: runtime-core: bun --filter runtime-core run verify:all"), "/workspace verify includes package verify candidates");
  assert(workspaceVerify.output.includes("Inspect: /workspace | /workspace packages | /workspace dev | /workspace verify"), "/workspace verify includes drill-down hints");

  const sessions = parser.tryHandle("/sessions");
  assert(sessions.output.includes("Persisted Sessions:"), "/sessions prints header");
  assert(sessions.output.includes("1. ses_saved_2"), "/sessions includes newest session index");
  assert(sessions.output.includes("awaiting reply"), "/sessions includes interruption label");
  assert(sessions.output.includes("last user: Need answer when run comes back."), "/sessions includes preview text");
  assert(sessions.output.includes("transcript-only"), "/sessions includes checkpoint state");
  assert(sessions.output.includes("llm anthropic:claude-sonnet-4-5"), "/sessions includes persisted session llm identity");
  assert(sessions.output.includes("saved 2026-04-16T10:00:00.000Z | last 2026-04-16T10:00:00.000Z"), "/sessions includes saved and last-message timing");
  assert(sessions.output.includes("use /resume pending, /resume latest, /resume 1, or /resume ses_saved_2"), "/sessions newest interrupted session keeps both pending and latest resume aliases");
  assert(sessions.output.includes("use /resume 2 or /resume ses_saved_1"), "/sessions older clean session omits latest alias");
  assert(sessions.output.includes("peek /history pending 8, /history latest 8, /history 1 8, or /history ses_saved_2 8"), "/sessions newest interrupted session keeps both pending and latest history aliases");
  assert(sessions.output.includes("peek /history 2 8 or /history ses_saved_1 8"), "/sessions includes transcript peek hints for clean sessions");

  const filteredSessions = parser.tryHandle("/sessions resume_focus");
  assert(filteredSessions.output.includes("Search: resume_focus"), "/sessions query prints search");
  assert(filteredSessions.output.includes("3. resume_focus_9"), "/sessions query keeps stable catalog index");

  const pendingSessions = parser.tryHandle("/sessions pending");
  assert(pendingSessions.output.includes("Filters: pending"), "/sessions pending prints filter");
  assert(pendingSessions.output.includes("1. ses_saved_2"), "/sessions pending includes interrupted session");
  assert(!pendingSessions.output.includes("resume_focus_9"), "/sessions pending excludes clean session");
  assert(pendingSessions.output.includes("/resume pending"), "/sessions pending suggests resume shortcut");
  assert(pendingSessions.output.includes("/resume latest"), "/sessions pending keeps latest alias on newest interrupted session");
  assert(pendingSessions.output.includes("/history pending 8"), "/sessions pending suggests history shortcut");
  assert(pendingSessions.output.includes("/history latest 8"), "/sessions pending keeps latest history alias on newest interrupted session");

  const transcriptSessions = parser.tryHandle("/sessions transcript 1");
  assert(transcriptSessions.output.includes("Filters: transcript-only"), "/sessions transcript prints normalized filter");
  assert(transcriptSessions.output.includes("3. resume_focus_9"), "/sessions transcript keeps stable index");

  const multiInterruptedSessions = new SlashCommandParser({
    sessions: [
      {
        sessionId: "ses_pending_new",
        agentId: "assist-ant",
        caste: "assist_ant",
        savedAt: "2026-04-17T12:00:00.000Z",
        lastMessageAt: "2026-04-17T12:01:00.000Z",
        messageCount: 5,
        tokensUsed: 640,
        costUsd: 0.02,
        interruption: "interrupted_prompt",
        hasCheckpoint: true,
        previewText: "Newest interrupted session.",
        previewRole: "user",
      },
      {
        sessionId: "ses_pending_old",
        agentId: "assist-ant",
        caste: "assist_ant",
        savedAt: "2026-04-16T09:00:00.000Z",
        lastMessageAt: "2026-04-16T09:30:00.000Z",
        messageCount: 7,
        tokensUsed: 900,
        costUsd: 0.03,
        interruption: "interrupted_turn",
        hasCheckpoint: false,
        previewText: "Older interrupted session.",
        previewRole: "assistant",
      },
    ],
  }).tryHandle("/sessions pending");
  assert(multiInterruptedSessions.output.includes("/resume pending, /resume latest, /resume 1, or /resume ses_pending_new"), "/sessions pending keeps pending and latest aliases on newest interrupted session");
  assert(multiInterruptedSessions.output.includes("/resume 2 or /resume ses_pending_old"), "/sessions pending older interrupted session omits pending alias");
  assert(multiInterruptedSessions.output.includes("/history pending 8, /history latest 8, /history 1 8, or /history ses_pending_new 8"), "/sessions pending keeps pending and latest history aliases on newest interrupted session");
  assert(multiInterruptedSessions.output.includes("/history 2 8 or /history ses_pending_old 8"), "/sessions pending older interrupted session keeps direct history hints");

  const cleanCatalogParser = new SlashCommandParser({
    sessions: [
      {
        sessionId: "ses_clean_new",
        agentId: "assist-ant",
        caste: "assist_ant",
        savedAt: "2026-04-17T12:00:00.000Z",
        lastMessageAt: "2026-04-17T12:01:00.000Z",
        messageCount: 5,
        tokensUsed: 640,
        costUsd: 0.02,
        interruption: "none",
        hasCheckpoint: true,
        previewText: "Newest clean session.",
        previewRole: "assistant",
      },
      {
        sessionId: "ses_clean_old",
        agentId: "assist-ant",
        caste: "assist_ant",
        savedAt: "2026-04-16T09:00:00.000Z",
        lastMessageAt: "2026-04-16T09:30:00.000Z",
        messageCount: 7,
        tokensUsed: 900,
        costUsd: 0.03,
        interruption: "none",
        hasCheckpoint: false,
        previewText: "Older clean session.",
        previewRole: "assistant",
      },
    ],
  });
  const cleanLatestSessions = cleanCatalogParser.tryHandle("/sessions");
  assert(cleanLatestSessions.output.includes("/resume latest, /resume 1, or /resume ses_clean_new"), "/sessions keeps latest alias on newest clean session only");
  assert(cleanLatestSessions.output.includes("/resume 2 or /resume ses_clean_old"), "/sessions older clean session omits latest alias");
  const noPendingCatalog = cleanCatalogParser.tryHandle("/sessions pending");
  assert(noPendingCatalog.output.includes("No interrupted persisted sessions match this view."), "/sessions pending empty state tells truth");
  assert(noPendingCatalog.output.includes("/sessions clean"), "/sessions pending empty state points to clean catalog view");
  assert(noPendingCatalog.output.includes("/resume latest"), "/sessions pending empty state points to latest recovery");
  assert(noPendingCatalog.output.includes("/history latest 8"), "/sessions pending empty state points to latest history");

  const currentCatalogParser = new SlashCommandParser({
    session: {
      sessionId: "ses_current_live",
      agentId: "assist-ant",
      caste: "assist_ant",
      history: [
        { type: "user", content: "still active", timestamp: "2026-04-17T12:05:00.000Z" },
      ],
    },
    sessions: [
      {
        sessionId: "ses_current_live",
        agentId: "assist-ant",
        caste: "assist_ant",
        savedAt: "2026-04-17T12:00:00.000Z",
        lastMessageAt: "2026-04-17T12:05:00.000Z",
        messageCount: 3,
        tokensUsed: 300,
        costUsd: 0.01,
        interruption: "interrupted_prompt",
        hasCheckpoint: true,
        previewText: "Still active in current loop.",
        previewRole: "user",
      },
    ],
  });
  const currentCatalogSession = currentCatalogParser.tryHandle("/sessions");
  assert(currentCatalogSession.output.includes("1. ses_current_live (current)"), "/sessions marks current persisted row");
  assert(currentCatalogSession.output.includes("use /resume ses_current_live, /status, /cost, or /clear"), "/sessions current row includes exact current resume ref alongside active controls");
  assert(currentCatalogSession.output.includes("peek /history current 8, /history pending 8, /history latest 8, or /history ses_current_live 8"), "/sessions current row includes current, pending, latest, and exact history refs");
  assert(!currentCatalogSession.output.includes("/resume pending"), "/sessions current row omits pending resume alias");
  const currentCatalogOnly = currentCatalogParser.tryHandle("/sessions current");
  assert(currentCatalogOnly.output.includes("1. ses_current_live (current)"), "/sessions current filter keeps persisted current row when present");

  const currentAliasHistoryLatest = currentCatalogParser.tryHandle("/history latest 1");
  assert(currentAliasHistoryLatest.output.includes("Source: current session"), "/history latest current target stays on current transcript");
  assert(currentAliasHistoryLatest.output.includes("Messages shown: 1 of 1"), "/history latest current target uses live message count");
  assert((currentAliasHistoryLatest.action as { kind?: string } | undefined)?.kind !== "show_session_history", "/history latest current target emits no persisted-history action");

  const currentAliasHistoryPending = currentCatalogParser.tryHandle("/history pending 1");
  assert(currentAliasHistoryPending.output.includes("Source: current session"), "/history pending current target stays on current transcript");
  assert((currentAliasHistoryPending.action as { kind?: string } | undefined)?.kind !== "show_session_history", "/history pending current target emits no persisted-history action");

  const unsavedCurrentCatalogParser = new SlashCommandParser({
    session: {
      sessionId: "ses_live_only",
      agentId: "assist-ant",
      caste: "assist_ant",
      history: [
        { type: "user", content: "live but unsaved", timestamp: "2026-04-17T12:06:00.000Z" },
      ],
    },
    sessions: [
      {
        sessionId: "ses_clean_new",
        agentId: "assist-ant",
        caste: "assist_ant",
        savedAt: "2026-04-17T12:00:00.000Z",
        lastMessageAt: "2026-04-17T12:01:00.000Z",
        messageCount: 5,
        tokensUsed: 640,
        costUsd: 0.02,
        interruption: "none",
        hasCheckpoint: true,
        previewText: "Newest clean session.",
        previewRole: "assistant",
      },
    ],
  });
  const unsavedCurrentCatalog = unsavedCurrentCatalogParser.tryHandle("/sessions current");
  assert(unsavedCurrentCatalog.output.includes("Current live session is not saved in persisted catalog yet."), "/sessions current empty state explains unsaved live session");
  assert(unsavedCurrentCatalog.output.includes("/status"), "/sessions current empty state points to live status");
  assert(unsavedCurrentCatalog.output.includes("/history current 8"), "/sessions current empty state points to live history");
  assert(unsavedCurrentCatalog.output.includes("/history ses_live_only 8"), "/sessions current empty state includes exact live history ref");
  assert(unsavedCurrentCatalog.output.includes("/sessions"), "/sessions current empty state keeps catalog path");
  const unsavedLatestCatalog = unsavedCurrentCatalogParser.tryHandle("/sessions");
  assert(!unsavedLatestCatalog.output.includes("/resume latest | /resume 1"), "/sessions omits latest alias on saved row when newer unsaved current session owns latest");
  assert(!unsavedLatestCatalog.output.includes("/history latest 8 | /history 1 8"), "/sessions omits latest history alias on saved row when newer unsaved current session owns latest");
  const unsavedLatestHistory = unsavedCurrentCatalogParser.tryHandle("/history latest 1");
  assert(unsavedLatestHistory.output.includes("Source: current session"), "/history latest resolves newer unsaved live session to current transcript");
  assert(unsavedLatestHistory.output.includes("Inspect: /status, /cost, /history current 8, /history pending 8, /history latest 8, or /history ses_live_only 8"), "/history latest current excerpt includes pending, latest, and exact live inspect paths");
  assert((unsavedLatestHistory.action as { kind?: string } | undefined)?.kind !== "show_session_history", "/history latest newer unsaved live session emits no persisted-history action");
  const unsavedLatestResume = unsavedCurrentCatalogParser.tryHandle("/resume latest");
  assert(unsavedLatestResume.output.includes("Session ses_live_only is already current."), "/resume latest resolves newer unsaved live session to current");
  assert((unsavedLatestResume.action as { kind?: string } | undefined)?.kind !== "resume_session", "/resume latest newer unsaved live session emits no resume action");
  const unsavedLatestStatus = unsavedCurrentCatalogParser.tryHandle("/status");
  assert(unsavedLatestStatus.output.includes("Latest active: /status, /history current 8, /history pending 8, /history latest 8, or /history ses_live_only 8"), "/status latest-current hint includes full unsaved current history alias set when live session owns latest");
  assert(unsavedLatestStatus.output.includes("Inspect: /sessions, /history current 8, /history pending 8, /history latest 8, or /history ses_live_only 8"), "/status latest inspect hint flips to full current alias set when newer unsaved live session owns latest");

  const livePendingOnlyParser = new SlashCommandParser({
    session: {
      sessionId: "ses_live_pending_only",
      agentId: "assist-ant",
      caste: "assist_ant",
      history: [
        { type: "user", content: "waiting live", timestamp: "2026-04-17T12:07:00.000Z" },
      ],
    },
  });
  const livePendingCatalog = livePendingOnlyParser.tryHandle("/sessions pending");
  assert(livePendingCatalog.output.includes("Current live session is awaiting reply and not saved in persisted catalog yet."), "/sessions pending points to live unsaved pending session");
  assert(livePendingCatalog.output.includes("/status"), "/sessions pending live unsaved hint points to status");
  assert(livePendingCatalog.output.includes("/history current 8"), "/sessions pending live unsaved hint points to current history");
  assert(livePendingCatalog.output.includes("/history ses_live_pending_only 8"), "/sessions pending live unsaved hint includes exact live history ref");

  const livePendingResume = livePendingOnlyParser.tryHandle("/resume pending");
  assert(livePendingResume.output.includes("Session ses_live_pending_only is already current."), "/resume pending resolves live unsaved pending session to current");
  assert(livePendingResume.output.includes("Inspect live state: /status, /history current 8, /history pending 8, /history latest 8, or /history ses_live_pending_only 8"), "/resume pending live current path includes current, pending, latest, and exact current history refs");
  assert((livePendingResume.action as { kind?: string } | undefined)?.kind !== "resume_session", "/resume pending live current path emits no resume action");

  const livePendingHistory = livePendingOnlyParser.tryHandle("/history pending 1");
  assert(livePendingHistory.output.includes("Source: current session"), "/history pending resolves live unsaved pending session to current transcript");
  assert(livePendingHistory.output.includes("Inspect: /status, /cost, /history current 8, /history pending 8, /history latest 8, or /history ses_live_pending_only 8"), "/history pending current excerpt includes pending, latest, and exact live inspect paths");
  assert((livePendingHistory.action as { kind?: string } | undefined)?.kind !== "show_session_history", "/history pending live current path emits no persisted-history action");

  const currentAliasHistoryExact = currentCatalogParser.tryHandle("/history ses_current_live 1");
  assert(currentAliasHistoryExact.output.includes("Source: current session"), "/history exact current target stays on current transcript");
  assert((currentAliasHistoryExact.action as { kind?: string } | undefined)?.kind !== "show_session_history", "/history exact current target emits no persisted-history action");

  const currentAssistantHistory = parser.tryHandle("/history assistant 6");
  assert(currentAssistantHistory.output.includes("Filter: assistant"), "/history assistant includes filter label");
  assert(currentAssistantHistory.output.includes("assistant @ 2026-04-16T08:59:00.000Z"), "/history assistant keeps assistant entry");
  assert(!currentAssistantHistory.output.includes("user @ 2026-04-16T09:00:00.000Z"), "/history assistant omits non-matching current entries");

  const currentSearchHistory = parser.tryHandle("/history search there 6");
  assert(currentSearchHistory.output.includes("Search: there"), "/history search includes search label");
  assert(currentSearchHistory.output.includes("Messages shown: 1 filtered of 6 visible (6 total)"), "/history search reports filtered counts");
  assert(currentSearchHistory.output.includes("assistant @ 2026-04-16T08:59:00.000Z"), "/history search keeps matching current entry");
  assert(!currentSearchHistory.output.includes("tool:file_edit @ 2026-04-16T08:58:00.000Z"), "/history search omits non-matching current entry");

  const persistedToolHistory = parser.tryHandle("/history latest tool 4");
  assertEqual((persistedToolHistory.action as { kind?: string } | undefined)?.kind, "show_session_history", "/history latest tool still loads persisted history");
  assertEqual((persistedToolHistory.action as { historyFilter?: string } | undefined)?.historyFilter, "tool", "/history latest tool keeps tool filter on action");

  const persistedSearchHistory = parser.tryHandle("/history latest tool search read 4");
  assertEqual((persistedSearchHistory.action as { kind?: string } | undefined)?.kind, "show_session_history", "/history latest tool search still loads persisted history");
  assertEqual((persistedSearchHistory.action as { historyFilter?: string } | undefined)?.historyFilter, "tool", "/history latest tool search keeps tool filter on action");
  assertEqual((persistedSearchHistory.action as { historySearch?: string } | undefined)?.historySearch, "read", "/history latest tool search keeps search query on action");

  const noActiveHistoryParser = new SlashCommandParser({
    sessions: [
      {
        sessionId: "ses_saved_2",
        agentId: "assist-ant",
        caste: "assist_ant",
        savedAt: "2026-04-16T10:00:00.000Z",
        lastMessageAt: "2026-04-16T10:00:00.000Z",
        messageCount: 4,
        tokensUsed: 500,
        costUsd: 0.01,
        interruption: "interrupted_prompt",
        hasCheckpoint: true,
        previewText: "Need answer when run comes back.",
        previewRole: "user",
      },
    ],
  });
  const noActiveHistory = noActiveHistoryParser.tryHandle("/history 3");
  assert(noActiveHistory.isError, "/history without current session errors when only persisted recovery state exists");
  assert(noActiveHistory.output.includes("Use /history latest 3, /history pending 3, or /history ses_saved_2 3"), "/history no-active-session hint lists the real saved recovery commands");

  const noPendingParser = new SlashCommandParser({
    sessions: [
      {
        sessionId: "ses_clean_new",
        agentId: "assist-ant",
        caste: "assist_ant",
        savedAt: "2026-04-17T12:00:00.000Z",
        lastMessageAt: "2026-04-17T12:01:00.000Z",
        messageCount: 5,
        tokensUsed: 640,
        costUsd: 0.02,
        interruption: "none",
        hasCheckpoint: true,
        previewText: "Newest clean session.",
        previewRole: "assistant",
      },
    ],
  });
  const noPendingResume = noPendingParser.tryHandle("/resume pending");
  assert(noPendingResume.isError, "/resume pending errors when no interrupted saved session exists");
  assert(noPendingResume.output.includes("Use /resume latest, /history latest 8, /resume ses_clean_new, /history ses_clean_new 8, or /sessions"), "/resume pending fallback points to real saved recovery commands");
  const noPendingHistory = noPendingParser.tryHandle("/history pending 2");
  assert(noPendingHistory.isError, "/history pending errors when no interrupted saved session exists");
  assert(noPendingHistory.output.includes("Use /resume latest, /history latest 8, /resume ses_clean_new, /history ses_clean_new 8, or /sessions"), "/history pending fallback points to real saved recovery commands");

  const artifactCatalog = parser.tryHandle("/artifact");
  assertEqual((artifactCatalog.action as { kind?: string } | undefined)?.kind, "show_artifact_catalog", "/artifact lists recent saved artifacts when no path is given");
  assert(artifactCatalog.output.includes("Loading saved artifacts for current session..."), "/artifact list announces artifact catalog load");

  const latestArtifact = parser.tryHandle("/artifact latest");
  assertEqual((latestArtifact.action as { kind?: string } | undefined)?.kind, "show_artifact_catalog", "/artifact latest resolves through artifact catalog action");
  assert(latestArtifact.output.includes("Opening latest saved artifact for current session..."), "/artifact latest announces latest-artifact load");

  const newerArtifactPath = join(getDataPath(settings), "tool-results", "ses_abc123", "recent-output.txt");

  const artifactPath = join(getDataPath(settings), "tool-results", "phase7-artifact", "saved-output.txt");
  const artifact = parser.tryHandle(`/artifact "${artifactPath}"`);
  assertEqual((artifact.action as { kind?: string } | undefined)?.kind, "show_artifact", "/artifact emits artifact-view action");
  assert(artifact.output.includes("Opening saved artifact..."), "/artifact announces saved artifact load");
  assert(artifact.output.includes(`Path: ${artifactPath}`), "/artifact keeps exact saved artifact path");
  const outsideArtifact = parser.tryHandle(`/artifact "${join(tmpdir(), "outside-artifact.txt")}"`);
  assert(outsideArtifact.isError, "/artifact rejects paths outside Colony tool-results storage");
  assert(outsideArtifact.output.includes("Artifact path not allowed"), "/artifact explains path restriction");

  const currentHistory = parser.tryHandle("/history 3");
  assertEqual(currentHistory.command, "history", "Parser executes /history");
  assert(currentHistory.output.includes("Session History:"), "/history prints header");
  assert(currentHistory.output.includes("Source: current session"), "/history marks current source");
  assert(currentHistory.output.includes("Messages shown: 3 of 6"), "/history reports visible count");
  assert(currentHistory.output.includes("Started: 2026-04-16T08:55:00.000Z"), "/history current session includes started timestamp from transcript");
  assert(currentHistory.output.includes("Latest message: 2026-04-16T09:00:00.000Z"), "/history current session includes latest-message timestamp from transcript");
  assert(currentHistory.output.includes("4. user"), "/history keeps absolute numbering");
  assert(currentHistory.output.includes("6. user"), "/history includes latest current message");
  assert(currentHistory.output.includes("Inspect: /status, /cost, /history current 8, or /history ses_abc123 8"), "/history current session includes exact live inspect commands");
  assert(currentHistory.output.includes("Control: /compact | /clear"), "/history current session includes control hints");

  const queuedCompact = new SlashCommandParser({
    session: {
      sessionId: "ses_abc123",
      agentId: "agent-1",
      caste: "assist_ant",
      history: [
        { type: "system", content: "sys" },
        { type: "user", content: "hello" },
        { type: "assistant", content: "hi" },
        { type: "user", content: "again" },
        { type: "assistant", content: "there" },
        { type: "user", content: "compact me" },
      ],
    },
    runtime: {
      activeRun: true,
      isThinking: true,
      pendingCompactionStrategy: "standard",
    },
  }).tryHandle("/compact");
  assert(queuedCompact.output.includes("Context compaction already queued (standard)"), "/compact reports already queued compaction");
  assertEqual(queuedCompact.data.requested, false, "/compact queued state does not request another compaction");
  const queuedCompactStatus = new SlashCommandParser({
    session: {
      sessionId: "ses_abc123",
      agentId: "agent-1",
      caste: "assist_ant",
      history: [
        { type: "system", content: "sys" },
        { type: "user", content: "hello" },
        { type: "assistant", content: "hi" },
        { type: "user", content: "again" },
        { type: "assistant", content: "there" },
        { type: "user", content: "compact me" },
      ],
    },
    contextUsage: {
      usedTokens: 150_000,
      maxTokens: 200_000,
      remainingTokens: 50_000,
      percentUsed: 75,
      messageCount: 6,
      isAboveWarningThreshold: true,
      isAboveAutoCompactThreshold: false,
      isAtBlockingLimit: false,
      compactionFailureCount: 0,
    },
    lastCompactionFailure: {
      strategy: "reactive",
      message: "Compaction engine offline.",
    },
    recentCompactions: [
      {
        strategy: "micro",
        trigger: "manual",
        timestamp: Date.parse("2026-04-17T12:00:00.000Z"),
        compacted: true,
        originalCount: 12,
        finalCount: 12,
        tokensSavedEstimate: 140,
        summaryLineCount: 0,
        summarizedMessageCount: 2,
      },
      {
        strategy: "reactive",
        trigger: "reactive_overflow",
        timestamp: Date.parse("2026-04-17T12:05:00.000Z"),
        compacted: false,
        originalCount: 12,
        finalCount: 12,
        tokensSavedEstimate: 0,
        summaryLineCount: 0,
        summarizedMessageCount: 0,
        failureMessage: "Compaction engine offline.",
      },
    ],
    latestCompactionHandoff: {
      status: "ok",
      strategy: "micro",
      trigger: "manual",
      timestamp: Date.parse("2026-04-17T12:06:00.000Z"),
      loggedCount: 2,
      structuredCount: 1,
      artifactId: "art_handoff1",
      artifactChars: 320,
    },
    runtime: {
      activeRun: true,
      isThinking: true,
      pendingCompactionStrategy: "standard",
    },
  }).tryHandle("/compact status");
  assert(queuedCompactStatus.output.includes("Compaction Status:"), "/compact status prints status header");
  assert(queuedCompactStatus.output.includes("Pressure: warning"), "/compact status includes pressure label");
  assert(queuedCompactStatus.output.includes("Queued: standard"), "/compact status includes queued strategy");
  assert(queuedCompactStatus.output.includes("Recent events: 2"), "/compact status includes recent compaction count");
  assert(queuedCompactStatus.output.includes("Last compaction failure:"), "/compact status includes last failure block");
  assert(queuedCompactStatus.output.includes("Strategy: reactive"), "/compact status includes last failure strategy");
  assert(queuedCompactStatus.output.includes("Last handoff: ok | micro/manual | 2 logged | 1 structured"), "/compact status includes latest handoff summary");
  assert(queuedCompactStatus.output.includes("Artifact: art_handoff1 | 320 chars"), "/compact status includes latest handoff artifact detail");
  assert(queuedCompactStatus.output.includes("Recommend: hold"), "/compact status suppresses new recommendation when queue exists");
  assert(queuedCompactStatus.output.includes("Why: standard compaction already queued"), "/compact status explains queued recommendation");
  assert(queuedCompactStatus.output.includes("Inspect: /compact recent | /compact handoff | /status | /cost"), "/compact status includes handoff inspect path");

  const compactRecent = new SlashCommandParser({
    recentCompactions: [
      {
        strategy: "standard",
        trigger: "manual",
        timestamp: Date.parse("2026-04-17T12:10:00.000Z"),
        durationMs: 58,
        compacted: true,
        originalCount: 20,
        finalCount: 14,
        tokensSavedEstimate: 900,
        summaryLineCount: 8,
        summarizedMessageCount: 7,
      },
      {
        strategy: "reactive",
        trigger: "reactive_overflow",
        timestamp: Date.parse("2026-04-17T12:11:00.000Z"),
        durationMs: 91,
        compacted: false,
        originalCount: 14,
        finalCount: 14,
        tokensSavedEstimate: 0,
        summaryLineCount: 0,
        summarizedMessageCount: 0,
        failureMessage: "Compaction engine offline.",
      },
    ],
  }).tryHandle("/compact recent");
  assert(compactRecent.output.includes("Recent Compactions:"), "/compact recent prints recent header");
  assert(compactRecent.output.includes("reactive via reactive overflow | failed"), "/compact recent includes failed compaction event");
  assert(compactRecent.output.includes("failed | 91ms"), "/compact recent includes failed compaction duration");
  assert(compactRecent.output.includes("Reason: Compaction engine offline."), "/compact recent includes failure reason");
  assert(compactRecent.output.includes("standard via manual request | 20->14 | saved ~900t | 58ms"), "/compact recent includes successful compaction summary with duration");
  assert(compactRecent.output.includes("Summarized: 7 msg across 8 lines"), "/compact recent includes summarized detail");
  assert(compactRecent.output.includes("Views: /compact status | /compact recent | /compact handoff | /status | /cost"), "/compact recent includes drill-down views");

  const compactHandoff = new SlashCommandParser({
    latestCompactionHandoff: {
      status: "ok",
      strategy: "standard",
      trigger: "manual",
      timestamp: Date.parse("2026-04-17T12:12:00.000Z"),
      loggedCount: 7,
      structuredCount: 3,
      artifactId: "art_handoff2",
      artifactChars: 1024,
    },
  }).tryHandle("/compact handoff");
  assert(compactHandoff.output.includes("Compaction Memory Handoff:"), "/compact handoff prints handoff header");
  assert(compactHandoff.output.includes("Status: ok"), "/compact handoff includes status");
  assert(compactHandoff.output.includes("Compaction: standard via manual request"), "/compact handoff includes compaction identity");
  assert(compactHandoff.output.includes("Logged transcript turns: 7"), "/compact handoff includes logged count");
  assert(compactHandoff.output.includes("Structured memories: 3"), "/compact handoff includes structured memory count");
  assert(compactHandoff.output.includes("Artifact: art_handoff2 | 1,024 chars"), "/compact handoff includes artifact detail");
  assert(compactHandoff.output.includes("Views: /compact status | /compact recent | /compact handoff | /status | /perf compactions"), "/compact handoff includes drill-down views");

  const activeCompact = new SlashCommandParser({
    session: {
      sessionId: "ses_abc123",
      agentId: "agent-1",
      caste: "assist_ant",
      history: [
        { type: "system", content: "sys" },
        { type: "user", content: "hello" },
        { type: "assistant", content: "hi" },
        { type: "user", content: "again" },
        { type: "assistant", content: "there" },
        { type: "user", content: "compact me" },
      ],
    },
    runtime: {
      activeRun: true,
    },
  }).tryHandle("/compact");
  assert(activeCompact.output.includes("Context standard compaction requested for 6 messages."), "/compact active-run path reports queued compaction request truthfully");
  assert(activeCompact.output.includes("The compaction engine will run before the next loop iteration."), "/compact active-run path reports deferred timing truthfully");

  const idleCompact = new SlashCommandParser({
    session: {
      sessionId: "ses_abc123",
      agentId: "agent-1",
      caste: "assist_ant",
      history: [
        { type: "system", content: "sys" },
        { type: "user", content: "hello" },
        { type: "assistant", content: "hi" },
        { type: "user", content: "again" },
        { type: "assistant", content: "there" },
        { type: "user", content: "compact me" },
      ],
    },
  }).tryHandle("/compact");
  assert(idleCompact.output.includes("Running standard compaction for 6 messages..."), "/compact idle path reports immediate compaction truthfully");

  const idleMicroCompact = new SlashCommandParser({
    session: {
      sessionId: "ses_micro_1",
      agentId: "agent-1",
      caste: "assist_ant",
      history: [
        { type: "system", content: "sys" },
        { type: "user", content: "show tool output" },
        { type: "tool_result", toolCallId: "tool_1", name: "grep_search", content: "match\n".repeat(1600), isError: false, executionTimeMs: 8 },
        { type: "assistant", content: "tool output captured" },
        { type: "user", content: "keep latest exchange" },
        { type: "assistant", content: "latest reply" },
      ],
    },
  }).tryHandle("/compact micro");
  assert(idleMicroCompact.output.includes("Running micro compaction for 6 messages..."), "/compact micro idle path reports immediate micro compaction truthfully");
  assertEqual((idleMicroCompact.action as { strategy?: string } | undefined)?.strategy, "micro", "/compact micro keeps micro action strategy");

  const smartMicroCompact = new SlashCommandParser({
    session: {
      sessionId: "ses_micro_smart",
      agentId: "agent-1",
      caste: "assist_ant",
      history: [
        { type: "system", content: "sys" },
        { type: "user", content: "show tool output" },
        { type: "tool_result", toolCallId: "tool_smart_1", name: "grep_search", content: "match\n".repeat(1600), isError: false, executionTimeMs: 8 },
        { type: "assistant", content: "tool output captured" },
        { type: "user", content: "keep latest exchange" },
        { type: "assistant", content: "latest reply" },
      ],
    },
    contextUsage: {
      usedTokens: 148_000,
      maxTokens: 200_000,
      remainingTokens: 52_000,
      percentUsed: 74,
      messageCount: 6,
      isAboveWarningThreshold: true,
      isAboveAutoCompactThreshold: false,
      isAtBlockingLimit: false,
      compactionFailureCount: 0,
    },
  }).tryHandle("/compact smart");
  assert(smartMicroCompact.output.includes("Running smart compaction (micro) for 6 messages..."), "/compact smart resolves to micro when stale tool output is best target");
  assert(smartMicroCompact.output.includes("Why:"), "/compact smart explains resolved strategy");
  assertEqual((smartMicroCompact.action as { strategy?: string } | undefined)?.strategy, "micro", "/compact smart resolves action strategy before execution");

  const smartHoldCompact = new SlashCommandParser({
    session: {
      sessionId: "ses_compact_hold",
      agentId: "agent-1",
      caste: "assist_ant",
      history: [
        { type: "system", content: "sys" },
        { type: "user", content: "hello" },
        { type: "assistant", content: "hi" },
      ],
    },
    contextUsage: {
      usedTokens: 8_000,
      maxTokens: 200_000,
      remainingTokens: 192_000,
      percentUsed: 4,
      messageCount: 3,
      isAboveWarningThreshold: false,
      isAboveAutoCompactThreshold: false,
      isAtBlockingLimit: false,
      compactionFailureCount: 0,
    },
  }).tryHandle("/compact smart");
  assert(smartHoldCompact.output.includes("Smart compaction says hold."), "/compact smart can decline when pressure is low");
  assert(smartHoldCompact.output.includes("Why:"), "/compact smart hold path explains why");
  assertEqual((smartHoldCompact.action as { kind?: string } | undefined)?.kind, "display", "/compact smart hold path emits no compaction request");

  const noActiveCompact = new SlashCommandParser({
    sessions: [
      {
        sessionId: "ses_saved_2",
        agentId: "assist-ant",
        caste: "assist_ant",
        savedAt: "2026-04-16T10:00:00.000Z",
        lastMessageAt: "2026-04-16T10:00:00.000Z",
        messageCount: 4,
        tokensUsed: 500,
        costUsd: 0.01,
        interruption: "interrupted_prompt",
        hasCheckpoint: true,
        previewText: "Need answer when run comes back.",
        previewRole: "user",
      },
    ],
  }).tryHandle("/compact");
  assert(noActiveCompact.isError, "/compact without active session errors");
  assert(noActiveCompact.output.includes("Use /resume latest, /resume pending, /resume ses_saved_2, or /sessions"), "/compact without active session points to real recovery commands");

  const upgradeCompact = new SlashCommandParser({
    session: {
      sessionId: "ses_abc123",
      agentId: "agent-1",
      caste: "assist_ant",
      history: [
        { type: "system", content: "sys" },
        { type: "user", content: "hello" },
        { type: "assistant", content: "hi" },
        { type: "user", content: "again" },
        { type: "assistant", content: "there" },
        { type: "user", content: "compact me" },
      ],
    },
    runtime: {
      activeRun: true,
      isThinking: true,
      pendingCompactionStrategy: "standard",
    },
  }).tryHandle("/compact reactive");
  assert(upgradeCompact.output.includes("standard -> reactive"), "/compact reactive reports queued upgrade");
  assertEqual(upgradeCompact.data.requested, true, "/compact reactive requests queued upgrade");
  assertEqual((upgradeCompact.action as { strategy?: string } | undefined)?.strategy, "reactive", "/compact reactive keeps reactive action strategy");

  const invalidCompact = parser.tryHandle("/compact bogus");
  assert(invalidCompact.isError, "/compact invalid strategy errors");
  assert(invalidCompact.output.includes("Usage: /compact [standard|micro|reactive|smart|status|recent|handoff]"), "/compact invalid strategy shows smart-aware usage");

  const microRecommendCompact = new SlashCommandParser({
    session: {
      sessionId: "ses_micro_status",
      agentId: "assist-ant",
      caste: "assist_ant",
      history: [
        { type: "system", content: "sys" },
        { type: "user", content: "read file" },
        { type: "tool_result", toolCallId: "tool_micro_1", name: "file_read", content: "line\n".repeat(1800), isError: false, executionTimeMs: 7 },
        { type: "assistant", content: "captured old file output" },
        { type: "tool_result", toolCallId: "tool_micro_2", name: "grep_search", content: "match\n".repeat(1500), isError: false, executionTimeMs: 10 },
        { type: "user", content: "keep latest turn intact" },
        { type: "assistant", content: "latest answer" },
      ],
    },
    contextUsage: {
      usedTokens: 148_000,
      maxTokens: 200_000,
      remainingTokens: 52_000,
      percentUsed: 74,
      messageCount: 7,
      isAboveWarningThreshold: true,
      isAboveAutoCompactThreshold: false,
      isAtBlockingLimit: false,
      compactionFailureCount: 0,
    },
  }).tryHandle("/compact status");
  assert(microRecommendCompact.output.includes("Micro candidates: 2 older tool results"), "/compact status surfaces micro compaction candidates");
  assert(microRecommendCompact.output.includes("Recommend: /compact smart -> micro"), "/compact status can recommend smart compaction toward micro");
  assert(microRecommendCompact.output.includes("Direct: /compact micro"), "/compact status still exposes direct strategy path");
  assert(microRecommendCompact.output.includes("older tool results"), "/compact status explains micro recommendation reason");

  const provider = parser.tryHandle("/provider");
  assert(provider.output.includes("Selected provider: local"), "/provider summary includes selected provider");
  assert(provider.output.includes("Selected model: llama3.2"), "/provider summary includes selected model");
  assert(provider.output.includes("Configured providers"), "/provider includes configured providers");
  assert(provider.output.includes("Failover:"), "/provider includes failover chain");
  assert(provider.output.includes("Observed health:"), "/provider includes observed health");
  assert(provider.output.includes("local: open (failures: 3)"), "/provider includes circuit state per provider");
  assert(provider.output.includes("Recent failovers:"), "/provider includes recent failovers");
  assert(provider.output.includes("/provider health"), "/provider summary includes drill-down hint");
  assert(provider.output.includes("/provider perf"), "/provider summary includes perf drill-down hint");
  assert(provider.output.includes("Switch: /provider use <name>"), "/provider summary includes switch hint");
  assert(provider.output.includes("Next steps:"), "/provider summary includes recovery section");
  assert(provider.output.includes("Circuit open. Check /provider failovers and /doctor before retrying."), "/provider summary includes circuit-open recovery hint");
  assert(provider.output.includes("Start Ollama."), "/provider summary includes startup-derived fix");
  assert(provider.output.includes("Performance: 1 provider(s) timed | slowest anthropic 2.3s | /provider perf"), "/provider summary includes mapped performance snapshot");

  const providerHealth = parser.tryHandle("/provider health");
  assert(providerHealth.output.includes("Provider Health:"), "/provider health prints health header");
  assert(providerHealth.output.includes("local (current): open"), "/provider health marks current provider");
  assert(providerHealth.output.includes("Inspect: /provider current | /provider perf | /provider <name> | /doctor"), "/provider health includes inspect hint");

  const providerFailovers = parser.tryHandle("/provider failovers");
  assert(providerFailovers.output.includes("Recent failovers:"), "/provider failovers prints failover header");
  assert(providerFailovers.output.includes("connect refused"), "/provider failovers includes error message");
  assert(providerFailovers.output.includes("Inspect: /provider perf | /provider <name> | /provider failovers <name> | /doctor"), "/provider failovers includes focused inspect hint");

  const providerFailoversAnthropic = parser.tryHandle("/provider failovers anthropic");
  assert(providerFailoversAnthropic.output.includes("Provider Failovers: anthropic"), "/provider failovers anthropic prints focused header");
  assert(providerFailoversAnthropic.output.includes("Configured model: claude-sonnet-4-5"), "/provider failovers anthropic includes configured model");
  assert(providerFailoversAnthropic.output.includes("Observed health: closed (failures: 0)"), "/provider failovers anthropic includes focused health");
  assert(providerFailoversAnthropic.output.includes("Matched recent failovers: 1 of 1"), "/provider failovers anthropic includes matched count");
  assert(providerFailoversAnthropic.output.includes("Recent incoming failovers:"), "/provider failovers anthropic includes incoming section");
  assert(providerFailoversAnthropic.output.includes("local:llama3.2 -> anthropic:claude-sonnet-4-5"), "/provider failovers anthropic includes focused failover event");
  assert(providerFailoversAnthropic.output.includes("Recent outgoing failovers:"), "/provider failovers anthropic includes outgoing section");
  assert(providerFailoversAnthropic.output.includes("(No outgoing failovers recorded for anthropic)"), "/provider failovers anthropic reports missing outgoing history");
  assert(providerFailoversAnthropic.output.includes("Recovery:"), "/provider failovers anthropic includes recovery section");
  assert(providerFailoversAnthropic.output.includes("Set ANTHROPIC_API_KEY."), "/provider failovers anthropic includes startup-derived recovery");
  assert(providerFailoversAnthropic.output.includes("Inspect: /provider anthropic | /provider perf anthropic | /provider health | /doctor anthropic"), "/provider failovers anthropic includes focused inspect hint");

  const providerAnthropic = parser.tryHandle("/provider anthropic");
  assert(providerAnthropic.output.includes("Selected provider: anthropic"), "/provider anthropic selects requested provider");
  assert(providerAnthropic.output.includes("Configured model: claude-sonnet-4-5"), "/provider anthropic includes configured model");
  assert(providerAnthropic.output.includes("Selected default: no"), "/provider anthropic shows when provider is not selected default");
  assert(providerAnthropic.output.includes("Recent incoming failovers:"), "/provider anthropic includes incoming failovers");
  assert(providerAnthropic.output.includes("Anthropic credentials"), "/provider anthropic includes related startup check");
  assert(providerAnthropic.output.includes("Next steps:"), "/provider anthropic includes next-step section");
  assert(providerAnthropic.output.includes("Set ANTHROPIC_API_KEY."), "/provider anthropic includes startup-derived fix");
  assert(providerAnthropic.output.includes("Performance: 2.3s over 1 calls | /provider perf anthropic"), "/provider anthropic includes focused performance shortcut");

  const providerPerf = parser.tryHandle("/provider perf");
  assert(providerPerf.output.includes("Provider Performance:"), "/provider perf prints performance header");
  assert(providerPerf.output.includes("Timed providers: 1"), "/provider perf includes timed provider count");
  assert(providerPerf.output.includes("Total API time: 2.3s"), "/provider perf includes total api time");
  assert(providerPerf.output.includes("Average API time: 2.30s/call"), "/provider perf includes average api time");
  assert(providerPerf.output.includes("Slowest average: anthropic | 2.30s/call"), "/provider perf includes slowest average provider");
  assert(providerPerf.output.includes("Highest total: anthropic | 2.3s over 1 calls"), "/provider perf includes highest total provider");
  assert(providerPerf.output.includes("anthropic: 2.3s total | 1 calls | 2.30s/call | claude-sonnet-4-5"), "/provider perf includes anthropic latency row");
  assert(providerPerf.output.includes("Unmapped timed models: gpt-4o"), "/provider perf reports unmapped timed model rows honestly");
  assert(providerPerf.output.includes("Inspect: /provider | /provider health | /provider failovers | /provider perf | /provider current"), "/provider perf includes inspect views");

  const providerPerfAnthropic = parser.tryHandle("/provider perf anthropic");
  assert(providerPerfAnthropic.output.includes("Provider Performance: anthropic"), "/provider perf anthropic prints focused header");
  assert(providerPerfAnthropic.output.includes("Configured model: claude-sonnet-4-5"), "/provider perf anthropic includes configured model");
  assert(providerPerfAnthropic.output.includes("Mapped models: claude-sonnet-4-5"), "/provider perf anthropic includes mapped model");
  assert(providerPerfAnthropic.output.includes("Total API time: 2.3s"), "/provider perf anthropic includes total api time");
  assert(providerPerfAnthropic.output.includes("Average API time: 2.30s/call"), "/provider perf anthropic includes average api time");
  assert(providerPerfAnthropic.output.includes("claude-sonnet-4-5: 2.3s total | 1 calls | 2.30s/call"), "/provider perf anthropic includes per-model latency row");
  assert(providerPerfAnthropic.output.includes("Inspect: /provider anthropic | /provider perf anthropic | /provider failovers anthropic | /doctor anthropic"), "/provider perf anthropic includes focused inspect hint");

  const providerUseAnthropic = parser.tryHandle("/provider use anthropic");
  assertEqual((providerUseAnthropic.action as { kind?: string } | undefined)?.kind, "set_provider", "/provider use anthropic emits set-provider action");
  assertEqual((providerUseAnthropic.action as { provider?: string } | undefined)?.provider, "anthropic", "/provider use anthropic keeps resolved provider in action");
  assert(providerUseAnthropic.output.includes("Provider selection updated:"), "/provider use anthropic reports selection update");
  assert(providerUseAnthropic.output.includes("Selected provider: anthropic"), "/provider use anthropic reports selected provider");
  assert(providerUseAnthropic.output.includes("Selected model: claude-sonnet-4-5"), "/provider use anthropic reports selected model");
  assert(providerUseAnthropic.output.includes("Next run: anthropic:claude-sonnet-4-5 primary"), "/provider use anthropic reports next-run primary");

  const providerUsePrefix = parser.tryHandle("/provider use anth");
  assertEqual((providerUsePrefix.action as { provider?: string } | undefined)?.provider, "anthropic", "/provider use prefix resolves configured provider");

  const model = parser.tryHandle("/model");
  assert(model.output.includes("Model Status:"), "/model prints model status header");
  assert(model.output.includes("Selected provider: local"), "/model includes selected provider");
  assert(model.output.includes("Selected model: llama3.2"), "/model includes selected model");
  assert(model.output.includes("Set current provider model: /model <model>"), "/model includes current-provider set hint");

  const modelSelected = parser.tryHandle("/model anthropic claude-opus-4-6");
  assertEqual((modelSelected.action as { kind?: string } | undefined)?.kind, "set_provider", "/model provider+model emits set-provider action");
  assertEqual((modelSelected.action as { provider?: string } | undefined)?.provider, "anthropic", "/model provider+model keeps selected provider");
  assertEqual((modelSelected.action as { model?: string } | undefined)?.model, "claude-opus-4-6", "/model provider+model keeps selected model");
  assert(modelSelected.output.includes("Model selection updated:"), "/model provider+model reports selection update");
  assert(modelSelected.output.includes("Next run: anthropic:claude-opus-4-6 primary"), "/model provider+model reports next-run primary");

  const cost = parser.tryHandle("/cost");
  assert(cost.output.includes("Cost Breakdown:"), "/cost prints breakdown header");
  assert(cost.output.includes("Per-Model Usage:"), "/cost includes per-model section");
  assert(cost.output.includes("`gpt-4o`: 1 calls"), "/cost includes first model call count");
  assert(cost.output.includes("`claude-sonnet-4-5`: 1 calls"), "/cost includes second model call count");
  assert(cost.output.includes("Cost Budget:"), "/cost includes budget section");
  assert(cost.output.includes("Cap: $5.00"), "/cost includes budget cap");
  assert(cost.output.includes("Remaining: $"), "/cost includes budget remaining amount");
  assert(cost.output.includes("Spend: "), "/cost includes budget spend percent");
  assert(cost.output.includes("Views: /cost | /cost models | /cost budget | /cost perf"), "/cost teaches drill-down views");
  assert(cost.output.includes("Inspect: /cost | /cost models | /cost budget | /cost perf"), "/cost summary includes inspect hint");

  const costModels = parser.tryHandle("/cost models");
  assert(costModels.output.includes("Cost Models:"), "/cost models prints models header");
  assert(costModels.output.includes("`gpt-4o`"), "/cost models includes first model");
  assert(costModels.output.includes("`claude-sonnet-4-5`"), "/cost models includes second model");
  assert(costModels.output.includes("Views: /cost | /cost models | /cost budget | /cost perf"), "/cost models keeps drill-down views");

  const costBudget = parser.tryHandle("/cost budget");
  assert(costBudget.output.includes("Cost Budget:"), "/cost budget prints budget header");
  assert(costBudget.output.includes("Cap: $5.00"), "/cost budget includes cap");
  assert(costBudget.output.includes("Views: /cost | /cost models | /cost budget | /cost perf"), "/cost budget keeps drill-down views");

  const costPerf = parser.tryHandle("/cost perf");
  assert(costPerf.output.includes("Cost Performance:"), "/cost perf prints performance header");
  assert(costPerf.output.includes("Total API time: 3.4s"), "/cost perf includes total API time");
  assert(costPerf.output.includes("Total calls: 2"), "/cost perf includes total call count");
  assert(costPerf.output.includes("Average API time: 1.70s/call"), "/cost perf includes average API time");
  assert(costPerf.output.includes("Slowest average: `claude-sonnet-4-5` | 1 calls | 2.30s/call"), "/cost perf includes slowest average model");
  assert(costPerf.output.includes("Highest total: `claude-sonnet-4-5` | 2.3s over 1 calls"), "/cost perf includes highest total model");
  assert(costPerf.output.includes("`claude-sonnet-4-5`: 2.3s total | 1 calls | 2.30s/call"), "/cost perf includes per-model latency rows");
  assert(costPerf.output.includes("Views: /cost | /cost models | /cost budget | /cost perf"), "/cost perf keeps drill-down views");

  const costUnknown = parser.tryHandle("/cost cave");
  assert(costUnknown.isError === true, "/cost unknown view errors");
  assert(costUnknown.output.includes("Unknown cost view 'cave'."), "/cost unknown view names bad view");
  assert(costUnknown.output.includes("Views: /cost | /cost models | /cost budget | /cost perf"), "/cost unknown view teaches drill-down views");

  const budget = parser.tryHandle("/budget");
  assertEqual(budget.command, "budget", "Parser executes /budget");
  assert(budget.output.includes("Budget:"), "/budget prints budget header");
  assert(budget.output.includes("Cost cap: $5.00"), "/budget includes current USD cap");
  assert(budget.output.includes("Token cap: 128,000 tokens"), "/budget includes current token cap");
  assert(budget.output.includes("Inspect: /status | /cost"), "/budget includes inspect hints");
  assert(budget.output.includes("Set: /budget <positive USD cap>"), "/budget includes set hint");

  const hooks = parser.tryHandle("/hooks");
  assert(hooks.output.includes("Registered Hooks:"), "/hooks prints hooks header");
  assert(hooks.output.includes("Attached per-run hooks: 1"), "/hooks includes attached per-run hook count");
  assert(hooks.output.includes("Supported kinds: PreCompact, PostCompact, PreToolUse, PostToolUse"), "/hooks includes supported hook kinds");
  assert(hooks.output.includes("Recent events: 2"), "/hooks includes recent hook event count");
  assert(hooks.output.includes("Latest event: PostCompact | standard | 42ms"), "/hooks includes latest hook event summary");
  assert(hooks.output.includes("Views: /hooks | /hooks recent | /hooks perf | /hooks kinds"), "/hooks teaches drill-down views");

  const hooksRecent = parser.tryHandle("/hooks recent");
  assert(hooksRecent.output.includes("Recent Hook Events:"), "/hooks recent prints events header");
  assert(hooksRecent.output.includes("- PostCompact | standard | 42ms | 2026-04-16T09:02:00.000Z"), "/hooks recent includes newest event");
  assert(hooksRecent.output.includes("- PostToolUse | file_read | 12ms | 2026-04-16T09:01:00.000Z"), "/hooks recent includes older event");
  assert(hooksRecent.output.includes("Views: /hooks | /hooks recent | /hooks perf | /hooks kinds"), "/hooks recent keeps drill-down views");

  const hooksPerf = parser.tryHandle("/hooks perf");
  assert(hooksPerf.output.includes("Hook Performance:"), "/hooks perf prints performance header");
  assert(hooksPerf.output.includes("Timed events: 2"), "/hooks perf includes timed event count");
  assert(hooksPerf.output.includes("Average duration: 27ms"), "/hooks perf includes average duration");
  assert(hooksPerf.output.includes("Slowest: PostCompact | standard | 42ms"), "/hooks perf includes slowest event summary");
  assert(hooksPerf.output.includes("Views: /hooks | /hooks recent | /hooks perf | /hooks kinds"), "/hooks perf keeps drill-down views");

  const hooksKinds = parser.tryHandle("/hooks kinds");
  assert(hooksKinds.output.includes("Supported Hook Kinds:"), "/hooks kinds prints kinds header");
  assert(hooksKinds.output.includes("- PreCompact"), "/hooks kinds includes pre-compact");
  assert(hooksKinds.output.includes("- PostToolUse"), "/hooks kinds includes post-tool");
  assert(hooksKinds.output.includes("Views: /hooks | /hooks recent | /hooks perf | /hooks kinds"), "/hooks kinds keeps drill-down views");

  const hooksUnknown = parser.tryHandle("/hooks cave");
  assert(hooksUnknown.isError === true, "/hooks unknown view errors");
  assert(hooksUnknown.output.includes("Unknown hooks view 'cave'."), "/hooks unknown view names bad view");
  assert(hooksUnknown.output.includes("Views: /hooks | /hooks recent | /hooks perf | /hooks kinds"), "/hooks unknown view teaches drill-down views");

  const doctor = parser.tryHandle("/doctor");
  assert(doctor.output.includes("Startup Diagnostics:"), "/doctor prints diagnostics header");
  assert(doctor.output.includes("fix: Start Ollama."), "/doctor includes suggested fix");
  assert(doctor.output.includes("Views: /doctor | /doctor errors | /doctor warnings | /doctor workspace | /doctor config | /doctor data | /doctor terminal | /doctor local | /doctor cloud | /doctor providers | /doctor failovers | /doctor first-run"), "/doctor includes view shortcuts");
  assert(doctor.output.includes("Inspect: /provider | /provider current | /provider failovers"), "/doctor includes provider inspect hint for provider-side failures");
  assert(doctor.output.includes("Provider diagnostics:"), "/doctor includes provider diagnostics section");
  assert(doctor.output.includes("Focus: local"), "/doctor defaults provider focus to current provider");
  assert(doctor.output.includes("Observed health: anthropic: closed (0); local [current]: open (3)"), "/doctor includes provider health summary");
  assert(doctor.output.includes("Latest failover: "), "/doctor includes latest failover detail");
  assert(doctor.output.includes("local:llama3.2 -> anthropic:claude-sonnet-4-5 (LLMConnectionError) | connect refused"), "/doctor includes latest failover event detail");
  assert(doctor.output.includes("Recovery: Circuit open. Check /provider failovers and /doctor before retrying."), "/doctor includes provider recovery hint");

  const doctorWarnings = parser.tryHandle("/doctor warnings");
  assert(doctorWarnings.output.includes("Mode: warnings"), "/doctor warnings prints mode");
  assert(doctorWarnings.output.includes("Ollama server"), "/doctor warnings includes warning check");
  assert(!doctorWarnings.output.includes("Data directory"), "/doctor warnings excludes passed info check");
  assert(doctorWarnings.output.includes("Inspect: /provider | /provider current | /provider failovers"), "/doctor warnings keeps provider inspect hint");

  const doctorErrors = parser.tryHandle("/doctor errors");
  assert(doctorErrors.output.includes("Config: llm config path"), "/doctor errors includes error check");
  assert(!doctorErrors.output.includes("Ollama server"), "/doctor errors excludes warning check");

  const doctorConfig = parser.tryHandle("/doctor config");
  assert(doctorConfig.output.includes("Mode: config"), "/doctor config prints mode");
  assert(doctorConfig.output.includes("Config: llm config path"), "/doctor config includes config-related check");
  assert(!doctorConfig.output.includes("Ollama server"), "/doctor config excludes non-config warning check");

  const doctorDataParser = new SlashCommandParser({
    startupReport: {
      passed: false,
      errorCount: 1,
      warningCount: 1,
      checks: [
        {
          name: "Data directory",
          passed: false,
          severity: "error",
          message: "D:/The Colony Test/.colony missing",
          fix: "Ensure D:/The Colony Test/.colony exists and is writable.",
        },
        {
          name: "Permissions: tool-results",
          passed: false,
          severity: "warning",
          message: "D:/The Colony Test/.colony/tool-results not writable",
          fix: "Ensure D:/The Colony Test/.colony/tool-results exists and is writable.",
        },
        {
          name: "Config: llm config path",
          passed: false,
          severity: "error",
          message: "Configured LLM config path not found: /tmp/missing.json",
          fix: "Fix COLONY_LLM_CONFIG or remove stale path setting.",
        },
      ],
    },
  });
  const doctorData = doctorDataParser.tryHandle("/doctor data");
  assert(doctorData.output.includes("Mode: data"), "/doctor data prints mode");
  assert(doctorData.output.includes("Data directory"), "/doctor data includes data-directory check");
  assert(doctorData.output.includes("Permissions: tool-results"), "/doctor data includes data-subdirectory permissions check");
  assert(!doctorData.output.includes("Config: llm config path"), "/doctor data excludes config-only check");

  const doctorFirstRun = parser.tryHandle("/doctor first-run");
  assert(doctorFirstRun.output.includes("Mode: first-run"), "/doctor first-run prints mode");
  assert(doctorFirstRun.output.includes("First-Run Checklist:"), "/doctor first-run prints checklist header");
  assert(doctorFirstRun.output.includes("Workspace:"), "/doctor first-run includes workspace checklist line");
  assert(doctorFirstRun.output.includes("Terminal:"), "/doctor first-run includes terminal checklist line");
  assert(doctorFirstRun.output.includes("Config:"), "/doctor first-run includes config checklist line");
  assert(doctorFirstRun.output.includes("Colony data:"), "/doctor first-run includes data-path checklist line");
  assert(doctorFirstRun.output.includes("Provider config:"), "/doctor first-run includes provider-config checklist line");
  assert(doctorFirstRun.output.includes("Local runtime:"), "/doctor first-run includes local-runtime checklist line");
  assert(doctorFirstRun.output.includes("Project commands:"), "/doctor first-run includes project-command checklist line");
  assert(doctorFirstRun.output.includes("Inspect: /doctor terminal | /doctor workspace | /doctor config | /doctor data | /doctor local | /doctor cloud | /doctor providers | /workspace | /provider"), "/doctor first-run includes focused inspect path");

  const doctorWorkspaceParser = new SlashCommandParser({
    startupReport: {
      passed: false,
      errorCount: 1,
      warningCount: 2,
      checks: [
        {
          name: "Workspace dev command",
          passed: false,
          severity: "warning",
          message: "No workspace dev/start command detected",
          fix: "Add a dev script.",
        },
        {
          name: "Workspace verify command",
          passed: false,
          severity: "warning",
          message: "No verify/test command detected",
          fix: "Add a verify script.",
        },
        {
          name: "Config: llm config path",
          passed: false,
          severity: "error",
          message: "Configured LLM config path not found: /tmp/missing.json",
          fix: "Fix COLONY_LLM_CONFIG or remove stale path setting.",
        },
      ],
    },
  });
  const doctorWorkspace = doctorWorkspaceParser.tryHandle("/doctor workspace");
  assert(doctorWorkspace.output.includes("Mode: workspace"), "/doctor workspace prints mode");
  assert(doctorWorkspace.output.includes("Workspace dev command"), "/doctor workspace includes workspace-related check");
  assert(doctorWorkspace.output.includes("Workspace verify command"), "/doctor workspace includes workspace verify check");
  assert(!doctorWorkspace.output.includes("Config: llm config path"), "/doctor workspace excludes config-only check");

  const doctorTerminalParser = new SlashCommandParser({
    startupReport: {
      passed: false,
      errorCount: 0,
      warningCount: 1,
      checks: [
        {
          name: "Terminal raw mode",
          passed: false,
          severity: "warning",
          message: "Raw keyboard input unavailable. Slash commands still work, but Ctrl/Page hotkeys may be unavailable.",
          fix: "Use an interactive terminal that supports raw keyboard input if you need Colony hotkeys and transcript paging shortcuts.",
        },
        {
          name: "Terminal viewport",
          passed: false,
          severity: "warning",
          message: "Viewport width 72 columns. Side panels and drill-down hints may wrap or truncate.",
          fix: "Widen the terminal to about 100+ columns if you want the budget, status, and doctor panels to stay legible side-by-side.",
        },
        {
          name: "Workspace dev command",
          passed: false,
          severity: "warning",
          message: "No workspace dev/start command detected",
          fix: "Add a dev script.",
        },
      ],
    },
  });
  const doctorTerminal = doctorTerminalParser.tryHandle("/doctor terminal");
  assert(doctorTerminal.output.includes("Mode: terminal"), "/doctor terminal prints mode");
  assert(doctorTerminal.output.includes("Terminal raw mode"), "/doctor terminal includes terminal-related check");
  assert(doctorTerminal.output.includes("Terminal viewport"), "/doctor terminal includes terminal viewport check");
  assert(!doctorTerminal.output.includes("Workspace dev command"), "/doctor terminal excludes non-terminal checks");

  const doctorLocalParser = new SlashCommandParser({
    startupReport: {
      passed: false,
      errorCount: 1,
      warningCount: 1,
      checks: [
        {
          name: "Ollama server",
          passed: false,
          severity: "error",
          message: "Cannot connect to http://localhost:11434: connect ECONNREFUSED",
          fix: "Start Ollama or update COLONY_OLLAMA_BASE_URL.",
        },
        {
          name: "WSL local-provider boundary",
          passed: false,
          severity: "warning",
          message: "WSL guest cannot reach Windows localhost Ollama directly.",
          fix: "Use host.docker.internal or the Windows host IP from WSL.",
        },
        {
          name: "Anthropic credentials",
          passed: false,
          severity: "warning",
          message: "Missing ANTHROPIC_API_KEY",
          fix: "Set ANTHROPIC_API_KEY.",
        },
      ],
    },
  });
  const doctorLocal = doctorLocalParser.tryHandle("/doctor local");
  assert(doctorLocal.output.includes("Mode: local"), "/doctor local prints mode");
  assert(doctorLocal.output.includes("Ollama server"), "/doctor local includes local-runtime check");
  assert(doctorLocal.output.includes("WSL local-provider boundary"), "/doctor local includes local boundary check");
  assert(!doctorLocal.output.includes("Anthropic credentials"), "/doctor local excludes cloud-only checks");

  const doctorCloudParser = new SlashCommandParser({
    startupReport: {
      passed: false,
      errorCount: 1,
      warningCount: 1,
      checks: [
        {
          name: "Anthropic credentials",
          passed: false,
          severity: "error",
          message: "Missing ANTHROPIC_API_KEY",
          fix: "Set ANTHROPIC_API_KEY.",
        },
        {
          name: "Cloud fallback",
          passed: false,
          severity: "warning",
          message: "Configured but not ready: anthropic, gemini",
          fix: "Set ANTHROPIC_API_KEY or GEMINI_API_KEY for fallback.",
        },
        {
          name: "Ollama server",
          passed: false,
          severity: "warning",
          message: "Cannot connect",
          fix: "Start Ollama.",
        },
      ],
    },
  });
  const doctorCloud = doctorCloudParser.tryHandle("/doctor cloud");
  assert(doctorCloud.output.includes("Mode: cloud"), "/doctor cloud prints mode");
  assert(doctorCloud.output.includes("Anthropic credentials"), "/doctor cloud includes cloud credential check");
  assert(doctorCloud.output.includes("Cloud fallback"), "/doctor cloud includes cloud fallback check");
  assert(!doctorCloud.output.includes("Ollama server"), "/doctor cloud excludes local-runtime checks");

  const doctorSearch = parser.tryHandle("/doctor anthropic");
  assert(doctorSearch.output.includes("Search: anthropic"), "/doctor search prints query");
  assert(doctorSearch.output.includes("Anthropic credentials"), "/doctor search includes matching provider check");
  assert(doctorSearch.output.includes("Focus: anthropic"), "/doctor search retargets provider diagnostics focus from query");

  const doctorProviders = parser.tryHandle("/doctor providers");
  assert(doctorProviders.output.includes("Mode: providers"), "/doctor providers prints mode");
  assert(doctorProviders.output.includes("Provider view: startup checks hidden; use provider diagnostics below."), "/doctor providers hides startup check list");
  assert(doctorProviders.output.includes("Observed health: anthropic: closed (0); local [current]: open (3)"), "/doctor providers keeps provider health summary");

  const doctorFailovers = new SlashCommandParser({
    session: {
      sessionId: "ses_doc_fail",
      agentId: "agent-1",
      caste: "assist_ant",
      history: [
        { type: "system", content: "sys", timestamp: "2026-04-16T08:55:00.000Z" },
        { type: "user", content: "hello", timestamp: "2026-04-16T08:56:00.000Z" },
      ],
    },
    runtime: {
      provider: "local",
      model: "llama3.2",
      selectedProvider: "local",
      selectedModel: "llama3.2",
      providerDefaults: { local: "llama3.2", anthropic: "claude-sonnet-4-5" },
      circuitState: "closed",
      activeRun: false,
      isThinking: false,
      availableProviders: ["anthropic", "local"],
      failover: { local: ["anthropic"] },
      providerHealth: {
        local: { state: "open", failureCount: 4 },
        anthropic: { state: "closed", failureCount: 1 },
      },
      recentFailovers: [
        {
          fromProvider: "local",
          fromModel: "llama3.2",
          toProvider: "anthropic",
          toModel: "claude-sonnet-4-5",
          errorType: "LLMConnectionError",
          errorMessage: "connect refused",
          timestamp: 1,
        },
        {
          fromProvider: "local",
          fromModel: "llama3.2",
          toProvider: "anthropic",
          toModel: "claude-sonnet-4-5",
          errorType: "LLMTimeoutError",
          errorMessage: "request timed out",
          timestamp: 2,
        },
        {
          fromProvider: "anthropic",
          fromModel: "claude-sonnet-4-5",
          toProvider: "local",
          toModel: "llama3.2",
          errorType: "RateLimitError",
          errorMessage: "quota exceeded",
          timestamp: 3,
        },
      ],
    },
    startupReport: {
      passed: false,
      errorCount: 1,
      warningCount: 1,
      checks: [
        {
          name: "ollama-server",
          passed: false,
          severity: "warning",
          message: "Ollama server did not respond",
          fix: "Start Ollama.",
        },
      ],
    },
  });
  const doctorFailoverView = doctorFailovers.tryHandle("/doctor failovers");
  assert(doctorFailoverView.output.includes("Mode: failovers"), "/doctor failovers prints mode");
  assert(doctorFailoverView.output.includes("Failover view: startup checks hidden; use failover history below."), "/doctor failovers hides startup checks");
  assert(doctorFailoverView.output.includes("Failover: 1970-01-01T00:00:00.001Z | local:llama3.2 -> anthropic:claude-sonnet-4-5"), "/doctor failovers expands recent failover history");
  assert(doctorFailoverView.output.includes("Failover: 1970-01-01T00:00:00.003Z | anthropic:claude-sonnet-4-5 -> local:llama3.2"), "/doctor failovers includes newest failover entry");

  const resumeUsage = parser.tryHandle("/resume");
  assert(resumeUsage.isError, "/resume without id errors");
  assert(resumeUsage.output.includes("pending"), "/resume usage mentions pending shortcut");

  const resumeAmbiguous = parser.tryHandle("/resume ses_saved");
  assert(resumeAmbiguous.isError, "/resume ambiguous prefix errors");
  assert(resumeAmbiguous.output.includes("ambiguous"), "/resume ambiguous prefix explains why");

  const resumePending = parser.tryHandle("/resume pending");
  assertEqual(String(resumePending.data.sessionId ?? ""), "ses_saved_2", "/resume pending resolves newest interrupted session");
  assert(resumePending.output.includes("State: awaiting reply | checkpoint"), "/resume includes interruption and checkpoint state");
  assert(resumePending.output.includes("Identity: assist-ant | assist_ant"), "/resume includes saved session identity");
  assert(resumePending.output.includes("Saved: 2026-04-16T10:00:00.000Z"), "/resume includes saved timestamp");
  assert(resumePending.output.includes("Last message: 2026-04-16T10:00:00.000Z"), "/resume includes last-message timestamp");
  assert(resumePending.output.includes("LLM: anthropic:claude-sonnet-4-5"), "/resume includes saved session llm");
  assert(resumePending.output.includes("Preview: last user: Need answer when run comes back."), "/resume includes preview text");
  assert(resumePending.output.includes("Usage: 4 msg | 500 tokens | $0.0100"), "/resume includes usage snapshot");
  assert(resumePending.output.includes("Inspect first: /history pending 8 | /history latest 8 | /history ses_saved_2 8"), "/resume pending keeps all valid pre-hydrate history aliases when target is also latest");

  const resumeLatest = parser.tryHandle("/resume latest");
  assertEqual(String(resumeLatest.data.sessionId ?? ""), "ses_saved_2", "/resume latest resolves newest persisted session");
  assert(resumeLatest.output.includes("Resolved from 'latest'."), "/resume latest reports latest alias resolution");
  assert(resumeLatest.output.includes("Inspect first: /history latest 8 | /history pending 8 | /history ses_saved_2 8"), "/resume latest keeps all valid pre-hydrate history aliases when target is also pending");

  const resumeCurrentParser = new SlashCommandParser({
    session: {
      sessionId: "ses_current_live",
      agentId: "assist-ant",
      caste: "assist_ant",
      history: [
        { type: "user", content: "still active", timestamp: "2026-04-17T12:05:00.000Z" },
      ],
    },
    sessions: [
      {
        sessionId: "ses_current_live",
        agentId: "assist-ant",
        caste: "assist_ant",
        savedAt: "2026-04-17T12:00:00.000Z",
        lastMessageAt: "2026-04-17T12:05:00.000Z",
        messageCount: 3,
        tokensUsed: 300,
        costUsd: 0.01,
        interruption: "interrupted_prompt",
        hasCheckpoint: true,
        previewText: "Still active in current loop.",
        previewRole: "user",
      },
    ],
  });
  const resumeCurrentLatest = resumeCurrentParser.tryHandle("/resume latest");
  assert(resumeCurrentLatest.output.includes("is already current"), "/resume latest blocks current session target");
  assert(resumeCurrentLatest.output.includes("Inspect live state: /status, /history current 8, /history pending 8, /history latest 8, or /history ses_current_live 8"), "/resume latest redirects to full current inspect path");
  assert((resumeCurrentLatest.action as { kind?: string } | undefined)?.kind !== "resume_session", "/resume latest current target emits no resume action");

  const resumeCurrentPending = resumeCurrentParser.tryHandle("/resume pending");
  assert(resumeCurrentPending.output.includes("is already current"), "/resume pending blocks current session target");
  assert(resumeCurrentPending.output.includes("Inspect live state: /status, /history current 8, /history pending 8, /history latest 8, or /history ses_current_live 8"), "/resume pending redirects to full current inspect path");
  assert(resumeCurrentPending.output.includes("Control current run: /cancel | /clear"), "/resume pending redirects to live controls");
  assert((resumeCurrentPending.action as { kind?: string } | undefined)?.kind !== "resume_session", "/resume pending current target emits no resume action");

  const resumeCurrentExact = resumeCurrentParser.tryHandle("/resume ses_current_live");
  assert(resumeCurrentExact.output.includes("is already current"), "/resume exact current target blocks self-resume");
  assert(resumeCurrentExact.output.includes("Inspect live state: /status, /history current 8, /history pending 8, /history latest 8, or /history ses_current_live 8"), "/resume exact current target includes full current inspect path");
  assert((resumeCurrentExact.action as { kind?: string } | undefined)?.kind !== "resume_session", "/resume exact current target emits no resume action");

  const actions: string[] = [];
  await executeCommand(parser.tryHandle("/exit"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    cancelRun: () => { actions.push("cancel"); },
    isRunActive: () => true,
  });
  assert(actions.includes("cancel"), "Executor cancels active run before exit");
  assert(actions.includes("exit"), "Executor exits app");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/exit"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { throw new Error("Desktop shell refused exit."); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    isRunActive: () => false,
  });
  assert(actions.some((entry) => entry.includes("Colony shutting down. Ad Formicae Gloriam.")), "Executor keeps exit preflight visible before exit failure");
  assert(actions.some((entry) => entry.startsWith("error:Failed to exit Colony: Desktop shell refused exit.")), "Executor reports exit failure");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/exit"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { throw new Error("Desktop shell refused exit."); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    isRunActive: () => true,
  });
  assert(actions.some((entry) => entry.includes("Active run will be terminated immediately.")), "Executor tells truth when active exit lacks graceful cancel support");
  assert(actions.some((entry) => entry.startsWith("error:Failed to exit Colony: Desktop shell refused exit.")), "Executor reports forced-exit failure when graceful cancel support is missing");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/exit"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    cancelRun: () => { throw new Error("Cancel hook crashed."); },
    isRunActive: () => true,
  });
  assert(actions.some((entry) => entry.startsWith("error:Graceful shutdown failed while stopping the active run: Cancel hook crashed. Exiting anyway.")), "Executor reports forced exit after cancel failure");
  assert(actions.includes("exit"), "Executor still exits after cancel failure during shutdown");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/provider use anthropic"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    setProviderSelection: async (provider: string) => { actions.push(`provider:${provider}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    isRunActive: () => true,
  });
  assert(actions.includes("provider:anthropic"), "Executor routes provider selection to runtime handler");
  assert(actions.some((entry) => entry.includes("Provider selection updated:")), "Executor keeps provider-selection preflight visible");
  assert(actions.some((entry) => entry.includes("Active run keeps current provider chain; new selection applies next run.")), "Executor tells truth when provider selection changes mid-run");

  actions.length = 0;
  await executeCommand(artifact, {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showArtifact: async (filepath: string) => ({
      handled: true,
      command: "artifact",
      output: `Saved artifact:\nPath: ${filepath}\nartifact line 1\nartifact line 2`,
      data: { filepath },
      isError: false,
      action: { kind: "display" },
    }),
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    isRunActive: () => false,
  });
  assert(actions.some((entry) => entry.includes("Opening saved artifact...")), "Executor shows artifact preflight before reading saved output");
  assert(actions.some((entry) => entry.includes("Saved artifact:")), "Executor renders bounded saved artifact view");
  assert(actions.some((entry) => entry.includes("artifact line 1")), "Executor includes saved artifact excerpt");

  actions.length = 0;
  await executeCommand(artifactCatalog, {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showArtifactCatalog: async () => ({
      handled: true,
      command: "artifact",
      output: `Saved artifacts:\nSession: ses_abc123\n1. recent-output.txt | 18 chars | 2026-04-16T10:00:00.000Z\n   Reopen: /artifact "${newerArtifactPath}"\nOpen newest: /artifact latest`,
      data: { sessionId: "ses_abc123" },
      isError: false,
      action: { kind: "display" },
    }),
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    isRunActive: () => false,
  });
  assert(actions.some((entry) => entry.includes("Loading saved artifacts for current session...")), "Executor shows artifact catalog preflight before listing saved outputs");
  assert(actions.some((entry) => entry.includes("Saved artifacts:")), "Executor renders artifact catalog view");
  assert(actions.some((entry) => entry.includes(`Reopen: /artifact "${newerArtifactPath}"`)), "Executor artifact catalog includes exact reopen command");
  assert(actions.some((entry) => entry.includes("Open newest: /artifact latest")), "Executor artifact catalog includes latest shortcut");

  actions.length = 0;
  await executeCommand(latestArtifact, {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showArtifactCatalog: async (_sessionId: string, latest?: boolean) => ({
      handled: true,
      command: "artifact",
      output: latest
        ? `Saved artifact:\nPath: ${newerArtifactPath}\nnewer artifact line`
        : "unexpected",
      data: { filepath: newerArtifactPath },
      isError: false,
      action: { kind: "display" },
    }),
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    isRunActive: () => false,
  });
  assert(actions.some((entry) => entry.includes("Opening latest saved artifact for current session...")), "Executor shows latest-artifact preflight before loading newest saved output");
  assert(actions.some((entry) => entry.includes(`Path: ${newerArtifactPath}`)), "Executor latest artifact opens newest saved output");
  assert(actions.some((entry) => entry.includes("newer artifact line")), "Executor latest artifact includes newest artifact excerpt");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/resume latest"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    resumeSession: async (sessionId: string) => { actions.push(`resume:${sessionId}`); },
    isRunActive: () => false,
  });
  assert(actions.some((entry) => entry.includes("Resuming session ses_saved_2...")), "Executor shows latest resume preflight before hydration");
  assert(
    actions.findIndex((entry) => entry.includes("Resuming session ses_saved_2...")) <
      actions.findIndex((entry) => entry === "resume:ses_saved_2"),
    "Executor latest resume preflight lands before hydrate action",
  );
  assert(actions.includes("resume:ses_saved_2"), "Executor resolves latest session");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/resume pending"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    resumeSession: async (sessionId: string) => { actions.push(`resume:${sessionId}`); },
    isRunActive: () => false,
  });
  assert(actions.some((entry) => entry.includes("Resuming session ses_saved_2...")), "Executor shows pending resume preflight before hydration");
  assert(
    actions.findIndex((entry) => entry.includes("Resuming session ses_saved_2...")) <
      actions.findIndex((entry) => entry === "resume:ses_saved_2"),
    "Executor pending resume preflight lands before hydrate action",
  );
  assert(actions.includes("resume:ses_saved_2"), "Executor resolves pending session shortcut");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/resume 2"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    resumeSession: async (sessionId: string) => { actions.push(`resume:${sessionId}`); },
    isRunActive: () => false,
  });
  assert(actions.includes("resume:ses_saved_1"), "Executor resolves numeric session index");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/resume resume_f"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    resumeSession: async (sessionId: string) => { actions.push(`resume:${sessionId}`); },
    isRunActive: () => false,
  });
  assert(actions.includes("resume:resume_focus_9"), "Executor resolves unique session prefix");

  actions.length = 0;
  await executeCommand(activeCompact, {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard", options) => {
      actions.push(`compact:${strategy}:${String(options?.announceQueuedStatus ?? true)}`);
    },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    isRunActive: () => false,
  });
  assert(actions.some((entry) => entry.includes("Context standard compaction requested for 6 messages.")), "Executor shows compact preflight text from gateway");
  assert(
    actions.findIndex((entry) => entry.includes("Context standard compaction requested for 6 messages.")) <
      actions.findIndex((entry) => entry === "compact:standard:false"),
    "Executor compact preflight lands before compaction handler call",
  );
  assert(actions.includes("compact:standard:false"), "Executor suppresses duplicate queued compact status in loop handler");

  actions.length = 0;
  await executeCommand(idleMicroCompact, {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard", options) => {
      actions.push(`compact:${strategy}:${String(options?.announceQueuedStatus ?? true)}`);
    },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    isRunActive: () => false,
  });
  assert(actions.some((entry) => entry.includes("Running micro compaction for 6 messages...")), "Executor shows micro compaction preflight text from gateway");
  assert(actions.includes("compact:micro:false"), "Executor passes micro compaction strategy into loop handler");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/swarm repair index"), {
    submitChat: async () => { throw new Error("Loop bridge unavailable."); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    isRunActive: () => false,
  });
  assert(actions.some((entry) => entry.includes("/swarm currently routes to the active agent only.")), "Executor keeps swarm alias warning when submit fails");
  assert(actions.some((entry) => entry.startsWith("error:Failed to submit request: Loop bridge unavailable.")), "Executor reports submit failure");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/budget 3"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: () => { throw new Error("Budget store unavailable."); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    isRunActive: () => false,
  });
  assert(actions.some((entry) => entry.startsWith("error:Failed to update budget cap to $3.00: Budget store unavailable.")), "Executor reports budget update failure");
  assert(!actions.some((entry) => entry.includes("Budget cap set to $3.00")), "Executor omits fake budget success when update fails");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/clear"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { throw new Error("Session reset unavailable."); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    isRunActive: () => false,
  });
  assert(actions.some((entry) => entry.startsWith("error:Failed to clear session: Session reset unavailable.")), "Executor reports clear failure");
  assert(!actions.some((entry) => entry.includes("Session history cleared. System prompt preserved.")), "Executor omits fake clear success when reset fails");

  actions.length = 0;
  await executeCommand(idleCompact, {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async () => { throw new Error("Compaction engine offline."); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    isRunActive: () => false,
  });
  assert(actions.some((entry) => entry.includes("Running standard compaction for 6 messages...")), "Executor keeps compact preflight visible when compaction fails");
  assert(actions.some((entry) => entry.startsWith("error:Failed to process standard compaction request: Compaction engine offline.")), "Executor reports compaction failure");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/cancel"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    isRunActive: () => true,
  });
  assert(actions.some((entry) => entry.includes("Run cancellation is not available in this runtime.")), "Executor reports missing cancel handler");
  assert(!actions.some((entry) => entry.includes("Canceling active Colony run...")), "Executor omits fake cancel success when no handler exists");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/cancel"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    cancelRun: () => { throw new Error("Abort controller missing."); },
    isRunActive: () => true,
  });
  assert(actions.some((entry) => entry.startsWith("error:Failed to cancel active run: Abort controller missing.")), "Executor reports thrown cancel failure");
  assert(!actions.some((entry) => entry.includes("Canceling active Colony run...")), "Executor omits fake cancel success when cancel handler throws");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/resume latest"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    isRunActive: () => false,
  });
  assert(actions.some((entry) => entry.includes("Session resume is not available in this runtime.")), "Executor reports missing resume handler");
  assert(!actions.some((entry) => entry.includes("Resuming session ses_saved_2...")), "Executor omits resume preflight when no resume handler exists");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/history pending 2"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    loadSessionHistory: async () => ({
      sessionId: "ses_saved_2",
      agentId: "assist-ant",
      caste: "assist_ant",
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      savedAt: "2026-04-16T10:00:00.000Z",
      lastMessageAt: "2026-04-16T10:00:00.000Z",
      totalMessages: 4,
      interruption: "interrupted_prompt",
      hasCheckpoint: true,
      entries: [
        { sequence: 3, role: "assistant", timestamp: "2026-04-16T09:59:00.000Z", previewText: "Need answer soon." },
        { sequence: 4, role: "user", timestamp: "2026-04-16T10:00:00.000Z", previewText: "Need answer when run comes back." },
      ],
    }),
    isRunActive: () => false,
  });
  assert(actions.some((entry) => entry.includes("Loading history for ses_saved_2...")), "Executor shows pending history load progress before persisted transcript");
  assert(actions.some((entry) => entry.includes("Source: persisted session")), "Executor loads pending history shortcut");
  assert(actions.some((entry) => entry.includes("Saved: 2026-04-16T10:00:00.000Z")), "Executor persisted history includes saved timestamp");
  assert(actions.some((entry) => entry.includes("Last message: 2026-04-16T10:00:00.000Z")), "Executor persisted history includes last-message timestamp");
  assert(actions.some((entry) => entry.includes("LLM: anthropic:claude-sonnet-4-5")), "Executor persisted history includes llm identity");
  assert(actions.some((entry) => entry.includes("Resume: /resume pending | /resume latest | /resume ses_saved_2")), "Executor persisted history includes pending and latest resume hints when both aliases are valid");
  assert(actions.some((entry) => entry.includes("Inspect: /sessions | /history pending 8 | /history latest 8 | /history ses_saved_2 8")), "Executor persisted history includes pending and latest inspect hints when both aliases are valid");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/history latest 2"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    loadSessionHistory: async () => ({
      sessionId: "ses_saved_2",
      agentId: "assist-ant",
      caste: "assist_ant",
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      savedAt: "2026-04-16T10:00:00.000Z",
      lastMessageAt: "2026-04-16T10:00:00.000Z",
      totalMessages: 4,
      interruption: "interrupted_prompt",
      hasCheckpoint: true,
      entries: [
        { sequence: 3, role: "assistant", timestamp: "2026-04-16T09:59:00.000Z", previewText: "Need answer soon." },
        { sequence: 4, role: "user", timestamp: "2026-04-16T10:00:00.000Z", previewText: "Need answer when run comes back." },
      ],
    }),
    isRunActive: () => false,
  });
  assert(actions.some((entry) => entry.includes("Loading history for ses_saved_2...")), "Executor shows latest history load progress before persisted transcript");
  assert(actions.some((entry) => entry.includes("Source: persisted session")), "Executor renders persisted history");
  assert(actions.some((entry) => entry.includes("Saved: 2026-04-16T10:00:00.000Z")), "Executor latest history keeps saved timestamp");
  assert(actions.some((entry) => entry.includes("LLM: anthropic:claude-sonnet-4-5")), "Executor latest history keeps llm identity");
  assert(actions.some((entry) => entry.includes("Resume: /resume pending | /resume latest | /resume ses_saved_2")), "Executor latest history keeps both valid resume aliases");
  assert(actions.some((entry) => entry.includes("Inspect: /sessions | /history pending 8 | /history latest 8 | /history ses_saved_2 8")), "Executor latest history keeps both valid inspect aliases");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/history latest user 4"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    loadSessionHistory: async () => ({
      sessionId: "ses_saved_2",
      agentId: "assist-ant",
      caste: "assist_ant",
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      savedAt: "2026-04-16T10:00:00.000Z",
      lastMessageAt: "2026-04-16T10:00:00.000Z",
      totalMessages: 4,
      interruption: "interrupted_prompt",
      hasCheckpoint: true,
      entries: [
        { sequence: 1, role: "system", timestamp: "2026-04-16T09:57:00.000Z", previewText: "sys" },
        { sequence: 2, role: "assistant", timestamp: "2026-04-16T09:58:00.000Z", previewText: "Need answer soon." },
        { sequence: 3, role: "tool", timestamp: "2026-04-16T09:59:00.000Z", previewText: "file_read ok", toolName: "file_read" },
        { sequence: 4, role: "user", timestamp: "2026-04-16T10:00:00.000Z", previewText: "Need answer when run comes back." },
      ],
    }),
    isRunActive: () => false,
  });
  assert(actions.some((entry) => entry.includes("Filter: user")), "Executor persisted filtered history keeps filter label");
  assert(actions.some((entry) => entry.includes("Messages shown: 1 filtered of 4 visible (4 total)")), "Executor persisted filtered history reports filtered counts");
  assert(actions.some((entry) => entry.includes("4. user @ 2026-04-16T10:00:00.000Z")), "Executor persisted filtered history keeps matching entry");
  assert(!actions.some((entry) => entry.includes("3. tool:file_read")), "Executor persisted filtered history omits non-matching entries");

  actions.length = 0;
  await executeCommand(
    {
      handled: true,
      command: "history",
      output: "Loading history for ses_saved_2...",
      data: {},
      isError: false,
      action: {
        kind: "show_session_history",
        sessionId: "ses_saved_2",
        count: 4,
        historyFilter: "tool",
        historySearch: "read",
        resumeAliases: ["pending", "latest"],
      },
    },
    {
      submitChat: async () => { actions.push("submit"); },
      exitApp: () => { actions.push("exit"); },
      resetSession: () => { actions.push("reset"); },
      requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
      setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
      showSystemMessage: (message: string) => { actions.push(message); },
      showErrorMessage: (message: string) => { actions.push(`ERROR:${message}`); },
      loadSessionHistory: async () => ({
        sessionId: "ses_saved_2",
        agentId: "assist-ant",
        caste: "assist_ant",
        provider: "anthropic",
        model: "claude-3-7-sonnet",
        savedAt: "2026-04-16T10:00:00.000Z",
        lastMessageAt: "2026-04-16T10:00:00.000Z",
        totalMessages: 4,
        interruption: "interrupted_prompt",
        hasCheckpoint: true,
        entries: [
          { sequence: 1, role: "system", timestamp: "2026-04-16T09:57:00.000Z", previewText: "sys" },
          { sequence: 2, role: "assistant", timestamp: "2026-04-16T09:58:00.000Z", previewText: "Need answer soon." },
          { sequence: 3, role: "tool", timestamp: "2026-04-16T09:59:00.000Z", previewText: "file_read ok", toolName: "file_read" },
          { sequence: 4, role: "tool", timestamp: "2026-04-16T10:00:00.000Z", previewText: "file_write ok", toolName: "file_write" },
        ],
      }),
      isRunActive: () => false,
    },
  );
  assert(actions.some((entry) => entry.includes("Filter: tool")), "Executor persisted searched history keeps filter label");
  assert(actions.some((entry) => entry.includes("Search: read")), "Executor persisted searched history keeps search label");
  assert(actions.some((entry) => entry.includes("Messages shown: 1 filtered of 4 visible (4 total)")), "Executor persisted searched history reports filtered counts");
  assert(actions.some((entry) => entry.includes("3. tool:file_read @ 2026-04-16T09:59:00.000Z")), "Executor persisted searched history keeps matching entry");
  assert(!actions.some((entry) => entry.includes("4. tool:file_write @ 2026-04-16T10:00:00.000Z")), "Executor persisted searched history omits non-matching tool entry");

  const cleanHistoryParser = new SlashCommandParser({
    sessions: [
      {
        sessionId: "ses_clean_new",
        agentId: "assist-ant",
        caste: "assist_ant",
        savedAt: "2026-04-17T12:00:00.000Z",
        lastMessageAt: "2026-04-17T12:01:00.000Z",
        messageCount: 5,
        tokensUsed: 640,
        costUsd: 0.02,
        interruption: "none",
        hasCheckpoint: true,
        previewText: "Newest clean session.",
        previewRole: "assistant",
      },
      {
        sessionId: "ses_clean_old",
        agentId: "assist-ant",
        caste: "assist_ant",
        savedAt: "2026-04-16T09:00:00.000Z",
        lastMessageAt: "2026-04-16T09:30:00.000Z",
        messageCount: 7,
        tokensUsed: 900,
        costUsd: 0.03,
        interruption: "none",
        hasCheckpoint: false,
        previewText: "Older clean session.",
        previewRole: "assistant",
      },
    ],
  });
  actions.length = 0;
  await executeCommand(cleanHistoryParser.tryHandle("/history latest 2"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    loadSessionHistory: async () => ({
      sessionId: "ses_clean_new",
      agentId: "assist-ant",
      caste: "assist_ant",
      savedAt: "2026-04-17T12:00:00.000Z",
      lastMessageAt: "2026-04-17T12:01:00.000Z",
      totalMessages: 5,
      interruption: "none",
      hasCheckpoint: true,
      entries: [
        { sequence: 4, role: "assistant", timestamp: "2026-04-17T12:00:30.000Z", previewText: "Newest clean answer." },
        { sequence: 5, role: "user", timestamp: "2026-04-17T12:01:00.000Z", previewText: "Thanks." },
      ],
    }),
    isRunActive: () => false,
  });
  assert(actions.some((entry) => entry.includes("Source: persisted session")), "Executor renders latest clean persisted history");
  assert(actions.some((entry) => entry.includes("Resume: /resume latest | /resume ses_clean_new")), "Executor latest clean history includes latest alias");
  assert(actions.some((entry) => entry.includes("Inspect: /sessions | /history latest 8 | /history ses_clean_new 8")), "Executor latest clean history includes latest inspect alias");

  const unsavedCurrentCleanHistoryParser = new SlashCommandParser({
    session: {
      sessionId: "ses_live_only",
      agentId: "assist-ant",
      caste: "assist_ant",
      history: [
        { type: "user", content: "live but newer", timestamp: "2026-04-17T12:06:00.000Z" },
      ],
    },
    sessions: [
      {
        sessionId: "ses_clean_new",
        agentId: "assist-ant",
        caste: "assist_ant",
        savedAt: "2026-04-17T12:00:00.000Z",
        lastMessageAt: "2026-04-17T12:01:00.000Z",
        messageCount: 5,
        tokensUsed: 640,
        costUsd: 0.02,
        interruption: "none",
        hasCheckpoint: true,
        previewText: "Newest clean session.",
        previewRole: "assistant",
      },
    ],
  });
  actions.length = 0;
  await executeCommand(unsavedCurrentCleanHistoryParser.tryHandle("/history 1 2"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    loadSessionHistory: async () => ({
      sessionId: "ses_clean_new",
      agentId: "assist-ant",
      caste: "assist_ant",
      savedAt: "2026-04-17T12:00:00.000Z",
      lastMessageAt: "2026-04-17T12:01:00.000Z",
      totalMessages: 5,
      interruption: "none",
      hasCheckpoint: true,
      entries: [
        { sequence: 4, role: "assistant", timestamp: "2026-04-17T12:00:30.000Z", previewText: "Newest clean answer." },
        { sequence: 5, role: "user", timestamp: "2026-04-17T12:01:00.000Z", previewText: "Thanks." },
      ],
    }),
    isRunActive: () => false,
  });
  assert(!actions.some((entry) => entry.includes("Resume: /resume latest | /resume ses_clean_new")), "Executor saved history omits latest resume alias when newer unsaved current session owns latest");
  assert(!actions.some((entry) => entry.includes("Inspect: /sessions | /history latest 8 | /history ses_clean_new 8")), "Executor saved history omits latest inspect alias when newer unsaved current session owns latest");

  actions.length = 0;
  await executeCommand(cleanHistoryParser.tryHandle("/history 2 2"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    loadSessionHistory: async () => ({
      sessionId: "ses_clean_old",
      agentId: "assist-ant",
      caste: "assist_ant",
      savedAt: "2026-04-16T09:00:00.000Z",
      lastMessageAt: "2026-04-16T09:30:00.000Z",
      totalMessages: 7,
      interruption: "none",
      hasCheckpoint: false,
      entries: [
        { sequence: 6, role: "assistant", timestamp: "2026-04-16T09:25:00.000Z", previewText: "Older clean answer." },
        { sequence: 7, role: "user", timestamp: "2026-04-16T09:30:00.000Z", previewText: "Wrap up." },
      ],
    }),
    isRunActive: () => false,
  });
  assert(actions.some((entry) => entry.includes("Resume: /resume ses_clean_old")), "Executor older clean history keeps direct resume hint");
  assert(!actions.some((entry) => entry.includes("/resume latest | /resume ses_clean_old")), "Executor older clean history omits latest alias");
  assert(actions.some((entry) => entry.includes("Inspect: /sessions | /history ses_clean_old 8")), "Executor older clean history keeps direct inspect hint");
  assert(!actions.some((entry) => entry.includes("/history latest 8 | /history ses_clean_old 8")), "Executor older clean history omits latest inspect alias");

  const olderInterruptedHistoryParser = new SlashCommandParser({
    sessions: [
      {
        sessionId: "ses_pending_new",
        agentId: "assist-ant",
        caste: "assist_ant",
        savedAt: "2026-04-17T12:00:00.000Z",
        lastMessageAt: "2026-04-17T12:01:00.000Z",
        messageCount: 5,
        tokensUsed: 640,
        costUsd: 0.02,
        interruption: "interrupted_prompt",
        hasCheckpoint: true,
        previewText: "Newest interrupted session.",
        previewRole: "user",
      },
      {
        sessionId: "ses_pending_old",
        agentId: "assist-ant",
        caste: "assist_ant",
        savedAt: "2026-04-16T09:00:00.000Z",
        lastMessageAt: "2026-04-16T09:30:00.000Z",
        messageCount: 7,
        tokensUsed: 900,
        costUsd: 0.03,
        interruption: "interrupted_turn",
        hasCheckpoint: false,
        previewText: "Older interrupted session.",
        previewRole: "assistant",
      },
    ],
  });
  actions.length = 0;
  await executeCommand(olderInterruptedHistoryParser.tryHandle("/history 2 2"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    loadSessionHistory: async () => ({
      sessionId: "ses_pending_old",
      agentId: "assist-ant",
      caste: "assist_ant",
      savedAt: "2026-04-16T09:00:00.000Z",
      lastMessageAt: "2026-04-16T09:30:00.000Z",
      totalMessages: 7,
      interruption: "interrupted_turn",
      hasCheckpoint: false,
      entries: [
        { sequence: 6, role: "assistant", timestamp: "2026-04-16T09:25:00.000Z", previewText: "Older interrupted answer draft." },
        { sequence: 7, role: "tool", toolName: "file_read", timestamp: "2026-04-16T09:30:00.000Z", previewText: "Tool pending resolution." },
      ],
    }),
    isRunActive: () => false,
  });
  assert(actions.some((entry) => entry.includes("Source: persisted session")), "Executor renders older interrupted persisted history");
  assert(actions.some((entry) => entry.includes("Resume: /resume ses_pending_old")), "Executor older interrupted history keeps direct resume hint");
  assert(!actions.some((entry) => entry.includes("/resume pending | /resume ses_pending_old")), "Executor older interrupted history omits pending alias");
  assert(actions.some((entry) => entry.includes("Inspect: /sessions | /history ses_pending_old 8")), "Executor older interrupted history keeps direct inspect hint");
  assert(!actions.some((entry) => entry.includes("/history pending 8 | /history ses_pending_old 8")), "Executor older interrupted history omits pending inspect alias");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/history latest 2"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message) => { actions.push(`error:${message}`); },
    loadSessionHistory: async () => null,
    isRunActive: () => false,
  });
  assert(actions.some((entry) => entry.startsWith("error:No persisted history found for session ses_saved_2")), "Executor reports missing persisted history");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/resume resume_focus_9"), {
    submitChat: async () => { actions.push("submit"); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { actions.push(`budget:${maxUsd}`); },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    resumeSession: async () => { throw new Error("No persisted session found."); },
    isRunActive: () => false,
  });
  assert(actions.some((entry) => entry.startsWith("error:Failed to resume session resume_focus_9")), "Executor reports resume failure");
}

async function verifySessionRecovery(): Promise<void> {
  section("5c. Session Recovery");

  let session = createAgentSession({ agentId: "assist-ant", caste: Caste.ASSIST_ANT });
  session = addMessage(session, createSystemMessage("system prompt", 100));
  session = addMessage(session, createUserMessage("hello"));
  session = addMessage(session, createAssistantMessage("hi there", {
    toolCalls: [{ id: "tool-1", name: "file_read", arguments: { path: "README.md" } }],
    model: "phase7-model",
    provider: "local",
  }));
  session = addMessage(session, createToolResult("tool-1", "file_read", "content", false, 12));

  const dataDir = await mkdtemp(join(tmpdir(), "colony-phase7-resume-"));
  try {
    const snapshot = createSessionRecoverySnapshot({
      session,
      costTrackerSnapshot: new CostTracker("phase7-model", 5).toSnapshot(),
      usage: {
        tokensUsed: 2048,
        costUsd: 0.12,
        callCount: 3,
        deniedCount: 1,
        maxUsd: 5,
        maxTokens: 128_000,
      },
      sessionAllowRules: ["file_read:abc123"],
      contextUsage: {
        usedTokens: 2048,
        maxTokens: 128_000,
        remainingTokens: 125_952,
        percentUsed: 1.6,
        messageCount: session.history.length,
        isAboveWarningThreshold: false,
        isAboveAutoCompactThreshold: false,
        isAtBlockingLimit: false,
        compactionFailureCount: 0,
      },
      providerHealth: {
        local: { state: "open", failureCount: 3 },
        anthropic: { state: "closed", failureCount: 0 },
      },
      recentFailovers: [
        {
          fromProvider: "local",
          fromModel: "llama3.2",
          toProvider: "anthropic",
          toModel: "claude-sonnet-4-5",
          errorType: "LLMConnectionError",
          errorMessage: "connect refused",
          timestamp: 1,
        },
      ],
      recentHookEvents: [
        {
          kind: "PostToolUse",
          detail: "file_read",
          timestamp: 11,
          durationMs: 12,
        },
        {
          kind: "PostCompact",
          detail: "standard",
          timestamp: 12,
          durationMs: 42,
        },
      ],
      recentCompactions: [
        {
          strategy: "standard",
          trigger: "manual",
          timestamp: 21,
          durationMs: 58,
          compacted: true,
          originalCount: 9,
          finalCount: 5,
          tokensSavedEstimate: 300,
          summaryLineCount: 2,
          summarizedMessageCount: 4,
        },
        {
          strategy: "reactive",
          trigger: "reactive_overflow",
          timestamp: 22,
          durationMs: 91,
          compacted: false,
          originalCount: 5,
          finalCount: 5,
          tokensSavedEstimate: 0,
          summaryLineCount: 0,
          summarizedMessageCount: 0,
          failureMessage: "Compaction engine offline.",
        },
      ],
      latestCompactionHandoff: {
        status: "ok",
        strategy: "standard",
        trigger: "manual",
        timestamp: 23,
        loggedCount: 4,
        structuredCount: 2,
        artifactId: "art_handoff3",
        artifactChars: 640,
      },
      lastCompactionFailure: {
        strategy: "reactive",
        message: "Compaction engine offline.",
      },
      lastCompaction: {
        compacted: true,
        originalCount: 9,
        finalCount: 5,
        summary: "summary",
        tokensSavedEstimate: 300,
        messages: session.history,
        strategyUsed: "standard",
        triggerSource: "manual",
        usageBeforeFraction: 0.82,
        preservedSystemCount: 1,
        preservedRecentCount: 4,
        summarizedMessageCount: 4,
        summaryLineCount: 2,
      },
    });

    await persistSessionRecovery(snapshot, { dataDir });

    const loaded = await loadSessionRecovery(session.sessionId, {
      dataDir,
      agentId: session.agentId,
      caste: session.caste,
    });

    assert(loaded !== null, "Session recovery loads persisted checkpoint");
    assertEqual(loaded!.session.sessionId, session.sessionId, "Recovered session ID preserved");
    assertEqual(loaded!.session.history.length, session.history.length, "Recovered history length preserved");
    assertEqual(loaded!.usage.costUsd, 0.12, "Recovered usage cost preserved");
    assertEqual(loaded!.sessionAllowRules[0], "file_read:abc123", "Recovered session allow rule preserved");
    assertEqual(loaded!.providerHealth.local?.state, "open", "Recovered provider health state preserved");
    assertEqual(loaded!.providerHealth.local?.failureCount, 3, "Recovered provider health failure count preserved");
    assertEqual(loaded!.recentFailovers.length, 1, "Recovered failover history preserved");
    assertEqual(loaded!.recentFailovers[0]?.toProvider, "anthropic", "Recovered failover destination preserved");
    assertEqual(loaded!.recentFailovers[0]?.errorMessage, "connect refused", "Recovered failover error detail preserved");
    assertEqual(loaded!.recentHookEvents.length, 2, "Recovered hook event history preserved");
    assertEqual(loaded!.recentHookEvents[0]?.kind, "PostToolUse", "Recovered hook event kind preserved");
    assertEqual(loaded!.recentHookEvents[1]?.detail, "standard", "Recovered hook event detail preserved");
    assertEqual(loaded!.recentHookEvents[1]?.durationMs, 42, "Recovered hook event duration preserved");
    assertEqual(loaded!.recentCompactions.length, 2, "Recovered compaction history preserved");
    assertEqual(loaded!.recentCompactions[0]?.strategy, "standard", "Recovered compaction history keeps success strategy");
    assertEqual(loaded!.recentCompactions[0]?.durationMs, 58, "Recovered compaction history keeps success duration");
    assertEqual(loaded!.recentCompactions[1]?.failureMessage, "Compaction engine offline.", "Recovered compaction history keeps failure detail");
    assertEqual(loaded!.recentCompactions[1]?.durationMs, 91, "Recovered compaction history keeps failure duration");
    assertEqual(loaded!.latestCompactionHandoff?.artifactId, "art_handoff3", "Recovered compaction handoff keeps artifact id");
    assertEqual(loaded!.latestCompactionHandoff?.structuredCount, 2, "Recovered compaction handoff keeps structured count");
    assertEqual(loaded!.lastCompactionFailure?.strategy, "reactive", "Recovered last compaction failure strategy preserved");
    assertEqual(loaded!.lastCompactionFailure?.message, "Compaction engine offline.", "Recovered last compaction failure message preserved");
    assertEqual(detectSessionInterruption(loaded!.session.history), "none", "Clean transcript reports no interruption");

    const interruptedHistory = [...session.history, {
      type: "user" as const,
      id: "later",
      content: "pick back up",
      timestamp: new Date().toISOString(),
    }];
    assertEqual(detectSessionInterruption(interruptedHistory), "interrupted_prompt", "User-tail transcript reports interrupted prompt");

    const unresolvedHistory = [
      session.history[0]!,
      session.history[1]!,
      {
        type: "assistant" as const,
        id: "asst-2",
        content: "using tool",
        toolCalls: [{ id: "tool-unresolved", name: "grep_search", arguments: { pattern: "TODO" } }],
        finishReason: "tool_calls",
        model: "phase7-model",
        provider: "local",
        tokenUsage: {},
        timestamp: new Date().toISOString(),
        iteration: 2,
      },
    ];
    assertEqual(detectSessionInterruption(unresolvedHistory), "interrupted_turn", "Unresolved tool transcript reports interrupted turn");

    const checkpointPath = sessionRecoveryPaths(session.sessionId, session.agentId, dataDir).checkpointFile;
    await rm(checkpointPath, { force: true });
    const transcriptOnly = await loadSessionRecovery(session.sessionId, {
      dataDir,
      agentId: session.agentId,
      caste: session.caste,
    });
    assert(transcriptOnly !== null, "Transcript-only recovery works without checkpoint");
    assertEqual(transcriptOnly!.session.history.length, session.history.length, "Transcript-only recovery rebuilds history");
    assertEqual(Object.keys(transcriptOnly!.providerHealth).length, 0, "Transcript-only recovery clears provider health snapshots");
    assertEqual(transcriptOnly!.recentFailovers.length, 0, "Transcript-only recovery clears failover history");
    assertEqual(transcriptOnly!.recentHookEvents.length, 0, "Transcript-only recovery clears hook event history");

    const excerpt = await loadPersistedSessionHistoryExcerpt(session.sessionId, {
      dataDir,
      agentId: session.agentId,
      caste: session.caste,
      limit: 2,
    });
    assert(excerpt !== null, "Persisted history excerpt loads");
    assertEqual(excerpt!.entries.length, 2, "Persisted history excerpt respects limit");
    assertEqual(excerpt!.entries[0]!.sequence, 3, "Persisted history excerpt keeps absolute sequence");
    assertEqual(excerpt!.entries[1]!.role, "tool", "Persisted history excerpt maps tool role");

    let secondSession = createAgentSession({ agentId: "assist-ant", caste: Caste.ASSIST_ANT });
    secondSession = addMessage(secondSession, createSystemMessage("system prompt", 100));
    secondSession = addMessage(secondSession, createAssistantMessage("ready when you are", {
      model: "phase7-model",
      provider: "local",
    }));
    secondSession = addMessage(secondSession, createUserMessage("resume me later"));
    await persistSessionRecovery(createSessionRecoverySnapshot({
      session: secondSession,
      usage: {
        tokensUsed: 64,
        costUsd: 0.0025,
        callCount: 1,
        deniedCount: 0,
        maxUsd: 5,
        maxTokens: 128_000,
      },
      savedAt: "2099-04-16T10:00:00.000Z",
    }), { dataDir });

    const listed = await listPersistedSessions({ dataDir });
    assertEqual(listed.length, 2, "Persisted session listing returns both sessions");
    assertEqual(listed[0]!.sessionId, secondSession.sessionId, "Persisted sessions sort newest first");
    const resumedLater = listed.find((item) => item.sessionId === secondSession.sessionId);
    const transcriptSummary = listed.find((item) => item.sessionId === session.sessionId);
    assertEqual(resumedLater!.interruption, "interrupted_prompt", "Persisted sessions report interruption state");
    assertEqual(transcriptSummary!.hasCheckpoint, false, "Transcript-only session listing notes checkpoint loss");
    assertEqual(resumedLater!.previewRole, "user", "Persisted sessions capture preview role");
    assert(resumedLater!.previewText.includes("resume me later"), "Persisted sessions capture preview text");
    assertEqual(resumedLater!.provider, "local", "Persisted sessions capture provider identity");
    assertEqual(resumedLater!.model, "phase7-model", "Persisted sessions capture model identity");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 6. ModelSelector & Provider Manager
// ---------------------------------------------------------------------------

function verifyInfrastructure(): void {
  section("6. ModelSelector & Provider Manager");

  // ModelSelector
  const selector = new ModelSelector();
  const candidates = selector.select();
  assert(candidates.length > 0, "Selector returns candidates");
  assert(candidates[0].providerName !== "", "Candidate has provider");
  assert(candidates[0].modelId !== "", "Candidate has model ID");

  // Provider Manager
  const pm = new ProviderManager();
  const providers = pm.listProviders();
  assert(providers.includes("ollama"), "PM: Ollama always registered");

  assert(pm.hasProvider("ollama"), "PM: hasProvider(ollama) = true");
  assert(!pm.hasProvider("nonexistent"), "PM: hasProvider(nonexistent) = false");

  const ollama = pm.getProvider("ollama");
  assertEqual(ollama.providerName, "ollama", "PM: resolves Ollama provider");

  // Unknown provider throws
  let threw = false;
  try {
    pm.getProvider("nonexistent");
  } catch {
    threw = true;
  }
  assert(threw, "PM: throws on unknown provider");
}

// ---------------------------------------------------------------------------
// 7. AgentLoop — Construction
// ---------------------------------------------------------------------------

function verifyLoopConstruction(): void {
  section("7. AgentLoop — Construction & Structure");

  const session = createAgentSession({
    agentId: "test-agent",
    caste: Caste.ASSIST_ANT,
  });

  const loop = new AgentLoop({
    session,
    config: { maxIterations: 5, timeoutSeconds: 30 },
  });

  assert(loop !== null, "Loop constructs successfully");
  assertEqual(loop.session.agentId, "test-agent", "Loop has session");
  assertEqual(loop.session.caste, Caste.ASSIST_ANT, "Loop session has caste");
  assert(loop.costTracker instanceof CostTracker, "Loop has cost tracker");

  // Kill switch
  loop.kill();
  // Can't easily test run() without a live LLM, but construction validates wiring
}

// ---------------------------------------------------------------------------
// 8. AgentLoop Streaming Bridge
// ---------------------------------------------------------------------------

async function verifyRunStreaming(): Promise<void> {
  section("8. AgentLoop â€” runStreaming()");

  providerManager.register("stream_mock", new MockStreamingProvider());

  const session = createAgentSession({
    agentId: "stream-agent",
    caste: Caste.ASSIST_ANT,
  });

  const loop = new AgentLoop({
    session,
    config: {
      maxIterations: 1,
      timeoutSeconds: 30,
      model: "mock-model",
      costBudgetUsd: 10,
    },
    llmConfig: {
      defaults: { provider: "stream_mock", model: "mock-model" },
      providers: {
        stream_mock: { defaultModel: "mock-model" },
      },
      casteModels: {
        [Caste.ASSIST_ANT]: { provider: "stream_mock", model: "mock-model" },
      },
      failover: {},
    },
  });

  const events = [];
  for await (const event of loop.runStreaming("hello")) {
    events.push(event);
  }

  const deltas = events
    .filter((event) => event.type === "delta")
    .map((event) => event.content)
    .join("");
  const complete = events.find((event) => event.type === "complete");

  assert(events.some((event) => event.type === "status"), "Streaming: emits status");
  assertEqual(deltas, "Hello", "Streaming: emits concatenated deltas");
  assert(events.some((event) => event.type === "cost"), "Streaming: emits cost");
  assert(complete?.type === "complete", "Streaming: emits complete");
  if (complete?.type === "complete") {
    assertEqual(complete.result.terminationReason, "complete", "Streaming: completes normally");
    assertEqual(complete.result.finalContent, "Hello", "Streaming: final content");
    assert(complete.result.totalTokens > 0, "Streaming: tracks token estimate");
  }

  assert(loop.session.history.some((msg) => msg.type === "user"), "Streaming: records user message");
  assert(loop.session.history.some((msg) => msg.type === "assistant"), "Streaming: records assistant message");
}

// ---------------------------------------------------------------------------
// Run all verifications
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("\n🧠 THE COLONY — Phase 7 Verification (The Brain)\n");

  verifyOllamaProvider();
  await verifyFailoverExecutor();
  verifyAgentLoop();
  verifyPromptBuilder();
  verifyPromptAssembler();
  verifyGateway();
  await verifyCommandExecution();
  await verifySessionRecovery();
  verifyInfrastructure();
  verifyLoopConstruction();
  await verifyRunStreaming();

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("═".repeat(60));

  if (failed > 0) {
    console.error("\n⚠️  Phase 7 verification FAILED. Fix issues above.");
    process.exit(1);
  } else {
    console.log("\n🧠 Phase 7: The Brain is GREEN. The Colony can THINK.");
  }
}

await main();
