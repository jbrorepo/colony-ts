/**
 * Headless Alpha 0 swarm smoke (TTY-free equivalent of `/swarm llm "..."`).
 *
 * The Ink UI refuses to start without a TTY (by design — see
 * `docs/release/ALPHA_0_TERMINAL_UI_SMOKE.md`). This script drives the same
 * `ColonySwarmRuntime` + Ollama provider that the slash command would
 * invoke, but supplies a thin SwarmStageRunner that calls the provider
 * directly per stage rather than spinning up a full AgentLoop with tool
 * surfaces. The orchestration, persistence, planner/worker/reviewer fan-out
 * and stage timeline are the same code paths exercised by the UI.
 *
 * This is a smoke, not a verifier. It is intended to be run manually after
 * `bun run verify:all` passes, against a local Ollama with the model named
 * by `COLONY_OLLAMA_MODEL` (default `llama3.2`).
 *
 * Exit codes:
 *   0 — all three stages (plan/execute/review) completed
 *   1 — any stage failed or the run did not reach "completed"
 */

import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  ColonySwarmRuntime,
  JsonSwarmRunStore,
  type SwarmStage,
  type SwarmStageRunner,
  type SwarmStageRunnerInput,
  type SwarmStageRunnerResult,
} from "./orchestrator";
import { OllamaProvider } from "./llm/providers/ollama";

const OBJECTIVE =
  "prepare a concise local-first alpha launch checklist";
const MODEL = process.env.COLONY_OLLAMA_MODEL ?? "llama3.2";
const BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

const STAGE_SYSTEM_PROMPTS: Record<SwarmStage, string> = {
  plan:
    "You are the Eldest Architect of The Colony, the planning caste. " +
    "Produce a SHORT numbered plan (3 to 5 steps) for the operator's objective. " +
    "No preamble. No closing remarks. Numbered list only.",
  execute:
    "You are the Forge Carver caste, the worker. The planner produced a numbered plan. " +
    "For each plan step, write ONE sentence describing what you did. " +
    "No preamble. Single bullet list, one bullet per plan step.",
  review:
    "You are the Watcher Swarm caste, the reviewer. " +
    "Critique the plan and execution in 3 short bullets: " +
    "what was strong, what was weak, and one concrete improvement. " +
    "No preamble. Bullets only.",
};

function buildStagePrompt(input: SwarmStageRunnerInput): string {
  const prior = input.previousStages
    .filter((s) => s.summary)
    .map((s) => `## ${s.stage.toUpperCase()} (prior)\n${s.summary}`)
    .join("\n\n");
  const objectiveBlock = `## OBJECTIVE\n${input.objective}`;
  return prior ? `${objectiveBlock}\n\n${prior}` : objectiveBlock;
}

class OllamaStageRunner implements SwarmStageRunner {
  constructor(private readonly provider: OllamaProvider) {}

  async runStage(input: SwarmStageRunnerInput): Promise<SwarmStageRunnerResult> {
    const system = STAGE_SYSTEM_PROMPTS[input.stage];
    const user = buildStagePrompt(input);
    // Generous token budget so reasoning-capable models (Gemma 4, etc.) have
    // headroom for chain-of-thought BEFORE producing the final answer. Without
    // this, models that spend most of their budget thinking hit done_reason
    // "length" and return empty content.
    const response = await this.provider.complete(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { model: MODEL, maxTokens: 1500, temperature: 0.2 },
    );

    const contentTrim = (response.content ?? "").trim();
    const reasoningTrim = (response.reasoning ?? "").trim();

    // Fallback: if the model produced no visible content but did emit
    // reasoning (Gemma-4-style empty content + thinking trace), surface a
    // labelled excerpt so the swarm has something to feed the next stage.
    // Cap to keep prompts bounded.
    let summary: string;
    if (contentTrim) {
      summary = contentTrim;
    } else if (reasoningTrim) {
      const preview = reasoningTrim.length > 800
        ? `${reasoningTrim.slice(0, 800)}…`
        : reasoningTrim;
      summary = `(model returned no final answer; reasoning trace excerpt below)\n${preview}`;
    } else {
      summary = "(empty response)";
    }

    return {
      summary,
      totalTokens: response.usage?.totalTokens,
      artifacts: [
        {
          type: "stage_output",
          name: `${input.stage}-attempt-${input.attempt}.md`,
          content: summary,
          metadata: {
            stage: input.stage,
            attempt: input.attempt,
            finishReason: response.finishReason,
            hadReasoning: Boolean(reasoningTrim),
            contentEmpty: !contentTrim,
          },
        },
      ],
    };
  }
}

async function main(): Promise<number> {
  console.log("=== Alpha 0 Headless Swarm Smoke ===");
  console.log(`Model:     ${MODEL}`);
  console.log(`Base URL:  ${BASE_URL}`);
  console.log(`Objective: "${OBJECTIVE}"`);
  console.log("");

  const provider = new OllamaProvider({
    baseUrl: BASE_URL,
    defaultModel: MODEL,
  });

  // Preflight: confirm provider is reachable before we start spinning workers.
  const healthy = await provider.healthCheck();
  if (!healthy) {
    console.error(
      `Preflight failed: Ollama at ${BASE_URL} is not reachable, or model ` +
        `${MODEL} is not pulled. Run \`ollama serve\` and \`ollama pull ${MODEL}\`.`,
    );
    return 1;
  }
  console.log("Preflight: provider reachable, model available.\n");

  const rootDir = await mkdtemp(join(tmpdir(), "colony-alpha0-smoke-"));
  try {
    const runtime = new ColonySwarmRuntime({
      store: new JsonSwarmRunStore({ rootDir }),
      llmRunner: new OllamaStageRunner(provider),
    });

    const t0 = Date.now();
    const snapshot = await runtime.startObjective({
      objective: OBJECTIVE,
      executionMode: "llm",
      title: "Launch Alpha 0 Headless Smoke",
      maxAttempts: 1,
    });
    const elapsedMs = Date.now() - t0;

    console.log(`Run ID:    ${snapshot.runId}`);
    console.log(`Status:    ${snapshot.status}`);
    console.log(`Elapsed:   ${elapsedMs}ms`);
    console.log(`Stages:    ${snapshot.stages.length}\n`);

    let totalTokens = 0;
    let allCompleted = true;
    for (const stage of snapshot.stages) {
      console.log(`--- ${stage.stage.toUpperCase()} (${stage.status}) ---`);
      console.log(`Attempts: ${stage.attempts}`);
      if (stage.totalTokens != null) {
        console.log(`Tokens:   ${stage.totalTokens}`);
        totalTokens += stage.totalTokens;
      }
      if (stage.failureReason) {
        console.log(`FAILURE:  ${stage.failureReason}`);
        allCompleted = false;
      }
      const preview = (stage.summary ?? "").split("\n").slice(0, 8).join("\n");
      console.log(`Summary preview:\n${preview}`);
      console.log("");
      if (stage.status !== "completed") allCompleted = false;
    }

    console.log(`Tokens (sum across stages): ${totalTokens}`);
    if (snapshot.status === "completed" && allCompleted) {
      console.log("\nALPHA 0 HEADLESS SMOKE: GREEN");
      return 0;
    }
    console.log(`\nALPHA 0 HEADLESS SMOKE: FAILED (run status: ${snapshot.status})`);
    return 1;
  } finally {
    await rm(rootDir, { recursive: true, force: true }).catch(() => {});
  }
}

const code = await main();
process.exit(code);
