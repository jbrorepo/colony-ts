/** Phase 108 Verification - Slack Subscription Setup Handoff UX */

import {
  createExternalChannelSubscriptionApprovalSignature,
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
const APP_CONFIG_TOKEN = "xapp-phase108-secret-token";
const SIGNING_SECRET_REF = "vault:phase108-slack-signing-secret";

function slackCandidate(overrides: Partial<SlackSubscriptionCandidate> = {}): SlackSubscriptionCandidate {
  return {
    channelId: "slack",
    appId: "A108PHASE",
    workspaceId: "T108PHASE",
    callbackUrl: CALLBACK_URL,
    signingSecretRef: SIGNING_SECRET_REF,
    appConfigToken: APP_CONFIG_TOKEN,
    manifest: {
      display_information: { name: "Colony Phase 108" },
      oauth_config: { scopes: { bot: ["channels:history"] } },
      settings: { socket_mode_enabled: false },
    },
    enabled: true,
    eventTypes: ["message.channels"],
    ...overrides,
  };
}

async function approved(base = slackCandidate()): Promise<SlackSubscriptionCandidate> {
  const signature = await createExternalChannelSubscriptionApprovalSignature(base);
  return { ...base, approval: { approvedBy: "operator", approvedAt: "2026-05-05T01:35:00.000Z", signature } };
}

function leaks(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes(APP_CONFIG_TOKEN) ||
    text.includes(SIGNING_SECRET_REF) ||
    text.includes(CALLBACK_URL) ||
    text.includes("token=plain-secret") ||
    text.includes("secret=plain-secret");
}

async function verifySlackHandoffChecklist(): Promise<void> {
  section("1. Slack Setup Handoff Checklist");
  const [plan] = await planExternalChannelSubscriptions([slackCandidate()]);
  const inspection = plan?.redactedConfig.slackManifestInspection as Record<string, unknown> | undefined;
  const checklist = Array.isArray(inspection?.handoffChecklist) ? inspection.handoffChecklist as string[] : [];
  assert(checklist.length > 0, "manifest inspection exposes handoff checklist");
  assert(checklist.includes("exact_operator_approval_signature"), "checklist includes approval signature step");
  assert(checklist.includes("host_supplies_app_configuration_token"), "checklist includes host token responsibility");
  assert(checklist.includes("host_supplies_full_slack_manifest"), "checklist includes full manifest responsibility");
  assert(checklist.includes("one_injected_apps_manifest_update_call"), "checklist includes single injected Slack call scope");
  assert(checklist.includes("no_credential_persistence_or_background_retry_worker"), "checklist includes no persistence/worker guardrail");
  assertEqual(inspection?.defaultRetryMode, "manual_operator_reinvoke", "default retry mode exposed");
  assertEqual(inspection?.optionalRetryMode, "host_inline_bounded", "optional bounded retry mode exposed");
  assertEqual(inspection?.maxForegroundAttempts, 2, "bounded foreground attempts exposed");
  assertEqual(inspection?.plannedHostManifestUpdateSubmission, true, "planning metadata says host manifest submission is planned");
  assert(!("fullManifestUpdateSubmittedToSlack" in (inspection ?? {})), "planning metadata avoids submitted-before-execution overclaim");
  assert(!leaks(inspection), "handoff inspection leaks no Slack token, secret ref, or callback URL");
}

async function verifyChannelsExternalRendering(): Promise<void> {
  section("2. /channels external Renders Slack UX Truth");
  const accepted = await approved();
  const plans = await planExternalChannelSubscriptions([accepted]);
  const overview = buildChannelsCommandPayload(["external"], { externalSubscriptions: plans });
  assert(overview.output.includes("handoffChecklist:[exact_operator_approval_signature"), "overview renders checklist details");
  assert(overview.output.includes("defaultRetryMode:manual_operator_reinvoke"), "overview renders default retry mode");
  assert(overview.output.includes("optionalRetryMode:host_inline_bounded"), "overview renders optional bounded retry mode");
  assert(overview.output.includes("maxForegroundAttempts:2"), "overview renders bounded retry attempt limit");
  assert(overview.output.includes("plannedHostManifestUpdateSubmission:true"), "overview renders planned host submission wording");
  assert(!overview.output.includes("fullManifestUpdateSubmittedToSlack:true"), "overview avoids submitted-before-execution overclaim");
  assert(!overview.output.includes("retryWorkerId"), "overview does not imply retry worker");
  assert(!overview.output.includes("retryScheduledAt"), "overview does not imply retry schedule");
  assert(!leaks(overview), "overview Slack UX leaks no token, secret ref, or callback URL");
}

async function verifySubscribeHandoffOutput(): Promise<void> {
  section("3. Subscribe Handoff Output Preserves Action Shape");
  const accepted = await approved();
  const signature = await createExternalChannelSubscriptionApprovalSignature(accepted);
  const plans = await planExternalChannelSubscriptions([accepted]);
  const payload = buildChannelsCommandPayload(["external", "subscribe", "slack", signature], { externalSubscriptions: plans });
  assertEqual(payload.isError, undefined, "Slack subscribe handoff accepted");
  assert(payload.output.includes("Retry UX: default manual operator reinvoke"), "handoff output explains default retry UX");
  assert(payload.output.includes("optional host_inline_bounded foreground retry"), "handoff output explains opt-in bounded retry");
  assert(payload.output.includes("No retry worker or retry schedule is created by this gateway command"), "handoff output excludes background retry claims");
  assertEqual(payload.action?.kind, "setup_external_channel_subscription", "action kind unchanged");
  assertEqual(payload.action?.channelId, "slack", "action channel unchanged");
  assertEqual(Object.keys(payload.action ?? {}).sort().join(","), "channelId,kind", "action still carries only kind and channel id");
  assert(!leaks(payload), "handoff output leaks no Slack token, secret ref, or callback URL");

  const discordOutput = buildChannelsCommandPayload(["external", "subscribe", "discord", "channel-subscription:discord:redacted"], { externalSubscriptions: plans });
  assert(!String(discordOutput.output).includes("host_inline_bounded"), "Discord rejection does not inherit Slack retry UX copy");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 108 Verification (Slack Subscription Setup Handoff UX)\n");
  await verifySlackHandoffChecklist();
  await verifyChannelsExternalRendering();
  await verifySubscribeHandoffOutput();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 108: Slack subscription setup handoff UX is GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });
