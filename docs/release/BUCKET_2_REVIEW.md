# Bucket 2 Review - Real Swarm Runtime

Date: 2026-05-14
Reviewer: Codex cleanup automation

## Scope

Bucket 2 isolates the Launch Alpha 0 planner/worker/reviewer swarm runtime from
public docs, onboarding smoke paths, GitHub guardrails, and web-control
guardrails.

Include these paths when staging Bucket 2:

- `src/orchestrator/coordinator.ts`
- `src/orchestrator/index.ts`
- `src/orchestrator/swarm.ts`
- `src/gateway-swarm.ts`
- `src/verify-phase226.ts`
- supporting workflow files only if their diff is exclusively required by the
  swarm runner or phase 226 verification:
  - `src/workflow/agent-loop-task.ts`
  - `src/workflow/engine.ts`
  - `src/workflow/index.ts`
  - `src/workflow/runner.ts`
  - `src/workflow/types.ts`

Exclude these paths from Bucket 2:

- Bucket 0 cleanup docs and release gate scripts.
- Bucket 1 public alpha documentation.
- Bucket 3 provider/onboarding smoke docs and readiness helpers.
- Bucket 4 GitHub local execution guardrails.
- Bucket 5 local web-control guardrails.
- unrelated memory, channel, daemon, UI, or MCP work.

## Runtime Truth

- `ColonySwarmRuntime` supports `executionMode:
  "coordinator_only" | "llm"` and defaults to `coordinator_only`.
- LLM mode maps the launch demo to ordered stages: `plan`, `execute`, then
  `review`.
- Current swarm worker routing uses method-caste identities: planner workers are
  `Command-ant`, narrow execution workers are `Oper-ant`, and reviewer workers
  are `Consult-ant`. Legacy caste values remain compatibility aliases outside
  this review surface.
- `createAgentLoopSwarmStageRunner` adapts each stage to the existing
  AgentLoop workflow primitive through `createAgentLoopWorkflowHandler`.
- Swarm snapshots persist stage summaries, artifacts, attempts, token/cost
  metadata, failure reasons, and approval waits.
- `JsonSwarmRunStore` stores durable swarm snapshots in append-only JSONL and
  reloads the latest snapshot per run.
- `/swarm llm <objective>` starts the LLM-backed path, `/swarm status <run_id>`
  renders per-stage details, `/swarm resume <run_id>` routes resume actions, and
  `/swarm retry <run_id> <plan|execute|review>` routes bounded stage retry.
- Phase 233 hardening extends status truth with stage timeline, token/cost
  metadata, redacted artifact review, retry history, cancellation preservation,
  interrupted-stage resume history, manual retry bounds, and persisted
  approval-wait preservation.
- Tests use deterministic fake providers and do not require live model network
  calls.

## Review Findings

- No external service mutation is in scope for this bucket.
- The focused verifier covers the launch-critical path: AgentLoop-backed stage
  execution, persisted artifacts, restart-safe retry/resume, and command
  routing.
- The hardening verifier covers current `/swarm status` observability claims
  used beyond the minimum Alpha 0 launch demo: timeline, retries, redacted
  artifact review, cancellation, and approval waits.
- The runtime still depends on configured model providers for real user demos;
  onboarding/provider readiness remains Bucket 3.
- `verify:alpha0` includes `verify:phase226`, so this bucket remains part of the
  public alpha release gate.
- Worktree disposition is resolved as review-complete/archive-only. Bucket 2 is
  reviewed against canonical `colony-ts`; the sibling worktree is not a source
  for swarm runtime truth.
- Canonical symbol check confirms current swarm runtime files still expose the
  expected execution mode, durable store, AgentLoop stage runner, resume/retry,
  and approval-wait surfaces.

## Verification

Required before staging Bucket 2:

```powershell
bun run verify:phase226
bun run verify:phase233
bun run verify:alpha0
```

Recommended before release-candidate tagging:

```powershell
bun run verify:all
```

Evidence refreshed on 2026-05-14:

- `bun run verify:phase226` passed: 21 passed, 0 failed.
- `bun run verify:phase233` passed: 62 passed, 0 failed.
- `bun run verify:cleanup` passed.
- `bun run verify:alpha0` passed: phase 226, phase 227, and launch alpha gate
  all green.
- `node ./node_modules/typescript/bin/tsc --noEmit` passed.
- Symbol check:

```powershell
rg -n "ColonySwarmRuntime|executionMode|JsonSwarmRunStore|createAgentLoopSwarmStageRunner|resumeRun|retryStage|approval|Command-ant|Oper-ant|Consult-ant" src\orchestrator\swarm.ts src\gateway-swarm.ts src\orchestrator\index.ts src\orchestrator\coordinator.ts docs\release\BUCKET_2_REVIEW.md
```

This refresh is still review-evidence only; it did not change swarm runtime
behavior.

## Suggested Staging Command

Use an exact pathspec. Do not use `git add .`.

```powershell
git add src/orchestrator/coordinator.ts src/orchestrator/index.ts src/orchestrator/swarm.ts src/gateway-swarm.ts src/verify-phase226.ts docs/release/BUCKET_2_REVIEW.md docs/release/WORKSPACE_INVENTORY.md docs/release/COMMIT_BUCKETS.md docs/release/tracked-change-inventory.txt docs/release/tracked-change-stat.txt docs/release/workspace-status.txt
```

Add workflow files only after confirming their diffs are required for this
bucket.

## Residual Risk

- The broad dirty tree still contains many unrelated untracked verifier and
  runtime files. Reviewers must inspect the staged diff before commit.
- Full `verify:all` is deferred until Bucket 6 or a runtime merge point because
  cleanup slicing is still in progress.
- This refresh did not execute the manual `/swarm llm` terminal UI demo because
  the automation shell is non-TTY; that remains tracked in Bucket 3 and the
  Alpha 0 release readiness docs.
