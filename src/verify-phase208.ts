/** Phase 208 Verification - Retry-Control Work-Item Closure Retry-Ledger Entry Persistence */

import { appendFile, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryPlan,
  JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryStore,
  persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntry,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryPlan,
} from "./channel";
import {
  containsPhase207ForbiddenTruth,
  trustedAuditRecordPersistencePreflightFixture,
} from "./verify-phase207";

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

export function containsPhase208ForbiddenTruth(value: unknown): boolean {
  if (containsPhase207ForbiddenTruth(value)) return true;
  const serialized = JSON.stringify(value);
  if (!serialized) return false;
  return ["artifact:phase208", "phase208_", "phase-208-media", "Phase 208 media"].some((marker) =>
    serialized.includes(marker),
  );
}

export async function createRetryLedgerEntryStore(): Promise<{
  rootDir: string;
  store:
    JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryStore;
}> {
  const rootDir = await mkdtemp(join(tmpdir(), "colony-phase208-retry-ledger-entry-"));
  return {
    rootDir,
    store:
      new JsonExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryStore({
        rootDir,
      }),
  };
}

export async function retryLedgerEntryPlanFixture(
  prefix: string,
): Promise<ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryPlan> {
  const preflight = await trustedAuditRecordPersistencePreflightFixture(prefix);
  const planResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryPlan({
      workItemClosureAuditRecordPersistencePreflight: preflight,
    });
  assertEqual(planResult.accepted, true, "fixture retry-ledger entry plan is accepted");
  assert(Boolean(planResult.retryLedgerEntryPlan), "fixture retry-ledger entry plan is returned");
  return planResult.retryLedgerEntryPlan!;
}

async function verifyTrustedPlanPersistsRetryLedgerEntry(): Promise<void> {
  section("1. Trusted Retry-Ledger Entry Plan Persists Append-Only Redacted Entry");
  const plan = await retryLedgerEntryPlanFixture("phase208_trusted");
  const { store } = await createRetryLedgerEntryStore();

  const result =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntry({
      retryLedgerEntryPlan: plan,
      retryLedgerStore: store,
      persistedAt: "2026-05-09T08:00:49.000Z",
      persistedBy: "operator",
    });
  const loaded = await store.loadRetryLedgerEntries();

  assertEqual(result.accepted, true, "trusted retry-ledger entry persistence is accepted");
  assert(Boolean(result.retryLedgerEntry), "persisted retry-ledger entry is returned");
  assertEqual(loaded.length, 1, "append-only retry-ledger entry store reloads one entry");
  assertEqual(
    loaded[0].manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryId,
    result.retryLedgerEntry?.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryId,
    "loaded retry-ledger entry preserves deterministic id",
  );
  assertEqual(
    result.retryLedgerEntry?.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryPlanId,
    plan.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryPlanId,
    "persisted retry-ledger entry binds plan id",
  );
  assertEqual(
    result.retryLedgerEntry?.manualRetryLedgerEntryId,
    plan.manualRetryLedgerEntryId,
    "persisted retry-ledger entry preserves existing retry-ledger id",
  );
  assertEqual(result.retryLedgerEntryPersisted, true, "retry-ledger entry persistence flag is true");
  assertEqual(result.retryLedgerCreated, true, "retry-ledger entry persistence creates only ledger-entry truth");
  assertEqual(
    result.retryControlWorkerInvocationExecutionReceiptPersisted,
    false,
    "retry-ledger entry persistence does not persist execution receipts",
  );
  assertEqual(result.backgroundRetryCreated, false, "retry-ledger entry persistence creates no background retry");
  assertEqual(result.retryWorkerCreated, false, "retry-ledger entry persistence creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "retry-ledger entry persistence creates no retry schedule");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "retry-ledger entry persistence enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "retry-ledger entry persistence enables no public hosting");
  assertEqual(result.credentialPersistenceCreated, false, "retry-ledger entry persistence persists no credentials");
  assertEqual(result.automaticVendorRetryAllowed, false, "retry-ledger entry persistence allows no automatic vendor retry");
  assertEqual(
    result.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryTruth,
    "trusted_retry_control_work_item_closure_retry_ledger_entry_plan_bound_retry_ledger_entry_persisted_no_worker_or_schedule",
    "retry-ledger entry persistence truth is explicit",
  );
  assert(!containsPhase208ForbiddenTruth(result), "persisted retry-ledger entry leaks no raw truth");
  assert(!containsPhase208ForbiddenTruth(loaded), "loaded retry-ledger entry leaks no raw truth");
}

