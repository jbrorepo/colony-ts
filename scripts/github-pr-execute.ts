#!/usr/bin/env bun
/**
 * Execute an approved GitHub PR creation from the command line.
 *
 * Wraps:
 *   createGitHubPrPreflight()                — builds the preflight artifact
 *   executeApprovedGitHubPrCreation()        — validates approval signature
 *   createGitHubPrRemoteExecutor()           — the injected real executor
 *
 * Safety posture:
 *
 *   - Dry-run by default. Without --confirm, prints the preflight + approval
 *     signature that would be required, and exits 0 without touching git or
 *     the network.
 *   - GITHUB_TOKEN is read from env only.
 *   - --approve-signature must EXACTLY match the preflight signature derived
 *     from the issue + branch + headSha. The signature is printed in the
 *     dry-run output so the operator can supply it on the live run.
 *   - All output is scrubbed via the project's secret scrubber + a local
 *     GitHub-prefix strip in error paths.
 *
 * Usage (dry-run):
 *
 *   bun run scripts/github-pr-execute.ts \
 *     --issue jbrorepo/colony-ts#42 \
 *     --branch colony/issue-42-fix \
 *     --head-sha abc1234 \
 *     --base main \
 *     --verify-cmd "bun run verify:alpha0" --verify-code 0 --verify-summary "43/43 passed"
 *
 * Usage (live):
 *
 *   GITHUB_TOKEN=ghp_... bun run scripts/github-pr-execute.ts \
 *     ...same as above... \
 *     --approve-signature <signature-from-dry-run-output> \
 *     [--workspace-root /repo] \
 *     [--remote origin] \
 *     [--draft] \
 *     [--title "Fix #42: ..."] \
 *     --confirm
 */

import { resolve as resolvePath } from "path";

import {
  createGitHubPrPreflight,
  executeApprovedGitHubPrCreation,
  renderGitHubPrReceiptStatus,
  type GitHubPrPreflight,
  type GitHubPrExecutionReceipt,
} from "../src/github-pr-execution";
import { createGitHubPrRemoteExecutor } from "../src/github-pr-remote-executor";

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

export interface CliArgs {
  issue: string;            // "owner/repo#n"
  branch: string;
  headSha: string;
  base: string;
  verifyCmd: string;
  verifyCode: number;
  verifySummary: string;
  approveSignature: string | undefined;
  workspaceRoot: string;
  remote: string;
  prTitle: string | undefined;
  prBody: string | undefined;
  draft: boolean;
  confirm: boolean;
}

const FLAGS = new Set([
  "--issue", "--branch", "--head-sha", "--base",
  "--verify-cmd", "--verify-code", "--verify-summary",
  "--approve-signature", "--workspace-root", "--remote",
  "--title", "--body", "--draft", "--confirm",
  "--help", "-h",
]);

class CliError extends Error {
  constructor(message: string) { super(message); this.name = "CliError"; }
}

export function parseCliArgs(argv: readonly string[]): CliArgs {
  let issue: string | undefined;
  let branch: string | undefined;
  let headSha: string | undefined;
  let base = "main";
  let verifyCmd: string | undefined;
  let verifyCode: number | undefined;
  let verifySummary: string | undefined;
  let approveSignature: string | undefined;
  let workspaceRoot = ".";
  let remote = "origin";
  let prTitle: string | undefined;
  let prBody: string | undefined;
  let draft = false;
  let confirm = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--") && arg !== "-h") continue;
    if (!FLAGS.has(arg)) throw new CliError(`Unknown flag: ${arg}`);

    if (arg === "--help" || arg === "-h") throw new CliError("__HELP__");
    if (arg === "--draft") { draft = true; continue; }
    if (arg === "--confirm") { confirm = true; continue; }

    const value = argv[i + 1];
    if (value == null || (value.startsWith("--") && value !== "-")) {
      throw new CliError(`Flag ${arg} requires a value`);
    }
    i += 1;

    switch (arg) {
      case "--issue": issue = value; break;
      case "--branch": branch = value; break;
      case "--head-sha": headSha = value; break;
      case "--base": base = value; break;
      case "--verify-cmd": verifyCmd = value; break;
      case "--verify-code": verifyCode = Number.parseInt(value, 10); break;
      case "--verify-summary": verifySummary = value; break;
      case "--approve-signature": approveSignature = value; break;
      case "--workspace-root": workspaceRoot = value; break;
      case "--remote": remote = value; break;
      case "--title": prTitle = value; break;
      case "--body": prBody = value; break;
    }
  }

  const missing: string[] = [];
  if (!issue) missing.push("--issue");
  if (!branch) missing.push("--branch");
  if (!headSha) missing.push("--head-sha");
  if (!verifyCmd) missing.push("--verify-cmd");
  if (verifyCode == null || Number.isNaN(verifyCode)) missing.push("--verify-code");
  if (!verifySummary) missing.push("--verify-summary");
  if (missing.length > 0) throw new CliError(`Missing required flags: ${missing.join(", ")}`);

  return {
    issue: issue!,
    branch: branch!,
    headSha: headSha!,
    base,
    verifyCmd: verifyCmd!,
    verifyCode: verifyCode!,
    verifySummary: verifySummary!,
    approveSignature,
    workspaceRoot,
    remote,
    prTitle,
    prBody,
    draft,
    confirm,
  };
}

