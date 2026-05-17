/**
 * Phase 289 Verification Script - Swarm UX Polish
 *
 * Run: bun run src/verify-phase289.ts
 */

import { buildSwarmCommandPayload } from "./gateway-swarm";
import type { SwarmRunSnapshot } from "./orchestrator";

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

const run: SwarmRunSnapshot = {
  runId: "swarm_phase289",
  title: "Phase 289 Swarm",
  objective: "Polish swarm status output.",
  status: "failed",
  executionMode: "llm",
  maxAttempts: 2,
  execution: {
    executionId: "exec_phase289",
    title: "Phase 289 Swarm",
    status: "failed",
    objective: "Polish",
    taskIds: [],
    completedTaskIds: [],
    failedTaskIds: [],
    cancelledTaskIds: [],
    createdAt: "2026-05-16T00:00:00.000Z",
    updatedAt: "2026-05-16T00:01:00.000Z",
    metadata: {},
  },
  workers: [],
  tasks: [],
  workerCount: 3,
  taskCount: 3,
  assignedTaskCount: 3,
  completedTaskCount: 2,
  failedTaskCount: 1,
  cancelledTaskCount: 0,
  stages: [
    {
      stage: "plan",
      status: "completed",
      attempts: 1,
      summary: "Plan complete",
      artifacts: [],
      artifactCount: 0,
      artifactReview: [],
      startedAt: "2026-05-16T00:00:00.000Z",
      endedAt: "2026-05-16T00:00:10.000Z",
      totalTokens: 100,
      estimatedCostUsd: 0.01,
      retryHistory: [],
      updatedAt: "2026-05-16T00:00:10.000Z",
    },
    {
      stage: "execute",
      status: "failed",
      attempts: 2,
      summary: "Execute failed",
      failureReason: "tool approval expired",
      artifacts: [{ type: "text", name: "execute.log", content: "safe preview", metadata: {} }],
      artifactCount: 1,
      artifactReview: [{ type: "text", name: "execute.log", contentBytes: 12, metadataKeys: [], preview: "safe preview", externalContent: false }],
      startedAt: "2026-05-16T00:00:11.000Z",
      endedAt: "2026-05-16T00:00:30.000Z",
      totalTokens: 250,
      estimatedCostUsd: 0.03,
      retryHistory: [{ attempt: 1, status: "failed", failureReason: "provider timeout", artifactCount: 0, updatedAt: "2026-05-16T00:00:20.000Z" }],
      updatedAt: "2026-05-16T00:00:30.000Z",
    },
    {
      stage: "review",
      status: "pending",
      attempts: 0,
      artifacts: [],
      artifactCount: 0,
      artifactReview: [],
      retryHistory: [],
      updatedAt: "2026-05-16T00:01:00.000Z",
    },
  ],
  createdAt: "2026-05-16T00:00:00.000Z",
  updatedAt: "2026-05-16T00:01:00.000Z",
};

function verifySwarmStatusPolish(): void {
  const detail = buildSwarmCommandPayload(["status", "swarm_phase289"], { runs: [run] });
  assert(detail.output.includes("Run Summary:"), "/swarm status renders run summary section");
  assert(detail.output.includes("Progress: 2/3 complete | failed 1 | cancelled 0"), "/swarm status renders progress summary");
  assert(detail.output.includes("Usage: tokens 350 | cost $0.0400"), "/swarm status aggregates token/cost summary");
  assert(detail.output.includes("Latest failure: execute - tool approval expired"), "/swarm status renders latest failure summary");
  assert(detail.output.includes("Next actions:"), "/swarm status renders next actions");
  assert(detail.output.includes("/swarm retry swarm_phase289 execute"), "/swarm status suggests retry command");
  assert(detail.output.includes("Artifact Review:"), "/swarm status renders artifact review label");
}

async function main(): Promise<void> {
  console.log("THE COLONY - Phase 289 Verification (Swarm UX Polish)\n");
  verifySwarmStatusPolish();
  console.log(`\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) process.exit(1);
  console.log("\nPhase 289: swarm UX polish is GREEN.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
