/**
 * Phase 33 Verification Script - Channel Auth, Pairing, and Inbound Normalization
 *
 * Covers the second Phase 6 channel slice:
 *   1. Redacted webhook secret auth for channel inbound requests
 *   2. Pairing-gated direct-message authorization
 *   3. Normalized inbound webhook envelopes with deterministic route keys
 *   4. `/channels auth` operator visibility without credential leakage
 *
 * Run: bun run src/verify-phase33.ts
 */

import {
  ChannelAuthPolicy,
  ChannelPairingStore,
  normalizeChannelInboundWebhook,
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

function createPolicy(): ChannelAuthPolicy {
  return new ChannelAuthPolicy({
    channels: {
      discord: {
        webhookSecret: "secret-token",
        dmPolicy: "pairing",
        groupPolicy: "allowlist",
        allowFrom: ["trusted-user", "group:ops"],
      },
      slack: {
        webhookSecret: "slack-secret",
        dmPolicy: "disabled",
        groupPolicy: "open",
      },
    },
  });
}

function verifyWebhookAuth(): void {
  section("1. Channel Webhook Auth");

  const policy = createPolicy();
  const accepted = policy.authenticateWebhook({
    channel: "discord",
    url: "http://127.0.0.1/channels/discord?token=secret-token",
    headers: {},
  });
  assertEqual(accepted.allowed, true, "Webhook auth accepts matching query token");
  assertEqual(accepted.code, "webhook_authenticated", "Webhook auth reports authenticated code");

  const headerAccepted = policy.authenticateWebhook({
    channel: "discord",
    url: "http://127.0.0.1/channels/discord",
    headers: { "x-channel-secret": "secret-token" },
  });
  assertEqual(headerAccepted.allowed, true, "Webhook auth accepts matching header secret");

  const denied = policy.authenticateWebhook({
    channel: "discord",
    url: "http://127.0.0.1/channels/discord?token=wrong",
    headers: {},
  });
  assertEqual(denied.allowed, false, "Webhook auth rejects wrong token");
  assertEqual(denied.code, "webhook_auth_failed", "Webhook auth failure has stable code");

  const status = policy.status();
  assertEqual(status.channels.length, 2, "Auth status lists configured channels");
  assertEqual(status.channels[0]?.channelId, "discord", "Auth status sorts channels");
  assertEqual(status.channels[0]?.webhookAuthRequired, true, "Auth status reports webhook auth requirement");
  assertEqual(status.channels[0]?.dmPolicy, "pairing", "Auth status reports DM policy");
  assert(!JSON.stringify(status).includes("secret-token"), "Auth status redacts raw webhook secret");
}

function verifyPairingAuthorization(): void {
  section("2. Channel Pairing Authorization");

  const policy = createPolicy();
  const pairings = new ChannelPairingStore();
  const issued = pairings.issuePairing({
    channel: "discord",
    senderId: "user-123",
    requestedBy: "operator",
    expiresAt: "2030-01-01T00:00:00.000Z",
  });
  assert(issued.code.startsWith("chpair_"), "Pairing issue returns stable code prefix");
  assertEqual(pairings.status().pendingCount, 1, "Pairing status counts pending pairing");

  const deniedBeforeApproval = policy.authorizeInbound({
    channel: "discord",
    senderId: "user-123",
    targetKind: "direct",
    pairings,
  });
  assertEqual(deniedBeforeApproval.allowed, false, "Pairing-gated DM is denied before approval");
  assertEqual(deniedBeforeApproval.code, "pairing_required", "Pairing-gated denial names pairing requirement");

  const approved = pairings.approve(issued.code, {
    approvedBy: "operator",
    approvedAt: "2026-04-26T12:00:00.000Z",
  });
  assertEqual(approved.approved, true, "Pairing approval succeeds for valid code");
  assertEqual(pairings.isPaired("discord", "user-123"), true, "Pairing store recognizes approved sender");

  const allowedAfterApproval = policy.authorizeInbound({
    channel: "discord",
    senderId: "user-123",
    targetKind: "direct",
    pairings,
  });
  assertEqual(allowedAfterApproval.allowed, true, "Pairing-gated DM is allowed after approval");
  assertEqual(allowedAfterApproval.code, "paired_sender", "Pairing-gated allow names paired sender");

  const allowlisted = policy.authorizeInbound({
    channel: "discord",
    senderId: "trusted-user",
    targetKind: "group",
    targetId: "ops",
    pairings,
  });
  assertEqual(allowlisted.allowed, true, "Allowlisted group sender is allowed");

  const blockedGroup = policy.authorizeInbound({
    channel: "discord",
    senderId: "unknown-user",
    targetKind: "group",
    targetId: "ops",
    pairings,
  });
  assertEqual(blockedGroup.allowed, false, "Unknown group sender is denied under allowlist policy");

  const statusJson = JSON.stringify(pairings.status());
  assert(!statusJson.includes(issued.code), "Pairing status does not leak pending code");
}

function verifyInboundNormalization(): void {
  section("3. Inbound Webhook Normalization");

  const policy = createPolicy();
  const pairings = new ChannelPairingStore();
  const issued = pairings.issuePairing({
    channel: "discord",
    senderId: "user-123",
    requestedBy: "operator",
  });
  pairings.approve(issued.code, { approvedBy: "operator" });

  const normalized = normalizeChannelInboundWebhook({
    channel: "discord",
    agentId: "main",
    url: "http://127.0.0.1/channels/discord?token=secret-token",
    headers: {},
    body: {
      messageId: "m-1",
      senderId: "user-123",
      senderName: "Ada",
      text: "hello from discord",
      targetKind: "channel",
      targetId: "123456",
      threadId: "987654",
    },
    authPolicy: policy,
    pairings,
  });

  assertEqual(normalized.accepted, true, "Inbound webhook normalizes accepted message");
  assertEqual(normalized.message?.messageId, "m-1", "Inbound normalization preserves message id");
  assertEqual(normalized.message?.senderId, "user-123", "Inbound normalization preserves sender");
  assertEqual(normalized.message?.text, "hello from discord", "Inbound normalization preserves text");
  assertEqual(
    normalized.message?.routeKey,
    "agent:main:discord:channel:123456:thread:987654",
    "Inbound normalization builds deterministic route key",
  );
  assertEqual(normalized.message?.authorization.code, "paired_sender", "Inbound normalization records auth decision");
  assert(!JSON.stringify(normalized).includes("secret-token"), "Inbound normalization does not leak webhook secret");

  const deniedWebhook = normalizeChannelInboundWebhook({
    channel: "discord",
    agentId: "main",
    url: "http://127.0.0.1/channels/discord?token=wrong",
    headers: {},
    body: {
      senderId: "user-123",
      text: "bad auth",
      targetKind: "direct",
      targetId: "user-123",
    },
    authPolicy: policy,
    pairings,
  });
  assertEqual(deniedWebhook.accepted, false, "Inbound webhook rejects bad secret");
  assertEqual(deniedWebhook.errorCode, "webhook_auth_failed", "Inbound bad secret preserves error code");

  const malformed = normalizeChannelInboundWebhook({
    channel: "discord",
    agentId: "main",
    url: "http://127.0.0.1/channels/discord?token=secret-token",
    headers: {},
    body: { senderId: "user-123", targetKind: "direct", targetId: "user-123" },
    authPolicy: policy,
    pairings,
  });
  assertEqual(malformed.accepted, false, "Inbound webhook rejects missing text");
  assertEqual(malformed.errorCode, "invalid_inbound_payload", "Malformed inbound payload has stable code");
}

function verifyChannelsAuthGateway(): void {
  section("4. /channels Auth Operator View");

  const policy = createPolicy();
  const pairings = new ChannelPairingStore();
  const issued = pairings.issuePairing({
    channel: "discord",
    senderId: "user-123",
    requestedBy: "operator",
  });
  pairings.approve(issued.code, { approvedBy: "operator" });

  const parsed = parseCommand("/channels auth");
  assertEqual(parsed.type, "channels", "parseCommand recognizes /channels auth");
  assertEqual(parsed.args[0], "auth", "parseCommand preserves auth view arg");

  const parser = new SlashCommandParser({
    channels: {
      auth: policy.status(),
      pairings: pairings.status(),
    },
  });

  const auth = parser.tryHandle("/channels auth");
  assertEqual(auth.handled, true, "/channels auth command resolves");
  assert(auth.output.includes("Channel Auth"), "/channels auth renders auth header");
  assert(auth.output.includes("discord"), "/channels auth lists channel");
  assert(auth.output.includes("DM policy: pairing"), "/channels auth shows DM policy");
  assert(auth.output.includes("Pairings: 1 approved"), "/channels auth shows approved pairing count");
  assert(!auth.output.includes("secret-token"), "/channels auth does not leak webhook secret");
  assert(!auth.output.includes(issued.code), "/channels auth does not leak pairing code");

  const payload = buildChannelsCommandPayload(["auth"], {
    auth: policy.status(),
    pairings: pairings.status(),
  });
  assertEqual(payload.isError, undefined, "buildChannelsCommandPayload supports auth view");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 33 Verification (Channel Auth + Inbound Normalization)\n");

  verifyWebhookAuth();
  verifyPairingAuthorization();
  verifyInboundNormalization();
  verifyChannelsAuthGateway();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 33: Channel auth and inbound normalization are GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
