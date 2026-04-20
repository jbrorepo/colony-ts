/**
 * Failover probe - lightweight provider/model health probing.
 *
 * Ports colony/llm/failover_probe.py. Sends small completions, records
 * observations, tracks cooldowns, and exposes dynamic health weights.
 */

import type { LLMProvider } from "./base";

export enum ErrorCategory {
  NONE = "none",
  TIMEOUT = "timeout",
  RATE_LIMIT = "rate_limit",
  AUTH_ERROR = "auth_error",
  SERVER_ERROR = "server_error",
  CONNECTION_ERROR = "connection_error",
  INVALID_REQUEST = "invalid_request",
  UNKNOWN = "unknown",
}

export interface FailoverObservationSnapshot {
  provider: string;
  model: string;
  timestamp: number;
  success: boolean;
  latencyMs: number;
  errorCategory: ErrorCategory;
  errorMessage: string;
}

export class FailoverObservation {
  readonly providerName: string;
  readonly modelId: string;
  readonly timestamp: number;
  readonly success: boolean;
  readonly latencyMs: number;
  readonly errorCategory: ErrorCategory;
  readonly errorMessage: string;

  constructor(opts: {
    providerName: string;
    modelId: string;
    timestamp: number;
    success: boolean;
    latencyMs?: number;
    errorCategory?: ErrorCategory;
    errorMessage?: string;
  }) {
    this.providerName = opts.providerName;
    this.modelId = opts.modelId;
    this.timestamp = opts.timestamp;
    this.success = opts.success;
    this.latencyMs = opts.latencyMs ?? 0;
    this.errorCategory = opts.errorCategory ?? ErrorCategory.NONE;
    this.errorMessage = opts.errorMessage ?? "";
  }

  toJSON(): FailoverObservationSnapshot {
    return {
      provider: this.providerName,
      model: this.modelId,
      timestamp: this.timestamp,
      success: this.success,
      latencyMs: Math.round(this.latencyMs * 10) / 10,
      errorCategory: this.errorCategory,
      errorMessage: this.errorMessage,
    };
  }
}

export interface ModelHealthSnapshot {
  provider: string;
  model: string;
  isHealthy: boolean;
  inCooldown: boolean;
  consecutiveFailures: number;
  successRate: number;
  avgLatencyMs: number;
  healthWeight: number;
  totalProbes: number;
}

export class ModelHealth {
  readonly providerName: string;
  readonly modelId: string;
  consecutiveFailures = 0;
  consecutiveSuccesses = 0;
  totalProbes = 0;
  totalSuccesses = 0;
  avgLatencyMs = 0;
  lastProbeTime = 0;
  lastSuccessTime = 0;
  lastFailureTime = 0;
  cooldownUntil = 0;
  isHealthy = true;
  private readonly latencySamples: number[] = [];
  private readonly nowSeconds: () => number;

  constructor(opts: {
    providerName: string;
    modelId: string;
    nowSeconds?: () => number;
  }) {
    this.providerName = opts.providerName;
    this.modelId = opts.modelId;
    this.nowSeconds = opts.nowSeconds ?? (() => Date.now() / 1000);
  }

  recordObservation(obs: FailoverObservation): void {
    this.totalProbes++;
    this.lastProbeTime = obs.timestamp;

    if (obs.success) {
      this.consecutiveSuccesses++;
      this.consecutiveFailures = 0;
      this.totalSuccesses++;
      this.lastSuccessTime = obs.timestamp;
      this.isHealthy = true;
      this.cooldownUntil = 0;

      this.latencySamples.push(obs.latencyMs);
      if (this.latencySamples.length > 10) this.latencySamples.shift();
      this.avgLatencyMs = this.latencySamples.reduce((sum, sample) => sum + sample, 0) / this.latencySamples.length;
      return;
    }

    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = obs.timestamp;

    if (this.consecutiveFailures >= 2) {
      const cooldownSeconds = Math.min(30 * (2 ** (this.consecutiveFailures - 2)), 300);
      this.cooldownUntil = obs.timestamp + cooldownSeconds;
      this.isHealthy = false;
    }
  }

  get inCooldown(): boolean {
    if (this.cooldownUntil <= 0) return false;
    return this.nowSeconds() < this.cooldownUntil;
  }

  get successRate(): number {
    if (this.totalProbes === 0) return 1;
    return this.totalSuccesses / this.totalProbes;
  }

  get healthWeight(): number {
    if (this.inCooldown) return 0;
    if (!this.isHealthy) return 0.1;
    const rateWeight = this.successRate;
    const latencyPenalty = Math.min(1, this.avgLatencyMs / 5000) * 0.5;
    return Math.max(0.1, rateWeight - latencyPenalty);
  }

  toJSON(): ModelHealthSnapshot {
    return {
      provider: this.providerName,
      model: this.modelId,
      isHealthy: this.isHealthy,
      inCooldown: this.inCooldown,
      consecutiveFailures: this.consecutiveFailures,
      successRate: round3(this.successRate),
      avgLatencyMs: Math.round(this.avgLatencyMs * 10) / 10,
      healthWeight: round3(this.healthWeight),
      totalProbes: this.totalProbes,
    };
  }
}

export interface ProbeConfig {
  probeTimeoutSeconds: number;
  probeMaxTokens: number;
  probeMessage: string;
  probeIntervalSeconds: number;
  maxObservations: number;
}

export const DEFAULT_PROBE_CONFIG: ProbeConfig = {
  probeTimeoutSeconds: 10,
  probeMaxTokens: 5,
  probeMessage: "Say 'ok'.",
  probeIntervalSeconds: 60,
  maxObservations: 100,
};

export type ProviderGetter = (providerName: string) => LLMProvider;

export class FailoverProbe {
  private readonly getProvider: ProviderGetter | null;
  private readonly config: ProbeConfig;
  private readonly models: Array<{ providerName: string; modelId: string }> = [];
  private readonly health = new Map<string, ModelHealth>();
  private readonly observationLog: FailoverObservation[] = [];
  private readonly nowSeconds: () => number;

  constructor(opts: {
    providerGetter?: ProviderGetter | null;
    config?: Partial<ProbeConfig>;
    nowSeconds?: () => number;
  } = {}) {
    this.getProvider = opts.providerGetter ?? null;
    this.config = { ...DEFAULT_PROBE_CONFIG, ...opts.config };
    this.nowSeconds = opts.nowSeconds ?? (() => Date.now() / 1000);
  }

  registerModel(providerName: string, modelId: string): void {
    const key = healthKey(providerName, modelId);
    if (this.health.has(key)) return;
    this.models.push({ providerName, modelId });
    this.health.set(key, new ModelHealth({
      providerName,
      modelId,
      nowSeconds: this.nowSeconds,
    }));
  }

  async probeOne(providerName: string, modelId: string): Promise<FailoverObservation> {
    const key = healthKey(providerName, modelId);
    const health = this.health.get(key);

    if (health?.inCooldown) {
      return new FailoverObservation({
        providerName,
        modelId,
        timestamp: this.nowSeconds(),
        success: false,
        errorCategory: ErrorCategory.RATE_LIMIT,
        errorMessage: "Model in cooldown, skipping probe",
      });
    }

    const start = performance.now();
    let obs: FailoverObservation;
    try {
      if (!this.getProvider) {
        throw new Error("No provider_getter configured");
      }
      const provider = this.getProvider(providerName);
      await withTimeout(
        provider.complete(
          [{ role: "user", content: this.config.probeMessage }],
          { model: modelId, maxTokens: this.config.probeMaxTokens },
        ),
        this.config.probeTimeoutSeconds,
      );
      obs = new FailoverObservation({
        providerName,
        modelId,
        timestamp: this.nowSeconds(),
        success: true,
        latencyMs: performance.now() - start,
      });
    } catch (e) {
      const latency = performance.now() - start;
      const category = classifyProbeError(e);
      obs = new FailoverObservation({
        providerName,
        modelId,
        timestamp: this.nowSeconds(),
        success: false,
        latencyMs: latency,
        errorCategory: category,
        errorMessage: String(e instanceof Error ? e.message : e).slice(0, 200),
      });
    }

    this.recordObservation(obs);
    return obs;
  }

  async probeAll(): Promise<FailoverObservation[]> {
    if (this.models.length === 0) return [];
    const settled = await Promise.allSettled(
      this.models.map((model) => this.probeOne(model.providerName, model.modelId)),
    );
    return settled
      .filter((result): result is PromiseFulfilledResult<FailoverObservation> => result.status === "fulfilled")
      .map((result) => result.value);
  }

  getHealthWeights(): Record<string, number> {
    const weights: Record<string, number> = {};
    for (const [key, health] of this.health) {
      weights[key] = health.healthWeight;
    }
    return weights;
  }

  getHealthStatus(): Record<string, ModelHealthSnapshot> {
    const status: Record<string, ModelHealthSnapshot> = {};
    for (const [key, health] of this.health) {
      status[key] = health.toJSON();
    }
    return status;
  }

  get observations(): FailoverObservation[] {
    return [...this.observationLog];
  }

  private recordObservation(obs: FailoverObservation): void {
    this.observationLog.push(obs);
    if (this.observationLog.length > this.config.maxObservations) {
      this.observationLog.shift();
    }

    this.health.get(healthKey(obs.providerName, obs.modelId))?.recordObservation(obs);
  }
}

export function classifyProbeError(error: unknown): ErrorCategory {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  const name = error instanceof Error ? error.name.toLowerCase() : "";
  const status = extractStatus(error);

  if (name.includes("timeout") || message.includes("timeout")) return ErrorCategory.TIMEOUT;
  if (status === 429 || message.includes("rate") || message.includes("429")) return ErrorCategory.RATE_LIMIT;
  if (status === 401 || status === 403 || message.includes("auth") || message.includes("401") || message.includes("403")) {
    return ErrorCategory.AUTH_ERROR;
  }
  if ((status != null && [500, 502, 503].includes(status)) || message.includes("500") || message.includes("502") || message.includes("503")) {
    return ErrorCategory.SERVER_ERROR;
  }
  if (message.includes("connect") || message.includes("refused")) return ErrorCategory.CONNECTION_ERROR;
  if (status === 400 || message.includes("invalid") || message.includes("400")) return ErrorCategory.INVALID_REQUEST;
  return ErrorCategory.UNKNOWN;
}

function healthKey(providerName: string, modelId: string): string {
  return `${providerName}/${modelId}`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutSeconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Probe timed out after ${timeoutSeconds}s`);
      error.name = "TimeoutError";
      reject(error);
    }, timeoutSeconds * 1000);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function extractStatus(error: unknown): number | null {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.statusCode === "number") return record.statusCode;
    if (typeof record.status === "number") return record.status;
  }
  return null;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
