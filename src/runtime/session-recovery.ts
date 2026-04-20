/**
 * Session recovery - persisted checkpoint + transcript resume.
 *
 * This ports the Python recovery shape into a Bun-native single-agent slice:
 * every persisted session writes an atomic checkpoint plus a JSONL transcript
 * under the Colony data directory, and `/resume` hydrates from that state.
 */

import { mkdir, readdir, rename, rm } from "fs/promises";
import { join } from "path";

import { Caste } from "../caste/enums";
import { getDataPath, settings } from "../settings";
import type { CompactionResult, CompactionStrategy, ContextWindowSnapshot } from "./compaction";
import type { SerializedMessage } from "./message";
import type { AgentSession } from "./session";
import { rehydrateSession } from "./session";

export type SessionInterruptionState = "none" | "interrupted_prompt" | "interrupted_turn";

export interface SessionUsageSnapshot {
  tokensUsed: number;
  costUsd: number;
  callCount: number;
  deniedCount: number;
  maxUsd: number;
  maxTokens: number;
}

export interface SessionProviderHealthSnapshot {
  state?: string;
  failureCount?: number;
}

export interface SessionFailoverSnapshot {
  fromProvider: string;
  fromModel: string;
  toProvider: string;
  toModel: string;
  errorType: string;
  errorMessage: string;
  timestamp: number;
}

export interface SessionHookEventSnapshot {
  kind: string;
  detail?: string;
  timestamp: number;
  durationMs?: number;
}

export interface SessionCompactionEventSnapshot {
  strategy: CompactionStrategy;
  trigger: string;
  timestamp: number;
  durationMs?: number;
  compacted: boolean;
  originalCount: number;
  finalCount: number;
  tokensSavedEstimate: number;
  summaryLineCount: number;
  summarizedMessageCount: number;
  failureMessage?: string;
}

export interface SessionCompactionHandoffSnapshot {
  status: "ok" | "failed";
  strategy: CompactionStrategy;
  trigger: string;
  timestamp: number;
  loggedCount: number;
  structuredCount: number;
  artifactId?: string;
  artifactChars?: number;
  errorMessage?: string;
}

export interface SessionRecoverySnapshot {
  version: 1;
  savedAt: string;
  session: AgentSession;
  costTrackerSnapshot: Record<string, unknown> | null;
  usage: SessionUsageSnapshot;
  sessionAllowRules: string[];
  contextUsage: ContextWindowSnapshot | null;
  providerHealth: Record<string, SessionProviderHealthSnapshot>;
  recentFailovers: SessionFailoverSnapshot[];
  recentHookEvents: SessionHookEventSnapshot[];
  recentCompactions: SessionCompactionEventSnapshot[];
  latestCompactionHandoff: SessionCompactionHandoffSnapshot | null;
  lastCompactionFailure: { strategy: CompactionStrategy; message: string } | null;
  lastCompaction: CompactionResult | null;
}

export interface SessionRecoveryPaths {
  sessionDir: string;
  transcriptDir: string;
  transcriptFile: string;
  checkpointFile: string;
}

export interface PersistedSessionSummary {
  sessionId: string;
  agentId: string;
  caste: string;
  provider?: string;
  model?: string;
  savedAt: string;
  lastMessageAt: string;
  messageCount: number;
  tokensUsed: number;
  costUsd: number;
  interruption: SessionInterruptionState;
  hasCheckpoint: boolean;
  previewText: string;
  previewRole: string;
}

export interface SessionHistoryExcerptEntry {
  sequence: number;
  role: "user" | "assistant" | "system" | "tool";
  timestamp: string;
  previewText: string;
  toolName?: string;
  isError?: boolean;
}

export interface SessionHistoryExcerpt {
  sessionId: string;
  agentId: string;
  caste: string;
  provider?: string;
  model?: string;
  savedAt: string;
  lastMessageAt: string;
  totalMessages: number;
  interruption: SessionInterruptionState;
  hasCheckpoint: boolean;
  entries: SessionHistoryExcerptEntry[];
}

export function createSessionRecoverySnapshot(input: {
  session: AgentSession;
  costTrackerSnapshot?: Record<string, unknown> | null;
  usage?: Partial<SessionUsageSnapshot>;
  sessionAllowRules?: string[];
  contextUsage?: ContextWindowSnapshot | null;
  providerHealth?: Record<string, SessionProviderHealthSnapshot>;
  recentFailovers?: SessionFailoverSnapshot[];
  recentHookEvents?: SessionHookEventSnapshot[];
  recentCompactions?: SessionCompactionEventSnapshot[];
  latestCompactionHandoff?: SessionCompactionHandoffSnapshot | null;
  lastCompactionFailure?: { strategy: CompactionStrategy; message: string } | null;
  lastCompaction?: CompactionResult | null;
  savedAt?: string;
}): SessionRecoverySnapshot {
  return {
    version: 1,
    savedAt: input.savedAt ?? new Date().toISOString(),
    session: rehydrateSession(input.session),
    costTrackerSnapshot: isRecord(input.costTrackerSnapshot) ? { ...input.costTrackerSnapshot } : null,
    usage: normalizeUsageSnapshot(input.usage ?? {}),
    sessionAllowRules: normalizeStringArray(input.sessionAllowRules),
    contextUsage: normalizeContextSnapshot(input.contextUsage),
    providerHealth: normalizeProviderHealth(input.providerHealth),
    recentFailovers: normalizeRecentFailovers(input.recentFailovers),
    recentHookEvents: normalizeRecentHookEvents(input.recentHookEvents),
    recentCompactions: normalizeRecentCompactionEvents(input.recentCompactions),
    latestCompactionHandoff: normalizeCompactionHandoff(input.latestCompactionHandoff),
    lastCompactionFailure: normalizeCompactionFailure(input.lastCompactionFailure),
    lastCompaction: normalizeCompactionResult(input.lastCompaction),
  };
}

export function sessionRecoveryPaths(
  sessionId: string,
  agentId: string,
  dataDir = getDataPath(settings),
): SessionRecoveryPaths {
  const safeSessionId = safeId(sessionId);
  const safeAgentId = safeId(agentId);
  const sessionDir = join(dataDir, "sessions", safeSessionId);
  const transcriptDir = join(sessionDir, "transcripts");
  return {
    sessionDir,
    transcriptDir,
    transcriptFile: join(transcriptDir, `${safeAgentId}.jsonl`),
    checkpointFile: join(sessionDir, "checkpoint.json"),
  };
}

export async function persistSessionRecovery(
  snapshot: SessionRecoverySnapshot,
  opts: { dataDir?: string } = {},
): Promise<void> {
  const paths = sessionRecoveryPaths(
    snapshot.session.sessionId,
    snapshot.session.agentId,
    opts.dataDir,
  );
  await mkdir(paths.transcriptDir, { recursive: true });

  const transcriptText = snapshot.session.history
    .map((message) => JSON.stringify(message))
    .join("\n");

  await writeTextAtomic(
    paths.transcriptFile,
    transcriptText.length > 0 ? `${transcriptText}\n` : "",
  );
  await writeTextAtomic(
    paths.checkpointFile,
    JSON.stringify(snapshot, null, 2),
  );
}

export async function loadSessionRecovery(
  sessionId: string,
  opts: {
    dataDir?: string;
    agentId?: string;
    caste?: Caste | string;
  } = {},
): Promise<SessionRecoverySnapshot | null> {
  const defaultAgentId = opts.agentId ?? "assist-ant";
  const paths = sessionRecoveryPaths(sessionId, defaultAgentId, opts.dataDir);
  const checkpointFile = Bun.file(paths.checkpointFile);

  if (await checkpointFile.exists()) {
    try {
      const raw = JSON.parse(await checkpointFile.text()) as Record<string, unknown>;
      const rawSession = isRecord(raw.session) ? raw.session : {};
      const agentId = typeof rawSession.agentId === "string" ? rawSession.agentId : defaultAgentId;
      const loadedPaths = sessionRecoveryPaths(sessionId, agentId, opts.dataDir);
      const transcriptHistory = await loadSessionTranscript(sessionId, agentId, opts.dataDir);

      return {
        version: 1,
        savedAt: typeof raw.savedAt === "string" ? raw.savedAt : new Date().toISOString(),
        session: rehydrateSession({
          ...rawSession,
          sessionId,
          agentId,
          caste: typeof rawSession.caste === "string" ? rawSession.caste : (opts.caste ?? Caste.ASSIST_ANT),
          history: transcriptHistory.length > 0
            ? transcriptHistory
            : (Array.isArray(rawSession.history) ? rawSession.history as SerializedMessage[] : []),
        }),
        costTrackerSnapshot: isRecord(raw.costTrackerSnapshot)
          ? { ...raw.costTrackerSnapshot }
          : null,
        usage: normalizeUsageSnapshot(isRecord(raw.usage) ? raw.usage : {}),
        sessionAllowRules: normalizeStringArray(raw.sessionAllowRules),
        contextUsage: normalizeContextSnapshot(raw.contextUsage),
        providerHealth: normalizeProviderHealth(raw.providerHealth),
        recentFailovers: normalizeRecentFailovers(raw.recentFailovers),
        recentHookEvents: normalizeRecentHookEvents(raw.recentHookEvents),
        recentCompactions: normalizeRecentCompactionEvents(raw.recentCompactions),
        latestCompactionHandoff: normalizeCompactionHandoff(raw.latestCompactionHandoff),
        lastCompactionFailure: normalizeCompactionFailure(raw.lastCompactionFailure),
        lastCompaction: normalizeCompactionResult(raw.lastCompaction),
      };
    } catch {
      // Fall through to transcript-only recovery.
    }
  }

  const transcriptHistory = await loadSessionTranscript(
    sessionId,
    defaultAgentId,
    opts.dataDir,
  );
  if (transcriptHistory.length === 0) return null;

  return {
    version: 1,
    savedAt: new Date().toISOString(),
    session: rehydrateSession({
      sessionId,
      agentId: defaultAgentId,
      caste: opts.caste ?? Caste.ASSIST_ANT,
      history: transcriptHistory,
    }),
    costTrackerSnapshot: null,
    usage: normalizeUsageSnapshot({}),
    sessionAllowRules: [],
    contextUsage: null,
    providerHealth: {},
    recentFailovers: [],
    recentHookEvents: [],
    recentCompactions: [],
    latestCompactionHandoff: null,
    lastCompactionFailure: null,
    lastCompaction: null,
  };
}

export async function loadSessionTranscript(
  sessionId: string,
  agentId: string,
  dataDir = getDataPath(settings),
): Promise<SerializedMessage[]> {
  const transcriptFile = Bun.file(sessionRecoveryPaths(sessionId, agentId, dataDir).transcriptFile);
  if (!(await transcriptFile.exists())) return [];

  const entries: SerializedMessage[] = [];
  const text = await transcriptFile.text();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (isSerializedMessage(parsed)) {
        entries.push(parsed);
      }
    } catch {
      // Ignore malformed lines during recovery, matching Python behavior.
    }
  }
  return entries;
}

export async function listPersistedSessions(
  opts: {
    dataDir?: string;
    agentId?: string;
    limit?: number;
  } = {},
): Promise<PersistedSessionSummary[]> {
  const dataDir = opts.dataDir ?? getDataPath(settings);
  const sessionsDir = join(dataDir, "sessions");
  let entries;

  try {
    entries = await readdir(sessionsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const summaries: PersistedSessionSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const summary = await loadPersistedSessionSummary(entry.name, dataDir);
    if (!summary) continue;
    if (opts.agentId && summary.agentId !== opts.agentId) continue;
    summaries.push(summary);
  }

  summaries.sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt));
  if (typeof opts.limit === "number" && opts.limit > 0) {
    return summaries.slice(0, opts.limit);
  }
  return summaries;
}

export function buildSessionHistoryExcerpt(
  source: {
    sessionId: string;
    agentId: string;
    caste: string;
    history: SerializedMessage[];
  },
  opts: {
    limit?: number;
    savedAt?: string;
    lastMessageAt?: string;
    provider?: string;
    model?: string;
    hasCheckpoint?: boolean;
    interruption?: SessionInterruptionState;
  } = {},
): SessionHistoryExcerpt {
  const totalMessages = source.history.length;
  const limit = normalizeHistoryLimit(opts.limit);
  const startIndex = Math.max(0, totalMessages - limit);
  const visible = source.history.slice(startIndex);

  return {
    sessionId: source.sessionId,
    agentId: source.agentId,
    caste: source.caste,
    provider: opts.provider,
    model: opts.model,
    savedAt: opts.savedAt ?? new Date().toISOString(),
    lastMessageAt: opts.lastMessageAt ?? latestHistoryTimestamp(source.history, opts.savedAt),
    totalMessages,
    interruption: opts.interruption ?? detectSessionInterruption(source.history),
    hasCheckpoint: opts.hasCheckpoint ?? true,
    entries: visible.map((message, index) => {
      const record = message as unknown as Record<string, unknown>;
      const preview = previewMessage(record);
      const role = historyRole(record);
      return {
        sequence: startIndex + index + 1,
        role,
        timestamp: typeof record.timestamp === "string" ? record.timestamp : "",
        previewText: preview.previewText || fallbackMessagePreview(role, record),
        toolName: typeof record.name === "string" ? record.name : undefined,
        isError: role === "tool" ? Boolean(record.isError) : undefined,
      };
    }),
  };
}

export async function loadPersistedSessionHistoryExcerpt(
  sessionId: string,
  opts: {
    dataDir?: string;
    agentId?: string;
    caste?: Caste | string;
    limit?: number;
  } = {},
): Promise<SessionHistoryExcerpt | null> {
  const snapshot = await loadSessionRecovery(sessionId, opts);
  if (!snapshot) return null;

  const dataDir = opts.dataDir ?? getDataPath(settings);
  const summary = await loadPersistedSessionSummary(sessionId, dataDir);
  return buildSessionHistoryExcerpt(
    {
      sessionId: snapshot.session.sessionId,
      agentId: snapshot.session.agentId,
      caste: String(snapshot.session.caste),
      history: snapshot.session.history,
    },
    {
      limit: opts.limit,
      savedAt: summary?.savedAt ?? snapshot.savedAt,
      lastMessageAt: summary?.lastMessageAt ?? latestHistoryTimestamp(snapshot.session.history, snapshot.savedAt),
      provider: summary?.provider,
      model: summary?.model,
      hasCheckpoint: summary?.hasCheckpoint ?? false,
      interruption: summary?.interruption ?? detectSessionInterruption(snapshot.session.history),
    },
  );
}

export function detectSessionInterruption(history: SerializedMessage[]): SessionInterruptionState {
  if (history.length === 0) return "none";

  const last = history.at(-1);
  if (last?.type === "user") return "interrupted_prompt";

  const requested = new Set<string>();
  const resolved = new Set<string>();

  for (const message of history) {
    if (message.type === "assistant") {
      for (const toolCall of message.toolCalls ?? []) {
        const id = typeof toolCall.id === "string" ? toolCall.id : "";
        if (id) requested.add(id);
      }
    }
    if (message.type === "tool_result" && typeof message.toolCallId === "string") {
      resolved.add(message.toolCallId);
    }
  }

  for (const id of requested) {
    if (!resolved.has(id)) return "interrupted_turn";
  }

  return "none";
}

async function writeTextAtomic(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  await Bun.write(tempPath, content);
  await rm(filePath, { force: true });
  await rename(tempPath, filePath);
}

