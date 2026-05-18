import { SlashCommandParser } from "./gateway";
import { WorkflowRecipeRuntime } from "./workflow/recipes/executable-recipes";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parser = new SlashCommandParser();

const missingResume = parser.tryHandle("/workflow resume");
assert(missingResume.isError, "missing workflow resume run id is rejected");
assert(missingResume.action?.kind !== "resume_workflow_recipe", "missing workflow resume emits no runtime action");
assert(missingResume.output.includes("Workflow run id required."), "missing workflow resume explains requirement");
assert(missingResume.output.includes("/workflow resume <run_id>"), "missing workflow resume gives retry command");

const flagOnlyCancel = parser.tryHandle("/workflow cancel --approved");
assert(flagOnlyCancel.isError, "flag-only workflow cancel run id is rejected");
assert(flagOnlyCancel.action?.kind !== "cancel_workflow_recipe", "flag-only workflow cancel emits no runtime action");

const missingInspect = parser.tryHandle("/workflow inspect");
assert(missingInspect.isError, "missing workflow inspect target is rejected");
assert(missingInspect.output.includes("Workflow run or recipe id required."), "missing workflow inspect explains requirement");

const missingArtifacts = parser.tryHandle("/workflow artifacts");
assert(missingArtifacts.isError, "missing workflow artifacts run id is rejected");
assert(missingArtifacts.output.includes("Workflow run id required."), "missing workflow artifacts explains requirement");

const runtime = new WorkflowRecipeRuntime({ now: () => 4000 });
const started = await runtime.start("review");
const runtimeParser = new SlashCommandParser({ workflow: { recipeRuntime: runtime } });

const validInspect = runtimeParser.tryHandle(`/workflow inspect ${started.runId}`);
assert(!validInspect.isError, "valid workflow inspect run id is accepted");
assert(validInspect.output.includes(`Run: ${started.runId}`), "valid workflow inspect preserves run id");

const validResume = runtimeParser.tryHandle(`/workflow resume ${started.runId}`);
assert(!validResume.isError, "valid workflow resume run id is accepted");
assert(validResume.action?.kind === "resume_workflow_recipe", "valid workflow resume emits runtime action");
assert(validResume.action && "runId" in validResume.action && validResume.action.runId === started.runId, "valid workflow resume preserves run id");

console.log("Phase 327: workflow run command identifiers are required.");
