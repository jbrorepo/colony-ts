# The Colony — Documentation

User-facing documentation for [The Colony](../README.md). Markdown-first
so it works as-is when browsing the repo, and as a future docs site
(Docusaurus / MkDocs / VitePress) without rewriting.

For internal team docs, see [`../docs/`](../docs/) instead.

## Start here

| | |
|---|---|
| **[Quickstart](quickstart.md)** | Install → first message → first swarm run |
| **[Configuration](configuration.md)** | Env vars, providers, config files, daemon flags |
| **[Architecture](architecture.md)** | Module map, runtime layers, MemPalace |
| **[Comparison](comparison.md)** | Colony vs Aider / Cursor / Cline / Devin / OpenHands |

## Core surfaces

| | |
|---|---|
| **[CLI reference](cli.md)** | Every slash command with examples |
| **[REST API reference](rest-api.md)** | Every `/api/v1/*` endpoint |
| **[VS Code extension](vscode.md)** | Setup, commands, settings |

## Subsystems

| | |
|---|---|
| **[Security model](security.md)** | Caste RBAC, approval gates, path validator, audit trail |
| **[Swarm runs](swarm.md)** | Detached mode, monitoring, cancellation |
| **[MCP server registry](mcp.md)** | CLI, REST, trust model, allowed-tool lists |
| **[Plugin author guide](plugins.md)** | Submission process, manifest, security |
| **[Diff preview](diff-preview.md)** | Server library + REST endpoint + dashboard component |
| **[Sandboxing](sandbox.md)** | `ToolExecutor` + Docker backend |
| **[Benchmarks](benchmarks.md)** | Reproducing SWE-bench numbers |

## Operations

| | |
|---|---|
| **[Troubleshooting](troubleshooting.md)** | Common errors with fixes |
| **[Publishing](../PUBLISHING.md)** | Release process (npm + VS Code Marketplace) |
