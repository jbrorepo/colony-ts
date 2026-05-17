import type { PersistedSessionSummary } from "./session-recovery";

export interface LiveSessionShortcutOptions {
  currentSessionId: string;
  currentMessageCount: number;
  currentLatestMessageTimestamp: number | null;
  currentAwaitingReply: boolean;
  persistedSessions: PersistedSessionSummary[];
}

export interface LiveSessionShortcutSnapshot {
  currentSessionId: string;
  hasCurrentHistory: boolean;
  currentCanResumeById: boolean;
  currentOwnsLatestHistoryAlias: boolean;
  currentOwnsPendingHistoryAlias: boolean;
  currentOwnsLatestResumeAlias: boolean;
  currentOwnsPendingResumeAlias: boolean;
  latestPersistedSessionId: string | null;
  pendingPersistedSessionId: string | null;
}

function dedupeCommands(commands: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const command of commands) {
    if (!command || seen.has(command)) continue;
    seen.add(command);
    ordered.push(command);
  }
  return ordered;
}

export function buildLiveSessionShortcutSnapshot(
  options: LiveSessionShortcutOptions,
): LiveSessionShortcutSnapshot {
  const {
    currentSessionId,
    currentMessageCount,
    currentLatestMessageTimestamp,
    currentAwaitingReply,
    persistedSessions,
  } = options;

  const hasCurrentHistory = Boolean(currentSessionId) && currentMessageCount > 0;
  const currentCanResumeById = Boolean(
    currentSessionId
    && persistedSessions.some((session) => String(session.sessionId ?? "") === currentSessionId),
  );
  const latestPersisted = persistedSessions[0] ?? null;
  const latestPersistedSessionId =
    latestPersisted?.sessionId != null ? String(latestPersisted.sessionId) : null;
  const latestPersistedTime = Date.parse(
    String(latestPersisted?.lastMessageAt ?? latestPersisted?.savedAt ?? ""),
  );
  const pendingPersistedSessionId =
    persistedSessions.find((session) => session.interruption !== "none")?.sessionId ?? null;
  const currentOwnsPendingHistoryAlias =
    hasCurrentHistory
    && currentAwaitingReply
    && (pendingPersistedSessionId === null || String(pendingPersistedSessionId) === currentSessionId);
  const currentOwnsLatestHistoryAlias =
    hasCurrentHistory
    && (
      persistedSessions.length === 0
      || latestPersistedSessionId === currentSessionId
      || !Number.isFinite(latestPersistedTime)
      || (
        Number.isFinite(currentLatestMessageTimestamp)
        && Number(currentLatestMessageTimestamp) > latestPersistedTime
      )
    );

  return {
    currentSessionId,
    hasCurrentHistory,
    currentCanResumeById,
    currentOwnsLatestHistoryAlias,
    currentOwnsPendingHistoryAlias,
    currentOwnsLatestResumeAlias:
      currentCanResumeById
      && Boolean(currentSessionId)
      && latestPersistedSessionId === currentSessionId,
    currentOwnsPendingResumeAlias:
      currentCanResumeById
      && Boolean(currentSessionId)
      && pendingPersistedSessionId !== null
      && String(pendingPersistedSessionId) === currentSessionId,
    latestPersistedSessionId,
    pendingPersistedSessionId,
  };
}

export function buildLiveCurrentHistoryHint(
  snapshot: LiveSessionShortcutSnapshot,
  count = 8,
): string {
  if (!snapshot.currentSessionId) return `/history current ${count}`;
  return dedupeCommands([
    `/history current ${count}`,
    snapshot.currentOwnsPendingHistoryAlias ? `/history pending ${count}` : null,
    snapshot.currentOwnsLatestHistoryAlias ? `/history latest ${count}` : null,
    `/history ${snapshot.currentSessionId} ${count}`,
  ]).join(" | ");
}

export function buildLiveCurrentResumeHint(
  snapshot: LiveSessionShortcutSnapshot,
): string {
  return dedupeCommands([
    snapshot.currentOwnsLatestResumeAlias ? "/resume latest" : null,
    snapshot.currentOwnsPendingResumeAlias ? "/resume pending" : null,
    snapshot.currentCanResumeById && snapshot.currentSessionId
      ? `/resume ${snapshot.currentSessionId}`
      : null,
    "/status",
    "/cost",
    "/clear",
  ]).join(" | ");
}

export function buildPersistedSessionResumeHint(options: {
  sessionId: string;
  sessionCatalogIndex: number;
  currentTarget: boolean;
  snapshot: LiveSessionShortcutSnapshot;
}): string {
  const { sessionId, sessionCatalogIndex, currentTarget, snapshot } = options;
  const resumeCommand = `/resume ${sessionCatalogIndex}`;
  if (currentTarget) {
    return buildLiveCurrentResumeHint(snapshot);
  }

  return dedupeCommands([
    snapshot.pendingPersistedSessionId === sessionId ? "/resume pending" : null,
    snapshot.latestPersistedSessionId === sessionId ? "/resume latest" : null,
    resumeCommand,
    `/resume ${sessionId}`,
  ]).join(" | ");
}

export function buildPersistedSessionHistoryHint(options: {
  sessionId: string;
  sessionCatalogIndex: number;
  currentTarget: boolean;
  snapshot: LiveSessionShortcutSnapshot;
  count?: number;
}): string {
  const { sessionId, sessionCatalogIndex, currentTarget, snapshot, count = 8 } = options;
  const historyCommand = `/history ${sessionCatalogIndex} ${count}`;
  if (currentTarget) {
    return buildLiveCurrentHistoryHint(snapshot, count);
  }

  return dedupeCommands([
    !snapshot.currentOwnsPendingHistoryAlias && snapshot.pendingPersistedSessionId === sessionId
      ? `/history pending ${count}`
      : null,
    !snapshot.currentOwnsLatestHistoryAlias && snapshot.latestPersistedSessionId === sessionId
      ? `/history latest ${count}`
      : null,
    historyCommand,
    `/history ${sessionId} ${count}`,
  ]).join(" | ");
}

export function resolveSmartHistoryCommand(
  snapshot: LiveSessionShortcutSnapshot,
  count = 8,
): string | null {
  if (snapshot.hasCurrentHistory) return `/history current ${count}`;
  if (snapshot.pendingPersistedSessionId) return `/history pending ${count}`;
  if (snapshot.latestPersistedSessionId) return `/history latest ${count}`;
  return null;
}

export function resolveSmartResumeCommand(
  snapshot: LiveSessionShortcutSnapshot,
): string | null {
  if (snapshot.pendingPersistedSessionId) return "/resume pending";
  if (snapshot.latestPersistedSessionId) return "/resume latest";
  return null;
}
