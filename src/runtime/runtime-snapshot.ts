import type { CompactionStrategy } from "./compaction";
import type { MemoryTruthMode } from "../memory/hybrid-memory";
import type { MemoryRecallDiagnosticsSnapshot } from "../memory/service";

export interface RuntimeProviderHealthSnapshot {
  state?: string;
  failureCount?: number;
}

export interface RuntimeFailoverSnapshot {
  fromProvider?: string;
  fromModel?: string;
  toProvider?: string;
  toModel?: string;
  errorType?: string;
  errorMessage?: string;
  timestamp?: number;
}

export interface RuntimeToolActivitySummary {
  toolName: string;
  status: string;
  detail?: string;
  artifactPath?: string;
}

export interface RuntimeHookEventSnapshot {
  kind: string;
  detail?: string;
  timestamp: number;
  durationMs?: number;
}

export interface RuntimeCompactionEventSnapshot {
  strategy: CompactionStrategy;
  trigger: string;
  timestamp: number;
  durationMs?: number;
  compacted: boolean;
  originalCount: number;
  finalCount: number;
  tokensSavedEstimate: number;
  summaryLineCount: number;
  summarizedMessageCount: number;
  failureMessage?: string;
}

export interface RuntimeCompactionHandoffSnapshot {
  status: "ok" | "failed";
  strategy: CompactionStrategy;
  trigger: string;
  timestamp: number;
  loggedCount: number;
  structuredCount: number;
  artifactId?: string;
  artifactChars?: number;
  errorMessage?: string;
}

export interface RuntimeSessionUsageSnapshot {
  tokensUsed: number;
  costUsd: number;
  callCount: number;
  deniedCount: number;
  maxUsd: number;
  maxTokens: number;
}

export type RuntimeMemoryRecallSnapshot = MemoryRecallDiagnosticsSnapshot;

export interface RuntimeWorkflowRunSnapshot {
  runId: string;
  definitionId?: string;
  title?: string;
  status: string;
  completedSteps: number;
  totalSteps: number;
  awaitingStepId?: string;
  failedStepId?: string;
  artifactCount?: number;
  checkpointCount?: number;
  updatedAt?: number;
}

export interface RuntimeContextSnapshot {
  provider?: string;
  model?: string;
  selectedProvider?: string;
  selectedModel?: string;
  providerDefaults?: Record<string, string>;
  circuitState?: string;
  activeRun?: boolean;
  isThinking?: boolean;
  interruptRequested?: boolean;
  queuedPromptCount?: number;
  queuedPromptPreview?: string | null;
  availableProviders?: string[];
  failover?: Record<string, string[]>;
  providerHealth?: Record<string, RuntimeProviderHealthSnapshot>;
  recentFailovers?: RuntimeFailoverSnapshot[];
  recentToolActivity?: RuntimeToolActivitySummary[];
  recentHookEvents?: RuntimeHookEventSnapshot[];
  activeToolIds?: string[];
  activeToolCount?: number;
  permittedToolIds?: string[];
  permittedToolCount?: number;
  pendingApproval?: boolean;
  pendingApprovalToolName?: string;
  pendingApprovalRiskLevel?: "low" | "medium" | "high";
  pendingApprovalCategory?: string;
  pendingApprovalSummary?: string;
  pendingApprovalSignature?: string;
  pendingApprovalReason?: string;
  pendingApprovalWarningCount?: number;
  sessionRuleCount?: number;
  sessionRules?: string[];
  budgetUsd?: number | null;
  budgetSpentUsd?: number;
  budgetRemainingUsd?: number | null;
  contextUsedTokens?: number;
  contextMaxTokens?: number;
  contextRemainingTokens?: number;
  contextPercentUsed?: number;
  contextPressure?: "ok" | "warning" | "blocking";
  compactionFailureCount?: number;
  lastCompactionFailureStrategy?: string;
  lastCompactionFailureMessage?: string;
  pendingCompactionStrategy?: CompactionStrategy | null;
  memoryTruthModeOverride?: MemoryTruthMode | null;
  lastMemoryRecall?: RuntimeMemoryRecallSnapshot | null;
  workflowRuns?: RuntimeWorkflowRunSnapshot[];
  lastCompactionStrategy?: string;
  lastCompactionTrigger?: string;
  lastCompactionSavedTokens?: number;
  lastCompactionSummaryLineCount?: number;
  lastCompactionSummarizedMessages?: number;
  lastCompactionPreservedRecentCount?: number;
  lastCompactionPreservedSystemCount?: number;
  startupErrors?: number;
  startupWarnings?: number;
}

export function buildRuntimeContextSnapshot(
  snapshot: RuntimeContextSnapshot,
): RuntimeContextSnapshot {
  return {
    ...snapshot,
    providerDefaults: snapshot.providerDefaults ? { ...snapshot.providerDefaults } : undefined,
    availableProviders: snapshot.availableProviders ? [...snapshot.availableProviders] : undefined,
    failover: snapshot.failover
      ? Object.fromEntries(
          Object.entries(snapshot.failover).map(([provider, chain]) => [provider, [...chain]]),
        )
      : undefined,
    providerHealth: snapshot.providerHealth
      ? Object.fromEntries(
          Object.entries(snapshot.providerHealth).map(([provider, health]) => [provider, { ...health }]),
        )
      : undefined,
    recentFailovers: snapshot.recentFailovers?.map((event) => ({ ...event })),
    recentToolActivity: snapshot.recentToolActivity?.map((event) => ({ ...event })),
    recentHookEvents: snapshot.recentHookEvents?.map((event) => ({ ...event })),
    activeToolIds: snapshot.activeToolIds ? [...snapshot.activeToolIds] : undefined,
    permittedToolIds: snapshot.permittedToolIds ? [...snapshot.permittedToolIds] : undefined,
    sessionRules: snapshot.sessionRules ? [...snapshot.sessionRules] : undefined,
    lastMemoryRecall: snapshot.lastMemoryRecall
      ? cloneRuntimeMemoryRecallSnapshot(snapshot.lastMemoryRecall)
      : snapshot.lastMemoryRecall === null
        ? null
        : undefined,
    workflowRuns: snapshot.workflowRuns?.map((run) => ({ ...run })),
  };
}

function cloneRuntimeMemoryRecallSnapshot(
  snapshot: RuntimeMemoryRecallSnapshot,
): RuntimeMemoryRecallSnapshot {
  return {
    ...snapshot,
    truthProvenance: [...snapshot.truthProvenance],
    sectionOrder: [...snapshot.sectionOrder],
    shownSections: [...snapshot.shownSections],
    emptySections: [...snapshot.emptySections],
    hiddenSections: [...snapshot.hiddenSections],
    sectionState: { ...snapshot.sectionState },
    exact: { ...snapshot.exact },
    compact: { ...snapshot.compact },
    structured: { ...snapshot.structured },
    palace: {
      ...snapshot.palace,
      direct: { ...snapshot.palace.direct },
      nearby: { ...snapshot.palace.nearby },
      broader: { ...snapshot.palace.broader },
      related: { ...snapshot.palace.related },
      total: { ...snapshot.palace.total },
      path: { ...snapshot.palace.path },
      traversal: { ...snapshot.palace.traversal },
    },
    sessionContribution: {
      total: { ...snapshot.sessionContribution.total },
      shown: { ...snapshot.sessionContribution.shown },
    },
  };
}
