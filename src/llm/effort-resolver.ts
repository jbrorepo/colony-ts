/**
 * Effort / reasoning level resolver.
 *
 * Ported from colony/llm/effort_resolver.py. Resolves per-agent reasoning
 * effort from environment override, agent override, caste default, then a
 * medium fallback. Max effort is gated to models that explicitly support it.
 */

export enum EffortLevel {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  MAX = "max",
}

const EFFORT_SUPPORTED_MODELS = new Set([
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-sonnet-4-5",
  "claude-haiku-3-5",
  "o1",
  "o1-mini",
  "o3",
  "o3-mini",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
]);

const MAX_EFFORT_MODELS = new Set([
  "claude-opus-4-6",
]);

const CASTE_EFFORT_DEFAULTS: Record<string, EffortLevel> = {
  ROOT_QUEEN: EffortLevel.HIGH,
  ASSIST_ANT: EffortLevel.HIGH,
  SHIELD_GENERALS: EffortLevel.HIGH,
  FORGE_CARVERS: EffortLevel.MEDIUM,
  CORE_SHAPERS: EffortLevel.MEDIUM,
  LORE_BURROW: EffortLevel.MEDIUM,
  LIAISON_ANTS: EffortLevel.LOW,
  LEDGER_ANTS: EffortLevel.LOW,
  WATCHER_SWARM: EffortLevel.LOW,
  root_queen: EffortLevel.HIGH,
  assist_ant: EffortLevel.HIGH,
  shield_generals: EffortLevel.HIGH,
  forge_carvers: EffortLevel.MEDIUM,
  core_shapers: EffortLevel.MEDIUM,
  lore_burrow: EffortLevel.MEDIUM,
  liaison_ants: EffortLevel.LOW,
  ledger_ants: EffortLevel.LOW,
  watcher_swarm: EffortLevel.LOW,
};

export function parseEffortLevel(value: string): EffortLevel {
  const normalized = value.trim().toLowerCase();
  if (normalized === EffortLevel.LOW) return EffortLevel.LOW;
  if (normalized === EffortLevel.MEDIUM) return EffortLevel.MEDIUM;
  if (normalized === EffortLevel.HIGH) return EffortLevel.HIGH;
  if (normalized === EffortLevel.MAX) return EffortLevel.MAX;
  return EffortLevel.MEDIUM;
}

export function modelSupportsEffort(modelId: string): boolean {
  for (const known of EFFORT_SUPPORTED_MODELS) {
    if (modelId.startsWith(known)) return true;
  }
  return false;
}

export function modelSupportsMaxEffort(modelId: string): boolean {
  for (const known of MAX_EFFORT_MODELS) {
    if (modelId.startsWith(known)) return true;
  }
  return false;
}

export class EffortResolver {
  private readonly agentOverrides = new Map<string, EffortLevel>();

  constructor(agentOverrides: Record<string, EffortLevel | string> = {}) {
    for (const [agentId, level] of Object.entries(agentOverrides)) {
      this.agentOverrides.set(
        agentId,
        typeof level === "string" ? parseEffortLevel(level) : level,
      );
    }
  }

  setAgentEffort(agentId: string, level: EffortLevel | string): void {
    this.agentOverrides.set(
      agentId,
      typeof level === "string" ? parseEffortLevel(level) : level,
    );
  }

  clearAgentEffort(agentId: string): void {
    this.agentOverrides.delete(agentId);
  }

  resolve(opts: {
    agentId?: string;
    caste?: string;
    modelId?: string;
  } = {}): EffortLevel {
    const modelId = opts.modelId ?? "";
    const envValue = process.env.COLONY_EFFORT_LEVEL ?? "";
    if (envValue) {
      return this.gateMax(parseEffortLevel(envValue), modelId);
    }

    if (opts.agentId && this.agentOverrides.has(opts.agentId)) {
      return this.gateMax(this.agentOverrides.get(opts.agentId)!, modelId);
    }

    if (opts.caste) {
      const direct = CASTE_EFFORT_DEFAULTS[opts.caste];
      const upper = CASTE_EFFORT_DEFAULTS[opts.caste.toUpperCase()];
      const lower = CASTE_EFFORT_DEFAULTS[opts.caste.toLowerCase()];
      if (direct ?? upper ?? lower) {
        return this.gateMax((direct ?? upper ?? lower)!, modelId);
      }
    }

    return EffortLevel.MEDIUM;
  }

  toApiParams(level: EffortLevel, modelId = ""): Record<string, unknown> {
    const params: Record<string, unknown> = { effort_level: level };
    const isAnthropic = modelId.startsWith("claude-");
    const isOllama = !["claude-", "gpt-", "o1", "o3", "gemini-"].some((prefix) =>
      modelId.startsWith(prefix)
    );

    if (isAnthropic && modelSupportsEffort(modelId)) {
      const budgetMap: Record<EffortLevel, number> = {
        [EffortLevel.LOW]: 1024,
        [EffortLevel.MEDIUM]: 4096,
        [EffortLevel.HIGH]: 10240,
        [EffortLevel.MAX]: 32768,
      };
      params.thinking = { budget_tokens: budgetMap[level] ?? 4096 };
    } else if (isOllama) {
      const predictMap: Record<EffortLevel, number> = {
        [EffortLevel.LOW]: 1024,
        [EffortLevel.MEDIUM]: 2048,
        [EffortLevel.HIGH]: 4096,
        [EffortLevel.MAX]: 8192,
      };
      params.num_predict = predictMap[level] ?? 2048;
    }

    return params;
  }

  private gateMax(level: EffortLevel, modelId: string): EffortLevel {
    if (level === EffortLevel.MAX && modelId && !modelSupportsMaxEffort(modelId)) {
      return EffortLevel.HIGH;
    }
    return level;
  }
}
