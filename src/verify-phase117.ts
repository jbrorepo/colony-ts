/** Phase 117 Verification - Slack Approved Event Binding Gate */

import { mkdtemp, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import {
  ChannelAuthPolicy,
  ChannelRegistry,
  ChannelSessionBridge,
  InMemoryChannelAdapter,
  JsonExternalChannelApprovedEventBindingStore,
  createExternalChannelSubscriptionApprovalSignature,
  executeExternalChannelSubscriptionSetupHostRequest,
  handleExternalChannelVendorWebhookRequest,
  type ChannelSessionRequest,
  type ExternalChannelApprovedEventBinding,
  type ExternalChannelSubscriptionCandidate,
  type ExternalChannelApprovedEventBindingReader,
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

const HOST_SECRET = "phase117-host-secret";
const CALLBACK_URL = "https://hooks.example.com/api/channels/slack/external-event";

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
    now: () => "2026-05-08T04:21:00.000Z",
    sessionRunner: async (request) => {
      seen.push(request);
      await runnerGate;
      return { text: `reply:${request.message.messageId}` };
    },
  });
  return { bridge, adapter, seen, releaseRunner: () => releaseRunner?.() };
}

function slackEvent(eventType: "message" | "app_mention", overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "event_callback",
    token: "xoxb-phase117-secret",
    team_id: "T117",
    api_app_id: "A117PHASE",
    event: {
      type: eventType,
      user: "U117",
      text: eventType === "app_mention" ? "<@UCOLONY> phase117 token=private" : "phase117 token=private",
      channel: "C117",
      ts: eventType === "app_mention" ? "171000.1171" : "171000.1170",
      thread_ts: "171000.1169",
      client_msg_id: eventType === "app_mention" ? "client-117-mention" : "client-117-message",
    },
    ...overrides,
  };
}

function approvedAppMentionBinding(overrides: Partial<ExternalChannelApprovedEventBinding> = {}): ExternalChannelApprovedEventBinding {
  return {
    channelId: "slack",
    appId: "A117PHASE",
    accountId: "T117",
    eventTypes: ["app_mention"],
    approvedBy: "operator",
    approvedAt: "2026-05-08T04:21:00.000Z",
    enabled: true,
    ...overrides,
  };
}

function slackSubscriptionCandidate(eventTypes: string[] = ["message.channels"]): ExternalChannelSubscriptionCandidate {
  return {
    channelId: "slack",
    appId: "A117PHASE",
    workspaceId: "T117",
    callbackUrl: CALLBACK_URL,
    signingSecretRef: "vault:phase117-signing-secret",
    appConfigToken: "xapp-phase117-secret-token",
    manifest: {
      display_information: { name: "Colony Phase 117" },
      oauth_config: { scopes: { bot: eventTypes.includes("app_mention") ? ["app_mentions:read"] : ["channels:history"] } },
      settings: { socket_mode_enabled: false },
    },
    enabled: true,
    eventTypes,
  };
}

async function approvedSlackSubscriptionCandidate(eventTypes: string[] = ["message.channels"]): Promise<ExternalChannelSubscriptionCandidate> {
  const pending = slackSubscriptionCandidate(eventTypes);
  const signature = await createExternalChannelSubscriptionApprovalSignature(pending);
  return {
    ...pending,
    approval: {
      approvedBy: "operator",
      approvedAt: "2026-05-08T04:21:00.000Z",
      signature,
    },
  };
}

async function createBindingStore(): Promise<JsonExternalChannelApprovedEventBindingStore> {
  const rootDir = await mkdtemp(join(tmpdir(), "colony-phase117-"));
  return new JsonExternalChannelApprovedEventBindingStore({ rootDir });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function containsSensitive(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes(HOST_SECRET) ||
    text.includes("xoxb-phase117-secret") ||
    text.includes("xapp-phase117-secret-token") ||
    text.includes("vault:phase117-signing-secret") ||
    text.includes(CALLBACK_URL) ||
    text.includes("token=private") ||
    text.includes("phase117-signature");
}

async function postSlackEvent(
  bridge: ChannelSessionBridge,
  body: Record<string, unknown>,
  approvedEventBindings?: ExternalChannelApprovedEventBinding[],
  approvedEventBindingStore?: ExternalChannelApprovedEventBindingReader,
): Promise<Response> {
  return await handleExternalChannelVendorWebhookRequest(new Request(CALLBACK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-channel-secret": HOST_SECRET,
    },
    body: JSON.stringify(body),
  }), {
    bridge,
    authPolicy: createSlackAuth(),
    approvedEventBindings,
    approvedEventBindingStore,
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });
}

async function verifySlackBindingRejectsUnapprovedEventType(): Promise<void> {
  section("1. Slack Approved Binding Rejects Unapproved Event Type");
  const { bridge, adapter, seen, releaseRunner } = createSlackHarness();

  const response = await postSlackEvent(bridge, slackEvent("message"), [approvedAppMentionBinding()]);
  const body = await readJson(response);

  assertEqual(response.status, 403, "unapproved Slack message event is rejected before bridge acceptance");
  assertEqual(body.errorCode, "external_event_binding_rejected", "unapproved Slack event uses stable binding rejection code");
  assertEqual(bridge.status().routeCount, 0, "unapproved Slack event creates no route");
  await delay(5);
  assertEqual(seen.length, 0, "unapproved Slack event dispatches no runner");
  assertEqual(adapter.sentMessages.length, 0, "unapproved Slack event sends no adapter reply");
  releaseRunner();
  assert(!containsSensitive(body), "unapproved Slack event rejection leaks no token, host secret, raw event text, or approval detail");
}

async function verifyApprovedSlackSetupPersistsRedactedBinding(): Promise<JsonExternalChannelApprovedEventBindingStore> {
  section("2. Approved Slack Setup Persists Redacted Binding");
  const store = await createBindingStore();
  const candidate = await approvedSlackSubscriptionCandidate(["message.channels"]);
  let manifestBody: Record<string, unknown> | undefined;
  const result = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [candidate],
    eventBindingStore: store,
    fetchImpl: async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      manifestBody = JSON.parse(String(body.manifest ?? "{}")) as Record<string, unknown>;
      return new Response(JSON.stringify({
        ok: true,
        app_id: "A117PHASE",
        team_id: "T117",
        manifest: manifestBody,
      }), { status: 200 });
    },
  });
  const bindings = await store.loadApprovedEventBindings();
  const binding = bindings[0];
  const eventSubscriptions = ((manifestBody?.settings as Record<string, unknown> | undefined)?.event_subscriptions ?? {}) as Record<string, unknown>;

  assertEqual(result.isError, false, "approved Slack setup succeeds with binding store");
  assertEqual(result.data.eventBindingPersisted, true, "approved Slack setup reports binding persistence");
  assertEqual(JSON.stringify(eventSubscriptions.bot_events), JSON.stringify(["message.channels"]), "approved Slack setup preserves message.channels bot event");
  assertEqual(bindings.length, 1, "approved Slack setup appends one durable binding");
  assertEqual(binding?.channelId, "slack", "durable binding records Slack channel");
  assertEqual(binding?.accountId, "T117", "durable binding records workspace id");
  assertEqual(JSON.stringify(binding?.eventTypes), JSON.stringify(["message.channels"]), "durable binding records approved event types");
  assertEqual(binding?.signingSecretRef, "[REDACTED_REF]", "durable binding redacts signing secret reference");
  assertEqual(typeof binding?.callbackUrlFingerprint, "string", "durable binding stores callback URL fingerprint");
  assertEqual(typeof binding?.approvalSignatureFingerprint, "string", "durable binding stores approval signature fingerprint");
  assertEqual(binding?.active, true, "durable binding is active");
  assert(!containsSensitive([result, bindings]), "durable binding output leaks no app token, signing ref, callback URL, host secret, or raw approval detail");
  return store;
}

async function verifyDurableMessageBindingDispatchesMessageOnly(store: JsonExternalChannelApprovedEventBindingStore): Promise<void> {
  section("3. Durable Slack Binding Dispatches Only Approved Event");
  const messageHarness = createSlackHarness();
  const messageResponse = await postSlackEvent(messageHarness.bridge, slackEvent("message"), undefined, store);
  const messageBody = await readJson(messageResponse);

  assertEqual(messageResponse.status, 202, "durable message.channels binding accepts Slack message event");
  assertEqual(messageBody.turnStatus, "deferred", "durable message.channels binding preserves deferred ACK");
  await delay(5);
  assertEqual(messageHarness.seen.length, 1, "durable message.channels binding dispatches runner once");
  messageHarness.releaseRunner();

  const mentionHarness = createSlackHarness();
  const mentionResponse = await postSlackEvent(mentionHarness.bridge, slackEvent("app_mention"), undefined, store);
  const mentionBody = await readJson(mentionResponse);

  assertEqual(mentionResponse.status, 403, "durable message.channels binding rejects Slack app_mention event");
  assertEqual(mentionBody.errorCode, "external_event_binding_rejected", "durable binding mismatch uses stable rejection code");
  assertEqual(mentionHarness.bridge.status().routeCount, 0, "durable binding mismatch creates no route");
  await delay(5);
  assertEqual(mentionHarness.seen.length, 0, "durable binding mismatch dispatches no runner");
  mentionHarness.releaseRunner();
  assert(!containsSensitive([messageBody, mentionBody]), "durable binding dispatch responses leak no secrets or raw event text");
}

async function verifySlackBindingAcceptsApprovedEventType(): Promise<void> {
  section("4. Slack Approved Binding Accepts Approved Event Type");
  const { bridge, adapter, seen, releaseRunner } = createSlackHarness();

  const response = await postSlackEvent(bridge, slackEvent("app_mention"), [approvedAppMentionBinding()]);
  const body = await readJson(response);

  assertEqual(response.status, 202, "approved Slack app_mention event receives accepted ACK");
  assertEqual(body.turnStatus, "deferred", "approved Slack app_mention keeps deferred turn status");
  assertEqual(bridge.status().routeCount, 1, "approved Slack app_mention creates a bridge route");
  await delay(5);
  assertEqual(seen.length, 1, "approved Slack app_mention dispatches runner asynchronously");
  assertEqual(seen[0]?.message.metadata?.eventType, "app_mention", "approved Slack app_mention preserves event type metadata");
  assertEqual(seen[0]?.message.metadata?.teamId, "T117", "approved Slack app_mention preserves team id metadata");
  releaseRunner();
  await delay(5);
  assertEqual(adapter.sentMessages.length, 1, "approved Slack app_mention still sends async adapter reply");
  assert(!containsSensitive(body), "approved Slack app_mention ACK leaks no token, host secret, or raw event text");
}

async function verifySlackBindingRejectsWrongWorkspace(): Promise<void> {
  section("5. Slack Approved Binding Rejects Wrong Workspace");
  const { bridge, adapter, seen, releaseRunner } = createSlackHarness();
  const response = await postSlackEvent(bridge, slackEvent("app_mention", { team_id: "T117-OTHER" }), [approvedAppMentionBinding()]);
  const body = await readJson(response);

  assertEqual(response.status, 403, "wrong Slack team id is rejected before bridge acceptance");
  assertEqual(body.errorCode, "external_event_binding_rejected", "wrong Slack team id uses stable binding rejection code");
  assertEqual(bridge.status().routeCount, 0, "wrong Slack team id creates no route");
  await delay(5);
  assertEqual(seen.length, 0, "wrong Slack team id dispatches no runner");
  assertEqual(adapter.sentMessages.length, 0, "wrong Slack team id sends no adapter reply");
  releaseRunner();
  assert(!containsSensitive(body), "wrong Slack team id rejection leaks no token, host secret, or raw event text");
}

async function verifyAbsentBindingPolicyPreservesExistingHostOwnedBehavior(): Promise<void> {
  section("6. No Binding Policy Preserves Existing Behavior");
  const { bridge, seen, releaseRunner } = createSlackHarness();
  const response = await postSlackEvent(bridge, slackEvent("message"));
  const body = await readJson(response);

  assertEqual(response.status, 202, "host-owned Slack message dispatch remains accepted when no binding policy is supplied");
  assertEqual(body.turnStatus, "deferred", "no binding policy preserves deferred ACK behavior");
  await delay(5);
  assertEqual(seen.length, 1, "no binding policy still dispatches runner");
  releaseRunner();
  assert(!containsSensitive(body), "no binding policy ACK leaks no token, host secret, or raw event text");
}

async function verifyMalformedBindingStoreFailsClosed(): Promise<void> {
  section("7. Malformed Binding Journal Fails Closed");
  const rootDir = await mkdtemp(join(tmpdir(), "colony-phase117-bad-"));
  await writeFile(join(rootDir, "external-channel-event-bindings.jsonl"), "{\"recordType\":\"external_channel_approved_event_binding\",\"channelId\":\"slack\",\"accountId\":\"T117\",\"eventTypes\":[\"message.channels\"],\"rawToken\":\"xapp-phase117-secret-token\"}\n", "utf8");
  const badStore = new JsonExternalChannelApprovedEventBindingStore({ rootDir });
  const { bridge, seen, releaseRunner } = createSlackHarness();
  const response = await postSlackEvent(bridge, slackEvent("message"), undefined, badStore);
  const body = await readJson(response);

  assertEqual(response.status, 403, "malformed binding journal rejects Slack dispatch");
  assertEqual(body.errorCode, "external_event_binding_rejected", "malformed binding journal uses stable binding rejection code");
  assertEqual(bridge.status().routeCount, 0, "malformed binding journal creates no route");
  await delay(5);
  assertEqual(seen.length, 0, "malformed binding journal dispatches no runner");
  releaseRunner();
  assert(!containsSensitive(body), "malformed binding journal response leaks no stored secret");
}

async function verifyMalformedInjectedBindingFailsClosed(): Promise<void> {
  section("8. Malformed Injected Binding Fails Closed");
  const { bridge, seen, releaseRunner } = createSlackHarness();
  const malformedBinding = {
    ...approvedAppMentionBinding(),
    rawToken: "xapp-phase117-secret-token",
  } as ExternalChannelApprovedEventBinding;
  const response = await postSlackEvent(bridge, slackEvent("app_mention"), [malformedBinding]);
  const body = await readJson(response);

  assertEqual(response.status, 403, "malformed injected binding rejects Slack dispatch");
  assertEqual(body.errorCode, "external_event_binding_rejected", "malformed injected binding uses stable binding rejection code");
  assertEqual(bridge.status().routeCount, 0, "malformed injected binding creates no route");
  await delay(5);
  assertEqual(seen.length, 0, "malformed injected binding dispatches no runner");
  releaseRunner();
  assert(!containsSensitive(body), "malformed injected binding response leaks no injected secret");
}

async function verifySlackBindingRejectsWrongAppId(): Promise<void> {
  section("9. Slack Approved Binding Rejects Wrong App Id");
  const { bridge, seen, releaseRunner } = createSlackHarness();
  const response = await postSlackEvent(bridge, slackEvent("app_mention", { api_app_id: "A117OTHER" }), [approvedAppMentionBinding()]);
  const body = await readJson(response);

  assertEqual(response.status, 403, "wrong Slack api_app_id is rejected before bridge acceptance");
  assertEqual(body.errorCode, "external_event_binding_rejected", "wrong Slack api_app_id uses stable binding rejection code");
  assertEqual(bridge.status().routeCount, 0, "wrong Slack api_app_id creates no route");
  await delay(5);
  assertEqual(seen.length, 0, "wrong Slack api_app_id dispatches no runner");
  releaseRunner();
  assert(!containsSensitive(body), "wrong Slack api_app_id rejection leaks no token, host secret, or raw event text");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 117 Verification (Slack Approved Event Binding Gate)\n");
  await verifySlackBindingRejectsUnapprovedEventType();
  const store = await verifyApprovedSlackSetupPersistsRedactedBinding();
  await verifyDurableMessageBindingDispatchesMessageOnly(store);
  await verifySlackBindingAcceptsApprovedEventType();
  await verifySlackBindingRejectsWrongWorkspace();
  await verifyAbsentBindingPolicyPreservesExistingHostOwnedBehavior();
  await verifyMalformedBindingStoreFailsClosed();
  await verifyMalformedInjectedBindingFailsClosed();
  await verifySlackBindingRejectsWrongAppId();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 117: Slack approved event binding gate is GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });
