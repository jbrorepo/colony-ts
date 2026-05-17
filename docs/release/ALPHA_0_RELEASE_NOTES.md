# Launch Alpha 0 Release Notes

## What Ships

- Source+Bun local install and terminal startup.
- Ollama-first provider path with optional cloud fallback.
- Real planner/worker/reviewer LLM swarm demo.
- Durable swarm status, resume, retry, and cancel.
- 12-caste method framework display compatibility; legacy persisted caste values remain compatibility aliases.
- Conservative approval posture.
- Local GitHub handoff and local branch/worktree action planning.
- Local web-control action handoff guardrails.

## Known Limits

- No hosted product.
- No default live channel delivery.
- No credential persistence for vendor services.
- No automatic push or PR creation.
- No autonomous remote mutation without explicit approval.
- No destructive caste rename or persisted session migration requirement.
- External channels remain experimental host-owned foundations.

## Required Verification

- `bun run verify:alpha0`
- `bun run verify:all`
- `bun run build`
- `bun run alpha0:provider-check`

## Manual Demo Before Tag

- Run `bun run alpha0:provider-check`.
- Confirm a local Ollama model or one optional cloud provider is configured.
- Run `bun run start`.
- Run `/doctor first-run`.
- Run `/swarm llm "prepare a concise local-first alpha launch checklist"`.
- Inspect the run with `/swarm status <run_id>`.
- Record the provider preflight in `docs/release/ALPHA_0_PROVIDER_SMOKE.md`.
- Record the terminal swarm smoke in `docs/release/ALPHA_0_TERMINAL_UI_SMOKE.md`.