async function loadPersistedSessionSummary(
  sessionId: string,
  dataDir: string,
): Promise<PersistedSessionSummary | null> {
  const sessionDir = join(dataDir, "sessions", safeId(sessionId));
  const checkpointPath = join(sessionDir, "checkpoint.json");
  const checkpointFile = Bun.file(checkpointPath);

  if (await checkpointFile.exists()) {
    try {
      const raw = JSON.parse(await checkpointFile.text()) as Record<string, unknown>;
      const rawSession = isRecord(raw.session) ? raw.session : {};
      const history = Array.isArray(rawSession.history)
        ? rawSession.history.filter(isSerializedMessage)
        : [];
      const usage = normalizeUsageSnapshot(isRecord(raw.usage) ? raw.usage : {});
      const savedAt = typeof raw.savedAt === "string" ? raw.savedAt : latestHistoryTimestamp(history);
      const preview = summarizeHistoryPreview(history);
      return {
        sessionId,
        agentId: typeof rawSession.agentId === "string" ? rawSession.agentId : "assist-ant",
        caste: typeof rawSession.caste === "string" ? rawSession.caste : String(Caste.ASSIST_ANT),
        provider: preview.provider,
        model: preview.model,
        savedAt,
        lastMessageAt: latestHistoryTimestamp(history, savedAt),
        messageCount: history.length,
        tokensUsed: usage.tokensUsed,
        costUsd: usage.costUsd,
        interruption: detectSessionInterruption(history),
        hasCheckpoint: true,
        previewText: preview.previewText,
        previewRole: preview.previewRole,
      };
    } catch {
      // Fall through to transcript-only summary.
    }
  }

  const transcriptDir = join(sessionDir, "transcripts");
  let transcriptFiles;
  try {
    transcriptFiles = await readdir(transcriptDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const transcriptFile = transcriptFiles.find((entry) => entry.isFile() && entry.name.endsWith(".jsonl"));
  if (!transcriptFile) return null;

  const agentId = transcriptFile.name.replace(/\.jsonl$/i, "");
  const history = await loadSessionTranscript(sessionId, agentId, dataDir);
  if (history.length === 0) return null;
  const savedAt = latestHistoryTimestamp(history);
  const preview = summarizeHistoryPreview(history);

  return {
    sessionId,
    agentId,
    caste: inferSessionCaste(history),
    provider: preview.provider,
    model: preview.model,
    savedAt,
    lastMessageAt: latestHistoryTimestamp(history, savedAt),
    messageCount: history.length,
    tokensUsed: 0,
    costUsd: 0,
    interruption: detectSessionInterruption(history),
    hasCheckpoint: false,
    previewText: preview.previewText,
    previewRole: preview.previewRole,
  };
}

function normalizeUsageSnapshot(input: Partial<SessionUsageSnapshot>): SessionUsageSnapshot {
  return {
    tokensUsed: finiteNumber(input.tokensUsed),
    costUsd: finiteNumber(input.costUsd),
    callCount: finiteNumber(input.callCount),
    deniedCount: finiteNumber(input.deniedCount),
    maxUsd: finiteNumber(input.maxUsd, 10),
    maxTokens: finiteNumber(input.maxTokens, 128_000),
  };
}

function normalizeContextSnapshot(value: unknown): ContextWindowSnapshot | null {
  if (!isRecord(value)) return null;
  return {
    usedTokens: finiteNumber(value.usedTokens),
    maxTokens: finiteNumber(value.maxTokens, 1),
    remainingTokens: finiteNumber(value.remainingTokens),
    percentUsed: finiteNumber(value.percentUsed),
    messageCount: finiteNumber(value.messageCount),
    isAboveWarningThreshold: Boolean(value.isAboveWarningThreshold),
    isAboveAutoCompactThreshold: Boolean(value.isAboveAutoCompactThreshold),
    isAtBlockingLimit: Boolean(value.isAtBlockingLimit),
    compactionFailureCount: finiteNumber(value.compactionFailureCount),
  };
}

function normalizeCompactionResult(value: unknown): CompactionResult | null {
  if (!isRecord(value)) return null;
  return {
    compacted: Boolean(value.compacted),
    originalCount: finiteNumber(value.originalCount),
    finalCount: finiteNumber(value.finalCount),
    summary: typeof value.summary === "string" ? value.summary : "",
    tokensSavedEstimate: finiteNumber(value.tokensSavedEstimate),
    messages: Array.isArray(value.messages)
      ? value.messages.filter(isSerializedMessage)
      : [],
    strategyUsed:
      value.strategyUsed === "reactive"
      || value.strategyUsed === "micro"
        ? value.strategyUsed
        : "standard",
    triggerSource:
      value.triggerSource === "auto_threshold"
      || value.triggerSource === "manual"
      || value.triggerSource === "reactive_overflow"
      || value.triggerSource === "none"
        ? value.triggerSource
        : "none",
    usageBeforeFraction: finiteNumber(value.usageBeforeFraction),
    preservedSystemCount: finiteNumber(value.preservedSystemCount),
    preservedRecentCount: finiteNumber(value.preservedRecentCount),
    summarizedMessageCount: finiteNumber(value.summarizedMessageCount),
    summaryLineCount: finiteNumber(value.summaryLineCount),
  };
}

function normalizeCompactionFailure(value: unknown): { strategy: CompactionStrategy; message: string } | null {
  if (!isRecord(value)) return null;
  const strategy = value.strategy === "standard"
    || value.strategy === "micro"
    || value.strategy === "reactive"
      ? value.strategy
    : "standard";
  const message = typeof value.message === "string" ? value.message.trim() : "";
  if (!message) return null;
  return { strategy, message };
}

function normalizeProviderHealth(value: unknown): Record<string, SessionProviderHealthSnapshot> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([provider]) => provider.trim().length > 0)
      .map(([provider, snapshot]) => {
        const record = isRecord(snapshot) ? snapshot : {};
        return [
          provider,
          {
            state: typeof record.state === "string" && record.state.length > 0 ? record.state : undefined,
            failureCount: typeof record.failureCount === "number" && Number.isFinite(record.failureCount)
              ? record.failureCount
              : undefined,
          } satisfies SessionProviderHealthSnapshot,
        ];
      }),
  );
}

function normalizeRecentFailovers(value: unknown): SessionFailoverSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const fromProvider = typeof entry.fromProvider === "string" ? entry.fromProvider.trim() : "";
    const fromModel = typeof entry.fromModel === "string" ? entry.fromModel.trim() : "";
    const toProvider = typeof entry.toProvider === "string" ? entry.toProvider.trim() : "";
    const toModel = typeof entry.toModel === "string" ? entry.toModel.trim() : "";
    const errorType = typeof entry.errorType === "string" ? entry.errorType.trim() : "";
    const errorMessage = typeof entry.errorMessage === "string" ? entry.errorMessage.trim() : "";
    const timestamp = typeof entry.timestamp === "number" && Number.isFinite(entry.timestamp)
      ? entry.timestamp
      : 0;
    if (!fromProvider || !toProvider || !errorType || !timestamp) return [];
    return [{
      fromProvider,
      fromModel,
      toProvider,
      toModel,
      errorType,
      errorMessage,
      timestamp,
    }];
  }).slice(-5);
}

function normalizeRecentHookEvents(value: unknown): SessionHookEventSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const kind = typeof entry.kind === "string" ? entry.kind.trim() : "";
    const detail = typeof entry.detail === "string" ? entry.detail.trim() : "";
    const timestamp = typeof entry.timestamp === "number" && Number.isFinite(entry.timestamp)
      ? entry.timestamp
      : 0;
    const durationMs = typeof entry.durationMs === "number" && Number.isFinite(entry.durationMs)
      ? entry.durationMs
      : undefined;
    if (!kind || !timestamp) return [];
    return [{
      kind,
      detail: detail || undefined,
      timestamp,
      durationMs,
    }];
  }).slice(-8);
}

function normalizeRecentCompactionEvents(value: unknown): SessionCompactionEventSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const strategy: CompactionStrategy | null =
      entry.strategy === "micro" || entry.strategy === "reactive" || entry.strategy === "standard"
        ? entry.strategy
        : null;
    const trigger = typeof entry.trigger === "string" ? entry.trigger.trim() : "";
    const timestamp = typeof entry.timestamp === "number" && Number.isFinite(entry.timestamp)
      ? entry.timestamp
      : 0;
    if (!strategy || !trigger || !timestamp) return [];
    const failureMessage = typeof entry.failureMessage === "string" ? entry.failureMessage.trim() : "";
    return [{
      strategy,
      trigger,
      timestamp,
      durationMs: (() => {
        const duration = finiteNumber(entry.durationMs);
        return duration > 0 ? duration : undefined;
      })(),
      compacted: Boolean(entry.compacted),
      originalCount: finiteNumber(entry.originalCount),
      finalCount: finiteNumber(entry.finalCount),
      tokensSavedEstimate: finiteNumber(entry.tokensSavedEstimate),
      summaryLineCount: finiteNumber(entry.summaryLineCount),
      summarizedMessageCount: finiteNumber(entry.summarizedMessageCount),
      failureMessage: failureMessage || undefined,
    }];
  }).slice(-8);
}

function normalizeCompactionHandoff(value: unknown): SessionCompactionHandoffSnapshot | null {
  if (!isRecord(value)) return null;
  const status = value.status === "ok" || value.status === "failed" ? value.status : null;
  const strategy: CompactionStrategy | null =
    value.strategy === "micro" || value.strategy === "reactive" || value.strategy === "standard"
      ? value.strategy
      : null;
  const trigger = typeof value.trigger === "string" ? value.trigger.trim() : "";
  const timestamp = finiteNumber(value.timestamp);
  if (!status || !strategy || !trigger || !timestamp) return null;
  const artifactId = typeof value.artifactId === "string" ? value.artifactId.trim() : "";
  const errorMessage = typeof value.errorMessage === "string" ? value.errorMessage.trim() : "";
  return {
    status,
    strategy,
    trigger,
    timestamp,
    loggedCount: finiteNumber(value.loggedCount),
    structuredCount: finiteNumber(value.structuredCount),
    artifactId: artifactId || undefined,
    artifactChars: (() => {
      const chars = finiteNumber(value.artifactChars);
      return chars > 0 ? chars : undefined;
    })(),
    errorMessage: errorMessage || undefined,
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .sort();
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSerializedMessage(value: unknown): value is SerializedMessage {
  return isRecord(value) && typeof value.type === "string";
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function normalizeHistoryLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 8;
  const rounded = Math.trunc(value);
  if (rounded < 1) return 1;
  if (rounded > 20) return 20;
  return rounded;
}

function inferSessionCaste(history: SerializedMessage[]): string {
  for (const message of history) {
    const record = message as unknown as Record<string, unknown>;
    if (typeof record.caste === "string") {
      return String(record.caste);
    }
  }
  return String(Caste.ASSIST_ANT);
}

function summarizeHistoryPreview(history: SerializedMessage[]): {
  previewText: string;
  previewRole: string;
  provider?: string;
  model?: string;
} {
  const latestAssistantIdentity = history
    .slice()
    .reverse()
    .flatMap((message) => {
      const record = message as unknown as Record<string, unknown>;
      if (record.type !== "assistant") return [];
      return [{
        provider: typeof record.provider === "string" && record.provider.length > 0 ? record.provider : undefined,
        model: typeof record.model === "string" && record.model.length > 0 ? record.model : undefined,
      }];
    })[0] ?? null;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (!message) continue;
    const record = message as unknown as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type : "unknown";
    if (type === "system") continue;

    const preview = previewMessage(record);
    const previewText = preview.previewText;
    if (previewText.length === 0) continue;

    return {
      previewText,
      previewRole: preview.previewRole,
      provider: latestAssistantIdentity?.provider,
      model: latestAssistantIdentity?.model,
    };
  }

  return {
    previewText: "",
    previewRole: "system",
    provider: latestAssistantIdentity?.provider,
    model: latestAssistantIdentity?.model,
  };
}

function compactPreviewText(value: string): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= 120) return collapsed;
  return `${collapsed.slice(0, 117)}...`;
}

function previewMessage(record: Record<string, unknown>): {
  previewText: string;
  previewRole: string;
} {
  const type = typeof record.type === "string" ? record.type : "unknown";
  const directContent = typeof record.content === "string"
    ? record.content
    : record.content != null
      ? JSON.stringify(record.content)
      : "";

  const toolCalls = Array.isArray(record.toolCalls)
    ? record.toolCalls
    : [];
  const toolCallSummary = toolCalls
    .map((toolCall) => {
      if (!isRecord(toolCall) || typeof toolCall.name !== "string") return "";
      return String(toolCall.name);
    })
    .filter((name) => name.length > 0)
    .join(", ");

  const fallbackContent = type === "assistant" && toolCallSummary.length > 0
    ? `[tool calls: ${toolCallSummary}]`
    : type === "tool_result" && typeof record.name === "string"
      ? `[tool result: ${record.name}]`
      : type === "system"
        ? "[system context]"
        : "";

  return {
    previewText: compactPreviewText(directContent || fallbackContent),
    previewRole: previewRoleLabel(type),
  };
}

function previewRoleLabel(type: string): string {
  if (type === "tool_result") return "tool";
  if (type === "assistant" || type === "user") return type;
  return "message";
}

function historyRole(record: Record<string, unknown>): "user" | "assistant" | "system" | "tool" {
  const type = typeof record.type === "string" ? record.type : "";
  if (type === "tool_result") return "tool";
  if (type === "assistant" || type === "user" || type === "system") return type;
  return "system";
}

function fallbackMessagePreview(
  role: "user" | "assistant" | "system" | "tool",
  record: Record<string, unknown>,
): string {
  if (role === "tool" && typeof record.name === "string") {
    return `[tool result: ${record.name}]`;
  }
  if (role === "assistant") {
    return "[assistant response]";
  }
  if (role === "user") {
    return "[user message]";
  }
  return "[system context]";
}

function latestHistoryTimestamp(history: SerializedMessage[], fallback?: string): string {
  let latest = fallback ?? new Date().toISOString();
  let latestMs = Date.parse(latest);

  for (const message of history) {
    const record = message as unknown as Record<string, unknown>;
    const timestamp = typeof record.timestamp === "string"
      ? String(record.timestamp)
      : "";
    const parsed = Date.parse(timestamp);
    if (Number.isFinite(parsed) && parsed >= latestMs) {
      latest = timestamp;
      latestMs = parsed;
    }
  }

  return latest;
}
