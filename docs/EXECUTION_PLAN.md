# The Colony - Execution Plan

Last Updated: 2026-05-14

This document turns roadmap into execution order with file targets, reference sources, verification gates, and exit criteria.

For benchmark-closure sequencing across independent Claude Code and OpenClaw
tracks, use `docs/PARITY_EXECUTION_BOARD.md` alongside this phase plan.

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
5. Make `verify:all` include the active verification frontier (`verify:phase384` as of 2026-05-24).
6. Remove or ship misleading claims around `/swarm`, unshipped web tools, provider count, and verification count.
7. Keep the 12-caste method framework compatibility-first: legacy Python caste values remain accepted for persisted runtime state while public/operator language prefers Queen, Eldest, Assist-Ant, Command-ant, Vigil-ant, Develop-ant, Logist-ant, Consult-ant, Inform-ant, Cogniz-ant, Account-ant, and Oper-ant.

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
3. Entity/fact extraction. Partial heuristic baseline shipped, with ownership/responsibility fact extraction now covered; deeper extraction remains.
4. Retrieval injection into prompts. Baseline shipped, including exact-vs-derived controls and query-intent-aware ordering.
5. Compaction-to-memory bridge. Baseline shipped.
6. MemPalace routing and hierarchy hardening. Substantially advanced across hall/wing/room/source-file routing, nearby/broader traversal, and cross-wing related recall; final closure still remains.

Verification:

- Retrieval precision/recall smoke checks.
- Persistence and replay assertions.
- `verify:phase62` covers non-retrieving `/memory plan <query>` inspection for inferred/explicit truth mode, section ordering, intent tags, palace route hints, structured durable-memory focus/hints/boost labels, bounded structured category matching, sanitized unknown-mode errors, and raw-query non-echo behavior.
- `verify:phase63` covers ownership/responsibility extraction, ranking, memory-context surfacing for `who owns` recall, loaded persisted structured/markdown memory sanitization, and structured-boost admission gating.
- `verify:phase64` covers resolution diagnostic extraction/ranking for what-fixed-it recall, structured query-plan resolution boosts, durable memory-service persistence, and memory-context surfacing.
- `verify:phase81` covers `/memory plan` recall-control previews for exact/derived enablement, MemPalace distance threshold labels, graph-hop bounds, sanitized hall/wing/room/source filter controls, derived-only palace-search boundaries, and body-safe precision diagnostics.
- `verify:phase16` covers compact artifact load sanitization before derived recall.

Exit criteria:

- Colony remembers prior work across sessions without manual pasteback.
- Memory behavior is inspectable and trustworthy across exact transcript recall, derived recall, and MemPalace routing paths.

## Phase 3 - Workflow Engine

Goal: Add resumable structured execution.

Primary planned paths:

- `src/workflow/*`
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

Current shipped baseline:

- `src/workflow/*` validates DAG definitions, persists JSON workflow runs, records checkpoints/artifacts, pauses at approval steps, resumes after approval, and retries task steps up to `maxAttempts`.
- `/workflow` and `/status runtime` expose runtime workflow summaries when `RuntimeContextSnapshot.workflowRuns` is populated.
- `WorkflowSessionBudgetPolicy` gates task steps before handler execution using existing `SessionBudget` accounting, records estimated spend after successful task completion, and fails over-budget runs with failed-step checkpoints.
- approval steps can surface policy reasons and enforce required approvers before resume.
- `WorkflowRuntimeRunner` starts/resumes workflow runs through the engine while emitting runtime-compatible workflow lifecycle hooks and converting durable runs into `RuntimeWorkflowRunSnapshot`.
- `createAgentLoopWorkflowHandler` adapts a real `AgentLoop` into workflow task execution, while `createAgentLoopTaskStep` carries reusable task text, retry policy, dependencies, and budget estimates.
- `createWorkflowTaskTemplateStep`, `createLinearAgentLoopWorkflow`, and `createApprovalGatedDeliveryWorkflow` provide packaged reusable workflow templates for linear AgentLoop work and approval-gated delivery.
- `WorkflowAutomationController` provides serializable workflow automation commands for template listing, template start, run inspection, and approval/resume over durable runs.
- `verify:phase20` covers DAG validation, durable pause/resume, retry behavior, approval checkpoints, artifact capture, step budget gating, spend recording, required-approver policy, runtime hooks, runtime snapshots, AgentLoop-backed workflow task execution, packaged workflow templates, and the workflow automation control API.
- Daemon control-plane host wiring now exists through `DaemonControlPlaneHost`; HTTP transport/listener, a basic remote client, and typed remote session/workflow actions now exist through `DaemonHttpControlPlaneServer` and `DaemonControlPlaneClient`.

Verification:

- Step retries, crash recovery, paused run resumption.
- `bun run verify:phase6`
- `bun run verify:phase7`
- `bun run verify:phase20`

Exit criteria:

- Long jobs survive interruption and remain inspectable.

## Phase 4 - Multi-Agent Colony Core

Goal: Turn assistant into colony.

Primary planned paths:

- `src/agents/*`
- `src/orchestrator/*`
- `src/runtime/*`
- `src/ui/*`

Reference:

- Python agents/orchestrator
- OpenClaw coordination ideas where aligned

Deliverables:

1. Agent spawn model and worker lifecycle.
2. Coordinator, work queue, inter-agent messaging.
3. Fan-out/fan-in execution and cancellation primitives.
4. Shared policies for cost, approvals, and security.
5. Swarm visibility in UI.

Verification:

- Multi-agent fan-out/fan-in tests.
- Cancellation, budget, and approval propagation tests.
- `verify:phase24` covers the caste-aware worker spawn model, per-worker sessions, lifecycle transitions, filtering, lifecycle events, and invalid-transition protection.
- `verify:phase25` covers coordinator queue assignment, worker lifecycle integration, task completion/failure, and direct inter-agent mailbox messaging.
- `verify:phase26` covers fan-out execution records, scoped child task dispatch, fan-in aggregation, and cancellation of queued/assigned children.
- `verify:phase27` covers coordinator budget caps, approval-gated dispatch, required-approver enforcement, and shared security policy evaluation before worker assignment.
- `verify:phase28` covers `/swarm` runtime start/inspect, cancellation, command payloads, and command executor routing.
- `verify:phase87` covers durable swarm run snapshots, restart-safe load/status truth, persisted cancellation of restored runs, worker/task/result/failure/artifact/approval metadata preservation, and malformed journal fail-closed loading.
- `verify:phase226` covers Launch Alpha 0 LLM-backed swarm execution with deterministic fake-provider planner/worker/reviewer stages, persisted artifacts, detailed status, restart-safe resume, bounded retry, and command routing.
- `verify:phase233` covers Beta 1 swarm timeline and failure hardening: started/ended times, attempt continuity, token/cost metadata, artifact counts, redacted artifact review previews, latest failure visibility, retry-history preservation, deterministic failure injection, `/swarm status` timeline/artifact rendering, restart-safe cancellation preservation, interrupted-stage resume history, and persisted approval-wait preservation across resume/retry.

Current baseline:

- `ColonyAgentRegistry` spawns caste-aware planner/worker/reviewer-style workers with per-worker `AgentSession` instances.
- worker snapshots expose role, caste, objective, parent agent, tenant scope, lifecycle state, task context, result context, and session metadata without transcript history.
- lifecycle operations support ready/start/pause/resume/complete/stop with ordered events.
- `ColonyCoordinator` provides an in-memory prioritized task queue, worker task claiming, completion/failure state, and direct worker mailbox messages.
- `ColonyCoordinator` also provides fan-out execution records, scoped child task dispatch, fan-in result aggregation, and execution cancellation.
- `ColonyCoordinator` task snapshots carry budget, approval, security intent, awaiting-approval state, and policy decision telemetry; dispatch fails closed for denied budget/security and blocks approval-gated work until the required approver approves it.
- `ColonySwarmRuntime` starts objective-scoped planner/worker/reviewer swarm runs over coordinator fan-out execution records, `/swarm` supports coordinator-only start/status/cancel plus LLM-backed status/resume/retry actions instead of active-agent chat aliasing, and optional `JsonSwarmRunStore` persistence records restart-safe snapshot truth for run state, workers, tasks, artifacts, approvals, stage attempts, failures, token metadata, and cancellation.

Exit criteria:

- Planner/worker/reviewer execution is real, visible, and safe.

## Phase 5 - Tools, Skills, and MCP

Goal: Expand safe capability layer after core runtime stable.

Primary planned paths:

- `src/runtime/*`
- `src/skills/*`
- `src/mcp/*`

Reference:

- Python skills and MCP
- `skills-main`
- Claude Code tool schema and UI patterns

Deliverables:

1. Higher-value tool inventory.
2. Skill loader and selection model. Baseline shipped.
3. MCP client/server foundation. Baseline shipped.
4. Unified schema, approval, and externalization behavior.

Verification:

