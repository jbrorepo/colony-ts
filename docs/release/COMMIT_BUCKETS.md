# Commit Buckets For Launch Alpha 0 Cleanup

This file turns the current dirty workspace into reviewable release slices. Keep
each bucket independently reviewable, verified, and reversible. Do not reset or
discard work owned by another session.

## Bucket 0 - Cleanup Control Plane

Purpose: preserve the real workspace state and install lightweight release gates.

Candidate files:
- `docs/PROJECT_STATE.md`
- `docs/release/WORKSPACE_INVENTORY.md`
- `docs/release/COMMIT_BUCKETS.md`
- `docs/release/BUCKET_0_REVIEW.md`
- `docs/release/tracked-change-inventory.txt`
- `docs/release/tracked-change-stat.txt`
- `docs/release/workspace-status.txt`
- `docs/release/COMPETITOR_COMPLETION_BOARD.md`
- `docs/release/COMPETITOR_GAP_ANALYSIS_2026-05-11.md`
- `docs/superpowers/plans/2026-05-10-workplace-cleanup-launch-order.md`
- `docs/superpowers/plans/2026-05-11-competitor-gap-closure.md`
- `docs/COLONY_BIBLE.md`
- `src/verify-workspace-cleanup.ts`
- `src/verify-release.ts`
- `package.json`
- `docs/ROADMAP.md`
- `docs/GAP_ANALYSIS.md`
- `docs/BENCHMARK_BOARD.md`
- `docs/DECISIONS.md`

Verification:
- `bun run verify:cleanup`
- `bun run verify:alpha0`
- `node ./node_modules/typescript/bin/tsc --noEmit`

Release note:
- Establishes the project truth map, dirty-worktree inventory, and release gate
  commands. It does not ship new runtime behavior.

Current cleanup status:
- Bucket 0 should be reviewed first because it contains the inventory, release
  control plane, and competitor closure plan used to split the rest of the dirty
  tree.
- Do not include runtime implementation files in Bucket 0 unless a verifier or
  package script requires them for the cleanup gate.

## Bucket 1 - Public Alpha Documentation

Purpose: make the source+Bun alpha understandable and claim-safe for a public
checkout.

Candidate files:
- `README.md`
- `docs/LAUNCH_ALPHA_0.md`
- `docs/release/ALPHA_0_RELEASE_NOTES.md`
- `docs/release/ALPHA_0_RELEASE_READINESS.md`
- `docs/release/BUCKET_1_REVIEW.md`
- `docs/templates/antelligence/release-readiness-checklist.md`
- supporting launch docs updated only for runtime truth changes

Verification:
- `bun run verify:alpha0`
- claim-safety search against public docs

Release note:
- Public docs must describe only source checkout onboarding, local-first runtime,
  conservative approvals, real model-backed swarm demo, local GitHub handoff, and
  local-only web control guardrails.

## Bucket 2 - Real Swarm Runtime

Purpose: isolate planner/worker/reviewer LLM swarm execution from docs and
guardrail changes.

Candidate files:
- `src/orchestrator/coordinator.ts`
- `src/orchestrator/index.ts`
- `src/orchestrator/swarm.ts`
- `src/gateway-swarm.ts`
- `src/verify-phase226.ts`
- `docs/release/BUCKET_2_REVIEW.md`
- workflow/AgentLoop integration code only when the diff is exclusive to this
  bucket
- deterministic fake-provider phase verifier coverage
- focused swarm status/resume/retry tests

Verification:
- `bun run verify:phase226`
- `bun run verify:alpha0`
- `bun run verify:all` before release-candidate tagging

Release note:
- This is the launch headline runtime bucket. It must persist stage state,
  artifacts, failures, approval waits, attempts, and retry history without live
  network dependencies in tests.

Current cleanup status:
- Bucket 2 review evidence is recorded in `docs/release/BUCKET_2_REVIEW.md`.
- Stage this bucket by exact pathspec only; do not include public docs,
  onboarding, GitHub guardrails, web-control guardrails, or unrelated memory /
  channel / daemon work.

## Bucket 3 - Source+Bun Onboarding

Purpose: keep first-run setup, doctor output, provider guidance, and alpha smoke
coverage separate from runtime behavior.

Candidate files:
- `src/alpha0-provider-readiness.ts`
- `src/verify-alpha0.ts`
- `docs/release/ALPHA_0_PROVIDER_SMOKE.md`
- `docs/release/ALPHA_0_TERMINAL_UI_SMOKE.md`
- `docs/release/ALPHA_0_DEPENDENCY_RISK.md`
- `docs/release/BUCKET_3_REVIEW.md`
- first-run doctor code only if a concrete onboarding defect is fixed
- package scripts only if not already staged with Bucket 0
- README command examples only if not already staged with Bucket 1

Verification:
- `bun run src/verify-alpha0.ts`
- README/package command drift check
- `bun run verify:alpha0`

Release note:
- Source+Bun is the release vehicle. Compiled binary output remains optional for
  Alpha 0.

Current cleanup status:
- Bucket 3 review evidence is recorded in `docs/release/BUCKET_3_REVIEW.md`.
- The true remaining Alpha 0 blocker is still the manual interactive terminal
  UI smoke; the automation shell can only record the non-TTY boundary.

## Bucket 4 - GitHub Local Execution Guardrails

Purpose: promote GitHub support only where it is safe locally.

Candidate files:
- `src/github-pr-handoff.ts`
- `src/github-local-workspace-executor.ts`
- `src/verify-phase227.ts`
- `src/verify-phase228.ts`
- `src/verify-phase229.ts`
- `src/verify-phase230.ts`
- `docs/release/BUCKET_4_REVIEW.md`
- workflow `github_pr_handoff` template files only if their diffs are exclusive
  to this bucket
- GitHub provided-issue intake, handoff, and local branch/worktree planning code
- approval-gated local action-plan tests
- redaction and no-push/no-PR guardrail tests

Verification:
- `bun run verify:phase227`
- `bun run verify:phase228`
- `bun run verify:phase229`
- `bun run verify:phase230`
- `bun run verify:alpha0`
- no credential or remote mutation tests by default

Release note:
- Issue intake, deterministic branch planning, local branch/worktree creation
  behind explicit approval, verification-before-PR, and PR handoff are in scope.
  Push and PR creation are not default Alpha 0 behavior.

Current cleanup status:
- Bucket 4 review evidence is recorded in `docs/release/BUCKET_4_REVIEW.md`.
- Current code emits approval-gated local action plans and an injected approved
  branch/worktree execution receipt path plus a verified PR handoff artifact
  path. Remote push and PR creation remain non-default operator actions.

## Bucket 5 - Local Web Control Guardrails

Purpose: allow only local, scoped, approval-aware web control mutations.

Candidate files:
- `src/web-control.ts`
- `src/verify-phase89.ts`
- `src/verify-phase227.ts`
- `src/verify-phase231.ts`
- `docs/release/BUCKET_5_REVIEW.md`
- `src/daemon/auth.ts` only if its diff is exclusively scoped to web control
  auth scopes
- web control auth/scope code
- local bind checks
- mutation approval tests
- public-hosting opt-in checks

Verification:
- `bun run verify:phase89`
- `bun run verify:phase227`
- `bun run verify:phase231`
- `bun run verify:alpha0`

Release note:
- Alpha 0 may expose local controls, but not a default public listener or hosted
  product surface.

Current cleanup status:
- Bucket 5 review evidence is recorded in `docs/release/BUCKET_5_REVIEW.md`.
- Current code is a safe local operator shell/action-handoff boundary with
  provider/workflow/swarm/channel status and host-mediated action controls.
  Hosted/default-public web delivery remains deferred.

## Bucket 6 - Release Candidate Gate

Purpose: aggregate verified buckets into an Alpha 0 candidate.

Candidate files:
- `docs/release/BUCKET_6_REVIEW.md`
- `docs/release/WORKSPACE_INVENTORY.md`
- `docs/release/COMMIT_BUCKETS.md`
- `docs/release/RC_CLEAN_CHECKOUT_REHEARSAL.md` only if clean-checkout
  rehearsal truth changes
- `docs/release/RC_EXACT_STAGING_MANIFEST.md` only if staging or rehearsal
  command truth changes
- `docs/release/tracked-change-inventory.txt`
- `docs/release/tracked-change-stat.txt`
- `docs/release/workspace-status.txt`
- release notes and readiness docs only after Buckets 0 through 5 have recorded
  their verification evidence and only when release truth changes

Verification:
- `bun run verify:alpha0`
- `bun run verify:all`
- `bun run build`
- `bun run release:gate`
- manual source+Bun demo smoke
- final claim-safety search

Release note:
- Only cut a candidate after every previous bucket has an explicit verification
  result and unresolved risks are recorded.

Current cleanup status:
- Bucket 6 automated gate evidence is recorded in
  `docs/release/BUCKET_6_REVIEW.md`.
- `bun run verify:alpha0`, `node ./node_modules/typescript/bin/tsc --noEmit`,
  `bun run verify:all`, `bun run build`, and `bun run release:gate` passed on
  2026-05-14.
- Final claim-safety search found only non-goal, guardrail, or gap-planning
  references.
- Provider readiness must be rerun in the final operator environment, and the
  manual interactive terminal UI smoke remains the Alpha 0 release blocker.
- Clean-checkout rehearsal preflight is recorded in
  `docs/release/RC_CLEAN_CHECKOUT_REHEARSAL.md`; final rehearsal is blocked
  until reviewed buckets are staged and committed by exact pathspec so a clean
  checkout contains the release-critical docs and verifier files.
- Exact staging order is recorded in
  `docs/release/RC_EXACT_STAGING_MANIFEST.md`; it is a plan only and must not
  be executed without explicit operator approval.

## Bucket 7 - Beta 1 Swarm Hardening

Purpose: keep post-alpha swarm production-hardening changes separate from the
Launch Alpha 0 buckets.

Candidate files:
- `src/orchestrator/swarm.ts`
- `src/orchestrator/index.ts`
- `src/gateway-swarm.ts`
- `src/verify-phase233.ts`
- `package.json`
- source-of-truth docs updated only for swarm runtime truth changes

Verification:
- `bun run verify:phase233`
- `bun run verify:phase226`
- `bun run verify:cleanup`
- `bun run verify:alpha0`
- `node ./node_modules/typescript/bin/tsc --noEmit`
- `bun run verify:all`
- `bun run build`

Release note:
- Adds swarm stage timeline/retry-history/artifact-review/interrupted-resume/approval-wait
  inspection and deterministic failure hardening, including restart-safe
  cancellation and bounded manual retry preservation, without changing public hosting,
  credentials, channel delivery, or remote mutation boundaries.

## Bucket 8 - Beta 2 MCP/Plugin Execution Fabric

Purpose: keep post-alpha MCP/plugin execution-fabric changes separate from
Alpha 0 and Beta 1 swarm runtime buckets.

Candidate files:
- `src/mcp/plugin-package-discovery.ts`
- `src/mcp/plugin-package-execution.ts`
- `src/mcp/plugin-package-activation.ts`
- `src/mcp/plugin-package-registry-boundary.ts`
- `src/mcp/plugin-package-registry-fetch-execution.ts`
- `src/mcp/plugin-package-code-execution-policy.ts`
- `src/mcp/plugin-package-code-execution.ts`
- `src/mcp/plugin-package-marketplace.ts`
- `src/mcp/plugin-package-activation-readiness.ts`
- `src/mcp/plugin-package-activation-handoff.ts`
- `src/mcp/plugin-package-activation-handoff-execution.ts`
- `src/mcp/plugin-package-activation-execution-status.ts`
- `src/mcp/plugin-package-marketplace-install-handoff.ts`
- `src/mcp/plugin-package-marketplace-install-handoff-execution.ts`
- `src/mcp/plugin-package-marketplace-install-execution-status.ts`
- `src/mcp/plugin-package-marketplace-registry-fetch-handoff.ts`
- `src/mcp/plugin-package-marketplace-registry-fetch-handoff-execution.ts`
- `src/mcp/plugin-package-marketplace-registry-fetch-execution-status.ts`
- `src/mcp/plugin-package-marketplace-registry-fetch-metadata-planning.ts`
- `src/mcp/plugin-package-marketplace-metadata-bound-install-handoff.ts`
- `src/mcp/plugin-package-marketplace-metadata-bound-install-handoff-execution.ts`
- `src/mcp/plugin-package-marketplace-metadata-bound-install-execution-status.ts`
- `src/mcp/plugin-package-marketplace-metadata-bound-activation-readiness.ts`
- `src/mcp/plugin-package-marketplace-metadata-bound-activation-handoff.ts`
- `src/mcp/plugin-package-marketplace-metadata-bound-activation-handoff-execution.ts`
- `src/mcp/plugin-package-marketplace-metadata-bound-activation-execution-status.ts`
- `src/mcp/plugin-package-marketplace-lifecycle-status.ts`
- `src/mcp/plugin-package-marketplace-lifecycle-handoff.ts`
- `src/mcp/plugin-package-marketplace-lifecycle-runbook.ts`
- `src/mcp/plugin-package-marketplace-lifecycle-approval-packets.ts`
- `src/mcp/plugin-package-marketplace-lifecycle-approval-review.ts`
- `src/mcp/plugin-package-marketplace-lifecycle-approval-handoff.ts`
- `src/mcp/plugin-package-marketplace-lifecycle-approval-handoff-preflight.ts`
- `src/mcp/plugin-package-marketplace-lifecycle-host-handoff-request.ts`
- `src/mcp/plugin-package-marketplace-lifecycle-operator-queue.ts`
- `src/mcp/plugin-package-marketplace-lifecycle-default-ux-plan.ts`
- `src/mcp/plugin-package-marketplace-lifecycle-default-ux-command-palette.ts`
- `src/mcp/plugin-package-marketplace-lifecycle-default-ux-command-brief.ts`
- `src/mcp/plugin-package-marketplace-lifecycle-default-ux-command-transcript.ts`
- `src/mcp/plugin-package-marketplace-lifecycle-default-ux-command-panel.ts`
- `src/mcp/plugin-package-marketplace-lifecycle-default-ux-command-panel-digest.ts`
- `src/mcp/plugin-package-marketplace-lifecycle-default-ux-command-panel-digest-clipboard.ts`
- `src/mcp/plugin-package-marketplace-lifecycle-default-ux-command-panel-digest-clipboard-review.ts`
- `src/mcp/plugin-package-marketplace-lifecycle-default-ux-command-panel-digest-clipboard-review-closeout.ts`
- `src/mcp/plugin-package-marketplace-lifecycle-default-ux-command-panel-digest-clipboard-review-closeout-summary.ts`
- `src/mcp/index.ts`
- `src/verify-phase234.ts`
- `src/verify-phase235.ts`
- `src/verify-phase236.ts`
- `src/verify-phase237.ts`
- `src/verify-phase238.ts`
- `src/verify-phase239.ts`
- `src/verify-phase240.ts`
- `src/verify-phase241.ts`
- `src/verify-phase242.ts`
- `src/verify-phase243.ts`
- `src/verify-phase244.ts`
- `src/verify-phase245.ts`
- `src/verify-phase246.ts`
- `src/verify-phase247.ts`
- `src/verify-phase248.ts`
- `src/verify-phase249.ts`
- `src/verify-phase250.ts`
- `src/verify-phase251.ts`
- `src/verify-phase252.ts`
- `src/verify-phase253.ts`
- `src/verify-phase254.ts`
- `src/verify-phase255.ts`
- `src/verify-phase256.ts`
- `src/verify-phase257.ts`
- `src/verify-phase258.ts`
- `src/verify-phase259.ts`
- `src/verify-phase260.ts`
- `src/verify-phase261.ts`
- `src/verify-phase262.ts`
- `src/verify-phase263.ts`
- `src/verify-phase264.ts`
- `src/verify-phase265.ts`
- `src/verify-phase266.ts`
- `src/verify-phase267.ts`
- `src/verify-phase268.ts`
- `src/verify-phase269.ts`
- `src/verify-phase270.ts`
- `src/verify-phase271.ts`
- `src/verify-phase272.ts`
- `src/verify-phase273.ts`
- `src/verify-phase274.ts`
- `src/verify-phase275.ts`
- `src/verify-phase276.ts`
- `src/verify-phase277.ts`
- `src/verify-phase278.ts`
- `package.json`
- source-of-truth docs updated only for MCP/plugin runtime truth changes

