/** Phase 121 Verification - External Media Transfer Result Binding */

import {
  createExternalChannelMediaTransferApprovalSignature,
  executeExternalChannelMediaTransferHostRequest,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferHandlerResult,
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
    workspaceId: "T121",
    targetKind: "channel",
    targetId: "C121",
    threadId: "171000.1210",
    enabled: true,
    fileRefs: [
      {
        sourceRef: "artifact:phase121_report",
        name: "phase-121-report.pdf",
        title: "Phase 121 report",
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
      approvedAt: "2026-05-08T05:29:00.000Z",
      signature,
    },
  };
}

function containsForbiddenDurableTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase121_report") ||
    text.includes("channel-media-transfer:") ||
    text.includes("xoxb-phase121-secret") ||
    text.includes("token:phase121-secret") ||
    text.includes("credential:phase121-secret") ||
    text.includes("signature:phase121-secret") ||
    text.includes("secret:phase121-secret") ||
    text.includes("https://") ||
    text.includes("files.slack.com") ||
    text.includes("raw-inline-byte-payload");
}

async function verifyMatchingTransferKeyEchoSucceeds(): Promise<void> {
  section("1. Matching Transfer Key Echo Binds Success");
  const { candidate, approval } = await approvedCandidate();
  let seen: ExternalChannelMediaTransferHostAction | undefined;
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (action) => {
      seen = action;
      return {
        accepted: true,
        deliveredCount: action.files.length,
        transferKey: action.transferKey,
        vendorMessageId: "slack-phase121-message",
      } as ExternalChannelMediaTransferHandlerResult & { transferKey: string };
    },
  });

  assertEqual(result.isError, false, "matching transfer key echo reports success");
  assertEqual(result.data.action, "channels_external_media_transfer_executed", "success action remains stable");
  assertEqual(result.data.transferKey, seen?.transferKey, "result carries current transfer key");
  assertEqual(result.data.transferKeyEchoMatched, true, "result records matched transfer key echo");
  assertEqual(result.data.liveDeliveryEnabled, false, "success still does not claim default live delivery");
  assert(!containsForbiddenDurableTruth(result.data), "success data leaks no raw refs or approval signatures");
}

async function verifyUnsafeVendorMessageIdIsRedactedAfterMatchingEcho(): Promise<void> {
  section("2. Unsafe Vendor Message Id Is Redacted After Matching Echo");
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (action) => ({
      accepted: true,
      transferKey: action.transferKey,
      deliveredCount: action.files.length,
      vendorMessageId: "artifact:phase121_report raw-inline-byte-payload https://files.slack.com/private?token=xoxb-phase121-secret",
    }),
  });

  assertEqual(result.isError, false, "matching transfer key still allows host success");
  assertEqual(result.data.vendorMessageId, "[REDACTED_VENDOR_MESSAGE_ID]", "unsafe vendor message id is redacted as a whole");
  assertEqual(result.data.vendorMessageIdRedacted, true, "result records vendor message id redaction");
  assert(!containsForbiddenDurableTruth(result), "matching echo success leaks no unsafe vendor message id content");
}

async function verifyCredentialKeywordVendorMessageIdsAreRedacted(): Promise<void> {
  section("3. Credential Keyword Vendor Message Ids Are Redacted");
  const credentialIds = [
    "token:phase121-secret",
    "credential:phase121-secret",
    "signature:phase121-secret",
    "secret:phase121-secret",
  ];

  for (const vendorMessageId of credentialIds) {
    const { candidate, approval } = await approvedCandidate({
      threadId: `171000.121-${credentialIds.indexOf(vendorMessageId)}`,
    });
    const result = await executeExternalChannelMediaTransferHostRequest({
      channelId: "slack",
      candidates: [candidate],
      approvals: [approval],
      mediaTransferHandler: async (action) => ({
        accepted: true,
        transferKey: action.transferKey,
        deliveredCount: action.files.length,
        vendorMessageId,
      }),
    });

    assertEqual(result.isError, false, `${vendorMessageId} still allows matching host success`);
    assertEqual(result.data.vendorMessageId, "[REDACTED_VENDOR_MESSAGE_ID]", `${vendorMessageId} is redacted`);
    assertEqual(result.data.vendorMessageIdRedacted, true, `${vendorMessageId} records redaction`);
    assert(!containsForbiddenDurableTruth(result), `${vendorMessageId} does not leak`);
  }
}

