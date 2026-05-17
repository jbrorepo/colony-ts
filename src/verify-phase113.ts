/** Phase 113 Verification - Slack Subscription Activation Readiness */

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
const APP_CONFIG_TOKEN = "xapp-phase113-secret-token";
const SIGNING_SECRET_REF = "vault:phase113-slack-signing-secret";

function candidate(overrides: Partial<SlackSubscriptionCandidate> = {}): SlackSubscriptionCandidate {
  return {
    channelId: "slack",
    appId: "A113PHASE",
    workspaceId: "T113PHASE",
    callbackUrl: CALLBACK_URL,
    signingSecretRef: SIGNING_SECRET_REF,
    appConfigToken: APP_CONFIG_TOKEN,
    manifest: {
      display_information: { name: "Colony Phase 113" },
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
  return { ...base, approval: { approvedBy: "operator", approvedAt: "2026-05-05T15:55:00.000Z", signature } };
}

function matchingManifest(events: string[] = ["message.channels"], requestUrl = CALLBACK_URL): Record<string, unknown> {
  return {
    display_information: { name: "Colony Phase 113" },
    settings: {
      event_subscriptions: {
        request_url: requestUrl,
        bot_events: events,
      },
    },
  };
}

function activationReadiness(result: Awaited<ReturnType<typeof executeExternalChannelSubscriptionSetupHostRequest>>): Record<string, unknown> {
  return result.data.activationReadiness as Record<string, unknown>;
}

function arrayField(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function containsSensitive(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes(APP_CONFIG_TOKEN) ||
    text.includes(SIGNING_SECRET_REF) ||
    text.includes(CALLBACK_URL) ||
    text.includes("token=plain-secret") ||
    text.includes("secret=plain-secret");
}

async function verifyActivationReadinessSuccess(): Promise<void> {
  section("1. Slack Activation Readiness Success");
  const good = await approved();
  const result = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({
      ok: true,
      app_id: "A113PHASE",
      team_id: "T113PHASE",
      manifest: matchingManifest(),
    }), { status: 200 }),
  });
  const readiness = activationReadiness(result);
  const integrity = readiness.integrityChecks as Record<string, unknown>;
  const steps = arrayField(readiness.remainingOperatorSteps);

  assertEqual(result.isError, false, "Slack mutation succeeds");
  assert(result.output.includes("Activation readiness:"), "success output renders activation readiness");
  assert(result.output.includes("Remaining operator steps:"), "success output renders remaining operator steps");
  assertEqual(readiness.manifestMutationConfirmed, true, "activation readiness confirms only manifest mutation");
  assertEqual(readiness.subscriptionHostMutation, "slack_apps_manifest_update", "activation readiness identifies host mutation type");
  assertEqual(readiness.liveInboundDeliveryEnabled, false, "activation readiness does not claim live inbound delivery");
  assertEqual(readiness.defaultPublicHostingEnabled, false, "activation readiness does not claim public hosting");
  assertEqual(readiness.credentialPersistenceCreated, false, "activation readiness does not claim credential persistence");
  assertEqual(readiness.listenerStarted, false, "activation readiness does not claim listener startup");
  assertEqual(integrity.appIdMatched, true, "activation readiness records app identity proof");
  assertEqual(integrity.workspaceMatched, true, "activation readiness records workspace proof when Slack returns it");
  assertEqual(integrity.manifestEchoStatus, "matched", "activation readiness records matched manifest echo");
  for (const step of [
    "host_public_callback_route",
    "slack_url_verification_challenge",
    "host_auth_policy_binding",
    "channel_adapter_registration",
    "bridge_session_runner_wiring",
  ]) {
    assert(steps.includes(step), `activation readiness includes ${step}`);
  }
  assert(!containsSensitive(result), "activation readiness leaks no Slack token, secret ref, or callback URL");
}

async function verifyOmittedManifestEchoIsNotOverclaimed(): Promise<void> {
  section("2. Missing Slack Manifest Echo Avoids Overclaim");
  const good = await approved();
  const result = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, app_id: "A113PHASE", team_id: "T113PHASE" }), { status: 200 }),
  });
  const readiness = activationReadiness(result);
  const integrity = readiness.integrityChecks as Record<string, unknown>;

  assertEqual(result.isError, false, "Slack response without manifest echo remains compatible");
  assertEqual(integrity.manifestEchoStatus, "not_returned", "activation readiness does not fabricate manifest echo proof");
  assertEqual(readiness.manifestMutationConfirmed, true, "activation readiness still reflects accepted Slack mutation");
  assertEqual(readiness.liveInboundDeliveryEnabled, false, "missing echo path still does not claim delivery");
  assert(!String(result.output).includes("manifest echo verified:true"), "output avoids fabricated echo proof");
  assert(!containsSensitive(result), "missing echo readiness leaks no Slack token, secret ref, or callback URL");
}

