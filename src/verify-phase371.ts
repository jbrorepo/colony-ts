import {
  buildWorkflowCommandPayload,
  workflowDetailLine,
  workflowProgressLine,
  workflowStatusLines,
} from "./gateway-workflow";
import type { RuntimeWorkflowRunSnapshot } from "./runtime/runtime-snapshot";
import type {
  WorkflowRecipeRuntime,
  WorkflowRecipeRuntimeSnapshot,
} from "./workflow/recipes/executable-recipes";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertRedacted(output: string, label: string): void {
  assert(!output.includes("WORKFLOW_SURFACE_"), `${label} redacts token metadata bodies`);
  assert(!output.includes("github_pat_"), `${label} redacts GitHub PAT prefix`);
  assert(!output.includes("ghp_"), `${label} redacts GitHub token prefix`);
}

const runtimeRun: RuntimeWorkflowRunSnapshot = {
  runId: "wfr_ghp_WORKFLOW_SURFACE_RUN_ID_SHOULD_NOT_LEAK12345678",
  definitionId: "recipe_github_pat_WORKFLOW_SURFACE_DEFINITION_SHOULD_NOT_LEAK12345678",
  title: "Ship release ghp_WORKFLOW_SURFACE_TITLE_SHOULD_NOT_LEAK12345678",
  status: "paused ghp_WORKFLOW_SURFACE_STATUS_SHOULD_NOT_LEAK12345678",
  completedSteps: 2,
  totalSteps: 5,
  awaitingStepId: "approval_ghp_WORKFLOW_SURFACE_AWAITING_SHOULD_NOT_LEAK12345678",
  failedStepId: "execute_github_pat_WORKFLOW_SURFACE_FAILED_SHOULD_NOT_LEAK12345678",
  artifactCount: 1,
  checkpointCount: 1,
  updatedAt: 3_000,
};

const recipeSnapshot: WorkflowRecipeRuntimeSnapshot = {
  runId: runtimeRun.runId,
  recipeId: "ship ghp_WORKFLOW_SURFACE_RECIPE_SHOULD_NOT_LEAK12345678",
  title: "Workflow Recipe github_pat_WORKFLOW_SURFACE_RECIPE_TITLE_SHOULD_NOT_LEAK12345678",
  status: "paused ghp_WORKFLOW_SURFACE_RECIPE_STATUS_SHOULD_NOT_LEAK12345678",
  completedSteps: 2,
  totalSteps: 5,
  awaitingStepId: runtimeRun.awaitingStepId,
  failedStepId: runtimeRun.failedStepId,
  artifactCount: 1,
  checkpointCount: 1,
  updatedAt: 3_000,
  nextCommand: `/workflow resume ${runtimeRun.runId}`,
  approvalState: "awaiting approval ghp_WORKFLOW_SURFACE_APPROVAL_SHOULD_NOT_LEAK12345678",
  artifacts: [
    {
      id: "artifact_ghp_WORKFLOW_SURFACE_ARTIFACT_ID_SHOULD_NOT_LEAK12345678",
      name: "release github_pat_WORKFLOW_SURFACE_ARTIFACT_NAME_SHOULD_NOT_LEAK12345678.md",
      type: "markdown ghp_WORKFLOW_SURFACE_ARTIFACT_TYPE_SHOULD_NOT_LEAK12345678",
    },
  ],
};

const recipeRuntime = {
  inspectCached(runId: string) {
    return runId === recipeSnapshot.runId ? { ...recipeSnapshot, artifacts: recipeSnapshot.artifacts.map((artifact) => ({ ...artifact })) } : null;
  },
  listCached() {
    return [{ ...recipeSnapshot, artifacts: recipeSnapshot.artifacts.map((artifact) => ({ ...artifact })) }];
  },
} as unknown as WorkflowRecipeRuntime;

const progress = workflowProgressLine(runtimeRun);
assert(progress.includes("wfr_[REDACTED] | Ship release [REDACTED] | paused [REDACTED] | 2/5 steps"), "workflow progress line redacts run metadata");
assertRedacted(progress, "workflow progress line");

const detail = workflowDetailLine(runtimeRun);
assert(detail.includes("wfr_[REDACTED] | paused [REDACTED] | 2/5 steps"), "workflow detail line redacts run metadata");
assertRedacted(detail, "workflow detail line");

const statusLines = workflowStatusLines([runtimeRun]).join("\n");
assert(statusLines.includes("Latest workflow: wfr_[REDACTED] | paused [REDACTED] | 2/5 steps"), "workflow status lines redact latest run");
assert(statusLines.includes("Awaiting: approval_[REDACTED]"), "workflow status lines redact awaiting step");
assert(statusLines.includes("Failed step: execute_[REDACTED]"), "workflow status lines redact failed step");
assertRedacted(statusLines, "workflow status lines");

const summary = buildWorkflowCommandPayload({ args: [], runs: [runtimeRun] }).output;
assert(summary.includes("- wfr_[REDACTED] | Ship release [REDACTED] | paused [REDACTED] | 2/5 steps"), "workflow summary redacts run line");
assert(summary.includes("Inspect: /workflow inspect wfr_[REDACTED]"), "workflow summary redacts inspect command");
assertRedacted(summary, "workflow summary");

const latest = buildWorkflowCommandPayload({ args: ["latest"], runs: [runtimeRun] }).output;
assert(latest.includes("Run: wfr_[REDACTED]"), "workflow latest redacts run id");
assert(latest.includes("Definition: recipe_[REDACTED]"), "workflow latest redacts definition id");
assert(latest.includes("Title: Ship release [REDACTED]"), "workflow latest redacts title");
assert(latest.includes("Status: paused [REDACTED]"), "workflow latest redacts status");
assertRedacted(latest, "workflow latest");

const inspected = buildWorkflowCommandPayload({ args: ["inspect", recipeSnapshot.runId], runs: [], recipeRuntime }).output;
assert(inspected.includes("Run: wfr_[REDACTED]"), "workflow runtime inspect redacts run id");
assert(inspected.includes("Recipe: ship [REDACTED]"), "workflow runtime inspect redacts recipe id");
assert(inspected.includes("Approval state: awaiting approval [REDACTED]"), "workflow runtime inspect redacts approval state");
assert(inspected.includes("Next valid command: /workflow resume wfr_[REDACTED]"), "workflow runtime inspect redacts next command");
assertRedacted(inspected, "workflow runtime inspect");

const artifacts = buildWorkflowCommandPayload({ args: ["artifacts", recipeSnapshot.runId], runs: [], recipeRuntime }).output;
assert(artifacts.includes("Run: wfr_[REDACTED]"), "workflow artifacts redacts run id");
assert(artifacts.includes("- artifact_[REDACTED] | release [REDACTED].md | markdown [REDACTED]"), "workflow artifacts redact artifact metadata");
assert(artifacts.includes("Next valid command: /workflow inspect wfr_[REDACTED]"), "workflow artifacts redacts next command");
assertRedacted(artifacts, "workflow artifacts");

console.log("Phase 371: workflow status surfaces redact secret-shaped metadata.");
