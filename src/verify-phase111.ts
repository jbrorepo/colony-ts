/** Phase 111 Verification - Discord Command Response Definition Integrity */

import {
  createExternalChannelSubscriptionApprovalSignature,
  executeExternalChannelSubscriptionSetupHostRequest,
  type ExternalChannelSubscriptionCandidate,
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

type DiscordSubscriptionCandidate = ExternalChannelSubscriptionCandidate & {
  discordBotToken?: string;
  discordApplicationCommands?: NonNullable<ExternalChannelSubscriptionCandidate["discordApplicationCommands"]>;
};

const CALLBACK_URL = "https://hooks.example.com/api/channels/discord/external-event";
const DISCORD_BOT_TOKEN = "Bot phase111-secret-token";
const PUBLIC_KEY_REF = "vault:phase111-discord-public-key";
const COMMANDS = [
  { name: "colony", description: "Send a request to The Colony", type: 1 as const },
  { name: "status", description: "Show Colony status", type: 1 as const },
];

function candidate(overrides: Partial<DiscordSubscriptionCandidate> = {}): DiscordSubscriptionCandidate {
  return {
    channelId: "discord",
    applicationId: "111000000000000001",
    guildId: "111000000000000002",
    callbackUrl: CALLBACK_URL,
    publicKeyRef: PUBLIC_KEY_REF,
    discordBotToken: DISCORD_BOT_TOKEN,
    discordApplicationCommands: COMMANDS,
    enabled: true,
    eventTypes: ["PING", "APPLICATION_COMMAND"],
    ...overrides,
  };
}

async function approved(overrides: Partial<DiscordSubscriptionCandidate> = {}): Promise<DiscordSubscriptionCandidate> {
  const base = candidate(overrides);
  const signature = await createExternalChannelSubscriptionApprovalSignature(base);
  return { ...base, approval: { approvedBy: "operator", approvedAt: "2026-05-05T03:45:00.000Z", signature } };
}

function commandResponse(overrides: Array<Partial<Record<string, unknown>>> = []): Array<Record<string, unknown>> {
  return COMMANDS.map((command, index) => ({
    id: `11100000000000000${index + 3}`,
    name: command.name,
    description: command.description,
    type: command.type,
    ...overrides[index],
  }));
}

function leaks(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes(DISCORD_BOT_TOKEN) ||
    text.includes(PUBLIC_KEY_REF) ||
    text.includes(CALLBACK_URL) ||
    text.includes("token=plain-secret") ||
    text.includes("secret=plain-secret");
}

async function verifyExactDefinitionSuccess(): Promise<void> {
  section("1. Discord Command Response Definition Integrity Success");
  const good = await approved();
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const result = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    discordSetupMode: "application_commands",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(commandResponse().reverse()), { status: 200 });
    },
  });

  assertEqual(result.isError, false, "matching Discord command definitions succeed");
  assertEqual(calls.length, 1, "one injected Discord command call");
  assertEqual(result.data.mutatedApplicationCommands, true, "success reports command mutation");
  assertEqual(result.data.responseCommandDefinitionsMatched, true, "success reports response definition match");
  assertEqual(result.data.commandCount, 2, "success reports approved command count");
  assert(!leaks(result), "matching command response leaks no bot token, public-key ref, or callback URL");
}

async function verifyDefinitionMismatchesFailClosed(): Promise<void> {
  section("2. Discord Command Response Definition Mismatches Fail Closed");
  const good = await approved();
  const wrongDescription = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    discordSetupMode: "application_commands",
    fetchImpl: async () => new Response(JSON.stringify(commandResponse([{ description: "Different text token=plain-secret" }])), { status: 200 }),
  });
  const wrongType = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    discordSetupMode: "application_commands",
    fetchImpl: async () => new Response(JSON.stringify(commandResponse([{ type: 2 }])), { status: 200 }),
  });
  const missingDescription = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    discordSetupMode: "application_commands",
    fetchImpl: async () => new Response(JSON.stringify(commandResponse([{ description: undefined }])), { status: 200 }),
  });
  const missingCommand = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    discordSetupMode: "application_commands",
    fetchImpl: async () => new Response(JSON.stringify(commandResponse().slice(0, 1)), { status: 200 }),
  });
  const nonObjectCommand = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    discordSetupMode: "application_commands",
    fetchImpl: async () => new Response(JSON.stringify(["not-object", commandResponse()[1]]), { status: 200 }),
  });

  for (const result of [wrongDescription, wrongType, missingDescription, missingCommand, nonObjectCommand]) {
    assertEqual(result.isError, true, "command response mismatch fails closed");
    assertEqual(result.data.reasonCode, "discord_command_update_response_command_mismatch", "command mismatch uses stable reason code");
    assertEqual(result.data.retryable, false, "command mismatch is non-retryable on successful HTTP response");
    assert(!("mutatedApplicationCommands" in result.data), "command mismatch does not report command mutation success");
    assert(!("responseCommandDefinitionsMatched" in result.data), "command mismatch does not report match metadata");
    assert(!("retryWorkerId" in result.data), "command mismatch creates no retry worker");
    assert(!("retryScheduledAt" in result.data), "command mismatch creates no retry schedule");
  }
  assert(!leaks([wrongDescription, wrongType, missingDescription, missingCommand, nonObjectCommand]), "command mismatch output leaks no bot token, public-key ref, callback URL, or Discord detail secret");
}

async function verifyEndpointAndSlackRegression(): Promise<void> {
  section("3. Endpoint And Slack Regression Guards");
  const good = await approved();
  const endpointResult = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({
      id: "111000000000000001",
      interactions_endpoint_url: CALLBACK_URL,
    }), { status: 200 }),
  });
  assertEqual(endpointResult.isError, false, "default Discord endpoint mode still succeeds");
  assertEqual(endpointResult.data.mutatedInteractionsEndpoint, true, "endpoint mode still reports endpoint mutation");
  assert(!("responseCommandDefinitionsMatched" in endpointResult.data), "endpoint mode does not emit command definition metadata");

  const slackResult = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "slack",
    candidates: [],
    discordSetupMode: "application_commands",
    fetchImpl: async () => new Response("{}", { status: 200 }),
  });
  assertEqual(slackResult.isError, true, "Slack path does not inherit Discord command mode");
  assert(!("responseCommandDefinitionsMatched" in slackResult.data), "Slack rejection does not emit command definition metadata");
  assert(!leaks([endpointResult, slackResult]), "regression outputs leak no Discord secrets");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 111 Verification (Discord Command Response Definition Integrity)\n");
  await verifyExactDefinitionSuccess();
  await verifyDefinitionMismatchesFailClosed();
  await verifyEndpointAndSlackRegression();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 111: Discord command response definition integrity is GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });