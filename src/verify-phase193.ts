/** Phase 193 Verification - External Media Transfer Manual Retry Control Worker Invocation Execution Receipt Closeout */

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt,
} from "./channel";
import { containsForbiddenTruth } from "./verify-phase188";
import { invocationExecutionReceiptFixture } from "./verify-phase192";

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

function fileRefs(prefix = "phase193_media", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-193-media-${index}.pdf`,
    title: `Phase 193 media ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 4096 + index,
    checksumSha256: `${(index + 1).toString(16)}`.repeat(64),
  }));
}

async function verifyInvocationExecutionReceiptCloseoutAcceptsReceiptPreflight(): Promise<void> {
  section("1. Invocation Execution Receipt Closeout Accepts Receipt Preflight");
  const fixture = await invocationExecutionReceiptFixture({ fileRefs: fileRefs("phase193_accepted") });

  const closeoutResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout(fixture);

  const receipt = fixture.retryControlWorkerInvocationExecutionReceipt;
  const closeout = closeoutResult.retryControlWorkerInvocationExecutionReceiptCloseout!;
  assertEqual(closeoutResult.accepted, true, "receipt closeout accepts a current receipt preflight");
  assert(Boolean(closeout), "receipt closeout descriptor is returned");
  assertEqual(
    closeout.retryControlWorkerInvocationExecutionReceiptCloseoutId.startsWith(
      "manual-retry-control-worker-invocation-execution-receipt-closeout:",
    ),
    true,
    "receipt closeout id is domain-separated",
  );
  assertEqual(closeout.retryControlWorkerInvocationExecutionReceiptId, receipt.retryControlWorkerInvocationExecutionReceiptId, "closeout binds receipt id");
  assertEqual(closeout.retryControlWorkerInvocationHandoffId, receipt.retryControlWorkerInvocationHandoffId, "closeout binds invocation handoff id");
  assertEqual(closeout.retryControlWorkerHandlerReadinessId, receipt.retryControlWorkerHandlerReadinessId, "closeout binds handler readiness id");
  assertEqual(closeout.retryControlWorkerSelectionId, receipt.retryControlWorkerSelectionId, "closeout binds worker selection id");
  assertEqual(closeout.retryControlOperatorHandoffId, receipt.retryControlOperatorHandoffId, "closeout binds operator handoff id");
  assertEqual(closeout.manualRetryControlReadinessPlanId, receipt.manualRetryControlReadinessPlanId, "closeout binds readiness plan id");
  assertEqual(closeout.manualRetryLedgerEntryId, receipt.manualRetryLedgerEntryId, "closeout binds retry-ledger entry id");
  assertEqual(closeout.transferKey, receipt.transferKey, "closeout binds transfer key");
  assertEqual(closeout.hostReportedDeliveredCount, receipt.hostReportedDeliveredCount, "closeout binds bounded delivered count");
  assertEqual(closeout.hostReceiptMetadataIncluded, receipt.hostReceiptMetadataIncluded, "closeout binds receipt metadata truth");
  assertEqual(closeout.vendorStateVerified, receipt.vendorStateVerified, "closeout binds vendor-state truth");
  assertEqual(closeout.sourceRefFingerprints.length, receipt.sourceRefFingerprints.length, "closeout preserves source fingerprint count");
  assertEqual(closeout.manualRetryWorkItemCloseoutReady, true, "closeout marks manual retry work-item closeout ready");
  assertEqual(closeout.manualRetryWorkItemClosedByColony, false, "closeout does not close the work item");
  assertEqual(closeout.retryControlWorkerInvocationExecutionReceiptPersisted, false, "closeout persists no execution receipt");
  assertEqual(closeout.retryLedgerEntryAlreadyPersisted, true, "closeout binds existing retry-ledger persistence truth");
  assertEqual(closeout.durableRetryAuditRecordAlreadyPersisted, true, "closeout binds existing audit-record persistence truth");
  assertEqual(closeout.retryLedgerCreatedByCloseout, false, "closeout creates no new retry ledger");
  assertEqual(closeout.durableRetryAuditRecordCreatedByCloseout, false, "closeout creates no new durable audit record");
  assertEqual(closeout.retryWorkerCreated, false, "closeout creates no retry worker");
  assertEqual(closeout.retryScheduleCreated, false, "closeout creates no retry schedule");
  assertEqual(closeout.automaticVendorRetryAllowed, false, "closeout allows no automatic vendor retry");
  assertEqual(closeout.defaultLiveDeliveryEnabled, false, "closeout enables no default live delivery");
  assertEqual(closeout.publicHostingEnabled, false, "closeout enables no public hosting");
  assertEqual(
    closeoutResult.manualRetryControlWorkerInvocationExecutionReceiptCloseoutTruth,
    "receipt_preflight_bound_manual_retry_control_worker_invocation_closeout_readiness_no_new_ledger_or_audit",
    "receipt closeout truth names preflight-bound readiness without new persistence",
  );
  assert(!containsForbiddenTruth(closeoutResult), "accepted receipt closeout leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyInvocationExecutionReceiptCloseoutRejectsMismatchedReceipt(): Promise<void> {
  section("2. Invocation Execution Receipt Closeout Rejects Mismatched Receipt");
  const fixture = await invocationExecutionReceiptFixture({ fileRefs: fileRefs("phase193_mismatch") });
  const tampered: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt = {
    ...fixture.retryControlWorkerInvocationExecutionReceipt,
    hostReportedDeliveredCount: fixture.retryControlWorkerInvocationExecutionReceipt.hostReportedDeliveredCount + 1,
  };

  const closeoutResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout({
      ...fixture,
      retryControlWorkerInvocationExecutionReceipt: tampered,
    });

  assertEqual(closeoutResult.accepted, false, "receipt closeout rejects mismatched supplied receipt");
  assertEqual(
    closeoutResult.reasonCode,
    "manual_retry_control_worker_invocation_execution_receipt_current_truth_mismatch",
    "mismatched receipt closeout rejection is bounded",
  );
  assertEqual(closeoutResult.retryControlWorkerInvocationExecutionReceiptCloseout, undefined, "mismatched receipt returns no closeout descriptor");
  assertEqual(closeoutResult.manualRetryWorkItemCloseoutReady, false, "mismatched receipt does not mark closeout ready");
  assertEqual(closeoutResult.retryWorkerCreated, false, "mismatched receipt creates no retry worker");
  assert(!containsForbiddenTruth(closeoutResult), "mismatched receipt closeout rejection leaks no raw truth");
}

async function verifyInvocationExecutionReceiptCloseoutRejectsContaminatedReceipt(): Promise<void> {
  section("3. Invocation Execution Receipt Closeout Rejects Contaminated Receipt");
  const fixture = await invocationExecutionReceiptFixture({ fileRefs: fileRefs("phase193_contaminated") });
  const contaminated = {
    ...fixture.retryControlWorkerInvocationExecutionReceipt,
    retryWorkerCreated: true,
    credentialValue: "xoxb-secret-value",
  };

  const closeoutResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout({
      ...fixture,
      retryControlWorkerInvocationExecutionReceipt: contaminated,
    });

  assertEqual(closeoutResult.accepted, false, "receipt closeout rejects contaminated supplied receipt");
  assertEqual(closeoutResult.reasonCode, "valid_manual_retry_control_worker_invocation_execution_receipt_required", "contaminated receipt rejection is bounded");
  assertEqual(closeoutResult.retryControlWorkerInvocationExecutionReceiptCloseout, undefined, "contaminated receipt returns no closeout descriptor");
  assertEqual(closeoutResult.retryWorkerCreated, false, "contaminated receipt creates no retry worker");
  assertEqual(closeoutResult.automaticVendorRetryAllowed, false, "contaminated receipt enables no automatic retry");
  assert(!containsForbiddenTruth(closeoutResult), "contaminated receipt closeout rejection leaks no raw truth");
}

async function verifyInvocationExecutionReceiptCloseoutRejectsPostTrustExecutionMutation(): Promise<void> {
  section("4. Invocation Execution Receipt Closeout Rejects Post-Trust Execution Mutation");
  const fixture = await invocationExecutionReceiptFixture({ fileRefs: fileRefs("phase193_mutated_execution") });
  const hostResult = fixture.retryControlWorkerInvocationExecution.hostResult as {
    data?: { deliveredCount?: number };
  };
  assertEqual(typeof hostResult.data?.deliveredCount, "number", "fixture exposes bounded host delivered-count truth");
  hostResult.data!.deliveredCount = 1;

  const receiptResult = await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt({
    ...fixture,
    retryControlWorkerInvocationExecution: fixture.retryControlWorkerInvocationExecution,
  });
  assertEqual(receiptResult.accepted, false, "post-trust execution mutation still blocks receipt creation");

  const closeoutResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout({
      ...fixture,
      retryControlWorkerInvocationExecution: fixture.retryControlWorkerInvocationExecution,
      retryControlWorkerInvocationExecutionReceipt: fixture.retryControlWorkerInvocationExecutionReceipt,
    });
  assertEqual(closeoutResult.accepted, false, "post-trust execution mutation blocks receipt closeout");
  assertEqual(
    closeoutResult.reasonCode,
    "manual_retry_control_worker_invocation_execution_current_truth_mismatch",
    "post-trust execution mutation closeout rejection is bounded",
  );
  assertEqual(closeoutResult.retryControlWorkerInvocationExecutionReceiptCloseout, undefined, "mutated execution returns no closeout descriptor");
  assert(!containsForbiddenTruth([receiptResult, closeoutResult]), "post-trust execution mutation closeout rejection leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 193 Verification (External Media Transfer Manual Retry Control Worker Invocation Execution Receipt Closeout)\n");
  await verifyInvocationExecutionReceiptCloseoutAcceptsReceiptPreflight();
  await verifyInvocationExecutionReceiptCloseoutRejectsMismatchedReceipt();
  await verifyInvocationExecutionReceiptCloseoutRejectsContaminatedReceipt();
  await verifyInvocationExecutionReceiptCloseoutRejectsPostTrustExecutionMutation();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 193: external media transfer manual retry control worker invocation execution receipt closeout is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
