/**
 * Abstract base class for LLM providers.
 *
 * 1:1 port of colony/llm/base.py — every concrete provider extends
 * LLMProvider and implements the four required methods.
 */

import type {
  LLMChunk,
  LLMMessage,
  LLMResponse,
  ModelInfo,
} from "./models";

// ---------------------------------------------------------------------------
// LLMProvider (abstract contract)
// ---------------------------------------------------------------------------

export interface CompletionParams {
  model?: string;
  tenantScope?: string;
  caste?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  tools?: Record<string, unknown>[];
  toolChoice?: string | Record<string, unknown>;
  responseFormat?: Record<string, unknown>;
  [key: string]: unknown;
}

export abstract class LLMProvider {
  readonly providerName: string;

  constructor(providerName: string) {
    this.providerName = providerName;
  }

  /**
   * Send a non-streaming chat completion request.
   * Returns a normalized LLMResponse.
   */
  abstract complete(
    messages: LLMMessage[],
    params?: CompletionParams,
  ): Promise<LLMResponse>;

  /**
   * Send a streaming chat completion request.
   * Yields LLMChunk objects as the provider generates tokens.
   */
  abstract stream(
    messages: LLMMessage[],
    params?: CompletionParams,
  ): AsyncIterable<LLMChunk>;

  /**
   * Return True if the provider is reachable and operational.
   */
  abstract healthCheck(): Promise<boolean>;

  /**
   * Return metadata for models available on this provider.
   */
  abstract listModels(): ModelInfo[];

  /**
   * Generate embedding vectors for the given texts.
   * Not all providers support embeddings.
   */
  async embed(
    _texts: string[],
    _opts?: { model?: string; tenantScope?: string },
  ): Promise<number[][]> {
    throw new Error(
      `Provider '${this.providerName}' does not support embeddings`,
    );
  }
}
