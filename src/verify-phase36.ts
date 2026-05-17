/**
 * Phase 36 Verification Script - Channel Session Operator View
 *
 * Covers the Phase 1 operator-truth slice discovered after channel sessions shipped:
 *   1. `/channels sessions` exposes channel session bridge status
 *   2. Route and recent-turn summaries are visible without leaking secrets
 *   3. Empty bridge status tells operators the truth
 *
 * Run: bun run src/verify-phase36.ts
 */

import {
  ChannelRegistry,
  ChannelSessionBridge,
  InMemoryChannelAdapter,
  type ChannelInboundMessage,
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

function inbound(text: string, messageId: string): ChannelInboundMessage {
  return {
    messageId,
    channel: "discord",
    routeKey: "agent:agent-main:discord:direct:user-123",
    target: {
      agentId: "agent-main",
      channel: "discord",
      targetKind: "direct",
      targetId: "user-123",
    },
    senderId: "user-123",
    senderName: "Ada",
    text,
    receivedAt: "2026-04-26T12:00:00.000Z",
    authorization: {
      allowed: true,
      code: "paired_sender",
      reason: "Sender is paired.",
    },
    metadata: {
      token: "secret-token",
    },
  };
}

async function createBridge(): Promise<ChannelSessionBridge> {
  const registry = new ChannelRegistry();
  registry.register(new InMemoryChannelAdapter({ channelId: "discord" }));
  const bridge = new ChannelSessionBridge({
    registry,
    now: () => "2026-04-26T12:00:00.000Z",
    sessionRunner: async (request) => ({ text: `reply:${request.message.text}` }),
  });
  await bridge.handleInbound(inbound("first", "m-1"));
  await bridge.handleInbound(inbound("second", "m-2"));
  return bridge;
}

async function verifyChannelsSessionsView(): Promise<void> {
  section("1. /channels sessions Operator View");

  const bridge = await createBridge();
  const parsed = parseCommand("/channels sessions");
  assertEqual(parsed.type, "channels", "parseCommand recognizes /channels sessions");
  assertEqual(parsed.args[0], "sessions", "parseCommand preserves sessions view");

  const parser = new SlashCommandParser({
    channels: {
      sessions: bridge.status(),
    },
  });
  const result = parser.tryHandle("/channels sessions");
  assertEqual(result.handled, true, "/channels sessions command resolves");
  assertEqual(result.isError, false, "/channels sessions is not a usage error");
  assert(result.output.includes("Channel Sessions:"), "/channels sessions renders header");
  assert(result.output.includes("Routes: 1"), "/channels sessions reports route count");
  assert(result.output.includes("Reply deliveries: 2"), "/channels sessions reports reply delivery count");
  assert(result.output.includes("chsess_000001"), "/channels sessions lists stable session id");
  assert(result.output.includes("agent:agent-main:discord:direct:user-123"), "/channels sessions lists route key");
  assert(result.output.includes("chturn_000002"), "/channels sessions lists recent turn id");
  assert(!result.output.includes("secret-token"), "/channels sessions does not leak inbound metadata secrets");

  const overview = parser.tryHandle("/channels");
  assert(overview.output.includes("/channels sessions"), "/channels overview teaches sessions view");
}

function verifyEmptySessionsView(): void {
  section("2. Empty Session View");

  const payload = buildChannelsCommandPayload(["sessions"], {
    sessions: {
      routeCount: 0,
      replyDeliveryCount: 0,
      failedTurnCount: 0,
      routes: [],
      recentTurns: [],
    },
  });
  assertEqual(payload.isError, undefined, "Empty /channels sessions payload is not an error");
  assert(payload.output.includes("No channel sessions are visible"), "Empty sessions view tells truth");
  assertEqual(payload.data?.action, "channels_sessions", "Sessions payload exposes action metadata");
  assertEqual(payload.data?.routeCount, 0, "Sessions payload exposes route count metadata");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 36 Verification (Channel Session Operator View)\n");

  await verifyChannelsSessionsView();
  verifyEmptySessionsView();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 36: Channel session operator view is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
