/** Phase 136 Verification - External Media Transfer Manual Retry Verification Scope */

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

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T136",
    targetKind: "channel",
    targetId: "C136",
    threadId: "171000.1360",
    enabled: true,
    fileRefs: [
      {
        sourceRef: "artifact:phase136_report",
        name: "phase-136-report.pdf",
        title: "Phase 136 report",
        mimeType: "application/pdf",
        sizeBytes: 4096,
        checksumSha256: "f".repeat(64),
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
      approvedAt: "2026-05-08T09:21:00.000Z",
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
  return text.includes("artifact:phase136_report") ||
    text.includes("sourceRef\":\"artifact:") ||
    text.includes("manual_retry_scope_request_context") ||
    text.includes("attemptNumber") ||
    text.includes("retryPolicy") ||
    text.includes("xoxb-phase136-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("raw-inline-byte-payload") ||
    text.includes("C:\\secret\\phase136");
}

function assertManualRetryRevalidation(data: Record<string, unknown>, label: string): void {
  assertEqual(data.retryMode, "manual_operator_reinvoke", `${label}: retry remains manual operator reinvoke`);
  assertEqual(data.manualRetryRequiresFreshApprovalCheck, true, `${label}: fresh approval check is required before reinvoke`);
  assertEqual(data.manualRetryRequiresSourceRefRevalidation, true, `${label}: source refs must be revalidated before reinvoke`);
  assertEqual(data.manualRetryMustResolveSourcesFresh, true, `${label}: sources must be resolved fresh on reinvoke`);
  assertEqual(data.manualRetryMustNotReuseResolvedFiles, true, `${label}: stale resolved files must not be reused`);
  assertEqual(data.manualRetryApprovalBoundary, "fresh_operator_reinvoke_required", `${label}: approval boundary is explicit`);
  assertEqual(data.manualRetryHandoffTruth, "manual_reinvoke_only_no_automatic_retry_or_stale_resolved_files", `${label}: handoff truth forbids automatic or stale reuse`);
  assertEqual(data.retryWorkerCreated, false, `${label}: no retry worker is created`);
  assertEqual(data.retryScheduleCreated, false, `${label}: no retry schedule is created`);
}

async function verifyRetryableSourceRejectionCarriesSourceVerificationScope(): Promise<void> {
  section("1. Retryable Source Rejection Carries Source Verification Scope");
  let senderCalled = false;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 1,
    resolveSourceRef: async () => ({
      accepted: false,
      retryable: true,
      retryAfterSeconds: 17,
      reason: "temporary media store lock https://files.slack.com/private-download-url?token=xoxb-phase136-secret",
    }),
    sendToVendor: async (action) => {
      senderCalled = true;
      return { accepted: true, transferKey: action.transferKey, deliveredCount: 1 };
    },
  }));

  assertEqual(result.isError, true, "retryable source rejection remains a failed handoff");
  assertEqual(senderCalled, false, "retryable source rejection prevents vendor send");
  assertEqual(result.data.manualRetryStage, "source_resolution", "source retry stays source-resolution scoped");
  assertEqual(result.data.manualRetryVerificationScope, "source_ref_revalidation_before_vendor_send", "source retry names source-ref revalidation scope");
  assertEqual(result.data.manualRetryRequiresVendorStateCheck, false, "source retry does not require vendor-state check");
  assertEqual(result.data.operatorMustVerifyVendorStateBeforeRetry, false, "source retry preserves older vendor-state check field as false");
  assertEqual(result.data.retryAfterSeconds, 17, "source retry preserves bounded retry-after");
  assertManualRetryRevalidation(result.data, "source rejection");
  assert(!containsForbiddenDurableTruth(result), "source verification scope leaks no request context, refs, credentials, URLs, bytes, or signatures");
}

async function verifyRetryableVendorRejectionCarriesVendorVerificationScope(): Promise<void> {
  section("2. Retryable Vendor Rejection Carries Vendor Verification Scope");
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
        reason: "vendor rejected send at https://files.slack.com/private-download-url?token=xoxb-phase136-secret",
      };
    },
  }));

  assertEqual(result.isError, true, "retryable vendor rejection remains a failed handoff");
  assertEqual(senderCallCount, 1, "retryable vendor rejection is not automatically retried");
  assertEqual(result.data.manualRetryStage, "vendor_send", "vendor retry stays vendor-send scoped");
  assertEqual(result.data.manualRetryVerificationScope, "vendor_state_then_source_ref_revalidation", "vendor retry names vendor-state then source-ref scope");
  assertEqual(result.data.manualRetryRequiresVendorStateCheck, true, "vendor retry requires vendor-state check");
  assertEqual(result.data.operatorMustVerifyVendorStateBeforeRetry, true, "vendor retry preserves older vendor-state check field as true");
  assertEqual(result.data.retryAfterSeconds, 11, "vendor retry preserves bounded retry-after");
  assertManualRetryRevalidation(result.data, "vendor rejection");
  assert(!containsForbiddenDurableTruth(result), "vendor verification scope leaks no request context, refs, credentials, URLs, bytes, or signatures");
}

async function verifyHostSuppliedRetryScopeIsSanitized(): Promise<void> {
  section("3. Host-supplied Retry Scope Is Sanitized");
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
        manualRetryVerificationScope: "source_ref_revalidation_before_vendor_send",
        manualRetryRequiresVendorStateCheck: false,
        automaticVendorRetryAllowed: true,
        sourceRef: "artifact:phase136_report",
        reason: "C:\\secret\\phase136 raw-inline-byte-payload",
      },
    }),
  });

  assertEqual(malicious.isError, true, "malicious retry-scope host result remains failed");
  assertEqual(malicious.data.manualRetryStage, "vendor_send", "safe stage is preserved");
  assertEqual(malicious.data.manualRetryVerificationScope, "vendor_state_then_source_ref_revalidation", "vendor stage forces vendor verification scope");
  assertEqual(malicious.data.manualRetryRequiresVendorStateCheck, true, "vendor stage forces vendor-state check");
  assertEqual(malicious.data.automaticVendorRetryAllowed, false, "host cannot opt in automatic vendor retry through scope metadata");
  assertEqual(malicious.data.automaticVendorRetryAllowedRedacted, true, "unsafe automatic retry claim is redacted with truth");
  assert(!containsForbiddenDurableTruth(malicious), "malicious retry scope leaks no request context, refs, credentials, URLs, bytes, or signatures");
}

async function verifyUnknownSafetyKeepsGenericRevalidationOnly(): Promise<void> {
  section("4. Unknown Safety Keeps Generic Revalidation Only");
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
  assertManualRetryRevalidation(result.data, "generic host rejection");
  assertEqual("manualRetryStage" in result.data, false, "generic host rejection has no stage-specific safety");
  assertEqual("manualRetryVerificationScope" in result.data, false, "generic host rejection has no stage-specific verification scope");
  assertEqual("manualRetryRequiresVendorStateCheck" in result.data, false, "generic host rejection has no stage-specific vendor-state requirement");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 136 Verification (External Media Transfer Manual Retry Verification Scope)\n");
  await verifyRetryableSourceRejectionCarriesSourceVerificationScope();
  await verifyRetryableVendorRejectionCarriesVendorVerificationScope();
  await verifyHostSuppliedRetryScopeIsSanitized();
  await verifyUnknownSafetyKeepsGenericRevalidationOnly();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 136: external media transfer manual retry verification scope is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
