/** Phase 129 Verification - External Media Transfer Foreground Retry Metadata */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferHostAction,
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
    workspaceId: "T129",
    targetKind: "channel",
    targetId: "C129",
    threadId: "171000.1290",
    enabled: true,
    fileRefs: [
      {
        sourceRef: "artifact:phase129_report",
        name: "phase-129-report.pdf",
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
      approvedAt: "2026-05-08T07:35:00.000Z",
      signature,
    },
  };
}

function containsForbiddenDurableTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase129_report") ||
    text.includes("channel-media-transfer:") ||
    text.includes("xoxb-phase129-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("raw-inline-byte-payload") ||
    text.includes("C:\\secret\\phase129");
}

function foregroundRetry(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function executeWithWorker(
  handler: ReturnType<typeof createExternalChannelMediaTransferWorkerHandler>,
  candidateOverrides: Partial<ExternalChannelMediaTransferCandidate> = {},
): Promise<Awaited<ReturnType<typeof executeExternalChannelMediaTransferHostRequest>>> {
  const { candidate, approval } = await approvedCandidate(candidateOverrides);
  return executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: handler,
  });
}

async function executeWithCustomHandler(
  handler: (action: ExternalChannelMediaTransferHostAction) => Promise<Record<string, unknown>>,
): Promise<Awaited<ReturnType<typeof executeExternalChannelMediaTransferHostRequest>>> {
  const { candidate, approval } = await approvedCandidate();
  return executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: handler as never,
  });
}

async function verifyRecoveredSourceRetryMetadataOnSuccess(): Promise<void> {
  section("1. Recovered Source Retry Emits Bounded Foreground Metadata");
  let resolverAttempts = 0;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 2,
    resolveSourceRef: async (request) => {
      resolverAttempts++;
      if (resolverAttempts === 1) {
        return {
          accepted: false,
          retryable: true,
          retryAfterSeconds: 999999,
          reason: "temporary host source miss at https://files.slack.com/private-download-url?token=xoxb-phase129-secret",
        };
      }
      return {
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
        checksumSha256: request.checksumSha256,
      };
    },
    sendToVendor: async (action, resolvedFiles) => ({
      accepted: true,
      transferKey: action.transferKey,
      deliveredCount: resolvedFiles.length,
      vendorMessageId: "slack-phase129-recovered",
    }),
  }));
  const retry = foregroundRetry(result.data.foregroundRetry);

  assertEqual(result.isError, false, "source retry recovery still succeeds");
  assertEqual(resolverAttempts, 2, "source resolver was retried once");
  assertEqual(retry.automaticRetryMode, "bounded_foreground_retry", "metadata identifies bounded foreground retry mode");
  assertEqual(retry.retryStage, "source_resolution", "metadata scopes retry to source resolution");
  assertEqual(retry.retryStatus, "recovered", "metadata records recovery");
  assertEqual(retry.retryAttemptCount, 1, "metadata counts retry attempts, not total attempts");
  assertEqual(retry.maxAttemptCount, 2, "metadata reports bounded total attempt cap");
  assertEqual(retry.fileCount, 1, "metadata reports bounded file count");
  assertEqual(retry.retryWorkerCreated, false, "metadata reports no retry worker");
  assertEqual(retry.retryScheduleCreated, false, "metadata reports no retry schedule");
  assertEqual(retry.metadataTruth, "host_reported_retry_metadata", "metadata is truth-scoped as host reported");
  assert(!containsForbiddenDurableTruth(result), "recovered retry metadata leaks no source refs, credentials, URLs, bytes, or signatures");
}

