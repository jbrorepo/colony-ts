# Bucket 0 Review - Cleanup Control Plane

Last Updated: 2026-05-14

## Purpose

Bucket 0 captures the workspace cleanup control plane only: current project
truth, dirty-worktree inventory, release-gate scripts, competitor closure
planning, and docs that govern how later runtime buckets should be reviewed.

It must not include swarm runtime implementation, memory runtime changes,
channel/daemon implementation, GitHub execution implementation, web-control
implementation, or large phase verifier groups unless they are directly needed
by the cleanup/release gates.

## Include

- `docs/PROJECT_STATE.md`
- `docs/release/WORKSPACE_INVENTORY.md`
- `docs/release/COMMIT_BUCKETS.md`
- `docs/release/BUCKET_0_REVIEW.md`
- `docs/release/tracked-change-inventory.txt`
- `docs/release/tracked-change-stat.txt`
- `docs/release/workspace-status.txt`
- `docs/release/COMPETITOR_COMPLETION_BOARD.md`
- `docs/release/COMPETITOR_GAP_ANALYSIS_2026-05-11.md`
- `docs/superpowers/plans/2026-05-10-workplace-cleanup-launch-order.md`
- `docs/superpowers/plans/2026-05-11-competitor-gap-closure.md`
- `docs/COLONY_BIBLE.md`
- `src/verify-workspace-cleanup.ts`
- `src/verify-release.ts`
- `package.json`
- `docs/ROADMAP.md`
- `docs/GAP_ANALYSIS.md`
- `docs/BENCHMARK_BOARD.md`
- `docs/DECISIONS.md`

## Exclude

- `README.md` and `docs/LAUNCH_ALPHA_0.md`: Bucket 1 public alpha docs.
- `src/orchestrator/*`, `src/gateway-swarm.ts`, and `src/verify-phase226.ts`: Bucket 2 swarm runtime.
- `src/alpha0-provider-readiness.ts` and Alpha 0 smoke docs: Bucket 3 onboarding.
- `src/github-pr-handoff.ts` and `src/verify-phase227.ts` or later GitHub guardrail/runtime files: Bucket 4.
- `src/web-control.ts`: Bucket 5.
- Bulk memory, channel, daemon, MCP, skill, UI, runtime, and verifier changes outside the specific cleanup/release-gate files above.

## Verification Evidence

Latest focused checks from this cleanup pass:

```powershell
bun run src/verify-phase6.ts
bun run src/verify-phase5.ts
node ./node_modules/typescript/bin/tsc --noEmit
bun run verify:cleanup
bun run verify:phase282
bun run verify:alpha0
```

All passed on 2026-05-14 for the worktree-disposition harvest and cleanup
control-plane refresh, including the Project State, Colony Bible, Benchmark
Board, Roadmap, and Decisions Phase 282 / 12-caste method compatibility drift guards.
Earlier Bucket 0 Alpha 0 gate checks remain recorded in
`WORKSPACE_INVENTORY.md`.

## Suggested Stage Command

Use explicit pathspecs only:

```powershell
git add docs/PROJECT_STATE.md docs/COLONY_BIBLE.md docs/release/WORKSPACE_INVENTORY.md docs/release/COMMIT_BUCKETS.md docs/release/BUCKET_0_REVIEW.md docs/release/tracked-change-inventory.txt docs/release/tracked-change-stat.txt docs/release/workspace-status.txt docs/release/COMPETITOR_COMPLETION_BOARD.md docs/release/COMPETITOR_GAP_ANALYSIS_2026-05-11.md docs/superpowers/plans/2026-05-10-workplace-cleanup-launch-order.md docs/superpowers/plans/2026-05-11-competitor-gap-closure.md src/verify-workspace-cleanup.ts src/verify-release.ts package.json docs/ROADMAP.md docs/GAP_ANALYSIS.md docs/BENCHMARK_BOARD.md docs/DECISIONS.md
```

Then inspect:

```powershell
git diff --cached --stat
git diff --cached --name-status
```

Do not use `git add .` while runtime buckets remain unreviewed.
