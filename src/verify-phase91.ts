/**
 * Phase 91 Verification Script - External Channel Adapters
 *
 * Covers the first real external channel adapter slice:
 *   1. Slack/Discord/Telegram outbound adapters use raw fetch with injected credentials
 *   2. Vendor route semantics map ChannelTarget fields into platform payloads
 *   3. Status and failures redact credentials and response bodies
 *   4. Adapters are not auto-registered by contract fixtures
 *
 * Run: bun run src/verify-phase91.ts
 */

import {
  ChannelRegistry,
  DiscordChannelAdapter,
  SlackChannelAdapter,
  TelegramChannelAdapter,
  listChannelAdapterContractStatus,
} from "./channel";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

interface CapturedFetchCall {
  input: string;
  init?: RequestInit;
}

function fakeFetch(
  response: unknown,
  status = 200,
  calls: CapturedFetchCall[] = [],
): typeof fetch {
  const impl = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify(response), {
      status,
      headers: { "content-type": "application/json" },
    });
  }, {
    preconnect: () => {},
  });
  return impl as typeof fetch;
}

async function verifySlackAdapter(): Promise<void> {
  section("1. Slack Adapter");

  const calls: CapturedFetchCall[] = [];
  const adapter = new SlackChannelAdapter({
    botToken: "xoxb-secret-token",
    fetchImpl: fakeFetch({ ok: true, ts: "171000.0001", channel: "C123" }, 200, calls),
  });

  const status = adapter.status();
  assertEqual(status.channelId, "slack", "Slack adapter exposes channel id");
  assertEqual(status.enabled, true, "Slack adapter is enabled when configured");
  assertEqual(status.connected, true, "Slack adapter is connected when token is present");
  assert(status.capabilities.includes("threads"), "Slack adapter exposes thread capability");
  assert(!JSON.stringify(status).includes("xoxb-secret-token"), "Slack status redacts token");

  const sent = await adapter.send({
    channel: "slack",
    target: {
      agentId: "agent-main",
      channel: "slack",
      targetKind: "channel",
      targetId: "C123",
      threadId: "171000.0000",
    },
    text: "hello slack",
  });
  assertEqual(sent.status, "sent", "Slack send succeeds on ok response");
  assertEqual(calls.length, 1, "Slack send uses one fetch call");
  assertEqual(calls[0]?.input, "https://slack.com/api/chat.postMessage", "Slack endpoint uses chat.postMessage");
  assert(String(calls[0]?.init?.headers).includes("[object Object]") || typeof calls[0]?.init?.headers === "object", "Slack request sets headers");
  const payload = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
  assertEqual(payload.channel, "C123", "Slack payload maps target id to channel");
  assertEqual(payload.thread_ts, "171000.0000", "Slack payload maps thread id to thread_ts");
  assertEqual(payload.text, "hello slack", "Slack payload preserves text");
  assert(!JSON.stringify(sent).includes("xoxb-secret-token"), "Slack delivery record redacts token");
}

async function verifyDiscordAdapter(): Promise<void> {
  section("2. Discord Adapter");

  const calls: CapturedFetchCall[] = [];
  const adapter = new DiscordChannelAdapter({
    botToken: "discord-token",
    fetchImpl: fakeFetch({ id: "msg-123", channel_id: "987654" }, 200, calls),
  });

  const sent = await adapter.send({
    channel: "discord",
    target: {
      agentId: "agent-main",
      channel: "discord",
      targetKind: "channel",
      targetId: "123456",
      threadId: "987654",
    },
    text: "hello discord",
  });
  assertEqual(sent.status, "sent", "Discord send succeeds on 2xx response");
  assertEqual(calls[0]?.input, "https://discord.com/api/v10/channels/987654/messages", "Discord thread sends to thread channel endpoint");
  const payload = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
  assertEqual(payload.content, "hello discord", "Discord payload maps text to content");
  assert(!JSON.stringify(sent).includes("discord-token"), "Discord delivery record redacts token");
}

async function verifyTelegramAdapter(): Promise<void> {
  section("3. Telegram Adapter");

  const calls: CapturedFetchCall[] = [];
  const adapter = new TelegramChannelAdapter({
    botToken: "telegram-token",
    fetchImpl: fakeFetch({ ok: true, result: { message_id: 55 } }, 200, calls),
  });

  const sent = await adapter.send({
    channel: "telegram",
    target: {
      agentId: "agent-main",
      channel: "telegram",
      targetKind: "group",
      targetId: "-100123",
      topicId: "42",
    },
    text: "hello telegram",
  });
  assertEqual(sent.status, "sent", "Telegram send succeeds on ok response");
  assert(calls[0]?.input.startsWith("https://api.telegram.org/bottelegram-token/sendMessage") ?? false, "Telegram adapter targets Bot API sendMessage endpoint");
  const payload = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
  assertEqual(payload.chat_id, "-100123", "Telegram payload maps target id to chat_id");
  assertEqual(payload.message_thread_id, "42", "Telegram payload maps topic id to message_thread_id");
  assertEqual(payload.text, "hello telegram", "Telegram payload preserves text");
  assert(!JSON.stringify(sent).includes("telegram-token"), "Telegram delivery record redacts token");
}

async function verifyFailureAndRegistryBoundaries(): Promise<void> {
  section("4. Failure and Registration Boundaries");

  const calls: CapturedFetchCall[] = [];
  const slack = new SlackChannelAdapter({
    botToken: "xoxb-secret-token",
    fetchImpl: fakeFetch({ ok: false, error: "invalid_auth xoxb-secret-token" }, 200, calls),
  });
  const failed = await slack.send({
    channel: "slack",
    target: {
      agentId: "agent-main",
      channel: "slack",
      targetKind: "channel",
      targetId: "C123",
    },
    text: "should fail",
  });
  assertEqual(failed.status, "failed", "Vendor error response fails delivery");
  assert(failed.error?.includes("invalid_auth") ?? false, "Vendor error preserves safe reason");
  assert(!JSON.stringify(failed).includes("xoxb-secret-token"), "Vendor error redacts token");

  const disabled = new DiscordChannelAdapter({
    botToken: "discord-token",
    enabled: false,
    fetchImpl: fakeFetch({ id: "msg" }),
  });
  assertEqual(disabled.status().connected, false, "Disabled external adapter is disconnected");

  const arbitraryTokenCalls: CapturedFetchCall[] = [];
  const telegram = new TelegramChannelAdapter({
    botToken: "123456:arbitrary-secret-token",
    apiBaseUrl: "https://api.telegram.org?token=query-secret-token",
    fetchImpl: fakeFetch({ ok: false, description: "bad token 123456:arbitrary-secret-token" }, 200, arbitraryTokenCalls),
  });
  const telegramStatus = telegram.status();
  assert(!JSON.stringify(telegramStatus).includes("query-secret-token"), "External adapter status redacts query credentials");
  const arbitraryTokenFailure = await telegram.send({
    channel: "telegram",
    target: {
      agentId: "agent-main",
      channel: "telegram",
      targetKind: "direct",
      targetId: "123",
    },
    text: "should redact arbitrary token",
  });
  assertEqual(arbitraryTokenFailure.status, "failed", "Arbitrary token vendor error fails delivery");
  assert(!JSON.stringify(arbitraryTokenFailure).includes("123456:arbitrary-secret-token"), "Failure redacts exact configured credential value");

  const metadataSecretCalls: CapturedFetchCall[] = [];
  const metadataSecretAdapter = new SlackChannelAdapter({
    botToken: "xoxb-metadata-token",
    fetchImpl: fakeFetch({ ok: true, ts: "171000.0002" }, 200, metadataSecretCalls),
  });
  const metadataSecretRecord = await metadataSecretAdapter.send({
    channel: "slack",
    target: {
      agentId: "agent-main",
      channel: "slack",
      targetKind: "channel",
      targetId: "C123",
    },
    text: "metadata should redact",
    metadata: {
      api_key: "metadata-api-key",
      callbackUrl: "https://callback.example.test/hook?token=metadata-query-secret",
    },
  });
  const metadataSecretJson = JSON.stringify(metadataSecretRecord);
  assert(!metadataSecretJson.includes("metadata-api-key"), "Delivery metadata redacts api_key values");
  assert(!metadataSecretJson.includes("metadata-query-secret"), "Delivery metadata redacts query credential values");

  const fetchErrorAdapter = new DiscordChannelAdapter({
    botToken: "discord-fetch-token",
    fetchImpl: Object.assign(async () => {
      throw new Error("request failed https://discord.example.test/messages?api_key=fetch-query-secret");
    }, {
      preconnect: () => {},
    }) as typeof fetch,
  });
  const fetchErrorRecord = await fetchErrorAdapter.send({
    channel: "discord",
    target: {
      agentId: "agent-main",
      channel: "discord",
      targetKind: "channel",
      targetId: "123456",
    },
    text: "fetch error should redact",
  });
  assertEqual(fetchErrorRecord.status, "failed", "Fetch error fails delivery");
  assert(!JSON.stringify(fetchErrorRecord).includes("fetch-query-secret"), "Fetch errors redact query credential values");

  const registry = new ChannelRegistry();
  const contractOnlySend = await registry.send({
    channel: "slack",
    target: {
      agentId: "agent-main",
      channel: "slack",
      targetKind: "channel",
      targetId: "C123",
    },
    text: "contracts should not register adapters",
  });
  assertEqual(contractOnlySend.status, "failed", "Contract fixtures still do not auto-register adapters");
  assert(contractOnlySend.error?.includes("not registered") ?? false, "Unregistered contract send fails closed");
  assert(listChannelAdapterContractStatus().every((contract) => !contract.adapterImplemented), "Contract fixtures still avoid adapter-implemented claims");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 91 Verification (External Channel Adapters)\n");

  await verifySlackAdapter();
  await verifyDiscordAdapter();
  await verifyTelegramAdapter();
  await verifyFailureAndRegistryBoundaries();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 91: external channel adapters are GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
