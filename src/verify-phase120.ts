/** Phase 120 Verification - External Media Transfer Handoff Keys */

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
    workspaceId: "T120",
    targetKind: "channel",
    targetId: "C120",
    threadId: "171000.1200",
    enabled: true,
    fileRefs: [
      {
        sourceRef: "artifact:phase120_report",
        name: "phase-120-report.pdf",
        title: "Phase 120 report",
        mimeType: "application/pdf",
        sizeBytes: 2048,
        checksumSha256: "b".repeat(64),
      },
      {
        sourceRef: "tool-result:phase120_summary",
        name: "summary.txt",
        mimeType: "text/plain",
        sizeBytes: 512,
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
      approvedAt: "2026-05-08T05:18:00.000Z",
      signature,
    },
  };
}

function containsForbiddenDurableTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase120_report") ||
    text.includes("tool-result:phase120_summary") ||
    text.includes("channel-media-transfer:") ||
    text.includes("xoxb-phase120-secret") ||
    text.includes("https://") ||
    text.includes("files.slack.com") ||
    text.includes("raw-inline-byte-payload");
}

function containsForbiddenPlanMediaTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase120_report") ||
    text.includes("tool-result:phase120_summary") ||
    text.includes("xoxb-phase120-secret") ||
    text.includes("https://") ||
    text.includes("files.slack.com") ||
    text.includes("raw-inline-byte-payload");
}

async function executeAndCapture(
  candidate: ExternalChannelMediaTransferCandidate,
  approval: ExternalChannelMediaTransferApproval,
): Promise<{ result: Awaited<ReturnType<typeof executeExternalChannelMediaTransferHostRequest>>; action: ExternalChannelMediaTransferHostAction | undefined }> {
  let action: ExternalChannelMediaTransferHostAction | undefined;
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (hostAction) => {
      action = hostAction;
      return {
        accepted: true,
        transferKey: hostAction.transferKey,
        deliveredCount: hostAction.files.length,
        vendorMessageId: "slack-phase120-message",
      };
    },
  });
  return { result, action };
}

async function verifyStableHandoffKey(): Promise<void> {
  section("1. Host Handoff Key Is Stable and Approval-free");
  const { candidate, approval } = await approvedCandidate();
  const first = await executeAndCapture(candidate, approval);
  const second = await executeAndCapture(candidate, approval);
  const changedTarget = await approvedCandidate({ targetId: "C120B" });
  const changed = await executeAndCapture(changedTarget.candidate, changedTarget.approval);
  const firstAction = first.action as unknown as { transferKey?: string; files?: Array<{ sourceRefFingerprint?: string }> };
  const secondAction = second.action as unknown as { transferKey?: string };
  const changedAction = changed.action as unknown as { transferKey?: string };

  assertEqual(first.result.isError, false, "approved handoff succeeds");
  assert(typeof firstAction.transferKey === "string" && /^media-transfer:[a-f0-9]{64}$/.test(firstAction.transferKey), "host action carries bounded transfer key");
  assertEqual(firstAction.transferKey, secondAction.transferKey, "same approved handoff produces stable transfer key");
  assert(firstAction.transferKey !== changedAction.transferKey, "target change produces a different transfer key");
  assert(!String(firstAction.transferKey).includes("channel-media-transfer:"), "transfer key is not an approval signature");
  assert(!containsForbiddenDurableTruth(first.result.data), "success result data excludes raw refs and approval signatures");
}

async function verifyHandoffKeyBindsAllApprovalFiles(): Promise<void> {
  section("2. Handoff Key Binds Files Beyond Host-action Truncation");
  const filesA = Array.from({ length: 6 }, (_, index) => ({
    sourceRef: `artifact:phase120_file_${index}`,
    name: `file-${index}.txt`,
    mimeType: "text/plain",
    sizeBytes: index + 1,
  }));
  const filesB = filesA.map((file, index) => index === 5 ? { ...file, sourceRef: "artifact:phase120_file_changed_5" } : file);
  const first = await approvedCandidate({ fileRefs: filesA });
  const second = await approvedCandidate({ fileRefs: filesB });
  const firstRun = await executeAndCapture(first.candidate, first.approval);
  const secondRun = await executeAndCapture(second.candidate, second.approval);
  const firstAction = firstRun.action as unknown as { transferKey?: string; files?: unknown[]; filesTruncated?: boolean };
  const secondAction = secondRun.action as unknown as { transferKey?: string };

  assertEqual(firstAction.files?.length, 5, "host action still truncates executable refs to five");
  assertEqual(firstAction.filesTruncated, true, "host action reports truncation truth");
  assert(firstAction.transferKey !== secondAction.transferKey, "sixth-file change produces a different transfer key");
}

async function verifyPerFileFingerprints(): Promise<void> {
  section("3. File Fingerprints Are Safe and Deterministic");
  const { candidate, approval } = await approvedCandidate();
  const first = await executeAndCapture(candidate, approval);
  const second = await executeAndCapture(candidate, approval);
  const firstFiles = ((first.action as unknown as { files?: Array<{ sourceRef?: string; sourceRefFingerprint?: string }> }).files ?? []);
  const secondFiles = ((second.action as unknown as { files?: Array<{ sourceRefFingerprint?: string }> }).files ?? []);

  assertEqual(firstFiles.length, 2, "host action still carries safe refs for host resolution");
  assertEqual(firstFiles[0]?.sourceRef, "artifact:phase120_report", "host action preserves safe internal source ref for host resolver");
  assert(typeof firstFiles[0]?.sourceRefFingerprint === "string" && /^[a-f0-9]{64}$/.test(firstFiles[0]?.sourceRefFingerprint), "file carries SHA-256 source ref fingerprint");
  assertEqual(firstFiles[0]?.sourceRefFingerprint, secondFiles[0]?.sourceRefFingerprint, "file fingerprint is deterministic");
  assert(firstFiles[0]?.sourceRefFingerprint !== firstFiles[1]?.sourceRefFingerprint, "distinct refs produce distinct fingerprints");
  assert(!containsForbiddenDurableTruth(first.result.data), "result data does not persist host source refs");
}

async function verifyPlanHandoffChecklist(): Promise<void> {
  section("4. Plan Exposes Claim-safe Handoff Checklist");
  const { candidate, approval } = await approvedCandidate();
  const [plan] = await planExternalChannelMediaTransfers([candidate], { approvals: [approval] });
  const checklist = (plan?.redactedConfig as { handoffChecklist?: unknown }).handoffChecklist;
  const text = JSON.stringify(checklist);

  assertEqual(plan?.accepted, true, "approved plan remains accepted");
  assert(Array.isArray(checklist), "redacted plan exposes operator handoff checklist");
  assert(text.includes("host resolves internal file refs"), "checklist makes host-owned ref resolution explicit");
  assert(text.includes("no Colony fetch/download/upload worker"), "checklist avoids false upload/download worker claims");
  assert(text.includes("not Colony-verified content hashes"), "checklist avoids false content-verification claims");
  assert(text.includes("checksum metadata is candidate-provided"), "checklist disclaims candidate-provided checksum metadata");
  assert(!containsForbiddenPlanMediaTruth(plan), "plan does not leak raw source refs or unsafe media truth");
}

async function verifyApprovalStillHostHeld(): Promise<void> {
  section("5. Candidate-carried Approval Still Does Not Self-approve");
  const candidate = safeCandidate();
  const signature = await createExternalChannelMediaTransferApprovalSignature(candidate);
  const [plan] = await planExternalChannelMediaTransfers([{ ...candidate, approval: { approvedBy: "operator", signature } }]);
  let handlerCalled = false;
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [{ ...candidate, approval: { approvedBy: "operator", signature } }],
    mediaTransferHandler: async (action) => {
      handlerCalled = true;
      return { accepted: true, deliveredCount: action.files.length };
    },
  });

  assertEqual(plan?.accepted, false, "candidate-carried approval remains pending");
  assertEqual(result.isError, true, "execution rejects missing host-held approval");
  assertEqual(handlerCalled, false, "handler is not called without host-held approval");
  assert(!containsForbiddenDurableTruth(result.data), "rejection data excludes signatures and raw refs");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 120 Verification (External Media Transfer Handoff Keys)\n");
  await verifyStableHandoffKey();
  await verifyHandoffKeyBindsAllApprovalFiles();
  await verifyPerFileFingerprints();
  await verifyPlanHandoffChecklist();
  await verifyApprovalStillHostHeld();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 120: external media transfer handoff keys are GREEN.");
}

main().catch((error) => { console.error(error); process.exit(1); });
