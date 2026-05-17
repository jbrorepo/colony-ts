import type { SlashCommandContext } from "./gateway-contract";
import { doctorCheckPrefix } from "./gateway-doctor";

export interface GatewayProviderCommandPayload {
  output: string;
  data?: Record<string, unknown>;
  isError?: boolean;
  action?: Record<string, unknown>;
}

interface ProviderPerfRow {
  model: string;
  apiDurationS: number;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

interface ProviderPerfSummary {
  provider: string;
  models: string[];
  rows: ProviderPerfRow[];
  totalCalls: number;
  totalApiDurationS: number;
  totalTokens: number;
}

interface ProviderCommandRuntime {
  provider?: string | null;
  model?: string | null;
  selectedProvider?: string | null;
  selectedModel?: string | null;
  providerDefaults?: Record<string, string>;
  circuitState?: string | null;
  availableProviders?: string[];
  failover?: Record<string, string[]>;
  providerHealth?: Record<string, { state?: string; failureCount?: number }>;
  recentFailovers?: Array<{
    fromProvider?: string;
    fromModel?: string;
    toProvider?: string;
    toModel?: string;
    errorType?: string;
    errorMessage?: string;
    timestamp?: number;
  }>;
  startupErrors?: number;
  startupWarnings?: number;
}

interface ProviderStartupCheck {
  name?: string;
  passed?: boolean;
  message?: string;
  fix?: string;
}

interface ProviderStartupReportLike {
  checks?: ProviderStartupCheck[];
}

function readString(obj: unknown, keys: string[], fallback = ""): string {
  if (!obj || typeof obj !== "object") return fallback;
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (value != null) return String(value);
  }
  return fallback;
}

function readNumber(obj: unknown, keys: string[], fallback = 0): number {
  if (!obj || typeof obj !== "object") return fallback;
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return fallback;
}

export function normalizeProviderAlias(provider: string): string {
  const normalized = provider.trim().toLowerCase();
  if (normalized === "ollama") return "local";
  return normalized;
}

export function providerSearchTerms(provider: string): string[] {
  const normalized = normalizeProviderAlias(provider);
  if (normalized === "local") return ["local", "ollama"];
  if (normalized === "anthropic") return ["anthropic", "claude"];
  if (normalized === "gemini") return ["gemini", "google"];
  if (normalized === "openai") return ["openai"];
  return [normalized];
}

export function providerStartupChecks(
  provider: string,
  report: ProviderStartupReportLike | null | undefined,
): ProviderStartupCheck[] {
  const checks = report?.checks ?? [];
  const terms = providerSearchTerms(provider);

  return checks.filter((check) => {
    const haystack = [
      check.name,
      check.message,
      check.fix,
    ]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" ")
      .toLowerCase();
    return terms.some((term) => haystack.includes(term));
  });
}

export function providerRecoveryHints(
  provider: string,
  runtime: ProviderCommandRuntime,
  report: ProviderStartupReportLike | null | undefined,
): string[] {
  const hints: string[] = [];
  const normalizedProvider = normalizeProviderAlias(provider);
  const relatedChecks = providerStartupChecks(normalizedProvider, report);
  const selectedHealth = Object.entries(runtime.providerHealth ?? {}).find(
    ([name]) => normalizeProviderAlias(name) === normalizedProvider,
  )?.[1];

  if (selectedHealth?.state === "open") {
    hints.push("Circuit open. Check /provider failovers and /doctor before retrying.");
  } else if ((selectedHealth?.failureCount ?? 0) > 0) {
    hints.push("Recent provider failures recorded. Check /provider failovers for latest events.");
  }

  for (const fix of relatedChecks
    .filter((check) => !check.passed && typeof check.fix === "string" && check.fix.length > 0)
    .map((check) => String(check.fix).trim())) {
    if (!hints.includes(fix)) hints.push(fix);
  }

  if (hints.length === 0 && relatedChecks.length === 0) {
    hints.push("Inspect /provider failovers and /doctor if this provider behaves unexpectedly.");
  }

  return hints;
}

export function formatFailoverEventLine(event: {
  fromProvider?: string;
  fromModel?: string;
  toProvider?: string;
  toModel?: string;
  errorType?: string;
  errorMessage?: string;
  timestamp?: number;
}): string {
  const at = typeof event.timestamp === "number"
    ? new Date(event.timestamp).toISOString()
    : "unknown-time";
  return `${at} | ${event.fromProvider ?? "unknown"}:${event.fromModel ?? "unknown"} -> ${event.toProvider ?? "unknown"}:${event.toModel ?? "unknown"} (${event.errorType ?? "Error"})${event.errorMessage ? ` | ${event.errorMessage}` : ""}`;
}

export function formatProviderHealthSummary(
  providerHealth: NonNullable<ProviderCommandRuntime["providerHealth"]>,
  currentProvider?: string,
): string {
  const entries = Object.entries(providerHealth).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return "";

  return entries
    .map(([provider, health]) => {
      const normalized = normalizeProviderAlias(provider);
      const currentNormalized = normalizeProviderAlias(currentProvider ?? "");
      const current = currentNormalized === normalized ? " [current]" : "";
      const state = typeof health.state === "string" ? health.state : "unknown";
      const failures = typeof health.failureCount === "number" ? health.failureCount : 0;
      return `${normalized}${current}: ${state} (${failures})`;
    })
    .join("; ");
}

export function latestFailoverSummary(
  recentFailovers: NonNullable<ProviderCommandRuntime["recentFailovers"]>,
): string {
  const latest = recentFailovers.at(-1);
  if (!latest) return "";
  return formatFailoverEventLine(latest);
}

export function collectKnownProviders(runtime: ProviderCommandRuntime): string[] {
  const names = new Set<string>();
  const add = (value?: string | null) => {
    if (!value) return;
    names.add(normalizeProviderAlias(value));
  };

  add(runtime.provider ?? null);
  for (const provider of runtime.availableProviders ?? []) add(provider);
  for (const [provider, chain] of Object.entries(runtime.failover ?? {})) {
    add(provider);
    for (const target of chain) add(target);
  }
  for (const provider of Object.keys(runtime.providerHealth ?? {})) add(provider);
  for (const event of runtime.recentFailovers ?? []) {
    add(event.fromProvider ?? null);
    add(event.toProvider ?? null);
  }

  return [...names].sort((left, right) => left.localeCompare(right));
}

function normalizeModelRef(value: string): string {
  return value.trim().toLowerCase();
}

function providerPerfCandidateModels(
  provider: string,
  runtime: ProviderCommandRuntime,
): string[] {
  const normalizedProvider = normalizeProviderAlias(provider);
  const models = new Set<string>();
  const add = (value: string | null | undefined): void => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === "unknown" || trimmed.toLowerCase() === "n/a") return;
    models.add(trimmed);
  };

  add(runtime.providerDefaults?.[normalizedProvider]);
  if (normalizeProviderAlias(runtime.provider ?? "") === normalizedProvider) add(runtime.model);
  if (normalizeProviderAlias(runtime.selectedProvider ?? "") === normalizedProvider) add(runtime.selectedModel);
  for (const event of runtime.recentFailovers ?? []) {
    if (normalizeProviderAlias(event.fromProvider ?? "") === normalizedProvider) add(event.fromModel);
    if (normalizeProviderAlias(event.toProvider ?? "") === normalizedProvider) add(event.toModel);
  }

  return [...models].sort((left, right) => left.localeCompare(right));
}

function readProviderPerfRows(tracker: unknown): ProviderPerfRow[] {
  if (!tracker || typeof tracker !== "object") return [];
  const record = tracker as Record<string, unknown>;
  const raw = record.modelUsage ?? record.model_usage ?? record._model_usage;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];

  return Object.entries(raw as Record<string, unknown>)
    .map(([fallbackModel, usage]) => {
      const entry = usage && typeof usage === "object" && !Array.isArray(usage)
        ? usage as Record<string, unknown>
        : {};
      return {
        model: readString(entry, ["model"], fallbackModel),
        inputTokens: readNumber(entry, ["inputTokens", "input_tokens"]),
        outputTokens: readNumber(entry, ["outputTokens", "output_tokens"]),
        cacheReadTokens: readNumber(entry, ["cacheReadTokens", "cache_read_tokens"]),
        cacheCreationTokens: readNumber(entry, ["cacheCreationTokens", "cache_creation_tokens"]),
        callCount: readNumber(entry, ["callCount", "call_count"]),
        apiDurationS: readNumber(entry, ["apiDurationS", "api_duration_s"]),
      };
    })
    .sort((left, right) => left.model.localeCompare(right.model));
}

export function providerPerfSummaries(
  tracker: unknown,
  runtime: ProviderCommandRuntime,
): {
  summaries: ProviderPerfSummary[];
  ambiguousRows: Array<{ row: ProviderPerfRow; providers: string[] }>;
  unmappedRows: ProviderPerfRow[];
} {
  const rows = readProviderPerfRows(tracker)
    .filter((row) => row.callCount > 0 || row.apiDurationS > 0);
  const providers = configuredProviderNames(runtime);
  const providerModels = Object.fromEntries(
    providers.map((provider) => [provider, providerPerfCandidateModels(provider, runtime)]),
  );
  const modelOwners = new Map<string, string[]>();
  for (const [provider, models] of Object.entries(providerModels)) {
    for (const model of models) {
      const key = normalizeModelRef(model);
      modelOwners.set(key, [...new Set([...(modelOwners.get(key) ?? []), provider])]);
    }
  }

  const rowsByProvider = new Map<string, ProviderPerfRow[]>(
    providers.map((provider) => [provider, []]),
  );
  const ambiguousRows: Array<{ row: ProviderPerfRow; providers: string[] }> = [];
  const unmappedRows: ProviderPerfRow[] = [];
  for (const row of rows) {
    const owners = modelOwners.get(normalizeModelRef(row.model)) ?? [];
    if (owners.length === 1) {
      rowsByProvider.get(owners[0])?.push(row);
    } else if (owners.length > 1) {
      ambiguousRows.push({ row, providers: owners });
    } else {
      unmappedRows.push(row);
    }
  }

  const summaries = providers.map((provider) => {
    const matchedRows = rowsByProvider.get(provider) ?? [];
    return {
      provider,
      models: providerModels[provider] ?? [],
      rows: matchedRows.slice().sort((left, right) => (
        right.apiDurationS - left.apiDurationS
        || right.callCount - left.callCount
        || left.model.localeCompare(right.model)
      )),
      totalCalls: matchedRows.reduce((sum, row) => sum + row.callCount, 0),
      totalApiDurationS: matchedRows.reduce((sum, row) => sum + row.apiDurationS, 0),
      totalTokens: matchedRows.reduce((sum, row) => (
        sum + row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheCreationTokens
      ), 0),
    } satisfies ProviderPerfSummary;
  });

  return { summaries, ambiguousRows, unmappedRows };
}

