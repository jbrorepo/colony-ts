/** Phase 204 Verification - Retry-Control Work-Item Closure Audit Record Plan Preflight */

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
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlan,
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

function containsPhase204ForbiddenTruth(value: unknown): boolean {
  if (containsForbiddenTruth(value)) return true;
  const serialized = JSON.stringify(value);
  if (!serialized) return false;
  return ["artifact:phase204", "phase204_", "phase-204-media", "Phase 204 media"].some((marker) =>
    serialized.includes(marker),
  );
}

function fileRefs(prefix = "phase204_media", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-204-media-${index}.pdf`,
    title: `Phase 204 media ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 9216 + index,
    checksumSha256: `${(index + 9).toString(16)}`.repeat(64),
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
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase204-closeout-record-")),
  });
}

async function createWorkItemClosureStore(): Promise<JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureStore> {
  return new JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureStore({
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase204-work-item-closure-")),
  });
}

async function persistedRecordFixture(prefix: string, overrides: Partial<ExternalChannelMediaTransferCandidate> = {}) {
  const fixture = await recordPlanFixture(prefix, overrides);
  const persisted =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord({
      ...fixture,
      closeoutRecordStore: await createCloseoutRecordStore(),
      persistedAt: "2026-05-09T06:16:09.000Z",
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
      closedAt: "2026-05-09T06:16:10.000Z",
      closedBy: "operator",
      persistedAt: "2026-05-09T06:16:11.000Z",
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

async function verifyCurrentAuditRecordPlanPreflightIsAccepted(): Promise<void> {
  section("1. Current Retry-Control Work-Item Closure Audit Record Plan Preflight Is Accepted");
  const { fixture, persistedRecord, persistedClosure, planResult } = await trustedPlanFixture("phase204_current");

  const result =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlan({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: persistedClosure,
      workItemClosureAuditRecordPlan: planResult.workItemClosureAuditRecordPlan,
    });

  assertEqual(result.accepted, true, "current retry-control audit plan preflight is accepted");
  assertEqual(result.workItemClosureAuditRecordPlanResult.accepted, true, "preflight recomputes current audit-plan truth");
  assertEqual(
    result.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlanIdMatched,
    true,
    "preflight matches audit plan id",
  );
  assertEqual(result.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosurePersistenceIdMatched, true, "preflight matches closure persistence id");
  assertEqual(result.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureIdMatched, true, "preflight matches closure id");
  assertEqual(result.closeoutRecordPersistenceIdMatched, true, "preflight matches closeout record persistence id");
  assertEqual(result.retryControlWorkerInvocationExecutionReceiptCloseoutRecordIdMatched, true, "preflight matches closeout record id");
  assertEqual(result.retryControlWorkerInvocationExecutionReceiptIdMatched, true, "preflight matches execution receipt id");
  assertEqual(result.retryControlWorkerInvocationHandoffIdMatched, true, "preflight matches invocation handoff id");
  assertEqual(result.retryControlWorkerHandlerReadinessIdMatched, true, "preflight matches handler readiness id");
  assertEqual(result.retryControlWorkerSelectionIdMatched, true, "preflight matches worker selection id");
  assertEqual(result.retryControlOperatorHandoffIdMatched, true, "preflight matches operator handoff id");
  assertEqual(result.manualRetryControlReadinessPlanIdMatched, true, "preflight matches readiness plan id");
  assertEqual(result.manualRetryLedgerEntryIdMatched, true, "preflight matches retry ledger entry id");
  assertEqual(result.workItemCorrelationMatched, true, "preflight matches work-item correlation");
  assertEqual(result.transferKeyMatched, true, "preflight matches transfer key");
  assertEqual(result.sourceRefFingerprintsMatched, true, "preflight matches source fingerprints");
  assertEqual(result.targetCorrelationMatched, true, "preflight matches target fingerprint");
  assertEqual(result.hostReportedDeliveredCountMatched, true, "preflight matches delivered count");
  assertEqual(result.hostReceiptMetadataIncludedMatched, true, "preflight matches receipt metadata");
  assertEqual(result.vendorStateVerifiedMatched, true, "preflight matches vendor-state truth");
  assertEqual(result.closedAtMatched, true, "preflight matches closed-at provenance");
  assertEqual(result.persistedAtMatched, true, "preflight matches persisted-at provenance");
  assertEqual(result.closurePersistencePreflightAccepted, true, "preflight requires accepted closure-persistence preflight");
  assertEqual(result.durableRetryAuditRecordReady, true, "preflight marks redacted durable-audit inputs ready");
  assertEqual(result.durableRetryAuditRecordCreated, false, "preflight creates no durable audit record");
  assertEqual(result.retryLedgerCreated, false, "preflight creates no retry ledger");
  assertEqual(result.retryLedgerEntryAlreadyPersisted, true, "preflight preserves existing retry ledger entry");
  assertEqual(result.retryWorkerCreated, false, "preflight creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "preflight creates no retry schedule");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "preflight enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "preflight enables no public hosting");
  assertEqual(result.retryLedgerStillBlocked, true, "preflight keeps retry ledger creation blocked");
  assertEqual(result.durableRetryAuditStillBlocked, true, "preflight keeps durable audit creation blocked");
  assertEqual(
    result.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlanPreflightTruth,
    "recomputed_from_trusted_retry_control_closure_persistence_preflight_and_supplied_audit_record_plan_no_persistence",
    "preflight truth is explicit",
  );
  assertEqual(
    result.workItemClosureAuditRecordPlan?.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlanId,
    planResult.workItemClosureAuditRecordPlan?.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlanId,
    "preflight returns expected audit plan truth",
  );
  assert(!containsPhase204ForbiddenTruth(result), "accepted preflight leaks no raw truth");
}

async function verifyMismatchedAuditRecordPlanPreflightIsRejected(): Promise<void> {
  section("2. Mismatched Retry-Control Work-Item Closure Audit Record Plan Preflight Is Rejected");
  const { fixture, persistedRecord, persistedClosure } = await trustedPlanFixture("phase204_original");
  const other = await trustedPlanFixture("phase204_other", {
    targetId: "C204OTHER",
    threadId: "171000.2040",
  });

  const result =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlan({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: persistedClosure,
      workItemClosureAuditRecordPlan: other.planResult.workItemClosureAuditRecordPlan,
    });

  assertEqual(result.accepted, false, "mismatched audit record plan preflight is rejected");
  assertEqual(
    result.reasonCode,
    "external_media_transfer_manual_retry_control_work_item_closure_audit_record_plan_current_truth_mismatch",
    "mismatched audit-plan rejection is bounded",
  );
  assertEqual(result.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlanIdMatched, false, "preflight reports audit plan id mismatch");
  assertEqual(result.closeoutRecordPersistenceIdMatched, false, "preflight reports closeout persistence mismatch");
  assertEqual(result.transferKeyMatched, false, "preflight reports transfer-key mismatch");
  assertEqual(result.sourceRefFingerprintsMatched, false, "preflight reports source fingerprint mismatch");
  assertEqual(result.targetCorrelationMatched, false, "preflight reports target fingerprint mismatch");
  assertEqual(result.workItemClosureAuditRecordPlan, undefined, "mismatched preflight returns no trusted audit plan");
  assertEqual(result.workItemClosureAuditRecordPlanResult.accepted, false, "mismatched preflight returns no nested accepted audit plan");
  assertEqual(result.workItemClosureAuditRecordPlanResult.workItemClosureAuditRecordPlan, undefined, "mismatched preflight omits nested recomputed audit plan");
  assertEqual(result.durableRetryAuditRecordReady, false, "mismatched plan does not mark durable audit inputs ready");
  assertEqual(result.retryLedgerStillBlocked, true, "mismatched preflight creates no retry ledger");
  assertEqual(result.defaultLiveDeliveryStillBlocked, true, "mismatched preflight enables no default live delivery");
  assert(!containsPhase204ForbiddenTruth(result), "mismatched preflight leaks no raw truth");
}

async function verifyCopiedClosurePersistencePreflightIsRejected(): Promise<void> {
  section("3. Copied Retry-Control Work-Item Closure Persistence Blocks Audit Record Plan Preflight");
  const { fixture, persistedRecord, persistedClosure, planResult } = await trustedPlanFixture("phase204_copied");

  const result =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlan({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: JSON.parse(JSON.stringify(persistedClosure)),
      workItemClosureAuditRecordPlan: planResult.workItemClosureAuditRecordPlan,
    });

  assertEqual(result.accepted, false, "copied closure persistence blocks audit-plan preflight");
  assertEqual(
    result.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_persistence_required",
    "copied closure audit-plan preflight rejection is bounded",
  );
  assertEqual(result.workItemClosureAuditRecordPlan, undefined, "copied closure rejection returns no audit plan");
  assertEqual(result.workItemClosureAuditRecordPlanResult.accepted, false, "copied closure rejects recomputed audit plan");
  assertEqual(result.durableRetryAuditRecordReady, false, "copied closure preflight does not mark durable audit inputs ready");
  assertEqual(result.retryLedgerCreated, false, "copied closure preflight creates no retry ledger");
  assertEqual(result.publicHostingEnabled, false, "copied closure preflight enables no public hosting");
  assert(!containsPhase204ForbiddenTruth(result), "copied closure audit-plan preflight rejection leaks no raw truth");
}

async function verifyContaminatedAuditRecordPlanPreflightIsRejected(): Promise<void> {
  section("4. Contaminated Retry-Control Work-Item Closure Audit Record Plan Preflight Is Rejected");
  const { fixture, persistedRecord, persistedClosure, planResult } = await trustedPlanFixture("phase204_contaminated");

  const result =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlan({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: persistedClosure,
      workItemClosureAuditRecordPlan: {
        ...planResult.workItemClosureAuditRecordPlan,
        credentialValue: "xoxb-real-credential-value",
        retryLedgerCreated: true,
        durableRetryAuditRecordCreated: true,
      },
    });

  assertEqual(result.accepted, false, "contaminated audit record plan preflight is rejected");
  assertEqual(
    result.reasonCode,
    "valid_external_media_transfer_manual_retry_control_work_item_closure_audit_record_plan_required",
    "contaminated audit-plan rejection is bounded",
  );
  assertEqual(result.workItemClosureAuditRecordPlan, undefined, "contaminated preflight returns no audit plan");
  assertEqual(result.workItemClosureAuditRecordPlanResult.accepted, false, "contaminated preflight returns no nested accepted audit plan");
  assertEqual(result.workItemClosureAuditRecordPlanResult.workItemClosureAuditRecordPlan, undefined, "contaminated preflight omits nested recomputed audit plan");
  assertEqual(result.retryLedgerStillBlocked, false, "contaminated retry-ledger claim is exposed as not trusted");
  assertEqual(result.durableRetryAuditStillBlocked, false, "contaminated durable-audit claim is exposed as not trusted");
  assertEqual(result.retryWorkerCreated, false, "contaminated preflight creates no retry worker");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "contaminated preflight enables no default live delivery");
  assert(!containsPhase204ForbiddenTruth(result), "contaminated audit record plan preflight leaks no raw truth");
}

async function verifyMalformedAuditRecordPlanPreflightIsRejected(): Promise<void> {
  section("5. Malformed Retry-Control Work-Item Closure Audit Record Plan Preflight Is Rejected");
  const { fixture, persistedRecord, persistedClosure, planResult } = await trustedPlanFixture("phase204_malformed");

  const result =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlan({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: persistedClosure,
      workItemClosureAuditRecordPlan: {
        ...planResult.workItemClosureAuditRecordPlan,
        persistedAt: "not-a-date",
      },
    });

  assertEqual(result.accepted, false, "malformed audit record plan preflight is rejected");
  assertEqual(
    result.reasonCode,
    "valid_external_media_transfer_manual_retry_control_work_item_closure_audit_record_plan_required",
    "malformed audit-plan rejection is bounded",
  );
  assertEqual(result.workItemClosureAuditRecordPlan, undefined, "malformed preflight returns no audit plan");
  assertEqual(result.durableRetryAuditRecordReady, false, "malformed preflight does not mark durable audit inputs ready");
  assertEqual(result.retryWorkerCreated, false, "malformed preflight creates no retry worker");
  assertEqual(result.publicHostingEnabled, false, "malformed preflight enables no public hosting");
  assert(!containsPhase204ForbiddenTruth(result), "malformed audit record plan preflight leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 204 Verification (Retry-Control Work-Item Closure Audit Record Plan Preflight)\n");
  await verifyCurrentAuditRecordPlanPreflightIsAccepted();
  await verifyMismatchedAuditRecordPlanPreflightIsRejected();
  await verifyCopiedClosurePersistencePreflightIsRejected();
  await verifyContaminatedAuditRecordPlanPreflightIsRejected();
  await verifyMalformedAuditRecordPlanPreflightIsRejected();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 204: retry-control work-item closure audit record plan preflight is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
