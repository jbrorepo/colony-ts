/** Phase 223 Verification - Retry-Ledger Entry Worker Execution Receipt Closeout */

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseout,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecution,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlanPreflightResult,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseout,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptPreflightResult,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionResult,
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

function containsPhase223ForbiddenTruth(value: unknown): boolean {
  if (containsPhase214ForbiddenTruth(value)) return true;
  const serialized = JSON.stringify(value);
  if (!serialized) return false;
  return [
    "artifact:phase223",
    "phase223_",
    "phase-223-media",
    "Phase 223 media",
    "phase223-secret-value",
    "leak.invalid",
  ].some((marker) => serialized.includes(marker));
}

function capableWorkerHandler() {
  return createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      name: request.name,
      mimeType: request.mimeType,
      sizeBytes: request.sizeBytes,
      checksumSha256: request.checksumSha256,
    }),
    sendToVendor: async (action, resolvedFiles) => ({
      accepted: true,
      transferKey: action.transferKey,
      deliveredCount: resolvedFiles.length,
      receipt: {
        status: "sent",
        deliveredCount: resolvedFiles.length,
        inspectedFileCount: resolvedFiles.length,
      },
    }),
  });
}

async function preflightFixture(prefix: string): Promise<{
  handlerReadiness: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness;
  handoff: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff;
  invocationHandoffPreflight: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoffPreflightResult;
  executionPlan: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan;
  executionPlanPreflight: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlanPreflightResult;
  execution: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionResult;
  receipt: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt;
  receiptPreflight: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptPreflightResult;
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

  const execution =
    await executeExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecution({
      retryLedgerEntryWorkerHandlerReadiness: readiness.retryLedgerEntryWorkerHandlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoffResult.retryLedgerEntryWorkerInvocationHandoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: executionPlanResult.retryLedgerEntryWorkerExecutionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: executionPlanPreflight,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(execution.accepted, true, "fixture retry-ledger worker execution is accepted");

  const receiptResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt({
      retryLedgerEntryWorkerHandlerReadiness: readiness.retryLedgerEntryWorkerHandlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoffResult.retryLedgerEntryWorkerInvocationHandoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: executionPlanResult.retryLedgerEntryWorkerExecutionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: executionPlanPreflight,
      retryLedgerEntryWorkerExecution: execution,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(receiptResult.accepted, true, "fixture retry-ledger worker execution receipt is accepted");

  const receiptPreflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt({
      retryLedgerEntryWorkerHandlerReadiness: readiness.retryLedgerEntryWorkerHandlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoffResult.retryLedgerEntryWorkerInvocationHandoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: executionPlanResult.retryLedgerEntryWorkerExecutionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: executionPlanPreflight,
      retryLedgerEntryWorkerExecution: execution,
      retryLedgerEntryWorkerExecutionReceipt: receiptResult.retryLedgerEntryWorkerExecutionReceipt,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(receiptPreflight.accepted, true, "fixture retry-ledger worker execution receipt preflight is accepted");

  return {
    handlerReadiness:
      readiness.retryLedgerEntryWorkerHandlerReadiness as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness,
    handoff:
      handoffResult.retryLedgerEntryWorkerInvocationHandoff as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff,
    invocationHandoffPreflight,
    executionPlan:
      executionPlanResult.retryLedgerEntryWorkerExecutionPlan as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan,
    executionPlanPreflight,
    execution,
    receipt:
      receiptResult.retryLedgerEntryWorkerExecutionReceipt as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt,
    receiptPreflight,
  };
}

async function verifyExecutionReceiptCloseoutAcceptsTrustedPreflight(): Promise<void> {
  section("1. Execution Receipt Closeout Accepts Trusted Preflight");
  const fixture = await preflightFixture("phase223_trusted");

  const closeoutResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseout({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: fixture.execution,
      retryLedgerEntryWorkerExecutionReceipt: fixture.receipt,
      retryLedgerEntryWorkerExecutionReceiptPreflight: fixture.receiptPreflight,
      mediaTransferHandler: capableWorkerHandler(),
    });

  const closeout = closeoutResult.retryLedgerEntryWorkerExecutionReceiptCloseout!;
  assertEqual(closeoutResult.accepted, true, "trusted supplied execution receipt preflight closeout is accepted");
  assert(Boolean(closeout), "execution receipt closeout descriptor is returned");
  assertEqual(
    closeout.retryLedgerEntryWorkerExecutionReceiptCloseoutId.startsWith(
      "manual-retry-control-worker-invocation-execution-receipt-work-item-closure-retry-ledger-entry-worker-execution-receipt-closeout:",
    ),
    true,
    "execution receipt closeout id is domain-separated",
  );
  assertEqual(closeout.retryLedgerEntryWorkerExecutionReceiptId, fixture.receipt.retryLedgerEntryWorkerExecutionReceiptId, "closeout binds receipt id");
  assertEqual(closeout.retryLedgerEntryWorkerExecutionPlanId, fixture.receipt.retryLedgerEntryWorkerExecutionPlanId, "closeout binds execution-plan id");
  assertEqual(closeout.retryLedgerEntryWorkerInvocationHandoffId, fixture.receipt.retryLedgerEntryWorkerInvocationHandoffId, "closeout binds invocation handoff id");
  assertEqual(closeout.retryLedgerEntryWorkerHandlerReadinessId, fixture.receipt.retryLedgerEntryWorkerHandlerReadinessId, "closeout binds handler readiness id");
  assertEqual(closeout.retryLedgerEntryWorkerSelectionId, fixture.receipt.retryLedgerEntryWorkerSelectionId, "closeout binds worker-selection id");
  assertEqual(closeout.retryLedgerEntryOperatorHandoffId, fixture.receipt.retryLedgerEntryOperatorHandoffId, "closeout binds operator-handoff id");
  assertEqual(closeout.retryLedgerEntryId, fixture.receipt.retryLedgerEntryId, "closeout binds retry-ledger entry id");
  assertEqual(closeout.retryLedgerEntryPlanId, fixture.receipt.retryLedgerEntryPlanId, "closeout binds retry-ledger plan id");
  assertEqual(closeout.transferKey, fixture.receipt.transferKey, "closeout binds transfer key");
  assertEqual(closeout.hostExecutionAttempted, true, "closeout binds host execution attempt truth");
  assertEqual(closeout.hostResultAccepted, true, "closeout binds host result acceptance truth");
  assertEqual(closeout.hostReportedDeliveredCount, fixture.receipt.hostReportedDeliveredCount, "closeout binds bounded delivered count");
  assertEqual(closeout.hostReceiptMetadataIncluded, fixture.receipt.hostReceiptMetadataIncluded, "closeout binds receipt metadata presence");
  assertEqual(closeout.retryLedgerEntryWorkerExecutionReceiptReady, true, "closeout marks execution receipt ready for the next boundary");
  assertEqual(closeout.retryLedgerEntryWorkerExecutionReceiptClosedByColony, false, "closeout does not close or mutate the work item");
  assertEqual(closeout.retryLedgerEntryWorkerExecutionReceiptPersisted, false, "closeout persists no retry-ledger worker receipt");
  assertEqual(closeout.retryControlWorkerInvocationExecutionReceiptPersisted, false, "closeout persists no upstream control receipt");
  assertEqual(closeout.hostRawReceiptPersisted, false, "closeout persists no raw host receipt");
  assertEqual(closeout.credentialPersistenceCreated, false, "closeout persists no credentials");
  assertEqual(closeout.retryWorkerCreated, false, "closeout creates no retry worker");
  assertEqual(closeout.retryScheduleCreated, false, "closeout creates no retry schedule");
  assertEqual(closeout.automaticVendorRetryAllowed, false, "closeout allows no automatic vendor retry");
  assertEqual(closeout.defaultLiveDeliveryEnabled, false, "closeout enables no default live delivery");
  assertEqual(closeout.publicHostingEnabled, false, "closeout enables no public hosting");
  assertEqual(
    closeoutResult.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseoutTruth,
    "execution_receipt_preflight_bound_retry_ledger_entry_worker_execution_receipt_closeout_readiness_no_new_worker_or_schedule",
    "closeout truth names trusted preflight-bound readiness without new execution",
  );
  assert(!containsPhase223ForbiddenTruth(closeoutResult), "accepted execution receipt closeout leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyCopiedTamperedMissingAndContaminatedPreflightsReject(): Promise<void> {
  section("2. Copied, Tampered, Missing, And Contaminated Preflights Reject");
  const fixture = await preflightFixture("phase223_reject");

  const copiedPreflight = JSON.parse(JSON.stringify(fixture.receiptPreflight));
  const copied =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseout({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: fixture.execution,
      retryLedgerEntryWorkerExecutionReceipt: fixture.receipt,
      retryLedgerEntryWorkerExecutionReceiptPreflight: copiedPreflight,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(copied.accepted, false, "JSON-copied execution receipt preflight is rejected");
  assertEqual(
    copied.reasonCode,
    "trusted_retry_control_work_item_closure_retry_ledger_entry_worker_execution_receipt_preflight_required",
    "copied preflight rejection is bounded",
  );

  const tamperedPreflight = {
    ...fixture.receiptPreflight,
    hostReportedDeliveredCountMatched: false,
  };
  const tampered =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseout({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: fixture.execution,
      retryLedgerEntryWorkerExecutionReceipt: fixture.receipt,
      retryLedgerEntryWorkerExecutionReceiptPreflight: tamperedPreflight,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(tampered.accepted, false, "tampered execution receipt preflight is rejected");
  assertEqual(
    tampered.reasonCode,
    "retry_control_work_item_closure_retry_ledger_entry_worker_execution_receipt_preflight_current_truth_mismatch",
    "tampered preflight rejection is bounded",
  );
  assertEqual(tampered.retryLedgerEntryWorkerExecutionReceiptPreflightCurrentTruthMatched, false, "tampered preflight mismatch is surfaced without raw body");

  const missing =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseout({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: fixture.execution,
      retryLedgerEntryWorkerExecutionReceipt: fixture.receipt,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(missing.accepted, false, "missing supplied execution receipt preflight is rejected");
  assertEqual(
    missing.reasonCode,
    "accepted_retry_control_work_item_closure_retry_ledger_entry_worker_execution_receipt_preflight_required",
    "missing preflight rejection is bounded",
  );

  const contaminatedPreflight = {
    ...fixture.receiptPreflight,
    retryLedgerEntryWorkerExecutionReceiptId: "phase223-secret-value",
    credentialValue: "phase223-secret-value",
    rawSourceUrl: "https://leak.invalid/artifact:phase223",
    hostReportedDeliveredCount: 9007199254740991,
    retryWorkerCreated: true,
  };
  const contaminated =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseout({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: fixture.execution,
      retryLedgerEntryWorkerExecutionReceipt: fixture.receipt,
      retryLedgerEntryWorkerExecutionReceiptPreflight: contaminatedPreflight,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(contaminated.accepted, false, "contaminated execution receipt preflight is rejected");
  assertEqual(
    contaminated.reasonCode,
    "retry_control_work_item_closure_retry_ledger_entry_worker_execution_receipt_preflight_current_truth_mismatch",
    "contaminated preflight rejection is bounded",
  );
  assertEqual(contaminated.retryWorkerCreated, false, "contaminated preflight closeout creates no retry worker");
  assert(!JSON.stringify(contaminated).includes("9007199254740991"), "contaminated preflight rejection does not echo untrusted delivered-count");
  assert(!containsPhase223ForbiddenTruth([copied, tampered, missing, contaminated]), "preflight closeout rejections leak no raw truth");
}

async function verifyExecutionReceiptCloseoutMutationIsBlocked(): Promise<void> {
  section("3. Trusted Execution Receipt Closeout Mutation Is Blocked");
  const fixture = await preflightFixture("phase223_mutation");
  const closeoutResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseout({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: fixture.execution,
      retryLedgerEntryWorkerExecutionReceipt: fixture.receipt,
      retryLedgerEntryWorkerExecutionReceiptPreflight: fixture.receiptPreflight,
      mediaTransferHandler: capableWorkerHandler(),
    });
  const closeout = closeoutResult.retryLedgerEntryWorkerExecutionReceiptCloseout as
    ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseout;

  try {
    (closeout as { retryWorkerCreated?: boolean }).retryWorkerCreated = true;
  } catch {
    // Frozen trusted closeouts may throw under strict runtimes.
  }
  try {
    (closeout.sourceRefFingerprints[0] as { credentialValue?: string }).credentialValue =
      "phase223-secret-value";
  } catch {
    // Frozen nested source fingerprints may throw under strict runtimes.
  }

  assertEqual(closeoutResult.accepted, true, "trusted execution receipt closeout is mutation-blocked");
  assertEqual(closeout.retryWorkerCreated, false, "trusted execution receipt closeout cannot be contaminated");
  assertEqual(
    (closeout.sourceRefFingerprints[0] as { credentialValue?: string }).credentialValue,
    undefined,
    "trusted nested closeout fingerprints cannot be contaminated with credentials",
  );
  assertEqual(closeout.publicHostingEnabled, false, "mutation-blocked closeout enables no public hosting");
  assert(!containsPhase223ForbiddenTruth(closeoutResult), "mutation-blocked closeout leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 223 Verification (Retry-Ledger Entry Worker Execution Receipt Closeout)\n");
  await verifyExecutionReceiptCloseoutAcceptsTrustedPreflight();
  await verifyCopiedTamperedMissingAndContaminatedPreflightsReject();
  await verifyExecutionReceiptCloseoutMutationIsBlocked();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 223: retry-ledger entry worker execution receipt closeout is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
