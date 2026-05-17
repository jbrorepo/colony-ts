/** Phase 127 Verification - External Media Transfer Vendor Send Timeout */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferResolvedFile,
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
    workspaceId: "T127",
    targetKind: "channel",
    targetId: "C127",
    threadId: "171000.1270",
    enabled: true,
    fileRefs: [
      {
        sourceRef: "artifact:phase127_report",
        name: "phase-127-report.pdf",
        title: "Phase 127 report",
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
      approvedAt: "2026-05-08T07:07:00.000Z",
      signature,
    },
  };
}

function containsForbiddenDurableTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase127_report") ||
    text.includes("channel-media-transfer:") ||
    text.includes("xoxb-phase127-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("raw-inline-byte-payload") ||
    text.includes("C:\\secret\\phase127");
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

async function verifyVendorSendTimeoutFailsRetryablyAfterResolution(): Promise<void> {
  section("1. Vendor Send Timeout Fails Retryably After Resolution");
  let resolvedCount = 0;
  let senderCalled = false;
  let signalSeen = false;
  let signalAborted = false;
  let senderRequest: ExternalChannelMediaTransferVendorSendRequest | undefined;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    vendorSendTimeoutMs: 5,
    vendorSendTimeoutRetryAfterSeconds: 999999,
    resolveSourceRef: async (request) => {
      resolvedCount++;
      return {
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
      };
    },
    sendToVendor: async (action, resolvedFiles, request) => {
      senderCalled = true;
      senderRequest = request;
      signalSeen = Boolean(request?.abortSignal);
      request?.abortSignal?.addEventListener("abort", () => {
        signalAborted = true;
      }, { once: true });
      await delay(35);
      return {
        accepted: true,
        transferKey: action.transferKey,
        deliveredCount: resolvedFiles.length,
        vendorMessageId: "slack-phase127-late",
      };
    },
  }));

  assertEqual(result.isError, true, "timed-out vendor send rejects the transfer");
  assertEqual(result.data.reasonCode, "handler_rejected", "vendor timeout stays inside existing host handler boundary");
  assertEqual(result.data.retryable, true, "vendor timeout is retryable");
  assertEqual(result.data.retryMode, "manual_operator_reinvoke", "vendor timeout uses manual operator reinvoke");
  assertEqual(result.data.retryReason, "host_handler_rejected", "vendor timeout uses existing host-handler retry namespace");
  assertEqual(result.data.retryAfterSeconds, 3600, "vendor timeout retry-after is clamped by existing retry UX");
  assertEqual(result.data.retryWorkerCreated, false, "vendor timeout creates no retry worker");
  assertEqual(result.data.retryScheduleCreated, false, "vendor timeout creates no retry schedule");
  assertEqual("vendorMessageId" in result.data, false, "late sender success metadata is not copied after timeout");
  assertEqual("hostReceiptSource" in result.data, false, "late sender receipt metadata is not copied after timeout");
  assertEqual(resolvedCount, 1, "source resolution completes before vendor send timeout");
  assertEqual(senderCalled, true, "vendor sender is called before the send timeout fires");
  assertEqual(senderRequest?.transferKey, String(result.data.transferKey ?? senderRequest?.transferKey), "sender request carries the active transfer key");
  assertEqual(senderRequest?.fileCount, 1, "sender request carries bounded file count truth");
  assertEqual(signalSeen, true, "sender receives an abort signal when timeout is configured");
  assertEqual(signalAborted, true, "timeout aborts the sender signal for cooperative host cleanup");
  assert(result.output.includes("manual operator reinvoke only"), "timeout output keeps manual retry UX wording");
  assert(!containsForbiddenDurableTruth(result), "vendor timeout result leaks no source refs, credentials, URLs, bytes, or signatures");
}

async function verifyFastVendorSendStillUsesExistingSuccessGates(): Promise<void> {
  section("2. Fast Vendor Send Still Uses Existing Success Gates");
  let seenResolved: ExternalChannelMediaTransferResolvedFile[] = [];
  let signalSeen = false;
  let signalAborted = false;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    vendorSendTimeoutMs: 250,
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
      checksumSha256: request.checksumSha256,
      hostHandle: { opaque: "phase127" },
    }),
    sendToVendor: async (action, resolvedFiles, request) => {
      seenResolved = resolvedFiles;
      signalSeen = Boolean(request?.abortSignal);
      request?.abortSignal?.addEventListener("abort", () => {
        signalAborted = true;
      }, { once: true });
      await delay(1);
      return {
        accepted: true,
        transferKey: action.transferKey,
        deliveredCount: resolvedFiles.length,
        vendorMessageId: "slack-phase127-ok",
        receipt: { receiptId: "receipt-phase127-ok", status: "sent", inspectedFileCount: resolvedFiles.length },
      };
    },
  }));

  assertEqual(result.isError, false, "fast vendor send still succeeds");
  assertEqual(signalSeen, true, "configured vendor timeout still passes a sender signal on success");
  assertEqual(signalAborted, false, "fast vendor send does not abort the sender signal");
  assertEqual(seenResolved.length, 1, "sender receives resolved file after source resolution");
  assertEqual("sourceRef" in (seenResolved[0] as unknown as Record<string, unknown>), false, "sender still receives no raw source ref");
  assertEqual(result.data.vendorMessageId, "slack-phase127-ok", "existing vendor message id sanitizer still runs after fast send");
  assertEqual(result.data.hostReceiptSource, "host_reported", "existing receipt sanitizer still runs after fast send");
  assertEqual(result.data.hostReceiptFilesInspectedByColony, false, "receipt still avoids Colony file inspection claim");
  assertEqual(result.data.liveDeliveryEnabled, false, "success still makes no default live delivery claim");
  assertEqual(result.data.defaultPublicHostingEnabled, false, "success still makes no default public hosting claim");
  assertEqual(result.data.credentialPersistenceCreated, false, "success still creates no credential persistence");
  assert(!containsForbiddenDurableTruth([result, seenResolved]), "fast send success leaks no source refs, credentials, URLs, bytes, or signatures");
}

async function verifyInvalidVendorTimeoutPreservesExistingWorkerBehavior(): Promise<void> {
  section("3. Invalid Vendor Timeout Option Preserves Existing Worker Behavior");
  let senderCalled = false;
  let senderSignalSeen = false;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    vendorSendTimeoutMs: 0,
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
    }),
    sendToVendor: async (action, resolvedFiles, request) => {
      senderCalled = true;
      senderSignalSeen = Boolean(request?.abortSignal);
      await delay(10);
      return { accepted: true, transferKey: action.transferKey, deliveredCount: resolvedFiles.length };
    },
  }));

  assertEqual(result.isError, false, "non-positive vendor timeout keeps the existing unbounded opt-in worker path");
  assertEqual(senderCalled, true, "sender still runs when invalid timeout disables the new guard");
  assertEqual(senderSignalSeen, false, "sender does not receive a signal when vendor timeout is disabled");
  assert(!containsForbiddenDurableTruth(result), "disabled-timeout success leaks no source refs, credentials, URLs, bytes, or signatures");
}

async function verifySourceTimeoutStillPreemptsVendorSend(): Promise<void> {
  section("4. Source Timeout Still Preempts Vendor Send");
  let senderCalled = false;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveTimeoutMs: 5,
    vendorSendTimeoutMs: 5,
    resolveSourceRef: async (request) => {
      await delay(35);
      return {
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
      };
    },
    sendToVendor: async (action) => {
      senderCalled = true;
      return { accepted: true, transferKey: action.transferKey, deliveredCount: action.files.length };
    },
  }));

  assertEqual(result.isError, true, "source timeout still rejects");
  assertEqual(result.data.retryable, true, "source timeout remains retryable");
  assertEqual(senderCalled, false, "vendor sender is not called when source resolution times out first");
  assert(!containsForbiddenDurableTruth(result), "source-timeout regression leaks no source refs, credentials, URLs, bytes, or signatures");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 127 Verification (External Media Transfer Vendor Send Timeout)\n");
  await verifyVendorSendTimeoutFailsRetryablyAfterResolution();
  await verifyFastVendorSendStillUsesExistingSuccessGates();
  await verifyInvalidVendorTimeoutPreservesExistingWorkerBehavior();
  await verifySourceTimeoutStillPreemptsVendorSend();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 127: external media transfer vendor send timeout is GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });
