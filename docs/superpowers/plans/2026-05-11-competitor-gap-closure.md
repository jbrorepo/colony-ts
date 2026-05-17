# Competitor Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the highest-value gaps between Colony, Claude Code, and OpenClaw while preserving Colony's local-first, security-first launch boundaries.

**Architecture:** Finish the source+Bun Alpha 0 proof, then deepen the local developer loop, local web-control UX, memory/MemPalace reliability, swarm production behavior, plugin/MCP execution controls, and finally remote/channel/media breadth. Mutating execution must remain explicit-approval-bound, injected where practical, and verified with deterministic fake hosts.

**Tech Stack:** TypeScript, Bun, React/Ink, raw `fetch()` providers, local filesystem stores, pure TypeScript security helpers, no vendor SDKs for providers.

---

## Current Baseline

- `verify:all` includes `verify:phase239` plus `tsc --noEmit`.
- `verify:alpha0` exists for Launch Alpha 0.
- `/swarm` supports coordinator-only and LLM-backed planner/worker/reviewer execution, status, resume, retry, cancel, artifacts, token metadata, and durable snapshots.
- GitHub support includes deterministic provided issue-reference/URL intake, local-first PR handoff, and approval-gated local branch/worktree action planning.
- Web control includes local scoped mutation handoff, but not a full operator UX.
- External channels remain host-owned, non-default-live foundations.
- The working tree is already dirty; do not revert existing changes and do not commit unless an operator explicitly asks.

## Task 1: Finalize Launch Alpha 0 Release Evidence

**Files:**

- `docs/release/ALPHA_0_TERMINAL_UI_SMOKE.md`
- `docs/release/ALPHA_0_RELEASE_READINESS.md`
- `docs/release/ALPHA_0_PROVIDER_SMOKE.md`
- `docs/release/COMPETITOR_COMPLETION_BOARD.md`

**Steps:**

- [ ] From a real interactive terminal, run:
  ```powershell
  cd "D:\The Colony Test\colony-ts"
  bun run start
  ```
- [ ] In the Colony terminal UI, run:
  ```text
  /doctor first-run
  /swarm llm "prepare a concise local-first alpha launch checklist"
  /swarm status <run_id>
  ```
- [ ] Record provider, model, run id, stage summaries, status output, and any operator warnings in `docs/release/ALPHA_0_TERMINAL_UI_SMOKE.md`.
- [ ] Update `docs/release/ALPHA_0_RELEASE_READINESS.md` so Alpha 0 is blocked only by true remaining issues.
- [ ] Confirm the support owner and incident owner entries are present and accurate.
- [ ] Run:
  ```powershell
  bun run verify:alpha0
  bun run release:gate
  ```

**Expected result:** Launch Alpha 0 has automated and manual evidence without claiming hosted control, default external channels, credential persistence, push, or PR creation.

## Task 2: Implement Alpha 1 Approved GitHub Branch/Worktree Execution

**Files:**

- `src/github-pr-handoff.ts`
- `src/github-local-workspace-executor.ts`
- `src/verify-phase229.ts`
- `package.json`
- `docs/GAP_ANALYSIS.md`
- `docs/EXECUTION_PLAN.md`
- `docs/release/COMPETITOR_COMPLETION_BOARD.md`

**Behavior:**

Add an injected executor that converts an existing approved local workspace action plan into a deterministic local branch/worktree execution receipt.

**Required exported API:**

```ts
export type GitHubLocalWorkspaceCommandExecutor = (command: {
  executable: "git";
  args: string[];
  cwd: string;
}) => Promise<{ code: number; stdout: string; stderr: string }>;

export async function executeApprovedGitHubLocalWorkspaceAction(input: {
  plan: GitHubLocalWorkspaceActionPlan;
  approvalSignature: string;
  workspaceRoot: string;
  worktreeRoot: string;
  executor: GitHubLocalWorkspaceCommandExecutor;
}): Promise<GitHubLocalWorkspaceExecutionReceipt>;
```

**Implementation rules:**

- [ ] Accept only plans created by `createGitHubLocalWorkspaceActionPlan`.
- [ ] Require exact approval signature match from the plan.
- [ ] Reject missing approval, tampered branch names, unsafe paths, absolute worktree escape, `..` traversal, shell metacharacters, and unsupported actions.
- [ ] Resolve all mutation targets under a bounded local worktree root, such as `.colony/worktrees`.
- [ ] Use the injected executor only; do not add direct shell execution to runtime paths.
- [ ] Execute mutating commands sequentially.
- [ ] Return a redacted execution receipt with branch, worktree path, command statuses, verification next step, and no credential values.
- [ ] Do not push, fetch private issue data, create PRs, or persist credentials.

**Verification:**

- [ ] Add `src/verify-phase229.ts` with fake executor coverage for:
  - successful branch/worktree receipt
  - missing approval rejection
  - tampered branch rejection
  - path escape rejection
  - command failure receipt with no second mutation after failure
- [ ] Add `verify:phase229` to `package.json`.
- [ ] Append `bun run verify:phase229` to `verify:all`.
- [ ] Run:
  ```powershell
  bun run verify:phase229
  bun run verify:cleanup
  ```

**Expected result:** Colony can perform the first real local Git mutation in the GitHub loop, but only with explicit approval and injected execution.

## Task 3: Implement Verification-To-PR Handoff

**Files:**

- `src/github-pr-handoff.ts`
- `src/workflow/automation.ts`
- `src/verify-phase230.ts`
- `package.json`
- `docs/ROADMAP.md`
- `docs/EXECUTION_PLAN.md`

**Behavior:**

After approved local branch/worktree execution, produce a PR handoff artifact that requires local verification evidence and still does not push or create a PR by default.

**Steps:**

- [ ] Add a `createGitHubVerificationToPrHandoff` helper that accepts:
  - issue intake summary
  - branch/worktree execution receipt
  - verification command list
  - verification result summaries
  - target base branch
- [ ] Reject PR handoff when verification evidence is missing or failed.
- [ ] Emit a redacted handoff with suggested human-run commands and PR body text.
- [ ] Keep push and PR creation as human/operator actions, not default runtime mutation.
- [ ] Add workflow template integration for the handoff artifact.

**Verification:**

- [ ] Add `src/verify-phase230.ts` covering:
  - handoff after passing verification
  - rejection on missing verification
  - rejection on failed verification
  - no credential or token echo
  - no direct push or PR creation command execution
- [ ] Add `verify:phase230` and append it to `verify:all`.
- [ ] Run:
  ```powershell
  bun run verify:phase229
  bun run verify:phase230
  ```

**Expected result:** Alpha 1 has an end-to-end local GitHub loop: intake, approved local branch/worktree, verification receipt, and PR handoff without autonomous remote mutation.

## Task 4: Build Alpha 2 Local Web-Control Operator UX

**Files:**

- `src/web-control.ts`
- `src/daemon/http-transport.ts`
- `src/verify-phase231.ts`
- `package.json`
- `docs/LAUNCH_ALPHA_0.md`
- `docs/GAP_ANALYSIS.md`

**Behavior:**

Turn the local scoped web-control foundation into a usable local operator page without making it a hosted product.

**Steps:**

- [ ] Render a local HTML operator surface for status, daemon health, workflows, swarm runs, provider state, and approved local action handoffs.
- [ ] Bind to localhost by default.
- [ ] Require scoped auth for every mutating handoff.
- [ ] Reject missing scopes with a deterministic error body.
- [ ] Reject non-local hosts and public listener attempts by default.
- [ ] Keep action execution outside the web-control surface unless an explicit approved local handoff is supplied.

**Verification:**

- [ ] Add `src/verify-phase231.ts` covering local bind, scoped auth, missing-scope rejection, public-host rejection, read-only status rendering, and no direct mutation by default.
- [ ] Add `verify:phase231` and append it to `verify:all`.
- [ ] Run:
  ```powershell
  bun run verify:phase231
  bun run verify:cleanup
  ```

**Expected result:** Colony has a local-only authenticated control UX that closes the first OpenClaw control-plane gap without claiming hosted delivery.

## Task 5: Close Alpha 3 Memory And MemPalace Real-Session Gaps

**Files:**

- `src/memory/service.ts`
- `src/memory/query-intent.ts`
- `src/memory/structured-ranking.ts`
- `src/mempalace/layers.ts`
- `src/mempalace/store.ts`
- `src/verify-phase232.ts`
- `package.json`
- `docs/GAP_ANALYSIS.md`

**Behavior:**

Add a real-session recall fixture matrix that proves exact transcript truth,
derived facts, ownership, decisions, file/path references, issue references,
procedures, and MemPalace routing are surfaced correctly.

**Steps:**

