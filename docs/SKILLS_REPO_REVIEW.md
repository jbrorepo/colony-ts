# Skills Repo Review

Source reviewed: <https://github.com/jbrorepo/skills>

Local snapshot: `D:\The Colony Test\skills-main`

Date reviewed: 2026-04-27

## Copy Status

We do have a local copy at `D:\The Colony Test\skills-main`, but it is a snapshot, not a Git checkout. `git -C skills-main remote -v` fails because there is no `.git` directory.

The local snapshot is not current with `jbrorepo/skills`:

- Remote has 21 skill folders.
- Local snapshot has 19 `SKILL.md` files.
- Remote-only folders: `caveman`, `domain-model`, `to-issues`, `to-prd`, `zoom-out`.
- Local-only folders: `prd-to-issues`, `prd-to-plan`, `write-a-prd`.
- Likely rename drift: `write-a-prd` -> `to-prd`, `prd-to-issues` -> `to-issues`.
- Local-only `prd-to-plan` appears absent from the current remote and may still be valuable for our execution-board workflow.

## Current Remote Inventory

| Skill | Purpose | Local Status | Development Use | Colony Product Candidate |
| --- | --- | --- | --- | --- |
| `caveman` | Ultra-compressed communication mode. | Missing locally | Useful for dense agent-to-agent summaries and long-running automation context. | High. Colony already has Caveman concepts; this should inform canonical compression controls. |
| `design-an-interface` | Generate multiple radically different interface designs using parallel sub-agents. | Present locally | Useful before public API, gateway, daemon, memory, workflow, and skill-runtime interfaces. | Medium. Needs adaptation because Colony cannot assume subagents everywhere. |
| `domain-model` | Stress-test plans against the domain model and update language/ADRs. | Missing locally | Very useful before large architecture changes. | High. Colony needs durable domain language for caste, memory, workflow, channels, daemon, and skills. |
| `edit-article` | Improve article drafts for structure and clarity. | Present locally | Low for runtime work, useful for docs and public-facing material. | Low. Could be a general writing skill, not core. |
| `git-guardrails-claude-code` | Install hooks to block destructive git commands in Claude Code. | Present locally | Useful as reference for local safety automation. | Medium. Colony should expose provider/tool guardrails, not Claude-specific hooks. |
| `github-triage` | Label-based GitHub issue triage workflow. | Present locally | Useful if parity work moves into GitHub issues. | Medium. Strong pattern for issue/task workflow; needs GitHub connector abstraction. |
| `grill-me` | Relentlessly interview until design branches are resolved. | Present locally | Useful before risky architecture decisions. | High. Colony should have a planning/interrogation mode for unclear tasks. |
| `improve-codebase-architecture` | Find architecture improvement opportunities using domain language and ADRs. | Present locally | High-value periodic automation for Colony. | High. Maps directly to architecture-review agents. |
| `migrate-to-shoehorn` | Convert TypeScript test fixtures from `as` to `@total-typescript/shoehorn`. | Present locally | Low for this repo unless we adopt that package. | Low. Too dependency/tool specific. |
| `obsidian-vault` | Search/create/manage Obsidian notes with wikilinks. | Present locally | Useful if project knowledge lives in Obsidian. | Medium. Pattern is valuable for external knowledge adapters. |
| `qa` | Conversational QA session that files GitHub issues. | Present locally | Useful for interactive bug intake. | High. Colony should support QA/intake flows over terminal and channels. |
| `request-refactor-plan` | Interview for a tiny-commit refactor plan and file an issue. | Present locally | Useful before broad refactors. | High. Maps directly to safe refactor workflows. |
| `scaffold-exercises` | Create course exercise structures. | Present locally | Low for Colony unless we add training/course material. | Low. Domain-specific. |
| `setup-pre-commit` | Configure Husky/lint-staged/typecheck/test hooks. | Present locally | Useful as reference, but avoid adding dependencies casually. | Medium. Pattern is valuable for project bootstrap diagnostics. |
| `tdd` | Red-green-refactor feature/bug workflow. | Present locally | Already aligned with current automation discipline. | High. Should be a first-class Colony workflow skill. |
| `to-issues` | Break plans/specs/PRDs into independently grabbable GitHub issues. | Missing locally; local older `prd-to-issues` exists. | Useful for turning parity board slices into issues. | High. Should become task-slicing workflow independent of GitHub. |
| `to-prd` | Turn current conversation context into a PRD and submit it as an issue. | Missing locally; local older `write-a-prd` exists. | Useful for formalizing feature ideas. | High. Should become PRD/spec generation workflow independent of GitHub. |
| `triage-issue` | Explore bug root cause and create a TDD fix plan. | Present locally | Useful for bug handling. | High. Maps directly to debugging and planning workflow. |
| `ubiquitous-language` | Extract DDD glossary, ambiguities, and canonical terms. | Present locally | Very useful before memory/domain-model work. | High. Colony should use this to stabilize internal terminology and memory labels. |
| `write-a-skill` | Create new skills with correct structure and progressive disclosure. | Present locally | Essential for skill authoring. | High. Should inform Colony skill authoring and validation. |
| `zoom-out` | Ask the agent for broader context and how code fits together. | Missing locally | Useful during architecture exploration. | High. Lightweight but valuable as a command/mode. |

