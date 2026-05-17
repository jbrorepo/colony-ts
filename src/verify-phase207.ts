/** Phase 207 Verification - Retry-Control Work-Item Closure Retry-Ledger Entry Plan */

import { mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseout,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPlan,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPlan,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryPlan,
  JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordStore,
  JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordStore,
  JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureStore,
  persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord,
  persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosure,
  persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecord,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPersistence,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecordPersistence,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPersistencePreflightResult,
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

export function containsPhase207ForbiddenTruth(value: unknown): boolean {
  if (containsForbiddenTruth(value)) return true;
  const serialized = JSON.stringify(value);
  if (!serialized) return false;
  return ["artifact:phase207", "phase207_", "phase-207-media", "Phase 207 media"].some((marker) =>
    serialized.includes(marker),
  );
}

function fileRefs(prefix = "phase207_media", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-207-media-${index}.pdf`,
    title: `Phase 207 media ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 12288 + index,
    checksumSha256: `${(index + 12).toString(16)}`.repeat(64),
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
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase207-closeout-record-")),
  });
}

async function createWorkItemClosureStore(): Promise<JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureStore> {
  return new JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureStore({
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase207-work-item-closure-")),
  });
}

async function createAuditRecordStore(): Promise<JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordStore> {
  return new JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordStore({
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase207-audit-record-")),
  });
}

