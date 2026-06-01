/**
 * GitHub PR remote executor — the injected executor implementation that
 * `executeApprovedGitHubPrCreation` (in github-pr-execution.ts) calls when
 * an approved preflight is ready to do the actual push + PR creation.
 *
 * Architecture contract (the approval seam ships in github-pr-execution.ts):
 *   - Preflight is built via createGitHubPrPreflight() from issue + verification
 *   - Operator supplies the exact approval signature
 *   - executeApprovedGitHubPrCreation() validates approval and calls the
 *     injected executor
 *   - This file PROVIDES that injected executor — but does NOT bypass the
 *     approval gate. It is a leaf component.
 *
 * Safety posture (Critical Rule 2: raw fetch, no vendor SDK; Critical Rule 3:
 * conservative approvals; Critical Rule 5: tool result externalization for
 * large outputs; Critical Rule 6: exact transcript truth):
 *
 *   - GITHUB_TOKEN is read from env only. NEVER persisted to disk, NEVER
 *     written to any log, NEVER echoed in receipt/error messages.
 *   - Raw fetch() to api.github.com — no @octokit/* dependency.
 *   - git push is executed via Bun.spawn with -c credential.helper= to
 *     suppress any credential helper that might prompt or persist. The
 *     token is passed via an extraHeader=Authorization config, NEVER via
 *     URL query string (where it could leak into git's reflog).
 *   - All command output is scrubbed via scrubSecrets + a local GitHub PAT
 *     pattern strip before being included in any error message.
 *   - Git/fetch are injectable for testability; the verifier exercises both
 *     stubs end-to-end with no real network call.
 */

import { scrubSecrets } from "./security/log-sanitizer";
import type {
  GitHubPrPreflight,
  GitHubPrExecutorResult,
} from "./github-pr-execution";

// ---------------------------------------------------------------------------
// Injection seams
// ---------------------------------------------------------------------------

export interface GitSpawnResult {
  exitCode: number;
  stdoutText: string;
  stderrText: string;
}

export type GitSpawn = (
  args: readonly string[],
  opts: { cwd: string; env: Record<string, string> },
) => Promise<GitSpawnResult>;

export interface RemoteUrlLookup {
  (cwd: string, remote: string, gitSpawn: GitSpawn): Promise<{ owner: string; repo: string } | null>;
}

export interface GitHubPrRemoteExecutorOptions {
  /** Workspace root where the branch was created. Required. */
  workspaceRoot: string;
  /** Git remote name to push to. Defaults to "origin". */
  remote?: string;
  /** PR title. Defaults to the preflight branchName when omitted. */
  prTitle?: string;
  /** PR body markdown. Defaults to a generated summary that includes verification. */
  prBody?: string;
  /**
   * Open as draft instead of ready-for-review. Defaults false. Draft PRs
   * are safer for first-attempt automation since reviewers must explicitly
   * promote them.
   */
  draft?: boolean;
  /**
   * GitHub PAT. Defaults to process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN.
   * The value is held in a local variable for the duration of the call and
   * never copied into log/receipt strings.
   */
  token?: string;
  /** Injection seam for testing. Defaults to a real Bun.spawn-backed runner. */
  gitSpawn?: GitSpawn;
  /** Injection seam for testing. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injection seam for testing. Defaults to a `git config --get` based lookup. */
  remoteUrlLookup?: RemoteUrlLookup;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an executor that conforms to executeApprovedGitHubPrCreation's
 * `executor: (preflight) => Promise<GitHubPrExecutorResult>` parameter.
 *
 * Usage:
 *   const executor = createGitHubPrRemoteExecutor({ workspaceRoot: "/repo" });
 *   const receipt = await executeApprovedGitHubPrCreation({
 *     preflight,
 *     approval: { approved: true, approvedBy: "op", signature: preflight.approvalSignature },
 *     executor,
 *   });
 *
 * The returned executor:
 *   1. Reads GITHUB_TOKEN from env (or opts.token).
 *   2. git push <remote> <branchName>:<branchName> from opts.workspaceRoot,
 *      with credential helper disabled and token injected via Authorization
 *      extraHeader.
 *   3. Resolves owner/repo from the remote's git config URL.
 *   4. POST https://api.github.com/repos/{owner}/{repo}/pulls with
 *      { title, head, base, body, draft }.
 *   5. Returns { ok, remoteUrl, prNumber } on success; { ok: false, reason }
 *      with a scrubbed reason on failure.
 */
export function createGitHubPrRemoteExecutor(
  opts: GitHubPrRemoteExecutorOptions,
): (preflight: GitHubPrPreflight) => Promise<GitHubPrExecutorResult> {
  if (!opts.workspaceRoot || typeof opts.workspaceRoot !== "string") {
    throw new Error("createGitHubPrRemoteExecutor: workspaceRoot is required");
  }
  const remote = opts.remote ?? "origin";
  const draft = opts.draft ?? false;
  const gitSpawn = opts.gitSpawn ?? defaultGitSpawn;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const lookup = opts.remoteUrlLookup ?? defaultRemoteUrlLookup;

  return async (preflight: GitHubPrPreflight): Promise<GitHubPrExecutorResult> => {
    const token = opts.token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
    if (!token) {
      return failed("GitHub PR executor requires GITHUB_TOKEN (or GH_TOKEN) in env.");
    }
    if (!preflight.ok) {
      return failed("Preflight is not ok; executor refuses to push.");
    }

    // 1. Push the branch. The Authorization extraHeader is injected via
    //    `git -c http.extraheader=...` so the token never appears in the
    //    URL (which git would echo into reflog/output).
    const pushArgs: readonly string[] = [
      "-c", "credential.helper=",
      "-c", `http.extraheader=Authorization: Bearer ${token}`,
      "push",
      remote,
      `${preflight.branchName}:${preflight.branchName}`,
    ];
    const pushResult = await gitSpawn(pushArgs, {
      cwd: opts.workspaceRoot,
      env: filteredEnv(),
    });
    if (pushResult.exitCode !== 0) {
      return failed(
        `git push failed (exit ${pushResult.exitCode}): ${redactGit(pushResult.stderrText || pushResult.stdoutText)}`,
      );
    }

    // 2. Resolve owner/repo from the remote URL.
    const coord = await lookup(opts.workspaceRoot, remote, gitSpawn);
    if (!coord) {
      return failed(`Could not resolve owner/repo from git remote '${remote}'.`);
    }

    // 3. Create the PR via REST API.
    const title = opts.prTitle?.trim() || preflight.branchName;
    const body = opts.prBody?.trim() || buildDefaultPrBody(preflight);
    const apiUrl = `https://api.github.com/repos/${coord.owner}/${coord.repo}/pulls`;
    let resp: Response;
    try {
      resp = await fetchImpl(apiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "colony-ts-github-pr-executor",
        },
        body: JSON.stringify({
          title,
          head: preflight.branchName,
          base: preflight.baseBranch,
          body,
          draft,
        }),
      });
    } catch (err) {
      return failed(`GitHub API request errored: ${redactGit((err as Error).message)}`);
    }

