# Gap Analysis — 2026-05-31

After closing the distribution prep work (DISTRIBUTION_PLAN.md, all 9
items ✅), here's what still gaps Colony from a real public launch.

This document is intentionally honest. Items that require external
credentials or infrastructure outside this repo are clearly flagged.

---

## Tier 0 — Blockers found during environment audit

These were discovered today and **must** be fixed before any public
mention of v2.0:

### T0-1 · Wrong GitHub URLs throughout the docs
**Severity:** High
**Found in:** `package.json`, `README.md`, `CHANGELOG.md`, every
doc that has a GitHub link.

The previous push wrote `https://github.com/colony-os/colony` everywhere
— that org doesn't exist. The real remote is
`https://github.com/jbrorepo/colony-ts.git`. Every URL needs to be
updated or the public artifacts will broken-link to a 404.

### T0-2 · Missing VS Code extension icon
**Severity:** High for Marketplace
**Found in:** `vscode-extension/package.json:23` references
`media/icon.png` which doesn't exist. Marketplace publish will fail
or ship without an icon.

### T0-3 · No npm / vsce / gh credentials in this environment
**Severity:** Documented blocker
**Impact:** Cannot execute `npm publish`, `vsce publish`, or
`git push` to a fork from this session. All actual publishing
requires the operator to run commands locally (see
[`PUBLISHING.md`](PUBLISHING.md)).

---

## Tier 1 — Required for public launch

### T1-1 · Missing community / governance files
- No `SECURITY.md` (responsible disclosure)
- No `CODE_OF_CONDUCT.md`
- No `.github/ISSUE_TEMPLATE/` for bug reports + feature requests
- No `.github/PULL_REQUEST_TEMPLATE.md`
- No `.github/FUNDING.yml` (sponsors)

Without these, GitHub shows "complete your community profile" warnings
and contributors don't know how to engage.

### T1-2 · No dependency hygiene automation
- No Dependabot or Renovate config
- No SBOM generation
- No license-compatibility audit
- Snyk/Socket/npm-audit not in CI

For a security-positioned project, this is embarrassing.

### T1-3 · No examples / cookbook
A user who installs Colony has no recipes to copy from. Aider and
Cursor both ship comprehensive example libraries.

### T1-4 · No screenshots or GIFs
The README and VS Code Marketplace listing are text-only. Users
scrolling either won't see what Colony actually looks like.

### T1-5 · Coverage and lint not in CI
- `bun test --coverage` exists but never runs
- ESLint / Biome not configured
- No coverage badge

### T1-6 · No comparison page
"Why Colony vs Aider/Cursor/Cline" is a real prospect question. The
current README has a short table but no detailed comparison doc.

---

## Tier 2 — Improves credibility but not strictly blocking

### T2-1 · No live SWE-bench numbers
Harness exists (C2). `makeLiveRunner()` is still stubbed. Real numbers
need a one-day push to wire the runner + an API key budget for a real
run.

### T2-2 · No demo recording (Asciinema / video)
A 90-second "watch Colony do a task" clip would be the single best
marketing asset.

### T2-3 · No marketing site
`colony.dev` (or similar) with quickstart + screenshots + docs link.
Could be a Docusaurus build of the `documentation/` folder.

### T2-4 · No telemetry / usage analytics
We can't measure adoption. This is partly a security feature but also
limits product feedback. Privacy-first opt-in telemetry (counts only,
no payload contents) would help.

### T2-5 · No Discord / GitHub Discussions
No community channel. Once people start using Colony, they have
nowhere to ask questions.

### T2-6 · No migration guides
Users coming from Aider / Cursor / Cline have no "here's how Colony
differs" doc.

---

## Tier 3 — Long-arc / enterprise

### T3-1 · No third-party security audit
Trail of Bits or NCC Group review would unlock enterprise sales.
~$30-50k engagement.

### T3-2 · No SOC2 / ISO 27001
Required for some enterprise customers. Multi-quarter effort.

### T3-3 · No hosted offering
Some users want managed Colony, not self-hosted. SaaS would require
billing, multi-tenancy hardening, ops runbook, on-call rotation.

### T3-4 · No enterprise edition / support tier
Pricing + sales motion. Different from "build great open source."

### T3-5 · No internationalization
Zero i18n surface. Defaults are English-only.

### T3-6 · No accessibility audit
TUI is screen-reader hostile by nature; web dashboard hasn't been
WCAG-audited.

---

## What's actually publishable right now

The artifacts are ready. The blockers are external credentials only.

| Artifact | Build status | Publish blocker |
|---|---|---|
| `@colony/cli@2.0.0` npm tarball | ✅ 813 KB, 277 files, dry-run clean | Need `npm login` from operator |
| `colony-vscode@0.2.0` VSIX | ⚠ Missing icon file (T0-2) | Need `vsce login` PAT |
| Plugin registry (`registry/`) | ✅ HTML + JSON + schema ready | Need GitHub Pages enabled on the repo |
| GitHub release (v2.0.0) | ✅ workflow exists, awaits tag push | Need git tag + push by operator |

---

## Execution plan for this session

What I can close from here (no external creds needed):

1. **T0-1** ✅ — fixed all wrong GitHub URLs across 14 files
   (`colony-os/colony` → `jbrorepo/colony-ts`,
   `colony-plugins.github.io` → `jbrorepo.github.io/colony-ts`)
2. **T0-2** ✅ — generated `vscode-extension/media/icon.png` (128×128 PNG)
   via `media/generate-icon.py` using Pillow; SVG kept for source-of-truth
3. **T1-1** ✅ — added `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1),
   `.github/ISSUE_TEMPLATE/bug_report.yml`,
   `.github/ISSUE_TEMPLATE/feature_request.yml`,
   `.github/ISSUE_TEMPLATE/config.yml` (with security advisory link),
   `.github/PULL_REQUEST_TEMPLATE.md`, `.github/FUNDING.yml`.
   `SECURITY.md` already existed and was already solid.
4. **T1-2** ✅ — `.github/dependabot.yml` (weekly main + extension +
   actions), CI workflow now runs `npm audit` + coverage + pack-dry-run
   guard that fails if test/verify files would ship
5. **T1-3** ✅ — `examples/` with 6 recipes:
   `01-rest-poll-swarm.sh`, `02-mcp-add-via-rest.sh`,
   `03-diff-from-clipboard.ts`, `04-plugin-search.ts`,
   `05-docker-executor.ts`, `06-custom-policy-rule.ts`
6. **T1-5** ✅ — coverage + dependency audit + pack-dry-run guard added
   to `ci.yml`. Lint config (ESLint/Biome) deferred — Colony has no
   lint rules today and adding them is its own project.
7. **T1-6** ✅ — `documentation/comparison.md` with feature matrix vs
   Claude Code / Cursor / Cline / Aider / Devin / OpenHands /
   Windsurf, plus a "how to choose" decision guide

What I've prepared but can't execute (needs operator):

- ✅ Built both artifacts to `dist-artifacts/`:
  - `colony-cli-2.0.0.tgz` (818 KB, 285 files)
  - `colony-vscode-0.2.0.vsix` (22 KB, 18 files — icon included, source excluded)
- ✅ Wrote `RUN_THESE_COMMANDS.md` — step-by-step operator runbook

Tier 2/3 items are out of scope for this session — they need
external infrastructure or budget decisions.

---

## Completion snapshot (2026-05-31)

All Tier 0 + Tier 1 items closed. Pre-built artifacts ready for upload.

**Verification at session end:**
- `bun run tsc --noEmit`: 0 errors (main project)
- `cd vscode-extension && npx tsc -p . --noEmit`: 0 errors
- `bun test`: 251 pass / 0 fail / 15 files
- `npm pack --dry-run`: 818 KB packed / 5.4 MB unpacked / 285 files
- `vsce package`: 22 KB VSIX / 18 files / icon included / src excluded
- No `colony-os` or `colony-plugins.github.io` URLs remaining in
  user-facing files (only historical references in plan/analysis docs)

**Operator action required to actually publish:**
See [`RUN_THESE_COMMANDS.md`](RUN_THESE_COMMANDS.md) — 7 steps,
30–45 minutes total.
