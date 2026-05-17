/** Phase 224 Verification - Retry-Ledger Entry Worker Execution Receipt Closeout Preflight */

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
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseout,
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

function containsPhase224ForbiddenTruth(value: unknown): boolean {
  if (containsPhase214ForbiddenTruth(value)) return true;
  const serialized = JSON.stringify(value);
  if (!serialized) return false;
  return [
    "artifact:phase224",
    "phase224_",
    "phase-224-media",
    "Phase 224 media",
    "phase224-secret-value",
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

async function closeoutFixture(prefix: string): Promise<{
  handlerReadiness: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness;
  handoff: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff;
  invocationHandoffPreflight: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoffPreflightResult;
  executionPlan: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan;
  executionPlanPreflight: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlanPreflightResult;
  execution: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionResult;
  receipt: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt;
  receiptPreflight: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptPreflightResult;
  closeout: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseout;
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

  const closeoutResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseout({
      retryLedgerEntryWorkerHandlerReadiness: readiness.retryLedgerEntryWorkerHandlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoffResult.retryLedgerEntryWorkerInvocationHandoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: executionPlanResult.retryLedgerEntryWorkerExecutionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: executionPlanPreflight,
      retryLedgerEntryWorkerExecution: execution,
      retryLedgerEntryWorkerExecutionReceipt: receiptResult.retryLedgerEntryWorkerExecutionReceipt,
      retryLedgerEntryWorkerExecutionReceiptPreflight: receiptPreflight,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(closeoutResult.accepted, true, "fixture retry-ledger worker execution receipt closeout is accepted");

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
    closeout:
      closeoutResult.retryLedgerEntryWorkerExecutionReceiptCloseout as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseout,
  };
}

async function verifyExecutionReceiptCloseoutPreflightAcceptsCurrentCloseout(): Promise<void> {
  section("1. Execution Receipt Closeout Preflight Accepts Current Closeout");
  const fixture = await closeoutFixture("phase224_trusted");

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseout({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: fixture.execution,
      retryLedgerEntryWorkerExecutionReceipt: fixture.receipt,
      retryLedgerEntryWorkerExecutionReceiptPreflight: fixture.receiptPreflight,
      retryLedgerEntryWorkerExecutionReceiptCloseout: fixture.closeout,
      mediaTransferHandler: capableWorkerHandler(),
    });

  assertEqual(preflight.accepted, true, "trusted supplied execution receipt closeout preflight is accepted");
  assertEqual(preflight.retryLedgerEntryWorkerExecutionReceiptCloseoutIdMatched, true, "closeout id matches recomputed truth");
  assertEqual(preflight.retryLedgerEntryWorkerExecutionReceiptCloseoutStillTrusted, true, "closeout remains trusted");
  assertEqual(preflight.retryLedgerEntryWorkerExecutionReceiptCloseoutCurrentTruthMatched, true, "closeout current truth matches");
  assertEqual(preflight.retryLedgerEntryWorkerExecutionReceiptPreflightStillTrusted, true, "source receipt preflight remains trusted");
  assertEqual(preflight.retryLedgerEntryWorkerExecutionReceiptStillTrusted, true, "source receipt remains trusted");
  assertEqual(preflight.retryLedgerEntryWorkerExecutionStillTrusted, true, "source execution remains trusted");
  assertEqual(preflight.retryLedgerEntryWorkerExecutionReceiptReadyMatched, true, "receipt readiness matches");
  assertEqual(preflight.retryLedgerEntryWorkerExecutionReceiptClosedByColonyMatched, true, "closeout preflight keeps work item open");
  assertEqual(preflight.retryLedgerEntryWorkerExecutionReceiptPersisted, false, "preflight persists no retry-ledger worker receipt");
  assertEqual(preflight.retryControlWorkerInvocationExecutionReceiptPersisted, false, "preflight persists no upstream receipt");
  assertEqual(preflight.hostRawReceiptStillNotPersisted, true, "raw host receipt remains non-persistent");
  assertEqual(preflight.retryWorkerStillBlocked, true, "preflight creates no retry worker or schedule");
  assertEqual(preflight.automaticVendorRetryStillBlocked, true, "preflight allows no automatic vendor retry");
  assertEqual(preflight.defaultLiveDeliveryStillBlocked, true, "preflight enables no default live delivery");
  assertEqual(preflight.publicHostingStillBlocked, true, "preflight enables no public hosting");
  assertEqual(
    preflight.retryLedgerEntryWorkerExecutionReceiptCloseout?.retryLedgerEntryWorkerExecutionReceiptCloseoutId,
    fixture.closeout.retryLedgerEntryWorkerExecutionReceiptCloseoutId,
    "accepted closeout preflight returns the trusted supplied closeout",
  );
  assertEqual(
    preflight.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseoutPreflightTruth,
    "trusted_supplied_retry_ledger_entry_worker_execution_receipt_closeout_current_truth_preflight_no_persistence",
    "closeout preflight truth states trusted supplied closeout current-truth recomputation with no persistence",
  );
  assert(!containsPhase224ForbiddenTruth(preflight), "accepted closeout preflight leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyCopiedTamperedMissingAndContaminatedCloseoutsReject(): Promise<void> {
  section("2. Copied, Tampered, Missing, And Contaminated Closeouts Reject");
  const fixture = await closeoutFixture("phase224_reject");

  const copiedCloseout = JSON.parse(JSON.stringify(fixture.closeout));
  const copied =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseout({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: fixture.execution,
      retryLedgerEntryWorkerExecutionReceipt: fixture.receipt,
      retryLedgerEntryWorkerExecutionReceiptPreflight: fixture.receiptPreflight,
      retryLedgerEntryWorkerExecutionReceiptCloseout: copiedCloseout,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(copied.accepted, false, "JSON-copied execution receipt closeout is rejected");
  assertEqual(
    copied.reasonCode,
    "trusted_retry_control_work_item_closure_retry_ledger_entry_worker_execution_receipt_closeout_required",
    "copied closeout rejection is bounded",
  );

  const tamperedCloseout = {
    ...fixture.closeout,
    hostReportedDeliveredCount: fixture.closeout.hostReportedDeliveredCount + 1,
  };
  const tampered =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseout({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: fixture.execution,
      retryLedgerEntryWorkerExecutionReceipt: fixture.receipt,
      retryLedgerEntryWorkerExecutionReceiptPreflight: fixture.receiptPreflight,
      retryLedgerEntryWorkerExecutionReceiptCloseout: tamperedCloseout,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(tampered.accepted, false, "tampered execution receipt closeout is rejected");
  assertEqual(
    tampered.reasonCode,
    "retry_control_work_item_closure_retry_ledger_entry_worker_execution_receipt_closeout_current_truth_mismatch",
    "tampered closeout rejection is bounded",
  );
  assertEqual(tampered.hostReportedDeliveredCountMatched, false, "tampered delivered count is reported without raw closeout body");

  const missing =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseout({
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
  assertEqual(missing.accepted, false, "missing supplied execution receipt closeout is rejected");
  assertEqual(
    missing.reasonCode,
    "trusted_retry_control_work_item_closure_retry_ledger_entry_worker_execution_receipt_closeout_required",
    "missing closeout rejection is bounded",
  );

  const contaminatedCloseout = {
    ...fixture.closeout,
    retryLedgerEntryWorkerExecutionReceiptCloseoutId: "phase224-secret-value",
    credentialValue: "phase224-secret-value",
    rawSourceUrl: "https://leak.invalid/artifact:phase224",
    hostReportedDeliveredCount: 9007199254740991,
    retryWorkerCreated: true,
  };
  const contaminated =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseout({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: fixture.execution,
      retryLedgerEntryWorkerExecutionReceipt: fixture.receipt,
      retryLedgerEntryWorkerExecutionReceiptPreflight: fixture.receiptPreflight,
      retryLedgerEntryWorkerExecutionReceiptCloseout: contaminatedCloseout,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(contaminated.accepted, false, "contaminated execution receipt closeout is rejected");
  assertEqual(
    contaminated.reasonCode,
    "retry_control_work_item_closure_retry_ledger_entry_worker_execution_receipt_closeout_current_truth_mismatch",
    "contaminated closeout rejection is bounded",
  );
  assertEqual(contaminated.retryWorkerCreated, false, "contaminated closeout preflight creates no retry worker");
  assert(!JSON.stringify(contaminated).includes("9007199254740991"), "contaminated closeout rejection does not echo untrusted delivered-count");
  assert(!containsPhase224ForbiddenTruth([copied, tampered, missing, contaminated]), "closeout preflight rejections leak no raw truth");
}

async function verifyExecutionReceiptCloseoutPreflightMutationIsBlocked(): Promise<void> {
  section("3. Trusted Execution Receipt Closeout Preflight Mutation Is Blocked");
  const fixture = await closeoutFixture("phase224_mutation");
  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseout({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: fixture.execution,
      retryLedgerEntryWorkerExecutionReceipt: fixture.receipt,
      retryLedgerEntryWorkerExecutionReceiptPreflight: fixture.receiptPreflight,
      retryLedgerEntryWorkerExecutionReceiptCloseout: fixture.closeout,
      mediaTransferHandler: capableWorkerHandler(),
    });

  try {
    (preflight as { retryWorkerCreated?: boolean }).retryWorkerCreated = true;
  } catch {
    // Frozen trusted preflights may throw under strict runtimes.
  }
  try {
    (preflight.retryLedgerEntryWorkerExecutionReceiptCloseout as { credentialValue?: string }).credentialValue =
      "phase224-secret-value";
  } catch {
    // Frozen nested closeouts may throw under strict runtimes.
  }
  try {
    (
      preflight.retryLedgerEntryWorkerExecutionReceiptCloseout?.sourceRefFingerprints as unknown as Array<Record<string, unknown>>
    )?.push({ rawSourceUrl: "https://leak.invalid/artifact:phase224/nested" });
  } catch {
    // Frozen nested arrays may throw under strict runtimes.
  }

  assertEqual(preflight.accepted, true, "trusted execution receipt closeout preflight is mutation-blocked");
  assertEqual(preflight.retryWorkerCreated, false, "trusted execution receipt closeout preflight cannot be contaminated");
  assertEqual(
    (preflight.retryLedgerEntryWorkerExecutionReceiptCloseout as { credentialValue?: string }).credentialValue,
    undefined,
    "trusted nested execution receipt closeout cannot be contaminated with credentials",
  );
  assertEqual(preflight.publicHostingEnabled, false, "mutation-blocked preflight enables no public hosting");
  assert(!containsPhase224ForbiddenTruth(preflight), "mutation-blocked closeout preflight leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 224 Verification (Retry-Ledger Entry Worker Execution Receipt Closeout Preflight)\n");
  await verifyExecutionReceiptCloseoutPreflightAcceptsCurrentCloseout();
  await verifyCopiedTamperedMissingAndContaminatedCloseoutsReject();
  await verifyExecutionReceiptCloseoutPreflightMutationIsBlocked();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 224: retry-ledger entry worker execution receipt closeout preflight is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
