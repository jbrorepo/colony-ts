# The Colony - Full Market Gap Analysis

Last Updated: 2026-05-08

This analysis compares the current `colony-ts/` runtime against the local read-only references and the current coding-agent market. It is intentionally product-level and implementation-level: the goal is to identify exactly what is already strong, what is partially present, and what still needs to be closed before Colony can claim best-of-all-worlds parity.

## Scope

Local evidence was gathered from:

- `colony-ts/` active TypeScript project, currently Phase 189.
- `claude-code-main/` as the terminal-agent/product UX benchmark.
- `openclaw-main/` as the remote daemon, channel, web, mobile, and control-plane benchmark.
- `mempalace-develop/`, `skills-main/`, `superpowers-main/`, `autoresearch-master/`, and `the-colony/` as targeted behavioral and process references.

Market evidence was checked against current public docs for:

- OpenAI Codex: `https://developers.openai.com/codex/cloud`
- GitHub Copilot cloud agent: `https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/create-a-pr`
- Cursor background agents: `https://docs.cursor.com/en/background-agents`
- Google Gemini CLI: `https://github.com/google-gemini/gemini-cli`
- Devin: `https://docs.devin.ai/get-started/devin-intro`
- Aider: `https://github.com/Aider-AI/aider`
- Continue: `https://docs.continue.dev/customize/custom-providers`
- Windsurf Cascade: `https://docs.windsurf.com/windsurf/cascade/cascade`
- JetBrains Junie: `https://www.jetbrains.com/help/ai-assistant/junie-agent.html`
- Sourcegraph Cody: `https://sourcegraph.com/docs/cody`
- OpenCode: `https://opencode.ai/`

## Executive Read

Colony is no longer just a prototype. It has a real local-first coding-agent runtime with security policy, provider abstraction, memory, workflows, MCP/plugin foundations, daemon primitives, channel skeletons, and a working swarm/coordinator path.

The main gap is productization and breadth. Claude Code, OpenClaw, Codex, Copilot, Cursor, Devin, and IDE agents compete on surfaces, integrations, tool breadth, background execution, review handoff, and operator experience. Colony has stronger design discipline and a stricter security posture in several areas, but it still lacks the breadth and polish that make the market leaders feel complete.

The highest-leverage conclusion is:

1. Colony should not chase every long-tail command or adapter immediately.
2. Colony should first close capability classes that unlock compounding work: tool inventory, live plugin lifecycle, memory controls, external channel semantics, durable swarm/workflow runs, and one web/remote operator surface.
3. Colony should preserve its differentiators: local-first execution, conservative approvals, caste/swarm model, MemPalace, exact transcript truth, skills discipline, and dependency-light TypeScript security logic.

## Current Colony Baseline

Current shipped baseline:

- Phase 189 is the active verification frontier.
- `verify:all` runs `verify:phase1` through `verify:phase189` plus `tsc --noEmit`.
- Phase 189 verifies handler-readiness-preflight-bound worker invocation handoff truth for external media transfer retry control: handoffs require current handler-readiness preflight truth, record host execution as required but not attempted, reject tampered/contaminated handoffs, and still create no retry worker, retry schedule, background retry, credential persistence, default live delivery, public hosting, automatic vendor retry, or handler execution.
- Phase 188 verifies branded host-supplied foreground manual reinvoke handler-readiness truth for external media transfer retry control: readiness must be derived from the current trusted worker-selection preflight plus a branded host manual reinvoke handler capability, rejects missing/unbranded/tampered/contaminated readiness, persists no handler identity or registry id, and still creates no retry worker, retry schedule, background retry, credential persistence, default live delivery, public hosting, or handler execution.
- Phase 187 verifies retry-control worker-selection intent truth: trusted retry-control operator handoff can declare a host-owned foreground manual reinvoke worker-selection descriptor for operator-owned retry handling while keeping worker creation, execution, schedules, background retries, credential persistence, public hosting, and default live delivery false.
- Phase 116 verifies duplicate Slack event retry dedupe at the channel session bridge route boundary: repeated signed and host-authenticated Slack `message` or `app_mention` callbacks with the same normalized inbound message id receive a bounded 202 duplicate ACK, do not increment route message count, do not dispatch the session runner again, and do not send a second adapter reply, without credential, listener, public-hosting, upload, retry-worker, persistence, or default-live-delivery claims.
- Phase 115 verifies Slack `app_mention` as an approval-bound alternative Events API subscription and inbound event shape: mention-only setup requires `app_mentions:read`, keeps mixed Slack event subscriptions rejected, patches only `app_mention` bot events, and signed plus host-authenticated mention callbacks use the existing deferred ACK bridge path without credential, listener, public-hosting, upload, retry-worker, or default-live-delivery claims.
- Phase 114 verifies Slack `event_callback` deferred ACK: signed and host-authenticated Slack message events are accepted into the existing channel/session bridge and return 202 before runner/reply completion, no adapter reply is emitted before ACK, asynchronous replies preserve Slack thread routing, and signature/auth failures plus `url_verification` remain fail-closed or handshake-only without credential, listener, public-hosting, upload, retry-worker, or default-live-delivery claims. Phase 113 verifies Slack subscription activation readiness: approved host-owned Slack setup preflights the full manifest for the required `channels:history` bot scope before fetch, renders required/missing scope readiness in `/channels external`, and reports success-only activation-readiness plus remaining operator steps after `apps.manifest.update` without claiming live delivery, public hosting, credential persistence, listener startup, uploads/media, retry workers, or schedules. Phase 112 verifies signed Discord `APPLICATION_COMMAND` inbound dispatch through the host-owned external webhook transport, including signature-before-parse ordering, host auth, bridge acceptance, deferred ACK `{ "type": 5 }` without unmatched adapter replies, fail-closed malformed command handling, PING/message regressions, and no token/secret leakage. Phase 111 verifies Discord command response definition integrity for the host-owned Discord guild command executor: returned command definitions must match approved names, descriptions, and chat-input type before command mutation success is reported; mismatches are non-retryable and expose no command mutation success, retry worker/schedule, or secret leakage. Phase 110 verifies optional Slack manifest echo integrity for host-owned Slack manifest updates: returned manifest echoes must match the approved Events API request URL and bot events, mismatches are non-retryable, omitted manifest echoes remain compatible, and no mutation-success, retry worker/schedule, or secret leakage is reported on mismatch. Phase 109 verifies Slack response identity binding for the host-owned Slack manifest update executor: required approved `app_id` matching, optional workspace/team matching when returned, non-retryable mismatch failure, no mutation-success reporting on mismatch, and no retry worker/schedule or secret leakage. Phase 108 verifies Slack subscription setup handoff/checklist UX: redacted host handoff steps, default manual operator reinvoke retry mode, optional bounded foreground retry mode, max two foreground attempts, planned host manifest-submission wording, no submitted-before-execution overclaim, no credential leakage, and unchanged credential-free gateway action shape with no retry worker/schedule or default live delivery. Phase 107 verifies host-owned Discord guild application-command registration: approved private candidates can bulk-overwrite one to five approval-bound chat-input guild commands through one injected Discord API call, validate command definitions before fetch, reject post-approval command mutation, verify returned command names, and Phase111 extends response integrity to descriptions and type; preserve the Phase 104 endpoint mutation as the default Discord setup mode, and create no Discord apps, credential persistence, endpoint mutation in command mode, listener startup, public hosting, upload/media path, retry worker, privileged Gateway intents, or default live delivery. Phase 106 verifies opt-in bounded foreground Slack retry: approved host-owned Slack setup can retry one retryable fetch/429/5xx failure once inside the same injected host call, reports `bounded_foreground_retry` attempt metadata, clamps requested attempts to two, preserves Phase 105 manual-only default behavior, blocks fetch before approval, skips non-retryable Slack retries, leaves Discord/gateway action shape unchanged, and creates no background worker, retry schedule, credential persistence, manifest persistence, approval-signature persistence, public hosting, upload/media path, or default live delivery. Phase 105 verifies Slack subscription manual retry UX metadata: retryable Slack setup failures expose redacted `manual_operator_reinvoke` guidance, bounded `Retry-After` seconds when available, and stable retry reasons while performing no automatic retry, worker, schedule, credential persistence, manifest persistence, approval-signature persistence, Discord behavior change, or default live delivery. Phase 104 verifies host-owned Discord Interactions endpoint mutation: approved private Discord candidates with an approval-bound bot token perform one injected Discord Edit Current Application `PATCH /applications/@me` call with body `{ interactions_endpoint_url }`, verify returned application id and endpoint URL, fail closed on missing/ambiguous/pending/mutated host inputs and malformed/oversized/API responses, redact token/API failures, classify retryability without retry workers, and do not create Discord apps, register slash commands, persist credentials, start listeners, provide public hosting, upload media, enable privileged Gateway intents, mutate Slack setup, or enable default live inbound delivery. Phase 103 verifies signed Discord Interactions PING/PONG readiness: injected vendor signature verification is required, Discord `type: 1` returns only `{ "type": 1 }`, host auth and bridge dispatch are bypassed only for that handshake, and malformed/rejected requests fail closed with redaction. Phase 102 verifies host-owned Slack subscription direct mutation: one injected Slack `apps.manifest.update` call from an approved private candidate with host-supplied full manifest/token, bounded event-subscription patching, redacted fail-closed host inputs and Slack API failures, retryable classification without retry workers, and no Slack app creation, credential persistence, listener startup, public hosting, uploads, Discord-side setup, or default live inbound delivery. Phase 101 verifies approval-gated Discord Interactions setup request staging: exact approval binds Discord application id, guild id, public callback URL, public-key reference, enabled intent, and `PING`/`APPLICATION_COMMAND`; `/channels external subscribe discord <approval-signature>` emits a credential-free host action; and the gateway does not create Discord apps, register interaction endpoints or slash commands directly, persist credentials, start listeners, provide public hosting, upload media, run retries, enable privileged Gateway intents, or enable default live inbound delivery. Phase 100 verifies approval-gated Slack subscription setup planning and gateway request staging: exact approval binds Slack app id, workspace id, public callback URL, signing-secret reference, enabled intent, and `message.channels`; `/channels external subscribe slack <approval-signature>` emits a credential-free host action; and the gateway does not create Slack apps, register subscriptions directly, persist credentials, start listeners, provide public hosting, upload media, run retries, perform direct Discord API/app/endpoint setup, or enable default live inbound delivery. Phase 99 verifies signed Slack Events API `url_verification` challenge handling after vendor signature verification: the transport returns only the challenge, bypasses Colony host auth and session bridge dispatch only for the handshake, fails closed on missing/rejected verifier or malformed challenge, does not special-case non-Slack channels, and preserves host-auth/bridge requirements for normal Slack `event_callback` delivery. Phase 98 verifies Telegram-only host-owned webhook setup with exact approval signatures, credential-free `/channels external webhook telegram <approval-signature>` host actions, one injected Telegram `setWebhook` call, bounded redacted API failure handling, and real `X-Telegram-Bot-Api-Secret-Token` host-auth compatibility without listener startup, credential persistence, auth mutation, adapter registration, public hosting, uploads, retry workers, Slack setup or direct Discord API/app/endpoint setup. Phase 97 verifies host-owned external vendor webhook transport with injected signature verification, host auth proof, redacted HTTP responses, and local listener smoke coverage without vendor webhook registration/subscription setup, credential setup, upload, retry worker, or default public hosting. Phase 96 verifies host-owned external vendor event dispatch through an injected session bridge and host auth policy, with Slack/Discord thread routing, Telegram topic routing, runner-failure inspection, credential/text redaction, and no listener/subscription/credential/webhook/upload/retry setup by the dispatcher; reply delivery remains delegated to the injected bridge/registry. Phase 95 verifies host-owned execution of accepted external registration actions without credential/signature leakage, vendor API calls, listener startup, or subscription setup. Phase 94 verifies the `/channels external register <channel> <approval-signature>` host-action boundary: only accepted plans with matching exact approval signatures emit credential-free host actions, and the gateway still performs no live adapter registration, credential enabling, listener startup, or vendor API calls. Phase 93 verifies `/channels external` visibility and pure Slack/Discord/Telegram event normalization helpers: redacted external registration/config gate rendering, local text-event mapping into the generic inbound body shape, malformed/unsupported event fail-closed behavior, and no default live adapter registration, credentials, vendor subscriptions, uploads, retries, or live inbound vendor delivery. Phase 92 verifies explicit external adapter registration/config gates and vendor inbound signature helpers: exact approval signatures before Slack/Discord/Telegram registration, explicit enabled intent, safe API base validation, raw-body HTTP signature hook, Slack HMAC, Telegram secret-token, and Discord fail-closed injected-verifier semantics. Phase 91 verifies first outbound Slack/Discord/Telegram adapter classes with injected raw `fetch`, platform route mapping, credential/query redaction in status/delivery/error surfaces, and proof that contract fixtures still do not auto-register vendor adapters. Phase 90 verifies the local-first GitHub PR handoff workflow with dry-run issue intake, deterministic branch/worktree naming, credential redaction, approval-gated local workspace creation, implementation and verification ordering, failed-verification blocking before PR handoff, second approval before PR creation handoff, and daemon workflow-template exposure. Phase 89 verifies the read-only Web Control Shell with fail-closed dedicated `web.read` bearer scope, GET-only HTML and JSON state routes, mutation rejection, projected daemon/workflow/swarm/channel status state, no arbitrary metadata exposure, no forms, no mutation endpoints, cache-safe JSON headers, query credential redaction, and transcript/message/content/tool-output body redaction. Phase 88 verifies contract-only Slack/Discord/Telegram-style channel adapter fixtures, route semantics, auth/redaction/retry/attachment/reaction/mention/threading truth, fail-closed malformed fixture validation, `/channels contracts` visibility, and no default vendor adapter registration. Phase 87 verifies durable swarm run snapshots with restart-safe load/status/cancel truth, worker/task/result/failure/artifact/approval metadata preservation, and malformed journal fail-closed loading. Phase 86 verifies plugin package live catalog promotion with second-approval promotion from staged candidates into live-disabled metadata, metadata-only rollback records, namespace/catalog isolation, malformed candidate rejection, durable live catalog fail-closed loading/appending, redaction, and no package install/update, package execution, sidecar start, registry fetch, or activation path. Phase 85 verifies MCP `resources/list` and `resources/read` with protocol/client/server/resource-adapter support, strict resource result-shape validation, guarded resource URI allowlists, trusted stdio/HTTP/plugin resource policy signing/audit visibility, resource-aware package planning, and operator metadata without routing resources through tool execution. Phase 84 verifies policy-gated `web_fetch` and `web_search` with approval-required open-world metadata, HTTPS-only network policy, DNS/private-host SSRF rejection, redirect-disabled fetches, text-only response handling, size bounds, timeout/abort wiring, redaction, untrusted-content wrapping, and prompt-injection signal reporting. Phase 83 verifies safe local tool breadth for `glob_find`, structured `git_status`, bounded/redacted `git_diff`, and approval-gated package `test_runner`/`lint_runner` wrappers. Phase 82 verifies typed tool metadata contracts for normalized defaults, builtin read-only/destructive/concurrency/progress/transcript/search/persisted-result truth, metadata-derived runtime categories, MCP annotations, and `/tools` operator rendering. Phase 81 verifies `/memory plan` recall-control previews for exact/derived enablement, MemPalace distance threshold labels, graph-hop bounds, sanitized hall/wing/room/source filter controls, derived-only palace-search boundaries, and body-safe precision diagnostics. Phase 80 verifies approval-gated plugin package catalog staging only.
- There are 190 verification scripts because `phase19a` is an extra gate in addition to phases 1-189.

Strong current areas:

- Real `AgentLoop` wired into the Ink UI.
- Provider stack for Ollama, Anthropic, OpenAI-compatible APIs, and Gemini through raw `fetch()`.
- Conservative tool/security foundation: permissions, bash validation, path validation, policy, secret scanning, vault, redaction, audit trail.
- Memory stack with exact transcript truth, compact artifacts, structured extraction, hybrid recall, query-intent ranking, MemPalace store/layers/graph foundations.
- Workflow engine with DAG validation, checkpoints, artifacts, approval pauses, retries, budget policy, runtime runner, AgentLoop task adapter, templates, and automation controller.
- Multi-agent foundation with caste-aware worker registry, coordinator queues, messaging, fan-out/fan-in, cancellation, policy propagation, and `/swarm` start/status/cancel.
- MCP/plugin foundation with in-process server/client, guarded transport, stdio transport, HTTP transport, trusted sidecar config, managed sidecar lifecycle, supervisor foundation, dry-run package discovery/import planner, durable redacted plan event journal, and approval-gated staged catalog records.
- Daemon/channel foundations: scoped daemon auth, HTTP daemon transport, session create/list/inspect/close, workflow automation delegation, channel registry, webhook auth, local webhook listener, inbound normalization, pairing/auth, in-memory adapter, session bridge, `/daemon`, `/channels` visibility, contract fixtures, first outbound Slack/Discord/Telegram adapter classes, approval-gated adapter registration helpers, vendor inbound signature verification helpers, `/channels external` visibility, pure vendor event normalization helpers, and a credential-free host registration action boundary.

Material current weaknesses:

- Built-in tool breadth now covers shell execution, file read/write/list/edit, grep search, glob discovery, structured git status/diff, approval-gated test/lint package-script wrappers, and approval-gated web fetch/search. MCP resource list/read is now available at the MCP layer; richer IDE/code-intelligence tools remain open.
- A minimal read-only web control shell foundation now exists, but default hosting, richer browser UX, and mutation-safe approval/control flows remain open.
- No OS service installer/lifecycle.
- First outbound Slack/Discord/Telegram adapter classes, approval-gated registration/signature helpers, `/channels external` visibility, pure vendor event normalization helpers, host-owned setup/mutation/dispatch/deferred-ACK foundations, bounded duplicate retry suppression, media-transfer closeout/audit-ledger planning and persistence, retry-control handoff/preflight truth, worker-selection intent, branded host-supplied foreground manual reinvoke handler-readiness, and handler-readiness-bound invocation handoff truth exist, but live setup depth beyond the Phase 113-189 host-owned channel foundations, broader Discord live-delivery UX beyond Phase 112 host-owned `APPLICATION_COMMAND` dispatch and the Phase 107 guild command executor, default public hosting, default live inbound delivery, uploads/media execution, richer retries, WhatsApp/Teams-style adapters, privileged Gateway intents, broader slash-command lifecycle/UX, and voice remain open.
- No mobile/desktop companion app layer.
- No node/device bridge.
- Plugin packages are intentionally staging-only.
- Swarm runs now have durable restart-safe snapshot/load/cancel truth; live worker execution replay/resume and product-grade visualization still remain open.
- Memory still needs runtime-enforced recall-control overrides and deeper extraction lifecycle handling, after Phase 81 added body-safe `/memory plan` recall-control and precision-diagnostic previews.
- IDE/editor integration is not yet a product surface.
- Cloud/background PR workflow is not yet a product surface.

## Capability Matrix

Status meanings:

- Strong: usable foundation with meaningful verification.
- Partial: implemented in a limited form or missing product-grade breadth.
- Missing: no meaningful Colony-native implementation yet.
- Differentiator: Colony is ahead in direction or architecture, even if polish remains.

| Capability | Colony now | Claude Code reference | OpenClaw reference | Market leaders | Gap to close |
| --- | --- | --- | --- | --- | --- |
| Local terminal agent | Strong | Strong | Medium | Gemini CLI, Aider, Codex CLI, OpenCode | More command depth, tool UX metadata, startup/onboarding polish. |
| Safe tool execution | Strong but narrow | Strong and broad | Medium | Cursor, Gemini CLI, Junie, Aider | Broaden safe read/write/web/LSP/notebook/MCP tools without weakening approvals. |
| Tool UX metadata | Partial | Strong | Medium | Cursor, Windsurf, Junie | Per-tool read-only/destructive/concurrency markers, progress rendering, grouped output, richer error display, deferred loading. |
| Code edit/test loop | Partial | Strong | Medium | Aider, Cursor, Devin, Codex, Copilot | First-class lint/test loop tools, change summaries, repair loops, failure triage templates. |
| Command catalog | Partial | Strong | Medium | Claude Code, Gemini CLI, Codex CLI | More operator commands for diff/review/commit/config/MCP/plugins/tasks/agents/remote. |
| Memory architecture | Differentiator but incomplete | Medium | Medium | Cursor/Windsurf memories, Copilot memory, Codex memories | Finish MemPalace operator controls, raw-vs-derived toggles, graph traversal, temporal facts, invalidation. |
| Skills/process | Partial | Strong | Low/Medium | Codex skills, Cursor plugins/skills, Windsurf skills | Runtime-enforced skill trigger decisions, checklist telemetry, richer skill frontmatter. |
| Workflow engine | Strong foundation | Strong | Medium | Devin playbooks, Codex workflows, Windsurf workflows | Remote approval UX, resumability hardening, experiment loops, failure injection. |
| Multi-agent/swarm | Strong foundation | Strong | Strong | Codex parallel agents, Cursor background agents, Devin parallel tasks | Visual run tree, agent definition/catalog UX, live execution resume/retry, production hardening beyond durable snapshot truth. |
| MCP lifecycle | Partial | Strong | Medium | Cursor, Gemini CLI, Continue, Codex | Registry integration, OAuth/IDP flows, enable/disable/reconnect UI, resource browsing. |
| Plugin marketplace/fabric | Partial/staging-only | Strong | Strong | Cursor plugins, Codex plugins, OpenClaw packages | Approved live promotion, install/update controls, dependency validation, rollback, sidecar startup from package declarations. |
| Daemon/control plane | Partial | Strong | Strong | Codex app server, OpenClaw gateway | Session recovery, runtime controls, web socket/event stream, web client. |
| External channels | Partial skeleton + contract fixtures + first outbound Slack/Discord/Telegram adapter classes + approval/signature helpers + `/channels external` visibility + pure vendor event normalization helpers + host-owned setup/mutation/dispatch/deferred-ACK foundations + bounded duplicate retry suppression + media-transfer closeout/audit-ledger planning and persistence + retry-control handoff/preflight truth + worker-selection intent + branded host-supplied foreground manual reinvoke handler-readiness + handler-readiness-bound invocation handoff truth | Medium | Strong | Codex Slack/Linear, Cursor Slack/web/mobile, Devin Slack/Jira/Linear | Live setup depth beyond the Phase 113-189 host-owned channel foundations, broader Discord live-delivery UX beyond Phase 112 host-owned `APPLICATION_COMMAND` dispatch and the Phase 107 guild command executor, upload/retry implementations, default public hosting, default live inbound delivery, channel permissions, live credential setup UX, privileged Gateway intents, broader slash-command lifecycle/UX, and voice surface. |
| Web/mobile remote work | Missing/Partial | Strong | Strong | Codex web, Cursor web/mobile, Devin web, Copilot agents page | Browser control UI, mobile-friendly run review, remote approvals and diffs. |
| IDE integration | Missing | Strong | Low/Medium | Cursor, Copilot, Cody, Continue, Junie, Windsurf | VS Code/JetBrains extension or minimal bridge, editor selection context, diagnostics, inline diff apply. |
| Cloud/background PR agent | Missing | Strong | Medium | Codex, Copilot, Cursor, Devin | GitHub issue/PR delegation, isolated worktrees/environments, push PR, review handoff. |
| Release/onboarding | Partial | Strong | Strong | Market products | Installer, doctor, configuration migration, env setup, auth UX, update path, docs truth gate. |
| Observability/evals | Partial | Strong | Medium | Devin session insights, Codex eval/workflows, Sourcegraph context | Run metrics, acceptance criteria, artifact ledger, success/failure dashboards. |

## Track A - Claude-Code-Class Parity

Claude Code's local reference shows a mature terminal product, not merely a model loop.

What Claude Code has that Colony should copy in Colony-native form:

- Broad command registry that unifies built-ins, plugin commands, workflow commands, skill commands, and MCP skills.
- Large tool inventory across shell, files, grep/glob, web fetch/search, notebook editing, todo/task tools, agent/team tools, LSP, MCP resources, cron, remote triggers, REPL, planning/worktree tools, and deferred tool search.
- Rich tool metadata and UX: read-only/destructive flags, concurrency safety, interrupt behavior, permission rendering, progress rendering, grouped output, error rendering, transcript extraction, and max persisted result sizing.
- Mature permission queue and hook flow with persistent permission updates.
- MCP management UI and lifecycle: reconnect, enable, disable, registry, OAuth/IDP support, connection state, channel permissions.
- Plugin marketplace and package lifecycle: browse, install, validate, blocklist, dependency resolution, autoupdate, command/agent/hook/output-style loading, MCP plugin integration.
- Skills as runtime artifacts, with frontmatter such as allowed tools, model, effort, hooks, path filters, fork context, and agent binding.
- Multi-agent task runtime with built-in/user/project/plugin agents, agent editor/wizard, local and remote task types, continuation messaging, and worker reuse guidance.
- Rich Ink/UI components for permissions, MCP, memory, tasks, agents, diffs, prompt input, settings, sandbox, help, keybindings, themes, vim, desktop/mobile/voice handoff.

Where Colony already stands well:

- Core runtime and slash routing are real.
- Security posture is stricter and cleaner in several places.
- Memory architecture is more ambitious than Claude Code's editable/session memory path.
- MCP transport hardening is credible.
- Skill lifecycle controls are safer than simple disk discovery.
- Swarm foundation is credible.

Claude-Code-class gaps to close:

1. Broaden built-in tool inventory.
2. Add richer `ToolDefinition` metadata and operator rendering semantics.
3. Build MCP lifecycle UX beyond low-level transport primitives.
4. Promote plugin packages from staged/inactive records to audited live runtime artifacts.
5. Add plugin marketplace/registry fetch after live promotion and rollback are safe.
6. Expand command surface for diff/review/commit/config/MCP/plugins/tasks/agents/remote workflows.
7. Make skills first-class runtime decisions, not just prompt instructions and catalog entries.
8. Expand swarm/task execution from durable restart-safe snapshot truth to live resume/retry and richer continuation UX.
9. Improve onboarding, doctor, terminal compatibility, update, and release-gate flows.

## Track B - OpenClaw-Class Parity

OpenClaw is the benchmark for multi-surface delivery: gateway, daemon, control UI, channels, mobile/desktop apps, remote nodes, and plugin/channel package surfaces.

What OpenClaw has that Colony should copy in Colony-native form:

- JSON-RPC/WebSocket/HTTP gateway with method routing, auth scopes, health, sessions, nodes, channels, config, models, tools, cron, approvals, usage, web, and setup wizard surfaces.
- Persistent session/runtime manager with runtime cache, session init/status/turn execution, actor queue, idle eviction, runtime controls, mode/config mutation, and identity reconciliation.
- OS service lifecycle across launchd, systemd, and Windows scheduled tasks.
- First-class channel plugin contract with config, setup, auth, pairing, outbound, status, lifecycle, threading, streaming, directory, message actions, heartbeat, gateway methods, and channel-owned tools.
- Channel adapter contracts for Slack, Discord, Telegram, WhatsApp, Signal, iMessage, Microsoft Teams, and related catalog/package flows.
- Browser control UI for sessions, channels, agents, nodes, config, usage, logs, approvals.
- Android/iOS/macOS companion apps with gateway discovery, pairing, voice, camera/location/device tools, push approvals.
- Remote node/device bridge with node pairing, node invocation, APNs wake/reconnect, pending actions, and capability tokens.
- Plugin registry able to register tools, hooks, routes, providers, channels, harnesses, CLI backends, services, gateway methods, node-host commands, memory providers, context engines, and compaction providers.

Where Colony already stands well:

- Typed daemon control-plane and HTTP transport exist.
- Scoped daemon auth exists.
- `/daemon` gives operator visibility.
- Channel registry, pairing/auth, webhook transport, inbound normalization, memory adapter, and session bridge exist.
- `/channels` gives operator visibility.
- MCP/plugin sidecar and package staging foundations exist.
- Workflow daemon delegation exists.

OpenClaw-class gaps to close:

1. Build a web control UI over daemon/channel/workflow/swarm state.
2. Add OS daemon installer and lifecycle for Windows, Linux, and macOS.
3. Add live setup depth beyond the Phase 113-189 host-owned channel foundations, broader Discord live-delivery UX beyond Phase 112 host-owned `APPLICATION_COMMAND` dispatch and the Phase 107 guild command executor, default public hosting, default live inbound delivery, uploads/media execution, privileged Gateway intents, broader slash-command lifecycle/UX, and retry workers.
4. Deepen channel semantics: threading, mentions, reactions, attachments, account status, channel permissions, setup wizard, uploads/media, retries, and voice.
5. Add remote session recovery and runtime control semantics.
6. Add node/device bridge only after web/channel/control-plane foundations are stable.
7. Add mobile/desktop companion surfaces later; do not start here before web/channel maturity.
8. Expand plugin fabric from MCP sidecars to broader app/channel/tool/runtime extension points.

## Track C - Memory, Skills, Superpowers, Autoresearch

These references define what Colony should be uniquely good at.

MemPalace gaps:

- Finish layered recall contracts: L0 identity, L1 always-loaded essentials, L2 on-demand memory, L3 deep semantic search.
- Preserve raw/verbatim-first retrieval as the trust anchor.
- Add operator controls for raw-only vs derived recall, distance thresholds, graph hops, room/wing filters, source type filters, and precision diagnostics.
- Add graph inspection commands for rooms, tunnels, cross-wing links, fuzzy suggestions, and graph stats.
- Improve extraction lifecycle: entity identity, temporal facts, contradiction handling, invalidation, ownership, and confidence.

Skills/Superpowers gaps:

- Treat skills as runtime control artifacts with trigger decisions, checklist execution, audit trail, and verification state.
- Support richer skill frontmatter and path filters while keeping staged/live safety controls.
- Add workflow primitives for TDD, systematic debugging, writing plans, requesting review, and verification-before-completion.
- Make process-skill compliance visible in workflow and AgentLoop telemetry.

Autoresearch gaps:

- Add a bounded experiment workflow template with baseline, metric extraction, edit budget, time budget, rollback/keep decision, artifact log, and immutable evaluation command.
- Run candidate attempts in isolated worktrees or equivalent workspace sandboxes.
- Store experiment outcomes as durable records, not only transcript summaries.

## Track D - Current Market Heavy Hitters

### OpenAI Codex

Current Codex is a major benchmark for background/cloud engineering work. The docs describe Codex as a coding agent that can read, edit, and run code, work in background cloud environments, run tasks in parallel, connect to GitHub, create pull requests, delegate from GitHub, and expose app, IDE, CLI, web, Slack, Linear, workflows, worktrees, local environments, AGENTS.md, MCP, plugins, skills, subagents, approvals, remote connections, GitHub Actions, SDK, and app server surfaces.

Colony gap:

- No cloud/background task surface.
- GitHub issue/PR delegation has a local-first workflow-template foundation, but no real GitHub issue fetch, branch/worktree execution, push, or remote PR creation yet.
- No web app for reviewing cloud tasks.
- No Slack/Linear integration.
- No Codex-style worktree/environment management UX.
- No SDK/app-server story for embedding Colony yet.

What Colony should adopt:

- Local-first equivalent of background tasks with isolated worktrees and durable run records.
- Real GitHub PR handoff execution after the Phase 90 local-first template: approved issue fetch, local branch/worktree execution, push, and PR creation.
- Worktree/environment templates for repeatable agent runs.

What Colony should not copy blindly:

- Internet-enabled background execution before prompt-injection and exfiltration boundaries are mature.
- Cloud-first assumptions that weaken local operator control.

### GitHub Copilot Cloud Agent

GitHub Copilot cloud agent competes on native GitHub workflow. It can be asked to create a pull request, work on tasks, push changes to the PR, and add the user as reviewer when finished. GitHub also exposes agents pages, VS Code monitoring, custom agents, hooks, MCP/cloud-agent docs, access management, third-party agents, memory, skills, and enterprise management surfaces.

Colony gap:

- No GitHub App or issue-assignee workflow.
- PR creation/review handoff is template-planned only; real remote PR creation is not shipped.
- No codehost-native status/progress surface.
- No enterprise admin controls around cloud agent access.

What Colony should adopt:

- A conservative GitHub integration execution slice beyond Phase 90: fetch issues, create branch/worktree locally, run implementation, run verification, and open PR only after explicit approval.
- PR status artifacts and reviewer handoff.
- Agent run comments that are audit-friendly and do not masquerade as human-authored text.

### Cursor

Cursor is strong on IDE-native foreground work and background agents. Public docs describe asynchronous remote agents that edit and run code in isolated environments, status/follow-ups/takeover, GitHub-backed branches, web/mobile agents, Slack triggers, an API supporting up to many active agents per key, tools for search/read/edit/run/MCP, and security notes around auto-running terminal commands.

Colony gap:

- No IDE-native experience.
- No background-agent sidebar equivalent.
- No web/mobile handoff.
- No API for managing many background agents.
- No integrated editor diagnostics or inline apply UX.

What Colony should adopt:

- A minimal IDE bridge or extension after the daemon/event API stabilizes.
- Background run records with follow-up prompts and takeover/resume.
- Explicit security warnings and per-run network/tool policy when auto-run is allowed.

### Devin

Devin competes as a web-based autonomous engineer. Its docs emphasize writing/running/testing code, handling Linear/Jira tickets, features, bug reports, app testing, migrations, refactors, PR review, codebase Q&A, tests, documentation, integrations, terminal access, computer use, video recordings, knowledge, skills, session insights, secrets/site cookies, playbooks, scheduled sessions, deployments, Slack, Teams, GitHub, GitLab, Bitbucket, Linear, and Jira.

Colony gap:

- No Jira/Linear intake.
- No autonomous ticket queue.
- No session insights dashboard.
- No deployment/test recording UX.
- No playbook/scheduled-session product layer beyond internal workflow automation.

What Colony should adopt:

- Workflow templates that look like ticket playbooks: intake, scope, implement, verify, review, handoff.
- Session insights from durable run data.
- Scheduled sessions only after workflow persistence and remote approval UX are hardened.

### Gemini CLI

Gemini CLI is a major terminal-first open-source benchmark. Its README advertises a terminal AI agent with large context, Google Search grounding, file operations, shell commands, web fetching, MCP support, custom commands, checkpointing, token caching, headless scripting, IDE integration, sandboxing/security, trusted folders, enterprise guide, telemetry, and GitHub Actions integration.

Colony gap:

- Built-in web fetch/search now exists behind explicit approval and conservative network policy; richer browser rendering, crawler depth, and provider-grade search remain open.
- No headless/non-interactive scripting product surface.
- No checkpointing UX at Gemini CLI parity.
- No GitHub Action integration.
- No packaged enterprise/trusted-folder setup.

What Colony should adopt:

- Broader safe built-in tools.
- Headless mode for repeatable automation.
- Checkpoint/resume commands tied to exact transcript truth and workflow artifacts.

### Aider

Aider is the strongest simple terminal pair-programming benchmark. Its README highlights repository mapping, broad language support, git integration, IDE use, image/web-page context, voice-to-code, and automatic lint/test after changes.

Colony gap:

- No repo-map style codebase index optimized for surgical edits.
- No automatic lint/test loop after every agent edit.
- No first-class git commit/diff/undo workflow.
- No image/web context ingestion in the local agent loop.
- No voice surface.

What Colony should adopt:

- Repo map/index as a tool and memory input.
- Explicit edit-test-repair loop tools.
- Git diff/commit/undo commands with conservative approval.

### Continue

Continue is important because it is open, IDE-native, context-provider oriented, and model-flexible. Its docs describe context providers as plugins, including files, code symbols, git diff, current file, terminal output, docs, open files, web, codebase snippets, folders, MCP servers, rules, prompts, and local/offline/self-hosted model paths.

Colony gap:

- No IDE context-provider ecosystem.
- No pluggable context providers independent of MCP tools.
- No VS Code/JetBrains extension.
- No local/offline setup guide at IDE-assistant maturity.

What Colony should adopt:

- A context-provider abstraction distinct from executable tools.
- Codebase/docs/diff/terminal context surfaces feeding AgentLoop and workflows.
- IDE extension later, backed by daemon APIs rather than duplicating runtime logic.

### Windsurf Cascade

Windsurf Cascade competes on polished agentic IDE UX. Its docs highlight Code/Chat modes, tool calling, voice input, checkpoints, real-time awareness, linter integration, web/docs search, memories/rules, MCP, terminal, workflows, app deploys, AGENTS.md, hooks, worktrees, planning, todo lists, and simultaneous cascades.

Colony gap:

- No IDE-native Code/Chat split.
- No real-time editor awareness.
- No linter-driven UX.
- No checkpoint/revert UI.
- No simultaneous run manager beyond terminal/swarm commands.

What Colony should adopt:

- Checkpoint/revert semantics over workflow and memory artifacts.
- Todo/task visualization for long-running work.
- Linter/test feedback as structured events.

### JetBrains Junie

Junie matters because it exposes agent controls in a mature IDE. Docs describe approval for bash/file/external tools by default, rollback at file or checkpoint granularity, Brave mode, deeper reasoning mode, and action allowlists.

Colony gap:

- No IDE-native rollback UI.
- No action allowlist management UI.
- No per-run reasoning-depth mode exposed to operators.
- No checkpoint rollback UX.

What Colony should adopt:

- Action allowlist management in `/permissions`, daemon, and later web UI.
- Checkpoint rollback for workflow runs and file edits.
- Per-run reasoning/effort policy where providers support it.

### Sourcegraph Cody

Cody remains relevant for enterprise codebase context. Docs describe VS Code, JetBrains, Visual Studio, web, and CLI surfaces, plus Sourcegraph code search context across local and remote codebases, prompts, auto-edit, debugging, and context filters.

Colony gap:

- No enterprise-scale code search/index integration.
- No context filters for repo/org boundaries.
- No codehost/search-backed context layer.

What Colony should adopt:

- Context filters and source visibility rules before large-scale indexing.
- Code search provider interface that can later target local indexes, ripgrep, Sourcegraph, or other systems.

### OpenCode

OpenCode is relevant as an open-source terminal, IDE, and desktop coding-agent benchmark. Its public site emphasizes LSP loading, multi-session parallel agents, shareable sessions, Copilot and ChatGPT account login, broad provider support through Models.dev, local-model support, and privacy-sensitive operation that does not store code or context data.

Colony gap:

- No desktop app or IDE extension surface.
- No LSP-backed tool/context loading yet.
- No shareable session links or session export handoff.
- No broad provider marketplace/account bridge beyond the current provider manager.

What Colony should adopt:

- LSP diagnostics and symbol context as safe read-only tools.
- Multi-session/session-share concepts after daemon/web control surfaces exist.
- Provider flexibility without adding vendor SDK dependencies.

## Cross-Product Gap Ranking

### P0 - Close Next

These should remain the highest-priority slices because they unlock multiple tracks at once.

1. Broader safe tool inventory.
   - Phase 83 ships `glob_find`, structured git diff/status, and test/lint runner wrappers.
   - Phase 84 ships policy-gated `web_fetch` and `web_search`.
   - Remaining breadth: read-only LSP diagnostics and task/todo tools.
   - Keep destructive execution behind current conservative approval defaults.

2. Tool metadata and rendering upgrade.
   - Shipped in Phase 82 for builtin tools, MCP annotations, runtime category derivation, and `/tools` operator rendering.
   - Remaining work is to use this contract as the safety base for broader tool inventory and future auto-run policy refinements.

3. Live plugin catalog promotion boundary.
   - Convert staged plugin package records into approved live metadata without installing or executing package code yet.
   - Add second approval, event journal, rollback, disabled-by-default activation state, and operator inspection.

4. Memory operator controls.
   - Add raw-only/derived toggles, threshold controls, graph hop controls, room/wing/source filters, and precision diagnostics.
   - This preserves Colony's memory differentiator.

5. Swarm/workflow persistence.
   - Phase 87 ships durable swarm snapshots for run trees, worker assignments, artifacts, cancellations, approvals, and restart-safe status/cancel truth.
   - Remaining work is live execution resume/retry and richer background-agent UX.

6. Channel adapter contract tests.
   - Shipped in Phase 88 with Slack/Discord/Telegram-style contract-only fixtures for threading, mentions, attachments, reactions, retries, auth, redaction, and route semantics.
    - First outbound Slack/Discord/Telegram adapter classes shipped in Phase 91 with injected raw `fetch`, route mapping, redacted status/delivery/errors, and no default registration. Phase 92 added explicit approval-gated registration helpers and inbound signature helpers. Phase 93 added `/channels external` visibility and pure vendor event normalization helpers. Phase 94 added a credential-free host-mediated registration action boundary. Phase 95 added host-owned execution of accepted registration actions against supplied registry/private candidate state. Phase 96 added host-owned dispatch from normalized Slack/Discord/Telegram text events into the injected channel session bridge behind host auth policy. Phase 97 added a host-owned external vendor webhook HTTP transport and local listener path for verified vendor-shaped events. Phase 98 added Telegram-only host-owned webhook setup with exact approval, a credential-free gateway action, one injected `setWebhook` call, and Telegram secret-token host-auth compatibility. Phase 99 added signed Slack URL verification challenge handling inside the existing webhook transport. Phase 100 added approval-gated Slack subscription setup request staging. Phase 101 added approval-gated Discord Interactions setup request staging. Phase 102 added a host-owned Slack `apps.manifest.update` executor. Phase 103 added signed Discord Interactions PING/PONG readiness. Phase 104 added a host-owned Discord endpoint-url mutation executor. Phase 105 added Slack manual retry UX metadata. Phase 106 added opt-in bounded foreground Slack retry. Phase 107 added host-owned Discord guild command registration. Phase 108 added Slack setup handoff checklist/retry-mode operator UX. Phase 109 added Slack response identity binding for the host-owned manifest update executor. Phase 110 added optional Slack manifest echo integrity. Phase 111 added Discord command response definition integrity for approved guild command definitions. Phase 112 added host-owned signed Discord `APPLICATION_COMMAND` inbound dispatch. Phase 113 added Slack required bot-scope preflight and success-only activation-readiness metadata for approved host-owned setup. Phases 114-189 extend the channel foundation through deferred ACK, mention-only dispatch, bounded duplicate retry suppression, media-transfer closeout/audit-ledger persistence and preflights, retry-control handoff/preflight truth, worker-selection intent, branded host-supplied foreground manual reinvoke handler-readiness, and handler-readiness-bound invocation handoff truth. Remaining work is live setup depth beyond the Phase 113-189 host-owned channel foundations, broader Discord live-delivery UX beyond Phase 112 host-owned `APPLICATION_COMMAND` dispatch and the Phase 107 guild command executor, default public hosting, default live inbound delivery, live credential setup UX, uploads/media execution, privileged Gateway intents, broader slash-command lifecycle/UX, and richer retries.

### P1 - Next Wave

1. Web control UI over daemon/channel/workflow/swarm state. Read-only foundation shipped in Phase 89; richer browser UX and mutation-safe approval/control flows remain open.
2. OS daemon service lifecycle for Windows first, then Linux/macOS.
3. MCP lifecycle UX: reconnect, enable, disable, inspect, OAuth/registry planning.
4. Real GitHub issue/PR execution beyond the Phase 90 local-first handoff template.
5. Bounded autonomous experiment workflow template.
6. Repo map/codebase index and context-provider abstraction.
7. Live setup depth beyond the Phase 113-189 host-owned channel foundations, broader Discord live-delivery UX beyond Phase 112 host-owned `APPLICATION_COMMAND` dispatch and the Phase 107 guild command executor, default public hosting, default live inbound delivery, uploads/media execution, privileged Gateway intents, broader slash-command lifecycle/UX, and retry workers.
8. Release doctor/onboarding/install/update hardening.

### P2 - Product Expansion

1. IDE extension or bridge.
2. Web/mobile run review and approval UX.
3. Cloud/background execution mode.
4. Jira/Linear intake.
5. Slack/Teams full integration.
6. Mobile/desktop companion apps.
7. Remote node/device bridge.
8. Enterprise admin, policy packs, team settings, usage dashboards.

## Best-of-All-Worlds Product Direction

The strongest Colony identity is not cloning one competitor. The winning shape is:

- Claude Code-grade terminal UX and tool/plugin depth.
- OpenClaw-grade remote daemon, channel, web, and device architecture.
- Codex/Cursor/Devin-grade background run and review handoff, but local-first by default.
- Aider/Gemini CLI/OpenCode-grade terminal simplicity, model flexibility, and fast edit-test loops.
- Continue/Cody-grade context-provider and codebase index extensibility.
- Windsurf/Junie-grade checkpoints, action allowlists, and operator rollback UX.
- Colony-native differentiators: caste model, swarm orchestration, MemPalace, exact transcript truth, Caveman compression boundaries, strict approvals, and skill-driven development discipline.

Antelligence is the launch-facing framework that ties this direction together. It presents Colony's best-of-all-worlds product direction as a superorganism operating model for enterprise product development: local signals, scouting/discovery, platform-as-nest, adaptive labor, evidence gates, immune-system assurance, knowledge circulation, and controlled scaling. The framework lives in [ANTELLIGENCE_PLAYBOOK.md](./ANTELLIGENCE_PLAYBOOK.md) with launch guardrails in [ANTELLIGENCE_LAUNCH_CHECKLIST.md](./ANTELLIGENCE_LAUNCH_CHECKLIST.md). It is a product strategy and adoption framework, not a claim that deferred cloud, mobile, IDE, enterprise admin, or live channel setup surfaces are already shipped.

## Ordered Backlog Slices

Recommended next executable slices:

1. `P0-Memory-Controls`: add MemPalace recall controls for raw/derived, thresholds, graph hops, filters, and diagnostics. Existing project priorities put Phase 2 memory polish first when concrete retrieval or inspection gaps are discovered; this analysis identifies those gaps.
2. `P0-Tool-Metadata`: shipped in Phase 82 with typed metadata contracts and operator/MCP visibility.
3. `P0-Tool-Breadth-1`: shipped in Phase 83 with safe `glob_find`, structured `git_status`, structured/redacted `git_diff`, and approval-gated test/lint runner wrappers.
4. `P0-Tool-Breadth-2`: shipped in Phase 84 with policy-gated `web_fetch` and `web_search`, redaction/externalization, conservative network policy, untrusted-content wrapping, and approval controls.
5. `P0-MCP-Resources`: shipped in Phase 85 with MCP resource list/read protocol support, guarded URI allowlists, trusted MCP resource policy signing, resource-aware package planning, strict result validation, and operator visibility.
6. `P0-Plugin-Live-Catalog`: shipped in Phase 86 with second-approval promotion from staged plugin package catalog candidates into live-disabled metadata records, metadata-only rollback, durable live catalog guards, and still no package code execution, sidecar startup, registry fetch, or activation path.
7. `P0-Swarm-Persistence`: shipped in Phase 87 with durable swarm run snapshots, restart-safe load/status/cancel truth, worker/task/result/failure/artifact/approval metadata preservation, and malformed journal fail-closed loading. Live execution resume/retry remains future hardening.
8. `P0-Channel-Contracts`: shipped in Phase 88 with contract-only Slack/Discord/Telegram-style fixtures, `/channels contracts`, route-key previews, fail-closed malformed/secret fixture validation, and no real vendor adapter registration.
9. `P1-Web-Control-Shell`: shipped in Phase 89 with fail-closed dedicated `web.read` auth, GET-only HTML and JSON state routes, projected daemon/workflow/swarm/channel status state, no arbitrary metadata exposure, no mutation endpoints, no forms, and no default hosting.
10. `P1-GitHub-PR-Handoff`: shipped in Phase 90 with local-first dry-run issue intake, deterministic branch/worktree naming, verification gating, and explicit approvals before local workspace and PR handoff. Real GitHub fetch, branch/worktree execution, push, and remote PR creation remain future host-executed work behind explicit approvals.
11. First external outbound channel adapters: shipped in Phase 91 with Slack/Discord/Telegram adapter classes, injected raw `fetch`, route mapping, credential/query redaction, and no default registration.
12. External adapter approval/signature helper foundations: shipped in Phase 92 with exact approval signatures, explicit enabled intent, safe API base validation, raw-body HTTP signature hook, Slack HMAC, Telegram secret-token, and Discord fail-closed injected-verifier semantics.
13. External channel visibility and normalization helpers: shipped in Phase 93 with `/channels external`, redacted registration/config gate rendering, pure Slack/Discord/Telegram text-event normalization into generic inbound body shape, malformed/unsupported event fail-closed behavior, and no live vendor subscriptions or default adapter registration.
14. External registration request boundary: shipped in Phase 94 with `/channels external register <channel> <approval-signature>`, credential-free host-mediated registration actions for accepted plans, fail-closed pending/wrong/unknown requests, redacted operator output, and no gateway-side registration or vendor network calls.
15. External registration host execution: shipped in Phase 95 with host-owned execution against a supplied registry/private approved candidate set, fail-closed invalid host inputs, credential/signature redaction, and no vendor API calls, listener startup, or subscription setup.
16. External vendor event host dispatch: shipped in Phase 96 with normalized Slack/Discord/Telegram text events routed through an injected channel session bridge behind host auth policy, thread/topic preservation, runner-failure inspection, credential/text redaction, and no listener/subscription/credential/webhook/upload/retry setup by the dispatcher; reply delivery remains delegated to the injected bridge/registry.
17. External vendor webhook transport: shipped in Phase 97 with verified Slack/Discord/Telegram-shaped HTTP webhook handling, mandatory injected signature verifier and host auth proof, redacted response surfaces, and host-owned local listener smoke coverage without vendor webhook registration/subscription setup, credential setup, uploads, retry workers, or default public hosting.
18. Telegram webhook setup: shipped in Phase 98 with exact approval signatures, credential-free `/channels external webhook telegram <approval-signature>` host actions, one injected Telegram `setWebhook` call, bounded redacted API failure handling, and real `X-Telegram-Bot-Api-Secret-Token` host-auth compatibility without listener startup, credential persistence, auth mutation, adapter registration, public hosting, uploads, retry workers, Slack setup or direct Discord API/app/endpoint setup.
19. Slack URL verification handshake: shipped in Phase 99 with signed Slack `url_verification` challenge responses after vendor signature verification, no token leak, no host auth/bridge dispatch for the handshake, and preserved host-auth/bridge requirements for normal Slack events.
20. Slack subscription setup gate: shipped in Phase 100 with approval-gated planning, credential-free `/channels external subscribe slack <approval-signature>` host actions, and no Slack app creation, direct subscription registration, credential persistence, listener startup, public hosting, uploads, retries, direct Discord API/app/endpoint setup, or default live inbound delivery.
21. Discord Interactions setup gate: shipped in Phase 101 with approval-gated planning, credential-free `/channels external subscribe discord <approval-signature>` host actions, exact application/guild/callback/public-key-ref binding, bounded `PING`/`APPLICATION_COMMAND` allowlist, and no Discord app creation, direct interaction endpoint registration, slash-command registration, credential persistence, listener startup, public hosting, uploads, retries, privileged Gateway intents, or default live inbound delivery.
22. Slack manifest update executor: shipped in Phase 102 with one host-owned injected Slack `apps.manifest.update` call for approved private candidates, bounded manifest patching, redaction, and no Slack app creation, credential persistence, listener startup, public hosting, uploads, Discord-side setup, or default live inbound delivery.
23. Discord PING/PONG readiness: shipped in Phase 103 with signed Discord `type: 1` PING responses after injected verifier acceptance, handshake-only bypass of host auth/bridge dispatch, and no endpoint registration, app creation, credentials, listener startup, retries, privileged Gateway intents, or default live inbound delivery.
24. Discord endpoint mutation executor: shipped in Phase 104 with one host-owned injected Discord `PATCH /applications/@me` call for approved private candidates and returned app id/endpoint verification.
25. Slack retry UX: shipped across Phase 105 and Phase 106 with manual operator reinvoke metadata plus opt-in bounded foreground retry, with no background worker, schedule, credential persistence, or default live delivery.
26. Discord guild command registration: shipped in Phase 107 with approval-bound chat-input guild command definitions and one injected bulk-overwrite call.
27. Slack setup handoff checklist: shipped in Phase 108 with redacted host handoff steps and claim-safe retry-mode/operator UX.
28. Slack response identity binding: shipped in Phase 109 with approved app/workspace response checks before mutation success.
29. Slack manifest echo integrity: shipped in Phase 110 with optional returned manifest echo verification for request URL and bot events.
30. Discord command response definition integrity: shipped in Phase 111 with returned command name, description, and chat-input type verification before command mutation success.
31. Discord `APPLICATION_COMMAND` inbound dispatch: shipped in Phase 112 with signed interaction verification, host auth for non-PING commands, deferred ACK, and bounded command text normalization.
32. Slack activation readiness: shipped across Phase 113 and Phase 114 with required bot-scope preflight, success-only readiness metadata, and fast deferred event ACK.
33. Slack mention-only `app_mention` support: shipped in Phase 115 as an approval-bound alternative Events API setup/dispatch path with `app_mentions:read`, mixed-subscription rejection, and deferred ACK.
34. Slack duplicate event retry dedupe: shipped in Phase 116 with bounded in-memory route/message-id suppression for signed and host-authenticated Slack `message` and `app_mention` retries, bounded 202 duplicate ACKs, no route message-count increment, no second runner dispatch, no second adapter reply, and no durable dedupe persistence or retry worker.
35. External media transfer retry-control worker-selection, handler-readiness, and invocation handoff: shipped across Phase 187 through Phase 189 with host-owned foreground manual reinvoke worker-selection intent, branded host-supplied handler-readiness preflight truth, and handler-readiness-bound host invocation handoff truth, no handler identity/registry persistence, no handler execution, no retry worker, no schedule, no credential persistence, no public hosting, and no default live delivery.
36. `P1-Experiment-Workflow`: add bounded autonomous experiment template with baseline, metric, budget, rollback, and durable artifact records.
37. `P1-Repo-Context`: add repo map/codebase context provider abstraction.

## Do Not Copy Blindly

Do not sacrifice Colony's safety model to match competitor convenience.

Avoid these traps:

- Enabling auto-run web/network access before exfiltration controls are mature.
- Building mobile apps before web/control-plane/channel fundamentals are stable.
- Executing plugin package code before live metadata promotion, audit, rollback, and package-code policy exist.
- Treating derived memory summaries as canonical truth.
- Hiding agent-generated PR comments or run summaries as if they were human-authored.
- Building an IDE extension before daemon APIs and event models are stable.

## Bottom Line

Colony stands at a strong foundation stage. It has enough real architecture to become a serious agent platform, and in memory/security/swarm direction it already has differentiators. The remaining work is substantial but now well-bounded: broaden tools, harden plugin lifecycle, finish memory controls, persist long-running multi-agent work, implement channel semantics, add a web/operator surface, and later expand into IDE/cloud/codehost/mobile integrations.

The next best move is not another broad research pass. It is to close the P0 slices in order, because each one increases the practical surface area of every later automation pass.




