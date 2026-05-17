# Bucket 6 Review - Release Candidate Gate

Date: 2026-05-14
Reviewer: Codex cleanup automation

## Scope

Bucket 6 aggregates the reviewed Launch Alpha 0 cleanup buckets into release
candidate evidence. It does not add runtime behavior, start listeners, mutate
external services, persist credentials, stage files, commit, push, or create a
pull request.

Include these paths when staging Bucket 6:

- `docs/release/BUCKET_6_REVIEW.md`
- `docs/release/ALPHA_0_RELEASE_READINESS.md` only if release-readiness truth
  changes
- `docs/release/WORKSPACE_INVENTORY.md`
- `docs/release/COMMIT_BUCKETS.md`
- `docs/release/tracked-change-inventory.txt`
- `docs/release/tracked-change-stat.txt`
- `docs/release/workspace-status.txt`

Exclude these paths from Bucket 6:

- Runtime implementation files from Buckets 2, 4, and 5.
- Public launch docs from Bucket 1 unless claim-safety wording changes.
- Onboarding/provider-smoke files from Bucket 3 unless smoke evidence changes.
- Generated binary output such as `colony.exe`.
- `docs/release/RC_CLEAN_CHECKOUT_REHEARSAL.md` unless clean-checkout
  rehearsal truth changes.

## Gate Evidence

Latest automation guardrail refresh: Bucket 6 is still an evidence aggregation
bucket only. It records the current `verify:phase282` frontier after the full
Bucket 9 Phase 92 through Phase 225 channel/media evidence refresh and
preserves no tag, commit, push, PR, listener startup, external-service mutation, or credential persistence.

Automated checks refreshed on 2026-05-14:

- `bun run verify:alpha0` passed: Phase 226, Phase 227, and the Launch Alpha 0
  gate were green.
- `node ./node_modules/typescript/bin/tsc --noEmit` passed.
- `bun run verify:all` passed through `verify:phase282` plus TypeScript
  `--noEmit`.
- `bun run build` passed and produced local compiled output.
- `bun run release:gate` passed; it ran `verify:alpha0`, `verify:all`, and
  `bun run build`.
- Final claim-safety search over `README.md` and `docs/` found only non-goals,
  guardrails, or gap-planning references for hosted product, default live
  delivery, automatic PR creation, credential storage, public listeners, and
  autonomous remote mutation.
- Latest automation refresh reran `bun run release:gate` after the Bucket 9
  full-chain evidence update; the gate passed and reran `verify:alpha0`,
  `verify:all`, and `bun run build`.
- Latest optional binary packaging evidence: `bun run build` passed on
  2026-05-14T23:19:29.9592748Z and produced `colony.exe` with SHA-256
  `3F303A8C0F9EA9C3056B189E1233819604B08D1633E9BF76D216ABE0C9F105F1`
  and size `118002176` bytes.
- Latest clean-checkout rehearsal preflight: final clean-checkout rehearsal is
  blocked before execution because the current committed `HEAD` (`71461f1`) does
  not contain the unstaged/untracked release-critical docs, provider readiness
  script, cleanup verifier, or Phase 220 through Phase 282 verifier files. See
  `docs/release/RC_CLEAN_CHECKOUT_REHEARSAL.md`.

The build command produced `colony.exe` locally. It is generated output and was
not staged.

## Remaining Release Blocker

Launch Alpha 0 is not ready to tag until the manual TTY smoke is recorded from
a real interactive terminal:

```powershell
cd "D:\The Colony Test\colony-ts"
bun run start
```

Then run inside the Colony terminal UI:

```text
/doctor first-run
/swarm llm "prepare a concise local-first alpha launch checklist"
/swarm status <run_id>
```

Record provider, model, run id, stage summaries, status output, and warnings in
`docs/release/ALPHA_0_TERMINAL_UI_SMOKE.md`, then update
`docs/release/ALPHA_0_RELEASE_READINESS.md`.

## Suggested Staging Command

Use exact pathspecs. Do not use `git add .`.

```powershell
git add docs/release/BUCKET_6_REVIEW.md docs/release/WORKSPACE_INVENTORY.md docs/release/COMMIT_BUCKETS.md docs/release/tracked-change-inventory.txt docs/release/tracked-change-stat.txt docs/release/workspace-status.txt
```

Add `docs/release/ALPHA_0_RELEASE_READINESS.md` and
`docs/release/ALPHA_0_TERMINAL_UI_SMOKE.md` only after the manual TTY smoke
truth changes.

## Residual Risk

- Automated release gates are green, but provider readiness must be rerun in
  the final operator environment and the manual terminal UI smoke remains the
  explicit Alpha 0 release blocker.
- The manual terminal UI smoke remains the explicit Alpha 0 release blocker.
- The workspace remains broadly dirty and should still be staged bucket by
  bucket with exact pathspecs.
