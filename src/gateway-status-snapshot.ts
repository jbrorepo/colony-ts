import type { SerializedMessage } from "./runtime/message";
import {
  appendLastCompactionDetails,
  appendLastCompactionFailureDetails,
} from "./gateway-compact";
import {
  eventsInspectViews,
  latestCompactionHandoffEntry,
  perfInspectViews,
  recentRuntimeEvents,
  timedRuntimeEvents,
} from "./gateway-events";
import {
  formatProviderHealthSummary,
  latestFailoverSummary,
  normalizeProviderAlias,
  providerRecoveryHints,
} from "./gateway-provider";
import { doctorInspectHints } from "./gateway-doctor";
import { renderWorkspaceDetailLines } from "./gateway-workspace";
import { costSummary, estimatedCostUsd } from "./gateway-cost";
import {
  hooksInspectViews,
  renderStatusRuntimeSection,
  renderStatusSavedSection,
  renderStatusSessionSection,
} from "./gateway-runtime";
import {
  currentSessionHistoryCommands,
  currentSessionHistoryExcerpt,
  currentSessionShortcutAliases,
  effectiveLatestPersistedAliasSessionId,
  interruptionLabel,
  joinCommandChoices,
  previewRoleLabel,
} from "./gateway-session";
import type { SlashCommandContext } from "./gateway-contract";
import {
  activeRuleCount,
  activeSchemaCount,
  allowedToolCount,
  deniedToolCount,
  permissionsInspectViews,
  toolsInspectViews,
} from "./gateway-tools";
import {
  historyTimestampBoundary,
  messageCount,
  readNumber,
  readString,
} from "./gateway-shared";
import { memoryTruthModeLabel } from "./memory/hybrid-memory";
import { startupDoctorInspectCommands } from "./runtime/startup-diagnostics";
import {
  activeWorkflowCount,
  workflowStatusLines,
} from "./gateway-workflow";

export type GatewayStatusSnapshot = Omit<
  Parameters<typeof import("./gateway-runtime").buildStatusCommandPayload>[0],
  "args"
>;

export function buildGatewayStatusSnapshot(
  ctx: SlashCommandContext,
): GatewayStatusSnapshot {
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

  const interruptRequested = runtime ? Boolean(runtime.interruptRequested) : false;
  const runActive = runtime ? (runtime.activeRun ?? runtime.isThinking ?? runtime.interruptRequested ?? false) : false;
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
  const operatorActionLines = buildRuntimeOperatorActionLines({
    hasRuntime: Boolean(runtime),
    runActive,
    interruptRequested,
    queuedPromptCount: runtime?.queuedPromptCount ?? 0,
    queuedCompactionStrategy: runtime?.pendingCompactionStrategy,
    approvalPending: Boolean(ctx.approvals?.pending),
    hasRuntimeEvents: runtimeEvents.length > 0,
    activeWorkflowCount: activeWorkflowCount(runtime?.workflowRuns ?? []),
    hasStartupIssues: Boolean(ctx.startupReport && !ctx.startupReport.passed),
    hasProviderRecovery: runtimeRecoveryHints.length > 0,
    hasCompactionFailure: Boolean(ctx.lastCompactionFailure?.message),
    budgetNeedsAttention: Boolean(budgetLines?.some((line) => line.startsWith("Action:"))),
  });

  if ((ctx as Record<string, unknown>).statusView === "operator") {
    runtimeLines = [
      "Operator Dashboard:",
      "",
      `Runtime: ${runActive ? "active" : "idle"}`,
      `Browser: ${ctx.browser?.runtime?.snapshot().status ?? "available"}`,
      `Workflow: ${activeWorkflowCount(runtime?.workflowRuns ?? [])} active`,
      `Plugins: ${Array.isArray((ctx.plugins as { entries?: unknown[] } | undefined)?.entries) ? (ctx.plugins as { entries?: unknown[] }).entries?.length ?? 0 : 0} trusted entries`,
      `Approval state: ${ctx.approvals?.pending ? "pending" : "none"}`,
      `Artifacts: inspect /artifact latest or /workflow artifacts <run_id>`,
      `Cost/tokens: ${costSummary(tracker)}`,
      "Blocked reason: none",
      "Next valid command: /browser status | /workflow recipes | /plugins status | /audit status",
    ];
    return {
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
    };
  }

  runtimeLines = renderStatusRuntimeSection({
    hasRuntime: Boolean(runtime),
    selectedProvider: runtime && (runtime.selectedProvider || runtime.selectedModel)
      ? (runtime.selectedProvider ?? runtime.provider ?? "unknown")
      : undefined,
    selectedModel: runtime && (runtime.selectedProvider || runtime.selectedModel)
      ? (runtime.selectedModel ?? runtime.model ?? "unknown")
      : undefined,
    memoryRecallLine: buildStatusMemoryRecallLine(runtime),
    provider: runtime?.provider ?? "unknown",
    model: runtime?.model ?? "unknown",
    circuitState: runtime?.circuitState ?? "unknown",
    runActive,
    interruptLine: runActive
      ? interruptRequested
        ? "Interrupt: cancellation requested; waiting for shutdown."
        : "Interrupt: /cancel | Ctrl+C | Esc"
      : undefined,
    inspectLine: runActive
      ? `Inspect: ${joinCommandChoices([
          "/status",
          "/cost",
          currentSessionId.length > 0 ? "/history current 8" : "",
          ...liveHistoryAliases.map((alias) => `/history ${alias} 8`),
          currentSessionId.length > 0 ? `/history ${currentSessionId} 8` : "",
        ])}`
      : undefined,
    queuedPromptLine: (runtime?.queuedPromptCount ?? 0) > 0
      ? `Queued prompt: ${runtime?.queuedPromptCount} pending${runtime?.queuedPromptPreview ? ` | ${runtime.queuedPromptPreview}` : ""}`
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
    workflowLines: workflowStatusLines(runtime?.workflowRuns ?? []),
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
    startupInspectLine: ctx.startupReport && !ctx.startupReport.passed
      ? `Inspect: ${startupDoctorInspectCommands(ctx.startupReport, {
          includeGeneral: true,
          includeSeverity: true,
          includeFirstRun: true,
        }).join(" | ")}`
      : undefined,
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
    operatorActionLines,
  });

  return {
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
  };
}

function buildRuntimeOperatorActionLines(opts: {
  hasRuntime: boolean;
  runActive: boolean;
  interruptRequested: boolean;
  queuedPromptCount: number;
  queuedCompactionStrategy?: string | null;
  approvalPending: boolean;
  hasRuntimeEvents: boolean;
  activeWorkflowCount: number;
  hasStartupIssues: boolean;
  hasProviderRecovery: boolean;
  hasCompactionFailure: boolean;
  budgetNeedsAttention: boolean;
}): string[] {
  if (!opts.hasRuntime) return [];

  const lines: string[] = [];
  if (opts.runActive) {
    lines.push(opts.interruptRequested
      ? "- Stopping run: /status runtime | /events recent | /history current 8"
      : "- Active run: /cancel | /events recent | /status runtime");
  }
  if (opts.queuedPromptCount > 0) {
    lines.push("- Queued prompt: /status runtime | /history current 8");
  }
  if (opts.queuedCompactionStrategy) {
    lines.push("- Queued compaction: /compact status | /compact recent | /compact handoff");
  }
  if (opts.approvalPending) {
    lines.push("- Pending approval: /tools approvals | /permissions rules");
  }
  if (opts.hasStartupIssues) {
    lines.push("- Startup issue: /doctor errors | /doctor warnings | /doctor first-run");
  }
  if (opts.hasProviderRecovery) {
    lines.push("- Provider recovery: /provider current | /provider failovers | /doctor");
  }
  if (opts.hasCompactionFailure) {
    lines.push("- Compaction failure: /compact status | /compact recent | /doctor");
  }
  if (opts.hasRuntimeEvents) {
    lines.push("- Runtime events: /events recent | /events failures | /events perf");
  }
  if (opts.activeWorkflowCount > 0) {
    lines.push("- Workflow attention: /workflow active | /workflow latest");
  }
  if (opts.budgetNeedsAttention) {
    lines.push("- Budget watch: /cost | /cost perf | /budget <usd>");
  }
  if (lines.length > 0) {
    lines.push("- Performance baseline: /perf | /cost perf | /events perf");
  }

  return [...new Set(lines)];
}

function buildStatusMemoryRecallLine(
  runtime: SlashCommandContext["runtime"] | null,
): string {
  const mode = memoryTruthModeLabel(runtime?.memoryTruthModeOverride ?? null);
  const recall = runtime?.lastMemoryRecall;
  if (!recall) {
    return `Memory recall: ${mode} | /memory`;
  }
  const shown = [
    `exact ${recall.exact?.shown ?? 0}/${recall.exact?.total ?? 0}`,
    `compact ${recall.compact?.shown ?? 0}/${recall.compact?.total ?? 0}`,
    `structured ${recall.structured?.shown ?? 0}/${recall.structured?.total ?? 0}`,
    `palace ${recall.palace?.direct?.shown ?? 0}/${recall.palace?.direct?.total ?? 0},${recall.palace?.nearby?.shown ?? 0}/${recall.palace?.nearby?.total ?? 0},${recall.palace?.broader?.shown ?? 0}/${recall.palace?.broader?.total ?? 0},${recall.palace?.related?.shown ?? 0}/${recall.palace?.related?.total ?? 0}`,
  ].join(" | ");
  return `Memory recall: ${mode} | last ${memoryTruthModeLabel(recall.truthMode ?? null)} ${recall.truthModeSource ?? "inferred"} | ${recall.sectionOrder?.join(">") || "none"} | ${shown} | /memory`;
}