export function configuredProviderNames(runtime: ProviderCommandRuntime): string[] {
  const configured = [...new Set((runtime.availableProviders ?? []).map((provider) => normalizeProviderAlias(provider)))];
  return configured.length > 0 ? configured.sort((left, right) => left.localeCompare(right)) : collectKnownProviders(runtime);
}

export function resolveConfiguredProvider(
  raw: string,
  runtime: ProviderCommandRuntime,
): { provider: string } | { error: string } {
  const normalized = normalizeProviderAlias(raw);
  const configured = configuredProviderNames(runtime);

  if (!normalized) {
    return {
      error: `Usage: /provider use <name>\n\nConfigured providers: ${configured.join(", ") || "(none)"}`,
    };
  }

  if (configured.includes(normalized)) {
    return { provider: normalized };
  }

  const prefixMatches = configured.filter((provider) => provider.startsWith(normalized));
  if (prefixMatches.length === 1) {
    return { provider: prefixMatches[0] };
  }
  if (prefixMatches.length > 1) {
    return {
      error: `Provider reference '${raw}' is ambiguous.\n\nMatches: ${prefixMatches.join(", ")}\nUse /provider use <full_name>.`,
    };
  }

  return {
    error: `Unknown provider '${raw}'.\n\nConfigured providers: ${configured.join(", ") || "(none)"}\nUse /provider use <name>.`,
  };
}

export function providerConfiguredModel(
  runtime: ProviderCommandRuntime,
  provider: string,
): string {
  const normalizedProvider = normalizeProviderAlias(provider);
  if (normalizeProviderAlias(runtime.selectedProvider ?? "") === normalizedProvider) {
    return String(runtime.selectedModel ?? "unknown");
  }
  const configuredModel = runtime.providerDefaults?.[normalizedProvider];
  if (typeof configuredModel === "string" && configuredModel.length > 0) return configuredModel;
  if (normalizeProviderAlias(runtime.provider ?? "") === normalizedProvider) {
    return String(runtime.model ?? "unknown");
  }
  return "unknown";
}

type ProviderViewKind = "summary" | "health" | "failovers" | "perf" | "focus";

interface ProviderViewSpec {
  kind: ProviderViewKind;
  provider?: string;
}

export function resolveProviderView(
  args: string[],
  runtime: ProviderCommandRuntime,
): ProviderViewSpec | { error: string } {
  const raw = args.join(" ").trim().toLowerCase();
  const normalized = normalizeProviderAlias(raw);
  if (!normalized || normalized === "summary" || normalized === "all") {
    return { kind: "summary" };
  }
  if (normalized === "health") return { kind: "health" };
  if (normalized === "failovers" || normalized === "events") return { kind: "failovers" };
  if (normalized === "perf" || normalized === "performance" || normalized === "latency") return { kind: "perf" };
  if (args.length >= 2) {
    const first = normalizeProviderAlias(args[0] ?? "");
    if (first === "failovers" || first === "events") {
      const resolved = resolveConfiguredProvider(args.slice(1).join(" "), runtime);
      if ("error" in resolved) return resolved;
      return { kind: "failovers", provider: resolved.provider };
    }
    if (first === "perf" || first === "performance" || first === "latency") {
      const resolved = resolveConfiguredProvider(args.slice(1).join(" "), runtime);
      if ("error" in resolved) return resolved;
      return { kind: "perf", provider: resolved.provider };
    }
  }
  if (normalized === "current") {
    const current = normalizeProviderAlias(runtime.provider ?? "");
    if (!current) {
      return { error: "No current provider is active.\n\nUse /provider to inspect configured providers." };
    }
    return { kind: "focus", provider: current };
  }

  const knownProviders = collectKnownProviders(runtime);
  if (knownProviders.includes(normalized)) {
    return { kind: "focus", provider: normalized };
  }

  const prefixMatches = knownProviders.filter((provider) => provider.startsWith(normalized));
  if (prefixMatches.length === 1) {
    return { kind: "focus", provider: prefixMatches[0] };
  }
  if (prefixMatches.length > 1) {
    return {
      error: `Provider reference '${raw}' is ambiguous.\n\nMatches: ${prefixMatches.join(", ")}\nUse /provider <full_name>.`,
    };
  }

  return {
    error: `Unknown provider view '${raw}'.\n\nUse /provider, /provider health, /provider failovers, /provider failovers <name>, /provider perf, /provider perf <name>, /provider current, or /provider <name>.`,
  };
}

