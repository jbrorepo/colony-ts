/** Phase 139 Verification - External Media Transfer Manual Retry Source Ref Fingerprints */

import { createHash } from "node:crypto";
import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferHandlerResult,
} from "./channel";

const SOURCE_REFS = [
  "artifact:phase139_report_1",
  "tool-result:phase139_lookup_2",
  "host-media:phase139_asset_3",
  "artifact:phase139_report_4",
  "tool-result:phase139_lookup_5",
  "host-media:phase139_asset_6",
] as const;

let passed = 0;
let failed = 0;
function assert(condition: boolean, label: string): void {
  if (condition) { console.log(`  PASS ${label}`); passed++; } else { console.error(`  FAIL ${label}`); failed++; }
}
function assertEqual<T>(actual: T, expected: T, label: string): void {
  assert(actual === expected, `${label}${actual === expected ? "" : ` - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}
function section(title: string): void { console.log(`\n${"=".repeat(60)}\n  ${title}\n${"=".repeat(60)}`); }

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T139",
    targetKind: "channel",
    targetId: "C139",
    threadId: "171000.1390",
    enabled: true,
    fileRefs: SOURCE_REFS.map((sourceRef, index) => ({
      sourceRef,
      name: `phase-139-${index + 1}.pdf`,
      title: `Phase 139 report ${index + 1}`,
      mimeType: "application/pdf",
      sizeBytes: 4096 + index,
      checksumSha256: "c".repeat(64),
    })),
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
      approvedAt: "2026-05-08T10:02:00.000Z",
      signature,
    },
  };
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

function containsForbiddenDurableTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase139") ||
    text.includes("tool-result:phase139") ||
    text.includes("host-media:phase139") ||
    text.includes("sourceRef\":\"artifact:") ||
    text.includes("sourceRef\":\"tool-result:") ||
    text.includes("sourceRef\":\"host-media:") ||
    text.includes("manual_retry_source_ref_request_context") ||
    text.includes("attemptNumber") ||
    text.includes("retryPolicy") ||
    text.includes("xoxb-phase139-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url") ||
    text.includes("raw-inline-byte-payload") ||
    text.includes("C:\\secret\\phase139");
}

function assertManualRetrySourceRefs(data: Record<string, unknown>, label: string): void {
  assertEqual(data.manualRetrySourceRefCount, 6, `${label}: retry source ref count preserves approval-bound candidate count`);
  assertEqual(data.manualRetrySourceRefsTruncated, true, `${label}: retry source refs report host action truncation`);
  assertEqual(data.manualRetrySourceRefTruth, "fingerprints_only_not_raw_refs_or_content_hashes", `${label}: retry source ref truth states fingerprint-only boundary`);
  assert(Array.isArray(data.manualRetrySourceRefFingerprints), `${label}: retry source ref fingerprints are present`);
  const fingerprints = Array.isArray(data.manualRetrySourceRefFingerprints)
    ? data.manualRetrySourceRefFingerprints
    : [];
  assertEqual(fingerprints.length, 5, `${label}: retry source ref fingerprints are bounded to host action refs`);

  fingerprints.forEach((item, index) => {
    const record = typeof item === "object" && item !== null ? item as Record<string, unknown> : {};
    assertEqual(record.fileIndex, index, `${label}: fingerprint ${index} carries bounded file index`);
    assertEqual(record.sourceRefFingerprint, sha256Hex(SOURCE_REFS[index]), `${label}: fingerprint ${index} is derived from approved source ref`);
    assertEqual(record.sourceRefRevalidationRequired, true, `${label}: fingerprint ${index} requires operator revalidation`);
    assertEqual("sourceRef" in record, false, `${label}: fingerprint ${index} does not persist raw source ref`);
  });
}

