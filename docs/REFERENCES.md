# The Colony - Reference Repository Map

Last Updated: 2026-04-17

This document explains which reference repositories exist in the workspace,
what each one is used for, and how they should influence the TypeScript build.

Important rules:

- `the-colony/` is behavioral source material, not perfection ceiling.
- Reference repositories are read-only. Do not modify them.
- Colony keeps its own identity: caste model, conservative approvals,
  MemPalace memory architecture, and Caveman token savings remain first-class.

## Workspace Layout

Relevant roots under `D:\The Colony Test\`:

- `colony-ts/` - active TypeScript/Bun project
- `the-colony/` - Python behavioral reference
- `claude-code-main/` - Claude Code benchmark reference
- `openclaw-main/` - OpenClaw benchmark reference
- `mempalace-develop/` - memory architecture reference
- `skills-main/` - skill-file format reference
- `superpowers-main/` - development-discipline reference
- `autoresearch-master/` - bounded autonomous loop reference

## Benchmark Roles

### `the-colony/`

Use for:

- runtime loop semantics
- approvals and security behavior
- gateway and chat behavior
- workflow, agents, orchestrator, and memory source material

Do not use it as:

- a release-quality ceiling
- a reason to copy unfinished breadth or stale UX assumptions

### `claude-code-main/`

Use for:

- React/Ink operator UX
- command and tool ergonomics
- task/workflow surface ideas
- MCP, plugin, and bridge architecture patterns
- startup and compaction UX

Do not use it as:

- a branding model
- a reason to weaken Colony approvals or transcript-truth guarantees

### `openclaw-main/`

Use for:

- daemon and control-plane patterns
- remote approval/session delivery
- web, channel, and voice client architecture
- multi-surface session hosting

Do not use it as:

- a reason to collapse Colony into a single-user assistant model

### `mempalace-develop/`

Use for:

- layered memory hierarchy
- room and drawer placement ideas
- retrieval and navigation patterns
- exact-vs-derived memory separation strategy

Do not use it as:

- a replacement for Colony transcript truth
- a reason to store Caveman output as canonical user memory

### `skills-main/`

Use for:

- `SKILL.md` format and selection conventions

### `superpowers-main/`

Use for:

- slice discipline
- evidence-over-claims verification culture
- structured implementation sequencing

### `autoresearch-master/`

Use for:

- bounded experimentation loops
- autonomous research patterns that can later inform proactive and workflow subsystems

## Reference Routing By Phase

- Phase 0-1: `the-colony/`, `claude-code-main/`
- Phase 2: `the-colony/`, `mempalace-develop/`
- Phase 3: `the-colony/`, `superpowers-main/`
- Phase 4: `the-colony/`, `openclaw-main/`
- Phase 5: `claude-code-main/`, `skills-main/`, `the-colony/`
- Phase 6: `openclaw-main/`, `claude-code-main/`
- Phase 7: all benchmark references where they improve release rigor

## Benchmark Tracking

Capability-class parity is tracked in `docs/BENCHMARK_BOARD.md`.

Current parity target is not one-for-one cloning of every benchmark surface.
The target is to match or exceed the major capability classes of Claude Code
and OpenClaw while preserving Colony identity and security law.
