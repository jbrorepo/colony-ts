# GStack-Inspired Colony Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the GStack comparison into Colony-native capability work without weakening Colony's local-first, approval-first runtime model.

**Architecture:** Build this as staged, inspectable Colony-native slices. The first slice creates a truthful operator-facing capability registry; later slices attach real implementations for browser sidecars, generated skill docs, reusable workflows, trace-to-skill codification, and external host adapters.

**Tech Stack:** TypeScript, Bun, existing slash-command gateway, existing verification phase scripts, existing skill/workflow/MCP/plugin foundations.

---

## File Structure

- Create `src/gstack-inspired-capabilities.ts`: pure read-only registry of comparison-derived capability tracks.
- Create `src/gateway-capabilities.ts`: `/capabilities` command renderer for list/inspect/next views.
- Modify `src/gateway.ts`: register the command and delegate to `gateway-capabilities`.
- Modify `src/gateway-parse.ts`: parse `/capabilities` and `/capability`.
- Modify `src/gateway-basic.ts`: include `/capabilities` in help.
- Create `src/verify-phase283.ts`: verification for the registry and command surface.
- Modify `package.json`: add `verify:phase283` and include it in `verify:all`.
- Later slices add concrete implementation modules under `src/browser/`, `src/workflow/recipes/`, `src/skills/generated-docs.ts`, `src/skills/trace-codification.ts`, and `src/hosts/`.

## Task 1: Operator Capability Registry

**Files:**
- Create: `src/gstack-inspired-capabilities.ts`
- Create: `src/gateway-capabilities.ts`
- Modify: `src/gateway.ts`
- Modify: `src/gateway-parse.ts`
- Modify: `src/gateway-basic.ts`
- Test: `src/verify-phase283.ts`

- [x] **Step 1: Write the failing verification**

Add a phase verifier that imports a future registry, asserts the five comparison-derived tracks exist, checks `/capabilities`, `/capabilities next`, and `/capabilities inspect browser-sidecar`, and verifies the parser/help wiring.

- [x] **Step 2: Run test to verify it fails**

Run: `bun run src/verify-phase283.ts`

Expected: FAIL because `gstack-inspired-capabilities` and `gateway-capabilities` do not exist.

- [x] **Step 3: Implement the registry and command**

Add the pure registry and renderer. Keep it read-only. Do not claim any capability is shipped beyond the current first slice. Status values must distinguish `planned`, `foundation`, `in_progress`, and `shipped`.

- [x] **Step 4: Wire the gateway**

Register `/capabilities`, add parser aliases, and add help text. The command must not create actions or mutate state.

- [x] **Step 5: Run focused verification**

Run: `bun run src/verify-phase283.ts`

Expected: PASS.

- [x] **Step 6: Wire release gate**

Add `verify:phase283` to `package.json` and append it before `tsc --noEmit` in `verify:all`.

## Task 2: Browser Sidecar Planning Boundary

**Files:**
- Create: `src/browser/browser-sidecar-contracts.ts`
- Create: `src/gateway-browser.ts`
- Modify: `src/gateway.ts`
- Modify: `src/gateway-parse.ts`
- Test: `src/verify-phase284.ts`

- [x] **Step 1: Write failing tests for a descriptor-only browser sidecar plan**

Assert Colony can render a local-only browser sidecar handoff descriptor with no listener start, no Chromium spawn, no credential persistence, and no external tunnel.

- [x] **Step 2: Implement descriptor-only contracts**

Add types for sidecar status, command scopes, token scope names, and safety invariants. This is a planning surface only.

- [x] **Step 3: Add `/browser` read-only operator view**

Render planned local daemon, scoped token, ref/screenshot/log surfaces, and blocker states.

## Task 3: Generated Skill Documentation Foundation

**Files:**
- Create: `src/skills/generated-docs.ts`
- Modify: `src/gateway-skills.ts`
- Test: `src/verify-phase285.ts`

- [ ] **Step 1: Write tests for generated command-reference sections**

Assert generated docs include skill names, descriptions, tool requirements, approval requirements, and stable source metadata without reading helper scripts.

- [ ] **Step 2: Implement generator helpers**

Generate bounded Markdown sections from `SkillCatalog` and existing tool definitions. Keep generation pure and deterministic.

- [ ] **Step 3: Expose `/skills docs-preview`**

Add a read-only preview command. Do not write files until a later approved lifecycle phase.

## Task 4: Workflow Recipe Packaging

**Files:**
- Create: `src/workflow/recipes/gstack-inspired.ts`
- Modify: `src/gateway-workflow.ts`
- Test: `src/verify-phase286.ts`

- [ ] **Step 1: Write tests for named workflow recipes**

Assert `review`, `qa`, `ship`, `investigate`, and `document-release` appear as recipe descriptors with approval checkpoints and verification expectations.

- [ ] **Step 2: Implement descriptors over existing workflow primitives**

Do not execute live GitHub, browser, or deploy actions by default. Every risky step must be a checkpoint or host handoff.

## Task 5: Tool Trace To Skill Codification Plan

**Files:**
- Create: `src/skills/trace-codification.ts`
- Test: `src/verify-phase287.ts`

- [ ] **Step 1: Write tests for extracting a bounded final-attempt trace**

Assert failed earlier attempts are excluded, mutating calls require stronger approval classification, and exact transcript text is referenced but not replaced.

- [ ] **Step 2: Implement a pure proposal builder**

Return a proposal artifact only. No skill files are written until explicit promotion approval.

## Task 6: External Host Adapter Registry

**Files:**
- Create: `src/hosts/index.ts`
- Create: `src/hosts/types.ts`
- Test: `src/verify-phase288.ts`

- [ ] **Step 1: Write tests for host descriptor validation**

Assert Codex, Claude Code, OpenClaw, Cursor, and generic local shell targets can be represented without installing anything.

- [ ] **Step 2: Implement read-only descriptors**

Mirror GStack's declarative host adapter lesson while keeping Colony in control of approvals and package/plugin trust.

## Self-Review

- Spec coverage: The five comparison recommendations map to Tasks 2-6, with Task 1 creating the operator tracking surface.
- Placeholder scan: No task uses TBD/TODO/fill-in wording. Later tasks specify exact target files and verification phase numbers.
- Type consistency: Capability IDs introduced in Task 1 are stable kebab-case identifiers and will be reused by later gateway views.