async function verifyRetryableSourceRejectionCarriesSourceRefFingerprints(): Promise<void> {
  section("1. Retryable Source Rejection Carries Source Ref Fingerprints");
  let senderCalled = false;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    sourceResolveMaxAttempts: 1,
    resolveSourceRef: async () => ({
      accepted: false,
      retryable: true,
      retryAfterSeconds: 17,
      reason: "temporary media store lock https://files.slack.com/private-download-url?token=xoxb-phase139-secret",
    }),
    sendToVendor: async (action) => {
      senderCalled = true;
      return { accepted: true, transferKey: action.transferKey, deliveredCount: 1 };
    },
  }));

  assertEqual(result.isError, true, "retryable source rejection remains a failed handoff");
  assertEqual(senderCalled, false, "retryable source rejection prevents vendor send");
  assertEqual(result.data.manualRetryStage, "source_resolution", "source retry stays source-resolution scoped");
  assertManualRetrySourceRefs(result.data, "source rejection");
  assert(!containsForbiddenDurableTruth(result), "source retry leaks no raw refs, request context, credentials, URLs, bytes, or signatures");
}

async function verifyRetryableVendorRejectionCarriesSourceRefFingerprints(): Promise<void> {
  section("2. Retryable Vendor Rejection Carries Source Ref Fingerprints");
  let senderCallCount = 0;
  const result = await executeWithWorker(createExternalChannelMediaTransferWorkerHandler({
    resolveSourceRef: async (request) => ({
      sourceRefFingerprint: request.sourceRefFingerprint,
      sizeBytes: request.sizeBytes,
    }),
    sendToVendor: async () => {
      senderCallCount++;
      return {
        accepted: false,
        retryable: true,
        retryAfterSeconds: 11,
        reason: "vendor rejected send at https://files.slack.com/private-download-url?token=xoxb-phase139-secret",
      };
    },
  }));

  assertEqual(result.isError, true, "retryable vendor rejection remains a failed handoff");
  assertEqual(senderCallCount, 1, "retryable vendor rejection is not automatically retried");
  assertEqual(result.data.manualRetryStage, "vendor_send", "vendor retry stays vendor-send scoped");
  assertManualRetrySourceRefs(result.data, "vendor rejection");
  assert(!containsForbiddenDurableTruth(result), "vendor retry leaks no raw refs, request context, credentials, URLs, bytes, or signatures");
}

async function verifyGenericRetryableHostRejectionCarriesSourceRefFingerprints(): Promise<void> {
  section("3. Generic Retryable Host Rejection Carries Source Ref Fingerprints");
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async () => ({
      accepted: false,
      retryable: true,
      retryAfterSeconds: 5,
      reason: "temporary host queue saturation",
    }),
  });

  assertEqual(result.isError, true, "generic retryable host result remains failed");
  assertEqual(result.data.nextOperatorAction, "Re-run the approved external media transfer after checking host-owned media stores, credentials, and vendor availability.", "generic retryable host result keeps generic next operator action");
  assertEqual("manualRetryStage" in result.data, false, "generic host rejection has no stage-specific safety");
  assertEqual("manualRetryNextOperatorAction" in result.data, false, "generic host rejection has no stage-specific next operator action");
  assertManualRetrySourceRefs(result.data, "generic host rejection");
  assert(!containsForbiddenDurableTruth(result), "generic retry leaks no raw refs, request context, credentials, URLs, bytes, or signatures");
}

async function verifyHostSuppliedSourceRefsCannotInfluenceDurableFingerprints(): Promise<void> {
  section("4. Host-supplied Source Refs Cannot Influence Durable Fingerprints");
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (): Promise<ExternalChannelMediaTransferHandlerResult & { manualRetrySafety: Record<string, unknown> }> => ({
      accepted: false,
      retryable: true,
      retryAfterSeconds: 7,
      reason: "temporary host queue saturation",
      manualRetrySafety: {
        retryStage: "vendor_send",
        automaticVendorRetryAllowed: true,
        manualRetrySourceRefFingerprints: [{
          fileIndex: 0,
          sourceRefFingerprint: "0".repeat(64),
          sourceRef: "artifact:phase139_report_1",
        }],
        sourceRef: "artifact:phase139_report_1",
        reason: "C:\\secret\\phase139 raw-inline-byte-payload",
      },
    }),
  });

  assertEqual(result.isError, true, "malicious host result remains failed");
  assertEqual(result.data.manualRetryStage, "vendor_send", "safe retry stage is preserved");
  assertEqual(result.data.automaticVendorRetryAllowed, false, "host cannot opt in automatic vendor retry");
  assertEqual(result.data.automaticVendorRetryAllowedRedacted, true, "unsafe automatic retry claim is redacted");
  assertManualRetrySourceRefs(result.data, "malicious host rejection");
  assert(!JSON.stringify(result.data).includes("\"sourceRefFingerprint\":\"0000000000000000000000000000000000000000000000000000000000000000\""), "host-injected fingerprint is not persisted");
  assert(!containsForbiddenDurableTruth(result), "malicious host retry leaks no raw refs, request context, credentials, URLs, bytes, or signatures");
}

async function verifyHandlerActionMutationCannotInfluenceDurableFingerprints(): Promise<void> {
  section("5. Handler Action Mutation Cannot Influence Durable Fingerprints");
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: async (action): Promise<ExternalChannelMediaTransferHandlerResult> => {
      action.files[0] = {
        ...action.files[0],
        sourceRefFingerprint: "0".repeat(64),
      };
      action.files.push({
        sourceRef: "artifact:phase139_mutated_extra",
        sourceRefFingerprint: "0".repeat(64),
      });
      const mutableAction = action as unknown as Record<string, unknown>;
      mutableAction.fileCount = 999;
      mutableAction.filesTruncated = false;
      return {
        accepted: false,
        retryable: true,
        retryAfterSeconds: 13,
        reason: "mutated handler action",
        foregroundRetry: {
          automaticRetryMode: "bounded_foreground_retry",
          retryStage: "source_resolution",
          retryStatus: "exhausted",
          retryAttemptCount: 1,
          maxAttemptCount: 2,
          fileCount: 999,
          sourceFileOutcomes: [{
            fileIndex: 0,
            sourceRefFingerprint: "0".repeat(64),
            retryStatus: "exhausted",
            retryAttemptCount: 1,
            maxAttemptCount: 2,
          }],
        },
      };
    },
  });

  assertEqual(result.isError, true, "mutating handler result remains failed");
  assertManualRetrySourceRefs(result.data, "mutating host rejection");
  assert(!JSON.stringify(result.data).includes("\"sourceRefFingerprint\":\"0000000000000000000000000000000000000000000000000000000000000000\""), "mutated handler fingerprint is not persisted");
  assert(!JSON.stringify(result.data).includes("0000000000000000000000000000000000000000000000000000000000000000"), "mutated handler foreground retry fingerprint is not persisted");
  assertEqual(result.data.manualRetrySourceRefCount, 6, "mutated handler cannot alter durable source ref count");
  assertEqual(result.data.manualRetrySourceRefsTruncated, true, "mutated handler cannot alter durable truncation truth");
  assert(!containsForbiddenDurableTruth(result), "mutating handler retry leaks no raw refs, request context, credentials, URLs, bytes, or signatures");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 139 Verification (External Media Transfer Manual Retry Source Ref Fingerprints)\n");
  await verifyRetryableSourceRejectionCarriesSourceRefFingerprints();
  await verifyRetryableVendorRejectionCarriesSourceRefFingerprints();
  await verifyGenericRetryableHostRejectionCarriesSourceRefFingerprints();
  await verifyHostSuppliedSourceRefsCannotInfluenceDurableFingerprints();
  await verifyHandlerActionMutationCannotInfluenceDurableFingerprints();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 139: external media transfer manual retry source-ref fingerprints are GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
