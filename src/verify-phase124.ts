/** Phase 124 Verification - External Media Transfer Host Worker Factory */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferHostAction,
  type ExternalChannelMediaTransferResolvedFile,
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
    workspaceId: "T124",
    targetKind: "channel",
    targetId: "C124",
    threadId: "171000.1240",
    enabled: true,
    fileRefs: [
      {
        sourceRef: "artifact:phase124_report",
        name: "phase-124-report.pdf",
        title: "Phase 124 report",
        mimeType: "application/pdf",
        sizeBytes: 4096,
        checksumSha256: "f".repeat(64),
      },
      {
        sourceRef: "tool-result:phase124_summary",
        name: "summary.txt",
        mimeType: "text/plain",
        sizeBytes: 1024,
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
      approvedAt: "2026-05-08T06:20:00.000Z",
      signature,
    },
  };
}

function containsForbiddenDurableTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase124_report") ||
    text.includes("tool-result:phase124_summary") ||
    text.includes("channel-media-transfer:") ||
    text.includes("xoxb-phase124-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("raw-inline-byte-payload") ||
    text.includes("C:\\secret\\phase124");
}

async function executeWithWorker(
  handler: ReturnType<typeof createExternalChannelMediaTransferWorkerHandler> | undefined,
): Promise<Awaited<ReturnType<typeof executeExternalChannelMediaTransferHostRequest>>> {
  const { candidate, approval } = await approvedCandidate();
  return executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: handler,
  });
}

async function verifyWorkerIsOptInAndMissingHandlerStillFailsClosed(): Promise<void> {
  section("1. Worker Is Opt-in and Missing Handler Still Fails Closed");
  const { candidate, approval } = await approvedCandidate();
  let resolverCalled = false;
  const missingHandler = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
  });
  const missingResolver = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: null,
    sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey }),
  }));
  const missingSender = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => {
      resolverCalled = true;
      return { sourceRefFingerprint: request.sourceRefFingerprint, sizeBytes: 1 };
    },
    sendToVendor: null,
  }));

  assertEqual(missingHandler.isError, true, "without an explicit handler, existing missing-handler gate rejects");
  assertEqual(missingHandler.data.reasonCode, "missing_handler", "missing handler reason remains stable");
  assertEqual(missingResolver.isError, true, "worker without resolver rejects");
  assertEqual(missingResolver.data.reasonCode, "handler_rejected", "missing resolver is surfaced through existing handler rejection");
  assertEqual(missingSender.isError, true, "worker without sender rejects");
  assertEqual(resolverCalled, false, "missing sender fails before resolving host sources");
  assert(!containsForbiddenDurableTruth([missingHandler, missingResolver, missingSender]), "missing dependency paths leak no raw refs, credentials, URLs, or signatures");
}

async function verifyResolverAndSenderSeeBoundedHostWorkerInputs(): Promise<void> {
  section("2. Resolver and Sender See Bounded Host Worker Inputs");
  const seenResolve: ExternalChannelMediaTransferSourceResolveRequest[] = [];
  let seenAction: ExternalChannelMediaTransferHostAction | undefined;
  let seenResolved: ExternalChannelMediaTransferResolvedFile[] = [];
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => {
      seenResolve.push(request);
      return {
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
        checksumSha256: request.checksumSha256,
        hostHandle: { opaque: request.fileIndex },
      };
    },
    sendToVendor: async (action, resolvedFiles) => {
      seenAction = action;
      seenResolved = resolvedFiles;
      return {
        accepted: true,
        transferKey: action.transferKey,
        deliveredCount: resolvedFiles.length,
        receipt: { receiptId: "receipt-phase124-ok", status: "sent", inspectedFileCount: resolvedFiles.length },
      };
    },
  }));

  assertEqual(result.isError, false, "worker-backed transfer succeeds when resolver and sender accept");
  assertEqual(seenResolve.length, 2, "resolver runs once per executable file");
  assertEqual(seenResolve[0]?.sourceRef, "artifact:phase124_report", "resolver receives safe host-owned source ref");
  assert(typeof seenResolve[0]?.sourceRefFingerprint === "string" && /^[a-f0-9]{64}$/.test(seenResolve[0]?.sourceRefFingerprint), "resolver receives bounded source-ref fingerprint");
  assertEqual("approval" in (seenResolve[0] as unknown as Record<string, unknown>), false, "resolver request carries no approval object");
  assertEqual("credential" in (seenResolve[0] as unknown as Record<string, unknown>), false, "resolver request carries no credential field");
  assertEqual(seenResolved.length, 2, "sender receives resolved files");
  assertEqual("sourceRef" in (seenResolved[0] as unknown as Record<string, unknown>), false, "sender resolved file avoids raw source refs");
  assertEqual(seenResolved[0]?.sourceRefFingerprint, seenResolve[0]?.sourceRefFingerprint, "sender sees matching fingerprint");
  assertEqual(result.data.hostReceiptSource, "host_reported", "existing receipt sanitizer still runs");
  assertEqual(result.data.hostReceiptFilesInspectedByColony, false, "worker receipt does not claim Colony file inspection");
  assertEqual(result.data.transferKey, seenAction?.transferKey, "existing transfer key result binding remains in use");
  assert(!containsForbiddenDurableTruth(result), "worker-backed success data leaks no raw refs, URLs, credentials, or signatures");
}

async function verifyResolutionBoundsAndChecksumMismatchesFailClosed(): Promise<void> {
  section("3. Resolution Bounds and Checksum Mismatches Fail Closed");
  const oversized = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: 101 * 1024 * 1024,
    }),
    sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey }),
  }));
  const checksumMismatch = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
      checksumSha256: "0".repeat(64),
    }),
    sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey }),
  }));
  const forbiddenPayload = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: 1,
      downloadUrl: "https://files.slack.com/private-download-url?token=xoxb-phase124-secret",
      contentBytes: "raw-inline-byte-payload",
    } as unknown as ExternalChannelMediaTransferResolvedFile),
    sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey }),
  }));

  assertEqual(oversized.isError, true, "oversized resolved file rejects");
  assertEqual(oversized.data.reasonCode, "handler_rejected", "oversized rejection stays inside host handler boundary");
  assertEqual(checksumMismatch.isError, true, "checksum mismatch rejects");
  assertEqual(forbiddenPayload.isError, true, "forbidden resolver payload rejects");
  assert(!containsForbiddenDurableTruth([oversized, checksumMismatch, forbiddenPayload]), "resolver validation failures leak no bytes, URLs, refs, or credentials");
}

async function verifySenderTransferKeyMismatchStillFailsExistingIntegrityGate(): Promise<void> {
  section("4. Sender Transfer-Key Mismatch Uses Existing Integrity Gate");
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
    }),
    sendToVendor: async (action) => ({
      accepted: true,
      transferKey: `${action.transferKey}-stale`,
      deliveredCount: action.files.length,
      vendorMessageId: "slack-phase124-stale",
    }),
  }));

  assertEqual(result.isError, true, "sender transfer-key mismatch rejects");
  assertEqual(result.data.reasonCode, "transfer_key_mismatch", "existing transfer-key integrity reason is preserved");
  assertEqual(result.data.retryable, false, "sender mismatch is non-retryable integrity failure");
  assertEqual("vendorMessageId" in result.data, false, "mismatch does not copy sender vendor message id");
  assert(!containsForbiddenDurableTruth(result), "mismatch leaks no raw refs, URLs, credentials, or signatures");
}

async function verifyRetryableWorkerFailuresGetManualRetryUx(): Promise<void> {
  section("5. Retryable Worker Failures Get Manual Retry UX");
  const resolverFailure = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async () => ({
      accepted: false,
      retryable: true,
      retryAfterSeconds: 999999,
      reason: "host source download rate limited at https://files.slack.com/private-download-url?token=xoxb-phase124-secret",
    }),
    sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey }),
  }));
  const senderFailure = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
    }),
    sendToVendor: async () => ({
      accepted: false,
      retryable: true,
      retryAfterSeconds: 999999,
      reason: "vendor upload rate limited at https://files.slack.com/private-download-url?token=xoxb-phase124-secret",
    }),
  }));

  for (const [label, result] of [["resolver", resolverFailure], ["sender", senderFailure]] as const) {
    assertEqual(result.isError, true, `${label} retryable worker failure remains failed`);
    assertEqual(result.data.reasonCode, "handler_rejected", `${label} retryable worker failure uses existing handler rejection`);
    assertEqual(result.data.retryable, true, `${label} retryable worker failure is marked retryable`);
    assertEqual(result.data.retryMode, "manual_operator_reinvoke", `${label} retryable worker failure uses manual retry mode`);
    assertEqual(result.data.retryReason, "host_handler_rejected", `${label} retry reason stays in existing host-handler namespace`);
    assertEqual(result.data.retryAfterSeconds, 3600, `${label} retry-after seconds are clamped`);
    assertEqual(result.data.retryWorkerCreated, false, `${label} creates no retry worker`);
    assertEqual(result.data.retryScheduleCreated, false, `${label} creates no retry schedule`);
    assert(!containsForbiddenDurableTruth(result), `${label} retryable worker failure leaks no raw refs, URLs, bytes, or credentials`);
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 124 Verification (External Media Transfer Host Worker Factory)\n");
  await verifyWorkerIsOptInAndMissingHandlerStillFailsClosed();
  await verifyResolverAndSenderSeeBoundedHostWorkerInputs();
  await verifyResolutionBoundsAndChecksumMismatchesFailClosed();
  await verifySenderTransferKeyMismatchStillFailsExistingIntegrityGate();
  await verifyRetryableWorkerFailuresGetManualRetryUx();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 124: external media transfer host worker factory is GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });
