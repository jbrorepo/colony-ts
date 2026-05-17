/** Phase 219 Verification - Retry-Ledger Entry Worker Execution Plan Preflight */

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection,
  createExternalChannelMediaTransferWorkerHandler,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan,
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

function containsPhase219ForbiddenTruth(value: unknown): boolean {
  if (containsPhase214ForbiddenTruth(value)) return true;
  const serialized = JSON.stringify(value);
  if (!serialized) return false;
  return ["artifact:phase219", "phase219_", "phase-219-media", "Phase 219 media"].some((marker) =>
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

async function executionPlanPreflightFixture(prefix: string): Promise<{
  handlerReadiness: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness;
  handoff: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff;
  preflight: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoffPreflightResult;
  executionPlan: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan;
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

  const executionPlan =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan({
      retryLedgerEntryWorkerHandlerReadiness: readiness.retryLedgerEntryWorkerHandlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoffResult.retryLedgerEntryWorkerInvocationHandoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: preflight,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(executionPlan.accepted, true, "fixture retry-ledger worker execution plan is accepted");
  assert(Boolean(executionPlan.retryLedgerEntryWorkerExecutionPlan), "fixture returns trusted retry-ledger worker execution plan");

  return {
    handlerReadiness:
      readiness.retryLedgerEntryWorkerHandlerReadiness as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness,
    handoff:
      handoffResult.retryLedgerEntryWorkerInvocationHandoff as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff,
    preflight,
    executionPlan:
      executionPlan.retryLedgerEntryWorkerExecutionPlan as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan,
  };
}

async function verifyTrustedExecutionPlanPreflightAcceptsCurrentPlan(): Promise<void> {
  section("1. Trusted Execution Plan Preflight Accepts Current Plan");
  const { handlerReadiness, handoff, preflight, executionPlan } =
    await executionPlanPreflightFixture("phase219_trusted");
  let handlerCalled = false;

  const result =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: preflight,
      retryLedgerEntryWorkerExecutionPlan: executionPlan,
      mediaTransferHandler: capableWorkerHandler(() => {
        handlerCalled = true;
      }),
    });

  assertEqual(result.accepted, true, "trusted execution plan preflight is accepted");
  assertEqual(
    result.retryLedgerEntryWorkerExecutionPlan?.retryLedgerEntryWorkerExecutionPlanId,
    executionPlan.retryLedgerEntryWorkerExecutionPlanId,
    "preflight returns the trusted supplied execution plan",
  );
  assertEqual(result.retryLedgerEntryWorkerExecutionPlanIdMatched, true, "execution plan id matches current truth");
  assertEqual(result.retryLedgerEntryWorkerExecutionPlanStillTrusted, true, "execution plan is still trusted");
  assertEqual(result.retryLedgerEntryWorkerExecutionPlanAccepted, true, "execution plan accepted claim is preserved");
  assertEqual(result.hostRetryWorkerExecutionPlanReady, true, "host worker execution plan is ready");
  assertEqual(result.hostRetryWorkerExecutionPlanPreflightAccepted, true, "host worker execution plan preflight is accepted");
  assertEqual(result.hostExecutionRequired, true, "host execution remains required later");
  assertEqual(result.hostExecutionAttempted, false, "execution-plan preflight does not execute host handler");
  assertEqual(result.hostRetryWorkerHandlerExecuted, false, "execution-plan preflight records no handler execution");
  assertEqual(handlerCalled, false, "execution-plan preflight never calls supplied handler");
  assertEqual(result.retryWorkerReady, false, "execution-plan preflight readies no Colony retry worker");
  assertEqual(result.retryScheduleReady, false, "execution-plan preflight readies no retry schedule");
  assertEqual(result.retryWorkerCreated, false, "execution-plan preflight creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "execution-plan preflight creates no retry schedule");
  assertEqual(result.backgroundRetryCreated, false, "execution-plan preflight creates no background retry");
  assertEqual(result.automaticVendorRetryAllowed, false, "execution-plan preflight allows no automatic vendor retry");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "execution-plan preflight enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "execution-plan preflight enables no public hosting");
  assertEqual(
    result.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlanPreflightTruth,
    "trusted_retry_control_work_item_closure_retry_ledger_entry_worker_execution_plan_preflight_no_handler_execution_worker_or_schedule",
    "execution-plan preflight truth is explicit",
  );
  assert(!containsPhase219ForbiddenTruth(result), "trusted execution-plan preflight leaks no raw truth");
}

async function verifyCopiedTamperedMissingAndContaminatedExecutionPlanReject(): Promise<void> {
  section("2. Copied, Tampered, Missing, And Contaminated Execution Plans Reject");
  const { handlerReadiness, handoff, preflight, executionPlan } =
    await executionPlanPreflightFixture("phase219_reject");
  let handlerCalls = 0;
  const copied = JSON.parse(JSON.stringify(executionPlan));
  const tampered = {
    ...JSON.parse(JSON.stringify(executionPlan)),
    retryLedgerEntryWorkerExecutionPlanId: "artifact:phase219/raw-plan",
    retryLedgerEntryWorkerHandlerReadinessId: "phase219_/absolute/path/readiness",
    retryLedgerEntryWorkerSelectionId: "https://leak.invalid/phase-219-media-selection",
    transferKeyMatched: false,
  };
  const contaminated = {
    ...executionPlan,
    hostExecutionAttempted: true,
    hostRetryWorkerHandlerExecuted: true,
    retryWorkerReady: true,
    retryWorkerCreated: true,
    retryScheduleCreated: true,
    automaticVendorRetryAllowed: true,
    defaultLiveDeliveryEnabled: true,
    rawSourceUrl: "https://leak.invalid/artifact:phase219",
    credentialValue: "phase219-secret-value",
  };

  const copiedResult =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: preflight,
      retryLedgerEntryWorkerExecutionPlan: copied,
      mediaTransferHandler: capableWorkerHandler(() => {
        handlerCalls++;
      }),
    });
  const tamperedResult =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: preflight,
      retryLedgerEntryWorkerExecutionPlan: tampered,
      mediaTransferHandler: capableWorkerHandler(() => {
        handlerCalls++;
      }),
    });
  const contaminatedResult =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: preflight,
      retryLedgerEntryWorkerExecutionPlan: contaminated,
      mediaTransferHandler: capableWorkerHandler(() => {
        handlerCalls++;
      }),
    });
  const missingResult =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: preflight,
      mediaTransferHandler: capableWorkerHandler(() => {
        handlerCalls++;
      }),
    });

  assertEqual(copiedResult.accepted, false, "JSON-copied execution plan is rejected");
  assertEqual(
    copiedResult.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_retry_ledger_entry_worker_execution_plan_required",
    "copied execution plan rejection is bounded",
  );
  assertEqual(copiedResult.retryLedgerEntryWorkerExecutionPlanStillTrusted, false, "copied execution plan is not trusted");
  assertEqual(copiedResult.retryLedgerEntryWorkerExecutionPlanIdMatched, true, "copied execution plan id still matches");
  assert(!containsPhase219ForbiddenTruth(copiedResult), "copied execution plan rejection leaks no raw truth");

  assertEqual(tamperedResult.accepted, false, "tampered execution plan is rejected");
  assertEqual(
    tamperedResult.reasonCode,
    "external_media_transfer_retry_control_work_item_closure_retry_ledger_entry_worker_execution_plan_current_truth_mismatch",
    "tampered execution plan rejection is bounded",
  );
  assertEqual(tamperedResult.retryLedgerEntryWorkerExecutionPlanIdMatched, false, "tampered execution plan id mismatches");
  assertEqual(tamperedResult.retryLedgerEntryWorkerHandlerReadinessId, undefined, "tampered execution plan does not echo untrusted readiness id");
  assertEqual(tamperedResult.retryLedgerEntryWorkerSelectionId, undefined, "tampered execution plan does not echo untrusted selection id");
  assert(!containsPhase219ForbiddenTruth(tamperedResult), "tampered execution plan rejection leaks no raw truth");

  assertEqual(contaminatedResult.accepted, false, "contaminated execution plan is rejected");
  assertEqual(contaminatedResult.hostExecutionAttempted, false, "contaminated execution plan does not execute handler");
  assertEqual(contaminatedResult.retryWorkerStillBlocked, false, "contaminated retry-worker claim is surfaced");
  assertEqual(contaminatedResult.automaticVendorRetryStillBlocked, false, "contaminated automatic retry claim is surfaced");
  assertEqual(contaminatedResult.defaultLiveDeliveryStillBlocked, false, "contaminated live-delivery claim is surfaced");
  assertEqual(contaminatedResult.retryWorkerCreated, false, "contaminated execution plan creates no retry worker");
  assertEqual(contaminatedResult.automaticVendorRetryAllowed, false, "contaminated execution plan allows no automatic retry");
  assert(
    !JSON.stringify(contaminatedResult).includes("phase219-secret-value") &&
      !JSON.stringify(contaminatedResult).includes("leak.invalid"),
    "contaminated rejection leaks no generic raw URL/path/credential values",
  );
  assert(!containsPhase219ForbiddenTruth(contaminatedResult), "contaminated execution plan rejection leaks no raw truth");

  assertEqual(missingResult.accepted, false, "missing execution plan is rejected");
  assertEqual(
    missingResult.reasonCode,
    "valid_external_media_transfer_retry_control_work_item_closure_retry_ledger_entry_worker_execution_plan_required",
    "missing execution plan rejection is bounded",
  );
  assertEqual(missingResult.retryLedgerEntryWorkerExecutionPlanStillTrusted, false, "missing execution plan is not trusted");
  assertEqual(missingResult.retryLedgerEntryWorkerExecutionPlanIdMatched, false, "missing execution plan has no matched supplied id");
  assertEqual(handlerCalls, 0, "rejection preflights never call supplied handler");
  assert(!containsPhase219ForbiddenTruth(missingResult), "missing execution plan rejection leaks no raw truth");
}

