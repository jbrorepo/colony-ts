# Colony — Implementation Plan
**Based on:** Comprehensive Project Review (May 26, 2026)  
**Goal:** Fix all identified issues and close competitive gaps within 90 days

---

## Overview

The review identified 4 tiers of work:

| Priority | Theme | Timeline |
|---|---|---|
| P0 — Immediate | Repo hygiene + API breakage | Week 1 |
| P1 — High | Production safety + DX | Weeks 2–6 |
| P2 — Strategic | Market surface expansion | Weeks 7–13 |
| P3 — Positioning | Ecosystem + polish | Week 14+ |

---

## P0 — Immediate Fixes (Week 1)
*Zero-regression changes. Each is independent and can be done in any order.*

### P0-1 · Update outdated Claude model IDs ✅ DONE (2026-05-27)
**File:** [`src/llm/providers/anthropic.ts`](src/llm/providers/anthropic.ts) (L35–60, L86)  
**Issue:** `KNOWN_MODELS` references `claude-sonnet-4-5-20250929` and `claude-haiku-4-5-20250929`. Current models as of May 2026: `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`. `claude-opus-4-6` is already present. The stale default model at L86 will fail for new users on first run.

**Changes:**
- Add `claude-sonnet-4-6` (200k ctx, all capabilities) to `KNOWN_MODELS`
- Add `claude-haiku-4-5-20251001` to `KNOWN_MODELS`
- Mark `claude-sonnet-4-5-20250929` as `legacy: true` (keep for backwards compat)
- Mark `claude-haiku-4-5-20250929` as `legacy: true`
- Change `_defaultModel` fallback at L86 to `claude-sonnet-4-6`

**Effort:** 30 min

---

### P0-2 · Fix healthCheck() to stop burning tokens ✅ DONE (2026-05-27)
**File:** [`src/llm/providers/anthropic.ts`](src/llm/providers/anthropic.ts) (L354–370)  
**Issue:** `healthCheck()` sends a live `/v1/messages` POST with `model`, `max_tokens: 1`, and content `"ping"`. This charges the user's API key on every health-check invocation.

**Change:** Replace the POST to `/v1/messages` with a GET to `/v1/models`:
```typescript
async healthCheck(): Promise<boolean> {
  try {
    const resp = await fetch(`${this._apiBase}/v1/models`, {
      method: "GET",
      headers: { "x-api-key": this._apiKey, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(10000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
```
**Effort:** 30 min

---

### P0-3 · Verify .gitignore covers all .tmp-* directories ✅ DONE (2026-05-27)
**File:** [`.gitignore`](.gitignore)  
**Observation:** `.gitignore` already contains `.tmp-*/` pattern (line 14). However, there are 200+ `.tmp-*` directories in the working tree. Confirm they are not tracked if/when this project enters git, and clean them up from disk to reduce clone noise.

**Actions:**
- Run `git status --short | grep ".tmp-"` to confirm no tracked tmp dirs if repo is initialized
- Add an npm/bun script `"clean:tmp": "rimraf .tmp-*"` to `package.json` for developer convenience
- Document in `CONTRIBUTING.md` that `.tmp-*` dirs are auto-generated and should never be committed

**Effort:** 15 min

---

## P1 — High Priority Fixes (Weeks 2–6)
*Production safety, performance, and test infrastructure. Do these before any public release.*

### P1-1 · Cap evaluationLog to prevent memory leak ✅ DONE (2026-05-27)
**File:** [`src/security/policy.ts`](src/security/policy.ts) (L118–200)  
**Issue:** `private readonly evaluationLog: PolicyEvaluationLogEntry[] = []` grows forever. On long-running sessions with many tool calls this becomes a heap leak. Also a DoS vector — an attacker causing many policy evaluations can force heap exhaustion.

**Change:**
1. Add `maxLogEntries: number` to `PolicyEngineConfig` (default `5000`)
2. In `logEvaluation()`, check length before pushing; if at limit, remove the oldest entry:
```typescript
private logEvaluation(evaluation: PolicyEvaluation): void {
  // ... build entry ...
  if (this.evaluationLog.length >= this.config.maxLogEntries) {
    this.evaluationLog.shift(); // O(n) but acceptable at 5000 entries
  }
  this.evaluationLog.push(entry);
}
```
**Effort:** 2 hours (include unit tests)

---

### P1-2 · Memoize globMatch regex compilation ✅ DONE (2026-05-27)
**File:** [`src/security/policy.ts`](src/security/policy.ts) (L253–256)  
**Issue:** `globMatch()` calls `new RegExp(...)` on every invocation. With many tool calls per session, this function is hot — the policy engine calls it twice per rule per evaluation (action + resource patterns).

