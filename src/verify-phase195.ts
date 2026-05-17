/** Phase 195 Verification - External Media Transfer Manual Retry Control Worker Invocation Execution Receipt Closeout Record Plan */

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan,
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

function fileRefs(prefix = "phase195_media", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-195-media-${index}.pdf`,
    title: `Phase 195 media ${index}`,
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

async function verifyInvocationExecutionReceiptCloseoutRecordPlanBindsAcceptedCloseoutPreflight(): Promise<void> {
  section("1. Invocation Execution Receipt Closeout Record Plan Binds Accepted Closeout Preflight");
  const fixture = await closeoutFixture("phase195_accepted");

  const first =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan(fixture);
  const second =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan(fixture);

  const closeout = fixture.retryControlWorkerInvocationExecutionReceiptCloseout;
  assertEqual(first.accepted, true, "closeout record plan is accepted after accepted closeout preflight");
  assert(first.retryControlWorkerInvocationExecutionReceiptCloseoutPreflight.accepted, "record plan recomputes accepted closeout preflight");
  const recordPlan =
    first.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan;
  assert(Boolean(recordPlan), "record plan descriptor is returned");
  assert(
    recordPlan.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlanId.startsWith(
      "manual-retry-control-worker-invocation-execution-receipt-closeout-record-plan:",
    ),
    "record plan id is deterministic and scoped",
  );
  assertEqual(
    second.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlanId,
    recordPlan.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlanId,
    "record plan id is stable for the same accepted closeout preflight",
  );
  assertEqual(recordPlan.retryControlWorkerInvocationExecutionReceiptCloseoutId, closeout.retryControlWorkerInvocationExecutionReceiptCloseoutId, "record plan binds closeout id");
  assertEqual(recordPlan.retryControlWorkerInvocationExecutionReceiptId, closeout.retryControlWorkerInvocationExecutionReceiptId, "record plan binds receipt id");
  assertEqual(recordPlan.retryControlWorkerInvocationHandoffId, closeout.retryControlWorkerInvocationHandoffId, "record plan binds invocation handoff id");
  assertEqual(recordPlan.retryControlWorkerHandlerReadinessId, closeout.retryControlWorkerHandlerReadinessId, "record plan binds handler readiness id");
  assertEqual(recordPlan.retryControlWorkerSelectionId, closeout.retryControlWorkerSelectionId, "record plan binds worker selection id");
  assertEqual(recordPlan.retryControlOperatorHandoffId, closeout.retryControlOperatorHandoffId, "record plan binds operator handoff id");
  assertEqual(recordPlan.manualRetryControlReadinessPlanId, closeout.manualRetryControlReadinessPlanId, "record plan binds retry-control readiness plan id");
  assertEqual(recordPlan.manualRetryLedgerEntryId, closeout.manualRetryLedgerEntryId, "record plan binds retry ledger entry id");
  assertEqual(recordPlan.workItemCorrelationId, closeout.workItemCorrelationId, "record plan binds work-item correlation");
  assertEqual(recordPlan.expectedWorkItemCorrelationId, closeout.expectedWorkItemCorrelationId, "record plan binds expected work-item correlation");
  assertEqual(recordPlan.transferKey, closeout.transferKey, "record plan binds transfer key");
  assertEqual(recordPlan.retryStage, closeout.retryStage, "record plan binds retry stage");
  assertEqual(recordPlan.revalidatedSourceCount, closeout.revalidatedSourceCount, "record plan binds source count");
  assertEqual(recordPlan.vendorStateVerified, closeout.vendorStateVerified, "record plan binds vendor-state truth");
  assertEqual(recordPlan.hostReportedDeliveredCount, closeout.hostReportedDeliveredCount, "record plan binds delivered-count truth");
  assertEqual(recordPlan.hostReceiptMetadataIncluded, closeout.hostReceiptMetadataIncluded, "record plan binds receipt metadata truth");
  assertEqual(recordPlan.durableCloseoutRecordReady, true, "record plan readiness is explicit");
  assertEqual(recordPlan.manualRetryWorkItemClosedByColony, false, "record plan does not close the work item");
  assertEqual(recordPlan.closeoutRecordPersisted, false, "record plan does not persist a closeout record");
  assertEqual(recordPlan.retryControlWorkerInvocationExecutionReceiptPersisted, false, "record plan persists no execution receipt");
  assertEqual(recordPlan.retryLedgerEntryAlreadyPersisted, true, "record plan preserves existing retry-ledger truth");
  assertEqual(recordPlan.durableRetryAuditRecordAlreadyPersisted, true, "record plan preserves existing durable-audit truth");
  assertEqual(recordPlan.retryLedgerCreatedByRecordPlan, false, "record plan creates no retry ledger");
  assertEqual(recordPlan.durableRetryAuditRecordCreatedByRecordPlan, false, "record plan creates no durable audit record");
  assertEqual(recordPlan.retryWorkerCreated, false, "record plan creates no retry worker");
  assertEqual(recordPlan.retryScheduleCreated, false, "record plan creates no retry schedule");
  assertEqual(recordPlan.automaticVendorRetryAllowed, false, "record plan enables no automatic vendor retry");
  assertEqual(recordPlan.defaultLiveDeliveryEnabled, false, "record plan keeps default live delivery blocked");
  assertEqual(recordPlan.publicHostingEnabled, false, "record plan keeps public hosting blocked");
  assertEqual(
    recordPlan.manualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlanTruth,
    "closeout_preflight_bound_manual_retry_control_worker_invocation_execution_receipt_closeout_record_plan_no_persistence",
    "record plan truth is explicit",
  );
  assert(!containsForbiddenTruth([first, second]), "accepted closeout record plan leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyInvocationExecutionReceiptCloseoutRecordPlanRejectsMismatchedCloseout(): Promise<void> {
  section("2. Invocation Execution Receipt Closeout Record Plan Rejects Mismatched Closeout");
  const fixture = await closeoutFixture("phase195_mismatch");
  const tampered: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout = {
    ...fixture.retryControlWorkerInvocationExecutionReceiptCloseout,
    hostReportedDeliveredCount:
      fixture.retryControlWorkerInvocationExecutionReceiptCloseout.hostReportedDeliveredCount + 1,
  };

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseout: tampered,
    });

  assertEqual(result.accepted, false, "mismatched closeout blocks record plan");
  assertEqual(
    result.reasonCode,
    "manual_retry_control_worker_invocation_execution_receipt_closeout_current_truth_mismatch",
    "mismatched closeout rejection is bounded",
  );
  assertEqual(result.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan, undefined, "rejected record plan returns no descriptor");
  assertEqual(result.durableCloseoutRecordReady, false, "rejected record plan is not durable-record ready");
  assertEqual(result.closeoutRecordPersisted, false, "rejected record plan persists nothing");
  assertEqual(result.retryWorkerCreated, false, "rejected record plan creates no retry worker");
  assert(!containsForbiddenTruth(result), "mismatched closeout record plan rejection leaks no raw truth");
}

async function verifyInvocationExecutionReceiptCloseoutRecordPlanRejectsContaminatedCloseout(): Promise<void> {
  section("3. Invocation Execution Receipt Closeout Record Plan Rejects Contaminated Closeout");
  const fixture = await closeoutFixture("phase195_contaminated");
  assertEqual(
    fixture.retryControlWorkerInvocationExecutionReceiptCloseout.sourceRefsTruncated,
    false,
    "fixture closeout carries explicit untruncated source-ref truth",
  );
  const missingSourceTruth = {
    ...fixture.retryControlWorkerInvocationExecutionReceiptCloseout,
  } as Record<string, unknown>;
  delete missingSourceTruth.sourceRefsTruncated;

  const missingSourceTruthResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseout: missingSourceTruth,
    });

  assertEqual(missingSourceTruthResult.accepted, false, "missing source truncation truth blocks record plan");
  assertEqual(
    missingSourceTruthResult.reasonCode,
    "valid_manual_retry_control_worker_invocation_execution_receipt_closeout_required",
    "missing source truncation truth rejection is bounded",
  );
  assertEqual(
    missingSourceTruthResult.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan,
    undefined,
    "missing source truncation truth returns no record plan",
  );

  const contaminated = {
    ...fixture.retryControlWorkerInvocationExecutionReceiptCloseout,
    retryWorkerCreated: true,
    credentialValue: "xoxb-secret-value",
  };

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseout: contaminated,
    });

  assertEqual(result.accepted, false, "contaminated closeout blocks record plan");
  assertEqual(result.reasonCode, "valid_manual_retry_control_worker_invocation_execution_receipt_closeout_required", "contaminated closeout rejection is bounded");
  assertEqual(result.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan, undefined, "contaminated closeout returns no record plan");
  assertEqual(result.retryWorkerCreated, false, "contaminated closeout does not create a retry worker");
  assert(!containsForbiddenTruth(result), "contaminated closeout record plan rejection leaks no raw truth");
}

async function verifyInvocationExecutionReceiptCloseoutRecordPlanRejectsPostTrustExecutionMutation(): Promise<void> {
  section("4. Invocation Execution Receipt Closeout Record Plan Rejects Post-Trust Execution Mutation");
  const fixture = await closeoutFixture("phase195_mutated_execution");
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

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan({
      ...fixture,
      retryControlWorkerInvocationExecution: fixture.retryControlWorkerInvocationExecution,
      retryControlWorkerInvocationExecutionReceipt: fixture.retryControlWorkerInvocationExecutionReceipt,
      retryControlWorkerInvocationExecutionReceiptCloseout:
        fixture.retryControlWorkerInvocationExecutionReceiptCloseout,
    });
  assertEqual(result.accepted, false, "post-trust execution mutation blocks record plan");
  assertEqual(
    result.reasonCode,
    "manual_retry_control_worker_invocation_execution_current_truth_mismatch",
    "post-trust execution mutation record-plan rejection is bounded",
  );
  assertEqual(result.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan, undefined, "mutated execution returns no trusted record plan");
  assert(!containsForbiddenTruth([receiptResult, result]), "post-trust execution mutation record-plan rejection leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 195 Verification (External Media Transfer Manual Retry Control Worker Invocation Execution Receipt Closeout Record Plan)\n");
  await verifyInvocationExecutionReceiptCloseoutRecordPlanBindsAcceptedCloseoutPreflight();
  await verifyInvocationExecutionReceiptCloseoutRecordPlanRejectsMismatchedCloseout();
  await verifyInvocationExecutionReceiptCloseoutRecordPlanRejectsContaminatedCloseout();
  await verifyInvocationExecutionReceiptCloseoutRecordPlanRejectsPostTrustExecutionMutation();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 195: external media transfer manual retry control worker invocation execution receipt closeout record plan is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
