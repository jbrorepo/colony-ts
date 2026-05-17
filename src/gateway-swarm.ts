import type { GatewayBasicCommandPayload } from "./gateway-basic";
import type {
  SwarmExecutionMode,
  SwarmRunSnapshot,
  SwarmStage,
} from "./orchestrator";

export interface GatewaySwarmContext {
  runs?: SwarmRunSnapshot[];
}

export function buildSwarmCommandPayload(
  args: string[],
  context: GatewaySwarmContext = {},
): GatewayBasicCommandPayload {
  const [view, ...rest] = args;
  const normalizedView = (view ?? "").toLowerCase();

  if (!view) {
    return {
      output: [
        "Usage: /swarm <objective>",
        "Real LLM mode: /swarm llm <objective>",
        "Inspect: /swarm status [swarm_run_id]",
        "Resume: /swarm resume <swarm_run_id>",
        "Retry: /swarm retry <swarm_run_id> <plan|execute|review>",
        "Cancel: /swarm cancel <swarm_run_id>",
      ].join("\n"),
      isError: true,
    };
  }

  if (normalizedView === "status" || normalizedView === "runs") {
    const runId = rest.join(" ").trim();
    if (runId) {
      const run = (context.runs ?? []).find((candidate) => candidate.runId === runId);
      return {
        output: run ? formatSwarmRunDetail(run) : `Swarm run not found: ${runId}`,
        data: run ? { run } : { runId },
        isError: !run,
      };
    }
    return {
      output: formatSwarmRuns(context.runs ?? []),
      data: { runs: context.runs ?? [] },
    };
  }

  if (normalizedView === "resume") {
    const runId = rest.join(" ").trim();
    if (!runId) {
      return {
        output: "Usage: /swarm resume <swarm_run_id>",
        isError: true,
      };
    }
    return {
      output: `Resuming swarm run ${runId}.`,
      data: { runId },
      action: { kind: "resume_swarm", runId },
    };
  }

  if (normalizedView === "retry") {
    const runId = rest[0] ?? "";
    const stage = normalizeStage(rest[1] ?? "");
    if (!runId || !stage) {
      return {
        output: "Usage: /swarm retry <swarm_run_id> <plan|execute|review>",
        isError: true,
      };
    }
    return {
      output: `Retrying swarm run ${runId} stage ${stage}.`,
      data: { runId, stage },
      action: { kind: "retry_swarm_stage", runId, stage },
    };
  }

  if (normalizedView === "cancel") {
    const runId = rest.join(" ").trim();
    if (!runId) {
      return {
        output: "Usage: /swarm cancel <swarm_run_id>",
        isError: true,
      };
    }
    return {
      output: `Cancelling swarm run ${runId}.`,
      data: { runId },
      action: { kind: "cancel_swarm", runId },
    };
  }

  const executionMode: SwarmExecutionMode = normalizedView === "llm" ? "llm" : "coordinator_only";
  const objective = (executionMode === "llm" ? rest : args).join(" ").trim();
  if (!objective) {
    return {
      output: executionMode === "llm" ? "Usage: /swarm llm <objective>" : "Usage: /swarm <objective>",
      isError: true,
    };
  }
  return {
    output: [
      "Swarm execution requested.",
      `Objective: ${objective}`,
      `Mode: ${executionMode}`,
      "Pattern: planner -> worker -> reviewer",
      "Inspect: /swarm status",
    ].join("\n"),
    data: { objective, mode: "orchestrated-swarm", executionMode },
    action: { kind: "start_swarm", objective, executionMode },
  };
}

