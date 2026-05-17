# Bucket 3 Review - Source+Bun Onboarding

Date: 2026-05-14
Reviewer: Codex cleanup automation

## Scope

Bucket 3 isolates first-run setup, provider readiness, dependency risk, and
manual terminal smoke evidence from runtime implementation and public launch
copy.

Include these paths when staging Bucket 3:

- `src/alpha0-provider-readiness.ts`
- `src/verify-alpha0.ts`
- `docs/release/ALPHA_0_PROVIDER_SMOKE.md`
- `docs/release/ALPHA_0_TERMINAL_UI_SMOKE.md`
- `docs/release/ALPHA_0_DEPENDENCY_RISK.md`
- `docs/release/BUCKET_3_REVIEW.md`
- `package.json` only if staging the `alpha0:provider-check` or
  `verify:alpha0` script definitions with this bucket instead of Bucket 0.

Exclude these paths from Bucket 3:

- Bucket 0 cleanup control-plane docs.
- Bucket 1 public alpha docs, except when README command examples are staged
  with the public docs bucket.
- Bucket 2 swarm runtime implementation and phase 226 verifier.
- Bucket 4 GitHub local execution guardrails.
- Bucket 5 local web-control guardrails.
- Runtime provider implementations unless a concrete first-run provider defect
  is fixed in this bucket.

## Runtime Truth

- Alpha 0 ships source+Bun first; compiled binary output remains optional.
- `alpha0:provider-check` runs `src/alpha0-provider-readiness.ts`.
- Provider readiness checks Ollama first at `http://localhost:11434` by default
  and accepts `llama3.2` or an equivalent model tag match.
- Optional cloud readiness is detected through env-label presence only:
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, or
  non-Ollama `COLONY_LLM_API_KEY`.
- Provider readiness output redacts secret values and separates preflight truth
  from the live `/swarm llm` demo.
- The current terminal smoke record is intentionally blocked because this
  automation shell is not an interactive TTY.
- `verify-alpha0.ts` checks package script drift, README/launch command drift,
  claim safety, provider smoke docs, terminal smoke boundary, dependency risk,
  and deterministic fake-provider readiness cases.

## Review Findings

- The onboarding bucket is reviewable without changing runtime provider code.
- The provider smoke record preserves a historical Ollama `llama3.2` READY
  result from the recorded local environment.
- Latest automation preflight remains BLOCKED in this shell until Ollama is
  reachable or one supported cloud provider env is configured.
- The latest automation-shell provider preflight is BLOCKED because Ollama is
  not reachable at `http://localhost:11434` and no optional cloud provider env
  is configured in this shell.
- The manual terminal UI smoke remains the true Alpha 0 release blocker because
  it requires an interactive terminal outside this automation shell.
- Dependency risk is recorded with a narrow runtime dependency set and raw
  `fetch()` provider boundary.
- Public README command examples are verified by `verify-alpha0.ts`; they should
  remain staged with Bucket 1 unless the operator wants one combined docs bucket.

## Verification

Required before staging Bucket 3:

```powershell
bun run src/verify-alpha0.ts
bun run verify:alpha0
```

Recommended before release-candidate tagging:

```powershell
bun run alpha0:provider-check
bun audit
```

Evidence refreshed on 2026-05-14:

- `bun run src/verify-alpha0.ts` passed: 43 passed, 0 failed.
- `bun run alpha0:provider-check` completed but reported `BLOCKED` in this
  automation shell because Ollama was not reachable at `http://localhost:11434`
  and no cloud provider env was configured.
- Latest automation refresh at 2026-05-14T23:08:28.222Z reran
  `bun run alpha0:provider-check`; it still reported `BLOCKED` for the same
  host-environment reason and did not execute `/swarm llm`.

Earlier evidence captured on 2026-05-13:

- `bun run verify:cleanup` passed.
- `bun run verify:alpha0` passed: phase 226, phase 227, and launch alpha gate
  all green.
- `node ./node_modules/typescript/bin/tsc --noEmit` passed.
- The historical provider smoke record remains dated 2026-05-11 and records a
  prior READY result; the current shell should not be treated as launch-ready
  until provider readiness is rerun successfully.

## Suggested Staging Command

Use an exact pathspec. Do not use `git add .`.

```powershell
git add src/alpha0-provider-readiness.ts src/verify-alpha0.ts docs/release/ALPHA_0_PROVIDER_SMOKE.md docs/release/ALPHA_0_TERMINAL_UI_SMOKE.md docs/release/ALPHA_0_DEPENDENCY_RISK.md docs/release/BUCKET_3_REVIEW.md docs/release/WORKSPACE_INVENTORY.md docs/release/COMMIT_BUCKETS.md docs/release/tracked-change-inventory.txt docs/release/tracked-change-stat.txt docs/release/workspace-status.txt
```

Add `package.json` only if the alpha script definitions are being staged in
Bucket 3 rather than Bucket 0.

## Residual Risk

- The release remains blocked until a real interactive terminal smoke records
  `/doctor first-run`, `/swarm llm ...`, and `/swarm status <run_id>`.
- The current automation shell also lacks a ready provider preflight. Start
  Ollama and pull `llama3.2`, or configure one supported cloud provider env,
  then rerun `bun run alpha0:provider-check` before release tagging.
- Provider readiness is a preflight, not a live demo, and must not be used as a substitute for terminal swarm evidence.
