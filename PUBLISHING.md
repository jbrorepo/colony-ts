# Publishing The Colony

The end-to-end runbook for cutting a release: npm package, VS Code
extension, plugin registry, and GitHub release.

> **Audience:** maintainers with publish credentials. If you don't have
> the secrets listed below, you're reading the wrong document — see
> [`documentation/quickstart.md`](documentation/quickstart.md) instead.

---

## Pre-publish checklist

Run through every item before tagging a release. If any fails, fix the
cause and start over — no shortcuts.

- [ ] `bun test` — 251+ passing, 0 failures
- [ ] `bun run tsc --noEmit` — 0 errors
- [ ] `cd vscode-extension && npx tsc -p . --noEmit` — 0 errors
- [ ] `CHANGELOG.md` updated under `[Unreleased]` → move to a versioned
      section dated today
- [ ] `package.json` `version` bumped (semver)
- [ ] `vscode-extension/package.json` `version` bumped if extension
      changed
- [ ] No `console.log` / `console.debug` left in `src/` (greppable)
- [ ] No `.tmp-*` directories in working tree (`bun run clean:tmp`)
- [ ] `git status` clean (everything committed)
- [ ] `git pull origin main` (no surprises)

---

## Versioning policy

- **Major (2.x → 3.x):** breaking changes to the REST API, CLI commands,
  or auth-policy scopes. Mention in CHANGELOG.
- **Minor (2.0 → 2.1):** new features, new endpoints, new commands. No
  removals.
- **Patch (2.0.0 → 2.0.1):** bug fixes only. Run `bun run verify:alpha0`
  before patch releases — they're often touched up after a regression
  report.

---

## Step 1 — npm publish (main package)

### Dry run first

```bash
cd /path/to/colony
npm pack --dry-run
```

Read the output carefully:
- ✓ `bin/colony.mjs` present
- ✓ `src/` with the real code
- ✓ `documentation/` present
- ✓ `registry/` present
- ✓ `README.md`, `LICENSE`, `CHANGELOG.md` at root
- ✗ No `.tmp-*` directories
- ✗ No `.env*` files
- ✗ No internal `docs/` content (the playbook folder, not
  `documentation/`)
- ✗ No `node_modules/`
- ✗ Pack size under 5 MB (warn if over)

If anything wrong, update `files` in `package.json` and retry.

### Actual publish

```bash
npm whoami         # confirm logged in
npm publish --access public
```

Output ends with: `+ @colony/cli@<version>`

### Smoke test on a clean machine

```bash
cd /tmp && mkdir colony-smoke && cd colony-smoke
npm install -g @colony/cli
colony --version
colony --help
```

If anything's broken, `npm unpublish @colony/cli@<version>` within
72 hours. After that, you need to publish a `--deprecated` patch
release.

---

## Step 2 — VS Code Marketplace

> Requires a `VSCE_PAT` (Visual Studio Marketplace Personal Access
> Token). Create one at https://dev.azure.com/<org> with scopes
> "Marketplace: Manage."

### First-time setup (one per publisher)

```bash
cd vscode-extension
npx vsce login colony-local   # paste the PAT
```

### Package + publish

```bash
cd vscode-extension
npx vsce package
# Inspect the generated .vsix:
unzip -l colony-vscode-<version>.vsix
# Should NOT contain: src/, .ts files, node_modules/
```

If the .vsix looks right:

```bash
npx vsce publish
```

### Smoke test

Install from marketplace in a clean VS Code window:

```
Cmd+Shift+P → "Extensions: Install Extensions" → search "Colony"
```

Verify the description, icon, and version match. Run a command (e.g.
`Colony: Show Daemon Health`) to confirm it activates.

---

## Step 3 — Plugin registry update (if changed)

If `registry/v1/index.json` changed (new plugin entry, version bump,
removal), push the change to the public registry repo:

```bash
cd /path/to/colony-plugins-registry-repo
cp /path/to/colony/registry/v1/index.json v1/
git commit -am "registry: <description>"
git push origin main
```

GitHub Pages rebuilds within ~15 minutes. Verify:

```bash
curl https://jbrorepo.github.io/colony-ts/v1/index.json | jq .updated
```

The `updated` field should reflect today's date.

---

## Step 4 — Git tag + GitHub release

```bash
git tag -a v<version> -m "v<version> — <one-line summary>"
git push origin v<version>
```

### Automated release (preferred)

The `.github/workflows/publish.yml` workflow listens for tag pushes and
publishes to npm + Marketplace + creates the GitHub release. Verify:

```bash
gh run watch
```

### Manual release

```bash
gh release create v<version> \
  --title "v<version>" \
  --notes-from-tag \
  --discussion-category "Announcements"
```

Edit the release body to copy the `CHANGELOG.md` section for this
version.

---

## Step 5 — Post-publish

- [ ] Verify both npm and Marketplace show the new version
- [ ] Run the smoke test on a clean machine (see Step 1)
- [ ] Post in `#announcements` Discord channel
- [ ] Update the website (if applicable) with new version + changelog link
- [ ] Bump `[Unreleased]` section back in `CHANGELOG.md` for the next cycle

---

## Required secrets (CI)

For the automated workflow:

| Secret | Where it's used | How to get |
|---|---|---|
| `NPM_TOKEN` | `npm publish` | https://www.npmjs.com/settings/<user>/tokens → "Automation" |
| `VSCE_PAT` | `vsce publish` | https://dev.azure.com/<org>/_usersSettings/tokens |
| `GITHUB_TOKEN` | Release creation | Built-in to GitHub Actions |

Set them in **Settings → Secrets and variables → Actions**.

---

## Rolling back

### npm

```bash
npm deprecate @colony/cli@<bad-version> "Critical bug; use <good-version>"
```

`npm unpublish` only works within 72 hours of publish.

### VS Code Marketplace

There's no "unpublish" — only "unlist." Email VS Code Marketplace
support if you need a hard removal. In the meantime:

```bash
cd vscode-extension
npm version <good-version> --no-git-tag-version
npx vsce publish
```

A higher version supersedes the bad one for new installs.

### Git tag

```bash
git tag -d v<bad-version>
git push origin :refs/tags/v<bad-version>
```

Don't delete tags that have been live for more than an hour. People
have already pulled.

---

## See also

- [`CHANGELOG.md`](CHANGELOG.md) — what's in each release
- [`DISTRIBUTION_PLAN.md`](DISTRIBUTION_PLAN.md) — the plan that
  produced this runbook
- [`.github/workflows/publish.yml`](.github/workflows/publish.yml) —
  CI automation
