/**
 * Add a caste-scoped allow rule to the security policy engine and
 * inspect the resulting evaluation log.
 *
 * Run:
 *   bun run examples/06-custom-policy-rule.ts
 */

import {
  SecurityPolicyEngine,
  PolicyDecision,
  createDefaultSecurityPolicyEngine,
} from "../src/security/policy";

const engine: SecurityPolicyEngine = createDefaultSecurityPolicyEngine();

// Add a custom rule: allow forge_carvers to read any audit log entry
engine.addRule({
  name: "forge_carvers.read_audit",
  actionPattern: "audit.read",
  resourcePattern: "logs/audit/*",
  decision: PolicyDecision.ALLOW,
  priority: 50,
  casteList: ["forge_carvers"],
});

// Evaluate some sample calls
const cases = [
  {
    label: "forge_carvers reading allowed audit log",
    actorCaste: "forge_carvers",
    actorAgentId: "agent-1",
    action: "audit.read",
    resource: "logs/audit/2026-05-30.json",
  },
  {
    label: "forge_carvers reading non-audit file (should deny)",
    actorCaste: "forge_carvers",
    actorAgentId: "agent-1",
    action: "audit.read",
    resource: "secrets/keys.json",
  },
  {
    label: "nameless_swarm reading the same audit log (should deny)",
    actorCaste: "nameless_swarm",
    actorAgentId: "agent-2",
    action: "audit.read",
    resource: "logs/audit/2026-05-30.json",
  },
  {
    label: "root_queen reading anything (default-allow)",
    actorCaste: "root_queen",
    actorAgentId: "operator",
    action: "anything",
    resource: "anywhere",
  },
];

console.log("=== Evaluation results ===\n");
for (const c of cases) {
  const result = engine.evaluate(c);
  const flag = result.decision === PolicyDecision.ALLOW ? "ALLOW" : "DENY ";
  console.log(`${flag}  ${c.label}`);
  console.log(`        matched: ${result.matchedRule ?? "(default-deny)"}`);
  console.log("");
}

console.log("=== Evaluation log (last 4 entries) ===\n");
const log = engine.getEvaluationLog().slice(-4);
for (const entry of log) {
  console.log(
    `[${entry.timestamp}] ${entry.actorCaste}/${entry.actorAgentId} ` +
      `${entry.action} ${entry.resource} → ${entry.decision} ` +
      `(${entry.matchedRule ?? "default-deny"})`,
  );
}
