/**
 * Agent runtime loop — the think→act→observe cycle.
 *
 * 1:1 port of colony/runtime/loop.py — the core execution engine that
 * transforms The Colony from a one-shot task dispatcher into an iterative
 * reasoning system.
 *
 * Each iteration:
 *   1. Check wall-clock budget and kill switch
 *   2. Build LLMMessage[] from session history
 *   3. Call the LLM via FailoverExecutor (with retry on transient errors)
 *   4. Track cumulative cost and token usage
 *   5. Parse tool calls from response
 *   6. Execute tools (read-only in parallel, mutations sequentially)
 *   7. Record results in session history
 *   8. Repeat until agent signals completion or a limit is reached
 */

import type { LLMMessage, LLMResponse, TokenUsage } from "../llm/models";
import { createLLMResponse } from "../llm/models";
import { CavemanBridge, type CavemanBridgeConfig } from "../llm/caveman-bridge";
import { FailoverExecutor } from "../llm/failover-executor";
import { llmUsageTracker, type LLMUsageTracker } from "../llm/usage";
import {
  LLMConnectionError,
  LLMRateLimitError,
  LLMResponseError,
} from "../llm/exceptions";
import { providerManager } from "../llm/provider-manager";
import type { ModelCandidate } from "../llm/selector";
import { ModelSelector, type LLMConfig } from "../llm/selector";
import type { FailoverEvent } from "../llm/failover-executor";
import type { TokenBucketRateLimiter } from "../llm/rate-limiter";
import { EffortResolver } from "../llm/effort-resolver";
import type { AgentSession } from "./session";
import { addMessage, recordIteration } from "./session";
import type { SerializedMessage } from "./message";
import {
  createUserMessage,
  createAssistantMessage,
  createToolResult as createRuntimeToolResult,
} from "./message";
import {
  PromptAssembler,
  type PromptFailoverSnapshot,
  type PromptRuntimeContext,
  type PromptSessionContext,
  type PromptStartupReport,
  type PromptWorkspaceContext,
} from "./prompt-assembler";
import {
  CompactionEngine,
  ContextWindowTracker,
  applyCompactionToSession,
  createCompactionConfig,
  type CompactionConfig,
  type CompactionResult,
  type CompactionResultInternal,
  type CompactionStrategy,
  type CompactionTrigger,
  type ContextWindowSnapshot,
  describeContextPressure,
  toPublicCompactionResult,
} from "./compaction";
import {
  type ApprovalEvaluation,
  ExactSessionApprovalPolicy,
  ToolApprovalService,
  type ApprovalDecision,
  formatDeniedToolResultMessage,
  type ApprovalRequest,
  type ApprovalResolver,
  type SessionApprovalPolicy,
} from "./approval";
import {
  ToolResultStorage,
  type PersistedToolResult,
} from "./tool-result-storage";
import { runtimeLogger, type StructuredLogger } from "./logger";
import { ToolPermissionChecker } from "./tool-permissions";
import type { SecurityAuditTrail } from "../security/audit-trail";
import type { SecurityPolicyEngine } from "../security/policy";

// ---------------------------------------------------------------------------
// Read-only tool categories for parallel execution
// ---------------------------------------------------------------------------

const READ_ONLY_CATEGORIES = new Set(["search", "read", "web"]);

// ---------------------------------------------------------------------------
// Retry error classification
// ---------------------------------------------------------------------------

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 529]);
const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404, 413, 422]);

function getStatusCode(exc: unknown): number | null {
  if (exc && typeof exc === "object") {
    if ("statusCode" in exc && typeof (exc as any).statusCode === "number")
      return (exc as any).statusCode;
    if ("status" in exc && typeof (exc as any).status === "number")
      return (exc as any).status;
  }
  return null;
}

function isContextLengthError(exc: unknown): boolean {
  const msg = String(exc).toLowerCase();
  return ["context_length", "context length", "too long", "maximum context", "token limit"]
    .some((k) => msg.includes(k));
}

function createCavemanBridge(config: LoopConfig["cavemanBridge"]): CavemanBridge | null {
  if (config === false) return null;
  if (config === true || config == null) return new CavemanBridge();
  return new CavemanBridge(config);
}

export function isRetryableError(exc: unknown): boolean {
  // Colony error hierarchy — definitive classification
  if (exc instanceof LLMConnectionError) return true;
  if (exc instanceof LLMRateLimitError) return true;
  if (exc instanceof LLMResponseError) return false;

  const status = getStatusCode(exc);
  const clsName = exc?.constructor?.name?.toLowerCase() ?? "";

  // Auth errors — never retry
  if (status === 401 || status === 403) return false;
  if (clsName.includes("authentication") || clsName.includes("permission")) return false;

  // Context-length errors — never retry
  if (isContextLengthError(exc)) return false;

  if (status != null) {
    if (NON_RETRYABLE_STATUS_CODES.has(status)) return false;
    if (RETRYABLE_STATUS_CODES.has(status)) return true;
    if (status >= 400 && status < 500) return false;
  }

  // Network errors
  const msgLower = String(exc).toLowerCase();
  if (msgLower.includes("connection refused") || msgLower.includes("econnrefused"))
    return false;
  if (msgLower.includes("cannot connect") && msgLower.includes("refused"))
    return false;

  if (exc instanceof Error) {
    if (exc.name === "TimeoutError" || exc.name === "AbortError") return true;
  }
  if (clsName.includes("timeout") || clsName.includes("network")) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Cost tracking
// ---------------------------------------------------------------------------

const INPUT_PRICE_PER_M: Record<string, number> = {
  "claude-opus-4-5": 15.0, "claude-opus-4": 15.0,
  "claude-sonnet-4-5-20250514": 3.0, "claude-sonnet-4-5": 3.0,
  "claude-sonnet-3-7": 3.0, "claude-sonnet-3-5": 3.0,
  "claude-haiku-3-5": 0.8, "claude-haiku-3": 0.25,
  "gpt-4o": 2.5, "gpt-4o-mini": 0.15, "gpt-4-turbo": 10.0,
  "gpt-4": 30.0, "gpt-3.5-turbo": 0.5,
  "o1": 15.0, "o1-mini": 3.0, "o3": 10.0, "o3-mini": 1.1,
  "gemini-2.5-pro": 1.25, "gemini-2.5-flash": 0.15,
  "gemini-2.0-flash": 0.1, "gemini-1.5-pro": 1.25,
  "gemini-1.5-flash": 0.075,
  "llama3.2": 0.0, "llama3.1": 0.0, "codellama": 0.0,
  "mistral": 0.0, "mixtral": 0.0, "phi3": 0.0, "gemma2": 0.0,
  "qwen2.5": 0.0, "deepseek-coder-v2": 0.0,
};

const OUTPUT_PRICE_PER_M: Record<string, number> = {
  "claude-opus-4-5": 75.0, "claude-opus-4": 75.0,
  "claude-sonnet-4-5-20250514": 15.0, "claude-sonnet-4-5": 15.0,
  "claude-sonnet-3-7": 15.0, "claude-sonnet-3-5": 15.0,
  "claude-haiku-3-5": 4.0, "claude-haiku-3": 1.25,
  "gpt-4o": 10.0, "gpt-4o-mini": 0.6, "gpt-4-turbo": 30.0,
  "gpt-4": 60.0, "gpt-3.5-turbo": 1.5,
  "o1": 60.0, "o1-mini": 12.0, "o3": 40.0, "o3-mini": 4.4,
  "gemini-2.5-pro": 10.0, "gemini-2.5-flash": 0.6,
  "gemini-2.0-flash": 0.4, "gemini-1.5-pro": 5.0,
  "gemini-1.5-flash": 0.3,
  "llama3.2": 0.0, "llama3.1": 0.0, "codellama": 0.0,
  "mistral": 0.0, "mixtral": 0.0, "phi3": 0.0, "gemma2": 0.0,
  "qwen2.5": 0.0, "deepseek-coder-v2": 0.0,
};

const FALLBACK_INPUT = 3.0;
const FALLBACK_OUTPUT = 15.0;

function bestMatchPrice(model: string, table: Record<string, number>, fallback: number): number {
  if (model in table) return table[model];
  for (const [key, price] of Object.entries(table)) {
    if (model.startsWith(key) || key.startsWith(model)) return price;
  }
  return fallback;
}

export class CostBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CostBudgetExceededError";
  }
}

export interface ModelUsageSummary {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  apiDurationS: number;
  callCount: number;
}

export class CostTracker {
  private _model: string;
  private _inputTokens = 0;
  private _outputTokens = 0;
  private _cacheReadTokens = 0;
  private _cacheCreationTokens = 0;
  private _costBudgetUsd: number | null;
  private _apiDurationS = 0;
  private _callCount = 0;
  private _modelUsage: Record<string, ModelUsageSummary> = {};

  static readonly CACHE_READ_MULT = 0.10;
  static readonly CACHE_CREATE_MULT = 1.25;

  constructor(model = "", costBudgetUsd: number | null = null) {
    this._model = model;
    this._costBudgetUsd = costBudgetUsd;
  }

  setCostBudgetUsd(costBudgetUsd: number | null): void {
    this._costBudgetUsd = costBudgetUsd;
  }

  track(usage: TokenUsage, model?: string, apiDurationS = 0): void {
    this._inputTokens += usage.promptTokens;
    this._outputTokens += usage.completionTokens;
    this._cacheReadTokens += usage.cacheReadTokens;
    this._cacheCreationTokens += usage.cacheWriteTokens;
    this._apiDurationS += apiDurationS;
    this._callCount++;
    if (model) this._model = model;

    const effectiveModel = model || this._model;
    if (effectiveModel) {
      const summary = this._modelUsage[effectiveModel] ?? {
        model: effectiveModel,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        apiDurationS: 0,
        callCount: 0,
      };
      summary.inputTokens += usage.promptTokens;
      summary.outputTokens += usage.completionTokens;
      summary.cacheReadTokens += usage.cacheReadTokens;
      summary.cacheCreationTokens += usage.cacheWriteTokens;
      summary.apiDurationS += apiDurationS;
      summary.callCount += 1;
      this._modelUsage[effectiveModel] = summary;
    }

    if (this._costBudgetUsd != null) {
      const current = this.estimatedCostUsd;
      if (current >= this._costBudgetUsd) {
        throw new CostBudgetExceededError(
          `Cost budget exceeded: $${current.toFixed(6)} >= $${this._costBudgetUsd.toFixed(6)}`,
        );
      }
    }
  }

  get totalInputTokens(): number { return this._inputTokens; }
  get totalOutputTokens(): number { return this._outputTokens; }
  get totalCacheReadTokens(): number { return this._cacheReadTokens; }
  get totalCacheCreationTokens(): number { return this._cacheCreationTokens; }
  get totalTokens(): number {
    return this._inputTokens + this._outputTokens + this._cacheReadTokens + this._cacheCreationTokens;
  }
  get callCount(): number { return this._callCount; }
  get apiDurationS(): number { return this._apiDurationS; }
  get modelUsage(): Record<string, ModelUsageSummary> {
    return Object.fromEntries(
      Object.entries(this._modelUsage).map(([model, usage]) => [model, { ...usage }]),
    );
  }

  get estimatedCostUsd(): number {
    const models = Object.values(this._modelUsage);
    if (models.length > 0) {
      const total = models.reduce((sum, usage) => {
        const inp = bestMatchPrice(usage.model, INPUT_PRICE_PER_M, FALLBACK_INPUT);
        const out = bestMatchPrice(usage.model, OUTPUT_PRICE_PER_M, FALLBACK_OUTPUT);
        return sum + (
          usage.inputTokens * inp +
          usage.outputTokens * out +
          usage.cacheReadTokens * inp * CostTracker.CACHE_READ_MULT +
          usage.cacheCreationTokens * inp * CostTracker.CACHE_CREATE_MULT
        ) / 1_000_000;
      }, 0);
      return Number(total.toFixed(8));
    }

    const inp = bestMatchPrice(this._model, INPUT_PRICE_PER_M, FALLBACK_INPUT);
    const out = bestMatchPrice(this._model, OUTPUT_PRICE_PER_M, FALLBACK_OUTPUT);
    return Number(((
      this._inputTokens * inp +
      this._outputTokens * out +
      this._cacheReadTokens * inp * CostTracker.CACHE_READ_MULT +
      this._cacheCreationTokens * inp * CostTracker.CACHE_CREATE_MULT
    ) / 1_000_000).toFixed(8));
  }

  formatSummary(): string {
    const lines = ["Session Cost Summary", "─".repeat(40)];
    const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
      n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);

    for (const [model, usage] of Object.entries(this._modelUsage).sort(([left], [right]) => left.localeCompare(right))) {
      const inp = bestMatchPrice(model, INPUT_PRICE_PER_M, FALLBACK_INPUT);
      const out = bestMatchPrice(model, OUTPUT_PRICE_PER_M, FALLBACK_OUTPUT);
      const cost = (
        usage.inputTokens * inp +
        usage.outputTokens * out +
        usage.cacheReadTokens * inp * CostTracker.CACHE_READ_MULT +
        usage.cacheCreationTokens * inp * CostTracker.CACHE_CREATE_MULT
      ) / 1_000_000;
      lines.push(
        `  ${model.padEnd(30)} ${fmt(usage.inputTokens).padStart(6)} in / ${fmt(usage.outputTokens).padStart(6)} out  ($${cost.toFixed(4)})`,
      );
    }

    if (Object.keys(this._modelUsage).length === 0) {
      const cost = this.estimatedCostUsd;
      lines.push(
        `  ${this._model.padEnd(30)} ${fmt(this._inputTokens).padStart(6)} in / ${fmt(this._outputTokens).padStart(6)} out  ($${cost.toFixed(4)})`,
      );
    }

    lines.push("─".repeat(40));
    lines.push(
      `  ${"Total".padEnd(30)} ${fmt(this._inputTokens).padStart(6)} in / ${fmt(this._outputTokens).padStart(6)} out  ($${this.estimatedCostUsd.toFixed(4)})`,
    );
    lines.push(`  API time: ${this._apiDurationS.toFixed(1)}s | Calls: ${this._callCount}`);
    return lines.join("\n");
  }

  toSnapshot(): Record<string, unknown> {
    return {
      model: this._model,
      inputTokens: this._inputTokens,
      outputTokens: this._outputTokens,
      cacheReadTokens: this._cacheReadTokens,
      cacheCreationTokens: this._cacheCreationTokens,
      apiDurationS: this._apiDurationS,
      costBudgetUsd: this._costBudgetUsd,
      callCount: this._callCount,
      modelUsage: Object.fromEntries(
        Object.entries(this._modelUsage).map(([model, usage]) => [model, { ...usage }]),
      ),
    };
  }

  static fromSnapshot(snap: Record<string, unknown>): CostTracker {
    const t = new CostTracker(
      String(snap.model ?? ""),
      snap.costBudgetUsd as number | null,
    );
    t._inputTokens = Number(snap.inputTokens ?? 0);
    t._outputTokens = Number(snap.outputTokens ?? 0);
    t._cacheReadTokens = Number(snap.cacheReadTokens ?? 0);
    t._cacheCreationTokens = Number(snap.cacheCreationTokens ?? 0);
    t._apiDurationS = Number(snap.apiDurationS ?? 0);
    t._callCount = Number(snap.callCount ?? 0);
    const rawModelUsage = snap.modelUsage;
    if (rawModelUsage && typeof rawModelUsage === "object" && !Array.isArray(rawModelUsage)) {
      for (const [model, usage] of Object.entries(rawModelUsage as Record<string, unknown>)) {
        if (!usage || typeof usage !== "object" || Array.isArray(usage)) continue;
        const record = usage as Record<string, unknown>;
        t._modelUsage[model] = {
          model: String(record.model ?? model),
          inputTokens: Number(record.inputTokens ?? 0),
          outputTokens: Number(record.outputTokens ?? 0),
          cacheReadTokens: Number(record.cacheReadTokens ?? 0),
          cacheCreationTokens: Number(record.cacheCreationTokens ?? 0),
          apiDurationS: Number(record.apiDurationS ?? 0),
          callCount: Number(record.callCount ?? 0),
        };
      }
    }
    return t;
  }
}

// ---------------------------------------------------------------------------
// Hook events
// ---------------------------------------------------------------------------

export interface HookEvent {
  kind: string;
  data: Record<string, unknown>;
}

export type HookCallback = (event: HookEvent) => Promise<void>;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface LoopConfig {
  maxIterations: number;
  timeoutSeconds: number;
  tenant?: string;
  providerName?: string;
  model?: string;
  temperature?: number;
  maxResponseTokens?: number;
  autoCompact: boolean;
  compactThresholdBuffer: number;
  maxRetries: number;
  retryBaseDelay: number;
  enableParallelTools: boolean;
  contextWindowTokens: number;
  costBudgetUsd?: number;
  cavemanBridge?: boolean | Partial<CavemanBridgeConfig>;
  compaction?: Partial<CompactionConfig>;
}

export const DEFAULT_LOOP_CONFIG: LoopConfig = {
  maxIterations: 20,
  timeoutSeconds: 300,
  autoCompact: true,
  compactThresholdBuffer: 13_000,
  maxRetries: 3,
  retryBaseDelay: 1.0,
  enableParallelTools: true,
  contextWindowTokens: 200_000,
  cavemanBridge: true,
};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type TerminationReason =
  | "complete"
  | "max_iterations"
  | "timeout"
  | "kill_switch"
  | "cost_exceeded"
  | "error";

export interface LoopResult {
  terminationReason: TerminationReason;
  iterations: number;
  totalTokens: number;
  estimatedCostUsd: number;
  finalContent: string;
  toolCallsExecuted: number;
  costSummary: string;
  contextSnapshot?: ContextWindowSnapshot;
  error?: string;
}

// ---------------------------------------------------------------------------
// Streaming events
// ---------------------------------------------------------------------------

export type LoopStreamEvent =
  | { type: "status"; status: string; iteration: number }
  | { type: "delta"; content: string }
  | { type: "tool_call"; id: string; name: string; arguments: Record<string, unknown> }
  | { type: "approval_request"; request: ApprovalRequest }
  | { type: "approval_resolved"; request: ApprovalRequest; decision: ApprovalDecision }
  | {
    type: "tool_result";
    name: string;
    output: string;
    isError: boolean;
    durationMs: number;
    externalized?: PersistedToolResult | null;
  }
  | { type: "compaction"; result: CompactionResult; snapshot: ContextWindowSnapshot; durationMs?: number }
  | { type: "context_warning"; snapshot: ContextWindowSnapshot }
  | { type: "cost"; tokens: number; cost: number }
  | { type: "error"; error: string }
  | { type: "complete"; result: LoopResult };

// ---------------------------------------------------------------------------
// Tool call types
// ---------------------------------------------------------------------------

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  name: string;
  output: string;
  isError: boolean;
  durationMs: number;
  externalized?: PersistedToolResult | null;
}

export type ToolExecutorFn = (call: ToolCall) => Promise<ToolResult>;

export interface LoopPromptContext {
  taskContext?: string;
  memoryContext?: string | null;
  workspace?: PromptWorkspaceContext | null;
  startupReport?: PromptStartupReport | null;
  runtime?: Partial<PromptRuntimeContext> | null;
}

export interface CompactionHandoff {
  sessionId: string;
  agentId: string;
  caste: string;
  result: CompactionResult;
  compactedMessages: SerializedMessage[];
}

// ---------------------------------------------------------------------------
// AgentLoop
// ---------------------------------------------------------------------------

export class AgentLoop {
  private _session: AgentSession;
  private _config: LoopConfig;
  private _costTracker: CostTracker;
  private _failoverExecutor: FailoverExecutor;
  private _selector: ModelSelector;
  private _toolExecutor: ToolExecutorFn | null;
  private _toolSchemas: Record<string, unknown>[];
  private _toolCategories: Map<string, string>;
  private _hooks: HookCallback[];
  private _approvalService: ToolApprovalService;
  private _approvalPolicy: SessionApprovalPolicy;
  private _toolResultStorage: ToolResultStorage;
  private _compactionEngine: CompactionEngine;
  private _contextTracker: ContextWindowTracker;
  private _logger: StructuredLogger;
  private _usageTracker: LLMUsageTracker | null;
  private _effortResolver: EffortResolver;
  private _promptContext: LoopPromptContext | null;
  private _manualCompactionStrategy: CompactionStrategy | null = null;
  private _lastContextSnapshot: ContextWindowSnapshot | null = null;
  private _lastCompactionResult: CompactionResult | null = null;
  private _lastCompactionFailure: { strategy: CompactionStrategy; message: string } | null = null;
  private _killSwitch = false;
  private _onUpdate?: (event: LoopUpdate) => void;
  private _onCompactionHandoff?: (handoff: CompactionHandoff) => Promise<void> | void;