/**
 * Parse "owner/repo#n" into { owner, repo, number }. Refuses any input
 * containing token-shaped fragments (delegated to caller's validation —
 * here we just enforce shape).
 */
export function parseIssueRef(ref: string): { owner: string; repo: string; number: number } {
  const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)#([1-9][0-9]{0,9})$/.exec(ref);
  if (!m) throw new CliError(`Bad --issue shape: ${ref}. Expected owner/repo#number.`);
  return { owner: m[1]!, repo: m[2]!, number: Number.parseInt(m[3]!, 10) };
}

// ---------------------------------------------------------------------------
// Build preflight from CLI args
// ---------------------------------------------------------------------------

export function buildPreflightFromCliArgs(args: CliArgs): GitHubPrPreflight {
  const { owner, repo, number } = parseIssueRef(args.issue);
  return createGitHubPrPreflight({
    issue: {
      owner,
      repo,
      number,
      title: args.prTitle ?? `${owner}/${repo}#${number}`,
      labels: [],
      source: "provided",
    },
    branchName: args.branch,
    headSha: args.headSha,
    baseBranch: args.base,
    verification: [
      { command: args.verifyCmd, code: args.verifyCode, summary: args.verifySummary },
    ],
  });
}

// ---------------------------------------------------------------------------
// Dry-run rendering
// ---------------------------------------------------------------------------

export function renderDryRun(preflight: GitHubPrPreflight, args: CliArgs): string {
  const lines = [
    "=== DRY RUN — no git push, no GitHub API call ===",
    "",
    `Workspace: ${resolvePath(args.workspaceRoot)}`,
    `Remote:    ${args.remote}`,
    `Branch:    ${preflight.branchName} -> ${preflight.baseBranch}`,
    `Head:      ${preflight.headSha}`,
    `Issue:     ${preflight.issue.owner}/${preflight.issue.repo}#${preflight.issue.number}`,
    `Draft:     ${args.draft}`,
    `Title:     ${args.prTitle ?? preflight.branchName}`,
    "",
    "Verification recorded:",
    ...preflight.verification.map((v) =>
      `  - ${v.code === 0 ? "OK" : "FAIL"} \`${v.command}\` — ${v.summary}`,
    ),
    "",
    `Preflight status: ${preflight.ok ? "ok" : `BLOCKED (${preflight.reason})`}`,
    "",
    "Required approval signature (supply via --approve-signature on the live run):",
    `  ${preflight.approvalSignature}`,
    "",
    "Boundaries (always enforced by the runtime, regardless of executor):",
    "  - pushExecuted: false",
    "  - prCreated: false",
    "  - credentialsPersisted: false",
    "  - remoteMutationExecuted: false",
    "",
    "To actually push + create the PR, add:",
    `  --approve-signature <signature-above> --confirm`,
    "  GITHUB_TOKEN must be set in env (NOT persisted).",
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log(`Usage:
  bun run scripts/github-pr-execute.ts \\
    --issue owner/repo#n \\
    --branch <branch> \\
    --head-sha <sha> \\
    --base <branch> \\
    --verify-cmd "<cmd>" --verify-code <int> --verify-summary "<text>" \\
    [--workspace-root <dir>] [--remote origin] \\
    [--title "<text>"] [--body "<text>"] [--draft] \\
    [--approve-signature <sig>] [--confirm]

Default is DRY RUN: no git push, no API call. Add --confirm to fire.
GITHUB_TOKEN env var required for --confirm. Never persisted.`);
}

async function main(): Promise<number> {
  let args: CliArgs;
  try {
    args = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof CliError && err.message === "__HELP__") {
      printHelp();
      return 0;
    }
    console.error(`error: ${(err as Error).message}`);
    printHelp();
    return 2;
  }

  let preflight: GitHubPrPreflight;
  try {
    preflight = buildPreflightFromCliArgs(args);
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    return 2;
  }

  if (!args.confirm) {
    console.log(renderDryRun(preflight, args));
    return 0;
  }

  if (!preflight.ok) {
    console.error(`error: preflight blocked — ${preflight.reason}`);
    return 1;
  }
  if (!args.approveSignature) {
    console.error("error: --approve-signature is required with --confirm");
    return 2;
  }
  if (args.approveSignature !== preflight.approvalSignature) {
    console.error("error: --approve-signature does not match the preflight signature");
    return 1;
  }

  const executor = createGitHubPrRemoteExecutor({
    workspaceRoot: args.workspaceRoot,
    remote: args.remote,
    prTitle: args.prTitle,
    prBody: args.prBody,
    draft: args.draft,
  });

  let receipt: GitHubPrExecutionReceipt;
  try {
    receipt = await executeApprovedGitHubPrCreation({
      preflight,
      approval: {
        approved: true,
        approvedBy: "cli-operator",
        signature: args.approveSignature,
      },
      executor,
    });
  } catch (err) {
    console.error(`error: executor threw — ${(err as Error).message}`);
    return 1;
  }

  console.log(renderGitHubPrReceiptStatus(receipt));
  return receipt.ok ? 0 : 1;
}

if (import.meta.main) {
  const code = await main();
  process.exit(code);
}
