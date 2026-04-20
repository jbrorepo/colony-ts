/**
 * Application bootstrap & subsystem wiring.
 *
 * 1:1 port of colony/bootstrap.py — coordinates the startup and shutdown
 * of all colony subsystems in the correct dependency order:
 *
 *   Startup:  store → security → llm → gateway
 *   Shutdown: gateway → llm → security → store
 *
 * Each subsystem implements the Subsystem interface with init() and
 * teardown() async methods. The BootstrapCoordinator manages ordering,
 * error handling, and health aggregation.
 */

import { SubsystemState } from "./caste/enums";

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

export class BootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BootstrapError";
  }
}

// ---------------------------------------------------------------------------
// Subsystem interface
// ---------------------------------------------------------------------------

export interface Subsystem {
  /** Human-readable subsystem name. */
  readonly name: string;
  /** Whether failure should halt the bootstrap. */
  readonly critical: boolean;
  /** Initialise the subsystem. */
  init(): Promise<void>;
  /** Clean up the subsystem. */
  teardown(): Promise<void>;
  /** Return true if the subsystem is healthy. */
  healthCheck(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Subsystem status
// ---------------------------------------------------------------------------

export interface SubsystemStatus {
  name: string;
  state: SubsystemState;
  critical: boolean;
  healthy: boolean;
  initDurationMs: number;
  error: string | null;
}

function createStatus(name: string, critical: boolean): SubsystemStatus {
  return {
    name,
    state: SubsystemState.PENDING,
    critical,
    healthy: false,
    initDurationMs: 0,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// BootstrapCoordinator
// ---------------------------------------------------------------------------

export class BootstrapCoordinator {
  private _haltOnCritical: boolean;
  private _subsystems: Subsystem[] = [];
  private _statuses = new Map<string, SubsystemStatus>();
  private _booted = false;

  constructor(haltOnCritical = true) {
    this._haltOnCritical = haltOnCritical;
  }

  get booted(): boolean {
    return this._booted;
  }

  // -- Registration -------------------------------------------------------

  /**
   * Register a subsystem in boot order.
   * @throws {Error} If a subsystem with the same name is already registered.
   */
  register(subsystem: Subsystem): void {
    if (this._statuses.has(subsystem.name)) {
      throw new Error(`Subsystem already registered: ${subsystem.name}`);
    }
    this._subsystems.push(subsystem);
    this._statuses.set(
      subsystem.name,
      createStatus(subsystem.name, subsystem.critical),
    );
    console.log(
      `[bootstrap] Registered subsystem: ${subsystem.name} (critical=${subsystem.critical})`,
    );
  }

  // -- Bootstrap ----------------------------------------------------------

  /**
   * Initialise all subsystems in registration order.
   * @throws {BootstrapError} If a critical subsystem fails and haltOnCritical is true.
   */
  async boot(): Promise<Map<string, SubsystemStatus>> {
    console.log(
      `[bootstrap] Starting (${this._subsystems.length} subsystems)...`,
    );

    for (const subsystem of this._subsystems) {
      const status = this._statuses.get(subsystem.name)!;
      status.state = SubsystemState.INITIALIZING;

      const start = performance.now();
      try {
        await subsystem.init();
        const elapsed = performance.now() - start;
        status.state = SubsystemState.READY;
        status.healthy = true;
        status.initDurationMs = Math.round(elapsed * 100) / 100;
        console.log(
          `[bootstrap] Subsystem '${subsystem.name}' ready (${elapsed.toFixed(1)}ms)`,
        );
      } catch (err) {
        const elapsed = performance.now() - start;
        status.state = SubsystemState.FAILED;
        status.healthy = false;
        status.initDurationMs = Math.round(elapsed * 100) / 100;
        status.error = err instanceof Error ? err.message : String(err);
        console.error(
          `[bootstrap] Subsystem '${subsystem.name}' FAILED: ${status.error}`,
        );

        if (subsystem.critical && this._haltOnCritical) {
          throw new BootstrapError(
            `Critical subsystem '${subsystem.name}' failed: ${status.error}`,
          );
        }
      }
    }

    this._booted = true;
    console.log("[bootstrap] Bootstrap complete");
    return new Map(this._statuses);
  }

  // -- Shutdown -----------------------------------------------------------

  /** Tear down all subsystems in reverse registration order. */
  async shutdown(): Promise<Map<string, SubsystemStatus>> {
    console.log("[bootstrap] Shutdown starting...");

    const reversed = [...this._subsystems].reverse();
    for (const subsystem of reversed) {
      const status = this._statuses.get(subsystem.name)!;

      if (status.state === SubsystemState.FAILED) {
        status.state = SubsystemState.STOPPED;
        continue;
      }

      status.state = SubsystemState.SHUTTING_DOWN;
      try {
        await subsystem.teardown();
        status.state = SubsystemState.STOPPED;
        status.healthy = false;
        console.log(
          `[bootstrap] Subsystem '${subsystem.name}' stopped`,
        );
      } catch (err) {
        status.state = SubsystemState.STOPPED;
        status.error = err instanceof Error ? err.message : String(err);
        console.error(
          `[bootstrap] Subsystem '${subsystem.name}' teardown error: ${status.error}`,
        );
      }
    }

    this._booted = false;
    console.log("[bootstrap] Shutdown complete");
    return new Map(this._statuses);
  }

  // -- Health -------------------------------------------------------------

  /** Run health checks on all initialised subsystems. */
  async health(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    for (const subsystem of this._subsystems) {
      const status = this._statuses.get(subsystem.name)!;
      if (status.state !== SubsystemState.READY) {
        results.set(subsystem.name, false);
        continue;
      }
      try {
        const healthy = await subsystem.healthCheck();
        results.set(subsystem.name, healthy);
        status.healthy = healthy;
      } catch {
        results.set(subsystem.name, false);
        status.healthy = false;
      }
    }
    return results;
  }

  // -- Query --------------------------------------------------------------

  getStatus(name: string): SubsystemStatus | undefined {
    return this._statuses.get(name);
  }

  getAllStatuses(): Map<string, SubsystemStatus> {
    return new Map(this._statuses);
  }

  getSummary(): Record<string, unknown> {
    const total = this._subsystems.length;
    let ready = 0;
    let failed = 0;
    const subsystems: Record<string, string> = {};

    for (const [name, s] of this._statuses) {
      subsystems[name] = s.state;
      if (s.state === SubsystemState.READY) ready++;
      if (s.state === SubsystemState.FAILED) failed++;
    }

    return {
      booted: this._booted,
      totalSubsystems: total,
      ready,
      failed,
      subsystems,
    };
  }
}
