import type { CommandExecutionHandlers } from "./gateway-execute";
import {
  BrowserSidecarRuntime,
  type BrowserArtifactMetadata,
  type BrowserWriteReceipt,
} from "./browser/browser-sidecar-runtime";
import {
  WorkflowRecipeRuntime,
  type WorkflowRecipeRuntimeSnapshot,
} from "./workflow/recipes/executable-recipes";

const HANDOFF_APPROVAL = {
  approved: true,
  approvedBy: "operator",
  reason: "approved slash-command host handoff",
} as const;

export function createBrowserExecutionHandlers(
  runtime: BrowserSidecarRuntime,
): Pick<
  CommandExecutionHandlers,
  | "requestBrowserOpen"
  | "requestBrowserScreenshot"
  | "requestBrowserClick"
  | "requestBrowserType"
  | "requestBrowserWait"
> {
  return {
    requestBrowserOpen: async (url) => {
      const result = await runtime.open(url, HANDOFF_APPROVAL);
      if (result.status === "blocked") return renderBrowserBlocked("open", result.reason);
      return [
        "Browser runtime opened.",
        `URL: ${result.snapshot.currentUrl ?? "unknown"}`,
        "Untrusted: yes",
        result.preview.text || "(No page text returned)",
        result.preview.truncated ? `Hidden chars: ${result.preview.hiddenChars}` : "",
      ].filter(Boolean).join("\n");
    },
    requestBrowserScreenshot: async () => {
      const result = await runtime.screenshot(HANDOFF_APPROVAL);
      if (result.status === "blocked") return renderBrowserBlocked("screenshot", result.reason);
      return renderBrowserArtifact(result.artifact);
    },
    requestBrowserClick: async (selector) => {
      const result = await runtime.click(selector, HANDOFF_APPROVAL);
      if (result.status === "blocked") return renderBrowserBlocked("click", result.reason);
      return renderBrowserReceipt("clicked", result.receipt);
    },
    requestBrowserType: async (selector, text) => {
      const result = await runtime.type(selector, text, HANDOFF_APPROVAL);
      if (result.status === "blocked") return renderBrowserBlocked("type", result.reason);
      return renderBrowserReceipt("typed", result.receipt);
    },
    requestBrowserWait: async (target) => {
      const result = await runtime.wait(target);
      return [
        "Browser runtime waited.",
        `Target: ${result.target}`,
        `Summary: ${result.summary}`,
        `Status: ${result.snapshot.status}`,
      ].join("\n");
    },
  };
}

export function createWorkflowRecipeExecutionHandlers(
  runtime: WorkflowRecipeRuntime,
): Pick<
  CommandExecutionHandlers,
  "startWorkflowRecipe" | "resumeWorkflowRecipe" | "cancelWorkflowRecipe"
> {
  return {
    startWorkflowRecipe: async (recipeId) => renderWorkflowSnapshot("started", await runtime.start(recipeId)),
    resumeWorkflowRecipe: async (runId) => renderWorkflowSnapshot("resumed", await runtime.resume(runId, { approvedBy: "operator" })),
    cancelWorkflowRecipe: async (runId) => renderWorkflowSnapshot("cancelled", await runtime.cancel(runId)),
  };
}

function renderBrowserBlocked(action: string, reason: string): string {
  return [
    `Browser runtime ${action} blocked.`,
    reason,
    "No browser process, listener, tunnel, credential store, or artifact path was created by default.",
  ].join("\n");
}

function renderBrowserArtifact(artifact: BrowserArtifactMetadata): string {
  return [
    "Browser runtime screenshot captured.",
    `Artifact: ${artifact.artifactId}`,
    `Name: ${artifact.name}`,
    `MIME: ${artifact.mimeType}`,
    `Bytes: ${artifact.bytes}`,
    "Untrusted: yes",
  ].join("\n");
}

function renderBrowserReceipt(verb: "clicked" | "typed", receipt: BrowserWriteReceipt): string {
  return [
    `Browser runtime ${verb}.`,
    `Receipt: ${receipt.receiptId}`,
    `Selector: ${receipt.selector}`,
    `Summary: ${receipt.summary}`,
    receipt.inputPreview ? `Input preview: ${receipt.inputPreview}` : "",
    `Credentials persisted: ${receipt.credentialsPersisted ? "yes" : "no"}`,
    `Default live mutation: ${receipt.defaultLiveMutation ? "yes" : "no"}`,
  ].filter(Boolean).join("\n");
}

function renderWorkflowSnapshot(verb: "started" | "resumed" | "cancelled", snapshot: WorkflowRecipeRuntimeSnapshot): string {
  return [
    `Workflow recipe ${verb}.`,
    `Run: ${snapshot.runId}`,
    `Recipe: ${snapshot.recipeId}`,
    `Status: ${snapshot.status}`,
    `Progress: ${snapshot.completedSteps}/${snapshot.totalSteps} steps`,
    `Approval: ${snapshot.approvalState}`,
    `Artifacts: ${snapshot.artifactCount}`,
    `Next valid command: ${snapshot.nextCommand}`,
  ].join("\n");
}
