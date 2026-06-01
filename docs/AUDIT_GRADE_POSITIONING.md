# Audit-Grade Positioning

A compliance summary for regulated-industry security teams. This document is intended to be read in about ten minutes and to provide enough verifiable evidence — source files, verifier IDs, enum values — that a reviewer can confirm rather than trust.

The Colony is local-first by construction. The properties described below are enforced in code under `src/`, exercised by per-phase verifier scripts named `src/verify-phaseN.ts`, and gated by `bun run verify:all` in CI on every pull request.

## 1. Why local-first matters for compliance

Sending source code, prompts, or tool outputs to a third-party model vendor is structurally incompatible with a number of common regulatory and contractual regimes:

- **HIPAA**: Protected Health Information sent to a vendor that has not signed a Business Associate Agreement is a reportable disclosure. Most public LLM API terms either do not offer a BAA or carve out training/abuse-monitoring rights that conflict with PHI handling.
- **GDPR Article 28 processor restrictions**: Cross-border processing of EU personal data via a US-based model API requires an executed Article 28 processing agreement plus a valid transfer mechanism (SCCs, adequacy decision). Sub-processor chains used by hosted model vendors are often unbounded and outside the controller's audit reach.
- **FedRAMP High / DoD IL5**: Workloads with these authorization boundaries cannot egress to commercial multi-tenant inference endpoints. A self-hosted model on accredited infrastructure is the only viable path.
- **Export controls (EAR / ITAR), attorney-client privilege, and M&A diligence**: All three depend on the holder being able to demonstrate that the protected material was never disclosed to an uncontrolled third party. Once a prompt is sent to a hosted LLM, that disclosure is irrevocable and frequently logged for "abuse monitoring."

These are structural problems, not vendor failings. The Colony's response is to make local execution against a local model the default and to keep every path that *could* reach a vendor behind an explicit, audited opt-in.

## 2. The eight critical rules and what each guarantees

Reproduced verbatim from `AGENTS.md` "Critical Rules":

1. **All security logic stays pure TypeScript with zero npm dependencies.** — Auditable supply chain: no third-party security dependency to vet, pin, or monitor for CVEs.
2. **All LLM providers use raw `fetch()`.** — Every outbound model call is readable in source; no vendor SDK opacity hides what is sent, where it goes, or what headers are set.
3. **Default tool approval remains conservative unless intentionally relaxed.** — Fail-closed posture: an unrecognized tool or missing resolver denies execution rather than silently allowing it.
4. **Never add blocking I/O to the main event loop.** — Predictable runtime behavior: the approval prompt and audit recording cannot be starved by a hung network call.
5. **Tool results over 10 KB must be externalized and redacted before persistence.** — Bounded log surface: large payloads are not silently inlined into transcripts where they would escape redaction passes.
6. **Keep canonical transcript truth verbatim and separate from derived compact artifacts.** — Exact transcript guarantee: legal/compliance review reads the unmodified record; token-saving compaction never overwrites it.
7. **React/Ink streaming remains anti-flicker: buffer in refs, flush on a bounded cadence.** — Bounded operator-surface emission rate: secrets cannot leak through a high-frequency unsanitized render path.
8. **Install the log sanitizer before bootstrapping UI/runtime modules that may emit secrets.** — Ordering guarantee: the redaction patch is in place before the first user-facing log line is emitted.

## 3. The redaction chain

Redaction is enforced at four distinct surfaces, each with its own source-of-truth module:

- **Console output (`src/security/log-sanitizer.ts`)** — Patches `console.log`, `console.warn`, `console.error`, `console.debug`, `console.info`, `console.trace`, and `console.dir`. Walks nested objects and `Error` instances recursively so secrets buried inside structured arguments are still scrubbed. Generic `api_key=`, `password=`, `secret=`, and `token=` patterns use a `(?<![A-Za-z])` negative lookbehind so prose like "the secret to good design" is left untouched while config-shape forms like `auth_token=…` are caught.
- **Secret scanning (`src/security/secret-scanner.ts`)** — Pattern detection used by audit ingestion and surface redaction. Covers Anthropic `sk-ant-*`, OpenAI `sk-proj-*` and legacy `sk-*`, AWS access key IDs `AKIA*`, Google OAuth `ya29.*`, Groq `gsk_*`, generic `Bearer <token>`, GitHub classic PAT prefixes `ghp_/gho_/ghu_/ghs_/ghr_`, GitHub fine-grained `github_pat_*`, Stripe live/test keys, JWTs, and PEM private keys.
- **Tool result persistence (`src/runtime/tool-result-storage.ts`)** — Enforces Critical Rule 5: results over 10 KB are externalized and redacted before they touch the transcript or any on-disk cache.
- **Operator surface redaction (`src/operator-surface-redaction.ts`)** — A single shared helper used by provider performance/failover drilldowns, doctor/onboarding diagnostics, and memory recall/routing/palace inspection (hardened in Phases 379–381 and consolidated in Phase 384) so every operator-visible surface goes through the same redaction primitive.

Recent hardening worth flagging to a reviewer:

- `console.info`, `console.trace`, and `console.dir` are now patched in addition to the original four console methods.
- The sanitizer walks objects and `Error` instances recursively rather than only stringifying the top level.
- Generic `api_key`/`password`/`secret`/`token` patterns gained the `(?<![A-Za-z])` lookbehind described above.

