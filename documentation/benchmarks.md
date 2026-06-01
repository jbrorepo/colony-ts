# Benchmarks

How to reproduce Colony's benchmark numbers.

## SWE-bench Verified

The harness lives at [`scripts/bench/swe-bench.ts`](../scripts/bench/swe-bench.ts).
Three caste configurations run against each task:

- `nameless_swarm` — lowest tier
- `forge_carvers` — code-focused mid tier
- `eldest_architect` — top tier

### Dry run (no LLM calls)

Validates the harness without spending tokens:

```bash
bun run bench:swe:dry
# → 3 tasks × 3 castes = 9 stub runs, ~5 seconds
```

Output:
- `benchmarks/RESULTS.md` — Markdown summary
- `benchmarks/results.json` — full per-task JSON

### Live runs

> **Status:** the `makeLiveRunner()` wiring is a stub today. Live runs
> against real models are pending — track in
> [`COMPETITIVE_GAPS_PLAN.md`](../COMPETITIVE_GAPS_PLAN.md) (C2
> follow-on).

When wired:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export COLONY_PROVIDER=anthropic
export COLONY_MODEL=claude-sonnet-4-6

bun run bench:swe -- --tasks=20
```

### Custom task set

```bash
bun run bench:swe -- --task-file=tasks/my-tasks.json --out=results/custom.json
```

Schema:

```json
{
  "tasks": [
    {
      "id": "django__django-12345",
      "repo": "django/django",
      "baseCommit": "abc123",
      "problemStatement": "Fix the X bug...",
      "expectedPatchHashes": ["sha256:..."],
      "testCommand": "pytest path/to/test.py"
    }
  ]
}
```

### Caste filter

```bash
bun run bench:swe -- --caste=eldest_architect --tasks=10
```

## Reproducibility

Published numbers in [`benchmarks/RESULTS.md`](../benchmarks/RESULTS.md)
include:
- Colony version (`npm_package_version`)
- Provider + model
- Run start / completion timestamps
- Per-task durations + stage statuses

Re-running with the same task set should produce comparable numbers
modulo provider non-determinism.

## See also

- [Swarm runs](swarm.md) — what's happening under the hood per task
- [`scripts/bench/swe-bench.ts`](../scripts/bench/swe-bench.ts) — full source
