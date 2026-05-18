import { buildDaemonCommandPayload, type GatewayDaemonContext } from "./gateway-daemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const daemon: GatewayDaemonContext = {
  endpoint: "https://daemon.example.test?token=ghp_DAEMON_ENDPOINT_SHOULD_NOT_LEAK12345678",
  transport: "stdio ghp_DAEMON_TRANSPORT_SHOULD_NOT_LEAK12345678",
  startedAt: "2026-05-18T11:00:00.000Z",
  capabilities: [
    "remote-control ghp_DAEMON_CAPABILITY_SHOULD_NOT_LEAK12345678",
  ],
  auth: {
    required: true,
    tokenCount: 1,
    tokens: [
      {
        label: "operator github_pat_DAEMON_TOKEN_LABEL_SHOULD_NOT_LEAK12345678",
        scopes: [
          "sessions:read ghp_DAEMON_TOKEN_SCOPE_SHOULD_NOT_LEAK12345678",
        ],
        expiresAt: "2026-05-18T12:00:00.000Z ghp_DAEMON_TOKEN_EXPIRY_SHOULD_NOT_LEAK12345678",
      },
    ],
  },
  sessions: [
    {
      sessionId: "remote_ghp_DAEMON_SESSION_ID_SHOULD_NOT_LEAK12345678",
      agentId: "agent_github_pat_DAEMON_AGENT_ID_SHOULD_NOT_LEAK12345678",
      caste: "operator ghp_DAEMON_CASTE_SHOULD_NOT_LEAK12345678",
      tenantScope: "tenant ghp_DAEMON_TENANT_SHOULD_NOT_LEAK12345678",
      state: "active ghp_DAEMON_STATE_SHOULD_NOT_LEAK12345678",
      messageCount: 5,
    },
  ],
  lastAuthFailure: {
    code: "invalid_token ghp_DAEMON_FAILURE_CODE_SHOULD_NOT_LEAK12345678",
    requiredScope: "admin github_pat_DAEMON_REQUIRED_SCOPE_SHOULD_NOT_LEAK12345678",
    message: "Bearer ghp_DAEMON_FAILURE_MESSAGE_SHOULD_NOT_LEAK12345678 rejected",
  },
};

const overview = buildDaemonCommandPayload(["status"], daemon).output;
assert(overview.includes("Endpoint: https://daemon.example.test?token=****"), "daemon overview redacts endpoint token");
assert(overview.includes("Transport: stdio [REDACTED]"), "daemon overview redacts transport");
assert(overview.includes("Capabilities: remote-control [REDACTED]"), "daemon overview redacts capabilities");
assert(!overview.includes("DAEMON_ENDPOINT_"), "daemon overview redacts endpoint token body");
assert(!overview.includes("DAEMON_TRANSPORT_"), "daemon overview redacts transport token body");
assert(!overview.includes("DAEMON_CAPABILITY_"), "daemon overview redacts capability token body");
assert(!overview.includes("github_pat_"), "daemon overview redacts GitHub PAT prefix");
assert(!overview.includes("ghp_"), "daemon overview redacts GitHub token prefix");

const auth = buildDaemonCommandPayload(["auth"], daemon).output;
assert(auth.includes("- operator [REDACTED] | scopes sessions:read [REDACTED]"), "daemon auth redacts token label and scopes");
assert(auth.includes("expires 2026-05-18T12:00:00.000Z [REDACTED]"), "daemon auth redacts expiry metadata");
assert(auth.includes("Last auth failure: invalid_token **** | required admin [REDACTED]"), "daemon auth redacts failure code and required scope");
assert(auth.includes("Reason: Bearer **** rejected"), "daemon auth redacts failure message bearer token");
assert(!auth.includes("DAEMON_TOKEN_"), "daemon auth redacts token metadata bodies");
assert(!auth.includes("DAEMON_FAILURE_"), "daemon auth redacts failure metadata bodies");
assert(!auth.includes("github_pat_"), "daemon auth redacts GitHub PAT prefix");
assert(!auth.includes("ghp_"), "daemon auth redacts GitHub token prefix");

const sessions = buildDaemonCommandPayload(["sessions"], daemon).output;
assert(sessions.includes("remote_[REDACTED] | active [REDACTED] | operator [REDACTED] | tenant [REDACTED] | 5 messages | agent_[REDACTED]"), "daemon sessions redact session metadata");
assert(!sessions.includes("DAEMON_SESSION_"), "daemon sessions redact session token bodies");
assert(!sessions.includes("DAEMON_AGENT_"), "daemon sessions redact agent token bodies");
assert(!sessions.includes("DAEMON_CASTE_"), "daemon sessions redact caste token bodies");
assert(!sessions.includes("DAEMON_TENANT_"), "daemon sessions redact tenant token bodies");
assert(!sessions.includes("github_pat_"), "daemon sessions redact GitHub PAT prefix");
assert(!sessions.includes("ghp_"), "daemon sessions redact GitHub token prefix");

console.log("Phase 368: daemon status surfaces redact secret-shaped metadata.");
