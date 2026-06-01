import React from "react";
import { Box } from "ink";
import { useShallow } from "zustand/react/shallow";
import { recommendCompaction } from "../../runtime/compaction";
import type { SerializedMessage } from "../../runtime/message";
import { BudgetWidget, WelcomeBanner, summarizeRecentToolActivity, type LogMessage } from "../components";
import { useColonyStore } from "../store";
import { buildLiveSessionShortcutSnapshot } from "../../runtime/session-shortcuts";

const BUDGET_RECOMMENDATION_HISTORY_LIMIT = 160;

function buildCompactionRecommendationHistory(
  messages: LogMessage[],
  limit = BUDGET_RECOMMENDATION_HISTORY_LIMIT,
): SerializedMessage[] {
  const start = Math.max(messages.length - limit, 0);
  return messages.slice(start).map((message) => {
    const type: SerializedMessage["type"] =
      message.role === "assistant"
        ? "assistant"
        : message.role === "user"
          ? "user"
          : message.role === "tool"
            ? "tool_result"
            : "system";
    return {
      type,
      content: message.content,
      timestamp: new Date(message.timestamp).toISOString(),
      name: message.toolName,
      metadata: message.toolArgs ? { args: { ...message.toolArgs } } : undefined,
    };
  });
}

const BudgetPanel = React.memo(function BudgetPanel() {
  // ── Single batched selector (30 individual calls → 1) ──────────────────────
  const {
    showBudget,
    tokensUsed,
    maxTokens,
    costUsd,
    maxUsd,
    callCount,
    deniedCount,
    pendingCompactionStrategy,
    contextUsage,
    lastCompactionFailure,
    lastCompaction,
    workspaceInfo,
    startupReport,
    providerHealth,
    recentFailovers,
    recentHookEvents,
    latestCompactionHandoff,
    persistedSessions,
    provider,
    model,
    selectedProvider,
    selectedModel,
    memoryTruthModeOverride,
    sessionId: currentSessionId,
    agentId: currentAgentId,
    rawCaste,
    messages,
    pendingApprovalToolName,
    pendingApprovalRiskLevel,
    pendingApprovalSummary,
  } = useColonyStore(
    useShallow((state) => ({
      showBudget: state.showBudget,
      tokensUsed: state.tokensUsed,
      maxTokens: state.maxTokens,
      costUsd: state.costUsd,
      maxUsd: state.maxUsd,
      callCount: state.callCount,
      deniedCount: state.deniedCount,
      pendingCompactionStrategy: state.pendingCompactionStrategy,
      contextUsage: state.contextUsage,
      lastCompactionFailure: state.lastCompactionFailure,
      lastCompaction: state.lastCompaction,
      workspaceInfo: state.workspaceInfo,
      startupReport: state.startupReport,
      providerHealth: state.providerHealth,
      recentFailovers: state.recentFailovers,
      recentHookEvents: state.recentHookEvents,
      latestCompactionHandoff: state.latestCompactionHandoff,
      persistedSessions: state.persistedSessions,
      provider: state.provider,
      model: state.model,
      selectedProvider: state.selectedProvider,
      selectedModel: state.selectedModel,
      memoryTruthModeOverride: state.memoryTruthModeOverride,
      sessionId: state.sessionId,
      agentId: state.agentId,
      rawCaste: state.caste,
      messages: state.messages,
      pendingApprovalToolName: state.pendingApproval?.toolName ?? null,
      pendingApprovalRiskLevel: state.pendingApproval?.riskLevel ?? null,
      pendingApprovalSummary: state.pendingApproval?.summary ?? null,
    })),
  );

  // ── Values derived from messages (no extra subscriptions needed) ───────────
  const currentCaste = String(rawCaste);
  const currentMessageCount = messages.length;
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const currentStartedMessageTimestamp = messages.length > 0 ? (messages[0]?.timestamp ?? null) : null;
  const currentLatestMessageTimestamp = lastMsg?.timestamp ?? null;
  const currentPreviewText = lastMsg?.content ?? "";
  const currentPreviewRole = lastMsg?.role ?? null;
  const currentAwaitingReply = lastMsg?.role === "user";

  const liveSessionShortcuts = buildLiveSessionShortcutSnapshot({
    currentSessionId,
    currentMessageCount,
    currentLatestMessageTimestamp,
    currentAwaitingReply,
    persistedSessions,
  });

  const compactionRecommendation = React.useMemo(() => recommendCompaction({
    pendingStrategy: pendingCompactionStrategy,
    contextUsage,
    history: buildCompactionRecommendationHistory(messages),
    messageCount: messages.length,
    caste: currentCaste,
  }), [contextUsage, currentCaste, messages, pendingCompactionStrategy]);

  const recentToolActivity = React.useMemo(
    () => summarizeRecentToolActivity(messages, 3),
    [messages],
  );

  if (!showBudget) return null;

  return (
    <Box width={40}>
      <BudgetWidget
        tokensUsed={tokensUsed}
        maxTokens={maxTokens}
        costUsd={costUsd}
        maxUsd={maxUsd}
        callCount={callCount}
        deniedCount={deniedCount}
        pendingCompactionStrategy={pendingCompactionStrategy}
        contextUsage={contextUsage}
        lastCompactionFailure={lastCompactionFailure}
        lastCompaction={lastCompaction}
        workspaceInfo={workspaceInfo}
        startupReport={startupReport}
        providerHealth={providerHealth}
        recentFailovers={recentFailovers}
        recentHookEvents={recentHookEvents}
        latestCompactionHandoff={latestCompactionHandoff}
        persistedSessions={persistedSessions}
        provider={provider}
        model={model}
        selectedProvider={selectedProvider}
        selectedModel={selectedModel}
        memoryTruthModeOverride={memoryTruthModeOverride}
        currentSessionId={currentSessionId}
        currentAgentId={currentAgentId}
        currentCaste={currentCaste}
        currentStartedMessageTimestamp={currentStartedMessageTimestamp}
        currentLatestMessageTimestamp={currentLatestMessageTimestamp}
        currentMessageCount={currentMessageCount}
        currentPreviewText={currentPreviewText}
        currentPreviewRole={currentPreviewRole}
        currentAwaitingReply={currentAwaitingReply}
        compactionRecommendationStrategy={compactionRecommendation.strategy}
        compactionRecommendationReason={compactionRecommendation.reason}
        microCandidateCount={compactionRecommendation.microCandidateCount}
        microTokensSavedEstimate={compactionRecommendation.microTokensSavedEstimate}
        pendingApprovalToolName={pendingApprovalToolName}
        pendingApprovalRiskLevel={pendingApprovalRiskLevel}
        pendingApprovalSummary={pendingApprovalSummary}
        recentToolActivity={recentToolActivity}
      />
    </Box>
  );
});

export default BudgetPanel;
