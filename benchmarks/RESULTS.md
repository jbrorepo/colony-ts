# Colony — SWE-bench Verified Results

**Run started:** 2026-05-30T00:00:24.764Z
**Run completed:** 2026-05-30T00:00:24.774Z
**Colony version:** 2.0.0
**Provider:** stub
**Model:** stub
**Tasks:** 3

## Summary

| Caste | Passed | Failed | Total | Pass rate |
|---|---|---|---|---|
| `nameless_swarm` | 3 | 0 | 3 | 100.0% |
| `forge_carvers` | 3 | 0 | 3 | 100.0% |
| `eldest_architect` | 3 | 0 | 3 | 100.0% |

## Per-task results

| Task | Repo | `nameless_swarm` | `forge_carvers` | `eldest_architect` |
|---|---|---|---|---|
| `smoke-001-trivial-typo` | smoke/repo | ✓ (0.0s) | ✓ (0.0s) | ✓ (0.0s) |
| `smoke-002-missing-import` | smoke/repo | ✓ (0.0s) | ✓ (0.0s) | ✓ (0.0s) |
| `smoke-003-off-by-one` | smoke/repo | ✓ (0.0s) | ✓ (0.0s) | ✓ (0.0s) |

## Methodology

Each task is run through `ColonySwarmRuntime.startObjective()` with `executionMode: 'llm'`. A task passes when all three swarm stages (plan, execute, review) complete successfully. The harness does not yet apply patches or run test commands — that wiring is the next iteration. Pass rates here measure planning + reasoning correctness, not patch correctness.

**Reproducing:**

```
bun run scripts/bench/swe-bench.ts
```
