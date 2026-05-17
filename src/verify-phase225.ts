/** Phase 225 Verification - Retry-Ledger Entry Worker Execution Receipt Closeout Record Plan */

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseout,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseoutRecordPlan,
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
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseoutPreflightResult,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseoutRecordPlan,
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

function containsPhase225ForbiddenTruth(value: unknown): boolean {
  if (containsPhase214ForbiddenTruth(value)) return true;
  const serialized = JSON.stringify(value);
  if (!serialized) return false;
  return [
    "artifact:phase225",
    "phase225_",
    "phase-225-media",
    "Phase 225 media",
    "phase225-secret-value",
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

async function closeoutPreflightFixture(prefix: string): Promise<{
  handlerReadiness: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness;
  handoff: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff;
  invocationHandoffPreflight: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoffPreflightResult;
  executionPlan: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan;
  executionPlanPreflight: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlanPreflightResult;
  execution: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionResult;
  receipt: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt;
  receiptPreflight: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptPreflightResult;
  closeout: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseout;
  closeoutPreflight: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseoutPreflightResult;
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

  const closeoutPreflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseout({
      retryLedgerEntryWorkerHandlerReadiness: readiness.retryLedgerEntryWorkerHandlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: handoffResult.retryLedgerEntryWorkerInvocationHandoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: executionPlanResult.retryLedgerEntryWorkerExecutionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: executionPlanPreflight,
      retryLedgerEntryWorkerExecution: execution,
      retryLedgerEntryWorkerExecutionReceipt: receiptResult.retryLedgerEntryWorkerExecutionReceipt,
      retryLedgerEntryWorkerExecutionReceiptPreflight: receiptPreflight,
      retryLedgerEntryWorkerExecutionReceiptCloseout: closeoutResult.retryLedgerEntryWorkerExecutionReceiptCloseout,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(closeoutPreflight.accepted, true, "fixture retry-ledger worker execution receipt closeout preflight is accepted");

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
    closeoutPreflight,
  };
}

async function verifyCloseoutRecordPlanBindsTrustedCloseoutPreflight(): Promise<void> {
  section("1. Closeout Record Plan Binds Trusted Closeout Preflight");
  const fixture = await closeoutPreflightFixture("phase225_trusted");
  const first =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseoutRecordPlan({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: fixture.execution,
      retryLedgerEntryWorkerExecutionReceipt: fixture.receipt,
      retryLedgerEntryWorkerExecutionReceiptPreflight: fixture.receiptPreflight,
      retryLedgerEntryWorkerExecutionReceiptCloseout: fixture.closeout,
      retryLedgerEntryWorkerExecutionReceiptCloseoutPreflight: fixture.closeoutPreflight,
      mediaTransferHandler: capableWorkerHandler(),
    });
  const second =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseoutRecordPlan({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: fixture.execution,
      retryLedgerEntryWorkerExecutionReceipt: fixture.receipt,
      retryLedgerEntryWorkerExecutionReceiptPreflight: fixture.receiptPreflight,
      retryLedgerEntryWorkerExecutionReceiptCloseout: fixture.closeout,
      retryLedgerEntryWorkerExecutionReceiptCloseoutPreflight: fixture.closeoutPreflight,
      mediaTransferHandler: capableWorkerHandler(),
    });

  assertEqual(first.accepted, true, "trusted closeout-preflight-bound record plan is accepted");
  assertEqual(first.retryLedgerEntryWorkerExecutionReceiptCloseoutPreflightAccepted, true, "record plan sees accepted closeout preflight");
  assertEqual(first.retryLedgerEntryWorkerExecutionReceiptCloseoutPreflightStillTrusted, true, "record plan requires trusted closeout preflight");
  assertEqual(first.retryLedgerEntryWorkerExecutionReceiptCloseoutStillTrusted, true, "record plan preserves closeout trust");
  const recordPlan =
    first.retryLedgerEntryWorkerExecutionReceiptCloseoutRecordPlan as ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseoutRecordPlan;
  assert(Boolean(recordPlan), "record plan descriptor is returned");
  assert(
    recordPlan.retryLedgerEntryWorkerExecutionReceiptCloseoutRecordPlanId.startsWith(
      "manual-retry-control-worker-invocation-execution-receipt-work-item-closure-retry-ledger-entry-worker-execution-receipt-closeout-record-plan:",
    ),
    "record plan id is deterministic and scoped",
  );
  assertEqual(
    second.retryLedgerEntryWorkerExecutionReceiptCloseoutRecordPlanId,
    recordPlan.retryLedgerEntryWorkerExecutionReceiptCloseoutRecordPlanId,
    "record plan id is stable for the same closeout preflight",
  );
  assertEqual(recordPlan.retryLedgerEntryWorkerExecutionReceiptCloseoutId, fixture.closeout.retryLedgerEntryWorkerExecutionReceiptCloseoutId, "record plan binds closeout id");
  assertEqual(recordPlan.retryLedgerEntryWorkerExecutionReceiptId, fixture.closeout.retryLedgerEntryWorkerExecutionReceiptId, "record plan binds receipt id");
  assertEqual(recordPlan.retryLedgerEntryWorkerExecutionPlanId, fixture.closeout.retryLedgerEntryWorkerExecutionPlanId, "record plan binds execution-plan id");
  assertEqual(recordPlan.retryLedgerEntryWorkerInvocationHandoffId, fixture.closeout.retryLedgerEntryWorkerInvocationHandoffId, "record plan binds invocation handoff id");
  assertEqual(recordPlan.retryLedgerEntryWorkerHandlerReadinessId, fixture.closeout.retryLedgerEntryWorkerHandlerReadinessId, "record plan binds handler readiness id");
  assertEqual(recordPlan.retryLedgerEntryWorkerSelectionId, fixture.closeout.retryLedgerEntryWorkerSelectionId, "record plan binds worker selection id");
  assertEqual(recordPlan.retryLedgerEntryOperatorHandoffId, fixture.closeout.retryLedgerEntryOperatorHandoffId, "record plan binds operator handoff id");
  assertEqual(recordPlan.retryLedgerEntryId, fixture.closeout.retryLedgerEntryId, "record plan binds retry-ledger entry id");
  assertEqual(recordPlan.retryLedgerEntryPlanId, fixture.closeout.retryLedgerEntryPlanId, "record plan binds retry-ledger plan id");
  assertEqual(recordPlan.transferKey, fixture.closeout.transferKey, "record plan binds transfer key");
  assertEqual(recordPlan.hostReportedDeliveredCount, fixture.closeout.hostReportedDeliveredCount, "record plan binds delivered-count truth");
  assertEqual(recordPlan.hostReceiptMetadataIncluded, fixture.closeout.hostReceiptMetadataIncluded, "record plan binds receipt metadata truth");
  assertEqual(recordPlan.durableCloseoutRecordReady, true, "record plan marks durable closeout record readiness");
  assertEqual(recordPlan.retryLedgerEntryWorkerExecutionReceiptClosedByColony, false, "record plan keeps retry-ledger worker receipt open");
  assertEqual(recordPlan.closeoutRecordPersisted, false, "record plan does not persist a closeout record");
  assertEqual(recordPlan.retryLedgerEntryWorkerExecutionReceiptPersisted, false, "record plan persists no retry-ledger worker receipt");
  assertEqual(recordPlan.retryControlWorkerInvocationExecutionReceiptPersisted, false, "record plan persists no upstream receipt");
  assertEqual(recordPlan.retryWorkerCreated, false, "record plan creates no retry worker");
  assertEqual(recordPlan.retryScheduleCreated, false, "record plan creates no retry schedule");
  assertEqual(recordPlan.automaticVendorRetryAllowed, false, "record plan enables no automatic vendor retry");
  assertEqual(recordPlan.defaultLiveDeliveryEnabled, false, "record plan keeps default live delivery blocked");
  assertEqual(recordPlan.publicHostingEnabled, false, "record plan keeps public hosting blocked");
  assertEqual(
    recordPlan.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseoutRecordPlanTruth,
    "trusted_closeout_preflight_bound_retry_ledger_entry_worker_execution_receipt_closeout_record_plan_no_persistence",
    "record plan truth is explicit",
  );
  assert(!containsPhase225ForbiddenTruth([first, second]), "accepted closeout record plan leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyCloseoutRecordPlanRejectsCopiedTamperedAndContaminatedPreflight(): Promise<void> {
  section("2. Copied, Tampered, And Contaminated Closeout Preflights Reject");
  const fixture = await closeoutPreflightFixture("phase225_reject");
  const baseRequest = {
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
  };

  const copiedPreflight = JSON.parse(JSON.stringify(fixture.closeoutPreflight));
  const copied =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseoutRecordPlan({
      ...baseRequest,
      retryLedgerEntryWorkerExecutionReceiptCloseoutPreflight: copiedPreflight,
    });
  assertEqual(copied.accepted, false, "JSON-copied closeout preflight is rejected");
  assertEqual(
    copied.reasonCode,
    "trusted_retry_control_work_item_closure_retry_ledger_entry_worker_execution_receipt_closeout_preflight_required",
    "copied preflight rejection is bounded",
  );

  const missing =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseoutRecordPlan(
      baseRequest,
    );
  assertEqual(missing.accepted, false, "missing closeout preflight is rejected");
  assertEqual(
    missing.reasonCode,
    "trusted_retry_control_work_item_closure_retry_ledger_entry_worker_execution_receipt_closeout_preflight_required",
    "missing preflight rejection is bounded",
  );
  assertEqual(missing.closeoutRecordPersisted, false, "missing preflight persists no closeout record");

  const tamperedPreflight = {
    ...fixture.closeoutPreflight,
    hostReportedDeliveredCountMatched: false,
  };
  const tampered =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseoutRecordPlan({
      ...baseRequest,
      retryLedgerEntryWorkerExecutionReceiptCloseoutPreflight: tamperedPreflight,
    });
  assertEqual(tampered.accepted, false, "tampered closeout preflight is rejected");
  assertEqual(
    tampered.reasonCode,
    "retry_control_work_item_closure_retry_ledger_entry_worker_execution_receipt_closeout_preflight_current_truth_mismatch",
    "tampered preflight rejection is bounded",
  );
  assertEqual(tampered.closeoutRecordPersisted, false, "tampered preflight persists no closeout record");

  const contaminatedPreflight = {
    ...fixture.closeoutPreflight,
    credentialValue: "phase225-secret-value",
    rawSourceUrl: "https://leak.invalid/artifact:phase225",
    retryWorkerCreated: true,
  };
  const contaminated =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseoutRecordPlan({
      ...baseRequest,
      retryLedgerEntryWorkerExecutionReceiptCloseoutPreflight: contaminatedPreflight,
    });
  assertEqual(contaminated.accepted, false, "contaminated closeout preflight is rejected");
  assertEqual(
    contaminated.reasonCode,
    "retry_control_work_item_closure_retry_ledger_entry_worker_execution_receipt_closeout_preflight_current_truth_mismatch",
    "contaminated preflight rejection is bounded",
  );
  assertEqual(contaminated.retryWorkerCreated, false, "contaminated preflight creates no retry worker");
  assert(!containsPhase225ForbiddenTruth([copied, missing, tampered, contaminated]), "closeout record-plan rejections leak no raw truth");
}

async function verifyCloseoutRecordPlanMutationIsBlocked(): Promise<void> {
  section("3. Trusted Closeout Record Plan Mutation Is Blocked");
  const fixture = await closeoutPreflightFixture("phase225_mutation");
  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptCloseoutRecordPlan({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: fixture.execution,
      retryLedgerEntryWorkerExecutionReceipt: fixture.receipt,
      retryLedgerEntryWorkerExecutionReceiptPreflight: fixture.receiptPreflight,
      retryLedgerEntryWorkerExecutionReceiptCloseout: fixture.closeout,
      retryLedgerEntryWorkerExecutionReceiptCloseoutPreflight: fixture.closeoutPreflight,
      mediaTransferHandler: capableWorkerHandler(),
    });

  try {
    (result.retryLedgerEntryWorkerExecutionReceiptCloseoutRecordPlan as { credentialValue?: string }).credentialValue =
      "phase225-secret-value";
  } catch {
    // Frozen trusted record plans may throw under strict runtimes.
  }
  try {
    (
      result.retryLedgerEntryWorkerExecutionReceiptCloseoutRecordPlan?.sourceRefFingerprints as unknown as Array<Record<string, unknown>>
    )?.push({ rawSourceUrl: "https://leak.invalid/artifact:phase225/nested" });
  } catch {
    // Frozen nested arrays may throw under strict runtimes.
  }

  assertEqual(result.accepted, true, "trusted closeout record plan is mutation-blocked");
  assertEqual(result.retryWorkerCreated, false, "trusted closeout record plan cannot be contaminated");
  assertEqual(
    (result.retryLedgerEntryWorkerExecutionReceiptCloseoutRecordPlan as { credentialValue?: string }).credentialValue,
    undefined,
    "trusted nested closeout record plan cannot be contaminated with credentials",
  );
  assertEqual(result.publicHostingEnabled, false, "mutation-blocked record plan enables no public hosting");
  assert(!containsPhase225ForbiddenTruth(result), "mutation-blocked record plan leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 225 Verification (Retry-Ledger Entry Worker Execution Receipt Closeout Record Plan)\n");
  await verifyCloseoutRecordPlanBindsTrustedCloseoutPreflight();
  await verifyCloseoutRecordPlanRejectsCopiedTamperedAndContaminatedPreflight();
  await verifyCloseoutRecordPlanMutationIsBlocked();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 225: retry-ledger entry worker execution receipt closeout record plan is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