- [x] Build fixture conversations with canonical transcript entries and derived memory artifacts.
- [x] Verify exact mode returns transcript-backed truth without summary substitution.
- [x] Verify derived mode explains fact provenance.
- [x] Verify ownership and responsibility queries rank owner facts above generic mentions.
- [x] Verify `path`, `issue`, `decision`, and `procedure` intent tags route through MemPalace hints.
- [ ] Update `/memory plan` only if the fixture exposes a concrete inspection gap.

**Verification:**

- [x] Add `src/verify-phase232.ts`.
- [x] Add `verify:phase232` and append it to `verify:all`.
- [ ] Run:
  ```powershell
  bun run verify:phase232
  ```

**Expected result:** Memory polish becomes evidence-driven instead of speculative, and Colony's truth-separation advantage is visible to operators.

## Task 6: Harden Beta 1 Swarm Visualization And Failure Behavior

**Files:**

- `src/orchestrator/colony-swarm-runtime.ts`
- `src/gateway-swarm.ts`
- `src/ui/components.tsx`
- `src/verify-phase233.ts`
- `package.json`
- `docs/EXECUTION_PLAN.md`

**Behavior:**

Make planner/worker/reviewer swarm runs easier to inspect and safer to resume
after failure.

**Steps:**

- [x] Add stage timeline rendering with state, attempt count, started/ended times, approval waits, token/cost metadata, artifact count, and latest failure.
- [x] Add redacted artifact review rendering for stage artifacts.
- [x] Preserve retry history when a stage is retried.
- [x] Add deterministic failure injection hooks for fake-provider tests.
- [x] Ensure cancellation preservation across resume.
- [x] Ensure retry remains bounded and does not rerun destructive actions without approval.

**Verification:**

- [x] Add `src/verify-phase233.ts` covering visualization data, failure injection, retry history, cancellation preservation, interrupted-stage resume history, persisted approval-wait preservation, and restart-safe resume.
- [x] Add `verify:phase233` and append it to `verify:all`.
- [x] Run:
  ```powershell
  bun run verify:phase233
  bun run verify:alpha0
  ```

**Expected result:** The real swarm demo starts becoming a durable competitor feature rather than a narrow launch proof.

## Task 7: Build Beta 2 MCP/Plugin Production Fabric

**Files:**

- `src/mcp/`
- `src/skills/`
- `src/runtime/tools-registry.ts`
- `src/verify-phase234.ts`
- `src/verify-phase235.ts`
- `src/verify-phase236.ts`
- `src/verify-phase237.ts`
- `src/verify-phase238.ts`
- `src/verify-phase239.ts`
- `package.json`
- `docs/BENCHMARK_BOARD.md`

**Behavior:**

Move from catalog/staging truth toward safe package installation and sidecar
activation.

**Steps:**

- [x] Add supplied registry metadata checksum/signature fields where available.
- [x] Add an explicit host/network boundary for future live registry metadata fetch.
- [x] Add live registry metadata fetch execution receipt only after the boundary has explicit approval, fake-host coverage, and no credential persistence.
- [x] Add approval-gated package install/update staging.
- [x] Add package-code execution policy checks.
- [x] Add package-driven sidecar startup only after explicit approval, matching completed install/update receipt, and injected supervisor start.
- [x] Persist redacted audit records for install/update attempts.
- [x] Keep live plugin activation disabled by default unless a verifier proves the approved path.

**Verification:**

- [x] Add `src/verify-phase234.ts` covering approval required, lifecycle-script blocking, path confinement, sidecar disabled-by-default behavior, stop-after-failure ordering, and redacted execution receipts.
- [x] Add `src/verify-phase235.ts` covering supplied registry metadata checksum/integrity/signature enrichment, mismatch rejection before trusted sidecar signatures, raw signature redaction, unsafe registry metadata rejection, and no live registry fetch.
- [x] Add `src/verify-phase236.ts` covering approval-gated package sidecar activation, matching completed install/update receipt checks, signature tamper rejection, unknown-sidecar rejection, failed-supervisor receipts, redaction, and no live registry fetch/default activation/package lifecycle execution/credential persistence.
- [x] Add `src/verify-phase237.ts` covering the approval-gated registry fetch host/network boundary, unsafe URL rejection, signature tamper blocking, redaction, and no network execution/package execution/activation/credential persistence.
- [x] Add `src/verify-phase238.ts` covering exact approval, injected host executor use, response status/content-type/size/JSON/package identity validation, redaction, and no built-in Colony registry client/package execution/activation/catalog mutation/credential persistence.
- [x] Add `src/verify-phase239.ts` covering exact-approval package-code execution policy preflights, completed install/update receipt matching, lifecycle/shell/path/signature/receipt rejection, redaction, and no executor/network/package execution/activation/catalog mutation/credential persistence.
- [x] Add `verify:phase234`, `verify:phase235`, `verify:phase236`, `verify:phase237`, `verify:phase238`, and `verify:phase239` and append them to `verify:all`.
- [x] Run:
  ```powershell
  bun run verify:phase234
  bun run verify:phase235
  bun run verify:phase236
  bun run verify:phase237
  bun run verify:phase238
  bun run verify:phase239
  ```

**Expected result:** Colony starts closing Claude Code plugin/MCP polish and OpenClaw extension-fabric gaps with safer defaults.

## Task 8: Grow Beta 3 Remote, Channel, And Media Depth

**Files:**

- `src/channel/`
- `src/daemon/`
- `src/gateway-channels.ts`
- `src/gateway-daemon.ts`
- `src/verify-phase235.ts`
- `package.json`
- `docs/LAUNCH_ALPHA_0.md`
- `docs/GAP_ANALYSIS.md`

**Behavior:**

Add host-owned live-delivery depth only after local product surfaces are stable.

**Steps:**

- [ ] Add explicit opt-in setup records for host-owned channel adapters.
- [ ] Add durable binding inspection for configured channel routes.
- [ ] Add retry worker invocation only when explicitly configured by the host.
- [ ] Add media transfer receipt inspection without private URL or credential persistence.
- [ ] Keep public hosting and default live delivery disabled unless a later release explicitly changes scope.

**Verification:**

- [ ] Add `src/verify-phase235.ts` covering opt-in setup, missing setup rejection, durable binding inspection, explicit retry worker invocation, redaction, and no default live delivery.
- [ ] Add `verify:phase235` and append it to `verify:all`.
- [ ] Run:
  ```powershell
  bun run verify:phase235
  ```

**Expected result:** Colony can start competing with OpenClaw channel depth while preserving the Alpha 0 safety boundary.

## Task 9: Build Release Candidate Packaging And QA Gates

**Files:**

- `README.md`
- `docs/LAUNCH_ALPHA_0.md`
- `docs/release/ALPHA_0_RELEASE_READINESS.md`
- `docs/release/COMPETITOR_COMPLETION_BOARD.md`
- `src/verify-release.ts`
- `src/verify-phase236.ts`
- `package.json`

**Behavior:**

Make a clean checkout repeatable for a new operator and prepare optional binary
distribution without changing source+Bun as the primary path.

**Steps:**

- [ ] Add clean-checkout rehearsal instructions and recorded evidence.
- [ ] Add optional binary build/checksum guidance.
- [ ] Add startup and first-run performance budget checks.
- [ ] Add dependency review notes for production dependencies.
- [ ] Add claim-safety search targets for README, launch docs, release notes, and benchmark docs.
- [ ] Keep source+Bun as the primary supported Alpha path.

**Verification:**

- [ ] Add `src/verify-phase236.ts` covering clean-checkout docs, command drift, claim-safety terms, support docs, and optional packaging guidance.
- [ ] Add `verify:phase236` and append it to `verify:all`.
- [ ] Run:
  ```powershell
  bun run verify:phase236
  bun run verify:alpha0
  bun run verify:all
  bun run build
  ```

**Expected result:** Colony has the release discipline needed to turn the alpha into a credible public competitor.

## Release Order

1. Launch Alpha 0: evidence, source+Bun onboarding, real swarm demo, safety boundaries.
2. Alpha 1: approved local GitHub branch/worktree execution and PR handoff.
3. Alpha 2: local authenticated web-control UX.
4. Alpha 3: memory and MemPalace real-session reliability.
5. Beta 1: swarm visualization, resume, retry, and failure hardening.
6. Beta 2: MCP/plugin execution fabric and workflow/task automation hardening.
7. Beta 3: host-owned remote/channel/media depth.
8. Release Candidate: packaging, QA, support, and claim-safety gates.

## Final Verification Before Any Public Tag

Run:

```powershell
bun run verify:alpha0
bun run verify:all
bun run build
bun run release:gate
```

Then run a claim-safety search over:

```powershell
rg -n "hosted product|default live|automatic PR|creates PR|stores credentials|public listener|autonomous remote mutation" README.md docs
```

Every hit must either be a stated non-goal/guardrail or be backed by a verifier and release evidence.
