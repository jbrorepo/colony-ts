/**
 * Phase 95 Verification Script - Host-Owned External Adapter Registration Execution
 *
 * Covers the next Phase 6 channel slice:
 *   1. Hosts can execute Phase 94 registration actions with private approved candidates
 *   2. Gateway actions remain credential/signature-free while host execution mutates only injected registry state
 *   3. Missing, duplicate, pending, unsupported, already-registered, or unsafe candidates fail closed
 *   4. Registration execution does not contact vendor APIs or start listeners/subscriptions
 *
 * Run: bun run src/verify-phase95.ts
 */

import {
  ChannelRegistry,
  createExternalChannelAdapterApprovalSignature,
  executeExternalChannelRegistrationHostRequest,
  type ExternalChannelAdapterRegistrationCandidate,
} from "./channel";
import { executeCommand, type CommandExecutionHandlers, type CommandResult } from "./gateway";

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

function fakeFetch(calls: CapturedFetchCall[] = []): typeof fetch {
  const impl = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({ ok: true, ts: "171000.0095" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, {
    preconnect: () => {},
  });
  return impl as typeof fetch;
}

async function approvedCandidate(
  channelId: ExternalChannelAdapterRegistrationCandidate["channelId"] = "slack",
): Promise<ExternalChannelAdapterRegistrationCandidate> {
  const candidate: ExternalChannelAdapterRegistrationCandidate = {
    channelId,
    botToken: channelId === "slack" ? "xoxb-phase95-secret" : `${channelId}-token`,
    enabled: true,
    ...(channelId === "slack" ? { workspaceId: "T123" } : {}),
  };
  const signature = await createExternalChannelAdapterApprovalSignature(candidate);
  return {
    ...candidate,
    approval: {
      approvedBy: "operator",
      approvedAt: "2026-05-02T20:45:00.000Z",
      signature,
    },
  };
}

function containsSecrets(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("xoxb-phase95-secret") ||
    text.includes("phase95-pending-secret") ||
    text.includes("phase95-rotated-secret") ||
    text.includes("phase95-handler-secret") ||
    text.includes("sk-live-phase95-secret") ||
    text.includes("phase95-bad-query") ||
    text.includes("plain-secret") ||
    text.includes("rawsig") ||
    text.includes("api_key=") ||
    text.includes("credential=") ||
    text.includes("token=") ||
    text.includes("signature=") ||
    text.includes("channel-adapter:telegram:nothex") ||
    text.includes("channel-adapter:slack:");
}

async function verifyHostOwnedSuccessfulRegistration(): Promise<void> {
  section("1. Host-Owned Successful Registration");

  const registry = new ChannelRegistry();
  const calls: CapturedFetchCall[] = [];
  const result = await executeExternalChannelRegistrationHostRequest({
    channelId: "slack",
    registry,
    candidates: [await approvedCandidate("slack")],
    fetchImpl: fakeFetch(calls),
  });

  assertEqual(result.isError, false, "Approved host request succeeds");
  assert(result.output.includes("External channel adapter registered"), "Successful result reports registration");
  assertEqual(result.data.action, "channels_external_registration_executed", "Successful result has stable action");
  assertEqual(result.data.channelId, "slack", "Successful result reports channel id");
  assertEqual(result.data.registeredCount, 1, "Successful result reports one registration");
  assertEqual(registry.status().channels.length, 1, "Host-owned registry is mutated");
  assertEqual(registry.status().channels[0]?.channelId, "slack", "Slack adapter is registered");
  assert(registry.status().channels[0]?.capabilities.includes("send_text") ?? false, "Registered Slack adapter reports text-send capability");
  assert(!(registry.status().channels[0]?.capabilities.includes("attachments") ?? false), "Registered Slack adapter does not claim attachment uploads");
  assert(!(registry.status().channels[0]?.capabilities.includes("delivery_retries") ?? false), "Registered Slack adapter does not claim retry support");
  assertEqual(calls.length, 0, "Registration execution does not contact vendor APIs");
  assert(!containsSecrets(result), "Host execution result redacts token and exact approval signature");
  assert(!containsSecrets(registry.status()), "Registry status redacts token and exact approval signature");
}

async function verifyFailClosedRegistrationRequests(): Promise<void> {
  section("2. Fail-Closed Host Request Rejections");

  const approved = await approvedCandidate("slack");

  const noRegistry = await executeExternalChannelRegistrationHostRequest({
    channelId: "slack",
    candidates: [approved],
  });
  assertEqual(noRegistry.isError, true, "Missing registry fails closed");
  assert(noRegistry.output.includes("registry"), "Missing registry explains host-owned requirement");

  const missingCandidateRegistry = new ChannelRegistry();
  const missingCandidate = await executeExternalChannelRegistrationHostRequest({
    channelId: "slack",
    registry: missingCandidateRegistry,
    candidates: [],
  });
  assertEqual(missingCandidate.isError, true, "Missing candidate fails closed");
  assertEqual(missingCandidateRegistry.status().channels.length, 0, "Missing candidate does not mutate registry");

  const duplicateRegistry = new ChannelRegistry();
  const duplicate = await executeExternalChannelRegistrationHostRequest({
    channelId: "slack",
    registry: duplicateRegistry,
    candidates: [approved, approved],
  });
  assertEqual(duplicate.isError, true, "Duplicate candidates fail closed as ambiguous");
  assert(duplicate.output.includes("multiple"), "Duplicate rejection explains ambiguity");
  assertEqual(duplicateRegistry.status().channels.length, 0, "Duplicate candidates do not mutate registry");

  const pendingRegistry = new ChannelRegistry();
  const pending = await executeExternalChannelRegistrationHostRequest({
    channelId: "slack",
    registry: pendingRegistry,
    candidates: [{
      channelId: "slack",
      botToken: "xoxb-phase95-pending-secret",
      enabled: true,
      workspaceId: "T123",
    }],
  });
  assertEqual(pending.isError, true, "Pending candidate fails closed");
  assert(pending.output.includes("approval"), "Pending rejection explains approval requirement");
  assertEqual(pendingRegistry.status().channels.length, 0, "Pending candidate does not mutate registry");
  assert(!containsSecrets(pending), "Pending rejection redacts token and exact signature");

  const wrongApprovalRegistry = new ChannelRegistry();
  const wrongApproval = await executeExternalChannelRegistrationHostRequest({
    channelId: "slack",
    registry: wrongApprovalRegistry,
    candidates: [{
      ...approved,
      approval: {
        approvedBy: "operator",
        signature: "channel-adapter:slack:wrong",
      },
    }],
  });
  assertEqual(wrongApproval.isError, true, "Wrong approval signature fails closed");
  assertEqual(wrongApprovalRegistry.status().channels.length, 0, "Wrong approval signature does not mutate registry");
  assert(!containsSecrets(wrongApproval), "Wrong approval rejection redacts token and exact signature");

  const blankApproverRegistry = new ChannelRegistry();
  const blankApprover = await executeExternalChannelRegistrationHostRequest({
    channelId: "slack",
    registry: blankApproverRegistry,
    candidates: [{
      ...approved,
      approval: {
        ...approved.approval!,
        approvedBy: "   ",
      },
    }],
  });
  assertEqual(blankApprover.isError, true, "Blank approver fails closed");
  assertEqual(blankApproverRegistry.status().channels.length, 0, "Blank approver does not mutate registry");

  const staleApprovalRegistry = new ChannelRegistry();
  const staleApproval = await executeExternalChannelRegistrationHostRequest({
    channelId: "slack",
    registry: staleApprovalRegistry,
    candidates: [{
      ...approved,
      botToken: "xoxb-phase95-rotated-secret",
    }],
  });
  assertEqual(staleApproval.isError, true, "Stale approval signature after candidate mutation fails closed");
  assertEqual(staleApprovalRegistry.status().channels.length, 0, "Stale approval does not mutate registry");
  assert(!containsSecrets(staleApproval), "Stale approval rejection redacts rotated token and exact signature");

  const unsafeRegistry = new ChannelRegistry();
  const unsafe = await executeExternalChannelRegistrationHostRequest({
    channelId: "discord",
    registry: unsafeRegistry,
    candidates: [{
      channelId: "discord",
      botToken: "discord-token",
      enabled: true,
      apiBaseUrl: "http://127.0.0.1:4444?token=phase95-bad-query",
      approval: {
        approvedBy: "operator",
        signature: "channel-adapter:discord:wrong",
      },
    }],
  });
  assertEqual(unsafe.isError, true, "Unsafe candidate config fails closed");
  assertEqual(unsafeRegistry.status().channels.length, 0, "Unsafe candidate does not mutate registry");
  assert(!JSON.stringify(unsafe).includes("phase95-bad-query"), "Unsafe rejection redacts query secret");

  const existingRegistry = new ChannelRegistry();
  await executeExternalChannelRegistrationHostRequest({
    channelId: "slack",
    registry: existingRegistry,
    candidates: [approved],
  });
  const alreadyRegistered = await executeExternalChannelRegistrationHostRequest({
    channelId: "slack",
    registry: existingRegistry,
    candidates: [approved],
  });
  assertEqual(alreadyRegistered.isError, true, "Already-registered adapter fails closed");
  assert(alreadyRegistered.output.includes("already registered"), "Already-registered rejection is explicit");
  assertEqual(existingRegistry.status().channels.length, 1, "Already-registered retry does not duplicate registry entry");
}

async function verifyGatewayOptionalHandlerIntegration(): Promise<void> {
  section("3. Gateway Optional Handler Integration");

  const registry = new ChannelRegistry();
  const messages: string[] = [];
  const errors: string[] = [];
  const awaitedApprovedSlack = await approvedCandidate("slack");
  const command: CommandResult = {
    handled: true,
    command: "channels",
    output: "External adapter registration request staged.\nExecution: host-mediated.",
    data: { action: "channels_external_register_request", channelId: "slack" },
    isError: false,
    action: { kind: "register_external_channel_adapter", channelId: "slack" },
  };

  const handlers: CommandExecutionHandlers = {
    submitChat: () => {},
    exitApp: () => {},
    resetSession: () => {},
    requestCompaction: () => {},
    setBudgetCap: () => {},
    showSystemMessage: (message) => messages.push(message),
    showErrorMessage: (message) => errors.push(message),
    requestExternalChannelRegistration: (channelId) => executeExternalChannelRegistrationHostRequest({
      channelId,
      registry,
      candidates: [awaitedApprovedSlack],
    }),
  };

  const handled = await executeCommand(command, handlers);
  assertEqual(handled, true, "Gateway executeCommand handles registration action");
  assertEqual(errors.length, 0, "Gateway host execution path emits no errors for approved candidate");
  assert(messages.some((message) => message.includes("request staged")), "Gateway renders command output before host execution");
  assert(messages.some((message) => message.includes("registered")), "Gateway renders host execution result");
  assertEqual(registry.status().channels.length, 1, "Gateway optional handler can mutate host-owned registry");
  assert(!containsSecrets(messages), "Gateway rendered messages remain credential and signature free");

  const withoutHandlerMessages: string[] = [];
  const handledWithoutHandler = await executeCommand(command, {
    ...handlers,
    requestExternalChannelRegistration: undefined,
    showSystemMessage: (message) => withoutHandlerMessages.push(message),
    showErrorMessage: (message) => errors.push(message),
  });
  assertEqual(handledWithoutHandler, true, "Gateway remains no-op when host handler is absent");
  assertEqual(withoutHandlerMessages.length, 1, "Gateway without handler renders only command output");

  const leakingErrors: string[] = [];
  const leakingSignature = await createExternalChannelAdapterApprovalSignature({
    channelId: "slack",
    botToken: "xoxb-phase95-handler-secret",
    enabled: true,
    workspaceId: "T123",
  });
  await executeCommand(command, {
    ...handlers,
    requestExternalChannelRegistration: () => {
      throw new Error(`host failed with xoxb-phase95-handler-secret and ${leakingSignature}`);
    },
    showSystemMessage: () => {},
    showErrorMessage: (message) => leakingErrors.push(message),
  });
  assertEqual(leakingErrors.length, 1, "Gateway reports host handler exception once");
  assert(!containsSecrets(leakingErrors), "Gateway host handler exception redacts token and exact signature");

  const broadLeakErrors: string[] = [];
  await executeCommand(command, {
    ...handlers,
    requestExternalChannelRegistration: () => {
      throw new Error("host failed with sk-live-phase95-secret and channel-adapter:telegram:nothex");
    },
    showSystemMessage: () => {},
    showErrorMessage: (message) => broadLeakErrors.push(message),
  });
  assertEqual(broadLeakErrors.length, 1, "Gateway reports broad host handler exception once");
  assert(!containsSecrets(broadLeakErrors), "Gateway host handler exception redacts non-xoxb tokens and non-hex signatures");

  const arbitraryLeakErrors: string[] = [];
  await executeCommand(command, {
    ...handlers,
    requestExternalChannelRegistration: () => {
      throw new Error("host failed token=plain-secret api_key=abc credential=raw-credential signature=rawsig");
    },
    showSystemMessage: () => {},
    showErrorMessage: (message) => arbitraryLeakErrors.push(message),
  });
  assertEqual(arbitraryLeakErrors.length, 1, "Gateway reports arbitrary host handler exception once");
  assert(!containsSecrets(arbitraryLeakErrors), "Gateway host handler exception suppresses arbitrary credential-shaped fields");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 95 Verification (Host-Owned External Registration Execution)\n");

  await verifyHostOwnedSuccessfulRegistration();
  await verifyFailClosedRegistrationRequests();
  await verifyGatewayOptionalHandlerIntegration();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 95: host-owned external channel registration execution is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
