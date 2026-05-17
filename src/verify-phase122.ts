/** Phase 122 Verification - External Media Transfer Manual Retry UX */

import {
  createExternalChannelMediaTransferApprovalSignature,
  executeExternalChannelMediaTransferHostRequest,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
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

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T122",
    targetKind: "channel",
    targetId: "C122",
    threadId: "171000.1220",
    enabled: true,
    fileRefs: [
      {
        sourceRef: "artifact:phase122_report",
        name: "phase-122-report.pdf",
        title: "Phase 122 report",
        mimeType: "application/pdf",
        sizeBytes: 4096,
        checksumSha256: "d".repeat(64),
      },
    ],
    ...overrides,
  };
}

async function approvedCandidate(
  overrides: Partial<ExternalChannelMediaTransferCandidate> = {},
): Promise<{ candidate: ExternalChannelMediaTransferCandidate; approval: ExternalChannelMediaTransferApproval }> {
  const candidate = safeCandidate(overrides);
  const signature = await createExternalChannelMediaTransferApprovalSignature(candidate);
  return {
    candidate,
    approval: {
      approvedBy: "operator",
      approvedAt: "2026-05-08T05:43:00.000Z",
      signature,
    },
  };
}

function containsForbiddenDurableTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase122_report") ||
    text.includes("channel-media-transfer:") ||
    text.includes("xoxb-phase122-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("raw-inline-byte-payload");
}

async function verifyRetryableHandlerRejectionGetsManualRetryUx(): Promise<void> {
  section("1. Retryable Handler Rejection Gets Manual Retry UX");
  const { candidate, approval } = await approvedCandidate();
  let calls = 0;
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (action) => {
      calls++;
      return {
        accepted: false,
        transferKey: action.transferKey,
        retryable: true,
        retryAfterSeconds: 999999,
        reason: "Slack upload rate limited at https://files.slack.com/private-download-url?token=xoxb-phase122-secret",
      };
    },
  });

  assertEqual(result.isError, true, "retryable host rejection remains failed");
  assertEqual(calls, 1, "retryable host rejection does not perform an automatic second attempt");
  assertEqual(result.data.reasonCode, "handler_rejected", "retryable rejection keeps stable handler reason");
  assertEqual(result.data.retryable, true, "retryable host rejection is marked retryable");
  assertEqual(result.data.retryMode, "manual_operator_reinvoke", "retryable host rejection uses manual retry mode");
  assertEqual(result.data.retryReason, "host_handler_rejected", "retry reason is stable and bounded");
  assertEqual(result.data.retryAfterSeconds, 3600, "retry-after seconds are clamped");
  assertEqual(result.data.retryWorkerCreated, false, "no retry worker is created");
  assertEqual(result.data.retryScheduleCreated, false, "no retry schedule is created");
  assert(String(result.output).includes("No automatic retry was attempted"), "output states there is no automatic retry");
  assert(!containsForbiddenDurableTruth(result), "retryable rejection leaks no raw refs, URLs, bytes, or credentials");
}

async function verifyHandlerExceptionStaysNonRetryableWithoutClassification(): Promise<void> {
  section("2. Handler Exception Stays Non-Retryable Without Classification");
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async () => {
      throw new Error("upload failed for raw-inline-byte-payload at https://files.slack.com/private-download-url?token=xoxb-phase122-secret");
    },
  });

  assertEqual(result.isError, true, "handler exception remains failed");
  assertEqual(result.data.reasonCode, "handler_rejected", "handler exception keeps stable handler reason");
  assertEqual(result.data.retryable, false, "handler exception is not retryable without explicit host classification");
  assertEqual("retryMode" in result.data, false, "handler exception does not imply retry UX");
  assertEqual("retryWorkerCreated" in result.data, false, "handler exception creates no retry worker");
  assertEqual("retryScheduleCreated" in result.data, false, "handler exception creates no retry schedule");
  assert(!containsForbiddenDurableTruth(result), "handler exception leaks no raw refs, URLs, bytes, or credentials");
}

async function verifyDefaultHandlerRejectionStaysNonRetryable(): Promise<void> {
  section("3. Default Handler Rejection Stays Non-Retryable");
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (action) => ({
      accepted: false,
      transferKey: action.transferKey,
      reason: "operator cancelled upload",
    }),
  });

  assertEqual(result.isError, true, "default host rejection remains failed");
  assertEqual(result.data.reasonCode, "handler_rejected", "default rejection keeps stable handler reason");
  assertEqual(result.data.retryable, false, "default host rejection remains non-retryable");
  assertEqual("retryMode" in result.data, false, "default host rejection does not imply retry UX");
  assertEqual("retryWorkerCreated" in result.data, false, "default host rejection does not mention retry worker");
  assert(!containsForbiddenDurableTruth(result), "default rejection leaks no raw refs, URLs, bytes, or credentials");
}

async function verifyTransferKeyMismatchStaysIntegrityFailure(): Promise<void> {
  section("4. Transfer Key Mismatch Stays Non-Retryable Integrity Failure");
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (action) => ({
      accepted: true,
      transferKey: `${action.transferKey}-stale`,
      retryable: true,
      retryAfterSeconds: 30,
      vendorMessageId: "slack-phase122-message",
    }),
  });

  assertEqual(result.isError, true, "transfer-key mismatch remains failed");
  assertEqual(result.data.reasonCode, "transfer_key_mismatch", "transfer-key mismatch keeps integrity reason");
  assertEqual(result.data.retryable, false, "transfer-key mismatch remains non-retryable");
  assertEqual("retryMode" in result.data, false, "transfer-key mismatch does not imply retry UX");
  assertEqual("vendorMessageId" in result.data, false, "transfer-key mismatch does not preserve vendor message id");
  assert(!containsForbiddenDurableTruth(result), "transfer-key mismatch leaks no raw refs, URLs, bytes, or credentials");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 122 Verification (External Media Transfer Manual Retry UX)\n");
  await verifyRetryableHandlerRejectionGetsManualRetryUx();
  await verifyHandlerExceptionStaysNonRetryableWithoutClassification();
  await verifyDefaultHandlerRejectionStaysNonRetryable();
  await verifyTransferKeyMismatchStaysIntegrityFailure();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 122: external media transfer manual retry UX is GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });
