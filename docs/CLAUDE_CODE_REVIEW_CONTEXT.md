# Claude Code Review Context

Use this document as the workspace orientation packet for a Claude Code review of
The Colony. It describes the folder structure, sources of truth, active project,
read-only references, and review boundaries.

## Review Target

Primary project:

- `D:\The Colony Test\colony-ts\`

This is the active TypeScript/Bun implementation. Production code changes,
review comments, verification suggestions, and docs updates should target this
tree unless explicitly instructed otherwise.

Important local state:

- The workspace root is `D:\The Colony Test\`.
- The active project is `colony-ts`, not the Python reference and not a benchmark
  repository.
- The current active implementation is a Bun + TypeScript terminal-first agent
  operating system.
- The verification frontier should be read from `colony-ts\package.json` and
  `colony-ts\AGENTS.md`. At the time this handoff was written, the project-level
  guidance references verification through `verify:phase384` plus
  `tsc --noEmit`; older root guidance may mention a lower phase count.

## Source Of Truth Order

When sources disagree, use this precedence:

1. `D:\The Colony Test\colony-ts\AGENTS.md`
   - Active TypeScript project rules.
   - Current implementation state.
   - Current critical constraints.
   - Current "what is next" ordering.
2. `D:\The Colony Test\colony-ts\docs\EXECUTION_PLAN.md`
   - Ordered phase plan.
   - File targets by subsystem.
   - Reference routing by phase.
   - Verification and exit criteria.
3. `D:\The Colony Test\colony-ts\docs\PROJECT_STATE.md`
   - Current built/not-built claims.
   - Alpha proof path.
   - Release claim-safety rule.
4. `D:\The Colony Test\colony-ts\docs\ROADMAP.md`
   - Forward roadmap.
   - Release and phase direction.
5. `D:\The Colony Test\colony-ts\docs\GAP_ANALYSIS.md`
   - Known subsystem gaps.
   - Useful review checklist for missing behavior.
6. `D:\The Colony Test\colony-ts\docs\BENCHMARK_BOARD.md`
   - Capability-class parity board against Claude Code and OpenClaw.
7. `D:\The Colony Test\colony-ts\docs\REFERENCES.md`
   - Reference repository map and intended usage.
8. `D:\The Colony Test\AGENTS.md`
   - Workspace-level map.
   - Useful for global folder boundaries, but can lag the active project docs.

Do not treat README marketing, old writeups, or benchmark repository docs as
stronger truth than the active project guidance above.

## Active Project Structure

Root:

- `D:\The Colony Test\colony-ts\AGENTS.md`
  - Primary agent instructions for the TypeScript project.
  - Read first before reviewing code.
- `D:\The Colony Test\colony-ts\package.json`
  - Bun scripts, executable entry, dependencies, and verification gates.
  - `start` runs `bun run src/index.tsx`.
  - `verify:all` is the broad regression gate.
  - `verify:alpha0` is the focused Launch Alpha 0 gate.
  - Individual phase gates are `verify:phaseN` scripts.
- `D:\The Colony Test\colony-ts\tsconfig.json`
  - TypeScript compiler settings.
- `D:\The Colony Test\colony-ts\bun.lock`
  - Dependency lockfile.
- `D:\The Colony Test\colony-ts\README.md`
  - Public-facing project overview and onboarding.
- `D:\The Colony Test\colony-ts\colony.exe`
  - Existing compiled binary artifact. Do not assume it reflects current source.
- `D:\The Colony Test\colony-ts\node_modules\`
  - Installed dependencies.
- `D:\The Colony Test\colony-ts\.tmp-*`
  - Temporary verification/debug output. These are not design sources of truth.

Docs:

- `D:\The Colony Test\colony-ts\docs\COLONY_BIBLE.md`
  - Project identity and high-level product law.
- `D:\The Colony Test\colony-ts\docs\COLONY_METHOD_FRAMEWORK_BIBLE.md`
  - 12-caste method framework details.
- `D:\The Colony Test\colony-ts\docs\DECISIONS.md`
  - Settled decisions. Do not relitigate without strong reason.
- `D:\The Colony Test\colony-ts\docs\EXECUTION_PLAN.md`
  - Main implementation sequence.
- `D:\The Colony Test\colony-ts\docs\ROADMAP.md`
  - Roadmap and phase direction.
- `D:\The Colony Test\colony-ts\docs\GAP_ANALYSIS.md`
  - Known remaining gaps.
- `D:\The Colony Test\colony-ts\docs\BENCHMARK_BOARD.md`
  - Capability parity board.
- `D:\The Colony Test\colony-ts\docs\MARKET_GAP_ANALYSIS.md`
  - Market/competitor gap framing.
- `D:\The Colony Test\colony-ts\docs\PARITY_EXECUTION_BOARD.md`
  - Benchmark-closure sequencing.
- `D:\The Colony Test\colony-ts\docs\PROJECT_STATE.md`
  - Current built/not-built state.
- `D:\The Colony Test\colony-ts\docs\REFERENCES.md`
  - Reference repo map.
- `D:\The Colony Test\colony-ts\docs\LAUNCH_ALPHA_0.md`
  - Alpha 0 launch proof path and scope.
- `D:\The Colony Test\colony-ts\docs\ANTELLIGENCE_PLAYBOOK.md`
  - Launch-facing operating model framework.
- `D:\The Colony Test\colony-ts\docs\ANTELLIGENCE_LAUNCH_CHECKLIST.md`
  - Claim-safety and launch checklist.
- `D:\The Colony Test\colony-ts\docs\SKILLS_REPO_REVIEW.md`
  - Skills reference review notes.

Source:

- `D:\The Colony Test\colony-ts\src\index.tsx`
  - Bun executable entrypoint and UI/runtime bootstrap.
- `D:\The Colony Test\colony-ts\src\runtime\`
  - `AgentLoop`, prompt assembly, approvals, tools, compaction, session behavior,
    result externalization, and runtime orchestration.
- `D:\The Colony Test\colony-ts\src\ui\`
  - React/Ink terminal operator interface.
  - Streaming must remain anti-flicker: buffer in refs and flush on bounded
    cadence.
- `D:\The Colony Test\colony-ts\src\llm\`
  - Provider stack: Ollama, Anthropic, OpenAI-compatible, Gemini, failover,
    rate limiting, cost tracking, and Caveman bridge.
  - Providers must use raw `fetch()`, not vendor SDKs.
- `D:\The Colony Test\colony-ts\src\memory\`
  - Canonical transcript logging, exact recall, derived fact extraction, memory
    service behavior, and recall inspection.
- `D:\The Colony Test\colony-ts\src\mempalace\`
  - Async-safe MemPalace hierarchy/routing foundation.
  - Exact transcript truth must stay separate from derived memory artifacts.
- `D:\The Colony Test\colony-ts\src\security\`
  - Vault, path validation, shell/bash validation, audit, and log sanitization.
  - Security-sensitive logic should remain pure TypeScript with zero new npm
    dependencies.
- `D:\The Colony Test\colony-ts\src\mcp\`
  - MCP client/server foundations, guarded transports, trusted configuration,
    registry/plugin marketplace handoff surfaces, and approval-bound execution
    receipt logic.
- `D:\The Colony Test\colony-ts\src\skills\`
  - Skill discovery, parsing, selection, and prompt instruction generation.
- `D:\The Colony Test\colony-ts\src\agents\`
  - Worker/agent registry and caste-aware worker lifecycle pieces.
- `D:\The Colony Test\colony-ts\src\orchestrator\`
  - Coordinator primitives, task queue behavior, fan-out/fan-in, and swarm
    coordination support.
- `D:\The Colony Test\colony-ts\src\workflow\`
  - DAG workflow definitions, durable runs, checkpoints, approvals, retries,
    templates, and automation controller.
- `D:\The Colony Test\colony-ts\src\channel\`
  - External channel abstractions and host-owned channel/session bridge logic.
- `D:\The Colony Test\colony-ts\src\daemon\`
  - Local daemon/control-plane host and client/server foundations.
- `D:\The Colony Test\colony-ts\src\browser\`
  - Browser-related local runtime support.
- `D:\The Colony Test\colony-ts\src\store\`
  - Shared persistence/store helpers.
- `D:\The Colony Test\colony-ts\src\caste\`
  - Caste/method model compatibility and display semantics.
- `D:\The Colony Test\colony-ts\src\manifesto\`
  - Manifesto/product identity surface.
- `D:\The Colony Test\colony-ts\src\pheromones\`
  - Pheromone/signaling support.
- `D:\The Colony Test\colony-ts\src\proactive\`
  - Proactive behavior foundation.
- `D:\The Colony Test\colony-ts\src\gateway*.ts`
  - Slash-command and gateway surfaces. Several gateway modules are top-level
    files rather than a `src\gateway\` directory.
- `D:\The Colony Test\colony-ts\src\verify-phase*.ts`
  - Phase-specific verification scripts. When reviewing new behavior, expect a
    matching or extended verifier.

## Runtime Baseline To Assume

The active project is not a mock-only prototype. Current shipped foundations
include:

- Real `AgentLoop` wired to the Ink UI.
- Provider stack for Ollama, Anthropic, OpenAI-compatible, and Gemini.
- Conservative approval behavior.
- Tool result externalization/redaction for large outputs.
- Exact transcript memory plus derived recall and MemPalace inspection surfaces.
- Workflow DAG/checkpoint/retry/approval foundations.
- Planner/worker/reviewer swarm runtime over `ColonyCoordinator`, including
  LLM-backed Alpha 0 demo path.
- MCP, skill, daemon, channel, GitHub provided-issue handoff, local-only web
  control, and plugin marketplace/host handoff foundations.
- Redaction hardening across provider, doctor/onboarding, memory, and operator
  surfaces through the latest verification phases.

Not built or not default-enabled for Alpha 0:

- Hosted public control plane.
- Default live Slack/Discord/Telegram delivery.
- Credential persistence for external vendors.
- Automatic push or PR creation.
- Autonomous remote mutation without explicit approval.
- Built-in live plugin registry fetch/install/activation client UX.

## Critical Review Rules

Use these as hard constraints when reviewing or proposing changes:

- Modify only `D:\The Colony Test\colony-ts\` unless the user explicitly asks
  otherwise.
- Do not modify `D:\The Colony Test\the-colony\` or benchmark repositories.
- Read Python source first when porting behavior from `the-colony`.
- Preserve Python defaults, edge cases, and error paths when porting.
- Adapt implementation to TypeScript/Bun idioms.
- Add or extend `src\verify-phaseN.ts` coverage for behavior changes.
- Keep security-sensitive logic pure TypeScript with zero npm dependencies.
- LLM providers must use raw `fetch()`, not vendor SDKs.
- Default tool approval must remain conservative.
- Avoid blocking I/O in the main runtime.
- Tool results over 10 KB must be externalized and redacted before durable
  persistence.
- Keep exact transcript truth separate from Caveman summaries and other derived
  memory artifacts.
- Read-only tools may run in parallel. Mutating tools should remain sequential.
- Caveman compression may reduce model-bound/internal agent traffic, but must
  never replace canonical human text.
- Do not weaken log sanitizer ordering; sanitizer should be installed before
  modules that may emit secrets.

## Reference Repositories

All reference repositories below are read-only unless the user explicitly says
otherwise.

### Python Behavioral Reference

- `D:\The Colony Test\the-colony\`

Use for:

- Runtime loop behavior.
- Approvals and security behavior.
- Gateway/chat behavior.
- Workflow, agent, orchestrator, and memory behavior.
- Defaults, edge cases, and error paths while porting.

Important subpaths:

- `D:\The Colony Test\the-colony\src\`
- `D:\The Colony Test\the-colony\src\colony\runtime\`
- `D:\The Colony Test\the-colony\src\colony\chat\`
- `D:\The Colony Test\the-colony\src\colony\gateway\`
- `D:\The Colony Test\the-colony\mempalace\`
- `D:\The Colony Test\the-colony\skills\`
- `D:\The Colony Test\the-colony\tests\`
- `D:\The Colony Test\the-colony\web\`

Do not treat it as:

- A release-quality ceiling.
- A reason to copy stale UX assumptions.
- A place to make code changes during TypeScript review.

### Claude Code Benchmark

- `D:\The Colony Test\claude-code-main\`

Use for:

- Terminal/React/Ink UX patterns.
- Command and tool ergonomics.
- Permission interrupt patterns.
- Compaction warnings and context UX.
- MCP/plugin/tool surface ideas.

Important subpaths:

- `D:\The Colony Test\claude-code-main\src\`
- `D:\The Colony Test\claude-code-main\README.md`

Do not use it as:

- A branding model.
- A reason to weaken Colony approvals.
- A reason to collapse exact transcript guarantees.

Note: `D:\The Colony Test\claude-code\` also exists. Treat
`claude-code-main\` as the named benchmark reference unless the user directs
otherwise.

### OpenClaw Benchmark

- `D:\The Colony Test\openclaw-main\`

Use for:

- Daemon/control-plane patterns.
- Remote approval/session delivery.
- Web, channel, and voice client architecture.
- Multi-surface session hosting.
- Plugin/extension architecture comparisons.

Important subpaths:

- `D:\The Colony Test\openclaw-main\src\`
- `D:\The Colony Test\openclaw-main\ui\`
- `D:\The Colony Test\openclaw-main\extensions\`
- `D:\The Colony Test\openclaw-main\packages\`
- `D:\The Colony Test\openclaw-main\docs\`

Do not use it as:

- A reason to make Colony default-live or remotely mutable without explicit
  approvals and host-owned boundaries.

### MemPalace Reference

- `D:\The Colony Test\mempalace-develop\`

Use for:

- Layered memory hierarchy.
- Hall/wing/room/drawer placement ideas.
- Retrieval and navigation patterns.
- Exact-vs-derived memory separation strategy.

Do not use it as:

- A replacement for canonical transcript truth.
- A reason to store Caveman summaries as canonical user memory.

### Skills Reference

- `D:\The Colony Test\skills-main\`

Use for:

- `SKILL.md` structure.
- Skill discovery and instruction conventions.
- Skill selection patterns.

### Superpowers Reference

- `D:\The Colony Test\superpowers-main\`

Use for:

- Slice discipline.
- Evidence-over-claims verification culture.
- Structured implementation sequencing.
- Review rigor.

### Bounded Research Reference

- `D:\The Colony Test\autoresearch-master\`

Use for:

- Bounded autonomous research loops.
- Future proactive/workflow experimentation patterns.

## Other Workspace Folders

These folders exist under `D:\The Colony Test\` but are not primary sources of
truth for this review unless specifically requested:

- `D:\The Colony Test\colony-ts-worktree\`
  - Separate TypeScript worktree/copy. Do not assume it is the active project.
- `D:\The Colony Test\Antelligence\`
  - Launch/product framework material. Useful for messaging context, not runtime
    proof.
- `D:\The Colony Test\gstack\`
  - Separate project/reference. Not part of the default Colony review target.
- `D:\The Colony Test\Draw.io\`
  - Diagram assets.
- `D:\The Colony Test\src\`
  - Root-level source folder. Not the active Colony TypeScript source tree.
- `D:\The Colony Test\.agents\`
  - Agent-local metadata.
- `D:\The Colony Test\.codex\`
  - Codex-local metadata.
- `D:\The Colony Test\full_project_writeup.md`
  - Older long-form writeup. Useful context only; not stronger than current docs.
- `D:\The Colony Test\the-colony-implementation-roadmap.md`
  - Older roadmap. Useful context only; not stronger than current docs.
- `D:\The Colony Test\The_Decision_Book.pdf`
  - Background/reference material.

## Review Strategy For Claude Code

Recommended review order:

1. Read `D:\The Colony Test\colony-ts\AGENTS.md`.
2. Read `D:\The Colony Test\colony-ts\docs\PROJECT_STATE.md`.
3. Read `D:\The Colony Test\colony-ts\docs\EXECUTION_PLAN.md`.
4. Inspect `D:\The Colony Test\colony-ts\package.json` verification scripts.
5. Review changed files or target subsystem under `D:\The Colony Test\colony-ts\src\`.
6. Cross-check behavior against `D:\The Colony Test\the-colony\` only when
   reviewing a port or behavior parity claim.
7. Use benchmark repos only for pattern comparison, not as binding behavior.
8. Verify any substantive code change with the narrow relevant
   `bun run verify:phaseN` gate, then broader gate if risk warrants.

Review comments should prioritize:

- Security regression risk.
- Approval bypass risk.
- Transcript truth vs derived memory confusion.
- Redaction gaps.
- Blocking I/O in runtime/UI paths.
- Provider SDK usage or accidental dependency creep.
- Unverified behavior claims.
- Mismatch between docs and code.
- Missing or weak `verify-phase` coverage.
- Public/hosted/default-live claims that exceed implemented behavior.

## Good Review Prompts

For a broad review:

```text
Review D:\The Colony Test\colony-ts using docs\CLAUDE_CODE_REVIEW_CONTEXT.md as
the orientation packet. Focus on correctness, security, approval boundaries,
redaction, transcript truth, and verification gaps. Do not modify reference
repositories.
```

For a focused subsystem review:

```text
Review D:\The Colony Test\colony-ts\src\<subsystem> against the active project
rules in AGENTS.md and the phase expectations in docs\EXECUTION_PLAN.md. Check
for security, blocking I/O, approval, redaction, and missing verify-phase
coverage. Use the-colony only as read-only behavioral reference when needed.
```

For a docs claim-safety review:

```text
Review D:\The Colony Test\colony-ts\docs for claims that exceed verified
implementation. Use package.json verification scripts, PROJECT_STATE.md, and
EXECUTION_PLAN.md as the truth baseline. Flag hosted/default-live/channel/plugin
or credential-persistence claims unless backed by verifiers or explicit manual
smoke steps.
```

## Current Review Caution

This repository may have uncommitted local changes. Before reviewing, run:

```powershell
git -C "D:\The Colony Test\colony-ts" status --short
```

Do not revert unrelated changes. Treat dirty files as user/local work unless the
user explicitly asks for cleanup or rollback.
