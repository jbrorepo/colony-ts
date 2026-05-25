import { buildMemoryCommandPayload } from "./gateway-control";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertRedacted(output: string, label: string): void {
  assert(!output.includes("MEMORY_SURFACE_"), `${label} redacts token metadata bodies`);
  assert(!output.includes("github_pat_"), `${label} redacts GitHub PAT prefix`);
  assert(!output.includes("ghp_"), `${label} redacts GitHub token prefix`);
  assert(!output.includes("sk-ant-"), `${label} redacts Anthropic token prefix`);
}

const lastMemoryRecall = {
  truthMode: "balanced" as const,
  truthModeSource: "inferred" as const,
  truthProvenance: [
    "query-ghp_MEMORY_SURFACE_TRUTH_SHOULD_NOT_LEAK12345678",
  ],
  sectionOrder: [
    "exact-ghp_MEMORY_SURFACE_SECTION_SHOULD_NOT_LEAK12345678",
    "palace",
  ],
  shownSections: [
    "shown-github_pat_MEMORY_SURFACE_SHOWN_SHOULD_NOT_LEAK12345678",
  ],
  hiddenSections: [
    "hidden-ghp_MEMORY_SURFACE_HIDDEN_SHOULD_NOT_LEAK12345678",
  ],
  emptySections: [
    "empty-ghp_MEMORY_SURFACE_EMPTY_SHOULD_NOT_LEAK12345678",
  ],
  noHitReason: "missed token sk-ant-MEMORY_SURFACE_NO_HIT_SHOULD_NOT_LEAK1234567890",
  exact: { shown: 1, total: 2 },
  compact: { shown: 1, total: 1 },
  structured: { shown: 1, total: 1 },
  palace: {
    direct: { shown: 1, total: 1 },
    nearby: { shown: 1, total: 1 },
    broader: { shown: 0, total: 1 },
    related: { shown: 0, total: 1 },
    hintedPath: "hall/wing-ghp_MEMORY_SURFACE_HINTED_PATH_SHOULD_NOT_LEAK12345678",
    resolvedPath: "hall/wing/github_pat_MEMORY_SURFACE_RESOLVED_PATH_SHOULD_NOT_LEAK12345678",
    path: {
      resolvedHall: "hall-ghp_MEMORY_SURFACE_HALL_SHOULD_NOT_LEAK12345678",
      resolvedWing: "wing-ghp_MEMORY_SURFACE_WING_SHOULD_NOT_LEAK12345678",
      resolvedRoom: "room-github_pat_MEMORY_SURFACE_ROOM_SHOULD_NOT_LEAK12345678",
      inferredSourceFile: "src/ghp_MEMORY_SURFACE_INFERRED_SOURCE_SHOULD_NOT_LEAK12345678.ts",
      resolvedSourceFile: "src/github_pat_MEMORY_SURFACE_RESOLVED_SOURCE_SHOULD_NOT_LEAK12345678.ts",
      hallFallback: "fallback-ghp_MEMORY_SURFACE_HALL_FALLBACK_SHOULD_NOT_LEAK12345678",
      roomFallback: "fallback-ghp_MEMORY_SURFACE_ROOM_FALLBACK_SHOULD_NOT_LEAK12345678",
      sourceFallback: "fallback-ghp_MEMORY_SURFACE_SOURCE_FALLBACK_SHOULD_NOT_LEAK12345678",
    },
    traversal: {
      directHitStage: "direct-ghp_MEMORY_SURFACE_DIRECT_SHOULD_NOT_LEAK12345678",
      nearbySeed: "nearby-ghp_MEMORY_SURFACE_NEARBY_SEED_SHOULD_NOT_LEAK12345678",
      nearbySeedVia: "via-ghp_MEMORY_SURFACE_NEARBY_VIA_SHOULD_NOT_LEAK12345678",
      broaderSeed: "broader-github_pat_MEMORY_SURFACE_BROADER_SEED_SHOULD_NOT_LEAK12345678",
      broaderSeedVia: "via-ghp_MEMORY_SURFACE_BROADER_VIA_SHOULD_NOT_LEAK12345678",
      relatedSeed: "related-ghp_MEMORY_SURFACE_RELATED_SEED_SHOULD_NOT_LEAK12345678",
      relatedHitStage: "hit-ghp_MEMORY_SURFACE_RELATED_HIT_SHOULD_NOT_LEAK12345678",
      nearbyFallback: "fallback-ghp_MEMORY_SURFACE_NEARBY_FALLBACK_SHOULD_NOT_LEAK12345678",
      broaderFallback: "fallback-ghp_MEMORY_SURFACE_BROADER_FALLBACK_SHOULD_NOT_LEAK12345678",
      relatedFallback: "fallback-ghp_MEMORY_SURFACE_RELATED_FALLBACK_SHOULD_NOT_LEAK12345678",
    },
  },
  sessionContribution: {
    total: { current: 1, archived: 2, palace: 3 },
    shown: { current: 1, archived: 1, palace: 1 },
  },
};

const status = buildMemoryCommandPayload({
  args: ["status"],
  runtime: {
    memoryTruthModeOverride: null,
    lastMemoryRecall,
  },
}).output;
assert(status.includes("Last recall: balanced (inferred:query-[REDACTED])"), "memory status redacts truth provenance");
assert(status.includes("Sections shown: shown-[REDACTED]"), "memory status redacts shown sections");
assert(status.includes("No-hit: missed token [REDACTED_SECRET]"), "memory status redacts no-hit reason");
assertRedacted(status, "memory status");

const routing = buildMemoryCommandPayload({
  args: ["routing"],
  runtime: {
    memoryTruthModeOverride: null,
    lastMemoryRecall,
  },
}).output;
assert(routing.includes("Truth source: query-[REDACTED]"), "memory routing redacts truth source");
assert(routing.includes("Section order: exact-[REDACTED]>palace"), "memory routing redacts section order");
assert(routing.includes("Hidden sections: hidden-[REDACTED]"), "memory routing redacts hidden sections");
assert(routing.includes("Empty sections: empty-[REDACTED]"), "memory routing redacts empty sections");
assertRedacted(routing, "memory routing");

const palace = buildMemoryCommandPayload({
  args: ["palace"],
  runtime: {
    memoryTruthModeOverride: null,
    lastMemoryRecall,
  },
}).output;
assert(palace.includes("Hinted path: hall/wing-[REDACTED]"), "memory palace redacts hinted path");
assert(palace.includes("Resolved path: hall/wing/[REDACTED]"), "memory palace redacts resolved path");
assert(palace.includes("Resolved hall/wing/room: hall-[REDACTED] | wing-[REDACTED] | room-[REDACTED]"), "memory palace redacts resolved route");
assert(palace.includes("Source hint/resolved: src/[REDACTED].ts | src/[REDACTED].ts"), "memory palace redacts source files");
assert(palace.includes("Traversal: direct direct-[REDACTED] | nearby nearby-[REDACTED] via via-[REDACTED] | broader broader-[REDACTED] via via-[REDACTED] | related related-[REDACTED] via hit-[REDACTED]"), "memory palace redacts traversal");
assert(palace.includes("Fallbacks: hall fallback-[REDACTED] | room fallback-[REDACTED] | source fallback-[REDACTED] | nearby fallback-[REDACTED] | broader fallback-[REDACTED] | related fallback-[REDACTED]"), "memory palace redacts fallbacks");
assertRedacted(palace, "memory palace");

console.log("Phase 381: memory recall inspection surfaces redact secret-shaped metadata.");
