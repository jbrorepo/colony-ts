import {
  renderStatusSavedSection,
  renderStatusSessionSection,
  renderStatusViewOutput,
} from "./gateway-runtime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const sessionLines = renderStatusSessionSection({
  hasSession: true,
  sessionId: "sess_ghp_SESSION_ID_SHOULD_NOT_LEAK12345678",
  agentId: "agent_github_pat_SESSION_AGENT_SHOULD_NOT_LEAK12345678",
  caste: "operator ghp_SESSION_CASTE_SHOULD_NOT_LEAK12345678",
  messageCount: 4,
  startedAt: "2026-05-18T10:45:00.000Z",
  latestMessageAt: "2026-05-18T10:46:00.000Z",
  currentState: "active ghp_SESSION_STATE_SHOULD_NOT_LEAK12345678",
  latestPreview: "Latest says Bearer ghp_SESSION_PREVIEW_SHOULD_NOT_LEAK12345678",
});
const sessionOutput = sessionLines.join("\n");
assert(sessionOutput.includes("Session ID: sess_[REDACTED]"), "session status redacts session id");
assert(sessionOutput.includes("Agent: agent_[REDACTED]"), "session status redacts agent id");
assert(sessionOutput.includes("Caste: operator [REDACTED]"), "session status redacts caste label");
assert(sessionOutput.includes("Current state: active [REDACTED]"), "session status redacts current state");
assert(sessionOutput.includes("Latest live preview: Latest says Bearer ****"), "session status redacts latest preview");
assert(!sessionOutput.includes("SESSION_"), "session status redacts token bodies");
assert(!sessionOutput.includes("github_pat_"), "session status redacts GitHub PAT prefix");
assert(!sessionOutput.includes("ghp_"), "session status redacts GitHub token prefix");

const savedLines = renderStatusSavedSection({
  hasSavedSessions: true,
  count: 2,
  interruptedCount: 1,
  checkpointCount: 1,
  latest: {
    sessionId: "latest_ghp_SAVED_LATEST_ID_SHOULD_NOT_LEAK12345678",
    identity: "identity ghp_SAVED_LATEST_IDENTITY_SHOULD_NOT_LEAK12345678",
    savedAt: "2026-05-18T10:47:00.000Z",
    lastMessageAt: "2026-05-18T10:48:00.000Z",
    state: "idle github_pat_SAVED_LATEST_STATE_SHOULD_NOT_LEAK12345678",
    usage: "usage ghp_SAVED_LATEST_USAGE_SHOULD_NOT_LEAK12345678",
    llm: "openai ghp_SAVED_LATEST_LLM_SHOULD_NOT_LEAK12345678",
    preview: "Preview ghp_SAVED_LATEST_PREVIEW_SHOULD_NOT_LEAK12345678",
    actionLine: "Action ghp_SAVED_LATEST_ACTION_SHOULD_NOT_LEAK12345678",
    isCurrent: true,
  },
  pending: {
    sessionId: "pending_ghp_SAVED_PENDING_ID_SHOULD_NOT_LEAK12345678",
    identity: "pending identity ghp_SAVED_PENDING_IDENTITY_SHOULD_NOT_LEAK12345678",
    savedAt: "2026-05-18T10:49:00.000Z",
    lastMessageAt: "2026-05-18T10:50:00.000Z",
    state: "interrupted ghp_SAVED_PENDING_STATE_SHOULD_NOT_LEAK12345678",
    usage: "usage github_pat_SAVED_PENDING_USAGE_SHOULD_NOT_LEAK12345678",
    llm: "anthropic ghp_SAVED_PENDING_LLM_SHOULD_NOT_LEAK12345678",
    preview: "Pending preview ghp_SAVED_PENDING_PREVIEW_SHOULD_NOT_LEAK12345678",
    recoverLine: "Recover ghp_SAVED_PENDING_RECOVER_SHOULD_NOT_LEAK12345678",
    inspectLine: "Inspect ghp_SAVED_PENDING_INSPECT_SHOULD_NOT_LEAK12345678",
  },
  inspectLine: "Inspect all ghp_SAVED_INSPECT_SHOULD_NOT_LEAK12345678",
});
const savedOutput = savedLines.join("\n");
assert(savedOutput.includes("Latest: latest_[REDACTED] (current)"), "saved status redacts latest session id");
assert(savedOutput.includes("Latest identity: identity [REDACTED]"), "saved status redacts latest identity");
assert(savedOutput.includes("Latest state: idle [REDACTED]"), "saved status redacts latest state");
assert(savedOutput.includes("Latest usage: usage [REDACTED]"), "saved status redacts latest usage");
assert(savedOutput.includes("Latest llm: openai [REDACTED]"), "saved status redacts latest llm");
assert(savedOutput.includes("Latest preview: Preview [REDACTED]"), "saved status redacts latest preview");
assert(savedOutput.includes("Action [REDACTED]"), "saved status redacts latest action line");
assert(savedOutput.includes("Pending target: pending_[REDACTED]"), "saved status redacts pending session id");
assert(savedOutput.includes("Pending identity: pending identity [REDACTED]"), "saved status redacts pending identity");
assert(savedOutput.includes("Pending usage: usage [REDACTED]"), "saved status redacts pending usage");
assert(savedOutput.includes("Pending llm: anthropic [REDACTED]"), "saved status redacts pending llm");
assert(savedOutput.includes("Recover [REDACTED]"), "saved status redacts pending recover line");
assert(savedOutput.includes("Inspect all [REDACTED]"), "saved status redacts inspect line");
assert(!savedOutput.includes("SAVED_"), "saved status redacts token bodies");
assert(!savedOutput.includes("github_pat_"), "saved status redacts GitHub PAT prefix");
assert(!savedOutput.includes("ghp_"), "saved status redacts GitHub token prefix");

const combined = renderStatusViewOutput({
  view: "summary",
  sessionLines: ["Session custom ghp_COMBINED_SESSION_SHOULD_NOT_LEAK12345678"],
  savedLines: ["Saved custom github_pat_COMBINED_SAVED_SHOULD_NOT_LEAK12345678"],
  runtimeLines: ["Runtime custom ghp_COMBINED_RUNTIME_SHOULD_NOT_LEAK12345678"],
});
assert(combined.includes("Session custom [REDACTED]"), "combined status output redacts custom session lines");
assert(combined.includes("Saved custom [REDACTED]"), "combined status output redacts custom saved lines");
assert(combined.includes("Runtime custom [REDACTED]"), "combined status output redacts custom runtime lines");
assert(!combined.includes("COMBINED_"), "combined status output redacts token bodies");
assert(!combined.includes("github_pat_"), "combined status output redacts GitHub PAT prefix");
assert(!combined.includes("ghp_"), "combined status output redacts GitHub token prefix");

console.log("Phase 366: session and saved status surfaces redact secret-shaped metadata.");
