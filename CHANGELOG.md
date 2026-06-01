# Changelog

All notable changes to The Colony are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Documentation
- Distribution plan + publication-ready `README.md`
- `documentation/` directory with user-facing guides
- `CHANGELOG.md`, `CONTRIBUTING.md`, `PUBLISHING.md`

---

## [2.0.0] — 2026-05-30

The "competitive parity" release. Closes the May 2026 gap analysis (P0–P3
platform work + C1–C7 competitive priorities).

### Added — REST API & daemon
- `POST /api/v1/sessions`, `GET /api/v1/sessions[/:id]`, `DELETE /api/v1/sessions/:id`
- `GET /api/v1/health` with capability advertisement
- `GET/POST /api/v1/swarm/runs`, `GET /api/v1/swarm/runs/:id`,
  `POST /api/v1/swarm/runs/:id/cancel` — detached by default
- `POST /api/v1/diffs/preview` — server-rendered unified diff
- `GET/POST /api/v1/mcp/servers`, `GET/DELETE /api/v1/mcp/servers/:id`,
  `POST/DELETE /api/v1/mcp/servers/:id/trust`
- `GET /api/v1/sessions/:id/events` — SSE stub for future streaming
- `DaemonAuthPolicy` with per-token scopes:
  `daemon.describe`, `sessions.{read,write}`, `workflow.{read,write}`,
  `swarm.{read,write}`, `mcp.{read,write}`, `web.{read,mutate}`
- `generateDaemonToken()` — 256-bit hex token generator

### Added — web dashboard
- Embedded HTML/CSS/JS dashboard at `GET /` (no build step)
- Health card with capability list
- Live session table with auto-refresh
- Inline diff renderer with hunk-level accept/reject
- localStorage-persisted bearer token form

### Added — VS Code extension v0.2
- `Colony: Show Daemon Health`
- `Colony: List Swarm Runs`
- `Colony: Start Swarm Run (detached)`
- `Colony: List MCP Servers`
- `Colony: Preview Diff (selection ↔ clipboard)`
- `Colony: Open Dashboard in Browser`
- `Colony: Set Daemon Bearer Token` (uses SecretStorage, never settings.json)
- Daemon health in the status bar (polls every 30s)
- REST client at `vscode-extension/src/colony-client.ts` (pure fetch)

### Added — MCP server registry
- `McpServerRegistry` class with persistent JSON config at
  `~/.colony/mcp-servers.json`
- `/mcp [list|status|show|trust|untrust|help]` slash command
- HTTP and stdio server kinds with allowed-tool / tag annotation
- Trust lifecycle (configured → trusted → active)

### Added — pluggable sandbox
- `ToolExecutor` interface
- `HostToolExecutor` — preserves the existing `Bun.spawn` behavior, always
  merges parent `process.env` so children inherit `PATH`
- `DockerToolExecutor` — `docker run -d` lifecycle, per-session containers,
  `--network none` by default, workspace mount with rw/ro toggle,
  host→container path mapping with sandbox containment
- `createToolExecutor()` factory + `mapHostPathToContainer()` helper

### Added — swarm runtime
- `StartSwarmObjectiveOptions.detached?: boolean` — when true, returns the
  initial snapshot immediately and runs stages in the background
- `maxConcurrentRuns` (default 4) — semaphore-gated parallel LLM execution
- Background-run errors logged but never crash the process
- `ColonySwarmRuntime.listRuns()`, `.inspectRun()`, `.cancelRun()` exposed
  for daemon REST surface

### Added — plugin registry
- `McpServerRegistry`-style client at `src/mcp/plugin-registry-client.ts`
- `/plugins search [term]` slash command + REST dispatch
- In-repo seed at `registry/v1/index.json` (10 first-party plugins)
- JSON Schema at `registry/v1/schema.json`
- Submission docs at `registry/SUBMITTING.md`

### Added — testing infrastructure
- 251 unit tests across 15 files (was 0 at start of sessions)
- `bun test` as the primary test command
- `.github/workflows/ci.yml` — `bun test` + `tsc --noEmit` on every push
- `scripts/bench/swe-bench.ts` — SWE-bench Verified harness with
  `--dry-run`, `--task-file`, three caste configs, JSON + Markdown reports

### Added — diff library
- `src/diff/unified-diff.ts` — pure server-side LCS-based unified diff
- `generateUnifiedDiff()` returns structured hunks
- `renderUnifiedDiffText()` renders standard `git apply`-compatible text

### Added — UI improvements
- `useCommandDispatch` React hook — extracts 100+ lines from `ColonyApp`
- All panel components moved to `src/ui/panels/`
- Batched `useShallow` selectors in every panel (1 subscription instead
  of 10–30)
- Approval prompt rendered as a labeled vertical action list with
  color-coded `[Y]`/`[A]`/`[S]`/`[N]`/`[Esc]` keys
- Full keyboard shortcut reference panel (`?` key)

### Added — npm distribution
- `bin/colony.mjs` — Node.js ESM shim that detects Bun and delegates
- `package.json.bin.colony` → shim path
- `engines.node >= 18.0.0` for broader compatibility
- `publishConfig` for npmjs.org public publish

### Changed
- Default Anthropic model: `claude-sonnet-4-5-20250929` → `claude-sonnet-4-6`
- `KNOWN_MODELS` updated to include `claude-sonnet-4-6`,
  `claude-haiku-4-5-20251001`, with legacy models flagged
- Session IDs: 48-bit hex → full UUIDv4 (`ses_${randomUUID()}`)
- `evaluationLog` is now a capped ring buffer (default 5000 entries)
- `globMatch()` regex compilation memoized in module-level `Map`
- `MemoryWorkflowStore` extracted from `orchestrator/swarm.ts` to
  `workflow/memory-store.ts`
- `Layer0` identity now uses `fs.watch` to invalidate the cached content
  when the file changes on disk

### Security
- `healthCheck()` for Anthropic provider now uses `GET /v1/models`
  instead of a token-burning `POST /v1/messages` ping
- All daemon REST routes are gated by `DaemonAuthPolicy` when configured
- Plugin search queries are scrubbed via `scrubSecrets()` before logging
- Path validator covers null bytes, URL-encoded traversal, unicode-
  normalized escapes, symlink escapes, and reserved-path hits

### Performance
- Panel re-renders: reduced 30→1 subscriptions per panel via
  `zustand/react/shallow`
- Swarm parallelism: configurable `maxConcurrentRuns` (default 4)
- Regex compilation: cached globally

### Internal
- `IMPLEMENTATION_PLAN.md` — all P0–P3 items closed
- `COMPETITIVE_GAPS_PLAN.md` — all C1–C7 items closed
- `DISTRIBUTION_PLAN.md` — created for this release cycle

---

## [1.0.0] — 2026 Q1 (Alpha 0)

Initial public source-checkout alpha. Preserved for continuity in
[`docs/ALPHA0_LAUNCH_README.md`](docs/ALPHA0_LAUNCH_README.md).

### Added
- Real planner → worker → reviewer swarm path
- Conservative approval gates with caste-aware routing
- Exact transcript truth (no hallucinated tool outputs)
- Ollama-first provider setup
- 12-caste method framework with display compatibility
- 391-phase behavioral verification scripts
- Caste-based RBAC engine
- Path validator with traversal protection
- MemPalace 4-layer memory architecture
- Caveman bridge for token-compression on low-context models

---

[Unreleased]: https://github.com/jbrorepo/colony-ts/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/jbrorepo/colony-ts/releases/tag/v2.0.0
[1.0.0]: https://github.com/jbrorepo/colony-ts/releases/tag/v1.0.0
