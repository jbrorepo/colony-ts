# VS Code Extension

The [`vscode-extension/`](../vscode-extension/) sub-folder ships
`colony-vscode` — a VS Code extension that talks to a running Colony
daemon via the REST API.

## Install

### From source (during development)

```bash
cd vscode-extension
npm install
npm run compile
code --extensionDevelopmentPath=.
```

A second VS Code window opens with the extension loaded. Open the
Colony repo as the workspace and try the commands.

### As a `.vsix` package

```bash
cd vscode-extension
npx vsce package
code --install-extension colony-vscode-0.2.0.vsix
```

### Marketplace (planned)

Not yet published. Tracked in
[`DISTRIBUTION_PLAN.md`](../DISTRIBUTION_PLAN.md).

## Commands

All accessible via the Command Palette (`Cmd/Ctrl+Shift+P` → "Colony:").

| Command | What it does |
|---|---|
| `Colony: Ask About Selection` | Send the active editor selection to the daemon as a detached swarm objective |
| `Colony: New Session In Terminal` | Open an integrated terminal running `bun run start` |
| `Colony: Set Daemon Bearer Token` | Store the token in VS Code SecretStorage (never `settings.json`) |
| `Colony: Show Daemon Health` | Show daemon status + capability list in the output channel |
| `Colony: List Swarm Runs` | List all swarm runs from the daemon |
| `Colony: Start Swarm Run (detached)` | Prompt for an objective, start a detached run |
| `Colony: List MCP Servers` | Show all registered MCP servers |
| `Colony: Preview Diff (selection ↔ clipboard)` | Render a unified diff via the daemon |
| `Colony: Open Dashboard in Browser` | Open the daemon dashboard URL |

## Status bar

When `colony.autoConnect` is `true` (default), the status bar shows:

| Icon | Meaning |
|---|---|
| `$(rocket) Colony` | Daemon online |
| `$(plug) Colony` | Daemon not reachable |
| `$(alert) Colony` | Daemon reachable but reporting not-ok |

Click the status item to open the dashboard.

The status bar polls `/api/v1/health` every 30 seconds.

## Settings

| Setting | Default | Description |
|---|---|---|
| `colony.daemonUrl` | `http://127.0.0.1:7878` | Base URL of the local daemon |
| `colony.autoConnect` | `true` | Show health in the status bar on activation |

Bearer token is stored in VS Code's SecretStorage API, not in settings.

## Architecture

```
vscode-extension/src/
  extension.ts             — activation + command registration
  colony-client.ts         — REST client (pure fetch, no SDK deps)
  client-factory.ts        — builds the client from settings + SecretStorage
  commands/
    ask-about-selection.ts    — legacy v0.1 command
    new-session-in-terminal.ts
    set-token.ts              — store/clear bearer token
    show-health.ts
    swarm-runs.ts             — list + start (detached)
    mcp-servers.ts            — list
    preview-diff.ts           — selection ↔ clipboard via /diffs/preview
    open-dashboard.ts         — opens in OS browser
  status/
    health-status-bar.ts      — polling status bar item
```

## Security posture

- **Zero runtime npm dependencies.** Only `@types/vscode`, `@types/node`,
  and `typescript` as devDependencies.
- **localhost only by default.** The daemon URL is user-controlled but
  defaults to `127.0.0.1`.
- **Bearer token in SecretStorage.** Never in `settings.json`, never
  logged.
- **No workspace file mutation.** Reads selection + clipboard, displays
  output, opens terminals. No automatic file writes.

## Roadmap

Tracked in
[`vscode-extension/README.md`](../vscode-extension/README.md#roadmap):

- Webview chat panel
- SSE event streaming for live swarm-run progress
- Inline diff apply (replaces "preview diff" with one-click)
- MCP server add/remove via Quick Pick
- Marketplace publish under `colony.colony-vscode`

## See also

- [REST API reference](rest-api.md) — endpoints the extension calls
- [Security model](security.md) — token scopes
- [`vscode-extension/README.md`](../vscode-extension/README.md) — extension internals
