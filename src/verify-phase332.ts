import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parser = new SlashCommandParser();

const missingStart = parser.tryHandle("/workflow start");
assert(missingStart.isError, "missing workflow start recipe id is rejected");
assert(missingStart.action?.kind !== "start_workflow_recipe", "missing workflow start emits no runtime action");
assert(missingStart.output.includes("Workflow recipe id required."), "missing workflow start explains requirement");
assert(missingStart.output.includes("/workflow start <recipe>"), "missing workflow start gives retry command");

const flagOnlyStart = parser.tryHandle("/workflow start --approved");
assert(flagOnlyStart.isError, "flag-only workflow start recipe id is rejected");
assert(flagOnlyStart.action?.kind !== "start_workflow_recipe", "flag-only workflow start emits no runtime action");
assert(flagOnlyStart.output.includes("Workflow recipe id required."), "flag-only workflow start explains requirement");

const unknownStart = parser.tryHandle("/workflow start missing-recipe");
assert(unknownStart.isError, "unknown workflow start recipe is rejected");
assert(unknownStart.output.includes("Unknown workflow recipe: missing-recipe"), "unknown workflow recipe is named");

const validStart = parser.tryHandle("/workflow start review");
assert(!validStart.isError, "valid workflow start recipe is accepted");
assert(validStart.action?.kind === "start_workflow_recipe", "valid workflow start emits runtime action");
assert(validStart.action && "recipeId" in validStart.action && validStart.action.recipeId === "review", "valid workflow start preserves recipe id");

console.log("Phase 332: workflow start recipe identifiers are required.");