Verification:
- `bun run verify:phase78`
- `bun run verify:phase234`
- `bun run verify:phase235`
- `bun run verify:phase236`
- `bun run verify:phase237`
- `bun run verify:phase238`
- `bun run verify:phase239`
- `bun run verify:phase240`
- `bun run verify:phase241`
- `bun run verify:phase242`
- `bun run verify:phase243`
- `bun run verify:phase244`
- `bun run verify:phase245`
- `bun run verify:phase246`
- `bun run verify:phase247`
- `bun run verify:phase248`
- `bun run verify:phase249`
- `bun run verify:phase250`
- `bun run verify:phase251`
- `bun run verify:phase252`
- `bun run verify:phase253`
- `bun run verify:phase254`
- `bun run verify:phase255`
- `bun run verify:phase256`
- `bun run verify:phase257`
- `bun run verify:phase258`
- `bun run verify:phase259`
- `bun run verify:phase260`
- `bun run verify:phase261`
- `bun run verify:phase262`
- `bun run verify:phase263`
- `bun run verify:phase264`
- `bun run verify:phase265`
- `bun run verify:phase266`
- `bun run verify:phase267`
- `bun run verify:phase268`
- `bun run verify:phase269`
- `bun run verify:phase270`
- `bun run verify:phase271`
- `bun run verify:phase272`
- `bun run verify:phase273`
- `bun run verify:phase274`
- `bun run verify:phase275`
- `bun run verify:phase276`
- `bun run verify:phase277`
- `bun run verify:phase278`
- `bun run verify:cleanup`
- `bun run verify:alpha0`
- `node ./node_modules/typescript/bin/tsc --noEmit`
- `bun run verify:all`
- `bun run build`

Release note:
- Adds approval-gated plugin package install/update execution receipts through
  an injected executor with exact plugin trust approval, package-path
  confinement, lifecycle-script blocking, redacted previews, and
  stop-after-failure ordering. Registry fetch, live activation, sidecar
  startup, and credential persistence remain disabled by default.
- Adds supplied registry metadata enrichment to plugin package planning with
  checksum/integrity/signature summaries, mismatch rejection before trust
  signatures, and raw signature redaction. Live registry fetch, live activation,
  sidecar startup, package execution beyond lifecycle-disabled install/update
  receipts, and credential persistence remain disabled by default.
- Adds approval-gated package-driven sidecar activation controls through an
  injected supervisor after exact approval and a matching completed install/update
  receipt. The activation receipt is redacted and performs no live registry
  fetch, default activation, package lifecycle execution, transport creation, or
  credential persistence.
- Adds the explicit host/network boundary needed before future live registry
  metadata fetch: high-risk exact approval, HTTPS/no-credential/no-local URL
  validation, redacted host handoff, and no Colony-owned fetch, package
  execution, activation, catalog mutation, or credential persistence.
- Adds the approval-gated injected host-executor registry metadata fetch receipt
  on top of that boundary. The receipt validates response status,
  content-type, size, JSON shape, package identity, and digest; persists only
  redacted audit truth; and still creates no built-in Colony registry client,
  default marketplace fetch, package execution, activation, catalog mutation, or
  credential persistence.
- Adds exact-approval package-code execution policy preflights that require a
  matching completed install/update receipt and produce only a redacted
  host-action descriptor for bounded test/build/lint commands. Lifecycle
  scripts, shell-like commands, path escapes, receipt/signature tampering, and
  unknown sidecars fail closed. The preflight still executes no plugin package
  code, calls no executor, starts no sidecar, fetches no registry, mutates no
  catalog, and persists no credentials.
- Adds approved package-code execution receipts that require a ready preflight,
  exact approval, path confinement, and an injected host executor. Receipts are
  bounded and redacted, call the executor at most once, and still fetch no
  registry, activate no sidecar, mutate no catalog, and persist no credentials.
- Adds a read-only built-in plugin marketplace view over bundled descriptors
  with safe plan summaries, source redaction, query hashing, unsafe descriptor
  rejection, and no registry fetch, package install, package execution, sidecar
  activation, catalog mutation, or credential persistence.
- Adds a read-only plugin marketplace activation-readiness view over bundled
  descriptors with review/install-receipt/approval/operator-handoff states,
  receipt and approval summaries, active-state inspection, redaction, and no
  registry fetch, package install, package execution, sidecar activation,
  catalog mutation, or credential persistence.
- Adds a redacted plugin marketplace activation handoff descriptor over bundled
  descriptors. Ready activation-readiness entries can produce an exact-approval
  host-action descriptor for the injected supervisor activation path, while
  still performing no registry fetch, package install, package execution,
  sidecar activation, catalog mutation, or credential persistence.
- Adds approved plugin marketplace activation handoff execution receipts over
  bundled descriptors. Ready handoffs can delegate to the existing injected
  supervisor activation helper only after matching handoff/action/install
  receipt/approval validation, while still performing no registry fetch,
  package install, package-code execution, catalog mutation, or credential
  persistence.
- Adds read-only plugin marketplace activation execution status over bundled
  descriptors. Readiness entries can be projected against approved
  handoff-execution receipts and active sidecar signatures to show
  `not_executed`, `blocked`, `failed`, `completed`, or `active` operator
  state while still performing no registry fetch, package install,
  package-code execution, sidecar start, catalog mutation, or credential
  persistence.
- Adds redacted plugin marketplace install/update handoff descriptors over
  bundled descriptors. Import/update entries can produce an exact-approval
  host-action descriptor for the existing injected install/update executor path,
  while still performing no registry fetch, package install, package-code
  execution, sidecar activation, sidecar start, catalog mutation, or credential
  persistence.
- Adds read-only plugin marketplace install/update execution status over
  bundled descriptors and supplied receipts. Handoffs can be projected against
  install/update receipts to show `not_executed`, `blocked`, `failed`, or
  `completed` operator state while still performing no registry fetch, package
  install, package-code execution, sidecar activation, sidecar start, catalog
  mutation, or credential persistence.
- Adds approved plugin marketplace install/update handoff execution receipts
  over bundled descriptors. Ready handoffs can delegate to the existing injected
  install/update helper only after matching handoff/action/approval validation,
  while blocked/tampered handoffs fail before executor calls and failed executor
  receipts remain redacted. It still performs no registry fetch, package-code
  execution, sidecar activation, sidecar start, catalog mutation, or credential
  persistence.
- Adds redacted plugin marketplace registry metadata fetch handoff descriptors
  over bundled descriptors. Ready handoffs bind safe bundled entries to the
  existing injected registry-fetch executor path and embed the generic registry
  boundary truth, while missing entries, missing/unsafe registry URLs, wrong
  approvals, and rejected package actions fail closed. It still performs no
  built-in network fetch, package install/update, package-code execution,
  sidecar activation/start, catalog mutation, or credential persistence.
- Adds read-only plugin marketplace registry fetch execution status over
  bundled descriptors and supplied registry-fetch receipts. Handoffs can be
  projected against receipts to show `not_executed`, `blocked`, `failed`, or
  `completed` operator state while still performing no registry fetch, package
  install/update, package-code execution, sidecar activation/start, catalog
  mutation, or credential persistence.
- Adds approved plugin marketplace registry fetch handoff execution receipts
  over bundled descriptors. Ready handoffs can delegate to the existing injected
  registry-fetch helper only after matching handoff/action/approval validation,
  while blocked/tampered handoffs fail before executor calls and failed executor
  receipts remain redacted. It still creates no built-in registry client,
  package install/update, package-code execution, sidecar activation/start,
  catalog mutation, or credential persistence.
- Adds read-only plugin marketplace registry-fetch metadata planning over
  bundled descriptors. Completed redacted registry-fetch receipts can gate
  host-supplied full metadata before the existing package planner consumes it,
  but receipts alone are not converted into trust input; mismatched supplied
  metadata is rejected. It still performs no registry fetch, package
  install/update, package-code execution, sidecar activation/start, catalog
  mutation, or credential persistence.
- Adds metadata-bound marketplace install/update handoff descriptors over
  bundled descriptors. A Phase 252 `metadata_ready` planning entry is required
  before the existing install/update handoff can become usable for that entry;
  missing/rejected metadata, wrong approval, and package-path escapes fail
  closed. It still performs no registry fetch, install/update execution,
  package-code execution, sidecar activation/start, catalog mutation, or
  credential persistence.
- Adds approved metadata-bound marketplace install/update handoff execution
  receipts over bundled descriptors. A ready Phase 253 metadata-bound handoff
  and ready nested install/update handoff are required before delegation to the
  existing injected install/update execution helper; blocked/tampered gates fail
  before executor calls, failed delegated receipts are summarized, and it still
  performs no registry fetch, package-code execution, sidecar activation/start,
  catalog mutation, or credential persistence.
- Adds read-only metadata-bound marketplace install/update execution status over
  bundled descriptors. Phase 253 handoffs can be projected against Phase 254
  receipts into metadata-blocked, not-executed, blocked, failed, or completed
  states while still performing no registry fetch, install/update execution,
  package-code execution, sidecar activation/start, catalog mutation, or
  credential persistence.
- Adds read-only metadata-bound marketplace activation readiness over
  metadata-bound install/update execution status. Completed metadata-bound
  install/update status can be projected into activation approval, handoff, or
  active next-action state while still performing no registry fetch,
  install/update execution, package-code execution, sidecar activation/start,
  catalog mutation, or credential persistence.
- Adds redacted metadata-bound marketplace activation handoff descriptors over
  ready metadata-bound activation-readiness entries. The descriptor binds exact
  approval to the injected supervisor handoff path and summarizes the
  metadata-bound install/gate state while still performing no registry fetch,
  install/update execution, package-code execution, sidecar activation/start,
  catalog mutation, or credential persistence.
- Adds approved metadata-bound marketplace activation handoff execution receipts
  over ready metadata-bound activation handoffs. Ready Phase 257 handoffs can
  delegate to the existing approved marketplace activation execution helper only
  after matching handoff/action/install-receipt/approval validation, while
  blocked/tampered gates fail before supervisor calls and failed supervisor
  receipts remain redacted. It still performs no registry fetch, install/update
  execution, package-code execution, catalog mutation, or credential persistence.
- Adds read-only metadata-bound marketplace activation execution status over
  ready metadata-bound activation readiness entries. Phase 256 readiness can be
  projected against Phase 258 receipts and active sidecar signatures into
  metadata-blocked, activation-not-ready, not-executed, blocked, failed,
  completed, or active states while still performing no registry fetch,
  install/update execution, package-code execution, sidecar start, catalog
  mutation, or credential persistence.
- Adds read-only plugin marketplace lifecycle status over existing marketplace
  metadata planning, metadata-bound install/update execution status,
  metadata-bound activation readiness, and metadata-bound activation execution
  status. It projects metadata-pending/blocked/failed,
  install-not-executed/blocked/failed, activation-not-ready/not-executed/blocked/failed,
  completed, and active operator states while still performing no registry
  fetch, install/update execution, package-code execution, sidecar start,
  catalog mutation, or credential persistence.
- Adds read-only plugin marketplace lifecycle handoff over lifecycle states with
  bounded operator-only checklist actions, approval-required versus inspect-only
  summaries, optional state/cap filtering, and no registry fetch, install/update
  execution, package-code execution, activation, sidecar start, catalog mutation,
  or credential persistence.
