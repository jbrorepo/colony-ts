/**
 * Colony Setup Wizard.
 *
 * `bun run setup` — takes a new user from clone to first conversation.
 *
 * Behavior:
 *   1. Print a banner.
 *   2. Verify Bun >= 1.3.
 *   3. Detect a local Ollama daemon, list installed models, and (if missing)
 *      print the exact `ollama pull llama3.2` command for the user to run.
 *      If Ollama is unreachable, print the platform-specific install hint
 *      and exit with a non-zero code so the user re-runs once it is up.
 *   4. Report which optional cloud-provider env vars are present, without
 *      echoing values.
 *   5. Run `bun run verify:alpha0` as a subprocess and surface any failure.
 *   6. Print "Setup complete. Next: `bun run start`" and exit 0.
 *
 * Constraints (Critical Rules 1, 2, plus this script's own contract):
 *   - Pure TypeScript, no new npm dependencies.
 *   - Raw fetch for any HTTP calls.
 *   - Read-only on the filesystem. Never writes env files, never modifies
 *     ~/.bashrc, never persists credentials.
 *   - No clever Ink rendering — plain stdout/stderr so the script works in
 *     non-TTY contexts (CI sanity checks, piping into a log file, etc.).
 *   - Idempotent: re-running from any state produces a sensible result.
 *
 * Pure helpers (`parseBunVersion`, `detectOllamaResponse`,
 * `recommendInstallCommand`, etc.) are exported so the Phase 389 verifier
 * can exercise them without making real network calls or spawning real
 * subprocesses.
 */

const OLLAMA_BASE_URL = "http://localhost:11434";
const RECOMMENDED_MODEL = "llama3.2";
const MIN_BUN_MAJOR = 1;
const MIN_BUN_MINOR = 3;

// ---------------------------------------------------------------------------
// Lightweight invariant helper (matches the pattern in src/verify-phaseN.ts).
// ---------------------------------------------------------------------------

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ---------------------------------------------------------------------------
// Bun version parsing.
// ---------------------------------------------------------------------------

export interface BunVersion {
  major: number;
  minor: number;
  patch: number;
  raw: string;
}

/**
 * Parse a Bun version string like "1.3.0" or "1.3.0-canary.20250101".
 * Throws if the string does not match a recognizable semver-major.minor.patch
 * shape — the script treats that as "we cannot prove Bun is recent enough."
 */
export function parseBunVersion(raw: string): BunVersion {
  assert(typeof raw === "string" && raw.length > 0, "bun version: empty");
  const trimmed = raw.trim();
  const match = trimmed.match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  assert(match !== null, `bun version: unrecognized shape: ${trimmed}`);
  const major = Number(match![1]);
  const minor = Number(match![2]);
  const patch = Number(match![3]);
  assert(
    Number.isFinite(major) && Number.isFinite(minor) && Number.isFinite(patch),
    `bun version: non-numeric components: ${trimmed}`,
  );
  return { major, minor, patch, raw: trimmed };
}

export function bunVersionSatisfies(version: BunVersion): boolean {
  if (version.major > MIN_BUN_MAJOR) return true;
  if (version.major < MIN_BUN_MAJOR) return false;
  return version.minor >= MIN_BUN_MINOR;
}

// ---------------------------------------------------------------------------
// Ollama response shape detection.
// ---------------------------------------------------------------------------

export interface OllamaModelSummary {
  name: string;
}

export interface OllamaDetection {
  reachable: boolean;
  version: string | null;
  models: string[];
  hasRecommendedModel: boolean;
  error: string | null;
}

/**
 * Build an OllamaDetection from a successful /api/version body plus a
 * successful /api/tags body. Pure — accepts already-parsed JSON values so
 * tests do not need to stand up a fake HTTP server.
 */
export function detectOllamaResponse(
  versionBody: unknown,
  tagsBody: unknown,
  recommendedModel: string = RECOMMENDED_MODEL,
): OllamaDetection {
  let version: string | null = null;
  if (versionBody && typeof versionBody === "object" && "version" in versionBody) {
    const v = (versionBody as { version: unknown }).version;
    if (typeof v === "string" && v.length > 0) version = v;
  }
  const models: string[] = [];
  if (tagsBody && typeof tagsBody === "object" && "models" in tagsBody) {
    const list = (tagsBody as { models: unknown }).models;
    if (Array.isArray(list)) {
      for (const entry of list) {
        if (entry && typeof entry === "object" && "name" in entry) {
          const name = (entry as { name: unknown }).name;
          if (typeof name === "string" && name.length > 0) models.push(name);
        }
      }
    }
  }
  const hasRecommendedModel = models.some((name) =>
    name === recommendedModel || name.startsWith(`${recommendedModel}:`),
  );
  return {
    reachable: version !== null,
    version,
    models,
    hasRecommendedModel,
    error: null,
  };
}

/** Build the "Ollama is unreachable" detection record. Pure. */
export function unreachableOllama(error: string): OllamaDetection {
  return {
    reachable: false,
    version: null,
    models: [],
    hasRecommendedModel: false,
    error,
  };
}

// ---------------------------------------------------------------------------
// Per-platform install hint.
// ---------------------------------------------------------------------------

export type SupportedPlatform = "darwin" | "linux" | "win32" | "other";

export interface InstallRecommendation {
  platform: SupportedPlatform;
  headline: string;
  command: string;
  url: string;
}

export function classifyPlatform(p: NodeJS.Platform | string): SupportedPlatform {
  if (p === "darwin") return "darwin";
  if (p === "linux") return "linux";
  if (p === "win32") return "win32";
  return "other";
}

/**
 * Recommend an install command for Ollama on the given platform. Pure —
 * returns a record the wizard renders to stdout.
 */
export function recommendInstallCommand(
  platform: NodeJS.Platform | string,
): InstallRecommendation {
  const kind = classifyPlatform(platform);
  switch (kind) {
    case "darwin":
      return {
        platform: kind,
        headline: "Install Ollama (macOS, Homebrew):",
        command: "brew install ollama",
        url: "https://ollama.com/download",
      };
    case "linux":
      return {
        platform: kind,
        headline: "Install Ollama (Linux):",
        command: "curl -fsSL https://ollama.com/install.sh | sh",
        url: "https://ollama.com/download/linux",
      };
    case "win32":
      return {
        platform: kind,
        headline: "Install Ollama (Windows):",
        command: "Download the installer from the URL below.",
        url: "https://ollama.com/download/windows",
      };
    default:
      return {
        platform: kind,
        headline: "Install Ollama:",
        command: "See the download page for your platform.",
        url: "https://ollama.com/download",
      };
  }
}

// ---------------------------------------------------------------------------
// Cloud provider env var detection.
// ---------------------------------------------------------------------------

export interface CloudProviderPresence {
  envLabel: string;
  provider: string;
  present: boolean;
}

const CLOUD_PROVIDER_ENVS: ReadonlyArray<{ envLabel: string; provider: string }> = [
  { envLabel: "ANTHROPIC_API_KEY", provider: "Anthropic" },
  { envLabel: "OPENAI_API_KEY", provider: "OpenAI" },
  { envLabel: "GEMINI_API_KEY", provider: "Gemini" },
];

/**
 * Report which optional cloud provider env vars are present. The actual
 * value is intentionally never returned or rendered — only presence.
 */
export function detectCloudProviders(
  env: Record<string, string | undefined>,
): CloudProviderPresence[] {
  return CLOUD_PROVIDER_ENVS.map(({ envLabel, provider }) => {
    const raw = env[envLabel];
    const present = typeof raw === "string" && raw.trim().length > 0;
    return { envLabel, provider, present };
  });
}

// ---------------------------------------------------------------------------
// Fetch helpers (raw fetch — Critical Rule 2).
// ---------------------------------------------------------------------------

type FetchImpl = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

async function fetchJsonOrNull(
  url: string,
  fetchImpl: FetchImpl,
  timeoutMs: number = 3000,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function probeOllama(
  baseUrl: string = OLLAMA_BASE_URL,
  fetchImpl: FetchImpl = fetch,
): Promise<OllamaDetection> {
  const versionBody = await fetchJsonOrNull(`${baseUrl}/api/version`, fetchImpl);
  if (versionBody === null) {
    return unreachableOllama(`could not reach ${baseUrl}/api/version`);
  }
  const tagsBody = await fetchJsonOrNull(`${baseUrl}/api/tags`, fetchImpl);
  // tagsBody may legitimately be null on a brand-new install with no models —
  // detectOllamaResponse handles that by leaving the model list empty.
  return detectOllamaResponse(versionBody, tagsBody ?? { models: [] });
}

// ---------------------------------------------------------------------------
// Subprocess: run `bun run verify:alpha0`.
// ---------------------------------------------------------------------------

export interface VerifyAlpha0Outcome {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runVerifyAlpha0(): Promise<VerifyAlpha0Outcome> {
  const proc = Bun.spawn(["bun", "run", "verify:alpha0"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

// ---------------------------------------------------------------------------
// Output helpers — plain stdout/stderr, no TTY assumptions.
// ---------------------------------------------------------------------------

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

function printErr(line: string): void {
  process.stderr.write(`${line}\n`);
}

function printBanner(): void {
  print("");
  print("================================================================");
  print("  Colony Setup Wizard — local-first agent runtime");
  print("================================================================");
  print("");
}

// ---------------------------------------------------------------------------
// Main entry point.
// ---------------------------------------------------------------------------

export async function main(): Promise<number> {
  printBanner();

  // 1. Bun version --------------------------------------------------------
  let bunVersion: BunVersion;
  try {
    bunVersion = parseBunVersion(Bun.version);
  } catch (err) {
    printErr(`[bun] could not parse Bun version: ${(err as Error).message}`);
    printErr("[bun] install Bun >= 1.3 from https://bun.sh");
    return 1;
  }
  if (!bunVersionSatisfies(bunVersion)) {
    printErr(`[bun] detected Bun ${bunVersion.raw}; need >= ${MIN_BUN_MAJOR}.${MIN_BUN_MINOR}`);
    printErr("[bun] upgrade from https://bun.sh");
    return 1;
  }
  print(`[bun] ok — version ${bunVersion.raw}`);

  // 2. Ollama -------------------------------------------------------------
  const ollama = await probeOllama();
  if (!ollama.reachable) {
    printErr(`[ollama] not reachable at ${OLLAMA_BASE_URL}`);
    const hint = recommendInstallCommand(process.platform);
    printErr(`[ollama] ${hint.headline}`);
    printErr(`[ollama]   ${hint.command}`);
    printErr(`[ollama]   ${hint.url}`);
    printErr("[ollama] then run `ollama serve` and re-run `bun run setup`.");
    return 1;
  }
  print(`[ollama] ok — version ${ollama.version}, ${ollama.models.length} model(s) installed`);
  if (ollama.models.length > 0) {
    for (const name of ollama.models) {
      print(`[ollama]   - ${name}`);
    }
  }
  if (!ollama.hasRecommendedModel) {
    print(`[ollama] recommended model "${RECOMMENDED_MODEL}" is not installed.`);
    print(`[ollama] run this in another terminal:`);
    print(`[ollama]   ollama pull ${RECOMMENDED_MODEL}`);
    print("[ollama] (setup will not pull on your behalf — the command should be explicit)");
  } else {
    print(`[ollama] recommended model "${RECOMMENDED_MODEL}" is available.`);
  }

  // 3. Cloud provider env vars -------------------------------------------
  const cloudPresence = detectCloudProviders(process.env as Record<string, string | undefined>);
  const anyCloud = cloudPresence.some((p) => p.present);
  if (anyCloud) {
    for (const entry of cloudPresence) {
      const tag = entry.present ? "present" : "absent";
      print(`[cloud] ${entry.envLabel} (${entry.provider}): ${tag}`);
    }
    print("[cloud] (values are never echoed)");
  } else {
    print("[cloud] no optional cloud provider env vars detected — local-only path is fine.");
  }

  // 4. verify:alpha0 ------------------------------------------------------
  print("[verify] running `bun run verify:alpha0` ...");
  const outcome = await runVerifyAlpha0();
  if (outcome.exitCode !== 0) {
    printErr(`[verify] FAILED with exit code ${outcome.exitCode}`);
    if (outcome.stdout.trim().length > 0) {
      printErr("[verify] --- stdout ---");
      printErr(outcome.stdout);
    }
    if (outcome.stderr.trim().length > 0) {
      printErr("[verify] --- stderr ---");
      printErr(outcome.stderr);
    }
    return outcome.exitCode === 0 ? 1 : outcome.exitCode;
  }
  print("[verify] ok — verify:alpha0 passed");

  // 5. Done ---------------------------------------------------------------
  print("");
  print("Setup complete. Next: `bun run start`");
  print("");
  return 0;
}

// Run only when invoked directly. The Phase 389 verifier imports the pure
// helpers without triggering main().
if (import.meta.main) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      printErr(`[setup] unexpected error: ${(err as Error).message}`);
      process.exit(1);
    });
}
