/**
 * Gateway command parser and executor.
 *
 * Ports the Python slash-command surface into a TypeScript model that keeps
 * parsing, command semantics, and UI-side execution separate.
 */

import type { SerializedMessage } from "./runtime/message";
import {
  parseDeniedToolResultMessage,
  parsePendingApprovalMessage,
} from "./runtime/approval";
import {
  recommendCompaction,
  type CompactionStrategy,
} from "./runtime/compaction";
import {
  appendLastCompactionDetails,
  appendLastCompactionFailureDetails,
  buildCompactCommandPayload,
  compactionTriggerLabel,
} from "./gateway-compact";
import {
  buildEventsCommandPayload,
  buildPerfCommandPayload,
  compactionPressureLabel,
  eventsInspectViews,
  formatRuntimeEventLine,
  latestCompactionHandoffEntry,
  perfInspectViews,
  recentCompactionEntries,
  recentHookEvents,
  recentRuntimeEvents,
  timedRuntimeEvents,
} from "./gateway-events";
import {
  activeRuleCount,
  activeSchemaCount,
  allowedToolCount,
  buildToolsCommandPayload,
  buildPermissionsCommandPayload,
  deniedToolCount,
  permissionsInspectViews,
  recentToolActivity,
  type GatewayToolActivity,
  toolsInspectViews,
} from "./gateway-tools";
import {
  buildProviderCommandPayload,
  formatProviderHealthSummary,
  latestFailoverSummary,
  normalizeProviderAlias,
  providerPerfSummaries,
  providerRecoveryHints,
  resolveConfiguredProvider,
  providerInspectViews,
} from "./gateway-provider";
import {
  buildDoctorCommandPayload,
  type DoctorFilterSpec,
  doctorInspectHints,
  isTerminalRelatedCheck,
} from "./gateway-doctor";
import {
  buildWorkspaceCommandPayload,
  renderWorkspaceDetailLines,
  type WorkspaceViewMode,
} from "./gateway-workspace";
import {
  buildCostCommandPayload,
  costSummary,
  estimatedCostUsd,
  readModelUsage,
  renderCostPerfBreakdown,
} from "./gateway-cost";
import {
  buildHooksCommandPayload,
  buildStatusCommandPayload,
  renderStatusRuntimeSection,
  hooksInspectViews,
  renderStatusSavedSection,
  renderStatusSessionSection,
  renderModelStatusView,
} from "./gateway-runtime";
import {
  buildArtifactCommandPayload,
  buildHistoryCommandPayload,
  buildResumeCommandPayload,
  buildSessionsCommandPayload,
  currentSessionHistoryExcerpt,
  interruptionLabel,
  joinCommandChoices,
  latestCurrentSessionExcerpt,
  matchSessionFilters,
  matchSessionQuery,
  noActiveSessionCompactHint,
  noActiveSessionHistoryHint,
  noCurrentSessionCatalogHint,
  noPendingSessionCatalogHint,
  normalizeHistoryCount,
  parseSessionQuery,
  previewRoleLabel,
  resolveResumeTarget,
  resumeHistoryInspectHint,
  renderArtifactCatalogLoading,
  renderArtifactLatestLoading,
  renderArtifactNoSession,
  renderArtifactOpen,
  renderResumeCurrentSession,
  renderResumeLoading,
  renderSessionsCatalog,
  renderSessionsEmptyCatalog,
  renderSessionsSearchMiss,
  sessionFilterLabel,
  sessionShortcutAliases,
  stableSessionIndex,
  type HistoryFilterMode,
  type SessionShortcutAlias,
} from "./gateway-session";
import { buildGatewayCurrentSessionSnapshot } from "./gateway-session-snapshot";
import {
  parsePersistedToolResultMessage,
  type PersistedToolResult,
} from "./runtime/tool-result-storage";
import {
  buildBudgetCommandPayload,
  buildExitCommandPayload,
  COMMAND_HELP,
  formatHelp,
  formatPermissions,
  renderCasteView,
  renderHelpView,
} from "./gateway-basic";
import { buildSwarmCommandPayload } from "./gateway-swarm";
import { buildDaemonCommandPayload } from "./gateway-daemon";
import { buildChannelsCommandPayload } from "./gateway-channels";
import { buildBrowserCommandPayload } from "./gateway-browser";
import { buildSkillsCommandPayload } from "./gateway-skills";
import { buildCapabilitiesCommandPayload } from "./gateway-capabilities";
import { buildGitHubCommandPayload } from "./gateway-github";
import { buildPluginsCommandPayload } from "./gateway-plugins";
import { buildAuditCommandPayload } from "./gateway-audit";
import {
  buildCancelCommandPayload,
  buildClearCommandPayload,
  buildMemoryCommandPayload,
  buildModelCommandPayload,
} from "./gateway-control";
import {
  parseCommand,
  shellSplit,
  type CommandIntent,
  type CommandType,
} from "./gateway-parse";
import {
  result,
  type CommandAction,
  type CommandHandler,
  type CommandResult,
  type SlashCommandContext,
} from "./gateway-contract";
import {
  clearSessionHistory,
  historyTimestampBoundary,
  messageCount,
  readNumber,
  readString,
  sessionHistory,
} from "./gateway-shared";
import { resolveArtifactPath } from "./gateway-execute";
import { buildGatewayDoctorSnapshot } from "./gateway-doctor-snapshot";
import { buildGatewayProviderSnapshot } from "./gateway-provider-snapshot";
import { buildGatewayStatusSnapshot } from "./gateway-status-snapshot";
import {
  buildGatewayEventsSnapshot,
  buildGatewayPerfSnapshot,
} from "./gateway-events-snapshot";
import { buildWorkflowCommandPayload } from "./gateway-workflow";
import type { WorkflowRecipeRuntime } from "./workflow/recipes/executable-recipes";
export {
  executeCommand,
  type CommandExecutionHandlers,
} from "./gateway-execute";
export {
  formatHelp,
  formatCaste,
  formatPermissions,
  formatStatus,
} from "./gateway-basic";
export {
  result,
  type CommandAction,
  type CommandHandler,
  type CommandResult,
  type SlashCommandContext,
} from "./gateway-contract";
export { parseCommand, type CommandIntent, type CommandType } from "./gateway-parse";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Parser helpers
// ---------------------------------------------------------------------------

function compactRecommendation(
  ctx: SlashCommandContext,
  count: number,
) {
  return recommendCompaction({
    pendingStrategy: ctx.runtime?.pendingCompactionStrategy,
    contextUsage: ctx.contextUsage,
    history: sessionHistory(ctx.session),
    messageCount: count,
    caste: readString(ctx.session, ["caste"], ctx.permissions?.caste ?? "assist_ant"),
  });
}

// ---------------------------------------------------------------------------
// SlashCommandParser
// ---------------------------------------------------------------------------

export class SlashCommandParser {
  private readonly commands = new Map<string, CommandHandler>();
  private readonly aliases = new Map<string, string>();

  constructor(private readonly context: SlashCommandContext = {}) {
    this.register("help", this.cmdHelp);
    this.register("status", this.cmdStatus);
    this.register("sessions", this.cmdSessions);
    this.register("history", this.cmdHistory);
    this.register("artifact", this.cmdArtifact);
    this.register("model", this.cmdModel);
    this.register("memory", this.cmdMemory);
    this.register("perf", this.cmdPerf);
    this.register("tools", this.cmdTools);
    this.register("events", this.cmdEvents);
    this.register("workflow", this.cmdWorkflow);
    this.register("daemon", this.cmdDaemon);
    this.register("channels", this.cmdChannels);
    this.register("browser", this.cmdBrowser);
    this.register("skills", this.cmdSkills);
    this.register("capabilities", this.cmdCapabilities);
    this.register("github", this.cmdGitHub);
    this.register("plugins", this.cmdPlugins);
    this.register("audit", this.cmdAudit);
    this.register("cancel", this.cmdCancel);
    this.register("clear", this.cmdClear);
    this.register("resume", this.cmdResume);
    this.register("compact", this.cmdCompact);
    this.register("cost", this.cmdCost);
    this.register("caste", this.cmdCaste);
    this.register("permissions", this.cmdPermissions);
    this.register("hooks", this.cmdHooks);
    this.register("doctor", this.cmdDoctor);
    this.register("workspace", this.cmdWorkspace);
    this.register("provider", this.cmdProvider);
    this.register("swarm", this.cmdSwarm);
    this.register("budget", this.cmdBudget);
    this.register("exit", this.cmdExit);

    this.alias("?", "help");
    this.alias("hive", "swarm");
    this.alias("channel", "channels");
    this.alias("capability", "capabilities");
    this.alias("transcript", "history");
    this.alias("perms", "permissions");
    this.alias("quit", "exit");
    this.alias("ws", "workspace");
    this.alias("diag", "doctor");
  }

  register(name: string, handler: CommandHandler): void {
    this.commands.set(name.toLowerCase().replace(/^\//, ""), handler);
  }

  alias(alias: string, target: string): void {
    this.aliases.set(
      alias.toLowerCase().replace(/^\//, ""),
      target.toLowerCase().replace(/^\//, ""),
    );
  }

  get availableCommands(): string[] {
    return [...this.commands.keys()].sort();
  }

  tryHandle(userInput: string, context: SlashCommandContext = {}): CommandResult {
    const text = userInput.trim();
    if (!text.startsWith("/")) {
      return result({ handled: false, action: undefined });
    }

    const parts = shellSplit(text);
    const rawName = (parts[0] ?? "").slice(1).toLowerCase();
    if (!rawName) {
      return result({ handled: false, action: undefined });
    }

    const command = this.aliases.get(rawName) ?? rawName;
    const handler = this.commands.get(command);
    if (!handler) {
      return result({
        command: rawName,
        output: `Unknown command: /${rawName}. Type /help for available commands.`,
        isError: true,
      });
    }

    try {
      return handler(parts.slice(1), { ...this.context, ...context });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return result({
        command,
        output: `Command /${command} failed: ${message}`,
        isError: true,
      });
    }
  }

  private cmdHelp = (_args: string[], _ctx: SlashCommandContext): CommandResult => {
    return result({
      command: "help",
      output: renderHelpView(this.availableCommands),
      data: { commands: this.availableCommands },
    });
  };

  private cmdStatus = (_args: string[], ctx: SlashCommandContext): CommandResult => {
    if (_args[0]?.toLowerCase() === "operator") {
      (ctx as Record<string, unknown>).statusView = "operator";
    }
    const snapshot = buildGatewayStatusSnapshot(ctx);
    const payload = buildStatusCommandPayload({
      args: _args,
      ...snapshot,
    });
    return result({
      command: "status",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
    });
  };

  private cmdSessions = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const sessions = [...(ctx.sessions ?? [])];
    const currentSession = buildGatewayCurrentSessionSnapshot(ctx.session, sessions);
    const payload = buildSessionsCommandPayload({
      args,
      sessions,
      currentSessionId: currentSession.currentSessionId,
      currentPendingState: currentSession.currentPendingState,
      currentHistoryCommands: currentSession.currentHistoryCommands,
      latestSessionId: currentSession.latestPersistedAliasSessionId,
    });
    return result({
      command: "sessions",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
      action: payload.action as CommandAction | undefined,
    });
  };

  private cmdHistory = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const { reference, count, filter, search } = normalizeHistoryCount(args);
    const sessions = [...(ctx.sessions ?? [])];
    const currentSession = buildGatewayCurrentSessionSnapshot(ctx.session, sessions);
    const payload = buildHistoryCommandPayload({
      reference,
      count,
      filter,
      search,
      sessions,
      currentSessionId: currentSession.currentSessionId,
      currentHistoryAliases: currentSession.currentHistoryAliases,
      currentExcerpt:
        count === 1
          ? currentSession.currentExcerpt
          : currentSessionHistoryExcerpt(ctx.session, count),
      latestCurrentExcerpt:
        count === 1
          ? currentSession.latestCurrentExcerpt
          : latestCurrentSessionExcerpt(ctx.session, sessions, count),
      latestSessionId: currentSession.latestPersistedAliasSessionId,
    });
    return result({
      command: "history",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
      action: payload.action as CommandAction | undefined,
    });
  };

  private cmdArtifact = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const payload = buildArtifactCommandPayload({
      args,
      sessionId: readString(ctx.session, ["sessionId", "session_id"]),
      resolveArtifactPath,
    });
    return result({
      command: "artifact",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
      action: payload.action as CommandAction | undefined,
    });
  };

  private cmdTools = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const permissions = ctx.permissions;
    const approvals = ctx.approvals;
    const recentActivity = recentToolActivity(ctx.session, 5);
    const activeTools = [...(permissions?.active ?? [])].sort();
    const permittedTools = [...(permissions?.allowed ?? [])].sort();
    const deniedTools = [...(permissions?.denied ?? [])].sort();
    const payload = buildToolsCommandPayload({
      args,
      activeTools,
      permittedTools,
      deniedTools,
      sessionRuleCount: activeRuleCount({ approvals, permissions }),
      pendingApproval: approvals?.pending && approvals.toolName
        ? {
          toolName: approvals.toolName,
          riskLevel: approvals.riskLevel,
          category: approvals.category,
          signature: approvals.signature,
          summary: approvals.summary,
          reason: approvals.reason,
          warningCount: approvals.warningCount,
        }
        : null,
      recentActivity,
      toolDefinitions: ctx.toolDefinitions,
    });

    return result({
      command: "tools",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
    });
  };

  private cmdCancel = (_args: string[], _ctx: SlashCommandContext): CommandResult => {
    const payload = buildCancelCommandPayload();
    return result({
      command: "cancel",
      output: payload.output,
      data: payload.data ?? {},
      action: payload.action as CommandAction | undefined,
    });
  };

  private cmdClear = (_args: string[], ctx: SlashCommandContext): CommandResult => {
    const payload = buildClearCommandPayload(clearSessionHistory(ctx.session));
    return result({
      command: "clear",
      output: payload.output,
      data: payload.data ?? {},
      action: payload.action as CommandAction | undefined,
    });
  };

  private cmdResume = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const reference = args.join(" ").trim();
    const sessions = [...(ctx.sessions ?? [])];
    const currentSession = buildGatewayCurrentSessionSnapshot(ctx.session, sessions);
    const payload = buildResumeCommandPayload({
      reference,
      sessions,
      currentSessionId: currentSession.currentSessionId,
      currentSessionState: currentSession.currentPendingState,
      currentSessionHistoryCommands: currentSession.currentHistoryCommands,
      currentSessionIdForResume: currentSession.currentSessionIdForResume,
      latestCurrentSessionId: currentSession.latestCurrentSessionId,
      latestSessionId: currentSession.latestPersistedAliasSessionId,
    });
    return result({
      command: "resume",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
      action: payload.action as CommandAction | undefined,
    });
  };

  private cmdCompact = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const count = messageCount(ctx.session);
    const payload = buildCompactCommandPayload({
      args,
      hasLiveSession: Boolean(ctx.session),
      messageCount: count,
      activeRun: Boolean(ctx.runtime?.activeRun),
      queuedStrategy: ctx.runtime?.pendingCompactionStrategy ?? null,
      recommendation: compactRecommendation(ctx, count),
      recentEvents: recentCompactionEntries(ctx),
      handoff: latestCompactionHandoffEntry(ctx),
      lastCompactionFailure: ctx.lastCompactionFailure ?? null,
      lastCompaction: ctx.lastCompaction ?? null,
      contextUsage: ctx.contextUsage ?? null,
      noActiveHint: noActiveSessionCompactHint(ctx.sessions ?? []),
    });
    return result({
      command: "compact",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
      action: payload.action as CommandAction | undefined,
    });
  };

  private cmdCost = (_args: string[], ctx: SlashCommandContext): CommandResult => {
    const tracker = ctx.costTracker;
    const modelRows = readModelUsage(tracker);
    const payload = buildCostCommandPayload({
      args: _args,
      summary: tracker && typeof tracker === "object" && typeof (tracker as Record<string, unknown>).formatSummary === "function"
        ? String(((tracker as Record<string, unknown>).formatSummary as () => string)())
        : undefined,
      totals: tracker && typeof tracker === "object"
        ? {
            input: readNumber(tracker, ["totalInputTokens", "total_input_tokens"]),
            output: readNumber(tracker, ["totalOutputTokens", "total_output_tokens"]),
            cacheReads: readNumber(tracker, ["totalCacheReadTokens", "total_cache_read_tokens"]),
            cacheWrites: readNumber(tracker, ["totalCacheCreationTokens", "total_cache_creation_tokens"]),
            tokens: readNumber(
              tracker,
              ["totalTokens", "total_tokens"],
              readNumber(tracker, ["totalInputTokens", "total_input_tokens"])
              + readNumber(tracker, ["totalOutputTokens", "total_output_tokens"])
              + readNumber(tracker, ["totalCacheReadTokens", "total_cache_read_tokens"])
              + readNumber(tracker, ["totalCacheCreationTokens", "total_cache_creation_tokens"]),
            ),
            cost: readNumber(tracker, ["estimatedCostUsd", "estimated_cost_usd"]),
            apiDurationS: readNumber(tracker, ["apiDurationS", "api_duration_s"]),
          }
        : undefined,
      modelRows,
      budget: ctx.budget,
      estimatedCost: estimatedCostUsd(tracker),
    });
    return result({
      command: "cost",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
    });
  };

  private cmdPerf = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const snapshot = buildGatewayPerfSnapshot(ctx);
    const payload = buildPerfCommandPayload({
      args,
      ...snapshot,
    });
    return result({
      command: "perf",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
    });
  };

  private cmdEvents = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const snapshot = buildGatewayEventsSnapshot(ctx);
    const payload = buildEventsCommandPayload({
      args,
      ...snapshot,
    });
    return result({
      command: "events",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
    });
  };

  private cmdWorkflow = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const payload = buildWorkflowCommandPayload({
      args,
      runs: ctx.runtime?.workflowRuns ?? [],
      recipeRuntime: (ctx.workflow as { recipeRuntime?: WorkflowRecipeRuntime } | undefined)?.recipeRuntime,
    });
    return result({
      command: "workflow",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
      action: payload.action as CommandAction | undefined,
    });
  };

  private cmdCaste = (_args: string[], ctx: SlashCommandContext): CommandResult => {
    const caste = readString(ctx.session, ["caste"], ctx.permissions?.caste ?? "unknown");
    return result({
      command: "caste",
      output: renderCasteView(caste),
      data: { caste },
    });
  };

  private cmdPermissions = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const payload = buildPermissionsCommandPayload({
      args,
      permissions: ctx.permissions,
      formatPermissions,
    });

    return result({
      command: "permissions",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
    });
  };

  private cmdHooks = (_args: string[], ctx: SlashCommandContext): CommandResult => {
    const payload = buildHooksCommandPayload({
      args: _args,
      hookRunner: ctx.hookRunner,
      readNumber,
      readString,
    });
    return result({
      command: "hooks",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
    });
  };

  private cmdDoctor = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const snapshot = buildGatewayDoctorSnapshot(args, ctx);
    const payload = buildDoctorCommandPayload(snapshot);

    return result({
      command: "doctor",
      output: payload.output,
      data: payload.data ?? {},
    });
  };

  private cmdWorkspace = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const payload = buildWorkspaceCommandPayload(args, ctx.workspace);

    return result({
      command: "workspace",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
    });
  };

  private cmdModel = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const payload = buildModelCommandPayload({
      args,
      runtime: ctx.runtime ?? null,
      normalizeProviderAlias,
      resolveConfiguredProvider,
    });
    return result({
      command: "model",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
      action: payload.action as CommandAction | undefined,
    });
  };

  private cmdMemory = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const payload = buildMemoryCommandPayload({
      args,
      runtime: ctx.runtime ?? null,
      session: ctx.session,
    });
    return result({
      command: "memory",
      output: payload.output,
      data: payload.data,
      isError: payload.isError,
      action: payload.action as CommandAction | undefined,
    });
  };

  private cmdProvider = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const snapshot = buildGatewayProviderSnapshot(ctx);
    const payload = buildProviderCommandPayload({
      args,
      runtime: snapshot.runtime,
      startupReport: snapshot.startupReport,
      costTracker: snapshot.costTracker,
    });
    return result({
      command: "provider",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
      action: payload.action as CommandAction | undefined,
    });
  };

  private cmdSwarm = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const payload = buildSwarmCommandPayload(args, ctx.swarm ?? {});
    return result({
      command: "swarm",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
      action: payload.action as CommandAction | undefined,
    });
  };

  private cmdDaemon = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const payload = buildDaemonCommandPayload(args, ctx.daemon ?? {});
    return result({
      command: "daemon",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
      action: payload.action as CommandAction | undefined,
    });
  };

  private cmdChannels = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const payload = buildChannelsCommandPayload(args, ctx.channels ?? {});
    return result({
      command: "channels",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
      action: payload.action as CommandAction | undefined,
    });
  };

  private cmdBrowser = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const payload = buildBrowserCommandPayload(args, ctx.browser ?? {});
    return result({
      command: "browser",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
      action: payload.action as CommandAction | undefined,
    });
  };

  private cmdSkills = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const payload = buildSkillsCommandPayload(args, {
      ...(ctx.skills ?? {}),
      toolDefinitions: ctx.skills?.toolDefinitions ?? ctx.toolDefinitions,
    });
    return result({
      command: "skills",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
      action: payload.action as CommandAction | undefined,
    });
  };

  private cmdCapabilities = (args: string[], _ctx: SlashCommandContext): CommandResult => {
    const payload = buildCapabilitiesCommandPayload(args);
    return result({
      command: "capabilities",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
    });
  };

  private cmdGitHub = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const payload = buildGitHubCommandPayload(args, ctx.github as Parameters<typeof buildGitHubCommandPayload>[1]);
    return result({
      command: "github",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
      action: payload.action as CommandAction | undefined,
    });
  };

  private cmdPlugins = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const payload = buildPluginsCommandPayload(args, ctx.plugins as Parameters<typeof buildPluginsCommandPayload>[1]);
    return result({
      command: "plugins",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
      action: payload.action as CommandAction | undefined,
    });
  };

  private cmdAudit = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const payload = buildAuditCommandPayload(args, ctx.audit as Parameters<typeof buildAuditCommandPayload>[1]);
    return result({
      command: "audit",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
    });
  };

  private cmdBudget = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const payload = buildBudgetCommandPayload({
      args,
      maxUsd: ctx.budget?.maxUsd ?? null,
      maxTokens: ctx.budget?.maxTokens ?? null,
    });
    return result({
      command: "budget",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
      action: payload.action as CommandAction | undefined,
    });
  };

  private cmdExit = (_args: string[], _ctx: SlashCommandContext): CommandResult => {
    const payload = buildExitCommandPayload();
    return result({
      command: "exit",
      output: payload.output,
      data: payload.data ?? {},
      action: payload.action as CommandAction | undefined,
    });
  };
}