async function persistedRecordFixture(prefix: string) {
  const fixture = await recordPlanFixture(prefix);
  const persisted =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptCloseoutRecord({
      ...fixture,
      closeoutRecordStore: await createCloseoutRecordStore(),
      persistedAt: "2026-05-09T07:31:09.000Z",
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
      closedAt: "2026-05-09T07:31:10.000Z",
      closedBy: "operator",
      persistedAt: "2026-05-09T07:31:11.000Z",
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

export async function trustedAuditRecordPersistencePreflightFixture(
  prefix: string,
): Promise<ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPersistencePreflightResult> {
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
      persistedAt: "2026-05-09T07:31:12.000Z",
      persistedBy: "operator",
    });
  assertEqual(persistedAuditRecord.accepted, true, "fixture audit record is persisted");
  assert(Boolean(persistedAuditRecord.workItemClosureAuditRecord), "fixture persisted audit record is returned");

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordPersistence({
      ...fixture,
      retryControlWorkerInvocationExecutionReceiptCloseoutRecord: persistedRecord,
      retryControlWorkerInvocationExecutionReceiptWorkItemClosure: persistedClosure,
      workItemClosureAuditRecordPlan: planResult.workItemClosureAuditRecordPlan,
      workItemClosureAuditRecord: persistedAuditRecord.workItemClosureAuditRecord,
    });
  assertEqual(preflight.accepted, true, "fixture audit record persistence preflight is accepted");
  assert(Boolean(preflight.workItemClosureAuditRecord), "fixture audit record persistence preflight returns trusted record");
  return preflight;
}

async function verifyTrustedPreflightCreatesRetryLedgerEntryPlan(): Promise<void> {
  section("1. Trusted Audit-Record Persistence Preflight Creates Retry-Ledger Entry Plan");
  const preflight = await trustedAuditRecordPersistencePreflightFixture("phase207_trusted");

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryPlan({
      workItemClosureAuditRecordPersistencePreflight: preflight,
    });
  const repeated =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryPlan({
      workItemClosureAuditRecordPersistencePreflight: preflight,
    });

  assertEqual(result.accepted, true, "trusted preflight-bound retry-ledger entry plan is accepted");
  assert(Boolean(result.retryLedgerEntryPlan), "trusted preflight returns retry-ledger entry plan");
  assertEqual(result.workItemClosureAuditRecordPersistencePreflightAccepted, true, "plan requires accepted persistence preflight");
  assertEqual(result.workItemClosureAuditRecordPersistenceStillTrusted, true, "plan requires trusted persisted audit record");
  assertEqual(result.retryLedgerReady, true, "retry-ledger entry plan is ready");
  assertEqual(result.retryLedgerCreated, false, "retry-ledger entry plan creates no new ledger");
  assertEqual(result.retryWorkerCreated, false, "retry-ledger entry plan creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "retry-ledger entry plan creates no retry schedule");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "retry-ledger entry plan enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "retry-ledger entry plan enables no public hosting");
  assertEqual(result.credentialPersistenceCreated, false, "retry-ledger entry plan persists no credentials");
  assertEqual(result.automaticVendorRetryAllowed, false, "retry-ledger entry plan allows no automatic vendor retry");
  assertEqual(
    result.retryLedgerEntryPlan?.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordId,
    preflight.workItemClosureAuditRecord?.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureAuditRecordId,
    "plan binds trusted audit record id",
  );
  assertEqual(
    result.retryLedgerEntryPlan?.manualRetryLedgerEntryId,
    preflight.workItemClosureAuditRecord?.manualRetryLedgerEntryId,
    "plan preserves existing retry-ledger entry id",
  );
  assertEqual(
    result.retryLedgerEntryPlanId,
    repeated.retryLedgerEntryPlanId,
    "retry-ledger entry plan id is deterministic",
  );
  assertEqual(
    result.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryPlanTruth,
    "trusted_retry_control_work_item_closure_audit_record_persistence_preflight_bound_retry_ledger_entry_plan_no_new_ledger",
    "retry-ledger entry plan truth is explicit",
  );
  assert(!containsPhase207ForbiddenTruth(result), "trusted retry-ledger entry plan leaks no raw truth");
}

async function verifyCopiedPreflightRejects(): Promise<void> {
  section("2. Copied Audit-Record Persistence Preflight Rejects Untrusted Object");
  const preflight = await trustedAuditRecordPersistencePreflightFixture("phase207_copied");
  const copied = JSON.parse(JSON.stringify(preflight));
  const shallowCopied = { ...preflight };

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryPlan({
      workItemClosureAuditRecordPersistencePreflight: copied,
    });
  const shallowResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryPlan({
      workItemClosureAuditRecordPersistencePreflight: shallowCopied,
    });

  assertEqual(result.accepted, false, "copied preflight-bound retry-ledger entry plan is rejected");
  assertEqual(
    result.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_audit_record_persistence_preflight_required",
    "copied preflight rejection is bounded by trust gate",
  );
  assertEqual(result.workItemClosureAuditRecordPersistenceStillTrusted, false, "copied preflight is not trusted");
  assertEqual(result.retryLedgerCreated, false, "copied preflight creates no retry ledger");
  assertEqual(result.retryWorkerCreated, false, "copied preflight creates no retry worker");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "copied preflight enables no default live delivery");
  assert(!containsPhase207ForbiddenTruth(result), "copied preflight rejection leaks no raw truth");
  assertEqual(shallowResult.accepted, false, "shallow-copied preflight envelope is rejected");
  assertEqual(
    shallowResult.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_audit_record_persistence_preflight_required",
    "shallow copy rejection is bounded by preflight identity trust gate",
  );
  assertEqual(
    shallowResult.workItemClosureAuditRecordPersistenceStillTrusted,
    true,
    "shallow copy can retain trusted audit record while failing preflight trust",
  );
  assertEqual(shallowResult.retryLedgerCreated, false, "shallow copy creates no retry ledger");
  assert(!containsPhase207ForbiddenTruth(shallowResult), "shallow-copy preflight rejection leaks no raw truth");
}

