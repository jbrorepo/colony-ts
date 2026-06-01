# Quickstart

Get Colony running in 5 minutes. Targets a developer who has just heard
about the project and wants to see something on screen.

## 1. Install

### Recommended — via npm

```bash
npm install -g @colony/cli
```

This installs the `colony` command. The shim auto-detects [Bun](https://bun.sh)
and gives a clear install hint if Bun isn't present.

### Alternative — from source

```bash
git clone https://github.com/jbrorepo/colony-ts.git
cd colony-ts
bun install
```

Then use `bun run start` instead of `colony` for the rest of this guide.

## 2. Pick a provider

Colony talks to four LLM provider families. Pick whichever you have a
key for (or none — Ollama is free and runs locally).

| Provider | What you need | Env var |
|---|---|---|
| **Ollama** (local, free) | `ollama serve` running | none |
| **Anthropic** | API key | `ANTHROPIC_API_KEY` |
| **OpenAI** | API key | `OPENAI_API_KEY` |
| **Google Gemini** | API key | `GEMINI_API_KEY` |

For the rest of this guide we'll use Anthropic. Substitute as needed.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## 3. Start a chat

```bash
colony
```

You should see the Colony TUI with:

```
COLONY v2.0 - Agent Operating System
sid: ses_<uuid>  agent: <agentId>  caste: nameless_swarm  provider: anthropic
> _
```

Type a message and press Enter. Colony streams the response.

## 4. Try a slash command

Colony's chat input also accepts slash commands. Try:

```
/help
```

You'll see the full list. Some useful ones:

| Command | What it does |
|---|---|
| `/model` | Switch provider/model mid-session |
| `/sessions` | Browse persisted sessions |
| `/resume <id>` | Resume a saved session |
| `/swarm <objective>` | Start a swarm run |
| `/mcp list` | List configured MCP servers |
| `/plugins search <term>` | Search the plugin registry |
| `/tools` | List available tools (caste-filtered) |
| `?` | Show the keyboard shortcut reference |

See [`cli.md`](cli.md) for the complete reference.

## 5. Run your first swarm

A swarm is a planner → worker → reviewer pipeline. Try a small refactor:

```
/swarm Add a null-check to parseConfig in src/config.ts
```

Colony spawns three agents — the planner figures out the steps, the
worker executes them (with your approval for each tool call), and the
reviewer validates the result. You can watch progress in the TUI.

## 6. Start the daemon (optional)

The daemon gives you a REST API and a web dashboard on the same port:

```bash
colony daemon
# → Dashboard at http://127.0.0.1:7878
# → REST API at http://127.0.0.1:7878/api/v1/*
```

Open the dashboard URL in your browser. You'll see daemon health, the
session list, an inline diff renderer, and the MCP server list. The
dashboard auto-refreshes every 10 seconds.

## 7. Install the VS Code extension (optional)

```bash
cd vscode-extension
npm install
npm run compile
code --install-extension $(pwd)
```

The extension adds 9 commands (Command Palette → "Colony:") and a
status bar item showing daemon health. See
[`vscode.md`](vscode.md) for details.

## What now?

| If you want to… | Read |
|---|---|
| Understand the security model | [`security.md`](security.md) |
| Build your own agent on top of Colony's REST API | [`rest-api.md`](rest-api.md) |
| Add an MCP server | [`mcp.md`](mcp.md) |
| Publish a plugin to the registry | [`plugins.md`](plugins.md) |
| Run Colony in a Docker sandbox | [`sandbox.md`](sandbox.md) |
| Debug an error | [`troubleshooting.md`](troubleshooting.md) |
