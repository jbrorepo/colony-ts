/** Phase 194 Verification - External Media Transfer Manual Retry Control Worker Invocation Execution Receipt Closeout Preflight */

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout,
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

function fileRefs(prefix = "phase194_media", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-194-media-${index}.pdf`,
    title: `Phase 194 media ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 4096 + index,
    checksumSha256: `${(index + 1).toString(16)}`.repeat(64),
  }));
}

async function closeoutFixture(prefix: string) {
  const fixture = await invocationExecutionReceiptFixture({ fileRefs: fileRefs(prefix) });
  const closeoutResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout(fixture);
  assertEqual(closeoutResult.accepted, true, "fixture retry-control worker invocation execution receipt closeout is accepted");
  assert(Boolean(closeoutResult.retryControlWorkerInvocationExecutionReceiptCloseout), "fixture receipt closeout descriptor is returned");
  return {
    ...fixture,
    retryControlWorkerInvocationExecutionReceiptCloseout:
      closeoutResult.retryControlWorkerInvocationExecutionReceiptCloseout!,
  };
}

async function verifyInvocationExecutionReceiptCloseoutPreflightAcceptsCurrentCloseout(): Promise<void> {
  section("1. Invocation Execution Receipt Closeout Preflight Accepts Current Closeout");
  const fixture = await closeoutFixture("phase194_accepted");

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout(fixture);

  const closeout = fixture.retryControlWorkerInvocationExecutionReceiptCloseout;
  assertEqual(preflight.accepted, true, "receipt closeout preflight accepts a supplied current closeout");
  assertEqual(preflight.retryControlWorkerInvocationExecutionReceiptCloseoutIdMatched, true, "closeout id matches recomputed truth");
  assertEqual(preflight.retryControlWorkerInvocationExecutionReceiptIdMatched, true, "receipt id matches recomputed truth");
  assertEqual(preflight.retryControlWorkerInvocationHandoffIdMatched, true, "handoff id matches recomputed truth");
  assertEqual(preflight.retryControlWorkerHandlerReadinessIdMatched, true, "handler readiness id matches recomputed truth");
  assertEqual(preflight.retryControlWorkerSelectionIdMatched, true, "selection id matches recomputed truth");
  assertEqual(preflight.retryControlOperatorHandoffIdMatched, true, "operator handoff id matches recomputed truth");
  assertEqual(preflight.manualRetryControlReadinessPlanIdMatched, true, "readiness plan id matches recomputed truth");
  assertEqual(preflight.manualRetryLedgerEntryIdMatched, true, "ledger entry id matches recomputed truth");
  assertEqual(preflight.channelIdMatched, true, "channel id matches recomputed truth");
  assertEqual(preflight.targetKindMatched, true, "target kind matches recomputed truth");
  assertEqual(preflight.retryStageMatched, true, "retry stage matches recomputed truth");
  assertEqual(preflight.workItemCorrelationMatched, true, "work-item correlation matches recomputed truth");
  assertEqual(preflight.transferKeyMatched, true, "transfer key matches recomputed truth");
  assertEqual(preflight.sourceRefFingerprintsMatched, true, "source fingerprints match recomputed truth");
  assertEqual(preflight.targetCorrelationMatched, true, "target correlation matches recomputed truth");
  assertEqual(preflight.revalidatedSourceCountMatched, true, "source count matches recomputed truth");
  assertEqual(preflight.vendorStateVerifiedMatched, true, "vendor-state truth matches recomputed truth");
  assertEqual(preflight.hostReportedDeliveredCountMatched, true, "host delivered count matches recomputed truth");
  assertEqual(preflight.hostReceiptMetadataIncludedMatched, true, "receipt metadata truth matches recomputed truth");
  assertEqual(preflight.manualRetryWorkItemCloseoutReadyMatched, true, "manual retry work-item closeout readiness matches");
  assertEqual(preflight.manualRetryWorkItemStillOpen, true, "closeout preflight does not close the work item");
  assertEqual(preflight.executionReceiptStillNotPersisted, true, "closeout preflight persists no execution receipt");
  assertEqual(preflight.retryLedgerAlreadyPersisted, true, "closeout preflight preserves existing retry-ledger truth");
  assertEqual(preflight.durableRetryAuditRecordAlreadyPersisted, true, "closeout preflight preserves existing audit-record truth");
  assertEqual(preflight.retryLedgerStillNotCreatedByCloseout, true, "closeout preflight creates no retry ledger");
  assertEqual(preflight.durableRetryAuditRecordStillNotCreatedByCloseout, true, "closeout preflight creates no durable audit record");
  assertEqual(preflight.retryWorkerStillBlocked, true, "closeout preflight creates no retry worker or schedule");
  assertEqual(preflight.automaticVendorRetryStillBlocked, true, "closeout preflight enables no automatic vendor retry");
  assertEqual(preflight.defaultLiveDeliveryStillBlocked, true, "closeout preflight enables no default live delivery");
  assertEqual(preflight.publicHostingStillBlocked, true, "closeout preflight enables no public hosting");
  assertEqual(
    preflight.retryControlWorkerInvocationExecutionReceiptCloseout?.retryControlWorkerInvocationExecutionReceiptCloseoutId,
    closeout.retryControlWorkerInvocationExecutionReceiptCloseoutId,
    "accepted closeout preflight returns the recomputed closeout descriptor",
  );
  assertEqual(
    preflight.manualRetryControlWorkerInvocationExecutionReceiptCloseoutPreflightTruth,
    "recomputed_from_receipt_preflight_bound_manual_retry_control_worker_invocation_closeout_and_supplied_closeout_no_persistence",
    "closeout preflight truth states supplied closeout recomputation with no persistence",
  );
  assert(!containsForbiddenTruth(preflight), "accepted receipt closeout preflight leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyInvocationExecutionReceiptCloseoutPreflightRejectsMismatchedCloseout(): Promise<void> {
  section("2. Invocation Execution Receipt Closeout Preflight Rejects Mismatched Closeout");
  const fixture = await closeoutFixture("phase194_mismatch");
  const tampered: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout = {
    ...fixture.retryControlWorkerInvocationExecutionReceiptCloseout,
    hostReportedDeliveredCount:
      fixture.retryControlWorkerInvocationExecutionReceiptCloseout.hostReportedDeliveredCount + 1,
  };

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseout: tampered,
    });

  assertEqual(preflight.accepted, false, "receipt closeout preflight rejects mismatched supplied closeout");
  assertEqual(
    preflight.reasonCode,
    "manual_retry_control_worker_invocation_execution_receipt_closeout_current_truth_mismatch",
    "mismatched closeout rejection is bounded",
  );
  assertEqual(preflight.retryControlWorkerInvocationExecutionReceiptCloseout, undefined, "mismatched closeout returns no trusted descriptor");
  assertEqual(preflight.hostReportedDeliveredCountMatched, false, "mismatched delivered count is reported without raw target data");
  assertEqual(preflight.retryWorkerStillBlocked, true, "mismatched clean closeout still proves retry worker remains blocked");
  assert(!containsForbiddenTruth(preflight), "mismatched receipt closeout preflight leaks no raw truth");
}

