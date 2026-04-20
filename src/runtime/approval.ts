/**
 * Conservative tool approval service.
 *
 * Every tool call requires user approval unless an exact session allow rule is
 * present. Policy denials happen before any user prompt.
 */

import { randomUUID, createHash } from "crypto";

import {
  SecurityAuditTrail,
  SecurityEventType,
} from "../security/audit-trail";
import { PermissionBehavior } from "../security/permission-decision";
import {
  PolicyDecision as SecurityPolicyDecision,
  SecurityPolicyEngine,
  createDefaultSecurityPolicyEngine,
} from "../security/policy";
import { ToolPermissionChecker } from "./tool-permissions";
import type { StructuredLogger } from "./logger";

export type ApprovalScope = "once" | "session" | "deny" | "cancel";

export interface ApprovalRequest {
  requestId: string;
  sessionId: string;
  agentId: string;
  caste: string;
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  category: string;
  riskLevel: "low" | "medium" | "high";
  summary: string;
  details: string;
  warnings: string[];
  reason: string;
  createdAt: string;
  signature: string;
}

export interface ApprovalDecision {
  requestId: string;
  scope: ApprovalScope;
  approved: boolean;
  reason?: string;
  updatedArguments?: Record<string, unknown>;
  decidedAt: string;
}

export type ApprovalResolver = (request: ApprovalRequest) => Promise<ApprovalDecision>;

export interface SessionApprovalPolicy {
  isAllowed(request: ApprovalRequest): boolean;
  addAllowRule(request: ApprovalRequest): string;
  clear(): void;
  listRules(): string[];
}

export interface ApprovalContext {
  sessionId: string;
  agentId: string;
  caste: string;
  category?: string;
}

export interface ApprovalToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ApprovalEvaluation {
  approved: boolean;
  request: ApprovalRequest;
  decision: ApprovalDecision;
  arguments: Record<string, unknown>;
  deniedBeforePrompt: boolean;
}

export interface DeniedToolResultMessage {
  status: string;
  reason: string;
  riskLevel: ApprovalRequest["riskLevel"];
  category: string;
  signature: string;
  summary: string;
  warnings: string[];
}

export interface PendingApprovalMessage {
  status: string;
  reason: string;
  riskLevel: ApprovalRequest["riskLevel"];
  category: string;
  signature: string;
  summary: string;
  details: string[];
  warnings: string[];
}

const PENDING_APPROVAL_OPEN = "<pending-approval>";
const PENDING_APPROVAL_CLOSE = "</pending-approval>";

export function createApprovalDecision(
  requestId: string,
  scope: ApprovalScope,
  opts: {
    reason?: string;
    updatedArguments?: Record<string, unknown>;
  } = {},
): ApprovalDecision {
  return {
    requestId,
    scope,
    approved: scope === "once" || scope === "session",
    reason: opts.reason,
    updatedArguments: opts.updatedArguments,
    decidedAt: new Date().toISOString(),
  };
}

export function formatDeniedToolResultMessage(evaluation: ApprovalEvaluation): string {
  const status = evaluation.deniedBeforePrompt
    ? "Denied before execution."
    : evaluation.decision.scope === "cancel"
      ? "Cancelled by operator."
      : "Denied by operator.";
  const lines = [
    status,
    `Reason: ${evaluation.decision.reason ?? "User denied approval."}`,
    `Risk: ${evaluation.request.riskLevel} | Category: ${evaluation.request.category}`,
    `Signature: ${evaluation.request.signature}`,
    `Summary: ${evaluation.request.summary}`,
  ];
  for (const warning of evaluation.request.warnings.slice(0, 3)) {
    lines.push(`Warning: ${warning}`);
  }
  return lines.join("\n");
}

export function parseDeniedToolResultMessage(content: string): DeniedToolResultMessage | null {
  const lines = String(content ?? "").trim().split(/\r?\n/);
  if (lines.length < 5) return null;

  const status = lines[0] ?? "";
  if (
    status !== "Denied before execution."
    && status !== "Denied by operator."
    && status !== "Cancelled by operator."
  ) {
    return null;
  }

  const reasonMatch = /^Reason: (.+)$/.exec(lines[1] ?? "");
  const riskMatch = /^Risk: (low|medium|high) \| Category: (.+)$/.exec(lines[2] ?? "");
  const signatureMatch = /^Signature: (.+)$/.exec(lines[3] ?? "");
  const summaryMatch = /^Summary: (.+)$/.exec(lines[4] ?? "");
  if (!reasonMatch || !riskMatch || !signatureMatch || !summaryMatch) return null;

  const warnings: string[] = [];
  for (const line of lines.slice(5)) {
    const warningMatch = /^Warning: (.+)$/.exec(line);
    if (!warningMatch) return null;
    warnings.push(warningMatch[1]);
  }

  return {
    status,
    reason: reasonMatch[1],
    riskLevel: riskMatch[1] as ApprovalRequest["riskLevel"],
    category: riskMatch[2],
    signature: signatureMatch[1],
    summary: summaryMatch[1],
    warnings,
  };
}

export function formatPendingApprovalMessage(request: ApprovalRequest): string {
  const detailLines = request.details
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
  return [
    PENDING_APPROVAL_OPEN,
    "Approval required.",
    `Reason: ${request.reason}`,
    `Risk: ${request.riskLevel} | Category: ${request.category}`,
    `Signature: ${request.signature}`,
    `Summary: ${request.summary}`,
    ...detailLines.map((line) => `Detail: ${line}`),
    ...request.warnings.slice(0, 5).map((warning) => `Warning: ${warning}`),
    PENDING_APPROVAL_CLOSE,
  ].join("\n");
}

export function parsePendingApprovalMessage(content: string): PendingApprovalMessage | null {
  const trimmed = String(content ?? "").trim();
  if (!trimmed.startsWith(PENDING_APPROVAL_OPEN) || !trimmed.endsWith(PENDING_APPROVAL_CLOSE)) {
    return null;
  }

  const lines = trimmed.split(/\r?\n/).slice(1, -1);
  if (lines.length < 5) return null;
  if ((lines[0] ?? "") !== "Approval required.") return null;

  const reasonMatch = /^Reason: (.+)$/.exec(lines[1] ?? "");
  const riskMatch = /^Risk: (low|medium|high) \| Category: (.+)$/.exec(lines[2] ?? "");
  const signatureMatch = /^Signature: (.+)$/.exec(lines[3] ?? "");
  const summaryMatch = /^Summary: (.+)$/.exec(lines[4] ?? "");
  if (!reasonMatch || !riskMatch || !signatureMatch || !summaryMatch) return null;

  const details: string[] = [];
  const warnings: string[] = [];
  for (const line of lines.slice(5)) {
    const detailMatch = /^Detail: (.+)$/.exec(line);
    if (detailMatch) {
      details.push(detailMatch[1]);
      continue;
    }
    const warningMatch = /^Warning: (.+)$/.exec(line);
    if (warningMatch) {
      warnings.push(warningMatch[1]);
      continue;
    }
    return null;
  }

  return {
    status: "Approval required.",
    reason: reasonMatch[1],
    riskLevel: riskMatch[1] as ApprovalRequest["riskLevel"],
    category: riskMatch[2],
    signature: signatureMatch[1],
    summary: summaryMatch[1],
    details,
    warnings,
  };
}

export function normalizeApprovalArguments(args: Record<string, unknown>): string {
  return JSON.stringify(sortJsonValue(args));
}

export function approvalSignature(
  toolName: string,
  args: Record<string, unknown>,
): string {
  const normalized = normalizeApprovalArguments(args);
  const hash = createHash("sha256").update(`${toolName}:${normalized}`).digest("hex");
  return `${toolName}:${hash.slice(0, 16)}`;
}

export class ExactSessionApprovalPolicy implements SessionApprovalPolicy {
  private _rules = new Set<string>();

  constructor(initialRules: string[] = []) {
    this.replaceRules(initialRules);
  }

  isAllowed(request: ApprovalRequest): boolean {
    return this._rules.has(request.signature);
  }

  addAllowRule(request: ApprovalRequest): string {
    this._rules.add(request.signature);
    return request.signature;
  }

  clear(): void {
    this._rules.clear();
  }

  replaceRules(rules: string[]): void {
    this._rules = new Set(
      rules
        .filter((rule) => typeof rule === "string" && rule.length > 0)
        .sort(),
    );
  }

  listRules(): string[] {
    return Array.from(this._rules).sort();
  }
}

export class ToolApprovalService {
  private _checker: ToolPermissionChecker;
  private _securityPolicy: SecurityPolicyEngine;
  private _auditTrail?: SecurityAuditTrail;
  private _resolver: ApprovalResolver | null;
  private _policy: SessionApprovalPolicy;
  private _logger?: StructuredLogger;

  constructor(opts: {
    checker?: ToolPermissionChecker;
    securityPolicy?: SecurityPolicyEngine;
    auditTrail?: SecurityAuditTrail;
    resolver?: ApprovalResolver | null;
    policy?: SessionApprovalPolicy;
    logger?: StructuredLogger;
  } = {}) {
    this._checker = opts.checker ?? new ToolPermissionChecker();
    this._securityPolicy = opts.securityPolicy ?? createDefaultSecurityPolicyEngine();
    this._auditTrail = opts.auditTrail;
    this._resolver = opts.resolver ?? null;
    this._policy = opts.policy ?? new ExactSessionApprovalPolicy();
    this._logger = opts.logger;
  }

  get policy(): SessionApprovalPolicy {
    return this._policy;
  }

  createRequest(call: ApprovalToolCall, context: ApprovalContext): ApprovalRequest {
    return buildApprovalRequest(call, context);
  }

  async evaluate(
    call: ApprovalToolCall,
    context: ApprovalContext,
    request = buildApprovalRequest(call, context),
  ): Promise<ApprovalEvaluation> {
    const policyDecision = this._checker.evaluate(call.name, context.agentId, context.caste);

    if (policyDecision.behavior !== PermissionBehavior.ALLOW) {
      const decision = createApprovalDecision(request.requestId, "deny", {
        reason: policyDecision.reason.detail,
      });
      this._logger?.warn("tool_approval_policy_denied", {
        sessionId: context.sessionId,
        agentId: context.agentId,
        caste: context.caste,
        toolName: call.name,
        reason: decision.reason,
      });
      await this._recordAudit(SecurityEventType.PERMISSION_DENIED, context, call, "denied", {
        reason: decision.reason,
        source: "tool_permission_checker",
      });
      return {
        approved: false,
        request,
        decision,
        arguments: call.arguments,
        deniedBeforePrompt: true,
      };
    }

    const specificDenial = this._specificPolicyDenial(call, context);
    if (specificDenial) {
      const decision = createApprovalDecision(request.requestId, "deny", {
        reason: specificDenial,
      });
      this._logger?.warn("tool_approval_safety_denied", {
        sessionId: context.sessionId,
        agentId: context.agentId,
        caste: context.caste,
        toolName: call.name,
        reason: specificDenial,
      });
      await this._recordAudit(SecurityEventType.POLICY_DENY, context, call, "denied", {
        reason: specificDenial,
        source: "specific_safety_policy",
      });
      return {
        approved: false,
        request,
        decision,
        arguments: call.arguments,
        deniedBeforePrompt: true,
      };
    }

    const policyEvaluation = this._securityPolicy.evaluate({
      actorCaste: context.caste,
      actorAgentId: context.agentId,
      action: policyActionForTool(call.name),
      resource: filePathArgument(call) || "*",
      metadata: {
        toolName: call.name,
        category: context.category ?? request.category,
      },
    });

    if (policyEvaluation.decision === SecurityPolicyDecision.DENY) {
      const decision = createApprovalDecision(request.requestId, "deny", {
        reason: policyEvaluation.reason,
      });
      this._logger?.warn("tool_approval_security_policy_denied", {
        sessionId: context.sessionId,
        agentId: context.agentId,
        caste: context.caste,
        toolName: call.name,
        reason: decision.reason,
      });
      await this._recordAudit(SecurityEventType.POLICY_DENY, context, call, "denied", {
        reason: decision.reason,
        source: "security_policy_engine",
        matchedRule: policyEvaluation.matchedRule,
      });
      return {
        approved: false,
        request,
        decision,
        arguments: call.arguments,
        deniedBeforePrompt: true,
      };
    }

    if (policyEvaluation.decision === SecurityPolicyDecision.AUDIT) {
      request.warnings.push(`Security policy audit: ${policyEvaluation.reason}`);
      this._logger?.warn("tool_approval_security_policy_audit", {
        sessionId: context.sessionId,
        agentId: context.agentId,
        caste: context.caste,
        toolName: call.name,
        matchedRule: policyEvaluation.matchedRule,
      });
      await this._recordAudit(SecurityEventType.POLICY_AUDIT, context, call, "audit", {
        reason: policyEvaluation.reason,
        matchedRule: policyEvaluation.matchedRule,
      });
    }

    if (this._policy.isAllowed(request)) {
      const decision = createApprovalDecision(request.requestId, "session", {
        reason: "Allowed by exact session approval rule.",
      });
      await this._recordAudit(SecurityEventType.PERMISSION_GRANTED, context, call, "approved", {
        scope: decision.scope,
        reason: decision.reason,
      });
      return {
        approved: true,
        request,
        decision,
        arguments: call.arguments,
        deniedBeforePrompt: false,
      };
    }

    if (!this._resolver) {
      const decision = createApprovalDecision(request.requestId, "deny", {
        reason: "No approval resolver is available for conservative tool execution.",
      });
      await this._recordAudit(SecurityEventType.PERMISSION_DENIED, context, call, "denied", {
        scope: decision.scope,
        reason: decision.reason,
      });
      return {
        approved: false,
        request,
        decision,
        arguments: call.arguments,
        deniedBeforePrompt: true,
      };
    }

    this._logger?.info("tool_approval_requested", {
      sessionId: context.sessionId,
      agentId: context.agentId,
      caste: context.caste,
      toolName: call.name,
      requestId: request.requestId,
      riskLevel: request.riskLevel,
    });

    const decision = await this._resolver(request);
    if (decision.approved && decision.scope === "session") {
      this._policy.addAllowRule(request);
    }

    this._logger?.info("tool_approval_resolved", {
      sessionId: context.sessionId,
      agentId: context.agentId,
      caste: context.caste,
      toolName: call.name,
      requestId: request.requestId,
      scope: decision.scope,
      approved: decision.approved,
    });

    await this._recordAudit(
      decision.approved ? SecurityEventType.PERMISSION_GRANTED : SecurityEventType.PERMISSION_DENIED,
      context,
      call,
      decision.approved ? "approved" : "denied",
      {
        scope: decision.scope,
        reason: decision.reason,
      },
    );

    return {
      approved: decision.approved,
      request,
      decision,
      arguments: decision.updatedArguments ?? call.arguments,
      deniedBeforePrompt: false,
    };
  }

  private _specificPolicyDenial(
    call: ApprovalToolCall,
    context: ApprovalContext,
  ): string | null {
    if (call.name === "shell_exec") {
      const command = String(call.arguments.command ?? "");
      if (!this._checker.checkShellCommand(command, context.agentId, context.caste)) {
        return `Shell command failed caste safety policy: ${command}`;
      }
    }

    const pathValue = filePathArgument(call);
    if (pathValue && !this._checker.checkFilePath(pathValue, context.agentId, context.caste)) {
      return `File path failed caste safety policy: ${pathValue}`;
    }

    if (call.name === "http_request") {
      const url = String(call.arguments.url ?? "");
      if (url && !this._checker.checkHttpUrl(url, context.agentId, context.caste)) {
        return `URL failed caste safety policy: ${url}`;
      }
    }

    return null;
  }

  private async _recordAudit(
    eventType: SecurityEventType,
    context: ApprovalContext,
    call: ApprovalToolCall,
    outcome: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    if (!this._auditTrail) return;
    try {
      await this._auditTrail.record({
        eventType,
        actorCaste: context.caste,
        actorAgentId: context.agentId,
        action: policyActionForTool(call.name),
        resource: filePathArgument(call) || call.name,
        outcome,
        sessionId: context.sessionId,
        details: {
          toolName: call.name,
          ...details,
        },
      });
    } catch {
      // Audit trail failures must never bypass or alter approval enforcement.
    }
  }
}