async function verifyMissingTransferKeyEchoFailsClosed(): Promise<void> {
  section("4. Missing Transfer Key Echo Fails Closed");
  const { candidate, approval } = await approvedCandidate();
  let handlerCalled = false;
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (action) => {
      handlerCalled = true;
      return { accepted: true, deliveredCount: action.files.length, vendorMessageId: "slack-phase121-stale" };
    },
  });

  assertEqual(handlerCalled, true, "handler is called before echo validation");
  assertEqual(result.isError, true, "missing transfer key echo rejects accepted handler result");
  assertEqual(result.data.reasonCode, "transfer_key_mismatch", "missing echo uses stable mismatch reason");
  assertEqual("vendorMessageId" in result.data, false, "rejected result does not report vendor message id");
  assertEqual(result.data.retryable, false, "missing echo is non-retryable integrity failure");
  assert(!containsForbiddenDurableTruth(result.data), "missing echo rejection leaks no raw refs or approval signatures");
}

async function verifyWrongTransferKeyEchoFailsClosed(): Promise<void> {
  section("5. Wrong Transfer Key Echo Fails Closed");
  const { candidate, approval } = await approvedCandidate();
  let actualTransferKey = "";
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (action) => {
      actualTransferKey = action.transferKey;
      return {
        accepted: true,
        deliveredCount: action.files.length,
        transferKey: "media-transfer:" + "0".repeat(64),
        vendorMessageId: "https://files.slack.com/private?token=xoxb-phase121-secret",
      } as ExternalChannelMediaTransferHandlerResult & { transferKey: string };
    },
  });

  assert(/^media-transfer:[a-f0-9]{64}$/.test(actualTransferKey), "handler saw a bounded transfer key");
  assertEqual(result.isError, true, "wrong transfer key echo rejects accepted handler result");
  assertEqual(result.data.reasonCode, "transfer_key_mismatch", "wrong echo uses stable mismatch reason");
  assertEqual(result.data.transferKey, actualTransferKey, "mismatch result identifies current transfer key only");
  assertEqual("vendorMessageId" in result.data, false, "wrong echo rejection does not preserve vendor message id");
  assert(!containsForbiddenDurableTruth(result), "wrong echo rejection leaks no token, URL, refs, or approval signatures");
}

async function verifyRejectedHandlerDoesNotNeedEcho(): Promise<void> {
  section("6. Rejected Handler Result Does Not Need Echo");
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async () => ({
      accepted: false,
      reason: "upload failed for https://files.slack.com/private?token=xoxb-phase121-secret",
    }),
  });

  assertEqual(result.isError, true, "handler rejection remains an ordinary rejection");
  assertEqual(result.data.reasonCode, "handler_rejected", "handler rejection does not become transfer key mismatch");
  assert(!containsForbiddenDurableTruth(result), "handler rejection is redacted");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 121 Verification (External Media Transfer Result Binding)\n");
  await verifyMatchingTransferKeyEchoSucceeds();
  await verifyUnsafeVendorMessageIdIsRedactedAfterMatchingEcho();
  await verifyCredentialKeywordVendorMessageIdsAreRedacted();
  await verifyMissingTransferKeyEchoFailsClosed();
  await verifyWrongTransferKeyEchoFailsClosed();
  await verifyRejectedHandlerDoesNotNeedEcho();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 121: external media transfer result binding is GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });
