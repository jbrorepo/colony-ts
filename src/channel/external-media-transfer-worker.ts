import type {
  ExternalChannelMediaFileRef,
  ExternalChannelMediaTransferForegroundRetryFileOutcome,
  ExternalChannelMediaTransferForegroundRetryMetadata,
  ExternalChannelMediaTransferHandler,
  ExternalChannelMediaTransferHandlerResult,
  ExternalChannelMediaTransferHostAction,
  ExternalChannelMediaTransferManualReinvokeWorkerHandler,
  ExternalChannelMediaTransferManualRetrySafetyMetadata,
} from "./external-media-transfer";

export interface ExternalChannelMediaTransferSourceResolveRequest {
  channelId: string;
  transferKey: string;
  fileIndex: number;
  fileCount: number;
  attemptNumber: number;
  maxAttemptCount: number;
  retryAttemptCount: number;
  isRetryAttempt: boolean;
  previousAttemptFailureKind?: "rejected" | "timeout";
  previousAttemptWasRetryable?: boolean;
  previousRetryAfterSeconds?: number;
  sourceRef: string;
  sourceRefFingerprint: string;
  name?: string;
  title?: string;
  mimeType?: string;
  sizeBytes?: number;
  checksumSha256?: string;
  abortSignal?: AbortSignal;
}

export interface ExternalChannelMediaTransferResolvedFile {
  sourceRefFingerprint: string;
  name?: string;
  title?: string;
  mimeType?: string;
  sizeBytes?: number;
  checksumSha256?: string;
  hostHandle?: unknown;
}

export interface ExternalChannelMediaTransferSourceResolveFailure {
  accepted: false;
  retryable?: boolean;
  retryAfterSeconds?: number;
  reason?: string;
}

export interface ExternalChannelMediaTransferVendorSendRequest {
  channelId: string;
  transferKey: string;
  targetKind: "direct" | "group" | "channel";
  targetCorrelationFingerprint: string;
  targetContextTruth: "request_only_from_approval_bound_target_no_raw_target_ids";
  rawTargetIdsPersisted: false;
  fileCount: number;
  attemptNumber: 1;
  maxAttemptCount: 1;
  retryAttemptCount: 0;
  isRetryAttempt: false;
  retryPolicy: "single_foreground_attempt_manual_reinvoke_after_vendor_state_check";
  foregroundTimeoutEnabled: boolean;
  abortSignal?: AbortSignal;
}

export type ExternalChannelMediaTransferSourceResolver = (
  request: ExternalChannelMediaTransferSourceResolveRequest,
) => Promise<ExternalChannelMediaTransferResolvedFile | ExternalChannelMediaTransferSourceResolveFailure | null | false>;

export type ExternalChannelMediaTransferVendorSender = (
  action: ExternalChannelMediaTransferHostAction,
  resolvedFiles: ExternalChannelMediaTransferResolvedFile[],
  request?: ExternalChannelMediaTransferVendorSendRequest,
) => Promise<ExternalChannelMediaTransferHandlerResult>;

export interface ExternalChannelMediaTransferWorkerOptions {
  resolveSourceRef?: ExternalChannelMediaTransferSourceResolver | null;
  sendToVendor?: ExternalChannelMediaTransferVendorSender | null;
  maxFiles?: number;
  maxResolvedSizeBytes?: number;
  sourceResolveMaxAttempts?: number;
  sourceResolveRetryDelayMs?: number;
  sourceResolveTimeoutMs?: number;
  sourceResolveTimeoutRetryAfterSeconds?: number;
  vendorSendTimeoutMs?: number;
  vendorSendTimeoutRetryAfterSeconds?: number;
}

const DEFAULT_MAX_FILES = 5;
const DEFAULT_MAX_RESOLVED_SIZE_BYTES = 100 * 1024 * 1024;
const MAX_SOURCE_RESOLVE_ATTEMPTS = 2;
const MAX_SOURCE_RESOLVE_RETRY_DELAY_MS = 30 * 1000;
const MAX_SOURCE_RESOLVE_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_VENDOR_SEND_TIMEOUT_MS = 5 * 60 * 1000;
const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/;
const FORBIDDEN_RESOLVED_KEYS = new Set([
  "base64",
  "bytes",
  "content",
  "contentbytes",
  "data",
  "downloadurl",
  "path",
  "permalink",
  "raw",
  "thumb",
  "thumbnail",
  "url",
  "urlprivate",
]);
const SECRET_KEY_PATTERN = /(token|secret|authorization|password|credential|signature|api[_-]?key)/i;
const MANUAL_REINVOKE_WORKER_HANDLERS = new WeakSet<ExternalChannelMediaTransferHandler>();
const MANUAL_REINVOKE_WORKER_HANDLERS_WITH_CAPABILITIES =
  new WeakSet<ExternalChannelMediaTransferHandler>();

export function isExternalChannelMediaTransferManualReinvokeWorkerHandler(
  handler: ExternalChannelMediaTransferHandler | null | undefined,
): handler is ExternalChannelMediaTransferManualReinvokeWorkerHandler {
  return typeof handler === "function" && MANUAL_REINVOKE_WORKER_HANDLERS.has(handler);
}

export function isExternalChannelMediaTransferManualReinvokeWorkerHandlerWithCapabilities(
  handler: ExternalChannelMediaTransferHandler | null | undefined,
): handler is ExternalChannelMediaTransferManualReinvokeWorkerHandler {
  return (
    isExternalChannelMediaTransferManualReinvokeWorkerHandler(handler) &&
    MANUAL_REINVOKE_WORKER_HANDLERS_WITH_CAPABILITIES.has(handler)
  );
}

