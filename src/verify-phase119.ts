/** Phase 119 Verification - External Media Transfer Handoff Gate */

import {
  createExternalChannelMediaTransferApprovalSignature,
  executeExternalChannelMediaTransferHostRequest,
  planExternalChannelMediaTransfers,
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
    workspaceId: "T119",
    targetKind: "channel",
    targetId: "C119",
    threadId: "171000.1190",
    enabled: true,
    fileRefs: [
      {
        sourceRef: "artifact:art_phase119",
        name: "release-notes.pdf",
        title: "Release notes",
        mimeType: "application/pdf",
        sizeBytes: 1024,
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
      approvedAt: "2026-05-08T04:59:00.000Z",
      signature,
    },
  };
}

function containsSensitive(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("xoxb-phase119-secret") ||
    text.includes("xapp-phase119-secret") ||
    text.includes("files.slack.com") ||
    text.includes("example.com") ||
    text.includes("secret\\.env") ||
    text.includes("id_rsa") ||
    text.includes("C:\\") ||
    text.includes("raw-inline-byte-payload") ||
    text.includes("url_private") ||
    text.includes("contentBytes") ||
    text.includes("ContentBytes") ||
    text.includes("base64") ||
    text.includes("https://");
}

async function verifyPlanningRequiresExactApproval(): Promise<void> {
  section("1. Media Transfer Plans Require Exact Approval");
  const candidate = safeCandidate();
  const signature = await createExternalChannelMediaTransferApprovalSignature(candidate);
  const pending = await planExternalChannelMediaTransfers([candidate]);
  const selfMinted = await planExternalChannelMediaTransfers([{ ...candidate, approval: { approvedBy: "operator", signature } }]);
  const approved = await planExternalChannelMediaTransfers([candidate], {
    approvals: [{ approvedBy: "operator", signature }],
  });

  assertEqual(pending[0]?.accepted, false, "pending media transfer is not accepted");
  assertEqual(pending[0]?.requiredSignature, signature, "pending plan exposes required exact signature");
  assertEqual(selfMinted[0]?.accepted, false, "candidate-carried approval proof does not self-approve transfer");
  assertEqual(approved[0]?.accepted, true, "host-held matching approval accepts media transfer plan");
  assertEqual(approved[0]?.redactedConfig.fileCount, 1, "redacted plan exposes file count");
  assertEqual(approved[0]?.redactedConfig.filesTruncated, false, "redacted plan exposes truncation truth");
  assert(!containsSensitive([pending, approved]), "plans leak no tokens, URLs, or file bytes");
}

async function verifyUnsafeRefsAndBytesFailClosed(): Promise<void> {
  section("2. Unsafe Media Refs and Byte Payloads Fail Closed");
  const unsafeUrlPlan = await planExternalChannelMediaTransfers([safeCandidate({
    fileRefs: [{ sourceRef: "https://files.slack.com/private.pdf?token=xoxb-phase119-secret", name: "private.pdf" }],
  })]);
  const unsafePathPlan = await planExternalChannelMediaTransfers([safeCandidate({
    fileRefs: [{ sourceRef: "..\\secret\\.env", name: "secret.env" }],
  })]);
  const bytePayloadPlan = await planExternalChannelMediaTransfers([safeCandidate({
    fileRefs: [{
      sourceRef: "artifact:art_phase119",
      name: "C:\\Users\\operator\\.ssh\\id_rsa",
      title: "https://example.com/signed/object?token=xoxb-phase119-secret",
      contentBytes: "xoxb-phase119-secret",
      ContentBytes: "raw-inline-byte-payload",
      base64: "eG94Yi1waGFzZTExOS1zZWNyZXQ=",
    } as unknown as ExternalChannelMediaTransferCandidate["fileRefs"][number]],
  })]);

  assertEqual(unsafeUrlPlan[0]?.accepted, false, "private URL source ref is rejected");
  assertEqual(unsafePathPlan[0]?.accepted, false, "path-like source ref is rejected");
  assertEqual(bytePayloadPlan[0]?.accepted, false, "inline byte payload is rejected");
  assert(!containsSensitive([unsafeUrlPlan, unsafePathPlan, bytePayloadPlan]), "unsafe plan diagnostics are redacted");
}

async function verifyHostHandlerReceivesCredentialFreeAction(): Promise<void> {
  section("3. Host Handler Receives Credential-free Action");
  const { candidate, approval } = await approvedCandidate();
  let seen: ExternalChannelMediaTransferHostAction | undefined;
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (action) => {
      seen = action;
      return { accepted: true, transferKey: action.transferKey, deliveredCount: action.files.length, vendorMessageId: "slack-msg-119" };
    },
  });

  assertEqual(result.isError, false, "approved media transfer handler succeeds");
  assertEqual(result.data.action, "channels_external_media_transfer_executed", "success action is media transfer executed");
  assertEqual(result.data.liveDeliveryEnabled, false, "success data does not claim default live delivery");
  assertEqual(seen?.channelId, "slack", "handler receives channel id");
  assertEqual(seen?.files.length, 1, "handler receives one sanitized file ref");
  assertEqual(seen?.files[0]?.sourceRef, "artifact:art_phase119", "handler receives safe artifact source ref");
  assert(!("approval" in (seen as unknown as Record<string, unknown>)), "handler action carries no approval object");
  assert(!containsSensitive([result, seen]), "handler result and action leak no token, URL, or bytes");
}

async function verifyMissingOrAmbiguousHostInputsFailClosed(): Promise<void> {
  section("4. Missing or Ambiguous Host Inputs Fail Closed");
  const { candidate, approval } = await approvedCandidate();
  const alternate = await approvedCandidate({ targetId: "C119B" });
  const missingHandler = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
  });
  const ambiguous = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate, alternate.candidate],
    approvals: [approval, alternate.approval],
    mediaTransferHandler: async (action) => ({ accepted: true, transferKey: action.transferKey, deliveredCount: action.files.length }),
  });

  assertEqual(missingHandler.isError, true, "missing host handler rejects transfer");
  assertEqual(missingHandler.data.reasonCode, "missing_handler", "missing handler reason is stable");
  assertEqual(ambiguous.isError, true, "ambiguous approved candidates reject transfer");
  assertEqual(ambiguous.data.reasonCode, "ambiguous_candidate", "ambiguous reason is stable");
  assert(!containsSensitive([missingHandler, ambiguous]), "failure paths leak no sensitive media data");
}

async function verifyMutationAfterApprovalInvalidatesTransfer(): Promise<void> {
  section("5. Mutating Candidate After Approval Invalidates Transfer");
  const { candidate, approval } = await approvedCandidate();
  candidate.fileRefs[0]!.name = "changed-after-approval.pdf";
  let handlerCalled = false;
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (action) => {
      handlerCalled = true;
      return { accepted: true, transferKey: action.transferKey, deliveredCount: action.files.length };
    },
  });

  assertEqual(result.isError, true, "mutated approved candidate is rejected");
  assertEqual(result.data.reasonCode, "approval_required", "mutated candidate requires fresh approval");
  assertEqual(handlerCalled, false, "handler is not called after approval mismatch");
}

async function verifyFileMetadataBoundsAndRedaction(): Promise<void> {
  section("6. File Metadata Is Bounded and Redacted");
  const files = Array.from({ length: 7 }, (_, index) => ({
    sourceRef: `artifact:art_phase119_${index}`,
    name: index === 1 ? "xoxb-phase119-secret-notes.txt" : "x".repeat(500),
    title: index === 2 ? "https://example.com/signed/object" : `https://files.slack.com/private/${index}`,
    mimeType: "application/octet-stream",
    sizeBytes: index,
  }));
  const { candidate, approval } = await approvedCandidate({ fileRefs: files });
  let seen: ExternalChannelMediaTransferHostAction | undefined;
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (action) => {
      seen = action;
      return { accepted: true, transferKey: action.transferKey, deliveredCount: action.files.length };
    },
  });

  assertEqual(result.isError, false, "bounded multi-file transfer action succeeds");
  assertEqual(seen?.files.length, 5, "host action carries at most five file refs");
  assertEqual(result.data.fileCount, 7, "result preserves full file count truth");
  assertEqual(result.data.filesTruncated, true, "result reports truncation");
  assertEqual(seen?.files[1]?.name, "[REDACTED].txt", "token-like file name is redacted");
  assertEqual(seen?.files[2]?.title, "[REDACTED_URL]", "generic signed URL in title is redacted");
  assert(String(seen?.files[0]?.name ?? "").length <= 160, "file name is length bounded");
  assert(!containsSensitive([result, seen]), "bounded media action leaks no token or private URL");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 119 Verification (External Media Transfer Handoff Gate)\n");
  await verifyPlanningRequiresExactApproval();
  await verifyUnsafeRefsAndBytesFailClosed();
  await verifyHostHandlerReceivesCredentialFreeAction();
  await verifyMissingOrAmbiguousHostInputsFailClosed();
  await verifyMutationAfterApprovalInvalidatesTransfer();
  await verifyFileMetadataBoundsAndRedaction();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 119: external media transfer handoff gate is GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });
