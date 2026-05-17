/**
 * Phase 98 Verification Script - Telegram Webhook Registration Setup
 *
 * Covers the next Phase 6 channel slice:
 *   1. Telegram-only host-owned webhook registration planning with exact approval signatures
 *   2. Public HTTPS webhook URL and Telegram API base validation before any vendor call
 *   3. Host execution calls Telegram setWebhook only through injected fetch and redacts credentials
 *   4. Fail-closed API error handling without default public hosting, retries, uploads, or broader vendor setup
 *
 * Run: bun run src/verify-phase98.ts
 */

import {
  ChannelAuthPolicy,
  ChannelRegistry,
  ChannelSessionBridge,
  createExternalChannelWebhookRegistrationApprovalSignature,
  executeExternalChannelWebhookRegistrationHostRequest,
  handleExternalChannelVendorWebhookRequest,
  InMemoryChannelAdapter,
  planExternalChannelWebhookRegistrations,
  verifyExternalChannelWebhookSignature,
  type ExternalChannelWebhookRegistrationCandidate,
} from "./channel";
import { executeCommand, type CommandExecutionHandlers, type CommandResult } from "./gateway";
import { buildChannelsCommandPayload } from "./gateway-channels";

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

function fakeFetch(calls: CapturedFetchCall[] = [], response: unknown = { ok: true, result: true }): typeof fetch {
  const impl = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, {
    preconnect: () => {},
  });
  return impl as typeof fetch;
}

