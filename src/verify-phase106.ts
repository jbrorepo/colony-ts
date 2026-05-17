/** Phase 106 Verification - Slack Subscription Bounded Inline Retry */

import {
  createExternalChannelSubscriptionApprovalSignature,
  executeExternalChannelSubscriptionSetupHostRequest,
  planExternalChannelSubscriptions,
  type ExternalChannelSubscriptionCandidate,
} from "./channel";
import { buildChannelsCommandPayload } from "./gateway-channels";

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
const APP_CONFIG_TOKEN = "xapp-phase106-secret-token";
const SIGNING_SECRET_REF = "vault:phase106-slack-signing-secret";
const DISCORD_BOT_TOKEN = "Bot phase106-discord-token-secret";
const PUBLIC_KEY_REF = "vault:phase106-discord-public-key-ref";

function slackCandidate(overrides: Partial<SlackSubscriptionCandidate> = {}): SlackSubscriptionCandidate {
  return {
    channelId: "slack",
    appId: "A106PHASE",
    workspaceId: "T106PHASE",
    callbackUrl: SLACK_CALLBACK_URL,
    signingSecretRef: SIGNING_SECRET_REF,
    appConfigToken: APP_CONFIG_TOKEN,
    manifest: {
      display_information: { name: "Colony Phase 106" },
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
    applicationId: "106000000000000001",
    guildId: "106000000000000002",
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
  return { ...base, approval: { approvedBy: "operator", approvedAt: "2026-05-04T06:00:00.000Z", signature } };
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

async function verifySlackInlineRetrySuccess(): Promise<void> {
  section("1. Slack Explicit Inline Retry Can Recover Once");
  const good = await approved(slackCandidate());
  let calls = 0;
  const result = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    slackRetryPolicy: { mode: "host_inline_bounded", maxAttempts: 2 },
    fetchImpl: async () => {
      calls++;
      if (calls === 1) {
        return new Response(JSON.stringify({ ok: false, error: "unavailable token=plain-secret" }), { status: 503 });
      }
      return new Response(JSON.stringify({ ok: true, app_id: "A106PHASE", team_id: "T106PHASE" }), { status: 200 });
    },
  });

  assertEqual(result.isError, false, "Slack inline retry recovers to success");
  assertEqual(calls, 2, "Slack inline retry performs exactly one retry");
  assertEqual(result.data.automaticRetryMode, "bounded_foreground_retry", "success reports bounded foreground retry mode");
  assertEqual(result.data.attemptCount, 2, "success reports total attempt count");
  assertEqual(result.data.retryAttemptCount, 1, "success reports retry count");
  assertEqual(result.data.maxAttemptCount, 2, "success reports configured max attempts");
  assert(!("retryWorkerId" in result.data), "success creates no retry worker");
  assert(!("retryScheduledAt" in result.data), "success creates no retry schedule");
  assert(String(result.output).includes("No background retry worker"), "success output excludes background worker");
  assert(!leaks(result), "success retry result leaks no token, secret ref, or callback URL");
}

async function verifySlackInlineRetryExhaustion(): Promise<void> {
  section("2. Slack Inline Retry Is Bounded And Falls Back To Manual Guidance");
  const good = await approved(slackCandidate());
  let calls = 0;
  const result = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    slackRetryPolicy: { mode: "host_inline_bounded", maxAttempts: 99 },
    fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify({ ok: false, error: "ratelimited token=plain-secret" }), {
        status: 429,
        headers: { "retry-after": "999999" },
      });
    },
  });

  assertEqual(result.isError, true, "Slack exhausted retry fails closed");
  assertEqual(calls, 2, "Slack inline retry clamps max attempts to two");
  assertEqual(result.data.retryable, true, "exhausted retry remains retryable for operator");
  assertEqual(result.data.retryMode, "manual_operator_reinvoke", "exhausted retry keeps manual operator reinvoke mode");
  assertEqual(result.data.automaticRetryMode, "bounded_foreground_retry", "exhausted retry reports automatic retry mode");
  assertEqual(result.data.automaticRetryExhausted, true, "exhausted retry is explicit");
  assertEqual(result.data.attemptCount, 2, "exhausted retry reports bounded attempts");
  assertEqual(result.data.retryAttemptCount, 1, "exhausted retry reports one retry attempt");
  assertEqual(result.data.retryAfterSeconds, 86400, "exhausted retry preserves bounded Retry-After seconds");
  assert(!("retryWorkerId" in result.data), "exhausted retry creates no retry worker");
  assert(!("retryScheduledAt" in result.data), "exhausted retry creates no retry schedule");
  assert(String(result.output).includes("No retry schedule"), "exhausted retry output excludes retry schedule");
  assert(!leaks(result), "exhausted retry result leaks no token, secret ref, or callback URL");
}

async function verifySlackDefaultStillManualOnly(): Promise<void> {
  section("3. Slack Default Remains Manual-Only");
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

  assertEqual(result.isError, true, "default Slack setup fails closed");
  assertEqual(calls, 1, "default Slack setup does not automatically retry");
  assertEqual(result.data.retryMode, "manual_operator_reinvoke", "default still exposes manual retry mode");
  assert(!("automaticRetryMode" in result.data), "default does not expose automatic retry mode");
  assert(!("attemptCount" in result.data), "default does not expose retry attempt counters");
  assert(!leaks(result), "default manual retry leaks no token, secret ref, or callback URL");
}

