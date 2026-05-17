export type Alpha0ProviderReadinessStatus = "ready" | "blocked";

export interface Alpha0CloudProviderReadiness {
  provider: string;
  envLabel: string;
  configured: boolean;
}

export interface Alpha0OllamaReadiness {
  baseUrl: string;
  model: string;
  reachable: boolean;
  modelAvailable: boolean;
  models: string[];
  error?: string;
}

export interface Alpha0ProviderReadinessReport {
  generatedAt: string;
  readiness: Alpha0ProviderReadinessStatus;
  reason: string;
  liveDemoVerified: false;
  ollama: Alpha0OllamaReadiness;
  cloudProviders: Alpha0CloudProviderReadiness[];
  nextCommands: string[];
}

export interface Alpha0ProviderReadinessOptions {
  env?: Record<string, string | undefined>;
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  now?: () => Date;
}

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "llama3.2";

export async function probeAlpha0ProviderReadiness(
  opts: Alpha0ProviderReadinessOptions = {},
): Promise<Alpha0ProviderReadinessReport> {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date());
  const baseUrl = normalizeOllamaBaseUrl(
    env.COLONY_OLLAMA_BASE_URL
    ?? (isOllamaProvider(env.COLONY_LLM_PROVIDER) ? env.COLONY_LLM_API_BASE : undefined)
    ?? DEFAULT_OLLAMA_BASE_URL,
  );
  const model = env.COLONY_OLLAMA_MODEL ?? env.COLONY_LLM_MODEL ?? DEFAULT_OLLAMA_MODEL;
  const ollama = await probeOllama({ baseUrl, model, fetchImpl });
  const cloudProviders = detectCloudProviderReadiness(env);
  const configuredCloud = cloudProviders.find((provider) => provider.configured);

  const readiness = ollama.modelAvailable || configuredCloud ? "ready" : "blocked";
  const reason = ollama.modelAvailable
    ? `Ollama model ${model} is available.`
    : configuredCloud
      ? `${configuredCloud.provider} is configured through ${configuredCloud.envLabel}.`
      : "No ready Ollama model or configured cloud provider was detected.";

  return {
    generatedAt: now().toISOString(),
    readiness,
    reason,
    liveDemoVerified: false,
    ollama,
    cloudProviders,
    nextCommands: readiness === "ready"
      ? [
        "bun run start",
        "/doctor first-run",
        `/swarm llm \"prepare a concise local-first alpha launch checklist\"`,
        "/swarm status <run_id>",
      ]
      : [
        "ollama serve",
        `ollama pull ${model}`,
        "or configure ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, or GOOGLE_API_KEY",
        "bun run alpha0:provider-check",
      ],
  };
}

export function renderAlpha0ProviderReadinessReport(report: Alpha0ProviderReadinessReport): string {
  const lines = [
    "# Launch Alpha 0 Provider Readiness",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.readiness.toUpperCase()}`,
    `Reason: ${report.reason}`,
    "Live demo verified: no (this preflight does not run `/swarm llm`)",
    "",
    "## Ollama",
    "",
    `- Base URL: ${report.ollama.baseUrl}`,
    `- Model: ${report.ollama.model}`,
    `- Server reachable: ${report.ollama.reachable ? "yes" : "no"}`,
    `- Model available: ${report.ollama.modelAvailable ? "yes" : "no"}`,
    `- Models seen: ${report.ollama.models.length > 0 ? report.ollama.models.slice(0, 5).join(", ") : "none"}`,
  ];

  if (report.ollama.error) {
    lines.push(`- Error: ${report.ollama.error}`);
  }

  lines.push("", "## Cloud Provider Env", "");
  for (const provider of report.cloudProviders) {
    lines.push(`- ${provider.envLabel}: ${provider.configured ? "set" : "missing"} (${provider.provider})`);
  }

  lines.push("", "## Next Commands", "");
  for (const command of report.nextCommands) {
    lines.push(`- \`${command}\``);
  }

  return lines.join("\n");
}

async function probeOllama(opts: {
  baseUrl: string;
  model: string;
  fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}): Promise<Alpha0OllamaReadiness> {
  try {
    const response = await opts.fetchImpl(`${opts.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      return {
        baseUrl: opts.baseUrl,
        model: opts.model,
        reachable: false,
        modelAvailable: false,
        models: [],
        error: `HTTP ${response.status}`,
      };
    }

    const body = await response.json() as Record<string, unknown>;
    const models = extractOllamaModelNames(body);
    return {
      baseUrl: opts.baseUrl,
      model: opts.model,
      reachable: true,
      modelAvailable: hasOllamaModel(models, opts.model),
      models,
    };
  } catch (error) {
    return {
      baseUrl: opts.baseUrl,
      model: opts.model,
      reachable: false,
      modelAvailable: false,
      models: [],
      error: sanitizeError(error),
    };
  }
}

function detectCloudProviderReadiness(env: Record<string, string | undefined>): Alpha0CloudProviderReadiness[] {
  const providers: Alpha0CloudProviderReadiness[] = [
    {
      provider: "anthropic",
      envLabel: "ANTHROPIC_API_KEY",
      configured: Boolean(env.ANTHROPIC_API_KEY),
    },
    {
      provider: "openai-compatible",
      envLabel: "OPENAI_API_KEY",
      configured: Boolean(env.OPENAI_API_KEY),
    },
    {
      provider: "gemini",
      envLabel: env.GEMINI_API_KEY ? "GEMINI_API_KEY" : "GOOGLE_API_KEY",
      configured: Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY),
    },
  ];

  if (env.COLONY_LLM_API_KEY && env.COLONY_LLM_PROVIDER && !isOllamaProvider(env.COLONY_LLM_PROVIDER)) {
    providers.push({
      provider: env.COLONY_LLM_PROVIDER,
      envLabel: "COLONY_LLM_API_KEY",
      configured: true,
    });
  }

  return providers;
}

function extractOllamaModelNames(body: Record<string, unknown>): string[] {
  return ((body.models ?? []) as Record<string, unknown>[])
    .map((model) => String(model.name ?? ""))
    .filter(Boolean);
}

function hasOllamaModel(models: string[], target: string): boolean {
  const normalizedTarget = normalizeModelName(target);
  return models.some((model) => {
    const normalized = normalizeModelName(model);
    return normalized === normalizedTarget || normalized.split(":")[0] === normalizedTarget.split(":")[0];
  });
}

function normalizeOllamaBaseUrl(value: string): string {
  const trimmed = value.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed.slice(0, -3) : trimmed;
}

function normalizeModelName(value: string): string {
  return value.trim().toLowerCase().replace(/:latest$/, "");
}

function isOllamaProvider(provider: string | undefined): boolean {
  const normalized = String(provider ?? "").trim().toLowerCase();
  return normalized === "" || normalized === "ollama" || normalized === "local" || normalized === "default";
}

function sanitizeError(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
    .replace(/(api[_-]?key|token|authorization)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-[redacted]");
}

if (import.meta.main) {
  const report = await probeAlpha0ProviderReadiness();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderAlpha0ProviderReadinessReport(report));
  }
  if (process.argv.includes("--strict") && report.readiness !== "ready") {
    process.exit(1);
  }
}
