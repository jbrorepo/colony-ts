/** Phase 132 Verification - External Media Transfer Per-file Source Retry Outcome Metadata */

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
    workspaceId: "T132",
    targetKind: "channel",
    targetId: "C132",
    threadId: "171000.1320",
    enabled: true,
    fileRefs: [
      {
        sourceRef: "artifact:phase132_report",
        name: "phase-132-report.pdf",
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
      approvedAt: "2026-05-08T08:16:00.000Z",
      signature,
    },
  };
}

function containsForbiddenDurableTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase132_report") ||
    text.includes("artifact:phase132_appendix") ||
    text.includes("sourceRef\":\"artifact:") ||
    text.includes("previousAttemptFailureKind") ||
    text.includes("previousAttemptWasRetryable") ||
    text.includes("previousRetryAfterSeconds") ||
    text.includes("phase132 raw retry reason") ||
    text.includes("channel-media-transfer:") ||
    text.includes("xoxb-phase132-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("raw-inline-byte-payload") ||
    text.includes("C:\\secret\\phase132");
}

function foregroundRetry(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sourceFileOutcomes(value: unknown): Record<string, unknown>[] {
  const retry = foregroundRetry(value);
  return Array.isArray(retry.sourceFileOutcomes)
    ? retry.sourceFileOutcomes.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyRecoveredRetryOutcomeMetadata(): Promise<void> {
  section("1. Recovered Source Retry Emits Per-file Outcome Metadata");
  let firstFingerprint = "";
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 2,
    resolveSourceRef: async (request) => {
      firstFingerprint ||= request.sourceRefFingerprint;
      if (request.attemptNumber === 1) {
        return {
          accepted: false,
          retryable: true,
          retryAfterSeconds: 999999,
          reason: "phase132 raw retry reason at https://files.slack.com/private-download-url?token=xoxb-phase132-secret",
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
      vendorMessageId: "slack-phase132-recovered",
    }),
  }));
  const retry = foregroundRetry(result.data.foregroundRetry);
  const outcomes = sourceFileOutcomes(result.data.foregroundRetry);
  const outcome = outcomes[0] ?? {};

  assertEqual(result.isError, false, "source retry recovery still succeeds");
  assertEqual(retry.retryStatus, "recovered", "aggregate metadata records source retry recovery");
  assertEqual(outcomes.length, 1, "one source file outcome is emitted for the retried file");
  assertEqual(outcome.fileIndex, 0, "outcome records bounded file index");
  assertEqual(outcome.sourceRefFingerprint, firstFingerprint, "outcome carries safe source-ref fingerprint");
  assertEqual(outcome.retryStatus, "recovered", "outcome records recovered retry status");
  assertEqual(outcome.retryAttemptCount, 1, "outcome records per-file retry attempt count");
  assertEqual(outcome.maxAttemptCount, 2, "outcome records per-file attempt cap");
  assertEqual(outcome.lastFailureKind, "rejected", "outcome records last retry-triggering failure kind");
  assertEqual(outcome.lastRetryAfterSeconds, 3600, "outcome clamps last retry-after seconds");
  assert(!containsForbiddenDurableTruth(result), "recovered per-file outcome leaks no raw refs, reasons, credentials, URLs, bytes, or signatures");
}

async function verifyExhaustedTimeoutOutcomeMetadata(): Promise<void> {
  section("2. Exhausted Timeout Retry Emits Per-file Outcome Metadata");
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 2,
    sourceResolveTimeoutMs: 1,
    sourceResolveTimeoutRetryAfterSeconds: 23,
    resolveSourceRef: async () => {
      await delay(15);
      return null;
    },
    sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey }),
  }));
  const retry = foregroundRetry(result.data.foregroundRetry);
  const outcomes = sourceFileOutcomes(result.data.foregroundRetry);
  const outcome = outcomes[0] ?? {};

  assertEqual(result.isError, true, "exhausted source timeout rejects transfer");
  assertEqual(result.data.retryMode, "manual_operator_reinvoke", "manual operator retry UX remains present");
  assertEqual(retry.retryStatus, "exhausted", "aggregate metadata records exhaustion");
  assertEqual(outcomes.length, 1, "one source file outcome is emitted for the exhausted file");
  assertEqual(outcome.retryStatus, "exhausted", "outcome records exhausted status");
  assertEqual(outcome.retryAttemptCount, 1, "outcome records one foreground retry attempt");
  assertEqual(outcome.lastFailureKind, "timeout", "outcome records timeout as the last failure kind");
  assertEqual(outcome.lastRetryAfterSeconds, 23, "outcome records bounded timeout retry-after seconds");
  assertEqual(result.data.retryWorkerCreated, false, "exhaustion creates no retry worker");
  assertEqual(result.data.retryScheduleCreated, false, "exhaustion creates no retry schedule");
  assert(!containsForbiddenDurableTruth(result), "exhausted timeout outcome leaks no raw refs, reasons, credentials, URLs, bytes, or signatures");
}

