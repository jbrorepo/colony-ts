import { buildChannelsCommandPayload, type GatewayChannelsContext } from "./gateway-channels";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertRedacted(output: string, label: string): void {
  assert(!output.includes("CHANNEL_"), `${label} redacts token metadata bodies`);
  assert(!output.includes("github_pat_"), `${label} redacts GitHub PAT prefix`);
  assert(!output.includes("ghp_"), `${label} redacts GitHub token prefix`);
}

const channels: GatewayChannelsContext = {
  status: {
    channels: [
      {
        channelId: "slack ghp_CHANNEL_STATUS_ID_SHOULD_NOT_LEAK12345678",
        displayName: "Slack github_pat_CHANNEL_STATUS_NAME_SHOULD_NOT_LEAK12345678",
        enabled: true,
        connected: true,
        capabilities: [
          "dm ghp_CHANNEL_STATUS_CAPABILITY_SHOULD_NOT_LEAK12345678",
        ],
        sentCount: 2,
      },
    ],
    enabledCount: 1,
    connectedCount: 1,
    deliveryCount: 1,
  },
  recentDeliveries: [
    {
      deliveryId: "delivery_ghp_CHANNEL_DELIVERY_ID_SHOULD_NOT_LEAK12345678",
      status: "failed",
      channel: "slack ghp_CHANNEL_DELIVERY_CHANNEL_SHOULD_NOT_LEAK12345678",
      routeKey: "route_ghp_CHANNEL_DELIVERY_ROUTE_SHOULD_NOT_LEAK12345678",
      textLength: 42,
      createdAt: "2026-05-18T11:05:00.000Z",
      deliveredAt: "2026-05-18T11:06:00.000Z ghp_CHANNEL_DELIVERY_TIME_SHOULD_NOT_LEAK12345678",
      error: "Bearer ghp_CHANNEL_DELIVERY_ERROR_SHOULD_NOT_LEAK12345678 failed",
      target: {
        agentId: "agent",
        channel: "slack",
        targetKind: "direct",
        targetId: "U1",
      },
    },
  ],
  auth: {
    channels: [
      {
        channelId: "slack ghp_CHANNEL_AUTH_ID_SHOULD_NOT_LEAK12345678",
        webhookAuthRequired: true,
        dmPolicy: "pairing",
        groupPolicy: "allowlist",
        allowFromCount: 1,
      },
    ],
  },
  pairings: {
    approvedCount: 1,
    pendingCount: 1,
    approved: [
      {
        channel: "slack ghp_CHANNEL_PAIR_APPROVED_CHANNEL_SHOULD_NOT_LEAK12345678",
        senderId: "sender_ghp_CHANNEL_PAIR_APPROVED_SENDER_SHOULD_NOT_LEAK12345678",
        approvedBy: "operator github_pat_CHANNEL_PAIR_APPROVED_BY_SHOULD_NOT_LEAK12345678",
        approvedAt: "2026-05-18T11:07:00.000Z ghp_CHANNEL_PAIR_APPROVED_TIME_SHOULD_NOT_LEAK12345678",
      },
    ],
    pending: [
      {
        channel: "discord ghp_CHANNEL_PAIR_PENDING_CHANNEL_SHOULD_NOT_LEAK12345678",
        senderId: "sender_ghp_CHANNEL_PAIR_PENDING_SENDER_SHOULD_NOT_LEAK12345678",
        requestedBy: "operator ghp_CHANNEL_PAIR_PENDING_BY_SHOULD_NOT_LEAK12345678",
        expiresAt: "2026-05-18T11:08:00.000Z ghp_CHANNEL_PAIR_PENDING_EXPIRY_SHOULD_NOT_LEAK12345678",
      },
    ],
  },
  sessions: {
    routeCount: 1,
    replyDeliveryCount: 1,
    failedTurnCount: 1,
    routes: [
      {
        routeKey: "route_ghp_CHANNEL_SESSION_ROUTE_SHOULD_NOT_LEAK12345678",
        sessionId: "session_ghp_CHANNEL_SESSION_ID_SHOULD_NOT_LEAK12345678",
        channel: "slack ghp_CHANNEL_SESSION_CHANNEL_SHOULD_NOT_LEAK12345678",
        target: {
          agentId: "agent",
          channel: "slack",
          targetKind: "direct",
          targetId: "U1",
        },
        createdAt: "2026-05-18T11:00:00.000Z",
        updatedAt: "2026-05-18T11:09:00.000Z ghp_CHANNEL_SESSION_UPDATED_SHOULD_NOT_LEAK12345678",
        messageCount: 3,
        lastReplyDeliveryId: "reply_ghp_CHANNEL_SESSION_REPLY_SHOULD_NOT_LEAK12345678",
        lastError: "Bearer ghp_CHANNEL_SESSION_ERROR_SHOULD_NOT_LEAK12345678",
      },
    ],
    recentTurns: [
      {
        turnId: "turn_ghp_CHANNEL_TURN_ID_SHOULD_NOT_LEAK12345678",
        status: "runner_failed",
        routeKey: "route",
        sessionId: "session_ghp_CHANNEL_TURN_SESSION_SHOULD_NOT_LEAK12345678",
        createdSession: false,
        inboundMessageId: "inbound_ghp_CHANNEL_TURN_INBOUND_SHOULD_NOT_LEAK12345678",
        receivedAt: "2026-05-18T11:10:00.000Z",
        error: "github_pat_CHANNEL_TURN_ERROR_SHOULD_NOT_LEAK12345678",
        replyDelivery: {
          deliveryId: "reply_ghp_CHANNEL_TURN_REPLY_SHOULD_NOT_LEAK12345678",
          status: "failed",
          channel: "slack",
          routeKey: "route",
          textLength: 1,
          createdAt: "2026-05-18T11:10:00.000Z",
          target: {
            agentId: "agent",
            channel: "slack",
            targetKind: "direct",
            targetId: "U1",
          },
        },
      },
    ],
  },
};

const overview = buildChannelsCommandPayload(["status"], channels).output;
assert(overview.includes("- slack [REDACTED] (Slack [REDACTED])"), "channels overview redacts channel id and display name");
assert(overview.includes("capabilities dm [REDACTED]"), "channels overview redacts capability metadata");
assertRedacted(overview, "channels overview");

const deliveries = buildChannelsCommandPayload(["deliveries"], channels).output;
assert(deliveries.includes("delivery_[REDACTED] | failed | slack [REDACTED] | route_[REDACTED]"), "channel deliveries redact delivery routing metadata");
assert(deliveries.includes("delivered 2026-05-18T11:06:00.000Z [REDACTED]"), "channel deliveries redact delivered metadata");
assert(deliveries.includes("error Bearer **** failed"), "channel deliveries redact error token");
assertRedacted(deliveries, "channel deliveries");

const auth = buildChannelsCommandPayload(["auth"], channels).output;
assert(auth.includes("- slack [REDACTED] | webhook auth: required"), "channel auth redacts auth channel id");
assert(auth.includes("- slack [REDACTED] | sender_[REDACTED] | approved by operator [REDACTED] at 2026-05-18T11:07:00.000Z [REDACTED]"), "channel auth redacts approved pairing metadata");
assert(auth.includes("- discord [REDACTED] | sender_[REDACTED] | requested by operator [REDACTED] | expires 2026-05-18T11:08:00.000Z [REDACTED]"), "channel auth redacts pending pairing metadata");
assertRedacted(auth, "channel auth");

const sessions = buildChannelsCommandPayload(["sessions"], channels).output;
assert(sessions.includes("- session_[REDACTED] | slack [REDACTED] | route_[REDACTED]"), "channel sessions redact route metadata");
assert(sessions.includes("last reply reply_[REDACTED] | last error Bearer ****"), "channel sessions redact route reply and error metadata");
assert(sessions.includes("- turn_[REDACTED] | runner_failed | session_[REDACTED] | inbound inbound_[REDACTED] | delivery reply_[REDACTED]:failed | error [REDACTED]"), "channel sessions redact turn metadata");
assertRedacted(sessions, "channel sessions");

console.log("Phase 369: channel status surfaces redact secret-shaped metadata.");
