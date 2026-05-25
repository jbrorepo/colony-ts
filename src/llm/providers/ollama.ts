/**
 * Ollama LLM provider — local-first inference with zero API cost.
 *
 * 1:1 port of colony/llm/providers/ollama_provider.py.
 * Uses raw fetch() — no npm dependencies. Connects to a local Ollama
 * instance for privacy-preserving, zero-cost inference.
 *
 * Configuration:
 *   - COLONY_OLLAMA_BASE_URL (default: http://localhost:11434)
 *   - COLONY_OLLAMA_MODEL    (default: llama3.2)
 */

import { randomUUID } from "crypto";
import { LLMProvider, type CompletionParams } from "../base";
import { LLMConnectionError, LLMResponseError } from "../exceptions";
import {
  type LLMChunk,
  type LLMMessage,
  type LLMResponse,
  type ModelInfo,
  type TokenUsage,
  createLLMResponse,
  emptyTokenUsage,
} from "../models";

// ---------------------------------------------------------------------------
// Known Ollama model metadata
// ---------------------------------------------------------------------------

const KNOWN_MODELS: Record<string, { context: number; tools: boolean }> = {
  "llama3.2": { context: 128_000, tools: true },
  "llama3.1": { context: 128_000, tools: true },
  "llama3.2:1b": { context: 128_000, tools: false },
  mistral: { context: 32_000, tools: true },
  mixtral: { context: 32_000, tools: true },
  phi3: { context: 128_000, tools: false },
  gemma2: { context: 8_192, tools: false },
  "qwen2.5": { context: 32_000, tools: true },
  "deepseek-coder-v2": { context: 128_000, tools: false },
  codellama: { context: 16_384, tools: false },
};

// ---------------------------------------------------------------------------
// OllamaProvider
// ---------------------------------------------------------------------------

export class OllamaProvider extends LLMProvider {
  private _baseUrl: string;
  private _defaultModel: string;
  private _timeout: number;
  private _availableModels: string[] = [];

  constructor(opts?: {
    baseUrl?: string;
    defaultModel?: string;
    timeout?: number;
    providerName?: string;
  }) {
    super(opts?.providerName ?? "ollama");
    this._baseUrl = (
      opts?.baseUrl ??
      process.env.COLONY_OLLAMA_BASE_URL ??
      "http://localhost:11434"
    ).replace(/\/+$/, "");
    this._defaultModel =
      process.env.COLONY_OLLAMA_MODEL ?? opts?.defaultModel ?? "llama3.2";
    this._timeout = (opts?.timeout ?? 120) * 1000;
  }

  // -- complete() -----------------------------------------------------------

