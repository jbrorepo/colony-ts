# Plugins

Colony plugins are discoverable through the hosted plugin registry. The
client (`/plugins search`) queries the registry, filters client-side,
and shows results in the TUI / web dashboard / VS Code extension.

## For users

### Search

```
/plugins search github
/plugins search essential
/plugins search       # list all
```

The search hits the configured registry URL (default:
`https://jbrorepo.github.io/colony-ts/registry/v1/index.json`). Results are
filtered locally — your search term is never sent to a server.

### Install (preflight + activate)

```
/plugins preflight <id>      # check compatibility
/plugins activate <id> --approved
```

See the existing `/plugins` command suite (also covers status,
deactivate, etc.).

### Air-gapped / private registry

```bash
colony config set plugins.registryUrl https://internal.example.com/colony-plugins/v1/index.json
```

The client validates against the same JSON Schema regardless of host.

## For plugin authors

### Submission process

1. Build and publish your plugin as either:
   - npm package: `@my-org/colony-plugin-foo`
   - GitHub repo with a release tag

2. Open a PR against `jbrorepo/colony-ts` updating `registry/v1/index.json` with your entry to
   `v1/index.json`.

3. Two Colony team reviewers check:
   - **Security:** no credential exfiltration, no path-escape attempts,
     respects `PathValidator` and the security policy
   - **Quality:** accurate description, sensible tags, plugin does what
     it claims
   - **Compatibility:** works with current Colony

4. Merged → registry regenerates within 15 minutes → your plugin
   appears in `/plugins search` results globally.

### Entry schema

Every entry must validate against
[`registry/v1/schema.json`](../registry/v1/schema.json):

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "description": "One-paragraph description focused on the value, 20-500 chars.",
  "version": "1.0.0",
  "author": "your-name",
  "tags": ["category1", "category2"],
  "verified": false,
  "source": "npm:@my-org/colony-plugin-foo",
  "homepageUrl": "https://github.com/my-org/colony-plugin-foo"
}
```

### What makes a good plugin

- **Does one thing well.** A `git` plugin focused on read-only ops is
  better than a `dev-tools` plugin that wraps everything.
- **Clear security posture.** Document which actions are reads vs writes,
  which need approval, what credentials it stores.
- **Honors the runtime.** Use `PathValidator`, the built-in HTTP client
  (with domain allowlists), Colony's standard error shapes.
- **Tight description.** What users see in search:
  - ❌ "GitHub plugin"
  - ✓ "GitHub API integration: list/create issues, open PRs, post review
    comments. Uses fine-grained PATs with least-privilege scopes."

### What gets rejected

- Credential-stealing surface area (reads `~/.aws/credentials`, scans
  env for `*_KEY`)
- Network reach without explicit domain allowlisting
- Shell execution outside the `ToolExecutor` interface
- Plugins that bypass approval gates
- Plugins that rewrite policy rules or disable other plugins

### Verified status

Granted after an additional security review. Submit:

- Threat model document
- Full source link
- Description of any credentials or external services used
- Maintainer commitment to patch security issues within 7 days

Verified plugins get a `[verified]` badge in search results and may be
included in the curated starter pack.

## See also

- [`registry/SUBMITTING.md`](../registry/SUBMITTING.md) — submission process
- [`registry/README.md`](../registry/README.md) — registry hosting
- [Security model](security.md) — what the policy engine enforces on plugins
