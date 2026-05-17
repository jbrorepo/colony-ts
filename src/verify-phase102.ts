/** Phase 102 Verification - Slack Subscription Direct Mutation Host Executor */

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

const CALLBACK_URL = "https://hooks.example.com/api/channels/slack/external-event";
const APP_CONFIG_TOKEN = "xapp-phase102-secret-token";
const SIGNING_SECRET_REF = "vault:phase102-slack-signing-secret";

function candidate(overrides: Partial<SlackSubscriptionCandidate> = {}): SlackSubscriptionCandidate {
  return {
    channelId: "slack",
    appId: "A102PHASE",
    workspaceId: "T102PHASE",
    callbackUrl: CALLBACK_URL,
    signingSecretRef: SIGNING_SECRET_REF,
    appConfigToken: APP_CONFIG_TOKEN,
    manifest: {
      display_information: { name: "Colony Phase 102" },
      features: { bot_user: { display_name: "colony", always_online: false } },
      oauth_config: { scopes: { bot: ["channels:history"] } },
      settings: { org_deploy_enabled: false, socket_mode_enabled: false },
    },
    enabled: true,
    eventTypes: ["message.channels"],
    ...overrides,
  };
}

async function approved(overrides: Partial<SlackSubscriptionCandidate> = {}): Promise<SlackSubscriptionCandidate> {
  const base = candidate(overrides);
  const signature = await createExternalChannelSubscriptionApprovalSignature(base);
  return { ...base, approval: { approvedBy: "operator", approvedAt: "2026-05-03T08:00:00.000Z", signature } };
}

function leaks(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes(APP_CONFIG_TOKEN) ||
    text.includes(SIGNING_SECRET_REF) ||
    text.includes("phase102-raw-token") ||
    text.includes("token=plain-secret") ||
    text.includes("secret=plain-secret") ||
    text.includes(CALLBACK_URL);
}

async function verifySuccess(): Promise<void> {
  section("1. Slack Manifest Update Success");
  const good = await approved();
  const [approvalPlan] = await planExternalChannelSubscriptions([candidate()]);
  const manifestInspection = approvalPlan?.redactedConfig.slackManifestInspection as Record<string, unknown> | undefined;
  assertEqual(manifestInspection?.fullManifestBoundInApproval, true, "approval surface says full manifest is approval-bound");
  assertEqual(manifestInspection?.plannedHostManifestUpdateSubmission, true, "approval surface says full manifest update is planned for host submission");
  assert(Array.isArray(manifestInspection?.mutationScope) && manifestInspection.mutationScope.includes("settings.event_subscriptions.request_url"), "approval surface exposes bounded mutation scope");
  assert(Array.isArray(manifestInspection?.oauthBotScopes) && manifestInspection.oauthBotScopes.includes("channels:history"), "approval surface exposes existing OAuth bot scopes");
  assert(!leaks(manifestInspection), "approval manifest inspection leaks no token, secret ref, or callback URL");
  const overview = buildChannelsCommandPayload(["external"], { externalSubscriptions: [approvalPlan!] });
  assert(overview.output.includes("fullManifestBoundInApproval:true"), "rendered /channels output exposes manifest approval binding");
  assert(overview.output.includes("plannedHostManifestUpdateSubmission:true"), "rendered /channels output exposes planned manifest update submission");
  assert(!overview.output.includes("fullManifestUpdateSubmittedToSlack:true"), "rendered /channels output avoids submitted-before-execution overclaim");
  assert(overview.output.includes("settings.event_subscriptions.request_url"), "rendered /channels output exposes manifest mutation scope");
  assert(overview.output.includes("channels:history"), "rendered /channels output exposes existing OAuth scopes");
  assert(!overview.output.includes("slackManifestInspection={redacted-object}"), "rendered /channels output does not collapse manifest inspection");
  assert(!leaks(overview), "rendered /channels manifest inspection leaks no token, secret ref, or callback URL");

  const secretKeyManifest = candidate({
    manifest: {
      "token=plain-secret": "safe-value",
      "secret=plain-secret": "safe-value",
      settings: { event_subscriptions: { "api_key=plain-secret": true } },
    },
  });
  const [secretKeyPlan] = await planExternalChannelSubscriptions([secretKeyManifest]);
  assert(!leaks(secretKeyPlan), "manifest inspection redacts secret-shaped manifest keys");

  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ ok: true, app_id: "A102PHASE", permissions_updated: false }), { status: 200 });
  };

  const result = await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "slack", candidates: [good], fetchImpl });
  assertEqual(result.isError, false, "Slack direct mutation succeeds");
  assertEqual(result.data.action, "channels_external_subscription_setup_executed", "stable success action");
  assertEqual(result.data.channelId, "slack", "success reports Slack channel");
  assertEqual(calls.length, 1, "one injected fetch call");
  assertEqual(calls[0]?.url, "https://slack.com/api/apps.manifest.update", "Slack manifest update endpoint used");
  assertEqual(calls[0]?.init.method, "POST", "Slack manifest update uses POST");
  assertEqual((calls[0]?.init.headers as Record<string, string>).authorization, `Bearer ${APP_CONFIG_TOKEN}`, "app config token sent only to Slack authorization header");

  const body = JSON.parse(String(calls[0]?.init.body)) as { app_id: string; manifest: string };
  const manifest = JSON.parse(body.manifest) as any;
  assertEqual(body.app_id, "A102PHASE", "app id sent to Slack");
  assertEqual(manifest.display_information.name, "Colony Phase 102", "existing manifest fields preserved");
  assertEqual(manifest.settings.socket_mode_enabled, false, "existing settings preserved");
  assertEqual(manifest.settings.event_subscriptions.request_url, CALLBACK_URL, "request URL patched into manifest");
  assertEqual(JSON.stringify(manifest.settings.event_subscriptions.bot_events), JSON.stringify(["message.channels"]), "bounded event subscription patched into manifest");
  assert(!leaks(result), "success result leaks no token, secret ref, or callback URL");
  assert(result.output.includes("one injected Slack apps.manifest.update call only"), "output states single injected mutation scope");
  assert(result.output.includes("No Slack app creation"), "output avoids app creation claim");
  assert(result.output.includes("no default live inbound delivery"), "output avoids live delivery claim");
}

async function verifyFailClosed(): Promise<void> {
  section("2. Slack Manifest Update Fail-Closed Paths");
  const good = await approved();
  const pending = candidate();
  const invalid = candidate({ appConfigToken: "phase102-raw-token" });
  const acceptedInvalid = { ...invalid, approval: { approvedBy: "operator", signature: await createExternalChannelSubscriptionApprovalSignature(invalid) } };
  const cyclicManifest = { display_information: { name: "cyclic" } } as Record<string, unknown>;
  cyclicManifest.self = cyclicManifest;
  const nonJsonManifest = { display_information: { name: "non-json" }, dropped: undefined as unknown } as Record<string, unknown>;

  const okFetch = async (): Promise<Response> => new Response(JSON.stringify({ ok: true }), { status: 200 });
  const rejected = [
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "slack", candidates: [good] }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "slack", candidates: [], fetchImpl: okFetch }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "slack", candidates: [good, good], fetchImpl: okFetch }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "slack", candidates: [pending], fetchImpl: okFetch }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "slack", candidates: [acceptedInvalid], fetchImpl: okFetch }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "slack", candidates: [await approved({ manifest: undefined })], fetchImpl: okFetch }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "slack", candidates: [{ ...good, appConfigToken: "xapp-phase102-changed-token" }], fetchImpl: okFetch }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "slack", candidates: [{ ...good, manifest: { display_information: { name: "Changed" } } }], fetchImpl: okFetch }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "slack", candidates: [candidate({ manifest: cyclicManifest })], fetchImpl: okFetch }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "slack", candidates: [candidate({ manifest: nonJsonManifest })], fetchImpl: okFetch }),
  ];
  assert(rejected.every((result) => result.isError), "invalid host inputs fail closed");
  assertEqual(rejected[0]?.data.reasonCode, "missing_fetch", "missing fetch rejected");
  assertEqual(rejected[1]?.data.reasonCode, "missing_candidate", "missing candidate rejected");
  assertEqual(rejected[2]?.data.reasonCode, "ambiguous_candidate", "duplicate candidate rejected");
  assertEqual(rejected[3]?.data.reasonCode, "approval_required", "pending approval rejected");
  assertEqual(rejected[4]?.data.reasonCode, "approval_required", "invalid token candidate rejected before fetch");
  assertEqual(rejected[5]?.data.reasonCode, "approval_required", "missing manifest rejected before fetch");
  assertEqual(rejected[6]?.data.reasonCode, "approval_required", "token mutation after approval rejected before fetch");
  assertEqual(rejected[7]?.data.reasonCode, "approval_required", "manifest mutation after approval rejected before fetch");
  assertEqual(rejected[8]?.data.reasonCode, "approval_required", "cyclic manifest rejected without throwing");
  assertEqual(rejected[9]?.data.reasonCode, "approval_required", "undefined manifest field rejected without throwing");
  assert(!leaks(rejected), "host input rejections redact secrets");
}

async function verifySlackApiFailures(): Promise<void> {
  section("3. Slack API Failure Handling");
  const good = await approved();
  const fetchReject = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => { throw new Error("token=plain-secret"); },
  });
  assertEqual(fetchReject.isError, true, "fetch rejection fails closed");
  assertEqual(fetchReject.data.reasonCode, "slack_manifest_update_request_failed", "fetch rejection stable code");
  assertEqual(fetchReject.data.retryable, true, "fetch rejection retryable without retry worker");

  const tooLarge = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response("x".repeat(40 * 1024), { status: 200 }),
  });
  assertEqual(tooLarge.data.reasonCode, "slack_manifest_update_response_too_large", "large Slack response rejected");

  const malformed = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response("not json", { status: 200 }),
  });
  assertEqual(malformed.data.reasonCode, "slack_manifest_update_response_malformed", "malformed Slack JSON rejected");

  const nonObject = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response("null", { status: 200 }),
  });
  assertEqual(nonObject.data.reasonCode, "slack_manifest_update_response_malformed", "non-object Slack JSON rejected without throwing");

  const slackRejected = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ ok: false, error: "invalid_manifest", detail: APP_CONFIG_TOKEN }), { status: 200 }),
  });
  assertEqual(slackRejected.data.reasonCode, "slack_manifest_update_response_rejected", "Slack ok=false rejected");
  assert(!leaks(slackRejected), "Slack rejection redacts secrets");

  const rateLimited = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ ok: false, error: "ratelimited" }), { status: 429 }),
  });
  assertEqual(rateLimited.data.retryable, true, "Slack 429 marked retryable without running retry worker");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 102 Verification (Slack Subscription Direct Mutation Host Executor)\n");
  await verifySuccess();
  await verifyFailClosed();
  await verifySlackApiFailures();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 102: Slack subscription direct mutation host executor is GREEN.");
}
main().catch((error) => { console.error(error); process.exit(1); });
