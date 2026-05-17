/** Phase 103 Verification - Discord Interactions PING/PONG Readiness */

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
  assert(actual === expected, `${label}${actual === expected ? "" : ` - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}\n  ${title}\n${"=".repeat(60)}`);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function containsSensitive(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("discord-token-phase103") ||
    text.includes("phase103-host-secret") ||
    text.includes("phase103-signature-secret") ||
    text.includes("private discord phase103 text") ||
    text.includes("raw malformed phase103");
}

function createDiscordBridge(): { bridge: ChannelSessionBridge; adapter: InMemoryChannelAdapter } {
  const registry = new ChannelRegistry();
  const adapter = new InMemoryChannelAdapter({ channelId: "discord" });
  registry.register(adapter);
  const bridge = new ChannelSessionBridge({
    registry,
    now: () => "2026-05-03T10:30:00.000Z",
    sessionRunner: async (request) => ({ text: `reply:${request.message.messageId}` }),
  });
  return { bridge, adapter };
}

function createDiscordAuth(): ChannelAuthPolicy {
  return new ChannelAuthPolicy({
    channels: {
      discord: {
        webhookSecret: "phase103-host-secret",
        groupPolicy: "open",
      },
    },
  });
}

async function verifyDiscordPingPongAccepted(): Promise<void> {
  section("1. Signed Discord Interactions PING");

  const { bridge, adapter } = createDiscordBridge();
  const authPolicy = createDiscordAuth();
  const verifierCalls: ChannelWebhookSignatureVerificationRequest[] = [];
  const response = await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/discord/external-event", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature-ed25519": "phase103-signature",
      "x-signature-timestamp": "1710000103",
    },
    body: JSON.stringify({
      type: 1,
      token: "discord-token-phase103",
      application_id: "103000000000000001",
    }),
  }), {
    bridge,
    authPolicy,
    vendorSignatureVerifier: (request) => {
      verifierCalls.push(request);
      return { accepted: true, code: "signature_verified", reason: "ok" };
    },
  });

  const body = await readJson(response);
  assertEqual(response.status, 200, "Discord PING returns HTTP 200");
  assertEqual(body.type, 1, "Discord PING returns PONG type 1");
  assertEqual(Object.keys(body).length, 1, "Discord PONG response contains only type");
  assertEqual(response.headers.get("content-type"), "application/json", "Discord PONG response is JSON");
  assertEqual(verifierCalls.length, 1, "Discord PING calls vendor signature verifier exactly once");
  assertEqual(verifierCalls[0]?.channelId, "discord", "Discord PING verifier receives normalized channel id");
  assert(String(verifierCalls[0]?.rawBody ?? "").includes("discord-token-phase103"), "Discord PING verifier receives exact raw body before parsing");
  assertEqual(bridge.status().routeCount, 0, "Discord PING does not dispatch to session bridge");
  assertEqual(adapter.sentMessages.length, 0, "Discord PING does not send adapter replies");
  assert(!containsSensitive(body), "Discord PONG response leaks no token or host secrets");
}

async function verifyDiscordPingFailClosed(): Promise<void> {
  section("2. Discord PING Fail-Closed Paths");

  const missingVerifier = await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/discord/external-event", {
    method: "POST",
    body: JSON.stringify({ type: 1, token: "discord-token-phase103" }),
  }));
  const missingVerifierBody = await readJson(missingVerifier);
  assertEqual(missingVerifier.status, 401, "Missing verifier rejects Discord PING");
  assertEqual(missingVerifierBody.errorCode, "missing_vendor_signature_verifier", "Missing verifier keeps stable error code");
  assert(!containsSensitive(missingVerifierBody), "Missing verifier response redacts Discord token");

  const rejectedSignature = await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/discord/external-event", {
    method: "POST",
    body: JSON.stringify({ type: 1, token: "discord-token-phase103" }),
  }), {
    vendorSignatureVerifier: () => ({ accepted: false, code: "signature_mismatch", reason: "bad phase103-signature-secret" }),
  });
  const rejectedBody = await readJson(rejectedSignature);
  assertEqual(rejectedSignature.status, 401, "Rejected verifier rejects Discord PING");
  assertEqual(rejectedBody.errorCode, "signature_mismatch", "Rejected verifier keeps stable error code");
  assert(!containsSensitive(rejectedBody), "Rejected verifier response redacts verifier-controlled secrets");

  const verifierException = await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/discord/external-event", {
    method: "POST",
    body: JSON.stringify({ type: 1, token: "discord-token-phase103" }),
  }), {
    vendorSignatureVerifier: () => { throw new Error("phase103-signature-secret"); },
  });
  const verifierExceptionBody = await readJson(verifierException);
  assertEqual(verifierException.status, 401, "Verifier exception rejects Discord PING");
  assertEqual(verifierExceptionBody.errorCode, "signature_verifier_failed", "Verifier exception keeps stable error code");
  assert(!containsSensitive(verifierExceptionBody), "Verifier exception response redacts thrown secrets");

  const malformedJson = await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/discord/external-event", {
    method: "POST",
    body: "{ raw malformed phase103 discord-token-phase103",
  }), {
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });
  const malformedJsonBody = await readJson(malformedJson);
  assertEqual(malformedJson.status, 400, "Malformed Discord PING JSON fails closed");
  assert(!containsSensitive(malformedJsonBody), "Malformed Discord JSON response redacts raw body");
}

async function verifyOnlyDiscordPingSpecialCased(): Promise<void> {
  section("3. Only Discord PING Is Special-Cased");

  const { bridge, adapter } = createDiscordBridge();
  const authPolicy = createDiscordAuth();
  const applicationCommand = await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/discord/external-event", {
    method: "POST",
    headers: { "x-channel-secret": "phase103-host-secret" },
    body: JSON.stringify({
      type: 2,
      token: "discord-token-phase103",
      id: "103000000000000002",
      channel_id: "103000000000000003",
      member: { user: { id: "103000000000000004", username: "Ada" } },
      data: { id: "103000000000000005", name: "colony", secret: "phase103-signature-secret" },
    }),
  }), {
    bridge,
    authPolicy,
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });
  const commandBody = await readJson(applicationCommand);
  assertEqual(applicationCommand.status, 200, "Discord application command uses Phase112 deferred ACK");
  assertEqual(commandBody.type, 5, "Discord application command returns ACK type 5");
  assertEqual(Object.keys(commandBody).length, 1, "Discord application command ACK contains only type");
  assertEqual(bridge.status().routeCount, 1, "Discord application command dispatches to bridge after PING special-case");
  assertEqual(adapter.sentMessages.length, 0, "Discord application command does not emit an unmatched adapter reply before ACK");
  assert(!containsSensitive(commandBody), "Discord application command ACK redacts token and command data");

  const slackPingShaped = await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/slack/external-event", {
    method: "POST",
    body: JSON.stringify({ type: 1, token: "discord-token-phase103" }),
  }), {
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });
  const slackPingBody = await readJson(slackPingShaped);
  assertEqual(slackPingShaped.status, 500, "Slack type-1 body is not treated as Discord PING");
  assertEqual(slackPingBody.errorCode, "missing_bridge", "Non-Discord type-1 follows normal dispatch failure path");
  assert(!containsSensitive(slackPingBody), "Non-Discord type-1 response redacts token");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 103 Verification (Discord Interactions PING/PONG Readiness)\n");
  await verifyDiscordPingPongAccepted();
  await verifyDiscordPingFailClosed();
  await verifyOnlyDiscordPingSpecialCased();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 103: Discord Interactions PING/PONG readiness is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
