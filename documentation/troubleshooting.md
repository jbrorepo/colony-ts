# Troubleshooting

Common errors with verified fixes. If your issue isn't here, please
[open an issue](https://github.com/jbrorepo/colony-ts/issues/new) or read
the relevant subsystem doc.

## Install

### `command not found: colony` after `npm install -g`

The npm bin directory isn't on your PATH. Run:

```bash
npm bin -g  # shows the directory
# Add to ~/.bashrc / ~/.zshrc / PowerShell profile:
export PATH="$(npm bin -g):$PATH"
```

### `Bun is required to run Colony`

The `colony` shim couldn't find Bun on PATH. Install Bun:

```bash
# Unix
curl -fsSL https://bun.sh/install | bash

# macOS via Homebrew
brew install oven-sh/bun/bun

# Windows
powershell -c "irm bun.sh/install.ps1 | iex"
```

Then restart your shell and try `colony` again.

### `EACCES` on global install

Either use `sudo npm install -g @colony/cli` (not recommended) or
configure npm to install globals in your home directory:

```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
# Add ~/.npm-global/bin to PATH in your shell rc
```

## Runtime

### `ECONNREFUSED` to Ollama

Ollama isn't running:

```bash
ollama serve &      # background
ollama list         # confirm models are present
ollama pull llama3.1  # pull if needed
```

Or override the host:

```bash
export OLLAMA_HOST=http://my-ollama-server:11434
```

### `LLMRateLimitError` from Anthropic / OpenAI

The provider returned a 429. Colony's failover executor backs off
exponentially and retries. To reduce frequency:

- Lower the swarm `maxConcurrentRuns`
- Switch to a lower-cost model for plan/review stages
- Add a slower fallback provider chain in your config

### `LLMConnectionError` repeatedly

Check the circuit breaker state:

```
/status
```

The status panel includes `circuitState`. If it's `open`, the provider
will be skipped until the cooldown elapses (default 60s). Wait, or
adjust `circuitThreshold` / `circuitCooldownSeconds`.

### Approval prompt won't accept my key

Make sure you're not in the text input:
- Press Esc once to leave the input
- Then press `Y`/`A`/`S`/`N`/`Esc`

In the locked state during an approval, only the approval keys and
log-scroll keys work. The placeholder text in the input field tells you
which keys are accepted.

## Daemon

### `503 Service Unavailable` on `/api/v1/swarm/runs`

The daemon was started without a `swarmRuntime`. Configure it in your
daemon startup (see [`configuration.md`](configuration.md)).

### `401 Unauthorized` from REST endpoints

Missing bearer token. Either:
- Send `Authorization: Bearer <token>`
- Start the daemon without `DaemonAuthPolicy` (single-developer local use)

In VS Code: run `Colony: Set Daemon Bearer Token`.

### `403 Forbidden` with `insufficient_scope`

Your token doesn't have the required scope. The error message tells you
which scope is needed. Generate a new token with the right scopes (see
[`security.md#token-scopes`](security.md#token-scopes)).

### Dashboard loads but shows "Auth required"

The HTML page loads without auth, but `/api/v1/*` calls require the
token. Click the auth-token form at the top of the dashboard and paste
your token. It's stored in browser localStorage.

## VS Code extension

### "Daemon not reachable" but the daemon is running

Check `colony.daemonUrl` in VS Code settings matches the daemon's
actual port. Default is `http://127.0.0.1:7878`. If you started the
daemon on a different port, update the setting.

### Status bar shows the plug icon permanently

Either the daemon isn't running, or `colony.autoConnect` is `false`.
Toggle the setting and reload the VS Code window.

## Path / security errors

### "Path traversal detected" on a legitimate path

The validator is rejecting because the path either:
- Contains `..` segments that escape the workspace
- Is an absolute path outside the workspace

Add the path to `extraAllowedDirs` if it's a known-good location (e.g.
a shared cache):

```typescript
const validator = new PathValidator({
  workspace: "/home/user/project",
  extraAllowedDirs: ["/tmp/colony-cache", "/var/lib/shared"],
});
```

### "Reserved path" error

You hit a hardcoded sensitive path like `/etc/passwd`. This is by
design — there's no override. If you need to read system files, do it
outside Colony or wrap it in a tool that pre-redacts.

## Build / dev

### `bun: command not found` after install

Restart your shell, or `source ~/.bashrc`. Bun's install script
modifies your shell rc but doesn't reload it.

### TypeScript errors after pulling main

```bash
bun install   # in case deps changed
bun run tsc --noEmit
```

If errors persist, check `IMPLEMENTATION_PLAN.md` / `COMPETITIVE_GAPS_PLAN.md`
for in-flight work that may have stale types.

### Tests fail with "EBUSY" on Windows

A previous test left a process around. Clean tmp dirs:

```bash
bun run clean:tmp
```

## See also

- [Quickstart](quickstart.md)
- [Configuration](configuration.md)
- [Security model](security.md)
- [Architecture](architecture.md)
