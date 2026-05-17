# Launch Alpha 0 Dependency Risk

## Scope

Launch Alpha 0 ships source+Bun first. Runtime dependencies are limited to the
terminal UI stack and local state helpers:

- `ink`
- `ink-spinner`
- `ink-text-input`
- `react`
- `zustand`

Development dependencies are:

- `@types/react`
- `bun-types`
- `react-devtools-core`
- `typescript`

## Lockfile And Install Surface

- Lockfile present: `bun.lock`
- Package manager for Alpha 0: Bun
- Public release vehicle: source checkout plus `bun install`
- Security-sensitive runtime logic remains pure TypeScript with zero additional
  npm packages.
- LLM providers use raw `fetch()` and no vendor SDK dependencies.

## Audit Evidence

- Date recorded: 2026-05-11
- Command: `bun audit`
- Result: No vulnerabilities found
- Bun version reported by audit: `1.3.10`

## Risk Disposition

- Dependency risk is accepted for Launch Alpha 0.
- Any new dependency added after this record must update this file and rerun
  `bun audit`.
- A formal SBOM is not required for Alpha 0 unless the release owner changes the
  release policy.
