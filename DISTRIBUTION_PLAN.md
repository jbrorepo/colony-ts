# Colony — Distribution Push Plan
**Initiated:** 2026-05-30
**Goal:** Close the three distribution gaps from the May 2026 refresh analysis:
NPM publication, public documentation, and "true availability" (the project
findable to anyone who looks for it).

---

## Why this matters

Two sessions of engineering work shipped a competitive runtime. The May
refresh analysis concluded:

> "Colony has built a competitive runtime that nobody can find."

The highest-leverage next work is **non-engineering distribution polish**.
This plan exits the repo and ships into the world.

---

## Priority order & status

| # | Item | Est. | Status |
|---|---|---|---|
| D1 | Audit & polish `package.json` for `npm publish` | 1d | ✅ DONE (2026-05-30) |
| D2 | Publication-ready root `README.md` | ½d | ✅ DONE (2026-05-30) |
| D3 | `CHANGELOG.md` covering v1.0 → v2.0 | ½d | ✅ DONE (2026-05-30) |
| D4 | User-facing `documentation/` structure with 8 pages | 2d | ✅ DONE — 13 pages (2026-05-30) |
| D5 | VS Code extension publish prep (LICENSE, README polish, .vscodeignore) | ½d | ✅ DONE (2026-05-30) |
| D6 | `PUBLISHING.md` operator runbook | ½d | ✅ DONE (2026-05-30) |
| D7 | GitHub Actions workflow for tag-triggered publish | ½d | ✅ DONE (2026-05-30) |
| D8 | Plugin registry GitHub Pages landing | ½d | ✅ DONE (2026-05-30) |
| D9 | Pre-publish dry-run + final checklist | ½d | ✅ DONE (2026-05-30) |

**Total:** ~7 days of focused work, mostly writing.

---

## Completion snapshot

All 9 items closed in a single push. Verified state:

- `bun test`: **251 pass** / 0 fail / 15 files
- `bun run tsc --noEmit`: **0 errors**
- `cd vscode-extension && npx tsc -p . --noEmit`: **0 errors**
- `npm pack --dry-run`: **813 KB packed / 5.4 MB unpacked / 277 files**

What's now in place but not yet executed (operator action required):

1. **Publish `@colony/cli` to npm:** `npm whoami` + `npm publish --access public`
2. **Publish `colony-vscode` to Marketplace:** `cd vscode-extension && npx vsce publish`
3. **Tag a release:** `git tag v2.0.0 && git push origin v2.0.0` —
   this triggers `.github/workflows/publish.yml` to do steps 1+2
   automatically (requires `NPM_TOKEN` and `VSCE_PAT` secrets configured)
4. **Enable GitHub Pages** for the `colony-os/colony` repo, source =
   GitHub Actions. The `deploy-registry.yml` workflow will then publish
   `registry/` to `colony-plugins.github.io` (or whatever the
   GH Pages URL is for the repo)

See [`PUBLISHING.md`](PUBLISHING.md) for the full runbook.

---

## D1 · Package.json publish polish
**Why:** `npm publish` will succeed today but the package metadata is thin.

**Changes:**
- Add `description` that explains what Colony is in one sentence
- Add `keywords` array (15+ tags for discoverability)
- Add `homepage`, `bugs.url`, `repository.url` pointing to real GitHub
- Verify `files` covers what should ship; add `LICENSE`, `README.md`,
  `CHANGELOG.md`, `documentation/`
- Add `engines.bun` since we expect Bun for non-shim flows
- Add `funding` field for visibility
- Verify the `bin` script is executable and self-tests with `bun run`

## D2 · Root README rewrite
**Why:** The current README is internal Alpha 0 launch text. For an npm
package, readers need: "what is this", "why use it", "how to start",
"link to docs".

**New structure:**
- One-line tagline
- 30-second "what is Colony" with diagram or table
- Install (`npm install -g @colony/cli`)
- Quickstart (4 commands → working agent)
- Link to documentation site / `documentation/` folder
- Link to security model
- Links to plugin registry, MCP guide, REST API
- Status badges (CI passing, npm version, license)
- Community links (Discord placeholder, GitHub discussions)

## D3 · CHANGELOG.md
**Why:** Required by npm best practices; readers want to know what changed.

**Content:**
- v2.0.0 (current) — REST API, web dashboard, MCP first-class, Docker
  executor, VS Code extension v0.2, swarm detached mode, plugin search
- v1.0.0 (assumed Alpha 0) — caste RBAC, swarm runtime, Ollama-first
- Keep-a-Changelog format

## D4 · documentation/ structure
**Why:** The existing `docs/` is internal playbooks. New users need a
clean entry point.

**Structure:**
```
documentation/
  README.md           ← table of contents + overview
  quickstart.md       ← install → first message → first swarm run
  configuration.md    ← env vars, config files, providers
  security.md         ← caste RBAC, path validator, approval gates
  rest-api.md         ← every /api/v1/* endpoint with examples
  cli.md              ← every slash command
  mcp.md              ← MCP server registry guide
  plugins.md          ← plugin search + author guide
  vscode.md           ← VS Code extension features + setup
  architecture.md     ← module map, daemon vs runtime, MemPalace
  swarm.md            ← swarm runs, detached mode, monitoring
  diff-preview.md     ← unified diff API usage
  sandbox.md          ← ToolExecutor + Docker backend
  benchmarks.md       ← how to reproduce SWE-bench numbers
  troubleshooting.md  ← common errors + fixes
```

Markdown-first so it works both as in-repo browsing AND a future docs
site (Docusaurus/MkDocs/VitePress) without rewriting.

## D5 · VS Code extension publish prep
**Why:** The extension is configured but missing publishability basics.

**Changes:**
- Add `vscode-extension/LICENSE` (MIT, copy from root)
- Polish `vscode-extension/README.md` for marketplace display
- Add `.vscodeignore` entries to keep the .vsix small
- Add icon placeholder (`media/icon.png`)
- Publisher decision: keep `colony-local` (sideload-only) or move to a
  real publisher account for marketplace

## D6 · PUBLISHING.md runbook
**Why:** Future releases need a documented process. This is also the
hand-off when someone else helps publish.

**Content:**
- Pre-publish checklist (tests pass, type-check clean, CHANGELOG updated,
  version bumped)
- `npm publish` step with `--dry-run` first
- VS Code `vsce package && vsce publish` step
- GitHub release creation
- Plugin registry update process
- Post-publish smoke test (install from npm, run `colony --help`)

## D7 · GitHub Actions publish workflow
**Why:** Automate the release path so it's not just one person knowing
the dance.

**Content:**
- Trigger: push of tag `v*.*.*`
- Jobs: lint → type-check → test → npm publish → vsce publish → create
  GitHub release with auto-generated notes
- Secret requirements documented in PUBLISHING.md (`NPM_TOKEN`,
  `VSCE_PAT`)

## D8 · Plugin registry GitHub Pages landing
**Why:** The plugin search client default URL points at GitHub Pages.
Right now that 404s.

**Content:**
- Static HTML index at `registry/index.html` listing all plugins from
  `v1/index.json`
- Search box (client-side JS — pure vanilla)
- Per-plugin detail pages generated from the JSON
- GitHub Pages config to serve `registry/` as the site root

## D9 · Pre-publish dry-run
**Why:** Catch issues before the world sees them.

**Steps:**
- `npm pack --dry-run` to see exactly what ships
- Audit pack contents for: secrets, internal docs, .tmp dirs, test files
- `npm install ./colony-cli-2.0.0.tgz -g` in a clean directory
- `colony --help`, `colony --version`, `colony daemon --help`
- VS Code: `vsce package --no-yarn`, install the .vsix in a clean VS
  Code window

---

## Execution order today

1. **D1** package.json polish (foundation)
2. **D2** root README (readable artifact)
3. **D3** CHANGELOG (required artifact)
4. **D4** documentation/ structure (biggest writing chunk)
5. **D5** VS Code extension prep
6. **D6** PUBLISHING.md runbook
7. **D7** GitHub Actions
8. **D8** plugin registry landing
9. **D9** dry-run + final check
