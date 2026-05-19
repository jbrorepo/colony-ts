import { renderSessionsCatalog, type GatewaySessionRecord } from "./gateway-session";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertNoLeak(output: string, label: string): void {
  const leaked = [
    "SESSION_ID_SHOULD_NOT_LEAK",
    "SESSION_AGENT_SHOULD_NOT_LEAK",
    "SESSION_CASTE_SHOULD_NOT_LEAK",
    "SESSION_PROVIDER_SHOULD_NOT_LEAK",
    "SESSION_MODEL_SHOULD_NOT_LEAK",
    "SESSION_PREVIEW_SHOULD_NOT_LEAK",
    "SESSION_SAVED_SHOULD_NOT_LEAK",
    "SESSION_LAST_SHOULD_NOT_LEAK",
    "SESSION_CURRENT_COMMAND_SHOULD_NOT_LEAK",
    "github_pat_",
    "ghp_",
    "sk-ant-",
  ];

  for (const needle of leaked) {
    assert(!output.includes(needle), `${label} leaks ${needle}`);
  }
}

const sessions: GatewaySessionRecord[] = [
  {
    sessionId: "sess_ghp_SESSION_ID_SHOULD_NOT_LEAK12345678",
    agentId: "agent_github_pat_SESSION_AGENT_SHOULD_NOT_LEAK12345678",
    caste: "assist_ghp_SESSION_CASTE_SHOULD_NOT_LEAK12345678",
    savedAt: "2026-05-18T12:00:00Z-ghp_SESSION_SAVED_SHOULD_NOT_LEAK12345678",
    lastMessageAt: "2026-05-18T12:01:00Z-ghp_SESSION_LAST_SHOULD_NOT_LEAK12345678",
    messageCount: 2,
    tokensUsed: 1200,
    costUsd: 0.02,
    provider: "anthropic-ghp_SESSION_PROVIDER_SHOULD_NOT_LEAK12345678",
    model: "claude-sk-ant-SESSION_MODEL_SHOULD_NOT_LEAK1234567890",
    previewRole: "assistant",
    previewText: "last reply had github_pat_SESSION_PREVIEW_SHOULD_NOT_LEAK12345678",
    interruption: "interrupted_prompt",
    hasCheckpoint: true,
  },
];

const output = renderSessionsCatalog({
  sessions,
  visibleSessions: sessions,
  filters: [],
  search: "ghp_SESSION_SEARCH_SHOULD_NOT_LEAK12345678",
  limit: null,
  currentSessionId: "sess_ghp_SESSION_ID_SHOULD_NOT_LEAK12345678",
  newestInterruptedSessionId: "sess_ghp_SESSION_ID_SHOULD_NOT_LEAK12345678",
  latestSessionId: "sess_ghp_SESSION_ID_SHOULD_NOT_LEAK12345678",
  currentHistoryCommands: [
    "/history current 8",
    "/history ghp_SESSION_CURRENT_COMMAND_SHOULD_NOT_LEAK12345678 8",
  ],
});

assertNoLeak(output, "sessions catalog");
assert(output.includes("[REDACTED]"), "sessions catalog shows redaction evidence");

console.log("Phase 378: sessions catalog surfaces redact secret-shaped metadata.");
