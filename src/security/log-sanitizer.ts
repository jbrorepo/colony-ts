/**
 * Log sanitization — scrubs secrets from console output.
 *
 * 1:1 port of colony/security/log_sanitizer.py (G8-4).
 *
 * Patches console.log/warn/error/debug to detect and redact API keys,
 * bearer tokens, passwords, and provider-specific credential patterns
 * before they reach any output.
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
  [/(api[_-]?key["'\s:=]+)[A-Za-z0-9\-_]{20,}/gi, "$1****"],
  [/(password["'\s:=]+)[^\s"',;]{8,}/gi, "$1****"],
  [/(secret["'\s:=]+)[A-Za-z0-9\-_]{16,}/gi, "$1****"],
  [/(token["'\s:=]+)[A-Za-z0-9\-_.]{20,}/gi, "$1****"],
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
// Console patching (port of Python's logging.Filter approach)
// ---------------------------------------------------------------------------

let _installed = false;

function scrubArg(arg: unknown): unknown {
  if (typeof arg === "string") return scrubSecrets(arg);
  return arg;
}

/**
 * Install the secret-scrubbing filter globally (idempotent).
 *
 * Patches console.log, console.warn, console.error, and console.debug
 * to scrub secrets from all string arguments before output.
 *
 * Safe to call multiple times; only installs once.
 */
export function installLogSanitizer(): void {
  if (_installed) return;

  const originalLog = console.log.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);
  const originalDebug = console.debug.bind(console);

  console.log = (...args: unknown[]) =>
    originalLog(...args.map(scrubArg));
  console.warn = (...args: unknown[]) =>
    originalWarn(...args.map(scrubArg));
  console.error = (...args: unknown[]) =>
    originalError(...args.map(scrubArg));
  console.debug = (...args: unknown[]) =>
    originalDebug(...args.map(scrubArg));

  _installed = true;
}
