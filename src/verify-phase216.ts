/** Phase 216 Verification - Retry-Control Work-Item Closure Retry-Ledger Entry Worker Invocation Handoff */

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection,
  createExternalChannelMediaTransferWorkerHandler,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness,
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

function containsPhase216ForbiddenTruth(value: unknown): boolean {
  if (containsPhase214ForbiddenTruth(value)) return true;
  const serialized = JSON.stringify(value);
  if (!serialized) return false;
  return ["artifact:phase216", "phase216_", "phase-216-media", "Phase 216 media"].some((marker) =>
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

async function workerHandlerReadinessFixture(
  prefix: string,
): Promise<ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness> {
  const preflight = await operatorHandoffPreflightFixture(prefix);
  const selection =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection({
      retryLedgerEntryOperatorHandoffPreflight: preflight,
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
  return readiness.retryLedgerEntryWorkerHandlerReadiness as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness;
}

async function verifyTrustedHandlerReadinessCreatesInvocationHandoff(): Promise<void> {
  section("1. Trusted Handler Readiness Creates Worker Invocation Handoff");
  const handlerReadiness = await workerHandlerReadinessFixture("phase216_trusted");
  let handlerCalled = false;

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      mediaTransferHandler: capableWorkerHandler(() => {
        handlerCalled = true;
      }),
    });

  assertEqual(result.accepted, true, "trusted handler-readiness creates worker invocation handoff");
  assert(Boolean(result.retryLedgerEntryWorkerInvocationHandoff), "worker invocation handoff returns descriptor");
  assertEqual(
    result.retryLedgerEntryWorkerInvocationHandoff?.retryLedgerEntryWorkerHandlerReadinessId,
    handlerReadiness.retryLedgerEntryWorkerHandlerReadinessId,
    "worker invocation handoff binds handler-readiness id",
  );
  assertEqual(
    result.retryLedgerEntryWorkerInvocationHandoff?.retryLedgerEntryWorkerSelectionId,
    handlerReadiness.retryLedgerEntryWorkerSelectionId,
    "worker invocation handoff binds worker-selection id",
  );
  assertEqual(
    result.retryLedgerEntryWorkerInvocationHandoff?.retryLedgerEntryOperatorHandoffId,
    handlerReadiness.retryLedgerEntryOperatorHandoffId,
    "worker invocation handoff binds operator handoff id",
  );
  assertEqual(
    result.retryLedgerEntryWorkerInvocationHandoff?.retryLedgerEntryId,
    handlerReadiness.retryLedgerEntryId,
    "worker invocation handoff binds retry-ledger entry id",
  );
  assertEqual(
    result.retryLedgerEntryWorkerInvocationHandoff?.retryControlWorkerInvocationHandoffId,
    handlerReadiness.retryControlWorkerInvocationHandoffId,
    "worker invocation handoff keeps prior retry-control invocation handoff provenance",
  );
  assertEqual(
    result.retryLedgerEntryWorkerInvocationHandoff?.transferKey,
    handlerReadiness.transferKey,
    "worker invocation handoff binds transfer key",
  );
  assertEqual(result.retryLedgerEntryWorkerHandlerReadinessAccepted, true, "worker invocation handoff requires trusted handler-readiness");
  assertEqual(result.retryLedgerEntryWorkerHandlerReadinessStillTrusted, true, "worker invocation handoff keeps handler-readiness trusted");
  assertEqual(result.hostRetryWorkerInvocationHandoffAccepted, true, "worker invocation handoff records accepted handoff");
  assertEqual(result.hostExecutionRequired, true, "worker invocation handoff records host execution requirement");
  assertEqual(result.hostExecutionAttempted, false, "worker invocation handoff records no execution attempt");
  assertEqual(result.hostRetryWorkerHandlerExecutable, false, "worker invocation handoff does not mark handler executable");
  assertEqual(result.hostRetryWorkerHandlerExecuted, false, "worker invocation handoff does not execute handler");
  assertEqual(handlerCalled, false, "worker invocation handoff never calls supplied handler");
  assertEqual(result.retryWorkerReady, false, "worker invocation handoff readies no retry worker");
  assertEqual(result.retryScheduleReady, false, "worker invocation handoff readies no retry schedule");
  assertEqual(result.retryWorkerCreated, false, "worker invocation handoff creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "worker invocation handoff creates no retry schedule");
  assertEqual(result.backgroundRetryCreated, false, "worker invocation handoff creates no background retry");
  assertEqual(result.automaticVendorRetryAllowed, false, "worker invocation handoff allows no automatic vendor retry");
  assertEqual(result.credentialPersistenceCreated, false, "worker invocation handoff persists no credentials");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "worker invocation handoff enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "worker invocation handoff enables no public hosting");
  assertEqual(
    result.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoffTruth,
    "retry_control_work_item_closure_retry_ledger_entry_worker_handler_readiness_bound_invocation_handoff_no_handler_execution_worker_or_schedule",
    "worker invocation handoff truth is explicit",
  );
  assert(!containsPhase216ForbiddenTruth(result), "trusted worker invocation handoff leaks no raw truth");
}

async function verifyWorkerInvocationHandoffIsDeterministic(): Promise<void> {
  section("2. Worker Invocation Handoff Is Deterministic");
  const handlerReadiness = await workerHandlerReadinessFixture("phase216_stable");
  const otherReadiness = await workerHandlerReadinessFixture("phase216_other");

  const first =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      mediaTransferHandler: capableWorkerHandler(),
    });
  const second =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      mediaTransferHandler: capableWorkerHandler(),
    });
  const changed =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: otherReadiness,
      mediaTransferHandler: capableWorkerHandler(),
    });

  assertEqual(
    first.retryLedgerEntryWorkerInvocationHandoffId,
    second.retryLedgerEntryWorkerInvocationHandoffId,
    "same handler-readiness gives stable worker invocation handoff id",
  );
  assert(
    first.retryLedgerEntryWorkerInvocationHandoffId !== changed.retryLedgerEntryWorkerInvocationHandoffId,
    "different handler-readiness changes worker invocation handoff id",
  );
}

