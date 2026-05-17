/**
 * Phase 96 Verification Script - Host-Owned External Vendor Event Dispatch
 *
 * Covers the next Phase 6 channel slice:
 *   1. Host-owned dispatch composes vendor event normalization with the existing channel session bridge
 *   2. Dispatch requires an injected bridge and does not start listeners/subscriptions and makes no direct vendor API calls
 *   3. Auth/pairing and malformed vendor events fail closed without raw event text or credential leakage
 *   4. Runner/delivery outcomes remain inspectable through durable channel-session turn status
 *
 * Run: bun run src/verify-phase96.ts
 */

import {
  ChannelAuthPolicy,
  ChannelPairingStore,
  ChannelRegistry,
  ChannelSessionBridge,
  InMemoryChannelAdapter,
  dispatchExternalChannelVendorEvent,
  type ChannelSessionRequest,
} from "./channel";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function containsSensitive(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("xoxb-phase96-secret") ||
    text.includes("discord-token-phase96") ||
    text.includes("telegram-token-phase96") ||
    text.includes("private operator text") ||
    text.includes("phase96-webhook-secret") ||
    text.includes("phase96-route-secret") ||
    text.includes("Bearer phase96-bearer") ||
    text.includes("raw malformed text");
}

async function verifySlackDispatchToSessionBridge(): Promise<void> {
  section("1. Slack Event Dispatch To Session Bridge");

  const registry = new ChannelRegistry();
  const adapter = new InMemoryChannelAdapter({ channelId: "slack" });
  registry.register(adapter);
  const requests: ChannelSessionRequest[] = [];
  const bridge = new ChannelSessionBridge({
    registry,
    now: () => "2026-05-02T21:10:00.000Z",
    sessionRunner: async (request) => {
      requests.push(request);
      return { text: `reply:${request.message.messageId}` };
    },
  });
  const authPolicy = new ChannelAuthPolicy({
    channels: {
      slack: {
        webhookSecret: "phase96-webhook-secret",
        groupPolicy: "open",
      },
    },
  });

  const result = await dispatchExternalChannelVendorEvent({
    channelId: "slack",
    agentId: "agent-main",
    bridge,
    authPolicy,
    headers: { "x-channel-secret": "phase96-webhook-secret" },
    receivedAt: "2026-05-02T21:09:00.000Z",
    body: {
      type: "event_callback",
      team_id: "T123",
      token: "xoxb-phase96-secret",
      event: {
        type: "message",
        user: "U123",
        text: "private operator text",
        channel: "C123",
        ts: "171000.0096",
        thread_ts: "171000.0000",
        client_msg_id: "client-96",
      },
    },
  });

  assertEqual(result.isError, false, "Slack dispatch succeeds");
  assertEqual(result.data.action, "channels_external_event_dispatched", "Dispatch result has stable action");
  assertEqual(result.data.channelId, "slack", "Dispatch result reports channel");
  assert(typeof result.data.messageId === "string" && result.data.messageId.startsWith("msg_"), "Dispatch result reports opaque message id fingerprint");
  assertEqual(result.data.turnStatus, "replied", "Dispatch result reports bridge turn status");
  assertEqual(requests.length, 1, "Session runner receives dispatched inbound message");
  assertEqual(requests[0]?.message.text, "private operator text", "Bridge receives normalized message text internally");
  assertEqual(requests[0]?.message.authorization.code, "policy_open", "Host auth policy remains authoritative");
  assertEqual(bridge.status().routeCount, 1, "Dispatch creates one bridge route");
  assertEqual(adapter.sentMessages.length, 1, "Bridge reply is delivered through registered adapter");
  assertEqual(adapter.sentMessages[0]?.target.threadId, "171000.0000", "Slack thread id is preserved for reply routing");
  assert(!containsSensitive(result), "Dispatch result does not leak token or raw message text");
}

async function verifyAuthAndMalformedRejections(): Promise<void> {
  section("2. Auth And Malformed Event Rejections");

  const registry = new ChannelRegistry();
  registry.register(new InMemoryChannelAdapter({ channelId: "telegram" }));
  const bridge = new ChannelSessionBridge({
    registry,
    sessionRunner: async () => ({ text: "should not run" }),
  });
  const pairings = new ChannelPairingStore();
  const authPolicy = new ChannelAuthPolicy({
    channels: {
      telegram: {
        webhookSecret: "phase96-webhook-secret",
        dmPolicy: "pairing",
        groupPolicy: "allowlist",
        allowFrom: [],
      },
    },
  });

  const missingWebhookSecret = await dispatchExternalChannelVendorEvent({
    channelId: "telegram",
    agentId: "agent-main",
    bridge,
    authPolicy,
    pairings,
    sourceUrl: "https://colony.local.invalid/api/channels/telegram/webhook",
    body: {
      token: "telegram-token-phase96",
      message: {
        message_id: 96,
        text: "private operator text",
        from: { id: 42, username: "ada" },
        chat: { id: 42, type: "private" },
      },
    },
  });
  assertEqual(missingWebhookSecret.isError, true, "Missing host webhook credential fails closed");
  assertEqual(missingWebhookSecret.data.reasonCode, "webhook_auth_failed", "Webhook auth failure preserves stable code");
  assertEqual(bridge.status().routeCount, 0, "Webhook auth failure does not dispatch to bridge");
  assert(!containsSensitive(missingWebhookSecret), "Webhook auth rejection redacts secrets and text");

  const withWebhookButUnpaired = await dispatchExternalChannelVendorEvent({
    channelId: "telegram",
    agentId: "agent-main",
    bridge,
    authPolicy,
    pairings,
    sourceUrl: "https://colony.local.invalid/api/channels/telegram/webhook",
    headers: { "x-channel-secret": "phase96-webhook-secret" },
    body: {
      token: "telegram-token-phase96",
      message: {
        message_id: 97,
        text: "private operator text",
        from: { id: 42, username: "ada" },
        chat: { id: 42, type: "private" },
      },
    },
  });
  assertEqual(withWebhookButUnpaired.isError, true, "Unpaired inbound sender fails closed");
  assertEqual(withWebhookButUnpaired.data.reasonCode, "pairing_required", "Pairing failure preserves stable code");
  assertEqual(bridge.status().routeCount, 0, "Pairing failure does not dispatch to bridge");
  assert(!containsSensitive(withWebhookButUnpaired), "Pairing rejection redacts secrets and text");

  const malformed = await dispatchExternalChannelVendorEvent({
    channelId: "slack",
    bridge,
    authPolicy: new ChannelAuthPolicy({
      channels: {
        slack: {
          webhookSecret: "phase96-webhook-secret",
          groupPolicy: "open",
        },
      },
    }),
    headers: { "x-channel-secret": "phase96-webhook-secret" },
    body: {
      type: "url_verification",
      token: "xoxb-phase96-secret",
      text: "raw malformed text",
    },
  });
  assertEqual(malformed.isError, true, "Unsupported vendor event fails closed");
  assertEqual(malformed.data.reasonCode, "unsupported_vendor_event", "Malformed dispatch reports normalization code");
  assert(!containsSensitive(malformed), "Malformed dispatch rejection redacts raw vendor body");
}

async function verifyDiscordRunnerFailureInspection(): Promise<void> {
  section("3. Discord Runner Failure Inspection");

  const requests: ChannelSessionRequest[] = [];
  const bridge = new ChannelSessionBridge({
    registry: new ChannelRegistry(),
    sessionRunner: async (request) => {
      requests.push(request);
      throw new Error("model unavailable with discord-token-phase96");
    },
  });
  const authPolicy = new ChannelAuthPolicy({
    channels: {
      discord: {
        webhookSecret: "phase96-webhook-secret",
        groupPolicy: "open",
      },
    },
  });

  const result = await dispatchExternalChannelVendorEvent({
    channelId: "discord",
    agentId: "agent-main",
    bridge,
    authPolicy,
    headers: { "x-channel-secret": "phase96-webhook-secret" },
    body: {
      id: "m96",
      type: 0,
      channel_id: "c96",
      guild_id: "g96",
      thread_id: "thread-96",
      content: "private operator text",
      token: "discord-token-phase96",
      author: { id: "u96", username: "Ada" },
    },
  });

  assertEqual(result.isError, false, "Runner failure is an accepted dispatched turn");
  assertEqual(result.data.turnStatus, "runner_failed", "Dispatch result reports runner failure status");
  assertEqual(requests[0]?.message.target.threadId, "thread-96", "Discord thread id is preserved for session routing");
  assertEqual(bridge.status().failedTurnCount, 1, "Bridge status records failed turn");
  assert(!containsSensitive(result), "Runner failure dispatch result redacts event token and text");
}

async function verifyTelegramTopicDispatch(): Promise<void> {
  section("4. Telegram Topic Dispatch");

  const registry = new ChannelRegistry();
  const adapter = new InMemoryChannelAdapter({ channelId: "telegram" });
  registry.register(adapter);
  const bridge = new ChannelSessionBridge({
    registry,
    sessionRunner: async (request) => ({ text: `topic:${request.message.messageId}` }),
  });
  const authPolicy = new ChannelAuthPolicy({
    channels: {
      telegram: {
        webhookSecret: "phase96-webhook-secret",
        groupPolicy: "open",
      },
    },
  });

  const result = await dispatchExternalChannelVendorEvent({
    channelId: "telegram",
    agentId: "agent-main",
    bridge,
    authPolicy,
    headers: { "x-channel-secret": "phase96-webhook-secret" },
    body: {
      token: "telegram-token-phase96",
      message: {
        message_id: 98,
        message_thread_id: 1234,
        text: "private operator text",
        from: { id: 42, username: "ada" },
        chat: { id: -100, type: "supergroup" },
      },
    },
  });

  assertEqual(result.isError, false, "Telegram topic dispatch succeeds");
  assertEqual(result.data.turnStatus, "replied", "Telegram dispatch reports bridge turn status");
  assertEqual(adapter.sentMessages.length, 1, "Telegram topic dispatch sends one reply");
  assertEqual(adapter.sentMessages[0]?.target.topicId, "1234", "Telegram topic id is preserved for reply routing");
  assert(!containsSensitive(result), "Telegram topic dispatch redacts event token and text");
}

