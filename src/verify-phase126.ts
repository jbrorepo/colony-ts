/** Phase 126 Verification - External Subscription Credential Setup UX */

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

const SLACK_CALLBACK_URL = "https://hooks.example.com/api/channels/slack/external-event";
const DISCORD_CALLBACK_URL = "https://hooks.example.com/api/channels/discord/external-event";
const SLACK_APP_CONFIG_TOKEN = "xapp-phase126-secret-token";
const SLACK_SIGNING_SECRET_REF = "vault:phase126-slack-signing-secret";
const DISCORD_BOT_TOKEN = "Bot phase126DiscordSecretToken";
const DISCORD_PUBLIC_KEY_REF = "secret-ref:phase126/discord/public-key";

function slackCandidate(overrides: Partial<ExternalChannelSubscriptionCandidate> = {}): ExternalChannelSubscriptionCandidate {
  return {
    channelId: "slack",
    appId: "A126PHASE",
    workspaceId: "T126PHASE",
    callbackUrl: SLACK_CALLBACK_URL,
    signingSecretRef: SLACK_SIGNING_SECRET_REF,
    appConfigToken: SLACK_APP_CONFIG_TOKEN,
    manifest: {
      display_information: { name: "Colony Phase 126" },
      oauth_config: { scopes: { bot: ["channels:history"] } },
      settings: { socket_mode_enabled: false },
    },
    enabled: true,
    eventTypes: ["message.channels"],
    ...overrides,
  };
}

function discordCandidate(overrides: Partial<ExternalChannelSubscriptionCandidate> = {}): ExternalChannelSubscriptionCandidate {
  return {
    channelId: "discord",
    applicationId: "123456789012345678",
    guildId: "234567890123456789",
    callbackUrl: DISCORD_CALLBACK_URL,
    publicKeyRef: DISCORD_PUBLIC_KEY_REF,
    discordBotToken: DISCORD_BOT_TOKEN,
    enabled: true,
    eventTypes: ["PING", "APPLICATION_COMMAND"],
    ...overrides,
  };
}

async function approved(candidate: ExternalChannelSubscriptionCandidate): Promise<ExternalChannelSubscriptionCandidate> {
  const signature = await createExternalChannelSubscriptionApprovalSignature(candidate);
  return { ...candidate, approval: { approvedBy: "operator", approvedAt: "2026-05-08T06:55:00.000Z", signature } };
}

function arrayField(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function containsSensitive(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes(SLACK_APP_CONFIG_TOKEN) ||
    text.includes(SLACK_SIGNING_SECRET_REF) ||
    text.includes(SLACK_CALLBACK_URL) ||
    text.includes(DISCORD_BOT_TOKEN) ||
    text.includes(DISCORD_PUBLIC_KEY_REF) ||
    text.includes(DISCORD_CALLBACK_URL) ||
    text.includes("raw-phase126-discord-secret") ||
    text.includes("token=plain-secret");
}

async function verifySlackCredentialReadiness(): Promise<void> {
  section("1. Slack Credential Setup Readiness");
  const [plan] = await planExternalChannelSubscriptions([slackCandidate()]);
  const readiness = plan?.redactedConfig.subscriptionCredentialReadiness as Record<string, unknown> | undefined;

  assert(readiness !== undefined, "Slack plan exposes subscription credential readiness");
  assertEqual(readiness?.channelId, "slack", "Slack readiness is channel-scoped");
  assertEqual(readiness?.status, "ready_for_host_credential_setup", "Slack readiness reports ready credential setup");
  assertEqual(readiness?.credentialPersistenceCreated, false, "Slack readiness does not claim credential persistence");
  assertEqual(readiness?.credentialValuesPersisted, false, "Slack readiness does not claim credential value persistence");
  assertEqual(readiness?.defaultLiveInboundDeliveryEnabled, false, "Slack readiness does not claim live delivery");
  assert(arrayField(readiness?.requiredCredentialRefs).includes("slack_signing_secret_ref"), "Slack readiness requires signing secret reference");
  assert(arrayField(readiness?.presentCredentialRefs).includes("slack_signing_secret_ref"), "Slack readiness sees signing secret reference present");
  assert(arrayField(readiness?.hostSuppliedRuntimeSecrets).includes("slack_app_configuration_token"), "Slack readiness names host app config token responsibility");
  assert(arrayField(readiness?.hostSuppliedRuntimeConfig).includes("slack_full_app_manifest"), "Slack readiness names host manifest responsibility");
  assert(arrayField(readiness?.handoffChecklist).includes("operator_supplies_credentials_to_host_executor_outside_durable_colony_state"), "Slack readiness includes host-owned credential handoff");
  assertEqual(arrayField(readiness?.missingCredentialRefs).length, 0, "Slack readiness has no missing credential refs");
  assertEqual(arrayField(readiness?.invalidCredentialRefs).length, 0, "Slack readiness has no invalid credential refs");
  assert(!containsSensitive([plan, readiness]), "Slack readiness leaks no token, ref, callback URL, or raw credential");
}

async function verifyDiscordCredentialReadiness(): Promise<void> {
  section("2. Discord Credential Setup Readiness");
  const [plan] = await planExternalChannelSubscriptions([discordCandidate()]);
  const readiness = plan?.redactedConfig.subscriptionCredentialReadiness as Record<string, unknown> | undefined;
  const overview = buildChannelsCommandPayload(["external"], { externalSubscriptions: [plan!] });

  assert(readiness !== undefined, "Discord plan exposes subscription credential readiness");
  assertEqual(readiness?.channelId, "discord", "Discord readiness is channel-scoped");
  assertEqual(readiness?.status, "ready_for_host_credential_setup", "Discord readiness reports ready credential setup");
  assertEqual(readiness?.credentialPersistenceCreated, false, "Discord readiness does not claim credential persistence");
  assertEqual(readiness?.credentialValuesPersisted, false, "Discord readiness does not claim credential value persistence");
  assertEqual(readiness?.defaultLiveInboundDeliveryEnabled, false, "Discord readiness does not claim live delivery");
  assert(arrayField(readiness?.requiredCredentialRefs).includes("discord_public_key_ref"), "Discord readiness requires public key reference");
  assert(arrayField(readiness?.presentCredentialRefs).includes("discord_public_key_ref"), "Discord readiness sees public key reference present");
  assert(arrayField(readiness?.hostSuppliedRuntimeSecrets).includes("discord_bot_token"), "Discord readiness names host bot token responsibility");
  assert(overview.output.includes("subscriptionCredentialReadiness={channelId:discord"), "/channels external renders Discord readiness details");
  assert(overview.output.includes("hostSuppliedRuntimeSecrets:[discord_bot_token]"), "/channels external renders Discord host credential setup responsibility");
  assert(overview.output.includes("credentialPersistenceCreated:false"), "/channels external renders no credential persistence");
  assert(!containsSensitive([plan, overview]), "Discord readiness rendering leaks no bot token, public key ref, or callback URL");
}

async function verifyInvalidCredentialRefsFailClosed(): Promise<void> {
  section("3. Invalid Credential Reference Readiness");
  const [plan] = await planExternalChannelSubscriptions([discordCandidate({
    publicKeyRef: "raw-phase126-discord-secret",
  })]);
  const readiness = plan?.redactedConfig.subscriptionCredentialReadiness as Record<string, unknown> | undefined;
  const overview = buildChannelsCommandPayload(["external"], { externalSubscriptions: [plan!] });

  assertEqual(plan?.accepted, false, "invalid credential ref is not approval accepted");
  assert(String(plan?.reason ?? "").includes("reference"), "invalid ref reason stays operator-actionable");
  assertEqual(readiness?.status, "invalid_credential_refs", "invalid ref readiness is explicit");
  assert(arrayField(readiness?.invalidCredentialRefs).includes("discord_public_key_ref"), "invalid public key ref is named by label only");
  assert(!arrayField(readiness?.presentCredentialRefs).includes("discord_public_key_ref"), "invalid public key ref is not treated as present");
  assert(overview.output.includes("status:invalid_credential_refs"), "/channels external renders invalid credential readiness");
  assert(!containsSensitive([plan, readiness, overview]), "invalid ref readiness leaks no raw credential material");
}

async function verifyMissingCredentialRefsRenderActionably(): Promise<void> {
  section("4. Missing Credential Reference Readiness");
  const [slackPlan] = await planExternalChannelSubscriptions([slackCandidate({
    signingSecretRef: undefined,
  })]);
  const [discordPlan] = await planExternalChannelSubscriptions([discordCandidate({
    publicKeyRef: undefined,
  })]);
  const slackReadiness = slackPlan?.redactedConfig.subscriptionCredentialReadiness as Record<string, unknown> | undefined;
  const discordReadiness = discordPlan?.redactedConfig.subscriptionCredentialReadiness as Record<string, unknown> | undefined;
  const overview = buildChannelsCommandPayload(["external"], { externalSubscriptions: [slackPlan!, discordPlan!] });

  assertEqual(slackPlan?.accepted, false, "missing Slack signing ref is not approval accepted");
  assertEqual(discordPlan?.accepted, false, "missing Discord public key ref is not approval accepted");
  assertEqual(slackReadiness?.status, "missing_credential_refs", "missing Slack ref readiness is explicit");
  assertEqual(discordReadiness?.status, "missing_credential_refs", "missing Discord ref readiness is explicit");
  assert(arrayField(slackReadiness?.missingCredentialRefs).includes("slack_signing_secret_ref"), "missing Slack ref is named by label only");
  assert(arrayField(discordReadiness?.missingCredentialRefs).includes("discord_public_key_ref"), "missing Discord ref is named by label only");
  assert(overview.output.includes("status:missing_credential_refs"), "/channels external renders missing credential readiness");
  assert(overview.output.includes("missingCredentialRefs:[slack_signing_secret_ref]"), "/channels external renders missing Slack ref label");
  assert(overview.output.includes("missingCredentialRefs:[discord_public_key_ref]"), "/channels external renders missing Discord ref label");
  assert(!containsSensitive([slackPlan, discordPlan, overview]), "missing ref readiness leaks no raw credential material");
}

async function verifyAcceptedSubscribeStagingNamesCredentialGuardrail(): Promise<void> {
  section("5. Accepted Subscribe Staging Names Credential Guardrail");
  const acceptedSlack = await approved(slackCandidate());
  const acceptedDiscord = await approved(discordCandidate());
  const slackSignature = await createExternalChannelSubscriptionApprovalSignature(acceptedSlack);
  const discordSignature = await createExternalChannelSubscriptionApprovalSignature(acceptedDiscord);
  const plans = await planExternalChannelSubscriptions([acceptedSlack, acceptedDiscord]);
  const slackPayload = buildChannelsCommandPayload(["external", "subscribe", "slack", slackSignature], { externalSubscriptions: plans });
  const discordPayload = buildChannelsCommandPayload(["external", "subscribe", "discord", discordSignature], { externalSubscriptions: plans });

  for (const payload of [slackPayload, discordPayload]) {
    assertEqual(payload.isError, undefined, "accepted subscribe staging remains non-error");
    assert(payload.output.includes("Credential setup: host-supplied at execution time; Colony persists no credential values."), "staging output names host credential setup guardrail");
    assert(payload.output.includes("Approval signature: channel-subscription:"), "staging output keeps redacted approval signature");
    assert(!containsSensitive(payload), "staging output leaks no token, ref, callback URL, or raw credential");
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 126 Verification (External Subscription Credential Setup UX)\n");
  await verifySlackCredentialReadiness();
  await verifyDiscordCredentialReadiness();
  await verifyInvalidCredentialRefsFailClosed();
  await verifyMissingCredentialRefsRenderActionably();
  await verifyAcceptedSubscribeStagingNamesCredentialGuardrail();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 126: external subscription credential setup UX is GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });
