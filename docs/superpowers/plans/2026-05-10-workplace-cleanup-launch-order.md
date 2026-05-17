# Workplace Cleanup And Launch Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the current broad, dirty workspace into a reviewable Launch Alpha 0 release train with clear truth about what is built, what remains, and what ships in each release.

**Architecture:** Treat the repository cleanup as its own release-blocking workstream before adding more features. First freeze and inventory the current work, then consolidate claim truth, then cut Alpha 0, then resume product breadth in ordered Alpha 1/Beta/RC slices.

**Tech Stack:** TypeScript, Bun, Ink/React, local filesystem persistence, raw `fetch()` providers, pure TypeScript security-sensitive code, markdown source-of-truth docs.

---

## Current Built Truth

The project is already past a prototype. These surfaces are built and verified through `verify:phase227`, `verify:alpha0`, and `verify:all` as of the last completed run:

- Single-agent terminal runtime: real `AgentLoop`, Ink streaming, provider selection, failover, usage/cost tracking, approvals, compaction, startup doctor, persisted sessions, runtime status, command help truth.
- Provider layer: Ollama/local default plus Anthropic, OpenAI-compatible, and Gemini via raw `fetch()`.
- Memory layer: transcript truth, compact artifacts, structured facts, ownership/resolution recall, MemPalace routing/search foundations, `/memory plan` inspection.
- Workflow layer: DAG validation, persisted workflow runs, checkpoints, approval pause/resume, retries, artifacts, AgentLoop-backed task handlers, workflow templates, automation control API.
- Multi-agent layer: caste-aware workers, coordinator queue, direct worker messages, fan-out/fan-in, cancellation, policy propagation, durable `/swarm` snapshots.
- Launch swarm path: `/swarm llm "<objective>"` executes planner, worker, reviewer AgentLoop stages with status, artifacts, token metadata, resume, and bounded retry.
- Tools/skills/MCP layer: safe local tool breadth, skill catalog/audit/staging/promotion/rollback, MCP in-process/stdio/HTTP/plugin-sidecar foundations, approval-proof and transport hardening.
- Daemon/channel foundations: control-plane host, HTTP transport/client, scoped auth, in-memory channels, channel auth/session bridge, host-owned Slack/Discord/Telegram foundations, no default live delivery claim.
- Local web/GitHub alpha support: read-only web shell plus local scoped mutation handoff; GitHub PR handoff plus approval-gated local branch/worktree action plan.
- Public alpha docs: root `README.md`, `docs/LAUNCH_ALPHA_0.md`, `verify:alpha0`, claim-safety checks.

## End Project Goal

The end product is a local-first, security-first Colony agent operating system: a trustworthy terminal-first agent runtime that can remember work, coordinate planner/worker/reviewer swarms, run safe tools and workflows, expose controlled daemon/web/channel surfaces, and package cleanly for real operators without false hosted/cloud/autonomous claims.

The immediate product goal is narrower: Launch Alpha 0, a public source+Bun release centered on a real model-backed swarm demo, conservative approvals, local onboarding, and honest known limits.

## What Still Remains

- Workspace hygiene: the tree has many modified and untracked files; it needs inventory, ownership labels, and reviewable commit boundaries before more feature work.
- Alpha 0 polish: source+Bun onboarding, first-run smoke path, README command drift, claim-safety gate, release checklist completion, demo dry-run transcript.
- Release doctor: sharper `first-run` diagnostics around Bun, Ollama, model availability, writable data paths, and port/auth expectations.
- Packaging: source+Bun is primary, compiled binary remains optional; release artifacts and checksums are not yet formalized.
- GitHub execution: real issue fetch, local branch/worktree command execution, verification-before-PR, and PR handoff still need implementation beyond host action planning.
- Web control: hosted UX and richer local operator screens remain future; current mutation surface is only local scoped handoff.
- Remote controls/workflow: remote approval UX, failure injection, durable automation hardening, and broader operator controls remain open.
- Memory: only concrete retrieval precision/inspection gaps should preempt Alpha 0 hardening.
- Swarm: visualization and long-running production hardening remain after the real LLM demo.
- Channels: Slack/Discord/Telegram remain host-owned experimental foundations, not launch headline functionality.

