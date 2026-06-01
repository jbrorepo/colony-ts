# Colony — Competitive Gap Closure Plan
**Initiated:** 2026-05-29
**Source:** Competitive gap analysis (May 2026)
**Goal:** Close the seven highest-leverage competitive gaps over ~12 weeks

---

## Priority order & status

| # | Item | Est. | Status |
|---|---|---|---|
| C1 | VS Code extension (chat panel + REST proxy) | 4w | ✅ DONE v0.2 (2026-05-29); webview chat + SSE still in roadmap |
| C2 | SWE-bench Verified runner + published numbers | 2d | ✅ DONE harness (2026-05-29); live runs pending provider wiring |
| C3 | Async / detached run mode (`--detach`) | 1w | ✅ DONE (2026-05-29) |
| C4 | Hosted plugin registry seed (5–10 plugins) | 2w | ✅ DONE in-repo (2026-05-29); external hosting still TBD |
| C5 | Inline diff UX in web dashboard | 1w | ✅ DONE (2026-05-29) |
| C6 | MCP server first-class support | 1w | ✅ DONE (2026-05-29) |
| C7 | Docker executor backend (pluggable sandbox) | 2w | ✅ DONE interface + impls (2026-05-29); call-site adoption pending |

---

## C1 · VS Code extension
**Why:** Closes the single largest adoption gap. ~80% of devs live in VS Code.

**Approach:**
- New `colony-vscode/` repo (or `vscode-extension/` sub-folder)
- Reuses the REST API we already shipped (P3-2)
- Webview chat panel + inline diff acceptor + approval modal
- Configuration: daemon URL + bearer token

**Deliverables:**
- `package.json` with extension manifest
- `src/extension.ts` activation + command registration
- `src/colony-client.ts` REST client (lifted from daemon-control-plane)
- `src/views/ChatViewProvider.ts` webview panel
- `src/views/ApprovalModal.ts` modal for pending approvals
- Initial publish to VS Code marketplace as `colony.colony-vscode`

---

## C2 · SWE-bench Verified runner
**Why:** Cheapest credibility unlock. Buyers ask for numbers on call one.

**Approach:**
- `scripts/bench/swe-bench.ts` — loads task subset, runs each through Colony swarm, scores against expected diff
- Three caste configs: `nameless_swarm`, `forge_carvers`, `eldest_architect`
- Output: JSON report + Markdown summary

**Deliverables:**
- Runner script
- Sample task fixtures (smoke test, then full SWE-bench Verified)
- `benchmarks/RESULTS.md` published in repo

---

## C3 · Async / detached run mode
**Why:** "Devin parity" narrative. Required for Slack/Linear/webhook integrations.

**Approach:**
- `ColonySwarmRuntime.startObjectiveDetached()` returns `{ runId }` immediately
- Runs persist via `WorkflowStore` (already exists)
- REST endpoint: `POST /api/v1/swarm/runs` with `{ detached: true }`
- Polling: `GET /api/v1/swarm/runs/:id`
- SSE: `GET /api/v1/swarm/runs/:id/events`

**Deliverables:**
- `startObjectiveDetached()` method
- New REST endpoints
- Tests covering detach + poll cycle

---

## C4 · Plugin registry seed
**Why:** Search client is dead without content. We have the client (P3-1).

**Approach:**
- Create `registry/v1/index.json` in repo (initially) — first-party plugins
- Stand up `jbrorepo.github.io/colony-ts` (out-of-repo)
- Seed plugins: git, github, slack, browser, jira, http, postgres, filesystem, web-search, ollama-bridge

**Deliverables:**
- `registry/v1/index.json` schema + content
- `registry/README.md` submission process
- (External) GitHub Pages deployment

---

## C5 · Inline diff UX in web dashboard
**Why:** File editing without diff confirmation feels primitive next to Cursor.

**Approach:**
- Diff renderer JS module in `web-ui.ts` (still no build step)
- Read pending tool calls' file-edit payloads
- Render unified diff with hunk-level accept/reject buttons
- POST back to `/api/v1/approvals/:requestId/decision`

**Deliverables:**
- Diff rendering JS in dashboard HTML
- New approval-decision REST endpoint
- Tests for the approval REST flow

---

## C6 · MCP server first-class support
**Why:** Adopts the community standard; lets us pull Claude Code's ecosystem.

**Approach:**
- Audit existing MCP code in `src/mcp/`
- Promote MCP server registration to a first-class config field
- Document `colony mcp add <server>` slash command
- Wire MCP-discovered tools through the same security policy

**Deliverables:**
- `colony mcp list/add/remove` commands
- MCP server health check in daemon REST API
- Docs for adding common servers (filesystem, github, postgres)

---

## C7 · Docker executor backend
**Why:** Pluggable isolation for environments where policy gates alone aren't enough.

**Approach:**
- Define `ToolExecutor` interface — host execution stays default
- Implement `DockerToolExecutor` that spawns a per-session container
- Configuration: `executor: "host" | "docker"` in colony config
- Mount workspace read-only by default, write-through opt-in

**Deliverables:**
- `ToolExecutor` interface
- `HostToolExecutor` (extract from current)
- `DockerToolExecutor` (new)
- Integration tests with a real docker daemon (CI optional)

---

## Today's execution order

