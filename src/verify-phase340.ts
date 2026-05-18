import { buildSessionsCommandPayload, type GatewaySessionRecord } from "./gateway-session";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const sessions: GatewaySessionRecord[] = [
  {
    sessionId: "ses_review_001",
    agentId: "assist-1",
    caste: "assist_ant",
    savedAt: "2026-05-18T07:00:00.000Z",
    lastMessageAt: "2026-05-18T07:01:00.000Z",
    messageCount: 4,
    tokensUsed: 1200,
    costUsd: 0.02,
    provider: "local",
    model: "llama3",
    previewRole: "assistant",
    previewText: "Review plan ready.",
    interruption: "none",
    hasCheckpoint: true,
  },
];

function renderSessions(args: string[]) {
  return buildSessionsCommandPayload({
    args,
    sessions,
    currentSessionId: "",
    currentPendingState: null,
    currentHistoryCommands: [],
    latestSessionId: "ses_review_001",
  });
}

const flagOnly = renderSessions(["--approved"]);
assert(!flagOnly.isError, "flag-only sessions view renders catalog");
assert(flagOnly.output.includes("Persisted Sessions:"), "flag-only sessions view renders catalog heading");
assert(flagOnly.output.includes("ses_review_001"), "flag-only sessions view includes session");
assert(!flagOnly.output.includes("--approved"), "flag-only sessions view does not echo stray flag");
assert(flagOnly.data?.query === null, "flag-only sessions view stores no query");

const secretSearch = renderSessions(["ghp_SESSION_SHOULD_NOT_LEAK12345678"]);
assert(secretSearch.output.includes("No persisted sessions match '[REDACTED]'"), "secret-shaped sessions search redacts miss label");
assert(!secretSearch.output.includes("SESSION_SHOULD_NOT_LEAK"), "secret-shaped sessions search redacts token body");
assert(!secretSearch.output.includes("ghp_"), "secret-shaped sessions search redacts token prefix");
assert(secretSearch.data?.query === "[REDACTED]", "secret-shaped sessions search stores only redacted query");

const validSearch = renderSessions(["assist"]);
assert(!validSearch.isError, "valid sessions search succeeds");
assert(validSearch.output.includes("Search: assist"), "valid sessions search renders search label");
assert(validSearch.output.includes("ses_review_001"), "valid sessions search returns matching session");
assert(validSearch.data?.query === "assist", "valid sessions search stores normalized query");

console.log("Phase 340: session catalog searches ignore flags and redact secrets.");
