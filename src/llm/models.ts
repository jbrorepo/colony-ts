/**
 * Normalized response models shared across all LLM providers.
 *
 * 1:1 port of colony/llm/models.py — every provider translates its native
 * response into these models so the rest of The Colony never couples to
 * a specific vendor SDK.
 */

import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Input message (internal Colony format)
// ---------------------------------------------------------------------------

export interface LLMMessage {
  /** Role: "system" | "user" | "assistant" | "tool" */
  role: string;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Token usage
// ---------------------------------------------------------------------------

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function emptyTokenUsage(): TokenUsage {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}

// ---------------------------------------------------------------------------
// Completion response
// ---------------------------------------------------------------------------

export interface LLMResponse {
  content: string;
  model: string;
  provider: string;
  usage: TokenUsage;
  finishReason: string;
  traceId: string;
  timestamp: string;
  rawResponse?: Record<string, unknown>;
}

export function createLLMResponse(
  content: string,
  model: string,
  provider: string,
  opts?: Partial<Omit<LLMResponse, "content" | "model" | "provider">>,
): LLMResponse {
  return {
    content,
    model,
    provider,
    usage: opts?.usage ?? emptyTokenUsage(),
    finishReason: opts?.finishReason ?? "",
    traceId: opts?.traceId ?? randomUUID().replace(/-/g, "").slice(0, 16),
    timestamp: opts?.timestamp ?? new Date().toISOString(),
    rawResponse: opts?.rawResponse,
  };
}

// ---------------------------------------------------------------------------
// Streaming chunk
// ---------------------------------------------------------------------------

export interface LLMChunk {
  delta: string;
  model: string;
  finishReason: string | null;
  toolCalls?: Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Model information
// ---------------------------------------------------------------------------

export interface ModelInfo {
  modelId: string;
  provider: string;
  contextWindow: number;
  supportsStreaming: boolean;
  supportsEmbedding: boolean;
  supportsToolUse: boolean;
}
