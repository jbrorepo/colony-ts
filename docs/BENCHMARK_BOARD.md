# The Colony - Benchmark Board

Last Updated: 2026-04-17

This board tracks capability-class parity against Claude Code and OpenClaw.

Decision locked: parity means matching or exceeding each major capability class
with Colony-native implementations first. Long-tail adapters and commands are
post-RC backlog unless they are required to complete a capability class.

## Non-Negotiables

- Keep Colony branding and caste model.
- Keep MemPalace as the long-term memory architecture.
- Keep exact transcript truth separate from derived compact artifacts.
- Keep Caveman compression for model-bound and internal agent traffic, never as canonical storage.
- Keep security and approval defaults stricter than the benchmarks where they differ.

## Capability Board

| Capability class | Colony now | Claude Code | OpenClaw | Main gap | Planned phase |
| --- | --- | --- | --- | --- | --- |
| Single-agent terminal core | Strong | Strong | Medium | command honesty, UI depth, compat, perf, operator polish | Phase 1 |
| Memory and recall | Partial | Medium | Medium | full MemPalace hierarchy, ranking, exact-vs-derived recall controls | Phase 2 |
| Workflow and tasks | Unbuilt | Strong | Medium | durable tasks, checkpoints, retries, artifacts, resumability | Phase 3 |
| Multi-agent colony runtime | Unbuilt | Strong | Strong | planner/worker/reviewer roles, queue, inter-agent messaging, swarm visibility | Phase 4 |
| Tools, skills, MCP, plugins | Partial | Strong | Medium | safe breadth, typed contracts, skills loader, MCP client/server, plugin fabric | Phase 5 |
| Daemon, remote, web delivery | Unbuilt | Strong | Strong | shared control plane, remote approvals, web client | Phase 6 |
| Channels and voice | Unbuilt | Low | Strong | Slack, Discord, Telegram, one voice surface | Phase 6 |
| Release and operator truth | Partial | Strong | Strong | docs truth, onboarding, packaging, security and performance release gates | Phase 0 + 7 |

## Immediate Truth-Sync Closures

These must stay true before broader parity work continues:

- `verify:all` includes `verify-phase19a`.
- `/swarm` is described as an active-agent alias until real multi-agent runtime exists.
- Built-in tool docs and comments do not claim `http_request` or `glob_find` until they are actually shipped.
- AGENTS, roadmap, gap analysis, references, help text, and runtime surfaces all describe the same current system.

## Phase Exit Bar

Capability class is considered at parity only when:

1. the subsystem is implemented
2. verification exists
3. operator surfaces describe it truthfully
4. security and approval rules are enforced end-to-end
5. performance and compatibility are acceptable for the claimed scope
