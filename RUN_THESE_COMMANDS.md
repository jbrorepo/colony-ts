# Run These Commands — Operator Publish Runbook

The repository is publish-ready as of 2026-05-31. **The actual publish
steps require credentials that don't exist in the dev session.** Here's
exactly what you need to run from your local shell, in order.

Estimated time: **30–45 minutes** including waits for marketplace
indexing.

---

## Pre-flight check

```bash
cd /d/The\ Colony\ Test/colony-ts   # or wherever the repo lives
bun test                            # expect: 251 pass / 0 fail
bun run tsc --noEmit                # expect: clean
cd vscode-extension && npx tsc -p . --noEmit && cd ..   # expect: clean
git status                          # expect: only the new files from this session
```

If any of those fail, **stop and fix before publishing**.

---

## Step 0 · Inspect the pre-built artifacts

The build already ran during this session. The artifacts are in
`dist-artifacts/`:

```bash
ls -la dist-artifacts/
# colony-cli-2.0.0.tgz       — 818 KB, 285 files
# colony-vscode-0.2.0.vsix   — 22 KB, 18 files
```

Optional sanity check — inspect what would land in npm:

```bash
tar tzf dist-artifacts/colony-cli-2.0.0.tgz | head -30
unzip -l dist-artifacts/colony-vscode-0.2.0.vsix
```

If anything looks wrong, **stop**. Don't publish.

---

## Step 1 · Commit + push the prep work

The repo currently has uncommitted prep files (this README, the
`documentation/`, the registry landing page, etc.). Push them first so
the GitHub release links resolve:

```bash
git add .
git commit -m "v2.0 distribution prep: docs, registry landing, governance, examples"
git push origin main
```

