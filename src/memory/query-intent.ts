const REASONING_TERMS = [
  "why",
  "reason",
  "rationale",
  "tradeoff",
  "trade-off",
  "explain",
  "because",
  "justify",
  "justification",
  "motivation",
] as const;

const ADVICE_TERMS = [
  "should i",
  "how should",
  "what should",
  "should we",
  "what now",
  "what next",
  "next step",
  "next steps",
  "how do we proceed",
  "how to proceed",
  "move forward",
  "recommend",
  "recommendation",
  "advice",
  "best way",
] as const;

const RISK_TERMS = [
  "risk",
  "risky",
  "avoid",
  "watch out",
  "be careful",
  "careful",
  "caution",
  "unsafe",
  "danger",
  "dangerous",
  "pitfall",
  "pitfalls",
  "gotcha",
  "gotchas",
] as const;

const COMPARISON_TERMS = [
  "what changed",
  "changed",
  "change",
  "difference",
  "different",
  "compare",
  "comparison",
  "versus",
  "vs ",
  "delta",
  "before and after",
  "before vs after",
] as const;

const PREFERENCE_TERMS = [
  "prefer",
  "preference",
  "like",
  "dislike",
  "habit",
  "style",
  "favorite",
  "favourite",
  "usually use",
  "tend to use",
] as const;

const EVENT_TERMS = [
  "what happened",
  "happened",
  "history",
  "incident",
  "incidents",
  "timeline",
  "milestone",
  "debug session",
  "during the debug",
  "during rollout",
] as const;

const DIAGNOSTIC_TERMS = [
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
  "error",
  "errors",
  "failed",
  "failure",
  "failures",
  "failing",
  "root cause",
  "root-cause",
  "diagnostic",
  "diagnostics",
  "exception",
  "exceptions",
  "traceback",
  "stack trace",
  "stacktrace",
  "crash",
  "crashed",
] as const;

const CONSTRAINT_TERMS = [
  "constraint",
  "constraints",
  "rule",
  "rules",
  "requirement",
  "requirements",
  "must",
  "must not",
  "never",
  "always",
  "forbidden",
  "not allowed",
] as const;

const DISCOVERY_TERMS = [
  "what did we learn",
  "learned",
  "learn",
  "discovered",
  "discover",
  "insight",
  "insights",
  "breakthrough",
  "breakthroughs",
] as const;

const PATTERN_TERMS = [
  "pattern",
  "patterns",
  "convention",
  "conventions",
  "architecture",
  "architectural",
  "design",
  "workflow",
] as const;

const FACT_TERMS = [
  "fact",
  "facts",
  "remember",
  "environment",
  "runtime",
  "detail",
  "details",
  "status",
  "state",
] as const;

const OWNERSHIP_TERMS = [
  "who owns",
  "who is owner",
  "owner",
  "owners",
  "ownership",
  "owned by",
  "owns",
  "responsible for",
  "who is responsible",
  "responsibility",
  "accountable for",
  "accountability",
  "contact for",
  "point of contact",
  "poc",
] as const;

const ENTITY_TERMS = [
  "who owns",
  "who is responsible",
  "which file",
  "what file",
  "file path",
  "which path",
  "what path",
  "which env var",
  "what env var",
  "environment variable",
  "env var",
  "env vars",
  "which flag",
  "what flag",
  "cli flag",
  "command flag",
  "which endpoint",
  "what endpoint",
  "endpoint",
  "endpoints",
  "which url",
  "what url",
  "url",
  "urls",
  "which port",
  "what port",
  "port",
  "ports",
  "which provider",
  "what provider",
  "which model",
  "what model",
  "which tool",
  "what tool",
  "which command",
  "what command",
  "which function",
  "what function",
  "which class",
  "what class",
  "which module",
  "what module",
  "which repo",
  "what repo",
  "which project",
  "what project",
  "which service",
  "what service",
  "service",
  "which database",
  "what database",
  "database",
  "which queue",
  "what queue",
  "queue",
  "which bucket",
  "what bucket",
  "bucket",
  "which table",
  "what table",
  "table",
  "which topic",
  "what topic",
  "topic",
  "which host",
  "what host",
  "host",
  "which domain",
  "what domain",
  "domain",
  "which region",
  "what region",
  "region",
  "which cluster",
  "what cluster",
  "cluster",
  "which namespace",
  "what namespace",
  "namespace",
  "which schema",
  "what schema",
  "schema",
  "which pod",
  "what pod",
  "pod",
  "which deployment",
  "what deployment",
  "deployment",
  "which image",
  "what image",
  "image",
  "which container",
  "what container",
  "container",
  "which job",
  "what job",
  "job",
  "which volume",
  "what volume",
  "volume",
  "which package",
  "what package",
  "package",
  "which library",
  "what library",
  "library",
  "which branch",
  "what branch",
  "which commit",
  "what commit",
  "which pull request",
  "what pull request",
  "pull request",
  "which issue",
  "what issue",
  "which ticket",
  "what ticket",
  "which bug",
  "what bug",
  "bug id",
  "which exit code",
  "what exit code",
  "which status code",
  "what status code",
  "which http status",
  "what http status",
  "which errno",
  "what errno",
  "which bun version",
  "what bun version",
  "which node version",
  "what node version",
  "which python version",
  "what python version",
  "which typescript version",
  "what typescript version",
  "which tsc version",
  "what tsc version",
  "runtime version",
  "toolchain version",
] as const;