- Adds read-only plugin marketplace lifecycle runbook over lifecycle handoffs
  with ordered operator/reviewer steps, approval-focused filtering, cap controls,
  redaction, and no registry fetch, install/update execution, package-code
  execution, activation, sidecar start, catalog mutation, or credential
  persistence.
- Adds read-only plugin marketplace lifecycle approval packets over
  approval-required runbook steps with metadata/install/update/activation
  subject labels, prerequisite-aware ordering, phase/cap filtering, redaction,
  and no registry fetch, install/update execution, package-code execution,
  activation, sidecar start, catalog mutation, or credential persistence.
- Adds read-only plugin marketplace lifecycle approval review over supplied
  approval evidence with ready/missing/mismatch/expired states, state/cap
  filtering, signature redaction, host-action denial, and no registry fetch,
  install/update execution, package-code execution, activation, sidecar start,
  catalog mutation, or credential persistence.
- Adds read-only plugin marketplace lifecycle approval handoff descriptors over
  approval review output with ready/blocker states, phase/action/cap filtering,
  redaction, host-action denial, and no registry fetch, install/update
  execution, package-code execution, activation, sidecar start, catalog
  mutation, or credential persistence.
- Adds read-only plugin marketplace lifecycle approval handoff preflight
  descriptors over approval handoff output with ready/blocker preflight states,
  next-action guidance, host-handoff metadata redaction, state/cap filtering,
  host-action denial, and no registry fetch, install/update execution,
  package-code execution, activation, sidecar start, catalog mutation, or
  credential persistence.
- Adds read-only plugin marketplace lifecycle host handoff request descriptors
  over approval handoff preflight output with explicit request commands,
  descriptor-only host request payloads, state/kind/cap filtering, blocker
  preservation, redaction, host-action denial, and no registry fetch,
  install/update execution, package-code execution, activation, sidecar start,
  catalog mutation, or credential persistence.
- Adds read-only plugin marketplace lifecycle operator queues over host handoff
  requests. The queue groups approval blockers and presentable metadata,
  install/update, activation-readiness, and activation request lanes with
  operator actions, state/lane/cap filtering, redaction, default-live-execution
  denial, and no registry fetch, install/update execution, package-code
  execution, activation, sidecar start, catalog mutation, or credential
  persistence.
- Adds read-only plugin marketplace lifecycle default UX plans over operator
  queues. The plan maps presentable metadata, install/update,
  activation-readiness, activation, approval-collection, and approval-refresh
  items into stable default prompt command labels/ids with blocker preservation,
  command/state/cap filtering, redaction, default-live-execution denial, and no
  registry fetch, install/update execution, package-code execution, activation,
  sidecar start, catalog mutation, or credential persistence.
- Adds read-only plugin marketplace lifecycle default UX command palettes over
  default UX plans. The palette maps prompt plans into host handoff request and
  approval remediation command entries with stable command previews, safety
  badges, blocker preservation, group/state/cap filtering, redaction,
  default-live-execution denial, and no registry fetch, install/update
  execution, package-code execution, activation, sidecar start, catalog
  mutation, or credential persistence.
- Adds read-only plugin marketplace lifecycle default UX command briefs over
  default UX command palettes. The brief maps command entries into copy-safe
  ready-command and approval-remediation lines with request-bound copy text,
  display labels, blocker preservation, section/state/cap filtering, redaction,
  default-live-execution denial, and no registry fetch, install/update
  execution, package-code execution, activation, sidecar start, catalog
  mutation, or credential persistence.
- Adds read-only plugin marketplace lifecycle default UX command transcripts
  over default UX command briefs. The transcript maps brief lines into bounded
  terminal transcript lines and fixed safety summaries with operator-only
  hints, blocker preservation, section/state/cap filtering, redaction,
  default-live-execution denial, and no registry fetch, install/update
  execution, package-code execution, activation, sidecar start, catalog
  mutation, or credential persistence.
- Adds read-only plugin marketplace lifecycle default UX command panels over
  default UX command transcripts. The panel maps transcript lines into
  ready-command and approval-remediation cards plus fixed safety summaries with
  copy text, terminal hints, blocker preservation, lane/state/cap filtering,
  redaction, default-live-execution denial, and no registry fetch,
  install/update execution, package-code execution, activation, sidecar start,
  catalog mutation, or credential persistence.
- Adds read-only plugin marketplace lifecycle default UX command panel digests
  over default UX command panels. The digest maps panel cards into concise
  ready-command and approval-remediation digest items plus fixed safety
  summaries with copy text, terminal hints, blocker preservation,
  group/state/cap filtering, redaction, default-live-execution denial, and no
  registry fetch, install/update execution, package-code execution, activation,
  sidecar start, catalog mutation, or credential persistence.
- Adds read-only plugin marketplace lifecycle default UX command panel digest
  clipboard packets over default UX command panel digests. The clipboard packet
  maps digest items into bounded ready-command and approval-remediation
  clipboard items plus fixed safety summaries and clipboard text, while
  preserving copy text, blockers, section/state/cap filtering, redaction,
  default-live-execution denial, and no registry fetch, install/update
  execution, package-code execution, activation, sidecar start, catalog
  mutation, or credential persistence.
- Adds read-only plugin marketplace lifecycle default UX command panel digest
  clipboard review packets over default UX command panel digest clipboard
  packets. The review maps clipboard items into bounded ready-command and
  approval-remediation review items plus fixed safety summaries and review text,
  while preserving copy text, blockers, review-ready/blocker states,
  section/state/cap filtering, redaction, default-live-execution denial, and no
  registry fetch, install/update execution, package-code execution, activation,
  sidecar start, catalog mutation, or credential persistence.
- Adds read-only plugin marketplace lifecycle default UX command panel digest
  clipboard review closeout packets over default UX command panel digest
  clipboard review packets. The closeout maps review items into bounded
  ready-command and approval-remediation closeout items plus fixed safety
  summaries and closeout text, while preserving copy text, review lines,
  blockers, closeout-ready/blocker states, section/state/cap filtering,
  redaction, default-live-execution denial, and no registry fetch,
  install/update execution, package-code execution, activation, sidecar start,
  catalog mutation, or credential persistence.
- Adds read-only plugin marketplace lifecycle default UX command panel digest
  clipboard review closeout summary packets over default UX command panel
  digest clipboard review closeout packets. The summary maps closeout items into
  bounded ready-command and approval-remediation summary items plus fixed safety
  summaries and summary text, while preserving copy text, closeout lines, review
  lines, blockers, summary-ready/blocker states, section/state/cap filtering,
  redaction, default-live-execution denial, and no registry fetch,
  install/update execution, package-code execution, activation, sidecar start,
  catalog mutation, or credential persistence.

## Bucket 9 - Beta 3 Host-Owned Remote/Channel/Media Depth

Purpose: keep post-alpha host-owned channel, remote, retry, and media depth
separate from Alpha 0, Beta 1 swarm hardening, and Beta 2 MCP/plugin execution
fabric.

Candidate files:
- `src/channel/`
- `src/gateway-channels.ts`
- `src/verify-phase92.ts` through `src/verify-phase126.ts`
- `src/verify-phase119.ts` through `src/verify-phase225.ts`
- `package.json`
- source-of-truth docs updated only for channel/media runtime truth changes

Verification:
- `bun run verify:phase92`
- `bun run verify:phase97`
- `bun run verify:phase112`
- `bun run verify:phase118`
- `bun run verify:phase119`
- `bun run verify:phase126`
- `bun run verify:phase225`
- `bun run verify:cleanup`
- `bun run verify:alpha0`
- `node ./node_modules/typescript/bin/tsc --noEmit`
- `bun run verify:all`
- `bun run build`

Release note:
- Records host-owned Slack/Discord/Telegram-style setup, signed webhook,
  deferred ACK, media metadata, media transfer, manual reinvoke, retry-control,
  execution receipt, closeout, audit, retry-ledger, operator-handoff,
  worker-selection, handler-readiness, foreground worker execution, receipt
  preflight, closeout readiness, supplied closeout-preflight, and closeout
  record-plan boundaries. These remain explicit host-owned surfaces with no
  default live inbound delivery, public hosting, credential persistence,
  background retry worker, automatic vendor retry, or raw host-data persistence.

## Staging Discipline

Use pathspec staging by bucket. Example for Bucket 0:

```powershell
git add docs/PROJECT_STATE.md docs/COLONY_BIBLE.md docs/release/WORKSPACE_INVENTORY.md docs/release/COMMIT_BUCKETS.md docs/release/BUCKET_0_REVIEW.md docs/release/tracked-change-inventory.txt docs/release/tracked-change-stat.txt docs/release/workspace-status.txt docs/release/COMPETITOR_COMPLETION_BOARD.md docs/release/COMPETITOR_GAP_ANALYSIS_2026-05-11.md docs/superpowers/plans/2026-05-10-workplace-cleanup-launch-order.md docs/superpowers/plans/2026-05-11-competitor-gap-closure.md src/verify-workspace-cleanup.ts src/verify-release.ts package.json docs/ROADMAP.md docs/GAP_ANALYSIS.md docs/BENCHMARK_BOARD.md docs/DECISIONS.md
```

Then inspect:

```powershell
git diff --cached --stat
git diff --cached --name-status
```

Do not use `git add .` while the workspace remains this broad.
