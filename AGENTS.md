# The Colony - Agent Operating System (TypeScript/Bun)

## What This Project Is

The Colony is a security-first, local-first AI agent platform with a caste-based
runtime identity model, conservative approvals, exact transcript preservation,
and Caveman token-savings for model-bound and internal agent traffic.

## Repository Layout

Primary directories:

- `src/runtime/` - `AgentLoop`, approvals, prompt assembly, compaction, tools
- `src/llm/` - providers, failover, rate limiting, cost tracking, Caveman bridge
- `src/ui/` - React/Ink operator interface
- `src/memory/` - transcript logging, recall, fact extraction
- `src/mempalace/` - async-safe MemPalace foundation, hierarchy still in progress
- `src/security/` - vault, path validation, bash validation, audit, log sanitization
- `docs/` - roadmap, execution plan, gap analysis, benchmark board, references

## Current State

- Real `AgentLoop` is wired to the Ink UI with anti-flicker streaming.
- Providers: Ollama, Anthropic, OpenAI-compatible, Gemini.
- Compaction, approvals, provider health, startup doctor, persisted session recovery, and memory handoff are live.
- Verification gate is `verify-phase1` through `verify-phase19a` plus `tsc --noEmit`.
- `/swarm` is currently an active-agent alias, not real multi-agent orchestration.

## Critical Rules

1. All security logic stays pure TypeScript with zero npm dependencies.
2. All LLM providers use raw `fetch()`.
3. Default tool approval remains conservative unless intentionally relaxed.
4. Never add blocking I/O to the main event loop.
5. Tool results over 10 KB must be externalized and redacted before persistence.
6. Keep canonical transcript truth verbatim and separate from derived compact artifacts.
7. React/Ink streaming remains anti-flicker: buffer in refs, flush on a bounded cadence.
8. Install the log sanitizer before bootstrapping UI/runtime modules that may emit secrets.

## Reference Docs

Read these before large changes:

- `docs/COLONY_BIBLE.md`
- `docs/DECISIONS.md`
- `docs/ROADMAP.md`
- `docs/EXECUTION_PLAN.md`
- `docs/GAP_ANALYSIS.md`
- `docs/BENCHMARK_BOARD.md`
- `docs/REFERENCES.md`

## Porting Rule

When porting a Python behavior:

1. Read the Python source first.
2. Preserve behavior and failure semantics.
3. Adapt to TypeScript/Bun idioms.
4. Add or extend a verification phase script.

## What Is Next

Current implementation order:

1. Phase 0 - truth sync and benchmark board
2. Phase 1 - single-agent product core closure
3. Phase 2 - memory completion on MemPalace
4. Phase 3 - workflow and task engine
5. Phase 4 - real multi-agent colony core
