import { createExecutableWorkflowRecipe, listExecutableWorkflowRecipes } from "./workflow/recipes/executable-recipes";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const ids = listExecutableWorkflowRecipes().map((recipe) => recipe.id).join(",");
for (const id of ["review", "qa", "ship", "investigate", "document-release"]) {
  assert(ids.includes(id), `missing executable recipe ${id}`);
  const recipe = createExecutableWorkflowRecipe(id);
  assert(recipe?.definition.steps.some((step) => step.kind === "approval"), `${id} has approval checkpoint`);
  assert(Object.keys(recipe?.handlers ?? {}).length > 0, `${id} has handlers`);
}

console.log("Phase 296: executable workflow recipe templates are GREEN.");
