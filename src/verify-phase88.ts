/**
 * Phase 88 Verification Script - Channel Adapter Contracts
 *
 * Covers P0 Channel Contracts:
 *   1. Slack/Discord/Telegram-style contract fixtures exist without real credentials
 *   2. Contracts describe threading, mentions, reactions, attachments, retries, auth, redaction, and route semantics
 *   3. Malformed or secret-bearing contract fixtures fail closed
 *   4. `/channels contracts` exposes contract-only truth without claiming real adapters are shipped
 *
 * Run: bun run src/verify-phase88.ts
 */

import {
  CHANNEL_ADAPTER_CONTRACT_FIXTURES,
  ChannelRegistry,
  buildChannelContractRouteKeyPreview,
  listChannelAdapterContractStatus,
  normalizeChannelAdapterContract,
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

function verifyContractFixtures(): void {
  section("1. Contract-Only Channel Fixtures");

  const contracts = listChannelAdapterContractStatus();
  assertEqual(contracts.length, 3, "Three benchmark channel contracts are listed");
  assertEqual(contracts[0]?.channelId, "discord", "Contracts are sorted by channel id");
  assert(contracts.some((contract) => contract.channelId === "slack"), "Slack contract is present");
  assert(contracts.some((contract) => contract.channelId === "telegram"), "Telegram contract is present");
  assert(contracts.every((contract) => contract.contractOnly), "Contracts are marked contract-only");
  assert(contracts.every((contract) => !contract.adapterImplemented), "Contracts do not claim real adapters");
  assert(contracts.every((contract) => !contract.externalNetworkEnabled), "Contracts do not enable external network delivery");
  assert(!JSON.stringify(contracts).match(/xoxb|bot-token|secret-token|discord-token|telegram-token/i), "Contracts do not embed credentials");

  const discord = contracts.find((contract) => contract.channelId === "discord");
  assert(discord?.capabilities.threading === true, "Discord contract declares threading semantics");
  assert(discord?.capabilities.mentions === true, "Discord contract declares mention semantics");
  assert(discord?.capabilities.reactions === true, "Discord contract declares reaction semantics");
  assert(discord?.capabilities.attachments === true, "Discord contract declares attachment semantics");
  assert(discord?.capabilities.deliveryRetries === true, "Discord contract declares delivery retry semantics");
  assert(discord?.auth.inbound.includes("webhook_secret") ?? false, "Discord contract declares inbound auth");
  assert(discord?.routeSemantics.some((route) => route.targetKind === "channel" && route.supportsThread) ?? false, "Discord contract supports channel thread routes");
}

function verifyRouteSemantics(): void {
  section("2. Channel Route Contract Semantics");

  const slack = normalizeChannelAdapterContract(
    CHANNEL_ADAPTER_CONTRACT_FIXTURES.find((contract) => contract.channelId === "slack"),
  );
  assertEqual(slack.accepted, true, "Slack fixture normalizes");
  assert(slack.contract?.routeSemantics.some((route) => route.targetKind === "channel" && route.supportsThread) ?? false, "Slack contract supports channel threads");
  assert(slack.contract?.routeSemantics.some((route) => route.targetKind === "direct" && !route.supportsThread) ?? false, "Slack direct routes do not require thread support");

  const telegram = normalizeChannelAdapterContract(
    CHANNEL_ADAPTER_CONTRACT_FIXTURES.find((contract) => contract.channelId === "telegram"),
  );
  assertEqual(telegram.accepted, true, "Telegram fixture normalizes");
  assert(telegram.contract?.routeSemantics.some((route) => route.targetKind === "group" && route.supportsTopic) ?? false, "Telegram group routes support topics");
  assert(telegram.contract?.routeSemantics.some((route) => route.targetKind === "direct" && route.deliveryAddressField === "senderId") ?? false, "Telegram direct routes map replies to sender id");

  const preview = buildChannelContractRouteKeyPreview({
    channelId: "telegram",
    agentId: "agent-main",
    targetKind: "group",
    targetId: "-100123",
    topicId: "42",
  });
  assertEqual(preview.accepted, true, "Route key preview accepts declared Telegram route");
  assertEqual(preview.routeKey, "agent:agent-main:telegram:group:-100123:topic:42", "Route key preview matches runtime route format");

  const rejected = buildChannelContractRouteKeyPreview({
    channelId: "slack",
    agentId: "agent-main",
    targetKind: "channel",
    targetId: "C123",
    topicId: "not-supported",
  });
  assertEqual(rejected.accepted, false, "Route key preview rejects unsupported route fields");
  assert(rejected.error?.includes("topic") ?? false, "Rejected route explains unsupported topic field");
}

function verifyFailClosedContracts(): void {
  section("3. Fail-Closed Contract Validation");

  const implemented = normalizeChannelAdapterContract({
    ...CHANNEL_ADAPTER_CONTRACT_FIXTURES[0],
    adapterImplemented: true,
  });
  assertEqual(implemented.accepted, false, "Contract fixtures cannot claim implemented adapters");
  assert(implemented.error?.includes("contract-only") ?? false, "Implemented fixture rejection preserves contract-only boundary");

  const networkEnabled = normalizeChannelAdapterContract({
    ...CHANNEL_ADAPTER_CONTRACT_FIXTURES[0],
    externalNetworkEnabled: true,
  });
  assertEqual(networkEnabled.accepted, false, "Contract fixtures cannot enable external network delivery");

  const secretBearing = normalizeChannelAdapterContract({
    ...CHANNEL_ADAPTER_CONTRACT_FIXTURES[0],
    redactedConfig: {
      token: "xoxb-secret-token",
    },
  });
  assertEqual(secretBearing.accepted, false, "Secret-bearing fixture is rejected");
  assert(!JSON.stringify(secretBearing).includes("xoxb-secret-token"), "Rejected secret-bearing fixture redacts raw secret");

  const malformedRoute = normalizeChannelAdapterContract({
    ...CHANNEL_ADAPTER_CONTRACT_FIXTURES[0],
    routeSemantics: [],
  });
  assertEqual(malformedRoute.accepted, false, "Contracts require route semantics");
}

async function verifyContractsDoNotRegisterAdapters(): Promise<void> {
  section("4. Contracts Do Not Register Vendor Adapters");

  const registry = new ChannelRegistry();
  const sent = await registry.send({
    channel: "slack",
    target: {
      agentId: "agent-main",
      channel: "slack",
      targetKind: "channel",
      targetId: "C123",
    },
    text: "contract fixtures should not deliver",
  });
  assertEqual(sent.status, "failed", "Slack contract fixture does not register a send adapter");
  assert(sent.error?.includes("not registered") ?? false, "Unregistered vendor send fails closed");
  assertEqual(registry.status().enabledCount, 0, "Contract fixtures do not increment enabled channel count");
  assertEqual(registry.status().connectedCount, 0, "Contract fixtures do not increment connected channel count");
}

function verifyChannelsContractsOperatorView(): void {
  section("5. /channels contracts Operator View");

  const parsed = parseCommand("/channels contracts");
  assertEqual(parsed.type, "channels", "parseCommand recognizes /channels contracts");
  assertEqual(parsed.args[0], "contracts", "parseCommand preserves contracts view arg");

  const parser = new SlashCommandParser({
    channels: {
      contracts: listChannelAdapterContractStatus(),
    },
  });
  const result = parser.tryHandle("/channels contracts");
  assertEqual(result.handled, true, "/channels contracts command resolves");
  assertEqual(result.isError, false, "/channels contracts is not a usage error");
  assert(result.output.includes("Channel Contracts:"), "/channels contracts renders contract header");
  assert(result.output.includes("contract-only"), "/channels contracts states contract-only truth");
  assert(result.output.includes("slack"), "/channels contracts lists Slack contract");
  assert(result.output.includes("discord"), "/channels contracts lists Discord contract");
  assert(result.output.includes("telegram"), "/channels contracts lists Telegram contract");
  assert(result.output.includes("threading"), "/channels contracts shows threading capability");
  assert(result.output.includes("retries"), "/channels contracts shows retry capability");
  assert(result.output.includes("No real external channel adapters are enabled"), "/channels contracts avoids false adapter claims");
  assert(!result.output.match(/xoxb|bot-token|secret-token|discord-token|telegram-token/i), "/channels contracts does not leak credentials");

  const overview = parser.tryHandle("/channels");
  assert(overview.output.includes("/channels contracts"), "/channels overview teaches contracts view");

  const payload = buildChannelsCommandPayload(["unknown", "extra"], {
    contracts: listChannelAdapterContractStatus(),
  });
  assertEqual(payload.isError, true, "/channels usage still rejects invalid views");
  assert(payload.output.includes("contracts"), "/channels usage lists contracts view");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 88 Verification (Channel Adapter Contracts)\n");

  verifyContractFixtures();
  verifyRouteSemantics();
  verifyFailClosedContracts();
  await verifyContractsDoNotRegisterAdapters();
  verifyChannelsContractsOperatorView();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 88: channel adapter contracts are GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
