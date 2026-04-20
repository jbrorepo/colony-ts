/**
 * React bridge between Ink and the AgentLoop async generator.
 *
 * The loop emits token deltas faster than Ink should render. This hook buffers
 * deltas in refs and flushes them to Zustand at most every 50ms.
 */

import { startTransition, useCallback, useEffect, useRef } from "react";

import { Caste } from "../caste/enums";
import type { FailoverEvent } from "../llm/failover-executor";
import { TokenBucketRateLimiter } from "../llm/rate-limiter";
import { ColonyMemoryService } from "../memory/service";
import type { LLMConfig } from "../llm/selector";
import { SecurityAuditTrail } from "../security/audit-trail";
import {
  ExactSessionApprovalPolicy,
  createApprovalDecision,
  formatDeniedToolResultMessage,
  parseDeniedToolResultMessage,
  parsePendingApprovalMessage,
  type ApprovalDecision,
  type ApprovalRequest,
  type ApprovalScope,
} from "../runtime/approval";
import {
  CompactionEngine,
  ContextWindowTracker,
  formatCompactionResult,
  type CompactionStrategy,
  type CompactionResult,
} from "../runtime/compaction";
import { createSystemMessage } from "../runtime/message";
import {
  AgentLoop,
  type CompactionHandoff,
  CostTracker,
  type HookEvent,
  type LoopPromptContext,
  type LoopStreamEvent,
  type ToolCall,
  type ToolResult,
} from "../runtime/loop";
import { PromptBuilder } from "../runtime/prompt-builder";
import { addMessage, createAgentSession, type AgentSession } from "../runtime/session";
import {
  createSessionRecoverySnapshot,
  detectSessionInterruption,
  listPersistedSessions,
  loadPersistedSessionHistoryExcerpt,
  loadSessionRecovery,
  persistSessionRecovery,
  type SessionHistoryExcerpt,
  type PersistedSessionSummary,
} from "../runtime/session-recovery";
import { buildRuntimeTooling } from "../runtime/runtime-tooling";
import { ToolExecutor, ToolRegistry } from "../runtime/tools-registry";
import {
  parsePersistedToolResultMessage,
  ToolResultStorage,
} from "../runtime/tool-result-storage";
import {
  formatStartupBlockMessage,
  formatStartupReport,
  runStartupDiagnostics,
  type StartupReport,
} from "../runtime/startup-diagnostics";
import { detectWorkspace } from "../runtime/workspace";
import { useColonyStore } from "./store";

const STREAM_FLUSH_MS = 50;
const DEFAULT_AGENT_ID = "assist-ant";
const DEFAULT_CASTE = Caste.ASSIST_ANT;
const DEFAULT_LOCAL_MODEL = process.env.COLONY_OLLAMA_MODEL ?? "llama3.2";
const DEFAULT_ANTHROPIC_MODEL =
  process.env.COLONY_ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929";
const DEFAULT_GEMINI_MODEL = process.env.COLONY_GEMINI_MODEL ?? "gemini-2.5-flash";
const DEFAULT_OPENAI_MODEL = process.env.COLONY_OPENAI_MODEL ?? "gpt-4o-mini";
const DEFAULT_RATE_LIMIT_CAPACITY = Number.parseInt(process.env.COLONY_LLM_RATE_LIMIT_CAPACITY ?? "60", 10);
const DEFAULT_RATE_LIMIT_REFILL = Number.parseFloat(process.env.COLONY_LLM_RATE_LIMIT_REFILL_PER_SECOND ?? "1");
const SUPPORTED_RUNTIME_HOOK_KINDS = ["PreCompact", "PostCompact", "PreToolUse", "PostToolUse"] as const;

interface PromptToolActivitySummary {
  toolName: string;
  status: string;
  detail?: string;
  artifactPath?: string;
}

function summarizePromptToolActivity(
  messages: Array<{ role: string; toolName?: string; content: string; isError?: boolean }>,
  limit = 3,
): PromptToolActivitySummary[] {
  const recent: PromptToolActivitySummary[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const entry = messages[index];
    const toolName = entry.toolName;
    if (!toolName) continue;

    const pendingApproval = parsePendingApprovalMessage(entry.content);
    if (pendingApproval) {
      recent.push({
        toolName,
        status: "pending approval",
        detail: `${pendingApproval.riskLevel}/${pendingApproval.category} | ${pendingApproval.summary}`,
      });
    } else {
      const denied = parseDeniedToolResultMessage(entry.content);
      if (denied) {
        recent.push({
          toolName,
          status: denied.status.replace(/\.$/, ""),
          detail: `${denied.riskLevel}/${denied.category} | ${denied.summary}`,
        });
      } else {
        const persisted = parsePersistedToolResultMessage(entry.content);
        if (persisted) {
          recent.push({
            toolName,
            status: "saved artifact",
            detail: `${persisted.originalSize.toLocaleString()} chars`,
            artifactPath: persisted.filepath,
          });
        } else {
          const preview = entry.content
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find(Boolean);
          recent.push({
            toolName,
            status: entry.role === "error" || entry.isError ? "error" : "ok",
            detail: preview && preview.length > 88 ? `${preview.slice(0, 85)}...` : preview,
          });
        }
      }
    }

    if (recent.length >= limit) break;
  }
  return recent;
}

interface RuntimeContext {
  session: AgentSession;
  registry: ToolRegistry;
  executor: ToolExecutor;
  memory: ColonyMemoryService;
  activeToolIds: string[];
  permittedToolIds: string[];
  toolCategories: Map<string, string>;
  approvalPolicy: ExactSessionApprovalPolicy;
  auditTrail: SecurityAuditTrail;
  rateLimiter: TokenBucketRateLimiter;
  llmConfig: LLMConfig;
  costTracker: CostTracker;
  workspaceRoot: string;
}

export interface ColonyLoopControls {
  submit: (input: string) => Promise<void>;
  cancel: () => void;
  resetSession: () => void;
  resumeSession: (sessionId: string) => Promise<void>;
  setProviderSelection: (provider: string, model?: string) => Promise<void>;
  loadSessionHistory: (sessionId: string, count: number) => Promise<SessionHistoryExcerpt | null>;
  compactNow: (
    strategy?: CompactionStrategy,
    announceQueuedStatus?: boolean,
  ) => Promise<CompactionResult | null>;
  resolveApproval: (scope: ApprovalScope) => void;
  getRuntimeSummary: () => {
    defaultProvider: string;
    defaultModel: string;
    providerDefaults: Record<string, string>;
    pendingCompactionStrategy: CompactionStrategy | null;
    availableProviders: string[];
    failover: Record<string, string[]>;
    providerHealth: Record<string, { state?: string; failureCount?: number }>;
    recentFailovers: Array<{
      fromProvider: string;
      fromModel: string;
      toProvider: string;
      toModel: string;
      errorType: string;
      errorMessage: string;
      timestamp: number;
    }>;
    lastCompactionFailure: { strategy: CompactionStrategy; message: string } | null;
    latestCompactionHandoff: ReturnType<typeof useColonyStore.getState>["latestCompactionHandoff"];
    persistedSessions: PersistedSessionSummary[];
    activeToolIds: string[];
    permittedToolIds: string[];
    startupReport: StartupReport | null;
    supportedHookKinds: string[];
  };
  getPermissionSummary: () => {
    active: string[];
    permitted: string[];
    denied: string[];
  };
}

