/**
 * Circuit breaker — per-provider failure tracking with cooldown.
 *
 * 1:1 port of the CircuitBreaker from colony/llm/failover.py.
 *
 * States:
 *   - CLOSED    — normal operation
 *   - OPEN      — provider is unhealthy; calls are blocked
 *   - HALF_OPEN — cooldown expired; one probe is allowed
 */

// ---------------------------------------------------------------------------
// CircuitBreaker
// ---------------------------------------------------------------------------

export class CircuitBreaker {
  static readonly CLOSED = "closed" as const;
  static readonly OPEN = "open" as const;
  static readonly HALF_OPEN = "half_open" as const;

  readonly threshold: number;
  readonly cooldownSeconds: number;
  private _failureCount = 0;
  private _lastFailureTime = 0;
  private _state: string = CircuitBreaker.CLOSED;

  constructor(opts?: { threshold?: number; cooldownSeconds?: number }) {
    this.threshold = opts?.threshold ?? 3;
    this.cooldownSeconds = opts?.cooldownSeconds ?? 60.0;
  }

  get state(): string {
    if (this._state === CircuitBreaker.OPEN) {
      const elapsedMs = performance.now() - this._lastFailureTime;
      if (elapsedMs / 1000 >= this.cooldownSeconds) {
        this._state = CircuitBreaker.HALF_OPEN;
      }
    }
    return this._state;
  }

  get failureCount(): number {
    return this._failureCount;
  }

  isAvailable(): boolean {
    const current = this.state;
    return current === CircuitBreaker.CLOSED || current === CircuitBreaker.HALF_OPEN;
  }

  recordSuccess(): void {
    this._failureCount = 0;
    this._state = CircuitBreaker.CLOSED;
  }

  recordFailure(): void {
    this._failureCount++;
    this._lastFailureTime = performance.now();
    if (this._failureCount >= this.threshold) {
      this._state = CircuitBreaker.OPEN;
    }
  }

  reset(): void {
    this._failureCount = 0;
    this._state = CircuitBreaker.CLOSED;
    this._lastFailureTime = 0;
  }

  toDict(): Record<string, unknown> {
    return {
      state: this.state,
      failureCount: this._failureCount,
      threshold: this.threshold,
      cooldownSeconds: this.cooldownSeconds,
    };
  }
}

// ---------------------------------------------------------------------------
// FailoverEvent (audit record)
// ---------------------------------------------------------------------------

export interface FailoverEvent {
  fromProvider: string;
  fromModel: string;
  toProvider: string;
  toModel: string;
  errorType: string;
  errorMessage: string;
  timestamp: number;
}

export function createFailoverEvent(opts: Omit<FailoverEvent, "timestamp">): FailoverEvent {
  return { ...opts, timestamp: Date.now() / 1000 };
}
