# Competitor Gap Analysis - 2026-05-11

This analysis compares the current Colony TypeScript project with the local
Claude Code and OpenClaw benchmark repositories. It is a planning document, not
a launch claim. Public claims still remain limited to behavior covered by
Launch Alpha 0 docs, verifiers, or recorded manual smoke evidence.

## Reference Basis

Colony sources reviewed:

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/BENCHMARK_BOARD.md`
- `docs/GAP_ANALYSIS.md`
- `docs/EXECUTION_PLAN.md`
- `docs/ROADMAP.md`
- `docs/release/COMPETITOR_COMPLETION_BOARD.md`
- `package.json`
- `src/agents/`, `src/channel/`, `src/daemon/`, `src/mcp/`, `src/memory/`,
  `src/mempalace/`, `src/orchestrator/`, `src/runtime/`, `src/skills/`,
  `src/ui/`, `src/workflow/`, `src/github-pr-handoff.ts`, and
  `src/web-control.ts`

Benchmark sources reviewed as read-only material:

- `../claude-code-main/README.md`
- `../claude-code-main/src/commands.ts`
- `../claude-code-main/src/tools/`
- `../claude-code-main/src/services/mcp/`
- `../claude-code-main/src/plugins/`
- `../claude-code-main/src/remote/`
- `../claude-code-main/src/bridge/`
- `../claude-code-main/src/tasks/`
- `../openclaw-main/README.md`
- `../openclaw-main/package.json`
- `../openclaw-main/src/`
- `../openclaw-main/extensions/`
- `../openclaw-main/apps/`
- `../openclaw-main/docs/`

## Executive Summary

Colony has crossed the basic viability line: it has a real AgentLoop terminal
runtime, raw-fetch model providers, conservative approvals, durable memory
foundations, workflow primitives, local-first daemon/web/channel foundations,
and a real planner/worker/reviewer swarm path with durable status, resume, and
retry.

Claude Code remains ahead on terminal product maturity: command breadth,
interactive UX, IDE bridge integration, task/cron/proactive surfaces, LSP and
notebook tools, MCP/plugin polish, and code-review/development workflow
ergonomics.

OpenClaw remains ahead on multi-surface delivery: always-on gateway, control
UI, multi-channel adapters, mobile and desktop nodes, voice/media/canvas,
plugin SDK breadth, packaging, live QA, and operational release tooling.

The fastest credible path toward a full competitor is not to chase every
adapter immediately. Colony should first finish a narrow but real source+Bun
Alpha 0, then close the highest-value local developer loop: approved GitHub
branch/worktree execution, local verification, PR handoff, local web-control
UX, memory polish, swarm production hardening, MCP/plugin execution controls,
and only then broader remote/channel/media surfaces.

## Scored Gap Board

Scores are planning estimates from 0 to 5 against the local benchmark repos.
They measure shipped capability depth, operator UX, verification, and release
readiness, not conceptual architecture.

| Capability | Colony | Claude Code | OpenClaw | Main Gap |
| --- | ---: | ---: | ---: | --- |
| Single-agent terminal product | 3.5 | 5.0 | 3.0 | Colony needs more operator polish, command breadth, compatibility, and terminal smoke evidence. |
| Tool execution inventory | 3.0 | 5.0 | 4.0 | Colony lacks LSP/notebook/browser/canvas/media breadth and package-driven tool execution controls. |
| Security and approvals | 4.0 | 4.0 | 4.0 | Colony is strong by default, but policy UX must be enforced consistently across web, daemon, GitHub, plugins, and channels. |
| Memory and recall | 3.5 | 3.0 | 4.0 | Colony has strong identity and truth separation, but needs real-session recall QA and final MemPalace operator closure. |
| Workflow and tasks | 3.0 | 4.5 | 4.0 | Colony has DAG/checkpoint/retry foundations but lacks broad task/cron/proactive UX and remote approval hardening. |
| Multi-agent swarms | 3.5 | 4.5 | 4.0 | Colony has real planner/worker/reviewer execution; the gap is visualization, long-run resilience, and failure injection. |
| MCP, skills, and plugins | 3.0 | 4.5 | 5.0 | Colony has catalogs and guarded staging, but not production install/update/activation and registry-backed package execution. |
| GitHub and dev workflow | 2.5 | 4.5 | 3.5 | Colony can plan local handoff, but still needs approved branch/worktree mutation, local verification receipts, and PR handoff polish. |
| Daemon, web, and remote control | 2.5 | 4.0 | 5.0 | Colony has local scoped foundations; OpenClaw has the full gateway/control-plane product. |
| Channels, media, and voice | 2.0 | 2.5 | 5.0 | Colony has host-owned foundations only; OpenClaw has broad real adapters, media, device nodes, and voice surfaces. |
| Onboarding, packaging, and release | 2.5 | 4.0 | 5.0 | Colony needs clean-checkout rehearsal, manual TTY evidence, optional binary packaging, perf checks, and support operations. |

## Colony Advantages To Preserve

- Local-first and source+Bun launch path.
- Conservative approval model and explicit non-goals for remote mutation.
- Caste/swarm identity model with planner/worker/reviewer execution.
- Exact transcript truth separated from derived memory and Caveman summaries.
- MemPalace as the durable memory architecture.
- Provider stack built on raw `fetch()` rather than vendor SDK lock-in.
- Verification phase discipline and claim-safety culture.
- Host-owned boundary for external channels and media, avoiding premature
  credential persistence or public listeners.

## Claude Code Gap Detail

Claude Code is strongest where the operator spends all day: the terminal, code
review loop, command system, tool set, IDE integration, MCP/plugin workflows,
and task management.

Colony gaps to close against Claude Code:

1. Terminal command breadth and polish:
   `/commit`, `/review`, `/diff`, `/cost`, `/context`, `/pr_comments`,
   richer `/resume`, richer `/tasks`, `/vim`, theme/keybinding polish, and
   robust command honesty.
2. Development tools:
   LSP tool surfaces, notebook editing, synthetic outputs, richer file edit
   workflows, worktree execution, and GitHub review/pr-comment handling.
3. MCP and plugins:
   OAuth/registry UX, install/update flows, sidecar startup from packages,
   package-code controls, and runtime activation with explicit approval.
4. IDE and remote bridge:
   VSCode/JetBrains bridge behavior, permission callbacks, authenticated
   session execution, and session sharing are not Launch Alpha 0 requirements
   but matter for full parity.
5. Task and proactive surfaces:
   task create/update, cron/wake, remote triggers, monitor/proactive loops, and
   durable operator controls need product hardening after the local loop works.

## OpenClaw Gap Detail

OpenClaw is strongest where Colony is intentionally conservative today:
always-on gateway, control UI, web chat, mobile and desktop nodes, channel
adapters, media/voice/canvas, plugin SDK, tunnels, packaging, live QA, and
deployment operations.

Colony gaps to close against OpenClaw:

1. Gateway and control plane:
   persistent daemon lifecycle, authenticated local web UI, control actions,
   pairing, presence, session recovery, logs, and operator controls.
2. Channels:
   Slack/Discord/Telegram-style surfaces have safe host-owned foundations, but
   broad live delivery, retry workers, media upload/download, slash-command UX,
   and setup journeys remain incomplete and non-default.
3. Media, voice, canvas, and nodes:
   OpenClaw has strong breadth here; Colony should not chase this before the
   local developer loop and swarm product are release-grade.
4. Plugin SDK and extension ecosystem:
   OpenClaw has many extension exports and package surfaces. Colony needs a
   smaller but safer plugin fabric first: staging, approval, install/update,
   sidecar execution controls, and audit.
5. Packaging and QA:
   OpenClaw has release checks, Docker/Nix/dev scripts, live/e2e/perf tests,
   and app packaging. Colony needs clean-checkout release rehearsal and
   repeatable operator support docs before broader distribution.

## Ordered Closure Plan

### 0. Launch Alpha 0 Finish

Close the current launch proof path before adding more breadth. The remaining
gating work is manual TTY smoke evidence, release-readiness truth, clean claim
language, and workspace/change bucketing.

Exit proof:

- `bun run verify:alpha0`
- `bun run release:gate`
- Recorded manual terminal UI smoke with `/doctor first-run`, `/swarm llm ...`,
  and `/swarm status <run_id>`
- No default public listener, channel, credential persistence, push, or PR
  creation claim

### 1. Alpha 1 - GitHub Local Execution Loop

Implement the local developer loop that directly competes with Claude Code
while preserving Colony's approval model.

Scope:

- Deterministic issue intake from provided refs and URLs.
- Approved local branch/worktree creation under a bounded workspace root.
- Verification receipt before PR handoff.
- PR handoff text and commands only, with no push or PR creation by default.

### 2. Alpha 2 - Local Web-Control UX

Make the existing local scoped web-control foundations usable without turning
Colony into a hosted product.

Scope:

- Local bind only.
- Scoped auth.
- Read-only inspection by default.
- Approved local actions only through explicit handoff.
- Clear rejection for missing scopes, non-local host, and public listener
  attempts.

### 3. Alpha 3 - Memory And MemPalace Polish

Finish the memory experience after concrete real-session gaps are observed.

Scope:

- Real-session recall matrix.
- Exact transcript vs derived memory visibility.
- Ownership, decision, issue, path, and procedure recall.
- `/memory plan` and inspection surfaces that explain why an item was returned.

### 4. Beta 1 - Swarm Production Hardening

Turn the real planner/worker/reviewer path into a durable product surface.

Scope:

- Stage timeline visualization.
- Artifact diff/summary review.
- Failure injection.
- Bounded retry history.
- Restart-safe resume evidence over long runs.

### 5. Beta 2 - Tools, MCP, Plugins, And Automation

Close Claude Code plugin/MCP breadth and OpenClaw extension-fabric gaps with a
smaller security-first package path.

Scope:

- Approved package install/update staging.
- Registry metadata verification plus an approval-gated host/network boundary before any live metadata fetch execution.
- Package-code execution controls.
- Package-driven sidecar startup after approval.
- Broader task/cron/proactive controls with audit.

### 6. Beta 3 - Remote, Channel, Media, And Device Breadth

Only after local control, GitHub, memory, and swarm surfaces are reliable, grow
the OpenClaw-style multi-surface system.

Scope:

- Host-owned channel setup journeys.
- Durable retry controls where explicitly configured.
- Media handoff receipts without default credential persistence.
- Optional remote pairing and control UX.
- Voice/mobile/canvas only as opt-in surfaces after safer primitives exist.

### 7. Release Candidate - Packaging And Support

Make the project repeatable for a new operator.

Scope:

- Clean checkout rehearsal.
- Optional binary packaging.
- Checksums and dependency review.
- Startup/perf budgets.
- Support and incident docs.
- Claim-safety search before tag.

## Immediate Next Slice

The next unblocked implementation slice is Alpha 1 local GitHub execution:
convert the existing approval-gated local workspace action plan into a
deterministic, injected, approval-bound branch/worktree executor with fake
executor verification. This closes a high-value Claude Code gap without taking
on OpenClaw's broader remote/channel surface too early.

## Deferred Non-Goals

- Hosted product control plane.
- Default external channel delivery.
- Stored vendor credential values.
- Automatic push or PR creation.
- Autonomous remote mutation.
- Voice, mobile nodes, and canvas as launch headline features.