## Recommended Local Adoption

Highest priority to import/update into local developer skills:

1. `domain-model`: closes a major gap in our current parity workflow by tying implementation plans to project language and ADRs.
2. `zoom-out`: lightweight navigation aid for unfamiliar subsystems.
3. `caveman`: aligns with existing Caveman compression goals and long-context automation.
4. `to-prd` and `to-issues`: update local renamed/older copies so planning vocabulary matches the upstream repo.
5. Keep local `prd-to-plan`: upstream no longer lists it, but Colony's execution-board flow benefits from PRD-to-plan conversion.

## Recommended Colony Product Adoption

Best candidates to add directly to The Colony as first-class skills/workflows:

1. Planning: `grill-me`, `to-prd`, `to-issues`, `request-refactor-plan`, `domain-model`, `zoom-out`.
2. Development discipline: `tdd`, `triage-issue`, `improve-codebase-architecture`.
3. Knowledge and memory: `ubiquitous-language`, `obsidian-vault`, `caveman`.
4. Operator safety: `git-guardrails-claude-code`, `setup-pre-commit`, adapted away from Claude/Husky-specific assumptions.
5. Skill authoring: `write-a-skill`.

## Productization Notes

Do not copy these blindly into runtime behavior. The Colony needs typed, inspectable skill metadata and fail-closed execution:

- Store imported skills as catalog entries with source repo, source path, version/hash if available, trust level, and approval requirements.
- Keep human-facing skill text separate from runtime policy.
- Add validators for `SKILL.md` frontmatter, required sections, referenced files, and disallowed side effects.
- Support aliases so upstream rename drift does not break users: `write-a-prd` -> `to-prd`, `prd-to-issues` -> `to-issues`.
- Treat GitHub-dependent skills as workflow templates that can target GitHub only when a connector is configured.
- Convert Claude-specific instructions into Colony-native tool policy and command surfaces.

## Suggested Next Slice

Status: shipped in `verify:phase53`.

The first `SkillCatalogAudit` runtime slice now can:

1. Load a local skill directory.
2. Parse `SKILL.md` frontmatter.
3. Report missing/invalid metadata.
4. Detect aliases/renames.
5. Classify each skill as `developer-only`, `product-candidate`, or `unsupported`.
6. Expose the review through `/skills` or a focused verification script.

Follow-on slice shipped in `verify:phase54`: skills can now carry source repo/path/ref/revision metadata, and `/skills audit` can compare loaded source metadata against expected source metadata to report missing provenance, stale revisions, source mismatches, and revision deltas without exposing skill body text.

Follow-on slice shipped in `verify:phase55`: `/skills plan` now proposes dry-run import/update/keep/review actions from reviewed source metadata, keeps skill body text out of planner output, and states the explicit approval boundary before any file write.

Follow-on slice shipped in `verify:phase56`: approved skill import candidates can now be written into a quarantine/staging root through `stageSkillImportCandidate()`, while unapproved candidates fail closed, live catalog roots remain untouched, and body-free manifests preserve review metadata for staged audit gates.

Follow-on slice shipped in `verify:phase57`: `promoteStagedSkillCandidate()` now promotes audited quarantine candidates into the live catalog only after a second explicit approval, rejects source/audit drift before writing, preserves the previous live skill as rollback evidence, and emits body-free promotion metadata.

Follow-on slice shipped in `verify:phase58`: `/skills staged` now exposes preview, audit, second-approval guidance, promotion-status, and rollback-evidence views for staged skills without exposing skill body text.

Follow-on slice shipped in `verify:phase59`: `rollbackPromotedSkillCandidate()` now restores preserved previous live copies only after explicit approval, rejects missing rollback evidence without touching live files, and records body-free rollback metadata.

Follow-on slice shipped in `verify:phase60`: `/skills staged rollback <name> --approved` now renders approved rollback executor results supplied by the host, fails closed when no result is supplied, and preserves the existing non-mutating rollback evidence view.

Follow-on slice shipped in `verify:phase61`: staged skill stage/promote/rollback manifests and host-supplied executor results now project into body-safe lifecycle events, and `/skills staged history <name>` exposes staged lifecycle status without loading skill bodies or free-form approval reasons.

Next follow-on slice: broaden tool inventory and external MCP/plugin transport hardening, or stage additional high-value product skills when source and approval decisions are ready.
