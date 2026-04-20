/**
 * Security policy engine - unified access-control evaluation.
 *
 * Ports colony/security/policy.py. Rules are evaluated in descending priority
 * order, first match wins, and default decision is deny.
 */

export enum PolicyDecision {
  ALLOW = "allow",
  DENY = "deny",
  AUDIT = "audit",
}

export interface PolicyContext {
  actorCaste: string;
  actorAgentId: string;
  action: string;
  resource: string;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface PolicyRule {
  name: string;
  actionPattern: string;
  resourcePattern: string;
  casteList: string[] | null;
  decision: PolicyDecision;
  priority: number;
  enabled: boolean;
}

export interface PolicyEvaluation {
  decision: PolicyDecision;
  matchedRule: string | null;
  reason: string;
  context: PolicyContext;
}

export interface PolicyEngineConfig {
  defaultDecision: PolicyDecision;
  enableAuditLogging: boolean;
  maxRules: number;
}

export interface PolicyEvaluationLogEntry {
  timestamp: string;
  actorCaste: string;
  actorAgentId: string;
  action: string;
  resource: string;
  decision: PolicyDecision;
  matchedRule: string | null;
  reason: string;
}

export type PolicyRuleInput = Partial<Omit<PolicyRule, "name">> & {
  name: string;
  actionPattern?: string;
  resourcePattern?: string;
  casteList?: string[] | null;
  decision?: PolicyDecision | `${PolicyDecision}`;
  priority?: number;
  enabled?: boolean;
};

export const DEFAULT_POLICY_ENGINE_CONFIG: PolicyEngineConfig = {
  defaultDecision: PolicyDecision.DENY,
  enableAuditLogging: true,
  maxRules: 1000,
};

const DEFAULT_RULES: PolicyRuleInput[] = [
  { name: "root_queen.allow_all", actionPattern: "*", resourcePattern: "*", casteList: ["root_queen"], decision: PolicyDecision.ALLOW, priority: 1000 },
  { name: "eldest_architect.allow_tools", actionPattern: "tool.*", resourcePattern: "*", casteList: ["eldest_architect"], decision: PolicyDecision.ALLOW, priority: 900 },
  { name: "eldest_architect.allow_secrets", actionPattern: "secret.*", resourcePattern: "*", casteList: ["eldest_architect"], decision: PolicyDecision.ALLOW, priority: 900 },
  { name: "eldest_architect.allow_channel", actionPattern: "channel.*", resourcePattern: "*", casteList: ["eldest_architect"], decision: PolicyDecision.ALLOW, priority: 900 },
  { name: "shield_generals.allow_security", actionPattern: "security.*", resourcePattern: "*", casteList: ["shield_generals"], decision: PolicyDecision.ALLOW, priority: 900 },
  { name: "shield_generals.allow_audit", actionPattern: "audit.*", resourcePattern: "*", casteList: ["shield_generals"], decision: PolicyDecision.ALLOW, priority: 900 },
  { name: "shield_generals.allow_secrets", actionPattern: "secret.*", resourcePattern: "*", casteList: ["shield_generals"], decision: PolicyDecision.ALLOW, priority: 900 },
  { name: "watcher_swarm.allow_monitor", actionPattern: "monitor.*", resourcePattern: "*", casteList: ["watcher_swarm"], decision: PolicyDecision.ALLOW, priority: 800 },
  { name: "watcher_swarm.allow_audit_read", actionPattern: "audit.read", resourcePattern: "*", casteList: ["watcher_swarm"], decision: PolicyDecision.ALLOW, priority: 800 },
  { name: "forge_carvers.allow_tools", actionPattern: "tool.*", resourcePattern: "*", casteList: ["forge_carvers"], decision: PolicyDecision.ALLOW, priority: 800 },
  { name: "forge_carvers.allow_secret_read", actionPattern: "secret.read", resourcePattern: "*", casteList: ["forge_carvers"], decision: PolicyDecision.ALLOW, priority: 800 },
  { name: "core_shapers.allow_config", actionPattern: "config.*", resourcePattern: "*", casteList: ["core_shapers"], decision: PolicyDecision.ALLOW, priority: 800 },
  { name: "core_shapers.allow_tools", actionPattern: "tool.*", resourcePattern: "*", casteList: ["core_shapers"], decision: PolicyDecision.ALLOW, priority: 800 },
  { name: "assist_ant.allow_tools", actionPattern: "tool.*", resourcePattern: "*", casteList: ["assist_ant"], decision: PolicyDecision.ALLOW, priority: 700 },
  { name: "assist_ant.allow_channel_send", actionPattern: "channel.send", resourcePattern: "*", casteList: ["assist_ant"], decision: PolicyDecision.ALLOW, priority: 700 },
  { name: "assist_ant.allow_secret_read", actionPattern: "secret.read", resourcePattern: "*", casteList: ["assist_ant"], decision: PolicyDecision.ALLOW, priority: 700 },
  { name: "liaison_ants.allow_channel", actionPattern: "channel.*", resourcePattern: "*", casteList: ["liaison_ants"], decision: PolicyDecision.ALLOW, priority: 700 },
  { name: "liaison_ants.allow_handoff", actionPattern: "handoff.*", resourcePattern: "*", casteList: ["liaison_ants"], decision: PolicyDecision.ALLOW, priority: 700 },
  { name: "ledger_ants.allow_audit", actionPattern: "audit.*", resourcePattern: "*", casteList: ["ledger_ants"], decision: PolicyDecision.ALLOW, priority: 700 },
  { name: "ledger_ants.allow_usage_read", actionPattern: "usage.read", resourcePattern: "*", casteList: ["ledger_ants"], decision: PolicyDecision.ALLOW, priority: 700 },
  { name: "lore_burrow.allow_memory", actionPattern: "memory.*", resourcePattern: "*", casteList: ["lore_burrow"], decision: PolicyDecision.ALLOW, priority: 700 },
  { name: "lore_burrow.allow_search", actionPattern: "search.*", resourcePattern: "*", casteList: ["lore_burrow"], decision: PolicyDecision.ALLOW, priority: 700 },
  { name: "nameless_swarm.audit_tools", actionPattern: "tool.*", resourcePattern: "*", casteList: ["nameless_swarm"], decision: PolicyDecision.AUDIT, priority: 500 },
  {
    name: "global.deny_shell_unprivileged",
    actionPattern: "tool.shell.*",
    resourcePattern: "*",
    casteList: ["assist_ant", "liaison_ants", "ledger_ants", "lore_burrow", "nameless_swarm"],
    decision: PolicyDecision.DENY,
    priority: 950,
  },
  {
    name: "global.deny_secret_write_unprivileged",
    actionPattern: "secret.write",
    resourcePattern: "*",
    casteList: ["assist_ant", "liaison_ants", "ledger_ants", "lore_burrow", "nameless_swarm", "watcher_swarm"],
    decision: PolicyDecision.DENY,
    priority: 950,
  },
];

export class SecurityPolicyEngine {
  readonly config: PolicyEngineConfig;
  private readonly rules = new Map<string, PolicyRule>();
  private readonly evaluationLog: PolicyEvaluationLogEntry[] = [];

  constructor(config: Partial<PolicyEngineConfig> = {}) {
    this.config = {
      ...DEFAULT_POLICY_ENGINE_CONFIG,
      ...config,
    };
  }

  addRule(input: PolicyRuleInput): void {
    if (!this.rules.has(input.name) && this.rules.size >= this.config.maxRules) {
      throw new Error(`Cannot add rule '${input.name}': max_rules (${this.config.maxRules}) reached`);
    }
    this.rules.set(input.name, normalizeRule(input));
  }

  removeRule(name: string): boolean {
    return this.rules.delete(name);
  }

  getRules(caste?: string): PolicyRule[] {
    let rules = Array.from(this.rules.values());
    if (caste != null) {
      rules = rules.filter((rule) => rule.casteList === null || rule.casteList.includes(caste));
    }
    return rules
      .map((rule) => ({ ...rule, casteList: rule.casteList ? [...rule.casteList] : null }))
      .sort((a, b) => b.priority - a.priority);
  }

  evaluate(input: Omit<PolicyContext, "metadata" | "timestamp"> & Partial<Pick<PolicyContext, "metadata" | "timestamp">>): PolicyEvaluation {
    const context = normalizeContext(input);

    for (const rule of Array.from(this.rules.values()).sort((a, b) => b.priority - a.priority)) {
      if (matchesRule(rule, context)) {
        const evaluation: PolicyEvaluation = {
          decision: rule.decision,
          matchedRule: rule.name,
          reason: `Matched rule '${rule.name}' (priority=${rule.priority})`,
          context,
        };
        this.logEvaluation(evaluation);
        return evaluation;
      }
    }

    const evaluation: PolicyEvaluation = {
      decision: this.config.defaultDecision,
      matchedRule: null,
      reason: `No matching rule - default decision: ${this.config.defaultDecision}`,
      context,
    };
    this.logEvaluation(evaluation);
    return evaluation;
  }

  loadDefaults(): void {
    for (const rule of DEFAULT_RULES) {
      this.addRule(rule);
    }
  }

  getEvaluationLog(): PolicyEvaluationLogEntry[] {
    return this.evaluationLog.map((entry) => ({ ...entry }));
  }

  clearEvaluationLog(): void {
    this.evaluationLog.length = 0;
  }

  private logEvaluation(evaluation: PolicyEvaluation): void {
    const entry: PolicyEvaluationLogEntry = {
      timestamp: evaluation.context.timestamp.toISOString(),
      actorCaste: evaluation.context.actorCaste,
      actorAgentId: evaluation.context.actorAgentId,
      action: evaluation.context.action,
      resource: evaluation.context.resource,
      decision: evaluation.decision,
      matchedRule: evaluation.matchedRule,
      reason: evaluation.reason,
    };
    this.evaluationLog.push(entry);
  }
}

export function createDefaultSecurityPolicyEngine(config: Partial<PolicyEngineConfig> = {}): SecurityPolicyEngine {
  const engine = new SecurityPolicyEngine(config);
  engine.loadDefaults();
  return engine;
}

export function defaultSecurityPolicyRules(): PolicyRule[] {
  return DEFAULT_RULES.map(normalizeRule);
}

function normalizeRule(input: PolicyRuleInput): PolicyRule {
  return {
    name: input.name,
    actionPattern: input.actionPattern ?? "*",
    resourcePattern: input.resourcePattern ?? "*",
    casteList: input.casteList === undefined ? null : input.casteList ? [...input.casteList] : null,
    decision: normalizeDecision(input.decision ?? PolicyDecision.DENY),
    priority: input.priority ?? 0,
    enabled: input.enabled ?? true,
  };
}

function normalizeContext(
  input: Omit<PolicyContext, "metadata" | "timestamp"> & Partial<Pick<PolicyContext, "metadata" | "timestamp">>,
): PolicyContext {
  return {
    actorCaste: input.actorCaste,
    actorAgentId: input.actorAgentId,
    action: input.action,
    resource: input.resource,
    metadata: input.metadata ?? {},
    timestamp: input.timestamp ?? new Date(),
  };
}

function normalizeDecision(value: PolicyDecision | `${PolicyDecision}`): PolicyDecision {
  const normalized = String(value);
  if (normalized === PolicyDecision.ALLOW) return PolicyDecision.ALLOW;
  if (normalized === PolicyDecision.AUDIT) return PolicyDecision.AUDIT;
  return PolicyDecision.DENY;
}

function matchesRule(rule: PolicyRule, context: PolicyContext): boolean {
  if (!rule.enabled) return false;
  if (rule.casteList !== null && !rule.casteList.includes(context.actorCaste)) return false;
  if (!globMatch(context.action, rule.actionPattern)) return false;
  if (!globMatch(context.resource, rule.resourcePattern)) return false;
  return true;
}

function globMatch(value: string, pattern: string): boolean {
  const regex = new RegExp(`^${escapeRegex(pattern).replace(/\*/g, ".*").replace(/\\\?/g, ".")}$`);
  return regex.test(value);
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
