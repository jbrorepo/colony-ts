/** Phase 209 Verification - Retry-Control Work-Item Closure Retry-Ledger Entry Preflight */

import {
  persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntry,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntry,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntry,
} from "./channel";
import {
  containsPhase208ForbiddenTruth,
  createRetryLedgerEntryStore,
  retryLedgerEntryPlanFixture,
} from "./verify-phase208";

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

export function containsPhase209ForbiddenTruth(value: unknown): boolean {
  if (containsPhase208ForbiddenTruth(value)) return true;
  const serialized = JSON.stringify(value);
  if (!serialized) return false;
  return ["artifact:phase209", "phase209_", "phase-209-media", "Phase 209 media"].some((marker) =>
    serialized.includes(marker),
  );
}

export async function retryLedgerEntryFixture(
  prefix: string,
): Promise<ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntry> {
  const plan = await retryLedgerEntryPlanFixture(prefix);
  const { store } = await createRetryLedgerEntryStore();
  const result =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntry({
      retryLedgerEntryPlan: plan,
      retryLedgerStore: store,
      persistedAt: "2026-05-09T08:26:48.000Z",
      persistedBy: "operator",
    });
  assertEqual(result.accepted, true, "fixture retry-ledger entry persistence is accepted");
  const [entry] = await store.loadRetryLedgerEntries();
  assert(Boolean(entry), "fixture retry-ledger entry reloads as trusted entry");
  return entry;
}

async function verifyTrustedEntryPreflightAccepts(): Promise<void> {
  section("1. Trusted Retry-Ledger Entry Preflight Accepts Persisted Entry");
  const entry = await retryLedgerEntryFixture("phase209_trusted");
  const result =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntry({
      retryLedgerEntry: entry,
    });

  assertEqual(result.accepted, true, "trusted retry-ledger entry preflight is accepted");
  assertEqual(result.retryLedgerEntry, entry, "preflight returns the trusted entry object");
  assertEqual(
    result.retryLedgerEntryId,
    entry.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryId,
    "preflight binds retry-ledger entry id",
  );
  assertEqual(
    result.retryLedgerEntryPlanId,
    entry.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryPlanId,
    "preflight binds retry-ledger entry plan id",
  );
  assertEqual(result.retryLedgerReady, true, "preflight preserves retry-ledger readiness");
  assertEqual(result.retryLedgerEntryPersisted, true, "preflight preserves persistence truth");
  assertEqual(result.retryLedgerEntryPreflightAccepted, true, "preflight acceptance truth is explicit");
  assertEqual(result.retryLedgerCreated, true, "preflight acknowledges only already-persisted retry-ledger entry truth");
  assertEqual(result.retryControlWorkerInvocationExecutionReceiptPersisted, false, "preflight persists no execution receipt");
  assertEqual(result.backgroundRetryCreated, false, "preflight creates no background retry");
  assertEqual(result.retryWorkerCreated, false, "preflight creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "preflight creates no retry schedule");
  assertEqual(result.automaticVendorRetryAllowed, false, "preflight allows no automatic vendor retry");
  assertEqual(result.credentialPersistenceCreated, false, "preflight persists no credentials");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "preflight enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "preflight enables no public hosting");
  assertEqual(
    result.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryPreflightTruth,
    "trusted_retry_control_work_item_closure_retry_ledger_entry_preflight_no_worker_or_schedule",
    "preflight truth is explicit",
  );
  assert(!containsPhase209ForbiddenTruth(result), "trusted preflight leaks no raw truth");
}

async function verifyCopiedOrTamperedEntryRejects(): Promise<void> {
  section("2. Copied Or Tampered Retry-Ledger Entry Preflight Rejects");
  const entry = await retryLedgerEntryFixture("phase209_copied");
  const copied = JSON.parse(JSON.stringify(entry));
  const copiedResult =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntry({
      retryLedgerEntry: copied,
    });

  assertEqual(copiedResult.accepted, false, "copied retry-ledger entry preflight is rejected");
  assertEqual(
    copiedResult.reasonCode,
    "external_media_transfer_retry_control_work_item_closure_retry_ledger_entry_untrusted",
    "copied retry-ledger entry rejection is bounded",
  );
  assertEqual(copiedResult.retryLedgerEntry, undefined, "copied preflight returns no trusted entry");
  assertEqual(copiedResult.retryLedgerEntryPreflightAccepted, false, "copied preflight is not accepted");
  assertEqual(copiedResult.retryWorkerCreated, false, "copied preflight creates no retry worker");
  assert(!containsPhase209ForbiddenTruth(copiedResult), "copied preflight rejection leaks no raw truth");

  const shallowCopied = { ...entry };
  const shallowCopiedResult =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntry({
      retryLedgerEntry: shallowCopied,
    });

  assertEqual(shallowCopiedResult.accepted, false, "shallow-copied retry-ledger entry preflight is rejected");
  assertEqual(
    shallowCopiedResult.reasonCode,
    "external_media_transfer_retry_control_work_item_closure_retry_ledger_entry_untrusted",
    "shallow-copied retry-ledger entry rejection is bounded",
  );
  assertEqual(shallowCopiedResult.retryLedgerEntry, undefined, "shallow-copied preflight returns no trusted entry");
  assertEqual(shallowCopiedResult.retryWorkerCreated, false, "shallow-copied preflight creates no retry worker");
  assert(!containsPhase209ForbiddenTruth(shallowCopiedResult), "shallow-copied preflight rejection leaks no raw truth");

  const tampered = {
    ...copied,
    retryWorkerCreated: true,
  };
  const tamperedResult =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntry({
      retryLedgerEntry: tampered,
    });

  assertEqual(tamperedResult.accepted, false, "tampered retry-ledger entry preflight is rejected");
  assertEqual(
    tamperedResult.reasonCode,
    "external_media_transfer_retry_control_work_item_closure_retry_ledger_entry_invalid",
    "tampered retry-ledger entry rejection is bounded",
  );
  assertEqual(tamperedResult.retryLedgerEntry, undefined, "tampered preflight returns no trusted entry");
  assertEqual(tamperedResult.retryLedgerCreated, false, "tampered preflight creates no retry ledger");
  assertEqual(tamperedResult.retryWorkerCreated, false, "tampered preflight creates no retry worker");
  assert(!containsPhase209ForbiddenTruth(tamperedResult), "tampered preflight rejection leaks no raw truth");

  const rawContaminated = {
    ...entry,
    credentialPersistencePath: "C:\\secret\\phase209-token.txt",
    rawSourceUrl: "https://example.invalid/artifact:phase209",
    rawReference: "phase209_raw_reference",
  };
  const rawContaminatedResult =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntry({
      retryLedgerEntry: rawContaminated,
    });

  assertEqual(rawContaminatedResult.accepted, false, "raw-contaminated retry-ledger entry preflight is rejected");
  assertEqual(
    rawContaminatedResult.reasonCode,
    "external_media_transfer_retry_control_work_item_closure_retry_ledger_entry_invalid",
    "raw-contaminated retry-ledger entry rejection is bounded",
  );
  assertEqual(rawContaminatedResult.retryLedgerEntry, undefined, "raw-contaminated preflight returns no trusted entry");
  assertEqual(rawContaminatedResult.retryLedgerCreated, false, "raw-contaminated preflight creates no retry ledger");
  assertEqual(rawContaminatedResult.retryWorkerCreated, false, "raw-contaminated preflight creates no retry worker");
  assert(!containsPhase209ForbiddenTruth(rawContaminatedResult), "raw-contaminated preflight rejection leaks no raw truth");
}

async function verifyAppendFailedEntryRejects(): Promise<void> {
  section("3. Append-Failed Retry-Ledger Entry Preflight Rejects");
  const plan = await retryLedgerEntryPlanFixture("phase209_append_failed");
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

  const appendFailure =
    await persistExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntry({
      retryLedgerEntryPlan: plan,
      retryLedgerStore: failingStore,
      persistedAt: "2026-05-09T08:26:49.000Z",
      persistedBy: "operator",
    });
  const preflightResult =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntry({
      retryLedgerEntry: capturedEntry,
    });

  assertEqual(appendFailure.accepted, false, "fixture append failure is rejected");
  assert(Boolean(capturedEntry), "append failure exposes captured pending entry");
  assertEqual(preflightResult.accepted, false, "append-failed captured entry preflight is rejected");
  assertEqual(
    preflightResult.reasonCode,
    "external_media_transfer_retry_control_work_item_closure_retry_ledger_entry_untrusted",
    "append-failed captured entry rejection is bounded",
  );
  assertEqual(preflightResult.retryLedgerEntryPreflightAccepted, false, "append-failed preflight is not accepted");
  assertEqual(preflightResult.retryLedgerCreated, false, "append-failed preflight creates no retry ledger");
  assertEqual(preflightResult.retryWorkerCreated, false, "append-failed preflight creates no retry worker");
  assert(!containsPhase209ForbiddenTruth(preflightResult), "append-failed preflight rejection leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 209 Verification (Retry-Control Work-Item Closure Retry-Ledger Entry Preflight)\n");
  await verifyTrustedEntryPreflightAccepts();
  await verifyCopiedOrTamperedEntryRejects();
  await verifyAppendFailedEntryRejects();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 209: retry-control work-item closure retry-ledger entry preflight is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
