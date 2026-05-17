/**
 * Phase 92 Verification Script - External Channel Registration and Inbound Signatures
 *
 * Covers the next Phase 6 channel slice:
 *   1. External Slack/Discord/Telegram adapters require exact operator approval before registration
 *   2. Registration plans and results redact credentials and avoid default live enablement
 *   3. Slack/Telegram inbound vendor signature checks fail closed and redact diagnostics
 *   4. Discord inbound signature verification requires an explicit verifier seam before acceptance
 *
 * Run: bun run src/verify-phase92.ts
 */

import {
  ChannelRegistry,
  createExternalChannelAdapterApprovalSignature,
  planExternalChannelAdapterRegistrations,
  registerApprovedExternalChannelAdapters,
  handleChannelWebhookRequest,
  verifyExternalChannelWebhookSignature,
  type ExternalChannelAdapterRegistrationCandidate,
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

interface CapturedFetchCall {
  input: string;
  init?: RequestInit;
}

function fakeFetch(response: unknown, status = 200, calls: CapturedFetchCall[] = []): typeof fetch {
  const impl = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify(response), {
      status,
      headers: { "content-type": "application/json" },
    });
  }, {
    preconnect: () => {},
  });
  return impl as typeof fetch;
}

async function verifyRegistrationPlanning(): Promise<void> {
  section("1. External Adapter Registration Planning");

  const candidates: ExternalChannelAdapterRegistrationCandidate[] = [
    {
      channelId: "slack",
      botToken: "xoxb-secret-registration-token",
      enabled: true,
      workspaceId: "T123",
    },
    {
      channelId: "telegram",
      botToken: "",
      enabled: true,
    },
    {
      channelId: "matrix" as "slack",
      botToken: "unsupported-secret-token",
      enabled: true,
    },
    {
      channelId: "discord",
      botToken: "discord-token",
      enabled: true,
      apiBaseUrl: "http://127.0.0.1:9999?token=bad-query-secret",
    },
  ];

  const plan = await planExternalChannelAdapterRegistrations(candidates);
  assertEqual(plan.length, 4, "Registration planning reports every candidate");
  assertEqual(plan[0]?.channelId, "slack", "Registration plan preserves normalized channel id");
  assertEqual(plan[0]?.accepted, false, "Registration plan requires approval before acceptance");
  assertEqual(plan[0]?.approvalRequired, true, "Registration plan exposes approval requirement");
  assert(plan[0]?.requiredSignature?.startsWith("channel-adapter:slack:") ?? false, "Registration plan exposes exact approval signature");
  assert(!JSON.stringify(plan).includes("xoxb-secret-registration-token"), "Registration plan redacts bot tokens");
  assertEqual(plan[1]?.accepted, false, "Registration plan rejects missing credential");
  assert(plan[1]?.reason?.includes("missing") ?? false, "Missing credential reason is explicit");
  assertEqual(plan[2]?.accepted, false, "Registration plan rejects unsupported channels");
  assert(!JSON.stringify(plan).includes("unsupported-secret-token"), "Rejected plan redacts unsupported candidate secret");
  assertEqual(plan[3]?.accepted, false, "Registration plan rejects unsafe API base URLs");
  assert(!JSON.stringify(plan).includes("bad-query-secret"), "Unsafe API base rejection redacts query secret");

  const implicitEnabled = await planExternalChannelAdapterRegistrations([{
    channelId: "slack",
    botToken: "xoxb-implicit-enabled-token",
  }]);
  assertEqual(implicitEnabled[0]?.accepted, false, "Registration requires explicit enabled true before live adapter approval");
}

async function verifyApprovedRegistration(): Promise<void> {
  section("2. Approved External Adapter Registration");

  const calls: CapturedFetchCall[] = [];
  const candidate: ExternalChannelAdapterRegistrationCandidate = {
    channelId: "slack",
    botToken: "xoxb-approved-token",
    enabled: true,
    workspaceId: "T123",
  };
  const signature = await createExternalChannelAdapterApprovalSignature(candidate);
  const registry = new ChannelRegistry();

  const denied = await registerApprovedExternalChannelAdapters(registry, [{
    ...candidate,
    approval: {
      approvedBy: "operator",
      signature: "channel-adapter:slack:wrong",
    },
  }], {
    fetchImpl: fakeFetch({ ok: true, ts: "171000.0001" }, 200, calls),
  });
  assertEqual(denied.registeredCount, 0, "Wrong approval signature registers no adapters");
  assertEqual(registry.status().channels.length, 0, "Wrong approval leaves registry empty");
  assert(!JSON.stringify(denied).includes("xoxb-approved-token"), "Denied registration result redacts token");

  const registered = await registerApprovedExternalChannelAdapters(registry, [{
    ...candidate,
    approval: {
      approvedBy: "operator",
      approvedAt: "2026-05-02T05:40:00.000Z",
      signature,
    },
  }], {
    fetchImpl: fakeFetch({ ok: true, ts: "171000.0002" }, 200, calls),
  });
  assertEqual(registered.registeredCount, 1, "Exact approval signature registers adapter");
  assertEqual(registry.status().channels.length, 1, "Approved registration adds one channel");
  assertEqual(registry.status().channels[0]?.channelId, "slack", "Registered adapter is Slack");
  assert(!JSON.stringify(registry.status()).includes("xoxb-approved-token"), "Registry status redacts approved token");

  const sent = await registry.send({
    channel: "slack",
    target: {
      agentId: "main",
      channel: "slack",
      targetKind: "channel",
      targetId: "C123",
    },
    text: "approved registration send",
  });
  assertEqual(sent.status, "sent", "Approved registered adapter can send through registry");
  assertEqual(calls.length, 1, "Approved send uses injected fetch");
}

async function slackSignature(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`v0:${timestamp}:${body}`),
  );
  return `v0=${Array.from(new Uint8Array(signed)).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function verifyInboundSignatures(): Promise<void> {
  section("3. Vendor Inbound Signature Verification");

  const body = JSON.stringify({ text: "hello signed slack" });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await slackSignature("slack-signing-secret", timestamp, body);

  const slackAccepted = await verifyExternalChannelWebhookSignature({
    channelId: "slack",
    body,
    headers: {
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": signature,
    },
    signingSecret: "slack-signing-secret",
    nowEpochSeconds: Number(timestamp),
  });
  assertEqual(slackAccepted.accepted, true, "Slack signature verifier accepts valid HMAC");
  assertEqual(slackAccepted.code, "signature_verified", "Slack valid signature reports verified code");

  const slackDenied = await verifyExternalChannelWebhookSignature({
    channelId: "slack",
    body,
    headers: {
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": "v0=bad-signature",
    },
    signingSecret: "slack-signing-secret",
    nowEpochSeconds: Number(timestamp),
  });
  assertEqual(slackDenied.accepted, false, "Slack signature verifier rejects bad HMAC");
  assert(!JSON.stringify(slackDenied).includes("slack-signing-secret"), "Slack signature failure redacts signing secret");

  const staleSlack = await verifyExternalChannelWebhookSignature({
    channelId: "slack",
    body,
    headers: {
      "x-slack-request-timestamp": "100",
      "x-slack-signature": signature,
    },
    signingSecret: "slack-signing-secret",
    nowEpochSeconds: 1_000,
  });
  assertEqual(staleSlack.accepted, false, "Slack signature verifier rejects stale timestamps");
  assertEqual(staleSlack.code, "stale_signature_timestamp", "Slack stale timestamp has stable code");

  const telegramAccepted = await verifyExternalChannelWebhookSignature({
    channelId: "telegram",
    body,
    headers: {
      "x-telegram-bot-api-secret-token": "telegram-webhook-secret",
    },
    signingSecret: "telegram-webhook-secret",
  });
  assertEqual(telegramAccepted.accepted, true, "Telegram secret-token verifier accepts exact header");

  const telegramDenied = await verifyExternalChannelWebhookSignature({
    channelId: "telegram",
    body,
    headers: {
      "x-telegram-bot-api-secret-token": "wrong",
    },
    signingSecret: "telegram-webhook-secret",
  });
  assertEqual(telegramDenied.accepted, false, "Telegram secret-token verifier rejects wrong header");
  assert(!JSON.stringify(telegramDenied).includes("telegram-webhook-secret"), "Telegram signature failure redacts secret");

  const discordWithoutVerifier = await verifyExternalChannelWebhookSignature({
    channelId: "discord",
    body,
    headers: {
      "x-signature-ed25519": "abcd",
      "x-signature-timestamp": "1234",
    },
    signingSecret: "discord-public-key",
  });
  assertEqual(discordWithoutVerifier.accepted, false, "Discord signature verifier fails closed without injected verifier");
  assertEqual(discordWithoutVerifier.code, "discord_verifier_required", "Discord missing verifier has stable code");

  const discordAccepted = await verifyExternalChannelWebhookSignature({
    channelId: "discord",
    body,
    headers: {
      "x-signature-ed25519": "abcd",
      "x-signature-timestamp": "1234",
    },
    signingSecret: "discord-public-key",
    discordVerifier: (request) =>
      request.signature === "abcd" &&
      request.timestamp === "1234" &&
      request.body === body &&
      request.publicKey === "discord-public-key",
  });
  assertEqual(discordAccepted.accepted, true, "Discord signature verifier accepts injected verifier approval");

  const discordThrown = await verifyExternalChannelWebhookSignature({
    channelId: "discord",
    body,
    headers: {
      "x-signature-ed25519": "abcd",
      "x-signature-timestamp": "1234",
    },
    signingSecret: "discord-public-key",
    discordVerifier: () => {
      throw new Error("verifier exploded with discord-public-key");
    },
  });
  assertEqual(discordThrown.accepted, false, "Discord verifier exceptions fail closed");
  assertEqual(discordThrown.code, "signature_verifier_failed", "Discord verifier exception has stable code");
  assert(!JSON.stringify(discordThrown).includes("discord-public-key"), "Discord verifier exception redacts public key details");
}

async function verifyHttpSignatureGate(): Promise<void> {
  section("4. HTTP Signature Gate");

  let verifierCalls = 0;
  const rejected = await handleChannelWebhookRequest(new Request("http://127.0.0.1/api/channels/slack/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  }), {
    vendorSignatureVerifier: (request) => {
      verifierCalls += 1;
      assertEqual(request.rawBody, "{", "HTTP signature gate receives raw body before JSON parse");
      return Promise.resolve({
        accepted: false,
        code: "signature_mismatch",
        reason: "bad signature with slack-signing-secret",
      });
    },
  });
  const rejectedBody = await rejected.json() as Record<string, unknown>;
  assertEqual(rejected.status, 401, "HTTP signature failure is rejected before JSON parsing");
  assertEqual(rejectedBody.errorCode, "signature_mismatch", "HTTP signature failure preserves stable code");
  assert(!JSON.stringify(rejectedBody).includes("slack-signing-secret"), "HTTP signature failure response redacts verifier details");
  assertEqual(verifierCalls, 1, "HTTP signature verifier is called once");

  const acceptedMalformed = await handleChannelWebhookRequest(new Request("http://127.0.0.1/api/channels/slack/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  }), {
    vendorSignatureVerifier: () => Promise.resolve({
      accepted: true,
      code: "signature_verified",
      reason: "verified",
    }),
  });
  const acceptedMalformedBody = await acceptedMalformed.json() as Record<string, unknown>;
  assertEqual(acceptedMalformed.status, 400, "Valid signature then malformed JSON returns malformed JSON");
  assert(String(acceptedMalformedBody.error ?? "").includes("Malformed JSON"), "Malformed JSON remains explicit after valid signature");

  const thrown = await handleChannelWebhookRequest(new Request("http://127.0.0.1/api/channels/slack/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true }),
  }), {
    vendorSignatureVerifier: () => {
      throw new Error("verifier exploded with slack-signing-secret");
    },
  });
  const thrownBody = await thrown.json() as Record<string, unknown>;
  assertEqual(thrown.status, 401, "HTTP signature verifier exceptions fail closed");
  assertEqual(thrownBody.errorCode, "signature_verifier_failed", "HTTP verifier exception has stable code");
  assert(!JSON.stringify(thrownBody).includes("slack-signing-secret"), "HTTP verifier exception response redacts details");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 92 Verification (External Channel Registration + Signatures)\n");

  await verifyRegistrationPlanning();
  await verifyApprovedRegistration();
  await verifyInboundSignatures();
  await verifyHttpSignatureGate();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 92: external channel registration and signatures are GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
