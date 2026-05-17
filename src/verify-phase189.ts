/** Phase 189 Verification - External Media Transfer Manual Retry Control Worker Invocation Handoff */

import {
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff,
  createExternalChannelMediaTransferWorkerHandler,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff,
  type ExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoffPreflightResult,
} from "./channel";
import {
  containsForbiddenTruth,
  workerHandlerReadinessFixture,
} from "./verify-phase188";

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
  assert(actual === expected, `${label}${actual === expected ? "" : ` - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}
function section(title: string): void {
  console.log(`\n${"=".repeat(60)}\n  ${title}\n${"=".repeat(60)}`);
}

async function workerInvocationHandoffFixture(): Promise<{
  retryControlWorkerHandlerReadiness: ExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness;
  retryControlWorkerInvocationHandoff: ExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff;
  fixture: Awaited<ReturnType<typeof workerHandlerReadinessFixture>>;
}> {
  const fixture = await workerHandlerReadinessFixture({
    workspaceId: "T189FIXTURE",
    accountId: "A189FIXTURE",
    targetId: "C189FIXTURE",
    threadId: "171000.1890",
  });
  const { retryControlWorkerHandlerReadiness } = fixture;
  const result = await createExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff({
    ...fixture,
    retryControlWorkerHandlerReadiness,
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler(),
  });
  assert(Boolean(result.retryControlWorkerInvocationHandoff), "fixture retry-control worker invocation handoff is returned");
  return {
    retryControlWorkerHandlerReadiness,
    retryControlWorkerInvocationHandoff:
      result.retryControlWorkerInvocationHandoff as ExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff,
    fixture,
  };
}

async function verifyWorkerInvocationHandoffAcceptsHandlerReadinessPreflight(): Promise<void> {
  section("1. Manual Retry Control Worker Invocation Handoff Accepts Handler Readiness Preflight");
  const fixture = await workerHandlerReadinessFixture({
    workspaceId: "T189HANDOFF",
    accountId: "A189HANDOFF",
    targetId: "C189HANDOFF",
    threadId: "171000.1891",
  });
  const { retryControlWorkerHandlerReadiness } = fixture;

  let handlerCalled = false;
  const result = await createExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff({
    ...fixture,
    retryControlWorkerHandlerReadiness: JSON.parse(JSON.stringify(retryControlWorkerHandlerReadiness)) as ExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness,
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => {
        handlerCalled = true;
        return {
          sourceRefFingerprint: request.sourceRefFingerprint,
          name: "unused",
          mimeType: "text/plain",
          sizeBytes: 1,
        };
      },
      sendToVendor: async (action) => {
        handlerCalled = true;
        return { accepted: true, transferKey: action.transferKey, deliveredCount: 0 };
      },
    }),
  });

  assertEqual(result.accepted, true, "worker invocation handoff is accepted from current handler-readiness truth");
  assert(Boolean(result.retryControlWorkerInvocationHandoff), "worker invocation handoff descriptor is returned");
  assertEqual(result.retryControlWorkerHandlerReadinessPreflightAccepted, true, "worker invocation handoff recomputes accepted handler-readiness preflight");
  assertEqual(result.retryControlWorkerInvocationHandoff?.retryControlWorkerHandlerReadinessId, retryControlWorkerHandlerReadiness.retryControlWorkerHandlerReadinessId, "worker invocation handoff binds handler-readiness id");
  assertEqual(result.retryControlWorkerInvocationHandoff?.retryControlWorkerSelectionId, retryControlWorkerHandlerReadiness.retryControlWorkerSelectionId, "worker invocation handoff binds worker-selection id");
  assertEqual(result.retryControlWorkerInvocationHandoff?.transferKey, retryControlWorkerHandlerReadiness.transferKey, "worker invocation handoff binds transfer key");
  assertEqual(result.retryControlWorkerInvocationHandoff?.hostRetryWorkerInvocationHandoffAccepted, true, "worker invocation handoff records accepted handoff");
  assertEqual(result.retryControlWorkerInvocationHandoff?.hostExecutionRequired, true, "worker invocation handoff records host execution requirement");
  assertEqual(result.retryControlWorkerInvocationHandoff?.hostExecutionAttempted, false, "worker invocation handoff records no execution attempt");
  assertEqual(result.retryControlWorkerInvocationHandoff?.hostRetryWorkerHandlerCapabilityTruth, "foreground_worker_handler_resolves_sources_freshly_before_vendor_send", "worker invocation handoff preserves handler capability truth");
  assertEqual(result.hostRetryWorkerHandlerExecutable, false, "worker invocation handoff still does not mark handler executable");
  assertEqual(result.hostRetryWorkerHandlerExecuted, false, "worker invocation handoff does not execute handler");
  assertEqual(handlerCalled, false, "worker invocation handoff never calls supplied handler");
  assertEqual(result.retryWorkerCreated, false, "worker invocation handoff creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "worker invocation handoff creates no retry schedule");
  assertEqual(result.backgroundRetryCreated, false, "worker invocation handoff creates no background retry");
  assertEqual(result.automaticVendorRetryAllowed, false, "worker invocation handoff allows no automatic vendor retry");
  assertEqual(result.credentialPersistenceCreated, false, "worker invocation handoff persists no credentials");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "worker invocation handoff enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "worker invocation handoff enables no public hosting");
  assertEqual(
    result.manualRetryControlWorkerInvocationHandoffTruth,
    "handler_readiness_preflight_bound_invocation_handoff_no_handler_execution_worker_or_schedule",
    "worker invocation handoff truth is explicit",
  );
  assert(!containsForbiddenTruth(result), "accepted worker invocation handoff leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyWorkerInvocationHandoffPreflightAcceptsCurrentHandoff(): Promise<void> {
  section("2. Manual Retry Control Worker Invocation Handoff Preflight Accepts Current Handoff");
  const {
    fixture,
    retryControlWorkerHandlerReadiness,
    retryControlWorkerInvocationHandoff,
  } = await workerInvocationHandoffFixture();

  const preflight = await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff({
    ...fixture,
    retryControlWorkerHandlerReadiness,
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler(),
    retryControlWorkerInvocationHandoff: JSON.parse(JSON.stringify(retryControlWorkerInvocationHandoff)) as ExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff,
  }) as ExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoffPreflightResult;

  assertEqual(preflight.accepted, true, "current worker invocation handoff preflight is accepted");
  assert(Boolean(preflight.retryControlWorkerInvocationHandoff), "current invocation handoff preflight returns expected descriptor");
  assertEqual(preflight.retryControlWorkerInvocationHandoffIdMatched, true, "invocation handoff id matches recomputed truth");
  assertEqual(preflight.retryControlWorkerHandlerReadinessIdMatched, true, "invocation handoff binds handler-readiness id");
  assertEqual(preflight.retryControlWorkerSelectionIdMatched, true, "invocation handoff binds worker-selection id");
  assertEqual(preflight.transferKeyMatched, true, "invocation handoff preflight binds transfer key");
  assertEqual(preflight.hostRetryWorkerInvocationHandoffAccepted, true, "invocation handoff preflight accepts handoff truth");
  assertEqual(preflight.hostExecutionRequired, true, "invocation handoff preflight preserves host execution requirement");
  assertEqual(preflight.hostExecutionAttempted, false, "invocation handoff preflight executes no handler");
  assertEqual(preflight.hostRetryWorkerHandlerExecuted, false, "invocation handoff preflight records no handler execution");
  assertEqual(preflight.retryWorkerCreated, false, "invocation handoff preflight creates no retry worker");
  assertEqual(preflight.retryScheduleCreated, false, "invocation handoff preflight creates no retry schedule");
  assertEqual(preflight.automaticVendorRetryAllowed, false, "invocation handoff preflight allows no automatic retry");
  assertEqual(preflight.manualRetryControlWorkerInvocationHandoffPreflightTruth, "recomputed_from_handler_readiness_preflight_bound_invocation_handoff_no_handler_execution_worker_or_schedule", "invocation handoff preflight truth is explicit");
  assert(!containsForbiddenTruth(preflight), "accepted worker invocation handoff preflight leaks no raw truth");
}

async function verifyWorkerInvocationHandoffPreflightRejectsTamperingAndClaims(): Promise<void> {
  section("3. Manual Retry Control Worker Invocation Handoff Preflight Rejects Tampering And Claims");
  const {
    fixture,
    retryControlWorkerHandlerReadiness,
    retryControlWorkerInvocationHandoff,
  } = await workerInvocationHandoffFixture();

  const tampered = {
    ...retryControlWorkerInvocationHandoff,
    channelId: "discord",
    hostExecutionAttempted: true,
    hostRetryWorkerHandlerExecuted: true,
    retryWorkerCreated: true,
    retryScheduleCreated: true,
    automaticVendorRetryAllowed: true,
    credentialValue: "xoxb-real-credential-value",
  };
  const preflight = await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff({
    ...fixture,
    retryControlWorkerHandlerReadiness,
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler(),
    retryControlWorkerInvocationHandoff: tampered,
  });

  assertEqual(preflight.accepted, false, "tampered worker invocation handoff is rejected");
  assertEqual(preflight.reasonCode, "valid_external_media_transfer_manual_retry_control_worker_invocation_handoff_required", "tampered worker invocation handoff rejection is bounded");
  assertEqual(preflight.retryControlWorkerInvocationHandoff, undefined, "tampered invocation handoff returns no descriptor");
  assertEqual(preflight.hostRetryWorkerInvocationHandoffAccepted, false, "tampered preflight does not accept invocation handoff");
  assertEqual(preflight.hostExecutionAttempted, false, "tampered preflight records no execution attempt");
  assertEqual(preflight.hostRetryWorkerHandlerExecuted, false, "tampered preflight records no handler execution");
  assertEqual(preflight.retryWorkerCreated, false, "tampered preflight creates no retry worker");
  assertEqual(preflight.retryScheduleCreated, false, "tampered preflight creates no retry schedule");
  assertEqual(preflight.automaticVendorRetryAllowed, false, "tampered preflight allows no automatic retry");
  assertEqual(preflight.credentialPersistenceCreated, false, "tampered preflight persists no credentials");
  assert(!containsForbiddenTruth(preflight), "tampered worker invocation handoff rejection leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 189 Verification (External Media Transfer Manual Retry Control Worker Invocation Handoff)\n");
  await verifyWorkerInvocationHandoffAcceptsHandlerReadinessPreflight();
  await verifyWorkerInvocationHandoffPreflightAcceptsCurrentHandoff();
  await verifyWorkerInvocationHandoffPreflightRejectsTamperingAndClaims();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 189: external media transfer manual retry control worker invocation handoff is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
