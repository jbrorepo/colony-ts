# MCP Server Registry

Colony implements [Model Context Protocol](https://modelcontextprotocol.io)
as a first-class subsystem. This guide covers the user-facing registry —
adding, listing, and trusting MCP servers.

## Concept

An MCP server exposes tools and resources to an agent. Colony's
`McpServerRegistry` is the persistent list of "MCP servers this Colony
installation knows about." It does not own the wire protocol or the
approval lifecycle — those belong to the existing
`createTrustedHttpMcpClient()` and `PluginSidecarSupervisor` machinery.

The registry is your **single source of truth** for which servers exist,
whether the operator has approved them, and what tools they're allowed
to expose.

## Storage

Servers are persisted as JSON at `~/.colony/mcp-servers.json`. The format
is human-readable; you can edit it by hand if you prefer, then
`McpServerRegistry.load()` re-reads it.

Example:

```json
{
  "version": 1,
  "updatedAt": "2026-05-30T12:00:00.000Z",
  "servers": [
    {
      "id": "github-mcp",
      "kind": "http",
      "description": "GitHub issues + PRs",
      "endpoint": "https://api.example.com/mcp",
      "allowedTools": ["github.list_issues", "github.create_pr"],
      "tags": ["github", "essential"],
      "trusted": true,
      "addedAt": "2026-05-29T18:00:00.000Z"
    }
  ]
}
```

## CLI

```
/mcp                 list configured servers
/mcp list            list configured servers (explicit)
/mcp status          list with health-check status
/mcp show <id>       inspect one server
/mcp trust <id>      queue a trust request (run REST POST to apply)
/mcp untrust <id>    queue an untrust request
/mcp help            show usage
```

Mutations (add / remove / trust) go through the REST API. The CLI shows
hints with the exact `curl`/`POST` to run.

## REST API

See [`rest-api.md#mcp-server-registry`](rest-api.md#mcp-server-registry)
for the full reference.

Common operations:

```bash
# List
curl http://localhost:7878/api/v1/mcp/servers \
  -H "authorization: Bearer $TOKEN"

# Add
curl http://localhost:7878/api/v1/mcp/servers \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "id": "github-mcp",
    "kind": "http",
    "endpoint": "https://api.example.com/mcp",
    "description": "GitHub issues + PRs",
    "allowedTools": ["github.list_issues", "github.create_pr"],
    "tags": ["github"]
  }'

# Trust
curl -X POST http://localhost:7878/api/v1/mcp/servers/github-mcp/trust \
  -H "authorization: Bearer $TOKEN"
```

## Server kinds

| Kind | Endpoint format | Notes |
|---|---|---|
| `http` | `https://host/path` | Must be HTTPS. HTTP rejected to prevent credential leak. |
| `stdio` | absolute path to binary | Launched as a subprocess via the sidecar supervisor. |

## Allowed tools

The `allowedTools` array is an **allowlist**. An empty array means
"list tools only — don't allow any calls."

For HTTP MCP servers, this maps to the underlying `GuardedMcpTransport`
allowed-methods + allowed-tools enforcement. The server may advertise
more tools than this list; calls to non-listed tools are denied at the
transport layer.

## Trust model

- `trusted: false` (default) — server is configured but the operator
  hasn't approved it. Tool calls will trigger an approval prompt.
- `trusted: true` — operator has approved this exact configuration.
  Tool calls go through without per-call approval.

Trust is **exact**: changing the endpoint, allowed-tools list, or headers
invalidates the trust. The next call will re-prompt.

## VS Code integration

The VS Code extension has a `Colony: List MCP Servers` command that
shows the registry contents in the Colony output channel. Add/remove
operations still go through the daemon REST API (or the CLI).

## See also

- [REST API reference](rest-api.md) — MCP endpoints
- [Security model](security.md) — trust signatures
- [Configuration](configuration.md) — registry path override
