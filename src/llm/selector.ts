/**
 * Model selector — resolves which provider + model to use for a request.
 *
 * 1:1 port of colony/llm/selector.py — implements a layered resolution:
 *   1. Caste-specific override
 *   2. Task-type override
 *   3. Tenant default
 *   4. Global default
 *
 * Returns an ordered list of ModelCandidate objects for the FailoverExecutor.
 */

import { LLMConfigError } from "./exceptions";

// ---------------------------------------------------------------------------
// ModelCandidate
// ---------------------------------------------------------------------------

export interface ModelCandidate {
  providerName: string;
  modelId: string;
  source: string; // "caste" | "task_type" | "tenant" | "global" | "failover" | "fallback"
}

// ---------------------------------------------------------------------------
// Default caste → model mapping
// ---------------------------------------------------------------------------

const DEFAULT_CASTE_MODELS: Record<string, { provider: string; model: string }> = {
  root_queen: { provider: "anthropic", model: "claude-opus-4-6" },
  eldest_architect: { provider: "anthropic", model: "claude-opus-4-6" },
  shield_generals: { provider: "gemini", model: "gemini-2.5-pro" },
  watcher_swarm: { provider: "local", model: "llama3.1" },
  forge_carvers: { provider: "local", model: "codellama" },
  nameless_swarm: { provider: "local", model: "llama3.1" },
};

// ---------------------------------------------------------------------------
// LLMConfig (simplified for standalone use)
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  defaultModel: string;
  apiKey?: string;
  [key: string]: unknown;
}

export interface LLMConfig {
  defaults: {
    provider: string;
    model?: string;
  };
  providers: Record<string, ProviderConfig>;
  casteModels: Record<string, { provider: string; model: string }>;
  taskTypeModels?: Record<string, { provider: string; model: string }>;
  tenantDefaults?: Record<string, { provider: string; model: string }>;
  failover: Record<string, string[]>;
}

export function defaultLLMConfig(): LLMConfig {
  return {
    defaults: { provider: "local" },
    providers: {
      local: { defaultModel: "llama3.1" },
    },
    casteModels: {},
    failover: {},
  };
}

// ---------------------------------------------------------------------------
// ModelSelector
// ---------------------------------------------------------------------------

export class ModelSelector {
  private _config: LLMConfig;

  constructor(config?: LLMConfig) {
    this._config = config ?? defaultLLMConfig();
  }

  get config(): LLMConfig {
    return this._config;
  }

  reload(config: LLMConfig): void {
    this._config = config;
  }

  select(opts?: {
    caste?: string;
    taskType?: string;
    tenantScope?: string;
  }): ModelCandidate[] {
    const cfg = this._config;
    const caste = opts?.caste;
    const taskType = opts?.taskType;
    const tenantScope = opts?.tenantScope ?? "default";
    const candidates: ModelCandidate[] = [];

    // 1. Caste-specific override
    if (caste) {
      const casteKey = caste.toLowerCase().replace(/ /g, "_");
      let mapping = cfg.casteModels[casteKey];
      if (!mapping) {
        mapping = DEFAULT_CASTE_MODELS[casteKey];
      }
      if (mapping?.provider && mapping?.model) {
        candidates.push({
          providerName: mapping.provider,
          modelId: mapping.model,
          source: "caste",
        });
      }
    }

    // 2. Task-type override
    if (taskType && candidates.length === 0 && cfg.taskTypeModels) {
      const mapping = cfg.taskTypeModels[taskType.toLowerCase()];
      if (mapping?.provider && mapping?.model) {
        candidates.push({
          providerName: mapping.provider,
          modelId: mapping.model,
          source: "task_type",
        });
      }
    }

    // 3. Tenant default
    if (candidates.length === 0 && tenantScope !== "default" && cfg.tenantDefaults) {
      const mapping = cfg.tenantDefaults[tenantScope];
      if (mapping?.provider && mapping?.model) {
        candidates.push({
          providerName: mapping.provider,
          modelId: mapping.model,
          source: "tenant",
        });
      }
    }

    // 4. Global default
    if (candidates.length === 0) {
      const defaultProviderName = cfg.defaults.provider;
      const provCfg = cfg.providers[defaultProviderName];
      if (provCfg) {
        candidates.push({
          providerName: defaultProviderName,
          modelId: provCfg.defaultModel || "llama3.1",
          source: "global",
        });
      } else {
        throw new LLMConfigError(
          `No model candidates resolved for caste=${caste}, ` +
          `task_type=${taskType}, tenant=${tenantScope} ` +
          `and default provider '${defaultProviderName}' is not configured.`,
        );
      }
    }

    // Append failover chain for the primary candidate
    const primary = candidates[0];
    const failoverChain = cfg.failover[primary.providerName] ?? [];
    for (const foProvider of failoverChain) {
      const foCfg = cfg.providers[foProvider];
      if (foCfg) {
        candidates.push({
          providerName: foProvider,
          modelId: foCfg.defaultModel || "llama3.1",
          source: "failover",
        });
      }
    }

    // Always ensure local fallback is in the chain
    const providerNamesInChain = new Set(candidates.map((c) => c.providerName));
    if (!providerNamesInChain.has("local") && !providerNamesInChain.has("default")) {
      for (const fallbackName of ["local", "default"]) {
        if (fallbackName in cfg.providers) {
          const fbCfg = cfg.providers[fallbackName];
          candidates.push({
            providerName: fallbackName,
            modelId: fbCfg.defaultModel || "llama3.1",
            source: "fallback",
          });
          break;
        }
      }
    }

    return candidates;
  }

  getCasteMapping(): Record<string, { provider: string; model: string }> {
    return { ...DEFAULT_CASTE_MODELS, ...this._config.casteModels };
  }

  getConfiguredProviders(): string[] {
    return Object.keys(this._config.providers).sort();
  }

  getFailoverChain(providerName: string): string[] {
    return [...(this._config.failover[providerName] ?? [])];
  }
}
