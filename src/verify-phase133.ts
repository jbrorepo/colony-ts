/** Phase 133 Verification - External Media Transfer Vendor Send Request Context */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferVendorSendRequest,
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
    workspaceId: "T133",
    targetKind: "channel",
    targetId: "C133",
    threadId: "171000.1330",
    enabled: true,
    fileRefs: [
      {
        sourceRef: "artifact:phase133_report",
        name: "phase-133-report.pdf",
        title: "Phase 133 report",
        mimeType: "application/pdf",
        sizeBytes: 4096,
        checksumSha256: "c".repeat(64),
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
      approvedAt: "2026-05-08T08:37:00.000Z",
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
  return text.includes("artifact:phase133_report") ||
    text.includes("sourceRef\":\"artifact:") ||
    text.includes("request_only_vendor_send_context") ||
    text.includes("single_foreground_attempt_manual_reinvoke_after_vendor_state_check") ||
    text.includes("attemptNumber") ||
    text.includes("retryPolicy") ||
    text.includes("xoxb-phase133-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("raw-inline-byte-payload") ||
    text.includes("C:\\secret\\phase133");
}

function assertVendorSendRequestContext(
  request: ExternalChannelMediaTransferVendorSendRequest | undefined,
  expected: { abortSignal: boolean; foregroundTimeoutEnabled: boolean },
): void {
  assert(Boolean(request), "vendor sender receives request-only context");
  assertEqual(request?.attemptNumber, 1, "vendor send context records one-based attempt number");
  assertEqual(request?.maxAttemptCount, 1, "vendor send context records one-attempt cap");
  assertEqual(request?.retryAttemptCount, 0, "vendor send context records zero retry attempts");
  assertEqual(request?.isRetryAttempt, false, "vendor send context is not marked as retry");
  assertEqual(request?.retryPolicy, "single_foreground_attempt_manual_reinvoke_after_vendor_state_check", "vendor send context records no automatic retry after dispatch");
  assertEqual(request?.foregroundTimeoutEnabled, expected.foregroundTimeoutEnabled, "vendor send context records timeout enablement truth");
  assertEqual(Boolean(request?.abortSignal), expected.abortSignal, "vendor send context abort signal presence matches timeout configuration");
}

async function verifyUnboundedVendorSendReceivesRequestOnlyNoRetryContext(): Promise<void> {
  section("1. Unbounded Vendor Send Receives Request-only No-retry Context");
  let senderRequest: ExternalChannelMediaTransferVendorSendRequest | undefined;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
      checksumSha256: request.checksumSha256,
    }),
    sendToVendor: async (action, resolvedFiles, request) => {
      senderRequest = request;
      return {
        accepted: true,
        transferKey: action.transferKey,
        deliveredCount: resolvedFiles.length,
        vendorMessageId: "slack-phase133-ok",
      };
    },
  }));

  assertEqual(result.isError, false, "unbounded vendor send still succeeds");
  assertEqual(senderRequest?.channelId, "slack", "vendor send context carries channel id");
  assertEqual(senderRequest?.transferKey, String(result.data.transferKey ?? senderRequest?.transferKey), "vendor send context carries active transfer key");
  assertEqual(senderRequest?.fileCount, 1, "vendor send context carries bounded resolved-file count");
  assertVendorSendRequestContext(senderRequest, { abortSignal: false, foregroundTimeoutEnabled: false });
  assertEqual("attemptNumber" in result.data, false, "request-only attempt context is not persisted in result data");
  assertEqual("retryPolicy" in result.data, false, "request-only retry policy is not persisted in result data");
  assert(!containsForbiddenDurableTruth(result), "unbounded vendor send result leaks no request context, refs, credentials, URLs, bytes, or signatures");
}

async function verifyTimeoutVendorSendPreservesAbortContextAndNoRetryTruth(): Promise<void> {
  section("2. Timeout Vendor Send Preserves Abort Context and No-retry Truth");
  let senderRequest: ExternalChannelMediaTransferVendorSendRequest | undefined;
  let senderCallCount = 0;
  let signalAborted = false;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    vendorSendTimeoutMs: 5,
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
    }),
    sendToVendor: async (_action, _resolvedFiles, request) => {
      senderCallCount++;
      senderRequest = request;
      request?.abortSignal?.addEventListener("abort", () => {
        signalAborted = true;
      }, { once: true });
      await delay(35);
      return { accepted: true, transferKey: senderRequest?.transferKey ?? "", deliveredCount: 1 };
    },
  }));

  assertEqual(result.isError, true, "timed-out vendor send remains rejected through manual retry boundary");
  assertEqual(senderCallCount, 1, "timed-out vendor send is not automatically retried");
  assertVendorSendRequestContext(senderRequest, { abortSignal: true, foregroundTimeoutEnabled: true });
  assertEqual(signalAborted, true, "timeout aborts the request signal for cooperative sender cleanup");
  assertEqual(result.data.retryMode, "manual_operator_reinvoke", "timeout remains manual operator reinvoke");
  assertEqual(result.data.retryWorkerCreated, false, "timeout creates no retry worker");
  assertEqual(result.data.retryScheduleCreated, false, "timeout creates no retry schedule");
  assert(!containsForbiddenDurableTruth(result), "timeout result leaks no request context, refs, credentials, URLs, bytes, or signatures");
}

async function verifyRejectedVendorSendIsSingleAttemptManualOnly(): Promise<void> {
  section("3. Rejected Vendor Send Is Single-attempt Manual-only");
  let senderCallCount = 0;
  let senderRequest: ExternalChannelMediaTransferVendorSendRequest | undefined;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
    }),
    sendToVendor: async (_action, _resolvedFiles, request) => {
      senderCallCount++;
      senderRequest = request;
      return {
        accepted: false,
        retryable: true,
        retryAfterSeconds: 17,
        reason: "phase133 raw vendor failure https://files.slack.com/private-download-url?token=xoxb-phase133-secret",
      };
    },
  }));

  assertEqual(result.isError, true, "retryable sender rejection stays rejected");
  assertEqual(senderCallCount, 1, "retryable sender rejection is not retried after vendor dispatch");
  assertVendorSendRequestContext(senderRequest, { abortSignal: false, foregroundTimeoutEnabled: false });
  assertEqual(result.data.retryable, true, "retryable sender rejection still exposes manual retry UX");
  assertEqual(result.data.retryAfterSeconds, 17, "safe retry-after from sender rejection is preserved");
  assertEqual(result.data.retryWorkerCreated, false, "sender rejection creates no retry worker");
  assertEqual(result.data.retryScheduleCreated, false, "sender rejection creates no retry schedule");
  assert(!containsForbiddenDurableTruth(result), "sender rejection leaks no request context, refs, credentials, URLs, bytes, or signatures");
}

async function verifySenderCannotEchoRequestOnlyContextIntoDurableResult(): Promise<void> {
  section("4. Sender Cannot Echo Request-only Context Into Durable Result");
  const accepted = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
    }),
    sendToVendor: async (action, resolvedFiles, request) => ({
      accepted: true,
      transferKey: action.transferKey,
      deliveredCount: resolvedFiles.length,
      vendorMessageId: request?.retryPolicy,
      receipt: {
        receiptId: request?.retryPolicy,
        status: "sent",
      },
    }),
  }));

  assertEqual(accepted.isError, false, "malicious accepted sender echo still completes through success path");
  assertEqual(accepted.data.vendorMessageId, "[REDACTED_VENDOR_MESSAGE_ID]", "request-only retry policy echoed as vendor id is redacted");
  assertEqual(accepted.data.vendorMessageIdRedacted, true, "vendor id redaction truth is recorded");
  assertEqual(accepted.data.hostReceiptId, "[REDACTED_RECEIPT_ID]", "request-only retry policy echoed as receipt id is redacted");
  assertEqual(accepted.data.hostReceiptIdRedacted, true, "receipt id redaction truth is recorded");
  assert(!containsForbiddenDurableTruth(accepted), "accepted sender echo leaks no request-only context into durable data or output");

  const rejected = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
    }),
    sendToVendor: async (_action, _resolvedFiles, request) => ({
      accepted: false,
      retryable: true,
      reason: `phase133 host echoed ${request?.retryPolicy} ${request?.attemptNumber} attemptNumber https://files.slack.com/private-download-url?token=xoxb-phase133-secret`,
    }),
  }));

  assertEqual(rejected.isError, true, "malicious rejected sender echo still rejects");
  assertEqual(rejected.data.retryMode, "manual_operator_reinvoke", "malicious rejection keeps manual retry UX");
  assert(!containsForbiddenDurableTruth(rejected), "rejected sender echo leaks no request-only context into durable data or output");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 133 Verification (External Media Transfer Vendor Send Request Context)\n");
  await verifyUnboundedVendorSendReceivesRequestOnlyNoRetryContext();
  await verifyTimeoutVendorSendPreservesAbortContextAndNoRetryTruth();
  await verifyRejectedVendorSendIsSingleAttemptManualOnly();
  await verifySenderCannotEchoRequestOnlyContextIntoDurableResult();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 133: external media transfer vendor-send request context is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