If `git push` complains about authentication, you need a [GitHub
PAT](https://github.com/settings/tokens) or SSH key set up first.

---

## Step 2 · Publish `@colony/cli` to npm

### Log in

```bash
npm login
# OR if you use a token:
# npm config set //registry.npmjs.org/:_authToken YOUR_TOKEN
npm whoami       # confirm you're the @colony org owner / collaborator
```

### Publish

```bash
npm publish dist-artifacts/colony-cli-2.0.0.tgz --access public --provenance
```

> The `--provenance` flag adds an OIDC attestation proving the package
> came from this CI workflow. Optional but recommended.

If you don't own the `@colony` scope yet, you'll need to create it
first:

```bash
npm org create colony           # interactive
# OR publish under your personal scope:
# Edit package.json: name → "@jbrorepo/colony-cli"
# Then: npm publish dist-artifacts/colony-cli-2.0.0.tgz --access public
```

### Verify

```bash
# Wait ~30 seconds for the npm registry to index
npm view @colony/cli@2.0.0
# Should show your description, version, etc.
```

### Smoke test on a clean machine

```bash
cd /tmp
npm install -g @colony/cli@2.0.0
colony --version       # should print 2.0.0
colony --help          # should show the help text
```

> If broken: `npm unpublish @colony/cli@2.0.0` within 72 hours. After
> 72 hours you need a patch release.

---

## Step 3 · Publish `colony-vscode` to VS Code Marketplace

### Get a Personal Access Token (PAT)

If you don't have one yet:

1. Go to https://dev.azure.com/<your-org>/_usersSettings/tokens
2. Create a new PAT with **Marketplace > Manage** scope
3. Set expiry to a sensible window (12 months is common)

### Create / claim the publisher

```bash
cd vscode-extension
npx --yes @vscode/vsce login colony-local
# Paste the PAT when prompted
```

If `colony-local` isn't a publisher you own, either:
- Create it: https://marketplace.visualstudio.com/manage/createpublisher
- Or edit `vscode-extension/package.json` `publisher` field to one you do

### Publish

```bash
cd vscode-extension
npx --yes @vscode/vsce publish --packagePath ../dist-artifacts/colony-vscode-0.2.0.vsix
```

### Verify

Wait ~5 minutes for Marketplace indexing, then:

- https://marketplace.visualstudio.com/items?itemName=colony-local.colony-vscode
- Open VS Code → Extensions → search "Colony" → install the published one

---

## Step 4 · Enable GitHub Pages (plugin registry hosting)

The registry landing page is at `registry/` and the workflow is at
`.github/workflows/deploy-registry.yml`. It needs Pages enabled.

1. Go to **https://github.com/jbrorepo/colony-ts/settings/pages**
2. Under **Source**, choose **GitHub Actions**
3. Save

Then trigger the workflow:

```bash
gh workflow run deploy-registry.yml --repo jbrorepo/colony-ts
# OR via the GitHub UI: Actions → Deploy plugin registry → Run workflow
```

After ~2 minutes, the registry will be live at:
**https://jbrorepo.github.io/colony-ts/**

Verify the search client picks it up:

```bash
# From a Colony install
echo "/plugins search git" | colony
# Should return the seeded plugins
```

---

## Step 5 · Tag the release

This triggers `.github/workflows/publish.yml`, which (in future
releases) automates Steps 2 + 3. For this first release, those were
already done manually above.

```bash
git tag -a v2.0.0 -m "v2.0.0 — REST API, web dashboard, MCP first-class, Docker executor, VS Code v0.2"
git push origin v2.0.0
```

The workflow will:
1. Re-run tests
2. Attempt npm publish (will be a no-op since we already published)
3. Attempt vsce publish (same)
4. Create a GitHub release with CHANGELOG section auto-extracted
5. Upload the .vsix as a release asset

To enable the automated workflow for future releases, set these
secrets at https://github.com/jbrorepo/colony-ts/settings/secrets/actions:

| Secret | Value |
|---|---|
| `NPM_TOKEN` | Automation token from npmjs.com |
| `VSCE_PAT` | The same PAT used in Step 3 |

---

## Step 6 · Smoke-test the public artifacts

```bash
# npm
npm view @colony/cli@2.0.0

# VS Code Marketplace
curl -sI "https://marketplace.visualstudio.com/items?itemName=colony-local.colony-vscode" | head -1

# Plugin registry
curl -s https://jbrorepo.github.io/colony-ts/v1/index.json | jq '{version, updated, plugin_count: (.plugins | length)}'

# GitHub release
gh release view v2.0.0
```

If all four are reachable: you've shipped. ✓

---

## Step 7 · Announce

Suggested order:

1. **GitHub release notes** — already created by the workflow; edit if
   needed
2. **Pin a discussion** at https://github.com/jbrorepo/colony-ts/discussions
3. **Post to /r/programming, /r/LocalLLaMA, HN** (one at a time, spaced
   over days)
4. **Tweet / Bluesky / Mastodon** with a 30-second demo GIF
5. **Update your personal site** with the release link

---

## If something breaks

| Symptom | Likely cause | Fix |
|---|---|---|
| `npm publish` fails with 403 | Not logged in or wrong scope | `npm login` then retry |
| `npm publish` fails with 402 | Trying to publish a private package as public | Add `--access public` |
| `vsce publish` fails with "publisher not found" | Need to create the publisher or change to one you own | See Step 3 |
| Plugin registry 404 | GitHub Pages not enabled yet | See Step 4 |
| `colony --version` shows old version after install | npm cache | `npm cache clean --force` then reinstall |
| VS Code extension fails to activate | Outdated VS Code version | Need VS Code ≥ 1.85 |

For other issues, see [`documentation/troubleshooting.md`](documentation/troubleshooting.md).

---

## What's intentionally NOT in this runbook

- **Setting up colony.dev** — out of scope; see [`GAP_ANALYSIS_2026_05_31.md`](GAP_ANALYSIS_2026_05_31.md) Tier 2
- **Recording demo GIFs** — out of scope; do it after first feedback
- **Creating a Discord** — out of scope; defer until first real users ask
- **SOC2 / security audit** — out of scope; pursue after 1000+ installs