async function verifyOnlyRetriedFilesGetOutcomes(): Promise<void> {
  section("3. Multi-file Metadata Includes Only Files That Actually Retried");
  const attemptsByFile = new Map<number, number>();
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 2,
    resolveSourceRef: async (request) => {
      const attempts = (attemptsByFile.get(request.fileIndex) ?? 0) + 1;
      attemptsByFile.set(request.fileIndex, attempts);
      if (request.fileIndex === 0 && attempts === 1) {
        return { accepted: false, retryable: true, reason: "phase132 first file transient miss" };
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
        sourceRef: "artifact:phase132_report",
        name: "phase-132-report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4096,
        checksumSha256: "c".repeat(64),
      },
      {
        sourceRef: "artifact:phase132_appendix",
        name: "phase-132-appendix.txt",
        mimeType: "text/plain",
        sizeBytes: 1024,
        checksumSha256: "b".repeat(64),
      },
    ],
  });
  const outcomes = sourceFileOutcomes(result.data.foregroundRetry);

  assertEqual(result.isError, false, "multi-file transfer succeeds");
  assertEqual(attemptsByFile.get(0), 2, "first file retried once");
  assertEqual(attemptsByFile.get(1), 1, "second file resolved once");
  assertEqual(outcomes.length, 1, "only the retried file gets an outcome entry");
  assertEqual(outcomes[0]?.fileIndex, 0, "outcome belongs to the retried first file");
  assert(!containsForbiddenDurableTruth(result), "multi-file outcomes leak no raw refs, reasons, credentials, URLs, bytes, or signatures");
}

async function verifyHostReportedOutcomeMetadataIsSanitized(): Promise<void> {
  section("4. Host-reported Per-file Outcomes Are Bounded and Sanitized");
  let approvedFingerprint = "";
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
      reason: "phase132 raw retry reason https://files.slack.com/private-download-url?token=xoxb-phase132-secret",
      sourceFileOutcomes: [
        {
          fileIndex: 0,
          sourceRefFingerprint: "a".repeat(64),
          retryStatus: "recovered",
          retryAttemptCount: 1,
          maxAttemptCount: 2,
        },
        {
          fileIndex: 0,
          sourceRefFingerprint: approvedFingerprint ||= action.files[0]?.sourceRefFingerprint ?? "",
          retryStatus: "recovered",
          retryAttemptCount: 999,
          maxAttemptCount: 999,
          lastFailureKind: "rejected",
          lastRetryAfterSeconds: 999999,
          sourceRef: "artifact:phase132_report",
          previousAttemptFailureKind: "rejected",
          reason: "phase132 raw retry reason",
          url: "https://files.slack.com/private-download-url?token=xoxb-phase132-secret",
        },
        {
          fileIndex: 0,
          sourceRefFingerprint: "not-a-sha",
          retryStatus: "recovered",
          retryAttemptCount: 1,
          maxAttemptCount: 2,
        },
      ],
    },
  }));
  const retry = foregroundRetry(result.data.foregroundRetry);
  const outcomes = sourceFileOutcomes(result.data.foregroundRetry);
  const outcome = outcomes[0] ?? {};

  assertEqual(result.isError, false, "custom host handler success remains accepted");
  assertEqual(retry.retryAttemptCount, 1, "unsafe aggregate retry attempt count is clamped");
  assertEqual(retry.maxAttemptCount, 2, "unsafe aggregate max attempt count is clamped");
  assertEqual(retry.retryWorkerCreated, false, "host cannot claim a retry worker was created");
  assertEqual(retry.retryScheduleCreated, false, "host cannot claim a retry schedule was created");
  assertEqual(outcomes.length, 1, "unapproved and malformed source outcome fingerprints are dropped");
  assertEqual(outcome.fileIndex, 0, "outcome file index remains bound to the approved action file");
  assertEqual(outcome.sourceRefFingerprint, approvedFingerprint, "approved outcome fingerprint is preserved");
  assertEqual(outcome.retryStatus, "recovered", "safe outcome retry status is preserved");
  assertEqual(outcome.retryAttemptCount, 1, "unsafe outcome retry attempt count is clamped");
  assertEqual(outcome.maxAttemptCount, 2, "unsafe outcome max attempt count is clamped");
  assertEqual(outcome.lastRetryAfterSeconds, 3600, "unsafe outcome retry-after is clamped");
  assertEqual("sourceRef" in outcome, false, "raw source refs are not copied into outcome metadata");
  assertEqual("reason" in outcome, false, "free-form retry reasons are not copied into outcome metadata");
  assertEqual("previousAttemptFailureKind" in outcome, false, "request-only previous failure context is not copied into outcome metadata");
  assert(!containsForbiddenDurableTruth(result), "sanitized host-reported outcomes leak no raw refs, reasons, credentials, URLs, bytes, or signatures");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 132 Verification (External Media Transfer Per-file Source Retry Outcome Metadata)\n");
  await verifyRecoveredRetryOutcomeMetadata();
  await verifyExhaustedTimeoutOutcomeMetadata();
  await verifyOnlyRetriedFilesGetOutcomes();
  await verifyHostReportedOutcomeMetadataIsSanitized();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 132: external media transfer per-file source retry outcome metadata is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
