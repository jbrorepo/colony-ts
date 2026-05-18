import { WorkflowRecipeRuntime } from "./workflow/recipes/executable-recipes";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const runtime = new WorkflowRecipeRuntime({ now: () => 1000 });
const started = await runtime.start("review");
assert(started.status === "paused", "review recipe pauses at approval checkpoint");
assert(started.awaitingStepId === "approval", "review recipe awaits approval");
const resumed = await runtime.resume(started.runId, { approvedBy: "tester" });
assert(resumed.status === "completed", "approved recipe resumes to completion");
assert(resumed.artifactCount > 0, "recipe emits artifacts");

console.log("Phase 297: workflow approval/checkpoint behavior is GREEN.");