async function verifyWorkerInvocationHandoffRejectsCopiesAndClaims(): Promise<void> {
  section("3. Copied Handler Readiness And Unsafe Claims Reject");
  const handlerReadiness = await workerHandlerReadinessFixture("phase216_reject");
  const copied = JSON.parse(JSON.stringify(handlerReadiness));
  const shallowCopied = { ...handlerReadiness };
  const tamperedCopied = {
    ...JSON.parse(JSON.stringify(handlerReadiness)),
    retryLedgerEntryWorkerHandlerReadinessId:
      "manual-retry-control-worker-invocation-execution-receipt-work-item-closure-retry-ledger-entry-worker-handler-readiness:" +
      "b".repeat(64),
    retryLedgerEntryId: "artifact:phase216/raw-entry",
    retryLedgerEntryPlanId: "phase216_/absolute/path/plan",
    sourceRefFingerprints: [
      {
        fileIndex: 0,
        sourceRefFingerprint: "phase216_raw_source_ref",
      },
    ],
    targetCorrelationFingerprint: "https://leak.invalid/phase-216-media-target",
  };
  const contaminated = {
    ...handlerReadiness,
    hostRetryWorkerHandlerExecuted: true,
    hostExecutionAttempted: true,
    retryWorkerCreated: true,
    retryScheduleCreated: true,
    automaticVendorRetryAllowed: true,
    rawSourceUrl: "https://leak.invalid/artifact:phase216",
    credentialValue: "phase216-secret-value",
  };

  const copiedResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: copied,
      mediaTransferHandler: capableWorkerHandler(),
    });
  const shallowCopiedResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: shallowCopied,
      mediaTransferHandler: capableWorkerHandler(),
    });
  const tamperedCopiedResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: tamperedCopied,
      mediaTransferHandler: capableWorkerHandler(),
    });
  const contaminatedResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: contaminated,
      mediaTransferHandler: capableWorkerHandler(),
    });
  const brandedUnconfiguredHandler = createExternalChannelMediaTransferWorkerHandler();
  const brandedUnconfiguredHandlerResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      mediaTransferHandler: brandedUnconfiguredHandler,
    });
  let unbrandedHandlerCalled = false;
  const unbrandedHandlerResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      mediaTransferHandler: async () => {
        unbrandedHandlerCalled = true;
        return {
          accepted: true,
          transferKey: handlerReadiness.transferKey,
          deliveredCount: 1,
        };
      },
    });
  const missingHandlerResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
    });

  assertEqual(copiedResult.accepted, false, "JSON-copied handler-readiness is rejected");
  assertEqual(
    copiedResult.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_retry_ledger_entry_worker_handler_readiness_required",
    "copied handler-readiness rejection is bounded",
  );
  assertEqual(copiedResult.retryLedgerEntryWorkerHandlerReadinessStillTrusted, false, "copied handler-readiness is not trusted");
  assertEqual(copiedResult.retryLedgerEntryWorkerHandlerReadinessId, undefined, "copied rejection does not echo handler-readiness id");
  assert(!containsPhase216ForbiddenTruth(copiedResult), "copied handler-readiness rejection leaks no raw truth");

  assertEqual(shallowCopiedResult.accepted, false, "shallow-copied handler-readiness is rejected");
  assertEqual(shallowCopiedResult.retryLedgerEntryWorkerHandlerReadinessStillTrusted, false, "shallow copy is not trusted");
  assertEqual(shallowCopiedResult.retryLedgerEntryId, undefined, "shallow copy does not echo entry id");
  assert(!containsPhase216ForbiddenTruth(shallowCopiedResult), "shallow-copy rejection leaks no raw truth");

  assertEqual(tamperedCopiedResult.accepted, false, "tampered copied handler-readiness is rejected");
  assertEqual(tamperedCopiedResult.retryLedgerEntryWorkerHandlerReadinessStillTrusted, false, "tampered copy is not trusted");
  assertEqual(tamperedCopiedResult.retryLedgerEntryWorkerHandlerReadinessId, undefined, "tampered copy does not echo handler-readiness id");
  assertEqual(tamperedCopiedResult.retryLedgerEntryId, undefined, "tampered copy does not echo retry-ledger entry id");
  assertEqual(tamperedCopiedResult.retryLedgerEntryPlanId, undefined, "tampered copy does not echo retry-ledger plan id");
  assert(!containsPhase216ForbiddenTruth(tamperedCopiedResult), "tampered-copy rejection leaks no raw id/ref/target/path truth");

  assertEqual(contaminatedResult.accepted, false, "contaminated handler-readiness is rejected");
  assertEqual(contaminatedResult.hostRetryWorkerHandlerExecuted, false, "contaminated handler-readiness does not execute handler");
  assertEqual(contaminatedResult.retryWorkerStillBlocked, false, "contaminated retry-worker claim is surfaced");
  assertEqual(contaminatedResult.automaticVendorRetryStillBlocked, false, "contaminated automatic retry claim is surfaced");
  assertEqual(contaminatedResult.retryWorkerCreated, false, "contaminated handler-readiness creates no retry worker");
  assertEqual(contaminatedResult.automaticVendorRetryAllowed, false, "contaminated handler-readiness allows no automatic retry");
  assert(
    !JSON.stringify(contaminatedResult).includes("phase216-secret-value") &&
      !JSON.stringify(contaminatedResult).includes("leak.invalid"),
    "contaminated rejection leaks no generic raw URL/path/credential values",
  );
  assert(!containsPhase216ForbiddenTruth(contaminatedResult), "contaminated handler-readiness rejection leaks no raw truth");

  assertEqual(brandedUnconfiguredHandlerResult.accepted, false, "branded but unconfigured handler is rejected");
  assertEqual(
    brandedUnconfiguredHandlerResult.reasonCode,
    "manual_reinvoke_worker_handler_required",
    "branded but unconfigured handler rejection is bounded",
  );
  assertEqual(
    brandedUnconfiguredHandlerResult.hostRetryWorkerHandlerTrusted,
    false,
    "branded but unconfigured handler is not capability trusted",
  );
  assertEqual(
    brandedUnconfiguredHandlerResult.hostRetryWorkerHandlerExecuted,
    false,
    "branded but unconfigured handler is not executed",
  );
  assert(!containsPhase216ForbiddenTruth(brandedUnconfiguredHandlerResult), "branded but unconfigured handler rejection leaks no raw truth");

  assertEqual(unbrandedHandlerResult.accepted, false, "unbranded handler is rejected");
  assertEqual(unbrandedHandlerResult.reasonCode, "manual_reinvoke_worker_handler_required", "unbranded handler rejection is bounded");
  assertEqual(unbrandedHandlerResult.hostRetryWorkerHandlerTrusted, false, "unbranded handler is not trusted");
  assertEqual(unbrandedHandlerResult.hostRetryWorkerHandlerExecuted, false, "unbranded handler is not executed");
  assertEqual(unbrandedHandlerCalled, false, "unbranded handler is never called");
  assert(!containsPhase216ForbiddenTruth(unbrandedHandlerResult), "unbranded handler rejection leaks no raw truth");

  assertEqual(missingHandlerResult.accepted, false, "missing handler is rejected");
  assertEqual(missingHandlerResult.reasonCode, "manual_reinvoke_worker_handler_required", "missing handler rejection is bounded");
  assertEqual(missingHandlerResult.hostRetryWorkerHandlerTrusted, false, "missing handler is not trusted");
  assertEqual(missingHandlerResult.retryWorkerCreated, false, "missing handler creates no retry worker");
  assert(!containsPhase216ForbiddenTruth(missingHandlerResult), "missing handler rejection leaks no raw truth");
}

