import type { CompactionStrategy } from "./runtime/compaction";
import type {
  HistoryFilterMode,
  SessionShortcutAlias,
} from "./gateway-session";

export type CommandAction =
  | { kind: "display" }
  | { kind: "submit"; message: string }
  | { kind: "show_artifact"; filepath: string }
  | { kind: "show_artifact_catalog"; sessionId: string; latest?: boolean }
  | { kind: "set_budget"; maxUsd: number }
  | { kind: "set_provider"; provider: string; model?: string }
  | { kind: "cancel_run" }
  | { kind: "clear_session" }
  | { kind: "compact"; strategy: CompactionStrategy }
  | { kind: "resume_session"; sessionId: string }
  | {
    kind: "show_session_history";
    sessionId: string;
    count: number;
    resumeAliases?: SessionShortcutAlias[];
    historyFilter?: HistoryFilterMode | null;
    historySearch?: string | null;
  }
  | { kind: "exit" };

export interface CommandResult {
  handled: boolean;
  command: string;
  output: string;
  data: Record<string, unknown>;
  isError: boolean;
  action?: CommandAction;
}

export interface SlashCommandContext {
  session?: unknown;
  costTracker?: unknown;
  security?: unknown;
  hookRunner?: unknown;
  contextUsage?: {
    usedTokens?: number;
    maxTokens?: number;
    remainingTokens?: number;
    percentUsed?: number;
    messageCount?: number;
    isAboveWarningThreshold?: boolean;
    isAboveAutoCompactThreshold?: boolean;
    isAtBlockingLimit?: boolean;
    compactionFailureCount?: number;
  } | null;
  lastCompactionFailure?: {
    strategy?: string;
    message?: string;
  } | null;
  lastCompaction?: {
    strategyUsed?: string;
    compacted?: boolean;
    originalCount?: number;
    finalCount?: number;
    tokensSavedEstimate?: number;
    triggerSource?: string;
    usageBeforeFraction?: number;
    preservedSystemCount?: number;
    preservedRecentCount?: number;
    summarizedMessageCount?: number;
    summaryLineCount?: number;
  } | null;
  recentCompactions?: Array<{
    strategy?: string;
    trigger?: string;
    timestamp?: number;
    durationMs?: number;
    compacted?: boolean;
    originalCount?: number;
    finalCount?: number;
    tokensSavedEstimate?: number;
    summaryLineCount?: number;
    summarizedMessageCount?: number;
    failureMessage?: string;
  }>;
  latestCompactionHandoff?: {
    status?: string;
    strategy?: string;
    trigger?: string;
    timestamp?: number;
    loggedCount?: number;
    structuredCount?: number;
    artifactId?: string;
    artifactChars?: number;
    errorMessage?: string;
  } | null;
  permissions?: {
    caste?: string;
    allowed?: string[];
    denied?: string[];
    active?: string[];
    sessionRules?: string[];
  };
  approvals?: {
    pending?: boolean;
    sessionRuleCount?: number;
    toolName?: string;
    category?: string;
    riskLevel?: string;
    summary?: string;
    signature?: string;
    reason?: string;
    warningCount?: number;
  } | null;
  startupReport?: {
    passed?: boolean;
    errorCount?: number;
    warningCount?: number;
    checks?: Array<{
      name?: string;
      passed?: boolean;
      severity?: string;
      message?: string;
      fix?: string;
    }>;
  } | null;
  budget?: {
    maxUsd?: number;
    maxTokens?: number;
  };
  sessions?: Array<{
    sessionId?: string;
    agentId?: string;
    caste?: string;
    provider?: string;
    model?: string;
    savedAt?: string;
    lastMessageAt?: string;
    messageCount?: number;
    tokensUsed?: number;
    costUsd?: number;
    interruption?: string;
    hasCheckpoint?: boolean;
    previewText?: string;
    previewRole?: string;
  }>;
  workspace?: {
    root: string;
    startDir?: string;
    name: string;
    detected: boolean;
    projectType: string;
    packageManager: string;
    workspaceMode?: string;
    workspaceGlobs?: string[];
    workspacePackageCount?: number;
    workspaceAppCount?: number;
    workspaceLibraryCount?: number;
    workspaceOtherCount?: number;
    workspaceAppPackages?: string[];
    workspaceLibraryPackages?: string[];
    workspaceOtherPackages?: string[];
    workspaceDevCandidates?: string[];
    workspaceVerifyCandidates?: string[];
    workspaceIntent?: string;
    workspacePrimaryTargets?: string[];
    scriptNames?: string[];
    devCommand?: string | null;
    verifyCommand?: string | null;
    stackHints?: string[];
    reason?: string;
    markers?: string[];
  } | null;
  runtime?: {
    provider?: string;
    model?: string;
    selectedProvider?: string;
    selectedModel?: string;
    providerDefaults?: Record<string, string>;
    circuitState?: string;
    activeRun?: boolean;
    isThinking?: boolean;
    pendingCompactionStrategy?: string | null;
    availableProviders?: string[];
    failover?: Record<string, string[]>;
    providerHealth?: Record<string, {
      state?: string;
      failureCount?: number;
    }>;
    recentFailovers?: Array<{
      fromProvider?: string;
      fromModel?: string;
      toProvider?: string;
      toModel?: string;
      errorType?: string;
      errorMessage?: string;
      timestamp?: number;
    }>;
    startupErrors?: number;
    startupWarnings?: number;
  } | null;
  [key: string]: unknown;
}

export type CommandHandler = (
  args: string[],
  context: SlashCommandContext,
) => CommandResult;

export function result(opts: {
  handled?: boolean;
  command?: string;
  output?: string;
  data?: Record<string, unknown>;
  isError?: boolean;
  action?: CommandAction;
} = {}): CommandResult {
  return {
    handled: opts.handled ?? true,
    command: opts.command ?? "",
    output: opts.output ?? "",
    data: opts.data ?? {},
    isError: opts.isError ?? false,
    action: opts.action ?? { kind: "display" },
  };
}
