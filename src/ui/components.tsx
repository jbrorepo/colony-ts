/**
 * Colony UI Components - React/Ink terminal interface.
 *
 * The "Ant Farm" layout is intentionally small and stable. Streaming state is
 * kept outside these components so Ink only redraws at controlled intervals.
 */

import React from "react";
import { Text, Box, useInput } from "ink";
import {
  parsePendingApprovalMessage,
  parseDeniedToolResultMessage,
  type ApprovalRequest,
  type ApprovalScope,
} from "../runtime/approval";
import type {
  CompactionResult,
  CompactionStrategy,
  ContextWindowSnapshot,
} from "../runtime/compaction";
import type {
  RuntimeCompactionHandoffSnapshot,
  RuntimeFailoverSnapshot,
  RuntimeHookEventSnapshot,
  RuntimeProviderHealthSnapshot,
} from "../runtime/runtime-snapshot";
import type { PersistedSessionSummary } from "../runtime/session-recovery";
import {
  buildLiveCurrentHistoryHint,
  buildLiveCurrentResumeHint,
  buildLiveSessionShortcutSnapshot,
  buildPersistedSessionHistoryHint,
  buildPersistedSessionResumeHint,
} from "../runtime/session-shortcuts";
import {
  memoryTruthModeLabel,
  type MemoryTruthMode,
} from "../memory/hybrid-memory";
import {
  startupDoctorFocusCommand,
  startupDoctorInspectCommands,
  type StartupReport,
} from "../runtime/startup-diagnostics";
import {
  parsePersistedToolResultMessage,
  type PersistedToolResult,
} from "../runtime/tool-result-storage";
import type { WorkspaceInfo } from "../runtime/workspace";
import { casteDisplayName, normalizeCasteKey, tryResolveMethodCaste } from "../caste/enums";
import { SESSION_NAV_LABEL } from "./hotkeys";

// ---------------------------------------------------------------------------
// Color palette - The Colony theme
// ---------------------------------------------------------------------------

const COLORS = {
  brand: "magenta",
  accent: "cyan",
  success: "green",
  warning: "yellow",
  error: "red",
  muted: "gray",
  user: "white",
  assistant: "cyan",
  system: "yellow",
  tool: "green",
} as const;

function normalizeCaste(caste: string): string {
  const methodCaste = tryResolveMethodCaste(caste);
  return methodCaste ?? normalizeCasteKey(caste);
}

function isProviderIssueText(value: string): boolean {
  const lower = value.toLowerCase();
  return [
    "provider",
    "ollama",
    "anthropic",
    "gemini",
    "google",
    "openai",
    "fallback",
    "claude",
  ].some((term) => lower.includes(term));
}

function formatProviderFailoverFace(event: {
  fromProvider: string;
  fromModel: string;
  toProvider: string;
  toModel: string;
  errorType: string;
  errorMessage: string;
}): string {
  return `${event.fromProvider}:${event.fromModel} -> ${event.toProvider}:${event.toModel} (${event.errorType})`;
}

export function formatCasteDisplay(caste: string): string {
  try {
    return casteDisplayName(caste);
  } catch {
    return normalizeCaste(caste)
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

interface HeaderProps {
  sessionId: string;
  caste: string;
  provider: string;
  model: string;
  selectedProvider: string;
  selectedModel: string;
  tokensUsed: number;
  maxTokens: number;
  costUsd: number;
}

export const Header = React.memo(function Header({
  sessionId,
  caste,
  provider,
  model,
  selectedProvider,
  selectedModel,
  tokensUsed,
  maxTokens,
  costUsd,
}: HeaderProps) {
  const utilizationPct = maxTokens > 0 ? Math.round((tokensUsed / maxTokens) * 100) : 0;
  const budgetColor = utilizationPct > 85 ? "red" : utilizationPct > 60 ? "yellow" : "green";
  const shortSessionId = sessionId.replace(/^ses_/, "");
  const pendingSelection =
    selectedProvider !== provider
    || selectedModel !== model;

  return (
    <Box
      borderStyle="round"
      borderColor={COLORS.brand}
      paddingX={1}
      justifyContent="space-between"
    >
      <Box>
        <Text color={COLORS.accent} bold>
          The Colony
        </Text>
        <Text color={COLORS.muted}> | </Text>
        <Text color={COLORS.brand}>{formatCasteDisplay(caste)}</Text>
        <Text color={COLORS.muted}> | sid:</Text>
        <Text color={COLORS.muted}>{shortSessionId}</Text>
      </Box>

      <Box>
        <Text color={COLORS.muted}>run:</Text>
        <Text color={COLORS.accent}>{provider}:{model}</Text>
        {pendingSelection && (
          <>
            <Text color={COLORS.muted}> | </Text>
            <Text color={COLORS.warning}>next:{selectedProvider}:{selectedModel}</Text>
          </>
        )}
        <Text color={COLORS.muted}> | </Text>
        <Text color={budgetColor}>
          {tokensUsed.toLocaleString()}/{maxTokens.toLocaleString()} tokens ({utilizationPct}%)
        </Text>
        <Text color={COLORS.muted}> | </Text>
        <Text color={COLORS.success}>${costUsd.toFixed(4)}</Text>
      </Box>
    </Box>
  );
});

// ---------------------------------------------------------------------------
// LogEntry
// ---------------------------------------------------------------------------

export interface LogMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool" | "error";
  content: string;
  timestamp: number;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolDurationMs?: number;
  externalizedResult?: PersistedToolResult | null;
  caste?: string;
}

export interface ToolActivityFaceSummary {
  toolName: string;
  status: string;
  detail?: string;
  artifactPath?: string;
}

const ROLE_PREFIXES: Record<string, string> = {
  user: ">",
  assistant: "ant",
  system: "*",
  tool: "tool",
  error: "!",
};

const ROLE_COLORS: Record<string, string> = {
  user: COLORS.user,
  assistant: COLORS.assistant,
  system: COLORS.system,
  tool: COLORS.tool,
  error: COLORS.error,
};

interface LogEntryProps {
  message: LogMessage;
}

export interface TranscriptDisplaySummary {
  preview: string;
  truncated: boolean;
  hiddenChars: number;
}

export function summarizeTranscriptDisplayText(
  text: string,
  maxChars = 4_000,
  maxLines = 48,
): TranscriptDisplaySummary {
  const normalized = String(text ?? "").replace(/\r\n/g, "\n");
  const lineLimited = normalized
    .split("\n")
    .slice(0, maxLines)
    .join("\n");
  const preview = lineLimited.length > maxChars
    ? lineLimited.slice(0, maxChars)
    : lineLimited;
  const hiddenChars = Math.max(0, normalized.length - preview.length);

  return {
    preview,
    truncated: hiddenChars > 0,
    hiddenChars,
  };
}

export const LogEntry = React.memo(function LogEntry({ message }: LogEntryProps) {
  const externalizedResult =
    message.externalizedResult
    ?? ((message.role === "tool" || message.role === "error")
      ? parsePersistedToolResultMessage(message.content)
      : null);
  const contentPreview = summarizeTranscriptDisplayText(message.content);

  if (
    (message.role === "tool" || message.role === "error" || message.role === "system")
    && message.toolName
    && (
      typeof message.toolDurationMs === "number"
      || externalizedResult
      || message.role === "error"
      || message.role === "system"
    )
  ) {
    return (
      <ToolCallDisplay
        toolName={message.toolName}
        args={message.toolArgs ?? {}}
        output={message.role === "tool" ? message.content : undefined}
        error={message.role === "tool" ? undefined : message.content}
        durationMs={message.toolDurationMs}
        externalizedResult={externalizedResult}
      />
    );
  }

  const prefix = ROLE_PREFIXES[message.role] ?? "?";
  const color = ROLE_COLORS[message.role] ?? COLORS.muted;
  const label =
    message.role === "tool" && message.toolName
      ? `[${message.toolName}]`
      : message.role === "assistant" && message.caste
        ? `[${formatCasteDisplay(message.caste)}]`
        : "";

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={color}>
          {prefix} {label ? `${label} ` : ""}
        </Text>
        <Text color={color} wrap="wrap">
          {contentPreview.preview}
        </Text>
      </Box>
      {contentPreview.truncated && (
        <Text color={COLORS.muted}>
          ... {contentPreview.hiddenChars.toLocaleString()} more chars hidden in face | transcript truth kept
        </Text>
      )}
    </Box>
  );
});

export function summarizeRecentToolActivity(
  messages: LogMessage[],
  limit = 3,
): ToolActivityFaceSummary[] {
  const recent: ToolActivityFaceSummary[] = [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message?.toolName) continue;

    const pendingApproval = parsePendingApprovalMessage(message.content);
    if (pendingApproval) {
      recent.push({
        toolName: message.toolName,
        status: "pending approval",
        detail: `${pendingApproval.riskLevel}/${pendingApproval.category} | ${pendingApproval.summary}`,
      });
    } else {
      const deniedResult = parseDeniedToolResultMessage(message.content);
      if (deniedResult) {
        recent.push({
          toolName: message.toolName,
          status: deniedResult.status.replace(/\.$/, ""),
          detail: `${deniedResult.riskLevel}/${deniedResult.category} | ${deniedResult.summary}`,
        });
      } else {
        const externalizedResult =
          message.externalizedResult
          ?? parsePersistedToolResultMessage(message.content);
        if (externalizedResult) {
          recent.push({
            toolName: message.toolName,
            status: "saved artifact",
            detail: `${externalizedResult.originalSize.toLocaleString()} chars`,
            artifactPath: externalizedResult.filepath,
          });
        } else if (message.role === "tool" || message.role === "error") {
          const firstLine = message.content
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find(Boolean);
          recent.push({
            toolName: message.toolName,
            status: message.role === "error" ? "error" : "ok",
            detail: [
              typeof message.toolDurationMs === "number" ? `${message.toolDurationMs}ms` : null,
              firstLine ?? null,
            ].filter(Boolean).join(" | "),
          });
        }
      }
    }

    if (recent.length >= limit) break;
  }

  return recent;
}

// ---------------------------------------------------------------------------
// LogPane
// ---------------------------------------------------------------------------

interface LogPaneProps {
  messages: LogMessage[];
  maxVisible?: number;
  scrollOffset?: number;
}

export const LogPane = React.memo(function LogPane({
  messages,
  maxVisible = 20,
  scrollOffset = 0,
}: LogPaneProps) {
  const { start, end, visible, hiddenEarlier, hiddenLater } = React.useMemo(() => {
    const maxOffset = Math.max(messages.length - maxVisible, 0);
    const appliedOffset = Math.min(Math.max(scrollOffset, 0), maxOffset);
    const resolvedEnd = Math.max(messages.length - appliedOffset, 0);
    const resolvedStart = Math.max(resolvedEnd - maxVisible, 0);
    return {
      start: resolvedStart,
      end: resolvedEnd,
      visible: messages.slice(resolvedStart, resolvedEnd),
      hiddenEarlier: resolvedStart,
      hiddenLater: Math.max(messages.length - resolvedEnd, 0),
    };
  }, [maxVisible, messages, scrollOffset]);

  return (
    <Box flexDirection="column" paddingX={1}>
      {(hiddenEarlier > 0 || hiddenLater > 0) && (
        <Text color={COLORS.muted} dimColor>
          Transcript {start + 1}-{end} of {messages.length} | PgUp older | PgDn newer | Ctrl+L latest
        </Text>
      )}
      {hiddenEarlier > 0 && (
        <Text color={COLORS.muted} dimColor>
          ^ {hiddenEarlier} earlier messages
        </Text>
      )}
      {visible.map((msg) => (
        <LogEntry key={msg.id} message={msg} />
      ))}
      {hiddenLater > 0 && (
        <Text color={COLORS.muted} dimColor>
          v {hiddenLater} newer messages
        </Text>
      )}
    </Box>
  );
});

// ---------------------------------------------------------------------------
// StatusBar
// ---------------------------------------------------------------------------

interface StatusBarProps {
  activeRun: boolean;
  interruptRequested?: boolean;
  isThinking: boolean;
  thinkingLabel: string;
  activeHistoryHint?: string;
  queuedPromptCount?: number;
  queuedPromptPreview?: string | null;
  pendingApprovalTool?: string | null;
  loopDetected: boolean;
  loopTool?: string;
  circuitState: "closed" | "open" | "half_open";
  provider: string;
  model: string;
  selectedProvider: string;
  selectedModel: string;
  memoryTruthModeOverride?: MemoryTruthMode | null;
  toolCount: number;
  pendingCompactionStrategy?: CompactionStrategy | null;
  startupErrors?: number;
  startupWarnings?: number;
  startupInspectCommand?: string | null;
  recentFailoverCount?: number;
  recentHookCount?: number;
  sessionCatalogCount?: number;
  interruptedSessionCount?: number;
}

export const StatusBar = React.memo(function StatusBar({
  activeRun,
  interruptRequested = false,
  isThinking,
  thinkingLabel,
  activeHistoryHint = "/history current 8",
  queuedPromptCount = 0,
  queuedPromptPreview = null,
  pendingApprovalTool = null,
  loopDetected,
  loopTool,
  circuitState,
  provider,
  model,
  selectedProvider,
  selectedModel,
  memoryTruthModeOverride = null,
  toolCount,
  pendingCompactionStrategy = null,
  startupErrors = 0,
  startupWarnings = 0,
  startupInspectCommand = null,
  recentFailoverCount = 0,
  recentHookCount = 0,
  sessionCatalogCount = 0,
  interruptedSessionCount = 0,
}: StatusBarProps) {
  const circuitColor =
    circuitState === "closed"
      ? "green"
      : circuitState === "half_open"
        ? "yellow"
        : "red";
  const circuitLabel =
    circuitState === "closed"
      ? "closed"
      : circuitState === "half_open"
        ? "half-open"
        : "open";
  const doctorColor =
    startupErrors > 0
      ? COLORS.error
      : startupWarnings > 0
        ? COLORS.warning
        : COLORS.success;
  const doctorLabel =
    startupErrors > 0
      ? `doctor:E${startupErrors}/W${startupWarnings} ${startupInspectCommand ?? "/doctor"}`
      : startupWarnings > 0
        ? `doctor:W${startupWarnings} ${startupInspectCommand ?? "/doctor"}`
        : "doctor:ok";
  const pendingSelection =
    selectedProvider !== provider
    || selectedModel !== model;
  const activeToolsLabel =
    toolCount > 0
      ? `${toolCount} active tools /tools`
      : "0 active tools";
  const memoryLabel = memoryTruthModeLabel(memoryTruthModeOverride);

  return (
    <Box
      borderStyle="single"
      borderColor={COLORS.muted}
      paddingX={1}
      justifyContent="space-between"
    >
      <Box>
        {pendingApprovalTool ? (
          <Text color={COLORS.warning}>Approval: {pendingApprovalTool} pending (y/n/a/s/esc | /tools)</Text>
        ) : interruptRequested ? (
          <Text color={COLORS.warning}>Stopping current run...{queuedPromptCount > 0 ? ` | next:${queuedPromptPreview ?? "queued prompt"}` : ""} | /status /cost | {activeHistoryHint}</Text>
        ) : isThinking ? (
          <Text color={COLORS.warning}>... {thinkingLabel}{queuedPromptCount > 0 ? ` | next:${queuedPromptPreview ?? "queued prompt"}` : ""} | /cancel /status /cost | {activeHistoryHint}</Text>
        ) : activeRun ? (
          <Text color={COLORS.warning}>Run active{queuedPromptCount > 0 ? ` | next:${queuedPromptPreview ?? "queued prompt"}` : ""} | /cancel /status /cost | {activeHistoryHint}</Text>
        ) : (
          <Text color={COLORS.success}>Ready</Text>
        )}
      </Box>

      <Box>
        {loopDetected && (
          <>
            <Text color={COLORS.error}>Loop: {loopTool}</Text>
            <Text color={COLORS.muted}> | </Text>
          </>
        )}
        <Text color={COLORS.accent}>run:{provider}:{model}</Text>
        <Text color={COLORS.muted}> | </Text>
        {pendingSelection && (
          <>
            <Text color={COLORS.warning}>next:{selectedProvider}:{selectedModel}</Text>
            <Text color={COLORS.muted}> | </Text>
          </>
        )}
        <Text color={COLORS.accent}>memory:{memoryLabel} /memory</Text>
        <Text color={COLORS.muted}> | </Text>
        <Text color={circuitColor}>{provider}:{circuitLabel}</Text>
        <Text color={COLORS.muted}> | </Text>
        {pendingCompactionStrategy && (
          <>
            <Text color={COLORS.warning}>compact:{pendingCompactionStrategy} queued</Text>
            <Text color={COLORS.muted}> | </Text>
          </>
        )}
        {recentFailoverCount > 0 && (
          <>
            <Text color={COLORS.warning}>failovers:{recentFailoverCount}</Text>
            <Text color={COLORS.muted}> | </Text>
          </>
        )}
        {recentHookCount > 0 && (
          <>
            <Text color={COLORS.accent}>hooks:{recentHookCount} /hooks</Text>
            <Text color={COLORS.muted}> | </Text>
          </>
        )}
        {sessionCatalogCount > 0 && (
          <>
            <Text color={COLORS.accent}>sessions:{sessionCatalogCount}</Text>
            {interruptedSessionCount > 0 && (
              <Text color={COLORS.warning}> ({interruptedSessionCount} pending)</Text>
            )}
            <Text color={COLORS.muted}> | </Text>
          </>
        )}
        {queuedPromptCount > 0 && (
          <>
            <Text color={COLORS.warning}>queue:{queuedPromptCount}</Text>
            <Text color={COLORS.muted}> | </Text>
          </>
        )}
        <Text color={doctorColor}>{doctorLabel}</Text>
        <Text color={COLORS.muted}> | </Text>
        <Text color={COLORS.muted}>{activeToolsLabel}</Text>
      </Box>
    </Box>
  );
});

// ---------------------------------------------------------------------------
// ApprovalPrompt
// ---------------------------------------------------------------------------

interface ApprovalPromptProps {
  request: ApprovalRequest;
  onDecision: (scope: ApprovalScope) => void;
  onInspect?: () => void;
}

export const ApprovalPrompt = React.memo(function ApprovalPrompt({
  request,
  onDecision,
  onInspect,
}: ApprovalPromptProps) {
  useInput((input, key) => {
    const value = input.toLowerCase();
    if (value === "y") onDecision("once");
    if (value === "n") onDecision("deny");
    if (value === "a") onDecision("session");
    if (value === "s") onInspect?.();
    if (key.escape || (key.ctrl && value === "c")) onDecision("cancel");
  }, { isActive: true });

  const riskColor =
    request.riskLevel === "high"
      ? COLORS.error
      : request.riskLevel === "medium"
        ? COLORS.warning
        : COLORS.success;

  const detailLines = request.details
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((line) => summarizeToolText(line, 140));

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={riskColor} paddingX={1}>
      {/* ── Header ── */}
      <Box>
        <Text color={riskColor} bold>⚠ Approval required</Text>
        <Text color={COLORS.muted}> │ </Text>
        <Text color={riskColor} bold>{request.riskLevel.toUpperCase()}</Text>
        <Text color={COLORS.muted}> │ </Text>
        <Text color={COLORS.accent} bold>{request.toolName}</Text>
      </Box>

      {/* ── Summary + metadata ── */}
      <Text color={COLORS.user}>{request.summary}</Text>
      <Box marginTop={0}>
        <Text color={COLORS.muted}>category: </Text>
        <Text color={COLORS.muted}>{request.category}</Text>
        <Text color={COLORS.muted}>  reason: </Text>
        <Text color={COLORS.muted}>{request.reason}</Text>
      </Box>
      <Text color={COLORS.muted}>
        sig: {request.signature}{"  "}
        <Text color={COLORS.muted}>(session-allow matches this exact call only)</Text>
      </Text>

      {/* ── Details ── */}
      {detailLines.map((line, index) => (
        <Text key={`${request.requestId}-detail-${index}`} color={COLORS.muted} wrap="wrap">
          {line}
        </Text>
      ))}

      {/* ── Warnings ── */}
      {request.warnings.map((warning) => (
        <Text key={warning} color={COLORS.warning}>⚠ {warning}</Text>
      ))}

      {/* ── Action list ── */}
      <Box flexDirection="column" marginTop={1}>
        <Text color={COLORS.muted}>─── Actions ────────────────────────────────</Text>
        <Box>
          <Text color={COLORS.success} bold>  [Y] </Text>
          <Text color={COLORS.success}>Allow once</Text>
        </Box>
        <Box>
          <Text color="greenBright" bold>  [A] </Text>
          <Text color="greenBright">Allow this exact call for the rest of this session</Text>
        </Box>
        <Box>
          <Text color={COLORS.accent} bold>  [S] </Text>
          <Text color={COLORS.accent}>Inspect call details</Text>
        </Box>
        <Box>
          <Text color={COLORS.error} bold>  [N] </Text>
          <Text color={COLORS.error}>Deny</Text>
        </Box>
        <Box>
          <Text color="redBright" bold>  [Esc] </Text>
          <Text color="redBright">Cancel run</Text>
        </Box>
      </Box>

      {/* ── Scroll hint ── */}
      <Text color={COLORS.muted}>
        PgUp/PgDn scroll transcript │ Ctrl+L jump to bottom
      </Text>
    </Box>
  );
});

// ---------------------------------------------------------------------------
// ThinkingIndicator
// ---------------------------------------------------------------------------

interface ThinkingIndicatorProps {
  phase: string;
  elapsed: number;
}

