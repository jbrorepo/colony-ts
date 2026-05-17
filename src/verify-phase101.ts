/** Phase 101 Verification - Discord Interactions Setup Gate */

import {
  createExternalChannelSubscriptionApprovalSignature,
  planExternalChannelSubscriptions,
  type ExternalChannelSubscriptionCandidate,
} from "./channel";
import { executeCommand, type CommandExecutionHandlers, type CommandResult } from "./gateway";
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

function candidate(overrides: Partial<ExternalChannelSubscriptionCandidate> = {}): ExternalChannelSubscriptionCandidate {
  return {
    channelId: "discord",
    applicationId: "101000000000000001",
    guildId: "101000000000000002",
    callbackUrl: "https://hooks.example.com/api/channels/discord/external-event",
    publicKeyRef: "vault:phase101-discord-public-key-ref",
    enabled: true,
    eventTypes: ["PING", "APPLICATION_COMMAND"],
    ...overrides,
  };
}
async function approved(overrides: Partial<ExternalChannelSubscriptionCandidate> = {}): Promise<ExternalChannelSubscriptionCandidate> {
  const base = candidate(overrides);
  const signature = await createExternalChannelSubscriptionApprovalSignature(base);
  return { ...base, approval: { approvedBy: "operator", approvedAt: "2026-05-03T06:00:00.000Z", signature } };
}
function leaks(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("vault:phase101-discord-public-key-ref") ||
    text.includes("discord-token-phase101-secret") ||
    text.includes("phase101-raw-public-key") ||
    text.includes("/api/channels/discord/external-event") ||
    text.includes("token=plain-secret") ||
    text.includes("api_key=plain-secret") ||
    text.includes("credential=plain-secret") ||
    text.includes("signature=plain-secret");
}

async function verifyPlanning(): Promise<void> {
  section("1. Discord Planning, Approval, Redaction");
  const pending = candidate();
  const sig = await createExternalChannelSubscriptionApprovalSignature(pending);
  const plans = await planExternalChannelSubscriptions([pending]);
  assertEqual(plans.length, 1, "one Discord plan created");
  assertEqual(plans[0]?.channelId, "discord", "Discord channel normalized");
  assertEqual(plans[0]?.accepted, false, "pending Discord plan needs approval");
  assertEqual(plans[0]?.approvalRequired, true, "Discord approval required");
  assertEqual(plans[0]?.requiredSignature, sig, "Discord required signature exposed");
  assert(sig.startsWith("channel-subscription:discord:"), "Discord signature prefix correct");
  assertEqual(plans[0]?.redactedConfig.callbackUrl, "https://hooks.example.com/[REDACTED_PATH]", "Discord callback path redacted");
  assertEqual(plans[0]?.redactedConfig.publicKeyRef, "[REDACTED_REF]", "Discord public-key ref redacted");
  assert(!leaks(plans), "Discord plans leak no refs/callback paths/raw credentials");

  const accepted = await approved();
  const acceptedPlans = await planExternalChannelSubscriptions([accepted]);
  assertEqual(acceptedPlans[0]?.accepted, true, "exact Discord approval accepted");
  assertEqual(JSON.stringify(acceptedPlans[0]?.redactedConfig.eventTypes), JSON.stringify(["PING", "APPLICATION_COMMAND"]), "Discord interaction allowlist bounded");
  assertEqual((await planExternalChannelSubscriptions([{ ...accepted, eventTypes: ["MESSAGE_CREATE"] }]))[0]?.accepted, false, "Discord interaction allowlist mutation invalidates approval");
  assertEqual((await planExternalChannelSubscriptions([{ ...accepted, callbackUrl: "https://hooks.example.com/api/channels/discord/other" }]))[0]?.accepted, false, "Discord URL mutation invalidates approval");
  const malformedApproval = await planExternalChannelSubscriptions([{ ...pending, approval: { signature: sig } as any }]);
  assertEqual(malformedApproval[0]?.accepted, false, "Discord malformed approval metadata fails closed");
}

async function verifyFailClosed(): Promise<void> {
  section("2. Discord Fail-Closed Validation");
  const bad: ExternalChannelSubscriptionCandidate[] = [
    candidate({ channelId: "telegram" }),
    candidate({ callbackUrl: "http://hooks.example.com/api/channels/discord/external-event" }),
    candidate({ callbackUrl: "https://127.1.2.3/api/channels/discord/external-event" }),
    candidate({ callbackUrl: "https://localhost./api/channels/discord/external-event" }),
    candidate({ callbackUrl: "https://[fd00::1]/api/channels/discord/external-event" }),
    candidate({ callbackUrl: "https://[fe90::1]/api/channels/discord/external-event" }),
    candidate({ callbackUrl: "https://[::ffff:127.0.0.1]/api/channels/discord/external-event" }),
    candidate({ callbackUrl: "https://169.254.169.254/api/channels/discord/external-event" }),
    candidate({ callbackUrl: "https://foo.localhost/api/channels/discord/external-event" }),
    candidate({ callbackUrl: "https://user:pass@hooks.example.com/api/channels/discord/external-event" }),
    candidate({ callbackUrl: "https://hooks.example.com/api/channels/discord/external-event?token=plain-secret" }),
    candidate({ callbackUrl: "https://hooks.example.com/api/channels/discord/external-event#frag" }),
    candidate({ callbackUrl: "https://hooks.example.com/api/channels/slack/external-event" }),
    candidate({ applicationId: "not-a-snowflake" }),
    candidate({ guildId: "not-a-snowflake" }),
    candidate({ eventTypes: ["message.channels"] }),
    candidate({ eventTypes: ["PING", "APPLICATION_COMMAND", "MESSAGE_CREATE"] }),
    candidate({ publicKeyRef: "phase101-raw-public-key" }),
    candidate({ publicKeyRef: "discord-token-phase101-secret" }),
    candidate({ publicKeyRef: "vault:public key with spaces" }),
    candidate({ enabled: false }),
  ];
  const plans = await planExternalChannelSubscriptions(bad);
  assert(plans.every((plan) => !plan.accepted), "invalid Discord candidates never accepted");
  assert(plans[0]?.reason?.includes("Slack subscription setup or Discord Interactions setup") === true, "unsupported subscription channel rejected");
  assert(plans[1]?.reason?.includes("HTTPS") === true, "Discord HTTP callback rejected");
  assert(plans.slice(2, 9).every((plan) => plan.reason?.includes("local or private")), "Discord local/private hosts rejected");
  assert(plans[9]?.reason?.includes("credentials") === true, "Discord URL credentials rejected");
  assert(plans[10]?.reason?.includes("query") === true, "Discord query rejected");
  assert(plans[11]?.reason?.includes("fragments") === true, "Discord fragment rejected");
  assert(plans[12]?.reason?.includes("expected external event endpoint") === true, "Discord wrong path rejected");
  assert(plans[13]?.reason?.includes("application") === true, "Discord app id rejected");
  assert(plans[14]?.reason?.includes("guild") === true, "Discord guild id rejected");
  assert(plans[15]?.reason?.includes("PING") === true, "Discord wrong event rejected");
  assert(plans[16]?.reason?.includes("PING") === true, "Discord broader events rejected");
  assert(plans.slice(17, 20).every((plan) => plan.reason?.includes("reference")), "Discord raw/malformed refs rejected");
  assert(plans[20]?.reason?.includes("enabled") === true, "Discord disabled candidate rejected");
  assert(!leaks(plans), "invalid Discord plans leak no secrets");
}

async function verifyGateway(): Promise<void> {
  section("3. Discord Gateway Boundary");
  const good = await approved();
  const sig = await createExternalChannelSubscriptionApprovalSignature(good);
  const plans = await planExternalChannelSubscriptions([good]);
  const payload = buildChannelsCommandPayload(["external", "subscribe", "discord", sig], { externalSubscriptions: plans });
  assertEqual(payload.isError, undefined, "accepted Discord Interactions command not error");
  assert(payload.output.includes("Discord Interactions setup request staged"), "Discord staged output rendered");
  assert(payload.output.includes("host-mediated"), "Discord host-mediated boundary rendered");
  assert(payload.output.includes("does not create Discord apps"), "Discord output avoids app creation claim");
  assert(payload.output.includes("persist credentials"), "Discord output avoids credential persistence claim");
  assertEqual(payload.data?.action, "channels_external_subscription_request", "Discord stable data action");
  assertEqual(payload.action?.kind, "setup_external_channel_subscription", "Discord setup action emitted");
  assertEqual(payload.action?.channelId, "discord", "Discord action carries only channel id");
  assert(!payload.output.includes(sig), "Discord output redacts exact signature");
  assert(!leaks(payload), "Discord payload leaks no ref/callback path");

  const pending = buildChannelsCommandPayload(["external", "subscribe", "discord", sig], { externalSubscriptions: await planExternalChannelSubscriptions([{ ...good, approval: undefined }]) });
  assertEqual(pending.isError, true, "pending Discord emits no action");
  assertEqual(pending.action, undefined, "pending Discord action absent");
  const wrong = buildChannelsCommandPayload(["external", "subscribe", "discord", "channel-subscription:discord:wrong"], { externalSubscriptions: plans });
  assertEqual(wrong.isError, true, "wrong Discord signature rejected");
  assertEqual(wrong.action, undefined, "wrong Discord signature emits no action");
  const slackSig = buildChannelsCommandPayload(["external", "subscribe", "discord", "channel-subscription:slack:wrong"], { externalSubscriptions: plans });
  assertEqual(slackSig.isError, true, "Slack signature rejected for Discord command");
  assertEqual(slackSig.action, undefined, "Slack signature emits no Discord action");

  const overview = buildChannelsCommandPayload(["external"], { externalSubscriptions: plans });
  assert(overview.output.includes("/channels external subscribe discord <approval-signature>"), "overview shows Discord subscribe command");
  assertEqual(overview.data?.subscriptionCandidateCount, 1, "overview Discord candidate count");
  assertEqual(overview.data?.subscriptionAcceptedCount, 1, "overview Discord accepted count");
  assert(!leaks(overview), "overview leaks no Discord secrets");
}

async function verifyExecute(): Promise<void> {
  section("4. Discord Executor Host Boundary");
  const command: CommandResult = {
    handled: true,
    command: "channels",
    output: "Discord Interactions setup request staged.\nExecution: host-mediated.",
    data: { action: "channels_external_subscription_request", channelId: "discord" },
    isError: false,
    action: { kind: "setup_external_channel_subscription", channelId: "discord" },
  };
  const messages: string[] = [];
  const errors: string[] = [];
  const handlers: CommandExecutionHandlers = {
    submitChat: () => {}, exitApp: () => {}, resetSession: () => {}, requestCompaction: () => {}, setBudgetCap: () => {},
    showSystemMessage: (m) => messages.push(m), showErrorMessage: (m) => errors.push(m),
    requestExternalChannelSubscriptionSetup: (channelId) => ({ handled: true, command: "channels", output: `Discord Interactions setup handoff prepared for ${channelId}.`, isError: false, data: { action: "handoff", channelId } }),
  };
  assertEqual(await executeCommand(command, handlers), true, "execute handles Discord Interactions action");
  assertEqual(errors.length, 0, "Discord host path emits no errors");
  assert(messages.some((m) => m.includes("request staged")), "Discord command output emitted");
  assert(messages.some((m) => m.includes("handoff prepared")), "Discord host output emitted");
  assert(!leaks(messages), "Discord messages leak no secrets");

  const noHandlerMessages: string[] = [];
  assertEqual(await executeCommand(command, { ...handlers, requestExternalChannelSubscriptionSetup: undefined, showSystemMessage: (m) => noHandlerMessages.push(m) }), true, "Discord no handler still handled");
  assertEqual(noHandlerMessages.length, 1, "Discord no handler emits only command output");

  const failureErrors: string[] = [];
  await executeCommand(command, {
    ...handlers,
    showSystemMessage: () => {},
    showErrorMessage: (m) => failureErrors.push(m),
    requestExternalChannelSubscriptionSetup: () => { throw new Error("token=plain-secret api_key=plain-secret credential=plain-secret signature=plain-secret"); },
  });
  assertEqual(failureErrors.length, 1, "Discord host exception emits one bounded error");
  assert(!leaks(failureErrors), "Discord host exception leaks no credential fragments");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 101 Verification (Discord Interactions Setup Gate)\n");
  await verifyPlanning();
  await verifyFailClosed();
  await verifyGateway();
  await verifyExecute();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 101: Discord Interactions setup gate is GREEN.");
}
main().catch((error) => { console.error(error); process.exit(1); });
