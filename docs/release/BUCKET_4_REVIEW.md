# Bucket 4 Review - GitHub Local Execution Guardrails

Date: 2026-05-14
Reviewer: Codex cleanup automation

## Scope

Bucket 4 isolates the safe GitHub local-execution foundation for Alpha 0/Alpha
1 review. The current code accepts provided issue data, plans local work,
executes approved local branch/worktree mutations only through an injected git
executor, and prepares verified PR handoff artifacts. It still does not fetch
GitHub, push branches, create pull requests, persist credentials, or execute
remote mutation by default.

Include these paths when staging Bucket 4:

- `src/github-pr-handoff.ts`
- `src/github-local-workspace-executor.ts`
- `src/verify-phase227.ts`
- `src/verify-phase228.ts`
- `src/verify-phase229.ts`
- `src/verify-phase230.ts`
- `docs/release/BUCKET_4_REVIEW.md`
- supporting workflow files only if their diffs are exclusively for the
  `github_pr_handoff` template:
  - `src/workflow/templates.ts`
  - `src/workflow/automation.ts`
  - `src/workflow/index.ts`

Exclude these paths from Bucket 4:

- Bucket 0 cleanup control-plane docs.
- Bucket 1 public alpha docs.
- Bucket 2 swarm runtime.
- Bucket 3 onboarding/provider smoke.
- Bucket 5 local web-control guardrails, except for shared phase 227 evidence.
- Any credentials, external GitHub fetch, `git push`, or `gh pr create`
  execution path.

## Runtime Truth

- `createGitHubIssueIntakePlan` accepts only supplied issue references, URLs, or
  explicit coordinates and performs no GitHub network fetch.
- Incomplete issue coordinates fail closed before local workspace approval.
- Token-bearing issue URLs and copied issue body text are redacted before being
  included in plans or rejection output.
- `summarizeGitHubPrHandoffPlan` derives deterministic branch/worktree names and
  an exact local workspace approval signature.
- `createGitHubLocalWorkspaceActionPlan` requires the exact approval signature
  before emitting a host-executable local action plan.
- Emitted commands are descriptive local host actions only. They are not run by
  Colony by the planning helper.
- `executeApprovedGitHubLocalWorkspaceAction` can execute the approved local
  branch/worktree plan only through an injected `git` executor, with exact
  approval, deterministic worktree path validation, conservative branch
  validation, command redaction, and stop-after-failure ordering.
- Local execution receipts explicitly state that no push, PR creation, remote
  fetch, credential persistence, or non-injected executor path occurred.
- `createGitHubVerificationToPrHandoff` requires accepted issue intake,
  successful local execution, and passing verification evidence before emitting
  a markdown PR handoff artifact and suggested human-run push/PR commands.
- The `github_pr_handoff` workflow keeps the order:
  `issue_intake -> approve_local_workspace -> create_local_workspace ->
  implement -> verify -> approve_pr_creation -> pr_handoff`.
- PR handoff remains blocked behind verification and a second explicit approval,
  and the handoff artifact states that Colony did not push or create a remote
  PR.

## Review Findings

- The current GitHub surface is correctly conservative for Alpha 0.
- Latest automation guardrail refresh: canonical GitHub support still provides
  exact approval-gated local branch/worktree execution through the injected git
  executor path, verified PR handoff artifact generation after local
  verification evidence. It preserves no default push, no default PR creation, and no credential persistence.
- Phase 227 covers missing approval rejection, credential redaction, local-only
  host action planning, and no-push/no-PR boundaries.
- Phase 228 covers deterministic provided issue intake, URL redaction,
  fail-closed incomplete coordinates, exact approval-gated local action planning
  from intake, and verification-before-PR workflow ordering.
- Phase 229 covers approved local GitHub branch/worktree execution through an
  injected git executor, exact approval enforcement, branch tamper rejection,
  worktree path escape rejection, command-failure receipts, redaction, and
  stop-after-failure mutation ordering.
- Phase 230 covers verified local execution to PR handoff artifact generation,
  missing/failed verification rejection, failed execution rejection, redaction,
  workflow artifact attachment, and no push/PR remote mutation by default.
- The next competitor gap is no longer local branch/worktree receipts; it is
  broader remote push/PR creation only if an explicit credentialed approval
  slice is chosen, plus local-loop polish from real operator smoke.

## Verification

Required before staging Bucket 4:

```powershell
bun run verify:phase227
bun run verify:phase228
bun run verify:phase229
bun run verify:phase230
bun run verify:alpha0
```

Recommended before release-candidate tagging:

```powershell
bun run verify:all
```

Evidence captured on 2026-05-13:

- `bun run verify:phase227` passed: 17 passed, 0 failed.
- `bun run verify:phase228` passed: 32 passed, 0 failed.
- `bun run verify:cleanup` passed.
- `bun run verify:alpha0` passed: phase 226, phase 227, and launch alpha gate
  all green.
- `node ./node_modules/typescript/bin/tsc --noEmit` passed.

Evidence refreshed on 2026-05-14:

- `bun run verify:phase227` passed: 17 passed, 0 failed.
- `bun run verify:phase228` passed: 32 passed, 0 failed.
- `bun run verify:phase229` passed: 29 passed, 0 failed.
- `bun run verify:phase230` passed: 25 passed, 0 failed.
- `bun run verify:alpha0` passed: phase 226, phase 227, and launch alpha gate
  all green.
- `bun run verify:cleanup` passed.
- Latest automation refresh also passed
  `node ./node_modules/typescript/bin/tsc --noEmit`.

## Suggested Staging Command

Use an exact pathspec. Do not use `git add .`.

```powershell
git add src/github-pr-handoff.ts src/github-local-workspace-executor.ts src/verify-phase227.ts src/verify-phase228.ts src/verify-phase229.ts src/verify-phase230.ts docs/release/BUCKET_4_REVIEW.md docs/release/WORKSPACE_INVENTORY.md docs/release/COMMIT_BUCKETS.md docs/release/tracked-change-inventory.txt docs/release/tracked-change-stat.txt docs/release/workspace-status.txt
```

Add workflow files only after confirming their diffs are exclusive to the
`github_pr_handoff` template seam.

## Residual Risk

- This bucket intentionally stops before remote push or PR creation. Those must
  remain manual/operator actions unless a later explicit credentialed approval
  slice is chosen.
- The automation pass did not run live GitHub or credentialed tests by design.
- Reviewers must inspect staged diffs carefully because `verify-phase227` also
  covers web-control guardrails that belong mainly to Bucket 5.
