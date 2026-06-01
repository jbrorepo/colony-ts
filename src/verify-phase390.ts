/**
 * Phase 390 — VS Code extension MVP shape contract.
 *
 * The `vscode-extension/` sub-package is a separate deliverable that lives
 * in this repo for convenience. It must keep its surface minimal and its
 * runtime-dependency count at zero so the packaged `.vsix` stays trustable.
 *
 * This verifier asserts the static shape only — it does not spin up the
 * VS Code Extension Development Host. Behavior-level coverage is manual
 * for the MVP.
 *
 * Covered surfaces:
 *   1. `vscode-extension/package.json` exists and parses as JSON.
 *   2. `contributes.commands` contains exactly the two MVP commands by id:
 *      `colony.askAboutSelection` and `colony.newSessionInTerminal`.
 *   3. Every contributed command's `title` starts with `Colony: ` so the
 *      Command Palette grouping stays consistent.
 *   4. `engines.vscode` is set (so VS Code knows the minimum host version).
 *   5. `vscode-extension/README.md` exists and contains at least 500
 *      characters of install/usage documentation.
 *   6. The extension's `package.json` declares zero runtime `dependencies`
 *      (only `devDependencies` are allowed). This protects the security
 *      posture promised in the README.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const REPO_ROOT = join(import.meta.dir, "..");
const EXT_DIR = join(REPO_ROOT, "vscode-extension");
const PKG_PATH = join(EXT_DIR, "package.json");
const README_PATH = join(EXT_DIR, "README.md");

// ---------------------------------------------------------------------------
// 1. package.json exists and parses
// ---------------------------------------------------------------------------

assert(existsSync(PKG_PATH), `missing ${PKG_PATH}`);
const pkgRaw = readFileSync(PKG_PATH, "utf8");
let pkg: any;
try {
  pkg = JSON.parse(pkgRaw);
} catch (err) {
  throw new Error(`vscode-extension/package.json is not valid JSON: ${err}`);
}
assert(typeof pkg === "object" && pkg !== null, "package.json is not an object");

// ---------------------------------------------------------------------------
// 2. contributes.commands contains exactly the two expected ids
// ---------------------------------------------------------------------------

const contributes = pkg.contributes;
assert(
  contributes && typeof contributes === "object",
  "package.json missing `contributes`",
);
const commands = contributes.commands;
assert(Array.isArray(commands), "`contributes.commands` must be an array");
assert(
  commands.length === 2,
  `expected exactly 2 contributed commands, got ${commands.length}`,
);

const ids = commands.map((c: any) => c.command).sort();
const expectedIds = [
  "colony.askAboutSelection",
  "colony.newSessionInTerminal",
].sort();
assert(
  JSON.stringify(ids) === JSON.stringify(expectedIds),
  `unexpected command ids: ${JSON.stringify(ids)} (want ${JSON.stringify(expectedIds)})`,
);

// ---------------------------------------------------------------------------
// 3. every command title starts with "Colony: "
// ---------------------------------------------------------------------------

for (const cmd of commands) {
  assert(
    typeof cmd.title === "string",
    `command ${cmd.command} missing string title`,
  );
  assert(
    cmd.title.startsWith("Colony: "),
    `command ${cmd.command} title must start with "Colony: " (got ${JSON.stringify(cmd.title)})`,
  );
}

// ---------------------------------------------------------------------------
// 4. engines.vscode is set
// ---------------------------------------------------------------------------

const engines = pkg.engines;
assert(engines && typeof engines === "object", "package.json missing `engines`");
assert(
  typeof engines.vscode === "string" && engines.vscode.length > 0,
  "package.json missing `engines.vscode`",
);

// ---------------------------------------------------------------------------
// 5. README exists and is at least 500 characters
// ---------------------------------------------------------------------------

assert(existsSync(README_PATH), `missing ${README_PATH}`);
const readme = readFileSync(README_PATH, "utf8");
assert(
  readme.length >= 500,
  `README too short: ${readme.length} chars (need >= 500)`,
);

// ---------------------------------------------------------------------------
// 6. zero runtime dependencies — only devDependencies allowed
// ---------------------------------------------------------------------------

const runtimeDepCount =
  pkg.dependencies && typeof pkg.dependencies === "object"
    ? Object.keys(pkg.dependencies).length
    : 0;
assert(
  runtimeDepCount === 0,
  `vscode-extension must have zero runtime dependencies, got ${runtimeDepCount}: ${JSON.stringify(
    Object.keys(pkg.dependencies ?? {}),
  )}`,
);

console.log("verify:phase390 OK");