function statusFetch(calls: CapturedFetchCall[], status: number, response: unknown): typeof fetch {
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

function malformedJsonFetch(calls: CapturedFetchCall[]): typeof fetch {
  const impl = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return new Response("{not json", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, {
    preconnect: () => {},
  });
  return impl as typeof fetch;
}

async function approvedTelegramCandidate(
  overrides: Partial<ExternalChannelWebhookRegistrationCandidate> = {},
): Promise<ExternalChannelWebhookRegistrationCandidate> {
  const candidate: ExternalChannelWebhookRegistrationCandidate = {
    channelId: "telegram",
    botToken: "telegram-token-phase98-secret",
    secretToken: "phase98-webhook-secret",
    webhookUrl: "https://hooks.example.com/api/channels/telegram/external-event",
    enabled: true,
    allowedUpdates: ["message"],
    ...overrides,
  };
  const signature = await createExternalChannelWebhookRegistrationApprovalSignature(candidate);
  return {
    ...candidate,
    approval: {
      approvedBy: "operator",
      approvedAt: "2026-05-02T23:45:00.000Z",
      signature,
    },
  };
}

function containsSecrets(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("telegram-token-phase98-secret") ||
    text.includes("phase98-webhook-secret") ||
    text.includes("phase98-rotated-secret") ||
    text.includes("phase98-query-secret") ||
    text.includes("api_key=") ||
    text.includes("token=") ||
    text.includes("secret=");
}

async function verifyPlanningAndApproval(): Promise<void> {
  section("1. Telegram Webhook Registration Planning And Approval");

  const pending: ExternalChannelWebhookRegistrationCandidate = {
    channelId: "telegram",
    botToken: "telegram-token-phase98-secret",
    secretToken: "phase98-webhook-secret",
    webhookUrl: "https://hooks.example.com/api/channels/telegram/external-event",
    enabled: true,
  };
  const signature = await createExternalChannelWebhookRegistrationApprovalSignature(pending);
  const plans = await planExternalChannelWebhookRegistrations([pending]);
  assertEqual(plans.length, 1, "Pending Telegram webhook candidate creates one plan");
  assertEqual(plans[0]?.channelId, "telegram", "Plan normalizes Telegram channel id");
  assertEqual(plans[0]?.accepted, false, "Pending plan is not accepted without exact approval");
  assertEqual(plans[0]?.approvalRequired, true, "Plan always requires approval");
  assertEqual(plans[0]?.requiredSignature, signature, "Plan exposes exact required approval signature");
  assertEqual(plans[0]?.redactedConfig.botToken, "[REDACTED]", "Plan redacts Telegram bot token");
  assertEqual(plans[0]?.redactedConfig.secretToken, "[REDACTED]", "Plan redacts Telegram secret token");
  assertEqual(plans[0]?.redactedConfig.webhookUrl, "https://hooks.example.com/[REDACTED_PATH]", "Plan redacts exact webhook URL path");
  assert(!containsSecrets(plans), "Planning output does not leak Telegram credentials or signatures");

  const approved = await approvedTelegramCandidate();
  const acceptedPlans = await planExternalChannelWebhookRegistrations([approved]);
  assertEqual(acceptedPlans[0]?.accepted, true, "Exact approval signature accepts Telegram webhook candidate");
  assertEqual(acceptedPlans[0]?.redactedConfig.webhookUrl, "https://hooks.example.com/[REDACTED_PATH]", "Accepted plan redacts exact webhook URL path");
  assertEqual(JSON.stringify(acceptedPlans[0]?.redactedConfig.allowedUpdates), JSON.stringify(["message"]), "Allowed updates stay bounded to message");

  const stale = await planExternalChannelWebhookRegistrations([{
    ...approved,
    secretToken: "phase98-rotated-secret",
  }]);
  assertEqual(stale[0]?.accepted, false, "Mutating approved candidate invalidates approval signature");
}

async function verifyFailClosedPlanning(): Promise<void> {
  section("2. Fail-Closed Candidate Validation");

  const candidates: ExternalChannelWebhookRegistrationCandidate[] = [
    {
      channelId: "slack" as "telegram",
      botToken: "telegram-token-phase98-secret",
      secretToken: "phase98-webhook-secret",
      webhookUrl: "https://hooks.example.com/api/channels/slack/external-event",
      enabled: true,
    },
    {
      channelId: "telegram",
      botToken: "telegram-token-phase98-secret",
      secretToken: "phase98-webhook-secret",
      webhookUrl: "http://hooks.example.com/colony/telegram",
      enabled: true,
    },
    {
      channelId: "telegram",
      botToken: "telegram-token-phase98-secret",
      secretToken: "phase98-webhook-secret",
      webhookUrl: "https://127.0.0.1/api/channels/telegram/external-event",
      enabled: true,
    },
    {
      channelId: "telegram",
      botToken: "telegram-token-phase98-secret",
      secretToken: "phase98-webhook-secret",
      webhookUrl: "https://[::1]/api/channels/telegram/external-event",
      enabled: true,
    },
    {
      channelId: "telegram",
      botToken: "telegram-token-phase98-secret",
      secretToken: "phase98-webhook-secret",
      webhookUrl: "https://[fd00::1]/api/channels/telegram/external-event",
      enabled: true,
    },
    {
      channelId: "telegram",
      botToken: "telegram-token-phase98-secret",
      secretToken: "phase98-webhook-secret",
      webhookUrl: "https://[fe90::1]/api/channels/telegram/external-event",
      enabled: true,
    },
    {
      channelId: "telegram",
      botToken: "telegram-token-phase98-secret",
      secretToken: "phase98-webhook-secret",
      webhookUrl: "https://[::ffff:127.0.0.1]/api/channels/telegram/external-event",
      enabled: true,
    },
    {
      channelId: "telegram",
      botToken: "telegram-token-phase98-secret",
      secretToken: "phase98-webhook-secret",
      webhookUrl: "https://hooks.example.com:4444/api/channels/telegram/external-event",
      enabled: true,
    },
    {
      channelId: "telegram",
      botToken: "telegram-token-phase98-secret",
      secretToken: "phase98-webhook-secret",
      webhookUrl: "https://hooks.example.com/api/channels/telegram/external-event",
      apiBaseUrl: "https://evil.example.com",
      enabled: true,
    },
    {
      channelId: "telegram",
      botToken: "telegram-token-phase98-secret",
      secretToken: "phase98-webhook-secret",
      webhookUrl: "https://hooks.example.com/api/channels/telegram/external-event",
      enabled: true,
      allowedUpdates: ["message", "edited_message"],
    },
    {
      channelId: "telegram",
      botToken: "telegram-token-phase98-secret",
      secretToken: "bad secret with spaces",
      webhookUrl: "https://hooks.example.com/api/channels/telegram/external-event",
      enabled: true,
    },
    {
      channelId: "telegram",
      botToken: "telegram-token-phase98-secret",
      secretToken: "   ",
      webhookUrl: "https://hooks.example.com/api/channels/telegram/external-event",
      enabled: true,
    },
    {
      channelId: "telegram",
      botToken: "telegram-token-phase98-secret",
      secretToken: "phase98-webhook-secret",
      webhookUrl: "https://hooks.example.com/api/channels/telegram/external-event",
      enabled: false,
    },
  ];
  const plans = await planExternalChannelWebhookRegistrations(candidates);
  assertEqual(plans.every((plan) => plan.accepted === false), true, "Invalid webhook candidates are never accepted");
  assertEqual(plans[0]?.reason?.includes("Telegram"), true, "Non-Telegram setup is explicitly unsupported in this slice");
  assertEqual(plans[1]?.reason?.includes("HTTPS"), true, "Webhook URL must use HTTPS");
  assertEqual(plans[2]?.reason?.includes("local or private"), true, "Webhook URL rejects local/private hosts");
  assertEqual(plans[3]?.reason?.includes("local or private"), true, "Webhook URL rejects IPv6 loopback hosts");
  assertEqual(plans[4]?.reason?.includes("local or private"), true, "Webhook URL rejects IPv6 ULA hosts");
  assertEqual(plans[5]?.reason?.includes("local or private"), true, "Webhook URL rejects IPv6 link-local hosts across fe80::/10");
  assertEqual(plans[6]?.reason?.includes("local or private"), true, "Webhook URL rejects IPv4-mapped loopback hosts");
  assertEqual(plans[7]?.reason?.includes("443, 80, 88, or 8443"), true, "Webhook URL rejects unsupported Telegram ports");
  assertEqual(plans[8]?.reason?.includes("api.telegram.org"), true, "Telegram API base must target api.telegram.org");
  assertEqual(plans[9]?.reason?.includes("message"), true, "Allowed updates reject broader subscriptions");
  assertEqual(plans[10]?.reason?.includes("secret token"), true, "Invalid Telegram secret token shape is rejected");
  assertEqual(plans[11]?.reason?.includes("secret"), true, "Missing Telegram secret token is rejected");
  assertEqual(plans[12]?.reason?.includes("enabled"), true, "Webhook setup must be explicitly enabled");
  assert(!containsSecrets(plans), "Invalid planning output redacts secrets and query credentials");

  const allowedPort = await planExternalChannelWebhookRegistrations([{
    channelId: "telegram",
    botToken: "telegram-token-phase98-secret",
    secretToken: "phase98-webhook-secret",
    webhookUrl: "https://hooks.example.com:8443/api/channels/telegram/external-event",
    enabled: true,
  }]);
  assert(allowedPort[0]?.requiredSignature?.startsWith("channel-webhook:telegram:") ?? false, "Webhook URL accepts Telegram-supported port 8443");
}

async function verifySuccessfulHostExecution(): Promise<void> {
  section("3. Host-Owned Telegram setWebhook Execution");

  const calls: CapturedFetchCall[] = [];
  const result = await executeExternalChannelWebhookRegistrationHostRequest({
    channelId: "telegram",
    candidates: [await approvedTelegramCandidate()],
    fetchImpl: fakeFetch(calls),
  });

  assertEqual(result.isError, false, "Approved Telegram webhook host request succeeds");
  assertEqual(result.data.action, "channels_external_webhook_registration_executed", "Success result has stable action");
  assertEqual(result.data.channelId, "telegram", "Success result reports Telegram channel");
  assertEqual(result.data.registeredWebhook, true, "Success result reports webhook registration truth");
  assertEqual(result.data.retryable, false, "Success result is not retryable");
  assert(result.output.includes("Telegram webhook registration executed"), "Success output reports Telegram execution");
  assert(result.output.includes("No default public hosting"), "Success output avoids default hosting claims");
  assertEqual(calls.length, 1, "Host execution makes exactly one injected fetch call");
  assertEqual(calls[0]?.input, "https://api.telegram.org/bottelegram-token-phase98-secret/setWebhook", "Host execution calls Telegram setWebhook endpoint");
  assertEqual(calls[0]?.init?.method, "POST", "Telegram setWebhook uses POST");
  assertEqual(String(calls[0]?.init?.headers ? JSON.stringify(calls[0]?.init?.headers) : "").includes("application/json"), true, "Telegram setWebhook sends JSON");
  const body = JSON.parse(String(calls[0]?.init?.body ?? "{}")) as Record<string, unknown>;
  assertEqual(body.url, "https://hooks.example.com/api/channels/telegram/external-event", "Telegram setWebhook body includes safe public webhook URL");
  assertEqual(body.secret_token, "phase98-webhook-secret", "Telegram setWebhook body includes host-owned secret token");
  assertEqual(JSON.stringify(body.allowed_updates), JSON.stringify(["message"]), "Telegram setWebhook body limits allowed updates");
  assert(!containsSecrets(result), "Successful result redacts token, secret, and approval signature");
}

async function verifyHostExecutionRejections(): Promise<void> {
  section("4. Host Execution Fail-Closed Inputs");

  const approved = await approvedTelegramCandidate();
  const noFetchCalls: CapturedFetchCall[] = [];
  const noFetch = await executeExternalChannelWebhookRegistrationHostRequest({
    channelId: "telegram",
    candidates: [approved],
  });
  assertEqual(noFetch.isError, true, "Missing injected fetch fails closed");
  assertEqual(noFetch.data.reasonCode, "missing_fetch", "Missing fetch has stable reason code");

  const unsupported = await executeExternalChannelWebhookRegistrationHostRequest({
    channelId: "slack",
    candidates: [approved],
    fetchImpl: fakeFetch(noFetchCalls),
  });
  assertEqual(unsupported.isError, true, "Unsupported channel setup fails closed");
  assertEqual(unsupported.data.reasonCode, "unsupported_channel", "Unsupported channel has stable reason code");
  assertEqual(noFetchCalls.length, 0, "Unsupported channel never calls fetch");

  const missingCandidate = await executeExternalChannelWebhookRegistrationHostRequest({
    channelId: "telegram",
    candidates: [],
    fetchImpl: fakeFetch(noFetchCalls),
  });
  assertEqual(missingCandidate.isError, true, "Missing candidate fails closed");
  assertEqual(missingCandidate.data.reasonCode, "missing_candidate", "Missing candidate has stable reason code");

  const duplicate = await executeExternalChannelWebhookRegistrationHostRequest({
    channelId: "telegram",
    candidates: [approved, approved],
    fetchImpl: fakeFetch(noFetchCalls),
  });
  assertEqual(duplicate.isError, true, "Duplicate candidate fails closed");
  assertEqual(duplicate.data.reasonCode, "ambiguous_candidate", "Duplicate candidate has stable reason code");

  const pending = await executeExternalChannelWebhookRegistrationHostRequest({
    channelId: "telegram",
    candidates: [{ ...approved, approval: undefined }],
    fetchImpl: fakeFetch(noFetchCalls),
  });
  assertEqual(pending.isError, true, "Pending approval fails closed before vendor call");
  assertEqual(pending.data.reasonCode, "approval_required", "Pending candidate has stable reason code");

  const stale = await executeExternalChannelWebhookRegistrationHostRequest({
    channelId: "telegram",
    candidates: [{ ...approved, botToken: "telegram-token-phase98-rotated-secret" }],
    fetchImpl: fakeFetch(noFetchCalls),
  });
  assertEqual(stale.isError, true, "Stale approval fails closed before vendor call");
  assertEqual(stale.data.reasonCode, "approval_required", "Stale approval has stable reason code");
  assert(!containsSecrets([noFetch, unsupported, missingCandidate, duplicate, pending, stale]), "Host input rejections redact secrets");
}

async function verifyGatewayWebhookActionBoundary(): Promise<void> {
  section("5. Gateway Telegram Webhook Action Boundary");

  const approved = await approvedTelegramCandidate({
    webhookUrl: "https://hooks.example.com/api/channels/telegram/external-event",
  });
  const signature = await createExternalChannelWebhookRegistrationApprovalSignature(approved);
  const plans = await planExternalChannelWebhookRegistrations([approved]);
  const payload = buildChannelsCommandPayload(["external", "webhook", "telegram", signature], {
    externalWebhooks: plans,
  });

  assertEqual(payload.isError, undefined, "Accepted external webhook setup request is not a usage error");
  assert(payload.output.includes("Telegram webhook setup request staged"), "Accepted webhook request renders staged output");
  assert(payload.output.includes("host-mediated"), "Accepted webhook request states host-mediated execution");
  assert(payload.output.includes("does not start listeners"), "Accepted webhook request states gateway does not start listeners");
  assertEqual(payload.data?.action, "channels_external_webhook_request", "Accepted webhook request has stable data action");
  assertEqual(payload.action?.kind, "setup_external_channel_webhook", "Accepted webhook request emits setup action");
  assertEqual(payload.action?.channelId, "telegram", "Webhook setup action carries channel id only");
  assert(!payload.output.includes(signature), "Webhook request output redacts exact approval signature");
  assert(!JSON.stringify(payload).includes("telegram-token-phase98-secret"), "Webhook request does not leak bot token");
  assert(!JSON.stringify(payload).includes("phase98-webhook-secret"), "Webhook request does not leak secret token");
  assert(!JSON.stringify(payload).includes("/api/channels/telegram/external-event"), "Webhook request does not leak exact webhook path");
  assert(!JSON.stringify(payload.action ?? {}).includes(signature), "Webhook setup action does not carry exact approval signature");

  const pendingPlans = await planExternalChannelWebhookRegistrations([{ ...approved, approval: undefined }]);
  const pending = buildChannelsCommandPayload(["external", "webhook", "telegram", signature], {
    externalWebhooks: pendingPlans,
  });
  assertEqual(pending.isError, true, "Pending webhook setup emits no host action");
  assertEqual(pending.action, undefined, "Pending webhook setup action is absent");

  const wrongSignature = buildChannelsCommandPayload(["external", "webhook", "telegram", "channel-webhook:telegram:wrong"], {
    externalWebhooks: plans,
  });
  assertEqual(wrongSignature.isError, true, "Wrong webhook approval signature is rejected");
  assertEqual(wrongSignature.action, undefined, "Wrong webhook approval emits no action");

  const signatureInChannelPosition = buildChannelsCommandPayload(["external", "webhook", signature, "telegram"], {
    externalWebhooks: plans,
  });
  assertEqual(signatureInChannelPosition.isError, true, "Webhook approval signature in channel position is rejected");
  assertEqual(signatureInChannelPosition.action, undefined, "Webhook approval signature in channel position emits no action");
  assert(!JSON.stringify(signatureInChannelPosition).includes(signature), "Webhook approval signature in channel position is redacted from rejection payload");
}

async function verifyGatewayHostHandlerIntegration(): Promise<void> {
  section("6. Gateway Optional Webhook Host Handler Integration");

  const messages: string[] = [];
  const errors: string[] = [];
  const command: CommandResult = {
    handled: true,
    command: "channels",
    output: "Telegram webhook setup request staged.\nExecution: host-mediated.",
    data: { action: "channels_external_webhook_request", channelId: "telegram" },
    isError: false,
    action: { kind: "setup_external_channel_webhook", channelId: "telegram" },
  };
  const handlers: CommandExecutionHandlers = {
    submitChat: () => {},
    exitApp: () => {},
    resetSession: () => {},
    requestCompaction: () => {},
    setBudgetCap: () => {},
    showSystemMessage: (message) => messages.push(message),
    showErrorMessage: (message) => errors.push(message),
    requestExternalChannelWebhookRegistration: () => ({
      handled: true,
      command: "channels",
      output: "Telegram webhook registration executed by host executor.",
      isError: false,
      data: { action: "channels_external_webhook_registration_executed", channelId: "telegram" },
    }),
  };

  const handled = await executeCommand(command, handlers);
  assertEqual(handled, true, "Gateway executeCommand handles webhook setup action");
  assertEqual(errors.length, 0, "Gateway host webhook path emits no errors for approved candidate");
  assert(messages.some((message) => message.includes("request staged")), "Gateway renders webhook command output before host execution");
  assert(messages.some((message) => message.includes("registration executed")), "Gateway renders webhook host execution result");
  assert(!containsSecrets(messages), "Gateway rendered webhook messages stay credential and signature free");

  const withoutHandlerMessages: string[] = [];
  const handledWithoutHandler = await executeCommand(command, {
    ...handlers,
    requestExternalChannelWebhookRegistration: undefined,
    showSystemMessage: (message) => withoutHandlerMessages.push(message),
  });
  assertEqual(handledWithoutHandler, true, "Gateway remains no-op when webhook host handler is absent");
  assertEqual(withoutHandlerMessages.length, 1, "Gateway without webhook handler renders only command output");
}

async function verifyVendorFailureHandling(): Promise<void> {
  section("7. Telegram API Failure Handling");

  const rejectedCalls: CapturedFetchCall[] = [];
  const rejected = await executeExternalChannelWebhookRegistrationHostRequest({
    channelId: "telegram",
    candidates: [await approvedTelegramCandidate()],
    fetchImpl: statusFetch(rejectedCalls, 200, { ok: false, description: "bad token telegram-token-phase98-secret" }),
  });
  assertEqual(rejected.isError, true, "Telegram ok=false response fails closed");
  assertEqual(rejected.data.reasonCode, "telegram_webhook_response_rejected", "Telegram ok=false has stable reason code");
  assertEqual(rejected.data.retryable, false, "Telegram ok=false is not retryable by default");
  assert(!containsSecrets(rejected), "Telegram ok=false output redacts secrets");

  const throttledCalls: CapturedFetchCall[] = [];
  const throttled = await executeExternalChannelWebhookRegistrationHostRequest({
    channelId: "telegram",
    candidates: [await approvedTelegramCandidate()],
    fetchImpl: statusFetch(throttledCalls, 429, { ok: false, description: "retry later" }),
  });
  assertEqual(throttled.isError, true, "Telegram 429 response fails closed");
  assertEqual(throttled.data.retryable, true, "Telegram 429 is marked retryable without running a retry worker");

  const serverCalls: CapturedFetchCall[] = [];
  const serverFailure = await executeExternalChannelWebhookRegistrationHostRequest({
    channelId: "telegram",
    candidates: [await approvedTelegramCandidate()],
    fetchImpl: statusFetch(serverCalls, 503, { ok: false, description: "unavailable" }),
  });
  assertEqual(serverFailure.isError, true, "Telegram 5xx response fails closed");
  assertEqual(serverFailure.data.retryable, true, "Telegram 5xx is marked retryable without running a retry worker");

  const malformedCalls: CapturedFetchCall[] = [];
  const malformed = await executeExternalChannelWebhookRegistrationHostRequest({
    channelId: "telegram",
    candidates: [await approvedTelegramCandidate()],
    fetchImpl: malformedJsonFetch(malformedCalls),
  });
  assertEqual(malformed.isError, true, "Malformed Telegram JSON response fails closed");
  assertEqual(malformed.data.reasonCode, "telegram_webhook_response_malformed", "Malformed Telegram response has stable reason code");
}

async function verifyTelegramSecretTokenHostAuth(): Promise<void> {
  section("8. Telegram Secret-Token Host Auth Compatibility");

  const policy = new ChannelAuthPolicy({
    channels: {
      telegram: {
        webhookSecret: "phase98-webhook-secret",
        groupPolicy: "open",
      },
    },
  });
  const accepted = policy.authenticateWebhook({
    channel: "telegram",
    url: "https://hooks.example.com/api/channels/telegram/external-event",
    headers: {
      "x-telegram-bot-api-secret-token": "phase98-webhook-secret",
    },
  });
  assertEqual(accepted.allowed, true, "ChannelAuthPolicy accepts Telegram secret-token header as host auth proof");
  assertEqual(accepted.code, "webhook_authenticated", "Telegram host auth proof uses existing authenticated code");

  const rejected = policy.authenticateWebhook({
    channel: "telegram",
    url: "https://hooks.example.com/api/channels/telegram/external-event",
    headers: {
      "x-telegram-bot-api-secret-token": "wrong",
    },
  });
  assertEqual(rejected.allowed, false, "ChannelAuthPolicy rejects wrong Telegram secret-token header");

  const registry = new ChannelRegistry();
  const adapter = new InMemoryChannelAdapter({ channelId: "telegram" });
  registry.register(adapter);
  const bridge = new ChannelSessionBridge({
    registry,
    sessionRunner: async (request) => ({ text: `reply:${request.message.messageId}` }),
  });
  const response = await handleExternalChannelVendorWebhookRequest(new Request("http://127.0.0.1/api/channels/telegram/external-event", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": "phase98-webhook-secret",
    },
    body: JSON.stringify({
      message: {
        message_id: 98,
        text: "private telegram phase98 text",
        from: { id: 9801, username: "ada" },
        chat: { id: -9802, type: "supergroup" },
      },
    }),
  }), {
    bridge,
    authPolicy: policy,
    vendorSignatureVerifier: (request) => verifyExternalChannelWebhookSignature({
      channelId: "telegram",
      body: request.rawBody,
      headers: request.headers,
      signingSecret: "phase98-webhook-secret",
    }),
  });
  const body = await response.json() as Record<string, unknown>;
  assertEqual(response.status, 202, "Phase 97 Telegram transport accepts real Telegram secret-token header");
  assertEqual(body.channel, "telegram", "Telegram transport response reports channel");
  assertEqual(adapter.sentMessages.length, 1, "Telegram secret-token webhook dispatches through bridge");
  assert(!containsSecrets(body), "Telegram secret-token transport response redacts webhook secret");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 98 Verification (Telegram Webhook Registration Setup)\n");

  await verifyPlanningAndApproval();
  await verifyFailClosedPlanning();
  await verifySuccessfulHostExecution();
  await verifyHostExecutionRejections();
  await verifyGatewayWebhookActionBoundary();
  await verifyGatewayHostHandlerIntegration();
  await verifyVendorFailureHandling();
  await verifyTelegramSecretTokenHostAuth();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 98: Telegram webhook registration setup is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
