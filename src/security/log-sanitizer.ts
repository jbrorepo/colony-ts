/**
 * Log sanitization — scrubs secrets from console output.
 *
 * 1:1 port of colony/security/log_sanitizer.py (G8-4).
 *
 * Patches console.log/warn/error/debug/info/trace/dir to detect and redact
 * API keys, bearer tokens, passwords, and provider-specific credential
 * patterns before they reach any output.
 *
 * Supported patterns:
 *   - Anthropic keys:  sk-ant-*
 *   - OpenAI keys:     sk-proj-*, sk-* (32+ chars)
 *   - AWS keys:        AKIA* (access key IDs)
 *   - Google ADC:      ya29.* (OAuth tokens)
 *   - Groq keys:       gsk_*
 *   - Bearer tokens:   Bearer <token>
 *   - Generic:         api_key=, password=, secret=, token=
 */

// ---------------------------------------------------------------------------
// Scrub patterns — each tuple: [regex, replacement]
// ---------------------------------------------------------------------------

const SCRUB_PATTERNS: Array<[RegExp, string]> = [
  // Anthropic
  [/sk-ant-[A-Za-z0-9\-_]{10,}/g, "sk-ant-****"],
  // OpenAI (project keys and legacy keys)
  [/sk-proj-[A-Za-z0-9\-_]{20,}/g, "sk-proj-****"],
  [/sk-[A-Za-z0-9]{32,}/g, "sk-****"],
  // AWS access key ID
  [/AKIA[A-Z0-9]{16}/g, "AKIA****"],
  // Google OAuth / ADC token
  [/ya29\.[A-Za-z0-9\-_]{20,}/g, "ya29.****"],
  // Groq
  [/gsk_[A-Za-z0-9]{20,}/g, "gsk_****"],
  // Bearer tokens
  [/(Bearer\s+)[A-Za-z0-9\-_.]{20,}/gi, "$1****"],
  // Generic key=value patterns
  //
  // Left-anchored with (?<![A-Za-z]) — a negative lookbehind that excludes
  // alphabetic characters but allows underscores, hyphens, digits, and
  // start-of-string. Two reasons we use this instead of plain \b:
  //   1. Prose like "the secret to a good test is sixteen letters long" is
  //      NOT redacted (space precedes, and the 16+ char run after the
  //      keyword breaks on whitespace anyway).
  //   2. Underscore-prefixed config-shape forms like `invalid_token ghp_…`,
  //      `auth_token=…`, or `_password=…` ARE caught — `\b` would have
  //      missed these because `_` counts as a regex word character.
  // The `api_key` pattern keeps the `i` flag because `API_KEY` / `Api-Key`
  // are conventional in environment-variable form; the other three drop `i`
  // so only lowercase config-shape keys trigger. This narrowing preserves
  // the "verbatim canonical transcript" property (Critical Rule 6) while
  // restoring the embedded-keyword coverage downstream redaction surfaces
  // (gateway-daemon, etc.) rely on.
  [/(?<![A-Za-z])(api[_-]?key["'\s:=]+)[A-Za-z0-9\-_]{20,}/gi, "$1****"],
  [/(?<![A-Za-z])(password["'\s:=]+)[^\s"',;]{8,}/g, "$1****"],
  [/(?<![A-Za-z])(secret["'\s:=]+)[A-Za-z0-9\-_]{16,}/g, "$1****"],
  [/(?<![A-Za-z])(token["'\s:=]+)[A-Za-z0-9\-_.]{20,}/g, "$1****"],
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Remove known secret patterns from an arbitrary string.
 * Safe to call on any string — texts without secrets are returned unchanged.
 */
export function scrubSecrets(text: string): string {
  if (text.length < 10) return text;
  let result = text;
  for (const [pattern, replacement] of SCRUB_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Mask an API key for safe display in UI.
 *
 * @example
 *   maskApiKey("sk-ant-api03-abcdefghij")  → "sk-ant-api03-...****"
 *   maskApiKey("short")                     → "****"
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 8) return "****";
  const prefixLen = Math.min(14, Math.floor(apiKey.length / 3));
  return `${apiKey.slice(0, prefixLen)}...****`;
}

// ---------------------------------------------------------------------------
// Recursive structural scrub
// ---------------------------------------------------------------------------

const SCRUB_MAX_DEPTH = 6;
const SCRUB_MAX_NODES = 1000;

interface ScrubBudget {
  remaining: number;
  seen: WeakSet<object>;
}

function scrubValue(value: unknown, depth: number, budget: ScrubBudget): unknown {
  if (budget.remaining <= 0) return value;
  budget.remaining -= 1;

  if (typeof value === "string") return scrubSecrets(value);

  // Primitive pass-through: number, boolean, undefined, bigint, symbol, function.
  if (value === null || typeof value !== "object") return value;

  // Error: scrub message + stack on a fresh Error so original is untouched.
  if (value instanceof Error) {
    const original = value;
    const scrubbedMsg = typeof original.message === "string"
      ? scrubSecrets(original.message)
      : original.message;
    const next = new Error(scrubbedMsg);
    if (original.name && original.name !== "Error") {
      next.name = original.name;
    }
    if (typeof original.stack === "string") {
      next.stack = scrubSecrets(original.stack);
    }
    return next;
  }

  // Depth cap (after Error handling, before recursive walk).
  if (depth >= SCRUB_MAX_DEPTH) return value;

  // Cycle detection.
  if (budget.seen.has(value as object)) return value;
  budget.seen.add(value as object);

  if (Array.isArray(value)) {
    const out: unknown[] = new Array(value.length);
    for (let i = 0; i < value.length; i += 1) {
      if (budget.remaining <= 0) {
        out[i] = value[i];
        continue;
      }
      out[i] = scrubValue(value[i], depth + 1, budget);
    }
    return out;
  }

  // Plain objects only — instances of other classes (Map/Set/Date/etc.) are
  // returned as-is to avoid corrupting their shape. The user-facing console
  // formatter will render them; their string contents are not our target.
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (budget.remaining <= 0) {
      out[key] = (value as Record<string, unknown>)[key];
      continue;
    }
    out[key] = scrubValue((value as Record<string, unknown>)[key], depth + 1, budget);
  }
  return out;
}

/**
 * Recursively scrub secrets from an arbitrary value.
 *
 * Walks plain objects and arrays up to `SCRUB_MAX_DEPTH` levels and
 * `SCRUB_MAX_NODES` total visited nodes. Cycles are detected via a WeakSet
 * and short-circuit safely. Error instances are returned as a fresh Error
 * with `.message` and `.stack` scrubbed; the original is left intact.
 * Primitives (number, boolean, undefined, bigint, symbol, function, null)
 * pass through unchanged.
 */
export function scrubUnknown(value: unknown): unknown {
  const budget: ScrubBudget = {
    remaining: SCRUB_MAX_NODES,
    seen: new WeakSet<object>(),
  };
  return scrubValue(value, 0, budget);
}

// ---------------------------------------------------------------------------
// Console patching (port of Python's logging.Filter approach)
// ---------------------------------------------------------------------------

let _installed = false;

function scrubArg(arg: unknown): unknown {
  return scrubUnknown(arg);
}

/**
 * Install the secret-scrubbing filter globally (idempotent).
 *
 * Patches console.log, console.warn, console.error, console.debug,
 * console.info, console.trace, and console.dir to scrub secrets from all
 * arguments before output (strings, objects, arrays, and Errors).
 *
 * Safe to call multiple times; only installs once.
 */
export function installLogSanitizer(): void {
  if (_installed) return;

  const originalLog = console.log.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);
  const originalDebug = console.debug.bind(console);
  const originalInfo = console.info.bind(console);
  const originalTrace = console.trace.bind(console);
  const originalDir = console.dir.bind(console);

  console.log = (...args: unknown[]) =>
    originalLog(...args.map(scrubArg));
  console.warn = (...args: unknown[]) =>
    originalWarn(...args.map(scrubArg));
  console.error = (...args: unknown[]) =>
    originalError(...args.map(scrubArg));
  console.debug = (...args: unknown[]) =>
    originalDebug(...args.map(scrubArg));
  console.info = (...args: unknown[]) =>
    originalInfo(...args.map(scrubArg));
  console.trace = (...args: unknown[]) =>
    originalTrace(...args.map(scrubArg));
  // console.dir takes (item, options?). Only scrub the item; pass options through.
  console.dir = (item?: unknown, options?: unknown) =>
    originalDir(scrubArg(item), options as never);

  _installed = true;
}