async function verifyCopiedPlanRejects(): Promise<void> {
  section("2. Copied Retry-Ledger Entry Plan Rejects Untrusted Object");
  const plan = await retryLedgerEntryPlanFixture("phase208_copied");
  const copied = JSON.parse(JSON.stringify(plan));
  const { store } = await createRetryLedgerEntryStore();
  const result =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntry({
      retryLedgerEntryPlan: copied,
      retryLedgerStore: store,
      persistedAt: "2026-05-09T08:00:50.000Z",
      persistedBy: "operator",
    });

  assertEqual(result.accepted, false, "copied retry-ledger entry plan is rejected");
  assertEqual(
    result.reasonCode,
    "external_media_transfer_retry_control_work_item_closure_retry_ledger_entry_plan_untrusted",
    "copied plan rejection is bounded by trust gate",
  );
  assertEqual(result.retryLedgerEntryPersisted, false, "copied plan does not persist retry-ledger entry");
  assertEqual(result.retryLedgerCreated, false, "copied plan creates no retry ledger");
  assertEqual(result.retryWorkerCreated, false, "copied plan creates no retry worker");
  assert(!containsPhase208ForbiddenTruth(result), "copied plan rejection leaks no raw truth");
}

async function verifyMissingStoreRejects(): Promise<void> {
  section("3. Missing Retry-Ledger Store Rejects Without Side Effects");
  const plan = await retryLedgerEntryPlanFixture("phase208_missing_store");
  const result =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntry({
      retryLedgerEntryPlan: plan,
      persistedAt: "2026-05-09T08:00:51.000Z",
      persistedBy: "operator",
    });

  assertEqual(result.accepted, false, "missing retry-ledger store is rejected");
  assertEqual(
    result.reasonCode,
    "external_media_transfer_retry_control_work_item_closure_retry_ledger_entry_store_required",
    "missing store rejection is explicit",
  );
  assertEqual(result.retryLedgerEntryPersisted, false, "missing store does not persist retry-ledger entry");
  assertEqual(result.retryLedgerCreated, false, "missing store creates no retry ledger");
  assertEqual(result.retryWorkerCreated, false, "missing store creates no retry worker");
  assert(!containsPhase208ForbiddenTruth(result), "missing store rejection leaks no raw truth");
}

async function verifyAppendFailureRejectsAndDoesNotTrustPendingEntry(): Promise<void> {
  section("4. Append Failure Rejects And Does Not Trust Pending Entry");
  const plan = await retryLedgerEntryPlanFixture("phase208_append_failure");
  let capturedEntry: unknown;
  const failingStore = {
    async appendRetryLedgerEntries(entries: unknown[]): Promise<void> {
      capturedEntry = entries[0];
      throw new Error("simulated append failure");
    },
    async loadRetryLedgerEntries(): Promise<never[]> {
      return [];
    },
  };
  const { store } = await createRetryLedgerEntryStore();

  const result =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntry({
      retryLedgerEntryPlan: plan,
      retryLedgerStore: failingStore,
      persistedAt: "2026-05-09T08:00:52.000Z",
      persistedBy: "operator",
    });
  const replay =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntry({
      retryLedgerEntryPlan: JSON.parse(JSON.stringify(capturedEntry)),
      retryLedgerStore: store,
      persistedAt: "2026-05-09T08:00:53.000Z",
      persistedBy: "operator",
    });

  assertEqual(result.accepted, false, "append failure is rejected");
  assertEqual(
    result.reasonCode,
    "external_media_transfer_retry_control_work_item_closure_retry_ledger_entry_store_append_failed",
    "append failure reason is bounded",
  );
  assert(Boolean(capturedEntry), "append failure observed pending retry-ledger entry");
  assertEqual(replay.accepted, false, "append-failed pending entry cannot be replayed as a trusted plan");
  assertEqual(result.retryLedgerEntryPersisted, false, "append failure does not persist retry-ledger entry");
  assertEqual(result.retryLedgerCreated, false, "append failure creates no retry ledger");
  assert(!containsPhase208ForbiddenTruth(result), "append failure rejection leaks no raw truth");
}

async function verifyTamperedJournalRejects(): Promise<void> {
  section("5. Tampered Journal Rejects On Load");
  const plan = await retryLedgerEntryPlanFixture("phase208_tampered_journal");
  const { rootDir, store } = await createRetryLedgerEntryStore();
  const result =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntry({
      retryLedgerEntryPlan: plan,
      retryLedgerStore: store,
      persistedAt: "2026-05-09T08:00:54.000Z",
      persistedBy: "operator",
    });
  assertEqual(result.accepted, true, "fixture retry-ledger entry persists before journal tamper");
  await appendFile(
    join(rootDir, "external-media-transfer-retry-control-work-item-closure-retry-ledger-entries.jsonl"),
    `${JSON.stringify({ ...result.retryLedgerEntry, retryWorkerCreated: true })}\n`,
    "utf8",
  );

  let rejected = false;
  try {
    await store.loadRetryLedgerEntries();
  } catch {
    rejected = true;
  }
  assertEqual(rejected, true, "tampered retry-ledger journal load is rejected");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 208 Verification (Retry-Control Work-Item Closure Retry-Ledger Entry Persistence)\n");
  await verifyTrustedPlanPersistsRetryLedgerEntry();
  await verifyCopiedPlanRejects();
  await verifyMissingStoreRejects();
  await verifyAppendFailureRejectsAndDoesNotTrustPendingEntry();
  await verifyTamperedJournalRejects();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 208: retry-control work-item closure retry-ledger entry persistence is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
