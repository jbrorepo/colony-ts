# Architecture

A map of the codebase + the runtime layers. Read this when you're
planning a contribution or trying to understand why something is where
it is.

## High-level layers

```
┌────────────────────────────────────────────────────────────────┐
│  UI surfaces                                                    │
│  ├── Terminal (Ink TUI)        — src/ui/*                      │
│  ├── Web dashboard             — src/daemon/web-ui.ts          │
│  └── VS Code extension         — vscode-extension/*            │
└────────────────────────────────────────────────────────────────┘
                              │
┌────────────────────────────────────────────────────────────────┐
│  Daemon control plane                                           │
│  ├── REST API (/api/v1/*)      — src/daemon/web-ui.ts          │
│  ├── Auth policy                — src/daemon/auth.ts            │
│  └── Control plane host         — src/daemon/control-plane.ts   │
└────────────────────────────────────────────────────────────────┘
                              │
┌────────────────────────────────────────────────────────────────┐
│  Runtime                                                        │
│  ├── Session manager           — src/runtime/session.ts        │
│  ├── Swarm runtime             — src/orchestrator/swarm.ts     │
│  ├── Tool executor             — src/runtime/tool-executor.ts  │
│  ├── Approval flow             — src/runtime/approval.ts       │
│  └── Compaction                — src/runtime/compaction.ts     │
└────────────────────────────────────────────────────────────────┘
                              │
┌────────────────────────────────────────────────────────────────┐
│  Subsystems                                                     │
│  ├── Security policy           — src/security/policy.ts         │
│  ├── Path validator            — src/security/path-validator.ts │
│  ├── LLM providers             — src/llm/providers/*            │
│  ├── Failover + circuit        — src/llm/failover-executor.ts   │
│  ├── MemPalace layers          — src/mempalace/layers.ts        │
│  ├── MCP server registry       — src/mcp/server-registry.ts     │
│  ├── Plugin registry client    — src/mcp/plugin-registry-client │
│  ├── Workflow store            — src/workflow/memory-store.ts   │
│  └── Diff library              — src/diff/unified-diff.ts       │
└────────────────────────────────────────────────────────────────┘
```

## Directory map

```
src/
  daemon/        — REST API, web UI, auth, control-plane host
  diff/          — unified diff library (server-rendered)
  gateway*.ts    — slash command parsing + execution
  llm/           — provider clients (Anthropic, OpenAI, Gemini, Ollama)
  mcp/           — MCP protocol, server registry, plugin registry client
  mempalace/     — L0-L3 memory architecture
  orchestrator/  — swarm runtime + coordinator + worker registry
  runtime/       — sessions, tools, approvals, compaction
  security/      — policy engine, path validator, log sanitizer
  ui/            — Ink TUI (panels/, hooks/, store, hotkeys)
  workflow/      — workflow automation, recipes, memory store
  index.tsx      — TUI entry point
  __tests__/     — unit tests (mirrors src/ structure)

bin/
  colony.mjs     — Node.js shim that detects Bun + delegates

documentation/   — user-facing docs (this directory)
docs/            — internal team docs (playbooks, decisions, etc.)

vscode-extension/  — VS Code extension (separate publish target)
registry/          — plugin registry seed (GitHub Pages source)
scripts/           — bench harness, setup, verify scripts

benchmarks/        — published benchmark results
```

## Key principles

### No vendor LLM SDKs

All four provider families (`anthropic`, `openai`, `gemini`, `ollama`)
talk via raw `fetch`. We never import `@anthropic-ai/sdk`, `openai`, or
similar. Benefits:

- Smaller attack surface
- Easier audit
- No SDK lock-in if the vendor changes API shape
- Smaller bundle for the npm package

This is a hard rule. PRs adding vendor SDKs will be rejected.

### Default-deny security

Every policy check returns `DENY` unless explicitly allowed. Every tool
goes through the policy engine. Every path goes through the validator.
See [security.md](security.md).

### Verbatim transcript truth

Tool outputs are appended to the conversation **verbatim**. Colony does
not summarize, compress, or paraphrase tool results before the model
sees them. This prevents a class of "lie to the model" bugs that other
agent runtimes have.

The exception: explicit compaction (`/compact` or auto-compact on
context approaching the limit) summarizes earlier conversation turns
with operator visibility into what was lost.

### Pure-function session mutations

`addMessage()`, `markIdle()`, `closeSession()` etc. return new session
snapshots rather than mutating in place. Makes time-travel and
snapshotting straightforward.

### Input normalization at boundaries

Any data crossing a trust boundary (HTTP body, slash command args, tool
arguments, plugin output) goes through a normalizer first. Extend these
normalizers; never bypass them.

## Daemon vs in-process

Colony has two execution shapes:

1. **In-process (default for `colony` TUI)** — the runtime lives in the
   same process as the UI. Fastest, single-user, no auth.

2. **Daemon (`colony daemon`)** — the runtime is a separate process
   exposing REST + dashboard. Multiple clients can connect (TUI, VS
   Code, scripts). Required for async/detached swarm runs visible from
   multiple surfaces.

The daemon is just `DaemonControlPlaneHost` + `DaemonHttpControlPlaneServer`.
The same `ColonySwarmRuntime`, `SessionManager`, etc. work in both modes.

## Testing

```bash
bun test                                  # all 251 tests
bun test src/__tests__/security           # one subsystem
bun test --watch                          # watch mode
bun run tsc --noEmit                      # type-check
bun run verify:alpha0                     # integration smoke
```

See [`src/__tests__/README.md`](../src/__tests__/README.md) for the
contributor test-writing guide.

## See also

- [Security model](security.md)
- [REST API reference](rest-api.md)
- [Swarm runs](swarm.md)
- [`IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) — what's done
- [`COMPETITIVE_GAPS_PLAN.md`](../COMPETITIVE_GAPS_PLAN.md) — what's done
