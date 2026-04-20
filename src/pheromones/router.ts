/**
 * Deferred pheromone router.
 *
 * Model routing is currently owned by llm/selector and failover-executor.
 * The biologically-inspired pheromone router returns no simulated responses
 * until the coordination milestone implements it for real.
 */

export type PheromoneComplexity = "scout" | "architect";

export class DeferredPheromoneRouterError extends Error {
  constructor() {
    super("Pheromone routing is deferred until the colony coordination milestone.");
    this.name = "DeferredPheromoneRouterError";
  }
}

export class PheromoneRouter {
  getBudget(): number {
    return 0;
  }

  async routeQuery(_query: string, _complexity: PheromoneComplexity): Promise<string> {
    throw new DeferredPheromoneRouterError();
  }
}

export const PHEROMONE_ROUTER_DEFERRED = true;
