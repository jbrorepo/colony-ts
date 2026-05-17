/** Phase 220 Verification - Retry-Ledger Entry Worker Execution */

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecution,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlanPreflightResult,
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

function containsPhase220ForbiddenTruth(value: unknown): boolean {
  if (containsPhase214ForbiddenTruth(value)) return true;
  const serialized = JSON.stringify(value);
  if (!serialized) return false;
  return ["artifact:phase220", "phase220_", "phase-220-media", "Phase 220 media"].some((marker) =>
    serialized.includes(marker),
  );
}

function capableWorkerHandler(onResolve?: () => void, onSend?: () => void) {
  return createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => {
      onResolve?.();
      return {
        sourceRefFingerprint: request.sourceRefFingerprint,
        name: request.name,
        mimeType: request.mimeType,
        sizeBytes: request.sizeBytes,
        checksumSha256: request.checksumSha256,
      };
    },
    sendToVendor: async (action, resolvedFiles) => {
      onSend?.();
      return {
        accepted: true,
        transferKey: action.transferKey,
        deliveredCount: resolvedFiles.length,
        receipt: {
          status: "sent",
          deliveredCount: resolvedFiles.length,
          inspectedFileCount: resolvedFiles.length,
        },
      };
    },
  });
}

async function executionFixture(prefix: string): Promise<{
  handlerReadiness: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness;
  handoff: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff;
  invocationHandoffPreflight: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoffPreflightResult;
  executionPlan: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan;
  executionPlanPreflight: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlanPreflightResult;
}> {
  const operatorPreflight = await operatorHandoffPreflightFixture(prefix);
  const selection =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection({
      retryLedgerEntryOperatorHandoffPreflight: operatorPreflight,
    });
  assertEqual(selection.accepted, true, "fixture retry-ledger worker selection is accepted");

  const readiness =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness({
      retryLedgerEntryWorkerSelection: selection.retryLedgerEntryWorkerSelection,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(readiness.accepted, true, "fixture retry-ledger worker handler-readiness is accepted");

  const handoffResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: readiness.retryLedgerEntryWorkerHandlerReadiness,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(handoffResult.accepted, true, "fixture retry-ledger worker invocation handoff is accepted");

  const invocationHandoffPreflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: readiness.retryLedgerEntryWorkerHandlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoffResult.retryLedgerEntryWorkerInvocationHandoff,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(invocationHandoffPreflight.accepted, true, "fixture retry-ledger worker invocation handoff preflight is accepted");

  const executionPlanResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan({
      retryLedgerEntryWorkerHandlerReadiness: readiness.retryLedgerEntryWorkerHandlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoffResult.retryLedgerEntryWorkerInvocationHandoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: invocationHandoffPreflight,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(executionPlanResult.accepted, true, "fixture retry-ledger worker execution plan is accepted");

  const executionPlanPreflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan({
      retryLedgerEntryWorkerHandlerReadiness: readiness.retryLedgerEntryWorkerHandlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoffResult.retryLedgerEntryWorkerInvocationHandoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: executionPlanResult.retryLedgerEntryWorkerExecutionPlan,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(executionPlanPreflight.accepted, true, "fixture retry-ledger worker execution plan preflight is accepted");

  return {
    handlerReadiness:
      readiness.retryLedgerEntryWorkerHandlerReadiness as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness,
    handoff:
      handoffResult.retryLedgerEntryWorkerInvocationHandoff as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff,
    invocationHandoffPreflight,
    executionPlan:
      executionPlanResult.retryLedgerEntryWorkerExecutionPlan as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan,
    executionPlanPreflight,
  };
}

async function verifyTrustedExecutionPreflightDrivesOneForegroundHandlerCall(): Promise<void> {
  section("1. Trusted Execution-Plan Preflight Drives One Foreground Handler Call");
  const { handlerReadiness, handoff, invocationHandoffPreflight, executionPlan, executionPlanPreflight } =
    await executionFixture("phase220_trusted");
  let sourceResolveCount = 0;
  let vendorSendCount = 0;

  const result =
    await executeExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecution({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: executionPlanPreflight,
      mediaTransferHandler: capableWorkerHandler(
        () => {
          sourceResolveCount++;
        },
        () => {
          vendorSendCount++;
        },
      ),
    });

  assertEqual(result.accepted, true, "trusted retry-ledger worker execution is accepted");
  assertEqual(result.retryLedgerEntryWorkerExecutionPlanPreflightAccepted, true, "execution requires accepted execution-plan preflight");
  assertEqual(result.retryLedgerEntryWorkerExecutionPlanPreflightStillTrusted, true, "execution requires trusted execution-plan preflight");
  assertEqual(result.hostExecutionAttempted, true, "execution attempts host foreground handler");
  assertEqual(result.hostRetryWorkerHandlerExecutable, true, "execution makes supplied handler executable for this call");
  assertEqual(result.hostRetryWorkerHandlerExecuted, true, "execution records trusted handler execution");
  assertEqual(sourceResolveCount, executionPlan.sourceRefFingerprints.length, "execution resolves each redacted source fingerprint once");
  assertEqual(vendorSendCount, 1, "execution sends to vendor once");
  assertEqual(result.hostResult?.data.transferKey, executionPlan.transferKey, "host result binds plan transfer key");
  assertEqual(result.hostResult?.data.transferKeyEchoMatched, true, "host result preserves transfer-key echo truth");
  assertEqual(result.retryWorkerCreated, false, "execution creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "execution creates no retry schedule");
  assertEqual(result.backgroundRetryCreated, false, "execution creates no background retry");
  assertEqual(result.automaticVendorRetryAllowed, false, "execution allows no automatic vendor retry");
  assertEqual(result.credentialPersistenceCreated, false, "execution persists no credentials");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "execution enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "execution enables no public hosting");
  assertEqual(
    result.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionTruth,
    "trusted_retry_control_work_item_closure_retry_ledger_entry_worker_execution_plan_preflight_bound_foreground_handler_execution_no_worker_or_schedule",
    "execution truth is explicit",
  );
  assert(!containsPhase220ForbiddenTruth(result), "trusted execution leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyCopiedMissingAndContaminatedPreflightRejectBeforeExecution(): Promise<void> {
  section("2. Copied, Missing, And Contaminated Preflights Reject Before Execution");
  const { handlerReadiness, handoff, invocationHandoffPreflight, executionPlan, executionPlanPreflight } =
    await executionFixture("phase220_reject");
  let handlerCalls = 0;
  const copiedPreflight = JSON.parse(JSON.stringify(executionPlanPreflight));
  const contaminatedPreflight = {
    ...executionPlanPreflight,
    hostExecutionAttempted: true,
    hostRetryWorkerHandlerExecuted: true,
    retryWorkerCreated: true,
    defaultLiveDeliveryEnabled: true,
    rawSourceUrl: "https://leak.invalid/artifact:phase220",
    credentialValue: "phase220-secret-value",
  };

  const copiedResult =
    await executeExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecution({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: copiedPreflight,
      mediaTransferHandler: capableWorkerHandler(() => {
        handlerCalls++;
      }),
    });
  const missingResult =
    await executeExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecution({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: executionPlan,
      mediaTransferHandler: capableWorkerHandler(() => {
        handlerCalls++;
      }),
    });
  const contaminatedResult =
    await executeExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecution({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: contaminatedPreflight,
      mediaTransferHandler: capableWorkerHandler(() => {
        handlerCalls++;
      }),
    });

  assertEqual(copiedResult.accepted, false, "JSON-copied execution-plan preflight is rejected");
  assertEqual(
    copiedResult.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_retry_ledger_entry_worker_execution_plan_preflight_required",
    "copied preflight rejection is bounded",
  );
  assertEqual(copiedResult.hostExecutionAttempted, false, "copied preflight rejects before execution");
  assertEqual(copiedResult.hostRetryWorkerHandlerExecuted, false, "copied preflight executes no handler");
  assertEqual(copiedResult.retryLedgerEntryWorkerExecutionPlanPreflightStillTrusted, false, "copied preflight is not trusted");

  assertEqual(missingResult.accepted, false, "missing execution-plan preflight is rejected");
  assertEqual(
    missingResult.reasonCode,
    "valid_external_media_transfer_retry_control_work_item_closure_retry_ledger_entry_worker_execution_plan_preflight_required",
    "missing preflight rejection is bounded",
  );
  assertEqual(missingResult.hostExecutionAttempted, false, "missing preflight rejects before execution");

  assertEqual(contaminatedResult.accepted, false, "contaminated execution-plan preflight is rejected");
  assertEqual(contaminatedResult.hostExecutionAttempted, false, "contaminated preflight does not execute handler");
  assertEqual(contaminatedResult.retryWorkerCreated, false, "contaminated preflight creates no retry worker");
  assertEqual(contaminatedResult.defaultLiveDeliveryEnabled, false, "contaminated preflight enables no default live delivery");
  assert(
    !JSON.stringify(contaminatedResult).includes("phase220-secret-value") &&
      !JSON.stringify(contaminatedResult).includes("leak.invalid"),
    "contaminated rejection leaks no generic raw URL/path/credential values",
  );
  assertEqual(handlerCalls, 0, "rejected execution preflights never call supplied handler");
  assert(!containsPhase220ForbiddenTruth(copiedResult), "copied preflight rejection leaks no raw truth");
  assert(!containsPhase220ForbiddenTruth(missingResult), "missing preflight rejection leaks no raw truth");
  assert(!containsPhase220ForbiddenTruth(contaminatedResult), "contaminated preflight rejection leaks no raw truth");
}

async function verifyMissingOrUnbrandedHandlerRejectsBeforeExecution(): Promise<void> {
  section("3. Missing Or Unbranded Handler Rejects Before Execution");
  const { handlerReadiness, handoff, invocationHandoffPreflight, executionPlan, executionPlanPreflight } =
    await executionFixture("phase220_handler");
  let unbrandedCalled = false;

  const missing =
    await executeExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecution({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: executionPlanPreflight,
      mediaTransferHandler: null,
    });
  const unbranded =
    await executeExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecution({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: executionPlanPreflight,
      mediaTransferHandler: async (action) => {
        unbrandedCalled = true;
        return { accepted: true, transferKey: action.transferKey, deliveredCount: 1 };
      },
    });

  assertEqual(missing.accepted, false, "missing handler is rejected");
  assertEqual(missing.reasonCode, "retry_control_work_item_closure_retry_ledger_entry_worker_execution_handler_required", "missing handler rejection is bounded");
  assertEqual(missing.hostExecutionAttempted, false, "missing handler rejects before execution");
  assertEqual(missing.hostRetryWorkerHandlerExecuted, false, "missing handler executes nothing");

  assertEqual(unbranded.accepted, false, "unbranded handler is rejected");
  assertEqual(
    unbranded.reasonCode,
    "retry_control_work_item_closure_retry_ledger_entry_worker_execution_handler_must_be_trusted_foreground_worker",
    "unbranded handler rejection is bounded",
  );
  assertEqual(unbranded.hostExecutionAttempted, false, "unbranded handler rejects before execution");
  assertEqual(unbrandedCalled, false, "unbranded handler is never called");
  assert(!containsPhase220ForbiddenTruth(unbranded), "unbranded handler rejection leaks no raw truth");
}

async function verifyExecutionResultMutationIsBlocked(): Promise<void> {
  section("4. Trusted Execution Result Mutation Is Blocked");
  const { handlerReadiness, handoff, invocationHandoffPreflight, executionPlan, executionPlanPreflight } =
    await executionFixture("phase220_mutation");
  const result =
    await executeExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecution({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: executionPlanPreflight,
      mediaTransferHandler: capableWorkerHandler(),
    });

  try {
    (result as { retryWorkerCreated?: boolean }).retryWorkerCreated = true;
  } catch {
    // Trusted execution results may throw under strict runtimes.
  }
  try {
    (result.hostResult?.data as { credentialValue?: string }).credentialValue = "phase220-secret-value";
  } catch {
    // Frozen nested host result data may throw under strict runtimes.
  }

  assertEqual(result.accepted, true, "trusted execution result is mutation-blocked");
  assertEqual(result.retryWorkerCreated, false, "trusted execution cannot be top-level contaminated");
  assertEqual(
    result.hostResult?.data.credentialValue,
    undefined,
    "trusted execution host result cannot be contaminated with credentials",
  );
  assertEqual(result.publicHostingEnabled, false, "mutation-blocked execution enables no public hosting");
  assert(!containsPhase220ForbiddenTruth(result), "mutation-blocked execution leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 220 Verification (Retry-Ledger Entry Worker Execution)\n");
  await verifyTrustedExecutionPreflightDrivesOneForegroundHandlerCall();
  await verifyCopiedMissingAndContaminatedPreflightRejectBeforeExecution();
  await verifyMissingOrUnbrandedHandlerRejectsBeforeExecution();
  await verifyExecutionResultMutationIsBlocked();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 220: retry-ledger entry worker execution is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
