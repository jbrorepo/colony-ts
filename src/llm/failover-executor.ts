/**
 * Failover Executor — wraps LLM calls with automatic retry and provider failover.
 *
 * 1:1 port of colony/llm/failover.py (FailoverExecutor class).
 *
 * The FailoverExecutor takes a list of ModelCandidate objects from the
 * ModelSelector and walks through them in order, catching transient
 * errors and failing over to the next candidate.
 *
 * Key behaviours:
 *   - Exponential backoff WITHIN a single provider before failing over.
 *   - Circuit breaker: per-provider tracking via CircuitBreaker.
 *   - Failover on: LLMConnectionError, LLMRateLimitError, timeout.
 *   - No failover on: LLMResponseError (bad request / invalid prompt).
 *   - Every failover event is recorded.
 */

import type { CompletionParams, LLMProvider } from "./base";
import { CavemanBridge, chunkText } from "./caveman-bridge";
import { CircuitBreaker } from "./circuit-breaker";
import {
  LLMConnectionError,
  LLMError,
  LLMRateLimitError,
  LLMResponseError,
} from "./exceptions";
import type { LLMChunk, LLMMessage, LLMResponse } from "./models";
import { createLLMResponse } from "./models";
import { providerRateLimitKey, type TokenBucketRateLimiter } from "./rate-limiter";
import type { ModelCandidate } from "./selector";

// ---------------------------------------------------------------------------
// Failover event (for audit / observability)
// ---------------------------------------------------------------------------

export interface FailoverEvent {
  fromProvider: string;
  fromModel: string;
  toProvider: string;
  toModel: string;
  errorType: string;
  errorMessage: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// FailoverExecutor
// ---------------------------------------------------------------------------

export class FailoverExecutor {
  private _getProvider: (name: string) => LLMProvider;
  readonly maxRetriesPerProvider: number;
  readonly baseBackoffSeconds: number;
  readonly maxBackoffSeconds: number;

  private _breakers = new Map<string, CircuitBreaker>();
  private _circuitThreshold: number;
  private _circuitCooldown: number;
  private _failoverEvents: FailoverEvent[] = [];
  private _rateLimiter: TokenBucketRateLimiter | null;
  private _rateLimitCost: number | ((candidate: ModelCandidate) => number);
  private _rateLimitKey: (candidate: ModelCandidate) => string;
  private _maxRateLimitWaitMs: number;
  private _cavemanBridge: CavemanBridge | null;
  private _lastSuccessfulCandidate: ModelCandidate | null = null;

  constructor(
    providerGetter: (name: string) => LLMProvider,
    opts?: {
      maxRetriesPerProvider?: number;
      baseBackoffSeconds?: number;
      maxBackoffSeconds?: number;
      circuitThreshold?: number;
      circuitCooldownSeconds?: number;
      rateLimiter?: TokenBucketRateLimiter | null;
      rateLimitCost?: number | ((candidate: ModelCandidate) => number);
      rateLimitKey?: (candidate: ModelCandidate) => string;
      maxRateLimitWaitMs?: number;
      cavemanBridge?: CavemanBridge | null;
    },
  ) {
    this._getProvider = providerGetter;
    this.maxRetriesPerProvider = opts?.maxRetriesPerProvider ?? 2;
    this.baseBackoffSeconds = opts?.baseBackoffSeconds ?? 0.5;
    this.maxBackoffSeconds = opts?.maxBackoffSeconds ?? 8.0;
    this._circuitThreshold = opts?.circuitThreshold ?? 3;
    this._circuitCooldown = opts?.circuitCooldownSeconds ?? 60.0;
    this._rateLimiter = opts?.rateLimiter ?? null;
    this._rateLimitCost = opts?.rateLimitCost ?? 1;
    this._rateLimitKey = opts?.rateLimitKey ?? ((candidate) =>
      providerRateLimitKey(candidate.providerName, candidate.modelId)
    );
    this._maxRateLimitWaitMs = opts?.maxRateLimitWaitMs ?? 30_000;
    this._cavemanBridge = opts?.cavemanBridge ?? null;
  }

  // -- Circuit breaker management -------------------------------------------

  getBreaker(providerName: string): CircuitBreaker {
    let breaker = this._breakers.get(providerName);
    if (!breaker) {
      breaker = new CircuitBreaker({ threshold: this._circuitThreshold, cooldownSeconds: this._circuitCooldown });
      this._breakers.set(providerName, breaker);
    }
    return breaker;
  }

