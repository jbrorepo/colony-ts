/** Phase 135 Verification - External Media Transfer Manual Retry Revalidation Handoff */

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
function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T135",
    targetKind: "channel",
    targetId: "C135",
    threadId: "171000.1350",
    enabled: true,
    fileRefs: [
      {
        sourceRef: "artifact:phase135_report",
        name: "phase-135-report.pdf",
        title: "Phase 135 report",
        mimeType: "application/pdf",
        sizeBytes: 4096,
        checksumSha256: "e".repeat(64),
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
      approvedAt: "2026-05-08T09:09:00.000Z",
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

function assertManualRetryRevalidation(data: Record<string, unknown>, label: string): void {
  assertEqual(data.retryMode, "manual_operator_reinvoke", `${label}: retry remains manual operator reinvoke`);
  assertEqual(data.manualRetryRequiresFreshApprovalCheck, true, `${label}: fresh approval check is required before reinvoke`);
  assertEqual(data.manualRetryRequiresSourceRefRevalidation, true, `${label}: source refs must be revalidated before reinvoke`);
  assertEqual(data.manualRetryMustResolveSourcesFresh, true, `${label}: sources must be resolved fresh on reinvoke`);
  assertEqual(data.manualRetryMustNotReuseResolvedFiles, true, `${label}: stale resolved files must not be reused`);
  assertEqual(data.manualRetryApprovalBoundary, "fresh_operator_reinvoke_required", `${label}: approval boundary is explicit`);
  assertEqual(data.manualRetryHandoffTruth, "manual_reinvoke_only_no_automatic_retry_or_stale_resolved_files", `${label}: handoff truth forbids automatic or stale reuse`);
  assertEqual(data.retryWorkerCreated, false, `${label}: no retry worker is created`);
  assertEqual(data.retryScheduleCreated, false, `${label}: no retry schedule is created`);
}

async function verifyRetryableHostRejectionCarriesRevalidationHandoff(): Promise<void> {
  section("1. Retryable Host Rejection Carries Revalidation Handoff");
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async () => ({
      accepted: false,
      retryable: true,
      retryAfterSeconds: 13,
      reason: "temporary host queue saturation",
    }),
  });

  assertEqual(result.isError, true, "retryable host rejection remains a failed handoff");
  assertEqual(result.data.retryAfterSeconds, 13, "retry-after remains bounded and preserved");
  assertManualRetryRevalidation(result.data, "host rejection");
}

async function verifySourceTimeoutRevalidatesWithoutVendorStateCheck(): Promise<void> {
  section("2. Source Timeout Requires Fresh Source Revalidation");
  let senderCalled = false;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveTimeoutMs: 5,
    resolveSourceRef: async () => {
      await delay(35);
      return { sourceRefFingerprint: "e".repeat(64), sizeBytes: 1 };
    },
    sendToVendor: async (action) => {
      senderCalled = true;
      return { accepted: true, transferKey: action.transferKey, deliveredCount: 1 };
    },
  }));

  assertEqual(result.isError, true, "source timeout remains a failed handoff");
  assertEqual(senderCalled, false, "source timeout prevents vendor send");
  assertEqual(result.data.manualRetryStage, "source_resolution", "source timeout keeps source-resolution safety stage");
  assertEqual(result.data.operatorMustVerifyVendorStateBeforeRetry, false, "source timeout does not require vendor-state verification");
  assertManualRetryRevalidation(result.data, "source timeout");
}

async function verifyVendorTimeoutRevalidatesAndRequiresVendorStateCheck(): Promise<void> {
  section("3. Vendor Timeout Requires Fresh Revalidation And Vendor State Check");
  let senderCallCount = 0;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    vendorSendTimeoutMs: 5,
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
    }),
    sendToVendor: async () => {
      senderCallCount++;
      await delay(35);
      return { accepted: true, transferKey: "late-transfer-key", deliveredCount: 1 };
    },
  }));

  assertEqual(result.isError, true, "vendor timeout remains a failed handoff");
  assertEqual(senderCallCount, 1, "vendor timeout is not automatically retried");
  assertEqual(result.data.manualRetryStage, "vendor_send", "vendor timeout keeps vendor-send safety stage");
  assertEqual(result.data.operatorMustVerifyVendorStateBeforeRetry, true, "vendor timeout requires vendor-state verification");
  assertManualRetryRevalidation(result.data, "vendor timeout");
}

async function verifyNonRetryableAndSuccessDoNotCarryManualRevalidation(): Promise<void> {
  section("4. Non-retryable And Success Results Do Not Carry Manual Revalidation");
  const { candidate, approval } = await approvedCandidate();
  const nonRetryable = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async () => ({
      accepted: false,
      retryable: false,
      reason: "permanent host policy rejection",
    }),
  });

  assertEqual(nonRetryable.isError, true, "non-retryable rejection remains failed");
  assertEqual(nonRetryable.data.retryable, false, "non-retryable rejection stays non-retryable");
  assertEqual("manualRetryRequiresFreshApprovalCheck" in nonRetryable.data, false, "non-retryable rejection has no manual revalidation handoff");

  const success = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (action) => ({
      accepted: true,
      transferKey: action.transferKey,
      deliveredCount: 1,
    }),
  });

  assertEqual(success.isError, false, "successful host handoff remains successful");
  assertEqual(success.data.retryable, false, "successful host handoff is not retryable");
  assertEqual("manualRetryRequiresFreshApprovalCheck" in success.data, false, "successful handoff has no manual revalidation handoff");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 135 Verification (External Media Transfer Manual Retry Revalidation Handoff)\n");
  await verifyRetryableHostRejectionCarriesRevalidationHandoff();
  await verifySourceTimeoutRevalidatesWithoutVendorStateCheck();
  await verifyVendorTimeoutRevalidatesAndRequiresVendorStateCheck();
  await verifyNonRetryableAndSuccessDoNotCarryManualRevalidation();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 135: external media transfer manual retry revalidation handoff is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