async function verifyMissingHostInputsFailClosed(): Promise<void> {
  section("5. Missing Host Inputs Fail Closed");

  const result = await dispatchExternalChannelVendorEvent({
    channelId: "slack",
    body: {
      type: "event_callback",
      token: "xoxb-phase96-secret",
      event: {
        type: "message",
        user: "U123",
        text: "private operator text",
        channel: "C123",
        ts: "171000.0097",
      },
    },
  });

  assertEqual(result.isError, true, "Missing host bridge fails closed");
  assertEqual(result.data.reasonCode, "missing_bridge", "Missing bridge has stable reason code");
  assert(!containsSensitive(result), "Missing bridge rejection redacts token and text");

  const bridge = new ChannelSessionBridge({
    registry: new ChannelRegistry(),
    sessionRunner: async () => ({ text: "should not run" }),
  });
  const missingAuth = await dispatchExternalChannelVendorEvent({
    channelId: "slack",
    bridge,
    body: {
      type: "event_callback",
      token: "xoxb-phase96-secret",
      event: {
        type: "message",
        user: "U123",
        text: "private operator text",
        channel: "C123",
        ts: "171000.0098",
      },
    },
  });

  assertEqual(missingAuth.isError, true, "Missing host auth policy fails closed");
  assertEqual(missingAuth.data.reasonCode, "missing_host_auth_policy", "Missing host auth policy has stable reason code");
  assertEqual(bridge.status().routeCount, 0, "Missing host auth policy does not dispatch to bridge");
  assert(!containsSensitive(missingAuth), "Missing host auth policy rejection redacts token and text");

  const openPolicy = new ChannelAuthPolicy({
    channels: {
      slack: {
        groupPolicy: "open",
      },
    },
  });
  const missingVerificationProof = await dispatchExternalChannelVendorEvent({
    channelId: "slack",
    bridge,
    authPolicy: openPolicy,
    body: {
      type: "event_callback",
      token: "xoxb-phase96-secret",
      event: {
        type: "message",
        user: "U123",
        text: "private operator text",
        channel: "C123",
        ts: "171000.0099",
      },
    },
  });

  assertEqual(missingVerificationProof.isError, true, "Open policy without host proof fails closed");
  assertEqual(missingVerificationProof.data.reasonCode, "missing_host_verification_proof", "Missing host proof has stable reason code");
  assertEqual(bridge.status().routeCount, 0, "Missing host proof does not dispatch to bridge");
  assert(!containsSensitive(missingVerificationProof), "Missing host proof rejection redacts token and text");
}

async function verifySuccessIdentifierRedaction(): Promise<void> {
  section("6. Success Identifier Redaction");

  const bridge = new ChannelSessionBridge({
    registry: new ChannelRegistry(),
    sessionRunner: async () => ({ text: "ok" }),
  });
  const authPolicy = new ChannelAuthPolicy({
    channels: {
      slack: {
        webhookSecret: "phase96-webhook-secret",
        groupPolicy: "open",
      },
    },
  });

  const result = await dispatchExternalChannelVendorEvent({
    channelId: "slack",
    bridge,
    authPolicy,
    headers: { "x-channel-secret": "phase96-webhook-secret" },
    body: {
      type: "event_callback",
      token: "xoxb-phase96-secret",
      event: {
        type: "message",
        user: "U123",
        text: "private operator text",
        channel: "C123?token=phase96-route-secret",
        ts: "171000.0100",
        client_msg_id: "xoxb-phase96-secret",
      },
    },
  });

  assertEqual(result.isError, false, "Sensitive-looking identifier dispatch still succeeds internally");
  assert(typeof result.data.messageId === "string" && result.data.messageId.startsWith("msg_"), "Sensitive-looking message id is represented as an opaque fingerprint");
  assert(typeof result.data.routeKey === "string" && result.data.routeKey.startsWith("route_"), "Route key is represented as an opaque fingerprint");
  assert(!containsSensitive(result), "Success result redacts sensitive-looking vendor identifiers");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 96 Verification (Host-Owned External Event Dispatch)\n");

  await verifySlackDispatchToSessionBridge();
  await verifyAuthAndMalformedRejections();
  await verifyDiscordRunnerFailureInspection();
  await verifyTelegramTopicDispatch();
  await verifyMissingHostInputsFailClosed();
  await verifySuccessIdentifierRedaction();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 96: host-owned external vendor event dispatch is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
