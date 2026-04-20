/**
 * Colony App - Main React/Ink application.
 *
 * Connects the Ant Farm terminal UI to the real AgentLoop streaming runtime.
 */

import React, { useCallback } from "react";
import { render, Text, Box, useApp, useInput, useStdin } from "ink";
import TextInput from "ink-text-input";

import { executeCommand, SlashCommandParser } from "../gateway";
import { recommendCompaction } from "../runtime/compaction";
import type { SerializedMessage } from "../runtime/message";
import { formatPendingApprovalMessage } from "../runtime/approval";
import { formatStartupPlaceholder } from "../runtime/startup-diagnostics";
import type { PersistedSessionSummary } from "../runtime/session-recovery";
import {
  Header,
  LogPane,
  StatusBar,
  BudgetWidget,
  WelcomeBanner,
  ApprovalPrompt,
  formatCasteDisplay,
  summarizeRecentToolActivity,
  type LogMessage,
} from "./components";
import { resolveSessionNavAction } from "./hotkeys";
import { useColonyLoop } from "./use-colony-loop";
import { useColonyStore } from "./store";

// ---------------------------------------------------------------------------
// ColonyApp
// ---------------------------------------------------------------------------

function buildCostSummary(store: ReturnType<typeof useColonyStore.getState>): string {
  return [
    "Session Cost",
    `Tokens: ${store.tokensUsed.toLocaleString()}/${store.maxTokens.toLocaleString()}`,
    `Calls: ${store.callCount}`,
    `Estimated cost: $${store.costUsd.toFixed(6)} / $${store.maxUsd.toFixed(2)}`,
    `Context used: ${(store.contextUsage?.percentUsed ?? 0).toFixed(1)}%`,
    store.lastCompactionFailure
      ? `Last compaction failure: ${store.lastCompactionFailure.strategy} | ${store.lastCompactionFailure.message}`
      : "Last compaction failure: none",
    store.pendingCompactionStrategy
      ? `Queued compaction: ${store.pendingCompactionStrategy}`
      : "Queued compaction: none",
    store.lastCompaction
      ? `Last compaction: ${store.lastCompaction.strategyUsed}/${store.lastCompaction.triggerSource}, saved ~${store.lastCompaction.tokensSavedEstimate} tokens, ${store.lastCompaction.strategyUsed === "micro" ? `trimmed ${store.lastCompaction.summarizedMessageCount} tool results` : `summarized ${store.lastCompaction.summarizedMessageCount} messages`}`
      : "Last compaction: none",
  ].join("\n");
}

function logMessageToSerializedMessage(message: LogMessage): SerializedMessage {
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
}

const ColonyApp: React.FC = () => {
  const { exit } = useApp();
  const {
    submit,
    cancel,
    resetSession,
    resumeSession,
    setProviderSelection,
    loadSessionHistory,
    compactNow,
    resolveApproval,
    getRuntimeSummary,
    getPermissionSummary,
  } = useColonyLoop();
  const pendingApproval = useColonyStore((state) => state.pendingApproval);
  const recentHookEvents = useColonyStore((state) => state.recentHookEvents);
  const recentCompactions = useColonyStore((state) => state.recentCompactions);
  const latestCompactionHandoff = useColonyStore((state) => state.latestCompactionHandoff);
  const scrollLog = useColonyStore((state) => state.scrollLog);
  const resetLogScroll = useColonyStore((state) => state.resetLogScroll);
  const inputLocked = Boolean(pendingApproval);
  const inspectPendingApproval = useCallback(() => {
    const store = useColonyStore.getState();
    const request = store.pendingApproval;
    if (!request) return;

    store.addMessage("system", formatPendingApprovalMessage(request), {
      toolName: request.toolName,
      toolArgs: { ...request.arguments },
    });
  }, []);

  const handleSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      const store = useColonyStore.getState();

      if (store.pendingApproval) {
        const pendingTool = store.pendingApproval.toolName || "tool call";
        store.addMessage(
          "system",
          `Approval pending for ${pendingTool}. Use y/n/a/esc to resolve it, or press s for details.`,
        );
        return;
      }

      store.setQuery("");

      const permissionSummary = getPermissionSummary();
      const runtimeSummary = getRuntimeSummary();
      const pendingApprovalSnapshot: typeof pendingApproval = useColonyStore.getState().pendingApproval;
      const parser = new SlashCommandParser({
        session: {
          sessionId: store.sessionId,
          agentId: store.agentId,
          caste: String(store.caste),
          history: [...store.messages],
        },
        costTracker: { formatSummary: () => buildCostSummary(store) },
        contextUsage: store.contextUsage,
        lastCompactionFailure: store.lastCompactionFailure,
        lastCompaction: store.lastCompaction,
        recentCompactions: recentCompactions.map((event) => ({ ...event })),
        latestCompactionHandoff: latestCompactionHandoff ? { ...latestCompactionHandoff } : null,
        workspace: store.workspaceInfo,
        approvals: {
          pending: Boolean(pendingApprovalSnapshot),
          sessionRuleCount: store.sessionAllowRules.length,
          toolName: pendingApprovalSnapshot?.toolName,
          category: pendingApprovalSnapshot?.category,
          riskLevel: pendingApprovalSnapshot?.riskLevel,
          summary: pendingApprovalSnapshot?.summary,
          signature: pendingApprovalSnapshot?.signature,
          reason: pendingApprovalSnapshot?.reason,
          warningCount: pendingApprovalSnapshot?.warnings.length ?? 0,
        },
        startupReport: runtimeSummary.startupReport,
        sessions: runtimeSummary.persistedSessions,
        runtime: {
          provider: store.provider,
          model: store.model,
          selectedProvider: runtimeSummary.defaultProvider,
          selectedModel: runtimeSummary.defaultModel,
          providerDefaults: runtimeSummary.providerDefaults,
          circuitState: store.circuitState,
          activeRun: Boolean(store.activeRunId),
          isThinking: store.isThinking,
          pendingCompactionStrategy: runtimeSummary.pendingCompactionStrategy,
          availableProviders: runtimeSummary.availableProviders,
          failover: runtimeSummary.failover,
          providerHealth: runtimeSummary.providerHealth,
          recentFailovers: runtimeSummary.recentFailovers,
          startupErrors: runtimeSummary.startupReport?.errorCount ?? 0,
          startupWarnings: runtimeSummary.startupReport?.warningCount ?? 0,
        },
        permissions: {
          caste: formatCasteDisplay(String(store.caste)),
          allowed: permissionSummary.permitted,
          denied: permissionSummary.denied,
          active: permissionSummary.active,
          sessionRules: store.sessionAllowRules,
        },
        budget: {
          maxUsd: store.maxUsd,
          maxTokens: store.maxTokens,
        },
        hookRunner: {
          attachedHookCount: 1,
          supportedKinds: runtimeSummary.supportedHookKinds,
          recentEvents: recentHookEvents.map((event) => ({ ...event })),
        },
      });

      const command = parser.tryHandle(trimmed);
      if (!command.handled) {
        void submit(trimmed);
        return;
      }

      void executeCommand(command, {
        submitChat: submit,
        exitApp: () => { setTimeout(() => exit(), 300); },
        cancelRun: cancel,
        resetSession: () => {
          resetSession();
          useColonyStore.getState().clearMessages();
        },
        resumeSession,
        requestCompaction: (strategy, options) => compactNow(strategy, options?.announceQueuedStatus ?? true),
        setBudgetCap: (maxUsd) => {
          const current = useColonyStore.getState();
          current.setBudgetCap(maxUsd);
          current.setBudgetVisible(true);
        },
        setProviderSelection,
        showSystemMessage: (message) => {
          if (!message) return;
          useColonyStore.getState().addMessage("system", message);
        },
        showErrorMessage: (message) => {
          if (!message) return;
          useColonyStore.getState().addMessage("error", message);
        },
        loadSessionHistory,
        isRunActive: () => Boolean(useColonyStore.getState().activeRunId),
      });
    },
    [cancel, compactNow, exit, getPermissionSummary, getRuntimeSummary, latestCompactionHandoff, loadSessionHistory, recentCompactions, recentHookEvents, resetSession, resumeSession, setProviderSelection, submit],
  );

  const openSessionCatalog = useCallback(() => {
    handleSubmit("/sessions");
  }, [handleSubmit]);

  const openSmartHistory = useCallback(() => {
    const store = useColonyStore.getState();
    if (store.sessionId && store.messages.length > 0) {
      handleSubmit("/history current 8");
      return;
    }

    const pendingSession = store.persistedSessions.find((session) => session.interruption !== "none");
    if (pendingSession) {
      handleSubmit("/history pending 8");
      return;
    }

    if (store.persistedSessions.length > 0) {
      handleSubmit("/history latest 8");
      return;
    }

    store.addMessage("system", "No live or saved session history to inspect.");
  }, [handleSubmit]);

  const resumeSmartSession = useCallback(() => {
    const store = useColonyStore.getState();
    const pendingSession = store.persistedSessions.find((session) => session.interruption !== "none");
    if (pendingSession) {
      handleSubmit("/resume pending");
      return;
    }

    if (store.persistedSessions.length > 0) {
      handleSubmit("/resume latest");
      return;
    }

    store.addMessage("system", "No saved session is available to resume.");
  }, [handleSubmit]);

  // Keyboard shortcuts - only when raw mode is available (real TTY).
  const { isRawModeSupported } = useStdin();
  useInput((input, key) => {
    const lowerInput = input.toLowerCase();
    if (inputLocked && !(key.pageUp || key.pageDown || (key.ctrl && lowerInput === "l"))) {
      return;
    }

    if (key.ctrl && lowerInput === "b") {
      useColonyStore.getState().toggleBudget();
      return;
    }

    if (key.pageUp) {
      scrollLog(10, 25);
      return;
    }

    if (key.pageDown) {
      scrollLog(-10, 25);
      return;
    }

    if (key.ctrl && lowerInput === "l") {
      resetLogScroll();
      return;
    }

    const sessionNavAction = resolveSessionNavAction(input, key);
    switch (sessionNavAction) {
      case "sessions":
        openSessionCatalog();
        return;
      case "history":
        openSmartHistory();
        return;
      case "resume":
        resumeSmartSession();
        return;
      default:
        break;
    }

    if (key.ctrl && input === "c") {
      if (useColonyStore.getState().activeRunId) {
        cancel();
      } else {
        useColonyStore.getState().addMessage("system", "No active operation. Use /exit to leave The Colony.");
      }
      return;
    }

    if (key.escape && useColonyStore.getState().activeRunId) {
      cancel();
    }
  }, { isActive: isRawModeSupported });

  return (
    <Box flexDirection="column">
      <HeaderPanel />

      <WelcomePanel />

      <Box flexDirection="row" minHeight={10}>
        <Box flexDirection="column" flexGrow={1}>
          <LogPanel />
        </Box>

        <BudgetPanel />
      </Box>

      <StatusPanel />

      {pendingApproval && (
        <ApprovalPrompt
          request={pendingApproval}
          onDecision={resolveApproval}
          onInspect={inspectPendingApproval}
        />
      )}

      <InputPanel handleSubmit={handleSubmit} inputLocked={inputLocked} />
    </Box>
  );
};

