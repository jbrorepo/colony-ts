export const STRUCTURED_MEMORY_CATEGORIES = [
  "advice",
  "reasoning",
  "diagnostic",
  "entity",
  "metric",
  "procedure",
  "preference",
  "pattern",
  "decision",
  "constraint",
  "risk",
  "change",
  "fact",
  "discovery",
  "event",
] as const;

export type StructuredMemoryCategory = (typeof STRUCTURED_MEMORY_CATEGORIES)[number];

export interface StructuredRankingPlan {
  focus: StructuredMemoryCategory | "none";
  focusVia: string;
  hints: StructuredMemoryCategory[];
  boosts: string[];
}

export interface StructuredRankingSignals {
  categoryHints: Set<StructuredMemoryCategory>;
  metricIntent: boolean;
  ownershipIntent: boolean;
  resolutionIntent: boolean;
  focus: StructuredMemoryCategory | "none";
  focusVia: string;
  previewBoosts: string[];
}

const CATEGORY_QUERY_HINTS: Record<StructuredMemoryCategory, string[]> = {
  advice: ["advice", "recommend", "recommendation", "should", "best way", "what should", "how should"],
  reasoning: ["why", "reason", "rationale", "because", "justify", "justification", "motivation", "tradeoff", "trade-off"],
  diagnostic: ["what fixed", "what solved", "what resolved", "how did we fix", "how did we solve", "how did we resolve", "the fix", "fix was", "fixed by", "solution for", "solution to", "workaround", "resolved by", "solved by", "error", "failed", "failure", "failing", "root cause", "root-cause", "diagnostic", "exception", "traceback", "stack trace", "stacktrace", "crash"],
  entity: ["which file", "what file", "file path", "which path", "what path", "which env var", "what env var", "environment variable", "env var", "env vars", "which flag", "what flag", "cli flag", "command flag", "which endpoint", "what endpoint", "endpoint", "endpoints", "which url", "what url", "url", "urls", "which port", "what port", "port", "ports", "which provider", "what provider", "which model", "what model", "which tool", "what tool", "which command", "what command", "which function", "what function", "which class", "what class", "which module", "what module", "which repo", "what repo", "which project", "what project", "which service", "what service", "service", "which database", "what database", "database", "which queue", "what queue", "queue", "which bucket", "what bucket", "bucket", "which table", "what table", "table", "which topic", "what topic", "topic", "which host", "what host", "host", "which domain", "what domain", "domain", "which region", "what region", "region", "which cluster", "what cluster", "cluster", "which namespace", "what namespace", "namespace", "which schema", "what schema", "schema", "which pod", "what pod", "pod", "which deployment", "what deployment", "deployment", "which image", "what image", "image", "which container", "what container", "container", "which job", "what job", "job", "which volume", "what volume", "volume", "which package", "what package", "package", "which library", "what library", "library", "which branch", "what branch", "which commit", "what commit", "which pull request", "what pull request", "pull request", "which issue", "what issue", "which ticket", "what ticket", "which bug", "what bug", "bug id", "which exit code", "what exit code", "which status code", "what status code", "which http status", "what http status", "which errno", "what errno", "which bun version", "what bun version", "which node version", "what node version", "which python version", "what python version", "which typescript version", "what typescript version", "which tsc version", "what tsc version", "runtime version", "toolchain version", "provider", "model", "tool", "file", "path", "command", "module", "function", "class"],
  metric: ["metric", "latency", "performance", "perf", "budget", "cost", "token usage", "token count", "throughput", "threshold", "quota", "rate limit", "rate-limit", "slo", "p50", "p75", "p90", "p95", "p99", "error budget", "rps", "qps"],
  procedure: ["procedure", "runbook", "playbook", "step by step", "step-by-step", "steps", "steps to", "process"],
  preference: ["prefer", "preference", "like", "dislike", "habit", "style"],
  pattern: ["pattern", "convention", "architecture", "architectural", "design", "workflow"],
  decision: ["decision", "decide", "decided", "agreed", "chose", "chosen"],
  constraint: ["constraint", "rule", "requirement", "must", "never", "always", "forbidden"],
  risk: ["risk", "avoid", "unsafe", "danger", "dangerous", "watch out", "pitfall", "gotcha", "caution"],
  change: ["change", "changed", "difference", "before", "after", "delta", "switched", "instead"],
  fact: ["fact", "remember", "environment", "runtime", "detail", "status", "because", "who owns", "owner", "ownership", "responsible for", "responsibility", "accountable for", "contact for", "point of contact"],
  discovery: ["learn", "learned", "discover", "discovered", "discovery", "insight", "breakthrough"],
  event: ["event", "happened", "incident", "timeline", "milestone", "debug session"],
};

export function inferStructuredMemoryCategoryHints(query: string): Set<StructuredMemoryCategory> {
  const hints = new Set<StructuredMemoryCategory>();
  for (const category of STRUCTURED_MEMORY_CATEGORIES) {
    if (hasBoundedPhrase(query, category)) {
      hints.add(category);
      continue;
    }
    if (CATEGORY_QUERY_HINTS[category].some((hint) => hasBoundedPhrase(query, hint))) {
      hints.add(category);
    }
  }
  if (hasAnyHint(query, "reasoning")) {
    hints.add("reasoning");
    hints.add("decision");
  }
  if (hasAnyHint(query, "diagnostic")) {
    hints.add("diagnostic");
    hints.add("fact");
  }
  if (hasAnyHint(query, "entity")) {
    hints.add("entity");
    hints.add("fact");
  }
  if (hasMetricIntent(query)) {
    hints.add("metric");
    hints.add("fact");
  }
  if (hasAnyHint(query, "procedure")) {
    hints.add("procedure");
    hints.add("advice");
  }
  if (hasAnyHint(query, "decision")) hints.add("decision");
  if (hasAnyHint(query, "advice")) {
    hints.add("advice");
    hints.add("constraint");
    hints.add("preference");
    hints.add("pattern");
  }
  if (hasAnyHint(query, "risk")) {
    hints.add("risk");
    hints.add("fact");
    hints.add("pattern");
  }
  if (hasAnyHint(query, "change")) {
    hints.add("change");
    hints.add("pattern");
    hints.add("fact");
  }
  if (hasAnyHint(query, "preference")) hints.add("preference");
  if (hasAnyHint(query, "event")) {
    hints.add("event");
    hints.add("fact");
    hints.add("pattern");
  }
  if (hasAnyHint(query, "constraint")) hints.add("constraint");
  if (hasAnyHint(query, "discovery")) {
    hints.add("discovery");
    hints.add("pattern");
    hints.add("fact");
  }
  if (hasAnyHint(query, "fact")) hints.add("fact");
  if (hasOwnershipIntent(query)) {
    hints.add("fact");
    hints.add("entity");
  }
  if (hasAnyHint(query, "pattern")) hints.add("pattern");
  return hints;
}

export function inferStructuredRankingPlan(query: string): StructuredRankingPlan {
  const signals = inferStructuredRankingSignals(query);
  return {
    focus: signals.focus,
    focusVia: signals.focusVia,
    hints: [...signals.categoryHints],
    boosts: signals.previewBoosts,
  };
}

export function inferStructuredRankingSignals(query: string): StructuredRankingSignals {
  const categoryHints = inferStructuredMemoryCategoryHints(query);
  const metricIntent = hasMetricIntent(query);
  const ownershipIntent = hasOwnershipIntent(query);
  const resolutionIntent = hasResolutionIntent(query);
  const hintList = [...categoryHints];
  let focus: StructuredMemoryCategory | "none" = hintList.length > 0 ? hintList[0] : "none";
  let focusVia = hintList.length > 0 ? "category" : "none";
  const previewBoosts: string[] = [];

  if (resolutionIntent) {
    focus = "diagnostic";
    focusVia = "resolution";
    previewBoosts.push("category-diagnostic", "intent-resolution");
  } else if (ownershipIntent) {
    focus = "fact";
    focusVia = "ownership";
    previewBoosts.push("category-fact", "intent-ownership");
  } else if (metricIntent) {
    focus = "metric";
    focusVia = "metric";
    previewBoosts.push("category-metric", "intent-metric");
  } else if (hintList.length > 0) {
    previewBoosts.push(`category-${focus}`);
  }

  return {
    categoryHints,
    metricIntent,
    ownershipIntent,
    resolutionIntent,
    focus,
    focusVia,
    previewBoosts,
  };
}

function hasAnyHint(query: string, category: StructuredMemoryCategory): boolean {
  return CATEGORY_QUERY_HINTS[category].some((hint) => hasBoundedPhrase(query, hint));
}

function hasMetricIntent(query: string): boolean {
  return hasAnyHint(query, "metric");
}

function hasOwnershipIntent(query: string): boolean {
  return [
    "who owns",
    "owner",
    "ownership",
    "responsible for",
    "responsibility",
    "accountable for",
    "contact for",
    "point of contact",
  ].some((hint) => hasBoundedPhrase(query, hint));
}

function hasResolutionIntent(query: string): boolean {
  return [
    "what fixed",
    "what solved",
    "what resolved",
    "how did we fix",
    "how did we solve",
    "how did we resolve",
    "the fix",
    "fix was",
    "fixed by",
    "solution for",
    "solution to",
    "workaround",
    "resolved by",
    "solved by",
  ].some((hint) => hasBoundedPhrase(query, hint));
}

export function hasBoundedPhrase(query: string, phrase: string): boolean {
  const normalizedQuery = normalizeForPhraseMatch(query);
  const normalizedPhrase = normalizeForPhraseMatch(phrase);
  if (!normalizedQuery || !normalizedPhrase) return false;
  return (` ${normalizedQuery} `).includes(` ${normalizedPhrase} `);
}

function normalizeForPhraseMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
