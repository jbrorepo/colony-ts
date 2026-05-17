/** Phase 100 Verification - Slack Subscription Setup Gate */

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
    channelId: "slack",
    appId: "A100PHASE",
    workspaceId: "T100PHASE",
    callbackUrl: "https://hooks.example.com/api/channels/slack/external-event",
    signingSecretRef: "vault:phase100-slack-signing-secret",
    enabled: true,
    eventTypes: ["message.channels"],
    ...overrides,
  };
}
async function approved(overrides: Partial<ExternalChannelSubscriptionCandidate> = {}): Promise<ExternalChannelSubscriptionCandidate> {
  const base = candidate(overrides);
  const signature = await createExternalChannelSubscriptionApprovalSignature(base);
  return { ...base, approval: { approvedBy: "operator", approvedAt: "2026-05-03T05:00:00.000Z", signature } };
}
function leaks(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("vault:phase100-slack-signing-secret") ||
    text.includes("xoxb-phase100-secret") ||
    text.includes("phase100-raw-signing-secret") ||
    text.includes("token=plain-secret") ||
    text.includes("api_key=plain-secret") ||
    text.includes("credential=plain-secret") ||
    text.includes("signature=plain-secret");
}

async function verifyPlanning(): Promise<void> {
  section("1. Planning, Approval, Redaction");
  const pending = candidate();
  const sig = await createExternalChannelSubscriptionApprovalSignature(pending);
  const plans = await planExternalChannelSubscriptions([pending]);
  assertEqual(plans.length, 1, "one plan created");
  assertEqual(plans[0]?.channelId, "slack", "channel normalized");
  assertEqual(plans[0]?.accepted, false, "pending needs approval");
  assertEqual(plans[0]?.approvalRequired, true, "approval required");
  assertEqual(plans[0]?.requiredSignature, sig, "required signature exposed");
  assert(sig.startsWith("channel-subscription:slack:"), "signature prefix correct");
  assertEqual(plans[0]?.redactedConfig.callbackUrl, "https://hooks.example.com/[REDACTED_PATH]", "callback path redacted");
  assertEqual(plans[0]?.redactedConfig.signingSecretRef, "[REDACTED_REF]", "secret ref redacted");
  assert(!leaks(plans), "plans leak no secret refs/callback paths/raw credentials");

  const accepted = await approved();
  const acceptedPlans = await planExternalChannelSubscriptions([accepted]);
  assertEqual(acceptedPlans[0]?.accepted, true, "exact approval accepted");
  assertEqual(JSON.stringify(acceptedPlans[0]?.redactedConfig.eventTypes), JSON.stringify(["message.channels"]), "event allowlist bounded");
  assertEqual((await planExternalChannelSubscriptions([{ ...accepted, eventTypes: ["app_mention"] }]))[0]?.accepted, false, "event mutation invalidates approval");
  assertEqual((await planExternalChannelSubscriptions([{ ...accepted, callbackUrl: "https://hooks.example.com/api/channels/slack/other" }]))[0]?.accepted, false, "url mutation invalidates approval");
  const malformedApproval = await planExternalChannelSubscriptions([{ ...pending, approval: { signature: sig } as any }]);
  assertEqual(malformedApproval[0]?.accepted, false, "malformed approval metadata fails closed");

  const rawSecretRef = candidate({ signingSecretRef: "vault:xoxb-phase100-secret" });
  const invalidSignature = await createExternalChannelSubscriptionApprovalSignature(rawSecretRef);
  const rawSecretPlans = await planExternalChannelSubscriptions([{
    ...rawSecretRef,
    approval: { approvedBy: "operator", signature: invalidSignature },
  }]);
  assertEqual(invalidSignature, "channel-subscription:slack:invalid", "Raw secret reference yields invalid approval signature");
  assertEqual(rawSecretPlans[0]?.accepted, false, "Invalid approval signature cannot accept raw secret reference after repeated validation");
}

async function verifyFailClosed(): Promise<void> {
  section("2. Fail-Closed Validation");
  const bad: ExternalChannelSubscriptionCandidate[] = [
    candidate({ channelId: "telegram" }),
    candidate({ callbackUrl: "http://hooks.example.com/api/channels/slack/external-event" }),
    candidate({ callbackUrl: "https://127.0.0.1/api/channels/slack/external-event" }),
    candidate({ callbackUrl: "https://127.1.2.3/api/channels/slack/external-event" }),
    candidate({ callbackUrl: "https://localhost./api/channels/slack/external-event" }),
    candidate({ callbackUrl: "https://[::1]/api/channels/slack/external-event" }),
    candidate({ callbackUrl: "https://[fd00::1]/api/channels/slack/external-event" }),
    candidate({ callbackUrl: "https://[fe90::1]/api/channels/slack/external-event" }),
    candidate({ callbackUrl: "https://[::ffff:127.0.0.1]/api/channels/slack/external-event" }),
    candidate({ callbackUrl: "https://169.254.169.254/api/channels/slack/external-event" }),
    candidate({ callbackUrl: "https://foo.localhost/api/channels/slack/external-event" }),
    candidate({ callbackUrl: "https://user:pass@hooks.example.com/api/channels/slack/external-event" }),
    candidate({ callbackUrl: "https://hooks.example.com/api/channels/slack/external-event?token=plain-secret" }),
    candidate({ callbackUrl: "https://hooks.example.com/api/channels/slack/external-event#frag" }),
    candidate({ callbackUrl: "https://hooks.example.com/api/channels/slack/other" }),
    candidate({ eventTypes: ["message.groups"] }),
    candidate({ eventTypes: ["message.channels", "app_mention"] }),
    candidate({ signingSecretRef: "phase100-raw-signing-secret" }),
    candidate({ signingSecretRef: "xoxb-phase100-secret" }),
    candidate({ signingSecretRef: "vault:secret with spaces" }),
    candidate({ enabled: false }),
  ];
  const plans = await planExternalChannelSubscriptions(bad);
  assert(plans.every((plan) => !plan.accepted), "invalid candidates never accepted");
  assert(plans[0]?.reason?.includes("Slack subscription setup or Discord Interactions setup") === true, "unsupported subscription channel rejected");
  assert(plans[1]?.reason?.includes("HTTPS") === true, "http rejected");
  assert(plans.slice(2, 11).every((plan) => plan.reason?.includes("local or private")), "local/private hosts rejected");
  assert(plans[11]?.reason?.includes("credentials") === true, "url credentials rejected");
  assert(plans[12]?.reason?.includes("query") === true, "query rejected");
  assert(plans[13]?.reason?.includes("fragments") === true, "fragment rejected");
  assert(plans[14]?.reason?.includes("expected external event endpoint") === true, "wrong path rejected");
  assert(plans[15]?.reason?.includes("message.channels") === true, "unsupported event rejected");
  assert(plans[16]?.reason?.includes("message.channels") === true, "multiple events rejected");
  assert(plans.slice(17, 20).every((plan) => plan.reason?.includes("reference")), "raw/malformed secret refs rejected");
  assert(plans[20]?.reason?.includes("enabled") === true, "disabled candidate rejected");
  assert(!leaks(plans), "invalid plans leak no secrets");
}

async function verifyGateway(): Promise<void> {
  section("3. Gateway Boundary");
  const good = await approved();
  const sig = await createExternalChannelSubscriptionApprovalSignature(good);
  const plans = await planExternalChannelSubscriptions([good]);
  const payload = buildChannelsCommandPayload(["external", "subscribe", "slack", sig], { externalSubscriptions: plans });
  assertEqual(payload.isError, undefined, "accepted subscription command not error");
  assert(payload.output.includes("Slack subscription setup request staged"), "staged output rendered");
  assert(payload.output.includes("host-mediated"), "host-mediated boundary rendered");
  assert(payload.output.includes("does not create Slack apps"), "no app creation claim");
  assert(payload.output.includes("persist credentials"), "no credential persistence claim");
  assertEqual(payload.data?.action, "channels_external_subscription_request", "stable data action");
  assertEqual(payload.action?.kind, "setup_external_channel_subscription", "setup action emitted");
  assertEqual(payload.action?.channelId, "slack", "action carries only channel id");
  assert(!payload.output.includes(sig), "output redacts exact signature");
  assert(!leaks(payload), "payload leaks no secret/callback path");

  const pending = buildChannelsCommandPayload(["external", "subscribe", "slack", sig], { externalSubscriptions: await planExternalChannelSubscriptions([{ ...good, approval: undefined }]) });
  assertEqual(pending.isError, true, "pending emits no action");
  assertEqual(pending.action, undefined, "pending action absent");
  const wrong = buildChannelsCommandPayload(["external", "subscribe", "slack", "channel-subscription:slack:wrong"], { externalSubscriptions: plans });
  assertEqual(wrong.isError, true, "wrong signature rejected");
  assertEqual(wrong.action, undefined, "wrong signature emits no action");
  const discord = buildChannelsCommandPayload(["external", "subscribe", "discord", sig], { externalSubscriptions: plans });
  assertEqual(discord.isError, true, "discord without accepted plan rejected");
  assertEqual(discord.action, undefined, "discord without accepted plan emits no action");
  const sigInChannel = buildChannelsCommandPayload(["external", "subscribe", sig, "slack"], { externalSubscriptions: plans });
  assertEqual(sigInChannel.isError, true, "signature in channel position rejected");
  assert(!JSON.stringify(sigInChannel).includes(sig), "signature in channel position redacted");

  const overview = buildChannelsCommandPayload(["external"], { externalSubscriptions: plans });
  assert(overview.output.includes("External Subscription Setup Gates"), "overview renders subscription gates");
  assert(overview.output.includes("/channels external subscribe slack <approval-signature>"), "overview shows command");
  assertEqual(overview.data?.subscriptionCandidateCount, 1, "overview candidate count");
  assertEqual(overview.data?.subscriptionAcceptedCount, 1, "overview accepted count");
  assert(!leaks(overview), "overview leaks no secrets");
}

async function verifyExecute(): Promise<void> {
  section("4. Executor Host Boundary");
  const command: CommandResult = {
    handled: true,
    command: "channels",
    output: "Slack subscription setup request staged.\nExecution: host-mediated.",
    data: { action: "channels_external_subscription_request", channelId: "slack" },
    isError: false,
    action: { kind: "setup_external_channel_subscription", channelId: "slack" },
  };
  const messages: string[] = [];
  const errors: string[] = [];
  const handlers: CommandExecutionHandlers = {
    submitChat: () => {}, exitApp: () => {}, resetSession: () => {}, requestCompaction: () => {}, setBudgetCap: () => {},
    showSystemMessage: (m) => messages.push(m), showErrorMessage: (m) => errors.push(m),
    requestExternalChannelSubscriptionSetup: () => ({ handled: true, command: "channels", output: "Slack subscription setup handoff prepared by host executor.", isError: false, data: { action: "handoff", channelId: "slack" } }),
  };
  assertEqual(await executeCommand(command, handlers), true, "execute handles subscription action");
  assertEqual(errors.length, 0, "no host errors");
  assert(messages.some((m) => m.includes("request staged")), "command output emitted");
  assert(messages.some((m) => m.includes("handoff prepared")), "host output emitted");
  assert(!leaks(messages), "messages leak no secrets");

  const noHandlerMessages: string[] = [];
  assertEqual(await executeCommand(command, { ...handlers, requestExternalChannelSubscriptionSetup: undefined, showSystemMessage: (m) => noHandlerMessages.push(m) }), true, "no handler still handled");
  assertEqual(noHandlerMessages.length, 1, "no handler emits only command output");

  const failureErrors: string[] = [];
  await executeCommand(command, {
    ...handlers,
    showSystemMessage: () => {},
    showErrorMessage: (m) => failureErrors.push(m),
    requestExternalChannelSubscriptionSetup: () => { throw new Error("token=plain-secret api_key=plain-secret credential=plain-secret signature=plain-secret"); },
  });
  assertEqual(failureErrors.length, 1, "host exception emits one bounded error");
  assert(!leaks(failureErrors), "host exception error leaks no credential fragments");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 100 Verification (Slack Subscription Setup Gate)\n");
  await verifyPlanning();
  await verifyFailClosed();
  await verifyGateway();
  await verifyExecute();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 100: Slack subscription setup gate is GREEN.");
}
main().catch((error) => { console.error(error); process.exit(1); });
