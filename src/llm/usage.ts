/**
 * LLM usage tracker - in-memory token accumulator with query API.
 *
 * Ports colony/llm/usage.py. Tracks usage per
 * (tenant, caste, provider, model) tuple, provides summaries, running cost,
 * cache hit rate, and reset helpers.
 */

import type { TokenUsage } from "./models";
import { CostEstimator } from "./budget-gate";

export interface UsageRecordSnapshot {
  tenant: string;
  caste: string;
  provider: string;
  model: string;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  requestCount: number;
  firstSeen: number;
  lastSeen: number;
}

export interface UsageSummary {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  totalRequests: number;
  byProvider: Record<string, { totalTokens: number; requestCount: number }>;
  byCaste: Record<string, { totalTokens: number; requestCount: number }>;
  recordCount: number;
}

export interface RunningCostModelBreakdown {
  model: string;
  provider: string;
  caste: string;
  totalUsd: number;
  cacheSavingsUsd: number;
  requests: number;
}

export interface RunningCostSnapshot {
  totalUsd: number;
  totalCacheSavingsUsd: number;
  costPerMinute: number;
  byModel: RunningCostModelBreakdown[];
}

export class UsageRecord {
  readonly tenant: string;
  readonly caste: string;
  readonly provider: string;
  readonly model: string;
  private totalPromptTokens = 0;
  private totalCompletionTokens = 0;
  private totalTokens = 0;
  private totalCacheReadTokens = 0;
  private totalCacheWriteTokens = 0;
  private requestCount = 0;
  private firstSeen = 0;
  private lastSeen = 0;
  private readonly nowSeconds: () => number;

  constructor(opts: {
    tenant: string;
    caste: string;
    provider: string;
    model: string;
    nowSeconds?: () => number;
  }) {
    this.tenant = opts.tenant;
    this.caste = opts.caste;
    this.provider = opts.provider;
    this.model = opts.model;
    this.nowSeconds = opts.nowSeconds ?? (() => Date.now() / 1000);
  }

  accumulate(usage: TokenUsage): void {
    const now = this.nowSeconds();
    if (this.firstSeen === 0) this.firstSeen = now;
    this.lastSeen = now;
    this.totalPromptTokens += usage.promptTokens;
    this.totalCompletionTokens += usage.completionTokens;
    this.totalTokens += usage.totalTokens;
    this.totalCacheReadTokens += usage.cacheReadTokens;
    this.totalCacheWriteTokens += usage.cacheWriteTokens;
    this.requestCount++;
  }

  toJSON(): UsageRecordSnapshot {
    return {
      tenant: this.tenant,
      caste: this.caste,
      provider: this.provider,
      model: this.model,
      totalPromptTokens: this.totalPromptTokens,
      totalCompletionTokens: this.totalCompletionTokens,
      totalTokens: this.totalTokens,
      totalCacheReadTokens: this.totalCacheReadTokens,
      totalCacheWriteTokens: this.totalCacheWriteTokens,
      requestCount: this.requestCount,
      firstSeen: this.firstSeen,
      lastSeen: this.lastSeen,
    };
  }
}

export class LLMUsageTracker {
  private readonly records = new Map<string, UsageRecord>();
  private readonly nowSeconds: () => number;

  constructor(opts: { nowSeconds?: () => number } = {}) {
    this.nowSeconds = opts.nowSeconds ?? (() => Date.now() / 1000);
  }

  record(opts: {
    tenant?: string;
    caste?: string;
    provider: string;
    model: string;
    usage: TokenUsage;
  }): void {
    const tenant = opts.tenant ?? "default";
    const caste = opts.caste ?? "unknown";
    const key = usageKey(tenant, caste, opts.provider, opts.model);
    let record = this.records.get(key);
    if (!record) {
      record = new UsageRecord({
        tenant,
        caste,
        provider: opts.provider,
        model: opts.model,
        nowSeconds: this.nowSeconds,
      });
      this.records.set(key, record);
    }
    record.accumulate(opts.usage);
  }

