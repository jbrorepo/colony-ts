# Colony VS Code Extension

VS Code integration for [The Colony](../README.md) agent runtime. Drives the
Colony daemon REST API for swarm runs, MCP server management, diff preview,
and health monitoring — all without leaving the editor.

## What it ships

### Commands

| Command | What it does |
|---|---|
| **Colony: Ask About Selection** | Send the active editor selection to the daemon as a detached swarm objective. |
| **Colony: New Session In Terminal** | Spawn an integrated terminal running `bun run start` at the workspace root. |
| **Colony: Set Daemon Bearer Token** | Store the bearer token in VS Code SecretStorage (never written to settings.json). |
| **Colony: Show Daemon Health** | Print daemon status + capability list to the Colony output channel. |
| **Colony: List Swarm Runs** | List live + persisted swarm runs from the daemon. |
| **Colony: Start Swarm Run (detached)** | Prompt for an objective, start a detached run, poll separately. |
| **Colony: List MCP Servers** | Show all registered MCP servers with trust status. |
| **Colony: Preview Diff (selection ↔ clipboard)** | Render a unified diff between the editor selection and the clipboard contents using the daemon's diff service. |
| **Colony: Open Dashboard in Browser** | Open the daemon's web dashboard URL in the default browser. |

### Status bar

When `colony.autoConnect` is true (the default), the status bar shows daemon
health as `Colony [icon]`:

- `$(rocket) Colony` — daemon online
- `$(plug) Colony` — daemon unreachable
- `$(alert) Colony` — daemon reachable but reporting not-ok

Click the status bar item to open the dashboard.

## Prerequisites

- VS Code 1.85 or newer.
- A running Colony daemon — start it with `bun run scripts/start-daemon.ts`
  (or run `bun run start` and use the in-process daemon).
- (Optional) A bearer token if you've configured `DaemonAuthPolicy`. Set it
  with `Colony: Set Daemon Bearer Token`.

## Configuration

| Setting | Default | Description |
|---|---|---|
| `colony.daemonUrl` | `http://127.0.0.1:7878` | Base URL of the local Colony daemon. |
| `colony.autoConnect` | `true` | Show daemon health in the status bar on activation. |

The bearer token is stored in VS Code's SecretStorage, **not** in `settings.json`.

## Install (development)

```sh
cd vscode-extension
npm install
npm run compile
code --extensionDevelopmentPath=.
```

That launches a second VS Code window (the "Extension Development Host")
with this extension loaded. Open the Colony repo as the workspace folder
and run any of the commands above.

## Install (packaged)

```sh
npx vsce package
code --install-extension colony-vscode-0.2.0.vsix
```

## Architecture

```
src/
  colony-client.ts            Pure-fetch REST client (no axios, no SDK deps)
  client-factory.ts           Builds a ColonyClient using SecretStorage for the token
  extension.ts                Activation + command registration
  commands/
    ask-about-selection.ts    Legacy v0.1 command (kept for muscle memory)
    new-session-in-terminal.ts
    set-token.ts              Stores bearer token in SecretStorage
    show-health.ts
    swarm-runs.ts             list + start
    mcp-servers.ts            list (mutations go through REST directly)
    preview-diff.ts           selection ↔ clipboard via /api/v1/diffs/preview
    open-dashboard.ts         Opens the dashboard URL in the OS browser
  status/
    health-status-bar.ts      Polls /api/v1/health every 30s
```

## Security posture

- **Zero runtime npm dependencies.** `@types/vscode`, `@types/node`, and
  `typescript` are devDependencies only.
- **localhost only by default.** The daemon URL setting is user-controlled;
  the extension does not phone home.
- **Bearer token in SecretStorage.** Never in `settings.json`, never logged.
- **No workspace file mutation.** The extension reads the active editor
  selection and clipboard, displays output, and opens terminals.

## Roadmap

- [ ] Webview chat panel (sidebar `colony.chatView`)
- [ ] SSE-based event streaming for live swarm-run progress
- [ ] Inline diff approval (replaces "preview diff" with one-click apply)
- [ ] MCP server add/remove via Quick Pick UI
- [ ] Marketplace publish under `colony.colony-vscode`

## License

MIT, consistent with the main Colony project.
