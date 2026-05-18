import type { SlashCommandContext } from "./gateway-contract";
import { normalizeProviderAlias } from "./gateway-provider";
import { recentToolActivity, type GatewayToolActivity } from "./gateway-tools";
import { scrubSecrets } from "./security/log-sanitizer";

export interface RuntimeEventLine {
  kind: "tool" | "hook" | "compaction" | "failover";
  status: string;
  subject: string;
  detail?: string;
  timestamp: number;
  failure: boolean;
  durationMs?: number;
}

export interface GatewayPerfModelRow {
  model: string;
  callCount: number;
  apiDurationS: number;
}

export interface GatewayProviderPerfSummary {
  provider: string;
  totalCalls: number;
  totalApiDurationS: number;
}

export interface GatewayToolPerfSummary {
  recentCount: number;
  timedCount: number;
  failureCount: number;
  averageMs: number;
  slowest?: {
    toolName: string;
    durationMs?: number;
  };
}

export interface GatewayHookPerfSummary {
  recentCount: number;
  timedCount: number;
  averageMs: number;
  slowest?: {
    kind: string;
    detail?: string;
    durationMs?: number;
  };
}

export interface GatewayCompactionPerfSummary {
  recentCount: number;
  timedCount: number;
  failureCount: number;
  successCount: number;
  totalTokensSaved: number;
  averageMs: number;
  strongestSave?: {
    strategy: string;
    tokensSavedEstimate: number;
    originalCount: number;
    finalCount: number;
  };
  slowest?: {
    strategy: string;
    durationMs?: number;
  };
}

export interface GatewayCompactionEntry {
  strategy: string;
  trigger: string;
  timestamp: number;
  durationMs?: number;
  compacted: boolean;
  originalCount: number;
  finalCount: number;
  tokensSavedEstimate: number;
  summaryLineCount: number;
  summarizedMessageCount: number;
  failureMessage?: string;
}

export interface GatewayCompactionHandoffEntry {
  status: "ok" | "failed";
  strategy: string;
  trigger: string;
  timestamp: number;
  loggedCount: number;
  structuredCount: number;
  artifactId?: string;
  artifactChars?: number;
  errorMessage?: string;
}

export interface GatewayHookEvent {
  kind: string;
  detail?: string;
  timestamp: number;
  durationMs?: number;
}

export interface GatewayEventsCommandPayload {
  output: string;
  data?: Record<string, unknown>;
  isError?: boolean;
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

export function compactionPressureLabel(
  snapshot?: SlashCommandContext["contextUsage"] | null,
): "ok" | "warning" | "blocking" | "unknown" {
  if (!snapshot) return "unknown";
  if (snapshot.isAtBlockingLimit) return "blocking";
  if (snapshot.isAboveWarningThreshold) return "warning";
  return "ok";
}

export function recentCompactionEntries(ctx: SlashCommandContext): GatewayCompactionEntry[] {
  if (!Array.isArray(ctx.recentCompactions)) return [];
  return ctx.recentCompactions
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => ({
      strategy: readString(entry, ["strategy"], "unknown"),
      trigger: readString(entry, ["trigger"], "unknown"),
      timestamp: readNumber(entry, ["timestamp"]),
      durationMs: (() => {
        const duration = readNumber(entry, ["durationMs"], 0);
        return duration > 0 ? duration : undefined;
      })(),
      compacted: Boolean(entry.compacted),
      originalCount: readNumber(entry, ["originalCount"], 0),
      finalCount: readNumber(entry, ["finalCount"], 0),
      tokensSavedEstimate: readNumber(entry, ["tokensSavedEstimate"], 0),
      summaryLineCount: readNumber(entry, ["summaryLineCount"], 0),
      summarizedMessageCount: readNumber(entry, ["summarizedMessageCount"], 0),
      failureMessage: readString(entry, ["failureMessage"]),
    }))
    .filter((entry) => entry.strategy.length > 0 && entry.trigger.length > 0 && entry.timestamp > 0)
    .slice(-8);
}

export function latestCompactionHandoffEntry(ctx: SlashCommandContext): GatewayCompactionHandoffEntry | null {
  const entry = ctx.latestCompactionHandoff;
  if (!entry || typeof entry !== "object") return null;
  const status = entry.status === "ok" || entry.status === "failed" ? entry.status : null;
  const strategy = readString(entry as Record<string, unknown>, ["strategy"], "unknown");
  const trigger = readString(entry as Record<string, unknown>, ["trigger"], "unknown");
  const timestamp = readNumber(entry as Record<string, unknown>, ["timestamp"], 0);
  if (!status || timestamp <= 0) return null;
  return {
    status,
    strategy,
    trigger,
    timestamp,
    loggedCount: readNumber(entry as Record<string, unknown>, ["loggedCount"], 0),
    structuredCount: readNumber(entry as Record<string, unknown>, ["structuredCount"], 0),
    artifactId: readString(entry as Record<string, unknown>, ["artifactId"]),
    artifactChars: (() => {
      const chars = readNumber(entry as Record<string, unknown>, ["artifactChars"], 0);
      return chars > 0 ? chars : undefined;
    })(),
    errorMessage: readString(entry as Record<string, unknown>, ["errorMessage"]),
  };
}

export function recentHookEvents(ctx: SlashCommandContext): GatewayHookEvent[] {
  const hookRunner = ctx.hookRunner;
  if (!hookRunner || typeof hookRunner !== "object") return [];
  const record = hookRunner as Record<string, unknown>;
  if (!Array.isArray(record.recentEvents)) return [];
  return record.recentEvents
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => ({
      kind: readString(entry, ["kind"], "unknown"),
      detail: readString(entry, ["detail"]),
      timestamp: readNumber(entry, ["timestamp"], 0),
      durationMs: (() => {
        const duration = readNumber(entry, ["durationMs"], 0);
        return duration > 0 ? duration : undefined;
      })(),
    }))
    .filter((entry) => entry.kind.length > 0 && entry.timestamp > 0)
    .slice(-8);
}

export function trimDurationPrefix(detail: string | undefined, durationMs: number | undefined): string | undefined {
  if (!detail) return undefined;
  if (!durationMs || durationMs <= 0) return detail;
  const prefix = `${durationMs}ms | `;
  if (detail.startsWith(prefix)) return detail.slice(prefix.length);
  if (detail === `${durationMs}ms`) return undefined;
  return detail;
}

export function recentRuntimeEvents(ctx: SlashCommandContext): RuntimeEventLine[] {
  const toolEvents = recentToolActivity(ctx.session, 8)
    .map((entry) => ({
      kind: "tool" as const,
      status: entry.status,
      subject: entry.toolName,
      detail: trimDurationPrefix(
        entry.detail ?? (entry.artifactPath ? `saved ${entry.artifactPath}` : undefined),
        entry.durationMs,
      ),
      timestamp: entry.timestamp ? Date.parse(entry.timestamp) : 0,
      failure: ["error", "denied by operator", "cancelled"].includes(entry.status.toLowerCase()),
      durationMs: entry.durationMs,
    }))
    .filter((entry) => entry.timestamp > 0);

  const hookEvents = recentHookEvents(ctx).map((entry) => ({
    kind: "hook" as const,
    status: "ok",
    subject: entry.kind,
    detail: entry.detail,
    timestamp: entry.timestamp,
    failure: false,
    durationMs: entry.durationMs,
  }));

  const compactionEvents = recentCompactionEntries(ctx).map((entry) => ({
    kind: "compaction" as const,
    status: entry.failureMessage ? "failure" : entry.compacted ? "ok" : "skipped",
    subject: entry.strategy,
    detail: entry.failureMessage
      ? `${entry.trigger} | ${entry.failureMessage}`
      : `${entry.trigger} | ${entry.originalCount}->${entry.finalCount} | saved ${entry.tokensSavedEstimate.toLocaleString()}`,
    timestamp: entry.timestamp,
    failure: Boolean(entry.failureMessage) || !entry.compacted,
    durationMs: entry.durationMs,
  }));

  const failoverEvents = (ctx.runtime?.recentFailovers ?? []).slice(-8).map((entry) => ({
    kind: "failover" as const,
    status: entry.errorType ?? "failover",
    subject: `${normalizeProviderAlias(entry.fromProvider ?? "unknown")} -> ${normalizeProviderAlias(entry.toProvider ?? "unknown")}`,
    detail: entry.errorMessage ?? undefined,
    timestamp: typeof entry.timestamp === "number" ? entry.timestamp : 0,
    failure: true,
  })).filter((entry) => entry.timestamp > 0);

  return [...toolEvents, ...hookEvents, ...compactionEvents, ...failoverEvents]
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 12);
}