**Change:** Add a module-level cache map and populate lazily:
```typescript
const _regexCache = new Map<string, RegExp>();

function globMatch(value: string, pattern: string): boolean {
  let regex = _regexCache.get(pattern);
  if (!regex) {
    regex = new RegExp(`^${escapeRegex(pattern).replace(/\*/g, ".*").replace(/\\\?/g, ".")}$`);
    _regexCache.set(pattern, regex);
  }
  return regex.test(value);
}
```
**Effort:** 1 hour

---

### P1-3 · Move MemoryWorkflowStore to workflow module ✅ DONE (2026-05-27)
**Files:**  
- [`src/orchestrator/swarm.ts`](src/orchestrator/swarm.ts) (L688–end of class)  
- New: `src/workflow/memory-store.ts`

**Issue:** `MemoryWorkflowStore` is defined inside the swarm orchestrator module, crossing the swarm/workflow boundary. It cannot be tested without importing the entire swarm module. Note: `InMemoryWorkflowStore` already exists in `src/workflow/recipes/executable-recipes.ts` — the two implementations should be consolidated.

**Changes:**
1. Create `src/workflow/memory-store.ts` that exports `MemoryWorkflowStore implements WorkflowStore`
2. Merge/reconcile with `InMemoryWorkflowStore` from `executable-recipes.ts` (they are functionally identical)
3. Update `swarm.ts` to import from `../workflow/memory-store`
4. Update `executable-recipes.ts` to import from `../memory-store`
5. Write a dedicated unit test in `src/__tests__/workflow/memory-store.test.ts`

**Effort:** 3 hours

---

### P1-4 · Consolidate BudgetPanel's Zustand subscriptions ✅ DONE (2026-05-27)
**File:** [`src/ui/app.tsx`](src/ui/app.tsx) (L461–567)  
**Issue:** `app.tsx` contains 111 `useColonyStore()` calls total. The BudgetPanel component (lines 461–567) has 25+ individual selector calls. In Zustand each call is a separate subscriber, meaning 25+ separate re-render triggers per state change on a panel that only shows when `showBudget === true`.

**Change:** Use a single batched selector with shallow equality:
```typescript
import { shallow } from "zustand/shallow";

const budget = useColonyStore(
  (s) => ({
    tokensUsed: s.tokensUsed,
    maxTokens: s.maxTokens,
    cost: s.cost,
    contextUsage: s.contextUsage,
    // ... all needed fields
  }),
  shallow
);
```
Apply the same pattern to other panel components in the file.

**Effort:** 2 hours

---

### P1-5 · Upgrade session ID entropy ✅ DONE (2026-05-27)
**File:** [`src/runtime/session.ts`](src/runtime/session.ts) (L25–27)  
**Issue:** `newSessionId()` returns `ses_` + 12 hex chars (48 bits of entropy). As Colony moves toward multi-tenant deployments, full UUID entropy (122 bits) is required by security best practices.

**Change:**
```typescript
function newSessionId(): string {
  return `ses_${randomUUID()}`;  // ses_xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
}
```
Update any code that assumes the session ID format (length checks, regex patterns). Add a migration note to CHANGELOG.

**Effort:** 30 min + search for format dependencies

---

### P1-6 · Migrate to bun test (test infrastructure overhaul) ✅ DONE (2026-05-27)
**Issue:** 391 sequential `verify-phase{N}.ts` scripts chained via `&&` in `package.json`. No test framework, no isolation, no parallelism, no negative testing, no contributor template.

**Strategy:** Preserve the verify scripts as integration gates. Layer a proper test framework on top.

**Phase 1 — Setup ✅:**
- Created `src/__tests__/` mirroring `src/` structure
- Added `"test": "bun test"` and `"test:watch": "bun test --watch"` to `package.json`
- Added `"test:integration": "bun run verify:alpha0"` (runs first verify script as smoke gate)
- Created `src/__tests__/README.md` with contributor test-writing guide

**Phase 2 — Convert highest-value modules ✅ (95 tests, 7 files, all green):**
1. `src/__tests__/security/policy.test.ts` ✅ — evaluationLog cap, globMatch, caste rules
2. `src/__tests__/security/path-validator.test.ts` ✅ — traversal protection, sanitizePathKey, null bytes, URL-encoded attacks
3. `src/__tests__/runtime/session.test.ts` ✅ — session lifecycle, ID entropy
4. `src/__tests__/llm/failover-executor.test.ts` ✅ — backoff, circuit breaker, failover ordering, event management
5. `src/__tests__/llm/anthropic.test.ts` ✅ — healthCheck, error mapping
6. `src/__tests__/workflow/memory-store.test.ts` ✅ — CRUD, concurrency
7. `src/__tests__/orchestrator/swarm-concurrency.test.ts` ✅ — semaphore, serial mode, slot release

**Phase 3 — CI integration ✅:**
- Added `.github/workflows/ci.yml` — runs `bun test` on push/PR (Ubuntu latest, Bun 1.x)
- Keep all 391 verify scripts but move them to `scripts/verify/` to unclutter `src/`

**Do not delete the verify scripts.** They encode real behavioral knowledge. Convert them to `bun test` format module by module; run the originals in CI until each module is fully converted.

**Effort:** 2–3 weeks total (can be done in parallel with P1-1 through P1-5)

---

### P1-7 · Split app.tsx monolith into panel components ✅ DONE (2026-05-27)
**File:** [`src/ui/app.tsx`](src/ui/app.tsx) (715 lines → ~120 lines)  
**Issue:** All panel components (HeaderPanel, WelcomePanel, LogPanel, BudgetPanel, StatusPanel, InputPanel), utility functions, event handlers, and the root component live in a single 715-line file.

**Implemented structure:**
```
src/ui/
  app.tsx              ✅ Root component only (~120 lines)
  panels/
    HeaderPanel.tsx    ✅ batched useShallow selector
    WelcomePanel.tsx   ✅ batched useShallow selector
    LogPanel.tsx       ✅
    BudgetPanel.tsx    ✅ batched useShallow selector (P1-4)
    StatusPanel.tsx    ✅ batched useShallow selector
    InputPanel.tsx     ✅ batched useShallow selector
  hooks/
    useCommandDispatch.ts   ✅ Extracted from handleSubmit
  store.ts             ✅ Zustand store (already separate)
  hotkeys.ts           ✅ Already separate
```

**Changes:**
1. Extracted all panel components to `src/ui/panels/` (already done — P1-4)
2. Extracted `handleSubmit` into `src/ui/hooks/useCommandDispatch.ts`
   - Reactive Zustand reads that are only needed at dispatch-time (`recentHookEvents`, `recentCompactions`, `latestCompactionHandoff`) moved to `getState()` inside the callback — removes 3 entries from dep array
   - dep array: 22 entries → 19 (with the 3 store removals); more importantly, dispatch logic is encapsulated and independently readable
3. Updated `app.tsx` imports; removed `buildCostSummary` (moved to hook file)
4. `bun run tsc --noEmit` → 0 errors; `bun test` → 95/95 pass

**Effort:** 1 day

---

## P2 — Strategic Expansion (Weeks 7–13)
*Market surface and competitive parity work.*

### P2-1 · Local web UI on localhost:3000 ✅ DONE (2026-05-27)
**Issue:** Terminal-only limits addressable audience. The daemon and control plane already exist. This is a UI layer addition.

**Implemented:**
- Created `src/daemon/web-ui.ts` — embedded single-file HTML dashboard (no build step)
- Routes: `GET /` → dashboard HTML, `GET /api/v1/health`, `GET /api/v1/sessions`
- Modified `DaemonHttpControlPlaneServer` in `src/daemon/http-transport.ts` to route web UI GETs before the control-plane POST handler
- Added `webUI?: boolean` option (default `true`) and `baseUrl` getter
- Dashboard auto-refreshes every 10 seconds; shows daemon status, capabilities, session table
- No external dependencies — pure vanilla HTML/CSS/JS served as a template string

**Follow-up for v2:** Add WebSocket streaming events, chat interface, approval dialogs (P3-2 scope).

---

### P2-2 · npx install path via Node.js shim ✅ DONE (2026-05-27)
**Issue:** Requiring Bun blocks ~98% of the Node.js developer audience (Node: ~50M weekly downloads vs Bun: ~1M).

**Implemented:**
- Created `bin/colony.mjs` — Node.js ESM shim that detects `bun` via `spawnSync` and delegates
- Shows a helpful install guide if Bun is not found (with OS-specific install commands)
- Updated `package.json`: name → `@colony/cli`, `bin.colony` → `./bin/colony.mjs`
- Added `publishConfig` (access: public, registry: npmjs.org)
- Added `files` field to control what ships in the npm tarball
- Added `engines.node >= 18.0.0`

---

