/**
 * Phase 94 Verification Script - External Channel Registration Request Boundary
 *
 * Covers the next Phase 6 channel slice:
 *   1. `/channels external register <channel> <approval-signature>` emits a host-mediated action only for accepted plans
 *   2. Registration request actions carry no credentials, exact signatures, or raw candidate config
 *   3. Pending, missing, unknown, or wrong-signature plans fail closed without mutation actions
 *   4. Operator output redacts exact approval signatures and does not claim live adapter registration
 *
 * Run: bun run src/verify-phase94.ts
 */

import {
  createExternalChannelAdapterApprovalSignature,
  planExternalChannelAdapterRegistrations,
  type ExternalChannelAdapterRegistrationCandidate,
} from "./channel";
import { buildChannelsCommandPayload } from "./gateway-channels";
import { SlashCommandParser } from "./gateway";

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

async function acceptedSlackPlan() {
  const candidate: ExternalChannelAdapterRegistrationCandidate = {
    channelId: "slack",
    botToken: "xoxb-phase94-secret",
    enabled: true,
    workspaceId: "T123",
  };
  const signature = await createExternalChannelAdapterApprovalSignature(candidate);
  const plans = await planExternalChannelAdapterRegistrations([{
    ...candidate,
    approval: {
      approvedBy: "operator",
      approvedAt: "2026-05-02T12:20:00.000Z",
      signature,
    },
  }]);
  return { plans, signature };
}

async function pendingSlackPlan() {
  const candidate: ExternalChannelAdapterRegistrationCandidate = {
    channelId: "slack",
    botToken: "xoxb-phase94-pending-secret",
    enabled: true,
    workspaceId: "T123",
  };
  const signature = await createExternalChannelAdapterApprovalSignature(candidate);
  const plans = await planExternalChannelAdapterRegistrations([candidate]);
  return { plans, signature };
}

async function verifyAcceptedRegistrationRequest(): Promise<void> {
  section("1. Accepted External Registration Request");

  const { plans, signature } = await acceptedSlackPlan();
  const payload = buildChannelsCommandPayload(["external", "register", "slack", signature], { externalAdapters: plans });

  assertEqual(payload.isError, undefined, "Accepted external register request is not a usage error");
  assert(payload.output.includes("External adapter registration request staged"), "Accepted request renders staged request output");
  assert(payload.output.includes("host-mediated"), "Accepted request states host-mediated execution");
  assert(payload.output.includes("does not register adapters"), "Accepted request states gateway does not mutate runtime");
  assert(!payload.output.includes(signature), "Accepted request output redacts exact approval signature");
  assert(!JSON.stringify(payload).includes("xoxb-phase94-secret"), "Accepted request does not leak bot token");
  assertEqual(payload.data?.action, "channels_external_register_request", "Accepted request has stable data action");
  assertEqual(payload.action?.kind, "register_external_channel_adapter", "Accepted request emits registration action");
  assertEqual(payload.action?.channelId, "slack", "Registration action carries channel id");
  assert(!JSON.stringify(payload.action ?? {}).includes(signature), "Registration action does not carry exact approval signature");
  assert(!JSON.stringify(payload.action ?? {}).includes("botToken"), "Registration action carries no credential fields");
  assert(!JSON.stringify(payload.action ?? {}).includes("redactedConfig"), "Registration action carries no config object");
  assert(!JSON.stringify(payload.data ?? {}).includes(signature), "Registration data does not carry exact approval signature");
}

async function verifyParserRegistrationRequest(): Promise<void> {
  section("2. Parser Registration Request");

  const { plans, signature } = await acceptedSlackPlan();
  const parser = new SlashCommandParser({ channels: { externalAdapters: plans } });
  const result = parser.tryHandle(`/channels external register slack ${signature}`);

  assertEqual(result.handled, true, "Parser handles external register request");
  assertEqual(result.isError, false, "Parser external register request is not an error");
  assertEqual(result.action?.kind, "register_external_channel_adapter", "Parser result carries external register action");
  const action = result.action?.kind === "register_external_channel_adapter" ? result.action : undefined;
  assertEqual(action?.channelId, "slack", "Parser action carries channel id");
  assert(!JSON.stringify(result.action ?? {}).includes(signature), "Parser action does not carry exact approval signature");
  assert(!result.output.includes(signature), "Parser output redacts exact approval signature");
}

async function verifyFailClosedRegistrationRequests(): Promise<void> {
  section("3. Fail-Closed Registration Request Rejections");

  const { plans: pendingPlans, signature } = await pendingSlackPlan();
  const pending = buildChannelsCommandPayload(["external", "register", "slack", signature], { externalAdapters: pendingPlans });
  assertEqual(pending.isError, true, "Pending plan cannot request registration action");
  assertEqual(pending.action, undefined, "Pending plan emits no registration action");
  assert(!JSON.stringify(pending).includes("xoxb-phase94-pending-secret"), "Pending rejection redacts token");

  const { plans } = await acceptedSlackPlan();
  const wrongSignature = buildChannelsCommandPayload(["external", "register", "slack", "channel-adapter:slack:wrong"], { externalAdapters: plans });
  assertEqual(wrongSignature.isError, true, "Wrong approval signature is rejected");
  assertEqual(wrongSignature.action, undefined, "Wrong approval signature emits no action");

  const signatureInChannelPosition = buildChannelsCommandPayload(["external", "register", signature, "slack"], { externalAdapters: plans });
  assertEqual(signatureInChannelPosition.isError, true, "Approval signature in channel position is rejected");
  assertEqual(signatureInChannelPosition.action, undefined, "Approval signature in channel position emits no action");
  assert(!JSON.stringify(signatureInChannelPosition).includes(signature), "Approval signature in channel position is redacted from rejection payload");

  const unknown = buildChannelsCommandPayload(["external", "register", "telegram", "channel-adapter:telegram:wrong"], { externalAdapters: plans });
  assertEqual(unknown.isError, true, "Unknown accepted plan is rejected");
  assertEqual(unknown.action, undefined, "Unknown accepted plan emits no action");

  const duplicateAccepted = buildChannelsCommandPayload(["external", "register", "slack", signature], { externalAdapters: [...plans, ...plans] });
  assertEqual(duplicateAccepted.isError, true, "Duplicate accepted plans are rejected as ambiguous");
  assertEqual(duplicateAccepted.action, undefined, "Duplicate accepted plans emit no action");

  const missingSignature = buildChannelsCommandPayload(["external", "register", "slack"], { externalAdapters: plans });
  assertEqual(missingSignature.isError, true, "Missing approval signature is rejected");
  assert(missingSignature.output.includes("Usage:"), "Missing signature returns usage guidance");

  const extraArgs = buildChannelsCommandPayload(["external", "register", "slack", "channel-adapter:slack:wrong", "extra"], { externalAdapters: plans });
  assertEqual(extraArgs.isError, true, "Extra args are rejected");
  assertEqual(extraArgs.action, undefined, "Extra args emit no action");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 94 Verification (External Registration Request Boundary)\n");

  await verifyAcceptedRegistrationRequest();
  await verifyParserRegistrationRequest();
  await verifyFailClosedRegistrationRequests();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 94: external channel registration request boundary is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
