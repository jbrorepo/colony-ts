# Release Candidate Clean-Checkout Rehearsal

Date: 2026-05-14
Reviewer: Codex cleanup automation

## Current Result

Status: blocked before final rehearsal.

The release candidate cannot honestly be rehearsed from a clean checkout of the
current committed `HEAD` (`71461f1`) because launch-critical docs, verifier
scripts, and release-management artifacts are still intentionally unstaged and
untracked in the canonical workspace.

Current preflight evidence:

- `git status --short` found `61` tracked or indexed workspace changes.
- `git status --short` found `304` untracked paths.
- `git ls-files --others --exclude-standard` found `96` untracked
  release-critical paths matching the Alpha 0 docs, release docs, source-of-truth
  docs, cleanup verifiers, provider readiness script, and Phase 220 through Phase
  282 verifier range.
- `git status --ignored --short -- colony.exe .tmp-verify19` reports both
  `colony.exe` and `.tmp-verify19/` as ignored generated output.

Because these files are not committed, a clean clone or archive of `HEAD` would
not include the release gate docs, `verify:cleanup`, `verify:alpha0`, the latest
Phase 220-282 verifier files, the provider readiness script, or the Launch Alpha
0 public docs. Running a final clean-checkout release rehearsal from `HEAD` would
therefore test stale repository truth.

## Rehearsal Command Path

After the operator explicitly stages and commits the reviewed buckets with exact
pathspecs, run the rehearsal in a separate clean clone or temporary copy of that
candidate commit:

Use `docs/release/RC_EXACT_STAGING_MANIFEST.md` as the exact staging order and
command manifest. It is intentionally non-mutating until the operator explicitly
approves staging and commit work.

```powershell
git clone "D:\The Colony Test\colony-ts" "D:\The Colony Test\colony-ts-rc-rehearsal"
cd "D:\The Colony Test\colony-ts-rc-rehearsal"
bun install
bun run verify:cleanup
bun run verify:alpha0
bun run alpha0:provider-check
node ./node_modules/typescript/bin/tsc --noEmit
bun run release:gate
```

If `alpha0:provider-check` is blocked in the rehearsal environment, start
Ollama or configure one supported cloud provider environment variable, rerun the
check, and record the resulting readiness file. Do not persist provider
credential values.

Manual terminal UI smoke remains separate and must be recorded from a real
interactive terminal:

```powershell
bun run start
```

Then run:

```text
/doctor first-run
/swarm llm "prepare a concise local-first alpha launch checklist"
/swarm status <run_id>
```

Record provider, model, run id, stage summaries, status output, and warnings in
`docs/release/ALPHA_0_TERMINAL_UI_SMOKE.md`.

## Support And Incident Handoff

Support owner: local release owner.

Incident owner: local release owner.

Supported Alpha 0 issue classes:

- Source checkout and `bun install` failures.
- Provider setup failures for Ollama, Anthropic, OpenAI-compatible, or Gemini.
- `verify:alpha0`, `verify:cleanup`, `release:gate`, or build failures.
- Manual terminal UI `/doctor first-run` and `/swarm llm` demo failures.

Escalation rule: do not expand public claims, enable default public listeners,
persist credentials, mutate external services, or create remote PRs while
triaging Alpha 0 support issues unless a later explicit approval slice changes
that scope.

## Exit Criteria

The clean-checkout rehearsal can be marked complete only after:

1. Reviewed buckets are staged by exact pathspec and committed by the operator.
2. A clean clone or clean temporary checkout of that candidate commit runs
   `bun install`, `verify:cleanup`, `verify:alpha0`, TypeScript `--noEmit`,
   and `release:gate`.
3. Provider readiness is rerun successfully in the final operator environment.
4. Manual terminal UI smoke is recorded from a real interactive terminal.
5. Generated binary output is either rebuilt and checksummed or deliberately
   omitted from the release vehicle.
