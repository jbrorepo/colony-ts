/** Phase 104 Verification - Discord Interactions Endpoint Direct Mutation Host Executor */

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
};

const CALLBACK_URL = "https://hooks.example.com/api/channels/discord/external-event";
const DISCORD_BOT_TOKEN = "Bot phase104-discord-token-secret";
const PUBLIC_KEY_REF = "vault:phase104-discord-public-key-ref";

function candidate(overrides: Partial<DiscordSubscriptionCandidate> = {}): DiscordSubscriptionCandidate {
  return {
    channelId: "discord",
    applicationId: "104000000000000001",
    guildId: "104000000000000002",
    callbackUrl: CALLBACK_URL,
    publicKeyRef: PUBLIC_KEY_REF,
    discordBotToken: DISCORD_BOT_TOKEN,
    enabled: true,
    eventTypes: ["PING", "APPLICATION_COMMAND"],
    ...overrides,
  };
}

async function approved(overrides: Partial<DiscordSubscriptionCandidate> = {}): Promise<DiscordSubscriptionCandidate> {
  const base = candidate(overrides);
  const signature = await createExternalChannelSubscriptionApprovalSignature(base);
  return { ...base, approval: { approvedBy: "operator", approvedAt: "2026-05-03T11:00:00.000Z", signature } };
}

function leaks(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes(DISCORD_BOT_TOKEN) ||
    text.includes(PUBLIC_KEY_REF) ||
    text.includes("phase104-raw-token") ||
    text.includes("token=plain-secret") ||
    text.includes(CALLBACK_URL);
}

async function verifySuccess(): Promise<void> {
  section("1. Discord Endpoint Mutation Success");
  const good = await approved();
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({
      id: "104000000000000001",
      interactions_endpoint_url: CALLBACK_URL,
    }), { status: 200 });
  };

  const result = await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "discord", candidates: [good], fetchImpl });
  assertEqual(result.isError, false, "Discord direct endpoint mutation succeeds");
  assertEqual(result.data.action, "channels_external_subscription_setup_executed", "stable success action");
  assertEqual(result.data.channelId, "discord", "success reports Discord channel");
  assertEqual(result.data.mutatedInteractionsEndpoint, true, "success reports endpoint mutation");
  assertEqual(calls.length, 1, "one injected fetch call");
  assertEqual(calls[0]?.url, "https://discord.com/api/v10/applications/@me", "Discord current application endpoint used");
  assertEqual(calls[0]?.init.method, "PATCH", "Discord endpoint mutation uses PATCH");
  const headers = calls[0]?.init.headers as Record<string, string> | undefined;
  assertEqual(headers?.authorization, DISCORD_BOT_TOKEN, "Discord bot token sent only to authorization header");
  assertEqual(headers?.["content-type"], "application/json", "Discord request is JSON");

  const body = calls[0]?.init.body ? JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown> : {};
  assertEqual(Object.keys(body).length, 1, "Discord body mutates only one field");
  assertEqual(body.interactions_endpoint_url, CALLBACK_URL, "Discord body sets approved interactions endpoint URL");
  assert(!("application_id" in body), "Discord body does not include app id mutation");
  assert(!("commands" in body), "Discord body does not include commands");
  assert(!("flags" in body), "Discord body does not include gateway intent flags");
  assert(!leaks(result), "success result leaks no bot token, public-key ref, or callback URL");
  assert(result.output.includes("one injected Discord Edit Current Application call only"), "output states single injected mutation scope");
  assert(result.output.includes("No Discord app creation"), "output avoids app creation claim");
  assert(result.output.includes("slash-command registration"), "output explicitly excludes slash commands");
  assert(result.output.includes("no default live inbound delivery"), "output avoids live delivery claim");
}

async function verifyFailClosedInputs(): Promise<void> {
  section("2. Discord Endpoint Mutation Fail-Closed Inputs");
  const good = await approved();
  const pending = candidate();
  const invalid = candidate({ discordBotToken: "phase104-raw-token" });
  const acceptedInvalid = { ...invalid, approval: { approvedBy: "operator", signature: await createExternalChannelSubscriptionApprovalSignature(invalid) } };
  const okFetch = async (): Promise<Response> => new Response(JSON.stringify({ id: "104000000000000001", interactions_endpoint_url: CALLBACK_URL }), { status: 200 });

  const rejected = [
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "discord", candidates: [good] }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "discord", candidates: [], fetchImpl: okFetch }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "discord", candidates: [good, good], fetchImpl: okFetch }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "discord", candidates: [pending], fetchImpl: okFetch }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "discord", candidates: [acceptedInvalid], fetchImpl: okFetch }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "discord", candidates: [{ ...good, discordBotToken: "Bot phase104-discord-token-changed" }], fetchImpl: okFetch }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "discord", candidates: [{ ...good, callbackUrl: "https://hooks.example.com/api/channels/discord/other" }], fetchImpl: okFetch }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "discord", candidates: [{ ...good, applicationId: "104000000000000099" }], fetchImpl: okFetch }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "discord", candidates: [{ ...good, guildId: "104000000000000099" }], fetchImpl: okFetch }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "discord", candidates: [{ ...good, publicKeyRef: "vault:phase104-other-public-key-ref" }], fetchImpl: okFetch }),
    await executeExternalChannelSubscriptionSetupHostRequest({ channelId: "discord", candidates: [{ ...good, eventTypes: ["PING"] }], fetchImpl: okFetch }),
  ];

  assert(rejected.every((result) => result.isError), "invalid Discord host inputs fail closed");
  assertEqual(rejected[0]?.data.reasonCode, "missing_fetch", "missing fetch rejected");
  assertEqual(rejected[1]?.data.reasonCode, "missing_candidate", "missing candidate rejected");
  assertEqual(rejected[2]?.data.reasonCode, "ambiguous_candidate", "duplicate candidate rejected");
  assertEqual(rejected[3]?.data.reasonCode, "approval_required", "pending approval rejected");
  assertEqual(rejected[4]?.data.reasonCode, "approval_required", "invalid bot token candidate rejected before fetch");
  assertEqual(rejected[5]?.data.reasonCode, "approval_required", "bot token mutation after approval rejected before fetch");
  assertEqual(rejected[6]?.data.reasonCode, "approval_required", "callback URL mutation after approval rejected before fetch");
  assertEqual(rejected[7]?.data.reasonCode, "approval_required", "application id mutation after approval rejected before fetch");
  assertEqual(rejected[8]?.data.reasonCode, "approval_required", "guild id mutation after approval rejected before fetch");
  assertEqual(rejected[9]?.data.reasonCode, "approval_required", "public-key ref mutation after approval rejected before fetch");
  assertEqual(rejected[10]?.data.reasonCode, "approval_required", "event allowlist mutation after approval rejected before fetch");
  assert(!leaks(rejected), "host input rejections redact Discord secrets");
}

async function verifyDiscordApiFailures(): Promise<void> {
  section("3. Discord API Failure Handling");
  const good = await approved();
  const fetchReject = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    fetchImpl: async () => { throw new Error("token=plain-secret"); },
  });
  assertEqual(fetchReject.isError, true, "fetch rejection fails closed");
  assertEqual(fetchReject.data.reasonCode, "discord_endpoint_update_request_failed", "fetch rejection stable code");
  assertEqual(fetchReject.data.retryable, true, "fetch rejection retryable without retry worker");

  const tooLarge = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    fetchImpl: async () => new Response("x".repeat(40 * 1024), { status: 200 }),
  });
  assertEqual(tooLarge.data.reasonCode, "discord_endpoint_update_response_too_large", "large Discord response rejected");

  const malformed = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    fetchImpl: async () => new Response("not json", { status: 200 }),
  });
  assertEqual(malformed.data.reasonCode, "discord_endpoint_update_response_malformed", "malformed Discord JSON rejected");

  const nonObject = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    fetchImpl: async () => new Response("null", { status: 200 }),
  });
  assertEqual(nonObject.data.reasonCode, "discord_endpoint_update_response_malformed", "non-object Discord JSON rejected");

  const wrongApp = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ id: "104000000000000999", interactions_endpoint_url: CALLBACK_URL }), { status: 200 }),
  });
  assertEqual(wrongApp.data.reasonCode, "discord_endpoint_update_response_rejected", "mismatched Discord app id rejected");

  const wrongUrl = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ id: "104000000000000001", interactions_endpoint_url: "https://hooks.example.com/api/channels/discord/other" }), { status: 200 }),
  });
  assertEqual(wrongUrl.data.reasonCode, "discord_endpoint_update_response_rejected", "mismatched Discord endpoint URL rejected");

  const unauthorized = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ message: "401 token=plain-secret" }), { status: 401 }),
  });
  assertEqual(unauthorized.data.retryable, false, "Discord 401 is not retryable");
  assert(!leaks(unauthorized), "Discord rejection redacts secrets");

  const rateLimited = await executeExternalChannelSubscriptionSetupHostRequest({
    channelId: "discord",
    candidates: [good],
    fetchImpl: async () => new Response(JSON.stringify({ message: "ratelimited" }), { status: 429 }),
  });
  assertEqual(rateLimited.data.retryable, true, "Discord 429 marked retryable without running retry worker");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 104 Verification (Discord Interactions Endpoint Direct Mutation Host Executor)\n");
  await verifySuccess();
  await verifyFailClosedInputs();
  await verifyDiscordApiFailures();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 104: Discord Interactions endpoint direct mutation host executor is GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });
