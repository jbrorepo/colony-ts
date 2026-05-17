/** Phase 211 Verification - Retry-Control Work-Item Closure Retry-Ledger Entry Readiness Plan Preflight */

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryReadinessPlan,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryReadinessPlan,
} from "./channel";
import {
  containsPhase210ForbiddenTruth,
  trustedPreflightFixture,
} from "./verify-phase210";

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

export function containsPhase211ForbiddenTruth(value: unknown): boolean {
  if (containsPhase210ForbiddenTruth(value)) return true;
  const serialized = JSON.stringify(value);
  if (!serialized) return false;
  return ["artifact:phase211", "phase211_", "phase-211-media", "Phase 211 media"].some((marker) =>
    serialized.includes(marker),
  );
}

export async function readinessPlanFixture(prefix: string) {
  const retryLedgerEntryPreflight = await trustedPreflightFixture(prefix);
  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryReadinessPlan({
      retryLedgerEntryPreflight,
    });
  assertEqual(result.accepted, true, "fixture retry-ledger entry readiness plan is accepted");
  assert(Boolean(result.retryLedgerEntryReadinessPlan), "fixture returns trusted retry-ledger entry readiness plan");
  return result;
}

async function verifyTrustedReadinessPlanPreflights(): Promise<void> {
  section("1. Trusted Retry-Ledger Entry Readiness Plan Preflights");
  const result = await readinessPlanFixture("phase211_trusted");

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryReadinessPlan({
      retryLedgerEntryPreflight: result.retryLedgerEntryPreflight,
      retryLedgerEntryReadinessPlan: result.retryLedgerEntryReadinessPlan,
    });

  assertEqual(preflight.accepted, true, "trusted supplied readiness plan preflight is accepted");
  assert(Boolean(preflight.retryLedgerEntryReadinessPlan), "trusted preflight returns readiness plan");
  assertEqual(
    preflight.retryLedgerEntryReadinessPlan,
    result.retryLedgerEntryReadinessPlan,
    "preflight returns the supplied trusted readiness plan",
  );
  assertEqual(
    preflight.expectedRetryLedgerEntryReadinessPlan,
    result.retryLedgerEntryReadinessPlan,
    "preflight exposes expected readiness plan only when accepted",
  );
  assertEqual(
    preflight.retryLedgerEntryReadinessPlanId,
    result.retryLedgerEntryReadinessPlanId,
    "preflight binds readiness plan id",
  );
  assertEqual(preflight.retryLedgerEntryReadinessPlanStillTrusted, true, "supplied readiness plan remains trusted");
  assertEqual(preflight.retryLedgerEntryPreflightAccepted, true, "preflight requires accepted retry-ledger entry preflight");
  assertEqual(preflight.retryLedgerEntryPreflightStillTrusted, true, "preflight requires trusted retry-ledger entry preflight");
  assertEqual(preflight.retryLedgerEntryStillTrusted, true, "preflight requires trusted retry-ledger entry");
  assertEqual(preflight.retryControlReady, true, "preflight preserves retry-control readiness");
  assertEqual(preflight.retryWorkerReady, false, "preflight does not ready a retry worker");
  assertEqual(preflight.retryScheduleReady, false, "preflight does not ready a retry schedule");
  assertEqual(preflight.retryWorkerCreated, false, "preflight creates no retry worker");
  assertEqual(preflight.retryScheduleCreated, false, "preflight creates no retry schedule");
  assertEqual(preflight.backgroundRetryCreated, false, "preflight creates no background retry");
  assertEqual(preflight.automaticVendorRetryAllowed, false, "preflight allows no automatic vendor retry");
  assertEqual(preflight.credentialPersistenceCreated, false, "preflight persists no credentials");
  assertEqual(preflight.defaultLiveDeliveryEnabled, false, "preflight enables no default live delivery");
  assertEqual(preflight.publicHostingEnabled, false, "preflight enables no public hosting");
  assertEqual(
    preflight.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryReadinessPlanPreflightTruth,
    "trusted_retry_control_work_item_closure_retry_ledger_entry_readiness_plan_preflight_no_worker_or_schedule",
    "preflight truth is explicit",
  );
  assert(!containsPhase211ForbiddenTruth(preflight), "trusted preflight leaks no raw truth");
}

async function verifyCopiedTamperedOrContaminatedPlanRejects(): Promise<void> {
  section("2. Copied, Tampered, Or Contaminated Readiness Plans Reject");
  const result = await readinessPlanFixture("phase211_reject");
  const copied = JSON.parse(JSON.stringify(result.retryLedgerEntryReadinessPlan));
  const shallowCopied = { ...result.retryLedgerEntryReadinessPlan };
  const tampered = {
    ...result.retryLedgerEntryReadinessPlan,
    retryLedgerEntryReadinessPlanId: "manual-retry-control-worker-invocation-execution-receipt-work-item-closure-retry-ledger-entry-readiness-plan:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
  const contaminated = {
    ...result.retryLedgerEntryReadinessPlan,
    retryLedgerEntryReadinessPlanId: "https://leak.invalid/artifact:phase211",
    retryWorkerCreated: true,
    rawSourceUrl: "https://leak.invalid/artifact:phase211",
    credentialPersistencePath: "C:\\secret\\phase211-token.txt",
    credentialValue: "phase211-secret-value",
  };

  const copiedResult =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryReadinessPlan({
      retryLedgerEntryPreflight: result.retryLedgerEntryPreflight,
      retryLedgerEntryReadinessPlan: copied,
    });
  const shallowResult =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryReadinessPlan({
      retryLedgerEntryPreflight: result.retryLedgerEntryPreflight,
      retryLedgerEntryReadinessPlan: shallowCopied,
    });
  const tamperedResult =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryReadinessPlan({
      retryLedgerEntryPreflight: result.retryLedgerEntryPreflight,
      retryLedgerEntryReadinessPlan: tampered,
    });
  const contaminatedResult =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryReadinessPlan({
      retryLedgerEntryPreflight: result.retryLedgerEntryPreflight,
      retryLedgerEntryReadinessPlan: contaminated,
    });

  assertEqual(copiedResult.accepted, false, "JSON-copied readiness plan is rejected");
  assertEqual(
    copiedResult.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_retry_ledger_entry_readiness_plan_required",
    "copied readiness plan rejection is bounded",
  );
  assertEqual(copiedResult.retryLedgerEntryReadinessPlanStillTrusted, false, "copied readiness plan is not trusted");
  assertEqual(copiedResult.retryWorkerCreated, false, "copied readiness plan creates no retry worker");
  assert(!containsPhase211ForbiddenTruth(copiedResult), "copied rejection leaks no raw truth");

  assertEqual(shallowResult.accepted, false, "shallow-copied readiness plan is rejected");
  assertEqual(shallowResult.retryLedgerEntryReadinessPlanStillTrusted, false, "shallow copy is not trusted");
  assertEqual(shallowResult.retryLedgerEntryStillTrusted, true, "shallow rejection keeps trusted retry-ledger entry context");
  assertEqual(shallowResult.defaultLiveDeliveryEnabled, false, "shallow rejection enables no default live delivery");
  assert(!containsPhase211ForbiddenTruth(shallowResult), "shallow-copy rejection leaks no raw truth");

  assertEqual(tamperedResult.accepted, false, "tampered readiness plan is rejected");
  assertEqual(
    tamperedResult.reasonCode,
    "external_media_transfer_retry_control_work_item_closure_retry_ledger_entry_readiness_plan_current_truth_mismatch",
    "tampered readiness plan rejection is bounded",
  );
  assertEqual(tamperedResult.retryWorkerCreated, false, "tampered readiness plan creates no retry worker");
  assert(!containsPhase211ForbiddenTruth(tamperedResult), "tampered rejection leaks no raw truth");

  assertEqual(contaminatedResult.accepted, false, "contaminated readiness plan is rejected");
  assertEqual(contaminatedResult.retryWorkerStillBlocked, false, "contaminated retry-worker claim is surfaced");
  assertEqual(contaminatedResult.retryWorkerCreated, false, "contaminated readiness plan creates no retry worker");
  assertEqual(contaminatedResult.publicHostingEnabled, false, "contaminated readiness plan enables no public hosting");
  assert(
    !JSON.stringify(contaminatedResult).includes("phase211-token") &&
      !JSON.stringify(contaminatedResult).includes("phase211-secret-value") &&
      !JSON.stringify(contaminatedResult).includes("leak.invalid"),
    "contaminated rejection leaks no generic raw URL/path/credential values",
  );
  assert(!containsPhase211ForbiddenTruth(contaminatedResult), "contaminated rejection leaks no raw truth");
}

async function verifyTrustedPlanMutationIsBlocked(): Promise<void> {
  section("3. Trusted Readiness Plan Mutation Is Blocked");
  const result = await readinessPlanFixture("phase211_nested");
  const plan = result.retryLedgerEntryReadinessPlan!;

  let topLevelMutationBlocked = false;
  try {
    (plan as unknown as Record<string, unknown>).retryWorkerCreated = true;
  } catch {
    topLevelMutationBlocked = true;
  }

  let nestedMutationBlocked = false;
  try {
    (plan.sourceRefFingerprints[0] as unknown as Record<string, unknown>).rawSourceUrl =
      "https://example.invalid/artifact:phase211";
  } catch {
    nestedMutationBlocked = true;
  }

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryReadinessPlan({
      retryLedgerEntryPreflight: result.retryLedgerEntryPreflight,
      retryLedgerEntryReadinessPlan: plan,
    });

  assert(topLevelMutationBlocked || plan.retryWorkerCreated === false, "trusted readiness plan cannot be top-level contaminated");
  assert(
    nestedMutationBlocked || !("rawSourceUrl" in (plan.sourceRefFingerprints[0] as unknown as Record<string, unknown>)),
    "trusted readiness plan nested source refs cannot be contaminated",
  );
  assertEqual(preflight.accepted, true, "mutation-blocked trusted readiness plan still preflights");
  assertEqual(preflight.retryWorkerCreated, false, "mutation-blocked preflight creates no retry worker");
  assertEqual(preflight.publicHostingEnabled, false, "mutation-blocked preflight enables no public hosting");
  assert(!containsPhase211ForbiddenTruth(preflight), "mutation-blocked preflight leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 211 Verification (Retry-Control Work-Item Closure Retry-Ledger Entry Readiness Plan Preflight)\n");
  await verifyTrustedReadinessPlanPreflights();
  await verifyCopiedTamperedOrContaminatedPlanRejects();
  await verifyTrustedPlanMutationIsBlocked();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 211: retry-control work-item closure retry-ledger entry readiness plan preflight is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
