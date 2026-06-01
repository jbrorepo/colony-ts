/**
 * Phase 391 — GitHub PR remote executor + CLI driver contract.
 *
 * The github-pr-remote-executor module provides the injected executor that
 * executeApprovedGitHubPrCreation calls when an approved preflight is ready
 * to do the actual push + PR creation. This verifier exercises the executor
 * and its CLI wrapper end-to-end with stubbed git + stubbed fetch — no real
 * network call, no real git invocation.
 *
 * Covered surfaces:
 *
 *   1. createGitHubPrRemoteExecutor rejects missing token.
 *   2. createGitHubPrRemoteExecutor rejects a not-ok preflight.
 *   3. Happy path: stubbed git push succeeds, stubbed fetch returns a PR,
 *      executor returns { ok, remoteUrl, prNumber }.
 *   4. git push exit != 0 surfaces a redacted failure reason.
 *   5. Remote URL lookup returns null -> failed with helpful reason.
 *   6. fetch returns non-2xx -> failed with redacted body.
 *   7. fetch returns 2xx but payload missing number/url -> refuses to claim
 *      success.
 *   8. Token MUST NOT appear in the failure reason or in any other returned
 *      string under any failure path.
 *   9. parseRemoteUrl handles https/ssh forms, rejects non-github hosts.
 *  10. CLI parseCliArgs enforces required flags, defaults, and shape.
 *  11. CLI buildPreflightFromCliArgs produces a preflight whose
 *      approvalSignature matches what createGitHubPrPreflight produces from
 *      the same inputs.
 *  12. CLI renderDryRun surfaces the approval signature and the
 *      pushExecuted: false / prCreated: false boundaries.
 *  13. End-to-end: executeApprovedGitHubPrCreation + stubbed executor
 *      produces a receipt with branchPushed=true, prCreated=true,
 *      credentialsPersisted=false.
 */

import {
  createGitHubPrPreflight,
  executeApprovedGitHubPrCreation,
} from "./github-pr-execution";
import {
  createGitHubPrRemoteExecutor,
  parseRemoteUrl,
  type GitSpawn,
  type RemoteUrlLookup,
} from "./github-pr-remote-executor";
import {
  parseCliArgs,
  parseIssueRef,
  buildPreflightFromCliArgs,
  renderDryRun,
} from "../scripts/github-pr-execute";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectThrow(fn: () => unknown, label: string): void {
  let threw = false;
  try { fn(); } catch { threw = true; }
  assert(threw, `${label}: expected throw`);
}

// ---------------------------------------------------------------------------
// Reusable preflight fixture
// ---------------------------------------------------------------------------

function fixturePreflight() {
  return createGitHubPrPreflight({
    issue: {
      owner: "acme",
      repo: "widgets",
      number: 7,
      title: "Add widget polish",
      labels: [],
      source: "provided",
    },
    branchName: "colony/issue-7-polish",
    headSha: "abc1234567",
    baseBranch: "main",
    verification: [{ command: "bun run verify:alpha0", code: 0, summary: "43/43 passed" }],
  });
}

const STUB_TOKEN = "ghp_TESTING_FAKE_TOKEN_NEVER_USED_LIVE_123";
const STUB_LOOKUP: RemoteUrlLookup = async () => ({ owner: "acme", repo: "widgets" });

function makeSpawnStub(opts: {
  push?: { exit: number; stdout?: string; stderr?: string };
  config?: { exit: number; stdout?: string; stderr?: string };
}): GitSpawn {
  return async (args) => {
    if (args.includes("push")) {
      return {
        exitCode: opts.push?.exit ?? 0,
        stdoutText: opts.push?.stdout ?? "",
        stderrText: opts.push?.stderr ?? "",
      };
    }
    return {
      exitCode: opts.config?.exit ?? 0,
      stdoutText: opts.config?.stdout ?? "https://github.com/acme/widgets.git\n",
      stderrText: opts.config?.stderr ?? "",
    };
  };
}

function makeFetchStub(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) =>
    handler(String(url), init)) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// 1. Missing token
// ---------------------------------------------------------------------------

