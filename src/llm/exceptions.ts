/**
 * Colony-specific LLM error hierarchy.
 *
 * 1:1 port of colony/llm/exceptions.py — all provider implementations
 * translate vendor-specific exceptions into this hierarchy so callers
 * can handle errors uniformly.
 *
 * Error categories:
 *   - LLMConnectionError — provider unreachable (network/DNS/timeout)
 *   - LLMRateLimitError  — provider returned 429 or equivalent
 *   - LLMResponseError   — non-retryable error (400, 401, etc.)
 *   - LLMConfigError     — bad configuration (missing keys, invalid config)
 */

export class LLMError extends Error {
  readonly provider: string;
  readonly model: string;

  constructor(message: string, opts?: { provider?: string; model?: string }) {
    super(message);
    this.name = "LLMError";
    this.provider = opts?.provider ?? "";
    this.model = opts?.model ?? "";
  }
}

/** Provider is unreachable (retryable / failover-eligible). */
export class LLMConnectionError extends LLMError {
  constructor(message: string, opts?: { provider?: string; model?: string }) {
    super(message, opts);
    this.name = "LLMConnectionError";
  }
}

/** Provider returned a rate-limit response (retryable / failover-eligible). */
export class LLMRateLimitError extends LLMError {
  readonly retryAfter: number | null;

  constructor(
    message: string,
    opts?: { provider?: string; model?: string; retryAfter?: number },
  ) {
    super(message, opts);
    this.name = "LLMRateLimitError";
    this.retryAfter = opts?.retryAfter ?? null;
  }
}

/** Provider returned a non-retryable error (no failover). */
export class LLMResponseError extends LLMError {
  readonly statusCode: number | null;

  constructor(
    message: string,
    opts?: { provider?: string; model?: string; statusCode?: number },
  ) {
    super(message, opts);
    this.name = "LLMResponseError";
    this.statusCode = opts?.statusCode ?? null;
  }
}

/** Configuration error (missing API key, invalid YAML, unknown provider). */
export class LLMConfigError extends LLMError {
  constructor(message: string, opts?: { provider?: string; model?: string }) {
    super(message, opts);
    this.name = "LLMConfigError";
  }
}
