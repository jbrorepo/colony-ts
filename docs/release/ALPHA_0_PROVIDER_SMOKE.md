# Launch Alpha 0 Provider Smoke Record

## Provider Readiness Preflight

- Date recorded: 2026-05-11
- Command: `bun run alpha0:provider-check`
- Result: READY
- Provider path: Ollama
- Ollama base URL: `http://localhost:11434`
- Required demo model: `llama3.2`
- Model status: available
- Models observed: `nemotron-cascade-2:latest`, `llama3.2:latest`, `nomic-embed-text:latest`, `gpt-oss:20b`
- Cloud provider env: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and `GOOGLE_API_KEY` were not set in this shell.

## Latest Automation Preflight

- Date recorded: 2026-05-14T23:08:28.222Z
- Command: `bun run alpha0:provider-check`
- Result: BLOCKED
- Provider path: none ready in this automation shell
- Ollama base URL: `http://localhost:11434`
- Required demo model: `llama3.2`
- Ollama status: server not reachable from this shell
- Cloud provider env: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and `GOOGLE_API_KEY` were not set in this shell.

This latest automation result does not invalidate the earlier successful local
provider smoke. It means the final Alpha 0 release tag must rerun
`bun run alpha0:provider-check` in the operator environment after starting
Ollama or configuring an optional cloud provider.

## Boundary

This record proves the local provider setup is ready for the Launch Alpha 0 demo.
It does not prove the terminal UI demo itself ran, because
`bun run alpha0:provider-check` does not execute `/swarm llm`.

## Remaining Manual UI Smoke

Before tagging Alpha 0, run:

```text
bun run start
/doctor first-run
/swarm llm "prepare a concise local-first alpha launch checklist"
/swarm status <run_id>
```

Record the run id and outcome here after the terminal UI smoke is complete.
The non-TTY automation-shell startup attempt is recorded separately in
`docs/release/ALPHA_0_TERMINAL_UI_SMOKE.md`.
