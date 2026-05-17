/** Phase 115 Verification - Slack app_mention Subscription and Deferred ACK */

import {
  ChannelAuthPolicy,
  ChannelRegistry,
  ChannelSessionBridge,
  InMemoryChannelAdapter,
  createExternalChannelSubscriptionApprovalSignature,
  executeExternalChannelSubscriptionSetupHostRequest,
  handleExternalChannelVendorWebhookRequest,
  planExternalChannelSubscriptions,
  type ChannelSessionRequest,
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

const HOST_SECRET = "phase115-host-secret";
const CALLBACK_URL = "https://hooks.example.com/api/channels/slack/external-event";
const APP_CONFIG_TOKEN = "xapp-phase115-secret-token";
const SIGNING_SECRET_REF = "vault:phase115-slack-signing-secret";

function candidate(overrides: Partial<SlackSubscriptionCandidate> = {}): SlackSubscriptionCandidate {
  return {
    channelId: "slack",
    appId: "A115PHASE",
    workspaceId: "T115PHASE",
    callbackUrl: CALLBACK_URL,
    signingSecretRef: SIGNING_SECRET_REF,
    appConfigToken: APP_CONFIG_TOKEN,
    manifest: {
      display_information: { name: "Colony Phase 115" },
      oauth_config: { scopes: { bot: ["app_mentions:read"] } },
      settings: { socket_mode_enabled: false },
    },
    enabled: true,
    eventTypes: ["app_mention"],
    ...overrides,
  };
}

async function approved(overrides: Partial<SlackSubscriptionCandidate> = {}): Promise<SlackSubscriptionCandidate> {
  const base = candidate(overrides);
  const signature = await createExternalChannelSubscriptionApprovalSignature(base);
  return { ...base, approval: { approvedBy: "operator", approvedAt: "2026-05-08T03:50:00.000Z", signature } };
}

function createSlackAuth(): ChannelAuthPolicy {
  return new ChannelAuthPolicy({
    channels: {
      slack: {
        webhookSecret: HOST_SECRET,
        groupPolicy: "open",
      },
    },
  });
}

function slackAppMention(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "event_callback",
    token: "xoxb-phase115-secret",
    team_id: "T115PHASE",
    event: {
      type: "app_mention",
      user: "U115",
      text: "<@UCOLONY> summarize this thread token=plain-secret",
      channel: "C115",
      ts: "171000.1150",
      thread_ts: "171000.1149",
      client_msg_id: "client-115",
    },
    ...overrides,
  };
}

function createSlackHarness(): {
  bridge: ChannelSessionBridge;
  adapter: InMemoryChannelAdapter;
  seen: ChannelSessionRequest[];
  releaseRunner: () => void;
} {
  const registry = new ChannelRegistry();
  const adapter = new InMemoryChannelAdapter({ channelId: "slack" });
  registry.register(adapter);
  const seen: ChannelSessionRequest[] = [];
  let releaseRunner: (() => void) | undefined;
  const runnerGate = new Promise<void>((resolve) => { releaseRunner = resolve; });
  const bridge = new ChannelSessionBridge({
    registry,
    now: () => "2026-05-08T03:50:00.000Z",
    sessionRunner: async (request) => {
      seen.push(request);
      await runnerGate;
      return { text: `reply:${request.message.messageId}` };
    },
  });
  return { bridge, adapter, seen, releaseRunner: () => releaseRunner?.() };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function arrayField(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function containsSensitive(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes(APP_CONFIG_TOKEN) ||
    text.includes(SIGNING_SECRET_REF) ||
    text.includes(CALLBACK_URL) ||
    text.includes(HOST_SECRET) ||
    text.includes("xoxb-phase115-secret") ||
    text.includes("token=plain-secret");
}

async function verifyAppMentionPlanningAndSetup(): Promise<void> {
  section("1. Slack app_mention Planning and Host Setup");
  const pending = candidate();
  const signature = await createExternalChannelSubscriptionApprovalSignature(pending);
  const plans = await planExternalChannelSubscriptions([pending]);
  const inspection = plans[0]?.redactedConfig.slackManifestInspection as Record<string, unknown> | undefined;

  assertEqual(plans[0]?.accepted, false, "app_mention plan still requires exact approval");
  assert(signature.startsWith("channel-subscription:slack:"), "app_mention approval signature is Slack-scoped");
  assertEqual(JSON.stringify(plans[0]?.redactedConfig.eventTypes), JSON.stringify(["app_mention"]), "app_mention event type is visible in redacted config");
  assertEqual(inspection?.scopeCompatibility, "ready", "app_mention manifest scope readiness is ready");
  assert(arrayField(inspection?.requiredBotScopes).includes("app_mentions:read"), "app_mention requires app_mentions:read bot scope");
  assert(!containsSensitive([plans, signature]), "app_mention plan leaks no token, signing ref, callback URL, or raw event text");

  const accepted = await approved();
  const acceptedPlans = await planExternalChannelSubscriptions([accepted]);
  const overview = buildChannelsCommandPayload(["external"], { externalSubscriptions: acceptedPlans });
  assertEqual(acceptedPlans[0]?.accepted, true, "approved app_mention plan is accepted");
  assert(overview.output.includes("plannedBotEvents:[app_mention]"), "/channels external renders planned app_mention event");
  assert(overview.output.includes("requiredBotScopes:[app_mentions:read]"), "/channels external renders app_mention scope");

  let manifestBody: Record<string, unknown> | undefined;
  const result = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [accepted],
    fetchImpl: async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      manifestBody = JSON.parse(String(body.manifest ?? "{}")) as Record<string, unknown>;
      return new Response(JSON.stringify({
        ok: true,
        app_id: "A115PHASE",
        team_id: "T115PHASE",
        manifest: manifestBody,
      }), { status: 200 });
    },
  });
  const eventSubscriptions = ((manifestBody?.settings as Record<string, unknown> | undefined)?.event_subscriptions ?? {}) as Record<string, unknown>;

  assertEqual(result.isError, false, "approved app_mention host setup succeeds");
  assertEqual(JSON.stringify(eventSubscriptions.bot_events), JSON.stringify(["app_mention"]), "host setup patches only app_mention bot event");
  assertEqual(JSON.stringify(result.data.eventTypes), JSON.stringify(["app_mention"]), "host setup reports app_mention event type");
  const readiness = result.data.activationReadiness as Record<string, unknown> | undefined;
  assertEqual(readiness?.liveInboundDeliveryEnabled, false, "activation readiness still does not claim live delivery");
  assert(!("retryWorkerId" in result.data), "app_mention setup creates no retry worker");
  assert(!("retryScheduledAt" in result.data), "app_mention setup creates no retry schedule");
  assert(!containsSensitive(result), "app_mention setup leaks no token, signing ref, callback URL, or raw event text");
}

async function verifyAppMentionFailClosedScopesAndMutation(): Promise<void> {
  section("2. Slack app_mention Fail-Closed Boundaries");
  const missingScope = candidate({
    manifest: {
      display_information: { name: "Colony Phase 115" },
      oauth_config: { scopes: { bot: ["channels:history"] } },
    },
  });
  const missingPlans = await planExternalChannelSubscriptions([missingScope]);
  const inspection = missingPlans[0]?.redactedConfig.slackManifestInspection as Record<string, unknown> | undefined;
  assertEqual(missingPlans[0]?.accepted, false, "missing app_mentions:read scope is rejected");
  assert(arrayField(inspection?.missingBotScopes).includes("app_mentions:read"), "missing scope inspection names app_mentions:read");

  const accepted = await approved();
  const mutatedEvents = await planExternalChannelSubscriptions([{ ...accepted, eventTypes: ["message.channels", "app_mention"] }]);
  assertEqual(mutatedEvents[0]?.accepted, false, "multi-event Slack expansion remains blocked in this slice");
  assert(String(mutatedEvents[0]?.reason ?? "").includes("eventTypes"), "multi-event rejection names event type boundary");
  assert(!containsSensitive([missingPlans, mutatedEvents]), "fail-closed app_mention paths leak no secrets");
}

async function verifyAppMentionWebhookDeferredAck(): Promise<void> {
  section("3. Slack app_mention Deferred ACK");
  const { bridge, adapter, seen, releaseRunner } = createSlackHarness();
  const responsePromise = handleExternalChannelVendorWebhookRequest(new Request(CALLBACK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-channel-secret": HOST_SECRET,
    },
    body: JSON.stringify(slackAppMention()),
  }), {
    bridge,
    authPolicy: createSlackAuth(),
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });

  const earlyResponse = await Promise.race([
    responsePromise,
    delay(25).then(() => null),
  ]);
  const acknowledgedBeforeRunnerFinished = earlyResponse !== null;
  if (!acknowledgedBeforeRunnerFinished) releaseRunner();
  const response = earlyResponse ?? await responsePromise;
  const body = await readJson(response);

  assert(acknowledgedBeforeRunnerFinished, "app_mention ACK returns before runner completion");
  assertEqual(response.status, 202, "app_mention returns HTTP 202");
  assertEqual(body.turnStatus, "deferred", "app_mention response reports deferred turn status");
  assertEqual(adapter.sentMessages.length, 0, "app_mention sends no adapter reply before ACK");
  await delay(5);
  assertEqual(seen.length, 1, "app_mention dispatches runner asynchronously");
  assertEqual(seen[0]?.message.messageId, "client-115", "app_mention client_msg_id becomes message id");
  assertEqual(seen[0]?.message.target.threadId, "171000.1149", "app_mention thread route is preserved");
  assertEqual(seen[0]?.message.metadata?.eventType, "app_mention", "app_mention metadata preserves vendor event type");
  releaseRunner();
  await delay(5);
  assertEqual(adapter.sentMessages.length, 1, "app_mention async reply still delivers through adapter");
  assertEqual(adapter.sentMessages[0]?.target.threadId, "171000.1149", "app_mention async reply preserves thread route");
  assert(!containsSensitive(body), "app_mention ACK leaks no token, host secret, or raw event text");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 115 Verification (Slack app_mention Subscription and Deferred ACK)\n");
  await verifyAppMentionPlanningAndSetup();
  await verifyAppMentionFailClosedScopesAndMutation();
  await verifyAppMentionWebhookDeferredAck();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 115: Slack app_mention subscription and deferred ACK are GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });
