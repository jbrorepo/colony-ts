# The Colony - Forward Roadmap

Last Updated: 2026-04-16

This roadmap replaces old milestone text that assumed the UI was still stubbed. That is no longer true. The Colony now has a working single-agent spine. Remaining work is product completion, memory, workflow, multi-agent coordination, gateway breadth, and release hardening.

For full task detail, see [EXECUTION_PLAN.md](./EXECUTION_PLAN.md). For subsystem parity status, see [GAP_ANALYSIS.md](./GAP_ANALYSIS.md). For capability-class parity vs Claude Code and OpenClaw, see [BENCHMARK_BOARD.md](./BENCHMARK_BOARD.md).

## Current Baseline

- Real `AgentLoop` wired to Ink UI with streaming output.
- Provider stack present: Ollama, Anthropic, OpenAI-compatible, Gemini.
- Failover, usage tracking, rate limiting, effort selection, and per-model cost drill-down present.
- Conservative per-call approvals present.
- Standard and reactive compaction present.
- Structured runtime logging present.
- Tool result externalization present.
- Prompt identity and prompt assembly present.
- Persisted single-agent session resume foundation present.
- Persisted session catalog is exposed in terminal command UX via `/sessions`, with previews, interruption/checkpoint filters, smart `/resume` targeting including `pending`, and `/history` transcript peeks.
- Startup doctor now checks config presence, writable Colony paths, provider credentials, default cloud readiness, and port availability, with slash-command filters for errors, warnings, and search.
- Provider status now surfaces observed circuit/failover health from real runs without extra probe cost, plus focused slash-command drill-down by provider.
- Status/workspace command UX now includes observed provider health summary, latest failover line, and workspace start-dir visibility.
- Prompt assembly now carries richer workspace/runtime truth, including workspace start-dir, circuit state, provider health, and recent failovers.
- Ink operator surface now shows workspace identity, startup doctor counts, provider health, recent failovers, and recent saved sessions during live runs.
- Caveman outbound compression bridge present for non-local LLM hops while canonical transcript truth remains verbatim.
- Structured reusable fact memory now persists scoped decision/constraint/pattern/preference recall beside transcript truth and derived artifacts.
- Async-safe MemPalace store/layer/graph foundation now avoids sync filesystem helpers in active memory stack paths.
- Verification phases `1..19a` exist and current project baseline is green.

## What This Means

The project is no longer blocked on "can it answer a question?" That milestone is closed. Big remaining gap is not basic runtime viability. Big remaining gap is full Colony breadth and product completeness.

## Execution Order

Work proceeds in this order:

1. Phase 0 - Reality Sync and Control Board
2. Phase 1 - Single-Agent Product Core
3. Phase 2 - Memory Foundation
4. Phase 3 - Workflow Engine
5. Phase 4 - Multi-Agent Colony Core
6. Phase 5 - Tools, Skills, and MCP
7. Phase 6 - Gateway and Multi-Surface Delivery
8. Phase 7 - Hardening, Packaging, and Release

## Phase 0 - Reality Sync and Control Board

Goal: Make docs, verification, and planning match actual codebase state.

Deliverables:

- Rewrite roadmap and gap analysis around actual TS state.
- Add deep execution plan with file targets, references, dependencies, and exit criteria.
- Add and maintain a benchmark board for capability-class parity vs Claude Code and OpenClaw.
- Add single-command project verification entry point.
- Define parity board by subsystem: complete, partial, deferred, or unbuilt.

Exit criteria:

- Planning docs no longer claim UI still uses simulated loop behavior.
- Help text, slash-command descriptions, and benchmark docs describe the same live runtime.
- Team has one ordered build sequence for all remaining major subsystems.
- `bun run verify:all` becomes standard pre/post-change gate.

Estimated effort: 2-3 days

## Phase 1 - Single-Agent Product Core

Goal: Finish everything required for "daily driver" single-agent use.

Focus:

- Gateway and slash-command completion.
- Better session status, workspace awareness, provider readiness, and startup diagnostics.
- Prompt/context plumbing across runtime, workspace, skills, and command surfaces.
- Approval UX hardening and interrupt recovery.
- Context visibility, compaction follow-through, and error recovery polish.
- Tool UX polish without broad tool-surface explosion.

Exit criteria:

- One agent can safely handle long interactive sessions with clear status, approvals, compaction, failover, and usable operator feedback.
- Core slash commands are complete and trustworthy.
- Common misconfiguration paths fail clearly instead of silently degrading.

Estimated effort: 1-2 weeks

## Phase 2 - Memory Foundation

Goal: Give Colony durable continuity across turns and sessions.

Current baseline already shipped:

- JSONL transcript logging with secret sanitization.
- Searchable session recall.
- Hybrid memory retrieval with exact transcript recall kept separate from derived compact artifacts.
- Compaction-to-memory handoff so compacted turns are preserved before removal from live context.
- Structured reusable fact extraction with scope/category metadata and cross-session dedup.
- Async-safe MemPalace store/layer/graph foundation for wake-up, recall, search, and navigation paths.

Focus:

- Local memory write/read pipeline.
- Session recall and searchable history.
- Stronger entity extraction and mission-critical fact retention.
- Layered retrieval model inspired by MemPalace.
- Compaction-to-memory handoff.

Exit criteria:

- Colony can recover useful prior context across sessions without manual copy/paste.
- Compaction no longer acts like context loss; it becomes context distillation.

Estimated effort: 2-3 weeks

## Phase 3 - Workflow Engine

Goal: Add resumable multi-step execution under the chat interface.

Focus:

- Workflow DAG definitions.
- Run records, checkpoints, retries, resumability, artifact tracking.
- Approval checkpoints inside workflow steps.
- Budget-aware and failure-aware execution.

Exit criteria:

- Colony can execute structured jobs, pause, resume, retry, and audit them.

Estimated effort: 2-3 weeks

## Phase 4 - Multi-Agent Colony Core

Goal: Turn single-agent runtime into real colony orchestration.

Focus:

- Agent spawning and worker lifecycle.
- Coordinator, work queue, and inter-agent messaging.
- Caste-aware role assignment.
- Shared budget, approval, and context policies.
- UI for swarm visibility.

Exit criteria:

- Planner/worker/reviewer patterns operate predictably inside one session.
- Multi-agent execution is inspectable, cancellable, and policy-bound.

Estimated effort: 3-5 weeks

## Phase 5 - Tools, Skills, and MCP

Goal: Expand capability surface only after core runtime is stable.

Focus:

- Missing high-value tools.
- Skill loading and selection.
- Workspace-driven tool enablement.
- MCP server/client foundations.
- Uniform schema, approval, and externalization behavior.

Exit criteria:

- Colony can operate on real repositories and external contexts through a safe, extensible interface.

Estimated effort: 2-3 weeks

## Phase 6 - Gateway and Multi-Surface Delivery

Goal: Make terminal UI one client, not whole system.

Focus:

- Gateway middleware pipeline.
- Daemon/control-plane layer.
- Session API and remote approvals.
- External channel adapters.
- OpenClaw-inspired delivery patterns adapted to Colony security law.

Exit criteria:

- Same runtime can serve terminal, headless, and remote clients.

Estimated effort: 3-4 weeks

## Phase 7 - Hardening, Packaging, and Release

Goal: Ship release candidate, not demo.

Focus:

- Security hardening gaps.
- Failure-injection and recovery testing.
- Performance and token benchmarks.
- Packaging, first-run experience, diagnostics, operator docs.

Exit criteria:

- Release candidate with repeatable verification, clear operator story, and known risk envelope.

Estimated effort: 2 weeks

## Immediate Active Slices

This is current execution queue:

1. Phase 0 doc sync and verification entry point.
2. Gateway and slash-command product completion.
3. Startup readiness and workspace/provider diagnostics.
4. Prompt-context completeness and richer session surfaces.
5. Memory foundation.

## Sequencing Rules

- Do not chase broad tool parity before memory and workflow exist.
- Do not open multi-surface gateway work before single-agent product core is complete.
- Do not treat Python parity as finish line where Python itself was unfinished.
- Every slice must land with verification and doc updates.
