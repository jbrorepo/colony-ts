/** Phase 218 Verification - Retry-Control Work-Item Closure Retry-Ledger Entry Worker Execution Plan */

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection,
  createExternalChannelMediaTransferWorkerHandler,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoffPreflightResult,
} from "./channel";
import { containsPhase214ForbiddenTruth, operatorHandoffPreflightFixture } from "./verify-phase214";

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

function containsPhase218ForbiddenTruth(value: unknown): boolean {
  if (containsPhase214ForbiddenTruth(value)) return true;
  const serialized = JSON.stringify(value);
  if (!serialized) return false;
  return ["artifact:phase218", "phase218_", "phase-218-media", "Phase 218 media"].some((marker) =>
    serialized.includes(marker),
  );
}

function capableWorkerHandler(onCall?: () => void) {
  return createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => {
      onCall?.();
      return {
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
      };
    },
    sendToVendor: async (action) => {
      onCall?.();
      return {
        accepted: true,
        transferKey: action.transferKey,
        deliveredCount: action.files.length,
      };
    },
  });
}

async function workerExecutionPlanFixture(prefix: string): Promise<{
  handlerReadiness: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness;
  handoff: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff;
  preflight: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoffPreflightResult;
}> {
  const operatorPreflight = await operatorHandoffPreflightFixture(prefix);
  const selection =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection({
      retryLedgerEntryOperatorHandoffPreflight: operatorPreflight,
    });
  assertEqual(selection.accepted, true, "fixture retry-ledger worker selection is accepted");
  assert(Boolean(selection.retryLedgerEntryWorkerSelection), "fixture returns trusted retry-ledger worker selection");

  const readiness =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness({
      retryLedgerEntryWorkerSelection: selection.retryLedgerEntryWorkerSelection,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(readiness.accepted, true, "fixture retry-ledger worker handler-readiness is accepted");
  assert(Boolean(readiness.retryLedgerEntryWorkerHandlerReadiness), "fixture returns trusted retry-ledger worker handler-readiness");

  const handoffResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: readiness.retryLedgerEntryWorkerHandlerReadiness,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(handoffResult.accepted, true, "fixture retry-ledger worker invocation handoff is accepted");
  assert(Boolean(handoffResult.retryLedgerEntryWorkerInvocationHandoff), "fixture returns trusted retry-ledger worker invocation handoff");

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: readiness.retryLedgerEntryWorkerHandlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoffResult.retryLedgerEntryWorkerInvocationHandoff,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(preflight.accepted, true, "fixture retry-ledger worker invocation handoff preflight is accepted");
  assert(Boolean(preflight.retryLedgerEntryWorkerInvocationHandoff), "fixture returns trusted retry-ledger worker invocation handoff preflight");

  return {
    handlerReadiness:
      readiness.retryLedgerEntryWorkerHandlerReadiness as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness,
    handoff:
      handoffResult.retryLedgerEntryWorkerInvocationHandoff as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff,
    preflight,
  };
}

async function verifyTrustedPreflightCreatesExecutionPlan(): Promise<void> {
  section("1. Trusted Invocation Handoff Preflight Creates Execution Plan");
  const { handlerReadiness, handoff, preflight } = await workerExecutionPlanFixture("phase218_trusted");
  let handlerCalled = false;

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: preflight,
      mediaTransferHandler: capableWorkerHandler(() => {
        handlerCalled = true;
      }),
    });

  assertEqual(result.accepted, true, "trusted preflight creates worker execution plan");
  assert(Boolean(result.retryLedgerEntryWorkerExecutionPlan), "execution plan descriptor is returned");
  assertEqual(
    result.retryLedgerEntryWorkerExecutionPlan?.retryLedgerEntryWorkerInvocationHandoffId,
    handoff.retryLedgerEntryWorkerInvocationHandoffId,
    "execution plan binds invocation handoff id",
  );
  assertEqual(
    result.retryLedgerEntryWorkerExecutionPlan?.retryLedgerEntryWorkerHandlerReadinessId,
    handlerReadiness.retryLedgerEntryWorkerHandlerReadinessId,
    "execution plan binds handler-readiness id",
  );
  assertEqual(result.retryLedgerEntryWorkerInvocationHandoffPreflightAccepted, true, "execution plan accepts preflight");
  assertEqual(result.retryLedgerEntryWorkerInvocationHandoffPreflightStillTrusted, true, "execution plan keeps preflight trusted");
  assertEqual(result.hostRetryWorkerExecutionPlanReady, true, "execution plan marks host foreground plan ready");
  assertEqual(result.hostExecutionRequired, true, "execution plan preserves host execution requirement");
  assertEqual(result.hostExecutionAttempted, false, "execution plan does not execute host handler");
  assertEqual(result.hostRetryWorkerHandlerExecuted, false, "execution plan records no handler execution");
  assertEqual(handlerCalled, false, "execution planning never calls supplied handler");
  assertEqual(result.retryWorkerReady, false, "execution plan readies no Colony retry worker");
  assertEqual(result.retryScheduleReady, false, "execution plan readies no retry schedule");
  assertEqual(result.retryWorkerCreated, false, "execution plan creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "execution plan creates no retry schedule");
  assertEqual(result.backgroundRetryCreated, false, "execution plan creates no background retry");
  assertEqual(result.automaticVendorRetryAllowed, false, "execution plan allows no automatic vendor retry");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "execution plan enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "execution plan enables no public hosting");
  assertEqual(
    result.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlanTruth,
    "trusted_retry_control_work_item_closure_retry_ledger_entry_worker_invocation_handoff_preflight_bound_execution_plan_no_handler_execution_worker_or_schedule",
    "execution plan truth is explicit",
  );
  assert(!containsPhase218ForbiddenTruth(result), "trusted execution plan leaks no raw truth");
}

async function verifyCopiedAndTamperedPreflightReject(): Promise<void> {
  section("2. Copied And Tampered Invocation Handoff Preflight Reject");
  const { handlerReadiness, handoff, preflight } = await workerExecutionPlanFixture("phase218_reject");
  const copied = JSON.parse(JSON.stringify(preflight));
  const tampered = {
    ...JSON.parse(JSON.stringify(preflight)),
    retryLedgerEntryWorkerInvocationHandoffId: "artifact:phase218/raw-handoff",
    retryLedgerEntryWorkerHandlerReadinessId: "phase218_/absolute/path/readiness",
    retryLedgerEntryWorkerSelectionId: "https://leak.invalid/phase-218-media-selection",
    transferKeyMatched: false,
  };
  const contaminated = {
    ...preflight,
    hostExecutionAttempted: true,
    hostRetryWorkerHandlerExecuted: true,
    retryWorkerReady: true,
    retryWorkerCreated: true,
    retryScheduleCreated: true,
    automaticVendorRetryAllowed: true,
    defaultLiveDeliveryEnabled: true,
    rawSourceUrl: "https://leak.invalid/artifact:phase218",
    credentialValue: "phase218-secret-value",
  };

  const copiedResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: copied,
      mediaTransferHandler: capableWorkerHandler(),
    });
  const tamperedResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: tampered,
      mediaTransferHandler: capableWorkerHandler(),
    });
  const contaminatedResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: contaminated,
      mediaTransferHandler: capableWorkerHandler(),
    });
  const missingPreflightResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoff,
      mediaTransferHandler: capableWorkerHandler(),
    });

  assertEqual(copiedResult.accepted, false, "JSON-copied preflight is rejected");
  assertEqual(
    copiedResult.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_retry_ledger_entry_worker_invocation_handoff_preflight_required",
    "copied preflight rejection is bounded",
  );
  assertEqual(copiedResult.retryLedgerEntryWorkerInvocationHandoffPreflightStillTrusted, false, "copied preflight is not trusted");
  assertEqual(copiedResult.retryLedgerEntryWorkerInvocationHandoffPreflightIdMatched, true, "copied preflight current handoff id still matches");
  assert(!containsPhase218ForbiddenTruth(copiedResult), "copied preflight rejection leaks no raw truth");

  assertEqual(tamperedResult.accepted, false, "tampered preflight is rejected");
  assertEqual(
    tamperedResult.reasonCode,
    "external_media_transfer_retry_control_work_item_closure_retry_ledger_entry_worker_invocation_handoff_preflight_current_truth_mismatch",
    "tampered preflight rejection is bounded",
  );
  assertEqual(tamperedResult.retryLedgerEntryWorkerInvocationHandoffPreflightIdMatched, false, "tampered preflight mismatches handoff id");
  assertEqual(tamperedResult.retryLedgerEntryWorkerHandlerReadinessId, undefined, "tampered preflight does not echo untrusted readiness id");
  assertEqual(tamperedResult.retryLedgerEntryWorkerSelectionId, undefined, "tampered preflight does not echo untrusted selection id");
  assert(!containsPhase218ForbiddenTruth(tamperedResult), "tampered preflight rejection leaks no raw truth");

  assertEqual(contaminatedResult.accepted, false, "contaminated preflight is rejected");
  assertEqual(contaminatedResult.hostExecutionAttempted, false, "contaminated preflight does not execute handler");
  assertEqual(contaminatedResult.retryWorkerStillBlocked, false, "contaminated retry-worker claim is surfaced");
  assertEqual(contaminatedResult.automaticVendorRetryStillBlocked, false, "contaminated automatic retry claim is surfaced");
  assertEqual(contaminatedResult.defaultLiveDeliveryStillBlocked, false, "contaminated live-delivery claim is surfaced");
  assertEqual(contaminatedResult.retryWorkerCreated, false, "contaminated preflight creates no retry worker");
  assertEqual(contaminatedResult.automaticVendorRetryAllowed, false, "contaminated preflight allows no automatic retry");
  assert(
    !JSON.stringify(contaminatedResult).includes("phase218-secret-value") &&
      !JSON.stringify(contaminatedResult).includes("leak.invalid"),
    "contaminated rejection leaks no generic raw URL/path/credential values",
  );
  assert(!containsPhase218ForbiddenTruth(contaminatedResult), "contaminated preflight rejection leaks no raw truth");

  assertEqual(missingPreflightResult.accepted, false, "missing preflight is rejected");
  assertEqual(
    missingPreflightResult.reasonCode,
    "valid_external_media_transfer_retry_control_work_item_closure_retry_ledger_entry_worker_invocation_handoff_preflight_required",
    "missing preflight rejection is bounded",
  );
  assertEqual(missingPreflightResult.retryLedgerEntryWorkerInvocationHandoffPreflightStillTrusted, false, "missing preflight is not trusted");
  assertEqual(missingPreflightResult.retryLedgerEntryWorkerInvocationHandoffPreflightIdMatched, false, "missing preflight has no matched supplied id");
  assert(!containsPhase218ForbiddenTruth(missingPreflightResult), "missing preflight rejection leaks no raw truth");
}

