# Configuration

How to configure Colony for your environment.

## Environment variables

| Var | What it does | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key | none |
| `OPENAI_API_KEY` | OpenAI API key | none |
| `GEMINI_API_KEY` | Google Gemini API key | none |
| `OLLAMA_HOST` | Ollama endpoint | `http://localhost:11434` |
| `COLONY_WORKSPACE` | Workspace root for path validator | current dir |
| `COLONY_DAEMON_TOKEN` | Bearer token for daemon REST (CI use) | none |
| `COLONY_DAEMON_PORT` | Daemon HTTP port | `7878` |
| `COLONY_PROVIDER` | Default provider | `ollama` |
| `COLONY_MODEL` | Default model | provider-specific |
| `NO_COLOR` | Disable color output | unset |

## CLI flags

```bash
colony [--provider <name>] [--model <id>] [--caste <name>] [--tenant <scope>]
colony daemon [--port <num>] [--no-web-ui] [--auth-token-file <path>]
```

## Config file (planned)

Currently most configuration is via environment variables. A
`~/.colony/config.json` file is on the roadmap; until then, wrap the
CLI in a shell script if you need persistent provider/model defaults:

```bash
#!/bin/bash
# ~/.local/bin/colony-anthropic
export ANTHROPIC_API_KEY=$(pass show colony/anthropic)
exec colony --provider anthropic --model claude-sonnet-4-6 "$@"
```

## Daemon configuration

The daemon supports the same env vars plus daemon-specific options
configurable in code:

```typescript
import {
  DaemonControlPlaneHost,
  DaemonHttpControlPlaneServer,
  DaemonAuthPolicy,
} from "@colony/cli/daemon";
import { McpServerRegistry } from "@colony/cli/mcp";
import { ColonySwarmRuntime } from "@colony/cli/orchestrator";
import { SessionManager } from "@colony/cli/runtime";

const sessionManager = new SessionManager();
const mcpServerRegistry = new McpServerRegistry();   // loads ~/.colony/mcp-servers.json
await mcpServerRegistry.load();
const swarmRuntime = new ColonySwarmRuntime({
  llmRunner: yourLlmRunner,
  maxConcurrentRuns: 4,
});

const host = new DaemonControlPlaneHost({
  sessionManager,
  swarmRuntime,
  mcpServerRegistry,
});

const authPolicy = new DaemonAuthPolicy({
  tokens: [/* see security.md */],
});

const server = new DaemonHttpControlPlaneServer({
  host,
  authPolicy,
  hostname: "127.0.0.1",
  port: 7878,
  webUI: true,
});
await server.start();
console.log(`Dashboard at ${server.baseUrl}`);
```

## See also

- [Security model](security.md) — auth policy + token scopes
- [Quickstart](quickstart.md) — minimum viable config
- [Troubleshooting](troubleshooting.md) — config errors
