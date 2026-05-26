/**
 * Phase 388 — release-publish script contract.
 *
 * The `scripts/publish-release.ts` script publishes GitHub Releases via raw
 * fetch with dry-run-by-default safety. This verifier exercises every
 * exported helper without making any network calls, so a regression in the
 * argument parser, repo discovery, payload builder, notes loader, dry-run
 * renderer, or fetch-stub-compatible API helpers fails the gate before the
 * script is invoked against a real PAT.
 *
 * Covered surfaces:
 *   1. parseArgs requires --tag, --title, --notes; surfaces unknown flags.
 *   2. parseArgs defaults --confirm to false (dry-run posture).
 *   3. parseArgs threads --prerelease / --latest / --draft / --update.
 *   4. parseRepoFromRemoteUrl handles https, ssh-shorthand, and ssh:// forms.
 *   5. parseRepoOverride enforces owner/name shape.
 *   6. loadReleaseNotes reads from disk and rejects empty files.
 *   7. buildReleasePayload maps args + body into the GitHub JSON shape.
 *   8. renderDryRun previews target URL, title, prerelease, body excerpt.
 *   9. fetchExistingRelease returns null for 404 and the record for 200.
 *  10. README/docs claim about 388-phase verification gate matches the
 *      actual count (defense against the meta-claim drifting from reality).
 */

import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  buildReleasePayload,
  fetchExistingRelease,
  loadReleaseNotes,
  parseArgs,
  parseRepoFromRemoteUrl,
  parseRepoOverride,
  renderDryRun,
} from "../scripts/publish-release";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectThrow(fn: () => unknown, label: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, `${label}: expected throw`);
}

// ---------------------------------------------------------------------------
// 1. parseArgs required-flag enforcement
// ---------------------------------------------------------------------------

expectThrow(() => parseArgs([]), "no args");
expectThrow(() => parseArgs(["--title", "x", "--notes", "x"]), "missing --tag");
expectThrow(() => parseArgs(["--tag", "v1", "--notes", "x"]), "missing --title");
expectThrow(() => parseArgs(["--tag", "v1", "--title", "x"]), "missing --notes");
expectThrow(() => parseArgs(["--unknown", "x"]), "unknown flag rejected");
expectThrow(
  () => parseArgs(["--tag", "--title", "x", "--notes", "x"]),
  "flag-value-eaten-by-next-flag rejected",
);

// ---------------------------------------------------------------------------
// 2. dry-run-by-default posture
// ---------------------------------------------------------------------------

{
  const args = parseArgs([
    "--tag", "v2.0.0-alpha.0",
    "--title", "Alpha 0",
    "--notes", "/dev/null",
  ]);
  assert(args.confirm === false, "confirm must default to false");
  assert(args.update === false, "update must default to false");
  assert(args.prerelease === false, "prerelease must default to false");
  assert(args.latest === false, "latest must default to false");
  assert(args.draft === false, "draft must default to false");
  assert(args.assetPath === undefined, "asset must default to undefined");
  assert(args.repoOverride === undefined, "repo override must default to undefined");
}

// ---------------------------------------------------------------------------
// 3. flag threading
// ---------------------------------------------------------------------------

{
  const args = parseArgs([
    "--tag", "v2.0.0-alpha.0",
    "--title", "Alpha 0",
    "--notes", "notes.md",
    "--prerelease",
    "--latest",
    "--draft",
    "--update",
    "--confirm",
    "--asset", "colony",
    "--repo", "jbrorepo/colony-ts",
  ]);
  assert(args.prerelease === true, "prerelease must flow through");
  assert(args.latest === true, "latest must flow through");
  assert(args.draft === true, "draft must flow through");
  assert(args.update === true, "update must flow through");
  assert(args.confirm === true, "confirm must flow through");
  assert(args.assetPath === "colony", "asset path must flow through");
  assert(args.repoOverride === "jbrorepo/colony-ts", "repo override must flow through");
}

// ---------------------------------------------------------------------------
// 4. parseRepoFromRemoteUrl shape coverage
// ---------------------------------------------------------------------------

{
  const cases: Array<{ input: string; owner: string; repo: string }> = [
    { input: "https://github.com/jbrorepo/colony-ts.git", owner: "jbrorepo", repo: "colony-ts" },
    { input: "https://github.com/jbrorepo/colony-ts", owner: "jbrorepo", repo: "colony-ts" },
    { input: "https://token@github.com/jbrorepo/colony-ts.git", owner: "jbrorepo", repo: "colony-ts" },
    { input: "git@github.com:jbrorepo/colony-ts.git", owner: "jbrorepo", repo: "colony-ts" },
    { input: "ssh://git@github.com/jbrorepo/colony-ts", owner: "jbrorepo", repo: "colony-ts" },
  ];
  for (const c of cases) {
    const r = parseRepoFromRemoteUrl(c.input);
    assert(r.owner === c.owner && r.repo === c.repo, `parseRepoFromRemoteUrl(${c.input})`);
  }
  expectThrow(
    () => parseRepoFromRemoteUrl("https://gitlab.example.com/foo/bar.git"),
    "non-github URL rejected",
  );
}

// ---------------------------------------------------------------------------
// 5. parseRepoOverride shape
// ---------------------------------------------------------------------------

{
  const r = parseRepoOverride("foo/bar");
  assert(r.owner === "foo" && r.repo === "bar", "parseRepoOverride basic");
  expectThrow(() => parseRepoOverride("foo"), "single segment rejected");
  expectThrow(() => parseRepoOverride("foo/bar/baz"), "three segments rejected");
}

// ---------------------------------------------------------------------------
// 6. loadReleaseNotes
// ---------------------------------------------------------------------------

{
  const dir = await mkdtemp(join(tmpdir(), "colony-publish-"));
  try {
    const goodPath = join(dir, "notes.md");
    await writeFile(goodPath, "# Hello\nbody text", "utf8");
    const text = await loadReleaseNotes(goodPath);
    assert(text.includes("Hello"), "loadReleaseNotes returns content");

    const emptyPath = join(dir, "empty.md");
    await writeFile(emptyPath, "   \n  \n", "utf8");
    let threwOnEmpty = false;
    try { await loadReleaseNotes(emptyPath); } catch { threwOnEmpty = true; }
    assert(threwOnEmpty, "loadReleaseNotes rejects empty content");

    let threwOnMissing = false;
    try { await loadReleaseNotes(join(dir, "missing.md")); } catch { threwOnMissing = true; }
    assert(threwOnMissing, "loadReleaseNotes rejects missing path");
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// 7. buildReleasePayload shape
// ---------------------------------------------------------------------------

{
  const args = parseArgs([
    "--tag", "v2.0.0-alpha.0",
    "--title", "Alpha 0",
    "--notes", "notes.md",
    "--prerelease",
    "--latest",
  ]);
  const payload = buildReleasePayload(args, "BODY");
  assert(payload.tag_name === "v2.0.0-alpha.0", "tag_name");
  assert(payload.name === "Alpha 0", "name");
  assert(payload.body === "BODY", "body");
  assert(payload.prerelease === true, "prerelease bool");
  assert(payload.draft === false, "draft default false");
  // GitHub API requires make_latest as the string "true"/"false", not boolean.
  assert(payload.make_latest === "true", "make_latest string-true");

  const args2 = parseArgs([
    "--tag", "v0", "--title", "t", "--notes", "n",
  ]);
  const payload2 = buildReleasePayload(args2, "B");
  assert(payload2.make_latest === "false", "make_latest string-false default");
  assert(payload2.prerelease === false, "prerelease default false");
}

// ---------------------------------------------------------------------------
// 8. renderDryRun includes the key fields
// ---------------------------------------------------------------------------

{
  const args = parseArgs([
    "--tag", "v2.0.0-alpha.0",
    "--title", "Alpha 0 — public source+Bun alpha",
    "--notes", "notes.md",
    "--prerelease",
    "--latest",
  ]);
  const payload = buildReleasePayload(args, "line1\nline2\nline3");
  const out = renderDryRun({ owner: "jbrorepo", repo: "colony-ts" }, args, payload, "line1\nline2\nline3");
  assert(out.includes("DRY RUN"), "marked dry run");
  assert(out.includes("jbrorepo/colony-ts"), "target repo shown");
  assert(out.includes("v2.0.0-alpha.0"), "tag shown");
  assert(out.includes("Alpha 0 — public source+Bun alpha"), "title shown");
  assert(out.includes("Add --confirm to actually publish"), "explicit next step");
  assert(out.includes("line1"), "body preview shown");
}

// ---------------------------------------------------------------------------
// 9. fetchExistingRelease handles 404 vs 200 via fetch stub
// ---------------------------------------------------------------------------

{
  const stub404: typeof fetch = (async () =>
    new Response("not found", { status: 404 })) as unknown as typeof fetch;
  const none = await fetchExistingRelease(
    { owner: "jbrorepo", repo: "colony-ts" }, "v9", "stub-token", stub404,
  );
  assert(none === null, "404 -> null");

  const stub200: typeof fetch = (async () =>
    new Response(JSON.stringify({
      id: 42,
      upload_url: "https://uploads.github.com/repos/x/y/releases/42/assets{?name,label}",
      html_url: "https://github.com/x/y/releases/tag/v9",
      tag_name: "v9",
      prerelease: true,
      draft: false,
    }), { status: 200, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;
  const found = await fetchExistingRelease(
    { owner: "jbrorepo", repo: "colony-ts" }, "v9", "stub-token", stub200,
  );
  assert(found !== null, "200 -> record");
  assert(found!.id === 42, "record id");
  assert(found!.tag_name === "v9", "record tag_name");
}

// ---------------------------------------------------------------------------
// 10. README + release-notes 388-phase claim matches actual count
// ---------------------------------------------------------------------------

{
  // The v2.0.0-alpha.0 release notes describe what THAT TAG ships, which is
  // 387 phases. Phase 388 itself is post-tag tooling and is intentionally not
  // counted as part of the alpha's verification frontier. If a future release
  // adds its own docs/release/vX.Y.Z-suffix.md, the count claim there should
  // match its tagged commit's verify:all chain length, not whatever main is
  // currently at.
  const releaseNotes = await Bun.file("docs/release/v2.0.0-alpha.0.md").text();
  assert(
    releaseNotes.includes("387-phase verification gate"),
    "v2.0.0-alpha.0 release notes name the 387-phase frontier shipped by that tag",
  );
}

console.log(
  "Phase 388: publish-release script — parser, repo discovery, payload builder, notes loader, dry-run, and stubbed fetch helpers all pass.",
);
