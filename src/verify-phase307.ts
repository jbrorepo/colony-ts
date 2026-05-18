import { SlashCommandParser } from "./gateway";
import { BrowserSidecarRuntime } from "./browser/browser-sidecar-runtime";
import { WorkflowRecipeRuntime } from "./workflow/recipes/executable-recipes";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const browser = new BrowserSidecarRuntime();
const workflow = new WorkflowRecipeRuntime({ now: () => 3000 });
const run = await workflow.start("review");
const parser = new SlashCommandParser({ browser: { runtime: browser }, workflow: { recipeRuntime: workflow }, plugins: { entries: [] } });
assert(parser.tryHandle("/status operator").output.includes("Browser:"), "operator dashboard includes browser");
assert(parser.tryHandle(`/workflow inspect ${run.runId}`).output.includes("Approval state:"), "workflow inspect includes approval state");
assert(parser.tryHandle("/plugins status").output.includes("Plugin Status:"), "plugins status renders");

console.log("Phase 307: cross-surface operator consistency is GREEN.");