function buildLlmConfig(): LLMConfig {
  const providers: LLMConfig["providers"] = {
    local: { defaultModel: DEFAULT_LOCAL_MODEL },
  };
  const localFailover: string[] = [];

  if (process.env.ANTHROPIC_API_KEY) {
    providers.anthropic = {
      defaultModel: DEFAULT_ANTHROPIC_MODEL,
      apiKey: "env",
    };
    localFailover.push("anthropic");
  }

  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    providers.gemini = {
      defaultModel: DEFAULT_GEMINI_MODEL,
      apiKey: "env",
    };
    localFailover.push("gemini");
  }

  if (process.env.OPENAI_API_KEY) {
    providers.openai = {
      defaultModel: DEFAULT_OPENAI_MODEL,
      apiKey: "env",
    };
    localFailover.push("openai");
  }

  return {
    defaults: {
      provider: "local",
      model: DEFAULT_LOCAL_MODEL,
    },
    providers,
    casteModels: {
      [DEFAULT_CASTE]: { provider: "local", model: DEFAULT_LOCAL_MODEL },
    },
    failover: localFailover.length > 0 ? { local: localFailover } : {},
  };
}

function buildRateLimiter(): TokenBucketRateLimiter {
  return new TokenBucketRateLimiter({
    defaultCapacity: Number.isFinite(DEFAULT_RATE_LIMIT_CAPACITY) && DEFAULT_RATE_LIMIT_CAPACITY > 0
      ? DEFAULT_RATE_LIMIT_CAPACITY
      : 60,
    defaultRefillRatePerSecond: Number.isFinite(DEFAULT_RATE_LIMIT_REFILL) && DEFAULT_RATE_LIMIT_REFILL >= 0
      ? DEFAULT_RATE_LIMIT_REFILL
      : 1,
  });
}

function currentWorkspaceRoot(): string | null {
  return useColonyStore.getState().workspaceInfo?.root ?? null;
}

function buildRuntime(workspaceRoot = currentWorkspaceRoot()): RuntimeContext {
  const tooling = buildRuntimeTooling(DEFAULT_AGENT_ID, DEFAULT_CASTE, workspaceRoot);

  const systemPrompt = PromptBuilder.buildSystemPrompt({
    caste: DEFAULT_CASTE,
    agentId: DEFAULT_AGENT_ID,
    includeManifesto: true,
  });

  let session = createAgentSession({
    agentId: DEFAULT_AGENT_ID,
    caste: DEFAULT_CASTE,
  });
  session = addMessage(session, createSystemMessage(systemPrompt, 100));

  return {
    session,
    workspaceRoot: tooling.workspaceRoot,
    registry: tooling.registry,
    executor: tooling.executor,
    memory: new ColonyMemoryService(),
    activeToolIds: tooling.activeToolIds,
    permittedToolIds: tooling.permittedToolIds,
    toolCategories: tooling.toolCategories,
    approvalPolicy: new ExactSessionApprovalPolicy(),
    auditTrail: new SecurityAuditTrail(),
    rateLimiter: buildRateLimiter(),
    llmConfig: buildLlmConfig(),
    costTracker: new CostTracker(DEFAULT_LOCAL_MODEL),
  };
}

function providerDefaultModel(runtime: RuntimeContext, provider: string): string {
  return runtime.llmConfig.providers[provider]?.defaultModel ?? DEFAULT_LOCAL_MODEL;
}

function applyProviderSelection(runtime: RuntimeContext, provider: string, model?: string): { provider: string; model: string } {
  if (!(provider in runtime.llmConfig.providers)) {
    throw new Error(`Provider '${provider}' is not configured in this runtime.`);
  }

  const selectedModel = model ?? providerDefaultModel(runtime, provider);
  runtime.llmConfig.defaults.provider = provider;
  runtime.llmConfig.defaults.model = selectedModel;
  runtime.llmConfig.casteModels = {
    ...runtime.llmConfig.casteModels,
    [DEFAULT_CASTE]: { provider, model: selectedModel },
  };
  return { provider, model: selectedModel };
}

function rebindRuntimeWorkspace(runtime: RuntimeContext, workspaceRoot: string): RuntimeContext {
  const tooling = buildRuntimeTooling(runtime.session.agentId, runtime.session.caste, workspaceRoot);
  if (runtime.workspaceRoot === tooling.workspaceRoot) {
    return runtime;
  }

  runtime.workspaceRoot = tooling.workspaceRoot;
  runtime.registry = tooling.registry;
  runtime.executor = tooling.executor;
  runtime.activeToolIds = tooling.activeToolIds;
  runtime.permittedToolIds = tooling.permittedToolIds;
  runtime.toolCategories = tooling.toolCategories;
  return runtime;
}

function historyToLogMessages(history: AgentSession["history"], caste: string) {
  return history.map((message, index) => {
    const role: "user" | "assistant" | "system" | "tool" | "error" =
      message.type === "tool_result"
        ? (message.isError ? "error" : "tool")
        : message.type === "assistant"
          ? "assistant"
          : message.type === "system"
            ? "system"
            : "user";
    const parsedTimestamp = Date.parse(
      typeof message.timestamp === "string" ? message.timestamp : new Date().toISOString(),
    );

    return {
      id:
        typeof message.id === "string" && message.id.length > 0
          ? message.id
          : typeof message.toolCallId === "string" && message.toolCallId.length > 0
            ? `${message.toolCallId}-${index}`
            : `hist-${index}`,
      role,
      content: typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? ""),
      timestamp: Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now(),
      toolName: message.type === "tool_result" ? message.name : undefined,
      toolDurationMs:
        message.type === "tool_result" && typeof message.executionTimeMs === "number"
          ? message.executionTimeMs
          : undefined,
      externalizedResult:
        message.type === "tool_result" && typeof message.content === "string"
          ? parsePersistedToolResultMessage(message.content)
          : undefined,
      caste: message.type === "assistant" ? caste : undefined,
    };
  });
}

function interruptionSummary(interruption: ReturnType<typeof detectSessionInterruption>): string {
  if (interruption === "interrupted_prompt") return "Last turn ended after a user message with no assistant reply.";
  if (interruption === "interrupted_turn") return "Last turn ended with unresolved tool activity.";
  return "Transcript was clean.";
}

function statusLabel(event: Extract<LoopStreamEvent, { type: "status" }>): string {
  if (event.status === "tooling") return "The Colony is preparing tool context...";
  if (event.iteration > 0) return `The Colony is thinking (iteration ${event.iteration})...`;
  return "The Colony is thinking...";
}

export function listReadyCloudFallbackProviders(llmConfig?: LLMConfig | null): string[] {
  if (!llmConfig?.providers) return [];
  return Object.entries(llmConfig.providers)
    .filter(([providerName, providerConfig]) => {
      if (["local", "ollama", "default"].includes(providerName)) return false;
      return typeof providerConfig?.apiKey === "string" && providerConfig.apiKey.length > 0;
    })
    .map(([providerName]) => providerName)
    .sort((left, right) => left.localeCompare(right));
}