export function providerInspectViews(provider?: string): string {
  if (provider) {
    return `/provider ${provider} | /provider perf ${provider} | /provider failovers ${provider} | /doctor ${provider}`;
  }
  return "/provider | /provider health | /provider failovers | /provider perf | /provider current";
}

export function renderProviderSelectionUpdated(opts: {
  provider: string;
  selectedModel: string;
  currentProvider: string;
  currentModel: string;
}): string {
  const lines = ["Provider selection updated:", ""];
  lines.push(`Selected provider: ${opts.provider}`);
  lines.push(`Selected model: ${opts.selectedModel}`);
  lines.push(`Current provider: ${opts.currentProvider}`);
  lines.push(`Current model: ${opts.currentModel}`);
  lines.push(`Next run: ${opts.provider}:${opts.selectedModel} primary`);
  lines.push("Inspect: /provider | /provider current | /status");
  return lines.join("\n");
}

export function renderProviderHealthView(opts: {
  observedHealth: Array<{
    provider: string;
    state: string;
    failures: number;
    current: boolean;
  }>;
}): string {
  const lines = ["Provider Health:", ""];
  if (opts.observedHealth.length === 0) {
    lines.push("(No provider health observations yet)");
  } else {
    for (const health of opts.observedHealth) {
      const marker = health.current ? " (current)" : "";
      lines.push(`${health.provider}${marker}: ${health.state} (failures: ${health.failures})`);
    }
  }
  lines.push("");
  lines.push("Inspect: /provider current | /provider perf | /provider <name> | /doctor");
  return lines.join("\n");
}

export function renderProviderFailoversView(opts: {
  recentFailovers: string[];
}): string {
  const lines = ["Recent failovers:", ""];
  if (opts.recentFailovers.length === 0) {
    lines.push("(No failovers recorded)");
  } else {
    lines.push(...opts.recentFailovers);
  }
  lines.push("");
  lines.push("Inspect: /provider perf | /provider <name> | /provider failovers <name> | /doctor");
  return lines.join("\n");
}

export function renderFocusedProviderFailoversView(opts: {
  provider: string;
  configuredModel: string;
  observedState: string;
  observedFailures: number;
  matchedCount: number;
  totalRecentFailovers: number;
  incomingFailovers: string[];
  outgoingFailovers: string[];
  recoveryHints: string[];
}): string {
  const lines = [`Provider Failovers: ${opts.provider}`, ""];
  lines.push(`Configured model: ${opts.configuredModel}`);
  lines.push(`Observed health: ${opts.observedState} (failures: ${opts.observedFailures})`);
  lines.push(`Matched recent failovers: ${opts.matchedCount} of ${opts.totalRecentFailovers}`);
  lines.push("");
  lines.push("Recent incoming failovers:");
  if (opts.incomingFailovers.length === 0) {
    lines.push(`  (No incoming failovers recorded for ${opts.provider})`);
  } else {
    for (const event of opts.incomingFailovers) lines.push(`  ${event}`);
  }
  lines.push("");
  lines.push("Recent outgoing failovers:");
  if (opts.outgoingFailovers.length === 0) {
    lines.push(`  (No outgoing failovers recorded for ${opts.provider})`);
  } else {
    for (const event of opts.outgoingFailovers) lines.push(`  ${event}`);
  }
  if (opts.recoveryHints.length > 0) {
    lines.push("");
    lines.push("Recovery:");
    for (const hint of opts.recoveryHints) lines.push(`- ${hint}`);
  }
  lines.push("");
  lines.push(`Inspect: /provider ${opts.provider} | /provider perf ${opts.provider} | /provider health | /doctor ${opts.provider}`);
  return lines.join("\n");
}