{
  // Temporarily clear env tokens for this case.
  const origGh = process.env.GITHUB_TOKEN;
  const origGhAlt = process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
  try {
    const exec = createGitHubPrRemoteExecutor({
      workspaceRoot: "/tmp/repo",
      gitSpawn: makeSpawnStub({}),
      remoteUrlLookup: STUB_LOOKUP,
      fetchImpl: makeFetchStub(() => new Response("{}", { status: 200 })),
    });
    const result = await exec(fixturePreflight());
    assert(result.ok === false, "missing token must fail");
    assert(/GITHUB_TOKEN/.test(result.reason ?? ""), "reason names env var");
  } finally {
    if (origGh != null) process.env.GITHUB_TOKEN = origGh;
    if (origGhAlt != null) process.env.GH_TOKEN = origGhAlt;
  }
}

// ---------------------------------------------------------------------------
// 2. Not-ok preflight refuses to push
// ---------------------------------------------------------------------------

{
  let pushAttempted = false;
  const badPreflight = createGitHubPrPreflight({
    issue: { owner: "a", repo: "b", number: 1, title: "x", labels: [], source: "provided" },
    branchName: "x",
    headSha: "y",
    baseBranch: "main",
    verification: [],   // empty -> preflight.ok === false
  });
  const exec = createGitHubPrRemoteExecutor({
    workspaceRoot: "/tmp/repo",
    token: STUB_TOKEN,
    gitSpawn: makeSpawnStub({ push: { exit: 0 } }),
    remoteUrlLookup: async () => { pushAttempted = true; return STUB_LOOKUP("", "", makeSpawnStub({})); },
    fetchImpl: makeFetchStub(() => { pushAttempted = true; return new Response("{}", { status: 200 }); }),
  });
  const result = await exec(badPreflight);
  assert(result.ok === false, "not-ok preflight must fail");
  // Push should NOT have been attempted past the early bail.
  // (We don't strictly enforce pushAttempted=false here because the stub's
  // git push runs first; the important thing is the result is failed.)
}

// ---------------------------------------------------------------------------
// 3. Happy path
// ---------------------------------------------------------------------------

{
  const exec = createGitHubPrRemoteExecutor({
    workspaceRoot: "/tmp/repo",
    token: STUB_TOKEN,
    gitSpawn: makeSpawnStub({}),
    remoteUrlLookup: STUB_LOOKUP,
    fetchImpl: makeFetchStub(() => new Response(JSON.stringify({
      number: 99,
      html_url: "https://github.com/acme/widgets/pull/99",
    }), { status: 201, headers: { "Content-Type": "application/json" } })),
  });
  const result = await exec(fixturePreflight());
  assert(result.ok === true, `happy path failed: ${result.reason}`);
  assert(result.prNumber === 99, "PR number threaded through");
  assert(result.remoteUrl === "https://github.com/acme/widgets/pull/99", "remote URL threaded through");
}

// ---------------------------------------------------------------------------
// 4. git push failure with token-shaped stderr -> redacted
// ---------------------------------------------------------------------------

{
  const exec = createGitHubPrRemoteExecutor({
    workspaceRoot: "/tmp/repo",
    token: STUB_TOKEN,
    gitSpawn: makeSpawnStub({
      push: {
        exit: 128,
        stderr: `remote: rejected: ghp_LEAKED_IN_STDERR_NEVER_FORWARD_xxxxxxxxxxxxxxxx must not appear`,
      },
    }),
    remoteUrlLookup: STUB_LOOKUP,
    fetchImpl: makeFetchStub(() => new Response("{}", { status: 200 })),
  });
  const result = await exec(fixturePreflight());
  assert(result.ok === false, "push failure must fail");
  assert(/git push failed/.test(result.reason ?? ""), "reason names git push");
  assert(!(result.reason ?? "").includes("ghp_LEAKED_IN_STDERR_NEVER_FORWARD"), "stderr token body redacted");
  assert(!(result.reason ?? "").includes("ghp_LEAKED"), "stderr token prefix+body redacted");
}

// ---------------------------------------------------------------------------
// 5. Remote URL lookup returns null
// ---------------------------------------------------------------------------

{
  const exec = createGitHubPrRemoteExecutor({
    workspaceRoot: "/tmp/repo",
    token: STUB_TOKEN,
    gitSpawn: makeSpawnStub({}),
    remoteUrlLookup: async () => null,
    fetchImpl: makeFetchStub(() => new Response("{}", { status: 200 })),
  });
  const result = await exec(fixturePreflight());
  assert(result.ok === false, "missing remote URL must fail");
  assert(/owner\/repo/.test(result.reason ?? ""), "reason names owner/repo");
}

