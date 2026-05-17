/** Phase 201 Verification - Retry-Control Work-Item Closure Persistence */

import { mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan,
  JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordStore,
  JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureStore,
  persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord,
  persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosure,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistence,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistence,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistenceStore,
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

function fileRefs(prefix = "phase201_media", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-201-media-${index}.pdf`,
    title: `Phase 201 media ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 8192 + index,
    checksumSha256: `${(index + 7).toString(16)}`.repeat(64),
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
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase201-closeout-record-")),
  });
}

async function createWorkItemClosureStore(): Promise<JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureStore> {
  return new JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureStore({
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase201-work-item-closure-")),
  });
}

async function persistedRecordFixture(prefix: string) {
  const fixture = await recordPlanFixture(prefix);
  const store = await createCloseoutRecordStore();
  const persisted =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord({
      ...fixture,
      closeoutRecordStore: store,
      persistedAt: "2026-05-09T05:17:05.000Z",
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

async function verifyTrustedClosurePersistence(): Promise<void> {
  section("1. Trusted Retry-Control Work-Item Closure Persists Append-Only Record");
  const { fixture, persistedRecord } = await persistedRecordFixture("phase201_trusted");
  const workItemClosureStore = await createWorkItemClosureStore();

  const persisted =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosure({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      workItemClosureStore,
      closedAt: "2026-05-09T05:17:05.000Z",
      closedBy: "operator",
      persistedAt: "2026-05-09T05:17:06.000Z",
      persistedBy: "operator",
    });

  assertEqual(persisted.accepted, true, "trusted retry-control work-item closure is persisted");
  assertEqual(persisted.closeoutRecordPersistencePreflightAccepted, true, "persistence requires trusted closeout-record preflight");
  assertEqual(persisted.closeoutRecordPersisted, true, "persistence stays bound to persisted closeout record");
  assertEqual(persisted.manualRetryWorkItemClosedByColony, true, "persistence records represented work item closed");
  assertEqual(persisted.workItemClosurePersisted, true, "work-item closure persistence is explicit");
  assertEqual(persisted.retryControlWorkerInvocationExecutionReceiptPersisted, false, "persistence stores no execution receipt");
  assertEqual(persisted.retryLedgerEntryAlreadyPersisted, true, "persistence preserves already persisted retry ledger");
  assertEqual(persisted.durableRetryAuditRecordAlreadyPersisted, true, "persistence preserves already persisted durable audit");
  assertEqual(persisted.retryLedgerCreatedByWorkItemClosure, false, "persistence creates no retry ledger");
  assertEqual(persisted.durableRetryAuditRecordCreatedByWorkItemClosure, false, "persistence creates no durable audit record");
  assertEqual(persisted.retryWorkerCreated, false, "persistence creates no retry worker");
  assertEqual(persisted.retryScheduleCreated, false, "persistence creates no retry schedule");
  assertEqual(persisted.defaultLiveDeliveryEnabled, false, "persistence keeps default live delivery blocked");
  assertEqual(persisted.publicHostingEnabled, false, "persistence keeps public hosting blocked");
  assertEqual(persisted.automaticVendorRetryAllowed, false, "persistence allows no automatic vendor retry");

  const closure = persisted.retryControlWorkerInvocationExecutionReceiptWorkItemClosure as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistence;
  assert(
    closure.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistenceId.startsWith(
      "manual-retry-control-worker-invocation-execution-receipt-work-item-closure-persistence:",
    ),
    "work-item closure persistence id is deterministic and scoped",
  );
  assertEqual(
    closure.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureId,
    persisted.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureId,
    "persistence binds work-item closure id",
  );
  assertEqual(closure.closeoutRecordPersistenceId, persistedRecord.closeoutRecordPersistenceId, "persistence binds closeout-record persistence id");
  assertEqual(closure.retryControlWorkerInvocationExecutionReceiptCloseoutRecordId, persistedRecord.retryControlWorkerInvocationExecutionReceiptCloseoutRecordId, "persistence binds closeout record id");
  assertEqual(closure.retryControlWorkerInvocationExecutionReceiptId, persistedRecord.retryControlWorkerInvocationExecutionReceiptId, "persistence binds execution receipt id");
  assertEqual(closure.manualRetryLedgerEntryId, persistedRecord.manualRetryLedgerEntryId, "persistence binds retry-ledger entry id");
  assertEqual(closure.workItemCorrelationId, persistedRecord.workItemCorrelationId, "persistence binds work-item correlation");
  assertEqual(closure.transferKey, persistedRecord.transferKey, "persistence binds transfer key");
  assertEqual(JSON.stringify(closure.sourceRefFingerprints), JSON.stringify(persistedRecord.sourceRefFingerprints), "persistence carries only redacted source fingerprints");
  assertEqual(
    closure.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistenceTruth,
    "trusted_retry_control_closeout_record_persistence_preflight_bound_manual_retry_work_item_closure_persisted_no_new_retry",
    "persistence truth is explicit",
  );

  const loaded = await workItemClosureStore.loadWorkItemClosures();
  assertEqual(loaded.length, 1, "append-only work-item closure journal can be loaded");
  assertEqual(
    loaded[0]?.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistenceId,
    closure.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistenceId,
    "loaded work-item closure preserves persistence id",
  );
  assert(!containsForbiddenTruth([persisted, loaded]), "trusted work-item closure persistence leaks no raw truth");
}

async function verifyMissingStoreRejectsPersistence(): Promise<void> {
  section("2. Missing Work-Item Closure Store Rejects Persistence");
  const { fixture, persistedRecord } = await persistedRecordFixture("phase201_missing_store");

  const persisted =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosure({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      closedAt: "2026-05-09T05:17:05.000Z",
      persistedAt: "2026-05-09T05:17:06.000Z",
    });

  assertEqual(persisted.accepted, false, "missing work-item closure store is rejected");
  assertEqual(
    persisted.reasonCode,
    "external_media_transfer_manual_retry_control_work_item_closure_store_required",
    "missing store rejection is bounded",
  );
  assertEqual(persisted.manualRetryWorkItemClosedByColony, true, "missing store happens after trusted closure proof");
  assertEqual(persisted.workItemClosurePersisted, false, "missing store persists no closure");
  assertEqual(persisted.retryWorkerCreated, false, "missing store creates no retry worker");
  assertEqual(persisted.automaticVendorRetryAllowed, false, "missing store allows no automatic vendor retry");
  assert(!containsForbiddenTruth(persisted), "missing store rejection leaks no raw truth");
}

async function verifyAppendFailureRejectsPersistence(): Promise<void> {
  section("3. Append Failure Rejects And Does Not Trust Pending Closure");
  const { fixture, persistedRecord } = await persistedRecordFixture("phase201_append_failed");
  let captured:
    | ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistence
    | undefined;
  const failingStore: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistenceStore = {
    appendWorkItemClosures: async (records) => {
      captured = records[0];
      throw new Error("append failed after object construction");
    },
    loadWorkItemClosures: async () => [],
  };

  const persisted =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosure({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      workItemClosureStore: failingStore,
      closedAt: "2026-05-09T05:17:05.000Z",
      persistedAt: "2026-05-09T05:17:06.000Z",
    });

  assertEqual(persisted.accepted, false, "append-failed work-item closure persistence is rejected");
  assertEqual(
    persisted.reasonCode,
    "external_media_transfer_manual_retry_control_work_item_closure_store_append_failed",
    "append failure rejection is bounded",
  );
  assert(Boolean(captured), "append failure captures constructed pending work-item closure");
  assertEqual(persisted.manualRetryWorkItemClosedByColony, true, "append failure happens after closure proof");
  assertEqual(persisted.workItemClosurePersisted, false, "append failure does not persist closure");
  assertEqual(persisted.retryScheduleCreated, false, "append failure creates no retry schedule");
  assertEqual(persisted.publicHostingEnabled, false, "append failure enables no public hosting");
  assert(!containsForbiddenTruth([persisted, captured]), "append-failed persistence leaks no raw truth");
}

async function verifyCopiedCloseoutRecordRejectsPersistence(): Promise<void> {
  section("4. Copied Closeout Record Rejects Before Work-Item Closure Persistence");
  const { fixture, persistedRecord } = await persistedRecordFixture("phase201_copied");
  const workItemClosureStore = await createWorkItemClosureStore();
  const copied = JSON.parse(JSON.stringify(persistedRecord));

  const persisted =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosure({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: copied,
      workItemClosureStore,
      closedAt: "2026-05-09T05:17:05.000Z",
      persistedAt: "2026-05-09T05:17:06.000Z",
    });

  assertEqual(persisted.accepted, false, "copied closeout record is rejected before persistence");
  assertEqual(
    persisted.reasonCode,
    "external_media_transfer_trusted_retry_control_closeout_record_persistence_required",
    "copied record rejection is bounded by trust gate",
  );
  assertEqual(persisted.closeoutRecordPersistencePreflightAccepted, false, "copied record fails closeout-record preflight");
  assertEqual(persisted.manualRetryWorkItemClosedByColony, false, "copied record closes no work item");
  assertEqual(persisted.workItemClosurePersisted, false, "copied record persists no closure");
  assertEqual((await workItemClosureStore.loadWorkItemClosures()).length, 0, "copied record appends no journal entry");
  assert(!containsForbiddenTruth(persisted), "copied record persistence rejection leaks no raw truth");
}

async function verifyContaminatedCloseoutRecordRejectsPersistence(): Promise<void> {
  section("5. Contaminated Closeout Record Rejects Before Work-Item Closure Persistence");
  const { fixture, persistedRecord } = await persistedRecordFixture("phase201_contaminated");
  const workItemClosureStore = await createWorkItemClosureStore();
  const contaminated = {
    ...persistedRecord,
    retryWorkerCreated: true,
  };

  const persisted =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosure({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: contaminated,
      workItemClosureStore,
      closedAt: "2026-05-09T05:17:05.000Z",
      persistedAt: "2026-05-09T05:17:06.000Z",
    });

  assertEqual(persisted.accepted, false, "contaminated closeout record is rejected before persistence");
  assertEqual(
    persisted.reasonCode,
    "valid_external_media_transfer_manual_retry_control_closeout_record_persistence_required",
    "contaminated record rejection is bounded",
  );
  assertEqual(persisted.manualRetryWorkItemClosedByColony, false, "contaminated record closes no work item");
  assertEqual(persisted.workItemClosurePersisted, false, "contaminated record persists no closure");
  assertEqual(persisted.defaultLiveDeliveryEnabled, false, "contaminated record enables no default live delivery");
  assertEqual((await workItemClosureStore.loadWorkItemClosures()).length, 0, "contaminated record appends no journal entry");
  assert(!containsForbiddenTruth(persisted), "contaminated persistence rejection leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 201 Verification (Retry-Control Work-Item Closure Persistence)\n");
  await verifyTrustedClosurePersistence();
  await verifyMissingStoreRejectsPersistence();
  await verifyAppendFailureRejectsPersistence();
  await verifyCopiedCloseoutRecordRejectsPersistence();
  await verifyContaminatedCloseoutRecordRejectsPersistence();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 201: retry-control work-item closure persistence is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
