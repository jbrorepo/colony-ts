import { readdir, stat } from "fs/promises";
import { isAbsolute, join, relative, resolve } from "path";

import type { MemoryTruthMode } from "./memory/hybrid-memory";
import type {
  SwarmExecutionMode,
  SwarmStage,
} from "./orchestrator";
import {
  filterHistoryExcerpt,
  formatSessionHistoryExcerpt,
} from "./gateway-session";
import type { CommandResult } from "./gateway-contract";
import type { CompactionStrategy } from "./runtime/compaction";
import type { SessionHistoryExcerpt } from "./runtime/session-recovery";
import { getDataPath, settings } from "./settings";

const ARTIFACT_VIEW_CHARS = 4_000;
const ARTIFACT_LIST_LIMIT = 5;

function result(opts: {
  handled?: boolean;
  command?: string;
  output?: string;
  data?: Record<string, unknown>;
  isError?: boolean;
} = {}): CommandResult {
  return {
    handled: opts.handled ?? true,
    command: opts.command ?? "",
    output: opts.output ?? "",
    data: opts.data ?? {},
    isError: opts.isError ?? false,
    action: { kind: "display" },
  };
}

function artifactStorageRoot(): string {
  return resolve(getDataPath(settings), "tool-results");
}

function safeArtifactId(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120) || "result";
}

function artifactSessionDir(sessionId: string): string {
  return join(artifactStorageRoot(), safeArtifactId(sessionId));
}

