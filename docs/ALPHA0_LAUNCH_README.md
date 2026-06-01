# The Colony

The Colony is a local-first, security-first TypeScript/Bun agent runtime. Launch Alpha 0 is a public source checkout alpha centered on a real planner -> worker -> reviewer swarm path, conservative approvals, exact transcript truth, and Ollama-first provider setup.

Alpha 0 also exposes 12-caste method framework display compatibility while keeping legacy persisted caste values as compatibility aliases.

Deploying in a regulated environment? See **[Audit-Grade Positioning](docs/AUDIT_GRADE_POSITIONING.md)** for the compliance summary.

## Install

```powershell
bun install
bun run verify:alpha0
bun run alpha0:provider-check
bun run start
```

The source+Bun path is the Alpha 0 release path. `bun run build` can compile a local executable, but the alpha does not require a prebuilt binary.

## Provider Setup

Ollama is the default local provider:

```powershell
ollama serve
ollama pull llama3.2
```

Optional cloud fallback providers are enabled with environment variables:

```powershell
$env:ANTHROPIC_API_KEY="..."
$env:OPENAI_API_KEY="..."
$env:GEMINI_API_KEY="..."
```

All providers use raw `fetch()` in the runtime. Vendor SDKs are not required.

## First Run

Start the terminal UI:

```powershell
bun run start
```

Useful first commands:

```text
/doctor first-run
/provider
/workspace
/swarm llm "draft a small local-first release note"
/swarm status
```

`bun run alpha0:provider-check` is a local readiness preflight. It checks Ollama
reachability/model availability and whether optional cloud-provider env vars are
present, without printing credential values. It does not replace the manual
`/swarm llm` demo smoke.

`/swarm llm <objective>` requests the real model-backed Alpha 0 swarm path when provider configuration is available. `/swarm <objective>` remains the coordinator-only compatibility path.

## Alpha 0 Boundaries

Shipped in Alpha 0:

- local source+Bun install path
- Ollama-first provider setup, with optional cloud fallback
- real AgentLoop-backed swarm execution for plan, execute, and review stages
- durable swarm status, resume, retry, and cancellation surfaces
- 12-caste method framework display compatibility; legacy persisted caste values remain compatibility aliases
- local-first GitHub issue/branch/worktree handoff planning behind approvals
- local-only web-control mutation handoff guardrails

Not shipped as default Alpha 0 behavior:

- public hosted control plane
- Slack, Discord, or Telegram delivery as a default alpha channel
- credential persistence for external services
- automatic push or PR creation
- autonomous remote mutation without explicit approval
- destructive caste renames or persisted session migration requirements

## Verification

For the current built/not-built truth, see `docs/PROJECT_STATE.md`.

Run the alpha gate before sharing the project:

```powershell
bun run verify:alpha0
```

Run the full development gate before larger release claims:

```powershell
bun run verify:all
bun run build
```

## Troubleshooting

- If `/doctor first-run` reports provider errors, start Ollama or configure one cloud provider key.
- If a swarm run fails, inspect it with `/swarm status <run_id>`.
- If a stage fails after a transient model error, retry it with `/swarm retry <run_id> <plan|execute|review>`.
- If a run was restored from disk, continue it with `/swarm resume <run_id>`.
