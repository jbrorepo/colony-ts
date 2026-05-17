/**
 * Phase 99 Verification Script - Slack URL Verification Handshake
 *
 * Covers the next Phase 6 channel slice:
 *   1. Slack Events API url_verification challenge handling after signature verification
 *   2. Challenge responses do not require Colony host auth and never reach the session bridge
 *   3. Missing/rejected verifier and malformed challenges fail closed with redacted bounded responses
 *   4. Normal Slack event_callback dispatch still requires host auth and bridge execution
 *
 * Run: bun run src/verify-phase99.ts
 */

import {
  ChannelAuthPolicy,
  ChannelRegistry,
  ChannelSessionBridge,
  handleExternalChannelVendorWebhookRequest,
  InMemoryChannelAdapter,
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

function createSlackBridge(): { bridge: ChannelSessionBridge; adapter: InMemoryChannelAdapter } {
  const registry = new ChannelRegistry();
  const adapter = new InMemoryChannelAdapter({ channelId: "slack" });
  registry.register(adapter);
  const bridge = new ChannelSessionBridge({
    registry,
    now: () => "2026-05-03T04:15:00.000Z",
    sessionRunner: async (request) => ({ text: `reply:${request.message.messageId}` }),
  });
  return { bridge, adapter };
}

function createSlackAuth(): ChannelAuthPolicy {
  return new ChannelAuthPolicy({
    channels: {
      slack: {
        webhookSecret: "phase99-host-secret",
        groupPolicy: "open",
      },
    },
  });
}

function containsSecrets(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("xoxb-phase99-secret") ||
    text.includes("phase99-host-secret") ||
    text.includes("phase99-signature-secret") ||
    text.includes("private slack phase99 text") ||
    text.includes("raw malformed phase99");
}

async function verifySlackUrlVerificationAccepted(): Promise<void> {
  section("1. Signed Slack URL Verification Challenge");

  const verifierCalls: ChannelWebhookSignatureVerificationRequest[] = [];
  const response = await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/slack/external-event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "url_verification",
      token: "xoxb-phase99-secret",
      challenge: "phase99-slack-challenge",
    }),
  }), {
    vendorSignatureVerifier: (request) => {
      verifierCalls.push(request);
      return { accepted: true, code: "signature_verified", reason: "ok" };
    },
  });

  const body = await readJson(response);
  assertEqual(response.status, 200, "Signed Slack url_verification returns HTTP 200");
  assertEqual(body.challenge, "phase99-slack-challenge", "Slack challenge is echoed exactly");
  assertEqual(Object.keys(body).length, 1, "Slack challenge response contains only the challenge");
  assertEqual(response.headers.get("content-type"), "application/json", "Slack challenge response is JSON");
  assertEqual(verifierCalls.length, 1, "Slack challenge calls vendor signature verifier exactly once");
  assertEqual(verifierCalls[0]?.channelId, "slack", "Slack challenge verifier receives normalized channel id");
  assert(String(verifierCalls[0]?.rawBody ?? "").includes("phase99-slack-challenge"), "Slack challenge verifier receives exact raw body");
  assert(!containsSecrets(body), "Slack challenge response does not leak verification token or host secrets");

  const tokenShapedChallenge = "phase99-secret-shaped-challenge";
  const tokenShapedResponse = await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/slack/external-event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "url_verification",
      token: "xoxb-phase99-secret",
      challenge: tokenShapedChallenge,
    }),
  }), {
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });
  const tokenShapedBody = await readJson(tokenShapedResponse);
  assertEqual(tokenShapedResponse.status, 200, "Token-shaped Slack challenge returns HTTP 200");
  assertEqual(tokenShapedBody.challenge, tokenShapedChallenge, "Token-shaped Slack challenge is echoed exactly");
  assertEqual(Object.keys(tokenShapedBody).length, 1, "Token-shaped Slack challenge response contains only the challenge");
  assert(!JSON.stringify(tokenShapedBody).includes("xoxb-phase99-secret"), "Token-shaped Slack challenge response does not leak verification token");
}

async function verifySlackUrlVerificationFailClosed(): Promise<void> {
  section("2. Slack URL Verification Fail-Closed Paths");

  const missingVerifier = await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/slack/external-event", {
    method: "POST",
    body: JSON.stringify({
      type: "url_verification",
      token: "xoxb-phase99-secret",
      challenge: "phase99-slack-challenge",
    }),
  }));
  const missingVerifierBody = await readJson(missingVerifier);
  assertEqual(missingVerifier.status, 401, "Missing verifier rejects Slack challenge");
  assertEqual(missingVerifierBody.errorCode, "missing_vendor_signature_verifier", "Missing verifier keeps stable error code");
  assert(!containsSecrets(missingVerifierBody), "Missing verifier response redacts Slack token");

  const rejected = await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/slack/external-event", {
    method: "POST",
    body: JSON.stringify({
      type: "url_verification",
      token: "xoxb-phase99-secret",
      challenge: "phase99-slack-challenge",
    }),
  }), {
    vendorSignatureVerifier: () => ({ accepted: false, code: "signature_mismatch", reason: "bad signature phase99-signature-secret" }),
  });
  const rejectedBody = await readJson(rejected);
  assertEqual(rejected.status, 401, "Rejected signature rejects Slack challenge");
  assertEqual(rejectedBody.errorCode, "signature_mismatch", "Rejected signature keeps stable error code");
  assert(!containsSecrets(rejectedBody), "Rejected signature response redacts verifier-controlled secrets");

  const invalid = await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/slack/external-event", {
    method: "POST",
    body: JSON.stringify({
      type: "url_verification",
      token: "xoxb-phase99-secret",
      challenge: "",
    }),
  }), {
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });
  const invalidBody = await readJson(invalid);
  assertEqual(invalid.status, 400, "Blank Slack challenge fails closed after signature verification");
  assertEqual(invalidBody.errorCode, "slack_url_verification_invalid", "Blank Slack challenge has stable error code");
  assert(!containsSecrets(invalidBody), "Blank challenge response redacts Slack token");

  const oversized = await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/slack/external-event", {
    method: "POST",
    body: JSON.stringify({
      type: "url_verification",
      token: "xoxb-phase99-secret",
      challenge: "x".repeat(2049),
    }),
  }), {
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });
  const oversizedBody = await readJson(oversized);
  assertEqual(oversized.status, 400, "Oversized Slack challenge fails closed");
  assertEqual(oversizedBody.errorCode, "slack_url_verification_invalid", "Oversized Slack challenge has stable error code");
  assert(!containsSecrets(oversizedBody), "Oversized challenge response redacts Slack token");
}

async function verifySlackEventsStillRequireHostAuth(): Promise<void> {
  section("3. Normal Slack Event Dispatch Still Requires Host Auth");

  const { bridge, adapter } = createSlackBridge();
  const authPolicy = createSlackAuth();
  const body = {
    type: "event_callback",
    token: "xoxb-phase99-secret",
    team_id: "T99",
    event: {
      type: "message",
      user: "U99",
      text: "private slack phase99 text",
      channel: "C99",
      ts: "171000.9900",
      thread_ts: "171000.9800",
      client_msg_id: "client-99",
    },
  };

  const missingHostAuth = await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/slack/external-event", {
    method: "POST",
    body: JSON.stringify(body),
  }), {
    bridge,
    authPolicy,
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });
  const missingHostAuthBody = await readJson(missingHostAuth);
  assertEqual(missingHostAuth.status, 403, "Normal Slack event still requires host auth proof");
  assertEqual(missingHostAuthBody.errorCode, "webhook_auth_failed", "Missing host auth has stable dispatch error code");
  assertEqual(adapter.sentMessages.length, 0, "Missing host auth does not dispatch to adapter");
  assert(!containsSecrets(missingHostAuthBody), "Missing host auth response redacts raw Slack event");

  const accepted = await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/slack/external-event", {
    method: "POST",
    headers: { "x-channel-secret": "phase99-host-secret" },
    body: JSON.stringify(body),
  }), {
    bridge,
    authPolicy,
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });
  const acceptedBody = await readJson(accepted);
  assertEqual(accepted.status, 202, "Normal Slack event dispatch still succeeds with host auth");
  assertEqual(acceptedBody.channel, "slack", "Accepted Slack event reports channel");
  assertEqual(acceptedBody.turnStatus, "deferred", "Accepted Slack event reports deferred bridge turn status");
  assertEqual(adapter.sentMessages.length, 0, "Accepted Slack event sends no adapter reply before ACK");
  await delay(5);
  assertEqual(adapter.sentMessages.length, 1, "Accepted Slack event dispatches one async adapter reply");
  assertEqual(adapter.sentMessages[0]?.target.threadId, "171000.9800", "Accepted Slack event preserves thread routing");
  assert(!containsSecrets(acceptedBody), "Accepted Slack event response redacts raw event text and secrets");
}

async function verifyNonSlackUrlVerificationNotSpecialCased(): Promise<void> {
  section("4. Non-Slack Events Are Not Challenge-Special-Cased");

  const telegram = await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/telegram/external-event", {
    method: "POST",
    body: JSON.stringify({
      type: "url_verification",
      token: "xoxb-phase99-secret",
      challenge: "phase99-slack-challenge",
    }),
  }), {
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });
  const body = await readJson(telegram);
  assertEqual(telegram.status, 500, "Telegram url_verification-shaped body is not treated as Slack challenge");
  assertEqual(body.errorCode, "missing_bridge", "Non-Slack url_verification follows normal dispatch failure path");
  assert(!containsSecrets(body), "Non-Slack challenge-shaped response redacts token");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 99 Verification (Slack URL Verification Handshake)\n");

  await verifySlackUrlVerificationAccepted();
  await verifySlackUrlVerificationFailClosed();
  await verifySlackEventsStillRequireHostAuth();
  await verifyNonSlackUrlVerificationNotSpecialCased();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 99: Slack URL verification handshake is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
