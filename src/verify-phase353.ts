import {
  buildArtifactCommandPayload,
  buildHistoryCommandPayload,
  buildResumeCommandPayload,
  normalizeHistoryCount,
  type GatewaySessionRecord,
} from "./gateway-session";
import type { SessionHistoryExcerpt } from "./runtime/session-recovery";

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

const currentExcerpt: SessionHistoryExcerpt = {
  sessionId: "ses_current_001",
  agentId: "assist-live",
  caste: "assist_ant",
  provider: "local",
  model: "llama3",
  savedAt: "2026-05-18T08:00:00.000Z",
  lastMessageAt: "2026-05-18T08:01:00.000Z",
  totalMessages: 2,
  interruption: "none",
  hasCheckpoint: true,
  entries: [
    {
      sequence: 1,
      role: "user",
      timestamp: "2026-05-18T08:00:00.000Z",
      previewText: "Review the current slice.",
    },
    {
      sequence: 2,
      role: "assistant",
      timestamp: "2026-05-18T08:01:00.000Z",
      previewText: "Slice verified.",
    },
  ],
};

function history(args: string[]) {
  const parsed = normalizeHistoryCount(args);
  return buildHistoryCommandPayload({
    ...parsed,
    sessions,
    currentSessionId: currentExcerpt.sessionId,
    currentHistoryAliases: [],
    currentExcerpt,
    latestCurrentExcerpt: null,
    latestSessionId: "ses_review_001",
  });
}

const flagOnlyArtifact = buildArtifactCommandPayload({
  args: ["--approved"],
  sessionId: "ses_current_001",
  resolveArtifactPath: () => {
    throw new Error("flag-only artifact command should not resolve a path");
  },
});
assert(!flagOnlyArtifact.isError, "flag-only artifact command renders catalog");
assert(flagOnlyArtifact.action?.kind === "show_artifact_catalog", "flag-only artifact command opens catalog");
assert(!flagOnlyArtifact.output.includes("--approved"), "flag-only artifact command does not echo approval flag");

let resolverCalled = false;
const secretArtifact = buildArtifactCommandPayload({
  args: ["ghp_ARTIFACT_SHOULD_NOT_LEAK12345678"],
  sessionId: "ses_current_001",
  resolveArtifactPath: () => {
    resolverCalled = true;
    return { error: "resolver should not see secret-shaped artifact paths" };
  },
});
assert(secretArtifact.isError, "secret-shaped artifact path is rejected");
assert(!resolverCalled, "secret-shaped artifact path does not reach resolver");
assert(!secretArtifact.output.includes("ARTIFACT_SHOULD_NOT_LEAK"), "secret-shaped artifact path redacts token body");
assert(!secretArtifact.output.includes("ghp_"), "secret-shaped artifact path redacts token prefix");
assert(!secretArtifact.action, "secret-shaped artifact path emits no action");

const flaggedHistory = history(["latest", "--approved"]);
assert(!flaggedHistory.isError, "flagged history reference still resolves");
assert(flaggedHistory.action?.kind === "show_session_history", "flagged history reference emits history action");
assert(flaggedHistory.data?.sessionId === "ses_review_001", "flagged history reference resolves latest session");
assert(!flaggedHistory.output.includes("--approved"), "flagged history reference does not echo approval flag");

const secretHistorySearch = history(["current", "search", "github_pat_HISTORY_SHOULD_NOT_LEAK12345678"]);
assert(!secretHistorySearch.isError, "secret-shaped history search still renders current history");
assert(secretHistorySearch.output.includes("Search: [REDACTED]"), "secret-shaped history search renders redacted label");
assert(!secretHistorySearch.output.includes("HISTORY_SHOULD_NOT_LEAK"), "secret-shaped history search redacts token body");
assert(!secretHistorySearch.output.includes("github_pat_"), "secret-shaped history search redacts token prefix");
assert(secretHistorySearch.data?.search === "[REDACTED]", "secret-shaped history search stores only redacted search");

const flagOnlyResume = buildResumeCommandPayload({
  reference: "--approved",
  sessions,
  currentSessionId: "",
  currentSessionState: null,
  currentSessionHistoryCommands: [],
  latestSessionId: "ses_review_001",
});
assert(flagOnlyResume.isError, "flag-only resume reference is treated as missing");
assert(flagOnlyResume.output.includes("Usage: /resume"), "flag-only resume reference renders usage");
assert(!flagOnlyResume.output.includes("--approved"), "flag-only resume reference does not echo approval flag");
assert(!flagOnlyResume.action, "flag-only resume reference emits no action");

const secretResume = buildResumeCommandPayload({
  reference: "ghp_RESUME_SHOULD_NOT_LEAK12345678",
  sessions,
  currentSessionId: "",
  currentSessionState: null,
  currentSessionHistoryCommands: [],
  latestSessionId: "ses_review_001",
});
assert(secretResume.isError, "secret-shaped resume reference is rejected");
assert(secretResume.output.includes("[REDACTED]"), "secret-shaped resume reference renders redacted label");
assert(!secretResume.output.includes("RESUME_SHOULD_NOT_LEAK"), "secret-shaped resume reference redacts token body");
assert(!secretResume.output.includes("ghp_"), "secret-shaped resume reference redacts token prefix");
assert(!secretResume.action, "secret-shaped resume reference emits no action");

console.log("Phase 353: session detail command inputs ignore flags and redact secrets.");