async function verifyExecutionPlanPreflightMutationIsBlocked(): Promise<void> {
  section("3. Trusted Execution Plan Preflight Mutation Is Blocked");
  const { handlerReadiness, handoff, preflight, executionPlan } =
    await executionPlanPreflightFixture("phase219_mutation");
  const result =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: preflight,
      retryLedgerEntryWorkerExecutionPlan: executionPlan,
      mediaTransferHandler: capableWorkerHandler(),
    });

  try {
    (result as { hostRetryWorkerExecutionPlanPreflightAccepted?: boolean }).hostRetryWorkerExecutionPlanPreflightAccepted = false;
  } catch {
    // Trusted execution-plan preflight results may throw under strict runtimes.
  }
  try {
    if (result.retryLedgerEntryWorkerExecutionPlan?.sourceRefFingerprints) {
      (result.retryLedgerEntryWorkerExecutionPlan.sourceRefFingerprints as unknown as Array<Record<string, unknown>>).push({
        rawSourceUrl: "https://leak.invalid/artifact:phase219/nested",
      });
    }
  } catch {
    // Frozen nested arrays may throw under strict runtimes.
  }

  assertEqual(result.accepted, true, "trusted execution-plan preflight is mutation-blocked");
  assertEqual(
    result.hostRetryWorkerExecutionPlanPreflightAccepted,
    true,
    "trusted execution-plan preflight cannot be top-level contaminated",
  );
  assertEqual(
    result.retryLedgerEntryWorkerExecutionPlan?.sourceRefFingerprints.length,
    executionPlan.sourceRefFingerprints.length,
    "trusted execution plan source fingerprints cannot be appended",
  );
  assertEqual(result.hostExecutionAttempted, false, "mutation-blocked execution-plan preflight still does not execute");
  assertEqual(result.retryWorkerCreated, false, "mutation-blocked execution-plan preflight creates no retry worker");
  assertEqual(result.publicHostingEnabled, false, "mutation-blocked execution-plan preflight enables no public hosting");
  assert(!containsPhase219ForbiddenTruth(result), "mutation-blocked execution-plan preflight leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 219 Verification (Retry-Ledger Entry Worker Execution Plan Preflight)\n");
  await verifyTrustedExecutionPlanPreflightAcceptsCurrentPlan();
  await verifyCopiedTamperedMissingAndContaminatedExecutionPlanReject();
  await verifyExecutionPlanPreflightMutationIsBlocked();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 219: retry-ledger entry worker execution plan preflight is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
