/** Phase 131 Verification - External Media Transfer Previous Source Failure Context */

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
    workspaceId: "T131",
    targetKind: "channel",
    targetId: "C131",
    threadId: "171000.1310",
    enabled: true,
    fileRefs: [
      {
        sourceRef: "artifact:phase131_report",
        name: "phase-131-report.pdf",
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
      approvedAt: "2026-05-08T08:03:00.000Z",
      signature,
    },
  };
}

function containsForbiddenDurableTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase131_report") ||
    text.includes("artifact:phase131_appendix") ||
    text.includes("previousAttemptFailureKind") ||
    text.includes("previousAttemptWasRetryable") ||
    text.includes("previousRetryAfterSeconds") ||
    text.includes("previous host miss reason") ||
    text.includes("channel-media-transfer:") ||
    text.includes("xoxb-phase131-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("raw-inline-byte-payload") ||
    text.includes("C:\\secret\\phase131");
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

function hasPreviousFailureContext(request: ExternalChannelMediaTransferSourceResolveRequest): boolean {
  return "previousAttemptFailureKind" in request ||
    "previousAttemptWasRetryable" in request ||
    "previousRetryAfterSeconds" in request;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyRetrySeesPreviousRejectedFailure(): Promise<void> {
  section("1. Retry Request Receives Previous Retryable Rejection Context");
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
          reason: "previous host miss reason at https://files.slack.com/private-download-url?token=xoxb-phase131-secret",
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
  assertEqual(seen.length, 2, "source resolver receives a retry request");
  assertEqual(hasPreviousFailureContext(seen[0]!), false, "first attempt has no previous-failure context");
  assertEqual(seen[1]?.previousAttemptFailureKind, "rejected", "retry request carries previous rejection kind");
  assertEqual(seen[1]?.previousAttemptWasRetryable, true, "retry request carries previous retryable truth");
  assertEqual(seen[1]?.previousRetryAfterSeconds, 3600, "retry request clamps previous retry-after seconds");
  assertEqual(seen[1]?.attemptNumber, 2, "retry request still carries one-based attempt context");
  assert(!JSON.stringify(seen[1]).includes("previous host miss reason"), "retry request does not carry raw previous failure reason");
  assert(!containsForbiddenDurableTruth(result), "previous rejection context leaks no source refs, credentials, URLs, reasons, bytes, or signatures");
}

async function verifyRetrySeesPreviousTimeoutFailure(): Promise<void> {
  section("2. Retry Request Receives Previous Timeout Context With Fresh Abort Signal");
  const seen: ExternalChannelMediaTransferSourceResolveRequest[] = [];
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 2,
    sourceResolveTimeoutMs: 1,
    sourceResolveTimeoutRetryAfterSeconds: 17,
    resolveSourceRef: async (request) => {
      seen.push(request);
      if (request.attemptNumber === 1) {
        await delay(15);
        return {
          sourceRefFingerprint: request.sourceRefFingerprint,
          sizeBytes: request.sizeBytes,
          checksumSha256: request.checksumSha256,
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

  assertEqual(result.isError, false, "source timeout retry recovery still succeeds");
  assertEqual(seen.length, 2, "timeout attempt is followed by one retry");
  assertEqual(seen[0]?.abortSignal?.aborted, true, "timed-out attempt receives cooperative abort signal");
  assertEqual(seen[1]?.previousAttemptFailureKind, "timeout", "retry request carries previous timeout kind");
  assertEqual(seen[1]?.previousAttemptWasRetryable, true, "timeout retry request carries previous retryable truth");
  assertEqual(seen[1]?.previousRetryAfterSeconds, 17, "timeout retry request carries bounded retry-after seconds");
  assert(seen[1]?.abortSignal instanceof AbortSignal && seen[1]?.abortSignal !== seen[0]?.abortSignal, "retry attempt receives a fresh abort signal");
  assertEqual(seen[1]?.abortSignal?.aborted, false, "fresh retry abort signal is not pre-aborted");
  assert(!containsForbiddenDurableTruth(result), "previous timeout context leaks no source refs, credentials, URLs, reasons, bytes, or signatures");
}

async function verifySingleAttemptCarriesNoPreviousFailure(): Promise<void> {
  section("3. Single Attempt Carries No Previous Failure Context");
  const seen: ExternalChannelMediaTransferSourceResolveRequest[] = [];
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 1,
    resolveSourceRef: async (request) => {
      seen.push(request);
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

  assertEqual(result.isError, false, "single-attempt source resolution still succeeds");
  assertEqual(seen.length, 1, "single-attempt resolver is called once");
  assertEqual(hasPreviousFailureContext(seen[0]!), false, "single-attempt request has no previous-failure context");
  assert(!containsForbiddenDurableTruth(result), "single-attempt request leaks no source refs, credentials, URLs, reasons, bytes, or signatures");
}

async function verifyPreviousFailureContextResetsPerFile(): Promise<void> {
  section("4. Previous Failure Context Resets Per Source File");
  const seen: ExternalChannelMediaTransferSourceResolveRequest[] = [];
  const attemptsByFingerprint = new Map<string, number>();
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 2,
    resolveSourceRef: async (request) => {
      seen.push(request);
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
        sourceRef: "artifact:phase131_report",
        name: "phase-131-report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4096,
        checksumSha256: "a".repeat(64),
      },
      {
        sourceRef: "artifact:phase131_appendix",
        name: "phase-131-appendix.txt",
        mimeType: "text/plain",
        sizeBytes: 1024,
        checksumSha256: "b".repeat(64),
      },
    ],
  });

  assertEqual(result.isError, false, "multi-file source resolution succeeds");
  assertEqual(seen.length, 3, "first file retries and second file resolves once");
  assertEqual(seen[1]?.previousAttemptFailureKind, "rejected", "first file retry receives previous-failure context");
  assertEqual(hasPreviousFailureContext(seen[2]!), false, "second file first attempt has no previous-failure context");
  assert(!containsForbiddenDurableTruth(result), "multi-file previous failure context leaks no source refs, credentials, URLs, reasons, bytes, or signatures");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 131 Verification (External Media Transfer Previous Source Failure Context)\n");
  await verifyRetrySeesPreviousRejectedFailure();
  await verifyRetrySeesPreviousTimeoutFailure();
  await verifySingleAttemptCarriesNoPreviousFailure();
  await verifyPreviousFailureContextResetsPerFile();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 131: external media transfer previous source failure context is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
