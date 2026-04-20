/**
 * UI state store for the Ink application.
 *
 * Runtime objects stay out of this store. It only contains render-safe view
 * state: chat messages, status labels, budget counters, and session metadata.
 */

import { randomUUID } from "crypto";
import { create } from "zustand";

import { Caste } from "../caste/enums";
import type { ApprovalRequest } from "../runtime/approval";
import type {
  CompactionResult,
  CompactionStrategy,
  ContextWindowSnapshot,
} from "../runtime/compaction";
import type { PersistedSessionSummary } from "../runtime/session-recovery";
import type { StartupReport } from "../runtime/startup-diagnostics";
import type { WorkspaceInfo } from "../runtime/workspace";
import type { LogMessage } from "./components";

export type CircuitState = "closed" | "open" | "half_open";

export interface ProviderHealthSummary {
  state?: string;
  failureCount?: number;
}

export interface RecentFailoverSummary {
  fromProvider: string;
  fromModel: string;
  toProvider: string;
  toModel: string;
  errorType: string;
  errorMessage: string;
  timestamp: number;
}

export interface RecentHookEventSummary {
  kind: string;
  detail?: string;
  timestamp: number;
  durationMs?: number;
}

export interface RecentCompactionSummary {
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

export interface LatestCompactionHandoffSummary {
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

export interface ColonyViewState {
  messages: LogMessage[];
  query: string;
  caste: Caste | string;
  model: string;
  provider: string;
  selectedModel: string;
  selectedProvider: string;
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
  persistedSessions: PersistedSessionSummary[];
  logScrollOffset: number;
}

export interface ColonyActions {
  setQuery: (query: string) => void;
  setSessionInfo: (info: Partial<Pick<ColonyViewState, "sessionId" | "agentId" | "caste" | "toolCount">>) => void;
  setRuntimeStatus: (status: Partial<Pick<ColonyViewState, "provider" | "model" | "selectedProvider" | "selectedModel" | "circuitState">>) => void;
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
  setPersistedSessions: (sessions: PersistedSessionSummary[]) => void;
  scrollLog: (delta: number, maxVisible?: number) => void;
  resetLogScroll: () => void;
  incrementDeniedCount: () => void;
  startRun: (thinkingPhase?: string) => string;
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

export const useColonyStore = create<ColonyStore>((set, get) => ({
  ...createInitialViewState(),

  setQuery: (query) => set({ query }),

  setSessionInfo: (info) => set(info),

  setRuntimeStatus: (status) => set(status),

  setUsage: (usage) => set(usage),

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

  setSessionAllowRules: (rules) => set({ sessionAllowRules: [...rules].sort() }),

  setContextUsage: (snapshot) => set({
    contextUsage: snapshot,
    tokensUsed: snapshot?.usedTokens ?? get().tokensUsed,
    maxTokens: snapshot?.maxTokens ?? get().maxTokens,
  }),

  setLastCompaction: (result) => set({ lastCompaction: result }),

  setLastCompactionFailure: (failure) => set({ lastCompactionFailure: failure }),

  setWorkspaceInfo: (info) => set({ workspaceInfo: info }),

  setStartupReport: (report) => set({ startupReport: report }),

  setProviderDiagnostics: (providerHealth, recentFailovers) => set({
    providerHealth: Object.fromEntries(
      Object.entries(providerHealth).map(([provider, health]) => [provider, { ...health }]),
    ),
    recentFailovers: recentFailovers.map((event) => ({ ...event })).slice(-5),
  }),

  recordHookEvent: (event) => set((state) => ({
    recentHookEvents: [...state.recentHookEvents, { ...event }].slice(-8),
  })),

  recordCompactionEvent: (event) => set((state) => ({
    recentCompactions: [...state.recentCompactions, { ...event }].slice(-8),
  })),

  setLatestCompactionHandoff: (handoff) => set({
    latestCompactionHandoff: handoff ? { ...handoff } : null,
  }),

  setPersistedSessions: (sessions) => set({
    persistedSessions: sessions.map((session) => ({ ...session })),
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
      isThinking: true,
      thinkingPhase,
      lastError: null,
    });
    return runId;
  },

  finishRun: (runId) => {
    const activeRunId = get().activeRunId;
    if (runId && activeRunId && runId !== activeRunId) return;
    set({
      activeRunId: null,
      isThinking: false,
      thinkingPhase: "",
    });
  },

  setError: (error) => set({ lastError: error }),

  reset: () => set((state) => ({
    ...createInitialViewState(),
    persistedSessions: state.persistedSessions.map((session) => ({ ...session })),
  })),
}));