  getProviderHealth(): Record<string, Record<string, unknown>> {
    const result: Record<string, Record<string, unknown>> = {};
    for (const [name, breaker] of this._breakers) {
      result[name] = {
        state: breaker.state,
        failureCount: breaker.failureCount,
      };
    }
    return result;
  }

  get failoverEvents(): FailoverEvent[] {
    return [...this._failoverEvents];
  }

  get lastSuccessfulCandidate(): ModelCandidate | null {
    return this._lastSuccessfulCandidate == null
      ? null
      : { ...this._lastSuccessfulCandidate };
  }

  clearEvents(): void {
    this._failoverEvents.length = 0;
  }

  // -- Completion with failover ---------------------------------------------

  async complete(
    candidates: ModelCandidate[],
    messages: LLMMessage[],
    params?: CompletionParams,
  ): Promise<LLMResponse> {
    let lastError: LLMError | null = null;

    for (let idx = 0; idx < candidates.length; idx++) {
      const candidate = candidates[idx];
      const breaker = this.getBreaker(candidate.providerName);

      // Skip if circuit breaker is open
      if (!breaker.isAvailable()) {
        continue;
      }

      // Resolve provider instance
      let provider: LLMProvider;
      try {
        provider = this._getProvider(candidate.providerName);
      } catch (exc) {
        breaker.recordFailure();
        lastError = new LLMConnectionError(String(exc), {
          provider: candidate.providerName,
          model: candidate.modelId,
        });
        continue;
      }

      // Retry loop within this provider
      for (let attempt = 0; attempt <= this.maxRetriesPerProvider; attempt++) {
        try {
          await this._waitForRateLimit(candidate);
          const prepared = this._cavemanBridge?.prepareMessages(candidate, messages) ?? { messages };
          const response = await provider.complete(prepared.messages, {
            ...params,
            model: candidate.modelId,
          });
          breaker.recordSuccess();
          this._lastSuccessfulCandidate = { ...candidate };
          return await this._cleanupCavemanResponse(candidate, response, messages);
        } catch (e) {
          // Non-retryable — raise immediately, no failover
          if (e instanceof LLMResponseError) throw e;

          if (
            e instanceof LLMConnectionError ||
            e instanceof LLMRateLimitError
          ) {
            lastError = e;
            breaker.recordFailure();

            if (attempt < this.maxRetriesPerProvider) {
              let delay = Math.min(
                this.baseBackoffSeconds * 2 ** attempt,
                this.maxBackoffSeconds,
              );
              // Use retry_after hint if available
              if (e instanceof LLMRateLimitError && e.retryAfter) {
                delay = Math.min(e.retryAfter, this.maxBackoffSeconds);
              }
              await this._sleep(delay);
            } else {
              // Exhausted retries — record failover
              const nextCandidate = candidates[idx + 1] ?? null;
              if (nextCandidate) {
                this._recordFailover(candidate, nextCandidate, e);
              }
              break; // Move to next candidate
            }
          } else {
            // Unexpected error — treat as connection error
            lastError = new LLMConnectionError(`Unexpected error: ${e}`, {
              provider: candidate.providerName,
              model: candidate.modelId,
            });
            breaker.recordFailure();
            break;
          }
        }
      }
    }

    // All candidates exhausted
    throw new LLMError(
      `All ${candidates.length} model candidates exhausted. Last error: ${lastError}`,
      {
        provider: candidates.at(-1)?.providerName ?? "",
        model: candidates.at(-1)?.modelId ?? "",
      },
    );
  }

  // -- Streaming with failover ----------------------------------------------

