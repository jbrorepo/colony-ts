# The Colony Bible: Architecture, Framework, & Ethics

> [!NOTE]
> The Colony is a next-generation, local-first artificial intelligence framework. It eschews the brittle "do-it-all" copilot design in favor of a strictly structured, highly secure, and rigorously tested **Multi-Agent Caste System**. This document is the **canonical specification** of The Colony's identity, behaviors, and feel. Every ported module, every new feature, and every test must be traceable back to a principle in this Bible.

---

## 1. Vision & Core Philosophy

The Colony exists to bridge the gap between "Vibe Coding" (rapid, untested AI generations) and enterprise reliability. It is designed to act exactly like an ant colony: highly specialized, rigorously organized, and operating under a strict set of Pheromone directives and Champion Gating pipelines.

### Three Pillars

1. **Security Posture** — Every agent action flows through the Caste permission pipeline. There is no bypass path. The `ToolPermissionChecker` is the largest single enforcement surface in the codebase (~960 lines). It is the product.
2. **Local-First with Zero Credit Usage** — Ollama is the default. External providers (OpenAI, Anthropic, Gemini) are optional, budget-gated, and metered. The Colony should cost the user nothing to run locally.
3. **Ability to Call Outside Models** — Broad provider support, but always regulated through cost controls, effort classification, and failover meshes.

### Antelligence Operating Model

Antelligence is the enterprise product-development expression of The Colony's identity. It frames product work as a superorganism operating model: local signals drive global coordination, discovery acts as scouting, the platform is the nest, labor adapts to system demand, governance is evidence-threshold based, quality/security/operations form the immune system, and scale happens by controlled fission instead of uncontrolled sprawl.

This does not replace the Caste system, Manifesto, Security Mesh, MemPalace, exact transcript truth, or conservative approvals. It is the launch-facing playbook for applying those principles to enterprise product development. See [ANTELLIGENCE_PLAYBOOK.md](./ANTELLIGENCE_PLAYBOOK.md) and [ANTELLIGENCE_LAUNCH_CHECKLIST.md](./ANTELLIGENCE_LAUNCH_CHECKLIST.md).

### Core Capabilities

- **Zero-Friction Distribution:** Bundled via Bun and TypeScript into a single globally installable CLI executable (`colony.exe`, ~111 MB). No complex Python environments. One binary does everything.
- **Pheromone Routing (Cost Intelligence):** The `EffortResolver` classifies task complexity as LOW / MEDIUM / HIGH. LOW routes to local Ollama (free). HIGH routes to Claude Opus → GPT-4o → Ollama fallback. The `BudgetGate` rejects requests that would exceed the remaining session budget.
- **Caste-Aware Context Memory:** 6 compaction strategies with per-caste retention policies prevent the "memory cliff" while preserving the personality of each agent role.

---

## 2. The Manifesto & Ethical Guardrails

*Every agent in The Colony, regardless of its Caste, is bound by this strict ethical core derived from the original `manifesto.py`. The Manifesto is a singleton loaded at boot and injected into every agent's system prompt via the `BootstrapCoordinator`. It is never optional.*

### The Oath
*"We are many, but we move as one. We exist because end users trust us. We remain worthy of that trust only when their safety comes before our curiosity, our pride, and our efficiency."*

### Core Principles
1. **Safety Before Success:** Never pursue a goal in a way that meaningfully increases risk. If safety and success conflict, escalate to the human.
2. **Partnership Before Control:** Be a collaborator, not a puppeteer. Surface trade-offs and assume the user is the final decision-maker.
3. **Reversibility Over Irreversibility:** Favor actions that can be rolled back. When irreversible steps are asked for, stop and require explicit human review.
4. **Emotional Safety (Companion Guardrail):** Avoid language that amplifies anxiety or shame. Guide with warmth and boundaries.

**When in doubt: Stop. State the concern. Ask for human review.**

---

## 3. The 12-Caste Method Framework

The Colony does not rely on a monolithic brain. User intents move through a **12-caste method framework** that keeps planning, command, security, execution, verification, memory, accounting, and fanout authority separate. The old Python 11-caste names remain accepted as compatibility aliases for persisted runtime state; operator-facing language should prefer the method names below.

