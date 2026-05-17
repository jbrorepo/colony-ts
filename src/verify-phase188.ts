/** Phase 188 Verification - External Media Transfer Manual Retry Control Worker Handler Readiness */

import { mkdtemp, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import {
  createExternalChannelMediaTransferApprovalSignature,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationAcknowledgedHostAction,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecord,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan,
  createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness,
  executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke,
  createExternalChannelMediaTransferWorkerHandler,
  executeExternalChannelMediaTransferHostRequest,
  preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan,
  preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout,
  preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff,
  preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt,
  preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest,
  preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction,
  JsonExternalChannelMediaTransferManualRetryCloseoutRecordStore,
  JsonExternalChannelMediaTransferManualRetryLedgerEntryStore,
  JsonExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordStore,
  JsonExternalChannelMediaTransferManualRetryWorkItemClosureStore,
  closeExternalChannelMediaTransferManualRetryWorkItemFromCloseoutRecordPersistence,
  createExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordPlan,
  createExternalChannelMediaTransferManualRetryLedgerEntryPlan,
  createExternalChannelMediaTransferManualRetryControlReadinessPlan,
  createExternalChannelMediaTransferManualRetryControlOperatorHandoff,
  createExternalChannelMediaTransferManualRetryControlWorkerSelection,
  createExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness,
  createExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff,
  preflightExternalChannelMediaTransferManualRetryControlOperatorHandoff,
  preflightExternalChannelMediaTransferManualRetryControlReadinessPlan,
  preflightExternalChannelMediaTransferManualRetryControlWorkerSelection,
  preflightExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness,
  persistExternalChannelMediaTransferManualRetryLedgerEntry,
  preflightExternalChannelMediaTransferManualRetryLedgerEntry,
  persistExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecord,
  preflightExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordPlan,
  preflightExternalChannelMediaTransferManualRetryWorkItemClosurePersistence,
  persistExternalChannelMediaTransferManualRetryCloseoutRecord,
  persistExternalChannelMediaTransferManualRetryWorkItemClosure,
  type ExternalChannelMediaTransferApproval,
  type ExternalChannelMediaTransferCandidate,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklist,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgement,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecord,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan,
  type ExternalChannelMediaTransferManualRetryCloseoutRecordPersistence,
  type ExternalChannelMediaTransferManualRetryCloseoutRecordPersistenceStore,
  type ExternalChannelMediaTransferManualRetryWorkItemClosure,
  type ExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecord,
  type ExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordPersistenceStore,
  type ExternalChannelMediaTransferManualRetryWorkItemClosurePersistence,
  type ExternalChannelMediaTransferManualRetryWorkItemClosurePersistenceStore,
  type ExternalChannelMediaTransferManualRetryLedgerEntryPlan,
  type ExternalChannelMediaTransferManualRetryLedgerEntry,
  type ExternalChannelMediaTransferManualRetryLedgerEntryPersistenceStore,
  type ExternalChannelMediaTransferManualRetryControlReadinessPlan,
  type ExternalChannelMediaTransferManualRetryControlReadinessPlanPreflightResult,
  type ExternalChannelMediaTransferManualRetryControlOperatorHandoff,
  type ExternalChannelMediaTransferManualRetryControlOperatorHandoffPreflightResult,
  type ExternalChannelMediaTransferManualRetryControlWorkerSelection,
  type ExternalChannelMediaTransferManualRetryControlWorkerSelectionPreflightResult,
  type ExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness,
  type ExternalChannelMediaTransferManualRetryControlWorkerHandlerReadinessPreflightResult,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgement,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationResult,
  type ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionResult,
  type ExternalChannelMediaTransferManualReinvokeWorkerHandler,
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

function fileRefs(prefix = "phase165_report", count = 3): ExternalChannelMediaTransferCandidate["fileRefs"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceRef: `artifact:${prefix}_${index}`,
    name: `phase-165-report-${index}.pdf`,
    title: `Phase 165 report ${index}`,
    mimeType: "application/pdf",
    sizeBytes: 4096 + index,
    checksumSha256: `${(index + 1).toString(16)}`.repeat(64),
  }));
}

function safeCandidate(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): ExternalChannelMediaTransferCandidate {
  return {
    channelId: "slack",
    workspaceId: "T163PRIVATE",
    accountId: "A163PRIVATE",
    targetKind: "channel",
    targetId: "C163PRIVATE",
    threadId: "171000.1630",
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
      approvedAt: "2026-05-08T16:45:00.000Z",
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
        reason: "source locked artifact:phase165_report_0 https://files.slack.com/private?token=xoxb-phase165-secret",
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
        reason: "vendor ambiguous targetId=C163PRIVATE retry-ledger://phase164-forged",
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
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(checklistResult.accepted, true, "fixture source revalidation checklist is accepted");
  assert(Boolean(checklistResult.sourceRevalidationChecklist), "fixture includes source revalidation checklist");
  const templateResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationChecklistAcknowledgementTemplate({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklistResult.sourceRevalidationChecklist,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
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
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
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
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
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
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(actionResult.accepted, true, "fixture credential-acknowledged host action is accepted");
  const manualReinvokeRequestResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
      candidate,
      approval,
      workItem: item,
      sourceRevalidationChecklist: checklist,
      sourceRevalidationChecklistAcknowledgement: acknowledgement,
      sourceRevalidationResult,
      credentialAcknowledgement,
      credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction!,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(manualReinvokeRequestResult.accepted, true, "fixture credential-acknowledged manual reinvoke request is accepted");
  const handoffResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
      candidate,
      approval,
      workItem: item,
      sourceRevalidationChecklist: checklist,
      sourceRevalidationChecklistAcknowledgement: acknowledgement,
      sourceRevalidationResult,
      credentialAcknowledgement,
      credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction!,
      credentialAcknowledgedManualReinvokeRequest: manualReinvokeRequestResult.credentialAcknowledgedManualReinvokeRequest!,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(handoffResult.accepted, true, "fixture credential-acknowledged manual reinvoke handoff is accepted");
  return {
    candidate,
    approval,
    item,
    checklist,
    acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction!,
    credentialAcknowledgedManualReinvokeRequest: manualReinvokeRequestResult.credentialAcknowledgedManualReinvokeRequest!,
    credentialAcknowledgedManualReinvokeHandoff: handoffResult.credentialAcknowledgedManualReinvokeHandoff!,
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

export function containsForbiddenTruth(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes("artifact:phase165_report") ||
    text.includes("T163PRIVATE") ||
    text.includes("A163PRIVATE") ||
    text.includes("C163PRIVATE") ||
    text.includes("171000.1630") ||
    text.includes("T181COPIED") ||
    text.includes("A181COPIED") ||
    text.includes("C181COPIED") ||
    text.includes("171000.1811") ||
    text.includes("phase181_copied") ||
    text.includes("T181TAMPER") ||
    text.includes("A181TAMPER") ||
    text.includes("C181TAMPER") ||
    text.includes("171000.1812") ||
    text.includes("phase181_tamper") ||
    text.includes("channel-media-transfer:") ||
    text.includes("retry-ledger://phase164-forged") ||
    text.includes("xoxb-phase164-secret") ||
    text.includes("xoxb-real-credential-value") ||
    text.includes("https://files.slack.com") ||
    text.includes("file:///tmp/phase164");
}

function assertNoRejectedHandoffDisclosure(
  result: {
    accepted: boolean;
    credentialAcknowledgedManualReinvokeHandoff?: unknown;
    expectedCredentialAcknowledgedManualReinvokeHandoff?: unknown;
    expectedCredentialAcknowledgedManualReinvokeHandoffId?: string;
    credentialAcknowledgedManualReinvokeHandoffResult?: {
      credentialAcknowledgedManualReinvokeHandoff?: unknown;
      credentialAcknowledgedManualReinvokeHandoffId?: string;
    };
  },
  label: string,
): void {
  assertEqual(result.accepted, false, `${label}: rejected`);
  assert(result.credentialAcknowledgedManualReinvokeHandoff === undefined, `${label}: top-level handoff omitted`);
  assert(result.expectedCredentialAcknowledgedManualReinvokeHandoff === undefined, `${label}: expected handoff omitted`);
  assert(result.expectedCredentialAcknowledgedManualReinvokeHandoffId === undefined, `${label}: expected handoff id omitted`);
  assert(
    result.credentialAcknowledgedManualReinvokeHandoffResult?.credentialAcknowledgedManualReinvokeHandoff === undefined,
    `${label}: nested recomputed handoff omitted`,
  );
  assert(
    result.credentialAcknowledgedManualReinvokeHandoffResult?.credentialAcknowledgedManualReinvokeHandoffId === undefined,
    `${label}: nested recomputed handoff id omitted`,
  );
}

async function verifyAcceptedCredentialAcknowledgedManualReinvokeHandoffPreflight(): Promise<void> {
  section("1. Credential-Acknowledged Manual Reinvoke Handoff Preflight Accepts Current Handoff");
  const truth = await currentAction();
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  const handoff = result.credentialAcknowledgedManualReinvokeHandoff;

  assertEqual(result.accepted, true, "current credential-acknowledged manual reinvoke handoff preflight is accepted");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoffResult.accepted, true, "preflight recomputes accepted handoff truth");
  assert(Boolean(handoff), "handoff descriptor truth is returned");
  assertEqual(handoff?.handoffKind, "external_media_transfer_credential_acknowledged_manual_reinvoke_handoff", "handoff kind is explicit");
  assertEqual(handoff?.manualReinvokeHandoffMode, "host_owned_manual_reinvoke_handoff_after_request_preflight", "handoff mode is explicit");
  assertEqual(handoff?.credentialAcknowledgedManualReinvokeRequestId, truth.credentialAcknowledgedManualReinvokeRequest.credentialAcknowledgedManualReinvokeRequestId, "preflight binds request id");
  assertEqual(handoff?.credentialAcknowledgedReplayActionId, truth.credentialAcknowledgedHostAction.credentialAcknowledgedReplayActionId, "preflight binds credential-acknowledged action id");
  assertEqual(handoff?.credentialAcknowledgedManualReinvokeHandoffId, truth.credentialAcknowledgedManualReinvokeHandoff.credentialAcknowledgedManualReinvokeHandoffId, "preflight returns current handoff id");
  assertEqual(handoff?.transferKey, truth.credentialAcknowledgedManualReinvokeHandoff.transferKey, "preflight binds transfer key");
  assertEqual(handoff?.requiredCredentialRefs.length, truth.credentialAcknowledgedManualReinvokeHandoff.requiredCredentialRefs.length, "preflight carries required credential labels only");
  assertEqual(handoff?.presentCredentialRefs.length, truth.credentialAcknowledgedManualReinvokeHandoff.presentCredentialRefs.length, "preflight carries present credential labels only");
  assertEqual(handoff?.credentialAcknowledgedManualReinvokeRequestPreflightAccepted, true, "preflight confirms request preflight acceptance");
  assertEqual(handoff?.credentialValuesIncluded, false, "preflight includes no credential values");
  assertEqual(handoff?.colonyExecutedHostHandler, false, "preflight executes no host handler");
  assertEqual(handoff?.colonyResolvedSources, false, "preflight resolves no sources");
  assertEqual(handoff?.credentialAcknowledgedManualReinvokeHandoffPersisted, false, "preflight does not persist handoff");
  assertEqual(handoff?.retryWorkerCreated, false, "preflight creates no retry worker");
  assertEqual(handoff?.automaticVendorRetryAllowed, false, "preflight allows no automatic vendor retry");
  assertEqual(handoff?.credentialValuesPersisted, false, "preflight persists no credential values");
  assertEqual(handoff?.defaultLiveDeliveryEnabled, false, "preflight enables no default live delivery");
  assertEqual(handoff?.publicHostingEnabled, false, "preflight enables no public hosting");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoffIdMatched, true, "preflight matches handoff id");
  assertEqual(result.credentialAcknowledgedManualReinvokeRequestIdMatched, true, "preflight matches request id");
  assertEqual(result.transferKeyMatched, true, "preflight matches transfer key");
  assertEqual(result.requiredCredentialRefsMatched, true, "preflight matches required credential labels");
  assertEqual(result.credentialValuesExcluded, true, "preflight proves credential values are excluded");
  assertEqual(result.manualReinvokeHandoffStillNotExecuted, true, "preflight proves handoff is still not executed");
  assertEqual(result.sourceResolutionStillBlocked, true, "preflight proves source resolution is still blocked");
  assertEqual(result.persistenceStillBlocked, true, "preflight proves persistence is still blocked");
  assertEqual(result.retryWorkerStillBlocked, true, "preflight proves retry workers are still blocked");
  assertEqual(result.automaticVendorRetryStillBlocked, true, "preflight proves automatic vendor retry is still blocked");
  assertEqual(result.credentialPersistenceStillBlocked, true, "preflight proves credential persistence is still blocked");
  assertEqual(result.defaultLiveDeliveryStillBlocked, true, "preflight proves default live delivery is still blocked");
  assertEqual(result.publicHostingStillBlocked, true, "preflight proves public hosting is still blocked");
  assertEqual(
    result.credentialAcknowledgedManualReinvokeHandoffPreflightTruth,
    "recomputed_from_credential_acknowledged_manual_reinvoke_request_preflight_and_supplied_handoff_no_execution",
    "handoff preflight truth is explicit",
  );
  assert(!containsForbiddenTruth(result), "accepted handoff preflight leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyVendorManualReinvokeHandoffPreflightPreservesVendorStateGate(): Promise<void> {
  section("2. Vendor Credential-Acknowledged Manual Reinvoke Handoff Preflight Preserves Vendor-State Gate");
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
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
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
  const credentialAcknowledgement = credentialAcknowledgementFor((await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialReadiness({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  })).credentialReadiness!);
  const actionResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedHostAction({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(actionResult.accepted, true, "fixture vendor credential-acknowledged action is accepted");
  const requestResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(requestResult.accepted, true, "fixture vendor manual reinvoke request is accepted");
  const handoffResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: requestResult.credentialAcknowledgedManualReinvokeRequest,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(handoffResult.accepted, true, "fixture vendor handoff is accepted");
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: requestResult.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: handoffResult.credentialAcknowledgedManualReinvokeHandoff,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });

  assertEqual(result.accepted, true, "vendor handoff preflight is accepted");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoff?.requiresVendorStateCheck, true, "vendor handoff preserves vendor-state requirement");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoff?.hostMustVerifyVendorStateBeforeSend, true, "vendor handoff requires vendor-state verification before host send");
  assertEqual(result.requiresVendorStateCheckMatched, true, "vendor preflight matches vendor-state gate");
  assertEqual(result.automaticVendorRetryStillBlocked, true, "vendor preflight still blocks automatic vendor retry");
  assertEqual(result.credentialPersistenceStillBlocked, true, "vendor preflight creates no credential persistence");
  assertEqual(result.publicHostingStillBlocked, true, "vendor preflight enables no public hosting");
  assert(!containsForbiddenTruth(result), "vendor handoff preflight leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyTamperedCredentialAcknowledgedManualReinvokeHandoffBlocksPreflight(): Promise<void> {
  section("3. Tampered Credential-Acknowledged Manual Reinvoke Handoff Blocks Preflight");
  const truth = await currentAction();
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: {
      ...truth.credentialAcknowledgedManualReinvokeHandoff,
      transferKey: "media-transfer:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    },
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });

  assertEqual(result.accepted, false, "tampered handoff blocks preflight");
  assertEqual(result.reasonCode, "credential_acknowledged_manual_reinvoke_handoff_current_truth_mismatch", "tampered handoff rejection is bounded");
  assertEqual(result.transferKeyMatched, false, "preflight reports transfer-key mismatch");
  assert(result.credentialAcknowledgedManualReinvokeHandoff === undefined, "tampered preflight returns no handoff");
  assertNoRejectedHandoffDisclosure(result, "tampered handoff rejection");
  assert(!containsForbiddenTruth(result), "tampered handoff rejection leaks no raw truth");
}

async function verifyManualReinvokeHandoffPreflightUsesRecomputedCanonicalTruth(): Promise<void> {
  section("4. Manual Reinvoke Handoff Preflight Uses Recomputed Canonical Truth");
  const truth = await currentAction();
  const suppliedHandoff = {
    ...truth.credentialAcknowledgedManualReinvokeHandoff,
    requiredCredentialRefs: [...truth.credentialAcknowledgedManualReinvokeHandoff.requiredCredentialRefs].reverse(),
    presentCredentialRefs: [...truth.credentialAcknowledgedManualReinvokeHandoff.presentCredentialRefs].reverse(),
    hostSuppliedRuntimeSecrets: [...truth.credentialAcknowledgedManualReinvokeHandoff.hostSuppliedRuntimeSecrets].reverse(),
    hostSuppliedRuntimeConfig: [...truth.credentialAcknowledgedManualReinvokeHandoff.hostSuppliedRuntimeConfig].reverse(),
  };
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: suppliedHandoff,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });

  assertEqual(result.accepted, true, "order-insensitive handoff is accepted before later trust");
  assertEqual(result.requiredCredentialRefsMatched, true, "required credential labels match by set truth");
  assertEqual(result.presentCredentialRefsMatched, true, "present credential labels match by set truth");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoffIdMatched, true, "handoff id is stable across label order");
  assertEqual(
    JSON.stringify(result.credentialAcknowledgedManualReinvokeHandoff?.requiredCredentialRefs),
    JSON.stringify(truth.credentialAcknowledgedManualReinvokeHandoff.requiredCredentialRefs),
    "handoff preflight returns recomputed required credential label order",
  );
  assertEqual(
    JSON.stringify(result.credentialAcknowledgedManualReinvokeHandoff?.hostSuppliedRuntimeSecrets),
    JSON.stringify(truth.credentialAcknowledgedManualReinvokeHandoff.hostSuppliedRuntimeSecrets),
    "handoff preflight returns recomputed runtime secret label order",
  );
  assert(
    JSON.stringify(result.credentialAcknowledgedManualReinvokeHandoff?.requiredCredentialRefs) !==
      JSON.stringify(suppliedHandoff.requiredCredentialRefs),
    "handoff preflight does not trust host-supplied noncanonical label order",
  );
  assert(!containsForbiddenTruth(result), "canonicalized handoff preflight leaks no raw truth");
}

async function verifyExecutionAndCredentialClaimsRejectedByManualReinvokeHandoffPreflight(): Promise<void> {
  section("5. Execution And Credential Claims Reject In Manual Reinvoke Handoff Preflight");
  const truth = await currentAction();
  const executionResult = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: {
      ...truth.credentialAcknowledgedManualReinvokeHandoff,
      colonyExecutedHostHandler: true,
    },
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(executionResult.accepted, false, "execution claim is rejected");
  assertEqual(executionResult.reasonCode, "valid_credential_acknowledged_manual_reinvoke_handoff_required", "execution claim rejection is bounded");
  assert(executionResult.credentialAcknowledgedManualReinvokeHandoff === undefined, "execution claim returns no handoff");
  assertNoRejectedHandoffDisclosure(executionResult, "execution claim rejection");

  const credentialResult = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: {
      ...truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialValuesPersisted: true,
      sourceAccessCredential: "xoxb-real-credential-value",
    },
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(credentialResult.accepted, false, "credential value claim is rejected");
  assertEqual(credentialResult.reasonCode, "valid_credential_acknowledged_manual_reinvoke_handoff_required", "credential value claim rejection is bounded");
  assert(credentialResult.credentialAcknowledgedManualReinvokeHandoff === undefined, "credential value claim returns no handoff");
  assertNoRejectedHandoffDisclosure(credentialResult, "credential value claim rejection");

  const nestedRawSourceResult = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: {
      ...truth.credentialAcknowledgedManualReinvokeHandoff,
      sourceRefFingerprints: truth.credentialAcknowledgedManualReinvokeHandoff.sourceRefFingerprints.map((source, index) => index === 0
        ? {
          ...source,
          rawSourceRef: "artifact:phase165_report_0",
          privateUrl: "https://files.slack.com/private?token=xoxb-phase164-secret",
        }
        : source),
    },
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(nestedRawSourceResult.accepted, false, "nested raw source fields are rejected");
  assertEqual(nestedRawSourceResult.reasonCode, "valid_credential_acknowledged_manual_reinvoke_handoff_required", "nested raw source rejection is bounded");
  assert(nestedRawSourceResult.credentialAcknowledgedManualReinvokeHandoff === undefined, "nested raw source returns no handoff");
  assertNoRejectedHandoffDisclosure(nestedRawSourceResult, "nested raw source rejection");
  assert(!containsForbiddenTruth([executionResult, credentialResult, nestedRawSourceResult]), "invalid handoff rejections leak no raw truth");
}

async function verifyStaleApprovalRejectedBeforeCredentialAcknowledgedManualReinvokeHandoffPreflight(): Promise<void> {
  section("6. Stale Approval Rejects Before Credential-Acknowledged Manual Reinvoke Handoff Preflight");
  const truth = await currentAction();
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate: truth.candidate,
    approval: {
      approvedBy: "operator",
      signature: await createExternalChannelMediaTransferApprovalSignature(truth.candidate),
      approvedAt: "2026-05-08T16:13:00.000Z",
    },
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });

  assertEqual(result.accepted, false, "stale approval handoff preflight is rejected");
  assertEqual(result.reasonCode, "fresh_approval_required", "stale approval rejection preserves bounded reason");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoffResult.accepted, false, "stale approval rejects recomputed handoff");
  assert(result.credentialAcknowledgedManualReinvokeHandoff === undefined, "stale approval returns no handoff");
  assertNoRejectedHandoffDisclosure(result, "stale approval rejection");
  assert(!containsForbiddenTruth(result), "stale approval rejection leaks no raw truth");
}

async function verifyAcceptedCredentialAcknowledgedManualReinvokeHandoff(): Promise<void> {
  section("1. Credential-Acknowledged Manual Reinvoke Handoff Accepts Current Request Preflight");
  const truth = await currentAction();
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    freshApprovalRequiredAfter: "2026-05-08T16:44:59.000Z",
  });
  const handoff = result.credentialAcknowledgedManualReinvokeHandoff;

  assertEqual(result.accepted, true, "current credential-acknowledged manual reinvoke handoff is accepted");
  assertEqual(result.credentialAcknowledgedManualReinvokeRequestPreflight.accepted, true, "handoff requires accepted request preflight");
  assert(Boolean(handoff), "handoff descriptor truth is returned");
  assertEqual(handoff?.handoffKind, "external_media_transfer_credential_acknowledged_manual_reinvoke_handoff", "handoff kind is explicit");
  assertEqual(handoff?.manualReinvokeHandoffMode, "host_owned_manual_reinvoke_handoff_after_request_preflight", "handoff mode is explicit");
  assertEqual(handoff?.credentialAcknowledgedManualReinvokeRequestId, truth.credentialAcknowledgedManualReinvokeRequest.credentialAcknowledgedManualReinvokeRequestId, "handoff binds request id");
  assertEqual(handoff?.credentialAcknowledgedReplayActionId, truth.credentialAcknowledgedHostAction.credentialAcknowledgedReplayActionId, "handoff binds credential-acknowledged host action id");
  assertEqual(handoff?.transferKey, truth.credentialAcknowledgedManualReinvokeRequest.transferKey, "handoff binds transfer key");
  assertEqual(handoff?.sourceRefFingerprints.length, truth.credentialAcknowledgedManualReinvokeRequest.sourceRefFingerprints.length, "handoff carries fingerprint-only source set");
  assertEqual(handoff?.requiredCredentialRefs.length, truth.credentialAcknowledgedManualReinvokeRequest.requiredCredentialRefs.length, "handoff carries required credential labels only");
  assertEqual(handoff?.presentCredentialRefs.length, truth.credentialAcknowledgedManualReinvokeRequest.presentCredentialRefs.length, "handoff carries present credential labels only");
  assertEqual(handoff?.credentialAcknowledgedManualReinvokeRequestPreflightAccepted, true, "handoff records request preflight acceptance");
  assertEqual(handoff?.hostOwnedManualReinvokeRequired, true, "handoff remains host-owned");
  assertEqual(handoff?.hostMustResolveSourcesFresh, true, "handoff requires fresh source resolution");
  assertEqual(handoff?.hostMustNotReuseResolvedFiles, true, "handoff blocks stale resolved file reuse");
  assertEqual(handoff?.credentialValuesIncluded, false, "handoff includes no credential values");
  assertEqual(handoff?.colonyExecutedHostHandler, false, "handoff executes no host handler");
  assertEqual(handoff?.colonyResolvedSources, false, "handoff resolves no sources");
  assertEqual(handoff?.credentialAcknowledgedManualReinvokeHandoffPersisted, false, "handoff is not persisted");
  assertEqual(handoff?.retryWorkerCreated, false, "handoff creates no retry worker");
  assertEqual(handoff?.automaticVendorRetryAllowed, false, "handoff allows no automatic vendor retry");
  assertEqual(handoff?.credentialValuesPersisted, false, "handoff persists no credential values");
  assertEqual(handoff?.defaultLiveDeliveryEnabled, false, "handoff enables no default live delivery");
  assertEqual(handoff?.publicHostingEnabled, false, "handoff enables no public hosting");
  assertEqual(handoff?.credentialAcknowledgedManualReinvokeHandoffTruth, "host_owned_manual_reinvoke_handoff_after_request_preflight_no_execution_or_persistence", "handoff truth is explicit");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoffTruth, "credential_acknowledged_manual_reinvoke_request_preflight_required_before_handoff_no_execution", "handoff result truth is explicit");
  assert(!containsForbiddenTruth(result), "accepted handoff leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyVendorManualReinvokeHandoffPreservesVendorStateGate(): Promise<void> {
  section("2. Vendor Credential-Acknowledged Manual Reinvoke Handoff Preserves Vendor-State Gate");
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
    freshApprovalRequiredAfter: "2026-05-08T16:44:59.000Z",
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
    freshApprovalRequiredAfter: "2026-05-08T16:44:59.000Z",
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
    freshApprovalRequiredAfter: "2026-05-08T16:44:59.000Z",
  });
  assertEqual(actionResult.accepted, true, "fixture vendor credential-acknowledged action is accepted");
  const requestResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:44:59.000Z",
  });
  assertEqual(requestResult.accepted, true, "fixture vendor manual reinvoke request is accepted");
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: requestResult.credentialAcknowledgedManualReinvokeRequest,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:44:59.000Z",
  });

  assertEqual(result.accepted, true, "vendor credential-acknowledged manual reinvoke handoff is accepted");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoff?.requiresVendorStateCheck, true, "vendor handoff preserves vendor-state requirement");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoff?.hostMustVerifyVendorStateBeforeSend, true, "vendor handoff requires vendor-state verification before host send");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoff?.automaticVendorRetryAllowed, false, "vendor handoff still blocks automatic vendor retry");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoff?.credentialPersistenceCreated, false, "vendor handoff creates no credential persistence");
  assertEqual(result.credentialAcknowledgedManualReinvokeHandoff?.publicHostingEnabled, false, "vendor handoff enables no public hosting");
  assert(!containsForbiddenTruth(result), "vendor handoff leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyTamperedManualReinvokeRequestBlocksHandoff(): Promise<void> {
  section("3. Tampered Credential-Acknowledged Manual Reinvoke Request Blocks Handoff");
  const truth = await currentAction();
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: {
      ...truth.credentialAcknowledgedManualReinvokeRequest,
      credentialValuesPersisted: true,
      sourceAccessCredential: "xoxb-real-credential-value",
    },
    freshApprovalRequiredAfter: "2026-05-08T16:44:59.000Z",
  });

  assertEqual(result.accepted, false, "tampered manual reinvoke request blocks handoff");
  assertEqual(result.reasonCode, "valid_credential_acknowledged_manual_reinvoke_request_required", "handoff rejection preserves request-preflight reason");
  assert(result.credentialAcknowledgedManualReinvokeHandoff === undefined, "tampered handoff returns no handoff descriptor");
  assert(!containsForbiddenTruth(result), "tampered handoff rejection leaks no raw truth");
}

async function verifyCanonicalRequestTruthFlowsIntoHandoff(): Promise<void> {
  section("4. Manual Reinvoke Handoff Uses Recomputed Canonical Request Truth");
  const truth = await currentAction();
  const canonicalResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    freshApprovalRequiredAfter: "2026-05-08T16:44:59.000Z",
  });
  assertEqual(canonicalResult.accepted, true, "canonical request handoff is accepted");
  const suppliedManualReinvokeRequest = {
    ...truth.credentialAcknowledgedManualReinvokeRequest,
    requiredCredentialRefs: [...truth.credentialAcknowledgedManualReinvokeRequest.requiredCredentialRefs].reverse(),
    presentCredentialRefs: [...truth.credentialAcknowledgedManualReinvokeRequest.presentCredentialRefs].reverse(),
    hostSuppliedRuntimeSecrets: [...truth.credentialAcknowledgedManualReinvokeRequest.hostSuppliedRuntimeSecrets].reverse(),
    hostSuppliedRuntimeConfig: [...truth.credentialAcknowledgedManualReinvokeRequest.hostSuppliedRuntimeConfig].reverse(),
  };
  const result = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: suppliedManualReinvokeRequest,
    freshApprovalRequiredAfter: "2026-05-08T16:44:59.000Z",
  });

  assertEqual(result.accepted, true, "order-insensitive request handoff is accepted");
  assertEqual(
    result.credentialAcknowledgedManualReinvokeHandoff?.credentialAcknowledgedManualReinvokeHandoffId,
    canonicalResult.credentialAcknowledgedManualReinvokeHandoff?.credentialAcknowledgedManualReinvokeHandoffId,
    "handoff id is stable from recomputed request truth, not supplied label order",
  );
  assertEqual(
    JSON.stringify(result.credentialAcknowledgedManualReinvokeHandoff?.requiredCredentialRefs),
    JSON.stringify(truth.credentialAcknowledgedManualReinvokeRequest.requiredCredentialRefs),
    "handoff returns recomputed required credential label order",
  );
  assertEqual(
    JSON.stringify(result.credentialAcknowledgedManualReinvokeHandoff?.hostSuppliedRuntimeSecrets),
    JSON.stringify(truth.credentialAcknowledgedManualReinvokeRequest.hostSuppliedRuntimeSecrets),
    "handoff returns recomputed runtime secret label order",
  );
  assert(
    JSON.stringify(result.credentialAcknowledgedManualReinvokeHandoff?.requiredCredentialRefs) !==
      JSON.stringify(suppliedManualReinvokeRequest.requiredCredentialRefs),
    "handoff does not trust host-supplied noncanonical label order",
  );
  assert(!containsForbiddenTruth(result), "canonicalized handoff leaks no raw truth");
}

async function verifyAcceptedCredentialAcknowledgedManualReinvokeRequestPreflight(): Promise<void> {
  section("1. Credential-Acknowledged Manual Reinvoke Request Preflight Accepts Current Truth");
  const truth = await currentAction();
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  const request = result.credentialAcknowledgedManualReinvokeRequest;

  assertEqual(result.accepted, true, "current credential-acknowledged manual reinvoke request preflight is accepted");
  assertEqual(result.credentialAcknowledgedManualReinvokeRequestResult.accepted, true, "preflight recomputes accepted request truth");
  assert(Boolean(request), "manual reinvoke request descriptor truth is returned");
  assertEqual(request?.requestKind, "external_media_transfer_credential_acknowledged_manual_reinvoke_request", "request kind is explicit");
  assertEqual(request?.manualReinvokeRequestMode, "host_owned_manual_reinvoke_after_credential_acknowledged_preflight", "request mode is explicit");
  assertEqual(request?.credentialAcknowledgedReplayActionId, truth.credentialAcknowledgedHostAction.credentialAcknowledgedReplayActionId, "request binds credential-acknowledged action id");
  assertEqual(request?.credentialAcknowledgementId, truth.credentialAcknowledgement.credentialAcknowledgementId, "request binds credential acknowledgement id");
  assertEqual(request?.transferKey, truth.credentialAcknowledgedHostAction.transferKey, "request binds transfer key");
  assertEqual(request?.sourceRefFingerprints.length, truth.credentialAcknowledgedHostAction.sourceRefFingerprints.length, "request carries fingerprint-only source set");
  assertEqual(request?.requiredCredentialRefs.length, truth.credentialAcknowledgedHostAction.requiredCredentialRefs.length, "request carries required credential labels only");
  assertEqual(request?.presentCredentialRefs.length, truth.credentialAcknowledgedHostAction.presentCredentialRefs.length, "request carries present credential labels only");
  assertEqual(request?.credentialAcknowledgedHostActionPreflightAccepted, true, "request records preflight acceptance");
  assertEqual(request?.credentialValuesIncluded, false, "request includes no credential values");
  assertEqual(request?.colonyExecutedHostHandler, false, "request executes no host handler");
  assertEqual(request?.colonyResolvedSources, false, "request resolves no sources");
  assertEqual(request?.credentialAcknowledgedManualReinvokeRequestPersisted, false, "request is not persisted");
  assertEqual(request?.retryWorkerCreated, false, "request creates no retry worker");
  assertEqual(request?.automaticVendorRetryAllowed, false, "request allows no automatic vendor retry");
  assertEqual(request?.defaultLiveDeliveryEnabled, false, "request enables no default live delivery");
  assertEqual(request?.credentialAcknowledgedManualReinvokeRequestTruth, "host_owned_manual_reinvoke_request_after_credential_acknowledged_preflight_no_execution_or_persistence", "request truth is explicit");
  assertEqual(result.credentialAcknowledgedManualReinvokeRequestIdMatched, true, "preflight matches request id");
  assertEqual(result.transferKeyMatched, true, "preflight matches transfer key");
  assertEqual(result.credentialValuesExcluded, true, "preflight proves credential values are excluded");
  assertEqual(result.manualReinvokeRequestStillNotExecuted, true, "preflight proves request is still not executed");
  assertEqual(result.persistenceStillBlocked, true, "preflight proves persistence is still blocked");
  assertEqual(result.retryWorkerStillBlocked, true, "preflight proves retry workers are still blocked");
  assertEqual(result.defaultLiveDeliveryStillBlocked, true, "preflight proves default live delivery is still blocked");
  assertEqual(
    result.credentialAcknowledgedManualReinvokeRequestPreflightTruth,
    "recomputed_from_credential_acknowledged_host_action_preflight_and_supplied_manual_reinvoke_request_no_execution",
    "preflight truth is explicit",
  );
  assert(!containsForbiddenTruth(result), "accepted preflight leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyVendorManualReinvokeRequestPreflightPreservesVendorStateGate(): Promise<void> {
  section("2. Vendor Credential-Acknowledged Manual Reinvoke Request Preflight Preserves Vendor-State Gate");
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
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
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
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
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
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(actionResult.accepted, true, "fixture vendor credential-acknowledged action is accepted");
  const manualReinvokeRequestResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
      candidate,
      approval,
      workItem: item,
      sourceRevalidationChecklist: checklist,
      sourceRevalidationChecklistAcknowledgement: acknowledgement,
      sourceRevalidationResult,
      credentialAcknowledgement,
      credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction,
      expectedRetryStage: "vendor_send",
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(manualReinvokeRequestResult.accepted, true, "fixture vendor manual reinvoke request is accepted");
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: manualReinvokeRequestResult.credentialAcknowledgedManualReinvokeRequest,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });

  assertEqual(result.accepted, true, "vendor credential-acknowledged manual reinvoke request preflight is accepted");
  assertEqual(result.credentialAcknowledgedManualReinvokeRequest?.requiresVendorStateCheck, true, "vendor request preserves vendor-state requirement");
  assertEqual(result.credentialAcknowledgedManualReinvokeRequest?.vendorStateVerificationRequiredBeforeHostSend, true, "vendor request requires vendor-state verification before host send");
  assertEqual(result.credentialAcknowledgedManualReinvokeRequest?.automaticVendorRetryAllowed, false, "vendor request still blocks automatic vendor retry");
  assertEqual(result.credentialAcknowledgedManualReinvokeRequest?.credentialPersistenceCreated, false, "vendor request creates no credential persistence");
  assertEqual(result.credentialAcknowledgedManualReinvokeRequest?.publicHostingEnabled, false, "vendor request enables no public hosting");
  assertEqual(result.requiresVendorStateCheckMatched, true, "vendor preflight matches vendor-state gate");
  assertEqual(result.automaticVendorRetryStillBlocked, true, "vendor preflight still blocks automatic vendor retry");
  assert(!containsForbiddenTruth(result), "vendor preflight leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyTamperedCredentialAcknowledgedManualReinvokeRequestBlocksPreflight(): Promise<void> {
  section("3. Tampered Credential-Acknowledged Manual Reinvoke Request Blocks Preflight");
  const truth = await currentAction();
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: {
      ...truth.credentialAcknowledgedManualReinvokeRequest,
      transferKey: "media-transfer:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    },
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });

  assertEqual(result.accepted, false, "tampered manual reinvoke request blocks preflight");
  assertEqual(result.reasonCode, "credential_acknowledged_manual_reinvoke_request_current_truth_mismatch", "tampered request rejection is bounded");
  assertEqual(result.transferKeyMatched, false, "preflight reports transfer-key mismatch");
  assert(result.credentialAcknowledgedManualReinvokeRequest === undefined, "tampered preflight returns no manual reinvoke request");
  assert(!containsForbiddenTruth(result), "tampered request rejection leaks no raw truth");
}

async function verifyManualReinvokeRequestPreflightUsesRecomputedCanonicalTruth(): Promise<void> {
  section("4. Manual Reinvoke Request Preflight Uses Recomputed Canonical Truth");
  const truth = await currentAction();
  const suppliedManualReinvokeRequest = {
    ...truth.credentialAcknowledgedManualReinvokeRequest,
    requiredCredentialRefs: [...truth.credentialAcknowledgedManualReinvokeRequest.requiredCredentialRefs].reverse(),
    presentCredentialRefs: [...truth.credentialAcknowledgedManualReinvokeRequest.presentCredentialRefs].reverse(),
    hostSuppliedRuntimeSecrets: [...truth.credentialAcknowledgedManualReinvokeRequest.hostSuppliedRuntimeSecrets].reverse(),
    hostSuppliedRuntimeConfig: [...truth.credentialAcknowledgedManualReinvokeRequest.hostSuppliedRuntimeConfig].reverse(),
  };
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: suppliedManualReinvokeRequest,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });

  assertEqual(result.accepted, true, "order-insensitive manual reinvoke request is accepted before later trust");
  assertEqual(result.requiredCredentialRefsMatched, true, "required credential labels match by set truth");
  assertEqual(result.presentCredentialRefsMatched, true, "present credential labels match by set truth");
  assertEqual(
    JSON.stringify(result.credentialAcknowledgedManualReinvokeRequest?.requiredCredentialRefs),
    JSON.stringify(truth.credentialAcknowledgedManualReinvokeRequest.requiredCredentialRefs),
    "request returns recomputed required credential label order",
  );
  assertEqual(
    JSON.stringify(result.credentialAcknowledgedManualReinvokeRequest?.hostSuppliedRuntimeSecrets),
    JSON.stringify(truth.credentialAcknowledgedManualReinvokeRequest.hostSuppliedRuntimeSecrets),
    "request returns recomputed runtime secret label order",
  );
  assert(
    JSON.stringify(result.credentialAcknowledgedManualReinvokeRequest?.requiredCredentialRefs) !==
      JSON.stringify(suppliedManualReinvokeRequest.requiredCredentialRefs),
    "request does not trust host-supplied noncanonical label order",
  );
  assert(!containsForbiddenTruth(result), "canonicalized preflight leaks no raw truth");
}

async function verifyExecutionAndCredentialClaimsRejectedByManualReinvokeRequestPreflight(): Promise<void> {
  section("5. Execution And Credential Claims Reject In Manual Reinvoke Request Preflight");
  const truth = await currentAction();
  const executionResult = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: {
      ...truth.credentialAcknowledgedManualReinvokeRequest,
      colonyExecutedHostHandler: true,
    },
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(executionResult.accepted, false, "execution claim is rejected");
  assertEqual(executionResult.reasonCode, "valid_credential_acknowledged_manual_reinvoke_request_required", "execution claim rejection is bounded");
  assert(executionResult.credentialAcknowledgedManualReinvokeRequest === undefined, "execution claim returns no manual reinvoke request");

  const credentialResult = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: {
      ...truth.credentialAcknowledgedManualReinvokeRequest,
      credentialValuesPersisted: true,
      sourceAccessCredential: "xoxb-real-credential-value",
    },
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(credentialResult.accepted, false, "credential value claim is rejected");
  assertEqual(credentialResult.reasonCode, "valid_credential_acknowledged_manual_reinvoke_request_required", "credential value claim rejection is bounded");
  assert(credentialResult.credentialAcknowledgedManualReinvokeRequest === undefined, "credential value claim returns no manual reinvoke request");

  const nestedRawSourceResult = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: {
      ...truth.credentialAcknowledgedManualReinvokeRequest,
      sourceRefFingerprints: truth.credentialAcknowledgedManualReinvokeRequest.sourceRefFingerprints.map((source, index) => index === 0
        ? {
          ...source,
          rawSourceRef: "artifact:phase165_report_0",
          privateUrl: "https://files.slack.com/private?token=xoxb-phase164-secret",
        }
        : source),
    },
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(nestedRawSourceResult.accepted, false, "nested raw source fields are rejected");
  assertEqual(nestedRawSourceResult.reasonCode, "valid_credential_acknowledged_manual_reinvoke_request_required", "nested raw source rejection is bounded");
  assert(nestedRawSourceResult.credentialAcknowledgedManualReinvokeRequest === undefined, "nested raw source returns no manual reinvoke request");
  assert(!containsForbiddenTruth([executionResult, credentialResult, nestedRawSourceResult]), "invalid request rejections leak no raw truth");
}

async function verifyStaleApprovalRejectedBeforeCredentialAcknowledgedManualReinvokeRequestPreflight(): Promise<void> {
  section("6. Stale Approval Rejects Before Credential-Acknowledged Manual Reinvoke Request Preflight");
  const truth = await currentAction();
  const result = await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
    candidate: truth.candidate,
    approval: {
      approvedBy: "operator",
      signature: await createExternalChannelMediaTransferApprovalSignature(truth.candidate),
      approvedAt: "2026-05-08T16:13:00.000Z",
    },
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });

  assertEqual(result.accepted, false, "stale approval request is rejected");
  assertEqual(result.reasonCode, "fresh_approval_required", "stale approval rejection preserves bounded reason");
  assertEqual(result.credentialAcknowledgedManualReinvokeRequestResult.accepted, false, "stale approval rejects recomputed request");
  assert(result.credentialAcknowledgedManualReinvokeRequest === undefined, "stale approval returns no manual reinvoke request");
  assert(!containsForbiddenTruth(result), "stale approval rejection leaks no raw truth");
}

async function currentVendorHandoff() {
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
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
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
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
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
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(actionResult.accepted, true, "fixture vendor credential-acknowledged action is accepted");
  const requestResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeRequest({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(requestResult.accepted, true, "fixture vendor manual reinvoke request is accepted");
  const handoffResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff({
    candidate,
    approval,
    workItem: item,
    sourceRevalidationChecklist: checklist,
    sourceRevalidationChecklistAcknowledgement: acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: requestResult.credentialAcknowledgedManualReinvokeRequest,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(handoffResult.accepted, true, "fixture vendor handoff is accepted");
  return {
    candidate,
    approval,
    item,
    checklist,
    acknowledgement,
    sourceRevalidationResult,
    credentialAcknowledgement,
    credentialAcknowledgedHostAction: actionResult.credentialAcknowledgedHostAction!,
    credentialAcknowledgedManualReinvokeRequest: requestResult.credentialAcknowledgedManualReinvokeRequest!,
    credentialAcknowledgedManualReinvokeHandoff: handoffResult.credentialAcknowledgedManualReinvokeHandoff!,
  };
}

function vendorStateVerificationFor(
  handoff: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeHandoff,
): {
  handoffId: string;
  transferKey: string;
  verifiedAt: string;
  verifiedBy: string;
  vendorStateVerificationTruth: "host_verified_vendor_state_before_manual_reinvoke_no_automatic_vendor_retry";
} {
  return {
    handoffId: handoff.credentialAcknowledgedManualReinvokeHandoffId,
    transferKey: handoff.transferKey,
    verifiedAt: "2026-05-08T17:05:00.000Z",
    verifiedBy: "operator",
    vendorStateVerificationTruth: "host_verified_vendor_state_before_manual_reinvoke_no_automatic_vendor_retry",
  };
}

async function verifyCredentialAcknowledgedManualReinvokeExecutesThroughExistingHostWorker(): Promise<void> {
  section("7. Credential-Acknowledged Manual Reinvoke Executes Through Existing Host Worker");
  const truth = await currentAction();
  let resolvedCount = 0;
  let sendCount = 0;
  const result = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => {
        resolvedCount++;
        assertEqual(request.attemptNumber, 1, "manual reinvoke source resolution starts from a fresh first attempt");
        assertEqual(request.isRetryAttempt, false, "manual reinvoke does not reuse foreground retry context by default");
        return {
          sourceRefFingerprint: request.sourceRefFingerprint,
          sizeBytes: request.sizeBytes,
        };
      },
      sendToVendor: async (action) => {
        sendCount++;
        assertEqual(action.transferKey, truth.credentialAcknowledgedManualReinvokeHandoff.transferKey, "manual reinvoke sender receives current transfer key");
        return {
          accepted: true,
          transferKey: action.transferKey,
          deliveredCount: action.files.length,
          vendorMessageId: "phase165-message",
        };
      },
    }),
  });

  assertEqual(result.accepted, true, "manual reinvoke execution is accepted");
  assertEqual(result.hostExecutionAttempted, true, "host execution is attempted only after accepted handoff preflight");
  assertEqual(result.handoffPreflight.accepted, true, "execution recomputes accepted handoff preflight");
  assertEqual(result.hostResult?.isError, false, "existing host request path succeeds");
  assertEqual(result.hostResult?.data.transferKey, truth.credentialAcknowledgedManualReinvokeHandoff.transferKey, "host result preserves transfer key");
  assertEqual(result.hostResult?.data.transferKeyEchoMatched, true, "transfer-key echo integrity is preserved");
  assertEqual(result.hostResult?.data.credentialPersistenceCreated, false, "host result creates no credential persistence");
  assertEqual(result.hostResult?.data.defaultPublicHostingEnabled, false, "host result creates no public hosting");
  assertEqual(result.hostResult?.data.liveDeliveryEnabled, false, "host result enables no live delivery");
  assertEqual(resolvedCount, truth.credentialAcknowledgedManualReinvokeHandoff.sourceRefFingerprints.length, "manual reinvoke resolves each source freshly");
  assertEqual(sendCount, 1, "manual reinvoke delegates one vendor send to the injected host sender");
  assert(!containsForbiddenTruth(result), "manual reinvoke execution leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyVendorStateMustBeVerifiedBeforeManualReinvokeExecution(): Promise<void> {
  section("8. Vendor-State Gate Blocks Manual Reinvoke Execution Until Host Verification");
  const truth = await currentVendorHandoff();
  let handlerCalled = false;
  const blocked = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => ({
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
      }),
      sendToVendor: async (action) => {
        handlerCalled = true;
        return { accepted: true, transferKey: "unexpected" };
      },
    }),
  });
  assertEqual(blocked.accepted, false, "vendor manual reinvoke is blocked before vendor-state verification");
  assertEqual(blocked.reasonCode, "vendor_state_verification_required_before_manual_reinvoke", "vendor-state rejection is bounded");
  assertEqual(blocked.hostExecutionAttempted, false, "vendor-state rejection does not call host handler");
  assertEqual(handlerCalled, false, "handler is not called before vendor-state verification");

  const forgedVerification = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    vendorStateVerification: {
      ...vendorStateVerificationFor(truth.credentialAcknowledgedManualReinvokeHandoff),
      transferKey: "media-transfer:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    },
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => ({
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
      }),
      sendToVendor: async () => {
        handlerCalled = true;
        return { accepted: true, transferKey: "unexpected" };
      },
    }),
  });
  assertEqual(forgedVerification.accepted, false, "forged vendor-state verification is blocked");
  assertEqual(forgedVerification.reasonCode, "vendor_state_verification_required_before_manual_reinvoke", "forged vendor-state rejection is bounded");
  assertEqual(forgedVerification.hostExecutionAttempted, false, "forged vendor-state rejection does not call host handler");
  assertEqual(handlerCalled, false, "handler is still not called after forged vendor-state verification");

  const executed = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    vendorStateVerification: vendorStateVerificationFor(truth.credentialAcknowledgedManualReinvokeHandoff),
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => ({
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
      }),
      sendToVendor: async (action) => ({
        accepted: true,
        transferKey: action.transferKey,
        deliveredCount: action.files.length,
      }),
    }),
  });
  assertEqual(executed.accepted, true, "vendor manual reinvoke executes after explicit vendor-state verification");
  assertEqual(executed.vendorStateVerified, true, "execution result records host vendor-state verification");
  assertEqual(executed.hostResult?.isError, false, "verified vendor manual reinvoke succeeds through existing host request path");
  assert(!containsForbiddenTruth([blocked, forgedVerification, executed]), "vendor manual reinvoke results leak no raw truth");
}

async function verifyManualReinvokeExecutionFailsClosedForMissingHandlerAndTampering(): Promise<void> {
  section("9. Manual Reinvoke Execution Fails Closed For Missing Handler And Tampering");
  const truth = await currentAction();
  const missingHandler = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(missingHandler.accepted, false, "missing handler blocks manual reinvoke execution");
  assertEqual(missingHandler.reasonCode, "manual_reinvoke_handler_required", "missing handler rejection is bounded");
  assertEqual(missingHandler.hostExecutionAttempted, false, "missing handler does not attempt execution");

  let rawHandlerCalled = false;
  const rawHandler = (async () => {
    rawHandlerCalled = true;
    return { accepted: true, transferKey: "unexpected" };
  }) as unknown as ExternalChannelMediaTransferManualReinvokeWorkerHandler;
  const unmarkedHandler = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    mediaTransferHandler: rawHandler,
  });
  assertEqual(unmarkedHandler.accepted, false, "unmarked handler blocks manual reinvoke execution");
  assertEqual(unmarkedHandler.reasonCode, "manual_reinvoke_worker_handler_required", "unmarked handler rejection is bounded");
  assertEqual(unmarkedHandler.hostExecutionAttempted, false, "unmarked handler does not attempt execution");
  assertEqual(rawHandlerCalled, false, "raw handler is not called before manual reinvoke execution");

  let forgedHandlerCalled = false;
  const forgedHandler = (async () => {
    forgedHandlerCalled = true;
    return { accepted: true, transferKey: "unexpected" };
  }) as unknown as ExternalChannelMediaTransferManualReinvokeWorkerHandler;
  Object.defineProperty(forgedHandler, "manualReinvokeExecutionHandlerTruth", {
    value: "foreground_worker_handler_resolves_sources_freshly_before_vendor_send",
    enumerable: false,
  });
  const forgedHandlerResult = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    mediaTransferHandler: forgedHandler,
  });
  assertEqual(forgedHandlerResult.accepted, false, "forged handler marker blocks manual reinvoke execution");
  assertEqual(forgedHandlerResult.reasonCode, "manual_reinvoke_worker_handler_required", "forged handler marker rejection is bounded");
  assertEqual(forgedHandlerResult.hostExecutionAttempted, false, "forged handler marker does not attempt execution");
  assertEqual(forgedHandlerCalled, false, "forged handler is not called before manual reinvoke execution");

  const tamperedHandoff = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: {
      ...truth.credentialAcknowledgedManualReinvokeHandoff,
      transferKey: "media-transfer:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    },
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => ({
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
      }),
      sendToVendor: async () => ({ accepted: true, transferKey: "unexpected" }),
    }),
  });
  assertEqual(tamperedHandoff.accepted, false, "tampered handoff blocks manual reinvoke execution");
  assertEqual(tamperedHandoff.reasonCode, "credential_acknowledged_manual_reinvoke_handoff_current_truth_mismatch", "tampered handoff rejection is bounded");
  assertEqual(tamperedHandoff.hostExecutionAttempted, false, "tampered handoff does not attempt execution");
  assert(!containsForbiddenTruth([missingHandler, unmarkedHandler, forgedHandlerResult, tamperedHandoff]), "manual reinvoke execution rejections leak no raw truth");
}

async function verifyManualReinvokeExecutionRejectsCredentialAndExecutionClaims(): Promise<void> {
  section("10. Manual Reinvoke Execution Rejects Credential And Execution Claims");
  const truth = await currentAction();
  const executionClaim = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: {
      ...truth.credentialAcknowledgedManualReinvokeHandoff,
      colonyExecutedHostHandler: true,
    },
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => ({
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
      }),
      sendToVendor: async () => ({ accepted: true, transferKey: "unexpected" }),
    }),
  });
  assertEqual(executionClaim.accepted, false, "execution claim is rejected before handler execution");
  assertEqual(executionClaim.reasonCode, "valid_credential_acknowledged_manual_reinvoke_handoff_required", "execution claim rejection is bounded");
  assertEqual(executionClaim.hostExecutionAttempted, false, "execution claim does not call handler");

  const credentialClaim = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: {
      ...truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialValuesPersisted: true,
      sourceAccessCredential: "xoxb-real-credential-value",
    },
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => ({
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
      }),
      sendToVendor: async () => ({ accepted: true, transferKey: "unexpected" }),
    }),
  });
  assertEqual(credentialClaim.accepted, false, "credential claim is rejected before handler execution");
  assertEqual(credentialClaim.reasonCode, "valid_credential_acknowledged_manual_reinvoke_handoff_required", "credential claim rejection is bounded");
  assertEqual(credentialClaim.hostExecutionAttempted, false, "credential claim does not call handler");
  assert(!containsForbiddenTruth([executionClaim, credentialClaim]), "manual reinvoke execution claim rejections leak no raw truth");
}

async function executedSourceManualReinvoke(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}) {
  const truth = await currentAction(overrides);
  const execution = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => ({
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
      }),
      sendToVendor: async (action) => ({
        accepted: true,
        transferKey: action.transferKey,
        deliveredCount: action.files.length,
        vendorMessageId: "phase166-vendor-message",
        receipt: {
          receiptId: "phase166-host-receipt",
          status: "delivered",
          deliveredCount: action.files.length,
          receiptUrl: "https://vendor.example/private/phase166?token=secret",
        },
      }),
    }),
  });
  assertEqual(execution.accepted, true, "fixture manual reinvoke execution is accepted");
  return { truth, execution };
}

async function verifyManualReinvokeExecutionReceiptBindsSanitizedHostResult(): Promise<void> {
  section("11. Manual Reinvoke Execution Receipt Binds Sanitized Host Result");
  const { truth, execution } = await executedSourceManualReinvoke();
  const receiptResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });

  const receipt = receiptResult.credentialAcknowledgedManualReinvokeExecutionReceipt;
  assertEqual(receiptResult.accepted, true, "execution receipt is accepted");
  assert(Boolean(receipt), "execution receipt is returned");
  assertEqual(receipt?.credentialAcknowledgedManualReinvokeHandoffId, truth.credentialAcknowledgedManualReinvokeHandoff.credentialAcknowledgedManualReinvokeHandoffId, "receipt binds current handoff id");
  assertEqual(receipt?.credentialAcknowledgedManualReinvokeRequestId, truth.credentialAcknowledgedManualReinvokeHandoff.credentialAcknowledgedManualReinvokeRequestId, "receipt binds current request id");
  assertEqual(receipt?.transferKey, truth.credentialAcknowledgedManualReinvokeHandoff.transferKey, "receipt binds current transfer key");
  assertEqual(receipt?.sourceRefFingerprints.length, truth.credentialAcknowledgedManualReinvokeHandoff.sourceRefFingerprints.length, "receipt carries source fingerprints only");
  assertEqual(receipt?.hostResultAccepted, true, "receipt records host result accepted");
  assertEqual(receipt?.transferKeyEchoMatched, true, "receipt records transfer-key echo truth");
  assertEqual(receipt?.hostReportedDeliveredCount, truth.credentialAcknowledgedManualReinvokeHandoff.sourceRefFingerprints.length, "receipt carries bounded host delivered count");
  assertEqual(receipt?.hostReceiptMetadataIncluded, true, "receipt records sanitized host receipt metadata presence");
  assertEqual(receipt?.hostReceiptUrlPersisted, false, "receipt does not persist receipt URLs");
  assertEqual(receipt?.credentialPersistenceCreated, false, "receipt creates no credential persistence");
  assertEqual(receipt?.defaultLiveDeliveryEnabled, false, "receipt enables no default live delivery");
  assertEqual(receipt?.publicHostingEnabled, false, "receipt enables no public hosting");
  assertEqual(receipt?.retryLedgerCreated, false, "receipt creates no retry ledger");
  assertEqual(receipt?.durableRetryAuditRecordCreated, false, "receipt creates no durable retry audit record");
  assertEqual(receipt?.automaticVendorRetryAllowed, false, "receipt allows no automatic vendor retry");
  assertEqual(receipt?.credentialAcknowledgedManualReinvokeExecutionReceiptPersisted, false, "receipt is not persisted by Colony");
  assertEqual(receipt?.credentialAcknowledgedManualReinvokeExecutionReceiptTruth, "host_reported_manual_reinvoke_execution_receipt_no_raw_refs_credentials_urls_or_default_live_delivery", "receipt truth is explicit");
  assert(!containsForbiddenTruth(receiptResult), "execution receipt leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyVendorManualReinvokeExecutionReceiptRequiresVendorStateExecution(): Promise<void> {
  section("12. Vendor Manual Reinvoke Execution Receipt Requires Verified Execution");
  const truth = await currentVendorHandoff();
  const execution = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    vendorStateVerification: vendorStateVerificationFor(truth.credentialAcknowledgedManualReinvokeHandoff),
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => ({
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
      }),
      sendToVendor: async (action) => ({
        accepted: true,
        transferKey: action.transferKey,
        deliveredCount: action.files.length,
      }),
    }),
  });
  assertEqual(execution.accepted, true, "fixture vendor manual reinvoke execution is accepted");

  const receiptResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      expectedRetryStage: "vendor_send",
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(receiptResult.accepted, true, "vendor execution receipt is accepted after verified execution");
  assertEqual(receiptResult.credentialAcknowledgedManualReinvokeExecutionReceipt?.vendorStateVerified, true, "vendor receipt binds vendor-state verification truth");

  const forgedExecution: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionResult = {
    ...execution,
    vendorStateVerified: false,
  };
  const rejected =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: forgedExecution,
      expectedRetryStage: "vendor_send",
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(rejected.accepted, false, "vendor receipt rejects execution without vendor-state truth");
  assertEqual(rejected.reasonCode, "credential_acknowledged_manual_reinvoke_execution_current_truth_mismatch", "vendor-state mismatch rejection is bounded");
  assert(!containsForbiddenTruth([receiptResult, rejected]), "vendor execution receipt results leak no raw truth");
}

async function verifyManualReinvokeExecutionReceiptRejectsTamperedOrFailedExecution(): Promise<void> {
  section("13. Manual Reinvoke Execution Receipt Rejects Tampered Or Failed Execution");
  const { truth, execution } = await executedSourceManualReinvoke();
  const tampered: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionResult = {
    ...execution,
    hostResult: execution.hostResult
      ? {
        ...execution.hostResult,
        data: {
          ...execution.hostResult.data,
          transferKey: "media-transfer:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        },
      }
      : execution.hostResult,
  };
  const tamperedResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: tampered,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(tamperedResult.accepted, false, "tampered transfer-key execution blocks receipt");
  assertEqual(tamperedResult.reasonCode, "credential_acknowledged_manual_reinvoke_execution_current_truth_mismatch", "tampered execution rejection is bounded");

  const failed: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionResult = {
    ...execution,
    accepted: false,
    reasonCode: "host_manual_reinvoke_failed",
    hostResult: execution.hostResult
      ? {
        ...execution.hostResult,
        isError: true,
      }
      : execution.hostResult,
  };
  const failedResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: failed,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(failedResult.accepted, false, "failed host execution blocks receipt");
  assertEqual(failedResult.reasonCode, "accepted_credential_acknowledged_manual_reinvoke_execution_required", "failed execution rejection is bounded");

  const contaminated: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionResult =
    {
      ...execution,
      credentialValuesPersisted: true,
      rawSourceRef: "artifact:phase166_report_0",
      retryLedgerCreated: true,
      hostResult: execution.hostResult
        ? {
          ...execution.hostResult,
          data: {
            ...execution.hostResult.data,
            credentialValue: "xoxb-phase166-secret",
            privateUrl: "https://vendor.example/private?token=phase166",
            retryLedgerCreated: true,
          },
        }
        : execution.hostResult,
    } as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionResult;
  const contaminatedResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: contaminated,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(contaminatedResult.accepted, false, "contaminated execution envelope blocks receipt");
  assertEqual(contaminatedResult.reasonCode, "accepted_credential_acknowledged_manual_reinvoke_execution_required", "contaminated execution rejection is bounded");
  assert(!containsForbiddenTruth([tamperedResult, failedResult]), "execution receipt rejection results leak no raw truth");
  assert(!containsForbiddenTruth(contaminatedResult), "contaminated execution rejection leaks no raw truth");
}

async function executionReceiptFixture(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}) {
  const { truth, execution } = await executedSourceManualReinvoke(overrides);
  const receiptResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(receiptResult.accepted, true, "fixture execution receipt is accepted");
  assert(Boolean(receiptResult.credentialAcknowledgedManualReinvokeExecutionReceipt), "fixture execution receipt is returned");
  return {
    truth,
    execution,
    receiptResult,
    receipt: receiptResult.credentialAcknowledgedManualReinvokeExecutionReceipt!,
  };
}

async function verifyManualReinvokeExecutionReceiptPreflightAcceptsCurrentReceipt(): Promise<void> {
  section("14. Manual Reinvoke Execution Receipt Preflight Accepts Current Receipt");
  const { truth, execution, receipt } = await executionReceiptFixture();
  const preflight =
    await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(preflight.accepted, true, "current execution receipt preflight is accepted");
  assertEqual(preflight.credentialAcknowledgedManualReinvokeExecutionReceiptId, receipt.credentialAcknowledgedManualReinvokeExecutionReceiptId, "preflight binds supplied receipt id");
  assertEqual(preflight.credentialAcknowledgedManualReinvokeExecutionReceiptIdMatched, true, "receipt id matches recomputed truth");
  assertEqual(preflight.transferKeyMatched, true, "receipt preflight binds transfer key truth");
  assertEqual(preflight.hostReportedDeliveredCountMatched, true, "receipt preflight binds delivered-count truth");
  assertEqual(preflight.vendorStateVerifiedMatched, true, "receipt preflight binds vendor-state truth");
  assertEqual(preflight.executionReceiptStillNotPersisted, true, "receipt preflight persists no receipt");
  assertEqual(preflight.retryLedgerStillBlocked, true, "receipt preflight creates no retry ledger");
  assertEqual(preflight.defaultLiveDeliveryStillBlocked, true, "receipt preflight keeps default live delivery blocked");
  assertEqual(preflight.publicHostingStillBlocked, true, "receipt preflight keeps public hosting blocked");
  assertEqual(
    preflight.credentialAcknowledgedManualReinvokeExecutionReceiptPreflightTruth,
    "recomputed_from_credential_acknowledged_manual_reinvoke_execution_and_supplied_receipt_no_persistence",
    "receipt preflight truth is explicit",
  );
  assert(!containsForbiddenTruth(preflight), "accepted execution receipt preflight leaks no raw truth");
}

async function verifyVendorManualReinvokeExecutionReceiptPreflightRequiresVendorStateTruth(): Promise<void> {
  section("15. Vendor Manual Reinvoke Execution Receipt Preflight Requires Vendor-State Truth");
  const truth = await currentVendorHandoff();
  const execution = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    vendorStateVerification: vendorStateVerificationFor(truth.credentialAcknowledgedManualReinvokeHandoff),
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => ({
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
      }),
      sendToVendor: async (action) => ({
        accepted: true,
        transferKey: action.transferKey,
        deliveredCount: action.files.length,
      }),
    }),
  });
  assertEqual(execution.accepted, true, "fixture vendor execution is accepted");
  const receiptResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      expectedRetryStage: "vendor_send",
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  const receipt = receiptResult.credentialAcknowledgedManualReinvokeExecutionReceipt!;
  const accepted =
    await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      expectedRetryStage: "vendor_send",
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(accepted.accepted, true, "vendor execution receipt preflight accepts verified vendor truth");
  assertEqual(accepted.vendorStateVerifiedMatched, true, "vendor receipt preflight binds verified vendor truth");

  const forgedReceipt: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt = {
    ...receipt,
    vendorStateVerified: false,
  };
  const rejected =
    await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: forgedReceipt,
      expectedRetryStage: "vendor_send",
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(rejected.accepted, false, "vendor receipt preflight rejects missing vendor-state truth");
  assertEqual(rejected.reasonCode, "credential_acknowledged_manual_reinvoke_execution_receipt_current_truth_mismatch", "vendor receipt mismatch rejection is bounded");
  assert(!containsForbiddenTruth([accepted, rejected]), "vendor receipt preflight results leak no raw truth");
}

async function verifyManualReinvokeExecutionReceiptPreflightRejectsTamperingAndClaims(): Promise<void> {
  section("16. Manual Reinvoke Execution Receipt Preflight Rejects Tampering And Claims");
  const { truth, execution, receipt } = await executionReceiptFixture();
  const tampered: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt = {
    ...receipt,
    transferKey: "media-transfer:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  };
  const tamperedResult =
    await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: tampered,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(tamperedResult.accepted, false, "tampered receipt preflight is rejected");
  assertEqual(tamperedResult.reasonCode, "credential_acknowledged_manual_reinvoke_execution_receipt_current_truth_mismatch", "tampered receipt rejection is bounded");

  const contaminated = {
    ...receipt,
    credentialValuesPersisted: true,
    rawSourceRef: "artifact:phase167_report_0",
    privateUrl: "https://vendor.example/private/phase167?token=secret",
    retryLedgerCreated: true,
  };
  const contaminatedResult =
    await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: contaminated,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(contaminatedResult.accepted, false, "contaminated receipt preflight is rejected");
  assertEqual(contaminatedResult.reasonCode, "valid_credential_acknowledged_manual_reinvoke_execution_receipt_required", "contaminated receipt rejection is bounded");

  const unsafeReceiptId = {
    ...receipt,
    credentialAcknowledgedManualReinvokeExecutionReceiptId:
      `${receipt.credentialAcknowledgedManualReinvokeExecutionReceiptId}:https://vendor.example/private/phase167?token=secret`,
  };
  const unsafeReceiptIdResult =
    await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: unsafeReceiptId,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(unsafeReceiptIdResult.accepted, false, "unsafe receipt id value is rejected before mismatch reporting");
  assertEqual(unsafeReceiptIdResult.reasonCode, "valid_credential_acknowledged_manual_reinvoke_execution_receipt_required", "unsafe receipt id rejection is bounded");

  const missingDeliveredCountExecution = {
    ...execution,
    hostResult: {
      ...execution.hostResult,
      data: { ...execution.hostResult?.data },
    },
  } as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionResult;
  delete (missingDeliveredCountExecution.hostResult?.data as Record<string, unknown>).deliveredCount;
  const missingDeliveredCountReceipt =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: missingDeliveredCountExecution,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(missingDeliveredCountReceipt.accepted, false, "missing host delivered-count truth blocks execution receipt");
  assertEqual(missingDeliveredCountReceipt.reasonCode, "accepted_credential_acknowledged_manual_reinvoke_execution_required", "missing delivered-count rejection is bounded");
  assert(!containsForbiddenTruth([tamperedResult, contaminatedResult, unsafeReceiptIdResult, missingDeliveredCountReceipt]), "receipt preflight rejections leak no raw truth");
}

async function verifyManualReinvokeExecutionReceiptCloseoutAcceptsReceiptPreflight(): Promise<void> {
  section("17. Manual Reinvoke Execution Receipt Closeout Binds Accepted Receipt Preflight");
  const { truth, execution, receipt } = await executionReceiptFixture();
  const closeoutResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(closeoutResult.accepted, true, "receipt closeout is accepted after accepted receipt preflight");
  assert(closeoutResult.credentialAcknowledgedManualReinvokeExecutionReceiptPreflight.accepted, "closeout recomputes accepted receipt preflight");
  const closeout = closeoutResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseout as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout;
  assert(!!closeout, "closeout descriptor is returned");
  assert(closeout.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutId.startsWith("manual-retry-source-revalidation-credential-ack-reinvoke-execution-receipt-closeout:"), "closeout id is deterministic and scoped");
  assertEqual(closeout.credentialAcknowledgedManualReinvokeExecutionReceiptId, receipt.credentialAcknowledgedManualReinvokeExecutionReceiptId, "closeout binds receipt id");
  assertEqual(closeout.workItemCorrelationId, receipt.workItemCorrelationId, "closeout binds work item correlation");
  assertEqual(closeout.transferKey, receipt.transferKey, "closeout binds transfer key");
  assertEqual(closeout.retryStage, receipt.retryStage, "closeout binds retry stage");
  assertEqual(closeout.vendorStateVerified, receipt.vendorStateVerified, "closeout binds vendor-state truth");
  assertEqual(closeout.hostReportedDeliveredCount, receipt.hostReportedDeliveredCount, "closeout binds delivered-count truth");
  assertEqual(closeout.manualRetryWorkItemCloseoutReady, true, "closeout readiness is explicit");
  assertEqual(closeout.manualRetryWorkItemClosedByColony, false, "closeout does not claim durable Colony closure");
  assertEqual(closeout.retryLedgerCreated, false, "closeout creates no retry ledger");
  assertEqual(closeout.durableRetryAuditRecordCreated, false, "closeout creates no durable retry audit record");
  assertEqual(closeout.retryWorkerCreated, false, "closeout creates no retry worker");
  assertEqual(closeout.automaticVendorRetryAllowed, false, "closeout allows no automatic vendor retry");
  assertEqual(closeout.defaultLiveDeliveryEnabled, false, "closeout enables no default live delivery");
  assertEqual(closeout.publicHostingEnabled, false, "closeout enables no public hosting");
  assertEqual(closeout.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutTruth, "receipt_preflight_bound_manual_retry_work_item_closeout_readiness_no_retry_ledger", "closeout truth is explicit");
  assert(!containsForbiddenTruth([closeoutResult]), "accepted receipt closeout leaks no raw truth");
}

async function verifyManualReinvokeExecutionReceiptCloseoutRejectsTamperedReceiptPreflight(): Promise<void> {
  section("18. Manual Reinvoke Execution Receipt Closeout Rejects Tampered Receipt Preflight");
  const { truth, execution, receipt } = await executionReceiptFixture();
  const tampered: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt = {
    ...receipt,
    transferKey: "media-transfer:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  };
  const closeoutResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: tampered,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(closeoutResult.accepted, false, "tampered receipt blocks closeout");
  assertEqual(closeoutResult.reasonCode, "credential_acknowledged_manual_reinvoke_execution_receipt_current_truth_mismatch", "tampered closeout rejection is bounded");
  assertEqual(closeoutResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseout, undefined, "rejected closeout returns no descriptor");
  assertEqual(closeoutResult.manualRetryWorkItemCloseoutReady, false, "rejected closeout is not ready");
  assertEqual(closeoutResult.retryLedgerCreated, false, "rejected closeout creates no retry ledger");
  assertEqual(closeoutResult.durableRetryAuditRecordCreated, false, "rejected closeout creates no durable retry audit record");
  assert(!containsForbiddenTruth([closeoutResult]), "rejected receipt closeout leaks no raw truth");
}

async function verifyManualReinvokeExecutionReceiptCloseoutPreflightAcceptsCurrentCloseout(): Promise<void> {
  section("19. Manual Reinvoke Execution Receipt Closeout Preflight Accepts Current Closeout");
  const { truth, execution, receipt } = await executionReceiptFixture();
  const closeoutResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(closeoutResult.accepted, true, "fixture receipt closeout is accepted");
  const closeout = closeoutResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseout as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout;
  assert(!!closeout, "fixture receipt closeout is returned");

  const preflightResult =
    await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });

  assertEqual(preflightResult.accepted, true, "current receipt closeout preflight is accepted");
  assert(preflightResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutResult.accepted, "preflight recomputes accepted closeout truth");
  assertEqual(preflightResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutId, closeout.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutId, "preflight binds supplied closeout id");
  assertEqual(preflightResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutIdMatched, true, "closeout id matches recomputed truth");
  assertEqual(preflightResult.transferKeyMatched, true, "closeout preflight binds transfer key truth");
  assertEqual(preflightResult.workItemCorrelationMatched, true, "closeout preflight binds work-item correlation truth");
  assertEqual(preflightResult.manualRetryWorkItemCloseoutReady, true, "closeout preflight preserves readiness truth");
  assertEqual(preflightResult.manualRetryWorkItemClosedByColony, false, "closeout preflight does not claim durable Colony closure");
  assertEqual(preflightResult.closeoutPersistenceStillBlocked, true, "closeout preflight persists no closeout");
  assertEqual(preflightResult.retryLedgerStillBlocked, true, "closeout preflight creates no retry ledger");
  assertEqual(preflightResult.durableRetryAuditStillBlocked, true, "closeout preflight creates no durable audit record");
  assertEqual(preflightResult.defaultLiveDeliveryStillBlocked, true, "closeout preflight keeps default live delivery blocked");
  assertEqual(preflightResult.publicHostingStillBlocked, true, "closeout preflight keeps public hosting blocked");
  assertEqual(preflightResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutPreflightTruth, "recomputed_from_receipt_preflight_bound_closeout_and_supplied_closeout_no_durable_closure", "closeout preflight truth is explicit");
  assert(!containsForbiddenTruth([preflightResult]), "accepted execution receipt closeout preflight leaks no raw truth");
}

async function verifyManualReinvokeExecutionReceiptCloseoutPreflightRejectsTamperingAndClosureClaims(): Promise<void> {
  section("20. Manual Reinvoke Execution Receipt Closeout Preflight Rejects Tampering And Durable Closure Claims");
  const { truth, execution, receipt } = await executionReceiptFixture();
  const closeoutResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(closeoutResult.accepted, true, "fixture receipt closeout is accepted");
  const closeout = closeoutResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseout as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout;

  const tamperedTransferKey = {
    ...closeout,
    transferKey: "media-transfer:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  };
  const tamperedResult =
    await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: tamperedTransferKey,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(tamperedResult.accepted, false, "tampered closeout preflight is rejected");
  assertEqual(tamperedResult.reasonCode, "credential_acknowledged_manual_reinvoke_execution_receipt_closeout_current_truth_mismatch", "tampered closeout rejection is bounded");

  const durableClosureClaim = {
    ...closeout,
    manualRetryWorkItemClosedByColony: true,
    retryLedgerCreated: true,
  };
  const durableClosureResult =
    await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: durableClosureClaim,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(durableClosureResult.accepted, false, "durable closure claim is rejected");
  assertEqual(durableClosureResult.reasonCode, "credential_acknowledged_manual_reinvoke_execution_receipt_closeout_current_truth_mismatch", "durable closure rejection is bounded");
  assertEqual(durableClosureResult.manualRetryWorkItemClosedByColony, false, "rejected preflight still claims no Colony closure");
  assertEqual(durableClosureResult.retryLedgerStillBlocked, false, "rejected preflight exposes retry-ledger claim mismatch without creating one");
  assert(!containsForbiddenTruth([tamperedResult, durableClosureResult]), "receipt closeout preflight rejections leak no raw truth");
}

async function verifyManualReinvokeExecutionReceiptCloseoutRecordPlanAcceptsCloseoutPreflight(): Promise<void> {
  section("21. Manual Reinvoke Execution Receipt Closeout Record Plan Binds Accepted Closeout Preflight");
  const { truth, execution, receipt } = await executionReceiptFixture();
  const closeoutResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(closeoutResult.accepted, true, "fixture receipt closeout is accepted");
  const closeout = closeoutResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseout as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout;
  assert(!!closeout, "fixture receipt closeout is returned");

  const recordPlanResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });

  assertEqual(recordPlanResult.accepted, true, "closeout record plan is accepted after accepted closeout preflight");
  assert(recordPlanResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutPreflight.accepted, "record plan recomputes accepted closeout preflight");
  const recordPlan = recordPlanResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan;
  assert(!!recordPlan, "record plan descriptor is returned");
  assert(recordPlan.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlanId.startsWith("manual-retry-source-revalidation-credential-ack-reinvoke-execution-receipt-closeout-record-plan:"), "record plan id is deterministic and scoped");
  assertEqual(recordPlan.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutId, closeout.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutId, "record plan binds closeout id");
  assertEqual(recordPlan.credentialAcknowledgedManualReinvokeExecutionReceiptId, receipt.credentialAcknowledgedManualReinvokeExecutionReceiptId, "record plan binds receipt id");
  assertEqual(recordPlan.workItemCorrelationId, closeout.workItemCorrelationId, "record plan binds work-item correlation");
  assertEqual(recordPlan.transferKey, closeout.transferKey, "record plan binds transfer key");
  assertEqual(recordPlan.retryStage, closeout.retryStage, "record plan binds retry stage");
  assertEqual(recordPlan.vendorStateVerified, closeout.vendorStateVerified, "record plan binds vendor-state truth");
  assertEqual(recordPlan.hostReportedDeliveredCount, closeout.hostReportedDeliveredCount, "record plan binds delivered-count truth");
  assertEqual(recordPlan.durableCloseoutRecordReady, true, "record plan readiness is explicit");
  assertEqual(recordPlan.manualRetryWorkItemClosedByColony, false, "record plan does not close the work item");
  assertEqual(recordPlan.closeoutRecordPersisted, false, "record plan does not persist a closeout record");
  assertEqual(recordPlan.retryLedgerCreated, false, "record plan creates no retry ledger");
  assertEqual(recordPlan.durableRetryAuditRecordCreated, false, "record plan creates no durable retry audit record");
  assertEqual(recordPlan.retryWorkerCreated, false, "record plan creates no retry worker");
  assertEqual(recordPlan.defaultLiveDeliveryEnabled, false, "record plan keeps default live delivery blocked");
  assertEqual(recordPlan.publicHostingEnabled, false, "record plan keeps public hosting blocked");
  assertEqual(recordPlan.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlanTruth, "closeout_preflight_bound_manual_retry_record_plan_no_persistence", "record plan truth is explicit");
  assert(!containsForbiddenTruth([recordPlanResult]), "accepted closeout record plan leaks no raw truth");
}

async function verifyManualReinvokeExecutionReceiptCloseoutRecordPlanRejectsTamperingAndPersistenceClaims(): Promise<void> {
  section("22. Manual Reinvoke Execution Receipt Closeout Record Plan Rejects Tampering And Persistence Claims");
  const { truth, execution, receipt } = await executionReceiptFixture();
  const closeoutResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(closeoutResult.accepted, true, "fixture receipt closeout is accepted");
  const closeout = closeoutResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseout as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout;

  const tamperedCloseout = {
    ...closeout,
    transferKey: "media-transfer:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
  const tamperedResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: tamperedCloseout,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(tamperedResult.accepted, false, "tampered closeout blocks record plan");
  assertEqual(tamperedResult.reasonCode, "credential_acknowledged_manual_reinvoke_execution_receipt_closeout_current_truth_mismatch", "tampered record plan rejection is bounded");
  assertEqual(tamperedResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan, undefined, "rejected record plan returns no descriptor");
  assertEqual(tamperedResult.closeoutRecordPersisted, false, "rejected record plan persists nothing");

  const durablePersistenceClaim = {
    ...closeout,
    credentialAcknowledgedManualReinvokeExecutionReceiptPersisted: true,
    durableRetryAuditRecordCreated: true,
    retryScheduleCreated: true,
  };
  const durableClaimResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: durablePersistenceClaim,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(durableClaimResult.accepted, false, "durable persistence claim blocks record plan");
  assertEqual(durableClaimResult.reasonCode, "credential_acknowledged_manual_reinvoke_execution_receipt_closeout_current_truth_mismatch", "durable claim rejection is bounded");
  assertEqual(durableClaimResult.manualRetryWorkItemClosedByColony, false, "rejected record plan still claims no work-item closure");
  assertEqual(durableClaimResult.retryLedgerCreated, false, "rejected record plan creates no retry ledger");
  assertEqual(durableClaimResult.durableRetryAuditRecordCreated, false, "rejected record plan creates no durable audit record");
  assert(!containsForbiddenTruth([tamperedResult, durableClaimResult]), "closeout record plan rejections leak no raw truth");
}

async function verifyManualReinvokeExecutionReceiptCloseoutRecordPlanPreflightAcceptsCurrentRecordPlan(): Promise<void> {
  section("23. Manual Reinvoke Execution Receipt Closeout Record Plan Preflight Accepts Current Record Plan Truth");
  const { truth, execution, receipt } = await executionReceiptFixture();
  const closeoutResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(closeoutResult.accepted, true, "fixture receipt closeout is accepted");
  const closeout = closeoutResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseout as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout;
  const recordPlanResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(recordPlanResult.accepted, true, "fixture closeout record plan is accepted");
  const recordPlan = recordPlanResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan;

  const preflightResult =
    await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan: recordPlan,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });

  assertEqual(preflightResult.accepted, true, "record-plan preflight accepts current record-plan truth");
  assert(preflightResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlanResult.accepted, "record-plan preflight recomputes accepted record plan");
  assertEqual(preflightResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlanIdMatched, true, "record-plan preflight matches record plan id");
  assertEqual(preflightResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutIdMatched, true, "record-plan preflight matches closeout id");
  assertEqual(preflightResult.credentialAcknowledgedManualReinvokeExecutionReceiptIdMatched, true, "record-plan preflight matches receipt id");
  assertEqual(preflightResult.transferKeyMatched, true, "record-plan preflight matches transfer key");
  assertEqual(preflightResult.workItemCorrelationMatched, true, "record-plan preflight matches work-item correlation");
  assertEqual(preflightResult.sourceRefFingerprintsMatched, true, "record-plan preflight matches source fingerprints");
  assertEqual(preflightResult.targetCorrelationMatched, true, "record-plan preflight matches target correlation");
  assertEqual(preflightResult.hostReportedDeliveredCountMatched, true, "record-plan preflight matches delivered count");
  assertEqual(preflightResult.durableCloseoutRecordReady, true, "record-plan preflight preserves durable-record readiness");
  assertEqual(preflightResult.manualRetryWorkItemClosedByColony, false, "record-plan preflight still closes no work item");
  assertEqual(preflightResult.closeoutRecordPersistenceStillBlocked, true, "record-plan preflight keeps closeout persistence blocked");
  assertEqual(preflightResult.retryLedgerStillBlocked, true, "record-plan preflight keeps retry ledger blocked");
  assertEqual(preflightResult.durableRetryAuditStillBlocked, true, "record-plan preflight keeps durable retry audit blocked");
  assertEqual(preflightResult.defaultLiveDeliveryStillBlocked, true, "record-plan preflight keeps default live delivery blocked");
  assertEqual(preflightResult.publicHostingStillBlocked, true, "record-plan preflight keeps public hosting blocked");
  assertEqual(preflightResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlanPreflightTruth, "recomputed_from_closeout_record_plan_and_supplied_record_plan_no_persistence", "record-plan preflight truth is explicit");
  assert(!containsForbiddenTruth([preflightResult]), "accepted record-plan preflight leaks no raw truth");
}

async function verifyManualReinvokeExecutionReceiptCloseoutRecordPlanPreflightRejectsTamperingAndPersistenceClaims(): Promise<void> {
  section("24. Manual Reinvoke Execution Receipt Closeout Record Plan Preflight Rejects Tampering And Persistence Claims");
  const { truth, execution, receipt } = await executionReceiptFixture();
  const closeoutResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(closeoutResult.accepted, true, "fixture receipt closeout is accepted");
  const closeout = closeoutResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseout as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout;
  const recordPlanResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(recordPlanResult.accepted, true, "fixture closeout record plan is accepted");
  const recordPlan = recordPlanResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan;

  const tamperedPlan = {
    ...recordPlan,
    transferKey: "media-transfer:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  };
  const tamperedResult =
    await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan: tamperedPlan,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(tamperedResult.accepted, false, "tampered record plan is rejected");
  assertEqual(tamperedResult.reasonCode, "credential_acknowledged_manual_reinvoke_execution_receipt_closeout_record_plan_current_truth_mismatch", "tampered record-plan preflight rejection is bounded");
  assertEqual(tamperedResult.transferKeyMatched, false, "tampered record-plan preflight exposes transfer-key mismatch");
  assertEqual(tamperedResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan, undefined, "rejected record-plan preflight returns no trusted descriptor");

  const durableClaimPlan = {
    ...recordPlan,
    closeoutRecordPersisted: true,
    manualRetryWorkItemClosedByColony: true,
    retryLedgerCreated: true,
    durableRetryAuditRecordCreated: true,
    retryScheduleCreated: true,
  };
  const durableClaimResult =
    await preflightExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan: durableClaimPlan,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(durableClaimResult.accepted, false, "durable closeout record claim is rejected");
  assertEqual(durableClaimResult.reasonCode, "credential_acknowledged_manual_reinvoke_execution_receipt_closeout_record_plan_current_truth_mismatch", "durable record-plan claim rejection is bounded");
  assertEqual(durableClaimResult.manualRetryWorkItemClosedByColony, false, "rejected record-plan preflight still claims no work-item closure");
  assertEqual(durableClaimResult.closeoutRecordPersistenceStillBlocked, false, "rejected record-plan preflight exposes closeout persistence claim mismatch");
  assertEqual(durableClaimResult.retryLedgerStillBlocked, false, "rejected record-plan preflight exposes retry-ledger claim mismatch");
  assertEqual(durableClaimResult.durableRetryAuditStillBlocked, false, "rejected record-plan preflight exposes durable audit claim mismatch");
  assert(!containsForbiddenTruth([tamperedResult, durableClaimResult]), "record-plan preflight rejections leak no raw truth");
}

async function verifyManualReinvokeExecutionReceiptCloseoutRecordDraftAcceptsRecordPlanPreflight(): Promise<void> {
  section("25. Manual Reinvoke Execution Receipt Closeout Record Draft Binds Accepted Record-Plan Preflight");
  const { truth, execution, receipt } = await executionReceiptFixture();
  const closeoutResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(closeoutResult.accepted, true, "fixture receipt closeout is accepted");
  const closeout = closeoutResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseout as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout;
  const recordPlanResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(recordPlanResult.accepted, true, "fixture closeout record plan is accepted");
  const recordPlan = recordPlanResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan;

  const recordResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecord({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan: recordPlan,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });

  assertEqual(recordResult.accepted, true, "closeout record draft is accepted after accepted record-plan preflight");
  assert(recordResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlanPreflight.accepted, "record draft recomputes accepted record-plan preflight");
  const record = recordResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecord as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecord;
  assert(!!record, "closeout record draft descriptor is returned");
  assert(record.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordId.startsWith("manual-retry-source-revalidation-credential-ack-reinvoke-execution-receipt-closeout-record:"), "closeout record draft id is deterministic and scoped");
  assertEqual(record.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlanId, recordPlan.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlanId, "closeout record draft binds record-plan id");
  assertEqual(record.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutId, closeout.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutId, "closeout record draft binds closeout id");
  assertEqual(record.credentialAcknowledgedManualReinvokeExecutionReceiptId, receipt.credentialAcknowledgedManualReinvokeExecutionReceiptId, "closeout record draft binds receipt id");
  assertEqual(record.credentialAcknowledgedManualReinvokeHandoffId, recordPlan.credentialAcknowledgedManualReinvokeHandoffId, "closeout record draft binds handoff id");
  assertEqual(record.credentialAcknowledgedManualReinvokeRequestId, recordPlan.credentialAcknowledgedManualReinvokeRequestId, "closeout record draft binds manual reinvoke request id");
  assertEqual(record.credentialAcknowledgedReplayActionId, recordPlan.credentialAcknowledgedReplayActionId, "closeout record draft binds replay action id");
  assertEqual(record.channelId, recordPlan.channelId, "closeout record draft binds channel id");
  assertEqual(record.targetKind, recordPlan.targetKind, "closeout record draft binds target kind");
  assertEqual(record.workItemCorrelationId, recordPlan.workItemCorrelationId, "closeout record draft binds work-item correlation");
  assertEqual(record.expectedWorkItemCorrelationId, recordPlan.expectedWorkItemCorrelationId, "closeout record draft binds expected work-item correlation");
  assertEqual(record.transferKey, recordPlan.transferKey, "closeout record draft binds transfer key");
  assertEqual(record.retryStage, recordPlan.retryStage, "closeout record draft binds retry stage");
  assertEqual(record.sourceRefsTruncated, recordPlan.sourceRefsTruncated, "closeout record draft binds source truncation state");
  assertEqual(JSON.stringify(record.sourceRefFingerprints), JSON.stringify(recordPlan.sourceRefFingerprints), "closeout record draft binds source ref fingerprints");
  assertEqual(record.targetCorrelationFingerprint, recordPlan.targetCorrelationFingerprint, "closeout record draft binds target correlation fingerprint");
  assertEqual(record.revalidatedSourceCount, recordPlan.revalidatedSourceCount, "closeout record draft binds revalidated source count");
  assertEqual(record.vendorStateVerified, recordPlan.vendorStateVerified, "closeout record draft binds vendor state verification");
  assertEqual(record.hostReportedDeliveredCount, recordPlan.hostReportedDeliveredCount, "closeout record draft binds host delivered count");
  assertEqual(record.hostReceiptMetadataIncluded, recordPlan.hostReceiptMetadataIncluded, "closeout record draft binds host receipt metadata state");
  assertEqual(record.recordPlanPreflightAccepted, true, "closeout record draft requires accepted record-plan preflight");
  assertEqual(record.durableCloseoutRecordReady, true, "closeout record draft readiness is explicit");
  assertEqual(record.manualRetryWorkItemClosedByColony, false, "closeout record draft does not close the work item");
  assertEqual(record.closeoutRecordPersisted, false, "closeout record draft is not durably persisted");
  assertEqual(record.retryLedgerCreated, false, "closeout record draft creates no retry ledger");
  assertEqual(record.durableRetryAuditRecordCreated, false, "closeout record draft creates no durable retry audit record");
  assertEqual(record.retryWorkerCreated, false, "closeout record draft creates no retry worker");
  assertEqual(record.defaultLiveDeliveryEnabled, false, "closeout record draft keeps default live delivery blocked");
  assertEqual(record.publicHostingEnabled, false, "closeout record draft keeps public hosting blocked");
  assertEqual(record.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordTruth, "record_plan_preflight_bound_manual_retry_closeout_record_draft_no_persistence", "closeout record draft truth is explicit");
  assert(!containsForbiddenTruth([recordResult]), "accepted closeout record draft leaks no raw truth");
}

async function verifyManualReinvokeExecutionReceiptCloseoutRecordDraftRejectsTamperedRecordPlanAndPersistenceClaims(): Promise<void> {
  section("26. Manual Reinvoke Execution Receipt Closeout Record Draft Rejects Tampered Record-Plan And Persistence Claims");
  const { truth, execution, receipt } = await executionReceiptFixture();
  const closeoutResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(closeoutResult.accepted, true, "fixture receipt closeout is accepted");
  const closeout = closeoutResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseout as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout;
  const recordPlanResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(recordPlanResult.accepted, true, "fixture closeout record plan is accepted");
  const recordPlan = recordPlanResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan;

  const tamperedPlan = {
    ...recordPlan,
    transferKey: "media-transfer:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  };
  const tamperedResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecord({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan: tamperedPlan,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(tamperedResult.accepted, false, "tampered record-plan blocks closeout record draft");
  assertEqual(tamperedResult.reasonCode, "credential_acknowledged_manual_reinvoke_execution_receipt_closeout_record_plan_current_truth_mismatch", "tampered record draft rejection is bounded");
  assertEqual(tamperedResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecord, undefined, "rejected record draft returns no descriptor");
  assertEqual(tamperedResult.closeoutRecordPersisted, false, "rejected record draft persists nothing");

  const durableClaimPlan = {
    ...recordPlan,
    closeoutRecordPersisted: true,
    manualRetryWorkItemClosedByColony: true,
    retryLedgerCreated: true,
    durableRetryAuditRecordCreated: true,
    retryScheduleCreated: true,
  };
  const durableClaimResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecord({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan: durableClaimPlan,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(durableClaimResult.accepted, false, "durable record-plan claim blocks closeout record draft");
  assertEqual(durableClaimResult.reasonCode, "credential_acknowledged_manual_reinvoke_execution_receipt_closeout_record_plan_current_truth_mismatch", "durable record-plan claim rejection is bounded");
  assertEqual(durableClaimResult.manualRetryWorkItemClosedByColony, false, "rejected closeout record draft still claims no work-item closure");
  assertEqual(durableClaimResult.retryLedgerCreated, false, "rejected closeout record draft creates no retry ledger");
  assertEqual(durableClaimResult.durableRetryAuditRecordCreated, false, "rejected closeout record draft creates no durable audit record");

  const contaminatedPlan = {
    ...recordPlan,
    credentialValue: "xoxb-contaminated-secret",
    rawTargetId: "C163PRIVATE",
    receiptUrl: "https://files.slack.com/private?token=xoxb-contaminated-secret",
  };
  const contaminatedResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecord({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan: contaminatedPlan,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(contaminatedResult.accepted, false, "contaminated record-plan blocks closeout record draft");
  assertEqual(contaminatedResult.reasonCode, "valid_credential_acknowledged_manual_reinvoke_execution_receipt_closeout_record_plan_required", "contaminated record-plan rejection is bounded");
  assertEqual(contaminatedResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecord, undefined, "contaminated record-plan returns no descriptor");
  assert(!containsForbiddenTruth([tamperedResult, durableClaimResult, contaminatedResult]), "closeout record draft rejections leak no raw truth");
}

async function closeoutRecordPersistenceFixture(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): Promise<{
  truth: Awaited<ReturnType<typeof executionReceiptFixture>>["truth"];
  execution: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionResult;
  receipt: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt;
  closeout: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout;
  recordPlan: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan;
}> {
  const { truth, execution, receipt } = await executionReceiptFixture(overrides);
  const closeoutResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(closeoutResult.accepted, true, "fixture receipt closeout is accepted");
  const closeout = closeoutResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseout as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout;
  const recordPlanResult =
    await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan({
      candidate: truth.candidate,
      approval: truth.approval,
      workItem: truth.item,
      sourceRevalidationChecklist: truth.checklist,
      sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
      sourceRevalidationResult: truth.sourceRevalidationResult,
      credentialAcknowledgement: truth.credentialAcknowledgement,
      credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
      credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
      credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
      credentialAcknowledgedManualReinvokeExecution: execution,
      credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
      credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
      freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    });
  assertEqual(recordPlanResult.accepted, true, "fixture closeout record plan is accepted");
  const recordPlan = recordPlanResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan as ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan;
  return { truth, execution, receipt, closeout, recordPlan };
}

async function createCloseoutRecordStore(): Promise<{
  rootDir: string;
  store: JsonExternalChannelMediaTransferManualRetryCloseoutRecordStore;
}> {
  const rootDir = await mkdtemp(join(tmpdir(), "colony-phase173-closeout-records-"));
  return { rootDir, store: new JsonExternalChannelMediaTransferManualRetryCloseoutRecordStore({ rootDir }) };
}

async function createWorkItemClosureStore(): Promise<{
  rootDir: string;
  store: JsonExternalChannelMediaTransferManualRetryWorkItemClosureStore;
}> {
  const rootDir = await mkdtemp(join(tmpdir(), "colony-phase175-work-item-closures-"));
  return { rootDir, store: new JsonExternalChannelMediaTransferManualRetryWorkItemClosureStore({ rootDir }) };
}

async function persistedCloseoutRecordFixture(overrides: Partial<ExternalChannelMediaTransferCandidate> = {}): Promise<{
  truth: Awaited<ReturnType<typeof executionReceiptFixture>>["truth"];
  execution: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionResult;
  receipt: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt;
  closeout: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout;
  recordPlan: ExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan;
  closeoutRecord: ExternalChannelMediaTransferManualRetryCloseoutRecordPersistence;
}> {
  const { truth, execution, receipt, closeout, recordPlan } = await closeoutRecordPersistenceFixture(overrides);
  const { store } = await createCloseoutRecordStore();
  const persistenceResult = await persistExternalChannelMediaTransferManualRetryCloseoutRecord({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    credentialAcknowledgedManualReinvokeExecution: execution,
    credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
    credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
    credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan: recordPlan,
    closeoutRecordStore: store,
    persistedAt: "2026-05-08T19:52:31.000Z",
    persistedBy: "operator",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(persistenceResult.accepted, true, "fixture persists trusted closeout record");
  const loaded = await store.loadCloseoutRecords();
  return {
    truth,
    execution,
    receipt,
    closeout,
    recordPlan,
    closeoutRecord: loaded[0] as ExternalChannelMediaTransferManualRetryCloseoutRecordPersistence,
  };
}

async function verifyManualRetryCloseoutRecordPersistenceStoresRedactedRecord(): Promise<void> {
  section("27. Manual Retry Closeout Record Persistence Stores Redacted Durable Record Only");
  const { truth, execution, receipt, closeout, recordPlan } = await closeoutRecordPersistenceFixture();
  const { store } = await createCloseoutRecordStore();

  const persistenceResult = await persistExternalChannelMediaTransferManualRetryCloseoutRecord({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    credentialAcknowledgedManualReinvokeExecution: execution,
    credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
    credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
    credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan: recordPlan,
    closeoutRecordStore: store,
    persistedAt: "2026-05-08T19:52:31.000Z",
    persistedBy: "operator",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });

  assertEqual(persistenceResult.accepted, true, "closeout record persistence is accepted");
  const closeoutRecord = persistenceResult.closeoutRecord as ExternalChannelMediaTransferManualRetryCloseoutRecordPersistence;
  assert(closeoutRecord.closeoutRecordPersistenceId.startsWith("manual-retry-source-revalidation-credential-ack-reinvoke-execution-receipt-closeout-record-persistence:"), "closeout record persistence id is deterministic and scoped");
  assertEqual(closeoutRecord.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlanId, recordPlan.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlanId, "persisted closeout record binds record-plan id");
  assertEqual(closeoutRecord.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutId, closeout.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutId, "persisted closeout record binds closeout id");
  assertEqual(closeoutRecord.credentialAcknowledgedManualReinvokeExecutionReceiptId, receipt.credentialAcknowledgedManualReinvokeExecutionReceiptId, "persisted closeout record binds receipt id");
  assertEqual(closeoutRecord.workItemCorrelationId, recordPlan.workItemCorrelationId, "persisted closeout record binds work-item correlation");
  assertEqual(closeoutRecord.transferKey, recordPlan.transferKey, "persisted closeout record binds transfer key");
  assertEqual(JSON.stringify(closeoutRecord.sourceRefFingerprints), JSON.stringify(recordPlan.sourceRefFingerprints), "persisted closeout record stores source fingerprints only");
  assertEqual(closeoutRecord.targetCorrelationFingerprint, recordPlan.targetCorrelationFingerprint, "persisted closeout record binds target fingerprint");
  assertEqual(closeoutRecord.hostReportedDeliveredCount, recordPlan.hostReportedDeliveredCount, "persisted closeout record binds delivered count");
  assertEqual(closeoutRecord.vendorStateVerified, recordPlan.vendorStateVerified, "persisted closeout record binds vendor-state truth");
  assertEqual(closeoutRecord.closeoutRecordPersisted, true, "persisted closeout record is explicitly persisted");
  assertEqual(closeoutRecord.manualRetryWorkItemClosedByColony, false, "persisted closeout record does not close work item");
  assertEqual(closeoutRecord.credentialAcknowledgedManualReinvokeExecutionReceiptPersisted, false, "persisted closeout record does not persist receipt");
  assertEqual(closeoutRecord.retryLedgerCreated, false, "persisted closeout record creates no retry ledger");
  assertEqual(closeoutRecord.durableRetryAuditRecordCreated, false, "persisted closeout record creates no durable audit record");
  assertEqual(closeoutRecord.retryWorkerCreated, false, "persisted closeout record creates no retry worker");
  assertEqual(closeoutRecord.retryScheduleCreated, false, "persisted closeout record creates no retry schedule");
  assertEqual(closeoutRecord.defaultLiveDeliveryEnabled, false, "persisted closeout record keeps default live delivery blocked");
  assertEqual(closeoutRecord.publicHostingEnabled, false, "persisted closeout record keeps public hosting blocked");
  assertEqual(closeoutRecord.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordTruth, "record_plan_preflight_bound_manual_retry_closeout_record_persisted_no_work_item_closure", "persisted closeout record truth is explicit");

  const loaded = await store.loadCloseoutRecords();
  assertEqual(loaded.length, 1, "closeout record store reloads one persisted record");
  assertEqual(loaded[0]?.closeoutRecordPersistenceId, closeoutRecord.closeoutRecordPersistenceId, "loaded closeout record preserves persistence id");
  assertEqual(loaded[0]?.persistedAt, "2026-05-08T19:52:31.000Z", "loaded closeout record preserves timestamp");
  assertEqual(loaded[0]?.persistedBy, "operator", "loaded closeout record preserves safe actor label");
  assertEqual(loaded[0]?.closeoutRecordPersisted, true, "loaded closeout record preserves persistence truth");
  assert(!containsForbiddenTruth([persistenceResult, loaded]), "persisted closeout record leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyManualRetryCloseoutRecordPersistenceRejectsTamperedJournal(): Promise<void> {
  section("28. Manual Retry Closeout Record Persistence Rejects Tampered Journal");
  const { truth, execution, receipt, closeout, recordPlan } = await closeoutRecordPersistenceFixture();
  const { rootDir, store } = await createCloseoutRecordStore();
  const persistenceResult = await persistExternalChannelMediaTransferManualRetryCloseoutRecord({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    credentialAcknowledgedManualReinvokeExecution: execution,
    credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
    credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
    credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan: recordPlan,
    closeoutRecordStore: store,
    persistedAt: "2026-05-08T19:52:31.000Z",
    persistedBy: "operator",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(persistenceResult.accepted, true, "tamper fixture persists initial closeout record");
  const closeoutRecord = persistenceResult.closeoutRecord as ExternalChannelMediaTransferManualRetryCloseoutRecordPersistence;
  const tampered = {
    ...closeoutRecord,
    hostReportedDeliveredCount: Math.max(0, closeoutRecord.hostReportedDeliveredCount - 1),
  };
  await writeFile(
    join(rootDir, "external-media-transfer-closeout-records.jsonl"),
    `${JSON.stringify(tampered)}\n`,
    "utf8",
  );
  let tamperRejected = false;
  try {
    await store.loadCloseoutRecords();
  } catch (error) {
    tamperRejected = String((error as Error).message).includes("journal is invalid");
  }
  assert(tamperRejected, "valid-shaped but tampered closeout record journal fails closed");
  const provenanceTampered = {
    ...closeoutRecord,
    persistedAt: "2026-05-08T20:00:00.000Z",
    persistedBy: "operator-two",
  };
  await writeFile(
    join(rootDir, "external-media-transfer-closeout-records.jsonl"),
    `${JSON.stringify(provenanceTampered)}\n`,
    "utf8",
  );
  let provenanceTamperRejected = false;
  try {
    await store.loadCloseoutRecords();
  } catch (error) {
    provenanceTamperRejected = String((error as Error).message).includes("journal is invalid");
  }
  assert(provenanceTamperRejected, "valid-shaped provenance-tampered closeout record journal fails closed");
  assert(!containsForbiddenTruth([tampered, provenanceTampered]), "tampered closeout record fixtures remain redacted");
}

async function verifyManualRetryCloseoutRecordPersistenceRejectsMissingStoreAndMalformedJournal(): Promise<void> {
  section("29. Manual Retry Closeout Record Persistence Rejects Missing Store And Malformed Journal");
  const { truth, execution, receipt, closeout, recordPlan } = await closeoutRecordPersistenceFixture();
  const missingStoreResult = await persistExternalChannelMediaTransferManualRetryCloseoutRecord({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    credentialAcknowledgedManualReinvokeExecution: execution,
    credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
    credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
    credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan: recordPlan,
    persistedAt: "2026-05-08T19:52:31.000Z",
    persistedBy: "operator",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(missingStoreResult.accepted, false, "missing store blocks closeout record persistence");
  assertEqual(missingStoreResult.reasonCode, "external_media_transfer_closeout_record_store_required", "missing store rejection is bounded");
  assertEqual(missingStoreResult.closeoutRecordPersisted, false, "missing store persists nothing");
  assertEqual(missingStoreResult.manualRetryWorkItemClosedByColony, false, "missing store still closes no work item");
  assertEqual(missingStoreResult.retryLedgerCreated, false, "missing store creates no retry ledger");

  const { rootDir, store } = await createCloseoutRecordStore();
  await writeFile(
    join(rootDir, "external-media-transfer-closeout-records.jsonl"),
    "{\"recordType\":\"external_media_transfer_credential_acknowledged_manual_reinvoke_execution_receipt_closeout_record\",\"credentialValue\":\"xoxb-real-credential-value\"}\n",
    "utf8",
  );
  let malformedRejected = false;
  try {
    await store.loadCloseoutRecords();
  } catch (error) {
    malformedRejected = String((error as Error).message).includes("journal is invalid");
  }
  assert(malformedRejected, "malformed closeout record journal fails closed");
  assert(!containsForbiddenTruth([missingStoreResult]), "persistence rejection leaks no raw truth");
}

async function verifyManualRetryCloseoutRecordPersistenceClosesManualRetryWorkItem(): Promise<void> {
  section("30. Manual Retry Work-Item Closure Requires Trusted Persisted Closeout Record");
  const { truth, execution, receipt, closeout, recordPlan } = await closeoutRecordPersistenceFixture();
  const { store } = await createCloseoutRecordStore();
  const persistenceResult = await persistExternalChannelMediaTransferManualRetryCloseoutRecord({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    credentialAcknowledgedManualReinvokeExecution: execution,
    credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
    credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
    credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan: recordPlan,
    closeoutRecordStore: store,
    persistedAt: "2026-05-08T19:52:31.000Z",
    persistedBy: "operator",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(persistenceResult.accepted, true, "closure fixture persists closeout record");
  const loaded = await store.loadCloseoutRecords();
  const closeoutRecord = loaded[0] as ExternalChannelMediaTransferManualRetryCloseoutRecordPersistence;

  const closureResult = await closeExternalChannelMediaTransferManualRetryWorkItemFromCloseoutRecordPersistence({
    closeoutRecord,
    closedAt: "2026-05-08T20:15:52.000Z",
    closedBy: "operator",
  });

  assertEqual(closureResult.accepted, true, "trusted persisted closeout record can close manual retry work item");
  const closure = closureResult.workItemClosure as ExternalChannelMediaTransferManualRetryWorkItemClosure;
  assert(closure.manualRetryWorkItemClosureId.startsWith("manual-retry-work-item-closure:"), "work-item closure id is deterministic and scoped");
  assertEqual(closure.closeoutRecordPersistenceId, closeoutRecord.closeoutRecordPersistenceId, "closure binds persisted closeout record id");
  assertEqual(closure.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordId, closeoutRecord.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordId, "closure binds closeout record id");
  assertEqual(closure.workItemCorrelationId, closeoutRecord.workItemCorrelationId, "closure binds work-item correlation");
  assertEqual(closure.expectedWorkItemCorrelationId, closeoutRecord.expectedWorkItemCorrelationId, "closure binds expected work-item correlation");
  assertEqual(closure.transferKey, closeoutRecord.transferKey, "closure binds transfer key");
  assertEqual(JSON.stringify(closure.sourceRefFingerprints), JSON.stringify(closeoutRecord.sourceRefFingerprints), "closure carries only redacted source fingerprints");
  assertEqual(closure.targetCorrelationFingerprint, closeoutRecord.targetCorrelationFingerprint, "closure binds target fingerprint");
  assertEqual(closure.hostReportedDeliveredCount, closeoutRecord.hostReportedDeliveredCount, "closure binds delivered count");
  assertEqual(closure.vendorStateVerified, closeoutRecord.vendorStateVerified, "closure preserves vendor-state verification truth");
  assertEqual(closure.closeoutRecordPersisted, true, "closure requires durable closeout persistence");
  assertEqual(closure.manualRetryWorkItemClosedByColony, true, "closure is the first explicit work-item closure boundary");
  assertEqual(closure.credentialAcknowledgedManualReinvokeExecutionReceiptPersisted, false, "closure does not persist receipt");
  assertEqual(closure.credentialPersistenceCreated, false, "closure creates no credential persistence");
  assertEqual(closure.retryLedgerCreated, false, "closure creates no retry ledger");
  assertEqual(closure.durableRetryAuditRecordCreated, false, "closure creates no durable retry audit record");
  assertEqual(closure.retryWorkerCreated, false, "closure creates no retry worker");
  assertEqual(closure.retryScheduleCreated, false, "closure creates no retry schedule");
  assertEqual(closure.defaultLiveDeliveryEnabled, false, "closure keeps default live delivery blocked");
  assertEqual(closure.publicHostingEnabled, false, "closure keeps public hosting blocked");
  assertEqual(closure.automaticVendorRetryAllowed, false, "closure does not allow automatic vendor retry");
  assertEqual(closure.manualRetryWorkItemClosureTruth, "persisted_closeout_record_bound_manual_retry_work_item_closed_no_retry_ledger", "closure truth is explicit");
  assert(!containsForbiddenTruth([closureResult]), "work-item closure leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyManualRetryWorkItemClosureRejectsUntrustedCloseoutRecord(): Promise<void> {
  section("31. Manual Retry Work-Item Closure Rejects Untrusted Or Forged Closeout Records");
  const { truth, execution, receipt, closeout, recordPlan } = await closeoutRecordPersistenceFixture();
  const { store } = await createCloseoutRecordStore();
  const persistenceResult = await persistExternalChannelMediaTransferManualRetryCloseoutRecord({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    credentialAcknowledgedManualReinvokeExecution: execution,
    credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
    credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
    credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan: recordPlan,
    closeoutRecordStore: store,
    persistedAt: "2026-05-08T19:52:31.000Z",
    persistedBy: "operator",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(persistenceResult.accepted, true, "untrusted closure fixture persists closeout record");
  const trusted = persistenceResult.closeoutRecord as ExternalChannelMediaTransferManualRetryCloseoutRecordPersistence;
  const untrusted = {
    ...trusted,
    sourceRefFingerprints: trusted.sourceRefFingerprints.map((source) => ({ ...source })),
  } as ExternalChannelMediaTransferManualRetryCloseoutRecordPersistence;

  const untrustedResult = await closeExternalChannelMediaTransferManualRetryWorkItemFromCloseoutRecordPersistence({
    closeoutRecord: untrusted,
    closedAt: "2026-05-08T20:15:52.000Z",
    closedBy: "operator",
  });
  assertEqual(untrustedResult.accepted, false, "copied closeout record cannot close work item");
  assertEqual(untrustedResult.reasonCode, "external_media_transfer_trusted_closeout_record_required", "untrusted closeout record rejection is bounded");
  assertEqual(untrustedResult.manualRetryWorkItemClosedByColony, false, "untrusted closure closes no work item");
  assertEqual(untrustedResult.retryLedgerCreated, false, "untrusted closure creates no retry ledger");
  assertEqual(untrustedResult.defaultLiveDeliveryEnabled, false, "untrusted closure keeps default live delivery blocked");

  const forged = {
    ...untrusted,
    manualRetryWorkItemClosedByColony: true,
  } as unknown as ExternalChannelMediaTransferManualRetryCloseoutRecordPersistence;
  const forgedResult = await closeExternalChannelMediaTransferManualRetryWorkItemFromCloseoutRecordPersistence({
    closeoutRecord: forged,
    closedAt: "2026-05-08T20:15:52.000Z",
    closedBy: "operator",
  });
  assertEqual(forgedResult.accepted, false, "forged closure claim cannot close work item");
  assertEqual(forgedResult.reasonCode, "external_media_transfer_trusted_closeout_record_required", "forged closure rejection is bounded");
  assertEqual(forgedResult.manualRetryWorkItemClosedByColony, false, "forged closure closes no work item");
  assertEqual(forgedResult.retryWorkerCreated, false, "forged closure creates no retry worker");
  assert(!containsForbiddenTruth([untrustedResult, forgedResult]), "closure rejections leak no raw truth");
}

async function verifyManualRetryWorkItemClosureRejectsAppendFailedCapturedRecord(): Promise<void> {
  section("32. Manual Retry Work-Item Closure Rejects Append-Failed Captured Closeout Records");
  const { truth, execution, receipt, closeout, recordPlan } = await closeoutRecordPersistenceFixture();
  const capturingStore: ExternalChannelMediaTransferManualRetryCloseoutRecordPersistenceStore & {
    captured: ExternalChannelMediaTransferManualRetryCloseoutRecordPersistence[];
  } = {
    captured: [],
    async appendCloseoutRecords(records) {
      this.captured = records;
      throw new Error("simulated append failure");
    },
    async loadCloseoutRecords() {
      return [];
    },
  };
  const persistenceResult = await persistExternalChannelMediaTransferManualRetryCloseoutRecord({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    credentialAcknowledgedManualReinvokeExecution: execution,
    credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
    credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
    credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan: recordPlan,
    closeoutRecordStore: capturingStore,
    persistedAt: "2026-05-08T19:52:31.000Z",
    persistedBy: "operator",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(persistenceResult.accepted, false, "append failure rejects persistence");
  assertEqual(persistenceResult.reasonCode, "external_media_transfer_closeout_record_store_append_failed", "append failure reason is bounded");
  assertEqual(capturingStore.captured.length, 1, "failing store captured one pending closeout record");

  const closureResult = await closeExternalChannelMediaTransferManualRetryWorkItemFromCloseoutRecordPersistence({
    closeoutRecord: capturingStore.captured[0] as ExternalChannelMediaTransferManualRetryCloseoutRecordPersistence,
    closedAt: "2026-05-08T20:15:52.000Z",
    closedBy: "operator",
  });
  assertEqual(closureResult.accepted, false, "append-failed captured record cannot close work item");
  assertEqual(closureResult.reasonCode, "external_media_transfer_trusted_closeout_record_required", "append-failed closure rejection is bounded");
  assertEqual(closureResult.manualRetryWorkItemClosedByColony, false, "append-failed closure closes no work item");
  assertEqual(closureResult.retryLedgerCreated, false, "append-failed closure creates no retry ledger");
  assert(!containsForbiddenTruth([persistenceResult, closureResult]), "append-failed closure leaks no raw truth");
}

async function verifyManualRetryWorkItemClosurePersistenceStoresRedactedClosureRecord(): Promise<void> {
  section("33. Manual Retry Work-Item Closure Persistence Stores Redacted Durable Closure Record Only");
  const { closeoutRecord } = await persistedCloseoutRecordFixture();
  const { store } = await createWorkItemClosureStore();

  const persistenceResult = await persistExternalChannelMediaTransferManualRetryWorkItemClosure({
    closeoutRecord,
    workItemClosureStore: store,
    closedAt: "2026-05-08T20:30:07.000Z",
    closedBy: "operator",
    persistedAt: "2026-05-08T20:31:07.000Z",
    persistedBy: "operator",
  });

  assertEqual(persistenceResult.accepted, true, "work-item closure persistence is accepted");
  const closure = persistenceResult.workItemClosure as ExternalChannelMediaTransferManualRetryWorkItemClosurePersistence;
  assert(closure.manualRetryWorkItemClosurePersistenceId.startsWith("manual-retry-work-item-closure-persistence:"), "closure persistence id is deterministic and scoped");
  assert(closure.manualRetryWorkItemClosureId.startsWith("manual-retry-work-item-closure:"), "closure id is deterministic and scoped");
  assertEqual(closure.closeoutRecordPersistenceId, closeoutRecord.closeoutRecordPersistenceId, "persisted closure binds closeout record persistence id");
  assertEqual(closure.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordId, closeoutRecord.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordId, "persisted closure binds closeout record id");
  assertEqual(closure.workItemCorrelationId, closeoutRecord.workItemCorrelationId, "persisted closure binds work-item correlation");
  assertEqual(closure.expectedWorkItemCorrelationId, closeoutRecord.expectedWorkItemCorrelationId, "persisted closure binds expected work-item correlation");
  assertEqual(closure.transferKey, closeoutRecord.transferKey, "persisted closure binds transfer key");
  assertEqual(JSON.stringify(closure.sourceRefFingerprints), JSON.stringify(closeoutRecord.sourceRefFingerprints), "persisted closure stores source fingerprints only");
  assertEqual(closure.targetCorrelationFingerprint, closeoutRecord.targetCorrelationFingerprint, "persisted closure binds target fingerprint");
  assertEqual(closure.hostReportedDeliveredCount, closeoutRecord.hostReportedDeliveredCount, "persisted closure binds delivered count");
  assertEqual(closure.vendorStateVerified, closeoutRecord.vendorStateVerified, "persisted closure preserves vendor-state verification truth");
  assertEqual(closure.closeoutRecordPersisted, true, "persisted closure requires durable closeout record persistence");
  assertEqual(closure.manualRetryWorkItemClosedByColony, true, "persisted closure records work-item closure");
  assertEqual(closure.workItemClosurePersisted, true, "persisted closure explicitly records its own persistence");
  assertEqual(closure.credentialAcknowledgedManualReinvokeExecutionReceiptPersisted, false, "persisted closure does not persist receipt");
  assertEqual(closure.credentialPersistenceCreated, false, "persisted closure creates no credential persistence");
  assertEqual(closure.retryLedgerCreated, false, "persisted closure creates no retry ledger");
  assertEqual(closure.durableRetryAuditRecordCreated, false, "persisted closure creates no durable retry audit record");
  assertEqual(closure.retryWorkerCreated, false, "persisted closure creates no retry worker");
  assertEqual(closure.retryScheduleCreated, false, "persisted closure creates no retry schedule");
  assertEqual(closure.defaultLiveDeliveryEnabled, false, "persisted closure keeps default live delivery blocked");
  assertEqual(closure.publicHostingEnabled, false, "persisted closure keeps public hosting blocked");
  assertEqual(closure.automaticVendorRetryAllowed, false, "persisted closure does not allow automatic vendor retry");
  assertEqual(closure.manualRetryWorkItemClosureTruth, "persisted_closeout_record_bound_manual_retry_work_item_closed_no_retry_ledger", "closure truth is preserved");
  assertEqual(closure.manualRetryWorkItemClosurePersistenceTruth, "persisted_closeout_record_bound_manual_retry_work_item_closure_persisted_no_retry_ledger", "closure persistence truth is explicit");

  const loaded = await store.loadWorkItemClosures();
  assertEqual(loaded.length, 1, "work-item closure store reloads one persisted closure");
  assertEqual(loaded[0]?.manualRetryWorkItemClosurePersistenceId, closure.manualRetryWorkItemClosurePersistenceId, "loaded closure preserves persistence id");
  assertEqual(loaded[0]?.manualRetryWorkItemClosureId, closure.manualRetryWorkItemClosureId, "loaded closure preserves closure id");
  assertEqual(loaded[0]?.closedAt, "2026-05-08T20:30:07.000Z", "loaded closure preserves closure timestamp");
  assertEqual(loaded[0]?.persistedAt, "2026-05-08T20:31:07.000Z", "loaded closure preserves persistence timestamp");
  assertEqual(loaded[0]?.persistedBy, "operator", "loaded closure preserves safe actor label");
  assertEqual(loaded[0]?.workItemClosurePersisted, true, "loaded closure preserves persistence truth");
  assert(!containsForbiddenTruth([persistenceResult, loaded]), "persisted work-item closure leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyManualRetryWorkItemClosurePersistenceRejectsTamperedJournal(): Promise<void> {
  section("34. Manual Retry Work-Item Closure Persistence Rejects Tampered Journal");
  const { closeoutRecord } = await persistedCloseoutRecordFixture();
  const { rootDir, store } = await createWorkItemClosureStore();
  const persistenceResult = await persistExternalChannelMediaTransferManualRetryWorkItemClosure({
    closeoutRecord,
    workItemClosureStore: store,
    closedAt: "2026-05-08T20:30:07.000Z",
    closedBy: "operator",
    persistedAt: "2026-05-08T20:31:07.000Z",
    persistedBy: "operator",
  });
  assertEqual(persistenceResult.accepted, true, "tamper fixture persists initial work-item closure");
  const closure = persistenceResult.workItemClosure as ExternalChannelMediaTransferManualRetryWorkItemClosurePersistence;

  await writeFile(
    join(rootDir, "external-media-transfer-work-item-closures.jsonl"),
    `${JSON.stringify({ ...closure, hostReportedDeliveredCount: Math.max(0, closure.hostReportedDeliveredCount - 1) })}\n`,
    "utf8",
  );
  let tamperRejected = false;
  try {
    await store.loadWorkItemClosures();
  } catch (error) {
    tamperRejected = String((error as Error).message).includes("journal is invalid");
  }
  assert(tamperRejected, "valid-shaped but tampered work-item closure journal fails closed");

  await writeFile(
    join(rootDir, "external-media-transfer-work-item-closures.jsonl"),
    `${JSON.stringify({ ...closure, persistedAt: "2026-05-08T20:32:07.000Z", persistedBy: "operator-two" })}\n`,
    "utf8",
  );
  let provenanceTamperRejected = false;
  try {
    await store.loadWorkItemClosures();
  } catch (error) {
    provenanceTamperRejected = String((error as Error).message).includes("journal is invalid");
  }
  assert(provenanceTamperRejected, "valid-shaped provenance-tampered work-item closure journal fails closed");
}

async function verifyManualRetryWorkItemClosurePersistenceRejectsMissingStoreAndMalformedJournal(): Promise<void> {
  section("35. Manual Retry Work-Item Closure Persistence Rejects Missing Store And Malformed Journal");
  const { closeoutRecord } = await persistedCloseoutRecordFixture();
  const missingStoreResult = await persistExternalChannelMediaTransferManualRetryWorkItemClosure({
    closeoutRecord,
    closedAt: "2026-05-08T20:30:07.000Z",
    closedBy: "operator",
    persistedAt: "2026-05-08T20:31:07.000Z",
    persistedBy: "operator",
  });
  assertEqual(missingStoreResult.accepted, false, "missing store blocks work-item closure persistence");
  assertEqual(missingStoreResult.reasonCode, "external_media_transfer_work_item_closure_store_required", "missing store rejection is bounded");
  assertEqual(missingStoreResult.closeoutRecordPersisted, false, "missing store does not claim closeout persistence success");
  assertEqual(missingStoreResult.workItemClosurePersisted, false, "missing store persists no work-item closure");
  assertEqual(missingStoreResult.retryLedgerCreated, false, "missing store creates no retry ledger");

  const { rootDir, store } = await createWorkItemClosureStore();
  await writeFile(
    join(rootDir, "external-media-transfer-work-item-closures.jsonl"),
    "{\"recordType\":\"external_media_transfer_manual_retry_work_item_closure\",\"credentialValue\":\"xoxb-real-credential-value\"}\n",
    "utf8",
  );
  let malformedRejected = false;
  try {
    await store.loadWorkItemClosures();
  } catch (error) {
    malformedRejected = String((error as Error).message).includes("journal is invalid");
  }
  assert(malformedRejected, "malformed work-item closure journal fails closed");
  assert(!containsForbiddenTruth([missingStoreResult]), "closure persistence rejection leaks no raw truth");
}

async function verifyManualRetryWorkItemClosurePersistenceRejectsAppendFailedCapturedClosure(): Promise<void> {
  section("36. Manual Retry Work-Item Closure Persistence Rejects Append-Failed Captured Closure Records");
  const { closeoutRecord } = await persistedCloseoutRecordFixture();
  const capturingStore: ExternalChannelMediaTransferManualRetryWorkItemClosurePersistenceStore & {
    captured: ExternalChannelMediaTransferManualRetryWorkItemClosurePersistence[];
  } = {
    captured: [],
    async appendWorkItemClosures(records) {
      this.captured = records;
      throw new Error("simulated append failure");
    },
    async loadWorkItemClosures() {
      return [];
    },
  };
  const persistenceResult = await persistExternalChannelMediaTransferManualRetryWorkItemClosure({
    closeoutRecord,
    workItemClosureStore: capturingStore,
    closedAt: "2026-05-08T20:30:07.000Z",
    closedBy: "operator",
    persistedAt: "2026-05-08T20:31:07.000Z",
    persistedBy: "operator",
  });
  assertEqual(persistenceResult.accepted, false, "append failure rejects work-item closure persistence");
  assertEqual(persistenceResult.reasonCode, "external_media_transfer_work_item_closure_store_append_failed", "append failure reason is bounded");
  assertEqual(capturingStore.captured.length, 1, "failing store captured one pending work-item closure record");

  const { store } = await createWorkItemClosureStore();
  let capturedAppendRejected = false;
  try {
    await store.appendWorkItemClosures(capturingStore.captured);
  } catch (error) {
    capturedAppendRejected = String((error as Error).message).includes("append rejected");
  }
  assert(capturedAppendRejected, "append-failed captured closure cannot be replayed into a real store");
  assertEqual(persistenceResult.workItemClosurePersisted, false, "append-failed closure persistence records no durable closure");
  assertEqual(persistenceResult.retryLedgerCreated, false, "append-failed closure persistence creates no retry ledger");
  assert(!containsForbiddenTruth([persistenceResult]), "append-failed closure persistence leaks no raw truth");
}

async function verifyManualRetryWorkItemClosurePersistenceRejectsMutatingSuccessfulStore(): Promise<void> {
  section("37. Manual Retry Work-Item Closure Persistence Rejects Mutating Successful Stores");
  const { closeoutRecord } = await persistedCloseoutRecordFixture();
  const mutatingStore: ExternalChannelMediaTransferManualRetryWorkItemClosurePersistenceStore & {
    captured: ExternalChannelMediaTransferManualRetryWorkItemClosurePersistence[];
  } = {
    captured: [],
    async appendWorkItemClosures(records) {
      this.captured = records;
      (records[0] as unknown as { manualRetryWorkItemClosureId: string }).manualRetryWorkItemClosureId =
        "manual-retry-work-item-closure:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
      (records[0]?.sourceRefFingerprints[0] as unknown as { sourceRef: string }).sourceRef =
        "artifact:raw-private-ref";
    },
    async loadWorkItemClosures() {
      return [];
    },
  };
  const persistenceResult = await persistExternalChannelMediaTransferManualRetryWorkItemClosure({
    closeoutRecord,
    workItemClosureStore: mutatingStore,
    closedAt: "2026-05-08T20:30:07.000Z",
    closedBy: "operator",
    persistedAt: "2026-05-08T20:31:07.000Z",
    persistedBy: "operator",
  });
  assertEqual(persistenceResult.accepted, false, "mutating successful store cannot promote a trusted closure record");
  assertEqual(persistenceResult.reasonCode, "external_media_transfer_work_item_closure_store_append_failed", "mutating store rejection is bounded");
  assertEqual(persistenceResult.workItemClosurePersisted, false, "mutating store records no durable closure success");
  assertEqual(persistenceResult.retryLedgerCreated, false, "mutating store creates no retry ledger");
  assert(!containsForbiddenTruth([persistenceResult]), "mutating store rejection leaks no raw truth");
}

async function persistedWorkItemClosureFixture(
  overrides: Partial<ExternalChannelMediaTransferCandidate> = {},
): Promise<{
  closeoutRecord: ExternalChannelMediaTransferManualRetryCloseoutRecordPersistence;
  workItemClosure: ExternalChannelMediaTransferManualRetryWorkItemClosurePersistence;
}> {
  const { closeoutRecord } = await persistedCloseoutRecordFixture(overrides);
  const { store } = await createWorkItemClosureStore();
  const persistenceResult = await persistExternalChannelMediaTransferManualRetryWorkItemClosure({
    closeoutRecord,
    workItemClosureStore: store,
    closedAt: "2026-05-08T20:47:40.000Z",
    closedBy: "operator",
    persistedAt: "2026-05-08T20:48:40.000Z",
    persistedBy: "operator",
  });
  assertEqual(persistenceResult.accepted, true, "fixture persists trusted work-item closure record");
  const loaded = await store.loadWorkItemClosures();
  return {
    closeoutRecord,
    workItemClosure: loaded[0] as ExternalChannelMediaTransferManualRetryWorkItemClosurePersistence,
  };
}

async function verifyManualRetryWorkItemClosurePersistencePreflightAcceptsTrustedClosureRecord(): Promise<void> {
  section("38. Manual Retry Work-Item Closure Persistence Preflight Accepts Trusted Closure Record");
  const { closeoutRecord, workItemClosure } = await persistedWorkItemClosureFixture();

  const result = await preflightExternalChannelMediaTransferManualRetryWorkItemClosurePersistence({
    closeoutRecord,
    workItemClosure,
  });

  assertEqual(result.accepted, true, "trusted closure persistence preflight is accepted");
  assertEqual(result.workItemClosureResult.accepted, true, "preflight recomputes accepted closure truth");
  assertEqual(result.manualRetryWorkItemClosurePersistenceIdMatched, true, "preflight matches closure persistence id");
  assertEqual(result.manualRetryWorkItemClosureIdMatched, true, "preflight matches closure id");
  assertEqual(result.closeoutRecordPersistenceIdMatched, true, "preflight matches closeout persistence id");
  assertEqual(result.workItemCorrelationMatched, true, "preflight matches work-item correlation");
  assertEqual(result.transferKeyMatched, true, "preflight matches transfer key");
  assertEqual(result.sourceRefFingerprintsMatched, true, "preflight matches source fingerprints");
  assertEqual(result.targetCorrelationMatched, true, "preflight matches target fingerprint");
  assertEqual(result.hostReportedDeliveredCountMatched, true, "preflight matches delivered count");
  assertEqual(result.closeoutRecordPersisted, true, "preflight requires persisted closeout record");
  assertEqual(result.manualRetryWorkItemClosedByColony, true, "preflight confirms work-item closure");
  assertEqual(result.workItemClosurePersisted, true, "preflight confirms closure persistence");
  assertEqual(result.workItemClosurePersistenceStillTrusted, true, "preflight requires trusted persisted closure identity");
  assertEqual(result.retryLedgerStillBlocked, true, "preflight keeps retry ledger blocked");
  assertEqual(result.durableRetryAuditStillBlocked, true, "preflight keeps durable retry audit blocked");
  assertEqual(result.retryWorkerStillBlocked, true, "preflight keeps retry workers blocked");
  assertEqual(result.defaultLiveDeliveryStillBlocked, true, "preflight keeps default live delivery blocked");
  assertEqual(result.publicHostingStillBlocked, true, "preflight keeps public hosting blocked");
  assertEqual(
    result.manualRetryWorkItemClosurePersistencePreflightTruth,
    "recomputed_from_trusted_closeout_record_and_supplied_work_item_closure_persistence_no_execution",
    "closure persistence preflight truth is explicit",
  );
  assertEqual(result.workItemClosure?.manualRetryWorkItemClosurePersistenceId, workItemClosure.manualRetryWorkItemClosurePersistenceId, "preflight returns expected closure persistence truth");
  assert(!containsForbiddenTruth(result), "accepted closure persistence preflight leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyManualRetryWorkItemClosurePersistencePreflightRejectsMismatchedTrustedClosureRecord(): Promise<void> {
  section("39. Manual Retry Work-Item Closure Persistence Preflight Rejects Mismatched Trusted Closure Record");
  const { closeoutRecord } = await persistedWorkItemClosureFixture();
  const { workItemClosure } = await persistedWorkItemClosureFixture({
    workspaceId: "T176PRIVATE",
    accountId: "A176PRIVATE",
    targetId: "C176PRIVATE",
    threadId: "171000.1760",
    fileRefs: fileRefs("phase176_other"),
  });

  const result = await preflightExternalChannelMediaTransferManualRetryWorkItemClosurePersistence({
    closeoutRecord,
    workItemClosure,
  });

  assertEqual(result.accepted, false, "mismatched trusted closure persistence preflight is rejected");
  assertEqual(result.reasonCode, "external_media_transfer_work_item_closure_persistence_current_truth_mismatch", "mismatched closure rejection is bounded");
  assertEqual(result.closeoutRecordPersistenceIdMatched, false, "preflight reports closeout persistence mismatch");
  assertEqual(result.transferKeyMatched, false, "preflight reports transfer-key mismatch");
  assertEqual(result.sourceRefFingerprintsMatched, false, "preflight reports source fingerprint mismatch");
  assertEqual(result.targetCorrelationMatched, false, "preflight reports target correlation mismatch");
  assertEqual(result.workItemClosure, undefined, "mismatched preflight returns no closure descriptor");
  assertEqual(result.expectedWorkItemClosure, undefined, "mismatched preflight returns no expected closure descriptor");
  assertEqual(result.retryLedgerStillBlocked, true, "mismatched preflight creates no retry ledger");
  assertEqual(result.defaultLiveDeliveryStillBlocked, true, "mismatched preflight enables no default live delivery");
  assert(!containsForbiddenTruth(result), "mismatched closure persistence rejection leaks no raw truth");
}

async function verifyManualRetryWorkItemClosurePersistencePreflightRejectsUntrustedClosureCopies(): Promise<void> {
  section("40. Manual Retry Work-Item Closure Persistence Preflight Rejects Untrusted Closure Copies");
  const { closeoutRecord, workItemClosure } = await persistedWorkItemClosureFixture();

  const copiedResult = await preflightExternalChannelMediaTransferManualRetryWorkItemClosurePersistence({
    closeoutRecord,
    workItemClosure: { ...workItemClosure, sourceRefFingerprints: workItemClosure.sourceRefFingerprints.map((source) => ({ ...source })) },
  });
  assertEqual(copiedResult.accepted, false, "copied closure persistence record is rejected");
  assertEqual(copiedResult.reasonCode, "external_media_transfer_trusted_work_item_closure_required", "copied closure rejection is bounded");
  assertEqual(copiedResult.workItemClosurePersistenceStillTrusted, false, "copied closure is not trusted");
  assertEqual(copiedResult.workItemClosurePersisted, false, "copied closure persistence is not accepted");
  assertEqual(copiedResult.retryLedgerStillBlocked, true, "copied closure preflight creates no retry ledger");

  const contaminatedResult = await preflightExternalChannelMediaTransferManualRetryWorkItemClosurePersistence({
    closeoutRecord,
    workItemClosure: {
      ...workItemClosure,
      credentialValue: "xoxb-real-credential-value",
      retryLedgerCreated: true,
    },
  });
  assertEqual(contaminatedResult.accepted, false, "contaminated closure persistence record is rejected");
  assertEqual(contaminatedResult.reasonCode, "valid_external_media_transfer_work_item_closure_persistence_required", "contaminated closure rejection is bounded");
  assertEqual(contaminatedResult.workItemClosure, undefined, "contaminated preflight returns no closure descriptor");
  assertEqual(contaminatedResult.retryLedgerStillBlocked, false, "contaminated retry-ledger claim is exposed as not trusted");
  assert(!containsForbiddenTruth([copiedResult, contaminatedResult]), "untrusted closure persistence rejections leak no raw truth");
}

async function verifyManualRetryWorkItemClosureAuditRecordPlanAcceptsClosurePersistencePreflight(): Promise<void> {
  section("41. Manual Retry Work-Item Closure Audit Record Plan Accepts Closure Persistence Preflight");
  const { closeoutRecord, workItemClosure } = await persistedWorkItemClosureFixture();

  const result = await createExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordPlan({
    closeoutRecord,
    workItemClosure,
  });

  assertEqual(result.accepted, true, "trusted closure persistence can plan a manual retry audit record");
  assertEqual(result.workItemClosurePersistencePreflight.accepted, true, "audit plan is bound to accepted closure persistence preflight");
  assert(
    result.manualRetryWorkItemClosureAuditRecordPlanId?.startsWith("manual-retry-work-item-closure-audit-plan:") ===
      true,
    "audit plan id is deterministic and domain separated",
  );
  assertEqual(
    result.workItemClosureAuditRecordPlan?.manualRetryWorkItemClosurePersistenceId,
    workItemClosure.manualRetryWorkItemClosurePersistenceId,
    "audit plan binds closure persistence id",
  );
  assertEqual(
    result.workItemClosureAuditRecordPlan?.manualRetryWorkItemClosureId,
    workItemClosure.manualRetryWorkItemClosureId,
    "audit plan binds closure id",
  );
  assertEqual(
    result.workItemClosureAuditRecordPlan?.closeoutRecordPersistenceId,
    workItemClosure.closeoutRecordPersistenceId,
    "audit plan binds closeout persistence id",
  );
  assertEqual(
    result.workItemClosureAuditRecordPlan?.transferKey,
    workItemClosure.transferKey,
    "audit plan binds transfer key",
  );
  assertEqual(
    result.workItemClosureAuditRecordPlan?.targetCorrelationFingerprint,
    workItemClosure.targetCorrelationFingerprint,
    "audit plan binds target fingerprint",
  );
  assertEqual(
    result.workItemClosureAuditRecordPlan?.hostReportedDeliveredCount,
    workItemClosure.hostReportedDeliveredCount,
    "audit plan binds delivered count",
  );
  assertEqual(
    result.workItemClosureAuditRecordPlan?.sourceRefFingerprints.length,
    workItemClosure.sourceRefFingerprints.length,
    "audit plan binds source fingerprint count",
  );
  assertEqual(result.manualRetryWorkItemClosedByColony, true, "audit plan preserves work-item closure truth");
  assertEqual(result.workItemClosurePersisted, true, "audit plan requires persisted closure truth");
  assertEqual(result.durableRetryAuditRecordReady, true, "audit plan marks redacted durable-audit inputs as ready");
  assertEqual(result.durableRetryAuditRecordCreated, false, "audit plan does not create durable retry audit records");
  assertEqual(result.retryLedgerCreated, false, "audit plan does not create retry ledgers");
  assertEqual(result.retryWorkerCreated, false, "audit plan does not create retry workers");
  assertEqual(result.retryScheduleCreated, false, "audit plan does not create retry schedules");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "audit plan does not enable default live delivery");
  assertEqual(result.publicHostingEnabled, false, "audit plan does not enable public hosting");
  assertEqual(
    result.manualRetryWorkItemClosureAuditRecordPlanTruth,
    "closure_persistence_preflight_bound_manual_retry_audit_record_plan_no_persistence",
    "audit plan truth is explicit",
  );
  assert(!containsForbiddenTruth(result), "accepted audit plan leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyManualRetryWorkItemClosureAuditRecordPlanRejectsCopiedClosurePersistence(): Promise<void> {
  section("42. Manual Retry Work-Item Closure Audit Record Plan Rejects Copied Closure Persistence");
  const { closeoutRecord, workItemClosure } = await persistedWorkItemClosureFixture();

  const result = await createExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordPlan({
    closeoutRecord,
    workItemClosure: { ...workItemClosure, sourceRefFingerprints: workItemClosure.sourceRefFingerprints.map((source) => ({ ...source })) },
  });

  assertEqual(result.accepted, false, "copied closure persistence cannot produce an audit record plan");
  assertEqual(result.reasonCode, "external_media_transfer_trusted_work_item_closure_required", "copied closure audit-plan rejection is bounded");
  assertEqual(result.workItemClosureAuditRecordPlan, undefined, "copied closure rejection returns no audit plan");
  assertEqual(result.durableRetryAuditRecordReady, false, "copied closure rejection does not mark durable audit inputs ready");
  assertEqual(result.durableRetryAuditRecordCreated, false, "copied closure rejection creates no durable audit record");
  assertEqual(result.retryLedgerCreated, false, "copied closure rejection creates no retry ledger");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "copied closure rejection enables no default live delivery");
  assert(!containsForbiddenTruth(result), "copied closure audit-plan rejection leaks no raw truth");
}

async function verifyManualRetryWorkItemClosureAuditRecordPlanRejectsMismatchedTrustedClosurePersistence(): Promise<void> {
  section("43. Manual Retry Work-Item Closure Audit Record Plan Rejects Mismatched Trusted Closure Persistence");
  const { closeoutRecord } = await persistedWorkItemClosureFixture();
  const { workItemClosure } = await persistedWorkItemClosureFixture({
    workspaceId: "T176PRIVATE",
    accountId: "A176PRIVATE",
    targetId: "C176PRIVATE",
    threadId: "171000.1760",
    fileRefs: fileRefs("phase176_other"),
  });

  const result = await createExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordPlan({
    closeoutRecord,
    workItemClosure,
  });

  assertEqual(result.accepted, false, "mismatched trusted closure persistence cannot produce an audit record plan");
  assertEqual(result.reasonCode, "external_media_transfer_work_item_closure_persistence_current_truth_mismatch", "mismatched audit-plan rejection is bounded");
  assertEqual(result.workItemClosureAuditRecordPlan, undefined, "mismatched rejection returns no audit plan");
  assertEqual(result.workItemClosurePersistencePreflight.accepted, false, "mismatched rejection exposes bounded failed preflight");
  assertEqual(result.durableRetryAuditRecordReady, false, "mismatched closure rejection does not mark durable audit inputs ready");
  assertEqual(result.durableRetryAuditRecordCreated, false, "mismatched closure rejection creates no durable audit record");
  assertEqual(result.retryWorkerCreated, false, "mismatched closure rejection creates no retry worker");
  assertEqual(result.publicHostingEnabled, false, "mismatched closure rejection enables no public hosting");
  assert(!containsForbiddenTruth(result), "mismatched closure audit-plan rejection leaks no raw truth");
}

async function verifyManualRetryWorkItemClosureAuditRecordPlanPreflightAcceptsCurrentPlan(): Promise<void> {
  section("44. Manual Retry Work-Item Closure Audit Record Plan Preflight Accepts Current Plan");
  const { closeoutRecord, workItemClosure } = await persistedWorkItemClosureFixture();
  const planResult = await createExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordPlan({
    closeoutRecord,
    workItemClosure,
  });
  assertEqual(planResult.accepted, true, "fixture audit record plan is accepted");

  const result = await preflightExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordPlan({
    closeoutRecord,
    workItemClosure,
    workItemClosureAuditRecordPlan: planResult.workItemClosureAuditRecordPlan,
  });

  assertEqual(result.accepted, true, "current audit record plan preflight is accepted");
  assertEqual(result.workItemClosureAuditRecordPlanResult.accepted, true, "preflight recomputes current audit-plan truth");
  assertEqual(result.manualRetryWorkItemClosureAuditRecordPlanIdMatched, true, "preflight matches audit plan id");
  assertEqual(result.manualRetryWorkItemClosurePersistenceIdMatched, true, "preflight matches closure persistence id");
  assertEqual(result.manualRetryWorkItemClosureIdMatched, true, "preflight matches closure id");
  assertEqual(result.closeoutRecordPersistenceIdMatched, true, "preflight matches closeout record persistence id");
  assertEqual(result.workItemCorrelationMatched, true, "preflight matches work-item correlation");
  assertEqual(result.transferKeyMatched, true, "preflight matches transfer key");
  assertEqual(result.sourceRefFingerprintsMatched, true, "preflight matches source fingerprints");
  assertEqual(result.targetCorrelationMatched, true, "preflight matches target fingerprint");
  assertEqual(result.hostReportedDeliveredCountMatched, true, "preflight matches delivered count");
  assertEqual(result.closedAtMatched, true, "preflight matches work-item close time");
  assertEqual(result.persistedAtMatched, true, "preflight matches work-item persistence time");
  assertEqual(result.closurePersistencePreflightAccepted, true, "preflight requires accepted closure-persistence preflight");
  assertEqual(result.durableRetryAuditRecordReady, true, "preflight marks redacted durable-audit inputs ready");
  assertEqual(result.durableRetryAuditRecordCreated, false, "preflight creates no durable retry audit record");
  assertEqual(result.retryLedgerCreated, false, "preflight creates no retry ledger");
  assertEqual(result.retryWorkerCreated, false, "preflight creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "preflight creates no retry schedule");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "preflight enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "preflight enables no public hosting");
  assertEqual(result.durableRetryAuditStillBlocked, true, "preflight keeps durable retry audit persistence blocked");
  assertEqual(result.retryLedgerStillBlocked, true, "preflight keeps retry ledger blocked");
  assertEqual(
    result.manualRetryWorkItemClosureAuditRecordPlanPreflightTruth,
    "recomputed_from_trusted_closure_persistence_preflight_and_supplied_audit_record_plan_no_persistence",
    "audit record plan preflight truth is explicit",
  );
  assertEqual(
    result.workItemClosureAuditRecordPlan?.manualRetryWorkItemClosureAuditRecordPlanId,
    planResult.workItemClosureAuditRecordPlan?.manualRetryWorkItemClosureAuditRecordPlanId,
    "preflight returns expected audit plan truth",
  );
  assert(!containsForbiddenTruth(result), "accepted audit record plan preflight leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyManualRetryWorkItemClosureAuditRecordPlanPreflightRejectsMismatchedPlan(): Promise<void> {
  section("45. Manual Retry Work-Item Closure Audit Record Plan Preflight Rejects Mismatched Plan");
  const { closeoutRecord, workItemClosure } = await persistedWorkItemClosureFixture();
  const otherFixture = await persistedWorkItemClosureFixture({
    workspaceId: "T178PRIVATE",
    accountId: "A178PRIVATE",
    targetId: "C178PRIVATE",
    threadId: "171000.1780",
    fileRefs: fileRefs("phase178_other"),
  });
  const otherPlanResult = await createExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordPlan({
    closeoutRecord: otherFixture.closeoutRecord,
    workItemClosure: otherFixture.workItemClosure,
  });
  assertEqual(otherPlanResult.accepted, true, "fixture mismatched audit plan is internally valid");

  const result = await preflightExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordPlan({
    closeoutRecord,
    workItemClosure,
    workItemClosureAuditRecordPlan: otherPlanResult.workItemClosureAuditRecordPlan,
  });

  assertEqual(result.accepted, false, "mismatched audit record plan preflight is rejected");
  assertEqual(result.reasonCode, "external_media_transfer_work_item_closure_audit_record_plan_current_truth_mismatch", "mismatched audit-plan rejection is bounded");
  assertEqual(result.manualRetryWorkItemClosureAuditRecordPlanIdMatched, false, "preflight reports audit plan id mismatch");
  assertEqual(result.closeoutRecordPersistenceIdMatched, false, "preflight reports closeout persistence mismatch");
  assertEqual(result.transferKeyMatched, false, "preflight reports transfer-key mismatch");
  assertEqual(result.sourceRefFingerprintsMatched, false, "preflight reports source fingerprint mismatch");
  assertEqual(result.targetCorrelationMatched, false, "preflight reports target fingerprint mismatch");
  assertEqual(result.workItemClosureAuditRecordPlan, undefined, "mismatched preflight returns no trusted audit plan");
  assertEqual(result.workItemClosureAuditRecordPlanResult.accepted, false, "mismatched preflight returns no nested accepted audit plan");
  assertEqual(result.workItemClosureAuditRecordPlanResult.workItemClosureAuditRecordPlan, undefined, "mismatched preflight omits nested recomputed audit plan");
  assertEqual(result.workItemClosureAuditRecordPlanResult.durableRetryAuditRecordReady, false, "mismatched preflight omits nested durable-audit readiness");
  assertEqual(result.durableRetryAuditRecordReady, false, "mismatched plan does not mark durable audit inputs ready");
  assertEqual(result.retryLedgerStillBlocked, true, "mismatched preflight creates no retry ledger");
  assertEqual(result.defaultLiveDeliveryStillBlocked, true, "mismatched preflight enables no default live delivery");
  assert(!containsForbiddenTruth(result), "mismatched audit record plan preflight leaks no raw truth");
}

async function verifyManualRetryWorkItemClosureAuditRecordPlanPreflightRejectsUntrustedClosurePersistence(): Promise<void> {
  section("46. Manual Retry Work-Item Closure Audit Record Plan Preflight Rejects Untrusted Closure Persistence");
  const { closeoutRecord, workItemClosure } = await persistedWorkItemClosureFixture();
  const planResult = await createExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordPlan({
    closeoutRecord,
    workItemClosure,
  });
  assertEqual(planResult.accepted, true, "fixture audit plan is accepted before copied closure test");

  const result = await preflightExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordPlan({
    closeoutRecord,
    workItemClosure: {
      ...workItemClosure,
      sourceRefFingerprints: workItemClosure.sourceRefFingerprints.map((source) => ({ ...source })),
    },
    workItemClosureAuditRecordPlan: planResult.workItemClosureAuditRecordPlan,
  });

  assertEqual(result.accepted, false, "copied closure persistence blocks audit-plan preflight");
  assertEqual(result.reasonCode, "external_media_transfer_trusted_work_item_closure_required", "copied closure audit-plan preflight rejection is bounded");
  assertEqual(result.workItemClosureAuditRecordPlan, undefined, "copied closure rejection returns no audit plan");
  assertEqual(result.workItemClosureAuditRecordPlanResult.accepted, false, "copied closure rejects recomputed audit plan");
  assertEqual(result.durableRetryAuditRecordReady, false, "copied closure preflight does not mark durable audit inputs ready");
  assertEqual(result.retryLedgerCreated, false, "copied closure preflight creates no retry ledger");
  assertEqual(result.publicHostingEnabled, false, "copied closure preflight enables no public hosting");
  assert(!containsForbiddenTruth(result), "copied closure audit-plan preflight rejection leaks no raw truth");
}

async function verifyManualRetryWorkItemClosureAuditRecordPlanPreflightRejectsContaminatedPlan(): Promise<void> {
  section("47. Manual Retry Work-Item Closure Audit Record Plan Preflight Rejects Contaminated Plan");
  const { closeoutRecord, workItemClosure } = await persistedWorkItemClosureFixture();
  const planResult = await createExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordPlan({
    closeoutRecord,
    workItemClosure,
  });
  assertEqual(planResult.accepted, true, "fixture audit plan is accepted before contaminated plan test");

  const result = await preflightExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordPlan({
    closeoutRecord,
    workItemClosure,
    workItemClosureAuditRecordPlan: {
      ...planResult.workItemClosureAuditRecordPlan,
      credentialValue: "xoxb-real-credential-value",
      retryLedgerCreated: true,
      durableRetryAuditRecordCreated: true,
    },
  });

  assertEqual(result.accepted, false, "contaminated audit record plan preflight is rejected");
  assertEqual(result.reasonCode, "valid_external_media_transfer_work_item_closure_audit_record_plan_required", "contaminated audit-plan rejection is bounded");
  assertEqual(result.workItemClosureAuditRecordPlan, undefined, "contaminated preflight returns no audit plan");
  assertEqual(result.workItemClosureAuditRecordPlanResult.accepted, false, "contaminated preflight returns no nested accepted audit plan");
  assertEqual(result.workItemClosureAuditRecordPlanResult.workItemClosureAuditRecordPlan, undefined, "contaminated preflight omits nested recomputed audit plan");
  assertEqual(result.workItemClosureAuditRecordPlanResult.durableRetryAuditRecordReady, false, "contaminated preflight omits nested durable-audit readiness");
  assertEqual(result.retryLedgerStillBlocked, false, "contaminated retry-ledger claim is exposed as not trusted");
  assertEqual(result.durableRetryAuditStillBlocked, false, "contaminated durable audit claim is exposed as not trusted");
  assertEqual(result.retryWorkerCreated, false, "contaminated preflight creates no retry worker");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "contaminated preflight enables no default live delivery");
  assert(!containsForbiddenTruth(result), "contaminated audit record plan preflight leaks no raw truth");
}

async function auditRecordPlanPreflightFixture(
  overrides: Partial<ExternalChannelMediaTransferCandidate> = {},
) {
  const { closeoutRecord, workItemClosure } = await persistedWorkItemClosureFixture(overrides);
  const planResult = await createExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordPlan({
    closeoutRecord,
    workItemClosure,
  });
  assertEqual(planResult.accepted, true, "fixture audit plan is accepted");
  const preflightResult = await preflightExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordPlan({
    closeoutRecord,
    workItemClosure,
    workItemClosureAuditRecordPlan: planResult.workItemClosureAuditRecordPlan,
  });
  assertEqual(preflightResult.accepted, true, "fixture audit plan preflight is accepted");
  return { closeoutRecord, workItemClosure, plan: planResult.workItemClosureAuditRecordPlan!, preflightResult };
}

async function verifyManualRetryWorkItemClosureAuditRecordPersistenceStoresRedactedRecord(): Promise<void> {
  section("48. Manual Retry Work-Item Closure Audit Record Persistence Stores Redacted Record");
  const { closeoutRecord, workItemClosure, plan } = await auditRecordPlanPreflightFixture();
  const rootDir = await mkdtemp(join(tmpdir(), "colony-phase179-audit-record-"));
  const auditRecordStore = new JsonExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordStore({ rootDir });

  const result = await persistExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecord({
    closeoutRecord,
    workItemClosure,
    workItemClosureAuditRecordPlan: plan,
    auditRecordStore,
    persistedAt: "2026-05-08T21:31:00.000Z",
    persistedBy: "operator",
  });

  assertEqual(result.accepted, true, "accepted audit plan preflight persists an audit record");
  assert(Boolean(result.workItemClosureAuditRecord), "persistence returns an audit record");
  assertEqual(result.workItemClosureAuditRecord?.recordType, "external_media_transfer_manual_retry_work_item_closure_audit_record", "record type is durable audit record");
  assertEqual(result.workItemClosureAuditRecord?.schemaVersion, 1, "audit record schema version is stable");
  assertEqual(result.workItemClosureAuditRecord?.manualRetryWorkItemClosureAuditRecordPlanId, plan.manualRetryWorkItemClosureAuditRecordPlanId, "audit record binds audit plan id");
  assertEqual(result.workItemClosureAuditRecord?.manualRetryWorkItemClosurePersistenceId, workItemClosure.manualRetryWorkItemClosurePersistenceId, "audit record binds closure persistence id");
  assertEqual(result.workItemClosureAuditRecord?.closeoutRecordPersistenceId, closeoutRecord.closeoutRecordPersistenceId, "audit record binds closeout persistence id");
  assertEqual(result.workItemClosureAuditRecord?.durableRetryAuditRecordCreated, true, "audit record records durable audit creation truth");
  assertEqual(result.workItemClosureAuditRecord?.retryLedgerCreated, false, "audit record creates no retry ledger");
  assertEqual(result.workItemClosureAuditRecord?.retryWorkerCreated, false, "audit record creates no retry worker");
  assertEqual(result.workItemClosureAuditRecord?.retryScheduleCreated, false, "audit record creates no retry schedule");
  assertEqual(result.workItemClosureAuditRecord?.automaticVendorRetryAllowed, false, "audit record allows no automatic vendor retry");
  assertEqual(result.workItemClosureAuditRecord?.credentialPersistenceCreated, false, "audit record creates no credential persistence");
  assertEqual(result.workItemClosureAuditRecord?.defaultLiveDeliveryEnabled, false, "audit record enables no default live delivery");
  assertEqual(result.workItemClosureAuditRecord?.publicHostingEnabled, false, "audit record enables no public hosting");
  assertEqual(
    result.workItemClosureAuditRecord?.manualRetryWorkItemClosureAuditRecordTruth,
    "audit_record_plan_preflight_bound_manual_retry_audit_record_persisted_no_retry_ledger",
    "audit record truth is explicit",
  );

  const loaded = await auditRecordStore.loadAuditRecords();
  assertEqual(loaded.length, 1, "audit record store reloads one record");
  assertEqual(
    loaded[0]?.manualRetryWorkItemClosureAuditRecordId,
    result.workItemClosureAuditRecord?.manualRetryWorkItemClosureAuditRecordId,
    "loaded audit record preserves deterministic id",
  );
  assert(!containsForbiddenTruth(result), "persisted audit record leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
  assert(!containsForbiddenTruth(loaded), "loaded audit record leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyManualRetryWorkItemClosureAuditRecordPersistenceRejectsMissingStoreAndMismatchedPlan(): Promise<void> {
  section("49. Manual Retry Work-Item Closure Audit Record Persistence Rejects Missing Store And Mismatched Plan");
  const { closeoutRecord, workItemClosure } = await persistedWorkItemClosureFixture();
  const otherFixture = await auditRecordPlanPreflightFixture({
    workspaceId: "T179PRIVATE",
    accountId: "A179PRIVATE",
    targetId: "C179PRIVATE",
    threadId: "171000.1790",
    fileRefs: fileRefs("phase179_other"),
  });

  const missingStoreResult = await persistExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecord({
    closeoutRecord,
    workItemClosure,
    workItemClosureAuditRecordPlan: otherFixture.plan,
  });
  assertEqual(missingStoreResult.accepted, false, "missing store blocks audit record persistence");
  assertEqual(missingStoreResult.reasonCode, "external_media_transfer_work_item_closure_audit_record_plan_current_truth_mismatch", "mismatched plan is checked before missing store persistence");
  assertEqual(missingStoreResult.workItemClosureAuditRecord, undefined, "mismatched persistence returns no audit record");
  assertEqual(missingStoreResult.durableRetryAuditRecordCreated, false, "rejected persistence creates no durable audit record");
  assertEqual(
    missingStoreResult.manualRetryWorkItemClosureAuditRecordTruth,
    "audit_record_plan_preflight_bound_manual_retry_audit_record_not_persisted",
    "mismatched persistence truth does not overclaim persistence",
  );
  assertEqual(missingStoreResult.retryLedgerCreated, false, "rejected persistence creates no retry ledger");
  assert(!containsForbiddenTruth(missingStoreResult), "mismatched audit record persistence rejection leaks no raw truth");

  const planResult = await createExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordPlan({
    closeoutRecord,
    workItemClosure,
  });
  assertEqual(planResult.accepted, true, "fixture audit plan is accepted before missing store test");
  const missingStoreCurrentPlanResult = await persistExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecord({
    closeoutRecord,
    workItemClosure,
    workItemClosureAuditRecordPlan: planResult.workItemClosureAuditRecordPlan,
  });
  assertEqual(missingStoreCurrentPlanResult.accepted, false, "missing store blocks current audit record persistence");
  assertEqual(missingStoreCurrentPlanResult.reasonCode, "external_media_transfer_work_item_closure_audit_record_store_required", "missing store rejection is bounded");
  assertEqual(missingStoreCurrentPlanResult.workItemClosureAuditRecord, undefined, "missing store returns no audit record");
  assertEqual(missingStoreCurrentPlanResult.durableRetryAuditRecordCreated, false, "missing store creates no durable audit record");
  assertEqual(
    missingStoreCurrentPlanResult.manualRetryWorkItemClosureAuditRecordTruth,
    "audit_record_plan_preflight_bound_manual_retry_audit_record_not_persisted",
    "missing store truth does not overclaim persistence",
  );
}

async function verifyManualRetryWorkItemClosureAuditRecordPersistenceRejectsTamperedJournalAndAppendFailedRecord(): Promise<void> {
  section("50. Manual Retry Work-Item Closure Audit Record Persistence Rejects Tampered Journal And Append-Failed Record");
  const { closeoutRecord, workItemClosure, plan } = await auditRecordPlanPreflightFixture();
  const rootDir = await mkdtemp(join(tmpdir(), "colony-phase179-audit-record-tampered-"));
  const auditRecordStore = new JsonExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordStore({ rootDir });
  const result = await persistExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecord({
    closeoutRecord,
    workItemClosure,
    workItemClosureAuditRecordPlan: plan,
    auditRecordStore,
    persistedAt: "2026-05-08T21:32:00.000Z",
    persistedBy: "operator",
  });
  assertEqual(result.accepted, true, "fixture audit record persistence is accepted before tamper test");

  const validShapeTamperedRecord = {
    ...result.workItemClosureAuditRecord!,
    hostReportedDeliveredCount: result.workItemClosureAuditRecord!.hostReportedDeliveredCount + 1,
  };
  await writeFile(
    join(rootDir, "external-media-transfer-work-item-closure-audit-records.jsonl"),
    `${JSON.stringify(validShapeTamperedRecord)}\n`,
    "utf8",
  );
  try {
    await auditRecordStore.loadAuditRecords();
    assert(false, "valid-shaped tampered audit record journal is rejected");
  } catch {
    assert(true, "valid-shaped tampered audit record journal is rejected");
  }

  await writeFile(join(rootDir, "external-media-transfer-work-item-closure-audit-records.jsonl"), "{\"recordType\":\"tampered\"}\n", "utf8");
  try {
    await auditRecordStore.loadAuditRecords();
    assert(false, "tampered audit record journal is rejected");
  } catch {
    assert(true, "tampered audit record journal is rejected");
  }

  let capturedAppendRecord: ExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecord | undefined;
  const rejectingStore: ExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordPersistenceStore = {
    appendAuditRecords: async (records) => {
      capturedAppendRecord = records[0];
      throw new Error("append rejected");
    },
    loadAuditRecords: async () => [],
  };
  const appendFailedResult = await persistExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecord({
    closeoutRecord,
    workItemClosure,
    workItemClosureAuditRecordPlan: plan,
    auditRecordStore: rejectingStore,
  });
  assertEqual(appendFailedResult.accepted, false, "append-failed audit record persistence is rejected");
  assertEqual(appendFailedResult.reasonCode, "external_media_transfer_work_item_closure_audit_record_store_append_failed", "append failure rejection is bounded");
  assertEqual(appendFailedResult.workItemClosureAuditRecord, undefined, "append failure returns no trusted audit record");
  assertEqual(appendFailedResult.durableRetryAuditRecordCreated, false, "append failure creates no durable audit record");
  assertEqual(
    appendFailedResult.manualRetryWorkItemClosureAuditRecordTruth,
    "audit_record_plan_preflight_bound_manual_retry_audit_record_not_persisted",
    "append failure truth does not overclaim persistence",
  );

  const postFailureStore = new JsonExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordStore({
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase179-audit-record-append-failed-")),
  });
  try {
    await postFailureStore.appendAuditRecords([capturedAppendRecord!]);
    assert(false, "append-failed captured audit record cannot be replayed into trusted store");
  } catch {
    assert(true, "append-failed captured audit record cannot be replayed into trusted store");
  }
}

async function persistedAuditRecordFixture(
  overrides: Partial<ExternalChannelMediaTransferCandidate> = {},
): Promise<{
  auditRecord: ExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecord;
  auditRecordStore: JsonExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordStore;
  closeoutRecord: ExternalChannelMediaTransferManualRetryCloseoutRecordPersistence;
  workItemClosure: ExternalChannelMediaTransferManualRetryWorkItemClosurePersistence;
}> {
  const { closeoutRecord, workItemClosure, plan } = await auditRecordPlanPreflightFixture(overrides);
  const auditRecordStore = new JsonExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordStore({
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase180-audit-record-")),
  });
  const result = await persistExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecord({
    closeoutRecord,
    workItemClosure,
    workItemClosureAuditRecordPlan: plan,
    auditRecordStore,
    persistedAt: "2026-05-08T21:48:00.000Z",
    persistedBy: "operator",
  });
  assertEqual(result.accepted, true, "fixture audit record persistence is accepted");
  assert(Boolean(result.workItemClosureAuditRecord), "fixture audit record is returned");
  return { auditRecord: result.workItemClosureAuditRecord!, auditRecordStore, closeoutRecord, workItemClosure };
}

async function verifyManualRetryLedgerEntryPlanAcceptsTrustedAuditRecord(): Promise<void> {
  section("51. Manual Retry Ledger Entry Plan Accepts Trusted Audit Record");
  const { auditRecord, auditRecordStore } = await persistedAuditRecordFixture();
  const loadedAuditRecords = await auditRecordStore.loadAuditRecords();
  assertEqual(loadedAuditRecords.length, 1, "ledger plan fixture reloads one trusted audit record");
  const reloadedAuditRecord = loadedAuditRecords[0];
  assertEqual(
    reloadedAuditRecord.manualRetryWorkItemClosureAuditRecordId,
    auditRecord.manualRetryWorkItemClosureAuditRecordId,
    "reloaded audit record preserves deterministic id",
  );

  const result = await createExternalChannelMediaTransferManualRetryLedgerEntryPlan({ auditRecord: reloadedAuditRecord });

  assertEqual(result.accepted, true, "trusted audit record can plan a retry ledger entry");
  assert(Boolean(result.retryLedgerEntryPlan), "retry ledger entry plan is returned");
  assertEqual(result.retryLedgerEntryPlan?.planType, "external_media_transfer_manual_retry_ledger_entry_plan", "ledger plan type is explicit");
  assertEqual(result.retryLedgerEntryPlan?.planVersion, 1, "ledger plan version is stable");
  assertEqual(result.retryLedgerEntryPlan?.manualRetryWorkItemClosureAuditRecordId, reloadedAuditRecord.manualRetryWorkItemClosureAuditRecordId, "ledger plan binds audit record id");
  assertEqual(result.retryLedgerEntryPlan?.manualRetryWorkItemClosureAuditRecordPlanId, reloadedAuditRecord.manualRetryWorkItemClosureAuditRecordPlanId, "ledger plan binds audit record plan id");
  assertEqual(result.retryLedgerEntryPlan?.manualRetryWorkItemClosurePersistenceId, reloadedAuditRecord.manualRetryWorkItemClosurePersistenceId, "ledger plan binds closure persistence id");
  assertEqual(result.retryLedgerEntryPlan?.closeoutRecordPersistenceId, reloadedAuditRecord.closeoutRecordPersistenceId, "ledger plan binds closeout persistence id");
  assertEqual(result.retryLedgerEntryPlan?.workItemCorrelationId, reloadedAuditRecord.workItemCorrelationId, "ledger plan binds work-item correlation");
  assertEqual(result.retryLedgerEntryPlan?.transferKey, reloadedAuditRecord.transferKey, "ledger plan binds transfer key");
  assertEqual(result.retryLedgerEntryPlan?.sourceRefFingerprints.length, reloadedAuditRecord.sourceRefFingerprints.length, "ledger plan preserves source fingerprint count");
  assertEqual(result.retryLedgerEntryPlan?.targetCorrelationFingerprint, reloadedAuditRecord.targetCorrelationFingerprint, "ledger plan binds target fingerprint");
  assertEqual(result.retryLedgerEntryPlan?.hostReportedDeliveredCount, reloadedAuditRecord.hostReportedDeliveredCount, "ledger plan binds delivered count");
  assertEqual(result.retryLedgerEntryPlan?.durableRetryAuditRecordCreated, true, "ledger plan requires persisted audit truth");
  assertEqual(result.retryLedgerEntryPlan?.retryLedgerReady, true, "ledger plan marks retry-ledger inputs ready");
  assertEqual(result.retryLedgerEntryPlan?.retryLedgerCreated, false, "ledger plan does not create retry ledger");
  assertEqual(result.retryLedgerEntryPlan?.retryWorkerCreated, false, "ledger plan does not create retry worker");
  assertEqual(result.retryLedgerEntryPlan?.retryScheduleCreated, false, "ledger plan does not create retry schedule");
  assertEqual(result.retryLedgerEntryPlan?.automaticVendorRetryAllowed, false, "ledger plan allows no automatic vendor retry");
  assertEqual(result.retryLedgerEntryPlan?.credentialPersistenceCreated, false, "ledger plan creates no credential persistence");
  assertEqual(result.retryLedgerEntryPlan?.defaultLiveDeliveryEnabled, false, "ledger plan enables no default live delivery");
  assertEqual(result.retryLedgerEntryPlan?.publicHostingEnabled, false, "ledger plan enables no public hosting");
  assertEqual(
    result.retryLedgerEntryPlan?.manualRetryLedgerEntryPlanTruth,
    "trusted_audit_record_bound_manual_retry_ledger_entry_plan_no_ledger_created",
    "ledger plan truth is explicit",
  );
  assert(!containsForbiddenTruth(result), "accepted ledger plan leaks no raw refs, targets, signatures, URLs, secrets, paths, or ledgers");
}

async function verifyManualRetryLedgerEntryPlanRejectsCopiedAuditRecord(): Promise<void> {
  section("52. Manual Retry Ledger Entry Plan Rejects Copied Audit Record");
  const { auditRecord } = await persistedAuditRecordFixture({
    workspaceId: "T180PRIVATE",
    accountId: "A180PRIVATE",
    targetId: "C180PRIVATE",
    threadId: "171000.1800",
    fileRefs: fileRefs("phase180_copied"),
  });
  const copiedAuditRecord = JSON.parse(JSON.stringify(auditRecord)) as ExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecord;

  const result = await createExternalChannelMediaTransferManualRetryLedgerEntryPlan({ auditRecord: copiedAuditRecord });

  assertEqual(result.accepted, false, "copied audit record cannot produce a ledger plan");
  assertEqual(result.reasonCode, "external_media_transfer_manual_retry_ledger_entry_plan_untrusted_audit_record", "copied audit record rejection is bounded");
  assertEqual(result.retryLedgerEntryPlan, undefined, "copied audit record rejection returns no ledger plan");
  assertEqual(result.retryLedgerReady, false, "copied audit record does not mark ledger inputs ready");
  assertEqual(result.retryLedgerCreated, false, "copied audit record creates no retry ledger");
  assertEqual(result.retryWorkerCreated, false, "copied audit record creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "copied audit record creates no retry schedule");
  assertEqual(result.automaticVendorRetryAllowed, false, "copied audit record allows no automatic vendor retry");
  assert(!containsForbiddenTruth(result), "copied audit record ledger-plan rejection leaks no raw truth");
}

async function verifyManualRetryLedgerEntryPlanRejectsContaminatedAuditRecord(): Promise<void> {
  section("53. Manual Retry Ledger Entry Plan Rejects Contaminated Audit Record");
  const { auditRecord } = await persistedAuditRecordFixture({
    workspaceId: "T181PRIVATE",
    accountId: "A181PRIVATE",
    targetId: "C181PRIVATE",
    threadId: "171000.1810",
    fileRefs: fileRefs("phase180_contaminated"),
  });
  const contaminatedAuditRecord = {
    ...auditRecord,
    retryLedgerCreated: true,
    automaticVendorRetryAllowed: true,
  };

  const result = await createExternalChannelMediaTransferManualRetryLedgerEntryPlan({ auditRecord: contaminatedAuditRecord });

  assertEqual(result.accepted, false, "contaminated audit record cannot produce a ledger plan");
  assertEqual(result.reasonCode, "external_media_transfer_manual_retry_ledger_entry_plan_invalid_audit_record", "contaminated audit record rejection is bounded");
  assertEqual(result.retryLedgerEntryPlan, undefined, "contaminated audit record rejection returns no ledger plan");
  assertEqual(result.retryLedgerReady, false, "contaminated audit record does not mark ledger inputs ready");
  assertEqual(result.retryLedgerCreated, false, "contaminated audit record creates no retry ledger");
  assertEqual(result.automaticVendorRetryAllowed, false, "contaminated audit record allows no automatic vendor retry");
  assert(!containsForbiddenTruth(result), "contaminated audit record ledger-plan rejection leaks no raw truth");
}

async function retryLedgerEntryPlanFixture(
  overrides: Partial<ExternalChannelMediaTransferCandidate> = {},
): Promise<{
  retryLedgerEntryPlan: ExternalChannelMediaTransferManualRetryLedgerEntryPlan;
}> {
  const { auditRecordStore } = await persistedAuditRecordFixture(overrides);
  const [auditRecord] = await auditRecordStore.loadAuditRecords();
  const result = await createExternalChannelMediaTransferManualRetryLedgerEntryPlan({ auditRecord });
  assertEqual(result.accepted, true, "fixture retry ledger entry plan is accepted");
  assert(Boolean(result.retryLedgerEntryPlan), "fixture retry ledger entry plan is returned");
  return { retryLedgerEntryPlan: result.retryLedgerEntryPlan! };
}

async function verifyManualRetryLedgerEntryPersistenceStoresRedactedEntry(): Promise<void> {
  section("54. Manual Retry Ledger Entry Persistence Stores Redacted Entry");
  const { retryLedgerEntryPlan } = await retryLedgerEntryPlanFixture();
  const retryLedgerStore = new JsonExternalChannelMediaTransferManualRetryLedgerEntryStore({
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase181-retry-ledger-entry-")),
  });

  const result = await persistExternalChannelMediaTransferManualRetryLedgerEntry({
    retryLedgerEntryPlan,
    retryLedgerStore,
    persistedAt: "2026-05-08T22:05:00.000Z",
    persistedBy: "operator",
  });

  assertEqual(result.accepted, true, "trusted retry ledger entry plan persists a ledger entry");
  assert(Boolean(result.retryLedgerEntry), "retry ledger entry is returned");
  assertEqual(result.retryLedgerEntry?.entryType, "external_media_transfer_manual_retry_ledger_entry", "retry ledger entry type is explicit");
  assertEqual(result.retryLedgerEntry?.entryVersion, 1, "retry ledger entry version is stable");
  assertEqual(result.retryLedgerEntry?.manualRetryLedgerEntryPlanId, retryLedgerEntryPlan.manualRetryLedgerEntryPlanId, "retry ledger entry binds plan id");
  assertEqual(result.retryLedgerEntry?.manualRetryWorkItemClosureAuditRecordId, retryLedgerEntryPlan.manualRetryWorkItemClosureAuditRecordId, "retry ledger entry binds audit record id");
  assertEqual(result.retryLedgerEntry?.manualRetryWorkItemClosurePersistenceId, retryLedgerEntryPlan.manualRetryWorkItemClosurePersistenceId, "retry ledger entry binds closure persistence id");
  assertEqual(result.retryLedgerEntry?.closeoutRecordPersistenceId, retryLedgerEntryPlan.closeoutRecordPersistenceId, "retry ledger entry binds closeout persistence id");
  assertEqual(result.retryLedgerEntry?.workItemCorrelationId, retryLedgerEntryPlan.workItemCorrelationId, "retry ledger entry binds work-item correlation");
  assertEqual(result.retryLedgerEntry?.transferKey, retryLedgerEntryPlan.transferKey, "retry ledger entry binds transfer key");
  assertEqual(result.retryLedgerEntry?.sourceRefFingerprints.length, retryLedgerEntryPlan.sourceRefFingerprints.length, "retry ledger entry preserves source fingerprint count");
  assertEqual(result.retryLedgerEntry?.targetCorrelationFingerprint, retryLedgerEntryPlan.targetCorrelationFingerprint, "retry ledger entry binds target fingerprint");
  assertEqual(result.retryLedgerEntry?.hostReportedDeliveredCount, retryLedgerEntryPlan.hostReportedDeliveredCount, "retry ledger entry binds delivered count");
  assertEqual(result.retryLedgerEntry?.retryLedgerEntryPersisted, true, "retry ledger entry records persistence truth");
  assertEqual(result.retryLedgerEntry?.retryLedgerCreated, true, "retry ledger entry creates only ledger-entry persistence truth");
  assertEqual(result.retryLedgerEntry?.retryWorkerCreated, false, "retry ledger entry creates no retry worker");
  assertEqual(result.retryLedgerEntry?.retryScheduleCreated, false, "retry ledger entry creates no retry schedule");
  assertEqual(result.retryLedgerEntry?.automaticVendorRetryAllowed, false, "retry ledger entry allows no automatic vendor retry");
  assertEqual(result.retryLedgerEntry?.credentialPersistenceCreated, false, "retry ledger entry creates no credential persistence");
  assertEqual(result.retryLedgerEntry?.defaultLiveDeliveryEnabled, false, "retry ledger entry enables no default live delivery");
  assertEqual(result.retryLedgerEntry?.publicHostingEnabled, false, "retry ledger entry enables no public hosting");
  assertEqual(
    result.retryLedgerEntry?.manualRetryLedgerEntryTruth,
    "trusted_ledger_entry_plan_bound_manual_retry_ledger_entry_persisted_no_worker_or_schedule",
    "retry ledger entry truth is explicit",
  );
  const loadedEntries = await retryLedgerStore.loadRetryLedgerEntries();
  assertEqual(loadedEntries.length, 1, "retry ledger entry store reloads one entry");
  assertEqual(
    loadedEntries[0].manualRetryLedgerEntryId,
    result.retryLedgerEntry?.manualRetryLedgerEntryId,
    "loaded retry ledger entry preserves deterministic id",
  );
  assert(!containsForbiddenTruth(result), "persisted retry ledger entry leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
  assert(!containsForbiddenTruth(loadedEntries), "loaded retry ledger entry leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyManualRetryLedgerEntryPersistenceRejectsMissingStoreAndCopiedPlan(): Promise<void> {
  section("55. Manual Retry Ledger Entry Persistence Rejects Missing Store And Copied Plan");
  const { retryLedgerEntryPlan } = await retryLedgerEntryPlanFixture({
    workspaceId: "T181COPIED",
    accountId: "A181COPIED",
    targetId: "C181COPIED",
    threadId: "171000.1811",
    fileRefs: fileRefs("phase181_copied"),
  });

  const missingStoreResult = await persistExternalChannelMediaTransferManualRetryLedgerEntry({
    retryLedgerEntryPlan,
  });
  assertEqual(missingStoreResult.accepted, false, "missing retry ledger store rejects persistence");
  assertEqual(missingStoreResult.reasonCode, "external_media_transfer_manual_retry_ledger_entry_store_required", "missing retry ledger store rejection is bounded");
  assertEqual(missingStoreResult.retryLedgerEntry, undefined, "missing retry ledger store returns no entry");
  assertEqual(missingStoreResult.retryLedgerCreated, false, "missing retry ledger store creates no ledger entry");
  assertEqual(missingStoreResult.retryWorkerCreated, false, "missing retry ledger store creates no retry worker");
  assertEqual(missingStoreResult.retryScheduleCreated, false, "missing retry ledger store creates no retry schedule");
  assert(!containsForbiddenTruth(missingStoreResult), "missing retry ledger store rejection leaks no raw truth");

  const copiedPlan = JSON.parse(JSON.stringify(retryLedgerEntryPlan)) as ExternalChannelMediaTransferManualRetryLedgerEntryPlan;
  const copiedPlanResult = await persistExternalChannelMediaTransferManualRetryLedgerEntry({
    retryLedgerEntryPlan: copiedPlan,
    retryLedgerStore: new JsonExternalChannelMediaTransferManualRetryLedgerEntryStore({
      rootDir: await mkdtemp(join(tmpdir(), "colony-phase181-copied-plan-")),
    }),
  });
  assertEqual(copiedPlanResult.accepted, false, "copied retry ledger entry plan rejects persistence");
  assertEqual(copiedPlanResult.reasonCode, "external_media_transfer_manual_retry_ledger_entry_plan_untrusted", "copied retry ledger plan rejection is bounded");
  assertEqual(copiedPlanResult.retryLedgerEntry, undefined, "copied retry ledger plan returns no entry");
  assertEqual(copiedPlanResult.retryLedgerCreated, false, "copied retry ledger plan creates no ledger entry");
  assertEqual(copiedPlanResult.automaticVendorRetryAllowed, false, "copied retry ledger plan allows no automatic retry");
  assert(!containsForbiddenTruth(copiedPlanResult), "copied retry ledger plan rejection leaks no raw truth");
}

async function verifyManualRetryLedgerEntryPersistenceRejectsTamperedJournalAndAppendFailedEntry(): Promise<void> {
  section("56. Manual Retry Ledger Entry Persistence Rejects Tampered Journal And Append-Failed Entry");
  const { retryLedgerEntryPlan } = await retryLedgerEntryPlanFixture({
    workspaceId: "T181TAMPER",
    accountId: "A181TAMPER",
    targetId: "C181TAMPER",
    threadId: "171000.1812",
    fileRefs: fileRefs("phase181_tamper"),
  });
  const rootDir = await mkdtemp(join(tmpdir(), "colony-phase181-tampered-ledger-entry-"));
  const retryLedgerStore = new JsonExternalChannelMediaTransferManualRetryLedgerEntryStore({ rootDir });
  const result = await persistExternalChannelMediaTransferManualRetryLedgerEntry({
    retryLedgerEntryPlan,
    retryLedgerStore,
  });
  assertEqual(result.accepted, true, "fixture retry ledger entry persistence is accepted before tamper test");

  const tamperedEntry = {
    ...result.retryLedgerEntry!,
    hostReportedDeliveredCount: result.retryLedgerEntry!.hostReportedDeliveredCount + 1,
  };
  await writeFile(
    join(rootDir, "external-media-transfer-manual-retry-ledger-entries.jsonl"),
    `${JSON.stringify(tamperedEntry)}\n`,
    "utf8",
  );
  try {
    await retryLedgerStore.loadRetryLedgerEntries();
    assert(false, "valid-shaped tampered retry ledger entry journal is rejected");
  } catch {
    assert(true, "valid-shaped tampered retry ledger entry journal is rejected");
  }

  let capturedAppendEntry: ExternalChannelMediaTransferManualRetryLedgerEntry | undefined;
  const rejectingStore: ExternalChannelMediaTransferManualRetryLedgerEntryPersistenceStore = {
    appendRetryLedgerEntries: async (entries) => {
      capturedAppendEntry = entries[0];
      throw new Error("append rejected");
    },
    loadRetryLedgerEntries: async () => [],
  };
  const appendFailedResult = await persistExternalChannelMediaTransferManualRetryLedgerEntry({
    retryLedgerEntryPlan,
    retryLedgerStore: rejectingStore,
  });
  assertEqual(appendFailedResult.accepted, false, "append-failed retry ledger entry persistence is rejected");
  assertEqual(appendFailedResult.reasonCode, "external_media_transfer_manual_retry_ledger_entry_store_append_failed", "append failure rejection is bounded");
  assertEqual(appendFailedResult.retryLedgerEntry, undefined, "append failure returns no trusted retry ledger entry");
  assertEqual(appendFailedResult.retryLedgerCreated, false, "append failure creates no retry ledger entry");
  assertEqual(appendFailedResult.retryWorkerCreated, false, "append failure creates no retry worker");
  assertEqual(appendFailedResult.retryScheduleCreated, false, "append failure creates no retry schedule");
  assert(!containsForbiddenTruth(appendFailedResult), "append failure rejection leaks no raw truth");

  const postFailureStore = new JsonExternalChannelMediaTransferManualRetryLedgerEntryStore({
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase181-append-failed-ledger-entry-")),
  });
  try {
    await postFailureStore.appendRetryLedgerEntries([capturedAppendEntry!]);
    assert(false, "append-failed captured retry ledger entry cannot be replayed into trusted store");
  } catch {
    assert(true, "append-failed captured retry ledger entry cannot be replayed into trusted store");
  }
}

async function retryLedgerEntryFixture(
  overrides: Partial<ExternalChannelMediaTransferCandidate> = {},
): Promise<{
  retryLedgerEntry: ExternalChannelMediaTransferManualRetryLedgerEntry;
}> {
  const { retryLedgerEntryPlan } = await retryLedgerEntryPlanFixture(overrides);
  const retryLedgerStore = new JsonExternalChannelMediaTransferManualRetryLedgerEntryStore({
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase182-retry-ledger-entry-")),
  });
  const persisted = await persistExternalChannelMediaTransferManualRetryLedgerEntry({
    retryLedgerEntryPlan,
    retryLedgerStore,
    persistedAt: "2026-05-08T22:30:00.000Z",
    persistedBy: "operator",
  });
  assertEqual(persisted.accepted, true, "fixture retry ledger entry persistence is accepted");
  const [retryLedgerEntry] = await retryLedgerStore.loadRetryLedgerEntries();
  assert(Boolean(retryLedgerEntry), "fixture retry ledger entry reloads as trusted entry");
  return { retryLedgerEntry };
}

async function verifyManualRetryLedgerEntryPreflightAcceptsTrustedEntry(): Promise<void> {
  section("57. Manual Retry Ledger Entry Preflight Accepts Trusted Entry");
  const { retryLedgerEntry } = await retryLedgerEntryFixture({
    workspaceId: "T182TRUSTED",
    accountId: "A182TRUSTED",
    targetId: "C182TRUSTED",
    threadId: "171000.1820",
    fileRefs: fileRefs("phase182_trusted"),
  });

  const result = await preflightExternalChannelMediaTransferManualRetryLedgerEntry({
    retryLedgerEntry,
  });

  assertEqual(result.accepted, true, "trusted retry ledger entry preflight is accepted");
  assertEqual(result.retryLedgerEntry, retryLedgerEntry, "preflight returns the trusted entry object");
  assertEqual(result.manualRetryLedgerEntryId, retryLedgerEntry.manualRetryLedgerEntryId, "preflight binds ledger entry id");
  assertEqual(result.manualRetryLedgerEntryPlanId, retryLedgerEntry.manualRetryLedgerEntryPlanId, "preflight binds ledger plan id");
  assertEqual(result.manualRetryWorkItemClosureAuditRecordId, retryLedgerEntry.manualRetryWorkItemClosureAuditRecordId, "preflight binds audit record id");
  assertEqual(result.manualRetryWorkItemClosurePersistenceId, retryLedgerEntry.manualRetryWorkItemClosurePersistenceId, "preflight binds closure persistence id");
  assertEqual(result.closeoutRecordPersistenceId, retryLedgerEntry.closeoutRecordPersistenceId, "preflight binds closeout record persistence id");
  assertEqual(result.retryLedgerReady, true, "preflight preserves retry ledger readiness");
  assertEqual(result.retryLedgerEntryPersisted, true, "preflight preserves retry ledger entry persistence truth");
  assertEqual(result.retryLedgerCreated, true, "preflight acknowledges only the already-persisted ledger entry");
  assertEqual(result.retryLedgerEntryPreflightAccepted, true, "preflight acceptance truth is explicit");
  assertEqual(result.credentialAcknowledgedManualReinvokeExecutionReceiptPersisted, false, "preflight persists no receipt");
  assertEqual(result.backgroundRetryCreated, false, "preflight creates no background retry");
  assertEqual(result.retryWorkerCreated, false, "preflight creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "preflight creates no retry schedule");
  assertEqual(result.automaticVendorRetryAllowed, false, "preflight allows no automatic vendor retry");
  assertEqual(result.credentialPersistenceCreated, false, "preflight creates no credential persistence");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "preflight enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "preflight enables no public hosting");
  assertEqual(
    result.manualRetryLedgerEntryPreflightTruth,
    "trusted_retry_ledger_entry_preflight_no_worker_or_schedule",
    "preflight truth is explicit",
  );
  assert(!containsForbiddenTruth(result), "trusted retry ledger entry preflight leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyManualRetryLedgerEntryPreflightRejectsCopiedOrTamperedEntry(): Promise<void> {
  section("58. Manual Retry Ledger Entry Preflight Rejects Copied Or Tampered Entry");
  const { retryLedgerEntry } = await retryLedgerEntryFixture({
    workspaceId: "T182COPIED",
    accountId: "A182COPIED",
    targetId: "C182COPIED",
    threadId: "171000.1821",
    fileRefs: fileRefs("phase182_copied"),
  });

  const copiedEntry = JSON.parse(JSON.stringify(retryLedgerEntry)) as ExternalChannelMediaTransferManualRetryLedgerEntry;
  const copiedResult = await preflightExternalChannelMediaTransferManualRetryLedgerEntry({
    retryLedgerEntry: copiedEntry,
  });
  assertEqual(copiedResult.accepted, false, "copied retry ledger entry preflight is rejected");
  assertEqual(copiedResult.reasonCode, "external_media_transfer_manual_retry_ledger_entry_untrusted", "copied retry ledger entry rejection is bounded");
  assertEqual(copiedResult.retryLedgerEntry, undefined, "copied retry ledger entry returns no trusted entry");
  assertEqual(copiedResult.retryLedgerEntryPreflightAccepted, false, "copied retry ledger entry is not preflight accepted");
  assertEqual(copiedResult.credentialAcknowledgedManualReinvokeExecutionReceiptPersisted, false, "copied retry ledger entry persists no receipt");
  assertEqual(copiedResult.backgroundRetryCreated, false, "copied retry ledger entry creates no background retry");
  assertEqual(copiedResult.retryWorkerCreated, false, "copied retry ledger entry creates no retry worker");
  assertEqual(copiedResult.retryScheduleCreated, false, "copied retry ledger entry creates no retry schedule");
  assertEqual(copiedResult.automaticVendorRetryAllowed, false, "copied retry ledger entry allows no automatic retry");
  assert(!containsForbiddenTruth(copiedResult), "copied retry ledger entry rejection leaks no raw truth");

  const tamperedEntry = {
    ...copiedEntry,
    retryWorkerCreated: true,
  };
  const tamperedResult = await preflightExternalChannelMediaTransferManualRetryLedgerEntry({
    retryLedgerEntry: tamperedEntry,
  });
  assertEqual(tamperedResult.accepted, false, "tampered retry ledger entry preflight is rejected");
  assertEqual(tamperedResult.reasonCode, "external_media_transfer_manual_retry_ledger_entry_invalid", "tampered retry ledger entry rejection is bounded");
  assertEqual(tamperedResult.retryLedgerEntry, undefined, "tampered retry ledger entry returns no trusted entry");
  assertEqual(tamperedResult.retryLedgerCreated, false, "tampered retry ledger entry creates no ledger entry");
  assertEqual(tamperedResult.credentialAcknowledgedManualReinvokeExecutionReceiptPersisted, false, "tampered retry ledger entry persists no receipt");
  assertEqual(tamperedResult.backgroundRetryCreated, false, "tampered retry ledger entry creates no background retry");
  assertEqual(tamperedResult.retryWorkerCreated, false, "tampered retry ledger entry creates no retry worker");
  assert(!containsForbiddenTruth(tamperedResult), "tampered retry ledger entry rejection leaks no raw truth");
}

async function verifyManualRetryLedgerEntryPreflightRejectsAppendFailedCapturedEntry(): Promise<void> {
  section("59. Manual Retry Ledger Entry Preflight Rejects Append-Failed Captured Entry");
  const { retryLedgerEntryPlan } = await retryLedgerEntryPlanFixture({
    workspaceId: "T182APPEND",
    accountId: "A182APPEND",
    targetId: "C182APPEND",
    threadId: "171000.1822",
    fileRefs: fileRefs("phase182_append_failed"),
  });
  let capturedAppendEntry: ExternalChannelMediaTransferManualRetryLedgerEntry | undefined;
  const rejectingStore: ExternalChannelMediaTransferManualRetryLedgerEntryPersistenceStore = {
    appendRetryLedgerEntries: async (entries) => {
      capturedAppendEntry = entries[0];
      throw new Error("append rejected");
    },
    loadRetryLedgerEntries: async () => [],
  };
  const appendFailedResult = await persistExternalChannelMediaTransferManualRetryLedgerEntry({
    retryLedgerEntryPlan,
    retryLedgerStore: rejectingStore,
  });
  assertEqual(appendFailedResult.accepted, false, "fixture append failure is rejected");

  const preflightResult = await preflightExternalChannelMediaTransferManualRetryLedgerEntry({
    retryLedgerEntry: capturedAppendEntry,
  });
  assertEqual(preflightResult.accepted, false, "append-failed captured retry ledger entry preflight is rejected");
  assertEqual(preflightResult.reasonCode, "external_media_transfer_manual_retry_ledger_entry_untrusted", "append-failed captured entry rejection is bounded");
  assertEqual(preflightResult.retryLedgerEntry, undefined, "append-failed captured entry returns no trusted entry");
  assertEqual(preflightResult.retryLedgerEntryPreflightAccepted, false, "append-failed captured entry is not preflight accepted");
  assertEqual(preflightResult.retryLedgerCreated, false, "append-failed captured entry creates no ledger entry");
  assertEqual(preflightResult.credentialAcknowledgedManualReinvokeExecutionReceiptPersisted, false, "append-failed captured entry persists no receipt");
  assertEqual(preflightResult.backgroundRetryCreated, false, "append-failed captured entry creates no background retry");
  assertEqual(preflightResult.retryWorkerCreated, false, "append-failed captured entry creates no retry worker");
  assertEqual(preflightResult.retryScheduleCreated, false, "append-failed captured entry creates no retry schedule");
  assert(!containsForbiddenTruth(preflightResult), "append-failed captured entry rejection leaks no raw truth");
}

async function verifyManualRetryControlReadinessPlanAcceptsTrustedPreflight(): Promise<void> {
  section("60. Manual Retry Control Readiness Plan Accepts Trusted Ledger Preflight");
  const { retryLedgerEntry } = await retryLedgerEntryFixture({
    workspaceId: "T183READY",
    accountId: "A183READY",
    targetId: "C183READY",
    threadId: "171000.1830",
    fileRefs: fileRefs("phase183_ready"),
  });

  const result = await createExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry,
  });

  assertEqual(result.accepted, true, "trusted retry ledger entry can produce retry-control readiness");
  assertEqual(result.retryLedgerEntryPreflight.accepted, true, "retry-control plan is bound to accepted ledger-entry preflight");
  assert(Boolean(result.retryControlReadinessPlan), "retry-control readiness plan is returned");
  assert(
    result.retryControlReadinessPlanId?.startsWith("manual-retry-control-readiness-plan:") === true,
    "retry-control readiness plan id is deterministic and domain separated",
  );
  assertEqual(result.retryControlReadinessPlan?.manualRetryLedgerEntryId, retryLedgerEntry.manualRetryLedgerEntryId, "readiness plan binds ledger entry id");
  assertEqual(result.retryControlReadinessPlan?.manualRetryLedgerEntryPlanId, retryLedgerEntry.manualRetryLedgerEntryPlanId, "readiness plan binds ledger plan id");
  assertEqual(result.retryControlReadinessPlan?.manualRetryWorkItemClosureAuditRecordId, retryLedgerEntry.manualRetryWorkItemClosureAuditRecordId, "readiness plan binds audit record id");
  assertEqual(result.retryControlReadinessPlan?.manualRetryWorkItemClosurePersistenceId, retryLedgerEntry.manualRetryWorkItemClosurePersistenceId, "readiness plan binds closure persistence id");
  assertEqual(result.retryControlReadinessPlan?.closeoutRecordPersistenceId, retryLedgerEntry.closeoutRecordPersistenceId, "readiness plan binds closeout persistence id");
  assertEqual(result.retryControlReadinessPlan?.workItemCorrelationId, retryLedgerEntry.workItemCorrelationId, "readiness plan binds work-item correlation");
  assertEqual(result.retryControlReadinessPlan?.transferKey, retryLedgerEntry.transferKey, "readiness plan binds transfer key");
  assertEqual(result.retryControlReadinessPlan?.sourceRefFingerprints.length, retryLedgerEntry.sourceRefFingerprints.length, "readiness plan preserves source fingerprint count");
  assertEqual(result.retryControlReadinessPlan?.targetCorrelationFingerprint, retryLedgerEntry.targetCorrelationFingerprint, "readiness plan binds target fingerprint");
  assertEqual(result.retryControlReadinessPlan?.retryLedgerEntryPreflightAccepted, true, "readiness plan requires accepted ledger-entry preflight");
  assertEqual(result.retryControlReadinessPlan?.retryControlReady, true, "readiness plan marks retry-control inputs ready");
  assertEqual(result.retryControlReadinessPlan?.retryWorkerReady, false, "readiness plan does not mark retry worker ready");
  assertEqual(result.retryControlReadinessPlan?.retryScheduleReady, false, "readiness plan does not mark retry schedule ready");
  assertEqual(result.retryControlReadinessPlan?.backgroundRetryCreated, false, "readiness plan creates no background retry");
  assertEqual(result.retryControlReadinessPlan?.retryWorkerCreated, false, "readiness plan creates no retry worker");
  assertEqual(result.retryControlReadinessPlan?.retryScheduleCreated, false, "readiness plan creates no retry schedule");
  assertEqual(result.retryControlReadinessPlan?.automaticVendorRetryAllowed, false, "readiness plan allows no automatic vendor retry");
  assertEqual(result.retryControlReadinessPlan?.credentialPersistenceCreated, false, "readiness plan creates no credential persistence");
  assertEqual(result.retryControlReadinessPlan?.defaultLiveDeliveryEnabled, false, "readiness plan enables no default live delivery");
  assertEqual(result.retryControlReadinessPlan?.publicHostingEnabled, false, "readiness plan enables no public hosting");
  assertEqual(
    result.retryControlReadinessPlan?.manualRetryControlReadinessPlanTruth,
    "trusted_retry_ledger_entry_preflight_bound_manual_retry_control_readiness_no_worker_or_schedule",
    "readiness plan truth is explicit",
  );
  const repeatResult = await createExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry,
  });
  assertEqual(repeatResult.retryControlReadinessPlanId, result.retryControlReadinessPlanId, "same trusted entry produces stable readiness id");
  const { retryLedgerEntry: otherRetryLedgerEntry } = await retryLedgerEntryFixture({
    workspaceId: "T183OTHER",
    accountId: "A183OTHER",
    targetId: "C183OTHER",
    threadId: "171000.1833",
    fileRefs: fileRefs("phase183_other"),
  });
  const otherResult = await createExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry: otherRetryLedgerEntry,
  });
  assert(
    otherResult.retryControlReadinessPlanId !== result.retryControlReadinessPlanId,
    "different trusted entry produces different readiness id",
  );
  assert(!containsForbiddenTruth(result), "accepted retry-control readiness leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyManualRetryControlReadinessPlanRejectsUntrustedEntry(): Promise<void> {
  section("61. Manual Retry Control Readiness Plan Rejects Untrusted Ledger Entry");
  const { retryLedgerEntry } = await retryLedgerEntryFixture({
    workspaceId: "T183COPIED",
    accountId: "A183COPIED",
    targetId: "C183COPIED",
    threadId: "171000.1831",
    fileRefs: fileRefs("phase183_copied"),
  });

  const copiedEntry = JSON.parse(JSON.stringify(retryLedgerEntry)) as ExternalChannelMediaTransferManualRetryLedgerEntry;
  const result = await createExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry: copiedEntry,
  });

  assertEqual(result.accepted, false, "copied retry ledger entry cannot produce retry-control readiness");
  assertEqual(result.reasonCode, "external_media_transfer_manual_retry_ledger_entry_untrusted", "copied retry-control readiness rejection is bounded");
  assertEqual(result.retryControlReadinessPlan, undefined, "copied retry ledger entry returns no readiness plan");
  assertEqual(result.retryLedgerEntryPreflight.accepted, false, "copied retry-control readiness exposes bounded failed preflight");
  assertEqual(result.retryControlReady, false, "copied retry-control readiness does not mark control ready");
  assertEqual(result.retryWorkerReady, false, "copied retry-control readiness does not mark retry worker ready");
  assertEqual(result.retryScheduleReady, false, "copied retry-control readiness does not mark retry schedule ready");
  assertEqual(result.retryWorkerCreated, false, "copied retry-control readiness creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "copied retry-control readiness creates no retry schedule");
  assertEqual(result.automaticVendorRetryAllowed, false, "copied retry-control readiness allows no automatic retry");
  assert(!containsForbiddenTruth(result), "copied retry-control readiness rejection leaks no raw truth");
}

async function verifyManualRetryControlReadinessPlanRejectsContaminatedEntry(): Promise<void> {
  section("62. Manual Retry Control Readiness Plan Rejects Contaminated Ledger Entry");
  const { retryLedgerEntry } = await retryLedgerEntryFixture({
    workspaceId: "T183DIRTY",
    accountId: "A183DIRTY",
    targetId: "C183DIRTY",
    threadId: "171000.1832",
    fileRefs: fileRefs("phase183_dirty"),
  });

  const contaminatedEntry = {
    ...retryLedgerEntry,
    retryScheduleCreated: true,
    credentialValue: "xoxb-real-credential-value",
  };
  const result = await createExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry: contaminatedEntry,
  });

  assertEqual(result.accepted, false, "contaminated retry ledger entry cannot produce retry-control readiness");
  assertEqual(result.reasonCode, "external_media_transfer_manual_retry_ledger_entry_invalid", "contaminated retry-control readiness rejection is bounded");
  assertEqual(result.retryControlReadinessPlan, undefined, "contaminated retry ledger entry returns no readiness plan");
  assertEqual(result.retryControlReady, false, "contaminated retry-control readiness does not mark control ready");
  assertEqual(result.backgroundRetryCreated, false, "contaminated retry-control readiness creates no background retry");
  assertEqual(result.retryWorkerCreated, false, "contaminated retry-control readiness creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "contaminated retry-control readiness creates no retry schedule");
  assertEqual(result.credentialPersistenceCreated, false, "contaminated retry-control readiness persists no credentials");
  assert(!containsForbiddenTruth(result), "contaminated retry-control readiness rejection leaks no raw truth");
}

async function verifyManualRetryControlReadinessPlanRejectsAppendFailedEntry(): Promise<void> {
  section("63. Manual Retry Control Readiness Plan Rejects Append-Failed Captured Entry");
  const { retryLedgerEntryPlan } = await retryLedgerEntryPlanFixture({
    workspaceId: "T183APPEND",
    accountId: "A183APPEND",
    targetId: "C183APPEND",
    threadId: "171000.1834",
    fileRefs: fileRefs("phase183_append_failed"),
  });
  let capturedAppendEntry: ExternalChannelMediaTransferManualRetryLedgerEntry | undefined;
  const rejectingStore: ExternalChannelMediaTransferManualRetryLedgerEntryPersistenceStore = {
    appendRetryLedgerEntries: async (entries) => {
      capturedAppendEntry = entries[0];
      throw new Error("append rejected");
    },
    loadRetryLedgerEntries: async () => [],
  };
  const appendFailedResult = await persistExternalChannelMediaTransferManualRetryLedgerEntry({
    retryLedgerEntryPlan,
    retryLedgerStore: rejectingStore,
  });
  assertEqual(appendFailedResult.accepted, false, "fixture retry ledger append failure is rejected");

  const result = await createExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry: capturedAppendEntry,
  });

  assertEqual(result.accepted, false, "append-failed captured retry ledger entry cannot produce retry-control readiness");
  assertEqual(result.reasonCode, "external_media_transfer_manual_retry_ledger_entry_untrusted", "append-failed retry-control readiness rejection is bounded");
  assertEqual(result.retryControlReadinessPlan, undefined, "append-failed captured entry returns no readiness plan");
  assertEqual(result.retryLedgerEntryPreflight.accepted, false, "append-failed retry-control readiness exposes bounded failed preflight");
  assertEqual(result.retryControlReady, false, "append-failed retry-control readiness does not mark control ready");
  assertEqual(result.retryWorkerReady, false, "append-failed retry-control readiness does not mark retry worker ready");
  assertEqual(result.retryScheduleReady, false, "append-failed retry-control readiness does not mark retry schedule ready");
  assertEqual(result.backgroundRetryCreated, false, "append-failed retry-control readiness creates no background retry");
  assertEqual(result.retryWorkerCreated, false, "append-failed retry-control readiness creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "append-failed retry-control readiness creates no retry schedule");
  assertEqual(result.automaticVendorRetryAllowed, false, "append-failed retry-control readiness allows no automatic retry");
  assert(!containsForbiddenTruth(result), "append-failed retry-control readiness rejection leaks no raw truth");
}

async function verifyManualRetryControlReadinessPlanPreflightAcceptsSuppliedCurrentPlan(): Promise<void> {
  section("64. Manual Retry Control Readiness Plan Preflight Accepts Supplied Current Plan");
  const { retryLedgerEntry } = await retryLedgerEntryFixture({
    workspaceId: "T184READY",
    accountId: "A184READY",
    targetId: "C184READY",
    threadId: "171000.1840",
    fileRefs: fileRefs("phase184_ready"),
  });
  const planResult = await createExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry,
  });
  assert(Boolean(planResult.retryControlReadinessPlan), "fixture retry-control readiness plan is returned");
  const suppliedPlan = JSON.parse(JSON.stringify(
    planResult.retryControlReadinessPlan,
  )) as ExternalChannelMediaTransferManualRetryControlReadinessPlan;

  const preflight = await preflightExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry,
    retryControlReadinessPlan: suppliedPlan,
  });

  assertEqual(preflight.accepted, true, "supplied retry-control readiness plan preflight is accepted");
  assertEqual(preflight.retryControlReadinessPlanResult.accepted, true, "preflight recomputes current readiness plan");
  assertEqual(preflight.retryControlReadinessPlanIdMatched, true, "preflight matches readiness plan id");
  assertEqual(preflight.manualRetryLedgerEntryIdMatched, true, "preflight matches ledger entry id");
  assertEqual(preflight.manualRetryLedgerEntryPlanIdMatched, true, "preflight matches ledger plan id");
  assertEqual(preflight.manualRetryWorkItemClosureAuditRecordIdMatched, true, "preflight matches audit record id");
  assertEqual(preflight.manualRetryWorkItemClosurePersistenceIdMatched, true, "preflight matches closure persistence id");
  assertEqual(preflight.closeoutRecordPersistenceIdMatched, true, "preflight matches closeout persistence id");
  assertEqual(preflight.workItemCorrelationMatched, true, "preflight matches work-item correlation");
  assertEqual(preflight.transferKeyMatched, true, "preflight matches transfer key");
  assertEqual(preflight.sourceRefFingerprintsMatched, true, "preflight matches source fingerprints");
  assertEqual(preflight.targetCorrelationMatched, true, "preflight matches target fingerprint");
  assertEqual(preflight.retryLedgerEntryPreflightAccepted, true, "preflight requires accepted ledger-entry preflight");
  assertEqual(preflight.retryControlReady, true, "preflight marks retry-control inputs ready");
  assertEqual(preflight.retryWorkerStillBlocked, true, "preflight keeps retry worker blocked");
  assertEqual(preflight.retryScheduleStillBlocked, true, "preflight keeps retry schedule blocked");
  assertEqual(preflight.credentialPersistenceStillBlocked, true, "preflight keeps credential persistence blocked");
  assertEqual(preflight.automaticVendorRetryStillBlocked, true, "preflight keeps automatic retry blocked");
  assertEqual(preflight.defaultLiveDeliveryStillBlocked, true, "preflight keeps default live delivery blocked");
  assertEqual(preflight.publicHostingStillBlocked, true, "preflight keeps public hosting blocked");
  assertEqual(
    preflight.manualRetryControlReadinessPlanPreflightTruth,
    "recomputed_from_trusted_retry_ledger_entry_preflight_and_supplied_retry_control_readiness_plan_no_worker_or_schedule",
    "preflight truth is explicit",
  );
  assert(!containsForbiddenTruth(preflight), "accepted retry-control readiness preflight leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyManualRetryControlReadinessPlanPreflightRejectsMismatchedPlan(): Promise<void> {
  section("65. Manual Retry Control Readiness Plan Preflight Rejects Mismatched Supplied Plan");
  const { retryLedgerEntry } = await retryLedgerEntryFixture({
    workspaceId: "T184BASE",
    accountId: "A184BASE",
    targetId: "C184BASE",
    threadId: "171000.1841",
    fileRefs: fileRefs("phase184_base"),
  });
  const { retryLedgerEntry: otherRetryLedgerEntry } = await retryLedgerEntryFixture({
    workspaceId: "T184OTHER",
    accountId: "A184OTHER",
    targetId: "C184OTHER",
    threadId: "171000.1842",
    fileRefs: fileRefs("phase184_other"),
  });
  const otherPlanResult = await createExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry: otherRetryLedgerEntry,
  });
  assert(Boolean(otherPlanResult.retryControlReadinessPlan), "fixture other retry-control readiness plan is returned");

  const preflight = await preflightExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry,
    retryControlReadinessPlan: otherPlanResult.retryControlReadinessPlan,
  });

  assertEqual(preflight.accepted, false, "mismatched retry-control readiness plan preflight is rejected");
  assertEqual(preflight.reasonCode, "external_media_transfer_manual_retry_control_readiness_plan_current_truth_mismatch", "mismatch rejection is bounded");
  assertEqual(preflight.retryControlReadinessPlan, undefined, "mismatch returns no accepted readiness plan");
  assertEqual(preflight.retryControlReadinessPlanIdMatched, false, "mismatch detects readiness plan id difference");
  assertEqual(preflight.manualRetryLedgerEntryIdMatched, false, "mismatch detects ledger entry id difference");
  assertEqual(preflight.retryControlReady, false, "mismatch does not mark retry-control ready");
  assertEqual(preflight.retryWorkerCreated, false, "mismatch creates no retry worker");
  assertEqual(preflight.retryScheduleCreated, false, "mismatch creates no retry schedule");
  assertEqual(preflight.automaticVendorRetryAllowed, false, "mismatch allows no automatic retry");
  assert(!containsForbiddenTruth(preflight), "mismatched retry-control readiness preflight rejection leaks no raw truth");
}

async function verifyManualRetryControlReadinessPlanPreflightRejectsContaminatedPlan(): Promise<void> {
  section("66. Manual Retry Control Readiness Plan Preflight Rejects Contaminated Plan");
  const { retryLedgerEntry } = await retryLedgerEntryFixture({
    workspaceId: "T184DIRTY",
    accountId: "A184DIRTY",
    targetId: "C184DIRTY",
    threadId: "171000.1843",
    fileRefs: fileRefs("phase184_dirty"),
  });
  const planResult = await createExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry,
  });
  assert(Boolean(planResult.retryControlReadinessPlan), "fixture retry-control readiness plan is returned before contamination");
  const contaminatedPlan = {
    ...planResult.retryControlReadinessPlan,
    retryWorkerReady: true,
    retryScheduleCreated: true,
    credentialValue: "xoxb-real-credential-value",
  };

  const preflight = await preflightExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry,
    retryControlReadinessPlan: contaminatedPlan,
  });

  assertEqual(preflight.accepted, false, "contaminated retry-control readiness plan preflight is rejected");
  assertEqual(preflight.reasonCode, "valid_external_media_transfer_manual_retry_control_readiness_plan_required", "contaminated rejection is bounded");
  assertEqual(preflight.retryControlReadinessPlan, undefined, "contaminated preflight returns no readiness plan");
  assertEqual(preflight.retryControlReadinessPlanResult.accepted, false, "contaminated preflight exposes bounded failed readiness result");
  assertEqual(preflight.retryControlReadinessPlanResult.reasonCode, "valid_external_media_transfer_manual_retry_control_readiness_plan_required", "contaminated nested rejection is bounded");
  assertEqual(preflight.retryControlReadinessPlanResult.retryControlReadinessPlan, undefined, "contaminated nested result returns no readiness plan");
  assertEqual(preflight.retryControlReady, false, "contaminated preflight does not mark retry-control ready");
  assertEqual(preflight.retryWorkerCreated, false, "contaminated preflight creates no retry worker");
  assertEqual(preflight.retryScheduleCreated, false, "contaminated preflight creates no retry schedule");
  assertEqual(preflight.credentialPersistenceCreated, false, "contaminated preflight persists no credentials");
  assertEqual(preflight.publicHostingEnabled, false, "contaminated preflight enables no public hosting");
  assert(!containsForbiddenTruth(preflight), "contaminated retry-control readiness preflight rejection leaks no raw truth");
}

async function verifyManualRetryControlReadinessPlanPreflightRejectsUntrustedLedgerEntry(): Promise<void> {
  section("67. Manual Retry Control Readiness Plan Preflight Rejects Untrusted Ledger Entry");
  const { retryLedgerEntry } = await retryLedgerEntryFixture({
    workspaceId: "T184COPIED",
    accountId: "A184COPIED",
    targetId: "C184COPIED",
    threadId: "171000.1844",
    fileRefs: fileRefs("phase184_copied"),
  });
  const planResult = await createExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry,
  });
  assert(Boolean(planResult.retryControlReadinessPlan), "fixture retry-control readiness plan is returned before copied-ledger test");
  const copiedEntry = JSON.parse(JSON.stringify(retryLedgerEntry)) as ExternalChannelMediaTransferManualRetryLedgerEntry;
  const copiedPlan = JSON.parse(JSON.stringify(
    planResult.retryControlReadinessPlan,
  )) as ExternalChannelMediaTransferManualRetryControlReadinessPlan;

  const preflight = await preflightExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry: copiedEntry,
    retryControlReadinessPlan: copiedPlan,
  });

  assertEqual(preflight.accepted, false, "copied retry ledger entry cannot preflight retry-control readiness");
  assertEqual(preflight.reasonCode, "external_media_transfer_manual_retry_ledger_entry_untrusted", "copied-ledger preflight rejection is bounded");
  assertEqual(preflight.retryControlReadinessPlan, undefined, "copied-ledger preflight returns no readiness plan");
  assertEqual(preflight.retryControlReadinessPlanResult.accepted, false, "copied-ledger preflight exposes bounded failed readiness result");
  assertEqual(preflight.retryControlReady, false, "copied-ledger preflight does not mark retry-control ready");
  assertEqual(preflight.retryWorkerCreated, false, "copied-ledger preflight creates no retry worker");
  assertEqual(preflight.retryScheduleCreated, false, "copied-ledger preflight creates no retry schedule");
  assertEqual(preflight.automaticVendorRetryAllowed, false, "copied-ledger preflight allows no automatic retry");
  assert(!containsForbiddenTruth(preflight), "copied-ledger retry-control readiness preflight rejection leaks no raw truth");
}

async function verifyManualRetryControlReadinessPlanPreflightRejectsAppendFailedLedgerEntry(): Promise<void> {
  section("68. Manual Retry Control Readiness Plan Preflight Rejects Append-Failed Ledger Entry");
  const { retryLedgerEntryPlan } = await retryLedgerEntryPlanFixture({
    workspaceId: "T184APPEND",
    accountId: "A184APPEND",
    targetId: "C184APPEND",
    threadId: "171000.1845",
    fileRefs: fileRefs("phase184_append_failed"),
  });
  let capturedAppendEntry: ExternalChannelMediaTransferManualRetryLedgerEntry | undefined;
  const rejectingStore: ExternalChannelMediaTransferManualRetryLedgerEntryPersistenceStore = {
    appendRetryLedgerEntries: async (entries) => {
      capturedAppendEntry = entries[0];
      throw new Error("append rejected");
    },
    loadRetryLedgerEntries: async () => [],
  };
  const appendFailedResult = await persistExternalChannelMediaTransferManualRetryLedgerEntry({
    retryLedgerEntryPlan,
    retryLedgerStore: rejectingStore,
  });
  assertEqual(appendFailedResult.accepted, false, "fixture retry ledger append failure is rejected before preflight");
  const { retryLedgerEntry: trustedRetryLedgerEntry } = await retryLedgerEntryFixture({
    workspaceId: "T184VALID",
    accountId: "A184VALID",
    targetId: "C184VALID",
    threadId: "171000.1846",
    fileRefs: fileRefs("phase184_valid_plan"),
  });
  const trustedPlanResult = await createExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry: trustedRetryLedgerEntry,
  });
  assert(Boolean(trustedPlanResult.retryControlReadinessPlan), "fixture trusted readiness plan is returned for append-failed preflight");

  const preflight = await preflightExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry: capturedAppendEntry,
    retryControlReadinessPlan: trustedPlanResult.retryControlReadinessPlan,
  });

  assertEqual(preflight.accepted, false, "append-failed retry ledger entry cannot preflight retry-control readiness");
  assertEqual(preflight.reasonCode, "external_media_transfer_manual_retry_ledger_entry_untrusted", "append-failed preflight rejection is bounded");
  assertEqual(preflight.retryControlReadinessPlan, undefined, "append-failed preflight returns no readiness plan");
  assertEqual(preflight.retryControlReady, false, "append-failed preflight does not mark retry-control ready");
  assertEqual(preflight.retryWorkerCreated, false, "append-failed preflight creates no retry worker");
  assertEqual(preflight.retryScheduleCreated, false, "append-failed preflight creates no retry schedule");
  assertEqual(preflight.automaticVendorRetryAllowed, false, "append-failed preflight allows no automatic retry");
  assert(!containsForbiddenTruth(preflight), "append-failed retry-control readiness preflight rejection leaks no raw truth");
}

async function verifyManualRetryControlOperatorHandoffAcceptsReadinessPreflight(): Promise<void> {
  section("69. Manual Retry Control Operator Handoff Accepts Readiness Preflight");
  const { retryLedgerEntry } = await retryLedgerEntryFixture({
    workspaceId: "T185READY",
    accountId: "A185READY",
    targetId: "C185READY",
    threadId: "171000.1850",
    fileRefs: fileRefs("phase185_ready"),
  });
  const readinessResult = await createExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry,
  });
  assert(Boolean(readinessResult.retryControlReadinessPlan), "fixture retry-control readiness plan is returned");
  const suppliedReadiness = JSON.parse(JSON.stringify(
    readinessResult.retryControlReadinessPlan,
  )) as ExternalChannelMediaTransferManualRetryControlReadinessPlan;

  const result = await createExternalChannelMediaTransferManualRetryControlOperatorHandoff({
    retryLedgerEntry,
    retryControlReadinessPlan: suppliedReadiness,
  });

  assertEqual(result.accepted, true, "accepted readiness preflight can produce retry-control operator handoff");
  assertEqual(result.retryControlReadinessPlanPreflight.accepted, true, "operator handoff is bound to accepted readiness preflight");
  assert(Boolean(result.retryControlOperatorHandoff), "retry-control operator handoff is returned");
  assertEqual(
    result.retryControlOperatorHandoff?.manualRetryControlReadinessPlanId,
    suppliedReadiness.manualRetryControlReadinessPlanId,
    "operator handoff binds readiness plan id",
  );
  assertEqual(result.retryControlOperatorHandoff?.manualRetryLedgerEntryId, retryLedgerEntry.manualRetryLedgerEntryId, "operator handoff binds ledger entry id");
  assertEqual(result.retryControlOperatorHandoff?.manualRetryLedgerEntryPlanId, retryLedgerEntry.manualRetryLedgerEntryPlanId, "operator handoff binds ledger plan id");
  assertEqual(result.retryControlOperatorHandoff?.manualRetryWorkItemClosureAuditRecordId, retryLedgerEntry.manualRetryWorkItemClosureAuditRecordId, "operator handoff binds audit record id");
  assertEqual(result.retryControlOperatorHandoff?.manualRetryWorkItemClosurePersistenceId, retryLedgerEntry.manualRetryWorkItemClosurePersistenceId, "operator handoff binds closure persistence id");
  assertEqual(result.retryControlOperatorHandoff?.closeoutRecordPersistenceId, retryLedgerEntry.closeoutRecordPersistenceId, "operator handoff binds closeout persistence id");
  assertEqual(result.retryControlOperatorHandoff?.workItemCorrelationId, retryLedgerEntry.workItemCorrelationId, "operator handoff binds work-item correlation");
  assertEqual(result.retryControlOperatorHandoff?.transferKey, retryLedgerEntry.transferKey, "operator handoff binds transfer key");
  assertEqual(result.retryControlOperatorHandoff?.sourceRefFingerprints.length, retryLedgerEntry.sourceRefFingerprints.length, "operator handoff preserves source fingerprint count");
  assertEqual(result.retryControlOperatorHandoff?.targetCorrelationFingerprint, retryLedgerEntry.targetCorrelationFingerprint, "operator handoff binds target fingerprint");
  assertEqual(result.retryControlOperatorHandoff?.retryControlReadinessPreflightAccepted, true, "operator handoff requires accepted readiness preflight");
  assertEqual(result.retryControlOperatorHandoff?.retryControlReady, true, "operator handoff preserves retry-control readiness");
  assertEqual(result.retryControlOperatorHandoff?.hostOwnedRetryControlRequired, true, "operator handoff requires host-owned retry control");
  assertEqual(result.retryControlOperatorHandoff?.operatorMustSelectFutureRetryWorker, true, "operator handoff requires future worker selection");
  assertEqual(result.retryControlOperatorHandoff?.colonyRetryWorkerSelected, false, "operator handoff selects no Colony retry worker");
  assertEqual(result.retryControlOperatorHandoff?.colonyRetryWorkerExecutable, false, "operator handoff makes no retry worker executable");
  assertEqual(result.retryControlOperatorHandoff?.retryWorkerReady, false, "operator handoff does not mark retry worker ready");
  assertEqual(result.retryControlOperatorHandoff?.retryScheduleReady, false, "operator handoff does not mark retry schedule ready");
  assertEqual(result.retryControlOperatorHandoff?.backgroundRetryCreated, false, "operator handoff creates no background retry");
  assertEqual(result.retryControlOperatorHandoff?.retryWorkerCreated, false, "operator handoff creates no retry worker");
  assertEqual(result.retryControlOperatorHandoff?.retryScheduleCreated, false, "operator handoff creates no retry schedule");
  assertEqual(result.retryControlOperatorHandoff?.automaticVendorRetryAllowed, false, "operator handoff allows no automatic retry");
  assertEqual(result.retryControlOperatorHandoff?.credentialPersistenceCreated, false, "operator handoff creates no credential persistence");
  assertEqual(result.retryControlOperatorHandoff?.defaultLiveDeliveryEnabled, false, "operator handoff enables no default live delivery");
  assertEqual(result.retryControlOperatorHandoff?.publicHostingEnabled, false, "operator handoff enables no public hosting");
  assertEqual(
    result.retryControlOperatorHandoff?.manualRetryControlOperatorHandoffTruth,
    "retry_control_readiness_preflight_bound_operator_handoff_no_worker_or_schedule",
    "operator handoff truth is explicit",
  );
  assert(!containsForbiddenTruth(result), "accepted retry-control operator handoff leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyManualRetryControlOperatorHandoffIsDeterministic(): Promise<void> {
  section("70. Manual Retry Control Operator Handoff Is Deterministic");
  const { retryLedgerEntry } = await retryLedgerEntryFixture({
    workspaceId: "T185STABLE",
    accountId: "A185STABLE",
    targetId: "C185STABLE",
    threadId: "171000.1851",
    fileRefs: fileRefs("phase185_stable"),
  });
  const readinessResult = await createExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry,
  });
  assert(Boolean(readinessResult.retryControlReadinessPlan), "fixture retry-control readiness plan is returned for deterministic handoff");
  const suppliedReadiness = JSON.parse(JSON.stringify(
    readinessResult.retryControlReadinessPlan,
  )) as ExternalChannelMediaTransferManualRetryControlReadinessPlan;

  const first = await createExternalChannelMediaTransferManualRetryControlOperatorHandoff({
    retryLedgerEntry,
    retryControlReadinessPlan: suppliedReadiness,
  });
  const second = await createExternalChannelMediaTransferManualRetryControlOperatorHandoff({
    retryLedgerEntry,
    retryControlReadinessPlan: JSON.parse(JSON.stringify(suppliedReadiness)) as ExternalChannelMediaTransferManualRetryControlReadinessPlan,
  });
  const { retryLedgerEntry: otherRetryLedgerEntry } = await retryLedgerEntryFixture({
    workspaceId: "T185STABLE2",
    accountId: "A185STABLE2",
    targetId: "C185STABLE2",
    threadId: "171000.1852",
    fileRefs: fileRefs("phase185_stable_other"),
  });
  const otherReadinessResult = await createExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry: otherRetryLedgerEntry,
  });
  assert(Boolean(otherReadinessResult.retryControlReadinessPlan), "fixture other retry-control readiness plan is returned for deterministic handoff");
  const other = await createExternalChannelMediaTransferManualRetryControlOperatorHandoff({
    retryLedgerEntry: otherRetryLedgerEntry,
    retryControlReadinessPlan: otherReadinessResult.retryControlReadinessPlan,
  });

  assertEqual(first.accepted, true, "first operator handoff is accepted");
  assertEqual(second.accepted, true, "second operator handoff is accepted");
  assertEqual(first.retryControlOperatorHandoffId, second.retryControlOperatorHandoffId, "same readiness truth produces stable handoff id");
  assert(first.retryControlOperatorHandoffId !== other.retryControlOperatorHandoffId, "different readiness truth changes handoff id");
  assert(!containsForbiddenTruth(first), "deterministic retry-control handoff leaks no raw truth");
}

async function verifyManualRetryControlOperatorHandoffRejectsMismatchedReadinessPlan(): Promise<void> {
  section("71. Manual Retry Control Operator Handoff Rejects Mismatched Readiness Plan");
  const { retryLedgerEntry } = await retryLedgerEntryFixture({
    workspaceId: "T185BASE",
    accountId: "A185BASE",
    targetId: "C185BASE",
    threadId: "171000.1853",
    fileRefs: fileRefs("phase185_base"),
  });
  const { retryLedgerEntry: otherRetryLedgerEntry } = await retryLedgerEntryFixture({
    workspaceId: "T185OTHER",
    accountId: "A185OTHER",
    targetId: "C185OTHER",
    threadId: "171000.1854",
    fileRefs: fileRefs("phase185_other"),
  });
  const otherReadinessResult = await createExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry: otherRetryLedgerEntry,
  });
  assert(Boolean(otherReadinessResult.retryControlReadinessPlan), "fixture other retry-control readiness plan is returned");

  const result = await createExternalChannelMediaTransferManualRetryControlOperatorHandoff({
    retryLedgerEntry,
    retryControlReadinessPlan: otherReadinessResult.retryControlReadinessPlan,
  });

  assertEqual(result.accepted, false, "mismatched readiness plan cannot produce retry-control operator handoff");
  assertEqual(result.reasonCode, "external_media_transfer_manual_retry_control_readiness_plan_current_truth_mismatch", "mismatched operator handoff rejection is bounded");
  assertEqual(result.retryControlOperatorHandoff, undefined, "mismatched operator handoff rejection returns no handoff");
  assertEqual(result.retryControlReadinessPlanPreflight.accepted, false, "mismatched operator handoff exposes bounded failed readiness preflight");
  assertEqual(result.hostOwnedRetryControlRequired, false, "mismatched operator handoff does not require host retry control");
  assertEqual(result.retryWorkerCreated, false, "mismatched operator handoff creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "mismatched operator handoff creates no retry schedule");
  assertEqual(result.automaticVendorRetryAllowed, false, "mismatched operator handoff allows no automatic retry");
  assert(!containsForbiddenTruth(result), "mismatched retry-control operator handoff rejection leaks no raw truth");
}

async function verifyManualRetryControlOperatorHandoffRejectsContaminatedReadinessPlan(): Promise<void> {
  section("72. Manual Retry Control Operator Handoff Rejects Contaminated Readiness Plan");
  const { retryLedgerEntry } = await retryLedgerEntryFixture({
    workspaceId: "T185DIRTY",
    accountId: "A185DIRTY",
    targetId: "C185DIRTY",
    threadId: "171000.1855",
    fileRefs: fileRefs("phase185_dirty"),
  });
  const readinessResult = await createExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry,
  });
  assert(Boolean(readinessResult.retryControlReadinessPlan), "fixture retry-control readiness plan is returned before contamination");
  const contaminatedReadiness = {
    ...readinessResult.retryControlReadinessPlan,
    retryWorkerReady: true,
    retryWorkerCreated: true,
    retryScheduleCreated: true,
    credentialValue: "xoxb-real-credential-value",
  };

  const result = await createExternalChannelMediaTransferManualRetryControlOperatorHandoff({
    retryLedgerEntry,
    retryControlReadinessPlan: contaminatedReadiness,
  });

  assertEqual(result.accepted, false, "contaminated readiness plan cannot produce retry-control operator handoff");
  assertEqual(result.reasonCode, "valid_external_media_transfer_manual_retry_control_readiness_plan_required", "contaminated operator handoff rejection is bounded");
  assertEqual(result.retryControlOperatorHandoff, undefined, "contaminated operator handoff rejection returns no handoff");
  assertEqual(result.retryControlReadinessPlanPreflight.accepted, false, "contaminated operator handoff exposes bounded failed readiness preflight");
  assertEqual(result.retryControlReadinessPlanPreflight.retryControlReadinessPlan, undefined, "contaminated operator handoff exposes no nested readiness plan");
  assertEqual(result.hostOwnedRetryControlRequired, false, "contaminated operator handoff does not require host retry control");
  assertEqual(result.retryWorkerCreated, false, "contaminated operator handoff creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "contaminated operator handoff creates no retry schedule");
  assertEqual(result.credentialPersistenceCreated, false, "contaminated operator handoff persists no credentials");
  assertEqual(result.publicHostingEnabled, false, "contaminated operator handoff enables no public hosting");
  assert(!containsForbiddenTruth(result), "contaminated retry-control operator handoff rejection leaks no raw truth");
}

async function verifyManualRetryControlOperatorHandoffRejectsUntrustedLedgerEntry(): Promise<void> {
  section("73. Manual Retry Control Operator Handoff Rejects Untrusted Ledger Entry");
  const { retryLedgerEntry } = await retryLedgerEntryFixture({
    workspaceId: "T185COPIED",
    accountId: "A185COPIED",
    targetId: "C185COPIED",
    threadId: "171000.1856",
    fileRefs: fileRefs("phase185_copied"),
  });
  const readinessResult = await createExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry,
  });
  assert(Boolean(readinessResult.retryControlReadinessPlan), "fixture retry-control readiness plan is returned before copied-ledger test");
  const copiedEntry = JSON.parse(JSON.stringify(retryLedgerEntry)) as ExternalChannelMediaTransferManualRetryLedgerEntry;
  const copiedReadiness = JSON.parse(JSON.stringify(
    readinessResult.retryControlReadinessPlan,
  )) as ExternalChannelMediaTransferManualRetryControlReadinessPlan;

  const result = await createExternalChannelMediaTransferManualRetryControlOperatorHandoff({
    retryLedgerEntry: copiedEntry,
    retryControlReadinessPlan: copiedReadiness,
  });

  assertEqual(result.accepted, false, "copied retry ledger entry cannot produce retry-control operator handoff");
  assertEqual(result.reasonCode, "external_media_transfer_manual_retry_ledger_entry_untrusted", "copied-ledger operator handoff rejection is bounded");
  assertEqual(result.retryControlOperatorHandoff, undefined, "copied-ledger operator handoff rejection returns no handoff");
  assertEqual(result.retryControlReadinessPlanPreflight.accepted, false, "copied-ledger operator handoff exposes bounded failed readiness preflight");
  assertEqual(result.hostOwnedRetryControlRequired, false, "copied-ledger operator handoff does not require host retry control");
  assertEqual(result.retryWorkerCreated, false, "copied-ledger operator handoff creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "copied-ledger operator handoff creates no retry schedule");
  assertEqual(result.automaticVendorRetryAllowed, false, "copied-ledger operator handoff allows no automatic retry");
  assert(!containsForbiddenTruth(result), "copied-ledger retry-control operator handoff rejection leaks no raw truth");
}

async function verifyManualRetryControlOperatorHandoffRejectsAppendFailedLedgerEntry(): Promise<void> {
  section("74. Manual Retry Control Operator Handoff Rejects Append-Failed Ledger Entry");
  const { retryLedgerEntryPlan } = await retryLedgerEntryPlanFixture({
    workspaceId: "T185APPEND",
    accountId: "A185APPEND",
    targetId: "C185APPEND",
    threadId: "171000.1857",
    fileRefs: fileRefs("phase185_append_failed"),
  });
  let capturedAppendEntry: ExternalChannelMediaTransferManualRetryLedgerEntry | undefined;
  const rejectingStore: ExternalChannelMediaTransferManualRetryLedgerEntryPersistenceStore = {
    appendRetryLedgerEntries: async (entries) => {
      capturedAppendEntry = entries[0];
      throw new Error("append rejected");
    },
    loadRetryLedgerEntries: async () => [],
  };
  const appendFailedResult = await persistExternalChannelMediaTransferManualRetryLedgerEntry({
    retryLedgerEntryPlan,
    retryLedgerStore: rejectingStore,
  });
  assertEqual(appendFailedResult.accepted, false, "fixture retry ledger append failure is rejected before operator handoff");
  const { retryLedgerEntry: trustedRetryLedgerEntry } = await retryLedgerEntryFixture({
    workspaceId: "T185VALID",
    accountId: "A185VALID",
    targetId: "C185VALID",
    threadId: "171000.1858",
    fileRefs: fileRefs("phase185_valid_plan"),
  });
  const trustedReadinessResult = await createExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry: trustedRetryLedgerEntry,
  });
  assert(Boolean(trustedReadinessResult.retryControlReadinessPlan), "fixture trusted readiness plan is returned for append-failed operator handoff");

  const result = await createExternalChannelMediaTransferManualRetryControlOperatorHandoff({
    retryLedgerEntry: capturedAppendEntry,
    retryControlReadinessPlan: trustedReadinessResult.retryControlReadinessPlan,
  });

  assertEqual(result.accepted, false, "append-failed retry ledger entry cannot produce retry-control operator handoff");
  assertEqual(result.reasonCode, "external_media_transfer_manual_retry_ledger_entry_untrusted", "append-failed operator handoff rejection is bounded");
  assertEqual(result.retryControlOperatorHandoff, undefined, "append-failed operator handoff rejection returns no handoff");
  assertEqual(result.hostOwnedRetryControlRequired, false, "append-failed operator handoff does not require host retry control");
  assertEqual(result.retryWorkerCreated, false, "append-failed operator handoff creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "append-failed operator handoff creates no retry schedule");
  assertEqual(result.automaticVendorRetryAllowed, false, "append-failed operator handoff allows no automatic retry");
  assert(!containsForbiddenTruth(result), "append-failed retry-control operator handoff rejection leaks no raw truth");
}

async function operatorHandoffFixture(options: Parameters<typeof retryLedgerEntryFixture>[0]): Promise<{
  retryLedgerEntry: ExternalChannelMediaTransferManualRetryLedgerEntry;
  retryControlReadinessPlan: ExternalChannelMediaTransferManualRetryControlReadinessPlan;
  retryControlOperatorHandoff: ExternalChannelMediaTransferManualRetryControlOperatorHandoff;
}> {
  const { retryLedgerEntry } = await retryLedgerEntryFixture(options);
  const readinessResult = await createExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry,
  });
  assert(Boolean(readinessResult.retryControlReadinessPlan), "fixture retry-control readiness plan is returned for operator handoff preflight");
  const handoffResult = await createExternalChannelMediaTransferManualRetryControlOperatorHandoff({
    retryLedgerEntry,
    retryControlReadinessPlan: readinessResult.retryControlReadinessPlan,
  });
  assert(Boolean(handoffResult.retryControlOperatorHandoff), "fixture retry-control operator handoff is returned for preflight");
  return {
    retryLedgerEntry,
    retryControlReadinessPlan: readinessResult.retryControlReadinessPlan as ExternalChannelMediaTransferManualRetryControlReadinessPlan,
    retryControlOperatorHandoff: handoffResult.retryControlOperatorHandoff as ExternalChannelMediaTransferManualRetryControlOperatorHandoff,
  };
}

