/**
 * Phase 227 Verification Script - Launch Alpha 0 Guardrails
 *
 * Verifies source+Bun launch docs, GitHub local action guardrails, and
 * local-only web-control mutation handoff behavior.
 *
 * Run: bun run src/verify-phase227.ts
 */

import { readFile } from "fs/promises";

import {
  createGitHubLocalWorkspaceActionPlan,
  summarizeGitHubPrHandoffPlan,
} from "./github-pr-handoff";
import {
  handleWebControlRequest,
  serializeWebControlState,
} from "./web-control";
import { DaemonAuthPolicy } from "./daemon";

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

function section(title: string): void {
  console.log(`\n${"=".repeat(60)}\n  ${title}\n${"=".repeat(60)}`);
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

async function verifyLaunchDocs(): Promise<void> {
  section("1. Launch docs");
  const readme = await readFile("README.md", "utf8");
  const launch = await readFile("docs/LAUNCH_ALPHA_0.md", "utf8");
  assert(readme.includes("bun run verify:alpha0"), "README exposes alpha verification");
  assert(readme.includes("/swarm llm"), "README documents real swarm demo path");
  assert(launch.includes("Claim-Safety Matrix"), "Launch doc has claim-safety matrix");
  assert(launch.includes("must not claim"), "Launch doc names forbidden claims");
}

function verifyGitHubLocalActionGuardrails(): void {
  section("2. GitHub local workspace action guardrails");
  const handoff = summarizeGitHubPrHandoffPlan({
    issue: {
      url: "https://github.com/acme/widget/issues/42?token=ghp_secretvalue",
      title: "Fix alpha install",
    },
    workspaceRoot: "D:/repo",
  });
  const missing = createGitHubLocalWorkspaceActionPlan({
    plan: handoff,
    approvalSignature: "",
    approvedBy: "operator",
  });
  assertEqual(missing.ok, false, "Missing approval is rejected");
  assert(!JSON.stringify(missing).includes("ghp_secretvalue"), "Rejected action redacts token-bearing URL");

  const approved = createGitHubLocalWorkspaceActionPlan({
    plan: handoff,
    approvalSignature: handoff.localWorkspaceApprovalSignature,
    approvedBy: "operator",
  });
  assertEqual(approved.ok, true, "Exact approval signature creates host action plan");
  assertEqual(approved.action?.kind, "create_local_git_workspace", "Approved action is local workspace only");
  assert(approved.action?.commands.every((command) => !command.includes("push") && !command.includes("pull-request")) ?? false, "Approved commands do not push or create PRs");
  assert(approved.action?.boundaries.includes("No git push is executed by this action plan.") ?? false, "Approved plan states no push boundary");
}

async function verifyWebControlMutationGuardrails(): Promise<void> {
  section("3. Web-control mutation guardrails");
  const authPolicy = new DaemonAuthPolicy({
    tokens: [
      { token: "read-token", scopes: ["web.read"] },
      { token: "mutate-token", scopes: ["web.read", "web.mutate"] },
    ],
  });

  const readonly = serializeWebControlState({}, () => "2026-05-09T00:00:00.000Z");
  assertEqual(readonly.readOnly, true, "Default serialized control state is read-only");
  assertEqual(readonly.mutationEndpoints.length, 0, "Default serialized control state has no mutation endpoints");

  const missingScope = await handleWebControlRequest(
    new Request("http://127.0.0.1/control/action", {
      method: "POST",
      headers: { authorization: "Bearer read-token" },
      body: JSON.stringify({ action: "resume_swarm", runId: "swarm_alpha", approved: true }),
    }),
    {
      state: {},
      authPolicy,
      mutation: { enabled: true },
    },
  );
  assertEqual(missingScope.status, 403, "Mutation requires web.mutate scope");

  const publicHost = await handleWebControlRequest(
    new Request("https://example.com/control/action", {
      method: "POST",
      headers: { authorization: "Bearer mutate-token" },
      body: JSON.stringify({ action: "resume_swarm", runId: "swarm_alpha", approved: true }),
    }),
    {
      state: {},
      authPolicy,
      mutation: { enabled: true },
    },
  );
  assertEqual(publicHost.status, 403, "Mutation rejects non-local hosts");

  const accepted = await handleWebControlRequest(
    new Request("http://localhost/control/action", {
      method: "POST",
      headers: { authorization: "Bearer mutate-token" },
      body: JSON.stringify({ action: "resume_swarm", runId: "swarm_alpha", approved: true }),
    }),
    {
      state: {},
      authPolicy,
      mutation: { enabled: true },
    },
  );
  const body = await json(accepted);
  assertEqual(accepted.status, 202, "Local scoped mutation handoff is accepted");
  assertEqual(body.executed, false, "Web control mutation handoff does not execute directly");
  assertEqual(body.publicHosting, false, "Web control mutation handoff is not public hosting");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 227 Verification (Alpha Guardrails)\n");
  await verifyLaunchDocs();
  verifyGitHubLocalActionGuardrails();
  await verifyWebControlMutationGuardrails();

  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 227: alpha guardrails are GREEN.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
