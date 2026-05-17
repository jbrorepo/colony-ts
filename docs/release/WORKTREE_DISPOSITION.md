# Worktree Disposition

Last Updated: 2026-05-14

## Decision

`D:\The Colony Test\colony-ts` is the canonical active project tree.

`D:\The Colony Test\colony-ts-worktree` is a non-canonical Git worktree on
branch `worktree/phase1-continue`. Its deltas have been reviewed, and it is now
an archive candidate only. Do not delete or prune it without explicit operator
approval.

## Evidence

Current Git worktree map:

```text
D:/The Colony Test/colony-ts           71461f1 [main]
D:/The Colony Test/colony-ts-worktree  68bb5ed [worktree/phase1-continue]
```

The canonical tree is the one referenced by the root `AGENTS.md`,
`colony-ts/AGENTS.md`, release inventory, cleanup buckets, Launch Alpha 0 docs,
and active verification scripts.

The worktree branch is one commit ahead of `main`:

```text
68bb5ed refactor: stabilize gateway runtime snapshots
```

The worktree also has uncommitted changes in these paths:

```text
docs/EXECUTION_PLAN.md
docs/GAP_ANALYSIS.md
docs/ROADMAP.md
src/gateway-compact.ts
src/gateway-execute.ts
src/runtime/builtin-tools.ts
src/runtime/compaction.ts
src/runtime/session-recovery.ts
src/ui/app.tsx
src/ui/components.tsx
src/ui/store.ts
src/ui/use-colony-loop.ts
src/verify-phase1.ts
src/verify-phase5.ts
src/verify-phase6.ts
src/verify-phase7.ts
```

All dirty worktree paths also exist in the canonical tree, but their content is
not identical. The review log below records the disposition for these deltas.

The committed worktree delta includes one file that is not currently present in
the canonical tree:

```text
src/gateway-commands.ts
```

That file is obsolete against the canonical gateway split and was inspected in
the review log below.

## Review Log

### 2026-05-14 - `src/gateway-commands.ts`

Disposition: archive-only; do not harvest into canonical `colony-ts`.

Evidence:

- The file is imported inside `colony-ts-worktree` by `gateway-basic.ts`,
  `gateway-parse.ts`, `gateway.ts`, and `verify-phase7.ts` as part of a local
  command-registry extraction.
- Canonical `colony-ts` has no `gateway-commands.ts` import or dependency.
- Canonical command truth already lives in `src/gateway-basic.ts` and
  `src/gateway-parse.ts`, with broader current command coverage for memory,
  workflow, daemon, channels, skills, and the real `/swarm` status/resume/retry
  path.
- The worktree registry still describes `/swarm` as an active-agent alias with
  real multi-agent swarm pending, which is stale against canonical Phase 28,
  Phase 87, Phase 226, and Phase 233 swarm truth.

Result: no runtime behavior was harvested. The remaining worktree cleanup
blocker is the dirty worktree delta set listed above.

### 2026-05-14 - dirty worktree docs

Reviewed paths:

- `docs/EXECUTION_PLAN.md`
- `docs/GAP_ANALYSIS.md`
- `docs/ROADMAP.md`

Disposition: archive-only; do not harvest into canonical `colony-ts`.

Evidence:

- The worktree versions are dated 2026-04-20 while canonical source-of-truth
  docs are dated 2026-05-09 through 2026-05-11 and reflect Launch Alpha 0,
  Alpha 1/2/3, Beta 1, and Beta 2 progress.
- The worktree deltas mostly describe an older Phase 1/gateway stabilization
  pass and a partial `session_memory` compaction status.
- The worktree versions would remove or downgrade canonical truth for
  `verify:phase239`, Launch Alpha 0 docs, real LLM `/swarm` status/resume/retry,
  GitHub local execution receipts, local web-control UX, memory/MemPalace QA,
  swarm hardening, channel foundations, and MCP/plugin package policy
  preflights.
- The only local worktree doc nuance, naming `session_memory` as an additional
  compaction strategy, is already superseded in canonical docs by the shipped
  full compaction-family help truth: `standard`, `micro`, `reactive`,
  `session_memory`, `cached_micro`, and `context_collapse`.

Result: no documentation content was harvested. The remaining worktree cleanup
blocker is the dirty runtime/UI/verifier delta set.

### 2026-05-14 - dirty worktree compaction/runtime slice

Reviewed paths:

- `src/gateway-compact.ts`
- `src/runtime/compaction.ts`
- `src/runtime/session-recovery.ts`
- `src/verify-phase7.ts` compaction assertions

Disposition: archive-only; do not harvest into canonical `colony-ts`.

Evidence:

- The worktree delta adds only a partial `session_memory` compaction strategy to
  the older `standard`/`micro`/`reactive` family.
- Canonical `src/runtime/compaction.ts` already ships the broader six-strategy
  family: `standard`, `micro`, `reactive`, `session_memory`, `cached_micro`,
  and `context_collapse`, with shared strategy normalization, strategy ranking,
  recommendation logic, formatting, and concrete compaction implementations.
- Canonical `src/gateway-compact.ts` already renders the full six-strategy
  `/compact` usage and accepts normalized strategies through the shared runtime
  helper.
- Canonical `src/runtime/session-recovery.ts` normalizes recovered compaction
  result, failure, recent-event, and handoff strategies through
  `normalizeCompactionStrategy`, so the worktree's direct `session_memory`
  conditionals are superseded.
- Canonical `src/verify-phase7.ts` already verifies direct `/compact
  session_memory`, `/compact cached_micro`, `/compact context_collapse`, and
  full-family invalid-strategy usage truth.

Result: no compaction or session-recovery behavior was harvested. The remaining
worktree cleanup blocker is the dirty gateway-execute, builtin-tool, UI/store,
loop-hook, and verifier delta set.

### 2026-05-14 - dirty worktree cancellation/display/sandbox slice

Reviewed paths:

- `src/gateway-execute.ts`
- `src/runtime/builtin-tools.ts`
- `src/ui/app.tsx`
- `src/ui/components.tsx`
- `src/ui/store.ts`
- `src/ui/use-colony-loop.ts`
- `src/verify-phase1.ts`
- `src/verify-phase5.ts`
- `src/verify-phase6.ts`

Disposition: selectively harvested into canonical `colony-ts`; remaining
worktree content is archive-only.

Evidence:

- The worktree cancellation-drain UX was still valuable, but canonical already
  uses the newer `interruptRequested` model. Canonical now maps that truth into
  the command executor through `isRunCancelling`, blocks duplicate `/cancel`,
  `/clear`, `/resume`, and submit attempts while stopping, and guards repeated
  Ctrl+C/Esc without adding the older `isCancellingRun` store field.
- The worktree bounded transcript display behavior was still valuable.
  Canonical now bounds large transcript row text, live/persisted session preview
  text, tool error previews, and budget compaction recommendation history while
  preserving canonical transcript truth on disk/in memory.
- The worktree shell sandbox wording was still valuable. Canonical
  `shell_exec` now reports Bun `EPERM`/`uv_spawn` spawn denials as a runtime
  sandbox block instead of a generic spawn failure.
- Canonical already had the verifier temp-vault behavior from the worktree in
  `src/verify-phase1.ts`, so no additional Phase 1 harvest was needed.
- Canonical retains newer behavior the worktree lacks, including the
  `interruptRequested` queued-prompt model, real `/swarm` status/resume/retry,
  later Launch Alpha/competitor surfaces, and post-Phase 200 verification
  coverage.

Verification:

- `bun run src/verify-phase6.ts` -> 588 passed, 0 failed
- `bun run src/verify-phase5.ts` -> 135 passed, 0 failed
- `node ./node_modules/typescript/bin/tsc --noEmit` -> passed

Result: the remaining dirty worktree runtime/UI/verifier deltas have been
reviewed. The sibling worktree is no longer a source-of-truth blocker; it is a
review-complete archive candidate, but must not be deleted or pruned without
explicit user approval.

## Cleanup Rule

Do not implement new production work in `colony-ts-worktree`.

Before deleting or pruning the worktree:

1. Compare the dirty worktree changes against the canonical equivalents.
2. Harvest only clearly valuable, still-current behavior into `colony-ts`.
3. Run focused verification for any harvested runtime behavior.
4. Record the final disposition here.

## Current Disposition

- Canonical source of truth: `D:\The Colony Test\colony-ts`
- Worktree status: review-complete archive candidate, not source of truth
- Removal status: eligible for operator-approved archive/prune only; do not
  delete or prune without explicit user approval