async function verifySlackFetchRejectionRetry(): Promise<void> {
  section("4. Slack Fetch Rejection Can Retry Once");
  const good = await approved(slackCandidate());
  let calls = 0;
  const result = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    slackRetryPolicy: { mode: "host_inline_bounded", maxAttempts: 2 },
    fetchImpl: async () => {
      calls++;
      if (calls === 1) throw new Error("network token=plain-secret");
      return new Response(JSON.stringify({ ok: true, app_id: "A106PHASE", team_id: "T106PHASE" }), { status: 200 });
    },
  });

  assertEqual(result.isError, false, "Slack fetch rejection retry recovers to success");
  assertEqual(calls, 2, "Slack fetch rejection retries exactly once");
  assertEqual(result.data.automaticRetryMode, "bounded_foreground_retry", "fetch rejection success reports bounded foreground retry mode");
  assertEqual(result.data.retryAttemptCount, 1, "fetch rejection success reports one retry attempt");
  assert(!leaks(result), "fetch rejection retry leaks no thrown secret, token, secret ref, or callback URL");
}

async function verifySlackNonRetryableDoesNotRetry(): Promise<void> {
  section("5. Slack Non-Retryable Failures Do Not Retry Even With Policy");
  const good = await approved(slackCandidate());
  let calls = 0;
  const result = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    slackRetryPolicy: { mode: "host_inline_bounded", maxAttempts: 3 },
    fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify({ ok: false, error: "invalid_auth token=plain-secret" }), { status: 401 });
    },
  });

  assertEqual(result.isError, true, "non-retryable Slack failure fails closed");
  assertEqual(calls, 1, "non-retryable Slack failure does not retry");
  assertEqual(result.data.retryable, false, "non-retryable Slack failure remains non-retryable");
  assert(!("automaticRetryMode" in result.data), "non-retryable Slack failure does not report automatic retry");
  assert(!String(result.output).includes("Automatic retry"), "non-retryable output does not claim automatic retry");
  assert(!leaks(result), "non-retryable failure leaks no token, secret ref, or callback URL");
}

async function verifyApprovalFailurePreventsRetryFetch(): Promise<void> {
  section("6. Approval Failure Prevents Retry Fetch");
  const pending = slackCandidate();
  let calls = 0;
  const result = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [pending],
    slackRetryPolicy: { mode: "host_inline_bounded", maxAttempts: 2 },
    fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify({ ok: true, app_id: "A106PHASE", team_id: "T106PHASE" }), { status: 200 });
    },
  });

  assertEqual(result.isError, true, "pending approval fails closed");
  assertEqual(calls, 0, "pending approval performs no fetch and no retry");
  assert(!("automaticRetryMode" in result.data), "pending approval exposes no automatic retry metadata");
  assert(!leaks(result), "pending approval retry policy leaks no token, secret ref, or callback URL");
}

async function verifyDiscordIgnoresSlackRetryPolicy(): Promise<void> {
  section("7. Discord Ignores Slack Retry Policy");
  const good = await approved(discordCandidate());
  let calls = 0;
  const result = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    slackRetryPolicy: { mode: "host_inline_bounded", maxAttempts: 3 },
    fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify({ message: "limited token=plain-secret" }), { status: 429 });
    },
  });

  assertEqual(result.isError, true, "Discord 429 still fails closed");
  assertEqual(calls, 1, "Discord does not use Slack retry policy");
  assertEqual(result.data.retryable, true, "Discord keeps existing retryable classification");
  assert(!("automaticRetryMode" in result.data), "Discord gets no Slack automatic retry metadata");
  assert(!("retryMode" in result.data), "Discord gets no Slack manual retry metadata");
  assert(!leaks(result), "Discord retry-policy regression leaks no token, public-key ref, or callback URL");
}

async function verifyGatewayActionUnchanged(): Promise<void> {
  section("8. Gateway Subscription Action Remains Credential-Free");
  const good = await approved(slackCandidate());
  const signature = await createExternalChannelSubscriptionApprovalSignature(good);
  const plans = await planExternalChannelSubscriptions([good]);
  const payload = buildChannelsCommandPayload(["external", "subscribe", "slack", signature], { externalSubscriptions: plans });

  assertEqual(payload.isError, undefined, "gateway subscription command remains accepted");
  assertEqual(payload.action?.kind, "setup_external_channel_subscription", "gateway emits same setup action kind");
  assertEqual(payload.action?.channelId, "slack", "gateway action carries channel id");
  assertEqual(Object.keys(payload.action ?? {}).length, 2, "gateway action still carries only kind and channel id");
  assert(payload.output.includes("does not create Slack apps"), "gateway output preserves no app-creation claim");
  assert(payload.output.includes("run retries"), "gateway output still says gateway does not run retries");
  assert(!leaks(payload), "gateway retry regression leaks no token, secret ref, or callback URL");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 106 Verification (Slack Subscription Bounded Inline Retry)\n");
  await verifySlackInlineRetrySuccess();
  await verifySlackInlineRetryExhaustion();
  await verifySlackDefaultStillManualOnly();
  await verifySlackFetchRejectionRetry();
  await verifySlackNonRetryableDoesNotRetry();
  await verifyApprovalFailurePreventsRetryFetch();
  await verifyDiscordIgnoresSlackRetryPolicy();
  await verifyGatewayActionUnchanged();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 106: Slack subscription bounded inline retry is GREEN.");
}
main().catch((error) => { console.error(error); process.exit(1); });
