/** Phase 140 Verification - External Media Transfer Manual Retry Backoff Hints */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferWorkerHandler,
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
    workspaceId: "T140",
    targetKind: "channel",
    targetId: "C140",
    threadId: "171000.1400",
    enabled: true,
    fileRefs: [{
      sourceRef: "artifact:phase140_report",
      name: "phase-140-report.pdf",
      title: "Phase 140 report",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      checksumSha256: "d".repeat(64),
    }],
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
      approvedAt: "2026-05-08T10:20:00.000Z",
      signature,
    },
  };
}

async function executeWithWorker(
  handler: ReturnType<typeof createExternalChannelMediaTransferWorkerHandler>,
): Promise<Awaited<ReturnType<typeof executeExternalChannelMediaTransferHostRequest>>> {
  const { candidate, approval } = await approvedCandidate();
  return executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: handler,
  });
}

function containsForbiddenDurableTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase140_report") ||
    text.includes("sourceRef\":\"artifact:") ||
    text.includes("manual_retry_backoff_request_context") ||
    text.includes("retryPolicy") ||
    text.includes("attemptNumber") ||
    text.includes("xoxb-phase140-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("raw-inline-byte-payload") ||
    text.includes("C:\\secret\\phase140");
}

function assertManualOnlyBackoffBase(data: Record<string, unknown>, label: string): void {
  assertEqual(data.retryMode, "manual_operator_reinvoke", `${label}: retry remains manual operator reinvoke`);
  assertEqual(data.manualRetryBackoffPolicy, "respect_bounded_retry_after_before_operator_reinvoke", `${label}: retry exposes bounded operator backoff policy`);
  assertEqual(data.manualRetryBackoffHintTruth, "operator_hint_only_no_retry_schedule_or_worker", `${label}: retry backoff truth is operator-hint only`);
  assertEqual(data.retryWorkerCreated, false, `${label}: no retry worker is created`);
  assertEqual(data.retryScheduleCreated, false, `${label}: no retry schedule is created`);
  assertEqual(data.retryBackoffScheduleCreated, false, `${label}: no retry backoff schedule is created`);
  assertEqual(data.retryBackoffPersistenceCreated, false, `${label}: no retry backoff persistence is created`);
  assertEqual(data.automaticRetryCreated, false, `${label}: no automatic retry is created`);
}

async function verifySourceRetryAfterCarriesBackoffHint(): Promise<void> {
  section("1. Source Retry-After Carries Operator Backoff Hint");
  let senderCalled = false;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 1,
    resolveSourceRef: async () => ({
      accepted: false,
      retryable: true,
      retryAfterSeconds: 17,
      reason: "temporary media store lock https://files.slack.com/private-download-url?token=xoxb-phase140-secret",
    }),
    sendToVendor: async (action) => {
      senderCalled = true;
      return { accepted: true, transferKey: action.transferKey, deliveredCount: 1 };
    },
  }));

  assertEqual(result.isError, true, "retryable source rejection remains failed");
  assertEqual(senderCalled, false, "source rejection prevents vendor send");
  assertEqual(result.data.manualRetryStage, "source_resolution", "source retry stays source-resolution scoped");
  assertEqual(result.data.retryAfterSeconds, 17, "source retry preserves bounded retry-after");
  assertManualOnlyBackoffBase(result.data, "source rejection");
  assertEqual(result.data.manualRetryBackoffSource, "bounded_retry_after_seconds", "source retry backoff source is retry-after");
  assertEqual(result.data.manualRetryRecommendedWaitSeconds, 17, "source retry carries recommended wait seconds");
  assert(!containsForbiddenDurableTruth(result), "source retry leaks no request context, refs, credentials, URLs, bytes, or signatures");
}

async function verifyVendorRetryAfterCarriesClampedBackoffHint(): Promise<void> {
  section("2. Vendor Retry-After Carries Clamped Operator Backoff Hint");
  let senderCallCount = 0;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
    }),
    sendToVendor: async () => {
      senderCallCount++;
      return {
        accepted: false,
        retryable: true,
        retryAfterSeconds: 999999,
        reason: "vendor rejected send at https://files.slack.com/private-download-url?token=xoxb-phase140-secret",
      };
    },
  }));

  assertEqual(result.isError, true, "retryable vendor rejection remains failed");
  assertEqual(senderCallCount, 1, "vendor rejection is not automatically retried");
  assertEqual(result.data.manualRetryStage, "vendor_send", "vendor retry stays vendor-send scoped");
  assertEqual(result.data.retryAfterSeconds, 3600, "vendor retry-after is clamped");
  assertManualOnlyBackoffBase(result.data, "vendor rejection");
  assertEqual(result.data.manualRetryBackoffSource, "bounded_retry_after_seconds", "vendor retry backoff source is retry-after");
  assertEqual(result.data.manualRetryRecommendedWaitSeconds, 3600, "vendor retry carries clamped recommended wait seconds");
  assert(!containsForbiddenDurableTruth(result), "vendor retry leaks no request context, refs, credentials, URLs, bytes, or signatures");
}

async function verifyGenericRetryableHostRejectionWithoutRetryAfterHasNoWaitClaim(): Promise<void> {
  section("3. Generic Retryable Host Rejection Without Retry-After Has No Wait Claim");
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async () => ({
      accepted: false,
      retryable: true,
      reason: "temporary host queue saturation",
    }),
  });

  assertEqual(result.isError, true, "generic retryable host rejection remains failed");
  assertEqual(result.data.nextOperatorAction, "Re-run the approved external media transfer after checking host-owned media stores, credentials, and vendor availability.", "generic retryable host result keeps generic next operator action");
  assertEqual("manualRetryStage" in result.data, false, "generic host rejection has no stage-specific safety");
  assertEqual("retryAfterSeconds" in result.data, false, "generic host rejection without retry-after has no retry-after claim");
  assertManualOnlyBackoffBase(result.data, "generic host rejection");
  assertEqual(result.data.manualRetryBackoffSource, "none", "generic host rejection backoff source is none");
  assertEqual("manualRetryRecommendedWaitSeconds" in result.data, false, "generic host rejection has no wait-seconds claim");
  assert(!containsForbiddenDurableTruth(result), "generic retry leaks no request context, refs, credentials, URLs, bytes, or signatures");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 140 Verification (External Media Transfer Manual Retry Backoff Hints)\n");
  await verifySourceRetryAfterCarriesBackoffHint();
  await verifyVendorRetryAfterCarriesClampedBackoffHint();
  await verifyGenericRetryableHostRejectionWithoutRetryAfterHasNoWaitClaim();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 140: external media transfer manual retry backoff hints are GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
