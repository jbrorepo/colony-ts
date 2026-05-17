/** Phase 203 Verification - Retry-Control Work-Item Closure Audit Record Plan */

import { mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlan,
  JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordStore,
  JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureStore,
  persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord,
  persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosure,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistence,
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

function containsPhase203ForbiddenTruth(value: unknown): boolean {
  if (containsForbiddenTruth(value)) {
    return true;
  }
  const serialized = JSON.stringify(value);
  if (!serialized) {
    return false;
  }
  return ["artifact:phase203", "phase203_", "phase-203-media", "Phase 203 media"].some((marker) =>
    serialized.includes(marker),
  );
}

function fileRefs(prefix = "phase203_media", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-203-media-${index}.pdf`,
    title: `Phase 203 media ${index}`,
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
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase203-closeout-record-")),
  });
}

async function createWorkItemClosureStore(): Promise<JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureStore> {
  return new JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureStore({
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase203-work-item-closure-")),
  });
}

async function persistedRecordFixture(prefix: string) {
  const fixture = await recordPlanFixture(prefix);
  const store = await createCloseoutRecordStore();
  const persisted =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord({
      ...fixture,
      closeoutRecordStore: store,
      persistedAt: "2026-05-09T05:55:05.000Z",
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
      closedAt: "2026-05-09T05:55:06.000Z",
      closedBy: "operator",
      persistedAt: "2026-05-09T05:55:07.000Z",
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

async function verifyTrustedClosurePersistencePlansAuditRecord(): Promise<void> {
  section("1. Trusted Retry-Control Work-Item Closure Persistence Plans Audit Record");
  const { fixture, persistedRecord, persistedClosure } = await persistedClosureFixture("phase203_trusted");

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlan({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: persistedClosure,
    });
  const repeated =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlan({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: persistedClosure,
    });

  assertEqual(result.accepted, true, "trusted work-item closure persistence can plan an audit record");
  assertEqual(result.workItemClosurePersistencePreflight.accepted, true, "audit plan is bound to accepted closure persistence preflight");
  assert(
    result.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlanId?.startsWith(
      "manual-retry-control-worker-invocation-execution-receipt-work-item-closure-audit-plan:",
    ) === true,
    "audit plan id is deterministic and domain separated",
  );
  assertEqual(
    repeated.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlanId,
    result.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlanId,
    "audit plan id is stable for repeated trusted input",
  );
  assertEqual(
    result.workItemClosureAuditRecordPlan?.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistenceId,
    persistedClosure.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistenceId,
    "audit plan binds closure persistence id",
  );
  assertEqual(
    result.workItemClosureAuditRecordPlan?.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureId,
    persistedClosure.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureId,
    "audit plan binds closure id",
  );
  assertEqual(
    result.workItemClosureAuditRecordPlan?.closeoutRecordPersistenceId,
    persistedClosure.closeoutRecordPersistenceId,
    "audit plan binds closeout persistence id",
  );
  assertEqual(result.workItemClosureAuditRecordPlan?.transferKey, persistedClosure.transferKey, "audit plan binds transfer key");
  assertEqual(
    result.workItemClosureAuditRecordPlan?.retryControlWorkerInvocationExecutionReceiptCloseoutRecordId,
    persistedClosure.retryControlWorkerInvocationExecutionReceiptCloseoutRecordId,
    "audit plan binds closeout record id",
  );
  assertEqual(
    result.workItemClosureAuditRecordPlan?.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlanId,
    persistedClosure.retryControlWorkerInvocationExecutionReceiptCloseoutRecordPlanId,
    "audit plan binds closeout record plan id",
  );
  assertEqual(
    result.workItemClosureAuditRecordPlan?.retryControlWorkerInvocationExecutionReceiptCloseoutId,
    persistedClosure.retryControlWorkerInvocationExecutionReceiptCloseoutId,
    "audit plan binds closeout id",
  );
  assertEqual(
    result.workItemClosureAuditRecordPlan?.retryControlWorkerInvocationExecutionReceiptId,
    persistedClosure.retryControlWorkerInvocationExecutionReceiptId,
    "audit plan binds execution receipt id",
  );
  assertEqual(
    result.workItemClosureAuditRecordPlan?.retryControlWorkerInvocationHandoffId,
    persistedClosure.retryControlWorkerInvocationHandoffId,
    "audit plan binds invocation handoff id",
  );
  assertEqual(
    result.workItemClosureAuditRecordPlan?.retryControlWorkerHandlerReadinessId,
    persistedClosure.retryControlWorkerHandlerReadinessId,
    "audit plan binds handler readiness id",
  );
  assertEqual(
    result.workItemClosureAuditRecordPlan?.retryControlWorkerSelectionId,
    persistedClosure.retryControlWorkerSelectionId,
    "audit plan binds worker selection id",
  );
  assertEqual(
    result.workItemClosureAuditRecordPlan?.retryControlOperatorHandoffId,
    persistedClosure.retryControlOperatorHandoffId,
    "audit plan binds operator handoff id",
  );
  assertEqual(
    result.workItemClosureAuditRecordPlan?.manualRetryControlReadinessPlanId,
    persistedClosure.manualRetryControlReadinessPlanId,
    "audit plan binds readiness plan id",
  );
  assertEqual(
    result.workItemClosureAuditRecordPlan?.manualRetryLedgerEntryId,
    persistedClosure.manualRetryLedgerEntryId,
    "audit plan binds retry ledger entry id",
  );
  assertEqual(result.workItemClosureAuditRecordPlan?.vendorStateVerified, persistedClosure.vendorStateVerified, "audit plan binds vendor-state truth");
  assertEqual(result.workItemClosureAuditRecordPlan?.closedAt, persistedClosure.closedAt, "audit plan binds closed-at provenance");
  assertEqual(result.workItemClosureAuditRecordPlan?.persistedAt, persistedClosure.persistedAt, "audit plan binds persisted-at provenance");
  assertEqual(
    result.workItemClosureAuditRecordPlan?.sourceRefFingerprints.length,
    persistedClosure.sourceRefFingerprints.length,
    "audit plan binds source fingerprint count",
  );
  assertEqual(result.manualRetryWorkItemClosedByColony, true, "audit plan preserves closure truth");
  assertEqual(result.workItemClosurePersisted, true, "audit plan requires closure persistence truth");
  assertEqual(result.closurePersistencePreflightAccepted, true, "audit plan requires closure persistence preflight");
  assertEqual(result.durableRetryAuditRecordReady, true, "audit plan marks redacted durable-audit inputs ready");
  assertEqual(result.durableRetryAuditRecordCreated, false, "audit plan does not create durable retry audit records");
  assertEqual(result.retryLedgerCreated, false, "audit plan creates no new retry ledger");
  assertEqual(result.retryLedgerEntryAlreadyPersisted, true, "audit plan preserves existing retry ledger entry");
  assertEqual(result.retryWorkerCreated, false, "audit plan creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "audit plan creates no retry schedule");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "audit plan enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "audit plan enables no public hosting");
  assertEqual(
    result.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlanTruth,
    "closure_persistence_preflight_bound_retry_control_worker_invocation_execution_receipt_work_item_closure_audit_record_plan_no_persistence",
    "audit plan truth is explicit",
  );
  assert(!containsPhase203ForbiddenTruth(result), "accepted audit plan leaks no raw truth");
}

async function verifyCopiedClosurePersistenceRejectsAuditPlan(): Promise<void> {
  section("2. Copied Retry-Control Work-Item Closure Persistence Rejects Audit Plan");
  const { fixture, persistedRecord, persistedClosure } = await persistedClosureFixture("phase203_copied");

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlan({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: JSON.parse(JSON.stringify(persistedClosure)),
    });

  assertEqual(result.accepted, false, "copied closure persistence cannot produce an audit plan");
  assertEqual(
    result.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_persistence_required",
    "copied closure audit-plan rejection is bounded",
  );
  assertEqual(result.workItemClosureAuditRecordPlan, undefined, "copied closure rejection returns no audit plan");
  assertEqual(result.durableRetryAuditRecordReady, false, "copied closure rejection does not mark audit inputs ready");
  assertEqual(result.retryLedgerCreated, false, "copied closure rejection creates no retry ledger");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "copied closure rejection enables no default live delivery");
  assert(!containsPhase203ForbiddenTruth(result), "copied closure audit-plan rejection leaks no raw truth");
}

async function verifyTamperedClosurePersistenceRejectsAuditPlan(): Promise<void> {
  section("3. Tampered Retry-Control Work-Item Closure Persistence Rejects Audit Plan");
  const { fixture, persistedRecord, persistedClosure } = await persistedClosureFixture("phase203_tampered");

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlan({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: {
        ...persistedClosure,
        hostReportedDeliveredCount: Math.max(0, persistedClosure.hostReportedDeliveredCount - 1),
      },
    });

  assertEqual(result.accepted, false, "tampered closure persistence cannot produce an audit plan");
  assertEqual(
    result.reasonCode,
    "external_media_transfer_manual_retry_control_work_item_closure_persistence_current_truth_mismatch",
    "tampered closure audit-plan rejection is bounded",
  );
  assertEqual(result.workItemClosurePersistencePreflight.accepted, false, "tampered rejection exposes failed preflight");
  assertEqual(result.durableRetryAuditRecordReady, false, "tampered closure rejection does not mark audit inputs ready");
  assertEqual(result.retryWorkerCreated, false, "tampered closure rejection creates no retry worker");
  assertEqual(result.publicHostingEnabled, false, "tampered closure rejection enables no public hosting");
  assert(!containsPhase203ForbiddenTruth(result), "tampered closure audit-plan rejection leaks no raw truth");
}

async function verifyContaminatedClosurePersistenceRejectsAuditPlan(): Promise<void> {
  section("4. Contaminated Retry-Control Work-Item Closure Persistence Rejects Audit Plan");
  const { fixture, persistedRecord, persistedClosure } = await persistedClosureFixture("phase203_contaminated");

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlan({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: {
        ...persistedClosure,
        retryWorkerCreated: true,
      },
    });

  assertEqual(result.accepted, false, "contaminated closure persistence cannot produce an audit plan");
  assertEqual(
    result.reasonCode,
    "valid_external_media_transfer_manual_retry_control_work_item_closure_persistence_required",
    "contaminated closure audit-plan rejection is bounded",
  );
  assertEqual(result.workItemClosureAuditRecordPlan, undefined, "contaminated closure rejection returns no audit plan");
  assertEqual(result.durableRetryAuditRecordReady, false, "contaminated closure rejection does not mark audit inputs ready");
  assertEqual(result.retryWorkerCreated, false, "contaminated closure rejection creates no retry worker");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "contaminated closure rejection enables no default live delivery");
  assert(!containsPhase203ForbiddenTruth(result), "contaminated closure audit-plan rejection leaks no raw truth");
}

async function verifyMalformedClosurePersistenceRejectsAuditPlan(): Promise<void> {
  section("5. Malformed Retry-Control Work-Item Closure Persistence Rejects Audit Plan");
  const { fixture, persistedRecord, persistedClosure } = await persistedClosureFixture("phase203_malformed");

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlan({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: {
        ...persistedClosure,
        closedAt: "not-a-date",
        retryWorkerCreated: true,
      },
    });

  assertEqual(result.accepted, false, "malformed closure persistence cannot produce an audit plan");
  assertEqual(
    result.reasonCode,
    "valid_external_media_transfer_manual_retry_control_work_item_closure_persistence_required",
    "malformed closure audit-plan rejection is bounded",
  );
  assertEqual(result.workItemClosureAuditRecordPlan, undefined, "malformed closure rejection returns no audit plan");
  assertEqual(result.durableRetryAuditRecordReady, false, "malformed closure rejection does not mark audit inputs ready");
  assertEqual(result.retryWorkerCreated, false, "malformed closure rejection creates no retry worker");
  assertEqual(result.publicHostingEnabled, false, "malformed closure rejection enables no public hosting");
  assert(!containsPhase203ForbiddenTruth(result), "malformed closure audit-plan rejection leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 203 Verification (Retry-Control Work-Item Closure Audit Record Plan)\n");
  await verifyTrustedClosurePersistencePlansAuditRecord();
  await verifyCopiedClosurePersistenceRejectsAuditPlan();
  await verifyTamperedClosurePersistenceRejectsAuditPlan();
  await verifyContaminatedClosurePersistenceRejectsAuditPlan();
  await verifyMalformedClosurePersistenceRejectsAuditPlan();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 203: retry-control work-item closure audit record plan is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
