# Bucket 8 Review - Beta 2 MCP/Plugin Execution Fabric

Date: 2026-05-14
Reviewer: Codex cleanup automation

## Scope

Bucket 8 isolates post-alpha MCP/plugin execution-fabric changes from Alpha 0
release evidence and Beta 1 swarm hardening. It records the current safe
plugin-package execution, registry, marketplace, lifecycle, approval, and
operator-UX evidence without claiming default live plugin execution.

Include these paths when staging Bucket 8:

- `src/mcp/plugin-package-discovery.ts`
- `src/mcp/plugin-package-execution.ts`
- `src/mcp/plugin-package-activation.ts`
- `src/mcp/plugin-package-registry-boundary.ts`
- `src/mcp/plugin-package-registry-fetch-execution.ts`
- `src/mcp/plugin-package-code-execution-policy.ts`
- `src/mcp/plugin-package-code-execution.ts`
- `src/mcp/plugin-package-marketplace*.ts`
- `src/mcp/index.ts`
- `src/verify-phase234.ts` through `src/verify-phase278.ts`
- `package.json` only when MCP/plugin verification script mappings change
- source-of-truth docs only when MCP/plugin runtime truth changes

Exclude these paths from Bucket 8:

- Alpha 0 release docs and gate evidence unless claim-safety truth changes.
- Bucket 7 swarm hardening files.
- Channel, GitHub, web-control, memory, provider, and daemon files unless a
  plugin execution-fabric truth change requires a targeted update.

## Runtime Truth

- Phase 234 starts the Beta 2 chain with approval-gated plugin package install/update execution receipts through an injected executor.
- Phases 235 through 240 add supplied registry metadata enrichment, sidecar
  activation controls, explicit host/network registry boundaries,
  registry-fetch execution receipts, package-code policy preflights, and
  approved package-code execution receipts.
- Phases 241 through 259 add read-only built-in marketplace planning,
  activation readiness, handoffs, execution status, registry-fetch status,
  metadata-bound install/update gates, and metadata-bound activation status.
- Phases 260 through 278 add read-only plugin marketplace lifecycle operator UX:
  lifecycle status, handoff, runbook, approval packets, approval review,
  approval handoff, preflight, host request descriptors, operator queues,
  default command plans, command palettes, briefs, transcripts, panels, digests,
  clipboard packets, review packets, closeout packets, and summary packets.
- The fabric preserves injected executor and injected supervisor boundaries:
  Colony can produce approval-bound descriptors and redacted receipts, but
  default live package execution, registry fetch, activation, and sidecar start
  remain host-owned and disabled unless an explicit approved injected boundary
  is provided.

## Review Findings

- Latest automation guardrail refresh: Bucket 8 is review evidence for the
  `verify:phase234` through `verify:phase278` Beta 2 MCP/plugin fabric chain.
  It preserves approval-gated plugin package install/update execution receipts,
  read-only plugin marketplace lifecycle operator UX, and injected executor and injected supervisor boundaries with no default registry fetch, package install, package-code execution, sidecar start, catalog mutation, or credential persistence.
- The current MCP/plugin surface is descriptor/receipt oriented. It is not a
  default marketplace client, package manager, sidecar launcher, or hosted
  plugin execution service.
- Registry metadata fetch remains approval-bound and host-executed; Colony does
  not ship a built-in live registry client by default.
- Package-code execution remains approval-bound, path-confined, redacted, and
  injected-host-executor based.
- Marketplace lifecycle UX remains read-only by default and emits operator
  handoff material rather than executing registry/package/activation actions.

## Verification

Required before staging the full Bucket 8 implementation:

```powershell
bun run verify:phase78
bun run verify:phase234
bun run verify:phase235
bun run verify:phase236
bun run verify:phase237
bun run verify:phase238
bun run verify:phase239
bun run verify:phase240
bun run verify:phase241
bun run verify:phase242
bun run verify:phase243
bun run verify:phase244
bun run verify:phase245
bun run verify:phase246
bun run verify:phase247
bun run verify:phase248
bun run verify:phase249
bun run verify:phase250
bun run verify:phase251
bun run verify:phase252
bun run verify:phase253
bun run verify:phase254
bun run verify:phase255
bun run verify:phase256
bun run verify:phase257
bun run verify:phase258
bun run verify:phase259
bun run verify:phase260
bun run verify:phase261
bun run verify:phase262
bun run verify:phase263
bun run verify:phase264
bun run verify:phase265
bun run verify:phase266
bun run verify:phase267
bun run verify:phase268
bun run verify:phase269
bun run verify:phase270
bun run verify:phase271
bun run verify:phase272
bun run verify:phase273
bun run verify:phase274
bun run verify:phase275
bun run verify:phase276
bun run verify:phase277
bun run verify:phase278
bun run verify:cleanup
bun run verify:alpha0
node ./node_modules/typescript/bin/tsc --noEmit
```

