# CLI Reference

Every slash command. Run `/help` from inside Colony for the auto-generated
short version.

## Session lifecycle

| Command | Description |
|---|---|
| `/help` | List all commands |
| `/status` | Provider, model, caste, cost, context usage |
| `/sessions` | Browse persisted sessions |
| `/history` | Show messages in current session |
| `/resume <sessionId>` | Resume a saved session |
| `/clear` | Reset the current session |
| `/exit` | Quit Colony |
| `/cancel` | Cancel the active run (or use Ctrl+C / Esc) |

## Provider + model

| Command | Description |
|---|---|
| `/model` | Show current provider:model + available models |
| `/model <provider> [model]` | Switch provider/model mid-session |

## Compaction + memory

| Command | Description |
|---|---|
| `/memory` | Show MemPalace state and recall log |
| `/compact [strategy]` | Trigger context compaction (`micro` / `summary`) |

## Tooling

| Command | Description |
|---|---|
| `/tools` | List tools available to the current caste |
| `/perf` | Performance counters |
| `/audit` | Recent policy decisions |

## Swarm

| Command | Description |
|---|---|
| `/swarm <objective>` | Start a planner→worker→reviewer run |
| `/cancel-swarm <runId>` | Cancel an in-flight swarm |
| `/resume-swarm <runId>` | Resume a paused swarm |

## Plugins

| Command | Description |
|---|---|
| `/plugins` | List installed plugins (default: status) |
| `/plugins search [term]` | Search the hosted registry |
| `/plugins preflight <id>` | Pre-install compatibility check |
| `/plugins activate <id> --approved` | Install + activate |
| `/plugins deactivate <id> --approved` | Disable a plugin |
| `/plugins status [id]` | Show status, optionally per plugin |
| `/plugins trusted` | List trusted local plugins |

## MCP servers

| Command | Description |
|---|---|
| `/mcp` | List configured servers (alias for `/mcp list`) |
| `/mcp list` | List configured servers |
| `/mcp status` | List with health column |
| `/mcp show <id>` | Inspect one server |
| `/mcp trust <id>` | Queue a trust request |
| `/mcp untrust <id>` | Queue an untrust request |
| `/mcp help` | Usage |

Mutations (add/remove) go through the REST API; see [`mcp.md`](mcp.md).

## Workflow recipes

| Command | Description |
|---|---|
| `/workflow start <recipeId>` | Run a recipe |
| `/workflow resume <runId>` | Resume a paused recipe |
| `/workflow cancel <runId>` | Cancel a recipe run |

## Browser sidecar

| Command | Description |
|---|---|
| `/browser start --approved` | Start the local browser runtime |
| `/browser stop` | Stop the browser runtime |
| `/browser open <url> --approved` | Navigate |
| `/browser screenshot --approved` | Capture screenshot |
| `/browser click <selector> --approved` | Click |
| `/browser type <selector> <text> --approved` | Type text |
| `/browser wait <target>` | Wait for an element/condition |

## Channels (external integrations)

| Command | Description |
|---|---|
| `/channels` | List configured external channels |
| `/channels register <id>` | Register a channel adapter |
| `/channels webhook <id>` | Set up a webhook |

## Daemon control

| Command | Description |
|---|---|
| `/daemon` | Daemon status + URL |
| `/daemon start` | Start the in-process daemon |
| `/daemon stop` | Stop the daemon |

## GitHub helpers

| Command | Description |
|---|---|
| `/github pr <runId>` | Open a PR from a swarm run |

## Skills + capabilities

| Command | Description |
|---|---|
| `/skills` | List loaded skills |
| `/capabilities` | List runtime capabilities |
| `/events` | Recent runtime events |

## Artifacts

| Command | Description |
|---|---|
| `/artifact` | Show artifact catalog for the session |
| `/artifact <filepath>` | Show a specific artifact |

## Keyboard shortcuts

`?` opens the full reference panel. Highlights:

| Key | Action |
|---|---|
| `?` | Show shortcuts |
| `Ctrl+B` | Toggle budget panel |
| `Ctrl+L` | Reset log scroll |
| `PgUp` / `PgDn` | Scroll the log |
| `Ctrl+J` | Open session catalog |
| `Ctrl+G` | Smart history |
| `Ctrl+R` | Resume last session |
| `Ctrl+C` / `Esc` | Cancel active run |

During an approval prompt:

| Key | Action |
|---|---|
| `Y` | Allow once |
| `A` | Allow this exact call this session |
| `S` | Inspect call details |
| `N` | Deny |
| `Esc` | Cancel run |
