# The Colony — Architectural Decision Log

> **Purpose:** Record of every significant architectural decision made across conversations. Consult this before making new architectural choices — it may already be decided.

**Last Updated:** April 14, 2026

---

## Runtime & Language

| # | Decision | Rationale | Date | Source |
|:---:|:---|:---|:---|:---|
| D1 | **Bun as runtime** (not Node.js) | Built-in SQLite (`bun:sqlite`), native TypeScript execution, fast startup, single-binary compilation | Pre-project | Blueprint |
| D2 | **TypeScript in strict mode** | Catches type errors at compile time; `tsc --noEmit` runs as part of CI | Pre-project | Blueprint |
| D3 | **React/Ink for terminal UI** (not blessed, not raw ANSI) | Component model matches modern React patterns; composable layout via `<Box flexDirection>` | Pre-project | Blueprint, Claude Code reference |
| D4 | **Zustand for state management** | Persistence middleware backed by `bun:sqlite`; declared as dependency but not yet wired | Pre-project | Blueprint |

---

## LLM Providers

| # | Decision | Rationale | Date | Source |
|:---:|:---|:---|:---|:---|
| D5 | **Zero SDK dependencies** — all providers use raw `fetch()` | Zero supply-chain risk from LLM SDKs; full control over request/response format; works with any OpenAI-compatible endpoint | April 13, 2026 | Walkthrough (Phase 7) |
| D6 | **Ollama as default provider** (local-first) | Zero API cost for development; air-gapped operation; Llama3.2 as default model | Pre-project | Colony Bible |
| D7 | **Provider priority: Ollama → Anthropic → OpenAI → Gemini** | Local-first philosophy; external providers only when local model insufficient | Pre-project | Blueprint Phase 4 |
| D8 | **Cache-aware cost tracking** — reads at 10%, creation at 125% of input price | Matches Python reference behavior exactly; prevents false budget alarms from cached responses | April 13, 2026 | Walkthrough |

---

## Security

| # | Decision | Rationale | Date | Source |
|:---:|:---|:---|:---|:---|
| D9 | **All security logic is pure TypeScript** (zero npm dependencies) | Full auditability, no supply-chain risk, deterministic behavior, no version drift | Pre-project | Blueprint cross-phase constraints |
| D10 | **Default tool approval = Conservative** (all tools require user approval) | Security-first posture; user can relax per-session | Pre-project | Roadmap critical rules |
| D11 | **AES-256-GCM with PBKDF2 key derivation** for vault | NIST-compliant; uses Node.js `crypto` module (available in Bun) | April 3, 2026 | Conversation `99ce517b` |
| D12 | **Heap protection gracefully degrades on Windows** | `prctl(PR_SET_DUMPABLE, 0)` is Linux/macOS only; Windows has no equivalent via Bun FFI | Pre-project | Blueprint |

---

## Architecture

| # | Decision | Rationale | Date | Source |
|:---:|:---|:---|:---|:---|
| D13 | **11 castes exactly** — no more, no fewer | Direct port from Python `enums.py`; castes are the product's identity | Pre-project | Colony Bible |
| D14 | **Settings resolution: env var → config.json → defaults** | 3-tier resolution using `Bun.env` and `Bun.file()`; matches Python `Settings.__init__` | Pre-project | Blueprint Phase 1 |
| D15 | **Bootstrap order: Store → Security → LLM → Gateway** | Critical subsystems halt colony on failure; non-critical log warning and continue | Pre-project | Blueprint Phase 1 |
| D16 | **Parallel tool execution for read-only ops** | Tools categorized as `search`, `read`, or `web` run via `Promise.all()`; mutating tools run sequentially | April 13, 2026 | Walkthrough |
| D17 | **Tool results >10KB externalized to disk** | Prevents React Ink render tree from holding massive strings; keeps context window clean | Pre-project | Blueprint memory safety |
| D18 | **Manifesto singleton loaded at boot** | Injected into every agent's system prompt via `BootstrapCoordinator`; ethical guardrails are non-negotiable | Pre-project | Blueprint Phase 1 |

---

## Memory & Compaction

| # | Decision | Rationale | Date | Source |
|:---:|:---|:---|:---|:---|
| D19 | **6 compaction strategies** (standard, micro, reactive, session_memory, cached_micro, context_collapse) | Matches Python reference; different aggression levels for different pressure scenarios | Pre-project | Blueprint Phase 4 |
| D20 | **Caste-aware retention counts** | ROOT_QUEEN: 20 messages, SHIELD_GENERALS: 14, ASSIST_ANT: 12, WATCHER_SWARM: 8, etc. | Pre-project | Blueprint Phase 4 |
| D21 | **MemPalace integration deferred** to post-Phase 9 | Current stubs compile but are non-functional; single-session use doesn't require it; full 12-module port is P2 | April 13, 2026 | Gap Analysis |
| D22 | **AAAK dialect NOT adopted** for storage | Raw verbatim mode scores 96.6% vs AAAK's 84.2% on LongMemEval; raw is the storage default | April 13, 2026 | Reference Analysis |

---

## UI & UX

| # | Decision | Rationale | Date | Source |
|:---:|:---|:---|:---|:---|
| D23 | **Anti-flicker strategy: useRef buffer + 50ms flush** | Token-by-token streaming would cause 100+ re-renders/sec; buffer in useRef (no render), flush to useState every 50ms (max 20 renders/sec), React.memo on non-streaming panels | Pre-project | Blueprint Phase 6 |
| D24 | **TTY guard on startup** | Ink's TextInput requires raw mode; non-TTY (piped shell, CI) gets graceful message + exit(1) instead of React crash | April 13, 2026 | QA Report fix #1 |
| D25 | **Ctrl+C during loop = graceful cancellation** (not process exit) | UseInput raw-mode handler intercepts Ctrl+C and Escape at process level, bypassing text input capture | Pre-project | Blueprint Phase 6 |
| D26 | **"Ant Farm" multi-pane layout** | StatusBar (top) + ChatPanel/ToolActivityPanel (split) + ChatInput (bottom); uses Ink Box flexDirection | Pre-project | Blueprint Phase 6 |

---

## Process & Convention

| # | Decision | Rationale | Date | Source |
|:---:|:---|:---|:---|:---|
| D27 | **Each task = one commit, each phase = one PR** | Clean history; branch naming: `phase-{N}-{short-name}` | Pre-project | Roadmap |
| D28 | **Never add `from __future__ import annotations`** to `app.py` or `pwa/router.py` | Causes Pydantic/FastAPI forward-ref errors in the Python codebase | Pre-project | Roadmap critical rules |
| D29 | **ActivityType uses `TOOL_CALL_START`/`TOOL_CALL_END`** — NOT `TOOL_CALL` | Avoids name collisions with audit event types | Pre-project | Roadmap critical rules |
| D30 | **Verification suites as test runner** (not Jest/Vitest) | `verify-phase1.ts` through `verify-phase7.ts` with assertion counts; matches Python test structure | April 13, 2026 | QA Report |

---

## Decisions NOT Yet Made

> [!WARNING]
> These require resolution before proceeding with certain features.

| Topic | Options | Blocking |
|:---|:---|:---|
| **Zustand vs useState** | Wire Zustand stores OR remove dependency | Phase 8+ (persistent state) |
| **Docker sandbox for NAMELESS_SWARM** | Full Docker isolation OR Bun subprocess isolation | Phase 9+ (multi-agent) |
| **MCP server implementation** | stdio mode OR SSE mode OR both | Phase 9+ (IDE integration) |
| **Logging infrastructure** | Structured JSON logging OR pino OR winston OR custom | Phase 8 |
| **IDE bridge** | VS Code extension OR Language Server Protocol OR both | Phase 9+ |
| **Channel adapters** (Slack, Discord, etc.) | Port from Python OR build fresh from OpenClaw patterns | Phase 9+ |
