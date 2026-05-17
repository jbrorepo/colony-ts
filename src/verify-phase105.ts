/** Phase 105 Verification - Slack Subscription Manual Retry UX Metadata */

import {
  createExternalChannelSubscriptionApprovalSignature,
  executeExternalChannelSubscriptionSetupHostRequest,
  type ExternalChannelSubscriptionCandidate,
} from "./channel";

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string): void {
  if (condition) { console.log(`  PASS ${label}`); passed++; } else { console.error(`  FAIL ${label}`); failed++; }
}
function assertEqual<T>(actual: T, expected: T, label: string): void {
  assert(actual === expected, `${label}${actual === expected ? "" : ` - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}
function section(title: string): void { console.log(`\n${"=".repeat(60)}\n  ${title}\n${"=".repeat(60)}`); }

type SlackSubscriptionCandidate = ExternalChannelSubscriptionCandidate & {
  appConfigToken?: string;
  manifest?: Record<string, unknown>;
};

type DiscordSubscriptionCandidate = ExternalChannelSubscriptionCandidate & {
  discordBotToken?: string;
};

const SLACK_CALLBACK_URL = "https://hooks.example.com/api/channels/slack/external-event";
const DISCORD_CALLBACK_URL = "https://hooks.example.com/api/channels/discord/external-event";
const APP_CONFIG_TOKEN = "xapp-phase105-secret-token";
const SIGNING_SECRET_REF = "vault:phase105-slack-signing-secret";
const DISCORD_BOT_TOKEN = "Bot phase105-discord-token-secret";
const PUBLIC_KEY_REF = "vault:phase105-discord-public-key-ref";

function slackCandidate(overrides: Partial<SlackSubscriptionCandidate> = {}): SlackSubscriptionCandidate {
  return {
    channelId: "slack",
    appId: "A105PHASE",
    workspaceId: "T105PHASE",
    callbackUrl: SLACK_CALLBACK_URL,
    signingSecretRef: SIGNING_SECRET_REF,
    appConfigToken: APP_CONFIG_TOKEN,
    manifest: {
      display_information: { name: "Colony Phase 105" },
      oauth_config: { scopes: { bot: ["channels:history"] } },
      settings: { socket_mode_enabled: false },
    },
    enabled: true,
    eventTypes: ["message.channels"],
    ...overrides,
  };
}

function discordCandidate(overrides: Partial<DiscordSubscriptionCandidate> = {}): DiscordSubscriptionCandidate {
  return {
    channelId: "discord",
    applicationId: "105000000000000001",
    guildId: "105000000000000002",
    callbackUrl: DISCORD_CALLBACK_URL,
    publicKeyRef: PUBLIC_KEY_REF,
    discordBotToken: DISCORD_BOT_TOKEN,
    enabled: true,
    eventTypes: ["PING", "APPLICATION_COMMAND"],
    ...overrides,
  };
}

async function approved<T extends ExternalChannelSubscriptionCandidate>(base: T): Promise<T> {
  const signature = await createExternalChannelSubscriptionApprovalSignature(base);
  return { ...base, approval: { approvedBy: "operator", approvedAt: "2026-05-04T05:00:00.000Z", signature } };
}

function leaks(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes(APP_CONFIG_TOKEN) ||
    text.includes(SIGNING_SECRET_REF) ||
    text.includes(SLACK_CALLBACK_URL) ||
    text.includes(DISCORD_BOT_TOKEN) ||
    text.includes(PUBLIC_KEY_REF) ||
    text.includes(DISCORD_CALLBACK_URL) ||
    text.includes("token=plain-secret");
}

async function verifySlack429ManualRetryUx(): Promise<void> {
  section("1. Slack 429 With Retry-After Exposes Manual Retry UX");
  const good = await approved(slackCandidate());
  let calls = 0;
  const result = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify({ ok: false, error: "ratelimited token=plain-secret" }), {
        status: 429,
        headers: { "retry-after": "42" },
      });
    },
  });

  assertEqual(result.isError, true, "Slack 429 fails closed");
  assertEqual(calls, 1, "Slack 429 performs no automatic retry");
  assertEqual(result.data.reasonCode, "slack_manifest_update_response_rejected", "Slack 429 keeps stable reason code");
  assertEqual(result.data.retryable, true, "Slack 429 remains retryable");
  assertEqual(result.data.retryMode, "manual_operator_reinvoke", "Slack 429 exposes manual retry mode");
  assertEqual(result.data.retryReason, "rate_limited", "Slack 429 exposes rate-limit retry reason");
  assertEqual(result.data.retryAfterSeconds, 42, "Slack 429 exposes bounded Retry-After seconds");
  assertEqual(result.data.nextOperatorAction, "Re-run the approved Slack subscription setup after checking host-owned credentials and Slack availability.", "Slack 429 exposes next operator action");
  assert(String(result.output).includes("No automatic retry was attempted"), "Slack 429 output states no automatic retry");
  assert(!leaks(result), "Slack 429 retry UX leaks no token, secret ref, or callback URL");
}

async function verifySlack503ManualRetryUx(): Promise<void> {
  section("2. Slack 503 Exposes Manual Retry UX Without Worker");
  const good = await approved(slackCandidate());
  let calls = 0;
  const result = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify({ ok: false, error: "unavailable token=plain-secret" }), { status: 503 });
    },
  });

  assertEqual(result.isError, true, "Slack 503 fails closed");
  assertEqual(calls, 1, "Slack 503 performs no automatic retry");
  assertEqual(result.data.retryable, true, "Slack 503 remains retryable");
  assertEqual(result.data.retryMode, "manual_operator_reinvoke", "Slack 503 exposes manual retry mode");
  assertEqual(result.data.retryReason, "server_error", "Slack 503 exposes server-error retry reason");
  assert(!("retryScheduledAt" in result.data), "Slack 503 does not schedule retry");
  assert(!("retryWorkerId" in result.data), "Slack 503 does not create retry worker");
  assert(String(result.output).includes("No background retry worker"), "Slack 503 output excludes background worker");
  assert(!leaks(result), "Slack 503 retry UX leaks no token, secret ref, or callback URL");

  const malformed = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response("not json token=plain-secret", {
      status: 503,
      headers: { "retry-after": "999999" },
    }),
  });
  assertEqual(malformed.data.reasonCode, "slack_manifest_update_response_malformed", "Slack 503 malformed body keeps malformed response code");
  assertEqual(malformed.data.retryable, true, "Slack 503 malformed body remains retryable");
  assertEqual(malformed.data.retryMode, "manual_operator_reinvoke", "Slack 503 malformed body exposes manual retry mode");
  assertEqual(malformed.data.retryReason, "server_error", "Slack 503 malformed body exposes server-error retry reason");
  assertEqual(malformed.data.retryAfterSeconds, 86400, "Slack 503 malformed Retry-After is clamped");
  assert(!leaks(malformed), "Slack 503 malformed retry UX leaks no token, secret ref, or callback URL");

  const nonObject = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify(["token=plain-secret"]), {
      status: 503,
      headers: { "retry-after": "7" },
    }),
  });
  assertEqual(nonObject.data.reasonCode, "slack_manifest_update_response_malformed", "Slack 503 non-object body keeps malformed response code");
  assertEqual(nonObject.data.retryable, true, "Slack 503 non-object body remains retryable");
  assertEqual(nonObject.data.retryMode, "manual_operator_reinvoke", "Slack 503 non-object body exposes manual retry mode");
  assertEqual(nonObject.data.retryReason, "server_error", "Slack 503 non-object body exposes server-error retry reason");
  assertEqual(nonObject.data.retryAfterSeconds, 7, "Slack 503 non-object Retry-After is exposed");
  assert(!leaks(nonObject), "Slack 503 non-object retry UX leaks no token, secret ref, or callback URL");
}

async function verifySlackFetchRejectionManualRetryUx(): Promise<void> {
  section("3. Slack Fetch Rejection Exposes Manual Retry UX");
  const good = await approved(slackCandidate());
  let calls = 0;
  const result = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => {
      calls++;
      throw new Error("network token=plain-secret");
    },
  });

  assertEqual(result.isError, true, "Slack fetch rejection fails closed");
  assertEqual(calls, 1, "Slack fetch rejection performs no automatic retry");
  assertEqual(result.data.reasonCode, "slack_manifest_update_request_failed", "Slack fetch rejection keeps stable reason code");
  assertEqual(result.data.retryable, true, "Slack fetch rejection remains retryable");
  assertEqual(result.data.retryMode, "manual_operator_reinvoke", "Slack fetch rejection exposes manual retry mode");
  assertEqual(result.data.retryReason, "fetch_rejected", "Slack fetch rejection exposes retry reason");
  assert(!leaks(result), "Slack fetch rejection retry UX leaks no thrown secret");
}

async function verifySlackNonRetryableNoRetryUx(): Promise<void> {
  section("4. Slack Non-Retryable API Errors Do Not Expose Retry UX");
  const good = await approved(slackCandidate());
  const result = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ ok: false, error: "invalid_auth token=plain-secret" }), { status: 401 }),
  });

  assertEqual(result.isError, true, "Slack 401 fails closed");
  assertEqual(result.data.retryable, false, "Slack 401 reports non-retryable");
  assert(!("retryMode" in result.data), "Slack 401 does not expose retry mode");
  assert(!("retryReason" in result.data), "Slack 401 does not expose retry reason");
  assert(!("retryAfterSeconds" in result.data), "Slack 401 does not expose retry-after metadata");
  assert(!String(result.output).includes("Re-run the approved Slack subscription setup"), "Slack 401 output does not recommend retry");
  assert(!leaks(result), "Slack 401 result leaks no token, secret ref, or callback URL");
}

async function verifyDiscordUnchanged(): Promise<void> {
  section("5. Discord Regression Guard");
  const good = await approved(discordCandidate());
  const rateLimited = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ message: "limited token=plain-secret" }), { status: 429 }),
  });
  const unauthorized = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ message: "unauthorized token=plain-secret" }), { status: 401 }),
  });

  assertEqual(rateLimited.data.retryable, true, "Discord 429 keeps existing retryable classification");
  assertEqual(unauthorized.data.retryable, false, "Discord 401 keeps existing non-retryable classification");
  assert(!("retryMode" in rateLimited.data), "Discord 429 does not get Slack retry mode");
  assert(!("retryReason" in rateLimited.data), "Discord 429 does not get Slack retry reason");
  assert(!String(rateLimited.output).includes("Slack"), "Discord 429 output does not get Slack retry copy");
  assert(!leaks([rateLimited, unauthorized]), "Discord regression results leak no token, public-key ref, or callback URL");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 105 Verification (Slack Subscription Manual Retry UX Metadata)\n");
  await verifySlack429ManualRetryUx();
  await verifySlack503ManualRetryUx();
  await verifySlackFetchRejectionManualRetryUx();
  await verifySlackNonRetryableNoRetryUx();
  await verifyDiscordUnchanged();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 105: Slack subscription manual retry UX metadata is GREEN.");
}
main().catch((error) => { console.error(error); process.exit(1); });