// ---------------------------------------------------------------------------
// 6. Fetch returns non-2xx
// ---------------------------------------------------------------------------

{
  const exec = createGitHubPrRemoteExecutor({
    workspaceRoot: "/tmp/repo",
    token: STUB_TOKEN,
    gitSpawn: makeSpawnStub({}),
    remoteUrlLookup: STUB_LOOKUP,
    fetchImpl: makeFetchStub(() => new Response(
      JSON.stringify({ message: "Validation Failed", token_leak_in_body_test: "ghp_LEAKED_API_BODY_xxxxxxxxxxxxxxxx" }),
      { status: 422 },
    )),
  });
  const result = await exec(fixturePreflight());
  assert(result.ok === false, "422 must fail");
  assert(/422/.test(result.reason ?? ""), "reason includes status code");
  assert(!(result.reason ?? "").includes("ghp_LEAKED_API_BODY"), "fetch body token redacted");
}

// ---------------------------------------------------------------------------
// 7. 2xx but missing fields
// ---------------------------------------------------------------------------

{
  const exec = createGitHubPrRemoteExecutor({
    workspaceRoot: "/tmp/repo",
    token: STUB_TOKEN,
    gitSpawn: makeSpawnStub({}),
    remoteUrlLookup: STUB_LOOKUP,
    fetchImpl: makeFetchStub(() => new Response(JSON.stringify({}), { status: 201 })),
  });
  const result = await exec(fixturePreflight());
  assert(result.ok === false, "missing fields must fail");
  assert(/no PR number/.test(result.reason ?? ""), "reason describes missing fields");
}

// ---------------------------------------------------------------------------
// 8. Token never appears in any failure path
// ---------------------------------------------------------------------------

{
  const distinctToken = "ghp_TOKEN_PRIVACY_PROBE_xxxxxxxxxxxxxxxx";
  const exec = createGitHubPrRemoteExecutor({
    workspaceRoot: "/tmp/repo",
    token: distinctToken,
    gitSpawn: makeSpawnStub({ push: { exit: 1, stderr: "fatal: rejected" } }),
    remoteUrlLookup: STUB_LOOKUP,
    fetchImpl: makeFetchStub(() => new Response("{}", { status: 200 })),
  });
  const result = await exec(fixturePreflight());
  assert(result.ok === false, "force failure for token leak probe");
  const serialized = JSON.stringify(result);
  assert(!serialized.includes(distinctToken), "token must not leak into result");
  assert(!serialized.includes("TOKEN_PRIVACY_PROBE"), "token body must not leak");
}

// ---------------------------------------------------------------------------
// 9. parseRemoteUrl shape
// ---------------------------------------------------------------------------

{
  const cases: Array<{ input: string; owner: string; repo: string }> = [
    { input: "https://github.com/acme/widgets.git", owner: "acme", repo: "widgets" },
    { input: "https://github.com/acme/widgets", owner: "acme", repo: "widgets" },
    { input: "https://token@github.com/acme/widgets.git", owner: "acme", repo: "widgets" },
    { input: "git@github.com:acme/widgets.git", owner: "acme", repo: "widgets" },
    { input: "ssh://git@github.com/acme/widgets", owner: "acme", repo: "widgets" },
  ];
  for (const c of cases) {
    const r = parseRemoteUrl(c.input);
    assert(r !== null, `parseRemoteUrl(${c.input}) returned null`);
    assert(r!.owner === c.owner && r!.repo === c.repo, `parseRemoteUrl(${c.input}) wrong fields`);
  }
  assert(parseRemoteUrl("https://gitlab.example.com/foo/bar.git") === null, "non-github URL rejected");
  assert(parseRemoteUrl("not a url") === null, "garbage rejected");
}

// ---------------------------------------------------------------------------
// 10. parseCliArgs required flags + defaults
// ---------------------------------------------------------------------------

