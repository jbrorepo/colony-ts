import React from "react";
import { useShallow } from "zustand/react/shallow";
import { startupDoctorFocusCommand } from "../../runtime/startup-diagnostics";
import {
  buildLiveCurrentHistoryHint,
  buildLiveSessionShortcutSnapshot,
} from "../../runtime/session-shortcuts";
import { StatusBar } from "../components";
import { useColonyStore } from "../store";

const StatusPanel = React.memo(function StatusPanel() {
  // ── Single batched selector (20 individual calls → 1) ─────────────────────
  const {
    activeRunId,
    interruptRequested,
    isThinking,
    thinkingPhase,
    sessionId: currentSessionId,
    messages,
    pendingApprovalTool,
    queuedPromptCount,
    queuedPromptPreview,
    loopDetected,
    loopTool,
    circuitState,
    provider,
    model,
    selectedProvider,
    selectedModel,
    memoryTruthModeOverride,
    toolCount,
    pendingCompactionStrategy,
    startupReport,
    recentFailovers,
    recentHookEvents,
    persistedSessions,
  } = useColonyStore(
    useShallow((state) => ({
      activeRunId: state.activeRunId,
      interruptRequested: state.interruptRequested,
      isThinking: state.isThinking,
      thinkingPhase: state.thinkingPhase,
      sessionId: state.sessionId,
      messages: state.messages,
      pendingApprovalTool: state.pendingApproval?.toolName ?? null,
      queuedPromptCount: state.queuedPromptCount,
      queuedPromptPreview: state.queuedPromptPreview,
      loopDetected: state.loopDetected,
      loopTool: state.loopTool,
      circuitState: state.circuitState,
      provider: state.provider,
      model: state.model,
      selectedProvider: state.selectedProvider,
      selectedModel: state.selectedModel,
      memoryTruthModeOverride: state.memoryTruthModeOverride,
      toolCount: state.toolCount,
      pendingCompactionStrategy: state.pendingCompactionStrategy,
      startupReport: state.startupReport,
      recentFailovers: state.recentFailovers,
      recentHookEvents: state.recentHookEvents,
      persistedSessions: state.persistedSessions,
    })),
  );

  // ── Derived from messages (no extra subscriptions) ─────────────────────────
  const activeRun = Boolean(activeRunId);
  const currentMessageCount = messages.length;
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const currentLatestMessageTimestamp = lastMsg?.timestamp ?? null;
  const currentAwaitingReply = lastMsg?.role === "user";

  const liveSessionShortcuts = buildLiveSessionShortcutSnapshot({
    currentSessionId,
    currentMessageCount,
    currentLatestMessageTimestamp,
    currentAwaitingReply,
    persistedSessions,
  });
  const activeHistoryHint = buildLiveCurrentHistoryHint(liveSessionShortcuts, 8);
  const startupInspectCommand = startupDoctorFocusCommand(startupReport);

  return (
    <StatusBar
      activeRun={activeRun}
      interruptRequested={interruptRequested}
      isThinking={isThinking}
      thinkingLabel={thinkingPhase}
      activeHistoryHint={activeHistoryHint}
      queuedPromptCount={queuedPromptCount}
      queuedPromptPreview={queuedPromptPreview}
      pendingApprovalTool={pendingApprovalTool}
      loopDetected={loopDetected}
      loopTool={loopTool}
      circuitState={circuitState}
      provider={provider}
      model={model}
      selectedProvider={selectedProvider}
      selectedModel={selectedModel}
      memoryTruthModeOverride={memoryTruthModeOverride}
      toolCount={toolCount}
      pendingCompactionStrategy={pendingCompactionStrategy}
      startupErrors={startupReport?.errorCount ?? 0}
      startupWarnings={startupReport?.warningCount ?? 0}
      startupInspectCommand={startupInspectCommand}
      recentFailoverCount={recentFailovers.length}
      recentHookCount={recentHookEvents.length}
      sessionCatalogCount={persistedSessions.length}
      interruptedSessionCount={persistedSessions.filter((session) => session.interruption !== "none").length}
    />
  );
});

export default StatusPanel;
