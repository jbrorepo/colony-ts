# Colony Examples

Copy-paste recipes for common tasks. Each example is a single file you
can either read inline or run directly.

| Example | What it shows |
|---|---|
| [`01-rest-poll-swarm.sh`](01-rest-poll-swarm.sh) | Start a detached swarm via REST and poll for status |
| [`02-mcp-add-via-rest.sh`](02-mcp-add-via-rest.sh) | Register an MCP server through the REST API |
| [`03-diff-from-clipboard.ts`](03-diff-from-clipboard.ts) | Render a unified diff from arbitrary inputs |
| [`04-plugin-search.ts`](04-plugin-search.ts) | Programmatic plugin registry search |
| [`05-docker-executor.ts`](05-docker-executor.ts) | Use the Docker tool executor for sandboxed commands |
| [`06-custom-policy-rule.ts`](06-custom-policy-rule.ts) | Add a caste-scoped allow rule to the security engine |

## Conventions

- Shell examples use `bash`. Translate to PowerShell or zsh as needed.
- Token environment variable: `COLONY_TOKEN`.
- Daemon URL environment variable: `COLONY_DAEMON_URL` (defaults to
  `http://127.0.0.1:7878`).
- TypeScript examples can be run with `bun run examples/0X-*.ts`.
- All examples assume `@colony/cli@2` or later.

## Contributing examples

Open a PR with:
- File at `examples/NN-short-name.{sh,ts,py}`
- One-line description in this README table
- A header comment explaining what the example demonstrates and what
  prerequisites the reader needs
