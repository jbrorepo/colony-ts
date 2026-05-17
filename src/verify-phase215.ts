/** Phase 215 Verification - Retry-Control Work-Item Closure Retry-Ledger Entry Worker Handler Readiness */

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness,
  createExternalChannelMediaTransferWorkerHandler,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection,
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

function containsPhase215ForbiddenTruth(value: unknown): boolean {
  if (containsPhase214ForbiddenTruth(value)) return true;
  const serialized = JSON.stringify(value);
  if (!serialized) return false;
  return ["artifact:phase215", "phase215_", "phase-215-media", "Phase 215 media"].some((marker) =>
    serialized.includes(marker),
  );
}

function capableWorkerHandler() {
  return createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
    }),
    sendToVendor: async (action) => ({
      accepted: true,
      transferKey: action.transferKey,
      deliveredCount: action.files.length,
    }),
  });
}

async function workerSelectionFixture(prefix: string) {
  const preflight = await operatorHandoffPreflightFixture(prefix);
  const selection =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection({
      retryLedgerEntryOperatorHandoffPreflight: preflight,
    });
  assertEqual(selection.accepted, true, "fixture retry-ledger worker selection is accepted");
  assert(Boolean(selection.retryLedgerEntryWorkerSelection), "fixture returns trusted retry-ledger worker selection");
  return selection.retryLedgerEntryWorkerSelection as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection;
}

async function verifyTrustedWorkerHandlerReadiness(): Promise<void> {
  section("1. Trusted Worker Selection Creates Handler Readiness");
  const workerSelection = await workerSelectionFixture("phase215_trusted");
  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness({
      retryLedgerEntryWorkerSelection: workerSelection,
      mediaTransferHandler: capableWorkerHandler(),
    });

  assertEqual(result.accepted, true, "trusted worker selection creates handler readiness");
  assert(Boolean(result.retryLedgerEntryWorkerHandlerReadiness), "handler readiness returns descriptor");
  assertEqual(
    result.retryLedgerEntryWorkerHandlerReadiness?.retryLedgerEntryWorkerSelectionId,
    workerSelection.retryLedgerEntryWorkerSelectionId,
    "handler readiness binds closure retry-ledger worker selection id",
  );
  assertEqual(
    result.retryLedgerEntryWorkerHandlerReadiness?.retryLedgerEntryOperatorHandoffId,
    workerSelection.retryLedgerEntryOperatorHandoffId,
    "handler readiness binds operator handoff id",
  );
  assertEqual(
    result.retryLedgerEntryWorkerHandlerReadiness?.retryLedgerEntryId,
    workerSelection.retryLedgerEntryId,
    "handler readiness binds retry-ledger entry id",
  );
  assertEqual(
    result.retryLedgerEntryWorkerHandlerReadiness?.retryControlWorkerHandlerReadinessId,
    workerSelection.retryControlWorkerHandlerReadinessId,
    "handler readiness keeps prior retry-control handler readiness provenance",
  );
  assertEqual(
    result.retryLedgerEntryWorkerHandlerReadiness?.transferKey,
    workerSelection.transferKey,
    "handler readiness binds transfer key",
  );
  assertEqual(
    result.retryLedgerEntryWorkerSelectionStillTrusted,
    true,
    "handler readiness requires trusted worker selection",
  );
  assertEqual(result.hostRetryWorkerSelectionIntentAccepted, true, "handler readiness keeps worker selection accepted");
  assertEqual(result.hostMustSupplyRetryWorkerHandler, true, "handler readiness requires host-supplied handler");
  assertEqual(result.hostRetryWorkerHandlerRequired, true, "handler readiness records handler requirement");
  assertEqual(result.hostRetryWorkerHandlerSupplied, true, "handler readiness accepts branded host handler");
  assertEqual(result.hostRetryWorkerHandlerTrusted, true, "handler readiness trusts branded host handler");
  assertEqual(
    result.retryLedgerEntryWorkerHandlerReadiness?.hostRetryWorkerHandlerCapabilityTruth,
    "foreground_worker_handler_resolves_sources_freshly_before_vendor_send",
    "handler readiness binds handler capability truth",
  );
  assertEqual(
    result.retryLedgerEntryWorkerHandlerReadiness?.hostRetryWorkerHandlerIdentityPersisted,
    false,
    "handler readiness persists no handler identity",
  );
  assertEqual(
    result.retryLedgerEntryWorkerHandlerReadiness?.hostRetryWorkerHandlerRegistryIdPersisted,
    false,
    "handler readiness persists no handler registry id",
  );
  assertEqual(result.hostRetryWorkerHandlerExecutable, false, "handler readiness makes no handler executable");
  assertEqual(result.hostRetryWorkerHandlerExecuted, false, "handler readiness executes no handler");
  assertEqual(result.retryWorkerReady, false, "handler readiness readies no retry worker");
  assertEqual(result.retryScheduleReady, false, "handler readiness readies no retry schedule");
  assertEqual(result.retryWorkerCreated, false, "handler readiness creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "handler readiness creates no retry schedule");
  assertEqual(result.backgroundRetryCreated, false, "handler readiness creates no background retry");
  assertEqual(result.automaticVendorRetryAllowed, false, "handler readiness allows no automatic vendor retry");
  assertEqual(result.credentialPersistenceCreated, false, "handler readiness persists no credentials");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "handler readiness enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "handler readiness enables no public hosting");
  assertEqual(
    result.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadinessTruth,
    "retry_control_work_item_closure_retry_ledger_entry_worker_selection_bound_handler_readiness_no_handler_worker_or_schedule",
    "handler readiness truth is explicit",
  );
  assert(!containsPhase215ForbiddenTruth(result), "trusted handler readiness leaks no raw truth");
}

async function verifyWorkerHandlerReadinessIsDeterministic(): Promise<void> {
  section("2. Worker Handler Readiness Is Deterministic");
  const workerSelection = await workerSelectionFixture("phase215_stable");
  const otherSelection = await workerSelectionFixture("phase215_other");

  const first =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness({
      retryLedgerEntryWorkerSelection: workerSelection,
      mediaTransferHandler: capableWorkerHandler(),
    });
  const second =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness({
      retryLedgerEntryWorkerSelection: workerSelection,
      mediaTransferHandler: capableWorkerHandler(),
    });
  const changed =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness({
      retryLedgerEntryWorkerSelection: otherSelection,
      mediaTransferHandler: capableWorkerHandler(),
    });

  assertEqual(first.retryLedgerEntryWorkerHandlerReadinessId, second.retryLedgerEntryWorkerHandlerReadinessId, "same worker selection gives stable handler readiness id");
  assert(
    first.retryLedgerEntryWorkerHandlerReadinessId !== changed.retryLedgerEntryWorkerHandlerReadinessId,
    "different worker selection changes handler readiness id",
  );
}

async function verifyWorkerHandlerReadinessRejectsCopiesAndHandlers(): Promise<void> {
  section("3. Copied Selections And Missing Handlers Reject");
  const workerSelection = await workerSelectionFixture("phase215_reject");
  const copied = JSON.parse(JSON.stringify(workerSelection));
  const shallowCopied = { ...workerSelection };
  const tamperedCopied = {
    ...JSON.parse(JSON.stringify(workerSelection)),
    retryLedgerEntryWorkerSelectionId:
      "manual-retry-control-worker-invocation-execution-receipt-work-item-closure-retry-ledger-entry-worker-selection:" +
      "a".repeat(64),
    retryLedgerEntryId: "artifact:phase215/raw-entry",
    retryLedgerEntryPlanId: "phase215_/absolute/path/plan",
    sourceRefFingerprints: [
      {
        fileIndex: 0,
        sourceRefFingerprint: "phase215_raw_source_ref",
        sourceRefPersisted: true,
      },
    ],
    targetCorrelationFingerprint: "https://leak.invalid/phase-215-media-target",
  };
  const contaminated = {
    ...workerSelection,
    retryWorkerCreated: true,
    retryScheduleCreated: true,
    automaticVendorRetryAllowed: true,
    rawSourceUrl: "https://leak.invalid/artifact:phase215",
    credentialValue: "phase215-secret-value",
  };
  const unbrandedHandler = (async () => ({ accepted: true, transferKey: workerSelection.transferKey, deliveredCount: 1 })) as never;
  const unconfiguredHandler = createExternalChannelMediaTransferWorkerHandler();

  const copiedResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness({
      retryLedgerEntryWorkerSelection: copied,
      mediaTransferHandler: capableWorkerHandler(),
    });
  const shallowCopiedResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness({
      retryLedgerEntryWorkerSelection: shallowCopied,
      mediaTransferHandler: capableWorkerHandler(),
    });
  const tamperedCopiedResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness({
      retryLedgerEntryWorkerSelection: tamperedCopied,
      mediaTransferHandler: capableWorkerHandler(),
    });
  const contaminatedResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness({
      retryLedgerEntryWorkerSelection: contaminated,
      mediaTransferHandler: capableWorkerHandler(),
    });
  const missingHandlerResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness({
      retryLedgerEntryWorkerSelection: workerSelection,
    });
  const unbrandedResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness({
      retryLedgerEntryWorkerSelection: workerSelection,
      mediaTransferHandler: unbrandedHandler,
    });
  const unconfiguredResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness({
      retryLedgerEntryWorkerSelection: workerSelection,
      mediaTransferHandler: unconfiguredHandler,
    });

  assertEqual(copiedResult.accepted, false, "JSON-copied worker selection is rejected");
  assertEqual(
    copiedResult.reasonCode,
    "external_media_transfer_trusted_retry_control_work_item_closure_retry_ledger_entry_worker_selection_required",
    "copied worker selection rejection is bounded",
  );
  assertEqual(copiedResult.retryLedgerEntryWorkerSelectionStillTrusted, false, "copied worker selection is not trusted");
  assertEqual(copiedResult.retryLedgerEntryWorkerSelectionId, undefined, "copied rejection does not echo selection id");
  assert(!containsPhase215ForbiddenTruth(copiedResult), "copied worker selection rejection leaks no raw truth");

  assertEqual(shallowCopiedResult.accepted, false, "shallow-copied worker selection is rejected");
  assertEqual(shallowCopiedResult.retryLedgerEntryWorkerSelectionStillTrusted, false, "shallow copy is not trusted");
  assertEqual(shallowCopiedResult.retryLedgerEntryId, undefined, "shallow copy does not echo entry id");
  assert(!containsPhase215ForbiddenTruth(shallowCopiedResult), "shallow-copy rejection leaks no raw truth");

  assertEqual(tamperedCopiedResult.accepted, false, "tampered copied worker selection is rejected");
  assertEqual(tamperedCopiedResult.retryLedgerEntryWorkerSelectionStillTrusted, false, "tampered copy is not trusted");
  assertEqual(tamperedCopiedResult.retryLedgerEntryWorkerSelectionId, undefined, "tampered copy does not echo selection id");
  assertEqual(tamperedCopiedResult.retryLedgerEntryId, undefined, "tampered copy does not echo retry-ledger entry id");
  assertEqual(tamperedCopiedResult.retryLedgerEntryPlanId, undefined, "tampered copy does not echo retry-ledger plan id");
  assert(!containsPhase215ForbiddenTruth(tamperedCopiedResult), "tampered-copy rejection leaks no raw id/ref/target/path truth");

  assertEqual(contaminatedResult.accepted, false, "contaminated worker selection is rejected");
  assertEqual(contaminatedResult.retryWorkerStillBlocked, false, "contaminated retry-worker claim is surfaced");
  assertEqual(contaminatedResult.automaticVendorRetryStillBlocked, false, "contaminated automatic retry claim is surfaced");
  assertEqual(contaminatedResult.retryWorkerCreated, false, "contaminated worker selection creates no retry worker");
  assertEqual(contaminatedResult.automaticVendorRetryAllowed, false, "contaminated worker selection allows no automatic retry");
  assert(
    !JSON.stringify(contaminatedResult).includes("phase215-secret-value") &&
      !JSON.stringify(contaminatedResult).includes("leak.invalid"),
    "contaminated rejection leaks no generic raw URL/path/credential values",
  );
  assert(!containsPhase215ForbiddenTruth(contaminatedResult), "contaminated worker selection rejection leaks no raw truth");

  assertEqual(missingHandlerResult.accepted, false, "missing handler is rejected");
  assertEqual(missingHandlerResult.reasonCode, "manual_reinvoke_worker_handler_required", "missing handler rejection is bounded");
  assertEqual(missingHandlerResult.hostRetryWorkerHandlerTrusted, false, "missing handler is not trusted");
  assertEqual(missingHandlerResult.retryWorkerCreated, false, "missing handler creates no retry worker");
  assertEqual(unbrandedResult.accepted, false, "unbranded handler is rejected");
  assertEqual(unbrandedResult.reasonCode, "manual_reinvoke_worker_handler_required", "unbranded handler rejection is bounded");
  assertEqual(unbrandedResult.hostRetryWorkerHandlerExecuted, false, "unbranded handler is not executed");
  assertEqual(unbrandedResult.retryScheduleCreated, false, "unbranded handler creates no retry schedule");
  assertEqual(unconfiguredResult.accepted, false, "branded handler without resolver/sender capabilities is rejected");
  assertEqual(
    unconfiguredResult.reasonCode,
    "manual_reinvoke_worker_handler_required",
    "unconfigured handler rejection is bounded",
  );
  assertEqual(unconfiguredResult.hostRetryWorkerHandlerTrusted, false, "unconfigured handler is not trusted as ready");
  assertEqual(unconfiguredResult.hostRetryWorkerHandlerExecuted, false, "unconfigured handler is not executed");
  assertEqual(unconfiguredResult.retryWorkerCreated, false, "unconfigured handler creates no retry worker");
  assert(!containsPhase215ForbiddenTruth(missingHandlerResult), "missing handler rejection leaks no raw truth");
  assert(!containsPhase215ForbiddenTruth(unbrandedResult), "unbranded handler rejection leaks no raw truth");
  assert(!containsPhase215ForbiddenTruth(unconfiguredResult), "unconfigured handler rejection leaks no raw truth");
}

async function verifyTrustedSelectionMutationIsBlocked(): Promise<void> {
  section("4. Trusted Worker Selection Mutation Is Blocked");
  const workerSelection = await workerSelectionFixture("phase215_mutation");

  try {
    (workerSelection as { retryWorkerCreated?: boolean }).retryWorkerCreated = true;
  } catch {
    // Frozen trusted worker selections may throw under strict runtimes.
  }
  try {
    (workerSelection.sourceRefFingerprints as unknown as Array<Record<string, unknown>>).push({
      rawSourceUrl: "https://leak.invalid/artifact:phase215/nested",
    });
  } catch {
    // Frozen nested arrays may throw under strict runtimes.
  }

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness({
      retryLedgerEntryWorkerSelection: workerSelection,
      mediaTransferHandler: capableWorkerHandler(),
    });

  assertEqual(workerSelection.retryWorkerCreated, false, "trusted worker selection cannot be top-level contaminated");
  assertEqual(result.accepted, true, "mutation-blocked trusted selection still creates handler readiness");
  assertEqual(result.retryWorkerCreated, false, "mutation-blocked handler readiness creates no retry worker");
  assertEqual(result.publicHostingEnabled, false, "mutation-blocked handler readiness enables no public hosting");
  assert(!containsPhase215ForbiddenTruth(result), "mutation-blocked handler readiness leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 215 Verification (Retry-Control Work-Item Closure Retry-Ledger Entry Worker Handler Readiness)\n");
  await verifyTrustedWorkerHandlerReadiness();
  await verifyWorkerHandlerReadinessIsDeterministic();
  await verifyWorkerHandlerReadinessRejectsCopiesAndHandlers();
  await verifyTrustedSelectionMutationIsBlocked();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 215: retry-control work-item closure retry-ledger entry worker handler readiness is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
