/** Phase 153 Verification - External Media Transfer Manual Retry Source Revalidation Checklist Acknowledgement Preflight */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgement,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgement,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  type ExternalChannelMediaTransferManualRetryWorkItem,
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

function fileRefs(prefix = "phase153_report", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-153-report-${index}.pdf`,
    title: `Phase 153 report ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 4096 + index,
    checksumSha256: `${(index + 1).toString(16)}`.repeat(64),
  }));
}

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T153PRIVATE",
    accountId: "A153PRIVATE",
    targetKind: "channel",
    targetId: "C153PRIVATE",
    threadId: "171000.1530",
    enabled: true,
    fileRefs: fileRefs(),
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
      approvedAt: "2026-05-08T13:40:00.000Z",
      signature,
    },
  };
}

function workItem(data: Record<string, unknown>): ExternalChannelMediaTransferManualRetryWorkItem {
  const item = data.manualRetryWorkItem;
  assert(Boolean(item) && typeof item === "object" && !Array.isArray(item), "retryable failure exposes manual retry work item");
  return item as ExternalChannelMediaTransferManualRetryWorkItem;
}

async function sourceRetryFixture(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}) {
  const { candidate, approval } = await approvedCandidate(overrides);
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      sourceResolveMaxAttempts: 1,
      resolveSourceRef: async () => ({
        accepted: false,
        retryable: true,
        retryAfterSeconds: 17,
        reason: "source locked artifact:phase153_report_0 https://files.slack.com/private?token=xoxb-phase153-secret",
      }),
      sendToVendor: async (action) => ({ accepted: true, transferKey: action.transferKey, deliveredCount: 1 }),
    }),
  });
  return { candidate, approval, item: workItem(result.data) };
}

async function vendorRetryFixture() {
  const { candidate, approval } = await approvedCandidate();
  const result = await executeExternalChannelMediaTransferHostRequest({
    channelId: "slack",
    candidates: [candidate],
    approvals: [approval],
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => ({
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
      }),
      sendToVendor: async () => ({
        accepted: false,
        retryable: true,
        retryAfterSeconds: 29,
        reason: "vendor ambiguous targetId=C153PRIVATE retry-ledger://phase153-forged",
      }),
    }),
  });
  return { candidate, approval, item: workItem(result.data) };
}

async function templateFor(
  candidate: ExternalChannelMediaTransferCandidate,
  approval: ExternalChannelMediaTransferApproval,
  item: ExternalChannelMediaTransferManualRetryWorkItem,
): Promise<{
  checklist: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist;
  template: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate;
}> {
  const checklistResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist({
    candidate,
    approval,
    workItem: item,
    freshApprovalRequiredAfter: "2026-05-08T13:39:59.000Z",
  });
  assertEqual(checklistResult.accepted, true, "fixture source revalidation checklist is accepted");
  assert(Boolean(checklistResult.sourceRevalidationChecklist), "fixture includes source revalidation checklist");
  const templateResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklistResult.sourceRevalidationChecklist,
    freshApprovalRequiredAfter: "2026-05-08T13:39:59.000Z",
  });
  assertEqual(templateResult.accepted, true, "fixture acknowledgement template is accepted");
  assert(Boolean(templateResult.acknowledgementTemplate), "fixture includes acknowledgement template");
  return {
    checklist: checklistResult.sourceRevalidationChecklist as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
    template: templateResult.acknowledgementTemplate as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  };
}

function acknowledgementId(template: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate): string {
  return template.acknowledgementTemplateId.replace("manual-retry-source-checklist-ack-template:", "manual-retry-source-checklist-ack:");
}

function acknowledgementFor(
  template: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
): ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgement {
  return {
    acknowledgementKind: "external_media_transfer_manual_retry_source_revalidation_checklist_acknowledgement",
    acknowledgementVersion: 1,
    acknowledgementId: acknowledgementId(template),
    acknowledgementTemplateId: template.acknowledgementTemplateId,
    checklistId: template.checklistId,
    retryStage: template.retryStage,
    workItemCorrelationId: template.workItemCorrelationId,
    transferKey: template.transferKey,
    sourceRefsTruncated: template.sourceRefsTruncated,
    sourceRefFingerprints: template.sourceRefFingerprints,
    acknowledgedStepCount: template.requiredStepCount,
    stepAcknowledgements: template.requiredStepAcknowledgements.map((step) => ({
      stepIndex: step.stepIndex,
      actionCode: step.actionCode,
      ...(step.fileIndex !== undefined ? { fileIndex: step.fileIndex } : {}),
      ...(step.sourceRefFingerprint ? { sourceRefFingerprint: step.sourceRefFingerprint } : {}),
      acknowledged: true,
      hostOwned: true,
      colonyExecuted: false,
      rawSourceRefIncluded: false,
      rawTargetIncluded: false,
      approvalSignatureIncluded: false,
      credentialIncluded: false,
      fileBytesIncluded: false,
      privateUrlIncluded: false,
      persisted: false,
    })),
    allRequiredStepsAcknowledged: true,
    requiresFreshApprovalSignature: true,
    requiresSourceRefRevalidation: true,
    requiresFreshSourceResolution: true,
    mustNotReuseResolvedFiles: true,
    requiresVendorStateCheck: template.requiresVendorStateCheck,
    hostExecutionRequired: true,
    colonyResolvedSources: false,
    colonyFetchedFiles: false,
    colonyDownloadedFiles: false,
    colonyUploadedFiles: false,
    colonyPreviewedFiles: false,
    sourceRevalidationPersisted: false,
    checklistPersisted: false,
    acknowledgementPersisted: false,
    workItemPersisted: false,
    retryLedgerCreated: false,
    durableRetryAuditRecordCreated: false,
    backgroundRetryCreated: false,
    retryWorkerCreated: false,
    retryScheduleCreated: false,
    automaticVendorRetryAllowed: false,
    credentialPersistenceCreated: false,
    defaultLiveDeliveryEnabled: false,
    publicHostingEnabled: false,
    acknowledgementTruth: "host_owned_acknowledgement_only_no_execution_or_persistence",
  };
}

function containsForbiddenTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase153_report") ||
    text.includes("artifact:phase153_alt") ||
    text.includes("T153PRIVATE") ||
    text.includes("A153PRIVATE") ||
    text.includes("C153PRIVATE") ||
    text.includes("C153PRIVATE_ALT") ||
    text.includes("171000.1530") ||
    text.includes("channel-media-transfer:") ||
    text.includes("manual-retry-work-item:host-forged") ||
    text.includes("retry-ledger://phase153-forged") ||
    text.includes("durable-audit://phase153-forged") ||
    text.includes("xoxb-phase153-secret") ||
    text.includes("https://files.slack.com") ||
    text.includes("private-download-url");
}

async function verifySourceAcknowledgementPreflightAccepted(): Promise<void> {
  section("1. Source Checklist Acknowledgement Preflight Accepts Current Truth");
  const { candidate, approval, item } = await sourceRetryFixture();
  const { checklist, template } = await templateFor(candidate, approval, item);
  const acknowledgement = acknowledgementFor(template);
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgement({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    freshApprovalRequiredAfter: "2026-05-08T13:39:59.000Z",
  });

  assertEqual(result.accepted, true, "source acknowledgement preflight is accepted");
  assertEqual(result.acknowledgementTemplateResult.accepted, true, "source acknowledgement preflight includes accepted template result");
  assert(Boolean(result.acknowledgement), "source acknowledgement preflight returns sanitized acknowledgement");
  assertEqual(result.acknowledgementId, acknowledgement.acknowledgementId, "source acknowledgement id is preserved after sanitization");
  assertEqual(result.expectedAcknowledgementId, acknowledgement.acknowledgementId, "source expected acknowledgement id matches current template truth");
  assertEqual(result.acknowledgementIdMatched, true, "source acknowledgement id match is explicit");
  assertEqual(result.acknowledgementTemplateIdMatched, true, "source acknowledgement template id match is explicit");
  assertEqual(result.checklistIdMatched, true, "source checklist id match is explicit");
  assertEqual(result.stepAcknowledgementsMatched, true, "source step acknowledgements match template requirements");
  assertEqual(result.allRequiredStepsAcknowledged, true, "source all-required-steps acknowledgement is explicit");
  assertEqual(result.acknowledgement?.acknowledgementPersisted, false, "source acknowledgement is not persisted");
  assertEqual(result.acknowledgement?.retryWorkerCreated, false, "source acknowledgement creates no retry worker");
  assertEqual(result.acknowledgement?.retryLedgerCreated, false, "source acknowledgement creates no retry ledger");
  assertEqual(result.acknowledgement?.automaticVendorRetryAllowed, false, "source acknowledgement allows no automatic vendor retry");
  assertEqual(result.acknowledgementPreflightTruth, "recomputed_from_current_acknowledgement_template_and_supplied_acknowledgement_no_execution", "source acknowledgement preflight truth is explicit");
  assert(!containsForbiddenTruth(result), "source acknowledgement preflight leaks no raw refs, target ids, signatures, URLs, secrets, or ledgers");
}

async function verifyVendorAcknowledgementPreflightAccepted(): Promise<void> {
  section("2. Vendor Checklist Acknowledgement Preflight Preserves Vendor State Requirement");
  const { candidate, approval, item } = await vendorRetryFixture();
  const { checklist, template } = await templateFor(candidate, approval, item);
  const acknowledgement = acknowledgementFor(template);
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgement({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    acknowledgement,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T13:39:59.000Z",
  });

  const vendorAcknowledgement = result.acknowledgement?.stepAcknowledgements.find((step) => step.actionCode === "verify_vendor_state_before_reinvoke");
  assertEqual(result.accepted, true, "vendor acknowledgement preflight is accepted");
  assertEqual(result.requiresVendorStateCheck, true, "vendor acknowledgement preflight requires vendor-state check");
  assert(Boolean(vendorAcknowledgement), "vendor acknowledgement includes vendor-state acknowledgement");
  assertEqual(vendorAcknowledgement?.acknowledged, true, "vendor-state step is acknowledged");
  assertEqual(vendorAcknowledgement?.colonyExecuted, false, "vendor-state acknowledgement executes no Colony host handler");
  assert(!containsForbiddenTruth(result), "vendor acknowledgement preflight leaks no raw refs, target ids, signatures, URLs, secrets, or ledgers");
}

async function verifyTamperedAcknowledgementRejected(): Promise<void> {
  section("3. Tampered Acknowledgement Rejects Current Truth Mismatch");
  const { candidate, approval, item } = await sourceRetryFixture();
  const { checklist, template } = await templateFor(candidate, approval, item);
  const acknowledgement = acknowledgementFor(template);
  const tampered = {
    ...acknowledgement,
    stepAcknowledgements: acknowledgement.stepAcknowledgements.map((step, index) => index === 0
      ? { ...step, actionCode: "run_host_owned_manual_reinvoke" as const }
      : step),
  };
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgement({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: tampered,
    freshApprovalRequiredAfter: "2026-05-08T13:39:59.000Z",
  });

  assertEqual(result.accepted, false, "tampered acknowledgement preflight is rejected");
  assertEqual(result.reasonCode, "source_revalidation_checklist_acknowledgement_current_truth_mismatch", "tampered acknowledgement rejection is bounded");
  assertEqual(result.stepAcknowledgementsMatched, false, "tampered step acknowledgement mismatch is explicit");
  assert(result.acknowledgement === undefined, "tampered acknowledgement is not returned as accepted truth");
  assert(!containsForbiddenTruth(result), "tampered acknowledgement rejection leaks no raw truth");
}

async function verifyTruncationClaimMismatchRejected(): Promise<void> {
  section("4. Source Truncation Claim Mismatch Rejects Acknowledgement");
  const { candidate, approval, item } = await sourceRetryFixture({
    fileRefs: fileRefs("phase153_alt", 7),
  });
  const { checklist, template } = await templateFor(candidate, approval, item);
  const acknowledgement = acknowledgementFor(template);
  assertEqual(template.sourceRefsTruncated, true, "fixture acknowledgement template carries source truncation truth");
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgement({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: {
      ...acknowledgement,
      sourceRefsTruncated: false,
    },
    freshApprovalRequiredAfter: "2026-05-08T13:39:59.000Z",
  });

  assertEqual(result.accepted, false, "truncation-mismatch acknowledgement preflight is rejected");
  assertEqual(result.reasonCode, "source_revalidation_checklist_acknowledgement_current_truth_mismatch", "truncation-mismatch acknowledgement rejection is bounded");
  assertEqual(result.sourceRefsTruncatedMatched, false, "truncation mismatch is explicit");
  assert(result.acknowledgement === undefined, "truncation-mismatch acknowledgement is not returned");
  assert(!containsForbiddenTruth(result), "truncation-mismatch acknowledgement rejection leaks no raw truth");
}

