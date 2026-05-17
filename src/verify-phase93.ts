/**
 * Phase 93 Verification Script - External Channel Operator UX and Vendor Event Normalization
 *
 * Covers the next Phase 6 channel slice:
 *   1. `/channels external` exposes read-only external adapter registration plan truth
 *   2. External adapter approval/config diagnostics remain redacted in operator output
 *   3. Slack/Discord/Telegram vendor events normalize into the generic inbound channel body shape
 *   4. Unsupported or malformed vendor events fail closed without leaking credentials
 *
 * Run: bun run src/verify-phase93.ts
 */

import {
  createExternalChannelAdapterApprovalSignature,
  normalizeExternalChannelVendorEvent,
  planExternalChannelAdapterRegistrations,
  type ExternalChannelAdapterRegistrationCandidate,
} from "./channel";
import { buildChannelsCommandPayload } from "./gateway-channels";
import { parseCommand, SlashCommandParser } from "./gateway";

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

async function verifyChannelsExternalOperatorView(): Promise<void> {
  section("1. /channels external Operator View");

  const candidate: ExternalChannelAdapterRegistrationCandidate = {
    channelId: "slack",
    botToken: "xoxb-phase93-secret",
    enabled: true,
    workspaceId: "T123",
  };
  const approvedSignature = await createExternalChannelAdapterApprovalSignature(candidate);
  const plans = await planExternalChannelAdapterRegistrations([
    candidate,
    {
      ...candidate,
      approval: {
        approvedBy: "operator",
        approvedAt: "2026-05-02T12:00:00.000Z",
        signature: approvedSignature,
      },
    },
  ]);

  const parsed = parseCommand("/channels external");
  assertEqual(parsed.type, "channels", "parseCommand recognizes /channels external");
  assertEqual(parsed.args[0], "external", "parseCommand preserves external view arg");

  const payload = buildChannelsCommandPayload(["external"], { externalAdapters: plans });
  assertEqual(payload.isError, undefined, "/channels external is not a usage error");
  assert(payload.output.includes("External Channel Adapter Gates:"), "/channels external renders external gate header");
  assert(payload.output.includes("Read-only"), "/channels external states read-only behavior");
  assert(payload.output.includes("slack"), "/channels external lists Slack candidate");
  assert(payload.output.includes("approval required"), "/channels external shows pending approval state");
  assert(payload.output.includes("approval accepted"), "/channels external shows accepted approval state");
  assert(payload.output.includes("[REDACTED]"), "/channels external renders redacted config values");
  assert(!payload.output.includes("xoxb-phase93-secret"), "/channels external does not leak bot tokens");
  assert(!payload.output.includes(approvedSignature), "/channels external does not print exact approval signature");
  assertEqual(payload.data?.action, "channels_external", "/channels external reports stable action data");

  const parser = new SlashCommandParser({ channels: { externalAdapters: plans } });
  const result = parser.tryHandle("/channels external");
  assertEqual(result.handled, true, "/channels external command resolves through parser");
  assertEqual(result.isError, false, "/channels external parser result is not a usage error");
  assert(result.output.includes("External Channel Adapter Gates:"), "/channels external parser output renders gate header");

  const overview = parser.tryHandle("/channels");
  assert(overview.output.includes("/channels external"), "/channels overview teaches external view");

  const usage = buildChannelsCommandPayload(["unknown"], { externalAdapters: plans });
  assertEqual(usage.isError, true, "/channels usage rejects unknown external view");
  assert(usage.output.includes("external"), "/channels usage lists external view");
}

function verifySlackVendorEventNormalization(): void {
  section("2. Slack Vendor Event Normalization");

  const normalized = normalizeExternalChannelVendorEvent({
    channelId: "slack",
    receivedAt: "2026-05-02T12:00:00.000Z",
    body: {
      type: "event_callback",
      team_id: "T123",
      token: "slack-secret-token",
      event: {
        type: "message",
        user: "U123",
        text: "hello slack",
        channel: "C123",
        ts: "171000.0001",
        thread_ts: "171000.0000",
        client_msg_id: "client-1",
      },
    },
  });
  assertEqual(normalized.accepted, true, "Slack message event normalizes");
  assertEqual(normalized.body?.messageId, "client-1", "Slack message id prefers client_msg_id");
  assertEqual(normalized.body?.senderId, "U123", "Slack sender id normalizes");
  assertEqual(normalized.body?.text, "hello slack", "Slack text normalizes");
  assertEqual(normalized.body?.targetKind, "channel", "Slack channel target kind normalizes");
  assertEqual(normalized.body?.targetId, "C123", "Slack target id normalizes");
  assertEqual(normalized.body?.threadId, "171000.0000", "Slack thread id normalizes when distinct from ts");
  assertEqual(normalized.body?.metadata?.vendor, "slack", "Slack metadata records vendor");
  assert(!JSON.stringify(normalized).includes("slack-secret-token"), "Slack normalization redacts incoming token fields");

  const rejectedSubtype = normalizeExternalChannelVendorEvent({
    channelId: "slack",
    body: {
      type: "event_callback",
      event: {
        type: "message",
        subtype: "bot_message",
        user: "B123",
        text: "bot spam",
        channel: "C123",
        ts: "171000.0002",
      },
    },
  });
  assertEqual(rejectedSubtype.accepted, false, "Slack bot/system message subtype is rejected");
  assertEqual(rejectedSubtype.errorCode, "unsupported_vendor_event", "Slack subtype rejection has stable error code");
}

