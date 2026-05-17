# Launch Alpha 0 Release Readiness

## Summary

- Product or feature: The Colony Launch Alpha 0
- Release owner: local project owner
- Durable team: Colony maintainers
- Target release date: after release gate and manual terminal UI smoke pass
- Current lifecycle gate: automated release gate was refreshed and passed on
  2026-05-14; historical provider readiness passed, but the latest automation
  preflight was refreshed at 2026-05-14T23:08:28.222Z and remains blocked until
  Ollama or an optional cloud provider is available; manual terminal UI smoke
  remains unrecorded

## Evidence Gates

- [x] Concept Fit evidence exists: source+Bun alpha scope is documented in `docs/LAUNCH_ALPHA_0.md`.
- [x] Problem-Solution Fit evidence exists: real planner/worker/reviewer demo is verified by `verify:phase226`.
- [x] Identity compatibility evidence exists: 12-caste method framework compatibility is verified by `verify:phase282`, with legacy persisted caste values retained as compatibility aliases.
- [x] Investment Case is waived for this public source+Bun alpha.
- [x] Build Readiness artifacts are complete enough for Alpha 0: README, launch scope, project state, inventory, commit buckets, and release notes exist.

## Quality

- [x] Automated tests cover critical paths for this release gate.
- [x] Manual smoke checks are documented.
- [ ] Provider readiness preflight has been rerun successfully in the final
  operator environment.
- [ ] Manual terminal UI `/swarm llm` smoke has been run and recorded.
- [x] Non-TTY automation-shell startup behavior has been recorded.
- [x] Known defects and limits are triaged as Alpha 0 known limits.
- [x] Rollback path is documented as source-only release candidate review with no destructive workspace cleanup.

## Security, Privacy, And Compliance

- [x] Threat boundary is documented through claim-safety and local-first guardrails.
- [x] Dependency and package risk reviewed for the release candidate.
- [x] Secrets handling reviewed at the Alpha 0 claim level: no credential persistence claim and raw provider values stay host supplied.
- [x] Privacy review is not applicable beyond local operator data for Alpha 0.
- [x] Dependency inventory is available; formal SBOM is not required for Alpha 0 unless release policy changes.

## Accessibility

- [x] Keyboard path is the terminal UI path.
- [x] Screen-reader impact is limited to terminal output for Alpha 0.
- [x] Color and contrast risk is limited to terminal theme defaults.
- [x] Accessibility exceptions are documented by keeping web/channel surfaces out of the launch headline.

## Operability

- [x] Service-health expectation is local operator controlled; no hosted SLO is claimed.
- [x] Telemetry is local verification output and runtime status, not remote analytics.
- [x] Runbook exists through README, `/doctor first-run`, and `docs/LAUNCH_ALPHA_0.md`.
- [x] Support handoff complete for Alpha 0: local release owner handles source checkout issues, install failures, provider setup, and demo-run triage.
- [x] Incident response owner identified: local release owner.

## Decision

- [ ] Approve release
- [ ] Approve limited rollout
- [x] Block release until provider readiness and manual terminal UI swarm smoke
  are recorded for the final candidate.

## Follow-Up

- Hypercare owner: local release owner
- Review date: after manual terminal UI smoke
- Post-launch learning review date: after first external alpha operator feedback
