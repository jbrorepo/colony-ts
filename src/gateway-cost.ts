import { scrubSecrets } from "./security/log-sanitizer";

export type CostViewMode = "summary" | "models" | "budget" | "perf";

export interface GatewayCostUsageRow {
  model: string;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  apiDurationS: number;
}

export interface GatewayBudgetView {
  maxUsd?: number | null;
  maxTokens?: number | null;
}

export interface GatewayCostCommandPayload {
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

export function costSummary(tracker: unknown): string {
  if (!tracker || typeof tracker !== "object") return "(No cost tracker)";
  const record = tracker as Record<string, unknown>;
  if (typeof record.formatSummary === "function") {
    return String(record.formatSummary());
  }
  const input = readNumber(record, ["totalInputTokens", "total_input_tokens"]);
  const output = readNumber(record, ["totalOutputTokens", "total_output_tokens"]);
  const tokens = readNumber(record, ["totalTokens", "total_tokens"], input + output);
  const cost = readNumber(record, ["estimatedCostUsd", "estimated_cost_usd"]);
  return [
    `Input tokens: ${input.toLocaleString()}`,
    `Output tokens: ${output.toLocaleString()}`,
    `Total tokens: ${tokens.toLocaleString()}`,
    `Estimated cost: $${cost.toFixed(6)}`,
  ].join("\n");
}

export function estimatedCostUsd(tracker: unknown): number {
  if (!tracker || typeof tracker !== "object") return 0;
  return readNumber(tracker, ["estimatedCostUsd", "estimated_cost_usd"]);
}

export function readModelUsage(tracker: unknown): GatewayCostUsageRow[] {
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

export function costInspectViews(): string {
  return "/cost | /cost models | /cost budget | /cost perf";
}

function redactCostInput(value: string): string {
  return scrubSecrets(value.trim())
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]");
}

function normalizeCostInput(value: string): string {
  const redacted = redactCostInput(value);
  return redacted.includes("[REDACTED]") ? redacted : redacted.toLowerCase();
}

function normalizeCostArgs(args: string[]): string[] {
  return args.filter((arg) => !arg.trim().startsWith("--"));
}

export function resolveCostView(args: string[]): CostViewMode | { error: string } {
  const raw = normalizeCostInput(normalizeCostArgs(args)[0] ?? "");
  if (!raw || raw === "summary" || raw === "all") return "summary";
  if (raw === "models" || raw === "model") return "models";
  if (raw === "budget" || raw === "cap") return "budget";
  if (raw === "perf" || raw === "performance" || raw === "latency") return "perf";
  return {
    error: `Unknown cost view '${raw}'.\n\nViews: ${costInspectViews()}`,
  };
}

export function renderDetailedCostBreakdown(opts: {
  summary?: string;
  totals?: {
    input: number;
    output: number;
    cacheReads: number;
    cacheWrites: number;
    tokens: number;
    cost: number;
    apiDurationS: number;
  };
  modelRows: GatewayCostUsageRow[];
}): string {
  const lines = ["Cost Breakdown:", ""];

  if (opts.summary) {
    lines.push(opts.summary);
  } else if (opts.totals) {
    lines.push(`Total input: ${opts.totals.input.toLocaleString()}`);
    lines.push(`Total output: ${opts.totals.output.toLocaleString()}`);
    lines.push(`Cache reads: ${opts.totals.cacheReads.toLocaleString()}`);
    lines.push(`Cache writes: ${opts.totals.cacheWrites.toLocaleString()}`);
    lines.push(`Total tokens: ${opts.totals.tokens.toLocaleString()}`);
    lines.push(`Estimated cost: $${opts.totals.cost.toFixed(6)}`);
    lines.push(`API time: ${opts.totals.apiDurationS.toFixed(1)}s`);
  } else {
    lines.push("No cost tracker available.");
  }

  if (opts.modelRows.length > 0) {
    lines.push("");
    lines.push("Per-Model Usage:");
    for (const row of opts.modelRows) {
      const totalTokens = row.inputTokens + row.outputTokens;
      lines.push(`  \`${row.model}\`: ${row.callCount} calls, ${totalTokens.toLocaleString()} tokens, ${row.apiDurationS.toFixed(1)}s API time`);
    }
  }

  return lines.join("\n");
}

export function renderCostModelsBreakdown(modelRows: GatewayCostUsageRow[]): string {
  const lines = ["Cost Models:"];
  if (modelRows.length === 0) {
    lines.push("");
    lines.push("No model usage tracked yet.");
    lines.push("");
    lines.push(`Views: ${costInspectViews()}`);
    return lines.join("\n");
  }

  lines.push("");
  for (const row of modelRows) {
    const totalTokens = row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheCreationTokens;
    lines.push(`\`${row.model}\``);
    lines.push(`  calls ${row.callCount} | tokens ${totalTokens.toLocaleString()} | api ${row.apiDurationS.toFixed(1)}s`);
    lines.push(`  input ${row.inputTokens.toLocaleString()} | output ${row.outputTokens.toLocaleString()}`);
    if (row.cacheReadTokens > 0 || row.cacheCreationTokens > 0) {
      lines.push(`  cache read ${row.cacheReadTokens.toLocaleString()} | cache write ${row.cacheCreationTokens.toLocaleString()}`);
    }
  }
  lines.push("");
  lines.push(`Views: ${costInspectViews()}`);
  return lines.join("\n");
}

export function renderCostBudgetBreakdown(opts: {
  budget?: GatewayBudgetView;
  estimatedCost: number;
}): string {
  const maxUsd = opts.budget?.maxUsd;
  const maxTokens = opts.budget?.maxTokens;
  const lines = ["Cost Budget:", ""];

  lines.push(`Cap: ${typeof maxUsd === "number" && Number.isFinite(maxUsd) && maxUsd > 0 ? `$${maxUsd.toFixed(2)}` : "none"}`);
  if (typeof maxTokens === "number" && Number.isFinite(maxTokens) && maxTokens > 0) {
    lines.push(`Token cap: ${maxTokens.toLocaleString()} tokens`);
  }

  if (typeof maxUsd === "number" && Number.isFinite(maxUsd) && maxUsd > 0) {
    const remainingUsd = maxUsd - opts.estimatedCost;
    const spendPct = (opts.estimatedCost / maxUsd) * 100;
    lines.push(`Remaining: $${Math.max(0, remainingUsd).toFixed(4)}`);
    lines.push(`Spend: ${spendPct.toFixed(1)}%`);
    if (remainingUsd <= 0) {
      lines.push("Action: /budget <usd> to raise cap before next run.");
    } else if (spendPct >= 80) {
      lines.push("Action: Near budget cap. Use /budget <usd> to raise cap or /status for runtime context.");
    }
  } else {
    lines.push("Budget cap not set.");
    lines.push("Action: /budget <usd> to add a USD cap.");
  }

  lines.push("");
  lines.push(`Views: ${costInspectViews()}`);
  return lines.join("\n");
}

export function renderCostPerfBreakdown(opts: {
  totalApiDurationS: number;
  totalCalls: number;
  modelRows: GatewayCostUsageRow[];
}): string {
  const lines = ["Cost Performance:", ""];
  if (opts.totalCalls <= 0 && opts.totalApiDurationS <= 0) {
    lines.push("No API performance recorded yet.");
    lines.push("");
    lines.push(`Views: ${costInspectViews()}`);
    return lines.join("\n");
  }

  lines.push(`Total API time: ${opts.totalApiDurationS.toFixed(1)}s`);
  lines.push(`Total calls: ${opts.totalCalls}`);
  if (opts.totalCalls > 0) {
    lines.push(`Average API time: ${(opts.totalApiDurationS / opts.totalCalls).toFixed(2)}s/call`);
  }

  const slowestAverage = opts.modelRows
    .filter((row) => row.callCount > 0)
    .sort((left, right) => (
      right.apiDurationS / right.callCount - left.apiDurationS / left.callCount
      || right.apiDurationS - left.apiDurationS
      || left.model.localeCompare(right.model)
    ))[0];
  if (slowestAverage) {
    lines.push(`Slowest average: \`${slowestAverage.model}\` | ${slowestAverage.callCount} calls | ${(slowestAverage.apiDurationS / slowestAverage.callCount).toFixed(2)}s/call`);
  }

  const highestTotal = opts.modelRows[0];
  if (highestTotal) {
    lines.push(`Highest total: \`${highestTotal.model}\` | ${highestTotal.apiDurationS.toFixed(1)}s over ${highestTotal.callCount} calls`);
  }

  if (opts.modelRows.length > 0) {
    lines.push("");
    lines.push("Per-Model Latency:");
    for (const row of opts.modelRows) {
      const avg = row.callCount > 0 ? row.apiDurationS / row.callCount : 0;
      lines.push(`  \`${row.model}\`: ${row.apiDurationS.toFixed(1)}s total | ${row.callCount} calls | ${avg.toFixed(2)}s/call`);
    }
  }

  lines.push("");
  lines.push(`Views: ${costInspectViews()}`);
  return lines.join("\n");
}

export function buildCostCommandPayload(opts: {
  args: string[];
  summary?: string;
  totals?: {
    input: number;
    output: number;
    cacheReads: number;
    cacheWrites: number;
    tokens: number;
    cost: number;
    apiDurationS: number;
  };
  modelRows: GatewayCostUsageRow[];
  budget?: GatewayBudgetView;
  estimatedCost: number;
}): GatewayCostCommandPayload {
  const view = resolveCostView(opts.args);
  if (typeof view === "object") {
    return {
      output: view.error,
      isError: true,
    };
  }

  const timedModelRows = opts.modelRows
    .filter((row) => row.callCount > 0 || row.apiDurationS > 0)
    .sort((left, right) => (
      right.apiDurationS - left.apiDurationS
      || right.callCount - left.callCount
      || left.model.localeCompare(right.model)
    ));

  let output = renderDetailedCostBreakdown({
    summary: opts.summary,
    totals: opts.totals,
    modelRows: opts.modelRows,
  });
  if (view === "models") {
    output = renderCostModelsBreakdown(opts.modelRows);
  } else if (view === "budget") {
    output = renderCostBudgetBreakdown({
      budget: opts.budget,
      estimatedCost: opts.estimatedCost,
    });
  } else if (view === "perf") {
    output = renderCostPerfBreakdown({
      totalApiDurationS: opts.totals?.apiDurationS ?? timedModelRows.reduce((sum, row) => sum + row.apiDurationS, 0),
      totalCalls: timedModelRows.reduce((sum, row) => sum + row.callCount, 0),
      modelRows: timedModelRows,
    });
  } else {
    output = `${output}\n\n${renderCostBudgetBreakdown({
      budget: opts.budget,
      estimatedCost: opts.estimatedCost,
    })}`;
    output = `${output}\nInspect: ${costInspectViews()}`;
  }

  return {
    output,
    data: {
      view,
      maxUsd: opts.budget?.maxUsd ?? null,
      maxTokens: opts.budget?.maxTokens ?? null,
    },
  };
}
