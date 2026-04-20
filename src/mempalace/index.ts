/**
 * Mempalace — The Colony's Memory Subsystem.
 *
 * Barrel export for all mempalace modules.
 *
 * Architecture:
 *   Wings  → people/projects
 *   Rooms  → topics within wings
 *   Halls  → memory type corridors (facts, events, discoveries, preferences, advice)
 *   Tunnels → cross-wing connections (same room in different wings)
 *   Closets → AAAK-compressed summaries pointing to original content
 *   Drawers → verbatim original files
 */

// Types
export type {
  Drawer,
  WingConfig,
  HallType,
  SearchHit,
  SearchResult,
  Entity,
  Triple,
  KGResult,
  TimelineEntry,
  KGStats,
  PalaceNode,
  PalaceEdge,
  TraversalHit,
  Tunnel,
  StackStatus,
} from "./types";
export { HALL_TYPES } from "./types";

// Configuration
export { MempalaceConfig, sanitizeName, sanitizeContent } from "./config";

// Storage
export { PalaceStore } from "./store";
export type { StoreOptions } from "./store";

// Knowledge Graph
export { KnowledgeGraph } from "./knowledge-graph";

// Palace Graph (navigation)
export { buildGraph, traverse, findTunnels, graphStats } from "./palace-graph";

// Memory Layers
export { Layer0, Layer1, Layer2, Layer3, MemoryStack } from "./layers";

// AAAK Dialect
export { Dialect, createDialect } from "./dialect";
