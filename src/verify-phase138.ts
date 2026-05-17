/** Phase 138 Verification - External Media Transfer Manual Retry Operator Actions */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferHandlerResult,
} from "./channel";

const SOURCE_RETRY_ACTION = "Revalidate approved source refs and re-run the external media transfer before any vendor send; no vendor-state check is required for this source-resolution failure.";
const VENDOR_RETRY_ACTION = "Verify vendor-side send state before operator reinvoke, then revalidate source refs and re-run the approved external media transfer only if the vendor has not already accepted the send.";

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string): void {
  if (condition) { console.log(`  PASS ${label}`); passed++; } else { console.error(`  FAIL ${label}`); failed++; }
}
function assertEqual<T>(actual: T, expected: T, label: string): void {
  assert(actual === expected, `${label}${actual === expected ? "" : ` - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}
function section(title: string): void { console.log(`\n${"=".repeat(60)}\n  ${title}\n${"=".repeat(60)}`); }

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T138",
    targetKind: "channel",
    targetId: "C138",
    threadId: "171000.1380",
    enabled: true,
    fileRefs: [
      {
        sourceRef: "artifact:phase138_report",
        name: "phase-138-report.pdf",
        title: "Phase 138 report",
        mimeType: "application/pdf",
        sizeBytes: 4096,
        checksumSha256: "b".repeat(64),
      },
    ],
    ...overrides,
  };
}

async function approvedCandidate(
  overrides: Partial<ExternalChannelMediaTransferCandidate> = {},
): Promise<{ candidate: ExternalChannelMediaTransferCandidate; approval: ExternalChannelMediaTransferApproval }> {
  const candidate = safeCandidate(overrides);
  const signature = await createExternalChannelMediaTransferApprovalSignature(candidate);
  return {
    candidate,
    approval: {
      approvedBy: "operator",
      approvedAt: "2026-05-08T09:50:00.000Z",
      signature,
    },
  };
}

async function executeWithWorker(
  handler: ReturnType<typeof createExternalChannelMediaTransferWorkerHandler>,
): Promise<Awaited<ReturnType<typeof executeExternalChannelMediaTransferHostRequest>>> {
  const { candidate, approval } = await approvedCandidate();
  return executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: handler,
  });
}

function containsForbiddenDurableTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase138_report") ||
    text.includes("sourceRef\":\"artifact:") ||
    text.includes("manual_retry_action_request_context") ||
    text.includes("attemptNumber") ||
    text.includes("retryPolicy") ||
    text.includes("xoxb-phase138-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("raw-inline-byte-payload") ||
    text.includes("reuse cached file bytes") ||
    text.includes("C:\\secret\\phase138");
}

function assertManualRetryRevalidation(data: Record<string, unknown>, label: string): void {
  assertEqual(data.retryMode, "manual_operator_reinvoke", `${label}: retry remains manual operator reinvoke`);
  assertEqual(data.retryReason, "host_handler_rejected", `${label}: generic retry reason remains host handler rejection`);
  assertEqual(data.manualRetryRequiresFreshApprovalCheck, true, `${label}: fresh approval check is required before reinvoke`);
  assertEqual(data.manualRetryRequiresSourceRefRevalidation, true, `${label}: source refs must be revalidated before reinvoke`);
  assertEqual(data.manualRetryMustResolveSourcesFresh, true, `${label}: sources must be resolved fresh on reinvoke`);
  assertEqual(data.manualRetryMustNotReuseResolvedFiles, true, `${label}: stale resolved files must not be reused`);
  assertEqual(data.retryWorkerCreated, false, `${label}: no retry worker is created`);
  assertEqual(data.retryScheduleCreated, false, `${label}: no retry schedule is created`);
}

async function verifyRetryableSourceRejectionCarriesSourceAction(): Promise<void> {
  section("1. Retryable Source Rejection Carries Source Operator Action");
  let senderCalled = false;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 1,
    resolveSourceRef: async () => ({
      accepted: false,
      retryable: true,
      retryAfterSeconds: 17,
      reason: "temporary media store lock https://files.slack.com/private-download-url?token=xoxb-phase138-secret",
    }),
    sendToVendor: async (action) => {
      senderCalled = true;
      return { accepted: true, transferKey: action.transferKey, deliveredCount: 1 };
    },
  }));

  assertEqual(result.isError, true, "retryable source rejection remains a failed handoff");
  assertEqual(senderCalled, false, "retryable source rejection prevents vendor send");
  assertEqual(result.data.manualRetryStage, "source_resolution", "source retry stays source-resolution scoped");
  assertEqual(result.data.manualRetryReasonCode, "source_resolution_retryable_failure", "source retry keeps source-resolution reason code");
  assertEqual(result.data.manualRetryVerificationScope, "source_ref_revalidation_before_vendor_send", "source retry names source-ref revalidation scope");
  assertEqual(result.data.manualRetryNextOperatorAction, SOURCE_RETRY_ACTION, "source retry carries source-specific next operator action");
  assertEqual(result.data.manualRetryRequiresVendorStateCheck, false, "source retry does not require vendor-state check");
  assertEqual(result.data.retryAfterSeconds, 17, "source retry preserves bounded retry-after");
  assertManualRetryRevalidation(result.data, "source rejection");
  assert(!containsForbiddenDurableTruth(result), "source action leaks no request context, refs, credentials, URLs, bytes, or signatures");
}

async function verifyRetryableVendorRejectionCarriesVendorAction(): Promise<void> {
  section("2. Retryable Vendor Rejection Carries Vendor Operator Action");
  let senderCallCount = 0;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
    }),
    sendToVendor: async () => {
      senderCallCount++;
      return {
        accepted: false,
        retryable: true,
        retryAfterSeconds: 11,
        reason: "vendor rejected send at https://files.slack.com/private-download-url?token=xoxb-phase138-secret",
      };
    },
  }));

  assertEqual(result.isError, true, "retryable vendor rejection remains a failed handoff");
  assertEqual(senderCallCount, 1, "retryable vendor rejection is not automatically retried");
  assertEqual(result.data.manualRetryStage, "vendor_send", "vendor retry stays vendor-send scoped");
  assertEqual(result.data.manualRetryReasonCode, "vendor_send_retryable_failure", "vendor retry keeps vendor-send reason code");
  assertEqual(result.data.manualRetryVerificationScope, "vendor_state_then_source_ref_revalidation", "vendor retry names vendor-state then source-ref scope");
  assertEqual(result.data.manualRetryNextOperatorAction, VENDOR_RETRY_ACTION, "vendor retry carries vendor-specific next operator action");
  assertEqual(result.data.manualRetryRequiresVendorStateCheck, true, "vendor retry requires vendor-state check");
  assertEqual(result.data.retryAfterSeconds, 11, "vendor retry preserves bounded retry-after");
  assertManualRetryRevalidation(result.data, "vendor rejection");
  assert(!containsForbiddenDurableTruth(result), "vendor action leaks no request context, refs, credentials, URLs, bytes, or signatures");
}

async function verifyHostSuppliedOperatorActionIsRecomputedFromStage(): Promise<void> {
  section("3. Host-supplied Operator Action Is Recomputed From Stage");
  const { candidate, approval } = await approvedCandidate();
  const malicious = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (): Promise<ExternalChannelMediaTransferHandlerResult & { manualRetrySafety: Record<string, unknown> }> => ({
      accepted: false,
      retryable: true,
      retryAfterSeconds: 7,
      reason: "temporary host queue saturation",
      manualRetrySafety: {
        retryStage: "vendor_send",
        manualRetryNextOperatorAction: "reuse cached file bytes and skip vendor check",
        automaticVendorRetryAllowed: true,
        sourceRef: "artifact:phase138_report",
        reason: "C:\\secret\\phase138 raw-inline-byte-payload",
      },
    }),
  });

  assertEqual(malicious.isError, true, "malicious action host result remains failed");
  assertEqual(malicious.data.manualRetryStage, "vendor_send", "safe stage is preserved");
  assertEqual(malicious.data.manualRetryNextOperatorAction, VENDOR_RETRY_ACTION, "operator action is recomputed from sanitized stage");
  assertEqual(malicious.data.manualRetryReasonCode, "vendor_send_retryable_failure", "vendor reason code remains stage-derived");
  assertEqual(malicious.data.manualRetryVerificationScope, "vendor_state_then_source_ref_revalidation", "vendor stage forces vendor verification scope");
  assertEqual(malicious.data.automaticVendorRetryAllowed, false, "host cannot opt in automatic vendor retry through action metadata");
  assertEqual(malicious.data.automaticVendorRetryAllowedRedacted, true, "unsafe automatic retry claim is redacted with truth");
  assert(!containsForbiddenDurableTruth(malicious), "malicious action leaks no request context, refs, credentials, URLs, bytes, or signatures");
}

async function verifyGenericRetryableHostRejectionHasNoStageAction(): Promise<void> {
  section("4. Generic Retryable Host Rejection Has No Stage Operator Action");
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async () => ({
      accepted: false,
      retryable: true,
      retryAfterSeconds: 5,
      reason: "temporary host queue saturation",
    }),
  });

  assertEqual(result.isError, true, "generic retryable host result remains failed");
  assertEqual(result.data.nextOperatorAction, "Re-run the approved external media transfer after checking host-owned media stores, credentials, and vendor availability.", "generic retryable host result keeps generic next operator action");
  assertManualRetryRevalidation(result.data, "generic host rejection");
  assertEqual("manualRetryStage" in result.data, false, "generic host rejection has no stage-specific safety");
  assertEqual("manualRetryReasonCode" in result.data, false, "generic host rejection has no stage-specific reason code");
  assertEqual("manualRetryVerificationScope" in result.data, false, "generic host rejection has no stage-specific verification scope");
  assertEqual("manualRetryNextOperatorAction" in result.data, false, "generic host rejection has no stage-specific next operator action");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 138 Verification (External Media Transfer Manual Retry Operator Actions)\n");
  await verifyRetryableSourceRejectionCarriesSourceAction();
  await verifyRetryableVendorRejectionCarriesVendorAction();
  await verifyHostSuppliedOperatorActionIsRecomputedFromStage();
  await verifyGenericRetryableHostRejectionHasNoStageAction();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 138: external media transfer manual retry operator actions are GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
