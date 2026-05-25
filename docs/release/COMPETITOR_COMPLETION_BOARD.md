# Competitor Completion Board

Last Updated: 2026-05-14

This board translates "full fledged competitor" into ordered release gates. It
does not expand Launch Alpha 0 claims; it defines what must ship after Alpha 0
to compete credibly with terminal agent tools and control-plane agent systems.

The dated full comparison against the local Claude Code and OpenClaw benchmark
repositories is `docs/release/COMPETITOR_GAP_ANALYSIS_2026-05-11.md`. The
implementation plan is
`docs/superpowers/plans/2026-05-11-competitor-gap-closure.md`.

## Release Order

| Release | Focus | Done When |
| --- | --- | --- |
| Launch Alpha 0 | Public source+Bun alpha with real local swarm demo | Automated release gate, provider readiness, support handoff, incident owner, and manual terminal UI smoke are recorded |
| Alpha 1 | GitHub local execution depth | Real issue intake, deterministic branch/worktree creation, local verification, and PR handoff work end-to-end behind explicit approval |
| Alpha 2 | Local web-control UX | Local-only authenticated web control can inspect runs, request approved local actions, and reject missing scopes/public listeners by default |
| Alpha 3 | Memory and MemPalace polish | Phase 232 verifies real-session recall QA for transcript truth separation, derived ownership/decision visibility, palace issue/path routing, procedure routing, body-safe diagnostics, and exact-only accounting; recovery UX polish remains gap-driven |
| Beta 1 | Swarm production hardening | Phase 233 ships stage timeline/retry-history/artifact-review/interrupted-resume/approval-wait inspection, injected failure coverage, and restart-safe cancellation preservation; broader long-run hardening remains |
| Beta 2 | MCP/plugin execution fabric, remote action hardening, and operator trust surfaces | Phase 278 completes the read-only marketplace lifecycle closeout-summary chain, and Phases 379 through 381 harden provider, doctor/onboarding, and memory inspection redaction. Built-in live/default registry fetch/install UX beyond injected handoff execution/status/views/planning, default/live activation UX beyond explicit approved handoff execution, and broader daemon/client/workflow hardening remain |
| Beta 3 | External channels as host-owned adapters | Phase 92 through Phase 225 now have full focused verification evidence for host-owned setup, signed webhook/deferred ACK, media metadata, media transfer, manual reinvoke, retry-control, execution receipt, closeout, audit, retry-ledger, operator handoff, worker-selection, handler-readiness, foreground worker execution, receipt preflight, closeout readiness, supplied closeout-preflight, and closeout record-plan boundaries; default live delivery, public hosting, credential persistence, background retry workers, automatic vendor retry, and raw host-data persistence remain non-goals |
| Release Candidate | Packaging, support, and docs | Source+Bun, optional binary, troubleshooting, dependency review, launch checklist, release notes, provider-readiness evidence, manual TTY smoke, clean-checkout rehearsal, and support evidence are repeatable from a clean checkout |

Current frontier: Phase 384 (`verify:phase384`). Beta 2 includes the Phase 278 read-only marketplace
lifecycle closeout-summary chain plus Phase 379 provider redaction, Phase 380
doctor/onboarding redaction, and Phase 381 memory inspection redaction. This is
operator trust hardening only: no default live plugin install, no public web
hosting, no default external channel delivery, no credential persistence, no
push, and no PR creation.

Beta 3 current frontier: Bucket 9 review evidence now records `bun run
verify:phase92` through `bun run verify:phase225` passing via a
stop-on-failure loop, followed by cleanup, Alpha 0, and TypeScript checks. The
remaining channel gap is broader explicit live-delivery/upload/download/retry
worker productization, not default delivery.

## Capability Gaps To Close

| Capability | Current Truth | Next Release Slice |
| --- | --- | --- |
| Terminal runtime | Real AgentLoop, Ink UI, provider selection, approvals, status, doctor, and recovery are built | Polish first-run UX and capture manual smoke transcript |
| Model providers | Historical Ollama readiness is recorded, optional cloud env is documented, raw `fetch()` providers are built, and the latest automation shell preflight is blocked because no provider is reachable/configured | Rerun provider readiness in the final operator environment before release tagging; add clearer model mismatch fixes where real operators hit them |
| Swarm | Planner/worker/reviewer LLM mode, status, resume, retry, artifacts, timeline rendering, redacted artifact review, retry history, injected failure coverage, and cancellation preservation are verified | Add broader long-run production hardening |
| Memory | Transcript truth, compact artifacts, structured facts, recall foundations, MemPalace routing, and real-session recall QA matrix coverage are built | Prioritize only concrete recall precision, inspection, or recovery failures found during real sessions |
| GitHub | Deterministic provided issue intake, handoff, local workspace action planning, injected approved branch/worktree execution receipts, and verified PR handoff artifact generation are approval-gated | Keep remote push/PR creation manual unless an explicit credentialed approval slice is chosen |
| Web control | Local-only authenticated operator UX renders provider/workflow/swarm/channel status and host-mediated approved local action controls | Keep hosted/default-public web delivery deferred unless explicitly scoped |
| Channels | Host-owned external adapter foundations and the full Phase 92 through Phase 225 media/retry-control chain are verified as explicit host-owned boundaries | Keep non-headline until explicit live setup, retry worker, and media delivery productization are intentionally scoped |
| Packaging | `release:gate` verifies alpha, full regression, and build after the Bucket 9 full-chain evidence refresh; Bucket 6 records generated `colony.exe` SHA-256 evidence; clean-checkout rehearsal preflight is blocked because current `HEAD` omits unstaged/untracked release-critical files; exact staging manifest is recorded | Stage and commit reviewed buckets by exact pathspec, then run clean-checkout release rehearsal before RC |
| Support | README, launch scope, project state, inventory, release notes, support owner, incident owner, and clean-checkout support handoff exist | Record manual smoke evidence before Alpha 0 tag |

## Immediate Queue

1. Run and record the manual terminal UI smoke from a real interactive terminal; manual terminal UI smoke remains required:
   - `bun run start`
   - `/doctor first-run`
   - `/swarm llm "prepare a concise local-first alpha launch checklist"`
   - `/swarm status <run_id>`
2. Rerun `bun run alpha0:provider-check` in the final operator environment
   after starting Ollama or configuring one supported cloud provider env.
3. Split the cleanup/control-plane files before mixing in runtime buckets; do
   not commit unless the operator explicitly asks.
4. Await explicit operator approval to execute the exact staging manifest, then
   stage/commit reviewed buckets by exact pathspec before running the final
   clean-checkout rehearsal. Keep Beta 2 live/default registry fetch/install
   UX, default/live plugin activation UX, and Beta 3 live channel delivery as
   explicit post-RC slices unless the operator reprioritizes them.

## Non-Goals For Launch Alpha 0

- Hosted control plane.
- External channels as a default alpha delivery path.
- Stored vendor credential values.
- Remote push or PR creation without explicit approval and credentials.
- Autonomous remote mutation without explicit approval.
