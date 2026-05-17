/** Phase 192 Verification - External Media Transfer Manual Retry Control Worker Invocation Execution Receipt Preflight */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt,
} from "./channel";
import {
  containsForbiddenTruth,
  workerHandlerReadinessFixture,
} from "./verify-phase188";

const FRESH_APPROVAL_REQUIRED_AFTER = "2026-05-09T01:48:00.000Z";

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

function fileRefs(prefix = "phase192_media", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-192-media-${index}.pdf`,
    title: `Phase 192 media ${index}`,
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
    workspaceId: "T192PREFLIGHT",
    accountId: "A192PREFLIGHT",
    targetKind: "channel",
    targetId: "C192PREFLIGHT",
    threadId: "171000.1920",
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

export async function invocationExecutionReceiptFixture(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}) {
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
  const receiptResult = await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt({
    ...fixture,
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler(),
    retryControlWorkerInvocationHandoff,
    retryControlWorkerInvocationExecution: execution,
  });
  assertEqual(receiptResult.accepted, true, "fixture retry-control worker invocation execution receipt is accepted");
  return {
    ...fixture,
    candidate,
    approval,
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler(),
    retryControlWorkerInvocationHandoff,
    retryControlWorkerInvocationExecution: execution,
    retryControlWorkerInvocationExecutionReceipt: receiptResult.retryControlWorkerInvocationExecutionReceipt!,
  };
}

async function verifyInvocationExecutionReceiptPreflightAcceptsCurrentReceipt(): Promise<void> {
  section("1. Invocation Execution Receipt Preflight Accepts Current Receipt");
  const fixture = await invocationExecutionReceiptFixture({ fileRefs: fileRefs("phase192_accepted") });

  const preflight = await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt(fixture);

  assertEqual(preflight.accepted, true, "receipt preflight accepts a supplied current receipt");
  assertEqual(preflight.retryControlWorkerInvocationExecutionReceiptIdMatched, true, "receipt id matches recomputed truth");
  assertEqual(preflight.retryControlWorkerInvocationHandoffIdMatched, true, "handoff id matches recomputed truth");
  assertEqual(preflight.retryControlWorkerHandlerReadinessIdMatched, true, "handler readiness id matches recomputed truth");
  assertEqual(preflight.retryControlWorkerSelectionIdMatched, true, "selection id matches recomputed truth");
  assertEqual(preflight.retryControlOperatorHandoffIdMatched, true, "operator handoff id matches recomputed truth");
  assertEqual(preflight.manualRetryControlReadinessPlanIdMatched, true, "readiness plan id matches recomputed truth");
  assertEqual(preflight.manualRetryLedgerEntryIdMatched, true, "ledger entry id matches recomputed truth");
  assertEqual(preflight.transferKeyMatched, true, "transfer key matches recomputed truth");
  assertEqual(preflight.hostReportedDeliveredCountMatched, true, "host delivered count matches recomputed truth");
  assertEqual(preflight.vendorStateVerifiedMatched, true, "vendor-state truth matches recomputed truth");
  assertEqual(preflight.executionReceiptStillNotPersisted, true, "receipt preflight persists no execution receipt");
  assertEqual(preflight.retryLedgerReady, true, "receipt preflight preserves ready retry-ledger truth without creating a new ledger");
  assertEqual(preflight.durableRetryAuditRecordReady, true, "receipt preflight preserves ready durable-audit truth without creating a new audit record");
  assertEqual(preflight.retryWorkerStillBlocked, true, "receipt preflight creates no retry worker or schedule");
  assertEqual(preflight.automaticVendorRetryStillBlocked, true, "receipt preflight enables no automatic vendor retry");
  assertEqual(preflight.defaultLiveDeliveryStillBlocked, true, "receipt preflight enables no default live delivery");
  assertEqual(preflight.publicHostingStillBlocked, true, "receipt preflight enables no public hosting");
  assertEqual(
    preflight.manualRetryControlWorkerInvocationExecutionReceiptPreflightTruth,
    "recomputed_from_manual_retry_control_worker_invocation_execution_and_supplied_receipt_no_persistence",
    "receipt preflight truth states supplied receipt recomputation with no persistence",
  );
  assert(!containsForbiddenTruth(preflight), "accepted receipt preflight leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyInvocationExecutionReceiptPreflightRejectsMismatchedReceipt(): Promise<void> {
  section("2. Invocation Execution Receipt Preflight Rejects Mismatched Receipt");
  const fixture = await invocationExecutionReceiptFixture({ fileRefs: fileRefs("phase192_mismatch") });
  const tampered: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt = {
    ...fixture.retryControlWorkerInvocationExecutionReceipt,
    transferKey: "media-transfer:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  };

  const preflight = await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt({
    ...fixture,
    retryControlWorkerInvocationExecutionReceipt: tampered,
  });

  assertEqual(preflight.accepted, false, "receipt preflight rejects mismatched supplied receipt");
  assertEqual(preflight.reasonCode, "manual_retry_control_worker_invocation_execution_receipt_current_truth_mismatch", "mismatched receipt rejection is bounded");
  assertEqual(preflight.transferKeyMatched, false, "mismatched transfer key is reported without raw target data");
  assert(!containsForbiddenTruth(preflight), "mismatched receipt preflight leaks no raw truth");
}

async function verifyInvocationExecutionReceiptPreflightRejectsContaminatedReceipt(): Promise<void> {
  section("3. Invocation Execution Receipt Preflight Rejects Contaminated Receipt");
  const fixture = await invocationExecutionReceiptFixture({ fileRefs: fileRefs("phase192_contaminated") });
  const contaminated = {
    ...fixture.retryControlWorkerInvocationExecutionReceipt,
    credential: "xoxb-secret-value",
  };

  const preflight = await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt({
    ...fixture,
    retryControlWorkerInvocationExecutionReceipt: contaminated,
  });

  assertEqual(preflight.accepted, false, "receipt preflight rejects contaminated supplied receipt");
  assertEqual(preflight.reasonCode, "valid_manual_retry_control_worker_invocation_execution_receipt_required", "contaminated receipt rejection is bounded");
  assertEqual(preflight.retryWorkerStillBlocked, false, "rejected contaminated receipt exposes no trusted worker-blocked claim");
  assert(!containsForbiddenTruth(preflight), "contaminated receipt preflight leaks no raw truth");
}

async function verifyInvocationExecutionReceiptRejectsPostTrustExecutionMutation(): Promise<void> {
  section("4. Invocation Execution Receipt Rejects Post-Trust Execution Mutation");
  const fixture = await invocationExecutionReceiptFixture({ fileRefs: fileRefs("phase192_mutated_execution") });
  const hostResult = fixture.retryControlWorkerInvocationExecution.hostResult as {
    data?: { deliveredCount?: number };
  };
  assertEqual(typeof hostResult.data?.deliveredCount, "number", "fixture exposes bounded host delivered-count truth");
  hostResult.data!.deliveredCount = 1;

  const receiptResult = await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt({
    ...fixture,
    retryControlWorkerInvocationExecution: fixture.retryControlWorkerInvocationExecution,
  });
  assertEqual(receiptResult.accepted, false, "post-trust execution mutation blocks receipt creation");
  assertEqual(
    receiptResult.reasonCode,
    "manual_retry_control_worker_invocation_execution_current_truth_mismatch",
    "post-trust execution mutation rejection is bounded",
  );

  const preflight = await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt({
    ...fixture,
    retryControlWorkerInvocationExecution: fixture.retryControlWorkerInvocationExecution,
    retryControlWorkerInvocationExecutionReceipt: fixture.retryControlWorkerInvocationExecutionReceipt,
  });
  assertEqual(preflight.accepted, false, "post-trust execution mutation blocks supplied receipt preflight");
  assertEqual(
    preflight.reasonCode,
    "manual_retry_control_worker_invocation_execution_current_truth_mismatch",
    "post-trust execution mutation preflight rejection is bounded",
  );
  assert(!containsForbiddenTruth([receiptResult, preflight]), "post-trust execution mutation rejection leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 192 Verification (External Media Transfer Manual Retry Control Worker Invocation Execution Receipt Preflight)\n");
  await verifyInvocationExecutionReceiptPreflightAcceptsCurrentReceipt();
  await verifyInvocationExecutionReceiptPreflightRejectsMismatchedReceipt();
  await verifyInvocationExecutionReceiptPreflightRejectsContaminatedReceipt();
  await verifyInvocationExecutionReceiptRejectsPostTrustExecutionMutation();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 192: external media transfer manual retry control worker invocation execution receipt preflight is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
