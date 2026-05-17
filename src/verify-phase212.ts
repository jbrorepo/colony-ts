/** Phase 212 Verification - Retry-Control Work-Item Closure Retry-Ledger Entry Operator Handoff */

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryOperatorHandoff,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryReadinessPlan,
} from "./channel";
import {
  containsPhase211ForbiddenTruth,
  readinessPlanFixture,
} from "./verify-phase211";

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

export function containsPhase212ForbiddenTruth(value: unknown): boolean {
  if (containsPhase211ForbiddenTruth(value)) return true;
  const serialized = JSON.stringify(value);
  if (!serialized) return false;
  return ["artifact:phase212", "phase212_", "phase-212-media", "Phase 212 media"].some((marker) =>
    serialized.includes(marker),
  );
}

export async function trustedReadinessPlanPreflightFixture(prefix: string) {
  const readinessPlanResult = await readinessPlanFixture(prefix);
  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryReadinessPlan({
      retryLedgerEntryPreflight: readinessPlanResult.retryLedgerEntryPreflight,
      retryLedgerEntryReadinessPlan: readinessPlanResult.retryLedgerEntryReadinessPlan,
    });
  assertEqual(preflight.accepted, true, "fixture retry-ledger readiness-plan preflight is accepted");
  assert(Boolean(preflight.retryLedgerEntryReadinessPlan), "fixture returns trusted retry-ledger readiness-plan preflight");
  return preflight;
}

async function verifyTrustedPreflightCreatesOperatorHandoff(): Promise<void> {
  section("1. Trusted Readiness-Plan Preflight Creates Operator Handoff");
  const preflight = await trustedReadinessPlanPreflightFixture("phase212_trusted");

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryOperatorHandoff({
      retryLedgerEntryReadinessPlanPreflight: preflight,
    });
  const repeated =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryOperatorHandoff({
      retryLedgerEntryReadinessPlanPreflight: preflight,
    });

  assertEqual(result.accepted, true, "trusted preflight-bound operator handoff is accepted");
  assert(Boolean(result.retryLedgerEntryOperatorHandoff), "trusted preflight returns operator handoff");
  assertEqual(result.retryLedgerEntryReadinessPlanPreflightAccepted, true, "operator handoff requires accepted readiness-plan preflight");
  assertEqual(result.retryLedgerEntryReadinessPlanPreflightStillTrusted, true, "operator handoff requires trusted readiness-plan preflight");
  assertEqual(result.retryLedgerEntryReadinessPlanStillTrusted, true, "operator handoff requires trusted readiness plan");
  assertEqual(result.retryLedgerEntryStillTrusted, true, "operator handoff keeps trusted retry-ledger entry context");
  assertEqual(result.hostOwnedRetryControlRequired, true, "operator handoff requires host-owned retry control");
  assertEqual(result.operatorMustSelectFutureRetryWorker, true, "operator handoff requires future worker selection");
  assertEqual(result.colonyRetryWorkerSelected, false, "operator handoff selects no Colony retry worker");
  assertEqual(result.colonyRetryWorkerExecutable, false, "operator handoff executes no Colony retry worker");
  assertEqual(result.retryWorkerReady, false, "operator handoff does not ready a retry worker");
  assertEqual(result.retryScheduleReady, false, "operator handoff does not ready a retry schedule");
  assertEqual(result.retryWorkerCreated, false, "operator handoff creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "operator handoff creates no retry schedule");
  assertEqual(result.backgroundRetryCreated, false, "operator handoff creates no background retry");
  assertEqual(result.automaticVendorRetryAllowed, false, "operator handoff allows no automatic vendor retry");
  assertEqual(result.credentialPersistenceCreated, false, "operator handoff persists no credentials");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "operator handoff enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "operator handoff enables no public hosting");
  assertEqual(
    result.retryLedgerEntryOperatorHandoff?.retryLedgerEntryReadinessPlanId,
    preflight.retryLedgerEntryReadinessPlanId,
    "operator handoff binds readiness plan id",
  );
  assertEqual(
    result.retryLedgerEntryOperatorHandoffId,
    repeated.retryLedgerEntryOperatorHandoffId,
    "operator handoff id is deterministic",
  );
  assertEqual(
    result.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryOperatorHandoffTruth,
    "retry_control_work_item_closure_retry_ledger_entry_readiness_plan_preflight_bound_operator_handoff_no_worker_or_schedule",
    "operator handoff truth is explicit",
  );
  assert(!containsPhase212ForbiddenTruth(result), "trusted operator handoff leaks no raw truth");
}

async function verifyCopiedOrContaminatedPreflightRejects(): Promise<void> {
  section("2. Copied Or Contaminated Preflight Rejects");
  const preflight = await trustedReadinessPlanPreflightFixture("phase212_copied");
  const copied = JSON.parse(JSON.stringify(preflight));
  const shallowCopied = { ...preflight };
  const contaminated = {
    ...preflight,
    retryLedgerEntryId: "https://leak.invalid/artifact:phase212-entry",
    retryLedgerEntryPlanId: "C:\\secret\\phase212-plan-token.txt",
    retryWorkerCreated: true,
    rawSourceUrl: "https://leak.invalid/artifact:phase212",
    credentialPersistencePath: "C:\\secret\\phase212-token.txt",
    credentialValue: "phase212-secret-value",
  };

  const copiedResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryOperatorHandoff({
      retryLedgerEntryReadinessPlanPreflight: copied,
    });
  const shallowResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryOperatorHandoff({
      retryLedgerEntryReadinessPlanPreflight: shallowCopied,
    });
  const contaminatedResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryOperatorHandoff({
      retryLedgerEntryReadinessPlanPreflight: contaminated,
    });

  assertEqual(copiedResult.accepted, false, "JSON-copied readiness-plan preflight is rejected");
  assertEqual(
    copiedResult.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_retry_ledger_entry_readiness_plan_preflight_required",
    "copied preflight rejection is bounded",
  );
  assertEqual(copiedResult.retryLedgerEntryReadinessPlanPreflightStillTrusted, false, "copied preflight is not trusted");
  assertEqual(copiedResult.retryWorkerCreated, false, "copied preflight creates no retry worker");
  assert(!containsPhase212ForbiddenTruth(copiedResult), "copied rejection leaks no raw truth");

  assertEqual(shallowResult.accepted, false, "shallow-copied readiness-plan preflight is rejected");
  assertEqual(shallowResult.retryLedgerEntryReadinessPlanPreflightStillTrusted, false, "shallow copy is not trusted");
  assertEqual(shallowResult.retryLedgerEntryReadinessPlanStillTrusted, true, "shallow copy can retain trusted readiness plan");
  assertEqual(shallowResult.defaultLiveDeliveryEnabled, false, "shallow rejection enables no default live delivery");
  assert(!containsPhase212ForbiddenTruth(shallowResult), "shallow-copy rejection leaks no raw truth");

  assertEqual(contaminatedResult.accepted, false, "contaminated readiness-plan preflight is rejected");
  assertEqual(contaminatedResult.retryWorkerStillBlocked, false, "contaminated retry-worker claim is surfaced");
  assertEqual(contaminatedResult.retryWorkerCreated, false, "contaminated preflight creates no retry worker");
  assertEqual(contaminatedResult.publicHostingEnabled, false, "contaminated preflight enables no public hosting");
  assert(
    !JSON.stringify(contaminatedResult).includes("phase212-token") &&
      !JSON.stringify(contaminatedResult).includes("phase212-entry") &&
      !JSON.stringify(contaminatedResult).includes("phase212-plan-token") &&
      !JSON.stringify(contaminatedResult).includes("phase212-secret-value") &&
      !JSON.stringify(contaminatedResult).includes("leak.invalid"),
    "contaminated rejection leaks no generic raw URL/path/credential values",
  );
  assert(!containsPhase212ForbiddenTruth(contaminatedResult), "contaminated rejection leaks no raw truth");
}

async function verifyTrustedPreflightMutationIsBlocked(): Promise<void> {
  section("3. Trusted Readiness-Plan Preflight Mutation Is Blocked");
  const preflight = await trustedReadinessPlanPreflightFixture("phase212_nested");

  let topLevelMutationBlocked = false;
  try {
    (preflight as unknown as Record<string, unknown>).retryWorkerCreated = true;
  } catch {
    topLevelMutationBlocked = true;
  }

  let nestedMutationBlocked = false;
  try {
    (preflight.retryLedgerEntryReadinessPlan as unknown as Record<string, unknown>).rawSourceUrl =
      "https://example.invalid/artifact:phase212";
  } catch {
    nestedMutationBlocked = true;
  }

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryOperatorHandoff({
      retryLedgerEntryReadinessPlanPreflight: preflight,
    });

  assert(
    topLevelMutationBlocked || preflight.retryWorkerCreated === false,
    "trusted readiness-plan preflight cannot be top-level contaminated",
  );
  assert(
    nestedMutationBlocked ||
      !("rawSourceUrl" in (preflight.retryLedgerEntryReadinessPlan as unknown as Record<string, unknown>)),
    "trusted nested readiness plan cannot be contaminated",
  );
  assertEqual(result.accepted, true, "mutation-blocked trusted preflight still creates handoff");
  assertEqual(result.retryWorkerCreated, false, "mutation-blocked result creates no retry worker");
  assertEqual(result.publicHostingEnabled, false, "mutation-blocked result enables no public hosting");
  assert(!containsPhase212ForbiddenTruth(result), "mutation-blocked result leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 212 Verification (Retry-Control Work-Item Closure Retry-Ledger Entry Operator Handoff)\n");
  await verifyTrustedPreflightCreatesOperatorHandoff();
  await verifyCopiedOrContaminatedPreflightRejects();
  await verifyTrustedPreflightMutationIsBlocked();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 212: retry-control work-item closure retry-ledger entry operator handoff is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
