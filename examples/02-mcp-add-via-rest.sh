#!/bin/bash
# Register an HTTP MCP server through the daemon REST API, then trust it.
#
# Prerequisites:
#   - Colony daemon running with mcpServerRegistry configured
#   - COLONY_TOKEN exported
#
# Usage:
#   ./02-mcp-add-via-rest.sh github-mcp https://api.example.com/mcp

set -euo pipefail

DAEMON="${COLONY_DAEMON_URL:-http://127.0.0.1:7878}"
TOKEN="${COLONY_TOKEN:-}"
ID="${1:-github-mcp}"
ENDPOINT="${2:-https://api.example.com/mcp}"

auth() {
  if [ -n "$TOKEN" ]; then
    echo "authorization: Bearer $TOKEN"
  fi
}

echo "==> Adding MCP server: $ID -> $ENDPOINT"
curl -s "$DAEMON/api/v1/mcp/servers" \
  -H "$(auth)" \
  -H "content-type: application/json" \
  -d "$(jq -n \
    --arg id "$ID" \
    --arg ep "$ENDPOINT" \
    '{
      id: $id,
      kind: "http",
      endpoint: $ep,
      description: "Example MCP server added via examples/02-mcp-add-via-rest.sh",
      allowedTools: [],
      tags: ["example"],
      trusted: false,
      replace: true
    }')" \
  | jq .

echo ""
echo "==> Granting trust"
curl -s -X POST "$DAEMON/api/v1/mcp/servers/$ID/trust" \
  -H "$(auth)" \
  | jq .server

echo ""
echo "==> Final registry state"
curl -s "$DAEMON/api/v1/mcp/servers" \
  -H "$(auth)" \
  | jq '{count, servers: [.servers[] | {id, kind, trusted}]}'