const METRIC_TERMS = [
  "metric",
  "metrics",
  "latency",
  "performance",
  "perf",
  "budget",
  "cost",
  "token usage",
  "token count",
  "throughput",
  "threshold",
  "thresholds",
  "quota",
  "rate limit",
  "rate-limit",
  "slo",
  "p50",
  "p75",
  "p90",
  "p95",
  "p99",
  "error budget",
  "rps",
  "qps",
] as const;

const PROCEDURE_TERMS = [
  "procedure",
  "procedures",
  "runbook",
  "runbooks",
  "playbook",
  "playbooks",
  "step by step",
  "step-by-step",
  "steps to",
  "process",
  "processes",
] as const;

const DECISION_TERMS = [
  "decision",
  "decide",
  "decided",
  "agreed",
  "chose",
  "chosen",
] as const;

export function hasReasoningIntent(query: string): boolean {
  const lower = query.toLowerCase();
  return REASONING_TERMS.some((term) => lower.includes(term));
}

export function hasAdviceIntent(query: string): boolean {
  const lower = query.toLowerCase();
  return ADVICE_TERMS.some((term) => lower.includes(term));
}

export function hasRiskIntent(query: string): boolean {
  const lower = query.toLowerCase();
  return RISK_TERMS.some((term) => lower.includes(term));
}

export function hasComparisonIntent(query: string): boolean {
  const lower = query.toLowerCase();
  return COMPARISON_TERMS.some((term) => lower.includes(term));
}

export function hasPreferenceIntent(query: string): boolean {
  const lower = query.toLowerCase();
  return PREFERENCE_TERMS.some((term) => lower.includes(term));
}

export function hasEventIntent(query: string): boolean {
  const lower = query.toLowerCase();
  return EVENT_TERMS.some((term) => lower.includes(term));
}

export function hasDiagnosticIntent(query: string): boolean {
  const lower = query.toLowerCase();
  return DIAGNOSTIC_TERMS.some((term) => lower.includes(term));
}

export function hasConstraintIntent(query: string): boolean {
  const lower = query.toLowerCase();
  return CONSTRAINT_TERMS.some((term) => lower.includes(term));
}

export function hasDiscoveryIntent(query: string): boolean {
  const lower = query.toLowerCase();
  return DISCOVERY_TERMS.some((term) => lower.includes(term));
}

export function hasPatternIntent(query: string): boolean {
  const lower = query.toLowerCase();
  return PATTERN_TERMS.some((term) => lower.includes(term));
}

export function hasFactIntent(query: string): boolean {
  const lower = query.toLowerCase();
  return FACT_TERMS.some((term) => lower.includes(term)) || hasOwnershipIntent(query);
}

export function hasEntityIntent(query: string): boolean {
  const lower = query.toLowerCase();
  return ENTITY_TERMS.some((term) => lower.includes(term)) || hasOwnershipIntent(query);
}

export function hasMetricIntent(query: string): boolean {
  const lower = query.toLowerCase();
  return METRIC_TERMS.some((term) => lower.includes(term));
}

export function hasProcedureIntent(query: string): boolean {
  const lower = query.toLowerCase();
  return PROCEDURE_TERMS.some((term) => lower.includes(term));
}

export function hasDecisionIntent(query: string): boolean {
  const lower = query.toLowerCase();
  return DECISION_TERMS.some((term) => lower.includes(term));
}

export function hasOwnershipIntent(query: string): boolean {
  const lower = query.toLowerCase();
  return OWNERSHIP_TERMS.some((term) => lower.includes(term));
}