async function verifyInvocationExecutionReceiptCloseoutPreflightRejectsContaminatedCloseout(): Promise<void> {
  section("3. Invocation Execution Receipt Closeout Preflight Rejects Contaminated Closeout");
  const fixture = await closeoutFixture("phase194_contaminated");
  const contaminated = {
    ...fixture.retryControlWorkerInvocationExecutionReceiptCloseout,
    retryWorkerCreated: true,
    credentialValue: "xoxb-secret-value",
  };

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseout: contaminated,
    });

  assertEqual(preflight.accepted, false, "receipt closeout preflight rejects contaminated supplied closeout");
  assertEqual(preflight.reasonCode, "valid_manual_retry_control_worker_invocation_execution_receipt_closeout_required", "contaminated closeout rejection is bounded");
  assertEqual(preflight.retryControlWorkerInvocationExecutionReceiptCloseout, undefined, "contaminated closeout returns no trusted descriptor");
  assertEqual(preflight.retryWorkerStillBlocked, false, "rejected contaminated closeout exposes no trusted worker-blocked claim");
  assert(!containsForbiddenTruth(preflight), "contaminated receipt closeout preflight leaks no raw truth");
}

async function verifyInvocationExecutionReceiptCloseoutPreflightRejectsPostTrustExecutionMutation(): Promise<void> {
  section("4. Invocation Execution Receipt Closeout Preflight Rejects Post-Trust Execution Mutation");
  const fixture = await closeoutFixture("phase194_mutated_execution");
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

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout({
      ...fixture,
      retryControlWorkerInvocationExecution: fixture.retryControlWorkerInvocationExecution,
      retryControlWorkerInvocationExecutionReceipt: fixture.retryControlWorkerInvocationExecutionReceipt,
      retryControlWorkerInvocationExecutionReceiptCloseout:
        fixture.retryControlWorkerInvocationExecutionReceiptCloseout,
    });
  assertEqual(preflight.accepted, false, "post-trust execution mutation blocks supplied receipt closeout preflight");
  assertEqual(
    preflight.reasonCode,
    "manual_retry_control_worker_invocation_execution_current_truth_mismatch",
    "post-trust execution mutation closeout preflight rejection is bounded",
  );
  assertEqual(preflight.retryControlWorkerInvocationExecutionReceiptCloseout, undefined, "mutated execution returns no trusted closeout descriptor");
  assert(!containsForbiddenTruth([receiptResult, preflight]), "post-trust execution mutation closeout preflight rejection leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 194 Verification (External Media Transfer Manual Retry Control Worker Invocation Execution Receipt Closeout Preflight)\n");
  await verifyInvocationExecutionReceiptCloseoutPreflightAcceptsCurrentCloseout();
  await verifyInvocationExecutionReceiptCloseoutPreflightRejectsMismatchedCloseout();
  await verifyInvocationExecutionReceiptCloseoutPreflightRejectsContaminatedCloseout();
  await verifyInvocationExecutionReceiptCloseoutPreflightRejectsPostTrustExecutionMutation();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 194: external media transfer manual retry control worker invocation execution receipt closeout preflight is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
