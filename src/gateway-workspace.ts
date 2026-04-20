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

export function workspaceInspectViews(): string {
  return "/workspace | /workspace packages | /workspace dev | /workspace verify";
}

export function resolveWorkspaceView(args: string[]): WorkspaceViewMode | { error: string } {
  const raw = args[0]?.trim().toLowerCase();
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
  lines.push(`Name: ${workspace.name}`);
  lines.push(`Root: ${workspace.root}`);
  if (workspace.startDir) lines.push(`Start dir: ${workspace.startDir}`);
  lines.push(`Type: ${workspace.projectType}`);
  lines.push(`Package manager: ${workspace.packageManager}`);
  if (workspace.workspaceMode) lines.push(`Mode: ${workspace.workspaceMode}`);
  if (workspace.workspaceIntent) lines.push(`Intent: ${workspace.workspaceIntent}`);
  if (workspace.workspacePrimaryTargets?.length) lines.push(`Primary targets: ${workspace.workspacePrimaryTargets.slice(0, 4).join(", ")}`);
  if (Number(workspace.workspacePackageCount ?? 0) > 0) {
    lines.push(
      `Workspace packages: ${workspace.workspacePackageCount} total (${workspace.workspaceAppCount ?? 0} app, ${workspace.workspaceLibraryCount ?? 0} library, ${workspace.workspaceOtherCount ?? 0} other)`,
    );
  }
  if (workspace.workspaceAppPackages?.length) lines.push(`Workspace apps: ${workspace.workspaceAppPackages.slice(0, 4).join(", ")}`);
  if (workspace.workspaceLibraryPackages?.length) lines.push(`Workspace libraries: ${workspace.workspaceLibraryPackages.slice(0, 4).join(", ")}`);
  if (workspace.workspaceOtherPackages?.length) lines.push(`Workspace other: ${workspace.workspaceOtherPackages.slice(0, 4).join(", ")}`);
  if (workspace.workspaceDevCandidates?.length) lines.push(`Workspace dev candidates: ${workspace.workspaceDevCandidates.slice(0, 3).join(" | ")}`);
  if (workspace.workspaceVerifyCandidates?.length) lines.push(`Workspace verify candidates: ${workspace.workspaceVerifyCandidates.slice(0, 3).join(" | ")}`);
  if (workspace.workspaceGlobs?.length) lines.push(`Workspace globs: ${workspace.workspaceGlobs.join(", ")}`);
  if (workspace.stackHints?.length) lines.push(`Stack: ${workspace.stackHints.join(", ")}`);
  if (workspace.scriptNames?.length) lines.push(`Scripts: ${workspace.scriptNames.join(", ")}`);
  if (workspace.devCommand) lines.push(`Dev command: ${workspace.devCommand}`);
  if (workspace.verifyCommand) lines.push(`Verify command: ${workspace.verifyCommand}`);
  if (workspace.reason) lines.push(`Reason: ${workspace.reason}`);
  if (workspace.markers?.length) lines.push(`Markers: ${workspace.markers.join(", ")}`);
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
  lines.push(`Root: ${workspace.root}`);
  if (workspace.workspaceAppPackages?.length) lines.push(`Apps: ${workspace.workspaceAppPackages.join(", ")}`);
  if (workspace.workspaceLibraryPackages?.length) lines.push(`Libraries: ${workspace.workspaceLibraryPackages.join(", ")}`);
  if (workspace.workspaceOtherPackages?.length) lines.push(`Other packages: ${workspace.workspaceOtherPackages.join(", ")}`);
  if (workspace.workspaceGlobs?.length) lines.push(`Workspaces: ${workspace.workspaceGlobs.join(", ")}`);
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
  lines.push(`Root: ${workspace.root}`);
  if (rootCommand) {
    lines.push(`${rootLabel}: ${rootCommand}`);
  } else {
    lines.push(`${rootLabel}: none`);
  }
  if (candidates?.length) {
    lines.push(`${packageLabel}: ${candidates.join(" | ")}`);
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