export function readableError(error: string, llmConfig?: LLMConfig | null): string {
  const lower = error.toLowerCase();
  const readyCloudFallbacks = listReadyCloudFallbackProviders(llmConfig);
  const fallbackSummary = readyCloudFallbacks.length > 0
    ? `Ready cloud failover: ${readyCloudFallbacks.join(", ")}.`
    : "No ready cloud fallback is configured.";

  if (lower.includes("ollama") && lower.includes("all")) {
    return (
      "No local Ollama response is available. " +
      (readyCloudFallbacks.length > 0
        ? `${fallbackSummary} Check /provider and /doctor if failover should have engaged.`
        : "Start Ollama or set ANTHROPIC_API_KEY, GEMINI_API_KEY, GOOGLE_API_KEY, or OPENAI_API_KEY for cloud failover.") +
      "\n\n" +
      error
    );
  }

  if (lower.includes("all") && lower.includes("candidates exhausted")) {
    return `All configured LLM providers failed. ${fallbackSummary} Check /provider and /doctor for last health details. ${error}`;
  }

  return error;
}

function formatToolArguments(args: Record<string, unknown>): string {
  const raw = JSON.stringify(args);
  if (!raw) return "{}";
  return raw.length > 300 ? `${raw.slice(0, 300)}...` : raw;
}

function formatApprovalOutcome(scope: ApprovalScope): string {
  if (scope === "cancel") return "canceled";
  if (scope === "deny") return "denied";
  if (scope === "session") return "exact-call session allow";
  return "allow once";
}

function buildLoopPromptContext(opts: {
  runtime: RuntimeContext;
  store: ReturnType<typeof useColonyStore.getState>;
  startupReport: StartupReport | null;
  memoryContext?: string | null;
}): LoopPromptContext {
  const { runtime, store, startupReport, memoryContext } = opts;
  return {
    memoryContext: memoryContext ?? null,
    workspace: store.workspaceInfo,
    startupReport,
    runtime: {
      provider:
        store.provider
        || runtime.llmConfig.defaults.provider,
      model:
        store.model
        || runtime.llmConfig.defaults.model
        || runtime.llmConfig.providers[runtime.llmConfig.defaults.provider]?.defaultModel
        || DEFAULT_LOCAL_MODEL,
      selectedProvider:
        store.selectedProvider
        || runtime.llmConfig.defaults.provider,
      selectedModel:
        store.selectedModel
        || runtime.llmConfig.defaults.model
        || runtime.llmConfig.providers[runtime.llmConfig.defaults.provider]?.defaultModel
        || DEFAULT_LOCAL_MODEL,
      availableProviders: Object.keys(runtime.llmConfig.providers).sort(),
      failover: Object.fromEntries(
        Object.entries(runtime.llmConfig.failover ?? {}).map(([provider, chain]) => [
          provider,
          [...chain],
        ]),
      ),
      circuitState: store.circuitState,
      providerHealth: Object.fromEntries(
        Object.entries(store.providerHealth).map(([provider, snapshot]) => [
          provider,
          { ...snapshot },
        ]),
      ),
      recentFailovers: store.recentFailovers.map((event) => ({ ...event })),
      recentToolActivity: summarizePromptToolActivity(store.messages, 3),
      recentHookEvents: store.recentHookEvents.map((event) => ({ ...event })),
      activeToolIds: [...runtime.activeToolIds],
      activeToolCount: runtime.activeToolIds.length,
      permittedToolIds: [...runtime.permittedToolIds],
      permittedToolCount: runtime.permittedToolIds.length,
      pendingApproval: Boolean(store.pendingApproval),
      pendingApprovalToolName: store.pendingApproval?.toolName,
      pendingApprovalRiskLevel: store.pendingApproval?.riskLevel,
      pendingApprovalCategory: store.pendingApproval?.category,
      pendingApprovalSummary: store.pendingApproval?.summary,
      pendingApprovalSignature: store.pendingApproval?.signature,
      pendingApprovalReason: store.pendingApproval?.reason,
      pendingApprovalWarningCount: store.pendingApproval?.warnings.length ?? 0,
      sessionRuleCount: store.sessionAllowRules.length,
      sessionRules: [...store.sessionAllowRules],
      budgetUsd: store.maxUsd,
      budgetSpentUsd: store.costUsd,
      budgetRemainingUsd: Number.isFinite(store.maxUsd) ? Math.max(store.maxUsd - store.costUsd, 0) : null,
      contextUsedTokens: store.contextUsage?.usedTokens,
      contextMaxTokens: store.contextUsage?.maxTokens,
      contextRemainingTokens: store.contextUsage?.remainingTokens,
      contextPercentUsed: store.contextUsage?.percentUsed,
      contextPressure: store.contextUsage?.isAtBlockingLimit
        ? "blocking"
        : store.contextUsage?.isAboveWarningThreshold
          ? "warning"
          : store.contextUsage
            ? "ok"
            : undefined,
      compactionFailureCount: store.contextUsage?.compactionFailureCount,
      lastCompactionFailureStrategy: store.lastCompactionFailure?.strategy,
      lastCompactionFailureMessage: store.lastCompactionFailure?.message,
      pendingCompactionStrategy: store.pendingCompactionStrategy,
      lastCompactionStrategy: store.lastCompaction?.strategyUsed,
      lastCompactionTrigger: store.lastCompaction?.triggerSource,
      lastCompactionSavedTokens: store.lastCompaction?.tokensSavedEstimate,
      lastCompactionSummaryLineCount: store.lastCompaction?.summaryLineCount,
      lastCompactionSummarizedMessages: store.lastCompaction?.summarizedMessageCount,
      lastCompactionPreservedRecentCount: store.lastCompaction?.preservedRecentCount,
      lastCompactionPreservedSystemCount: store.lastCompaction?.preservedSystemCount,
      startupErrors: startupReport?.errorCount ?? 0,
      startupWarnings: startupReport?.warningCount ?? 0,
    },
  };
}

export function useColonyLoop(): ColonyLoopControls {
  const runtimeRef = useRef<RuntimeContext | null>(null);
  const loopRef = useRef<AgentLoop | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const assistantMessageIdRef = useRef<string | null>(null);
  const bufferedDeltaRef = useRef("");
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const approvalResolverRef = useRef<((decision: ApprovalDecision) => void) | null>(null);
  const approvalRequestIdsRef = useRef(new Set<string>());
  const approvalResolutionIdsRef = useRef(new Set<string>());
  const startupReportRef = useRef<StartupReport | null>(null);
  const providerHealthRef = useRef<Record<string, { state?: string; failureCount?: number }>>({});
  const failoverEventsRef = useRef<FailoverEvent[]>([]);
  const persistedSessionsRef = useRef<PersistedSessionSummary[]>([]);
  const selectedProviderRef = useRef("local");
  const selectedModelRef = useRef(DEFAULT_LOCAL_MODEL);

  const refreshPersistedSessions = useCallback(async () => {
    const sessions = await listPersistedSessions({ limit: 10 });
    persistedSessionsRef.current = sessions;
    useColonyStore.getState().setPersistedSessions(sessions);
  }, []);

  const clearFlushTimer = useCallback(() => {
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  const flushBufferedDelta = useCallback(() => {
    const messageId = assistantMessageIdRef.current;
    const delta = bufferedDeltaRef.current;
    if (!messageId || !delta) return;

    bufferedDeltaRef.current = "";
    startTransition(() => {
      useColonyStore.getState().appendToMessage(messageId, delta);
    });
  }, []);

  const ensureFlushTimer = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setInterval(flushBufferedDelta, STREAM_FLUSH_MS);
  }, [flushBufferedDelta]);

  const persistRuntimeState = useCallback(async (
    runtime: RuntimeContext,
    overrides: Partial<{
      tokensUsed: number;
      costUsd: number;
      callCount: number;
      deniedCount: number;
      maxUsd: number;
      maxTokens: number;
      sessionAllowRules: string[];
      contextUsage: ReturnType<typeof useColonyStore.getState>["contextUsage"];
      lastCompactionFailure: ReturnType<typeof useColonyStore.getState>["lastCompactionFailure"];
      lastCompaction: ReturnType<typeof useColonyStore.getState>["lastCompaction"];
      latestCompactionHandoff: ReturnType<typeof useColonyStore.getState>["latestCompactionHandoff"];
    }> = {},
  ) => {
    const store = useColonyStore.getState();
    await persistSessionRecovery(createSessionRecoverySnapshot({
      session: runtime.session,
      costTrackerSnapshot: runtime.costTracker.toSnapshot(),
      usage: {
        tokensUsed: overrides.tokensUsed ?? store.tokensUsed,
        costUsd: overrides.costUsd ?? store.costUsd,
        callCount: overrides.callCount ?? store.callCount,
        deniedCount: overrides.deniedCount ?? store.deniedCount,
        maxUsd: overrides.maxUsd ?? store.maxUsd,
        maxTokens: overrides.maxTokens ?? store.maxTokens,
      },
      sessionAllowRules: overrides.sessionAllowRules ?? runtime.approvalPolicy.listRules(),
      contextUsage: overrides.contextUsage ?? store.contextUsage,
      providerHealth: providerHealthRef.current,
      recentFailovers: failoverEventsRef.current.slice(-5).map((event) => ({ ...event })),
      recentHookEvents: store.recentHookEvents.map((event) => ({ ...event })),
      recentCompactions: store.recentCompactions.map((event) => ({ ...event })),
      latestCompactionHandoff: overrides.latestCompactionHandoff ?? store.latestCompactionHandoff,
      lastCompactionFailure: overrides.lastCompactionFailure ?? store.lastCompactionFailure,
      lastCompaction: overrides.lastCompaction ?? store.lastCompaction,
    }));
    await refreshPersistedSessions();
  }, [refreshPersistedSessions]);

  const getRuntime = useCallback(() => {
    if (!runtimeRef.current) {
      runtimeRef.current = buildRuntime();
      const runtime = runtimeRef.current;
      const selected = applyProviderSelection(runtime, selectedProviderRef.current, selectedModelRef.current);
      selectedProviderRef.current = selected.provider;
      selectedModelRef.current = selected.model;
      useColonyStore.getState().setSessionInfo({
        sessionId: runtime.session.sessionId,
        agentId: runtime.session.agentId,
        caste: runtime.session.caste,
        toolCount: runtime.activeToolIds.length,
      });
      useColonyStore.getState().setRuntimeStatus({
        provider: selected.provider,
        model: selected.model,
        selectedProvider: selected.provider,
        selectedModel: selected.model,
      });
      void runtime.memory.syncSession(runtime.session).then(() => {
        runtime.memory.primeSession(runtime.session);
      });
      void persistRuntimeState(runtime);
    }
    return runtimeRef.current;
  }, [persistRuntimeState]);

  const publishRuntime = useCallback((runtime: RuntimeContext) => {
    useColonyStore.getState().setSessionInfo({
      sessionId: runtime.session.sessionId,
      agentId: runtime.session.agentId,
      caste: runtime.session.caste,
      toolCount: runtime.activeToolIds.length,
    });
    useColonyStore.getState().setRuntimeStatus({
      provider: selectedProviderRef.current,
      model: selectedModelRef.current,
      selectedProvider: selectedProviderRef.current,
      selectedModel: selectedModelRef.current,
      circuitState: "closed",
    });
  }, []);

  const captureLoopRuntimeHealth = useCallback((loop: AgentLoop) => {
    const providerHealth = Object.fromEntries(
      Object.entries(loop.providerHealth).map(([provider, snapshot]) => [
        provider,
        {
          state: typeof snapshot.state === "string" ? snapshot.state : undefined,
          failureCount: typeof snapshot.failureCount === "number" ? snapshot.failureCount : undefined,
        },
      ]),
    );

    providerHealthRef.current = providerHealth;
    failoverEventsRef.current = loop.failoverEvents.slice(-5);

    const currentStore = useColonyStore.getState();
    const activeCandidate = loop.lastSuccessfulCandidate;
    const providerName = activeCandidate?.providerName ?? currentStore.provider;
    const modelName = activeCandidate?.modelId ?? currentStore.model;
    currentStore.setProviderDiagnostics(
      providerHealth,
      failoverEventsRef.current.map((event) => ({
        fromProvider: event.fromProvider,
        fromModel: event.fromModel,
        toProvider: event.toProvider,
        toModel: event.toModel,
        errorType: event.errorType,
        errorMessage: event.errorMessage,
        timestamp: event.timestamp,
      })),
    );
    currentStore.setRuntimeStatus({
      provider: providerName,
      model: modelName,
      selectedProvider: selectedProviderRef.current,
      selectedModel: selectedModelRef.current,
      circuitState: (providerHealth[providerName]?.state as "closed" | "open" | "half_open" | undefined)
        ?? currentStore.circuitState,
    });
  }, []);

  const getRuntimeSummary = useCallback(() => {
    const runtime = getRuntime();
    return {
      defaultProvider: selectedProviderRef.current,
      defaultModel: selectedModelRef.current,
      providerDefaults: Object.fromEntries(
        Object.entries(runtime.llmConfig.providers).map(([provider, config]) => [
          provider,
          config.defaultModel,
        ]),
      ),
      pendingCompactionStrategy: useColonyStore.getState().pendingCompactionStrategy,
      availableProviders: Object.keys(runtime.llmConfig.providers).sort(),
      failover: Object.fromEntries(
        Object.entries(runtime.llmConfig.failover ?? {}).map(([provider, chain]) => [
          provider,
          [...chain],
        ]),
      ),
      providerHealth: Object.fromEntries(
        Object.entries(providerHealthRef.current).map(([provider, snapshot]) => [provider, { ...snapshot }]),
      ),
      recentFailovers: failoverEventsRef.current.slice(-5).map((event) => ({ ...event })),
      lastCompactionFailure: useColonyStore.getState().lastCompactionFailure,
      latestCompactionHandoff: useColonyStore.getState().latestCompactionHandoff,
      persistedSessions: persistedSessionsRef.current.map((session) => ({ ...session })),
      activeToolIds: [...runtime.activeToolIds],
      permittedToolIds: [...runtime.permittedToolIds],
      startupReport: startupReportRef.current,
      supportedHookKinds: [...SUPPORTED_RUNTIME_HOOK_KINDS],
    };
  }, [getRuntime]);

  const setProviderSelection = useCallback(async (provider: string, model?: string): Promise<void> => {
    const runtime = getRuntime();
    const selected = applyProviderSelection(runtime, provider, model);
    selectedProviderRef.current = selected.provider;
    selectedModelRef.current = selected.model;
    if (!activeRunIdRef.current) {
      useColonyStore.getState().setRuntimeStatus({
        provider: selected.provider,
        model: selected.model,
        selectedProvider: selected.provider,
        selectedModel: selected.model,
      });
      return;
    }
    useColonyStore.getState().setRuntimeStatus({
      selectedProvider: selected.provider,
      selectedModel: selected.model,
    });
  }, [getRuntime]);

  const requestApproval = useCallback((request: ApprovalRequest): Promise<ApprovalDecision> => {
    return new Promise((resolve) => {
      approvalResolverRef.current = resolve;
    });
  }, []);

  const resetApprovalEventTracking = useCallback(() => {
    approvalRequestIdsRef.current.clear();
    approvalResolutionIdsRef.current.clear();
  }, []);

  const handleApprovalRequestEvent = useCallback((request: ApprovalRequest) => {
    if (approvalRequestIdsRef.current.has(request.requestId)) return;
    approvalRequestIdsRef.current.add(request.requestId);
    useColonyStore.getState().setPendingApproval(request);
  }, []);

  const handleApprovalResolvedEvent = useCallback((
    runtime: RuntimeContext,
    request: ApprovalRequest,
    decision: ApprovalDecision,
  ) => {
    if (approvalResolutionIdsRef.current.has(request.requestId)) return;
    approvalResolutionIdsRef.current.add(request.requestId);

    const store = useColonyStore.getState();
    store.setPendingApproval(null);
    store.setSessionAllowRules(runtime.approvalPolicy.listRules());
    if (!decision.approved) {
      store.incrementDeniedCount();
      store.addMessage(
        decision.scope === "cancel" ? "system" : "error",
        formatDeniedToolResultMessage({
          approved: false,
          request,
          decision,
          arguments: request.arguments,
          deniedBeforePrompt: false,
        }),
        {
          toolName: request.toolName,
          toolArgs: { ...request.arguments },
        },
      );
      return;
    }

    store.addMessage(
      "system",
      decision.scope === "session"
        ? `Approved ${request.toolName} for exact signature ${request.signature} this session.`
        : `Approved ${request.toolName} once for exact signature ${request.signature}.`,
    );
  }, []);

  const resolveApproval = useCallback((scope: ApprovalScope) => {
    const store = useColonyStore.getState();
    const request = store.pendingApproval;
    const resolver = approvalResolverRef.current;
    if (!request || !resolver) return;

    approvalResolverRef.current = null;
    store.setPendingApproval(null);
    resolver(createApprovalDecision(request.requestId, scope, {
      reason: scope === "deny"
        ? "Denied by user."
        : scope === "cancel"
          ? "Cancelled by user."
          : "Approved by user.",
    }));
  }, []);

  const executeTool = useCallback(async (call: ToolCall): Promise<ToolResult> => {
    const runtime = getRuntime();
    const started = performance.now();

    if (!runtime.activeToolIds.includes(call.name)) {
      return {
        callId: call.id,
        name: call.name,
        output: `Tool '${call.name}' requires an approval flow that is not active yet.`,
        isError: true,
        durationMs: Math.round(performance.now() - started),
      };
    }

    const result = await runtime.executor.execute(call.name, call.arguments);
    return {
      callId: call.id,
      name: call.name,
      output: result.error ?? result.output,
      isError: result.error !== null,
      durationMs: Math.round(result.durationSeconds * 1000),
    };
  }, [getRuntime]);

  const recordRuntimeHook = useCallback(async (event: HookEvent) => {
    const detail = event.kind === "PreToolUse" || event.kind === "PostToolUse"
      ? String((event.data?.toolName as string | undefined) ?? "")
      : event.kind === "PreCompact" || event.kind === "PostCompact"
        ? String((event.data?.strategy as string | undefined) ?? "")
        : "";
    const durationMs = typeof event.data?.durationMs === "number" && Number.isFinite(event.data.durationMs)
      ? Math.round(event.data.durationMs)
      : undefined;
    useColonyStore.getState().recordHookEvent({
      kind: event.kind,
      detail: detail || undefined,
      timestamp: Date.now(),
      durationMs,
    });
  }, []);

  const recordCompactionEvent = useCallback((event: {
    strategy: CompactionStrategy;
    trigger: string;
    durationMs?: number;
    compacted: boolean;
    originalCount: number;
    finalCount: number;
    tokensSavedEstimate: number;
    summaryLineCount: number;
    summarizedMessageCount: number;
    failureMessage?: string;
  }) => {
    useColonyStore.getState().recordCompactionEvent({
      ...event,
      timestamp: Date.now(),
    });
  }, []);

  const captureCompactionHandoff = useCallback(async (handoff: CompactionHandoff): Promise<void> => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    try {
      const captured = await runtime.memory.captureCompaction({
        sessionId: handoff.sessionId,
        agentId: handoff.agentId,
        caste: handoff.caste,
        compactedMessages: handoff.compactedMessages,
        strategy: handoff.result.strategyUsed,
        triggerSource: handoff.result.triggerSource,
        summary: handoff.result.summary,
      });
      useColonyStore.getState().setLatestCompactionHandoff({
        status: "ok",
        strategy: handoff.result.strategyUsed,
        trigger: handoff.result.triggerSource,
        timestamp: Date.now(),
        loggedCount: captured.loggedCount,
        structuredCount: captured.structured.length,
        artifactId: captured.artifact?.artifactId,
        artifactChars: captured.artifact?.verbatimChars,
      });
    } catch (error) {
      useColonyStore.getState().setLatestCompactionHandoff({
        status: "failed",
        strategy: handoff.result.strategyUsed,
        trigger: handoff.result.triggerSource,
        timestamp: Date.now(),
        loggedCount: 0,
        structuredCount: 0,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }, []);

  const cancel = useCallback(() => {
    if (approvalResolverRef.current) {
      resolveApproval("cancel");
    }
    resetApprovalEventTracking();
    loopRef.current?.kill();
    flushBufferedDelta();
    clearFlushTimer();
    useColonyStore.getState().finishRun(activeRunIdRef.current ?? undefined);
    useColonyStore.getState().setPendingCompactionStrategy(null);
    activeRunIdRef.current = null;
    useColonyStore.getState().addMessage("system", "Current operation cancelled.");
    if (runtimeRef.current) {
      void persistRuntimeState(runtimeRef.current);
    }
  }, [clearFlushTimer, flushBufferedDelta, persistRuntimeState, resolveApproval]);

  const resetSession = useCallback(() => {
    loopRef.current?.kill();
    flushBufferedDelta();
    clearFlushTimer();
    runtimeRef.current = buildRuntime();
    applyProviderSelection(runtimeRef.current, selectedProviderRef.current, selectedModelRef.current);
    providerHealthRef.current = {};
    failoverEventsRef.current = [];
    useColonyStore.getState().setProviderDiagnostics({}, []);
    useColonyStore.setState((current) => ({ ...current, recentHookEvents: [], recentCompactions: [] }));
    useColonyStore.getState().setLatestCompactionHandoff(null);
    useColonyStore.getState().setPendingCompactionStrategy(null);
    publishRuntime(runtimeRef.current);
    approvalResolverRef.current = null;
    resetApprovalEventTracking();
    useColonyStore.getState().setUsage({
      tokensUsed: 0,
      costUsd: 0,
      callCount: 0,
      deniedCount: 0,
    });
    useColonyStore.getState().setPendingApproval(null);
    useColonyStore.getState().setPendingCompactionStrategy(null);
    useColonyStore.getState().setSessionAllowRules([]);
    useColonyStore.getState().setContextUsage(null);
    useColonyStore.getState().setLastCompaction(null);
    useColonyStore.getState().setError(null);
    useColonyStore.getState().finishRun();
    activeRunIdRef.current = null;
    assistantMessageIdRef.current = null;
    bufferedDeltaRef.current = "";
    void persistRuntimeState(runtimeRef.current);
  }, [clearFlushTimer, flushBufferedDelta, persistRuntimeState, publishRuntime]);

  const resumeSession = useCallback(async (sessionId: string): Promise<void> => {
    const snapshot = await loadSessionRecovery(sessionId, {
      agentId: DEFAULT_AGENT_ID,
      caste: DEFAULT_CASTE,
    });
    if (!snapshot) {
      throw new Error(`No persisted session found for ${sessionId}.`);
    }

    loopRef.current?.kill();
    flushBufferedDelta();
    clearFlushTimer();
    approvalResolverRef.current = null;
    resetApprovalEventTracking();
    activeRunIdRef.current = null;
    assistantMessageIdRef.current = null;
    bufferedDeltaRef.current = "";

    const runtime = buildRuntime();
    applyProviderSelection(runtime, selectedProviderRef.current, selectedModelRef.current);
    runtime.session = snapshot.session;
    runtime.approvalPolicy.replaceRules(snapshot.sessionAllowRules);
    runtime.costTracker = CostTracker.fromSnapshot(
      snapshot.costTrackerSnapshot ?? {
        model: runtime.llmConfig.defaults.model ?? DEFAULT_LOCAL_MODEL,
        costBudgetUsd: snapshot.usage.maxUsd,
      },
    );
    runtime.costTracker.setCostBudgetUsd(snapshot.usage.maxUsd);
    runtimeRef.current = runtime;
    await runtime.memory.syncSession(snapshot.session);
    runtime.memory.primeSession(snapshot.session);
    providerHealthRef.current = Object.fromEntries(
      Object.entries(snapshot.providerHealth).map(([provider, health]) => [provider, { ...health }]),
    );
    failoverEventsRef.current = snapshot.recentFailovers.map((event) => ({ ...event }));
    useColonyStore.getState().setProviderDiagnostics(
      providerHealthRef.current,
      failoverEventsRef.current,
    );

    const current = useColonyStore.getState();
    useColonyStore.setState({
      ...current,
      messages: historyToLogMessages(snapshot.session.history, String(snapshot.session.caste)),
      logScrollOffset: 0,
      query: "",
      caste: snapshot.session.caste,
      provider: runtime.llmConfig.defaults.provider,
      model:
        runtime.llmConfig.defaults.model
        ?? runtime.llmConfig.providers[runtime.llmConfig.defaults.provider]?.defaultModel
        ?? DEFAULT_LOCAL_MODEL,
      isThinking: false,
      thinkingPhase: "",
      tokensUsed: snapshot.usage.tokensUsed,
      maxTokens: snapshot.usage.maxTokens,
      costUsd: snapshot.usage.costUsd,
      maxUsd: snapshot.usage.maxUsd,
      callCount: snapshot.usage.callCount,
      deniedCount: snapshot.usage.deniedCount,
      toolCount: runtime.activeToolIds.length,
      sessionId: snapshot.session.sessionId,
      agentId: snapshot.session.agentId,
      activeRunId: null,
      lastError: null,
      pendingApproval: null,
      pendingCompactionStrategy: null,
      sessionAllowRules: snapshot.sessionAllowRules,
      contextUsage: snapshot.contextUsage,
      lastCompactionFailure: snapshot.lastCompactionFailure,
      lastCompaction: snapshot.lastCompaction,
      recentHookEvents: snapshot.recentHookEvents.map((event) => ({ ...event })),
      recentCompactions: snapshot.recentCompactions.map((event) => ({ ...event })),
      latestCompactionHandoff: snapshot.latestCompactionHandoff ? { ...snapshot.latestCompactionHandoff } : null,
    });
    publishRuntime(runtime);
    useColonyStore.getState().setRuntimeStatus({
      circuitState: (providerHealthRef.current[selectedProviderRef.current]?.state as "closed" | "open" | "half_open" | undefined)
        ?? useColonyStore.getState().circuitState,
    });

    const interruption = detectSessionInterruption(snapshot.session.history);
    useColonyStore.getState().addMessage(
      interruption === "none" ? "system" : "error",
      `Resumed session ${sessionId}. ${interruptionSummary(interruption)}`,
    );
    await persistRuntimeState(runtime, {
      tokensUsed: snapshot.usage.tokensUsed,
      costUsd: snapshot.usage.costUsd,
      callCount: snapshot.usage.callCount,
      deniedCount: snapshot.usage.deniedCount,
      maxUsd: snapshot.usage.maxUsd,
      maxTokens: snapshot.usage.maxTokens,
      sessionAllowRules: snapshot.sessionAllowRules,
      contextUsage: snapshot.contextUsage,
      lastCompactionFailure: snapshot.lastCompactionFailure,
      lastCompaction: snapshot.lastCompaction,
    });
  }, [clearFlushTimer, flushBufferedDelta, persistRuntimeState, publishRuntime]);

  const loadSessionHistory = useCallback(async (
    sessionId: string,
    count: number,
  ): Promise<SessionHistoryExcerpt | null> => {
    return loadPersistedSessionHistoryExcerpt(sessionId, {
      agentId: DEFAULT_AGENT_ID,
      caste: DEFAULT_CASTE,
      limit: count,
    });
  }, []);

  const getPermissionSummary = useCallback(() => {
    const runtime = getRuntime();
    const allToolIds = runtime.registry.listTools().map((tool) => tool.toolId).sort();
    const permitted = runtime.permittedToolIds;
    const permittedSet = new Set(permitted);
    return {
      active: runtime.activeToolIds,
      permitted,
      denied: allToolIds.filter((toolId) => !permittedSet.has(toolId)),
    };
  }, [getRuntime]);

  const compactNow = useCallback(async (
    strategy: CompactionStrategy = "standard",
    announceQueuedStatus = true,
  ): Promise<CompactionResult | null> => {
    const runtime = getRuntime();
    const store = useColonyStore.getState();

    if (loopRef.current && activeRunIdRef.current) {
      if (store.pendingCompactionStrategy === strategy) {
        if (announceQueuedStatus) {
          store.addMessage("system", `Context ${strategy} compaction already queued. It will run before the next LLM call.`);
        }
        return null;
      }
      if (store.pendingCompactionStrategy === "reactive" && strategy !== "reactive") {
        if (announceQueuedStatus) {
          store.addMessage("system", "Reactive context compaction already queued. It will run before the next LLM call.");
        }
        return null;
      }
      loopRef.current.requestCompaction(strategy);
      store.setPendingCompactionStrategy(strategy);
      if (announceQueuedStatus) {
        store.addMessage(
          "system",
          strategy === "reactive"
            ? "Context compaction upgraded to reactive. It will run before the next LLM call."
            : "Context compaction requested. It will run before the next LLM call.",
        );
      }
      return null;
    }

    const loop = new AgentLoop({
      session: runtime.session,
      config: {
        providerName: selectedProviderRef.current,
        model: selectedModelRef.current,
      },
      costTracker: runtime.costTracker,
      approvalHandler: requestApproval,
      approvalPolicy: runtime.approvalPolicy,
      auditTrail: runtime.auditTrail,
      rateLimiter: runtime.rateLimiter,
      hooks: [recordRuntimeHook],
      onCompactionHandoff: captureCompactionHandoff,
      llmConfig: runtime.llmConfig,
    });

    const started = performance.now();
    try {
      const result = await loop.compactNow(strategy, true);
      captureLoopRuntimeHealth(loop);
      runtime.session = loop.session;
      store.setContextUsage(loop.contextSnapshot);
      store.setPendingCompactionStrategy(null);
      store.setLastCompaction(result);
      store.setLastCompactionFailure(null);
      recordCompactionEvent({
        strategy: result.strategyUsed,
        trigger: result.triggerSource,
        durationMs: Math.round(performance.now() - started),
        compacted: result.compacted,
        originalCount: result.originalCount,
        finalCount: result.finalCount,
        tokensSavedEstimate: result.tokensSavedEstimate,
        summaryLineCount: result.summaryLineCount,
        summarizedMessageCount: result.summarizedMessageCount,
      });
      store.addMessage("system", formatCompactionResult(result));
      await persistRuntimeState(runtime, {
        tokensUsed: loop.costTracker.totalTokens,
        costUsd: loop.costTracker.estimatedCostUsd,
        callCount: loop.costTracker.callCount,
        contextUsage: loop.contextSnapshot,
        lastCompactionFailure: null,
        lastCompaction: result,
      });
      return result;
    } catch (error) {
      if (loop.lastCompactionFailure) {
        store.setLastCompactionFailure(loop.lastCompactionFailure);
        recordCompactionEvent({
          strategy: loop.lastCompactionFailure.strategy,
          trigger: "manual",
          durationMs: Math.round(performance.now() - started),
          compacted: false,
          originalCount: runtime.session.history.length,
          finalCount: runtime.session.history.length,
          tokensSavedEstimate: 0,
          summaryLineCount: 0,
          summarizedMessageCount: 0,
          failureMessage: loop.lastCompactionFailure.message,
        });
      }
      throw error;
    }
  }, [captureCompactionHandoff, captureLoopRuntimeHealth, getRuntime, persistRuntimeState, recordCompactionEvent, recordRuntimeHook, requestApproval]);

  const submit = useCallback(async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const store = useColonyStore.getState();
    if (store.activeRunId) {
      store.addMessage("system", "A Colony run is already active. Use /cancel, Ctrl+C, or Esc before starting another.");
      return;
    }

    const startupBlockMessage = formatStartupBlockMessage(startupReportRef.current);
    if (startupBlockMessage) {
      store.setError(startupBlockMessage);
      store.addMessage("error", startupBlockMessage);
      return;
    }

    const runtime = getRuntime();
    const runId = store.startRun("The Colony is thinking...");
    activeRunIdRef.current = runId;
    assistantMessageIdRef.current = null;
    bufferedDeltaRef.current = "";
    resetApprovalEventTracking();
    store.setPendingCompactionStrategy(null);

    store.addMessage("user", trimmed);
    const memoryContext = await runtime.memory.buildMemoryContext(trimmed, runtime.session);

    const loop = new AgentLoop({
      session: runtime.session,
      config: {
        providerName: selectedProviderRef.current,
        model: selectedModelRef.current,
        costBudgetUsd: store.maxUsd,
      },
      costTracker: runtime.costTracker,
      toolExecutor: executeTool,
      toolSchemas: runtime.registry.toPromptSchema(runtime.activeToolIds),
      toolCategories: runtime.toolCategories,
      approvalHandler: requestApproval,
      approvalPolicy: runtime.approvalPolicy,
      auditTrail: runtime.auditTrail,
      rateLimiter: runtime.rateLimiter,
      hooks: [recordRuntimeHook],
      toolResultStorage: new ToolResultStorage({ sessionId: runtime.session.sessionId }),
      compactionEngine: new CompactionEngine({
        caste: runtime.session.caste,
        contextWindowTokens: store.maxTokens,
      }),
      contextTracker: new ContextWindowTracker({
        model: selectedModelRef.current,
        maxTokens: store.maxTokens,
      }),
      promptContext: buildLoopPromptContext({
        runtime,
        store,
        startupReport: startupReportRef.current,
        memoryContext,
      }),
      onCompactionHandoff: captureCompactionHandoff,
      onUpdate: (event) => {
        if (event.type === "approval_request") {
          handleApprovalRequestEvent(event.request);
          return;
        }
        if (event.type === "approval_resolved") {
          handleApprovalResolvedEvent(runtime, event.request, event.decision);
        }
      },
      llmConfig: runtime.llmConfig,
    });

    loopRef.current = loop;

    try {
      for await (const event of loop.runStreaming(trimmed)) {
        const currentStore = useColonyStore.getState();
        if (activeRunIdRef.current !== runId && currentStore.activeRunId !== runId) {
          loop.kill();
          break;
        }

        captureLoopRuntimeHealth(loop);

        switch (event.type) {
          case "status":
            currentStore.setUsage({
              tokensUsed: loop.costTracker.totalTokens,
              costUsd: loop.costTracker.estimatedCostUsd,
              callCount: loop.costTracker.callCount,
            });
            useColonyStore.setState({
              isThinking: true,
              thinkingPhase: statusLabel(event),
            });
            break;

          case "delta":
            if (!assistantMessageIdRef.current) {
              assistantMessageIdRef.current = currentStore.addMessage("assistant", "", {
                caste: String(runtime.session.caste),
              });
            }
            bufferedDeltaRef.current += event.content;
            ensureFlushTimer();
            break;

          case "tool_call":
            flushBufferedDelta();
            currentStore.addMessage(
              "tool",
              `requested ${event.name} ${formatToolArguments(event.arguments)}`,
              { toolName: event.name, toolArgs: { ...event.arguments } },
            );
            break;

          case "approval_request":
            handleApprovalRequestEvent(event.request);
            break;

          case "approval_resolved":
            handleApprovalResolvedEvent(runtime, event.request, event.decision);
            break;

          case "tool_result":
            flushBufferedDelta();
            currentStore.addMessage(event.isError ? "error" : "tool", event.output, {
              toolName: event.name,
              toolDurationMs: event.durationMs,
              externalizedResult: event.externalized ? { ...event.externalized } : null,
            });
            break;

          case "compaction":
            currentStore.setContextUsage(event.snapshot);
            currentStore.setPendingCompactionStrategy(null);
            currentStore.setLastCompaction(event.result);
            currentStore.setLastCompactionFailure(null);
            recordCompactionEvent({
              strategy: event.result.strategyUsed,
              trigger: event.result.triggerSource,
              durationMs: event.durationMs,
              compacted: event.result.compacted,
              originalCount: event.result.originalCount,
              finalCount: event.result.finalCount,
              tokensSavedEstimate: event.result.tokensSavedEstimate,
              summaryLineCount: event.result.summaryLineCount,
              summarizedMessageCount: event.result.summarizedMessageCount,
            });
            currentStore.addMessage("system", formatCompactionResult(event.result));
            break;

          case "context_warning":
            currentStore.setContextUsage(event.snapshot);
            break;

          case "cost":
            currentStore.setUsage({
              tokensUsed: loop.costTracker.totalTokens,
              costUsd: event.cost,
              callCount: loop.costTracker.callCount,
            });
            break;

          case "error": {
            flushBufferedDelta();
            const message = readableError(event.error, runtime.llmConfig);
            currentStore.setError(message);
            currentStore.addMessage("error", message);
            break;
          }

          case "complete":
            flushBufferedDelta();
            if (runtimeRef.current === runtime) {
              runtime.session = loop.session;
              currentStore.setSessionInfo({
                sessionId: runtime.session.sessionId,
                agentId: runtime.session.agentId,
                caste: runtime.session.caste,
              });
            }
            currentStore.setUsage({
              tokensUsed: event.result.totalTokens,
              costUsd: event.result.estimatedCostUsd,
              callCount: loop.costTracker.callCount,
            });
            currentStore.setContextUsage(event.result.contextSnapshot ?? loop.contextSnapshot);
            void persistRuntimeState(runtime, {
              tokensUsed: event.result.totalTokens,
              costUsd: event.result.estimatedCostUsd,
              callCount: loop.costTracker.callCount,
              deniedCount: currentStore.deniedCount,
              maxUsd: currentStore.maxUsd,
              maxTokens: currentStore.maxTokens,
              sessionAllowRules: runtime.approvalPolicy.listRules(),
              contextUsage: event.result.contextSnapshot ?? loop.contextSnapshot,
              lastCompactionFailure: currentStore.lastCompactionFailure,
              lastCompaction: loop.lastCompactionResult ?? currentStore.lastCompaction,
            });
            if (
              event.result.terminationReason !== "complete" &&
              event.result.terminationReason !== "kill_switch" &&
              event.result.error
            ) {
              const message = readableError(event.result.error, runtime.llmConfig);
              const latestStore = useColonyStore.getState();
              if (latestStore.lastError !== message) {
                latestStore.setError(message);
                latestStore.addMessage("error", message);
              }
            }
            break;
        }
      }
    } catch (e) {
      const message = readableError(e instanceof Error ? e.message : String(e), runtime.llmConfig);
      useColonyStore.getState().setError(message);
      useColonyStore.getState().addMessage("error", message);
    } finally {
      captureLoopRuntimeHealth(loop);
      flushBufferedDelta();
      clearFlushTimer();
      resetApprovalEventTracking();
      const runtimeStillCurrent = runtimeRef.current === runtime;
      if (runtimeStillCurrent) {
        runtime.session = loop.session;
        await runtime.memory.captureSession(runtime.session);
      }
      loopRef.current = null;
      const finalStore = useColonyStore.getState();
      finalStore.finishRun(runId);
      finalStore.setPendingApproval(null);
      finalStore.setPendingCompactionStrategy(null);
      finalStore.setSessionAllowRules(runtime.approvalPolicy.listRules());
      finalStore.setContextUsage(loop.contextSnapshot);
      if (loop.lastCompactionFailure) {
        const existingFailure = finalStore.lastCompactionFailure;
        if (
          existingFailure?.strategy !== loop.lastCompactionFailure.strategy
          || existingFailure?.message !== loop.lastCompactionFailure.message
        ) {
          finalStore.setLastCompactionFailure(loop.lastCompactionFailure);
          recordCompactionEvent({
            strategy: loop.lastCompactionFailure.strategy,
            trigger: "reactive_overflow",
            compacted: false,
            originalCount: loop.session.history.length,
            finalCount: loop.session.history.length,
            tokensSavedEstimate: 0,
            summaryLineCount: 0,
            summarizedMessageCount: 0,
            failureMessage: loop.lastCompactionFailure.message,
          });
        }
      }
      if (runtimeStillCurrent) {
        finalStore.setSessionInfo({
          sessionId: runtime.session.sessionId,
          agentId: runtime.session.agentId,
          caste: runtime.session.caste,
        });
        void persistRuntimeState(runtime, {
          tokensUsed: runtime.costTracker.totalTokens,
          costUsd: runtime.costTracker.estimatedCostUsd,
          callCount: runtime.costTracker.callCount,
          deniedCount: finalStore.deniedCount,
          maxUsd: finalStore.maxUsd,
          maxTokens: finalStore.maxTokens,
          sessionAllowRules: runtime.approvalPolicy.listRules(),
          contextUsage: loop.contextSnapshot,
          lastCompactionFailure: finalStore.lastCompactionFailure,
          lastCompaction: loop.lastCompactionResult ?? finalStore.lastCompaction,
        });
      }
      activeRunIdRef.current = null;
    }
  }, [captureCompactionHandoff, captureLoopRuntimeHealth, clearFlushTimer, ensureFlushTimer, executeTool, flushBufferedDelta, getRuntime, handleApprovalRequestEvent, handleApprovalResolvedEvent, persistRuntimeState, recordCompactionEvent, recordRuntimeHook, requestApproval, resetApprovalEventTracking]);

  useEffect(() => {
    getRuntime();
    void refreshPersistedSessions();
    let mounted = true;
    const runtime = getRuntime();
    void detectWorkspace()
      .then(async (workspace) => {
        if (!mounted) return;
        useColonyStore.getState().setWorkspaceInfo(workspace);
        const currentRuntime = getRuntime();
        const workspaceChanged = currentRuntime.workspaceRoot !== workspace.root;
        if (workspaceChanged) {
          rebindRuntimeWorkspace(currentRuntime, workspace.root);
          publishRuntime(currentRuntime);
          void persistRuntimeState(currentRuntime);
        }
        const report = await runStartupDiagnostics({
          llmConfig: currentRuntime.llmConfig,
          workspace,
          stdinIsTTY: process.stdin.isTTY,
          stdinSupportsRawMode: typeof process.stdin.setRawMode === "function",
          stdoutColumns: process.stdout.columns,
        });
        if (!mounted) return;
        startupReportRef.current = report;
        useColonyStore.getState().setStartupReport(report);
        if (report.errorCount > 0 || report.warningCount > 0) {
          useColonyStore.getState().addMessage(
            report.errorCount > 0 ? "error" : "system",
            formatStartupReport(report),
          );
        }
      })
      .catch(async () => {
        if (!mounted) return;
        useColonyStore.getState().setWorkspaceInfo(null);
        const report = await runStartupDiagnostics({
          llmConfig: runtime.llmConfig,
          workspace: null,
          stdinIsTTY: process.stdin.isTTY,
          stdinSupportsRawMode: typeof process.stdin.setRawMode === "function",
          stdoutColumns: process.stdout.columns,
        });
        if (!mounted) return;
        startupReportRef.current = report;
        useColonyStore.getState().setStartupReport(report);
        if (report.errorCount > 0 || report.warningCount > 0) {
          useColonyStore.getState().addMessage(
            report.errorCount > 0 ? "error" : "system",
            formatStartupReport(report),
          );
        }
      });
    return () => {
      mounted = false;
      loopRef.current?.kill();
      clearFlushTimer();
    };
  }, [clearFlushTimer, getRuntime, refreshPersistedSessions]);

  return {
    submit,
    cancel,
    resetSession,
    resumeSession,
    setProviderSelection,
    loadSessionHistory,
    compactNow,
    resolveApproval,
    getRuntimeSummary,
    getPermissionSummary,
  };
}
