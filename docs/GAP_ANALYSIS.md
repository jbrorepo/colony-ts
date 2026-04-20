# The Colony - Gap Analysis

Last Updated: 2026-04-16

This document measures gap against two things:

1. Colony behavioral intent from Python reference.
2. State-of-the-art target for TypeScript/Bun/Ink product.

Important: `the-colony` is not treated as finished perfect software. It is source material, not ceiling. Where Python behavior is strong, we port it. Where Python stopped short, we keep Colony identity and use stronger patterns from Claude Code, OpenClaw, MemPalace, and current TS architecture.

Capability-class benchmark status is tracked in [BENCHMARK_BOARD.md](./BENCHMARK_BOARD.md).

## Reality Check

Old gap docs claimed:

- UI not wired to real loop.
- No providers implemented.
- No AgentLoop.
- No compaction.
- No approval flow.

Those statements are obsolete.

Current TS baseline already includes:

- Real AgentLoop runtime.
- Streaming Ink UI path.
- Ollama, Anthropic, OpenAI-compatible, and Gemini providers.
- Failover executor and provider manager.
- Usage tracking, rate limiting, failover probe, LLM config.
- Standard and reactive compaction.
- Conservative approval flow.
- Tool result externalization.
- Structured logger.
- Identity system, prompt templates, prompt builder, prompt assembler.
- Workspace detection.
- Startup doctor coverage for config presence, writable runtime paths, provider credentials, default cloud readiness, and port status, including filtered slash-command views.
- Observed provider failover/circuit health surfaced in runtime command UX without active probe spend, including per-provider drill-down.
- Status/workspace operator commands now surface latest failover summary and workspace start-dir details.
- Prompt assembly now includes workspace start-dir, circuit state, provider health, and recent failovers.
- Terminal operator surface now shows workspace identity, startup doctor counts, provider health, recent failovers, and recent saved sessions.
- Persisted session catalog is exposed in command UX for resume and recovery, including previews, interruption/checkpoint filtering, smarter resume targeting including `pending`, and `/history` tail inspection.
- Persisted single-agent session resume foundation.
- Security additions: audit trail, policy engine, secret scanner, path validator.
- Caveman outbound compression bridge.

## Coverage Summary

## Benchmark Delta vs Claude Code and OpenClaw

| Capability class | Colony | Gap |
| --- | --- | --- |
| Single-agent terminal product | strong | behind in operator polish, truthful command surface, compatibility, and performance hardening |
| Memory and recall | partial | behind full MemPalace hierarchy, ranking, and exact-vs-derived recall controls |
| Workflow and tasks | unbuilt | behind durable task and workflow execution surfaces |
| Multi-agent runtime | unbuilt | behind planner/worker/reviewer orchestration and inspectable swarm state |
| Tools, skills, MCP, plugins | partial | behind safe breadth, MCP, skills loader, and plugin fabric |
| Daemon, remote, web, channels, voice | mostly unbuilt | behind OpenClaw delivery breadth and Claude Code bridge and remote patterns |
| Release and operator truth | partial | behind benchmark-grade docs, onboarding, packaging, and release gates |

## Closed or Mostly Closed

These are no longer major parity risks:

- Settings/config foundation.
- Session/message/runtime core.
- Security core and runtime permission checks.
- Provider stack and failover basics.
- Cost tracking and per-model usage accounting.
- Single-agent loop execution.
- UI streaming bridge.
- Approval interrupt model.
- Basic compaction and context tracking.
- Identity and system-prompt construction.

## Partial

These work, but are not yet full-product complete:

- `src/gateway.ts`
  - Slash-command parsing exists.
  - Missing broader chat/gateway orchestration model, middleware pipeline, and richer command behaviors.
- `src/runtime/compaction.ts`
  - Standard/reactive strategies present.
  - Missing broader Python compaction family, identifier preservation, memory bridge, and post-compact cleanup semantics.
- `src/runtime/workspace.ts`
  - Workspace detection exists.
  - Still needs deeper project semantics and stronger integration into prompts, tools, and diagnostics.
- `src/ui/`
  - Core chat path works.
  - Missing deeper operator history surfaces beyond the improved session catalog, transcript peeks, and recent-session UI panel.
- Tool surface
  - Core built-ins exist.
  - Missing broader safe tool inventory and deeper schema coverage.

## Unbuilt or Intentionally Deferred

These remain major gaps:

- Long-term memory system.
- Workflow engine and checkpointing.
- Multi-agent coordination.
- Colony orchestrator and work queue.
- MCP subsystem.
- Event bus and monitoring layer.
- Gateway daemon and multi-surface delivery.
- External channel adapters.
- Release-grade doctor, first-run, and packaging experience.

## True Priority Order

Current priority order is:

1. Finish single-agent product core.
2. Add memory foundation.
3. Add workflow engine.
4. Add multi-agent colony core.
5. Expand tools, skills, and MCP.
6. Build gateway/multi-surface delivery.
7. Harden and package for release.

This order matters. Broad tool expansion before memory/workflow creates more surface area but not more Colony.

## Subsystem Gap Board

### Runtime

- Status: partial-to-strong
- Closed:
  - loop
  - approvals
  - context tracking
  - tool result storage
  - prompt identity stack
- Remaining:
  - richer compaction family
  - stronger runtime eventing
  - deeper project-semantic workspace injection
  - richer memory-aware runtime eventing beyond the current compaction bridge

### UI and UX

- Status: partial
- Closed:
  - streaming chat path
  - anti-flicker flush pattern
  - approval prompt
  - budget/status surfaces
- Remaining:
  - richer operator panels
  - improved run/session navigation
  - stronger startup and diagnostics UX
  - multi-agent visualization

### LLM Layer

- Status: strong
- Closed:
  - 4 providers
  - failover executor
  - usage tracker
  - rate limiter
  - selector and effort resolution
  - caveman bridge
- Remaining:
  - more operational diagnostics
  - richer historical visibility and drill-down around provider failures

### Security

- Status: strong but not finished
- Closed:
  - vault
  - bash validation/classification
  - permission checker
  - audit trail
  - policy engine
  - secret scanner
  - path validator
- Remaining:
  - end-to-end hardening passes
  - broader security test coverage across gateway/workflow/agents

### Memory

- Status: foundation in progress
- Reference: Python memory modules + MemPalace
- Present:
  - local durable transcript logging
  - searchable recall across session transcripts
  - layered retrieval: verbatim transcript + derived compact artifacts + markdown memory snippets
  - compaction-to-memory handoff so compacted turns are persisted before live removal
  - structured reusable fact extraction with scope/category metadata and cross-session dedup
  - query-time surfacing of durable colony facts vs agent-scoped facts
  - async-safe MemPalace store/layer/graph foundation with no sync filesystem helpers in active stack paths
- Remaining:
  - deeper entity/fact extraction beyond current heuristic baseline
  - stronger MemPalace room/closet/drawer hierarchy
  - higher-precision cross-session ranking and recall controls

### Workflow

- Status: unbuilt
- Reference: Python workflow modules + Superpowers execution discipline
- Need:
  - DAG definitions
  - step execution
  - checkpoints
  - retries
  - artifacts
  - resumability

### Agents and Orchestrator

- Status: unbuilt
- Reference: Python agents/orchestrator + OpenClaw coordination ideas
- Need:
  - spawn model
  - worker lifecycle
  - coordinator
  - queues
  - inter-agent communication
  - shared budgets/approvals

### Tools, Skills, MCP

- Status: partial/unbuilt
- Reference: Python skills and MCP + Claude Code tool UX
- Need:
  - broader tool inventory
  - honest runtime and docs parity around currently unshipped web and glob tools
  - skill loader and selector
  - MCP server/client foundations
  - schema/permission consistency across all tools

### Gateway and Channels

- Status: partial/unbuilt
- Reference: Python gateway + OpenClaw delivery architecture
- Need:
  - middleware pipeline
  - daemon/control-plane
  - remote session access
  - channel adapters

## Reference Map By Upcoming Phase

Use references this way:

- Single-agent product core:
  - Python runtime/chat/gateway
  - Claude Code terminal UX and permission flow
- Memory foundation:
  - Python memory modules
  - MemPalace layered recall patterns
- Workflow:
  - Python workflow modules
  - Superpowers development discipline for verification rigor
- Multi-agent:
  - Python agents/orchestrator
  - OpenClaw session/control-plane inspiration where useful
- Skills and MCP:
  - Python skills/MCP
  - `skills-main` format conventions
- Research/autonomous loops:
  - `autoresearch-master` for bounded experiment patterns, not direct runtime parity

## Definition of Full Coverage

Full coverage does not mean "every Python line copied."

Full coverage means:

- All major Colony behaviors exist in TS.
- Single-agent and multi-agent paths both work.
- Memory, workflow, and orchestration are real, not stubs.
- Security model remains law across every subsystem.
- UI and gateway surfaces expose runtime truth clearly.
- Release path is reliable for actual use, not only development demos.

## Immediate Gaps To Close Next

1. Truth sync and benchmark board maintenance.
2. Single-agent product core closure.
3. Memory completion on MemPalace.
4. Workflow base layer.
5. Multi-agent runtime scaffolding.
6. Tools, skills, and MCP expansion.
7. Gateway daemon and multi-surface architecture.
8. Release-grade doctor, onboarding, and packaging.
