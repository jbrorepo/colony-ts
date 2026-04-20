/**
 * Workspace detection and metadata.
 *
 * The Python runtime workspace module provides sandboxed agent-local file
 * access. This Phase 8 slice ports the workspace-awareness boundary: detect
 * the active project root without blocking I/O, then expose stable metadata
 * to prompts, status commands, and future workspace sandboxes.
 */

import { dirname, isAbsolute, join, parse, resolve } from "path";

export interface WorkspaceDetectionOptions {
  startDir?: string;
  markers?: string[];
  maxDepth?: number;
}

export interface WorkspaceInfo {
  root: string;
  startDir: string;
  detected: boolean;
  reason: string;
  markers: string[];
  projectType: "bun" | "typescript" | "node" | "python" | "git" | "unknown";
  packageManager: "bun" | "pnpm" | "yarn" | "npm" | "unknown";
  name: string;
  workspaceMode: "single-package" | "monorepo";
  workspaceGlobs: string[];
  workspacePackageCount: number;
  workspaceAppCount: number;
  workspaceLibraryCount: number;
  workspaceOtherCount: number;
  workspaceAppPackages: string[];
  workspaceLibraryPackages: string[];
  workspaceOtherPackages: string[];
  workspaceDevCandidates: string[];
  workspaceVerifyCandidates: string[];
  workspaceIntent: string;
  workspacePrimaryTargets: string[];
  scriptNames: string[];
  devCommand: string | null;
  verifyCommand: string | null;
  stackHints: string[];
}

const DEFAULT_MARKERS = [
  ".colony",
  ".git",
  "bun.lockb",
  "bun.lock",
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
];

export async function detectWorkspace(
  opts: WorkspaceDetectionOptions = {},
): Promise<WorkspaceInfo> {
  const startDir = resolve(opts.startDir ?? process.cwd());
  const markers = opts.markers?.length ? opts.markers : DEFAULT_MARKERS;
  const maxDepth = opts.maxDepth ?? 25;
  const rootPath = parse(startDir).root;

  let current = startDir;
  let bestMatch: WorkspaceInfo | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let depth = 0; depth <= maxDepth; depth++) {
    const found = await findMarkers(current, markers);
    if (found.length > 0) {
      const candidate = await buildInfo({
        root: current,
        startDir,
        detected: true,
        reason: `marker:${found[0]}`,
        markers: found,
      });
      const score = workspaceCandidateScore(candidate, depth);
      if (score > bestScore) {
        bestMatch = candidate;
        bestScore = score;
      }
    }

    if (current === rootPath) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  if (bestMatch) {
    return bestMatch;
  }

  return buildInfo({
    root: startDir,
    startDir,
    detected: false,
    reason: "no_workspace_marker",
    markers: [],
  });
}

export async function findWorkspaceRoot(startDir = process.cwd()): Promise<string> {
  return (await detectWorkspace({ startDir })).root;
}

async function buildInfo(opts: {
  root: string;
  startDir: string;
  detected: boolean;
  reason: string;
  markers: string[];
}): Promise<WorkspaceInfo> {
  const root = resolve(opts.root);
  const markerSet = new Set(opts.markers);
  const metadata = await readPackageMetadata(root);
  const resolvedPackageManager = metadata.packageManager ?? packageManager(markerSet);
  return {
    root,
    startDir: resolve(opts.startDir),
    detected: opts.detected,
    reason: opts.reason,
    markers: opts.markers,
    projectType: projectType(markerSet),
    packageManager: resolvedPackageManager,
    name: metadata.name || basenameFromPath(root),
    workspaceMode: metadata.workspaceMode,
    workspaceGlobs: metadata.workspaceGlobs,
    workspacePackageCount: metadata.workspacePackageCount,
    workspaceAppCount: metadata.workspaceAppCount,
    workspaceLibraryCount: metadata.workspaceLibraryCount,
    workspaceOtherCount: metadata.workspaceOtherCount,
    workspaceAppPackages: metadata.workspaceAppPackages,
    workspaceLibraryPackages: metadata.workspaceLibraryPackages,
    workspaceOtherPackages: metadata.workspaceOtherPackages,
    workspaceDevCandidates: metadata.workspaceDevCandidates,
    workspaceVerifyCandidates: metadata.workspaceVerifyCandidates,
    workspaceIntent: deriveWorkspaceIntent(metadata),
    workspacePrimaryTargets: deriveWorkspacePrimaryTargets(metadata, metadata.name || basenameFromPath(root)),
    scriptNames: metadata.scriptNames,
    devCommand: metadata.devCommand,
    verifyCommand: metadata.verifyCommand,
    stackHints: deriveStackHints(markerSet, metadata.stackHints, resolvedPackageManager),
  };
}

async function findMarkers(dir: string, markers: string[]): Promise<string[]> {
  const checks = await Promise.all(
    markers.map(async (marker) => {
      const exists = await Bun.file(join(dir, marker)).exists();
      return exists ? marker : null;
    }),
  );
  return checks.filter((marker): marker is string => marker !== null);
}

interface PackageMetadata {
  name: string;
  packageManager: WorkspaceInfo["packageManager"] | null;
  workspaceMode: WorkspaceInfo["workspaceMode"];
  workspaceGlobs: string[];
  workspacePackageCount: number;
  workspaceAppCount: number;
  workspaceLibraryCount: number;
  workspaceOtherCount: number;
  workspaceAppPackages: string[];
  workspaceLibraryPackages: string[];
  workspaceOtherPackages: string[];
  workspaceDevCandidates: string[];
  workspaceVerifyCandidates: string[];
  workspaceIntent?: string;
  workspacePrimaryTargets?: string[];
  scriptNames: string[];
  devCommand: string | null;
  verifyCommand: string | null;
  stackHints: string[];
}

async function readPackageMetadata(root: string): Promise<PackageMetadata> {
  const packagePath = join(root, "package.json");
  if (!(await Bun.file(packagePath).exists())) {
    return {
      name: "",
      packageManager: null,
      workspaceMode: "single-package",
      workspaceGlobs: [],
      workspacePackageCount: 0,
      workspaceAppCount: 0,
      workspaceLibraryCount: 0,
      workspaceOtherCount: 0,
      workspaceAppPackages: [],
      workspaceLibraryPackages: [],
      workspaceOtherPackages: [],
      workspaceDevCandidates: [],
      workspaceVerifyCandidates: [],
      workspaceIntent: "unknown",
      workspacePrimaryTargets: [],
      scriptNames: [],
      devCommand: null,
      verifyCommand: null,
      stackHints: [],
    };
  }
  try {
    const text = await Bun.file(packagePath).text();
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const scripts = parseScripts(parsed.scripts);
    const workspaceGlobs = parseWorkspaceGlobs(parsed.workspaces);
    const workspaceCounts = await countWorkspacePackages(root, workspaceGlobs);
    return {
      name: typeof parsed.name === "string" ? parsed.name : "",
      packageManager: parsePackageManagerField(parsed.packageManager),
      workspaceMode: hasWorkspaces(parsed.workspaces) ? "monorepo" : "single-package",
      workspaceGlobs,
      workspacePackageCount: workspaceCounts.workspacePackageCount,
      workspaceAppCount: workspaceCounts.workspaceAppCount,
      workspaceLibraryCount: workspaceCounts.workspaceLibraryCount,
      workspaceOtherCount: workspaceCounts.workspaceOtherCount,
      workspaceAppPackages: workspaceCounts.workspaceAppPackages,
      workspaceLibraryPackages: workspaceCounts.workspaceLibraryPackages,
      workspaceOtherPackages: workspaceCounts.workspaceOtherPackages,
      workspaceDevCandidates: workspaceCounts.workspaceDevCandidates,
      workspaceVerifyCandidates: workspaceCounts.workspaceVerifyCandidates,
      scriptNames: sortScriptNames(scripts),
      devCommand: pickScriptCommand(scripts, ["dev", "start"]),
      verifyCommand: pickScriptCommand(scripts, ["verify:all", "verify", "test"]),
      stackHints: stackHintsFromPackageJson(parsed),
    };
  } catch {
    return {
      name: "",
      packageManager: null,
      workspaceMode: "single-package",
      workspaceGlobs: [],
      workspacePackageCount: 0,
      workspaceAppCount: 0,
      workspaceLibraryCount: 0,
      workspaceOtherCount: 0,
      workspaceAppPackages: [],
      workspaceLibraryPackages: [],
      workspaceOtherPackages: [],
      workspaceDevCandidates: [],
      workspaceVerifyCandidates: [],
      workspaceIntent: "unknown",
      workspacePrimaryTargets: [],
      scriptNames: [],
      devCommand: null,
      verifyCommand: null,
      stackHints: [],
    };
  }
}