async function verifyExecutionClaimRejected(): Promise<void> {
  section("5. Host Execution Or Persistence Claims Reject Acknowledgement");
  const { candidate, approval, item } = await sourceRetryFixture();
  const { checklist, template } = await templateFor(candidate, approval, item);
  const acknowledgement = acknowledgementFor(template);
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgement({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: {
      ...acknowledgement,
      colonyResolvedSources: true,
      acknowledgementPersisted: true,
      retryWorkerCreated: true,
      retryLedgerCreated: true,
    },
    freshApprovalRequiredAfter: "2026-05-08T13:39:59.000Z",
  });

  assertEqual(result.accepted, false, "execution-claim acknowledgement preflight is rejected");
  assertEqual(result.reasonCode, "valid_source_revalidation_checklist_acknowledgement_required", "execution-claim acknowledgement rejection is bounded");
  assertEqual(result.acknowledgementIdMatched, false, "execution-claim acknowledgement id is not trusted");
  assert(result.acknowledgement === undefined, "execution-claim acknowledgement is not returned");
  assert(!containsForbiddenTruth(result), "execution-claim acknowledgement rejection leaks no raw truth");

  const missingTruncationAcknowledgement = { ...acknowledgement } as Record<string, unknown>;
  delete missingTruncationAcknowledgement.sourceRefsTruncated;
  const missingTruncationResult = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgement({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: missingTruncationAcknowledgement,
    freshApprovalRequiredAfter: "2026-05-08T13:39:59.000Z",
  });

  assertEqual(missingTruncationResult.accepted, false, "missing truncation acknowledgement preflight is rejected");
  assertEqual(missingTruncationResult.reasonCode, "valid_source_revalidation_checklist_acknowledgement_required", "missing truncation acknowledgement rejection is bounded");
  assertEqual(missingTruncationResult.acknowledgementIdMatched, false, "missing truncation acknowledgement id is not trusted");
  assert(missingTruncationResult.acknowledgement === undefined, "missing truncation acknowledgement is not returned");
  assert(!containsForbiddenTruth(missingTruncationResult), "missing truncation acknowledgement rejection leaks no raw truth");
}

async function verifyStaleApprovalRejectedBeforeAcknowledgement(): Promise<void> {
  section("6. Stale Approval Rejects Acknowledgement Before Trust");
  const { candidate, approval, item } = await sourceRetryFixture();
  const { checklist, template } = await templateFor(candidate, approval, item);
  const acknowledgement = acknowledgementFor(template);
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgement({
    candidate,
    approval: {
      approvedBy: "operator",
      signature: await createExternalChannelMediaTransferApprovalSignature(candidate),
      approvedAt: "2026-05-08T13:38:00.000Z",
    },
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    freshApprovalRequiredAfter: "2026-05-08T13:39:59.000Z",
  });

  assertEqual(result.accepted, false, "stale approval acknowledgement preflight is rejected");
  assertEqual(result.reasonCode, "fresh_approval_required", "stale approval acknowledgement rejection reuses bounded preflight reason");
  assertEqual(result.acknowledgementTemplateResult.accepted, false, "stale approval rejects acknowledgement template");
  assert(result.hostAction === undefined, "stale approval creates no host action");
  assert(result.sourceRevalidationPlan === undefined, "stale approval creates no source revalidation plan");
  assert(result.sourceRevalidationChecklist === undefined, "stale approval returns no checklist");
  assert(result.acknowledgementTemplate === undefined, "stale approval returns no acknowledgement template");
  assert(result.acknowledgement === undefined, "stale approval trusts no acknowledgement");
  assert(!containsForbiddenTruth(result), "stale approval acknowledgement rejection leaks no raw signatures or target/source truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 153 Verification (External Media Transfer Manual Retry Source Revalidation Checklist Acknowledgement Preflight)\n");
  await verifySourceAcknowledgementPreflightAccepted();
  await verifyVendorAcknowledgementPreflightAccepted();
  await verifyTamperedAcknowledgementRejected();
  await verifyTruncationClaimMismatchRejected();
  await verifyExecutionClaimRejected();
  await verifyStaleApprovalRejectedBeforeAcknowledgement();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 153: external media transfer manual retry source revalidation checklist acknowledgement preflight is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
