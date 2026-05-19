import { scrubSecrets } from "./security/log-sanitizer";

export type WorkspaceViewMode = "summary" | "packages" | "dev" | "verify";

export interface GatewayWorkspaceCommandPayload {
  output: string;
  isError?: boolean;
  data?: Record<string, unknown>;
}

export interface GatewayWorkspaceView {
  detected: boolean;
  name: string;
  root: string;
  startDir?: string;
  projectType: string;
  packageManager: string;
  workspaceMode?: string;
  workspaceIntent?: string;
  workspacePrimaryTargets?: string[];
  workspacePackageCount?: number;
  workspaceAppCount?: number;
  workspaceLibraryCount?: number;
  workspaceOtherCount?: number;
  workspaceAppPackages?: string[];
  workspaceLibraryPackages?: string[];
  workspaceOtherPackages?: string[];
  workspaceDevCandidates?: string[];
  workspaceVerifyCandidates?: string[];
  workspaceGlobs?: string[];
  stackHints?: string[];
  scriptNames?: string[];
  devCommand?: string | null;
  verifyCommand?: string | null;
  reason?: string;
  markers?: string[];
}

function redactWorkspaceInput(value: string): string {
  return value.trim()
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]")
    .replace(/\b(?:sk|xox[baprs])-[A-Za-z0-9._-]{8,}\b/g, "[REDACTED]");
}

function redactWorkspaceSurfaceText(value: string): string {
  return scrubSecrets(value.replace(/[\r\n]+/g, " ").trim())
    .replace(/(^|[^A-Za-z0-9])gh[pousr]_[A-Za-z0-9_]{8,}/g, "$1[REDACTED]")
    .replace(/(^|[^A-Za-z0-9])github_pat_[A-Za-z0-9_]{8,}/g, "$1[REDACTED]")
    .replace(/(^|[^A-Za-z0-9])(?:sk-ant|sk-proj|sk|xox[baprs])-[^\s"',;]+/gi, "$1[REDACTED]");
}

function redactWorkspaceList(values: string[] | undefined, limit?: number): string {
  const visible = typeof limit === "number" ? values?.slice(0, limit) : values;
  return visible?.map(redactWorkspaceSurfaceText).join(", ") ?? "";
}

function redactWorkspaceCommandList(values: string[] | undefined, limit?: number): string {
  const visible = typeof limit === "number" ? values?.slice(0, limit) : values;
  return visible?.map(redactWorkspaceSurfaceText).join(" | ") ?? "";
}

function normalizeWorkspaceToken(value: string | undefined): string {
  const raw = value?.trim() ?? "";
  if (!raw || raw.startsWith("--")) return "";
  const redacted = redactWorkspaceInput(raw);
  return redacted.includes("[REDACTED]") ? redacted : redacted.toLowerCase();
}

function normalizeWorkspaceArgs(args: string[]): string[] {
  return args.filter((arg) => !arg.trim().startsWith("--"));
}

export function workspaceInspectViews(): string {
  return "/workspace | /workspace packages | /workspace dev | /workspace verify";
}

export function resolveWorkspaceView(args: string[]): WorkspaceViewMode | { error: string } {
  const raw = normalizeWorkspaceToken(normalizeWorkspaceArgs(args)[0]);
  if (!raw || raw === "summary" || raw === "all") return "summary";
  if (raw === "packages" || raw === "pkg") return "packages";
  if (raw === "dev" || raw === "develop") return "dev";
  if (raw === "verify" || raw === "test") return "verify";
  return {
    error: `Unknown workspace view '${raw}'.\n\nViews: ${workspaceInspectViews()}`,
  };
}

export function renderWorkspaceDetailLines(workspace: GatewayWorkspaceView): string[] {
  const lines: string[] = [];
  lines.push(`Detected: ${workspace.detected ? "yes" : "no"}`);
  lines.push(`Name: ${redactWorkspaceSurfaceText(workspace.name)}`);
  lines.push(`Root: ${redactWorkspaceSurfaceText(workspace.root)}`);
  if (workspace.startDir) lines.push(`Start dir: ${redactWorkspaceSurfaceText(workspace.startDir)}`);
  lines.push(`Type: ${redactWorkspaceSurfaceText(workspace.projectType)}`);
  lines.push(`Package manager: ${redactWorkspaceSurfaceText(workspace.packageManager)}`);
  if (workspace.workspaceMode) lines.push(`Mode: ${redactWorkspaceSurfaceText(workspace.workspaceMode)}`);
  if (workspace.workspaceIntent) lines.push(`Intent: ${redactWorkspaceSurfaceText(workspace.workspaceIntent)}`);
  if (workspace.workspacePrimaryTargets?.length) lines.push(`Primary targets: ${redactWorkspaceList(workspace.workspacePrimaryTargets, 4)}`);
  if (Number(workspace.workspacePackageCount ?? 0) > 0) {
    lines.push(
      `Workspace packages: ${workspace.workspacePackageCount} total (${workspace.workspaceAppCount ?? 0} app, ${workspace.workspaceLibraryCount ?? 0} library, ${workspace.workspaceOtherCount ?? 0} other)`,
    );
  }
  if (workspace.workspaceAppPackages?.length) lines.push(`Workspace apps: ${redactWorkspaceList(workspace.workspaceAppPackages, 4)}`);
  if (workspace.workspaceLibraryPackages?.length) lines.push(`Workspace libraries: ${redactWorkspaceList(workspace.workspaceLibraryPackages, 4)}`);
  if (workspace.workspaceOtherPackages?.length) lines.push(`Workspace other: ${redactWorkspaceList(workspace.workspaceOtherPackages, 4)}`);
  if (workspace.workspaceDevCandidates?.length) lines.push(`Workspace dev candidates: ${redactWorkspaceCommandList(workspace.workspaceDevCandidates, 3)}`);
  if (workspace.workspaceVerifyCandidates?.length) lines.push(`Workspace verify candidates: ${redactWorkspaceCommandList(workspace.workspaceVerifyCandidates, 3)}`);
  if (workspace.workspaceGlobs?.length) lines.push(`Workspace globs: ${redactWorkspaceList(workspace.workspaceGlobs)}`);
  if (workspace.stackHints?.length) lines.push(`Stack: ${redactWorkspaceList(workspace.stackHints)}`);
  if (workspace.scriptNames?.length) lines.push(`Scripts: ${redactWorkspaceList(workspace.scriptNames)}`);
  if (workspace.devCommand) lines.push(`Dev command: ${redactWorkspaceSurfaceText(workspace.devCommand)}`);
  if (workspace.verifyCommand) lines.push(`Verify command: ${redactWorkspaceSurfaceText(workspace.verifyCommand)}`);
  if (workspace.reason) lines.push(`Reason: ${redactWorkspaceSurfaceText(workspace.reason)}`);
  if (workspace.markers?.length) lines.push(`Markers: ${redactWorkspaceList(workspace.markers)}`);
  return lines;
}

export function renderWorkspaceSummary(workspace: GatewayWorkspaceView): string {
  const lines = ["Workspace:", "", ...renderWorkspaceDetailLines(workspace)];
  lines.push(`Views: ${workspaceInspectViews()}`);
  return lines.join("\n");
}

export function renderWorkspacePackagesView(workspace: GatewayWorkspaceView): string {
  const lines = ["Workspace Packages:", ""];
  lines.push(`Workspace packages: ${workspace.workspacePackageCount ?? 0} total (${workspace.workspaceAppCount ?? 0} app, ${workspace.workspaceLibraryCount ?? 0} library, ${workspace.workspaceOtherCount ?? 0} other)`);
  lines.push(`Root: ${redactWorkspaceSurfaceText(workspace.root)}`);
  if (workspace.workspaceAppPackages?.length) lines.push(`Apps: ${redactWorkspaceList(workspace.workspaceAppPackages)}`);
  if (workspace.workspaceLibraryPackages?.length) lines.push(`Libraries: ${redactWorkspaceList(workspace.workspaceLibraryPackages)}`);
  if (workspace.workspaceOtherPackages?.length) lines.push(`Other packages: ${redactWorkspaceList(workspace.workspaceOtherPackages)}`);
  if (workspace.workspaceGlobs?.length) lines.push(`Workspaces: ${redactWorkspaceList(workspace.workspaceGlobs)}`);
  lines.push(`Inspect: ${workspaceInspectViews()}`);
  return lines.join("\n");
}

export function renderWorkspaceCommandView(
  workspace: GatewayWorkspaceView,
  mode: "dev" | "verify",
): string {
  const title = mode === "dev" ? "Workspace Dev:" : "Workspace Verify:";
  const rootLabel = mode === "dev" ? "Root dev command" : "Root verify command";
  const rootCommand = mode === "dev" ? workspace.devCommand : workspace.verifyCommand;
  const candidates = mode === "dev" ? workspace.workspaceDevCandidates : workspace.workspaceVerifyCandidates;
  const packageLabel = mode === "dev" ? "Package dev candidates" : "Package verify candidates";

  const lines = [title, ""];
  lines.push(`Root: ${redactWorkspaceSurfaceText(workspace.root)}`);
  if (rootCommand) {
    lines.push(`${rootLabel}: ${redactWorkspaceSurfaceText(rootCommand)}`);
  } else {
    lines.push(`${rootLabel}: none`);
  }
  if (candidates?.length) {
    lines.push(`${packageLabel}: ${redactWorkspaceCommandList(candidates)}`);
  } else {
    lines.push(`${packageLabel}: none`);
  }
  if (!rootCommand && !(candidates?.length)) {
    lines.push(mode === "dev"
      ? "No runnable dev command found in workspace metadata."
      : "No runnable verify command found in workspace metadata.");
  }
  lines.push(`Inspect: ${workspaceInspectViews()}`);
  return lines.join("\n");
}

export function buildWorkspaceCommandPayload(
  args: string[],
  workspace: GatewayWorkspaceView | null | undefined,
): GatewayWorkspaceCommandPayload {
  if (!workspace) {
    return {
      output: "Workspace detection has not completed yet.",
    };
  }

  const view = resolveWorkspaceView(args);
  if (typeof view !== "string") {
    return {
      output: view.error,
      isError: true,
    };
  }

  return {
    output: view === "packages"
      ? renderWorkspacePackagesView(workspace)
      : view === "dev" || view === "verify"
        ? renderWorkspaceCommandView(workspace, view)
        : renderWorkspaceSummary(workspace),
    data: {
      workspace,
      view,
    },
  };
}