const HeaderPanel = React.memo(function HeaderPanel() {
  const sessionId = useColonyStore((state) => state.sessionId);
  const caste = useColonyStore((state) => String(state.caste));
  const provider = useColonyStore((state) => state.provider);
  const model = useColonyStore((state) => state.model);
  const selectedProvider = useColonyStore((state) => state.selectedProvider);
  const selectedModel = useColonyStore((state) => state.selectedModel);
  const tokensUsed = useColonyStore((state) => state.tokensUsed);
  const maxTokens = useColonyStore((state) => state.maxTokens);
  const costUsd = useColonyStore((state) => state.costUsd);

  return (
    <Header
      sessionId={sessionId}
      caste={caste}
      provider={provider}
      model={model}
      selectedProvider={selectedProvider}
      selectedModel={selectedModel}
      tokensUsed={tokensUsed}
      maxTokens={maxTokens}
      costUsd={costUsd}
    />
  );
});

const WelcomePanel = React.memo(function WelcomePanel() {
  const hasMessages = useColonyStore((state) => state.messages.length > 0);
  const caste = useColonyStore((state) => String(state.caste));

  if (hasMessages) return null;
  return <WelcomeBanner caste={caste} />;
});

const LogPanel = React.memo(function LogPanel() {
  const messages = useColonyStore((state) => state.messages);
  const logScrollOffset = useColonyStore((state) => state.logScrollOffset);
  return <LogPane messages={messages} maxVisible={25} scrollOffset={logScrollOffset} />;
});

const BudgetPanel = React.memo(function BudgetPanel() {
  const showBudget = useColonyStore((state) => state.showBudget);
  const tokensUsed = useColonyStore((state) => state.tokensUsed);
  const maxTokens = useColonyStore((state) => state.maxTokens);
  const costUsd = useColonyStore((state) => state.costUsd);
  const maxUsd = useColonyStore((state) => state.maxUsd);
  const callCount = useColonyStore((state) => state.callCount);
  const deniedCount = useColonyStore((state) => state.deniedCount);
  const pendingCompactionStrategy = useColonyStore((state) => state.pendingCompactionStrategy);
  const contextUsage = useColonyStore((state) => state.contextUsage);
  const lastCompactionFailure = useColonyStore((state) => state.lastCompactionFailure);
  const lastCompaction = useColonyStore((state) => state.lastCompaction);
  const workspaceInfo = useColonyStore((state) => state.workspaceInfo);
  const startupReport = useColonyStore((state) => state.startupReport);
  const providerHealth = useColonyStore((state) => state.providerHealth);
  const recentFailovers = useColonyStore((state) => state.recentFailovers);
  const recentHookEvents = useColonyStore((state) => state.recentHookEvents);
  const latestCompactionHandoff = useColonyStore((state) => state.latestCompactionHandoff);
  const persistedSessions = useColonyStore((state) => state.persistedSessions);
  const provider = useColonyStore((state) => state.provider);
  const model = useColonyStore((state) => state.model);
  const selectedProvider = useColonyStore((state) => state.selectedProvider);
  const selectedModel = useColonyStore((state) => state.selectedModel);
  const currentSessionId = useColonyStore((state) => state.sessionId);
  const currentAgentId = useColonyStore((state) => state.agentId);
  const currentCaste = useColonyStore((state) => String(state.caste));
  const currentMessages = useColonyStore((state) => state.messages);
  const pendingApprovalToolName = useColonyStore((state) => state.pendingApproval?.toolName ?? null);
  const pendingApprovalRiskLevel = useColonyStore((state) => state.pendingApproval?.riskLevel ?? null);
  const pendingApprovalSummary = useColonyStore((state) => state.pendingApproval?.summary ?? null);
  const currentMessageCount = useColonyStore((state) => state.messages.length);
  const currentStartedMessageTimestamp = useColonyStore((state) =>
    state.messages.length > 0 ? state.messages[0]?.timestamp ?? null : null,
  );
  const currentLatestMessageTimestamp = useColonyStore((state) =>
    state.messages.length > 0 ? state.messages[state.messages.length - 1]?.timestamp ?? null : null,
  );
  const currentPreviewText = useColonyStore((state) =>
    state.messages.length > 0 ? state.messages[state.messages.length - 1]?.content ?? "" : "",
  );
  const currentPreviewRole = useColonyStore((state) =>
    state.messages.length > 0 ? state.messages[state.messages.length - 1]?.role ?? null : null,
  );
  const currentAwaitingReply = useColonyStore((state) =>
    state.messages.length > 0 ? state.messages[state.messages.length - 1]?.role === "user" : false,
  );
  const compactionRecommendation = React.useMemo(() => recommendCompaction({
    pendingStrategy: pendingCompactionStrategy,
    contextUsage,
    history: currentMessages.map(logMessageToSerializedMessage),
    messageCount: currentMessages.length,
    caste: currentCaste,
  }), [contextUsage, currentCaste, currentMessages, pendingCompactionStrategy]);
  const recentToolActivity = React.useMemo(
    () => summarizeRecentToolActivity(currentMessages, 3),
    [currentMessages],
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

function buildLiveHistoryHint(options: {
  currentSessionId: string;
  currentMessageCount: number;
  currentLatestMessageTimestamp: number | null;
  currentAwaitingReply: boolean;
  persistedSessions: PersistedSessionSummary[];
}): string {
  const {
    currentSessionId,
    currentMessageCount,
    currentLatestMessageTimestamp,
    currentAwaitingReply,
    persistedSessions,
  } = options;
  if (!currentSessionId) return "/history current 8";

  const hasCurrentHistory = currentMessageCount > 0;
  const latestPersisted = persistedSessions[0];
  const latestPersistedId = latestPersisted?.sessionId != null ? String(latestPersisted.sessionId) : "";
  const latestPersistedTime = Date.parse(
    String(latestPersisted?.lastMessageAt ?? latestPersisted?.savedAt ?? ""),
  );
  const newestInterruptedId = persistedSessions.find((session) => session.interruption !== "none")?.sessionId ?? null;
  const currentPendingAlias = hasCurrentHistory
    && currentAwaitingReply
    && (newestInterruptedId === null || String(newestInterruptedId) === currentSessionId);
  const currentLatestAlias = hasCurrentHistory
    && (
      persistedSessions.length === 0
      || latestPersistedId === currentSessionId
      || !Number.isFinite(latestPersistedTime)
      || (
        Number.isFinite(currentLatestMessageTimestamp)
        && Number(currentLatestMessageTimestamp) > latestPersistedTime
      )
    );

  return [
    "/history current 8",
    currentPendingAlias ? "/history pending 8" : null,
    currentLatestAlias ? "/history latest 8" : null,
    `/history ${currentSessionId} 8`,
  ].filter(Boolean).join(" | ");
}

const StatusPanel = React.memo(function StatusPanel() {
  const activeRun = useColonyStore((state) => Boolean(state.activeRunId));
  const isThinking = useColonyStore((state) => state.isThinking);
  const thinkingPhase = useColonyStore((state) => state.thinkingPhase);
  const currentSessionId = useColonyStore((state) => state.sessionId);
  const currentMessageCount = useColonyStore((state) => state.messages.length);
  const currentLatestMessageTimestamp = useColonyStore((state) =>
    state.messages.length > 0 ? state.messages[state.messages.length - 1]?.timestamp ?? null : null,
  );
  const currentAwaitingReply = useColonyStore((state) =>
    state.messages.length > 0 ? state.messages[state.messages.length - 1]?.role === "user" : false,
  );
  const pendingApprovalTool = useColonyStore((state) => state.pendingApproval?.toolName ?? null);
  const loopDetected = useColonyStore((state) => state.loopDetected);
  const loopTool = useColonyStore((state) => state.loopTool);
  const circuitState = useColonyStore((state) => state.circuitState);
  const provider = useColonyStore((state) => state.provider);
  const model = useColonyStore((state) => state.model);
  const selectedProvider = useColonyStore((state) => state.selectedProvider);
  const selectedModel = useColonyStore((state) => state.selectedModel);
  const toolCount = useColonyStore((state) => state.toolCount);
  const pendingCompactionStrategy = useColonyStore((state) => state.pendingCompactionStrategy);
  const startupReport = useColonyStore((state) => state.startupReport);
  const recentFailovers = useColonyStore((state) => state.recentFailovers);
  const recentHookEvents = useColonyStore((state) => state.recentHookEvents);
  const persistedSessions = useColonyStore((state) => state.persistedSessions);
  const activeHistoryHint = buildLiveHistoryHint({
    currentSessionId,
    currentMessageCount,
    currentLatestMessageTimestamp,
    currentAwaitingReply,
    persistedSessions,
  });

  return (
    <StatusBar
      activeRun={activeRun}
      isThinking={isThinking}
      thinkingLabel={thinkingPhase}
      activeHistoryHint={activeHistoryHint}
      pendingApprovalTool={pendingApprovalTool}
      loopDetected={loopDetected}
      loopTool={loopTool}
      circuitState={circuitState}
      provider={provider}
      model={model}
      selectedProvider={selectedProvider}
      selectedModel={selectedModel}
      toolCount={toolCount}
      pendingCompactionStrategy={pendingCompactionStrategy}
      startupErrors={startupReport?.errorCount ?? 0}
      startupWarnings={startupReport?.warningCount ?? 0}
      recentFailoverCount={recentFailovers.length}
      recentHookCount={recentHookEvents.length}
      sessionCatalogCount={persistedSessions.length}
      interruptedSessionCount={persistedSessions.filter((session) => session.interruption !== "none").length}
    />
  );
});

interface InputPanelProps {
  handleSubmit: (value: string) => void;
  inputLocked: boolean;
}

const InputPanel = React.memo(function InputPanel({ handleSubmit, inputLocked }: InputPanelProps) {
  const query = useColonyStore((state) => state.query);
  const setQuery = useColonyStore((state) => state.setQuery);
  const activeRun = useColonyStore((state) => Boolean(state.activeRunId));
  const isThinking = useColonyStore((state) => state.isThinking);
  const currentSessionId = useColonyStore((state) => state.sessionId);
  const currentMessageCount = useColonyStore((state) => state.messages.length);
  const currentLatestMessageTimestamp = useColonyStore((state) =>
    state.messages.length > 0 ? state.messages[state.messages.length - 1]?.timestamp ?? null : null,
  );
  const currentAwaitingReply = useColonyStore((state) =>
    state.messages.length > 0 ? state.messages[state.messages.length - 1]?.role === "user" : false,
  );
  const startupReport = useColonyStore((state) => state.startupReport);
  const persistedSessions = useColonyStore((state) => state.persistedSessions);
  const activeHistoryHint = buildLiveHistoryHint({
    currentSessionId,
    currentMessageCount,
    currentLatestMessageTimestamp,
    currentAwaitingReply,
    persistedSessions,
  });
  const startupPlaceholder = formatStartupPlaceholder(startupReport);

  return (
    <Box paddingX={1} paddingY={0}>
      <Box marginRight={1}>
        <Text color={inputLocked ? "yellow" : "green"}>{inputLocked ? "!" : ">"}</Text>
      </Box>
      <TextInput
        value={query}
        onChange={setQuery}
        onSubmit={handleSubmit}
        focus={!inputLocked}
        showCursor={!inputLocked}
        placeholder={
          inputLocked
            ? "Approval pending: y once, n deny, a exact-call, s inspect, esc cancel"
            : isThinking
              ? `Streaming response... /cancel or Ctrl+C/Esc stops | /status /cost ${activeHistoryHint}`
              : activeRun
                ? `Run active... /cancel or Ctrl+C/Esc stops | /status /cost ${activeHistoryHint}`
              : startupPlaceholder
                ? startupPlaceholder
              : "Enter command (/help, /history, /resume, /sessions) or chat... PgUp/PgDn scroll"
        }
      />
    </Box>
  );
});

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function startColonyUI(): void {
  if (!process.stdin.isTTY) {
    console.log("\nTHE COLONY v1.0 - Agent Operating System\n");
    console.log("ERROR: The Colony requires an interactive terminal (TTY).");
    console.log("Please run directly in your terminal, not through a pipe or script.");
    console.log("\nUsage:  bun run dev");
    console.log("        bun run start\n");
    process.exit(1);
  }

  render(<ColonyApp />);
}