export function timedRuntimeEvents(events: RuntimeEventLine[]): RuntimeEventLine[] {
  return events.filter((event) => typeof event.durationMs === "number" && Number.isFinite(event.durationMs) && event.durationMs > 0);
}

export function toolPerfSummary(ctx: SlashCommandContext): GatewayToolPerfSummary {
  const recent = recentToolActivity(ctx.session, 8);
  const timed = recent.filter((entry) => typeof entry.durationMs === "number" && entry.durationMs > 0);
  const failureCount = recent.filter((entry) => ["error", "denied by operator", "cancelled"].includes(entry.status.toLowerCase())).length;
  const averageMs = timed.length > 0
    ? timed.reduce((sum, entry) => sum + (entry.durationMs ?? 0), 0) / timed.length
    : 0;
  const slowest = timed.reduce<GatewayToolActivity | undefined>((current, entry) => (
    !current || (entry.durationMs ?? 0) > (current.durationMs ?? 0) ? entry : current
  ), undefined);
  return { recentCount: recent.length, timedCount: timed.length, failureCount, averageMs, slowest };
}

export function hookPerfSummary(ctx: SlashCommandContext): GatewayHookPerfSummary {
  const recent = recentHookEvents(ctx);
  const timed = recent.filter((entry) => typeof entry.durationMs === "number" && entry.durationMs > 0);
  const averageMs = timed.length > 0
    ? timed.reduce((sum, entry) => sum + (entry.durationMs ?? 0), 0) / timed.length
    : 0;
  const slowest = timed.reduce<GatewayHookEvent | undefined>((current, entry) => (
    !current || (entry.durationMs ?? 0) > (current.durationMs ?? 0) ? entry : current
  ), undefined);
  return { recentCount: recent.length, timedCount: timed.length, averageMs, slowest };
}

export function compactionPerfSummary(ctx: SlashCommandContext): GatewayCompactionPerfSummary {
  const recent = recentCompactionEntries(ctx);
  const timed = recent.filter((entry) => typeof entry.durationMs === "number" && entry.durationMs > 0);
  const failureCount = recent.filter((entry) => Boolean(entry.failureMessage)).length;
  const successEntries = recent.filter((entry) => entry.compacted && !entry.failureMessage);
  const strongestSave = successEntries.reduce<GatewayCompactionEntry | undefined>((current, entry) => (
    !current || entry.tokensSavedEstimate > current.tokensSavedEstimate ? entry : current
  ), undefined);
  const slowest = timed.reduce<GatewayCompactionEntry | undefined>((current, entry) => (
    !current || (entry.durationMs ?? 0) > (current.durationMs ?? 0) ? entry : current
  ), undefined);
  return {
    recentCount: recent.length,
    timedCount: timed.length,
    failureCount,
    successCount: successEntries.length,
    totalTokensSaved: successEntries.reduce((sum, entry) => sum + entry.tokensSavedEstimate, 0),
    averageMs: timed.length > 0
      ? timed.reduce((sum, entry) => sum + (entry.durationMs ?? 0), 0) / timed.length
      : 0,
    strongestSave,
    slowest,
  };
}

type GatewayEventsViewMode = "summary" | "recent" | "failures" | "tools" | "hooks" | "compactions" | "failovers" | "perf";
type GatewayPerfViewMode = "summary" | "runtime" | "models" | "providers" | "tools" | "hooks" | "compactions";

export function eventsInspectViews(): string {
  return "/events | /events recent | /events failures | /events tools | /events hooks | /events compactions | /events failovers | /events perf";
}

export function perfInspectViews(): string {
  return "/perf | /perf runtime | /perf models | /perf providers | /perf tools | /perf hooks | /perf compactions";
}

function redactViewInput(value: string): string {
  return scrubSecrets(value.trim())
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]");
}

function redactEventSurfaceText(value: string): string {
  return scrubSecrets(value)
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]");
}

function normalizeViewInput(value: string): string {
  const redacted = redactViewInput(value);
  return redacted.includes("[REDACTED]") ? redacted : redacted.toLowerCase();
}

function normalizeViewArgs(args: string[]): string[] {
  return args.filter((arg) => !arg.trim().startsWith("--"));
}

