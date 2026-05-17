/** Phase 206 Verification - Retry-Control Work-Item Closure Audit Record Persistence Preflight */

import { mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlan,
  JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordStore,
  JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordStore,
  JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureStore,
  persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord,
  persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosure,
  persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecord,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPersistence,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistence,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecord,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPersistenceStore,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistence,
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

function containsPhase206ForbiddenTruth(value: unknown): boolean {
  if (containsForbiddenTruth(value)) return true;
  const serialized = JSON.stringify(value);
  if (!serialized) return false;
  return ["artifact:phase206", "phase206_", "phase-206-media", "Phase 206 media"].some((marker) =>
    serialized.includes(marker),
  );
}

function fileRefs(prefix = "phase206_media", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-206-media-${index}.pdf`,
    title: `Phase 206 media ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 11264 + index,
    checksumSha256: `${(index + 11).toString(16)}`.repeat(64),
  }));
}

async function recordPlanFixture(prefix: string) {
  const fixture = await invocationExecutionReceiptFixture({ fileRefs: fileRefs(prefix) });
  const closeoutResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout(fixture);
  assertEqual(closeoutResult.accepted, true, "fixture retry-control execution receipt closeout is accepted");
  assert(Boolean(closeoutResult.retryControlWorkerInvocationExecutionReceiptCloseout), "fixture closeout is returned");
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
  assert(Boolean(recordPlanResult.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan), "fixture record plan is returned");
  return {
    ...withCloseout,
    retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan:
      recordPlanResult.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan!,
  };
}

async function createCloseoutRecordStore(): Promise<JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordStore> {
  return new JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordStore({
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase206-closeout-record-")),
  });
}

async function createWorkItemClosureStore(): Promise<JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureStore> {
  return new JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureStore({
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase206-work-item-closure-")),
  });
}

async function createAuditRecordStore(): Promise<JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordStore> {
  return new JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordStore({
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase206-audit-record-")),
  });
}

async function persistedRecordFixture(prefix: string) {
  const fixture = await recordPlanFixture(prefix);
  const persisted =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord({
      ...fixture,
      closeoutRecordStore: await createCloseoutRecordStore(),
      persistedAt: "2026-05-09T07:03:06.000Z",
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
  const persisted =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosure({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      workItemClosureStore: await createWorkItemClosureStore(),
      closedAt: "2026-05-09T07:03:07.000Z",
      closedBy: "operator",
      persistedAt: "2026-05-09T07:03:08.000Z",
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

async function trustedAuditRecordFixture(prefix: string) {
  const { fixture, persistedRecord, persistedClosure } = await persistedClosureFixture(prefix);
  const planResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlan({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: persistedClosure,
    });
  assertEqual(planResult.accepted, true, "fixture audit record plan is accepted");
  assert(Boolean(planResult.workItemClosureAuditRecordPlan), "fixture audit record plan is returned");
  const persistedAuditRecord =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecord({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: persistedClosure,
      workItemClosureAuditRecordPlan: planResult.workItemClosureAuditRecordPlan,
      auditRecordStore: await createAuditRecordStore(),
      persistedAt: "2026-05-09T07:03:09.000Z",
      persistedBy: "operator",
    });
  assertEqual(persistedAuditRecord.accepted, true, "fixture audit record is persisted");
  assert(Boolean(persistedAuditRecord.workItemClosureAuditRecord), "fixture persisted audit record is returned");
  return {
    fixture,
    persistedRecord,
    persistedClosure,
    planResult,
    auditRecord:
      persistedAuditRecord.workItemClosureAuditRecord as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecord,
  };
}

async function verifyTrustedAuditRecordPersistencePreflight(): Promise<void> {
  section("1. Trusted Retry-Control Work-Item Closure Audit Record Persistence Preflight Recomputes Current Truth");
  const { fixture, persistedRecord, persistedClosure, planResult, auditRecord } =
    await trustedAuditRecordFixture("phase206_trusted");

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPersistence({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: persistedClosure,
      workItemClosureAuditRecordPlan: planResult.workItemClosureAuditRecordPlan,
      workItemClosureAuditRecord: auditRecord,
    });

  assertEqual(preflight.accepted, true, "trusted supplied audit record persistence preflight is accepted");
  assert(Boolean(preflight.workItemClosureAuditRecord), "preflight returns recomputed audit record persistence");
  assertEqual(preflight.workItemClosureAuditRecordPersistenceStillTrusted, true, "supplied audit record persistence is trusted");
  assertEqual(preflight.workItemClosureAuditRecordIdMatched, true, "audit record id matches");
  assertEqual(preflight.workItemClosureAuditRecordPlanIdMatched, true, "audit record plan id matches");
  assertEqual(preflight.workItemClosurePersistenceIdMatched, true, "closure persistence id matches");
  assertEqual(preflight.auditRecordPersistedAtMatched, true, "audit record timestamp matches");
  assertEqual(preflight.auditRecordPersistedByMatched, true, "audit record actor matches");
  assertEqual(preflight.auditRecordPlanPreflightAccepted, true, "preflight requires accepted audit-record plan preflight");
  assertEqual(preflight.durableRetryAuditRecordCreated, true, "preflight preserves durable audit persistence");
  assertEqual(preflight.retryLedgerEntryAlreadyPersisted, true, "preflight preserves existing retry ledger");
  assertEqual(preflight.retryLedgerStillBlocked, true, "preflight creates no retry ledger");
  assertEqual(preflight.retryWorkerStillBlocked, true, "preflight keeps retry worker blocked");
  assertEqual(preflight.defaultLiveDeliveryStillBlocked, true, "preflight keeps default live delivery blocked");
  assertEqual(preflight.publicHostingStillBlocked, true, "preflight keeps public hosting blocked");
  assertEqual(
    preflight.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPersistencePreflightTruth,
    "recomputed_from_trusted_retry_control_work_item_closure_audit_record_persistence_and_supplied_audit_record_no_new_retry",
    "preflight truth is explicit",
  );
  assertEqual(
    preflight.workItemClosureAuditRecord?.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordId,
    auditRecord.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordId,
    "preflight returns expected persisted audit record truth",
  );
  assert(!containsPhase206ForbiddenTruth(preflight), "trusted audit record persistence preflight leaks no raw truth");
}

async function verifyTamperedAuditRecordPersistencePreflightRejects(): Promise<void> {
  section("2. Tampered Retry-Control Work-Item Closure Audit Record Persistence Preflight Rejects Current Truth Mismatch");
  const { fixture, persistedRecord, persistedClosure, planResult, auditRecord } =
    await trustedAuditRecordFixture("phase206_tampered");
  const tampered = {
    ...auditRecord,
    hostReportedDeliveredCount: Math.max(0, auditRecord.hostReportedDeliveredCount - 1),
  };

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPersistence({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: persistedClosure,
      workItemClosureAuditRecordPlan: planResult.workItemClosureAuditRecordPlan,
      workItemClosureAuditRecord: tampered,
    });

  assertEqual(preflight.accepted, false, "tampered audit record persistence preflight is rejected");
  assertEqual(
    preflight.reasonCode,
    "external_media_transfer_manual_retry_control_work_item_closure_audit_record_persistence_current_truth_mismatch",
    "tampered rejection is bounded",
  );
  assertEqual(preflight.hostReportedDeliveredCountMatched, false, "tampered delivered count mismatch is surfaced");
  assertEqual(preflight.workItemClosureAuditRecordPersistenceStillTrusted, false, "tampered copied object is not trusted");
  assertEqual(preflight.retryWorkerCreated, false, "tampered preflight creates no retry worker");
  assertEqual(preflight.defaultLiveDeliveryEnabled, false, "tampered preflight enables no default live delivery");
  assert(!containsPhase206ForbiddenTruth(preflight), "tampered audit record persistence preflight leaks no raw truth");
}

async function verifyCopiedAuditRecordPersistencePreflightRejects(): Promise<void> {
  section("3. Copied Retry-Control Work-Item Closure Audit Record Persistence Preflight Rejects Untrusted Object");
  const { fixture, persistedRecord, persistedClosure, planResult, auditRecord } =
    await trustedAuditRecordFixture("phase206_copied");
  const copied = JSON.parse(JSON.stringify(auditRecord));

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPersistence({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: persistedClosure,
      workItemClosureAuditRecordPlan: planResult.workItemClosureAuditRecordPlan,
      workItemClosureAuditRecord: copied,
    });

  assertEqual(preflight.accepted, false, "copied audit record persistence preflight is rejected");
  assertEqual(
    preflight.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_audit_record_persistence_required",
    "untrusted copy rejection is bounded",
  );
  assertEqual(preflight.workItemClosureAuditRecordPersistenceStillTrusted, false, "copied audit record is not trusted");
  assertEqual(preflight.workItemClosureAuditRecordIdMatched, true, "copied audit record can match truth but still fail trust");
  assertEqual(preflight.retryWorkerCreated, false, "copied preflight creates no retry worker");
  assertEqual(preflight.automaticVendorRetryAllowed, false, "copied preflight allows no automatic vendor retry");
  assert(!containsPhase206ForbiddenTruth(preflight), "copied audit record persistence preflight leaks no raw truth");
}

async function verifyAppendFailedAuditRecordPersistencePreflightRejects(): Promise<void> {
  section("4. Append-Failed Retry-Control Work-Item Closure Audit Record Persistence Preflight Rejects Untrusted Pending Object");
  const { fixture, persistedRecord, persistedClosure } = await persistedClosureFixture("phase206_append_failed");
  const planResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlan({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: persistedClosure,
    });
  assertEqual(planResult.accepted, true, "fixture audit record plan is accepted before append failure");
  let captured:
    | ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecord
    | undefined;
  const failingStore: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPersistenceStore = {
    appendAuditRecords: async (records) => {
      captured = records[0];
      throw new Error("append failed after audit record construction");
    },
    loadAuditRecords: async () => [],
  };
  const appendFailure =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecord({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: persistedClosure,
      workItemClosureAuditRecordPlan: planResult.workItemClosureAuditRecordPlan,
      auditRecordStore: failingStore,
      persistedAt: "2026-05-09T07:03:09.000Z",
      persistedBy: "operator",
    });
  assertEqual(appendFailure.accepted, false, "fixture append failure is rejected");
  assert(Boolean(captured), "append failure captures constructed pending audit record");

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPersistence({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: persistedClosure,
      workItemClosureAuditRecordPlan: planResult.workItemClosureAuditRecordPlan,
      workItemClosureAuditRecord: captured,
    });

  assertEqual(preflight.accepted, false, "append-failed audit record persistence preflight is rejected");
  assertEqual(
    preflight.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_audit_record_persistence_required",
    "append-failed object rejection is bounded by trust gate",
  );
  assertEqual(preflight.workItemClosureAuditRecordPersistenceStillTrusted, false, "append-failed pending audit record is not trusted");
  assertEqual(preflight.workItemClosureAuditRecordIdMatched, true, "append-failed object can match truth but still fail trust");
  assertEqual(preflight.retryScheduleCreated, false, "append-failed preflight creates no retry schedule");
  assertEqual(preflight.defaultLiveDeliveryEnabled, false, "append-failed preflight enables no default live delivery");
  assert(!containsPhase206ForbiddenTruth([appendFailure, preflight]), "append-failed audit record persistence preflight leaks no raw truth");
}

async function verifyContaminatedAuditRecordPersistencePreflightRejects(): Promise<void> {
  section("5. Contaminated Retry-Control Work-Item Closure Audit Record Persistence Preflight Rejects Unsafe Flags");
  const { fixture, persistedRecord, persistedClosure, planResult, auditRecord } =
    await trustedAuditRecordFixture("phase206_contaminated");
  const contaminated = {
    ...auditRecord,
    retryWorkerCreated: true,
  };

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPersistence({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: persistedClosure,
      workItemClosureAuditRecordPlan: planResult.workItemClosureAuditRecordPlan,
      workItemClosureAuditRecord: contaminated,
    });

  assertEqual(preflight.accepted, false, "contaminated audit record persistence preflight is rejected");
  assertEqual(
    preflight.reasonCode,
    "valid_external_media_transfer_manual_retry_control_work_item_closure_audit_record_persistence_required",
    "contaminated rejection is bounded",
  );
  assertEqual(preflight.durableRetryAuditStillBlocked, true, "contaminated preflight keeps new durable audit blocked");
  assertEqual(preflight.retryWorkerStillBlocked, false, "contaminated retry-worker claim is surfaced");
  assertEqual(preflight.retryWorkerCreated, false, "contaminated preflight creates no retry worker");
  assertEqual(preflight.defaultLiveDeliveryEnabled, false, "contaminated preflight enables no default live delivery");
  assert(!containsPhase206ForbiddenTruth(preflight), "contaminated audit record persistence preflight leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 206 Verification (Retry-Control Work-Item Closure Audit Record Persistence Preflight)\n");
  await verifyTrustedAuditRecordPersistencePreflight();
  await verifyTamperedAuditRecordPersistencePreflightRejects();
  await verifyCopiedAuditRecordPersistencePreflightRejects();
  await verifyAppendFailedAuditRecordPersistencePreflightRejects();
  await verifyContaminatedAuditRecordPersistencePreflightRejects();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 206: retry-control work-item closure audit record persistence preflight is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
