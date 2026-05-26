#!/usr/bin/env bun
/**
 * Publish a GitHub Release via the REST API.
 *
 * Why exist: this project ships without the GitHub CLI as a build dependency
 * and follows the same "raw fetch, no vendor SDK" posture used by the LLM
 * providers (see Critical Rule 2 in AGENTS.md). A pure-fetch script removes
 * a manual web-UI step from the release path without adding a CLI dep or a
 * credential-persistence surface.
 *
 * Safety posture
 *
 *   - Dry-run by default. Without --confirm, the script prints exactly what
 *     it would send and exits 0 without making any network calls.
 *   - PAT is read from GITHUB_TOKEN / GH_TOKEN environment only. The script
 *     never writes the token to disk, never echoes it back, and never logs
 *     its raw value (even in error paths).
 *   - Owner/repo are inferred from `git remote get-url origin` so the
 *     script can only target the repo this checkout actually points at.
 *     An explicit --repo owner/name can override.
 *   - If a release already exists for the tag, the script refuses to
 *     proceed unless --update is supplied (then it PATCHes the existing
 *     release rather than silently creating a duplicate).
 *   - Asset upload is opt-in via --asset path and goes to the upload_url
 *     returned by the create/update response — never an asset URL guessed
 *     by the script.
 *
 * Usage
 *
 *   GITHUB_TOKEN=ghp_... bun run release:publish -- \
 *     --tag v2.0.0-alpha.0 \
 *     --title "Alpha 0 — public source+Bun alpha" \
 *     --notes docs/release/v2.0.0-alpha.0.md \
 *     --prerelease \
 *     --latest \
 *     [--asset colony] \
 *     [--repo owner/repo] \
 *     [--update] \
 *     [--confirm]
 *
 *   Without --confirm: dry-run, prints request preview, exits 0.
 *   With --confirm:    actually creates/updates the release.
 *
 * Required PAT scopes (fine-grained):  Contents: Read and write.
 * Required PAT scopes (classic):       `repo` (or just `public_repo` for
 *                                       public repositories).
 */

import { readFile } from "fs/promises";
import { resolve as resolvePath, basename } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PublishArgs {
  tag: string;
  title: string;
  notesPath: string;
  prerelease: boolean;
  latest: boolean;
  draft: boolean;
  assetPath: string | undefined;
  repoOverride: string | undefined;
  update: boolean;
  confirm: boolean;
}

export interface ReleasePayload {
  tag_name: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  make_latest: "true" | "false";
}

export interface RepoCoord {
  owner: string;
  repo: string;
}

class PublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishError";
  }
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const FLAG_DEFINITIONS = new Set([
  "--tag",
  "--title",
  "--notes",
  "--asset",
  "--repo",
  "--prerelease",
  "--latest",
  "--draft",
  "--update",
  "--confirm",
  "--help",
  "-h",
]);

export function parseArgs(argv: readonly string[]): PublishArgs {
  let tag: string | undefined;
  let title: string | undefined;
  let notesPath: string | undefined;
  let assetPath: string | undefined;
  let repoOverride: string | undefined;
  let prerelease = false;
  let latest = false;
  let draft = false;
  let update = false;
  let confirm = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--") && arg !== "-h") continue;

    if (!FLAG_DEFINITIONS.has(arg)) {
      throw new PublishError(`Unknown flag: ${arg}`);
    }

    if (arg === "--help" || arg === "-h") {
      throw new PublishError("__HELP__");
    }

    if (arg === "--prerelease") { prerelease = true; continue; }
    if (arg === "--latest")     { latest = true; continue; }
    if (arg === "--draft")      { draft = true; continue; }
    if (arg === "--update")     { update = true; continue; }
    if (arg === "--confirm")    { confirm = true; continue; }

    // Flags that take a value
    const value = argv[i + 1];
    if (value == null || value.startsWith("--")) {
      throw new PublishError(`Flag ${arg} requires a value`);
    }
    i += 1;
    switch (arg) {
      case "--tag":   tag = value; break;
      case "--title": title = value; break;
      case "--notes": notesPath = value; break;
      case "--asset": assetPath = value; break;
      case "--repo":  repoOverride = value; break;
    }
  }

  if (!tag) throw new PublishError("--tag is required (e.g. --tag v2.0.0-alpha.0)");
  if (!title) throw new PublishError("--title is required");
  if (!notesPath) throw new PublishError("--notes is required (path to a markdown file)");

  return {
    tag,
    title,
    notesPath,
    prerelease,
    latest,
    draft,
    assetPath,
    repoOverride,
    update,
    confirm,
  };
}

// ---------------------------------------------------------------------------
// Repo discovery
// ---------------------------------------------------------------------------

export function parseRepoFromRemoteUrl(url: string): RepoCoord {
  // Accept both:
  //   https://github.com/owner/repo(.git)?
  //   git@github.com:owner/repo(.git)?
  //   ssh://git@github.com/owner/repo(.git)?
  const trimmed = url.trim().replace(/\.git$/i, "");
  const httpsMatch = /^https?:\/\/(?:[^@]+@)?github\.com\/([^/]+)\/([^/]+)$/i.exec(trimmed);
  if (httpsMatch) {
    return { owner: httpsMatch[1]!, repo: httpsMatch[2]! };
  }
  const sshMatch = /^(?:ssh:\/\/)?git@github\.com[:/]([^/]+)\/([^/]+)$/i.exec(trimmed);
  if (sshMatch) {
    return { owner: sshMatch[1]!, repo: sshMatch[2]! };
  }
  throw new PublishError(`Cannot parse GitHub owner/repo from remote URL: ${url}`);
}

async function detectRepoFromGit(): Promise<RepoCoord> {
  const proc = Bun.spawn(["git", "remote", "get-url", "origin"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const exit = await proc.exited;
  if (exit !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new PublishError(
      `git remote get-url origin failed (exit ${exit}): ${stderr.trim() || "no stderr"}`,
    );
  }
  return parseRepoFromRemoteUrl(stdout);
}

export function parseRepoOverride(spec: string): RepoCoord {
  const parts = spec.split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new PublishError(`--repo must be owner/name, got: ${spec}`);
  }
  return { owner: parts[0]!, repo: parts[1]! };
}

// ---------------------------------------------------------------------------
// Payload builder
// ---------------------------------------------------------------------------

export function buildReleasePayload(args: PublishArgs, body: string): ReleasePayload {
  return {
    tag_name: args.tag,
    name: args.title,
    body,
    draft: args.draft,
    prerelease: args.prerelease,
    // GitHub's API uses string "true"/"false" here, not boolean.
    make_latest: args.latest ? "true" : "false",
  };
}

// ---------------------------------------------------------------------------
// Notes loading
// ---------------------------------------------------------------------------

export async function loadReleaseNotes(notesPath: string): Promise<string> {
  const absolute = resolvePath(notesPath);
  try {
    const text = await readFile(absolute, "utf8");
    if (text.trim().length === 0) {
      throw new PublishError(`Release notes file is empty: ${absolute}`);
    }
    return text;
  } catch (err) {
    if (err instanceof PublishError) throw err;
    throw new PublishError(
      `Cannot read release notes from ${absolute}: ${(err as Error).message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Dry-run rendering
// ---------------------------------------------------------------------------

export function renderDryRun(
  coord: RepoCoord,
  args: PublishArgs,
  payload: ReleasePayload,
  bodyPreview: string,
): string {
  const bodyLines = bodyPreview.split(/\r?\n/);
  const preview = bodyLines.slice(0, 12).join("\n");
  const truncated = bodyLines.length > 12 ? `\n... (${bodyLines.length - 12} more lines)` : "";

  return [
    "=== DRY RUN — no network call will be made ===",
    `Target:      https://api.github.com/repos/${coord.owner}/${coord.repo}/releases`,
    `Tag:         ${payload.tag_name}`,
    `Title:       ${payload.name}`,
    `Prerelease:  ${payload.prerelease}`,
    `Draft:       ${payload.draft}`,
    `Make latest: ${payload.make_latest}`,
    `Update mode: ${args.update}`,
    `Asset:       ${args.assetPath ?? "(none)"}`,
    "",
    "--- Body preview (first 12 lines) ---",
    preview,
    truncated,
    "",
    "Add --confirm to actually publish.",
  ].filter((line) => line !== "").join("\n");
}

// ---------------------------------------------------------------------------
// GitHub API client (raw fetch, no SDK)
// ---------------------------------------------------------------------------

const GITHUB_API = "https://api.github.com";

function readToken(): string {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
  if (!token) {
    throw new PublishError(
      "Missing GitHub PAT. Set GITHUB_TOKEN (or GH_TOKEN) before running with --confirm.",
    );
  }
  return token;
}

function authHeaders(token: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "colony-ts-publish-release",
  };
}

async function readApiError(resp: Response): Promise<string> {
  let detail = "";
  try {
    const text = await resp.text();
    detail = text.length > 800 ? `${text.slice(0, 800)}...` : text;
  } catch {
    detail = "(no response body)";
  }
  return `GitHub API ${resp.status} ${resp.statusText}: ${detail}`;
}

interface ReleaseRecord {
  id: number;
  upload_url: string;
  html_url: string;
  tag_name: string;
  prerelease: boolean;
  draft: boolean;
}

export async function fetchExistingRelease(
  coord: RepoCoord,
  tag: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReleaseRecord | null> {
  const url = `${GITHUB_API}/repos/${coord.owner}/${coord.repo}/releases/tags/${encodeURIComponent(tag)}`;
  const resp = await fetchImpl(url, { headers: authHeaders(token) });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new PublishError(await readApiError(resp));
  return (await resp.json()) as ReleaseRecord;
}

async function createRelease(
  coord: RepoCoord,
  payload: ReleasePayload,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReleaseRecord> {
  const url = `${GITHUB_API}/repos/${coord.owner}/${coord.repo}/releases`;
  const resp = await fetchImpl(url, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new PublishError(await readApiError(resp));
  return (await resp.json()) as ReleaseRecord;
}

async function updateRelease(
  coord: RepoCoord,
  releaseId: number,
  payload: ReleasePayload,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReleaseRecord> {
  const url = `${GITHUB_API}/repos/${coord.owner}/${coord.repo}/releases/${releaseId}`;
  const resp = await fetchImpl(url, {
    method: "PATCH",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new PublishError(await readApiError(resp));
  return (await resp.json()) as ReleaseRecord;
}

async function uploadAsset(
  release: ReleaseRecord,
  assetPath: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ html_url: string; name: string }> {
  // upload_url is templated: ".../assets{?name,label}". Strip the template.
  const cleanUrl = release.upload_url.replace(/\{\?[^}]+\}$/, "");
  const name = basename(assetPath);
  const url = `${cleanUrl}?name=${encodeURIComponent(name)}`;
  const file = Bun.file(assetPath);
  const exists = await file.exists();
  if (!exists) throw new PublishError(`Asset not found: ${assetPath}`);
  const bytes = await file.arrayBuffer();

  const resp = await fetchImpl(url, {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
    },
    body: bytes,
  });
  if (!resp.ok) throw new PublishError(await readApiError(resp));
  const json = (await resp.json()) as { browser_download_url: string; name: string };
  return { html_url: json.browser_download_url, name: json.name };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log(`Usage:
  GITHUB_TOKEN=<pat> bun run release:publish -- \\
    --tag v2.0.0-alpha.0 \\
    --title "Alpha 0 — public source+Bun alpha" \\
    --notes docs/release/v2.0.0-alpha.0.md \\
    [--prerelease] [--latest] [--draft] \\
    [--asset colony] \\
    [--repo owner/name] \\
    [--update] \\
    [--confirm]

Required PAT scopes:
  Fine-grained: Contents = Read and write
  Classic:      repo (or public_repo for public repositories)

Default behavior is DRY RUN. Add --confirm to make the API call.`);
}

async function main(): Promise<number> {
  let args: PublishArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof PublishError && err.message === "__HELP__") {
      printHelp();
      return 0;
    }
    console.error(`error: ${(err as Error).message}`);
    printHelp();
    return 2;
  }

  let coord: RepoCoord;
  try {
    coord = args.repoOverride
      ? parseRepoOverride(args.repoOverride)
      : await detectRepoFromGit();
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    return 2;
  }

  let body: string;
  try {
    body = await loadReleaseNotes(args.notesPath);
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    return 2;
  }

  const payload = buildReleasePayload(args, body);

  if (!args.confirm) {
    console.log(renderDryRun(coord, args, payload, body));
    return 0;
  }

  let token: string;
  try {
    token = readToken();
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    return 2;
  }

  try {
    const existing = await fetchExistingRelease(coord, args.tag, token);
    let release: ReleaseRecord;
    if (existing) {
      if (!args.update) {
        console.error(
          `error: a release for tag ${args.tag} already exists (id ${existing.id}, ${existing.html_url}). ` +
            `Re-run with --update to PATCH it instead of creating a duplicate.`,
        );
        return 1;
      }
      release = await updateRelease(coord, existing.id, payload, token);
      console.log(`updated: ${release.html_url}`);
    } else {
      release = await createRelease(coord, payload, token);
      console.log(`created: ${release.html_url}`);
    }

    if (args.assetPath) {
      const asset = await uploadAsset(release, args.assetPath, token);
      console.log(`asset uploaded: ${asset.name} -> ${asset.html_url}`);
    }

    return 0;
  } catch (err) {
    // PublishError messages are safe (readApiError already truncates and
    // never includes the bearer token). Generic errors are passed through.
    console.error(`error: ${(err as Error).message}`);
    return 1;
  }
}

// Only run main when executed directly (not when imported by the verifier).
if (import.meta.main) {
  const code = await main();
  process.exit(code);
}