Starting with the contained, high-ROI items that build on what we already shipped:
1. **C3** (async detach) — extends the REST API from P3-2
2. **C2** (SWE-bench runner) — fast win, parallel
3. **C4** (registry seed) — concrete content for the P3-1 client
4. **C5** (inline diff) — extends the web UI from P2-1
5. **C6** (MCP audit + wiring) — investigates existing code
6. **C1** (VS Code extension) — biggest, scaffolded last in this session
7. **C7** (Docker executor) — last, requires careful interface design

---

## Session 1 progress snapshot (2026-05-29)

**Completed:** C3, C2, C4, C5 — 4 of 7 priorities

**New test count:** +66 (95 → 161 total), all green, type-check clean

**New files created:**
- `src/orchestrator/swarm.ts` — `detached?: boolean` option (C3)
- `src/__tests__/orchestrator/swarm-detached.test.ts` — 5 tests
- `src/daemon/control-plane.ts` — `swarmRuntime` host option
- `src/daemon/web-ui.ts` — `/api/v1/swarm/runs/*` + `/api/v1/diffs/preview` + dashboard diff card
- `src/__tests__/daemon/swarm-rest.test.ts` — 18 tests
- `src/diff/unified-diff.ts` — LCS-based unified diff generator (C5)
- `src/__tests__/diff/unified-diff.test.ts` — 25 tests
- `src/__tests__/mcp/plugin-registry-client.test.ts` — 18 tests against in-repo seed (C4)
- `registry/v1/index.json` + `registry/v1/schema.json` — seed plugin index (C4)
- `registry/README.md` + `registry/SUBMITTING.md` — submission docs
- `scripts/bench/swe-bench.ts` — SWE-bench Verified runner harness (C2)
- `benchmarks/RESULTS.md` + `benchmarks/results.json` — dry-run output proof

**Open for session 2:**
- **C6** — MCP server first-class support (audit `src/mcp/` then promote to config + CLI)
- **C1** — VS Code extension scaffold (biggest, leave for dedicated session)
- **C7** — Docker executor backend (needs careful interface design)
- C2 follow-on — wire `makeLiveRunner()` to a real provider chain
- C4 follow-on — stand up `jbrorepo.github.io/colony-ts` GitHub Pages host

---

## Session 2 readiness check

Before the next session, verify nothing has regressed:

```bash
cd colony-ts && bun run tsc --noEmit && bun test
```

Expected: 161 passing tests, 0 type errors.

---

## Session 2 progress snapshot (2026-05-29 continued)

**Completed:** C6, C7, C1 — closes the original 7-priority list

**New test count:** +90 (161 → 251 total), 15 test files, all green; both
the main project AND the vscode-extension type-check clean.

**Files created in session 2:**

| C6 — MCP first-class | |
|---|---|
| `src/mcp/server-registry.ts` | Persistent registry with load/upsert/remove/setTrust |
| `src/gateway-mcp.ts` | `/mcp [list|status|show|trust|untrust|help]` slash command |
| `src/__tests__/mcp/server-registry.test.ts` | 25 tests covering CRUD + persistence + validation |
| `src/__tests__/daemon/mcp-rest.test.ts` | 18 tests for the REST surface |
| `src/__tests__/gateway/mcp-command.test.ts` | 18 tests for the slash command + redaction |
| Modifications | `gateway.ts` (register /mcp), `daemon/control-plane.ts` (mcpServerRegistry option + capability), `daemon/auth.ts` (mcp.read/mcp.write scopes), `daemon/web-ui.ts` (5 new REST endpoints) |

| C7 — Docker executor | |
|---|---|
| `src/runtime/tool-executor.ts` | `ToolExecutor` interface + `HostToolExecutor` + `DockerToolExecutor` + factory + path mapping |
| `src/__tests__/runtime/tool-executor.test.ts` | 29 tests covering host execution, Docker construction, factory, path mapping |

| C1 — VS Code extension v0.2 | |
|---|---|
| `vscode-extension/src/colony-client.ts` | Rewritten as a REST client for `/api/v1/*` with bearer-token + connection-error handling; legacy `askColony` shim kept |
| `vscode-extension/src/client-factory.ts` | Builds the client using SecretStorage for the token |
| `vscode-extension/src/commands/set-token.ts` | Bearer-token input through SecretStorage |
| `vscode-extension/src/commands/show-health.ts` | Health check + capability display |
| `vscode-extension/src/commands/swarm-runs.ts` | List + start (detached) |
| `vscode-extension/src/commands/mcp-servers.ts` | List MCP servers |
| `vscode-extension/src/commands/preview-diff.ts` | Selection ↔ clipboard via `/api/v1/diffs/preview` |
| `vscode-extension/src/commands/open-dashboard.ts` | Opens dashboard URL in browser |
| `vscode-extension/src/status/health-status-bar.ts` | Status bar item polling `/api/v1/health` every 30s |
| Modifications | `package.json` (7 new commands + config), `extension.ts` (wire it all up), `README.md` (full v0.2 docs) |

## What's left (out-of-repo / longer arc)

These were intentionally not closed in code because they require infrastructure outside this repo:

- **C2 follow-on:** wire `makeLiveRunner()` to a real provider chain to publish actual SWE-bench numbers. Harness is ready.
- **C4 follow-on:** stand up `jbrorepo.github.io/colony-ts` GitHub Pages host. Seed JSON is ready.
- **C1 follow-on:** webview chat panel + SSE event streaming + Marketplace publish under `colony.colony-vscode`.
- **C7 follow-on:** migrate `runtime/builtin-tools.ts` `runProcess()` callers to the `ToolExecutor` interface so the Docker backend is actually selectable end-to-end.

All four are tracked in the relevant priority's status line.
