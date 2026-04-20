/**
 * Pre-flight token budget gate and cost estimation.
 *
 * 1:1 port of colony/llm/budget_gate.py — prevents wasted LLM API calls
 * by validating prompt fit within the model's context window, and provides
 * per-model cost estimation and per-session spending caps.
 *
 * Key classes:
 *   - BudgetGate: validates prompt token count vs. context window
 *   - CostEstimator: translates tokens into USD via built-in pricing table
 *   - SessionBudget: enforces per-session token and dollar caps
 */

// ---------------------------------------------------------------------------
// PreFlightResult
// ---------------------------------------------------------------------------

export interface PreFlightResult {
  /** True if the prompt fits within the budget. */
  allowed: boolean;
  /** Estimated prompt token count. */
  promptTokens: number;
  /** Model's context window size. */
  contextWindow: number;
  /** Tokens available after response reserve. */
  availableTokens: number;
  /** Percentage of available window used (0–100). */
  utilisationPct: number;
  /** Explanation when denied. */
  reason: string;
  /** Suggested action (e.g. "compact", "abort"). */
  recommendation: string;
}

function preFlightOk(promptTokens: number, partial?: Partial<PreFlightResult>): PreFlightResult {
  return {
    allowed: true,
    promptTokens,
    contextWindow: partial?.contextWindow ?? 0,
    availableTokens: partial?.availableTokens ?? 0,
    utilisationPct: partial?.utilisationPct ?? 0,
    reason: partial?.reason ?? "",
    recommendation: partial?.recommendation ?? "",
  };
}

// ---------------------------------------------------------------------------
// BudgetGate
// ---------------------------------------------------------------------------

export class BudgetGate {
  private _contextWindow: number;
  private _responseReserve: number;
  private _warnThreshold: number;
  private _hardLimit: number;

  constructor(opts?: {
    contextWindow?: number;
    responseReserve?: number;
    warnThreshold?: number;
    hardLimit?: number;
  }) {
    this._contextWindow = opts?.contextWindow ?? 128_000;
    this._responseReserve = opts?.responseReserve ?? 4096;
    this._warnThreshold = opts?.warnThreshold ?? 0.85;
    this._hardLimit = opts?.hardLimit ?? 0.98;
  }

  get contextWindow(): number {
    return this._contextWindow;
  }

  set contextWindow(value: number) {
    this._contextWindow = value;
  }

  get availableTokens(): number {
    return Math.max(0, this._contextWindow - this._responseReserve);
  }

  check(promptTokens: number, responseReserve?: number): PreFlightResult {
    const reserve = responseReserve ?? this._responseReserve;
    const available = Math.max(0, this._contextWindow - reserve);

    if (available === 0) {
      return {
        allowed: false,
        promptTokens,
        contextWindow: this._contextWindow,
        availableTokens: 0,
        utilisationPct: 100.0,
        reason: "Response reserve exceeds or equals context window.",
        recommendation: "increase_context_window",
      };
    }

    const utilisation = promptTokens / available;
    const utilisationPct = Math.round(utilisation * 1000) / 10;

    // Hard block
    if (utilisation >= this._hardLimit) {
      return {
        allowed: false,
        promptTokens,
        contextWindow: this._contextWindow,
        availableTokens: available,
        utilisationPct,
        reason: `Prompt (${promptTokens.toLocaleString()} tokens) exceeds hard limit (${Math.round(this._hardLimit * 100)}% of ${available.toLocaleString()} available = ${Math.floor(available * this._hardLimit).toLocaleString()} tokens).`,
        recommendation: "compact_or_abort",
      };
    }

    // Warning zone
    if (utilisation >= this._warnThreshold) {
      return {
        allowed: true,
        promptTokens,
        contextWindow: this._contextWindow,
        availableTokens: available,
        utilisationPct,
        reason: `Prompt approaching limit (${utilisationPct}% utilisation). Consider compaction.`,
        recommendation: "compact_soon",
      };
    }

    // Green
    return {
      allowed: true,
      promptTokens,
      contextWindow: this._contextWindow,
      availableTokens: available,
      utilisationPct,
      reason: "",
      recommendation: "",
    };
  }
}

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

