import type { SessionInterruptionState, SessionHistoryExcerpt } from "./runtime/session-recovery";
import type {
  GatewaySessionRecord,
  SessionShortcutAlias,
} from "./gateway-session";
import {
  currentSessionHistoryCommands,
  currentSessionHistoryExcerpt,
  currentSessionShortcutAliases,
  effectiveLatestPersistedAliasSessionId,
  latestCurrentSessionExcerpt,
} from "./gateway-session";

export interface GatewayCurrentSessionSnapshot {
  currentSessionId: string;
  currentExcerpt: SessionHistoryExcerpt | null;
  latestCurrentExcerpt: SessionHistoryExcerpt | null;
  currentHistoryAliases: SessionShortcutAlias[];
  currentHistoryCommands: string[];
  currentPendingState: SessionInterruptionState | null;
  currentSessionIdForResume: string | null;
  latestCurrentSessionId: string | null;
  latestPersistedAliasSessionId: string | null;
}

export function buildGatewayCurrentSessionSnapshot(
  session: unknown,
  sessions: GatewaySessionRecord[],
): GatewayCurrentSessionSnapshot {
  const currentExcerpt = currentSessionHistoryExcerpt(session, 1);
  const latestCurrentExcerpt = latestCurrentSessionExcerpt(session, sessions, 1);

  return {
    currentSessionId: currentExcerpt?.sessionId ?? "",
    currentExcerpt,
    latestCurrentExcerpt,
    currentHistoryAliases: currentSessionShortcutAliases(session, sessions),
    currentHistoryCommands: currentSessionHistoryCommands(session, sessions),
    currentPendingState:
      currentExcerpt && currentExcerpt.interruption !== "none"
        ? currentExcerpt.interruption
        : null,
    currentSessionIdForResume: currentExcerpt?.sessionId ?? null,
    latestCurrentSessionId: latestCurrentExcerpt?.sessionId ?? null,
    latestPersistedAliasSessionId: effectiveLatestPersistedAliasSessionId(session, sessions),
  };
}