async function verifyTrustedHandlerReadinessMutationIsBlocked(): Promise<void> {
  section("4. Trusted Handler Readiness Mutation Is Blocked");
  const handlerReadiness = await workerHandlerReadinessFixture("phase216_mutation");

  try {
    (handlerReadiness as { retryWorkerCreated?: boolean }).retryWorkerCreated = true;
  } catch {
    // Frozen trusted handler-readiness descriptors may throw under strict runtimes.
  }
  try {
    (handlerReadiness.sourceRefFingerprints as unknown as Array<Record<string, unknown>>).push({
      rawSourceUrl: "https://leak.invalid/artifact:phase216/nested",
    });
  } catch {
    // Frozen nested arrays may throw under strict runtimes.
  }

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      mediaTransferHandler: capableWorkerHandler(),
    });

  assertEqual(handlerReadiness.retryWorkerCreated, false, "trusted handler-readiness cannot be top-level contaminated");
  assertEqual(result.accepted, true, "mutation-blocked trusted handler-readiness still creates invocation handoff");
  assertEqual(result.hostExecutionAttempted, false, "mutation-blocked invocation handoff still does not execute");
  assertEqual(result.retryWorkerCreated, false, "mutation-blocked invocation handoff creates no retry worker");
  assertEqual(result.publicHostingEnabled, false, "mutation-blocked invocation handoff enables no public hosting");
  assert(!containsPhase216ForbiddenTruth(result), "mutation-blocked invocation handoff leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 216 Verification (Retry-Control Work-Item Closure Retry-Ledger Entry Worker Invocation Handoff)\n");
  await verifyTrustedHandlerReadinessCreatesInvocationHandoff();
  await verifyWorkerInvocationHandoffIsDeterministic();
  await verifyWorkerInvocationHandoffRejectsCopiesAndClaims();
  await verifyTrustedHandlerReadinessMutationIsBlocked();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 216: retry-control work-item closure retry-ledger entry worker invocation handoff is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
