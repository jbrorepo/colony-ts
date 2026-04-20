/**
 * Deferred proactive forager.
 *
 * Milestone 2 must not attach background stdin listeners or idle timers. The
 * real forager will be implemented once proactive agents have cancellation,
 * audit, and budget controls.
 */

export class DeferredForagerError extends Error {
  constructor() {
    super("The proactive forager is deferred until the proactive agents milestone.");
    this.name = "DeferredForagerError";
  }
}

export class ForagerAgent {
  startWatching(_onSuggestionFound: (msg: string) => void): void {
    throw new DeferredForagerError();
  }
}

export const FORAGER_DEFERRED = true;
