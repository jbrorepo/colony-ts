/** Phase 191 Verification - External Media Transfer Manual Retry Control Worker Invocation Execution Receipt */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionResult,
} from "./channel";
import {
  containsForbiddenTruth,
  vendorWorkerInvocationHandoffFixture,
  workerHandlerReadinessFixture,
} from "./verify-phase188";

const FRESH_APPROVAL_REQUIRED_AFTER = "2026-05-09T01:48:00.000Z";
const VENDOR_FRESH_APPROVAL_REQUIRED_AFTER = "2026-05-08T16:14:59.000Z";

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
  assert(actual === expected, `${label}${actual === expected ? "" : ` - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}
function section(title: string): void {
  console.log(`\n${"=".repeat(60)}\n  ${title}\n${"=".repeat(60)}`);
}

function fileRefs(prefix = "phase191_media", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-191-media-${index}.pdf`,
    title: `Phase 191 media ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 4096 + index,
    checksumSha256: `${(index + 1).toString(16)}`.repeat(64),
  }));
}

async function approvedCandidate(
  overrides: Partial<ExternalChannelMediaTransferCandidate> = {},
): Promise<{ candidate: ExternalChannelMediaTransferCandidate; approval: ExternalChannelMediaTransferApproval }> {
  const candidate: ExternalChannelMediaTransferCandidate = {
    channelId: "slack",
    workspaceId: "T191RECEIPT",
    accountId: "A191RECEIPT",
    targetKind: "channel",
    targetId: "C191RECEIPT",
    threadId: "171000.1910",
    enabled: true,
    fileRefs: fileRefs(),
    ...overrides,
  };
  return {
    candidate,
    approval: {
      approvedBy: "operator",
      approvedAt: "2026-05-09T01:49:00.000Z",
      signature: await createExternalChannelMediaTransferApprovalSignature(candidate),
    },
  };
}

async function invocationExecutionFixture(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}) {
  const { candidate, approval } = await approvedCandidate(overrides);
  const fixture = await workerHandlerReadinessFixture({
    workspaceId: candidate.workspaceId,
    accountId: candidate.accountId,
    targetId: candidate.targetId,
    threadId: candidate.threadId,
    fileRefs: candidate.fileRefs,
  });
  const handoffResult = await createExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff({
    ...fixture,
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler(),
  });
  assert(Boolean(handoffResult.retryControlWorkerInvocationHandoff), "fixture retry-control worker invocation handoff is returned");
  const retryControlWorkerInvocationHandoff = handoffResult.retryControlWorkerInvocationHandoff!;
  const execution = await executeExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff({
    ...fixture,
    candidate,
    approval,
    freshApprovalRequiredAfter: FRESH_APPROVAL_REQUIRED_AFTER,
    retryControlWorkerInvocationHandoff,
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => ({
        sourceRefFingerprint: request.sourceRefFingerprint,
        name: request.name,
        mimeType: request.mimeType,
        sizeBytes: request.sizeBytes,
        checksumSha256: request.checksumSha256,
      }),
      sendToVendor: async (action, resolvedFiles) => ({
        accepted: true,
        transferKey: action.transferKey,
        deliveredCount: resolvedFiles.length,
        receipt: {
          status: "sent",
          deliveredCount: resolvedFiles.length,
          inspectedFileCount: resolvedFiles.length,
        },
      }),
    }),
  });
  assertEqual(execution.accepted, true, "fixture retry-control worker invocation execution is accepted");
  return {
    ...fixture,
    candidate,
    approval,
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler(),
    retryControlWorkerInvocationHandoff,
    retryControlWorkerInvocationExecution: execution,
  };
}

async function verifyInvocationExecutionReceiptBindsSanitizedHostResult(): Promise<void> {
  section("1. Invocation Execution Receipt Binds Sanitized Host Result");
  const fixture = await invocationExecutionFixture({ fileRefs: fileRefs("phase191_receipt") });

  const result = await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt(fixture);

  assertEqual(result.accepted, true, "invocation execution receipt is accepted after verified execution");
  const receipt = result.retryControlWorkerInvocationExecutionReceipt;
  assert(Boolean(receipt), "invocation execution receipt is returned");
  assert(receipt?.retryControlWorkerInvocationExecutionReceiptId.startsWith("manual-retry-control-worker-invocation-execution-receipt:") === true, "receipt id uses the Phase 191 domain");
  assertEqual(receipt?.retryControlWorkerInvocationHandoffId, fixture.retryControlWorkerInvocationHandoff.retryControlWorkerInvocationHandoffId, "receipt binds invocation handoff id");
  assertEqual(receipt?.transferKey, fixture.retryControlWorkerInvocationHandoff.transferKey, "receipt binds transfer key");
  assertEqual(receipt?.hostExecutionAttempted, true, "receipt records host execution attempt");
  assertEqual(receipt?.hostResultAccepted, true, "receipt records accepted host result");
  assertEqual(receipt?.transferKeyEchoMatched, true, "receipt records transfer-key echo truth");
  assertEqual(receipt?.hostReportedDeliveredCount, fixture.candidate.fileRefs.length, "receipt records bounded delivered count");
  assertEqual(receipt?.hostReceiptMetadataIncluded, true, "receipt records host receipt metadata presence without raw receipt URLs");
  assertEqual(receipt?.vendorStateVerified, false, "source-stage receipt records no vendor-state verification requirement");
  assertEqual(receipt?.retryControlWorkerInvocationExecutionReceiptPersisted, false, "receipt is not persisted by Colony");
  assertEqual(receipt?.retryWorkerCreated, false, "receipt creates no retry worker");
  assertEqual(receipt?.retryScheduleCreated, false, "receipt creates no retry schedule");
  assertEqual(receipt?.automaticVendorRetryAllowed, false, "receipt allows no automatic vendor retry");
  assertEqual(receipt?.defaultLiveDeliveryEnabled, false, "receipt enables no default live delivery");
  assertEqual(receipt?.publicHostingEnabled, false, "receipt enables no public hosting");
  assert(!containsForbiddenTruth(result), "accepted invocation execution receipt leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyVendorInvocationExecutionReceiptRequiresVerifiedExecution(): Promise<void> {
  section("2. Vendor Invocation Execution Receipt Requires Verified Execution");
  const fixture = await vendorWorkerInvocationHandoffFixture();
  const execution = await executeExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff({
    ...fixture,
    freshApprovalRequiredAfter: VENDOR_FRESH_APPROVAL_REQUIRED_AFTER,
    vendorStateVerification: {
      handoffId: fixture.retryControlWorkerInvocationHandoff.retryControlWorkerInvocationHandoffId,
      transferKey: fixture.retryControlWorkerInvocationHandoff.transferKey,
      verifiedAt: "2026-05-09T01:50:00.000Z",
      verifiedBy: "operator",
      vendorStateVerificationTruth: "host_verified_vendor_state_before_manual_reinvoke_no_automatic_vendor_retry",
    },
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => ({
        sourceRefFingerprint: request.sourceRefFingerprint,
        name: request.name,
        mimeType: request.mimeType,
        sizeBytes: request.sizeBytes,
        checksumSha256: request.checksumSha256,
      }),
      sendToVendor: async (action, resolvedFiles) => ({
        accepted: true,
        transferKey: action.transferKey,
        deliveredCount: resolvedFiles.length,
      }),
    }),
  });
  assertEqual(execution.accepted, true, "fixture vendor invocation execution is accepted");

  const accepted = await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt({
    ...fixture,
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler(),
    retryControlWorkerInvocationExecution: execution,
  });
  assertEqual(accepted.accepted, true, "vendor invocation execution receipt accepts verified execution");
  assertEqual(accepted.retryControlWorkerInvocationExecutionReceipt?.vendorStateVerified, true, "vendor receipt binds vendor-state truth");

  const tamperedExecution: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionResult = {
    ...execution,
    vendorStateVerified: false,
  };
  const rejected = await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt({
    ...fixture,
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler(),
    retryControlWorkerInvocationExecution: tamperedExecution,
  });
  assertEqual(rejected.accepted, false, "vendor invocation execution receipt rejects missing vendor-state truth");
  assertEqual(rejected.reasonCode, "manual_retry_control_worker_invocation_execution_current_truth_mismatch", "vendor-state mismatch rejection is bounded");
  assert(!containsForbiddenTruth([accepted, rejected]), "vendor invocation execution receipt results leak no raw truth");
}

async function verifyInvocationExecutionReceiptRejectsTamperedOrFailedExecution(): Promise<void> {
  section("3. Invocation Execution Receipt Rejects Tampered Or Failed Execution");
  const fixture = await invocationExecutionFixture({ fileRefs: fileRefs("phase191_tampered") });
  const tamperedTransfer: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionResult = {
    ...fixture.retryControlWorkerInvocationExecution,
    hostResult: fixture.retryControlWorkerInvocationExecution.hostResult
      ? {
          ...fixture.retryControlWorkerInvocationExecution.hostResult,
          data: {
            ...fixture.retryControlWorkerInvocationExecution.hostResult.data,
            transferKey: "media-transfer:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          },
        }
      : undefined,
  };
  const tampered = await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt({
    ...fixture,
    retryControlWorkerInvocationExecution: tamperedTransfer,
  });
  assertEqual(tampered.accepted, false, "tampered transfer-key execution blocks receipt");
  assertEqual(tampered.reasonCode, "manual_retry_control_worker_invocation_execution_current_truth_mismatch", "tampered execution rejection is bounded");

  const forgedExecution = JSON.parse(JSON.stringify(
    fixture.retryControlWorkerInvocationExecution,
  )) as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionResult;
  const forged = await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt({
    ...fixture,
    retryControlWorkerInvocationExecution: forgedExecution,
  });
  assertEqual(forged.accepted, false, "forged execution-shaped object blocks receipt");
  assertEqual(forged.reasonCode, "manual_retry_control_worker_invocation_execution_current_truth_mismatch", "forged execution rejection is bounded");

  const failedExecution: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionResult = {
    ...fixture.retryControlWorkerInvocationExecution,
    accepted: false,
    reasonCode: "host_manual_reinvoke_failed",
  };
  const failedResult = await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt({
    ...fixture,
    retryControlWorkerInvocationExecution: failedExecution,
  });
  assertEqual(failedResult.accepted, false, "failed host execution blocks receipt");
  assertEqual(failedResult.reasonCode, "accepted_manual_retry_control_worker_invocation_execution_required", "failed execution rejection is bounded");

  const contaminatedFixture = await invocationExecutionFixture({ fileRefs: fileRefs("phase191_contaminated") });
  const contaminatedExecution =
    contaminatedFixture.retryControlWorkerInvocationExecution as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionResult & {
      credential?: string;
    };
  contaminatedExecution.credential = "xoxb-secret-value";
  const contaminated = await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt({
    ...contaminatedFixture,
    retryControlWorkerInvocationExecution: contaminatedExecution,
  });
  assertEqual(contaminated.accepted, false, "contaminated trusted execution envelope blocks receipt");
  assertEqual(contaminated.reasonCode, "manual_retry_control_worker_invocation_execution_current_truth_mismatch", "contaminated execution rejection is bounded");
  assert(!containsForbiddenTruth([tampered, forged, failedResult, contaminated]), "invocation execution receipt rejection results leak no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 191 Verification (External Media Transfer Manual Retry Control Worker Invocation Execution Receipt)\n");
  await verifyInvocationExecutionReceiptBindsSanitizedHostResult();
  await verifyVendorInvocationExecutionReceiptRequiresVerifiedExecution();
  await verifyInvocationExecutionReceiptRejectsTamperedOrFailedExecution();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 191: external media transfer manual retry control worker invocation execution receipt is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