export function renderFocusedProviderPerfView(opts: {
  provider: string;
  configuredModel: string;
  mappedModels: string[];
  totalApiDurationS?: number;
  totalCalls?: number;
  totalTokens?: number;
  rows: Array<{
    model: string;
    apiDurationS: number;
    callCount: number;
  }>;
  ambiguousModels: string[];
  unmappedModels: string[];
}): string {
  const lines = [`Provider Performance: ${opts.provider}`, ""];
  lines.push(`Configured model: ${opts.configuredModel}`);
  lines.push(`Mapped models: ${opts.mappedModels.length ? opts.mappedModels.join(", ") : "(none)"}`);
  if (opts.rows.length === 0) {
    lines.push("No timed model usage mapped to this provider yet.");
  } else {
    const totalApiDurationS = opts.totalApiDurationS ?? 0;
    const totalCalls = opts.totalCalls ?? 0;
    const totalTokens = opts.totalTokens ?? 0;
    lines.push(`Total API time: ${totalApiDurationS.toFixed(1)}s`);
    lines.push(`Total calls: ${totalCalls}`);
    lines.push(`Total tokens: ${totalTokens.toLocaleString()}`);
    lines.push(`Average API time: ${(totalApiDurationS / Math.max(totalCalls, 1)).toFixed(2)}s/call`);
    lines.push("");
    lines.push("Per-model latency:");
    for (const row of opts.rows) {
      const average = row.callCount > 0 ? row.apiDurationS / row.callCount : 0;
      lines.push(`  ${row.model}: ${row.apiDurationS.toFixed(1)}s total | ${row.callCount} calls | ${average.toFixed(2)}s/call`);
    }
  }
  if (opts.ambiguousModels.length > 0) {
    lines.push("");
    lines.push(`Ambiguous models hidden: ${opts.ambiguousModels.join(", ")}`);
  }
  if (opts.unmappedModels.length > 0) {
    lines.push("");
    lines.push(`Unmapped timed models: ${opts.unmappedModels.join(", ")}`);
  }
  lines.push("");
  lines.push(`Inspect: ${providerInspectViews(opts.provider)}`);
  return lines.join("\n");
}

export function renderProviderPerfView(opts: {
  timedProviders: Array<{
    provider: string;
    totalApiDurationS: number;
    totalCalls: number;
    models: string[];
  }>;
  ambiguousModels: string[];
  unmappedModels: string[];
}): string {
  const lines = ["Provider Performance:", ""];
  if (opts.timedProviders.length === 0) {
    lines.push("No provider performance mapped yet.");
  } else {
    const totalApiTime = opts.timedProviders.reduce((sum, entry) => sum + entry.totalApiDurationS, 0);
    const totalCalls = opts.timedProviders.reduce((sum, entry) => sum + entry.totalCalls, 0);
    const slowestAverage = opts.timedProviders
      .filter((entry) => entry.totalCalls > 0)
      .sort((left, right) => (
        right.totalApiDurationS / right.totalCalls - left.totalApiDurationS / left.totalCalls
        || right.totalApiDurationS - left.totalApiDurationS
        || left.provider.localeCompare(right.provider)
      ))[0];
    lines.push(`Timed providers: ${opts.timedProviders.length}`);
    lines.push(`Total API time: ${totalApiTime.toFixed(1)}s`);
    lines.push(`Total calls: ${totalCalls}`);
    if (totalCalls > 0) {
      lines.push(`Average API time: ${(totalApiTime / totalCalls).toFixed(2)}s/call`);
    }
    if (slowestAverage) {
      lines.push(`Slowest average: ${slowestAverage.provider} | ${(slowestAverage.totalApiDurationS / slowestAverage.totalCalls).toFixed(2)}s/call`);
    }
    lines.push(`Highest total: ${opts.timedProviders[0].provider} | ${opts.timedProviders[0].totalApiDurationS.toFixed(1)}s over ${opts.timedProviders[0].totalCalls} calls`);
    lines.push("");
    lines.push("Per-provider latency:");
    for (const entry of opts.timedProviders) {
      const average = entry.totalCalls > 0 ? entry.totalApiDurationS / entry.totalCalls : 0;
      lines.push(`  ${entry.provider}: ${entry.totalApiDurationS.toFixed(1)}s total | ${entry.totalCalls} calls | ${average.toFixed(2)}s/call${entry.models.length > 0 ? ` | ${entry.models.join(", ")}` : ""}`);
    }
  }
  if (opts.ambiguousModels.length > 0) {
    lines.push("");
    lines.push(`Ambiguous models hidden: ${opts.ambiguousModels.join(", ")}`);
  }
  if (opts.unmappedModels.length > 0) {
    lines.push("");
    lines.push(`Unmapped timed models: ${opts.unmappedModels.join(", ")}`);
  }
  lines.push("");
  lines.push(`Inspect: ${providerInspectViews()}`);
  return lines.join("\n");
}

export function renderFocusedProviderStatusView(opts: {
  provider: string;
  configuredModel: string;
  currentProvider: string;
  currentModel: string;
  isCurrent: boolean;
  isSelectedDefault: boolean;
  observedHealth?: {
    state: string;
    failures: number;
  };
  outgoingChain: string[];
  incomingChain: string[];
  outgoingFailovers: string[];
  incomingFailovers: string[];
  relatedChecks: Array<{
    prefix: string;
    name: string;
    message: string;
    fix?: string;
    passed: boolean;
  }>;
  recoveryHints: string[];
  performanceLine?: string;
}): string {
  const lines = ["Provider Status:", ""];
  lines.push(`Selected provider: ${opts.provider}`);
  lines.push(`Configured model: ${opts.configuredModel}`);
  lines.push(`Current provider: ${opts.currentProvider}`);
  lines.push(`Current model: ${opts.currentModel}`);
  lines.push(`Current: ${opts.isCurrent ? "yes" : "no"}`);
  lines.push(`Selected default: ${opts.isSelectedDefault ? "yes" : "no"}`);
  if (opts.observedHealth) {
    lines.push(`Observed health: ${opts.observedHealth.state} (failures: ${opts.observedHealth.failures})`);
  } else {
    lines.push("Observed health: unknown (no observations yet)");
  }
  lines.push(`Configured failover targets: ${opts.outgoingChain.length > 0 ? opts.outgoingChain.join(", ") : "(none)"}`);
  lines.push(`Incoming failover sources: ${opts.incomingChain.length > 0 ? opts.incomingChain.join(", ") : "(none)"}`);

  if (opts.outgoingFailovers.length > 0) {
    lines.push("");
    lines.push("Recent outgoing failovers:");
    for (const event of opts.outgoingFailovers) lines.push(`  ${event}`);
  }
  if (opts.incomingFailovers.length > 0) {
    lines.push("");
    lines.push("Recent incoming failovers:");
    for (const event of opts.incomingFailovers) lines.push(`  ${event}`);
  }
  if (opts.relatedChecks.length > 0) {
    lines.push("");
    lines.push("Related startup checks:");
    for (const check of opts.relatedChecks) {
      lines.push(`  ${check.prefix}: ${check.name} - ${check.message}`.trim());
      if (!check.passed && check.fix) {
        lines.push(`  fix: ${check.fix}`);
      }
    }
  }
  if (opts.recoveryHints.length > 0) {
    lines.push("");
    lines.push("Next steps:");
    for (const hint of opts.recoveryHints) lines.push(`  - ${hint}`);
  }
  if (opts.performanceLine) {
    lines.push("");
    lines.push(opts.performanceLine);
  }
  return lines.join("\n");
}

export function renderProviderSummaryView(opts: {
  selectedProvider?: string | null;
  selectedModel?: string | null;
  currentProvider: string;
  currentModel: string;
  circuitState: string;
  availableProviders: string[];
  startupErrors?: number;
  startupWarnings?: number;
  failoverEntries: Array<{ provider: string; chain: string[] }>;
  observedHealth: Array<{ provider: string; state: string; failures: number }>;
  recentFailovers: string[];
  summaryHints: string[];
  performanceLine?: string;
}): string {
  const lines = ["Provider Status:", ""];
  if (opts.selectedProvider || opts.selectedModel) {
    lines.push(`Selected provider: ${opts.selectedProvider ?? opts.currentProvider}`);
    lines.push(`Selected model: ${opts.selectedModel ?? opts.currentModel}`);
  }
  lines.push(`Current provider: ${opts.currentProvider}`);
  lines.push(`Current model: ${opts.currentModel}`);
  lines.push(`Circuit: ${opts.circuitState}`);

  if (opts.availableProviders.length > 0) {
    lines.push("");
    lines.push(`Configured providers: ${opts.availableProviders.join(", ")}`);
    lines.push("Views: /provider health, /provider failovers, /provider perf, /provider current, /provider <name>");
    lines.push("Switch: /provider use <name> [model] | /model <model>");
  }

  if (
    typeof opts.startupErrors === "number"
    || typeof opts.startupWarnings === "number"
  ) {
    lines.push("");
    lines.push(`Startup checks: ${opts.startupErrors ?? 0} error(s), ${opts.startupWarnings ?? 0} warning(s)`);
  }

  if (opts.failoverEntries.length > 0) {
    lines.push("");
    lines.push("Failover:");
    for (const entry of opts.failoverEntries) {
      lines.push(`  ${entry.provider} -> ${entry.chain.join(", ") || "(none)"}`);
    }
  }

  if (opts.observedHealth.length > 0) {
    lines.push("");
    lines.push("Observed health:");
    for (const health of opts.observedHealth) {
      lines.push(`  ${health.provider}: ${health.state} (failures: ${health.failures})`);
    }
  }

  if (opts.recentFailovers.length > 0) {
    lines.push("");
    lines.push("Recent failovers:");
    for (const event of opts.recentFailovers) lines.push(`  ${event}`);
  }

  if (opts.summaryHints.length > 0) {
    lines.push("");
    lines.push("Next steps:");
    for (const hint of opts.summaryHints.slice(0, 3)) {
      lines.push(`  - ${hint}`);
    }
  }

  if (opts.performanceLine) {
    lines.push("");
    lines.push(opts.performanceLine);
  }

  return lines.join("\n");
}

export function buildProviderCommandPayload(opts: {
  args: string[];
  runtime: ProviderCommandRuntime | null;
  startupReport: SlashCommandContext["startupReport"];
  costTracker: unknown;
}): GatewayProviderCommandPayload {
  const runtime = opts.runtime;
  if (!runtime) {
    return {
      output: "Provider diagnostics are not available in this context.",
    };
  }

  const verb = opts.args[0]?.trim().toLowerCase();
  if (verb === "use" || verb === "set" || verb === "select") {
    const target = opts.args[1]?.trim() ?? "";
    const model = opts.args.slice(2).join(" ").trim() || undefined;
    const resolvedProvider = resolveConfiguredProvider(target, runtime);
    if ("error" in resolvedProvider) {
      return {
        output: resolvedProvider.error,
        isError: true,
      };
    }

    const provider = resolvedProvider.provider;
    const selectedModel = model || providerConfiguredModel(runtime, provider);
    return {
      output: renderProviderSelectionUpdated({
        provider,
        selectedModel,
        currentProvider: runtime.provider ?? "unknown",
        currentModel: runtime.model ?? "unknown",
      }),
      data: { provider, model: selectedModel },
      action: { kind: "set_provider", provider, model: selectedModel },
    };
  }

  const view = resolveProviderView(opts.args, runtime);
  if ("error" in view) {
    return {
      output: view.error,
      isError: true,
    };
  }

  const available = runtime.availableProviders ?? [];
  const failoverEntries = Object.entries(runtime.failover ?? {});
  const observedHealth = Object.entries(runtime.providerHealth ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const recentFailovers = (runtime.recentFailovers ?? []).slice(-5);

  if (view.kind === "health") {
    return {
      output: renderProviderHealthView({
        observedHealth: observedHealth.map(([provider, health]) => ({
          provider: normalizeProviderAlias(provider),
          state: typeof health.state === "string" ? health.state : "unknown",
          failures: typeof health.failureCount === "number" ? health.failureCount : 0,
          current: normalizeProviderAlias(runtime.provider ?? "") === normalizeProviderAlias(provider),
        })),
      }),
      data: {
        provider: runtime.provider ?? null,
        providerHealth: runtime.providerHealth ?? {},
      },
    };
  }

  if (view.kind === "failovers") {
    if (view.provider) {
      const provider = view.provider;
      const providerHealth = Object.entries(runtime.providerHealth ?? {}).find(
        ([name]) => normalizeProviderAlias(name) === provider,
      )?.[1];
      const configuredModel = providerConfiguredModel(runtime, provider);
      const incomingFailovers = recentFailovers.filter((event) => normalizeProviderAlias(event.toProvider ?? "") === provider);
      const outgoingFailovers = recentFailovers.filter((event) => normalizeProviderAlias(event.fromProvider ?? "") === provider);
      const matchedCount = incomingFailovers.length + outgoingFailovers.length;
      const recoveryHints = providerRecoveryHints(provider, runtime, opts.startupReport);
      return {
        output: renderFocusedProviderFailoversView({
          provider,
          configuredModel,
          observedState: providerHealth?.state ?? "unknown",
          observedFailures: providerHealth?.failureCount ?? 0,
          matchedCount,
          totalRecentFailovers: recentFailovers.length,
          incomingFailovers: incomingFailovers.map((event) => formatFailoverEventLine(event)),
          outgoingFailovers: outgoingFailovers.map((event) => formatFailoverEventLine(event)),
          recoveryHints,
        }),
        data: {
          provider,
          recentFailovers: incomingFailovers.concat(outgoingFailovers),
        },
      };
    }

    return {
      output: renderProviderFailoversView({
        recentFailovers: recentFailovers.map((event) => formatFailoverEventLine(event)),
      }),
      data: {
        provider: null,
        recentFailovers,
      },
    };
  }

  if (view.kind === "perf") {
    const perf = providerPerfSummaries(opts.costTracker, runtime);
    if (view.provider) {
      const summary = perf.summaries.find((entry) => entry.provider === view.provider);
      const ambiguousForProvider = perf.ambiguousRows.filter((entry) => entry.providers.includes(view.provider!));
      return {
        output: renderFocusedProviderPerfView({
          provider: view.provider,
          configuredModel: providerConfiguredModel(runtime, view.provider),
          mappedModels: summary?.models ?? [],
          totalApiDurationS: summary?.totalApiDurationS,
          totalCalls: summary?.totalCalls,
          totalTokens: summary?.totalTokens,
          rows: summary?.rows ?? [],
          ambiguousModels: ambiguousForProvider.map((entry) => entry.row.model),
          unmappedModels: perf.unmappedRows.map((row) => row.model),
        }),
        data: {
          provider: view.provider,
          timedModelCount: summary?.rows.length ?? 0,
          ambiguousCount: ambiguousForProvider.length,
          unmappedCount: perf.unmappedRows.length,
        },
      };
    }

    const timedProviders = perf.summaries
      .filter((entry) => entry.rows.length > 0)
      .sort((left, right) => (
        right.totalApiDurationS - left.totalApiDurationS
        || right.totalCalls - left.totalCalls
        || left.provider.localeCompare(right.provider)
      ));
    return {
      output: renderProviderPerfView({
        timedProviders,
        ambiguousModels: perf.ambiguousRows.map((entry) => `${entry.row.model} -> ${entry.providers.join("/")}`),
        unmappedModels: perf.unmappedRows.map((row) => row.model),
      }),
      data: {
        timedProviders: timedProviders.length,
        ambiguousCount: perf.ambiguousRows.length,
        unmappedCount: perf.unmappedRows.length,
      },
    };
  }

  if (view.kind === "focus" && view.provider) {
    const provider = view.provider;
    const normalizedCurrent = normalizeProviderAlias(runtime.provider ?? "");
    const normalizedSelected = normalizeProviderAlias(runtime.selectedProvider ?? "");
    const selectedHealth = Object.entries(runtime.providerHealth ?? {}).find(
      ([name]) => normalizeProviderAlias(name) === provider,
    )?.[1];
    const outgoingChain = failoverEntries.find(([name]) => normalizeProviderAlias(name) === provider)?.[1] ?? [];
    const incomingChain = failoverEntries
      .filter(([, chain]) => chain.map((item) => normalizeProviderAlias(item)).includes(provider))
      .map(([name]) => normalizeProviderAlias(name));
    const incomingFailovers = recentFailovers.filter((event) => normalizeProviderAlias(event.toProvider ?? "") === provider);
    const outgoingFailovers = recentFailovers.filter((event) => normalizeProviderAlias(event.fromProvider ?? "") === provider);
    const relatedChecks = providerStartupChecks(provider, opts.startupReport);
    const recoveryHints = providerRecoveryHints(provider, runtime, opts.startupReport);
    const configuredModel = providerConfiguredModel(runtime, provider);
    const providerPerf = providerPerfSummaries(opts.costTracker, runtime).summaries.find((entry) => entry.provider === provider);
    return {
      output: renderFocusedProviderStatusView({
        provider,
        configuredModel,
        currentProvider: runtime.provider ?? "unknown",
        currentModel: normalizedCurrent === provider ? runtime.model ?? "unknown" : "n/a",
        isCurrent: normalizedCurrent === provider,
        isSelectedDefault: normalizedSelected === provider,
        observedHealth: selectedHealth
          ? {
              state: selectedHealth.state ?? "unknown",
              failures: selectedHealth.failureCount ?? 0,
            }
          : undefined,
        outgoingChain,
        incomingChain,
        outgoingFailovers: outgoingFailovers.map((event) => formatFailoverEventLine(event)),
        incomingFailovers: incomingFailovers.map((event) => formatFailoverEventLine(event)),
        relatedChecks: relatedChecks.map((check) => ({
          prefix: doctorCheckPrefix(check),
          name: check.name ?? "check",
          message: check.message ?? "",
          fix: check.fix,
          passed: Boolean(check.passed),
        })),
        recoveryHints,
        performanceLine: providerPerf && providerPerf.rows.length > 0
          ? `Performance: ${providerPerf.totalApiDurationS.toFixed(1)}s over ${providerPerf.totalCalls} calls | /provider perf ${provider}`
          : undefined,
      }),
      data: {
        provider,
        currentProvider: runtime.provider ?? null,
        outgoingChain,
        incomingChain,
        relatedCheckCount: relatedChecks.length,
      },
    };
  }

  const currentProvider = normalizeProviderAlias(runtime.provider ?? "");
  const summaryHints = currentProvider
    ? providerRecoveryHints(currentProvider, runtime, opts.startupReport)
    : [];
  const timedProviders = providerPerfSummaries(opts.costTracker, runtime).summaries.filter((entry) => entry.rows.length > 0);
  return {
    output: renderProviderSummaryView({
      selectedProvider: runtime.selectedProvider,
      selectedModel: runtime.selectedModel,
      currentProvider: runtime.provider ?? "unknown",
      currentModel: runtime.model ?? "unknown",
      circuitState: runtime.circuitState ?? "unknown",
      availableProviders: available,
      startupErrors: runtime.startupErrors,
      startupWarnings: runtime.startupWarnings,
      failoverEntries: failoverEntries.map(([provider, chain]) => ({
        provider: normalizeProviderAlias(provider),
        chain: chain.map((item) => normalizeProviderAlias(item)),
      })),
      observedHealth: observedHealth.map(([provider, health]) => ({
        provider: normalizeProviderAlias(provider),
        state: typeof health.state === "string" ? health.state : "unknown",
        failures: typeof health.failureCount === "number" ? health.failureCount : 0,
      })),
      recentFailovers: recentFailovers.map((event) => formatFailoverEventLine(event)),
      summaryHints,
      performanceLine: timedProviders.length > 0
        ? `Performance: ${timedProviders.length} provider(s) timed | slowest ${timedProviders[0].provider} ${timedProviders[0].totalApiDurationS.toFixed(1)}s | /provider perf`
        : undefined,
    }),
    data: {
      provider: runtime.provider ?? null,
      model: runtime.model ?? null,
      availableProviders: available,
      providerHealth: runtime.providerHealth ?? {},
      recentFailovers,
    },
  };
}
