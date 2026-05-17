# Bucket 5 Review - Local Web Control Guardrails

Date: 2026-05-14
Reviewer: Codex cleanup automation

## Scope

Bucket 5 isolates the local web-control guardrail and operator UX surface.
Current code provides a scoped read-only shell, provider/workflow/swarm/channel
status rendering, and an opt-in local action handoff endpoint. It does not start
a default listener, expose public hosting, or execute mutations directly.

Include these paths when staging Bucket 5:

- `src/web-control.ts`
- `src/verify-phase89.ts`
- `src/verify-phase227.ts`
- `src/verify-phase231.ts`
- `docs/release/BUCKET_5_REVIEW.md`
- `src/daemon/auth.ts` only if its diff is exclusively scoped to `web.read` /
  `web.mutate` authorization support

Exclude these paths from Bucket 5:

- Bucket 0 cleanup control-plane docs.
- Bucket 1 public alpha docs.
- Bucket 2 swarm runtime.
- Bucket 3 onboarding/provider smoke.
- Bucket 4 GitHub guardrails, except for shared phase 227 evidence.
- Any public listener, hosted control plane, credential persistence, or direct
  action execution path.

## Runtime Truth

- `handleWebControlRequest` serves `/control` and `/control/state` as GET-only
  authenticated read surfaces.
- Read access requires a `DaemonAuthPolicy` with `web.read`.
- Default serialized state is read-only and exposes no mutation endpoints.
- The local operator shell renders bounded daemon, provider, workflow, swarm,
  and channel status without transcript, message, content, tool-output, or
  arbitrary metadata bodies.
- Enabling mutation only advertises `/control/action` as a local-only POST
  handoff endpoint with `web.mutate` required.
- Mutation-enabled local shells render only explicitly allowed local action
  controls.
- Mutation handoff rejects missing/insufficient scopes, non-local hosts, missing
  approval, disallowed actions, oversized bodies, and invalid JSON.
- Accepted action handoffs return `202`, `executed: false`,
  `publicHosting: false`, and host-mediated boundary text.
- The shell projects daemon/workflow/swarm/channel status only and redacts
  tokens, secret-like query params, transcript/message/content/tool-output
  bodies, arbitrary metadata, and configured auth token values.

## Review Findings

- Latest automation guardrail refresh: canonical web control remains a
  local-only authenticated operator shell with web.read and web.mutate scoped access.
  It preserves no default public listener, no hosted control plane, and no direct mutation execution.
- Phase 89 covers the read-only web shell, auth failure behavior, GET-only
  boundary, JSON state redaction, no mutation affordances, and no form controls.
- Phase 227 covers local scoped mutation handoff guardrails: `web.mutate`, local
  host requirement, explicit approval flag, no direct execution, and no public
  hosting.
- Phase 231 covers the local web-control operator UX: local-only shell/state
  routing, provider/workflow/swarm/channel status rendering, mutation-enabled
  local action controls, deterministic missing-scope/public-host rejection,
  explicit approval requirement, no direct mutation execution, no public
  hosting, and no secret/body echo.
- The current code is appropriate for Alpha 0 guardrail claims and Alpha 2
  local UX review, but it remains intentionally local-only and host-mediated
  rather than an OpenClaw-style hosted control plane.

## Verification

Required before staging Bucket 5:

```powershell
bun run verify:phase89
bun run verify:phase227
bun run verify:phase231
bun run verify:alpha0
```

Recommended before release-candidate tagging:

```powershell
bun run verify:all
```

Evidence captured on 2026-05-13:

- `bun run verify:phase89` passed: 36 passed, 0 failed.
- `bun run verify:phase227` passed: 17 passed, 0 failed.
- `bun run verify:cleanup` passed.
- `bun run verify:alpha0` passed: phase 226, phase 227, and launch alpha gate
  all green.
- `node ./node_modules/typescript/bin/tsc --noEmit` passed.

Evidence refreshed on 2026-05-14:

- `bun run verify:phase89` passed: 36 passed, 0 failed.
- `bun run verify:phase227` passed: 17 passed, 0 failed.
- `bun run verify:phase231` passed: 33 passed, 0 failed.
- `bun run verify:alpha0` passed: phase 226, phase 227, and launch alpha gate
  all green.
- `bun run verify:cleanup` passed.
- Latest automation refresh also passed
  `node ./node_modules/typescript/bin/tsc --noEmit`.

## Suggested Staging Command

Use an exact pathspec. Do not use `git add .`.

```powershell
git add src/web-control.ts src/verify-phase89.ts src/verify-phase227.ts src/verify-phase231.ts docs/release/BUCKET_5_REVIEW.md docs/release/WORKSPACE_INVENTORY.md docs/release/COMMIT_BUCKETS.md docs/release/tracked-change-inventory.txt docs/release/tracked-change-stat.txt docs/release/workspace-status.txt
```

Add `src/daemon/auth.ts` only after confirming its diff is exclusive to web
control scopes.

## Residual Risk

- This bucket intentionally stops before hosted/default-public web delivery and
  direct mutation execution. Those remain deferred unless a later explicit
  approval and hosting slice changes scope.
- The automation pass did not start a listener or run browser/manual UI smoke by
  design; verification covers pure request handlers and HTML/state rendering.
- Phase 227 also covers GitHub guardrails, so reviewers should separate the web
  assertions from Bucket 4 when staging.