export function createExternalChannelMediaTransferWorkerHandler(
  options: ExternalChannelMediaTransferWorkerOptions = {},
): ExternalChannelMediaTransferManualReinvokeWorkerHandler {
  const handler: ExternalChannelMediaTransferHandler = async (action) => {
    if (typeof options.sendToVendor !== "function") {
      return workerRejected("host media transfer worker sender is required");
    }
    if (typeof options.resolveSourceRef !== "function") {
      return workerRejected("host media transfer worker source resolver is required");
    }

    const maxFiles = boundedPositiveInteger(options.maxFiles, DEFAULT_MAX_FILES, DEFAULT_MAX_FILES);
    if (action.files.length > maxFiles) {
      return workerRejected("host media transfer worker file count exceeds configured foreground bound");
    }

    const maxResolvedSizeBytes = boundedPositiveInteger(
      options.maxResolvedSizeBytes,
      DEFAULT_MAX_RESOLVED_SIZE_BYTES,
      DEFAULT_MAX_RESOLVED_SIZE_BYTES,
    );
    const sourceResolveTimeoutMs = boundedOptionalPositiveInteger(
      options.sourceResolveTimeoutMs,
      MAX_SOURCE_RESOLVE_TIMEOUT_MS,
    );
    const sourceResolveTimeoutRetryAfterSeconds = boundedOptionalPositiveInteger(
      options.sourceResolveTimeoutRetryAfterSeconds,
      3600,
    );
    const sourceResolveMaxAttempts = boundedPositiveInteger(
      options.sourceResolveMaxAttempts,
      1,
      MAX_SOURCE_RESOLVE_ATTEMPTS,
    );
    const sourceResolveRetryDelayMs = boundedOptionalPositiveInteger(
      options.sourceResolveRetryDelayMs,
      MAX_SOURCE_RESOLVE_RETRY_DELAY_MS,
    );
    const vendorSendTimeoutMs = boundedOptionalPositiveInteger(
      options.vendorSendTimeoutMs,
      MAX_VENDOR_SEND_TIMEOUT_MS,
    );
    const vendorSendTimeoutRetryAfterSeconds = boundedOptionalPositiveInteger(
      options.vendorSendTimeoutRetryAfterSeconds,
      3600,
    );
    const resolvedFiles: ExternalChannelMediaTransferResolvedFile[] = [];
    const sourceFileOutcomes: ExternalChannelMediaTransferForegroundRetryFileOutcome[] = [];
    let sourceResolveRetryAttemptCount = 0;
    for (let index = 0; index < action.files.length; index++) {
      const file = action.files[index];
      if (!file) continue;
      const resolved = await resolveOneFile(
        options.resolveSourceRef,
        action,
        file,
        index,
        maxResolvedSizeBytes,
        sourceResolveTimeoutMs,
        sourceResolveTimeoutRetryAfterSeconds,
        sourceResolveMaxAttempts,
        sourceResolveRetryDelayMs,
      );
      sourceResolveRetryAttemptCount += resolved.retryAttemptCount;
      if (!resolved.accepted) {
        const outcome = sourceResolveRetryFileOutcome(file, index, sourceResolveMaxAttempts, "exhausted", resolved);
        if (outcome) sourceFileOutcomes.push(outcome);
        return workerRejected(
          resolved.reason ?? "host media transfer worker source resolution rejected",
          resolved.retryable,
          resolved.retryAfterSeconds,
          sourceResolveRetryAttemptCount > 0
            ? sourceResolveForegroundRetryMetadata(
                sourceResolveRetryAttemptCount,
                sourceResolveMaxAttempts,
                action.fileCount,
                "exhausted",
                sourceFileOutcomes,
              )
            : undefined,
          resolved.retryable === true ? sourceResolveManualRetrySafetyMetadata() : undefined,
        );
      }
      const outcome = sourceResolveRetryFileOutcome(file, index, sourceResolveMaxAttempts, "recovered", resolved);
      if (outcome) sourceFileOutcomes.push(outcome);
      resolvedFiles.push(resolved.file);
    }

    const sendResult = await sendWithOptionalTimeout(
      options.sendToVendor,
      action,
      resolvedFiles,
      vendorSendTimeoutMs,
      vendorSendTimeoutRetryAfterSeconds,
    );
    if (sourceResolveRetryAttemptCount <= 0) return sendResult;
    return withSourceResolveForegroundRetryMetadata(
      sendResult,
      sourceResolveRetryAttemptCount,
      sourceResolveMaxAttempts,
      action.fileCount,
      "recovered",
      sourceFileOutcomes,
    );
  };
  Object.defineProperty(handler, "manualReinvokeExecutionHandlerTruth", {
    value: "foreground_worker_handler_resolves_sources_freshly_before_vendor_send",
    enumerable: false,
  });
  MANUAL_REINVOKE_WORKER_HANDLERS.add(handler);
  if (typeof options.resolveSourceRef === "function" && typeof options.sendToVendor === "function") {
    MANUAL_REINVOKE_WORKER_HANDLERS_WITH_CAPABILITIES.add(handler);
  }
  return handler as ExternalChannelMediaTransferManualReinvokeWorkerHandler;
}

async function resolveOneFile(
  resolver: ExternalChannelMediaTransferSourceResolver,
  action: ExternalChannelMediaTransferHostAction,
  file: ExternalChannelMediaFileRef,
  fileIndex: number,
  maxResolvedSizeBytes: number,
  sourceResolveTimeoutMs: number | undefined,
  sourceResolveTimeoutRetryAfterSeconds: number | undefined,
  maxAttempts: number,
  retryDelayMs: number | undefined,
): Promise<
  | { accepted: true; file: ExternalChannelMediaTransferResolvedFile; retryAttemptCount: number; lastFailureKind?: "rejected" | "timeout"; lastRetryAfterSeconds?: number }
  | { accepted: false; failureKind?: "rejected" | "timeout"; retryable?: boolean; retryAfterSeconds?: number; reason?: string; retryAttemptCount: number }
