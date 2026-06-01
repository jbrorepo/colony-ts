# Contributing to The Colony

Thanks for considering a contribution. Colony is intentionally
opinionated about a few things (security defaults, no vendor SDKs,
verbatim tool truth) — read this before opening a PR for anything
non-trivial.

## Quick start for contributors

```bash
git clone https://github.com/jbrorepo/colony-ts.git
cd colony
bun install
bun test                # 251+ tests, ~3 seconds
bun run tsc --noEmit    # type-check
bun run start           # try it
```

## Before you open a PR

1. **`bun test` is green.** Add tests for new functionality. See
   [`src/__tests__/README.md`](src/__tests__/README.md) for the
   contributor test-writing guide.
2. **`bun run tsc --noEmit` is clean.** No new TypeScript errors.
3. **`bun run tsc -p vscode-extension --noEmit` is clean** if you
   touched the extension.
4. **No `console.log` left behind.** Use the existing logger paths.
5. **No secrets in code or commit history.** We scrub but assume
   nothing.
6. **CHANGELOG updated.** Add an entry under `[Unreleased]`.

## Hard rules

These are non-negotiable. PRs that violate them will be rejected:

### 1. No vendor LLM SDKs

All providers (`anthropic`, `openai`, `gemini`, `ollama`) must use raw
`fetch`. Do not import `@anthropic-ai/sdk`, `openai`, etc. This
preserves the small attack surface and avoids SDK lock-in.

### 2. Default-deny security

Every new tool, endpoint, or policy rule defaults to **denied** for
unknown actors. Explicit allow rules are required for access.

### 3. Verbatim tool truth

Tool outputs are appended to the conversation verbatim. Do not
summarize, paraphrase, or compress tool results before the model sees
them. The exception is explicit compaction with operator visibility.

### 4. Pure-function session mutations

`addMessage()`, `markIdle()`, `closeSession()`, etc. return new
snapshots rather than mutating in place. Maintain this pattern in any
new session methods.

### 5. Input normalization at boundaries

Any data crossing a trust boundary (HTTP body, slash command args, tool
arguments, plugin output) goes through a normalizer. Extend the
existing normalizers; never bypass them.

## PR conventions

- **Branch name:** `<initials>/<short-description>` (e.g.
  `jb/swarm-detached-mode`)
- **Commit messages:** imperative mood, concise (`add detached swarm
  mode`, not `Added detached swarm mode for swarm runs`)
- **PR title:** matches the top commit subject
- **PR body:** explain *why* the change matters and *what* changed.
  Link to the relevant section in `IMPLEMENTATION_PLAN.md`,
  `COMPETITIVE_GAPS_PLAN.md`, or a GitHub issue.

## Architecture decisions

Substantial architectural changes go in `docs/DECISIONS.md` as a short
ADR before the implementation PR. Keep it under 1 page.

## Reviewing PRs

Reviewers check:

- ✓ Tests added for new behavior
- ✓ Type-check clean across both projects
- ✓ Security model intact (default-deny, no new credential surfaces)
- ✓ No vendor SDKs added
- ✓ CHANGELOG entry added
- ✓ Documentation updated (`documentation/` for user-facing changes)

## What we'll probably reject

- New runtime dependencies without strong justification
- Features that bypass approval gates
- Changes that make the default less secure
- Code paths without test coverage
- New surfaces without documentation

## Reporting bugs

Open an issue with:

- Colony version (`colony --version`)
- Provider + model
- OS + Bun version
- Reproduction steps
- Expected vs actual

For security issues, see [`documentation/security.md#reporting-security-issues`](documentation/security.md#reporting-security-issues).

## License

By contributing, you agree your contribution is licensed under the
project's [MIT license](LICENSE).
