/**
 * Phase 32 Verification Script - Channel Surface Foundation
 *
 * Covers the first Phase 6 channel slice:
 *   1. Deterministic channel route keys for direct/group/channel/thread targets
 *   2. In-memory channel registry and delivery skeleton
 *   3. `/channels` operator visibility for configured channels and recent deliveries
 *
 * Run: bun run src/verify-phase32.ts
 */

import {
  ChannelRegistry,
  InMemoryChannelAdapter,
  buildChannelRouteKey,
} from "./channel";
import { buildChannelsCommandPayload } from "./gateway-channels";
import { parseCommand, SlashCommandParser } from "./gateway";

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

function verifyRouteKeys(): void {
  section("1. Channel Route Keys");

  const direct = buildChannelRouteKey({
    agentId: "main",
    channel: "telegram",
    targetKind: "direct",
    targetId: "user-1",
  });
  assertEqual(direct, "agent:main:telegram:direct:user-1", "Direct route key is deterministic");

  const groupTopic = buildChannelRouteKey({
    agentId: "main",
    channel: "telegram",
    targetKind: "group",
    targetId: "-100123",
    topicId: "42",
  });
  assertEqual(groupTopic, "agent:main:telegram:group:-100123:topic:42", "Group topic route key includes topic");

  const thread = buildChannelRouteKey({
    agentId: "main",
    channel: "discord",
    targetKind: "channel",
    targetId: "123456",
    threadId: "987654",
  });
  assertEqual(thread, "agent:main:discord:channel:123456:thread:987654", "Channel thread route key includes thread");
}

async function verifyRegistryAndDelivery(): Promise<void> {
  section("2. Channel Registry and Delivery");

  const registry = new ChannelRegistry();
  const discord = new InMemoryChannelAdapter({
    channelId: "discord",
    displayName: "Discord",
    enabled: true,
    capabilities: ["send_text", "receive_text", "threads"],
    redactedConfig: {
      token: "redacted",
      guild: "guild-1",
    },
  });
  const slack = new InMemoryChannelAdapter({
    channelId: "slack",
    displayName: "Slack",
    enabled: false,
    capabilities: ["send_text"],
  });

  registry.register(discord);
  registry.register(slack);

  const status = registry.status();
  assertEqual(status.channels.length, 2, "Registry status lists registered channels");
  assertEqual(status.enabledCount, 1, "Registry status counts enabled channels");
  assertEqual(status.channels[0]?.channelId, "discord", "Registry status sorts channels by id");
  assert(status.channels[0]?.capabilities.includes("threads") ?? false, "Registry status exposes capabilities");
  assert(!JSON.stringify(status).includes("secret-token"), "Registry status does not expose raw secrets");

  const sent = await registry.send({
    channel: "discord",
    target: {
      agentId: "main",
      channel: "discord",
      targetKind: "channel",
      targetId: "123456",
      threadId: "987654",
    },
    text: "hello remote channel",
    metadata: { requestId: "req_1" },
  });
  assertEqual(sent.status, "sent", "Enabled channel delivery succeeds");
  assert(sent.deliveryId.startsWith("chdel_"), "Delivery id has stable prefix");
  assertEqual(sent.routeKey, "agent:main:discord:channel:123456:thread:987654", "Delivery records route key");
  assertEqual(discord.sentMessages.length, 1, "Adapter records sent message");

  const disabled = await registry.send({
    channel: "slack",
    target: {
      agentId: "main",
      channel: "slack",
      targetKind: "channel",
      targetId: "C123",
    },
    text: "should not send",
  });
  assertEqual(disabled.status, "failed", "Disabled channel delivery fails closed");
  assert(disabled.error?.includes("disabled") ?? false, "Disabled channel failure explains reason");

  const missing = await registry.send({
    channel: "telegram",
    target: {
      agentId: "main",
      channel: "telegram",
      targetKind: "direct",
      targetId: "user-1",
    },
    text: "missing",
  });
  assertEqual(missing.status, "failed", "Missing channel delivery fails closed");
  assert(missing.error?.includes("not registered") ?? false, "Missing channel failure explains reason");
}

function verifyChannelsGatewayCommand(): void {
  section("3. /channels Operator Command");

  const registry = new ChannelRegistry();
  registry.register(new InMemoryChannelAdapter({
    channelId: "discord",
    displayName: "Discord",
    enabled: true,
    capabilities: ["send_text", "threads"],
    redactedConfig: {
      token: "redacted",
    },
  }));

  const delivery = {
    deliveryId: "chdel_example",
    channel: "discord",
    routeKey: "agent:main:discord:channel:123456",
    target: {
      agentId: "main",
      channel: "discord",
      targetKind: "channel" as const,
      targetId: "123456",
    },
    textLength: 12,
    status: "sent" as const,
    createdAt: "2026-04-26T12:00:00.000Z",
    deliveredAt: "2026-04-26T12:00:01.000Z",
  };

  const parsed = parseCommand("/channels deliveries");
  assertEqual(parsed.type, "channels", "parseCommand recognizes /channels");
  assertEqual(parsed.args[0], "deliveries", "parseCommand preserves /channels view arg");

  const parser = new SlashCommandParser({
    channels: {
      registry,
      recentDeliveries: [delivery],
    },
  });

  const overview = parser.tryHandle("/channels");
  assertEqual(overview.handled, true, "/channels command resolves");
  assert(overview.output.includes("Channels:"), "/channels renders header");
  assert(overview.output.includes("discord"), "/channels lists registered channel");
  assert(overview.output.includes("send_text"), "/channels lists capabilities");
  assert(overview.output.includes("/channels deliveries"), "/channels teaches deliveries view");
  assert(!overview.output.includes("secret-token"), "/channels does not leak raw secrets");

  const deliveries = parser.tryHandle("/channels deliveries");
  assert(deliveries.output.includes("Channel Deliveries"), "/channels deliveries renders delivery header");
  assert(deliveries.output.includes("chdel_example"), "/channels deliveries lists delivery id");
  assert(deliveries.output.includes("agent:main:discord:channel:123456"), "/channels deliveries lists route key");

  const payload = buildChannelsCommandPayload(["unknown"], { registry });
  assertEqual(payload.isError, true, "/channels rejects unknown view");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 32 Verification (Channel Surface Foundation)\n");

  verifyRouteKeys();
  await verifyRegistryAndDelivery();
  verifyChannelsGatewayCommand();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 32: Channel surface foundation is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
