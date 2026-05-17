/** Phase 190 Verification - External Media Transfer Manual Retry Control Worker Invocation Execution */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff,
  preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness,
  type ExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff,
} from "./channel";
import {
  containsForbiddenTruth,
  vendorWorkerInvocationHandoffFixture,
  workerHandlerReadinessFixture,
} from "./verify-phase188";

const FRESH_APPROVAL_REQUIRED_AFTER = "2026-05-09T01:19:00.000Z";
const VENDOR_FRESH_APPROVAL_REQUIRED_AFTER = "2026-05-08T16:14:59.000Z";

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

function fileRefs(prefix = "phase190_media", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-190-media-${index}.pdf`,
    title: `Phase 190 media ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 4096 + index,
    checksumSha256: `${(index + 1).toString(16)}`.repeat(64),
  }));
}

async function approvedCandidate(
  overrides: Partial<ExternalChannelMediaTransferCandidate> = {},
): Promise<{ candidate: ExternalChannelMediaTransferCandidate; approval: ExternalChannelMediaTransferApproval }> {
  const candidate: ExternalChannelMediaTransferCandidate = {
    channelId: "slack",
    workspaceId: "T190EXEC",
    accountId: "A190EXEC",
    targetKind: "channel",
    targetId: "C190EXEC",
    threadId: "171000.1900",
    enabled: true,
    fileRefs: fileRefs(),
    ...overrides,
  };
  return {
    candidate,
    approval: {
      approvedBy: "operator",
      approvedAt: "2026-05-09T01:20:00.000Z",
      signature: await createExternalChannelMediaTransferApprovalSignature(candidate),
    },
  };
}

async function invocationExecutionFixture(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): Promise<{
  candidate: ExternalChannelMediaTransferCandidate;
  approval: ExternalChannelMediaTransferApproval;
  retryControlWorkerHandlerReadiness: ExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness;
  retryControlWorkerInvocationHandoff: ExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff;
  fixture: Awaited<ReturnType<typeof workerHandlerReadinessFixture>>;
}> {
  const { candidate, approval } = await approvedCandidate(overrides);
  const fixture = await workerHandlerReadinessFixture({
    workspaceId: candidate.workspaceId,
    accountId: candidate.accountId,
    targetId: candidate.targetId,
    threadId: candidate.threadId,
    fileRefs: candidate.fileRefs,
  });
  const { retryControlWorkerHandlerReadiness } = fixture;
  const handoffResult = await createExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff({
    ...fixture,
    retryControlWorkerHandlerReadiness,
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler(),
  });
  assert(Boolean(handoffResult.retryControlWorkerInvocationHandoff), "fixture retry-control worker invocation handoff is returned");
  return {
    candidate,
    approval,
    retryControlWorkerHandlerReadiness,
    retryControlWorkerInvocationHandoff:
      handoffResult.retryControlWorkerInvocationHandoff as ExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff,
    fixture,
  };
}

async function verifyInvocationHandoffExecutesTrustedForegroundHandler(): Promise<void> {
  section("1. Invocation Handoff Executes Trusted Foreground Handler");
  const {
    candidate,
    approval,
    fixture,
    retryControlWorkerHandlerReadiness,
    retryControlWorkerInvocationHandoff,
  } = await invocationExecutionFixture({ fileRefs: fileRefs("phase190_exec") });

  let sourceResolveCount = 0;
  let vendorSendCount = 0;
  const result = await executeExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff({
    ...fixture,
    candidate,
    approval,
    freshApprovalRequiredAfter: FRESH_APPROVAL_REQUIRED_AFTER,
    retryControlWorkerHandlerReadiness,
    retryControlWorkerInvocationHandoff,
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => {
        sourceResolveCount++;
        return {
          sourceRefFingerprint: request.sourceRefFingerprint,
          name: request.name,
          mimeType: request.mimeType,
          sizeBytes: request.sizeBytes,
          checksumSha256: request.checksumSha256,
        };
      },
      sendToVendor: async (action, resolvedFiles) => {
        vendorSendCount++;
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
    }),
  });

  assertEqual(result.accepted, true, "trusted invocation execution is accepted");
  assertEqual(result.retryControlWorkerInvocationHandoffPreflightAccepted, true, "execution recomputes accepted invocation handoff preflight");
  assertEqual(result.hostExecutionAttempted, true, "execution records a host execution attempt");
  assertEqual(result.hostRetryWorkerHandlerExecutable, true, "execution marks trusted foreground handler executable for this explicit call");
  assertEqual(result.hostRetryWorkerHandlerExecuted, true, "execution records trusted handler execution");
  assertEqual(result.vendorStateVerified, false, "source-stage execution does not require vendor state verification");
  assertEqual(sourceResolveCount, candidate.fileRefs.length, "trusted worker resolves each approved source ref exactly once");
  assertEqual(vendorSendCount, 1, "trusted worker sends to vendor once");
  assertEqual(result.hostResult?.data.transferKey, retryControlWorkerInvocationHandoff.transferKey, "host result binds invocation transfer key");
  assertEqual(result.hostResult?.data.transferKeyEchoMatched, true, "host result preserves transfer-key echo truth");
  assertEqual(result.backgroundRetryCreated, false, "execution creates no background retry");
  assertEqual(result.retryWorkerCreated, false, "execution creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "execution creates no retry schedule");
  assertEqual(result.automaticVendorRetryAllowed, false, "execution allows no automatic vendor retry");
  assertEqual(result.credentialPersistenceCreated, false, "execution persists no credentials");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "execution enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "execution enables no public hosting");
  assertEqual(
    result.manualRetryControlWorkerInvocationExecutionTruth,
    "invocation_handoff_preflight_required_before_opt_in_host_foreground_execution",
    "execution truth is explicit",
  );
  assert(!containsForbiddenTruth(result), "accepted invocation execution leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyInvocationHandoffRejectsMissingOrUnbrandedHandler(): Promise<void> {
  section("2. Invocation Handoff Rejects Missing Or Unbranded Handler");
  const {
    candidate,
    approval,
    fixture,
    retryControlWorkerHandlerReadiness,
    retryControlWorkerInvocationHandoff,
  } = await invocationExecutionFixture({ fileRefs: fileRefs("phase190_unbranded") });

  const missing = await executeExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff({
    ...fixture,
    candidate,
    approval,
    freshApprovalRequiredAfter: FRESH_APPROVAL_REQUIRED_AFTER,
    retryControlWorkerHandlerReadiness,
    retryControlWorkerInvocationHandoff,
    mediaTransferHandler: null,
  });
  assertEqual(missing.accepted, false, "missing handler is rejected");
  assertEqual(missing.reasonCode, "manual_retry_control_worker_invocation_handler_required", "missing handler rejection is bounded");
  assertEqual(missing.hostExecutionAttempted, false, "missing handler rejects before execution");
  assertEqual(missing.hostRetryWorkerHandlerExecuted, false, "missing handler executes nothing");

  let unbrandedCalled = false;
  const unbranded = await executeExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff({
    ...fixture,
    candidate,
    approval,
    freshApprovalRequiredAfter: FRESH_APPROVAL_REQUIRED_AFTER,
    retryControlWorkerHandlerReadiness,
    retryControlWorkerInvocationHandoff,
    mediaTransferHandler: async (action) => {
      unbrandedCalled = true;
      return { accepted: true, transferKey: action.transferKey, deliveredCount: 1 };
    },
  });
  assertEqual(unbranded.accepted, false, "unbranded handler is rejected");
  assertEqual(unbranded.reasonCode, "manual_retry_control_worker_invocation_handler_must_be_trusted_foreground_worker", "unbranded handler rejection is bounded");
  assertEqual(unbranded.hostExecutionAttempted, false, "unbranded handler rejects before execution");
  assertEqual(unbrandedCalled, false, "unbranded handler is never called");
  assert(!containsForbiddenTruth(unbranded), "unbranded handler rejection leaks no raw truth");
}

async function verifyInvocationHandoffRejectsTamperedPreflightBeforeExecution(): Promise<void> {
  section("3. Invocation Handoff Rejects Tampered Preflight Before Execution");
  const {
    candidate,
    approval,
    fixture,
    retryControlWorkerHandlerReadiness,
    retryControlWorkerInvocationHandoff,
  } = await invocationExecutionFixture({ fileRefs: fileRefs("phase190_tamper") });

  let handlerCalled = false;
  const result = await executeExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff({
    ...fixture,
    candidate,
    approval,
    freshApprovalRequiredAfter: FRESH_APPROVAL_REQUIRED_AFTER,
    retryControlWorkerHandlerReadiness,
    retryControlWorkerInvocationHandoff: {
      ...retryControlWorkerInvocationHandoff,
      hostExecutionAttempted: true,
      retryWorkerCreated: true,
      credentialValue: "xoxb-real-credential-value",
    },
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => {
        handlerCalled = true;
        return { sourceRefFingerprint: request.sourceRefFingerprint };
      },
      sendToVendor: async (action) => {
        handlerCalled = true;
        return { accepted: true, transferKey: action.transferKey, deliveredCount: 1 };
      },
    }),
  });

  assertEqual(result.accepted, false, "tampered invocation handoff execution is rejected");
  assertEqual(result.reasonCode, "valid_external_media_transfer_manual_retry_control_worker_invocation_handoff_required", "tampered execution rejection is bounded");
  assertEqual(result.hostExecutionAttempted, false, "tampered handoff rejects before execution");
  assertEqual(result.hostRetryWorkerHandlerExecuted, false, "tampered handoff does not execute handler");
  assertEqual(handlerCalled, false, "tampered handoff never calls handler");
  assertEqual(result.retryWorkerCreated, false, "tampered execution creates no retry worker");
  assertEqual(result.credentialPersistenceCreated, false, "tampered execution persists no credentials");
  assert(!containsForbiddenTruth(result), "tampered execution rejection leaks no raw truth");
}

async function verifyVendorStageRequiresStateVerification(): Promise<void> {
  section("5. Vendor-Stage Invocation Requires Vendor State Verification");
  const fixture = await vendorWorkerInvocationHandoffFixture();
  const { retryControlWorkerInvocationHandoff } = fixture;

  assertEqual(retryControlWorkerInvocationHandoff.retryStage, "vendor_send", "fixture is a vendor-stage retry handoff");
  let handlerCalled = false;
  const missingVerification = await executeExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff({
    ...fixture,
    freshApprovalRequiredAfter: VENDOR_FRESH_APPROVAL_REQUIRED_AFTER,
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => {
        handlerCalled = true;
        return { sourceRefFingerprint: request.sourceRefFingerprint };
      },
      sendToVendor: async (action) => {
        handlerCalled = true;
        return { accepted: true, transferKey: action.transferKey, deliveredCount: 1 };
      },
    }),
  });
  assertEqual(missingVerification.accepted, false, "vendor-stage execution without state verification is rejected");
  assertEqual(missingVerification.reasonCode, "vendor_state_verification_required_before_manual_retry_control_worker_invocation", "vendor-state rejection is bounded");
  assertEqual(missingVerification.vendorStateVerified, false, "missing verification is not accepted");
  assertEqual(missingVerification.hostExecutionAttempted, false, "vendor-state rejection happens before execution");
  assertEqual(handlerCalled, false, "vendor-stage missing verification never calls handler");

  const verified = await executeExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff({
    ...fixture,
    freshApprovalRequiredAfter: VENDOR_FRESH_APPROVAL_REQUIRED_AFTER,
    vendorStateVerification: {
      handoffId: retryControlWorkerInvocationHandoff.retryControlWorkerInvocationHandoffId,
      transferKey: retryControlWorkerInvocationHandoff.transferKey,
      verifiedAt: "2026-05-09T01:20:30.000Z",
      verifiedBy: "operator",
      vendorStateVerificationTruth: "host_verified_vendor_state_before_manual_reinvoke_no_automatic_vendor_retry",
    },
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
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
      }),
    }),
  });
  assertEqual(verified.accepted, true, "vendor-stage execution accepts matching vendor-state verification");
  assertEqual(verified.vendorStateVerified, true, "matching vendor-state verification is recorded");
  assertEqual(verified.hostExecutionAttempted, true, "verified vendor-stage retry executes");
  assertEqual(verified.automaticVendorRetryAllowed, false, "verified vendor-stage retry still allows no automatic vendor retry");
  assert(!containsForbiddenTruth(verified), "verified vendor-stage execution leaks no raw truth");
}

async function verifyExecutionRejectsStaleCandidateTransferKey(): Promise<void> {
  section("6. Invocation Execution Rejects Stale Candidate Transfer Key");
  const {
    candidate,
    approval,
    fixture,
    retryControlWorkerHandlerReadiness,
    retryControlWorkerInvocationHandoff,
  } = await invocationExecutionFixture({ fileRefs: fileRefs("phase190_current") });
  const stale = await approvedCandidate({
    workspaceId: candidate.workspaceId,
    accountId: candidate.accountId,
    targetId: "C190STALE",
    threadId: candidate.threadId,
    fileRefs: candidate.fileRefs,
  });
  const preflight = await preflightExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff({
    ...fixture,
    retryControlWorkerHandlerReadiness,
    retryControlWorkerInvocationHandoff,
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler(),
  });
  assertEqual(preflight.accepted, true, "fixture invocation handoff preflight is accepted before stale execution check");

  let handlerCalled = false;
  const result = await executeExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff({
    ...fixture,
    candidate: stale.candidate,
    approval: stale.approval,
    freshApprovalRequiredAfter: FRESH_APPROVAL_REQUIRED_AFTER,
    retryControlWorkerHandlerReadiness,
    retryControlWorkerInvocationHandoff,
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => {
        handlerCalled = true;
        return { sourceRefFingerprint: request.sourceRefFingerprint };
      },
      sendToVendor: async (action) => {
        handlerCalled = true;
        return { accepted: true, transferKey: action.transferKey, deliveredCount: 1 };
      },
    }),
  });

  assertEqual(result.accepted, false, "stale candidate execution is rejected");
  assertEqual(result.reasonCode, "manual_retry_control_worker_invocation_candidate_transfer_key_mismatch", "stale candidate rejection is bounded");
  assertEqual(result.hostExecutionAttempted, false, "stale candidate rejects before handler execution");
  assertEqual(handlerCalled, false, "stale candidate does not call handler");
  assert(!containsForbiddenTruth(result), "stale candidate rejection leaks no raw truth");
}

async function verifyInvocationExecutionRejectsStaleApprovalBeforeExecution(): Promise<void> {
  section("4. Invocation Execution Rejects Stale Approval Before Execution");
  const {
    candidate,
    fixture,
    retryControlWorkerHandlerReadiness,
    retryControlWorkerInvocationHandoff,
  } = await invocationExecutionFixture({ fileRefs: fileRefs("phase190_stale_approval") });
  const staleApproval: ExternalChannelMediaTransferApproval = {
    approvedBy: "operator",
    approvedAt: "2000-01-01T00:00:00.000Z",
    signature: await createExternalChannelMediaTransferApprovalSignature(candidate),
  };

  let handlerCalled = false;
  const result = await executeExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff({
    ...fixture,
    candidate,
    approval: staleApproval,
    freshApprovalRequiredAfter: FRESH_APPROVAL_REQUIRED_AFTER,
    retryControlWorkerHandlerReadiness,
    retryControlWorkerInvocationHandoff,
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => {
        handlerCalled = true;
        return { sourceRefFingerprint: request.sourceRefFingerprint };
      },
      sendToVendor: async (action) => {
        handlerCalled = true;
        return { accepted: true, transferKey: action.transferKey, deliveredCount: 1 };
      },
    }),
  });

  assertEqual(result.accepted, false, "stale approval execution is rejected");
  assertEqual(result.reasonCode, "fresh_approval_required_before_manual_retry_control_worker_invocation", "stale approval rejection is bounded");
  assertEqual(result.hostExecutionAttempted, false, "stale approval rejects before handler execution");
  assertEqual(handlerCalled, false, "stale approval does not call handler");
  assert(!containsForbiddenTruth(result), "stale approval rejection leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 190 Verification (External Media Transfer Manual Retry Control Worker Invocation Execution)\n");
  await verifyInvocationHandoffExecutesTrustedForegroundHandler();
  await verifyInvocationHandoffRejectsMissingOrUnbrandedHandler();
  await verifyInvocationHandoffRejectsTamperedPreflightBeforeExecution();
  await verifyInvocationExecutionRejectsStaleApprovalBeforeExecution();
  await verifyVendorStageRequiresStateVerification();
  await verifyExecutionRejectsStaleCandidateTransferKey();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 190: external media transfer manual retry control worker invocation execution is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