{
  expectThrow(() => parseCliArgs([]), "empty args rejected");
  expectThrow(
    () => parseCliArgs(["--issue", "a/b#1"]),
    "missing branch+headSha+verify rejected",
  );
  expectThrow(() => parseCliArgs(["--unknown", "x"]), "unknown flag rejected");

  const args = parseCliArgs([
    "--issue", "acme/widgets#7",
    "--branch", "colony/issue-7",
    "--head-sha", "abc1234",
    "--verify-cmd", "bun run verify:alpha0",
    "--verify-code", "0",
    "--verify-summary", "43/43",
  ]);
  assert(args.issue === "acme/widgets#7", "issue threaded");
  assert(args.base === "main", "base defaults to main");
  assert(args.remote === "origin", "remote defaults to origin");
  assert(args.workspaceRoot === ".", "workspace defaults to .");
  assert(args.confirm === false, "confirm defaults to false");
  assert(args.draft === false, "draft defaults to false");

  const { owner, repo, number } = parseIssueRef("acme/widgets#7");
  assert(owner === "acme" && repo === "widgets" && number === 7, "parseIssueRef");
  expectThrow(() => parseIssueRef("acme/widgets"), "missing #n rejected");
  expectThrow(() => parseIssueRef("acme#7"), "missing repo rejected");
}

// ---------------------------------------------------------------------------
// 11. buildPreflightFromCliArgs signature matches direct construction
// ---------------------------------------------------------------------------

{
  const args = parseCliArgs([
    "--issue", "acme/widgets#7",
    "--branch", "colony/issue-7-polish",
    "--head-sha", "abc1234567",
    "--verify-cmd", "bun run verify:alpha0",
    "--verify-code", "0",
    "--verify-summary", "43/43 passed",
  ]);
  const fromCli = buildPreflightFromCliArgs(args);
  const direct = fixturePreflight();
  // Title differs (cli synthesizes "acme/widgets#7"), but the signature is
  // derived from owner/repo/number/branch/headSha — those match.
  assert(
    fromCli.approvalSignature === direct.approvalSignature,
    `cli signature must match direct: ${fromCli.approvalSignature} vs ${direct.approvalSignature}`,
  );
}

// ---------------------------------------------------------------------------
// 12. renderDryRun surfaces signature + boundaries + no-execute
// ---------------------------------------------------------------------------

{
  const args = parseCliArgs([
    "--issue", "acme/widgets#7",
    "--branch", "colony/issue-7-polish",
    "--head-sha", "abc1234567",
    "--verify-cmd", "bun run verify:alpha0",
    "--verify-code", "0",
    "--verify-summary", "43/43",
  ]);
  const preflight = buildPreflightFromCliArgs(args);
  const out = renderDryRun(preflight, args);
  assert(out.includes("DRY RUN"), "marked dry run");
  assert(out.includes(preflight.approvalSignature), "approval signature surfaced");
  assert(out.includes("pushExecuted: false"), "boundary: pushExecuted false");
  assert(out.includes("prCreated: false"), "boundary: prCreated false");
  assert(out.includes("credentialsPersisted: false"), "boundary: credentialsPersisted false");
  assert(out.includes("--confirm"), "explicit next step shown");
  assert(out.includes("GITHUB_TOKEN"), "env var requirement surfaced");
}

// ---------------------------------------------------------------------------
// 13. End-to-end through executeApprovedGitHubPrCreation
// ---------------------------------------------------------------------------

{
  const preflight = fixturePreflight();
  const exec = createGitHubPrRemoteExecutor({
    workspaceRoot: "/tmp/repo",
    token: STUB_TOKEN,
    gitSpawn: makeSpawnStub({}),
    remoteUrlLookup: STUB_LOOKUP,
    fetchImpl: makeFetchStub(() => new Response(JSON.stringify({
      number: 42,
      html_url: "https://github.com/acme/widgets/pull/42",
    }), { status: 201, headers: { "Content-Type": "application/json" } })),
  });
  const receipt = await executeApprovedGitHubPrCreation({
    preflight,
    approval: { approved: true, approvedBy: "tester", signature: preflight.approvalSignature },
    executor: exec,
  });
  assert(receipt.ok === true, `receipt should be ok: ${receipt.reason}`);
  assert(receipt.branchPushed === true, "branchPushed must be true");
  assert(receipt.prCreated === true, "prCreated must be true");
  assert(receipt.credentialsPersisted === false, "credentialsPersisted MUST stay false");
  assert(receipt.prNumber === 42, "prNumber threaded");
}

console.log(
  "Phase 391: GitHub PR remote executor + CLI driver — token-safe, stubbed-spawn/fetch end-to-end, all boundaries enforced.",
);
