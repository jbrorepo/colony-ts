# Colony Test Suite

Built on [Bun's native test runner](https://bun.sh/docs/cli/test) — no extra dependencies.

## Running tests

```bash
bun test                  # run all tests once
bun test --watch          # re-run on file change
bun test src/__tests__/security   # run one directory
bun run test:integration  # run the legacy verify:alpha0 smoke gate
```

## Writing a new test

Create `src/__tests__/<subsystem>/<module>.test.ts`:

```ts
import { describe, test, expect, beforeEach } from "bun:test";
import { MyClass } from "../../path/to/module";

describe("MyClass", () => {
  test("does the right thing", () => {
    const obj = new MyClass();
    expect(obj.result()).toBe("expected");
  });

  test("throws on bad input", () => {
    expect(() => new MyClass(null as any)).toThrow();
  });
});
```

## Directory layout

```
src/__tests__/
  llm/
    anthropic.test.ts           Model catalog, default model, healthCheck
    failover-executor.test.ts   Backoff, circuit breaker, failover ordering, events
  orchestrator/
    swarm-concurrency.test.ts   maxConcurrentRuns semaphore, slot release on failure
  runtime/
    session.test.ts             Lifecycle, ID entropy, history eviction
  security/
    policy.test.ts              Default-deny, evaluationLog cap, globMatch, castes
    path-validator.test.ts      Traversal protection, sanitizePathKey, null bytes, URL-encoded attacks
  workflow/
    memory-store.test.ts        CRUD, deep-copy isolation
```

**Current coverage:** 95 tests, 7 files, ~0.75 seconds total.

## Converting a verify-phase script

1. Find the section functions in the script (e.g., `verifySession()`)
2. Each section becomes a `describe` block
3. Each `assert(condition, label)` becomes `expect(condition).toBe(true)` (or a more specific matcher)
4. Each `assertEqual(actual, expected, label)` becomes `expect(actual).toBe(expected)`
5. Async functions use `async test(...)`

The legacy `src/verify-phase*.ts` scripts remain as integration gates and run via
`bun run verify:all`. Convert them here when you touch the relevant subsystem.
