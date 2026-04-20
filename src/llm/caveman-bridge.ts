/**
 * Caveman bridge for cloud LLM calls.
 *
 * Compresses outbound messages before known non-local providers and rewrites
 * terse cloud responses back into clear Assist-Ant speech through a local LLM.
 */

import type { CompletionParams, LLMProvider } from "./base";
import type { LLMMessage, LLMResponse } from "./models";
import type { ModelCandidate } from "./selector";

export interface CavemanBridgeConfig {
  enabled: boolean;
  cloudProviderNames: string[];
  localProviderNames: string[];
  cleanupModel: string;
  cleanupMaxTokens: number;
  cleanupTemperature: number;
  cleanupTimeoutMs: number;
  streamChunkChars: number;
  compressSystemMessages: boolean;
}

export interface CavemanBridgeStats {
  applied: boolean;
  originalChars: number;
  compressedChars: number;
  savedChars: number;
  savedRatio: number;
}

export interface PreparedCavemanMessages {
  messages: LLMMessage[];
  stats: CavemanBridgeStats;
}

export const DEFAULT_CAVEMAN_BRIDGE_CONFIG: CavemanBridgeConfig = {
  enabled: true,
  cloudProviderNames: ["anthropic", "openai", "gemini", "google"],
  localProviderNames: ["local", "ollama"],
  cleanupModel: process.env.COLONY_CAVEMAN_CLEANUP_MODEL ?? "llama3.2",
  cleanupMaxTokens: Number.parseInt(process.env.COLONY_CAVEMAN_CLEANUP_MAX_TOKENS ?? "4096", 10),
  cleanupTemperature: 0.2,
  cleanupTimeoutMs: Number.parseInt(process.env.COLONY_CAVEMAN_CLEANUP_TIMEOUT_MS ?? "2000", 10),
  streamChunkChars: 80,
  compressSystemMessages: true,
};

export const CAVEMAN_CLOUD_SYSTEM_PROMPT = [
  "Token-saving protocol active.",
  "Reply terse caveman style. Keep all technical facts exact.",
  "Drop filler/articles/pleasantries. Preserve code, paths, commands, errors.",
  "If safety risk, state warning clearly.",
].join(" ");

export const ASSIST_ANT_CLEANUP_SYSTEM_PROMPT = [
  "You are Assist-Ant.",
  "Rewrite terse caveman output into clear, natural, user-facing speech.",
  "Preserve every fact, command, path, code block, warning, and uncertainty.",
  "Do not add new claims. Explain enough for a competent developer to act.",
].join(" ");

const FILLER_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\b(please|kindly|just|really|basically|actually|simply|certainly|sure|of course)\b/gi, ""],
  [/\b(a|an|the)\b/gi, ""],
  [/\bin order to\b/gi, "to"],
  [/\bdue to the fact that\b/gi, "because"],
  [/\bbecause\b/gi, "cause"],
  [/\bapproximately\b/gi, "~"],
  [/\bgreater than or equal to\b/gi, ">="],
  [/\bless than or equal to\b/gi, "<="],
  [/\bgreater than\b/gi, ">"],
  [/\bless than\b/gi, "<"],
  [/\band then\b/gi, "then"],
  [/\bthere is\b/gi, "is"],
  [/\bthere are\b/gi, "are"],
  [/\byou should\b/gi, "do"],
  [/\bwe need to\b/gi, "need"],
];

export class CavemanBridge {
  readonly config: CavemanBridgeConfig;

  constructor(config: Partial<CavemanBridgeConfig> = {}) {
    this.config = {
      ...DEFAULT_CAVEMAN_BRIDGE_CONFIG,
      ...config,
      cloudProviderNames: config.cloudProviderNames ?? [...DEFAULT_CAVEMAN_BRIDGE_CONFIG.cloudProviderNames],
      localProviderNames: config.localProviderNames ?? [...DEFAULT_CAVEMAN_BRIDGE_CONFIG.localProviderNames],
    };
  }

  shouldBridge(candidate: ModelCandidate): boolean {
    if (!this.config.enabled) return false;
    return isCloudProvider(candidate.providerName, this.config.cloudProviderNames);
  }

  prepareMessages(candidate: ModelCandidate, messages: LLMMessage[]): PreparedCavemanMessages {
    if (!this.shouldBridge(candidate)) {
      return {
        messages,
        stats: createStats(false, messages, messages),
      };
    }

    const prepared = messages.map((message) => this.compressMessage(message));
    return {
      messages: prepared,
      stats: createStats(true, messages, prepared),
    };
  }

  async cleanupResponse(
    candidate: ModelCandidate,
    response: LLMResponse,
    originalMessages: LLMMessage[],
    getProvider: (providerName: string) => LLMProvider,
  ): Promise<LLMResponse> {
    if (!this.shouldBridge(candidate)) return response;
    if (!response.content.trim()) return response;
    if (hasToolCalls(response)) return response;

    for (const providerName of this.config.localProviderNames) {
      if (providerName === candidate.providerName) continue;
      try {
        const provider = getProvider(providerName);
        const cleanup = await withTimeout(
          provider.complete(
            buildCleanupMessages(originalMessages, response.content),
            buildCleanupParams(this.config),
          ),
          this.config.cleanupTimeoutMs,
        );
        if (!cleanup.content.trim()) continue;
        return {
          ...response,
          content: cleanup.content,
          rawResponse: {
            ...(response.rawResponse ?? {}),
            caveman_bridge: {
              cloud_provider: candidate.providerName,
              cloud_model: candidate.modelId,
              cloud_content: response.content,
              cleanup_provider: cleanup.provider,
              cleanup_model: cleanup.model,
            },
          },
        };
      } catch {
        continue;
      }
    }

    return response;
  }

  compressMessage(message: LLMMessage): LLMMessage {
    if (message.role === "system" && !this.config.compressSystemMessages) return message;
    const compressed = compressTextCaveman(message.content);
    const content = message.role === "system"
      ? `${CAVEMAN_CLOUD_SYSTEM_PROMPT}\n\n${compressed}`
      : compressed;
    return { ...message, content };
  }
}

export function compressTextCaveman(text: string): string {
  if (!text.trim()) return text;
  return splitCodeFences(text)
    .map((part) => part.isCode ? part.text : compressPlainText(part.text))
    .join("")
    .trim();
}

export function isCloudProvider(providerName: string, cloudProviderNames = DEFAULT_CAVEMAN_BRIDGE_CONFIG.cloudProviderNames): boolean {
  const normalized = providerName.toLowerCase();
  return cloudProviderNames.some((name) => normalized === name.toLowerCase());
}

export function chunkText(text: string, chunkChars: number): string[] {
  const size = Math.max(1, chunkChars);
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks.length > 0 ? chunks : [""];
}

function compressPlainText(text: string): string {
  let output = text;
  for (const [pattern, replacement] of FILLER_REPLACEMENTS) {
    output = output.replace(pattern, replacement);
  }
  return output
    .replace(/[ \t]+/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([({[])\s+/g, "$1")
    .replace(/\s+([)}\]])/g, "$1")
    .replace(/ - /g, " - ")
    .trim();
}

function splitCodeFences(text: string): Array<{ text: string; isCode: boolean }> {
  const parts: Array<{ text: string; isCode: boolean }> = [];
  const regex = /```[\s\S]*?```/g;
  let lastIndex = 0;
  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push({ text: text.slice(lastIndex, index), isCode: false });
    parts.push({ text: match[0], isCode: true });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex), isCode: false });
  return parts;
}

function createStats(applied: boolean, original: LLMMessage[], compressed: LLMMessage[]): CavemanBridgeStats {
  const originalChars = countChars(original);
  const compressedChars = countChars(compressed);
  const savedChars = Math.max(0, originalChars - compressedChars);
  return {
    applied,
    originalChars,
    compressedChars,
    savedChars,
    savedRatio: originalChars > 0 ? savedChars / originalChars : 0,
  };
}

function countChars(messages: LLMMessage[]): number {
  return messages.reduce((total, message) => total + message.content.length, 0);
}

function hasToolCalls(response: LLMResponse): boolean {
  const rawCalls = response.rawResponse?.tool_calls;
  return Array.isArray(rawCalls) && rawCalls.length > 0;
}

function buildCleanupMessages(originalMessages: LLMMessage[], cloudContent: string): LLMMessage[] {
  const latestUser = [...originalMessages].reverse().find((message) => message.role === "user")?.content ?? "";
  return [
    { role: "system", content: ASSIST_ANT_CLEANUP_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        "Original latest user request:",
        latestUser,
        "",
        "Cloud terse answer:",
        cloudContent,
        "",
        "Rewrite as Assist-Ant clear answer.",
      ].join("\n"),
    },
  ];
}

function buildCleanupParams(config: CavemanBridgeConfig): CompletionParams {
  return {
    model: config.cleanupModel,
    maxTokens: config.cleanupMaxTokens,
    temperature: config.cleanupTemperature,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Caveman cleanup timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