    if (!resp.ok) {
      let detail = "";
      try {
        const text = await resp.text();
        detail = text.length > 600 ? `${text.slice(0, 600)}…` : text;
      } catch {
        detail = "(no body)";
      }
      return failed(`GitHub API ${resp.status} ${resp.statusText}: ${redactGit(detail)}`);
    }

    let payload: { html_url?: string; number?: number };
    try {
      payload = (await resp.json()) as { html_url?: string; number?: number };
    } catch (err) {
      return failed(`Could not parse GitHub PR creation response: ${redactGit((err as Error).message)}`);
    }

    if (typeof payload.number !== "number" || typeof payload.html_url !== "string") {
      return failed("GitHub returned a 2xx response but no PR number/url; refusing to claim success.");
    }

    return {
      ok: true,
      remoteUrl: payload.html_url,
      prNumber: payload.number,
    };
  };
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const defaultGitSpawn: GitSpawn = async (args, opts) => {
  const proc = Bun.spawn(["git", ...args], {
    cwd: opts.cwd,
    env: opts.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdoutText, stderrText, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdoutText, stderrText };
};

const defaultRemoteUrlLookup: RemoteUrlLookup = async (cwd, remote, gitSpawn) => {
  const r = await gitSpawn(["config", "--get", `remote.${remote}.url`], {
    cwd,
    env: filteredEnv(),
  });
  if (r.exitCode !== 0) return null;
  const url = r.stdoutText.trim();
  return parseRemoteUrl(url);
};

/**
 * Parse a git remote URL into { owner, repo }. Accepts:
 *   - https://github.com/owner/repo(.git)?
 *   - https://token@github.com/owner/repo(.git)?
 *   - git@github.com:owner/repo(.git)?
 *   - ssh://git@github.com/owner/repo(.git)?
 *
 * Returns null for any non-github.com host.
 */
export function parseRemoteUrl(url: string): { owner: string; repo: string } | null {
  const trimmed = url.trim().replace(/\.git$/i, "");
  const https = /^https?:\/\/(?:[^@]+@)?github\.com\/([^/]+)\/([^/]+)$/i.exec(trimmed);
  if (https) return { owner: https[1]!, repo: https[2]! };
  const ssh = /^(?:ssh:\/\/)?git@github\.com[:/]([^/]+)\/([^/]+)$/i.exec(trimmed);
  if (ssh) return { owner: ssh[1]!, repo: ssh[2]! };
  return null;
}

function filteredEnv(): Record<string, string> {
  // Forward only the env vars git/ssh need. Strip everything else to
  // minimise leakage surface in case Bun.spawn inherits secrets.
  const allowed = ["PATH", "HOME", "USERPROFILE", "SSH_AUTH_SOCK", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM"];
  const out: Record<string, string> = {};
  for (const key of allowed) {
    const value = process.env[key];
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function failed(reason: string): GitHubPrExecutorResult {
  return { ok: false, reason };
}

function redactGit(text: string): string {
  return scrubSecrets(text)
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/g, "[REDACTED]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]+\b/g, "[REDACTED]")
    .replace(/(Authorization:\s*Bearer\s+)[^\s"]+/gi, "$1[REDACTED]");
}

function buildDefaultPrBody(preflight: GitHubPrPreflight): string {
  const verificationLines = preflight.verification.map((v) => {
    const status = v.code === 0 ? "✓" : "✗";
    return `- ${status} \`${v.command}\` — ${v.summary}`;
  });
  return [
    `Closes #${preflight.issue.number}.`,
    "",
    "## Verification",
    ...verificationLines,
    "",
    `Branch: \`${preflight.branchName}\` → \`${preflight.baseBranch}\``,
    `Head: \`${preflight.headSha}\``,
    "",
    "_Generated by colony-ts github-pr-remote-executor._",
  ].join("\n");
}
