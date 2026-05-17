# Project State

Last Updated: 2026-05-14

## Product Goal

The Colony is a local-first, security-first agent operating system for terminal-first work, durable memory, approval-gated tools, workflows, and planner/worker/reviewer swarm execution. It can later expose daemon, web, and channel surfaces, but launch claims stay bound to verified local behavior.

## Current Launch Target

Launch Alpha 0 is a public source+Bun alpha. The proof path is:

1. `bun install`
2. `bun run verify:alpha0`
3. `bun run alpha0:provider-check`
4. `bun run start`
5. `/doctor first-run`
6. `/swarm llm "prepare a concise local-first alpha launch checklist"`
7. `/swarm status <run_id>`

## Built

- Real AgentLoop terminal runtime.
- Ollama-first provider stack with optional cloud providers.
- Conservative approvals and tool externalization.
- 12-caste method framework compatibility through `verify:phase282`: canonical
  method names are preferred in operator-facing and model-facing display, while
  legacy Python caste values remain accepted for persisted runtime state.
- Memory, MemPalace, and recall inspection foundations.
- Workflow DAG/checkpoint/retry/approval foundations.
- Planner/worker/reviewer coordinator and LLM-backed swarm demo, with stage timeline, redacted artifact review, retry-history inspection, interrupted-stage resume history, and persisted approval-wait preservation.
- MCP, skill, daemon, channel, GitHub provided-issue intake/handoff with verified PR artifact generation, and local-only authenticated web-control operator foundations; Beta 2 MCP/plugin work now includes approval-gated plugin package install/update execution receipts through an injected executor, supplied registry metadata checksum/signature enrichment, explicit package-driven sidecar activation controls through an injected supervisor after exact approval and a matching completed install/update receipt, a high-risk approval-gated host/network handoff boundary for registry metadata fetch, an injected host-executor registry fetch receipt that validates returned metadata while persisting only redacted audit truth, exact-approval package-code execution policy preflights for bounded host-action descriptors, approved package-code execution receipts through an injected host executor after a ready preflight, a read-only built-in plugin marketplace view over bundled descriptors, marketplace registry metadata fetch handoff descriptors that bind bundled entries to the existing injected registry-fetch executor path, read-only marketplace registry fetch execution status projection over handoffs and supplied receipts, an approved marketplace registry fetch handoff execution bridge that delegates only to the existing injected registry-fetch helper after matching handoff/action/approval validation, read-only marketplace registry-fetch metadata planning that requires completed receipts plus host-supplied full metadata before using registry metadata as package-planner input, metadata-bound marketplace install/update handoff descriptors that require a Phase 252 `metadata_ready` planning entry before the existing install/update handoff can be used for that bundled entry, approved metadata-bound marketplace install/update handoff execution receipts that require that Phase 253 metadata-bound handoff to remain ready before delegating to the existing install/update execution helper, read-only metadata-bound install/update execution status projection over Phase 253 handoffs and Phase 254 receipts, read-only metadata-bound activation readiness over the metadata-bound install/update execution status, redacted metadata-bound activation handoff descriptors over ready metadata-bound readiness entries, approved metadata-bound activation handoff execution receipts that delegate only after matching handoff/action/install-receipt/approval validation, read-only metadata-bound activation execution status projection over Phase 256 readiness and Phase 258 receipts, read-only marketplace lifecycle status projection over metadata planning, metadata-bound install/update status, activation readiness, and activation execution status, read-only marketplace lifecycle handoff from lifecycle states into bounded operator-only approval/inspection checklists, read-only marketplace lifecycle runbook over lifecycle handoffs into ordered operator/reviewer steps, read-only marketplace lifecycle approval packets over approval-required runbook steps, read-only marketplace lifecycle approval review over supplied approval evidence, read-only marketplace install/update handoff descriptors for the existing injected executor path, read-only install/update execution status projection over handoffs and receipts, an approved marketplace install/update handoff execution bridge that delegates only to the existing injected executor helper after matching handoff/action/approval validation, read-only activation readiness over bundled descriptors, a redacted approval-bound activation handoff descriptor for the injected supervisor path, an approved handoff execution receipt that delegates only to the existing injected supervisor activation helper after matching handoff/action/receipt/approval validation, and a read-only activation execution status projection over receipts and active sidecar signatures. It still creates no built-in live registry fetch/install client, live/default install execution client UX, default live activation UX, catalog mutation, sidecar start from the status view, or credential persistence.
- Read-only marketplace lifecycle approval handoff preflight descriptors now project reviewed approval handoffs into bounded host-handoff preflight metadata with ready/blocker states, next-action guidance, redaction, and host-action denial.
- Read-only marketplace lifecycle host handoff request descriptors now project approval handoff preflights into bounded operator/host request packets with explicit request commands, descriptor-only payloads, state/kind/cap filtering, blocker preservation, redaction, and host-action denial.
- Read-only marketplace lifecycle operator queues now group host handoff request descriptors into approval-blocker, metadata, install/update, activation-readiness, and activation request lanes with operator actions, state/lane/cap filtering, redaction, and default-live-execution denial.
- Read-only marketplace lifecycle default UX plans now project operator queue items into default prompt descriptors with stable command labels/ids for metadata, install/update, activation-readiness, activation, approval collection, and approval refresh actions, while preserving blockers, redacting handoff data, and denying default live execution.
- Read-only marketplace lifecycle default UX command palettes now project default UX prompt plans into operator command-palette entries grouped as host handoff requests and approval remediation, with stable command previews, safety badges, blocker preservation, redaction, and default-live-execution denial.
- Read-only marketplace lifecycle default UX command briefs now project command-palette entries into copy-safe operator brief lines grouped as ready commands and approval remediation, with request-bound copy text, display labels, blocker preservation, redaction, and default-live-execution denial.
- Read-only marketplace lifecycle default UX command transcripts now project command-brief lines into bounded terminal transcript lines and fixed safety summaries, with operator-only hints, blocker preservation, redaction, and default-live-execution denial.
- Read-only marketplace lifecycle default UX command panels now project command-transcript lines into operator panel cards grouped as ready commands, approval remediation, and safety summaries, with copy text, terminal hints, blocker preservation, redaction, and default-live-execution denial.
- Read-only marketplace lifecycle default UX command panel digests now project command-panel cards into concise operator digest items grouped as ready commands, approval remediation, and safety summaries, with copy text, terminal hints, blocker preservation, redaction, and default-live-execution denial.
- Read-only marketplace lifecycle default UX command panel digest clipboard packets now project command-panel digests into bounded copy-safe operator packets grouped as ready commands, approval remediation, and safety summaries, with clipboard text, copy text, blocker preservation, redaction, and default-live-execution denial.
- Read-only marketplace lifecycle default UX command panel digest clipboard review packets now project clipboard packets into bounded operator/reviewer review checklists grouped as ready commands, approval remediation, and safety summaries, with review text, copy text, review-ready/blocker states, blocker preservation, redaction, and default-live-execution denial.
- Read-only marketplace lifecycle default UX command panel digest clipboard review closeout packets now project review checklists into bounded operator/reviewer closeout packets grouped as ready commands, approval remediation, and safety summaries, with closeout text, copy text, review-line preservation, closeout-ready/blocker states, blocker preservation, redaction, and default-live-execution denial.
- Read-only marketplace lifecycle default UX command panel digest clipboard review closeout summary packets now project closeout packets into bounded operator/reviewer summary packets grouped as ready commands, approval remediation, and safety summaries, with summary text, copy text, closeout/review-line preservation, summary-ready/blocker states, blocker preservation, redaction, and default-live-execution denial.

## Not Built For Alpha 0

- Hosted control plane.
- Slack/Discord/Telegram delivery as a default alpha channel.
- Credential persistence for vendor services.
- Automatic push or PR creation.
- Autonomous remote mutation without explicit approval.

## Release Rule

Any public claim must map to a verifier, a command, or a documented manual smoke step.
Post-Alpha competitor work is ordered in `docs/release/COMPETITOR_COMPLETION_BOARD.md`.
