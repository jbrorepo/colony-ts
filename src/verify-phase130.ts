/** Phase 130 Verification - External Media Transfer Source Attempt Context */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferSourceResolveRequest,
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
    workspaceId: "T130",
    targetKind: "channel",
    targetId: "C130",
    threadId: "171000.1300",
    enabled: true,
    fileRefs: [
      {
        sourceRef: "artifact:phase130_report",
        name: "phase-130-report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4096,
        checksumSha256: "a".repeat(64),
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
      approvedAt: "2026-05-08T07:52:00.000Z",
      signature,
    },
  };
}

function containsForbiddenDurableTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase130_report") ||
    text.includes("artifact:phase130_appendix") ||
    text.includes("channel-media-transfer:") ||
    text.includes("xoxb-phase130-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("raw-inline-byte-payload") ||
    text.includes("C:\\secret\\phase130");
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

async function verifyRetryAttemptContextIsVisibleToSourceResolver(): Promise<void> {
  section("1. Source Resolver Receives Bounded Retry Attempt Context");
  const seen: ExternalChannelMediaTransferSourceResolveRequest[] = [];
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 2,
    resolveSourceRef: async (request) => {
      seen.push(request);
      if (request.attemptNumber === 1) {
        return {
          accepted: false,
          retryable: true,
          retryAfterSeconds: 999999,
          reason: "temporary host source miss at https://files.slack.com/private-download-url?token=xoxb-phase130-secret",
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
    }),
  }));

  assertEqual(result.isError, false, "source retry recovery still succeeds");
  assertEqual(seen.length, 2, "source resolver receives two foreground attempts");
  assertEqual(seen[0]?.attemptNumber, 1, "first attempt number is one-based");
  assertEqual(seen[0]?.retryAttemptCount, 0, "first attempt has zero prior retry attempts");
  assertEqual(seen[0]?.isRetryAttempt, false, "first attempt is not marked as retry");
  assertEqual(seen[0]?.maxAttemptCount, 2, "first attempt carries bounded max attempts");
  assertEqual(seen[1]?.attemptNumber, 2, "second attempt number is one-based");
  assertEqual(seen[1]?.retryAttemptCount, 1, "second attempt reports one retry attempt");
  assertEqual(seen[1]?.isRetryAttempt, true, "second attempt is marked as retry");
  assertEqual(seen[1]?.maxAttemptCount, 2, "second attempt carries bounded max attempts");
  assertEqual("attemptNumber" in result.data, false, "attempt context is not copied to durable result root");
  assert(!containsForbiddenDurableTruth(result), "attempt-context recovery leaks no source refs, credentials, URLs, bytes, or signatures");
}

async function verifyAttemptContextResetsPerFile(): Promise<void> {
  section("2. Attempt Context Resets Per Source File");
  const seen: Array<Pick<ExternalChannelMediaTransferSourceResolveRequest, "fileIndex" | "attemptNumber" | "retryAttemptCount" | "isRetryAttempt" | "maxAttemptCount">> = [];
  const attemptsByFingerprint = new Map<string, number>();
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 2,
    resolveSourceRef: async (request) => {
      seen.push({
        fileIndex: request.fileIndex,
        attemptNumber: request.attemptNumber,
        retryAttemptCount: request.retryAttemptCount,
        isRetryAttempt: request.isRetryAttempt,
        maxAttemptCount: request.maxAttemptCount,
      });
      const attempts = (attemptsByFingerprint.get(request.sourceRefFingerprint) ?? 0) + 1;
      attemptsByFingerprint.set(request.sourceRefFingerprint, attempts);
      if (request.fileIndex === 0 && attempts === 1) {
        return { accepted: false, retryable: true, reason: "first file transient miss" };
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
        sourceRef: "artifact:phase130_report",
        name: "phase-130-report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4096,
        checksumSha256: "a".repeat(64),
      },
      {
        sourceRef: "artifact:phase130_appendix",
        name: "phase-130-appendix.txt",
        mimeType: "text/plain",
        sizeBytes: 1024,
        checksumSha256: "b".repeat(64),
      },
    ],
  });

  assertEqual(result.isError, false, "multi-file source resolution succeeds");
  assertEqual(seen.length, 3, "first file retries and second file resolves once");
  assertEqual(JSON.stringify(seen.map((item) => [item.fileIndex, item.attemptNumber, item.retryAttemptCount, item.isRetryAttempt])), JSON.stringify([[0, 1, 0, false], [0, 2, 1, true], [1, 1, 0, false]]), "attempt context is per-file, not aggregate");
  assert(seen.every((item) => item.maxAttemptCount === 2), "every source request carries the bounded max-attempt count");
  assert(!containsForbiddenDurableTruth(result), "multi-file attempt context leaks no source refs, credentials, URLs, bytes, or signatures");
}

async function verifyInvalidAttemptOptionPreservesSingleAttemptContext(): Promise<void> {
  section("3. Invalid Attempt Option Preserves Single-attempt Context");
  const seen: ExternalChannelMediaTransferSourceResolveRequest[] = [];
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 0,
    resolveSourceRef: async (request) => {
      seen.push(request);
      return { accepted: false, retryable: true, reason: "retryable but attempts disabled by invalid option" };
    },
    sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey }),
  }));

  assertEqual(result.isError, true, "single-attempt retryable source failure still rejects");
  assertEqual(seen.length, 1, "invalid attempt option keeps previous single attempt behavior");
  assertEqual(seen[0]?.attemptNumber, 1, "single-attempt context still uses attempt one");
  assertEqual(seen[0]?.retryAttemptCount, 0, "single-attempt context has no retry count");
  assertEqual(seen[0]?.isRetryAttempt, false, "single-attempt context is not marked retry");
  assertEqual(seen[0]?.maxAttemptCount, 1, "invalid option reports bounded single-attempt max");
  assertEqual("foregroundRetry" in result.data, false, "no foreground retry metadata appears when no retry occurred");
  assert(!containsForbiddenDurableTruth(result), "single-attempt context leaks no source refs, credentials, URLs, bytes, or signatures");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 130 Verification (External Media Transfer Source Attempt Context)\n");
  await verifyRetryAttemptContextIsVisibleToSourceResolver();
  await verifyAttemptContextResetsPerFile();
  await verifyInvalidAttemptOptionPreservesSingleAttemptContext();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 130: external media transfer source attempt context is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