| Caste | Identity | Primary Role | Shell | HTTP | File |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **1. Queen** | Sovereign | Final workflow decision and high-risk transition authority | All | All | All |
| **2. Eldest** | Architect | Architecture direction, technical standards, synthesis | Default | All | All |
| **3. Assist-Ant** | Concierge | User-facing intake and final explanation | Denied by default | All | All |
| **4. Command-ant** | Commander | Execution planning, assignment, and workflow sequencing | Denied by default | Limited | Plan/docs only |
| **5. Vigil-ant** | Enforcer | Security auditing, veto, policy and approval gates | Broad (blocks `sudo`, `su`, `shutdown`) | All | All |
| **6. Develop-ant** | Builder | Approved implementation and scoped mutation | Default | All | All |
| **7. Logist-ant** | Operator | Infrastructure and operational readiness | Default | All | All |
| **8. Consult-ant** | Reviewer | Verification, review, test execution, observability evidence | Verification allowlist | All | All |
| **9. Inform-ant** | Fetcher | External information gathering and integration research | Denied by default | All | All |
| **10. Cogniz-ant** | Memory | MemPalace, documentation, exact truth vs derived memory | Read-heavy | All | All |
| **11. Account-ant** | Auditor | Token/cost accounting, budget gates, provenance ledgers | Read-heavy | Audit/billing allowlist | All |
| **12. Oper-ant** | Worker | Restricted parallel fanout worker packets | Denied by default | Explicit domains only | `data/*`, `temp/*` only |

> [!IMPORTANT]
> **`Oper-ant` is sandboxed by design.** Denied shell access. Explicit domain allowlist for HTTP. File access restricted to `data/` and `temp/` directories. These are disposable bulk workers and receive the least trust.

Compatibility aliases:

- `root_queen -> Queen`
- `eldest_architect -> Eldest`
- `assist_ant -> Assist-Ant`
- `shield_generals -> Vigil-ant`
- `forge_carvers -> Develop-ant`
- `core_shapers -> Logist-ant`
- `watcher_swarm -> Consult-ant`
- `liaison_ants -> Inform-ant`
- `lore_burrow -> Cogniz-ant`
- `ledger_ants -> Account-ant`
- `nameless_swarm -> Oper-ant`

### Permission Resolution Chain
When a tool call is evaluated, permissions resolve in this order:
1. **Agent-specific override** → 2. **Caste-custom policy** → 3. **Caste-default policy** → 4. **Global default**

The `ToolPermissionChecker.evaluate()` returns a `PermissionDecision` with allow/deny plus the resolution path for auditability.

---

## 4. The Resilient Loop — Colony Feel

> [!CAUTION]
> **This section defines what makes The Colony feel like The Colony.** Every behavior described here must be present in the TypeScript port. Dropping any of these degrades the product from "agent operating system" to "chatbot wrapper."

### 4.1 — The AgentLoop State Machine

The `AgentLoop` (`runtime/loop.ts`) is the central heartbeat. Every iteration follows this exact 12-step lifecycle:

```
1. Check wall-clock budget (default 300s timeout)
2. Check kill switch (user may have sent Ctrl+C)
3. Build LLMMessage[] from session history
4. Call LLM with retry (_callLlmWithRetry)
5. Track tokens and cost
6. Parse tool calls from response
7. Record assistant message in session
8. If no tool calls → terminate with "complete"
9. Execute tool calls (parallel if read-only, sequential if mutating)
10. Auto-compact if approaching context window ceiling
11. Fire lifecycle hooks (PreToolUse, PostToolUse, Stop, PreCompact, PostCompact)
12. Repeat
```

**Termination conditions (exactly 4):**
- `"complete"` — LLM returned no tool calls (natural end)
- `"max_iterations"` — 20 cycles exhausted (prevents runaway)
- `"timeout"` — 300 seconds wall-clock elapsed
- `"kill_switch"` — User interrupted (Ctrl+C or `/cancel`)

### 4.2 — Read-Only Tool Parallelism

Tools categorized as `search`, `read`, or `web` execute concurrently via `Promise.all()`. All mutating tools execute sequentially via `for...of`. This is invisible to the user but critical for performance — a search + file read + web fetch that would take 3 seconds sequentially finishes in 1 second.

**This behavior must be present.** Dropping it makes The Colony feel sluggish.

### 4.3 — Tool Result Externalization

Tool outputs exceeding **10KB** are written to disk (`~/.colony/tool-results/<session_id>/`) and replaced with a reference marker in the message history. This prevents:
- The React Ink render tree from holding massive strings (>5KB in state = forbidden)
- Context window inflation from a single large tool result
- Memory pressure during long sessions

**The user never sees this happen.** The reference is transparent to the LLM. The full content is available if requested.

### 4.4 — Cost Budget Enforcement

The `CostTracker` uses **cache-aware pricing** with these exact multipliers:
- **Cache reads:** 10% of input price per million tokens
- **Cache creation:** 125% of input price per million tokens

