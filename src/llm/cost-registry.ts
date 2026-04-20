/**
 * Per-model cost registry with cache-aware pricing.
 *
 * 1:1 port of colony/llm/cost_registry.py — maps model identifiers to
 * input/output/cache token costs in USD. Handles Ollama and other local
 * models as zero-cost.
 *
 * Costs are per-token (not per-1K tokens) to avoid division errors.
 */

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

export interface ModelPricing {
  inputPerToken: number;
  outputPerToken: number;
  cacheReadPerToken: number;
  cacheCreationPerToken: number;
  isFree: boolean;
}

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheCreationCost: number;
  totalUsd: number;
  cacheSavingsUsd: number;
  model: string;
}

// ---------------------------------------------------------------------------
// Pricing registry
// ---------------------------------------------------------------------------

const FREE: ModelPricing = {
  inputPerToken: 0,
  outputPerToken: 0,
  cacheReadPerToken: 0,
  cacheCreationPerToken: 0,
  isFree: true,
};

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic
  "claude-opus-4-6": {
    inputPerToken: 15e-6, outputPerToken: 75e-6,
    cacheReadPerToken: 1.5e-6, cacheCreationPerToken: 18.75e-6, isFree: false,
  },
  "claude-sonnet-4-6": {
    inputPerToken: 3e-6, outputPerToken: 15e-6,
    cacheReadPerToken: 0.3e-6, cacheCreationPerToken: 3.75e-6, isFree: false,
  },
  "claude-sonnet-4-5": {
    inputPerToken: 3e-6, outputPerToken: 15e-6,
    cacheReadPerToken: 0.3e-6, cacheCreationPerToken: 3.75e-6, isFree: false,
  },
  "claude-haiku-3-5": {
    inputPerToken: 0.8e-6, outputPerToken: 4e-6,
    cacheReadPerToken: 0.08e-6, cacheCreationPerToken: 1e-6, isFree: false,
  },
  // OpenAI
  "gpt-4o": {
    inputPerToken: 2.5e-6, outputPerToken: 10e-6,
    cacheReadPerToken: 1.25e-6, cacheCreationPerToken: 2.5e-6, isFree: false,
  },
  "gpt-4o-mini": {
    inputPerToken: 0.15e-6, outputPerToken: 0.6e-6,
    cacheReadPerToken: 0.075e-6, cacheCreationPerToken: 0.15e-6, isFree: false,
  },
  "o3": {
    inputPerToken: 10e-6, outputPerToken: 40e-6,
    cacheReadPerToken: 2.5e-6, cacheCreationPerToken: 10e-6, isFree: false,
  },
  "o3-mini": {
    inputPerToken: 1.1e-6, outputPerToken: 4.4e-6,
    cacheReadPerToken: 0, cacheCreationPerToken: 0, isFree: false,
  },
  // Google Gemini
  "gemini-2.5-pro": {
    inputPerToken: 1.25e-6, outputPerToken: 10e-6,
    cacheReadPerToken: 0, cacheCreationPerToken: 0, isFree: false,
  },
  "gemini-2.5-flash": {
    inputPerToken: 0.15e-6, outputPerToken: 0.6e-6,
    cacheReadPerToken: 0, cacheCreationPerToken: 0, isFree: false,
  },
  "gemini-2.0-flash": {
    inputPerToken: 0.1e-6, outputPerToken: 0.4e-6,
    cacheReadPerToken: 0, cacheCreationPerToken: 0, isFree: false,
  },
  "gemini-1.5-pro": {
    inputPerToken: 1.25e-6, outputPerToken: 5e-6,
    cacheReadPerToken: 0, cacheCreationPerToken: 0, isFree: false,
  },
  "gemini-1.5-flash": {
    inputPerToken: 0.075e-6, outputPerToken: 0.3e-6,
    cacheReadPerToken: 0, cacheCreationPerToken: 0, isFree: false,
  },
  // Local / Ollama (zero-cost)
  "llama3.1": FREE,
  "llama3.2": FREE,
  "codellama": FREE,
  "mistral": FREE,
  "mixtral": FREE,
  "qwen2.5": FREE,
  "deepseek-coder-v2": FREE,
  "phi-3": FREE,
  "gemma2": FREE,
};

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export function getModelPricing(modelId: string): ModelPricing {
  // Exact match
  if (modelId in MODEL_PRICING) return MODEL_PRICING[modelId];

  // Prefix match
  for (const [known, pricing] of Object.entries(MODEL_PRICING)) {
    if (modelId.startsWith(known)) return pricing;
  }

  // Ollama-style models
  if (modelId.includes("/") || (/^[a-z]+$/.test(modelId))) {
    return FREE;
  }

  console.warn(
    `[cost_registry] Unknown model '${modelId}', using zero-cost fallback.`,
  );
  return FREE;
}

// ---------------------------------------------------------------------------
// Calculate cost
// ---------------------------------------------------------------------------

export function calculateCost(
  model: string,
  opts: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
  } = {},
): CostBreakdown {
  const pricing = getModelPricing(model);
  const inputTokens = opts.inputTokens ?? 0;
  const outputTokens = opts.outputTokens ?? 0;
  const cacheReadTokens = opts.cacheReadTokens ?? 0;
  const cacheCreationTokens = opts.cacheCreationTokens ?? 0;

  const inputCost = inputTokens * pricing.inputPerToken;
  const outputCost = outputTokens * pricing.outputPerToken;
  const cacheReadCost = cacheReadTokens * pricing.cacheReadPerToken;
  const cacheCreationCost = cacheCreationTokens * pricing.cacheCreationPerToken;

  const total = inputCost + outputCost + cacheReadCost + cacheCreationCost;

  let savings = 0;
  if (cacheReadTokens > 0 && pricing.inputPerToken > 0) {
    const fullPrice = cacheReadTokens * pricing.inputPerToken;
    savings = fullPrice - cacheReadCost;
  }

  return {
    inputCost,
    outputCost,
    cacheReadCost,
    cacheCreationCost,
    totalUsd: total,
    cacheSavingsUsd: savings,
    model,
  };
}
