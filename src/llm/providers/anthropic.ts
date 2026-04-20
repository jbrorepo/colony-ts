/**
 * Anthropic LLM provider — Claude model family.
 *
 * 1:1 port of colony/llm/providers/anthropic_provider.py.
 * Uses raw fetch() against https://api.anthropic.com/v1/messages.
 * Zero npm dependencies — no Anthropic SDK required.
 *
 * Features:
 *   - System prompt extraction (Anthropic's separate `system` parameter)
 *   - Tool schema translation (OpenAI → Anthropic format)
 *   - SSE streaming via ReadableStream
 *   - Error mapping to Colony hierarchy
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
// Known Claude models
// ---------------------------------------------------------------------------

const KNOWN_MODELS: ModelInfo[] = [
  {
    modelId: "claude-opus-4-6",
    provider: "anthropic",
    contextWindow: 200_000,
    supportsStreaming: true,
    supportsEmbedding: false,
    supportsToolUse: true,
  },
  {
    modelId: "claude-sonnet-4-5-20250929",
    provider: "anthropic",
    contextWindow: 200_000,
    supportsStreaming: true,
    supportsEmbedding: false,
    supportsToolUse: true,
  },
  {
    modelId: "claude-haiku-4-5-20250929",
    provider: "anthropic",
    contextWindow: 200_000,
    supportsStreaming: true,
    supportsEmbedding: false,
    supportsToolUse: true,
  },
];

// ---------------------------------------------------------------------------
// AnthropicProvider
// ---------------------------------------------------------------------------

export class AnthropicProvider extends LLMProvider {
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
    super(opts?.providerName ?? "anthropic");
    this._apiKey =
      opts?.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    this._apiBase = (
      opts?.apiBase ?? "https://api.anthropic.com"
    ).replace(/\/+$/, "");
    this._defaultModel =
      opts?.defaultModel ?? "claude-sonnet-4-5-20250929";
    this._timeout = (opts?.timeout ?? 120) * 1000;

    if (!this._apiKey) {
      throw new LLMConfigError(
        "Anthropic provider requires an API key. Set ANTHROPIC_API_KEY.",
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
    const [systemPrompt, anthropicMessages] = this._translateMessages(messages);

    const body: Record<string, unknown> = {
      model,
      messages: anthropicMessages,
      max_tokens: params?.maxTokens ?? 4096,
    };
    if (systemPrompt) body.system = systemPrompt;
    if (params?.temperature != null) body.temperature = params.temperature;
    if (params?.topP != null) body.top_p = params.topP;
    if (params?.stop) body.stop_sequences = params.stop;
    if (params?.thinking) body.thinking = params.thinking;

    const tools = this._translateTools(params?.tools);
    if (tools) body.tools = tools;
    const toolChoice = this._translateToolChoice(params?.toolChoice);
    if (toolChoice) body.tool_choice = toolChoice;

    let data: Record<string, unknown>;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this._timeout);
      const resp = await fetch(`${this._apiBase}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this._apiKey,
          "anthropic-version": "2023-06-01",
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
        `Cannot connect to Anthropic API: ${e}`,
        { provider: this.providerName },
      );
    }

    // Extract text content
    const contentBlocks = (data.content ?? []) as Record<string, unknown>[];
    let content = "";
    const rawToolCalls: Record<string, unknown>[] = [];
    for (const block of contentBlocks) {
      if (block.type === "text") content += String(block.text ?? "");
      if (block.type === "tool_use") {
        rawToolCalls.push({
          id: String(block.id ?? ""),
          type: "function",
          function: {
            name: String(block.name ?? ""),
            arguments: JSON.stringify(block.input ?? {}),
          },
        });
      }
    }

    // Token usage
    const usageData = (data.usage ?? {}) as Record<string, number>;
    const usage: TokenUsage = {
      promptTokens: usageData.input_tokens ?? 0,
      completionTokens: usageData.output_tokens ?? 0,
      totalTokens:
        (usageData.input_tokens ?? 0) + (usageData.output_tokens ?? 0),
      cacheReadTokens: usageData.cache_read_input_tokens ?? 0,
      cacheWriteTokens: usageData.cache_creation_input_tokens ?? 0,
    };

    const finishReason = this._mapStopReason(
      String(data.stop_reason ?? ""),
    );

    const rawResponse =
      rawToolCalls.length > 0 ? { tool_calls: rawToolCalls } : undefined;

    return createLLMResponse(content, model, this.providerName, {
      usage,
      finishReason,
      rawResponse,
    });
  }

  // -- stream() -------------------------------------------------------------

  async *stream(
    messages: LLMMessage[],
    params?: CompletionParams,
  ): AsyncIterable<LLMChunk> {
    const model = params?.model ?? this._defaultModel;
    const [systemPrompt, anthropicMessages] = this._translateMessages(messages);

    const body: Record<string, unknown> = {
      model,
      messages: anthropicMessages,
      max_tokens: params?.maxTokens ?? 4096,
      stream: true,
    };
    if (systemPrompt) body.system = systemPrompt;
    if (params?.temperature != null) body.temperature = params.temperature;
    if (params?.thinking) body.thinking = params.thinking;

    const tools = this._translateTools(params?.tools);
    if (tools) body.tools = tools;

    let resp: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this._timeout);
      resp = await fetch(`${this._apiBase}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this._apiKey,
          "anthropic-version": "2023-06-01",
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
        `Anthropic stream connection error: ${e}`,
        { provider: this.providerName },
      );
    }

    // Parse SSE stream
    const reader = resp.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";
    const toolUseParts = new Map<number, {
      id: string;
      name: string;
      inputJson: string;
    }>();

    const assembledToolCalls = (): Record<string, unknown>[] =>
      Array.from(toolUseParts.entries())
        .sort(([a], [b]) => a - b)
        .map(([, part]) => {
          let parsedInput: unknown = {};
          try {
            parsedInput = part.inputJson ? JSON.parse(part.inputJson) : {};
          } catch {
            parsedInput = {};
          }
          return {
            id: part.id,
            type: "function",
            function: {
              name: part.name,
              arguments: JSON.stringify(parsedInput),
            },
          };
        });

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
          const event = JSON.parse(jsonStr) as Record<string, unknown>;
          const eventType = String(event.type ?? "");

          if (eventType === "content_block_start") {
            const index = Number(event.index ?? 0);
            const block = (event.content_block ?? {}) as Record<string, unknown>;
            if (block.type === "tool_use") {
              toolUseParts.set(index, {
                id: String(block.id ?? ""),
                name: String(block.name ?? ""),
                inputJson: "",
              });
            }
          } else if (eventType === "content_block_delta") {
            const index = Number(event.index ?? 0);
            const delta = (event.delta ?? {}) as Record<string, unknown>;
            if (delta.type === "text_delta") {
              yield {
                delta: String(delta.text ?? ""),
                model,
                finishReason: null,
              };
            } else if (delta.type === "input_json_delta") {
              const part = toolUseParts.get(index);
              if (part) {
                part.inputJson += String(delta.partial_json ?? "");
                toolUseParts.set(index, part);
              }
            }
          } else if (eventType === "message_delta") {
            const delta = (event.delta ?? {}) as Record<string, unknown>;
            const stopReason = delta.stop_reason
              ? String(delta.stop_reason)
              : null;
            if (stopReason) {
              const mapped = this._mapStopReason(stopReason);
              yield {
                delta: "",
                model,
                finishReason: mapped,
                toolCalls: mapped === "tool_calls" ? assembledToolCalls() : undefined,
              };
            }
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
      const resp = await fetch(`${this._apiBase}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this._apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this._defaultModel,
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: AbortSignal.timeout(10000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  // -- listModels() ---------------------------------------------------------

  listModels(): ModelInfo[] {
    return KNOWN_MODELS.map((m) => ({
      ...m,
      provider: this.providerName,
    }));
  }

  // -- Internal: message translation ----------------------------------------

  private _translateMessages(
    messages: LLMMessage[],
  ): [string | null, Record<string, unknown>[]] {
    let systemPrompt: string | null = null;
    const result: Record<string, unknown>[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemPrompt =
          systemPrompt == null
            ? msg.content
            : systemPrompt + "\n\n" + msg.content;
        continue;
      }

      if (msg.role === "tool") {
        result.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.toolCallId ?? "",
              content: msg.content,
            },
          ],
        });
        continue;
      }

      if (msg.role === "assistant" && msg.toolCalls?.length) {
        const blocks: Record<string, unknown>[] = [];
        if (msg.content) blocks.push({ type: "text", text: msg.content });
        for (const tc of msg.toolCalls) {
          const raw = tc as Record<string, unknown>;
          const fn = raw.function as Record<string, unknown> | undefined;
          const args = fn?.arguments ?? raw.arguments ?? {};
          let input: unknown = args;
          if (typeof args === "string") {
            try {
              input = JSON.parse(args);
            } catch {
              input = {};
            }
          }
          blocks.push({
            type: "tool_use",
            id: String(raw.id ?? ""),
            name: String(fn?.name ?? raw.name ?? ""),
            input,
          });
        }
        result.push({ role: "assistant", content: blocks });
        continue;
      }

      result.push({ role: msg.role, content: msg.content });
    }

    return [systemPrompt, result];
  }

  // -- Internal: tool translation -------------------------------------------

  private _translateTools(
    tools?: Record<string, unknown>[],
  ): Record<string, unknown>[] | null {
    if (!tools?.length) return null;
    return tools.map((tool) => {
      const fn =
        (tool.function as Record<string, unknown>) ?? tool;
      return {
        name: String(fn.name ?? ""),
        description: String(fn.description ?? ""),
        input_schema: fn.parameters ?? {},
      };
    });
  }

  private _translateToolChoice(
    toolChoice?: string | Record<string, unknown>,
  ): Record<string, unknown> | null {
    if (!toolChoice) return null;
    if (typeof toolChoice === "string") {
      const map: Record<string, Record<string, unknown>> = {
        auto: { type: "auto" },
        none: { type: "auto" },
        required: { type: "any" },
      };
      return map[toolChoice] ?? { type: "auto" };
    }
    if (toolChoice.function) {
      const fn = toolChoice.function as Record<string, unknown>;
      return { type: "tool", name: String(fn.name ?? "") };
    }
    return null;
  }

  // -- Internal: error mapping ----------------------------------------------

  private _mapHttpError(
    status: number,
    body: string,
  ): LLMConnectionError | LLMRateLimitError | LLMResponseError {
    if (status === 429) {
      return new LLMRateLimitError(`Rate limited by Anthropic: ${body}`, {
        provider: this.providerName,
      });
    }
    if (status === 401) {
      return new LLMResponseError(
        `Authentication failed for Anthropic — check ANTHROPIC_API_KEY`,
        { provider: this.providerName, statusCode: 401 },
      );
    }
    if (status >= 500) {
      return new LLMConnectionError(
        `Anthropic server error ${status}: ${body}`,
        { provider: this.providerName },
      );
    }
    return new LLMResponseError(`Anthropic error ${status}: ${body}`, {
      provider: this.providerName,
      statusCode: status,
    });
  }

  private _mapStopReason(reason: string): string {
    const map: Record<string, string> = {
      end_turn: "stop",
      max_tokens: "length",
      stop_sequence: "stop",
      tool_use: "tool_calls",
    };
    return map[reason] ?? reason;
  }
}
