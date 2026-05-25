/**
 * Filesystem path validation and path-key safety.
 *
 * Ports colony/security/path_validator.py and path_safety.py. All filesystem
 * checks are async so callers do not block the Bun event loop.
 */

import { lstat, realpath } from "fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  parse,
  resolve,
  sep,
} from "path";

export const VIOLATION_NULL_BYTE = "null_byte_injection";
export const VIOLATION_TRAVERSAL = "directory_traversal";
export const VIOLATION_SYMLINK_ESCAPE = "symlink_escape";
export const VIOLATION_OUTSIDE_WORKSPACE = "outside_workspace";
export const VIOLATION_RESERVED_PATH = "reserved_path";

const RESERVED_UNIX = new Set([
  "/etc/passwd",
  "/etc/shadow",
  "/etc/sudoers",
  "/etc/crontab",
  "/root/.ssh/authorized_keys",
]);

const RESERVED_WIN = new Set([
  "C:\\Windows\\System32\\config\\SAM",
  "C:\\Windows\\System32\\drivers\\etc\\hosts",
]);

export interface PathValidationResult {
  allowed: boolean;
  resolvedPath: string;
  reason: string;
  violationType: string;
}

export class PathTraversalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathTraversalError";
  }
}

export class PathValidator {
  readonly workspace: string;
  private readonly allowSymlinks: boolean;
  private readonly extraAllowed: string[];

  constructor(opts: {
    workspace?: string;
    allowSymlinks?: boolean;
    extraAllowedDirs?: string[];
  } = {}) {
    this.workspace = resolve(expandHome(opts.workspace ?? "."));
    this.allowSymlinks = opts.allowSymlinks ?? true;
    this.extraAllowed = (opts.extraAllowedDirs ?? []).map((dir) => resolve(expandHome(dir)));
  }

  async validate(path: string): Promise<PathValidationResult> {
    if (path.includes("\0")) {
      return {
        allowed: false,
        resolvedPath: "",
        reason: "Path contains null byte - possible injection attack.",
        violationType: VIOLATION_NULL_BYTE,
      };
    }

    const literal = isAbsolute(path) ? path : join(this.workspace, path);
    const resolvedPath = await realpathDeepestExisting(resolve(literal));

    if (isReservedPath(resolvedPath)) {
      return {
        allowed: false,
        resolvedPath,
        reason: `Access to reserved system path denied: ${resolvedPath}`,
        violationType: VIOLATION_RESERVED_PATH,
      };
    }

    if (!this.isWithinAllowed(resolvedPath)) {
      const normalized = normalize(path);
      if (normalized.split(/[\\/]+/).includes("..")) {
        return {
          allowed: false,
          resolvedPath,
          reason: `Directory traversal detected: '${path}' resolves to '${resolvedPath}'.`,
          violationType: VIOLATION_TRAVERSAL,
        };
      }
      return {
        allowed: false,
        resolvedPath,
        reason: `Path outside workspace: '${resolvedPath}' is not under '${this.workspace}'.`,
        violationType: VIOLATION_OUTSIDE_WORKSPACE,
      };
    }

    // Symlink-deny mode: when allowSymlinks is false, reject paths whose
    // final component is itself a symlink. Workspace-escape via symlink
    // targets is already covered by the realpath-resolved isWithinAllowed
    // check above (resolvedPath is the canonical target). This second
    // check exists specifically for the "no symlinks at all under the
    // workspace" deny posture — it inspects the literal path so a symlink
    // whose target happens to land inside the workspace is still refused.
    if (!this.allowSymlinks && (await isSymlink(literal))) {
      return {
        allowed: false,
        resolvedPath,
        reason: `Symlink escape: '${path}' is a symlink and symlink traversal is disabled.`,
        violationType: VIOLATION_SYMLINK_ESCAPE,
      };
    }

    return {
      allowed: true,
      resolvedPath,
      reason: "",
      violationType: "",
    };
  }

  async validateMany(paths: string[]): Promise<PathValidationResult[]> {
    return Promise.all(paths.map((path) => this.validate(path)));
  }

  private isWithinAllowed(path: string): boolean {
    if (startsWithPathPrefix(path, this.workspace)) return true;
    return this.extraAllowed.some((dir) => startsWithPathPrefix(path, dir));
  }
}

export function sanitizePathKey(key: string): string {
  if (!key) throw new PathTraversalError("Empty path key");
  if (key.includes("\0")) throw new PathTraversalError(`Null byte in path key: ${JSON.stringify(key)}`);

  let decoded = key;
  try {
    decoded = decodeURIComponent(key);
  } catch {
    decoded = key;
  }
  if (decoded !== key && (decoded.includes("..") || decoded.includes("/"))) {
    throw new PathTraversalError(`URL-encoded traversal in path key: ${JSON.stringify(key)}`);
  }

  const unicodeNormalized = key.normalize("NFKC");
  if (
    unicodeNormalized !== key &&
    (
      unicodeNormalized.includes("..") ||
      unicodeNormalized.includes("/") ||
      unicodeNormalized.includes("\\") ||
      unicodeNormalized.includes("\0")
    )
  ) {
    throw new PathTraversalError(`Unicode-normalized traversal in path key: ${JSON.stringify(key)}`);
  }

  if (key.includes("\\")) throw new PathTraversalError(`Backslash in path key: ${JSON.stringify(key)}`);
  if (key.startsWith("/") || /^[A-Za-z]:/.test(key)) {
    throw new PathTraversalError(`Absolute path key: ${JSON.stringify(key)}`);
  }
  if (key.split("/").includes("..")) {
    throw new PathTraversalError(`Traversal segment in path key: ${JSON.stringify(key)}`);
  }
  return key;
}

export async function realpathDeepestExisting(absolutePath: string): Promise<string> {
  const tailParts: string[] = [];
  let current = absolutePath;
  const root = parse(current).root;

  while (true) {
    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink()) {
        try {
          const real = await realpath(current);
          return tailParts.length ? join(real, ...tailParts.reverse()) : real;
        } catch (e) {
          throw new PathTraversalError(`Dangling symlink detected (target does not exist): ${JSON.stringify(current)}`);
        }
      }
      const real = await realpath(current);
      return tailParts.length ? join(real, ...tailParts.reverse()) : real;
    } catch (e) {
      if (e instanceof PathTraversalError) throw e;
      if (current === root || dirname(current) === current) break;
      tailParts.push(basename(current));
      current = dirname(current);
    }
  }

  return absolutePath;
}

export async function validateTeamMemWrite(
  filePath: string,
  teamMemRoot = defaultTeamMemRoot(),
): Promise<string> {
  if (filePath.includes("\0")) {
    throw new PathTraversalError(`Null byte in path: ${JSON.stringify(filePath)}`);
  }

  const resolved = resolve(filePath);
  const realRoot = await realpathDeepestExisting(resolve(teamMemRoot));
  if (!startsWithPathPrefix(resolved, realRoot)) {
    throw new PathTraversalError(`Path escapes team memory directory: ${JSON.stringify(filePath)}`);
  }

  const realPath = await realpathDeepestExisting(resolved);
  if (!startsWithPathPrefix(realPath, realRoot)) {
    throw new PathTraversalError(`Path escapes team memory directory via symlink: ${JSON.stringify(filePath)}`);
  }

  return resolved;
}

export async function validateTeamMemKey(
  relativeKey: string,
  teamMemRoot = defaultTeamMemRoot(),
): Promise<string> {
  sanitizePathKey(relativeKey);
  return validateTeamMemWrite(join(teamMemRoot, relativeKey), teamMemRoot);
}

function startsWithPathPrefix(path: string, prefix: string): boolean {
  const pathN = normalizeCase(normalize(path));
  const prefixN = normalizeCase(normalize(prefix));
  return pathN === prefixN || pathN.startsWith(prefixN.endsWith(sep) ? prefixN : `${prefixN}${sep}`);
}

function isReservedPath(path: string): boolean {
  const normalized = normalizeCase(normalize(path));
  for (const reserved of RESERVED_UNIX) {
    if (normalized === normalizeCase(normalize(reserved))) return true;
  }
  for (const reserved of RESERVED_WIN) {
    if (normalized === normalizeCase(normalize(reserved))) return true;
  }
  return false;
}

async function isSymlink(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isSymbolicLink();
  } catch {
    return false;
  }
}

function normalizeCase(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function defaultTeamMemRoot(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? process.cwd();
  return join(home, ".colony", "memory", "team");
}

function expandHome(path: string): string {
  if (!path.startsWith("~")) return path;
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  return home ? join(home, path.slice(1)) : path;
}