export function formatSwarmRuns(runs: SwarmRunSnapshot[]): string {
  const lines = ["Swarm Runs:"];
  if (runs.length === 0) {
    lines.push("No swarm runs yet.");
    lines.push("Start one with /swarm <objective>.");
    return lines.join("\n");
  }

  for (const run of runs) {
    lines.push(
      `${run.runId} | ${run.status} | ${run.executionMode ?? "coordinator_only"} | assigned ${run.assignedTaskCount}/${run.taskCount} | done ${run.completedTaskCount}/${run.taskCount} | cancelled ${run.cancelledTaskCount}`,
    );
    lines.push(`  ${run.title}: ${run.objective}`);
    lines.push(`  execution ${run.execution.executionId} | workers ${run.workerCount}`);
  }
  lines.push("Inspect: /swarm status <swarm_run_id>");
  lines.push("Resume: /swarm resume <swarm_run_id>");
  lines.push("Retry: /swarm retry <swarm_run_id> <plan|execute|review>");
  lines.push("Cancel: /swarm cancel <swarm_run_id>");
  return lines.join("\n");
}

export function formatSwarmRunDetail(run: SwarmRunSnapshot): string {
  const lines = [
    "Swarm Run Detail:",
    `${run.runId} | ${run.status} | ${run.executionMode ?? "coordinator_only"}`,
    `Title: ${run.title}`,
    `Objective: ${run.objective}`,
    `Execution: ${run.execution.executionId}`,
    `Workers: ${run.workerCount}`,
    `Tasks: assigned ${run.assignedTaskCount}/${run.taskCount} | done ${run.completedTaskCount}/${run.taskCount} | failed ${run.failedTaskCount} | cancelled ${run.cancelledTaskCount}`,
    "Stage Details:",
    "Stage Timeline:",
  ];
  for (const stage of run.stages ?? []) {
    lines.push(
      `- ${stage.stage} | ${stage.status} | attempts ${stage.attempts} | artifacts ${stage.artifactCount}${formatStageTiming(stage)}${formatStageUsage(stage)}`,
    );
    if (stage.summary) lines.push(`  summary: ${stage.summary}`);
    if (stage.failureReason) lines.push(`  failure: ${stage.failureReason}`);
    if (stage.awaitingApproval?.reason) lines.push(`  approval: ${stage.awaitingApproval.reason}`);
    if (stage.artifactReview && stage.artifactReview.length > 0) {
      lines.push("  artifacts:");
      for (const artifact of stage.artifactReview) {
        const uri = artifact.uri ? ` | uri ${artifact.uri}` : "";
        const metadata = artifact.metadataKeys.length > 0 ? ` | metadata ${artifact.metadataKeys.join(",")}` : "";
        lines.push(`    - ${artifact.name} (${artifact.type}) | bytes ${artifact.contentBytes}${uri}${metadata}`);
        if (artifact.preview) lines.push(`      preview: ${artifact.preview}`);
      }
    }
    if (stage.retryHistory && stage.retryHistory.length > 0) {
      lines.push("  retry history:");
      for (const attempt of stage.retryHistory) {
        const reason = attempt.failureReason ? `: ${attempt.failureReason}` : "";
        lines.push(`    attempt ${attempt.attempt} ${attempt.status}${reason}`);
      }
    }
  }
  lines.push("Resume: /swarm resume <swarm_run_id>");
  lines.push("Retry: /swarm retry <swarm_run_id> <plan|execute|review>");
  lines.push("Cancel: /swarm cancel <swarm_run_id>");
  return lines.join("\n");
}

function formatStageTiming(stage: SwarmRunSnapshot["stages"][number]): string {
  const started = stage.startedAt ? ` | started ${stage.startedAt}` : "";
  const ended = stage.endedAt ? ` | ended ${stage.endedAt}` : "";
  return `${started}${ended}`;
}

function formatStageUsage(stage: SwarmRunSnapshot["stages"][number]): string {
  const tokens = typeof stage.totalTokens === "number" ? ` | tokens ${stage.totalTokens}` : "";
  const cost = typeof stage.estimatedCostUsd === "number" ? ` | cost $${stage.estimatedCostUsd.toFixed(4)}` : "";
  return `${tokens}${cost}`;
}

function normalizeStage(value: string): SwarmStage | null {
  if (value === "plan" || value === "execute" || value === "review") return value;
  return null;
}
