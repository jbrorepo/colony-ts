import {
  formatSwarmRunDetail,
  formatSwarmRuns,
} from "./gateway-swarm";
import type { SwarmRunSnapshot } from "./orchestrator";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertRedacted(output: string, label: string): void {
  assert(!output.includes("SWARM_SURFACE_"), `${label} redacts token metadata bodies`);
  assert(!output.includes("github_pat_"), `${label} redacts GitHub PAT prefix`);
  assert(!output.includes("ghp_"), `${label} redacts GitHub token prefix`);
}

const run: SwarmRunSnapshot = {
  runId: "swarm_ghp_SWARM_SURFACE_RUN_ID_SHOULD_NOT_LEAK12345678",
  title: "Operator review ghp_SWARM_SURFACE_TITLE_SHOULD_NOT_LEAK12345678",
  objective: "Ship safely with github_pat_SWARM_SURFACE_OBJECTIVE_SHOULD_NOT_LEAK12345678",
  status: "failed",
  executionMode: "llm",
  maxAttempts: 2,
  execution: {
    executionId: "exec_ghp_SWARM_SURFACE_EXECUTION_ID_SHOULD_NOT_LEAK12345678",
    title: "Execution ghp_SWARM_SURFACE_EXECUTION_TITLE_SHOULD_NOT_LEAK12345678",
    objective: "Execution objective ghp_SWARM_SURFACE_EXECUTION_OBJECTIVE_SHOULD_NOT_LEAK12345678",
    status: "failed",
    taskIds: [],
    completedTaskIds: [],
    failedTaskIds: [],
    cancelledTaskIds: [],
    createdAt: "2026-05-18T11:20:00.000Z",
    updatedAt: "2026-05-18T11:21:00.000Z",
    metadata: {},
  },
  workers: [],
  tasks: [],
  workerCount: 2,
  taskCount: 2,
  assignedTaskCount: 2,
  completedTaskCount: 1,
  failedTaskCount: 1,
  cancelledTaskCount: 0,
  stages: [
    {
      stage: "plan",
      status: "completed",
      attempts: 1,
      summary: "Plan summary ghp_SWARM_SURFACE_STAGE_SUMMARY_SHOULD_NOT_LEAK12345678",
      artifacts: [],
      artifactCount: 0,
      artifactReview: [],
      startedAt: "2026-05-18T11:20:00.000Z ghp_SWARM_SURFACE_STAGE_STARTED_SHOULD_NOT_LEAK12345678",
      endedAt: "2026-05-18T11:20:10.000Z ghp_SWARM_SURFACE_STAGE_ENDED_SHOULD_NOT_LEAK12345678",
      retryHistory: [],
      updatedAt: "2026-05-18T11:20:10.000Z",
    },
    {
      stage: "execute",
      status: "failed",
      attempts: 2,
      summary: "Execute summary github_pat_SWARM_SURFACE_EXECUTE_SUMMARY_SHOULD_NOT_LEAK12345678",
      failureReason: "Bearer ghp_SWARM_SURFACE_FAILURE_REASON_SHOULD_NOT_LEAK12345678 expired",
      awaitingApproval: {
        reason: "approval reason ghp_SWARM_SURFACE_APPROVAL_REASON_SHOULD_NOT_LEAK12345678",
        requiredApprover: "operator github_pat_SWARM_SURFACE_APPROVER_SHOULD_NOT_LEAK12345678",
        requestedAt: "2026-05-18T11:20:30.000Z ghp_SWARM_SURFACE_APPROVAL_TIME_SHOULD_NOT_LEAK12345678",
      },
      artifacts: [],
      artifactCount: 1,
      artifactReview: [
        {
          type: "text ghp_SWARM_SURFACE_ARTIFACT_TYPE_SHOULD_NOT_LEAK12345678",
          name: "execute ghp_SWARM_SURFACE_ARTIFACT_NAME_SHOULD_NOT_LEAK12345678.log",
          uri: "file:///tmp/github_pat_SWARM_SURFACE_ARTIFACT_URI_SHOULD_NOT_LEAK12345678.log",
          contentBytes: 42,
          preview: "preview ghp_SWARM_SURFACE_ARTIFACT_PREVIEW_SHOULD_NOT_LEAK12345678",
          metadataKeys: [
            "secret ghp_SWARM_SURFACE_ARTIFACT_METADATA_SHOULD_NOT_LEAK12345678",
          ],
          externalContent: false,
        },
      ],
      retryHistory: [
        {
          attempt: 1,
          status: "failed",
          failureReason: "retry github_pat_SWARM_SURFACE_RETRY_REASON_SHOULD_NOT_LEAK12345678",
          artifactCount: 0,
          updatedAt: "2026-05-18T11:20:40.000Z",
        },
      ],
      updatedAt: "2026-05-18T11:21:00.000Z",
    },
  ],
  createdAt: "2026-05-18T11:20:00.000Z",
  updatedAt: "2026-05-18T11:21:00.000Z",
};

const list = formatSwarmRuns([run]);
assert(list.includes("swarm_[REDACTED] | failed | llm"), "swarm run list redacts run id");
assert(list.includes("Operator review [REDACTED]: Ship safely with [REDACTED]"), "swarm run list redacts title and objective");
assert(list.includes("execution exec_[REDACTED] | workers 2"), "swarm run list redacts execution id");
assertRedacted(list, "swarm run list");

const detail = formatSwarmRunDetail(run);
assert(detail.includes("swarm_[REDACTED] | failed | llm"), "swarm detail redacts run id");
assert(detail.includes("Title: Operator review [REDACTED]"), "swarm detail redacts title");
assert(detail.includes("Objective: Ship safely with [REDACTED]"), "swarm detail redacts objective");
assert(detail.includes("Execution: exec_[REDACTED]"), "swarm detail redacts execution id");
assert(detail.includes("Latest failure: execute - Bearer **** expired"), "swarm detail redacts latest failure");
assert(detail.includes("summary: Plan summary [REDACTED]"), "swarm detail redacts stage summary");
assert(detail.includes("approval: approval reason [REDACTED]"), "swarm detail redacts approval reason");
assert(detail.includes("execute [REDACTED].log (text [REDACTED]) | bytes 42 | uri file:///tmp/[REDACTED].log | metadata secret ****"), "swarm detail redacts artifact review metadata");
assert(detail.includes("preview: preview [REDACTED]"), "swarm detail redacts artifact preview");
assert(detail.includes("attempt 1 failed: retry [REDACTED]"), "swarm detail redacts retry reason");
assert(detail.includes("Suggested retry: /swarm retry swarm_[REDACTED] execute"), "swarm detail redacts suggested retry run id");
assertRedacted(detail, "swarm detail");

console.log("Phase 370: swarm status surfaces redact secret-shaped metadata.");
