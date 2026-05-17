/**
 * Phase 20 Verification Script - Workflow Foundation
 *
 * Covers the first Phase 3 workflow slice:
 *   1. DAG definition validation and deterministic topological order
 *   2. Checkpoint persistence and crash-resume through the JSON workflow store
 *   3. Retry behavior, approval pause/resume, and artifact capture
 *
 * Run: bun run src/verify-phase20.ts
 */

import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import {
  createAgentLoopTaskStep,
  createAgentLoopWorkflowHandler,
  createApprovalGatedDeliveryWorkflow,
  WorkflowAutomationController,
  createLinearAgentLoopWorkflow,
  createWorkflowTaskTemplateStep,
  listWorkflowTemplates,
  WorkflowEngine,
  JsonWorkflowStore,
  WorkflowRuntimeRunner,
  WorkflowSessionBudgetPolicy,
  workflowRunToRuntimeSnapshot,
  validateWorkflowDefinition,
} from "./workflow";
import type { WorkflowDefinition } from "./workflow";
import { Caste } from "./caste/enums";
import { LLMProvider, type CompletionParams } from "./llm/base";
import { createLLMResponse, type LLMChunk, type LLMMessage, type LLMResponse, type ModelInfo } from "./llm/models";
import { providerManager } from "./llm/provider-manager";
import { AgentLoop } from "./runtime/loop";
import { createAgentSession } from "./runtime/session";

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
  if (actual === expected) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.error(`  FAIL ${label} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

class WorkflowTaskProvider extends LLMProvider {
  capturedMessages: LLMMessage[][] = [];

  constructor() {
    super("workflow_task_mock");
  }

  async complete(messages: LLMMessage[], params?: CompletionParams): Promise<LLMResponse> {
    this.capturedMessages.push(messages);
    return createLLMResponse("Agent completed workflow step", params?.model ?? "workflow-task-model", this.providerName, {
      usage: {
        promptTokens: 12,
        completionTokens: 4,
        totalTokens: 16,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      finishReason: "stop",
    });
  }

  async *stream(_messages: LLMMessage[], params?: CompletionParams): AsyncIterable<LLMChunk> {
    yield {
      delta: "Agent completed workflow step",
      model: params?.model ?? "workflow-task-model",
      finishReason: "stop",
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  listModels(): ModelInfo[] {
    return [{
      modelId: "workflow-task-model",
      provider: this.providerName,
      contextWindow: 4096,
      supportsStreaming: true,
      supportsEmbedding: false,
      supportsToolUse: false,
    }];
  }
}

function verifyDagValidation(): void {
  section("1. Workflow DAG Validation");

  const definition: WorkflowDefinition = {
    id: "wf_release",
    title: "Release workflow",
    steps: [
      { id: "plan", title: "Plan release", kind: "task" },
      { id: "build", title: "Build release", kind: "task", dependsOn: ["plan"] },
      { id: "verify", title: "Verify release", kind: "task", dependsOn: ["build"] },
    ],
  };

  const valid = validateWorkflowDefinition(definition);
  assertEqual(valid.ok, true, "A linear DAG validates");
  assertEqual(valid.order.join(">"), "plan>build>verify", "Topological order is deterministic");

  const duplicate = validateWorkflowDefinition({
    id: "wf_duplicate",
    title: "Duplicate step workflow",
    steps: [
      { id: "plan", title: "Plan", kind: "task" },
      { id: "plan", title: "Plan again", kind: "task" },
    ],
  });
  assertEqual(duplicate.ok, false, "Duplicate step ids are rejected");
  assert(duplicate.errors.some((error) => error.includes("Duplicate step id: plan")), "Duplicate error names the step");

  const missingDependency = validateWorkflowDefinition({
    id: "wf_missing_dep",
    title: "Missing dependency workflow",
    steps: [
      { id: "verify", title: "Verify", kind: "task", dependsOn: ["build"] },
    ],
  });
  assertEqual(missingDependency.ok, false, "Missing dependencies are rejected");
  assert(missingDependency.errors.some((error) => error.includes("depends on unknown step: build")), "Missing dependency error names the dependency");

  const cyclic = validateWorkflowDefinition({
    id: "wf_cycle",
    title: "Cyclic workflow",
    steps: [
      { id: "a", title: "A", kind: "task", dependsOn: ["b"] },
      { id: "b", title: "B", kind: "task", dependsOn: ["a"] },
    ],
  });
  assertEqual(cyclic.ok, false, "Cycles are rejected");
  assert(cyclic.errors.some((error) => error.includes("cycle")), "Cycle error is explicit");
}

async function verifyCheckpointResumeRetryApprovalAndArtifacts(): Promise<void> {
  section("2. Checkpoint, Resume, Retry, Approval, Artifact");

  const dir = await mkdtemp(join(tmpdir(), "colony-workflow-"));
  try {
    const store = new JsonWorkflowStore({ rootDir: dir });
    const engine = new WorkflowEngine({ store });

    const definition: WorkflowDefinition = {
      id: "wf_phase3_foundation",
      title: "Phase 3 foundation",
      steps: [
        { id: "plan", title: "Plan", kind: "task" },
        { id: "approval", title: "Approval checkpoint", kind: "approval", dependsOn: ["plan"] },
        { id: "build", title: "Build", kind: "task", dependsOn: ["approval"], maxAttempts: 2 },
        { id: "verify", title: "Verify", kind: "task", dependsOn: ["build"] },
      ],
    };

    const run = await engine.start(definition);
    assertEqual(run.status, "pending", "New workflow starts pending");
    assertEqual(run.steps.plan.status, "pending", "Step state is initialized");

    const paused = await engine.runUntilBlocked(run.id, {
      plan: async () => ({
        summary: "Plan captured",
        artifacts: [{ type: "markdown", name: "plan.md", content: "# Plan\n\n- Build workflow foundation." }],
      }),
    });

    assertEqual(paused.status, "paused", "Approval step pauses the run");
    assertEqual(paused.steps.plan.status, "completed", "Completed dependency is checkpointed");
    assertEqual(paused.steps.approval.status, "awaiting_approval", "Approval step records awaiting state");
    assertEqual(paused.artifacts.length, 1, "Task artifact is captured");
    assertEqual(paused.checkpoints.at(-1)?.blockedStepId, "approval", "Checkpoint records blocked approval step");

    const resumedEngine = new WorkflowEngine({ store: new JsonWorkflowStore({ rootDir: dir }) });
    const persistedPaused = await resumedEngine.loadRun(run.id);
    assertEqual(persistedPaused?.status, "paused", "Paused run reloads from durable store");

    const approved = await resumedEngine.approveStep(run.id, "approval", "operator");
    assertEqual(approved.status, "running", "Approval resumes the run");
    assertEqual(approved.steps.approval.status, "completed", "Approval step completes after approval");
    assertEqual(approved.steps.approval.approvedBy, "operator", "Approval records approver");

    let buildAttempts = 0;
    const completed = await resumedEngine.runUntilBlocked(run.id, {
      build: async () => {
        buildAttempts++;
        if (buildAttempts === 1) throw new Error("transient build failure");
        return {
          summary: "Build succeeded",
          artifacts: [{ type: "json", name: "build.json", content: "{\"ok\":true}" }],
        };
      },
      verify: async () => ({ summary: "Verification passed" }),
    });

    assertEqual(completed.status, "completed", "Workflow completes after approval and retry");
    assertEqual(completed.steps.build.status, "completed", "Retried step completes");
    assertEqual(completed.steps.build.attempts, 2, "Retry attempt count is persisted");
    assertEqual(buildAttempts, 2, "Retry handler ran twice");
    assert(completed.artifacts.some((artifact) => artifact.stepId === "build" && artifact.name === "build.json"), "Build artifact is captured");
    assert(completed.checkpoints.some((checkpoint) => checkpoint.status === "completed"), "Completion checkpoint is recorded");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function verifyStepBudgetAndApprovalPolicies(): Promise<void> {
  section("3. Step Budget and Approval Policies");

  const dir = await mkdtemp(join(tmpdir(), "colony-workflow-policy-"));
  try {
    const budgetStore = new JsonWorkflowStore({ rootDir: join(dir, "budget") });
    const budgetPolicy = new WorkflowSessionBudgetPolicy({
      maxTokens: 100,
      maxUsd: 1,
      sessionId: "wf_budget",
    });
    const budgetEngine = new WorkflowEngine({ store: budgetStore, budgetPolicy });
    const budgetRun = await budgetEngine.start({
      id: "wf_budget_policy",
      title: "Budget policy workflow",
      steps: [
        {
          id: "expensive",
          title: "Expensive task",
          kind: "task",
          budget: { estimatedTokens: 120, estimatedUsd: 0.25 },
        },
      ],
    });

    let expensiveExecuted = false;
    const denied = await budgetEngine.runUntilBlocked(budgetRun.id, {
      expensive: async () => {
        expensiveExecuted = true;
        return { summary: "Should not execute" };
      },
    });

    assertEqual(denied.status, "failed", "Workflow fails before over-budget task execution");
    assertEqual(expensiveExecuted, false, "Over-budget task handler is not invoked");
    assertEqual(denied.steps.expensive.status, "failed", "Over-budget task is marked failed");
    assert(denied.steps.expensive.lastError?.includes("Session token budget exceeded") ?? false, "Budget denial reason is recorded on the step");
    assertEqual(denied.checkpoints.at(-1)?.failedStepId, "expensive", "Budget denial records failed step checkpoint");

    const approvedBudgetPolicy = new WorkflowSessionBudgetPolicy({
      maxTokens: 100,
      maxUsd: 1,
      sessionId: "wf_budget_allowed",
    });
    const allowedEngine = new WorkflowEngine({
      store: new JsonWorkflowStore({ rootDir: join(dir, "allowed-budget") }),
      budgetPolicy: approvedBudgetPolicy,
    });
    const allowedRun = await allowedEngine.start({
      id: "wf_budget_allowed",
      title: "Allowed budget workflow",
      steps: [
        {
          id: "small",
          title: "Small task",
          kind: "task",
          budget: { estimatedTokens: 40, estimatedUsd: 0.10 },
        },
      ],
    });
    const allowed = await allowedEngine.runUntilBlocked(allowedRun.id, {
      small: async () => ({ summary: "Small task completed" }),
    });
    assertEqual(allowed.status, "completed", "In-budget task completes");
    assertEqual(approvedBudgetPolicy.stats.totalTokens, 40, "Workflow budget policy records estimated token spend");
    assertEqual(approvedBudgetPolicy.stats.totalUsd, 0.10, "Workflow budget policy records estimated dollar spend");

    const approvalEngine = new WorkflowEngine({
      store: new JsonWorkflowStore({ rootDir: join(dir, "approval") }),
    });
    const approvalRun = await approvalEngine.start({
      id: "wf_approval_policy",
      title: "Approval policy workflow",
      steps: [
        { id: "plan", title: "Plan", kind: "task" },
        {
          id: "approval",
          title: "Release approval",
          kind: "approval",
          dependsOn: ["plan"],
          approval: {
            reason: "Release requires manager signoff",
            requiredApprover: "release-manager",
          },
        },
      ],
    });
    const paused = await approvalEngine.runUntilBlocked(approvalRun.id, {
      plan: async () => ({ summary: "Plan ready" }),
    });
    assertEqual(paused.status, "paused", "Approval policy still pauses the workflow");
    assertEqual(paused.steps.approval.summary, "Release requires manager signoff", "Approval policy reason is visible on the awaiting step");

    try {
      await approvalEngine.approveStep(approvalRun.id, "approval", "operator");
      assert(false, "Wrong approver is rejected");
    } catch (error) {
      assert(String(error).includes("requires approver release-manager"), "Wrong approver error names required approver");
    }

    const approved = await approvalEngine.approveStep(approvalRun.id, "approval", "release-manager");
    assertEqual(approved.steps.approval.approvedBy, "release-manager", "Required approver can approve the step");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function verifyRuntimeRunnerHooksAndSnapshots(): Promise<void> {
  section("4. Runtime Runner Hooks and Snapshots");

  const dir = await mkdtemp(join(tmpdir(), "colony-workflow-runtime-"));
  try {
    const engine = new WorkflowEngine({
      store: new JsonWorkflowStore({ rootDir: dir }),
    });
    const events: Array<{ kind: string; stepId?: unknown; runId?: unknown; status?: unknown }> = [];
    const runner = new WorkflowRuntimeRunner({
      engine,
      hooks: [async (event) => {
        events.push({
          kind: event.kind,
          stepId: event.data.stepId,
          runId: event.data.runId,
          status: event.data.status,
        });
      }],
    });

    const definition: WorkflowDefinition = {
      id: "wf_runtime_hooks",
      title: "Runtime hook workflow",
      steps: [
        { id: "plan", title: "Plan", kind: "task" },
        { id: "approval", title: "Approval", kind: "approval", dependsOn: ["plan"] },
        { id: "build", title: "Build", kind: "task", dependsOn: ["approval"] },
      ],
    };

    const paused = await runner.startAndRun(definition, {
      plan: async () => ({ summary: "Plan done" }),
    });

    assertEqual(paused.status, "paused", "Runtime runner returns paused workflow run");
    assert(events.some((event) => event.kind === "WorkflowRunStarted" && event.runId === paused.id), "Runtime runner emits workflow-start hook");
    assert(events.some((event) => event.kind === "PreWorkflowStep" && event.stepId === "plan"), "Runtime runner emits pre-step hook");
    assert(events.some((event) => event.kind === "PostWorkflowStep" && event.stepId === "plan"), "Runtime runner emits post-step hook");
    assert(events.some((event) => event.kind === "WorkflowRunBlocked" && event.stepId === "approval"), "Runtime runner emits blocked hook for approval pause");

    const pausedSnapshot = workflowRunToRuntimeSnapshot(paused);
    assertEqual(pausedSnapshot.runId, paused.id, "Runtime snapshot carries workflow run id");
    assertEqual(pausedSnapshot.status, "paused", "Runtime snapshot carries paused status");
    assertEqual(pausedSnapshot.completedSteps, 1, "Runtime snapshot counts completed steps");
    assertEqual(pausedSnapshot.totalSteps, 3, "Runtime snapshot counts total steps");
    assertEqual(pausedSnapshot.awaitingStepId, "approval", "Runtime snapshot exposes awaiting approval step");
    assertEqual(pausedSnapshot.checkpointCount, paused.checkpoints.length, "Runtime snapshot carries checkpoint count");

    events.length = 0;
    const completed = await runner.approveAndRun(paused.id, "approval", "operator", {
      build: async () => ({ summary: "Build done" }),
    });
    assertEqual(completed.status, "completed", "Runtime runner resumes and completes workflow");
    assert(events.some((event) => event.kind === "WorkflowRunResumed" && event.runId === paused.id), "Runtime runner emits resume hook");
    assert(events.some((event) => event.kind === "PreWorkflowStep" && event.stepId === "build"), "Runtime runner emits pre-step hook after resume");
    assert(events.some((event) => event.kind === "WorkflowRunCompleted" && event.status === "completed"), "Runtime runner emits completed hook");

    const completedSnapshot = workflowRunToRuntimeSnapshot(completed);
    assertEqual(completedSnapshot.status, "completed", "Completed snapshot carries completed status");
    assertEqual(completedSnapshot.completedSteps, 3, "Completed snapshot counts all completed steps");
    assertEqual(completedSnapshot.awaitingStepId, undefined, "Completed snapshot clears awaiting step");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function verifyAgentLoopBackedWorkflowTaskHandler(): Promise<void> {
  section("5. AgentLoop-Backed Workflow Task Handler");

  const provider = new WorkflowTaskProvider();
  providerManager.register("workflow_task_mock", provider);

  const dir = await mkdtemp(join(tmpdir(), "colony-workflow-agent-loop-"));
  try {
    const engine = new WorkflowEngine({
      store: new JsonWorkflowStore({ rootDir: dir }),
    });
    const runner = new WorkflowRuntimeRunner({ engine });
    const step = createAgentLoopTaskStep({
      id: "draft",
      title: "Draft answer",
      task: "Draft the release note from workflow context.",
      maxAttempts: 2,
      budget: { estimatedTokens: 64, estimatedUsd: 0.01 },
    });
    assertEqual(step.kind, "task", "AgentLoop task template creates task step");
    assertEqual(step.maxAttempts, 2, "AgentLoop task template preserves retry policy");
    assertEqual(step.budget?.estimatedTokens, 64, "AgentLoop task template preserves budget estimate");

    const definition: WorkflowDefinition = {
      id: "wf_agent_loop_task",
      title: "Agent loop workflow",
      steps: [step],
    };
    const handler = createAgentLoopWorkflowHandler({
      createLoop: () => new AgentLoop({
        session: createAgentSession({
          agentId: "workflow-agent",
          caste: Caste.ASSIST_ANT,
        }),
        config: {
          tenant: "workflow-runtime",
          model: "workflow-task-model",
          maxIterations: 1,
          cavemanBridge: false,
        },
        usageTracker: null,
        llmConfig: {
          defaults: { provider: "workflow_task_mock", model: "workflow-task-model" },
          providers: { workflow_task_mock: { defaultModel: "workflow-task-model" } },
          casteModels: {},
          failover: {},
        },
      }),
      prompt: ({ run, step: handlerStep, attempt }) => [
        `Workflow: ${run.definition.title}`,
        `Step: ${handlerStep.title}`,
        `Attempt: ${attempt}`,
        `Task: ${handlerStep.agentLoop?.task}`,
      ].join("\n"),
      artifactName: "agent-loop-result.json",
    });

    const completed = await runner.startAndRun(definition, { draft: handler });

    assertEqual(completed.status, "completed", "AgentLoop-backed workflow task completes");
    assert(completed.steps.draft.summary?.includes("Agent completed workflow step") ?? false, "AgentLoop task summary uses final loop content");
    assertEqual(completed.artifacts.length, 1, "AgentLoop task captures result artifact");
    assertEqual(completed.artifacts[0]?.name, "agent-loop-result.json", "AgentLoop task artifact name is configurable");
    assert(completed.artifacts[0]?.content?.includes("\"terminationReason\":\"complete\"") ?? false, "AgentLoop task artifact records termination reason");
    assert(provider.capturedMessages.at(-1)?.some((message) => message.content.includes("Workflow: Agent loop workflow")) ?? false, "AgentLoop task prompt includes workflow context");
    assert(provider.capturedMessages.at(-1)?.some((message) => message.content.includes("Task: Draft the release note")) ?? false, "AgentLoop task prompt includes task template text");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function verifyPackagedWorkflowTemplates(): void {
  section("6. Packaged Workflow Templates");

  const templates = listWorkflowTemplates();
  assert(templates.some((template) => template.id === "agent_loop_linear"), "Template library advertises linear AgentLoop workflow");
  assert(templates.some((template) => template.id === "approval_gated_delivery"), "Template library advertises approval-gated delivery workflow");
  assert(templates
    .filter((template) => template.id === "agent_loop_linear" || template.id === "approval_gated_delivery")
    .every((template) => template.phase === 3), "Template library records Phase 3 ownership for foundation templates");
  assert(templates.some((template) => template.id === "github_pr_handoff" && template.phase === 6), "Template library records Phase 6 ownership for GitHub PR handoff");

  const planStep = createWorkflowTaskTemplateStep("plan", {
    id: "plan",
    objective: "Ship workflow template coverage.",
    budget: { estimatedTokens: 50, estimatedUsd: 0.02 },
  });
  assertEqual(planStep.title, "Plan", "Task template uses kind title when title omitted");
  assert(Boolean(planStep.agentLoop?.task.includes("Ship workflow template coverage")), "Task template includes objective in AgentLoop task text");
  assertEqual(planStep.budget?.estimatedTokens, 50, "Task template preserves budget estimate");

  const linear = createLinearAgentLoopWorkflow({
    id: "wf_linear_template",
    title: "Linear template",
    objective: "Deliver a linear workflow.",
    tasks: [
      { id: "plan", kind: "plan" },
      { id: "execute", kind: "execute" },
      { id: "verify", kind: "verify" },
    ],
    defaultBudget: { estimatedTokens: 25, estimatedUsd: 0.01 },
  });
  const linearValidation = validateWorkflowDefinition(linear);
  assertEqual(linearValidation.ok, true, "Linear AgentLoop workflow template validates");
  assertEqual(linearValidation.order.join(">"), "plan>execute>verify", "Linear workflow template chains task dependencies");
  assertEqual(linear.steps[1]?.dependsOn?.join(","), "plan", "Linear workflow execute step depends on plan");
  assertEqual(linear.steps[2]?.budget?.estimatedTokens, 25, "Linear workflow applies default budget to templated steps");

  const gated = createApprovalGatedDeliveryWorkflow({
    id: "wf_delivery_template",
    title: "Delivery template",
    objective: "Ship the release safely.",
    requiredApprover: "release-manager",
    defaultBudget: { estimatedTokens: 30, estimatedUsd: 0.02 },
  });
  const gatedValidation = validateWorkflowDefinition(gated);
  assertEqual(gatedValidation.ok, true, "Approval-gated delivery workflow validates");
  assertEqual(gatedValidation.order.join(">"), "plan>approval>cost_gate>execute>verify", "Approval-gated workflow has stable delivery order");
  assertEqual(gated.steps[1]?.kind, "approval", "Approval-gated workflow inserts approval checkpoint");
  assertEqual(gated.steps[1]?.approval?.requiredApprover, "release-manager", "Approval-gated workflow preserves required approver");
  assertEqual(gated.steps[2]?.kind, "approval", "Approval-gated workflow inserts cost checkpoint");
  assertEqual(gated.steps[3]?.dependsOn?.join(","), "cost_gate", "Approval-gated execute step waits for cost gate");
  assert(Boolean(gated.steps[4]?.agentLoop?.task.includes("Verify")), "Approval-gated workflow includes verify AgentLoop task text");
}

async function verifyRemoteWorkflowAutomationController(): Promise<void> {
  section("7. Remote Workflow Automation Controller");

  const dir = await mkdtemp(join(tmpdir(), "colony-workflow-automation-"));
  try {
    const events: string[] = [];
    const engine = new WorkflowEngine({
      store: new JsonWorkflowStore({ rootDir: dir }),
    });
    const controller = new WorkflowAutomationController({
      engine,
      handlers: {
        plan: async () => ({ summary: "Remote plan complete" }),
        execute: async () => ({ summary: "Remote execute complete" }),
        verify: async () => ({ summary: "Remote verify complete" }),
      },
      hooks: [async (event) => {
        events.push(`${event.kind}:${String(event.data.stepId ?? event.data.status ?? "")}`);
      }],
    });

    const listed = await controller.handle({
      type: "list_templates",
      requestId: "req_list",
    });
    assertEqual(listed.ok, true, "Automation controller lists templates");
    assert(listed.templates?.some((template) => template.id === "approval_gated_delivery") ?? false, "Automation controller exposes approval-gated template");

    const started = await controller.handle({
      type: "start_template",
      requestId: "req_start",
      templateId: "approval_gated_delivery",
      workflowId: "wf_remote_delivery",
      title: "Remote delivery",
      objective: "Ship daemon workflow automation.",
      requiredApprover: "ops-lead",
    });
    assertEqual(started.ok, true, "Automation controller starts template workflow");
    assertEqual(started.snapshot?.status, "paused", "Automation start returns paused snapshot");
    assertEqual(started.snapshot?.awaitingStepId, "approval", "Automation start returns awaiting approval step");
    assert(events.some((entry) => entry === "WorkflowRunStarted:pending"), "Automation controller emits start lifecycle hook");
    assert(events.some((entry) => entry === "WorkflowRunBlocked:approval"), "Automation controller emits blocked lifecycle hook");
    assert(JSON.stringify(started).includes("\"requestId\":\"req_start\""), "Automation response is serializable and keeps request id");

    const inspected = await controller.handle({
      type: "inspect",
      requestId: "req_inspect",
      runId: started.snapshot!.runId,
    });
    assertEqual(inspected.ok, true, "Automation controller inspects persisted run");
    assertEqual(inspected.snapshot?.runId, started.snapshot?.runId, "Automation inspect returns same run id");

    const approved = await controller.handle({
      type: "approve",
      requestId: "req_approve",
      runId: started.snapshot!.runId,
      stepId: "approval",
      approvedBy: "ops-lead",
    });
    assertEqual(approved.ok, true, "Automation controller approves and resumes workflow");
    assertEqual(approved.snapshot?.status, "paused", "Automation first approval returns paused cost-gate snapshot");
    assertEqual(approved.snapshot?.awaitingStepId, "cost_gate", "Automation first approval pauses at cost gate");

    const costApproved = await controller.handle({
      type: "approve",
      requestId: "req_approve_cost",
      runId: started.snapshot!.runId,
      stepId: "cost_gate",
      approvedBy: "ops-lead",
    });
    assertEqual(costApproved.ok, true, "Automation controller approves cost gate and resumes workflow");
    assertEqual(costApproved.snapshot?.status, "completed", "Automation cost approval returns completed snapshot");
    assertEqual(costApproved.snapshot?.completedSteps, 5, "Automation cost approval executes remaining task handlers");

    const missing = await controller.handle({
      type: "inspect",
      requestId: "req_missing",
      runId: "wfr_missing",
    });
    assertEqual(missing.ok, false, "Automation controller reports missing run errors");
    assert(missing.error?.includes("not found") ?? false, "Automation missing-run error is explicit");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 20 Verification (Workflow Foundation)\n");

  verifyDagValidation();
  await verifyCheckpointResumeRetryApprovalAndArtifacts();
  await verifyStepBudgetAndApprovalPolicies();
  await verifyRuntimeRunnerHooksAndSnapshots();
  await verifyAgentLoopBackedWorkflowTaskHandler();
  verifyPackagedWorkflowTemplates();
  await verifyRemoteWorkflowAutomationController();

  console.log("\n" + "=".repeat(60));
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nPhase 20: Workflow foundation is GREEN.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
