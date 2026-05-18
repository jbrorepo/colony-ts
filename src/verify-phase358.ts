import { buildToolsCommandPayload } from "./gateway-tools";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function renderTools(args: string[]) {
  return buildToolsCommandPayload({
    args,
    activeTools: [],
    permittedTools: [],
    deniedTools: [],
    sessionRuleCount: 0,
    pendingApproval: null,
    recentActivity: [
      {
        toolName: "file_read",
        status: "ok",
        detail: "preview github_pat_TOOL_DETAIL_SHOULD_NOT_LEAK12345678",
        artifactPath: "D:/tmp/ghp_ARTIFACT_PATH_SHOULD_NOT_LEAK12345678-result.json",
        durationMs: 42,
      },
      {
        toolName: "shell_exec",
        status: "error",
        detail: "stderr ghp_PERF_DETAIL_SHOULD_NOT_LEAK12345678",
        durationMs: 900,
      },
    ],
  });
}

const recent = renderTools(["recent"]);
assert(!recent.isError, "tools recent renders");
assert(recent.output.includes("file_read | ok | preview [REDACTED]"), "tools recent redacts detail tokens");
assert(recent.output.includes('Reopen: /artifact "D:/tmp/[REDACTED]-result.json"'), "tools recent redacts artifact path tokens");
assert(!recent.output.includes("TOOL_DETAIL_SHOULD_NOT_LEAK"), "tools recent redacts detail token body");
assert(!recent.output.includes("ARTIFACT_PATH_SHOULD_NOT_LEAK"), "tools recent redacts artifact token body");
assert(!recent.output.includes("github_pat_"), "tools recent redacts GitHub PAT prefixes");
assert(!recent.output.includes("ghp_"), "tools recent redacts GitHub token prefixes");

const artifacts = renderTools(["artifacts"]);
assert(!artifacts.isError, "tools artifacts renders");
assert(artifacts.output.includes("1. file_read | preview [REDACTED]"), "tools artifacts redacts detail tokens");
assert(artifacts.output.includes('Reopen: /artifact "D:/tmp/[REDACTED]-result.json"'), "tools artifacts redacts artifact path tokens");
assert(!artifacts.output.includes("TOOL_DETAIL_SHOULD_NOT_LEAK"), "tools artifacts redacts detail token body");
assert(!artifacts.output.includes("ARTIFACT_PATH_SHOULD_NOT_LEAK"), "tools artifacts redacts artifact token body");
assert(!artifacts.output.includes("github_pat_"), "tools artifacts redacts GitHub PAT prefixes");
assert(!artifacts.output.includes("ghp_"), "tools artifacts redacts GitHub token prefixes");

const perf = renderTools(["perf"]);
assert(!perf.isError, "tools perf renders");
assert(perf.output.includes("Slowest: shell_exec | 900ms | stderr [REDACTED]"), "tools perf redacts slowest detail tokens");
assert(perf.output.includes("- file_read | 42ms | ok | preview [REDACTED]"), "tools perf redacts measured detail tokens");
assert(!perf.output.includes("PERF_DETAIL_SHOULD_NOT_LEAK"), "tools perf redacts perf detail token body");
assert(!perf.output.includes("TOOL_DETAIL_SHOULD_NOT_LEAK"), "tools perf redacts measured detail token body");
assert(!perf.output.includes("github_pat_"), "tools perf redacts GitHub PAT prefixes");
assert(!perf.output.includes("ghp_"), "tools perf redacts GitHub token prefixes");

console.log("Phase 358: tools recent activity and artifact paths redact secret-shaped metadata.");