- Tool contract assertions and MCP smoke tests.
- `verify:phase30` covers async `SKILL.md` discovery, frontmatter parsing, skill search, bounded prompt instruction generation, and `/skills` list/search/inspect visibility.
- `verify:phase31` covers MCP initialize, `tools/list`, `tools/call`, ToolRegistry-backed MCP exposure, protocol errors, fail-closed approval behavior for approval-gated tools, and verifier-approved exact proof execution.
- `verify:phase65` covers MCP approval-proof hardening: caller-supplied approval booleans are ignored, unknown/fake/mismatched proofs fail closed, verifier exceptions do not leak details, and valid verifier-owned proofs execute only for the exact tool name plus normalized argument signature.
- `verify:phase66` covers the MCP transport bridge: generic transport-backed client operation, monotonic JSON-RPC request envelopes, fail-closed response validation, sanitized transport errors, approval proof across the transport seam, and non-JSON argument rejection before verifier approval.
- `verify:phase67` covers the guarded MCP transport boundary: method/tool allowlists, request/response byte bounds, JSON depth bounds, JSON-compatible envelope rejection, timeout, max-concurrency, origin/plugin allowlists, and bearer-token authentication before real external transports are exposed.
- `verify:phase68` covers server-side MCP JSON-RPC error redaction: unknown methods, internal list/call exceptions, and parser/proxy trap failures return bounded external-safe error messages without leaking raw secrets.
- `verify:phase69` covers MCP result-shape validation: initialize, tools/list, tools/call, resources/list, and resources/read success payloads fail closed on malformed remote transport responses or malformed local adapter output, including result arrays with `toJSON`, symbols, sparse entries, accessors, or non-index properties.
- `verify:phase70` covers the guarded stdio MCP transport foundation: Bun pipe spawning without shell invocation, trusted guard context, initialize/list/call over a child JSON-RPC process, bounded/redacted stderr diagnostics, guarded timeout behavior, and fail-closed mismatched response ids.
- `verify:phase71` covers trusted stdio MCP server configuration: high-risk approval request generation, exact normalized trust signatures, unapproved/stale config rejection before spawn, absolute command enforcement, shell/package-runner/inline-eval rejection, secret env rejection, guard context injection, local tool allowlists, and list-only policy.
- `verify:phase72` covers richer trusted stdio MCP operator/audit surfaces: redacted config inspection and startup trust event projection without process spawn or argv/env leakage.
- `verify:phase73` covers the internal fetch-backed HTTP MCP transport foundation: HTTPS-only endpoints, SSRF host rejection, redirect-disabled POST JSON-RPC flow, safe request cloning, bounded response reads, sanitized failures, abortable timeouts, and fail-closed response-id validation.
- `verify:phase74` covers trusted HTTP MCP server configuration and operator/audit exposure: exact approval signatures, redacted approval requests, guarded client creation, allowlisted tool calls, stale approval rejection, and redacted HTTP trust events without raw transport exposure.
- `verify:phase75` covers trusted plugin MCP sidecar configuration: plugin-specific approval signatures, package/sidecar/capability trust inputs, stale approval rejection, guarded sidecar client creation, allowlisted tool calls, redacted plugin trust events, and no raw sidecar transport exposure.
- `verify:phase76` covers managed plugin MCP sidecar lifecycle: trusted connect handshake, signed protocol/server expectations, initialize-before-use, post-connect initialize replay rejection, lifecycle state, idempotent close, post-close send rejection, retryable/redacted close failures, failed-handshake cleanup, and redacted generic handshake failures.
- `verify:phase77` covers the plugin sidecar supervisor foundation: injected trusted transport factory, exact active-signature handling, direct-start backoff/limit enforcement, bounded restart/backoff policy, redacted in-memory lifecycle event projection, redacted lifecycle snapshots, list/inspect/client/stop behavior, retryable/redacted stop failures, and no plugin package install path.
- `verify:phase78` covers the dry-run plugin package discovery/import planner: manifest validation, digest/source/sidecar checks, deterministic import/update/keep/review/reject plans, normalized trusted sidecar candidates, exact approval request compatibility, fail-closed numeric/method/source validation, redacted rejected metadata, and no package install, package execution, sidecar start, registry fetch, or package/catalog write path.
- `verify:phase79` covers durable plugin package plan events: redacted event projection from Phase 78 plans, append-only JSONL persistence, load-time schema validation, malformed journal fail-closed behavior, exact plugin signature separation, high-entropy actor redaction, and no install, package execution, sidecar start, registry fetch, or package/catalog write path.
- `verify:phase80` covers approval-gated plugin package catalog staging: explicit approval before staging writes, live catalog isolation, body-safe/redacted staged metadata, plugin-signature namespace enforcement, unknown sidecar-kind rejection, fail-closed malformed candidate loading, and no install/update execution, package execution, sidecar start, registry fetch, or live package/catalog promotion path.
- `verify:phase82` covers typed tool metadata contracts: normalized definition defaults, builtin read-only/destructive/concurrency/progress/transcript/search/persisted-result metadata, metadata-derived runtime categories, MCP annotations, and `/tools` operator rendering.
- `verify:phase83` covers safe local tool breadth: `glob_find` path safety/bounds, structured `git_status`, bounded/redacted `git_diff`, approval-gated package `test_runner`/`lint_runner` wrappers, runner script allowlists, and ToolExecutor integration.
- `verify:phase84` covers policy-gated web tools: approval-required `web_fetch`/`web_search`, HTTPS-only network policy, DNS/private-host SSRF rejection, redirect-disabled fetches, text-only response handling, size bounds, timeout/abort wiring, redaction, untrusted-content wrapping, and prompt-injection signal reporting.
- `verify:phase85` covers MCP resource list/read support: resource protocol/client/server surfaces, resource adapter listing/reads, strict resource result-shape validation, guarded resource URI allowlists, redacted read errors, trusted stdio/HTTP/plugin resource policy signing, resource-aware plugin package planning, and operator metadata without routing resources through tool execution.
- `verify:phase86` covers plugin package live catalog promotion: second-approval promotion from staged candidates into live-disabled metadata records, metadata-only rollback records, namespace/catalog isolation, malformed candidate rejection, durable live catalog load/append fail-closed behavior, redaction, and no install/update execution, package execution, sidecar start, registry fetch, or activation path.
- `verify:phase234` covers approval-gated plugin package install/update execution receipts: exact plugin trust approval, import/update-only execution, package-path confinement, `--ignore-scripts` lifecycle blocking, injected executor receipts, redacted stdout/stderr previews, stop-after-failure behavior, and no registry fetch, live activation, sidecar startup, or credential persistence.
- `verify:phase235` covers supplied registry metadata enrichment for plugin package planning: checksum/integrity/signature summaries, raw signature redaction, identity/source/digest mismatch rejection before trust signatures are emitted, unsafe registry metadata rejection, existing no-metadata compatibility, and no live registry fetch, activation, sidecar startup, package execution, or credential persistence.
- `verify:phase236` covers approval-gated plugin package sidecar activation controls: import/update-only activation after a matching completed install/update receipt, exact plugin trust approval, unknown-sidecar and signature-tamper rejection, injected supervisor start, failed-supervisor receipt truth, redaction, and no live registry fetch, default activation, package lifecycle execution, transport creation, or credential persistence.
- `verify:phase237` covers approval-gated plugin registry host/network handoff controls: exact registry-fetch approval, HTTPS/no-credential/no-local URL validation, unsafe URL redaction, signature tamper blocking, and no Colony-owned network execution, package execution, activation, catalog mutation, or credential persistence.
- `verify:phase238` covers approval-gated plugin registry fetch execution receipts: a ready Phase 237 handoff plus exact approval can call only an injected host executor, validate HTTP status/content-type/size/JSON/package identity/digest, persist redacted receipt truth, and still creates no built-in Colony registry client, default marketplace fetch, package execution, activation, catalog mutation, or credential persistence.

Current baseline:

- `SkillCatalog` discovers local `SKILL.md` files without executing adjacent scripts or assets.
- skill metadata captures description, caste, tags, required tools, approval requirements, trust level, and body instructions.
- selected skill instructions can be converted into bounded prompt blocks for the existing prompt skill-instruction path.
- `/skills`, `/skills search`, and `/skills inspect` expose loaded skill catalog truth to operators.
- In-process MCP initialize, tool/resource listing, tool/resource calls, and ToolRegistry-backed tool exposure are covered by `verify:phase31` and `verify:phase85`; generic transport-backed client behavior is covered by `verify:phase66`; guarded transport policy is covered by `verify:phase67`; server-side MCP JSON-RPC error redaction is covered by `verify:phase68`; method-specific result-shape validation and result-array hardening is covered by `verify:phase69`; the first real stdio transport foundation is covered by `verify:phase70`; trusted stdio server configuration is covered by `verify:phase71`; trusted stdio operator/audit inspection is covered by `verify:phase72`; the internal HTTP transport foundation is covered by `verify:phase73`; trusted HTTP config/operator exposure is covered by `verify:phase74`; trusted plugin sidecar config/operator exposure is covered by `verify:phase75`; managed plugin sidecar lifecycle is covered by `verify:phase76`; plugin sidecar supervisor foundation is covered by `verify:phase77`; dry-run plugin package discovery/import planning is covered by `verify:phase78`; durable redacted package plan event persistence is covered by `verify:phase79`; approval-gated plugin package catalog staging is covered by `verify:phase80`; live-disabled package catalog promotion is covered by `verify:phase86`; approval-gated plugin package install/update execution receipts are covered by `verify:phase234`; supplied registry metadata enrichment is covered by `verify:phase235`; approval-gated package-driven sidecar activation controls are covered by `verify:phase236`; registry fetch host/network handoff controls are covered by `verify:phase237`; injected host-executor registry fetch execution receipts are covered by `verify:phase238`; package-code preflight policy is covered by `verify:phase239`; approved host-executed package-code receipts are covered by `verify:phase240`; read-only built-in plugin marketplace view is covered by `verify:phase241`; read-only marketplace activation readiness is covered by `verify:phase242`; redacted marketplace activation handoff descriptors are covered by `verify:phase243`; approved marketplace activation handoff execution receipts are covered by `verify:phase244`; read-only marketplace activation execution status is covered by `verify:phase245`; redacted marketplace install/update handoff descriptors are covered by `verify:phase246`; read-only marketplace install/update execution status is covered by `verify:phase247`; approved marketplace install/update handoff execution receipts are covered by `verify:phase248`; marketplace registry metadata fetch handoff descriptors are covered by `verify:phase249`; read-only marketplace registry fetch execution status is covered by `verify:phase250`; approved marketplace registry fetch handoff execution receipts are covered by `verify:phase251`; read-only marketplace registry-fetch metadata planning is covered by `verify:phase252`; metadata-bound marketplace install/update handoff descriptors are covered by `verify:phase253`; approved metadata-bound marketplace install/update handoff execution receipts are covered by `verify:phase254`; read-only metadata-bound marketplace install/update execution status is covered by `verify:phase255`; read-only metadata-bound marketplace activation readiness is covered by `verify:phase256`; redacted metadata-bound marketplace activation handoff descriptors are covered by `verify:phase257`; approved metadata-bound marketplace activation handoff execution receipts are covered by `verify:phase258`; read-only metadata-bound marketplace activation execution status is covered by `verify:phase259`; read-only plugin marketplace lifecycle status is covered by `verify:phase260`; read-only plugin marketplace lifecycle handoff is covered by `verify:phase261`; read-only plugin marketplace lifecycle runbook is covered by `verify:phase262`; read-only plugin marketplace lifecycle approval packets are covered by `verify:phase263`; read-only plugin marketplace lifecycle approval review is covered by `verify:phase264`; read-only plugin marketplace lifecycle approval handoff is covered by `verify:phase265`; read-only plugin marketplace lifecycle approval handoff preflight is covered by `verify:phase266`; read-only plugin marketplace lifecycle host handoff request descriptors are covered by `verify:phase267`; read-only plugin marketplace lifecycle operator queues are covered by `verify:phase268`; read-only plugin marketplace lifecycle default UX plans are covered by `verify:phase269`; read-only plugin marketplace lifecycle default UX command palettes are covered by `verify:phase270`; read-only plugin marketplace lifecycle default UX command briefs are covered by `verify:phase271`; read-only plugin marketplace lifecycle default UX command transcripts are covered by `verify:phase272`; read-only plugin marketplace lifecycle default UX command panels are covered by `verify:phase273`; read-only plugin marketplace lifecycle default UX command panel digests are covered by `verify:phase274`; read-only plugin marketplace lifecycle default UX command panel digest clipboard packets are covered by `verify:phase275`; read-only plugin marketplace lifecycle default UX command panel digest clipboard review packets are covered by `verify:phase276`; read-only plugin marketplace lifecycle default UX command panel digest clipboard review closeout packets are covered by `verify:phase277`; read-only plugin marketplace lifecycle default UX command panel digest clipboard review closeout summary packets are covered by `verify:phase278`; built-in live/default registry fetch/install UX, default/live plugin activation UX beyond explicit approved handoff execution, and production plugin fabric remain open.
- `InProcessMcpServer`, `InProcessMcpTransport`, and `InProcessMcpClient` provide a minimal JSON-RPC MCP foundation for initialize, tool listing/calls, and resource listing/reads.
- `GuardedMcpTransport` wraps any MCP transport with local fail-closed bounds, timeout/concurrency controls, method/tool/resource URI allowlists, and origin/plugin/auth policy.
- `StdioMcpTransport` provides the first real external MCP adapter foundation over newline-delimited JSON-RPC child-process stdio, with Bun pipe spawning, response-id correlation, bounded stdout framing, redacted stderr diagnostics, and explicit close/kill cleanup.
- `createTrustedStdioMcpClient()` is the approved stdio MCP startup path: it validates named server definitions, requires exact operator trust signatures, injects guarded context, and keeps startup trust separate from per-tool approval.
- `McpToolAdapter` exposes existing `ToolRegistry` definitions as MCP tools and routes calls through `ToolExecutor`; approval-gated tools fail closed unless an injected verifier approves proof bound to the exact tool name plus normalized arguments.
- caller-supplied MCP `_meta.approved` booleans are ignored as authorization; approval proof is verifier-owned across the shipped in-process, guarded, stdio, HTTP, and plugin sidecar MCP boundaries.
- built-in live/default registry fetch/install UX beyond injected handoff descriptors, default/live plugin activation execution UX beyond read-only readiness plus explicit approved supervisor handoff, and production plugin fabric beyond approved install/update/activation/package-code receipts remain open.

Exit criteria:

- Colony can safely operate in larger environments with extensible capability plumbing.

## Phase 6 - Gateway and Multi-Surface Delivery

Goal: Make runtime accessible beyond local terminal.

Primary planned paths:

- shipped gateway modules in `src/gateway-*.ts`, with future split candidates under `src/gateway/*`
- shipped channel foundation in `src/channel/*`, with first outbound external adapter classes, approval/signature helpers, `/channels external` visibility, pure vendor event normalization helpers, host-owned external registration execution, host-owned external vendor event dispatch, host-owned external vendor webhook transport, Telegram-only host-owned webhook setup, signed Slack URL verification challenge handling, Slack subscription setup request staging, Discord Interactions setup request staging, host-owned Slack `apps.manifest.update` direct mutation executor, signed Discord Interactions PING/PONG readiness, host-owned Discord endpoint-url mutation, Slack manual retry UX metadata, opt-in bounded foreground retry, host-owned Discord guild command registration, Slack setup handoff checklist/retry-mode operator UX, Slack response identity binding and optional Slack manifest echo integrity, Slack scope preflight, activation-readiness UX, fast event ACK, approval-bound mention-only `app_mention` subscription/dispatch with `app_mentions:read`, mixed-subscription rejection, deferred ACK, bounded in-memory route/message-id suppression for signed and host-authenticated Slack `message`/`app_mention` retries, redacted durable approved Slack event binding before bridge dispatch, inbound-only Slack media metadata inspection, approval-bound external media transfer handoff, stable media transfer handoff keys/source-ref fingerprints, transfer-key-bound host result success, manual operator retry metadata for retryable host media transfer failures, host-reported success receipt metadata, an opt-in foreground host media transfer worker factory, opt-in source-resolution timeout handling, opt-in vendor-send timeout handling, opt-in source-resolution foreground retry, sanitized aggregate and per-file foreground source-retry metadata, request-only source attempt context, request-only previous source-failure context, request-only vendor-send attempt context, request-only vendor-send target context, sanitized manual retry safety context, manual retry revalidation handoff truth, stage-specific manual retry verification scope, stage-derived manual retry reason codes, stage-derived manual retry operator actions, durable manual retry source-ref fingerprint handoff, manual retry backoff hints, deterministic manual retry backoff correlation handoff, manual retry approval replay handoff truth, manual retry target-correlation handoff truth, manual retry work-item handoff truth, deterministic manual retry work-item correlation ids/truth, manual retry work-item replay preflight truth, manual retry replay host-action handoff truth, manual retry replay source revalidation plan/checklist truth, and redacted Slack/Discord subscription credential setup readiness UX present; remaining channel/live-delivery depth includes broader real host upload/download/retry worker depth beyond the opt-in foreground factory/source attempt context/source previous-failure context/source retry metadata/vendor-send attempt/target context/manual retry safety/revalidation/verification-scope/reason-code/operator-action/source-ref-fingerprint/backoff-hint/correlation/approval-replay/target-correlation/work-item/work-item-correlation/replay-preflight/replay-host-action/source-revalidation-plan/source-revalidation-checklist context/source/vendor-send timeout bounds, retry depth beyond current host-owned metadata/foreground bounds, default public hosting, privileged Gateway intents, broader Discord live-delivery UX beyond Phase112 host-owned `APPLICATION_COMMAND` dispatch and the Phase 107 guild command executor, broader slash-command lifecycle/UX, and default live inbound delivery
- Phase 154 extends that channel baseline with an acknowledgement-bound manual reinvoke host-action descriptor after accepted checklist acknowledgement preflight: the handoff gets a deterministic id and remains credential-free, host-owned, non-executing, and non-persistent. Phase 155 adds a source-revalidation result preflight after that handoff, sanitizing host-reported fingerprint-only fresh-source confirmation against current acknowledgement-bound truth while still resolving, fetching, uploading, executing, persisting, or delivering nothing. Phase 156 adds a result-preflight-bound manual reinvoke host-action descriptor after accepted source revalidation. Phase 157 adds credential-readiness handoff truth after that source-revalidated action, naming only host-owned source-access and channel-send credential labels/responsibilities while still executing, resolving, fetching, uploading, persisting, or delivering nothing. Phase 158 adds a labels-only credential acknowledgement preflight after that readiness, accepting only current host-reported credential labels and rejecting credential values, raw refs, raw targets, URLs, paths, ledgers, execution, persistence, workers, public hosting, automatic vendor retry, and default live delivery claims. Phase 159 adds a credential-acknowledged manual reinvoke host-action descriptor after accepted credential acknowledgement preflight, binding current acknowledgement/readiness/action/result truth without credential values, source resolution, execution, persistence, workers, public hosting, automatic vendor retry, or default live delivery. Phase 160 adds a preflight-only guard for supplied credential-acknowledged host actions, recomputing current acknowledgement-bound truth and rejecting tampered descriptors or execution/persistence/credential/live-delivery claims before any later reinvoke can trust the descriptor. Phase 161 adds a bounded host-owned manual reinvoke request descriptor after accepted credential-acknowledged host-action preflight, binding only recomputed action/source/target/credential-label truth without execution, persistence, credentials, workers, public hosting, automatic vendor retry, or default live delivery. Phase 162 adds a preflight-only guard for supplied credential-acknowledged manual reinvoke request descriptors, recomputing current request truth before later host trust while rejecting tampering, execution claims, credential values, persistence, workers, public hosting, automatic vendor retry, and default live delivery. Phase 163 adds a bounded host-owned manual reinvoke handoff descriptor after accepted request preflight, with deterministic id and fingerprint/label-only truth without resolving sources, executing host handlers, persisting data, retrying automatically, hosting publicly, or enabling default live delivery. Phase 164 adds a preflight-only guard for supplied credential-acknowledged manual reinvoke handoff descriptors, recomputing current handoff truth before later host trust while rejecting tampering, execution claims, credential values, persistence, workers, public hosting, automatic vendor retry, and default live delivery; remaining channel/live-delivery depth is now measured beyond opt-in `credential-acknowledged-manual-reinvoke-execution` context.
- shipped daemon foundation in `src/daemon/*`, with broader remote action controls still pending

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
- `verify:phase21` covers the transport-agnostic daemon session/control-plane API foundation.
- `verify:phase22` covers daemon HTTP request validation, optional bearer-token enforcement, real local listener startup, and remote client session calls.
- `verify:phase23` covers typed remote session recovery-style actions and remote workflow approval actions.
- `verify:phase29` covers scoped daemon bearer authorization, redacted auth status metadata, and `/daemon` operator visibility.
- `verify:phase89` covers the read-only web control shell: fail-closed dedicated `web.read` auth, GET-only HTML and JSON state routes, POST/mutation rejection, daemon/workflow/swarm/channel status-only projection, no mutation endpoints, no form controls, cache-safe JSON headers, query credential redaction, transcript/message/content/tool-output body redaction, and no arbitrary metadata exposure.
- `verify:phase90` covers the local-first GitHub PR handoff workflow: dry-run issue intake, deterministic branch/worktree naming, credential redaction, approval-gated local workspace creation, implementation and verification ordering, failed-verification blocking before PR handoff, second approval before PR creation handoff, and daemon workflow-template exposure.
- `verify:phase91` covers first outbound Slack/Discord/Telegram adapter classes: injected raw `fetch`, platform route mapping, credential/query redaction across status/delivery/errors, and no default registration from contract fixtures.
- `verify:phase92` covers explicit external adapter registration/config gates and vendor inbound signature helpers: exact approval signatures before registration, explicit enabled intent, safe API base validation, raw-body HTTP signature verifier hook, Slack HMAC, Telegram secret-token, and Discord fail-closed injected-verifier semantics.
- `verify:phase93` covers `/channels external` operator visibility and pure Slack/Discord/Telegram event normalization helpers: redacted external registration/config gate rendering, no default adapter registration, no credential leakage, Slack thread/event mapping, Discord channel/guild message mapping, Telegram chat/topic update mapping, malformed event fail-closed behavior, and no vendor event subscription or network delivery claims.
- `verify:phase150` locks manual retry replay source revalidation checklists for external media transfer: accepted source-stage and vendor-stage replay source revalidation plans can produce deterministic host-owned operator checklists that order fresh approval verification, vendor-state verification when needed, per-source fresh resolution/no-stale-file checks, and final manual reinvoke. The checklist does not execute host handlers, resolve sources, fetch/download/upload/preview files, persist revalidation/checklist/work items, create retry ledgers, durable retry audit records, retry workers, schedules, public hosting, credential persistence, automatic vendor retry, or default live delivery, and it carries no raw refs, raw target identifiers, approval signatures, credentials, URLs, or file bytes.
- `verify:phase151` locks manual retry source revalidation checklist preflight for external media transfer: a supplied host/operator checklist is sanitized and compared against freshly recomputed approval-bound replay truth before manual reinvoke, stale approvals and malformed/tampered/current-truth-mismatched checklists fail closed, and no host handler, source resolution, file fetch/download/upload/preview, checklist persistence, retry ledger, durable audit record, retry worker, schedule, public hosting, credential persistence, automatic vendor retry, or default live delivery is created.
- `verify:phase152` locks manual retry source revalidation checklist acknowledgement templates for external media transfer: accepted checklist preflights can produce deterministic host-owned acknowledgement templates with one required acknowledgement per checklist step, vendor-state acknowledgement when required, stable approval-bound template ids, stale approval/malformed checklist rejection, and no host handler, source resolution, file fetch/download/upload/preview, acknowledgement/checklist persistence, retry ledger, durable audit record, retry worker, schedule, public hosting, credential persistence, automatic vendor retry, or default live delivery.
- `verify:phase153` locks manual retry source revalidation checklist acknowledgement preflights for external media transfer: supplied host/operator acknowledgements are sanitized and compared against freshly recomputed acknowledgement-template truth, accepting source/vendor acknowledgement readiness only when ids, checklist/template/work-item/transfer truth, source fingerprints, and step acknowledgements match, while rejecting stale approvals, execution/persistence claims, tampering, and raw-ref/target/signature/credential/URL/ledger leakage without executing host handlers, resolving files, creating retry ledgers, workers, schedules, public hosting, credential persistence, automatic vendor retry, or default live delivery.
- `verify:phase154` locks acknowledgement-bound manual retry host-action handoff after accepted source revalidation acknowledgement preflight: accepted source/vendor acknowledgements produce deterministic credential-free host-action readiness descriptors, stale approvals and tampered acknowledgements fail closed, action ids are stable and approval-bound, and no raw refs, target ids, signatures, credentials, URLs, retry ledgers, workers, schedules, public hosting, source resolution, host execution, automatic vendor retry, or default live delivery are created.
- `verify:phase155` locks source-revalidation result preflight after acknowledgement-bound manual retry host-action readiness: supplied host/operator source revalidation results are sanitized and compared against current acknowledgement-bound truth, accepting only fingerprint-only fresh-source confirmations for source/vendor paths while rejecting stale approvals, tampering, stale-file reuse claims, raw-ref/target/signature/credential/URL/ledger leakage, and any source resolution, host execution, persistence, retry worker, public hosting, automatic vendor retry, or default live delivery claim.
- `verify:phase156` locks source-revalidated host-action readiness after accepted source-revalidation result preflight: the deterministic manual reinvoke descriptor binds result/action/acknowledgement/checklist/work-item/source/target truth while rejecting stale approvals, tampering, raw-ref/target/signature/credential/URL/path/ledger leakage, and any source resolution, host execution, persistence, retry worker, public hosting, automatic vendor retry, or default live delivery claim.
- `verify:phase157` locks credential-readiness handoff truth after accepted source-revalidated host-action readiness: the descriptor binds the completed action/result/work-item/source/target truth, names only host-owned source-access and channel-send credential labels/responsibilities, and rejects stale approvals, tampering, raw-ref/target/signature/credential-value/URL/path/ledger leakage, source resolution, host execution, credential persistence, retry worker, public hosting, automatic vendor retry, or default live delivery claims.
- `verify:phase158` locks labels-only credential acknowledgement preflight after accepted credential readiness: the preflight sanitizes supplied host acknowledgements and compares them against freshly recomputed readiness truth, accepts only source/vendor credential labels that match, and rejects stale approvals, malformed/tampered acknowledgements, missing label acknowledgement, credential values, raw refs, raw targets, signatures, URLs, paths, ledgers, source resolution, host execution, credential persistence, retry workers, public hosting, automatic vendor retry, or default live delivery claims.
- `verify:phase159` locks credential-acknowledged manual reinvoke host-action descriptors after accepted labels-only credential acknowledgement preflight: the descriptor binds acknowledgement/readiness/action/result truth with sanitized deterministic ids and rejects stale approvals, invalid/value-bearing acknowledgement claims, raw refs, raw targets, signatures, URLs, paths, ledgers, source resolution, host execution, credential persistence, retry workers, public hosting, automatic vendor retry, or default live delivery claims.
- `verify:phase160` locks credential-acknowledged host-action preflights before manual reinvoke trust: supplied descriptors are sanitized and compared with freshly recomputed acknowledgement-bound truth, preserving vendor-state gates while rejecting tampering, stale approvals, execution claims, credential values, persistence, retry workers, public hosting, automatic vendor retry, or default live delivery claims.
- `verify:phase161` locks credential-acknowledged manual reinvoke request descriptors after accepted host-action preflight: requests bind recomputed action/source/target/credential-label truth, preserve vendor-state gates, reject stale/tampered preflight inputs, and still create no execution, source resolution, persistence, credentials, retry workers, public hosting, automatic vendor retry, or default live delivery.
- `verify:phase162` locks credential-acknowledged manual reinvoke request preflights before later host trust: supplied request descriptors are sanitized and compared with freshly recomputed request truth, preserving vendor-state gates while rejecting tampering, stale approvals, execution claims, credential values, persistence, retry workers, public hosting, automatic vendor retry, or default live delivery claims.
- `verify:phase164` through `verify:phase225` lock the credential-acknowledged manual reinvoke and retry-control closeout chain: the shipped path now reaches trusted closeout-preflight-bound retry-ledger entry worker execution-receipt closeout record-plan truth after append-only redacted retry-ledger entry persistence, supplied-entry preflight, preflight-bound readiness planning, supplied readiness-plan preflight, readiness-plan-preflight-bound operator handoff, supplied operator-handoff preflight, worker-selection intent, handler-readiness, invocation-handoff, invocation-handoff preflight, worker execution-plan descriptor creation, supplied execution-plan preflight, trusted foreground worker execution, deterministic redacted non-persistent retry-ledger entry worker execution receipts, trusted supplied execution-receipt preflights, receipt-preflight-bound closeout readiness, and supplied closeout preflight. Phase225 consumes only trusted supplied Phase224 closeout preflights, recomputes current closeout-preflight truth from trusted Phase223 closeout, Phase222 preflight, Phase221 receipt, and Phase220 execution truth, and rejects JSON-copied, tampered, missing, contaminated, or nested-mutation attempts without echoing untrusted bodies. The chain still rejects tampering, copied or forged persistence records/preflight output/plans/handoffs/selections/readiness descriptors/invocation-handoffs/execution plans/execution-plan preflights/executions/execution receipts/receipt preflights/receipt-preflight closeouts/supplied closeout preflights/closeout record plans, credential values, receipt or credential persistence, retry worker scheduling, public hosting, default live delivery, background retries, closeout persistence, durable closeout records, and automatic vendor retry unless a later explicitly verified slice ships that boundary.
- `verify:phase149` locks manual retry replay source revalidation planning for external media transfer: accepted source-stage and vendor-stage replay host actions can produce a fingerprint-only host/operator source revalidation plan with one fresh-resolution step per source fingerprint and vendor-state-check truth for vendor-stage retries, while stale approvals, tampered work items, and current truth mismatches produce no plan. The plan does not resolve sources, fetch/download/upload/preview files, persist revalidation or work items, create retry ledgers, durable retry audit records, retry workers, schedules, public hosting, credential persistence, automatic vendor retry, or default live delivery, and it carries no raw refs, raw target identifiers, approval signatures, credentials, URLs, or file bytes.
- `verify:phase148` locks manual retry replay host-action handoff for external media transfer: accepted source-stage and vendor-stage replay preflights can produce a credential-free host-owned manual reinvoke descriptor with transfer key, bounded source fingerprints, target fingerprint, correlation truth, and vendor-state-check truth, while stale approvals, tampered work items, and current truth mismatches produce no host action. The handoff does not execute a host handler, persist a work item, create retry ledgers, durable retry audit records, retry workers, schedules, public hosting, credential persistence, automatic vendor retry, or default live delivery, and it carries no raw refs, raw target identifiers, approval signatures, credentials, URLs, or file bytes.
- `verify:phase147` locks manual retry work-item replay preflight for external media transfer: a supplied work item is checked against a fresh approval-bound candidate by recomputing transfer key, source fingerprints, target fingerprint, and work-item correlation id; source-stage and vendor-stage preflights preserve fresh approval/source revalidation truth, vendor-stage requires vendor-state checks, stale approvals and source/target/tamper mismatches fail closed, and no host handler, retry worker, schedule, ledger, durable audit record, public hosting, credential persistence, or default live delivery is created. `verify:phase146` locks deterministic manual retry work-item correlation for retryable external media transfer failures: source-stage, vendor-stage, and generic host-handler work items carry a digest id derived from approved transfer key, retry stage, source fingerprints, and target fingerprint; same source work items stay stable across wait-hint changes, stage/target changes produce different ids, host-forged correlation/persistence/ledger claims are ignored and redacted, and no retry ledger or durable retry audit record is created. `verify:phase145` locks the bounded manual retry work-item descriptor for retryable external media transfer failures: source-stage, vendor-stage, and generic host-handler failures carry a recomputed operator-foreground-reinvoke work item from approved transfer truth, sanitized retry stage, source fingerprints, target fingerprint, and bounded wait hints; success/non-retryable paths emit no work item, and host-forged worker/schedule/credential/live-delivery/public-hosting claims plus raw refs, target ids, approval signatures, credentials, URLs, and bytes are redacted or ignored. `verify:phase144` locks request-only vendor-send target context for the opt-in external media transfer worker: host senders receive bounded target kind, deterministic approval-bound target fingerprint, request-only truth, and raw-target non-persistence truth; the sender request does not duplicate raw workspace/account/target/thread identifiers, durable success/failure data does not copy the target context, host-forged request-target fields in reasons are redacted, and source-stage failures create no sender request. `verify:phase143` locks manual retry target-correlation handoff truth for retryable external media transfer failures: source-stage and vendor-stage retryable failures carry a deterministic target fingerprint plus bounded target kind derived from the approval-bound action, same targets produce stable fingerprints, different targets produce different fingerprints, host-forged target claims are ignored, raw workspace/account/target/thread ids are not persisted, and success/non-retryable paths carry no retry target-correlation metadata. `verify:phase142` locks manual retry approval replay handoff truth for retryable external media transfer failures: source-stage and vendor-stage retryable failures require a fresh operator approval signature, previous approval signatures are not persisted or reusable for manual reinvoke, host-forged approval replay claims are ignored, and success/non-retryable paths carry no retry approval replay metadata. `verify:phase141` locks deterministic manual retry backoff correlation handoff for retryable external media transfer failures: transfer-key-bound correlation ids are derived from bounded retry-after state, host-forged correlation/timer/schedule/persistence claims are ignored, and no timer, schedule, automatic retry, durable audit record, raw refs, credentials, URLs, bytes, or request-only context is created. `verify:phase140` locks manual retry backoff hints for retryable external media transfer failures: bounded Retry-After truth becomes operator-only recommended wait metadata, generic retryable host rejections without Retry-After make no wait-time claim, and no retry worker, schedule, automatic retry, or durable backoff persistence is created. `verify:phase139` locks durable manual retry source-ref fingerprint handoff for retryable external media transfer failures: source-resolution, vendor-send, and generic retryable host rejections carry bounded approved source-ref fingerprints plus revalidation flags derived from the approval-bound host action, without persisting raw refs, content hashes, request-only context, credentials, URLs, file bytes, or host-injected fingerprint claims. `verify:phase138` locks sanitized stage-derived next operator actions for retryable external media transfer failures: source-resolution retries instruct source-ref revalidation before any vendor send and state that no vendor-state check is required, while vendor-send retries instruct vendor-state verification before reinvoke and only then fresh source-ref revalidation. Host-supplied action text is ignored and recomputed from the allowlisted retry stage; generic retryable host rejections without stage safety keep only the generic next operator action. `verify:phase137` locks sanitized stage-derived manual retry reason codes for retryable external media transfer failures: source-resolution retries use `source_resolution_retryable_failure`, vendor-send retries use `vendor_send_retryable_failure`, host-supplied reason-code claims are ignored and recomputed from the allowlisted retry stage, and generic retryable host rejections without stage safety keep only the generic retry reason. `verify:phase136` locks stage-specific manual retry verification scope for retryable external media transfer failures: source-resolution retries name source-ref revalidation before vendor send and do not require vendor-state checks, while vendor-send retries require vendor-state verification before fresh source-ref revalidation; host-supplied scope claims are recomputed from the allowlisted retry stage. `verify:phase135` locks durable manual retry revalidation handoff truth for retryable external media transfer failures: retryable host rejections, source timeouts, and vendor timeouts require a fresh approval check, source-ref revalidation, fresh source resolution, and no stale resolved-file reuse before operator reinvoke while preserving manual-only retry behavior. `verify:phase134` locks sanitized manual retry safety context for external media transfer failures: retryable source-resolution failures state that source resolution did not complete and no vendor send was attempted, while retryable vendor-send failures/timeouts state that source resolution completed, a vendor send may have happened, the operator must verify vendor state before reinvoking, and automatic vendor retry remains forbidden. `verify:phase133` locks request-only vendor-send attempt context for the opt-in external media transfer worker: every foreground host sender call receives transfer key, channel id, resolved-file count, single-attempt cap, retry-attempt zero truth, no-automatic-retry policy, and timeout enablement truth, while timeout-configured sends still receive a cooperative abort signal; this volatile context is not copied into durable result data and vendor-send rejection/timeout remains manual-only. `verify:phase132` locks sanitized per-file source retry outcome metadata for the opt-in external media transfer worker and host-reported foreground retry metadata: retried files can report safe source-ref fingerprints, bounded file indexes, recovered/exhausted status, per-file retry counts, last failure kind, and bounded retry-after seconds without copying raw refs, free-form reasons, URLs, credentials, bytes, approval signatures, or request-only previous-failure fields into durable result data.
- `verify:phase131` locks request-only previous source-failure context for the opt-in external media transfer worker resolver: retry requests carry previous failure kind, retryable truth, and bounded retry-after seconds, reset per file, use fresh timeout abort signals, and do not copy raw reasons or volatile previous-failure fields into durable result data.
- `verify:phase130` locks request-only source attempt context for the opt-in external media transfer worker resolver: each source-resolution request carries one-based attempt number, per-file max-attempt cap, retry-attempt count, and retry truth, resets per file, and is not copied into durable result data.
- `verify:phase129` locks sanitized foreground source-retry metadata for external media transfer host results: recovered/exhausted source retries are copied only as bounded host-reported retry metadata, free-form reasons and unsafe handler fields are dropped, vendor failures after source recovery remain manual-only, and no retry worker/schedule, default live delivery, public hosting, credential persistence, raw refs, URLs, bytes, or approval signatures are created or persisted.
- `verify:phase128` locks opt-in source-resolution foreground retry for the external media transfer worker: retryable host source failures and source timeouts can retry once before vendor send with fresh abort signals, exhaustion surfaces existing manual retry metadata, non-retryable/validation/vendor-send failures are not retried, and no retry worker/schedule, default live delivery, public hosting, credential persistence, or Colony-owned file transfer is created.
- `verify:phase127` locks opt-in vendor-send timeout handling for the external media transfer worker: configured host vendor send receives a cooperative abort signal after source resolution, timeout failures surface existing manual retry metadata, late sender success/receipt metadata is not copied, and no retry worker/schedule, default live delivery, public hosting, credential persistence, or Colony-owned file transfer is created.
- `verify:phase126` locks external subscription credential setup readiness UX: Slack and Discord setup plans expose redacted required credential-ref labels, present/missing/invalid ref status, host-supplied runtime secret/config responsibilities, and host-only handoff checklist rendering without raw refs, tokens, callback URLs, credential persistence, public hosting, or default live delivery claims.
- `verify:phase125` locks opt-in source-resolution timeout handling for the external media transfer worker: configured source resolution receives a cooperative abort signal, timeout failures reject before vendor send, surface existing manual retry metadata, and create no retry worker/schedule, default live delivery, public hosting, credential persistence, or Colony-owned file transfer. `verify:phase124` locks the opt-in external media transfer host worker factory: it is inert unless explicitly supplied as the media transfer handler, requires injected source resolution and vendor send capabilities, gives resolvers only safe refs plus fingerprints, passes senders resolved file descriptors without raw source refs, rejects oversized files, checksum mismatches, and forbidden resolver payloads, preserves existing transfer-key integrity, keeps retry UX manual-only, and creates no default live delivery, public hosting, credential persistence, or retry worker. `verify:phase123` locks host-reported external media transfer success receipt metadata: receipts are copied only after transfer-key-bound success, receipt ids/status/counts are bounded and redacted, receipt URLs are not persisted, rejected or transfer-key-mismatched results do not preserve receipts, and receipt truth explicitly does not claim Colony-verified delivery or file inspection. `verify:phase122` locks manual operator retry UX for explicit retryable host-owned external media transfer rejections: retryable host results expose bounded manual reinvoke metadata, clamp retry-after seconds, create no retry worker or schedule, perform no automatic second attempt, and preserve non-retryable unclassified handler exceptions plus transfer-key mismatch integrity failures. `verify:phase121` locks transfer-key-bound external media transfer host results: accepted host handler results must echo the current transfer key before success is reported; missing or wrong echoes fail closed without a success claim or copied vendor message id; rejected handlers remain ordinary rejections; and unsafe vendor message ids are redacted as a whole after a matching echo. `verify:phase120` locks stable external media transfer handoff keys and source-ref fingerprints for host idempotency/audit: keys are domain-separated, deterministic, bind the full normalized approval candidate including files beyond the five-file host-action cap, and do not replace exact approval signatures or claim Colony-verified content/checksum truth. `verify:phase119` locks approval-bound external media transfer handoff: exact signatures bind safe host-owned media refs and bounded metadata, unsafe URLs/paths/inline bytes/private fields fail closed, stale approvals invalidate before handler execution, missing/ambiguous host inputs reject, and successful host actions still do not claim default live delivery, public hosting, credential persistence, adapter attachment delivery, retry workers, or vendor upload/download. `verify:phase118` locks inbound-only Slack media metadata inspection: signed and host-authenticated Slack `file_share` callbacks enter the existing deferred ACK/session bridge path with fallback text and bounded, redacted file metadata; Slack `app_mention` callbacks with files preserve the same safe metadata; and non-file message subtypes still fail closed. It performs no file fetch/download/upload, no preview rendering, persists no private file URLs, starts no listener, creates no public hosting, runs no retry worker, and enables no default live inbound delivery. `verify:phase117` locks a redacted durable approved Slack event binding gate before bridge dispatch: approved host-owned Slack setup can append binding records with workspace/event/callback-fingerprint/signing-ref-redaction/approval-fingerprint truth, matching Slack callbacks can proceed, mismatched workspace/event callbacks fail closed before route creation, malformed journals fail closed, and no raw tokens, signing secrets, manifests, callback URLs, approval signatures, or event bodies are persisted. `verify:phase116` locks duplicate Slack event retry dedupe at the channel session bridge route boundary: repeated signed and host-authenticated Slack `message` or `app_mention` callbacks with the same normalized inbound message id receive a bounded 202 duplicate ACK, do not increment route message count, do not dispatch the session runner again, and do not send a second adapter reply, without credential, listener, public-hosting, upload, retry-worker, persistence, or default-live-delivery claims. `verify:phase115` locks Slack `app_mention` as an approval-bound alternative Events API subscription and inbound event shape: mention-only setup requires `app_mentions:read`, keeps mixed Slack event subscriptions rejected, patches only `app_mention` bot events, and signed plus host-authenticated mention callbacks use the existing deferred ACK bridge path without credential, listener, public-hosting, upload, retry-worker, or default-live-delivery claims. `verify:phase114` locks Slack `event_callback` deferred ACK: signed and host-authenticated Slack message events are accepted into the existing channel/session bridge and return 202 before runner/reply completion, no adapter reply is emitted before ACK, asynchronous replies still preserve Slack thread routing, and signature/auth failures plus `url_verification` remain fail-closed or handshake-only without credential, listener, public-hosting, upload, retry-worker, or default-live-delivery claims. `verify:phase113` locks Slack subscription activation readiness: approved host-owned Slack setup preflights the full manifest for the required `channels:history` bot scope before fetch, renders scope readiness in `/channels external`, and reports success-only activation-readiness plus remaining operator steps after `apps.manifest.update`, without claiming live delivery, public hosting, credential persistence, listener startup, uploads/media, retry workers, or schedules. Earlier Phase 92-112 channel checks continue to lock explicit approval gates, host-owned vendor setup/execution, signed Slack/Discord handshakes, Discord command integrity, retry metadata, and no default live inbound delivery.
- `verify:phase104` locks host-owned Discord Interactions endpoint mutation execution: approved private candidates with an approval-bound bot token perform one injected Discord Edit Current Application `PATCH /applications/@me` call with body `{ interactions_endpoint_url }`, verify returned application id and endpoint URL, fail closed on missing/ambiguous/pending/mutated host inputs and malformed/oversized/API responses, classify retryability without retry workers, redact token/API failures, and still do not create Discord apps, register slash commands, persist credentials, start listeners, provide public hosting, upload media, enable privileged Gateway intents, mutate Slack setup, or enable default live inbound delivery.
- `verify:phase103` covers Discord Interactions PING/PONG readiness: signed Discord `type: 1` interactions require injected vendor signature verification, return only `{ "type": 1 }`, bypass Colony host auth and session-bridge dispatch only for that handshake, fail closed on missing/rejected verifier and malformed JSON, do not special-case application commands or non-Discord type-1 bodies, and do not register endpoints, create slash commands, persist credentials, start listeners, provide hosting, run retries, enable Gateway intents, handle non-PING mutations or enable default live inbound delivery.
- `verify:phase102` covers Slack subscription direct mutation host execution: approved private candidates, host-supplied app-configuration token and full manifest, one injected Slack `apps.manifest.update` call, manifest event-subscription patching, fail-closed host inputs/API failures, redaction, retryable classification, and no Slack app creation, credential persistence, listener startup, public hosting, uploads, retry worker, Discord-side setup, or default live inbound delivery.
- `verify:phase101` covers Discord Interactions setup gating: exact approval-bound planning for Discord application/guild/callback/public-key-ref/enabled intent/`PING` and `APPLICATION_COMMAND`, credential-free `/channels external subscribe discord <approval-signature>` host actions, fail-closed unsafe URL/event/ref/id validation, executor host-handler integration, and no Discord app creation, direct interaction endpoint registration, slash-command registration, credential persistence, listener startup, public hosting, uploads, retries, privileged Gateway intents, or default live inbound delivery.
- `verify:phase100` covers Slack subscription setup gating: exact approval-bound planning for Slack app/workspace/callback/signing-secret-ref/enabled intent/`message.channels`, credential-free `/channels external subscribe slack <approval-signature>` host actions, fail-closed unsafe URL/event/ref validation, executor host-handler integration, and no Slack app creation, direct subscription registration, credential persistence, listener startup, public hosting, uploads, retries, direct Discord API/app/endpoint setup, or default live inbound delivery.
- `verify:phase99` covers Slack URL verification challenge handling: signed Slack `url_verification` requests are accepted only after vendor signature verification, return only the challenge, bypass Colony host auth and session bridge dispatch only for that handshake, fail closed for missing/rejected verifier or malformed challenge, do not special-case non-Slack channels, and preserve host-auth/bridge requirements for normal Slack `event_callback` delivery.
- `verify:phase98` covers Telegram-only host-owned webhook setup: exact approval signatures bind bot token, secret token, webhook URL, API base, allowed updates, and enabled intent; `/channels external webhook telegram <approval-signature>` emits a credential-free host action; the host executor performs one injected Telegram `setWebhook` call; Telegram API failures fail closed with bounded redacted diagnostics; and `ChannelAuthPolicy` accepts `X-Telegram-Bot-Api-Secret-Token` as host auth proof while still not starting listeners, registering adapters, mutating auth policy, persisting credentials, uploading media, running retries, providing public hosting, or implementing Slack setup or direct Discord API/app/endpoint setup.
- `verify:phase97` covers host-owned external vendor webhook transport: Slack/Discord/Telegram-shaped HTTP webhooks require an injected signature verifier, host auth proof, host auth policy, and session bridge before dispatch; malformed JSON, missing verifier, rejected signatures, and missing host auth proof fail closed with redacted bounded responses; the local listener is host-owned and does not register vendor webhooks/subscriptions, configure credentials, upload media, or start retry workers.
- `verify:phase96` covers host-owned external vendor event dispatch: Slack/Discord/Telegram text events normalize into the generic channel envelope, require an injected bridge plus host auth policy, preserve Slack threads, Discord threads, and Telegram topics, report runner failure status without treating it as normalization failure, redact raw text/tokens/secrets, and the dispatcher performs no listener startup, subscription setup, credential setup, adapter registration, webhook registration, upload, retry worker, or direct vendor API call; reply delivery remains delegated to the injected bridge/registry.
- `verify:phase95` covers host-owned execution of accepted external registration actions: a host-supplied registry plus private approved candidate can register Slack/Discord/Telegram adapters, missing/duplicate/pending/unsafe/already-registered host inputs fail closed, credentials/exact signatures stay out of gateway output and action data, and execution performs no vendor API call, listener startup, or subscription setup.
- `verify:phase94` covers the `/channels external register <channel> <approval-signature>` host-action boundary: only accepted external adapter plans with matching exact approval signatures emit credential-free `register_external_channel_adapter` actions, pending/wrong/unknown requests fail closed, output redacts exact signatures, and the gateway still performs no adapter registration, credential enabling, listener startup, or vendor API calls.
- `verify:phase32` covers deterministic channel route keys, in-memory channel adapter delivery, fail-closed missing/disabled channel delivery, and `/channels` operator visibility.
- `verify:phase33` covers channel webhook secret auth, pairing-gated inbound authorization, normalized inbound webhook envelopes, and `/channels auth` redacted visibility.
- `verify:phase34` covers HTTP channel webhook request validation, authenticated inbound delivery callbacks, and a real local Bun listener smoke path.
- `verify:phase35` covers channel inbound route-to-session mapping, reply delivery through `ChannelRegistry`, route isolation, and inspectable failure paths.
- `verify:phase36` covers `/channels sessions` operator visibility for channel session bridge routes, recent turns, empty state truth, and secret non-leakage.
- `verify:phase88` covers contract-only Slack/Discord/Telegram-style channel fixtures, route-key previews, threading/mention/reaction/attachment/retry/auth/redaction semantics, fail-closed malformed or secret-bearing fixtures, proof that fixtures do not register send adapters, and `/channels contracts` operator visibility without claiming real vendor delivery.
- `verify:phase37` covers `/channels` help truth in both `formatHelp()` and parser-backed `/help` output.
- `verify:phase38` covers `/permissions` help truth for active schemas, allowed/denied tools, and exact-call session rules.
- `verify:phase39` covers `/provider` help truth for switching, health, failovers, performance, and current-provider views.
- `verify:phase40` covers `/skills` help truth for search, inspect, trust metadata, and approval metadata.
- `verify:phase41` covers `/doctor` help truth for diagnostics, first-run, workspace, providers, and failovers.
- `verify:phase42` covers `/workspace` help truth for packages, dev/verify commands, stack hints, and workspace globs.
- `verify:phase43` covers `/hooks` help truth for registered hooks, recent events, performance, and supported kinds.
- `verify:phase44` covers `/events` help truth for recent events, failures, tools, hooks, compactions, failovers, and performance.
- `verify:phase45` covers `/perf` help truth for runtime, models, providers, tools, hooks, and compactions.
- `verify:phase46` covers `/tools` help truth for active tools, approvals, recent activity, artifacts, performance, policy links, and exact-call rules.
- `verify:phase47` covers `/cost` help truth for summary, models, budget, performance, and drill-down views.
- `verify:phase48` covers `/budget` help truth for current cost/token caps, inspect paths, and set syntax.
- `verify:phase49` covers `/model` help truth for selected provider/model state, current-provider model setting, and next-run provider/model switching.
- `verify:phase50` covers `/status` help truth for session, runtime, saved, workspace, tools, workflow, operator, and drill-down status surfaces.
- `verify:phase51` covers `/artifact` help truth for persisted large tool-output catalogs, exact artifact reopen, latest artifact shortcuts, and Colony storage boundaries.
- `verify:phase52` covers `/compact` help truth for the full compaction strategy family, smart selection, status/recent/handoff views, pressure, and failure visibility.
- `verify:phase53` covers skill catalog audits for alias/rename detection, metadata/body gaps, developer-only/product-candidate/unsupported classification, and `/skills audit` visibility.
- `verify:phase54` covers skill source metadata loading and audit drift for missing source data, stale revisions, source mismatches, and `/skills audit` source-drift rendering.
- `verify:phase55` covers the safe skill import/update planner for dry-run import/update/keep/review actions and `/skills plan` approval-boundary rendering.
- `verify:phase56` covers explicit-approval skill import staging into quarantine, no-write behavior when approval is absent, live-catalog isolation, body-free staging manifests, and staged audit gates.
- `verify:phase57` covers staged skill promotion after a second explicit approval, source/audit drift rejection, live catalog writes, rollback-file preservation, and body-free promotion manifests.
- `verify:phase58` covers staged skill operator views for preview, audit, approval, promotion result rendering, and rollback evidence without exposing skill body text.
- `verify:phase59` covers approved staged-skill rollback execution, missing-evidence rejection, live-copy restoration, and body-free rollback metadata.
- `verify:phase60` covers `/skills staged rollback <name> --approved` host-result rendering, fail-closed missing-result behavior, and body-safe rollback status output.
- `verify:phase61` covers body-safe staged skill lifecycle event projection and `/skills staged history <name>` inspection for stage/promote/rollback status.

Current baseline:

- `DaemonControlPlaneHost` exposes serializable `describe`, `create_session`, `list_sessions`, `inspect_session`, `close_session`, and `workflow` command envelopes.
- daemon session snapshots expose lifecycle/usage metadata without embedding transcript history.
- workflow commands can delegate to `WorkflowAutomationController`.
- HTTP listener/client transport exists with optional bearer-token enforcement.
- typed client helpers exist for remote session create/list/inspect/close and workflow list/start/inspect/approve.
- scoped daemon bearer-token auth exists through `DaemonAuthPolicy`, command-specific HTTP scope checks, a dedicated `web.read` scope, and redacted `/daemon` status/auth/sessions views.
- `ChannelRegistry`, `InMemoryChannelAdapter`, and deterministic channel route keys provide the first channel delivery skeleton without external credentials or network dependencies.
- `/channels` and `/channels deliveries` expose configured channel adapters and recent delivery records to operators.
- `ChannelAuthPolicy`, `ChannelPairingStore`, and `normalizeChannelInboundWebhook` provide redacted webhook secret checks, pairing-gated sender authorization, and deterministic inbound route envelopes.
- `/channels auth` exposes channel auth policy and pairing counts without leaking webhook secrets or pairing codes.
- `handleChannelWebhookRequest` and `ChannelWebhookHttpServer` provide the first production-style channel webhook transport for normalized inbound delivery.
- `ChannelSessionBridge` maps normalized inbound channel routes to stable session ids and sends runner replies back through the registered channel adapter.
- `/channels sessions` exposes channel session route and turn truth to operators without exposing inbound metadata secrets.
- `/channels contracts` exposes contract-only Slack/Discord/Telegram-style adapter semantics without registering real vendor adapters or enabling vendor network delivery; separate outbound adapter classes now exist for explicit future registration/config work.
- `/channels external` exposes redacted external-adapter registration/config gate state and vendor event-normalization helper truth. `/channels external register <channel> <approval-signature>` can emit a credential-free host-mediated registration action for an already accepted plan, and host-owned execution can register that adapter against a supplied registry/private candidate set; the gateway still does not own credentials, subscribe to vendor events, upload media, retry delivery, or claim live inbound vendor delivery.
- `/help` now describes the full shipped `/channels` surface: adapters, deliveries, auth, sessions, contract-only fixtures, and external vendor helper state.
- `/help` now describes the full shipped `/permissions` surface: active schemas, allowed/denied tools, and session rules.
- `/help` now describes the full shipped `/provider` surface: switching, summary/health/failovers/performance/current views.
- `/help` now describes the full shipped `/skills` surface: catalog search/inspect plus trust and approval metadata.
- `/help` now describes the full shipped `/doctor` surface: diagnostics, first-run, workspace, providers, and failover views.
- `/help` now describes the full shipped `/workspace` surface: package views, dev/verify commands, stack hints, and workspace globs.
- `/help` now describes the full shipped `/hooks` surface: registered hooks, recent events, performance, and supported hook kinds.
- `/help` now describes the full shipped `/events` surface: recent events, failures, tool/hook/compaction/failover filters, and performance.
- `/help` now describes the full shipped `/perf` surface: runtime, model, provider, tool, hook, and compaction performance drill-downs.
- `/help` now describes the full shipped `/tools` surface: active schemas, approvals, recent activity, artifacts, performance, policy links, and exact-call rules.
- `/help` now describes the full shipped `/cost` surface: summary, model usage, budget detail, performance, and drill-down views.
- `/help` now describes the full shipped `/budget` surface: current cost/token caps, budget status inspection, spend inspection, and USD cap setting.
- `/help` now describes the full shipped `/model` surface: selected provider/model state, current-provider model setting, and next-run provider/model switching.
- `/help` now describes the full shipped `/status` surface: session, runtime, saved sessions, workspace, tools, workflow, operator next-actions, and drill-down views.
- `/help` now describes the full shipped `/artifact` surface: persisted large tool-output catalog listing, exact artifact reopen, latest artifact shortcut, and Colony storage boundary.
- `/help` now describes the full shipped `/compact` surface: standard/micro/reactive/session_memory/cached_micro/context_collapse strategies, smart selection, status/recent/handoff views, pressure, and failure visibility.
- `/skills audit` now exposes loaded skill counts, alias/rename drift, metadata/body gaps, and developer-only/product-candidate/unsupported classification without exposing skill body text.
- `/skills audit` now also exposes missing source metadata, stale source revisions, source mismatches, and loaded-vs-expected revision deltas without exposing skill body text.
- `/skills plan` now proposes dry-run skill import/update/keep/review actions from reviewed source metadata and states that explicit approval is required before any file write.
- `stageSkillImportCandidate()` now writes approved skill candidates only into a quarantine/staging root with a body-free manifest; unapproved candidates and source mismatches fail closed without touching staging or live catalog roots.
- `promoteStagedSkillCandidate()` now promotes staged skill candidates into the live catalog only after a second explicit approval and passing audit gate, writing rollback evidence and body-free promotion metadata.
- `/skills staged` now exposes body-safe operator views for staged skill list, preview, audit, second-approval guidance, promotion status, and rollback evidence.
- `rollbackPromotedSkillCandidate()` now restores preserved rollback evidence into the live skill catalog only after explicit approval and records body-free rollback metadata.
- `/skills staged rollback <name> --approved` now renders host-supplied rollback executor results or fails closed when the host has not supplied a result.
- `handleWebControlRequest` and `serializeWebControlState` provide a dependency-free web shell foundation over projected daemon/workflow/swarm/channel status state; auth fails closed without `web.read`, and local action handoff requires opt-in mutation settings, local host binding, `web.mutate`, and explicit approval.
- `verify:phase231` covers the local web-control operator UX: local-only shell/state/action routing, provider/workflow/swarm/channel status rendering, mutation-enabled local action controls, deterministic missing-scope/public-host rejection, explicit approval requirement, no direct mutation execution, no public hosting, and no secret/body echo.
- `createGitHubIssueIntakePlan`, `createGitHubPrHandoffWorkflow`, `summarizeGitHubPrHandoffPlan`, `createGitHubLocalWorkspaceActionPlan`, `executeApprovedGitHubLocalWorkspaceAction`, `createGitHubVerificationToPrHandoff`, `createGitHubVerificationToPrHandoffWorkflowHandler`, and the `github_pr_handoff` workflow template provide a local-first provided issue intake/branch/worktree/verification/PR-handoff flow; approved local branch/worktree creation can execute through an injected local git executor with bounded worktree paths and redacted receipts, verified runs can produce a redacted PR handoff artifact, and the runtime still does not fetch GitHub, push, or create remote PRs by default.
- `verify:phase227` covers Launch Alpha 0 claim docs, GitHub local workspace action guardrails, and web-control mutation handoff guardrails.
- `verify:phase228` covers deterministic provided GitHub issue-reference/URL intake, fail-closed incomplete-coordinate rejection, approval-gated local branch/worktree action planning from intake, and verification-before-PR workflow ordering.
- `verify:phase229` covers approved local GitHub branch/worktree execution through an injected git executor, exact approval enforcement, branch tamper rejection, worktree path escape rejection, command-failure receipts, redaction, and stop-after-failure mutation ordering.
- `verify:phase230` covers verified local GitHub execution to PR handoff artifact generation, missing/failed verification rejection, failed execution rejection, redaction, workflow artifact attachment, and no push/PR remote mutation by default.
- `verify:phase232` covers real-session memory/MemPalace recall QA across exact transcript truth, derived ownership and decision facts, palace issue/path routing, procedure routing, bounded query hashes, body-safe diagnostics, section ordering, and exact-only count accounting.
- `verify:phase233` covers the first Beta 1 swarm production-hardening slice: stage timeline data/rendering, redacted artifact review rendering, injected failure coverage, retry-history preservation, cancellation preservation, interrupted-stage resume history, persisted approval-wait preservation, and restart-safe resume boundaries.
- `verify:phase234` covers the first Beta 2 MCP/plugin execution-fabric slice: approved plugin package install/update receipts through an injected executor, package-path confinement, lifecycle-script blocking, redacted execution previews, stop-after-failure ordering, and no live activation, registry fetch, sidecar start, or credential persistence.
- `verify:phase235` covers the second Beta 2 MCP/plugin execution-fabric slice: supplied registry metadata checksum/signature enrichment, mismatch rejection before trusted sidecar signatures, raw signature redaction, compatibility without metadata, and no live registry fetch, activation, sidecar start, package execution, or credential persistence.
- `verify:phase236` covers the third Beta 2 MCP/plugin execution-fabric slice: approved package-driven sidecar activation through an injected supervisor after exact approval and a matching completed install/update receipt, with failed-supervisor receipt truth and redaction while still performing no live registry fetch, default activation, package lifecycle execution, transport creation, or credential persistence.
- `verify:phase237` covers the fourth Beta 2 MCP/plugin execution-fabric slice: approval-gated host/network handoff for future registry metadata fetch, exact signatures, HTTPS/no-credential/no-local URL validation, redaction, and no Colony-owned network execution, package execution, activation, catalog mutation, or credential persistence.
- `verify:phase238` covers the fifth Beta 2 MCP/plugin execution-fabric slice: exact-approval injected host-executor registry metadata fetch receipts with HTTP/content-type/size/JSON/package identity validation, redaction, and no built-in Colony registry client, default marketplace fetch, package execution, activation, catalog mutation, or credential persistence.
- `verify:phase239` covers the sixth Beta 2 MCP/plugin execution-fabric slice: exact-approval package-code execution policy preflights that require matching completed install/update receipts, reject lifecycle/shell/path/signature/receipt tampering, and perform no package-code execution.
- `verify:phase240` covers the seventh Beta 2 MCP/plugin execution-fabric slice: approved host-executed package-code receipts through an injected executor after a ready preflight, with bounded redacted output, exact approval, path confinement, and no registry fetch, activation, catalog mutation, or credential persistence.
- `verify:phase241` covers the eighth Beta 2 MCP/plugin execution-fabric slice: a read-only built-in plugin marketplace view over bundled descriptors with safe plan summaries, redacted sources, query hashing, unsafe descriptor rejection, and no registry fetch, package install, package execution, sidecar activation, catalog mutation, or credential persistence.
- `verify:phase242` covers the ninth Beta 2 MCP/plugin execution-fabric slice: read-only plugin marketplace activation readiness over bundled descriptors with review/install-receipt/approval/operator-handoff states, receipt/approval summaries, active-state inspection, redaction, and no registry fetch, package install, package execution, sidecar activation, catalog mutation, or credential persistence.
- `verify:phase243` covers the tenth Beta 2 MCP/plugin execution-fabric slice: redacted marketplace activation handoff descriptors from ready activation-readiness entries, exact approval-signature binding, injected-supervisor path naming, duplicate-active blocking, selector redaction, and no registry fetch, package install, package execution, sidecar activation, catalog mutation, or credential persistence.
- `verify:phase244` covers the eleventh Beta 2 MCP/plugin execution-fabric slice: approved marketplace activation handoff execution receipts from ready handoffs, exact action/install-receipt/approval matching, delegated injected-supervisor activation, blocked/tampered handoff rejection before supervisor calls, failed-supervisor receipt truth, redaction, and no registry fetch, package install, package-code execution, catalog mutation, or credential persistence.
- `verify:phase245` covers the twelfth Beta 2 MCP/plugin execution-fabric slice: read-only marketplace activation execution status projection from readiness entries, approved handoff-execution receipts, and active sidecar signatures, including completed/failed/blocked/active/not-executed states, receipt mismatch rejection, redaction, and no registry fetch, package install, package-code execution, sidecar start, catalog mutation, or credential persistence.
- `verify:phase246` covers the thirteenth Beta 2 MCP/plugin execution-fabric slice: redacted marketplace install/update handoff descriptors for bundled import/update entries, exact approval-signature binding, package-path and lifecycle-command blocking, injected executor path naming, redaction, and no registry fetch, package install, package-code execution, sidecar activation, sidecar start, catalog mutation, or credential persistence.
- `verify:phase247` covers the fourteenth Beta 2 MCP/plugin execution-fabric slice: read-only marketplace install/update execution status projection over handoff descriptors and supplied install/update receipts, deterministic completed/failed/blocked/not-executed states, receipt mismatch rejection, redaction, and no registry fetch, package install, package-code execution, sidecar activation, sidecar start, catalog mutation, or credential persistence.
- `verify:phase248` covers the fifteenth Beta 2 MCP/plugin execution-fabric slice: approved marketplace install/update handoff execution receipts from ready handoffs, exact handoff/action/approval matching, delegated injected install/update execution, blocked/tampered handoff rejection before executor calls, failed-executor receipt truth, redaction, and no registry fetch, package-code execution, sidecar activation, sidecar start, catalog mutation, or credential persistence.
- `verify:phase249` covers the sixteenth Beta 2 MCP/plugin execution-fabric slice: marketplace registry metadata fetch handoff descriptors over bundled marketplace entries, exact registry approval binding, generic registry boundary embedding, missing-entry/missing-url/unsafe-url/wrong-approval/rejected-action blocking, redaction, and no built-in network fetch, package install/update, package-code execution, sidecar activation/start, catalog mutation, or credential persistence.
- `verify:phase250` covers the seventeenth Beta 2 MCP/plugin execution-fabric slice: read-only marketplace registry fetch execution status over bundled marketplace entries and supplied registry-fetch receipts, deterministic completed/failed/blocked/not-executed states, receipt mismatch rejection, redaction, and no registry fetch, package install/update, package-code execution, sidecar activation/start, catalog mutation, or credential persistence.
- `verify:phase251` covers the eighteenth Beta 2 MCP/plugin execution-fabric slice: approved marketplace registry fetch handoff execution receipts from ready handoffs, exact handoff/action/approval matching, delegated injected registry-fetch execution, blocked/tampered handoff rejection before executor calls, failed-executor receipt truth, redaction, and no built-in registry client, package install/update, package-code execution, sidecar activation/start, catalog mutation, or credential persistence.
- `verify:phase252` covers the nineteenth Beta 2 MCP/plugin execution-fabric slice: read-only marketplace registry-fetch metadata planning from bundled entries, approved handoffs, supplied registry-fetch receipts, and host-supplied full registry metadata. Completed redacted receipts gate but do not replace full metadata; mismatched supplied metadata is rejected by the existing package planner; and the view performs no registry fetch, package install/update, package-code execution, sidecar activation/start, catalog mutation, or credential persistence.
- `verify:phase253` covers the twentieth Beta 2 MCP/plugin execution-fabric slice: metadata-bound marketplace install/update handoff descriptors from Phase 252 planning. A `metadata_ready` planning entry is required before the existing marketplace install/update handoff can become usable for that bundled entry; missing/rejected metadata, wrong approval, and package-path escapes fail closed; and the wrapper performs no registry fetch, install/update execution, package-code execution, sidecar activation/start, catalog mutation, or credential persistence.
- `verify:phase254` covers the twenty-first Beta 2 MCP/plugin execution-fabric slice: approved metadata-bound marketplace install/update handoff execution receipts. A ready Phase 253 metadata-bound handoff and ready nested install/update handoff are required before delegating to the existing approved marketplace install/update execution helper; blocked/tampered gates fail before executor calls, failed delegated receipts are summarized, and the wrapper performs no registry fetch, package-code execution, sidecar activation/start, catalog mutation, or credential persistence.
- `verify:phase255` covers the twenty-second Beta 2 MCP/plugin execution-fabric slice: read-only metadata-bound marketplace install/update execution status projection over Phase 253 handoffs and Phase 254 receipts, including metadata-blocked/not-executed/blocked/failed/completed states, receipt mismatch rejection, redaction, and no registry fetch, install/update execution, package-code execution, sidecar activation/start, catalog mutation, or credential persistence.
- `verify:phase256` covers the twenty-third Beta 2 MCP/plugin execution-fabric slice: read-only metadata-bound marketplace activation readiness projection over metadata-bound install/update execution status, including metadata-blocked/install-not-executed/install-blocked/install-failed/needs-activation-approval/ready-for-activation-handoff/active states, signature redaction, and no registry fetch, install/update execution, package-code execution, sidecar activation/start, catalog mutation, or credential persistence.
- `verify:phase257` covers the twenty-fourth Beta 2 MCP/plugin execution-fabric slice: redacted metadata-bound marketplace activation handoff descriptors from ready metadata-bound activation-readiness entries, exact activation approval binding, metadata-bound install/gate summary, injected-supervisor handoff path naming, duplicate-active blocking, selector redaction, and no registry fetch, install/update execution, package-code execution, sidecar activation/start, catalog mutation, or credential persistence.
- `verify:phase258` covers the twenty-fifth Beta 2 MCP/plugin execution-fabric slice: approved metadata-bound marketplace activation handoff execution receipts from ready Phase 257 handoffs, exact handoff/action/install-receipt/approval matching, delegated existing marketplace activation execution helper use, blocked/tampered gate rejection before supervisor calls, failed-supervisor receipt truth, redaction, and no registry fetch, install/update execution, package-code execution, catalog mutation, or credential persistence.
- `verify:phase259` covers the twenty-sixth Beta 2 MCP/plugin execution-fabric slice: read-only metadata-bound marketplace activation execution status projection over Phase 256 readiness entries and Phase 258 receipts, including metadata-blocked/activation-not-ready/not-executed/blocked/failed/completed/active states, stale metadata-gate and mismatched-receipt rejection, redaction, and no registry fetch, install/update execution, package-code execution, sidecar start, catalog mutation, or credential persistence.
- `verify:phase260` covers the twenty-seventh Beta 2 MCP/plugin execution-fabric slice: read-only plugin marketplace lifecycle status projection over metadata planning, metadata-bound install/update execution status, metadata-bound activation readiness, and metadata-bound activation execution status, including metadata-pending/blocked/failed, install-not-executed/blocked/failed, activation-not-ready/not-executed/blocked/failed, completed, and active states, redaction, and no registry fetch, install/update execution, package-code execution, sidecar start, catalog mutation, or credential persistence.
- `verify:phase261` covers the twenty-eighth Beta 2 MCP/plugin execution-fabric slice: read-only plugin marketplace lifecycle handoff projection from lifecycle states into bounded operator-only checklist actions with approval-required versus inspect-only summaries, optional state/cap filtering, redaction, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence.
- `verify:phase262` covers the twenty-ninth Beta 2 MCP/plugin execution-fabric slice: read-only plugin marketplace lifecycle runbook projection from lifecycle handoffs into bounded operator/reviewer runbook steps with approval-focused filtering, cap controls, redaction, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence.
- `verify:phase263` covers the thirtieth Beta 2 MCP/plugin execution-fabric slice: read-only plugin marketplace lifecycle approval packets over approval-required runbook steps with metadata/install/update/activation subject labels, prerequisite-aware ordering, phase/cap filtering, redaction, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence.
- `verify:phase264` covers the thirty-first Beta 2 MCP/plugin execution-fabric slice: read-only plugin marketplace lifecycle approval review over lifecycle approval packets and supplied approval evidence with ready/missing/mismatch/expired states, state/cap filtering, signature redaction, host-action denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence.
- `verify:phase265` covers the thirty-second Beta 2 MCP/plugin execution-fabric slice: read-only plugin marketplace lifecycle approval handoff descriptors over approval review output with ready/missing/mismatch/expired blocker states, phase/action/cap filtering, redaction, host-action denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence.
- `verify:phase266` covers the thirty-third Beta 2 MCP/plugin execution-fabric slice: read-only plugin marketplace lifecycle approval handoff preflight descriptors over approval handoff output with ready/blocker preflight states, next-action guidance, host-handoff metadata redaction, state/cap filtering, host-action denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence.
- `verify:phase267` covers the thirty-fourth Beta 2 MCP/plugin execution-fabric slice: read-only plugin marketplace lifecycle host handoff request descriptors over approval handoff preflights with explicit request commands, descriptor-only host request payloads, state/kind/cap filtering, blocker preservation, redaction, host-action denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence.
- `verify:phase268` covers the thirty-fifth Beta 2 MCP/plugin execution-fabric slice: read-only plugin marketplace lifecycle operator queues over host handoff requests with approval-blocker, metadata, install/update, activation-readiness, and activation request lanes, operator actions, state/lane/cap filtering, redaction, default-live-execution denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence.
- `verify:phase269` covers the thirty-sixth Beta 2 MCP/plugin execution-fabric slice: read-only plugin marketplace lifecycle default UX plans over operator queues with metadata/install/update/activation/approval collection/approval refresh prompt kinds, stable default command labels/ids, blocker preservation, command/state/cap filtering, redaction, default-live-execution denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence.
- `verify:phase270` covers the thirty-seventh Beta 2 MCP/plugin execution-fabric slice: read-only plugin marketplace lifecycle default UX command palettes over Phase 269 prompt plans with host handoff request and approval remediation groups, stable command previews, safety badges, group/state/cap filtering, blocker preservation, redaction, default-live-execution denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence.
- `verify:phase271` covers the thirty-eighth Beta 2 MCP/plugin execution-fabric slice: read-only plugin marketplace lifecycle default UX command briefs over Phase 270 command palettes with ready-command and approval-remediation sections, request-bound copy text, display labels, section/state/cap filtering, blocker preservation, redaction, default-live-execution denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence.
- `verify:phase272` covers the thirty-ninth Beta 2 MCP/plugin execution-fabric slice: read-only plugin marketplace lifecycle default UX command transcripts over Phase 271 command briefs with bounded terminal transcript lines, fixed safety summaries, operator-only hints, section/state/cap filtering, blocker preservation, redaction, default-live-execution denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence.
- `verify:phase273` covers the fortieth Beta 2 MCP/plugin execution-fabric slice: read-only plugin marketplace lifecycle default UX command panels over Phase 272 command transcripts with operator panel cards, ready-command and approval-remediation lanes, fixed safety summaries, copy text, terminal hints, lane/state/cap filtering, blocker preservation, redaction, default-live-execution denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence.
- `verify:phase274` covers the forty-first Beta 2 MCP/plugin execution-fabric slice: read-only plugin marketplace lifecycle default UX command panel digests over Phase 273 command panels with concise operator digest items, ready-command and approval-remediation groups, fixed safety summaries, copy text, terminal hints, group/state/cap filtering, blocker preservation, redaction, default-live-execution denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence.
- `verify:phase275` covers the forty-second Beta 2 MCP/plugin execution-fabric slice: read-only plugin marketplace lifecycle default UX command panel digest clipboard packets over Phase 274 digests with bounded operator clipboard items, ready-command and approval-remediation sections, fixed safety summaries, clipboard text, copy text, section/state/cap filtering, blocker preservation, redaction, default-live-execution denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence.
- `verify:phase276` covers the forty-third Beta 2 MCP/plugin execution-fabric slice: read-only plugin marketplace lifecycle default UX command panel digest clipboard review packets over Phase 275 clipboard packets with bounded operator/reviewer review items, ready-command and approval-remediation sections, fixed safety summaries, review text, review-ready/blocker states, section/state/cap filtering, blocker preservation, redaction, default-live-execution denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence.
- `verify:phase277` covers the forty-fourth Beta 2 MCP/plugin execution-fabric slice: read-only plugin marketplace lifecycle default UX command panel digest clipboard review closeout packets over Phase 276 review packets with bounded operator/reviewer closeout items, ready-command and approval-remediation sections, fixed safety summaries, closeout text, closeout-ready/blocker states, section/state/cap filtering, review-line preservation, blocker preservation, redaction, default-live-execution denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence.
- `verify:phase278` covers the forty-fifth Beta 2 MCP/plugin execution-fabric slice: read-only plugin marketplace lifecycle default UX command panel digest clipboard review closeout summary packets over Phase 277 closeout packets with bounded operator/reviewer summary items, ready-command and approval-remediation sections, fixed safety summaries, summary text, summary-ready/blocker states, section/state/cap filtering, closeout/review-line preservation, blocker preservation, redaction, default-live-execution denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence.
- deeper durable session recovery integration, broader remote action controls, hosted web UX, remote push/PR creation only behind explicit approval and credentials, and remaining channel/live-delivery depth after the shipped Phase 113-225 host-owned foundations: default live inbound delivery, broader real host upload/download/retry worker execution beyond the opt-in foreground factory and manual retry closeout/closure/audit/retry-ledger entry persistence, preflight, readiness-planning, operator-handoff, operator-handoff-preflight, worker-selection intent, handler-readiness, invocation-handoff, invocation-handoff-preflight, worker execution-plan context, execution-plan-preflight context, trusted foreground worker execution, non-persistent worker execution receipt, supplied execution-receipt preflight, receipt-preflight-bound closeout readiness, supplied closeout-preflight, and closeout-preflight-bound record-plan boundaries, privileged Gateway intents, broader Discord live-delivery UX beyond Phase112 host-owned `APPLICATION_COMMAND` dispatch and the Phase 107 guild command executor, broader slash-command lifecycle/UX, and channel-specific delivery runtime semantics remain open.

Exit criteria:

- Terminal UI becomes one client of shared runtime.

## Phase 7 - Hardening and Release

Goal: Convert full feature set into release candidate.

Primary planned paths:

- all runtime-critical modules
- future packaging/doctor/onboarding paths
- `docs/ANTELLIGENCE_PLAYBOOK.md`
- `docs/ANTELLIGENCE_LAUNCH_CHECKLIST.md`
- `docs/templates/antelligence/*`

Reference:

- Python doctor/first-run/hardware tooling where useful
- OpenClaw operational patterns

Deliverables:

1. Failure-injection tests.
2. Performance and token benchmarks.
3. Packaging and first-run flow.
4. Operator docs and release checklist.
5. Antelligence launch framework: canonical playbook, claim-safety checklist, and enterprise templates linked from source-of-truth docs without implying unshipped runtime features.
6. Launch Alpha 0 source+Bun surface: root README, `docs/LAUNCH_ALPHA_0.md`, `verify:alpha0`, and real LLM swarm demo with narrow public claims.

Verification:

- Repeatable release gate with full regression pass.
- Documentation claim-safety search for Antelligence launch copy and deferred runtime surfaces.

Exit criteria:

- Project has release candidate, not just development momentum.
- Launch docs explain Antelligence as a framework/playbook while runtime claims stay grounded in shipped verification truth.

## Immediate Next Slices

Current near-term order follows `docs/PARITY_EXECUTION_BOARD.md`:

1. Phase 2 memory polish only when concrete retrieval precision or inspection gaps are discovered.
2. Release-grade Alpha 0 hardening around source+Bun onboarding, claim safety, build packaging, and the real LLM swarm demo.
3. Richer swarm visualization and production hardening beyond the shipped Launch Alpha 0 real planner/worker/reviewer execution path.
4. Remote action-control and workflow automation hardening beyond the shipped daemon/client/control-plane foundation.
5. Phase 2 / Alpha 3 memory polish only when new concrete recall precision, transcript truth, inspection, or recovery gaps are discovered.
6. Release-grade doctor, onboarding, and packaging.

## Done Definition Per Slice

Slice is done only when all items below true:

1. Behavior implemented.
2. Assertions added or extended.
3. TypeScript clean.
4. Manual smoke path checked if user-visible.
5. Docs updated if project shape changed.
