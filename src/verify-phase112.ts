/** Phase 112 Verification - Discord APPLICATION_COMMAND Inbound Dispatch */

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

const HOST_SECRET = "phase112-host-secret";
const PUBLIC_KEY_REF = "vault:phase112-discord-public-key";
const INTERACTION_TOKEN = "discord-token-phase112";
const CALLBACK_URL = "https://hooks.example.com/api/channels/discord/external-event";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function containsSensitive(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes(HOST_SECRET) ||
    text.includes(PUBLIC_KEY_REF) ||
    text.includes(INTERACTION_TOKEN) ||
    text.includes("phase112-signature-secret") ||
    text.includes("phase112-url-secret") ||
    text.includes("private command prompt") ||
    text.includes("authorization phase112");
}

function createDiscordHarness(): {
  bridge: ChannelSessionBridge;
  adapter: InMemoryChannelAdapter;
  seen: ChannelSessionRequest[];
} {
  const registry = new ChannelRegistry();
  const adapter = new InMemoryChannelAdapter({ channelId: "discord" });
  registry.register(adapter);
  const seen: ChannelSessionRequest[] = [];
  const bridge = new ChannelSessionBridge({
    registry,
    now: () => "2026-05-05T03:56:00.000Z",
    sessionRunner: async (request) => {
      seen.push(request);
      return {};
    },
  });
  return { bridge, adapter, seen };
}

function createDiscordAuth(): ChannelAuthPolicy {
  return new ChannelAuthPolicy({
    channels: {
      discord: {
        webhookSecret: HOST_SECRET,
        groupPolicy: "open",
      },
    },
  });
}

function applicationCommand(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "112000000000000001",
    application_id: "112000000000000002",
    type: 2,
    token: INTERACTION_TOKEN,
    channel_id: "112000000000000003",
    guild_id: "112000000000000004",
    member: {
      user: {
        id: "112000000000000005",
        username: "ada",
        global_name: "Ada Lovelace",
      },
    },
    data: {
      id: "112000000000000006",
      name: "colony",
      options: [
        { name: "prompt", value: "private command prompt" },
        { name: "dry_run", value: true },
        { name: "count", value: 3 },
      ],
    },
    ...overrides,
  };
}

async function verifyApplicationCommandDispatch(): Promise<void> {
  section("1. Discord APPLICATION_COMMAND Dispatch");
  const registry = new ChannelRegistry();
  const adapter = new InMemoryChannelAdapter({ channelId: "discord" });
  registry.register(adapter);
  const seen: ChannelSessionRequest[] = [];
  let releaseRunner: (() => void) | undefined;
  const runnerGate = new Promise<void>((resolve) => { releaseRunner = resolve; });
  const bridge = new ChannelSessionBridge({
    registry,
    now: () => "2026-05-05T03:56:00.000Z",
    sessionRunner: async (request) => {
      seen.push(request);
      await runnerGate;
      return { text: "late command reply" };
    },
  });
  const verifierCalls: ChannelWebhookSignatureVerificationRequest[] = [];
  const responsePromise = handleExternalChannelVendorWebhookRequest(new Request(CALLBACK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-channel-secret": HOST_SECRET,
      "x-signature-ed25519": "phase112-signature",
      "x-signature-timestamp": "1710000112",
      authorization: "Bearer authorization phase112",
    },
    body: JSON.stringify(applicationCommand()),
  }), {
    bridge,
    authPolicy: createDiscordAuth(),
    vendorSignatureVerifier: (request) => {
      verifierCalls.push(request);
      return { accepted: true, code: "signature_verified", reason: "ok" };
    },
  });
  const acknowledgedBeforeRunnerFinished = await Promise.race([
    responsePromise.then(() => true),
    delay(25).then(() => false),
  ]);
  const response = await responsePromise;
  const body = await readJson(response);

  assert(acknowledgedBeforeRunnerFinished, "Discord command ACK returns before runner/reply completion");
  assertEqual(response.status, 200, "Discord command returns HTTP 200 ACK");
  assertEqual(body.type, 5, "Discord command returns deferred channel message ACK type 5");
  assertEqual(Object.keys(body).length, 1, "Discord command ACK exposes only type");
  assertEqual(verifierCalls.length, 1, "Discord command calls vendor signature verifier once");
  assert(String(verifierCalls[0]?.rawBody ?? "").includes("private command prompt"), "Verifier receives exact raw interaction body before parsing");
  assertEqual(bridge.status().routeCount, 1, "Discord command creates a bridge route");
  assertEqual(bridge.status().routes[0]?.messageCount, 1, "Discord command is accepted into bridge route before runner starts");
  assertEqual(seen.length, 0, "Discord command ACK returns before session runner starts");
  await delay(5);
  assertEqual(seen.length, 1, "Discord command dispatches exactly once to session runner");
  assertEqual(seen[0]?.message.messageId, "112000000000000001", "command interaction id becomes message id");
  assertEqual(seen[0]?.message.senderId, "112000000000000005", "member.user.id becomes sender id");
  assertEqual(seen[0]?.message.senderName, "Ada Lovelace", "global name becomes sender name");
  assertEqual(seen[0]?.message.target.targetKind, "channel", "command targets Discord channel");
  assertEqual(seen[0]?.message.target.targetId, "112000000000000003", "channel id becomes target id");
  assertEqual(seen[0]?.message.target.accountId, "112000000000000004", "guild id becomes account id");
  assertEqual(seen[0]?.message.text, "/colony prompt=\"private command prompt\" dry_run=true count=3", "command options render into deterministic text");
  assertEqual((seen[0]?.message.metadata as Record<string, unknown> | undefined)?.eventType, "application_command", "metadata records command event type");
  assertEqual((seen[0]?.message.metadata as Record<string, unknown> | undefined)?.commandName, "colony", "metadata records command name");
  assertEqual((seen[0]?.message.metadata as Record<string, unknown> | undefined)?.suppressImmediateChannelReply, undefined, "reply suppression is not controlled by inbound metadata");
  assertEqual(adapter.sentMessages.length, 0, "deferred ACK path sends no adapter reply before ACK");
  releaseRunner?.();
  await delay(5);
  assertEqual(adapter.sentMessages.length, 0, "deferred interaction does not emit unmatched adapter reply after ACK");
  assert(!containsSensitive(body), "command ACK leaks no token, host secret, callback secret, or command text");
}

async function verifyFallbackUserAndBounds(): Promise<void> {
  section("2. Discord Command Fallback User And Bounds");
  const { bridge, seen } = createDiscordHarness();
  const longValue = "x".repeat(300);
  const response = await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/discord/external-event", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-channel-secret": HOST_SECRET,
    },
    body: JSON.stringify(applicationCommand({
      member: undefined,
      user: { id: "112-user-fallback", username: "fallback" },
      data: {
        id: "112-command-fallback",
        name: "status",
        options: [{ name: "note", value: longValue }],
      },
    })),
  }), {
    bridge,
    authPolicy: createDiscordAuth(),
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });
  const body = await readJson(response);

  assertEqual(response.status, 200, "fallback user command is accepted");
  assertEqual(body.type, 5, "fallback user command returns deferred ACK");
  await delay(5);
  assertEqual(seen[0]?.message.senderId, "112-user-fallback", "top-level user.id is fallback sender id");
  assertEqual(seen[0]?.message.senderName, "fallback", "top-level username is fallback sender name");
  assert(String(seen[0]?.message.text ?? "").startsWith("/status note=\""), "long option renders as quoted command text");
  assert(String(seen[0]?.message.text ?? "").length < 180, "command text is bounded before bridge dispatch");
  assert(!containsSensitive(body), "fallback ACK leaks no command body or token");

  const subcommandHarness = createDiscordHarness();
  await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/discord/external-event", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-channel-secret": HOST_SECRET,
    },
    body: JSON.stringify(applicationCommand({
      data: {
        id: "112-command-subcommand",
        name: "colony",
        options: [{
          name: "admin",
          options: [{
            name: "restart",
            options: [{ name: "force", value: true }],
          }],
        }],
      },
    })),
  }), {
    bridge: subcommandHarness.bridge,
    authPolicy: createDiscordAuth(),
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });
  await delay(5);
  assertEqual(subcommandHarness.seen[0]?.message.text, "/colony admin restart force=true", "nested subcommand options render into command text");
}

async function verifyRapidDeferredRouteSnapshots(): Promise<void> {
  section("3. Discord Command Deferred Route Snapshots");
  const { bridge, seen } = createDiscordHarness();
  const requestOptions = {
    bridge,
    authPolicy: createDiscordAuth(),
    vendorSignatureVerifier: () => ({ accepted: true as const, code: "signature_verified", reason: "ok" }),
  };

  const first = await handleExternalChannelVendorWebhookRequest(new Request(CALLBACK_URL, {
    method: "POST",
    headers: { "x-channel-secret": HOST_SECRET },
    body: JSON.stringify(applicationCommand({ id: "rapid-command-1" })),
  }), requestOptions);
  const second = await handleExternalChannelVendorWebhookRequest(new Request(CALLBACK_URL, {
    method: "POST",
    headers: { "x-channel-secret": HOST_SECRET },
    body: JSON.stringify(applicationCommand({ id: "rapid-command-2" })),
  }), requestOptions);
  await delay(5);

  assertEqual(first.status, 200, "first rapid command is accepted");
  assertEqual(second.status, 200, "second rapid command is accepted");
  assertEqual(seen.length, 2, "rapid commands both reach the runner");
  assertEqual(seen[0]?.route.lastInboundMessageId, "rapid-command-1", "first deferred runner sees its acceptance route snapshot");
  assertEqual(seen[0]?.route.messageCount, 1, "first deferred runner sees first acceptance message count");
  assertEqual(seen[1]?.route.lastInboundMessageId, "rapid-command-2", "second deferred runner sees its acceptance route snapshot");
  assertEqual(seen[1]?.route.messageCount, 2, "second deferred runner sees second acceptance message count");
}

async function verifyFailClosedPaths(): Promise<void> {
  section("4. Discord Command Fail-Closed Paths");
  const rejectedSignature = await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/discord/external-event", {
    method: "POST",
    headers: { "x-channel-secret": HOST_SECRET },
    body: JSON.stringify(applicationCommand()),
  }), {
    bridge: createDiscordHarness().bridge,
    authPolicy: createDiscordAuth(),
    vendorSignatureVerifier: () => ({ accepted: false, code: "signature_mismatch", reason: "bad phase112-signature-secret" }),
  });
  const rejectedSignatureBody = await readJson(rejectedSignature);
  assertEqual(rejectedSignature.status, 401, "rejected signature blocks command dispatch");
  assertEqual(rejectedSignatureBody.errorCode, "signature_mismatch", "rejected signature keeps stable code");
  assert(!containsSensitive(rejectedSignatureBody), "rejected signature response redacts secrets");

  const missingHostSecretHarness = createDiscordHarness();
  const missingHostSecret = await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/discord/external-event", {
    method: "POST",
    body: JSON.stringify(applicationCommand()),
  }), {
    bridge: missingHostSecretHarness.bridge,
    authPolicy: createDiscordAuth(),
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });
  const missingHostSecretBody = await readJson(missingHostSecret);
  assertEqual(missingHostSecret.status, 403, "missing host auth secret blocks non-PING command");
  assertEqual(missingHostSecretBody.errorCode, "webhook_auth_failed", "missing host auth reports auth failure");
  assertEqual(missingHostSecretHarness.bridge.status().routeCount, 0, "missing host auth does not dispatch command");
  assert(!containsSensitive(missingHostSecretBody), "missing host auth response redacts interaction token");

  const malformedCases = [
    { label: "missing command name", body: applicationCommand({ data: { id: "cmd", options: [] } }) },
    { label: "missing sender", body: applicationCommand({ member: undefined, user: undefined }) },
    { label: "missing channel", body: applicationCommand({ channel_id: undefined }) },
  ];
  for (const item of malformedCases) {
    const harness = createDiscordHarness();
    const response = await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/discord/external-event", {
      method: "POST",
      headers: { "x-channel-secret": HOST_SECRET },
      body: JSON.stringify(item.body),
    }), {
      bridge: harness.bridge,
      authPolicy: createDiscordAuth(),
      vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
    });
    const body = await readJson(response);
    assertEqual(response.status, 400, `${item.label} fails closed`);
    assertEqual(body.errorCode, "malformed_vendor_event", `${item.label} reports malformed vendor event`);
    assertEqual(harness.bridge.status().routeCount, 0, `${item.label} does not dispatch`);
    assert(!containsSensitive(body), `${item.label} response redacts secrets`);
  }
}

async function verifyPingAndMessageRegression(): Promise<void> {
  section("5. Discord PING And Message Regression");
  const pingHarness = createDiscordHarness();
  const ping = await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/discord/external-event", {
    method: "POST",
    headers: { "x-channel-secret": HOST_SECRET },
    body: JSON.stringify({ type: 1, token: INTERACTION_TOKEN }),
  }), {
    bridge: pingHarness.bridge,
    authPolicy: createDiscordAuth(),
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });
  const pingBody = await readJson(ping);
  assertEqual(ping.status, 200, "Discord PING still returns HTTP 200");
  assertEqual(pingBody.type, 1, "Discord PING still returns PONG type 1");
  assertEqual(Object.keys(pingBody).length, 1, "Discord PING response still contains only type");
  assertEqual(pingHarness.bridge.status().routeCount, 0, "Discord PING still bypasses bridge");

  const messageHarness = createDiscordHarness();
  const message = await handleExternalChannelVendorWebhookRequest(new Request("https://hooks.example.com/api/channels/discord/external-event", {
    method: "POST",
    headers: { "x-channel-secret": HOST_SECRET },
    body: JSON.stringify({
      id: "message-112",
      type: 0,
      channel_id: "channel-112",
      guild_id: "guild-112",
      content: "hello message",
      author: { id: "author-112", username: "Grace" },
    }),
  }), {
    bridge: messageHarness.bridge,
    authPolicy: createDiscordAuth(),
    vendorSignatureVerifier: () => ({ accepted: true, code: "signature_verified", reason: "ok" }),
  });
  const messageBody = await readJson(message);
  assertEqual(message.status, 202, "Discord message events still use generic accepted response");
  assertEqual(messageBody.accepted, true, "Discord message event still reports accepted true");
  assertEqual(messageHarness.bridge.status().routeCount, 1, "Discord message event still dispatches to bridge");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 112 Verification (Discord APPLICATION_COMMAND Inbound Dispatch)\n");
  await verifyApplicationCommandDispatch();
  await verifyFallbackUserAndBounds();
  await verifyRapidDeferredRouteSnapshots();
  await verifyFailClosedPaths();
  await verifyPingAndMessageRegression();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 112: Discord APPLICATION_COMMAND inbound dispatch is GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });

