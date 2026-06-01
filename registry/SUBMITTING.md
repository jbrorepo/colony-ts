# Submitting a Plugin to the Colony Registry

## Before you start

Read [the README](./README.md) for the high-level process. This document covers
the **what** of a good submission.

## What makes a good plugin

1. **Does one thing well.** A `git` plugin that wraps `git status/diff/log` is
   focused. A `dev-tools` plugin that wraps everything from git to docker to
   kubectl is a maintenance nightmare and a security review minefield. Split.

2. **Has a clear security posture.** Every tool you expose runs through the
   Colony security policy engine. Document explicitly:
   - Which actions are reads vs writes
   - Which require approval gates
   - What credentials it needs and how it stores them
   - What network/filesystem reach it has

3. **Honors the runtime.** Use `PathValidator` for any filesystem op. Use the
   built-in HTTP client (which respects domain allowlists) instead of raw
   `fetch`. Surface errors through Colony's standard error shapes.

4. **Has a tight description.** The text in `index.json` is what users see in
   search results. Make it crisp:
   - **Bad:** "GitHub plugin"
   - **Good:** "GitHub API integration: list/create issues, open PRs, post
     review comments, fetch repo metadata. Uses fine-grained PATs with
     least-privilege scopes."

## Schema requirements

Your entry must validate against [`v1/schema.json`](./v1/schema.json). Key rules:

| Field | Rule |
|---|---|
| `id` | `^[a-z][a-z0-9-]{2,63}$` — lowercase, hyphens, 3–64 chars |
| `name` | 2–80 chars, no length-padding |
| `description` | 20–500 chars, explains the *value* |
| `version` | strict semver (pre-release allowed) |
| `tags` | 1–10 lowercase-hyphenated tags |
| `source` | `npm:<package>` or `github:<owner>/<repo>` |

## What we will reject

- **Credential-stealing surface area.** A tool that reads `~/.aws/credentials`
  or env vars containing `*_KEY` will not be accepted.
- **Network reach without explicit allowlisting.** If your plugin makes HTTP
  calls, the user must be able to see and approve every domain.
- **Shell execution outside the sandbox.** If you need to spawn processes, use
  the `ToolExecutor` interface — do not call `child_process.spawn` directly.
- **Plugins that bypass approval gates.** Tools that "remember the user said
  yes once" without going through the session-allow mechanism are a hard no.
- **Plugins that disable other plugins or rewrite policy rules.** Privilege
  escalation surface area is reserved for first-party `colony-team` plugins.

## After approval

- Your plugin appears in `/plugins search` within ~15 minutes.
- Users install via `/plugins preflight <id>` then `/plugins activate <id> --approved`.
- For community plugins (`verified: false`), Colony shows an extra "community
  plugin" warning in the approval flow.

## Promoting to verified

Verified status is granted after an additional security review. Email
`security@colony-plugins.dev` (TBD) with:

- Threat model document
- Full source link
- Description of any credentials or external services used
- Maintainer commitment to patch security issues within 7 days of disclosure

Verified plugins get:
- A `[verified]` badge in search results
- Auto-trust in default caste configurations (still gated by per-call approval)
- Inclusion in the curated "starter pack" shown to new users
