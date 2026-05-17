import type { SerializedMessage } from "./runtime/message";
import {
  buildSessionHistoryExcerpt,
  detectSessionInterruption,
  type SessionHistoryExcerpt,
} from "./runtime/session-recovery";
import {
  buildLiveCurrentHistoryHint,
  buildLiveSessionShortcutSnapshot,
} from "./runtime/session-shortcuts";
import {
  historyTimestampBoundary,
  readString,
} from "./gateway-shared";

export type SessionShortcutAlias = "pending" | "latest";
export type HistoryFilterMode = "user" | "assistant" | "system" | "tool" | "error";
export type SessionFilter = "pending" | "clean" | "checkpoint" | "transcript" | "current";

export interface GatewaySessionRecord {
  sessionId?: string;
  agentId?: string;
  caste?: string;
  savedAt?: string;
  lastMessageAt?: string;
  messageCount?: number;
  tokensUsed?: number;
  costUsd?: number;
  provider?: string;
  model?: string;
  previewRole?: string;
  previewText?: string;
  interruption?: string;
  hasCheckpoint?: boolean;
}

export interface SessionQuerySpec {
  filters: SessionFilter[];
  search: string;
  limit: number | null;
}

export interface GatewaySessionCommandPayload {
  output: string;
  data?: Record<string, unknown>;
  isError?: boolean;
  action?: Record<string, unknown>;
}

function buildCurrentHistoryPayload(opts: {
  excerpt: SessionHistoryExcerpt;
  count: number;
  filter: HistoryFilterMode | null;
  search: string | null;
  historyAliases: SessionShortcutAlias[];
  reference?: string;
}): GatewaySessionCommandPayload {
  return {
    output: formatSessionHistoryExcerpt(filterHistoryExcerpt(opts.excerpt, opts.filter, opts.search).excerpt, "current session", {
      historyAliases: opts.historyAliases,
      historyFilter: opts.filter,
      historySearch: opts.search,
      originalVisibleCount: opts.excerpt.entries.length,
    }),
    data: {
      sessionId: opts.excerpt.sessionId,
      count: opts.count,
      current: true,
      reference: opts.reference,
      filter: opts.filter,
      search: opts.search,
    },
  };
}

const SESSION_FILTER_ALIASES: Record<string, SessionFilter> = {
  awaiting: "pending",
  checkpoint: "checkpoint",
  checkpointed: "checkpoint",
  clean: "clean",
  current: "current",
  interrupted: "pending",
  pending: "pending",
  transcript: "transcript",
  "transcript-only": "transcript",
  transcript_only: "transcript",
};

function parsePositiveInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function interruptionLabel(state?: string): string {
  if (state === "interrupted_prompt") return "awaiting reply";
  if (state === "interrupted_turn") return "tool turn interrupted";
  return "clean";
}

export function previewRoleLabel(role?: string): string {
  if (role === "assistant") return "last assistant";
  if (role === "user") return "last user";
  if (role === "tool") return "last tool";
  return "last message";
}

export function stableSessionIndex(
  sessions: GatewaySessionRecord[],
  sessionId: string,
): number {
  const index = sessions.findIndex((session) => String(session.sessionId ?? "") === sessionId);
  return index >= 0 ? index + 1 : 0;
}

export function sessionFilterLabel(filter: SessionFilter): string {
  if (filter === "pending") return "pending";
  if (filter === "clean") return "clean";
  if (filter === "checkpoint") return "checkpoint";
  if (filter === "transcript") return "transcript-only";
  return "current";
}

export function parseSessionQuery(args: string[]): SessionQuerySpec {
  const maybeLimit = parsePositiveInteger(args.at(-1) ?? "");
  const tokens = maybeLimit !== null ? args.slice(0, -1) : args;
  const filters = new Set<SessionFilter>();
  const searchTerms: string[] = [];

  for (const token of tokens) {
    const normalized = token.trim().toLowerCase();
    const filter = SESSION_FILTER_ALIASES[normalized];
    if (filter) {
      filters.add(filter);
    } else if (normalized.length > 0) {
      searchTerms.push(normalized);
    }
  }

  return {
    filters: [...filters],
    search: searchTerms.join(" ").trim(),
    limit: maybeLimit,
  };
}

export function normalizeHistoryCount(
  args: string[],
): { reference: string | null; count: number; filter: HistoryFilterMode | null; search: string | null } {
  if (args.length === 0) return { reference: null, count: 8, filter: null, search: null };

  const tokens = args.map((arg) => arg.trim()).filter(Boolean);
  const maybeCount = parsePositiveInteger(tokens.at(-1) ?? "");
  const count = maybeCount ?? 8;
  const referenceTokens = maybeCount !== null ? tokens.slice(0, -1) : [...tokens];
  const filterIndex = referenceTokens.findIndex((token) =>
    ["user", "assistant", "system", "tool", "error"].includes(token.toLowerCase()),
  );
  const filter = filterIndex >= 0
    ? referenceTokens.splice(filterIndex, 1)[0].toLowerCase() as HistoryFilterMode
    : null;
  const searchIndex = referenceTokens.findIndex((token) => {
    const normalized = token.toLowerCase();
    return normalized === "search" || normalized === "query";
  });
  const search = searchIndex >= 0
    ? referenceTokens.splice(searchIndex + 1).join(" ").trim() || null
    : null;
  if (searchIndex >= 0) {
    referenceTokens.splice(searchIndex, 1);
  }

  return {
    reference: referenceTokens.join(" ").trim() || null,
    count,
    filter,
    search,
  };
}

export function matchSessionFilters(
  session: GatewaySessionRecord,
  filters: SessionFilter[],
  currentSessionId: string,
): boolean {
  if (filters.length === 0) return true;

  return filters.every((filter) => {
    if (filter === "pending") return String(session.interruption ?? "none") !== "none";
    if (filter === "clean") return String(session.interruption ?? "none") === "none";
    if (filter === "checkpoint") return Boolean(session.hasCheckpoint);
    if (filter === "transcript") return !session.hasCheckpoint;
    return currentSessionId.length > 0 && String(session.sessionId ?? "") === currentSessionId;
  });
}

export function matchSessionQuery(
  session: GatewaySessionRecord,
  query: string,
): boolean {
  const haystack = [
    session.sessionId,
    session.agentId,
    session.caste,
    session.provider,
    session.model,
    session.previewRole,
    session.previewText,
    session.interruption,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export function currentSessionHistoryExcerpt(
  session: unknown,
  count: number,
): SessionHistoryExcerpt | null {
  if (!session || typeof session !== "object") return null;
  const record = session as Record<string, unknown>;
  const history = Array.isArray(record.history)
    ? record.history.filter((message): message is SerializedMessage =>
        typeof message === "object" && message !== null && typeof (message as Record<string, unknown>).type === "string",
      )
    : [];
  if (history.length === 0) return null;
  const savedAt =
    readString(record, ["createdAt", "created_at"]) ||
    historyTimestampBoundary(history, "first", "unknown");
  const lastMessageAt =
    readString(record, ["lastActive", "last_active"]) ||
    historyTimestampBoundary(history, "latest", savedAt);

  return buildSessionHistoryExcerpt(
    {
      sessionId: readString(record, ["sessionId", "session_id"], "unknown"),
      agentId: readString(record, ["agentId", "agent_id"], "unknown"),
      caste: readString(record, ["caste"], "unknown"),
      history,
    },
    {
      limit: count,
      savedAt,
      lastMessageAt,
      hasCheckpoint: true,
      interruption: detectSessionInterruption(history),
    },
  );
}

function buildGatewayLiveSessionShortcutSnapshot(
  excerpt: SessionHistoryExcerpt,
  sessions: GatewaySessionRecord[],
) {
  return buildLiveSessionShortcutSnapshot({
    currentSessionId: excerpt.sessionId,
    currentMessageCount: excerpt.totalMessages,
    currentLatestMessageTimestamp: Number.isFinite(Date.parse(String(excerpt.lastMessageAt ?? "")))
      ? Date.parse(String(excerpt.lastMessageAt ?? ""))
      : null,
    currentAwaitingReply: excerpt.entries.at(-1)?.role === "user",
    persistedSessions: sessions.map((session) => ({
      sessionId: String(session.sessionId ?? ""),
      agentId: String(session.agentId ?? "unknown"),
      caste: String(session.caste ?? "unknown"),
      provider: session.provider,
      model: session.model,
      savedAt: String(session.savedAt ?? session.lastMessageAt ?? "unknown"),
      lastMessageAt: String(session.lastMessageAt ?? session.savedAt ?? "unknown"),
      messageCount: Number(session.messageCount ?? 0),
      tokensUsed: Number(session.tokensUsed ?? 0),
      costUsd: Number(session.costUsd ?? 0),
      interruption:
        session.interruption === "interrupted_prompt" || session.interruption === "interrupted_turn"
          ? session.interruption
          : "none",
      hasCheckpoint: Boolean(session.hasCheckpoint),
      previewText: String(session.previewText ?? ""),
      previewRole: String(session.previewRole ?? ""),
    })),
  });
}

export function latestCurrentSessionExcerpt(
  session: unknown,
  sessions: GatewaySessionRecord[],
  count: number,
): SessionHistoryExcerpt | null {
  const excerpt = currentSessionHistoryExcerpt(session, count);
  if (!excerpt) return null;
  return buildGatewayLiveSessionShortcutSnapshot(excerpt, sessions).currentOwnsLatestHistoryAlias
    ? excerpt
    : null;
}

export function effectiveLatestPersistedAliasSessionId(
  session: unknown,
  sessions: GatewaySessionRecord[],
): string | null {
  const excerpt = currentSessionHistoryExcerpt(session, 1);
  if (!excerpt) {
    return sessions[0]?.sessionId != null ? String(sessions[0].sessionId) : null;
  }
  const shortcutSnapshot = buildGatewayLiveSessionShortcutSnapshot(excerpt, sessions);
  return shortcutSnapshot.currentOwnsLatestHistoryAlias
    && shortcutSnapshot.latestPersistedSessionId !== excerpt.sessionId
    ? null
    : shortcutSnapshot.latestPersistedSessionId;
}

export function currentSessionShortcutAliases(
  session: unknown,
  sessions: GatewaySessionRecord[],
): SessionShortcutAlias[] {
  const excerpt = currentSessionHistoryExcerpt(session, 1);
  if (!excerpt) return [];
  const aliases: SessionShortcutAlias[] = [];
  const shortcutSnapshot = buildGatewayLiveSessionShortcutSnapshot(excerpt, sessions);

  if (shortcutSnapshot.currentOwnsPendingHistoryAlias) {
    aliases.push("pending");
  }
  if (shortcutSnapshot.currentOwnsLatestHistoryAlias) {
    aliases.push("latest");
  }

  return aliases;
}

export function currentSessionHistoryCommands(
  session: unknown,
  sessions: GatewaySessionRecord[],
): string[] {
  const excerpt = currentSessionHistoryExcerpt(session, 1);
  if (!excerpt) {
    return [];
  }
  return buildLiveCurrentHistoryHint(
    buildGatewayLiveSessionShortcutSnapshot(excerpt, sessions),
    8,
  ).split(" | ");
}

export function resolveResumeTarget(
  reference: string,
  sessions: GatewaySessionRecord[],
): { sessionId: string; displayRef: string } | { error: string } {
  if (sessions.length === 0) {
    return { error: "No persisted sessions are loaded. Use /sessions after a run saves recovery state." };
  }

  const normalized = reference.trim().toLowerCase();
  if (!normalized) {
    return { error: "Usage: /resume <session_id|prefix|index|latest|pending>\n\nUse /sessions to list resumable sessions." };
  }

  if (normalized === "latest") {
    const latest = sessions[0];
    if (!latest?.sessionId) {
      return { error: "No persisted sessions are available to resume." };
    }
    return {
      sessionId: String(latest.sessionId),
      displayRef: "latest",
    };
  }

  if (normalized === "pending" || normalized === "interrupted" || normalized === "awaiting") {
    const pending = sessions.find((session) => String(session.interruption ?? "none") !== "none");
    if (!pending?.sessionId) {
      return { error: noPendingSessionHint(sessions) };
    }
    return {
      sessionId: String(pending.sessionId),
      displayRef: normalized,
    };
  }

  const numericIndex = parsePositiveInteger(normalized);
  if (numericIndex !== null) {
    const indexed = sessions[numericIndex - 1];
    if (!indexed?.sessionId) {
      return { error: `No persisted session exists at index ${numericIndex}. Use /sessions to inspect the catalog.` };
    }
    return {
      sessionId: String(indexed.sessionId),
      displayRef: String(numericIndex),
    };
  }

  const exact = sessions.find((session) => String(session.sessionId ?? "").toLowerCase() === normalized);
  if (exact?.sessionId) {
    return {
      sessionId: String(exact.sessionId),
      displayRef: String(exact.sessionId),
    };
  }

  const prefixMatches = sessions.filter((session) =>
    String(session.sessionId ?? "").toLowerCase().startsWith(normalized),
  );
  if (prefixMatches.length === 1 && prefixMatches[0]?.sessionId) {
    return {
      sessionId: String(prefixMatches[0].sessionId),
      displayRef: reference.trim(),
    };
  }
  if (prefixMatches.length > 1) {
    const matchList = prefixMatches
      .slice(0, 5)
      .map((session) => String(session.sessionId ?? "unknown"))
      .join(", ");
    return {
      error: `Session reference '${reference}' is ambiguous.\n\nMatches: ${matchList}\nUse /resume <full_id> or /resume <index>.`,
    };
  }

  return {
    error: `No persisted session matches '${reference}'.\n\nUse /sessions to inspect resumable sessions.`,
  };
}

export function sessionShortcutAliases(
  sessionId: string,
  newestInterruptedSessionId: string | null,
  latestSessionId: string | null,
): SessionShortcutAlias[] {
  const aliases: SessionShortcutAlias[] = [];
  if (newestInterruptedSessionId !== null && String(newestInterruptedSessionId) === sessionId) {
    aliases.push("pending");
  }
  if (latestSessionId !== null && String(latestSessionId) === sessionId) {
    aliases.push("latest");
  }
  return aliases;
}

export function joinCommandChoices(commands: string[]): string {
  const choices = [...new Set(commands.filter((command) => command.length > 0))];
  if (choices.length === 0) return "";
  if (choices.length === 1) return choices[0] ?? "";
  if (choices.length === 2) return `${choices[0]} or ${choices[1]}`;
  return `${choices.slice(0, -1).join(", ")}, or ${choices[choices.length - 1]}`;
}

export function historyCommand(reference: string, count: number): string {
  return count === 8 ? `/history ${reference}` : `/history ${reference} ${count}`;
}

export function noActiveSessionHistoryHint(
  sessions: GatewaySessionRecord[],
  count: number,
): string {
  if (sessions.length === 0) {
    return "No active session is loaded, and no persisted sessions are available.";
  }
  const latestSessionId = sessions[0]?.sessionId ? String(sessions[0].sessionId) : null;
  const pendingSessionId = sessions.find((session) => String(session.interruption ?? "none") !== "none")?.sessionId ?? null;
  const commands = [
    historyCommand("latest", count),
    pendingSessionId ? historyCommand("pending", count) : "",
    latestSessionId ? historyCommand(latestSessionId, count) : "",
    pendingSessionId && pendingSessionId !== latestSessionId ? historyCommand(String(pendingSessionId), count) : "",
  ];
  return `No active session is loaded.\n\nUse ${joinCommandChoices(commands)} to inspect saved recovery state.`;
}

export function noPendingSessionHint(
  sessions: GatewaySessionRecord[],
): string {
  const latestSessionId = sessions[0]?.sessionId ? String(sessions[0].sessionId) : null;
  const commands = [
    "/resume latest",
    "/history latest 8",
    latestSessionId ? `/resume ${latestSessionId}` : "",
    latestSessionId ? `/history ${latestSessionId} 8` : "",
    "/sessions",
  ];
  return `No interrupted persisted sessions are waiting.\n\nUse ${joinCommandChoices(commands)} to inspect saved recovery state.`;
}

export function noPendingSessionCatalogHint(
  sessions: GatewaySessionRecord[],
  currentPendingState: string | null = null,
  currentSessionId = "",
): string {
  if (currentPendingState && currentPendingState !== "none") {
    return `Current live session is ${interruptionLabel(currentPendingState)} and not saved in persisted catalog yet.\n\nUse ${joinCommandChoices([
      "/status",
      "/history current 8",
      currentSessionId ? `/history ${currentSessionId} 8` : "",
      "/sessions",
    ])} while run is still active.`;
  }
  if (sessions.length === 0) {
    return "No interrupted persisted sessions match this view.\n\nRun a prompt first, then use /sessions after recovery state is saved.";
  }
  const latestSessionId = sessions[0]?.sessionId ? String(sessions[0].sessionId) : null;
  const commands = [
    "/sessions",
    "/sessions clean",
    "/resume latest",
    "/history latest 8",
    latestSessionId ? `/resume ${latestSessionId}` : "",
    latestSessionId ? `/history ${latestSessionId} 8` : "",
  ];
  return `No interrupted persisted sessions match this view.\n\nUse ${joinCommandChoices(commands)} to inspect saved recovery state.`;
}

export function noCurrentSessionCatalogHint(currentSessionId: string): string {
  if (currentSessionId.length === 0) {
    return "No current live session is loaded.\n\nUse /status for live runtime state or /sessions to inspect saved recovery state.";
  }

  const commands = [
    "/status",
    "/history current 8",
    `/history ${currentSessionId} 8`,
    "/sessions",
  ];
  return `Current live session is not saved in persisted catalog yet.\n\nUse ${joinCommandChoices(commands)} while run is still active.`;
}

export function noActiveSessionCompactHint(
  sessions: GatewaySessionRecord[],
): string {
  if (sessions.length === 0) {
    return "No active session to compact.\n\nStart a Colony run first, then compact live context.";
  }
  const latestSessionId = sessions[0]?.sessionId ? String(sessions[0].sessionId) : null;
  const pendingSessionId = sessions.find((session) => String(session.interruption ?? "none") !== "none")?.sessionId ?? null;
  const commands = [
    "/resume latest",
    pendingSessionId ? "/resume pending" : "",
    latestSessionId ? `/resume ${latestSessionId}` : "",
    pendingSessionId && pendingSessionId !== latestSessionId ? `/resume ${pendingSessionId}` : "",
    "/sessions",
  ];
  return `No active session to compact.\n\nUse ${joinCommandChoices(commands)} to load saved recovery state first.`;
}

function canonicalSessionShortcutAlias(displayRef: string): SessionShortcutAlias | null {
  if (displayRef === "latest") return "latest";
  if (displayRef === "pending" || displayRef === "interrupted" || displayRef === "awaiting") {
    return "pending";
  }
  return null;
}

export function resumeHistoryInspectHint(
  displayRef: string,
  sessionId: string,
  newestInterruptedSessionId: string | null,
  latestSessionId: string | null,
): string {
  const aliases = sessionShortcutAliases(sessionId, newestInterruptedSessionId, latestSessionId);
  const preferredAlias = canonicalSessionShortcutAlias(displayRef);
  const orderedAliases = preferredAlias && aliases.includes(preferredAlias)
    ? [preferredAlias, ...aliases.filter((alias) => alias !== preferredAlias)]
    : aliases;
  const historyCommands = [
    ...orderedAliases.map((alias) => `/history ${alias} 8`),
    `/history ${sessionId} 8`,
  ];
  return `Inspect first: ${[...new Set(historyCommands)].join(" | ")}`;
}

export function filterHistoryExcerpt(
  excerpt: SessionHistoryExcerpt,
  filter: HistoryFilterMode | null,
  search: string | null,
): { excerpt: SessionHistoryExcerpt; originalVisibleCount: number } {
  const normalizedSearch = search?.trim().toLowerCase() ?? "";
  if (!filter && !normalizedSearch) {
    return { excerpt, originalVisibleCount: excerpt.entries.length };
  }

  const entries = excerpt.entries.filter((entry) => {
    const roleMatches = !filter
      || (filter === "error" ? Boolean(entry.isError) : entry.role === filter);
    if (!roleMatches) return false;
    if (!normalizedSearch) return true;
    return [
      entry.previewText,
      entry.toolName ?? "",
      entry.role,
      entry.timestamp,
      entry.isError ? "error" : "",
    ].some((value) => value.toLowerCase().includes(normalizedSearch));
  });
  return {
    excerpt: { ...excerpt, entries },
    originalVisibleCount: excerpt.entries.length,
  };
}

export function formatSessionHistoryExcerpt(
  excerpt: SessionHistoryExcerpt,
  sourceLabel: string,
  options: {
    resumeAliases?: SessionShortcutAlias[];
    historyAliases?: SessionShortcutAlias[];
    historyFilter?: HistoryFilterMode | null;
    historySearch?: string | null;
    originalVisibleCount?: number;
  } = {},
): string {
  const lines = ["Session History:", ""];
  const timestampLabels =
    sourceLabel === "current session"
      ? { savedAt: "Started", lastMessageAt: "Latest message" }
      : { savedAt: "Saved", lastMessageAt: "Last message" };
  lines.push(`Source: ${sourceLabel}`);
  lines.push(`Session ID: ${excerpt.sessionId}`);
  lines.push(`Agent: ${excerpt.agentId}`);
  lines.push(`Caste: ${excerpt.caste}`);
  lines.push(
    options.historyFilter || options.historySearch
      ? `Messages shown: ${excerpt.entries.length} filtered of ${options.originalVisibleCount ?? excerpt.entries.length} visible (${excerpt.totalMessages} total)`
      : `Messages shown: ${excerpt.entries.length} of ${excerpt.totalMessages}`,
  );
  lines.push(`State: ${interruptionLabel(excerpt.interruption)} | ${excerpt.hasCheckpoint ? "checkpoint" : "transcript-only"}`);
  lines.push(`${timestampLabels.savedAt}: ${excerpt.savedAt}`);
  lines.push(`${timestampLabels.lastMessageAt}: ${excerpt.lastMessageAt}`);
  if (options.historyFilter) {
    lines.push(`Filter: ${options.historyFilter}`);
  }
  if (options.historySearch) {
    lines.push(`Search: ${options.historySearch}`);
  }
  if (sourceLabel === "current session") {
    lines.push(
      `Inspect: ${joinCommandChoices([
        "/status",
        "/cost",
        "/history current 8",
        ...(options.historyAliases ?? []).map((alias) => `/history ${alias} 8`),
        `/history ${excerpt.sessionId} 8`,
      ])}`,
    );
    lines.push("Control: /compact | /clear");
  }
  if (sourceLabel === "persisted session") {
    if (excerpt.provider || excerpt.model) {
      lines.push(`LLM: ${excerpt.provider ?? "unknown"}:${excerpt.model ?? "unknown"}`);
    }
    const resumeCommands = [
      ...(options.resumeAliases ?? []).map((alias) => `/resume ${alias}`),
      `/resume ${excerpt.sessionId}`,
    ];
    const historyCommands = [
      "/sessions",
      ...(options.resumeAliases ?? []).map((alias) => `/history ${alias} 8`),
      `/history ${excerpt.sessionId} 8`,
    ];
    lines.push(`Resume: ${[...new Set(resumeCommands)].join(" | ")}`);
    lines.push(`Inspect: ${[...new Set(historyCommands)].join(" | ")}`);
  }
  lines.push("");

  for (const entry of excerpt.entries) {
    const timeSuffix = entry.timestamp ? ` @ ${entry.timestamp}` : "";
    const toolSuffix = entry.toolName ? `:${entry.toolName}` : "";
    const errorSuffix = entry.isError ? " [error]" : "";
    lines.push(`${entry.sequence}. ${entry.role}${toolSuffix}${errorSuffix}${timeSuffix}`);
    lines.push(`   ${entry.previewText}`);
  }

  return lines.join("\n");
}

export function renderSessionsEmptyCatalog(): string {
  return "No persisted sessions found.\n\nRun a prompt first, then use /sessions to inspect resumable history.";
}

export function renderSessionsSearchMiss(searchLabel: string): string {
  return `No persisted sessions match '${searchLabel}'.\n\nUse /sessions to list the full catalog.`;
}

export function renderSessionsCatalog(opts: {
  sessions: GatewaySessionRecord[];
  visibleSessions: GatewaySessionRecord[];
  filters: SessionFilter[];
  search: string;
  limit: number | null;
  currentSessionId: string;
  newestInterruptedSessionId: string | null;
  latestSessionId: string | null;
  currentHistoryCommands: string[];
}): string {
  const lines = ["Persisted Sessions:", ""];
  if (opts.filters.length > 0) {
    lines.push(`Filters: ${opts.filters.map(sessionFilterLabel).join(", ")}`);
  }
  if (opts.search.length > 0) {
    lines.push(`Search: ${opts.search}`);
  }
  if (opts.filters.length > 0 || opts.search.length > 0) {
    lines.push("");
  }
  if (opts.limit !== null && opts.sessions.length > opts.limit) {
    lines.push(`Showing ${opts.visibleSessions.length} of ${opts.sessions.length} matching sessions.`);
    lines.push("");
  }

  for (const session of opts.visibleSessions) {
    const sessionId = String(session.sessionId ?? "unknown");
    const catalogIndex = stableSessionIndex(opts.sessions, sessionId);
    const currentTarget = opts.currentSessionId.length > 0 && opts.currentSessionId === sessionId;
    const marker = currentTarget ? " (current)" : "";
    const shortcutAliases = sessionShortcutAliases(sessionId, opts.newestInterruptedSessionId, opts.latestSessionId);
    lines.push(`${catalogIndex}. ${sessionId}${marker}`);
    lines.push(
      `  ${String(session.agentId ?? "unknown")} | ${String(session.caste ?? "unknown")} | ${Number(session.messageCount ?? 0)} msg | ${interruptionLabel(String(session.interruption ?? "none"))} | ${session.hasCheckpoint ? "checkpoint" : "transcript-only"}`,
    );
    if (session.provider || session.model) {
      lines.push(`  llm ${String(session.provider ?? "unknown")}:${String(session.model ?? "unknown")}`);
    }
    if (typeof session.previewText === "string" && session.previewText.length > 0) {
      lines.push(`  ${previewRoleLabel(session.previewRole)}: ${session.previewText}`);
    }
    lines.push(
      `  saved ${String(session.savedAt ?? "unknown")} | last ${String(session.lastMessageAt ?? "unknown")} | cost $${Number(session.costUsd ?? 0).toFixed(4)} | tokens ${Number(session.tokensUsed ?? 0).toLocaleString()}`,
    );
    const resumeHint = currentTarget
      ? joinCommandChoices([
          `/resume ${sessionId}`,
          "/status",
          "/cost",
          "/clear",
        ])
      : joinCommandChoices([
          ...shortcutAliases.map((alias) => `/resume ${alias}`),
          `/resume ${catalogIndex}`,
          `/resume ${sessionId}`,
        ]);
    const historyHint = currentTarget
      ? joinCommandChoices(opts.currentHistoryCommands)
      : joinCommandChoices([
          ...shortcutAliases.map((alias) => `/history ${alias} 8`),
          `/history ${catalogIndex} 8`,
          `/history ${sessionId} 8`,
        ]);
    lines.push(`  use ${resumeHint}`);
    lines.push(`  peek ${historyHint}`);
  }

  return lines.join("\n");
}

export function renderArtifactNoSession(): string {
  return "No active session artifact cave available yet.\n\nUse /artifact <saved_tool_result_path> to inspect a known file.";
}

export function renderArtifactCatalogLoading(): string {
  return "Loading saved artifacts for current session...";
}

export function renderArtifactLatestLoading(): string {
  return "Opening latest saved artifact for current session...";
}

export function renderArtifactOpen(filepath: string): string {
  return `Opening saved artifact...\nPath: ${filepath}\nSource: Colony tool-result storage`;
}

export function renderResumeCurrentSession(sessionId: string, inspectLiveState: string): string {
  return [
    `Session ${sessionId} is already current.`,
    `Inspect live state: ${inspectLiveState}`,
    "Control current run: /cancel | /clear",
  ].join("\n");
}

export function renderResumeLoading(opts: {
  sessionId: string;
  displayRef: string;
  targetSession?: GatewaySessionRecord;
  interruption: string;
  checkpoint: string;
  inspectHint: string;
}): string {
  return [
    `Resuming session ${opts.sessionId}...`,
    `Resolved from '${opts.displayRef}'.`,
    `Identity: ${String(opts.targetSession?.agentId ?? "unknown")} | ${String(opts.targetSession?.caste ?? "unknown")}`,
    `State: ${opts.interruption} | ${opts.checkpoint}`,
    `Saved: ${String(opts.targetSession?.savedAt ?? "unknown")}`,
    `Last message: ${String(opts.targetSession?.lastMessageAt ?? "unknown")}`,
    opts.targetSession?.provider || opts.targetSession?.model
      ? `LLM: ${String(opts.targetSession?.provider ?? "unknown")}:${String(opts.targetSession?.model ?? "unknown")}`
      : "LLM: unavailable",
    typeof opts.targetSession?.previewText === "string" && opts.targetSession.previewText.length > 0
      ? `Preview: ${previewRoleLabel(opts.targetSession.previewRole)}: ${opts.targetSession.previewText}`
      : "Preview: unavailable",
    `Usage: ${Number(opts.targetSession?.messageCount ?? 0)} msg | ${Number(opts.targetSession?.tokensUsed ?? 0).toLocaleString()} tokens | $${Number(opts.targetSession?.costUsd ?? 0).toFixed(4)}`,
    opts.inspectHint,
    "Session recovery will hydrate on next agent loop start.",
  ].join("\n");
}

export function buildSessionsCommandPayload(opts: {
  args: string[];
  sessions: GatewaySessionRecord[];
  currentSessionId: string;
  currentPendingState: string | null;
  currentHistoryCommands: string[];
  latestSessionId: string | null;
}): GatewaySessionCommandPayload {
  const querySpec = parseSessionQuery(opts.args);
  if (opts.sessions.length === 0) {
    if (querySpec.search.length === 0 && querySpec.filters.includes("pending")) {
      return {
        output: noPendingSessionCatalogHint(opts.sessions, opts.currentPendingState, opts.currentSessionId),
        data: { sessions: [], query: null, filters: querySpec.filters, limit: querySpec.limit },
      };
    }
    if (querySpec.search.length === 0 && querySpec.filters.includes("current")) {
      return {
        output: noCurrentSessionCatalogHint(opts.currentSessionId),
        data: { sessions: [], query: null, filters: querySpec.filters, limit: querySpec.limit },
      };
    }
    return {
      output: renderSessionsEmptyCatalog(),
      data: { sessions: [] },
    };
  }

  const filtered = opts.sessions.filter((session) =>
    matchSessionFilters(session, querySpec.filters, opts.currentSessionId)
    && (querySpec.search.length === 0 || matchSessionQuery(session, querySpec.search)),
  );
  if (filtered.length === 0) {
    if (querySpec.search.length === 0 && querySpec.filters.includes("pending")) {
      return {
        output: noPendingSessionCatalogHint(opts.sessions, opts.currentPendingState),
        data: {
          sessions: [],
          query: null,
          filters: querySpec.filters,
          limit: querySpec.limit,
        },
      };
    }
    if (querySpec.search.length === 0 && querySpec.filters.includes("current")) {
      return {
        output: noCurrentSessionCatalogHint(opts.currentSessionId),
        data: {
          sessions: [],
          query: null,
          filters: querySpec.filters,
          limit: querySpec.limit,
        },
      };
    }
    const searchLabel = querySpec.search || opts.args.join(" ").trim() || "requested filters";
    return {
      output: renderSessionsSearchMiss(searchLabel),
      data: {
        sessions: [],
        query: querySpec.search || null,
        filters: querySpec.filters,
        limit: querySpec.limit,
      },
    };
  }

  const visible = querySpec.limit !== null ? filtered.slice(0, querySpec.limit) : filtered;
  const newestInterruptedSessionId =
    opts.sessions.find((session) => String(session.interruption ?? "none") !== "none")?.sessionId ?? null;
  return {
    output: renderSessionsCatalog({
      sessions: opts.sessions,
      visibleSessions: visible,
      filters: querySpec.filters,
      search: querySpec.search,
      limit: querySpec.limit,
      currentSessionId: opts.currentSessionId,
      newestInterruptedSessionId: newestInterruptedSessionId ? String(newestInterruptedSessionId) : null,
      latestSessionId: opts.latestSessionId,
      currentHistoryCommands: opts.currentHistoryCommands,
    }),
    data: {
      sessions: visible,
      totalSessions: filtered.length,
      query: querySpec.search || null,
      filters: querySpec.filters,
      limit: querySpec.limit,
    },
  };
}

export function buildArtifactCommandPayload(opts: {
  args: string[];
  sessionId: string;
  resolveArtifactPath: (rawPath: string) => { filepath?: string; error?: string };
}): GatewaySessionCommandPayload {
  const verb = opts.args[0]?.trim().toLowerCase();
  if (opts.args.length === 0 || verb === "list" || verb === "recent") {
    if (!opts.sessionId) {
      return {
        output: renderArtifactNoSession(),
        isError: true,
      };
    }
    return {
      output: renderArtifactCatalogLoading(),
      data: { sessionId: opts.sessionId },
      action: { kind: "show_artifact_catalog", sessionId: opts.sessionId },
    };
  }

  if (verb === "latest") {
    if (!opts.sessionId) {
      return {
        output: renderArtifactNoSession(),
        isError: true,
      };
    }
    return {
      output: renderArtifactLatestLoading(),
      data: { sessionId: opts.sessionId },
      action: { kind: "show_artifact_catalog", sessionId: opts.sessionId, latest: true },
    };
  }

  const target = opts.resolveArtifactPath(opts.args.join(" "));
  if (target.error || !target.filepath) {
    return {
      output: `${target.error ?? "Usage: /artifact <saved_tool_result_path>"}\n\nUse /artifact to list recent saved outputs or /artifact latest to open the newest one.`,
      isError: true,
    };
  }

  return {
    output: renderArtifactOpen(target.filepath),
    data: { filepath: target.filepath },
    action: { kind: "show_artifact", filepath: target.filepath },
  };
}

export function buildHistoryCommandPayload(opts: {
  reference: string | null;
  count: number;
  filter: HistoryFilterMode | null;
  search: string | null;
  sessions: GatewaySessionRecord[];
  currentSessionId: string;
  currentHistoryAliases: SessionShortcutAlias[];
  currentExcerpt: SessionHistoryExcerpt | null;
  latestCurrentExcerpt: SessionHistoryExcerpt | null;
  latestSessionId: string | null;
}): GatewaySessionCommandPayload {
  const normalizedRef = (opts.reference ?? "").trim().toLowerCase();
  const newestInterruptedSessionId =
    opts.sessions.find((item) => String(item.interruption ?? "none") !== "none")?.sessionId ?? null;

  if (!opts.reference || normalizedRef === "current") {
    if (!opts.currentExcerpt) {
      return {
        output: opts.sessions.length > 0
          ? noActiveSessionHistoryHint(opts.sessions, opts.count)
          : "No active session is loaded, and no persisted sessions are available.",
        isError: true,
      };
    }
    return buildCurrentHistoryPayload({
      excerpt: opts.currentExcerpt,
      count: opts.count,
      filter: opts.filter,
      search: opts.search,
      historyAliases: opts.currentHistoryAliases,
    });
  }

  if (
    !newestInterruptedSessionId
    && (normalizedRef === "pending" || normalizedRef === "interrupted" || normalizedRef === "awaiting")
    && opts.currentExcerpt
    && opts.currentExcerpt.interruption !== "none"
  ) {
    return buildCurrentHistoryPayload({
      excerpt: opts.currentExcerpt,
      count: opts.count,
      filter: opts.filter,
      search: opts.search,
      historyAliases: opts.currentHistoryAliases,
      reference: normalizedRef,
    });
  }

  if (normalizedRef === "latest" && opts.latestCurrentExcerpt) {
    return buildCurrentHistoryPayload({
      excerpt: opts.latestCurrentExcerpt,
      count: opts.count,
      filter: opts.filter,
      search: opts.search,
      historyAliases: opts.currentHistoryAliases,
      reference: normalizedRef,
    });
  }

  const resolved = resolveResumeTarget(opts.reference, opts.sessions);
  if ("error" in resolved) {
    return {
      output: resolved.error,
      isError: true,
    };
  }

  if (opts.currentSessionId.length > 0 && resolved.sessionId === opts.currentSessionId && opts.currentExcerpt) {
    return buildCurrentHistoryPayload({
      excerpt: opts.currentExcerpt,
      count: opts.count,
      filter: opts.filter,
      search: opts.search,
      historyAliases: opts.currentHistoryAliases,
      reference: resolved.displayRef,
    });
  }

  return {
    output: `Loading history for ${resolved.sessionId}...`,
    data: {
      sessionId: resolved.sessionId,
      count: opts.count,
      reference: resolved.displayRef,
      filter: opts.filter,
      search: opts.search,
    },
    action: {
      kind: "show_session_history",
      sessionId: resolved.sessionId,
      count: opts.count,
      historyFilter: opts.filter,
      historySearch: opts.search,
      resumeAliases: sessionShortcutAliases(
        resolved.sessionId,
        newestInterruptedSessionId ? String(newestInterruptedSessionId) : null,
        opts.latestSessionId ? String(opts.latestSessionId) : null,
      ),
    },
  };
}

export function buildResumeCommandPayload(opts: {
  reference: string;
  sessions: GatewaySessionRecord[];
  currentSessionId: string;
  currentSessionState: string | null;
  currentSessionHistoryCommands: string[];
  currentSessionIdForResume?: string | null;
  latestCurrentSessionId?: string | null;
  latestSessionId: string | null;
}): GatewaySessionCommandPayload {
  if (!opts.reference) {
    return {
      output: "Usage: /resume <session_id|prefix|index|latest|pending>\n\nUse /sessions to list resumable sessions, then resume by full ID, unique prefix, numeric index, 'latest', or the newest interrupted session via 'pending'.",
      isError: true,
    };
  }

  const normalizedReference = opts.reference.trim().toLowerCase();
  const newestInterruptedSessionId =
    opts.sessions.find((session) => String(session.interruption ?? "none") !== "none")?.sessionId ?? null;
  if (
    !newestInterruptedSessionId
    && (normalizedReference === "pending" || normalizedReference === "interrupted" || normalizedReference === "awaiting")
    && opts.currentSessionIdForResume
    && opts.currentSessionState
    && opts.currentSessionState !== "none"
  ) {
    return {
      output: renderResumeCurrentSession(
        opts.currentSessionIdForResume,
        joinCommandChoices([
          "/status",
          ...opts.currentSessionHistoryCommands,
        ]),
      ),
      data: {
        sessionId: opts.currentSessionIdForResume,
        action: "resume",
        reference: normalizedReference,
        requested: false,
        current: true,
      },
    };
  }

  if (normalizedReference === "latest" && opts.latestCurrentSessionId) {
    return {
      output: renderResumeCurrentSession(
        opts.latestCurrentSessionId,
        joinCommandChoices([
          "/status",
          ...opts.currentSessionHistoryCommands,
        ]),
      ),
      data: {
        sessionId: opts.latestCurrentSessionId,
        action: "resume",
        reference: normalizedReference,
        requested: false,
        current: true,
      },
    };
  }

  const resolved = resolveResumeTarget(opts.reference, opts.sessions);
  if ("error" in resolved) {
    return {
      output: resolved.error,
      isError: true,
    };
  }

  if (opts.currentSessionId.length > 0 && resolved.sessionId === opts.currentSessionId) {
    return {
      output: renderResumeCurrentSession(
        resolved.sessionId,
        joinCommandChoices([
          "/status",
          ...opts.currentSessionHistoryCommands,
        ]),
      ),
      data: {
        sessionId: resolved.sessionId,
        action: "resume",
        reference: resolved.displayRef,
        requested: false,
        current: true,
      },
    };
  }

  const targetSession = opts.sessions.find((session) => session.sessionId === resolved.sessionId);
  return {
    output: renderResumeLoading({
      sessionId: resolved.sessionId,
      displayRef: resolved.displayRef,
      targetSession,
      interruption: interruptionLabel(targetSession?.interruption),
      checkpoint: targetSession?.hasCheckpoint ? "checkpoint" : "transcript-only",
      inspectHint: resumeHistoryInspectHint(
        resolved.displayRef,
        resolved.sessionId,
        newestInterruptedSessionId ? String(newestInterruptedSessionId) : null,
        opts.latestSessionId,
      ),
    }),
    data: { sessionId: resolved.sessionId, action: "resume", reference: resolved.displayRef },
    action: { kind: "resume_session", sessionId: resolved.sessionId },
  };
}
