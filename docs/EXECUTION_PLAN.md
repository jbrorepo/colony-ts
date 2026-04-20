# The Colony - Execution Plan

Last Updated: 2026-04-16

This document turns roadmap into execution order with file targets, reference sources, verification gates, and exit criteria.

## Planning Rules

- `the-colony` is behavioral reference, not perfection ceiling.
- Do not re-decide anything already settled in `DECISIONS.md`.
- New work lands as vertical slices: runtime, UI, storage, security review, verification, docs.
- No broad tool-surface expansion before memory and workflow foundations.
- Each completed slice updates roadmap/gap docs if project shape changed.

## Reference Routing

Use references by subsystem:

- Runtime loop, prompting, compaction, approvals, gateway:
  - `the-colony/src/colony/runtime/*`
  - `the-colony/src/colony/chat/*`
  - `the-colony/src/colony/gateway/*`
- Terminal UX, permission interrupts, compaction warnings:
  - `claude-code-main/src/components/*`
  - `claude-code-main/src/hooks/toolPermission/*`
  - `claude-code-main/src/services/compact/*`
- Gateway, daemon, remote client patterns:
  - `openclaw-main/*`
- Memory architecture:
  - `mempalace-develop/*`
- Skill format:
  - `skills-main/*`
- Development discipline:
  - `superpowers-main/*`
- Bounded research loops:
  - `autoresearch-master/*`

## Phase Map

| Phase | Goal | Main Output | Rough Effort |
| --- | --- | --- | --- |
| 0 | Reality sync and control board | docs + verification gate | 2-3 days |
| 1 | Single-agent product core | complete daily-driver terminal agent | 1-2 weeks |
| 2 | Memory foundation | durable recall and retrieval | 2-3 weeks |
| 3 | Workflow engine | resumable multi-step execution | 2-3 weeks |
| 4 | Multi-agent colony core | planner/worker/reviewer runtime | 3-5 weeks |
| 5 | Tools, skills, MCP | extensible safe capability layer | 2-3 weeks |
| 6 | Gateway and multi-surface | daemon + remote clients + channels | 3-4 weeks |
| 7 | Hardening and release | release candidate | 2 weeks |

## Phase 0 - Reality Sync and Control Board

Goal: Make planning truth match code truth.

Primary files:

- `docs/ROADMAP.md`
- `docs/GAP_ANALYSIS.md`
- `docs/EXECUTION_PLAN.md`
- `docs/BENCHMARK_BOARD.md`
- `package.json`

Deliverables:

1. Refresh roadmap around actual current runtime state.
2. Refresh gap analysis around real remaining work.
3. Add deep execution plan with dependencies and file targets.
4. Add benchmark board scoring capability-class parity against Claude Code and OpenClaw.
5. Make `verify:all` include `verify-phase19a`.
6. Remove or ship misleading claims around `/swarm`, `http_request`, `glob_find`, provider count, and verification count.

Verification:

- `bun run verify:all`

Exit criteria:

- No core doc claims remain that contradict current implementation.
- Help text and slash-command descriptions are truthful about what is shipped now.
- Every remaining major subsystem has a phase and an owner path.

## Phase 1 - Single-Agent Product Core

Goal: Finish everything needed for confident long-session single-agent use.

### Slice 1.1 - Gateway and Command Completion

Primary files:

- `src/gateway.ts`
- `src/ui/app.tsx`
- `src/ui/use-colony-loop.ts`
- future `src/chat/*` if command/runtime split becomes necessary

Python reference:

- `chat/slash_commands.py`
- `chat/agent.py`
- `gateway/router.py`

Deliverables:

1. Complete slash-command surface around real runtime state.
2. Separate parse, execute, and UI-render concerns if current gateway file starts mixing all three.
3. Add commands for diagnostics, session control, compact/status/cost/workspace/provider state as real actions.
4. Harden command queue behavior during active runs and interrupts.

Verification:

- Extend verify phases for parser, command result, and runtime integration.
- Manual terminal validation for each command path.

Exit criteria:

- Slash commands are reliable operator interface, not helper stubs.

### Slice 1.2 - Startup, Workspace, and Provider Readiness

Primary files:

- `src/index.tsx`
- `src/runtime/workspace.ts`
- `src/llm/provider-manager.ts`
- `src/llm/failover-probe.ts`
- possible future `src/doctor.ts`

Reference:

- Python `doctor.py`, `first_run.py`, `workspace.py`
- OpenClaw startup/runtime checks

Deliverables:

1. TTY, provider, workspace, and config readiness checks.
2. Clear startup error messages for missing Ollama, missing API keys, unreachable providers, invalid workspace assumptions.
3. Surface readiness inside UI, not only terminal logs.

Verification:

- Verify cases for provider absence, missing key, and workspace detection edge cases.

Exit criteria:

- Bad environment gives clear next action, not mystery failure.

### Slice 1.3 - Prompt and Context Completeness

Primary files:

- `src/runtime/prompt-builder.ts`
- `src/runtime/prompt-assembler.ts`
- `src/runtime/prompt-templates.ts`
- `src/runtime/identity.ts`
- `src/runtime/loop.ts`

Reference:

- Python prompt/identity files
- Claude Code system prompt composition patterns where useful

Deliverables:

1. Add richer workspace/session/runtime context blocks.
2. Make command, approval, tool, and compaction state available to prompts where appropriate.
3. Define exact prompt layering and retention rules.

Verification:

- Prompt assembly assertions by caste, provider, workspace, and tool-state conditions.

Exit criteria:

- Prompt construction becomes explicit, stable, and inspectable.

### Slice 1.4 - Compaction Breadth and Operator Visibility

Primary files:

- `src/runtime/compaction.ts`
- `src/runtime/loop.ts`
- `src/ui/store.ts`
- `src/ui/components.tsx`

Reference:

- Python `compaction.py`
- Python `compaction_strategies.py`
- Python `context_window.py`
- Claude Code auto-compact thresholds

Deliverables:

1. Expand beyond standard/reactive where needed.
2. Add better visibility into why compaction ran, what changed, what was preserved.
3. Prepare compaction-to-memory handoff contract for Phase 2.

Verification:

- Strategy-specific assertions and UI state assertions.

Exit criteria:

- Compaction is understandable and predictable under long sessions.

### Slice 1.5 - Tool UX and Safety Polish

Primary files:

- `src/runtime/builtin-tools.ts`
- `src/runtime/tools-registry.ts`
- `src/runtime/tool-result-storage.ts`
- `src/runtime/approval.ts`
- `src/ui/components.tsx`

Reference:

- Python built-in tools and permission handlers
- Claude Code permission UI patterns

Deliverables:

1. Improve tool presentation, approval detail, and denied-result surfaces.
2. Add clearer externalized-result affordances.
3. Preserve strict conservative approval behavior while reducing confusion.

Verification:

- Tool execution, denial, and externalization assertions.

Exit criteria:

- Tool calls feel controlled and legible, not opaque.

## Phase 2 - Memory Foundation

Goal: Give Colony durable continuity.

Primary planned paths:

- `src/memory/*`
- `src/mempalace/*`
- `src/store/*`
- `src/runtime/compaction.ts`
- `src/runtime/prompt-assembler.ts`

Reference:

- Python memory modules
- MemPalace layered architecture

Deliverables:

1. Session recall and searchable history. Baseline shipped.
2. Durable memory write pipeline. Baseline shipped.
3. Entity/fact extraction. Partial heuristic baseline shipped; deeper extraction remains.
4. Retrieval injection into prompts. Baseline shipped.
5. Compaction-to-memory bridge. Baseline shipped.

Verification:

- Retrieval precision/recall smoke checks.
- Persistence and replay assertions.

Exit criteria:

- Colony remembers prior work across sessions without manual pasteback.

## Phase 3 - Workflow Engine

Goal: Add resumable structured execution.

Primary planned paths:

- future `src/workflow/*`
- `src/store/*`
- `src/runtime/loop.ts`
- `src/ui/*`

Reference:

- Python workflow modules
- Superpowers process discipline

Deliverables:

1. Workflow definitions and DAG execution.
2. Checkpoints and resumability.
3. Artifacts and structured outputs.
4. Approval checkpoints in workflow steps.

Verification:

- Step retries, crash recovery, paused run resumption.

Exit criteria:

- Long jobs survive interruption and remain inspectable.

## Phase 4 - Multi-Agent Colony Core

Goal: Turn assistant into colony.

Primary planned paths:

- future `src/agents/*`
- future `src/orchestrator/*`
- `src/runtime/*`
- `src/ui/*`

Reference:

- Python agents/orchestrator
- OpenClaw coordination ideas where aligned

Deliverables:

1. Agent spawn model and worker lifecycle.
2. Coordinator, work queue, inter-agent messaging.
3. Shared policies for cost, approvals, and security.
4. Swarm visibility in UI.

Verification:

- Multi-agent fan-out/fan-in tests.
- Cancellation, budget, and approval propagation tests.

Exit criteria:

- Planner/worker/reviewer execution is real, visible, and safe.

## Phase 5 - Tools, Skills, and MCP

Goal: Expand safe capability layer after core runtime stable.

Primary planned paths:

- `src/runtime/*`
- future `src/skills/*`
- future `src/mcp/*`

Reference:

- Python skills and MCP
- `skills-main`
- Claude Code tool schema and UI patterns

Deliverables:

1. Higher-value tool inventory.
2. Skill loader and selection model.
3. MCP client/server foundation.
4. Unified schema, approval, and externalization behavior.

Verification:

- Tool contract assertions and MCP smoke tests.

Exit criteria:

- Colony can safely operate in larger environments with extensible capability plumbing.

## Phase 6 - Gateway and Multi-Surface Delivery

Goal: Make runtime accessible beyond local terminal.

Primary planned paths:

- future `src/gateway/*`
- future `src/channel/*`
- future `src/daemon/*`

Reference:

- Python gateway/channel/daemon
- OpenClaw gateway/control-plane architecture

Deliverables:

1. Gateway middleware pipeline.
2. Daemon/control-plane session host.
3. Remote approvals and remote session clients.
4. Channel adapters.

Verification:

- Session API smoke tests and remote client flow tests.

Exit criteria:

- Terminal UI becomes one client of shared runtime.

## Phase 7 - Hardening and Release

Goal: Convert full feature set into release candidate.

Primary planned paths:

- all runtime-critical modules
- future packaging/doctor/onboarding paths

Reference:

- Python doctor/first-run/hardware tooling where useful
- OpenClaw operational patterns

Deliverables:

1. Failure-injection tests.
2. Performance and token benchmarks.
3. Packaging and first-run flow.
4. Operator docs and release checklist.

Verification:

- Repeatable release gate with full regression pass.

Exit criteria:

- Project has release candidate, not just development momentum.

## Immediate Next 10 Slices

This is exact near-term order:

1. Split `src/gateway.ts` parser/executor/render concerns before it turns into permanent monolith.
2. Deepen workspace semantics beyond markers: repo intent, stack shape, and prompt/tool integration.
3. Deepen memory extraction, cross-session ranking, and exact-vs-derived recall controls.
4. Expand MemPalace hierarchy integration beyond current hybrid artifact baseline.
5. Start workflow run model and checkpoint storage.
6. Expand compaction family beyond standard/reactive now that handoff contract exists.
7. Improve operator panels for session navigation, transcript peeks, and diagnostics history.
8. Begin multi-agent spawn model and worker lifecycle.
9. Add MCP foundation after memory/workflow primitives are stable.
10. Harden startup doctor, first-run flow, and packaging path.

## Done Definition Per Slice

Slice is done only when all items below true:

1. Behavior implemented.
2. Assertions added or extended.
3. TypeScript clean.
4. Manual smoke path checked if user-visible.
5. Docs updated if project shape changed.
