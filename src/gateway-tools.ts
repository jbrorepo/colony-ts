import {
  parseDeniedToolResultMessage,
  parsePendingApprovalMessage,
} from "./runtime/approval";
import {
  parsePersistedToolResultMessage,
  type PersistedToolResult,
} from "./runtime/tool-result-storage";
import type { ToolDefinition } from "./runtime/tools-registry";

export type ToolsViewMode = "summary" | "approvals" | "recent" | "artifacts" | "perf";
export type PermissionsViewMode = "summary" | "active" | "allowed" | "denied" | "rules";

export interface GatewayToolActivity {
  toolName: string;
  status: string;
  detail?: string;
  artifactPath?: string;
  durationMs?: number;
  timestamp?: string;
}

export interface GatewayPendingApprovalView {
  toolName: string;
  riskLevel?: string;
  category?: string;
  signature?: string;
  summary?: string;
  reason?: string;
  warningCount?: number;
}

export interface GatewayToolsCommandPayload {
  output: string;
  isError?: boolean;
  data?: Record<string, unknown>;
}

export type GatewayToolDefinitionView = Pick<
  ToolDefinition,
  "toolId" | "category" | "requiresApproval" | "metadata"
>;

function readString(obj: unknown, keys: string[], fallback = ""): string {
  if (!obj || typeof obj !== "object") return fallback;
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (value != null) return String(value);
  }
  return fallback;
}

function readNumber(obj: unknown, keys: string[], fallback = 0): number {
  if (!obj || typeof obj !== "object") return fallback;
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return fallback;
}

function firstContentLine(content: string): string {
  const line = String(content ?? "")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(Boolean);
  return line ?? "";
}

export function summarizeToolHistoryEntry(entry: unknown): GatewayToolActivity | null {
  if (!entry || typeof entry !== "object") return null;
  const record = entry as Record<string, unknown>;
  const toolName = readString(record, ["name", "toolName"]);
  if (!toolName) return null;

  const content = readString(record, ["content"]);
  const pendingApproval = parsePendingApprovalMessage(content);
  if (pendingApproval) {
    return {
      toolName,
      status: "pending approval",
      detail: `${pendingApproval.riskLevel}/${pendingApproval.category} | ${pendingApproval.summary}`,
      timestamp: readString(record, ["timestamp"]),
    };
  }

  const denied = parseDeniedToolResultMessage(content);
  if (denied) {
    return {
      toolName,
      status: denied.status.replace(/\.$/, ""),
      detail: `${denied.riskLevel}/${denied.category} | ${denied.summary}`,
      timestamp: readString(record, ["timestamp"]),
    };
  }

  const externalizedResult =
    typeof record.externalizedResult === "object" && record.externalizedResult !== null
      ? record.externalizedResult as PersistedToolResult
      : parsePersistedToolResultMessage(content);
  if (externalizedResult) {
    return {
      toolName,
      status: "saved artifact",
      detail: `${externalizedResult.originalSize.toLocaleString()} chars`,
      artifactPath: externalizedResult.filepath,
      timestamp: readString(record, ["timestamp"]),
    };
  }

  const role = readString(record, ["role"]);
  const type = readString(record, ["type"]);
  if (role !== "tool" && role !== "error" && type !== "tool_result") {
    return null;
  }

  const detailParts: string[] = [];
  const durationMs = readNumber(record, ["executionTimeMs", "toolDurationMs"], 0);
  if (durationMs > 0) {
    detailParts.push(`${durationMs}ms`);
  }
  const preview = firstContentLine(content);
  if (preview) {
    detailParts.push(preview.length > 88 ? `${preview.slice(0, 85)}...` : preview);
  }

  return {
    toolName,
    status: role === "error" || Boolean(record.isError) ? "error" : "ok",
    detail: detailParts.length > 0 ? detailParts.join(" | ") : undefined,
    durationMs: durationMs > 0 ? durationMs : undefined,
    timestamp: readString(record, ["timestamp"]),
  };
}

export function recentToolActivity(session: unknown, limit = 5): GatewayToolActivity[] {
  if (!session || typeof session !== "object") return [];
  const history = Array.isArray((session as Record<string, unknown>).history)
    ? (session as Record<string, unknown>).history as unknown[]
    : [];
  const recent: GatewayToolActivity[] = [];

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const summary = summarizeToolHistoryEntry(history[index]);
    if (!summary) continue;
    recent.push(summary);
    if (recent.length >= limit) break;
  }

  return recent;
}

export function activeRuleCount(ctx: {
  approvals?: { sessionRuleCount?: number } | null;
  permissions?: { sessionRules?: string[] } | null;
}): number {
  return Math.max(0, ctx.approvals?.sessionRuleCount ?? 0, ctx.permissions?.sessionRules?.length ?? 0);
}

export function activeSchemaCount(ctx: {
  permissions?: { active?: string[] } | null;
}): number {
  return Math.max(0, ctx.permissions?.active?.length ?? 0);
}

export function allowedToolCount(ctx: {
  permissions?: { allowed?: string[] } | null;
}): number {
  return Math.max(0, ctx.permissions?.allowed?.length ?? 0);
}

export function deniedToolCount(ctx: {
  permissions?: { denied?: string[] } | null;
}): number {
  return Math.max(0, ctx.permissions?.denied?.length ?? 0);
}

export function toolsInspectViews(): string {
  return "/tools | /tools approvals | /tools recent | /tools artifacts | /tools perf";
}

export function resolveToolsView(args: string[]): ToolsViewMode | { error: string } {
  const raw = args[0]?.trim().toLowerCase();
  if (!raw || raw === "summary" || raw === "all") return "summary";
  if (raw === "approvals" || raw === "approval") return "approvals";
  if (raw === "recent" || raw === "activity") return "recent";
  if (raw === "artifacts" || raw === "artifact") return "artifacts";
  if (raw === "perf" || raw === "performance" || raw === "timing") return "perf";
  return {
    error: `Unknown tools view '${raw}'.\n\nViews: ${toolsInspectViews()}`,
  };
}

export function permissionsInspectViews(): string {
  return "/permissions | /permissions active | /permissions allowed | /permissions denied | /permissions rules";
}

export function resolvePermissionsView(args: string[]): PermissionsViewMode | { error: string } {
  const raw = args[0]?.trim().toLowerCase();
  if (!raw || raw === "summary" || raw === "all") return "summary";
  if (raw === "active") return "active";
  if (raw === "allowed" || raw === "allow") return "allowed";
  if (raw === "denied" || raw === "deny") return "denied";
  if (raw === "rules" || raw === "exact") return "rules";
  return {
    error: `Unknown permissions view '${raw}'.\n\nViews: ${permissionsInspectViews()}`,
  };
}

