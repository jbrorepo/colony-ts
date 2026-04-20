/**
 * Palace Graph - room-based navigation graph.
 *
 * 1:1 port of mempalace/palace_graph.py with async store opening so graph
 * queries do not rely on sync filesystem checks.
 */

import { PalaceStore } from "./store";
import { MempalaceConfig } from "./config";
import type { PalaceNode, PalaceEdge, TraversalHit, Tunnel } from "./types";

// ---------------------------------------------------------------------------
// Graph building
// ---------------------------------------------------------------------------

export async function buildGraph(palacePath?: string): Promise<{
  nodes: Record<string, PalaceNode>;
  edges: PalaceEdge[];
}> {
  const cfg = new MempalaceConfig();
  const path = palacePath ?? cfg.palacePath;

  let store: PalaceStore;
  try {
    store = await PalaceStore.open({ palacePath: path, create: false });
  } catch {
    return { nodes: {}, edges: [] };
  }

  try {
    const roomData = new Map<string, {
      wings: Set<string>;
      halls: Set<string>;
      count: number;
      dates: Set<string>;
    }>();

    let offset = 0;
    const batchSize = 1000;
    while (true) {
      const drawers = store.list({ limit: batchSize, offset });
      if (drawers.length === 0) break;

      for (const drawer of drawers) {
        const room = drawer.room;
        const wing = drawer.wing;
        if (!room || room === "general" || !wing) continue;

        if (!roomData.has(room)) {
          roomData.set(room, { wings: new Set(), halls: new Set(), count: 0, dates: new Set() });
        }

        const data = roomData.get(room)!;
        data.wings.add(wing);
        if (drawer.hall) data.halls.add(drawer.hall);
        if (drawer.date) data.dates.add(drawer.date);
        data.count++;
      }

      offset += drawers.length;
      if (drawers.length < batchSize) break;
    }

    const edges: PalaceEdge[] = [];
    for (const [room, data] of roomData) {
      const wings = [...data.wings].sort();
      if (wings.length < 2) continue;

      for (let left = 0; left < wings.length; left++) {
        for (let right = left + 1; right < wings.length; right++) {
          for (const hall of data.halls) {
            edges.push({
              room,
              wingA: wings[left],
              wingB: wings[right],
              hall,
              count: data.count,
            });
          }
        }
      }
    }

    const nodes: Record<string, PalaceNode> = {};
    for (const [room, data] of roomData) {
      nodes[room] = {
        wings: [...data.wings].sort(),
        halls: [...data.halls].sort(),
        count: data.count,
        dates: [...data.dates].sort().slice(-5),
      };
    }

    return { nodes, edges };
  } finally {
    store.close();
  }
}

// ---------------------------------------------------------------------------
// Traversal - BFS walk from a starting room
// ---------------------------------------------------------------------------

export async function traverse(
  startRoom: string,
  palacePath?: string,
  maxHops = 2,
): Promise<TraversalHit[] | { error: string; suggestions: string[] }> {
  const { nodes } = await buildGraph(palacePath);

  if (!(startRoom in nodes)) {
    return {
      error: `Room '${startRoom}' not found`,
      suggestions: fuzzyMatch(startRoom, nodes),
    };
  }

  const start = nodes[startRoom];
  const visited = new Set<string>([startRoom]);
  const results: TraversalHit[] = [{
    room: startRoom,
    wings: start.wings,
    halls: start.halls,
    count: start.count,
    hop: 0,
  }];

  const frontier: Array<[string, number]> = [[startRoom, 0]];
  while (frontier.length > 0) {
    const [currentRoom, depth] = frontier.shift()!;
    if (depth >= maxHops) continue;

    const current = nodes[currentRoom];
    if (!current) continue;
    const currentWings = new Set(current.wings);

    for (const [room, data] of Object.entries(nodes)) {
      if (visited.has(room)) continue;
      const sharedWings = data.wings.filter((wing) => currentWings.has(wing));
      if (sharedWings.length === 0) continue;

      visited.add(room);
      results.push({
        room,
        wings: data.wings,
        halls: data.halls,
        count: data.count,
        hop: depth + 1,
        connectedVia: sharedWings.sort(),
      });
      if (depth + 1 < maxHops) frontier.push([room, depth + 1]);
    }
  }

  results.sort((left, right) => left.hop - right.hop || right.count - left.count);
  return results.slice(0, 50);
}

// ---------------------------------------------------------------------------
// Find tunnels - rooms that connect wings
// ---------------------------------------------------------------------------

export async function findTunnels(
  wingA?: string,
  wingB?: string,
  palacePath?: string,
): Promise<Tunnel[]> {
  const { nodes } = await buildGraph(palacePath);

  const tunnels: Tunnel[] = [];
  for (const [room, data] of Object.entries(nodes)) {
    if (data.wings.length < 2) continue;
    if (wingA && !data.wings.includes(wingA)) continue;
    if (wingB && !data.wings.includes(wingB)) continue;

    tunnels.push({
      room,
      wings: data.wings,
      halls: data.halls,
      count: data.count,
      recent: data.dates[data.dates.length - 1] ?? "",
    });
  }

  tunnels.sort((left, right) => right.count - left.count);
  return tunnels.slice(0, 50);
}

// ---------------------------------------------------------------------------
// Graph stats
// ---------------------------------------------------------------------------

export async function graphStats(palacePath?: string): Promise<{
  totalRooms: number;
  tunnelRooms: number;
  totalEdges: number;
  roomsPerWing: Record<string, number>;
  topTunnels: { room: string; wings: string[]; count: number }[];
}> {
  const { nodes, edges } = await buildGraph(palacePath);

  const tunnelRooms = Object.values(nodes).filter((node) => node.wings.length >= 2).length;
  const wingCounts: Record<string, number> = {};
  for (const data of Object.values(nodes)) {
    for (const wing of data.wings) {
      wingCounts[wing] = (wingCounts[wing] ?? 0) + 1;
    }
  }

  const topTunnels = Object.entries(nodes)
    .filter(([, data]) => data.wings.length >= 2)
    .sort((left, right) => right[1].wings.length - left[1].wings.length)
    .slice(0, 10)
    .map(([room, data]) => ({ room, wings: data.wings, count: data.count }));

  return {
    totalRooms: Object.keys(nodes).length,
    tunnelRooms,
    totalEdges: edges.length,
    roomsPerWing: wingCounts,
    topTunnels,
  };
}

// ---------------------------------------------------------------------------
// Fuzzy match helper
// ---------------------------------------------------------------------------

function fuzzyMatch(query: string, nodes: Record<string, PalaceNode>, n = 5): string[] {
  const lowered = query.toLowerCase();
  const scored: Array<[string, number]> = [];

  for (const room of Object.keys(nodes)) {
    if (lowered === room) scored.push([room, 2.0]);
    else if (room.includes(lowered)) scored.push([room, 1.0]);
    else if (lowered.split("-").some((word) => room.includes(word))) scored.push([room, 0.5]);
  }

  scored.sort((left, right) => right[1] - left[1]);
  return scored.slice(0, n).map(([room]) => room);
}