async function verifyExhaustedSourceRetryMetadataOnFailure(): Promise<void> {
  section("2. Exhausted Source Retry Keeps Manual UX and Emits Foreground Metadata");
  let resolverAttempts = 0;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 2,
    resolveSourceRef: async () => {
      resolverAttempts++;
      return {
        accepted: false,
        retryable: true,
        retryAfterSeconds: 999999,
        reason: "host source still unavailable at https://files.slack.com/private-download-url?token=xoxb-phase129-secret",
      };
    },
    sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey }),
  }));
  const retry = foregroundRetry(result.data.foregroundRetry);

  assertEqual(result.isError, true, "exhausted source retry rejects transfer");
  assertEqual(result.data.retryMode, "manual_operator_reinvoke", "manual operator retry UX remains present");
  assertEqual(result.data.retryAfterSeconds, 3600, "manual retry-after remains clamped");
  assertEqual(result.data.retryWorkerCreated, false, "failure creates no retry worker");
  assertEqual(result.data.retryScheduleCreated, false, "failure creates no retry schedule");
  assertEqual(resolverAttempts, 2, "source retry exhaustion is capped at two total attempts");
  assertEqual(retry.automaticRetryMode, "bounded_foreground_retry", "failure metadata identifies foreground retry mode");
  assertEqual(retry.retryStage, "source_resolution", "failure metadata stays source-scoped");
  assertEqual(retry.retryStatus, "exhausted", "failure metadata records exhaustion");
  assertEqual(retry.retryAttemptCount, 1, "failure metadata counts one foreground retry attempt");
  assertEqual(retry.maxAttemptCount, 2, "failure metadata reports total attempt cap");
  assertEqual(retry.retryWorkerCreated, false, "foreground metadata creates no retry worker");
  assertEqual(retry.retryScheduleCreated, false, "foreground metadata creates no retry schedule");
  assert(!containsForbiddenDurableTruth(result), "exhausted retry metadata leaks no source refs, credentials, URLs, bytes, or signatures");
}

async function verifyNoRetryCreatesNoForegroundMetadata(): Promise<void> {
  section("3. Single-attempt Success Creates No Foreground Retry Metadata");
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 2,
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
      checksumSha256: request.checksumSha256,
    }),
    sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey }),
  }));

  assertEqual(result.isError, false, "single-attempt source resolution succeeds");
  assertEqual("foregroundRetry" in result.data, false, "no retry metadata is emitted when no foreground retry occurred");
  assert(!containsForbiddenDurableTruth(result), "single-attempt path leaks no source refs, credentials, URLs, bytes, or signatures");
}

async function verifyVendorFailureAfterRecoveredSourceRetryKeepsRetryBoundary(): Promise<void> {
  section("4. Vendor Failure After Source Retry Does Not Become Vendor Retry");
  let resolverAttempts = 0;
  let senderCalls = 0;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 2,
    resolveSourceRef: async (request) => {
      resolverAttempts++;
      if (resolverAttempts === 1) {
        return { accepted: false, retryable: true, reason: "temporary source failure" };
      }
      return {
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
        checksumSha256: request.checksumSha256,
      };
    },
    sendToVendor: async () => {
      senderCalls++;
      return {
        accepted: false,
        retryable: true,
        retryAfterSeconds: 10,
        reason: "vendor rejected at https://files.slack.com/private-download-url?token=xoxb-phase129-secret",
      };
    },
  }));
  const retry = foregroundRetry(result.data.foregroundRetry);

  assertEqual(result.isError, true, "vendor rejection remains a failed transfer");
  assertEqual(resolverAttempts, 2, "source retry recovered before vendor failure");
  assertEqual(senderCalls, 1, "vendor sender is not retried by this slice");
  assertEqual(result.data.retryMode, "manual_operator_reinvoke", "vendor retry remains manual operator reinvoke");
  assertEqual(retry.retryStatus, "recovered", "foreground metadata records only the source retry recovery");
  assertEqual(retry.retryStage, "source_resolution", "foreground metadata does not claim vendor retry");
  assertEqual(retry.retryWorkerCreated, false, "foreground metadata creates no retry worker");
  assertEqual(retry.retryScheduleCreated, false, "foreground metadata creates no retry schedule");
  assert(!containsForbiddenDurableTruth(result), "vendor-failure retry metadata leaks no source refs, credentials, URLs, bytes, or signatures");
}

