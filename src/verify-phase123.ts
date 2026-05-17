/** Phase 123 Verification - External Media Transfer Host Receipt Metadata */

import {
  createExternalChannelMediaTransferApprovalSignature,
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

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T123",
    targetKind: "channel",
    targetId: "C123",
    threadId: "171000.1230",
    enabled: true,
    fileRefs: [
      {
        sourceRef: "artifact:phase123_report",
        name: "phase-123-report.pdf",
        title: "Phase 123 report",
        mimeType: "application/pdf",
        sizeBytes: 4096,
        checksumSha256: "e".repeat(64),
      },
      {
        sourceRef: "tool-result:phase123_summary",
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
      approvedAt: "2026-05-08T06:02:00.000Z",
      signature,
    },
  };
}

function containsForbiddenDurableTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase123_report") ||
    text.includes("tool-result:phase123_summary") ||
    text.includes("channel-media-transfer:") ||
    text.includes("xoxb-phase123-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("raw-inline-byte-payload") ||
    text.includes("C:\\secret\\phase123");
}

async function verifySuccessReceiptIsBoundedAndClaimSafe(): Promise<void> {
  section("1. Success Receipt Is Bounded and Claim-Safe");
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (action) => ({
      accepted: true,
      transferKey: action.transferKey,
      deliveredCount: 999,
      vendorMessageId: "slack-phase123-message",
      receipt: {
        receiptId: "receipt-phase123-ok",
        status: "delivered",
        deliveredCount: 999,
        inspectedFileCount: 999,
      },
    }),
  });

  assertEqual(result.isError, false, "matching transfer key still succeeds");
  assertEqual(result.data.deliveredCount, 2, "top-level delivered count remains clamped to action files");
  assertEqual(result.data.hostReceiptSource, "host_reported", "receipt source is host reported");
  assertEqual(result.data.hostReceiptVerifiedByColony, false, "receipt does not claim Colony content verification");
  assertEqual(result.data.hostReceiptFilesInspectedByColony, false, "receipt does not claim Colony file inspection");
  assertEqual(result.data.hostReceiptId, "receipt-phase123-ok", "safe receipt id is preserved");
  assertEqual(result.data.hostReceiptStatus, "delivered", "safe receipt status is preserved");
  assertEqual(result.data.hostReceiptDeliveredCount, 2, "receipt delivered count is clamped");
  assertEqual(result.data.hostReceiptInspectedFileCount, 2, "receipt inspected count is clamped");
  assertEqual(result.data.liveDeliveryEnabled, false, "success still does not claim default live delivery");
  assertEqual(result.data.defaultPublicHostingEnabled, false, "success still does not claim public hosting");
  assert(!containsForbiddenDurableTruth(result), "success receipt leaks no raw refs, URLs, bytes, credentials, or paths");
}

async function verifyUnsafeReceiptFieldsAreRedactedAndNotPersisted(): Promise<void> {
  section("2. Unsafe Receipt Fields Are Redacted and Not Persisted");
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (action) => ({
      accepted: true,
      transferKey: action.transferKey,
      receipt: {
        receiptId: "receipt-token-phase123-secret https://files.slack.com/private-download-url?token=xoxb-phase123-secret",
        status: "Colony verified upload/download public hosting default live delivery via C:\\secret\\phase123",
        deliveredCount: -25,
        inspectedFileCount: Number.NaN,
        receiptUrl: "https://files.slack.com/private-download-url?token=xoxb-phase123-secret",
      },
    }),
  });

  assertEqual(result.isError, false, "unsafe receipt metadata does not fail otherwise successful host result");
  assertEqual(result.data.hostReceiptSource, "host_reported", "unsafe receipt still records host source");
  assertEqual(result.data.hostReceiptId, "[REDACTED_RECEIPT_ID]", "unsafe receipt id is redacted as a whole");
  assertEqual(result.data.hostReceiptIdRedacted, true, "receipt id redaction truth is recorded");
  assertEqual(result.data.hostReceiptStatus, "[REDACTED_RECEIPT_STATUS]", "claim-bearing receipt status is redacted as a whole");
  assertEqual(result.data.hostReceiptStatusRedacted, true, "receipt status redaction truth is recorded");
  assertEqual("hostReceiptDeliveredCount" in result.data, false, "invalid delivered count is omitted");
  assertEqual("hostReceiptInspectedFileCount" in result.data, false, "non-finite inspected count is omitted");
  assertEqual(result.data.hostReceiptUrlRedacted, true, "receipt URL redaction truth is recorded");
  assertEqual(result.data.hostReceiptUrlPersisted, false, "receipt URL is not persisted");
  assert(!containsForbiddenDurableTruth(result), "unsafe receipt fields leak no URL, token, path, or raw refs");
}

async function verifyNoReceiptPreservesExistingSuccessShape(): Promise<void> {
  section("3. No Receipt Preserves Existing Success Shape");
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (action) => ({
      accepted: true,
      transferKey: action.transferKey,
      deliveredCount: action.files.length,
    }),
  });

  assertEqual(result.isError, false, "success without receipt still succeeds");
  assertEqual("hostReceiptSource" in result.data, false, "success without receipt does not invent receipt metadata");
  assertEqual(result.data.retryable, false, "success without receipt remains non-retryable");
  assert(!containsForbiddenDurableTruth(result), "success without receipt leaks no raw refs or approval signatures");
}

async function verifyRejectedOrMismatchedResultsDoNotPreserveReceipt(): Promise<void> {
  section("4. Rejected or Mismatched Results Do Not Preserve Receipt");
  const { candidate, approval } = await approvedCandidate();
  const rejected = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (action) => ({
      accepted: false,
      transferKey: action.transferKey,
      retryable: true,
      receipt: {
        receiptId: "receipt-phase123-rejected",
        receiptUrl: "https://files.slack.com/private-download-url?token=xoxb-phase123-secret",
      },
    }),
  });
  const mismatched = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (action) => ({
      accepted: true,
      transferKey: `${action.transferKey}-stale`,
      receipt: {
        receiptId: "receipt-phase123-mismatch",
        receiptUrl: "https://files.slack.com/private-download-url?token=xoxb-phase123-secret",
      },
    }),
  });

  assertEqual(rejected.isError, true, "handler rejection remains failed");
  assertEqual("hostReceiptSource" in rejected.data, false, "handler rejection does not preserve receipt metadata");
  assertEqual(mismatched.isError, true, "transfer-key mismatch remains failed");
  assertEqual(mismatched.data.reasonCode, "transfer_key_mismatch", "mismatch reason stays stable");
  assertEqual("hostReceiptSource" in mismatched.data, false, "transfer-key mismatch does not preserve receipt metadata");
  assert(!containsForbiddenDurableTruth(rejected), "rejected receipt leaks no sensitive data");
  assert(!containsForbiddenDurableTruth(mismatched), "mismatched receipt leaks no sensitive data");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 123 Verification (External Media Transfer Host Receipt Metadata)\n");
  await verifySuccessReceiptIsBoundedAndClaimSafe();
  await verifyUnsafeReceiptFieldsAreRedactedAndNotPersisted();
  await verifyNoReceiptPreservesExistingSuccessShape();
  await verifyRejectedOrMismatchedResultsDoNotPreserveReceipt();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 123: external media transfer host receipt metadata is GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });
