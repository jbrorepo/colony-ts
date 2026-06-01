# Sandboxing — `ToolExecutor`

Colony's security policy engine is the first line of defense, but it's
**authorization, not isolation**. When you need a hard boundary — even
the operator can't accidentally let a tool out — use the Docker
executor.

## Why this exists

The policy engine prevents `nameless_swarm` from running `rm -rf /`
because no rule allows it. But the engine assumes:

- The tool process can read every file in the workspace
- The tool process inherits the operator's network access
- A bug in policy evaluation could let through a call that shouldn't run

For deployments where any of these are unacceptable (untrusted
contributor PRs, multi-tenant runtime, regulated environments), the
`DockerToolExecutor` adds an OS-level sandbox.

## Interface

```typescript
export interface ToolExecutor {
  readonly name: string;
  readonly kind: "host" | "docker" | string;
  execute(args: string[], options: ToolExecutorOptions): Promise<ToolExecutorResult>;
  start?(): Promise<void>;
  stop?(): Promise<void>;
  describe?(): ToolExecutorDescription;
}
```

Two implementations ship:

- **`HostToolExecutor`** — wraps `Bun.spawn`, default behavior, always
  merges parent `process.env` so children inherit `PATH`.
- **`DockerToolExecutor`** — per-session container with `--network none`
  default, workspace mount, sandbox containment for escape attempts.

Pick one with the factory:

```typescript
import { createToolExecutor } from "@colony/cli/runtime";

const exec = createToolExecutor({ kind: "host" });
// or
const exec = createToolExecutor({
  kind: "docker",
  options: {
    image: "node:20-alpine",
    containerName: `colony-${sessionId}`,
    workspaceHostPath: "/home/user/project",
  },
});
```

## Docker executor

### Required options

| Option | Default | Notes |
|---|---|---|
| `image` | — | e.g. `node:20-alpine`, `ubuntu:22.04` |
| `containerName` | — | Must match `^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$` |
| `workspaceHostPath` | — | Absolute path on the host |

### Optional options

| Option | Default | Notes |
|---|---|---|
| `workspaceContainerPath` | `/workspace` | Where the mount appears inside |
| `readOnlyMount` | `false` | When `true`, mount is `:ro` |
| `network` | `"none"` | Passed to `--network`. Use `"bridge"` if tools need network. |
| `extraRunArgs` | `[]` | Appended to `docker run` |
| `dockerBin` | `"docker"` | Override for podman, etc. |
| `defaultMaxOutputChars` | `1_048_576` | 1 MiB per stream |

### Lifecycle

```typescript
const executor = createToolExecutor({
  kind: "docker",
  options: {
    image: "node:20-alpine",
    containerName: "colony-session-abc",
    workspaceHostPath: "/home/user/project",
    readOnlyMount: false,
    network: "none",
    extraRunArgs: ["--cap-drop=ALL", "--security-opt=no-new-privileges"],
  },
});

await executor.start();
try {
  // Many execute() calls reuse the same container
  const a = await executor.execute(["ls", "-la"], {
    cwd: "/home/user/project",
    timeoutSeconds: 30,
  });
  const b = await executor.execute(["bun", "test"], {
    cwd: "/home/user/project/packages/api",
    timeoutSeconds: 600,
  });
} finally {
  await executor.stop();  // tears down the container
}
```

`start()` is idempotent within a single instance. `stop()` is idempotent
too — call it from `finally` blocks without worry.

### Path mapping

When you pass a host-side `cwd` to `execute()`, the executor translates
it to the container's mount path automatically:

```typescript
// workspaceHostPath: "/home/user/project"
// workspaceContainerPath: "/workspace"

// Host cwd "/home/user/project/src" → container cwd "/workspace/src"
// Host cwd "/etc/passwd" → container cwd "/workspace" (sandbox containment)
```

The escape-attempt case is intentional: rather than failing or letting
the call out of the mount, we contain it back to the workspace root.

### Security hardening

For untrusted workloads, recommended `extraRunArgs`:

```typescript
extraRunArgs: [
  "--cap-drop=ALL",                  // drop all Linux capabilities
  "--security-opt=no-new-privileges", // prevent setuid escalation
  "--read-only",                     // root filesystem read-only
  "--tmpfs=/tmp:rw,size=128m",       // writable /tmp with size cap
  "--user=1000:1000",                // non-root user
  "--memory=2g",                     // RAM cap
  "--cpus=2",                        // CPU cap
  "--pids-limit=512",                // process count cap
]
```

For an even stronger boundary, switch from Docker to `gvisor` or
`firecracker` by writing a new `ToolExecutor` implementation.

## Custom executor

To plug in a different backend (gvisor, kata, firecracker, wasm):

```typescript
import type { ToolExecutor, ToolExecutorOptions, ToolExecutorResult } from "@colony/cli/runtime";

class GVisorToolExecutor implements ToolExecutor {
  readonly name = "gvisor";
  readonly kind = "gvisor";

  async start(): Promise<void> { /* ... */ }
  async stop(): Promise<void> { /* ... */ }

  async execute(args: string[], options: ToolExecutorOptions): Promise<ToolExecutorResult> {
    // shell out to runsc or whatever
  }

  describe() {
    return { name: this.name, kind: this.kind, ready: true };
  }
}
```

Wire it through the same call-site path the existing `runProcess()` uses.

## What's still pending

Today the Docker executor is **available** but most call sites in
`src/runtime/builtin-tools.ts` still call `Bun.spawn` directly. The
interface is shipped; the migration of every call site to use
`executor.execute()` is in progress. Track in
[`COMPETITIVE_GAPS_PLAN.md`](../COMPETITIVE_GAPS_PLAN.md) (C7
follow-on).

## See also

- [Security model](security.md) — policy engine + path validator
- [Configuration](configuration.md) — picking an executor per env
- [`src/__tests__/runtime/tool-executor.test.ts`](../src/__tests__/runtime/tool-executor.test.ts) — 29 tests