### P2-3 · True parallel swarm workers ✅ DONE (2026-05-27)
**File:** [`src/orchestrator/swarm.ts`](src/orchestrator/swarm.ts)  
**Issue:** The plan→execute→review cycle is sequential. When multiple swarm runs are in-flight simultaneously, they block each other.

**Implemented:**
- Added `maxConcurrentRuns?: number` to `ColonySwarmRuntimeOptions` (default: 4)
- Added `_acquireRunSlot()` / `_releaseRunSlot()` Promise-based semaphore to `ColonySwarmRuntime`
- Wrapped `_runLlmStages()` and `_runPersistedLlmStages()` in `try/finally` semaphore guards
- All early-return paths (attempt exceeded, awaiting approval, stage failure) correctly release the slot via `finally`
- Preserves existing `startObjective` API contract — callers still receive the completed snapshot
- Effect: up to 4 LLM swarm runs can execute concurrently; additional runs queue until slots open

**Follow-up:** Within a single run, the `execute` stage itself could fan out sub-tasks in parallel when the plan stage returns multiple independent work items. That requires a structured plan output format (P3 scope).

---

### P2-4 · Improve approval prompt UX ✅ DONE (2026-05-28)
**File:** [`src/ui/app.tsx`](src/ui/app.tsx) → `src/ui/panels/InputPanel.tsx` after P1-7  
**Issue:** Approval options compressed to `y once, n deny, a exact-call, s inspect, esc cancel` with no visual hierarchy.

**Changes:**
- Render approval options as a labeled vertical list with color coding:
  - `[Y] Allow once` (green)
  - `[A] Allow this exact call always` (green dimmed)
  - `[S] Inspect call details` (blue)
  - `[N] Deny` (red)
  - `[Esc] Cancel run` (red dimmed)
- Add a `?` shortcut that opens a full keyboard reference overlay panel
- Reduce input placeholder to single most-relevant hint per state; move full hint set to the overlay

**Effort:** 1 day

---

### P2-5 · Keyboard shortcut reference panel ✅ DONE (2026-05-27)
**Issue:** Ctrl+B, Ctrl+C, Escape, PgUp/PgDn, Ctrl+L, session navigation shortcuts are all undiscoverable.

**Change:**
- `?` key or `/shortcuts` command renders a full-screen overlay listing all bindings
- Add to hotkeys.ts alongside existing bindings
- Show a one-line hint in the status bar on first launch: `Press ? for keyboard shortcuts`

**Effort:** 1 day

---

## P3 — Ecosystem & Positioning (Week 14+)

### P3-1 · Live plugin marketplace storefront ✅ DONE (client-side, 2026-05-27)
**Issue:** The 150-phase marketplace lifecycle infrastructure (phases 234–384) is complete but there is no browsable URL. The infrastructure exists without the storefront.

**Implemented (client-side tooling):**
- Created `src/mcp/plugin-registry-client.ts`:
  - `searchPluginRegistry(query, opts)` — fetches hosted JSON registry, filters client-side (query term never sent to server)
  - `formatPluginSearchResults(result, query)` — renders results as human-readable text
  - `PluginRegistryEntry` interface matches the hosted registry schema
  - Security: 8s timeout, schema validation, scrubs secrets from query via `scrubSecrets()`
  - Default registry URL: `https://jbrorepo.github.io/colony-ts/v1/index.json`
  - Injectable `fetchImpl` for testing without network calls
- Updated `gateway-plugins.ts` — added `/plugins search [term]` subcommand
  - Returns `plugin_search` action with query and registryUrl
  - Usage help updated to include `search`
- Updated `gateway-contract.ts` — added `{ kind: "plugin_search"; query: string; registryUrl?: string }` to `CommandAction`
- Updated `gateway-execute.ts` — handles `plugin_search` action:
  - Delegates to `handlers.searchPlugin?.(query, url)` if provided (injectable)
  - Falls back to default `searchPluginRegistry()` + `formatPluginSearchResults()` inline

**Remaining (external hosting, out of repo scope):**
- Stand up GitHub Pages site at `https://jbrorepo.github.io/colony-ts/`
- Add `v1/index.json` with initial curated plugin list
- Document plugin submission process / PR template
- Add featured/verified plugin badges to the web storefront

**Effort for remaining hosting work:** 1–2 weeks

---

### P3-2 · REST API for daemon control plane ✅ DONE (2026-05-27)
**Issue:** No documented API for programmatic integration (CI/CD, web apps, bots).

**Design:**
```
POST /api/v1/sessions          — create session
GET  /api/v1/sessions/:id      — session status
POST /api/v1/sessions/:id/run  — submit task
GET  /api/v1/sessions/:id/events — SSE stream of agent events
DELETE /api/v1/sessions/:id    — close session
GET  /api/v1/health            — daemon health + provider status
```

**Effort:** 2–3 weeks

---

### P3-3 · HMAC auth on daemon HTTP API ✅ DONE (2026-05-27)
**File:** [`src/daemon/http-transport.ts`](src/daemon/http-transport.ts), [`src/daemon/control-plane.ts`](src/daemon/control-plane.ts)  
**Issue:** Review flags that `auth.ts` exists but all daemon HTTP endpoints should be verified as requiring authentication. An agent with local network access could make unauthenticated requests.

**Changes:**
- Audit every route in `http-transport.ts` for auth middleware
- Ensure all routes (not just `/api/*`) go through the auth layer
- Consider HMAC signing for the REST API (P3-2) using a local secret generated on daemon start

**Effort:** 1–2 days

---

### P3-4 · Layer0 cache invalidation ✅ DONE (2026-05-27)
**File:** [`src/mempalace/layers.ts`](src/mempalace/layers.ts)  
**Issue:** `Layer0.render()` caches identity file content after first read and never invalidates. If the identity file changes on disk mid-session, stale content persists.

**Change:** Add a file watcher (Bun's `fs.watch`) on the identity file path. On change event, clear the cache:
```typescript
const watcher = watch(this._identityPath, () => { this._cache = null; });
```
Register cleanup in session teardown.

**Effort:** 2 hours

---

## Issues Confirmed Resolved / Partially Addressed

The following items from the review appear already addressed in the current codebase:

| Issue | Status |
|---|---|
| No exponential backoff on rate limit errors | **Already implemented** — `src/llm/failover-executor.ts` has jittered backoff with `Retry-After` header support |
| `.tmp-*/` in .gitignore | **Already present** — `.gitignore` line 14 covers the pattern; 200+ dirs present on disk but not tracked |
| `MemoryWorkflowStore` consolidation | **Partial** — `InMemoryWorkflowStore` exists in `workflow/recipes/executable-recipes.ts` but duplicate still in `swarm.ts` |

---

## 90-Day Timeline

```
Week 1       P0-1 model IDs, P0-2 healthCheck, P0-3 gitignore cleanup
Week 2       P1-1 evaluationLog cap, P1-2 globMatch memoize, P1-5 session ID
Week 3       P1-3 MemoryWorkflowStore move + consolidate
Week 4–5     P1-6 bun test setup + security/ and llm/ modules converted
Week 6       P1-4 Zustand selectors, P1-7 app.tsx split into panels/
Week 7–10    P2-1 Local web UI (daemon serves React SPA on :3000)
Week 11      P2-2 npx @colony/cli shim + Node.js compatibility audit
Week 12–13   P2-3 Parallel swarm workers, P2-4/P2-5 UX improvements
Week 14+     P3-1 Plugin marketplace, P3-2 REST API, P3-3 HMAC auth
```

---

## Things to Protect (Do Not Change)

From the review's "What to Protect" section — these are competitive advantages:

- **Zero vendor SDK policy** on LLM providers. Raw `fetch()` is correct. Do not add `@anthropic-ai/sdk` or `openai` packages.
- **Default-deny security policy.** Do not relax defaults for convenience.
- **Pure function session mutations** (`addMessage`, `markIdle`, `closeSession`). Do not convert to mutable class methods.
- **Input normalization at boundaries** (`normalizeSwarmRunSnapshot()` and peers). Extend, never remove.
- **391-phase behavioral coverage.** Convert to `bun test`; never delete.
- **Caveman bridge.** The token-compression bridge is a moat. Keep and extend it.
- **MemPalace 4-layer architecture.** Complete it; do not simplify.

---

## Competitive Positioning Target

After P0 + P1 + P2 execution:

| Gap vs. Competitors | Before | After |
|---|---|---|
| Install path | Bun-only | `npx @colony/cli` works |
| UI surface | Terminal-only | Terminal + Web (localhost:3000) |
| Test confidence | 391 sequential scripts | `bun test` parallel suite |
| Token waste | healthCheck burns tokens | Free GET /v1/models |
| Memory safety | Unbounded evaluationLog | Capped ring buffer |
| API surface | None | REST API for CI/CD integration |
| Model freshness | Stale 4-5 model IDs | Current 4-6 models default |

**Colony's sustainable moat:** Security-first local runtime for regulated industries. No cloud-only competitor can match the combination of caste-based RBAC, conservative approval gates, path traversal protection, audit trail, and Ollama-first offline operation. The work above makes that moat accessible to the developer audience that needs it.
