/** Phase 200 Verification - Retry-Control Closeout Preflight-Bound Work-Item Closure */

import { mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import {
  closeExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemFromCloseoutRecordPersistencePreflight,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan,
  JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordStore,
  persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistence,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistenceStore,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosure,
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
  assert(
    actual === expected,
    `${label}${actual === expected ? "" : ` - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`,
  );
}
function section(title: string): void {
  console.log(`\n${"=".repeat(60)}\n  ${title}\n${"=".repeat(60)}`);
}

function fileRefs(prefix = "phase200_media", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-200-media-${index}.pdf`,
    title: `Phase 200 media ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 8192 + index,
    checksumSha256: `${(index + 6).toString(16)}`.repeat(64),
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

async function createCloseoutRecordStore(): Promise<JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordStore> {
  return new JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordStore({
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase200-work-item-closure-")),
  });
}

async function persistedRecordFixture(prefix: string) {
  const fixture = await recordPlanFixture(prefix);
  const store = await createCloseoutRecordStore();
  const persisted =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord({
      ...fixture,
      closeoutRecordStore: store,
      persistedAt: "2026-05-09T04:51:34.000Z",
      persistedBy: "operator",
    });
  assertEqual(persisted.accepted, true, "fixture closeout record is persisted");
  assert(Boolean(persisted.retryControlWorkerInvocationExecutionReceiptCloseoutRecord), "fixture persisted closeout record is returned");
  return {
    fixture,
    persistedRecord:
      persisted.retryControlWorkerInvocationExecutionReceiptCloseoutRecord as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistence,
  };
}

async function verifyTrustedPreflightBoundWorkItemClosure(): Promise<void> {
  section("1. Trusted Retry-Control Closeout Record Preflight Can Close Work Item Without Persistence");
  const { fixture, persistedRecord } = await persistedRecordFixture("phase200_trusted");

  const closureResult =
    await closeExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemFromCloseoutRecordPersistencePreflight({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      closedAt: "2026-05-09T04:51:34.000Z",
      closedBy: "operator",
    });

  assertEqual(closureResult.accepted, true, "trusted preflight-bound closeout record can close manual retry work item");
  assertEqual(closureResult.closeoutRecordPersistencePreflightAccepted, true, "closure requires accepted closeout-record persistence preflight");
  assertEqual(closureResult.closeoutRecordPersisted, true, "closure is bound to a persisted closeout record");
  assertEqual(closureResult.manualRetryWorkItemClosedByColony, true, "closure marks only the represented work item closed");
  assertEqual(closureResult.workItemClosurePersisted, false, "closure descriptor is not persisted in this slice");
  assertEqual(closureResult.retryControlWorkerInvocationExecutionReceiptPersisted, false, "closure persists no execution receipt");
  assertEqual(closureResult.retryLedgerEntryAlreadyPersisted, true, "closure preserves already persisted retry-ledger truth");
  assertEqual(closureResult.durableRetryAuditRecordAlreadyPersisted, true, "closure preserves already persisted audit truth");
  assertEqual(closureResult.retryLedgerCreatedByWorkItemClosure, false, "closure creates no retry ledger");
  assertEqual(closureResult.durableRetryAuditRecordCreatedByWorkItemClosure, false, "closure creates no durable audit record");
  assertEqual(closureResult.retryWorkerCreated, false, "closure creates no retry worker");
  assertEqual(closureResult.retryScheduleCreated, false, "closure creates no retry schedule");
  assertEqual(closureResult.defaultLiveDeliveryEnabled, false, "closure keeps default live delivery blocked");
  assertEqual(closureResult.publicHostingEnabled, false, "closure keeps public hosting blocked");
  assertEqual(closureResult.automaticVendorRetryAllowed, false, "closure allows no automatic vendor retry");

  const closure =
    closureResult.retryControlWorkerInvocationExecutionReceiptWorkItemClosure as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosure;
  assert(
    closure.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureId.startsWith(
      "manual-retry-control-worker-invocation-execution-receipt-work-item-closure:",
    ),
    "work-item closure id is deterministic and scoped",
  );
  assertEqual(closure.closeoutRecordPersistenceId, persistedRecord.closeoutRecordPersistenceId, "closure binds closeout-record persistence id");
  assertEqual(
    closure.retryControlWorkerInvocationExecutionReceiptCloseoutRecordId,
    persistedRecord.retryControlWorkerInvocationExecutionReceiptCloseoutRecordId,
    "closure binds closeout record id",
  );
  assertEqual(
    closure.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlanId,
    persistedRecord.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlanId,
    "closure binds closeout record-plan id",
  );
  assertEqual(closure.retryControlWorkerInvocationExecutionReceiptId, persistedRecord.retryControlWorkerInvocationExecutionReceiptId, "closure binds execution receipt id");
  assertEqual(closure.retryControlWorkerInvocationHandoffId, persistedRecord.retryControlWorkerInvocationHandoffId, "closure binds invocation handoff id");
  assertEqual(closure.retryControlWorkerHandlerReadinessId, persistedRecord.retryControlWorkerHandlerReadinessId, "closure binds handler readiness id");
  assertEqual(closure.retryControlWorkerSelectionId, persistedRecord.retryControlWorkerSelectionId, "closure binds worker selection id");
  assertEqual(closure.retryControlOperatorHandoffId, persistedRecord.retryControlOperatorHandoffId, "closure binds operator handoff id");
  assertEqual(closure.manualRetryControlReadinessPlanId, persistedRecord.manualRetryControlReadinessPlanId, "closure binds retry-control readiness plan id");
  assertEqual(closure.manualRetryLedgerEntryId, persistedRecord.manualRetryLedgerEntryId, "closure binds retry-ledger entry id");
  assertEqual(closure.workItemCorrelationId, persistedRecord.workItemCorrelationId, "closure binds work-item correlation");
  assertEqual(closure.expectedWorkItemCorrelationId, persistedRecord.expectedWorkItemCorrelationId, "closure binds expected work-item correlation");
  assertEqual(closure.transferKey, persistedRecord.transferKey, "closure binds transfer key");
  assertEqual(JSON.stringify(closure.sourceRefFingerprints), JSON.stringify(persistedRecord.sourceRefFingerprints), "closure carries only redacted source fingerprints");
  assertEqual(closure.targetCorrelationFingerprint, persistedRecord.targetCorrelationFingerprint, "closure binds target fingerprint");
  assertEqual(closure.hostReportedDeliveredCount, persistedRecord.hostReportedDeliveredCount, "closure binds delivered count");
  assertEqual(closure.vendorStateVerified, persistedRecord.vendorStateVerified, "closure preserves vendor-state verification truth");
  assertEqual(
    closure.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureTruth,
    "trusted_retry_control_closeout_record_persistence_preflight_bound_manual_retry_work_item_closed_no_persistence",
    "closure truth is explicit",
  );
  assert(!containsForbiddenTruth([closureResult]), "trusted preflight-bound work-item closure leaks no raw truth");
}

async function verifyMissingClosedAtRejectsDeterministicClosure(): Promise<void> {
  section("2. Missing Closed-At Rejects Instead Of Producing Nondeterministic Closure Ids");
  const { fixture, persistedRecord } = await persistedRecordFixture("phase200_missing_closed_at");
  const requestWithoutClosedAt = {
    ...fixture,
    retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
    closedBy: "operator",
  } as unknown as Parameters<
    typeof closeExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemFromCloseoutRecordPersistencePreflight
  >[0];

  const first =
    await closeExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemFromCloseoutRecordPersistencePreflight(
      requestWithoutClosedAt,
    );
  const second =
    await closeExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemFromCloseoutRecordPersistencePreflight(
      requestWithoutClosedAt,
    );

  assertEqual(first.accepted, false, "missing closed-at is rejected before closure");
  assertEqual(second.accepted, false, "repeated missing closed-at request remains rejected");
  assertEqual(
    first.reasonCode,
    "external_media_transfer_manual_retry_control_work_item_closure_closed_at_required",
    "missing closed-at rejection is bounded",
  );
  assertEqual(
    second.reasonCode,
    "external_media_transfer_manual_retry_control_work_item_closure_closed_at_required",
    "repeated missing closed-at rejection stays stable",
  );
  assertEqual(first.closeoutRecordPersistencePreflightAccepted, true, "missing closed-at still proves closeout-record preflight");
  assertEqual(first.manualRetryWorkItemClosedByColony, false, "missing closed-at closes no work item");
  assertEqual(first.workItemClosurePersisted, false, "missing closed-at persists no closure");
  assertEqual(first.retryWorkerCreated, false, "missing closed-at creates no retry worker");
  assertEqual(first.automaticVendorRetryAllowed, false, "missing closed-at allows no automatic vendor retry");
  assert(!containsForbiddenTruth([first, second]), "missing closed-at rejection leaks no raw truth");
}

async function verifyCopiedCloseoutRecordCannotCloseWorkItem(): Promise<void> {
  section("3. Copied Retry-Control Closeout Record Cannot Close Work Item");
  const { fixture, persistedRecord } = await persistedRecordFixture("phase200_copied");
  const copied = JSON.parse(JSON.stringify(persistedRecord));

  const closureResult =
    await closeExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemFromCloseoutRecordPersistencePreflight({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: copied,
      closedAt: "2026-05-09T04:51:34.000Z",
      closedBy: "operator",
    });

  assertEqual(closureResult.accepted, false, "copied closeout record is rejected before closure");
  assertEqual(
    closureResult.reasonCode,
    "external_media_transfer_trusted_retry_control_closeout_record_persistence_required",
    "copied rejection is bounded by preflight trust gate",
  );
  assertEqual(closureResult.closeoutRecordPersistencePreflightAccepted, false, "copied record does not pass preflight");
  assertEqual(closureResult.manualRetryWorkItemClosedByColony, false, "copied record closes no work item");
  assertEqual(closureResult.workItemClosurePersisted, false, "copied record persists no closure");
  assertEqual(closureResult.retryWorkerCreated, false, "copied record creates no retry worker");
  assertEqual(closureResult.automaticVendorRetryAllowed, false, "copied record allows no automatic vendor retry");
  assert(!containsForbiddenTruth([closureResult]), "copied rejection leaks no raw truth");
}

async function verifyTamperedCloseoutRecordCannotCloseWorkItem(): Promise<void> {
  section("4. Tampered Retry-Control Closeout Record Cannot Close Work Item");
  const { fixture, persistedRecord } = await persistedRecordFixture("phase200_tampered");
  const tampered = {
    ...persistedRecord,
    hostReportedDeliveredCount: Math.max(0, persistedRecord.hostReportedDeliveredCount - 1),
  };

  const closureResult =
    await closeExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemFromCloseoutRecordPersistencePreflight({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: tampered,
      closedAt: "2026-05-09T04:51:34.000Z",
      closedBy: "operator",
    });

  assertEqual(closureResult.accepted, false, "tampered closeout record is rejected before closure");
  assertEqual(
    closureResult.reasonCode,
    "external_media_transfer_manual_retry_control_closeout_record_persistence_current_truth_mismatch",
    "tampered rejection is bounded by current-truth preflight",
  );
  assertEqual(closureResult.closeoutRecordPersistencePreflightAccepted, false, "tampered record does not pass preflight");
  assertEqual(closureResult.manualRetryWorkItemClosedByColony, false, "tampered record closes no work item");
  assertEqual(closureResult.retryLedgerCreatedByWorkItemClosure, false, "tampered closure creates no retry ledger");
  assertEqual(closureResult.defaultLiveDeliveryEnabled, false, "tampered closure enables no default live delivery");
  assert(!containsForbiddenTruth([closureResult]), "tampered rejection leaks no raw truth");
}

async function verifyAppendFailedCloseoutRecordCannotCloseWorkItem(): Promise<void> {
  section("5. Append-Failed Retry-Control Closeout Record Cannot Close Work Item");
  const fixture = await recordPlanFixture("phase200_append_failed");
  let captured:
    | ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistence
    | undefined;
  const failingStore: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistenceStore = {
    appendCloseoutRecords: async (records) => {
      captured = records[0];
      throw new Error("append failed after object construction");
    },
    loadCloseoutRecords: async () => [],
  };
  const appendFailure =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord({
      ...fixture,
      closeoutRecordStore: failingStore,
      persistedAt: "2026-05-09T04:51:34.000Z",
      persistedBy: "operator",
    });
  assertEqual(appendFailure.accepted, false, "fixture append failure is rejected");
  assert(Boolean(captured), "append failure captures constructed pending closeout record");

  const closureResult =
    await closeExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemFromCloseoutRecordPersistencePreflight({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: captured,
      closedAt: "2026-05-09T04:51:34.000Z",
      closedBy: "operator",
    });

  assertEqual(closureResult.accepted, false, "append-failed closeout record is rejected before closure");
  assertEqual(
    closureResult.reasonCode,
    "external_media_transfer_trusted_retry_control_closeout_record_persistence_required",
    "append-failed rejection is bounded by trust gate",
  );
  assertEqual(closureResult.manualRetryWorkItemClosedByColony, false, "append-failed record closes no work item");
  assertEqual(closureResult.retryScheduleCreated, false, "append-failed record creates no retry schedule");
  assertEqual(closureResult.publicHostingEnabled, false, "append-failed record enables no public hosting");
  assert(!containsForbiddenTruth([appendFailure, closureResult]), "append-failed rejection leaks no raw truth");
}

async function verifyContaminatedCloseoutRecordCannotCloseWorkItem(): Promise<void> {
  section("6. Contaminated Retry-Control Closeout Record Cannot Close Work Item");
  const { fixture, persistedRecord } = await persistedRecordFixture("phase200_contaminated");
  const contaminated = {
    ...persistedRecord,
    retryWorkerCreated: true,
  };

  const closureResult =
    await closeExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemFromCloseoutRecordPersistencePreflight({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: contaminated,
      closedAt: "2026-05-09T04:51:34.000Z",
      closedBy: "operator",
    });

  assertEqual(closureResult.accepted, false, "contaminated closeout record is rejected before closure");
  assertEqual(
    closureResult.reasonCode,
    "valid_external_media_transfer_manual_retry_control_closeout_record_persistence_required",
    "contaminated rejection is bounded by preflight validation",
  );
  assertEqual(closureResult.closeoutRecordPersistencePreflightAccepted, false, "contaminated record does not pass preflight");
  assertEqual(closureResult.retryWorkerCreated, false, "contaminated closure still reports no created retry worker");
  assertEqual(closureResult.manualRetryWorkItemClosedByColony, false, "contaminated record closes no work item");
  assertEqual(closureResult.defaultLiveDeliveryEnabled, false, "contaminated record enables no default live delivery");
  assert(!containsForbiddenTruth([closureResult]), "contaminated rejection leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 200 Verification (Retry-Control Closeout Preflight-Bound Work-Item Closure)\n");
  await verifyTrustedPreflightBoundWorkItemClosure();
  await verifyMissingClosedAtRejectsDeterministicClosure();
  await verifyCopiedCloseoutRecordCannotCloseWorkItem();
  await verifyTamperedCloseoutRecordCannotCloseWorkItem();
  await verifyAppendFailedCloseoutRecordCannotCloseWorkItem();
  await verifyContaminatedCloseoutRecordCannotCloseWorkItem();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 200: retry-control closeout preflight-bound work-item closure is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
