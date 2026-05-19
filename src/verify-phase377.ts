import { buildWorkspaceCommandPayload, type GatewayWorkspaceView } from "./gateway-workspace";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertNoLeak(output: string, label: string): void {
  const leaked = [
    "WORKSPACE_ROOT_SHOULD_NOT_LEAK",
    "WORKSPACE_NAME_SHOULD_NOT_LEAK",
    "WORKSPACE_START_SHOULD_NOT_LEAK",
    "WORKSPACE_TARGET_SHOULD_NOT_LEAK",
    "WORKSPACE_APP_SHOULD_NOT_LEAK",
    "WORKSPACE_LIB_SHOULD_NOT_LEAK",
    "WORKSPACE_OTHER_SHOULD_NOT_LEAK",
    "WORKSPACE_DEV_SHOULD_NOT_LEAK",
    "WORKSPACE_VERIFY_SHOULD_NOT_LEAK",
    "WORKSPACE_GLOB_SHOULD_NOT_LEAK",
    "WORKSPACE_STACK_SHOULD_NOT_LEAK",
    "WORKSPACE_SCRIPT_SHOULD_NOT_LEAK",
    "WORKSPACE_REASON_SHOULD_NOT_LEAK",
    "WORKSPACE_MARKER_SHOULD_NOT_LEAK",
    "github_pat_",
    "ghp_",
    "sk-ant-",
  ];

  for (const needle of leaked) {
    assert(!output.includes(needle), `${label} leaks ${needle}`);
  }
}

const workspace: GatewayWorkspaceView = {
  detected: true,
  name: "colony-ghp_WORKSPACE_NAME_SHOULD_NOT_LEAK12345678",
  root: "D:\\secrets\\github_pat_WORKSPACE_ROOT_SHOULD_NOT_LEAK12345678\\colony-ts",
  startDir: "D:\\secrets\\ghp_WORKSPACE_START_SHOULD_NOT_LEAK12345678\\src",
  projectType: "typescript",
  packageManager: "bun",
  workspaceMode: "single-package",
  workspaceIntent: "terminal-app ghp_WORKSPACE_INTENT_SHOULD_NOT_LEAK12345678",
  workspacePrimaryTargets: ["target-ghp_WORKSPACE_TARGET_SHOULD_NOT_LEAK12345678"],
  workspacePackageCount: 3,
  workspaceAppCount: 1,
  workspaceLibraryCount: 1,
  workspaceOtherCount: 1,
  workspaceAppPackages: ["app-ghp_WORKSPACE_APP_SHOULD_NOT_LEAK12345678"],
  workspaceLibraryPackages: ["lib-github_pat_WORKSPACE_LIB_SHOULD_NOT_LEAK12345678"],
  workspaceOtherPackages: ["other-ghp_WORKSPACE_OTHER_SHOULD_NOT_LEAK12345678"],
  workspaceDevCandidates: ["app: bun run dev --token ghp_WORKSPACE_DEV_SHOULD_NOT_LEAK12345678"],
  workspaceVerifyCandidates: ["lib: bun run verify --token github_pat_WORKSPACE_VERIFY_SHOULD_NOT_LEAK12345678"],
  workspaceGlobs: ["apps/ghp_WORKSPACE_GLOB_SHOULD_NOT_LEAK12345678/*"],
  stackHints: ["ink-ghp_WORKSPACE_STACK_SHOULD_NOT_LEAK12345678"],
  scriptNames: ["verify:ghp_WORKSPACE_SCRIPT_SHOULD_NOT_LEAK12345678"],
  devCommand: "bun run dev --api-key sk-ant-WORKSPACE_DEV_COMMAND_SHOULD_NOT_LEAK1234567890",
  verifyCommand: "bun run verify --token ghp_WORKSPACE_VERIFY_COMMAND_SHOULD_NOT_LEAK12345678",
  reason: "marker includes github_pat_WORKSPACE_REASON_SHOULD_NOT_LEAK12345678",
  markers: ["package.json-ghp_WORKSPACE_MARKER_SHOULD_NOT_LEAK12345678"],
};

const summary = buildWorkspaceCommandPayload([], workspace);
assert(!summary.isError, "workspace summary renders");
assertNoLeak(summary.output, "workspace summary");
assert(summary.output.includes("[REDACTED]") || summary.output.includes("****"), "workspace summary shows redaction evidence");

const packages = buildWorkspaceCommandPayload(["packages"], workspace);
assert(!packages.isError, "workspace packages renders");
assertNoLeak(packages.output, "workspace packages");

const dev = buildWorkspaceCommandPayload(["dev"], workspace);
assert(!dev.isError, "workspace dev renders");
assertNoLeak(dev.output, "workspace dev");

const verify = buildWorkspaceCommandPayload(["verify"], workspace);
assert(!verify.isError, "workspace verify renders");
assertNoLeak(verify.output, "workspace verify");

console.log("Phase 377: workspace status surfaces redact secret-shaped metadata.");