## 4. The approval audit trail

`src/security/audit-trail.ts` records security-relevant events to memory and (optionally) to an append-only JSONL store. Event details are sanitized via the secret scanner and `scrubSecrets` *before* the per-event checksum is computed, so the chain integrity check covers redacted content and stored content is never the unscrubbed original.

The `SecurityEventType` enum is the authoritative event vocabulary. Relevant values for approval/policy decisions:

- `PERMISSION_GRANTED` / `PERMISSION_DENIED` — every tool-execution approval outcome.
- `POLICY_ALLOW` / `POLICY_DENY` / `POLICY_AUDIT` — every policy-engine evaluation.
- `SECRET_ACCESS` / `SECRET_DENIED` — every vault access attempt.
- `KILL_SWITCH_ENGAGED` / `KILL_SWITCH_RELEASED` — operator-driven hard stops.

Posture is conservative-by-default: when no permission resolver is wired in, the runtime denies. This is Critical Rule 3 expressed in the audit trail — there is no path where a tool runs without an explicit allow decision, and every allow decision lands in the audit log with a hash-chain checksum.

## 5. Exact transcript guarantee

Critical Rule 6 in deployment terms: the canonical transcript at `src/memory/conversation-log.ts` preserves user-supplied content verbatim, modulo the credential-shape redactions in Section 3. The Caveman compression layer used for model-bound and internal agent traffic operates on *derived* artifacts — it never replaces the canonical record.

For audit defensibility this matters because:

- A subpoena, a legal hold, or a compliance investigation reads the canonical transcript directly.
- A reviewer can demonstrate to a regulator that summaries shown in the UI are not the source of truth, and that the source of truth is the unmodified user-content stream.
- The redaction chain operates only on credential shapes (token-looking strings). It does not paraphrase, summarize, or otherwise alter user intent.

This separation is the audit-defensibility moat: every other AI-assisted system you might compare against either does not preserve verbatim user content or does not separate it from token-saving compaction.

## 6. The 388-phase verification gate as engineering rigor evidence

`bun run verify:all` runs a long chain of per-phase verifier scripts. The chain currently covers 387 contract verifiers — Phases 1 through 387 — corresponding to the v2.0.0-alpha.0 tag, plus Phase 388 on main which covers the post-tag `scripts/publish-release.ts` tooling, plus a final `tsc --noEmit` for type integrity. The full chain string is the single long `&&`-joined value at `package.json`'s `scripts["verify:all"]` field.

The 388 number is not a marketing figure — it is a proxy for "we test each observable behavior change." Each verifier is named after the phase in `docs/EXECUTION_PLAN.md` it locks down, exercises pure helpers without network calls, and fails fast on assertion violations. The CI workflow runs the full chain on every pull request, so any regression to a previously locked behavior trips the gate before merge.

The focused `bun run verify:alpha0` gate is the abbreviated readiness check used by the alpha onboarding path and by the setup wizard.

## 7. Explicit non-goals

The following are **not** built for Alpha 0 (from `docs/PROJECT_STATE.md` "Not Built For Alpha 0"). A reviewer should treat these as binding non-claims:

- **No hosted control plane.** All execution is local; there is no Colony-operated cloud surface to attack or to subpoena.
- **No default live channel delivery.** Slack, Discord, and Telegram inbound/outbound paths exist behind approvals and host-supplied credentials but are not started by default. No app is created, no listener is started, no media is fetched, no retry worker is run.
- **No credential persistence.** Vendor API keys are read from environment at runtime; they are not written to disk, not echoed to logs, and not stored in any session state.
- **No automatic push or PR creation.** GitHub local execution plans branches/worktrees behind approval and produces handoff artifacts; it does not call the GitHub API to push or to open PRs.
- **No autonomous remote mutation.** Web control surfaces are local-only and host-mediated; any mutation is explicitly approved.
- **No live plugin registry fetch, install, or activation by default.** The plugin marketplace lifecycle (Phases 234–278) is a read-only projection chain with approval gates at every transition.

## 8. What this means for deployment

The Colony is shipped as source under MIT, runs entirely against a local Ollama model with no outbound network requirement, and exposes every tool execution to an approval-gated, redaction-scrubbed, hash-chained audit trail. There is no hosted Colony component to add to a vendor inventory.

Security-reviewer checklist:

- [ ] Source available under MIT (`LICENSE` at repo root)
- [ ] Runs against local Ollama with no outbound network requirement (`bun run setup`, `bun run alpha0:provider-check`)
- [ ] Conservative-by-default approval, audit trail of every tool execution (`src/security/audit-trail.ts`, `SecurityEventType` enum)
- [ ] Redaction chain demonstrated by 30+ surface-specific verifiers across `src/verify-phaseN.ts` (in particular Phases 379–384)
- [ ] Exact transcript preservation for legal/compliance review (`src/memory/conversation-log.ts`, Critical Rule 6)
- [ ] No credentials persisted to disk (Section 7 non-goals)
- [ ] CI evidence of repeatable verification (`bun run verify:all`, per-phase scripts under `src/verify-phaseN.ts`, full chain visible in `package.json`)