export function renderToolsView(opts: {
  view: ToolsViewMode;
  activeTools: string[];
  permittedTools: string[];
  deniedTools: string[];
  sessionRuleCount: number;
  pendingApproval: GatewayPendingApprovalView | null;
  recentActivity: GatewayToolActivity[];
  toolDefinitions?: GatewayToolDefinitionView[];
}): string {
  const artifacts = opts.recentActivity.filter((activity) => Boolean(activity.artifactPath));
  const activeSet = new Set(opts.activeTools);
  const metadataRows = [...(opts.toolDefinitions ?? [])]
    .filter((definition) => activeSet.size === 0 || activeSet.has(definition.toolId))
    .sort((left, right) => left.toolId.localeCompare(right.toolId))
    .slice(0, 12)
    .map(formatToolMetadataRow);
  const lines = ["Tool Activity:", ""];

  if (opts.view === "summary") {
    lines.push(`Active now: ${opts.activeTools.length}`);
    if (opts.activeTools.length > 0) {
      lines.push(`Schemas active: ${opts.activeTools.join(", ")}`);
    }
    lines.push(`Permitted this session: ${opts.permittedTools.length}`);
    lines.push(`Denied by policy: ${opts.deniedTools.length}`);
    if (metadataRows.length > 0) {
      lines.push("");
      lines.push("Tool metadata:");
      lines.push(...metadataRows);
      const hiddenCount = Math.max(0, (opts.toolDefinitions ?? []).length - metadataRows.length);
      if (hiddenCount > 0) {
        lines.push(`... ${hiddenCount} more tool definitions hidden`);
      }
    }
    lines.push("Inspect policy: /permissions");
    lines.push(`Views: ${toolsInspectViews()}`);
    lines.push("");
  }

  if (opts.view === "summary" || opts.view === "approvals") {
    lines.push("Approval state:");
    if (opts.pendingApproval?.toolName) {
      lines.push(`Pending approval: ${opts.pendingApproval.toolName}`);
      lines.push(`Risk: ${opts.pendingApproval.riskLevel ?? "unknown"} | Category: ${opts.pendingApproval.category ?? "unknown"}`);
      if (opts.pendingApproval.signature) lines.push(`Signature: ${opts.pendingApproval.signature}`);
      if (opts.pendingApproval.summary) lines.push(`Summary: ${opts.pendingApproval.summary}`);
      if (opts.pendingApproval.reason) lines.push(`Reason: ${opts.pendingApproval.reason}`);
      if (typeof opts.pendingApproval.warningCount === "number" && opts.pendingApproval.warningCount > 0) {
        lines.push(`Warnings: ${opts.pendingApproval.warningCount}`);
      }
      lines.push("Control: y/n/a/s/esc");
    } else {
      lines.push("Pending approval: none");
    }
    lines.push(`Exact-call session rules: ${opts.sessionRuleCount} (/permissions rules)`);
    if (opts.view === "approvals") {
      lines.push("");
      lines.push("Inspect policy: /permissions");
      lines.push(`Views: ${toolsInspectViews()}`);
    }
  }

  if (opts.view === "summary" || opts.view === "recent") {
    if (opts.view === "summary") lines.push("");
    lines.push("Recent tool activity:");
    if (opts.recentActivity.length === 0) {
      lines.push("(No tool activity in current live transcript)");
    } else {
      opts.recentActivity.forEach((activity, index) => {
        const summary = [`${index + 1}. ${activity.toolName}`, activity.status];
        if (activity.detail) summary.push(activity.detail);
        lines.push(summary.join(" | "));
        if (activity.artifactPath) {
          lines.push(`   Reopen: /artifact "${activity.artifactPath}"`);
        }
      });
      if (artifacts.length > 0) {
        lines.push("Inspect latest: /artifact latest");
      }
    }
    if (opts.view === "recent") {
      lines.push("");
      lines.push(`Views: ${toolsInspectViews()}`);
    }
  }

  if (opts.view === "artifacts") {
    lines.push("Saved artifacts:");
    if (artifacts.length === 0) {
      lines.push("(No saved tool artifacts in current live transcript)");
    } else {
      artifacts.forEach((activity, index) => {
        lines.push(`${index + 1}. ${activity.toolName} | ${activity.detail ?? "saved artifact"}`);
        lines.push(`   Reopen: /artifact "${activity.artifactPath}"`);
      });
    }
    lines.push("");
    lines.push("Inspect latest: /artifact latest");
    lines.push(`Views: ${toolsInspectViews()}`);
  }

  if (opts.view === "perf") {
    const measured = opts.recentActivity.filter((activity) => typeof activity.durationMs === "number" && activity.durationMs > 0);
    const errorCount = opts.recentActivity.filter((activity) => activity.status === "error" || activity.status.toLowerCase().includes("denied")).length;
    lines.push("Tool Performance:");
    lines.push(`Recent events: ${opts.recentActivity.length}`);
    lines.push(`Timed events: ${measured.length}`);
    lines.push(`Errors/denials: ${errorCount}`);
    lines.push(`Artifacts saved: ${artifacts.length}`);
    if (measured.length === 0) {
      lines.push("(No timed tool activity in current live transcript)");
    } else {
      const totalDuration = measured.reduce((sum, activity) => sum + (activity.durationMs ?? 0), 0);
      const averageDuration = Math.round(totalDuration / measured.length);
      const slowest = measured.reduce((current, activity) =>
        (activity.durationMs ?? 0) > (current.durationMs ?? 0) ? activity : current,
      );
      lines.push(`Average duration: ${averageDuration}ms`);
      lines.push(`Slowest: ${slowest.toolName} | ${slowest.durationMs}ms${slowest.detail ? ` | ${slowest.detail}` : ""}`);
      for (const activity of measured.slice().sort((left, right) => (right.durationMs ?? 0) - (left.durationMs ?? 0)).slice(0, 3)) {
        lines.push(`- ${activity.toolName} | ${activity.durationMs}ms | ${activity.status}${activity.detail ? ` | ${activity.detail}` : ""}`);
      }
    }
    lines.push("");
    lines.push(`Views: ${toolsInspectViews()}`);
  }

  return lines.join("\n");
}

export function renderPermissionsView(opts: {
  view: PermissionsViewMode;
  active: string[];
  allowed: string[];
  denied: string[];
  sessionRules: string[];
}): string {
  const lines = ["Tool Permissions:", ""];

  if (opts.view === "summary" || opts.view === "active") {
    lines.push(`Active tool schemas: ${opts.active.length}`);
    lines.push(...(opts.active.length > 0 ? opts.active.map((name) => `* ${name}`) : ["none"]));
    if (opts.view === "active") {
      lines.push("");
      lines.push(`Views: ${permissionsInspectViews()}`);
      return lines.join("\n");
    }
    lines.push("");
  }

  if (opts.view === "summary" || opts.view === "allowed") {
    lines.push(`Allowed tools: ${opts.allowed.length}`);
    lines.push(...(opts.allowed.length > 0 ? opts.allowed.map((name) => `+ ${name}`) : ["none"]));
    if (opts.view === "allowed") {
      lines.push("");
      lines.push(`Views: ${permissionsInspectViews()}`);
      return lines.join("\n");
    }
    lines.push("");
  }

  if (opts.view === "summary" || opts.view === "denied") {
    lines.push(`Denied tools: ${opts.denied.length}`);
    lines.push(...(opts.denied.length > 0 ? opts.denied.map((name) => `- ${name}`) : ["none"]));
    if (opts.view === "denied") {
      lines.push("");
      lines.push(`Views: ${permissionsInspectViews()}`);
      return lines.join("\n");
    }
    lines.push("");
  }

  lines.push(`Exact-signature session rules: ${opts.sessionRules.length}`);
  lines.push(...(opts.sessionRules.length > 0 ? opts.sessionRules.map((rule) => `= ${rule}`) : ["none"]));
  lines.push("");
  lines.push(`Views: ${permissionsInspectViews()}`);
  return lines.join("\n");
}

export function buildToolsCommandPayload(opts: {
  args: string[];
  activeTools: string[];
  permittedTools: string[];
  deniedTools: string[];
  sessionRuleCount: number;
  pendingApproval: GatewayPendingApprovalView | null;
  recentActivity: GatewayToolActivity[];
  toolDefinitions?: GatewayToolDefinitionView[];
}): GatewayToolsCommandPayload {
  const artifacts = opts.recentActivity.filter((activity) => Boolean(activity.artifactPath));
  const view = resolveToolsView(opts.args);
  if (typeof view !== "string") {
    return {
      output: view.error,
      isError: true,
    };
  }

  return {
    output: renderToolsView({
      view,
      activeTools: opts.activeTools,
      permittedTools: opts.permittedTools,
      deniedTools: opts.deniedTools,
      sessionRuleCount: opts.sessionRuleCount,
      pendingApproval: opts.pendingApproval,
      recentActivity: opts.recentActivity,
      toolDefinitions: opts.toolDefinitions,
    }),
    data: {
      activeCount: opts.activeTools.length,
      permittedCount: opts.permittedTools.length,
      deniedCount: opts.deniedTools.length,
      sessionRuleCount: opts.sessionRuleCount,
      pendingApproval: Boolean(opts.pendingApproval?.toolName),
      recentCount: opts.recentActivity.length,
      artifactCount: artifacts.length,
      metadataCount: opts.toolDefinitions?.length ?? 0,
      view,
    },
  };
}

function formatToolMetadataRow(definition: GatewayToolDefinitionView): string {
  const metadata = definition.metadata;
  const capabilities: string[] = [];
  capabilities.push(metadata.readOnly ? "read-only" : "mutating");
  if (metadata.destructive) capabilities.push("destructive");
  if (metadata.search.indexed) capabilities.push("search");
  capabilities.push(`safe=${metadata.concurrency}`);
  capabilities.push(`interrupt=${metadata.interrupt}`);
  capabilities.push(`progress=${metadata.progress}`);
  capabilities.push(`transcript=${metadata.transcript.output}`);
  capabilities.push(`persist=${metadata.persistedResult.mode}@${metadata.persistedResult.thresholdBytes}B`);
  capabilities.push(`approval=${definition.requiresApproval ? "required" : "policy"}`);
  return `${definition.toolId} | ${capabilities.join(" | ")}`;
}

export function buildPermissionsCommandPayload(opts: {
  args: string[];
  permissions: {
    caste?: string;
    active?: string[];
    allowed?: string[];
    denied?: string[];
    sessionRules?: string[];
  } | null | undefined;
  formatPermissions: (
    caste: string,
    active: string[],
    allowed: string[],
    denied: string[],
    sessionRules: string[],
  ) => string;
}): GatewayToolsCommandPayload {
  if (!opts.permissions) {
    return {
      output: "Tool permissions are not available in this context.",
    };
  }

  const view = resolvePermissionsView(opts.args);
  if (typeof view !== "string") {
    return {
      output: view.error,
      isError: true,
    };
  }

  const active = [...(opts.permissions.active ?? [])].sort();
  const allowed = [...(opts.permissions.allowed ?? [])].sort();
  const denied = [...(opts.permissions.denied ?? [])].sort();
  const sessionRules = [...(opts.permissions.sessionRules ?? [])].sort();

  return {
    output: view === "summary"
      ? `${opts.formatPermissions(
          opts.permissions.caste ?? "unknown",
          active,
          allowed,
          denied,
          sessionRules,
        )}\nViews: ${permissionsInspectViews()}`
      : renderPermissionsView({
          view,
          active,
          allowed,
          denied,
          sessionRules,
        }),
    data: {
      ...opts.permissions,
      view,
    } as Record<string, unknown>,
  };
}
