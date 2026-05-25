# Security Policy

The Colony is a security-first, local-first agent operating system. Reporting
suspected vulnerabilities responsibly is genuinely appreciated.

## Supported versions

Alpha 0 is a public source+Bun alpha. Only the latest tagged release on `main`
is covered by this policy. There are no LTS branches yet.

| Version  | Supported |
|----------|-----------|
| `2.0.x`  | yes       |
| older    | no        |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security-sensitive reports.

Instead, use GitHub's private vulnerability reporting:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Fill in the form with reproduction steps, affected version, and impact.

A maintainer will acknowledge receipt within seven days and provide a triage
update within fourteen days. Coordinated disclosure timelines are typically
30–90 days depending on severity and patch complexity.

## Scope

The following are in scope for vulnerability reports:

- Approval-bypass paths in `src/runtime/approval.ts` or `src/security/`.
- Path-traversal, symlink-escape, or workspace-escape in
  `src/security/path-validator.ts`.
- Shell injection or quote-state-machine bypass in
  `src/security/bash-validator.ts`.
- Secret leakage through any operator-facing surface (UI, logs, transcripts,
  recall, palace inspection, gateway commands, MCP/plugin handoffs, daemon).
- Tool-result externalization gaps allowing untruncated or unredacted
  persistence of 10 KB+ outputs containing credential-shaped data.
- LLM provider implementations that fall back to a vendor SDK instead of raw
  `fetch()`, or that exfiltrate credentials beyond the documented host.
- Approval-required marketplace/plugin lifecycle states that can be advanced
  without a matching approval evidence record.

## Out of scope

- Bugs in reference repositories (`the-colony/`, `claude-code-main/`,
  `openclaw-main/`, `mempalace-develop/`, `skills-main/`, etc.). Report those
  upstream.
- Findings against compiled binaries (`colony.exe` etc.) that do not
  reproduce against the current `main` source tree.
- Denial of service achievable only by an authenticated local operator with
  shell access (local-first runtime assumes local trust).
- Issues in optional cloud-provider vendor APIs themselves.
- Theoretical issues without a reproduction path.

## Hardening expectations

If you are contributing a fix:

- Security-sensitive logic must stay pure TypeScript with zero new npm
  dependencies (see `AGENTS.md` Critical Rule 1).
- LLM providers must use raw `fetch()`, not vendor SDKs (Rule 2).
- Default tool approval must remain conservative (Rule 3).
- Tool results over 10 KB must be externalized and redacted before durable
  persistence (Rule 5).
- The log sanitizer must remain installed before any module that may emit
  secrets (Rule 8).
- Add or extend a `src/verify-phaseN.ts` script covering the fixed
  behavior. The full gate is `bun run verify:all`.