  async *stream(
    candidates: ModelCandidate[],
    messages: LLMMessage[],
    params?: CompletionParams,
  ): AsyncGenerator<LLMChunk> {
    let lastError: LLMError | null = null;

    for (let idx = 0; idx < candidates.length; idx++) {
      const candidate = candidates[idx];
      const breaker = this.getBreaker(candidate.providerName);

      if (!breaker.isAvailable()) continue;

      let provider: LLMProvider;
      try {
        provider = this._getProvider(candidate.providerName);
      } catch (exc) {
        breaker.recordFailure();
        lastError = new LLMConnectionError(String(exc), {
          provider: candidate.providerName,
          model: candidate.modelId,
        });
        continue;
      }

      try {
        await this._waitForRateLimit(candidate);
        const prepared = this._cavemanBridge?.prepareMessages(candidate, messages) ?? { messages };
        const streamIter = provider.stream(prepared.messages, {
          ...params,
          model: candidate.modelId,
        });

        breaker.recordSuccess();

        if (this._cavemanBridge?.shouldBridge(candidate)) {
          const buffered: LLMChunk[] = [];
          let content = "";
          let modelName = candidate.modelId;
          let finishReason: string | null = null;
          let toolCalls: Record<string, unknown>[] = [];

          for await (const chunk of streamIter) {
            buffered.push(chunk);
            if (chunk.delta) content += chunk.delta;
            if (chunk.model) modelName = chunk.model;
            if (chunk.finishReason) finishReason = chunk.finishReason;
            if (chunk.toolCalls?.length) toolCalls = chunk.toolCalls;
          }

          if (toolCalls.length > 0 || !content.trim()) {
            for (const chunk of buffered) yield chunk;
            return;
          }

          const response = createLLMResponse(content, modelName, candidate.providerName, {
            finishReason: finishReason ?? "",
          });
          const cleaned = await this._cleanupCavemanResponse(candidate, response, messages);
          this._lastSuccessfulCandidate = { ...candidate };
          for (const delta of chunkText(cleaned.content, this._cavemanBridge.config.streamChunkChars)) {
            yield {
              delta,
              model: cleaned.model,
              finishReason: null,
            };
          }
          yield {
            delta: "",
            model: cleaned.model,
            finishReason: cleaned.finishReason || "stop",
          };
          return;
        }

        for await (const chunk of streamIter) {
          yield chunk;
        }
        this._lastSuccessfulCandidate = { ...candidate };
        return; // Stream completed successfully
      } catch (e) {
        if (e instanceof LLMResponseError) throw e;

        if (
          e instanceof LLMConnectionError ||
          e instanceof LLMRateLimitError
        ) {
          lastError = e;
          breaker.recordFailure();

          const nextCandidate = candidates[idx + 1] ?? null;
          if (nextCandidate) {
            this._recordFailover(candidate, nextCandidate, e);
          }
          continue;
        }

        lastError = new LLMConnectionError(`Unexpected stream error: ${e}`, {
          provider: candidate.providerName,
          model: candidate.modelId,
        });
        breaker.recordFailure();
        continue;
      }
    }

    throw new LLMError(
      `All ${candidates.length} candidates exhausted for streaming. Last error: ${lastError}`,
      {
        provider: candidates.at(-1)?.providerName ?? "",
        model: candidates.at(-1)?.modelId ?? "",
      },
    );
  }

  // -- Internal -------------------------------------------------------------

  private _recordFailover(
    from: ModelCandidate,
    to: ModelCandidate,
    error: Error,
  ): void {
    this._failoverEvents.push({
      fromProvider: from.providerName,
      fromModel: from.modelId,
      toProvider: to.providerName,
      toModel: to.modelId,
      errorType: error.constructor.name,
      errorMessage: error.message,
      timestamp: Date.now(),
    });
  }

  private async _cleanupCavemanResponse(
    candidate: ModelCandidate,
    response: LLMResponse,
    originalMessages: LLMMessage[],
  ): Promise<LLMResponse> {
    if (!this._cavemanBridge) return response;
    return this._cavemanBridge.cleanupResponse(
      candidate,
      response,
      originalMessages,
      this._getProvider,
    );
  }

  private _sleep(seconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  private async _waitForRateLimit(candidate: ModelCandidate): Promise<void> {
    if (!this._rateLimiter) return;
    const cost = typeof this._rateLimitCost === "function"
      ? this._rateLimitCost(candidate)
      : this._rateLimitCost;
    const decision = await this._rateLimiter.waitForAvailability(
      this._rateLimitKey(candidate),
      cost,
      { maxWaitMs: this._maxRateLimitWaitMs },
    );
    if (!decision.allowed) {
      throw new LLMRateLimitError(
        `Rate limited locally for ${candidate.providerName}; retry after ${Math.ceil(decision.waitMs / 1000)}s`,
        {
          provider: candidate.providerName,
          model: candidate.modelId,
          retryAfter: Math.ceil(decision.waitMs / 1000),
        },
      );
    }
  }
}