  async complete(
    messages: LLMMessage[],
    params?: CompletionParams,
  ): Promise<LLMResponse> {
    const model = params?.model ?? this._defaultModel;

    const payload: Record<string, unknown> = {
      model,
      messages: this._convertMessages(messages),
      stream: false,
    };

    const options: Record<string, unknown> = {};
    if (params?.temperature != null) options.temperature = params.temperature;
    if (params?.topP != null) options.top_p = params.topP;
    const numPredict = params?.maxTokens ?? (
      typeof params?.num_predict === "number" ? params.num_predict : undefined
    );
    if (numPredict != null) options.num_predict = numPredict;
    if (params?.stop) options.stop = params.stop;
    if (Object.keys(options).length > 0) payload.options = options;

    if (params?.tools) payload.tools = params.tools;
    if (
      params?.responseFormat &&
      (params.responseFormat as Record<string, string>).type === "json_object"
    ) {
      payload.format = "json";
    }

    const url = `${this._baseUrl}/api/chat`;

    let data: Record<string, unknown>;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this._timeout);
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) {
        const body = await resp.text();
        throw new LLMResponseError(
          `Ollama returned ${resp.status}: ${body}`,
          { provider: this.providerName, statusCode: resp.status },
        );
      }

      data = (await resp.json()) as Record<string, unknown>;
    } catch (e) {
      if (e instanceof LLMResponseError) throw e;
      throw new LLMConnectionError(
        `Cannot connect to Ollama at ${this._baseUrl}: ${e}`,
        { provider: this.providerName },
      );
    }

    // Parse response
    const messageData = (data.message ?? {}) as Record<string, unknown>;
    const content = String(messageData.content ?? "");

    // Capture chain-of-thought from reasoning-capable models (Gemma 4 and
    // similar Ollama-hosted reasoning models). Ollama surfaces this under
    // `message.thinking`. Forward it as LLMResponse.reasoning so callers
    // can diagnose empty-content + done_reason=length cases instead of
    // silently dropping the entire model contribution.
    const thinkingRaw = messageData.thinking;
    const reasoning = typeof thinkingRaw === "string" && thinkingRaw.length > 0
      ? thinkingRaw
      : undefined;

    // Parse tool calls
    let rawResponse: Record<string, unknown> | undefined;
    const toolCallsData = (messageData.tool_calls ?? []) as Record<string, unknown>[];
    if (toolCallsData.length > 0) {
      rawResponse = {
        tool_calls: toolCallsData.map((tc) => {
          const fn = (tc.function ?? {}) as Record<string, unknown>;
          return {
            id: `call_${randomUUID().replace(/-/g, "").slice(0, 8)}`,
            type: "function",
            function: {
              name: String(fn.name ?? ""),
              arguments: JSON.stringify(fn.arguments ?? {}),
            },
          };
        }),
      };
    }

    // Token usage
    const promptTokens = Number(data.prompt_eval_count ?? 0);
    const completionTokens = Number(data.eval_count ?? 0);
    const usage: TokenUsage = {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };

    // Finish reason
    let finishReason = "stop";
    if (data.done_reason === "length") finishReason = "length";
    else if (toolCallsData.length > 0) finishReason = "tool_calls";

    return createLLMResponse(content, model, this.providerName, {
      usage,
      finishReason,
      rawResponse,
      reasoning,
    });
  }

  // -- stream() -------------------------------------------------------------

  async *stream(
    messages: LLMMessage[],
    params?: CompletionParams,
  ): AsyncIterable<LLMChunk> {
    const model = params?.model ?? this._defaultModel;

    const payload: Record<string, unknown> = {
      model,
      messages: this._convertMessages(messages),
      stream: true,
    };

    const options: Record<string, unknown> = {};
    if (params?.temperature != null) options.temperature = params.temperature;
    const numPredict = params?.maxTokens ?? (
      typeof params?.num_predict === "number" ? params.num_predict : undefined
    );
    if (numPredict != null) options.num_predict = numPredict;
    if (Object.keys(options).length > 0) payload.options = options;
    if (params?.tools) payload.tools = params.tools;

    const url = `${this._baseUrl}/api/chat`;

    let resp: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this._timeout);
      resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) {
        const body = await resp.text();
        throw new LLMResponseError(
          `Ollama stream error ${resp.status}: ${body}`,
          { provider: this.providerName, statusCode: resp.status },
        );
      }
    } catch (e) {
      if (e instanceof LLMResponseError) throw e;
      throw new LLMConnectionError(
        `Ollama stream connection error: ${e}`,
        { provider: this.providerName },
      );
    }

    // Parse NDJSON stream
    const reader = resp.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const data = JSON.parse(trimmed) as Record<string, unknown>;
          const msg = (data.message ?? {}) as Record<string, unknown>;
          const delta = String(msg.content ?? "");
          const isDone = Boolean(data.done);
          const toolCallsData = (msg.tool_calls ?? []) as Record<string, unknown>[];
          const toolCalls = toolCallsData.length > 0
            ? toolCallsData.map((tc) => {
                const fn = (tc.function ?? {}) as Record<string, unknown>;
                return {
                  id: `call_${randomUUID().replace(/-/g, "").slice(0, 8)}`,
                  type: "function",
                  function: {
                    name: String(fn.name ?? ""),
                    arguments: JSON.stringify(fn.arguments ?? {}),
                  },
                };
              })
            : undefined;

          yield {
            delta,
            model,
            finishReason: toolCalls?.length ? "tool_calls" : isDone ? "stop" : null,
            toolCalls,
          };

          if (isDone) return;
        } catch {
          continue;
        }
      }
    }
  }

  // -- healthCheck() --------------------------------------------------------

  async healthCheck(): Promise<boolean> {
    try {
      const resp = await fetch(`${this._baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const data = (await resp.json()) as Record<string, unknown>;
        const models = (data.models ?? []) as Record<string, unknown>[];
        this._availableModels = models.map((m) => String(m.name ?? ""));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // -- listModels() ---------------------------------------------------------

  listModels(): ModelInfo[] {
    const modelNames =
      this._availableModels.length > 0
        ? this._availableModels
        : Object.keys(KNOWN_MODELS);

    return modelNames.map((name) => {
      const info = KNOWN_MODELS[name.split(":")[0]] ?? {};
      return {
        modelId: name,
        provider: this.providerName,
        contextWindow: info.context ?? 4096,
        supportsStreaming: true,
        supportsEmbedding: false,
        supportsToolUse: info.tools ?? false,
      };
    });
  }

  // -- Internal -------------------------------------------------------------

  private _convertMessages(
    messages: LLMMessage[],
  ): Record<string, unknown>[] {
    return messages.map((msg) => {
      const entry: Record<string, unknown> = {
        role: msg.role,
        content: msg.content,
      };
      if (msg.toolCalls) entry.tool_calls = msg.toolCalls;
      if (msg.toolCallId) entry.tool_call_id = msg.toolCallId;
      return entry;
    });
  }
}