**Budget enforcement is two-tier:**
- **80% threshold** → `console.warn` — user sees a yellow warning in the StatusBar
- **100% threshold** → `throw CostBudgetExceededError` — loop terminates gracefully

The CostTracker includes:
- A full price table with 22+ model entries (input and output separately)
- `_bestMatchPrice()` prefix-matching for model aliases (e.g., `claude-3-opus-20240229` matches `claude-3-opus`)
- `toSnapshot()` / `fromSnapshot()` for session persistence — cost tracking survives compaction and session restore
- `formatSummary()` for human-readable per-model breakdowns (rendered by `/cost` command)

### 4.5 — Retry Logic

The retry classifier differentiates errors by type, not by hope:

| Category | HTTP Codes | Behavior |
|:---|:---|:---|
| **Never retry** | 400, 401, 403, 404, 413, 422, context-length, auth errors | Raise immediately — retrying won't help |
| **Always retry** | 429, 500, 502, 503, 529, `TimeoutError`, `ConnectionResetError` | Backoff: `delay = min(base × 2^attempt + jitter, maxDelay)` |
| **Special case** | `ConnectionRefusedError` | NOT retryable — server isn't running |

Colony's own error classes drive this before HTTP status codes:
- `LLMConnectionError` → always retryable
- `LLMRateLimitError` → always retryable
- `LLMResponseError` → never retryable

### 4.6 — Caste-Aware Context Compaction

The `CompactionEngine` implements **6 strategies** with increasing aggression:

| Strategy | Trigger | Behavior |
|:---|:---|:---|
| `standard` | Usage >80% of context window | Summarize older messages, preserve recent N |
| `micro` | Individual tool result too large | Truncate oversized results inline |
| `reactive` | API returns context-length error | Emergency aggressive compaction |
| `session_memory` | Cross-compaction | Preserve key memories across compaction boundaries |
| `cached_micro` | Cache cold (>5 min idle) | Proactively clear stale tool results |
| `context_collapse` | Extreme pressure | Nuclear option — collapse everything to summary |

**Caste-aware retention counts:**

| Caste | Messages Preserved | Rationale |
|:---|:---:|:---|
| Queen | 20 | Sovereign decisions need maximum context |
| Vigil-ant | 14 | Security investigations need audit trail |
| Assist-Ant | 12 | User-facing work needs good conversation memory |
| Develop-ant | 12 | Builders need code context |
| Logist-ant | 10 | Operators need recent infrastructure state |
| Cogniz-ant | 10 | Memory and documentation work needs source context |
| Inform-ant | 8 | Fetchers are stateless by nature |
| Account-ant | 8 | Auditors track via external ledger |
| Consult-ant | 8 | Reviewers and observers should stay lightweight |

**Time-based micro-compaction:** If the user is idle for >5 minutes, stale tool results are proactively cleared *before* the next request. This prevents expensive prompt cache rewrites when the user returns after a break.

---

## 5. Security Mesh — The Invisible Shield

These systems fire **before the LLM ever sees the request**, making security deterministic rather than probabilistic.

### 5.1 — Heap Protection
`enable_heap_protection()` runs at CLI startup — **before any secrets are loaded** — to prevent ptrace/core-dump extraction of API keys.
- Linux/macOS: `prctl(PR_SET_DUMPABLE, 0)` via Bun FFI
- Windows: Graceful degradation (no equivalent)

### 5.2 — Log Sanitizer
Installed immediately at process start (not after lifespan context). Strips API keys, tokens, and secrets from **all** console output using pattern matching. The sanitizer catches:
- Bearer tokens
- API key patterns (`sk-`, `key-`, etc.)
- Base64-encoded credentials
- Connection strings with embedded passwords

### 5.3 — Bash Security Classifier
Pure TypeScript, zero dependencies. 5 detection layers:

1. **Safe prefixes** (frozen set): `ls`, `cat`, `head`, `tail`, `wc`, `echo`, `pwd`, `git status`, `git log`, `git diff`, `python --version` …
2. **Blocked prefixes** (frozen set): `sudo`, `su`, `mount`, `shutdown`, `reboot`, `passwd`, `useradd` …
3. **Dangerous patterns** (10+ regex): fork-bomb `:()\{`, pipe-to-shell `| bash`, `rm -rf /`, `curl | sh`, write to `/etc/` …
4. **Injection patterns** (6 regex): backtick substitution, `$(...)`, `eval`, `exec`, `source`, dot-source …
5. **Pipeline parser**: Split on `|`, `||`, `&&`, `;` and classify each segment independently. Return the **worst** risk level.

**Output:** `"safe"` | `"needs_approval"` | `"dangerous"` | `"blocked"`

### 5.4 — SSRF Guard
Blocks requests to:
- `169.254.169.254` (AWS metadata)
- `metadata.google.internal` (GCP metadata)
- `localhost`, `127.0.0.1`, `::1` (loopback)
- Private IP ranges (`10.x`, `172.16-31.x`, `192.168.x`)

### 5.5 — Path Validator
Blocks:
- Path traversal (`../../../etc/passwd`)
- Sensitive files (`.env`, `*.pem`, `*.key`, `id_rsa`)
- System directories (`/etc/`, `/sys/`, `/proc/`)

### 5.6 — Interactive Approval
Commands classified as `needs_approval` **halt the AgentLoop** via a Promise + resolver pattern:
```
⚠ Develop-ant wants to run: npm install express
  Risk: needs_approval
  [Y] Allow  [N] Deny  [A] Allow all this session
```
The loop suspends. The UI renders `<ApprovalPrompt>`. The user responds. The Promise resolves. The loop resumes. **No tool executes without permission.**

---

## 6. LLM Provider Philosophy

### Zero SDK Dependencies
All providers (Ollama, Anthropic, OpenAI-compatible) use **raw `fetch()`**. No `@anthropic-ai/sdk`, no `openai` package. This means:
- Zero supply-chain risk from LLM SDKs
- Complete control over request/response format
- Works with any OpenAI-compatible endpoint (OpenRouter, Together, Groq, etc.)

### Provider Priority Chain
```
Ollama (local, free) → Anthropic (Claude) → OpenAI-compatible → Gemini
```

### Failover Mesh
The `FailoverExecutor` walks a list of `ModelCandidate` objects in priority order:
- Per-candidate: retry with exponential backoff
- If retries exhausted: fail over to next candidate
- `LLMResponseError` (bad request, auth failure) → raise immediately, no failover
- `LLMConnectionError` / `LLMRateLimitError` → fail over

The `CircuitBreaker` protects against cascading failures:
- **CLOSED** → normal operation
- **OPEN** → after 3 consecutive failures, stop trying (cooldown period)
- **HALF_OPEN** → after cooldown expires, send one probe request
- Success → back to CLOSED; failure → back to OPEN

### Effort-Based Model Selection
The `EffortResolver` classifies tasks by complexity:
- **LOW** (simple lookup, formatting) → Ollama (free)
- **MEDIUM** (code review, refactoring) → Claude Haiku / GPT-4o-mini
- **HIGH** (architecture, multi-file generation) → Claude Opus → GPT-4o → Ollama fallback

---

## 7. Decision Making & Execution Geometry

The Colony prohibits agents from executing tasks blindly. The system follows the
**12-caste method workflow**: user intent is routed through explicit intake,
architecture, command planning, security, accounting, implementation,
verification, memory, final decision, and user-facing explanation boundaries.

### The Method Gating Pipeline

Before `Develop-ant` mutates files or runs approved implementation work, the
task must pass through method gates:

1. **Assist-Ant:** Captures the operator intent and returns final user-facing truth.
2. **Eldest:** Frames architecture, standards, and technical synthesis.
3. **Command-ant:** Plans execution, assigns work, and sequences tasks without default mutation authority.
4. **Vigil-ant:** Applies policy, security review, approval gates, and vetoes unsafe action.
5. **Account-ant:** Checks budget, provenance, and cost/accounting constraints.
6. **Develop-ant:** Performs scoped implementation only after the applicable approval gates.
7. **Consult-ant:** Runs verification, review, observability checks, and evidence aggregation.
8. **Cogniz-ant:** Preserves exact transcript truth separately from derived memory and MemPalace routing.
9. **Queen:** Resolves high-risk transitions and final workflow decisions.

The standard route is:

```text
Assist-Ant -> Eldest -> Command-ant -> Vigil-ant -> Account-ant -> Develop-ant -> Consult-ant -> Vigil-ant -> Cogniz-ant -> Queen -> Assist-Ant
```

High-risk work pauses before mutation until the human operator approves the
action and `Vigil-ant` clears the policy boundary.

> [!NOTE]
> **Implementation reality check:** The code implements this behavior through
> `ToolPermissionChecker.evaluate()`, `BashSecurityClassifier`,
> `BashValidatorPipeline`, workflow approval gates, and caste-aware permission
> defaults. The end result is the same: no uninspected task reaches mutation.

### The 5-Minute RED-GREEN-REFACTOR TDD Loop

Once logic reaches `Develop-ant`, it kicks off an extremely tight execution cycle:

