/** Phase 107 Verification - Discord Guild Application Command Host Executor */

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
  discordApplicationCommands?: Array<{ name: string; description: string; type?: 1 }>;
};

const CALLBACK_URL = "https://hooks.example.com/api/channels/discord/external-event";
const DISCORD_BOT_TOKEN = "Bot phase107-discord-token-secret";
const PUBLIC_KEY_REF = "vault:phase107-discord-public-key-ref";

function candidate(overrides: Partial<DiscordSubscriptionCandidate> = {}): DiscordSubscriptionCandidate {
  return {
    channelId: "discord",
    applicationId: "107000000000000001",
    guildId: "107000000000000002",
    callbackUrl: CALLBACK_URL,
    publicKeyRef: PUBLIC_KEY_REF,
    discordBotToken: DISCORD_BOT_TOKEN,
    enabled: true,
    eventTypes: ["PING", "APPLICATION_COMMAND"],
    discordApplicationCommands: [
      { name: "colony", description: "Send a request to The Colony", type: 1 },
    ],
    ...overrides,
  };
}

async function approved(overrides: Partial<DiscordSubscriptionCandidate> = {}): Promise<DiscordSubscriptionCandidate> {
  const base = candidate(overrides);
  const signature = await createExternalChannelSubscriptionApprovalSignature(base);
  return { ...base, approval: { approvedBy: "operator", approvedAt: "2026-05-04T07:00:00.000Z", signature } };
}

function leaks(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes(DISCORD_BOT_TOKEN) ||
    text.includes(PUBLIC_KEY_REF) ||
    text.includes(CALLBACK_URL) ||
    text.includes("token=plain-secret") ||
    text.includes("phase107-raw-token");
}

async function verifyDiscordCommandSuccess(): Promise<void> {
  section("1. Discord Guild Application Command Registration Success");
  const good = await approved();
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const result = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    discordSetupMode: "application_commands",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify([{
        id: "107000000000000003",
        name: "colony",
        description: "Send a request to The Colony",
        type: 1,
      }]), { status: 200 });
    },
  });

  assertEqual(result.isError, false, "Discord command registration succeeds");
  assertEqual(result.data.action, "channels_external_subscription_setup_executed", "stable success action");
  assertEqual(result.data.channelId, "discord", "success reports Discord channel");
  assertEqual(result.data.mutatedApplicationCommands, true, "success reports command mutation");
  assertEqual(result.data.commandScope, "guild", "success reports guild scope");
  assertEqual(result.data.commandCount, 1, "success reports command count");
  assertEqual(calls.length, 1, "one injected fetch call");
  assertEqual(calls[0]?.url, "https://discord.com/api/v10/applications/107000000000000001/guilds/107000000000000002/commands", "Discord guild command endpoint used");
  assertEqual(calls[0]?.init.method, "PUT", "Discord command mutation uses PUT");
  const headers = calls[0]?.init.headers as Record<string, string> | undefined;
  assertEqual(headers?.authorization, DISCORD_BOT_TOKEN, "Discord bot token sent only to authorization header");
  assertEqual(headers?.["content-type"], "application/json", "Discord command request is JSON");
  const parsedBody = calls[0]?.init.body ? JSON.parse(String(calls[0]?.init.body)) as unknown : [];
  const body = Array.isArray(parsedBody) ? parsedBody as Array<Record<string, unknown>> : [];
  assertEqual(Array.isArray(body), true, "Discord command body is an array");
  assertEqual(body.length, 1, "Discord command body has one command");
  assertEqual(body[0]?.name, "colony", "Discord command body preserves approved name");
  assertEqual(body[0]?.description, "Send a request to The Colony", "Discord command body preserves approved description");
  assertEqual(body[0]?.type, 1, "Discord command body uses chat-input type");
  assert(!JSON.stringify(parsedBody).includes("interactions_endpoint_url"), "Discord command body does not mutate endpoint URL");
  assert(!leaks(result), "success result leaks no bot token, public-key ref, or callback URL");
  assert(result.output.includes("Bulk Overwrite Guild Application Commands"), "output states command registration scope");
  assert(result.output.includes("No Discord app creation"), "output avoids app creation claim");
  assert(result.output.includes("no default live inbound delivery"), "output avoids live delivery claim");
}

async function verifyDiscordCommandFailClosedInputs(): Promise<void> {
  section("2. Discord Command Registration Fail-Closed Inputs");
  const good = await approved();
  let calls = 0;
  const okFetch = async (): Promise<Response> => {
    calls++;
    return new Response(JSON.stringify([{ id: "107000000000000003", name: "colony", type: 1 }]), { status: 200 });
  };
  const pending = candidate();
  const missingCommands = await approved({ discordApplicationCommands: undefined });
  const invalidName = await approved({ discordApplicationCommands: [{ name: "Bad Name", description: "Invalid name", type: 1 }] });
  const invalidDescription = await approved({ discordApplicationCommands: [{ name: "colony", description: "", type: 1 }] });
  const tooMany = await approved({
    discordApplicationCommands: [
      { name: "one", description: "one", type: 1 },
      { name: "two", description: "two", type: 1 },
      { name: "three", description: "three", type: 1 },
      { name: "four", description: "four", type: 1 },
      { name: "five", description: "five", type: 1 },
      { name: "six", description: "six", type: 1 },
    ],
  });
  const changedAfterApproval: DiscordSubscriptionCandidate = {
    ...good,
    discordApplicationCommands: [{ name: "other", description: "Different command", type: 1 }],
  };

  const results = [
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "discord", candidates: [pending], discordSetupMode: "application_commands", fetchImpl: okFetch }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "discord", candidates: [missingCommands], discordSetupMode: "application_commands", fetchImpl: okFetch }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "discord", candidates: [invalidName], discordSetupMode: "application_commands", fetchImpl: okFetch }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "discord", candidates: [invalidDescription], discordSetupMode: "application_commands", fetchImpl: okFetch }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "discord", candidates: [tooMany], discordSetupMode: "application_commands", fetchImpl: okFetch }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "discord", candidates: [changedAfterApproval], discordSetupMode: "application_commands", fetchImpl: okFetch }),
  ];

  assert(results.every((result) => result.isError), "invalid command host inputs fail closed");
  assertEqual(calls, 0, "invalid command host inputs fetch zero times");
  assertEqual(results[0]?.data.reasonCode, "approval_required", "pending approval rejected before fetch");
  assertEqual(results[1]?.data.reasonCode, "approval_required", "missing commands rejected before fetch");
  assertEqual(results[2]?.data.reasonCode, "approval_required", "invalid command name rejected before fetch");
  assertEqual(results[3]?.data.reasonCode, "approval_required", "invalid command description rejected before fetch");
  assertEqual(results[4]?.data.reasonCode, "approval_required", "too many commands rejected before fetch");
  assertEqual(results[5]?.data.reasonCode, "approval_required", "post-approval command mutation rejected before fetch");
  assert(!leaks(results), "command input rejections redact Discord secrets");
}

async function verifyDiscordCommandApiFailures(): Promise<void> {
  section("3. Discord Command API Failure Handling");
  const good = await approved();
  const fetchReject = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    discordSetupMode: "application_commands",
    fetchImpl: async () => { throw new Error("token=plain-secret"); },
  });
  assertEqual(fetchReject.isError, true, "fetch rejection fails closed");
  assertEqual(fetchReject.data.reasonCode, "discord_command_update_request_failed", "fetch rejection stable code");
  assertEqual(fetchReject.data.retryable, true, "fetch rejection retryable without retry worker");

  const malformed = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    discordSetupMode: "application_commands",
    fetchImpl: async () => new Response("not json token=plain-secret", { status: 200 }),
  });
  assertEqual(malformed.data.reasonCode, "discord_command_update_response_malformed", "malformed Discord command JSON rejected");

  const nonArray = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    discordSetupMode: "application_commands",
    fetchImpl: async () => new Response(JSON.stringify({ id: "not-array" }), { status: 200 }),
  });
  assertEqual(nonArray.data.reasonCode, "discord_command_update_response_rejected", "non-array Discord command response rejected");

  const wrongName = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    discordSetupMode: "application_commands",
    fetchImpl: async () => new Response(JSON.stringify([{
      id: "107000000000000003",
      name: "other",
      description: "Send a request to The Colony",
      type: 1,
    }]), { status: 200 }),
  });
  assertEqual(wrongName.data.reasonCode, "discord_command_update_response_command_mismatch", "mismatched command response rejected");

  const extraCommand = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    discordSetupMode: "application_commands",
    fetchImpl: async () => new Response(JSON.stringify([
      { id: "107000000000000004", name: "colony", description: "Send a request to The Colony", type: 1 },
      { id: "107000000000000005", name: "unapproved-extra", description: "Extra command", type: 1 },
    ]), { status: 200 }),
  });
  assertEqual(extraCommand.data.reasonCode, "discord_command_update_response_command_mismatch", "extra command response rejected");

  const unauthorized = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    discordSetupMode: "application_commands",
    fetchImpl: async () => new Response(JSON.stringify({ message: "401 token=plain-secret" }), { status: 401 }),
  });
  assertEqual(unauthorized.data.retryable, false, "Discord command 401 is not retryable");
  assert(!leaks([fetchReject, malformed, nonArray, wrongName, unauthorized]), "Discord command API failures redact secrets");
}

async function verifyEndpointModeRegression(): Promise<void> {
  section("4. Discord Endpoint Mode Regression");
  const good = await approved();
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const result = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({
        id: "107000000000000001",
        interactions_endpoint_url: CALLBACK_URL,
      }), { status: 200 });
    },
  });

  assertEqual(result.isError, false, "default Discord endpoint setup still succeeds");
  assertEqual(calls.length, 1, "default Discord still performs one fetch");
  assertEqual(calls[0]?.url, "https://discord.com/api/v10/applications/@me", "default Discord still uses endpoint mutation URL");
  assertEqual(calls[0]?.init.method, "PATCH", "default Discord still uses endpoint PATCH");
  assertEqual(result.data.mutatedInteractionsEndpoint, true, "default Discord still reports endpoint mutation");
  assert(!("mutatedApplicationCommands" in result.data), "default Discord does not register commands");
  assert(!leaks(result), "default Discord regression leaks no secrets");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 107 Verification (Discord Guild Application Command Host Executor)\n");
  await verifyDiscordCommandSuccess();
  await verifyDiscordCommandFailClosedInputs();
  await verifyDiscordCommandApiFailures();
  await verifyEndpointModeRegression();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 107: Discord guild application command host executor is GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });
