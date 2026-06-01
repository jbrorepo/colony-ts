/**
 * useCommandDispatch — command routing and slash-command parsing hook.
 *
 * Extracts the handleSubmit logic from ColonyApp so the root component stays
 * a thin orchestrator. All slash-command parsing, execution-handler wiring,
 * and approval-guard logic lives here.
 *
 * Key design choices:
 *  - Reactive Zustand fields that are only *read* inside the callback
 *    (recentHookEvents, recentCompactions, latestCompactionHandoff) are read
 *    via getState() instead of being subscribed to. This removes 3 entries
 *    from the dependency array while keeping correctness — these values are
 *    only needed at the moment of dispatch, not during render.
 *  - The hook accepts ColonyLoopControls, the runtime singletons (stable
 *    useMemo values), and the two execution-handler bundles.
 */

import { useCallback } from "react";
import { executeCommand, SlashCommandParser } from "../../gateway";
import type { CommandExecutionHandlers } from "../../gateway";
import { useColonyStore } from "../store";
import { formatCasteDisplay } from "../components";
import type { ColonyLoopControls } from "../use-colony-loop";
import type { BrowserSidecarRuntime } from "../../browser/browser-sidecar-runtime";
import type { WorkflowRecipeRuntime } from "../../workflow/recipes/executable-recipes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseCommandDispatchOptions {
  /** All controls returned by useColonyLoop(). */
  loopControls: ColonyLoopControls;
  /** The app-level exit function from useApp(). */
  exit: () => void;
  /** Stable singleton created with useMemo(() => new BrowserSidecarRuntime(), []). */
  browserRuntime: BrowserSidecarRuntime;
  /** Stable singleton created with useMemo(() => new WorkflowRecipeRuntime(), []). */
  workflowRecipeRuntime: WorkflowRecipeRuntime;
  /** Browser-automation handlers from createBrowserExecutionHandlers(). */
  browserHandlers: Partial<CommandExecutionHandlers>;
  /** Workflow-recipe handlers from createWorkflowRecipeExecutionHandlers(). */
  workflowHandlers: Partial<CommandExecutionHandlers>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns a stable `handleSubmit(value)` callback that:
 *   1. Guards against input while an approval is pending.
 *   2. Parses slash commands via SlashCommandParser.
 *   3. Routes to executeCommand() or submit() as appropriate.
 */
export function useCommandDispatch({
  loopControls,
  exit,
  browserRuntime,
  workflowRecipeRuntime,
  browserHandlers,
  workflowHandlers,
}: UseCommandDispatchOptions): (value: string) => void {
  const {
    submit,
    cancel,
    resetSession,
    resumeSession,
    setProviderSelection,
    setMemoryTruthMode,
    startSwarm,
    cancelSwarm,
    resumeSwarm,
    retrySwarmStage,
    loadSessionHistory,
    compactNow,
    getRuntimeSummary,
    getPermissionSummary,
  } = loopControls;

  return useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      const store = useColonyStore.getState();

      // Guard: block text input while an approval dialog is active.
      if (store.pendingApproval) {
        const pendingTool = store.pendingApproval.toolName || "tool call";
        store.addMessage(
          "system",
          `Approval pending for ${pendingTool}. Use y/n/a/esc to resolve it, or press s for details.`,
        );
        return;
      }

      store.setQuery("");

      // Read reactive-but-dispatch-time-only fields via getState() so they
      // don't need to appear in the useCallback dependency array.
      const { recentHookEvents, recentCompactions, latestCompactionHandoff } =
        useColonyStore.getState();

      const permissionSummary = getPermissionSummary();
      const runtimeSummary = getRuntimeSummary();
      const pendingApprovalSnapshot = useColonyStore.getState().pendingApproval;

      const parser = new SlashCommandParser({
        session: {
          sessionId: store.sessionId,
          agentId: store.agentId,
          caste: String(store.caste),
          history: [...store.messages],
        },
        costTracker: {
          formatSummary: () => buildCostSummary(store),
        },
        contextUsage: store.contextUsage,
        lastCompactionFailure: store.lastCompactionFailure,
        lastCompaction: store.lastCompaction,
        recentCompactions: recentCompactions.map((event) => ({ ...event })),
        latestCompactionHandoff: latestCompactionHandoff
          ? { ...latestCompactionHandoff }
          : null,
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
        swarm: {
          runs: runtimeSummary.swarmRuns,
        },
        browser: {
          runtime: browserRuntime,
        },
        workflow: {
          recipeRuntime: workflowRecipeRuntime,
        },
        runtime: {
          provider: store.provider,
          model: store.model,
          selectedProvider: runtimeSummary.defaultProvider,
          selectedModel: runtimeSummary.defaultModel,
          memoryTruthModeOverride: runtimeSummary.memoryTruthModeOverride,
          lastMemoryRecall: runtimeSummary.lastMemoryRecall,
          providerDefaults: runtimeSummary.providerDefaults,
          circuitState: store.circuitState,
          activeRun: Boolean(store.activeRunId || store.interruptRequested),
          isThinking: store.isThinking,
          interruptRequested: store.interruptRequested,
          queuedPromptCount: store.queuedPromptCount,
          queuedPromptPreview: store.queuedPromptPreview,
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
        toolDefinitions: runtimeSummary.toolDefinitions,
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
        queueChat: submit,
        exitApp: () => {
          setTimeout(() => exit(), 300);
        },
        cancelRun: cancel,
        resetSession: () => {
          resetSession();
          useColonyStore.getState().clearMessages();
        },
        resumeSession,
        requestCompaction: (strategy, options) =>
          compactNow(strategy, options?.announceQueuedStatus ?? true),
        setBudgetCap: (maxUsd) => {
          const current = useColonyStore.getState();
          current.setBudgetCap(maxUsd);
          current.setBudgetVisible(true);
        },
        setProviderSelection,
        setMemoryTruthMode,
        startSwarm,
        cancelSwarm,
        resumeSwarm,
        retrySwarmStage,
        ...browserHandlers,
        ...workflowHandlers,
        showSystemMessage: (message) => {
          if (!message) return;
          useColonyStore.getState().addMessage("system", message);
        },
        showErrorMessage: (message) => {
          if (!message) return;
          useColonyStore.getState().addMessage("error", message);
        },
        loadSessionHistory,
        isRunActive: () =>
          Boolean(
            useColonyStore.getState().activeRunId ||
              useColonyStore.getState().interruptRequested,
          ),
        isRunCancelling: () => useColonyStore.getState().interruptRequested,
      });
    },
    [
      submit,
      cancel,
      resetSession,
      resumeSession,
      setProviderSelection,
      setMemoryTruthMode,
      startSwarm,
      cancelSwarm,
      resumeSwarm,
      retrySwarmStage,
      loadSessionHistory,
      compactNow,
      getRuntimeSummary,
      getPermissionSummary,
      exit,
      browserRuntime,
      workflowRecipeRuntime,
      browserHandlers,
      workflowHandlers,
    ],
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCostSummary(
  store: ReturnType<typeof useColonyStore.getState>,
): string {
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
