/**
 * Mempalace Configuration — env vars > config file > defaults.
 *
 * 1:1 port of mempalace/config.py.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const MAX_NAME_LENGTH = 128;
const SAFE_NAME_RE = /^(?:[^\W_]|[^\W_][\w .'-]{0,126}[^\W_])$/u;

export function sanitizeName(value: string, fieldName = "name"): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${fieldName} must be a non-empty string`);
  value = value.trim();
  if (value.length > MAX_NAME_LENGTH)
    throw new Error(`${fieldName} exceeds maximum length of ${MAX_NAME_LENGTH} characters`);
  if (value.includes("..") || value.includes("/") || value.includes("\\"))
    throw new Error(`${fieldName} contains invalid path characters`);
  if (value.includes("\0"))
    throw new Error(`${fieldName} contains null bytes`);
  if (!SAFE_NAME_RE.test(value))
    throw new Error(`${fieldName} contains invalid characters`);
  return value;
}

export function sanitizeContent(value: string, maxLength = 100_000): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error("content must be a non-empty string");
  if (value.length > maxLength)
    throw new Error(`content exceeds maximum length of ${maxLength} characters`);
  if (value.includes("\0"))
    throw new Error("content contains null bytes");
  return value;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_PALACE_PATH = join(homedir(), ".mempalace", "palace");
const DEFAULT_COLLECTION_NAME = "mempalace_drawers";

const DEFAULT_TOPIC_WINGS = [
  "emotions", "consciousness", "memory", "technical",
  "identity", "family", "creative",
];

const DEFAULT_HALL_KEYWORDS: Record<string, string[]> = {
  emotions: ["scared", "afraid", "worried", "happy", "sad", "love", "hate", "feel", "cry", "tears"],
  consciousness: ["consciousness", "conscious", "aware", "real", "genuine", "soul", "exist", "alive"],
  memory: ["memory", "remember", "forget", "recall", "archive", "palace", "store"],
  technical: ["code", "python", "script", "bug", "error", "function", "api", "database", "server"],
  identity: ["identity", "name", "who am i", "persona", "self"],
  family: ["family", "kids", "children", "daughter", "son", "parent", "mother", "father"],
  creative: ["game", "gameplay", "player", "app", "design", "art", "music", "story"],
};

// ---------------------------------------------------------------------------
// Config class
// ---------------------------------------------------------------------------

export class MempalaceConfig {
  private _configDir: string;
  private _configFile: string;
  private _peopleMapFile: string;
  private _fileConfig: Record<string, any> = {};

  constructor(configDir?: string) {
    this._configDir = configDir ?? join(homedir(), ".mempalace");
    this._configFile = join(this._configDir, "config.json");
    this._peopleMapFile = join(this._configDir, "people_map.json");

    if (existsSync(this._configFile)) {
      try {
        this._fileConfig = JSON.parse(readFileSync(this._configFile, "utf-8"));
      } catch {
        this._fileConfig = {};
      }
    }
  }

  get palacePath(): string {
    return process.env.MEMPALACE_PALACE_PATH
      ?? process.env.MEMPAL_PALACE_PATH
      ?? this._fileConfig.palace_path
      ?? DEFAULT_PALACE_PATH;
  }

  get collectionName(): string {
    return this._fileConfig.collection_name ?? DEFAULT_COLLECTION_NAME;
  }

  get peopleMap(): Record<string, string> {
    if (existsSync(this._peopleMapFile)) {
      try {
        return JSON.parse(readFileSync(this._peopleMapFile, "utf-8"));
      } catch { /* fallthrough */ }
    }
    return this._fileConfig.people_map ?? {};
  }

  get topicWings(): string[] {
    return this._fileConfig.topic_wings ?? DEFAULT_TOPIC_WINGS;
  }

  get hallKeywords(): Record<string, string[]> {
    return this._fileConfig.hall_keywords ?? DEFAULT_HALL_KEYWORDS;
  }

  get hookSilentSave(): boolean {
    return this._fileConfig.hooks?.silent_save ?? true;
  }

  get hookDesktopToast(): boolean {
    return this._fileConfig.hooks?.desktop_toast ?? false;
  }

  /** Create config directory and write default config if needed. */
  init(): string {
    mkdirSync(this._configDir, { recursive: true });
    try { chmodSync(this._configDir, 0o700); } catch { /* Windows */ }

    if (!existsSync(this._configFile)) {
      const defaultConfig = {
        palace_path: DEFAULT_PALACE_PATH,
        collection_name: DEFAULT_COLLECTION_NAME,
        topic_wings: DEFAULT_TOPIC_WINGS,
        hall_keywords: DEFAULT_HALL_KEYWORDS,
      };
      writeFileSync(this._configFile, JSON.stringify(defaultConfig, null, 2));
      try { chmodSync(this._configFile, 0o600); } catch { /* Windows */ }
    }
    return this._configFile;
  }

  /** Save a people map to disk. */
  savePeopleMap(peopleMap: Record<string, string>): string {
    mkdirSync(this._configDir, { recursive: true });
    writeFileSync(this._peopleMapFile, JSON.stringify(peopleMap, null, 2));
    return this._peopleMapFile;
  }
}
