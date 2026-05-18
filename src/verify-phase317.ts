import { SlashCommandParser } from "./gateway";
import { WorkflowRecipeRuntime } from "./workflow/recipes/executable-recipes";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const runtime = new WorkflowRecipeRuntime({ now: () => 3000 });
const started = await runtime.start("ship");
const parser = new SlashCommandParser({ workflow: { recipeRuntime: runtime } });

const inspected = parser.tryHandle(`/workflow inspect ${started.runId}`);
assert(inspected.output.includes("Workflow Run:"), "workflow inspect renders runtime run view");
assert(inspected.output.includes(`Run: ${started.runId}`), "workflow inspect includes exact run id");
assert(inspected.output.includes("Recipe: ship"), "workflow inspect includes recipe id");
assert(inspected.output.includes("Status: paused"), "workflow inspect includes actual status");
assert(inspected.output.includes("Awaiting: approval"), "workflow inspect includes awaiting approval step");
assert(inspected.output.includes(`Next valid command: /workflow resume ${started.runId}`), "workflow inspect includes exact next command");

const artifacts = parser.tryHandle(`/workflow artifacts ${started.runId}`);
assert(artifacts.output.includes("Workflow Artifacts:"), "workflow artifacts renders runtime artifacts view");
assert(artifacts.output.includes(`Run: ${started.runId}`), "workflow artifacts includes exact run id");
assert(artifacts.output.includes("ship-scope.txt"), "workflow artifacts includes runtime artifact name");
assert(artifacts.output.includes("Next valid command: /workflow inspect"), "workflow artifacts includes inspect next command");

const missing = parser.tryHandle("/workflow inspect wfr_missing");
assert(missing.output.includes("Workflow run or recipe: wfr_missing"), "missing runtime run keeps fallback inspect view");

console.log("Phase 317: workflow runtime inspect and artifacts are GREEN.");