Recommended before a Beta 2 merge point:

```powershell
bun run verify:all
bun run build
```

Latest evidence refreshed on 2026-05-14 for this cleanup-evidence slice:

- `bun run verify:phase78` passed.
- `bun run verify:phase234` passed.
- `bun run verify:phase235` passed.
- `bun run verify:phase236` passed.
- `bun run verify:phase237` passed.
- `bun run verify:phase238` passed.
- `bun run verify:phase239` passed.
- `bun run verify:phase240` passed.
- `bun run verify:phase241` passed.
- `bun run verify:phase242` passed.
- `bun run verify:phase243` passed.
- `bun run verify:phase244` passed.
- `bun run verify:phase245` passed.
- `bun run verify:phase246` passed.
- `bun run verify:phase247` passed.
- `bun run verify:phase248` passed.
- `bun run verify:phase249` passed.
- `bun run verify:phase250` passed.
- `bun run verify:phase251` passed.
- `bun run verify:phase252` passed.
- `bun run verify:phase253` passed.
- `bun run verify:phase254` passed.
- `bun run verify:phase255` passed.
- `bun run verify:phase256` passed.
- `bun run verify:phase257` passed.
- `bun run verify:phase258` passed.
- `bun run verify:phase259` passed.
- `bun run verify:phase260` passed.
- `bun run verify:phase261` passed.
- `bun run verify:phase262` passed.
- `bun run verify:phase263` passed.
- `bun run verify:phase264` passed.
- `bun run verify:phase265` passed.
- `bun run verify:phase266` passed.
- `bun run verify:phase267` passed.
- `bun run verify:phase268` passed.
- `bun run verify:phase269` passed.
- `bun run verify:phase270` passed.
- `bun run verify:phase271` passed.
- `bun run verify:phase272` passed.
- `bun run verify:phase273` passed.
- `bun run verify:phase274` passed.
- `bun run verify:phase275` passed.
- `bun run verify:phase276` passed.
- `bun run verify:phase277` passed.
- `bun run verify:phase278` passed.
- `bun run verify:cleanup` passed after this Bucket 8 evidence file became a
  required cleanup guard.
- `bun run verify:alpha0` passed.
- `node ./node_modules/typescript/bin/tsc --noEmit` passed.

`verify:all` and `bun run build` were not rerun in this narrow cleanup-evidence
slice because no MCP/plugin runtime code changed.

## Suggested Staging Command

Use exact pathspecs. Do not use `git add .`.

```powershell
git add src/mcp src/verify-phase234.ts src/verify-phase235.ts src/verify-phase236.ts src/verify-phase237.ts src/verify-phase238.ts src/verify-phase239.ts src/verify-phase240.ts src/verify-phase241.ts src/verify-phase242.ts src/verify-phase243.ts src/verify-phase244.ts src/verify-phase245.ts src/verify-phase246.ts src/verify-phase247.ts src/verify-phase248.ts src/verify-phase249.ts src/verify-phase250.ts src/verify-phase251.ts src/verify-phase252.ts src/verify-phase253.ts src/verify-phase254.ts src/verify-phase255.ts src/verify-phase256.ts src/verify-phase257.ts src/verify-phase258.ts src/verify-phase259.ts src/verify-phase260.ts src/verify-phase261.ts src/verify-phase262.ts src/verify-phase263.ts src/verify-phase264.ts src/verify-phase265.ts src/verify-phase266.ts src/verify-phase267.ts src/verify-phase268.ts src/verify-phase269.ts src/verify-phase270.ts src/verify-phase271.ts src/verify-phase272.ts src/verify-phase273.ts src/verify-phase274.ts src/verify-phase275.ts src/verify-phase276.ts src/verify-phase277.ts src/verify-phase278.ts docs/release/BUCKET_8_REVIEW.md
```

Add `package.json` only if verification script mappings changed.

## Residual Risk

- The workspace remains broadly dirty and should still be staged bucket by
  bucket with exact pathspecs.
- This pass verified the full listed Bucket 8 phase chain plus cleanup, Alpha 0,
  and TypeScript. Reviewers should still inspect the staged diff before staging
  or merging Bucket 8.
- Later Beta 2 work should continue from concrete MCP/plugin transport,
  activation, or operator-UX gaps rather than default-live execution shortcuts.
