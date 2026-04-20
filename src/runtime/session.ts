/**
 * Agent session state management.
 *
 * 1:1 port of colony/runtime/session.py — maintains conversation history
 * and metadata across multiple user turns within a single agent interaction.
 *
 * Thread-safety model: single-threaded Node/Bun event loop replaces
 * Python's asyncio.Lock. Zustand store provides reactivity.
 *
 * Session lifecycle: CREATED → ACTIVE → IDLE → EXPIRED → CLOSED
 */

import { randomUUID } from "crypto";
import { Caste, SessionState } from "../caste/enums";
import {
  type RuntimeMessage,
  type SerializedMessage,
  serializeMessage,
} from "./message";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newSessionId(): string {
  return `ses_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

// ---------------------------------------------------------------------------
// SessionConfig
// ---------------------------------------------------------------------------

export interface SessionConfig {
  /** Max idle time before auto-expiry (seconds). */
  maxIdleSeconds: number;
  /** Max messages in history before eviction kicks in. */
  maxHistoryMessages: number;
  /** Max total tokens before session is budget-killed (0 = unlimited). */
  maxTotalTokens: number;
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  maxIdleSeconds: 1800, // 30 minutes
  maxHistoryMessages: 200,
  maxTotalTokens: 0,
};

// ---------------------------------------------------------------------------
// AgentSession
// ---------------------------------------------------------------------------

export interface AgentSession {
  sessionId: string;
  agentId: string;
  caste: Caste | string;
  tenantScope: string;
  state: SessionState;
  createdAt: string;
  lastActive: string;
  history: SerializedMessage[];
  totalIterations: number;
  totalTokensUsed: number;
  config: SessionConfig;
  metadata: Record<string, unknown>;
}

export function createAgentSession(opts: {
  agentId: string;
  caste: Caste | string;
  tenantScope?: string;
  config?: Partial<SessionConfig>;
  metadata?: Record<string, unknown>;
}): AgentSession {
  const now = new Date().toISOString();
  return {
    sessionId: newSessionId(),
    agentId: opts.agentId,
    caste: opts.caste,
    tenantScope: opts.tenantScope ?? "default",
    state: SessionState.CREATED,
    createdAt: now,
    lastActive: now,
    history: [],
    totalIterations: 0,
    totalTokensUsed: 0,
    config: { ...DEFAULT_SESSION_CONFIG, ...opts.config },
    metadata: opts.metadata ?? {},
  };
}

export function rehydrateSession(input: Partial<AgentSession> & {
  sessionId: string;
  agentId: string;
  caste: Caste | string;
}): AgentSession {
  const now = new Date().toISOString();
  const stateValue = String(input.state ?? SessionState.CREATED).toLowerCase();
  const state = Object.values(SessionState).includes(stateValue as SessionState)
    ? (stateValue as SessionState)
    : SessionState.CREATED;

  return {
    sessionId: input.sessionId,
    agentId: input.agentId,
    caste: input.caste,
    tenantScope: input.tenantScope ?? "default",
    state,
    createdAt: typeof input.createdAt === "string" ? input.createdAt : now,
    lastActive: typeof input.lastActive === "string" ? input.lastActive : now,
    history: Array.isArray(input.history) ? [...input.history] : [],
    totalIterations: Number.isFinite(input.totalIterations) ? Number(input.totalIterations) : 0,
    totalTokensUsed: Number.isFinite(input.totalTokensUsed) ? Number(input.totalTokensUsed) : 0,
    config: {
      ...DEFAULT_SESSION_CONFIG,
      ...(input.config ?? {}),
    },
    metadata:
      input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
        ? { ...input.metadata }
        : {},
  };
}

// ---------------------------------------------------------------------------
// Session mutation helpers (pure functions, return new session)
// ---------------------------------------------------------------------------

/**
 * Append a message to conversation history.
 *
 * Critical parity: replicates the Python add_message() eviction logic.
 * Automatically transitions state from CREATED/IDLE → ACTIVE and
 * enforces max_history_messages by dropping the oldest non-system
 * messages first.
 */
export function addMessage(
  session: AgentSession,
  message: RuntimeMessage,
): AgentSession {
  const serialized = serializeMessage(message);
  let history = [...session.history, serialized];
  const now = new Date().toISOString();

  // State transitions on activity
  let state = session.state;
  if (
    state === SessionState.CREATED ||
    state === SessionState.IDLE
  ) {
    state = SessionState.ACTIVE;
  }

  // Enforce max history size — eviction logic matching Python exactly
  const maxMessages = session.config.maxHistoryMessages;
  if (history.length > maxMessages) {
    const systemMsgs = history.filter((m) => m.type === "system");
    const otherMsgs = history.filter((m) => m.type !== "system");
    const keep = maxMessages - systemMsgs.length;
    if (keep > 0) {
      history = [...systemMsgs, ...otherMsgs.slice(-keep)];
    } else {
      history = systemMsgs.slice(-maxMessages);
    }
  }

  return {
    ...session,
    history,
    lastActive: now,
    state,
  };
}

/** Track an iteration of the agent loop. */
export function recordIteration(
  session: AgentSession,
  tokensUsed = 0,
): AgentSession {
  return {
    ...session,
    totalIterations: session.totalIterations + 1,
    totalTokensUsed: session.totalTokensUsed + tokensUsed,
    lastActive: new Date().toISOString(),
  };
}

/** Return history entries suitable for prompt assembly. */
export function getConversationMessages(
  session: AgentSession,
): SerializedMessage[] {
  return [...session.history];
}

// ---------------------------------------------------------------------------
// Session lifecycle transitions
// ---------------------------------------------------------------------------

/** Transition from ACTIVE → IDLE. */
export function markIdle(session: AgentSession): AgentSession {
  if (session.state !== SessionState.ACTIVE) return session;
  return { ...session, state: SessionState.IDLE };
}

/** Force-expire the session. */
export function markExpired(session: AgentSession): AgentSession {
  if (
    session.state !== SessionState.ACTIVE &&
    session.state !== SessionState.IDLE
  ) {
    return session;
  }
  return { ...session, state: SessionState.EXPIRED };
}

/** Permanently close the session. */
export function closeSession(session: AgentSession): AgentSession {
  return { ...session, state: SessionState.CLOSED };
}

/** Check and auto-transition to EXPIRED if idle too long. */
export function isExpired(session: AgentSession): boolean {
  if (session.state === SessionState.EXPIRED) return true;
  if (session.state === SessionState.CLOSED) return false;
  if (
    session.state === SessionState.ACTIVE ||
    session.state === SessionState.IDLE
  ) {
    const lastActive = new Date(session.lastActive).getTime();
    const idleMs = Date.now() - lastActive;
    if (idleMs > session.config.maxIdleSeconds * 1000) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// SessionManager (in-memory, mirrors Python SessionManager)
// ---------------------------------------------------------------------------

export class SessionManager {
  private sessions = new Map<string, AgentSession>();

  async createSession(opts: {
    agentId: string;
    caste: Caste | string;
    tenantScope?: string;
    config?: Partial<SessionConfig>;
    metadata?: Record<string, unknown>;
  }): Promise<AgentSession> {
    const session = createAgentSession(opts);
    this.sessions.set(session.sessionId, session);
    return session;
  }

  async getSession(sessionId: string): Promise<AgentSession | null> {
    const session = this.sessions.get(sessionId) ?? null;
    if (!session) return null;
    if (isExpired(session)) {
      // Auto-transition to expired
      const expired = markExpired(session);
      this.sessions.set(sessionId, expired);
      return null;
    }
    return session;
  }

  updateSession(session: AgentSession): void {
    this.sessions.set(session.sessionId, session);
  }

  async closeSessionById(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.set(sessionId, closeSession(session));
    }
  }

  async cleanupExpired(): Promise<number> {
    let count = 0;
    for (const [sid, session] of this.sessions) {
      if (isExpired(session)) {
        const closed = closeSession(markExpired(session));
        this.sessions.delete(sid);
        count++;
      }
    }
    return count;
  }

  async listSessions(agentId?: string): Promise<AgentSession[]> {
    const all = Array.from(this.sessions.values());
    const nonExpired = all.filter((s) => !isExpired(s));
    if (agentId) return nonExpired.filter((s) => s.agentId === agentId);
    return nonExpired;
  }

  reset(): void {
    this.sessions.clear();
  }
}
