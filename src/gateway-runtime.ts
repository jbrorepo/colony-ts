export type StatusViewMode = "summary" | "session" | "saved" | "runtime";

export interface GatewayStatusCommandPayload {
  output: string;
  isError?: boolean;
  data?: Record<string, unknown>;
}

export interface GatewayStatusSessionSection {
  hasSession: boolean;
  sessionId?: string;
  agentId?: string;
  caste?: string;
  messageCount?: number;
  startedAt?: string;
  latestMessageAt?: string;
  currentState?: string;
  latestPreview?: string;
}

export interface GatewayStatusSavedEntry {
  sessionId: string;
  identity: string;
  savedAt: string;
  lastMessageAt: string;
  state: string;
  usage: string;
  llm?: string;
  preview?: string;
}

export interface GatewayStatusSavedSection {
  hasSavedSessions: boolean;
  count?: number;
  interruptedCount?: number;
  checkpointCount?: number;
  latest?: GatewayStatusSavedEntry & {
    isCurrent?: boolean;
    actionLine?: string;
  };
  pending?: GatewayStatusSavedEntry & {
    isCurrent?: boolean;
    recoverLine?: string;
    inspectLine?: string;
  };
  inspectLine?: string;
}

export interface GatewayStatusRuntimeSection {
  hasRuntime: boolean;
  selectedProvider?: string;
  selectedModel?: string;
  memoryRecallLine?: string;
  provider?: string;
  model?: string;
  circuitState?: string;
  runActive?: boolean;
  interruptLine?: string;
  inspectLine?: string;
  queuedPromptLine?: string;
  queuedCompactionLine?: string;
  observedHealthLine?: string;
  latestFailoverLine?: string;
  hooksLine?: string;
  latestHookLine?: string;
  hookInspectLine?: string;
  eventsLine?: string;
  eventsInspectLine?: string;
  workflowLines?: string[];
  compactionHandoffLine?: string;
  perfInspectLine?: string;
  recoveryLines?: string[];
  startupChecksLine?: string;
  startupIssueLine?: string;
  startupFixLine?: string;
  startupInspectLine?: string;
  contextUsedLine?: string;
  contextUtilizationLine?: string;
  contextFailureLine?: string;
  lastCompactionFailureLines?: string[];
  lastCompactionLines?: string[];
  workspaceLines?: string[];
  toolLines?: string[];
  approvalLines?: string[];
  costSummaryLine?: string;
  budgetLines?: string[];
  operatorActionLines?: string[];
}

export function statusInspectViews(): string {
  return "/status | /status session | /status saved | /status runtime";
}

export function resolveStatusView(args: string[]): StatusViewMode | { error: string } {
  const raw = args[0]?.trim().toLowerCase();
  if (!raw || raw === "summary" || raw === "all") return "summary";
  if (raw === "session" || raw === "live" || raw === "current") return "session";
  if (raw === "saved" || raw === "sessions" || raw === "persisted") return "saved";
  if (raw === "runtime" || raw === "run") return "runtime";
  return {
    error: `Unknown status view '${raw}'.\n\nViews: ${statusInspectViews()}`,
  };
}

export type HooksViewMode = "summary" | "recent" | "kinds" | "perf";

export function hooksInspectViews(): string {
  return "/hooks | /hooks recent | /hooks perf | /hooks kinds";
}

export function resolveHooksView(args: string[]): HooksViewMode | { error: string } {
  const raw = args[0]?.trim().toLowerCase();
  if (!raw || raw === "summary" || raw === "all") return "summary";
  if (raw === "recent" || raw === "events") return "recent";
  if (raw === "perf" || raw === "performance") return "perf";
  if (raw === "kinds" || raw === "supported") return "kinds";
  return {
    error: `Unknown hooks view '${raw}'.\n\nViews: ${hooksInspectViews()}`,
  };
}

export interface GatewayHookEventSummary {
  kind: string;
  detail?: string;
  timestamp?: number;
  durationMs?: number;
}

export interface GatewayHooksCommandPayload {
  output: string;
  isError?: boolean;
  data?: Record<string, unknown>;
}

function hookTimeLabel(timestamp?: number): string {
  return typeof timestamp === "number" && timestamp > 0
    ? new Date(timestamp).toISOString()
    : "unknown";
}

function hookEventLine(event: GatewayHookEventSummary): string {
  return `${event.kind}${event.detail ? ` | ${event.detail}` : ""}${(event.durationMs ?? 0) > 0 ? ` | ${event.durationMs}ms` : ""}`;
}

export function renderStatusViewOutput(opts: {
  view: StatusViewMode;
  sessionLines: string[];
  savedLines: string[];
  runtimeLines: string[];
}): string {
  const lines = opts.view === "session"
    ? opts.sessionLines
    : opts.view === "saved"
      ? opts.savedLines
      : opts.view === "runtime"
        ? opts.runtimeLines
        : [
            ...opts.sessionLines,
            "",
            ...opts.savedLines,
            "",
            ...opts.runtimeLines,
          ];
  lines.push("");
  lines.push(`Views: ${statusInspectViews()}`);
  return lines.join("\n");
}

export function renderStatusSessionSection(section: GatewayStatusSessionSection): string[] {
  const lines = ["Session Status:", ""];
  if (!section.hasSession) {
    lines.push("(No active session)");
    return lines;
  }

  lines.push(`Session ID: ${section.sessionId ?? "unknown"}`);
  lines.push(`Agent: ${section.agentId ?? "unknown"}`);
  lines.push(`Caste: ${section.caste ?? "unknown"}`);
  lines.push(`Messages: ${section.messageCount ?? 0}`);
  if (section.startedAt) {
    lines.push(`Session started: ${section.startedAt}`);
  }
  if (section.latestMessageAt) {
    lines.push(`Latest live message: ${section.latestMessageAt}`);
  }
  if (section.currentState) {
    lines.push(`Current state: ${section.currentState}`);
  }
  if (section.latestPreview) {
    lines.push(`Latest live preview: ${section.latestPreview}`);
  }
  return lines;
}

export function renderStatusSavedSection(section: GatewayStatusSavedSection): string[] {
  const lines = ["Saved Status:", ""];
  if (!section.hasSavedSessions) {
    lines.push("(No persisted sessions)");
    return lines;
  }

  lines.push(`Count: ${section.count ?? 0}`);
  lines.push(`Interrupted: ${section.interruptedCount ?? 0}`);
  lines.push(`With checkpoints: ${section.checkpointCount ?? 0}`);

  if (section.latest) {
    lines.push(`Latest: ${section.latest.sessionId}${section.latest.isCurrent ? " (current)" : ""}`);
    lines.push(`Latest identity: ${section.latest.identity}`);
    lines.push(`Latest saved: ${section.latest.savedAt}`);
    lines.push(`Latest message: ${section.latest.lastMessageAt}`);
    lines.push(`Latest state: ${section.latest.state}`);
    lines.push(`Latest usage: ${section.latest.usage}`);
    if (section.latest.llm) lines.push(`Latest llm: ${section.latest.llm}`);
    if (section.latest.preview) lines.push(`Latest preview: ${section.latest.preview}`);
    if (section.latest.actionLine) lines.push(section.latest.actionLine);
  }

  if (section.pending) {
    lines.push(`Pending target: ${section.pending.sessionId}${section.pending.isCurrent ? " (current)" : ""}`);
    lines.push(`Pending identity: ${section.pending.identity}`);
    lines.push(`Pending saved: ${section.pending.savedAt}`);
    lines.push(`Pending message: ${section.pending.lastMessageAt}`);
    lines.push(`Pending state: ${section.pending.state}`);
    lines.push(`Pending usage: ${section.pending.usage}`);
    if (section.pending.llm) lines.push(`Pending llm: ${section.pending.llm}`);
    if (section.pending.preview) lines.push(`Pending preview: ${section.pending.preview}`);
    if (section.pending.recoverLine) lines.push(section.pending.recoverLine);
    if (section.pending.inspectLine) lines.push(section.pending.inspectLine);
  }

  if (section.inspectLine) {
    lines.push(section.inspectLine);
  }
  return lines;
}

export function renderStatusRuntimeSection(section: GatewayStatusRuntimeSection): string[] {
  const lines = ["Runtime Status:", ""];
  if (!section.hasRuntime) {
    lines.push("Runtime:");
    lines.push("(No runtime state)");
  } else {
    lines.push("Runtime:");
    if (section.selectedProvider) lines.push(`Selected provider: ${section.selectedProvider}`);
    if (section.selectedModel) lines.push(`Selected model: ${section.selectedModel}`);
    if (section.memoryRecallLine) lines.push(section.memoryRecallLine);
    lines.push(`Provider: ${section.provider ?? "unknown"}`);
    lines.push(`Model: ${section.model ?? "unknown"}`);
    lines.push(`Circuit: ${section.circuitState ?? "unknown"}`);
    lines.push(`Run active: ${section.runActive ? "yes" : "no"}`);
    if (section.interruptLine) lines.push(section.interruptLine);
    if (section.inspectLine) lines.push(section.inspectLine);
    if (section.queuedPromptLine) lines.push(section.queuedPromptLine);
    if (section.queuedCompactionLine) lines.push(section.queuedCompactionLine);
    if (section.observedHealthLine) lines.push(section.observedHealthLine);
    if (section.latestFailoverLine) lines.push(section.latestFailoverLine);
    if (section.hooksLine) lines.push(section.hooksLine);
    if (section.latestHookLine) lines.push(section.latestHookLine);
    if (section.hookInspectLine) lines.push(section.hookInspectLine);
    if (section.eventsLine) lines.push(section.eventsLine);
    if (section.eventsInspectLine) lines.push(section.eventsInspectLine);
    if (section.compactionHandoffLine) lines.push(section.compactionHandoffLine);
    if (section.perfInspectLine) lines.push(section.perfInspectLine);
    if (section.recoveryLines?.length) {
      lines.push("Recovery:");
      lines.push(...section.recoveryLines);
    }
  }

  if (section.workflowLines?.length) {
    lines.push("");
    lines.push("Workflows:");
    lines.push(...section.workflowLines);
  }

  if (section.startupChecksLine) {
    lines.push("");
    lines.push("Startup:");
    lines.push(section.startupChecksLine);
    if (section.startupIssueLine) lines.push(section.startupIssueLine);
    if (section.startupFixLine) lines.push(section.startupFixLine);
    if (section.startupInspectLine) lines.push(section.startupInspectLine);
  }

  if (section.contextUsedLine || section.contextUtilizationLine || section.contextFailureLine) {
    lines.push("");
    lines.push("Context:");
    if (section.contextUsedLine) lines.push(section.contextUsedLine);
    if (section.contextUtilizationLine) lines.push(section.contextUtilizationLine);
    if (section.contextFailureLine) lines.push(section.contextFailureLine);
  }

  if (section.lastCompactionFailureLines?.length) {
    lines.push("");
    lines.push(...section.lastCompactionFailureLines);
  }
  if (section.lastCompactionLines?.length) {
    lines.push("");
    lines.push(...section.lastCompactionLines);
  }
  if (section.workspaceLines?.length) {
    lines.push("");
    lines.push("Workspace:");
    lines.push(...section.workspaceLines);
  }
  if (section.toolLines?.length) {
    lines.push("");
    lines.push("Tools:");
    lines.push(...section.toolLines);
  }
  if (section.approvalLines?.length) {
    lines.push("");
    lines.push("Approvals:");
    lines.push(...section.approvalLines);
  }
  if (section.costSummaryLine) {
    lines.push("");
    lines.push("Cost Summary:");
    lines.push(section.costSummaryLine);
  }
  if (section.budgetLines?.length) {
    lines.push("");
    lines.push("Budget:");
    lines.push(...section.budgetLines);
  }
  if (section.operatorActionLines?.length) {
    lines.push("");
    lines.push("Operator Next:");
    lines.push(...section.operatorActionLines);
  }
  return lines;
}

export function buildStatusCommandPayload(opts: {
  args: string[];
  sessionLines: string[];
  savedLines: string[];
  runtimeLines: string[];
  sessionId: string;
  caste: string;
  messageCount: number;
  contextUsage: unknown;
  workspace: unknown;
  provider: string | null;
  model: string | null;
}): GatewayStatusCommandPayload {
  const view = resolveStatusView(opts.args);
  if (typeof view === "object") {
    return {
      output: view.error,
      isError: true,
    };
  }

  return {
    output: renderStatusViewOutput({
      view,
      sessionLines: opts.sessionLines,
      savedLines: opts.savedLines,
      runtimeLines: opts.runtimeLines,
    }),
    data: {
      view,
      sessionId: opts.sessionId,
      caste: opts.caste,
      messageCount: opts.messageCount,
      contextUsage: opts.contextUsage,
      workspace: opts.workspace,
      provider: opts.provider,
      model: opts.model,
    },
  };
}

export function renderModelStatusView(opts: {
  selectedProvider: string;
  selectedModel: string;
  currentProvider: string;
  currentModel: string;
}): string {
  const lines = ["Model Status:", ""];
  lines.push(`Selected provider: ${opts.selectedProvider}`);
  lines.push(`Selected model: ${opts.selectedModel}`);
  lines.push(`Current provider: ${opts.currentProvider}`);
  lines.push(`Current model: ${opts.currentModel}`);
  lines.push("Set current provider model: /model <model>");
  lines.push("Set named provider model: /model <provider> <model>");
  lines.push("Switch provider only: /provider use <name>");
  lines.push("Inspect: /provider | /provider current | /status");
  return lines.join("\n");
}

export function renderHooksSummaryView(opts: {
  attachedHookCount: number;
  supportedKinds: string[];
  recentEvents: GatewayHookEventSummary[];
  registeredHooks: Array<{ kind: string; count: number }> | null;
}): string {
  const lines = ["Registered Hooks:", ""];
  if (opts.registeredHooks && opts.registeredHooks.length > 0) {
    for (const entry of opts.registeredHooks) {
      lines.push(`${entry.kind}: ${entry.count} hook(s)`);
    }
  } else {
    lines.push(`Attached per-run hooks: ${opts.attachedHookCount}`);
    lines.push(`Supported kinds: ${opts.supportedKinds.length > 0 ? opts.supportedKinds.join(", ") : "unknown"}`);
    lines.push(`Recent events: ${opts.recentEvents.length}`);
    const latestEvent = opts.recentEvents[opts.recentEvents.length - 1];
    if (latestEvent) {
      lines.push(`Latest event: ${hookEventLine(latestEvent)}`);
    }
  }
  lines.push("");
  lines.push(`Views: ${hooksInspectViews()}`);
  return lines.join("\n");
}

export function renderHooksRecentView(recentEvents: GatewayHookEventSummary[]): string {
  const lines = ["Registered Hooks:", "", "Recent Hook Events:"];
  if (recentEvents.length === 0) {
    lines.push("(No hook events recorded yet)");
  } else {
    for (const event of recentEvents.slice(-5).reverse()) {
      lines.push(`- ${hookEventLine(event)} | ${hookTimeLabel(event.timestamp)}`);
    }
  }
  lines.push("");
  lines.push(`Views: ${hooksInspectViews()}`);
  return lines.join("\n");
}

