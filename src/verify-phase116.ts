/** Phase 116 Verification - Slack Duplicate Event Retry Dedupe */

import {
  ChannelAuthPolicy,
  ChannelRegistry,
  ChannelSessionBridge,
  InMemoryChannelAdapter,
  handleExternalChannelVendorWebhookRequest,
  type ChannelSessionRequest,
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

const HOST_SECRET = "phase116-host-secret";
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

function slackEvent(eventType: "message" | "app_mention", overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "event_callback",
    token: "xoxb-phase116-secret",
    team_id: "T116",
    event: {
      type: eventType,
      user: "U116",
      text: eventType === "app_mention" ? "<@UCOLONY> phase116 token=private" : "phase116 token=private",
      channel: "C116",
      ts: eventType === "app_mention" ? "171000.1161" : "171000.1160",
      thread_ts: "171000.1159",
      client_msg_id: eventType === "app_mention" ? "client-116-mention" : "client-116-message",
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
    now: () => "2026-05-08T04:05:00.000Z",
    sessionRunner: async (request) => {
      seen.push(request);
      await runnerGate;
      return { text: `reply:${request.message.messageId}` };
    },
  });
  return { bridge, adapter, seen, releaseRunner: () => releaseRunner?.() };
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
    text.includes("xoxb-phase116-secret") ||
    text.includes("token=private");
}

async function postSlackEvent(bridge: ChannelSessionBridge, body: Record<string, unknown>): Promise<Response> {
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
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });
}

async function verifyDuplicateSlackCallbackIsAckedButNotRedispatched(eventType: "message" | "app_mention"): Promise<void> {
  section(`Slack ${eventType} duplicate retry dedupe`);
  const { bridge, adapter, seen, releaseRunner } = createSlackHarness();
  const body = slackEvent(eventType);

  const first = await postSlackEvent(bridge, body);
  const firstBody = await readJson(first);
  const second = await postSlackEvent(bridge, body);
  const secondBody = await readJson(second);

  assertEqual(first.status, 202, "first Slack callback receives accepted ACK");
  assertEqual(firstBody.turnStatus, "deferred", "first Slack callback keeps deferred turn status");
  assertEqual(second.status, 202, "duplicate Slack retry receives accepted ACK");
  assertEqual(secondBody.turnStatus, "duplicate", "duplicate Slack retry reports duplicate turn status");
  assertEqual(secondBody.duplicate, true, "duplicate Slack retry is explicitly marked duplicate");
  assertEqual(bridge.status().routeCount, 1, "duplicate Slack retry does not create another route");
  assertEqual(bridge.status().routes[0]?.messageCount, 1, "duplicate Slack retry does not increment route message count");
  await delay(5);
  assertEqual(seen.length, 1, "duplicate Slack retry does not dispatch another session runner");
  releaseRunner();
  await delay(5);
  assertEqual(adapter.sentMessages.length, 1, "duplicate Slack retry does not send another adapter reply");
  assert(!containsSensitive([firstBody, secondBody]), "duplicate Slack retry ACK leaks no token, host secret, or raw event text");
}

async function verifyDistinctSlackMessageStillDispatches(): Promise<void> {
  section("Distinct Slack callback regression");
  const { bridge, adapter, seen, releaseRunner } = createSlackHarness();
  const first = slackEvent("message");
  const second = slackEvent("message", {
    event: {
      type: "message",
      user: "U116",
      text: "phase116 second distinct message",
      channel: "C116",
      ts: "171000.1162",
      thread_ts: "171000.1159",
      client_msg_id: "client-116-message-2",
    },
  });

  const firstResponse = await postSlackEvent(bridge, first);
  const secondResponse = await postSlackEvent(bridge, second);
  await delay(5);

  assertEqual(firstResponse.status, 202, "first distinct Slack callback is accepted");
  assertEqual(secondResponse.status, 202, "second distinct Slack callback is accepted");
  assertEqual(bridge.status().routes[0]?.messageCount, 2, "distinct Slack callbacks still increment route message count");
  assertEqual(seen.length, 2, "distinct Slack callbacks still dispatch session runner twice");
  releaseRunner();
  await delay(5);
  assertEqual(adapter.sentMessages.length, 2, "distinct Slack callbacks still send separate replies");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 116 Verification (Slack Duplicate Event Retry Dedupe)\n");
  await verifyDuplicateSlackCallbackIsAckedButNotRedispatched("message");
  await verifyDuplicateSlackCallbackIsAckedButNotRedispatched("app_mention");
  await verifyDistinctSlackMessageStillDispatches();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 116: Slack duplicate event retry dedupe is GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });
