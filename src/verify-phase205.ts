/** Phase 205 Verification - Retry-Control Work-Item Closure Audit Record Persistence */

import { mkdtemp, writeFile } from "fs/promises";
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

function containsPhase205ForbiddenTruth(value: unknown): boolean {
  if (containsForbiddenTruth(value)) return true;
  const serialized = JSON.stringify(value);
  if (!serialized) return false;
  return ["artifact:phase205", "phase205_", "phase-205-media", "Phase 205 media"].some((marker) =>
    serialized.includes(marker),
  );
}

function fileRefs(prefix = "phase205_media", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-205-media-${index}.pdf`,
    title: `Phase 205 media ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 10240 + index,
    checksumSha256: `${(index + 10).toString(16)}`.repeat(64),
  }));
}

async function recordPlanFixture(prefix: string, overrides: Partial<ExternalChannelMediaTransferCandidate> = {}) {
  const fixture = await invocationExecutionReceiptFixture({ fileRefs: fileRefs(prefix), ...overrides });
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
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase205-closeout-record-")),
  });
}

async function createWorkItemClosureStore(): Promise<JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureStore> {
  return new JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureStore({
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase205-work-item-closure-")),
  });
}

async function createAuditRecordStore(rootDir?: string): Promise<JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordStore> {
  return new JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordStore({
    rootDir: rootDir ?? (await mkdtemp(join(tmpdir(), "colony-phase205-audit-record-"))),
  });
}

