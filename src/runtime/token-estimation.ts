/**
 * Provider-aware token estimation with strategy cascade and caching.
 *
 * 1:1 port of colony/runtime/token_estimation.py — implements a
 * multi-strategy token estimation service:
 *   1. File-type-aware heuristic (adjusts bytes-per-token by content type)
 *   2. Character heuristic (len/4 fallback)
 *
 * Note: tiktoken/provider API strategies are not ported (Python-specific).
 * The heuristic strategies provide equivalent coverage for the foundation.
 */

import { createHash } from "crypto";
import { extname } from "path";

// ---------------------------------------------------------------------------
// Content type detection
// ---------------------------------------------------------------------------

export enum ContentType {
  PLAIN_TEXT = "plain_text",
  JSON = "json",
  CODE = "code",
  MARKDOWN = "markdown",
  XML = "xml",
  BINARY = "binary",
}

const BYTES_PER_TOKEN: Record<ContentType, number> = {
  [ContentType.PLAIN_TEXT]: 4.0,
  [ContentType.JSON]: 2.0,
  [ContentType.CODE]: 3.5,
  [ContentType.MARKDOWN]: 3.8,
  [ContentType.XML]: 2.0,
  [ContentType.BINARY]: 8.0,
};

const EXTENSION_MAP: Record<string, ContentType> = {
  ".json": ContentType.JSON,
  ".jsonl": ContentType.JSON,
  ".xml": ContentType.XML,
  ".html": ContentType.XML,
  ".htm": ContentType.XML,
  ".svg": ContentType.XML,
  ".py": ContentType.CODE,
  ".js": ContentType.CODE,
  ".ts": ContentType.CODE,
  ".tsx": ContentType.CODE,
  ".jsx": ContentType.CODE,
  ".rs": ContentType.CODE,
  ".go": ContentType.CODE,
  ".java": ContentType.CODE,
  ".c": ContentType.CODE,
  ".cpp": ContentType.CODE,
  ".h": ContentType.CODE,
  ".cs": ContentType.CODE,
  ".rb": ContentType.CODE,
  ".php": ContentType.CODE,
  ".md": ContentType.MARKDOWN,
  ".rst": ContentType.MARKDOWN,
  ".txt": ContentType.PLAIN_TEXT,
  ".log": ContentType.PLAIN_TEXT,
  ".csv": ContentType.PLAIN_TEXT,
  ".yaml": ContentType.JSON,
  ".yml": ContentType.JSON,
  ".toml": ContentType.JSON,
  ".ini": ContentType.PLAIN_TEXT,
  ".cfg": ContentType.PLAIN_TEXT,
};

export function detectContentType(text: string, filename = ""): ContentType {
  // Extension-based detection
  if (filename) {
    const ext = extname(filename.toLowerCase());
    if (ext in EXTENSION_MAP) return EXTENSION_MAP[ext];
  }

  // Content heuristic
  const stripped = text.trimStart();
  if (stripped && (stripped[0] === "{" || stripped[0] === "[")) {
    return ContentType.JSON;
  }
  if (stripped.startsWith("<?xml") || stripped.startsWith("<!DOCTYPE")) {
    return ContentType.XML;
  }
  if (stripped.startsWith("# ") || text.slice(0, 500).includes("```")) {
    return ContentType.MARKDOWN;
  }

  return ContentType.PLAIN_TEXT;
}

// ---------------------------------------------------------------------------
// Estimation strategies
// ---------------------------------------------------------------------------

export enum EstimationStrategy {
  TIKTOKEN = "tiktoken",
  ANTHROPIC_API = "anthropic_api",
  GEMINI_API = "gemini_api",
  FILE_TYPE_HEURISTIC = "file_type_heuristic",
  CHAR_HEURISTIC = "char_heuristic",
}

export interface EstimationResult {
  tokenCount: number;
  strategy: EstimationStrategy;
  isExact: boolean;
  cacheHit: boolean;
}

// ---------------------------------------------------------------------------
// LRU-style result cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  tokenCount: number;
  strategy: EstimationStrategy;
  isExact: boolean;
}

class EstimationCache {
  private _cache = new Map<string, CacheEntry>();
  private _maxSize: number;

  constructor(maxSize = 1024) {
    this._maxSize = maxSize;
  }

