/**
 * Phase 6 Verification Script - The Face
 *
 * Confirms:
 *   1. Gateway command parsing
 *   2. UI component structure
 *   3. LogMessage role structure
 *   4. Component and hook exports
 *   5. Gateway + component composition
 *   6. Zustand store helpers used by the loop bridge
 *
 * Run: bun run src/verify-phase6.ts
 */

import React from "react";
import {
  Header,
  LogPane,
  StatusBar,
  BudgetWidget,
  WelcomeBanner,
  CasteLabel,
  ToolCallDisplay,
  summarizeBuiltinToolOutput,
  summarizeBuiltinToolError,
  summarizeTranscriptDisplayText,
  ThinkingIndicator,
  LogEntry,
  formatCasteDisplay,
  type LogMessage,
} from "./ui/components";
import {
  appendMessageDelta,
  createLogMessage,
  sameCompactionFailure,
  sameCompactionHandoff,
  sameCompactionResult,
  sameContextWindowSnapshot,
  samePersistedSessionSummaries,
  sameProviderDiagnostics,
  sameStartupReport,
  sameWorkspaceInfo,
  useColonyStore,
} from "./ui/store";
import {
  listReadyCloudFallbackProviders,
  readableError,
  useColonyLoop,
} from "./ui/use-colony-loop";
import { resolveSessionNavAction, SESSION_NAV_LABEL } from "./ui/hotkeys";
import { executeCommand, parseCommand, SlashCommandParser } from "./gateway";
import {
  buildApprovalRequest,
  createApprovalDecision,
  formatDeniedToolResultMessage,
  formatPendingApprovalMessage,
  parseDeniedToolResultMessage,
  parsePendingApprovalMessage,
} from "./runtime/approval";
import {
  formatStartupBlockMessage,
  formatStartupPlaceholder,
  startupDoctorFocusCommand,
  startupDoctorInspectCommands,
  type StartupReport,
} from "./runtime/startup-diagnostics";
import {
  buildLiveCurrentHistoryHint,
  buildLiveCurrentResumeHint,
  buildLiveSessionShortcutSnapshot,
  buildPersistedSessionHistoryHint,
  buildPersistedSessionResumeHint,
  resolveSmartHistoryCommand,
  resolveSmartResumeCommand,
} from "./runtime/session-shortcuts";
import { createUserMessageQueue } from "./runtime/message-queue";
import { Caste } from "./caste/enums";
import type { LLMConfig } from "./llm/selector";

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function isReactComponentExport(value: unknown): boolean {
  return typeof value === "function" || (typeof value === "object" && value !== null);
}

// ---------------------------------------------------------------------------
// 1. Gateway - Command Parsing
// ---------------------------------------------------------------------------

function verifyGateway(): void {
  section("1. Gateway - Command Parsing");

  const swarm = parseCommand("/swarm build app");
  assertEqual(swarm.type, "swarm", "/swarm: type");
  assertEqual(swarm.args[0], "build", "/swarm: first arg");
  assertEqual(swarm.args[1], "app", "/swarm: second arg");

  const hive = parseCommand("/hive deploy");
  assertEqual(hive.type, "swarm", "/hive: aliases to swarm");

  const budget = parseCommand("/budget 25");
  assertEqual(budget.type, "budget", "/budget: type");
  assertEqual(budget.args[0], "25", "/budget: amount arg");

  const sessions = parseCommand("/sessions");
  assertEqual(sessions.type, "sessions", "/sessions: type");
  const history = parseCommand("/history latest 5");
  assertEqual(history.type, "history", "/history: type");
  const artifactQuoted = parseCommand("/artifact \"C:/tmp/saved result.txt\"");
  assertEqual(artifactQuoted.type, "artifact", "/artifact: type");
  assertEqual(artifactQuoted.args[0], "C:/tmp/saved result.txt", "/artifact: quoted path arg preserved");

  const clear = parseCommand("/clear");
  assertEqual(clear.type, "clear", "/clear: type");

  const compact = parseCommand("/compact");
  assertEqual(compact.type, "compact", "/compact: type");

  const help = parseCommand("/?");
  assertEqual(help.type, "help", "/?: aliases to help");

  const status = parseCommand("/status");
  assertEqual(status.type, "status", "/status: type");

  const cost = parseCommand("/cost");
  assertEqual(cost.type, "cost", "/cost: type");

  const caste = parseCommand("/caste");
  assertEqual(caste.type, "caste", "/caste: type");

  const permissions = parseCommand("/perms");
  assertEqual(permissions.type, "permissions", "/perms: aliases to permissions");

  const resume = parseCommand("/resume ses_123");
  assertEqual(resume.type, "resume", "/resume: type");
  assertEqual(resume.args[0], "ses_123", "/resume: session arg");

  const hooks = parseCommand("/hooks");
  assertEqual(hooks.type, "hooks", "/hooks: type");

  const events = parseCommand("/events recent");
  assertEqual(events.type, "events", "/events: type");
  assertEqual(events.args[0], "recent", "/events: recent arg");
  const eventsPerf = parseCommand("/events perf");
  assertEqual(eventsPerf.type, "events", "/events perf: type");
  assertEqual(eventsPerf.args[0], "perf", "/events perf: perf arg");

  const doctor = parseCommand("/diag");
  assertEqual(doctor.type, "doctor", "/diag: aliases to doctor");

  const workspace = parseCommand("/ws");
  assertEqual(workspace.type, "workspace", "/ws: aliases to workspace");

  const model = parseCommand("/model claude-opus-4-6");
  assertEqual(model.type, "model", "/model: type");
  assertEqual(model.args[0], "claude-opus-4-6", "/model: model arg");

  const perf = parseCommand("/perf tools");
  assertEqual(perf.type, "perf", "/perf: type");
  assertEqual(perf.args[0], "tools", "/perf: tools arg");

  const exit = parseCommand("/quit");
  assertEqual(exit.type, "exit", "/quit: aliases to exit");

  const memory = parseCommand("/memory exact");
  assertEqual(memory.type, "memory", "/memory: type");
  assertEqual(memory.args[0], "exact", "/memory: mode arg");

  const unknown = parseCommand("/unknown");
  assertEqual(unknown.type, "chat", "Unknown command: routed as chat");

  const freeText = parseCommand("hello world");
  assertEqual(freeText.type, "chat", "Free text: routed as chat");
  assertEqual(freeText.args[0], "hello world", "Free text: preserved");

  const empty = parseCommand("");
  assertEqual(empty.type, "chat", "Empty: routed as chat");

  const upper = parseCommand("/SWARM test");
  assertEqual(upper.type, "swarm", "Uppercase /SWARM: normalized");
}

// ---------------------------------------------------------------------------
// 2. UI Components - Structural Validation
// ---------------------------------------------------------------------------

function verifyComponents(): void {
  section("2. UI Components - Structural Validation");

  const header = React.createElement(Header, {
    sessionId: "test-123",
    caste: "assist_ant",
    provider: "anthropic",
    model: "claude-opus-4-6",
    selectedProvider: "gemini",
    selectedModel: "gemini-2.5-pro",
    tokensUsed: 50_000,
    maxTokens: 128_000,
    costUsd: 0.15,
  });
  assert(header !== null, "Header: renders element");
  assert(header.type === Header, "Header: correct type");
  assertEqual(header.props.caste, "assist_ant", "Header: caste prop");
  assertEqual(header.props.provider, "anthropic", "Header: provider prop");
  assertEqual(header.props.model, "claude-opus-4-6", "Header: model prop");
  assertEqual(header.props.selectedProvider, "gemini", "Header: selected provider prop");
  assertEqual(header.props.selectedModel, "gemini-2.5-pro", "Header: selected model prop");

  const msg: LogMessage = {
    id: "m1",
    role: "assistant",
    content: "Hello from the Colony",
    timestamp: Date.now(),
    caste: "forge_carvers",
  };
  const entry = React.createElement(LogEntry, { message: msg });
  assert(entry !== null, "LogEntry: renders element");
  assertEqual(entry.props.message.role, "assistant", "LogEntry: role");

  const transcriptPreview = summarizeTranscriptDisplayText("x".repeat(5_000), 1_000, 48);
  assertEqual(transcriptPreview.preview.length, 1_000, "Transcript preview helper clamps oversized message text");
  assert(transcriptPreview.truncated, "Transcript preview helper marks oversized message text as truncated");
  assertEqual(transcriptPreview.hiddenChars, 4_000, "Transcript preview helper reports hidden char count");

  const lineLimitedPreview = summarizeTranscriptDisplayText("line1\nline2\nline3", 1_000, 2);
  assertEqual(lineLimitedPreview.preview, "line1\nline2", "Transcript preview helper clamps oversized line count");
  assert(lineLimitedPreview.truncated, "Transcript preview helper marks oversized line count as truncated");

  const messages: LogMessage[] = [
    { id: "1", role: "user", content: "Hello", timestamp: Date.now() },
    { id: "2", role: "assistant", content: "Hi", timestamp: Date.now() },
    { id: "3", role: "tool", content: "OK", timestamp: Date.now(), toolName: "file_read" },
    { id: "4", role: "system", content: "Ready", timestamp: Date.now() },
    { id: "5", role: "error", content: "Oops", timestamp: Date.now() },
  ];
  const pane = React.createElement(LogPane, { messages, maxVisible: 3 });
  assert(pane !== null, "LogPane: renders element");
  assertEqual(pane.props.maxVisible, 3, "LogPane: maxVisible prop");
  assertEqual(pane.props.messages.length, 5, "LogPane: 5 messages");

  const status = React.createElement(StatusBar, {
    activeRun: true,
    isThinking: true,
    thinkingLabel: "Planning...",
    queuedPromptCount: 1,
    queuedPromptPreview: "queued follow-up prompt",
    pendingApprovalTool: "file_read",
    loopDetected: false,
    circuitState: "closed" as const,
    provider: "anthropic",
    model: "claude-opus-4-6",
    selectedProvider: "gemini",
    selectedModel: "gemini-2.5-pro",
    toolCount: 6,
    startupErrors: 1,
    startupWarnings: 2,
    recentFailoverCount: 3,
    sessionCatalogCount: 4,
    interruptedSessionCount: 1,
  });
  assert(status !== null, "StatusBar: renders element");
  assertEqual(status.props.activeRun, true, "StatusBar: activeRun");
  assertEqual(status.props.isThinking, true, "StatusBar: isThinking");
  assertEqual(status.props.queuedPromptCount, 1, "StatusBar: queued prompt count");
  assertEqual(status.props.queuedPromptPreview, "queued follow-up prompt", "StatusBar: queued prompt preview");
  assertEqual(status.props.pendingApprovalTool, "file_read", "StatusBar: pending approval tool");
  assertEqual(status.props.provider, "anthropic", "StatusBar: provider");
  assertEqual(status.props.model, "claude-opus-4-6", "StatusBar: model");
  assertEqual(status.props.selectedProvider, "gemini", "StatusBar: selected provider");
  assertEqual(status.props.selectedModel, "gemini-2.5-pro", "StatusBar: selected model");
  assertEqual(status.props.startupErrors, 1, "StatusBar: startup error count");
  assertEqual(status.props.recentFailoverCount, 3, "StatusBar: failover count");
  assertEqual(status.props.sessionCatalogCount, 4, "StatusBar: session count");
  assertEqual(status.props.sessionCatalogCount, 4, "StatusBar: session count");

  const widget = React.createElement(BudgetWidget, {
    tokensUsed: 80_000,
    maxTokens: 100_000,
    costUsd: 0.85,
    maxUsd: 1.0,
    callCount: 15,
    deniedCount: 2,
    contextUsage: {
      usedTokens: 80_000,
      maxTokens: 100_000,
      remainingTokens: 20_000,
      percentUsed: 80,
      messageCount: 12,
      isAboveWarningThreshold: true,
      isAboveAutoCompactThreshold: true,
      isAtBlockingLimit: false,
      compactionFailureCount: 1,
    },
    lastCompaction: {
      compacted: true,
      originalCount: 20,
      finalCount: 14,
      summary: "summary",
      tokensSavedEstimate: 1200,
      messages: [],
      strategyUsed: "standard",
      triggerSource: "manual",
      usageBeforeFraction: 0.83,
      preservedSystemCount: 1,
      preservedRecentCount: 12,
      summarizedMessageCount: 7,
      summaryLineCount: 4,
    },
    workspaceInfo: {
      root: process.cwd(),
      startDir: process.cwd(),
      detected: true,
      reason: "test",
      markers: ["package.json"],
      projectType: "bun",
      packageManager: "bun",
      name: "colony-ts",
      workspaceMode: "single-package",
      workspaceGlobs: ["apps/*", "packages/*"],
      workspacePackageCount: 3,
      workspaceAppCount: 1,
      workspaceLibraryCount: 2,
      workspaceOtherCount: 0,
      workspaceAppPackages: ["console"],
      workspaceLibraryPackages: ["runtime-core", "ui-shell"],
      workspaceOtherPackages: [],
      workspaceDevCandidates: ["console: bun --filter console run dev"],
      workspaceVerifyCandidates: ["runtime-core: bun --filter runtime-core run verify:all"],
      workspaceIntent: "terminal-app",
      workspacePrimaryTargets: ["colony-ts"],
      scriptNames: ["dev", "start", "build", "verify:all"],
      devCommand: "bun run --watch src/index.tsx",
      verifyCommand: "bun run verify:all",
      stackHints: ["bun", "react", "ink", "typescript", "zustand"],
    },
    startupReport: {
      passed: false,
      errorCount: 1,
      warningCount: 1,
      checks: [
        { name: "Ollama server", passed: false, severity: "warning", message: "offline" },
        { name: "Cloud fallback", passed: false, severity: "error", message: "missing key" },
      ],
    },
    providerHealth: {
      anthropic: { state: "closed", failureCount: 0 },
      local: { state: "open", failureCount: 3 },
    },
    recentFailovers: [
      {
        fromProvider: "local",
        fromModel: "llama3.2",
        toProvider: "anthropic",
        toModel: "claude-sonnet-4-5-20250929",
        errorType: "LLMConnectionError",
        errorMessage: "offline",
        timestamp: Date.now(),
      },
    ],
    persistedSessions: [
      {
        sessionId: "ses_recent_1",
        agentId: "assist-ant",
        caste: "assist_ant",
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        savedAt: "2026-04-16T10:00:00.000Z",
        lastMessageAt: "2026-04-16T10:00:00.000Z",
        messageCount: 4,
        tokensUsed: 500,
        costUsd: 0.01,
        interruption: "interrupted_prompt",
        hasCheckpoint: true,
        previewText: "Need answer soon.",
        previewRole: "user",
      },
    ],
    provider: "anthropic",
    model: "claude-opus-4-6",
    selectedProvider: "gemini",
    selectedModel: "gemini-2.5-pro",
    currentSessionId: "ses_recent_1",
    currentAgentId: "assist-ant",
    currentCaste: "assist_ant",
    currentStartedMessageTimestamp: Date.parse("2026-04-16T09:55:00.000Z"),
    currentLatestMessageTimestamp: Date.parse("2026-04-16T10:00:00.000Z"),
    currentMessageCount: 4,
    currentPreviewText: "Need answer soon.",
    currentPreviewRole: "user",
    currentAwaitingReply: true,
    compactionRecommendationStrategy: "micro",
    compactionRecommendationReason: "2 older tool results can be trimmed in place with low transcript churn",
    microCandidateCount: 2,
    microTokensSavedEstimate: 1800,
  });
  assert(widget !== null, "BudgetWidget: renders element");
  assertEqual(widget.props.deniedCount, 2, "BudgetWidget: deniedCount");
  assertEqual(widget.props.contextUsage!.percentUsed, 80, "BudgetWidget: context usage prop");
  assertEqual(widget.props.lastCompaction!.triggerSource, "manual", "BudgetWidget: compaction trigger prop");
  assertEqual(widget.props.workspaceInfo!.name, "colony-ts", "BudgetWidget: workspace info prop");
  assertEqual(widget.props.startupReport!.errorCount, 1, "BudgetWidget: startup report prop");
  assertEqual(widget.props.recentFailovers!.length, 1, "BudgetWidget: recent failovers prop");
  assertEqual(widget.props.persistedSessions!.length, 1, "BudgetWidget: persisted sessions prop");
  assertEqual(widget.props.provider, "anthropic", "BudgetWidget: current provider prop");
  assertEqual(widget.props.model, "claude-opus-4-6", "BudgetWidget: current model prop");
  assertEqual(widget.props.selectedProvider, "gemini", "BudgetWidget: selected provider prop");
  assertEqual(widget.props.selectedModel, "gemini-2.5-pro", "BudgetWidget: selected model prop");
  assertEqual(widget.props.currentAgentId, "assist-ant", "BudgetWidget: live current agent prop");
  assertEqual(widget.props.currentCaste, "assist_ant", "BudgetWidget: live current caste prop");
  assertEqual(widget.props.currentStartedMessageTimestamp, Date.parse("2026-04-16T09:55:00.000Z"), "BudgetWidget: live current started timestamp prop");
  assertEqual(widget.props.currentLatestMessageTimestamp, Date.parse("2026-04-16T10:00:00.000Z"), "BudgetWidget: live current timestamp prop");
  assertEqual(widget.props.currentMessageCount, 4, "BudgetWidget: live current message count prop");
  assertEqual(widget.props.currentPreviewText, "Need answer soon.", "BudgetWidget: live current preview prop");
  assertEqual(widget.props.currentPreviewRole, "user", "BudgetWidget: live current preview role prop");
  assertEqual(widget.props.currentAwaitingReply, true, "BudgetWidget: live current awaiting-reply prop");
  assertEqual(widget.props.compactionRecommendationStrategy, "micro", "BudgetWidget: smart compaction strategy prop");
  assertEqual(widget.props.microCandidateCount, 2, "BudgetWidget: micro candidate count prop");
  assertEqual(widget.props.microTokensSavedEstimate, 1800, "BudgetWidget: micro saved-token estimate prop");

  const caste = React.createElement(CasteLabel, { caste: "ROOT_QUEEN" });
  assert(caste !== null, "CasteLabel: renders element");
  assertEqual(caste.props.caste, "ROOT_QUEEN", "CasteLabel: caste prop");
  assertEqual(formatCasteDisplay("assist_ant"), "Assist-Ant", "Caste display: canonical method label");
  assertEqual(formatCasteDisplay("ROOT_QUEEN"), "Queen", "Caste display: legacy uppercase maps to method label");

  const thinking = React.createElement(ThinkingIndicator, {
    phase: "Generating response",
    elapsed: 2500,
  });
  assert(thinking !== null, "ThinkingIndicator: renders element");
  assertEqual(thinking.props.phase, "Generating response", "ThinkingIndicator: phase");

  const toolCall = React.createElement(ToolCallDisplay, {
    toolName: "file_read",
    args: { path: "/src/index.ts" },
    output: "export const x = 42;",
    durationMs: 15,
  });
  assert(toolCall !== null, "ToolCallDisplay: renders element");
  assertEqual(toolCall.props.toolName, "file_read", "ToolCallDisplay: tool name");

  const banner = React.createElement(WelcomeBanner, { caste: "assist_ant" });
  assert(banner !== null, "WelcomeBanner: renders element");
}

// ---------------------------------------------------------------------------
// 3. LogMessage - Role Structure
// ---------------------------------------------------------------------------

function verifyLogMessages(): void {
  section("3. LogMessage - Role Structure");

  const roles: LogMessage["role"][] = ["user", "assistant", "system", "tool", "error"];

  for (const role of roles) {
    const msg: LogMessage = {
      id: `test-${role}`,
      role,
      content: `Test ${role} message`,
      timestamp: Date.now(),
    };
    assert(msg.role === role, `LogMessage: ${role} role valid`);
    assert(msg.content.includes(role), `LogMessage: ${role} content`);
    assert(msg.id.startsWith("test-"), `LogMessage: ${role} has ID`);
  }

  const toolMsg: LogMessage = {
    id: "tool-1",
    role: "tool",
    content: "Result",
    timestamp: Date.now(),
    toolName: "shell_exec",
  };
  assertEqual(toolMsg.toolName, "shell_exec", "Tool message: has toolName");

  const casteMsg: LogMessage = {
    id: "caste-1",
    role: "assistant",
    content: "Analysis",
    timestamp: Date.now(),
    caste: "eldest_architect",
  };
  assertEqual(casteMsg.caste, "eldest_architect", "Assistant message: has caste");
}

// ---------------------------------------------------------------------------
// 4. Component Exports
// ---------------------------------------------------------------------------

function verifyExports(): void {
  section("4. Component Exports - All Available");

  assert(isReactComponentExport(Header), "Export: Header");
  assert(isReactComponentExport(LogPane), "Export: LogPane");
  assert(isReactComponentExport(LogEntry), "Export: LogEntry");
  assert(isReactComponentExport(StatusBar), "Export: StatusBar");
  assert(isReactComponentExport(BudgetWidget), "Export: BudgetWidget");
  assert(typeof CasteLabel === "function", "Export: CasteLabel");
  assert(typeof ThinkingIndicator === "function", "Export: ThinkingIndicator");
  assert(typeof ToolCallDisplay === "function", "Export: ToolCallDisplay");
  assert(isReactComponentExport(WelcomeBanner), "Export: WelcomeBanner");
  assert(typeof formatCasteDisplay === "function", "Export: formatCasteDisplay");
  assert(typeof parseCommand === "function", "Export: parseCommand");
  assert(typeof executeCommand === "function", "Export: executeCommand");
  assert(typeof SlashCommandParser === "function", "Export: SlashCommandParser");
  assert(typeof useColonyLoop === "function", "Export: useColonyLoop");
  assert(typeof useColonyStore === "function", "Export: useColonyStore");
}

// ---------------------------------------------------------------------------
// 5. Integration - Gateway + Component Composition
// ---------------------------------------------------------------------------

function verifyIntegration(): void {
  section("5. Integration - Gateway + Components");

  const sessionMessages: LogMessage[] = [];
  let msgId = 0;
  const addMsg = (role: LogMessage["role"], content: string, extra?: Partial<LogMessage>) => {
    sessionMessages.push({
      id: `session-${++msgId}`,
      role,
      content,
      timestamp: Date.now(),
      ...extra,
    });
  };

  const swarmCmd = parseCommand("/swarm build api");
  assertEqual(swarmCmd.type, "swarm", "Integration: parse /swarm");
  addMsg("user", "/swarm build api");
  addMsg("assistant", "Planning API construction...", { caste: "eldest_architect" });
  addMsg("tool", "npm init -y", { toolName: "shell_exec" });
  addMsg("assistant", "API scaffold complete", { caste: "forge_carvers" });

  assertEqual(sessionMessages.length, 4, "Integration: 4 messages");

  const header = React.createElement(Header, {
    sessionId: "int-test",
    caste: "assist_ant",
    provider: "local",
    model: "llama3.1",
    selectedProvider: "local",
    selectedModel: "llama3.1",
    tokensUsed: 5000,
    maxTokens: 128_000,
    costUsd: 0.005,
  });
  const pane = React.createElement(LogPane, { messages: sessionMessages });
  const status = React.createElement(StatusBar, {
    activeRun: false,
    isThinking: false,
    thinkingLabel: "",
    loopDetected: false,
    circuitState: "closed" as const,
    provider: "local",
    model: "llama3.1",
    selectedProvider: "local",
    selectedModel: "llama3.1",
    toolCount: 0,
  });

  assert(header !== null, "Integration: Header composable");
  assert(pane !== null, "Integration: LogPane composable");
  assert(status !== null, "Integration: StatusBar composable");

  const budgetCmd = parseCommand("/budget 5");
  assertEqual(budgetCmd.type, "budget", "Integration: parse /budget");
  assertEqual(budgetCmd.args[0], "5", "Integration: budget amount");

  const budgetWidget = React.createElement(BudgetWidget, {
    tokensUsed: 5000,
    maxTokens: 128_000,
    costUsd: 0.005,
    maxUsd: 5.0,
    callCount: 3,
    deniedCount: 0,
    contextUsage: {
      usedTokens: 5000,
      maxTokens: 128_000,
      remainingTokens: 123_000,
      percentUsed: 3.9,
      messageCount: 4,
      isAboveWarningThreshold: false,
      isAboveAutoCompactThreshold: false,
      isAtBlockingLimit: false,
      compactionFailureCount: 0,
    },
    provider: "local",
    model: "llama3.1",
    selectedProvider: "local",
    selectedModel: "llama3.1",
    persistedSessions: [
      {
        sessionId: "ses_recent_1",
        agentId: "assist-ant",
        caste: "assist_ant",
        savedAt: "2026-04-16T10:00:00.000Z",
        lastMessageAt: "2026-04-16T10:00:00.000Z",
        messageCount: 4,
        tokensUsed: 500,
        costUsd: 0.01,
        interruption: "interrupted_prompt",
        hasCheckpoint: true,
        previewText: "Need answer soon.",
        previewRole: "user",
      },
    ],
    currentSessionId: "ses_recent_1",
  });
  assert(budgetWidget !== null, "Integration: BudgetWidget composable");

  const app = React.createElement(
    "div",
    null,
    header,
    pane,
    status,
    budgetWidget,
  );
  assert(app !== null, "Integration: Full composition works");
  assert(React.Children.count(app.props.children) === 4, "Integration: 4 composed children");
}

// ---------------------------------------------------------------------------
// 6. Store & Loop Bridge Helpers
// ---------------------------------------------------------------------------

function verifyStoreBridge(): void {
  section("6. Store & Loop Bridge Helpers");

  const message = createLogMessage("assistant", "Hel", { caste: "assist_ant" });
  assert(message.id.startsWith("msg-"), "Store: createLogMessage assigns ID");
  assertEqual(message.role, "assistant", "Store: createLogMessage role");
  assertEqual(message.caste, "assist_ant", "Store: createLogMessage extras");

  const appended = appendMessageDelta([message], message.id, "lo");
  assertEqual(appended[0].content, "Hello", "Store: appendMessageDelta appends content");
  assert(appended[0] !== message, "Store: appendMessageDelta returns updated object");

  const unchanged = appendMessageDelta([message], "missing", "x");
  assertEqual(unchanged[0].content, "Hel", "Store: appendMessageDelta ignores missing ID");

  useColonyStore.getState().reset();
  useColonyStore.getState().setQuery("hello");
  assertEqual(useColonyStore.getState().query, "hello", "Zustand: setQuery");

  const addedId = useColonyStore.getState().addMessage("system", "ready");
  assert(addedId.startsWith("msg-"), "Zustand: addMessage returns ID");
  assertEqual(useColonyStore.getState().messages.length, 1, "Zustand: addMessage stores message");

  const runId = useColonyStore.getState().startRun("Thinking");
  assert(runId.startsWith("run-"), "Zustand: startRun returns run ID");
  assertEqual(useColonyStore.getState().isThinking, true, "Zustand: startRun marks active");
  useColonyStore.getState().setThinkingState(true, "Thinking");
  assertEqual(useColonyStore.getState().thinkingPhase, "Thinking", "Zustand: identical thinking state keeps label stable");
  useColonyStore.getState().setThinkingState(true, "Planning");
  assertEqual(useColonyStore.getState().thinkingPhase, "Planning", "Zustand: thinking state updates label when it changes");
  useColonyStore.getState().requestInterrupt("Stopping current operation...");
  assertEqual(useColonyStore.getState().interruptRequested, true, "Zustand: requestInterrupt marks active run as stopping");
  assertEqual(useColonyStore.getState().isThinking, false, "Zustand: requestInterrupt clears thinking state");
  useColonyStore.getState().setQueuedPrompt(1, "queued follow-up prompt");
  assertEqual(useColonyStore.getState().queuedPromptCount, 1, "Zustand: queued prompt count stored");
  assertEqual(useColonyStore.getState().queuedPromptPreview, "queued follow-up prompt", "Zustand: queued prompt preview stored");
  useColonyStore.getState().finishRun(runId);
  assertEqual(useColonyStore.getState().isThinking, false, "Zustand: finishRun marks idle");
  assertEqual(useColonyStore.getState().interruptRequested, false, "Zustand: finishRun clears interrupt state");

  useColonyStore.getState().setWorkspaceInfo({
    root: process.cwd(),
    startDir: process.cwd(),
    detected: true,
    reason: "test",
    markers: ["package.json"],
    projectType: "bun",
    packageManager: "bun",
    name: "colony-ts",
    workspaceMode: "single-package",
    workspaceGlobs: ["apps/*", "packages/*"],
    workspacePackageCount: 3,
    workspaceAppCount: 1,
    workspaceLibraryCount: 2,
    workspaceOtherCount: 0,
    workspaceAppPackages: ["console"],
    workspaceLibraryPackages: ["runtime-core", "ui-shell"],
      workspaceOtherPackages: [],
      workspaceDevCandidates: ["console: bun --filter console run dev"],
      workspaceVerifyCandidates: ["runtime-core: bun --filter runtime-core run verify:all"],
      workspaceIntent: "terminal-app",
      workspacePrimaryTargets: ["colony-ts"],
      scriptNames: ["dev", "start", "build", "verify:all"],
    devCommand: "bun run --watch src/index.tsx",
    verifyCommand: "bun run verify:all",
    stackHints: ["bun", "react", "ink", "typescript", "zustand"],
  });
  assertEqual(useColonyStore.getState().workspaceInfo?.name, "colony-ts", "Zustand: workspace info stored");
  const workspaceInfoIdentity = useColonyStore.getState().workspaceInfo;
  useColonyStore.getState().setWorkspaceInfo({
    root: process.cwd(),
    startDir: process.cwd(),
    detected: true,
    reason: "test",
    markers: ["package.json"],
    projectType: "bun",
    packageManager: "bun",
    name: "colony-ts",
    workspaceMode: "single-package",
    workspaceGlobs: ["apps/*", "packages/*"],
    workspacePackageCount: 3,
    workspaceAppCount: 1,
    workspaceLibraryCount: 2,
    workspaceOtherCount: 0,
    workspaceAppPackages: ["console"],
    workspaceLibraryPackages: ["runtime-core", "ui-shell"],
    workspaceOtherPackages: [],
    workspaceDevCandidates: ["console: bun --filter console run dev"],
    workspaceVerifyCandidates: ["runtime-core: bun --filter runtime-core run verify:all"],
    workspaceIntent: "terminal-app",
    workspacePrimaryTargets: ["colony-ts"],
    scriptNames: ["dev", "start", "build", "verify:all"],
    devCommand: "bun run --watch src/index.tsx",
    verifyCommand: "bun run verify:all",
    stackHints: ["bun", "react", "ink", "typescript", "zustand"],
  });
  assert(
    useColonyStore.getState().workspaceInfo === workspaceInfoIdentity,
    "Zustand: identical workspace info does not churn identity",
  );
  assert(
    sameWorkspaceInfo(workspaceInfoIdentity, useColonyStore.getState().workspaceInfo),
    "Zustand: workspace equality helper matches stable workspace snapshot",
  );

  useColonyStore.getState().setQueuedPrompt(1, "queued follow-up prompt");
  const queuedPromptCountIdentity = useColonyStore.getState().queuedPromptCount;
  const queuedPromptPreviewIdentity = useColonyStore.getState().queuedPromptPreview;
  useColonyStore.getState().setQueuedPrompt(1, "queued follow-up prompt");
  assertEqual(useColonyStore.getState().queuedPromptCount, queuedPromptCountIdentity, "Zustand: identical queued prompt count stays stable");
  assertEqual(useColonyStore.getState().queuedPromptPreview, queuedPromptPreviewIdentity, "Zustand: identical queued prompt preview stays stable");
  useColonyStore.getState().setQueuedPrompt(0, null);
  assertEqual(useColonyStore.getState().queuedPromptCount, 0, "Zustand: queued prompt count clears");
  assertEqual(useColonyStore.getState().queuedPromptPreview, null, "Zustand: queued prompt preview clears");

  const userQueue = createUserMessageQueue();
  const queuedFirst = userQueue.enqueue("fix bug");
  assert(queuedFirst.accepted, "Message queue: accepts first queued prompt");
  assertEqual(queuedFirst.replaced, false, "Message queue: first prompt does not replace");
  assertEqual(userQueue.depth(), 1, "Message queue: depth reflects queued prompt");
  const queuedSecond = userQueue.enqueue("write tests");
  assert(queuedSecond.accepted, "Message queue: accepts replacement prompt");
  assertEqual(queuedSecond.replaced, true, "Message queue: second prompt supersedes older queued prompt");
  assertEqual(userQueue.peek()?.content ?? "", "write tests", "Message queue: latest prompt stays queued");
  const queuedDuplicate = userQueue.enqueue("write tests");
  assertEqual(queuedDuplicate.duplicate, true, "Message queue: duplicate queued prompt is dropped");

  useColonyStore.getState().setStartupReport({
    passed: false,
    errorCount: 1,
    warningCount: 2,
    checks: [
      { name: "Ollama server", passed: false, severity: "warning", message: "offline" },
    ],
  });
  assertEqual(useColonyStore.getState().startupReport?.warningCount, 2, "Zustand: startup report stored");
  const startupReportIdentity = useColonyStore.getState().startupReport;
  useColonyStore.getState().setStartupReport({
    passed: false,
    errorCount: 1,
    warningCount: 2,
    checks: [
      { name: "Ollama server", passed: false, severity: "warning", message: "offline" },
    ],
  });
  assert(
    useColonyStore.getState().startupReport === startupReportIdentity,
    "Zustand: identical startup report does not churn identity",
  );
  assert(
    sameStartupReport(startupReportIdentity, useColonyStore.getState().startupReport),
    "Zustand: startup-report equality helper matches stable report",
  );

  useColonyStore.getState().setProviderDiagnostics(
    {
      local: { state: "open", failureCount: 2 },
      anthropic: { state: "closed", failureCount: 0 },
    },
    [
      {
        fromProvider: "local",
        fromModel: "llama3.2",
        toProvider: "anthropic",
        toModel: "claude-sonnet-4-5-20250929",
        errorType: "LLMConnectionError",
        errorMessage: "offline",
        timestamp: Date.now(),
      },
    ],
  );
  assertEqual(useColonyStore.getState().providerHealth.local?.state, "open", "Zustand: provider health stored");
  assertEqual(useColonyStore.getState().recentFailovers.length, 1, "Zustand: recent failovers stored");
  useColonyStore.getState().setPersistedSessions([
    {
      sessionId: "ses_saved_1",
      agentId: "assist-ant",
      caste: "assist_ant",
      savedAt: "2026-04-16T10:00:00.000Z",
      lastMessageAt: "2026-04-16T10:00:00.000Z",
      messageCount: 2,
      tokensUsed: 10,
      costUsd: 0,
      interruption: "none",
      hasCheckpoint: true,
      previewText: "ok",
      previewRole: "assistant",
    },
  ]);
  assertEqual(useColonyStore.getState().persistedSessions.length, 1, "Zustand: persisted sessions stored");
  const persistedSessionsIdentity = useColonyStore.getState().persistedSessions;
  useColonyStore.getState().setPersistedSessions([
    {
      sessionId: "ses_saved_1",
      agentId: "assist-ant",
      caste: "assist_ant",
      savedAt: "2026-04-16T10:00:00.000Z",
      lastMessageAt: "2026-04-16T10:00:00.000Z",
      messageCount: 2,
      tokensUsed: 10,
      costUsd: 0,
      interruption: "none",
      hasCheckpoint: true,
      previewText: "ok",
      previewRole: "assistant",
    },
  ]);
  assert(
    useColonyStore.getState().persistedSessions === persistedSessionsIdentity,
    "Zustand: identical persisted sessions do not churn array identity",
  );
  assert(
    samePersistedSessionSummaries(
      persistedSessionsIdentity,
      useColonyStore.getState().persistedSessions,
    ),
    "Zustand: persisted session equality helper matches stable catalogs",
  );
  const providerHealthIdentity = useColonyStore.getState().providerHealth;
  const failoverIdentity = useColonyStore.getState().recentFailovers;
  useColonyStore.getState().setProviderDiagnostics(
    {
      local: { state: "open", failureCount: 2 },
      anthropic: { state: "closed", failureCount: 0 },
    },
    [
      {
        fromProvider: "local",
        fromModel: "llama3.2",
        toProvider: "anthropic",
        toModel: "claude-sonnet-4-5-20250929",
        errorType: "LLMConnectionError",
        errorMessage: "offline",
        timestamp: failoverIdentity[0]?.timestamp ?? Date.now(),
      },
    ],
  );
  assert(
    useColonyStore.getState().providerHealth === providerHealthIdentity,
    "Zustand: identical provider diagnostics do not churn provider-health identity",
  );
  assert(
    useColonyStore.getState().recentFailovers === failoverIdentity,
    "Zustand: identical provider diagnostics do not churn failover identity",
  );
  assert(
    sameProviderDiagnostics(
      providerHealthIdentity,
      useColonyStore.getState().providerHealth,
      failoverIdentity,
      useColonyStore.getState().recentFailovers,
    ),
    "Zustand: provider diagnostic equality helper matches stable diagnostics",
  );

  const approval = buildApprovalRequest(
    { id: "call-1", name: "file_read", arguments: { path: "README.md" } },
    {
      sessionId: "ses_test",
      agentId: "assist-ant",
      caste: Caste.ASSIST_ANT,
      category: "read",
    },
  );
  useColonyStore.getState().setPendingApproval(approval);
  assertEqual(useColonyStore.getState().pendingApproval?.toolName, "file_read", "Zustand: pending approval stored");

  useColonyStore.getState().setPendingCompactionStrategy("standard");
  assertEqual(useColonyStore.getState().pendingCompactionStrategy, "standard", "Zustand: pending compaction stored");

  useColonyStore.getState().setSessionAllowRules(["tool:b", "tool:a"]);
  assertEqual(useColonyStore.getState().sessionAllowRules[0], "tool:a", "Zustand: session allow rules sorted");
  const sessionAllowRulesIdentity = useColonyStore.getState().sessionAllowRules;
  useColonyStore.getState().setSessionAllowRules(["tool:a", "tool:b"]);
  assert(
    useColonyStore.getState().sessionAllowRules === sessionAllowRulesIdentity,
    "Zustand: identical session allow rules do not churn array identity",
  );

  useColonyStore.getState().setContextUsage({
    usedTokens: 640,
    maxTokens: 1280,
    remainingTokens: 640,
    percentUsed: 50,
    messageCount: 3,
    isAboveWarningThreshold: false,
    isAboveAutoCompactThreshold: false,
    isAtBlockingLimit: false,
    compactionFailureCount: 2,
  });
  assertEqual(useColonyStore.getState().contextUsage?.usedTokens, 640, "Zustand: context usage stored");
  assertEqual(useColonyStore.getState().tokensUsed, 640, "Zustand: context usage syncs tokens used");
  assertEqual(useColonyStore.getState().maxTokens, 1280, "Zustand: context usage syncs max tokens");
  const contextUsageIdentity = useColonyStore.getState().contextUsage;
  useColonyStore.getState().setContextUsage({
    usedTokens: 640,
    maxTokens: 1280,
    remainingTokens: 640,
    percentUsed: 50,
    messageCount: 3,
    isAboveWarningThreshold: false,
    isAboveAutoCompactThreshold: false,
    isAtBlockingLimit: false,
    compactionFailureCount: 2,
  });
  assert(
    useColonyStore.getState().contextUsage === contextUsageIdentity,
    "Zustand: identical context usage does not churn snapshot identity",
  );
  assert(
    sameContextWindowSnapshot(
      contextUsageIdentity,
      useColonyStore.getState().contextUsage,
    ),
    "Zustand: context-usage equality helper matches stable snapshots",
  );

  useColonyStore.getState().setLastCompaction({
    compacted: true,
    originalCount: 15,
    finalCount: 9,
    summary: "summary",
    tokensSavedEstimate: 300,
    messages: [],
    strategyUsed: "reactive",
    triggerSource: "reactive_overflow",
    usageBeforeFraction: 0.98,
    preservedSystemCount: 1,
    preservedRecentCount: 6,
    summarizedMessageCount: 8,
    summaryLineCount: 3,
  });
  assertEqual(useColonyStore.getState().lastCompaction?.strategyUsed, "reactive", "Zustand: last compaction stored");
  const lastCompactionIdentity = useColonyStore.getState().lastCompaction;
  useColonyStore.getState().setLastCompaction({
    compacted: true,
    originalCount: 15,
    finalCount: 9,
    summary: "summary",
    tokensSavedEstimate: 300,
    messages: lastCompactionIdentity?.messages ?? [],
    strategyUsed: "reactive",
    triggerSource: "reactive_overflow",
    usageBeforeFraction: 0.98,
    preservedSystemCount: 1,
    preservedRecentCount: 6,
    summarizedMessageCount: 8,
    summaryLineCount: 3,
  });
  assert(
    useColonyStore.getState().lastCompaction === lastCompactionIdentity,
    "Zustand: identical last compaction does not churn identity",
  );
  assert(
    sameCompactionResult(lastCompactionIdentity, useColonyStore.getState().lastCompaction),
    "Zustand: compaction-result equality helper matches stable result",
  );

  useColonyStore.getState().setLastCompactionFailure({ strategy: "reactive", message: "still full" });
  const lastCompactionFailureIdentity = useColonyStore.getState().lastCompactionFailure;
  useColonyStore.getState().setLastCompactionFailure({ strategy: "reactive", message: "still full" });
  assert(
    useColonyStore.getState().lastCompactionFailure === lastCompactionFailureIdentity,
    "Zustand: identical compaction failure does not churn identity",
  );
  assert(
    sameCompactionFailure(lastCompactionFailureIdentity, useColonyStore.getState().lastCompactionFailure),
    "Zustand: compaction-failure equality helper matches stable failure",
  );

  useColonyStore.getState().setLatestCompactionHandoff({
    status: "ok",
    strategy: "reactive",
    trigger: "manual",
    timestamp: 123,
    loggedCount: 2,
    structuredCount: 1,
    artifactId: "artifact-1",
    artifactChars: 42,
  });
  const latestCompactionHandoffIdentity = useColonyStore.getState().latestCompactionHandoff;
  useColonyStore.getState().setLatestCompactionHandoff({
    status: "ok",
    strategy: "reactive",
    trigger: "manual",
    timestamp: 123,
    loggedCount: 2,
    structuredCount: 1,
    artifactId: "artifact-1",
    artifactChars: 42,
  });
  assert(
    useColonyStore.getState().latestCompactionHandoff === latestCompactionHandoffIdentity,
    "Zustand: identical compaction handoff does not churn identity",
  );
  assert(
    sameCompactionHandoff(latestCompactionHandoffIdentity, useColonyStore.getState().latestCompactionHandoff),
    "Zustand: compaction-handoff equality helper matches stable handoff",
  );

  useColonyStore.getState().setError("same error");
  const lastErrorIdentity = useColonyStore.getState().lastError;
  useColonyStore.getState().setError("same error");
  assertEqual(useColonyStore.getState().lastError, lastErrorIdentity, "Zustand: identical error keeps same value");

  useColonyStore.getState().scrollLog(5, 1);
  assertEqual(useColonyStore.getState().logScrollOffset, 0, "Zustand: scrollLog clamps when transcript is short");
  useColonyStore.getState().addMessage("assistant", "older");
  useColonyStore.getState().addMessage("assistant", "newer");
  useColonyStore.getState().scrollLog(1, 1);
  assertEqual(useColonyStore.getState().logScrollOffset, 1, "Zustand: scrollLog moves older through transcript");
  useColonyStore.getState().addMessage("assistant", "latest");
  assertEqual(useColonyStore.getState().logScrollOffset, 2, "Zustand: addMessage preserves historical viewport when scrolled back");
  useColonyStore.getState().resetLogScroll();
  assertEqual(useColonyStore.getState().logScrollOffset, 0, "Zustand: resetLogScroll returns transcript to latest");

  useColonyStore.getState().reset();
  assertEqual(useColonyStore.getState().recentFailovers.length, 0, "Zustand: reset clears failovers");
  assertEqual(useColonyStore.getState().startupReport, null, "Zustand: reset clears startup report");
  assertEqual(useColonyStore.getState().pendingCompactionStrategy, null, "Zustand: reset clears pending compaction");
  assertEqual(useColonyStore.getState().persistedSessions.length, 1, "Zustand: reset preserves persisted sessions");
}

function verifyReadableErrors(): void {
  section("6b. Loop Error Guidance");

  const localOnly: LLMConfig = {
    defaults: { provider: "local", model: "llama3.2" },
    providers: {
      local: { defaultModel: "llama3.2" },
    },
    casteModels: {},
    failover: {},
  };
  const multiCloud: LLMConfig = {
    defaults: { provider: "local", model: "llama3.2" },
    providers: {
      local: { defaultModel: "llama3.2" },
      gemini: { defaultModel: "gemini-2.5-flash", apiKey: "env" },
      openai: { defaultModel: "gpt-4o-mini", apiKey: "env" },
    },
    casteModels: {},
    failover: { local: ["gemini", "openai"] },
  };

  assertEqual(
    listReadyCloudFallbackProviders(multiCloud).join(", "),
    "gemini, openai",
    "Readable error helper lists ready cloud fallbacks",
  );
  assertEqual(
    listReadyCloudFallbackProviders(localOnly).length,
    0,
    "Readable error helper ignores missing cloud fallbacks",
  );

  const noFallbackMessage = readableError("ollama all candidates exhausted", localOnly);
  assert(
    noFallbackMessage.includes("No local Ollama response is available."),
    "Readable error explains local Ollama outage",
  );
  assert(
    noFallbackMessage.includes("Start Ollama or set ANTHROPIC_API_KEY, GEMINI_API_KEY, GOOGLE_API_KEY, or OPENAI_API_KEY for cloud failover."),
    "Readable error lists supported cloud env hints when no fallback is ready",
  );

  const multiCloudMessage = readableError("ollama all candidates exhausted", multiCloud);
  assert(
    multiCloudMessage.includes("Ready cloud failover: gemini, openai."),
    "Readable error names actual configured cloud fallbacks",
  );
  assert(
    multiCloudMessage.includes("Check /provider and /doctor if failover should have engaged."),
    "Readable error points operator to provider diagnostics when fallback exists",
  );
  assert(
    !multiCloudMessage.includes("ANTHROPIC_API_KEY is not set"),
    "Readable error no longer hard-codes Anthropic-only fallback guidance",
  );

  const exhaustedMessage = readableError("all candidates exhausted after retries", multiCloud);
  assert(
    exhaustedMessage.includes("All configured LLM providers failed. Ready cloud failover: gemini, openai."),
    "Readable error keeps configured fallback summary for exhausted chains",
  );
}

// ---------------------------------------------------------------------------
// 7. Command Executor - Action Routing
// ---------------------------------------------------------------------------

async function verifyCommandExecutor(): Promise<void> {
  section("7. Command Executor - Action Routing");

  const actions: string[] = [];
  let cleared = 0;
  let budgetCap = 0;
  const selectedProviders: string[] = [];
  const selectedMemoryModes: Array<string | null> = [];

  const handlers = {
    submitChat: async (message: string) => { actions.push(`submit:${message}`); },
    exitApp: () => { actions.push("exit"); },
    resetSession: () => { cleared++; actions.push("reset"); },
    requestCompaction: async (strategy = "standard") => { actions.push(`compact:${strategy}`); },
    setBudgetCap: (maxUsd: number) => { budgetCap = maxUsd; actions.push(`budget:${maxUsd}`); },
    setProviderSelection: async (provider: string) => { selectedProviders.push(provider); actions.push(`provider:${provider}`); },
    setMemoryTruthMode: async (mode: string | null) => { selectedMemoryModes.push(mode); actions.push(`memory:${mode ?? "auto"}`); },
    startSwarm: async (objective: string) => { actions.push(`swarm:${objective}`); return `Started swarm: ${objective}`; },
    cancelSwarm: async (runId: string) => { actions.push(`swarm-cancel:${runId}`); return `Cancelled swarm: ${runId}`; },
    showSystemMessage: (message: string) => { actions.push(`system:${message}`); },
    showErrorMessage: (message: string) => { actions.push(`error:${message}`); },
    cancelRun: () => { actions.push("cancel"); },
    isRunActive: () => false,
    isRunCancelling: () => false,
  };

  const parser = new SlashCommandParser({
    session: {
      sessionId: "ses_test",
      agentId: "assist-ant",
      caste: "assist_ant",
      history: [
        { type: "system", content: "hi" },
        { type: "user", content: "hello" },
        { type: "assistant", content: "one" },
        { type: "user", content: "two" },
        { type: "assistant", content: "three" },
        { type: "user", content: "four" },
      ],
    },
    runtime: {
      provider: "local",
      model: "llama3.2",
      selectedProvider: "local",
      selectedModel: "llama3.2",
      memoryTruthModeOverride: "prefer_exact",
      providerDefaults: {
        anthropic: "claude-sonnet-4-5",
        local: "llama3.2",
      },
      circuitState: "closed",
      pendingCompactionStrategy: "standard",
      availableProviders: ["anthropic", "local"],
      failover: { local: ["anthropic"] },
    },
    workspace: {
      root: process.cwd(),
      name: "colony-ts",
      detected: true,
      projectType: "bun",
      packageManager: "bun",
      workspaceMode: "single-package",
      workspaceGlobs: ["apps/*", "packages/*"],
      workspacePackageCount: 3,
      workspaceAppCount: 1,
      workspaceLibraryCount: 2,
      workspaceOtherCount: 0,
      workspaceAppPackages: ["console"],
      workspaceLibraryPackages: ["runtime-core", "ui-shell"],
      workspaceOtherPackages: [],
      workspaceDevCandidates: ["console: bun --filter console run dev"],
      workspaceVerifyCandidates: ["runtime-core: bun --filter runtime-core run verify:all"],
      workspaceIntent: "terminal-app",
      workspacePrimaryTargets: ["colony-ts"],
      scriptNames: ["dev", "start", "build", "verify:all"],
      devCommand: "bun run --watch src/index.tsx",
      verifyCommand: "bun run verify:all",
      stackHints: ["bun", "react", "ink", "typescript", "zustand"],
    },
  });

  await executeCommand(parser.tryHandle("/help"), handlers);
  assert(actions.some((entry) => entry.startsWith("system:Available Commands")), "Executor: display command routed to system output");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/swarm build api"), handlers);
  assert(actions.some((entry) => entry.includes("Swarm execution requested")), "Executor: /swarm announces orchestrated execution");
  assert(actions.includes("swarm:build api"), "Executor: /swarm starts swarm runtime");
  assert(!actions.includes("submit:build api"), "Executor: /swarm no longer submits chat");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/budget 2.5"), handlers);
  assert(actions.includes("budget:2.5"), "Executor: /budget updates cap");
  assertEqual(budgetCap, 2.5, "Executor: budget cap value preserved");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/provider use anthropic claude-opus-4-6"), handlers);
  assert(actions.includes("provider:anthropic"), "Executor: /provider use routes selected provider to handler");
  assertEqual(selectedProviders.at(-1), "anthropic", "Executor: /provider use preserves resolved provider");
  assert(actions.some((entry) => entry.includes("Provider selection updated:")), "Executor: /provider use emits provider selection message");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/model anthropic claude-sonnet-4-5-20250929"), handlers);
  assert(actions.includes("provider:anthropic"), "Executor: /model routes through provider-selection handler");
  assert(actions.some((entry) => entry.includes("Model selection updated:")), "Executor: /model emits model selection message");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/memory derived"), handlers);
  assert(actions.includes("memory:derived_only"), "Executor: /memory routes through memory-mode handler");
  assertEqual(selectedMemoryModes.at(-1), "derived_only", "Executor: /memory preserves selected truth mode");
  assert(actions.some((entry) => entry.includes("Memory recall mode updated:")), "Executor: /memory emits memory update message");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/cancel"), handlers);
  assert(!actions.includes("cancel"), "Executor: idle /cancel does not fire cancel handler");
  assert(actions.some((entry) => entry.includes("No active Colony run to cancel")), "Executor: idle /cancel reports no active run");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/compact"), handlers);
  assert(actions.includes("compact:standard"), "Executor: /compact triggers standard compaction");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/compact reactive"), handlers);
  assert(actions.includes("compact:reactive"), "Executor: /compact reactive triggers reactive compaction");

  actions.length = 0;
  const smartCompactParser = new SlashCommandParser({
    session: {
      sessionId: "ses_smart_compact",
      agentId: "assist-ant",
      caste: "assist_ant",
      history: [
        { type: "system", content: "sys" },
        { type: "user", content: "read file" },
        { type: "tool_result", toolCallId: "tool_1", name: "file_read", content: "line\n".repeat(1600), isError: false, executionTimeMs: 8 },
        { type: "assistant", content: "captured old file output" },
        { type: "user", content: "keep latest turn intact" },
        { type: "assistant", content: "latest answer" },
      ],
    },
    contextUsage: {
      usedTokens: 148_000,
      maxTokens: 200_000,
      remainingTokens: 52_000,
      percentUsed: 74,
      messageCount: 6,
      isAboveWarningThreshold: true,
      isAboveAutoCompactThreshold: false,
      isAtBlockingLimit: false,
      compactionFailureCount: 0,
    },
  });
  await executeCommand(smartCompactParser.tryHandle("/compact smart"), handlers);
  assert(actions.some((entry) => entry.includes("Running smart compaction (micro)")), "Executor: /compact smart keeps resolved preflight visible");
  assert(actions.includes("compact:micro"), "Executor: /compact smart resolves to the recommended strategy before runtime handler");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/status"), handlers);
  assert(actions.some((entry) => entry.includes("Queued compaction: standard")), "Executor: /status shows queued compaction");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/clear"), handlers);
  assert(actions.includes("reset"), "Executor: /clear resets session");
  assert(cleared > 0, "Executor: reset handler called");

  actions.length = 0;
  const busyHandlers = {
    ...handlers,
    isRunActive: () => true,
  };
  await executeCommand(parser.tryHandle("/clear"), busyHandlers);
  assert(!actions.includes("reset"), "Executor: busy /clear does not reset session");
  assert(actions.some((entry) => entry.includes("Use /cancel, Ctrl+C, or Esc first")), "Executor: busy /clear emits guard message");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/swarm build api"), busyHandlers);
  assert(actions.some((entry) => entry.includes("Swarm execution requested")), "Executor: busy /swarm announces orchestrated execution");
  assert(actions.includes("swarm:build api"), "Executor: busy /swarm still starts swarm runtime");
  assert(!actions.includes("submit:build api"), "Executor: busy /swarm does not submit chat");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/cancel"), busyHandlers);
  assert(actions.includes("cancel"), "Executor: busy /cancel fires cancel handler");
  assert(actions.some((entry) => entry.includes("Canceling active Colony run")), "Executor: busy /cancel emits cancellation message");

  actions.length = 0;
  const cancellingHandlers = {
    ...handlers,
    isRunActive: () => true,
    isRunCancelling: () => true,
  };
  await executeCommand(parser.tryHandle("/cancel"), cancellingHandlers);
  assert(!actions.includes("cancel"), "Executor: stopping /cancel does not refire cancel handler");
  assert(actions.some((entry) => entry.includes("Cancellation already in progress")), "Executor: stopping /cancel reports in-flight cancellation");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/clear"), cancellingHandlers);
  assert(!actions.includes("reset"), "Executor: stopping /clear does not reset session");
  assert(actions.some((entry) => entry.includes("run is stopping")), "Executor: stopping /clear reports cancel-drain guard");

  actions.length = 0;
  await executeCommand(parser.tryHandle("/bogus"), handlers);
  assert(actions.some((entry) => entry.startsWith("error:Unknown command")), "Executor: unknown command routes to error output");
}

async function verifyApprovalUxGuards(): Promise<void> {
  section("8. Approval UX Guards");

  const appSource = await Bun.file("./src/ui/app.tsx").text();
  const componentSource = await Bun.file("./src/ui/components.tsx").text();
  const loopHookSource = await Bun.file("./src/ui/use-colony-loop.ts").text();

  const unsavedCurrentShortcuts = buildLiveSessionShortcutSnapshot({
    currentSessionId: "ses_live_current",
    currentMessageCount: 3,
    currentLatestMessageTimestamp: Date.parse("2026-04-21T13:00:00.000Z"),
    currentAwaitingReply: true,
    persistedSessions: [
      {
        sessionId: "ses_saved_latest",
        agentId: "saved-agent",
        caste: "assist_ant",
        provider: "anthropic",
        model: "claude-opus-4-6",
        savedAt: "2026-04-21T12:00:00.000Z",
        lastMessageAt: "2026-04-21T12:00:00.000Z",
        messageCount: 8,
        tokensUsed: 1000,
        costUsd: 0.01,
        interruption: "none",
        hasCheckpoint: true,
        previewText: "saved latest",
        previewRole: "assistant",
      },
    ],
  });
  assertEqual(resolveSmartHistoryCommand(unsavedCurrentShortcuts, 8), "/history current 8", "Session shortcuts: smart history prefers live current transcript");
  assertEqual(resolveSmartResumeCommand(unsavedCurrentShortcuts), "/resume latest", "Session shortcuts: smart resume still points at latest persisted session");
  assertEqual(buildLiveCurrentHistoryHint(unsavedCurrentShortcuts, 8), "/history current 8 | /history pending 8 | /history latest 8 | /history ses_live_current 8", "Session shortcuts: live history hint keeps current, pending, latest, and exact-id paths");
  assertEqual(buildLiveCurrentResumeHint(unsavedCurrentShortcuts), "/status | /cost | /clear", "Session shortcuts: unsaved live current row stops advertising fake resume commands");
  assertEqual(buildPersistedSessionResumeHint({
    sessionId: "ses_saved_latest",
    sessionCatalogIndex: 1,
    currentTarget: false,
    snapshot: unsavedCurrentShortcuts,
  }), "/resume latest | /resume 1 | /resume ses_saved_latest", "Session shortcuts: latest persisted row keeps truthful latest and direct resume targets");
  assertEqual(buildPersistedSessionHistoryHint({
    sessionId: "ses_saved_latest",
    sessionCatalogIndex: 1,
    currentTarget: false,
    snapshot: unsavedCurrentShortcuts,
    count: 8,
  }), "/history 1 8 | /history ses_saved_latest 8", "Session shortcuts: persisted rows do not claim live-current aliases when current owns them");

  const resumedCurrentShortcuts = buildLiveSessionShortcutSnapshot({
    currentSessionId: "ses_saved_latest",
    currentMessageCount: 4,
    currentLatestMessageTimestamp: Date.parse("2026-04-21T12:00:00.000Z"),
    currentAwaitingReply: false,
    persistedSessions: [
      {
        sessionId: "ses_saved_latest",
        agentId: "saved-agent",
        caste: "assist_ant",
        provider: "anthropic",
        model: "claude-opus-4-6",
        savedAt: "2026-04-21T12:00:00.000Z",
        lastMessageAt: "2026-04-21T12:00:00.000Z",
        messageCount: 8,
        tokensUsed: 1000,
        costUsd: 0.01,
        interruption: "none",
        hasCheckpoint: true,
        previewText: "saved latest",
        previewRole: "assistant",
      },
    ],
  });
  assertEqual(buildLiveCurrentResumeHint(resumedCurrentShortcuts), "/resume latest | /resume ses_saved_latest | /status | /cost | /clear", "Session shortcuts: resumed current row advertises truthful latest and exact-id resume targets");

  const deniedRequest = buildApprovalRequest(
    { id: "call-denied", name: "shell_exec", arguments: { command: "sudo rm -rf /tmp/test" } },
    { sessionId: "ses_verify", agentId: "shield-ant", caste: "shield-ant" },
  );
  const deniedMessage = formatDeniedToolResultMessage({
    approved: false,
    request: deniedRequest,
    decision: createApprovalDecision(deniedRequest.requestId, "deny", {
      reason: "Operator denied destructive shell command.",
    }),
    arguments: deniedRequest.arguments,
    deniedBeforePrompt: false,
  });
  const parsedDenied = parseDeniedToolResultMessage(deniedMessage);
  assert(parsedDenied !== null, "Denied tool-result parser accepts formatted approval denial");
  assertEqual(parsedDenied?.status, "Denied by operator.", "Denied tool-result parser preserves operator-denied status");
  assertEqual(parsedDenied?.riskLevel, "high", "Denied tool-result parser preserves risk level");
  assertEqual(parsedDenied?.category, "shell", "Denied tool-result parser preserves tool category");

  const cancelledMessage = formatDeniedToolResultMessage({
    approved: false,
    request: deniedRequest,
    decision: createApprovalDecision(deniedRequest.requestId, "cancel", {
      reason: "Operator cancelled approval prompt.",
    }),
    arguments: deniedRequest.arguments,
    deniedBeforePrompt: false,
  });
  assertEqual(
    parseDeniedToolResultMessage(cancelledMessage)?.status,
    "Cancelled by operator.",
    "Denied tool-result parser preserves cancellation status",
  );

  const pendingApprovalMessage = formatPendingApprovalMessage(deniedRequest);
  const parsedPendingApproval = parsePendingApprovalMessage(pendingApprovalMessage);
  assert(parsedPendingApproval !== null, "Pending approval parser accepts structured inspection message");
  assertEqual(parsedPendingApproval?.status, "Approval required.", "Pending approval parser preserves status");
  assertEqual(parsedPendingApproval?.riskLevel, "high", "Pending approval parser preserves risk level");
  assertEqual(parsedPendingApproval?.category, "shell", "Pending approval parser preserves category");
  assert((parsedPendingApproval?.details.length ?? 0) > 0, "Pending approval parser preserves detail lines");
  assertEqual(
    parsedPendingApproval?.warnings.length ?? 0,
    deniedRequest.warnings.length,
    "Pending approval parser preserves warning lines",
  );

  assert(appSource.includes("const inputLocked = Boolean(pendingApproval);"), "App derives input lock from pending approval");
  assert(appSource.includes("Approval pending for ${pendingTool}. Use y/n/a/esc to resolve it, or press s for details."), "Pending-approval submit guard explains exact resolution options");
  assert(appSource.includes("if (inputLocked && !(key.pageUp || key.pageDown || (key.ctrl && lowerInput === \"l\"))) {"), "App limits modal-time shortcuts to transcript navigation");
  assert(appSource.includes("}, { isActive: isRawModeSupported });"), "App keeps transcript navigation hotkeys active during approval modal");
  assert(appSource.includes("focus={!inputLocked}"), "Text input focus follows approval lock");
  assert(appSource.includes("showCursor={!inputLocked}"), "Text input cursor hides while approval prompt active");
  assert(appSource.includes("Approval pending: y once, n deny, a exact-call, s inspect, esc cancel"), "Locked input placeholder explains approval shortcuts");
  assert(appSource.includes("const currentSessionId = useColonyStore((state) => state.sessionId);"), "Input panel uses targeted selector for live current session id");
  assert(appSource.includes("const startupReport = useColonyStore((state) => state.startupReport);"), "Input panel uses targeted selector for startup report");
  assert(appSource.includes("buildLiveSessionShortcutSnapshot({"), "App builds live session shortcut snapshot through shared helper");
  assert(appSource.includes("resolveSmartHistoryCommand(shortcuts, 8);"), "App routes smart history shortcut through shared session helper");
  assert(appSource.includes("resolveSmartResumeCommand(shortcuts);"), "App routes smart resume shortcut through shared session helper");
  assert(appSource.includes("const activeHistoryHint = buildLiveCurrentHistoryHint(liveSessionShortcuts, 8);"), "Panels compute live history hint through shared session helper");
  assert(!appSource.includes("function buildLiveHistoryHint(options:"), "App no longer duplicates live history helper logic inline");
  assert(appSource.includes("const startupPlaceholder = formatStartupPlaceholder(startupReport);"), "Input panel derives startup block placeholder from startup report");
  assert(appSource.includes("const interruptRequested = useColonyStore((state) => state.interruptRequested);"), "Panels use targeted selector for interrupt-in-progress truth");
  assert(appSource.includes("Stopping current run... /status /cost ${activeHistoryHint}"), "Input placeholder explains stopping-run state with exact inspect commands");
  assert(appSource.includes("Streaming response... /cancel or Ctrl+C/Esc stops | /status /cost ${activeHistoryHint}"), "Active-run placeholder explains exact current-session inspection commands");
  assert(appSource.includes("Run active... /cancel or Ctrl+C/Esc stops | /status /cost ${activeHistoryHint}"), "Paused active-run placeholder keeps exact current-session inspection commands visible");
  assert(appSource.includes(": startupPlaceholder"), "Idle input placeholder switches to startup-block guidance when readiness errors exist");
  assert(appSource.includes("activeHistoryHint={activeHistoryHint}"), "Status panel passes shared live history hint into status bar");
  assert(componentSource.includes("activeHistoryHint = \"/history current 8\""), "Status bar accepts resolved live history hint prop");
  assert(componentSource.includes("Stopping current run...{queuedPromptCount > 0 ? ` | next:${queuedPromptPreview ?? \"queued prompt\"}` : \"\"} | /status /cost | {activeHistoryHint}"), "Status bar surfaces stopping-run truth with exact current-session inspect commands");
  assert(componentSource.includes("... {thinkingLabel}{queuedPromptCount > 0 ? ` | next:${queuedPromptPreview ?? \"queued prompt\"}` : \"\"} | /cancel /status /cost | {activeHistoryHint}"), "Status bar surfaces exact current-session inspect commands during streaming");
  assert(componentSource.includes("Run active{queuedPromptCount > 0 ? ` | next:${queuedPromptPreview ?? \"queued prompt\"}` : \"\"} | /cancel /status /cost | {activeHistoryHint}"), "Status bar keeps exact current-session inspect commands visible when run is active but not thinking");
  assert(componentSource.includes("run:{provider}:{model}"), "Status bar surfaces current runtime provider/model");
  assert(componentSource.includes("next:{selectedProvider}:{selectedModel}"), "Status bar surfaces pending next-run provider/model selection");
  assert(componentSource.includes("memory:{memoryLabel} /memory"), "Status bar surfaces current memory recall mode");
  assert(componentSource.includes("Approval: {pendingApprovalTool} pending (y/n/a/s/esc | /tools)"), "Status bar surfaces pending approval tool, shortcuts, and /tools inspect path");
  assert(componentSource.includes("doctor:E${startupErrors}/W${startupWarnings} ${startupInspectCommand ?? \"/doctor\"}"), "Status bar points operators to the focused /doctor view when startup issues exist");
  assert(componentSource.includes("run:</Text>"), "Header labels current runtime provider/model");
  assert(componentSource.includes("next:{selectedProvider}:{selectedModel}"), "Header can surface pending next-run provider/model selection");
  assert(componentSource.includes("Input paused while approval prompt is active."), "Approval prompt explains modal input pause");
  assert(componentSource.includes("Transcript scroll still works: PgUp older | PgDn newer | Ctrl+L latest"), "Approval prompt advertises transcript navigation while input is paused");
  assert(componentSource.includes("if (value === \"s\") onInspect?.();"), "Approval prompt supports in-band inspect shortcut");
  assert(componentSource.includes("category: {request.category}"), "Approval prompt surfaces tool category");
  assert(componentSource.includes("reason: {request.reason}"), "Approval prompt surfaces policy reason");
  assert(componentSource.includes("session allow matches this exact signature only"), "Approval prompt explains exact-call session scope");
  assert(componentSource.includes("signature: {request.signature}"), "Approval prompt surfaces exact approval signature");
  assert(componentSource.includes("s inspect details"), "Approval prompt advertises inspect shortcut");
  assert(componentSource.includes("request.details"), "Approval prompt surfaces structured request details");
  assert(componentSource.includes("(message.role === \"tool\" || message.role === \"error\" || message.role === \"system\")"), "Log entry renders tool-stamped approval outcomes through tool display");
  assert(componentSource.includes("error={message.role === \"tool\" ? undefined : message.content}"), "Tool display accepts structured tool denials and cancellations");
  assert(componentSource.includes("export const LogEntry = React.memo(function LogEntry"), "LogEntry uses React.memo to avoid repainting unchanged rows");
  assert(componentSource.includes("export const LogPane = React.memo(function LogPane"), "LogPane uses React.memo to limit parent-driven transcript redraws");
  assert(componentSource.includes("React.useMemo(() => {"), "LogPane memoizes transcript viewport calculations");
  assert(componentSource.includes("export function summarizeTranscriptDisplayText("), "Face layer exposes bounded transcript display helper");
  assert(componentSource.includes("const contentPreview = summarizeTranscriptDisplayText(message.content);"), "Log entry builds bounded display preview for transcript rows");
  assert(componentSource.includes("more chars hidden in face | transcript truth kept"), "Transcript rows tell truth when face clamps oversized content");
  assert(componentSource.includes("const currentSessionPreview = summarizeTranscriptDisplayText(currentPreviewText, 240, 3);"), "Budget widget bounds live current preview text");
  assert(componentSource.includes("const savedSessionPreview = summarizeTranscriptDisplayText(session.previewText ?? \"\", 240, 3);"), "Budget widget bounds persisted session preview text");
  assert(!appSource.includes("const state = useColonyStore();"), "App no longer subscribes to the entire view store");
  assert(appSource.includes("const activeRun = useColonyStore((state) => Boolean(state.activeRunId));"), "App uses targeted selector for active-run truth in face panels");
  assert(appSource.includes("const pendingApproval = useColonyStore((state) => state.pendingApproval);"), "App uses targeted selector for approval state");
  assert(appSource.includes("const pendingApprovalTool = useColonyStore((state) => state.pendingApproval?.toolName ?? null);"), "Status panel uses targeted selector for pending approval tool");
  assert(appSource.includes("const messages = useColonyStore((state) => state.messages);"), "Log panel uses targeted selector for transcript");
  assert(appSource.includes("key.pageUp"), "App binds PgUp for transcript scrollback");
  assert(appSource.includes("key.pageDown"), "App binds PgDn for transcript scrollback");
  assert(appSource.includes("resetLogScroll();"), "App binds Ctrl+L to jump back to latest transcript");
  assert(appSource.includes("const sessionNavAction = resolveSessionNavAction(input, key);"), "App routes session-nav shortcuts through shared helper");
  assert(appSource.includes("case \"sessions\":"), "App handles session catalog shortcut action");
  assert(appSource.includes("case \"history\":"), "App handles smart history shortcut action");
  assert(appSource.includes("case \"resume\":"), "App handles smart resume shortcut action");
  assert(appSource.includes("handleSubmit(\"/sessions\");"), "App session-nav shortcut opens session catalog");
  assert(appSource.includes("const command = resolveSmartHistoryCommand(shortcuts, 8);"), "App smart history shortcut resolves through shared live-session helper");
  assert(appSource.includes("const command = resolveSmartResumeCommand(shortcuts);"), "App smart resume shortcut resolves through shared live-session helper");
  assert(appSource.includes("if (useColonyStore.getState().interruptRequested) {"), "App blocks repeated Ctrl+C while cancellation is already in progress");
  assert(appSource.includes("Cancellation already in progress."), "App tells operator when cancellation is already underway");
  assert(appSource.includes("if (key.escape && useColonyStore.getState().activeRunId && !useColonyStore.getState().interruptRequested)"), "App ignores repeated Esc once cancellation is already underway");
  assertEqual(resolveSessionNavAction("j", { ctrl: true }), "sessions", "Session-nav helper: Ctrl+J opens session catalog");
  assertEqual(resolveSessionNavAction("g", { ctrl: true }), "history", "Session-nav helper: Ctrl+G opens smart history");
  assertEqual(resolveSessionNavAction("r", { ctrl: true }), "resume", "Session-nav helper: Ctrl+R opens smart resume");
  assertEqual(resolveSessionNavAction("h", { ctrl: true }), null, "Session-nav helper: Ctrl+H no longer collides with Backspace");
  assertEqual(resolveSessionNavAction("g", { ctrl: false }), null, "Session-nav helper: plain G does not trigger history nav");
  assert(componentSource.includes("Transcript {start + 1}-{end} of {messages.length} | PgUp older | PgDn newer | Ctrl+L latest"), "Log pane renders transcript viewport banner");
  assert(componentSource.includes("Scroll: PgUp older | PgDn newer | Ctrl+L latest"), "Welcome banner advertises transcript scroll controls");
  assert(componentSource.includes("Nav: {SESSION_NAV_LABEL}"), "Welcome banner uses shared session navigation label");
  assertEqual(SESSION_NAV_LABEL, "Ctrl+J sessions | Ctrl+G history | Ctrl+R resume smart", "Session-nav label uses non-Backspace history chord");
  assert(componentSource.includes("Commands: /help, /status, /cost, /sessions, /history, /resume"), "Welcome banner advertises transcript/session commands");
  assert(componentSource.includes("Session views: /sessions pending|current | /history latest|pending|current | /resume latest|pending"), "Welcome banner advertises saved-session filters and aliases");
  assert(componentSource.includes("Runtime: /doctor, /provider, /model, /memory, /workflow, /perf, /permissions, /tools, /hooks, /events, /events perf, /budget, /compact smart, /cancel"), "Welcome banner advertises memory, workflow, and unified /perf on runtime control surface");
  assert(componentSource.includes("Memory recall: {memoryLabel} | /memory auto|exact|derived|balanced|prefer-exact|prefer-derived"), "Welcome banner advertises current memory recall mode and controls");
  assert(componentSource.includes("Policy views: /permissions active|allowed|denied|rules | /tools approvals|recent|artifacts|perf"), "Welcome banner advertises permission and tool drill-down views");
  assert(appSource.includes("const pendingCompactionStrategy = useColonyStore((state) => state.pendingCompactionStrategy);"), "Panels use targeted selector for queued compaction");
  assert(appSource.includes("const lastCompactionFailure = useColonyStore((state) => state.lastCompactionFailure);"), "Budget panel uses targeted selector for last compaction failure");
  assert(appSource.includes("const currentMessages = useColonyStore((state) => state.messages);"), "Budget panel reads live transcript for smart compaction recommendation");
  assert(appSource.includes("function buildCompactionRecommendationHistory("), "App defines bounded history helper for budget compaction recommendation");
  assert(appSource.includes("history: buildCompactionRecommendationHistory(currentMessages)"), "Face recommendation uses bounded live transcript history for long-session performance");
  assert(appSource.includes("const currentSessionId = useColonyStore((state) => state.sessionId);"), "Status panel uses targeted selector for live current session id");
  assert(appSource.includes("const selectedProvider = useColonyStore((state) => state.selectedProvider);"), "App uses targeted selector for selected provider truth in face panels");
  assert(appSource.includes("const selectedModel = useColonyStore((state) => state.selectedModel);"), "App uses targeted selector for selected model truth in face panels");
  assert(appSource.includes("const memoryTruthModeOverride = useColonyStore((state) => state.memoryTruthModeOverride);"), "App uses targeted selector for memory recall truth in face panels");
  assert(appSource.includes("selectedProvider={selectedProvider}"), "App forwards selected provider truth into face panels");
  assert(appSource.includes("selectedModel={selectedModel}"), "App forwards selected model truth into face panels");
  assert(appSource.includes("memoryTruthModeOverride={memoryTruthModeOverride}"), "App forwards memory recall truth into face panels");
  assert(appSource.includes("const pendingApprovalSnapshot: typeof pendingApproval = useColonyStore.getState().pendingApproval;"), "App caches typed pending approval snapshot for slash-context forwarding");
  assert(appSource.includes("toolName: pendingApprovalSnapshot?.toolName"), "App forwards pending approval tool name to slash context");
  assert(appSource.includes("signature: pendingApprovalSnapshot?.signature"), "App forwards pending approval signature to slash context");
  assert(appSource.includes("sessionRules: store.sessionAllowRules"), "App forwards exact-signature session rules to slash context");
  assert(appSource.includes("activeRun: Boolean(store.activeRunId || store.interruptRequested)"), "App forwards stopping-aware active-run truth to slash context");
  assert(appSource.includes("selectedProvider: runtimeSummary.defaultProvider"), "App forwards selected provider to slash context");
  assert(appSource.includes("selectedModel: runtimeSummary.defaultModel"), "App forwards selected model to slash context");
  assert(appSource.includes("providerDefaults: runtimeSummary.providerDefaults"), "App forwards configured provider default models to slash context");
  assert(appSource.includes("hookRunner: {"), "App forwards hook summary into slash context");
  assert(appSource.includes("supportedKinds: runtimeSummary.supportedHookKinds"), "App forwards supported hook kinds into slash context");
  assert(appSource.includes("recentEvents: recentHookEvents.map((event) => ({ ...event }))"), "App forwards recent hook events into slash context");
  assert(appSource.includes("setProviderSelection,"), "App passes provider-selection handler into command executor");
  assert(appSource.includes("isRunActive: () => Boolean(useColonyStore.getState().activeRunId || useColonyStore.getState().interruptRequested)"), "Command executor guard treats stopping runs as still active");
  assert(!appSource.includes("Rule list: ${current.sessionAllowRules.join(\", \")}"), "App no longer patches /permissions output in the UI layer");
  assert(appSource.includes("formatPendingApprovalMessage(request)"), "App uses shared pending-approval formatter for inspect transcript");
  assert(appSource.includes("toolName: request.toolName"), "Approval inspect action keeps blocked tool identity on transcript entry");
  assert(appSource.includes("toolArgs: { ...request.arguments }"), "App keeps exact tool arguments on inspected approval transcript entries");
  assert(appSource.includes("onInspect={inspectPendingApproval}"), "App wires approval inspect action into modal");
  assert(componentSource.includes("Compact queued: {pendingCompactionStrategy}"), "Budget widget surfaces queued compaction");
  assert(componentSource.includes("compact:{pendingCompactionStrategy} queued"), "Status bar surfaces queued compaction");
  assert(componentSource.includes("toolCount > 0"), "Status bar only advertises /tools shortcut when tools are active");
  assert(componentSource.includes("`${toolCount} active tools /tools`"), "Status bar points operators to /tools for active tool inspection");
  assert(componentSource.includes("hooks:{recentHookCount} /hooks"), "Status bar surfaces recent hook activity and /hooks path");
  assert(componentSource.includes("export function summarizeRecentToolActivity("), "Face layer exposes shared recent-tool activity helper");
  assert(componentSource.includes("parsePendingApprovalMessage(message.content)"), "Recent-tool helper understands pending approval transcript entries");
  assert(componentSource.includes("parseDeniedToolResultMessage(message.content)"), "Recent-tool helper understands denied tool transcript entries");
  assert(componentSource.includes("parsePersistedToolResultMessage(message.content)"), "Recent-tool helper understands externalized tool transcript entries");
  assert(appSource.includes("recommendCompaction({"), "App uses shared smart-compaction helper for face recommendation");
  assert(!appSource.includes("history: currentMessages.map(logMessageToSerializedMessage)"), "Face recommendation no longer scans the full live transcript for budget hints");
  assert(appSource.includes("const recentToolActivity = React.useMemo("), "App memoizes recent live tool activity for budget panel");
  assert(appSource.includes("summarizeRecentToolActivity(currentMessages, 3)"), "App derives recent tool activity from live transcript");
  assert(appSource.includes("const recentHookEvents = useColonyStore((state) => state.recentHookEvents);"), "Panels use targeted selector for recent hook events");
  assert(appSource.includes("compactionRecommendationStrategy={compactionRecommendation.strategy}"), "App forwards smart compaction strategy into budget widget");
  assert(appSource.includes("microCandidateCount={compactionRecommendation.microCandidateCount}"), "App forwards micro candidate count into budget widget");
  assert(appSource.includes("lastCompactionFailure={lastCompactionFailure}"), "App forwards last compaction failure into budget widget");
  assert(appSource.includes("const latestCompactionHandoff = useColonyStore((state) => state.latestCompactionHandoff);"), "Panels use targeted selector for latest compaction handoff");
  assert(appSource.includes("latestCompactionHandoff={latestCompactionHandoff}"), "App forwards latest compaction handoff into budget widget");
  assert(appSource.includes("pendingApprovalToolName={pendingApprovalToolName}"), "App forwards pending approval tool into budget widget");
  assert(appSource.includes("pendingApprovalRiskLevel={pendingApprovalRiskLevel}"), "App forwards pending approval risk into budget widget");
  assert(appSource.includes("pendingApprovalSummary={pendingApprovalSummary}"), "App forwards pending approval summary into budget widget");
  assert(appSource.includes("recentToolActivity={recentToolActivity}"), "App forwards recent live tool activity into budget widget");
  assert(appSource.includes("recentHookEvents={recentHookEvents}"), "App forwards recent hook events into budget widget");
  assert(componentSource.includes("Compaction next: /compact smart -> ${compactionRecommendationStrategy}"), "Budget widget surfaces smart compaction command");
  assert(componentSource.includes("Compaction next: hold"), "Budget widget can recommend holding compaction");
  assert(componentSource.includes("Micro candidates: {microCandidateCount} older tool results (~{microTokensSavedEstimate}t)"), "Budget widget surfaces micro candidate details");
  assert(componentSource.includes("Tools: {recentToolActivity.length > 0 ? `/tools (${recentToolActivity.length} recent)` : \"/tools\"}"), "Budget widget surfaces tool panel entry point");
  assert(componentSource.includes("Inspect: /tools | /tools approvals | /tools recent | /tools artifacts | /tools perf"), "Budget widget surfaces tool drill-down hints");
  assert(componentSource.includes("Approval: {pendingApprovalToolName} | {pendingApprovalRiskLevel ?? \"unknown\"} | {pendingApprovalSummary ?? \"pending\"}"), "Budget widget surfaces pending approval detail");
  assert(componentSource.includes("Approval: none pending"), "Budget widget tells truth when no approval is pending");
  assert(componentSource.includes("{index + 1}. {activity.toolName} | {activity.status}"), "Budget widget surfaces recent live tool outcomes");
  assert(componentSource.includes("reopen: /artifact \"{activity.artifactPath}\""), "Budget widget surfaces exact artifact reopen path for recent tool activity");
  assert(componentSource.includes("Recent tools: none in live transcript"), "Budget widget tells truth when no live tool activity exists");
  assert(componentSource.includes("Hooks: {recentHookEvents.length > 0 ? `/hooks (${recentHookEvents.length} recent)` : \"/hooks\"}"), "Budget widget surfaces hook panel entry point");
  assert(componentSource.includes("Inspect: /hooks | /hooks recent | /hooks perf | /hooks kinds"), "Budget widget surfaces hook drill-down hints");
  assert(componentSource.includes("Events: /events | /events failures | /events perf"), "Budget widget surfaces unified runtime-event drill-down hint");
  assert(componentSource.includes("event.durationMs ? ` | ${event.durationMs}ms` : \"\""), "Budget widget surfaces hook duration when available");
  assert(componentSource.includes("{index + 1}. {event.kind}{event.detail ? ` | ${event.detail}` : \"\"}{event.durationMs ? ` | ${event.durationMs}ms` : \"\"} | {new Date(event.timestamp).toISOString()}"), "Budget widget surfaces recent live hook events");
  assert(componentSource.includes("Recent hooks: none in live runtime"), "Budget widget tells truth when no hook activity exists");
  assert(componentSource.includes("Why: {compactionRecommendationReason}"), "Budget widget surfaces smart compaction reason");
  assert(componentSource.includes("Inspect: /compact status | /compact recent | /compact handoff"), "Budget widget surfaces compaction handoff inspect path");
  assert(componentSource.includes("Last fail: {lastCompactionFailure.strategy} | {lastCompactionFailure.message}"), "Budget widget surfaces last compaction failure detail");
  assert(componentSource.includes("Handoff: {latestCompactionHandoff.status} | {latestCompactionHandoff.strategy}/{latestCompactionHandoff.trigger} | {latestCompactionHandoff.loggedCount} logged | {latestCompactionHandoff.structuredCount} structured"), "Budget widget surfaces latest compaction handoff summary");
  assert(componentSource.includes("Before {((lastCompaction.usageBeforeFraction ?? 0) * 100).toFixed(1)}%"), "Budget widget surfaces before-usage for last compaction");
  assert(componentSource.includes("${lastCompaction.originalCount}->${lastCompaction.finalCount}"), "Budget widget surfaces message-count delta for last compaction");
  assert(componentSource.includes("LLM now: {provider}:{model}"), "Budget widget surfaces current provider/model truth");
  assert(componentSource.includes("LLM next: {selectedProvider}:{selectedModel}"), "Budget widget surfaces pending next-run provider/model truth");
  assert(componentSource.includes("LLM next: same as current"), "Budget widget tells truth when no provider/model change is pending");
  assert(componentSource.includes("Memory: {memoryLabel} | /memory"), "Budget widget surfaces current memory recall truth");
  assert(componentSource.includes("Workspace detail: ${workspaceInfo.workspaceMode ?? \"single-package\"} | ${workspaceInfo.stackHints.join(\", \")}"), "Budget widget surfaces workspace mode and stack hints");
  assert(componentSource.includes("Intent: ${workspaceInfo.workspaceIntent}"), "Budget widget surfaces workspace intent");
  assert(componentSource.includes("Targets: ${workspaceInfo.workspacePrimaryTargets.slice(0, 3).join(\", \")}"), "Budget widget surfaces workspace primary targets");
  assert(componentSource.includes("Workspace shape: ${workspaceInfo.workspacePackageCount} total | ${workspaceInfo.workspaceAppCount ?? 0} app | ${workspaceInfo.workspaceLibraryCount ?? 0} lib | ${workspaceInfo.workspaceOtherCount ?? 0} other"), "Budget widget surfaces workspace package counts");
  assert(componentSource.includes("Apps: ${workspaceInfo.workspaceAppPackages.slice(0, 3).join(\", \")}"), "Budget widget surfaces workspace app package names");
  assert(componentSource.includes("Libs: ${workspaceInfo.workspaceLibraryPackages.slice(0, 3).join(\", \")}"), "Budget widget surfaces workspace library package names");
  assert(componentSource.includes("Other packages: ${workspaceInfo.workspaceOtherPackages.slice(0, 3).join(\", \")}"), "Budget widget surfaces workspace other package names");
  assert(componentSource.includes("Dev picks: ${workspaceInfo.workspaceDevCandidates.slice(0, 2).join(\" | \")}"), "Budget widget surfaces workspace dev candidate commands");
  assert(componentSource.includes("Verify picks: ${workspaceInfo.workspaceVerifyCandidates.slice(0, 2).join(\" | \")}"), "Budget widget surfaces workspace verify candidate commands");
  assert(componentSource.includes("Workspaces: ${workspaceInfo.workspaceGlobs.join(\", \")}"), "Budget widget surfaces workspace globs");
  assert(componentSource.includes("Scripts: ${workspaceInfo.scriptNames.slice(0, 4).join(\", \")}"), "Budget widget surfaces key workspace scripts");
  assert(componentSource.includes("Inspect: /workspace | /workspace packages | /workspace dev | /workspace verify"), "Budget widget surfaces workspace drill-down hints");
  assert(componentSource.includes("{check.severity}: {check.name} - {check.message}"), "Budget widget surfaces startup issue message detail");
  assert(componentSource.includes("fix: {check.fix}"), "Budget widget surfaces startup fix detail");
  assert(componentSource.includes("Provider focus: {currentProviderSummary}"), "Budget widget surfaces current provider diagnostics focus");
  assert(componentSource.includes("Focus: {startupFocusCommand} | /doctor first-run"), "Budget widget surfaces focused startup doctor hint");
  assert(componentSource.includes("Inspect: {startupInspectLine} | /doctor workspace | /doctor config | /doctor data | /doctor terminal | /doctor local | /doctor cloud | /doctor providers | /doctor failovers"), "Budget widget surfaces doctor drill-down hints");
  assert(componentSource.includes("Latest failover: {formatProviderFailoverFace({"), "Budget widget surfaces latest failover summary in doctor panel");
  assert(componentSource.includes("Latest error: {latestFailover.errorMessage}"), "Budget widget surfaces latest failover error detail in doctor panel");
  assert(componentSource.includes("Recent failovers: {recentFailoverHistory.length} | /doctor failovers"), "Budget widget surfaces failover-history drill-down hint");
  assert(componentSource.includes("{index + 1}. {formatProviderFailoverFace({"), "Budget widget surfaces recent failover history entries");
  assert(componentSource.includes("Recovery: circuit open | /provider current | /provider failovers | /doctor ${provider}"), "Budget widget surfaces circuit-open recovery path");
  assert(componentSource.includes("Recovery: /provider current | /provider failovers | /doctor ${provider}"), "Budget widget surfaces failover recovery path");
  assert(componentSource.includes("Recovery: /doctor ${provider} | /provider ${provider}"), "Budget widget surfaces provider-specific doctor recovery path");
  assert(componentSource.includes("Inspect: /provider | /provider current | /provider perf | /provider failovers"), "Budget widget surfaces provider drill-down hints when provider health needs attention");
  assert(componentSource.includes("const providerFailoverCounts = recentFailovers.reduce<Record<string, number>>"), "Budget widget counts recent failovers per provider for focused operator hints");
  assert(componentSource.includes("const providerAttentionEntries = providerEntries.filter(([providerName, health]) => {"), "Budget widget narrows provider attention list for focused inspect hints");
  assert(componentSource.includes("Inspect: /provider | /provider {provider} | /provider perf {provider} | /provider failovers {provider} | /model | /status"), "Budget widget surfaces exact current-provider inspect path");
  assert(componentSource.includes("` / recent ${providerFailoverCounts[providerName]}`"), "Budget widget surfaces recent failover counts beside provider health rows");
  assert(componentSource.includes("inspect {providerName}: /provider {providerName} | /provider perf {providerName} | /provider failovers {providerName} | /doctor {providerName}"), "Budget widget surfaces focused per-provider inspect paths");
  assert(componentSource.includes("buildLiveSessionShortcutSnapshot({"), "Budget widget builds live-session shortcut snapshot through shared helper");
  assert(componentSource.includes("const currentTarget = currentSessionId && currentSessionId === session.sessionId;"), "Budget widget detects when a persisted row is also the active current session");
  assert(componentSource.includes("const hasUnsavedCurrentSession = Boolean("), "Budget widget detects unsaved live current session");
  assert(componentSource.includes("currentAwaitingReply ? \"awaiting reply\" : \"unsaved current\""), "Budget widget derives live current state from transcript tail");
  assert(componentSource.includes("liveSessionShortcuts.currentOwnsLatestHistoryAlias ? \"latest live\" : null"), "Budget widget adds latest-live marker through shared live-session helper");
  assert(loopHookSource.includes("function applyProviderSelection(runtime: RuntimeContext, provider: string, model?: string)"), "Loop hook defines provider selection helper");
  assert(loopHookSource.includes("providerName: selectedProviderRef.current"), "Loop hook passes selected provider into AgentLoop config");
  assert(loopHookSource.includes("model: selectedModelRef.current"), "Loop hook passes selected model into AgentLoop config");
  assert(loopHookSource.includes("const setProviderSelection = useCallback(async (provider: string, model?: string): Promise<void> => {"), "Loop hook exposes provider selection callback");
  assert(loopHookSource.includes("providerDefaults: Object.fromEntries("), "Loop hook exposes configured provider default models in runtime summary");
  assert(loopHookSource.includes("selectedProvider: selected.provider"), "Loop hook writes selected provider truth into face state");
  assert(loopHookSource.includes("selectedModel: selected.model"), "Loop hook writes selected model truth into face state");
  assert(loopHookSource.includes("const recordRuntimeHook = useCallback(async (event: HookEvent) => {"), "Loop hook defines runtime hook recorder");
  assert(loopHookSource.includes("recordHookEvent({"), "Loop hook records recent hook events into face state");
  assert(loopHookSource.includes("hooks: [recordRuntimeHook],"), "Loop hook attaches runtime hook recorder to AgentLoop instances");
  assert(loopHookSource.includes("supportedHookKinds: [...SUPPORTED_RUNTIME_HOOK_KINDS],"), "Loop hook exposes supported runtime hook kinds in runtime summary");
  assert(componentSource.includes("const currentResumeHint = buildLiveCurrentResumeHint(liveSessionShortcuts);"), "Budget widget builds live current resume hint through shared session helper");
  assert(componentSource.includes("const currentHistoryHint = buildLiveCurrentHistoryHint(liveSessionShortcuts, 8);"), "Budget widget builds live current history hint through shared session helper");
  assert(componentSource.includes("live. {currentSessionId.replace(/^ses_/, \"\")} | {currentMessageCount} msg | unsaved"), "Budget widget renders unsaved live current row");
  assert(componentSource.includes("{currentAgentId} | {normalizeCaste(currentCaste)} | live transcript"), "Budget widget surfaces live current identity truth");
  assert(componentSource.includes("started {currentStartedLabel} | last {currentLatestLabel}"), "Budget widget surfaces live current timing truth");
  assert(componentSource.includes("cost ${costUsd.toFixed(4)} | tokens {tokensUsed.toLocaleString()}"), "Budget widget surfaces live current usage truth");
  assert(componentSource.includes("Inspect: /cost | /cost models | /cost budget | /cost perf | /perf"), "Budget widget advertises cost and unified perf drill-down views");
  assert(componentSource.includes("use {currentResumeHint}"), "Budget widget surfaces live current resume alias set and controls for unsaved current session");
  assert(componentSource.includes("peek {currentHistoryHint}"), "Budget widget surfaces live current history alias set for unsaved current session");
  assert(componentSource.includes("const resumeHint = buildPersistedSessionResumeHint({"), "Budget widget builds persisted-session resume hints through shared helper");
  assert(componentSource.includes("const historyHint = buildPersistedSessionHistoryHint({"), "Budget widget builds persisted-session history hints through shared helper");
  assert(componentSource.includes("session.interruption === \"interrupted_prompt\" ? \"awaiting reply\" : \"tool turn interrupted\""), "Budget widget uses canonical interrupted-turn label for persisted session rows");
  assert(componentSource.includes("{session.agentId} | {normalizeCaste(session.caste)} | {session.hasCheckpoint ? \"checkpoint\" : \"transcript-only\"}"), "Budget widget surfaces persisted session identity truth");
  assert(componentSource.includes("llm {session.provider ?? \"unknown\"}:{session.model ?? \"unknown\"}"), "Budget widget surfaces persisted session llm identity truth");
  assert(componentSource.includes("saved {session.savedAt} | last {session.lastMessageAt}"), "Budget widget surfaces persisted session timing truth");
  assert(componentSource.includes("cost ${session.costUsd.toFixed(4)} | tokens {session.tokensUsed.toLocaleString()}"), "Budget widget surfaces persisted session usage truth");
  assert(componentSource.includes("sessionCatalogIndex,"), "Budget widget passes session catalog index into persisted-session shortcut helper");
  assert(componentSource.includes("use {resumeHint}"), "Budget widget surfaces resume/control commands for recent sessions");
  assert(componentSource.includes("peek {historyHint}"), "Budget widget surfaces transcript peek commands for recent sessions");
  assert(appSource.includes("const currentAgentId = useColonyStore((state) => state.agentId);"), "App uses targeted selector for live current agent in session panel");
  assert(appSource.includes("const currentCaste = useColonyStore((state) => String(state.caste));"), "App uses targeted selector for live current caste in session panel");
  assert(appSource.includes("currentAgentId={currentAgentId}"), "App forwards live current agent into budget widget");
  assert(appSource.includes("currentCaste={currentCaste}"), "App forwards live current caste into budget widget");
  assert(appSource.includes("const currentMessageCount = useColonyStore((state) => state.messages.length);"), "App uses targeted selector for live current message count in session panel");
  assert(appSource.includes("const currentStartedMessageTimestamp = useColonyStore((state) =>"), "App uses targeted selector for live current started timestamp in session panel");
  assert(appSource.includes("const currentLatestMessageTimestamp = useColonyStore((state) =>"), "App uses targeted selector for live current timestamp in session panel");
  assert(appSource.includes("const currentPreviewText = useColonyStore((state) =>"), "App uses targeted selector for live current preview text in session panel");
  assert(appSource.includes("const currentPreviewRole = useColonyStore((state) =>"), "App uses targeted selector for live current preview role in session panel");
  assert(appSource.includes("const currentAwaitingReply = useColonyStore((state) =>"), "App uses targeted selector for live current awaiting-reply state in session panel");
  assert(appSource.includes("currentStartedMessageTimestamp={currentStartedMessageTimestamp}"), "App forwards live current started timestamp into budget widget");
  assert(appSource.includes("currentLatestMessageTimestamp={currentLatestMessageTimestamp}"), "App forwards live current timestamp into budget widget");
  assert(appSource.includes("currentMessageCount={currentMessageCount}"), "App forwards live current message count into budget widget");
  assert(appSource.includes("currentPreviewText={currentPreviewText}"), "App forwards live current preview text into budget widget");
  assert(appSource.includes("currentPreviewRole={currentPreviewRole}"), "App forwards live current preview role into budget widget");
  assert(appSource.includes("currentAwaitingReply={currentAwaitingReply}"), "App forwards live current awaiting-reply state into budget widget");
  assert(componentSource.includes("saved: {externalizedResult.filepath}"), "Tool display surfaces persisted-output filepath");
  assert(componentSource.includes("inspect: /artifact \"{externalizedResult.filepath}\""), "Tool display surfaces exact artifact reopen command for persisted output");
  assert(componentSource.includes("redacted before persistence"), "Tool display surfaces redaction note for persisted output");
  assert(componentSource.includes("const structuredOutcome = output ? summarizeBuiltinToolOutput(toolName, args, output) : null;"), "Tool display derives structured summaries for builtin tool outputs");
  assert(componentSource.includes("const structuredError = approvalMessage || deniedResult || !error"), "Tool display derives structured summaries for builtin tool errors");
  assert(componentSource.includes("const errorPreview = error ? summarizeTranscriptDisplayText(error, 600, 8) : null;"), "Tool display bounds raw error previews when no structured summary exists");
  assert(componentSource.includes("{structuredOutcome.headline}"), "Tool display surfaces structured outcome headline");
  assert(componentSource.includes("structuredOutcome.detailLines.map((line) => ("), "Tool display surfaces structured outcome detail lines");
  assert(componentSource.includes("{structuredError.headline}"), "Tool display surfaces structured error headline");
  assert(componentSource.includes("const approvalMessage = parsePendingApprovalMessage(error ?? output ?? \"\");"), "Tool display parses structured pending-approval inspection messages");
  assert(componentSource.includes("approval: {approvalMessage.status}"), "Tool display surfaces pending-approval status");
  assert(componentSource.includes("detail: {detail}"), "Tool display surfaces pending-approval detail lines");
  assert(componentSource.includes("const deniedResult = approvalMessage ? null : error ? parseDeniedToolResultMessage(error) : null;"), "Tool display keeps denial parser after pending-approval parse");
  assert(componentSource.includes("approval: {deniedResult.status}"), "Tool display surfaces approval outcome status");
  assert(componentSource.includes("parsePersistedToolResultMessage(message.content)"), "Log entry can reconstruct persisted-output affordance from transcript text");
  assert(loopHookSource.includes("logScrollOffset: 0,"), "Resume session resets transcript scroll to latest");
  assert(loopHookSource.includes("announceQueuedStatus = true"), "Manual compaction hook accepts silent queued-status mode");
  assert(loopHookSource.includes("store.pendingCompactionStrategy === strategy"), "Manual compaction request checks for already-queued strategy");
  assert(loopHookSource.includes("if (announceQueuedStatus) {"), "Manual compaction hook can suppress duplicate queued-status chatter");
  assert(loopHookSource.includes("Context ${strategy} compaction already queued. It will run before the next LLM call."), "Manual compaction request reports already-queued strategy");
  assert(loopHookSource.includes("currentStore.setThinkingState(true, statusLabel(event));"), "Loop hook uses guarded thinking-state setter during status updates");
  assert(loopHookSource.includes("store.requestInterrupt(\"Stopping current operation...\");"), "Cancel path marks active run as stopping before loop teardown finishes");
  assert(loopHookSource.includes("Cancellation requested. Finishing current operation..."), "Cancel path reports shutdown-in-progress instead of immediate completion");
  assert(loopHookSource.includes("const queuedPromptQueueRef = useRef(createUserMessageQueue());"), "Loop hook keeps bounded queued prompt state");
  assert(loopHookSource.includes("Queued next prompt"), "Loop hook reports queued follow-up prompts instead of dropping them");
  assert(loopHookSource.includes("Starting queued prompt:"), "Loop hook drains queued prompt after active run finishes");
  assert(loopHookSource.includes("queuePromptSubmission(trimmed);"), "Submit path routes overlap into queued prompt handling");
  assert(loopHookSource.includes("const startupBlockMessage = formatStartupBlockMessage(startupReportRef.current);"), "Submit path computes startup block message before run start");
  assert(loopHookSource.includes("stdinSupportsRawMode: typeof process.stdin.setRawMode === \"function\","), "Startup diagnostics capture raw-mode support from terminal runtime");
  assert(loopHookSource.includes("stdoutColumns: process.stdout.columns,"), "Startup diagnostics capture terminal viewport width from terminal runtime");
  assert(loopHookSource.includes("store.setError(startupBlockMessage);"), "Submit path records startup block as current error");
  assert(loopHookSource.includes("store.addMessage(\"error\", startupBlockMessage);"), "Submit path emits startup block into transcript");
  assert(loopHookSource.includes("store.setPendingCompactionStrategy(strategy);"), "Manual compaction request records queued strategy during active runs");
  assert(loopHookSource.includes("Context compaction upgraded to ${strategy}. It will run before the next LLM call."), "Manual compaction request can upgrade queued compaction to stronger strategies");
  assert(loopHookSource.includes("currentStore.setPendingCompactionStrategy(null);"), "Queued compaction state clears when compaction executes");
  assert(loopHookSource.includes("externalizedResult: event.externalized ? { ...event.externalized } : null"), "Loop hook forwards structured persisted-output metadata to the UI");
  assert(loopHookSource.includes("formatDeniedToolResultMessage({"), "Approval resolution transcript reuses shared structured denial formatter");
  assert(loopHookSource.includes("toolName: request.toolName"), "Approval resolution transcript entries keep tool name for legible tool cards");
  assert(loopHookSource.includes("toolArgs: { ...request.arguments }"), "Approval resolution transcript entries keep tool args for legible tool cards");
  assert(loopHookSource.includes("const readyCloudFallbacks = listReadyCloudFallbackProviders(llmConfig);"), "Readable error derives fallback guidance from live LLM config");
  assert(loopHookSource.includes("Ready cloud failover: ${readyCloudFallbacks.join(\", \")}."), "Readable error names actual ready cloud fallbacks");

  const blockingReport: StartupReport = {
    passed: false,
    errorCount: 1,
    warningCount: 1,
    checks: [
      {
        name: "Local provider",
        passed: false,
        severity: "error",
        message: "Ollama did not respond at http://localhost:11434/api/tags.",
        fix: "Start Ollama or configure a ready cloud fallback.",
      },
      {
        name: "Workspace detection",
        passed: false,
        severity: "warning",
        message: "No workspace marker found.",
      },
    ],
  };
  assertEqual(startupDoctorFocusCommand(blockingReport), "/doctor local", "Startup focus helper targets local runtime failures");
  assertEqual(
    startupDoctorInspectCommands(blockingReport).join(" | "),
    "/doctor | /doctor local | /doctor errors | /doctor warnings | /doctor first-run",
    "Startup inspect helper prioritizes focused doctor drill-downs",
  );
  assertEqual(
    formatStartupPlaceholder(blockingReport),
    "Startup blocked: Local provider | /doctor local | /doctor first-run",
    "Startup placeholder focuses idle operator on exact doctor commands",
  );
  assertEqual(
    formatStartupBlockMessage(blockingReport),
    "Startup blocked: Local provider - Ollama did not respond at http://localhost:11434/api/tags.\nFix: Start Ollama or configure a ready cloud fallback.\nInspect: /doctor | /doctor local | /doctor errors | /doctor warnings | /doctor first-run",
    "Startup block message includes primary fix and focused doctor drill-down",
  );
  assertEqual(formatStartupPlaceholder(null), null, "Startup placeholder omitted when no report exists");
  assertEqual(formatStartupBlockMessage(null), null, "Startup block message omitted when no report exists");

  const readOutcome = summarizeBuiltinToolOutput("file_read", { path: "src/app.ts" }, "first line\nsecond line");
  assertEqual(readOutcome?.headline, "read: src/app.ts", "Tool outcome helper summarizes file_read path");
  assertEqual(readOutcome?.detailLines[0], "chars: 22 | lines: 2", "Tool outcome helper summarizes file_read size");
  assertEqual(readOutcome?.detailLines[1], "preview: first line\nsecond line", "Tool outcome helper preserves file_read preview");

  const shellOutcome = summarizeBuiltinToolOutput("shell_exec", {}, "done\n[stderr]\nwarn\n[exit code: 2]");
  assertEqual(shellOutcome?.headline, "exit: 2", "Tool outcome helper summarizes shell exit code");
  assertEqual(shellOutcome?.detailLines[0], "stdout: done", "Tool outcome helper preserves shell stdout");
  assertEqual(shellOutcome?.detailLines[1], "stderr: warn", "Tool outcome helper preserves shell stderr");

  const writeOutcome = summarizeBuiltinToolOutput("file_write", {}, "Successfully wrote 128 characters to src/app.ts");
  assertEqual(writeOutcome?.headline, "write: src/app.ts", "Tool outcome helper summarizes file_write target");
  assertEqual(writeOutcome?.detailLines[0], "chars: 128", "Tool outcome helper summarizes file_write char count");

  const listOutcome = summarizeBuiltinToolOutput("file_list", {}, "Contents of 'src':\n  [DIR ] ui\n  [FILE] app.ts  120 bytes");
  assertEqual(listOutcome?.headline, "list: src", "Tool outcome helper summarizes file_list directory");
  assertEqual(listOutcome?.detailLines[0], "entries: 2 (1 dir, 1 file)", "Tool outcome helper summarizes file_list counts");

  const editOutcome = summarizeBuiltinToolOutput("file_edit", {}, "Edited src/app.ts\n- old line\n---\n+ new line");
  assertEqual(editOutcome?.headline, "edit: src/app.ts", "Tool outcome helper summarizes file_edit path");
  assertEqual(editOutcome?.detailLines[0], "old: old line", "Tool outcome helper summarizes removed edit line");
  assertEqual(editOutcome?.detailLines[1], "new: new line", "Tool outcome helper summarizes added edit line");

  const grepOutcome = summarizeBuiltinToolOutput("grep_search", {}, "src/app.ts:1:foo\nsrc/app.ts:2:bar");
  assertEqual(grepOutcome?.headline, "matches: 2", "Tool outcome helper summarizes grep match count");
  assertEqual(grepOutcome?.detailLines[0], "src/app.ts:1:foo", "Tool outcome helper preserves first grep hit");

  const shellError = summarizeBuiltinToolError("shell_exec", "[error] Command timed out after 30s");
  assertEqual(shellError?.headline, "timeout: 30s", "Tool error helper summarizes shell timeout");
  assertEqual(shellError?.detailLines[0], "shell command killed before completion", "Tool error helper explains shell timeout");

  const blockedShellError = summarizeBuiltinToolError("shell_exec", "[error] Blocked command: 'rm -rf /' is not allowed by sandbox policy");
  assertEqual(blockedShellError?.headline, "blocked shell", "Tool error helper summarizes blocked shell command");
  assertEqual(blockedShellError?.detailLines[0], "command: rm -rf /", "Tool error helper preserves blocked shell command");

  const missingFileError = summarizeBuiltinToolError("file_read", "[error] File not found: src/missing.ts");
  assertEqual(missingFileError?.headline, "missing file: src/missing.ts", "Tool error helper summarizes missing file");

  const editAmbiguousError = summarizeBuiltinToolError("file_edit", "[error] old_string found 2 times in src/app.ts; it must be unique.  Add more surrounding context to old_string to make the match unique.");
  assertEqual(editAmbiguousError?.headline, "edit match ambiguous: src/app.ts", "Tool error helper summarizes ambiguous edit match");
  assertEqual(editAmbiguousError?.detailLines[0], "matches: 2", "Tool error helper preserves ambiguous edit match count");

  const grepRegexError = summarizeBuiltinToolError("grep_search", "[error] Invalid regex pattern: Unterminated group");
  assertEqual(grepRegexError?.headline, "regex invalid", "Tool error helper summarizes invalid grep regex");
  assertEqual(grepRegexError?.detailLines[0], "Unterminated group", "Tool error helper preserves invalid grep regex detail");
}

// ---------------------------------------------------------------------------
// Run all verifications
// ---------------------------------------------------------------------------

 async function main(): Promise<void> {
  console.log("\nTHE COLONY - Phase 6 Verification (The Face)\n");

  verifyGateway();
  verifyComponents();
  verifyLogMessages();
  verifyExports();
  verifyIntegration();
  verifyStoreBridge();
  verifyReadableErrors();
  await verifyCommandExecutor();
  await verifyApprovalUxGuards();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\nPhase 6 verification FAILED. Fix issues above.");
    process.exit(1);
  } else {
    console.log("\nPhase 6: The Face is GREEN. The Colony UI is wired.");
  }
}

await main();