export function renderHooksPerfView(recentEvents: GatewayHookEventSummary[]): string {
  const lines = ["Registered Hooks:", "", "Hook Performance:"];
  const measuredEvents = recentEvents.filter((event) => (event.durationMs ?? 0) > 0);
  if (measuredEvents.length === 0) {
    lines.push("(No timed hook events recorded yet)");
  } else {
    const totalDuration = measuredEvents.reduce((sum, event) => sum + (event.durationMs ?? 0), 0);
    const averageDuration = Math.round(totalDuration / measuredEvents.length);
    const slowestEvent = measuredEvents.reduce((slowest, event) => (
      (event.durationMs ?? 0) > (slowest.durationMs ?? 0) ? event : slowest
    ));
    lines.push(`Timed events: ${measuredEvents.length}`);
    lines.push(`Average duration: ${averageDuration}ms`);
    lines.push(`Slowest: ${hookEventLine(slowestEvent)}`);
    for (const event of measuredEvents.slice().sort((left, right) => (right.durationMs ?? 0) - (left.durationMs ?? 0)).slice(0, 3)) {
      lines.push(`- ${hookEventLine(event)} | ${hookTimeLabel(event.timestamp)}`);
    }
  }
  lines.push("");
  lines.push(`Views: ${hooksInspectViews()}`);
  return lines.join("\n");
}

export function renderHooksKindsView(supportedKinds: string[]): string {
  const lines = ["Registered Hooks:", "", "Supported Hook Kinds:"];
  if (supportedKinds.length === 0) {
    lines.push("(No supported hook kinds declared)");
  } else {
    for (const kind of supportedKinds) {
      lines.push(`- ${kind}`);
    }
  }
  lines.push("");
  lines.push(`Views: ${hooksInspectViews()}`);
  return lines.join("\n");
}

export function buildHooksCommandPayload(opts: {
  args: string[];
  hookRunner: unknown;
  readNumber: (value: unknown, keys: string[], fallback?: number) => number;
  readString: (value: unknown, keys: string[], fallback?: string) => string;
}): GatewayHooksCommandPayload {
  const view = resolveHooksView(opts.args);
  if (typeof view === "object") {
    return {
      output: view.error,
      isError: true,
    };
  }

  if (!opts.hookRunner || typeof opts.hookRunner !== "object") {
    return {
      output: "Registered Hooks:\n\n(Hook runner not available)\n\nViews: /hooks | /hooks recent | /hooks perf | /hooks kinds",
      data: { view },
    };
  }

  const record = opts.hookRunner as Record<string, unknown>;
  const attachedHookCount = opts.readNumber(record, ["attachedHookCount"], 0);
  const supportedKinds = Array.isArray(record.supportedKinds)
    ? record.supportedKinds.map((kind) => String(kind)).filter(Boolean)
    : [];
  const recentEvents = Array.isArray(record.recentEvents)
    ? record.recentEvents
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
        .map((entry) => ({
          kind: opts.readString(entry, ["kind"], "unknown"),
          detail: opts.readString(entry, ["detail"]),
          timestamp: opts.readNumber(entry, ["timestamp"]),
          durationMs: opts.readNumber(entry, ["durationMs"], 0),
        }))
    : [];

  if (view === "recent") {
    return {
      output: renderHooksRecentView(recentEvents),
      data: { view, recentCount: recentEvents.length },
    };
  }

  if (view === "perf") {
    return {
      output: renderHooksPerfView(recentEvents),
      data: { view, recentCount: recentEvents.length },
    };
  }

  if (view === "kinds") {
    return {
      output: renderHooksKindsView(supportedKinds),
      data: { view, supportedKinds },
    };
  }

  const hooks = record["_hooks"];
  const registeredHooks = hooks && typeof hooks === "object"
    ? Object.entries(hooks as Record<string, unknown>).map(([kind, list]) => ({
        kind,
        count: Array.isArray(list) ? list.length : 1,
      }))
    : null;

  return {
    output: renderHooksSummaryView({
      attachedHookCount,
      supportedKinds,
      recentEvents,
      registeredHooks,
    }),
    data: {
      view,
      attachedHookCount,
      supportedKinds,
      recentCount: recentEvents.length,
    },
  };
}