  constructor(opts: {
    session: AgentSession;
    config?: Partial<LoopConfig>;
    costTracker?: CostTracker;
    toolExecutor?: ToolExecutorFn;
    toolSchemas?: Record<string, unknown>[];
    toolCategories?: Map<string, string>;
    approvalHandler?: ApprovalResolver | null;
    approvalPolicy?: SessionApprovalPolicy;
    permissionChecker?: ToolPermissionChecker;
    securityPolicy?: SecurityPolicyEngine;
    auditTrail?: SecurityAuditTrail;
    toolResultStorage?: ToolResultStorage;
    compactionEngine?: CompactionEngine;
    contextTracker?: ContextWindowTracker;
    logger?: StructuredLogger;
    usageTracker?: LLMUsageTracker | null;
    rateLimiter?: TokenBucketRateLimiter | null;
    effortResolver?: EffortResolver;
    promptContext?: LoopPromptContext | null;
    hooks?: HookCallback[];
    onUpdate?: (event: LoopUpdate) => void;
    onCompactionHandoff?: (handoff: CompactionHandoff) => Promise<void> | void;
    llmConfig?: LLMConfig;
  }) {
    this._session = opts.session;
    this._config = { ...DEFAULT_LOOP_CONFIG, ...opts.config };
    this._costTracker = opts.costTracker ?? new CostTracker(
      this._config.model ?? "llama3.2",
      this._config.costBudgetUsd ?? null,
    );
    this._costTracker.setCostBudgetUsd(this._config.costBudgetUsd ?? null);
    this._failoverExecutor = new FailoverExecutor(
      (name) => providerManager.getProvider(name),
      {
        rateLimiter: opts.rateLimiter ?? null,
        cavemanBridge: createCavemanBridge(this._config.cavemanBridge),
      },
    );
    this._selector = new ModelSelector(opts.llmConfig);
    this._toolExecutor = opts.toolExecutor ?? null;
    this._toolSchemas = opts.toolSchemas ?? [];
    this._toolCategories = opts.toolCategories ?? new Map();
    this._approvalPolicy = opts.approvalPolicy ?? new ExactSessionApprovalPolicy();
    this._logger = opts.logger ?? runtimeLogger;
    this._usageTracker = opts.usageTracker === undefined ? llmUsageTracker : opts.usageTracker;
    this._effortResolver = opts.effortResolver ?? new EffortResolver();
    this._promptContext = opts.promptContext ?? null;
    this._approvalService = new ToolApprovalService({
      checker: opts.permissionChecker ?? new ToolPermissionChecker(),
      securityPolicy: opts.securityPolicy,
      auditTrail: opts.auditTrail,
      resolver: opts.approvalHandler ?? null,
      policy: this._approvalPolicy,
      logger: this._logger,
    });
    this._toolResultStorage = opts.toolResultStorage ?? new ToolResultStorage({
      sessionId: this._session.sessionId,
    });
    const compactionConfig = createCompactionConfig({
      caste: this._session.caste,
      contextWindowTokens: this._config.contextWindowTokens,
      ...this._config.compaction,
    });
    this._compactionEngine = opts.compactionEngine ?? new CompactionEngine(compactionConfig);
    this._contextTracker = opts.contextTracker ?? new ContextWindowTracker({
      model: this._config.model,
      maxTokens: this._config.contextWindowTokens,
      triggerThreshold: compactionConfig.triggerThreshold,
    });
    this._hooks = opts.hooks ?? [];
    this._onUpdate = opts.onUpdate;
    this._onCompactionHandoff = opts.onCompactionHandoff;
  }

  /** Emergency stop. */
  kill(): void {
    this._killSwitch = true;
  }

  get session(): AgentSession {
    return this._session;
  }

  get costTracker(): CostTracker {
    return this._costTracker;
  }

  get contextSnapshot(): ContextWindowSnapshot {
    return this._snapshotContext();
  }

  get lastCompactionResult(): CompactionResult | null {
    return this._lastCompactionResult;
  }

  get lastCompactionFailure(): { strategy: CompactionStrategy; message: string } | null {
    return this._lastCompactionFailure;
  }

  get providerHealth(): Record<string, Record<string, unknown>> {
    return this._failoverExecutor.getProviderHealth();
  }

  get failoverEvents(): FailoverEvent[] {
    return this._failoverExecutor.failoverEvents;
  }

  get lastSuccessfulCandidate(): ModelCandidate | null {
    return this._failoverExecutor.lastSuccessfulCandidate;
  }

  get approvalPolicy(): SessionApprovalPolicy {
    return this._approvalPolicy;
  }

  requestCompaction(strategy: CompactionStrategy = "standard"): void {
    this._manualCompactionStrategy = strategy;
  }

  async compactNow(
    strategy: CompactionStrategy = "standard",
    force = true,
  ): Promise<CompactionResult> {
    return this._runCompaction(strategy, force, "manual");
  }

  // -- Main run() -----------------------------------------------------------

  async run(userInput: string): Promise<LoopResult> {
    const startTime = Date.now();
    let iterations = 0;
    let totalToolCalls = 0;
    let finalContent = "";

    // Add user message to session
    this._session = addMessage(this._session, createUserMessage(userInput));
    this._logger.info("loop_start", this._loopLogData({ inputLength: userInput.length }));

    this._emit({ type: "status", status: "thinking", iteration: 0 });

    try {
      while (iterations < this._config.maxIterations) {
        // 1. Check kill switch
        if (this._killSwitch) {
          return this._buildResult("kill_switch", iterations, totalToolCalls, finalContent);
        }

        // 2. Check timeout
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed >= this._config.timeoutSeconds) {
          return this._buildResult("timeout", iterations, totalToolCalls, finalContent);
        }

        iterations++;
        this._emit({ type: "status", status: "thinking", iteration: iterations });

        // 3. Compact/check context before building the LLM request
        await this._preflightContext();

        // 4. Get model candidates
        const candidates = this._selector.select({
          caste: String(this._session.caste),
        });

        // 5. Call LLM with failover
        let response: LLMResponse;
        const apiStart = Date.now();
        try {
          response = await this._callLlmWithReactiveCompact(candidates);
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          this._logger.error("llm_failure", this._loopLogData({ error: errMsg }), errMsg);
          this._emit({ type: "error", error: errMsg });
          return this._buildResult("error", iterations, totalToolCalls, finalContent, errMsg);
        }
        const apiDuration = (Date.now() - apiStart) / 1000;

        // 6. Track tokens and cost
        this._costTracker.track(response.usage, response.model, apiDuration);
        this._recordUsage(response.provider, response.model, response.usage);
        this._session = recordIteration(this._session, response.usage.totalTokens);

        this._emit({
          type: "cost",
          tokens: response.usage.totalTokens,
          cost: this._costTracker.estimatedCostUsd,
        });

        // 7. Parse tool calls from response
        const toolCalls = this._parseToolCalls(response);

        // 8. Record assistant message
        const assistantMsg = createAssistantMessage(response.content, {
          model: response.model,
          provider: response.provider,
          finishReason: response.finishReason,
          toolCalls: toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
          })),
          tokenUsage: {
            prompt: response.usage.promptTokens,
            completion: response.usage.completionTokens,
          },
        });
        this._session = addMessage(this._session, assistantMsg);

        finalContent = response.content;

        // 9. If no tool calls → done
        if (toolCalls.length === 0) {
          this._emit({ type: "content", content: response.content });
          return this._buildResult("complete", iterations, totalToolCalls, finalContent);
        }

        // 10. Execute tool calls
        this._emit({ type: "status", status: "tooling", iteration: iterations });
        const prepared = await this._prepareToolCalls(toolCalls);
        const approvedResults = await this._executeTools(prepared.approvedCalls);
        const results = [...prepared.immediateResults, ...approvedResults];
        totalToolCalls += results.length;

        // Record tool results in session
        for (const result of results) {
          this._session = addMessage(
            this._session,
            createRuntimeToolResult(
              result.callId,
              result.name,
              result.isError ? `Error: ${result.output}` : result.output,
              result.isError,
              result.durationMs,
            ),
          );

          this._emit({
            type: "tool_result",
            name: result.name,
            output: result.output.slice(0, 200),
            isError: result.isError,
            durationMs: result.durationMs,
            externalized: result.externalized ?? null,
          });
        }

        // Continue loop (next iteration builds on tool results)
      }

      // Max iterations reached
      return this._buildResult("max_iterations", iterations, totalToolCalls, finalContent);
    } catch (e) {
      if (e instanceof CostBudgetExceededError) {
        return this._buildResult("cost_exceeded", iterations, totalToolCalls, finalContent, e.message);
      }
      throw e;
    }
  }

  // -- Streaming run() ------------------------------------------------------

  async *runStreaming(userInput: string): AsyncGenerator<LoopStreamEvent> {
    const startTime = Date.now();
    let iterations = 0;
    let totalToolCalls = 0;
    let finalContent = "";

    this._session = addMessage(this._session, createUserMessage(userInput));

    this._emit({ type: "status", status: "thinking", iteration: 0 });
    yield { type: "status", status: "thinking", iteration: 0 };

    try {
      while (iterations < this._config.maxIterations) {
        if (this._killSwitch) {
          yield {
            type: "complete",
            result: this._buildResult("kill_switch", iterations, totalToolCalls, finalContent),
          };
          return;
        }

        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed >= this._config.timeoutSeconds) {
          yield {
            type: "complete",
            result: this._buildResult("timeout", iterations, totalToolCalls, finalContent),
          };
          return;
        }

        iterations++;
        this._emit({ type: "status", status: "thinking", iteration: iterations });
        yield { type: "status", status: "thinking", iteration: iterations };

        const preflightEvents = await this._preflightContext();
        for (const event of preflightEvents) yield event;

        let llmMessages = this._buildMessages();
        const candidates = this._selector.select({
          caste: String(this._session.caste),
        });

        let accumulatedContent = "";
        let modelName = "";
        let finishReason = "";
        let streamedToolCalls: Record<string, unknown>[] = [];
        const providerName = this._config.providerName ?? candidates[0]?.providerName ?? "default";
        let reactiveRetried = false;

        while (true) {
          try {
            const stream = this._failoverExecutor.stream(candidates, llmMessages, {
              temperature: this._config.temperature,
              maxTokens: this._config.maxResponseTokens,
              tools: this._toolSchemas.length > 0 ? this._toolSchemas : undefined,
              ...this._effortParamsFor(candidates),
            });

            for await (const chunk of stream) {
              if (this._killSwitch) {
                yield {
                  type: "complete",
                  result: this._buildResult("kill_switch", iterations, totalToolCalls, accumulatedContent),
                };
                return;
              }

              const currentElapsed = (Date.now() - startTime) / 1000;
              if (currentElapsed >= this._config.timeoutSeconds) {
                yield {
                  type: "complete",
                  result: this._buildResult("timeout", iterations, totalToolCalls, accumulatedContent),
                };
                return;
              }

              if (chunk.delta) {
                accumulatedContent += chunk.delta;
                this._emit({ type: "content", content: chunk.delta });
                yield { type: "delta", content: chunk.delta };
              }
              if (chunk.toolCalls?.length) streamedToolCalls = chunk.toolCalls;
              if (chunk.model) modelName = chunk.model;
              if (chunk.finishReason) finishReason = chunk.finishReason;
            }
            break;
          } catch (e) {
            if (!reactiveRetried && isContextLengthError(e)) {
              reactiveRetried = true;
              const result = await this._runCompaction("reactive", true, "reactive_overflow");
              const snapshot = this._snapshotContext();
              yield { type: "compaction", result, snapshot };
              llmMessages = this._buildMessages();
              accumulatedContent = "";
              streamedToolCalls = [];
              continue;
            }

            const errMsg = e instanceof Error ? e.message : String(e);
            this._logger.error("llm_failure", this._loopLogData({ error: errMsg }), errMsg);
            this._emit({ type: "error", error: errMsg });
            yield { type: "error", error: errMsg };
            yield {
              type: "complete",
              result: this._buildResult("error", iterations, totalToolCalls, finalContent, errMsg),
            };
            return;
          }
        }

        const estimatedInput = Math.floor(
          llmMessages.reduce((total, msg) => total + (msg.content?.length ?? 0), 0) / 4,
        );
        const estimatedOutput = Math.floor(accumulatedContent.length / 4);
        const usage: TokenUsage = {
          promptTokens: estimatedInput,
          completionTokens: estimatedOutput,
          totalTokens: estimatedInput + estimatedOutput,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        };

        this._costTracker.track(
          usage,
          modelName || this._config.model || candidates[0]?.modelId,
          (Date.now() - startTime) / 1000,
        );
        this._recordUsage(
          providerName,
          modelName || this._config.model || candidates[0]?.modelId || "",
          usage,
        );
        this._session = recordIteration(this._session, usage.totalTokens);

        this._emit({
          type: "cost",
          tokens: usage.totalTokens,
          cost: this._costTracker.estimatedCostUsd,
        });
        yield {
          type: "cost",
          tokens: usage.totalTokens,
          cost: this._costTracker.estimatedCostUsd,
        };

        const response = createLLMResponse(
          accumulatedContent,
          modelName || this._config.model || candidates[0]?.modelId || "",
          providerName,
          {
            usage,
            finishReason,
            rawResponse: streamedToolCalls.length > 0
              ? { tool_calls: streamedToolCalls }
              : {},
          },
        );
        const toolCalls = this._parseToolCalls(response);

        const assistantMsg = createAssistantMessage(accumulatedContent, {
          model: response.model,
          provider: response.provider,
          finishReason: response.finishReason,
          toolCalls: toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
          })),
          tokenUsage: {
            prompt: response.usage.promptTokens,
            completion: response.usage.completionTokens,
          },
          iteration: iterations,
        });
        this._session = addMessage(this._session, assistantMsg);
        finalContent = accumulatedContent;

        if (toolCalls.length === 0) {
          yield {
            type: "complete",
            result: this._buildResult("complete", iterations, totalToolCalls, finalContent),
          };
          return;
        }

        this._emit({ type: "status", status: "tooling", iteration: iterations });
        yield { type: "status", status: "tooling", iteration: iterations };

        for (const call of toolCalls) {
          yield {
            type: "tool_call",
            id: call.id,
            name: call.name,
            arguments: call.arguments,
          };
        }

        const prepared = await this._prepareToolCalls(toolCalls);
        for (const event of prepared.events) yield event;
        const approvedResults = await this._executeTools(prepared.approvedCalls);
        const results = [...prepared.immediateResults, ...approvedResults];
        totalToolCalls += results.length;

        for (const result of results) {
          this._session = addMessage(
            this._session,
            createRuntimeToolResult(
              result.callId,
              result.name,
              result.isError ? `Error: ${result.output}` : result.output,
              result.isError,
              result.durationMs,
            ),
          );

          this._emit({
            type: "tool_result",
            name: result.name,
            output: result.output.slice(0, 200),
            isError: result.isError,
            durationMs: result.durationMs,
            externalized: result.externalized ?? null,
          });
          yield {
            type: "tool_result",
            name: result.name,
            output: result.output.slice(0, 500),
            isError: result.isError,
            durationMs: result.durationMs,
            externalized: result.externalized ?? null,
          };
        }
      }

      yield {
        type: "complete",
        result: this._buildResult("max_iterations", iterations, totalToolCalls, finalContent),
      };
    } catch (e) {
      const reason: TerminationReason = e instanceof CostBudgetExceededError
        ? "cost_exceeded"
        : "error";
      const errMsg = e instanceof Error ? e.message : String(e);
      this._emit({ type: "error", error: errMsg });
      yield { type: "error", error: errMsg };
      yield {
        type: "complete",
        result: this._buildResult(reason, iterations, totalToolCalls, finalContent, errMsg),
      };
    }
  }

  // -- LLM call with retry --------------------------------------------------

  private async _callLlmWithRetry(
    candidates: ModelCandidate[],
    messages: LLMMessage[],
  ): Promise<LLMResponse> {
    return this._failoverExecutor.complete(candidates, messages, {
      temperature: this._config.temperature,
      maxTokens: this._config.maxResponseTokens,
      tools: this._toolSchemas.length > 0 ? this._toolSchemas : undefined,
      ...this._effortParamsFor(candidates),
    });
  }

  private _effortParamsFor(candidates: ModelCandidate[]): Record<string, unknown> {
    const primary = candidates[0];
    if (!primary) return {};
    const level = this._effortResolver.resolve({
      agentId: this._session.agentId,
      caste: String(this._session.caste),
      modelId: primary.modelId,
    });
    return this._effortResolver.toApiParams(level, primary.modelId);
  }

  private async _callLlmWithReactiveCompact(
    candidates: ModelCandidate[],
  ): Promise<LLMResponse> {
    let reactiveRetried = false;

    while (true) {
      try {
        return await this._callLlmWithRetry(candidates, this._buildMessages());
      } catch (e) {
        if (!reactiveRetried && isContextLengthError(e)) {
          reactiveRetried = true;
          await this._runCompaction("reactive", true, "reactive_overflow");
          continue;
        }
        throw e;
      }
    }
  }

  // -- Context window and compaction ---------------------------------------

  private _snapshotContext(): ContextWindowSnapshot {
    const snapshot = this._contextTracker.snapshot(this._session.history);
    this._lastContextSnapshot = snapshot;
    this._emit({ type: "context", snapshot });
    return snapshot;
  }

  private async _preflightContext(): Promise<LoopStreamEvent[]> {
    const events: LoopStreamEvent[] = [];
    const snapshot = this._snapshotContext();

    if (snapshot.isAboveWarningThreshold) {
      const event: LoopStreamEvent = { type: "context_warning", snapshot };
      events.push(event);
      this._logger.warn("context_warning", this._loopLogData({
        usedTokens: snapshot.usedTokens,
        maxTokens: snapshot.maxTokens,
        percentUsed: snapshot.percentUsed,
      }));
    }

    const manualStrategy = this._manualCompactionStrategy;
    this._manualCompactionStrategy = null;
    const shouldCompact =
      Boolean(manualStrategy) ||
      (this._config.autoCompact && snapshot.isAboveAutoCompactThreshold);

    if (shouldCompact) {
      const strategy = manualStrategy ?? "standard";
      const result = await this._runCompaction(
        strategy,
        Boolean(manualStrategy),
        manualStrategy ? "manual" : "auto_threshold",
      );
      const after = this._snapshotContext();
      if (result.compacted || manualStrategy) {
        events.push({ type: "compaction", result, snapshot: after });
      }
    }

    return events;
  }

  private async _runCompaction(
    strategy: CompactionStrategy,
    force: boolean,
    triggerSource: CompactionTrigger,
  ): Promise<CompactionResult> {
    const before = this._snapshotContext();
    const started = Date.now();
    try {
      await this._fireHook("PreCompact", {
        strategy,
        force,
        usedTokens: before.usedTokens,
      });
      const internalResult = await this._compactionEngine.compact(this._session.history, {
        strategy,
        currentUsageFraction: before.percentUsed / 100,
        force,
        triggerSource,
      });
      const result = toPublicCompactionResult(internalResult);
      await this._emitCompactionHandoff(result, internalResult);
      this._session = applyCompactionToSession(this._session, result);
      this._lastCompactionResult = result;
      this._lastCompactionFailure = null;
      if (result.compacted) this._contextTracker.recordCompactionSuccess();

      const durationMs = Date.now() - started;
      await this._fireHook("PostCompact", {
        strategy,
        compacted: result.compacted,
        tokensSavedEstimate: result.tokensSavedEstimate,
        durationMs,
      });
      this._logger.info("compaction", this._loopLogData({
        strategy,
        compacted: result.compacted,
        originalCount: result.originalCount,
        finalCount: result.finalCount,
        tokensSavedEstimate: result.tokensSavedEstimate,
      }));
      this._emit({ type: "compaction", result, snapshot: this._snapshotContext(), durationMs });
      return result;
    } catch (e) {
      this._contextTracker.recordCompactionFailure();
      const message = e instanceof Error ? e.message : String(e);
      this._lastCompactionFailure = { strategy, message };
      this._logger.error("compaction_failed", this._loopLogData({ strategy, error: message }), message);
      throw e;
    }
  }

  private async _emitCompactionHandoff(
    result: CompactionResult,
    internalResult: CompactionResultInternal,
  ): Promise<void> {
    if (!result.compacted || internalResult.compactedMessages.length === 0 || !this._onCompactionHandoff) {
      return;
    }

    try {
      await Promise.resolve(this._onCompactionHandoff({
        sessionId: this._session.sessionId,
        agentId: this._session.agentId,
        caste: String(this._session.caste),
        result,
        compactedMessages: internalResult.compactedMessages.map((message) => ({ ...message })),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._logger.error(
        "compaction_handoff_failed",
        this._loopLogData({
          strategy: result.strategyUsed,
          triggerSource: result.triggerSource,
          error: message,
        }),
        message,
      );
    }
  }

  // -- Message building -----------------------------------------------------

  private _buildMessages(): LLMMessage[] {
    const snapshot = this._lastContextSnapshot ?? this._contextTracker.snapshot(this._session.history);
    const runtimeContext = this._buildPromptRuntimeContext(snapshot);
    const sessionContext = this._buildPromptSessionContext();

    const prompt = new PromptAssembler({
      caste: sessionContext.caste,
      providerType: runtimeContext.provider ?? "openai_compatible",
      contextWindowTokens: this._config.contextWindowTokens,
      responseReserveTokens: this._config.maxResponseTokens ?? 4096,
    }).assemble({
      conversationHistory: this._session.history,
      toolSchemas: this._toolSchemas,
      memoryContext: this._promptContext?.memoryContext ?? undefined,
      taskContext: this._promptContext?.taskContext,
      workspaceContext: this._promptContext?.workspace ?? null,
      startupReport: this._promptContext?.startupReport ?? null,
      runtimeContext,
      sessionContext,
      agentId: this._session.agentId,
    });

    return prompt.messages.map((message) => {
      if (!message.toolCalls?.length) return message;
      return {
        ...message,
        toolCalls: message.toolCalls.map((tc) => {
          if ("function" in tc) return tc;
          return {
            id: String(tc.id ?? ""),
            type: "function",
            function: {
              name: String(tc.name ?? ""),
              arguments: JSON.stringify(tc.arguments ?? {}),
            },
          };
        }),
      };
    });
  }

  private _buildPromptRuntimeContext(snapshot: ContextWindowSnapshot): PromptRuntimeContext {
    const selectorConfig = this._selector.config;
    const base = this._promptContext?.runtime ?? null;
    const liveHealth = this._failoverExecutor.getProviderHealth();
    const mergedHealth = {
      ...(base?.providerHealth ?? {}),
      ...liveHealth,
    };
    const mergedFailovers = this._mergePromptFailovers(
      base?.recentFailovers ?? [],
      this._failoverExecutor.failoverEvents,
    );
    const lastSuccessful = this._failoverExecutor.lastSuccessfulCandidate;
    const activeToolIds = base?.activeToolIds?.length
      ? [...base.activeToolIds]
      : this._toolSchemaNames();
    const permittedToolIds = base?.permittedToolIds?.length
      ? [...base.permittedToolIds]
      : activeToolIds;
    const resolvedProvider =
      lastSuccessful?.providerName
      ?? base?.provider
      ?? this._config.providerName
      ?? selectorConfig.defaults.provider
      ?? "unknown";
    const resolvedModel =
      lastSuccessful?.modelId
      ?? base?.model
      ?? this._config.model
      ?? selectorConfig.defaults.model
      ?? selectorConfig.providers[selectorConfig.defaults.provider]?.defaultModel
      ?? "unknown";
    const resolvedCircuit =
      base?.circuitState
      ?? (typeof mergedHealth[resolvedProvider]?.state === "string"
        ? String(mergedHealth[resolvedProvider]?.state)
        : undefined);

    return {
      provider: resolvedProvider,
      model: resolvedModel,
      selectedProvider:
        typeof base?.selectedProvider === "string"
          ? base.selectedProvider
          : resolvedProvider,
      selectedModel:
        typeof base?.selectedModel === "string"
          ? base.selectedModel
          : resolvedModel,
      circuitState: resolvedCircuit,
      availableProviders:
        base?.availableProviders?.length
          ? [...base.availableProviders]
          : this._selector.getConfiguredProviders(),
      failover: base?.failover
        ? Object.fromEntries(
            Object.entries(base.failover).map(([provider, chain]) => [provider, [...chain]]),
          )
        : Object.fromEntries(
            Object.entries(selectorConfig.failover ?? {}).map(([provider, chain]) => [provider, [...chain]]),
          ),
      providerHealth: mergedHealth,
      recentFailovers: mergedFailovers,
      recentToolActivity:
        base?.recentToolActivity?.length
          ? base.recentToolActivity.map((activity) => ({ ...activity }))
          : undefined,
      recentHookEvents:
        base?.recentHookEvents?.length
          ? base.recentHookEvents.map((event) => ({ ...event }))
          : undefined,
      activeToolIds,
      activeToolCount: activeToolIds.length,
      permittedToolIds,
      permittedToolCount: permittedToolIds.length,
      pendingApproval:
        typeof base?.pendingApproval === "boolean"
          ? base.pendingApproval
          : false,
      pendingApprovalToolName:
        typeof base?.pendingApprovalToolName === "string"
          ? base.pendingApprovalToolName
          : undefined,
      pendingApprovalRiskLevel:
        base?.pendingApprovalRiskLevel === "low"
        || base?.pendingApprovalRiskLevel === "medium"
        || base?.pendingApprovalRiskLevel === "high"
          ? base.pendingApprovalRiskLevel
          : undefined,
      pendingApprovalCategory:
        typeof base?.pendingApprovalCategory === "string"
          ? base.pendingApprovalCategory
          : undefined,
      pendingApprovalSummary:
        typeof base?.pendingApprovalSummary === "string"
          ? base.pendingApprovalSummary
          : undefined,
      pendingApprovalSignature:
        typeof base?.pendingApprovalSignature === "string"
          ? base.pendingApprovalSignature
          : undefined,
      pendingApprovalReason:
        typeof base?.pendingApprovalReason === "string"
          ? base.pendingApprovalReason
          : undefined,
      pendingApprovalWarningCount:
        typeof base?.pendingApprovalWarningCount === "number"
          ? base.pendingApprovalWarningCount
          : undefined,
      sessionRuleCount:
        typeof base?.sessionRuleCount === "number"
          ? base.sessionRuleCount
          : this._approvalPolicy.listRules().length,
      sessionRules:
        base?.sessionRules?.length
          ? [...base.sessionRules]
          : this._approvalPolicy.listRules(),
      budgetUsd:
        typeof base?.budgetUsd === "number"
          ? base.budgetUsd
          : this._config.costBudgetUsd ?? null,
      budgetSpentUsd:
        typeof base?.budgetSpentUsd === "number"
          ? base.budgetSpentUsd
          : this._costTracker.estimatedCostUsd,
      budgetRemainingUsd:
        typeof base?.budgetRemainingUsd === "number"
        || base?.budgetRemainingUsd === null
          ? base.budgetRemainingUsd
          : typeof this._config.costBudgetUsd === "number"
            ? Math.max(this._config.costBudgetUsd - this._costTracker.estimatedCostUsd, 0)
            : null,
      contextUsedTokens: snapshot.usedTokens,
      contextMaxTokens: snapshot.maxTokens,
      contextRemainingTokens: snapshot.remainingTokens,
      contextPercentUsed: snapshot.percentUsed,
      contextPressure: describeContextPressure(snapshot),
      compactionFailureCount: snapshot.compactionFailureCount,
      lastCompactionFailureStrategy:
        this._lastCompactionFailure?.strategy
        ?? base?.lastCompactionFailureStrategy,
      lastCompactionFailureMessage:
        this._lastCompactionFailure?.message
        ?? base?.lastCompactionFailureMessage,
      lastCompactionStrategy:
        this._lastCompactionResult?.strategyUsed
        ?? base?.lastCompactionStrategy,
      lastCompactionTrigger:
        this._lastCompactionResult?.triggerSource
        ?? base?.lastCompactionTrigger,
      lastCompactionSavedTokens:
        this._lastCompactionResult?.tokensSavedEstimate
        ?? base?.lastCompactionSavedTokens,
      lastCompactionSummaryLineCount:
        this._lastCompactionResult?.summaryLineCount
        ?? base?.lastCompactionSummaryLineCount,
      lastCompactionSummarizedMessages:
        this._lastCompactionResult?.summarizedMessageCount
        ?? base?.lastCompactionSummarizedMessages,
      lastCompactionPreservedRecentCount:
        this._lastCompactionResult?.preservedRecentCount
        ?? base?.lastCompactionPreservedRecentCount,
      lastCompactionPreservedSystemCount:
        this._lastCompactionResult?.preservedSystemCount
        ?? base?.lastCompactionPreservedSystemCount,
      startupErrors:
        typeof base?.startupErrors === "number"
          ? base.startupErrors
          : this._promptContext?.startupReport?.errorCount ?? 0,
      startupWarnings:
        typeof base?.startupWarnings === "number"
          ? base.startupWarnings
          : this._promptContext?.startupReport?.warningCount ?? 0,
    };
  }

  private _buildPromptSessionContext(): PromptSessionContext {
    return {
      sessionId: this._session.sessionId,
      agentId: this._session.agentId,
      caste: String(this._session.caste),
      state: String(this._session.state),
      messageCount: this._session.history.length,
      totalIterations: this._session.totalIterations,
      totalTokensUsed: this._session.totalTokensUsed,
    };
  }

  private _toolSchemaNames(): string[] {
    return this._toolSchemas
      .map((schema) => {
        const fn = typeof schema.function === "object" && schema.function !== null
          ? schema.function
          : schema;
        return String((fn as Record<string, unknown>).name ?? "");
      })
      .filter(Boolean)
      .sort();
  }

  private _mergePromptFailovers(
    base: PromptFailoverSnapshot[],
    live: FailoverEvent[],
  ): PromptFailoverSnapshot[] {
    const merged = [...base, ...live]
      .filter((event) => event != null)
      .sort((left, right) => (left.timestamp ?? 0) - (right.timestamp ?? 0));
    if (merged.length <= 5) return merged;
    return merged.slice(-5);
  }

  // -- Tool call parsing ----------------------------------------------------

  private _parseToolCalls(response: LLMResponse): ToolCall[] {
    if (!response.rawResponse?.tool_calls) return [];

    const rawCalls = response.rawResponse.tool_calls as Record<string, unknown>[];
    return rawCalls.map((tc) => {
      const fn = (tc.function ?? {}) as Record<string, unknown>;
      let args: Record<string, unknown> = {};
      try {
        const argStr = String(fn.arguments ?? "{}");
        args = JSON.parse(argStr);
      } catch {
        args = {};
      }
      return {
        id: String(tc.id ?? `call_${Date.now()}`),
        name: String(fn.name ?? ""),
        arguments: args,
      };
    });
  }

  // -- Tool approval --------------------------------------------------------

  private async _prepareToolCalls(calls: ToolCall[]): Promise<{
    approvedCalls: ToolCall[];
    immediateResults: ToolResult[];
    events: LoopStreamEvent[];
  }> {
    const approvedCalls: ToolCall[] = [];
    const immediateResults: ToolResult[] = [];
    const events: LoopStreamEvent[] = [];

    if (!this._toolExecutor) {
      return {
        approvedCalls,
        immediateResults: calls.map((tc) => ({
          callId: tc.id,
          name: tc.name,
          output: `Tool '${tc.name}' not available (no executor registered)`,
          isError: true,
          durationMs: 0,
        })),
        events,
      };
    }

    for (const call of calls) {
      const category = this._toolCategories.get(call.name) ?? "";
      const context = {
        sessionId: this._session.sessionId,
        agentId: this._session.agentId,
        caste: String(this._session.caste),
        category,
      };
      const request = this._approvalService.createRequest(call, context);

      events.push({ type: "approval_request", request });
      this._emit({ type: "approval_request", request });

      const evaluation = await this._approvalService.evaluate(call, context, request);

      events.push({
        type: "approval_resolved",
        request: evaluation.request,
        decision: evaluation.decision,
      });
      this._emit({
        type: "approval_resolved",
        request: evaluation.request,
        decision: evaluation.decision,
      });

      if (evaluation.approved) {
        approvedCalls.push({ ...call, arguments: evaluation.arguments });
        continue;
      }

      if (evaluation.decision.scope === "cancel") {
        this._killSwitch = true;
      }

      immediateResults.push({
        callId: call.id,
        name: call.name,
        output: formatDeniedToolResultMessage(evaluation),
        isError: true,
        durationMs: 0,
      });
    }

    return { approvedCalls, immediateResults, events };
  }

  // -- Tool execution -------------------------------------------------------

  private async _executeTools(calls: ToolCall[]): Promise<ToolResult[]> {
    if (!this._toolExecutor) {
      return calls.map((tc) => ({
        callId: tc.id,
        name: tc.name,
        output: `Tool '${tc.name}' not available (no executor registered)`,
        isError: true,
        durationMs: 0,
      }));
    }

    // Classify for parallel/sequential execution
    if (this._config.enableParallelTools) {
      const readOnly: ToolCall[] = [];
      const mutating: ToolCall[] = [];

      for (const call of calls) {
        const category = this._toolCategories.get(call.name) ?? "";
        if (READ_ONLY_CATEGORIES.has(category)) {
          readOnly.push(call);
        } else {
          mutating.push(call);
        }
      }

      const results: ToolResult[] = [];

      // Execute read-only calls in parallel
      if (readOnly.length > 0) {
        const parallelResults = await Promise.all(
          readOnly.map((tc) => this._executeSingleTool(tc)),
        );
        results.push(...parallelResults);
      }

      // Execute mutating calls sequentially
      for (const call of mutating) {
        results.push(await this._executeSingleTool(call));
      }

      return results;
    }

    // Sequential fallback
    const results: ToolResult[] = [];
    for (const call of calls) {
      results.push(await this._executeSingleTool(call));
    }
    return results;
  }

  private async _executeSingleTool(call: ToolCall): Promise<ToolResult> {
    const start = Date.now();
    try {
      await this._fireHook("PreToolUse", { toolName: call.name, args: call.arguments });
      const rawResult = await this._toolExecutor!(call);
      const result = await this._externalizeToolResult(rawResult);
      await this._fireHook("PostToolUse", {
        toolName: call.name,
        result: result.output.slice(0, 100),
        durationMs: result.durationMs,
      });
      this._logger.info("tool_execution", this._loopLogData({
        toolName: call.name,
        isError: result.isError,
        durationMs: result.durationMs,
        externalized: Boolean(result.externalized),
      }));
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this._logger.error("tool_execution_failed", this._loopLogData({
        toolName: call.name,
        error: message,
      }), message);
      return {
        callId: call.id,
        name: call.name,
        output: `Tool execution error: ${e}`,
        isError: true,
        durationMs: Date.now() - start,
      };
    }
  }

  private async _externalizeToolResult(result: ToolResult): Promise<ToolResult> {
    const externalized = await this._toolResultStorage.externalizeIfNeeded(
      result.name,
      result.callId,
      result.output,
    );
    if (!externalized.persisted) return result;

    this._logger.info("tool_result_externalized", this._loopLogData({
      toolName: result.name,
      toolCallId: result.callId,
      filepath: externalized.persisted.filepath,
      originalSize: externalized.persisted.originalSize,
    }));

    return {
      ...result,
      output: externalized.content,
      externalized: externalized.persisted,
    };
  }

  // -- Hooks ----------------------------------------------------------------

  private async _fireHook(kind: string, data: Record<string, unknown> = {}): Promise<void> {
    for (const hook of this._hooks) {
      try {
        await hook({ kind, data });
      } catch {
        // Hook failures should not break the loop
      }
    }
  }

  // -- Update emission ------------------------------------------------------

  private _emit(update: LoopUpdate): void {
    this._onUpdate?.(update);
  }

  private _loopLogData(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      sessionId: this._session.sessionId,
      agentId: this._session.agentId,
      caste: String(this._session.caste),
      ...extra,
    };
  }

  private _recordUsage(provider: string, model: string, usage: TokenUsage): void {
    if (!this._usageTracker) return;
    this._usageTracker.record({
      tenant: this._config.tenant ?? "default",
      caste: String(this._session.caste),
      provider: provider || "unknown",
      model: model || "unknown",
      usage,
    });
  }

  // -- Result builder -------------------------------------------------------

  private _buildResult(
    reason: TerminationReason,
    iterations: number,
    toolCalls: number,
    content: string,
    error?: string,
  ): LoopResult {
    return {
      terminationReason: reason,
      iterations,
      totalTokens: this._costTracker.totalTokens,
      estimatedCostUsd: this._costTracker.estimatedCostUsd,
      finalContent: content,
      toolCallsExecuted: toolCalls,
      costSummary: this._costTracker.formatSummary(),
      contextSnapshot: this._lastContextSnapshot ?? this._snapshotContext(),
      error,
    };
  }
}

// ---------------------------------------------------------------------------
// Loop update events (for UI integration)
// ---------------------------------------------------------------------------

export type LoopUpdate =
  | { type: "status"; status: string; iteration: number }
  | { type: "content"; content: string }
  | { type: "cost"; tokens: number; cost: number }
  | { type: "context"; snapshot: ContextWindowSnapshot }
  | { type: "approval_request"; request: ApprovalRequest }
  | { type: "approval_resolved"; request: ApprovalRequest; decision: ApprovalDecision }
  | { type: "compaction"; result: CompactionResult; snapshot: ContextWindowSnapshot; durationMs?: number }
  | {
    type: "tool_result";
    name: string;
    output: string;
    isError: boolean;
    durationMs: number;
    externalized?: PersistedToolResult | null;
  }
  | { type: "error"; error: string };
