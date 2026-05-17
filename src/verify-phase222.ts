/** Phase 222 Verification - Retry-Ledger Entry Worker Execution Receipt Preflight */

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt,
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

function containsPhase222ForbiddenTruth(value: unknown): boolean {
  if (containsPhase214ForbiddenTruth(value)) return true;
  const serialized = JSON.stringify(value);
  if (!serialized) return false;
  return [
    "artifact:phase222",
    "phase222_",
    "phase-222-media",
    "Phase 222 media",
    "phase222-secret-value",
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

async function receiptFixture(prefix: string): Promise<{
  handlerReadiness: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness;
  handoff: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff;
  invocationHandoffPreflight: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoffPreflightResult;
  executionPlan: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan;
  executionPlanPreflight: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlanPreflightResult;
  execution: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionResult;
  receipt: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt;
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
  };
}

async function verifyTrustedExecutionReceiptPreflightBindsCurrentReceiptTruth(): Promise<void> {
  section("1. Trusted Execution Receipt Preflight Binds Current Receipt Truth");
  const fixture = await receiptFixture("phase222_trusted");

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: fixture.execution,
      retryLedgerEntryWorkerExecutionReceipt: fixture.receipt,
      mediaTransferHandler: capableWorkerHandler(),
    });

  assertEqual(preflight.accepted, true, "trusted supplied execution receipt preflight is accepted");
  assertEqual(preflight.retryLedgerEntryWorkerExecutionReceiptIdMatched, true, "receipt id matches recomputed truth");
  assertEqual(preflight.retryLedgerEntryWorkerExecutionReceiptStillTrusted, true, "receipt remains trusted");
  assertEqual(preflight.retryLedgerEntryWorkerExecutionReceiptCurrentTruthMatched, true, "receipt current truth matches");
  assertEqual(preflight.retryLedgerEntryWorkerExecutionStillTrusted, true, "source execution remains trusted");
  assertEqual(preflight.retryLedgerEntryWorkerExecutionPlanPreflightStillTrusted, true, "execution-plan preflight remains trusted");
  assertEqual(preflight.retryLedgerEntryWorkerExecutionPlanStillTrusted, true, "execution plan remains trusted");
  assertEqual(preflight.transferKeyMatched, true, "transfer key matches recomputed receipt truth");
  assertEqual(preflight.hostReportedDeliveredCountMatched, true, "host delivered count matches recomputed receipt truth");
  assertEqual(preflight.hostReceiptMetadataIncludedMatched, true, "host receipt metadata claim matches");
  assertEqual(preflight.hostRawReceiptStillNotPersisted, true, "raw host receipt is still not persisted");
  assertEqual(preflight.retryWorkerStillBlocked, true, "preflight creates no retry worker or schedule");
  assertEqual(preflight.automaticVendorRetryStillBlocked, true, "preflight allows no automatic vendor retry");
  assertEqual(preflight.defaultLiveDeliveryStillBlocked, true, "preflight enables no default live delivery");
  assertEqual(preflight.publicHostingStillBlocked, true, "preflight enables no public hosting");
  assertEqual(preflight.retryControlWorkerInvocationExecutionReceiptPersisted, false, "preflight persists no upstream receipt");
  assertEqual(
    preflight.manualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceiptPreflightTruth,
    "trusted_supplied_retry_ledger_entry_worker_execution_receipt_current_truth_preflight_no_persistence",
    "preflight truth states trusted supplied receipt current-truth recomputation with no persistence",
  );
  assert(!containsPhase222ForbiddenTruth(preflight), "accepted receipt preflight leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyCopiedTamperedMissingAndContaminatedReceiptsReject(): Promise<void> {
  section("2. Copied, Tampered, Missing, And Contaminated Receipts Reject");
  const fixture = await receiptFixture("phase222_reject");

  const copiedReceipt = JSON.parse(JSON.stringify(fixture.receipt));
  const copied =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: fixture.execution,
      retryLedgerEntryWorkerExecutionReceipt: copiedReceipt,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(copied.accepted, false, "JSON-copied execution receipt is rejected");
  assertEqual(
    copied.reasonCode,
    "trusted_retry_control_work_item_closure_retry_ledger_entry_worker_execution_receipt_required",
    "copied receipt rejection is bounded",
  );

  const tamperedReceipt = {
    ...fixture.receipt,
    transferKey: "media-transfer:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  };
  const tampered =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: fixture.execution,
      retryLedgerEntryWorkerExecutionReceipt: tamperedReceipt,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(tampered.accepted, false, "tampered execution receipt is rejected");
  assertEqual(
    tampered.reasonCode,
    "retry_control_work_item_closure_retry_ledger_entry_worker_execution_receipt_current_truth_mismatch",
    "tampered receipt rejection is bounded",
  );
  assertEqual(tampered.transferKeyMatched, false, "tampered transfer key is reported without raw receipt body");

  const missing =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: fixture.execution,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(missing.accepted, false, "missing supplied execution receipt is rejected");
  assertEqual(
    missing.reasonCode,
    "trusted_retry_control_work_item_closure_retry_ledger_entry_worker_execution_receipt_required",
    "missing receipt rejection is bounded",
  );

  const contaminatedReceipt = {
    ...fixture.receipt,
    retryLedgerEntryWorkerExecutionReceiptId: "phase222-secret-value",
    credentialValue: "phase222-secret-value",
    rawSourceUrl: "https://leak.invalid/artifact:phase222",
    retryWorkerCreated: true,
  };
  const contaminated =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: fixture.execution,
      retryLedgerEntryWorkerExecutionReceipt: contaminatedReceipt,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(contaminated.accepted, false, "contaminated execution receipt is rejected");
  assertEqual(
    contaminated.reasonCode,
    "retry_control_work_item_closure_retry_ledger_entry_worker_execution_receipt_current_truth_mismatch",
    "contaminated receipt rejection is bounded",
  );
  assertEqual(contaminated.retryWorkerCreated, false, "contaminated receipt preflight creates no retry worker");
  assert(!containsPhase222ForbiddenTruth([copied, tampered, missing, contaminated]), "receipt preflight rejections leak no raw truth");
}

async function verifyExecutionReceiptPreflightMutationIsBlocked(): Promise<void> {
  section("3. Trusted Execution Receipt Preflight Mutation Is Blocked");
  const fixture = await receiptFixture("phase222_mutation");
  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: fixture.execution,
      retryLedgerEntryWorkerExecutionReceipt: fixture.receipt,
      mediaTransferHandler: capableWorkerHandler(),
    });

  try {
    (preflight as { retryWorkerCreated?: boolean }).retryWorkerCreated = true;
  } catch {
    // Frozen trusted preflights may throw under strict runtimes.
  }
  try {
    (preflight.retryLedgerEntryWorkerExecutionReceipt as { credentialValue?: string }).credentialValue =
      "phase222-secret-value";
  } catch {
    // Frozen nested receipts may throw under strict runtimes.
  }

  assertEqual(preflight.accepted, true, "trusted execution receipt preflight is mutation-blocked");
  assertEqual(preflight.retryWorkerCreated, false, "trusted execution receipt preflight cannot be contaminated");
  assertEqual(
    (preflight.retryLedgerEntryWorkerExecutionReceipt as { credentialValue?: string }).credentialValue,
    undefined,
    "trusted nested execution receipt cannot be contaminated with credentials",
  );
  assertEqual(preflight.publicHostingEnabled, false, "mutation-blocked preflight enables no public hosting");
  assert(!containsPhase222ForbiddenTruth(preflight), "mutation-blocked receipt preflight leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 222 Verification (Retry-Ledger Entry Worker Execution Receipt Preflight)\n");
  await verifyTrustedExecutionReceiptPreflightBindsCurrentReceiptTruth();
  await verifyCopiedTamperedMissingAndContaminatedReceiptsReject();
  await verifyExecutionReceiptPreflightMutationIsBlocked();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 222: retry-ledger entry worker execution receipt preflight is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