function verifyDiscordVendorEventNormalization(): void {
  section("3. Discord Vendor Event Normalization");

  const normalized = normalizeExternalChannelVendorEvent({
    channelId: "discord",
    body: {
      id: "m1",
      type: 0,
      channel_id: "c1",
      guild_id: "g1",
      content: "hello discord",
      token: "discord-token",
      author: {
        id: "u1",
        username: "Ada",
      },
    },
  });
  assertEqual(normalized.accepted, true, "Discord message create event normalizes");
  assertEqual(normalized.body?.messageId, "m1", "Discord message id normalizes");
  assertEqual(normalized.body?.senderId, "u1", "Discord sender id normalizes");
  assertEqual(normalized.body?.senderName, "Ada", "Discord sender name normalizes");
  assertEqual(normalized.body?.text, "hello discord", "Discord content normalizes");
  assertEqual(normalized.body?.targetKind, "channel", "Discord target kind normalizes");
  assertEqual(normalized.body?.targetId, "c1", "Discord target id normalizes to channel id");
  assertEqual(normalized.body?.accountId, "g1", "Discord guild id normalizes to account id");
  assertEqual(normalized.body?.metadata?.vendor, "discord", "Discord metadata records vendor");
  assert(!JSON.stringify(normalized).includes("discord-token"), "Discord normalization redacts incoming token fields");

  const missingContent = normalizeExternalChannelVendorEvent({
    channelId: "discord",
    body: {
      id: "m2",
      channel_id: "c1",
      author: { id: "u1" },
    },
  });
  assertEqual(missingContent.accepted, false, "Discord missing content is rejected");
  assertEqual(missingContent.errorCode, "malformed_vendor_event", "Discord malformed rejection has stable error code");

  const missingType = normalizeExternalChannelVendorEvent({
    channelId: "discord",
    body: {
      id: "m6",
      channel_id: "c1",
      content: "missing type",
      author: { id: "u1" },
    },
  });
  assertEqual(missingType.accepted, false, "Discord missing message type is rejected");
  assertEqual(missingType.errorCode, "malformed_vendor_event", "Discord missing message type has stable error code");

  const stringType = normalizeExternalChannelVendorEvent({
    channelId: "discord",
    body: {
      id: "m7",
      type: "0",
      channel_id: "c1",
      content: "string type",
      author: { id: "u1" },
    },
  });
  assertEqual(stringType.accepted, false, "Discord string message type is rejected");

  const botMessage = normalizeExternalChannelVendorEvent({
    channelId: "discord",
    body: {
      id: "m3",
      type: 0,
      channel_id: "c1",
      content: "bot echo",
      author: { id: "b1", bot: true },
    },
  });
  assertEqual(botMessage.accepted, false, "Discord bot-authored messages are rejected");
  assertEqual(botMessage.errorCode, "unsupported_vendor_event", "Discord bot rejection has stable error code");

  const systemMessage = normalizeExternalChannelVendorEvent({
    channelId: "discord",
    body: {
      id: "m4",
      type: 7,
      channel_id: "c1",
      content: "member joined",
      author: { id: "u1" },
    },
  });
  assertEqual(systemMessage.accepted, false, "Discord non-default message types are rejected");

  const webhookMessage = normalizeExternalChannelVendorEvent({
    channelId: "discord",
    body: {
      id: "m5",
      type: 0,
      channel_id: "c1",
      webhook_id: "wh1",
      content: "webhook text",
      author: { id: "u1" },
    },
  });
  assertEqual(webhookMessage.accepted, false, "Discord webhook-origin messages are rejected");
}

function verifyTelegramVendorEventNormalization(): void {
  section("4. Telegram Vendor Event Normalization");

  const normalized = normalizeExternalChannelVendorEvent({
    channelId: "telegram",
    body: {
      update_id: 123,
      token: "telegram-token",
      message: {
        message_id: 55,
        text: "hello telegram",
        message_thread_id: 7,
        from: {
          id: 42,
          username: "ada",
        },
        chat: {
          id: -100123,
          type: "supergroup",
        },
      },
    },
  });
  assertEqual(normalized.accepted, true, "Telegram message update normalizes");
  assertEqual(normalized.body?.messageId, "55", "Telegram message id normalizes to string");
  assertEqual(normalized.body?.senderId, "42", "Telegram sender id normalizes to string");
  assertEqual(normalized.body?.senderName, "ada", "Telegram sender username normalizes");
  assertEqual(normalized.body?.text, "hello telegram", "Telegram text normalizes");
  assertEqual(normalized.body?.targetKind, "group", "Telegram supergroup target kind normalizes");
  assertEqual(normalized.body?.targetId, "-100123", "Telegram chat id normalizes to string");
  assertEqual(normalized.body?.topicId, "7", "Telegram message thread id normalizes to topic id");
  assertEqual(normalized.body?.metadata?.vendor, "telegram", "Telegram metadata records vendor");
  assert(!JSON.stringify(normalized).includes("telegram-token"), "Telegram normalization redacts incoming token fields");

  const missingChatType = normalizeExternalChannelVendorEvent({
    channelId: "telegram",
    body: {
      message: {
        message_id: 56,
        text: "missing chat type",
        from: { id: 42 },
        chat: { id: -100123 },
      },
    },
  });
  assertEqual(missingChatType.accepted, false, "Telegram missing chat type is rejected");
  assertEqual(missingChatType.errorCode, "malformed_vendor_event", "Telegram missing chat type has stable error code");

  const unknownChatType = normalizeExternalChannelVendorEvent({
    channelId: "telegram",
    body: {
      message: {
        message_id: 57,
        text: "unknown chat type",
        from: { id: 42 },
        chat: { id: -100123, type: "forum" },
      },
    },
  });
  assertEqual(unknownChatType.accepted, false, "Telegram unknown chat type is rejected");
}

function verifyFailClosedVendorEvents(): void {
  section("5. Fail-Closed Vendor Event Rejections");

  const unsupported = normalizeExternalChannelVendorEvent({
    channelId: "matrix",
    body: {
      token: "matrix-secret-token",
      text: "do not leak",
    },
  });
  assertEqual(unsupported.accepted, false, "Unsupported vendor event channel is rejected");
  assertEqual(unsupported.errorCode, "unsupported_channel", "Unsupported vendor channel has stable error code");
  assert(!JSON.stringify(unsupported).includes("matrix-secret-token"), "Unsupported vendor diagnostics redact token fields");

  const malformedSecret = normalizeExternalChannelVendorEvent({
    channelId: "telegram",
    body: {
      authorization: "Bearer telegram-super-secret",
      message: {
        text: "missing sender and chat",
      },
    },
  });
  assertEqual(malformedSecret.accepted, false, "Malformed vendor event is rejected");
  assertEqual(malformedSecret.errorCode, "malformed_vendor_event", "Malformed vendor event has stable error code");
  assert(!JSON.stringify(malformedSecret).includes("telegram-super-secret"), "Malformed vendor diagnostics redact authorization values");

  const rawStringLeak = normalizeExternalChannelVendorEvent({
    channelId: "slack",
    body: {
      type: "url_verification",
      response_url: "https://hooks.slack.com/services/T000/B000/private-webhook",
      text: "private operator text",
      token: "slack-secret-token",
    },
  });
  assertEqual(rawStringLeak.accepted, false, "Unsupported Slack control payload is rejected");
  assert(!JSON.stringify(rawStringLeak).includes("hooks.slack.com"), "Rejected vendor diagnostics do not copy webhook URLs");
  assert(!JSON.stringify(rawStringLeak).includes("private operator text"), "Rejected vendor diagnostics do not copy raw text fields");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 93 Verification (External Channel UX + Event Normalization)\n");

  await verifyChannelsExternalOperatorView();
  verifySlackVendorEventNormalization();
  verifyDiscordVendorEventNormalization();
  verifyTelegramVendorEventNormalization();
  verifyFailClosedVendorEvents();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 93: external channel operator UX and vendor event normalization are GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
