/** Phase 196 Verification - External Media Transfer Manual Retry Control Worker Invocation Execution Receipt Closeout Record Plan Preflight */

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan,
  type ExternalChannelMediaTransferCandidate,
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

function fileRefs(prefix = "phase196_media", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-196-media-${index}.pdf`,
    title: `Phase 196 media ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 4096 + index,
    checksumSha256: `${(index + 1).toString(16)}`.repeat(64),
  }));
}

async function recordPlanFixture(prefix: string) {
  const fixture = await invocationExecutionReceiptFixture({ fileRefs: fileRefs(prefix) });
  const closeoutResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout(fixture);
  assertEqual(closeoutResult.accepted, true, "fixture retry-control worker invocation execution receipt closeout is accepted");
  assert(Boolean(closeoutResult.retryControlWorkerInvocationExecutionReceiptCloseout), "fixture receipt closeout descriptor is returned");
  const withCloseout = {
    ...fixture,
    retryControlWorkerInvocationExecutionReceiptCloseout:
      closeoutResult.retryControlWorkerInvocationExecutionReceiptCloseout!,
  };
  const recordPlanResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan(
      withCloseout,
    );
  assertEqual(recordPlanResult.accepted, true, "fixture closeout record plan is accepted");
  assert(Boolean(recordPlanResult.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan), "fixture closeout record plan descriptor is returned");
  return {
    ...withCloseout,
    retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan:
      recordPlanResult.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan!,
  };
}

async function verifyCloseoutRecordPlanPreflightAcceptsCurrentRecordPlan(): Promise<void> {
  section("1. Invocation Execution Receipt Closeout Record Plan Preflight Accepts Current Record Plan");
  const fixture = await recordPlanFixture("phase196_accepted");
  const result =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan(
      fixture,
    );
  const recordPlan = fixture.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan;

  assertEqual(result.accepted, true, "record-plan preflight accepts a current supplied plan");
  assert(result.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlanResult.accepted, "preflight recomputes accepted record-plan truth");
  assertEqual(
    result.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlanId,
    recordPlan.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlanId,
    "preflight reports supplied record-plan id",
  );
  assertEqual(result.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlanIdMatched, true, "record-plan id matches");
  assertEqual(result.retryControlWorkerInvocationExecutionReceiptCloseoutIdMatched, true, "closeout id matches");
  assertEqual(result.retryControlWorkerInvocationExecutionReceiptIdMatched, true, "receipt id matches");
  assertEqual(result.retryControlWorkerInvocationHandoffIdMatched, true, "invocation handoff id matches");
  assertEqual(result.retryControlWorkerHandlerReadinessIdMatched, true, "handler readiness id matches");
  assertEqual(result.retryControlWorkerSelectionIdMatched, true, "worker selection id matches");
  assertEqual(result.retryControlOperatorHandoffIdMatched, true, "operator handoff id matches");
  assertEqual(result.manualRetryControlReadinessPlanIdMatched, true, "retry-control readiness plan id matches");
  assertEqual(result.manualRetryLedgerEntryIdMatched, true, "retry-ledger entry id matches");
  assertEqual(result.channelIdMatched, true, "channel id matches");
  assertEqual(result.targetKindMatched, true, "target kind matches");
  assertEqual(result.retryStageMatched, true, "retry stage matches");
  assertEqual(result.workItemCorrelationMatched, true, "work-item correlation matches");
  assertEqual(result.transferKeyMatched, true, "transfer key matches");
  assertEqual(result.sourceRefsTruncatedMatched, true, "source truncation truth matches");
  assertEqual(result.sourceRefFingerprintsMatched, true, "source fingerprints match");
  assertEqual(result.targetCorrelationMatched, true, "target correlation matches");
  assertEqual(result.revalidatedSourceCountMatched, true, "source count matches");
  assertEqual(result.vendorStateVerifiedMatched, true, "vendor-state truth matches");
  assertEqual(result.hostReportedDeliveredCountMatched, true, "delivered-count truth matches");
  assertEqual(result.hostReceiptMetadataIncludedMatched, true, "receipt metadata truth matches");
  assertEqual(result.durableCloseoutRecordReady, true, "durable closeout record readiness is preserved");
  assertEqual(result.closeoutRecordPersistenceStillBlocked, true, "closeout record persistence remains blocked");
  assertEqual(result.executionReceiptPersistenceStillBlocked, true, "execution receipt persistence remains blocked");
  assertEqual(result.retryLedgerStillBlocked, true, "new retry ledger creation remains blocked");
  assertEqual(result.durableRetryAuditStillBlocked, true, "new durable audit creation remains blocked");
  assertEqual(result.retryWorkerStillBlocked, true, "retry worker remains blocked");
  assertEqual(result.automaticVendorRetryStillBlocked, true, "automatic vendor retry remains blocked");
  assertEqual(result.defaultLiveDeliveryStillBlocked, true, "default live delivery remains blocked");
  assertEqual(result.publicHostingStillBlocked, true, "public hosting remains blocked");
  assertEqual(
    result.manualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlanPreflightTruth,
    "recomputed_from_closeout_record_plan_and_supplied_record_plan_no_persistence",
    "record-plan preflight truth is explicit",
  );
  assert(!containsForbiddenTruth(result), "accepted record-plan preflight leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyCloseoutRecordPlanPreflightRejectsMismatchedRecordPlan(): Promise<void> {
  section("2. Invocation Execution Receipt Closeout Record Plan Preflight Rejects Mismatched Record Plan");
  const fixture = await recordPlanFixture("phase196_mismatch");
  const mismatched: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan = {
    ...fixture.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan,
    hostReportedDeliveredCount:
      fixture.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan.hostReportedDeliveredCount + 1,
  };

  const result =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan: mismatched,
    });

  assertEqual(result.accepted, false, "mismatched record plan is rejected");
  assertEqual(
    result.reasonCode,
    "manual_retry_control_worker_invocation_execution_receipt_closeout_record_plan_current_truth_mismatch",
    "mismatched record-plan rejection is bounded",
  );
  assertEqual(result.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan, undefined, "mismatched record plan returns no trusted plan");
  assertEqual(result.hostReportedDeliveredCountMatched, false, "mismatched delivered count is reported safely");
  assertEqual(result.retryWorkerStillBlocked, true, "mismatched clean record plan still proves retry worker remains blocked");
  assert(!containsForbiddenTruth(result), "mismatched record-plan preflight rejection leaks no raw truth");
}

async function verifyCloseoutRecordPlanPreflightRejectsContaminatedRecordPlan(): Promise<void> {
  section("3. Invocation Execution Receipt Closeout Record Plan Preflight Rejects Contaminated Record Plan");
  const fixture = await recordPlanFixture("phase196_contaminated");
  const contaminated = {
    ...fixture.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan,
    retryWorkerCreated: true,
    credentialValue: "xoxb-secret-value",
  };

  const result =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan: contaminated,
    });

  assertEqual(result.accepted, false, "contaminated record plan is rejected");
  assertEqual(
    result.reasonCode,
    "valid_manual_retry_control_worker_invocation_execution_receipt_closeout_record_plan_required",
    "contaminated record-plan rejection is bounded",
  );
  assertEqual(result.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan, undefined, "contaminated record plan returns no trusted plan");
  assertEqual(result.retryWorkerStillBlocked, false, "contaminated record plan exposes no trusted worker-blocked claim");
  assert(!containsForbiddenTruth(result), "contaminated record-plan preflight rejection leaks no raw truth");
}

async function verifyCloseoutRecordPlanPreflightRejectsPostTrustExecutionMutation(): Promise<void> {
  section("4. Invocation Execution Receipt Closeout Record Plan Preflight Rejects Post-Trust Execution Mutation");
  const fixture = await recordPlanFixture("phase196_mutated_execution");
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
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan({
      ...fixture,
      retryControlWorkerInvocationExecution: fixture.retryControlWorkerInvocationExecution,
      retryControlWorkerInvocationExecutionReceipt: fixture.retryControlWorkerInvocationExecutionReceipt,
      retryControlWorkerInvocationExecutionReceiptCloseout:
        fixture.retryControlWorkerInvocationExecutionReceiptCloseout,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan:
        fixture.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan,
    });
  assertEqual(result.accepted, false, "post-trust execution mutation blocks record-plan preflight");
  assertEqual(
    result.reasonCode,
    "manual_retry_control_worker_invocation_execution_current_truth_mismatch",
    "post-trust execution mutation record-plan preflight rejection is bounded",
  );
  assertEqual(result.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan, undefined, "mutated execution returns no trusted record plan");
  assert(!containsForbiddenTruth([receiptResult, result]), "post-trust execution mutation record-plan preflight rejection leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 196 Verification (External Media Transfer Manual Retry Control Worker Invocation Execution Receipt Closeout Record Plan Preflight)\n");
  await verifyCloseoutRecordPlanPreflightAcceptsCurrentRecordPlan();
  await verifyCloseoutRecordPlanPreflightRejectsMismatchedRecordPlan();
  await verifyCloseoutRecordPlanPreflightRejectsContaminatedRecordPlan();
  await verifyCloseoutRecordPlanPreflightRejectsPostTrustExecutionMutation();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 196: external media transfer manual retry control worker invocation execution receipt closeout record plan preflight is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