> {
  let lastRejected: { accepted: false; failureKind?: "rejected" | "timeout"; retryable?: boolean; retryAfterSeconds?: number; reason?: string; retryAttemptCount: number } | undefined;
  let previousFailure: SourceResolvePreviousFailureContext | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await resolveOneFileAttempt(
      resolver,
      action,
      file,
      fileIndex,
      attempt,
      maxAttempts,
      maxResolvedSizeBytes,
      sourceResolveTimeoutMs,
      sourceResolveTimeoutRetryAfterSeconds,
      previousFailure,
    );
    if (result.accepted) {
      return {
        ...result,
        retryAttemptCount: attempt - 1,
        ...(previousFailure ? {
          lastFailureKind: previousFailure.kind,
          ...(previousFailure.retryAfterSeconds !== undefined ? { lastRetryAfterSeconds: previousFailure.retryAfterSeconds } : {}),
        } : {}),
      };
    }
    lastRejected = {
      ...result,
      retryAttemptCount: attempt - 1,
    };
    previousFailure = {
      kind: result.failureKind ?? "rejected",
      retryable: result.retryable === true,
      retryAfterSeconds: result.retryAfterSeconds,
    };
    if (result.retryable !== true || attempt >= maxAttempts) break;
    if (retryDelayMs !== undefined) {
      await delay(retryDelayMs);
    }
  }
  return lastRejected ?? { accepted: false, reason: "host media transfer worker source resolution rejected", retryAttemptCount: 0 };
}

async function resolveOneFileAttempt(
  resolver: ExternalChannelMediaTransferSourceResolver,
  action: ExternalChannelMediaTransferHostAction,
  file: ExternalChannelMediaFileRef,
  fileIndex: number,
  attemptNumber: number,
  maxAttemptCount: number,
  maxResolvedSizeBytes: number,
  sourceResolveTimeoutMs: number | undefined,
  sourceResolveTimeoutRetryAfterSeconds: number | undefined,
  previousFailure: SourceResolvePreviousFailureContext | undefined,
): Promise<
  | { accepted: true; file: ExternalChannelMediaTransferResolvedFile }
  | { accepted: false; failureKind?: "rejected" | "timeout"; retryable?: boolean; retryAfterSeconds?: number; reason?: string }
> {
  if (typeof file.sourceRefFingerprint !== "string" || !CHECKSUM_PATTERN.test(file.sourceRefFingerprint)) {
    return { accepted: false, reason: "host media transfer worker source-ref fingerprint is missing or malformed" };
  }
  const request: ExternalChannelMediaTransferSourceResolveRequest = {
    channelId: action.channelId,
    transferKey: action.transferKey,
    fileIndex,
    fileCount: action.files.length,
    attemptNumber,
    maxAttemptCount,
    retryAttemptCount: Math.max(0, attemptNumber - 1),
    isRetryAttempt: attemptNumber > 1,
    ...(previousFailure ? {
      previousAttemptFailureKind: previousFailure.kind,
      previousAttemptWasRetryable: previousFailure.retryable,
      ...(previousFailure.retryAfterSeconds !== undefined ? { previousRetryAfterSeconds: previousFailure.retryAfterSeconds } : {}),
    } : {}),
    sourceRef: file.sourceRef,
    sourceRefFingerprint: file.sourceRefFingerprint,
    ...(file.name ? { name: file.name } : {}),
    ...(file.title ? { title: file.title } : {}),
    ...(file.mimeType ? { mimeType: file.mimeType } : {}),
    ...(file.sizeBytes !== undefined ? { sizeBytes: file.sizeBytes } : {}),
    ...(file.checksumSha256 ? { checksumSha256: file.checksumSha256 } : {}),
  };
  const controller = sourceResolveTimeoutMs === undefined ? undefined : new AbortController();
  if (controller) request.abortSignal = controller.signal;
  const outcome = await resolveWithOptionalTimeout(resolver, request, controller, sourceResolveTimeoutMs);
  if (outcome.kind === "timeout") {
    return {
      accepted: false,
      failureKind: "timeout",
      retryable: true,
      retryAfterSeconds: boundedRetryAfterSeconds(sourceResolveTimeoutRetryAfterSeconds),
      reason: "host media transfer worker source resolver timed out inside the bounded foreground window",
    };
  }
  if (outcome.kind === "threw") {
    return { accepted: false, failureKind: "rejected", reason: "host media transfer worker source resolver threw before a bounded result was available" };
  }
  const resolved = outcome.value;
  if (!resolved || !isRecord(resolved)) {
    return { accepted: false, failureKind: "rejected", reason: "host media transfer worker source resolver rejected the source ref" };
  }
  if (resolved.accepted === false) {
    const failure = resolved as ExternalChannelMediaTransferSourceResolveFailure;
    return {
      accepted: false,
      failureKind: "rejected",
      retryable: failure.retryable === true,
      retryAfterSeconds: boundedRetryAfterSeconds(failure.retryAfterSeconds),
      reason: failure.reason ?? "host media transfer worker source resolver rejected the source ref",
    };
  }
  const resolvedFile = resolved as ExternalChannelMediaTransferResolvedFile;
  for (const key of Object.keys(resolved)) {
    if (isForbiddenResolvedKey(key) || SECRET_KEY_PATTERN.test(key)) {
      return { accepted: false, reason: "host media transfer worker resolved files must not expose URLs, paths, credentials, or inline bytes" };
    }
  }
  if (resolvedFile.sourceRefFingerprint !== file.sourceRefFingerprint) {
    return { accepted: false, reason: "host media transfer worker resolved fingerprint did not match the approved source ref" };
  }
  const sizeBytes = resolvedFile.sizeBytes === undefined ? file.sizeBytes : Number(resolvedFile.sizeBytes);
  if (sizeBytes !== undefined && (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || sizeBytes > maxResolvedSizeBytes)) {
    return { accepted: false, reason: "host media transfer worker resolved file size is out of bounds" };
  }
  const checksumSha256 = typeof resolvedFile.checksumSha256 === "string"
    ? resolvedFile.checksumSha256.trim().toLowerCase()
    : file.checksumSha256;
  if (checksumSha256 !== undefined && !CHECKSUM_PATTERN.test(checksumSha256)) {
    return { accepted: false, reason: "host media transfer worker resolved checksum is malformed" };
  }
  if (file.checksumSha256 && checksumSha256 && checksumSha256 !== file.checksumSha256) {
    return { accepted: false, reason: "host media transfer worker resolved checksum did not match approval-bound metadata" };
  }

  const safeFile: ExternalChannelMediaTransferResolvedFile = {
    sourceRefFingerprint: file.sourceRefFingerprint,
  };
  const name = resolvedFile.name ?? file.name;
  const title = resolvedFile.title ?? file.title;
  const mimeType = resolvedFile.mimeType ?? file.mimeType;
  if (name) safeFile.name = name;
  if (title) safeFile.title = title;
  if (mimeType) safeFile.mimeType = mimeType;
  if (sizeBytes !== undefined) safeFile.sizeBytes = sizeBytes;
  if (checksumSha256) safeFile.checksumSha256 = checksumSha256;
  if ("hostHandle" in resolvedFile) safeFile.hostHandle = resolvedFile.hostHandle;

  return { accepted: true, file: safeFile };
}

