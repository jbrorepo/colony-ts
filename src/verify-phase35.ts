/**
 * Phase 35 Verification Script - Channel Session Bridge
 *
 * Covers the fourth Phase 6 channel slice:
 *   1. Inbound channel route keys map to stable session ids
 *   2. Session runner replies are delivered through ChannelRegistry
 *   3. Failure paths remain inspectable without leaking channel secrets
 *
 * Run: bun run src/verify-phase35.ts
 */

import {
  ChannelRegistry,
  ChannelSessionBridge,
  InMemoryChannelAdapter,
  type ChannelInboundMessage,
  type ChannelSessionRequest,
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

function createInbound(overrides: Partial<ChannelInboundMessage> = {}): ChannelInboundMessage {
  const target = overrides.target ?? {
    agentId: "agent-main",
    channel: "discord",
    targetKind: "direct" as const,
    targetId: "user-123",
  };
  return {
    messageId: overrides.messageId ?? "m-1",
    channel: overrides.channel ?? target.channel,
    routeKey: overrides.routeKey ?? `agent:${target.agentId}:${target.channel}:${target.targetKind}:${target.targetId}`,
    target,
    senderId: overrides.senderId ?? "user-123",
    senderName: overrides.senderName ?? "Ada",
    text: overrides.text ?? "hello colony",
    receivedAt: overrides.receivedAt ?? "2026-04-26T12:00:00.000Z",
    authorization: overrides.authorization ?? {
      allowed: true,
      code: "paired_sender",
      reason: "Sender is paired.",
    },
    metadata: overrides.metadata,
  };
}

async function verifyRouteReuseAndReplyDelivery(): Promise<void> {
  section("1. Route Reuse and Reply Delivery");

  const registry = new ChannelRegistry();
  const adapter = new InMemoryChannelAdapter({ channelId: "discord" });
  registry.register(adapter);
  const requests: ChannelSessionRequest[] = [];
  const bridge = new ChannelSessionBridge({
    registry,
    now: () => "2026-04-26T12:00:00.000Z",
    sessionRunner: async (request) => {
      requests.push(request);
      return { text: `reply:${request.message.text}` };
    },
  });

  const first = await bridge.handleInbound(createInbound({ messageId: "m-1", text: "first" }));
  assertEqual(first.status, "replied", "First inbound turn replies");
  assertEqual(first.sessionId, "chsess_000001", "First route creates stable session id");
  assertEqual(requests.length, 1, "Session runner called once");
  assertEqual(requests[0]?.sessionId, "chsess_000001", "Runner receives session id");
  assertEqual(first.replyDelivery?.status, "sent", "Reply delivery succeeds");
  assertEqual(adapter.sentMessages.length, 1, "Adapter records outbound reply");
  assertEqual(adapter.sentMessages[0]?.textLength, "reply:first".length, "Outbound reply text length is recorded");
  assertEqual(adapter.sentMessages[0]?.target.targetId, "user-123", "Reply targets inbound sender route");
  assertEqual(adapter.sentMessages[0]?.metadata?.sessionId, "chsess_000001", "Reply metadata includes session id");
  assert(!JSON.stringify(adapter.sentMessages[0]).includes("secret-token"), "Reply delivery record does not leak webhook secrets");

  const second = await bridge.handleInbound(createInbound({ messageId: "m-2", text: "second" }));
  assertEqual(second.sessionId, "chsess_000001", "Same route reuses session id");
  assertEqual(second.createdSession, false, "Second route turn is not marked created");
  assertEqual(requests.length, 2, "Session runner called for second inbound");
  assertEqual(bridge.status().routes[0]?.messageCount, 2, "Route message count increments");
  assertEqual(bridge.status().replyDeliveryCount, 2, "Bridge status counts reply deliveries");

  const untrustedSuppression = await bridge.handleInbound(createInbound({
    messageId: "m-3",
    text: "third",
    metadata: { suppressImmediateChannelReply: true },
  }));
  assertEqual(untrustedSuppression.status, "replied", "Caller metadata cannot suppress bridge replies");
  assertEqual(adapter.sentMessages.length, 3, "Adapter still records reply for untrusted suppression metadata");
}

async function verifyRouteIsolation(): Promise<void> {
  section("2. Route Isolation");

  const registry = new ChannelRegistry();
  registry.register(new InMemoryChannelAdapter({ channelId: "discord" }));
  const bridge = new ChannelSessionBridge({
    registry,
    sessionRunner: async (request) => ({ text: `route:${request.sessionId}` }),
  });

  const direct = await bridge.handleInbound(createInbound({ messageId: "m-direct" }));
  const groupTarget = {
    agentId: "agent-main",
    channel: "discord",
    targetKind: "group" as const,
    targetId: "guild-1",
    topicId: "ops",
  };
  const group = await bridge.handleInbound(createInbound({
    messageId: "m-group",
    target: groupTarget,
    routeKey: "agent:agent-main:discord:group:guild-1:topic:ops",
    text: "group hello",
  }));

  assertEqual(direct.sessionId, "chsess_000001", "Direct route gets first session");
  assertEqual(group.sessionId, "chsess_000002", "Different route gets distinct session");
  assertEqual(bridge.status().routeCount, 2, "Bridge status reports both routes");
  assert(bridge.inspectRoute("agent:agent-main:discord:group:guild-1:topic:ops")?.sessionId === "chsess_000002", "Route inspect finds group session");
}

async function verifyFailurePaths(): Promise<void> {
  section("3. Failure Paths");

  const disabledRegistry = new ChannelRegistry();
  disabledRegistry.register(new InMemoryChannelAdapter({
    channelId: "discord",
    enabled: false,
  }));
  const deliveryBridge = new ChannelSessionBridge({
    registry: disabledRegistry,
    sessionRunner: async () => ({ text: "reply from disabled channel" }),
  });
  const failedDelivery = await deliveryBridge.handleInbound(createInbound({ messageId: "m-disabled" }));
  assertEqual(failedDelivery.status, "delivery_failed", "Disabled channel records delivery failure");
  assertEqual(failedDelivery.replyDelivery?.status, "failed", "Failed delivery record is preserved");
  assert(String(failedDelivery.error ?? "").includes("Channel disabled"), "Failed delivery exposes operator-safe reason");

  const runnerBridge = new ChannelSessionBridge({
    registry: new ChannelRegistry(),
    sessionRunner: async () => {
      throw new Error("model unavailable");
    },
  });
  const failedRunner = await runnerBridge.handleInbound(createInbound({ messageId: "m-runner" }));
  assertEqual(failedRunner.status, "runner_failed", "Session runner failure is classified");
  assertEqual(failedRunner.replyDelivery, undefined, "Runner failure does not attempt channel reply");
  assertEqual(runnerBridge.status().routes[0]?.lastError, "model unavailable", "Route status keeps last runner error");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 35 Verification (Channel Session Bridge)\n");

  await verifyRouteReuseAndReplyDelivery();
  await verifyRouteIsolation();
  await verifyFailurePaths();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 35: Channel session bridge is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