1. `Consult-ant` or `Command-ant` defines the focused verification target (RED).
2. `Develop-ant` implements the narrowest scoped change locally.
3. `Consult-ant` runs the focused verification and review checks.
4. If it fails, the evidence cycles back to `Develop-ant` without expanding scope.
5. If it hits maximum retries, the loop **aborts** to prevent "AI Slop."

If all checks pass, `Queen` or `Assist-Ant` reports the evidence and remaining
risk to the operator.

---

## 8. The Ant Farm — Terminal Aesthetics

The Colony's terminal UI is called **The Ant Farm**. It is not decorative — it is a radical transparency mechanism. Every thought, test run, tool call, and internal debate is visible.

### Layout
```
┌──────────────────────────────────────────────────────┐
│  THE COLONY v2.0.0 │ Caste: Develop-ant │ $0.0042  │  ← StatusBar
├────────────────────────────────┬─────────────────────┤
│                                │  Tool Activity       │
│  Chat Panel                    │  ─────────────────   │
│  (streaming output)            │  ✓ read_file (42ms)  │  ← ToolActivityPanel
│                                │  ⏳ shell_exec...     │
│                                │  ✗ http_fetch (403)  │
├────────────────────────────────┴─────────────────────┤
│  > User input here...                                 │  ← ChatInput
└──────────────────────────────────────────────────────┘
```

### Anti-Flicker Rendering
Ink re-renders the full component tree on every `setState`. Token-by-token streaming at LLM speed would cause 100+ re-renders per second, causing visible flicker and performance degradation. The Colony uses a 3-layer mitigation:

1. **Accumulate in `useRef`** — deltas arrive from the streaming generator and are stored in a ref (no re-render triggered)
2. **Flush via `setInterval(50ms)`** — a timer flushes the ref buffer to `useState` at most 20 times per second
3. **`React.memo` on static panels** — StatusBar, ToolActivityPanel, and other non-streaming components are memoized

**The result:** Smooth, readable streaming output at high token rates with zero visible flicker.

### Interrupt Handling
During active loops, `ink-text-input` captures stdin exclusively — the user can't type `/cancel`. The Colony intercepts this:
- `Ctrl+C` → graceful cancellation (kill switch, not process exit)
- `Escape` → cancel current operation
- Both are caught via `useInput()` in raw mode, bypassing the text input component

### TTY Guard
If The Colony is launched in a non-TTY environment (piped shell, CI runner), it prints a clean message and exits with code 1 instead of crashing with a React stack trace.

---

## 9. Bootstrap & Lifecycle

### Boot Order
The `BootstrapCoordinator` enforces strict dependency order:
```
Store → Security → LLM Registry → Gateway
```

### Teardown Order (reverse)
```
Gateway → LLM Registry → Security → Store
```

### Failure Policy
- **Critical subsystem fails** → throw `BootstrapError`, halt the colony entirely
- **Non-critical subsystem fails** → log warning, continue with degraded functionality

### What Runs Before Anything Else
1. **Heap protection** — before any secrets are loaded
2. **Log sanitizer** — before any output is emitted
3. **Settings resolution** — env → config.json → defaults
4. **Manifesto loading** — the ethical guardrails are non-negotiable

---

## 10. Differentiators

| Feature | The Colony | OpenClaw | Claude Code |
|:---|:---|:---|:---|
| **Permission model** | Per-caste matrix with 4-level resolution | Owner/non-owner binary | Per-tool approval prompts |
| **Shell security** | 5-layer classifier (safe → blocked), pipeline parser | Docker sandbox for non-main | Single bash tool with allow/deny |
| **Cost control** | Effort-based routing, budget gate, 80% warning, per-model tracking | Usage tracking only | None built-in |
| **Context management** | 6 compaction strategies, caste-aware retention | Session pruning | `/compact` command |
| **Provider failover** | Circuit breaker + candidate chain + effort resolver | Model failover config | Single provider |
| **UI transparency** | Every tool call visible in real-time panel | WebChat | Streaming text output |
| **Local-first** | Ollama default, zero API cost baseline | Cloud APIs required | Anthropic API required |
| **LLM SDKs** | Zero (raw fetch) | SDK-based | SDK-based |

* **The Sandboxed Forager:** When a developer leaves their desk, `The Forager` background process wakes up, utilizing local CPU cycles to analyze previous Git Diffs and queue up hyper-relevant context dynamically upon the user's return.
* **Radical Transparency:** The React Ink `Ant Farm` terminal exposes every thought, test run, and internal Swarm debate natively in the UI. No hidden thinking tokens.
* **Enterprise-Level Trust:** By applying 35 static security rules and a 5-layer bash classifier *before* invoking expensive LLMs, The Colony achieves a deterministic safety layer that probabilistic approaches cannot match.