async function verifyMultiFileRetryMetadataCountsAggregateRetries(): Promise<void> {
  section("5. Multi-file Source Retry Metadata Counts Aggregate Retry Attempts");
  const attemptsByFingerprint = new Map<string, number>();
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 2,
    resolveSourceRef: async (request) => {
      const attempt = (attemptsByFingerprint.get(request.sourceRefFingerprint) ?? 0) + 1;
      attemptsByFingerprint.set(request.sourceRefFingerprint, attempt);
      if (attempt === 1) {
        return { accepted: false, retryable: true, reason: "temporary host source miss" };
      }
      return {
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
        checksumSha256: request.checksumSha256,
      };
    },
    sendToVendor: async (action, resolvedFiles) => ({
      accepted: true,
      transferKey: action.transferKey,
      deliveredCount: resolvedFiles.length,
    }),
  }), {
    fileRefs: [
      {
        sourceRef: "artifact:phase129_report",
        name: "phase-129-report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4096,
        checksumSha256: "d".repeat(64),
      },
      {
        sourceRef: "artifact:phase129_appendix",
        name: "phase-129-appendix.txt",
        mimeType: "text/plain",
        sizeBytes: 1024,
        checksumSha256: "e".repeat(64),
      },
    ],
  });
  const retry = foregroundRetry(result.data.foregroundRetry);

  assertEqual(result.isError, false, "multi-file source retry recovery still succeeds");
  assertEqual(attemptsByFingerprint.size, 2, "two source files were resolved");
  assertEqual([...attemptsByFingerprint.values()].reduce((sum, attempts) => sum + attempts, 0), 4, "each source file was retried once");
  assertEqual(retry.retryAttemptCount, 2, "metadata counts aggregate retry attempts across files");
  assertEqual(retry.maxAttemptCount, 2, "metadata keeps per-file attempt cap");
  assertEqual(retry.fileCount, 2, "metadata reports bounded multi-file count");
  assertEqual(retry.retryWorkerCreated, false, "multi-file metadata reports no retry worker");
  assertEqual(retry.retryScheduleCreated, false, "multi-file metadata reports no retry schedule");
  assert(!containsForbiddenDurableTruth(result), "multi-file retry metadata leaks no source refs, credentials, URLs, bytes, or signatures");
}

async function verifyHostReportedForegroundRetryMetadataIsSanitized(): Promise<void> {
  section("6. Host-reported Foreground Retry Metadata Is Bounded and Sanitized");
  const result = await executeWithCustomHandler(async (action) => ({
    accepted: true,
    transferKey: action.transferKey,
    foregroundRetry: {
      automaticRetryMode: "bounded_foreground_retry",
      retryStage: "source_resolution",
      retryStatus: "recovered",
      retryAttemptCount: 999,
      maxAttemptCount: 999,
      fileCount: 999,
      retryWorkerCreated: true,
      retryScheduleCreated: true,
      reason: "raw retry reason https://files.slack.com/private-download-url?token=xoxb-phase129-secret",
      sourceRef: "artifact:phase129_report",
      signature: "channel-media-transfer:slack:secret",
    },
  }));
  const retry = foregroundRetry(result.data.foregroundRetry);

  assertEqual(result.isError, false, "custom host handler success remains accepted");
  assertEqual(retry.automaticRetryMode, "bounded_foreground_retry", "safe host-reported retry mode is preserved");
  assertEqual(retry.retryStage, "source_resolution", "safe host-reported retry stage is preserved");
  assertEqual(retry.retryStatus, "recovered", "safe host-reported retry status is preserved");
  assertEqual(retry.retryAttemptCount, 1, "unsafe retry attempt count is clamped");
  assertEqual(retry.maxAttemptCount, 2, "unsafe max attempt count is clamped");
  assertEqual(retry.fileCount, 1, "unsafe file count is clamped to action file count");
  assertEqual(retry.retryWorkerCreated, false, "host cannot claim a retry worker was created");
  assertEqual(retry.retryScheduleCreated, false, "host cannot claim a retry schedule was created");
  assertEqual("reason" in retry, false, "free-form retry reasons are not copied into durable metadata");
  assertEqual("sourceRef" in retry, false, "raw source refs are not copied into durable retry metadata");
  assert(!containsForbiddenDurableTruth(result), "sanitized host-reported retry metadata leaks no source refs, credentials, URLs, bytes, or signatures");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 129 Verification (External Media Transfer Foreground Retry Metadata)\n");
  await verifyRecoveredSourceRetryMetadataOnSuccess();
  await verifyExhaustedSourceRetryMetadataOnFailure();
  await verifyNoRetryCreatesNoForegroundMetadata();
  await verifyVendorFailureAfterRecoveredSourceRetryKeepsRetryBoundary();
  await verifyMultiFileRetryMetadataCountsAggregateRetries();
  await verifyHostReportedForegroundRetryMetadataIsSanitized();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 129: external media transfer foreground retry metadata is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
