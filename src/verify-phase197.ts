/** Phase 197 Verification - External Media Transfer Manual Retry Control Worker Invocation Execution Receipt Closeout Record Draft */

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceipt,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan,
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

function fileRefs(prefix = "phase197_media", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-197-media-${index}.pdf`,
    title: `Phase 197 media ${index}`,
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

async function verifyCloseoutRecordDraftBindsAcceptedRecordPlanPreflight(): Promise<void> {
  section("1. Invocation Execution Receipt Closeout Record Draft Binds Accepted Record Plan Preflight");
  const fixture = await recordPlanFixture("phase197_accepted");
  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord(
      fixture,
    );
  const recordPlan = fixture.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan;
  const record = result.retryControlWorkerInvocationExecutionReceiptCloseoutRecord;

  assertEqual(result.accepted, true, "closeout record draft is accepted after accepted record-plan preflight");
  assert(result.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlanPreflight.accepted, "record draft recomputes accepted record-plan preflight");
  assert(Boolean(record), "closeout record draft is returned");
  assertEqual(
    record?.closeoutRecordKind,
    "external_media_transfer_manual_retry_control_worker_invocation_execution_receipt_closeout_record_draft",
    "record draft kind is explicit",
  );
  assertEqual(record?.closeoutRecordVersion, 1, "record draft version is explicit");
  assertEqual(
    record?.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlanId,
    recordPlan.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlanId,
    "record draft binds record-plan id",
  );
  assertEqual(record?.retryControlWorkerInvocationExecutionReceiptCloseoutId, recordPlan.retryControlWorkerInvocationExecutionReceiptCloseoutId, "record draft binds closeout id");
  assertEqual(record?.retryControlWorkerInvocationExecutionReceiptId, recordPlan.retryControlWorkerInvocationExecutionReceiptId, "record draft binds receipt id");
  assertEqual(record?.retryControlWorkerInvocationHandoffId, recordPlan.retryControlWorkerInvocationHandoffId, "record draft binds invocation handoff id");
  assertEqual(record?.retryControlWorkerHandlerReadinessId, recordPlan.retryControlWorkerHandlerReadinessId, "record draft binds handler readiness id");
  assertEqual(record?.retryControlWorkerSelectionId, recordPlan.retryControlWorkerSelectionId, "record draft binds worker selection id");
  assertEqual(record?.retryControlOperatorHandoffId, recordPlan.retryControlOperatorHandoffId, "record draft binds operator handoff id");
  assertEqual(record?.manualRetryControlReadinessPlanId, recordPlan.manualRetryControlReadinessPlanId, "record draft binds retry-control readiness plan id");
  assertEqual(record?.manualRetryLedgerEntryId, recordPlan.manualRetryLedgerEntryId, "record draft binds retry-ledger entry id");
  assertEqual(record?.channelId, recordPlan.channelId, "record draft binds channel id");
  assertEqual(record?.targetKind, recordPlan.targetKind, "record draft binds target kind");
  assertEqual(record?.retryStage, recordPlan.retryStage, "record draft binds retry stage");
  assertEqual(record?.workItemCorrelationId, recordPlan.workItemCorrelationId, "record draft binds work-item correlation");
  assertEqual(record?.expectedWorkItemCorrelationId, recordPlan.expectedWorkItemCorrelationId, "record draft binds expected work-item correlation");
  assertEqual(record?.transferKey, recordPlan.transferKey, "record draft binds transfer key");
  assertEqual(record?.sourceRefsTruncated, recordPlan.sourceRefsTruncated, "record draft preserves source truncation truth");
  assertEqual(record?.sourceRefFingerprints.length, recordPlan.sourceRefFingerprints.length, "record draft preserves source fingerprint count");
  assertEqual(record?.targetCorrelationFingerprint, recordPlan.targetCorrelationFingerprint, "record draft binds target correlation");
  assertEqual(record?.revalidatedSourceCount, recordPlan.revalidatedSourceCount, "record draft binds source count");
  assertEqual(record?.vendorStateVerified, recordPlan.vendorStateVerified, "record draft binds vendor-state truth");
  assertEqual(record?.hostReportedDeliveredCount, recordPlan.hostReportedDeliveredCount, "record draft binds delivered-count truth");
  assertEqual(record?.hostReceiptMetadataIncluded, recordPlan.hostReceiptMetadataIncluded, "record draft binds receipt metadata truth");
  assertEqual(record?.recordPlanPreflightAccepted, true, "record draft records accepted preflight");
  assertEqual(record?.durableCloseoutRecordReady, true, "record draft is durable closeout record ready");
  assertEqual(record?.manualRetryWorkItemClosedByColony, false, "record draft does not close work item");
  assertEqual(record?.closeoutRecordPersisted, false, "record draft is not persisted");
  assertEqual(record?.retryControlWorkerInvocationExecutionReceiptPersisted, false, "record draft persists no execution receipt");
  assertEqual(record?.retryLedgerEntryAlreadyPersisted, true, "record draft preserves existing retry-ledger truth");
  assertEqual(record?.durableRetryAuditRecordAlreadyPersisted, true, "record draft preserves existing durable-audit truth");
  assertEqual(record?.retryLedgerCreatedByRecordDraft, false, "record draft creates no retry ledger");
  assertEqual(record?.durableRetryAuditRecordCreatedByRecordDraft, false, "record draft creates no durable audit");
  assertEqual(record?.retryWorkerCreated, false, "record draft creates no retry worker");
  assertEqual(record?.retryScheduleCreated, false, "record draft creates no retry schedule");
  assertEqual(record?.automaticVendorRetryAllowed, false, "record draft enables no automatic vendor retry");
  assertEqual(record?.defaultLiveDeliveryEnabled, false, "record draft keeps default live delivery blocked");
  assertEqual(record?.publicHostingEnabled, false, "record draft keeps public hosting blocked");
  assertEqual(
    record?.manualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordTruth,
    "record_plan_preflight_bound_manual_retry_control_worker_invocation_execution_receipt_closeout_record_draft_no_persistence",
    "record draft truth is explicit",
  );
  assertEqual(result.recordPlanPreflightAccepted, true, "result records preflight acceptance");
  assertEqual(result.closeoutRecordPersisted, false, "result persists no closeout record");
  assertEqual(result.retryWorkerCreated, false, "result creates no retry worker");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "result keeps default live delivery blocked");
  assert(!containsForbiddenTruth(result), "accepted closeout record draft leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyCloseoutRecordDraftIsDeterministic(): Promise<void> {
  section("2. Invocation Execution Receipt Closeout Record Draft Is Deterministic");
  const fixture = await recordPlanFixture("phase197_deterministic");
  const first =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord(
      fixture,
    );
  const second =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord(
      fixture,
    );
  assertEqual(first.accepted, true, "first record draft is accepted");
  assertEqual(second.accepted, true, "second record draft is accepted");
  assertEqual(
    first.retryControlWorkerInvocationExecutionReceiptCloseoutRecordId,
    second.retryControlWorkerInvocationExecutionReceiptCloseoutRecordId,
    "record draft id is stable for the same accepted record-plan preflight",
  );
}

async function verifyCloseoutRecordDraftRejectsMismatchedRecordPlan(): Promise<void> {
  section("3. Invocation Execution Receipt Closeout Record Draft Rejects Mismatched Record Plan");
  const fixture = await recordPlanFixture("phase197_mismatch");
  const mismatched: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan = {
    ...fixture.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan,
    hostReportedDeliveredCount:
      fixture.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan.hostReportedDeliveredCount + 1,
  };

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan: mismatched,
    });

  assertEqual(result.accepted, false, "mismatched record plan blocks record draft");
  assertEqual(
    result.reasonCode,
    "manual_retry_control_worker_invocation_execution_receipt_closeout_record_plan_current_truth_mismatch",
    "mismatched record-plan rejection is bounded",
  );
  assertEqual(result.retryControlWorkerInvocationExecutionReceiptCloseoutRecord, undefined, "mismatched record plan returns no record draft");
  assertEqual(result.recordPlanPreflightAccepted, false, "mismatched record plan leaves preflight unaccepted");
  assertEqual(result.closeoutRecordPersisted, false, "mismatched record plan persists no closeout record");
  assertEqual(result.retryWorkerCreated, false, "mismatched record plan creates no retry worker");
  assert(!containsForbiddenTruth(result), "mismatched record draft rejection leaks no raw truth");
}

async function verifyCloseoutRecordDraftRejectsContaminatedRecordPlan(): Promise<void> {
  section("4. Invocation Execution Receipt Closeout Record Draft Rejects Contaminated Record Plan");
  const fixture = await recordPlanFixture("phase197_contaminated");
  const contaminated = {
    ...fixture.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan,
    retryScheduleCreated: true,
    credentialValue: "xoxb-secret-value",
  };

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan: contaminated,
    });

  assertEqual(result.accepted, false, "contaminated record plan blocks record draft");
  assertEqual(
    result.reasonCode,
    "valid_manual_retry_control_worker_invocation_execution_receipt_closeout_record_plan_required",
    "contaminated record-plan rejection is bounded",
  );
  assertEqual(result.retryControlWorkerInvocationExecutionReceiptCloseoutRecord, undefined, "contaminated record plan returns no record draft");
  assertEqual(result.retryWorkerCreated, false, "contaminated record plan creates no retry worker");
  assert(!containsForbiddenTruth(result), "contaminated record draft rejection leaks no raw truth");
}

async function verifyCloseoutRecordDraftRejectsPostTrustExecutionMutation(): Promise<void> {
  section("5. Invocation Execution Receipt Closeout Record Draft Rejects Post-Trust Execution Mutation");
  const fixture = await recordPlanFixture("phase197_mutated_execution");
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
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord({
      ...fixture,
      retryControlWorkerInvocationExecution: fixture.retryControlWorkerInvocationExecution,
      retryControlWorkerInvocationExecutionReceipt: fixture.retryControlWorkerInvocationExecutionReceipt,
      retryControlWorkerInvocationExecutionReceiptCloseout:
        fixture.retryControlWorkerInvocationExecutionReceiptCloseout,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan:
        fixture.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan,
    });

  assertEqual(result.accepted, false, "post-trust execution mutation blocks record draft");
  assertEqual(
    result.reasonCode,
    "manual_retry_control_worker_invocation_execution_current_truth_mismatch",
    "post-trust execution mutation record draft rejection is bounded",
  );
  assertEqual(result.retryControlWorkerInvocationExecutionReceiptCloseoutRecord, undefined, "mutated execution returns no record draft");
  assert(!containsForbiddenTruth([receiptResult, result]), "post-trust execution mutation record draft rejection leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 197 Verification (External Media Transfer Manual Retry Control Worker Invocation Execution Receipt Closeout Record Draft)\n");
  await verifyCloseoutRecordDraftBindsAcceptedRecordPlanPreflight();
  await verifyCloseoutRecordDraftIsDeterministic();
  await verifyCloseoutRecordDraftRejectsMismatchedRecordPlan();
  await verifyCloseoutRecordDraftRejectsContaminatedRecordPlan();
  await verifyCloseoutRecordDraftRejectsPostTrustExecutionMutation();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 197: external media transfer manual retry control worker invocation execution receipt closeout record draft is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
