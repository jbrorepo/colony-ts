/** Phase 160 Verification - External Media Transfer Credential-Acknowledged Host Action Preflight */

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgement,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgement,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationResult,
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

function fileRefs(prefix = "phase160_report", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-160-report-${index}.pdf`,
    title: `Phase 160 report ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 4096 + index,
    checksumSha256: `${(index + 1).toString(16)}`.repeat(64),
  }));
}

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T160PRIVATE",
    accountId: "A160PRIVATE",
    targetKind: "channel",
    targetId: "C160PRIVATE",
    threadId: "171000.1600",
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
      approvedAt: "2026-05-08T15:45:00.000Z",
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
        reason: "source locked artifact:phase160_report_0 https://files.slack.com/private?token=xoxb-phase160-secret",
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
        reason: "vendor ambiguous targetId=C160PRIVATE retry-ledger://phase160-forged",
      }),
    }),
  });
  return { candidate, approval, item: workItem(result.data) };
}

async function checklistTemplateFor(
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
    freshApprovalRequiredAfter: "2026-05-08T15:44:59.000Z",
  });
  assertEqual(checklistResult.accepted, true, "fixture source revalidation checklist is accepted");
  assert(Boolean(checklistResult.sourceRevalidationChecklist), "fixture includes source revalidation checklist");
  const templateResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklistResult.sourceRevalidationChecklist,
    freshApprovalRequiredAfter: "2026-05-08T15:44:59.000Z",
  });
  assertEqual(templateResult.accepted, true, "fixture acknowledgement template is accepted");
  assert(Boolean(templateResult.acknowledgementTemplate), "fixture includes acknowledgement template");
  return {
    checklist: checklistResult.sourceRevalidationChecklist as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
    template: templateResult.acknowledgementTemplate as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  };
}

function acknowledgementFor(
  template: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
): ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgement {
  return {
    acknowledgementKind: "external_media_transfer_manual_retry_source_revalidation_checklist_acknowledgement",
    acknowledgementVersion: 1,
    acknowledgementId: template.acknowledgementTemplateId.replace("manual-retry-source-checklist-ack-template:", "manual-retry-source-checklist-ack:"),
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

async function currentAction(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}) {
  const { candidate, approval, item } = await sourceRetryFixture(overrides);
  const { checklist, template } = await checklistTemplateFor(candidate, approval, item);
  const acknowledgement = acknowledgementFor(template);
  const acknowledgedActionResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    freshApprovalRequiredAfter: "2026-05-08T15:44:59.000Z",
  });
  assertEqual(acknowledgedActionResult.accepted, true, "fixture acknowledged host action is accepted");
  const acknowledgedHostAction = acknowledgedActionResult.acknowledgedHostAction!;
  const sourceRevalidationResult: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationResult = {
    resultKind: "external_media_transfer_manual_retry_source_revalidation_result",
    resultVersion: 1,
    resultId: acknowledgedHostAction.acknowledgedReplayActionId.replace("manual-retry-source-checklist-ack-host-action:", "manual-retry-source-revalidation-result:"),
    acknowledgedReplayActionId: acknowledgedHostAction.acknowledgedReplayActionId,
    acknowledgementId: acknowledgedHostAction.acknowledgementId,
    acknowledgementTemplateId: acknowledgedHostAction.acknowledgementTemplateId,
    checklistId: acknowledgedHostAction.checklistId,
    retryStage: acknowledgedHostAction.retryStage,
    workItemCorrelationId: acknowledgedHostAction.workItemCorrelationId,
    transferKey: acknowledgedHostAction.transferKey,
    sourceRefsTruncated: acknowledgedHostAction.sourceRefsTruncated,
    sourceRefFingerprints: acknowledgedHostAction.sourceRefFingerprints,
    revalidatedSourceCount: acknowledgedHostAction.sourceRefFingerprints.length,
    revalidatedSources: acknowledgedHostAction.sourceRefFingerprints.map((source) => ({
      fileIndex: source.fileIndex,
      sourceRefFingerprint: source.sourceRefFingerprint,
      freshSourceResolutionConfirmed: true,
      staleResolvedFileReused: false,
      hostOwned: true,
      colonyResolvedSource: false,
      rawSourceRefIncluded: false,
      resolvedFileHandleIncluded: false,
      fileBytesIncluded: false,
      privateUrlIncluded: false,
      credentialIncluded: false,
      persisted: false,
    })),
    allRequiredSourcesRevalidated: true,
    requiresFreshApprovalSignature: true,
    requiresSourceRefRevalidation: true,
    requiresFreshSourceResolution: true,
    mustNotReuseResolvedFiles: true,
    requiresVendorStateCheck: acknowledgedHostAction.requiresVendorStateCheck,
    hostExecutionRequired: true,
    sourceRevalidationAcknowledgementAccepted: true,
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
    sourceRevalidationResultTruth: "host_reported_fingerprint_only_source_revalidation_result_no_resolution_or_persistence",
  };
  const readinessResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    freshApprovalRequiredAfter: "2026-05-08T15:44:59.000Z",
  });
  assertEqual(readinessResult.accepted, true, "fixture credential readiness is accepted");
  const readiness = readinessResult.credentialReadiness!;
  const credentialAcknowledgement = credentialAcknowledgementFor(readiness);
  const actionResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    freshApprovalRequiredAfter: "2026-05-08T15:44:59.000Z",
  });
  assertEqual(actionResult.accepted, true, "fixture credential-acknowledged host action is accepted");
  return {
    candidate,
    approval,
    item,
    checklist,
    acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction!,
  };
}

function credentialAcknowledgementFor(
  readiness: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness,
): ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgement {
  return {
    acknowledgementKind: "external_media_transfer_manual_retry_source_revalidated_credential_acknowledgement",
    acknowledgementVersion: 1,
    credentialAcknowledgementId: `manual-retry-source-revalidation-credential-ack:${
      readiness.credentialReadinessId.replace("manual-retry-source-revalidation-credential-readiness:", "").slice(0, 32)
    }${readiness.targetCorrelationFingerprint.replace("manual-retry-target:", "").slice(0, 32)}`,
    credentialReadinessId: readiness.credentialReadinessId,
    completedReplayActionId: readiness.completedReplayActionId,
    sourceRevalidationResultId: readiness.sourceRevalidationResultId,
    acknowledgementId: readiness.acknowledgementId,
    acknowledgementTemplateId: readiness.acknowledgementTemplateId,
    checklistId: readiness.checklistId,
    channelId: readiness.channelId,
    targetKind: readiness.targetKind,
    retryStage: readiness.retryStage,
    workItemCorrelationId: readiness.workItemCorrelationId,
    expectedWorkItemCorrelationId: readiness.expectedWorkItemCorrelationId,
    transferKey: readiness.transferKey,
    sourceRefsTruncated: readiness.sourceRefsTruncated,
    sourceRefFingerprints: readiness.sourceRefFingerprints,
    targetCorrelationFingerprint: readiness.targetCorrelationFingerprint,
    revalidatedSourceCount: readiness.revalidatedSourceCount,
    credentialStatus: "host_credentials_available",
    requiredCredentialRefs: readiness.requiredCredentialRefs,
    presentCredentialRefs: readiness.requiredCredentialRefs,
    missingCredentialRefs: [],
    invalidCredentialRefs: [],
    credentialValuesIncluded: false,
    hostSuppliedRuntimeSecrets: readiness.hostSuppliedRuntimeSecrets,
    hostSuppliedRuntimeConfig: readiness.hostSuppliedRuntimeConfig,
    requiresFreshApprovalSignature: true,
    requiresSourceRefRevalidation: true,
    requiresFreshSourceResolution: true,
    mustNotReuseResolvedFiles: true,
    requiresVendorStateCheck: readiness.requiresVendorStateCheck,
    requiresHostSourceAccessCredential: true,
    requiresHostVendorSendCredential: true,
    hostExecutionRequired: true,
    credentialReadinessAccepted: true,
    completedHostActionAccepted: true,
    colonyExecutedHostHandler: false,
    colonyResolvedSources: false,
    colonyFetchedFiles: false,
    colonyDownloadedFiles: false,
    colonyUploadedFiles: false,
    colonyPreviewedFiles: false,
    sourceRevalidationPersisted: false,
    checklistPersisted: false,
    acknowledgementPersisted: false,
    credentialAcknowledgementPersisted: false,
    workItemPersisted: false,
    retryLedgerCreated: false,
    durableRetryAuditRecordCreated: false,
    backgroundRetryCreated: false,
    retryWorkerCreated: false,
    retryScheduleCreated: false,
    automaticVendorRetryAllowed: false,
    credentialPersistenceCreated: false,
    credentialValuesPersisted: false,
    defaultLiveDeliveryEnabled: false,
    publicHostingEnabled: false,
    credentialAcknowledgementTruth: "host_reported_credential_labels_only_after_readiness_no_values_or_persistence",
  };
}

function containsForbiddenTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase160_report") ||
    text.includes("T160PRIVATE") ||
    text.includes("A160PRIVATE") ||
    text.includes("C160PRIVATE") ||
    text.includes("171000.1600") ||
    text.includes("channel-media-transfer:") ||
    text.includes("retry-ledger://phase160-forged") ||
    text.includes("xoxb-phase160-secret") ||
    text.includes("xoxb-real-credential-value") ||
    text.includes("https://files.slack.com") ||
    text.includes("file:///tmp/phase160");
}

async function verifyAcceptedCredentialAcknowledgedHostActionPreflight(): Promise<void> {
  section("1. Credential-Acknowledged Host Action Preflight Accepts Current Truth");
  const truth = await currentAction();
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    freshApprovalRequiredAfter: "2026-05-08T15:44:59.000Z",
  });

  assertEqual(result.accepted, true, "current credential-acknowledged host action preflight is accepted");
  assertEqual(result.credentialAcknowledgedHostActionResult.accepted, true, "preflight recomputes accepted host action");
  assertEqual(result.credentialAcknowledgedReplayActionIdMatched, true, "preflight matches action id");
  assertEqual(result.credentialAcknowledgementIdMatched, true, "preflight matches credential acknowledgement id");
  assertEqual(result.credentialReadinessIdMatched, true, "preflight matches credential readiness id");
  assertEqual(result.transferKeyMatched, true, "preflight matches transfer key");
  assertEqual(result.sourceRefFingerprintsMatched, true, "preflight matches source fingerprints");
  assertEqual(result.requiredCredentialRefsMatched, true, "preflight matches required credential labels");
  assertEqual(result.presentCredentialRefsMatched, true, "preflight matches present credential labels");
  assertEqual(result.credentialValuesExcluded, true, "preflight excludes credential values");
  assertEqual(result.hostActionStillNotExecuted, true, "preflight keeps host execution disabled");
  assertEqual(result.credentialAcknowledgedHostActionPreflightTruth, "recomputed_from_credential_acknowledgement_and_supplied_credential_acknowledged_host_action_no_execution", "preflight truth is explicit");
  assert(!containsForbiddenTruth(result), "accepted preflight leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyVendorPreflightPreservesVendorStateGate(): Promise<void> {
  section("2. Vendor Credential-Acknowledged Host Action Preflight Preserves Vendor-State Gate");
  const { candidate, approval, item } = await vendorRetryFixture();
  const { checklist, template } = await checklistTemplateFor(candidate, approval, item);
  const acknowledgement = acknowledgementFor(template);
  const acknowledgedActionResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T15:44:59.000Z",
  });
  assertEqual(acknowledgedActionResult.accepted, true, "fixture vendor acknowledged action is accepted");
  const sourceRevalidationResult = {
    ...(await currentAction()).sourceRevalidationResult,
    resultId: acknowledgedActionResult.acknowledgedHostAction!.acknowledgedReplayActionId.replace("manual-retry-source-checklist-ack-host-action:", "manual-retry-source-revalidation-result:"),
    acknowledgedReplayActionId: acknowledgedActionResult.acknowledgedHostAction!.acknowledgedReplayActionId,
    acknowledgementId: acknowledgement.acknowledgementId,
    acknowledgementTemplateId: acknowledgement.acknowledgementTemplateId,
    checklistId: acknowledgement.checklistId,
    retryStage: "vendor_send" as const,
    workItemCorrelationId: acknowledgedActionResult.acknowledgedHostAction!.workItemCorrelationId,
    transferKey: acknowledgedActionResult.acknowledgedHostAction!.transferKey,
    sourceRefsTruncated: acknowledgedActionResult.acknowledgedHostAction!.sourceRefsTruncated,
    sourceRefFingerprints: acknowledgedActionResult.acknowledgedHostAction!.sourceRefFingerprints,
    revalidatedSourceCount: acknowledgedActionResult.acknowledgedHostAction!.sourceRefFingerprints.length,
    revalidatedSources: acknowledgedActionResult.acknowledgedHostAction!.sourceRefFingerprints.map((source) => ({
      fileIndex: source.fileIndex,
      sourceRefFingerprint: source.sourceRefFingerprint,
      freshSourceResolutionConfirmed: true as const,
      staleResolvedFileReused: false as const,
      hostOwned: true as const,
      colonyResolvedSource: false as const,
      rawSourceRefIncluded: false as const,
      resolvedFileHandleIncluded: false as const,
      fileBytesIncluded: false as const,
      privateUrlIncluded: false as const,
      credentialIncluded: false as const,
      persisted: false as const,
    })),
    requiresVendorStateCheck: true as const,
  };
  const readinessResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T15:44:59.000Z",
  });
  assertEqual(readinessResult.accepted, true, "fixture vendor readiness is accepted");
  const credentialAcknowledgement = credentialAcknowledgementFor(readinessResult.credentialReadiness!);
  const actionResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T15:44:59.000Z",
  });
  assertEqual(actionResult.accepted, true, "fixture vendor credential-acknowledged action is accepted");
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T15:44:59.000Z",
  });

  assertEqual(result.accepted, true, "vendor credential-acknowledged host action preflight is accepted");
  assertEqual(result.requiresVendorStateCheckMatched, true, "vendor preflight matches vendor-state requirement");
  assertEqual(result.automaticVendorRetryStillBlocked, true, "vendor preflight still blocks automatic vendor retry");
  assertEqual(result.credentialPersistenceStillBlocked, true, "vendor preflight creates no credential persistence");
  assert(!containsForbiddenTruth(result), "vendor preflight leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyTamperedCredentialAcknowledgedHostActionRejected(): Promise<void> {
  section("3. Tampered Credential-Acknowledged Host Action Rejects");
  const truth = await currentAction();
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: {
      ...truth.credentialAcknowledgedHostAction,
      transferKey: "media-transfer:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    },
    freshApprovalRequiredAfter: "2026-05-08T15:44:59.000Z",
  });

  assertEqual(result.accepted, false, "tampered host action is rejected");
  assertEqual(result.reasonCode, "credential_acknowledged_host_action_current_truth_mismatch", "tampered host action rejection is bounded");
  assertEqual(result.transferKeyMatched, false, "tampered host action reports transfer-key mismatch");
  assert(!containsForbiddenTruth(result), "tampered host action rejection leaks no raw truth");
}

async function verifyAcceptedPreflightReturnsRecomputedCanonicalTruth(): Promise<void> {
  section("4. Accepted Preflight Returns Recomputed Canonical Truth");
  const truth = await currentAction();
  const suppliedCredentialAcknowledgedHostAction = {
    ...truth.credentialAcknowledgedHostAction,
    requiredCredentialRefs: [...truth.credentialAcknowledgedHostAction.requiredCredentialRefs].reverse(),
    presentCredentialRefs: [...truth.credentialAcknowledgedHostAction.presentCredentialRefs].reverse(),
    hostSuppliedRuntimeSecrets: [...truth.credentialAcknowledgedHostAction.hostSuppliedRuntimeSecrets].reverse(),
    hostSuppliedRuntimeConfig: [...truth.credentialAcknowledgedHostAction.hostSuppliedRuntimeConfig].reverse(),
  };
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: suppliedCredentialAcknowledgedHostAction,
    freshApprovalRequiredAfter: "2026-05-08T15:44:59.000Z",
  });

  assertEqual(result.accepted, true, "order-insensitive label match is accepted");
  assertEqual(result.requiredCredentialRefsMatched, true, "required credential labels match by set truth");
  assertEqual(result.presentCredentialRefsMatched, true, "present credential labels match by set truth");
  assertEqual(
    JSON.stringify(result.credentialAcknowledgedHostAction?.requiredCredentialRefs),
    JSON.stringify(truth.credentialAcknowledgedHostAction.requiredCredentialRefs),
    "accepted result returns recomputed required credential label order",
  );
  assertEqual(
    JSON.stringify(result.credentialAcknowledgedHostAction?.hostSuppliedRuntimeSecrets),
    JSON.stringify(truth.credentialAcknowledgedHostAction.hostSuppliedRuntimeSecrets),
    "accepted result returns recomputed runtime secret label order",
  );
  assert(
    JSON.stringify(result.credentialAcknowledgedHostAction?.requiredCredentialRefs) !==
      JSON.stringify(suppliedCredentialAcknowledgedHostAction.requiredCredentialRefs),
    "accepted result does not trust host-supplied noncanonical label order",
  );
  assert(!containsForbiddenTruth(result), "canonicalized preflight leaks no raw truth");
}

async function verifyExecutionAndCredentialClaimsRejected(): Promise<void> {
  section("5. Execution And Credential Claims Reject Before Preflight");
  const truth = await currentAction();
  const executionResult = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: {
      ...truth.credentialAcknowledgedHostAction,
      colonyExecutedHostHandler: true,
    },
    freshApprovalRequiredAfter: "2026-05-08T15:44:59.000Z",
  });
  assertEqual(executionResult.accepted, false, "execution claim is rejected");
  assertEqual(executionResult.reasonCode, "valid_credential_acknowledged_host_action_required", "execution claim rejection is bounded");

  const credentialResult = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: {
      ...truth.credentialAcknowledgedHostAction,
      credentialValuesPersisted: true,
      sourceAccessCredential: "xoxb-real-credential-value",
    },
    freshApprovalRequiredAfter: "2026-05-08T15:44:59.000Z",
  });
  assertEqual(credentialResult.accepted, false, "credential value claim is rejected");
  assertEqual(credentialResult.reasonCode, "valid_credential_acknowledged_host_action_required", "credential value claim rejection is bounded");
  assert(!containsForbiddenTruth([executionResult, credentialResult]), "invalid host action rejections leak no raw truth");
}

async function verifyStaleApprovalRejectedBeforeCredentialAcknowledgedHostActionPreflight(): Promise<void> {
  section("6. Stale Approval Rejects Before Credential-Acknowledged Host Action Preflight");
  const truth = await currentAction();
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
    candidate: truth.candidate,
    approval: {
      approvedBy: "operator",
      signature: await createExternalChannelMediaTransferApprovalSignature(truth.candidate),
      approvedAt: "2026-05-08T15:43:00.000Z",
    },
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    freshApprovalRequiredAfter: "2026-05-08T15:44:59.000Z",
  });

  assertEqual(result.accepted, false, "stale approval preflight is rejected");
  assertEqual(result.reasonCode, "fresh_approval_required", "stale approval rejection preserves bounded reason");
  assertEqual(result.credentialAcknowledgedHostActionResult.accepted, false, "stale approval rejects recomputed host action");
  assert(!containsForbiddenTruth(result), "stale approval rejection leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 160 Verification (External Media Transfer Credential-Acknowledged Host Action Preflight)\n");
  await verifyAcceptedCredentialAcknowledgedHostActionPreflight();
  await verifyVendorPreflightPreservesVendorStateGate();
  await verifyTamperedCredentialAcknowledgedHostActionRejected();
  await verifyAcceptedPreflightReturnsRecomputedCanonicalTruth();
  await verifyExecutionAndCredentialClaimsRejected();
  await verifyStaleApprovalRejectedBeforeCredentialAcknowledgedHostActionPreflight();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 160: external media transfer credential-acknowledged host action preflight is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
