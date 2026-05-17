/** Phase 110 Verification - Slack Manifest Echo Integrity */

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

const CALLBACK_URL = "https://hooks.example.com/api/channels/slack/external-event";
const APP_CONFIG_TOKEN = "xapp-phase110-secret-token";
const SIGNING_SECRET_REF = "vault:phase110-slack-signing-secret";

function candidate(overrides: Partial<SlackSubscriptionCandidate> = {}): SlackSubscriptionCandidate {
  return {
    channelId: "slack",
    appId: "A110PHASE",
    workspaceId: "T110PHASE",
    callbackUrl: CALLBACK_URL,
    signingSecretRef: SIGNING_SECRET_REF,
    appConfigToken: APP_CONFIG_TOKEN,
    manifest: {
      display_information: { name: "Colony Phase 110" },
      oauth_config: { scopes: { bot: ["channels:history"] } },
      settings: { socket_mode_enabled: false },
    },
    enabled: true,
    eventTypes: ["message.channels"],
    ...overrides,
  };
}

async function approved(overrides: Partial<SlackSubscriptionCandidate> = {}): Promise<SlackSubscriptionCandidate> {
  const base = candidate(overrides);
  const signature = await createExternalChannelSubscriptionApprovalSignature(base);
  return { ...base, approval: { approvedBy: "operator", approvedAt: "2026-05-05T03:00:00.000Z", signature } };
}

function matchingManifest(events: string[] = ["message.channels"], requestUrl = CALLBACK_URL): Record<string, unknown> {
  return {
    display_information: { name: "Colony Phase 110" },
    settings: {
      event_subscriptions: {
        request_url: requestUrl,
        bot_events: events,
      },
    },
  };
}

function leaks(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes(APP_CONFIG_TOKEN) ||
    text.includes(SIGNING_SECRET_REF) ||
    text.includes(CALLBACK_URL) ||
    text.includes("token=plain-secret") ||
    text.includes("secret=plain-secret");
}

async function verifyManifestEchoSuccess(): Promise<void> {
  section("1. Slack Manifest Echo Integrity Success");
  const good = await approved();
  const result = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({
      ok: true,
      app_id: "A110PHASE",
      team_id: "T110PHASE",
      manifest: matchingManifest(),
    }), { status: 200 }),
  });

  assertEqual(result.isError, false, "matching manifest echo succeeds");
  assertEqual(result.data.responseAppIdMatched, true, "success still reports app identity match");
  assertEqual(result.data.responseWorkspaceMatched, true, "success still reports workspace identity match");
  assertEqual(result.data.responseManifestEventSubscriptionMatched, true, "success reports manifest echo match");
  assertEqual(result.data.mutatedSubscription, true, "success still reports mutation");
  assert(!leaks(result), "matching manifest echo result leaks no token, secret ref, or callback URL");
}

async function verifyManifestEchoOmittedCompatibility(): Promise<void> {
  section("2. Slack Manifest Echo Omission Remains Compatible");
  const good = await approved();
  const result = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, app_id: "A110PHASE", team_id: "T110PHASE" }), { status: 200 }),
  });

  assertEqual(result.isError, false, "Slack response without manifest echo still succeeds");
  assertEqual(result.data.responseManifestEventSubscriptionMatched, undefined, "absent manifest echo does not fabricate match metadata");
  assertEqual(result.data.mutatedSubscription, true, "absent manifest echo still reports mutation after identity match");
  assert(!leaks(result), "absent manifest echo result leaks no token, secret ref, or callback URL");
}

async function verifyManifestEchoMismatchesFailClosed(): Promise<void> {
  section("3. Slack Manifest Echo Mismatches Fail Closed");
  const good = await approved();
  const wrongRequestUrl = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, app_id: "A110PHASE", manifest: matchingManifest(["message.channels"], "https://evil.example.com/api/channels/slack/external-event") }), { status: 200 }),
  });
  const missingBotEvents = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, app_id: "A110PHASE", manifest: { settings: { event_subscriptions: { request_url: CALLBACK_URL } } } }), { status: 200 }),
  });
  const extraBotEvent = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, app_id: "A110PHASE", manifest: matchingManifest(["message.channels", "app_mention"]) }), { status: 200 }),
  });
  const duplicateBotEvent = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, app_id: "A110PHASE", manifest: matchingManifest(["message.channels", "message.channels"]) }), { status: 200 }),
  });
  const malformedManifest = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, app_id: "A110PHASE", manifest: "not-object token=plain-secret" }), { status: 200 }),
  });

  for (const result of [wrongRequestUrl, missingBotEvents, extraBotEvent, duplicateBotEvent, malformedManifest]) {
    assertEqual(result.isError, true, "manifest echo mismatch fails closed");
    assertEqual(result.data.reasonCode, "slack_manifest_update_response_manifest_mismatch", "manifest mismatch uses stable reason code");
    assertEqual(result.data.retryable, false, "manifest mismatch is non-retryable");
    assert(!("mutatedSubscription" in result.data), "manifest mismatch does not report mutation success");
    assert(!("retryWorkerId" in result.data), "manifest mismatch creates no retry worker");
    assert(!("retryScheduledAt" in result.data), "manifest mismatch creates no retry schedule");
    assert(!("responseManifestEventSubscriptionMatched" in result.data), "manifest mismatch does not report match metadata");
  }
  assert(!leaks([wrongRequestUrl, missingBotEvents, extraBotEvent, duplicateBotEvent, malformedManifest]), "manifest mismatch output leaks no token, secret ref, callback URL, or Slack detail secret");
}

async function verifyRetryStopsOnManifestEchoMismatch(): Promise<void> {
  section("4. Slack Bounded Retry Stops On Integrity Mismatch");
  const good = await approved();
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
      return new Response(JSON.stringify({ ok: true, app_id: "A110PHASE", manifest: matchingManifest(["app_mention"]) }), { status: 200 });
    },
  });

  assertEqual(calls, 2, "retry reaches second response once");
  assertEqual(result.isError, true, "manifest mismatch after retry fails closed");
  assertEqual(result.data.reasonCode, "slack_manifest_update_response_manifest_mismatch", "retry mismatch uses stable reason code");
  assertEqual(result.data.retryable, false, "retry mismatch remains non-retryable");
  assertEqual(result.data.automaticRetryMode, "bounded_foreground_retry", "bounded retry metadata reports the attempted retry");
  assertEqual(result.data.automaticRetryExhausted, true, "bounded retry reports exhaustion after integrity failure");
  assert(!("mutatedSubscription" in result.data), "retry mismatch does not report mutation success");
  assert(!leaks(result), "retry mismatch result leaks no token, secret ref, or callback URL");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 110 Verification (Slack Manifest Echo Integrity)\n");
  await verifyManifestEchoSuccess();
  await verifyManifestEchoOmittedCompatibility();
  await verifyManifestEchoMismatchesFailClosed();
  await verifyRetryStopsOnManifestEchoMismatch();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 110: Slack manifest echo integrity is GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });
