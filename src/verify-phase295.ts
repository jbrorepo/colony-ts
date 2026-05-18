import { createExecutableWorkflowRecipe } from "./workflow/recipes/executable-recipes";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const qa = createExecutableWorkflowRecipe("qa");
assert(qa !== null, "qa executable recipe exists");
assert(qa.definition.steps.some((step) => step.id === "browser_verify"), "qa recipe includes browser verification integration");
assert(qa.handlers.browser_verify, "qa recipe provides browser verification handler");

console.log("Phase 295: browser workflow recipe integration is GREEN.");
