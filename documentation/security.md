# Security Model

The Colony is designed for environments where the security team can veto
any agent feature. This document describes the threat model, the defenses
in place, and how to configure them.

If you're an operator: read this end-to-end before deploying anywhere
that isn't your laptop.

If you're a security reviewer: every claim here is enforced in code and
covered by tests in `src/__tests__/security/`.

---

## Threat model

We assume:

- **The user is trusted** — the operator running `colony` on their machine.
- **The LLM provider is untrusted** — model output may attempt prompt
  injection, may contain malicious tool calls, may reference paths
  outside the workspace.
- **Network resources are untrusted** — fetched URLs, called MCP servers,
  plugin packages from the registry.
- **Tool outputs are untrusted** — a tool that reads a file from disk
  reads attacker-influenced content into the context window.
- **The codebase is untrusted** — the workspace may contain a contributor
  PR that includes malicious build scripts.

We protect against:

| Attack | Defense |
|---|---|
| LLM-generated `rm -rf /` | Approval gate + caste RBAC + path validator |
| Path traversal via `../../../etc/passwd` | `PathValidator` checks every fs op |
| Symlink escape from workspace | `PathValidator` resolves real paths |
| Null-byte injection | `sanitizePathKey()` rejects null bytes |
| URL-encoded traversal (`%2F..%2F`) | `sanitizePathKey()` decodes + checks |
| Reserved-path access (`/etc/shadow`, Windows SAM) | `PathValidator` denies |
| Credential exfiltration via tool output | `scrubSecrets()` on all log paths |
| Token-burning via `healthCheck()` | Uses free `GET /v1/models` |
| Memory leak via unbounded evaluation log | Capped ring buffer (5000 default) |
| MCP server impersonation | Trust signatures + exact-config matching |
| Plugin code execution | Default-deny with explicit `--approved` flag |
| Daemon API surface attack | `DaemonAuthPolicy` with scoped bearer tokens |

We do NOT protect against:

- **Operator typos** that approve a destructive call — that's what audit
  trail is for.
- **Compromised npm packages** in Colony's own dependencies — we minimize
  the dep tree (no vendor LLM SDKs) but cannot eliminate it.
- **Compromised host OS** — we run as a normal user process.
- **Physical access** to the machine.

---

## Caste-based RBAC

Every actor in Colony has a **caste** — a role string that determines
which actions they may take.

The 7 castes:

| Caste | Description | Default permissions |
|---|---|---|
| `root_queen` | The operator. Anything goes. | `*` (all) |
| `eldest_architect` | Trusted senior planner. | High-tier reads, planning ops |
| `shield_generals` | Strategic agents (Gemini-tier). | High-tier reads, no shell |
| `forge_carvers` | Code-focused mid-tier. | File edits within workspace |
| `watcher_swarm` | Local-only diagnostic agents. | Reads only |
| `ledger_ants` | Financial/audit role. | Audit reads only |
| `nameless_swarm` | Lowest-trust. | File reads only |

Plus method-framework castes for specific operations (`command_ant`,
`oper_ant`, `consult_ant`, etc.).

Caste permissions are checked by `SecurityPolicyEngine.evaluate()` on
every tool call. Default decision: **DENY**.

### Configuring policy rules

```typescript
import { SecurityPolicyEngine, PolicyDecision } from "@colony/cli/security";

const policy = new SecurityPolicyEngine({ maxLogEntries: 5000 });

// Allow forge_carvers to call any file tool
policy.addRule({
  name: "forge_carvers.file_ops",
  actionPattern: "tool.fs.*",
  resourcePattern: "*",
  decision: PolicyDecision.ALLOW,
  priority: 10,
  casteList: ["forge_carvers"],
});

// Deny secret reads for everyone except root_queen
policy.addRule({
  name: "secrets.deny",
  actionPattern: "secret.read",
  resourcePattern: "*",
  decision: PolicyDecision.DENY,
  priority: 100,
});
```

Higher `priority` wins. Caste filters narrow the rule.

---

## Path validator

Every filesystem operation goes through `PathValidator.validate(path)`
before the tool runs. The validator returns:

```typescript
{
  allowed: boolean;
  violationType: "" | "null_byte" | "traversal" | "outside_workspace" | "reserved_path" | "symlink_escape";
  reason: string;
  resolvedPath: string;
}
```

It checks:

1. **Null byte injection** — rejects any path containing `\0`.
2. **Directory traversal** — `..` segments that escape the workspace.
3. **Absolute paths outside workspace** — unless explicitly added to
   `extraAllowedDirs`.
4. **Reserved paths** — `/etc/passwd`, `/etc/shadow`, Windows SAM, etc.
5. **Symlink escape** — resolves real paths to catch
   `workspace/link → /etc`.

Use it from your own code:

```typescript
import { PathValidator } from "@colony/cli/security";

const validator = new PathValidator({
  workspace: "/home/user/project",
  extraAllowedDirs: ["/tmp/colony-cache"],
});

const result = await validator.validate("../../../etc/passwd");
// result.allowed === false, result.violationType === "traversal"
```

For sanitizing keys/IDs that get joined into paths:

```typescript
import { sanitizePathKey, PathTraversalError } from "@colony/cli/security";

try {
  const safe = sanitizePathKey(userInput);
} catch (err) {
  if (err instanceof PathTraversalError) {
    // Rejected — log and bail
  }
}
```

---

## Approval gates

Mutating tool calls require operator approval. Three scopes:

| Key | Scope | When to use |
|---|---|---|
| `y` | Once | Standard case |
| `a` | Session, exact call | Same call will repeat; trust this signature |
| `s` | Inspect | See the full payload before deciding |
| `n` | Deny | Block this call, continue the run |
| `Esc` | Cancel run | Block this call, abort the run |

"Exact call this session" persists the approval scoped to a **call
signature** (hash of tool name + arguments), not to the tool. A second
call to the same tool with different arguments will re-prompt.

All approval decisions are signed and logged.

---

## Audit trail

The `SecurityPolicyEngine` maintains an evaluation log — every `evaluate()`
call records:

- Timestamp
- Actor caste + agent id
- Action + resource
- Decision (ALLOW/DENY)
- Matched rule name (or null)

The log is a **capped ring buffer** (default 5000 entries). When full,
the oldest entry is evicted. Configure with:

```typescript
const policy = new SecurityPolicyEngine({ maxLogEntries: 50_000 });
```

Read the log:

```typescript
const entries = policy.getEvaluationLog();
for (const entry of entries) {
  console.log(`[${entry.timestamp}] ${entry.actorCaste}/${entry.actorAgentId} ${entry.action} ${entry.resource} → ${entry.decision} (${entry.matchedRule ?? "default-deny"})`);
}
```

---

## Daemon auth (token scopes)

When you start the daemon for REST API access, configure
`DaemonAuthPolicy`:

```typescript
import { DaemonAuthPolicy, generateDaemonToken } from "@colony/cli/daemon";

const operatorToken = generateDaemonToken();  // 256-bit hex
const ciToken = generateDaemonToken();

const authPolicy = new DaemonAuthPolicy({
  tokens: [
    {
      token: operatorToken,
      label: "operator-laptop",
      scopes: [
        "daemon.describe",
        "sessions.read", "sessions.write",
        "swarm.read", "swarm.write",
        "mcp.read", "mcp.write",
        "web.read", "web.mutate",
      ],
    },
    {
      token: ciToken,
      label: "ci-pipeline",
      scopes: ["swarm.read", "swarm.write"], // CI can only launch swarm runs
      expiresAt: "2026-12-31T23:59:59Z",
    },
  ],
});

const server = new DaemonHttpControlPlaneServer({
  host: someControlPlaneHost,
  authPolicy,
});
await server.start();
```

Token scopes:

| Scope | Allows |
|---|---|
| `daemon.describe` | `/describe` control-plane command |
| `sessions.read` | `GET /api/v1/sessions[/:id]` |
| `sessions.write` | `POST /api/v1/sessions`, `DELETE /api/v1/sessions/:id` |
| `swarm.read` | `GET /api/v1/swarm/runs[/:id]` |
| `swarm.write` | `POST /api/v1/swarm/runs`, `POST .../cancel` |
| `mcp.read` | `GET /api/v1/mcp/servers[/:id]` |
| `mcp.write` | `POST /api/v1/mcp/servers`, `DELETE .../:id`, trust ops |
| `web.read` | All REST `GET` (catch-all for dashboard) |
| `web.mutate` | All REST `POST`/`DELETE` |

Tokens are checked in **constant time** to prevent timing attacks. The
diff library, plugin search, and other client-side surfaces never see
the raw token — only the policy class holds it.

### Token storage

- **VS Code extension:** stored in VS Code's `SecretStorage` API, never
  written to `settings.json`.
- **Daemon startup:** read from a local file (e.g. `~/.colony/daemon-token`)
  with `chmod 600`.
- **CI:** environment variable (`COLONY_DAEMON_TOKEN`).

Never commit a token. Never log a token. The library scrubs likely
secrets from log paths but assume nothing.

---

## Sandboxing (Docker executor)

Colony's policy engine is the first line of defense, but it's not
sandboxing — it's authorization. For environments where you want a
**hard isolation boundary**, use the Docker executor:

```typescript
import { createToolExecutor } from "@colony/cli/runtime";

const executor = createToolExecutor({
  kind: "docker",
  options: {
    image: "node:20-alpine",
    containerName: `colony-${sessionId}`,
    workspaceHostPath: "/home/user/project",
    readOnlyMount: false,  // true for hard read-only
    network: "none",       // default — no network access from sandbox
    extraRunArgs: ["--cap-drop=ALL", "--security-opt=no-new-privileges"],
  },
});

await executor.start();
try {
  const result = await executor.execute(["pytest", "tests/"], {
    cwd: "/home/user/project",
    timeoutSeconds: 600,
  });
} finally {
  await executor.stop();
}
```

The Docker backend:
- Runs each session in its own container
- Mounts the workspace at `/workspace` (configurable)
- Disables networking by default
- Translates host paths to container paths with sandbox containment
  (an attempt to access `/etc/passwd` falls back to the workspace root)
- Cleans up the container on `stop()`

See [`sandbox.md`](sandbox.md) for the full guide.

---

## Reporting security issues

Email `security@colony-plugins.dev` (placeholder until live). Please do
NOT open public GitHub issues for security bugs.

Expect a response within 48 hours. We commit to:
- Acknowledging the report
- Coordinating a fix timeline
- Crediting reporters (with permission) in the changelog
- Publishing a security advisory via GitHub

---

## See also

- [REST API reference](rest-api.md) — auth headers + scope tables
- [MCP server guide](mcp.md) — trust signatures
- [Sandboxing](sandbox.md) — Docker backend in depth
- [`src/__tests__/security/`](../src/__tests__/security/) — every claim
  here is enforced by these tests
