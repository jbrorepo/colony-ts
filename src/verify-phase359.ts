import {
  buildHooksCommandPayload,
  renderHooksPerfView,
  renderHooksRecentView,
  renderHooksSummaryView,
} from "./gateway-runtime";
import { renderPerfHooksView, type GatewayHookPerfSummary } from "./gateway-events";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const recentEvents = [
  {
    kind: "after_tool",
    detail: "tool output github_pat_HOOK_DETAIL_SHOULD_NOT_LEAK12345678",
    timestamp: Date.parse("2026-05-18T09:50:00.000Z"),
    durationMs: 42,
  },
  {
    kind: "before_model",
    detail: "prompt ghp_HOOK_PROMPT_SHOULD_NOT_LEAK12345678",
    timestamp: Date.parse("2026-05-18T09:51:00.000Z"),
    durationMs: 120,
  },
];

const summary = renderHooksSummaryView({
  attachedHookCount: 2,
  supportedKinds: ["after_tool"],
  recentEvents,
  registeredHooks: null,
});
assert(summary.includes("Latest event: before_model | prompt [REDACTED] | 120ms"), "hooks summary redacts latest event detail");
assert(!summary.includes("HOOK_PROMPT_SHOULD_NOT_LEAK"), "hooks summary redacts latest token body");
assert(!summary.includes("ghp_"), "hooks summary redacts latest token prefix");

const recent = renderHooksRecentView(recentEvents);
assert(recent.includes("- before_model | prompt [REDACTED] | 120ms | 2026-05-18T09:51:00.000Z"), "hooks recent redacts newest event detail");
assert(recent.includes("- after_tool | tool output [REDACTED] | 42ms | 2026-05-18T09:50:00.000Z"), "hooks recent redacts older event detail");
assert(!recent.includes("HOOK_DETAIL_SHOULD_NOT_LEAK"), "hooks recent redacts detail token body");
assert(!recent.includes("HOOK_PROMPT_SHOULD_NOT_LEAK"), "hooks recent redacts prompt token body");
assert(!recent.includes("github_pat_"), "hooks recent redacts GitHub PAT prefix");
assert(!recent.includes("ghp_"), "hooks recent redacts GitHub token prefix");

const perf = renderHooksPerfView(recentEvents);
assert(perf.includes("Slowest: before_model | prompt [REDACTED] | 120ms"), "hooks perf redacts slowest detail");
assert(perf.includes("- after_tool | tool output [REDACTED] | 42ms | 2026-05-18T09:50:00.000Z"), "hooks perf redacts event list detail");
assert(!perf.includes("HOOK_DETAIL_SHOULD_NOT_LEAK"), "hooks perf redacts detail token body");
assert(!perf.includes("HOOK_PROMPT_SHOULD_NOT_LEAK"), "hooks perf redacts prompt token body");
assert(!perf.includes("github_pat_"), "hooks perf redacts GitHub PAT prefix");
assert(!perf.includes("ghp_"), "hooks perf redacts GitHub token prefix");

const payload = buildHooksCommandPayload({
  args: ["recent"],
  hookRunner: { recentEvents },
  readNumber: (value, keys, fallback = 0) => {
    if (!value || typeof value !== "object") return fallback;
    const record = value as Record<string, unknown>;
    const raw = record[keys[0] ?? ""];
    return typeof raw === "number" ? raw : fallback;
  },
  readString: (value, keys, fallback = "") => {
    if (!value || typeof value !== "object") return fallback;
    const record = value as Record<string, unknown>;
    const raw = record[keys[0] ?? ""];
    return raw == null ? fallback : String(raw);
  },
});
assert(!payload.isError, "hooks recent payload renders");
assert(payload.output.includes("prompt [REDACTED]"), "hooks recent payload redacts event detail");
assert(!payload.output.includes("HOOK_PROMPT_SHOULD_NOT_LEAK"), "hooks recent payload redacts token body");

const hookSummary: GatewayHookPerfSummary = {
  recentCount: 2,
  timedCount: 2,
  averageMs: 81,
  slowest: {
    kind: "before_model",
    detail: "prompt ghp_HOOK_PERF_SHOULD_NOT_LEAK12345678",
    durationMs: 120,
  },
};
const perfHooks = renderPerfHooksView(hookSummary, "/perf | /perf hooks");
assert(perfHooks.includes("Slowest hook: before_model | prompt [REDACTED] | 120ms"), "perf hooks redacts slowest hook detail");
assert(!perfHooks.includes("HOOK_PERF_SHOULD_NOT_LEAK"), "perf hooks redacts slowest hook token body");
assert(!perfHooks.includes("ghp_"), "perf hooks redacts GitHub token prefix");

console.log("Phase 359: hook event metadata redacts secret-shaped details.");