// Pricing per million tokens: (input, output, cache_write, cache_read)
const MODEL_PRICING: Record<string, [number, number, number, number]> = {
  // Anthropic
  "claude-opus-4-6": [15.0, 75.0, 18.75, 1.50],
  "claude-opus-4-5": [5.0, 25.0, 6.25, 0.50],
  "claude-sonnet-4-6": [3.0, 15.0, 3.75, 0.30],
  "claude-sonnet-4-5": [3.0, 15.0, 3.75, 0.30],
  "claude-haiku-4-5": [1.0, 5.0, 1.25, 0.10],
  "claude-haiku-3-5": [0.80, 4.0, 1.00, 0.08],
  // OpenAI
  "gpt-4o": [2.50, 10.0, 0.0, 0.0],
  "gpt-4o-mini": [0.15, 0.60, 0.0, 0.0],
  "gpt-4-turbo": [10.0, 30.0, 0.0, 0.0],
  "o1": [15.0, 60.0, 0.0, 0.0],
  "o3": [10.0, 40.0, 0.0, 0.0],
  "o3-mini": [1.10, 4.40, 0.0, 0.0],
  // Google
  "gemini-2.5-pro": [1.25, 10.0, 0.0, 0.0],
  "gemini-2.5-flash": [0.15, 0.60, 0.0, 0.0],
  "gemini-2.0-flash": [0.10, 0.40, 0.0, 0.0],
  // Local (free)
  "llama3.1": [0.0, 0.0, 0.0, 0.0],
  "llama3.2": [0.0, 0.0, 0.0, 0.0],
  "codellama": [0.0, 0.0, 0.0, 0.0],
  "mistral": [0.0, 0.0, 0.0, 0.0],
  "mixtral": [0.0, 0.0, 0.0, 0.0],
  "qwen2.5": [0.0, 0.0, 0.0, 0.0],
  "deepseek-coder-v2": [0.0, 0.0, 0.0, 0.0],
};

export interface CostEstimate {
  model: string;
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  promptCostUsd: number;
  completionCostUsd: number;
  cacheReadCostUsd: number;
  cacheWriteCostUsd: number;
  totalUsd: number;
  cacheSavingsUsd: number;
  pricingAvailable: boolean;
}

export class CostEstimator {
  private _pricing: Record<string, [number, number, number, number]>;

  constructor(customPricing?: Record<string, number[]>) {
    this._pricing = { ...MODEL_PRICING };
    if (customPricing) {
      for (const [name, rates] of Object.entries(customPricing)) {
        this._pricing[name] = this._normalizePricing(rates);
      }
    }
  }

  private _normalizePricing(rates: number[]): [number, number, number, number] {
    if (rates.length === 4) return [rates[0], rates[1], rates[2], rates[3]];
    if (rates.length === 2) return [rates[0], rates[1], 0.0, 0.0];
    throw new Error(`Pricing must be a 2-tuple or 4-tuple, got ${rates.length}`);
  }

  estimate(
    model: string,
    promptTokens = 0,
    completionTokens = 0,
    cacheReadTokens = 0,
    cacheWriteTokens = 0,
  ): CostEstimate {
    const pricing = this._lookupPricing(model);
    if (!pricing) {
      return {
        model,
        promptTokens,
        completionTokens,
        cacheReadTokens,
        cacheWriteTokens,
        promptCostUsd: 0,
        completionCostUsd: 0,
        cacheReadCostUsd: 0,
        cacheWriteCostUsd: 0,
        totalUsd: 0,
        cacheSavingsUsd: 0,
        pricingAvailable: false,
      };
    }

    const [inputPerM, outputPerM, cwPerM, crPerM] = pricing;
    const promptCost = (promptTokens / 1_000_000) * inputPerM;
    const completionCost = (completionTokens / 1_000_000) * outputPerM;
    const cacheReadCost = (cacheReadTokens / 1_000_000) * crPerM;
    const cacheWriteCost = (cacheWriteTokens / 1_000_000) * cwPerM;

    const fullInputCost = (cacheReadTokens / 1_000_000) * inputPerM;
    const savings = Math.max(0, fullInputCost - cacheReadCost);
    const total = promptCost + completionCost + cacheReadCost + cacheWriteCost;

    return {
      model,
      promptTokens,
      completionTokens,
      cacheReadTokens,
      cacheWriteTokens,
      promptCostUsd: round6(promptCost),
      completionCostUsd: round6(completionCost),
      cacheReadCostUsd: round6(cacheReadCost),
      cacheWriteCostUsd: round6(cacheWriteCost),
      totalUsd: round6(total),
      cacheSavingsUsd: round6(savings),
      pricingAvailable: true,
    };
  }

