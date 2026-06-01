# REST API Reference

The Colony daemon exposes a REST API at `http://127.0.0.1:7878` by default
(configurable via daemon options). All endpoints return JSON, accept JSON
for POST bodies, and follow the convention:

```json
{ "ok": true, ...payload }    // success
{ "ok": false, "error": "..." }  // error
```

## Authentication

When the daemon is started with a `DaemonAuthPolicy`, all `/api/v1/*`
endpoints require a bearer token:

```http
Authorization: Bearer <token>
```

Tokens are scoped — generate one with the scopes appropriate for the caller.
See [`security.md#token-scopes`](security.md#token-scopes).

When no auth policy is configured (single-developer local use), endpoints
are open to `127.0.0.1` only. The dashboard at `GET /` is always served
without auth so the browser can load the page; the dashboard then handles
401/403 from the API.

## Capability discovery

Always probe `GET /api/v1/health` first to see what's wired up:

```http
GET /api/v1/health

200 OK
{
  "ok": true,
  "startedAt": "2026-05-30T12:34:56.789Z",
  "capabilities": [
    "sessions.create", "sessions.list", "sessions.inspect", "sessions.close",
    "workflow.automation",
    "swarm.runs", "swarm.detached",
    "mcp.servers"
  ]
}
```

Capability strings tell you which endpoint groups are available.

---

## Sessions

| Method | Path | Scope | Description |
|---|---|---|---|
| `GET` | `/api/v1/sessions` | `web.read` | List all sessions |
| `POST` | `/api/v1/sessions` | `web.mutate` | Create a session |
| `GET` | `/api/v1/sessions/:id` | `web.read` | Inspect a session |
| `DELETE` | `/api/v1/sessions/:id` | `web.mutate` | Close a session |
| `GET` | `/api/v1/sessions/:id/events` | `web.read` | SSE event stream (stub) |

### Create a session

```http
POST /api/v1/sessions
Content-Type: application/json

{
  "agentId": "alice@example.com",
  "caste": "forge_carvers",
  "tenantScope": "team-alpha",
  "metadata": { "purpose": "refactor sprint" }
}

201 Created
{
  "ok": true,
  "session": {
    "sessionId": "ses_<uuid>",
    "agentId": "alice@example.com",
    "caste": "forge_carvers",
    "tenantScope": "team-alpha",
    "state": "idle",
    "createdAt": "...",
    "lastActive": "...",
    "messageCount": 0,
    "totalIterations": 0,
    "totalTokensUsed": 0,
    "metadata": { "purpose": "refactor sprint" }
  }
}
```

---

## Swarm runs

The async/autonomous surface. Submit an objective, walk away, poll for
status. See [`swarm.md`](swarm.md) for the conceptual overview.

| Method | Path | Scope | Description |
|---|---|---|---|
| `GET` | `/api/v1/swarm/runs` | `web.read` | List live + persisted runs |
| `POST` | `/api/v1/swarm/runs` | `web.mutate` | Start a run (detached by default) |
| `GET` | `/api/v1/swarm/runs/:id` | `web.read` | Inspect a run |
| `POST` | `/api/v1/swarm/runs/:id/cancel` | `web.mutate` | Cancel an in-flight run |

### Start a detached swarm run

```http
POST /api/v1/swarm/runs
Content-Type: application/json

{
  "objective": "Refactor src/util/parse.ts for null-safety",
  "title": "Parse refactor",
  "executionMode": "llm",
  "detached": true,
  "approvalRequired": false,
  "metadata": { "ticket": "ENG-1234" }
}

202 Accepted
{
  "ok": true,
  "detached": true,
  "run": {
    "runId": "swarm_<uuid>",
    "title": "Parse refactor",
    "objective": "...",
    "status": "running",
    "executionMode": "llm",
    "stages": [
      { "stage": "plan",    "status": "running" },
      { "stage": "execute", "status": "pending" },
      { "stage": "review",  "status": "pending" }
    ],
    ...
  }
}
```

`detached: true` (the default) returns the initial snapshot immediately
and runs stages in the background. Poll `GET /api/v1/swarm/runs/:id`
or subscribe via SSE.

`detached: false` blocks until all stages complete. Useful for CI/testing.

---

## Diff preview

Server-rendered unified diff. Useful for both the dashboard's inline diff
viewer and external integrations that don't want to re-implement the
algorithm.

| Method | Path | Scope | Description |
|---|---|---|---|
| `POST` | `/api/v1/diffs/preview` | `web.mutate` | Render a diff |

```http
POST /api/v1/diffs/preview
Content-Type: application/json

{
  "oldText": "hello\nworld\n",
  "newText": "hello\nthere\n",
  "filename": "greet.txt",
  "contextLines": 3
}

200 OK
{
  "ok": true,
  "diff": {
    "filename": "greet.txt",
    "unchanged": false,
    "hunks": [
      {
        "oldStart": 1, "oldLines": 2,
        "newStart": 1, "newLines": 2,
        "lines": [
          { "kind": "context",  "oldLineNo": 1,    "newLineNo": 1,    "text": "hello" },
          { "kind": "removed",  "oldLineNo": 2,    "newLineNo": null, "text": "world" },
          { "kind": "added",    "oldLineNo": null, "newLineNo": 2,    "text": "there" }
        ]
      }
    ],
    "stats": { "added": 1, "removed": 1, "hunkCount": 1 }
  }
}
```

`contextLines` is clamped to `[0, 20]`. Default: `3`.

---

## MCP server registry

Persistent registry of MCP server definitions. See [`mcp.md`](mcp.md) for
the conceptual overview.

| Method | Path | Scope | Description |
|---|---|---|---|
| `GET` | `/api/v1/mcp/servers` | `web.read` | List all servers |
| `POST` | `/api/v1/mcp/servers` | `web.mutate` | Add or upsert a server |
| `GET` | `/api/v1/mcp/servers/:id` | `web.read` | Inspect one server |
| `DELETE` | `/api/v1/mcp/servers/:id` | `web.mutate` | Remove a server |
| `POST` | `/api/v1/mcp/servers/:id/trust` | `web.mutate` | Grant trust |
| `DELETE` | `/api/v1/mcp/servers/:id/trust` | `web.mutate` | Revoke trust |

### Add an MCP server

```http
POST /api/v1/mcp/servers
Content-Type: application/json

{
  "id": "github-mcp",
  "kind": "http",
  "endpoint": "https://api.example.com/mcp",
  "description": "GitHub issues + PRs",
  "allowedTools": ["github.list_issues", "github.create_pr"],
  "tags": ["github", "essential"],
  "trusted": false,
  "replace": false
}

201 Created
{ "ok": true, "server": { ... } }
```

Validation rules:
- `id`: lowercase, hyphens/underscores, 3–64 chars
- `kind`: `"http"` or `"stdio"`
- `endpoint`: `https://` only for HTTP; absolute path for stdio
- `allowedTools`: ≤ 200 entries
- `tags`: ≤ 20 entries
- `description`: ≤ 500 chars

`replace: true` overwrites an existing entry with the same id.

---

## Health

| Method | Path | Scope | Description |
|---|---|---|---|
| `GET` | `/api/v1/health` | `web.read` | Daemon health + capabilities |

```http
GET /api/v1/health

200 OK
{
  "ok": true,
  "startedAt": "2026-05-30T12:34:56.789Z",
  "capabilities": ["sessions.create", "swarm.runs", "mcp.servers", ...]
}
```

---

## Error responses

| Status | Meaning |
|---|---|
| `400` | Invalid request (bad JSON, validation failure) |
| `401` | Missing bearer token (auth policy configured) |
| `403` | Bearer token lacks the required scope |
| `404` | Resource not found |
| `405` | Method not allowed on this route |
| `503` | Subsystem not configured (e.g. `swarm.runs` requested but `swarmRuntime` not wired) |

Error body shape:

```json
{ "ok": false, "error": "Human-readable message" }
```

For auth failures, the message may include `requiredScope=...` to help
the caller diagnose.

---

## Worked example: launch a swarm from a script

```bash
#!/bin/bash
DAEMON=http://127.0.0.1:7878
TOKEN=$(cat ~/.colony/daemon-token)

# Check capabilities
curl -s "$DAEMON/api/v1/health" \
  -H "authorization: Bearer $TOKEN" \
  | jq .capabilities

# Start a detached run
RUN_ID=$(curl -s "$DAEMON/api/v1/swarm/runs" \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"objective":"Add docstrings to src/util/*.ts","detached":true}' \
  | jq -r .run.runId)

echo "Started: $RUN_ID"

# Poll until completion
while true; do
  STATUS=$(curl -s "$DAEMON/api/v1/swarm/runs/$RUN_ID" \
    -H "authorization: Bearer $TOKEN" \
    | jq -r .run.status)
  echo "  status: $STATUS"
  [[ "$STATUS" != "running" ]] && break
  sleep 5
done
```

---

## See also

- [Security model](security.md) — token scopes + approval gates
- [Swarm runs](swarm.md) — detached vs blocking mode in depth
- [VS Code extension](vscode.md) — uses this REST API as backbone
