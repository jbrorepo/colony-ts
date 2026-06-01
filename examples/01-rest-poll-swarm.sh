#!/bin/bash
# Start a detached swarm run via REST, then poll until it completes.
#
# Prerequisites:
#   - Colony daemon running (`colony daemon`)
#   - COLONY_TOKEN exported (or no auth policy on the daemon)
#   - jq installed
#
# Usage:
#   ./01-rest-poll-swarm.sh "Add input validation to src/api/handlers/*"

set -euo pipefail

DAEMON="${COLONY_DAEMON_URL:-http://127.0.0.1:7878}"
TOKEN="${COLONY_TOKEN:-}"
OBJECTIVE="${1:-Add docstrings to src/util/*.ts}"

auth_header() {
  if [ -n "$TOKEN" ]; then
    echo "authorization: Bearer $TOKEN"
  fi
}

echo "==> Checking daemon health"
curl -s "$DAEMON/api/v1/health" \
  -H "$(auth_header)" \
  | jq '{ok, capabilities: (.capabilities | length)}'

echo ""
echo "==> Starting detached swarm: $OBJECTIVE"
RUN_ID=$(curl -s "$DAEMON/api/v1/swarm/runs" \
  -H "$(auth_header)" \
  -H "content-type: application/json" \
  -d "$(jq -n --arg obj "$OBJECTIVE" '{objective: $obj, detached: true}')" \
  | jq -r .run.runId)

if [ -z "$RUN_ID" ] || [ "$RUN_ID" = "null" ]; then
  echo "ERROR: Failed to start swarm run" >&2
  exit 1
fi

echo "Started: $RUN_ID"
echo ""
echo "==> Polling until done (Ctrl+C to stop)"
while true; do
  SNAPSHOT=$(curl -s "$DAEMON/api/v1/swarm/runs/$RUN_ID" \
    -H "$(auth_header)")
  STATUS=$(echo "$SNAPSHOT" | jq -r .run.status)
  STAGES=$(echo "$SNAPSHOT" | jq -r '.run.stages | map("\(.stage)=\(.status)") | join(" ")')

  printf "  %s  [%s]  %s\n" "$(date +%H:%M:%S)" "$STATUS" "$STAGES"

  if [ "$STATUS" != "running" ]; then
    echo ""
    echo "==> Final snapshot"
    echo "$SNAPSHOT" | jq .run
    break
  fi

  sleep 5
done
