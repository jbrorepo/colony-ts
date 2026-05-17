/**
 * Phase 97 Verification Script - Host-Owned External Vendor Webhook Transport
 *
 * Covers the next Phase 6 channel slice:
 *   1. HTTP transport for vendor-shaped Slack/Discord/Telegram events into Phase 96 dispatch
 *   2. Mandatory host-owned signature verifier, auth policy, and session bridge
 *   3. Response surfaces use opaque/redacted dispatch identifiers and never echo raw vendor text/secrets
 *   4. Optional local listener remains host-owned and does not register vendor webhooks or subscriptions
 *
 * Run: bun run src/verify-phase97.ts
 */

import {
  ChannelAuthPolicy,
  ChannelRegistry,
  ChannelSessionBridge,
  ExternalChannelVendorWebhookHttpServer,
  InMemoryChannelAdapter,
  handleExternalChannelVendorWebhookRequest,
  type ChannelWebhookSignatureVerificationRequest,
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

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function containsSensitive(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("xoxb-phase97-secret") ||
    text.includes("phase97-webhook-secret") ||
    text.includes("phase97-code-secret") ||
    text.includes("private webhook text") ||
    text.includes("private discord text") ||
    text.includes("private telegram text") ||
    text.includes("Bearer phase97") ||
    text.includes("raw malformed phase97");
}

function createSlackBridge(): { bridge: ChannelSessionBridge; adapter: InMemoryChannelAdapter } {
  const registry = new ChannelRegistry();
  const adapter = new InMemoryChannelAdapter({ channelId: "slack" });
  registry.register(adapter);
  const bridge = new ChannelSessionBridge({
    registry,
    now: () => "2026-05-02T21:30:00.000Z",
    sessionRunner: async (request) => ({ text: `reply:${request.message.messageId}` }),
  });
  return { bridge, adapter };
}

function createSlackAuth(): ChannelAuthPolicy {
  return new ChannelAuthPolicy({
    channels: {
      slack: {
        webhookSecret: "phase97-webhook-secret",
        groupPolicy: "open",
      },
    },
  });
}

function createChannelBridge(channelId: string): { bridge: ChannelSessionBridge; adapter: InMemoryChannelAdapter } {
  const registry = new ChannelRegistry();
  const adapter = new InMemoryChannelAdapter({ channelId });
  registry.register(adapter);
  const bridge = new ChannelSessionBridge({
    registry,
    sessionRunner: async (request) => ({ text: `reply:${request.message.messageId}` }),
  });
  return { bridge, adapter };
}

function createOpenAuth(channelId: string): ChannelAuthPolicy {
  return new ChannelAuthPolicy({
    channels: {
      [channelId]: {
        webhookSecret: "phase97-webhook-secret",
        dmPolicy: "open",
        groupPolicy: "open",
      },
    },
  });
}

async function verifyRequestValidation(): Promise<void> {
  section("1. External Vendor Webhook Request Validation");

  const { bridge } = createSlackBridge();
  const authPolicy = createSlackAuth();
  const verifier = () => ({ accepted: true, code: "signature_verified", reason: "ok" });

  const wrongPath = await handleExternalChannelVendorWebhookRequest(new Request("http://127.0.0.1/api/nope", {
    method: "POST",
    body: "{}",
  }), { bridge, authPolicy, vendorSignatureVerifier: verifier });
  assertEqual(wrongPath.status, 404, "External vendor webhook rejects wrong path");
  assert(String((await readJson(wrongPath)).error ?? "").includes("not found"), "Wrong path returns bounded JSON error");

  const malformedPath = await handleExternalChannelVendorWebhookRequest(new Request("http://127.0.0.1/api/channels/%E0%A4%A/external-event", {
    method: "POST",
    body: "{}",
  }), { bridge, authPolicy, vendorSignatureVerifier: verifier });
  assertEqual(malformedPath.status, 404, "Malformed channel path encoding fails closed");
  assert(String((await readJson(malformedPath)).error ?? "").includes("not found"), "Malformed path returns bounded JSON error");

  const wrongMethod = await handleExternalChannelVendorWebhookRequest(new Request("http://127.0.0.1/api/channels/slack/external-event", {
    method: "GET",
  }), { bridge, authPolicy, vendorSignatureVerifier: verifier });
  assertEqual(wrongMethod.status, 405, "External vendor webhook rejects non-POST method");
  assertEqual(wrongMethod.headers.get("allow"), "POST", "Wrong method advertises POST allow header");

  const missingVerifier = await handleExternalChannelVendorWebhookRequest(new Request("http://127.0.0.1/api/channels/slack/external-event", {
    method: "POST",
    body: "{}",
  }), { bridge, authPolicy });
  assertEqual(missingVerifier.status, 401, "Missing vendor signature verifier fails closed");
  assertEqual((await readJson(missingVerifier)).errorCode, "missing_vendor_signature_verifier", "Missing verifier has stable code");

  let largeVerifierCalls = 0;
  const largeBody = await handleExternalChannelVendorWebhookRequest(new Request("http://127.0.0.1/api/channels/slack/external-event", {
    method: "POST",
    headers: {
      "content-length": String(80 * 1024),
      "x-channel-secret": "phase97-webhook-secret",
    },
    body: "{}",
  }), {
    bridge,
    authPolicy,
    vendorSignatureVerifier: () => {
      largeVerifierCalls++;
      return { accepted: true, code: "signature_verified", reason: "ok" };
    },
  });
  assertEqual(largeBody.status, 413, "Oversized vendor webhook body fails closed before raw read");
  assertEqual((await readJson(largeBody)).errorCode, "request_body_too_large", "Oversized body has stable code");
  assertEqual(largeVerifierCalls, 0, "Oversized body does not call verifier");

  const malformed = await handleExternalChannelVendorWebhookRequest(new Request("http://127.0.0.1/api/channels/slack/external-event", {
    method: "POST",
    headers: { "x-channel-secret": "phase97-webhook-secret" },
    body: "{ raw malformed phase97 xoxb-phase97-secret",
  }), { bridge, authPolicy, vendorSignatureVerifier: verifier });
  assertEqual(malformed.status, 400, "Malformed vendor JSON fails closed after signature verification");
  assert(!containsSensitive(await readJson(malformed)), "Malformed JSON response redacts raw body and token");
}

async function verifySlackWebhookDispatch(): Promise<void> {
  section("2. Slack External Vendor Webhook Dispatch");

  const { bridge, adapter } = createSlackBridge();
  const authPolicy = createSlackAuth();
  const verifierCalls: ChannelWebhookSignatureVerificationRequest[] = [];
  const verifier = (request: ChannelWebhookSignatureVerificationRequest) => {
    verifierCalls.push(request);
    return { accepted: true, code: "signature_verified", reason: "Slack signature verified." };
  };

  const response = await handleExternalChannelVendorWebhookRequest(new Request("http://127.0.0.1/api/channels/slack/external-event", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-channel-secret": "phase97-webhook-secret",
      authorization: "Bearer phase97",
    },
    body: JSON.stringify({
      type: "event_callback",
      token: "xoxb-phase97-secret",
      team_id: "T97",
      event: {
        type: "message",
        user: "U97",
        text: "private webhook text",
        channel: "C97",
        ts: "171000.9700",
        thread_ts: "171000.9600",
        client_msg_id: "client-97",
      },
    }),
  }), { bridge, authPolicy, vendorSignatureVerifier: verifier });

  const body = await readJson(response);
  assertEqual(response.status, 202, "Verified Slack vendor webhook dispatches");
  assertEqual(body.accepted, true, "Accepted response reports accepted");
  assertEqual(body.channel, "slack", "Accepted response reports channel");
  assert(typeof body.messageId === "string" && body.messageId.startsWith("msg_"), "Accepted response reports opaque message fingerprint");
  assertEqual(body.turnStatus, "deferred", "Accepted response reports deferred bridge turn status");
  assertEqual(verifierCalls.length, 1, "Vendor signature verifier is called once");
  assertEqual(verifierCalls[0]?.channelId, "slack", "Verifier receives normalized channel id");
  assert(String(verifierCalls[0]?.rawBody ?? "").includes("private webhook text"), "Verifier receives exact raw body before parsing");
  assertEqual(bridge.status().routeCount, 1, "Webhook dispatch creates bridge route");
  assertEqual(adapter.sentMessages.length, 0, "Webhook dispatch sends no adapter reply before ACK");
  await delay(5);
  assertEqual(adapter.sentMessages.length, 1, "Webhook dispatch sends async reply through registered adapter");
  assertEqual(adapter.sentMessages[0]?.target.threadId, "171000.9600", "Slack thread route is preserved");
  assert(!containsSensitive(body), "Accepted response redacts raw text, auth header, token, and webhook secret");
}

async function verifyFailClosedSignatureAndAuth(): Promise<void> {
  section("3. Signature And Host Auth Fail Closed");

  const { bridge } = createSlackBridge();
  const authPolicy = createSlackAuth();
  let verifierCalls = 0;
  const rejectedSignature = await handleExternalChannelVendorWebhookRequest(new Request("http://127.0.0.1/api/channels/slack/external-event", {
    method: "POST",
    headers: { "x-channel-secret": "phase97-webhook-secret" },
    body: JSON.stringify({
      type: "event_callback",
      token: "xoxb-phase97-secret",
      event: { type: "message", user: "U97", text: "private webhook text", channel: "C97", ts: "171000.9701" },
    }),
  }), {
    bridge,
    authPolicy,
    vendorSignatureVerifier: () => {
      verifierCalls++;
      return { accepted: false, code: "signature_mismatch", reason: "signature rejected xoxb-phase97-secret" };
    },
  });
  assertEqual(rejectedSignature.status, 401, "Rejected vendor signature fails closed");
  const rejectedSignatureBody = await readJson(rejectedSignature);
  assertEqual(rejectedSignatureBody.errorCode, "signature_mismatch", "Rejected signature preserves stable code");
  assertEqual(verifierCalls, 1, "Rejected signature still calls verifier exactly once");
  assertEqual(bridge.status().routeCount, 0, "Rejected signature does not reach bridge");
  assert(!containsSensitive(rejectedSignatureBody), "Rejected signature response redacts token");

  const poisonedCode = await handleExternalChannelVendorWebhookRequest(new Request("http://127.0.0.1/api/channels/slack/external-event", {
    method: "POST",
    headers: { "x-channel-secret": "phase97-webhook-secret" },
    body: JSON.stringify({
      type: "event_callback",
      token: "xoxb-phase97-secret",
      event: { type: "message", user: "U97", text: "private webhook text", channel: "C97", ts: "171000.9704" },
    }),
  }), {
    bridge,
    authPolicy,
    vendorSignatureVerifier: () => ({ accepted: false, code: "xoxb-phase97-code-secret", reason: "bad code" }),
  });
  const poisonedCodeBody = await readJson(poisonedCode);
  assertEqual(poisonedCode.status, 401, "Verifier-controlled secret-shaped error code fails closed");
  assertEqual(poisonedCodeBody.errorCode, "external_vendor_signature_rejected", "Verifier-controlled secret-shaped error code is normalized");
  assert(!containsSensitive(poisonedCodeBody), "Verifier-controlled error code response redacts secrets");

  const missingHostAuth = await handleExternalChannelVendorWebhookRequest(new Request("http://127.0.0.1/api/channels/slack/external-event", {
    method: "POST",
    body: JSON.stringify({
      type: "event_callback",
      token: "xoxb-phase97-secret",
      event: { type: "message", user: "U97", text: "private webhook text", channel: "C97", ts: "171000.9702" },
    }),
  }), {
    bridge,
    authPolicy,
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });
  const missingHostAuthBody = await readJson(missingHostAuth);
  assertEqual(missingHostAuth.status, 403, "Missing host auth proof fails closed after signature verification");
  assertEqual(missingHostAuthBody.errorCode, "webhook_auth_failed", "Missing host auth proof preserves dispatch rejection code");
  assertEqual(bridge.status().routeCount, 0, "Missing host auth proof does not reach bridge");
  assert(!containsSensitive(missingHostAuthBody), "Missing host auth response redacts raw event data");
}

async function verifyDiscordAndTelegramWebhookDispatch(): Promise<void> {
  section("4. Discord And Telegram Vendor Webhook Dispatch");

  const discord = createChannelBridge("discord");
  const discordResponse = await handleExternalChannelVendorWebhookRequest(new Request("http://127.0.0.1/api/channels/discord/external-event", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-channel-secret": "phase97-webhook-secret",
    },
    body: JSON.stringify({
      id: "d97",
      type: 0,
      channel_id: "dc97",
      guild_id: "dg97",
      thread_id: "dt97",
      content: "private discord text",
      token: "discord-token",
      author: { id: "du97", username: "Ada" },
    }),
  }), {
    bridge: discord.bridge,
    authPolicy: createOpenAuth("discord"),
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });
  const discordBody = await readJson(discordResponse);
  assertEqual(discordResponse.status, 202, "Discord vendor webhook dispatches through shared transport");
  assertEqual(discordBody.channel, "discord", "Discord response reports channel");
  assertEqual(discordBody.turnStatus, "replied", "Discord response reports bridge turn status");
  assertEqual(discord.adapter.sentMessages[0]?.target.threadId, "dt97", "Discord thread route is preserved");
  assert(!containsSensitive(discordBody), "Discord response redacts raw text and token");

  const telegram = createChannelBridge("telegram");
  const telegramResponse = await handleExternalChannelVendorWebhookRequest(new Request("http://127.0.0.1/api/channels/telegram/external-event", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-channel-secret": "phase97-webhook-secret",
    },
    body: JSON.stringify({
      token: "telegram-token",
      message: {
        message_id: 97,
        message_thread_id: 9700,
        text: "private telegram text",
        from: { id: 9701, username: "ada" },
        chat: { id: -9702, type: "supergroup" },
      },
    }),
  }), {
    bridge: telegram.bridge,
    authPolicy: createOpenAuth("telegram"),
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });
  const telegramBody = await readJson(telegramResponse);
  assertEqual(telegramResponse.status, 202, "Telegram vendor webhook dispatches through shared transport");
  assertEqual(telegramBody.channel, "telegram", "Telegram response reports channel");
  assertEqual(telegramBody.turnStatus, "replied", "Telegram response reports bridge turn status");
  assertEqual(telegram.adapter.sentMessages[0]?.target.topicId, "9700", "Telegram topic route is preserved");
  assert(!containsSensitive(telegramBody), "Telegram response redacts raw text and token");
}

async function verifyLocalExternalVendorListener(): Promise<void> {
  section("5. Host-Owned External Vendor Webhook Listener");

  const { bridge, adapter } = createSlackBridge();
  const authPolicy = createSlackAuth();
  const server = new ExternalChannelVendorWebhookHttpServer({
    hostname: "127.0.0.1",
    port: 0,
    bridge,
    authPolicy,
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });

  await server.start();
  try {
    assert(server.url.includes("/api/channels"), "External vendor webhook server exposes base URL");
    const response = await fetch(`${server.url}/slack/external-event`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-channel-secret": "phase97-webhook-secret",
      },
      body: JSON.stringify({
        type: "event_callback",
        token: "xoxb-phase97-secret",
        event: { type: "message", user: "U97", text: "private webhook text", channel: "C97", ts: "171000.9703" },
      }),
    });
    const body = await readJson(response);
    assertEqual(response.status, 202, "Real local listener accepts verified vendor webhook");
    assertEqual(body.turnStatus, "deferred", "Real local listener reports deferred dispatch status");
    assertEqual(adapter.sentMessages.length, 0, "Real local listener sends no adapter reply before ACK");
    await delay(5);
    assertEqual(adapter.sentMessages.length, 1, "Real local listener dispatches async reply through bridge");
    assert(!containsSensitive(body), "Real local listener response redacts event secrets");
  } finally {
    await server.stop();
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 97 Verification (External Vendor Webhook Transport)\n");

  await verifyRequestValidation();
  await verifySlackWebhookDispatch();
  await verifyFailClosedSignatureAndAuth();
  await verifyDiscordAndTelegramWebhookDispatch();
  await verifyLocalExternalVendorListener();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 97: host-owned external vendor webhook transport is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
