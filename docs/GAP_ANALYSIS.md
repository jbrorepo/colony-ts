# The Colony - Gap Analysis

Last Updated: 2026-05-14

This document measures gap against two things:

1. Colony behavioral intent from Python reference.
2. State-of-the-art target for TypeScript/Bun/Ink product.

Important: `the-colony` is not treated as finished perfect software. It is source material, not ceiling. Where Python behavior is strong, we port it. Where Python stopped short, we keep Colony identity and use stronger patterns from Claude Code, OpenClaw, MemPalace, and current TS architecture.

Current built/not-built truth is tracked in [PROJECT_STATE.md](./PROJECT_STATE.md).
Capability-class benchmark status is tracked in [BENCHMARK_BOARD.md](./BENCHMARK_BOARD.md).
Execution sequencing for closing benchmark deltas is tracked in [PARITY_EXECUTION_BOARD.md](./PARITY_EXECUTION_BOARD.md).

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
- Identity system, prompt templates, prompt builder, prompt assembler, Phase 279 12-caste method framework compatibility aliases, Phase 280 operator-facing method labels over legacy persisted caste strings, Phase 281 source-of-truth doc display guardrails for method caste names, and Phase 282 runtime/model-facing identity prompt-template display guardrails.
- Workspace detection.
- Startup doctor coverage for config presence, writable runtime paths, provider credentials, default cloud readiness, and port status, including filtered slash-command views.
- Observed provider failover/circuit health surfaced in runtime command UX without active probe spend, including per-provider drill-down.
- Status/workspace operator commands now surface latest failover summary and workspace start-dir details.
- Prompt assembly now includes workspace start-dir, circuit state, provider health, and recent failovers.
- Terminal operator surface now shows workspace identity, startup doctor counts, provider health, recent failovers, and recent saved sessions.
- `/help` truth for registered hooks, recent hook events, hook performance, and supported hook kinds.
- `/help` truth for recent runtime events, failures, tool/hook/compaction/failover filters, and event performance.
- `/help` truth for runtime, model, provider, tool, hook, and compaction performance drill-downs.
- `/help` truth for active tool schemas, approvals, recent activity, artifacts, performance, policy links, and exact-call session rules.
- `/help` truth for cost summary, model usage, budget detail, performance, and drill-down views.
- `/help` truth for current cost/token caps, budget status inspection, spend inspection, and USD cap setting.
- `/help` truth for selected provider/model state, current-provider model setting, and next-run provider/model switching.
- `/help` truth for session, runtime, saved sessions, workspace, tools, workflow, operator next-actions, and status drill-down views.
- `/help` truth for persisted large tool-output catalogs, exact artifact reopen commands, latest artifact shortcuts, and Colony storage boundaries.
- `/help` truth for the full compaction strategy family, smart selection, status/recent/handoff views, pressure, and failure visibility.
- Skill catalog audits for alias/rename drift, missing core metadata/body content, and developer-only/product-candidate/unsupported classification exposed through `/skills audit`.
- Skill source metadata audits for missing source data, stale revisions, source mismatches, and loaded-vs-expected revision deltas exposed through `/skills audit`.
- Safe skill import/update planning for dry-run import/update/keep/review actions exposed through `/skills plan` without writing files or exposing skill body text.
- Explicit-approval skill import staging for reviewed candidates, with quarantine-only writes, body-free manifests, no-write behavior without approval, and staged audit gates before later promotion.
- Audit-gated staged-skill promotion into the live catalog after a second explicit approval, with rollback-file preservation and body-free promotion manifests.
- Staged skill operator views for preview, audit, second-approval guidance, promotion status, and rollback evidence exposed through `/skills staged` without leaking skill body text.
- Explicit-approval staged-skill rollback executor for restoring preserved previous live copies with missing-evidence rejection and body-free rollback metadata.
- Approved staged-skill rollback result rendering through `/skills staged rollback <name> --approved`, with fail-closed missing-result behavior and body-safe output.
- Body-safe staged skill lifecycle history through typed stage/promote/rollback event projection and `/skills staged history <name>` inspection.
- Persisted session catalog is exposed in command UX for resume and recovery, including previews, interruption/checkpoint filtering, smarter resume targeting including `pending`, and `/history` tail inspection.
- Persisted single-agent session resume foundation.
- Security additions: audit trail, policy engine, secret scanner, path validator.
- Caveman outbound compression bridge.

Current verification frontier is `verify:phase282` plus `tsc --noEmit` through `bun run verify:all`; Launch Alpha 0 has the focused `verify:alpha0` gate.

## Coverage Summary

## Benchmark Delta vs Claude Code and OpenClaw

| Capability class | Colony | Gap |
| --- | --- | --- |
| Single-agent terminal product | strong | behind in operator polish, truthful command surface, compatibility, and performance hardening |
| Memory and recall | partial | behind deeper extraction breadth, operator surfacing, and final MemPalace completion despite major routing/ranking progress |
| Workflow and tasks | foundation + operator visibility + step policy + runtime runner + AgentLoop adapter + packaged templates + automation control API shipped | behind remote approval operator UX, broader task automation, failure injection, and release-grade resumability |
| Multi-agent runtime | spawn/lifecycle + coordinator queue/messaging + fan-out/fan-in/cancellation + policy propagation + `/swarm` coordinator-only start/status/cancel + LLM-backed planner/worker/reviewer execution + durable restart-safe snapshots/status/resume/retry plus stage timeline/retry-history/artifact-review/interrupted-resume/approval-wait inspection shipped | behind broader long-run swarm production hardening |
| Tools, skills, MCP, plugins | skills catalog + MCP foundation + approval-proof hardening + transport seam + guarded boundary + MCP resource list/read + stdio transport + trusted stdio config + trusted stdio operator/audit inspection + internal HTTP transport + trusted HTTP config/operator exposure + trusted plugin sidecar config + managed plugin sidecar lifecycle + plugin sidecar supervisor foundation + dry-run plugin package discovery/import planner + durable redacted package plan event journal + approval-gated plugin package catalog staging and live-disabled promotion + approval-gated plugin package install/update execution receipts through an injected executor + supplied registry metadata checksum/signature enrichment + approval-gated package-driven sidecar activation controls through an injected supervisor + approval-gated registry fetch host/network handoff boundary + injected host-executor registry fetch execution receipts + exact-approval package-code execution policy preflights + approved package-code execution receipts through an injected host executor + read-only built-in plugin marketplace view, marketplace registry metadata fetch handoff descriptors, registry fetch execution status, approved registry fetch handoff execution bridge, registry-fetch metadata planning, metadata-bound install/update handoff descriptors, approved metadata-bound install/update handoff execution receipts, metadata-bound install/update execution status, metadata-bound activation readiness, metadata-bound activation handoff descriptors, approved metadata-bound activation handoff execution receipts, metadata-bound activation execution status, marketplace lifecycle status, marketplace lifecycle handoff, marketplace lifecycle runbook, marketplace lifecycle approval packets, marketplace lifecycle approval review, install/update handoff descriptors, install/update execution status, approved install/update handoff execution bridge, activation readiness, activation handoff descriptors, approved activation handoff execution receipts, and read-only execution status projections over bundled descriptors + safe local `glob_find`/git/test/lint tool breadth + approval-gated `web_fetch`/`web_search` shipped | behind built-in live/default registry fetch/install UX beyond injected handoff execution/status/views/planning, default/live plugin activation UX beyond explicit approved handoff execution, and production plugin fabric beyond approved receipts |
| Daemon, remote, web, channels, voice | control-plane API + HTTP transport/client + typed remote actions + scoped auth + `/daemon` visibility + local-only authenticated web-control operator shell + local-scoped web mutation handoff controls + local-first GitHub PR handoff workflow template + deterministic provided GitHub issue intake + approval-gated GitHub branch/worktree action plan + injected approved local GitHub branch/worktree execution receipts + verified PR handoff artifact generation + first channel foundations through Phase 225 trusted closeout-preflight-bound closure retry-ledger entry worker execution-receipt closeout record-plan truth shipped | behind hosted/default-public web delivery, deeper session recovery integration, broader remote action controls, remote push/PR creation only behind explicit approval and credentials, remaining channel/live-delivery depth after the shipped Phase 113-225 host-owned foundations, default live inbound delivery, broader real host upload/download/retry worker depth beyond the opt-in foreground factory and manual retry closeout/closure/audit/retry-ledger entry persistence, preflight, readiness-planning, operator-handoff, operator-handoff-preflight, worker-selection intent, handler-readiness, invocation-handoff, invocation-handoff-preflight, worker execution-plan context, execution-plan-preflight context, trusted foreground worker execution, non-persistent worker execution receipt, supplied execution-receipt preflight, receipt-preflight-bound closeout readiness, supplied closeout-preflight, and closeout-preflight-bound record-plan boundaries, privileged Gateway intents, broader Discord live-delivery UX, broader slash-command lifecycle/UX, and voice |
| Release and operator truth | partial | behind benchmark-grade docs, onboarding, packaging, and release gates |

Phase 225 update for daemon/channel parity: trusted supplied retry-control work-item closure retry-ledger entry worker execution-receipt closeout preflights can now produce deterministic closeout record-plan truth before any downstream persistence boundary. The record plan binds trusted supplied Phase224 closeout-preflight truth, Phase223 closeout truth, Phase222 preflight truth, Phase221 receipt truth, trusted Phase220 execution truth, execution-plan/preflight truth, invocation-handoff id, handler-readiness and worker-selection ids, channel/target/retry-stage context, transfer key, source fingerprints, bounded delivered-count truth, transfer-key echo truth, host receipt-metadata presence, no raw host receipt persistence, and the earlier closure/audit/closeout provenance transitively through the trusted execution-plan and handoff chain. Copied, tampered, missing, contaminated, or nested-mutation attempts fail closed without echoing untrusted bodies and while still creating no retry worker, schedule, public hosting, default live delivery, background retry, credential persistence, automatic vendor retry, receipt persistence, closeout persistence, durable closeout record, default listener, or raw host data.

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

## Remaining or Intentionally Deferred

These remain major gaps:

- Long-term memory completion beyond the shipped transcript, compact artifact, structured fact, markdown, and MemPalace foundations.
- Broader remote automation on top of the shipped DAG/checkpoint/operator-visibility/policy/runtime-runner/AgentLoop-adapter/template/automation-control/daemon-host/HTTP/scoped-auth foundation.
- Multi-agent coordination beyond worker spawn/lifecycle, direct queue/messaging, fan-out/fan-in cancellation, dispatch policy primitives, durable restart-safe snapshots, and the shipped `/swarm` coordinator-only plus LLM-backed status/resume/retry path.
- Richer swarm visualization and production hardening beyond the Launch Alpha 0 real planner/worker/reviewer demo; phase 233 now covers timeline/retry-history/failure-injection, redacted artifact-review inspection, interrupted-stage resume history, and persisted approval-wait preservation, while broader long-run failure injection remains open.
- Production plugin fabric beyond the shipped in-process MCP client/server/tool-adapter foundation, approval-proof hardening, transport seam, guarded transport boundary, stdio transport foundation, trusted stdio config factory, trusted stdio operator/audit inspection, internal HTTP transport foundation, trusted HTTP config/operator exposure, trusted plugin sidecar config, managed plugin sidecar lifecycle, plugin sidecar supervisor foundation, dry-run plugin package discovery/import planner, durable redacted package plan event journal, approval-gated plugin package catalog staging/live-disabled promotion, and approval-gated install/update execution receipts.
- Event bus and monitoring layer.
- Gateway daemon and multi-surface delivery beyond the shipped control-plane API, HTTP transport/client, scoped auth, and first channel foundations.
- Channel integration depth beyond the shipped in-memory channel, webhook auth, local webhook listener, route-to-session bridge, contract-only Slack/Discord/Telegram-style fixtures, first outbound Slack/Discord/Telegram adapter classes, approval-gated registration helpers, inbound signature helpers, Slack/Discord setup request staging, host-owned Slack/Discord setup executors, Slack retry/readiness/fast-ACK depth, approval-bound mention-only `app_mention` support, bounded in-memory duplicate suppression for signed and host-authenticated Slack `message`/`app_mention` retries, redacted durable approved Slack event binding before bridge dispatch, inbound-only Slack media metadata inspection, and Discord command dispatch foundations.
- Release-grade doctor, first-run, and packaging experience.

## True Priority Order

Current priority order is:

1. Polish memory retrieval precision, inspection, and MemPalace closure gaps as they are discovered.
2. Expand broader tool inventory plus production plugin fabric hardening beyond the shipped safe local/web tool breadth, typed tool metadata contracts, in-process, stdio, trusted HTTP, trusted plugin sidecar, managed plugin sidecar lifecycle, supervisor foundation, dry-run package planning, durable plan/event persistence, approval-gated package catalog staging/live-disabled catalog promotion, and approval-gated install/update receipt MCP/plugin foundations.
3. Harden hosted web-control UX and remote action controls beyond the shipped local web mutation handoff.
4. Harden multi-agent orchestration durability and workflow automation surfaces.
5. Harden and package for release.

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
  - query-guided truth modes and section ordering across exact transcript vs derived recall
  - routing-note inspectability across truth-mode source, compact/structured focus source, derived/palace order source, palace hall/wing/room/source-file/expand/broaden/related source, nearby/broader/related graph seed truth including no-result attempt and no-start reason truth, direct plus nearby/broader/related graph hit/miss-ladder provenance, direct/nearby/broader/related row-level rung provenance, resolved palace-path provenance plus room/source, nearby/broader-seed, and cross-wing seed fallback truth, role/session/time bias source, whole-memory counts, mix, origin, reason composition, actual shown section order, and per-section shown/empty/truncated state
  - compaction-to-memory handoff so compacted turns are persisted before live removal
  - structured reusable fact extraction with scope/category metadata, cross-session dedup, deeper heuristic splitting for explicit durable category markers, alias labels, and natural-language lead-ins across fact/decision/advice/reasoning/diagnostic/procedure/metric/preference/pattern/constraint/risk/change/discovery/event, including root-cause/runtime-detail/pattern/incident phrasing, ownership/responsibility/contact facts for `who owns` recall, implicit ordered-step, numbered-step, and bullet-step procedure capture, concrete metric shards like latency/timeout/token/memory/cost budgets, and concrete runtime/workspace entities like providers, models, services, databases, queues, buckets, tables, topics, hosts, domains, regions, clusters, namespaces, schemas, pods, deployments, images, containers, jobs, volumes, packages, libraries, versions, status/error codes, env vars, endpoints, paths, ports, tools, commands, files, flags, modules, functions, classes, repos, projects, branches, commits, PRs, and issue/ticket/bug IDs with alias-aware work-item ranking
  - query-time surfacing of durable colony facts vs agent-scoped facts
  - query-intent-aware ranking across transcript, compact artifacts, structured facts, and markdown memory, including ownership asks like `who owns`, expanded infra-entity asks like service/database/queue/bucket/table/topic/host/domain/region/cluster/namespace/schema/pod/deployment/image/container/job/volume/package/library plus git/work-item/runtime-ops entity asks like branch/commit/PR/issue/exit-code/errno/version
  - async-safe MemPalace store/layer/graph foundation with no sync filesystem helpers in active stack paths
  - MemPalace hall/wing/room/source-file routing, nearby/broader traversal, and related cross-wing tunnel recall with conservative fallback laws
  - non-retrieving `/memory plan <query>` inspection for inferred truth mode, exact/derived recall controls, MemPalace distance threshold labels, graph-hop bounds, sanitized hall/wing/room/source filter controls, body-safe precision diagnostics, section ordering, intent tags, palace route hints, and structured durable-memory focus/hints/boost labels without echoing raw query text
  - real-session memory/MemPalace QA matrix coverage for exact transcript truth separation, derived ownership and decision recall, palace issue/path routing, procedure routing, bounded query hashes, body-safe diagnostics, and exact-only shown-count accounting that does not count hidden derived memory
  - loaded persisted structured, markdown, and compact artifact memory are sanitized before surfacing, and structured category boosts do not admit unrelated zero-overlap records by themselves
  - resolution/fix/workaround statements are extracted as structured diagnostics, ranked ahead of failure noise for what-fixed-it queries, and surfaced in memory context
- Remaining:
  - deeper entity/fact extraction beyond current heuristic baseline
  - runtime-enforced recall-control overrides beyond current query-inferred `/memory plan` previews
  - final phase-closure hardening across all memory layers and full-project verification

### Workflow

- Status: foundation + operator visibility + step policy + runtime runner + AgentLoop adapter + packaged templates + automation control API shipped
- Reference: Python workflow modules + Superpowers execution discipline
- Need:
  - remote approval operator UX
  - richer task automation surfaces
  - broader failure injection
  - release-grade resumability audits

### Agents and Orchestrator

- Status: spawn/lifecycle + coordinator queue/messaging + fan-out/fan-in/cancellation + policy propagation + `/swarm` coordinator-only start/status/cancel + LLM-backed status/resume/retry + durable restart-safe snapshot foundation + stage timeline/retry-history/artifact-review/interrupted-resume/approval-wait inspection shipped
- Reference: Python agents/orchestrator + OpenClaw coordination ideas
- Need:
  - production hardening around long-running multi-agent execution

### Tools, Skills, MCP

- Status: skills catalog + MCP in-process client/server foundation + approval-proof hardening + transport seam + guarded transport boundary + stdio transport foundation + trusted stdio config + trusted stdio operator/audit inspection + internal HTTP transport foundation + trusted HTTP config/operator exposure + trusted plugin sidecar config + managed plugin sidecar lifecycle + plugin sidecar supervisor foundation + dry-run package planning + durable plan events + approval-gated package catalog staging/live-disabled catalog promotion + approval-gated package install/update execution receipts shipped
- Reference: Python skills and MCP + Claude Code tool UX
- Present:
  - async `SKILL.md` discovery with frontmatter metadata
  - query-based skill selection
  - bounded prompt instruction generation
  - `/skills` list/search/inspect visibility
  - minimal MCP JSON-RPC initialize, `tools/list`, and `tools/call`
  - transport-agnostic MCP client seam through `McpTransport` and `InProcessMcpTransport`
  - guarded MCP transport wrapper with method/tool allowlists, request/response bounds, timeout, concurrency, origin/plugin allowlists, and bearer-token policy
  - server-side MCP JSON-RPC error redaction before external clients can receive server responses
  - MCP initialize/tools-list/tools-call result-shape validation plus result-array hardening before external clients or adapter outputs are trusted
  - first real stdio MCP transport foundation with shell-free Bun pipe spawning, guarded context usage, bounded stdout framing, redacted stderr diagnostics, timeout cleanup, and fail-closed response id matching
  - trusted stdio MCP server config factory with high-risk approval request generation, exact normalized trust signatures, absolute-command enforcement, shell/package-runner/inline-eval rejection, secret env rejection, local tool allowlists, and list-only policy when no tools are allowlisted
  - trusted stdio MCP operator/audit inspection with redacted config snapshots and startup trust event projection without process spawn or argv/env value leakage
  - internal fetch-backed HTTP MCP transport with HTTPS-only endpoints, SSRF host rejection, redirect-disabled POST JSON-RPC flow, safe request cloning, bounded response reads, sanitized failures, abortable timeouts, and fail-closed response-id validation
  - trusted HTTP MCP server config factory and operator/audit inspection with exact approval signatures, redacted approval requests, guarded client creation, stale approval rejection, and no raw HTTP transport exposure
  - trusted plugin MCP sidecar config factory and operator/audit inspection with plugin-specific trust signatures, package/sidecar/capability trust inputs, guarded sidecar client creation, stale approval rejection, and no raw sidecar transport exposure
  - managed plugin MCP sidecar lifecycle with trusted connect handshake, signed protocol/server expectations, post-connect initialize replay rejection, lifecycle state, idempotent close, post-close send rejection, retryable/redacted close failures, failed-handshake cleanup, and redacted generic handshake failures
  - plugin sidecar supervisor foundation with injected trusted transport factory, exact active-signature handling, direct-start backoff/limit enforcement, bounded restart/backoff policy, redacted in-memory lifecycle events, redacted lifecycle snapshots, list/inspect/client/stop behavior, retryable/redacted stop failures, and no package install path
  - dry-run plugin package discovery/import planner with manifest validation, digest/source/sidecar checks, deterministic import/update/keep/review/reject plans, normalized trusted sidecar candidates, approval request compatibility, and no install/execution/start/fetch/write path
  - durable redacted plugin package plan event journal with append-only JSONL persistence, malformed journal fail-closed behavior, exact signature separation, and high-entropy actor redaction
  - approval-gated plugin package catalog staging with explicit approval before staging writes, live catalog isolation, redacted/body-safe staged metadata, plugin-signature namespace enforcement, unknown sidecar-kind rejection, fail-closed malformed candidate loading, and no install/update execution, package execution, sidecar start, registry fetch, or live package/catalog promotion path
  - second-approval plugin package live catalog promotion into disabled metadata records, metadata-only rollback records, namespace/catalog isolation, malformed candidate rejection, durable live catalog fail-closed loading/appending, redaction, and no package install/update, package execution, sidecar start, registry fetch, or activation path
  - approval-gated plugin package install/update execution receipts with exact plugin trust approval, package-path confinement, lifecycle-script blocking through required `--ignore-scripts`, injected executor calls, redacted stdout/stderr previews, stop-after-failure ordering, and no registry fetch, live activation, sidecar startup, or credential persistence
  - supplied registry metadata enrichment for plugin package planning with checksum/integrity/signature summaries, fail-closed identity/source/digest mismatch rejection before trust signatures are emitted, unsafe registry metadata redaction, and no live registry fetch, package execution, sidecar start, activation, or credential persistence
  - approval-gated plugin package sidecar activation receipts with exact plugin trust approval, matching completed install/update receipt checks, unsupported-action/unknown-sidecar/signature-tamper blocking, injected supervisor start, redacted supervisor summaries, and no registry fetch, default activation, package lifecycle execution, transport creation, or credential persistence
  - approval-gated plugin registry metadata fetch host/network handoff boundary with exact signatures, HTTPS/no-credential/no-local URL validation, redacted host actions, and no Colony-owned network execution, package execution, activation, catalog mutation, or credential persistence
  - approval-gated injected host-executor plugin registry metadata fetch execution receipts with HTTP status, content-type, response-size, JSON shape, package identity, and digest validation plus redacted receipt persistence; no built-in Colony registry client, default marketplace fetch, package execution, activation, catalog mutation, or credential persistence
  - exact-approval package-code execution policy preflights that require a matching completed install/update receipt, reject lifecycle scripts, shell-like commands, path escapes, receipt/signature tampering, and unknown sidecars, and produce only redacted host-action descriptors without executing plugin code or calling an executor
  - approved package-code execution receipts that require a ready package-code preflight, exact approval, a confined package path, and an injected host executor, then persist only redacted bounded stdout/stderr and exit-code truth without fetching registries, activating sidecars, mutating catalogs, or persisting credentials
  - read-only built-in plugin marketplace view over bundled descriptors with safe plan summaries, source redaction, query hashing, unsafe descriptor rejection, and no registry fetch, package install, package execution, sidecar activation, catalog mutation, or credential persistence
  - redacted marketplace install/update handoff descriptors over bundled descriptors that bind import/update actions to exact approval and the existing injected install/update executor path without fetching registries, installing packages, executing package code, activating sidecars, starting sidecars, mutating catalogs, or persisting credentials
  - read-only marketplace install/update execution status projection over handoff descriptors and supplied install/update receipts, with completed/failed/blocked/not-executed states, mismatch rejection, and no registry fetch, package install, package-code execution, sidecar activation, sidecar start, catalog mutation, or credential persistence
  - approved marketplace install/update handoff execution receipts that require matching ready handoff/action/approval truth before delegating to the existing injected install/update helper, with failed-executor receipt truth and redaction while still performing no registry fetch, package-code execution, sidecar activation, sidecar start, catalog mutation, or credential persistence
  - marketplace registry metadata fetch handoff descriptors over bundled descriptors that bind safe entries to the existing injected registry fetch executor path, embed the generic registry boundary truth, and block missing entries, missing/unsafe registry URLs, wrong approvals, and rejected package actions without performing network fetches, installs, package-code execution, sidecar activation/start, catalog mutation, or credential persistence
  - read-only marketplace registry fetch execution status over bundled descriptors and supplied registry-fetch receipts, with completed/failed/blocked/not-executed states, mismatch rejection, and no registry fetch, package install, package-code execution, sidecar activation/start, catalog mutation, or credential persistence
  - approved marketplace registry fetch handoff execution receipts that require a matching ready handoff, exact `fetch_registry_metadata` action, exact approval, and an injected host executor before delegating to the existing registry-fetch helper; blocked/tampered handoffs fail before executor calls, failed host receipts are summarized, and no built-in registry client, package install/update, package-code execution, sidecar activation/start, catalog mutation, or credential persistence is created
  - read-only marketplace registry-fetch metadata planning over bundled descriptors, ready handoffs, supplied registry-fetch receipts, and host-supplied full registry metadata; completed redacted receipts can gate the planning path but cannot become full metadata by themselves, mismatched supplied metadata is rejected by the existing package planner, and no registry fetch, package install/update, package-code execution, sidecar activation/start, catalog mutation, or credential persistence is created
  - metadata-bound marketplace install/update handoff descriptors over bundled descriptors; a Phase 252 `metadata_ready` planning entry is required before the existing install/update handoff can become usable for that entry, and no registry fetch, install/update execution, package-code execution, sidecar activation/start, catalog mutation, or credential persistence is created
  - approved metadata-bound marketplace install/update handoff execution receipts; a ready Phase 253 wrapper and ready nested install/update handoff are required before delegating to the existing injected install/update execution helper, and no registry fetch, package-code execution, sidecar activation/start, catalog mutation, or credential persistence is created
  - read-only metadata-bound marketplace install/update execution status projection over Phase 253 handoffs and Phase 254 receipts with metadata-blocked/not-executed/blocked/failed/completed states, receipt mismatch rejection, redaction, and no registry fetch, install/update execution, package-code execution, sidecar activation/start, catalog mutation, or credential persistence
  - read-only metadata-bound marketplace activation readiness projection over metadata-bound install/update execution status with metadata-blocked/install-not-executed/install-blocked/install-failed/needs-activation-approval/ready-for-activation-handoff/active states, signature redaction, and no registry fetch, install/update execution, package-code execution, sidecar activation/start, catalog mutation, or credential persistence
  - redacted metadata-bound marketplace activation handoff descriptors over ready metadata-bound activation-readiness entries with exact approval binding and no registry fetch, install/update execution, package-code execution, sidecar activation/start, catalog mutation, or credential persistence
  - approved metadata-bound marketplace activation handoff execution receipts that require a ready metadata-bound handoff, matching action, completed install/update receipt, exact approval, and an injected supervisor before delegating to the existing approved marketplace activation execution helper, with blocked/tampered gates failing before supervisor calls and no registry fetch, install/update execution, package-code execution, catalog mutation, or credential persistence
  - read-only metadata-bound marketplace activation execution status projection over Phase 256 readiness and Phase 258 receipts with metadata-blocked/activation-not-ready/not-executed/blocked/failed/completed/active states, stale metadata-gate and mismatched-receipt rejection, redaction, and no registry fetch, install/update execution, package-code execution, sidecar start, catalog mutation, or credential persistence
  - read-only plugin marketplace lifecycle status projection over metadata planning, metadata-bound install/update execution status, metadata-bound activation readiness, and metadata-bound activation execution status with metadata/install/activation/completed/active states, redaction, and no registry fetch, install/update execution, package-code execution, sidecar start, catalog mutation, or credential persistence
  - read-only plugin marketplace lifecycle handoff projection from lifecycle states into bounded operator-only checklist actions with approval-required versus inspect-only summaries, optional state/cap filtering, redaction, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence
  - read-only plugin marketplace lifecycle runbook projection from lifecycle handoffs into bounded operator/reviewer runbook steps with approval-focused filtering, cap controls, redaction, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence
  - read-only plugin marketplace lifecycle approval packets over approval-required lifecycle runbook steps with metadata/install/update/activation subject labels, prerequisite-aware ordering, phase/cap filtering, redaction, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence
  - read-only plugin marketplace lifecycle approval review over lifecycle approval packets and supplied approval evidence with ready/missing/mismatch/expired states, state/cap filtering, signature redaction, host-action denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence
  - read-only plugin marketplace lifecycle approval handoff over approval review output with ready/blocker descriptor states, phase/action/cap filtering, redaction, host-action denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence
  - read-only plugin marketplace lifecycle approval handoff preflight over approval handoff output with ready/blocker preflight states, next-action guidance, host-handoff metadata redaction, state/cap filtering, host-action denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence
  - read-only plugin marketplace lifecycle host handoff request descriptors over approval handoff preflights with explicit request commands, descriptor-only host request payloads, state/kind/cap filtering, blocker preservation, redaction, host-action denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence
  - read-only plugin marketplace lifecycle operator queue descriptors over host handoff requests with approval-blocker, metadata, install/update, activation-readiness, and activation request lanes, operator actions, state/lane/cap filtering, redaction, default-live-execution denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence
  - read-only plugin marketplace lifecycle default UX plans over operator queues with stable default prompt command labels/ids, metadata/install/update/activation/approval collection/approval refresh prompt kinds, blocker preservation, redaction, default-live-execution denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence
  - read-only plugin marketplace lifecycle default UX command palettes over default UX plans with host handoff request and approval remediation groups, stable command previews, safety badges, blocker preservation, redaction, default-live-execution denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence
  - read-only plugin marketplace lifecycle default UX command briefs over command palettes with ready-command and approval-remediation sections, request-bound copy text, display labels, blocker preservation, redaction, default-live-execution denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence
  - read-only plugin marketplace lifecycle default UX command transcripts over command briefs with bounded terminal transcript lines, fixed safety summaries, operator-only hints, blocker preservation, redaction, default-live-execution denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence
  - read-only plugin marketplace lifecycle default UX command panels over command transcripts with ready-command and approval-remediation panel cards, fixed safety summaries, copy text, terminal hints, blocker preservation, redaction, default-live-execution denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence
  - read-only plugin marketplace lifecycle default UX command panel digests over command panels with ready-command and approval-remediation digest items, fixed safety summaries, copy text, terminal hints, blocker preservation, redaction, default-live-execution denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence
  - read-only plugin marketplace lifecycle default UX command panel digest clipboard packets over command panel digests with bounded ready-command and approval-remediation clipboard items, fixed safety summaries, clipboard text, copy text, blocker preservation, redaction, default-live-execution denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence
  - read-only plugin marketplace lifecycle default UX command panel digest clipboard review packets over clipboard packets with bounded ready-command and approval-remediation review items, fixed safety summaries, review text, review-ready/blocker states, copy text, blocker preservation, redaction, default-live-execution denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence
  - read-only plugin marketplace lifecycle default UX command panel digest clipboard review closeout packets over review packets with bounded ready-command and approval-remediation closeout items, fixed safety summaries, closeout text, closeout-ready/blocker states, copy text, review-line preservation, blocker preservation, redaction, default-live-execution denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence
  - read-only plugin marketplace lifecycle default UX command panel digest clipboard review closeout summary packets over closeout packets with bounded ready-command and approval-remediation summary items, fixed safety summaries, summary text, summary-ready/blocker states, copy text, closeout/review-line preservation, blocker preservation, redaction, default-live-execution denial, and no registry fetch, install/update execution, package-code execution, activation, sidecar start, catalog mutation, or credential persistence
  - read-only plugin marketplace activation readiness over bundled descriptors with review/install-receipt/approval/operator-handoff state, receipt/approval summaries, active-state inspection, source redaction, and no registry fetch, package install, package execution, sidecar activation, catalog mutation, or credential persistence
  - redacted plugin marketplace activation handoff descriptors that bind ready activation-readiness entries to exact approval signatures and the injected supervisor activation path without activation, sidecar start, registry fetch, package install, package execution, catalog mutation, or credential persistence
  - approved plugin marketplace activation handoff execution receipts that require matching handoff/action/install-receipt/approval truth before delegating to the existing injected supervisor activation helper, with redacted summaries and no registry fetch, package install, package-code execution, catalog mutation, or credential persistence
  - read-only plugin marketplace activation execution status projection over readiness entries, approved handoff-execution receipts, and active sidecar signatures, with completed/failed/blocked/active/not-executed states, mismatch rejection, and no registry fetch, package install, package-code execution, sidecar start, catalog mutation, or credential persistence
  - typed tool metadata contracts for normalized defaults, builtin read-only/destructive/concurrency/progress/transcript/search/persisted-result truth, metadata-derived runtime categories, MCP annotations, and `/tools` operator rendering
  - safe local tool breadth for `glob_find`, structured `git_status`, bounded/redacted `git_diff`, and approval-gated package `test_runner`/`lint_runner` wrappers
  - policy-gated web tool breadth for approval-required `web_fetch` and `web_search` with HTTPS-only network policy, DNS/private-host SSRF rejection, redirect-disabled fetches, text-only response handling, size bounds, timeout/abort wiring, redaction, untrusted-content wrapping, and prompt-injection signal reporting
  - ToolRegistry-backed MCP tool metadata exposure
  - fail-closed approval behavior for approval-gated MCP tool calls
  - verifier-owned MCP approval proof bound to exact tool name plus normalized argument signature; caller-supplied `_meta.approved` booleans are ignored as authorization
- Need:
  - production plugin fabric beyond approved install/update receipts
  - honest runtime and docs parity around currently unshipped resource, plugin, and package execution tools
  - built-in live/default registry fetch/install UX beyond read-only bundled marketplace descriptors, marketplace registry handoff descriptors/status, injected host-executor registry receipts, and injected install/update handoff descriptors/status, default/live plugin activation UX beyond explicit approved handoff execution, broader tool inventory, and production plugin fabric beyond approved receipts
  - schema/permission consistency across all tools

### Gateway and Channels

- Status: daemon/control-plane foundation + channel surface skeleton shipped
- Reference: Python gateway + OpenClaw delivery architecture
- Present:
  - daemon control-plane API, HTTP transport/client, typed remote actions, scoped auth, and `/daemon` visibility
  - deterministic channel route keys for direct/group/channel/thread targets
  - in-memory channel adapter and registry-backed delivery records
  - `/channels` and `/channels deliveries` operator visibility
  - redacted channel webhook secret checks
  - pairing-gated sender authorization
  - normalized inbound webhook envelopes with deterministic route keys
  - `/channels auth` policy/pairing visibility
  - HTTP channel webhook handler and local listener smoke path
  - channel inbound route-to-session bridge with outbound reply delivery records
  - `/channels sessions` operator visibility for channel session routes and recent turns
  - `/help` truth for adapters, deliveries, auth, and sessions channel views
  - `/help` truth for active schemas, allowed/denied tools, and session-rule permission views
  - `/help` truth for provider switching, health, failover, performance, and current-provider views
  - `/help` truth for skill search/inspect plus trust and approval metadata
  - `/help` truth for doctor diagnostics, first-run, workspace, providers, and failover views
  - `/help` truth for workspace packages, dev/verify commands, stack hints, and workspace globs
  - contract-only Slack/Discord/Telegram-style channel adapter fixtures with `/channels contracts` visibility for threading, mentions, reactions, attachments, retries, auth, redaction, and route semantics
- Need:
  - middleware pipeline
  - broader remote approval/session action controls beyond the shipped `/daemon` visibility
  - deeper durable session recovery integration
  - default web hosting and web mutation UX beyond the read-only shell
  - remaining default/live vendor subscription and delivery semantics after the shipped Phase 113-225 host-owned foundations: broader real host upload/download delivery worker execution beyond the opt-in foreground factory and manual retry closeout/closure/audit/retry-ledger entry persistence, preflight, readiness-planning, operator-handoff, operator-handoff-preflight, worker-selection intent, handler-readiness, invocation-handoff, invocation-handoff-preflight, worker execution-plan context, execution-plan-preflight context, trusted foreground worker execution, non-persistent worker execution receipt, supplied execution-receipt preflight, receipt-preflight-bound closeout readiness, supplied closeout-preflight, and closeout-preflight-bound record-plan boundaries, retry backoff persistence, broader Discord live-delivery UX, and channel-specific delivery runtime semantics

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

1. Phase 2 memory polish only when concrete retrieval precision or inspection gaps are discovered.
2. Remaining channel/live-delivery depth after the shipped Phase 113-225 host-owned foundations and beyond opt-in closeout/closure/audit/retry-ledger entry persistence, preflight, readiness-planning, operator-handoff, operator-handoff-preflight, worker-selection intent, handler-readiness, invocation-handoff, invocation-handoff-preflight, worker execution-plan context, execution-plan-preflight context, trusted foreground worker execution, non-persistent worker execution receipt, supplied execution-receipt preflight, receipt-preflight-bound closeout readiness, supplied closeout-preflight, and closeout-preflight-bound record-plan boundaries.
3. Richer swarm visualization and production hardening beyond the shipped Launch Alpha 0 real planner/worker/reviewer execution path.
4. Remote action-control and workflow automation hardening beyond the shipped daemon/client/control-plane foundation.
5. Phase 2 / Alpha 3 memory polish only when new concrete recall precision, transcript truth, inspection, or recovery gaps are discovered.
6. Release-grade doctor, onboarding, and packaging.
