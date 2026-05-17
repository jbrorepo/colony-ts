/** Phase 202 Verification - Retry-Control Work-Item Closure Persistence Preflight */

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
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistence,
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

function containsPhase202ForbiddenTruth(value: unknown): boolean {
  if (containsForbiddenTruth(value)) {
    return true;
  }

  const serialized = JSON.stringify(value);
  if (!serialized) {
    return false;
  }

  return ["artifact:phase202", "phase202_", "phase-202-media", "Phase 202 media"].some((marker) =>
    serialized.includes(marker),
  );
}

function fileRefs(prefix = "phase202_media", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-202-media-${index}.pdf`,
    title: `Phase 202 media ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 8192 + index,
    checksumSha256: `${(index + 8).toString(16)}`.repeat(64),
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
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase202-closeout-record-")),
  });
}

async function createWorkItemClosureStore(): Promise<JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureStore> {
  return new JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureStore({
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase202-work-item-closure-")),
  });
}

async function persistedRecordFixture(prefix: string) {
  const fixture = await recordPlanFixture(prefix);
  const store = await createCloseoutRecordStore();
  const persisted =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord({
      ...fixture,
      closeoutRecordStore: store,
      persistedAt: "2026-05-09T05:36:43.000Z",
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

async function persistedClosureFixture(prefix: string) {
  const { fixture, persistedRecord } = await persistedRecordFixture(prefix);
  const workItemClosureStore = await createWorkItemClosureStore();
  const persisted =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosure({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      workItemClosureStore,
      closedAt: "2026-05-09T05:36:44.000Z",
      closedBy: "operator",
      persistedAt: "2026-05-09T05:36:45.000Z",
      persistedBy: "operator",
    });
  assertEqual(persisted.accepted, true, "fixture work-item closure is persisted");
  assert(Boolean(persisted.retryControlWorkerInvocationExecutionReceiptWorkItemClosure), "fixture persisted work-item closure is returned");
  return {
    fixture,
    persistedRecord,
    persistedClosure:
      persisted.retryControlWorkerInvocationExecutionReceiptWorkItemClosure as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistence,
  };
}

async function verifyTrustedWorkItemClosurePersistencePreflight(): Promise<void> {
  section("1. Trusted Retry-Control Work-Item Closure Persistence Preflight Recomputes Current Truth");
  const { fixture, persistedRecord, persistedClosure } = await persistedClosureFixture("phase202_trusted");

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistence({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: persistedClosure,
    });

  assertEqual(preflight.accepted, true, "trusted supplied work-item closure persistence preflight is accepted");
  assert(Boolean(preflight.retryControlWorkerInvocationExecutionReceiptWorkItemClosure), "preflight returns recomputed work-item closure persistence");
  assertEqual(preflight.workItemClosurePersistenceIdMatched, true, "work-item closure persistence id matches");
  assertEqual(preflight.workItemClosureIdMatched, true, "work-item closure id matches");
  assertEqual(preflight.closeoutRecordPersistenceIdMatched, true, "closeout-record persistence id matches");
  assertEqual(preflight.closeoutRecordPersistencePreflightAccepted, true, "preflight requires accepted closeout-record persistence preflight");
  assertEqual(preflight.workItemClosurePersistenceStillTrusted, true, "supplied work-item closure persistence is trusted");
  assertEqual(preflight.manualRetryWorkItemClosedByColony, true, "preflight confirms represented work item is closed");
  assertEqual(preflight.workItemClosurePersisted, true, "preflight confirms closure persistence");
  assertEqual(preflight.retryControlWorkerInvocationExecutionReceiptPersisted, false, "preflight persists no execution receipt");
  assertEqual(preflight.retryLedgerEntryAlreadyPersisted, true, "preflight preserves existing retry ledger");
  assertEqual(preflight.durableRetryAuditRecordAlreadyPersisted, true, "preflight preserves existing durable audit");
  assertEqual(preflight.retryLedgerStillBlocked, true, "preflight creates no retry ledger");
  assertEqual(preflight.durableRetryAuditStillBlocked, true, "preflight creates no durable audit");
  assertEqual(preflight.retryWorkerStillBlocked, true, "preflight keeps retry workers blocked");
  assertEqual(preflight.automaticVendorRetryStillBlocked, true, "preflight keeps automatic vendor retry blocked");
  assertEqual(preflight.defaultLiveDeliveryStillBlocked, true, "preflight keeps default live delivery blocked");
  assertEqual(preflight.publicHostingStillBlocked, true, "preflight keeps public hosting blocked");
  assertEqual(
    preflight.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistencePreflightTruth,
    "recomputed_from_trusted_retry_control_work_item_closure_persistence_and_supplied_work_item_closure_no_new_retry",
    "preflight truth is explicit",
  );
  assertEqual(
    preflight.retryControlWorkerInvocationExecutionReceiptWorkItemClosure?.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistenceId,
    persistedClosure.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistenceId,
    "preflight returns expected persisted closure truth",
  );
  assert(!containsPhase202ForbiddenTruth(preflight), "trusted work-item closure persistence preflight leaks no raw truth");
}

async function verifyTamperedWorkItemClosurePersistencePreflightRejects(): Promise<void> {
  section("2. Tampered Retry-Control Work-Item Closure Persistence Preflight Rejects Current Truth Mismatch");
  const { fixture, persistedRecord, persistedClosure } = await persistedClosureFixture("phase202_tampered");
  const tampered = {
    ...persistedClosure,
    hostReportedDeliveredCount: Math.max(0, persistedClosure.hostReportedDeliveredCount - 1),
  };

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistence({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: tampered,
    });

  assertEqual(preflight.accepted, false, "tampered work-item closure persistence preflight is rejected");
  assertEqual(
    preflight.reasonCode,
    "external_media_transfer_manual_retry_control_work_item_closure_persistence_current_truth_mismatch",
    "tampered rejection is bounded",
  );
  assertEqual(preflight.hostReportedDeliveredCountMatched, false, "tampered delivered count mismatch is surfaced");
  assertEqual(preflight.workItemClosurePersistenceStillTrusted, false, "tampered copied object is not trusted");
  assertEqual(preflight.retryWorkerCreated, false, "tampered preflight creates no retry worker");
  assertEqual(preflight.defaultLiveDeliveryEnabled, false, "tampered preflight enables no default live delivery");
  assert(!containsPhase202ForbiddenTruth(preflight), "tampered work-item closure persistence preflight leaks no raw truth");
}

async function verifyCopiedWorkItemClosurePersistencePreflightRejects(): Promise<void> {
  section("3. Copied Retry-Control Work-Item Closure Persistence Preflight Rejects Untrusted Object");
  const { fixture, persistedRecord, persistedClosure } = await persistedClosureFixture("phase202_copied");
  const copied = JSON.parse(JSON.stringify(persistedClosure));

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistence({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: copied,
    });

  assertEqual(preflight.accepted, false, "copied work-item closure persistence preflight is rejected");
  assertEqual(
    preflight.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_persistence_required",
    "untrusted copy rejection is bounded",
  );
  assertEqual(preflight.workItemClosurePersistenceStillTrusted, false, "copied work-item closure persistence is not trusted");
  assertEqual(preflight.workItemClosurePersistenceIdMatched, true, "copied closure can match truth but still fail trust");
  assertEqual(preflight.retryWorkerCreated, false, "copied preflight creates no retry worker");
  assertEqual(preflight.automaticVendorRetryAllowed, false, "copied preflight allows no automatic vendor retry");
  assert(!containsPhase202ForbiddenTruth(preflight), "copied work-item closure persistence preflight leaks no raw truth");
}

async function verifyAppendFailedWorkItemClosurePersistencePreflightRejects(): Promise<void> {
  section("4. Append-Failed Retry-Control Work-Item Closure Persistence Preflight Rejects Untrusted Pending Object");
  const { fixture, persistedRecord } = await persistedRecordFixture("phase202_append_failed");
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
  const appendFailure =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosure({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      workItemClosureStore: failingStore,
      closedAt: "2026-05-09T05:36:44.000Z",
      closedBy: "operator",
      persistedAt: "2026-05-09T05:36:45.000Z",
      persistedBy: "operator",
    });
  assertEqual(appendFailure.accepted, false, "fixture append failure is rejected");
  assert(Boolean(captured), "append failure captures constructed pending work-item closure");

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistence({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: captured,
    });

  assertEqual(preflight.accepted, false, "append-failed work-item closure persistence preflight is rejected");
  assertEqual(
    preflight.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_persistence_required",
    "append-failed object rejection is bounded by trust gate",
  );
  assertEqual(preflight.workItemClosurePersistenceStillTrusted, false, "append-failed pending object is not trusted");
  assertEqual(preflight.workItemClosurePersistenceIdMatched, true, "append-failed object can match truth but still fail trust");
  assertEqual(preflight.retryScheduleCreated, false, "append-failed preflight creates no retry schedule");
  assertEqual(preflight.defaultLiveDeliveryEnabled, false, "append-failed preflight enables no default live delivery");
  assert(!containsPhase202ForbiddenTruth([appendFailure, preflight]), "append-failed work-item closure persistence preflight leaks no raw truth");
}

async function verifyContaminatedWorkItemClosurePersistencePreflightRejects(): Promise<void> {
  section("5. Contaminated Retry-Control Work-Item Closure Persistence Preflight Rejects Unsafe Flags");
  const { fixture, persistedRecord, persistedClosure } = await persistedClosureFixture("phase202_contaminated");
  const contaminated = {
    ...persistedClosure,
    retryWorkerCreated: true,
  };

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistence({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: contaminated,
    });

  assertEqual(preflight.accepted, false, "contaminated work-item closure persistence preflight is rejected");
  assertEqual(
    preflight.reasonCode,
    "valid_external_media_transfer_manual_retry_control_work_item_closure_persistence_required",
    "contaminated rejection is bounded",
  );
  assertEqual(preflight.retryWorkerStillBlocked, false, "contaminated retry-worker claim is surfaced");
  assertEqual(preflight.retryWorkerCreated, false, "contaminated preflight creates no retry worker");
  assertEqual(preflight.defaultLiveDeliveryEnabled, false, "contaminated preflight enables no default live delivery");
  assert(!containsPhase202ForbiddenTruth(preflight), "contaminated work-item closure persistence preflight leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 202 Verification (Retry-Control Work-Item Closure Persistence Preflight)\n");
  await verifyTrustedWorkItemClosurePersistencePreflight();
  await verifyTamperedWorkItemClosurePersistencePreflightRejects();
  await verifyCopiedWorkItemClosurePersistencePreflightRejects();
  await verifyAppendFailedWorkItemClosurePersistencePreflightRejects();
  await verifyContaminatedWorkItemClosurePersistencePreflightRejects();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 202: retry-control work-item closure persistence preflight is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
