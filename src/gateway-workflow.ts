import type { RuntimeWorkflowRunSnapshot } from "./runtime/runtime-snapshot";
import {
  getWorkflowRecipe,
  listWorkflowRecipes,
  type WorkflowRecipeDescriptor,
} from "./workflow/recipes/gstack-inspired";

export interface GatewayWorkflowCommandPayload {
  output: string;
  isError?: boolean;
  data?: Record<string, unknown>;
}

export type WorkflowViewMode = "summary" | "active" | "latest" | "recipes" | { inspectRecipe: string };

export function workflowInspectViews(): string {
  return "/workflow | /workflow active | /workflow latest | /workflow recipes | /workflow inspect <recipe>";
}

export function resolveWorkflowView(args: string[]): WorkflowViewMode | { error: string } {
  const raw = args[0]?.trim().toLowerCase();
  if (!raw || raw === "summary" || raw === "all") return "summary";
  if (raw === "active" || raw === "running" || raw === "paused") return "active";
  if (raw === "latest" || raw === "recent") return "latest";
  if (raw === "recipes") return "recipes";
  if (raw === "inspect") return { inspectRecipe: args[1] ?? "" };
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
}): GatewayWorkflowCommandPayload {
  const view = resolveWorkflowView(opts.args);
  if (typeof view === "object") {
    if ("inspectRecipe" in view) {
      const recipe = getWorkflowRecipe(view.inspectRecipe);
      if (!recipe) {
        return {
          output: `Workflow recipe not found: ${view.inspectRecipe}\n\nViews: ${workflowInspectViews()}`,
          isError: true,
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

function renderWorkflowRecipesView(recipes: WorkflowRecipeDescriptor[]): string {
  const lines = ["Workflow Recipes:", ""];
  for (const recipe of recipes) {
    lines.push(`- ${recipe.id} | ${recipe.status} | ${recipe.summary}`);
  }
  lines.push("");
  lines.push("Inspect: /workflow inspect <recipe>");
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
