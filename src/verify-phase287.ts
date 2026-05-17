/**
 * Phase 287 Verification Script - Workflow Recipes
 *
 * Run: bun run src/verify-phase287.ts
 */

import {
  getWorkflowRecipe,
  listWorkflowRecipes,
} from "./workflow/recipes/gstack-inspired";
import { buildWorkflowCommandPayload } from "./gateway-workflow";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  assert(actual === expected, `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

function verifyRecipes(): void {
  const recipes = listWorkflowRecipes();
  assertEqual(recipes.length, 5, "Five named recipes are available");
  assertEqual(recipes.map((recipe) => recipe.id).join(","), "review,qa,ship,investigate,document-release", "Recipes keep priority order");
  assert(recipes.every((recipe) => recipe.status === "descriptor_only"), "Recipes are descriptor-only");
  assert(recipes.every((recipe) => recipe.steps.some((step) => step.kind === "approval_checkpoint")), "Every recipe has approval checkpoint");
  assert(recipes.every((recipe) => recipe.steps.some((step) => step.kind === "verification")), "Every recipe has verification step");
  assert(recipes.every((recipe) => recipe.riskyActionsDefaultLive === false), "Recipes do not run risky actions by default");
  assertEqual(getWorkflowRecipe("QA")?.id, "qa", "Recipe lookup is case-insensitive");
}

function verifyGateway(): void {
  const recipes = buildWorkflowCommandPayload({ args: ["recipes"], runs: [] });
  assertEqual(recipes.data?.view, "recipes", "/workflow recipes data view is stable");
  assert(recipes.output.includes("Workflow Recipes:"), "/workflow recipes renders heading");
  assert(recipes.output.includes("review | descriptor_only"), "/workflow recipes lists review");
  assert(recipes.output.includes("document-release | descriptor_only"), "/workflow recipes lists document-release");

  const inspect = buildWorkflowCommandPayload({ args: ["inspect", "ship"], runs: [] });
  assertEqual(inspect.data?.recipe, "ship", "/workflow inspect returns recipe id");
  assert(inspect.output.includes("Workflow Recipe: ship"), "/workflow inspect renders recipe heading");
  assert(inspect.output.includes("Approval checkpoints:"), "/workflow inspect renders approval checkpoints");
  assert(inspect.output.includes("No live GitHub, browser, deploy, or channel mutation by default."), "/workflow inspect states host-handoff boundary");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 287 Verification (Workflow Recipes)\n");
  verifyRecipes();
  verifyGateway();
  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 287: workflow recipes are GREEN.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