---

### Task 1: Freeze And Inventory The Dirty Workspace

**Files:**
- Create: `docs/release/WORKSPACE_INVENTORY.md`
- Read: `git status --short --branch`
- Read: `git diff --name-status`
- Read: `git diff --stat`

- [ ] **Step 1: Create the release docs directory**

Run:

```powershell
New-Item -ItemType Directory -Force -Path docs/release | Out-Null
```

Expected: command exits with code 0.

- [ ] **Step 2: Capture tracked change inventory**

Run:

```powershell
git diff --name-status > docs/release/tracked-change-inventory.txt
git diff --stat > docs/release/tracked-change-stat.txt
```

Expected: both files are created under `docs/release/`.

- [ ] **Step 3: Capture untracked inventory**

Run:

```powershell
git status --short --branch > docs/release/workspace-status.txt
```

Expected: `docs/release/workspace-status.txt` includes `## main` plus modified and untracked paths.

- [ ] **Step 4: Write human inventory summary**

Create `docs/release/WORKSPACE_INVENTORY.md` with this structure:

```markdown
# Workspace Inventory

Last Updated: 2026-05-10

## Summary

- Branch: main
- State: dirty; do not delete or revert unreviewed changes.
- Verification baseline before cleanup: `bun run verify:alpha0`, `bun run verify:all`, and `bun run build` passed in the prior Alpha 0 implementation session.

## Buckets

| Bucket | Paths | Disposition |
| --- | --- | --- |
| Alpha 0 public docs | `README.md`, `docs/LAUNCH_ALPHA_0.md`, `src/verify-alpha0.ts` | Keep and review for launch |
| Alpha 0 swarm | `src/orchestrator/*`, `src/gateway-swarm.ts`, `src/verify-phase226.ts` | Keep and review for launch |
| Alpha 0 guardrails | `src/github-pr-handoff.ts`, `src/web-control.ts`, `src/verify-phase227.ts` | Keep and review for launch |
| Source-of-truth docs | `AGENTS.md`, `docs/ROADMAP.md`, `docs/EXECUTION_PLAN.md`, `docs/GAP_ANALYSIS.md`, `docs/BENCHMARK_BOARD.md`, `docs/PARITY_EXECUTION_BOARD.md` | Keep, then normalize wording |
| Large pre-existing work | all other modified/untracked `src/*` and `docs/*` paths | Preserve until separately reviewed |

## Rules

1. No `git reset --hard`.
2. No deletion of untracked files until each path is assigned to keep, split, archive, or discard with explicit approval.
3. Every release-bound bucket must pass focused verification before commit.
```

- [ ] **Step 5: Verify the inventory files exist**

Run:

```powershell
Test-Path docs/release/WORKSPACE_INVENTORY.md
Test-Path docs/release/workspace-status.txt
Test-Path docs/release/tracked-change-inventory.txt
Test-Path docs/release/tracked-change-stat.txt
```

Expected: four `True` lines.

---

### Task 2: Create One Canonical Project Truth Page

**Files:**
- Create: `docs/PROJECT_STATE.md`
- Read: `README.md`
- Read: `docs/LAUNCH_ALPHA_0.md`
- Read: `docs/GAP_ANALYSIS.md`
- Read: `docs/ROADMAP.md`
- Read: `docs/PARITY_EXECUTION_BOARD.md`

- [ ] **Step 1: Write the project state document**

Create `docs/PROJECT_STATE.md` with these sections:

```markdown
# Project State

Last Updated: 2026-05-10

## Product Goal

The Colony is a local-first, security-first agent operating system for terminal-first work, durable memory, approval-gated tools, workflows, and planner/worker/reviewer swarm execution. It can later expose daemon, web, and channel surfaces, but launch claims stay bound to verified local behavior.

## Current Launch Target

Launch Alpha 0 is a public source+Bun alpha. The proof path is:

1. `bun install`
2. `bun run verify:alpha0`
3. `bun run start`
4. `/doctor first-run`
5. `/swarm llm "prepare a concise local-first alpha launch checklist"`
6. `/swarm status <run_id>`

## Built

- Real AgentLoop terminal runtime.
- Ollama-first provider stack with optional cloud providers.
- Conservative approvals and tool externalization.
- Memory, MemPalace, and recall inspection foundations.
- Workflow DAG/checkpoint/retry/approval foundations.
- Planner/worker/reviewer coordinator and LLM-backed swarm demo.
- MCP, skill, daemon, channel, GitHub handoff, and web-control foundations.

## Not Built For Alpha 0

- Hosted control plane.
- Default live Slack/Discord/Telegram delivery.
- Credential persistence for vendor services.
- Automatic push or PR creation.
- Autonomous remote mutation without explicit approval.

## Release Rule

Any public claim must map to a verifier, a command, or a documented manual smoke step.
```

- [ ] **Step 2: Link it from the source docs**

Modify these files:

- `README.md`: add `docs/PROJECT_STATE.md` to the Verification or Troubleshooting area as the source for built/not-built truth.
- `docs/ROADMAP.md`: add `docs/PROJECT_STATE.md` to the opening reference list.
- `docs/GAP_ANALYSIS.md`: add `docs/PROJECT_STATE.md` beside the benchmark board links.

- [ ] **Step 3: Run a claim-safety search**

Run:

```powershell
rg -n "default live (Slack|Discord|Telegram)|persists? credentials|automatic(?:ally)? creates? (?:remote )?(?:PR|pull request)|default public hosting is shipped" README.md docs/PROJECT_STATE.md docs/LAUNCH_ALPHA_0.md docs/ROADMAP.md docs/GAP_ANALYSIS.md
```

Expected: no matches.

---

### Task 3: Normalize Release Gates And Make Them Shorter To Read

**Files:**
- Modify: `package.json`
- Create: `src/verify-release.ts`
- Create: `src/verify-workspace-cleanup.ts`

- [ ] **Step 1: Add a release verifier wrapper**

Create `src/verify-release.ts`:

```ts
import { spawn } from "child_process";

const commands = [
  ["bun", ["run", "verify:alpha0"]],
  ["bun", ["run", "verify:all"]],
  ["bun", ["run", "build"]],
] as const;

function run(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: "inherit", shell: process.platform === "win32" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
    child.on("error", reject);
  });
}

for (const [command, args] of commands) {
  await run(command, args);
}

console.log("Release gate: GREEN.");
```

- [ ] **Step 2: Add a workspace cleanup verifier**

Create `src/verify-workspace-cleanup.ts`:

```ts
import { readFile } from "fs/promises";

const requiredFiles = [
  "docs/release/WORKSPACE_INVENTORY.md",
  "docs/PROJECT_STATE.md",
  "docs/LAUNCH_ALPHA_0.md",
  "README.md",
];

for (const file of requiredFiles) {
  const content = await readFile(file, "utf8");
  if (content.trim().length === 0) {
    throw new Error(`${file} is empty`);
  }
}

const publicDocs = [
  await readFile("README.md", "utf8"),
  await readFile("docs/PROJECT_STATE.md", "utf8"),
  await readFile("docs/LAUNCH_ALPHA_0.md", "utf8"),
].join("\n");

const forbidden = [
  /default live (Slack|Discord|Telegram)/i,
  /persists? credentials/i,
  /automatic(?:ally)? creates? (?:remote )?(?:PR|pull request)/i,
  /default public hosting is shipped/i,
];

for (const pattern of forbidden) {
  if (pattern.test(publicDocs)) {
    throw new Error(`Forbidden public claim matched ${pattern}`);
  }
}

console.log("Workspace cleanup docs: GREEN.");
```

- [ ] **Step 3: Wire scripts**

Modify `package.json` scripts:

```json
"verify:cleanup": "bun run src/verify-workspace-cleanup.ts",
"release:gate": "bun run src/verify-release.ts"
```

Place both near `verify:alpha0` and `verify:all`.

- [ ] **Step 4: Verify the cleanup gate**

Run:

```powershell
bun run verify:cleanup
```

Expected: `Workspace cleanup docs: GREEN.`

---

### Task 4: Split Work Into Reviewable Commit Buckets

**Files:**
- Create: `docs/release/COMMIT_BUCKETS.md`

- [ ] **Step 1: Write commit bucket plan**

Create `docs/release/COMMIT_BUCKETS.md`:

```markdown
# Commit Buckets

Last Updated: 2026-05-10

## Bucket 1: Launch Alpha 0 Public Surface

Paths:
- `README.md`
- `docs/LAUNCH_ALPHA_0.md`
- `docs/PROJECT_STATE.md`
- `src/verify-alpha0.ts`
- `src/verify-phase226.ts`
- `src/verify-phase227.ts`
- `package.json`

Required checks:
- `bun run verify:alpha0`
- `bun run verify:cleanup`

## Bucket 2: LLM Swarm Runtime

Paths:
- `src/orchestrator/*`
- `src/gateway-swarm.ts`
- `src/gateway-contract.ts`
- `src/gateway-execute.ts`
- `src/ui/app.tsx`
- `src/ui/use-colony-loop.ts`

Required checks:
- `bun run verify:phase226`
- `bun run verify:phase28`
- `bun run tsc --noEmit`

## Bucket 3: Alpha Guardrails

Paths:
- `src/github-pr-handoff.ts`
- `src/web-control.ts`
- `src/daemon/auth.ts`

Required checks:
- `bun run verify:phase227`
- `bun run verify:phase89`
- `bun run verify:phase90`

## Bucket 4: Source-Of-Truth Docs

Paths:
- `AGENTS.md`
- `docs/ROADMAP.md`
- `docs/EXECUTION_PLAN.md`
- `docs/GAP_ANALYSIS.md`
- `docs/BENCHMARK_BOARD.md`
- `docs/PARITY_EXECUTION_BOARD.md`

Required checks:
- `bun run verify:cleanup`
- `bun run verify:alpha0`

## Bucket 5: Pre-Existing Broad Work

Paths:
- every remaining modified or untracked file not listed above

Rule:
- Review separately. Do not mix into Alpha 0 unless it is required by a passing verifier or an explicit launch claim.
```

- [ ] **Step 2: Confirm no release bucket includes reference repos**

Run:

```powershell
rg -n "the-colony/|claude-code-main/|openclaw-main/|mempalace-develop/|skills-main/|superpowers-main/|autoresearch-master/" docs/release/COMMIT_BUCKETS.md
```

Expected: no matches.

---

### Task 5: Alpha 0 Release Candidate Cleanup

**Files:**
- Modify: `docs/LAUNCH_ALPHA_0.md`
- Modify: `README.md`
- Create: `docs/release/ALPHA_0_RELEASE_NOTES.md`

- [ ] **Step 1: Complete the Alpha 0 checklist**

Modify `docs/LAUNCH_ALPHA_0.md` Release Checklist after the checks are actually run:

```markdown
- [x] `bun run verify:alpha0`
- [x] `bun run verify:all`
- [x] `bun run build`
- [x] README commands match `package.json`
- [x] Docs avoid public hosting, credential persistence, default live channel, and autonomous PR claims
- [ ] Demo provider setup has been checked with Ollama or a configured optional provider
```

Only check the provider setup line after a real local Ollama/cloud demo run.

- [ ] **Step 2: Write release notes**

Create `docs/release/ALPHA_0_RELEASE_NOTES.md`:

```markdown
# Launch Alpha 0 Release Notes

## What Ships

- Source+Bun local install and terminal startup.
- Ollama-first provider path with optional cloud fallback.
- Real planner/worker/reviewer LLM swarm demo.
- Durable swarm status, resume, retry, and cancel.
- Conservative approval posture.
- Local GitHub handoff and local branch/worktree action planning.
- Local web-control action handoff guardrails.

## Known Limits

- No hosted product.
- No default live channel delivery.
- No credential persistence for vendor services.
- No automatic push or PR creation.
- No autonomous remote mutation without explicit approval.

## Required Verification

- `bun run verify:alpha0`
- `bun run verify:all`
- `bun run build`
```

- [ ] **Step 3: Run Alpha 0 gate**

Run:

```powershell
bun run verify:alpha0
```

Expected: `Launch Alpha 0 gate: GREEN.`

- [ ] **Step 4: Run full release gate**

Run:

```powershell
bun run verify:all
bun run build
```

Expected: both commands exit with code 0.

---

### Task 6: Manual Demo Smoke Pass

**Files:**
- Create: `docs/release/ALPHA_0_DEMO_SMOKE.md`

- [ ] **Step 1: Write the smoke template**

Create `docs/release/ALPHA_0_DEMO_SMOKE.md`:

````markdown
# Alpha 0 Demo Smoke

Last Run: not run

## Environment

- OS:
- Bun:
- Provider:
- Model:

## Commands

```powershell
bun install
bun run verify:alpha0
bun run start
```

Inside Colony:

```text
/doctor first-run
/provider
/workspace
/swarm llm "prepare a concise local-first alpha launch checklist"
/swarm status
/swarm status <run_id>
```

## Expected Results

- `/doctor first-run` gives actionable provider/workspace status.
- `/provider` shows selected provider/model.
- `/swarm llm` returns a run id.
- `/swarm status <run_id>` shows plan, execute, and review stages.
- No command claims hosted delivery, credential persistence, or automatic PR creation.

## Result

- Status: not run
- Notes:
````

- [ ] **Step 2: Run the smoke manually**

Run the commands in a real terminal because this is an interactive Ink flow.

Expected: document the run id and the status output summary in `docs/release/ALPHA_0_DEMO_SMOKE.md`.

---

## Release Order

### Release 0: Workspace Cleanup Gate

Goal: stop accumulating unreviewed work.

Ship criteria:
- `docs/release/WORKSPACE_INVENTORY.md` exists.
- `docs/PROJECT_STATE.md` exists.
- `docs/release/COMMIT_BUCKETS.md` exists.
- `bun run verify:cleanup` passes.

### Release 1: Launch Alpha 0

Goal: public source+Bun alpha with a real LLM swarm demo.

Ship criteria:
- `bun run verify:alpha0` passes.
- `bun run verify:all` passes.
- `bun run build` passes.
- `docs/release/ALPHA_0_DEMO_SMOKE.md` has a real demo run.
- Public docs match the claim-safety matrix.

### Release 2: Alpha 0.1

Goal: first-run reliability.

Scope:
- Improve `/doctor first-run` for Bun, Ollama, model availability, writable data paths, and local port/auth checks.
- Add focused verifier for first-run diagnostics.
- Do not add hosted surfaces.

### Release 3: Alpha 1

Goal: safe local execution breadth.

Scope:
- Real GitHub issue fetch behind explicit credentials.
- Approval-gated local branch/worktree command execution.
- Verification-before-PR handoff.
- No push or remote PR creation without explicit approval.

### Release 4: Alpha 2

Goal: local operator control surfaces.

Scope:
- Hosted web-control UX remains opt-in.
- Local web-control status and action screens become usable.
- Remote approvals and workflow automation get failure injection and recovery coverage.

### Release 5: Beta 0

Goal: product breadth with stable foundations.

Scope:
- Production plugin package execution controls.
- Richer swarm visualization and long-running swarm hardening.
- Memory precision closure only where measured gaps exist.
- Channel surfaces remain host-owned unless explicit live delivery is separately verified.

### Release 6: RC 0

Goal: release candidate.

Scope:
- Final packaging story.
- Full release gate.
- Performance/token benchmarks.
- Security claim review.
- Operator docs and known-risk envelope.

---

## Cleanup Rules For Every Future Slice

1. Start with `git status --short --branch`.
2. Read `docs/PROJECT_STATE.md`, `docs/LAUNCH_ALPHA_0.md`, `docs/EXECUTION_PLAN.md`, and `docs/PARITY_EXECUTION_BOARD.md`.
3. Pick one release bucket.
4. Add or extend a focused verifier before behavior changes.
5. Run the focused verifier.
6. Run `bun run verify:alpha0` for launch-sensitive work.
7. Run `bun run verify:all` before release claims.
8. Update docs only when runtime truth changes.
9. Do not claim hosted product, live default channels, credential persistence, push/PR automation, or autonomous remote mutation unless a later verifier proves it.
