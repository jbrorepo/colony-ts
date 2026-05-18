# Launch Alpha 0

Last Updated: 2026-05-14

Launch Alpha 0 is a public source+Bun alpha. Its proof path is a real
model-backed planner -> worker -> reviewer swarm, while preserving local-first
execution, conservative approvals, the 12-caste method framework, and honest
runtime claims.

## Public Scope

Alpha 0 can claim:

- source checkout installation through `bun install`
- alpha verification through `bun run verify:alpha0`
- local terminal startup through `bun run start`
- Ollama-first model configuration with optional cloud fallback
- real AgentLoop-backed swarm stages for planning, execution text, and review
- durable swarm status, cancellation, resume, and bounded retry
- 12-caste method framework display compatibility; legacy persisted caste values remain compatibility aliases
- local-first GitHub issue/branch/worktree handoff planning behind explicit approvals
- local-only web-control status and action handoffs with scoped authorization

Alpha 0 must not claim:

- default public hosting
- default live external channel delivery
- credential persistence for vendor services
- automatic remote push or PR creation
- autonomous mutation without explicit approval
- Slack, Discord, or Telegram live delivery as a launch headline

## Demo Script

```powershell
bun install
bun run verify:alpha0
bun run alpha0:provider-check
bun run start
```

Inside the UI:

```text
/doctor first-run
/provider
/swarm llm "prepare a concise local-first alpha launch checklist"
/swarm status
/swarm status <run_id>
```

Optional recovery commands:

```text
/swarm resume <run_id>
/swarm retry <run_id> plan
/swarm retry <run_id> execute
/swarm retry <run_id> review
/swarm cancel <run_id>
```

## Claim-Safety Matrix

| Area | Alpha 0 claim | Guardrail |
| --- | --- | --- |
| Install | Source+Bun public alpha | No prebuilt binary requirement |
| Providers | Ollama-first, optional cloud fallback | Raw `fetch()` providers, no vendor SDK claims |
| Swarm | AgentLoop-backed plan/execute/review stages | Tests use fake providers; live demo requires configured model |
| Caste identity | 12-caste method framework display compatibility | Legacy persisted caste values remain aliases; no destructive rename in Alpha 0 |
| GitHub | Local-first handoff and approved workspace action planning | No push or PR creation without explicit approval and host credentials |
| Web control | Local-only scoped status and action handoff | No default listener, no public hosting, no missing-scope mutation, no direct web mutation execution |
| Browser sidecar | Browser sidecar lifecycle remains local-only | No listener bind, Chromium spawn, artifact write, tunnel, or credential persistence without explicit approval |
| Skills | Generated skill documentation and trace-to-skill output are preview/proposal artifacts | No generated `SKILL.md` is promoted or written by preview/proposal views |
| Workflows | Workflow recipes are descriptor-first | No live GitHub, browser, deploy, or channel mutation by default |
| Plugins | Local plugin activation preflight is host-owned | No default live browser tunnel, plugin activation, registry fetch, channel delivery, or credential persistence is shipped. |
| Browser automation | Browser automation remains local-first and approval-gated | Navigation, screenshot, click, type, and artifacts require injected local runtime boundaries and bounded untrusted output |
| GitHub PRs | GitHub PR creation requires explicit push and PR approvals | Remote mutation uses injected executors and redacted receipts; credentials are not persisted |
| Trusted plugins | Trusted plugin activation requires local descriptor preflight | No registry fetch, package-code execution, or default plugin execution is part of trusted local activation |
| Executable recipes | Executable workflow recipes pause before risky host actions | Recipes emit bounded artifacts and next-action truth before external mutation |
| Channels | Experimental host-owned foundations | No channel adapter is presented as default alpha delivery |

## Release Checklist

- [x] `bun run verify:alpha0`
- [x] `bun run verify:all`
- [x] `bun run build`
- [x] README commands match `package.json`
- [x] Docs avoid public hosting, credential persistence, default live channel, and autonomous PR claims
- [x] Demo provider setup has been checked with Ollama or a configured optional provider
- [ ] Manual terminal UI `/swarm llm` smoke run has been recorded