  private _hash(text: string): string {
    return createHash("md5").update(text).digest("hex");
  }

  get(text: string): CacheEntry | null {
    return this._cache.get(this._hash(text)) ?? null;
  }

  put(
    text: string,
    count: number,
    strategy: EstimationStrategy,
    isExact: boolean,
  ): void {
    if (this._cache.size >= this._maxSize) {
      // Evict oldest quarter
      const keys = Array.from(this._cache.keys());
      const evictCount = Math.floor(this._maxSize / 4);
      for (let i = 0; i < evictCount; i++) {
        this._cache.delete(keys[i]);
      }
    }
    this._cache.set(this._hash(text), { tokenCount: count, strategy, isExact });
  }
}

// ---------------------------------------------------------------------------
// Heuristic estimators
// ---------------------------------------------------------------------------

function countFileTypeHeuristic(text: string, contentType: ContentType): number {
  const ratio = BYTES_PER_TOKEN[contentType] ?? 4.0;
  const byteCount = Buffer.byteLength(text, "utf-8");
  return Math.max(1, Math.floor(byteCount / ratio));
}

function countCharHeuristic(text: string): number {
  return Math.max(1, Math.floor(text.length / 4));
}

// ---------------------------------------------------------------------------
// TokenEstimationService
// ---------------------------------------------------------------------------

export class TokenEstimationService {
  private _model: string;
  private _cache: EstimationCache | null;

  constructor(opts?: {
    model?: string;
    enableCache?: boolean;
    cacheMaxSize?: number;
  }) {
    this._model = opts?.model ?? "";
    this._cache =
      (opts?.enableCache ?? true)
        ? new EstimationCache(opts?.cacheMaxSize ?? 1024)
        : null;
  }

  count(
    text: string,
    opts?: { filename?: string; contentType?: ContentType },
  ): EstimationResult {
    if (!text) {
      return {
        tokenCount: 0,
        strategy: EstimationStrategy.CHAR_HEURISTIC,
        isExact: true,
        cacheHit: false,
      };
    }

    // Check cache
    if (this._cache) {
      const cached = this._cache.get(text);
      if (cached) {
        return {
          tokenCount: cached.tokenCount,
          strategy: cached.strategy,
          isExact: cached.isExact,
          cacheHit: true,
        };
      }
    }

    const filename = opts?.filename ?? "";
    const ctype =
      opts?.contentType ?? detectContentType(text, filename);

    // Strategy 1: File-type-aware heuristic
    if (ctype !== ContentType.PLAIN_TEXT || filename) {
      const count = countFileTypeHeuristic(text, ctype);
      const result: EstimationResult = {
        tokenCount: count,
        strategy: EstimationStrategy.FILE_TYPE_HEURISTIC,
        isExact: false,
        cacheHit: false,
      };
      this._cacheResult(text, result);
      return result;
    }

    // Strategy 2: Character heuristic
    const count = countCharHeuristic(text);
    const result: EstimationResult = {
      tokenCount: count,
      strategy: EstimationStrategy.CHAR_HEURISTIC,
      isExact: false,
      cacheHit: false,
    };
    this._cacheResult(text, result);
    return result;
  }

  countMessages(messages: Array<Record<string, unknown>>): number {
    let total = 0;
    for (const msg of messages) {
      const content = msg.content;
      if (typeof content === "string") {
        total += this.count(content).tokenCount;
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (typeof block === "object" && block !== null) {
            const b = block as Record<string, unknown>;
            if (typeof b.text === "string") {
              total += this.count(b.text).tokenCount;
            }
            if (typeof b.content === "string") {
              total += this.count(b.content).tokenCount;
            }
          }
        }
      }

      // Tool calls add overhead
      const toolCalls = msg.tool_calls;
      if (Array.isArray(toolCalls)) {
        for (const tc of toolCalls) {
          total += this.count(JSON.stringify(tc)).tokenCount;
        }
      }
    }
    return total;
  }

  configureForModel(model: string): void {
    this._model = model;
    if (this._cache) {
      this._cache = new EstimationCache();
    }
  }

  private _cacheResult(text: string, result: EstimationResult): void {
    if (this._cache) {
      this._cache.put(
        text,
        result.tokenCount,
        result.strategy,
        result.isExact,
      );
    }
  }
}
