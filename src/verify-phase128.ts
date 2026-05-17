/** Phase 128 Verification - External Media Transfer Source Resolve Foreground Retry */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
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
    workspaceId: "T128",
    targetKind: "channel",
    targetId: "C128",
    threadId: "171000.1280",
    enabled: true,
    fileRefs: [
      {
        sourceRef: "artifact:phase128_report",
        name: "phase-128-report.pdf",
        title: "Phase 128 report",
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
      approvedAt: "2026-05-08T07:20:00.000Z",
      signature,
    },
  };
}

function containsForbiddenDurableTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase128_report") ||
    text.includes("channel-media-transfer:") ||
    text.includes("xoxb-phase128-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("raw-inline-byte-payload") ||
    text.includes("C:\\secret\\phase128");
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

async function verifyRetryableSourceFailureCanRecoverBeforeVendorSend(): Promise<void> {
  section("1. Retryable Source Failure Can Recover Before Vendor Send");
  let resolverAttempts = 0;
  let senderCalls = 0;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 2,
    resolveSourceRef: async (request) => {
      resolverAttempts++;
      if (resolverAttempts === 1) {
        return {
          accepted: false,
          retryable: true,
          retryAfterSeconds: 999999,
          reason: "temporary host store miss at https://files.slack.com/private-download-url?token=xoxb-phase128-secret",
        };
      }
      return {
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
        checksumSha256: request.checksumSha256,
      };
    },
    sendToVendor: async (action, resolvedFiles) => {
      senderCalls++;
      return {
        accepted: true,
        transferKey: action.transferKey,
        deliveredCount: resolvedFiles.length,
        vendorMessageId: "slack-phase128-recovered",
      };
    },
  }));

  assertEqual(result.isError, false, "second source-resolution attempt can recover before vendor send");
  assertEqual(resolverAttempts, 2, "retryable source failure is retried exactly once");
  assertEqual(senderCalls, 1, "vendor sender runs once after source resolution recovers");
  assertEqual(result.data.vendorMessageId, "slack-phase128-recovered", "existing success gate still copies safe vendor id");
  assertEqual(result.data.retryable, false, "recovered transfer reports no retryable failure");
  assertEqual("retryWorkerCreated" in result.data, false, "recovered transfer creates no retry worker metadata");
  assertEqual("retryScheduleCreated" in result.data, false, "recovered transfer creates no retry schedule metadata");
  assert(!containsForbiddenDurableTruth(result), "recovered retry path leaks no source refs, credentials, URLs, bytes, or signatures");
}

async function verifyTimedOutSourceResolutionRetriesWithFreshAbortSignal(): Promise<void> {
  section("2. Timed-out Source Resolution Retries with Fresh Abort Signal");
  let resolverAttempts = 0;
  let senderCalls = 0;
  let firstSignalAborted = false;
  let secondSignalSeen = false;
  let firstSignal: AbortSignal | undefined;
  let secondSignal: AbortSignal | undefined;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 2,
    sourceResolveTimeoutMs: 5,
    resolveSourceRef: async (request) => {
      resolverAttempts++;
      if (resolverAttempts === 1) {
        firstSignal = request.abortSignal;
        request.abortSignal?.addEventListener("abort", () => {
          firstSignalAborted = true;
        }, { once: true });
        await delay(35);
        return {
          sourceRefFingerprint: request.sourceRefFingerprint,
          sizeBytes: request.sizeBytes,
        };
      }
      secondSignal = request.abortSignal;
      secondSignalSeen = Boolean(request.abortSignal);
      return {
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
      };
    },
    sendToVendor: async (action, resolvedFiles) => {
      senderCalls++;
      return { accepted: true, transferKey: action.transferKey, deliveredCount: resolvedFiles.length };
    },
  }));

  assertEqual(result.isError, false, "source timeout can recover on bounded foreground retry");
  assertEqual(resolverAttempts, 2, "timed-out source resolution is retried once");
  assertEqual(senderCalls, 1, "vendor sender runs only after retry recovers source resolution");
  assertEqual(firstSignalAborted, true, "first timeout aborts its resolver signal");
  assertEqual(secondSignalSeen, true, "second attempt receives a resolver signal");
  assert(firstSignal !== undefined && secondSignal !== undefined && firstSignal !== secondSignal, "retry uses a fresh abort signal per attempt");
  assertEqual(secondSignal?.aborted, false, "successful retry signal is not aborted");
  assert(!containsForbiddenDurableTruth(result), "timeout-retry recovery leaks no source refs, credentials, URLs, bytes, or signatures");
}

async function verifyRetryExhaustionKeepsManualOnlyFailure(): Promise<void> {
  section("3. Retry Exhaustion Keeps Manual-only Failure");
  let resolverAttempts = 0;
  let senderCalls = 0;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 2,
    resolveSourceRef: async () => {
      resolverAttempts++;
      return {
        accepted: false,
        retryable: true,
        retryAfterSeconds: 999999,
        reason: "host source store rate limited at https://files.slack.com/private-download-url?token=xoxb-phase128-secret",
      };
    },
    sendToVendor: async (action) => {
      senderCalls++;
      return { accepted: true, transferKey: action.transferKey };
    },
  }));

  assertEqual(result.isError, true, "exhausted source retry rejects the transfer");
  assertEqual(result.data.reasonCode, "handler_rejected", "exhaustion stays inside existing host handler boundary");
  assertEqual(result.data.retryable, true, "exhaustion remains retryable for manual operator reinvoke");
  assertEqual(result.data.retryMode, "manual_operator_reinvoke", "exhaustion uses manual retry mode");
  assertEqual(result.data.retryAfterSeconds, 3600, "retry-after remains clamped by existing retry UX");
  assertEqual(result.data.retryWorkerCreated, false, "exhaustion creates no retry worker");
  assertEqual(result.data.retryScheduleCreated, false, "exhaustion creates no retry schedule");
  assertEqual(resolverAttempts, 2, "retryable source failure is capped at two foreground attempts");
  assertEqual(senderCalls, 0, "vendor sender never runs when source retry exhausts");
  assert(!containsForbiddenDurableTruth(result), "exhausted retry path leaks no source refs, credentials, URLs, bytes, or signatures");
}

async function verifyNonRetryableAndValidationFailuresDoNotRetry(): Promise<void> {
  section("4. Non-retryable and Validation Failures Do Not Retry");
  let nonRetryableAttempts = 0;
  const nonRetryable = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 2,
    resolveSourceRef: async () => {
      nonRetryableAttempts++;
      return {
        accepted: false,
        retryable: false,
        reason: "host rejected unsafe source state",
      };
    },
    sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey }),
  }));
  let validationAttempts = 0;
  const validationFailure = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 2,
    resolveSourceRef: async (request) => {
      validationAttempts++;
      return {
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: 1,
        downloadUrl: "https://files.slack.com/private-download-url?token=xoxb-phase128-secret",
        contentBytes: "raw-inline-byte-payload",
      } as never;
    },
    sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey }),
  }));

  assertEqual(nonRetryable.isError, true, "non-retryable source rejection fails");
  assertEqual(nonRetryableAttempts, 1, "non-retryable source rejection is not retried");
  assertEqual(nonRetryable.data.retryable, false, "non-retryable source rejection has no manual retry metadata");
  assertEqual(validationFailure.isError, true, "resolver validation failure fails");
  assertEqual(validationAttempts, 1, "resolver validation failure is not retried");
  assertEqual(validationFailure.data.retryable, false, "validation failure has no retry metadata");
  assert(!containsForbiddenDurableTruth([nonRetryable, validationFailure]), "non-retry and validation paths leak no source refs, credentials, URLs, bytes, or signatures");
}

async function verifyRetryDoesNotCoverOtherFailureClasses(): Promise<void> {
  section("5. Resolver Exceptions, Checksum Failures, and Vendor Failures Do Not Retry Source Resolution");
  let thrownAttempts = 0;
  let thrownSenderCalls = 0;
  const thrownResolver = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 2,
    resolveSourceRef: async () => {
      thrownAttempts++;
      throw new Error("host source exception from https://files.slack.com/private-download-url?token=xoxb-phase128-secret");
    },
    sendToVendor: async (action) => {
      thrownSenderCalls++;
      return { accepted: true, transferKey: action.transferKey };
    },
  }));
  let checksumAttempts = 0;
  let checksumSenderCalls = 0;
  const checksumMismatch = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 2,
    resolveSourceRef: async (request) => {
      checksumAttempts++;
      return {
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
        checksumSha256: "c".repeat(64),
      };
    },
    sendToVendor: async (action) => {
      checksumSenderCalls++;
      return { accepted: true, transferKey: action.transferKey };
    },
  }));
  let vendorFailureSourceAttempts = 0;
  let vendorFailureSenderCalls = 0;
  const vendorFailure = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 2,
    resolveSourceRef: async (request) => {
      vendorFailureSourceAttempts++;
      return {
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
        checksumSha256: request.checksumSha256,
      };
    },
    sendToVendor: async () => {
      vendorFailureSenderCalls++;
      return {
        accepted: false,
        retryable: true,
        reason: "vendor upload rate limited at https://files.slack.com/private-download-url?token=xoxb-phase128-secret",
      };
    },
  }));
  let vendorTimeoutSourceAttempts = 0;
  let vendorTimeoutSenderCalls = 0;
  const vendorTimeout = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 2,
    vendorSendTimeoutMs: 5,
    resolveSourceRef: async (request) => {
      vendorTimeoutSourceAttempts++;
      return {
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
        checksumSha256: request.checksumSha256,
      };
    },
    sendToVendor: async () => {
      vendorTimeoutSenderCalls++;
      await delay(30);
      return { accepted: true, transferKey: "late-vendor-success" };
    },
  }));

  assertEqual(thrownResolver.isError, true, "thrown resolver exception fails");
  assertEqual(thrownAttempts, 1, "thrown resolver exception is not retried");
  assertEqual(thrownSenderCalls, 0, "sender is not called after thrown resolver exception");
  assertEqual(checksumMismatch.isError, true, "checksum mismatch fails");
  assertEqual(checksumAttempts, 1, "checksum mismatch is not retried");
  assertEqual(checksumSenderCalls, 0, "sender is not called after checksum mismatch");
  assertEqual(vendorFailure.isError, true, "vendor failure fails");
  assertEqual(vendorFailureSourceAttempts, 1, "vendor failure does not retry source resolution");
  assertEqual(vendorFailureSenderCalls, 1, "vendor failure does not retry vendor send in Phase 128");
  assertEqual(vendorTimeout.isError, true, "vendor timeout fails");
  assertEqual(vendorTimeoutSourceAttempts, 1, "vendor timeout does not retry source resolution");
  assertEqual(vendorTimeoutSenderCalls, 1, "vendor timeout does not retry vendor send in Phase 128");
  assert(!containsForbiddenDurableTruth([thrownResolver, checksumMismatch, vendorFailure, vendorTimeout]), "other failure classes leak no source refs, credentials, URLs, bytes, or signatures");
}