function parseScripts(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, command]) => typeof command === "string")
    .map(([name, command]) => [name, command as string]);
  return Object.fromEntries(entries);
}

function sortScriptNames(scripts: Record<string, string>): string[] {
  const names = Object.keys(scripts);
  const preferred = ["dev", "start", "build", "verify:all", "verify", "test", "lint"];
  return [
    ...preferred.filter((name) => name in scripts),
    ...names.filter((name) => !preferred.includes(name)).sort((left, right) => left.localeCompare(right)),
  ];
}

function pickScriptCommand(
  scripts: Record<string, string>,
  priority: string[],
): string | null {
  for (const name of priority) {
    if (name in scripts) return scripts[name];
  }
  return null;
}

function hasWorkspaces(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && typeof value === "object");
}

function parseWorkspaceGlobs(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (value && typeof value === "object") {
    const packages = (value as Record<string, unknown>).packages;
    if (Array.isArray(packages)) {
      return packages.filter((entry): entry is string => typeof entry === "string");
    }
  }
  return [];
}

async function countWorkspacePackages(
  root: string,
  workspaceGlobs: string[],
): Promise<
  Pick<
    PackageMetadata,
    | "workspacePackageCount"
    | "workspaceAppCount"
    | "workspaceLibraryCount"
    | "workspaceOtherCount"
    | "workspaceAppPackages"
    | "workspaceLibraryPackages"
    | "workspaceOtherPackages"
    | "workspaceDevCandidates"
    | "workspaceVerifyCandidates"
  >
> {
  if (workspaceGlobs.length === 0) {
    return {
      workspacePackageCount: 0,
      workspaceAppCount: 0,
      workspaceLibraryCount: 0,
      workspaceOtherCount: 0,
      workspaceAppPackages: [],
      workspaceLibraryPackages: [],
      workspaceOtherPackages: [],
      workspaceDevCandidates: [],
      workspaceVerifyCandidates: [],
    };
  }

  const packageDirs = new Set<string>();
  for (const workspaceGlob of workspaceGlobs) {
    const normalized = workspaceGlob.replace(/\\/g, "/").trim();
    if (!normalized || normalized.startsWith("!")) continue;
    const pattern = normalized.endsWith("/")
      ? `${normalized}package.json`
      : `${normalized}/package.json`;
    const glob = new Bun.Glob(pattern);
    for await (const match of glob.scan({ cwd: root })) {
      const relativeDir = match.replace(/\\/g, "/").replace(/\/package\.json$/i, "");
      if (relativeDir) packageDirs.add(relativeDir);
    }
  }

  let workspaceAppCount = 0;
  let workspaceLibraryCount = 0;
  let workspaceOtherCount = 0;
  const workspaceAppPackages: string[] = [];
  const workspaceLibraryPackages: string[] = [];
  const workspaceOtherPackages: string[] = [];
  const workspaceDevCandidates: string[] = [];
  const workspaceVerifyCandidates: string[] = [];
  for (const relativeDir of [...packageDirs].sort((left, right) => left.localeCompare(right))) {
    const rootSegment = relativeDir.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
    const packageInfo = await readWorkspacePackageInfo(root, relativeDir);
    const packageName = packageInfo.displayName;
    if (["app", "apps", "service", "services"].includes(rootSegment)) {
      workspaceAppCount++;
      workspaceAppPackages.push(packageName);
    } else if (["package", "packages", "lib", "libs", "module", "modules"].includes(rootSegment)) {
      workspaceLibraryCount++;
      workspaceLibraryPackages.push(packageName);
    } else {
      workspaceOtherCount++;
      workspaceOtherPackages.push(packageName);
    }
    if (packageInfo.packageName && packageInfo.scripts.includes("dev")) {
      workspaceDevCandidates.push(`${packageInfo.packageName}: bun --filter ${packageInfo.packageName} run dev`);
    }
    if (packageInfo.packageName) {
      if (packageInfo.scripts.includes("verify:all")) {
        workspaceVerifyCandidates.push(`${packageInfo.packageName}: bun --filter ${packageInfo.packageName} run verify:all`);
      } else if (packageInfo.scripts.includes("verify")) {
        workspaceVerifyCandidates.push(`${packageInfo.packageName}: bun --filter ${packageInfo.packageName} run verify`);
      } else if (packageInfo.scripts.includes("test")) {
        workspaceVerifyCandidates.push(`${packageInfo.packageName}: bun --filter ${packageInfo.packageName} run test`);
      }
    }
  }

  return {
    workspacePackageCount: packageDirs.size,
    workspaceAppCount,
    workspaceLibraryCount,
    workspaceOtherCount,
    workspaceAppPackages,
    workspaceLibraryPackages,
    workspaceOtherPackages,
    workspaceDevCandidates,
    workspaceVerifyCandidates,
  };
}

async function readWorkspacePackageInfo(
  root: string,
  relativeDir: string,
): Promise<{ packageName: string | null; displayName: string; scripts: string[] }> {
  const packagePath = join(root, relativeDir, "package.json");
  try {
    if (await Bun.file(packagePath).exists()) {
      const text = await Bun.file(packagePath).text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const packageName =
        typeof parsed.name === "string" && parsed.name.trim().length > 0
          ? parsed.name.trim()
          : null;
      return {
        packageName,
        displayName: packageName ?? relativeDir,
        scripts: Object.keys(parseScripts(parsed.scripts)),
      };
    }
  } catch {
    // Fall through to relative-dir label.
  }
  return { packageName: null, displayName: relativeDir, scripts: [] };
}

function parsePackageManagerField(value: unknown): WorkspaceInfo["packageManager"] | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase();
  if (normalized.startsWith("bun@")) return "bun";
  if (normalized.startsWith("pnpm@")) return "pnpm";
  if (normalized.startsWith("yarn@")) return "yarn";
  if (normalized.startsWith("npm@")) return "npm";
  return null;
}

function stackHintsFromPackageJson(parsed: Record<string, unknown>): string[] {
  const deps = new Set<string>();
  for (const bucket of ["dependencies", "devDependencies"]) {
    const value = parsed[bucket];
    if (!value || typeof value !== "object") continue;
    for (const key of Object.keys(value as Record<string, unknown>)) deps.add(key);
  }

  const hints: string[] = [];
  pushHint(hints, deps.has("react"), "react");
  pushHint(hints, deps.has("ink"), "ink");
  pushHint(hints, deps.has("zustand"), "zustand");
  pushHint(hints, deps.has("typescript"), "typescript");
  pushHint(hints, deps.has("next"), "next");
  pushHint(hints, deps.has("vite"), "vite");
  pushHint(hints, deps.has("express"), "express");
  pushHint(hints, deps.has("bun-types"), "typescript");
  return hints;
}