export function buildApprovalRequest(
  call: ApprovalToolCall,
  context: ApprovalContext,
): ApprovalRequest {
  const category = context.category ?? inferCategory(call.name);
  const risk = inferRisk(call.name, call.arguments);
  const warnings = approvalWarnings(call.name, call.arguments, risk);
  const summary = summarizeToolCall(call.name, call.arguments);
  return {
    requestId: `apr_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    sessionId: context.sessionId,
    agentId: context.agentId,
    caste: context.caste,
    toolCallId: call.id,
    toolName: call.name,
    arguments: call.arguments,
    category,
    riskLevel: risk,
    summary,
    details: `Tool: ${call.name}\nArguments: ${normalizeApprovalArguments(call.arguments)}`,
    warnings,
    reason: "Conservative mode requires human approval for every tool call.",
    createdAt: new Date().toISOString(),
    signature: approvalSignature(call.name, call.arguments),
  };
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortJsonValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function inferCategory(toolName: string): string {
  if (toolName === "grep_search") return "search";
  if (toolName === "file_read" || toolName === "file_list") return "read";
  if (toolName.startsWith("file_")) return "write";
  if (toolName === "shell_exec") return "shell";
  if (toolName.includes("http") || toolName.includes("web")) return "web";
  return "custom";
}

function inferRisk(
  toolName: string,
  args: Record<string, unknown>,
): ApprovalRequest["riskLevel"] {
  if (toolName === "shell_exec") {
    const command = String(args.command ?? "").toLowerCase();
    if (/(rm\s+-|sudo|chmod|chown|curl.*\|.*sh|wget.*\|.*sh|mkfs|dd\s+)/.test(command)) {
      return "high";
    }
    return "medium";
  }
  if (toolName === "file_write" || toolName === "file_edit") return "medium";
  if (toolName === "file_read" || toolName === "file_list" || toolName === "grep_search") return "low";
  return "medium";
}

function approvalWarnings(
  toolName: string,
  args: Record<string, unknown>,
  risk: ApprovalRequest["riskLevel"],
): string[] {
  const warnings: string[] = [];
  if (risk === "high") warnings.push("High-risk operation detected by the safety classifier.");
  if (toolName === "shell_exec") {
    const command = String(args.command ?? "");
    if (/[|;]/.test(command)) warnings.push("Command chains multiple shell operations.");
    if (command.includes("sudo")) warnings.push("Command requests elevated privileges.");
  }
  if ((toolName === "file_write" || toolName === "file_edit") && String(args.path ?? "").includes(".env")) {
    warnings.push("Operation targets an environment/configuration file.");
  }
  return warnings;
}

function summarizeToolCall(toolName: string, args: Record<string, unknown>): string {
  if (toolName === "shell_exec") return `Execute shell command: ${String(args.command ?? "").slice(0, 160)}`;
  const pathValue = filePathArgument({ name: toolName, arguments: args, id: "" });
  if (pathValue) return `${toolName} on ${pathValue}`;
  return `Run ${toolName}`;
}

function policyActionForTool(toolName: string): string {
  if (toolName === "shell_exec") return "tool.shell.execute";
  if (toolName === "file_read") return "tool.file.read";
  if (toolName === "file_write") return "tool.file.write";
  if (toolName === "file_list") return "tool.file.list";
  if (toolName === "file_edit") return "tool.file.edit";
  if (toolName === "grep_search") return "tool.search.grep";
  if (toolName === "http_request") return "tool.web.request";
  return `tool.${toolName}`;
}

function filePathArgument(call: ApprovalToolCall): string {
  if (call.name === "file_list") return String(call.arguments.directory ?? "");
  if (call.name === "grep_search") return String(call.arguments.path ?? ".");
  if (call.name.startsWith("file_")) return String(call.arguments.path ?? "");
  return "";
}
