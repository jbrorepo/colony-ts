/**
 * LLM provider configuration loader.
 *
 * Ports colony/llm/config.py. Resolution order:
 *   1. COLONY_LLM_CONFIG file path (JSON or simple YAML subset)
 *   2. Environment-only single-provider fallback
 *
 * API keys are referenced by environment variable name, not stored inline.
 */

import { LLMConfigError } from "./exceptions";
import type { LLMConfig, ProviderConfig } from "./selector";

export class LLMProviderConfig {
  readonly type: string;
  readonly apiBase: string;
  readonly apiKeyEnv: string;
  readonly defaultModel: string;
  readonly organization: string;
  readonly timeoutSeconds: number;
  readonly maxRetries: number;
  readonly loggingLevel: string;
  readonly extra: Record<string, unknown>;

  constructor(data: Record<string, unknown>) {
    this.type = String(data.type ?? "");
    this.apiBase = String(data.api_base ?? data.apiBase ?? "");
    this.apiKeyEnv = String(data.api_key_env ?? data.apiKeyEnv ?? "");
    this.defaultModel = String(data.default_model ?? data.defaultModel ?? "");
    this.organization = String(data.organization ?? "");
    this.timeoutSeconds = Number(data.timeout_seconds ?? data.timeoutSeconds ?? 120);
    this.maxRetries = Number(data.max_retries ?? data.maxRetries ?? 2);
    this.loggingLevel = String(data.logging_level ?? data.loggingLevel ?? "metadata");
    this.extra = isRecord(data.extra) ? { ...data.extra } : {};
  }

  resolveApiKey(env: Record<string, string | undefined> = process.env): string {
    if (!this.apiKeyEnv) return "";
    return env[this.apiKeyEnv] ?? "";
  }

  toSelectorProviderConfig(): ProviderConfig {
    return {
      type: this.type,
      apiBase: this.apiBase,
      apiKeyEnv: this.apiKeyEnv,
      defaultModel: this.defaultModel,
      organization: this.organization,
      timeoutSeconds: this.timeoutSeconds,
      maxRetries: this.maxRetries,
      loggingLevel: this.loggingLevel,
      extra: { ...this.extra },
    };
  }
}

export class LLMDefaultsConfig {
  readonly provider: string;
  readonly maxRetries: number;
  readonly timeoutSeconds: number;
  readonly maxTokens: number;
  readonly temperature: number;

  constructor(data: Record<string, unknown> = {}) {
    this.provider = String(data.provider ?? "default");
    this.maxRetries = Number(data.max_retries ?? data.maxRetries ?? 2);
    this.timeoutSeconds = Number(data.timeout_seconds ?? data.timeoutSeconds ?? 120);
    this.maxTokens = Number(data.max_tokens ?? data.maxTokens ?? 4096);
    this.temperature = Number(data.temperature ?? 0.7);
  }

  toSelectorDefaults(): LLMConfig["defaults"] {
    return {
      provider: this.provider,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      timeoutSeconds: this.timeoutSeconds,
      maxRetries: this.maxRetries,
    } as LLMConfig["defaults"];
  }
}

export interface ParsedLLMConfig {
  providers: Record<string, LLMProviderConfig>;
  defaults: LLMDefaultsConfig;
  casteModels: Record<string, { provider: string; model: string }>;
  failover: Record<string, string[]>;
}

export interface LoadLLMConfigOptions {
  env?: Record<string, string | undefined>;
  configPath?: string;
  readText?: (path: string) => Promise<string>;
}

export async function loadLLMConfig(opts: LoadLLMConfigOptions = {}): Promise<LLMConfig> {
  const env = opts.env ?? process.env;
  const configPath = opts.configPath ?? env.COLONY_LLM_CONFIG ?? "";
  if (configPath) {
    return parseLLMConfigObject(
      await loadConfigObject(configPath, opts.readText),
    ).toSelectorConfig();
  }
  return loadLLMConfigFromEnv(env);
}

export function loadLLMConfigFromEnv(env: Record<string, string | undefined> = process.env): LLMConfig {
  const providerType = env.COLONY_LLM_PROVIDER ?? "ollama";
  const model = env.COLONY_LLM_MODEL ?? "llama3.2";
  const defaultBase = providerType === "ollama"
    ? "http://localhost:11434"
    : "http://localhost:11434/v1";
  const apiBase = env.COLONY_LLM_API_BASE ?? defaultBase;
  const provider = new LLMProviderConfig({
    type: providerType,
    api_base: apiBase,
    api_key_env: "COLONY_LLM_API_KEY",
    default_model: model,
  });

  return {
    providers: { default: provider.toSelectorProviderConfig() },
    defaults: new LLMDefaultsConfig({ provider: "default" }).toSelectorDefaults(),
    casteModels: {},
    failover: {},
  };
}

export function parseLLMConfigObject(raw: unknown): ParsedLLMConfig & { toSelectorConfig: () => LLMConfig } {
  if (!isRecord(raw)) {
    throw new LLMConfigError(`LLM config must be a mapping, got ${typeof raw}`);
  }

  const providersRaw = raw.providers ?? {};
  if (!isRecord(providersRaw)) {
    throw new LLMConfigError("LLM config providers must be a mapping");
  }

  const providers: Record<string, LLMProviderConfig> = {};
  for (const [name, providerRaw] of Object.entries(providersRaw)) {
    if (!isRecord(providerRaw)) {
      throw new LLMConfigError(`Provider '${name}' must be a mapping`);
    }
    providers[name] = new LLMProviderConfig(providerRaw);
  }

  const defaults = new LLMDefaultsConfig(isRecord(raw.defaults) ? raw.defaults : {});
  const casteModels = normalizeModelMap(raw.caste_models ?? raw.casteModels ?? {});
  const failover = normalizeFailover(raw.failover ?? {});

  return {
    providers,
    defaults,
    casteModels,
    failover,
    toSelectorConfig: () => ({
      providers: Object.fromEntries(
        Object.entries(providers).map(([name, provider]) => [name, provider.toSelectorProviderConfig()]),
      ),
      defaults: defaults.toSelectorDefaults(),
      casteModels,
      failover,
    }),
  };
}

async function loadConfigObject(path: string, readText?: (path: string) => Promise<string>): Promise<unknown> {
  let text: string;
  try {
    if (readText) {
      text = await readText(path);
    } else {
      const file = Bun.file(path);
      if (!(await file.exists())) throw new LLMConfigError(`LLM config file not found: ${path}`);
      text = await file.text();
    }
  } catch (e) {
    if (e instanceof LLMConfigError) throw e;
    throw new LLMConfigError(`Could not load LLM config file: ${path}: ${e}`);
  }

  return parseConfigText(text, path);
}

export function parseConfigText(text: string, source = "LLM config"): unknown {
  const trimmed = text.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      throw new LLMConfigError(`${source} is invalid JSON: ${(e as Error).message}`);
    }
  }
  try {
    return parseSimpleYaml(trimmed);
  } catch (e) {
    if (e instanceof LLMConfigError) throw e;
    throw new LLMConfigError(`${source} is invalid YAML: ${(e as Error).message}`);
  }
}

interface YamlLine {
  indent: number;
  text: string;
}

function parseSimpleYaml(text: string): unknown {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(stripYamlComment)
    .filter((line) => line.trim().length > 0)
    .map((line) => ({
      indent: line.match(/^ */)?.[0].length ?? 0,
      text: line.trim(),
    }));

  if (lines.length === 0) return {};
  const [value, index] = parseYamlBlock(lines, 0, lines[0].indent);
  if (index < lines.length) {
    throw new LLMConfigError(`Unexpected YAML line: ${lines[index].text}`);
  }
  return value;
}

function parseYamlBlock(lines: YamlLine[], start: number, indent: number): [unknown, number] {
  if (lines[start]?.text.startsWith("- ")) {
    return parseYamlList(lines, start, indent);
  }
  return parseYamlMap(lines, start, indent);
}

function parseYamlMap(lines: YamlLine[], start: number, indent: number): [Record<string, unknown>, number] {
  const result: Record<string, unknown> = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < indent) break;
    if (line.indent > indent) throw new LLMConfigError(`Unexpected indentation: ${line.text}`);
    if (line.text.startsWith("- ")) break;

    const match = line.text.match(/^([^:]+):(.*)$/);
    if (!match) throw new LLMConfigError(`Expected key/value mapping, got: ${line.text}`);
    const key = match[1].trim();
    const rest = match[2].trim();
    if (rest) {
      result[key] = parseYamlScalar(rest);
      i++;
      continue;
    }

    const next = lines[i + 1];
    if (!next || next.indent <= indent) {
      result[key] = {};
      i++;
      continue;
    }
    const [child, nextIndex] = parseYamlBlock(lines, i + 1, next.indent);
    result[key] = child;
    i = nextIndex;
  }
  return [result, i];
}

function parseYamlList(lines: YamlLine[], start: number, indent: number): [unknown[], number] {
  const result: unknown[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < indent) break;
    if (line.indent > indent) throw new LLMConfigError(`Unexpected list indentation: ${line.text}`);
    if (!line.text.startsWith("- ")) break;
    const rest = line.text.slice(2).trim();
    result.push(parseYamlScalar(rest));
    i++;
  }
  return [result, i];
}

function parseYamlScalar(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((part) => parseYamlScalar(part.trim()));
  }
  return value;
}

function stripYamlComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if ((ch === '"' || ch === "'") && line[i - 1] !== "\\") {
      quote = quote === ch ? null : quote ?? ch;
    }
    if (ch === "#" && quote === null) {
      return line.slice(0, i).trimEnd();
    }
  }
  return line;
}

function normalizeModelMap(raw: unknown): Record<string, { provider: string; model: string }> {
  if (!isRecord(raw)) return {};
  const result: Record<string, { provider: string; model: string }> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue;
    const provider = String(value.provider ?? "");
    const model = String(value.model ?? "");
    if (provider && model) result[name] = { provider, model };
  }
  return result;
}

function normalizeFailover(raw: unknown): Record<string, string[]> {
  if (!isRecord(raw)) return {};
  const result: Record<string, string[]> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      result[name] = value.map(String);
    } else if (typeof value === "string") {
      result[name] = [value];
    }
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
