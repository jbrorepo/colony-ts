<!--
Thanks for the PR! Please fill out the sections that apply.
Delete sections that don't.
-->

## Summary

<!-- One or two sentences. What does this change and why? -->

## Changes

<!-- Bullet list of the actual changes. Reference files where relevant. -->

- ...

## Testing

<!-- How did you verify this works? -->

- [ ] `bun test` passes (251+ tests)
- [ ] `bun run tsc --noEmit` clean
- [ ] `cd vscode-extension && npx tsc -p . --noEmit` clean (if extension touched)
- [ ] New tests added for new behavior
- [ ] Manual verification: <!-- describe what you tried -->

## Hard rules

Confirm this change respects Colony's [hard rules](../CONTRIBUTING.md#hard-rules):

- [ ] No new vendor LLM SDK dependencies
- [ ] Default-deny security posture preserved
- [ ] Approval gates not bypassed
- [ ] Verbatim tool truth preserved
- [ ] Pure-function session mutations preserved

## Documentation

- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] User-facing docs in `documentation/` updated if applicable
- [ ] No new public-facing API without a doc entry

## Related

<!-- Closes #XX / Refs #YY / linked plan items -->
