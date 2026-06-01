import React from "react";
import { Box, Text } from "ink";
import { useShallow } from "zustand/react/shallow";
import TextInput from "ink-text-input";
import { formatStartupPlaceholder } from "../../runtime/startup-diagnostics";
import {
  buildLiveCurrentHistoryHint,
  buildLiveSessionShortcutSnapshot,
} from "../../runtime/session-shortcuts";
import { useColonyStore } from "../store";

export interface InputPanelProps {
  handleSubmit: (value: string) => void;
  inputLocked: boolean;
}

const InputPanel = React.memo(function InputPanel({ handleSubmit, inputLocked }: InputPanelProps) {
  // ── Single batched selector (11 individual calls → 1) ─────────────────────
  const {
    query,
    setQuery,
    activeRunId,
    interruptRequested,
    isThinking,
    sessionId: currentSessionId,
    messages,
    startupReport,
    persistedSessions,
  } = useColonyStore(
    useShallow((state) => ({
      query: state.query,
      setQuery: state.setQuery,
      activeRunId: state.activeRunId,
      interruptRequested: state.interruptRequested,
      isThinking: state.isThinking,
      sessionId: state.sessionId,
      messages: state.messages,
      startupReport: state.startupReport,
      persistedSessions: state.persistedSessions,
    })),
  );

  // ── Derived from messages (no extra subscriptions needed) ──────────────────
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
            ? "Approval pending — press y / n / a / s / Esc (? for help)"
            : interruptRequested
              ? "Stopping... Ctrl+C again to force quit"
            : isThinking
              ? `Streaming... Ctrl+C or Esc to cancel  ${activeHistoryHint}`
              : activeRun
                ? `Run active... Ctrl+C or Esc to cancel  ${activeHistoryHint}`
              : startupPlaceholder
                ? startupPlaceholder
              : "Chat or /command — press ? for shortcuts"
        }
      />
    </Box>
  );
});

export default InputPanel;
