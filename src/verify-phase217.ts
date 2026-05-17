/** Phase 217 Verification - Retry-Control Work-Item Closure Retry-Ledger Entry Worker Invocation Handoff Preflight */

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection,
  createExternalChannelMediaTransferWorkerHandler,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff,
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

function containsPhase217ForbiddenTruth(value: unknown): boolean {
  if (containsPhase214ForbiddenTruth(value)) return true;
  const serialized = JSON.stringify(value);
  if (!serialized) return false;
  return ["artifact:phase217", "phase217_", "phase-217-media", "Phase 217 media"].some((marker) =>
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

async function workerInvocationHandoffFixture(
  prefix: string,
): Promise<{
  handlerReadiness: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness;
  handoff: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff;
}> {
  const handlerReadiness = await workerHandlerReadinessFixture(prefix);
  const handoffResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(handoffResult.accepted, true, "fixture retry-ledger worker invocation handoff is accepted");
  assert(Boolean(handoffResult.retryLedgerEntryWorkerInvocationHandoff), "fixture returns trusted retry-ledger worker invocation handoff");
  return {
    handlerReadiness,
    handoff:
      handoffResult.retryLedgerEntryWorkerInvocationHandoff as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff,
  };
}

async function verifyTrustedInvocationHandoffPreflight(): Promise<void> {
  section("1. Trusted Worker Invocation Handoff Preflight Accepts Current Handoff");
  const { handlerReadiness, handoff } = await workerInvocationHandoffFixture("phase217_trusted");
  let handlerCalled = false;

  const result =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoff,
      mediaTransferHandler: capableWorkerHandler(() => {
        handlerCalled = true;
      }),
    });

  assertEqual(result.accepted, true, "trusted supplied invocation handoff preflight is accepted");
  assertEqual(
    result.retryLedgerEntryWorkerInvocationHandoff?.retryLedgerEntryWorkerInvocationHandoffId,
    handoff.retryLedgerEntryWorkerInvocationHandoffId,
    "preflight returns trusted supplied invocation handoff",
  );
  assertEqual(
    result.expectedRetryLedgerEntryWorkerInvocationHandoffId,
    handoff.retryLedgerEntryWorkerInvocationHandoffId,
    "preflight binds recomputed expected handoff id",
  );
  assertEqual(result.retryLedgerEntryWorkerInvocationHandoffIdMatched, true, "preflight matches invocation handoff id");
  assertEqual(result.retryLedgerEntryWorkerHandlerReadinessIdMatched, true, "preflight matches handler-readiness id");
  assertEqual(result.retryLedgerEntryWorkerSelectionIdMatched, true, "preflight matches worker-selection id");
  assertEqual(result.retryLedgerEntryIdsMatched, true, "preflight matches retry-ledger ids");
  assertEqual(result.retryControlIdsMatched, true, "preflight matches prior retry-control ids");
  assertEqual(result.transferKeyMatched, true, "preflight matches transfer key");
  assertEqual(result.sourceRefFingerprintsMatched, true, "preflight matches source fingerprints");
  assertEqual(result.hostHandlerCapabilityMatched, true, "preflight matches handler capability truth");
  assertEqual(result.retryLedgerEntryWorkerInvocationHandoffDescriptorMatched, true, "preflight matches descriptor truth");
  assertEqual(result.retryLedgerEntryWorkerInvocationHandoffStillTrusted, true, "preflight keeps supplied handoff trusted");
  assertEqual(result.retryLedgerEntryWorkerHandlerReadinessStillTrusted, true, "preflight keeps handler-readiness trusted");
  assertEqual(result.hostRetryWorkerInvocationHandoffAccepted, true, "preflight accepts host invocation handoff");
  assertEqual(result.hostExecutionRequired, true, "preflight preserves host execution requirement");
  assertEqual(result.hostExecutionAttempted, false, "preflight does not execute host handler");
  assertEqual(result.hostRetryWorkerHandlerExecuted, false, "preflight records no handler execution");
  assertEqual(handlerCalled, false, "preflight never calls supplied handler");
  assertEqual(result.retryWorkerReady, false, "preflight readies no retry worker");
  assertEqual(result.retryScheduleReady, false, "preflight readies no retry schedule");
  assertEqual(result.retryWorkerCreated, false, "preflight creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "preflight creates no retry schedule");
  assertEqual(result.backgroundRetryCreated, false, "preflight creates no background retry");
  assertEqual(result.automaticVendorRetryAllowed, false, "preflight allows no automatic vendor retry");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "preflight enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "preflight enables no public hosting");
  assertEqual(
    result.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoffPreflightTruth,
    "trusted_retry_control_work_item_closure_retry_ledger_entry_worker_invocation_handoff_preflight_no_handler_execution_worker_or_schedule",
    "preflight truth is explicit",
  );
  assert(!containsPhase217ForbiddenTruth(result), "trusted invocation handoff preflight leaks no raw truth");
}

async function verifyCopiedAndTamperedInvocationHandoffReject(): Promise<void> {
  section("2. Copied And Tampered Worker Invocation Handoff Reject");
  const { handlerReadiness, handoff } = await workerInvocationHandoffFixture("phase217_reject");
  const copied = JSON.parse(JSON.stringify(handoff));
  const shallowCopied = { ...handoff };
  const tamperedCopied = {
    ...JSON.parse(JSON.stringify(handoff)),
    retryLedgerEntryWorkerInvocationHandoffId:
      "manual-retry-control-worker-invocation-execution-receipt-work-item-closure-retry-ledger-entry-worker-invocation-handoff:" +
      "c".repeat(64),
    retryLedgerEntryWorkerHandlerReadinessId:
      "manual-retry-control-worker-invocation-execution-receipt-work-item-closure-retry-ledger-entry-worker-handler-readiness:" +
      "d".repeat(64),
    retryLedgerEntryWorkerSelectionId: "https://leak.invalid/artifact:phase217/worker-selection",
    retryLedgerEntryOperatorHandoffId: "phase217_/absolute/path/operator-handoff",
    retryLedgerEntryId: "artifact:phase217/raw-entry",
    transferKey: "phase217_/absolute/path/transfer",
    sourceRefFingerprints: [
      {
        fileIndex: 0,
        sourceRefFingerprint: "phase217_raw_source_ref",
      },
    ],
    targetCorrelationFingerprint: "https://leak.invalid/phase-217-media-target",
  };
  const contaminated = {
    ...handoff,
    hostExecutionAttempted: true,
    hostRetryWorkerHandlerExecuted: true,
    retryWorkerCreated: true,
    retryScheduleCreated: true,
    automaticVendorRetryAllowed: true,
    defaultLiveDeliveryEnabled: true,
    rawSourceUrl: "https://leak.invalid/artifact:phase217",
    credentialValue: "phase217-secret-value",
  };

  const copiedResult =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: copied,
      mediaTransferHandler: capableWorkerHandler(),
    });
  const shallowCopiedResult =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: shallowCopied,
      mediaTransferHandler: capableWorkerHandler(),
    });
  const tamperedCopiedResult =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: tamperedCopied,
      mediaTransferHandler: capableWorkerHandler(),
    });
  const contaminatedResult =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: contaminated,
      mediaTransferHandler: capableWorkerHandler(),
    });
  const missingHandoffResult =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      mediaTransferHandler: capableWorkerHandler(),
    });

  assertEqual(copiedResult.accepted, false, "JSON-copied invocation handoff is rejected");
  assertEqual(
    copiedResult.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_retry_ledger_entry_worker_invocation_handoff_required",
    "copied invocation handoff rejection is bounded",
  );
  assertEqual(copiedResult.retryLedgerEntryWorkerInvocationHandoffStillTrusted, false, "copied invocation handoff is not trusted");
  assertEqual(copiedResult.retryLedgerEntryWorkerInvocationHandoffIdMatched, true, "copied invocation handoff current id still matches");
  assert(!containsPhase217ForbiddenTruth(copiedResult), "copied invocation handoff rejection leaks no raw truth");

  assertEqual(shallowCopiedResult.accepted, false, "shallow-copied invocation handoff is rejected");
  assertEqual(shallowCopiedResult.retryLedgerEntryWorkerInvocationHandoffStillTrusted, false, "shallow copy is not trusted");
  assertEqual(shallowCopiedResult.retryLedgerEntryWorkerHandlerReadinessIdMatched, true, "shallow copy preserves current handler-readiness truth");
  assert(!containsPhase217ForbiddenTruth(shallowCopiedResult), "shallow-copy rejection leaks no raw truth");

  assertEqual(tamperedCopiedResult.accepted, false, "tampered copied invocation handoff is rejected");
  assertEqual(
    tamperedCopiedResult.reasonCode,
    "external_media_transfer_retry_control_work_item_closure_retry_ledger_entry_worker_invocation_handoff_current_truth_mismatch",
    "tampered copied invocation handoff rejection is bounded",
  );
  assertEqual(tamperedCopiedResult.retryLedgerEntryWorkerInvocationHandoffIdMatched, false, "tampered copy mismatches handoff id");
  assertEqual(tamperedCopiedResult.retryLedgerEntryWorkerHandlerReadinessIdMatched, false, "tampered copy mismatches handler-readiness id");
  assertEqual(tamperedCopiedResult.retryLedgerEntryWorkerSelectionId, undefined, "tampered copy does not echo untrusted worker-selection id");
  assertEqual(tamperedCopiedResult.retryLedgerEntryOperatorHandoffId, undefined, "tampered copy does not echo untrusted operator-handoff id");
  assertEqual(tamperedCopiedResult.transferKeyMatched, false, "tampered copy mismatches transfer key");
  assert(!containsPhase217ForbiddenTruth(tamperedCopiedResult), "tampered-copy rejection leaks no raw id/ref/target/path truth");

  assertEqual(contaminatedResult.accepted, false, "contaminated invocation handoff is rejected");
  assertEqual(contaminatedResult.hostExecutionAttempted, false, "contaminated invocation handoff does not execute handler");
  assertEqual(contaminatedResult.retryWorkerStillBlocked, false, "contaminated retry-worker claim is surfaced");
  assertEqual(contaminatedResult.automaticVendorRetryStillBlocked, false, "contaminated automatic retry claim is surfaced");
  assertEqual(contaminatedResult.defaultLiveDeliveryStillBlocked, false, "contaminated live-delivery claim is surfaced");
  assertEqual(contaminatedResult.retryWorkerCreated, false, "contaminated invocation handoff creates no retry worker");
  assertEqual(contaminatedResult.automaticVendorRetryAllowed, false, "contaminated invocation handoff allows no automatic retry");
  assert(
    !JSON.stringify(contaminatedResult).includes("phase217-secret-value") &&
      !JSON.stringify(contaminatedResult).includes("leak.invalid"),
    "contaminated rejection leaks no generic raw URL/path/credential values",
  );
  assert(!containsPhase217ForbiddenTruth(contaminatedResult), "contaminated invocation handoff rejection leaks no raw truth");

  assertEqual(missingHandoffResult.accepted, false, "missing invocation handoff is rejected");
  assertEqual(
    missingHandoffResult.reasonCode,
    "valid_external_media_transfer_retry_control_work_item_closure_retry_ledger_entry_worker_invocation_handoff_required",
    "missing invocation handoff rejection is bounded",
  );
  assertEqual(missingHandoffResult.hostRetryWorkerInvocationHandoffAccepted, false, "missing invocation handoff is not accepted");
  assert(!containsPhase217ForbiddenTruth(missingHandoffResult), "missing invocation handoff rejection leaks no raw truth");
}

async function verifyTrustedInvocationHandoffMutationIsBlocked(): Promise<void> {
  section("3. Trusted Worker Invocation Handoff Mutation Is Blocked");
  const { handlerReadiness, handoff } = await workerInvocationHandoffFixture("phase217_mutation");

  try {
    (handoff as { retryWorkerCreated?: boolean }).retryWorkerCreated = true;
  } catch {
    // Frozen trusted invocation handoff descriptors may throw under strict runtimes.
  }
  try {
    (handoff.sourceRefFingerprints as unknown as Array<Record<string, unknown>>).push({
      rawSourceUrl: "https://leak.invalid/artifact:phase217/nested",
    });
  } catch {
    // Frozen nested arrays may throw under strict runtimes.
  }

  const result =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff({
      retryLedgerEntryWorkerHandlerReadiness: handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoff,
      mediaTransferHandler: capableWorkerHandler(),
    });

  assertEqual(handoff.retryWorkerCreated, false, "trusted invocation handoff cannot be top-level contaminated");
  assertEqual(result.accepted, true, "mutation-blocked trusted invocation handoff still preflights");
  try {
    if (result.retryLedgerEntryWorkerInvocationHandoffResult) {
      (result.retryLedgerEntryWorkerInvocationHandoffResult as { accepted?: boolean }).accepted = false;
    }
  } catch {
    // Accepted preflight result graphs may throw when nested trust state is frozen.
  }
  assertEqual(
    result.retryLedgerEntryWorkerInvocationHandoffResult?.accepted,
    true,
    "accepted preflight keeps nested invocation-handoff result immutable",
  );
  assertEqual(result.hostExecutionAttempted, false, "mutation-blocked preflight still does not execute");
  assertEqual(result.retryWorkerCreated, false, "mutation-blocked preflight creates no retry worker");
  assertEqual(result.publicHostingEnabled, false, "mutation-blocked preflight enables no public hosting");
  assert(!containsPhase217ForbiddenTruth(result), "mutation-blocked preflight leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 217 Verification (Retry-Control Work-Item Closure Retry-Ledger Entry Worker Invocation Handoff Preflight)\n");
  await verifyTrustedInvocationHandoffPreflight();
  await verifyCopiedAndTamperedInvocationHandoffReject();
  await verifyTrustedInvocationHandoffMutationIsBlocked();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 217: retry-control work-item closure retry-ledger entry worker invocation handoff preflight is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
