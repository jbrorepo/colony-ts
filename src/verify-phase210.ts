/** Phase 210 Verification - Retry-Control Work-Item Closure Retry-Ledger Entry Readiness Plan */

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryReadinessPlan,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntry,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryPreflightResult,
} from "./channel";
import {
  containsPhase209ForbiddenTruth,
  retryLedgerEntryFixture,
} from "./verify-phase209";

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

export function containsPhase210ForbiddenTruth(value: unknown): boolean {
  if (containsPhase209ForbiddenTruth(value)) return true;
  const serialized = JSON.stringify(value);
  if (!serialized) return false;
  return ["artifact:phase210", "phase210_", "phase-210-media", "Phase 210 media"].some((marker) =>
    serialized.includes(marker),
  );
}

export async function trustedPreflightFixture(
  prefix: string,
): Promise<ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryPreflightResult> {
  const entry = await retryLedgerEntryFixture(prefix);
  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntry({
      retryLedgerEntry: entry,
    });
  assertEqual(preflight.accepted, true, "fixture retry-ledger entry preflight is accepted");
  assert(Boolean(preflight.retryLedgerEntry), "fixture retry-ledger entry preflight returns trusted entry");
  return preflight;
}

async function verifyTrustedPreflightCreatesReadinessPlan(): Promise<void> {
  section("1. Trusted Retry-Ledger Entry Preflight Creates Readiness Plan");
  const preflight = await trustedPreflightFixture("phase210_trusted");

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryReadinessPlan({
      retryLedgerEntryPreflight: preflight,
    });
  const repeated =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryReadinessPlan({
      retryLedgerEntryPreflight: preflight,
    });

  assertEqual(result.accepted, true, "trusted preflight-bound readiness plan is accepted");
  assert(Boolean(result.retryLedgerEntryReadinessPlan), "trusted preflight returns readiness plan");
  assertEqual(result.retryLedgerEntryPreflightAccepted, true, "readiness plan requires accepted preflight");
  assertEqual(result.retryLedgerEntryPreflightStillTrusted, true, "readiness plan requires trusted preflight envelope");
  assertEqual(result.retryLedgerEntryStillTrusted, true, "readiness plan requires trusted retry-ledger entry");
  assertEqual(result.retryControlReady, true, "retry-control readiness is true");
  assertEqual(result.retryWorkerReady, false, "readiness plan does not ready a retry worker");
  assertEqual(result.retryScheduleReady, false, "readiness plan does not ready a retry schedule");
  assertEqual(result.retryWorkerCreated, false, "readiness plan creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "readiness plan creates no retry schedule");
  assertEqual(result.backgroundRetryCreated, false, "readiness plan creates no background retry");
  assertEqual(result.automaticVendorRetryAllowed, false, "readiness plan allows no automatic vendor retry");
  assertEqual(result.credentialPersistenceCreated, false, "readiness plan persists no credentials");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "readiness plan enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "readiness plan enables no public hosting");
  assertEqual(
    result.retryLedgerEntryReadinessPlan?.retryLedgerEntryId,
    preflight.retryLedgerEntryId,
    "readiness plan binds retry-ledger entry id",
  );
  assertEqual(
    result.retryLedgerEntryReadinessPlan?.retryLedgerEntryPlanId,
    preflight.retryLedgerEntryPlanId,
    "readiness plan binds retry-ledger entry plan id",
  );
  assertEqual(
    result.retryLedgerEntryReadinessPlanId,
    repeated.retryLedgerEntryReadinessPlanId,
    "readiness plan id is deterministic",
  );
  assertEqual(
    result.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryReadinessPlanTruth,
    "trusted_retry_control_work_item_closure_retry_ledger_entry_preflight_bound_readiness_plan_no_worker_or_schedule",
    "readiness plan truth is explicit",
  );
  assert(!containsPhase210ForbiddenTruth(result), "trusted readiness plan leaks no raw truth");
}

async function verifyCopiedOrContaminatedPreflightRejects(): Promise<void> {
  section("2. Copied Or Contaminated Preflight Rejects");
  const preflight = await trustedPreflightFixture("phase210_copied");
  const copied = JSON.parse(JSON.stringify(preflight));
  const shallowCopied = { ...preflight };
  const contaminated = {
    ...preflight,
    retryWorkerCreated: true,
    rawSourceUrl: "https://leak.invalid/raw-token",
    credentialPersistencePath: "C:\\secret\\raw-token.txt",
    credentialValue: "raw-secret-value",
  };

  const copiedResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryReadinessPlan({
      retryLedgerEntryPreflight: copied,
    });
  const shallowResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryReadinessPlan({
      retryLedgerEntryPreflight: shallowCopied,
    });
  const contaminatedResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryReadinessPlan({
      retryLedgerEntryPreflight: contaminated,
    });

  assertEqual(copiedResult.accepted, false, "copied preflight-bound readiness plan is rejected");
  assertEqual(
    copiedResult.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_retry_ledger_entry_preflight_required",
    "copied preflight rejection is bounded",
  );
  assertEqual(copiedResult.retryLedgerEntryPreflightStillTrusted, false, "copied preflight envelope is not trusted");
  assertEqual(copiedResult.retryLedgerEntryStillTrusted, false, "copied preflight has no trusted entry object");
  assertEqual(copiedResult.retryWorkerCreated, false, "copied preflight creates no retry worker");
  assert(!containsPhase210ForbiddenTruth(copiedResult), "copied preflight rejection leaks no raw truth");

  assertEqual(shallowResult.accepted, false, "shallow-copied preflight envelope is rejected");
  assertEqual(
    shallowResult.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_retry_ledger_entry_preflight_required",
    "shallow copy rejection is bounded",
  );
  assertEqual(shallowResult.retryLedgerEntryPreflightStillTrusted, false, "shallow copy is not a trusted preflight envelope");
  assertEqual(shallowResult.retryLedgerEntryStillTrusted, true, "shallow copy can retain trusted retry-ledger entry object");
  assertEqual(shallowResult.retryWorkerCreated, false, "shallow copy creates no retry worker");
  assert(!containsPhase210ForbiddenTruth(shallowResult), "shallow-copy rejection leaks no raw truth");

  assertEqual(contaminatedResult.accepted, false, "contaminated preflight-bound readiness plan is rejected");
  assertEqual(contaminatedResult.retryLedgerEntryStillTrusted, true, "contaminated shallow preflight retains trusted entry");
  assertEqual(contaminatedResult.retryWorkerStillBlocked, false, "contaminated retry-worker claim is surfaced");
  assertEqual(contaminatedResult.retryWorkerCreated, false, "contaminated result creates no retry worker");
  assertEqual(contaminatedResult.defaultLiveDeliveryEnabled, false, "contaminated result enables no default live delivery");
  assert(
    !JSON.stringify(contaminatedResult).includes("raw-token") &&
      !JSON.stringify(contaminatedResult).includes("raw-secret-value"),
    "contaminated rejection leaks no generic raw URL/path/credential values",
  );
  assert(!containsPhase210ForbiddenTruth(contaminatedResult), "contaminated rejection leaks no raw truth");
}

async function verifyTrustedPreflightNestedMutationIsBlocked(): Promise<void> {
  section("3. Trusted Preflight Nested Mutation Is Blocked");
  const preflight = await trustedPreflightFixture("phase210_nested");
  let topLevelMutationBlocked = false;
  try {
    (preflight as unknown as Record<string, unknown>).retryWorkerCreated = true;
  } catch {
    topLevelMutationBlocked = true;
  }

  let mutationBlocked = false;
  try {
    (preflight.retryLedgerEntry as unknown as Record<string, unknown>).rawSourceUrl =
      "https://example.invalid/artifact:phase210";
  } catch {
    mutationBlocked = true;
  }

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryReadinessPlan({
      retryLedgerEntryPreflight: preflight,
    });

  assert(
    topLevelMutationBlocked || preflight.retryWorkerCreated === false,
    "trusted preflight envelope cannot be top-level contaminated",
  );
  assert(
    mutationBlocked ||
      !("rawSourceUrl" in (preflight.retryLedgerEntry as unknown as Record<string, unknown>)),
    "trusted nested retry-ledger entry cannot be contaminated",
  );
  assertEqual(result.accepted, true, "nested-mutation-blocked trusted preflight still plans");
  assertEqual(result.retryWorkerCreated, false, "nested-mutation-blocked result creates no retry worker");
  assertEqual(result.publicHostingEnabled, false, "nested-mutation-blocked result enables no public hosting");
  assert(!containsPhase210ForbiddenTruth(result), "nested-mutation-blocked result leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 210 Verification (Retry-Control Work-Item Closure Retry-Ledger Entry Readiness Plan)\n");
  await verifyTrustedPreflightCreatesReadinessPlan();
  await verifyCopiedOrContaminatedPreflightRejects();
  await verifyTrustedPreflightNestedMutationIsBlocked();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 210: retry-control work-item closure retry-ledger entry readiness plan is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
