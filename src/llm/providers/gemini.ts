/**
 * Google Gemini LLM provider.
 *
 * Ported from colony/llm/providers/gemini_provider.py and adapted to the
 * Gemini REST API via raw fetch(). No Google SDK is used.
 */

import { randomUUID } from "crypto";
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

const KNOWN_MODELS: ModelInfo[] = [
  {
    modelId: "gemini-2.5-pro",
    provider: "gemini",
    contextWindow: 1_000_000,
    supportsStreaming: true,
    supportsEmbedding: false,
    supportsToolUse: true,
  },
  {
    modelId: "gemini-2.5-flash",
    provider: "gemini",
    contextWindow: 1_000_000,
    supportsStreaming: true,
    supportsEmbedding: false,
    supportsToolUse: true,
  },
  {
    modelId: "gemini-2.0-flash",
    provider: "gemini",
    contextWindow: 1_000_000,
    supportsStreaming: true,
    supportsEmbedding: false,
    supportsToolUse: true,
  },
  {
    modelId: "text-embedding-004",
    provider: "gemini",
    contextWindow: 0,
    supportsStreaming: false,
    supportsEmbedding: true,
    supportsToolUse: false,
  },
];

interface GeminiBody extends Record<string, unknown> {
  contents: Record<string, unknown>[];
  systemInstruction?: { parts: Array<{ text: string }> };
  generationConfig?: Record<string, unknown>;
  tools?: Record<string, unknown>[];
}

export class GeminiProvider extends LLMProvider {
  private readonly apiKey: string;
  private readonly apiBase: string;
  private readonly defaultModel: string;
  private readonly timeoutMs: number;

  constructor(opts?: {
    apiKey?: string;
    apiBase?: string;
    defaultModel?: string;
    timeout?: number;
    providerName?: string;
  }) {
    super(opts?.providerName ?? "gemini");
    this.apiKey = opts?.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
    this.apiBase = (
      opts?.apiBase ?? process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com/v1beta"
    ).replace(/\/+$/, "");
    this.defaultModel = opts?.defaultModel ?? process.env.COLONY_GEMINI_MODEL ?? "gemini-2.5-flash";
    this.timeoutMs = (opts?.timeout ?? 120) * 1000;

    if (!this.apiKey) {
      throw new LLMConfigError(
        "Gemini provider requires an API key. Set GEMINI_API_KEY or GOOGLE_API_KEY.",
        { provider: this.providerName },
      );
    }
  }

  async complete(
    messages: LLMMessage[],
    params?: CompletionParams,
  ): Promise<LLMResponse> {
    const model = params?.model ?? this.defaultModel;
    const body = this.buildBody(messages, params);

    let data: Record<string, unknown>;
    try {
      const resp = await this.post(model, "generateContent", body);
      if (!resp.ok) {
        const errBody = await resp.text();
        throw this.mapHttpError(resp.status, errBody, model);
      }
      data = (await resp.json()) as Record<string, unknown>;
    } catch (e) {
      if (
        e instanceof LLMResponseError ||
        e instanceof LLMConnectionError ||
        e instanceof LLMRateLimitError
      ) {
        throw e;
      }
      throw new LLMConnectionError(`Cannot connect to Google Gemini API: ${e}`, {
        provider: this.providerName,
        model,
      });
    }

    const parsed = this.parseResponse(data);
    return createLLMResponse(parsed.content, model, this.providerName, {
      usage: parsed.usage,
      finishReason: parsed.finishReason,
      rawResponse: parsed.toolCalls.length > 0 ? { tool_calls: parsed.toolCalls } : undefined,
    });
  }

