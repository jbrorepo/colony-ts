import type { RuntimeWorkflowRunSnapshot } from "./runtime/runtime-snapshot";
import {
  getWorkflowRecipe,
  listWorkflowRecipes,
  type WorkflowRecipeDescriptor,
} from "./workflow/recipes/gstack-inspired";
import type { WorkflowRecipeRuntime } from "./workflow/recipes/executable-recipes";
import type { WorkflowRecipeRuntimeSnapshot } from "./workflow/recipes/executable-recipes";

export interface GatewayWorkflowCommandPayload {
  output: string;
  isError?: boolean;
  data?: Record<string, unknown>;
  action?: Record<string, unknown>;
}

export type WorkflowViewMode = "summary" | "active" | "latest" | "recipes" | { inspectRecipe: string } | { startRecipe: string } | { resumeRun: string } | { cancelRun: string } | { artifactsRun: string };

export function workflowInspectViews(): string {
  return "/workflow | /workflow active | /workflow latest | /workflow recipes | /workflow start <recipe> | /workflow inspect <recipe|run_id> | /workflow resume <run_id> | /workflow cancel <run_id> | /workflow artifacts <run_id>";
}

export function resolveWorkflowView(args: string[]): WorkflowViewMode | { error: string } {
  const raw = args[0]?.trim().toLowerCase();
  if (!raw || raw === "summary" || raw === "all") return "summary";
  if (raw === "active" || raw === "running" || raw === "paused") return "active";
  if (raw === "latest" || raw === "recent") return "latest";
  if (raw === "recipes") return "recipes";
  if (raw === "start") return { startRecipe: args[1] ?? "" };
  if (raw === "inspect") return { inspectRecipe: args[1] ?? "" };
  if (raw === "resume") return { resumeRun: args[1] ?? "" };
  if (raw === "cancel") return { cancelRun: args[1] ?? "" };
  if (raw === "artifacts") return { artifactsRun: args[1] ?? "" };
  return {
    error: `Unknown workflow view '${raw}'.\n\nViews: ${workflowInspectViews()}`,
  };
}

export function activeWorkflowCount(runs: RuntimeWorkflowRunSnapshot[]): number {
  return runs.filter((run) => isActiveWorkflowStatus(run.status)).length;
}

export function latestWorkflowRun(runs: RuntimeWorkflowRunSnapshot[]): RuntimeWorkflowRunSnapshot | null {
  if (runs.length === 0) return null;
  return [...runs].sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))[0] ?? null;
}

export function workflowProgressLine(run: RuntimeWorkflowRunSnapshot): string {
  const title = run.title || run.definitionId || "untitled";
  return `${run.runId} | ${title} | ${run.status} | ${run.completedSteps}/${run.totalSteps} steps`;
}

export function workflowDetailLine(run: RuntimeWorkflowRunSnapshot): string {
  return [
    `${run.runId} | ${run.status} | ${run.completedSteps}/${run.totalSteps} steps`,
    `artifacts ${run.artifactCount ?? 0}`,
    `checkpoints ${run.checkpointCount ?? 0}`,
  ].join(" | ");
}

export function workflowStatusLines(runs: RuntimeWorkflowRunSnapshot[]): string[] {
  if (runs.length === 0) return [];
  const latest = latestWorkflowRun(runs);
  const lines = [`Active/paused: ${activeWorkflowCount(runs)}`];
  if (latest) {
    lines.push(`Latest workflow: ${workflowDetailLine(latest)}`);
    if (latest.awaitingStepId) lines.push(`Awaiting: ${latest.awaitingStepId}`);
    if (latest.failedStepId) lines.push(`Failed step: ${latest.failedStepId}`);
  }
  lines.push(`Inspect workflows: ${workflowInspectViews()}`);
  return lines;
}

export function buildWorkflowCommandPayload(opts: {
  args: string[];
  runs: RuntimeWorkflowRunSnapshot[];
  recipeRuntime?: WorkflowRecipeRuntime | null;
}): GatewayWorkflowCommandPayload {
  const view = resolveWorkflowView(opts.args);
  if (typeof view === "object") {
    if ("startRecipe" in view) {
      return {
        output: [
          "Workflow Recipe Start:",
          "",
          `Recipe: ${view.startRecipe}`,
          opts.recipeRuntime ? "Runtime: available" : "Runtime: unavailable in this context",
          "Next valid command: /workflow inspect <run_id> | /workflow resume <run_id>",
        ].join("\n"),
        data: { view: "start", recipe: view.startRecipe },
        action: { kind: "start_workflow_recipe", recipeId: view.startRecipe },
      };
    }
    if ("resumeRun" in view || "cancelRun" in view) {
      const runId = "resumeRun" in view ? view.resumeRun : view.cancelRun;
      const actionKind = "resumeRun" in view ? "resume_workflow_recipe" : "cancel_workflow_recipe";
      return {
        output: [
          "Workflow Run Control:",
          "",
          `Run: ${runId}`,
          "Approval state: command accepted as operator handoff; runtime execution remains host-owned here.",
          "Next valid command: /workflow inspect <run_id> | /workflow artifacts <run_id>",
        ].join("\n"),
        data: { view: "control", runId },
        action: { kind: actionKind, runId },
      };
    }
    if ("artifactsRun" in view) {
      const runtimeRun = opts.recipeRuntime?.inspectCached(view.artifactsRun) ?? null;
      if (runtimeRun) {
        return {
          output: renderWorkflowRuntimeArtifacts(runtimeRun),
          data: { view: "artifacts", runId: runtimeRun.runId, count: runtimeRun.artifacts.length },
        };
      }
      return {
        output: [
          "Workflow Artifacts:",
          "",
          `Run: ${view.artifactsRun}`,
          "Artifacts are bounded operator outputs from executable recipes.",
          "Next valid command: /workflow inspect <run_id>",
        ].join("\n"),
        data: { view: "artifacts", runId: view.artifactsRun },
      };
    }
    if ("inspectRecipe" in view) {
      const runtimeRun = opts.recipeRuntime?.inspectCached(view.inspectRecipe) ?? null;
      if (runtimeRun) {
        return {
          output: renderWorkflowRuntimeInspect(runtimeRun),
          data: { view: "inspect", runId: runtimeRun.runId, recipe: runtimeRun.recipeId },
        };
      }
      const recipe = getWorkflowRecipe(view.inspectRecipe);
      if (!recipe) {
        return {
          output: [
            `Workflow run or recipe: ${view.inspectRecipe}`,
            "",
            "Approval state: unknown in current parser context.",
            "Next valid command: /workflow recipes | /workflow active | /workflow latest",
            "",
            `Views: ${workflowInspectViews()}`,
          ].join("\n"),
          data: { view: "inspect", recipe: view.inspectRecipe },
        };
      }
      return {
        output: renderWorkflowRecipeInspect(recipe),
        data: { view: "inspect", recipe: recipe.id },
      };
    }
    return {
      output: view.error,
      isError: true,
    };
  }

  const runs = [...opts.runs].sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
  if (view === "recipes") {
    const recipes = listWorkflowRecipes();
    return {
      output: renderWorkflowRecipesView(recipes),
      data: { view, count: recipes.length },
    };
  }
  if (view === "latest") {
    return {
      output: renderWorkflowLatestView(latestWorkflowRun(runs)),
      data: { view, count: runs.length },
    };
  }

  const selectedRuns = view === "active"
    ? runs.filter((run) => isActiveWorkflowStatus(run.status))
    : runs;

  return {
    output: renderWorkflowSummaryView(selectedRuns, runs.length, view),
    data: { view, count: selectedRuns.length, total: runs.length },
  };
}

function renderWorkflowRuntimeInspect(run: WorkflowRecipeRuntimeSnapshot): string {
  return [
    "Workflow Run:",
    "",
    `Run: ${run.runId}`,
    `Recipe: ${run.recipeId}`,
    `Title: ${run.title}`,
    `Status: ${run.status}`,
    `Progress: ${run.completedSteps}/${run.totalSteps} steps`,
    run.awaitingStepId ? `Awaiting: ${run.awaitingStepId}` : "",
    run.failedStepId ? `Failed step: ${run.failedStepId}` : "",
    `Approval state: ${run.approvalState}`,
    `Artifacts: ${run.artifactCount}`,
    `Checkpoints: ${run.checkpointCount}`,
    `Updated: ${new Date(run.updatedAt).toISOString()}`,
    "",
    `Next valid command: ${run.nextCommand}`,
  ].filter(Boolean).join("\n");
}

function renderWorkflowRuntimeArtifacts(run: WorkflowRecipeRuntimeSnapshot): string {
  return [
    "Workflow Artifacts:",
    "",
    `Run: ${run.runId}`,
    `Recipe: ${run.recipeId}`,
    ...(run.artifacts.length === 0
      ? ["(No workflow artifacts recorded)"]
      : run.artifacts.map((artifact) => `- ${artifact.id} | ${artifact.name} | ${artifact.type}`)),
    "",
    `Next valid command: /workflow inspect ${run.runId}`,
  ].join("\n");
}

function renderWorkflowRecipesView(recipes: WorkflowRecipeDescriptor[]): string {
  const lines = ["Workflow Recipes:", ""];
  for (const recipe of recipes) {
    lines.push(`- ${recipe.id} | ${recipe.status} | ${recipe.summary}`);
  }
  lines.push("");
  lines.push("Inspect: /workflow inspect <recipe>");
  lines.push("Start: /workflow start <recipe>");
  lines.push("No live GitHub, browser, deploy, or channel mutation by default.");
  return lines.join("\n");
}

function renderWorkflowRecipeInspect(recipe: WorkflowRecipeDescriptor): string {
  return [
    `Workflow Recipe: ${recipe.id}`,
    "",
    `Title: ${recipe.title}`,
    `Status: ${recipe.status}`,
    `Summary: ${recipe.summary}`,
    "No live GitHub, browser, deploy, or channel mutation by default.",
    "",
    "Steps:",
    ...recipe.steps.map((step) => `- ${step.id} | ${step.kind} | ${step.title} - ${step.description}`),
    "",
    "Approval checkpoints:",
    ...recipe.approvalCheckpoints.map((checkpoint) => `- ${checkpoint}`),
    "",
    "Verification:",
    ...recipe.verification.map((item) => `- ${item}`),
    "",
    "Next valid command: /workflow start " + recipe.id,
  ].join("\n");
}

function renderWorkflowSummaryView(
  runs: RuntimeWorkflowRunSnapshot[],
  totalCount: number,
  view: WorkflowViewMode,
): string {
  const lines = ["Workflow Runs:", ""];
  lines.push(`Total: ${totalCount}`);
  lines.push(`Active/paused: ${activeWorkflowCount(runs)}`);
  if (runs.length === 0) {
    lines.push(view === "active" ? "(No active or paused workflow runs)" : "(No workflow runs recorded)");
  } else {
    for (const run of runs.slice(0, 8)) {
      lines.push(`- ${workflowProgressLine(run)}`);
      if (run.awaitingStepId) lines.push(`  Awaiting: ${run.awaitingStepId}`);
      if (run.failedStepId) lines.push(`  Failed step: ${run.failedStepId}`);
    }
  }
  lines.push("");
  lines.push(`Views: ${workflowInspectViews()}`);
  return lines.join("\n");
}

function renderWorkflowLatestView(run: RuntimeWorkflowRunSnapshot | null): string {
  const lines = ["Latest Workflow:", ""];
  if (!run) {
    lines.push("(No workflow runs recorded)");
  } else {
    lines.push(`Run: ${run.runId}`);
    lines.push(`Definition: ${run.definitionId ?? "unknown"}`);
    lines.push(`Title: ${run.title ?? "untitled"}`);
    lines.push(`Status: ${run.status}`);
    lines.push(`Progress: ${run.completedSteps}/${run.totalSteps} steps`);
    if (run.awaitingStepId) lines.push(`Awaiting: ${run.awaitingStepId}`);
    if (run.failedStepId) lines.push(`Failed step: ${run.failedStepId}`);
    lines.push(`Artifacts: ${run.artifactCount ?? 0}`);
    lines.push(`Checkpoints: ${run.checkpointCount ?? 0}`);
    if (typeof run.updatedAt === "number") lines.push(`Updated: ${new Date(run.updatedAt).toISOString()}`);
  }
  lines.push("");
  lines.push(`Views: ${workflowInspectViews()}`);
  return lines.join("\n");
}

function isActiveWorkflowStatus(status: string): boolean {
  return status === "pending" || status === "running" || status === "paused";
}
