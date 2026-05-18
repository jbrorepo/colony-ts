import {
  formatRuntimeEventLine,
  renderEventsListView,
  renderEventsPerfView,
  renderEventsSummaryView,
  renderPerfSummaryView,
  type RuntimeEventLine,
} from "./gateway-events";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const events: RuntimeEventLine[] = [
  {
    kind: "tool",
    status: "ok",
    subject: "file_read github_pat_EVENT_SUBJECT_SHOULD_NOT_LEAK12345678",
    detail: "preview ghp_EVENT_DETAIL_SHOULD_NOT_LEAK12345678",
    timestamp: Date.parse("2026-05-18T09:58:00.000Z"),
    failure: false,
    durationMs: 25,
  },
  {
    kind: "failover",
    status: "provider_error",
    subject: "anthropic -> openai",
    detail: "Bearer ghp_FAILOVER_DETAIL_SHOULD_NOT_LEAK12345678",
    timestamp: Date.parse("2026-05-18T09:59:00.000Z"),
    failure: true,
    durationMs: 80,
  },
];

const singleLine = formatRuntimeEventLine(events[0]!);
assert(singleLine.includes("tool | file_read [REDACTED] | 25ms | ok | preview [REDACTED]"), "runtime event line redacts subject and detail");
assert(!singleLine.includes("EVENT_SUBJECT_SHOULD_NOT_LEAK"), "runtime event line redacts subject body");
assert(!singleLine.includes("EVENT_DETAIL_SHOULD_NOT_LEAK"), "runtime event line redacts detail body");
assert(!singleLine.includes("github_pat_"), "runtime event line redacts GitHub PAT prefix");
assert(!singleLine.includes("ghp_"), "runtime event line redacts GitHub token prefix");

const summary = renderEventsSummaryView({
  toolCount: 1,
  hookCount: 0,
  compactionCount: 0,
  failoverCount: 1,
  failureCount: 1,
  timedEvents: events,
  events,
  views: "/events",
});
assert(summary.includes("Slowest timed event: failover | anthropic -> openai | 80ms"), "events summary keeps nonsecret slowest subject");
assert(summary.includes("Latest: 2026-05-18T09:58:00.000Z | tool | file_read [REDACTED] | 25ms | ok | preview [REDACTED]"), "events summary redacts latest event line");
assert(!summary.includes("EVENT_SUBJECT_SHOULD_NOT_LEAK"), "events summary redacts latest subject body");
assert(!summary.includes("EVENT_DETAIL_SHOULD_NOT_LEAK"), "events summary redacts latest detail body");

const list = renderEventsListView({
  view: "recent",
  events,
  views: "/events",
});
assert(list.includes("2026-05-18T09:58:00.000Z | tool | file_read [REDACTED] | 25ms | ok | preview [REDACTED]"), "events list redacts event line");
assert(list.includes("2026-05-18T09:59:00.000Z | failover | anthropic -> openai | 80ms | provider_error | Bearer ****"), "events list redacts failover detail");
assert(!list.includes("EVENT_SUBJECT_SHOULD_NOT_LEAK"), "events list redacts subject body");
assert(!list.includes("FAILOVER_DETAIL_SHOULD_NOT_LEAK"), "events list redacts failover detail body");
assert(!list.includes("github_pat_"), "events list redacts GitHub PAT prefix");
assert(!list.includes("ghp_"), "events list redacts GitHub token prefix");

const perf = renderEventsPerfView({
  events,
  timedEvents: events,
  failureCount: 1,
  views: "/events",
});
assert(perf.includes("Slowest timed event: failover | anthropic -> openai | 80ms"), "events perf keeps nonsecret slowest subject");
assert(perf.includes("2026-05-18T09:58:00.000Z | tool | file_read [REDACTED] | 25ms | ok | preview [REDACTED]"), "events perf top activity redacts event line");
assert(!perf.includes("EVENT_DETAIL_SHOULD_NOT_LEAK"), "events perf redacts event detail body");
assert(!perf.includes("FAILOVER_DETAIL_SHOULD_NOT_LEAK"), "events perf redacts failover detail body");

const perfSummary = renderPerfSummaryView({
  modelRows: [],
  providerSummaries: [],
  runtimeEvents: events,
  timedEvents: events,
  toolSummary: {
    recentCount: 1,
    timedCount: 1,
    failureCount: 0,
    averageMs: 25,
    slowest: {
      toolName: "shell_exec ghp_TOOL_SUMMARY_SHOULD_NOT_LEAK12345678",
      durationMs: 25,
    },
  },
  hookSummary: {
    recentCount: 0,
    timedCount: 0,
    averageMs: 0,
  },
  compactionSummary: {
    recentCount: 0,
    timedCount: 0,
    failureCount: 0,
    successCount: 0,
    totalTokensSaved: 0,
    averageMs: 0,
  },
  views: "/perf",
});
assert(perfSummary.includes("Slowest tool: shell_exec [REDACTED] | 25ms"), "perf summary redacts slowest tool name");
assert(perfSummary.includes("Slowest event: failover | anthropic -> openai | 80ms"), "perf summary keeps nonsecret slowest event subject");
assert(!perfSummary.includes("TOOL_SUMMARY_SHOULD_NOT_LEAK"), "perf summary redacts slowest tool token body");
assert(!perfSummary.includes("ghp_"), "perf summary redacts GitHub token prefix");

console.log("Phase 360: runtime event metadata redacts secret-shaped subject and detail text.");
