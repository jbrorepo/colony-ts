/** Phase 221 Verification - Retry-Ledger Entry Worker Execution Receipt */

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerSelection,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecution,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlanPreflightResult,
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

function containsPhase221ForbiddenTruth(value: unknown): boolean {
  if (containsPhase214ForbiddenTruth(value)) return true;
  const serialized = JSON.stringify(value);
  if (!serialized) return false;
  return ["artifact:phase221", "phase221_", "phase-221-media", "Phase 221 media"].some((marker) =>
    serialized.includes(marker),
  );
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

async function executionFixture(prefix: string): Promise<{
  handlerReadiness: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerHandlerReadiness;
  handoff: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoff;
  invocationHandoffPreflight: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerInvocationHandoffPreflightResult;
  executionPlan: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlan;
  executionPlanPreflight: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionPlanPreflightResult;
  execution: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionResult;
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
  };
}

async function verifyTrustedExecutionReceiptBindsSanitizedHostTruth(): Promise<void> {
  section("1. Trusted Execution Receipt Binds Sanitized Host Truth");
  const fixture = await executionFixture("phase221_trusted");

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: fixture.execution,
      mediaTransferHandler: capableWorkerHandler(),
    });

  const receipt = result.retryLedgerEntryWorkerExecutionReceipt;
  assertEqual(result.accepted, true, "trusted retry-ledger worker execution receipt is accepted");
  assert(Boolean(receipt), "trusted retry-ledger worker execution receipt is returned");
  assert(
    receipt?.retryLedgerEntryWorkerExecutionReceiptId.startsWith(
      "manual-retry-control-worker-invocation-execution-receipt-work-item-closure-retry-ledger-entry-worker-execution-receipt:",
    ) === true,
    "receipt id uses the Phase 221 domain",
  );
  assertEqual(receipt?.retryLedgerEntryWorkerExecutionPlanId, fixture.executionPlan.retryLedgerEntryWorkerExecutionPlanId, "receipt binds execution-plan id");
  assertEqual(receipt?.retryLedgerEntryWorkerInvocationHandoffId, fixture.executionPlan.retryLedgerEntryWorkerInvocationHandoffId, "receipt binds invocation handoff id");
  assertEqual(receipt?.transferKey, fixture.executionPlan.transferKey, "receipt binds transfer key");
  assertEqual(receipt?.hostExecutionAttempted, true, "receipt records host execution attempt");
  assertEqual(receipt?.hostResultAccepted, true, "receipt records accepted host result");
  assertEqual(receipt?.transferKeyEchoMatched, true, "receipt records transfer-key echo truth");
  assertEqual(receipt?.hostReportedDeliveredCount, fixture.executionPlan.sourceRefFingerprints.length, "receipt records bounded delivered count");
  assertEqual(receipt?.hostReceiptMetadataIncluded, true, "receipt records host receipt metadata without raw receipt body");
  assertEqual(receipt?.retryControlWorkerInvocationExecutionReceiptPersisted, false, "receipt is not persisted by Colony");
  assertEqual(receipt?.retryWorkerCreated, false, "receipt creates no retry worker");
  assertEqual(receipt?.retryScheduleCreated, false, "receipt creates no retry schedule");
  assertEqual(receipt?.automaticVendorRetryAllowed, false, "receipt allows no automatic vendor retry");
  assertEqual(receipt?.defaultLiveDeliveryEnabled, false, "receipt enables no default live delivery");
  assertEqual(receipt?.publicHostingEnabled, false, "receipt enables no public hosting");
  assert(!containsPhase221ForbiddenTruth(result), "accepted execution receipt leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyCopiedTamperedFailedAndContaminatedExecutionsReject(): Promise<void> {
  section("2. Copied, Tampered, Failed, And Contaminated Executions Reject");
  const fixture = await executionFixture("phase221_reject");

  const copiedExecution = JSON.parse(JSON.stringify(fixture.execution));
  const copied =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: copiedExecution,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(copied.accepted, false, "JSON-copied execution-shaped object is rejected");
  assertEqual(
    copied.reasonCode,
    "trusted_retry_control_work_item_closure_retry_ledger_entry_worker_execution_required",
    "copied execution rejection is bounded",
  );

  const tamperedExecution: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionResult = {
    ...fixture.execution,
    hostResult: fixture.execution.hostResult
      ? {
          ...fixture.execution.hostResult,
          data: {
            ...fixture.execution.hostResult.data,
            transferKey: "media-transfer:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          },
        }
      : undefined,
  };
  const tampered =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: tamperedExecution,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(tampered.accepted, false, "tampered transfer-key execution blocks receipt");
  assertEqual(
    tampered.reasonCode,
    "retry_control_work_item_closure_retry_ledger_entry_worker_execution_current_truth_mismatch",
    "tampered execution rejection is bounded",
  );

  const failedExecution: ExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionResult = {
    ...fixture.execution,
    accepted: false,
    reasonCode: "host_retry_control_work_item_closure_retry_ledger_entry_worker_execution_failed",
  };
  const failed =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: failedExecution,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(failed.accepted, false, "failed execution blocks receipt");
  assertEqual(failed.reasonCode, "accepted_retry_control_work_item_closure_retry_ledger_entry_worker_execution_required", "failed execution rejection is bounded");

  const contaminatedExecution = {
    ...fixture.execution,
    credentialValue: "phase221-secret-value",
    rawSourceUrl: "https://leak.invalid/artifact:phase221",
    retryWorkerCreated: true,
  };
  const contaminated =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: contaminatedExecution,
      mediaTransferHandler: capableWorkerHandler(),
    });
  assertEqual(contaminated.accepted, false, "contaminated execution blocks receipt");
  assertEqual(contaminated.retryWorkerCreated, false, "contaminated rejection creates no retry worker");
  assert(
    !JSON.stringify(contaminated).includes("phase221-secret-value") &&
      !JSON.stringify(contaminated).includes("leak.invalid"),
    "contaminated rejection leaks no generic raw URL/path/credential values",
  );
  assert(!containsPhase221ForbiddenTruth([copied, tampered, failed, contaminated]), "execution receipt rejections leak no raw truth");
}

async function verifyExecutionReceiptMutationIsBlocked(): Promise<void> {
  section("3. Trusted Execution Receipt Mutation Is Blocked");
  const fixture = await executionFixture("phase221_mutation");
  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerInvocationExecutionReceiptWorkItemClosureRetryLedgerEntryWorkerExecutionReceipt({
      retryLedgerEntryWorkerHandlerReadiness: fixture.handlerReadiness,
      retryLedgerEntryWorkerInvocationHandoff: fixture.handoff,
      retryLedgerEntryWorkerInvocationHandoffPreflight: fixture.invocationHandoffPreflight,
      retryLedgerEntryWorkerExecutionPlan: fixture.executionPlan,
      retryLedgerEntryWorkerExecutionPlanPreflight: fixture.executionPlanPreflight,
      retryLedgerEntryWorkerExecution: fixture.execution,
      mediaTransferHandler: capableWorkerHandler(),
    });

  try {
    (result as { retryWorkerCreated?: boolean }).retryWorkerCreated = true;
  } catch {
    // Frozen trusted receipts may throw under strict runtimes.
  }
  try {
    (result.retryLedgerEntryWorkerExecutionReceipt as { credentialValue?: string }).credentialValue =
      "phase221-secret-value";
  } catch {
    // Frozen nested receipt may throw under strict runtimes.
  }

  assertEqual(result.accepted, true, "trusted execution receipt is mutation-blocked");
  assertEqual(result.retryWorkerCreated, false, "trusted execution receipt cannot be top-level contaminated");
  assertEqual(
    (result.retryLedgerEntryWorkerExecutionReceipt as { credentialValue?: string }).credentialValue,
    undefined,
    "trusted execution receipt cannot be contaminated with credentials",
  );
  assertEqual(result.publicHostingEnabled, false, "mutation-blocked receipt enables no public hosting");
  assert(!containsPhase221ForbiddenTruth(result), "mutation-blocked receipt leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 221 Verification (Retry-Ledger Entry Worker Execution Receipt)\n");
  await verifyTrustedExecutionReceiptBindsSanitizedHostTruth();
  await verifyCopiedTamperedFailedAndContaminatedExecutionsReject();
  await verifyExecutionReceiptMutationIsBlocked();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 221: retry-ledger entry worker execution receipt is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
