/** Phase 198 Verification - External Media Transfer Manual Retry Control Worker Invocation Execution Receipt Closeout Record Persistence */

import { mkdtemp, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan,
  JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordStore,
  persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistence,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistenceStore,
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

function fileRefs(prefix = "phase198_media", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-198-media-${index}.pdf`,
    title: `Phase 198 media ${index}`,
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

async function createCloseoutRecordStore(): Promise<{
  rootDir: string;
  store: JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordStore;
}> {
  const rootDir = await mkdtemp(join(tmpdir(), "colony-phase198-closeout-records-"));
  return {
    rootDir,
    store: new JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordStore({
      rootDir,
    }),
  };
}

async function verifyCloseoutRecordPersistenceStoresRedactedRecord(): Promise<void> {
  section("1. Invocation Execution Receipt Closeout Record Persistence Stores Redacted Durable Record");
  const fixture = await recordPlanFixture("phase198_persisted");
  const draftResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord(
      fixture,
    );
  assertEqual(draftResult.accepted, true, "fixture closeout record draft is accepted");
  const draft = draftResult.retryControlWorkerInvocationExecutionReceiptCloseoutRecord!;
  const { store } = await createCloseoutRecordStore();

  const result =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord({
      ...fixture,
      closeoutRecordStore: store,
      persistedAt: "2026-05-09T04:03:40.000Z",
      persistedBy: "operator",
    });
  const record = result.retryControlWorkerInvocationExecutionReceiptCloseoutRecord;

  assertEqual(result.accepted, true, "closeout record persistence is accepted");
  assert(Boolean(record), "persisted closeout record is returned");
  assert(Boolean(record?.closeoutRecordPersistenceId.startsWith("manual-retry-control-worker-invocation-execution-receipt-closeout-record-persistence:")), "persistence id is deterministic and scoped");
  assertEqual(record?.recordType, "external_media_transfer_manual_retry_control_worker_invocation_execution_receipt_closeout_record", "record type is explicit");
  assertEqual(record?.schemaVersion, 1, "schema version is explicit");
  assertEqual(record?.persistedAt, "2026-05-09T04:03:40.000Z", "safe persisted timestamp is preserved");
  assertEqual(record?.persistedBy, "operator", "safe persisted actor is preserved");
  assertEqual(record?.retryControlWorkerInvocationExecutionReceiptCloseoutRecordId, draft.retryControlWorkerInvocationExecutionReceiptCloseoutRecordId, "persistence binds draft id");
  assertEqual(record?.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlanId, draft.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlanId, "persistence binds record-plan id");
  assertEqual(record?.retryControlWorkerInvocationExecutionReceiptCloseoutId, draft.retryControlWorkerInvocationExecutionReceiptCloseoutId, "persistence binds closeout id");
  assertEqual(record?.retryControlWorkerInvocationExecutionReceiptId, draft.retryControlWorkerInvocationExecutionReceiptId, "persistence binds receipt id");
  assertEqual(record?.retryControlWorkerInvocationHandoffId, draft.retryControlWorkerInvocationHandoffId, "persistence binds invocation handoff id");
  assertEqual(record?.retryControlWorkerHandlerReadinessId, draft.retryControlWorkerHandlerReadinessId, "persistence binds handler readiness id");
  assertEqual(record?.retryControlWorkerSelectionId, draft.retryControlWorkerSelectionId, "persistence binds worker selection id");
  assertEqual(record?.retryControlOperatorHandoffId, draft.retryControlOperatorHandoffId, "persistence binds operator handoff id");
  assertEqual(record?.manualRetryControlReadinessPlanId, draft.manualRetryControlReadinessPlanId, "persistence binds readiness plan id");
  assertEqual(record?.manualRetryLedgerEntryId, draft.manualRetryLedgerEntryId, "persistence binds retry-ledger entry id");
  assertEqual(record?.workItemCorrelationId, draft.workItemCorrelationId, "persistence binds work-item correlation");
  assertEqual(record?.transferKey, draft.transferKey, "persistence binds transfer key");
  assertEqual(record?.sourceRefFingerprints.length, draft.sourceRefFingerprints.length, "persistence stores source fingerprints only");
  assertEqual(record?.targetCorrelationFingerprint, draft.targetCorrelationFingerprint, "persistence binds target fingerprint");
  assertEqual(record?.hostReportedDeliveredCount, draft.hostReportedDeliveredCount, "persistence binds delivered-count truth");
  assertEqual(record?.vendorStateVerified, draft.vendorStateVerified, "persistence binds vendor-state truth");
  assertEqual(record?.recordPlanPreflightAccepted, true, "persistence requires accepted record-plan preflight");
  assertEqual(record?.durableCloseoutRecordReady, true, "durable closeout record readiness is preserved");
  assertEqual(record?.closeoutRecordPersisted, true, "closeout record is explicitly persisted");
  assertEqual(record?.manualRetryWorkItemClosedByColony, false, "persistence does not close work item");
  assertEqual(record?.retryControlWorkerInvocationExecutionReceiptPersisted, false, "persistence does not persist execution receipt");
  assertEqual(record?.retryLedgerEntryAlreadyPersisted, true, "persistence preserves existing retry-ledger truth");
  assertEqual(record?.durableRetryAuditRecordAlreadyPersisted, true, "persistence preserves existing durable-audit truth");
  assertEqual(record?.retryLedgerCreatedByCloseoutRecord, false, "persistence creates no retry ledger");
  assertEqual(record?.durableRetryAuditRecordCreatedByCloseoutRecord, false, "persistence creates no durable audit");
  assertEqual(record?.retryWorkerCreated, false, "persistence creates no retry worker");
  assertEqual(record?.retryScheduleCreated, false, "persistence creates no retry schedule");
  assertEqual(record?.automaticVendorRetryAllowed, false, "persistence enables no automatic vendor retry");
  assertEqual(record?.defaultLiveDeliveryEnabled, false, "persistence keeps default live delivery blocked");
  assertEqual(record?.publicHostingEnabled, false, "persistence keeps public hosting blocked");
  assertEqual(
    record?.manualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordTruth,
    "record_plan_preflight_bound_manual_retry_control_worker_invocation_execution_receipt_closeout_record_persisted_no_work_item_closure",
    "persistence truth is explicit",
  );

  const loaded = await store.loadCloseoutRecords();
  assertEqual(loaded.length, 1, "closeout record store reloads one persisted record");
  assertEqual(loaded[0]?.closeoutRecordPersistenceId, record?.closeoutRecordPersistenceId, "loaded record preserves persistence id");
  assertEqual(loaded[0]?.persistedAt, "2026-05-09T04:03:40.000Z", "loaded record preserves timestamp");
  assertEqual(loaded[0]?.closeoutRecordPersisted, true, "loaded record preserves persistence truth");
  assert(!containsForbiddenTruth([result, loaded]), "persisted closeout record leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyCloseoutRecordPersistenceRejectsMissingStoreAndAppendFailure(): Promise<void> {
  section("2. Invocation Execution Receipt Closeout Record Persistence Rejects Missing Store And Append Failure");
  const fixture = await recordPlanFixture("phase198_missing_store");
  const missingStore =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord({
      ...fixture,
      persistedAt: "2026-05-09T04:03:40.000Z",
      persistedBy: "operator",
    });
  assertEqual(missingStore.accepted, false, "missing store blocks persistence");
  assertEqual(missingStore.reasonCode, "external_media_transfer_manual_retry_control_closeout_record_store_required", "missing store rejection is bounded");
  assertEqual(missingStore.closeoutRecordPersisted, false, "missing store persists no closeout record");
  assertEqual(missingStore.retryWorkerCreated, false, "missing store creates no retry worker");

  const failingStore: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistenceStore = {
    appendCloseoutRecords: async () => {
      throw new Error("disk includes xoxb-secret-value");
    },
    loadCloseoutRecords: async () => [],
  };
  const appendFailure =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord({
      ...fixture,
      closeoutRecordStore: failingStore,
      persistedAt: "2026-05-09T04:03:40.000Z",
      persistedBy: "operator",
    });
  assertEqual(appendFailure.accepted, false, "append failure blocks persistence");
  assertEqual(appendFailure.reasonCode, "external_media_transfer_manual_retry_control_closeout_record_store_append_failed", "append failure rejection is bounded");
  assertEqual(appendFailure.closeoutRecordPersisted, false, "append failure reports no persistence");
  assert(!containsForbiddenTruth([missingStore, appendFailure]), "persistence rejections leak no raw truth");
}

async function verifyCloseoutRecordPersistenceRejectsTamperedJournal(): Promise<void> {
  section("3. Invocation Execution Receipt Closeout Record Persistence Rejects Tampered Journal");
  const fixture = await recordPlanFixture("phase198_tampered_journal");
  const { rootDir, store } = await createCloseoutRecordStore();
  const result =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord({
      ...fixture,
      closeoutRecordStore: store,
      persistedAt: "2026-05-09T04:03:40.000Z",
      persistedBy: "operator",
    });
  assertEqual(result.accepted, true, "tamper fixture persists initial closeout record");
  const record = result.retryControlWorkerInvocationExecutionReceiptCloseoutRecord as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistence;
  const tampered = {
    ...record,
    hostReportedDeliveredCount: Math.max(0, record.hostReportedDeliveredCount - 1),
  };
  await writeFile(
    join(rootDir, "external-media-transfer-retry-control-closeout-records.jsonl"),
    `${JSON.stringify(tampered)}\n`,
    "utf8",
  );
  let tamperRejected = false;
  try {
    await store.loadCloseoutRecords();
  } catch (error) {
    tamperRejected = String((error as Error).message).includes("journal is invalid");
  }
  assert(tamperRejected, "valid-shaped but tampered closeout record journal fails closed");
  assert(!containsForbiddenTruth(tampered), "tampered fixture remains redacted");
}

async function verifyCloseoutRecordPersistenceRejectsMismatchedRecordPlan(): Promise<void> {
  section("4. Invocation Execution Receipt Closeout Record Persistence Rejects Mismatched Record Plan");
  const fixture = await recordPlanFixture("phase198_mismatch");
  const { store } = await createCloseoutRecordStore();
  const mismatched = {
    ...fixture.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan,
    hostReportedDeliveredCount:
      fixture.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan.hostReportedDeliveredCount + 1,
  };
  const result =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan: mismatched,
      closeoutRecordStore: store,
      persistedAt: "2026-05-09T04:03:40.000Z",
      persistedBy: "operator",
    });
  assertEqual(result.accepted, false, "mismatched record plan blocks persistence");
  assertEqual(
    result.reasonCode,
    "manual_retry_control_worker_invocation_execution_receipt_closeout_record_plan_current_truth_mismatch",
    "mismatched record-plan rejection is bounded",
  );
  assertEqual(result.retryControlWorkerInvocationExecutionReceiptCloseoutRecord, undefined, "mismatch returns no persisted record");
  assertEqual(result.closeoutRecordPersisted, false, "mismatch persists no closeout record");
  assertEqual(result.retryWorkerCreated, false, "mismatch creates no retry worker");
  assert(!containsForbiddenTruth(result), "mismatched persistence rejection leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 198 Verification (External Media Transfer Manual Retry Control Worker Invocation Execution Receipt Closeout Record Persistence)\n");
  await verifyCloseoutRecordPersistenceStoresRedactedRecord();
  await verifyCloseoutRecordPersistenceRejectsMissingStoreAndAppendFailure();
  await verifyCloseoutRecordPersistenceRejectsTamperedJournal();
  await verifyCloseoutRecordPersistenceRejectsMismatchedRecordPlan();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 198: external media transfer manual retry control worker invocation execution receipt closeout record persistence is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