async function persistedRecordFixture(prefix: string, overrides: Partial<ExternalChannelMediaTransferCandidate> = {}) {
  const fixture = await recordPlanFixture(prefix, overrides);
  const persisted =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord({
      ...fixture,
      closeoutRecordStore: await createCloseoutRecordStore(),
      persistedAt: "2026-05-09T06:37:28.000Z",
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

async function persistedClosureFixture(prefix: string, overrides: Partial<ExternalChannelMediaTransferCandidate> = {}) {
  const { fixture, persistedRecord } = await persistedRecordFixture(prefix, overrides);
  const persisted =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosure({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      workItemClosureStore: await createWorkItemClosureStore(),
      closedAt: "2026-05-09T06:37:29.000Z",
      closedBy: "operator",
      persistedAt: "2026-05-09T06:37:30.000Z",
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

async function trustedPlanFixture(prefix: string, overrides: Partial<ExternalChannelMediaTransferCandidate> = {}) {
  const { fixture, persistedRecord, persistedClosure } = await persistedClosureFixture(prefix, overrides);
  const planResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlan({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: persistedClosure,
    });
  assertEqual(planResult.accepted, true, "fixture audit record plan is accepted");
  assert(Boolean(planResult.workItemClosureAuditRecordPlan), "fixture audit record plan is returned");
  return { fixture, persistedRecord, persistedClosure, planResult };
}

async function verifyAuditRecordPersistenceIsAccepted(): Promise<void> {
  section("1. Retry-Control Work-Item Closure Audit Record Persistence Is Accepted");
  const rootDir = await mkdtemp(join(tmpdir(), "colony-phase205-audit-record-load-"));
  const auditRecordStore = await createAuditRecordStore(rootDir);
  const { fixture, persistedRecord, persistedClosure, planResult } = await trustedPlanFixture("phase205_current");

  const result =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecord({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: persistedClosure,
      workItemClosureAuditRecordPlan: planResult.workItemClosureAuditRecordPlan,
      auditRecordStore,
      persistedAt: "2026-05-09T06:37:31.000Z",
      persistedBy: "operator",
    });

  assertEqual(result.accepted, true, "audit record persistence is accepted");
  assertEqual(result.workItemClosureAuditRecordPlanPreflight.accepted, true, "persistence requires accepted audit-plan preflight");
  assert(Boolean(result.workItemClosureAuditRecord), "persistence returns audit record");
  assertEqual(result.auditRecordPlanPreflightAccepted, true, "result records plan-preflight acceptance");
  assertEqual(result.durableRetryAuditRecordReady, true, "result marks durable audit record ready");
  assertEqual(result.durableRetryAuditRecordCreated, true, "result persists durable audit record");
  assertEqual(result.retryLedgerCreated, false, "result creates no new retry ledger");
  assertEqual(result.retryWorkerCreated, false, "result creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "result creates no retry schedule");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "result enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "result enables no public hosting");
  assertEqual(
    result.workItemClosureAuditRecord?.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlanId,
    planResult.workItemClosureAuditRecordPlan?.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlanId,
    "audit record binds audit-plan id",
  );
  assertEqual(
    result.workItemClosureAuditRecord?.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistenceId,
    persistedClosure.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistenceId,
    "audit record binds closure persistence id",
  );
  assertEqual(
    result.workItemClosureAuditRecord?.auditRecordPersistedAt,
    "2026-05-09T06:37:31.000Z",
    "audit record stores persisted timestamp",
  );
  assertEqual(
    result.workItemClosureAuditRecord?.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordTruth,
    "audit_record_plan_preflight_bound_retry_control_work_item_closure_audit_record_persisted_no_new_retry",
    "audit record truth is explicit",
  );
  const loaded = await (await createAuditRecordStore(rootDir)).loadAuditRecords();
  assertEqual(loaded.length, 1, "append-only store loads one audit record");
  assertEqual(
    loaded[0]?.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordId,
    result.workItemClosureAuditRecord?.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordId,
    "loaded audit record id matches persisted result",
  );
  assert(!containsPhase205ForbiddenTruth(result), "accepted persistence leaks no raw truth");
  assert(!containsPhase205ForbiddenTruth(loaded), "loaded audit record leaks no raw truth");
}

async function verifyMissingAuditRecordStoreIsRejected(): Promise<void> {
  section("2. Missing Retry-Control Audit Record Store Is Rejected");
  const { fixture, persistedRecord, persistedClosure, planResult } = await trustedPlanFixture("phase205_missing_store");

  const result =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecord({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: persistedClosure,
      workItemClosureAuditRecordPlan: planResult.workItemClosureAuditRecordPlan,
      persistedAt: "2026-05-09T06:37:31.000Z",
      persistedBy: "operator",
    });

  assertEqual(result.accepted, false, "missing store rejects audit record persistence");
  assertEqual(
    result.reasonCode,
    "external_media_transfer_manual_retry_control_work_item_closure_audit_record_store_required",
    "missing store rejection is bounded",
  );
  assertEqual(
    result.workItemClosurePersisted,
    true,
    "missing store preserves accepted work-item closure persistence status",
  );
  assertEqual(
    result.closurePersistencePreflightAccepted,
    true,
    "missing store preserves accepted closure persistence preflight status",
  );
  assertEqual(
    result.auditRecordPlanPreflightAccepted,
    true,
    "missing store preserves accepted audit-record plan preflight status",
  );
  assertEqual(result.durableRetryAuditRecordReady, true, "missing store preserves audit-record readiness");
  assertEqual(result.workItemClosureAuditRecord, undefined, "missing store returns no audit record");
  assertEqual(result.durableRetryAuditRecordCreated, false, "missing store creates no durable audit record");
  assertEqual(result.retryLedgerCreated, false, "missing store creates no retry ledger");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "missing store enables no default live delivery");
  assert(!containsPhase205ForbiddenTruth(result), "missing store rejection leaks no raw truth");
}

class FailingAuditRecordStore implements ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPersistenceStore {
  async appendAuditRecords(): Promise<void> {
    throw new Error("disk full xoxb-phase205-secret");
  }

  async loadAuditRecords(): Promise<ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecord[]> {
    return [];
  }
}

async function verifyAppendFailureIsRejected(): Promise<void> {
  section("3. Retry-Control Audit Record Append Failure Is Rejected");
  const { fixture, persistedRecord, persistedClosure, planResult } = await trustedPlanFixture("phase205_append_failure");

  const result =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecord({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: persistedClosure,
      workItemClosureAuditRecordPlan: planResult.workItemClosureAuditRecordPlan,
      auditRecordStore: new FailingAuditRecordStore(),
      persistedAt: "2026-05-09T06:37:31.000Z",
      persistedBy: "operator",
    });

  assertEqual(result.accepted, false, "append failure rejects audit record persistence");
  assertEqual(
    result.reasonCode,
    "external_media_transfer_manual_retry_control_work_item_closure_audit_record_store_append_failed",
    "append failure rejection is bounded",
  );
  assertEqual(
    result.workItemClosurePersisted,
    true,
    "append failure preserves accepted work-item closure persistence status",
  );
  assertEqual(
    result.closurePersistencePreflightAccepted,
    true,
    "append failure preserves accepted closure persistence preflight status",
  );
  assertEqual(
    result.auditRecordPlanPreflightAccepted,
    true,
    "append failure preserves accepted audit-record plan preflight status",
  );
  assertEqual(result.durableRetryAuditRecordReady, true, "append failure preserves audit-record readiness");
  assertEqual(result.workItemClosureAuditRecord, undefined, "append failure returns no trusted audit record");
  assertEqual(result.durableRetryAuditRecordCreated, false, "append failure creates no durable audit record");
  assertEqual(result.retryWorkerCreated, false, "append failure creates no retry worker");
  assert(!containsPhase205ForbiddenTruth(result), "append failure rejection leaks no raw truth");
}

async function verifyCopiedClosurePersistencePreflightBlocksPersistence(): Promise<void> {
  section("4. Copied Retry-Control Closure Persistence Blocks Audit Record Persistence");
  const { fixture, persistedRecord, persistedClosure, planResult } = await trustedPlanFixture("phase205_copied");

  const result =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecord({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: JSON.parse(JSON.stringify(persistedClosure)),
      workItemClosureAuditRecordPlan: planResult.workItemClosureAuditRecordPlan,
      auditRecordStore: await createAuditRecordStore(),
      persistedAt: "2026-05-09T06:37:31.000Z",
      persistedBy: "operator",
    });

  assertEqual(result.accepted, false, "copied closure persistence rejects audit record persistence");
  assertEqual(
    result.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_persistence_required",
    "copied closure rejection is bounded",
  );
  assertEqual(result.workItemClosureAuditRecord, undefined, "copied closure returns no audit record");
  assertEqual(result.durableRetryAuditRecordReady, false, "copied closure does not mark audit inputs ready");
  assertEqual(result.retryLedgerCreated, false, "copied closure creates no retry ledger");
  assert(!containsPhase205ForbiddenTruth(result), "copied closure persistence rejection leaks no raw truth");
}

async function verifyTamperedAuditRecordJournalFailsClosed(): Promise<void> {
  section("5. Tampered Retry-Control Audit Record Journal Fails Closed");
  const rootDir = await mkdtemp(join(tmpdir(), "colony-phase205-tampered-audit-record-"));
  const auditRecordStore = await createAuditRecordStore(rootDir);
  const { fixture, persistedRecord, persistedClosure, planResult } = await trustedPlanFixture("phase205_tampered");

  const result =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecord({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: persistedClosure,
      workItemClosureAuditRecordPlan: planResult.workItemClosureAuditRecordPlan,
      auditRecordStore,
      persistedAt: "2026-05-09T06:37:31.000Z",
      persistedBy: "operator",
    });
  assertEqual(result.accepted, true, "fixture audit record persists before tamper");

  await writeFile(
    join(rootDir, "external-media-transfer-retry-control-work-item-closure-audit-records.jsonl"),
    `${JSON.stringify({ ...result.workItemClosureAuditRecord, retryWorkerCreated: true })}\n`,
    "utf8",
  );
  let rejected = false;
  try {
    await (await createAuditRecordStore(rootDir)).loadAuditRecords();
  } catch {
    rejected = true;
  }
  assertEqual(rejected, true, "tampered audit record journal fails closed");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 205 Verification (Retry-Control Work-Item Closure Audit Record Persistence)\n");
  await verifyAuditRecordPersistenceIsAccepted();
  await verifyMissingAuditRecordStoreIsRejected();
  await verifyAppendFailureIsRejected();
  await verifyCopiedClosurePersistencePreflightBlocksPersistence();
  await verifyTamperedAuditRecordJournalFailsClosed();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 205: retry-control work-item closure audit record persistence is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