async function verifyManualRetryControlOperatorHandoffPreflightAcceptsCurrentHandoff(): Promise<void> {
  section("75. Manual Retry Control Operator Handoff Preflight Accepts Current Handoff");
  const {
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
  } = await operatorHandoffFixture({
    workspaceId: "T186READY",
    accountId: "A186READY",
    targetId: "C186READY",
    threadId: "171000.1860",
    fileRefs: fileRefs("phase186_ready"),
  });
  const suppliedReadiness = JSON.parse(JSON.stringify(
    retryControlReadinessPlan,
  )) as ExternalChannelMediaTransferManualRetryControlReadinessPlan;
  const suppliedHandoff = JSON.parse(JSON.stringify(
    retryControlOperatorHandoff,
  )) as ExternalChannelMediaTransferManualRetryControlOperatorHandoff;

  const preflight = await preflightExternalChannelMediaTransferManualRetryControlOperatorHandoff({
    retryLedgerEntry,
    retryControlReadinessPlan: suppliedReadiness,
    retryControlOperatorHandoff: suppliedHandoff,
  }) as ExternalChannelMediaTransferManualRetryControlOperatorHandoffPreflightResult;

  assertEqual(preflight.accepted, true, "current operator handoff preflight is accepted");
  assertEqual(preflight.retryControlOperatorHandoffResult.accepted, true, "preflight recomputes accepted operator handoff truth");
  assert(Boolean(preflight.retryControlOperatorHandoff), "preflight returns current operator handoff truth");
  assertEqual(preflight.retryControlOperatorHandoffIdMatched, true, "operator handoff id matches recomputed truth");
  assertEqual(preflight.manualRetryControlReadinessPlanIdMatched, true, "operator handoff preflight binds readiness plan id");
  assertEqual(preflight.manualRetryLedgerEntryIdMatched, true, "operator handoff preflight binds ledger entry id");
  assertEqual(preflight.transferKeyMatched, true, "operator handoff preflight binds transfer key");
  assertEqual(preflight.sourceRefFingerprintsMatched, true, "operator handoff preflight binds source fingerprints");
  assertEqual(preflight.targetCorrelationMatched, true, "operator handoff preflight binds target fingerprint");
  assertEqual(preflight.retryControlReady, true, "operator handoff preflight preserves retry-control readiness");
  assertEqual(preflight.retryControlReadinessPreflightAccepted, true, "operator handoff preflight requires accepted readiness preflight");
  assertEqual(preflight.retryControlOperatorHandoffAccepted, true, "operator handoff preflight marks handoff accepted");
  assertEqual(preflight.hostOwnedRetryControlRequired, true, "operator handoff preflight preserves host-owned retry control");
  assertEqual(preflight.operatorMustSelectFutureRetryWorker, true, "operator handoff preflight keeps future worker selection manual");
  assertEqual(preflight.colonyRetryWorkerSelected, false, "operator handoff preflight selects no Colony retry worker");
  assertEqual(preflight.colonyRetryWorkerExecutable, false, "operator handoff preflight makes no retry worker executable");
  assertEqual(preflight.retryWorkerReady, false, "operator handoff preflight keeps retry worker not ready");
  assertEqual(preflight.retryScheduleReady, false, "operator handoff preflight keeps retry schedule not ready");
  assertEqual(preflight.backgroundRetryCreated, false, "operator handoff preflight creates no background retry");
  assertEqual(preflight.retryWorkerCreated, false, "operator handoff preflight creates no retry worker");
  assertEqual(preflight.retryScheduleCreated, false, "operator handoff preflight creates no retry schedule");
  assertEqual(preflight.automaticVendorRetryAllowed, false, "operator handoff preflight allows no automatic retry");
  assertEqual(preflight.credentialPersistenceCreated, false, "operator handoff preflight persists no credentials");
  assertEqual(preflight.defaultLiveDeliveryEnabled, false, "operator handoff preflight enables no default live delivery");
  assertEqual(preflight.publicHostingEnabled, false, "operator handoff preflight enables no public hosting");
  assertEqual(
    preflight.manualRetryControlOperatorHandoffPreflightTruth,
    "recomputed_from_readiness_preflight_bound_operator_handoff_no_worker_or_schedule",
    "operator handoff preflight truth is explicit",
  );
  assert(!containsForbiddenTruth(preflight), "accepted retry-control operator handoff preflight leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyManualRetryControlOperatorHandoffPreflightRejectsMismatchedHandoff(): Promise<void> {
  section("76. Manual Retry Control Operator Handoff Preflight Rejects Mismatched Handoff");
  const { retryLedgerEntry, retryControlReadinessPlan } = await operatorHandoffFixture({
    workspaceId: "T186BASE",
    accountId: "A186BASE",
    targetId: "C186BASE",
    threadId: "171000.1861",
    fileRefs: fileRefs("phase186_base"),
  });
  const { retryControlOperatorHandoff: otherHandoff } = await operatorHandoffFixture({
    workspaceId: "T186OTHER",
    accountId: "A186OTHER",
    targetId: "C186OTHER",
    threadId: "171000.1862",
    fileRefs: fileRefs("phase186_other"),
  });

  const preflight = await preflightExternalChannelMediaTransferManualRetryControlOperatorHandoff({
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff: otherHandoff,
  });

  assertEqual(preflight.accepted, false, "mismatched operator handoff preflight is rejected");
  assertEqual(preflight.reasonCode, "external_media_transfer_manual_retry_control_operator_handoff_current_truth_mismatch", "mismatched operator handoff preflight rejection is bounded");
  assertEqual(preflight.retryControlOperatorHandoff, undefined, "mismatched operator handoff preflight returns no handoff");
  assertEqual(preflight.retryControlOperatorHandoffIdMatched, false, "mismatched operator handoff id does not match");
  assertEqual(preflight.retryControlOperatorHandoffAccepted, false, "mismatched operator handoff is not accepted");
  assertEqual(preflight.hostOwnedRetryControlRequired, false, "mismatched operator handoff does not require host retry control");
  assertEqual(preflight.retryWorkerCreated, false, "mismatched operator handoff preflight creates no retry worker");
  assertEqual(preflight.retryScheduleCreated, false, "mismatched operator handoff preflight creates no retry schedule");
  assertEqual(preflight.automaticVendorRetryAllowed, false, "mismatched operator handoff preflight allows no automatic retry");
  assert(!containsForbiddenTruth(preflight), "mismatched retry-control operator handoff preflight rejection leaks no raw truth");
}

async function verifyManualRetryControlOperatorHandoffPreflightRejectsContaminatedHandoff(): Promise<void> {
  section("77. Manual Retry Control Operator Handoff Preflight Rejects Contaminated Handoff");
  const {
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
  } = await operatorHandoffFixture({
    workspaceId: "T186DIRTY",
    accountId: "A186DIRTY",
    targetId: "C186DIRTY",
    threadId: "171000.1863",
    fileRefs: fileRefs("phase186_dirty"),
  });
  const contaminatedHandoff = {
    ...retryControlOperatorHandoff,
    retryWorkerReady: true,
    retryWorkerCreated: true,
    retryScheduleCreated: true,
    automaticVendorRetryAllowed: true,
    credentialValue: "xoxb-real-credential-value",
  };

  const preflight = await preflightExternalChannelMediaTransferManualRetryControlOperatorHandoff({
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff: contaminatedHandoff,
  });

  assertEqual(preflight.accepted, false, "contaminated operator handoff preflight is rejected");
  assertEqual(preflight.reasonCode, "valid_external_media_transfer_manual_retry_control_operator_handoff_required", "contaminated operator handoff preflight rejection is bounded");
  assertEqual(preflight.retryControlOperatorHandoff, undefined, "contaminated operator handoff preflight returns no handoff");
  assertEqual(preflight.retryControlOperatorHandoffResult.retryControlOperatorHandoff, undefined, "contaminated operator handoff preflight exposes no nested handoff");
  assertEqual(preflight.hostOwnedRetryControlRequired, false, "contaminated operator handoff preflight does not require host retry control");
  assertEqual(preflight.retryWorkerCreated, false, "contaminated operator handoff preflight creates no retry worker");
  assertEqual(preflight.retryScheduleCreated, false, "contaminated operator handoff preflight creates no retry schedule");
  assertEqual(preflight.automaticVendorRetryAllowed, false, "contaminated operator handoff preflight allows no automatic retry");
  assertEqual(preflight.credentialPersistenceCreated, false, "contaminated operator handoff preflight persists no credentials");
  assert(!containsForbiddenTruth(preflight), "contaminated retry-control operator handoff preflight rejection leaks no raw truth");
}

async function verifyManualRetryControlOperatorHandoffPreflightRequiresSourceTruncationTruth(): Promise<void> {
  section("78. Manual Retry Control Operator Handoff Preflight Requires Source-Truncation Truth");
  const {
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
  } = await operatorHandoffFixture({
    workspaceId: "T186TRUNC",
    accountId: "A186TRUNC",
    targetId: "C186TRUNC",
    threadId: "171000.1864",
    fileRefs: fileRefs("phase186_truncation"),
  });

  const missingSourceTruncation = {
    ...retryControlOperatorHandoff,
  } as Record<string, unknown>;
  delete missingSourceTruncation.sourceRefsTruncated;
  const missingPreflight = await preflightExternalChannelMediaTransferManualRetryControlOperatorHandoff({
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff: missingSourceTruncation,
  });

  assertEqual(missingPreflight.accepted, false, "missing source truncation truth is rejected");
  assertEqual(missingPreflight.reasonCode, "valid_external_media_transfer_manual_retry_control_operator_handoff_required", "missing source truncation rejection is bounded");
  assertEqual(missingPreflight.retryControlOperatorHandoff, undefined, "missing source truncation rejection returns no handoff");
  assertEqual(missingPreflight.retryControlOperatorHandoffResult.retryControlOperatorHandoff, undefined, "missing source truncation rejection exposes no nested handoff");
  assertEqual(missingPreflight.retryWorkerCreated, false, "missing source truncation rejection creates no retry worker");
  assertEqual(missingPreflight.retryScheduleCreated, false, "missing source truncation rejection creates no retry schedule");
  assertEqual(missingPreflight.automaticVendorRetryAllowed, false, "missing source truncation rejection allows no automatic retry");
  assert(!containsForbiddenTruth(missingPreflight), "missing source truncation rejection leaks no raw truth");

  const nonBooleanPreflight = await preflightExternalChannelMediaTransferManualRetryControlOperatorHandoff({
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff: {
      ...retryControlOperatorHandoff,
      sourceRefsTruncated: "false",
    },
  });

  assertEqual(nonBooleanPreflight.accepted, false, "non-boolean source truncation truth is rejected");
  assertEqual(nonBooleanPreflight.reasonCode, "valid_external_media_transfer_manual_retry_control_operator_handoff_required", "non-boolean source truncation rejection is bounded");
  assertEqual(nonBooleanPreflight.retryControlOperatorHandoff, undefined, "non-boolean source truncation rejection returns no handoff");
  assertEqual(nonBooleanPreflight.retryControlOperatorHandoffResult.retryControlOperatorHandoff, undefined, "non-boolean source truncation rejection exposes no nested handoff");
  assertEqual(nonBooleanPreflight.retryWorkerCreated, false, "non-boolean source truncation rejection creates no retry worker");
  assertEqual(nonBooleanPreflight.retryScheduleCreated, false, "non-boolean source truncation rejection creates no retry schedule");
  assertEqual(nonBooleanPreflight.automaticVendorRetryAllowed, false, "non-boolean source truncation rejection allows no automatic retry");
  assert(!containsForbiddenTruth(nonBooleanPreflight), "non-boolean source truncation rejection leaks no raw truth");
}

async function verifyManualRetryControlOperatorHandoffPreflightRejectsUntrustedLedgerEntry(): Promise<void> {
  section("79. Manual Retry Control Operator Handoff Preflight Rejects Untrusted Ledger Entry");
  const {
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
  } = await operatorHandoffFixture({
    workspaceId: "T186COPIED",
    accountId: "A186COPIED",
    targetId: "C186COPIED",
    threadId: "171000.1865",
    fileRefs: fileRefs("phase186_copied"),
  });

  const preflight = await preflightExternalChannelMediaTransferManualRetryControlOperatorHandoff({
    retryLedgerEntry: JSON.parse(JSON.stringify(retryLedgerEntry)) as ExternalChannelMediaTransferManualRetryLedgerEntry,
    retryControlReadinessPlan: JSON.parse(JSON.stringify(retryControlReadinessPlan)) as ExternalChannelMediaTransferManualRetryControlReadinessPlan,
    retryControlOperatorHandoff: JSON.parse(JSON.stringify(retryControlOperatorHandoff)) as ExternalChannelMediaTransferManualRetryControlOperatorHandoff,
  });

  assertEqual(preflight.accepted, false, "copied retry ledger entry cannot preflight retry-control operator handoff");
  assertEqual(preflight.reasonCode, "external_media_transfer_manual_retry_ledger_entry_untrusted", "copied-ledger operator handoff preflight rejection is bounded");
  assertEqual(preflight.retryControlOperatorHandoff, undefined, "copied-ledger operator handoff preflight returns no handoff");
  assertEqual(preflight.retryControlOperatorHandoffAccepted, false, "copied-ledger operator handoff is not accepted");
  assertEqual(preflight.hostOwnedRetryControlRequired, false, "copied-ledger operator handoff preflight does not require host retry control");
  assertEqual(preflight.retryWorkerCreated, false, "copied-ledger operator handoff preflight creates no retry worker");
  assertEqual(preflight.retryScheduleCreated, false, "copied-ledger operator handoff preflight creates no retry schedule");
  assertEqual(preflight.automaticVendorRetryAllowed, false, "copied-ledger operator handoff preflight allows no automatic retry");
  assert(!containsForbiddenTruth(preflight), "copied-ledger retry-control operator handoff preflight rejection leaks no raw truth");
}

async function verifyManualRetryControlOperatorHandoffPreflightRejectsAppendFailedLedgerEntry(): Promise<void> {
  section("80. Manual Retry Control Operator Handoff Preflight Rejects Append-Failed Ledger Entry");
  const { retryLedgerEntryPlan } = await retryLedgerEntryPlanFixture({
    workspaceId: "T186APPEND",
    accountId: "A186APPEND",
    targetId: "C186APPEND",
    threadId: "171000.1866",
    fileRefs: fileRefs("phase186_append_failed"),
  });
  let capturedAppendEntry: ExternalChannelMediaTransferManualRetryLedgerEntry | undefined;
  const rejectingStore: ExternalChannelMediaTransferManualRetryLedgerEntryPersistenceStore = {
    appendRetryLedgerEntries: async (entries) => {
      capturedAppendEntry = entries[0];
      throw new Error("append rejected");
    },
    loadRetryLedgerEntries: async () => [],
  };
  const appendFailedResult = await persistExternalChannelMediaTransferManualRetryLedgerEntry({
    retryLedgerEntryPlan,
    retryLedgerStore: rejectingStore,
  });
  assertEqual(appendFailedResult.accepted, false, "fixture retry ledger append failure is rejected before operator handoff preflight");
  const {
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
  } = await operatorHandoffFixture({
    workspaceId: "T186VALID",
    accountId: "A186VALID",
    targetId: "C186VALID",
    threadId: "171000.1867",
    fileRefs: fileRefs("phase186_valid"),
  });

  const preflight = await preflightExternalChannelMediaTransferManualRetryControlOperatorHandoff({
    retryLedgerEntry: capturedAppendEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
  });

  assertEqual(preflight.accepted, false, "append-failed retry ledger entry cannot preflight retry-control operator handoff");
  assertEqual(preflight.reasonCode, "external_media_transfer_manual_retry_ledger_entry_untrusted", "append-failed operator handoff preflight rejection is bounded");
  assertEqual(preflight.retryControlOperatorHandoff, undefined, "append-failed operator handoff preflight returns no handoff");
  assertEqual(preflight.hostOwnedRetryControlRequired, false, "append-failed operator handoff preflight does not require host retry control");
  assertEqual(preflight.retryWorkerCreated, false, "append-failed operator handoff preflight creates no retry worker");
  assertEqual(preflight.retryScheduleCreated, false, "append-failed operator handoff preflight creates no retry schedule");
  assertEqual(preflight.automaticVendorRetryAllowed, false, "append-failed operator handoff preflight allows no automatic retry");
  assert(!containsForbiddenTruth(preflight), "append-failed retry-control operator handoff preflight rejection leaks no raw truth");
}

async function workerSelectionFixture(
  options: {
    workspaceId?: string;
    accountId?: string;
    targetId?: string;
    threadId?: string;
    fileRefs?: ExternalChannelMediaTransferCandidate["fileRefs"];
  } = {},
): Promise<{
  retryLedgerEntry: ExternalChannelMediaTransferManualRetryLedgerEntry;
  retryControlReadinessPlan: ExternalChannelMediaTransferManualRetryControlReadinessPlan;
  retryControlOperatorHandoff: ExternalChannelMediaTransferManualRetryControlOperatorHandoff;
  retryControlWorkerSelection: ExternalChannelMediaTransferManualRetryControlWorkerSelection;
}> {
  const { retryLedgerEntry, retryControlReadinessPlan, retryControlOperatorHandoff } =
    await operatorHandoffFixture(options);
  const selectionResult = await createExternalChannelMediaTransferManualRetryControlWorkerSelection({
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
  });
  assert(Boolean(selectionResult.retryControlWorkerSelection), "fixture retry-control worker selection is returned");
  return {
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
    retryControlWorkerSelection:
      selectionResult.retryControlWorkerSelection as ExternalChannelMediaTransferManualRetryControlWorkerSelection,
  };
}

async function verifyManualRetryControlWorkerSelectionAcceptsOperatorHandoffPreflight(): Promise<void> {
  section("81. Manual Retry Control Worker Selection Accepts Operator Handoff Preflight");
  const { retryLedgerEntry, retryControlReadinessPlan, retryControlOperatorHandoff } =
    await operatorHandoffFixture({
      workspaceId: "T187SELECT",
      accountId: "A187SELECT",
      targetId: "C187SELECT",
      threadId: "171000.1870",
      fileRefs: fileRefs("phase187_select"),
    });

  const result = await createExternalChannelMediaTransferManualRetryControlWorkerSelection({
    retryLedgerEntry,
    retryControlReadinessPlan: JSON.parse(JSON.stringify(retryControlReadinessPlan)) as ExternalChannelMediaTransferManualRetryControlReadinessPlan,
    retryControlOperatorHandoff: JSON.parse(JSON.stringify(retryControlOperatorHandoff)) as ExternalChannelMediaTransferManualRetryControlOperatorHandoff,
  });

  assertEqual(result.accepted, true, "worker selection intent is accepted from current operator handoff preflight");
  assert(Boolean(result.retryControlWorkerSelection), "worker selection intent is returned");
  assertEqual(result.retryControlOperatorHandoffPreflight.accepted, true, "worker selection recomputes accepted operator handoff preflight");
  assertEqual(result.retryControlWorkerSelection?.retryControlOperatorHandoffId, retryControlOperatorHandoff.retryControlOperatorHandoffId, "worker selection binds operator handoff id");
  assertEqual(result.retryControlWorkerSelection?.manualRetryLedgerEntryId, retryLedgerEntry.manualRetryLedgerEntryId, "worker selection binds ledger entry id");
  assertEqual(result.retryControlWorkerSelection?.transferKey, retryLedgerEntry.transferKey, "worker selection binds transfer key");
  assertEqual(result.retryControlWorkerSelection?.sourceRefsTruncated, retryLedgerEntry.sourceRefsTruncated, "worker selection preserves source truncation truth");
  assertEqual(result.retryControlWorkerSelection?.sourceRefFingerprints.length, retryLedgerEntry.sourceRefFingerprints.length, "worker selection preserves source fingerprint count");
  assertEqual(result.retryControlWorkerSelection?.targetCorrelationFingerprint, retryLedgerEntry.targetCorrelationFingerprint, "worker selection binds target fingerprint");
  assertEqual(result.retryControlWorkerSelection?.vendorStateVerified, retryLedgerEntry.vendorStateVerified, "worker selection binds vendor state truth");
  assertEqual(result.retryControlWorkerSelection?.hostReportedDeliveredCount, retryLedgerEntry.hostReportedDeliveredCount, "worker selection binds delivered-count truth");
  assertEqual(result.retryControlWorkerSelection?.hostReceiptMetadataIncluded, retryLedgerEntry.hostReceiptMetadataIncluded, "worker selection binds receipt metadata truth");
  assertEqual(result.retryControlWorkerSelection?.selectedRetryControlMode, "host_owned_foreground_manual_reinvoke", "worker selection records supported manual foreground mode");
  assertEqual(result.retryControlOperatorHandoffPreflightAccepted, true, "worker selection requires accepted operator handoff preflight");
  assertEqual(result.hostRetryWorkerSelectionIntentAccepted, true, "worker selection records host retry-worker selection intent");
  assertEqual(result.hostMustSupplyRetryWorkerHandler, true, "worker selection keeps future handler host-supplied");
  assertEqual(result.operatorMustSelectFutureRetryWorker, false, "worker selection closes operator selection intent");
  assertEqual(result.colonyRetryWorkerSelected, false, "worker selection selects no Colony retry worker");
  assertEqual(result.colonyRetryWorkerExecutable, false, "worker selection makes no retry worker executable");
  assertEqual(result.retryWorkerReady, false, "worker selection keeps retry worker not ready");
  assertEqual(result.retryScheduleReady, false, "worker selection keeps retry schedule not ready");
  assertEqual(result.backgroundRetryCreated, false, "worker selection creates no background retry");
  assertEqual(result.retryWorkerCreated, false, "worker selection creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "worker selection creates no retry schedule");
  assertEqual(result.automaticVendorRetryAllowed, false, "worker selection allows no automatic retry");
  assertEqual(result.credentialPersistenceCreated, false, "worker selection persists no credentials");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "worker selection enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "worker selection enables no public hosting");
  assertEqual(
    result.manualRetryControlWorkerSelectionTruth,
    "operator_handoff_preflight_bound_worker_selection_intent_no_worker_or_schedule",
    "worker selection truth is explicit",
  );
  assert(!containsForbiddenTruth(result), "accepted worker selection leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyManualRetryControlWorkerSelectionIsDeterministic(): Promise<void> {
  section("82. Manual Retry Control Worker Selection Is Deterministic");
  const { retryLedgerEntry, retryControlReadinessPlan, retryControlOperatorHandoff } =
    await operatorHandoffFixture({
      workspaceId: "T187STABLE",
      accountId: "A187STABLE",
      targetId: "C187STABLE",
      threadId: "171000.1871",
      fileRefs: fileRefs("phase187_stable"),
    });
  const other = await operatorHandoffFixture({
    workspaceId: "T187OTHER",
    accountId: "A187OTHER",
    targetId: "C187OTHER",
    threadId: "171000.1872",
    fileRefs: fileRefs("phase187_other"),
  });

  const first = await createExternalChannelMediaTransferManualRetryControlWorkerSelection({
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
  });
  const second = await createExternalChannelMediaTransferManualRetryControlWorkerSelection({
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
  });
  const changed = await createExternalChannelMediaTransferManualRetryControlWorkerSelection({
    retryLedgerEntry: other.retryLedgerEntry,
    retryControlReadinessPlan: other.retryControlReadinessPlan,
    retryControlOperatorHandoff: other.retryControlOperatorHandoff,
  });

  assertEqual(first.retryControlWorkerSelectionId, second.retryControlWorkerSelectionId, "same handoff truth produces stable worker selection id");
  assert(first.retryControlWorkerSelectionId !== changed.retryControlWorkerSelectionId, "different handoff truth changes worker selection id");
}

async function verifyManualRetryControlWorkerSelectionRejectsMismatchedHandoff(): Promise<void> {
  section("83. Manual Retry Control Worker Selection Rejects Mismatched Handoff");
  const { retryLedgerEntry, retryControlReadinessPlan } = await operatorHandoffFixture({
    workspaceId: "T187BASE",
    accountId: "A187BASE",
    targetId: "C187BASE",
    threadId: "171000.1873",
    fileRefs: fileRefs("phase187_base"),
  });
  const { retryControlOperatorHandoff: otherHandoff } = await operatorHandoffFixture({
    workspaceId: "T187MISMATCH",
    accountId: "A187MISMATCH",
    targetId: "C187MISMATCH",
    threadId: "171000.1874",
    fileRefs: fileRefs("phase187_mismatch"),
  });

  const result = await createExternalChannelMediaTransferManualRetryControlWorkerSelection({
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff: otherHandoff,
  });

  assertEqual(result.accepted, false, "mismatched operator handoff blocks worker selection intent");
  assertEqual(result.reasonCode, "external_media_transfer_manual_retry_control_operator_handoff_current_truth_mismatch", "mismatched worker selection rejection is bounded");
  assertEqual(result.retryControlWorkerSelection, undefined, "mismatched worker selection returns no descriptor");
  assertEqual(result.retryControlOperatorHandoffPreflightAccepted, false, "mismatched worker selection does not accept handoff preflight");
  assertEqual(result.retryWorkerCreated, false, "mismatched worker selection creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "mismatched worker selection creates no retry schedule");
  assertEqual(result.automaticVendorRetryAllowed, false, "mismatched worker selection allows no automatic retry");
  assert(!containsForbiddenTruth(result), "mismatched worker selection rejection leaks no raw truth");
}

async function verifyManualRetryControlWorkerSelectionPreflightAcceptsCurrentSelection(): Promise<void> {
  section("84. Manual Retry Control Worker Selection Preflight Accepts Current Selection");
  const {
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
    retryControlWorkerSelection,
  } = await workerSelectionFixture({
    workspaceId: "T187PREFLIGHT",
    accountId: "A187PREFLIGHT",
    targetId: "C187PREFLIGHT",
    threadId: "171000.1875",
    fileRefs: fileRefs("phase187_preflight"),
  });

  const preflight = await preflightExternalChannelMediaTransferManualRetryControlWorkerSelection({
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
    retryControlWorkerSelection: JSON.parse(JSON.stringify(retryControlWorkerSelection)) as ExternalChannelMediaTransferManualRetryControlWorkerSelection,
  }) as ExternalChannelMediaTransferManualRetryControlWorkerSelectionPreflightResult;

  assertEqual(preflight.accepted, true, "current worker selection preflight is accepted");
  assert(Boolean(preflight.retryControlWorkerSelection), "current worker selection preflight returns expected descriptor");
  assertEqual(preflight.retryControlWorkerSelectionIdMatched, true, "worker selection id matches recomputed truth");
  assertEqual(preflight.retryControlOperatorHandoffIdMatched, true, "worker selection binds operator handoff id");
  assertEqual(preflight.manualRetryControlReadinessPlanIdMatched, true, "worker selection binds readiness plan id");
  assertEqual(preflight.manualRetryLedgerEntryIdMatched, true, "worker selection binds ledger entry id");
  assertEqual(preflight.transferKeyMatched, true, "worker selection preflight binds transfer key");
  assertEqual(preflight.sourceRefsTruncatedMatched, true, "worker selection preflight binds source truncation truth");
  assertEqual(preflight.sourceRefFingerprintsMatched, true, "worker selection preflight binds source fingerprints");
  assertEqual(preflight.targetCorrelationMatched, true, "worker selection preflight binds target fingerprint");
  assertEqual(preflight.vendorStateVerifiedMatched, true, "worker selection preflight binds vendor state truth");
  assertEqual(preflight.hostReportedDeliveredCountMatched, true, "worker selection preflight binds delivered-count truth");
  assertEqual(preflight.hostReceiptMetadataIncludedMatched, true, "worker selection preflight binds receipt metadata truth");
  assertEqual(preflight.selectedRetryControlModeMatched, true, "worker selection preflight binds selected mode");
  assertEqual(preflight.hostRetryWorkerSelectionIntentAccepted, true, "worker selection preflight accepts selection intent");
  assertEqual(preflight.hostMustSupplyRetryWorkerHandler, true, "worker selection preflight keeps handler host-supplied");
  assertEqual(preflight.operatorMustSelectFutureRetryWorker, false, "worker selection preflight closes operator selection intent");
  assertEqual(preflight.retryWorkerCreated, false, "worker selection preflight creates no retry worker");
  assertEqual(preflight.retryScheduleCreated, false, "worker selection preflight creates no retry schedule");
  assertEqual(preflight.automaticVendorRetryAllowed, false, "worker selection preflight allows no automatic retry");
  assertEqual(
    preflight.manualRetryControlWorkerSelectionPreflightTruth,
    "recomputed_from_operator_handoff_preflight_bound_worker_selection_intent_no_worker_or_schedule",
    "worker selection preflight truth is explicit",
  );
  assert(!containsForbiddenTruth(preflight), "accepted worker selection preflight leaks no raw truth");
}

async function verifyManualRetryControlWorkerSelectionPreflightRejectsProvenanceTampering(): Promise<void> {
  section("85. Manual Retry Control Worker Selection Preflight Rejects Provenance Tampering");
  const {
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
    retryControlWorkerSelection,
  } = await workerSelectionFixture({
    workspaceId: "T187PROVENANCE",
    accountId: "A187PROVENANCE",
    targetId: "C187PROVENANCE",
    threadId: "171000.1877",
    fileRefs: fileRefs("phase187_provenance"),
  });
  const tamperedSelection = {
    ...retryControlWorkerSelection,
    channelId: "discord",
    targetKind: "direct",
    retryLedgerEntryPersistedAt: "2026-05-08T00:00:00.000Z",
  };

  const preflight = await preflightExternalChannelMediaTransferManualRetryControlWorkerSelection({
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
    retryControlWorkerSelection: tamperedSelection,
  });

  assertEqual(preflight.accepted, false, "worker selection provenance tampering is rejected");
  assertEqual(preflight.reasonCode, "external_media_transfer_manual_retry_control_worker_selection_current_truth_mismatch", "worker selection provenance tampering rejection is bounded");
  assertEqual(preflight.retryControlWorkerSelection, undefined, "worker selection provenance tampering returns no descriptor");
  assertEqual(preflight.retryControlWorkerSelectionResult.retryControlWorkerSelection, undefined, "worker selection provenance tampering exposes no nested descriptor");
  assertEqual(preflight.retryControlWorkerSelectionIdMatched, true, "tampered worker selection can keep the old id but still fail full descriptor comparison");
  assertEqual(preflight.transferKeyMatched, true, "tampered worker selection can keep transfer key but still fail full descriptor comparison");
  assertEqual(preflight.sourceRefFingerprintsMatched, true, "tampered worker selection can keep source fingerprints but still fail full descriptor comparison");
  assertEqual(preflight.hostRetryWorkerSelectionIntentAccepted, false, "tampered worker selection preflight does not accept selection intent");
  assertEqual(preflight.retryWorkerCreated, false, "tampered worker selection preflight creates no retry worker");
  assertEqual(preflight.retryScheduleCreated, false, "tampered worker selection preflight creates no retry schedule");
  assertEqual(preflight.automaticVendorRetryAllowed, false, "tampered worker selection preflight allows no automatic retry");
  assert(!containsForbiddenTruth(preflight), "worker selection provenance tampering rejection leaks no raw truth");
}

async function verifyManualRetryControlWorkerSelectionPreflightRejectsContaminatedSelection(): Promise<void> {
  section("86. Manual Retry Control Worker Selection Preflight Rejects Contaminated Selection");
  const {
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
    retryControlWorkerSelection,
  } = await workerSelectionFixture({
    workspaceId: "T187DIRTY",
    accountId: "A187DIRTY",
    targetId: "C187DIRTY",
    threadId: "171000.1876",
    fileRefs: fileRefs("phase187_dirty"),
  });
  const contaminatedSelection = {
    ...retryControlWorkerSelection,
    retryWorkerReady: true,
    retryWorkerCreated: true,
    retryScheduleCreated: true,
    automaticVendorRetryAllowed: true,
    credentialValue: "xoxb-real-credential-value",
  };

  const preflight = await preflightExternalChannelMediaTransferManualRetryControlWorkerSelection({
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
    retryControlWorkerSelection: contaminatedSelection,
  });

  assertEqual(preflight.accepted, false, "contaminated worker selection preflight is rejected");
  assertEqual(preflight.reasonCode, "valid_external_media_transfer_manual_retry_control_worker_selection_required", "contaminated worker selection rejection is bounded");
  assertEqual(preflight.retryControlWorkerSelection, undefined, "contaminated worker selection preflight returns no descriptor");
  assertEqual(preflight.retryControlWorkerSelectionResult.retryControlWorkerSelection, undefined, "contaminated worker selection preflight exposes no nested descriptor");
  assertEqual(preflight.hostRetryWorkerSelectionIntentAccepted, false, "contaminated worker selection preflight does not accept selection intent");
  assertEqual(preflight.retryWorkerCreated, false, "contaminated worker selection preflight creates no retry worker");
  assertEqual(preflight.retryScheduleCreated, false, "contaminated worker selection preflight creates no retry schedule");
  assertEqual(preflight.automaticVendorRetryAllowed, false, "contaminated worker selection preflight allows no automatic retry");
  assertEqual(preflight.credentialPersistenceCreated, false, "contaminated worker selection preflight persists no credentials");
  assert(!containsForbiddenTruth(preflight), "contaminated worker selection preflight rejection leaks no raw truth");
}

export async function workerHandlerReadinessFixture(
  options: {
    workspaceId?: string;
    accountId?: string;
    targetId?: string;
    threadId?: string;
    fileRefs?: ExternalChannelMediaTransferCandidate["fileRefs"];
  } = {},
): Promise<{
  retryLedgerEntry: ExternalChannelMediaTransferManualRetryLedgerEntry;
  retryControlReadinessPlan: ExternalChannelMediaTransferManualRetryControlReadinessPlan;
  retryControlOperatorHandoff: ExternalChannelMediaTransferManualRetryControlOperatorHandoff;
  retryControlWorkerSelection: ExternalChannelMediaTransferManualRetryControlWorkerSelection;
  retryControlWorkerHandlerReadiness: ExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness;
}> {
  const {
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
    retryControlWorkerSelection,
  } = await workerSelectionFixture(options);
  const readinessResult =
    await createExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness({
      retryLedgerEntry,
      retryControlReadinessPlan,
      retryControlOperatorHandoff,
      retryControlWorkerSelection,
      mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler(),
    });
  assert(Boolean(readinessResult.retryControlWorkerHandlerReadiness), "fixture retry-control worker handler readiness is returned");
  return {
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
    retryControlWorkerSelection,
    retryControlWorkerHandlerReadiness:
      readinessResult.retryControlWorkerHandlerReadiness as ExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness,
  };
}

export async function vendorWorkerInvocationHandoffFixture(): Promise<{
  candidate: ExternalChannelMediaTransferCandidate;
  approval: ExternalChannelMediaTransferApproval;
  retryLedgerEntry: ExternalChannelMediaTransferManualRetryLedgerEntry;
  retryControlReadinessPlan: ExternalChannelMediaTransferManualRetryControlReadinessPlan;
  retryControlOperatorHandoff: ExternalChannelMediaTransferManualRetryControlOperatorHandoff;
  retryControlWorkerSelection: ExternalChannelMediaTransferManualRetryControlWorkerSelection;
  retryControlWorkerHandlerReadiness: ExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness;
  retryControlWorkerInvocationHandoff: import("./channel").ExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff;
}> {
  const truth = await currentVendorHandoff();
  const execution = await executeExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvoke({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
    vendorStateVerification: vendorStateVerificationFor(truth.credentialAcknowledgedManualReinvokeHandoff),
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler({
      resolveSourceRef: async (request) => ({
        sourceRefFingerprint: request.sourceRefFingerprint,
        sizeBytes: request.sizeBytes,
      }),
      sendToVendor: async (action) => ({
        accepted: true,
        transferKey: action.transferKey,
        deliveredCount: action.files.length,
      }),
    }),
  });
  assertEqual(execution.accepted, true, "fixture vendor manual reinvoke execution is accepted for worker invocation handoff");
  const receiptResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceipt({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    credentialAcknowledgedManualReinvokeExecution: execution,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(receiptResult.accepted, true, "fixture vendor execution receipt is accepted for worker invocation handoff");
  const receipt = receiptResult.credentialAcknowledgedManualReinvokeExecutionReceipt!;
  const closeoutResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseout({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    credentialAcknowledgedManualReinvokeExecution: execution,
    credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(closeoutResult.accepted, true, "fixture vendor receipt closeout is accepted for worker invocation handoff");
  const closeout = closeoutResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseout!;
  const recordPlanResult = await createExternalChannelMediaTransferManualRetryReplaySourceRevalidationCredentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    credentialAcknowledgedManualReinvokeExecution: execution,
    credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
    credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(recordPlanResult.accepted, true, "fixture vendor closeout record plan is accepted for worker invocation handoff");
  const recordPlan = recordPlanResult.credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan!;
  const { store: closeoutRecordStore } = await createCloseoutRecordStore();
  const closeoutRecordResult = await persistExternalChannelMediaTransferManualRetryCloseoutRecord({
    candidate: truth.candidate,
    approval: truth.approval,
    workItem: truth.item,
    sourceRevalidationChecklist: truth.checklist,
    sourceRevalidationChecklistAcknowledgement: truth.acknowledgement,
    sourceRevalidationResult: truth.sourceRevalidationResult,
    credentialAcknowledgement: truth.credentialAcknowledgement,
    credentialAcknowledgedHostAction: truth.credentialAcknowledgedHostAction,
    credentialAcknowledgedManualReinvokeRequest: truth.credentialAcknowledgedManualReinvokeRequest,
    credentialAcknowledgedManualReinvokeHandoff: truth.credentialAcknowledgedManualReinvokeHandoff,
    credentialAcknowledgedManualReinvokeExecution: execution,
    credentialAcknowledgedManualReinvokeExecutionReceipt: receipt,
    credentialAcknowledgedManualReinvokeExecutionReceiptCloseout: closeout,
    credentialAcknowledgedManualReinvokeExecutionReceiptCloseoutRecordPlan: recordPlan,
    closeoutRecordStore,
    persistedAt: "2026-05-08T19:52:31.000Z",
    persistedBy: "operator",
    expectedRetryStage: "vendor_send",
    freshApprovalRequiredAfter: "2026-05-08T16:14:59.000Z",
  });
  assertEqual(closeoutRecordResult.accepted, true, "fixture vendor closeout record persists for worker invocation handoff");
  const [closeoutRecord] = await closeoutRecordStore.loadCloseoutRecords();
  const { store: workItemClosureStore } = await createWorkItemClosureStore();
  const workItemClosureResult = await persistExternalChannelMediaTransferManualRetryWorkItemClosure({
    closeoutRecord,
    workItemClosureStore,
    closedAt: "2026-05-08T20:47:40.000Z",
    closedBy: "operator",
    persistedAt: "2026-05-08T20:48:40.000Z",
    persistedBy: "operator",
  });
  assertEqual(workItemClosureResult.accepted, true, "fixture vendor work-item closure persists for worker invocation handoff");
  const [workItemClosure] = await workItemClosureStore.loadWorkItemClosures();
  const auditPlanResult = await createExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordPlan({
    closeoutRecord,
    workItemClosure,
  });
  assertEqual(auditPlanResult.accepted, true, "fixture vendor audit plan is accepted for worker invocation handoff");
  const auditRecordStore = new JsonExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecordStore({
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase190-vendor-audit-record-")),
  });
  const auditRecordResult = await persistExternalChannelMediaTransferManualRetryWorkItemClosureAuditRecord({
    closeoutRecord,
    workItemClosure,
    workItemClosureAuditRecordPlan: auditPlanResult.workItemClosureAuditRecordPlan,
    auditRecordStore,
    persistedAt: "2026-05-08T21:48:00.000Z",
    persistedBy: "operator",
  });
  assertEqual(auditRecordResult.accepted, true, "fixture vendor audit record persists for worker invocation handoff");
  const [auditRecord] = await auditRecordStore.loadAuditRecords();
  const retryLedgerEntryPlanResult = await createExternalChannelMediaTransferManualRetryLedgerEntryPlan({ auditRecord });
  assertEqual(retryLedgerEntryPlanResult.accepted, true, "fixture vendor retry ledger entry plan is accepted");
  const retryLedgerStore = new JsonExternalChannelMediaTransferManualRetryLedgerEntryStore({
    rootDir: await mkdtemp(join(tmpdir(), "colony-phase190-vendor-retry-ledger-entry-")),
  });
  const retryLedgerEntryResult = await persistExternalChannelMediaTransferManualRetryLedgerEntry({
    retryLedgerEntryPlan: retryLedgerEntryPlanResult.retryLedgerEntryPlan,
    retryLedgerStore,
    persistedAt: "2026-05-08T22:30:00.000Z",
    persistedBy: "operator",
  });
  assertEqual(retryLedgerEntryResult.accepted, true, "fixture vendor retry ledger entry persists for worker invocation handoff");
  const [retryLedgerEntry] = await retryLedgerStore.loadRetryLedgerEntries();
  const retryControlReadinessPlanResult = await createExternalChannelMediaTransferManualRetryControlReadinessPlan({
    retryLedgerEntry,
  });
  assertEqual(retryControlReadinessPlanResult.accepted, true, "fixture vendor retry-control readiness plan is accepted");
  const retryControlReadinessPlan = retryControlReadinessPlanResult.retryControlReadinessPlan!;
  const retryControlOperatorHandoffResult = await createExternalChannelMediaTransferManualRetryControlOperatorHandoff({
    retryLedgerEntry,
    retryControlReadinessPlan,
  });
  assertEqual(retryControlOperatorHandoffResult.accepted, true, "fixture vendor retry-control operator handoff is accepted");
  const retryControlOperatorHandoff = retryControlOperatorHandoffResult.retryControlOperatorHandoff!;
  const retryControlWorkerSelectionResult = await createExternalChannelMediaTransferManualRetryControlWorkerSelection({
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
  });
  assertEqual(retryControlWorkerSelectionResult.accepted, true, "fixture vendor retry-control worker selection is accepted");
  const retryControlWorkerSelection = retryControlWorkerSelectionResult.retryControlWorkerSelection!;
  const retryControlWorkerHandlerReadinessResult = await createExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness({
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
    retryControlWorkerSelection,
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler(),
  });
  assertEqual(retryControlWorkerHandlerReadinessResult.accepted, true, "fixture vendor retry-control worker handler readiness is accepted");
  const retryControlWorkerHandlerReadiness = retryControlWorkerHandlerReadinessResult.retryControlWorkerHandlerReadiness!;
  const retryControlWorkerInvocationHandoffResult = await createExternalChannelMediaTransferManualRetryControlWorkerInvocationHandoff({
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
    retryControlWorkerSelection,
    retryControlWorkerHandlerReadiness,
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler(),
  });
  assertEqual(retryControlWorkerInvocationHandoffResult.accepted, true, "fixture vendor retry-control worker invocation handoff is accepted");
  return {
    candidate: truth.candidate,
    approval: truth.approval,
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
    retryControlWorkerSelection,
    retryControlWorkerHandlerReadiness,
    retryControlWorkerInvocationHandoff:
      retryControlWorkerInvocationHandoffResult.retryControlWorkerInvocationHandoff!,
  };
}

async function verifyManualRetryControlWorkerHandlerReadinessAcceptsSelectionPreflight(): Promise<void> {
  section("87. Manual Retry Control Worker Handler Readiness Accepts Selection Preflight");
  const {
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
    retryControlWorkerSelection,
  } = await workerSelectionFixture({
    workspaceId: "T188READY",
    accountId: "A188READY",
    targetId: "C188READY",
    threadId: "171000.1880",
    fileRefs: fileRefs("phase188_ready"),
  });

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness({
      retryLedgerEntry,
      retryControlReadinessPlan,
      retryControlOperatorHandoff,
      retryControlWorkerSelection: JSON.parse(JSON.stringify(retryControlWorkerSelection)) as ExternalChannelMediaTransferManualRetryControlWorkerSelection,
      mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler(),
    });

  assertEqual(result.accepted, true, "worker handler readiness is accepted from current worker-selection preflight");
  assert(Boolean(result.retryControlWorkerHandlerReadiness), "worker handler readiness descriptor is returned");
  assertEqual(result.retryControlWorkerSelectionPreflight.accepted, true, "handler readiness recomputes accepted worker-selection preflight");
  assertEqual(result.retryControlWorkerHandlerReadiness?.retryControlWorkerSelectionId, retryControlWorkerSelection.retryControlWorkerSelectionId, "handler readiness binds worker selection id");
  assertEqual(result.retryControlWorkerHandlerReadiness?.retryControlOperatorHandoffId, retryControlOperatorHandoff.retryControlOperatorHandoffId, "handler readiness binds operator handoff id");
  assertEqual(result.retryControlWorkerHandlerReadiness?.manualRetryLedgerEntryId, retryLedgerEntry.manualRetryLedgerEntryId, "handler readiness binds ledger entry id");
  assertEqual(result.retryControlWorkerHandlerReadiness?.transferKey, retryLedgerEntry.transferKey, "handler readiness binds transfer key");
  assertEqual(result.retryControlWorkerHandlerReadiness?.selectedRetryControlMode, "host_owned_foreground_manual_reinvoke", "handler readiness preserves selected manual foreground mode");
  assertEqual(result.hostRetryWorkerSelectionIntentAccepted, true, "handler readiness keeps selection intent accepted");
  assertEqual(result.hostMustSupplyRetryWorkerHandler, true, "handler readiness requires host-supplied worker handler");
  assertEqual(result.hostRetryWorkerHandlerRequired, true, "handler readiness records host worker handler requirement");
  assertEqual(result.hostRetryWorkerHandlerSupplied, true, "handler readiness accepts a branded host handler");
  assertEqual(result.hostRetryWorkerHandlerTrusted, true, "handler readiness trusts only the branded host handler type");
  assertEqual(result.retryControlWorkerHandlerReadiness?.hostRetryWorkerHandlerCapabilityTruth, "foreground_worker_handler_resolves_sources_freshly_before_vendor_send", "handler readiness binds handler capability truth");
  assertEqual(result.retryControlWorkerHandlerReadiness?.hostRetryWorkerHandlerIdentityPersisted, false, "handler readiness persists no handler identity");
  assertEqual(result.retryControlWorkerHandlerReadiness?.hostRetryWorkerHandlerRegistryIdPersisted, false, "handler readiness persists no handler registry id");
  assertEqual(result.hostRetryWorkerHandlerExecutable, false, "handler readiness makes no handler executable");
  assertEqual(result.hostRetryWorkerHandlerExecuted, false, "handler readiness executes no handler");
  assertEqual(result.retryWorkerReady, false, "handler readiness keeps retry worker not ready");
  assertEqual(result.retryScheduleReady, false, "handler readiness keeps retry schedule not ready");
  assertEqual(result.backgroundRetryCreated, false, "handler readiness creates no background retry");
  assertEqual(result.retryWorkerCreated, false, "handler readiness creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "handler readiness creates no retry schedule");
  assertEqual(result.automaticVendorRetryAllowed, false, "handler readiness allows no automatic retry");
  assertEqual(result.credentialPersistenceCreated, false, "handler readiness persists no credentials");
  assertEqual(result.defaultLiveDeliveryEnabled, false, "handler readiness enables no default live delivery");
  assertEqual(result.publicHostingEnabled, false, "handler readiness enables no public hosting");
  assertEqual(
    result.manualRetryControlWorkerHandlerReadinessTruth,
    "worker_selection_preflight_bound_handler_readiness_no_handler_worker_or_schedule",
    "worker handler readiness truth is explicit",
  );
  assert(!containsForbiddenTruth(result), "accepted worker handler readiness leaks no raw refs, targets, signatures, URLs, secrets, paths, or credentials");
}

async function verifyManualRetryControlWorkerHandlerReadinessIsDeterministic(): Promise<void> {
  section("88. Manual Retry Control Worker Handler Readiness Is Deterministic");
  const fixture = await workerSelectionFixture({
    workspaceId: "T188STABLE",
    accountId: "A188STABLE",
    targetId: "C188STABLE",
    threadId: "171000.1881",
    fileRefs: fileRefs("phase188_stable"),
  });
  const other = await workerSelectionFixture({
    workspaceId: "T188OTHER",
    accountId: "A188OTHER",
    targetId: "C188OTHER",
    threadId: "171000.1882",
    fileRefs: fileRefs("phase188_other"),
  });

  const first = await createExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness({
    ...fixture,
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler(),
  });
  const second = await createExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness({
    ...fixture,
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler(),
  });
  const changed = await createExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness({
    ...other,
    mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler(),
  });

  assertEqual(first.retryControlWorkerHandlerReadinessId, second.retryControlWorkerHandlerReadinessId, "same selection truth produces stable worker handler readiness id");
  assert(first.retryControlWorkerHandlerReadinessId !== changed.retryControlWorkerHandlerReadinessId, "different selection truth changes worker handler readiness id");
}

async function verifyManualRetryControlWorkerHandlerReadinessRejectsMismatchedSelection(): Promise<void> {
  section("89. Manual Retry Control Worker Handler Readiness Rejects Mismatched Selection");
  const { retryLedgerEntry, retryControlReadinessPlan, retryControlOperatorHandoff } =
    await workerSelectionFixture({
      workspaceId: "T188BASE",
      accountId: "A188BASE",
      targetId: "C188BASE",
      threadId: "171000.1883",
      fileRefs: fileRefs("phase188_base"),
    });
  const { retryControlWorkerSelection: otherSelection } = await workerSelectionFixture({
    workspaceId: "T188MISMATCH",
    accountId: "A188MISMATCH",
    targetId: "C188MISMATCH",
    threadId: "171000.1884",
    fileRefs: fileRefs("phase188_mismatch"),
  });

  const result =
    await createExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness({
      retryLedgerEntry,
      retryControlReadinessPlan,
      retryControlOperatorHandoff,
      retryControlWorkerSelection: otherSelection,
      mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler(),
    });

  assertEqual(result.accepted, false, "mismatched worker selection blocks handler readiness");
  assertEqual(result.reasonCode, "external_media_transfer_manual_retry_control_worker_selection_current_truth_mismatch", "mismatched handler readiness rejection is bounded");
  assertEqual(result.retryControlWorkerHandlerReadiness, undefined, "mismatched handler readiness returns no descriptor");
  assertEqual(result.retryControlWorkerSelectionPreflightAccepted, false, "mismatched handler readiness does not accept selection preflight");
  assertEqual(result.retryWorkerCreated, false, "mismatched handler readiness creates no retry worker");
  assertEqual(result.retryScheduleCreated, false, "mismatched handler readiness creates no retry schedule");
  assertEqual(result.automaticVendorRetryAllowed, false, "mismatched handler readiness allows no automatic retry");
  assert(!containsForbiddenTruth(result), "mismatched handler readiness rejection leaks no raw truth");
}

async function verifyManualRetryControlWorkerHandlerReadinessRejectsMissingOrUnbrandedHandler(): Promise<void> {
  section("90. Manual Retry Control Worker Handler Readiness Rejects Missing Or Unbranded Handler");
  const {
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
    retryControlWorkerSelection,
  } = await workerSelectionFixture({
    workspaceId: "T188HANDLER",
    accountId: "A188HANDLER",
    targetId: "C188HANDLER",
    threadId: "171000.1888",
    fileRefs: fileRefs("phase188_handler"),
  });
  const plainHandler = (async () => ({ accepted: true })) as unknown as ExternalChannelMediaTransferManualReinvokeWorkerHandler;

  const missing =
    await createExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness({
      retryLedgerEntry,
      retryControlReadinessPlan,
      retryControlOperatorHandoff,
      retryControlWorkerSelection,
    });
  const unbranded =
    await createExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness({
      retryLedgerEntry,
      retryControlReadinessPlan,
      retryControlOperatorHandoff,
      retryControlWorkerSelection,
      mediaTransferHandler: plainHandler,
    });

  assertEqual(missing.accepted, false, "missing host handler blocks handler readiness");
  assertEqual(missing.reasonCode, "manual_reinvoke_worker_handler_required", "missing handler readiness rejection is bounded");
  assertEqual(missing.retryControlWorkerHandlerReadiness, undefined, "missing handler returns no readiness descriptor");
  assertEqual(missing.hostRetryWorkerHandlerSupplied, false, "missing handler is not treated as supplied");
  assertEqual(missing.hostRetryWorkerHandlerTrusted, false, "missing handler is not trusted");
  assertEqual(missing.hostRetryWorkerHandlerExecuted, false, "missing handler is not executed");
  assertEqual(missing.retryWorkerCreated, false, "missing handler readiness creates no retry worker");
  assertEqual(unbranded.accepted, false, "unbranded host handler blocks handler readiness");
  assertEqual(unbranded.reasonCode, "manual_reinvoke_worker_handler_required", "unbranded handler readiness rejection is bounded");
  assertEqual(unbranded.retryControlWorkerHandlerReadiness, undefined, "unbranded handler returns no readiness descriptor");
  assertEqual(unbranded.hostRetryWorkerHandlerTrusted, false, "unbranded handler is not trusted");
  assertEqual(unbranded.hostRetryWorkerHandlerExecuted, false, "unbranded handler is not executed");
  assertEqual(unbranded.retryWorkerCreated, false, "unbranded handler readiness creates no retry worker");
  assertEqual(unbranded.retryScheduleCreated, false, "unbranded handler readiness creates no retry schedule");
  assertEqual(unbranded.automaticVendorRetryAllowed, false, "unbranded handler readiness allows no automatic retry");
  assert(!containsForbiddenTruth(missing), "missing handler readiness rejection leaks no raw truth");
  assert(!containsForbiddenTruth(unbranded), "unbranded handler readiness rejection leaks no raw truth");
}

async function verifyManualRetryControlWorkerHandlerReadinessPreflightAcceptsCurrentReadiness(): Promise<void> {
  section("91. Manual Retry Control Worker Handler Readiness Preflight Accepts Current Readiness");
  const {
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
    retryControlWorkerSelection,
    retryControlWorkerHandlerReadiness,
  } = await workerHandlerReadinessFixture({
    workspaceId: "T188PREFLIGHT",
    accountId: "A188PREFLIGHT",
    targetId: "C188PREFLIGHT",
    threadId: "171000.1885",
    fileRefs: fileRefs("phase188_preflight"),
  });

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness({
      retryLedgerEntry,
      retryControlReadinessPlan,
      retryControlOperatorHandoff,
      retryControlWorkerSelection,
      retryControlWorkerHandlerReadiness: JSON.parse(JSON.stringify(retryControlWorkerHandlerReadiness)) as ExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness,
      mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler(),
    }) as ExternalChannelMediaTransferManualRetryControlWorkerHandlerReadinessPreflightResult;

  assertEqual(preflight.accepted, true, "current worker handler readiness preflight is accepted");
  assert(Boolean(preflight.retryControlWorkerHandlerReadiness), "current worker handler readiness preflight returns expected descriptor");
  assertEqual(preflight.retryControlWorkerHandlerReadinessIdMatched, true, "handler readiness id matches recomputed truth");
  assertEqual(preflight.retryControlWorkerSelectionIdMatched, true, "handler readiness binds worker selection id");
  assertEqual(preflight.retryControlOperatorHandoffIdMatched, true, "handler readiness binds operator handoff id");
  assertEqual(preflight.transferKeyMatched, true, "handler readiness preflight binds transfer key");
  assertEqual(preflight.sourceRefFingerprintsMatched, true, "handler readiness preflight binds source fingerprints");
  assertEqual(preflight.targetCorrelationMatched, true, "handler readiness preflight binds target fingerprint");
  assertEqual(preflight.selectedRetryControlModeMatched, true, "handler readiness preflight binds selected mode");
  assertEqual(preflight.hostRetryWorkerSelectionIntentAccepted, true, "handler readiness preflight accepts selection intent");
  assertEqual(preflight.hostMustSupplyRetryWorkerHandler, true, "handler readiness preflight keeps handler host-supplied");
  assertEqual(preflight.hostRetryWorkerHandlerRequired, true, "handler readiness preflight requires host handler");
  assertEqual(preflight.hostRetryWorkerHandlerSupplied, true, "handler readiness preflight accepts a branded host handler");
  assertEqual(preflight.hostRetryWorkerHandlerTrusted, true, "handler readiness preflight trusts only the branded host handler type");
  assertEqual(preflight.retryControlWorkerHandlerReadiness?.hostRetryWorkerHandlerCapabilityTruth, "foreground_worker_handler_resolves_sources_freshly_before_vendor_send", "handler readiness preflight binds handler capability truth");
  assertEqual(preflight.retryControlWorkerHandlerReadiness?.hostRetryWorkerHandlerIdentityPersisted, false, "handler readiness preflight persists no handler identity");
  assertEqual(preflight.retryControlWorkerHandlerReadiness?.hostRetryWorkerHandlerRegistryIdPersisted, false, "handler readiness preflight persists no handler registry id");
  assertEqual(preflight.hostRetryWorkerHandlerExecutable, false, "handler readiness preflight makes no handler executable");
  assertEqual(preflight.hostRetryWorkerHandlerExecuted, false, "handler readiness preflight executes no handler");
  assertEqual(preflight.retryWorkerCreated, false, "handler readiness preflight creates no retry worker");
  assertEqual(preflight.retryScheduleCreated, false, "handler readiness preflight creates no retry schedule");
  assertEqual(preflight.automaticVendorRetryAllowed, false, "handler readiness preflight allows no automatic retry");
  assertEqual(
    preflight.manualRetryControlWorkerHandlerReadinessPreflightTruth,
    "recomputed_from_worker_selection_preflight_bound_handler_readiness_no_handler_worker_or_schedule",
    "handler readiness preflight truth is explicit",
  );
  assert(!containsForbiddenTruth(preflight), "accepted worker handler readiness preflight leaks no raw truth");
}

async function verifyManualRetryControlWorkerHandlerReadinessPreflightRejectsProvenanceTampering(): Promise<void> {
  section("92. Manual Retry Control Worker Handler Readiness Preflight Rejects Provenance Tampering");
  const {
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
    retryControlWorkerSelection,
    retryControlWorkerHandlerReadiness,
  } = await workerHandlerReadinessFixture({
    workspaceId: "T188PROVENANCE",
    accountId: "A188PROVENANCE",
    targetId: "C188PROVENANCE",
    threadId: "171000.1886",
    fileRefs: fileRefs("phase188_provenance"),
  });
  const tamperedReadiness = {
    ...retryControlWorkerHandlerReadiness,
    channelId: "discord",
    targetKind: "direct",
    retryLedgerEntryPersistedAt: "2026-05-08T00:00:00.000Z",
  };

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness({
      retryLedgerEntry,
      retryControlReadinessPlan,
      retryControlOperatorHandoff,
      retryControlWorkerSelection,
      retryControlWorkerHandlerReadiness: tamperedReadiness,
      mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler(),
    });

  assertEqual(preflight.accepted, false, "worker handler readiness provenance tampering is rejected");
  assertEqual(preflight.reasonCode, "external_media_transfer_manual_retry_control_worker_handler_readiness_current_truth_mismatch", "handler readiness provenance tampering rejection is bounded");
  assertEqual(preflight.retryControlWorkerHandlerReadiness, undefined, "handler readiness provenance tampering returns no descriptor");
  assertEqual(preflight.retryControlWorkerHandlerReadinessResult.retryControlWorkerHandlerReadiness, undefined, "handler readiness provenance tampering exposes no nested descriptor");
  assertEqual(preflight.retryControlWorkerHandlerReadinessIdMatched, true, "tampered handler readiness can keep the old id but still fail full descriptor comparison");
  assertEqual(preflight.transferKeyMatched, true, "tampered handler readiness can keep transfer key but still fail full descriptor comparison");
  assertEqual(preflight.sourceRefFingerprintsMatched, true, "tampered handler readiness can keep source fingerprints but still fail full descriptor comparison");
  assertEqual(preflight.hostRetryWorkerHandlerRequired, false, "tampered handler readiness preflight does not accept handler readiness");
  assertEqual(preflight.retryWorkerCreated, false, "tampered handler readiness preflight creates no retry worker");
  assertEqual(preflight.retryScheduleCreated, false, "tampered handler readiness preflight creates no retry schedule");
  assertEqual(preflight.automaticVendorRetryAllowed, false, "tampered handler readiness preflight allows no automatic retry");
  assert(!containsForbiddenTruth(preflight), "worker handler readiness provenance tampering rejection leaks no raw truth");
}

async function verifyManualRetryControlWorkerHandlerReadinessPreflightRejectsContaminatedReadiness(): Promise<void> {
  section("93. Manual Retry Control Worker Handler Readiness Preflight Rejects Contaminated Readiness");
  const {
    retryLedgerEntry,
    retryControlReadinessPlan,
    retryControlOperatorHandoff,
    retryControlWorkerSelection,
    retryControlWorkerHandlerReadiness,
  } = await workerHandlerReadinessFixture({
    workspaceId: "T188DIRTY",
    accountId: "A188DIRTY",
    targetId: "C188DIRTY",
    threadId: "171000.1887",
    fileRefs: fileRefs("phase188_dirty"),
  });
  const contaminatedReadiness = {
    ...retryControlWorkerHandlerReadiness,
    hostRetryWorkerHandlerSupplied: true,
    hostRetryWorkerHandlerTrusted: true,
    hostRetryWorkerHandlerIdentityPersisted: true,
    hostRetryWorkerHandlerRegistryIdPersisted: true,
    hostRetryWorkerHandlerExecutable: true,
    retryWorkerReady: true,
    retryWorkerCreated: true,
    retryScheduleCreated: true,
    automaticVendorRetryAllowed: true,
    credentialValue: "xoxb-real-credential-value",
  };

  const preflight =
    await preflightExternalChannelMediaTransferManualRetryControlWorkerHandlerReadiness({
      retryLedgerEntry,
      retryControlReadinessPlan,
      retryControlOperatorHandoff,
      retryControlWorkerSelection,
      retryControlWorkerHandlerReadiness: contaminatedReadiness,
      mediaTransferHandler: createExternalChannelMediaTransferWorkerHandler(),
    });

  assertEqual(preflight.accepted, false, "contaminated worker handler readiness preflight is rejected");
  assertEqual(preflight.reasonCode, "valid_external_media_transfer_manual_retry_control_worker_handler_readiness_required", "contaminated handler readiness rejection is bounded");
  assertEqual(preflight.retryControlWorkerHandlerReadiness, undefined, "contaminated handler readiness preflight returns no descriptor");
  assertEqual(preflight.retryControlWorkerHandlerReadinessResult.retryControlWorkerHandlerReadiness, undefined, "contaminated handler readiness preflight exposes no nested descriptor");
  assertEqual(preflight.hostRetryWorkerHandlerRequired, false, "contaminated handler readiness preflight does not accept handler readiness");
  assertEqual(preflight.retryWorkerCreated, false, "contaminated handler readiness preflight creates no retry worker");
  assertEqual(preflight.retryScheduleCreated, false, "contaminated handler readiness preflight creates no retry schedule");
  assertEqual(preflight.automaticVendorRetryAllowed, false, "contaminated handler readiness preflight allows no automatic retry");
  assertEqual(preflight.credentialPersistenceCreated, false, "contaminated handler readiness preflight persists no credentials");
  assert(!containsForbiddenTruth(preflight), "contaminated worker handler readiness preflight rejection leaks no raw truth");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 188 Verification (External Media Transfer Manual Retry Control Worker Handler Readiness)\n");
  await verifyAcceptedCredentialAcknowledgedManualReinvokeHandoffPreflight();
  await verifyVendorManualReinvokeHandoffPreflightPreservesVendorStateGate();
  await verifyTamperedCredentialAcknowledgedManualReinvokeHandoffBlocksPreflight();
  await verifyManualReinvokeHandoffPreflightUsesRecomputedCanonicalTruth();
  await verifyExecutionAndCredentialClaimsRejectedByManualReinvokeHandoffPreflight();
  await verifyStaleApprovalRejectedBeforeCredentialAcknowledgedManualReinvokeHandoffPreflight();
  await verifyCredentialAcknowledgedManualReinvokeExecutesThroughExistingHostWorker();
  await verifyVendorStateMustBeVerifiedBeforeManualReinvokeExecution();
  await verifyManualReinvokeExecutionFailsClosedForMissingHandlerAndTampering();
  await verifyManualReinvokeExecutionRejectsCredentialAndExecutionClaims();
  await verifyManualReinvokeExecutionReceiptBindsSanitizedHostResult();
  await verifyVendorManualReinvokeExecutionReceiptRequiresVendorStateExecution();
  await verifyManualReinvokeExecutionReceiptRejectsTamperedOrFailedExecution();
  await verifyManualReinvokeExecutionReceiptPreflightAcceptsCurrentReceipt();
  await verifyVendorManualReinvokeExecutionReceiptPreflightRequiresVendorStateTruth();
  await verifyManualReinvokeExecutionReceiptPreflightRejectsTamperingAndClaims();
  await verifyManualReinvokeExecutionReceiptCloseoutAcceptsReceiptPreflight();
  await verifyManualReinvokeExecutionReceiptCloseoutRejectsTamperedReceiptPreflight();
  await verifyManualReinvokeExecutionReceiptCloseoutPreflightAcceptsCurrentCloseout();
  await verifyManualReinvokeExecutionReceiptCloseoutPreflightRejectsTamperingAndClosureClaims();
  await verifyManualReinvokeExecutionReceiptCloseoutRecordPlanAcceptsCloseoutPreflight();
  await verifyManualReinvokeExecutionReceiptCloseoutRecordPlanRejectsTamperingAndPersistenceClaims();
  await verifyManualReinvokeExecutionReceiptCloseoutRecordPlanPreflightAcceptsCurrentRecordPlan();
  await verifyManualReinvokeExecutionReceiptCloseoutRecordPlanPreflightRejectsTamperingAndPersistenceClaims();
  await verifyManualReinvokeExecutionReceiptCloseoutRecordDraftAcceptsRecordPlanPreflight();
  await verifyManualReinvokeExecutionReceiptCloseoutRecordDraftRejectsTamperedRecordPlanAndPersistenceClaims();
  await verifyManualRetryCloseoutRecordPersistenceStoresRedactedRecord();
  await verifyManualRetryCloseoutRecordPersistenceRejectsTamperedJournal();
  await verifyManualRetryCloseoutRecordPersistenceRejectsMissingStoreAndMalformedJournal();
  await verifyManualRetryCloseoutRecordPersistenceClosesManualRetryWorkItem();
  await verifyManualRetryWorkItemClosureRejectsUntrustedCloseoutRecord();
  await verifyManualRetryWorkItemClosureRejectsAppendFailedCapturedRecord();
  await verifyManualRetryWorkItemClosurePersistenceStoresRedactedClosureRecord();
  await verifyManualRetryWorkItemClosurePersistenceRejectsTamperedJournal();
  await verifyManualRetryWorkItemClosurePersistenceRejectsMissingStoreAndMalformedJournal();
  await verifyManualRetryWorkItemClosurePersistenceRejectsAppendFailedCapturedClosure();
  await verifyManualRetryWorkItemClosurePersistenceRejectsMutatingSuccessfulStore();
  await verifyManualRetryWorkItemClosurePersistencePreflightAcceptsTrustedClosureRecord();
  await verifyManualRetryWorkItemClosurePersistencePreflightRejectsMismatchedTrustedClosureRecord();
  await verifyManualRetryWorkItemClosurePersistencePreflightRejectsUntrustedClosureCopies();
  await verifyManualRetryWorkItemClosureAuditRecordPlanAcceptsClosurePersistencePreflight();
  await verifyManualRetryWorkItemClosureAuditRecordPlanRejectsCopiedClosurePersistence();
  await verifyManualRetryWorkItemClosureAuditRecordPlanRejectsMismatchedTrustedClosurePersistence();
  await verifyManualRetryWorkItemClosureAuditRecordPlanPreflightAcceptsCurrentPlan();
  await verifyManualRetryWorkItemClosureAuditRecordPlanPreflightRejectsMismatchedPlan();
  await verifyManualRetryWorkItemClosureAuditRecordPlanPreflightRejectsUntrustedClosurePersistence();
  await verifyManualRetryWorkItemClosureAuditRecordPlanPreflightRejectsContaminatedPlan();
  await verifyManualRetryWorkItemClosureAuditRecordPersistenceStoresRedactedRecord();
  await verifyManualRetryWorkItemClosureAuditRecordPersistenceRejectsMissingStoreAndMismatchedPlan();
  await verifyManualRetryWorkItemClosureAuditRecordPersistenceRejectsTamperedJournalAndAppendFailedRecord();
  await verifyManualRetryLedgerEntryPlanAcceptsTrustedAuditRecord();
  await verifyManualRetryLedgerEntryPlanRejectsCopiedAuditRecord();
  await verifyManualRetryLedgerEntryPlanRejectsContaminatedAuditRecord();
  await verifyManualRetryLedgerEntryPersistenceStoresRedactedEntry();
  await verifyManualRetryLedgerEntryPersistenceRejectsMissingStoreAndCopiedPlan();
  await verifyManualRetryLedgerEntryPersistenceRejectsTamperedJournalAndAppendFailedEntry();
  await verifyManualRetryLedgerEntryPreflightAcceptsTrustedEntry();
  await verifyManualRetryLedgerEntryPreflightRejectsCopiedOrTamperedEntry();
  await verifyManualRetryLedgerEntryPreflightRejectsAppendFailedCapturedEntry();
  await verifyManualRetryControlReadinessPlanAcceptsTrustedPreflight();
  await verifyManualRetryControlReadinessPlanRejectsUntrustedEntry();
  await verifyManualRetryControlReadinessPlanRejectsContaminatedEntry();
  await verifyManualRetryControlReadinessPlanRejectsAppendFailedEntry();
  await verifyManualRetryControlReadinessPlanPreflightAcceptsSuppliedCurrentPlan();
  await verifyManualRetryControlReadinessPlanPreflightRejectsMismatchedPlan();
  await verifyManualRetryControlReadinessPlanPreflightRejectsContaminatedPlan();
  await verifyManualRetryControlReadinessPlanPreflightRejectsUntrustedLedgerEntry();
  await verifyManualRetryControlReadinessPlanPreflightRejectsAppendFailedLedgerEntry();
  await verifyManualRetryControlOperatorHandoffAcceptsReadinessPreflight();
  await verifyManualRetryControlOperatorHandoffIsDeterministic();
  await verifyManualRetryControlOperatorHandoffRejectsMismatchedReadinessPlan();
  await verifyManualRetryControlOperatorHandoffRejectsContaminatedReadinessPlan();
  await verifyManualRetryControlOperatorHandoffRejectsUntrustedLedgerEntry();
  await verifyManualRetryControlOperatorHandoffRejectsAppendFailedLedgerEntry();
  await verifyManualRetryControlOperatorHandoffPreflightAcceptsCurrentHandoff();
  await verifyManualRetryControlOperatorHandoffPreflightRejectsMismatchedHandoff();
  await verifyManualRetryControlOperatorHandoffPreflightRejectsContaminatedHandoff();
  await verifyManualRetryControlOperatorHandoffPreflightRequiresSourceTruncationTruth();
  await verifyManualRetryControlOperatorHandoffPreflightRejectsUntrustedLedgerEntry();
  await verifyManualRetryControlOperatorHandoffPreflightRejectsAppendFailedLedgerEntry();
  await verifyManualRetryControlWorkerSelectionAcceptsOperatorHandoffPreflight();
  await verifyManualRetryControlWorkerSelectionIsDeterministic();
  await verifyManualRetryControlWorkerSelectionRejectsMismatchedHandoff();
  await verifyManualRetryControlWorkerSelectionPreflightAcceptsCurrentSelection();
  await verifyManualRetryControlWorkerSelectionPreflightRejectsProvenanceTampering();
  await verifyManualRetryControlWorkerSelectionPreflightRejectsContaminatedSelection();
  await verifyManualRetryControlWorkerHandlerReadinessAcceptsSelectionPreflight();
  await verifyManualRetryControlWorkerHandlerReadinessIsDeterministic();
  await verifyManualRetryControlWorkerHandlerReadinessRejectsMismatchedSelection();
  await verifyManualRetryControlWorkerHandlerReadinessRejectsMissingOrUnbrandedHandler();
  await verifyManualRetryControlWorkerHandlerReadinessPreflightAcceptsCurrentReadiness();
  await verifyManualRetryControlWorkerHandlerReadinessPreflightRejectsProvenanceTampering();
  await verifyManualRetryControlWorkerHandlerReadinessPreflightRejectsContaminatedReadiness();
  console.log(`\n${"=".repeat(60)}\n  RESULTS: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 188: external media transfer manual retry control worker handler readiness is GREEN.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}