export function resolveEventsView(args: string[]): GatewayEventsViewMode | { error: string } {
  const raw = normalizeViewInput(normalizeViewArgs(args)[0] ?? "");
  if (!raw || raw === "summary" || raw === "all") return "summary";
  if (raw === "recent" || raw === "timeline") return "recent";
  if (raw === "failures" || raw === "errors" || raw === "alerts") return "failures";
  if (raw === "perf" || raw === "performance" || raw === "latency") return "perf";
  if (raw === "tools" || raw === "tool") return "tools";
  if (raw === "hooks" || raw === "hook") return "hooks";
  if (raw === "compactions" || raw === "compaction" || raw === "compact") return "compactions";
  if (raw === "failovers" || raw === "failover" || raw === "providers") return "failovers";
  return {
    error: `Unknown events view '${raw}'.\n\nViews: ${eventsInspectViews()}`,
  };
}

export function resolvePerfView(args: string[]): GatewayPerfViewMode | { error: string } {
  const raw = normalizeViewInput(normalizeViewArgs(args)[0] ?? "");
  if (!raw || raw === "summary" || raw === "all") return "summary";
  if (raw === "runtime" || raw === "events") return "runtime";
  if (raw === "models" || raw === "model" || raw === "cost") return "models";
  if (raw === "providers" || raw === "provider") return "providers";
  if (raw === "tools" || raw === "tool") return "tools";
  if (raw === "hooks" || raw === "hook") return "hooks";
  if (raw === "compactions" || raw === "compaction" || raw === "compact") return "compactions";
  return {
    error: `Unknown perf view '${raw}'.\n\nViews: ${perfInspectViews()}`,
  };
}

export function buildEventsCommandPayload(opts: {
  args: string[];
  events: RuntimeEventLine[];
  toolCount: number;
  hookCount: number;
  compactionCount: number;
  failoverCount: number;
}): GatewayEventsCommandPayload {
  const view = resolveEventsView(opts.args);
  if (typeof view !== "string") {
    return {
      output: view.error,
      isError: true,
    };
  }

  const failureEvents = opts.events.filter((event) => event.failure);
  const timedEvents = opts.events.filter((event) => typeof event.durationMs === "number" && event.durationMs > 0);

  if (view === "summary") {
    return {
      output: renderEventsSummaryView({
        toolCount: opts.toolCount,
        hookCount: opts.hookCount,
        compactionCount: opts.compactionCount,
        failoverCount: opts.failoverCount,
        failureCount: failureEvents.length,
        timedEvents,
        events: opts.events,
        views: eventsInspectViews(),
      }),
      data: {
        view,
        toolCount: opts.toolCount,
        hookCount: opts.hookCount,
        compactionCount: opts.compactionCount,
        failoverCount: opts.failoverCount,
        failureCount: failureEvents.length,
        timedCount: timedEvents.length,
      },
    };
  }

  if (view === "perf") {
    return {
      output: renderEventsPerfView({
        events: opts.events,
        timedEvents,
        failureCount: failureEvents.length,
        views: eventsInspectViews(),
      }),
      data: { view, count: timedEvents.length, failureCount: failureEvents.length },
    };
  }

  const selectedEvents =
    view === "failures"
      ? failureEvents
      : view === "tools"
        ? opts.events.filter((event) => event.kind === "tool")
        : view === "hooks"
          ? opts.events.filter((event) => event.kind === "hook")
          : view === "compactions"
            ? opts.events.filter((event) => event.kind === "compaction")
            : view === "failovers"
              ? opts.events.filter((event) => event.kind === "failover")
              : opts.events;

  return {
    output: renderEventsListView({
      view,
      events: selectedEvents,
      views: eventsInspectViews(),
    }),
    data: { view, count: selectedEvents.length },
  };
}

export function buildPerfCommandPayload(opts: {
  args: string[];
  modelRows: GatewayPerfModelRow[];
  providerSummaries: GatewayProviderPerfSummary[];
  providerAmbiguousCount: number;
  providerUnmappedModels: string[];
  runtimeEvents: RuntimeEventLine[];
  toolSummary: GatewayToolPerfSummary;
  hookSummary: GatewayHookPerfSummary;
  compactionSummary: GatewayCompactionPerfSummary;
  renderModelsView: () => string;
}): GatewayEventsCommandPayload {
  const view = resolvePerfView(opts.args);
  if (typeof view !== "string") {
    return {
      output: view.error,
      isError: true,
    };
  }

  const timedEvents = opts.runtimeEvents.filter((event) => typeof event.durationMs === "number" && event.durationMs > 0);
  const failureCount = opts.runtimeEvents.filter((event) => event.failure).length;

  if (view === "models") {
    return {
      output: `${opts.renderModelsView()}\nInspect: ${perfInspectViews()}`,
      data: { view },
    };
  }

  if (view === "runtime") {
    return {
      output: `${renderEventsPerfView({
        events: opts.runtimeEvents,
        timedEvents,
        failureCount,
        views: eventsInspectViews(),
      })}\nInspect: ${perfInspectViews()}`,
      data: { view, count: timedEvents.length, failureCount },
    };
  }

  if (view === "providers") {
    return {
      output: renderPerfProvidersView({
        summaries: opts.providerSummaries,
        ambiguousCount: opts.providerAmbiguousCount,
        unmappedModels: opts.providerUnmappedModels,
        views: perfInspectViews(),
      }),
      data: { view, providerCount: opts.providerSummaries.length },
    };
  }

  if (view === "tools") {
    return {
      output: renderPerfToolsView(opts.toolSummary, perfInspectViews()),
      data: { view, timedCount: opts.toolSummary.timedCount },
    };
  }

  if (view === "hooks") {
    return {
      output: renderPerfHooksView(opts.hookSummary, perfInspectViews()),
      data: { view, timedCount: opts.hookSummary.timedCount },
    };
  }

  if (view === "compactions") {
    return {
      output: renderPerfCompactionsView(opts.compactionSummary, perfInspectViews()),
      data: { view, recentCount: opts.compactionSummary.recentCount },
    };
  }

  return {
    output: renderPerfSummaryView({
      modelRows: opts.modelRows,
      providerSummaries: opts.providerSummaries,
      runtimeEvents: opts.runtimeEvents,
      timedEvents,
      toolSummary: opts.toolSummary,
      hookSummary: opts.hookSummary,
      compactionSummary: opts.compactionSummary,
      views: perfInspectViews(),
    }),
    data: { view },
  };
}

export function formatRuntimeEventLine(event: RuntimeEventLine): string {
  return `${new Date(event.timestamp).toISOString()} | ${redactEventSurfaceText(event.kind)} | ${redactEventSurfaceText(event.subject)}${event.durationMs ? ` | ${event.durationMs}ms` : ""} | ${redactEventSurfaceText(event.status)}${event.detail ? ` | ${redactEventSurfaceText(event.detail)}` : ""}`;
}

export function renderPerfProvidersView(opts: {
  summaries: GatewayProviderPerfSummary[];
  ambiguousCount: number;
  unmappedModels: string[];
  views: string;
}): string {
  const lines = ["Provider Performance:", ""];
  const activeSummaries = opts.summaries.filter((summary) => summary.totalCalls > 0 || summary.totalApiDurationS > 0);
  if (activeSummaries.length === 0 && opts.ambiguousCount === 0 && opts.unmappedModels.length === 0) {
    lines.push("No provider latency recorded yet.");
  } else {
    lines.push(`Timed providers: ${activeSummaries.length}`);
    const totalApiTime = activeSummaries.reduce((sum, summary) => sum + summary.totalApiDurationS, 0);
    const totalCalls = activeSummaries.reduce((sum, summary) => sum + summary.totalCalls, 0);
    lines.push(`Total API time: ${totalApiTime.toFixed(1)}s`);
    lines.push(`Total calls: ${totalCalls}`);
    const slowest = activeSummaries
      .filter((summary) => summary.totalCalls > 0)
      .sort((left, right) => (
        right.totalApiDurationS / right.totalCalls - left.totalApiDurationS / left.totalCalls
        || right.totalApiDurationS - left.totalApiDurationS
      ))[0];
    if (slowest) {
      lines.push(`Slowest provider: ${redactEventSurfaceText(slowest.provider)} | ${(slowest.totalApiDurationS / slowest.totalCalls).toFixed(2)}s/call`);
    }
    lines.push("");
    for (const summary of activeSummaries) {
      const average = summary.totalCalls > 0 ? summary.totalApiDurationS / summary.totalCalls : 0;
      lines.push(`${redactEventSurfaceText(summary.provider)}: ${summary.totalApiDurationS.toFixed(1)}s | ${summary.totalCalls} calls | ${average.toFixed(2)}s/call`);
    }
    if (opts.ambiguousCount > 0) {
      lines.push("");
      lines.push(`Ambiguous timed models: ${opts.ambiguousCount}`);
    }
    if (opts.unmappedModels.length > 0) {
      lines.push(`Unmapped timed models: ${opts.unmappedModels.map((model) => `\`${redactEventSurfaceText(model)}\``).join(", ")}`);
    }
  }
  lines.push("");
  lines.push("Inspect: /provider perf | /provider perf <name>");
  lines.push(`Views: ${opts.views}`);
  return lines.join("\n");
}

export function renderPerfToolsView(summary: GatewayToolPerfSummary, views: string): string {
  const lines = ["Tool Performance:", ""];
  lines.push(`Recent tool events: ${summary.recentCount}`);
  lines.push(`Timed tool events: ${summary.timedCount}`);
  lines.push(`Failures: ${summary.failureCount}`);
  if (summary.timedCount > 0) {
    lines.push(`Average duration: ${summary.averageMs.toFixed(1)}ms`);
  }
  if (summary.slowest) {
    lines.push(`Slowest tool: ${redactEventSurfaceText(summary.slowest.toolName)} | ${summary.slowest.durationMs ?? 0}ms`);
  }
  lines.push("");
  lines.push("Inspect: /tools perf | /tools recent | /tools artifacts");
  lines.push(`Views: ${views}`);
  return lines.join("\n");
}

export function renderPerfHooksView(summary: GatewayHookPerfSummary, views: string): string {
  const lines = ["Hook Performance:", ""];
  lines.push(`Recent hook events: ${summary.recentCount}`);
  lines.push(`Timed hook events: ${summary.timedCount}`);
  if (summary.timedCount > 0) {
    lines.push(`Average duration: ${summary.averageMs.toFixed(1)}ms`);
  }
  if (summary.slowest) {
    lines.push(`Slowest hook: ${redactEventSurfaceText(summary.slowest.kind)}${summary.slowest.detail ? ` | ${redactEventSurfaceText(summary.slowest.detail)}` : ""} | ${summary.slowest.durationMs ?? 0}ms`);
  }
  lines.push("");
  lines.push("Inspect: /hooks perf | /hooks recent | /hooks kinds");
  lines.push(`Views: ${views}`);
  return lines.join("\n");
}

export function renderPerfCompactionsView(summary: GatewayCompactionPerfSummary, views: string): string {
  const lines = ["Compaction Performance:", ""];
  lines.push(`Recent compactions: ${summary.recentCount}`);
  lines.push(`Timed compactions: ${summary.timedCount}`);
  lines.push(`Successful compactions: ${summary.successCount}`);
  lines.push(`Failures: ${summary.failureCount}`);
  lines.push(`Total tokens saved: ${summary.totalTokensSaved.toLocaleString()}`);
  if (summary.timedCount > 0) {
    lines.push(`Average duration: ${summary.averageMs.toFixed(1)}ms`);
  }
  if (summary.strongestSave) {
    lines.push(`Best save: ${redactEventSurfaceText(summary.strongestSave.strategy)} | ~${summary.strongestSave.tokensSavedEstimate.toLocaleString()} tokens | ${summary.strongestSave.originalCount}->${summary.strongestSave.finalCount}`);
  }
  if (summary.slowest) {
    lines.push(`Slowest compaction: ${redactEventSurfaceText(summary.slowest.strategy)} | ${summary.slowest.durationMs ?? 0}ms`);
  }
  lines.push("");
  lines.push("Inspect: /compact status | /compact recent | /compact handoff");
  lines.push(`Views: ${views}`);
  return lines.join("\n");
}

export function renderPerfSummaryView(opts: {
  modelRows: GatewayPerfModelRow[];
  providerSummaries: GatewayProviderPerfSummary[];
  runtimeEvents: RuntimeEventLine[];
  timedEvents: RuntimeEventLine[];
  toolSummary: GatewayToolPerfSummary;
  hookSummary: GatewayHookPerfSummary;
  compactionSummary: GatewayCompactionPerfSummary;
  views: string;
}): string {
  const lines = ["Performance Summary:", ""];
  lines.push(`Models: ${opts.modelRows.length} timed | /cost perf`);
  if (opts.modelRows.length > 0) {
    const slowestModel = opts.modelRows
      .filter((row) => row.callCount > 0)
      .sort((left, right) => (
        right.apiDurationS / right.callCount - left.apiDurationS / left.callCount
        || right.apiDurationS - left.apiDurationS
      ))[0];
    if (slowestModel) {
      lines.push(`Slowest model: \`${redactEventSurfaceText(slowestModel.model)}\` | ${(slowestModel.apiDurationS / slowestModel.callCount).toFixed(2)}s/call`);
    }
  }
  lines.push("");
  lines.push(`Providers: ${opts.providerSummaries.length} timed | /provider perf`);
  if (opts.providerSummaries.length > 0) {
    const slowestProvider = opts.providerSummaries
      .filter((summary) => summary.totalCalls > 0)
      .sort((left, right) => (
        right.totalApiDurationS / right.totalCalls - left.totalApiDurationS / left.totalCalls
        || right.totalApiDurationS - left.totalApiDurationS
      ))[0];
    if (slowestProvider) {
      lines.push(`Slowest provider: ${redactEventSurfaceText(slowestProvider.provider)} | ${(slowestProvider.totalApiDurationS / slowestProvider.totalCalls).toFixed(2)}s/call`);
    }
  }
  lines.push("");
  lines.push(`Tools: ${opts.toolSummary.timedCount} timed of ${opts.toolSummary.recentCount} recent | /tools perf`);
  if (opts.toolSummary.slowest) {
    lines.push(`Slowest tool: ${redactEventSurfaceText(opts.toolSummary.slowest.toolName)} | ${opts.toolSummary.slowest.durationMs ?? 0}ms`);
  }
  lines.push("");
  lines.push(`Hooks: ${opts.hookSummary.timedCount} timed of ${opts.hookSummary.recentCount} recent | /hooks perf`);
  if (opts.hookSummary.slowest) {
    lines.push(`Slowest hook: ${redactEventSurfaceText(opts.hookSummary.slowest.kind)}${opts.hookSummary.slowest.detail ? ` | ${redactEventSurfaceText(opts.hookSummary.slowest.detail)}` : ""} | ${opts.hookSummary.slowest.durationMs ?? 0}ms`);
  }
  lines.push("");
  lines.push(`Runtime events: ${opts.timedEvents.length} timed of ${opts.runtimeEvents.length} recent | /events perf`);
  if (opts.timedEvents[0]) {
    const slowestEvent = opts.timedEvents.slice().sort((left, right) => (right.durationMs ?? 0) - (left.durationMs ?? 0))[0];
    lines.push(`Slowest event: ${redactEventSurfaceText(slowestEvent.kind)} | ${redactEventSurfaceText(slowestEvent.subject)} | ${slowestEvent.durationMs ?? 0}ms`);
  }
  lines.push("");
  lines.push(`Compactions: ${opts.compactionSummary.recentCount} recent | ${opts.compactionSummary.failureCount} failure | ${opts.compactionSummary.timedCount} timed | /compact recent`);
  if (opts.compactionSummary.strongestSave) {
    lines.push(`Best save: ${redactEventSurfaceText(opts.compactionSummary.strongestSave.strategy)} | ~${opts.compactionSummary.strongestSave.tokensSavedEstimate.toLocaleString()} tokens`);
  }
  if (opts.compactionSummary.slowest) {
    lines.push(`Slowest compaction: ${redactEventSurfaceText(opts.compactionSummary.slowest.strategy)} | ${opts.compactionSummary.slowest.durationMs ?? 0}ms`);
  }
  lines.push("");
  lines.push(`Views: ${opts.views}`);
  return lines.join("\n");
}