function workerRejected(
  reason: string,
  retryable = false,
  retryAfterSeconds?: number,
  foregroundRetry?: ExternalChannelMediaTransferForegroundRetryMetadata,
  manualRetrySafety?: ExternalChannelMediaTransferManualRetrySafetyMetadata,
): ExternalChannelMediaTransferHandlerResult {
  return {
    accepted: false,
    retryable,
    ...(retryable && retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    ...(foregroundRetry ? { foregroundRetry } : {}),
    ...(manualRetrySafety ? { manualRetrySafety } : {}),
    reason,
  };
}

function withSourceResolveForegroundRetryMetadata(
  result: ExternalChannelMediaTransferHandlerResult,
  retryAttemptCount: number,
  maxAttemptCount: number,
  fileCount: number,
  retryStatus: "recovered" | "exhausted",
  sourceFileOutcomes?: ExternalChannelMediaTransferForegroundRetryFileOutcome[],
): ExternalChannelMediaTransferHandlerResult {
  return {
    ...result,
    foregroundRetry: sourceResolveForegroundRetryMetadata(
      retryAttemptCount,
      maxAttemptCount,
      fileCount,
      retryStatus,
      sourceFileOutcomes,
    ),
  };
}

function sourceResolveForegroundRetryMetadata(
  retryAttemptCount: number,
  maxAttemptCount: number,
  fileCount: number,
  retryStatus: "recovered" | "exhausted",
  sourceFileOutcomes?: ExternalChannelMediaTransferForegroundRetryFileOutcome[],
): ExternalChannelMediaTransferForegroundRetryMetadata {
  return {
    automaticRetryMode: "bounded_foreground_retry",
    retryStage: "source_resolution",
    retryStatus,
    retryAttemptCount,
    maxAttemptCount,
    fileCount,
    ...(sourceFileOutcomes && sourceFileOutcomes.length > 0 ? { sourceFileOutcomes } : {}),
    retryWorkerCreated: false,
    retryScheduleCreated: false,
    metadataTruth: "host_reported_retry_metadata",
  };
}

function sourceResolveManualRetrySafetyMetadata(): ExternalChannelMediaTransferManualRetrySafetyMetadata {
  return {
    retryStage: "source_resolution",
    sourceResolveCompleted: false,
    vendorSendAttempted: false,
    operatorMustVerifyVendorState: false,
    automaticVendorRetryAllowed: false,
    metadataTruth: "host_reported_retry_safety_context",
  };
}

function vendorSendManualRetrySafetyMetadata(): ExternalChannelMediaTransferManualRetrySafetyMetadata {
  return {
    retryStage: "vendor_send",
    sourceResolveCompleted: true,
    vendorSendAttempted: true,
    operatorMustVerifyVendorState: true,
    automaticVendorRetryAllowed: false,
    metadataTruth: "host_reported_retry_safety_context",
  };
}

function withVendorSendManualRetrySafety(
  result: ExternalChannelMediaTransferHandlerResult,
): ExternalChannelMediaTransferHandlerResult {
  if (!result || result.accepted !== false || result.retryable !== true) return result;
  return {
    ...result,
    manualRetrySafety: vendorSendManualRetrySafetyMetadata(),
  };
}

function sourceResolveRetryFileOutcome(
  file: ExternalChannelMediaFileRef,
  fileIndex: number,
  maxAttemptCount: number,
  retryStatus: "recovered" | "exhausted",
  result: {
    retryAttemptCount: number;
    failureKind?: "rejected" | "timeout";
    retryAfterSeconds?: number;
    lastFailureKind?: "rejected" | "timeout";
    lastRetryAfterSeconds?: number;
  },
): ExternalChannelMediaTransferForegroundRetryFileOutcome | undefined {
  if (result.retryAttemptCount <= 0) return undefined;
  if (typeof file.sourceRefFingerprint !== "string" || !CHECKSUM_PATTERN.test(file.sourceRefFingerprint)) {
    return undefined;
  }
  const lastFailureKind = result.lastFailureKind ?? result.failureKind;
  const lastRetryAfterSeconds = result.lastRetryAfterSeconds ?? result.retryAfterSeconds;
  return {
    fileIndex,
    sourceRefFingerprint: file.sourceRefFingerprint,
    retryStatus,
    retryAttemptCount: result.retryAttemptCount,
    maxAttemptCount,
    ...(lastFailureKind ? { lastFailureKind } : {}),
    ...(lastRetryAfterSeconds !== undefined ? { lastRetryAfterSeconds } : {}),
  };
}

function boundedPositiveInteger(value: unknown, fallback: number, max: number): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) return fallback;
  return Math.min(Number(value), max);
}

function boundedOptionalPositiveInteger(value: unknown, max: number): number | undefined {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) return undefined;
  return Math.min(Number(value), max);
}

interface SourceResolvePreviousFailureContext {
  kind: "rejected" | "timeout";
  retryable: boolean;
  retryAfterSeconds?: number;
}

function boundedRetryAfterSeconds(value: unknown): number | undefined {
  if (!Number.isSafeInteger(value) || Number(value) < 0) return undefined;
  return Math.min(Number(value), 3600);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveWithOptionalTimeout(
  resolver: ExternalChannelMediaTransferSourceResolver,
  request: ExternalChannelMediaTransferSourceResolveRequest,
  controller: AbortController | undefined,
  timeoutMs: number | undefined,
): Promise<
  | { kind: "result"; value: ExternalChannelMediaTransferResolvedFile | ExternalChannelMediaTransferSourceResolveFailure | null | false }
  | { kind: "threw" }
  | { kind: "timeout" }
> {
  const resolved = Promise.resolve()
    .then(() => resolver(request))
    .then(
      (value) => ({ kind: "result" as const, value }),
      () => ({ kind: "threw" as const }),
    );
  if (timeoutMs === undefined) {
    return resolved;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolved,
      new Promise<{ kind: "timeout" }>((resolve) => {
        timer = setTimeout(() => {
          controller?.abort();
          resolve({ kind: "timeout" });
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function sendWithOptionalTimeout(
  sender: ExternalChannelMediaTransferVendorSender,
  action: ExternalChannelMediaTransferHostAction,
  resolvedFiles: ExternalChannelMediaTransferResolvedFile[],
  timeoutMs: number | undefined,
  timeoutRetryAfterSeconds: number | undefined,
): Promise<ExternalChannelMediaTransferHandlerResult> {
  const controller = timeoutMs === undefined ? undefined : new AbortController();
  const request = await createVendorSendRequest(action, resolvedFiles, controller);
  if (timeoutMs === undefined || controller === undefined) {
    return withVendorSendManualRetrySafety(await sender(action, resolvedFiles, request));
  }
  const timeoutController = controller;

  const sent = Promise.resolve()
    .then(() => sender(action, resolvedFiles, request))
    .then(
      (value) => ({ kind: "result" as const, value }),
      () => ({ kind: "threw" as const }),
    );

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const outcome = await Promise.race([
      sent,
      new Promise<{ kind: "timeout" }>((resolve) => {
        timer = setTimeout(() => {
          timeoutController.abort();
          resolve({ kind: "timeout" });
        }, timeoutMs);
      }),
    ]);
    if (outcome.kind === "timeout") {
      return workerRejected(
        "host media transfer worker vendor sender timed out inside the bounded foreground window; host must verify vendor state before reinvoking",
        true,
        timeoutRetryAfterSeconds,
        undefined,
        vendorSendManualRetrySafetyMetadata(),
      );
    }
    if (outcome.kind === "threw") {
      return workerRejected("host media transfer worker vendor sender threw before a bounded result was available");
    }
    return withVendorSendManualRetrySafety(outcome.value);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function createVendorSendRequest(
  action: ExternalChannelMediaTransferHostAction,
  resolvedFiles: ExternalChannelMediaTransferResolvedFile[],
  controller: AbortController | undefined,
): Promise<ExternalChannelMediaTransferVendorSendRequest> {
  return {
    channelId: action.channelId,
    transferKey: action.transferKey,
    targetKind: action.targetKind,
    targetCorrelationFingerprint: `vendor-send-target:${await vendorSendTargetCorrelationFingerprint(action)}`,
    targetContextTruth: "request_only_from_approval_bound_target_no_raw_target_ids",
    rawTargetIdsPersisted: false,
    fileCount: resolvedFiles.length,
    attemptNumber: 1,
    maxAttemptCount: 1,
    retryAttemptCount: 0,
    isRetryAttempt: false,
    retryPolicy: "single_foreground_attempt_manual_reinvoke_after_vendor_state_check",
    foregroundTimeoutEnabled: controller !== undefined,
    ...(controller ? { abortSignal: controller.signal } : {}),
  };
}

async function vendorSendTargetCorrelationFingerprint(
  action: ExternalChannelMediaTransferHostAction,
): Promise<string> {
  return sha256Hex(stableJson({
    kind: "external_media_transfer_vendor_send_target_context_v1",
    channelId: action.channelId,
    workspaceId: action.workspaceId ?? "",
    accountId: action.accountId ?? "",
    targetKind: action.targetKind,
    targetId: action.targetId,
    threadId: action.threadId ?? "",
  }));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isForbiddenResolvedKey(key: string): boolean {
  return FORBIDDEN_RESOLVED_KEYS.has(key.replace(/[^A-Za-z0-9]/g, "").toLowerCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