  async *stream(
    messages: LLMMessage[],
    params?: CompletionParams,
  ): AsyncIterable<LLMChunk> {
    const model = params?.model ?? this.defaultModel;
    const body = this.buildBody(messages, params);

    let resp: Response;
    try {
      resp = await this.post(model, "streamGenerateContent", body, { alt: "sse" });
      if (!resp.ok) {
        const errBody = await resp.text();
        throw this.mapHttpError(resp.status, errBody, model);
      }
    } catch (e) {
      if (
        e instanceof LLMResponseError ||
        e instanceof LLMConnectionError ||
        e instanceof LLMRateLimitError
      ) {
        throw e;
      }
      throw new LLMConnectionError(`Gemini stream connection error: ${e}`, {
        provider: this.providerName,
        model,
      });
    }

    const reader = resp.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";
    let streamedToolCalls: Record<string, unknown>[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        try {
          const data = JSON.parse(payload) as Record<string, unknown>;
          const parsed = this.parseResponse(data);
          if (parsed.toolCalls.length > 0) streamedToolCalls = parsed.toolCalls;
          if (parsed.content || parsed.finishReason) {
            yield {
              delta: parsed.content,
              model,
              finishReason: parsed.finishReason || null,
              toolCalls: parsed.finishReason === "tool_calls" ? streamedToolCalls : undefined,
            };
          }
        } catch {
          continue;
        }
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const resp = await this.post(this.defaultModel, "generateContent", {
        contents: [{ role: "user", parts: [{ text: "ping" }] }],
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  listModels(): ModelInfo[] {
    return KNOWN_MODELS.map((model) => ({
      ...model,
      provider: this.providerName,
    }));
  }

  async embed(
    texts: string[],
    opts?: { model?: string; tenantScope?: string },
  ): Promise<number[][]> {
    const model = opts?.model ?? "text-embedding-004";
    const embeddings: number[][] = [];
    for (const text of texts) {
      const body = { content: { parts: [{ text }] } };
      const resp = await this.post(model, "embedContent", body);
      if (!resp.ok) {
        const errBody = await resp.text();
        throw this.mapHttpError(resp.status, errBody, model);
      }
      const data = (await resp.json()) as Record<string, unknown>;
      const embedding = (data.embedding ?? {}) as Record<string, unknown>;
      const values = (embedding.values ?? []) as number[];
      embeddings.push(values);
    }
    return embeddings;
  }

  private buildBody(messages: LLMMessage[], params?: CompletionParams): GeminiBody {
    const [systemInstruction, contents] = this.translateMessages(messages);
    const body: GeminiBody = { contents };
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const generationConfig: Record<string, unknown> = {};
    if (params?.temperature != null) generationConfig.temperature = params.temperature;
    if (params?.topP != null) generationConfig.topP = params.topP;
    if (params?.maxTokens != null) generationConfig.maxOutputTokens = params.maxTokens;
    if (params?.stop) generationConfig.stopSequences = params.stop;
    if (
      params?.responseFormat &&
      (params.responseFormat as Record<string, string>).type === "json_object"
    ) {
      generationConfig.responseMimeType = "application/json";
    }
    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    const tools = this.translateTools(params?.tools);
    if (tools) body.tools = tools;
    return body;
  }

  private translateMessages(messages: LLMMessage[]): [string | null, Record<string, unknown>[]] {
    let systemInstruction: string | null = null;
    const contents: Record<string, unknown>[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemInstruction = systemInstruction == null
          ? msg.content
          : `${systemInstruction}\n\n${msg.content}`;
        continue;
      }

      if (msg.role === "tool") {
        contents.push({
          role: "user",
          parts: [{
            functionResponse: {
              name: msg.name ?? "tool_result",
              response: { result: msg.content },
            },
          }],
        });
        continue;
      }

      if (msg.role === "assistant" && msg.toolCalls?.length) {
        const parts: Record<string, unknown>[] = [];
        if (msg.content) parts.push({ text: msg.content });
        for (const tc of msg.toolCalls) {
          const raw = tc as Record<string, unknown>;
          const fn = raw.function as Record<string, unknown> | undefined;
          const args = fn?.arguments ?? raw.arguments ?? {};
          parts.push({
            functionCall: {
              name: String(fn?.name ?? raw.name ?? ""),
              args: this.parseToolArguments(args),
            },
          });
        }
        contents.push({ role: "model", parts });
        continue;
      }

      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }

    return [systemInstruction, contents];
  }

  private translateTools(tools?: Record<string, unknown>[]): Record<string, unknown>[] | null {
    if (!tools?.length) return null;
    const functionDeclarations = tools.map((tool) => {
      const fn = (tool.function as Record<string, unknown>) ?? tool;
      return {
        name: String(fn.name ?? ""),
        description: String(fn.description ?? ""),
        parameters: fn.parameters ?? {},
      };
    });
    return [{ functionDeclarations }];
  }

  private parseResponse(data: Record<string, unknown>): {
    content: string;
    finishReason: string;
    usage: TokenUsage;
    toolCalls: Record<string, unknown>[];
  } {
    const candidates = (data.candidates ?? []) as Record<string, unknown>[];
    const candidate = candidates[0] ?? {};
    const contentData = (candidate.content ?? {}) as Record<string, unknown>;
    const parts = (contentData.parts ?? []) as Record<string, unknown>[];

    let content = "";
    const toolCalls: Record<string, unknown>[] = [];
    for (const part of parts) {
      if (part.text != null) content += String(part.text);
      const functionCall = part.functionCall as Record<string, unknown> | undefined;
      if (functionCall) {
        toolCalls.push({
          id: `call_${randomUUID().replace(/-/g, "").slice(0, 8)}`,
          type: "function",
          function: {
            name: String(functionCall.name ?? ""),
            arguments: JSON.stringify(functionCall.args ?? {}),
          },
        });
      }
    }

    const usageData = (data.usageMetadata ?? {}) as Record<string, unknown>;
    const promptTokens = Number(usageData.promptTokenCount ?? 0);
    const completionTokens = Number(usageData.candidatesTokenCount ?? 0);
    const totalTokens = Number(usageData.totalTokenCount ?? promptTokens + completionTokens);
    const usage: TokenUsage = {
      promptTokens,
      completionTokens,
      totalTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };

    const finishReason = toolCalls.length > 0
      ? "tool_calls"
      : this.mapFinishReason(candidate.finishReason);

    return { content, finishReason, usage, toolCalls };
  }

  private parseToolArguments(args: unknown): Record<string, unknown> {
    if (!args) return {};
    if (typeof args === "string") {
      try {
        const parsed = JSON.parse(args) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed as Record<string, unknown>
          : {};
      } catch {
        return {};
      }
    }
    return typeof args === "object" && !Array.isArray(args)
      ? args as Record<string, unknown>
      : {};
  }

  private mapFinishReason(reason: unknown): string {
    if (reason == null) return "";
    const raw = String(reason).toUpperCase();
    const mapping: Record<string, string> = {
      STOP: "stop",
      MAX_TOKENS: "length",
      SAFETY: "content_filter",
      RECITATION: "content_filter",
      LANGUAGE: "content_filter",
      OTHER: "stop",
      BLOCKLIST: "content_filter",
      PROHIBITED_CONTENT: "content_filter",
      SPII: "content_filter",
      MALFORMED_FUNCTION_CALL: "error",
    };
    for (const [key, value] of Object.entries(mapping)) {
      if (raw.includes(key)) return value;
    }
    return raw.toLowerCase();
  }

  private async post(
    model: string,
    method: string,
    body: Record<string, unknown>,
    query: Record<string, string> = {},
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = this.url(model, method, query);
      return await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private url(model: string, method: string, query: Record<string, string>): string {
    const params = new URLSearchParams({ key: this.apiKey, ...query });
    return `${this.apiBase}/models/${encodeURIComponent(model)}:${method}?${params.toString()}`;
  }

  private mapHttpError(
    status: number,
    body: string,
    model: string,
  ): LLMConnectionError | LLMRateLimitError | LLMResponseError {
    if (status === 429) {
      return new LLMRateLimitError(`Rate limited by Google Gemini: ${body}`, {
        provider: this.providerName,
        model,
      });
    }
    if (status === 401 || status === 403) {
      return new LLMResponseError(
        "Authentication failed for Gemini - check GEMINI_API_KEY or GOOGLE_API_KEY",
        { provider: this.providerName, model, statusCode: status },
      );
    }
    if (status >= 500) {
      return new LLMConnectionError(`Gemini server error ${status}: ${body}`, {
        provider: this.providerName,
        model,
      });
    }
    if (status === 400) {
      return new LLMResponseError(`Bad request to Gemini: ${body}`, {
        provider: this.providerName,
        model,
        statusCode: status,
      });
    }
    return new LLMResponseError(`Gemini error ${status}: ${body}`, {
      provider: this.providerName,
      model,
      statusCode: status,
    });
  }
}
