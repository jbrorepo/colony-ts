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
  compactionPerfSummary,
  compactionPressureLabel,
  eventsInspectViews,
  formatRuntimeEventLine,
  hookPerfSummary,
  latestCompactionHandoffEntry,
  perfInspectViews,
  recentCompactionEntries,
  recentHookEvents,
  recentRuntimeEvents,
  timedRuntimeEvents,
  toolPerfSummary,
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
  collectKnownProviders,
  configuredProviderNames,
  buildProviderCommandPayload,
  formatFailoverEventLine,
  formatProviderHealthSummary,
  latestFailoverSummary,
  normalizeProviderAlias,
  providerPerfSummaries,
  providerConfiguredModel,
  providerRecoveryHints,
  providerSearchTerms,
  providerStartupChecks,
  resolveConfiguredProvider,
  resolveProviderView,
  providerInspectViews,
} from "./gateway-provider";
import {
  buildDoctorCommandPayload,
  type DoctorFilterSpec,
  doctorCheckPrefix,
  doctorProviderDiagnosticsLines,
  doctorInspectHints,
  isTerminalRelatedCheck,
  matchDoctorCheck,
  parseDoctorArgs,
  renderDoctorFirstRunLines,
  resolveDoctorFocusProvider,
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
  currentSessionHistoryCommands,
  currentSessionHistoryExcerpt,
  currentSessionShortcutAliases,
  effectiveLatestPersistedAliasSessionId,
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
import {
  parsePersistedToolResultMessage,
  type PersistedToolResult,
} from "./runtime/tool-result-storage";
import {
  buildBudgetCommandPayload,
  buildExitCommandPayload,
  COMMAND_HELP,
  buildSwarmCommandPayload,
  formatHelp,
  formatPermissions,
  renderCasteView,
  renderHelpView,
} from "./gateway-basic";
import {
  buildCancelCommandPayload,
  buildClearCommandPayload,
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
    this.register("perf", this.cmdPerf);
    this.register("tools", this.cmdTools);
    this.register("events", this.cmdEvents);
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
    const session = ctx.session;
    const tracker = ctx.costTracker;
    const contextUsage = ctx.contextUsage ?? null;
    const runtime = ctx.runtime ?? null;
    const persistedSessions = [...(ctx.sessions ?? [])];
    const currentSessionId = readString(session, ["sessionId", "session_id"]);
    let sessionLines = renderStatusSessionSection({ hasSession: false });
    let savedLines = renderStatusSavedSection({ hasSavedSessions: false });
    let runtimeLines = ["Runtime Status:", ""];

    if (session) {
      const sessionRecord = session as Record<string, unknown>;
      const history = Array.isArray(sessionRecord.history)
        ? sessionRecord.history.filter((message): message is SerializedMessage =>
            typeof message === "object" && message !== null && typeof (message as Record<string, unknown>).type === "string",
          )
        : [];
      const currentExcerpt = history.length > 0 ? currentSessionHistoryExcerpt(session, 1) : null;
      const latestEntry = currentExcerpt?.entries[currentExcerpt.entries.length - 1];
      sessionLines = renderStatusSessionSection({
        hasSession: true,
        sessionId: readString(session, ["sessionId", "session_id"], "unknown"),
        agentId: readString(session, ["agentId", "agent_id"], "unknown"),
        caste: readString(session, ["caste"], "unknown"),
        messageCount: messageCount(session),
        startedAt: history.length > 0 ? historyTimestampBoundary(history, "first", "unknown") : undefined,
        latestMessageAt: history.length > 0 ? historyTimestampBoundary(history, "latest", "unknown") : undefined,
        currentState: currentExcerpt ? interruptionLabel(currentExcerpt.interruption) : undefined,
        latestPreview: latestEntry
          ? `${previewRoleLabel(latestEntry.role)}: ${latestEntry.previewText}`
          : undefined,
      });
    }

    if (persistedSessions.length > 0) {
      const interruptedCount = persistedSessions.filter((item) => item.interruption && item.interruption !== "none").length;
      const checkpointCount = persistedSessions.filter((item) => item.hasCheckpoint).length;
      const pendingSession = persistedSessions.find((item) => item.interruption && item.interruption !== "none");
      const latestSession = persistedSessions[0];
      const latestAliasSessionId = effectiveLatestPersistedAliasSessionId(session, persistedSessions);
      const latestAliasIsCurrent = latestAliasSessionId === null;
      const latestCurrent = currentSessionId.length > 0 && String(latestSession?.sessionId ?? "") === currentSessionId;
      const pendingCurrent = currentSessionId.length > 0 && String(pendingSession?.sessionId ?? "") === currentSessionId;
      const sameLatestPending =
        latestAliasSessionId != null
        && pendingSession?.sessionId != null
        && String(latestAliasSessionId) === String(pendingSession.sessionId);
      savedLines = renderStatusSavedSection({
        hasSavedSessions: true,
        count: persistedSessions.length,
        interruptedCount,
        checkpointCount,
        latest: latestSession?.sessionId
          ? {
              sessionId: String(latestSession.sessionId),
              isCurrent: latestCurrent,
              identity: `${latestSession.agentId ?? "unknown"} | ${latestSession.caste ?? "unknown"}`,
              savedAt: String(latestSession.savedAt ?? "unknown"),
              lastMessageAt: String(latestSession.lastMessageAt ?? "unknown"),
              state: `${interruptionLabel(String(latestSession.interruption ?? "none"))} | ${latestSession.hasCheckpoint ? "checkpoint" : "transcript-only"}`,
              usage: `${Number(latestSession.messageCount ?? 0)} msg | ${Number(latestSession.tokensUsed ?? 0).toLocaleString()} tokens | $${Number(latestSession.costUsd ?? 0).toFixed(4)}`,
              llm: latestSession.provider || latestSession.model
                ? `${latestSession.provider ?? "unknown"}:${latestSession.model ?? "unknown"}`
                : undefined,
              preview: typeof latestSession.previewText === "string" && latestSession.previewText.length > 0
                ? `${previewRoleLabel(latestSession.previewRole)}: ${latestSession.previewText}`
                : undefined,
              actionLine: latestCurrent || latestAliasIsCurrent
                ? `Latest active: ${joinCommandChoices([
                    "/status",
                    ...currentSessionHistoryCommands(session, persistedSessions),
                  ])}`
                : sameLatestPending
                  ? `Resume latest: /resume latest | /resume pending | /resume ${latestSession.sessionId}`
                  : `Resume latest: /resume latest | /resume ${latestSession.sessionId}`,
            }
          : undefined,
        pending: interruptedCount > 0 && pendingSession?.sessionId
          ? {
              sessionId: String(pendingSession.sessionId),
              isCurrent: pendingCurrent,
              identity: `${pendingSession.agentId ?? "unknown"} | ${pendingSession.caste ?? "unknown"}`,
              savedAt: String(pendingSession.savedAt ?? "unknown"),
              lastMessageAt: String(pendingSession.lastMessageAt ?? "unknown"),
              state: `${interruptionLabel(String(pendingSession.interruption ?? "none"))} | ${pendingSession.hasCheckpoint ? "checkpoint" : "transcript-only"}`,
              usage: `${Number(pendingSession.messageCount ?? 0)} msg | ${Number(pendingSession.tokensUsed ?? 0).toLocaleString()} tokens | $${Number(pendingSession.costUsd ?? 0).toFixed(4)}`,
              llm: pendingSession.provider || pendingSession.model
                ? `${pendingSession.provider ?? "unknown"}:${pendingSession.model ?? "unknown"}`
                : undefined,
              preview: typeof pendingSession.previewText === "string" && pendingSession.previewText.length > 0
                ? `${previewRoleLabel(pendingSession.previewRole)}: ${pendingSession.previewText}`
                : undefined,
              recoverLine: pendingCurrent
                ? "Recover: current pending session already active."
                : sameLatestPending
                  ? `Recover: /resume pending | /resume latest | /resume ${pendingSession.sessionId} | /sessions pending`
                  : `Recover: /resume pending | /resume ${pendingSession.sessionId} | /sessions pending`,
              inspectLine: pendingCurrent
                ? `Inspect current: ${joinCommandChoices([
                    "/status",
                    ...currentSessionHistoryCommands(session, persistedSessions),
                  ])}`
                : sameLatestPending
                  ? `Inspect pending: /history pending 8 | /history latest 8 | /history ${pendingSession.sessionId} 8`
                  : `Inspect pending: /history pending 8 | /history ${pendingSession.sessionId} 8`,
            }
          : undefined,
        inspectLine: latestCurrent || latestAliasIsCurrent
          ? `Inspect: ${joinCommandChoices([
              "/sessions",
              ...currentSessionHistoryCommands(session, persistedSessions),
            ])}`
          : sameLatestPending
            ? `Inspect: /sessions | /history latest 8 | /history pending 8 | /history ${latestSession?.sessionId ?? "unknown"} 8`
            : `Inspect: /sessions | /history latest 8 | /history ${latestSession?.sessionId ?? "unknown"} 8`,
      });
    }

    const runActive = runtime ? (runtime.activeRun ?? runtime.isThinking ?? false) : false;
    const liveHistoryAliases = currentSessionShortcutAliases(session, persistedSessions);
    const healthSummary = runtime ? formatProviderHealthSummary(runtime.providerHealth ?? {}, runtime.provider) : null;
    const failoverSummary = runtime ? latestFailoverSummary(runtime.recentFailovers ?? []) : null;
    let hooksLine: string | undefined;
    let latestHookLine: string | undefined;
    if (ctx.hookRunner && typeof ctx.hookRunner === "object") {
      const hookRecord = ctx.hookRunner as Record<string, unknown>;
      const attachedHookCount = readNumber(hookRecord, ["attachedHookCount"], 0);
      const recentHookEvents = Array.isArray(hookRecord.recentEvents)
        ? hookRecord.recentEvents
            .flatMap((event) => {
              if (!event || typeof event !== "object") return [];
              const record = event as Record<string, unknown>;
              const kind = typeof record.kind === "string" ? record.kind : "";
              const detail = typeof record.detail === "string" ? record.detail : "";
              return kind ? [{ kind, detail }] : [];
            })
        : [];
      hooksLine = `Hooks: ${attachedHookCount} attached | ${recentHookEvents.length} recent`;
      if (recentHookEvents.length > 0) {
        const latestHook = recentHookEvents[recentHookEvents.length - 1];
        latestHookLine = `Latest hook: ${latestHook?.kind ?? "unknown"}${latestHook?.detail ? ` | ${latestHook.detail}` : ""}`;
      }
    }
    const runtimeEvents = recentRuntimeEvents(ctx);
    const runtimeFailureCount = runtimeEvents.filter((event) => event.failure).length;
    const runtimeTimedCount = timedRuntimeEvents(runtimeEvents).length;
    const handoff = latestCompactionHandoffEntry(ctx);
    const runtimeRecoveryHints = runtime?.provider
      ? providerRecoveryHints(normalizeProviderAlias(runtime.provider), runtime, ctx.startupReport).slice(0, 2)
      : [];
    const inspectHints = doctorInspectHints(ctx.startupReport?.checks ?? []);
    const firstFailingCheck = (ctx.startupReport?.checks ?? []).find((check) => !check.passed);
    const lastCompactionFailureLines = ctx.lastCompactionFailure?.message
      ? (() => {
          const lines: string[] = [];
          appendLastCompactionFailureDetails(lines, ctx.lastCompactionFailure);
          return lines;
        })()
      : undefined;
    const lastCompactionLines = ctx.lastCompaction
      ? (() => {
          const lines: string[] = [];
          appendLastCompactionDetails(lines, ctx.lastCompaction);
          return lines;
        })()
      : undefined;
    const budgetLines = ctx.budget && typeof ctx.budget.maxUsd === "number" && Number.isFinite(ctx.budget.maxUsd) && ctx.budget.maxUsd > 0
      ? (() => {
          const estimatedCost = estimatedCostUsd(tracker);
          const remainingUsd = ctx.budget!.maxUsd - estimatedCost;
          const spendPct = ctx.budget!.maxUsd > 0 ? (estimatedCost / ctx.budget!.maxUsd) * 100 : 0;
          return [
            `Cap: $${ctx.budget!.maxUsd.toFixed(2)}`,
            `Remaining: $${Math.max(0, remainingUsd).toFixed(4)}`,
            `Spend: ${spendPct.toFixed(1)}%`,
            ...(remainingUsd <= 0
              ? ["Action: /budget <usd> to raise cap before next run."]
              : spendPct >= 80
                ? ["Action: Near budget cap. Use /cost for model detail or /budget <usd> to raise cap."]
                : []),
          ];
        })()
      : undefined;

    runtimeLines = renderStatusRuntimeSection({
      hasRuntime: Boolean(runtime),
      selectedProvider: runtime && (runtime.selectedProvider || runtime.selectedModel)
        ? (runtime.selectedProvider ?? runtime.provider ?? "unknown")
        : undefined,
      selectedModel: runtime && (runtime.selectedProvider || runtime.selectedModel)
        ? (runtime.selectedModel ?? runtime.model ?? "unknown")
        : undefined,
      provider: runtime?.provider ?? "unknown",
      model: runtime?.model ?? "unknown",
      circuitState: runtime?.circuitState ?? "unknown",
      runActive,
      interruptLine: runActive ? "Interrupt: /cancel | Ctrl+C | Esc" : undefined,
      inspectLine: runActive
        ? `Inspect: ${joinCommandChoices([
            "/status",
            "/cost",
            currentSessionId.length > 0 ? "/history current 8" : "",
            ...liveHistoryAliases.map((alias) => `/history ${alias} 8`),
            currentSessionId.length > 0 ? `/history ${currentSessionId} 8` : "",
          ])}`
        : undefined,
      queuedCompactionLine: runtime?.pendingCompactionStrategy ? `Queued compaction: ${runtime.pendingCompactionStrategy}` : undefined,
      observedHealthLine: healthSummary ? `Observed health: ${healthSummary}` : undefined,
      latestFailoverLine: failoverSummary ? `Latest failover: ${failoverSummary}` : undefined,
      hooksLine,
      latestHookLine,
      hookInspectLine: hooksLine ? `Inspect: ${hooksInspectViews()}` : undefined,
      eventsLine: runtimeEvents.length > 0
        ? `Events: ${runtimeEvents.length} recent | ${runtimeFailureCount} failure | ${runtimeTimedCount} timed | /events`
        : undefined,
      eventsInspectLine: runtimeEvents.length > 0 ? `Inspect events: ${eventsInspectViews()}` : undefined,
      compactionHandoffLine: handoff
        ? `Compaction handoff: ${handoff.status} | ${handoff.strategy}/${handoff.trigger} | ${handoff.loggedCount} logged | ${handoff.structuredCount} structured | /compact handoff`
        : undefined,
      perfInspectLine: "Inspect perf: /perf | /cost perf | /provider perf | /tools perf | /hooks perf | /events perf",
      recoveryLines: runtimeRecoveryHints.length > 0 || inspectHints.length > 0
        ? [
            ...runtimeRecoveryHints.map((hint) => `- ${hint}`),
            ...inspectHints.map((hint) => `Inspect: ${hint}`),
          ]
        : undefined,
      startupChecksLine: ctx.startupReport ? `Checks: ${ctx.startupReport.errorCount ?? 0} error(s), ${ctx.startupReport.warningCount ?? 0} warning(s)` : undefined,
      startupIssueLine: firstFailingCheck ? `Current issue: ${firstFailingCheck.name ?? "check"} - ${firstFailingCheck.message ?? ""}`.trim() : undefined,
      startupFixLine: firstFailingCheck?.fix ? `Fix: ${firstFailingCheck.fix}` : undefined,
      startupInspectLine: ctx.startupReport && !ctx.startupReport.passed ? "Inspect: /doctor | /doctor errors | /doctor warnings" : undefined,
      contextUsedLine: contextUsage ? `Used: ${Math.round(contextUsage.usedTokens ?? 0).toLocaleString()} / ${Math.round(contextUsage.maxTokens ?? 0).toLocaleString()} tokens` : undefined,
      contextUtilizationLine: contextUsage ? `Utilization: ${(contextUsage.percentUsed ?? 0).toFixed(1)}%` : undefined,
      contextFailureLine: contextUsage ? `Compaction failures: ${contextUsage.compactionFailureCount ?? 0}` : undefined,
      lastCompactionFailureLines,
      lastCompactionLines,
      workspaceLines: ctx.workspace ? renderWorkspaceDetailLines(ctx.workspace) : undefined,
      toolLines: [
        `Active now: ${activeSchemaCount(ctx)}`,
        `Allowed: ${allowedToolCount(ctx)} | Denied: ${deniedToolCount(ctx)}`,
        `Pending approval: ${ctx.approvals?.pending ? "yes" : "no"}`,
        `Exact-signature session rules: ${activeRuleCount(ctx)}`,
        `Inspect activity: ${toolsInspectViews()}`,
        `Inspect policy: ${permissionsInspectViews()}`,
      ],
      approvalLines: [
        `Pending: ${ctx.approvals?.pending ? "yes" : "no"}`,
        `Exact-signature session rules: ${activeRuleCount(ctx)}`,
        ...(ctx.approvals?.pending && ctx.approvals.toolName
          ? [
              `Pending request: ${[
                ctx.approvals.toolName,
                ctx.approvals.riskLevel ? `risk:${ctx.approvals.riskLevel}` : null,
                ctx.approvals.category ? `category:${ctx.approvals.category}` : null,
              ].filter(Boolean).join(" | ")}`,
              ...(ctx.approvals.summary ? [`Summary: ${ctx.approvals.summary}`] : []),
              ...((typeof ctx.approvals.warningCount === "number" && ctx.approvals.warningCount > 0) ? [`Warnings: ${ctx.approvals.warningCount}`] : []),
              ...(ctx.approvals.signature ? [`Exact signature: ${ctx.approvals.signature}`] : []),
              ...(ctx.approvals.reason ? [`Policy: ${ctx.approvals.reason}`] : []),
              "Resolve: y allow once | n deny | a exact-call session | s inspect details | esc cancel run",
            ]
          : []),
      ],
      costSummaryLine: costSummary(tracker),
      budgetLines,
    });

    const payload = buildStatusCommandPayload({
      args: _args,
      sessionLines,
      savedLines,
      runtimeLines,
      sessionId: readString(session, ["sessionId", "session_id"]),
      caste: readString(session, ["caste"]),
      messageCount: messageCount(session),
      contextUsage,
      workspace: ctx.workspace ?? null,
      provider: runtime?.provider ?? null,
      model: runtime?.model ?? null,
    });
    return result({
      command: "status",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
    });
  };

  private cmdSessions = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const currentSessionId = readString(ctx.session, ["sessionId", "session_id"]);
    const sessions = [...(ctx.sessions ?? [])];
    const currentExcerpt = currentSessionHistoryExcerpt(ctx.session, 1);
    const payload = buildSessionsCommandPayload({
      args,
      sessions,
      currentSessionId,
      currentPendingState:
        currentExcerpt && currentExcerpt.interruption !== "none"
          ? currentExcerpt.interruption
          : null,
      currentHistoryCommands: currentSessionHistoryCommands(ctx.session, sessions),
      latestSessionId: effectiveLatestPersistedAliasSessionId(ctx.session, sessions),
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
    const session = ctx.session;
    const sessions = [...(ctx.sessions ?? [])];
    const currentHistoryAliases = currentSessionShortcutAliases(session, sessions);
    const payload = buildHistoryCommandPayload({
      reference,
      count,
      filter,
      search,
      sessions,
      currentSessionId: readString(session, ["sessionId", "session_id"]),
      currentHistoryAliases,
      currentExcerpt: currentSessionHistoryExcerpt(session, count),
      latestCurrentExcerpt: latestCurrentSessionExcerpt(session, sessions, count),
      latestSessionId: effectiveLatestPersistedAliasSessionId(session, sessions),
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
      pendingApproval: approvals?.pending && approvals.toolName
        ? {
          toolName: approvals.toolName,
          riskLevel: approvals.riskLevel,
          category: approvals.category,
          summary: approvals.summary,
          reason: approvals.reason,
          warningCount: approvals.warningCount,
        }
        : null,
      recentActivity,
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
    const currentExcerpt = currentSessionHistoryExcerpt(ctx.session, 1);
    const latestCurrentExcerpt = latestCurrentSessionExcerpt(ctx.session, sessions, 1);
    const currentHistoryCommands = currentSessionHistoryCommands(ctx.session, sessions);
    const payload = buildResumeCommandPayload({
      reference,
      sessions,
      currentSessionId: readString(ctx.session, ["sessionId", "session_id"]),
      currentSessionState: currentExcerpt?.interruption ?? null,
      currentSessionHistoryCommands: currentHistoryCommands,
      currentSessionIdForResume: currentExcerpt?.sessionId ?? null,
      latestCurrentSessionId: latestCurrentExcerpt?.sessionId ?? null,
      latestSessionId: effectiveLatestPersistedAliasSessionId(ctx.session, sessions),
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
    const modelRows = readModelUsage(ctx.costTracker).filter((row) => row.callCount > 0 || row.apiDurationS > 0);
    const providerPerf = ctx.runtime ? providerPerfSummaries(ctx.costTracker, ctx.runtime) : null;
    const runtimeEvents = recentRuntimeEvents(ctx);
    const toolSummary = toolPerfSummary(ctx);
    const hookSummary = hookPerfSummary(ctx);
    const compactionSummary = compactionPerfSummary(ctx);
    const payload = buildPerfCommandPayload({
      args,
      modelRows,
      providerSummaries: providerPerf
        ? providerPerf.summaries.filter((summary) => summary.totalCalls > 0 || summary.totalApiDurationS > 0)
        : [],
      providerAmbiguousCount: providerPerf?.ambiguousRows.length ?? 0,
      providerUnmappedModels: providerPerf?.unmappedRows.map((row) => row.model) ?? [],
      runtimeEvents,
      toolSummary,
      hookSummary,
      compactionSummary,
      renderModelsView: () => renderCostPerfBreakdown({
        totalApiDurationS: ctx.costTracker && typeof ctx.costTracker === "object"
          ? readNumber(ctx.costTracker, ["apiDurationS", "api_duration_s"], modelRows.reduce((sum, row) => sum + row.apiDurationS, 0))
          : 0,
        totalCalls: ctx.costTracker && typeof ctx.costTracker === "object"
          ? readNumber(ctx.costTracker, ["callCount", "call_count"], modelRows.reduce((sum, row) => sum + row.callCount, 0))
          : 0,
        modelRows: modelRows
          .slice()
          .sort((left, right) => (
            right.apiDurationS - left.apiDurationS
            || right.callCount - left.callCount
            || left.model.localeCompare(right.model)
          )),
      }),
    });
    return result({
      command: "perf",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
    });
  };

  private cmdEvents = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const events = recentRuntimeEvents(ctx);
    const payload = buildEventsCommandPayload({
      args,
      events,
      toolCount: recentToolActivity(ctx.session, 8).length,
      hookCount: recentHookEvents(ctx).length,
      compactionCount: recentCompactionEntries(ctx).length,
      failoverCount: (ctx.runtime?.recentFailovers ?? []).slice(-8).length,
    });
    return result({
      command: "events",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
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
    const report = ctx.startupReport;
    const filterSpec = parseDoctorArgs(args);
    const allChecks = report?.checks ?? [];
    const visibleChecks = allChecks.filter((check) => matchDoctorCheck(check, filterSpec));
    const firstRunLines = filterSpec.mode === "first-run"
      ? renderDoctorFirstRunLines({
          workspaceChecks: allChecks.filter((check) => String(check.name ?? "").startsWith("Workspace ")),
          terminalChecks: allChecks.filter((check) => isTerminalRelatedCheck(check)),
          configChecks: allChecks.filter((check) => String(check.name ?? "").startsWith("Config:")),
          dataChecks: allChecks.filter((check) => {
            const name = String(check.name ?? "");
            return name === "Data directory" || name.startsWith("Permissions:");
          }),
          providerChecks: allChecks.filter((check) => {
            const name = String(check.name ?? "");
            return name === "Provider config" || name === "Default provider" || name.endsWith(" credentials") || name === "Cloud fallback";
          }),
          localChecks: allChecks.filter((check) => String(check.name ?? "").startsWith("Ollama ")),
          workspaceDetected: Boolean(ctx.workspace?.detected),
          workspaceFallback: ctx.workspace?.detected
            ? `${ctx.workspace.name} (${ctx.workspace.projectType}, ${ctx.workspace.workspaceMode ?? "single-package"})`
            : "Workspace detection pending.",
          devCommand: ctx.workspace?.devCommand,
          verifyCommand: ctx.workspace?.verifyCommand,
          devCandidate: ctx.workspace?.workspaceDevCandidates?.[0] ?? null,
          verifyCandidate: ctx.workspace?.workspaceVerifyCandidates?.[0] ?? null,
        })
      : [];
    const inspectHints = doctorInspectHints(visibleChecks);
    const focusProvider = resolveDoctorFocusProvider(filterSpec, ctx.runtime, {
      collectKnownProviders,
      providerSearchTerms,
      normalizeProviderAlias,
    });
    const providerDiagnosticsLines = doctorProviderDiagnosticsLines(focusProvider, ctx.runtime, report, {
      expandFailovers: filterSpec.mode === "failovers",
      formatProviderHealthSummary,
      latestFailoverSummary,
      formatFailoverEventLine,
      providerRecoveryHints,
    });
    const payload = buildDoctorCommandPayload({
      report,
      mode: filterSpec.mode,
      query: filterSpec.query,
      visibleChecks: visibleChecks.map((check) => ({
        ...check,
        prefix: doctorCheckPrefix(check),
      })),
      focusProvider,
      providerDiagnosticsLines,
      firstRunLines,
      inspectHints,
    });

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

  private cmdProvider = (args: string[], ctx: SlashCommandContext): CommandResult => {
    const payload = buildProviderCommandPayload({
      args,
      runtime: ctx.runtime ?? null,
      startupReport: ctx.startupReport,
      costTracker: ctx.costTracker,
      providerPerfSummaries: (tracker, runtime) =>
        providerPerfSummaries(tracker, runtime as NonNullable<SlashCommandContext["runtime"]>),
      providerRecoveryHints: (provider, runtime, report) =>
        providerRecoveryHints(provider, runtime as NonNullable<SlashCommandContext["runtime"]>, report),
      providerStartupChecks,
      formatFailoverEventLine,
      doctorCheckPrefix,
    });
    return result({
      command: "provider",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
      action: payload.action as CommandAction | undefined,
    });
  };

  private cmdSwarm = (args: string[], _ctx: SlashCommandContext): CommandResult => {
    const payload = buildSwarmCommandPayload(args.join(" ").trim());
    return result({
      command: "swarm",
      output: payload.output,
      data: payload.data ?? {},
      isError: payload.isError,
      action: payload.action as CommandAction | undefined,
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