async function verifyScopePreflight(): Promise<void> {
  section("3. Slack Manifest Scope Preflight");
  const missingScope = candidate({ manifest: {
    display_information: { name: "Colony Phase 113" },
    oauth_config: { scopes: { bot: ["chat:write"] } },
    settings: { socket_mode_enabled: false },
  } });
  const plans = await planExternalChannelSubscriptions([missingScope]);
  const inspection = plans[0]?.redactedConfig.slackManifestInspection as Record<string, unknown> | undefined;
  const overview = buildChannelsCommandPayload(["external"], { externalSubscriptions: plans });

  assertEqual(plans[0]?.accepted, false, "missing required Slack scope is not setup-ready");
  assert(String(plans[0]?.reason ?? "").includes("channels:history"), "plan reason names missing required scope");
  assertEqual(inspection?.scopeCompatibility, "missing_required_scope", "inspection reports missing scope compatibility");
  assert(arrayField(inspection?.requiredBotScopes).includes("channels:history"), "inspection exposes required Slack bot scope");
  assert(arrayField(inspection?.missingBotScopes).includes("channels:history"), "inspection exposes missing Slack bot scope");
  assert(overview.output.includes("requiredBotScopes:[channels:history]"), "/channels external renders required bot scopes");
  assert(overview.output.includes("missingBotScopes:[channels:history]"), "/channels external renders missing bot scopes");
  assert(overview.output.includes("scopeCompatibility:missing_required_scope"), "/channels external renders scope compatibility");
  assert(!containsSensitive([plans, overview]), "scope preflight leaks no Slack token, secret ref, callback URL, or approval signature");

  let calls = 0;
  const forgedApproval = { ...missingScope, approval: { approvedBy: "operator", signature: "channel-subscription:slack:forged", approvedAt: "2026-05-05T15:56:00.000Z" } };
  const result = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [forgedApproval],
    slackRetryPolicy: { mode: "host_inline_bounded", maxAttempts: 2 },
    fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify({ ok: true, app_id: "A113PHASE" }), { status: 200 });
    },
  });

  assertEqual(calls, 0, "missing scope fails before injected Slack fetch");
  assertEqual(result.isError, true, "missing scope host execution fails closed");
  assertEqual(result.data.reasonCode, "approval_required", "missing scope reuses approval gate rejection");
  assert(!("mutatedSubscription" in result.data), "missing scope does not report mutation success");
  assert(!("activationReadiness" in result.data), "missing scope does not expose activation readiness");
  assert(!("automaticRetryMode" in result.data), "missing scope does not trigger retry metadata");
  assert(!("retryWorkerId" in result.data), "missing scope creates no retry worker");
  assert(!("retryScheduledAt" in result.data), "missing scope creates no retry schedule");
  assert(!containsSensitive(result), "missing scope rejection leaks no Slack token, secret ref, or callback URL");
}

async function verifyFailuresDoNotExposeActivationSuccess(): Promise<void> {
  section("4. Slack Failures Do Not Expose Activation Success");
  const good = await approved();
  const rejected = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ ok: false, error: "bad token=plain-secret" }), { status: 400 }),
  });
  const mismatch = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [good],
    slackRetryPolicy: { mode: "host_inline_bounded", maxAttempts: 2 },
    fetchImpl: async () => new Response(JSON.stringify({
      ok: true,
      app_id: "A113PHASE",
      manifest: matchingManifest(["app_mention"]),
    }), { status: 200 }),
  });

  for (const result of [rejected, mismatch]) {
    assertEqual(result.isError, true, "failure path remains rejected");
    assert(!("activationReadiness" in result.data), "failure path does not expose activation success metadata");
    assert(!("mutatedSubscription" in result.data), "failure path does not report mutation success");
    assert(!String(result.output).includes("Activation readiness:"), "failure output omits activation readiness block");
    assert(!containsSensitive(result), "failure output leaks no token, secret ref, callback URL, or Slack detail secret");
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 113 Verification (Slack Subscription Activation Readiness)\n");
  await verifyActivationReadinessSuccess();
  await verifyOmittedManifestEchoIsNotOverclaimed();
  await verifyScopePreflight();
  await verifyFailuresDoNotExposeActivationSuccess();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 113: Slack subscription activation readiness is GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });
