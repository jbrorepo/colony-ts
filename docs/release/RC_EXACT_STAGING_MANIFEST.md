# Release Candidate Exact Staging Manifest

Date: 2026-05-14
Reviewer: Codex cleanup automation

## Purpose

This manifest converts the dirty canonical workspace into an operator-reviewable
staging sequence for the clean-checkout rehearsal. It is a plan, not an action:
do not run these commands unless the operator explicitly approves staging and
commit work. Never use `git add .` for this release candidate.

## Preconditions

Run these checks before any staging:

```powershell
cd "D:\The Colony Test\colony-ts"
git status --short --branch
git worktree list
bun run verify:cleanup
bun run verify:alpha0
node ./node_modules/typescript/bin/tsc --noEmit
```

Expected current blocker: the workspace remains dirty and
`docs/release/RC_CLEAN_CHECKOUT_REHEARSAL.md` records that final clean-checkout
rehearsal is blocked until reviewed buckets are staged and committed.

## Bucket 0 - Cleanup Control Plane

Stage only the release control-plane and source-of-truth files that make the
workspace reviewable:

```powershell
git add -- AGENTS.md package.json docs/PROJECT_STATE.md docs/COLONY_BIBLE.md docs/ROADMAP.md docs/GAP_ANALYSIS.md docs/BENCHMARK_BOARD.md docs/DECISIONS.md docs/release/WORKSPACE_INVENTORY.md docs/release/COMMIT_BUCKETS.md docs/release/BUCKET_0_REVIEW.md docs/release/tracked-change-inventory.txt docs/release/tracked-change-stat.txt docs/release/workspace-status.txt docs/release/COMPETITOR_COMPLETION_BOARD.md docs/release/COMPETITOR_GAP_ANALYSIS_2026-05-11.md docs/release/WORKTREE_DISPOSITION.md docs/release/RC_CLEAN_CHECKOUT_REHEARSAL.md docs/release/RC_EXACT_STAGING_MANIFEST.md docs/superpowers/plans/2026-05-10-workplace-cleanup-launch-order.md docs/superpowers/plans/2026-05-11-competitor-gap-closure.md src/verify-workspace-cleanup.ts src/verify-release.ts
git diff --cached --stat
git diff --cached --name-status
```

Verify before commit approval:

```powershell
bun run verify:cleanup
bun run verify:alpha0
node ./node_modules/typescript/bin/tsc --noEmit
```

Operator-approved commit message:

```text
chore: add launch cleanup control plane
```

## Bucket 1 - Public Alpha Documentation

Stage public source+Bun launch docs and claim-safety templates:

```powershell
git add -- README.md docs/LAUNCH_ALPHA_0.md docs/release/ALPHA_0_RELEASE_NOTES.md docs/release/ALPHA_0_RELEASE_READINESS.md docs/release/BUCKET_1_REVIEW.md docs/templates/antelligence/release-readiness-checklist.md docs/ANTELLIGENCE_PLAYBOOK.md docs/ANTELLIGENCE_LAUNCH_CHECKLIST.md
git diff --cached --stat
git diff --cached --name-status
```

Verify before commit approval:

```powershell
bun run verify:alpha0
bun run verify:cleanup
```

Operator-approved commit message:

```text
docs: publish alpha zero launch docs
```

## Bucket 2 - Real Swarm Runtime

Stage the Launch Alpha 0 real planner/worker/reviewer swarm path:

```powershell
git add -- src/orchestrator src/gateway-swarm.ts src/verify-phase226.ts docs/release/BUCKET_2_REVIEW.md
git diff --cached --stat
git diff --cached --name-status
```

Verify before commit approval:

```powershell
bun run verify:phase226
bun run verify:alpha0
bun run verify:cleanup
node ./node_modules/typescript/bin/tsc --noEmit
```

Operator-approved commit message:

```text
feat: add alpha swarm runtime
```

## Bucket 3 - Source And Provider Onboarding

Stage first-run provider readiness and dependency/smoke evidence:

```powershell
git add -- src/alpha0-provider-readiness.ts src/verify-alpha0.ts docs/release/ALPHA_0_PROVIDER_SMOKE.md docs/release/ALPHA_0_TERMINAL_UI_SMOKE.md docs/release/ALPHA_0_DEPENDENCY_RISK.md docs/release/BUCKET_3_REVIEW.md
git diff --cached --stat
git diff --cached --name-status
```

Verify before commit approval:

```powershell
bun run src/verify-alpha0.ts
bun run verify:alpha0
bun run verify:cleanup
```

Operator-approved commit message:

```text
chore: add alpha onboarding readiness checks
```

## Bucket 4 - GitHub Local Execution Guardrails

Stage approval-gated local GitHub issue/worktree/PR-handoff support:

```powershell
git add -- src/github-local-workspace-executor.ts src/github-pr-handoff.ts src/verify-phase227.ts src/verify-phase228.ts src/verify-phase229.ts src/verify-phase230.ts docs/release/BUCKET_4_REVIEW.md
git diff --cached --stat
git diff --cached --name-status
```

Verify before commit approval:

```powershell
bun run verify:phase227
bun run verify:phase228
bun run verify:phase229
bun run verify:phase230
bun run verify:alpha0
bun run verify:cleanup
node ./node_modules/typescript/bin/tsc --noEmit
```

Operator-approved commit message:

```text
feat: add approval gated github handoff
```

## Bucket 5 - Local Web Control Guardrails

Stage local-only authenticated web-control guardrails:

```powershell
git add -- src/web-control.ts src/daemon src/verify-phase89.ts src/verify-phase231.ts docs/release/BUCKET_5_REVIEW.md
git diff --cached --stat
git diff --cached --name-status
```

Verify before commit approval:

```powershell
bun run verify:phase89
bun run verify:phase227
bun run verify:phase231
bun run verify:alpha0
bun run verify:cleanup
node ./node_modules/typescript/bin/tsc --noEmit
```

Operator-approved commit message:

```text
feat: add local web control guardrails
```

## Bucket 6 - Release Candidate Gate

Stage the release-candidate evidence after Buckets 0 through 5 are committed:

```powershell
git add -- docs/release/BUCKET_6_REVIEW.md docs/release/WORKSPACE_INVENTORY.md docs/release/COMMIT_BUCKETS.md docs/release/RC_CLEAN_CHECKOUT_REHEARSAL.md docs/release/RC_EXACT_STAGING_MANIFEST.md docs/release/tracked-change-inventory.txt docs/release/tracked-change-stat.txt docs/release/workspace-status.txt
git diff --cached --stat
git diff --cached --name-status
```

Verify before commit approval:

```powershell
bun run verify:alpha0
bun run verify:all
bun run build
bun run release:gate
```

Operator-approved commit message:

```text
chore: record alpha release candidate gate
```

## Post-Alpha Buckets

Do not mix these post-alpha buckets into the Launch Alpha 0 staging sequence
unless the operator explicitly asks for a larger competitor-parity commit set.

- Bucket 7: Beta 1 swarm hardening.
- Bucket 8: Beta 2 MCP/plugin execution fabric.
- Bucket 9: Beta 3 host-owned channel/media depth.

## Clean-Checkout Rehearsal After Commit Approval

After the operator-approved bucket commits exist, run the clean-checkout
rehearsal from the candidate commit:

```powershell
cd "D:\The Colony Test"
git clone "D:\The Colony Test\colony-ts" "D:\The Colony Test\colony-ts-rc-rehearsal"
cd "D:\The Colony Test\colony-ts-rc-rehearsal"
bun install
bun run verify:cleanup
bun run verify:alpha0
bun run alpha0:provider-check
node ./node_modules/typescript/bin/tsc --noEmit
bun run release:gate
```

If the provider check is blocked, configure Ollama or one supported cloud
provider in the operator environment and rerun it. Do not persist provider
credential values.

## Manual Terminal Smoke

Manual terminal smoke remains outside automation-shell proof:

```powershell
cd "D:\The Colony Test\colony-ts"
bun run start
```

Inside the terminal UI:

```text
/doctor first-run
/swarm llm "prepare a concise local-first alpha launch checklist"
/swarm status <run_id>
```

Record the provider, model, run id, stage summaries, status output, and warnings
in `docs/release/ALPHA_0_TERMINAL_UI_SMOKE.md`, then rerun
`bun run verify:alpha0`.

## Guardrails

- No `git add .`.
- No commit, tag, push, PR, worktree prune, or worktree deletion without
  explicit operator approval.
- Do not stage `colony.exe`, `.tmp-verify19/`, provider credentials, raw
  approval signatures, or external-service secrets.
- Keep `D:\The Colony Test\colony-ts-worktree` read-only unless the operator
  explicitly approves archive/prune action.
