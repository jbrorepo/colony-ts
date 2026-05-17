# Bucket 1 Review - Public Alpha Documentation

Last Updated: 2026-05-14

## Purpose

Bucket 1 captures the public Launch Alpha 0 documentation surface. It should
make a source checkout understandable and claim-safe without mixing in runtime
implementation or non-public planning docs.

## Include

- `README.md`
- `docs/LAUNCH_ALPHA_0.md`
- `docs/release/ALPHA_0_RELEASE_NOTES.md`
- `docs/release/ALPHA_0_RELEASE_READINESS.md`
- `docs/templates/antelligence/release-readiness-checklist.md`

## Exclude

- `docs/PROJECT_STATE.md`, cleanup inventory, commit buckets, and competitor
  planning docs: Bucket 0.
- `src/orchestrator/*`, `src/gateway-swarm.ts`, and `src/verify-phase226.ts`:
  Bucket 2.
- `src/alpha0-provider-readiness.ts`, provider smoke docs, dependency risk, and
  terminal smoke records: Bucket 3.
- `src/github-pr-handoff.ts`, `src/web-control.ts`, and guardrail verifiers:
  Buckets 4 and 5.
- Any runtime implementation change.

## Review Findings

- Public docs correctly frame Alpha 0 as source+Bun, local-first, and
  Ollama-first with optional cloud providers.
- Public docs correctly state the real planner/worker/reviewer swarm proof path.
- Claim-safety language appears in README, launch scope, release notes, and
  readiness docs as guardrails or explicit non-goals.
- Release remains blocked until a real manual terminal UI `/swarm llm` smoke is
  recorded.
- Release notes now point the manual swarm-demo result to
  `docs/release/ALPHA_0_TERMINAL_UI_SMOKE.md`, while provider readiness remains
  recorded separately in `docs/release/ALPHA_0_PROVIDER_SMOKE.md`.
- Launch Alpha 0 now carries the 2026-05-14 source-of-truth date and names
  12-caste method framework display compatibility without claiming a destructive
  rename; legacy persisted caste values remain compatibility aliases.
- Release notes and readiness now repeat the same 12-caste compatibility boundary
  so public Alpha 0 launch artifacts stay aligned with the current runtime truth.
- README and the Antelligence release-readiness template now carry the same
  identity-compatibility expectation for public onboarding and future checklists.
- Worktree disposition is now resolved as review-complete/archive-only, so
  Bucket 1 can be reviewed against canonical `colony-ts` public docs without
  waiting on sibling worktree harvest decisions.

## Verification Evidence

Latest focused checks from this heartbeat pass:

```powershell
bun run verify:alpha0
bun run verify:cleanup
bun run verify:phase282
node ./node_modules/typescript/bin/tsc --noEmit
```

All passed on 2026-05-14.

Claim-safety search reviewed expected guardrail/non-goal hits only:

```powershell
rg -n "default live|persists? credentials|automatic(?:ally)? creates?|default public hosting|hosted product|autonomous remote mutation|push|PR creation" README.md docs\LAUNCH_ALPHA_0.md docs\release\ALPHA_0_RELEASE_NOTES.md docs\release\ALPHA_0_RELEASE_READINESS.md docs\templates\antelligence\release-readiness-checklist.md
```

README/package command drift search confirmed public docs still mention the
Alpha 0 package commands used by the current scripts:

```powershell
rg -n "bun run (start|verify:alpha0|alpha0:provider-check|verify:all|build|release:gate)" README.md docs\LAUNCH_ALPHA_0.md docs\release\ALPHA_0_RELEASE_NOTES.md docs\release\ALPHA_0_RELEASE_READINESS.md docs\templates\antelligence\release-readiness-checklist.md
```

## Suggested Stage Command

Use explicit pathspecs only:

```powershell
git add README.md docs/LAUNCH_ALPHA_0.md docs/release/ALPHA_0_RELEASE_NOTES.md docs/release/ALPHA_0_RELEASE_READINESS.md docs/templates/antelligence/release-readiness-checklist.md docs/release/BUCKET_1_REVIEW.md
```

Then inspect:

```powershell
git diff --cached --stat
git diff --cached --name-status
```

Do not stage provider smoke, terminal smoke, or runtime files in Bucket 1.
