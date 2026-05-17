/**
 * Phase 34 Verification Script - Channel Webhook Transport
 *
 * Covers the third Phase 6 channel slice:
 *   1. HTTP webhook request validation for channel inbound delivery
 *   2. Webhook auth + normalized inbound message callback
 *   3. Real local webhook listener smoke path
 *
 * Run: bun run src/verify-phase34.ts
 */

import {
  ChannelAuthPolicy,
  ChannelPairingStore,
  ChannelWebhookHttpServer,
  handleChannelWebhookRequest,
  type ChannelInboundMessage,
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

function createAuth(): { authPolicy: ChannelAuthPolicy; pairings: ChannelPairingStore } {
  const authPolicy = new ChannelAuthPolicy({
    channels: {
      discord: {
        webhookSecret: "secret-token",
        dmPolicy: "pairing",
        groupPolicy: "pairing",
      },
    },
  });
  const pairings = new ChannelPairingStore();
  const pairing = pairings.issuePairing({
    channel: "discord",
    senderId: "user-123",
    requestedBy: "operator",
  });
  pairings.approve(pairing.code, { approvedBy: "operator" });
  return { authPolicy, pairings };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

async function verifyRequestValidation(): Promise<void> {
  section("1. Channel Webhook Request Validation");

  const { authPolicy, pairings } = createAuth();
  const messages: ChannelInboundMessage[] = [];

  const wrongPath = await handleChannelWebhookRequest(new Request("http://127.0.0.1/api/nope", {
    method: "POST",
    body: "{}",
  }), {
    authPolicy,
    pairings,
    onMessage: (message) => { messages.push(message); },
  });
  assertEqual(wrongPath.status, 404, "Webhook handler rejects wrong path");
  assert(String((await readJson(wrongPath)).error ?? "").includes("not found"), "Wrong path returns JSON error");

  const wrongMethod = await handleChannelWebhookRequest(new Request("http://127.0.0.1/api/channels/discord/webhook", {
    method: "GET",
  }), {
    authPolicy,
    pairings,
    onMessage: (message) => { messages.push(message); },
  });
  assertEqual(wrongMethod.status, 405, "Webhook handler rejects non-POST method");
  assertEqual(wrongMethod.headers.get("allow"), "POST", "Wrong method advertises POST allow header");

  const malformed = await handleChannelWebhookRequest(new Request("http://127.0.0.1/api/channels/discord/webhook?token=secret-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  }), {
    authPolicy,
    pairings,
    onMessage: (message) => { messages.push(message); },
  });
  assertEqual(malformed.status, 400, "Webhook handler rejects malformed JSON");
  assert(String((await readJson(malformed)).error ?? "").includes("Malformed JSON"), "Malformed JSON error is explicit");
  assertEqual(messages.length, 0, "Invalid requests do not call message handler");
}

async function verifyWebhookDelivery(): Promise<void> {
  section("2. Channel Webhook Delivery");

  const { authPolicy, pairings } = createAuth();
  const messages: ChannelInboundMessage[] = [];

  const denied = await handleChannelWebhookRequest(new Request("http://127.0.0.1/api/channels/discord/webhook?token=wrong", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messageId: "m-denied",
      senderId: "user-123",
      text: "bad",
      targetKind: "direct",
      targetId: "user-123",
    }),
  }), {
    authPolicy,
    pairings,
    onMessage: (message) => { messages.push(message); },
  });
  assertEqual(denied.status, 403, "Webhook handler rejects invalid channel secret");
  assertEqual((await readJson(denied)).errorCode, "webhook_auth_failed", "Webhook auth failure preserves error code");
  assertEqual(messages.length, 0, "Denied webhook does not call message handler");

  const accepted = await handleChannelWebhookRequest(new Request("http://127.0.0.1/api/channels/discord/webhook?token=secret-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messageId: "m-accepted",
      senderId: "user-123",
      senderName: "Ada",
      text: "hello transport",
      targetKind: "channel",
      targetId: "123456",
      threadId: "987654",
    }),
  }), {
    authPolicy,
    pairings,
    agentId: "agent-main",
    onMessage: (message) => { messages.push(message); },
  });
  const body = await readJson(accepted);
  assertEqual(accepted.status, 202, "Webhook handler accepts valid inbound message");
  assertEqual(body.accepted, true, "Accepted webhook response reports accepted");
  assertEqual(body.channel, "discord", "Accepted webhook response reports channel");
  assertEqual(body.routeKey, "agent:agent-main:discord:channel:123456:thread:987654", "Accepted webhook response reports route key");
  assert(!JSON.stringify(body).includes("secret-token"), "Accepted response does not leak webhook secret");
  assertEqual(messages.length, 1, "Accepted webhook calls message handler once");
  assertEqual(messages[0]?.text, "hello transport", "Message handler receives normalized text");
  assertEqual(messages[0]?.authorization.code, "paired_sender", "Message handler receives auth decision");
}

async function verifyLocalListener(): Promise<void> {
  section("3. Channel Webhook Local Listener");

  const { authPolicy, pairings } = createAuth();
  const messages: ChannelInboundMessage[] = [];
  const server = new ChannelWebhookHttpServer({
    authPolicy,
    pairings,
    hostname: "127.0.0.1",
    port: 0,
    onMessage: (message) => { messages.push(message); },
  });

  await server.start();
  try {
    assert(server.url.includes("/api/channels"), "Webhook server exposes base URL");
    const response = await fetch(`${server.url}/discord/webhook?token=secret-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messageId: "m-listener",
        senderId: "user-123",
        text: "hello listener",
        targetKind: "direct",
        targetId: "user-123",
      }),
    });
    const body = await response.json() as Record<string, unknown>;
    assertEqual(response.status, 202, "Real listener accepts valid webhook");
    assertEqual(body.messageId, "m-listener", "Real listener response preserves message id");
    assertEqual(messages.length, 1, "Real listener invokes message handler");
    assertEqual(messages[0]?.routeKey, "agent:default:discord:direct:user-123", "Real listener uses default agent route key");
  } finally {
    await server.stop();
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 34 Verification (Channel Webhook Transport)\n");

  await verifyRequestValidation();
  await verifyWebhookDelivery();
  await verifyLocalListener();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 34: Channel webhook transport is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