  getUsage(filters: {
    tenant?: string | null;
    caste?: string | null;
    provider?: string | null;
  } = {}): UsageRecordSnapshot[] {
    const results: UsageRecordSnapshot[] = [];
    for (const record of this.records.values()) {
      const snapshot = record.toJSON();
      if (filters.tenant && snapshot.tenant !== filters.tenant) continue;
      if (filters.caste && snapshot.caste !== filters.caste) continue;
      if (filters.provider && snapshot.provider !== filters.provider) continue;
      results.push(snapshot);
    }
    return results.sort((a, b) => b.totalTokens - a.totalTokens);
  }

  getTenantUsage(tenant: string): UsageRecordSnapshot[] {
    return this.getUsage({ tenant });
  }

  getSummary(filters: { tenant?: string | null } = {}): UsageSummary {
    const records = this.getUsage({ tenant: filters.tenant });
    const summary: UsageSummary = {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      totalRequests: 0,
      byProvider: {},
      byCaste: {},
      recordCount: records.length,
    };

    for (const record of records) {
      summary.totalPromptTokens += record.totalPromptTokens;
      summary.totalCompletionTokens += record.totalCompletionTokens;
      summary.totalTokens += record.totalTokens;
      summary.totalCacheReadTokens += record.totalCacheReadTokens;
      summary.totalCacheWriteTokens += record.totalCacheWriteTokens;
      summary.totalRequests += record.requestCount;
      addBreakdown(summary.byProvider, record.provider, record.totalTokens, record.requestCount);
      addBreakdown(summary.byCaste, record.caste, record.totalTokens, record.requestCount);
    }

    return summary;
  }

  getRunningCost(opts: {
    tenant?: string | null;
    estimator?: CostEstimator;
  } = {}): RunningCostSnapshot {
    const estimator = opts.estimator ?? new CostEstimator();
    const records = this.getUsage({ tenant: opts.tenant });
    const byModel: RunningCostModelBreakdown[] = [];
    let totalUsd = 0;
    let totalSavings = 0;

    for (const record of records) {
      const estimate = estimator.estimate(
        record.model,
        record.totalPromptTokens,
        record.totalCompletionTokens,
        record.totalCacheReadTokens,
        record.totalCacheWriteTokens,
      );
      totalUsd += estimate.totalUsd;
      totalSavings += estimate.cacheSavingsUsd;
      byModel.push({
        model: record.model,
        provider: record.provider,
        caste: record.caste,
        totalUsd: estimate.totalUsd,
        cacheSavingsUsd: estimate.cacheSavingsUsd,
        requests: record.requestCount,
      });
    }

    const firstSeen = Math.min(...records.filter((record) => record.firstSeen > 0).map((record) => record.firstSeen));
    const lastSeen = Math.max(...records.map((record) => record.lastSeen));
    const elapsedMinutes = Number.isFinite(firstSeen) && Number.isFinite(lastSeen)
      ? Math.max((lastSeen - firstSeen) / 60, 1 / 60)
      : 1 / 60;

    return {
      totalUsd: round6(totalUsd),
      totalCacheSavingsUsd: round6(totalSavings),
      costPerMinute: totalUsd > 0 ? round6(totalUsd / elapsedMinutes) : 0,
      byModel,
    };
  }

  cacheHitRate(filters: { tenant?: string | null } = {}): number {
    const records = this.getUsage({ tenant: filters.tenant });
    const promptTokens = records.reduce((total, record) => total + record.totalPromptTokens, 0);
    const cacheReadTokens = records.reduce((total, record) => total + record.totalCacheReadTokens, 0);
    const inputTokens = promptTokens + cacheReadTokens;
    if (inputTokens === 0) return 0;
    return cacheReadTokens / inputTokens;
  }

  reset(): void {
    this.records.clear();
  }

  recordCount(): number {
    return this.records.size;
  }
}

export const llmUsageTracker = new LLMUsageTracker();

function usageKey(tenant: string, caste: string, provider: string, model: string): string {
  return JSON.stringify([tenant, caste, provider, model]);
}

function addBreakdown(
  target: Record<string, { totalTokens: number; requestCount: number }>,
  key: string,
  tokens: number,
  requests: number,
): void {
  target[key] ??= { totalTokens: 0, requestCount: 0 };
  target[key].totalTokens += tokens;
  target[key].requestCount += requests;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