function deriveWorkspaceIntent(metadata: PackageMetadata): WorkspaceInfo["workspaceIntent"] {
  if (metadata.workspaceMode === "monorepo") {
    if (metadata.workspaceAppCount > 0) return "app-monorepo";
    if (metadata.workspaceLibraryCount > 0 && metadata.workspaceOtherCount === 0) return "library-monorepo";
    if (metadata.workspacePackageCount > 0) return "mixed-monorepo";
  }

  const stack = new Set(metadata.stackHints);
  const scripts = new Set(metadata.scriptNames);
  const name = metadata.name.toLowerCase();
  if (stack.has("ink")) return "terminal-app";
  if (stack.has("next") || stack.has("vite")) return "web-app";
  if (stack.has("react") && scripts.has("dev")) return "web-app";
  if (stack.has("express")) return "service";
  if (name.includes("docs") || scripts.has("docs")) return "docs";
  if (!metadata.devCommand && metadata.verifyCommand && (scripts.has("build") || metadata.workspaceLibraryCount === 0)) {
    return "library";
  }
  if (scripts.has("dev") || scripts.has("start")) return "tooling";
  return "unknown";
}

function deriveWorkspacePrimaryTargets(metadata: PackageMetadata, fallbackName: string): string[] {
  if (metadata.workspaceAppPackages.length > 0) return metadata.workspaceAppPackages.slice(0, 3);
  if (metadata.workspaceLibraryPackages.length > 0) return metadata.workspaceLibraryPackages.slice(0, 3);
  if (metadata.workspaceOtherPackages.length > 0) return metadata.workspaceOtherPackages.slice(0, 3);
  if (metadata.name.trim().length > 0) return [metadata.name];
  return fallbackName.trim().length > 0 ? [fallbackName] : [];
}

function deriveStackHints(
  markers: Set<string>,
  packageHints: string[],
  resolvedPackageManager: WorkspaceInfo["packageManager"],
): string[] {
  const hints = [...packageHints];
  pushHint(hints, resolvedPackageManager === "bun", "bun");
  pushHint(hints, markers.has("tsconfig.json"), "typescript");
  pushHint(hints, markers.has("pyproject.toml"), "python");
  return hints.slice(0, 6);
}

function pushHint(target: string[], condition: boolean, hint: string): void {
  if (condition && !target.includes(hint)) target.push(hint);
}

function packageManager(markers: Set<string>): WorkspaceInfo["packageManager"] {
  if (markers.has("bun.lockb") || markers.has("bun.lock")) return "bun";
  if (markers.has("pnpm-lock.yaml")) return "pnpm";
  if (markers.has("yarn.lock")) return "yarn";
  if (markers.has("package-lock.json")) return "npm";
  return "unknown";
}

function workspaceCandidateScore(info: WorkspaceInfo, depth: number): number {
  let score = 0;
  if (info.workspaceMode === "monorepo") score += 1000;
  if (info.workspacePackageCount > 0) score += 200;
  if (info.markers.includes("package.json")) score += 100;
  if (info.markers.some((marker) => [".git", ".colony", "bun.lockb", "bun.lock", "pnpm-lock.yaml", "yarn.lock", "package-lock.json"].includes(marker))) {
    score += 40;
  }
  if (info.scriptNames.length > 0) score += 20;
  if (info.stackHints.length > 0) score += 10;
  return score - depth;
}

function projectType(markers: Set<string>): WorkspaceInfo["projectType"] {
  if (markers.has("bun.lockb") || markers.has("bun.lock")) return "bun";
  if (markers.has("tsconfig.json")) return "typescript";
  if (markers.has("package.json")) return "node";
  if (markers.has("pyproject.toml")) return "python";
  if (markers.has(".git")) return "git";
  return "unknown";
}

function basenameFromPath(path: string): string {
  const normalized = isAbsolute(path) ? resolve(path) : path;
  return normalized.split(/[\\/]/).filter(Boolean).at(-1) ?? "workspace";
}
