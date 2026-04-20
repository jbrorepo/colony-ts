/**
 * Deferred elite-node subsystem.
 *
 * The future multi-agent caste nodes remain part of the public architecture,
 * but Milestone 2 must not expose simulated planner/builder/reviewer behavior
 * as if it were production-ready.
 */

export class DeferredSubsystemError extends Error {
  constructor(subsystem: string) {
    super(`${subsystem} is deferred until the multi-agent coordination milestone.`);
    this.name = "DeferredSubsystemError";
  }
}

export interface EliteNode {
  name: string;
  role: string;
  execute(context: string): Promise<string>;
}

abstract class DeferredEliteNode implements EliteNode {
  abstract name: string;
  abstract role: string;

  async execute(_context: string): Promise<string> {
    throw new DeferredSubsystemError(`caste/${this.name}`);
  }
}

export class VanguardNode extends DeferredEliteNode {
  name = "Vanguard";
  role = "Planner and System Architect";
}

export class ForgeNode extends DeferredEliteNode {
  name = "Forge";
  role = "Code Generator";
}

export class GuardianNode extends DeferredEliteNode {
  name = "Guardian";
  role = "Security and Quality Assurance Reviewer";
}

export const ELITE_NODES_DEFERRED = true;
