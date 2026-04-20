/**
 * OpenAI-compatible LLM provider — works with OpenAI, OpenRouter, Together, etc.
 *
 * 1:1 port of colony/llm/providers/openai_compatible.py.
 * Uses raw fetch() against any OpenAI-compatible chat completions endpoint.
 */

import { LLMProvider, type CompletionParams } from "../base";
import {
  LLMConfigError,
  LLMConnectionError,
  LLMRateLimitError,
  LLMResponseError,
} from "../exceptions";
import {
  type LLMChunk,
  type LLMMessage,
  type LLMResponse,
  type ModelInfo,
  type TokenUsage,
  createLLMResponse,
} from "../models";

// ---------------------------------------------------------------------------
// OpenAICompatibleProvider
// ---------------------------------------------------------------------------

export class OpenAICompatibleProvider extends LLMProvider {
  private _apiKey: string;
  private _apiBase: string;
  private _defaultModel: string;
  private _timeout: number;

  constructor(opts?: {
    apiKey?: string;
    apiBase?: string;
    defaultModel?: string;
    timeout?: number;
    providerName?: string;
  }) {
    super(opts?.providerName ?? "openai");
    this._apiKey =
      opts?.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this._apiBase = (
      opts?.apiBase ?? process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1"
    ).replace(/\/+$/, "");
    this._defaultModel =
      opts?.defaultModel ?? "gpt-4o";
    this._timeout = (opts?.timeout ?? 120) * 1000;

    if (!this._apiKey) {
      throw new LLMConfigError(
        "OpenAI-compatible provider requires an API key. Set OPENAI_API_KEY.",
        { provider: this.providerName },
      );
    }
  }

  // -- complete() -----------------------------------------------------------

  async complete(
    messages: LLMMessage[],
    params?: CompletionParams,
  ): Promise<LLMResponse> {
    const model = params?.model ?? this._defaultModel;

    const body: Record<string, unknown> = {
      model,
      messages: this._convertMessages(messages),
      stream: false,
    };
    if (params?.temperature != null) body.temperature = params.temperature;
    if (params?.topP != null) body.top_p = params.topP;
    if (params?.maxTokens != null) body.max_tokens = params.maxTokens;
    if (params?.stop) body.stop = params.stop;
    if (params?.tools) body.tools = params.tools;
    if (params?.toolChoice) body.tool_choice = params.toolChoice;
    if (params?.responseFormat) body.response_format = params.responseFormat;

    let data: Record<string, unknown>;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this._timeout);
      const resp = await fetch(`${this._apiBase}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this._apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) {
        const errBody = await resp.text();
        throw this._mapHttpError(resp.status, errBody);
      }

      data = (await resp.json()) as Record<string, unknown>;
    } catch (e) {
      if (
        e instanceof LLMResponseError ||
        e instanceof LLMConnectionError ||
        e instanceof LLMRateLimitError
      )
        throw e;
      throw new LLMConnectionError(
        `Cannot connect to OpenAI-compatible API: ${e}`,
        { provider: this.providerName },
      );
    }

    // Parse standard OpenAI response
    const choices = (data.choices ?? []) as Record<string, unknown>[];
    const choice = choices[0] ?? {};
    const message = (choice.message ?? {}) as Record<string, unknown>;
    const content = String(message.content ?? "");
    const finishReason = String(choice.finish_reason ?? "stop");

    // Tool calls
    const toolCalls = (message.tool_calls ?? []) as Record<string, unknown>[];
    let rawResponse: Record<string, unknown> | undefined;
    if (toolCalls.length > 0) {
      rawResponse = { tool_calls: toolCalls };
    }

    // Usage
    const usageData = (data.usage ?? {}) as Record<string, unknown>;
    const promptDetails = (usageData.prompt_tokens_details ?? {}) as Record<string, number>;
    const usage: TokenUsage = {
      promptTokens: Number(usageData.prompt_tokens ?? 0),
      completionTokens: Number(usageData.completion_tokens ?? 0),
      totalTokens: Number(usageData.total_tokens ?? 0),
      cacheReadTokens: Number(promptDetails.cached_tokens ?? 0),
      cacheWriteTokens: 0,
    };

    return createLLMResponse(content, model, this.providerName, {
      usage,
      finishReason:
        finishReason === "tool_calls" ? "tool_calls" : finishReason,
      rawResponse,
    });
  }

  // -- stream() -------------------------------------------------------------

  async *stream(
    messages: LLMMessage[],
    params?: CompletionParams,
  ): AsyncIterable<LLMChunk> {
    const model = params?.model ?? this._defaultModel;

    const body: Record<string, unknown> = {
      model,
      messages: this._convertMessages(messages),
      stream: true,
    };
    if (params?.temperature != null) body.temperature = params.temperature;
    if (params?.maxTokens != null) body.max_tokens = params.maxTokens;
    if (params?.tools) body.tools = params.tools;
    if (params?.toolChoice) body.tool_choice = params.toolChoice;

    let resp: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this._timeout);
      resp = await fetch(`${this._apiBase}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this._apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) {
        const errBody = await resp.text();
        throw this._mapHttpError(resp.status, errBody);
      }
    } catch (e) {
      if (
        e instanceof LLMResponseError ||
        e instanceof LLMConnectionError ||
        e instanceof LLMRateLimitError
      )
        throw e;
      throw new LLMConnectionError(
        `OpenAI stream connection error: ${e}`,
        { provider: this.providerName },
      );
    }

    // Parse SSE
    const reader = resp.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";
    const toolCallParts = new Map<number, {
      id: string;
      name: string;
      arguments: string;
    }>();

    const assembledToolCalls = (): Record<string, unknown>[] =>
      Array.from(toolCallParts.entries())
        .sort(([a], [b]) => a - b)
        .map(([, part]) => ({
          id: part.id,
          type: "function",
          function: {
            name: part.name,
            arguments: part.arguments || "{}",
          },
        }));

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;

        try {
          const data = JSON.parse(jsonStr) as Record<string, unknown>;
          const choices = (data.choices ?? []) as Record<string, unknown>[];
          const choice = choices[0];
          if (!choice) continue;

          const delta = (choice.delta ?? {}) as Record<string, unknown>;
          const content = String(delta.content ?? "");
          const toolCallDeltas = (delta.tool_calls ?? []) as Record<string, unknown>[];
          for (const toolCallDelta of toolCallDeltas) {
            const index = Number(toolCallDelta.index ?? 0);
            const fn = (toolCallDelta.function ?? {}) as Record<string, unknown>;
            const current = toolCallParts.get(index) ?? {
              id: "",
              name: "",
              arguments: "",
            };
            current.id = String(toolCallDelta.id ?? current.id);
            current.name += String(fn.name ?? "");
            current.arguments += String(fn.arguments ?? "");
            toolCallParts.set(index, current);
          }
          const finishReason = choice.finish_reason
            ? String(choice.finish_reason)
            : null;

          if (content || finishReason || toolCallDeltas.length > 0) {
            yield {
              delta: content,
              model,
              finishReason:
                finishReason === "tool_calls" ? "tool_calls" : finishReason,
              toolCalls: finishReason === "tool_calls" ? assembledToolCalls() : undefined,
            };
          }
        } catch {
          continue;
        }
      }
    }
  }

  // -- healthCheck() --------------------------------------------------------

  async healthCheck(): Promise<boolean> {
    try {
      const resp = await fetch(`${this._apiBase}/models`, {
        headers: { Authorization: `Bearer ${this._apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  // -- listModels() ---------------------------------------------------------

  listModels(): ModelInfo[] {
    return [
      { modelId: "gpt-4o", provider: this.providerName, contextWindow: 128_000, supportsStreaming: true, supportsEmbedding: true, supportsToolUse: true },
      { modelId: "gpt-4o-mini", provider: this.providerName, contextWindow: 128_000, supportsStreaming: true, supportsEmbedding: true, supportsToolUse: true },
      { modelId: "gpt-4-turbo", provider: this.providerName, contextWindow: 128_000, supportsStreaming: true, supportsEmbedding: false, supportsToolUse: true },
      { modelId: "o3", provider: this.providerName, contextWindow: 200_000, supportsStreaming: true, supportsEmbedding: false, supportsToolUse: true },
      { modelId: "o3-mini", provider: this.providerName, contextWindow: 200_000, supportsStreaming: true, supportsEmbedding: false, supportsToolUse: true },
    ];
  }

  // -- Internal -------------------------------------------------------------

  private _convertMessages(messages: LLMMessage[]): Record<string, unknown>[] {
    return messages.map((msg) => {
      const entry: Record<string, unknown> = {
        role: msg.role,
        content: msg.content,
      };
      if (msg.toolCalls) entry.tool_calls = msg.toolCalls;
      if (msg.toolCallId) entry.tool_call_id = msg.toolCallId;
      if (msg.name) entry.name = msg.name;
      return entry;
    });
  }

  private _mapHttpError(
    status: number,
    body: string,
  ): LLMConnectionError | LLMRateLimitError | LLMResponseError {
    if (status === 429) {
      return new LLMRateLimitError(
        `Rate limited by OpenAI: ${body}`,
        { provider: this.providerName },
      );
    }
    if (status === 401) {
      return new LLMResponseError(
        `Authentication failed — check OPENAI_API_KEY`,
        { provider: this.providerName, statusCode: 401 },
      );
    }
    if (status >= 500) {
      return new LLMConnectionError(
        `Server error ${status}: ${body}`,
        { provider: this.providerName },
      );
    }
    return new LLMResponseError(`API error ${status}: ${body}`, {
      provider: this.providerName,
      statusCode: status,
    });
  }
}
