# Colony Plugin Registry

This directory is the source of truth for the hosted plugin registry served at
`https://jbrorepo.github.io/colony-ts/`.

The Colony CLI's `/plugins search <term>` command fetches `v1/index.json` and
filters client-side. There is no server-side query — the registry index is a
static JSON file.

## Layout

```
registry/
  v1/
    index.json     — the canonical plugin index
    schema.json    — JSON Schema for index.json
  README.md        — this file
  SUBMITTING.md    — submission process (see below)
```

## Submitting a plugin

1. Build and publish your plugin as either:
   - An npm package: `@my-org/colony-plugin-foo`
   - A GitHub repo with a release tag

2. Open a PR against `jbrorepo/colony-ts` updating `registry/v1/index.json` with your entry to
   `v1/index.json`. Entries must validate against `v1/schema.json`.

3. Two reviewers from the Colony team will check:
   - **Security:** no obvious credential exfiltration, no path-escape attempts,
     respects `PathValidator` and the security policy engine
   - **Quality:** description is accurate, tags are sensible, plugin actually
     does what it claims
   - **Compatibility:** works with the current Colony version

4. Once merged, the registry is regenerated within 15 minutes and your plugin
   appears in `/plugins search` results for all users.

5. **Verified status** (`verified: true`) is granted at the team's discretion
   for plugins that pass an additional security audit. Community plugins
   default to `verified: false`.

## Versioning

- The registry uses single-major versioning (`v1/`). Breaking changes to the
  index format will be published under `v2/` etc.; the old version stays
  hosted at its URL for compatibility.
- Plugin entries are immutable once shipped — to push a new version, add a
  new entry. Yanking is done by removing the entry from `index.json`.

## Local hosting

To run a private registry for an air-gapped environment:

1. Copy `registry/v1/index.json` to your internal HTTP server.
2. Edit the file to include only your approved plugins.
3. Configure Colony users to point at it:

   ```
   colony config set plugins.registryUrl https://internal.example.com/colony-plugins/v1/index.json
   ```

The client validates against the same schema regardless of host.
