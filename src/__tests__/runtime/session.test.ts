import { describe, test, expect } from "bun:test";
import {
  createAgentSession,
  addMessage,
  recordIteration,
  markIdle,
  markExpired,
  closeSession,
  isExpired,
  SessionManager,
} from "../../runtime/session";
import { Caste, SessionState } from "../../caste/enums";
import {
  createUserMessage,
  createSystemMessage,
  createAssistantMessage,
} from "../../runtime/message";

describe("session ID (P1-5)", () => {
  test("session ID uses full UUID format (122-bit entropy)", () => {
    const session = createAgentSession({ agentId: "agent-1", caste: Caste.ASSIST_ANT });
    // ses_ + standard UUID: ses_xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    expect(session.sessionId).toMatch(/^ses_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test("every session gets a unique ID", () => {
    const ids = new Set(
      Array.from({ length: 20 }, () =>
        createAgentSession({ agentId: "a", caste: Caste.ASSIST_ANT }).sessionId
      )
    );
    expect(ids.size).toBe(20);
  });
});

describe("session lifecycle", () => {
  test("initial state is CREATED with empty history", () => {
    const session = createAgentSession({ agentId: "agent-1", caste: Caste.FORGE_CARVERS });
    expect(session.state).toBe(SessionState.CREATED);
    expect(session.history).toHaveLength(0);
  });

  test("addMessage transitions CREATED → ACTIVE", () => {
    let session = createAgentSession({ agentId: "a", caste: Caste.ASSIST_ANT });
    session = addMessage(session, createUserMessage("hello"));
    expect(session.state).toBe(SessionState.ACTIVE);
    expect(session.history).toHaveLength(1);
  });

  test("markIdle → IDLE → markExpired → EXPIRED → closeSession → CLOSED", () => {
    let session = createAgentSession({ agentId: "a", caste: Caste.ASSIST_ANT });
    session = addMessage(session, createUserMessage("x"));
    session = markIdle(session);
    expect(session.state).toBe(SessionState.IDLE);
    session = markExpired(session);
    expect(session.state).toBe(SessionState.EXPIRED);
    session = closeSession(session);
    expect(session.state).toBe(SessionState.CLOSED);
  });

  test("recordIteration accumulates tokens and count", () => {
    let session = createAgentSession({ agentId: "a", caste: Caste.WATCHER_SWARM });
    session = recordIteration(session, 150);
    session = recordIteration(session, 200);
    expect(session.totalIterations).toBe(2);
    expect(session.totalTokensUsed).toBe(350);
  });
});

describe("history eviction", () => {
  test("caps history at maxHistoryMessages, preserving system messages", () => {
    let session = createAgentSession({
      agentId: "a",
      caste: Caste.FORGE_CARVERS,
      config: { maxHistoryMessages: 5, maxIdleSeconds: 1800, maxTotalTokens: 0 },
    });

    session = addMessage(session, createSystemMessage("You are a forge carver.", 10));
    for (let i = 0; i < 5; i++) {
      session = addMessage(session, createUserMessage(`Message ${i}`));
    }

    // 1 system + 5 user = 6, capped at 5 → oldest user (Message 0) evicted
    expect(session.history).toHaveLength(5);
    expect(session.history[0].type).toBe("system");
    expect(session.history[1].content).toBe("Message 1");
    expect(session.history[4].content).toBe("Message 4");
  });
});

describe("expiry detection", () => {
  test("detects expiry when lastActive is in the past beyond maxIdleSeconds", () => {
    let session = createAgentSession({
      agentId: "a",
      caste: Caste.WATCHER_SWARM,
      config: { maxIdleSeconds: 0, maxHistoryMessages: 200, maxTotalTokens: 0 },
    });
    session = addMessage(session, createUserMessage("test"));
    session = { ...session, lastActive: "2020-01-01T00:00:00.000Z" };
    expect(isExpired(session)).toBe(true);
  });

  test("active session is not expired", () => {
    const session = createAgentSession({ agentId: "a", caste: Caste.ASSIST_ANT });
    expect(isExpired(session)).toBe(false);
  });
});

describe("SessionManager", () => {
  test("create and retrieve a session", async () => {
    const manager = new SessionManager();
    const session = await manager.createSession({ agentId: "agent-x", caste: Caste.ROOT_QUEEN });
    const sessions = await manager.listSessions();
    const found = sessions.find((s) => s.sessionId === session.sessionId);
    expect(found).toBeDefined();
    expect(found!.sessionId).toBe(session.sessionId);
  });

  test("closeSessionById marks session as closed", async () => {
    const manager = new SessionManager();
    const session = await manager.createSession({ agentId: "agent-y", caste: Caste.ASSIST_ANT });
    await manager.closeSessionById(session.sessionId);
    const sessions = await manager.listSessions();
    const found = sessions.find((s) => s.sessionId === session.sessionId);
    expect(found?.state).toBe(SessionState.CLOSED);
  });

  test("lists all active sessions", async () => {
    const manager = new SessionManager();
    await manager.createSession({ agentId: "a1", caste: Caste.ASSIST_ANT });
    await manager.createSession({ agentId: "a2", caste: Caste.WATCHER_SWARM });
    const sessions = await manager.listSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
  });
});
