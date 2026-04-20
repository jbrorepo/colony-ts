import { readdir, stat } from "fs/promises";
import { isAbsolute, join, relative, resolve } from "path";

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
  exitApp: () => void;
  resetSession: () => void;
  requestCompaction: (
    strategy?: CompactionStrategy,
    options?: { announceQueuedStatus?: boolean },
  ) => Promise<unknown> | void;
  setBudgetCap: (maxUsd: number) => void;
  setProviderSelection?: (provider: string, model?: string) => Promise<void> | void;
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
      if (command.command === "swarm" && command.output) {
        handlers.showSystemMessage(command.output);
      }
      if (runActive) {
        handlers.showSystemMessage(
          "Cannot submit a new request while a Colony run is active. Use /cancel, Ctrl+C, or Esc first.",
        );
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

    case "cancel_run":
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
