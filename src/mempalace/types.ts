/**
 * Mempalace Types — shared data structures.
 *
 * Defines the Palace metaphor: Wings, Rooms, Halls, Closets, Drawers.
 */

// ---------------------------------------------------------------------------
// Core Palace Structures
// ---------------------------------------------------------------------------

/** A drawer stores verbatim content — the actual words, never summarized. */
export interface Drawer {
  id: string;
  content: string;
  wing: string;
  room: string;
  hall: string;
  sourceFile: string;
  sourceMtime?: number;
  date?: string;
  importance: number;
  emotionalWeight?: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Metadata for a wing (a person, project, or topic). */
export interface WingConfig {
  name: string;
  type: "person" | "project" | "topic" | "general";
  keywords: string[];
}

/** Standard hall types — memory type corridors. */
export const HALL_TYPES = [
  "hall_facts",       // decisions, choices locked in
  "hall_events",      // sessions, milestones, debugging
  "hall_discoveries", // breakthroughs, new insights
  "hall_preferences", // habits, likes, opinions
  "hall_advice",      // recommendations and solutions
] as const;

export type HallType = (typeof HALL_TYPES)[number];

/** Search result from the palace. */
export interface SearchHit {
  id: string;
  text: string;
  wing: string;
  room: string;
  hall?: string;
  sourceFile: string;
  similarity: number;
  distance: number;
  metadata: Record<string, unknown>;
}

/** Search result set. */
export interface SearchResult {
  query: string;
  filters: { wing?: string; room?: string };
  totalBeforeFilter: number;
  results: SearchHit[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Knowledge Graph Types
// ---------------------------------------------------------------------------

/** An entity in the knowledge graph. */
export interface Entity {
  id: string;
  name: string;
  type: string;
  properties: Record<string, unknown>;
  createdAt: string;
}

/** A relationship triple with temporal validity. */
export interface Triple {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  validFrom?: string;
  validTo?: string;
  confidence: number;
  sourceCloset?: string;
  sourceFile?: string;
  extractedAt: string;
}

/** Query result from the knowledge graph. */
export interface KGResult {
  direction: "outgoing" | "incoming";
  subject: string;
  predicate: string;
  object: string;
  validFrom?: string;
  validTo?: string;
  confidence: number;
  sourceCloset?: string;
  current: boolean;
}

/** Timeline entry. */
export interface TimelineEntry {
  subject: string;
  predicate: string;
  object: string;
  validFrom?: string;
  validTo?: string;
  current: boolean;
}

/** Knowledge graph stats. */
export interface KGStats {
  entities: number;
  triples: number;
  currentFacts: number;
  expiredFacts: number;
  relationshipTypes: string[];
}

// ---------------------------------------------------------------------------
// Palace Graph Types
// ---------------------------------------------------------------------------

/** A node in the palace navigation graph (a room). */
export interface PalaceNode {
  wings: string[];
  halls: string[];
  count: number;
  dates: string[];
}

/** An edge in the palace graph (a tunnel between wings). */
export interface PalaceEdge {
  room: string;
  wingA: string;
  wingB: string;
  hall: string;
  count: number;
}

/** Traversal result. */
export interface TraversalHit {
  room: string;
  wings: string[];
  halls: string[];
  count: number;
  hop: number;
  connectedVia?: string[];
}

/** Tunnel connecting wings through a shared room. */
export interface Tunnel {
  room: string;
  wings: string[];
  halls: string[];
  count: number;
  recent: string;
}

// ---------------------------------------------------------------------------
// Layer types
// ---------------------------------------------------------------------------

/** Memory stack status. */
export interface StackStatus {
  palacePath: string;
  l0Identity: { path: string; exists: boolean; tokens: number };
  l1Essential: { description: string };
  l2OnDemand: { description: string };
  l3DeepSearch: { description: string };
  totalDrawers: number;
}
