/** Phase 214 Verification - Retry-Control Work-Item Closure Retry-Ledger Entry Worker Selection Intent */

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryOperatorHandoff,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryOperatorHandoff,
} from "./channel";
import { trustedReadinessPlanPreflightFixture } from "./verify-phase212";
import { containsPhase213ForbiddenTruth } from "./verify-phase213";

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

export function containsPhase214ForbiddenTruth(value: unknown): boolean {
  if (containsPhase213ForbiddenTruth(value)) return true;
  const serialized = JSON.stringify(value);
  if (!serialized) return false;
  return ["artifact:phase214", "phase214_", "phase-214-media", "Phase 214 media"].some((marker) =>
    serialized.includes(marker),
  );
}

export async function operatorHandoffPreflightFixture(prefix: string) {
  const readinessPlanPreflight = await trustedReadinessPlanPreflightFixture(prefix);
  const handoff =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryOperatorHandoff({
      retryLedgerEntryReadinessPlanPreflight: readinessPlanPreflight,
    });
  assertEqual(handoff.accepted, true, "fixture retry-ledger operator handoff is accepted");
  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryOperatorHandoff({
      retryLedgerEntryReadinessPlanPreflight: handoff.retryLedgerEntryReadinessPlanPreflight,
      retryLedgerEntryOperatorHandoff: handoff.retryLedgerEntryOperatorHandoff,
    });
  assertEqual(preflight.accepted, true, "fixture retry-ledger operator handoff preflight is accepted");
  assert(Boolean(preflight.retryLedgerEntryOperatorHandoff), "fixture returns trusted retry-ledger operator handoff");
  return preflight;
}

async function verifyTrustedWorkerSelectionIntent(): Promise<void> {
  section("1. Trusted Operator-Handoff Preflight Creates Worker Selection Intent");
  const preflight = await operatorHandoffPreflightFixture("phase214_trusted");
  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection({
      retryLedgerEntryOperatorHandoffPreflight: preflight,
    });

  assertEqual(result.accepted, true, "trusted operator-handoff preflight creates worker selection intent");
  assert(Boolean(result.retryLedgerEntryWorkerSelection), "worker selection intent returns descriptor");
  assertEqual(
    result.retryLedgerEntryOperatorHandoffPreflightAccepted,
    true,
    "worker selection requires accepted operator-handoff preflight",
  );
  assertEqual(
    result.retryLedgerEntryOperatorHandoffPreflightStillTrusted,
    true,
    "worker selection requires trusted operator-handoff preflight",
  );
  assertEqual(result.retryLedgerEntryOperatorHandoffStillTrusted, true, "worker selection keeps trusted handoff");
  assertEqual(result.hostRetryWorkerSelectionIntentAccepted, true, "worker selection accepts host selection intent");
  assertEqual(result.selectedRetryControlMode, "host_owned_foreground_manual_reinvoke", "worker selection defaults to host foreground reinvoke");
  assertEqual(result.operatorMustSelectFutureRetryWorker, false, "worker selection closes future operator-selection requirement");
  assertEqual(result.hostMustSupplyRetryWorkerHandler, true, "worker selection requires a future host handler");
  assertEqual(result.colonyRetryWorkerSelected, false, "worker selection selects no Colony retry worker");
  assertEqual(result.colonyRetryWorkerExecutable, false, "worker selection makes no retry worker executable");
  assertEqual(result.retryWorkerReady, false, "worker selection readies no retry worker");
  assertEqual(result.retryScheduleReady, false, "worker selection readies no retry schedule");
  assertEqual(result.retryWorkerCreated, false, "worker selection creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "worker selection creates no retry schedule");
  assertEqual(result.backgroundRetryCreated, false, "worker selection creates no background retry");
  assertEqual(result.automaticVendorRetryAllowed, false, "worker selection allows no automatic vendor retry");
  assertEqual(result.credentialPersistenceCreated, false, "worker selection persists no credentials");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "worker selection enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "worker selection enables no public hosting");
  assertEqual(
    result.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelectionTruth,
    "retry_control_work_item_closure_retry_ledger_entry_operator_handoff_preflight_bound_worker_selection_intent_no_worker_or_schedule",
    "worker selection truth is explicit",
  );
  assert(!containsPhase214ForbiddenTruth(result), "trusted worker selection leaks no raw truth");
}

async function verifyWorkerSelectionIsDeterministic(): Promise<void> {
  section("2. Worker Selection Intent Is Deterministic");
  const preflight = await operatorHandoffPreflightFixture("phase214_stable");
  const otherPreflight = await operatorHandoffPreflightFixture("phase214_other");
  const first =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection({
      retryLedgerEntryOperatorHandoffPreflight: preflight,
    });
  const second =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection({
      retryLedgerEntryOperatorHandoffPreflight: preflight,
    });
  const changed =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection({
      retryLedgerEntryOperatorHandoffPreflight: otherPreflight,
    });

  assertEqual(first.retryLedgerEntryWorkerSelectionId, second.retryLedgerEntryWorkerSelectionId, "same handoff preflight gives stable worker selection id");
  assert(
    first.retryLedgerEntryWorkerSelectionId !== changed.retryLedgerEntryWorkerSelectionId,
    "different handoff preflight changes worker selection id",
  );
}

async function verifyWorkerSelectionRejectsCopiedOrContaminatedPreflight(): Promise<void> {
  section("3. Copied Or Contaminated Operator-Handoff Preflights Reject");
  const preflight = await operatorHandoffPreflightFixture("phase214_reject");
  const copied = JSON.parse(JSON.stringify(preflight));
  const shallowCopied = { ...preflight };
  const tamperedCopied = {
    ...JSON.parse(JSON.stringify(preflight)),
    retryLedgerEntryOperatorHandoffId: "https://leak.invalid/artifact:phase214/operator-handoff",
    retryLedgerEntryOperatorHandoff: {
      ...JSON.parse(JSON.stringify(preflight.retryLedgerEntryOperatorHandoff)),
      retryLedgerEntryReadinessPlanId: "phase214_/absolute/path/readiness-plan",
      retryLedgerEntryId: "phase214_raw_ref_entry",
      retryLedgerEntryPlanId: "phase-214-media-target-plan",
    },
  };
  const contaminated = {
    ...preflight,
    retryWorkerCreated: true,
    backgroundRetryCreated: true,
    defaultLiveDeliveryEnabled: true,
    rawSourceUrl: "https://leak.invalid/artifact:phase214",
    credentialValue: "phase214-secret-value",
  };

  const copiedResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection({
      retryLedgerEntryOperatorHandoffPreflight: copied,
    });
  const contaminatedResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection({
      retryLedgerEntryOperatorHandoffPreflight: contaminated,
    });
  const shallowCopiedResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection({
      retryLedgerEntryOperatorHandoffPreflight: shallowCopied,
    });
  const tamperedCopiedResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection({
      retryLedgerEntryOperatorHandoffPreflight: tamperedCopied,
    });
  const unsupportedModeResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection({
      retryLedgerEntryOperatorHandoffPreflight: preflight,
      selectedRetryControlMode: "background_colony_retry_worker" as never,
    });

  assertEqual(copiedResult.accepted, false, "JSON-copied operator-handoff preflight is rejected");
  assertEqual(
    copiedResult.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_retry_ledger_entry_operator_handoff_preflight_required",
    "copied preflight rejection is bounded",
  );
  assertEqual(copiedResult.retryLedgerEntryOperatorHandoffPreflightStillTrusted, false, "copied preflight is not trusted");
  assertEqual(copiedResult.retryWorkerCreated, false, "copied preflight creates no retry worker");
  assert(!containsPhase214ForbiddenTruth(copiedResult), "copied preflight rejection leaks no raw truth");

  assertEqual(shallowCopiedResult.accepted, false, "shallow-copied operator-handoff preflight is rejected");
  assertEqual(shallowCopiedResult.retryLedgerEntryOperatorHandoffPreflightStillTrusted, false, "shallow copy is not trusted");
  assertEqual(shallowCopiedResult.retryLedgerEntryOperatorHandoffId, undefined, "shallow copy does not echo handoff id");
  assertEqual(shallowCopiedResult.retryLedgerEntryId, undefined, "shallow copy does not echo entry id");
  assert(!containsPhase214ForbiddenTruth(shallowCopiedResult), "shallow-copy rejection leaks no raw truth");

  assertEqual(tamperedCopiedResult.accepted, false, "tampered copied operator-handoff preflight is rejected");
  assertEqual(tamperedCopiedResult.retryLedgerEntryOperatorHandoffPreflightStillTrusted, false, "tampered copied preflight is not trusted");
  assertEqual(tamperedCopiedResult.retryLedgerEntryOperatorHandoffId, undefined, "tampered copied rejection does not echo handoff id");
  assertEqual(tamperedCopiedResult.retryLedgerEntryReadinessPlanId, undefined, "tampered copied rejection does not echo readiness-plan id");
  assertEqual(tamperedCopiedResult.retryLedgerEntryId, undefined, "tampered copied rejection does not echo entry id");
  assertEqual(tamperedCopiedResult.retryLedgerEntryPlanId, undefined, "tampered copied rejection does not echo plan id");
  assert(!containsPhase214ForbiddenTruth(tamperedCopiedResult), "tampered copied rejection leaks no raw id/ref/target/path truth");

  assertEqual(contaminatedResult.accepted, false, "contaminated operator-handoff preflight is rejected");
  assertEqual(contaminatedResult.retryWorkerStillBlocked, false, "contaminated retry-worker claim is surfaced");
  assertEqual(contaminatedResult.defaultLiveDeliveryStillBlocked, false, "contaminated live-delivery claim is surfaced");
  assertEqual(contaminatedResult.retryWorkerCreated, false, "contaminated preflight creates no retry worker");
  assertEqual(contaminatedResult.defaultLiveDeliveryEnabled, false, "contaminated preflight enables no default live delivery");
  assert(
    !JSON.stringify(contaminatedResult).includes("phase214-secret-value") &&
      !JSON.stringify(contaminatedResult).includes("leak.invalid"),
    "contaminated rejection leaks no generic raw URL/path/credential values",
  );
  assert(!containsPhase214ForbiddenTruth(contaminatedResult), "contaminated rejection leaks no raw truth");

  assertEqual(unsupportedModeResult.accepted, false, "unsupported retry-control worker selection mode is rejected");
  assertEqual(
    unsupportedModeResult.reasonCode,
    "external_media_transfer_retry_control_work_item_closure_retry_ledger_entry_worker_selection_mode_unsupported",
    "unsupported worker mode rejection is bounded",
  );
  assertEqual(unsupportedModeResult.retryWorkerCreated, false, "unsupported worker mode creates no retry worker");
  assertEqual(unsupportedModeResult.retryScheduleCreated, false, "unsupported worker mode creates no retry schedule");
}

async function verifyTrustedPreflightMutationIsBlocked(): Promise<void> {
  section("4. Trusted Operator-Handoff Preflight Mutation Is Blocked");
  const preflight = await operatorHandoffPreflightFixture("phase214_mutation");

  try {
    (preflight as { retryWorkerCreated?: boolean }).retryWorkerCreated = true;
  } catch {
    // Frozen trusted preflights may throw under strict runtimes.
  }
  try {
    (preflight.retryLedgerEntryOperatorHandoff as { retryWorkerCreated?: boolean }).retryWorkerCreated = true;
  } catch {
    // Frozen trusted handoff payloads may throw under strict runtimes.
  }
  try {
    (
      preflight.retryLedgerEntryOperatorHandoff?.sourceRefFingerprints as unknown as Array<Record<string, unknown>>
    )?.push({ rawSourceUrl: "https://leak.invalid/artifact:phase214/nested" });
  } catch {
    // Frozen nested arrays may throw under strict runtimes.
  }

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection({
      retryLedgerEntryOperatorHandoffPreflight: preflight,
    });

  assertEqual(preflight.retryWorkerCreated, false, "trusted preflight cannot be top-level contaminated");
  assertEqual(
    preflight.retryLedgerEntryOperatorHandoff?.retryWorkerCreated,
    false,
    "trusted nested handoff cannot be contaminated",
  );
  assertEqual(result.accepted, true, "mutation-blocked trusted preflight still creates worker selection");
  assertEqual(result.retryWorkerCreated, false, "mutation-blocked result creates no retry worker");
  assertEqual(result.publicHostingEnabled, false, "mutation-blocked result enables no public hosting");
  assert(!containsPhase214ForbiddenTruth(result), "mutation-blocked result leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 214 Verification (Retry-Control Work-Item Closure Retry-Ledger Entry Worker Selection Intent)\n");
  await verifyTrustedWorkerSelectionIntent();
  await verifyWorkerSelectionIsDeterministic();
  await verifyWorkerSelectionRejectsCopiedOrContaminatedPreflight();
  await verifyTrustedPreflightMutationIsBlocked();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 214: retry-control work-item closure retry-ledger entry worker selection intent is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
