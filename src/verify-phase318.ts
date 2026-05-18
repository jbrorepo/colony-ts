import { SlashCommandParser } from "./gateway";
import { WorkflowRecipeRuntime } from "./workflow/recipes/executable-recipes";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const runtime = new WorkflowRecipeRuntime({ now: () => 4000 });
const started = await runtime.start("investigate");
const parser = new SlashCommandParser({ workflow: { recipeRuntime: runtime } });

const active = parser.tryHandle("/workflow active");
assert(active.output.includes("Workflow Runs:"), "workflow active renders list view");
assert(active.output.includes(started.runId), "workflow active includes cached recipe runtime run");
assert(active.output.includes("Workflow Recipe: Investigate"), "workflow active includes recipe runtime title");
assert(active.output.includes("Awaiting: approval"), "workflow active includes awaiting approval state");
assert(active.output.includes(`/workflow inspect ${started.runId}`), "workflow active includes exact inspect path");

const latest = parser.tryHandle("/workflow latest");
assert(latest.output.includes("Latest Workflow:"), "workflow latest renders latest view");
assert(latest.output.includes(`Run: ${started.runId}`), "workflow latest includes cached recipe runtime run");
assert(latest.output.includes("Definition: recipe_investigate"), "workflow latest includes projected recipe definition");
assert(latest.output.includes("Status: paused"), "workflow latest includes runtime status");
assert(latest.output.includes("Awaiting: approval"), "workflow latest includes awaiting approval state");

console.log("Phase 318: workflow active/latest include cached recipe runtime runs.");