export function renderEventsSummaryView(opts: {
  toolCount: number;
  hookCount: number;
  compactionCount: number;
  failoverCount: number;
  failureCount: number;
  timedEvents: RuntimeEventLine[];
  events: RuntimeEventLine[];
  views: string;
}): string {
  const lines = ["Runtime Events:", ""];
  lines.push(`Tools: ${opts.toolCount}`);
  lines.push(`Hooks: ${opts.hookCount}`);
  lines.push(`Compactions: ${opts.compactionCount}`);
  lines.push(`Failovers: ${opts.failoverCount}`);
  lines.push(`Failures: ${opts.failureCount}`);
  lines.push(`Timed: ${opts.timedEvents.length}`);
  if (opts.timedEvents.length > 0) {
    const totalDuration = opts.timedEvents.reduce((sum, event) => sum + (event.durationMs ?? 0), 0);
    const slowest = opts.timedEvents.reduce((current, event) => (
      !current || (event.durationMs ?? 0) > (current.durationMs ?? 0) ? event : current
    ), opts.timedEvents[0]);
    lines.push(`Average duration: ${(totalDuration / opts.timedEvents.length).toFixed(1)}ms`);
    if (slowest) {
      lines.push(`Slowest timed event: ${redactEventSurfaceText(slowest.kind)} | ${redactEventSurfaceText(slowest.subject)} | ${slowest.durationMs ?? 0}ms`);
    }
  }
  if (opts.events[0]) {
    lines.push("");
    lines.push(`Latest: ${formatRuntimeEventLine(opts.events[0])}`);
  } else {
    lines.push("");
    lines.push("No runtime events recorded yet.");
  }
  lines.push("");
  lines.push(`Views: ${opts.views}`);
  return lines.join("\n");
}

export function renderEventsPerfView(opts: {
  events: RuntimeEventLine[];
  timedEvents: RuntimeEventLine[];
  failureCount: number;
  views: string;
}): string {
  const lines = ["Runtime Event Performance:", ""];
  lines.push(`Recent events: ${opts.events.length}`);
  lines.push(`Timed events: ${opts.timedEvents.length}`);
  lines.push(`Failures: ${opts.failureCount}`);
  const timedTools = opts.timedEvents.filter((event) => event.kind === "tool");
  const timedHooks = opts.timedEvents.filter((event) => event.kind === "hook");
  lines.push(`Timed tools: ${timedTools.length}`);
  lines.push(`Timed hooks: ${timedHooks.length}`);
  if (opts.timedEvents.length === 0) {
    lines.push("");
    lines.push("No timed runtime events recorded yet.");
  } else {
    const totalDuration = opts.timedEvents.reduce((sum, event) => sum + (event.durationMs ?? 0), 0);
    const slowest = opts.timedEvents.reduce((current, event) => (
      !current || (event.durationMs ?? 0) > (current.durationMs ?? 0) ? event : current
    ), opts.timedEvents[0]);
    lines.push(`Average duration: ${(totalDuration / opts.timedEvents.length).toFixed(1)}ms`);
    if (slowest) {
      lines.push(`Slowest timed event: ${redactEventSurfaceText(slowest.kind)} | ${redactEventSurfaceText(slowest.subject)} | ${slowest.durationMs ?? 0}ms`);
    }
    lines.push("");
    lines.push("Top timed activity:");
    for (const event of opts.timedEvents
      .slice()
      .sort((left, right) => (right.durationMs ?? 0) - (left.durationMs ?? 0))
      .slice(0, 5)) {
      lines.push(formatRuntimeEventLine(event));
    }
  }
  lines.push("");
  lines.push(`Views: ${opts.views}`);
  return lines.join("\n");
}

export function renderEventsListView(opts: {
  view: "recent" | "failures" | "tools" | "hooks" | "compactions" | "failovers";
  events: RuntimeEventLine[];
  views: string;
}): string {
  const lines = [
    opts.view === "failures"
      ? "Runtime Event Failures:"
      : opts.view === "tools"
        ? "Runtime Tool Events:"
        : opts.view === "hooks"
          ? "Runtime Hook Events:"
          : opts.view === "compactions"
            ? "Runtime Compaction Events:"
            : opts.view === "failovers"
              ? "Runtime Failover Events:"
              : "Recent Runtime Events:",
    "",
  ];
  if (opts.events.length === 0) {
    lines.push(
      opts.view === "failures"
        ? "No failure-class runtime events recorded yet."
        : opts.view === "tools"
          ? "No tool events recorded yet."
          : opts.view === "hooks"
            ? "No hook events recorded yet."
            : opts.view === "compactions"
              ? "No compaction events recorded yet."
              : opts.view === "failovers"
                ? "No failover events recorded yet."
                : "No runtime events recorded yet.",
    );
  } else {
    for (const event of opts.events) {
      lines.push(formatRuntimeEventLine(event));
    }
  }
  lines.push("");
  lines.push(`Views: ${opts.views}`);
  return lines.join("\n");
}