async function verifyContaminatedPreflightRejects(): Promise<void> {
  section("3. Contaminated Audit-Record Persistence Preflight Rejects Unsafe Flags");
  const preflight = await trustedAuditRecordPersistencePreflightFixture("phase207_contaminated");
  const contaminated = {
    ...preflight,
    retryWorkerCreated: true,
    leakedCredential: "sk-phase207-forbidden-credential",
    privateFileUrl: "https://private.example.invalid/phase207?token=secret",
    localPath: "C:\\Users\\operator\\phase207-secret.txt",
  };

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryPlan({
      workItemClosureAuditRecordPersistencePreflight: contaminated,
    });

  assertEqual(result.accepted, false, "contaminated preflight-bound retry-ledger entry plan is rejected");
  assertEqual(
    result.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_audit_record_persistence_preflight_required",
    "contaminated rejection is bounded by preflight identity trust",
  );
  assertEqual(
    result.workItemClosureAuditRecordPersistenceStillTrusted,
    true,
    "contaminated shallow preflight can retain trusted audit record while failing preflight trust",
  );
  assertEqual(result.retryWorkerStillBlocked, false, "contaminated retry-worker claim is surfaced");
  assertEqual(result.retryWorkerCreated, false, "contaminated result creates no retry worker");
  assertEqual(result.retryLedgerCreated, false, "contaminated result creates no retry ledger");
  assert(!containsPhase207ForbiddenTruth(result), "contaminated preflight rejection leaks no raw truth");
}

async function verifyTrustedPreflightNestedMutationIsBlocked(): Promise<void> {
  section("4. Trusted Preflight Nested Mutation Is Blocked Before Planning");
  const preflight = await trustedAuditRecordPersistencePreflightFixture("phase207_nested_contamination");
  let mutationBlocked = false;
  try {
    (preflight.workItemClosureAuditRecordPlanPreflight as unknown as Record<string, unknown>).leakedCredential =
      "sk-phase207-nested-forbidden";
  } catch {
    mutationBlocked = true;
  }

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryPlan({
      workItemClosureAuditRecordPersistencePreflight: preflight,
    });

  assert(
    mutationBlocked ||
      !("leakedCredential" in (preflight.workItemClosureAuditRecordPlanPreflight as unknown as Record<string, unknown>)),
    "trusted nested preflight object cannot be contaminated",
  );
  assertEqual(result.accepted, true, "nested-mutation-blocked trusted preflight still plans");
  assertEqual(result.retryLedgerCreated, false, "nested-mutation-blocked plan creates no retry ledger");
  assertEqual(result.retryWorkerCreated, false, "nested-mutation-blocked plan creates no retry worker");
  assert(!containsPhase207ForbiddenTruth(result), "nested-mutation-blocked result leaks no raw truth");
}

async function verifyTamperedPreflightAuditRecordRejects(): Promise<void> {
  section("5. Tampered Preflight Audit Record Rejects Untrusted Envelope");
  const preflight = await trustedAuditRecordPersistencePreflightFixture("phase207_mutated");
  assert(preflight.workItemClosureAuditRecord !== undefined, "fixture exposes trusted audit record before mutation");
  const tamperedRecord = JSON.parse(JSON.stringify(preflight.workItemClosureAuditRecord));
  tamperedRecord.hostReportedDeliveredCount = Math.max(0, tamperedRecord.hostReportedDeliveredCount - 1);
  const tamperedPreflight = {
    ...preflight,
    workItemClosureAuditRecord: tamperedRecord,
  };

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryPlan({
      workItemClosureAuditRecordPersistencePreflight: tamperedPreflight,
    });

  assertEqual(result.accepted, false, "tampered preflight audit record plan is rejected");
  assertEqual(
    result.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_audit_record_persistence_preflight_required",
    "tampered preflight audit record rejection is bounded by preflight identity trust",
  );
  assertEqual(result.workItemClosureAuditRecordPersistenceStillTrusted, false, "tampered preflight audit record is not trusted");
  assertEqual(result.retryLedgerCreated, false, "tampered preflight creates no retry ledger");
  assertEqual(result.retryScheduleCreated, false, "tampered preflight creates no retry schedule");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "tampered preflight enables no default live delivery");
  assert(!containsPhase207ForbiddenTruth(result), "tampered preflight audit record rejection leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 207 Verification (Retry-Control Work-Item Closure Retry-Ledger Entry Plan)\n");
  await verifyTrustedPreflightCreatesRetryLedgerEntryPlan();
  await verifyCopiedPreflightRejects();
  await verifyContaminatedPreflightRejects();
  await verifyTrustedPreflightNestedMutationIsBlocked();
  await verifyTamperedPreflightAuditRecordRejects();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 207: retry-control work-item closure retry-ledger entry plan is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
