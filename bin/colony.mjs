#!/usr/bin/env node
/**
 * Colony CLI entry-point shim.
 *
 * This Node.js script is the npm-publishable bin entry for `@colony/cli`.
 * It detects whether Bun is installed and delegates execution to it, since
 * The Colony requires the Bun runtime.
 *
 * For local development, use the Bun scripts directly:
 *   bun run dev          → hot-reload TUI
 *   bun run start        → production TUI
 *
 * For npm/npx users, this shim handles the Bun check and helpful messaging.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve the actual Bun entry-point relative to this shim
const entryPoint = resolve(__dirname, "../src/index.tsx");
const userArgs = process.argv.slice(2);

// ── Check for Bun ──────────────────────────────────────────────────────────

const bunProbe = spawnSync("bun", ["--version"], { stdio: "pipe" });

if (bunProbe.status === 0) {
  // Bun is available — delegate directly
  const result = spawnSync("bun", ["run", entryPoint, ...userArgs], {
    stdio: "inherit",
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

// ── Bun not found — print install instructions ─────────────────────────────

console.error(`
╔══════════════════════════════════════════════════╗
║       THE COLONY — Bun runtime is required       ║
╚══════════════════════════════════════════════════╝

The Colony requires the Bun JavaScript runtime (https://bun.sh).
Install it with one of the following commands, then retry:

  curl -fsSL https://bun.sh/install | bash   (Linux / macOS)
  npm install -g bun
  brew install bun                            (macOS / Homebrew)
  scoop install bun                           (Windows / Scoop)
  winget install Oven-sh.Bun                  (Windows / winget)

After installing Bun, run:

  npx @colony/cli
`);
process.exit(1);
