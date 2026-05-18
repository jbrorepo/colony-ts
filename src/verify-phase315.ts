import {
  createBrowserExecutionHandlers,
  createWorkflowRecipeExecutionHandlers,
} from "./gateway-market-handoffs";
import { BrowserSidecarRuntime } from "./browser/browser-sidecar-runtime";
import { WorkflowRecipeRuntime } from "./workflow/recipes/executable-recipes";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

{
  const runtime = new BrowserSidecarRuntime();
  const handlers = createBrowserExecutionHandlers(runtime);
  const blocked = await handlers.requestBrowserOpen?.("https://example.com");
  assert(String(blocked).includes("blocked"), "browser handoff reports blocked open before start");
  assert(runtime.snapshot().currentUrl === undefined, "blocked browser open does not mutate current URL");
}

{
  const runtime = new BrowserSidecarRuntime();
  runtime.start({ approved: true, approvedBy: "operator", reason: "phase 315" });
  const handlers = createBrowserExecutionHandlers(runtime);
  const opened = await handlers.requestBrowserOpen?.("https://example.com");
  assert(String(opened).includes("opened"), "browser handoff opens approved URL through runtime");
  assert(runtime.snapshot().currentUrl === "https://example.com/", "browser runtime records opened URL");

  const typed = await handlers.requestBrowserType?.("#q", "hello ghp_secret123");
  assert(String(typed).includes("typed"), "browser type handoff records write receipt");
  assert(!String(typed).includes("ghp_secret123"), "browser type handoff output redacts input secrets");
  assert(runtime.writeReceipts()[0]?.credentialsPersisted === false, "browser write receipt preserves no credential persistence");
}

{
  const runtime = new WorkflowRecipeRuntime({ now: () => 123 });
  const handlers = createWorkflowRecipeExecutionHandlers(runtime);
  const started = await handlers.startWorkflowRecipe?.("qa");
  assert(String(started).includes("Workflow recipe started."), "workflow handoff starts recipe runtime");
  assert(String(started).includes("Recipe: qa"), "workflow start output names recipe");
  assert(String(started).includes("Next valid command:"), "workflow start output includes next action");
  const runId = String(started).match(/Run: (wfr_[A-Za-z0-9_-]+)/)?.[1];
  assert(runId, "workflow start output includes run id");

  const resumed = await handlers.resumeWorkflowRecipe?.(runId);
  assert(String(resumed).includes("Workflow recipe resumed."), "workflow resume handoff resumes recipe runtime");

  const cancelled = await handlers.cancelWorkflowRecipe?.(runId);
  assert(String(cancelled).includes("Workflow recipe cancelled."), "workflow cancel handoff cancels recipe runtime");
}

console.log("Phase 315: market-parity host runtime adapters are GREEN.");
