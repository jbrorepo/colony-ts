/**
 * UI state store for the Ink application.
 *
 * Runtime objects stay out of this store. It only contains render-safe view
 * state: chat messages, status labels, budget counters, and session metadata.
 */

import { randomUUID } from "crypto";
import { create } from "zustand";

import { Caste } from "../caste/enums";
import type { MemoryTruthMode } from "../memory/hybrid-memory";
import type { ApprovalRequest } from "../runtime/approval";
import type {
  CompactionResult,
  CompactionStrategy,
  ContextWindowSnapshot,
} from "../runtime/compaction";
import type {
  RuntimeCompactionEventSnapshot,
  RuntimeCompactionHandoffSnapshot,
  RuntimeContextSnapshot,
  RuntimeFailoverSnapshot,
  RuntimeHookEventSnapshot,
  RuntimeMemoryRecallSnapshot,
  RuntimeProviderHealthSnapshot,
} from "../runtime/runtime-snapshot";
import type { PersistedSessionSummary } from "../runtime/session-recovery";
import type { StartupReport } from "../runtime/startup-diagnostics";
import type { WorkspaceInfo } from "../runtime/workspace";
import type { LogMessage } from "./components";

export type CircuitState = "closed" | "open" | "half_open";

export type ProviderHealthSummary = RuntimeProviderHealthSnapshot;
export type RecentFailoverSummary = RuntimeFailoverSnapshot;
export type RecentHookEventSummary = RuntimeHookEventSnapshot;
export type RecentCompactionSummary = RuntimeCompactionEventSnapshot;
export type LatestCompactionHandoffSummary = RuntimeCompactionHandoffSnapshot;
export type LastMemoryRecallSummary = RuntimeMemoryRecallSnapshot;
export type RuntimeStatusSummary =
  Omit<
    Pick<
      RuntimeContextSnapshot,
      "provider" | "model" | "selectedProvider" | "selectedModel" | "circuitState" | "memoryTruthModeOverride"
    >,
    "circuitState"
  > & {
    circuitState?: CircuitState;
  };

export interface ColonyViewState {
  messages: LogMessage[];
  query: string;
  caste: Caste | string;
  model: string;
  provider: string;
  selectedModel: string;
  selectedProvider: string;
  memoryTruthModeOverride: MemoryTruthMode | null;
  isThinking: boolean;
  thinkingPhase: string;
  tokensUsed: number;
  maxTokens: number;
  costUsd: number;
  maxUsd: number;
  callCount: number;
  deniedCount: number;
  loopDetected: boolean;
  loopTool: string;
  circuitState: CircuitState;
  toolCount: number;
  sessionId: string;
  agentId: string;
  showBudget: boolean;
  activeRunId: string | null;
  interruptRequested: boolean;
  queuedPromptCount: number;
  queuedPromptPreview: string | null;
  lastError: string | null;
  pendingApproval: ApprovalRequest | null;
  pendingCompactionStrategy: CompactionStrategy | null;
  sessionAllowRules: string[];
  contextUsage: ContextWindowSnapshot | null;
  lastCompaction: CompactionResult | null;
  lastCompactionFailure: { strategy: CompactionStrategy; message: string } | null;
  workspaceInfo: WorkspaceInfo | null;
  startupReport: StartupReport | null;
  providerHealth: Record<string, ProviderHealthSummary>;
  recentFailovers: RecentFailoverSummary[];
  recentHookEvents: RecentHookEventSummary[];
  recentCompactions: RecentCompactionSummary[];
  latestCompactionHandoff: LatestCompactionHandoffSummary | null;
  lastMemoryRecall: LastMemoryRecallSummary | null;
  persistedSessions: PersistedSessionSummary[];
  logScrollOffset: number;
}

export interface ColonyActions {
  setQuery: (query: string) => void;
  setSessionInfo: (info: Partial<Pick<ColonyViewState, "sessionId" | "agentId" | "caste" | "toolCount">>) => void;
  setThinkingState: (isThinking: boolean, thinkingPhase?: string) => void;
  setRuntimeStatus: (status: Partial<RuntimeStatusSummary>) => void;
  setMemoryTruthModeOverride: (mode: MemoryTruthMode | null) => void;
  setUsage: (usage: Partial<Pick<ColonyViewState, "tokensUsed" | "costUsd" | "callCount" | "deniedCount">>) => void;
  setBudgetCap: (maxUsd: number) => void;
  toggleBudget: () => void;
  setBudgetVisible: (visible: boolean) => void;
  addMessage: (role: LogMessage["role"], content: string, extra?: Partial<LogMessage>) => string;
  appendToMessage: (messageId: string, delta: string) => void;
  updateMessage: (messageId: string, patch: Partial<LogMessage>) => void;
  clearMessages: () => void;
  setPendingApproval: (request: ApprovalRequest | null) => void;
  setPendingCompactionStrategy: (strategy: CompactionStrategy | null) => void;
  setSessionAllowRules: (rules: string[]) => void;
  setContextUsage: (snapshot: ContextWindowSnapshot | null) => void;
  setLastCompaction: (result: CompactionResult | null) => void;
  setLastCompactionFailure: (failure: { strategy: CompactionStrategy; message: string } | null) => void;
  setWorkspaceInfo: (info: WorkspaceInfo | null) => void;
  setStartupReport: (report: StartupReport | null) => void;
  setProviderDiagnostics: (
    providerHealth: Record<string, ProviderHealthSummary>,
    recentFailovers: RecentFailoverSummary[],
  ) => void;
  recordHookEvent: (event: RecentHookEventSummary) => void;
  recordCompactionEvent: (event: RecentCompactionSummary) => void;
  setLatestCompactionHandoff: (handoff: LatestCompactionHandoffSummary | null) => void;
  setLastMemoryRecall: (snapshot: LastMemoryRecallSummary | null) => void;
  setPersistedSessions: (sessions: PersistedSessionSummary[]) => void;
  scrollLog: (delta: number, maxVisible?: number) => void;
  resetLogScroll: () => void;
  incrementDeniedCount: () => void;
  startRun: (thinkingPhase?: string) => string;
  requestInterrupt: (thinkingPhase?: string) => void;
  setQueuedPrompt: (count: number, preview?: string | null) => void;
  finishRun: (runId?: string) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export type ColonyStore = ColonyViewState & ColonyActions;

const DEFAULT_MAX_TOKENS = 128_000;
const DEFAULT_MAX_USD = 10.0;

function shortId(prefix: string): string {
  return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function createInitialViewState(): ColonyViewState {
  return {
    messages: [],
    query: "",
    caste: Caste.ASSIST_ANT,
    model: "llama3.2",
    provider: "local",
    selectedModel: "llama3.2",
    selectedProvider: "local",
    memoryTruthModeOverride: null,
    isThinking: false,
    thinkingPhase: "",
    tokensUsed: 0,
    maxTokens: DEFAULT_MAX_TOKENS,
    costUsd: 0,
    maxUsd: DEFAULT_MAX_USD,
    callCount: 0,
    deniedCount: 0,
    loopDetected: false,
    loopTool: "",
    circuitState: "closed",
    toolCount: 0,
    sessionId: shortId("ses"),
    agentId: "assist-ant",
    showBudget: false,
    activeRunId: null,
    interruptRequested: false,
    queuedPromptCount: 0,
    queuedPromptPreview: null,
    lastError: null,
    pendingApproval: null,
    pendingCompactionStrategy: null,
    sessionAllowRules: [],
    contextUsage: null,
    lastCompaction: null,
    lastCompactionFailure: null,
    workspaceInfo: null,
    startupReport: null,
    providerHealth: {},
    recentFailovers: [],
    recentHookEvents: [],
    recentCompactions: [],
    latestCompactionHandoff: null,
    lastMemoryRecall: null,
    persistedSessions: [],
    logScrollOffset: 0,
  };
}

export function createLogMessage(
  role: LogMessage["role"],
  content: string,
  extra: Partial<LogMessage> = {},
): LogMessage {
  return {
    id: shortId("msg"),
    role,
    content,
    timestamp: Date.now(),
    ...extra,
  };
}

export function appendMessageDelta(
  messages: LogMessage[],
  messageId: string,
  delta: string,
): LogMessage[] {
  if (!delta) return messages;
  return messages.map((message) =>
    message.id === messageId
      ? { ...message, content: `${message.content}${delta}` }
      : message,
  );
}

function clonePersistedSession(session: PersistedSessionSummary): PersistedSessionSummary {
  return { ...session };
}

function sameStringArray(left: string[], right: string[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function samePersistedSessionSummaries(
  left: PersistedSessionSummary[],
  right: PersistedSessionSummary[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const leftSession = left[index];
    const rightSession = right[index];
    if (
      leftSession.sessionId !== rightSession.sessionId
      || leftSession.agentId !== rightSession.agentId
      || leftSession.caste !== rightSession.caste
      || leftSession.provider !== rightSession.provider
      || leftSession.model !== rightSession.model
      || leftSession.savedAt !== rightSession.savedAt
      || leftSession.lastMessageAt !== rightSession.lastMessageAt
      || leftSession.messageCount !== rightSession.messageCount
      || leftSession.tokensUsed !== rightSession.tokensUsed
      || leftSession.costUsd !== rightSession.costUsd
      || leftSession.interruption !== rightSession.interruption
      || leftSession.hasCheckpoint !== rightSession.hasCheckpoint
      || leftSession.previewText !== rightSession.previewText
      || leftSession.previewRole !== rightSession.previewRole
    ) {
      return false;
    }
  }
  return true;
}

function cloneProviderHealthSummary(health: ProviderHealthSummary): ProviderHealthSummary {
  return { ...health };
}

function cloneRecentFailoverSummary(event: RecentFailoverSummary): RecentFailoverSummary {
  return { ...event };
}

export function sameProviderDiagnostics(
  leftHealth: Record<string, ProviderHealthSummary>,
  rightHealth: Record<string, ProviderHealthSummary>,
  leftFailovers: RecentFailoverSummary[],
  rightFailovers: RecentFailoverSummary[],
): boolean {
  if (leftHealth === rightHealth && leftFailovers === rightFailovers) return true;

  const leftProviders = Object.keys(leftHealth);
  const rightProviders = Object.keys(rightHealth);
  if (leftProviders.length !== rightProviders.length) return false;
  for (const provider of leftProviders) {
    const leftSnapshot = leftHealth[provider];
    const rightSnapshot = rightHealth[provider];
    if (
      !rightSnapshot
      || leftSnapshot.state !== rightSnapshot.state
      || leftSnapshot.failureCount !== rightSnapshot.failureCount
    ) {
      return false;
    }
  }

  if (leftFailovers.length !== rightFailovers.length) return false;
  for (let index = 0; index < leftFailovers.length; index += 1) {
    const leftEvent = leftFailovers[index];
    const rightEvent = rightFailovers[index];
    if (
      leftEvent.fromProvider !== rightEvent.fromProvider
      || leftEvent.fromModel !== rightEvent.fromModel
      || leftEvent.toProvider !== rightEvent.toProvider
      || leftEvent.toModel !== rightEvent.toModel
      || leftEvent.errorType !== rightEvent.errorType
      || leftEvent.errorMessage !== rightEvent.errorMessage
      || leftEvent.timestamp !== rightEvent.timestamp
    ) {
      return false;
    }
  }

  return true;
}

export function sameContextWindowSnapshot(
  left: ContextWindowSnapshot | null,
  right: ContextWindowSnapshot | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;
  return (
    left.usedTokens === right.usedTokens
    && left.maxTokens === right.maxTokens
    && left.remainingTokens === right.remainingTokens
    && left.percentUsed === right.percentUsed
    && left.messageCount === right.messageCount
    && left.isAboveWarningThreshold === right.isAboveWarningThreshold
    && left.isAboveAutoCompactThreshold === right.isAboveAutoCompactThreshold
    && left.isAtBlockingLimit === right.isAtBlockingLimit
    && left.compactionFailureCount === right.compactionFailureCount
  );
}

export function sameStartupReport(
  left: StartupReport | null,
  right: StartupReport | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;
  if (
    left.passed !== right.passed
    || left.errorCount !== right.errorCount
    || left.warningCount !== right.warningCount
    || left.checks.length !== right.checks.length
  ) {
    return false;
  }
  for (let index = 0; index < left.checks.length; index += 1) {
    const leftCheck = left.checks[index];
    const rightCheck = right.checks[index];
    if (
      leftCheck.name !== rightCheck.name
      || leftCheck.passed !== rightCheck.passed
      || leftCheck.severity !== rightCheck.severity
      || leftCheck.message !== rightCheck.message
      || leftCheck.fix !== rightCheck.fix
    ) {
      return false;
    }
  }
  return true;
}

export function sameWorkspaceInfo(
  left: WorkspaceInfo | null,
  right: WorkspaceInfo | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;
  return (
    left.root === right.root
    && left.startDir === right.startDir
    && left.detected === right.detected
    && left.reason === right.reason
    && sameStringArray(left.markers, right.markers)
    && left.projectType === right.projectType
    && left.packageManager === right.packageManager
    && left.name === right.name
    && left.workspaceMode === right.workspaceMode
    && sameStringArray(left.workspaceGlobs, right.workspaceGlobs)
    && left.workspacePackageCount === right.workspacePackageCount
    && left.workspaceAppCount === right.workspaceAppCount
    && left.workspaceLibraryCount === right.workspaceLibraryCount
    && left.workspaceOtherCount === right.workspaceOtherCount
    && sameStringArray(left.workspaceAppPackages, right.workspaceAppPackages)
    && sameStringArray(left.workspaceLibraryPackages, right.workspaceLibraryPackages)
    && sameStringArray(left.workspaceOtherPackages, right.workspaceOtherPackages)
    && sameStringArray(left.workspaceDevCandidates, right.workspaceDevCandidates)
    && sameStringArray(left.workspaceVerifyCandidates, right.workspaceVerifyCandidates)
    && left.workspaceIntent === right.workspaceIntent
    && sameStringArray(left.workspacePrimaryTargets, right.workspacePrimaryTargets)
    && sameStringArray(left.scriptNames, right.scriptNames)
    && left.devCommand === right.devCommand
    && left.verifyCommand === right.verifyCommand
    && sameStringArray(left.stackHints, right.stackHints)
  );
}

export function sameCompactionResult(
  left: CompactionResult | null,
  right: CompactionResult | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;
  return (
    left.compacted === right.compacted
    && left.originalCount === right.originalCount
    && left.finalCount === right.finalCount
    && left.summary === right.summary
    && left.tokensSavedEstimate === right.tokensSavedEstimate
    && left.messages === right.messages
    && left.strategyUsed === right.strategyUsed
    && left.triggerSource === right.triggerSource
    && left.usageBeforeFraction === right.usageBeforeFraction
    && left.preservedSystemCount === right.preservedSystemCount
    && left.preservedRecentCount === right.preservedRecentCount
    && left.summarizedMessageCount === right.summarizedMessageCount
    && left.summaryLineCount === right.summaryLineCount
  );
}

export function sameCompactionFailure(
  left: { strategy: CompactionStrategy; message: string } | null,
  right: { strategy: CompactionStrategy; message: string } | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;
  return left.strategy === right.strategy && left.message === right.message;
}

export function sameCompactionHandoff(
  left: LatestCompactionHandoffSummary | null,
  right: LatestCompactionHandoffSummary | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;
  return (
    left.status === right.status
    && left.strategy === right.strategy
    && left.trigger === right.trigger
    && left.timestamp === right.timestamp
    && left.loggedCount === right.loggedCount
    && left.structuredCount === right.structuredCount
    && left.artifactId === right.artifactId
    && left.artifactChars === right.artifactChars
    && left.errorMessage === right.errorMessage
  );
}

export function sameLastMemoryRecallSummary(
  left: LastMemoryRecallSummary | null,
  right: LastMemoryRecallSummary | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;
  return JSON.stringify(left) === JSON.stringify(right);
}

export const useColonyStore = create<ColonyStore>((set, get) => ({
  ...createInitialViewState(),

  setQuery: (query) => set({ query }),

  setSessionInfo: (info) => set((state) => {
    const changed: Partial<Pick<ColonyViewState, "sessionId" | "agentId" | "caste" | "toolCount">> = {};
    for (const [key, value] of Object.entries(info) as Array<
      [keyof Pick<ColonyViewState, "sessionId" | "agentId" | "caste" | "toolCount">, string | number]
    >) {
      if (state[key] !== value) {
        changed[key] = value as never;
      }
    }
    return Object.keys(changed).length > 0 ? changed : {};
  }),

  setThinkingState: (isThinking, thinkingPhase = "") => set((state) => {
    if (state.isThinking === isThinking && state.thinkingPhase === thinkingPhase) {
      return {};
    }
    return { isThinking, thinkingPhase };
  }),

  setRuntimeStatus: (status) => set((state) => {
    const changed: Partial<RuntimeStatusSummary> = {};
    for (const [key, value] of Object.entries(status) as Array<
      [keyof RuntimeStatusSummary, RuntimeStatusSummary[keyof RuntimeStatusSummary]]
    >) {
      if (state[key as keyof ColonyViewState] !== value) {
        changed[key] = value as never;
      }
    }
    return Object.keys(changed).length > 0 ? changed : {};
  }),

  setMemoryTruthModeOverride: (mode) => set((state) =>
    state.memoryTruthModeOverride === mode ? {} : { memoryTruthModeOverride: mode }),

  setUsage: (usage) => set((state) => {
    const changed: Partial<Pick<ColonyViewState, "tokensUsed" | "costUsd" | "callCount" | "deniedCount">> = {};
    for (const [key, value] of Object.entries(usage) as Array<
      [
        keyof Pick<ColonyViewState, "tokensUsed" | "costUsd" | "callCount" | "deniedCount">,
        number,
      ]
    >) {
      if (state[key] !== value) {
        changed[key] = value;
      }
    }
    return Object.keys(changed).length > 0 ? changed : {};
  }),

  setBudgetCap: (maxUsd) => set({ maxUsd }),

  toggleBudget: () => set((state) => ({ showBudget: !state.showBudget })),

  setBudgetVisible: (visible) => set({ showBudget: visible }),

  addMessage: (role, content, extra = {}) => {
    const message = createLogMessage(role, content, extra);
    set((state) => ({
      messages: [...state.messages, message],
      logScrollOffset: state.logScrollOffset > 0 ? state.logScrollOffset + 1 : 0,
    }));
    return message.id;
  },

  appendToMessage: (messageId, delta) =>
    set((state) => ({
      messages: appendMessageDelta(state.messages, messageId, delta),
    })),

  updateMessage: (messageId, patch) =>
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === messageId ? { ...message, ...patch } : message,
      ),
    })),

  clearMessages: () => set({ messages: [], logScrollOffset: 0 }),

  setPendingApproval: (request) => set({ pendingApproval: request }),

  setPendingCompactionStrategy: (strategy) => set({ pendingCompactionStrategy: strategy }),

  setSessionAllowRules: (rules) => set((state) => {
    const normalized = [...rules].sort();
    if (sameStringArray(state.sessionAllowRules, normalized)) {
      return {};
    }
    return { sessionAllowRules: normalized };
  }),

  setContextUsage: (snapshot) => set((state) => {
    const nextTokensUsed = snapshot?.usedTokens ?? get().tokensUsed;
    const nextMaxTokens = snapshot?.maxTokens ?? get().maxTokens;
    if (
      sameContextWindowSnapshot(state.contextUsage, snapshot)
      && state.tokensUsed === nextTokensUsed
      && state.maxTokens === nextMaxTokens
    ) {
      return {};
    }
    return {
      contextUsage: snapshot,
      tokensUsed: nextTokensUsed,
      maxTokens: nextMaxTokens,
    };
  }),

  setLastCompaction: (result) => set((state) =>
    sameCompactionResult(state.lastCompaction, result) ? {} : { lastCompaction: result }),

  setLastCompactionFailure: (failure) => set((state) =>
    sameCompactionFailure(state.lastCompactionFailure, failure) ? {} : { lastCompactionFailure: failure }),

  setWorkspaceInfo: (info) => set((state) =>
    sameWorkspaceInfo(state.workspaceInfo, info) ? {} : { workspaceInfo: info }),

  setStartupReport: (report) => set((state) =>
    sameStartupReport(state.startupReport, report) ? {} : { startupReport: report }),

  setProviderDiagnostics: (providerHealth, recentFailovers) => set((state) => {
    if (
      sameProviderDiagnostics(
        state.providerHealth,
        providerHealth,
        state.recentFailovers,
        recentFailovers,
      )
    ) {
      return {};
    }
    return {
      providerHealth: Object.fromEntries(
        Object.entries(providerHealth).map(([provider, health]) => [provider, cloneProviderHealthSummary(health)]),
      ),
      recentFailovers: recentFailovers.map(cloneRecentFailoverSummary).slice(-5),
    };
  }),

  recordHookEvent: (event) => set((state) => ({
    recentHookEvents: [...state.recentHookEvents, { ...event }].slice(-8),
  })),

  recordCompactionEvent: (event) => set((state) => ({
    recentCompactions: [...state.recentCompactions, { ...event }].slice(-8),
  })),

  setLatestCompactionHandoff: (handoff) => set((state) => {
    if (sameCompactionHandoff(state.latestCompactionHandoff, handoff)) {
      return {};
    }
    return {
      latestCompactionHandoff: handoff ? { ...handoff } : null,
    };
  }),

  setLastMemoryRecall: (snapshot) => set((state) => {
    if (sameLastMemoryRecallSummary(state.lastMemoryRecall, snapshot)) {
      return {};
    }
    return {
      lastMemoryRecall: snapshot ? JSON.parse(JSON.stringify(snapshot)) as LastMemoryRecallSummary : null,
    };
  }),

  setPersistedSessions: (sessions) => set((state) => {
    if (samePersistedSessionSummaries(state.persistedSessions, sessions)) {
      return {};
    }
    return {
      persistedSessions: sessions.map(clonePersistedSession),
    };
  }),

  scrollLog: (delta, maxVisible = 20) => set((state) => {
    const maxOffset = Math.max(state.messages.length - maxVisible, 0);
    const nextOffset = Math.min(Math.max(state.logScrollOffset + delta, 0), maxOffset);
    return { logScrollOffset: nextOffset };
  }),

  resetLogScroll: () => set({ logScrollOffset: 0 }),

  incrementDeniedCount: () => set((state) => ({ deniedCount: state.deniedCount + 1 })),

  startRun: (thinkingPhase = "The Colony is thinking...") => {
    const runId = shortId("run");
    set({
      activeRunId: runId,
      interruptRequested: false,
      isThinking: true,
      thinkingPhase,
      lastError: null,
    });
    return runId;
  },

  requestInterrupt: (thinkingPhase = "Stopping current operation...") => set((state) => {
    if (!state.activeRunId || state.interruptRequested) return {};
    return {
      interruptRequested: true,
      isThinking: false,
      thinkingPhase,
    };
  }),

  setQueuedPrompt: (count, preview = null) => set((state) => {
    const normalizedCount = Math.max(0, Math.trunc(count));
    const normalizedPreview = normalizedCount > 0 ? (preview ?? null) : null;
    if (
      state.queuedPromptCount === normalizedCount
      && state.queuedPromptPreview === normalizedPreview
    ) {
      return {};
    }
    return {
      queuedPromptCount: normalizedCount,
      queuedPromptPreview: normalizedPreview,
    };
  }),

  finishRun: (runId) => {
    const activeRunId = get().activeRunId;
    if (runId && activeRunId && runId !== activeRunId) return;
    set({
      activeRunId: null,
      interruptRequested: false,
      isThinking: false,
      thinkingPhase: "",
    });
  },

  setError: (error) => set((state) => (state.lastError === error ? {} : { lastError: error })),

  reset: () => set((state) => ({
    ...createInitialViewState(),
    persistedSessions: state.persistedSessions.map(clonePersistedSession),
  })),
}));
