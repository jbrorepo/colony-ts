/** Phase 125 Verification - External Media Transfer Source Resolve Timeout */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
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
function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T125",
    targetKind: "channel",
    targetId: "C125",
    threadId: "171000.1250",
    enabled: true,
    fileRefs: [
      {
        sourceRef: "artifact:phase125_report",
        name: "phase-125-report.pdf",
        title: "Phase 125 report",
        mimeType: "application/pdf",
        sizeBytes: 4096,
        checksumSha256: "e".repeat(64),
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
      approvedAt: "2026-05-08T06:35:00.000Z",
      signature,
    },
  };
}

function containsForbiddenDurableTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase125_report") ||
    text.includes("channel-media-transfer:") ||
    text.includes("xoxb-phase125-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("raw-inline-byte-payload") ||
    text.includes("C:\\secret\\phase125");
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

async function verifySourceResolveTimeoutFailsRetryablyBeforeVendorSend(): Promise<void> {
  section("1. Source Resolve Timeout Fails Retryably Before Vendor Send");
  let senderCalled = false;
  let signalSeen = false;
  let signalAborted = false;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveTimeoutMs: 5,
    sourceResolveTimeoutRetryAfterSeconds: 999999,
    resolveSourceRef: async (request: ExternalChannelMediaTransferSourceResolveRequest) => {
      signalSeen = Boolean(request.abortSignal);
      request.abortSignal?.addEventListener("abort", () => {
        signalAborted = true;
      }, { once: true });
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

  assertEqual(result.isError, true, "timed-out source resolution rejects the transfer");
  assertEqual(result.data.reasonCode, "handler_rejected", "timeout stays inside existing host handler boundary");
  assertEqual(result.data.retryable, true, "timeout is retryable");
  assertEqual(result.data.retryMode, "manual_operator_reinvoke", "timeout uses manual operator reinvoke");
  assertEqual(result.data.retryReason, "host_handler_rejected", "timeout uses existing host-handler retry namespace");
  assertEqual(result.data.retryAfterSeconds, 3600, "timeout retry-after is clamped by existing retry UX");
  assertEqual(result.data.retryWorkerCreated, false, "timeout creates no retry worker");
  assertEqual(result.data.retryScheduleCreated, false, "timeout creates no retry schedule");
  assertEqual(senderCalled, false, "timed-out source resolution never calls vendor sender");
  assertEqual(signalSeen, true, "resolver receives an abort signal when timeout is configured");
  assertEqual(signalAborted, true, "timeout aborts the resolver signal for cooperative host cleanup");
  assert(!containsForbiddenDurableTruth(result), "timeout result leaks no source refs, credentials, URLs, bytes, or signatures");
}

async function verifyFastSourceResolutionStillSendsBoundedFiles(): Promise<void> {
  section("2. Fast Source Resolution Still Sends Bounded Files");
  let seenResolved: ExternalChannelMediaTransferResolvedFile[] = [];
  let signalSeen = false;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveTimeoutMs: 250,
    resolveSourceRef: async (request) => {
      signalSeen = Boolean(request.abortSignal);
      await delay(1);
      return {
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
        checksumSha256: request.checksumSha256,
        hostHandle: { opaque: "phase125" },
      };
    },
    sendToVendor: async (action, resolvedFiles) => {
      seenResolved = resolvedFiles;
      return { accepted: true, transferKey: action.transferKey, deliveredCount: resolvedFiles.length };
    },
  }));

  assertEqual(result.isError, false, "fast source resolution still succeeds");
  assertEqual(signalSeen, true, "configured timeout still passes a resolver signal on success");
  assertEqual(seenResolved.length, 1, "sender receives resolved file after fast resolution");
  assertEqual("sourceRef" in (seenResolved[0] as unknown as Record<string, unknown>), false, "sender still receives no raw source ref");
  assertEqual(result.data.liveDeliveryEnabled, false, "success still makes no default live delivery claim");
  assertEqual(result.data.defaultPublicHostingEnabled, false, "success still makes no default public hosting claim");
  assertEqual(result.data.credentialPersistenceCreated, false, "success still creates no credential persistence");
  assert(!containsForbiddenDurableTruth([result, seenResolved]), "fast success leaks no source refs, credentials, URLs, bytes, or signatures");
}

async function verifyInvalidTimeoutOptionPreservesExistingWorkerBehavior(): Promise<void> {
  section("3. Invalid Timeout Option Preserves Existing Worker Behavior");
  let senderCalled = false;
  let signalSeen = false;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveTimeoutMs: 0,
    resolveSourceRef: async (request) => {
      signalSeen = Boolean(request.abortSignal);
      await delay(10);
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

  assertEqual(result.isError, false, "non-positive timeout keeps the existing unbounded opt-in worker path");
  assertEqual(senderCalled, true, "sender still runs when invalid timeout disables the new guard");
  assertEqual(signalSeen, false, "resolver does not receive a signal when timeout is disabled");
  assert(!containsForbiddenDurableTruth(result), "disabled-timeout success leaks no source refs, credentials, URLs, bytes, or signatures");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 125 Verification (External Media Transfer Source Resolve Timeout)\n");
  await verifySourceResolveTimeoutFailsRetryablyBeforeVendorSend();
  await verifyFastSourceResolutionStillSendsBoundedFiles();
  await verifyInvalidTimeoutOptionPreservesExistingWorkerBehavior();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 125: external media transfer source resolve timeout is GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });
