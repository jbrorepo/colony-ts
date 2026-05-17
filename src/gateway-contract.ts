import type { CompactionStrategy } from "./runtime/compaction";
import type { MemoryTruthMode } from "./memory/hybrid-memory";
import type {
  RuntimeCompactionEventSnapshot,
  RuntimeCompactionHandoffSnapshot,
  RuntimeContextSnapshot,
} from "./runtime/runtime-snapshot";
import type { SwarmRunSnapshot } from "./orchestrator";
import type {
  SwarmExecutionMode,
  SwarmStage,
} from "./orchestrator";
import type {
  HistoryFilterMode,
  SessionShortcutAlias,
} from "./gateway-session";
import type { GatewayDaemonContext } from "./gateway-daemon";
import type { GatewaySkillsContext } from "./gateway-skills";
import type { GatewayChannelsContext } from "./gateway-channels";
import type { GatewayToolDefinitionView } from "./gateway-tools";

export type CommandAction =
  | { kind: "display" }
  | { kind: "submit"; message: string }
  | { kind: "start_swarm"; objective: string; executionMode?: SwarmExecutionMode }
  | { kind: "cancel_swarm"; runId: string }
  | { kind: "resume_swarm"; runId: string }
  | { kind: "retry_swarm_stage"; runId: string; stage: SwarmStage }
  | { kind: "show_artifact"; filepath: string }
  | { kind: "show_artifact_catalog"; sessionId: string; latest?: boolean }
  | { kind: "set_budget"; maxUsd: number }
  | { kind: "set_provider"; provider: string; model?: string }
  | { kind: "set_memory_truth_mode"; mode: MemoryTruthMode | null }
  | { kind: "register_external_channel_adapter"; channelId: string }
  | { kind: "setup_external_channel_webhook"; channelId: string }
  | { kind: "setup_external_channel_subscription"; channelId: string }
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
  recentCompactions?: Array<Partial<RuntimeCompactionEventSnapshot>>;
  latestCompactionHandoff?: Partial<RuntimeCompactionHandoffSnapshot> | null;
  permissions?: {
    caste?: string;
    allowed?: string[];
    denied?: string[];
    active?: string[];
    sessionRules?: string[];
  };
  toolDefinitions?: GatewayToolDefinitionView[];
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
  runtime?: Partial<RuntimeContextSnapshot> | null;
  swarm?: {
    runs?: SwarmRunSnapshot[];
  } | null;
  daemon?: GatewayDaemonContext | null;
  channels?: GatewayChannelsContext | null;
  skills?: GatewaySkillsContext | null;
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
