import { buildEventsCommandPayload, buildPerfCommandPayload } from "./gateway-events";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function renderEvents(args: string[]) {
  return buildEventsCommandPayload({
    args,
    events: [],
    toolCount: 0,
    hookCount: 0,
    compactionCount: 0,
    failoverCount: 0,
  });
}

function renderPerf(args: string[]) {
  return buildPerfCommandPayload({
    args,
    modelRows: [],
    providerSummaries: [],
    providerAmbiguousCount: 0,
    providerUnmappedModels: [],
    runtimeEvents: [],
    toolSummary: { recentCount: 0, timedCount: 0, failureCount: 0, averageMs: 0 },
    hookSummary: { recentCount: 0, timedCount: 0, averageMs: 0 },
    compactionSummary: {
      recentCount: 0,
      timedCount: 0,
      failureCount: 0,
      successCount: 0,
      totalTokensSaved: 0,
      averageMs: 0,
    },
    renderModelsView: () => "Cost Models:",
  });
}

const flagOnlyEvents = renderEvents(["--approved"]);
assert(!flagOnlyEvents.isError, "flag-only events view renders summary");
assert(flagOnlyEvents.output.includes("Runtime Events:"), "flag-only events view renders summary heading");
assert(!flagOnlyEvents.output.includes("--approved"), "flag-only events view does not echo stray flag");
assert(flagOnlyEvents.data?.view === "summary", "flag-only events stores summary view");

const flaggedEventPerf = renderEvents(["perf", "--approved"]);
assert(!flaggedEventPerf.isError, "flagged events perf view still succeeds");
assert(flaggedEventPerf.output.includes("Runtime Event Performance:"), "flagged events perf view renders perf heading");
assert(!flaggedEventPerf.output.includes("--approved"), "flagged events perf view does not echo stray flag");
assert(flaggedEventPerf.data?.view === "perf", "flagged events perf stores perf view");

const secretEvents = renderEvents(["ghp_EVENTS_SHOULD_NOT_LEAK12345678"]);
assert(secretEvents.isError, "secret-shaped events view remains rejected");
assert(secretEvents.output.includes("Unknown events view '[REDACTED]'"), "secret-shaped events view renders redacted label");
assert(!secretEvents.output.includes("EVENTS_SHOULD_NOT_LEAK"), "secret-shaped events view redacts token body");
assert(!secretEvents.output.includes("ghp_"), "secret-shaped events view redacts token prefix");

const flagOnlyPerf = renderPerf(["--approved"]);
assert(!flagOnlyPerf.isError, "flag-only perf view renders summary");
assert(flagOnlyPerf.output.includes("Performance Summary:"), "flag-only perf view renders summary heading");
assert(!flagOnlyPerf.output.includes("--approved"), "flag-only perf view does not echo stray flag");
assert(flagOnlyPerf.data?.view === "summary", "flag-only perf stores summary view");

const secretPerf = renderPerf(["github_pat_PERF_SHOULD_NOT_LEAK12345678"]);
assert(secretPerf.isError, "secret-shaped perf view remains rejected");
assert(secretPerf.output.includes("Unknown perf view '[REDACTED]'"), "secret-shaped perf view renders redacted label");
assert(!secretPerf.output.includes("PERF_SHOULD_NOT_LEAK"), "secret-shaped perf view redacts token body");
assert(!secretPerf.output.includes("github_pat_"), "secret-shaped perf view redacts token prefix");

console.log("Phase 343: events and perf command inputs ignore flags and redact secrets.");