async function verifyExecutionPlanMutationIsBlocked(): Promise<void> {
  section("3. Trusted Execution Plan Mutation Is Blocked");
  const { handlerReadiness, handoff, preflight } = await workerExecutionPlanFixture("phase218_mutation");
  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: preflight,
      mediaTransferHandler: capableWorkerHandler(),
    });

  try {
    if (result.retryLedgerEntryWorkerExecutionPlan) {
      (result.retryLedgerEntryWorkerExecutionPlan as { retryWorkerCreated?: boolean }).retryWorkerCreated = true;
    }
  } catch {
    // Trusted execution plans may throw under strict runtimes.
  }
  try {
    if (result.retryLedgerEntryWorkerExecutionPlan?.sourceRefFingerprints) {
      (result.retryLedgerEntryWorkerExecutionPlan.sourceRefFingerprints as unknown as Array<Record<string, unknown>>).push({
        rawSourceUrl: "https://leak.invalid/artifact:phase218/nested",
      });
    }
  } catch {
    // Frozen nested arrays may throw under strict runtimes.
  }

  assertEqual(result.accepted, true, "trusted preflight creates mutation-blocked execution plan");
  assertEqual(
    result.retryLedgerEntryWorkerExecutionPlan?.retryWorkerCreated,
    false,
    "trusted execution plan cannot be top-level contaminated",
  );
  assertEqual(
    result.retryLedgerEntryWorkerExecutionPlan?.sourceRefFingerprints.length,
    preflight.retryLedgerEntryWorkerInvocationHandoff?.sourceRefFingerprints.length,
    "trusted execution plan source fingerprints cannot be appended",
  );
  assertEqual(result.hostExecutionAttempted, false, "mutation-blocked execution plan still does not execute");
  assertEqual(result.retryWorkerCreated, false, "mutation-blocked execution plan creates no retry worker");
  assertEqual(result.publicHostingEnabled, false, "mutation-blocked execution plan enables no public hosting");
  assert(!containsPhase218ForbiddenTruth(result), "mutation-blocked execution plan leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 218 Verification (Retry-Control Work-Item Closure Retry-Ledger Entry Worker Execution Plan)\n");
  await verifyTrustedPreflightCreatesExecutionPlan();
  await verifyCopiedAndTamperedPreflightReject();
  await verifyExecutionPlanMutationIsBlocked();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 218: retry-control work-item closure retry-ledger entry worker execution plan is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
