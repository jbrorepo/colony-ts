/** Phase 134 Verification - External Media Transfer Manual Retry Safety Context */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferHandlerResult,
} from "./channel";

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string): void {
  if (condition) { console.log(`  PASS ${label}`); passed++; } else { console.error(`  FAIL ${label}`); failed++; }
}
function assertEqual<T>(actual: T, expected: T, label: string): void {
  assert(actual === expected, `${label}${actual === expected ? "" : ` - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}
function section(title: string): void { console.log(`\n${"=".repeat(60)}\n  ${title}\n${"=".repeat(60)}`); }
function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T134",
    targetKind: "channel",
    targetId: "C134",
    threadId: "171000.1340",
    enabled: true,
    fileRefs: [
      {
        sourceRef: "artifact:phase134_report",
        name: "phase-134-report.pdf",
        title: "Phase 134 report",
        mimeType: "application/pdf",
        sizeBytes: 4096,
        checksumSha256: "d".repeat(64),
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
      approvedAt: "2026-05-08T08:54:00.000Z",
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
  return text.includes("artifact:phase134_report") ||
    text.includes("sourceRef\":\"artifact:") ||
    text.includes("manual_retry_safety_request_context") ||
    text.includes("single_foreground_attempt_manual_reinvoke_after_vendor_state_check") ||
    text.includes("attemptNumber") ||
    text.includes("retryPolicy") ||
    text.includes("xoxb-phase134-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("raw-inline-byte-payload") ||
    text.includes("C:\\secret\\phase134");
}

async function verifyVendorTimeoutRequiresStateCheckBeforeManualRetry(): Promise<void> {
  section("1. Vendor Timeout Requires Vendor State Check Before Manual Retry");
  let senderCallCount = 0;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    vendorSendTimeoutMs: 5,
    vendorSendTimeoutRetryAfterSeconds: 23,
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
    }),
    sendToVendor: async () => {
      senderCallCount++;
      await delay(35);
      return { accepted: true, transferKey: "late-transfer-key", deliveredCount: 1 };
    },
  }));

  assertEqual(result.isError, true, "timed-out vendor send remains a failed handoff");
  assertEqual(senderCallCount, 1, "timed-out vendor send is not automatically retried");
  assertEqual(result.data.retryMode, "manual_operator_reinvoke", "vendor timeout still uses manual operator reinvoke");
  assertEqual(result.data.manualRetryStage, "vendor_send", "retry safety marks the ambiguous vendor-send stage");
  assertEqual(result.data.sourceResolveCompletedBeforeRetry, true, "retry safety records that source resolution completed");
  assertEqual(result.data.vendorSendAttemptedBeforeRetry, true, "retry safety records that a vendor send may have happened");
  assertEqual(result.data.operatorMustVerifyVendorStateBeforeRetry, true, "retry safety requires vendor-state verification before reinvoke");
  assertEqual(result.data.automaticVendorRetryAllowed, false, "retry safety forbids automatic vendor retry");
  assertEqual(result.data.retrySafetyMetadataTruth, "host_reported_retry_safety_context", "retry safety truth is host-reported metadata");
  assertEqual(result.data.retryWorkerCreated, false, "vendor timeout still creates no retry worker");
  assertEqual(result.data.retryScheduleCreated, false, "vendor timeout still creates no retry schedule");
  assert(!containsForbiddenDurableTruth(result), "vendor timeout safety leaks no request context, refs, credentials, URLs, bytes, or signatures");
}

async function verifySourceTimeoutMarksNoVendorSendBeforeManualRetry(): Promise<void> {
  section("2. Source Timeout Marks No Vendor Send Before Manual Retry");
  let senderCalled = false;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveTimeoutMs: 5,
    sourceResolveTimeoutRetryAfterSeconds: 19,
    resolveSourceRef: async () => {
      await delay(35);
      return { sourceRefFingerprint: "d".repeat(64), sizeBytes: 1 };
    },
    sendToVendor: async (action) => {
      senderCalled = true;
      return { accepted: true, transferKey: action.transferKey, deliveredCount: 1 };
    },
  }));

  assertEqual(result.isError, true, "source timeout remains a failed handoff");
  assertEqual(senderCalled, false, "source timeout prevents vendor send");
  assertEqual(result.data.retryMode, "manual_operator_reinvoke", "source timeout still uses manual operator reinvoke");
  assertEqual(result.data.manualRetryStage, "source_resolution", "retry safety marks source-resolution stage");
  assertEqual(result.data.sourceResolveCompletedBeforeRetry, false, "retry safety records that source resolution did not complete");
  assertEqual(result.data.vendorSendAttemptedBeforeRetry, false, "retry safety records no vendor send was attempted");
  assertEqual(result.data.operatorMustVerifyVendorStateBeforeRetry, false, "source retry safety does not require vendor-state verification");
  assertEqual(result.data.automaticVendorRetryAllowed, false, "source retry safety still forbids automatic vendor retry");
  assert(!containsForbiddenDurableTruth(result), "source timeout safety leaks no request context, refs, credentials, URLs, bytes, or signatures");
}

async function verifyRetryableVendorRejectionCarriesVendorSafetyContext(): Promise<void> {
  section("3. Retryable Vendor Rejection Carries Vendor Safety Context");
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
        reason: "vendor rejected send at https://files.slack.com/private-download-url?token=xoxb-phase134-secret",
      };
    },
  }));

  assertEqual(result.isError, true, "retryable vendor rejection remains a failed handoff");
  assertEqual(senderCallCount, 1, "retryable vendor rejection is not automatically retried");
  assertEqual(result.data.retryAfterSeconds, 11, "retry-after from sender rejection is preserved");
  assertEqual(result.data.manualRetryStage, "vendor_send", "retry safety marks retryable vendor rejection as vendor-send stage");
  assertEqual(result.data.sourceResolveCompletedBeforeRetry, true, "vendor rejection safety records completed source resolution");
  assertEqual(result.data.vendorSendAttemptedBeforeRetry, true, "vendor rejection safety records a vendor attempt");
  assertEqual(result.data.operatorMustVerifyVendorStateBeforeRetry, true, "vendor rejection safety requires vendor-state verification before reinvoke");
  assert(!containsForbiddenDurableTruth(result), "vendor rejection safety leaks no request context, refs, credentials, URLs, bytes, or signatures");
}

async function verifyHostSuppliedRetrySafetyIsAllowlistedAndFailClosed(): Promise<void> {
  section("4. Host-supplied Retry Safety Is Allowlisted And Fail-closed");
  const { candidate, approval } = await approvedCandidate();
  const malicious = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (): Promise<ExternalChannelMediaTransferHandlerResult & { manualRetrySafety: Record<string, unknown> }> => ({
      accepted: false,
      retryable: true,
      retryAfterSeconds: 7,
      reason: "manual_retry_safety_request_context attemptNumber retryPolicy https://files.slack.com/private-download-url?token=xoxb-phase134-secret",
      manualRetrySafety: {
        retryStage: "vendor_send",
        sourceResolveCompleted: false,
        vendorSendAttempted: false,
        operatorMustVerifyVendorState: false,
        automaticVendorRetryAllowed: true,
        metadataTruth: "manual_retry_safety_request_context",
        sourceRef: "artifact:phase134_report",
        reason: "C:\\secret\\phase134 raw-inline-byte-payload",
      },
    }),
  });

  assertEqual(malicious.isError, true, "malicious retry-safety host result remains failed");
  assertEqual(malicious.data.manualRetryStage, "vendor_send", "safe stage is preserved");
  assertEqual(malicious.data.sourceResolveCompletedBeforeRetry, true, "vendor stage forces completed source-resolution truth");
  assertEqual(malicious.data.vendorSendAttemptedBeforeRetry, true, "vendor stage forces vendor-attempt truth");
  assertEqual(malicious.data.operatorMustVerifyVendorStateBeforeRetry, true, "vendor stage forces operator vendor-state verification");
  assertEqual(malicious.data.automaticVendorRetryAllowed, false, "host cannot opt in automatic vendor retry through metadata");
  assertEqual(malicious.data.automaticVendorRetryAllowedRedacted, true, "unsafe automatic retry claim is redacted with truth");
  assert(!containsForbiddenDurableTruth(malicious), "malicious retry safety leaks no request context, refs, credentials, URLs, bytes, or signatures");

  const unsafeStage = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (): Promise<ExternalChannelMediaTransferHandlerResult & { manualRetrySafety: Record<string, unknown> }> => ({
      accepted: false,
      retryable: true,
      manualRetrySafety: {
        retryStage: "default_live_delivery",
        sourceResolveCompleted: true,
        vendorSendAttempted: true,
      },
    }),
  });

  assertEqual(unsafeStage.isError, true, "unsafe-stage retry-safety host result remains failed");
  assertEqual("manualRetryStage" in unsafeStage.data, false, "unsafe retry-safety stage is dropped");
  assertEqual("vendorSendAttemptedBeforeRetry" in unsafeStage.data, false, "unsafe retry-safety booleans are dropped with stage");

  const nonRetryable = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (): Promise<ExternalChannelMediaTransferHandlerResult & { manualRetrySafety: Record<string, unknown> }> => ({
      accepted: false,
      retryable: false,
      manualRetrySafety: {
        retryStage: "vendor_send",
        sourceResolveCompleted: true,
        vendorSendAttempted: true,
        operatorMustVerifyVendorState: true,
      },
    }),
  });

  assertEqual(nonRetryable.isError, true, "non-retryable host safety result remains failed");
  assertEqual(nonRetryable.data.retryable, false, "non-retryable host rejection stays non-retryable");
  assertEqual("retryMode" in nonRetryable.data, false, "non-retryable host rejection has no manual retry UX");
  assertEqual("manualRetryStage" in nonRetryable.data, false, "non-retryable host rejection drops manual retry safety stage");
  assertEqual("vendorSendAttemptedBeforeRetry" in nonRetryable.data, false, "non-retryable host rejection drops before-retry safety fields");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 134 Verification (External Media Transfer Manual Retry Safety Context)\n");
  await verifyVendorTimeoutRequiresStateCheckBeforeManualRetry();
  await verifySourceTimeoutMarksNoVendorSendBeforeManualRetry();
  await verifyRetryableVendorRejectionCarriesVendorSafetyContext();
  await verifyHostSuppliedRetrySafetyIsAllowlistedAndFailClosed();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 134: external media transfer manual retry safety context is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
