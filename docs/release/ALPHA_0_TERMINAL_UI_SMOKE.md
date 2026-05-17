# Launch Alpha 0 Terminal UI Smoke

## Current Record

- Date recorded: 2026-05-11
- Command attempted from this automation shell: `bun run start`
- Result: BLOCKED
- Reason: this shell is not an interactive TTY.
- Product behavior observed: Colony refused non-interactive startup and printed
  the expected TTY requirement.

## Captured Output

```text
THE COLONY v1.0 - Agent Operating System

ERROR: The Colony requires an interactive terminal (TTY).
Please run directly in your terminal, not through a pipe or script.

Usage:  bun run dev
        bun run start
```

## Required Operator Smoke

Run these steps from a real interactive terminal before tagging Alpha 0:

```text
bun run start
/doctor first-run
/swarm llm "prepare a concise local-first alpha launch checklist"
/swarm status <run_id>
```

## Completion Criteria

Record the following after the operator smoke succeeds:

- run id
- provider/model used
- `/doctor first-run` outcome
- `/swarm llm` completion status
- `/swarm status <run_id>` stage summary