async function verifyInvalidRetryOptionPreservesExistingBehavior(): Promise<void> {
  section("6. Invalid Retry Option Preserves Existing Behavior");
  let resolverAttempts = 0;
  let senderCalls = 0;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 0,
    resolveSourceRef: async () => {
      resolverAttempts++;
      return {
        accepted: false,
        retryable: true,
        reason: "retryable but retry option disabled",
      };
    },
    sendToVendor: async (action) => {
      senderCalls++;
      return { accepted: true, transferKey: action.transferKey };
    },
  }));

  assertEqual(result.isError, true, "non-positive retry option keeps previous single-attempt behavior");
  assertEqual(resolverAttempts, 1, "invalid retry option does not add a second attempt");
  assertEqual(senderCalls, 0, "sender does not run after single-attempt source failure");
  assertEqual(result.data.retryMode, "manual_operator_reinvoke", "existing manual retry UX still applies");
  assert(!containsForbiddenDurableTruth(result), "disabled retry path leaks no source refs, credentials, URLs, bytes, or signatures");
}

async function verifyAttemptLimitIsTotalAndClamped(): Promise<void> {
  section("7. Attempt Limit Is Total and Clamped");
  let oneAttemptCount = 0;
  const oneAttempt = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 1,
    resolveSourceRef: async () => {
      oneAttemptCount++;
      return {
        accepted: false,
        retryable: true,
        reason: "retryable but total attempt limit is one",
      };
    },
    sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey }),
  }));
  let clampedAttempts = 0;
  const clamped = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 99,
    resolveSourceRef: async () => {
      clampedAttempts++;
      return {
        accepted: false,
        retryable: true,
        reason: "retryable but foreground attempt limit is capped",
      };
    },
    sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey }),
  }));

  assertEqual(oneAttempt.isError, true, "attempt limit of one still rejects retryable source failure");
  assertEqual(oneAttemptCount, 1, "sourceResolveMaxAttempts counts the first attempt");
  assertEqual(clamped.isError, true, "oversized attempt limit still rejects after capped attempts");
  assertEqual(clampedAttempts, 2, "oversized attempt limit is capped to two foreground attempts");
  assertEqual(clamped.data.retryWorkerCreated, false, "clamped exhaustion creates no retry worker");
  assertEqual(clamped.data.retryScheduleCreated, false, "clamped exhaustion creates no retry schedule");
  assert(!containsForbiddenDurableTruth([oneAttempt, clamped]), "attempt-limit paths leak no source refs, credentials, URLs, bytes, or signatures");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 128 Verification (External Media Transfer Source Resolve Foreground Retry)\n");
  await verifyRetryableSourceFailureCanRecoverBeforeVendorSend();
  await verifyTimedOutSourceResolutionRetriesWithFreshAbortSignal();
  await verifyRetryExhaustionKeepsManualOnlyFailure();
  await verifyNonRetryableAndValidationFailuresDoNotRetry();
  await verifyRetryDoesNotCoverOtherFailureClasses();
  await verifyInvalidRetryOptionPreservesExistingBehavior();
  await verifyAttemptLimitIsTotalAndClamped();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 128: external media transfer source resolve foreground retry is GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });
