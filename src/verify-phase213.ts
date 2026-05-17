/** Phase 213 Verification - Retry-Control Work-Item Closure Retry-Ledger Entry Operator Handoff Preflight */

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryOperatorHandoff,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryOperatorHandoff,
} from "./channel";
import {
  containsPhase212ForbiddenTruth,
  trustedReadinessPlanPreflightFixture,
} from "./verify-phase212";

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

export function containsPhase213ForbiddenTruth(value: unknown): boolean {
  if (containsPhase212ForbiddenTruth(value)) return true;
  const serialized = JSON.stringify(value);
  if (!serialized) return false;
  return ["artifact:phase213", "phase213_", "phase-213-media", "Phase 213 media"].some((marker) =>
    serialized.includes(marker),
  );
}

async function operatorHandoffFixture(prefix: string) {
  const preflight = await trustedReadinessPlanPreflightFixture(prefix);
  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryOperatorHandoff({
      retryLedgerEntryReadinessPlanPreflight: preflight,
    });
  assertEqual(result.accepted, true, "fixture retry-ledger operator handoff is accepted");
  assert(Boolean(result.retryLedgerEntryOperatorHandoff), "fixture returns trusted retry-ledger operator handoff");
  return result;
}

async function verifyTrustedOperatorHandoffPreflight(): Promise<void> {
  section("1. Trusted Retry-Ledger Operator Handoff Preflights");
  const result = await operatorHandoffFixture("phase213_trusted");

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryOperatorHandoff({
      retryLedgerEntryReadinessPlanPreflight: result.retryLedgerEntryReadinessPlanPreflight,
      retryLedgerEntryOperatorHandoff: result.retryLedgerEntryOperatorHandoff,
    });

  assertEqual(preflight.accepted, true, "trusted supplied operator handoff preflight is accepted");
  assert(Boolean(preflight.retryLedgerEntryOperatorHandoff), "trusted preflight returns operator handoff");
  assertEqual(
    preflight.retryLedgerEntryOperatorHandoff,
    result.retryLedgerEntryOperatorHandoff,
    "preflight returns the supplied trusted operator handoff",
  );
  assertEqual(
    preflight.expectedRetryLedgerEntryOperatorHandoff,
    result.retryLedgerEntryOperatorHandoff,
    "preflight exposes expected operator handoff only when accepted",
  );
  assertEqual(
    preflight.retryLedgerEntryOperatorHandoffId,
    result.retryLedgerEntryOperatorHandoffId,
    "preflight binds operator handoff id",
  );
  assertEqual(preflight.retryLedgerEntryOperatorHandoffStillTrusted, true, "supplied operator handoff remains trusted");
  assertEqual(preflight.retryLedgerEntryReadinessPlanPreflightAccepted, true, "preflight requires accepted readiness-plan preflight");
  assertEqual(preflight.retryLedgerEntryReadinessPlanPreflightStillTrusted, true, "preflight requires trusted readiness-plan preflight");
  assertEqual(preflight.retryLedgerEntryReadinessPlanStillTrusted, true, "preflight requires trusted readiness plan");
  assertEqual(preflight.retryLedgerEntryStillTrusted, true, "preflight keeps trusted retry-ledger entry context");
  assertEqual(preflight.hostOwnedRetryControlRequired, true, "preflight preserves host-owned retry-control requirement");
  assertEqual(preflight.operatorMustSelectFutureRetryWorker, true, "preflight preserves future worker selection requirement");
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
    preflight.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryOperatorHandoffPreflightTruth,
    "trusted_retry_control_work_item_closure_retry_ledger_entry_operator_handoff_preflight_no_worker_or_schedule",
    "preflight truth is explicit",
  );
  assert(!containsPhase213ForbiddenTruth(preflight), "trusted preflight leaks no raw truth");
}

async function verifyCopiedTamperedOrContaminatedHandoffRejects(): Promise<void> {
  section("2. Copied, Tampered, Or Contaminated Operator Handoffs Reject");
  const result = await operatorHandoffFixture("phase213_reject");
  const copied = JSON.parse(JSON.stringify(result.retryLedgerEntryOperatorHandoff));
  const shallowCopied = { ...result.retryLedgerEntryOperatorHandoff };
  const tampered = {
    ...result.retryLedgerEntryOperatorHandoff,
    retryLedgerEntryOperatorHandoffId:
      "manual-retry-control-worker-invocation-execution-receipt-work-item-closure-retry-ledger-entry-operator-handoff:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
  const contaminated = {
    ...result.retryLedgerEntryOperatorHandoff,
    retryLedgerEntryOperatorHandoffId: "https://leak.invalid/artifact:phase213",
    retryWorkerCreated: true,
    rawSourceUrl: "https://leak.invalid/artifact:phase213",
    credentialPersistencePath: "C:\\secret\\phase213-token.txt",
    credentialValue: "phase213-secret-value",
  };

  const copiedResult =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryOperatorHandoff({
      retryLedgerEntryReadinessPlanPreflight: result.retryLedgerEntryReadinessPlanPreflight,
      retryLedgerEntryOperatorHandoff: copied,
    });
  const shallowResult =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryOperatorHandoff({
      retryLedgerEntryReadinessPlanPreflight: result.retryLedgerEntryReadinessPlanPreflight,
      retryLedgerEntryOperatorHandoff: shallowCopied,
    });
  const tamperedResult =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryOperatorHandoff({
      retryLedgerEntryReadinessPlanPreflight: result.retryLedgerEntryReadinessPlanPreflight,
      retryLedgerEntryOperatorHandoff: tampered,
    });
  const contaminatedResult =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryOperatorHandoff({
      retryLedgerEntryReadinessPlanPreflight: result.retryLedgerEntryReadinessPlanPreflight,
      retryLedgerEntryOperatorHandoff: contaminated,
    });

  assertEqual(copiedResult.accepted, false, "JSON-copied operator handoff is rejected");
  assertEqual(
    copiedResult.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_retry_ledger_entry_operator_handoff_required",
    "copied operator handoff rejection is bounded",
  );
  assertEqual(copiedResult.retryLedgerEntryOperatorHandoffStillTrusted, false, "copied operator handoff is not trusted");
  assertEqual(copiedResult.retryWorkerCreated, false, "copied operator handoff creates no retry worker");
  assert(!containsPhase213ForbiddenTruth(copiedResult), "copied rejection leaks no raw truth");

  assertEqual(shallowResult.accepted, false, "shallow-copied operator handoff is rejected");
  assertEqual(shallowResult.retryLedgerEntryOperatorHandoffStillTrusted, false, "shallow copy is not trusted");
  assertEqual(shallowResult.retryLedgerEntryReadinessPlanStillTrusted, true, "shallow rejection keeps trusted readiness-plan context");
  assertEqual(shallowResult.defaultLiveDeliveryEnabled, false, "shallow rejection enables no default live delivery");
  assert(!containsPhase213ForbiddenTruth(shallowResult), "shallow-copy rejection leaks no raw truth");

  assertEqual(tamperedResult.accepted, false, "tampered operator handoff is rejected");
  assertEqual(
    tamperedResult.reasonCode,
    "external_media_transfer_retry_control_work_item_closure_retry_ledger_entry_operator_handoff_current_truth_mismatch",
    "tampered operator handoff rejection is bounded",
  );
  assertEqual(tamperedResult.retryWorkerCreated, false, "tampered operator handoff creates no retry worker");
  assert(!containsPhase213ForbiddenTruth(tamperedResult), "tampered rejection leaks no raw truth");

  assertEqual(contaminatedResult.accepted, false, "contaminated operator handoff is rejected");
  assertEqual(contaminatedResult.retryWorkerStillBlocked, false, "contaminated retry-worker claim is surfaced");
  assertEqual(contaminatedResult.retryWorkerCreated, false, "contaminated operator handoff creates no retry worker");
  assertEqual(contaminatedResult.publicHostingEnabled, false, "contaminated operator handoff enables no public hosting");
  assert(
    !JSON.stringify(contaminatedResult).includes("phase213-token") &&
      !JSON.stringify(contaminatedResult).includes("phase213-secret-value") &&
      !JSON.stringify(contaminatedResult).includes("leak.invalid"),
    "contaminated rejection leaks no generic raw URL/path/credential values",
  );
  assert(!containsPhase213ForbiddenTruth(contaminatedResult), "contaminated rejection leaks no raw truth");
}

async function verifyTrustedHandoffMutationIsBlocked(): Promise<void> {
  section("3. Trusted Operator Handoff Mutation Is Blocked");
  const result = await operatorHandoffFixture("phase213_nested");
  const handoff = result.retryLedgerEntryOperatorHandoff!;

  let topLevelMutationBlocked = false;
  try {
    (handoff as unknown as Record<string, unknown>).retryWorkerCreated = true;
  } catch {
    topLevelMutationBlocked = true;
  }

  let nestedMutationBlocked = false;
  try {
    (handoff.sourceRefFingerprints[0] as unknown as Record<string, unknown>).rawSourceUrl =
      "https://example.invalid/artifact:phase213";
  } catch {
    nestedMutationBlocked = true;
  }

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryOperatorHandoff({
      retryLedgerEntryReadinessPlanPreflight: result.retryLedgerEntryReadinessPlanPreflight,
      retryLedgerEntryOperatorHandoff: handoff,
    });

  assert(topLevelMutationBlocked || handoff.retryWorkerCreated === false, "trusted operator handoff cannot be top-level contaminated");
  assert(
    nestedMutationBlocked || !("rawSourceUrl" in (handoff.sourceRefFingerprints[0] as unknown as Record<string, unknown>)),
    "trusted operator handoff nested source refs cannot be contaminated",
  );
  assertEqual(preflight.accepted, true, "mutation-blocked trusted operator handoff still preflights");
  assertEqual(preflight.retryWorkerCreated, false, "mutation-blocked preflight creates no retry worker");
  assertEqual(preflight.publicHostingEnabled, false, "mutation-blocked preflight enables no public hosting");
  assert(!containsPhase213ForbiddenTruth(preflight), "mutation-blocked preflight leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 213 Verification (Retry-Control Work-Item Closure Retry-Ledger Entry Operator Handoff Preflight)\n");
  await verifyTrustedOperatorHandoffPreflight();
  await verifyCopiedTamperedOrContaminatedHandoffRejects();
  await verifyTrustedHandoffMutationIsBlocked();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 213: retry-control work-item closure retry-ledger entry operator handoff preflight is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