function normalizeArtifactPath(filepath: string): string {
  return filepath.trim().replace(/^["']|["']$/g, "");
}

export function resolveArtifactPath(filepath: string): { filepath?: string; error?: string } {
  const normalized = normalizeArtifactPath(filepath);
  if (!normalized) {
    return { error: "Usage: /artifact <saved_tool_result_path>" };
  }

  const resolved = resolve(normalized);
  const root = artifactStorageRoot();
  const rel = relative(root, resolved);
  const allowed = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  if (!allowed) {
    return {
      error: `Artifact path not allowed: ${normalized}\n\nUse only files under ${root}`,
    };
  }

  return { filepath: resolved };
}

interface RecentArtifactEntry {
  filepath: string;
  filename: string;
  sizeChars: number;
  modifiedAt: string;
  modifiedMs: number;
}

async function listRecentArtifacts(sessionId: string, limit = ARTIFACT_LIST_LIMIT): Promise<RecentArtifactEntry[]> {
  const dir = artifactSessionDir(sessionId);
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }

  const entries = await Promise.all(names.map(async (name) => {
    const filepath = join(dir, name);
    try {
      const info = await stat(filepath);
      if (!info.isFile()) return null;
      return {
        filepath,
        filename: name,
        sizeChars: info.size,
        modifiedAt: info.mtime.toISOString(),
        modifiedMs: info.mtimeMs,
      } satisfies RecentArtifactEntry;
    } catch {
      return null;
    }
  }));

  return entries
    .filter((entry): entry is RecentArtifactEntry => Boolean(entry))
    .sort((left, right) => right.modifiedMs - left.modifiedMs)
    .slice(0, limit);
}

async function loadPersistedArtifactView(filepath: string): Promise<CommandResult> {
  const target = resolveArtifactPath(filepath);
  if (target.error || !target.filepath) {
    return result({
      command: "artifact",
      output: target.error ?? "Artifact path not allowed.",
      isError: true,
    });
  }

  const file = Bun.file(target.filepath);
  if (!(await file.exists())) {
    return result({
      command: "artifact",
      output: `Saved artifact not found: ${target.filepath}`,
      isError: true,
    });
  }

  const content = await file.text();
  const normalized = content.replace(/\r\n/g, "\n");
  const lineCount = normalized.length === 0 ? 0 : normalized.split("\n").length;
  const excerpt = normalized.slice(0, ARTIFACT_VIEW_CHARS);
  const typeLabel = target.filepath.toLowerCase().endsWith(".json") ? "json" : "text";
  const lines = [
    "Saved artifact:",
    `Path: ${target.filepath}`,
    `Type: ${typeLabel}`,
    `Size: ${content.length.toLocaleString()} chars | ${lineCount.toLocaleString()} lines`,
    `Showing first ${Math.min(content.length, ARTIFACT_VIEW_CHARS).toLocaleString()} chars:`,
    excerpt,
  ];
  if (content.length > ARTIFACT_VIEW_CHARS) {
    lines.push("... more remains on disk");
  }
  lines.push(`Need full file? Ask Colony to use file_read "${target.filepath}"`);

  return result({
    command: "artifact",
    output: lines.join("\n"),
    data: {
      filepath: target.filepath,
      sizeChars: content.length,
      lineCount,
      truncated: content.length > ARTIFACT_VIEW_CHARS,
    },
  });
}

async function loadPersistedArtifactCatalog(sessionId: string): Promise<CommandResult> {
  const entries = await listRecentArtifacts(sessionId);
  const dir = artifactSessionDir(sessionId);
  const lines = [
    "Saved artifacts:",
    `Session: ${sessionId}`,
    `Dir: ${dir}`,
  ];

  if (entries.length === 0) {
    lines.push("No persisted tool outputs found yet.");
    lines.push("Run tools that emit large results first, then reopen them with /artifact latest.");
  } else {
    lines.push(`Recent files: ${entries.length}`);
    lines.push("");
    for (const entry of entries) {
      lines.push(`${entry.filename}`);
      lines.push(`  saved ${entry.modifiedAt} | ${entry.sizeChars.toLocaleString()} chars`);
      lines.push(`  open /artifact "${entry.filepath}"`);
    }
    lines.push("");
    lines.push("Fast path: /artifact latest");
  }

  return result({
    command: "artifact",
    output: lines.join("\n"),
    data: { sessionId, count: entries.length },
  });
}

async function loadLatestPersistedArtifactView(sessionId: string): Promise<CommandResult> {
  const [latest] = await listRecentArtifacts(sessionId, 1);
  if (!latest) {
    return result({
      command: "artifact",
      output: `No saved artifacts found for session ${sessionId}.\n\nUse /artifact to inspect the session directory after a tool writes externalized output.`,
      isError: true,
    });
  }
  return loadPersistedArtifactView(latest.filepath);
}

export interface CommandExecutionHandlers {
  submitChat: (message: string) => Promise<void> | void;
  queueChat?: (message: string) => Promise<void> | void;
  exitApp: () => void;
  resetSession: () => void;
  requestCompaction: (
    strategy?: CompactionStrategy,
    options?: { announceQueuedStatus?: boolean },
  ) => Promise<unknown> | void;
  setBudgetCap: (maxUsd: number) => void;
  setProviderSelection?: (provider: string, model?: string) => Promise<void> | void;
  setMemoryTruthMode?: (mode: MemoryTruthMode | null) => Promise<void> | void;
  startSwarm?: (
    objective: string,
    executionMode?: SwarmExecutionMode,
  ) => Promise<string | CommandResult | void> | string | CommandResult | void;
  cancelSwarm?: (runId: string) => Promise<string | CommandResult | void> | string | CommandResult | void;
  resumeSwarm?: (runId: string) => Promise<string | CommandResult | void> | string | CommandResult | void;
  retrySwarmStage?: (
    runId: string,
    stage: SwarmStage,
  ) => Promise<string | CommandResult | void> | string | CommandResult | void;
  requestExternalChannelRegistration?: (channelId: string) => Promise<string | CommandResult | void> | string | CommandResult | void;
  requestExternalChannelWebhookRegistration?: (channelId: string) => Promise<string | CommandResult | void> | string | CommandResult | void;
  requestExternalChannelSubscriptionSetup?: (channelId: string) => Promise<string | CommandResult | void> | string | CommandResult | void;
  requestBrowserOpen?: (url: string) => Promise<string | CommandResult | void> | string | CommandResult | void;
  requestBrowserScreenshot?: () => Promise<string | CommandResult | void> | string | CommandResult | void;
  requestBrowserClick?: (selector: string) => Promise<string | CommandResult | void> | string | CommandResult | void;
  requestBrowserType?: (selector: string, text: string) => Promise<string | CommandResult | void> | string | CommandResult | void;
  requestBrowserWait?: (target: string) => Promise<string | CommandResult | void> | string | CommandResult | void;
  startWorkflowRecipe?: (recipeId: string) => Promise<string | CommandResult | void> | string | CommandResult | void;
  resumeWorkflowRecipe?: (runId: string) => Promise<string | CommandResult | void> | string | CommandResult | void;
  cancelWorkflowRecipe?: (runId: string) => Promise<string | CommandResult | void> | string | CommandResult | void;
  createGitHubPullRequest?: (runId: string) => Promise<string | CommandResult | void> | string | CommandResult | void;
  activatePlugin?: (pluginId: string) => Promise<string | CommandResult | void> | string | CommandResult | void;
  deactivatePlugin?: (pluginId: string) => Promise<string | CommandResult | void> | string | CommandResult | void;
  showArtifactCatalog?: (
    sessionId: string,
    latest?: boolean,
  ) => Promise<CommandResult> | CommandResult;
  showArtifact?: (filepath: string) => Promise<CommandResult> | CommandResult;
  showSystemMessage: (message: string) => void;
  showErrorMessage: (message: string) => void;
  cancelRun?: () => void;
  resumeSession?: (sessionId: string) => Promise<void> | void;
  loadSessionHistory?: (sessionId: string, count: number) => Promise<SessionHistoryExcerpt | null>;
  isRunActive?: () => boolean;
  isRunCancelling?: () => boolean;
}

function emitOptionalCommandResult(
  value: string | CommandResult | void,
  handlers: CommandExecutionHandlers,
): void {
  if (!value) return;
  if (typeof value === "string") {
    handlers.showSystemMessage(value);
    return;
  }
  if (value.isError) {
    handlers.showErrorMessage(value.output);
  } else {
    handlers.showSystemMessage(value.output);
  }
}

async function runOptionalHandoff(
  label: string,
  invoke: (() => Promise<string | CommandResult | void> | string | CommandResult | void) | undefined,
  handlers: CommandExecutionHandlers,
): Promise<void> {
  if (!invoke) return;
  try {
    emitOptionalCommandResult(await invoke(), handlers);
  } catch {
    handlers.showErrorMessage(`${label} host handoff failed. Inspect host-owned logs for details.`);
  }
}

export async function executeCommand(
  command: CommandResult,
  handlers: CommandExecutionHandlers,
): Promise<boolean> {
  if (!command.handled) return false;

  if (command.isError) {
    handlers.showErrorMessage(command.output);
    return true;
  }

  const runActive = handlers.isRunActive?.() ?? false;
  const runCancelling = handlers.isRunCancelling?.() ?? false;
  const action = command.action ?? { kind: "display" as const };
  const tryExitApp = (): void => {
    try {
      handlers.exitApp();
    } catch (error) {
      handlers.showErrorMessage(
        `Failed to exit Colony: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  switch (action.kind) {
    case "display":
      handlers.showSystemMessage(command.output);
      return true;

    case "submit":
      if (runCancelling) {
        handlers.showSystemMessage(
          "Cannot submit a new request while the current Colony run is stopping. Wait for idle, then try again.",
        );
        return true;
      }
      if (runActive) {
        if (!handlers.queueChat) {
          handlers.showSystemMessage(
            "Cannot submit a new request while a Colony run is active. Use /cancel, Ctrl+C, or Esc first.",
          );
          return true;
        }
        try {
          await handlers.queueChat(action.message);
        } catch (error) {
          handlers.showErrorMessage(
            `Failed to queue request: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        return true;
      }
      try {
        await handlers.submitChat(action.message);
      } catch (error) {
        handlers.showErrorMessage(
          `Failed to submit request: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return true;

    case "start_swarm":
      if (!handlers.startSwarm) {
        handlers.showErrorMessage("Swarm orchestration is not available in this runtime.");
        return true;
      }
      handlers.showSystemMessage(command.output);
      try {
        const started = await handlers.startSwarm(action.objective, action.executionMode);
        emitOptionalCommandResult(started, handlers);
      } catch (error) {
        handlers.showErrorMessage(
          `Failed to start swarm: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return true;

    case "resume_swarm":
      if (!handlers.resumeSwarm) {
        handlers.showErrorMessage("Swarm resume is not available in this runtime.");
        return true;
      }
      handlers.showSystemMessage(command.output);
      try {
        const resumed = await handlers.resumeSwarm(action.runId);
        emitOptionalCommandResult(resumed, handlers);
      } catch (error) {
        handlers.showErrorMessage(
          `Failed to resume swarm ${action.runId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return true;

    case "retry_swarm_stage":
      if (!handlers.retrySwarmStage) {
        handlers.showErrorMessage("Swarm retry is not available in this runtime.");
        return true;
      }
      handlers.showSystemMessage(command.output);
      try {
        const retried = await handlers.retrySwarmStage(action.runId, action.stage);
        emitOptionalCommandResult(retried, handlers);
      } catch (error) {
        handlers.showErrorMessage(
          `Failed to retry swarm ${action.runId} stage ${action.stage}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return true;

    case "cancel_swarm":
      if (!handlers.cancelSwarm) {
        handlers.showErrorMessage("Swarm cancellation is not available in this runtime.");
        return true;
      }
      handlers.showSystemMessage(command.output);
      try {
        const cancelled = await handlers.cancelSwarm(action.runId);
        emitOptionalCommandResult(cancelled, handlers);
      } catch (error) {
        handlers.showErrorMessage(
          `Failed to cancel swarm ${action.runId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return true;

    case "register_external_channel_adapter":
      handlers.showSystemMessage(command.output);
      if (!handlers.requestExternalChannelRegistration) {
        return true;
      }
      try {
        const requested = await handlers.requestExternalChannelRegistration(action.channelId);
        emitOptionalCommandResult(requested, handlers);
      } catch (error) {
        handlers.showErrorMessage(
          `Failed to request external channel registration for ${action.channelId}: host handler failed. Inspect host-owned logs for details.`,
        );
      }
      return true;

    case "setup_external_channel_webhook":
      handlers.showSystemMessage(command.output);
      if (!handlers.requestExternalChannelWebhookRegistration) {
        return true;
      }
      try {
        const requested = await handlers.requestExternalChannelWebhookRegistration(action.channelId);
        emitOptionalCommandResult(requested, handlers);
      } catch (error) {
        handlers.showErrorMessage(
          `Failed to request external channel webhook setup for ${action.channelId}: host handler failed. Inspect host-owned logs for details.`,
        );
      }
      return true;

    case "setup_external_channel_subscription":
      handlers.showSystemMessage(command.output);
      if (!handlers.requestExternalChannelSubscriptionSetup) {
        return true;
      }
      try {
        const requested = await handlers.requestExternalChannelSubscriptionSetup(action.channelId);
        emitOptionalCommandResult(requested, handlers);
      } catch {
        handlers.showErrorMessage(
          `Failed to request external channel subscription setup for ${action.channelId}: host handler failed. Inspect host-owned logs for details.`,
        );
      }
      return true;

    case "browser_open":
      handlers.showSystemMessage(command.output);
      await runOptionalHandoff("Browser open", handlers.requestBrowserOpen ? () => handlers.requestBrowserOpen?.(action.url) : undefined, handlers);
      return true;

    case "browser_screenshot":
      handlers.showSystemMessage(command.output);
      await runOptionalHandoff("Browser screenshot", handlers.requestBrowserScreenshot, handlers);
      return true;

    case "browser_click":
      handlers.showSystemMessage(command.output);
      await runOptionalHandoff("Browser click", handlers.requestBrowserClick ? () => handlers.requestBrowserClick?.(action.selector) : undefined, handlers);
      return true;

    case "browser_type":
      handlers.showSystemMessage(command.output);
      await runOptionalHandoff("Browser type", handlers.requestBrowserType ? () => handlers.requestBrowserType?.(action.selector, action.text) : undefined, handlers);
      return true;

    case "browser_wait":
      handlers.showSystemMessage(command.output);
      await runOptionalHandoff("Browser wait", handlers.requestBrowserWait ? () => handlers.requestBrowserWait?.(action.target) : undefined, handlers);
      return true;

    case "start_workflow_recipe":
      handlers.showSystemMessage(command.output);
      await runOptionalHandoff("Workflow start", handlers.startWorkflowRecipe ? () => handlers.startWorkflowRecipe?.(action.recipeId) : undefined, handlers);
      return true;

    case "resume_workflow_recipe":
      handlers.showSystemMessage(command.output);
      await runOptionalHandoff("Workflow resume", handlers.resumeWorkflowRecipe ? () => handlers.resumeWorkflowRecipe?.(action.runId) : undefined, handlers);
      return true;

    case "cancel_workflow_recipe":
      handlers.showSystemMessage(command.output);
      await runOptionalHandoff("Workflow cancel", handlers.cancelWorkflowRecipe ? () => handlers.cancelWorkflowRecipe?.(action.runId) : undefined, handlers);
      return true;

    case "github_pr_create":
      handlers.showSystemMessage(command.output);
      await runOptionalHandoff("GitHub PR create", handlers.createGitHubPullRequest ? () => handlers.createGitHubPullRequest?.(action.runId) : undefined, handlers);
      return true;

    case "plugin_activate":
      handlers.showSystemMessage(command.output);
      await runOptionalHandoff("Plugin activation", handlers.activatePlugin ? () => handlers.activatePlugin?.(action.pluginId) : undefined, handlers);
      return true;

    case "plugin_deactivate":
      handlers.showSystemMessage(command.output);
      await runOptionalHandoff("Plugin deactivation", handlers.deactivatePlugin ? () => handlers.deactivatePlugin?.(action.pluginId) : undefined, handlers);
      return true;

    case "show_artifact": {
      handlers.showSystemMessage(command.output);
      const artifact = handlers.showArtifact
        ? await handlers.showArtifact(action.filepath)
        : await loadPersistedArtifactView(action.filepath);
      if (artifact.isError) {
        handlers.showErrorMessage(artifact.output);
      } else {
        handlers.showSystemMessage(artifact.output);
      }
      return true;
    }

    case "show_artifact_catalog":
    {
      handlers.showSystemMessage(command.output);
      const artifact = handlers.showArtifactCatalog
        ? await handlers.showArtifactCatalog(action.sessionId, action.latest)
        : action.latest
          ? await loadLatestPersistedArtifactView(action.sessionId)
          : await loadPersistedArtifactCatalog(action.sessionId);
      if (artifact.isError) {
        handlers.showErrorMessage(artifact.output);
      } else {
        handlers.showSystemMessage(artifact.output);
      }
      return true;
    }

    case "set_budget":
      try {
        handlers.setBudgetCap(action.maxUsd);
      } catch (error) {
        handlers.showErrorMessage(
          `Failed to update budget cap to $${action.maxUsd.toFixed(2)}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return true;
      }
      handlers.showSystemMessage(
        runActive
          ? `${command.output} Current run keeps previous cap; new cap applies next run.`
          : command.output,
      );
      return true;

    case "set_provider":
      if (!handlers.setProviderSelection) {
        handlers.showErrorMessage("Provider selection is not available in this runtime.");
        return true;
      }
      try {
        await handlers.setProviderSelection(action.provider, action.model);
      } catch (error) {
        handlers.showErrorMessage(
          `Failed to select provider ${action.provider}${action.model ? `:${action.model}` : ""}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return true;
      }
      handlers.showSystemMessage(
        runActive
          ? `${command.output} Active run keeps current provider chain; new selection applies next run.`
          : command.output,
      );
      return true;

    case "set_memory_truth_mode":
      if (!handlers.setMemoryTruthMode) {
        handlers.showErrorMessage("Memory recall control is not available in this runtime.");
        return true;
      }
      try {
        await handlers.setMemoryTruthMode(action.mode);
      } catch (error) {
        handlers.showErrorMessage(
          `Failed to update memory recall mode: ${error instanceof Error ? error.message : String(error)}`,
        );
        return true;
      }
      handlers.showSystemMessage(
        runActive
          ? `${command.output} Active run keeps current memory recall; new mode applies next run.`
          : command.output,
      );
      return true;

    case "cancel_run":
      if (runCancelling) {
        handlers.showSystemMessage("Cancellation already in progress for the active Colony run.");
        return true;
      }
      if (!runActive) {
        handlers.showSystemMessage("No active Colony run to cancel.");
        return true;
      }
      if (!handlers.cancelRun) {
        handlers.showErrorMessage("Run cancellation is not available in this runtime.");
        return true;
      }
      try {
        handlers.cancelRun();
      } catch (error) {
        handlers.showErrorMessage(
          `Failed to cancel active run: ${error instanceof Error ? error.message : String(error)}`,
        );
        return true;
      }
      handlers.showSystemMessage(command.output);
      return true;

    case "clear_session":
      if (runCancelling) {
        handlers.showSystemMessage(
          "Cannot clear session while a Colony run is stopping. Wait for idle, then try again.",
        );
        return true;
      }
      if (runActive) {
        handlers.showSystemMessage(
          "Cannot clear session while a Colony run is active. Use /cancel, Ctrl+C, or Esc first.",
        );
        return true;
      }
      try {
        handlers.resetSession();
      } catch (error) {
        handlers.showErrorMessage(
          `Failed to clear session: ${error instanceof Error ? error.message : String(error)}`,
        );
        return true;
      }
      handlers.showSystemMessage(command.output);
      return true;

    case "compact":
      handlers.showSystemMessage(command.output);
      try {
        await handlers.requestCompaction(action.strategy, { announceQueuedStatus: false });
      } catch (error) {
        handlers.showErrorMessage(
          `Failed to process ${action.strategy} compaction request: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return true;

    case "resume_session":
      if (runCancelling) {
        handlers.showSystemMessage(
          "Cannot resume another session while a Colony run is stopping. Wait for idle, then try again.",
        );
        return true;
      }
      if (runActive) {
        handlers.showSystemMessage(
          "Cannot resume another session while a Colony run is active. Use /cancel, Ctrl+C, or Esc first.",
        );
        return true;
      }
      if (!handlers.resumeSession) {
        handlers.showErrorMessage("Session resume is not available in this runtime.");
        return true;
      }
      handlers.showSystemMessage(command.output);
      try {
        await handlers.resumeSession(action.sessionId);
      } catch (error) {
        handlers.showErrorMessage(
          `Failed to resume session ${action.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return true;
      }
      return true;

    case "show_session_history":
      if (!handlers.loadSessionHistory) {
        handlers.showErrorMessage("Session history loader is not available in this runtime.");
        return true;
      }
      handlers.showSystemMessage(command.output);
      try {
        const excerpt = await handlers.loadSessionHistory(action.sessionId, action.count);
        if (!excerpt) {
          handlers.showErrorMessage(`No persisted history found for session ${action.sessionId}.`);
          return true;
        }
        const filtered = filterHistoryExcerpt(excerpt, action.historyFilter ?? null, action.historySearch ?? null);
        handlers.showSystemMessage(
          formatSessionHistoryExcerpt(filtered.excerpt, "persisted session", {
            resumeAliases: action.resumeAliases,
            historyFilter: action.historyFilter ?? null,
            historySearch: action.historySearch ?? null,
            originalVisibleCount: filtered.originalVisibleCount,
          }),
        );
      } catch (error) {
        handlers.showErrorMessage(
          `Failed to load history for session ${action.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return true;

    case "exit":
      if (runActive) {
        if (!handlers.cancelRun) {
          handlers.showSystemMessage("Colony shutting down. Active run will be terminated immediately. Ad Formicae Gloriam.");
          tryExitApp();
          return true;
        }
        try {
          handlers.cancelRun();
        } catch (error) {
          handlers.showErrorMessage(
            `Graceful shutdown failed while stopping the active run: ${error instanceof Error ? error.message : String(error)} Exiting anyway.`,
          );
          tryExitApp();
          return true;
        }
      }
      handlers.showSystemMessage(command.output);
      tryExitApp();
      return true;
  }
}
