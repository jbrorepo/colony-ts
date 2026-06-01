# Swarm Runs

A **swarm run** is Colony's structured multi-agent task: planner →
worker → reviewer. Use it when you want an agent to take a substantive
task all the way to completion (not just answer a question).

## Starting a swarm

### From the TUI

```
/swarm Refactor src/util/parse.ts for null-safety
```

This blocks the TUI until the swarm completes. Useful for interactive
sessions where you want to watch progress.

### Detached (via REST API)

```bash
curl http://localhost:7878/api/v1/swarm/runs \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "objective": "Add input validation to src/api/handlers/*",
    "detached": true
  }'
```

`detached: true` (the default for REST) returns the initial snapshot
immediately with a `runId`. The swarm continues running in the
background. Poll for status.

### From VS Code

`Colony: Start Swarm Run (detached)` from the Command Palette. The
extension prompts for the objective, starts the run via REST, and
shows the `runId` in the output channel.

## Stage execution

Three stages run in order:

1. **Plan** — `command_ant` caste. Produces a structured task list.
2. **Execute** — `oper_ant` caste. Performs each task. Tool calls go
   through the approval flow.
3. **Review** — `consult_ant` caste. Validates the result against the
   original objective.

Each stage can fail, retry (up to `maxAttempts`), or block waiting for
operator approval.

## Monitoring

### Poll one run

```bash
curl http://localhost:7878/api/v1/swarm/runs/<runId> \
  -H "authorization: Bearer $TOKEN" \
  | jq .run
```

Response includes per-stage status (`pending` / `running` / `completed` /
`failed`), the planned task list, completed task count, and worker
snapshots.

### List all runs

```bash
curl http://localhost:7878/api/v1/swarm/runs \
  -H "authorization: Bearer $TOKEN" \
  | jq '.runs[] | {runId, status, objective: .objective[0:60]}'
```

### Dashboard

The web dashboard at `http://localhost:7878/` shows the run list with
status badges; click a run for details.

## Cancellation

```bash
curl -X POST http://localhost:7878/api/v1/swarm/runs/<runId>/cancel \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"reason": "Operator cancelled — see ticket ENG-1234"}'
```

Or from the TUI: `/cancel-swarm <runId>`.

Cancellation is cooperative. Tools in-flight finish their current
operation, then the run stops without proceeding to the next task.

## Concurrency

The runtime gates parallel runs with a semaphore. Default
`maxConcurrentRuns: 4`. Additional `startObjective()` calls queue until
a slot opens.

Configure when constructing the runtime:

```typescript
const swarmRuntime = new ColonySwarmRuntime({
  llmRunner: yourRunner,
  maxConcurrentRuns: 8,  // increase for more parallelism
});
```

## Persistence

When `JsonSwarmRunStore` (or any `SwarmRunStore` implementation) is
configured, snapshots persist to disk. After daemon restart,
`runtime.loadPersistedRuns()` re-hydrates them.

Live runs that were in-flight at shutdown will show as `running` after
restart but won't actually be progressing — the runtime detected they
were orphaned. Cancel them or implement resume logic if needed.

## Approval gates inside a swarm

Tool calls during the execute stage go through the same approval flow
as interactive sessions. With `approvalRequired: true` on the run, the
execute stage itself requires explicit approval before starting.

## See also

- [REST API reference](rest-api.md#swarm-runs) — full endpoint reference
- [Security model](security.md#approval-gates) — approval flow
- [Configuration](configuration.md) — `maxConcurrentRuns`