export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({
  phase,
  elapsed,
}) => {
  const dots = ".".repeat((Math.floor(elapsed / 500) % 4));

  return (
    <Box paddingX={1}>
      <Text color={COLORS.warning}>... </Text>
      <Text color={COLORS.brand}>{phase}{dots}</Text>
      <Text color={COLORS.muted}> ({(elapsed / 1000).toFixed(1)}s)</Text>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// BudgetWidget
// ---------------------------------------------------------------------------

interface BudgetWidgetProps {
  tokensUsed: number;
  maxTokens: number;
  costUsd: number;
  maxUsd: number;
  callCount: number;
  deniedCount: number;
  pendingCompactionStrategy?: CompactionStrategy | null;
  contextUsage?: ContextWindowSnapshot | null;
  lastCompactionFailure?: { strategy: CompactionStrategy; message: string } | null;
  lastCompaction?: CompactionResult | null;
  workspaceInfo?: WorkspaceInfo | null;
  startupReport?: StartupReport | null;
  providerHealth?: Record<string, RuntimeProviderHealthSnapshot>;
  recentFailovers?: RuntimeFailoverSnapshot[];
  recentHookEvents?: RuntimeHookEventSnapshot[];
  latestCompactionHandoff?: RuntimeCompactionHandoffSnapshot | null;
  persistedSessions?: PersistedSessionSummary[];
  provider: string;
  model: string;
  selectedProvider: string;
  selectedModel: string;
  memoryTruthModeOverride?: MemoryTruthMode | null;
  currentSessionId?: string;
  currentAgentId?: string;
  currentCaste?: string;
  currentStartedMessageTimestamp?: number | null;
  currentLatestMessageTimestamp?: number | null;
  currentMessageCount?: number;
  currentPreviewText?: string;
  currentPreviewRole?: LogMessage["role"] | null;
  currentAwaitingReply?: boolean;
  compactionRecommendationStrategy?: CompactionStrategy | null;
  compactionRecommendationReason?: string;
  microCandidateCount?: number;
  microTokensSavedEstimate?: number;
  pendingApprovalToolName?: string | null;
  pendingApprovalRiskLevel?: string | null;
  pendingApprovalSummary?: string | null;
  recentToolActivity?: ToolActivityFaceSummary[];
}

export const BudgetWidget = React.memo(function BudgetWidget({
  tokensUsed,
  maxTokens,
  costUsd,
  maxUsd,
  callCount,
  deniedCount,
  pendingCompactionStrategy = null,
  contextUsage,
  lastCompactionFailure = null,
  lastCompaction,
  workspaceInfo,
  startupReport,
  providerHealth = {},
  recentFailovers = [],
  recentHookEvents = [],
  latestCompactionHandoff = null,
  persistedSessions = [],
  provider,
  model,
  selectedProvider,
  selectedModel,
  memoryTruthModeOverride = null,
  currentSessionId = "",
  currentAgentId = "unknown",
  currentCaste = "unknown",
  currentStartedMessageTimestamp = null,
  currentLatestMessageTimestamp = null,
  currentMessageCount = 0,
  currentPreviewText = "",
  currentPreviewRole = null,
  currentAwaitingReply = false,
  compactionRecommendationStrategy = null,
  compactionRecommendationReason = "",
  microCandidateCount = 0,
  microTokensSavedEstimate = 0,
  pendingApprovalToolName = null,
  pendingApprovalRiskLevel = null,
  pendingApprovalSummary = null,
  recentToolActivity = [],
}: BudgetWidgetProps) {
  const tokenPct = maxTokens > 0 ? (tokensUsed / maxTokens) * 100 : 0;
  const costPct = maxUsd > 0 ? (costUsd / maxUsd) * 100 : 0;

  const barWidth = 20;
  const tokenFill = Math.min(barWidth, Math.round((tokenPct / 100) * barWidth));
  const costFill = Math.min(barWidth, Math.round((costPct / 100) * barWidth));

  const bar = (fill: number, color: string) => (
    <Text>
      <Text color={color}>{"#".repeat(fill)}</Text>
      <Text color={COLORS.muted}>{"-".repeat(barWidth - fill)}</Text>
    </Text>
  );

  const tokenColor = tokenPct > 85 ? "red" : tokenPct > 60 ? "yellow" : "green";
  const costColor = costPct > 85 ? "red" : costPct > 60 ? "yellow" : "green";
  const startupIssues = (startupReport?.checks ?? []).filter((check) => !check.passed).slice(0, 2);
  const startupFocusCommand = startupDoctorFocusCommand(startupReport ?? null);
  const startupInspectLine = startupDoctorInspectCommands(startupReport ?? null, {
    includeGeneral: true,
    includeSeverity: true,
    includeFirstRun: true,
  }).join(" | ");
  const providerIssueCount = (startupReport?.checks ?? []).filter((check) => {
    if (check.passed) return false;
    const haystack = [check.name, check.message, check.fix]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" ");
    return isProviderIssueText(haystack);
  }).length;
  const startupColor =
    (startupReport?.errorCount ?? 0) > 0
      ? COLORS.error
      : (startupReport?.warningCount ?? 0) > 0
        ? COLORS.warning
        : COLORS.success;
  const providerEntries = Object.entries(providerHealth).sort(([left], [right]) => left.localeCompare(right));
  const currentProviderHealth = providerEntries.find(([providerName]) => providerName === provider)?.[1] ?? null;
  const currentProviderSummary = currentProviderHealth
    ? `${provider}: ${currentProviderHealth.state ?? "unknown"} / fail ${currentProviderHealth.failureCount ?? 0}`
    : `${provider}: no health samples yet`;
  const latestFailover = recentFailovers.at(-1) ?? null;
  const recentFailoverHistory = recentFailovers.slice(-3).reverse();
  const providerRecoveryLabel =
    currentProviderHealth?.state === "open"
      ? `Recovery: circuit open | /provider current | /provider failovers | /doctor ${provider}`
      : latestFailover
        ? `Recovery: /provider current | /provider failovers | /doctor ${provider}`
        : providerIssueCount > 0
          ? `Recovery: /doctor ${provider} | /provider ${provider}`
          : null;
  const providerFailoverCounts = recentFailovers.reduce<Record<string, number>>((counts, event) => {
    const fromProvider = String(event.fromProvider ?? "").trim();
    const toProvider = String(event.toProvider ?? "").trim();
    if (fromProvider) counts[fromProvider] = (counts[fromProvider] ?? 0) + 1;
    if (toProvider && toProvider !== fromProvider) counts[toProvider] = (counts[toProvider] ?? 0) + 1;
    return counts;
  }, {});
  const providerNeedsAttention =
    recentFailovers.length > 0
    || providerIssueCount > 0
    || providerEntries.some(([, health]) => {
      const state = String(health.state ?? "unknown").toLowerCase();
      return state !== "closed" || (health.failureCount ?? 0) > 0;
    });
  const providerAttentionEntries = providerEntries.filter(([providerName, health]) => {
    const state = String(health.state ?? "unknown").toLowerCase();
    return providerName === provider || state !== "closed" || (health.failureCount ?? 0) > 0 || (providerFailoverCounts[providerName] ?? 0) > 0;
  }).slice(0, 3);
  const pendingProviderSelection =
    selectedProvider !== provider
    || selectedModel !== model;
  const memoryLabel = memoryTruthModeLabel(memoryTruthModeOverride);
  const liveSessionShortcuts = React.useMemo(() => buildLiveSessionShortcutSnapshot({
    currentSessionId,
    currentMessageCount,
    currentLatestMessageTimestamp,
    currentAwaitingReply,
    persistedSessions,
  }), [currentAwaitingReply, currentLatestMessageTimestamp, currentMessageCount, currentSessionId, persistedSessions]);
  const hasUnsavedCurrentSession = Boolean(
    currentSessionId
    && currentMessageCount > 0
    && !persistedSessions.some((session) => String(session.sessionId ?? "") === currentSessionId),
  );
  const currentPreviewPrefix =
    currentPreviewRole === "assistant"
      ? "a"
      : currentPreviewRole === "user"
        ? "u"
        : currentPreviewRole === "tool"
          ? "t"
          : currentPreviewRole === "system"
            ? "s"
            : currentPreviewRole === "error"
              ? "!"
              : "m";
  const currentSessionPreview = summarizeTranscriptDisplayText(currentPreviewText, 240, 3);
  const currentLiveState = [
    currentAwaitingReply ? "awaiting reply" : "unsaved current",
    liveSessionShortcuts.currentOwnsLatestHistoryAlias ? "latest live" : null,
  ].filter(Boolean).join(" | ");
  const currentStartedLabel = Number.isFinite(currentStartedMessageTimestamp)
    ? new Date(Number(currentStartedMessageTimestamp)).toISOString()
    : "unknown";
  const currentLatestLabel = Number.isFinite(currentLatestMessageTimestamp)
    ? new Date(Number(currentLatestMessageTimestamp)).toISOString()
    : "unknown";
  const workspaceLabel = !workspaceInfo
    ? "pending"
    : workspaceInfo.detected
      ? `${workspaceInfo.name} (${workspaceInfo.projectType ?? "unknown"}, ${workspaceInfo.workspaceMode ?? "single-package"})`
      : `fallback ${workspaceInfo.root}`;
  const workspaceDetailLabel = workspaceInfo?.detected
    ? workspaceInfo.stackHints?.length
      ? `Workspace detail: ${workspaceInfo.workspaceMode ?? "single-package"} | ${workspaceInfo.stackHints.join(", ")}`
      : `Workspace detail: ${workspaceInfo.workspaceMode ?? "single-package"}`
    : null;
  const workspaceIntentLabel = workspaceInfo?.detected && workspaceInfo.workspaceIntent
    ? `Intent: ${workspaceInfo.workspaceIntent}`
    : null;
  const workspaceTargetsLabel = workspaceInfo?.detected && workspaceInfo.workspacePrimaryTargets?.length
    ? `Targets: ${workspaceInfo.workspacePrimaryTargets.slice(0, 3).join(", ")}`
    : null;
  const workspaceShapeLabel = workspaceInfo?.detected && (workspaceInfo.workspacePackageCount ?? 0) > 0
    ? `Workspace shape: ${workspaceInfo.workspacePackageCount} total | ${workspaceInfo.workspaceAppCount ?? 0} app | ${workspaceInfo.workspaceLibraryCount ?? 0} lib | ${workspaceInfo.workspaceOtherCount ?? 0} other`
    : null;
  const workspaceAppsLabel = workspaceInfo?.detected && workspaceInfo.workspaceAppPackages?.length
    ? `Apps: ${workspaceInfo.workspaceAppPackages.slice(0, 3).join(", ")}`
    : null;
  const workspaceLibrariesLabel = workspaceInfo?.detected && workspaceInfo.workspaceLibraryPackages?.length
    ? `Libs: ${workspaceInfo.workspaceLibraryPackages.slice(0, 3).join(", ")}`
    : null;
  const workspaceOtherPackagesLabel = workspaceInfo?.detected && workspaceInfo.workspaceOtherPackages?.length
    ? `Other packages: ${workspaceInfo.workspaceOtherPackages.slice(0, 3).join(", ")}`
    : null;
  const workspaceDevCandidatesLabel = workspaceInfo?.detected && workspaceInfo.workspaceDevCandidates?.length
    ? `Dev picks: ${workspaceInfo.workspaceDevCandidates.slice(0, 2).join(" | ")}`
    : null;
  const workspaceVerifyCandidatesLabel = workspaceInfo?.detected && workspaceInfo.workspaceVerifyCandidates?.length
    ? `Verify picks: ${workspaceInfo.workspaceVerifyCandidates.slice(0, 2).join(" | ")}`
    : null;
  const workspaceGlobsLabel = workspaceInfo?.detected && workspaceInfo.workspaceGlobs?.length
    ? `Workspaces: ${workspaceInfo.workspaceGlobs.join(", ")}`
    : null;
  const workspaceScriptLabel = workspaceInfo?.detected && workspaceInfo.scriptNames?.length
    ? `Scripts: ${workspaceInfo.scriptNames.slice(0, 4).join(", ")}`
    : null;
  const sessionEntries = persistedSessions.slice(0, 3);
  const currentResumeHint = buildLiveCurrentResumeHint(liveSessionShortcuts);
  const currentHistoryHint = buildLiveCurrentHistoryHint(liveSessionShortcuts, 8);
  const compactionRecommendationLabel = compactionRecommendationStrategy
    ? `Compaction next: /compact smart -> ${compactionRecommendationStrategy}`
    : "Compaction next: hold";

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={COLORS.muted} paddingX={1}>
      <Text color={COLORS.accent} bold>Budget</Text>

      <Box>
        <Text color={COLORS.muted}>Tokens: </Text>
        {bar(tokenFill, tokenColor)}
        <Text color={tokenColor}> {tokenPct.toFixed(0)}%</Text>
      </Box>

      <Box>
        <Text color={COLORS.muted}>Cost:   </Text>
        {bar(costFill, costColor)}
        <Text color={costColor}> ${costUsd.toFixed(4)}/{maxUsd > 0 ? `$${maxUsd.toFixed(2)}` : "inf"}</Text>
      </Box>

      <Box>
        <Text color={COLORS.muted}>Calls: {callCount}</Text>
        {deniedCount > 0 && (
          <Text color={COLORS.error}> | Denied: {deniedCount}</Text>
        )}
      </Box>

      <Text color={COLORS.muted}>Inspect: /cost | /cost models | /cost budget | /cost perf | /perf</Text>

      <Box flexDirection="column">
        <Text color={COLORS.muted}>Tools: {recentToolActivity.length > 0 ? `/tools (${recentToolActivity.length} recent)` : "/tools"}</Text>
        <Text color={COLORS.muted}>Inspect: /tools | /tools approvals | /tools recent | /tools artifacts | /tools perf</Text>
        {pendingApprovalToolName ? (
          <Text color={COLORS.warning} wrap="truncate">
            Approval: {pendingApprovalToolName} | {pendingApprovalRiskLevel ?? "unknown"} | {pendingApprovalSummary ?? "pending"}
          </Text>
        ) : (
          <Text color={COLORS.muted}>Approval: none pending</Text>
        )}
        {recentToolActivity.length > 0 ? recentToolActivity.map((activity, index) => (
          <Box key={`${activity.toolName}-${activity.status}-${index}`} flexDirection="column">
            <Text color={COLORS.muted} wrap="truncate">
              {index + 1}. {activity.toolName} | {activity.status}{activity.detail ? ` | ${activity.detail}` : ""}
            </Text>
            {activity.artifactPath && (
              <Text color={COLORS.muted} wrap="truncate">
                reopen: /artifact "{activity.artifactPath}"
              </Text>
            )}
          </Box>
        )) : (
          <Text color={COLORS.muted}>Recent tools: none in live transcript</Text>
        )}
      </Box>

      <Box flexDirection="column">
        <Text color={COLORS.muted}>Hooks: {recentHookEvents.length > 0 ? `/hooks (${recentHookEvents.length} recent)` : "/hooks"}</Text>
        <Text color={COLORS.muted}>Inspect: /hooks | /hooks recent | /hooks perf | /hooks kinds</Text>
        <Text color={COLORS.muted}>Events: /events | /events failures | /events perf</Text>
        {recentHookEvents.length > 0 ? recentHookEvents.slice(-3).reverse().map((event, index) => (
          <Text key={`${event.timestamp}-${event.kind}-${index}`} color={COLORS.muted} wrap="truncate">
            {index + 1}. {event.kind}{event.detail ? ` | ${event.detail}` : ""}{event.durationMs ? ` | ${event.durationMs}ms` : ""} | {new Date(event.timestamp).toISOString()}
          </Text>
        )) : (
          <Text color={COLORS.muted}>Recent hooks: none in live runtime</Text>
        )}
      </Box>

      {pendingCompactionStrategy && (
        <Box flexDirection="column">
          <Text color={COLORS.warning}>
            Compact queued: {pendingCompactionStrategy}
          </Text>
          <Text color={COLORS.muted}>
            Will run before the next LLM call in this Colony turn.
          </Text>
        </Box>
      )}

      {contextUsage && (
        <Box flexDirection="column">
          <Text color={COLORS.muted}>
            Context: {contextUsage.percentUsed.toFixed(1)}% {contextUsage.isAtBlockingLimit ? "blocking" : contextUsage.isAboveWarningThreshold ? "warning" : "ok"}
          </Text>
          <Text color={COLORS.muted}>
            Failures: {contextUsage.compactionFailureCount}
          </Text>
          {microCandidateCount > 0 && (
            <Text color={COLORS.muted}>
              Micro candidates: {microCandidateCount} older tool results (~{microTokensSavedEstimate}t)
            </Text>
          )}
          <Text color={contextUsage.isAtBlockingLimit ? COLORS.error : contextUsage.isAboveAutoCompactThreshold ? COLORS.warning : COLORS.muted}>
            {compactionRecommendationLabel}
          </Text>
          {compactionRecommendationReason && (
            <Text color={COLORS.muted}>
              Why: {compactionRecommendationReason}
            </Text>
          )}
          <Text color={COLORS.muted}>
            Inspect: /compact status | /compact recent | /compact handoff
          </Text>
          {lastCompactionFailure && (
            <Text color={COLORS.error} wrap="truncate">
              Last fail: {lastCompactionFailure.strategy} | {lastCompactionFailure.message}
            </Text>
          )}
          {latestCompactionHandoff && (
            <Text color={latestCompactionHandoff.status === "failed" ? COLORS.error : COLORS.muted} wrap="truncate">
              Handoff: {latestCompactionHandoff.status} | {latestCompactionHandoff.strategy}/{latestCompactionHandoff.trigger} | {latestCompactionHandoff.loggedCount} logged | {latestCompactionHandoff.structuredCount} structured{latestCompactionHandoff.artifactId ? ` | ${latestCompactionHandoff.artifactId}` : ""}{latestCompactionHandoff.errorMessage ? ` | ${latestCompactionHandoff.errorMessage}` : ""}
            </Text>
          )}
        </Box>
      )}

      {lastCompaction && (
        <Box flexDirection="column">
          <Text color={COLORS.muted}>
            Compact: {lastCompaction.strategyUsed}/{lastCompaction.triggerSource}
          </Text>
          <Text color={COLORS.muted}>
            Saved ~{lastCompaction.tokensSavedEstimate}t | kept {lastCompaction.preservedRecentCount}+{lastCompaction.preservedSystemCount}
          </Text>
          <Text color={COLORS.muted}>
            Before {((lastCompaction.usageBeforeFraction ?? 0) * 100).toFixed(1)}% | {lastCompaction.compacted ? `${lastCompaction.originalCount}->${lastCompaction.finalCount}` : "no change"}
          </Text>
          {lastCompaction.compacted && lastCompaction.strategyUsed === "micro" ? (
            <Text color={COLORS.muted}>
              Micro: {lastCompaction.summarizedMessageCount} older tool results trimmed in place
            </Text>
          ) : lastCompaction.compacted && (
            <Text color={COLORS.muted}>
              Summarized: {lastCompaction.summarizedMessageCount} msg
            </Text>
          )}
        </Box>
      )}

      <Box flexDirection="column">
        <Text color={COLORS.muted}>Workspace: {workspaceLabel}</Text>
        {workspaceDetailLabel && (
          <Text color={COLORS.muted} wrap="truncate">
            {workspaceDetailLabel}
          </Text>
        )}
        {workspaceIntentLabel && (
          <Text color={COLORS.muted} wrap="truncate">
            {workspaceIntentLabel}
          </Text>
        )}
        {workspaceTargetsLabel && (
          <Text color={COLORS.muted} wrap="truncate">
            {workspaceTargetsLabel}
          </Text>
        )}
        {workspaceShapeLabel && (
          <Text color={COLORS.muted} wrap="truncate">
            {workspaceShapeLabel}
          </Text>
        )}
        {workspaceAppsLabel && (
          <Text color={COLORS.muted} wrap="truncate">
            {workspaceAppsLabel}
          </Text>
        )}
        {workspaceLibrariesLabel && (
          <Text color={COLORS.muted} wrap="truncate">
            {workspaceLibrariesLabel}
          </Text>
        )}
        {workspaceOtherPackagesLabel && (
          <Text color={COLORS.muted} wrap="truncate">
            {workspaceOtherPackagesLabel}
          </Text>
        )}
        {workspaceDevCandidatesLabel && (
          <Text color={COLORS.muted} wrap="truncate">
            {workspaceDevCandidatesLabel}
          </Text>
        )}
        {workspaceVerifyCandidatesLabel && (
          <Text color={COLORS.muted} wrap="truncate">
            {workspaceVerifyCandidatesLabel}
          </Text>
        )}
        {workspaceGlobsLabel && (
          <Text color={COLORS.muted} wrap="truncate">
            {workspaceGlobsLabel}
          </Text>
        )}
        {workspaceScriptLabel && (
          <Text color={COLORS.muted} wrap="truncate">
            {workspaceScriptLabel}
          </Text>
        )}
        {workspaceInfo?.detected && (
          <Text color={COLORS.muted} wrap="truncate">
            Inspect: /workspace | /workspace packages | /workspace dev | /workspace verify
          </Text>
        )}
      </Box>

      <Box flexDirection="column">
        <Text color={startupColor}>
          Doctor: {startupReport ? `${startupReport.errorCount} error, ${startupReport.warningCount} warn` : "pending"}
        </Text>
        <Text color={COLORS.muted} wrap="truncate">
          Provider focus: {currentProviderSummary}
        </Text>
        {startupIssues.map((check) => (
          <Box key={check.name} flexDirection="column">
            <Text color={check.severity === "error" ? COLORS.error : COLORS.warning} wrap="truncate">
              {check.severity}: {check.name} - {check.message}
            </Text>
            {check.fix && (
              <Text color={COLORS.muted} wrap="truncate">
                fix: {check.fix}
              </Text>
            )}
          </Box>
        ))}
        {startupReport && (startupReport.errorCount > 0 || startupReport.warningCount > 0) && (
          <>
            {startupFocusCommand && (
              <Text color={COLORS.muted} wrap="truncate">
                Focus: {startupFocusCommand} | /doctor first-run
              </Text>
            )}
            <Text color={COLORS.muted}>
              Inspect: {startupInspectLine} | /doctor workspace | /doctor config | /doctor data | /doctor terminal | /doctor local | /doctor cloud | /doctor providers | /doctor failovers
            </Text>
          </>
        )}
        {latestFailover && (
          <Text color={COLORS.muted} wrap="truncate">
            Latest failover: {formatProviderFailoverFace({
              fromProvider: latestFailover.fromProvider ?? "unknown",
              fromModel: latestFailover.fromModel ?? "unknown",
              toProvider: latestFailover.toProvider ?? "unknown",
              toModel: latestFailover.toModel ?? "unknown",
              errorType: latestFailover.errorType ?? "Error",
              errorMessage: latestFailover.errorMessage ?? "",
            })}
          </Text>
        )}
        {latestFailover?.errorMessage && (
          <Text color={COLORS.muted} wrap="truncate">
            Latest error: {latestFailover.errorMessage}
          </Text>
        )}
        {recentFailoverHistory.length > 1 && (
          <Text color={COLORS.muted}>
            Recent failovers: {recentFailoverHistory.length} | /doctor failovers
          </Text>
        )}
        {recentFailoverHistory.slice(0, 2).map((event, index) => (
          <Text key={`${event.timestamp ?? index}-${event.toProvider ?? "unknown"}`} color={COLORS.muted} wrap="truncate">
            {index + 1}. {formatProviderFailoverFace({
              fromProvider: event.fromProvider ?? "unknown",
              fromModel: event.fromModel ?? "unknown",
              toProvider: event.toProvider ?? "unknown",
              toModel: event.toModel ?? "unknown",
              errorType: event.errorType ?? "Error",
              errorMessage: event.errorMessage ?? "",
            })}
          </Text>
        ))}
        {providerRecoveryLabel && (
          <Text color={COLORS.muted} wrap="truncate">
            {providerRecoveryLabel}
          </Text>
        )}
      </Box>

      <Box flexDirection="column">
        <Text color={COLORS.muted}>LLM now: {provider}:{model}</Text>
        {pendingProviderSelection ? (
          <Text color={COLORS.warning}>LLM next: {selectedProvider}:{selectedModel}</Text>
        ) : (
          <Text color={COLORS.muted}>LLM next: same as current</Text>
        )}
        <Text color={COLORS.muted}>Memory: {memoryLabel} | /memory</Text>
        <Text color={COLORS.muted}>Inspect: /provider | /provider {provider} | /provider perf {provider} | /provider failovers {provider} | /model | /status</Text>
      </Box>

      {providerEntries.length > 0 && (
        <Box flexDirection="column">
          <Text color={COLORS.muted}>Providers:</Text>
          {providerEntries.map(([providerName, health]) => (
            <Text key={providerName} color={COLORS.muted}>
              {providerName}: {health.state ?? "unknown"} / fail {health.failureCount ?? 0}{(providerFailoverCounts[providerName] ?? 0) > 0 ? ` / recent ${providerFailoverCounts[providerName]}` : ""}
            </Text>
          ))}
          {providerNeedsAttention && (
            <Text color={COLORS.muted}>
              Inspect: /provider | /provider current | /provider perf | /provider failovers
            </Text>
          )}
          {providerAttentionEntries.map(([providerName]) => (
            <Text key={`${providerName}-inspect`} color={COLORS.muted} wrap="truncate">
              inspect {providerName}: /provider {providerName} | /provider perf {providerName} | /provider failovers {providerName} | /doctor {providerName}
            </Text>
          ))}
        </Box>
      )}

      {recentFailovers.length > 0 && (
        <Box flexDirection="column">
          <Text color={COLORS.warning}>Recent failovers:</Text>
          {recentFailovers.slice(-2).map((event) => (
            <Text
              key={`${event.timestamp}-${event.fromProvider}-${event.toProvider}`}
              color={COLORS.muted}
              wrap="truncate"
            >
              {event.fromProvider}:{event.fromModel} -&gt; {event.toProvider}:{event.toModel} ({event.errorType})
            </Text>
          ))}
        </Box>
      )}

      {(sessionEntries.length > 0 || hasUnsavedCurrentSession) && (
        <Box flexDirection="column">
          <Text color={COLORS.accent}>Recent sessions:</Text>
          {hasUnsavedCurrentSession && (
            <Box flexDirection="column">
              <Text color={COLORS.muted}>
                live. {currentSessionId.replace(/^ses_/, "")} | {currentMessageCount} msg | unsaved
              </Text>
              <Text color={COLORS.muted} wrap="truncate">
                {currentAgentId} | {normalizeCaste(currentCaste)} | live transcript
              </Text>
              <Text color={currentAwaitingReply ? COLORS.warning : COLORS.muted}>
                {currentLiveState}
              </Text>
              <Text color={COLORS.muted} wrap="truncate">
                started {currentStartedLabel} | last {currentLatestLabel}
              </Text>
              <Text color={COLORS.muted} wrap="truncate">
                cost ${costUsd.toFixed(4)} | tokens {tokensUsed.toLocaleString()}
              </Text>
              {currentPreviewText && (
                <Box flexDirection="column">
                  <Text color={COLORS.muted} wrap="truncate">
                    {currentPreviewPrefix}: {currentSessionPreview.preview}
                  </Text>
                  {currentSessionPreview.truncated && (
                    <Text color={COLORS.muted} wrap="truncate">
                      ... {currentSessionPreview.hiddenChars.toLocaleString()} more chars hidden in face | transcript truth kept
                    </Text>
                  )}
                </Box>
              )}
              <Text color={COLORS.muted}>
                use {currentResumeHint}
              </Text>
              <Text color={COLORS.muted}>
                peek {currentHistoryHint}
              </Text>
            </Box>
          )}
          {sessionEntries.map((session, index) => {
            const currentTarget = currentSessionId && currentSessionId === session.sessionId;
            const marker = currentTarget ? " current" : "";
            const interruptionColor =
              session.interruption === "none"
                ? COLORS.muted
                : COLORS.warning;
            const sessionCatalogIndex = index + 1;
            const resumeHint = buildPersistedSessionResumeHint({
              sessionId: session.sessionId,
              sessionCatalogIndex,
              currentTarget: Boolean(currentTarget),
              snapshot: liveSessionShortcuts,
            });
            const historyHint = buildPersistedSessionHistoryHint({
              sessionId: session.sessionId,
              sessionCatalogIndex,
              currentTarget: Boolean(currentTarget),
              snapshot: liveSessionShortcuts,
              count: 8,
            });
            const previewPrefix =
              session.previewRole === "assistant"
                ? "a"
                : session.previewRole === "user"
                  ? "u"
                  : session.previewRole === "tool"
                    ? "t"
                    : "m";
            const savedSessionPreview = summarizeTranscriptDisplayText(session.previewText ?? "", 240, 3);
            return (
              <Box key={session.sessionId} flexDirection="column">
                <Text color={COLORS.muted}>
                  {index + 1}. {session.sessionId.replace(/^ses_/, "")} | {session.messageCount} msg | {session.hasCheckpoint ? "chk" : "trl"}{marker}
                </Text>
                <Text color={interruptionColor}>
                  {session.interruption === "none" ? "clean" : session.interruption === "interrupted_prompt" ? "awaiting reply" : "tool turn interrupted"}
                </Text>
                <Text color={COLORS.muted} wrap="truncate">
                  {session.agentId} | {normalizeCaste(session.caste)} | {session.hasCheckpoint ? "checkpoint" : "transcript-only"}
                </Text>
                {(session.provider || session.model) && (
                  <Text color={COLORS.muted} wrap="truncate">
                    llm {session.provider ?? "unknown"}:{session.model ?? "unknown"}
                  </Text>
                )}
                <Text color={COLORS.muted} wrap="truncate">
                  saved {session.savedAt} | last {session.lastMessageAt}
                </Text>
                <Text color={COLORS.muted} wrap="truncate">
                  cost ${session.costUsd.toFixed(4)} | tokens {session.tokensUsed.toLocaleString()}
                </Text>
                {session.previewText && (
                  <Box flexDirection="column">
                    <Text color={COLORS.muted} wrap="truncate">
                      {previewPrefix}: {savedSessionPreview.preview}
                    </Text>
                    {savedSessionPreview.truncated && (
                      <Text color={COLORS.muted} wrap="truncate">
                        ... {savedSessionPreview.hiddenChars.toLocaleString()} more chars hidden in face | transcript truth kept
                      </Text>
                    )}
                  </Box>
                )}
                <Text color={COLORS.muted}>
                  use {resumeHint}
                </Text>
                <Text color={COLORS.muted}>
                  peek {historyHint}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
});

// ---------------------------------------------------------------------------
// CasteLabel
// ---------------------------------------------------------------------------

const CASTE_COLORS: Record<string, string> = {
  queen: "magenta",
  eldest: "blue",
  vigil_ant: "red",
  consult_ant: "yellow",
  develop_ant: "green",
  logist_ant: "blue",
  inform_ant: "cyan",
  account_ant: "yellow",
  cogniz_ant: "cyan",
  command_ant: "blue",
  oper_ant: "gray",
  root_queen: "magenta",
  eldest_architect: "blue",
  shield_generals: "red",
  watcher_swarm: "yellow",
  forge_carvers: "green",
  assist_ant: "cyan",
  nameless_swarm: "gray",
};

const CASTE_ICONS: Record<string, string> = {
  queen: "queen",
  eldest: "eldest",
  vigil_ant: "vigil",
  consult_ant: "consult",
  develop_ant: "develop",
  logist_ant: "logist",
  inform_ant: "inform",
  account_ant: "account",
  cogniz_ant: "cogniz",
  command_ant: "command",
  oper_ant: "oper",
  root_queen: "queen",
  eldest_architect: "arch",
  shield_generals: "shield",
  watcher_swarm: "watch",
  forge_carvers: "forge",
  assist_ant: "ant",
  nameless_swarm: "swarm",
};

interface CasteLabelProps {
  caste: string;
}

export const CasteLabel: React.FC<CasteLabelProps> = ({ caste }) => {
  const key = normalizeCaste(caste);
  const color = CASTE_COLORS[key] ?? "gray";
  const icon = CASTE_ICONS[key] ?? "caste";

  return (
    <Text color={color} bold>
      {icon} {formatCasteDisplay(caste)}
    </Text>
  );
};

// ---------------------------------------------------------------------------
// ToolCallDisplay
// ---------------------------------------------------------------------------

interface ToolCallDisplayProps {
  toolName: string;
  args: Record<string, unknown>;
  output?: string;
  error?: string;
  durationMs?: number;
  externalizedResult?: PersistedToolResult | null;
}

function summarizeToolText(text: string, maxChars = 220): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

export interface StructuredToolOutcome {
  headline: string;
  detailLines: string[];
  headlineColor?: string;
}

export function summarizeBuiltinToolOutput(
  toolName: string,
  args: Record<string, unknown>,
  output: string,
): StructuredToolOutcome | null {
  const text = String(output ?? "");
  if (!text || text.startsWith("[error]")) return null;

  if (toolName === "file_read") {
    const path = String(args.path ?? "unknown");
    const normalized = text.replace(/\r\n/g, "\n");
    const lineCount = normalized.length === 0 ? 0 : normalized.split("\n").length;
    const preview = summarizeToolText(normalized, 180);
    return {
      headline: `read: ${path}`,
      headlineColor: COLORS.success,
      detailLines: [
        `chars: ${text.length.toLocaleString()} | lines: ${lineCount.toLocaleString()}`,
        `preview: ${preview}`,
      ],
    };
  }

  if (toolName === "shell_exec") {
    const exitMatch = /\[exit code: (-?\d+)\]\s*$/.exec(text);
    if (!exitMatch) return null;
    const exitCode = Number.parseInt(exitMatch[1] ?? "0", 10);
    const withoutExit = text.slice(0, exitMatch.index).trimEnd();
    const stderrMarker = "\n[stderr]\n";
    const stderrIndex = withoutExit.lastIndexOf(stderrMarker);
    const stdout = stderrIndex >= 0 ? withoutExit.slice(0, stderrIndex).trim() : withoutExit.trim();
    const stderr = stderrIndex >= 0 ? withoutExit.slice(stderrIndex + stderrMarker.length).trim() : "";
    return {
      headline: `exit: ${exitCode}`,
      headlineColor: exitCode === 0 ? COLORS.success : COLORS.error,
      detailLines: [
        stdout ? `stdout: ${summarizeToolText(stdout, 180)}` : "stdout: (empty)",
        stderr ? `stderr: ${summarizeToolText(stderr, 180)}` : null,
      ].filter((line): line is string => Boolean(line)),
    };
  }

  const fileWriteMatch = /^Successfully wrote ([\d,]+) characters to (.+)$/.exec(text.trim());
  if (toolName === "file_write" && fileWriteMatch) {
    return {
      headline: `write: ${fileWriteMatch[2]}`,
      headlineColor: COLORS.success,
      detailLines: [`chars: ${fileWriteMatch[1]}`],
    };
  }

  if (toolName === "file_list" && text.startsWith("Contents of '")) {
    const lines = text.split(/\r?\n/);
    const directoryMatch = /^Contents of '(.+)':$/.exec(lines[0] ?? "");
    const entries = lines.slice(1).filter(Boolean);
    const dirCount = entries.filter((line) => line.includes("[DIR ]")).length;
    const fileCount = entries.filter((line) => line.includes("[FILE]")).length;
    return {
      headline: `list: ${directoryMatch?.[1] ?? "."}`,
      headlineColor: COLORS.success,
      detailLines: [
        `entries: ${entries.length} (${dirCount} dir, ${fileCount} file)`,
        ...entries.slice(0, 3).map((line) => summarizeToolText(line.trim(), 180)),
      ],
    };
  }

  if (toolName === "file_edit" && text.startsWith("Edited ")) {
    const lines = text.split(/\r?\n/);
    const path = text.split(/\r?\n/, 1)[0]?.replace(/^Edited /, "").trim() || "unknown";
    const dividerIndex = lines.indexOf("---");
    const removed = dividerIndex >= 0
      ? lines.slice(1, dividerIndex).filter((line) => line.startsWith("- ")).map((line) => line.slice(2))
      : [];
    const added = dividerIndex >= 0
      ? lines.slice(dividerIndex + 1).filter((line) => line.startsWith("+ ")).map((line) => line.slice(2))
      : [];
    return {
      headline: `edit: ${path}`,
      headlineColor: COLORS.success,
      detailLines: [
        removed[0] ? `old: ${summarizeToolText(removed[0], 180)}` : null,
        added[0] ? `new: ${summarizeToolText(added[0], 180)}` : null,
      ].filter((line): line is string => Boolean(line)),
    };
  }

  if (toolName === "grep_search") {
    if (text.startsWith("No matches found for pattern: ")) {
      return {
        headline: "matches: 0",
        headlineColor: COLORS.warning,
        detailLines: [summarizeToolText(text, 180)],
      };
    }
    const lines = text.split(/\r?\n/).filter(Boolean);
    const truncated = lines.at(-1)?.startsWith("[Results truncated") ?? false;
    const matchLines = truncated ? lines.slice(0, -1) : lines;
    if (matchLines.length > 0) {
      return {
        headline: `matches: ${matchLines.length}${truncated ? "+" : ""}`,
        headlineColor: COLORS.success,
        detailLines: matchLines.slice(0, 3).map((line) => summarizeToolText(line, 180)),
      };
    }
  }

  return null;
}

export function summarizeBuiltinToolError(
  toolName: string,
  error: string,
): StructuredToolOutcome | null {
  const text = String(error ?? "");
  if (!text.startsWith("[error]")) return null;
  const message = text.replace(/^\[error\]\s*/, "");

  if (toolName === "shell_exec") {
    const blockedMatch = /^Blocked command: '(.+)' is not allowed by sandbox policy$/.exec(message);
    if (blockedMatch) {
      return {
        headline: "blocked shell",
        headlineColor: COLORS.error,
        detailLines: [`command: ${blockedMatch[1]}`],
      };
    }
    const timeoutMatch = /^Command timed out after (\d+)s$/.exec(message);
    if (timeoutMatch) {
      return {
        headline: `timeout: ${timeoutMatch[1]}s`,
        headlineColor: COLORS.error,
        detailLines: ["shell command killed before completion"],
      };
    }
    const failedMatch = /^Failed to execute command: (.+)$/.exec(message);
    if (failedMatch) {
      return {
        headline: "shell failed",
        headlineColor: COLORS.error,
        detailLines: [summarizeToolText(failedMatch[1], 180)],
      };
    }
  }

  const missingPathMatch = /^File not found: (.+)$/.exec(message);
  if (missingPathMatch) {
    return {
      headline: `missing file: ${missingPathMatch[1]}`,
      headlineColor: COLORS.error,
      detailLines: [],
    };
  }

  const missingDirectoryMatch = /^Not a directory: (.+)$/.exec(message);
  if (missingDirectoryMatch) {
    return {
      headline: `not directory: ${missingDirectoryMatch[1]}`,
      headlineColor: COLORS.error,
      detailLines: [],
    };
  }

  const missingPathLabelMatch = /^No (path|pattern) specified$/.exec(message);
  if (missingPathLabelMatch) {
    return {
      headline: `${missingPathLabelMatch[1]} missing`,
      headlineColor: COLORS.error,
      detailLines: [],
    };
  }

  if (toolName === "file_edit") {
    if (message === "old_string cannot be empty") {
      return {
        headline: "edit match missing",
        headlineColor: COLORS.error,
        detailLines: ["old_string must be non-empty"],
      };
    }
    const notFoundMatch = /^old_string not found in (.+?)\.\n(.+)$/.exec(message);
    if (notFoundMatch) {
      return {
        headline: `edit match missing: ${notFoundMatch[1]}`,
        headlineColor: COLORS.error,
        detailLines: [summarizeToolText(notFoundMatch[2], 180)],
      };
    }
    const ambiguousMatch = /^old_string found (\d+) times in (.+?); (.+)$/.exec(message);
    if (ambiguousMatch) {
      return {
        headline: `edit match ambiguous: ${ambiguousMatch[2]}`,
        headlineColor: COLORS.error,
        detailLines: [`matches: ${ambiguousMatch[1]}`, summarizeToolText(ambiguousMatch[3], 180)],
      };
    }
  }

  if (toolName === "grep_search") {
    const invalidRegexMatch = /^Invalid regex pattern: (.+)$/.exec(message);
    if (invalidRegexMatch) {
      return {
        headline: "regex invalid",
        headlineColor: COLORS.error,
        detailLines: [summarizeToolText(invalidRegexMatch[1], 180)],
      };
    }
    const missingSearchPathMatch = /^Path does not exist: (.+)$/.exec(message);
    if (missingSearchPathMatch) {
      return {
        headline: `search path missing: ${missingSearchPathMatch[1]}`,
        headlineColor: COLORS.error,
        detailLines: [],
      };
    }
  }

  return {
    headline: "tool error",
    headlineColor: COLORS.error,
    detailLines: [summarizeToolText(message, 180)],
  };
}

export const ToolCallDisplay: React.FC<ToolCallDisplayProps> = ({
  toolName,
  args,
  output,
  error,
  durationMs,
  externalizedResult,
}) => {
  const approvalMessage = parsePendingApprovalMessage(error ?? output ?? "");
  const deniedResult = approvalMessage ? null : error ? parseDeniedToolResultMessage(error) : null;
  const structuredOutcome = output ? summarizeBuiltinToolOutput(toolName, args, output) : null;
  const structuredError = approvalMessage || deniedResult || !error
    ? null
    : summarizeBuiltinToolError(toolName, error);
  const errorPreview = error ? summarizeTranscriptDisplayText(error, 600, 8) : null;
  const argsStr = Object.entries(args)
    .map(([key, value]) => {
      const valueStr = String(value);
      return `${key}=${valueStr.length > 60 ? `${valueStr.slice(0, 60)}...` : valueStr}`;
    })
    .join(", ");
  const approvalColor =
    approvalMessage?.riskLevel === "high"
      ? COLORS.error
      : approvalMessage?.riskLevel === "medium"
        ? COLORS.warning
        : COLORS.success;
  const borderColor = approvalMessage
    ? approvalColor
    : deniedResult
      ? deniedResult.status === "Cancelled by operator."
        ? COLORS.warning
        : COLORS.error
      : COLORS.tool;
  const denialColor = deniedResult?.status === "Cancelled by operator." ? COLORS.warning : COLORS.error;

  return (
    <Box flexDirection="column" paddingX={1} borderStyle="single" borderColor={borderColor}>
      <Box>
        <Text color={COLORS.tool} bold>tool {toolName}</Text>
        {durationMs != null && (
          <Text color={COLORS.muted}> ({durationMs}ms)</Text>
        )}
      </Box>

      {argsStr && (
        <Text color={COLORS.muted} wrap="truncate">
          args: {argsStr}
        </Text>
      )}

      {externalizedResult ? (
        <>
          <Text color={COLORS.accent}>artifact: saved on disk</Text>
          <Text color={COLORS.muted} wrap="truncate">
            saved: {externalizedResult.filepath}
          </Text>
          <Text color={COLORS.muted}>
            size: {externalizedResult.originalSize.toLocaleString()} chars
            {externalizedResult.isJson ? " | json" : ""}
          </Text>
          <Text color={COLORS.muted} wrap="truncate">
            inspect: /artifact "{externalizedResult.filepath}"
          </Text>
          {externalizedResult.redacted && (
            <Text color={COLORS.warning}>redacted before persistence</Text>
          )}
          {externalizedResult.preview && (
            <Text color={COLORS.muted} wrap="wrap">
              preview: {summarizeToolText(externalizedResult.preview)}
            </Text>
          )}
          {externalizedResult.hasMore && (
            <Text color={COLORS.muted}>... more saved on disk</Text>
          )}
        </>
      ) : approvalMessage ? (
        <>
          <Text color={approvalColor}>approval: {approvalMessage.status}</Text>
          <Text color={COLORS.muted} wrap="truncate">
            reason: {approvalMessage.reason}
          </Text>
          <Text color={COLORS.muted}>
            risk: {approvalMessage.riskLevel} | category: {approvalMessage.category}
          </Text>
          <Text color={COLORS.muted} wrap="truncate">
            signature: {approvalMessage.signature}
          </Text>
          <Text color={COLORS.muted} wrap="truncate">
            summary: {approvalMessage.summary}
          </Text>
          {approvalMessage.details.map((detail) => (
            <Text key={detail} color={COLORS.muted} wrap="truncate">
              detail: {detail}
            </Text>
          ))}
          {approvalMessage.warnings.map((warning) => (
            <Text key={warning} color={COLORS.warning} wrap="truncate">
              warning: {warning}
            </Text>
          ))}
        </>
      ) : deniedResult ? (
        <>
          <Text color={denialColor}>approval: {deniedResult.status}</Text>
          <Text color={COLORS.muted} wrap="truncate">
            reason: {deniedResult.reason}
          </Text>
          <Text color={COLORS.muted}>
            risk: {deniedResult.riskLevel} | category: {deniedResult.category}
          </Text>
          <Text color={COLORS.muted} wrap="truncate">
            signature: {deniedResult.signature}
          </Text>
          <Text color={COLORS.muted} wrap="truncate">
            summary: {deniedResult.summary}
          </Text>
          {deniedResult.warnings.map((warning) => (
            <Text key={warning} color={COLORS.warning} wrap="truncate">
              warning: {warning}
            </Text>
          ))}
        </>
      ) : structuredError ? (
        <>
          <Text color={structuredError.headlineColor ?? COLORS.error}>
            {structuredError.headline}
          </Text>
          {structuredError.detailLines.map((line) => (
            <Text key={line} color={COLORS.muted} wrap="truncate">
              {line}
            </Text>
          ))}
        </>
      ) : errorPreview ? (
        <>
          <Text color={COLORS.error}>x {errorPreview.preview}</Text>
          {errorPreview.truncated && (
            <Text color={COLORS.muted}>
              ... {errorPreview.hiddenChars.toLocaleString()} more chars hidden in face | transcript truth kept
            </Text>
          )}
        </>
      ) : structuredOutcome ? (
        <>
          <Text color={structuredOutcome.headlineColor ?? COLORS.muted}>
            {structuredOutcome.headline}
          </Text>
          {structuredOutcome.detailLines.map((line) => (
            <Text key={line} color={COLORS.muted} wrap="truncate">
              {line}
            </Text>
          ))}
        </>
      ) : output ? (
        <Text color={COLORS.muted} wrap="truncate">
          {summarizeToolText(output, 200)}
        </Text>
      ) : null}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// WelcomeBanner
// ---------------------------------------------------------------------------

export const WelcomeBanner = React.memo(function WelcomeBanner({
  caste,
  memoryTruthModeOverride = null,
}: {
  caste?: string;
  memoryTruthModeOverride?: MemoryTruthMode | null;
}) {
  const memoryLabel = memoryTruthModeLabel(memoryTruthModeOverride);
  return (
    <Box flexDirection="column" paddingX={1} marginBottom={1}>
      <Text color={COLORS.brand} bold>
        +------------------------------------------+
      </Text>
      <Text color={COLORS.brand} bold>
        |        THE COLONY v1.0                  |
      </Text>
      <Text color={COLORS.brand} bold>
        |   Local-first Agent Operating System    |
      </Text>
      <Text color={COLORS.brand} bold>
        +------------------------------------------+
      </Text>

      <Text color={COLORS.muted}> </Text>
      <Text color={COLORS.accent}>
        Commands: /help, /status, /cost, /sessions, /history, /resume
      </Text>
      <Text color={COLORS.muted}>
        Session views: /sessions pending|current | /history latest|pending|current | /resume latest|pending
      </Text>
      <Text color={COLORS.accent}>
Runtime: /doctor, /provider, /model, /memory, /workflow, /perf, /permissions, /tools, /hooks, /events, /events perf, /budget, /compact smart, /cancel
      </Text>
      <Text color={COLORS.muted}>
        Memory recall: {memoryLabel} | /memory auto|exact|derived|balanced|prefer-exact|prefer-derived
      </Text>
      <Text color={COLORS.muted}>
        Policy views: /permissions active|allowed|denied|rules | /tools approvals|recent|artifacts|perf
      </Text>
      <Text color={COLORS.muted}>
        Scroll: PgUp older | PgDn newer | Ctrl+L latest
      </Text>
      <Text color={COLORS.muted}>
        Nav: {SESSION_NAV_LABEL}
      </Text>
      {caste && <CasteLabel caste={caste} />}
    </Box>
  );
});
