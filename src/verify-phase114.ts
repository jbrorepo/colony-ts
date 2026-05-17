/** Phase 114 Verification - Slack event_callback Deferred ACK */

import {
  ChannelAuthPolicy,
  ChannelRegistry,
  ChannelSessionBridge,
  InMemoryChannelAdapter,
  handleExternalChannelVendorWebhookRequest,
  type ChannelSessionRequest,
  type ChannelWebhookSignatureVerificationRequest,
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

const HOST_SECRET = "phase114-host-secret";
const CALLBACK_URL = "https://hooks.example.com/api/channels/slack/external-event";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function containsSensitive(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes(HOST_SECRET) ||
    text.includes("xoxb-phase114-secret") ||
    text.includes("private slack phase114 text") ||
    text.includes("authorization phase114");
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

function slackEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "event_callback",
    token: "xoxb-phase114-secret",
    team_id: "T114",
    event: {
      type: "message",
      user: "U114",
      text: "private slack phase114 text",
      channel: "C114",
      ts: "171000.1140",
      thread_ts: "171000.1130",
      client_msg_id: "client-114",
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
    now: () => "2026-05-05T16:00:00.000Z",
    sessionRunner: async (request) => {
      seen.push(request);
      await runnerGate;
      return { text: `reply:${request.message.messageId}` };
    },
  });
  return { bridge, adapter, seen, releaseRunner: () => releaseRunner?.() };
}

async function verifySlackEventCallbackFastAck(): Promise<void> {
  section("1. Slack event_callback Fast ACK");
  const { bridge, adapter, seen, releaseRunner } = createSlackHarness();
  const verifierCalls: ChannelWebhookSignatureVerificationRequest[] = [];
  const responsePromise = handleExternalChannelVendorWebhookRequest(new Request(CALLBACK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-channel-secret": HOST_SECRET,
      authorization: "Bearer authorization phase114",
    },
    body: JSON.stringify(slackEvent()),
  }), {
    bridge,
    authPolicy: createSlackAuth(),
    vendorSignatureVerifier: (request) => {
      verifierCalls.push(request);
      return { accepted: true, code: "signature_verified", reason: "ok" };
    },
  });

  const earlyResponse = await Promise.race([
    responsePromise,
    delay(25).then(() => null),
  ]);
  const acknowledgedBeforeRunnerFinished = earlyResponse !== null;
  if (!acknowledgedBeforeRunnerFinished) {
    releaseRunner();
  }
  const response = earlyResponse ?? await responsePromise;
  const body = await readJson(response);

  assert(acknowledgedBeforeRunnerFinished, "Slack event ACK returns before runner/reply completion");
  assertEqual(response.status, 202, "Slack event returns accepted HTTP 202");
  assertEqual(body.accepted, true, "Slack event response reports accepted");
  assertEqual(body.channel, "slack", "Slack event response reports channel");
  assertEqual(body.turnStatus, "deferred", "Slack event response reports deferred turn status");
  assertEqual(typeof body.turnId, "undefined", "Slack event response does not fabricate turn id before runner completion");
  assertEqual(verifierCalls.length, 1, "Slack event calls vendor verifier once");
  assert(String(verifierCalls[0]?.rawBody ?? "").includes("private slack phase114 text"), "Verifier receives exact raw body before parsing");
  assertEqual(bridge.status().routeCount, 1, "Slack event creates bridge route before ACK");
  assertEqual(bridge.status().routes[0]?.messageCount, 1, "Slack route records accepted message before ACK");
  assertEqual(seen.length, 0, "Slack event ACK returns before session runner starts");
  assertEqual(adapter.sentMessages.length, 0, "Slack event ACK sends no adapter reply before ACK");
  await delay(5);
  assertEqual(seen.length, 1, "Slack event dispatches runner asynchronously after ACK");
  assertEqual(seen[0]?.message.messageId, "client-114", "Slack client_msg_id becomes message id");
  assertEqual(seen[0]?.message.target.threadId, "171000.1130", "Slack thread route is preserved");
  releaseRunner();
  await delay(5);
  assertEqual(adapter.sentMessages.length, 1, "Slack async runner reply still delivers through adapter");
  assertEqual(adapter.sentMessages[0]?.target.threadId, "171000.1130", "Slack async adapter reply preserves thread route");
  assert(!containsSensitive(body), "Slack fast ACK leaks no token, host secret, auth header, or raw event text");
}

async function verifySlackFailClosedBeforeAck(): Promise<void> {
  section("2. Slack Fast ACK Fail-Closed Boundaries");
  const rejectedHarness = createSlackHarness();
  const rejected = await handleExternalChannelVendorWebhookRequest(new Request(CALLBACK_URL, {
    method: "POST",
    headers: { "x-channel-secret": HOST_SECRET },
    body: JSON.stringify(slackEvent()),
  }), {
    bridge: rejectedHarness.bridge,
    authPolicy: createSlackAuth(),
    vendorSignatureVerifier: () => ({ accepted: false, code: "signature_mismatch", reason: "bad xoxb-phase114-secret" }),
  });
  const rejectedBody = await readJson(rejected);
  assertEqual(rejected.status, 401, "rejected Slack signature blocks fast ACK");
  assertEqual(rejectedBody.errorCode, "signature_mismatch", "rejected Slack signature keeps stable code");
  assertEqual(rejectedHarness.bridge.status().routeCount, 0, "rejected signature does not create route");
  assert(!containsSensitive(rejectedBody), "rejected signature response redacts secrets");

  const missingAuthHarness = createSlackHarness();
  const missingAuth = await handleExternalChannelVendorWebhookRequest(new Request(CALLBACK_URL, {
    method: "POST",
    body: JSON.stringify(slackEvent()),
  }), {
    bridge: missingAuthHarness.bridge,
    authPolicy: createSlackAuth(),
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });
  const missingAuthBody = await readJson(missingAuth);
  assertEqual(missingAuth.status, 403, "missing host auth blocks fast ACK dispatch");
  assertEqual(missingAuthBody.errorCode, "webhook_auth_failed", "missing host auth keeps stable code");
  assertEqual(missingAuthHarness.bridge.status().routeCount, 0, "missing host auth does not create route");
  assert(!containsSensitive(missingAuthBody), "missing host auth response redacts secrets");
}

async function verifySlackUrlVerificationRegression(): Promise<void> {
  section("3. Slack URL Verification Regression");
  const { bridge, adapter } = createSlackHarness();
  const response = await handleExternalChannelVendorWebhookRequest(new Request(CALLBACK_URL, {
    method: "POST",
    body: JSON.stringify({
      type: "url_verification",
      token: "xoxb-phase114-secret",
      challenge: "phase114-challenge",
    }),
  }), {
    bridge,
    authPolicy: createSlackAuth(),
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });
  const body = await readJson(response);
  assertEqual(response.status, 200, "Slack url_verification remains immediate HTTP 200");
  assertEqual(body.challenge, "phase114-challenge", "Slack challenge response still echoes challenge only");
  assertEqual(Object.keys(body).length, 1, "Slack challenge response still contains only challenge");
  assertEqual(bridge.status().routeCount, 0, "Slack challenge still bypasses bridge");
  assertEqual(adapter.sentMessages.length, 0, "Slack challenge still sends no adapter reply");
  assert(!containsSensitive(body), "Slack challenge response leaks no verification token");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 114 Verification (Slack event_callback Deferred ACK)\n");
  await verifySlackEventCallbackFastAck();
  await verifySlackFailClosedBeforeAck();
  await verifySlackUrlVerificationRegression();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 114: Slack event_callback deferred ACK is GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });
