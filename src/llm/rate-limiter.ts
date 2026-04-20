/**
 * Token-bucket rate limiter for LLM calls.
 *
 * Ported from the Python engine token-bucket limiter and adapted for
 * provider/model keys. The limiter is deterministic, dependency-free, and
 * safe to use from the single-threaded Bun event loop.
 */

export interface TokenBucketConfig {
  capacity: number;
  refillRatePerSecond: number;
}

export interface RateLimitDecision {
  key: string;
  allowed: boolean;
  tokensRequested: number;
  tokensRemaining: number;
  waitMs: number;
}

export interface TokenBucketSnapshot {
  key: string;
  capacity: number;
  refillRatePerSecond: number;
  tokensRemaining: number;
  lastRefillAtMs: number;
  limitedCount: number;
}

interface BucketState {
  config: TokenBucketConfig;
  tokens: number;
  lastRefillAtMs: number;
  limitedCount: number;
}

export class TokenBucketRateLimiter {
  private readonly buckets = new Map<string, BucketState>();
  private readonly defaults: TokenBucketConfig;
  private readonly nowMs: () => number;

  constructor(opts: {
    defaultCapacity?: number;
    defaultRefillRatePerSecond?: number;
    nowMs?: () => number;
  } = {}) {
    this.defaults = {
      capacity: opts.defaultCapacity ?? 60,
      refillRatePerSecond: opts.defaultRefillRatePerSecond ?? 1,
    };
    this.nowMs = opts.nowMs ?? (() => Date.now());
  }

  configure(key: string, config: TokenBucketConfig): void {
    this.validateConfig(config);
    this.buckets.set(key, {
      config,
      tokens: config.capacity,
      lastRefillAtMs: this.nowMs(),
      limitedCount: 0,
    });
  }

  tryConsume(key: string, tokens = 1): RateLimitDecision {
    const requested = this.validateTokens(tokens);
    const bucket = this.getBucket(key);
    this.refill(bucket);

    if (bucket.tokens >= requested) {
      bucket.tokens -= requested;
      return {
        key,
        allowed: true,
        tokensRequested: requested,
        tokensRemaining: round(bucket.tokens),
        waitMs: 0,
      };
    }

    bucket.limitedCount++;
    const deficit = requested - bucket.tokens;
    const waitMs = bucket.config.refillRatePerSecond > 0
      ? Math.ceil((deficit / bucket.config.refillRatePerSecond) * 1000)
      : Number.POSITIVE_INFINITY;

    return {
      key,
      allowed: false,
      tokensRequested: requested,
      tokensRemaining: round(bucket.tokens),
      waitMs,
    };
  }

  async waitForAvailability(
    key: string,
    tokens = 1,
    opts: { maxWaitMs?: number } = {},
  ): Promise<RateLimitDecision> {
    const first = this.tryConsume(key, tokens);
    if (first.allowed) return first;

    const maxWaitMs = opts.maxWaitMs ?? 30_000;
    if (!Number.isFinite(first.waitMs) || first.waitMs > maxWaitMs) {
      return first;
    }

    await new Promise((resolve) => setTimeout(resolve, first.waitMs));
    return this.tryConsume(key, tokens);
  }

  snapshot(key: string): TokenBucketSnapshot {
    const bucket = this.getBucket(key);
    this.refill(bucket);
    return {
      key,
      capacity: bucket.config.capacity,
      refillRatePerSecond: bucket.config.refillRatePerSecond,
      tokensRemaining: round(bucket.tokens),
      lastRefillAtMs: bucket.lastRefillAtMs,
      limitedCount: bucket.limitedCount,
    };
  }

  reset(key?: string): void {
    if (key) {
      this.buckets.delete(key);
      return;
    }
    this.buckets.clear();
  }

  private getBucket(key: string): BucketState {
    const existing = this.buckets.get(key);
    if (existing) return existing;
    const created: BucketState = {
      config: { ...this.defaults },
      tokens: this.defaults.capacity,
      lastRefillAtMs: this.nowMs(),
      limitedCount: 0,
    };
    this.buckets.set(key, created);
    return created;
  }

  private refill(bucket: BucketState): void {
    const now = this.nowMs();
    const elapsedSeconds = Math.max(0, (now - bucket.lastRefillAtMs) / 1000);
    bucket.tokens = Math.min(
      bucket.config.capacity,
      bucket.tokens + elapsedSeconds * bucket.config.refillRatePerSecond,
    );
    bucket.lastRefillAtMs = now;
  }

  private validateConfig(config: TokenBucketConfig): void {
    if (!Number.isFinite(config.capacity) || config.capacity <= 0) {
      throw new Error("Token bucket capacity must be positive");
    }
    if (!Number.isFinite(config.refillRatePerSecond) || config.refillRatePerSecond < 0) {
      throw new Error("Token bucket refillRatePerSecond must be non-negative");
    }
  }

  private validateTokens(tokens: number): number {
    if (!Number.isFinite(tokens) || tokens <= 0) {
      throw new Error("Token request must be positive");
    }
    return tokens;
  }
}

export function providerRateLimitKey(providerName: string, modelId = ""): string {
  return modelId ? `${providerName}:${modelId}` : providerName;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
