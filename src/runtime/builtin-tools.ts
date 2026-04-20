/**
 * Built-in tools for The Colony agent runtime.
 *
 * 1:1 port of colony/runtime/builtin_tools.py — provides the standard
 * tool set every Colony agent has access to (subject to permission checks):
 *
 *   - shell_exec: Run shell commands with timeout and output capture
 *   - file_read: Read files from the agent's workspace
 *   - file_write: Write/create files in the agent's workspace
 *   - file_list: List files in a workspace directory
 *   - file_edit: Surgical string replacement (unique match required)
 *   - grep_search: Recursive regex search across files
 *
 * Each tool is registered via registerBuiltinTools() which adds
 * definitions and handlers to a ToolRegistry.
 */

import { mkdir, readdir, stat } from "fs/promises";
import { dirname, join } from "path";

import {
  ToolRegistry,
  createToolDefinition,
  type ToolHandler,
} from "./tools-registry";
import { PathValidator } from "../security/path-validator";

export interface BuiltinToolOptions {
  workspace?: string;
  enforcePathValidation?: boolean;
}

// ---------------------------------------------------------------------------
// Blocked commands (sandbox safety)
// ---------------------------------------------------------------------------

const BLOCKED_COMMANDS = new Set([
  "rm -rf /",
  "rm -rf /*",
  "mkfs",
  ":(){:|:&};:",
  "dd if=/dev/zero of=/dev/sd",
  "chmod -R 777 /",
  "> /dev/sda",
  "wget | sh",
  "curl | sh",
  "shutdown",
  "reboot",
  "init 0",
  "init 6",
]);

// ---------------------------------------------------------------------------
// Shell execution
// ---------------------------------------------------------------------------

export async function shellExec(args: Record<string, unknown>): Promise<string> {
  const command = String(args.command ?? "");
  const timeoutSeconds = Number(args.timeout_seconds ?? args.timeoutSeconds ?? 30);
  const workingDirectory = String(args.working_directory ?? args.workingDirectory ?? "");

  if (!command.trim()) return "[error] Empty command";

  const pathCheck = await validateToolPath(workingDirectory, getBuiltinToolOptions(args), "working_directory");
  if (pathCheck.error) return pathCheck.error;

  // Check blocked commands
  const cmdLower = command.trim().toLowerCase();
  for (const blocked of BLOCKED_COMMANDS) {
    if (cmdLower.includes(blocked)) {
      return `[error] Blocked command: '${blocked}' is not allowed by sandbox policy`;
    }
  }

  const shellCommand = process.platform === "win32"
    ? ["powershell.exe", "-NoProfile", "-Command", command]
    : ["/bin/bash", "-lc", command];

  let timedOut = false;
  let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;

  try {
    proc = Bun.spawn(shellCommand, {
      cwd: pathCheck.path || workingDirectory || undefined,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (e) {
    return `[error] Failed to execute command: ${(e as Error).message}`;
  }

  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutSeconds * 1000);

  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (timedOut) {
      return `[error] Command timed out after ${timeoutSeconds}s`;
    }

    const parts: string[] = [];
    if (stdout) parts.push(stdout);
    if (stderr) parts.push(`[stderr]\n${stderr}`);
    parts.push(`[exit code: ${code}]`);
    return parts.join("\n");
  } catch (e) {
    if (timedOut) {
      return `[error] Command timed out after ${timeoutSeconds}s`;
    }
    return `[error] Failed to execute command: ${(e as Error).message}`;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------

export async function fileRead(
  args: Record<string, unknown>,
  opts: BuiltinToolOptions = {},
): Promise<string> {
  const path = String(args.path ?? "");

  if (!path) return "[error] No path specified";

  try {
    const pathCheck = await validateToolPath(path, opts);
    if (pathCheck.error) return pathCheck.error;

    const file = Bun.file(pathCheck.path || path);
    if (!(await file.exists())) {
      return `[error] File not found: ${path}`;
    }
    return await file.text();
  } catch (e: unknown) {
    return `[error] Failed to read file: ${(e as Error).message}`;
  }
}

export async function fileWrite(
  args: Record<string, unknown>,
  opts: BuiltinToolOptions = {},
): Promise<string> {
  const path = String(args.path ?? "");
  const content = String(args.content ?? "");

  if (!path) return "[error] No path specified";

  try {
    const pathCheck = await validateToolPath(path, opts);
    if (pathCheck.error) return pathCheck.error;
    const targetPath = pathCheck.path || path;

    await mkdir(dirname(targetPath), { recursive: true });
    await Bun.write(targetPath, content);
    return `Successfully wrote ${content.length} characters to ${path}`;
  } catch (e: unknown) {
    return `[error] Failed to write file: ${(e as Error).message}`;
  }
}

export async function fileList(
  args: Record<string, unknown>,
  opts: BuiltinToolOptions = {},
): Promise<string> {
  const directory = String(args.directory ?? ".");

  try {
    const pathCheck = await validateToolPath(directory, opts, "directory");
    if (pathCheck.error) return pathCheck.error;
    const targetDirectory = pathCheck.path || directory;

    const directoryStat = await stat(targetDirectory).catch(() => null);
    if (!directoryStat?.isDirectory()) {
      return `[error] Not a directory: ${directory}`;
    }

    const entries = (await readdir(targetDirectory)).sort();
    const lines = [`Contents of '${directory}':`];

    for (const entry of entries) {
      const fullPath = join(targetDirectory, entry);
      try {
        const s = await stat(fullPath);
        if (s.isDirectory()) {
          lines.push(`  [DIR ] ${entry}`);
        } else {
          lines.push(`  [FILE] ${entry}  ${s.size.toLocaleString()} bytes`);
        }
      } catch {
        lines.push(`  [????] ${entry}`);
      }
    }

    return lines.join("\n");
  } catch (e: unknown) {
    return `[error] Failed to list directory: ${(e as Error).message}`;
  }
}

export async function fileEdit(
  args: Record<string, unknown>,
  opts: BuiltinToolOptions = {},
): Promise<string> {
  const path = String(args.path ?? "");
  const oldString = String(args.old_string ?? args.oldString ?? "");
  const newString = String(args.new_string ?? args.newString ?? "");

  if (!path) return "[error] No path specified";
  if (!oldString) return "[error] old_string cannot be empty";

  try {
    const pathCheck = await validateToolPath(path, opts);
    if (pathCheck.error) return pathCheck.error;
    const targetPath = pathCheck.path || path;

    const file = Bun.file(targetPath);
    if (!(await file.exists())) return `[error] File not found: ${path}`;

    const original = await file.text();
    const count = original.split(oldString).length - 1;

    if (count === 0) {
      return (
        `[error] old_string not found in ${path}.\n` +
        "Ensure the string exactly matches file content, " +
        "including whitespace and line endings."
      );
    }
    if (count > 1) {
      return (
        `[error] old_string found ${count} times in ${path}; ` +
        "it must be unique.  Add more surrounding context to " +
        "old_string to make the match unique."
      );
    }

    const updated = original.replace(oldString, newString);
    await Bun.write(targetPath, updated);

    const PREVIEW = 500;
    const oldPreview = oldString.length > PREVIEW ? oldString.slice(0, PREVIEW) + "…" : oldString;
    const newPreview = newString.length > PREVIEW ? newString.slice(0, PREVIEW) + "…" : newString;

    const lines = [`Edited ${path}`];
    for (const line of oldPreview.split("\n")) lines.push(`- ${line}`);
    lines.push("---");
    for (const line of newPreview.split("\n")) lines.push(`+ ${line}`);
    return lines.join("\n");
  } catch (e: unknown) {
    return `[error] Failed to edit file: ${(e as Error).message}`;
  }
}

// ---------------------------------------------------------------------------
// Grep search
// ---------------------------------------------------------------------------

const GREP_MAX_RESULTS = 500;

export async function grepSearch(
  args: Record<string, unknown>,
  opts: BuiltinToolOptions = {},
): Promise<string> {
  const pattern = String(args.pattern ?? "");
  const searchPath = String(args.path ?? ".");
  const include = String(args.include ?? "");

  if (!pattern) return "[error] No pattern specified";

  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch (e: unknown) {
    return `[error] Invalid regex pattern: ${(e as Error).message}`;
  }

  const pathCheck = await validateToolPath(searchPath, opts);
  if (pathCheck.error) return pathCheck.error;
  const targetPath = pathCheck.path || searchPath;

  const searchStat = await stat(targetPath).catch(() => null);
  if (!searchStat) {
    return `[error] Path does not exist: ${searchPath}`;
  }

  const results: string[] = [];

  async function walkDir(dir: string): Promise<void> {
    if (results.length >= GREP_MAX_RESULTS) return;

    let entries: string[];
    try {
      entries = (await readdir(dir)).sort();
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= GREP_MAX_RESULTS) return;
      const fullPath = join(dir, entry);

      try {
        const childPathCheck = await validateToolPath(fullPath, opts);
        if (childPathCheck.error) continue;
        const s = await stat(fullPath);
        if (s.isDirectory()) {
          await walkDir(fullPath);
        } else if (s.isFile()) {
          if (include && !minimatch(entry, include)) continue;
          await searchFile(fullPath);
        }
      } catch {
        continue;
      }
    }
  }

  async function searchFile(filePath: string): Promise<void> {
    try {
      const text = await Bun.file(filePath).text();
      const lines = text.split("\n");
      for (let i = 0; i < lines.length && results.length < GREP_MAX_RESULTS; i++) {
        if (regex.test(lines[i])) {
          results.push(`${filePath}:${i + 1}:${lines[i]}`);
        }
      }
    } catch {
      // Skip files that can't be read
    }
  }

  if (searchStat.isFile()) {
    await searchFile(targetPath);
  } else {
    await walkDir(targetPath);
  }

  if (results.length === 0) {
    return `No matches found for pattern: ${pattern}`;
  }

  let output = results.join("\n");
  if (results.length >= GREP_MAX_RESULTS) {
    output += `\n\n[Results truncated at ${GREP_MAX_RESULTS}]`;
  }
  return output;
}

// Simple glob matching (fnmatch equivalent)
function minimatch(name: string, pattern: string): boolean {
  const regex = new RegExp(
    "^" +
      pattern
        .replace(/\./g, "\\.")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".") +
      "$",
  );
  return regex.test(name);
}

function getBuiltinToolOptions(args: Record<string, unknown>): BuiltinToolOptions {
  const options = args.__builtinToolOptions;
  if (!options || typeof options !== "object") return {};
  return options as BuiltinToolOptions;
}

function withBuiltinToolOptions(
  args: Record<string, unknown>,
  opts: BuiltinToolOptions,
): Record<string, unknown> {
  if (!opts.workspace && !opts.enforcePathValidation) return args;
  return {
    ...args,
    __builtinToolOptions: opts,
  };
}

async function validateToolPath(
  path: string,
  opts: BuiltinToolOptions,
  label = "path",
): Promise<{ path: string; error: string | null }> {
  if (!path) return { path: "", error: null };
  if (!opts.workspace && !opts.enforcePathValidation) {
    return { path, error: null };
  }

  const validator = new PathValidator({ workspace: opts.workspace ?? process.cwd() });
  const result = await validator.validate(path);
  if (result.allowed) {
    return { path: result.resolvedPath, error: null };
  }
  return {
    path: result.resolvedPath,
    error: `[error] Path validation failed for ${label}: ${result.reason}`,
  };
}

// ---------------------------------------------------------------------------
// Register all builtins
// ---------------------------------------------------------------------------

export function registerBuiltinTools(
  registry: ToolRegistry,
  opts: BuiltinToolOptions = {},
): void {
  registry.register(
    createToolDefinition("shell_exec", "Shell Execute", {
      description: "Execute a shell command and return its output.",
      category: "shell",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to execute." },
          timeout_seconds: { type: "number", description: "Max execution time (default 30)." },
          working_directory: { type: "string", description: "Working directory for the command." },
        },
        required: ["command"],
      },
      timeoutSeconds: 60,
    }),
    ((args: Record<string, unknown>) => shellExec(withBuiltinToolOptions(args, opts))) as ToolHandler,
  );

  registry.register(
    createToolDefinition("file_read", "File Read", {
      description: "Read a file from the workspace.",
      category: "file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the file to read." },
          encoding: { type: "string", description: "File encoding (default utf-8)." },
        },
        required: ["path"],
      },
    }),
    ((args: Record<string, unknown>) => fileRead(args, opts)) as ToolHandler,
  );

  registry.register(
    createToolDefinition("file_write", "File Write", {
      description: "Write content to a file in the workspace.",
      category: "file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to write to." },
          content: { type: "string", description: "Content to write." },
          encoding: { type: "string", description: "File encoding (default utf-8)." },
        },
        required: ["path", "content"],
      },
    }),
    ((args: Record<string, unknown>) => fileWrite(args, opts)) as ToolHandler,
  );

  registry.register(
    createToolDefinition("file_list", "File List", {
      description: "List files in a workspace directory.",
      category: "file",
      parameters: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Directory to list (default: '.')." },
        },
      },
    }),
    ((args: Record<string, unknown>) => fileList(args, opts)) as ToolHandler,
  );

  registry.register(
    createToolDefinition("file_edit", "File Edit", {
      description: "Replace a unique string in a file with new content.",
      category: "file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the file to edit." },
          old_string: { type: "string", description: "Exact string to find (must appear once)." },
          new_string: { type: "string", description: "Replacement string." },
        },
        required: ["path", "old_string", "new_string"],
      },
    }),
    ((args: Record<string, unknown>) => fileEdit(args, opts)) as ToolHandler,
  );

  registry.register(
    createToolDefinition("grep_search", "Grep Search", {
      description: "Search file contents for lines matching a regex pattern.",
      category: "file",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Regex pattern to search for." },
          path: { type: "string", description: "Directory or file to search." },
          include: { type: "string", description: "Glob filter for filenames (e.g. '*.py')." },
        },
        required: ["pattern"],
      },
    }),
    ((args: Record<string, unknown>) => grepSearch(args, opts)) as ToolHandler,
  );
}
