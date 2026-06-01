# The Colony

[![CI](https://img.shields.io/badge/CI-passing-brightgreen)](.github/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@colony/cli.svg)](https://npmjs.com/package/@colony/cli)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-251%20passing-brightgreen)](src/__tests__)

> **A local-first, security-first agent runtime.**
> Caste-based RBAC, default-deny tool execution, MCP-native, runs entirely on your machine.

The Colony is the agent runtime your security team will actually approve.
It combines a strict default-deny security policy, role-based caste
permissions, exact-call approval gates, and a full audit trail with the
modern surface you'd expect: REST API, web dashboard, VS Code extension,
MCP server registry, and pluggable LLM providers (Anthropic, OpenAI,
Gemini, Ollama).

---

## Why Colony

|  | Colony | Most agent CLIs |
|---|---|---|
| Local-first | ✓ Runs against Ollama, no cloud required | Cloud-first |
| Default-deny security | ✓ 7-caste RBAC + path validator | Permissive defaults |
| Audit trail | ✓ Capped evaluation log + signed approvals | Optional |
| MCP first-class | ✓ Registry, CRUD, CLI, REST | Stdio config files |
| Pluggable sandbox | ✓ `HostToolExecutor` / `DockerToolExecutor` | Host-only |
| Vendor SDKs | None — pure `fetch` | Many |
| Editor presence | VS Code extension v0.2 | Most are CLI-only or IDE-only |
| Async/detached runs | ✓ `POST /api/v1/swarm/runs` returns `runId` | Usually blocking |

---

## Install

### One-liner (recommended for trying it out)

```bash
npm install -g @colony/cli
colony --help
```

Requires Node.js 18+ to bootstrap, and [Bun](https://bun.sh) 1.1+ for
the actual runtime. The `colony` shim auto-detects Bun and gives a clear
install hint if it's missing.

### From source

```bash
git clone https://github.com/jbrorepo/colony-ts.git
cd colony
bun install
bun run start
```

---

## 60-second tour

```bash
# 1. Start a chat (uses Ollama by default — no API key needed)
colony

# 2. Configure a cloud provider
export ANTHROPIC_API_KEY=sk-ant-...
colony --provider anthropic --model claude-sonnet-4-6

# 3. Run a swarm
> /swarm Refactor src/util/parse.ts for null-safety

# 4. From another terminal, start the daemon + dashboard
colony daemon
# → Dashboard at http://127.0.0.1:7878
# → REST API at http://127.0.0.1:7878/api/v1/*
```

See [`documentation/quickstart.md`](documentation/quickstart.md) for the
full walkthrough.

---

## What you get

| Surface | What it does |
|---|---|
| **Terminal chat (Ink TUI)** | Streaming, approval prompts, slash commands, session navigation, hotkey reference (`?`) |
| **Daemon REST API** | `/sessions`, `/swarm/runs`, `/diffs/preview`, `/mcp/servers`, `/health` (see [`documentation/rest-api.md`](documentation/rest-api.md)) |
| **Web dashboard** | Health, session list, inline diff renderer, MCP server list — embedded HTML, no build step |
| **VS Code extension** | 9 commands, daemon health status bar, swarm-run launcher, diff preview (see [`vscode-extension/README.md`](vscode-extension/README.md)) |
| **Swarm runtime** | planner → worker → reviewer with semaphore-gated concurrency and detached mode |
| **MCP server registry** | `/mcp` CLI + REST CRUD + persistent config at `~/.colony/mcp-servers.json` |
| **Plugin search** | `/plugins search <term>` against the hosted registry (or your own) |
| **Pluggable sandbox** | Host (default) or Docker; `ToolExecutor` interface for custom backends |
| **MemPalace** | 4-layer memory: L0 identity, L1 working, L2 episodic, L3 semantic |

---

## Documentation

| | |
|---|---|
| **[Quickstart](documentation/quickstart.md)** | Install → first message → first swarm |
| **[Comparison vs Cursor/Aider/Cline/Devin](documentation/comparison.md)** | Honest matrix + when to choose what |
| **[Configuration](documentation/configuration.md)** | Env vars, providers, config file |
| **[Security model](documentation/security.md)** | Caste RBAC, approval gates, path validator |
| **[REST API reference](documentation/rest-api.md)** | All `/api/v1/*` endpoints |
| **[CLI reference](documentation/cli.md)** | Every slash command |
| **[Architecture](documentation/architecture.md)** | Module map, runtime, MemPalace |
| **[MCP server guide](documentation/mcp.md)** | Registry, trust model, CLI + REST |
| **[Plugin author guide](documentation/plugins.md)** | Submission, manifest, security |
| **[VS Code extension](documentation/vscode.md)** | Setup, commands, settings |
| **[Swarm runs](documentation/swarm.md)** | Detached mode, monitoring, cancellation |
| **[Sandbox / Docker](documentation/sandbox.md)** | `ToolExecutor` + Docker backend |
| **[Benchmarks](documentation/benchmarks.md)** | Reproducing SWE-bench numbers |
| **[Troubleshooting](documentation/troubleshooting.md)** | Common errors |

---

## Security posture

Colony is built for environments where the security team can veto any
agent feature. The defaults reflect that:

- **Default-deny:** unknown actor + unknown action + unknown resource =
  denied with a logged reason.
- **Caste RBAC:** every actor has a caste; every caste has explicit
  allow/deny rules. `nameless_swarm` is the lowest tier (read-only file
  ops); `root_queen` allows anything (intended only for the operator).
- **Path validator:** every filesystem op is checked for null-byte
  injection, directory traversal, symlink escape, and reserved-path
  hits before execution.
- **Approval gates:** mutating tool calls require operator approval.
  "Allow this exact call this session" persists the approval scoped to
  the call signature, not the tool.
- **Audit trail:** every policy evaluation is logged to a capped ring
  buffer (default 5000 entries); every approval is signed.
- **No vendor SDKs:** all LLM providers use raw `fetch`. Smaller attack
  surface, easier audit.

See [`documentation/security.md`](documentation/security.md) for the full
threat model.

---

## Development

```bash
bun install
bun test              # 251 unit tests, ~3 seconds
bun run tsc --noEmit  # type-check
bun run start         # dev TUI
bun run dev           # TUI with file watcher
```

CI runs on every push (`.github/workflows/ci.yml`):
- `bun test --reporter=verbose`
- `bun run tsc --noEmit` against Ubuntu latest + Bun latest

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for branch + PR conventions.

---

## Roadmap

Tracked in:
- [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) — P0–P3 platform work (all closed)
- [`COMPETITIVE_GAPS_PLAN.md`](COMPETITIVE_GAPS_PLAN.md) — competitive parity (all closed)
- [`DISTRIBUTION_PLAN.md`](DISTRIBUTION_PLAN.md) — npm publish + docs + GitHub Pages
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — long-arc vision

---

## License

[MIT](LICENSE) © The Colony Project contributors

---

> Alpha 0 launch notes (preserved for internal continuity):
> see [`docs/ALPHA0_LAUNCH_README.md`](docs/ALPHA0_LAUNCH_README.md).
