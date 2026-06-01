/**
 * Colony App - Main React/Ink application.
 *
 * Connects the Ant Farm terminal UI to the real AgentLoop streaming runtime.
 * Panel components live in ./panels/ — this file is the root orchestrator only.
 * Command dispatch logic lives in ./hooks/useCommandDispatch.
 */

import React, { useCallback } from "react";
import { render, Box, useApp, useInput, useStdin } from "ink";

import { BrowserSidecarRuntime } from "../browser/browser-sidecar-runtime";
import { WorkflowRecipeRuntime } from "../workflow/recipes/executable-recipes";
import {
  createBrowserExecutionHandlers,
  createWorkflowRecipeExecutionHandlers,
} from "../gateway-market-handoffs";
import { formatPendingApprovalMessage } from "../runtime/approval";
import {
  resolveSmartHistoryCommand,
  resolveSmartResumeCommand,
  buildLiveSessionShortcutSnapshot,
} from "../runtime/session-shortcuts";
import { ApprovalPrompt } from "./components";
import { resolveSessionNavAction, KEYBOARD_SHORTCUT_REFERENCE } from "./hotkeys";
import { useColonyLoop } from "./use-colony-loop";
import { useColonyStore } from "./store";
import { useCommandDispatch } from "./hooks/useCommandDispatch";
import HeaderPanel from "./panels/HeaderPanel";
import WelcomePanel from "./panels/WelcomePanel";
import LogPanel from "./panels/LogPanel";
import BudgetPanel from "./panels/BudgetPanel";
import StatusPanel from "./panels/StatusPanel";
import InputPanel from "./panels/InputPanel";

// ---------------------------------------------------------------------------
// ColonyApp
// ---------------------------------------------------------------------------

const ColonyApp: React.FC = () => {
  const { exit } = useApp();
  const loopControls = useColonyLoop();
  const { cancel, resolveApproval } = loopControls;
  const pendingApproval = useColonyStore((state) => state.pendingApproval);
  const scrollLog = useColonyStore((state) => state.scrollLog);
  const resetLogScroll = useColonyStore((state) => state.resetLogScroll);
  const inputLocked = Boolean(pendingApproval);

  const browserRuntime = React.useMemo(() => new BrowserSidecarRuntime(), []);
  const workflowRecipeRuntime = React.useMemo(() => new WorkflowRecipeRuntime(), []);
  const browserHandlers = React.useMemo(
    () => createBrowserExecutionHandlers(browserRuntime),
    [browserRuntime],
  );
  const workflowHandlers = React.useMemo(
    () => createWorkflowRecipeExecutionHandlers(workflowRecipeRuntime),
    [workflowRecipeRuntime],
  );

  const handleSubmit = useCommandDispatch({
    loopControls,
    exit,
    browserRuntime,
    workflowRecipeRuntime,
    browserHandlers,
    workflowHandlers,
  });

  const inspectPendingApproval = useCallback(() => {
    const store = useColonyStore.getState();
    const request = store.pendingApproval;
    if (!request) return;

    store.addMessage("system", formatPendingApprovalMessage(request), {
      toolName: request.toolName,
      toolArgs: { ...request.arguments },
    });
  }, []);

  const openSessionCatalog = useCallback(() => {
    handleSubmit("/sessions");
  }, [handleSubmit]);

  const openSmartHistory = useCallback(() => {
    const store = useColonyStore.getState();
    const shortcuts = buildLiveSessionShortcutSnapshot({
      currentSessionId: store.sessionId,
      currentMessageCount: store.messages.length,
      currentLatestMessageTimestamp:
        store.messages.length > 0 ? store.messages[store.messages.length - 1]?.timestamp ?? null : null,
      currentAwaitingReply:
        store.messages.length > 0 ? store.messages[store.messages.length - 1]?.role === "user" : false,
      persistedSessions: store.persistedSessions,
    });
    const command = resolveSmartHistoryCommand(shortcuts, 8);
    if (command) {
      handleSubmit(command);
      return;
    }

    store.addMessage("system", "No live or saved session history to inspect.");
  }, [handleSubmit]);

  const resumeSmartSession = useCallback(() => {
    const store = useColonyStore.getState();
    const shortcuts = buildLiveSessionShortcutSnapshot({
      currentSessionId: store.sessionId,
      currentMessageCount: store.messages.length,
      currentLatestMessageTimestamp:
        store.messages.length > 0 ? store.messages[store.messages.length - 1]?.timestamp ?? null : null,
      currentAwaitingReply:
        store.messages.length > 0 ? store.messages[store.messages.length - 1]?.role === "user" : false,
      persistedSessions: store.persistedSessions,
    });
    const command = resolveSmartResumeCommand(shortcuts);
    if (command) {
      handleSubmit(command);
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
      if (useColonyStore.getState().interruptRequested) {
        useColonyStore.getState().addMessage("system", "Cancellation already in progress.");
      } else if (useColonyStore.getState().activeRunId) {
        cancel();
      } else {
        useColonyStore.getState().addMessage("system", "No active operation. Use /exit to leave The Colony.");
      }
      return;
    }

    if (key.escape && useColonyStore.getState().activeRunId && !useColonyStore.getState().interruptRequested) {
      cancel();
    }

    if (!key.ctrl && !key.meta && input === "?" && !inputLocked) {
      useColonyStore.getState().addMessage("system", KEYBOARD_SHORTCUT_REFERENCE);
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
