/**
 * Centralised application settings loaded from environment variables.
 *
 * 1:1 port of colony/settings.py — provides a single `settings` singleton
 * that the rest of the application imports. Every value has a safe default
 * so the app starts without a `.env` file.
 *
 * Resolution priority (highest wins):
 *   1. Environment variables (COLONY_*)
 *   2. Saved config file (~/.colony/config.json)
 *   3. Built-in defaults
 */

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function env(name: string, fallback = ""): string {
  return process.env[name] || fallback;
}

function loadSavedConfig(dataDir: string): Record<string, unknown> {
  const expanded = dataDir.startsWith("~")
    ? join(homedir(), dataDir.slice(1))
    : dataDir;
  const configPath = join(expanded, "config.json");
  if (!existsSync(configPath)) return {};
  try {
    const text = readFileSync(configPath, "utf-8");
    const data = JSON.parse(text);
    return typeof data === "object" && data !== null ? data : {};
  } catch {
    return {};
  }
}

function getObj(
  parent: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const v = parent[key];
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

// ---------------------------------------------------------------------------
// ColonySettings
// ---------------------------------------------------------------------------

export interface ColonySettings {
  // Application
  appName: string;
  appVersion: string;
  debug: boolean;

  // Persistence
  storeBackend: "memory" | "sql";
  databaseUrl: string;

  // Input limits
  maxTextLength: number;
  maxRawDataKeys: number;

  // LLM providers
  llmConfigPath: string;
  llmProvider: string;
  llmModel: string;
  llmApiBase: string;
  llmApiKey: string;

  // Server
  host: string;
  port: number;
  workers: number;

  // Data directories
  dataDir: string;

  // First-run state
  setupComplete: boolean;
}

function createSettings(): ColonySettings {
  // Resolve data_dir first — needed to load saved config
  const dataDir = env("COLONY_DATA_DIR", "~/.colony");

  // Load saved config (written by `colony init`)
  const saved = loadSavedConfig(dataDir);
  const savedLlm = getObj(saved, "llm");
  const savedServer = getObj(saved, "server");

  // Resolve the expanded data path for database URL
  const expandedDataDir = dataDir.startsWith("~")
    ? join(homedir(), dataDir.slice(1))
    : resolve(dataDir);

  const defaultDbUrl = `sqlite:///${expandedDataDir}/colony.db`;

  return {
    // Application
    appName: env("COLONY_APP_NAME", "The Colony"),
    appVersion: env("COLONY_APP_VERSION", "2.0.0"),
    debug: ["1", "true", "yes"].includes(
      env("COLONY_DEBUG", "false").toLowerCase(),
    ),

    // Persistence
    storeBackend: (env("COLONY_STORE_BACKEND", "sql") === "memory"
      ? "memory"
      : "sql") as "memory" | "sql",
    databaseUrl: env("COLONY_DATABASE_URL", defaultDbUrl),

    // Input limits
    maxTextLength: parseInt(env("COLONY_MAX_TEXT_LENGTH", "5000"), 10),
    maxRawDataKeys: parseInt(env("COLONY_MAX_RAW_DATA_KEYS", "50"), 10),

    // LLM provider configuration: env → saved config → default
    llmConfigPath:
      env("COLONY_LLM_CONFIG") ||
      (savedLlm["config_path"] as string) ||
      "",
    llmProvider:
      env("COLONY_LLM_PROVIDER") ||
      (savedLlm["provider"] as string) ||
      "ollama",
    llmModel:
      env("COLONY_LLM_MODEL") ||
      (savedLlm["model"] as string) ||
      "llama3.2",
    llmApiBase:
      env("COLONY_LLM_API_BASE") ||
      (savedLlm["api_base"] as string) ||
      "http://localhost:11434",
    llmApiKey: env("COLONY_LLM_API_KEY", ""),

    // Server: env → saved config → default
    host:
      env("COLONY_HOST") || (savedServer["host"] as string) || "0.0.0.0",
    port: parseInt(
      env("COLONY_PORT") || String(savedServer["port"] ?? 8000),
      10,
    ),
    workers: parseInt(
      env("COLONY_WORKERS") || String(savedServer["workers"] ?? 1),
      10,
    ),

    // Data directories
    dataDir,

    // First-run state
    setupComplete: (saved["setup_complete"] as boolean) ?? false,
  };
}

// ---------------------------------------------------------------------------
// Helpers on the settings object
// ---------------------------------------------------------------------------

export function getDataPath(s: ColonySettings): string {
  return s.dataDir.startsWith("~")
    ? join(homedir(), s.dataDir.slice(1))
    : resolve(s.dataDir);
}

export function isFirstRun(s: ColonySettings): boolean {
  if (s.setupComplete) return false;
  const configPath = join(getDataPath(s), "config.json");
  return !existsSync(configPath);
}

/**
 * Load API keys from ~/.colony/.env if it exists.
 * Called during app startup to pick up keys saved by `colony init`.
 */
export function loadEnvFile(s: ColonySettings): void {
  const envPath = join(getDataPath(s), ".env");
  if (!existsSync(envPath)) return;
  try {
    const text = readFileSync(envPath, "utf-8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      // Only set if not already in environment
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore read errors
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

export const settings: ColonySettings = createSettings();
