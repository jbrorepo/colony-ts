import { WorkflowRecipeRuntime } from "./workflow/recipes/executable-recipes";
import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const runtime = new WorkflowRecipeRuntime({ now: () => 2000 });
const run = await runtime.start("ship");
const parser = new SlashCommandParser({ workflow: { recipeRuntime: runtime } });
assert(parser.tryHandle(`/workflow inspect ${run.runId}`).output.includes("Next valid command:"), "workflow inspect includes next command");
assert(parser.tryHandle(`/workflow artifacts ${run.runId}`).output.includes("Workflow Artifacts:"), "workflow artifacts renders");
const cancelled = await runtime.cancel(run.runId);
assert(cancelled.status === "cancelled", "recipe runtime can cancel paused run");

console.log("Phase 298: workflow artifacts and resume/cancel truth are GREEN.");