  private _lookupPricing(model: string): [number, number, number, number] | null {
    if (model in this._pricing) return this._pricing[model];
    for (const [known, pricing] of Object.entries(this._pricing)) {
      if (model.startsWith(known)) return pricing;
    }
    return null;
  }
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

// ---------------------------------------------------------------------------
// SessionBudget
// ---------------------------------------------------------------------------

export class SessionBudget {
  private _maxTokens: number;
  private _maxUsd: number;
  private _sessionId: string;
  private _totalTokens = 0;
  private _totalUsd = 0.0;
  private _callCount = 0;
  private _deniedCount = 0;

  constructor(opts?: {
    maxTokens?: number;
    maxUsd?: number;
    sessionId?: string;
  }) {
    this._maxTokens = opts?.maxTokens ?? 0;
    this._maxUsd = opts?.maxUsd ?? 0.0;
    this._sessionId = opts?.sessionId || "default";
  }

  get totalTokens(): number { return this._totalTokens; }
  get totalUsd(): number { return this._totalUsd; }
  get callCount(): number { return this._callCount; }
  get deniedCount(): number { return this._deniedCount; }

  canSpend(estimatedTokens = 0, estimatedUsd = 0.0): PreFlightResult {
    // Token limit check
    if (this._maxTokens > 0) {
      const projected = this._totalTokens + estimatedTokens;
      if (projected > this._maxTokens) {
        this._deniedCount++;
        return {
          allowed: false,
          promptTokens: estimatedTokens,
          contextWindow: 0,
          availableTokens: 0,
          utilisationPct: 0,
          reason: `Session token budget exceeded: ${this._totalTokens.toLocaleString()} + ${estimatedTokens.toLocaleString()} = ${projected.toLocaleString()} > ${this._maxTokens.toLocaleString()} limit.`,
          recommendation: "end_session",
        };
      }
    }

    // Dollar limit check
    if (this._maxUsd > 0.0) {
      const projectedUsd = this._totalUsd + estimatedUsd;
      if (projectedUsd > this._maxUsd) {
        this._deniedCount++;
        return {
          allowed: false,
          promptTokens: estimatedTokens,
          contextWindow: 0,
          availableTokens: 0,
          utilisationPct: 0,
          reason: `Session cost budget exceeded: $${this._totalUsd.toFixed(4)} + $${estimatedUsd.toFixed(4)} = $${projectedUsd.toFixed(4)} > $${this._maxUsd.toFixed(4)} limit.`,
          recommendation: "end_session",
        };
      }
    }

    return preFlightOk(estimatedTokens);
  }

  recordSpend(tokens = 0, usd = 0.0): void {
    this._totalTokens += tokens;
    this._totalUsd += usd;
    this._callCount++;
  }

  getStats(): Record<string, unknown> {
    const remainingTokens =
      this._maxTokens > 0
        ? Math.max(0, this._maxTokens - this._totalTokens)
        : -1;
    const remainingUsd =
      this._maxUsd > 0.0
        ? Math.max(0, this._maxUsd - this._totalUsd)
        : -1.0;

    return {
      sessionId: this._sessionId,
      totalTokens: this._totalTokens,
      totalUsd: round6(this._totalUsd),
      callCount: this._callCount,
      deniedCount: this._deniedCount,
      maxTokens: this._maxTokens,
      maxUsd: this._maxUsd,
      remainingTokens,
      remainingUsd: remainingUsd >= 0 ? round6(remainingUsd) : -1.0,
    };
  }

  reset(): void {
    this._totalTokens = 0;
    this._totalUsd = 0.0;
    this._callCount = 0;
    this._deniedCount = 0;
  }
}
