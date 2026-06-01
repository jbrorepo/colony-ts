import { describe, test, expect, beforeEach } from "bun:test";
import {
  PolicyDecision,
  SecurityPolicyEngine,
  createDefaultSecurityPolicyEngine,
  type PolicyEngineConfig,
} from "../../security/policy";

describe("SecurityPolicyEngine", () => {
  describe("default-deny posture", () => {
    test("denies unknown actor/action/resource with no rules", () => {
      const engine = new SecurityPolicyEngine();
      const result = engine.evaluate({
        actorCaste: "nameless_swarm",
        actorAgentId: "agent-1",
        action: "tool.shell.exec",
        resource: "/etc/passwd",
      });
      expect(result.decision).toBe(PolicyDecision.DENY);
      expect(result.matchedRule).toBeNull();
    });

    test("root_queen gets ALLOW from default rules", () => {
      const engine = createDefaultSecurityPolicyEngine();
      const result = engine.evaluate({
        actorCaste: "root_queen",
        actorAgentId: "agent-root",
        action: "anything.at.all",
        resource: "*",
      });
      expect(result.decision).toBe(PolicyDecision.ALLOW);
      expect(result.matchedRule).toBe("root_queen.allow_all");
    });

    test("shell access denied for unprivileged caste", () => {
      const engine = createDefaultSecurityPolicyEngine();
      for (const caste of ["assist_ant", "liaison_ants", "ledger_ants", "lore_burrow", "nameless_swarm"]) {
        const result = engine.evaluate({
          actorCaste: caste,
          actorAgentId: "agent-x",
          action: "tool.shell.exec",
          resource: "/bin/sh",
        });
        expect(result.decision).toBe(PolicyDecision.DENY);
      }
    });

    test("secret.write denied for unprivileged castes", () => {
      const engine = createDefaultSecurityPolicyEngine();
      const result = engine.evaluate({
        actorCaste: "watcher_swarm",
        actorAgentId: "agent-w",
        action: "secret.write",
        resource: "vault/key",
      });
      expect(result.decision).toBe(PolicyDecision.DENY);
    });
  });

  describe("evaluationLog cap (P1-1)", () => {
    test("respects maxLogEntries and evicts oldest", () => {
      const engine = new SecurityPolicyEngine({ maxLogEntries: 3 });
      engine.addRule({
        name: "test.allow",
        actionPattern: "*",
        resourcePattern: "*",
        decision: PolicyDecision.ALLOW,
        priority: 1,
      });

      for (let i = 0; i < 10; i++) {
        engine.evaluate({
          actorCaste: "root_queen",
          actorAgentId: `agent-${i}`,
          action: "tool.read",
          resource: `file-${i}`,
        });
      }

      const log = engine.getEvaluationLog();
      expect(log.length).toBe(3);
      // Oldest entries were evicted — only the last 3 remain
      expect(log[0].actorAgentId).toBe("agent-7");
      expect(log[2].actorAgentId).toBe("agent-9");
    });

    test("clearEvaluationLog empties the log", () => {
      const engine = new SecurityPolicyEngine({ maxLogEntries: 100 });
      engine.addRule({ name: "allow", actionPattern: "*", resourcePattern: "*", decision: PolicyDecision.ALLOW, priority: 1 });
      engine.evaluate({ actorCaste: "root_queen", actorAgentId: "a", action: "x", resource: "y" });
      expect(engine.getEvaluationLog().length).toBe(1);
      engine.clearEvaluationLog();
      expect(engine.getEvaluationLog().length).toBe(0);
    });

    test("default maxLogEntries is 5000", () => {
      const engine = new SecurityPolicyEngine();
      expect(engine.config.maxLogEntries).toBe(5000);
    });
  });

  describe("globMatch memoization (P1-2)", () => {
    test("wildcard patterns match correctly", () => {
      const engine = new SecurityPolicyEngine();
      engine.addRule({
        name: "tool.allow",
        actionPattern: "tool.*",
        resourcePattern: "*",
        decision: PolicyDecision.ALLOW,
        priority: 10,
      });

      const match = engine.evaluate({ actorCaste: "root_queen", actorAgentId: "a", action: "tool.read", resource: "x" });
      expect(match.decision).toBe(PolicyDecision.ALLOW);

      const noMatch = engine.evaluate({ actorCaste: "root_queen", actorAgentId: "a", action: "secret.read", resource: "x" });
      expect(noMatch.decision).toBe(PolicyDecision.DENY);
    });

    test("exact match patterns work", () => {
      const engine = new SecurityPolicyEngine();
      engine.addRule({
        name: "exact",
        actionPattern: "audit.read",
        resourcePattern: "logs/audit",
        decision: PolicyDecision.ALLOW,
        priority: 10,
      });

      const exact = engine.evaluate({ actorCaste: "root_queen", actorAgentId: "a", action: "audit.read", resource: "logs/audit" });
      expect(exact.decision).toBe(PolicyDecision.ALLOW);

      const partial = engine.evaluate({ actorCaste: "root_queen", actorAgentId: "a", action: "audit.write", resource: "logs/audit" });
      expect(partial.decision).toBe(PolicyDecision.DENY);
    });
  });

  describe("rule management", () => {
    test("addRule and removeRule", () => {
      const engine = new SecurityPolicyEngine();
      engine.addRule({ name: "my.rule", actionPattern: "x", resourcePattern: "y", decision: PolicyDecision.ALLOW, priority: 1 });
      expect(engine.getRules()).toHaveLength(1);
      engine.removeRule("my.rule");
      expect(engine.getRules()).toHaveLength(0);
    });

    test("disabled rules are skipped", () => {
      const engine = new SecurityPolicyEngine();
      engine.addRule({ name: "disabled", actionPattern: "*", resourcePattern: "*", decision: PolicyDecision.ALLOW, priority: 10, enabled: false });
      const result = engine.evaluate({ actorCaste: "root_queen", actorAgentId: "a", action: "x", resource: "y" });
      expect(result.decision).toBe(PolicyDecision.DENY);
      expect(result.matchedRule).toBeNull();
    });

    test("higher priority rule wins", () => {
      const engine = new SecurityPolicyEngine();
      engine.addRule({ name: "low.deny", actionPattern: "*", resourcePattern: "*", decision: PolicyDecision.DENY, priority: 1 });
      engine.addRule({ name: "high.allow", actionPattern: "*", resourcePattern: "*", decision: PolicyDecision.ALLOW, priority: 100 });
      const result = engine.evaluate({ actorCaste: "root_queen", actorAgentId: "a", action: "x", resource: "y" });
      expect(result.decision).toBe(PolicyDecision.ALLOW);
      expect(result.matchedRule).toBe("high.allow");
    });

    test("caste filter restricts rule application", () => {
      const engine = new SecurityPolicyEngine();
      engine.addRule({ name: "for.root", actionPattern: "*", resourcePattern: "*", decision: PolicyDecision.ALLOW, priority: 10, casteList: ["root_queen"] });
      const allowed = engine.evaluate({ actorCaste: "root_queen", actorAgentId: "a", action: "x", resource: "y" });
      expect(allowed.decision).toBe(PolicyDecision.ALLOW);
      const denied = engine.evaluate({ actorCaste: "assist_ant", actorAgentId: "b", action: "x", resource: "y" });
      expect(denied.decision).toBe(PolicyDecision.DENY);
    });

    test("maxRules limit is enforced", () => {
      const engine = new SecurityPolicyEngine({ maxRules: 2 });
      engine.addRule({ name: "r1", actionPattern: "*", resourcePattern: "*", decision: PolicyDecision.ALLOW, priority: 1 });
      engine.addRule({ name: "r2", actionPattern: "*", resourcePattern: "*", decision: PolicyDecision.DENY, priority: 2 });
      expect(() => engine.addRule({ name: "r3", actionPattern: "*", resourcePattern: "*", decision: PolicyDecision.ALLOW, priority: 3 }))
        .toThrow(/max_rules/);
    });
  });
});
