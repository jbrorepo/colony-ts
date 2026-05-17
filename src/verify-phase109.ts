/** Phase 109 Verification - Slack Subscription Response Identity Binding */

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
const APP_CONFIG_TOKEN = "xapp-phase109-secret-token";
const SIGNING_SECRET_REF = "vault:phase109-slack-signing-secret";

function candidate(overrides: Partial<SlackSubscriptionCandidate> = {}): SlackSubscriptionCandidate {
  return {
    channelId: "slack",
    appId: "A109PHASE",
    workspaceId: "T109PHASE",
    callbackUrl: CALLBACK_URL,
    signingSecretRef: SIGNING_SECRET_REF,
    appConfigToken: APP_CONFIG_TOKEN,
    manifest: {
      display_information: { name: "Colony Phase 109" },
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
  return { ...base, approval: { approvedBy: "operator", approvedAt: "2026-05-05T01:50:00.000Z", signature } };
}

function leaks(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes(APP_CONFIG_TOKEN) ||
    text.includes(SIGNING_SECRET_REF) ||
    text.includes(CALLBACK_URL) ||
    text.includes("token=plain-secret") ||
    text.includes("secret=plain-secret");
}

async function verifyMatchingIdentitySuccess(): Promise<void> {
  section("1. Slack Matching Response Identity Succeeds");
  const good = await approved();
  const result = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, app_id: "A109PHASE", team_id: "T109PHASE" }), { status: 200 }),
  });

  assertEqual(result.isError, false, "matching Slack response identity succeeds");
  assertEqual(result.data.responseAppIdMatched, true, "success reports app id match");
  assertEqual(result.data.responseWorkspaceMatched, true, "success reports workspace/team match");
  assertEqual(result.data.mutatedSubscription, true, "success still reports mutation");
  assert(!leaks(result), "matching identity success leaks no token, secret ref, or callback URL");
}

async function verifyIdentityMismatchesFailClosed(): Promise<void> {
  section("2. Slack Response Identity Mismatches Fail Closed");
  const good = await approved();
  const missingApp = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, team_id: "T109PHASE", detail: "token=plain-secret" }), { status: 200 }),
  });
  const nonStringApp = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, app_id: 109, team_id: "T109PHASE", detail: "token=plain-secret" }), { status: 200 }),
  });
  const wrongApp = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, app_id: "AOTHER", team_id: "T109PHASE", detail: "token=plain-secret" }), { status: 200 }),
  });
  const wrongTeam = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, app_id: "A109PHASE", team_id: "TOTHER", detail: "token=plain-secret" }), { status: 200 }),
  });
  const wrongWorkspace = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, app_id: "A109PHASE", workspace_id: "TOTHER", detail: "token=plain-secret" }), { status: 200 }),
  });
  const wrongTeamObject = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, app_id: "A109PHASE", team: { id: "TOTHER" }, detail: "token=plain-secret" }), { status: 200 }),
  });
  const wrongTeamString = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, app_id: "A109PHASE", team: "TOTHER", detail: "token=plain-secret" }), { status: 200 }),
  });

  for (const result of [missingApp, nonStringApp, wrongApp, wrongTeam, wrongWorkspace, wrongTeamObject, wrongTeamString]) {
    assertEqual(result.isError, true, "identity mismatch fails closed");
    assertEqual(result.data.reasonCode, "slack_manifest_update_response_identity_mismatch", "identity mismatch uses stable reason code");
    assertEqual(result.data.retryable, false, "identity mismatch is non-retryable");
    assert(!("mutatedSubscription" in result.data), "identity mismatch does not report mutation success");
    assert(!("retryWorkerId" in result.data), "identity mismatch creates no retry worker");
    assert(!("retryScheduledAt" in result.data), "identity mismatch creates no retry schedule");
  }
  assert(!leaks([missingApp, nonStringApp, wrongApp, wrongTeam, wrongWorkspace, wrongTeamObject, wrongTeamString]), "identity mismatch output leaks no token, secret ref, or callback URL");
}

async function verifyOptionalWorkspaceIdentityRegression(): Promise<void> {
  section("3. Slack Response With App Identity But No Workspace Still Succeeds");
  const good = await approved();
  const result = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, app_id: "A109PHASE" }), { status: 200 }),
  });

  assertEqual(result.isError, false, "Slack response with app id but absent workspace still succeeds");
  assertEqual(result.data.responseAppIdMatched, true, "matching app id still reports match metadata");
  assertEqual(result.data.responseWorkspaceMatched, undefined, "absent workspace id does not fabricate match metadata");
  assert(!leaks(result), "optional workspace response success leaks no token, secret ref, or callback URL");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 109 Verification (Slack Subscription Response Identity Binding)\n");
  await verifyMatchingIdentitySuccess();
  await verifyIdentityMismatchesFailClosed();
  await verifyOptionalWorkspaceIdentityRegression();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 109: Slack subscription response identity binding is GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });
