/**
 * Memory runtime coordinator.
 *
 * Composes conversation logging with auto-memory extraction and builds the
 * compact memory block that gets injected into prompts.
 */

import { createHash } from "crypto";
import { join } from "path";

import { MemoryArtifactStore, createMemoryArtifact, type MemoryArtifact } from "./artifact-store";
import {
  HybridMemory,
  inferConversationRolePreference,
  inferMemorySessionScopePreference,
  inferMemoryTimePreference,
  type MemoryTruthMode,
} from "./hybrid-memory";
import { MemoryStack } from "../mempalace/layers";
import { findTunnels, traverse } from "../mempalace/palace-graph";
import { PalaceStore } from "../mempalace/store";
import type { Drawer, HallType, SearchHit, TraversalHit } from "../mempalace/types";
import type { SerializedMessage } from "../runtime/message";
import type { AgentSession } from "../runtime/session";
import { getDataPath, settings } from "../settings";
import { AutoMemoryService, MemoryStore, type MemoryEntry } from "./auto-memory";
import { ConversationLogger, type LoggedTurnRecord } from "./conversation-log";
import { ExtractedMemoryStore, MemoryExtractor, type StoredExtractedMemory } from "./extractor";
import { hasAdviceIntent, hasComparisonIntent, hasConstraintIntent, hasDecisionIntent, hasDiagnosticIntent, hasDiscoveryIntent, hasEntityIntent, hasEventIntent, hasFactIntent, hasMetricIntent, hasOwnershipIntent, hasPatternIntent, hasPreferenceIntent, hasProcedureIntent, hasReasoningIntent, hasRiskIntent } from "./query-intent";

export interface ColonyMemoryServiceOptions {
  dataDir?: string;
  mempalacePath?: string;
  mempalaceIdentityPath?: string;
}

export interface BuildMemoryContextOptions {
  truthMode?: MemoryTruthMode;
  topK?: number;
}

export type MemoryRecallSectionState = "empty" | "full" | "truncated";

export interface MemoryRecallCountSnapshot {
  total: number;
  shown: number;
  hidden: number;
  state: MemoryRecallSectionState;
}

export interface MemoryRecallSessionContributionSnapshot {
  current: number;
  archived: number;
  palace: number;
}

export interface MemoryRecallPalacePathSnapshot {
  inferredHall?: HallType;
  inferredWing?: string;
  inferredRoom?: string;
  inferredSourceFile?: string;
  resolvedHall?: HallType;
  resolvedWing?: string;
  resolvedRoom?: string;
  resolvedSourceFile?: string;
  roomInference?: "query" | "source_hint" | "resolved_hit";
  sourceHintScope?: "wing" | "global";
  hallFallback?: `${HallType}->${HallType}` | "unknown";
  roomFallback?: string;
  sourceFallback?: string;
}

export interface MemoryRecallPalaceTraversalSnapshot {
  directHitStage?: string;
  directMissStage?: string;
  nearbySeed?: string;
  nearbyFallback?: string;
  nearbyHitStage?: string;
  nearbyUnavailable?: "no-room";
  nearbySeedVia?: "query" | "source_hint" | "hit";
  broaderSeed?: string;
  broaderFallback?: string;
  broaderHitStage?: string;
  broaderUnavailable?: "no-room";
  broaderSeedVia?: "direct" | "nearby";
  relatedSeed?: string;
  relatedFallback?: string;
  relatedHitStage?: string;
  relatedMissStage?: string;
  relatedUnavailable?: "no-wing";
}

export interface MemoryRecallDiagnosticsSnapshot {
  truthMode: MemoryTruthMode;
  truthModeSource: "explicit" | "inferred";
  truthProvenance: string[];
  sectionOrder: string[];
  sectionState: Record<string, MemoryRecallSectionState>;
  shownSections: string[];
  emptySections: string[];
  hiddenSections: string[];
  noHitReason?: string;
  exact: MemoryRecallCountSnapshot;
  compact: MemoryRecallCountSnapshot;
  structured: MemoryRecallCountSnapshot;
  palace: {
    direct: MemoryRecallCountSnapshot;
    nearby: MemoryRecallCountSnapshot;
    broader: MemoryRecallCountSnapshot;
    related: MemoryRecallCountSnapshot;
    total: MemoryRecallCountSnapshot;
    hintedPath?: string;
    resolvedPath?: string;
    path: MemoryRecallPalacePathSnapshot;
    traversal: MemoryRecallPalaceTraversalSnapshot;
  };
  sessionContribution: {
    total: MemoryRecallSessionContributionSnapshot;
    shown: MemoryRecallSessionContributionSnapshot;
  };
}

export interface MemoryContextBuildResult {
  prompt: string;
  diagnostics: MemoryRecallDiagnosticsSnapshot;
}

export interface MemoryRealSessionRecallQaCase {
  id: string;
  query: string;
  truthMode?: MemoryTruthMode;
  requiredText?: string[];
  forbiddenText?: string[];
  expectedTextOrder?: Array<{ before: string; after: string }>;
  expectedTruthMode?: MemoryTruthMode;
  expectedIntentTags?: string[];
  expectedShownSections?: string[];
  expectedPalace?: Partial<MemoryRecallPalacePathSnapshot>;
}

export interface MemoryRealSessionRecallTextEvidence {
  label: string;
  textHash: string;
  present: boolean;
}

export interface MemoryRealSessionRecallOrderEvidence {
  beforeHash: string;
  afterHash: string;
  beforeIndex: number;
  afterIndex: number;
  satisfied: boolean;
}

export interface MemoryRealSessionRecallQaResult {
  id: string;
  queryHash: string;
  passed: boolean;
  failures: string[];
  truthMode: MemoryTruthMode;
  truthModeSource: "explicit" | "inferred";
  truthProvenance: string[];
  intentTags: string[];
  sectionOrder: string[];
  shownSections: string[];
  routingNotePresent: boolean;
  counts: {
    exact: MemoryRecallCountSnapshot;
    compact: MemoryRecallCountSnapshot;
    structured: MemoryRecallCountSnapshot;
    palace: MemoryRecallDiagnosticsSnapshot["palace"];
  };
  palace: MemoryRecallDiagnosticsSnapshot["palace"];
  requiredText: MemoryRealSessionRecallTextEvidence[];
  forbiddenText: MemoryRealSessionRecallTextEvidence[];
  textOrder: MemoryRealSessionRecallOrderEvidence[];
}

interface PalaceRecallDiagnostics {
  inferredHall?: HallType;
  inferredWing?: string;
  inferredRoom?: string;
  inferredSourceFile?: string;
  resolvedHall?: HallType;
  resolvedWing?: string;
  resolvedRoom?: string;
  roomInference?: "query" | "source_hint" | "resolved_hit";
  sourceHintScope?: "wing" | "global";
  hallFallback?: `${HallType}->${HallType}` | "unknown";
  roomFallback?: string;
  sourceFallback?: string;
  directHitStage?: string;
  directMissStage?: string;
  relatedSeed?: string;
  relatedFallback?: string;
  relatedHitStage?: string;
  relatedMissStage?: string;
  nearbySeed?: string;
  nearbyFallback?: string;
  nearbyHitStage?: string;
  nearbyUnavailable?: "no-room";
  nearbySeedVia?: "query" | "source_hint" | "hit";
  broaderSeed?: string;
  broaderFallback?: string;
  broaderHitStage?: string;
  broaderUnavailable?: "no-room";
  broaderSeedVia?: "direct" | "nearby";
  relatedUnavailable?: "no-wing";
}

function inferPalaceRoomSeedSource(
  diagnostics: Pick<PalaceRecallDiagnostics, "inferredRoom" | "resolvedRoom" | "roomInference">,
): "query" | "source_hint" | "hit" | undefined {
  if (!diagnostics.resolvedRoom) return undefined;
  if (diagnostics.inferredRoom && diagnostics.resolvedRoom !== diagnostics.inferredRoom) return "hit";
  if (diagnostics.roomInference === "query") return "query";
  if (diagnostics.roomInference === "source_hint") return "source_hint";
  if (diagnostics.roomInference === "resolved_hit") return "hit";
  return "hit";
}

function inferResolvedPalacePathProvenance(
  diagnostics: Pick<PalaceRecallDiagnostics, "inferredHall" | "inferredWing" | "inferredRoom" | "resolvedHall" | "resolvedWing" | "roomInference" | "resolvedRoom" | "hallFallback">,
): string {
  const parts: string[] = [];
  if (diagnostics.resolvedWing) {
    parts.push(`wing=${diagnostics.inferredWing ? "inferred" : "hit"}`);
  }
  if (diagnostics.resolvedRoom) {
    const roomSource = diagnostics.inferredRoom && diagnostics.resolvedRoom !== diagnostics.inferredRoom
      ? "hit"
      : diagnostics.roomInference === "query"
      ? "query"
      : diagnostics.roomInference === "source_hint"
        ? "source_hint"
        : diagnostics.roomInference === "resolved_hit"
          ? "hit"
          : "hit";
    parts.push(`room=${roomSource}`);
  }
  if (diagnostics.resolvedHall) {
    const hallSource = diagnostics.hallFallback
      ? "fallback"
      : diagnostics.inferredHall
        ? "inferred"
        : "hit";
    parts.push(`hall=${hallSource}`);
  }
  return parts.join(",") || "default";
}

function inferMempalaceRelatedProvenance(
  query: string,
  session: Pick<AgentSession, "tenantScope" | "metadata">,
  diagnostics: Pick<PalaceRecallDiagnostics, "inferredWing" | "resolvedWing">,
): string[] {
  const lower = query.toLowerCase();
  const signals: string[] = [];
  if (lower.includes("related")) signals.push("related");
  if (lower.includes("cross")) signals.push("cross");
  if (lower.includes("similar")) signals.push("similar");
  if (diagnostics.inferredWing) {
    signals.push(`${inferMempalaceWingProvenance(query, session).join("+") || "default"}-wing`);
  } else if (diagnostics.resolvedWing) {
    signals.push("resolved-wing");
  }
  return signals.length > 0 ? [...new Set(signals)] : ["default"];
}

export class ColonyMemoryService {
  readonly conversationLogger: ConversationLogger;
  readonly autoMemory: AutoMemoryService;
  readonly artifactStore: MemoryArtifactStore;
  readonly hybridMemory: HybridMemory;
  readonly extractedMemoryStore: ExtractedMemoryStore;
  readonly memoryExtractor: MemoryExtractor;
  readonly mempalace: MemoryStack;
  private readonly _mempalacePath?: string;
  private readonly _loggedKeys = new Map<string, Set<string>>();

  constructor(opts: ColonyMemoryServiceOptions = {}) {
    const dataDir = opts.dataDir ?? getDataPath(settings);
    const memoryDir = join(dataDir, "memories");
    const conversationDir = join(dataDir, "conversations");

    this.conversationLogger = new ConversationLogger(conversationDir);
    this.artifactStore = new MemoryArtifactStore(join(dataDir, "memory-artifacts"));
    this.autoMemory = new AutoMemoryService({
      store: new MemoryStore(memoryDir),
    });
    this.hybridMemory = new HybridMemory({
      conversationLogger: this.conversationLogger,
      artifactStore: this.artifactStore,
    });
    this.extractedMemoryStore = new ExtractedMemoryStore(join(dataDir, "memory-extracts"));
    this.memoryExtractor = new MemoryExtractor();
    this.mempalace = new MemoryStack(opts.mempalacePath, opts.mempalaceIdentityPath);
    this._mempalacePath = opts.mempalacePath;
  }

  async syncSession(session: AgentSession): Promise<LoggedTurnRecord[]> {
    return this._logMessages(session.sessionId, session.history);
  }

  primeSession(session: AgentSession): void {
    void session;
  }

  async buildMemoryContext(
    query: string,
    session: AgentSession,
    opts: BuildMemoryContextOptions = {},
  ): Promise<string> {
    const result = await this.buildMemoryContextResult(query, session, opts);
    return result.prompt;
  }

  async buildMemoryContextResult(
    query: string,
    session: AgentSession,
    opts: BuildMemoryContextOptions = {},
  ): Promise<MemoryContextBuildResult> {
    await this.syncSession(session);
    const explicitTruthMode = opts.truthMode;
    const truthMode = explicitTruthMode ?? inferMemoryTruthMode(query);
    const truthProvenance = explicitTruthMode ? ["explicit"] : inferMemoryTruthProvenance(query);
    const exactAndDerived = await this.hybridMemory.recall(query, {
      sessionId: session.sessionId,
      topK: opts.topK ?? 6,
      truthMode,
    });
    const palaceRecall = await this._recallPalace(query, session, opts.topK ?? 6, truthMode);
    const distilled = await this.autoMemory.surfaceRelevant({
      query,
      sessionId: session.sessionId,
      caste: String(session.caste),
    });
    const structured = await this.extractedMemoryStore.surfaceRelevant({
      query,
      sessionId: session.sessionId,
      agentId: session.agentId,
      caste: String(session.caste),
      limit: 6,
    });
    return formatMemoryContext(
      exactAndDerived,
      palaceRecall.direct,
      palaceRecall.nearby,
      palaceRecall.broader,
      palaceRecall.related,
      palaceRecall.diagnostics,
      distilled,
      structured,
      truthMode,
      truthProvenance,
      query,
      session,
      session.sessionId,
      explicitTruthMode ? "explicit" : "inferred",
    );
  }

  async captureSession(session: AgentSession): Promise<{
    loggedCount: number;
    extracted: MemoryEntry[];
    structured: StoredExtractedMemory[];
    artifact: MemoryArtifact | null;
  }> {
    const loggedRecords = await this.syncSession(session);
    const transcriptPath = this.conversationLogger.storageDir
      ? join(this.conversationLogger.storageDir, `${session.sessionId}.jsonl`)
      : "";
    const meaningfulTurns = loggedRecords.filter((record) => record.role !== "system");
    const artifact = await this._persistArtifact({
      sessionId: session.sessionId,
      transcriptPath,
      turns: meaningfulTurns,
      metadata: {
        agentId: session.agentId,
        caste: String(session.caste),
      },
    });

    if (meaningfulTurns.length === 0) {
      return { loggedCount: loggedRecords.length, extracted: [], structured: [], artifact };
    }

    const extracted = await this.autoMemory.extractMemories(
      meaningfulTurns.map(loggedRecordToMessageShape),
      session.agentId,
      String(session.caste),
      session.sessionId,
    );
    const structured = await this._extractStructuredMemories(
      meaningfulTurns.map(loggedRecordToMessageShape),
      session.sessionId,
      session.agentId,
      String(session.caste),
    );

    return { loggedCount: loggedRecords.length, extracted, structured, artifact };
  }

  async captureCompaction(input: {
    sessionId: string;
    agentId: string;
    caste: string;
    compactedMessages: SerializedMessage[];
    strategy: string;
    triggerSource: string;
    summary: string;
  }): Promise<{
    loggedCount: number;
    structured: StoredExtractedMemory[];
    artifact: MemoryArtifact | null;
  }> {
    const loggedRecords = await this._logMessages(input.sessionId, input.compactedMessages);
    const transcriptPath = this.conversationLogger.storageDir
      ? join(this.conversationLogger.storageDir, `${input.sessionId}.jsonl`)
      : "";
    const meaningfulTurns = loggedRecords.filter((record) => record.role !== "system");
    const artifact = await this._persistArtifact({
      sessionId: input.sessionId,
      transcriptPath,
      turns: meaningfulTurns,
      metadata: {
        agentId: input.agentId,
        caste: input.caste,
        source: "compaction_handoff",
        compactionStrategy: input.strategy,
        compactionTrigger: input.triggerSource,
        compactionSummary: input.summary,
      },
    });
    const structured = await this._extractStructuredMemories(
      meaningfulTurns.map(loggedRecordToMessageShape),
      input.sessionId,
      input.agentId,
      input.caste,
    );
    return { loggedCount: loggedRecords.length, structured, artifact };
  }

  private async _knownLoggedKeys(sessionId: string): Promise<Set<string>> {
    const known = this._loggedKeys.get(sessionId);
    if (known) return known;
    const loaded = await this.conversationLogger.listLoggedSourceKeys(sessionId);
    this._loggedKeys.set(sessionId, loaded);
    return loaded;
  }

  private async _logMessages(
    sessionId: string,
    messages: SerializedMessage[],
  ): Promise<LoggedTurnRecord[]> {
    const knownKeys = await this._knownLoggedKeys(sessionId);
    const records: LoggedTurnRecord[] = [];

    for (const [index, message] of messages.entries()) {
      const sourceMessageKey = historyMessageKey(message, index);
      if (knownKeys.has(sourceMessageKey)) continue;
      const record = mapHistoryMessage(message, sourceMessageKey);
      records.push(await this.conversationLogger.logTurn(
        sessionId,
        record.role,
        record.content,
        record.metadata,
      ));
      knownKeys.add(sourceMessageKey);
    }

    this._loggedKeys.set(sessionId, knownKeys);
    return records;
  }

  private async _persistArtifact(input: {
    sessionId: string;
    transcriptPath: string;
    turns: LoggedTurnRecord[];
    metadata: Record<string, unknown>;
  }): Promise<MemoryArtifact | null> {
    const artifact = createMemoryArtifact(input);
    if (artifact) {
      await this.artifactStore.appendArtifact(artifact);
    }
    return artifact;
  }

  private async _extractStructuredMemories(
    messages: Record<string, unknown>[],
    sessionId: string,
    agentId: string,
    caste: string,
  ): Promise<StoredExtractedMemory[]> {
    const extracted = await this.memoryExtractor.extract(messages, agentId);
    return this.extractedMemoryStore.save(sessionId, caste, extracted);
  }

  private async _recallPalace(
    query: string,
    session: AgentSession,
    topK: number,
    truthMode: MemoryTruthMode,
  ): Promise<{ direct: SearchHit[]; nearby: SearchHit[]; broader: SearchHit[]; related: SearchHit[]; diagnostics: PalaceRecallDiagnostics }> {
    if (truthMode === "derived_only") {
      return {
        direct: [],
        nearby: [],
        broader: [],
        related: [],
        diagnostics: {},
      };
    }
    const hall = inferMempalaceHall(query);
    const wing = inferMempalaceWing(query, session);
    const roomCandidates = wing ? await this._listWingRooms(wing) : await this._listGlobalRooms();
    const explicitRoom = inferMempalaceRoom(query, roomCandidates);
    const hintedRoom = explicitRoom
      ? undefined
      : (wing ? await this._inferRoomFromSourceHints(query, wing, roomCandidates) : undefined);
    const room = explicitRoom ?? hintedRoom;
    const sourceFile = wing
      ? await this._inferSourceFileHint(query, wing, room, hall)
      : await this._inferGlobalSourceFileHint(query, hall);
    const nResults = Math.max(1, Math.min(topK, 4));
    let direct: SearchHit[] = [];
    let directHitStage: string | undefined;
    let directMissStage: string | undefined;
    const tryDirect = async (
      stage: string,
      opts: {
        wing?: string;
        room?: string;
        hall?: HallType;
        sourceFile?: string;
      },
    ): Promise<void> => {
      if (direct.length > 0) return;
      directMissStage = stage;
      const hits = await this.mempalace.l3.searchRaw(query, {
        ...opts,
        nResults,
      });
      if (hits.length > 0) {
        direct = hits;
        directHitStage = stage;
      }
    };
    await tryDirect("strict", {
      wing,
      room,
      hall,
      sourceFile,
    });
    if (sourceFile) {
      await tryDirect("drop-source", {
        wing,
        room,
        hall,
      });
    }
    if (wing && room) {
      await tryDirect("drop-room", {
        wing,
        hall,
        sourceFile,
      });
    }
    if (sourceFile && wing && room) {
      await tryDirect("drop-room-drop-source", {
        wing,
        hall,
      });
    }
    if (hall === "hall_advice") {
      await tryDirect("hall-fallback", {
        wing,
        room,
        hall: "hall_facts",
        sourceFile,
      });
    }
    if (sourceFile && hall === "hall_advice") {
      await tryDirect("hall-fallback-drop-source", {
        wing,
        room,
        hall: "hall_facts",
      });
    }
    if (hall === "hall_advice" && wing && room) {
      await tryDirect("hall-fallback-drop-room", {
        wing,
        hall: "hall_facts",
        sourceFile,
      });
    }
    if (sourceFile && hall === "hall_advice" && wing && room) {
      await tryDirect("hall-fallback-drop-room-drop-source", {
        wing,
        hall: "hall_facts",
      });
    }
    if (hall) {
      await tryDirect("drop-hall", {
        wing,
        room,
        hall: undefined,
        sourceFile,
      });
    }
    if (sourceFile && hall) {
      await tryDirect("drop-hall-drop-source", {
        wing,
        room,
        hall: undefined,
      });
    }
    if (wing && room) {
      await tryDirect("drop-room-drop-hall", {
        wing,
        hall: undefined,
        sourceFile,
      });
    }
    if (sourceFile && wing && room) {
      await tryDirect("drop-room-drop-hall-drop-source", {
        wing,
        hall: undefined,
      });
    }
    direct = rerankSearchHits(query, direct, hall)
      .slice(0, Math.max(1, Math.min(topK, 4)))
      .map((hit) => directHitStage ? withRecallProvenance(hit, { stage: directHitStage }) : hit);
    const resolvedHall = normalizeHallType(direct[0]?.hall) ?? hall;
    const resolvedWing = direct[0]?.wing ?? wing;
    const resolvedRoom = direct[0]?.room ?? room;
    const nearbyRecall = resolvedWing && shouldExpandMempalaceContext(query)
      ? await this._recallPalaceNearby(query, resolvedWing, resolvedRoom, resolvedHall, direct, topK)
      : { hits: [], seed: undefined };
    const nearby = nearbyRecall.hits;
    const broaderRecall = shouldBroadenMempalaceTraversal(query)
      ? await this._recallPalaceBroader(query, resolvedRoom, resolvedHall, direct, nearby, topK)
      : { hits: [], seed: undefined };
    const broader = broaderRecall.hits;
    const relatedRecall = resolvedWing
      ? await this._recallPalaceRelated(query, resolvedWing, resolvedRoom, resolvedHall, direct, nearby, topK)
      : { hits: [], seed: undefined };
    const related = relatedRecall.hits;
    const relatedSeedRoom = extractPalaceRelatedSeedRoom(relatedRecall.seed);
    const broaderSeedRoom = extractPalaceRelatedSeedRoom(broaderRecall.seed);
    return {
      direct,
      nearby,
      broader,
      related,
      diagnostics: {
        inferredHall: hall,
        inferredWing: wing,
        inferredRoom: room,
        inferredSourceFile: sourceFile,
        resolvedHall,
        resolvedWing,
        resolvedRoom,
        roomInference: explicitRoom
          ? "query"
          : (hintedRoom ? "source_hint" : (resolvedRoom && !room ? "resolved_hit" : undefined)),
        sourceHintScope: sourceFile
          ? (wing ? "wing" : "global")
          : undefined,
        hallFallback: hall && resolvedHall && hall !== resolvedHall
          ? `${hall}->${resolvedHall}`
          : undefined,
        roomFallback: room && resolvedRoom && room !== resolvedRoom
          ? `${room}->${resolvedRoom}`
          : undefined,
        sourceFallback: sourceFile && direct[0]?.sourceFile && sourceFile !== direct[0].sourceFile
          ? `${sourceFile}->${direct[0].sourceFile}`
          : undefined,
        directHitStage,
        directMissStage: direct.length === 0 ? directMissStage : undefined,
        relatedSeed: relatedRecall.seed,
        relatedFallback: resolvedRoom && relatedSeedRoom && resolvedRoom !== relatedSeedRoom
          ? `${resolvedRoom}->${relatedSeedRoom}`
          : undefined,
        relatedHitStage: typeof relatedRecall.hits[0]?.metadata?.recallStage === "string"
          ? relatedRecall.hits[0].metadata.recallStage
          : undefined,
        relatedMissStage: relatedRecall.hits.length === 0 ? relatedRecall.missStage : undefined,
        nearbySeed: nearbyRecall.seed,
        nearbyFallback: room && nearbyRecall.seed && room !== nearbyRecall.seed
          ? `${room}->${nearbyRecall.seed}`
          : undefined,
        nearbyHitStage: typeof nearbyRecall.hits[0]?.metadata?.recallStage === "string"
          ? nearbyRecall.hits[0].metadata.recallStage
          : undefined,
        nearbyUnavailable: !resolvedRoom ? "no-room" : undefined,
        nearbySeedVia: nearbyRecall.seed ? inferPalaceRoomSeedSource({
          inferredRoom: room,
          resolvedRoom,
          roomInference: explicitRoom
            ? "query"
            : (hintedRoom ? "source_hint" : (resolvedRoom && !room ? "resolved_hit" : undefined)),
        }) : undefined,
        broaderSeed: broaderRecall.seed,
        broaderFallback: resolvedRoom && broaderSeedRoom && resolvedRoom !== broaderSeedRoom
          ? `${resolvedRoom}->${broaderSeedRoom}`
          : undefined,
        broaderHitStage: typeof broaderRecall.hits[0]?.metadata?.recallStage === "string"
          ? broaderRecall.hits[0].metadata.recallStage
          : undefined,
        broaderUnavailable: !resolvedRoom ? "no-room" : undefined,
        broaderSeedVia: broaderRecall.seedVia,
        relatedUnavailable: !resolvedWing ? "no-wing" : undefined,
      },
    };
  }

  private async _inferSourceFileHint(
    query: string,
    wing: string,
    room: string | undefined,
    hall: HallType | undefined,
  ): Promise<string | undefined> {
    for (const candidateHall of sourceHintHallCandidates(hall)) {
      const drawers = room
        ? await this._listRoomDrawers(wing, room, candidateHall, 8)
        : await this._listWingDrawers(wing, candidateHall, 16);
      const sourceFile = selectSourceFileHint(query, drawers);
      if (sourceFile) return sourceFile;
    }
    return undefined;
  }

  private async _inferRoomFromSourceHints(
    query: string,
    wing: string,
    roomCandidates: string[],
  ): Promise<string | undefined> {
    if (roomCandidates.length === 0) return undefined;
    const scored = new Map<string, number>();
    for (const room of roomCandidates.slice(0, 8)) {
      const drawers = await this._listRoomDrawers(wing, room, undefined, 6);
      const bestScore = drawers.reduce((best, drawer) => Math.max(best, scoreSourceHint(query, drawer.sourceFile)), 0);
      if (bestScore > 0) {
        scored.set(room, bestScore);
      }
    }
    if (scored.size === 0) return undefined;

    const ranked = [...scored.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
    const [bestRoom, bestScore] = ranked[0] ?? [];
    const secondScore = ranked[1]?.[1] ?? 0;
    if (!bestRoom) return undefined;
    if (bestScore < 0.3) return undefined;
    if (bestScore - secondScore < 0.15) return undefined;
    return bestRoom;
  }

  private async _recallPalaceNearby(
    query: string,
    wing: string,
    startRoom: string | undefined,
    hall: HallType | undefined,
    direct: SearchHit[],
    topK: number,
  ): Promise<{ hits: SearchHit[]; seed?: string }> {
    if (!startRoom) return { hits: [] };
    const walked = await traverse(startRoom, this._mempalacePath, 1);
    if (!Array.isArray(walked)) return { hits: [], seed: startRoom };

    const roomCandidates = walked
      .filter((hit): hit is TraversalHit => hit.hop === 1 && hit.wings.includes(wing))
      .map((hit) => hit.room)
      .filter((room) => room !== startRoom)
      .slice(0, 2);

    if (roomCandidates.length === 0) return { hits: [], seed: startRoom };

    const directIds = new Set(direct.map((hit) => hit.id));
    const nearby: SearchHit[] = [];
    const preferredHall = normalizeHallType(direct[0]?.hall) ?? hall;
    for (const room of roomCandidates) {
      const sourceFile = await this._inferSourceFileHint(query, wing, room, preferredHall);
      const matchingDrawers = preferredHall
        ? await this._listRoomDrawers(wing, room, preferredHall, 2, sourceFile)
        : [];
      const fallbackMatchingDrawers = sourceFile && preferredHall && matchingDrawers.length === 0
        ? await this._listRoomDrawers(wing, room, preferredHall, 2)
        : [];
      const fallbackDrawers = await this._listRoomDrawers(wing, room, undefined, 3, sourceFile);
      const unfocusedFallbackDrawers = sourceFile && fallbackDrawers.length === 0
        ? await this._listRoomDrawers(wing, room, undefined, 3)
        : [];
      const stagedDrawers = [
        ...matchingDrawers.map((drawer) => ({ drawer, stage: "strict" })),
        ...fallbackMatchingDrawers.map((drawer) => ({ drawer, stage: "drop-source" })),
        ...fallbackDrawers.map((drawer) => ({ drawer, stage: "drop-hall" })),
        ...unfocusedFallbackDrawers.map((drawer) => ({ drawer, stage: "drop-hall-drop-source" })),
      ];
      for (const { drawer, stage } of stagedDrawers) {
        if (directIds.has(drawer.id)) continue;
        if (nearby.some((existing) => existing.id === drawer.id)) continue;
        nearby.push(withRecallProvenance(
          drawerToRankedSearchHit(query, drawer, preferredHall),
          { hop: 1, viaRoom: startRoom, stage },
        ));
      }
    }

    const hits = nearby
      .sort((left, right) => {
        const hallPriority = hasFactIntent(query) && preferredHall
          ? Number(right.hall === preferredHall) - Number(left.hall === preferredHall)
          : 0;
        return hallPriority || right.similarity - left.similarity;
      })
      .slice(0, Math.max(1, Math.min(topK, 3)));
    return {
      hits,
      seed: startRoom,
    };
  }

  private async _recallPalaceBroader(
    query: string,
    startRoom: string | undefined,
    hall: HallType | undefined,
    direct: SearchHit[],
    nearby: SearchHit[],
    topK: number,
  ): Promise<{ hits: SearchHit[]; seed?: string; seedVia?: "direct" | "nearby" }> {
    if (!startRoom) return { hits: [] };
    const roomCandidates = await this._collectBroaderRoomCandidates(startRoom, nearby);
    if (roomCandidates.length === 0) return { hits: [] };
    const attemptedSeedRoom = roomCandidates[0]?.viaRoom ?? startRoom;
    const attemptedSeedHop = roomCandidates[0]?.hop;
    const attemptedSeedVia = attemptedSeedRoom === startRoom ? "direct" : "nearby";

    const excludedIds = new Set([
      ...direct.map((hit) => hit.id),
      ...nearby.map((hit) => hit.id),
    ]);
    const broader: SearchHit[] = [];
    for (const candidate of roomCandidates) {
      const sourceFile = await this._inferSourceFileHintFromAnyWing(query, candidate.room, hall);
      const focusedDrawers = await this._listRoomDrawersFromAnyWing(candidate.room, 4, hall, sourceFile);
      const hallFallbackDrawers = sourceFile && hall && focusedDrawers.length === 0
        ? await this._listRoomDrawersFromAnyWing(candidate.room, 4, hall)
        : [];
      const generalDrawers = await this._listRoomDrawersFromAnyWing(candidate.room, 4, undefined, sourceFile);
      const unfocusedGeneralDrawers = sourceFile && generalDrawers.length === 0
        ? await this._listRoomDrawersFromAnyWing(candidate.room, 4)
        : [];
      const stagedDrawers = [
        ...focusedDrawers.map((drawer) => ({ drawer, stage: "strict" })),
        ...hallFallbackDrawers.map((drawer) => ({ drawer, stage: "drop-source" })),
        ...generalDrawers.map((drawer) => ({ drawer, stage: "drop-hall" })),
        ...unfocusedGeneralDrawers.map((drawer) => ({ drawer, stage: "drop-hall-drop-source" })),
      ];
      for (const { drawer, stage } of stagedDrawers) {
        if (excludedIds.has(drawer.id)) continue;
        if (broader.some((existing) => existing.id === drawer.id)) continue;
        broader.push(withRecallProvenance(
          drawerToRankedSearchHit(query, drawer, hall),
          { hop: candidate.hop, viaRoom: candidate.viaRoom, stage },
        ));
      }
    }

    const hits = broader
      .sort((left, right) => right.similarity - left.similarity || left.distance - right.distance)
      .slice(0, Math.max(1, Math.min(topK, 3)));
    const seedRoom = typeof hits[0]?.metadata?.recallViaRoom === "string"
      ? hits[0].metadata.recallViaRoom
      : undefined;
    const seedHop = typeof hits[0]?.metadata?.recallHop === "number"
      ? hits[0].metadata.recallHop
      : undefined;
    return {
      hits,
      seed: seedRoom
        ? `hop${seedHop ?? "?"}:${seedRoom}`
        : (attemptedSeedRoom ? `hop${attemptedSeedHop ?? "?"}:${attemptedSeedRoom}` : undefined),
      seedVia: seedRoom
        ? (seedRoom === startRoom ? "direct" : "nearby")
        : attemptedSeedVia,
    };
  }

  private async _collectBroaderRoomCandidates(
    startRoom: string,
    nearby: SearchHit[],
  ): Promise<BroaderRoomCandidate[]> {
    const primary = await this._collectHopTwoRooms(startRoom);
    if (primary.length > 0) {
      return primary.slice(0, 3).map((room) => ({ room, hop: 2, viaRoom: startRoom }));
    }

    const nearbyRooms = nearby
      .map((hit) => hit.room)
      .filter((room): room is string => Boolean(room) && room !== startRoom)
      .filter((room, index, rooms) => rooms.indexOf(room) === index)
      .slice(0, 2);

    const fallback: BroaderRoomCandidate[] = [];
    for (const room of nearbyRooms) {
      const hopTwoRooms = await this._collectHopTwoRooms(room);
      for (const candidate of hopTwoRooms) {
        if (candidate === startRoom || candidate === room) continue;
        if (fallback.some((entry) => entry.room === candidate)) continue;
        fallback.push({ room: candidate, hop: 2, viaRoom: room });
        if (fallback.length >= 3) {
          return fallback;
        }
      }
    }

    return fallback;
  }

  private async _collectHopTwoRooms(startRoom: string): Promise<string[]> {
    const walked = await traverse(startRoom, this._mempalacePath, 2);
    if (!Array.isArray(walked)) return [];

    return walked
      .filter((hit): hit is TraversalHit => hit.hop === 2)
      .map((hit) => hit.room)
      .filter((room, index, rooms) => rooms.indexOf(room) === index)
      .slice(0, 3);
  }

  private async _recallPalaceRelated(
    query: string,
    wing: string,
    room: string | undefined,
    hall: HallType | undefined,
    direct: SearchHit[],
    nearby: SearchHit[],
    topK: number,
  ): Promise<{ hits: SearchHit[]; seed?: string; missStage?: string }> {
    const tunnels = await findTunnels(wing, undefined, this._mempalacePath);
    if (tunnels.length === 0) return { hits: [] };

    const directIds = new Set(direct.map((hit) => hit.id));
    const primaryRoomCandidates: RelatedRoomCandidate[] = [
      ...(room ? [{ room, via: "direct" as const }] : []),
      ...(!room && direct[0]?.room ? [{ room: direct[0].room, via: "resolved" as const }] : []),
      ...selectTunnelRooms(query, tunnels, hall).map((candidate) => ({ room: candidate, via: "tunnel" as const })),
    ].filter((candidate, index, rooms) => rooms.findIndex((entry) => entry.room === candidate.room) === index).slice(0, 2);
    const nearbyFallbackRooms = nearby
      .map((hit) => hit.room)
      .filter((candidate): candidate is string => Boolean(candidate) && candidate !== room)
      .filter((candidate, index, rooms) => rooms.indexOf(candidate) === index)
      .slice(0, 2);
    const roomCandidates: RelatedRoomCandidate[] = [...primaryRoomCandidates];
    for (const candidate of nearbyFallbackRooms) {
      if (roomCandidates.some((entry) => entry.room === candidate)) continue;
      roomCandidates.push({ room: candidate, via: "nearby" as const });
    }
    const attemptedSeed = roomCandidates[0]
      ? `${roomCandidates[0].via}:${roomCandidates[0].room}`
      : undefined;

    const relatedRecall = await this._searchRelatedRooms(query, wing, hall, directIds, roomCandidates);
    if (relatedRecall.hits.length > 0) {
      const seedRoom = typeof relatedRecall.hits[0]?.metadata?.recallViaRoom === "string"
        ? relatedRecall.hits[0].metadata.recallViaRoom
        : undefined;
      const seedVia = roomCandidates.find((candidate) => candidate.room === seedRoom)?.via;
      return {
        hits: relatedRecall.hits.slice(0, Math.max(1, Math.min(topK, 3))),
        seed: seedRoom && seedVia ? `${seedVia}:${seedRoom}` : undefined,
      };
    }

    if (room) {
      const tunnelFallbackRooms = selectTunnelRooms(query, tunnels, hall)
        .filter((candidate) => candidate !== room)
        .map((candidate) => ({ room: candidate, via: "tunnel-fallback" as const }));
      const fallbackRelatedRecall = await this._searchRelatedRooms(query, wing, hall, directIds, tunnelFallbackRooms);
      const seedRoom = typeof fallbackRelatedRecall.hits[0]?.metadata?.recallViaRoom === "string"
        ? fallbackRelatedRecall.hits[0].metadata.recallViaRoom
        : undefined;
      return {
        hits: fallbackRelatedRecall.hits.slice(0, Math.max(1, Math.min(topK, 3))),
        seed: seedRoom
          ? `tunnel-fallback:${seedRoom}`
          : (tunnelFallbackRooms[0] ? `tunnel-fallback:${tunnelFallbackRooms[0].room}` : attemptedSeed),
        missStage: fallbackRelatedRecall.hits.length === 0
          ? (fallbackRelatedRecall.missStage ?? relatedRecall.missStage)
          : undefined,
      };
    }

    return {
      hits: [],
      seed: attemptedSeed,
      missStage: relatedRecall.missStage,
    };
  }

  private async _searchRelatedRooms(
    query: string,
    wing: string,
    hall: HallType | undefined,
    directIds: Set<string>,
    roomCandidates: RelatedRoomCandidate[],
  ): Promise<{ hits: SearchHit[]; missStage?: string }> {
    const related: SearchHit[] = [];
    let missStage: string | undefined;
    for (const candidate of roomCandidates) {
      const room = candidate.room;
      const sourceFile = await this._inferSourceFileHintFromAnyWing(query, room, hall);
      const inferStage = (attempt: { hall: HallType | undefined; sourceFile?: string }): string => {
        if (attempt.hall === hall && attempt.sourceFile === sourceFile) return "strict";
        if (attempt.hall === hall && attempt.sourceFile === undefined && sourceFile) return "drop-source";
        if (hall === "hall_advice" && attempt.hall === "hall_facts" && attempt.sourceFile === sourceFile) return "hall-fallback";
        if (hall === "hall_advice" && attempt.hall === "hall_facts" && attempt.sourceFile === undefined) {
          return sourceFile ? "hall-fallback-drop-source" : "hall-fallback";
        }
        if (attempt.hall === undefined && attempt.sourceFile === sourceFile && hall) return "drop-hall";
        if (attempt.hall === undefined && attempt.sourceFile === undefined && hall) {
          return sourceFile ? "drop-hall-drop-source" : "drop-hall";
        }
        return "strict";
      };
      const attempts: Array<{ hall: HallType | undefined; sourceFile?: string }> = [
        { hall, sourceFile },
        { hall, sourceFile: undefined },
      ];
      if (hall === "hall_advice") {
        attempts.push({ hall: "hall_facts", sourceFile });
        attempts.push({ hall: "hall_facts", sourceFile: undefined });
      }
      if (hall) {
        attempts.push({ hall: undefined, sourceFile });
        attempts.push({ hall: undefined, sourceFile: undefined });
      }

      const seenAttempts = new Set<string>();
      for (const attempt of attempts) {
        const attemptKey = `${attempt.hall ?? "any"}:${attempt.sourceFile ?? "*"}`;
        if (seenAttempts.has(attemptKey)) continue;
        seenAttempts.add(attemptKey);
        const stage = inferStage(attempt);
        missStage = stage;

        const hits = await this.mempalace.l3.searchRaw(query, {
          room,
          hall: attempt.hall,
          sourceFile: attempt.sourceFile,
          nResults: 3,
        });
        const crossWingHits = rerankSearchHits(
          query,
          hits.filter((hit) => hit.wing !== wing && !directIds.has(hit.id)),
          attempt.hall ?? hall,
        );
        if (crossWingHits.length === 0) continue;
        for (const hit of crossWingHits) {
          if (related.some((existing) => existing.id === hit.id)) continue;
          related.push(withRecallProvenance(hit, { crossWing: true, viaRoom: room, stage }));
        }
        break;
      }
    }

    return {
      hits: related
        .sort((left, right) => right.similarity - left.similarity || left.distance - right.distance)
        .slice(0, 3),
      missStage: related.length === 0 ? missStage : undefined,
    };
  }

  private async _listWingRooms(wing: string): Promise<string[]> {
    if (!this._mempalacePath) return [];
    let store: PalaceStore | null = null;
    try {
      store = await PalaceStore.open({ palacePath: this._mempalacePath, create: false });
      return store.listRooms(wing).map((entry) => entry.room).filter((room) => room && room !== "general");
    } catch {
      return [];
    } finally {
      store?.close();
    }
  }

  private async _listGlobalRooms(): Promise<string[]> {
    if (!this._mempalacePath) return [];
    let store: PalaceStore | null = null;
    try {
      store = await PalaceStore.open({ palacePath: this._mempalacePath, create: false });
      return store.listRooms().map((entry) => entry.room).filter((room) => room && room !== "general");
    } catch {
      return [];
    } finally {
      store?.close();
    }
  }

  private async _listRoomDrawers(
    wing: string,
    room: string,
    hall: HallType | undefined,
    limit: number,
    sourceFile?: string,
  ): Promise<Drawer[]> {
    if (!this._mempalacePath) return [];
    let store: PalaceStore | null = null;
    try {
      store = await PalaceStore.open({ palacePath: this._mempalacePath, create: false });
      return store.list({
        wing,
        room,
        hall,
        sourceFile,
        limit,
        orderBy: "importance",
      });
    } catch {
      return [];
    } finally {
      store?.close();
    }
  }

  private async _listRoomDrawersFromAnyWing(
    room: string,
    limit: number,
    hall?: HallType,
    sourceFile?: string,
  ): Promise<Drawer[]> {
    if (!this._mempalacePath) return [];
    let store: PalaceStore | null = null;
    try {
      store = await PalaceStore.open({ palacePath: this._mempalacePath, create: false });
      return store.list({
        room,
        hall,
        sourceFile,
        limit,
        orderBy: "importance",
      });
    } catch {
      return [];
    } finally {
      store?.close();
    }
  }

  private async _listWingDrawers(
    wing: string,
    hall: HallType | undefined,
    limit: number,
    sourceFile?: string,
  ): Promise<Drawer[]> {
    if (!this._mempalacePath) return [];
    let store: PalaceStore | null = null;
    try {
      store = await PalaceStore.open({ palacePath: this._mempalacePath, create: false });
      return store.list({
        wing,
        hall,
        sourceFile,
        limit,
        orderBy: "importance",
      });
    } catch {
      return [];
    } finally {
      store?.close();
    }
  }

  private async _listGlobalDrawers(
    hall: HallType | undefined,
    limit: number,
    sourceFile?: string,
  ): Promise<Drawer[]> {
    if (!this._mempalacePath) return [];
    let store: PalaceStore | null = null;
    try {
      store = await PalaceStore.open({ palacePath: this._mempalacePath, create: false });
      return store.list({
        hall,
        sourceFile,
        limit,
        orderBy: "importance",
      });
    } catch {
      return [];
    } finally {
      store?.close();
    }
  }

  private async _inferSourceFileHintFromAnyWing(
    query: string,
    room: string,
    hall: HallType | undefined,
  ): Promise<string | undefined> {
    for (const candidateHall of sourceHintHallCandidates(hall)) {
      const drawers = await this._listRoomDrawersFromAnyWing(room, 16, candidateHall);
      const sourceFile = selectSourceFileHint(query, drawers);
      if (sourceFile) return sourceFile;
    }
    return undefined;
  }

  private async _inferGlobalSourceFileHint(
    query: string,
    hall: HallType | undefined,
  ): Promise<string | undefined> {
    for (const candidateHall of sourceHintHallCandidates(hall)) {
      const drawers = await this._listGlobalDrawers(candidateHall, 24);
      const sourceFile = selectSourceFileHint(query, drawers);
      if (sourceFile) return sourceFile;
    }
    return undefined;
  }
}

export async function buildMemoryRealSessionRecallQaMatrix(
  memory: ColonyMemoryService,
  session: AgentSession,
  cases: MemoryRealSessionRecallQaCase[],
): Promise<MemoryRealSessionRecallQaResult[]> {
  const results: MemoryRealSessionRecallQaResult[] = [];

  for (const testCase of cases) {
    const context = await memory.buildMemoryContextResult(testCase.query, session, {
      truthMode: testCase.truthMode,
    });
    const diagnostics = context.diagnostics;
    const intentTags = inferMemoryIntentTags(testCase.query);
    const failures: string[] = [];

    const requiredText = (testCase.requiredText ?? []).map((text, index) => {
      const present = context.prompt.includes(text);
      if (!present) failures.push(`requiredText[${index}] missing`);
      return {
        label: `requiredText[${index}]`,
        textHash: hashRecallQaText(text),
        present,
      };
    });
    const forbiddenText = (testCase.forbiddenText ?? []).map((text, index) => {
      const present = context.prompt.includes(text);
      if (present) failures.push(`forbiddenText[${index}] present`);
      return {
        label: `forbiddenText[${index}]`,
        textHash: hashRecallQaText(text),
        present,
      };
    });
    const textOrder = (testCase.expectedTextOrder ?? []).map((expectation) => {
      const beforeIndex = context.prompt.indexOf(expectation.before);
      const afterIndex = context.prompt.indexOf(expectation.after);
      const satisfied = beforeIndex >= 0 && afterIndex >= 0 && beforeIndex < afterIndex;
      if (!satisfied) {
        failures.push(`textOrder ${hashRecallQaText(expectation.before)} before ${hashRecallQaText(expectation.after)} not satisfied`);
      }
      return {
        beforeHash: hashRecallQaText(expectation.before),
        afterHash: hashRecallQaText(expectation.after),
        beforeIndex,
        afterIndex,
        satisfied,
      };
    });

    if (testCase.expectedTruthMode && diagnostics.truthMode !== testCase.expectedTruthMode) {
      failures.push(`truthMode expected ${testCase.expectedTruthMode} got ${diagnostics.truthMode}`);
    }
    for (const tag of testCase.expectedIntentTags ?? []) {
      if (!intentTags.includes(tag)) failures.push(`intent tag ${tag} missing`);
    }
    for (const section of testCase.expectedShownSections ?? []) {
      if (!diagnostics.shownSections.includes(section)) failures.push(`shown section ${section} missing`);
    }
    if (testCase.expectedPalace) {
      const path = diagnostics.palace.path;
      for (const [key, expected] of Object.entries(testCase.expectedPalace)) {
        if (expected == null) continue;
        const actual = path[key as keyof MemoryRecallPalacePathSnapshot];
        if (actual !== expected) failures.push(`palace.${key} expected ${String(expected)} got ${String(actual)}`);
      }
    }
    const routingNotePresent = context.prompt.includes("Memory routing note:");
    if (!routingNotePresent) failures.push("memory routing note missing");

    results.push({
      id: testCase.id,
      queryHash: hashRecallQaText(testCase.query),
      passed: failures.length === 0,
      failures,
      truthMode: diagnostics.truthMode,
      truthModeSource: diagnostics.truthModeSource,
      truthProvenance: [...diagnostics.truthProvenance],
      intentTags,
      sectionOrder: [...diagnostics.sectionOrder],
      shownSections: [...diagnostics.shownSections],
      routingNotePresent,
      counts: {
        exact: diagnostics.exact,
        compact: diagnostics.compact,
        structured: diagnostics.structured,
        palace: diagnostics.palace,
      },
      palace: diagnostics.palace,
      requiredText,
      forbiddenText,
      textOrder,
    });
  }

  return results;
}

function hashRecallQaText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

function mapHistoryMessage(
  message: SerializedMessage,
  sourceMessageKey: string,
): {
  role: string;
  content: string;
  metadata: Record<string, unknown>;
} {
  if (message.type === "tool_result") {
    return {
      role: "tool",
      content: String(message.content ?? ""),
      metadata: {
        type: message.type,
        toolName: message.name,
        toolCallId: message.toolCallId,
        isError: Boolean(message.isError),
        timestamp: message.timestamp,
        sourceMessageKey,
      },
    };
  }

  return {
    role: message.type,
    content: String(message.content ?? ""),
    metadata: {
      type: message.type,
      timestamp: message.timestamp,
      toolCalls: message.type === "assistant" ? message.toolCalls ?? [] : [],
      sourceMessageKey,
    },
  };
}

function historyToMessageShape(message: SerializedMessage): Record<string, unknown> {
  if (message.type === "tool_result") {
    return {
      role: "tool",
      content: String(message.content ?? ""),
      name: message.name,
      toolCallId: message.toolCallId,
      isError: Boolean(message.isError),
    };
  }
  return {
    role: message.type,
    content: String(message.content ?? ""),
  };
}

function loggedRecordToMessageShape(record: LoggedTurnRecord): Record<string, unknown> {
  return {
    role: record.role,
    content: record.content,
  };
}

function historyMessageKey(message: SerializedMessage, index: number): string {
  if (typeof message.id === "string" && message.id.length > 0) {
    return `${message.type}:${message.id}`;
  }
  if (message.type === "tool_result" && typeof message.toolCallId === "string" && message.toolCallId.length > 0) {
    return `${message.type}:${message.toolCallId}`;
  }

  const hash = createHash("sha1")
    .update(JSON.stringify({
      type: message.type,
      content: String(message.content ?? ""),
      timestamp: message.timestamp ?? "",
      name: message.name ?? "",
      toolCallId: message.toolCallId ?? "",
      index,
    }))
    .digest("hex")
    .slice(0, 16);
  return `${message.type}:${hash}`;
}

function compactPreview(text: string, maxChars = 280): string {
  const collapsed = text
    .replace(/^#.+$/gm, "")
    .replace(/<!--.*?-->/g, "")
    .replace(/\n---\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (collapsed.length <= maxChars) return collapsed;
  return `${collapsed.slice(0, maxChars - 3)}...`;
}

function formatMemoryContext(
  recall: Array<{
    content: string;
    source: "conversation" | "artifact";
    score: number;
    sessionId: string;
    exact: boolean;
  }>,
  palaceExact: SearchHit[],
  palaceNearby: SearchHit[],
  palaceBroader: SearchHit[],
  palaceRelated: SearchHit[],
  palaceDiagnostics: PalaceRecallDiagnostics,
  entries: MemoryEntry[],
  structured: StoredExtractedMemory[],
  truthMode: MemoryTruthMode,
  truthProvenance: string[],
  query: string,
  session: AgentSession,
  currentSessionId: string,
  truthModeSource: "explicit" | "inferred",
): MemoryContextBuildResult {
  const verbatim = recall.filter((entry) => entry.exact);
  const derived = recall.filter((entry) => !entry.exact);
  const includeExact = truthMode !== "derived_only";
  const includeDerived = truthMode !== "exact_only";
  const countedDerived = includeDerived ? derived : [];
  const countedEntries = includeDerived ? entries : [];
  const countedStructured = includeDerived ? structured : [];
  const exactSections: string[] = [];
  const compactDerivedSections: string[] = [];
  const structuredDerivedSections: string[] = [];

  if (includeExact && verbatim.length > 0) {
    const shownVerbatimCount = Math.min(verbatim.length, 3);
    exactSections.push(formatVisibleCountHeader(
      "Verbatim recall (exact transcript excerpts):",
      shownVerbatimCount,
      verbatim.length,
    ));
    for (const [index, entry] of verbatim.slice(0, 3).entries()) {
      exactSections.push(formatVerbatimRecallEntry(entry, index + 1));
    }
    const hiddenVerbatimNote = formatHiddenCountNote(
      shownVerbatimCount,
      verbatim.length,
      "exact transcript match",
      "exact transcript matches",
    );
    if (hiddenVerbatimNote) exactSections.push(hiddenVerbatimNote);
  }
  const palaceSections = orderPalaceSections(query, [
    {
      key: "direct",
      hasContent: palaceExact.length > 0,
      hiddenNote: formatHiddenCountNote(Math.min(palaceExact.length, 3), palaceExact.length, "palace drawer", "palace drawers") ?? undefined,
      header: formatVisibleCountHeader(
        "Verbatim palace recall (exact mined drawers):",
        Math.min(palaceExact.length, 3),
        palaceExact.length,
      ),
      rows: palaceExact.slice(0, 3).map((hit, index) => formatPalaceRecallEntry("palace", hit, index + 1)),
    },
    {
      key: "nearby",
      hasContent: palaceNearby.length > 0,
      hiddenNote: formatHiddenCountNote(Math.min(palaceNearby.length, 2), palaceNearby.length, "nearby palace drawer", "nearby palace drawers") ?? undefined,
      header: formatVisibleCountHeader(
        "Nearby palace context (exact adjacent room drawers):",
        Math.min(palaceNearby.length, 2),
        palaceNearby.length,
      ),
      rows: palaceNearby.slice(0, 2).map((hit, index) => formatPalaceRecallEntry("palace-nearby", hit, index + 1)),
    },
    {
      key: "broader",
      hasContent: palaceBroader.length > 0,
      hiddenNote: formatHiddenCountNote(Math.min(palaceBroader.length, 2), palaceBroader.length, "broader palace drawer", "broader palace drawers") ?? undefined,
      header: formatVisibleCountHeader(
        "Broader palace context (exact connected room drawers):",
        Math.min(palaceBroader.length, 2),
        palaceBroader.length,
      ),
      rows: palaceBroader.slice(0, 2).map((hit, index) => formatPalaceRecallEntry("palace-broader", hit, index + 1)),
    },
    {
      key: "related",
      hasContent: palaceRelated.length > 0,
      hiddenNote: formatHiddenCountNote(Math.min(palaceRelated.length, 2), palaceRelated.length, "related palace drawer", "related palace drawers") ?? undefined,
      header: formatVisibleCountHeader(
        "Related palace recall (exact cross-wing tunnel drawers):",
        Math.min(palaceRelated.length, 2),
        palaceRelated.length,
      ),
      rows: palaceRelated.slice(0, 2).map((hit, index) => formatPalaceRecallEntry("palace-related", hit, index + 1)),
    },
  ]);
  const exactSectionOrder: RenderedMemorySectionKey[] = [];
  if (includeExact && verbatim.length > 0) exactSectionOrder.push("exact");
  if (includeExact) {
    for (const section of palaceSections) {
      if (!section.hasContent) continue;
      exactSectionOrder.push(`palace-${section.key}` as RenderedMemorySectionKey);
    }
  }

  if (includeExact) {
    for (const section of palaceSections) {
      if (!section.hasContent) continue;
      if (exactSections.length > 0) exactSections.push("");
      exactSections.push(section.header);
      exactSections.push(...section.rows);
      if (section.hiddenNote) exactSections.push(section.hiddenNote);
    }
  }

  if (includeDerived && (derived.length > 0 || entries.length > 0)) {
    const limitedDerived = derived.slice(0, 2);
    const shownCompactCount = limitedDerived.length + Math.min(entries.length, 3);
    const totalCompactCount = derived.length + entries.length;
    compactDerivedSections.push(formatVisibleCountHeader(
      "Derived compact recall (not verbatim; use to find truth, not replace it):",
      shownCompactCount,
      totalCompactCount,
    ));
    for (const [index, entry] of limitedDerived.entries()) {
      compactDerivedSections.push(formatArtifactDerivedEntry(entry, index + 1));
    }
    for (const [index, entry] of entries.slice(0, 3).entries()) {
      compactDerivedSections.push(formatCompactDerivedMemoryEntry(entry, limitedDerived.length + index + 1));
    }
    const hiddenCompactNote = formatHiddenCountNote(
      shownCompactCount,
      totalCompactCount,
      "compact derived match",
      "compact derived matches",
    );
    if (hiddenCompactNote) compactDerivedSections.push(hiddenCompactNote);
  }

  if (includeDerived && structured.length > 0) {
    structuredDerivedSections.push(...formatStructuredDerivedSections(query, structured));
  }
  const derivedSectionOrder: RenderedMemorySectionKey[] = [];
  if (includeDerived && (derived.length > 0 || entries.length > 0)) derivedSectionOrder.push("compact");
  if (includeDerived && structured.length > 0) derivedSectionOrder.push("structured");

  const derivedSections = orderDerivedSections(query, [
    { key: "compact", lines: compactDerivedSections },
    { key: "structured", lines: structuredDerivedSections },
  ]);
  const shownSectionOrder = inferMemorySectionPriority(truthMode).flatMap((kind) => (
    kind === "exact" ? exactSectionOrder : derivedSectionOrder
  ));
  const shownVerbatimEntries = verbatim.slice(0, 3);
  const shownArtifactEntries = countedDerived.slice(0, 2);
  const shownMarkdownEntries = countedEntries.slice(0, 3);
  const shownStructuredEntries = countedStructured.slice(0, 4);
  const shownPalaceEntries = [
    ...palaceExact.slice(0, 3),
    ...palaceNearby.slice(0, 2),
    ...palaceBroader.slice(0, 2),
    ...palaceRelated.slice(0, 2),
  ];
  const resolvedPalaceSourceFile = [
    ...palaceExact,
    ...palaceNearby,
    ...palaceBroader,
    ...palaceRelated,
  ].find((entry) => typeof entry.sourceFile === "string" && entry.sourceFile.length > 0)?.sourceFile;
  const shownCurrentSession = [
    ...shownVerbatimEntries.map((entry) => entry.sessionId),
    ...shownArtifactEntries.map((entry) => entry.sessionId),
    ...shownMarkdownEntries.map((entry) => entry.sessionId),
    ...shownStructuredEntries.map((entry) => entry.sessionId),
  ].filter((sessionId) => sessionId === currentSessionId).length;
  const shownArchivedSession = [
    ...shownVerbatimEntries.map((entry) => entry.sessionId),
    ...shownArtifactEntries.map((entry) => entry.sessionId),
    ...shownMarkdownEntries.map((entry) => entry.sessionId),
    ...shownStructuredEntries.map((entry) => entry.sessionId),
  ].filter((sessionId) => Boolean(sessionId) && sessionId !== currentSessionId).length;
  const compactCurrentSession = [
    ...countedDerived.map((entry) => entry.sessionId),
    ...countedEntries.map((entry) => entry.sessionId),
  ].filter((sessionId) => sessionId === currentSessionId).length;
  const compactArchivedSession = [
    ...countedDerived.map((entry) => entry.sessionId),
    ...countedEntries.map((entry) => entry.sessionId),
  ].filter((sessionId) => Boolean(sessionId) && sessionId !== currentSessionId).length;
  const shownCompactCurrentSession = [
    ...shownArtifactEntries.map((entry) => entry.sessionId),
    ...shownMarkdownEntries.map((entry) => entry.sessionId),
  ].filter((sessionId) => sessionId === currentSessionId).length;
  const shownCompactArchivedSession = [
    ...shownArtifactEntries.map((entry) => entry.sessionId),
    ...shownMarkdownEntries.map((entry) => entry.sessionId),
  ].filter((sessionId) => Boolean(sessionId) && sessionId !== currentSessionId).length;

  const orderedGroups = orderMemorySectionGroups(truthMode, exactSections, derivedSections);
  const lines = joinMemorySectionGroups(orderedGroups);
  const exactCount = createMemoryRecallCountSnapshot(verbatim.length, Math.min(verbatim.length, 3));
  const compactCount = createMemoryRecallCountSnapshot(
    countedDerived.length + countedEntries.length,
    shownArtifactEntries.length + shownMarkdownEntries.length,
  );
  const structuredCount = createMemoryRecallCountSnapshot(countedStructured.length, shownStructuredEntries.length);
  const palaceDirectCount = createMemoryRecallCountSnapshot(palaceExact.length, Math.min(palaceExact.length, 3));
  const palaceNearbyCount = createMemoryRecallCountSnapshot(palaceNearby.length, Math.min(palaceNearby.length, 2));
  const palaceBroaderCount = createMemoryRecallCountSnapshot(palaceBroader.length, Math.min(palaceBroader.length, 2));
  const palaceRelatedCount = createMemoryRecallCountSnapshot(palaceRelated.length, Math.min(palaceRelated.length, 2));
  const shownSections = shownSectionOrder.map((section) => String(section));
  const sectionState = buildMemoryRecallSectionState(truthMode, {
    exact: exactCount,
    compact: compactCount,
    structured: structuredCount,
    palaceDirect: palaceDirectCount,
    palaceNearby: palaceNearbyCount,
    palaceBroader: palaceBroaderCount,
    palaceRelated: palaceRelatedCount,
  });
  const emptySections = Object.entries(sectionState)
    .filter(([, state]) => state === "empty")
    .map(([section]) => section);
  const hiddenSections = Object.entries(sectionState)
    .filter(([, state]) => state === "truncated")
    .map(([section]) => section);
  const diagnostics: MemoryRecallDiagnosticsSnapshot = {
    truthMode,
    truthModeSource,
    truthProvenance: [...truthProvenance],
    sectionOrder: shownSections,
    sectionState,
    shownSections,
    emptySections,
    hiddenSections,
    exact: exactCount,
    compact: compactCount,
    structured: structuredCount,
    palace: {
      direct: palaceDirectCount,
      nearby: palaceNearbyCount,
      broader: palaceBroaderCount,
      related: palaceRelatedCount,
      total: createMemoryRecallCountSnapshot(
        palaceExact.length + palaceNearby.length + palaceBroader.length + palaceRelated.length,
        shownPalaceEntries.length,
      ),
      hintedPath: [
        palaceDiagnostics.inferredWing,
        palaceDiagnostics.inferredRoom,
        palaceDiagnostics.inferredHall,
      ].filter(Boolean).join("/") || undefined,
      resolvedPath: [
        palaceDiagnostics.resolvedWing,
        palaceDiagnostics.resolvedRoom,
        palaceDiagnostics.resolvedHall,
      ].filter(Boolean).join("/") || undefined,
      path: {
        inferredHall: palaceDiagnostics.inferredHall,
        inferredWing: palaceDiagnostics.inferredWing,
        inferredRoom: palaceDiagnostics.inferredRoom,
        inferredSourceFile: palaceDiagnostics.inferredSourceFile,
        resolvedHall: palaceDiagnostics.resolvedHall,
        resolvedWing: palaceDiagnostics.resolvedWing,
        resolvedRoom: palaceDiagnostics.resolvedRoom,
        resolvedSourceFile: resolvedPalaceSourceFile,
        roomInference: palaceDiagnostics.roomInference,
        sourceHintScope: palaceDiagnostics.sourceHintScope,
        hallFallback: palaceDiagnostics.hallFallback,
        roomFallback: palaceDiagnostics.roomFallback,
        sourceFallback: palaceDiagnostics.sourceFallback,
      },
      traversal: {
        directHitStage: palaceDiagnostics.directHitStage,
        directMissStage: palaceDiagnostics.directMissStage,
        nearbySeed: palaceDiagnostics.nearbySeed,
        nearbyFallback: palaceDiagnostics.nearbyFallback,
        nearbyHitStage: palaceDiagnostics.nearbyHitStage,
        nearbyUnavailable: palaceDiagnostics.nearbyUnavailable,
        nearbySeedVia: palaceDiagnostics.nearbySeedVia,
        broaderSeed: palaceDiagnostics.broaderSeed,
        broaderFallback: palaceDiagnostics.broaderFallback,
        broaderHitStage: palaceDiagnostics.broaderHitStage,
        broaderUnavailable: palaceDiagnostics.broaderUnavailable,
        broaderSeedVia: palaceDiagnostics.broaderSeedVia,
        relatedSeed: palaceDiagnostics.relatedSeed,
        relatedFallback: palaceDiagnostics.relatedFallback,
        relatedHitStage: palaceDiagnostics.relatedHitStage,
        relatedMissStage: palaceDiagnostics.relatedMissStage,
        relatedUnavailable: palaceDiagnostics.relatedUnavailable,
      },
    },
    sessionContribution: {
      total: {
        current: [
          ...verbatim.map((entry) => entry.sessionId),
          ...countedDerived.map((entry) => entry.sessionId),
          ...countedEntries.map((entry) => entry.sessionId),
          ...countedStructured.map((entry) => entry.sessionId),
        ].filter((sessionId) => sessionId === currentSessionId).length,
        archived: [
          ...verbatim.map((entry) => entry.sessionId),
          ...countedDerived.map((entry) => entry.sessionId),
          ...countedEntries.map((entry) => entry.sessionId),
          ...countedStructured.map((entry) => entry.sessionId),
        ].filter((sessionId) => Boolean(sessionId) && sessionId !== currentSessionId).length,
        palace: palaceExact.length + palaceNearby.length + palaceBroader.length + palaceRelated.length,
      },
      shown: {
        current: shownCurrentSession,
        archived: shownArchivedSession,
        palace: shownPalaceEntries.length,
      },
    },
  };
  const routingNote = formatMemoryRoutingNote(query, session, truthMode, truthProvenance, palaceDiagnostics, {
    exact: verbatim.length,
    exactUser: verbatim.filter((entry) => entry.source === "conversation" && (entry as { role?: string }).role === "user").length,
    exactAssistant: verbatim.filter((entry) => entry.source === "conversation" && (entry as { role?: string }).role === "assistant").length,
    exactTool: verbatim.filter((entry) => entry.source === "conversation" && (entry as { role?: string }).role === "tool").length,
    shownExact: Math.min(verbatim.length, 3),
    shownExactUser: shownVerbatimEntries.filter((entry) => entry.source === "conversation" && (entry as { role?: string }).role === "user").length,
    shownExactAssistant: shownVerbatimEntries.filter((entry) => entry.source === "conversation" && (entry as { role?: string }).role === "assistant").length,
    shownExactTool: shownVerbatimEntries.filter((entry) => entry.source === "conversation" && (entry as { role?: string }).role === "tool").length,
    exactCurrentSession: verbatim.filter((entry) => entry.sessionId === currentSessionId).length,
    exactArchivedSession: verbatim.filter((entry) => Boolean(entry.sessionId) && entry.sessionId !== currentSessionId).length,
    shownExactCurrentSession: shownVerbatimEntries.filter((entry) => entry.sessionId === currentSessionId).length,
    shownExactArchivedSession: shownVerbatimEntries.filter((entry) => Boolean(entry.sessionId) && entry.sessionId !== currentSessionId).length,
    exactReasonMix: formatExactReasonMix(verbatim),
    shownExactReasonMix: formatExactReasonMix(shownVerbatimEntries),
    artifact: countedDerived.length,
    shownArtifact: shownArtifactEntries.length,
    artifactCurrentSession: countedDerived.filter((entry) => entry.sessionId === currentSessionId).length,
    artifactArchivedSession: countedDerived.filter((entry) => Boolean(entry.sessionId) && entry.sessionId !== currentSessionId).length,
    shownArtifactCurrentSession: shownArtifactEntries.filter((entry) => entry.sessionId === currentSessionId).length,
    shownArtifactArchivedSession: shownArtifactEntries.filter((entry) => Boolean(entry.sessionId) && entry.sessionId !== currentSessionId).length,
    artifactReasonMix: formatExactReasonMix(countedDerived),
    shownArtifactReasonMix: formatExactReasonMix(shownArtifactEntries),
    markdown: countedEntries.length,
    shownMarkdown: shownMarkdownEntries.length,
    markdownCurrentSession: countedEntries.filter((entry) => entry.sessionId === currentSessionId).length,
    markdownArchivedSession: countedEntries.filter((entry) => Boolean(entry.sessionId) && entry.sessionId !== currentSessionId).length,
    shownMarkdownCurrentSession: shownMarkdownEntries.filter((entry) => entry.sessionId === currentSessionId).length,
    shownMarkdownArchivedSession: shownMarkdownEntries.filter((entry) => Boolean(entry.sessionId) && entry.sessionId !== currentSessionId).length,
    compact: countedDerived.length + countedEntries.length,
    shownCompact: shownArtifactEntries.length + shownMarkdownEntries.length,
    compactReasonMix: formatCompactReasonMix(countedDerived, countedEntries),
    shownCompactReasonMix: formatCompactReasonMix(shownArtifactEntries, shownMarkdownEntries),
    compactCurrentSession,
    compactArchivedSession,
    shownCompactCurrentSession,
    shownCompactArchivedSession,
    derivedReasonMix: formatDerivedReasonMix(countedDerived, countedEntries, countedStructured),
    shownDerivedReasonMix: formatDerivedReasonMix(shownArtifactEntries, shownMarkdownEntries, shownStructuredEntries),
    overallReasonMix: formatOverallReasonMix(verbatim, countedDerived, countedEntries, countedStructured),
    shownOverallReasonMix: formatOverallReasonMix(shownVerbatimEntries, shownArtifactEntries, shownMarkdownEntries, shownStructuredEntries),
    markdownReasonMix: formatMatchReasonMix(countedEntries),
    shownMarkdownReasonMix: formatMatchReasonMix(shownMarkdownEntries),
    structured: countedStructured.length,
    structuredAgent: countedStructured.filter((entry) => entry.scope === "agent").length,
    structuredColony: countedStructured.filter((entry) => entry.scope === "colony").length,
    structuredCurrentSession: countedStructured.filter((entry) => entry.sessionId === currentSessionId).length,
    structuredArchivedSession: countedStructured.filter((entry) => Boolean(entry.sessionId) && entry.sessionId !== currentSessionId).length,
    shownStructured: shownStructuredEntries.length,
    shownStructuredAgent: shownStructuredEntries.filter((entry) => entry.scope === "agent").length,
    shownStructuredColony: shownStructuredEntries.filter((entry) => entry.scope === "colony").length,
    shownStructuredCurrentSession: shownStructuredEntries.filter((entry) => entry.sessionId === currentSessionId).length,
    shownStructuredArchivedSession: shownStructuredEntries.filter((entry) => Boolean(entry.sessionId) && entry.sessionId !== currentSessionId).length,
    shownStructuredKeyword: shownStructuredEntries.filter((entry) => entry.source === "keyword").length,
    shownStructuredLlm: shownStructuredEntries.filter((entry) => entry.source === "llm").length,
    shownStructuredUnknown: shownStructuredEntries.filter((entry) => (entry.source ?? "unknown") === "unknown").length,
    structuredReasonMix: formatMatchReasonMix(countedStructured),
    shownStructuredReasonMix: formatMatchReasonMix(shownStructuredEntries),
    structuredKeyword: countedStructured.filter((entry) => entry.source === "keyword").length,
    structuredLlm: countedStructured.filter((entry) => entry.source === "llm").length,
    structuredUnknown: countedStructured.filter((entry) => (entry.source ?? "unknown") === "unknown").length,
    structuredCategoryMix: formatStructuredCategoryMix(countedStructured),
    shownStructuredCategoryMix: formatStructuredCategoryMix(shownStructuredEntries),
    markdownHeuristic: countedEntries.filter((entry) => entry.source === "heuristic").length,
    markdownLlm: countedEntries.filter((entry) => entry.source === "llm").length,
    markdownUnknown: countedEntries.filter((entry) => (entry.source ?? "unknown") === "unknown").length,
    shownMarkdownHeuristic: shownMarkdownEntries.filter((entry) => entry.source === "heuristic").length,
    shownMarkdownLlm: shownMarkdownEntries.filter((entry) => entry.source === "llm").length,
    shownMarkdownUnknown: shownMarkdownEntries.filter((entry) => (entry.source ?? "unknown") === "unknown").length,
    currentSession: [
      ...verbatim.map((entry) => entry.sessionId),
      ...countedDerived.map((entry) => entry.sessionId),
      ...countedEntries.map((entry) => entry.sessionId),
      ...countedStructured.map((entry) => entry.sessionId),
    ].filter((sessionId) => sessionId === currentSessionId).length,
    archivedSession: [
      ...verbatim.map((entry) => entry.sessionId),
      ...countedDerived.map((entry) => entry.sessionId),
      ...countedEntries.map((entry) => entry.sessionId),
      ...countedStructured.map((entry) => entry.sessionId),
    ].filter((sessionId) => Boolean(sessionId) && sessionId !== currentSessionId).length,
    shownCurrentSession,
    shownArchivedSession,
    palaceDirect: palaceExact.length,
    shownPalaceDirect: Math.min(palaceExact.length, 3),
    palaceNearby: palaceNearby.length,
    shownPalaceNearby: Math.min(palaceNearby.length, 2),
    palaceBroader: palaceBroader.length,
    shownPalaceBroader: Math.min(palaceBroader.length, 2),
    palaceRelated: palaceRelated.length,
    shownPalaceRelated: Math.min(palaceRelated.length, 2),
    palaceHallMix: formatPalaceHallMix([...palaceExact, ...palaceNearby, ...palaceBroader, ...palaceRelated]),
    shownPalaceHallMix: formatPalaceHallMix(shownPalaceEntries),
    palaceRoomMix: formatPalaceRoomMix([...palaceExact, ...palaceNearby, ...palaceBroader, ...palaceRelated]),
    shownPalaceRoomMix: formatPalaceRoomMix(shownPalaceEntries),
    palaceWingMix: formatPalaceWingMix([...palaceExact, ...palaceNearby, ...palaceBroader, ...palaceRelated]),
    shownPalaceWingMix: formatPalaceWingMix(shownPalaceEntries),
    palaceSourceMix: formatPalaceSourceMix([...palaceExact, ...palaceNearby, ...palaceBroader, ...palaceRelated]),
    shownPalaceSourceMix: formatPalaceSourceMix(shownPalaceEntries),
    memoryReasonMix: formatWholeMemoryReasonMix(verbatim, countedDerived, countedEntries, countedStructured, [...palaceExact, ...palaceNearby, ...palaceBroader, ...palaceRelated]),
    shownMemoryReasonMix: formatWholeMemoryReasonMix(shownVerbatimEntries, shownArtifactEntries, shownMarkdownEntries, shownStructuredEntries, shownPalaceEntries),
    shownSectionOrder: shownSectionOrder.join(">") || "none",
    palaceReasonMix: formatPalaceReasonMix([...palaceExact, ...palaceNearby, ...palaceBroader, ...palaceRelated]),
    shownPalaceReasonMix: formatPalaceReasonMix(shownPalaceEntries),
  });

  if (lines.length === 0 && truthMode === "exact_only") {
    const exactOnlyFallback = "Verbatim recall (exact transcript excerpts):\n- No exact transcript or palace recall matched this query.";
    diagnostics.noHitReason = "No exact transcript or palace recall matched this query.";
    return {
      prompt: routingNote ? `${routingNote}\n\n${exactOnlyFallback}` : exactOnlyFallback,
      diagnostics,
    };
  }
  if (lines.length === 0 && truthMode === "derived_only") {
    const derivedOnlyFallback = "Derived compact recall (not verbatim; use to find truth, not replace it):\n- No derived recall matched this query.";
    diagnostics.noHitReason = "No derived recall matched this query.";
    return {
      prompt: routingNote ? `${routingNote}\n\n${derivedOnlyFallback}` : derivedOnlyFallback,
      diagnostics,
    };
  }

  if (routingNote) {
    lines.unshift("", routingNote);
    lines.shift();
  }

  if (lines.length === 0) {
    diagnostics.noHitReason = "No memory recall matched this query.";
  }

  return {
    prompt: lines.join("\n"),
    diagnostics,
  };
}

function createMemoryRecallCountSnapshot(total: number, shown: number): MemoryRecallCountSnapshot {
  const normalizedTotal = Math.max(0, total);
  const normalizedShown = Math.max(0, Math.min(shown, normalizedTotal));
  return {
    total: normalizedTotal,
    shown: normalizedShown,
    hidden: Math.max(0, normalizedTotal - normalizedShown),
    state: normalizedTotal === 0
      ? "empty"
      : normalizedShown < normalizedTotal
        ? "truncated"
        : "full",
  };
}

function buildMemoryRecallSectionState(
  truthMode: MemoryTruthMode,
  counts: {
    exact: MemoryRecallCountSnapshot;
    compact: MemoryRecallCountSnapshot;
    structured: MemoryRecallCountSnapshot;
    palaceDirect: MemoryRecallCountSnapshot;
    palaceNearby: MemoryRecallCountSnapshot;
    palaceBroader: MemoryRecallCountSnapshot;
    palaceRelated: MemoryRecallCountSnapshot;
  },
): Record<string, MemoryRecallSectionState> {
  const sectionState: Record<string, MemoryRecallSectionState> = {};
  if (truthMode !== "derived_only") {
    sectionState.exact = counts.exact.state;
    sectionState["palace-direct"] = counts.palaceDirect.state;
    sectionState["palace-nearby"] = counts.palaceNearby.state;
    sectionState["palace-broader"] = counts.palaceBroader.state;
    sectionState["palace-related"] = counts.palaceRelated.state;
  }
  if (truthMode !== "exact_only") {
    sectionState.compact = counts.compact.state;
    sectionState.structured = counts.structured.state;
  }
  return sectionState;
}

function formatVisibleCountHeader(header: string, shownCount: number, totalCount: number): string {
  if (totalCount <= 0) return header;
  return `${header} showing ${shownCount} of ${totalCount}`;
}

function formatHiddenCountNote(
  shownCount: number,
  totalCount: number,
  singularLabel: string,
  pluralLabel = `${singularLabel}s`,
): string | null {
  const hiddenCount = totalCount - shownCount;
  if (hiddenCount <= 0) return null;
  return `- ... ${hiddenCount} more ${hiddenCount === 1 ? singularLabel : pluralLabel} hidden.`;
}

function formatStructuredCategoryMix(entries: StoredExtractedMemory[]): string {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  }
  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([category, count]) => `${category}=${count}`);
  return ranked.length > 0 ? ranked.join(",") : "none";
}

function formatPalaceHallMix(entries: SearchHit[]): string {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const hall = entry.hall || "unknown";
    counts.set(hall, (counts.get(hall) ?? 0) + 1);
  }
  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([hall, count]) => `${hall}=${count}`);
  return ranked.length > 0 ? ranked.join(",") : "none";
}

function formatPalaceRoomMix(entries: SearchHit[]): string {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const room = entry.room || "unknown";
    counts.set(room, (counts.get(room) ?? 0) + 1);
  }
  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([room, count]) => `${room}=${count}`);
  return ranked.length > 0 ? ranked.join(",") : "none";
}

function formatPalaceWingMix(entries: SearchHit[]): string {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const wing = entry.wing || "unknown";
    counts.set(wing, (counts.get(wing) ?? 0) + 1);
  }
  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([wing, count]) => `${wing}=${count}`);
  return ranked.length > 0 ? ranked.join(",") : "none";
}

function formatPalaceSourceMix(entries: SearchHit[]): string {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const source = entry.sourceFile || "unknown";
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([source, count]) => `${source}=${count}`);
  return ranked.length > 0 ? ranked.join(",") : "none";
}

function collectMemoryTruthSignals(query: string): {
  exactOnly: string[];
  derivedOnly: string[];
  preferExact: string[];
  preferDerived: string[];
} {
  const lower = query.toLowerCase();
  const exactOnly: string[] = [];
  const derivedOnly: string[] = [];
  const preferExact: string[] = [];
  const preferDerived: string[] = [];

  if (lower.includes("exact")) exactOnly.push("exact");
  if (lower.includes("verbatim")) exactOnly.push("verbatim");
  if (lower.includes("quote")) exactOnly.push("quote");
  if (lower.includes("as written")) exactOnly.push("as-written");
  if (lower.includes("source truth")) exactOnly.push("source-truth");
  if (lower.includes("exact phrase")) exactOnly.push("exact-phrase");

  if (lower.includes("summary")) derivedOnly.push("summary");
  if (lower.includes("summarize")) derivedOnly.push("summarize");
  if (lower.includes("recap")) derivedOnly.push("recap");
  if (lower.includes("overview")) derivedOnly.push("overview");
  if (lower.includes("gist")) derivedOnly.push("gist");

  if (lower.includes("wording")) preferExact.push("wording");
  if (lower.includes("what did i say")) preferExact.push("said-by-me");
  if (lower.includes("literal")) preferExact.push("literal");

  if (lower.includes("context")) preferDerived.push("context");
  if (lower.includes("background")) preferDerived.push("background");
  if (lower.includes("remind me")) preferDerived.push("remind-me");
  if (hasDecisionIntent(query)) preferDerived.push("decision");
  if (hasReasoningIntent(query)) preferDerived.push("reasoning");
  if (hasAdviceIntent(query)) preferDerived.push("advice");
  if (hasRiskIntent(query)) preferDerived.push("risk");
  if (hasComparisonIntent(query)) preferDerived.push("comparison");
  if (hasPreferenceIntent(query)) preferDerived.push("preference");
  if (hasEventIntent(query)) preferDerived.push("event");
  if (hasConstraintIntent(query)) preferDerived.push("constraint");
  if (hasDiagnosticIntent(query)) preferDerived.push("diagnostic");
  if (hasDiscoveryIntent(query)) preferDerived.push("discovery");
  if (hasOwnershipIntent(query)) preferDerived.push("ownership");
  if (hasEntityIntent(query)) preferDerived.push("entity");
  if (hasMetricIntent(query)) preferDerived.push("metric");
  if (hasFactIntent(query)) preferDerived.push("fact");
  if (hasProcedureIntent(query)) preferDerived.push("procedure");
  if (hasPatternIntent(query)) preferDerived.push("pattern");

  return { exactOnly, derivedOnly, preferExact, preferDerived };
}

export function inferMemoryTruthMode(query: string): MemoryTruthMode {
  const signals = collectMemoryTruthSignals(query);
  if (signals.exactOnly.length > 0) {
    return "exact_only";
  }
  if (signals.derivedOnly.length > 0) {
    return "derived_only";
  }
  if (signals.preferExact.length > 0) {
    return "prefer_exact";
  }
  if (signals.preferDerived.length > 0) {
    return "prefer_derived";
  }
  return "balanced";
}

export function inferMemoryTruthProvenance(query: string): string[] {
  const signals = collectMemoryTruthSignals(query);
  if (
    signals.exactOnly.length > 0
  ) {
    return signals.exactOnly;
  }
  if (
    signals.derivedOnly.length > 0
  ) {
    return signals.derivedOnly;
  }
  if (
    signals.preferExact.length > 0
  ) {
    return signals.preferExact;
  }
  if (
    signals.preferDerived.length > 0
  ) {
    return signals.preferDerived;
  }
  return ["default"];
}

function inferRolePreferenceProvenance(query: string): string[] {
  const lower = query.toLowerCase();
  if (
    lower.includes("what did i say")
    || lower.includes("i said")
    || lower.includes("my wording")
    || lower.includes("my words")
    || lower.includes("user said")
  ) {
    return ["user-said"];
  }
  if (
    lower.includes("what did you say")
    || lower.includes("you said")
    || lower.includes("your wording")
    || lower.includes("your words")
    || lower.includes("you told me")
    || lower.includes("assistant said")
  ) {
    return ["assistant-said"];
  }
  if (hasReasoningIntent(query)) return ["reasoning"];
  if (hasDiagnosticIntent(query)) return ["diagnostic"];
  if (hasDecisionIntent(query)) return ["decision"];
  if (hasAdviceIntent(query)) return ["advice"];
  if (hasMetricIntent(query)) return ["metric"];
  if (hasProcedureIntent(query)) return ["procedure"];
  if (hasRiskIntent(query)) return ["risk"];
  if (hasComparisonIntent(query)) return ["comparison"];
  if (hasPreferenceIntent(query)) return ["preference"];
  if (hasEventIntent(query)) return ["event"];
  if (hasConstraintIntent(query)) return ["constraint"];
  if (hasDiscoveryIntent(query)) return ["discovery"];
  if (hasOwnershipIntent(query)) return ["ownership"];
  if (hasEntityIntent(query)) return ["entity"];
  if (hasFactIntent(query)) return ["fact"];
  if (hasPatternIntent(query)) return ["pattern"];
  if (
    lower.includes("tool")
    || lower.includes("stdout")
    || lower.includes("stderr")
    || lower.includes("output")
    || lower.includes("exit code")
    || lower.includes("command")
    || lower.includes("shell")
  ) {
    return ["tool-output"];
  }
  return [];
}

function inferSessionPreferenceProvenance(query: string): string[] {
  const lower = query.toLowerCase();
  const archived: Array<[string, string]> = [
    ["previous session", "previous-session"],
    ["earlier session", "earlier-session"],
    ["last session", "last-session"],
    ["prior session", "prior-session"],
    ["previous run", "previous-run"],
    ["earlier run", "earlier-run"],
    ["last run", "last-run"],
    ["prior run", "prior-run"],
    ["archived session", "archived-session"],
    ["old session", "old-session"],
    ["from before", "from-before"],
  ];
  const current: Array<[string, string]> = [
    ["current session", "current-session"],
    ["this session", "this-session"],
    ["current run", "current-run"],
    ["this run", "this-run"],
    ["latest session", "latest-session"],
    ["latest run", "latest-run"],
  ];
  const archivedMatches = archived.filter(([needle]) => lower.includes(needle)).map(([, label]) => label);
  if (archivedMatches.length > 0) return archivedMatches;
  const currentMatches = current.filter(([needle]) => lower.includes(needle)).map(([, label]) => label);
  if (currentMatches.length > 0) return currentMatches;
  return [];
}

function inferTimePreferenceProvenance(query: string): string[] {
  const lower = query.toLowerCase();
  const recent: Array<[string, string]> = [
    ["latest", "latest"],
    ["newest", "newest"],
    ["most recent", "most-recent"],
    ["recent", "recent"],
  ];
  const oldest: Array<[string, string]> = [
    ["earliest", "earliest"],
    ["oldest", "oldest"],
    ["first ", "first"],
    [" initial", "initial"],
    ["initial", "initial"],
    ["original", "original"],
  ];
  const recentMatches = recent.filter(([needle]) => lower.includes(needle)).map(([, label]) => label);
  if (recentMatches.length > 0) return [...new Set(recentMatches)];
  const oldestMatches = oldest
    .filter(([needle]) => lower.includes(needle) || (needle === "first" && lower.endsWith(" first")))
    .map(([, label]) => label);
  if (oldestMatches.length > 0) return [...new Set(oldestMatches)];
  return [];
}

export function inferMempalaceHall(query: string): HallType | undefined {
  const lower = query.toLowerCase();
  if (
    hasDecisionIntent(query)
    || lower.includes("constraint")
    || lower.includes("rule")
    || lower.includes("requirement")
    || lower.includes("why did we")
    || hasReasoningIntent(query)
    || hasRiskIntent(query)
    || hasComparisonIntent(query)
    || hasConstraintIntent(query)
    || hasDiagnosticIntent(query)
    || hasEntityIntent(query)
    || hasMetricIntent(query)
    || hasFactIntent(query)
  ) {
    return "hall_facts";
  }
  if (
    lower.includes("discover")
    || lower.includes("learn")
    || lower.includes("breakthrough")
    || lower.includes("insight")
    || hasDiscoveryIntent(query)
    || hasPatternIntent(query)
  ) {
    return "hall_discoveries";
  }
  if (
    lower.includes("prefer")
    || lower.includes("preference")
    || lower.includes("like")
    || lower.includes("dislike")
    || lower.includes("habit")
    || hasPreferenceIntent(query)
  ) {
    return "hall_preferences";
  }
  if (hasAdviceIntent(query)) {
    return "hall_advice";
  }
  if (hasProcedureIntent(query)) {
    return "hall_advice";
  }
  if (
    lower.includes("when")
    || lower.includes("happened")
    || lower.includes("session")
    || lower.includes("milestone")
    || lower.includes("debug")
    || lower.includes("incident")
    || hasEventIntent(query)
  ) {
    return "hall_events";
  }
  return undefined;
}

export function inferMempalaceHallProvenance(query: string): string[] {
  const lower = query.toLowerCase();
  const factSignals: string[] = [];
  if (hasDecisionIntent(query)) factSignals.push("decision");
  if (lower.includes("constraint") || lower.includes("rule") || lower.includes("requirement") || hasConstraintIntent(query)) factSignals.push("constraint");
  if (lower.includes("why did we") || hasReasoningIntent(query)) factSignals.push("reasoning");
  if (hasRiskIntent(query)) factSignals.push("risk");
  if (hasComparisonIntent(query)) factSignals.push("comparison");
  if (hasDiagnosticIntent(query)) factSignals.push("diagnostic");
  if (hasOwnershipIntent(query)) factSignals.push("ownership");
  if (hasEntityIntent(query)) factSignals.push("entity");
  if (hasMetricIntent(query)) factSignals.push("metric");
  if (hasFactIntent(query)) factSignals.push("fact");
  if (factSignals.length > 0) return factSignals;

  const discoverySignals: string[] = [];
  if (lower.includes("discover") || lower.includes("learn") || lower.includes("breakthrough") || lower.includes("insight") || hasDiscoveryIntent(query)) discoverySignals.push("discovery");
  if (hasPatternIntent(query)) discoverySignals.push("pattern");
  if (discoverySignals.length > 0) return discoverySignals;

  const preferenceSignals: string[] = [];
  if (lower.includes("prefer") || lower.includes("preference") || lower.includes("like") || lower.includes("dislike") || lower.includes("habit") || hasPreferenceIntent(query)) preferenceSignals.push("preference");
  if (preferenceSignals.length > 0) return preferenceSignals;

  if (hasAdviceIntent(query)) return ["advice"];
  if (hasProcedureIntent(query)) return ["procedure"];

  const eventSignals: string[] = [];
  if (lower.includes("when") || lower.includes("happened") || lower.includes("session") || lower.includes("milestone") || lower.includes("debug") || lower.includes("incident") || hasEventIntent(query)) eventSignals.push("event");
  if (eventSignals.length > 0) return eventSignals;

  return ["default"];
}

export function inferMempalaceWing(query: string, session: Pick<AgentSession, "tenantScope" | "metadata">): string | undefined {
  const candidates = collectMempalaceWingCandidates(session);
  if (candidates.length === 0) return undefined;

  const normalizedQuery = normalizeWingToken(query);
  const explicit = candidates.find((candidate) => normalizedQuery.includes(normalizeWingToken(candidate)));
  if (explicit) return explicit;

  return candidates.length === 1 ? candidates[0] : undefined;
}

export function inferMempalaceWingProvenance(query: string, session: Pick<AgentSession, "tenantScope" | "metadata">): string[] {
  const candidates = collectMempalaceWingCandidates(session);
  if (candidates.length === 0) return ["default"];
  const normalizedQuery = normalizeWingToken(query);
  const explicit = candidates.find((candidate) => normalizedQuery.includes(normalizeWingToken(candidate)));
  if (explicit) return ["query"];
  if (candidates.length === 1) return ["single-candidate"];
  return ["default"];
}

export function inferMempalaceRoom(query: string, rooms: string[]): string | undefined {
  if (rooms.length === 0) return undefined;
  const normalizedQuery = normalizeWingToken(query);
  return rooms.find((room) => normalizedQuery.includes(normalizeWingToken(room)));
}

export function shouldExpandMempalaceContext(query: string): boolean {
  const lower = query.toLowerCase();
  const wantsNarrowExact = lower.includes("exact")
    || lower.includes("verbatim")
    || lower.includes("literally")
    || lower.includes("quote")
    || lower.includes("as written");
  return lower.includes("background")
    || lower.includes("context")
    || lower.includes("around")
    || lower.includes("nearby")
    || lower.includes("related")
    || lower.includes("broader")
    || (hasDecisionIntent(query) && !wantsNarrowExact)
    || (hasConstraintIntent(query) && !wantsNarrowExact)
    || (hasAdviceIntent(query) && !wantsNarrowExact)
    || (hasMetricIntent(query) && !wantsNarrowExact)
    || (hasProcedureIntent(query) && !wantsNarrowExact)
    || (hasPreferenceIntent(query) && !wantsNarrowExact)
    || (hasRiskIntent(query) && !wantsNarrowExact)
    || (hasDiagnosticIntent(query) && !wantsNarrowExact)
    || (hasEntityIntent(query) && !wantsNarrowExact)
    || (hasFactIntent(query) && !wantsNarrowExact)
    || (hasPatternIntent(query) && !wantsNarrowExact)
    || hasReasoningIntent(query)
    || hasComparisonIntent(query)
    || hasDiscoveryIntent(query)
    || hasEventIntent(query);
}

export function inferMempalaceExpandProvenance(query: string): string[] {
  const lower = query.toLowerCase();
  const wantsNarrowExact = lower.includes("exact")
    || lower.includes("verbatim")
    || lower.includes("literally")
    || lower.includes("quote")
    || lower.includes("as written");
  const signals: string[] = [];
  if (lower.includes("background")) signals.push("background");
  if (lower.includes("context")) signals.push("context");
  if (lower.includes("around")) signals.push("around");
  if (lower.includes("nearby")) signals.push("nearby");
  if (lower.includes("related")) signals.push("related");
  if (lower.includes("broader")) signals.push("broader");
  if (hasDecisionIntent(query) && !wantsNarrowExact) signals.push("decision");
  if (hasConstraintIntent(query) && !wantsNarrowExact) signals.push("constraint");
  if (hasAdviceIntent(query) && !wantsNarrowExact) signals.push("advice");
  if (hasMetricIntent(query) && !wantsNarrowExact) signals.push("metric");
  if (hasProcedureIntent(query) && !wantsNarrowExact) signals.push("procedure");
  if (hasPreferenceIntent(query) && !wantsNarrowExact) signals.push("preference");
  if (hasRiskIntent(query) && !wantsNarrowExact) signals.push("risk");
  if (hasDiagnosticIntent(query) && !wantsNarrowExact) signals.push("diagnostic");
  if (hasOwnershipIntent(query) && !wantsNarrowExact) signals.push("ownership");
  if (hasEntityIntent(query) && !wantsNarrowExact) signals.push("entity");
  if (hasFactIntent(query) && !wantsNarrowExact) signals.push("fact");
  if (hasPatternIntent(query) && !wantsNarrowExact) signals.push("pattern");
  if (hasReasoningIntent(query)) signals.push("reasoning");
  if (hasComparisonIntent(query)) signals.push("comparison");
  if (hasDiscoveryIntent(query)) signals.push("discovery");
  if (hasEventIntent(query)) signals.push("event");
  return signals.length > 0 ? signals : ["default"];
}

export function shouldBroadenMempalaceTraversal(query: string): boolean {
  const lower = query.toLowerCase();
  const wantsNarrowExact = lower.includes("exact")
    || lower.includes("verbatim")
    || lower.includes("literally")
    || lower.includes("quote")
    || lower.includes("as written");
  return lower.includes("broader")
    || lower.includes("bigger picture")
    || lower.includes("full context")
    || lower.includes("surrounding")
    || lower.includes("wider")
    || hasReasoningIntent(query)
    || hasComparisonIntent(query)
    || hasDiscoveryIntent(query)
    || hasEventIntent(query)
    || (hasDecisionIntent(query) && !wantsNarrowExact)
    || (hasConstraintIntent(query) && !wantsNarrowExact)
    || (hasAdviceIntent(query) && !wantsNarrowExact)
    || (hasMetricIntent(query) && !wantsNarrowExact)
    || (hasProcedureIntent(query) && !wantsNarrowExact)
    || (hasPreferenceIntent(query) && !wantsNarrowExact)
    || (hasRiskIntent(query) && !wantsNarrowExact)
    || (hasDiagnosticIntent(query) && !wantsNarrowExact)
    || (hasEntityIntent(query) && !wantsNarrowExact)
    || (hasFactIntent(query) && !wantsNarrowExact)
    || (hasPatternIntent(query) && !wantsNarrowExact);
}

export function inferMempalaceBroadenProvenance(query: string): string[] {
  const lower = query.toLowerCase();
  const wantsNarrowExact = lower.includes("exact")
    || lower.includes("verbatim")
    || lower.includes("literally")
    || lower.includes("quote")
    || lower.includes("as written");
  const signals: string[] = [];
  if (lower.includes("broader")) signals.push("broader");
  if (lower.includes("bigger picture")) signals.push("bigger-picture");
  if (lower.includes("full context")) signals.push("full-context");
  if (lower.includes("surrounding")) signals.push("surrounding");
  if (lower.includes("wider")) signals.push("wider");
  if (hasReasoningIntent(query)) signals.push("reasoning");
  if (hasComparisonIntent(query)) signals.push("comparison");
  if (hasDiscoveryIntent(query)) signals.push("discovery");
  if (hasEventIntent(query)) signals.push("event");
  if (hasDecisionIntent(query) && !wantsNarrowExact) signals.push("decision");
  if (hasConstraintIntent(query) && !wantsNarrowExact) signals.push("constraint");
  if (hasAdviceIntent(query) && !wantsNarrowExact) signals.push("advice");
  if (hasMetricIntent(query) && !wantsNarrowExact) signals.push("metric");
  if (hasProcedureIntent(query) && !wantsNarrowExact) signals.push("procedure");
  if (hasPreferenceIntent(query) && !wantsNarrowExact) signals.push("preference");
  if (hasRiskIntent(query) && !wantsNarrowExact) signals.push("risk");
  if (hasDiagnosticIntent(query) && !wantsNarrowExact) signals.push("diagnostic");
  if (hasOwnershipIntent(query) && !wantsNarrowExact) signals.push("ownership");
  if (hasEntityIntent(query) && !wantsNarrowExact) signals.push("entity");
  if (hasFactIntent(query) && !wantsNarrowExact) signals.push("fact");
  if (hasPatternIntent(query) && !wantsNarrowExact) signals.push("pattern");
  return signals.length > 0 ? signals : ["default"];
}

type PalaceSectionKey = "direct" | "nearby" | "broader" | "related";

type PalaceSection = {
  key: PalaceSectionKey;
  hasContent: boolean;
  header: string;
  rows: string[];
  hiddenNote?: string;
};

type BroaderRoomCandidate = {
  room: string;
  hop: number;
  viaRoom?: string;
};

type RelatedRoomCandidate = {
  room: string;
  via: "direct" | "resolved" | "tunnel" | "nearby" | "tunnel-fallback";
};

export function inferPalaceRecallPriority(query: string): PalaceSectionKey[] {
  const lower = query.toLowerCase();
  const wantsRelated = lower.includes("related") || lower.includes("cross") || lower.includes("similar");
  const explicitBroad = lower.includes("broader")
    || lower.includes("bigger picture")
    || lower.includes("full context")
    || lower.includes("surrounding")
    || lower.includes("wider")
    || lower.includes("background")
    || lower.includes("context");
  const wantsBroad = shouldBroadenMempalaceTraversal(query) || explicitBroad;
  const broaderFirst = explicitBroad
    || hasReasoningIntent(query)
    || hasComparisonIntent(query)
    || hasDiscoveryIntent(query)
    || hasEventIntent(query);

  if (wantsBroad && wantsRelated) {
    return broaderFirst
      ? ["broader", "related", "nearby", "direct"]
      : ["related", "direct", "nearby", "broader"];
  }
  if (wantsBroad) {
    return broaderFirst
      ? ["broader", "nearby", "related", "direct"]
      : ["direct", "nearby", "broader", "related"];
  }
  if (wantsRelated) {
    return ["related", "direct", "nearby", "broader"];
  }
  return ["direct", "nearby", "broader", "related"];
}

export function inferPalaceRecallPriorityProvenance(query: string): string[] {
  const lower = query.toLowerCase();
  const signals: string[] = [];
  if (lower.includes("related")) signals.push("related");
  if (lower.includes("cross")) signals.push("cross");
  if (lower.includes("similar")) signals.push("similar");
  if (lower.includes("broader")) signals.push("broader");
  if (lower.includes("bigger picture")) signals.push("bigger-picture");
  if (lower.includes("full context")) signals.push("full-context");
  if (lower.includes("surrounding")) signals.push("surrounding");
  if (lower.includes("wider")) signals.push("wider");
  if (lower.includes("background")) signals.push("background");
  if (lower.includes("context")) signals.push("context");
  if (hasReasoningIntent(query)) signals.push("reasoning");
  if (hasComparisonIntent(query)) signals.push("comparison");
  if (hasDiscoveryIntent(query)) signals.push("discovery");
  if (hasEventIntent(query)) signals.push("event");
  return signals.length > 0 ? [...new Set(signals)] : ["default"];
}

type MemorySectionGroup = {
  kind: "exact" | "derived";
  lines: string[];
};

type RenderedMemorySectionKey =
  | "exact"
  | "compact"
  | "structured"
  | "palace-direct"
  | "palace-nearby"
  | "palace-broader"
  | "palace-related";

type DerivedSectionKey = "compact" | "structured";

export function inferMemorySectionPriority(truthMode: MemoryTruthMode): Array<"exact" | "derived"> {
  switch (truthMode) {
    case "prefer_derived":
    case "derived_only":
      return ["derived", "exact"];
    case "prefer_exact":
    case "exact_only":
    case "balanced":
    default:
      return ["exact", "derived"];
  }
}

export function inferDerivedSectionPriority(query: string): DerivedSectionKey[] {
  const lower = query.toLowerCase();
  if (hasEventIntent(query)) {
    return ["compact", "structured"];
  }
  if (hasComparisonIntent(query)) {
    return ["compact", "structured"];
  }
  if (
    hasDecisionIntent(query)
    || lower.includes("constraint")
    || lower.includes("rule")
    || lower.includes("requirement")
    || lower.includes("preference")
    || lower.includes("fact")
    || hasOwnershipIntent(query)
    || hasDiagnosticIntent(query)
    || hasEntityIntent(query)
    || hasMetricIntent(query)
    || hasProcedureIntent(query)
    || hasReasoningIntent(query)
    || hasAdviceIntent(query)
    || hasRiskIntent(query)
    || hasComparisonIntent(query)
    || hasPreferenceIntent(query)
    || hasConstraintIntent(query)
    || hasDiscoveryIntent(query)
    || hasPatternIntent(query)
  ) {
    return ["structured", "compact"];
  }
  return ["compact", "structured"];
}

export function inferDerivedSectionPriorityProvenance(query: string): string[] {
  const lower = query.toLowerCase();
  if (hasEventIntent(query)) return ["event"];
  if (hasComparisonIntent(query)) return ["comparison"];
  const structuredSignals: string[] = [];
  if (hasDecisionIntent(query)) structuredSignals.push("decision");
  if (lower.includes("constraint") || lower.includes("rule") || lower.includes("requirement") || hasConstraintIntent(query)) structuredSignals.push("constraint");
  if (lower.includes("preference") || hasPreferenceIntent(query)) structuredSignals.push("preference");
  if (lower.includes("fact") || hasFactIntent(query)) structuredSignals.push("fact");
  if (hasDiagnosticIntent(query)) structuredSignals.push("diagnostic");
  if (hasOwnershipIntent(query)) structuredSignals.push("ownership");
  if (hasEntityIntent(query)) structuredSignals.push("entity");
  if (hasMetricIntent(query)) structuredSignals.push("metric");
  if (hasProcedureIntent(query)) structuredSignals.push("procedure");
  if (hasReasoningIntent(query)) structuredSignals.push("reasoning");
  if (hasAdviceIntent(query)) structuredSignals.push("advice");
  if (hasRiskIntent(query)) structuredSignals.push("risk");
  if (hasDiscoveryIntent(query)) structuredSignals.push("discovery");
  if (hasPatternIntent(query)) structuredSignals.push("pattern");
  return structuredSignals.length > 0 ? structuredSignals : ["default"];
}

export function inferCompactDerivedFocus(query: string): "timeline" | "delta" | "recap" | null {
  const lower = query.toLowerCase();
  if (hasEventIntent(query)) return "timeline";
  if (hasComparisonIntent(query)) return "delta";
  if (
    lower.includes("summary")
    || lower.includes("summarize")
    || lower.includes("recap")
    || lower.includes("overview")
    || lower.includes("gist")
  ) {
    return "recap";
  }
  return null;
}

export function inferCompactDerivedFocusProvenance(query: string): string[] {
  const lower = query.toLowerCase();
  if (hasEventIntent(query)) return ["event"];
  if (hasComparisonIntent(query)) return ["comparison"];
  const recapSignals: Array<[string, string]> = [
    ["summary", "summary"],
    ["summarize", "summarize"],
    ["recap", "recap"],
    ["overview", "overview"],
    ["gist", "gist"],
  ];
  const matches = recapSignals
    .filter(([needle]) => lower.includes(needle))
    .map(([, label]) => label);
  return matches.length > 0 ? matches : [];
}

export function inferStructuredFocusProvenance(query: string): string[] {
  if (hasPatternIntent(query)) return ["pattern"];
  if (hasDiagnosticIntent(query)) return ["diagnostic"];
  if (hasEventIntent(query)) return ["event"];
  if (hasDiscoveryIntent(query)) return ["discovery"];
  if (hasOwnershipIntent(query)) return ["ownership"];
  if (hasEntityIntent(query)) return ["entity"];
  if (hasMetricIntent(query)) return ["metric"];
  if (hasProcedureIntent(query)) return ["procedure"];
  if (hasFactIntent(query)) return ["fact"];
  if (hasPreferenceIntent(query)) return ["preference"];
  if (hasRiskIntent(query)) return ["risk"];
  if (hasConstraintIntent(query)) return ["constraint"];
  if (hasComparisonIntent(query)) return ["comparison"];
  if (hasAdviceIntent(query)) return ["advice"];
  if (hasReasoningIntent(query)) return ["reasoning"];
  if (hasDecisionIntent(query)) return ["decision"];
  return [];
}

export function inferMemoryIntentTags(query: string): string[] {
  const intents: string[] = [];
  const metricIntent = hasMetricIntent(query);
  const procedureIntent = hasProcedureIntent(query);
  const adviceIntent = hasAdviceIntent(query);
  if (hasDecisionIntent(query)) intents.push("decision");
  if (hasReasoningIntent(query)) intents.push("reasoning");
  if (hasDiagnosticIntent(query)) intents.push("diagnostic");
  if (adviceIntent && !metricIntent) intents.push("advice");
  if (metricIntent) intents.push("metric");
  if (procedureIntent) intents.push("procedure");
  if (hasRiskIntent(query)) intents.push("risk");
  if (hasComparisonIntent(query)) intents.push("comparison");
  if (hasPreferenceIntent(query)) intents.push("preference");
  if (hasEventIntent(query)) intents.push("event");
  if (hasConstraintIntent(query)) intents.push("constraint");
  if (hasDiscoveryIntent(query)) intents.push("discovery");
  if (hasOwnershipIntent(query)) intents.push("ownership");
  if (hasEntityIntent(query)) intents.push("entity");
  if (hasFactIntent(query)) intents.push("fact");
  if (hasPatternIntent(query)) intents.push("pattern");
  return intents;
}

function inferStructuredSectionHeader(
  query: string,
  entries: Array<{ category: string }>,
): string {
  const primaryCategory = inferPrimaryStructuredCategory(query);
  if (primaryCategory) {
    return structuredCategoryHeader(primaryCategory);
  }
  if (entries.length > 0) {
    const firstCategory = entries[0]?.category;
    if (firstCategory && entries.every((entry) => entry.category === firstCategory)) {
      return structuredCategoryHeader(firstCategory);
    }
  }
  return structuredCategoryHeader("fact");
}

function formatStructuredDerivedSections(
  query: string,
  entries: StoredExtractedMemory[],
): string[] {
  const primaryCategory = inferPrimaryStructuredCategory(query);
  const limited = entries.slice(0, 4);
  const categoryTotals = new Map<string, number>();
  for (const entry of entries) {
    categoryTotals.set(entry.category, (categoryTotals.get(entry.category) ?? 0) + 1);
  }
  if (!primaryCategory) {
    const lines: string[] = [formatVisibleCountHeader(
      inferStructuredSectionHeader(query, limited),
      limited.length,
      entries.length,
    )];
    for (const [index, entry] of limited.entries()) {
      lines.push(formatStructuredDerivedEntry(entry, index + 1));
    }
    const hiddenNote = formatHiddenCountNote(limited.length, entries.length, "durable memory match", "durable memory matches");
    if (hiddenNote) lines.push(hiddenNote);
    return lines;
  }

  const primary = limited.filter((entry) => entry.category === primaryCategory);
  const supporting = limited.filter((entry) => entry.category !== primaryCategory);
  if (primary.length === 0) {
    const lines: string[] = [formatVisibleCountHeader(
      inferStructuredSectionHeader(query, limited),
      limited.length,
      entries.length,
    )];
    for (const [index, entry] of limited.entries()) {
      lines.push(formatStructuredDerivedEntry(entry, index + 1));
    }
    const hiddenNote = formatHiddenCountNote(limited.length, entries.length, "durable memory match", "durable memory matches");
    if (hiddenNote) lines.push(hiddenNote);
    return lines;
  }

  let nextRank = 1;
  const lines: string[] = [formatVisibleCountHeader(
    inferStructuredSectionHeader(query, primary),
    primary.length,
    categoryTotals.get(primaryCategory) ?? primary.length,
  )];
  for (const entry of primary) {
    lines.push(formatStructuredDerivedEntry(entry, nextRank));
    nextRank += 1;
  }
  const hiddenPrimaryNote = formatHiddenCountNote(
    primary.length,
    categoryTotals.get(primaryCategory) ?? primary.length,
    `${primaryCategory} durable memory match`,
    `${primaryCategory} durable memory matches`,
  );
  if (hiddenPrimaryNote) lines.push(hiddenPrimaryNote);
  if (supporting.length > 0) {
    lines.push("");
    lines.push(...formatSupportingStructuredSections(supporting, nextRank, categoryTotals));
  }
  return lines;
}

function inferPrimaryStructuredCategory(
  query: string,
): "advice" | "reasoning" | "diagnostic" | "entity" | "metric" | "procedure" | "decision" | "preference" | "constraint" | "risk" | "change" | "fact" | "discovery" | "event" | "pattern" | null {
  if (hasPatternIntent(query)) return "pattern";
  if (hasDiagnosticIntent(query)) return "diagnostic";
  if (hasEventIntent(query)) return "event";
  if (hasDiscoveryIntent(query)) return "discovery";
  if (hasOwnershipIntent(query)) return "fact";
  if (hasEntityIntent(query)) return "entity";
  if (hasMetricIntent(query)) return "metric";
  if (hasProcedureIntent(query)) return "procedure";
  if (hasFactIntent(query)) return "fact";
  if (hasPreferenceIntent(query)) return "preference";
  if (hasRiskIntent(query)) return "risk";
  if (hasConstraintIntent(query)) return "constraint";
  if (hasComparisonIntent(query)) return "change";
  if (hasAdviceIntent(query)) return "advice";
  if (hasReasoningIntent(query)) return "reasoning";
  if (hasDecisionIntent(query)) return "decision";
  return null;
}

function formatStructuredDerivedEntry(entry: StoredExtractedMemory, rank?: number): string {
  const scopeTag = entry.scope === "agent" ? `agent:${entry.agentId}` : "colony";
  const rankTag = formatRecallRankTag(rank);
  const confidenceTag = `conf:${entry.confidence.toFixed(2)}`;
  const scoreTag = formatRecallScoreTag(entry.matchScore);
  const timestampTag = `ts:${formatStructuredTimestamp(entry.timestamp)}`;
  const turnTag = `turn:${entry.sourceTurn}`;
  const sourceTag = `src:${entry.source ?? "unknown"}`;
  const pathTag = formatArtifactTranscriptPath(entry.filePath);
  const reasonsTag = formatRecallReasonsTag(entry.matchReasons);
  return `- [${scopeTag}/${entry.category}/${rankTag}/${confidenceTag}/${scoreTag}/${timestampTag}/${turnTag}/${sourceTag}/${pathTag}/session:${entry.sessionId}/${reasonsTag}] ${compactPreview(entry.content)}`;
}

function structuredCategoryHeader(category: string): string {
  switch (category) {
    case "advice":
      return "Reusable advice (derived, scoped, durable):";
    case "reasoning":
      return "Reusable reasoning (derived, scoped, durable):";
    case "diagnostic":
      return "Reusable diagnostics (derived, scoped, durable):";
    case "entity":
      return "Reusable entities (derived, scoped, durable):";
    case "metric":
      return "Reusable metrics (derived, scoped, durable):";
    case "procedure":
      return "Reusable procedures (derived, scoped, durable):";
    case "event":
      return "Structured timeline memory (derived, scoped, durable):";
    case "discovery":
      return "Reusable discoveries (derived, scoped, durable):";
    case "pattern":
      return "Reusable patterns (derived, scoped, durable):";
    case "decision":
      return "Reusable decisions (derived, scoped, durable):";
    case "preference":
      return "Reusable preferences (derived, scoped, durable):";
    case "constraint":
      return "Reusable constraints (derived, scoped, durable):";
    case "risk":
      return "Reusable cautions (derived, scoped, durable):";
    case "change":
      return "Reusable deltas (derived, scoped, durable):";
    case "fact":
    default:
      return "Reusable facts (derived, scoped, durable):";
  }
}

function supportingStructuredCategoryHeader(category: string): string {
  switch (category) {
    case "advice":
      return "Supporting advice (derived, scoped, durable):";
    case "reasoning":
      return "Supporting reasoning (derived, scoped, durable):";
    case "diagnostic":
      return "Supporting diagnostics (derived, scoped, durable):";
    case "entity":
      return "Supporting entities (derived, scoped, durable):";
    case "metric":
      return "Supporting metrics (derived, scoped, durable):";
    case "procedure":
      return "Supporting procedures (derived, scoped, durable):";
    case "event":
      return "Supporting timeline memory (derived, scoped, durable):";
    case "discovery":
      return "Supporting discoveries (derived, scoped, durable):";
    case "pattern":
      return "Supporting patterns (derived, scoped, durable):";
    case "decision":
      return "Supporting decisions (derived, scoped, durable):";
    case "preference":
      return "Supporting preferences (derived, scoped, durable):";
    case "constraint":
      return "Supporting constraints (derived, scoped, durable):";
    case "risk":
      return "Supporting cautions (derived, scoped, durable):";
    case "change":
      return "Supporting deltas (derived, scoped, durable):";
    case "fact":
    default:
      return "Supporting facts (derived, scoped, durable):";
  }
}

function formatSupportingStructuredSections(
  entries: StoredExtractedMemory[],
  startRank: number,
  categoryTotals: Map<string, number>,
): string[] {
  const orderedCategories: string[] = [];
  const grouped = new Map<string, StoredExtractedMemory[]>();
  for (const entry of entries) {
    if (!grouped.has(entry.category)) {
      grouped.set(entry.category, []);
      orderedCategories.push(entry.category);
    }
    grouped.get(entry.category)!.push(entry);
  }

  const lines: string[] = [];
  let nextRank = startRank;
  for (const category of orderedCategories) {
    const group = grouped.get(category);
    if (!group || group.length === 0) continue;
    if (lines.length > 0) lines.push("");
    lines.push(formatVisibleCountHeader(
      supportingStructuredCategoryHeader(category),
      group.length,
      categoryTotals.get(category) ?? group.length,
    ));
    for (const entry of group) {
      lines.push(formatStructuredDerivedEntry(entry, nextRank));
      nextRank += 1;
    }
    const hiddenGroupNote = formatHiddenCountNote(
      group.length,
      categoryTotals.get(category) ?? group.length,
      `${category} durable memory match`,
      `${category} durable memory matches`,
    );
    if (hiddenGroupNote) lines.push(hiddenGroupNote);
  }
  return lines;
}

function formatStructuredTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return "unknown";
  if (timestamp >= 1_000_000_000) {
    return formatIsoTimestamp(new Date(timestamp * 1000).toISOString());
  }
  return String(timestamp);
}

function formatCompactDerivedMemoryEntry(entry: MemoryEntry, rank?: number): string {
  const casteTag = entry.caste || "general";
  const rankTag = formatRecallRankTag(rank);
  const scoreTag = formatRecallScoreTag(entry.matchScore);
  const timestampTag = `ts:${formatStructuredTimestamp(entry.timestamp)}`;
  const turnTag = `turn:${Number.isFinite(entry.sourceTurn) ? entry.sourceTurn : 0}`;
  const sourceTag = `src:${entry.source ?? "unknown"}`;
  const pathTag = formatArtifactTranscriptPath(entry.filePath);
  const reasonsTag = formatRecallReasonsTag(entry.matchReasons);
  return `- [memory:${casteTag}/${rankTag}/${scoreTag}/${timestampTag}/${turnTag}/${sourceTag}/${pathTag}/session:${entry.sessionId}/${reasonsTag}] ${entry.topic}: ${compactPreview(entry.content)}`;
}

function formatArtifactDerivedEntry(entry: {
  sessionId: string;
  content: string;
  score?: number;
  artifactId?: string;
  metadata?: Record<string, unknown>;
}, rank?: number): string {
  const rankTag = formatRecallRankTag(rank);
  const scoreTag = formatRecallScoreTag(entry.score);
  const createdAt = typeof entry.metadata?.createdAt === "string"
    ? formatIsoTimestamp(entry.metadata.createdAt)
    : "unknown";
  const sourceTurnIds = Array.isArray(entry.metadata?.sourceTurnIds)
    ? entry.metadata.sourceTurnIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const sourceRoles = Array.isArray(entry.metadata?.sourceRoles)
    ? entry.metadata.sourceRoles.filter((role): role is string => typeof role === "string" && role.length > 0)
    : [];
  const transcriptPath = typeof entry.metadata?.transcriptPath === "string"
    ? entry.metadata.transcriptPath
    : "";
  const artifactIdTag = entry.artifactId ?? "unknown";
  const sourceTurnsTag = formatArtifactSourceTurns(sourceTurnIds);
  const sourceRolesTag = formatArtifactSourceRoles(sourceRoles);
  const transcriptPathTag = formatArtifactTranscriptPath(transcriptPath);
  const reasonsTag = formatRecallReasonsTag(entry.metadata?.recallReasons);
  return `- [artifact:${entry.sessionId}/${rankTag}/${scoreTag}/id:${artifactIdTag}/ts:${createdAt}/turns:${sourceTurnIds.length}/${sourceTurnsTag}/${sourceRolesTag}/${transcriptPathTag}/${reasonsTag}] ${compactPreview(entry.content, 380)}`;
}

function formatIsoTimestamp(value: string): string {
  return value.replace(".000Z", "Z");
}

function formatArtifactSourceTurns(sourceTurnIds: string[]): string {
  if (sourceTurnIds.length === 0) return "src:none";
  const shown = sourceTurnIds.slice(0, 3).join(",");
  const remainder = sourceTurnIds.length > 3 ? `,+${sourceTurnIds.length - 3}` : "";
  return `src:${shown}${remainder}`;
}

function formatArtifactSourceRoles(sourceRoles: string[]): string {
  if (sourceRoles.length === 0) return "roles:none";
  const orderedUnique = Array.from(new Set(sourceRoles));
  const shown = orderedUnique.slice(0, 3).join(",");
  const remainder = orderedUnique.length > 3 ? `,+${orderedUnique.length - 3}` : "";
  return `roles:${shown}${remainder}`;
}

function formatArtifactTranscriptPath(transcriptPath: string): string {
  if (!transcriptPath) return "path:none";
  const normalized = transcriptPath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const shown = parts.slice(-2).join("/");
  return `path:${shown || normalized}`;
}

function formatVerbatimRecallEntry(entry: {
  sessionId: string;
  content: string;
  score?: number;
  role?: string;
  metadata?: Record<string, unknown>;
}, rank?: number): string {
  const rankTag = formatRecallRankTag(rank);
  const scoreTag = formatRecallScoreTag(entry.score);
  const timestamp = typeof entry.metadata?.timestamp === "number"
    ? formatStructuredTimestamp(entry.metadata.timestamp)
    : "unknown";
  const turnId = typeof entry.metadata?.turnId === "number"
    ? String(entry.metadata.turnId)
    : "unknown";
  const transcriptPath = typeof entry.metadata?.transcriptPath === "string"
    ? formatArtifactTranscriptPath(entry.metadata.transcriptPath)
    : "path:none";
  const roleTag = entry.role ?? "unknown";
  const reasonsTag = formatRecallReasonsTag(entry.metadata?.recallReasons);
  return `- [session:${entry.sessionId}/${rankTag}/${scoreTag}/role:${roleTag}/ts:${timestamp}/turn:${turnId}/${transcriptPath}/${reasonsTag}] ${compactPreview(entry.content)}`;
}

function formatRecallScoreTag(score: number | undefined): string {
  if (!Number.isFinite(score)) return "score:unknown";
  return `score:${score!.toFixed(2)}`;
}

function formatRecallRankTag(rank: number | undefined): string {
  if (!Number.isFinite(rank)) return "rank:unknown";
  return `rank:${Math.max(1, Math.floor(rank!))}`;
}

function formatRecallReasonsTag(value: unknown): string {
  if (!Array.isArray(value)) return "why:none";
  const reasons = value
    .filter((reason): reason is string => typeof reason === "string" && reason.length > 0)
    .slice(0, 5);
  if (reasons.length === 0) return "why:none";
  return `why:${reasons.join(",")}`;
}

function formatPalaceReasonMix(entries: SearchHit[]): string {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const reasons = Array.isArray(entry.metadata?.recallReasons)
      ? entry.metadata.recallReasons.filter((reason): reason is string => typeof reason === "string" && reason.length > 0)
      : [];
    for (const reason of reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([reason, count]) => `${reason}=${count}`);
  return ranked.length > 0 ? ranked.join(",") : "none";
}

function formatExactReasonMix(entries: unknown[]): string {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const metadata = typeof entry === "object" && entry !== null && "metadata" in entry
      ? (entry as { metadata?: Record<string, unknown> }).metadata
      : undefined;
    const reasons = Array.isArray(metadata?.recallReasons)
      ? metadata.recallReasons.filter((reason): reason is string => typeof reason === "string" && reason.length > 0)
      : [];
    for (const reason of reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([reason, count]) => `${reason}=${count}`);
  return ranked.length > 0 ? ranked.join(",") : "none";
}

function formatMatchReasonMix(entries: Array<{ matchReasons?: string[] }>): string {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const reasons = Array.isArray(entry.matchReasons)
      ? entry.matchReasons.filter((reason): reason is string => typeof reason === "string" && reason.length > 0)
      : [];
    for (const reason of reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([reason, count]) => `${reason}=${count}`);
  return ranked.length > 0 ? ranked.join(",") : "none";
}

function formatCompactReasonMix(
  artifactEntries: unknown[],
  markdownEntries: Array<{ matchReasons?: string[] }>,
): string {
  const counts = new Map<string, number>();
  for (const entry of artifactEntries) {
    const metadata = typeof entry === "object" && entry !== null && "metadata" in entry
      ? (entry as { metadata?: Record<string, unknown> }).metadata
      : undefined;
    const reasons = Array.isArray(metadata?.recallReasons)
      ? metadata.recallReasons.filter((reason): reason is string => typeof reason === "string" && reason.length > 0)
      : [];
    for (const reason of reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  for (const entry of markdownEntries) {
    const reasons = Array.isArray(entry.matchReasons)
      ? entry.matchReasons.filter((reason): reason is string => typeof reason === "string" && reason.length > 0)
      : [];
    for (const reason of reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([reason, count]) => `${reason}=${count}`);
  return ranked.length > 0 ? ranked.join(",") : "none";
}

function formatOverallReasonMix(
  exactEntries: unknown[],
  artifactEntries: unknown[],
  markdownEntries: Array<{ matchReasons?: string[] }>,
  structuredEntries: Array<{ matchReasons?: string[] }>,
): string {
  const counts = new Map<string, number>();
  for (const entry of [...exactEntries, ...artifactEntries]) {
    const metadata = typeof entry === "object" && entry !== null && "metadata" in entry
      ? (entry as { metadata?: Record<string, unknown> }).metadata
      : undefined;
    const reasons = Array.isArray(metadata?.recallReasons)
      ? metadata.recallReasons.filter((reason): reason is string => typeof reason === "string" && reason.length > 0)
      : [];
    for (const reason of reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  for (const entry of [...markdownEntries, ...structuredEntries]) {
    const reasons = Array.isArray(entry.matchReasons)
      ? entry.matchReasons.filter((reason): reason is string => typeof reason === "string" && reason.length > 0)
      : [];
    for (const reason of reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([reason, count]) => `${reason}=${count}`);
  return ranked.length > 0 ? ranked.join(",") : "none";
}

function formatWholeMemoryReasonMix(
  exactEntries: unknown[],
  artifactEntries: unknown[],
  markdownEntries: Array<{ matchReasons?: string[] }>,
  structuredEntries: Array<{ matchReasons?: string[] }>,
  palaceEntries: SearchHit[],
): string {
  const counts = new Map<string, number>();
  for (const entry of [...exactEntries, ...artifactEntries]) {
    const metadata = typeof entry === "object" && entry !== null && "metadata" in entry
      ? (entry as { metadata?: Record<string, unknown> }).metadata
      : undefined;
    const reasons = Array.isArray(metadata?.recallReasons)
      ? metadata.recallReasons.filter((reason): reason is string => typeof reason === "string" && reason.length > 0)
      : [];
    for (const reason of reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  for (const entry of [...markdownEntries, ...structuredEntries]) {
    const reasons = Array.isArray(entry.matchReasons)
      ? entry.matchReasons.filter((reason): reason is string => typeof reason === "string" && reason.length > 0)
      : [];
    for (const reason of reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  for (const entry of palaceEntries) {
    const reasons = Array.isArray(entry.metadata?.recallReasons)
      ? entry.metadata.recallReasons.filter((reason): reason is string => typeof reason === "string" && reason.length > 0)
      : [];
    for (const reason of reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([reason, count]) => `${reason}=${count}`);
  return ranked.length > 0 ? ranked.join(",") : "none";
}

function formatDerivedReasonMix(
  artifactEntries: unknown[],
  markdownEntries: Array<{ matchReasons?: string[] }>,
  structuredEntries: Array<{ matchReasons?: string[] }>,
): string {
  const counts = new Map<string, number>();
  for (const entry of artifactEntries) {
    const metadata = typeof entry === "object" && entry !== null && "metadata" in entry
      ? (entry as { metadata?: Record<string, unknown> }).metadata
      : undefined;
    const reasons = Array.isArray(metadata?.recallReasons)
      ? metadata.recallReasons.filter((reason): reason is string => typeof reason === "string" && reason.length > 0)
      : [];
    for (const reason of reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  for (const entry of [...markdownEntries, ...structuredEntries]) {
    const reasons = Array.isArray(entry.matchReasons)
      ? entry.matchReasons.filter((reason): reason is string => typeof reason === "string" && reason.length > 0)
      : [];
    for (const reason of reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([reason, count]) => `${reason}=${count}`);
  return ranked.length > 0 ? ranked.join(",") : "none";
}

function formatPalaceRecallEntry(prefix: string, hit: SearchHit, rank?: number): string {
  const path = [hit.wing, hit.room, hit.hall].filter(Boolean).join("/");
  const provenance: string[] = [];
  provenance.push(formatRecallRankTag(rank));
  if (hit.id) provenance.push(`drawer:${hit.id}`);
  if (hit.sourceFile) provenance.push(`source:${hit.sourceFile}`);
  const recallStage = typeof hit.metadata?.recallStage === "string" ? hit.metadata.recallStage : undefined;
  const recallHop = typeof hit.metadata?.recallHop === "number" ? hit.metadata.recallHop : undefined;
  const recallViaRoom = typeof hit.metadata?.recallViaRoom === "string" ? hit.metadata.recallViaRoom : undefined;
  const recallCrossWing = hit.metadata?.recallCrossWing === true;
  if (recallStage) provenance.push(`stage:${recallStage}`);
  if (Number.isFinite(recallHop)) provenance.push(`hop:${recallHop}`);
  if (recallViaRoom) provenance.push(`via:${recallViaRoom}`);
  if (recallCrossWing) provenance.push("cross-wing");
  if (Number.isFinite(hit.similarity)) provenance.push(`sim:${hit.similarity.toFixed(3)}`);
  if (Number.isFinite(hit.distance)) provenance.push(`dist:${hit.distance.toFixed(4)}`);
  const reasonsTag = formatRecallReasonsTag(hit.metadata?.recallReasons);
  if (reasonsTag !== "why:none") provenance.push(reasonsTag);
  const provenanceTag = provenance.length > 0 ? ` (${provenance.join(" ")})` : "";
  return `- [${prefix}:${path}]${provenanceTag} ${compactPreview(hit.text)}`;
}

function formatMemoryRoutingNote(
  query: string,
  session: AgentSession,
  truthMode: MemoryTruthMode,
  truthProvenance: string[],
  palaceDiagnostics: PalaceRecallDiagnostics,
  counts?: {
    exact: number;
    exactUser: number;
    exactAssistant: number;
    exactTool: number;
    shownExact: number;
    shownExactUser: number;
    shownExactAssistant: number;
    shownExactTool: number;
    exactCurrentSession: number;
    exactArchivedSession: number;
    shownExactCurrentSession: number;
    shownExactArchivedSession: number;
    exactReasonMix: string;
    shownExactReasonMix: string;
    artifact: number;
    shownArtifact: number;
    artifactCurrentSession: number;
    artifactArchivedSession: number;
    shownArtifactCurrentSession: number;
    shownArtifactArchivedSession: number;
    artifactReasonMix: string;
    shownArtifactReasonMix: string;
    markdown: number;
    shownMarkdown: number;
    markdownCurrentSession: number;
    markdownArchivedSession: number;
    shownMarkdownCurrentSession: number;
    shownMarkdownArchivedSession: number;
    compact: number;
    shownCompact: number;
    compactReasonMix: string;
    shownCompactReasonMix: string;
    compactCurrentSession: number;
    compactArchivedSession: number;
    shownCompactCurrentSession: number;
    shownCompactArchivedSession: number;
    derivedReasonMix: string;
    shownDerivedReasonMix: string;
    overallReasonMix: string;
    shownOverallReasonMix: string;
    markdownReasonMix: string;
    shownMarkdownReasonMix: string;
    structured: number;
    structuredAgent: number;
    structuredColony: number;
    structuredCurrentSession: number;
    structuredArchivedSession: number;
    shownStructured: number;
    shownStructuredAgent: number;
    shownStructuredColony: number;
    shownStructuredCurrentSession: number;
    shownStructuredArchivedSession: number;
    shownStructuredKeyword: number;
    shownStructuredLlm: number;
    shownStructuredUnknown: number;
    structuredReasonMix: string;
    shownStructuredReasonMix: string;
    structuredKeyword: number;
    structuredLlm: number;
    structuredUnknown: number;
    structuredCategoryMix: string;
    shownStructuredCategoryMix: string;
    markdownHeuristic: number;
    markdownLlm: number;
    markdownUnknown: number;
    shownMarkdownHeuristic: number;
    shownMarkdownLlm: number;
    shownMarkdownUnknown: number;
    currentSession: number;
    archivedSession: number;
    shownCurrentSession: number;
    shownArchivedSession: number;
    palaceDirect: number;
    shownPalaceDirect: number;
    palaceNearby: number;
    shownPalaceNearby: number;
    palaceBroader: number;
    shownPalaceBroader: number;
    palaceRelated: number;
    shownPalaceRelated: number;
    palaceHallMix: string;
    shownPalaceHallMix: string;
    palaceRoomMix: string;
    shownPalaceRoomMix: string;
    palaceWingMix: string;
    shownPalaceWingMix: string;
    palaceSourceMix: string;
    shownPalaceSourceMix: string;
    memoryReasonMix: string;
    shownMemoryReasonMix: string;
    shownSectionOrder: string;
    palaceReasonMix: string;
    shownPalaceReasonMix: string;
  },
): string {
  const tags: string[] = [];
  tags.push(`truth:${truthMode}`);
  tags.push(`truth-via:${truthProvenance.join("+") || "default"}`);
  tags.push(`sections:${inferMemorySectionPriority(truthMode).join(">")}`);

  if (truthMode !== "exact_only") {
    tags.push(`derived:${inferDerivedSectionPriority(query).join(">")}`);
    tags.push(`derived-via:${inferDerivedSectionPriorityProvenance(query).join("+") || "default"}`);
  }
  if (truthMode !== "derived_only") {
    tags.push(`palace:${inferPalaceRecallPriority(query).join(">")}`);
    tags.push(`palace-via:${inferPalaceRecallPriorityProvenance(query).join("+") || "default"}`);
    if (shouldExpandMempalaceContext(query)) tags.push(`palace-expand-via:${inferMempalaceExpandProvenance(query).join("+") || "default"}`);
    if (shouldBroadenMempalaceTraversal(query)) tags.push(`palace-broaden-via:${inferMempalaceBroadenProvenance(query).join("+") || "default"}`);
  }
  const intentTags = inferMemoryIntentTags(query);
  const compactFocus = inferCompactDerivedFocus(query);
  const compactFocusProvenance = inferCompactDerivedFocusProvenance(query);
  const structuredFocus = inferPrimaryStructuredCategory(query);
  const structuredFocusProvenance = inferStructuredFocusProvenance(query);
  if (intentTags.length > 0) tags.push(`intent:${intentTags.join("+")}`);
  if (compactFocus) tags.push(`compact-focus:${compactFocus}`);
  if (compactFocusProvenance.length > 0) tags.push(`compact-focus-via:${compactFocusProvenance.join("+")}`);
  if (structuredFocus) tags.push(`structured-focus:${structuredFocus}`);
  if (structuredFocusProvenance.length > 0) tags.push(`structured-focus-via:${structuredFocusProvenance.join("+")}`);
  const rolePreference = inferConversationRolePreference(query);
  const roleProvenance = rolePreference ? inferRolePreferenceProvenance(query) : [];
  const sessionPreference = inferMemorySessionScopePreference(query);
  const sessionProvenance = sessionPreference ? inferSessionPreferenceProvenance(query) : [];
  const timePreference = inferMemoryTimePreference(query);
  const timeProvenance = timePreference ? inferTimePreferenceProvenance(query) : [];
  if (rolePreference) tags.push(`role:${rolePreference}`);
  if (sessionPreference) tags.push(`session:${sessionPreference}`);
  if (timePreference) tags.push(`time:${timePreference}`);
  if (roleProvenance.length > 0) tags.push(`role-via:${roleProvenance.join("+")}`);
  if (sessionProvenance.length > 0) tags.push(`session-via:${sessionProvenance.join("+")}`);
  if (timeProvenance.length > 0) tags.push(`time-via:${timeProvenance.join("+")}`);

  const hintPath = [
    palaceDiagnostics.inferredWing,
    palaceDiagnostics.inferredRoom,
    palaceDiagnostics.inferredHall,
  ].filter(Boolean).join("/");
  const resolvedPath = [
    palaceDiagnostics.resolvedWing,
    palaceDiagnostics.resolvedRoom,
    palaceDiagnostics.resolvedHall,
  ].filter(Boolean).join("/");

  if (hintPath) tags.push(`palace-hint:${hintPath}`);
  else if (palaceDiagnostics.inferredHall) tags.push(`palace-hint:${palaceDiagnostics.inferredHall}`);
  if (palaceDiagnostics.inferredHall) tags.push(`hall-via:${inferMempalaceHallProvenance(query).join("+") || "default"}`);
  if (palaceDiagnostics.inferredWing) tags.push(`wing-via:${inferMempalaceWingProvenance(query, session).join("+") || "default"}`);
  if (palaceDiagnostics.roomInference) tags.push(`room-via:${palaceDiagnostics.roomInference}`);
  if (palaceDiagnostics.roomInference) tags.push(`room-match-via:${inferRoomMatchProvenance(query, palaceDiagnostics).join("+") || "default"}`);
  if (palaceDiagnostics.inferredSourceFile) tags.push(`source:${palaceDiagnostics.inferredSourceFile}`);
  if (palaceDiagnostics.sourceHintScope) tags.push(`source-via:${palaceDiagnostics.sourceHintScope}`);
  if (palaceDiagnostics.inferredSourceFile) {
    tags.push(`source-file-via:${inferSourceFileHintProvenance(query, palaceDiagnostics.inferredSourceFile, palaceDiagnostics.sourceHintScope).join("+") || "default"}`);
  }
  if (palaceDiagnostics.sourceFallback) tags.push(`source-fallback:${palaceDiagnostics.sourceFallback}`);
  if (palaceDiagnostics.hallFallback) tags.push(`hall-fallback:${palaceDiagnostics.hallFallback}`);
  if (palaceDiagnostics.roomFallback) tags.push(`room-fallback:${palaceDiagnostics.roomFallback}`);
  if ((counts?.palaceRelated ?? 0) > 0 || /related|cross|similar/i.test(query)) {
    tags.push(`palace-related-via:${inferMempalaceRelatedProvenance(query, session, palaceDiagnostics).join("+") || "default"}`);
  }
  if (palaceDiagnostics.relatedFallback) tags.push(`palace-related-fallback:${palaceDiagnostics.relatedFallback}`);
  if (palaceDiagnostics.relatedHitStage) tags.push(`palace-related-hit-via:${palaceDiagnostics.relatedHitStage}`);
  if (!palaceDiagnostics.relatedHitStage && palaceDiagnostics.relatedMissStage) tags.push(`palace-related-miss-after:${palaceDiagnostics.relatedMissStage}`);
  if (!palaceDiagnostics.relatedHitStage && !palaceDiagnostics.relatedMissStage && palaceDiagnostics.relatedUnavailable) {
    tags.push(`palace-related-none:${palaceDiagnostics.relatedUnavailable}`);
  }
  if (palaceDiagnostics.nearbySeed) tags.push(`palace-nearby-seed:${palaceDiagnostics.nearbySeed}`);
  if (palaceDiagnostics.nearbyFallback) tags.push(`palace-nearby-fallback:${palaceDiagnostics.nearbyFallback}`);
  if (palaceDiagnostics.nearbyHitStage) tags.push(`palace-nearby-hit-via:${palaceDiagnostics.nearbyHitStage}`);
  if (!palaceDiagnostics.nearbyHitStage && !palaceDiagnostics.nearbySeed && palaceDiagnostics.nearbyUnavailable) {
    tags.push(`palace-nearby-none:${palaceDiagnostics.nearbyUnavailable}`);
  }
  if (palaceDiagnostics.nearbySeedVia) tags.push(`palace-nearby-seed-via:${palaceDiagnostics.nearbySeedVia}`);
  if (palaceDiagnostics.broaderSeed) tags.push(`palace-broader-seed:${palaceDiagnostics.broaderSeed}`);
  if (palaceDiagnostics.broaderFallback) tags.push(`palace-broader-fallback:${palaceDiagnostics.broaderFallback}`);
  if (palaceDiagnostics.broaderHitStage) tags.push(`palace-broader-hit-via:${palaceDiagnostics.broaderHitStage}`);
  if (!palaceDiagnostics.broaderHitStage && !palaceDiagnostics.broaderSeed && palaceDiagnostics.broaderUnavailable) {
    tags.push(`palace-broader-none:${palaceDiagnostics.broaderUnavailable}`);
  }
  if (palaceDiagnostics.broaderSeedVia) tags.push(`palace-broader-seed-via:${palaceDiagnostics.broaderSeedVia}`);
  if (palaceDiagnostics.relatedSeed) tags.push(`palace-related-seed:${palaceDiagnostics.relatedSeed}`);
  if (palaceDiagnostics.directHitStage) tags.push(`palace-hit-via:${palaceDiagnostics.directHitStage}`);
  if (!palaceDiagnostics.directHitStage && palaceDiagnostics.directMissStage) tags.push(`palace-miss-after:${palaceDiagnostics.directMissStage}`);
  if (resolvedPath) tags.push(`palace-resolved-via:${inferResolvedPalacePathProvenance(palaceDiagnostics)}`);
  if (resolvedPath) tags.push(`palace-resolved:${resolvedPath}`);
  if (counts) {
    const hiddenExact = Math.max(0, counts.exact - counts.shownExact);
    const hiddenArtifact = Math.max(0, counts.artifact - counts.shownArtifact);
    const hiddenMarkdown = Math.max(0, counts.markdown - counts.shownMarkdown);
    const hiddenCompact = Math.max(0, counts.compact - counts.shownCompact);
    const hiddenStructured = Math.max(0, counts.structured - counts.shownStructured);
    const hiddenPalaceDirect = Math.max(0, counts.palaceDirect - counts.shownPalaceDirect);
    const hiddenPalaceNearby = Math.max(0, counts.palaceNearby - counts.shownPalaceNearby);
    const hiddenPalaceBroader = Math.max(0, counts.palaceBroader - counts.shownPalaceBroader);
    const hiddenPalaceRelated = Math.max(0, counts.palaceRelated - counts.shownPalaceRelated);
    const palaceTotal = counts.palaceDirect + counts.palaceNearby + counts.palaceBroader + counts.palaceRelated;
    const shownPalaceTotal = counts.shownPalaceDirect + counts.shownPalaceNearby + counts.shownPalaceBroader + counts.shownPalaceRelated;
    const hiddenPalaceTotal = hiddenPalaceDirect + hiddenPalaceNearby + hiddenPalaceBroader + hiddenPalaceRelated;
    const derivedTotal = counts.compact + counts.structured;
    const shownDerivedTotal = counts.shownCompact + counts.shownStructured;
    const hiddenDerivedTotal = Math.max(0, derivedTotal - shownDerivedTotal);
    const nonPalaceTotal = counts.exact + counts.artifact + counts.markdown + counts.structured;
    const shownNonPalaceTotal = counts.shownExact + counts.shownArtifact + counts.shownMarkdown + counts.shownStructured;
    const hiddenNonPalaceTotal = Math.max(0, nonPalaceTotal - shownNonPalaceTotal);
    const memoryTotal = nonPalaceTotal + palaceTotal;
    const shownMemoryTotal = shownNonPalaceTotal + shownPalaceTotal;
    const hiddenMemoryTotal = Math.max(0, memoryTotal - shownMemoryTotal);
    const hiddenExactUser = Math.max(0, counts.exactUser - counts.shownExactUser);
    const hiddenExactAssistant = Math.max(0, counts.exactAssistant - counts.shownExactAssistant);
    const hiddenExactTool = Math.max(0, counts.exactTool - counts.shownExactTool);
    const hiddenExactCurrentSession = Math.max(0, counts.exactCurrentSession - counts.shownExactCurrentSession);
    const hiddenExactArchivedSession = Math.max(0, counts.exactArchivedSession - counts.shownExactArchivedSession);
    const hiddenArtifactCurrentSession = Math.max(0, counts.artifactCurrentSession - counts.shownArtifactCurrentSession);
    const hiddenArtifactArchivedSession = Math.max(0, counts.artifactArchivedSession - counts.shownArtifactArchivedSession);
    const hiddenMarkdownCurrentSession = Math.max(0, counts.markdownCurrentSession - counts.shownMarkdownCurrentSession);
    const hiddenMarkdownArchivedSession = Math.max(0, counts.markdownArchivedSession - counts.shownMarkdownArchivedSession);
    const hiddenCompactCurrentSession = Math.max(0, counts.compactCurrentSession - counts.shownCompactCurrentSession);
    const hiddenCompactArchivedSession = Math.max(0, counts.compactArchivedSession - counts.shownCompactArchivedSession);
    const derivedCurrentSession = counts.compactCurrentSession + counts.structuredCurrentSession;
    const derivedArchivedSession = counts.compactArchivedSession + counts.structuredArchivedSession;
    const shownDerivedCurrentSession = counts.shownCompactCurrentSession + counts.shownStructuredCurrentSession;
    const shownDerivedArchivedSession = counts.shownCompactArchivedSession + counts.shownStructuredArchivedSession;
    const hiddenDerivedCurrentSession = Math.max(0, derivedCurrentSession - shownDerivedCurrentSession);
    const hiddenDerivedArchivedSession = Math.max(0, derivedArchivedSession - shownDerivedArchivedSession);
    const hiddenStructuredAgent = Math.max(0, counts.structuredAgent - counts.shownStructuredAgent);
    const hiddenStructuredColony = Math.max(0, counts.structuredColony - counts.shownStructuredColony);
    const hiddenStructuredCurrentSession = Math.max(0, counts.structuredCurrentSession - counts.shownStructuredCurrentSession);
    const hiddenStructuredArchivedSession = Math.max(0, counts.structuredArchivedSession - counts.shownStructuredArchivedSession);
    const hiddenStructuredKeyword = Math.max(0, counts.structuredKeyword - counts.shownStructuredKeyword);
    const hiddenStructuredLlm = Math.max(0, counts.structuredLlm - counts.shownStructuredLlm);
    const hiddenStructuredUnknown = Math.max(0, counts.structuredUnknown - counts.shownStructuredUnknown);
    const hiddenMarkdownHeuristic = Math.max(0, counts.markdownHeuristic - counts.shownMarkdownHeuristic);
    const hiddenMarkdownLlm = Math.max(0, counts.markdownLlm - counts.shownMarkdownLlm);
    const hiddenMarkdownUnknown = Math.max(0, counts.markdownUnknown - counts.shownMarkdownUnknown);
    const hiddenCurrentSession = Math.max(0, counts.currentSession - counts.shownCurrentSession);
    const hiddenArchivedSession = Math.max(0, counts.archivedSession - counts.shownArchivedSession);
    const hiddenSessionMixCurrent = hiddenCurrentSession;
    const hiddenSessionMixArchived = Math.max(0, hiddenNonPalaceTotal - hiddenSessionMixCurrent);
    const hiddenExactReasonMix = subtractTaggedCountMix(counts.exactReasonMix, counts.shownExactReasonMix);
    const hiddenArtifactReasonMix = subtractTaggedCountMix(counts.artifactReasonMix, counts.shownArtifactReasonMix);
    const hiddenCompactReasonMix = subtractTaggedCountMix(counts.compactReasonMix, counts.shownCompactReasonMix);
    const hiddenDerivedReasonMix = subtractTaggedCountMix(counts.derivedReasonMix, counts.shownDerivedReasonMix);
    const hiddenOverallReasonMix = subtractTaggedCountMix(counts.overallReasonMix, counts.shownOverallReasonMix);
    const hiddenMarkdownReasonMix = subtractTaggedCountMix(counts.markdownReasonMix, counts.shownMarkdownReasonMix);
    const hiddenStructuredReasonMix = subtractTaggedCountMix(counts.structuredReasonMix, counts.shownStructuredReasonMix);
    const hiddenStructuredCategoryMix = subtractTaggedCountMix(counts.structuredCategoryMix, counts.shownStructuredCategoryMix);
    const hiddenPalaceHallMix = subtractTaggedCountMix(counts.palaceHallMix, counts.shownPalaceHallMix);
    const hiddenPalaceRoomMix = subtractTaggedCountMix(counts.palaceRoomMix, counts.shownPalaceRoomMix);
    const hiddenPalaceWingMix = subtractTaggedCountMix(counts.palaceWingMix, counts.shownPalaceWingMix);
    const hiddenPalaceSourceMix = subtractTaggedCountMix(counts.palaceSourceMix, counts.shownPalaceSourceMix);
    const hiddenMemoryReasonMix = subtractTaggedCountMix(counts.memoryReasonMix, counts.shownMemoryReasonMix);
    const hiddenPalaceReasonMix = subtractTaggedCountMix(counts.palaceReasonMix, counts.shownPalaceReasonMix);
    const hiddenCompactSourceMix = `artifact=${hiddenArtifact},markdown-heuristic=${hiddenMarkdownHeuristic},markdown-llm=${hiddenMarkdownLlm},markdown-unknown=${hiddenMarkdownUnknown}`;
    const hiddenDerivedSourceMix = `artifact=${hiddenArtifact},markdown-heuristic=${hiddenMarkdownHeuristic},markdown-llm=${hiddenMarkdownLlm},markdown-unknown=${hiddenMarkdownUnknown},structured-keyword=${hiddenStructuredKeyword},structured-llm=${hiddenStructuredLlm},structured-unknown=${hiddenStructuredUnknown}`;
    const hiddenSections = [
      hiddenExact > 0 ? "exact" : undefined,
      hiddenCompact > 0 ? "compact" : undefined,
      hiddenStructured > 0 ? "structured" : undefined,
      hiddenPalaceDirect > 0 ? "palace-direct" : undefined,
      hiddenPalaceNearby > 0 ? "palace-nearby" : undefined,
      hiddenPalaceBroader > 0 ? "palace-broader" : undefined,
      hiddenPalaceRelated > 0 ? "palace-related" : undefined,
    ].filter((value): value is string => Boolean(value));
    const emptySections = [
      truthMode !== "derived_only" && counts.exact === 0 ? "exact" : undefined,
      truthMode !== "exact_only" && counts.compact === 0 ? "compact" : undefined,
      truthMode !== "exact_only" && counts.structured === 0 ? "structured" : undefined,
      truthMode !== "derived_only" && counts.palaceDirect === 0 ? "palace-direct" : undefined,
      truthMode !== "derived_only" && counts.palaceNearby === 0 ? "palace-nearby" : undefined,
      truthMode !== "derived_only" && counts.palaceBroader === 0 ? "palace-broader" : undefined,
      truthMode !== "derived_only" && counts.palaceRelated === 0 ? "palace-related" : undefined,
    ].filter((value): value is string => Boolean(value));
    const exactSectionStates = truthMode === "derived_only"
      ? []
      : [
        ["exact", counts.exact === 0 ? "empty" : hiddenExact > 0 ? "truncated" : "full"],
        ["palace-direct", counts.palaceDirect === 0 ? "empty" : hiddenPalaceDirect > 0 ? "truncated" : "full"],
        ["palace-nearby", counts.palaceNearby === 0 ? "empty" : hiddenPalaceNearby > 0 ? "truncated" : "full"],
        ["palace-broader", counts.palaceBroader === 0 ? "empty" : hiddenPalaceBroader > 0 ? "truncated" : "full"],
        ["palace-related", counts.palaceRelated === 0 ? "empty" : hiddenPalaceRelated > 0 ? "truncated" : "full"],
      ] satisfies Array<[string, string]>;
    const derivedSectionStates = truthMode === "exact_only"
      ? []
      : [
        ["compact", counts.compact === 0 ? "empty" : hiddenCompact > 0 ? "truncated" : "full"],
        ["structured", counts.structured === 0 ? "empty" : hiddenStructured > 0 ? "truncated" : "full"],
      ] satisfies Array<[string, string]>;
    const sectionStateEntries = inferMemorySectionPriority(truthMode).flatMap((kind) => (
      kind === "exact" ? exactSectionStates : derivedSectionStates
    ));
    tags.push(`hits:exact=${counts.exact}`);
    tags.push(`shown:exact=${counts.shownExact}`);
    tags.push(`hidden:exact=${hiddenExact}`);
    tags.push(`artifact=${counts.artifact}`);
    tags.push(`shown-artifact=${counts.shownArtifact}`);
    tags.push(`hidden-artifact=${hiddenArtifact}`);
    tags.push(`markdown=${counts.markdown}`);
    tags.push(`shown-markdown=${counts.shownMarkdown}`);
    tags.push(`hidden-markdown=${hiddenMarkdown}`);
    tags.push(`compact=${counts.compact}`);
    tags.push(`shown-compact=${counts.shownCompact}`);
    tags.push(`hidden-compact=${hiddenCompact}`);
    tags.push(`structured=${counts.structured}`);
    tags.push(`shown-structured=${counts.shownStructured}`);
    tags.push(`hidden-structured=${hiddenStructured}`);
    tags.push(`derived=${derivedTotal}`);
    tags.push(`shown-derived=${shownDerivedTotal}`);
    tags.push(`hidden-derived=${hiddenDerivedTotal}`);
    tags.push(`non-palace=${nonPalaceTotal}`);
    tags.push(`shown-non-palace=${shownNonPalaceTotal}`);
    tags.push(`hidden-non-palace=${hiddenNonPalaceTotal}`);
    tags.push(`memory-total=${memoryTotal}`);
    tags.push(`memory-shown=${shownMemoryTotal}`);
    tags.push(`memory-hidden=${hiddenMemoryTotal}`);
    tags.push(`palace=${counts.palaceDirect}/${counts.palaceNearby}/${counts.palaceBroader}/${counts.palaceRelated}`);
    tags.push(`shown-palace=${counts.shownPalaceDirect}/${counts.shownPalaceNearby}/${counts.shownPalaceBroader}/${counts.shownPalaceRelated}`);
    tags.push(`hidden-palace=${hiddenPalaceDirect}/${hiddenPalaceNearby}/${hiddenPalaceBroader}/${hiddenPalaceRelated}`);
    tags.push(`truth-mix:exact=${counts.exact},derived=${derivedTotal},palace=${palaceTotal}`);
    tags.push(`shown-truth-mix:exact=${counts.shownExact},derived=${shownDerivedTotal},palace=${shownPalaceTotal}`);
    tags.push(`hidden-truth-mix:exact=${hiddenExact},derived=${hiddenDerivedTotal},palace=${hiddenPalaceTotal}`);
    tags.push(`memory-mix:exact=${counts.exact},artifact=${counts.artifact},markdown=${counts.markdown},structured=${counts.structured},palace=${palaceTotal}`);
    tags.push(`shown-memory-mix:exact=${counts.shownExact},artifact=${counts.shownArtifact},markdown=${counts.shownMarkdown},structured=${counts.shownStructured},palace=${shownPalaceTotal}`);
    tags.push(`hidden-memory-mix:exact=${hiddenExact},artifact=${hiddenArtifact},markdown=${hiddenMarkdown},structured=${hiddenStructured},palace=${hiddenPalaceTotal}`);
    tags.push(`non-palace-mix:exact=${counts.exact},artifact=${counts.artifact},markdown=${counts.markdown},structured=${counts.structured}`);
    tags.push(`shown-non-palace-mix:exact=${counts.shownExact},artifact=${counts.shownArtifact},markdown=${counts.shownMarkdown},structured=${counts.shownStructured}`);
    tags.push(`hidden-non-palace-mix:exact=${hiddenExact},artifact=${hiddenArtifact},markdown=${hiddenMarkdown},structured=${hiddenStructured}`);
    tags.push(`exact-role:user=${counts.exactUser},assistant=${counts.exactAssistant},tool=${counts.exactTool}`);
    tags.push(`shown-exact-role:user=${counts.shownExactUser},assistant=${counts.shownExactAssistant},tool=${counts.shownExactTool}`);
    tags.push(`hidden-exact-role:user=${hiddenExactUser},assistant=${hiddenExactAssistant},tool=${hiddenExactTool}`);
    tags.push(`exact-session:current=${counts.exactCurrentSession},archived=${counts.exactArchivedSession}`);
    tags.push(`shown-exact-session:current=${counts.shownExactCurrentSession},archived=${counts.shownExactArchivedSession}`);
    tags.push(`hidden-exact-session:current=${hiddenExactCurrentSession},archived=${hiddenExactArchivedSession}`);
    tags.push(`exact-why:${counts.exactReasonMix}`);
    tags.push(`shown-exact-why:${counts.shownExactReasonMix}`);
    tags.push(`hidden-exact-why:${hiddenExactReasonMix}`);
    tags.push(`artifact-session:current=${counts.artifactCurrentSession},archived=${counts.artifactArchivedSession}`);
    tags.push(`shown-artifact-session:current=${counts.shownArtifactCurrentSession},archived=${counts.shownArtifactArchivedSession}`);
    tags.push(`hidden-artifact-session:current=${hiddenArtifactCurrentSession},archived=${hiddenArtifactArchivedSession}`);
    tags.push(`artifact-why:${counts.artifactReasonMix}`);
    tags.push(`shown-artifact-why:${counts.shownArtifactReasonMix}`);
    tags.push(`hidden-artifact-why:${hiddenArtifactReasonMix}`);
    tags.push(`markdown-session:current=${counts.markdownCurrentSession},archived=${counts.markdownArchivedSession}`);
    tags.push(`shown-markdown-session:current=${counts.shownMarkdownCurrentSession},archived=${counts.shownMarkdownArchivedSession}`);
    tags.push(`hidden-markdown-session:current=${hiddenMarkdownCurrentSession},archived=${hiddenMarkdownArchivedSession}`);
    tags.push(`markdown-src:heuristic=${counts.markdownHeuristic},llm=${counts.markdownLlm},unknown=${counts.markdownUnknown}`);
    tags.push(`shown-markdown-src:heuristic=${counts.shownMarkdownHeuristic},llm=${counts.shownMarkdownLlm},unknown=${counts.shownMarkdownUnknown}`);
    tags.push(`hidden-markdown-src:heuristic=${hiddenMarkdownHeuristic},llm=${hiddenMarkdownLlm},unknown=${hiddenMarkdownUnknown}`);
    tags.push(`markdown-why:${counts.markdownReasonMix}`);
    tags.push(`shown-markdown-why:${counts.shownMarkdownReasonMix}`);
    tags.push(`hidden-markdown-why:${hiddenMarkdownReasonMix}`);
    tags.push(`compact-mix:artifact=${counts.artifact},markdown=${counts.markdown}`);
    tags.push(`shown-compact-mix:artifact=${counts.shownArtifact},markdown=${counts.shownMarkdown}`);
    tags.push(`hidden-compact-mix:artifact=${hiddenArtifact},markdown=${hiddenMarkdown}`);
    tags.push(`compact-src:artifact=${counts.artifact},markdown-heuristic=${counts.markdownHeuristic},markdown-llm=${counts.markdownLlm},markdown-unknown=${counts.markdownUnknown}`);
    tags.push(`shown-compact-src:artifact=${counts.shownArtifact},markdown-heuristic=${counts.shownMarkdownHeuristic},markdown-llm=${counts.shownMarkdownLlm},markdown-unknown=${counts.shownMarkdownUnknown}`);
    tags.push(`hidden-compact-src:${hiddenCompactSourceMix}`);
    tags.push(`compact-why:${counts.compactReasonMix}`);
    tags.push(`shown-compact-why:${counts.shownCompactReasonMix}`);
    tags.push(`hidden-compact-why:${hiddenCompactReasonMix}`);
    tags.push(`compact-session:current=${counts.compactCurrentSession},archived=${counts.compactArchivedSession}`);
    tags.push(`shown-compact-session:current=${counts.shownCompactCurrentSession},archived=${counts.shownCompactArchivedSession}`);
    tags.push(`hidden-compact-session:current=${hiddenCompactCurrentSession},archived=${hiddenCompactArchivedSession}`);
    tags.push(`derived-mix:compact=${counts.compact},structured=${counts.structured}`);
    tags.push(`shown-derived-mix:compact=${counts.shownCompact},structured=${counts.shownStructured}`);
    tags.push(`hidden-derived-mix:compact=${hiddenCompact},structured=${hiddenStructured}`);
    tags.push(`derived-src:artifact=${counts.artifact},markdown-heuristic=${counts.markdownHeuristic},markdown-llm=${counts.markdownLlm},markdown-unknown=${counts.markdownUnknown},structured-keyword=${counts.structuredKeyword},structured-llm=${counts.structuredLlm},structured-unknown=${counts.structuredUnknown}`);
    tags.push(`shown-derived-src:artifact=${counts.shownArtifact},markdown-heuristic=${counts.shownMarkdownHeuristic},markdown-llm=${counts.shownMarkdownLlm},markdown-unknown=${counts.shownMarkdownUnknown},structured-keyword=${counts.shownStructuredKeyword},structured-llm=${counts.shownStructuredLlm},structured-unknown=${counts.shownStructuredUnknown}`);
    tags.push(`hidden-derived-src:${hiddenDerivedSourceMix}`);
    tags.push(`derived-why:${counts.derivedReasonMix}`);
    tags.push(`shown-derived-why:${counts.shownDerivedReasonMix}`);
    tags.push(`hidden-derived-why:${hiddenDerivedReasonMix}`);
    tags.push(`derived-session:current=${derivedCurrentSession},archived=${derivedArchivedSession}`);
    tags.push(`shown-derived-session:current=${shownDerivedCurrentSession},archived=${shownDerivedArchivedSession}`);
    tags.push(`hidden-derived-session:current=${hiddenDerivedCurrentSession},archived=${hiddenDerivedArchivedSession}`);
    tags.push(`structured-scope:agent=${counts.structuredAgent},colony=${counts.structuredColony}`);
    tags.push(`shown-structured-scope:agent=${counts.shownStructuredAgent},colony=${counts.shownStructuredColony}`);
    tags.push(`hidden-structured-scope:agent=${hiddenStructuredAgent},colony=${hiddenStructuredColony}`);
    tags.push(`structured-session:current=${counts.structuredCurrentSession},archived=${counts.structuredArchivedSession}`);
    tags.push(`shown-structured-session:current=${counts.shownStructuredCurrentSession},archived=${counts.shownStructuredArchivedSession}`);
    tags.push(`hidden-structured-session:current=${hiddenStructuredCurrentSession},archived=${hiddenStructuredArchivedSession}`);
    tags.push(`structured-cat:${counts.structuredCategoryMix}`);
    tags.push(`shown-structured-cat:${counts.shownStructuredCategoryMix}`);
    tags.push(`hidden-structured-cat:${hiddenStructuredCategoryMix}`);
    tags.push(`structured-src:keyword=${counts.structuredKeyword},llm=${counts.structuredLlm},unknown=${counts.structuredUnknown}`);
    tags.push(`shown-structured-src:keyword=${counts.shownStructuredKeyword},llm=${counts.shownStructuredLlm},unknown=${counts.shownStructuredUnknown}`);
    tags.push(`hidden-structured-src:keyword=${hiddenStructuredKeyword},llm=${hiddenStructuredLlm},unknown=${hiddenStructuredUnknown}`);
    tags.push(`structured-why:${counts.structuredReasonMix}`);
    tags.push(`shown-structured-why:${counts.shownStructuredReasonMix}`);
    tags.push(`hidden-structured-why:${hiddenStructuredReasonMix}`);
    tags.push(`why-mix:${counts.overallReasonMix}`);
    tags.push(`shown-why-mix:${counts.shownOverallReasonMix}`);
    tags.push(`hidden-why-mix:${hiddenOverallReasonMix}`);
    tags.push(`memory-why:${counts.memoryReasonMix}`);
    tags.push(`shown-memory-why:${counts.shownMemoryReasonMix}`);
    tags.push(`hidden-memory-why:${hiddenMemoryReasonMix}`);
    tags.push(`palace-hall:${counts.palaceHallMix}`);
    tags.push(`shown-palace-hall:${counts.shownPalaceHallMix}`);
    tags.push(`hidden-palace-hall:${hiddenPalaceHallMix}`);
    tags.push(`palace-room:${counts.palaceRoomMix}`);
    tags.push(`shown-palace-room:${counts.shownPalaceRoomMix}`);
    tags.push(`hidden-palace-room:${hiddenPalaceRoomMix}`);
    tags.push(`palace-wing:${counts.palaceWingMix}`);
    tags.push(`shown-palace-wing:${counts.shownPalaceWingMix}`);
    tags.push(`hidden-palace-wing:${hiddenPalaceWingMix}`);
    tags.push(`palace-source:${counts.palaceSourceMix}`);
    tags.push(`shown-palace-source:${counts.shownPalaceSourceMix}`);
    tags.push(`hidden-palace-source:${hiddenPalaceSourceMix}`);
    tags.push(`palace-why:${counts.palaceReasonMix}`);
    tags.push(`shown-palace-why:${counts.shownPalaceReasonMix}`);
    tags.push(`hidden-palace-why:${hiddenPalaceReasonMix}`);
    if (counts.shownSectionOrder) tags.push(`shown-sections:${counts.shownSectionOrder}`);
    tags.push(`section-state:${sectionStateEntries.map(([label, state]) => `${label}=${state}`).join(",") || "none"}`);
    tags.push(`empty-sections:${emptySections.join(">") || "none"}`);
    tags.push(`hidden-sections:${hiddenSections.join(">") || "none"}`);
    tags.push(`memory-origin:current=${counts.currentSession},archived=${counts.archivedSession},palace=${palaceTotal}`);
    tags.push(`shown-memory-origin:current=${counts.shownCurrentSession},archived=${counts.shownArchivedSession},palace=${shownPalaceTotal}`);
    tags.push(`hidden-memory-origin:current=${hiddenCurrentSession},archived=${hiddenArchivedSession},palace=${hiddenPalaceTotal}`);
    tags.push(`session-mix:current=${counts.currentSession},archived=${counts.archivedSession}`);
    tags.push(`hidden-session-mix:current=${hiddenSessionMixCurrent},archived=${hiddenSessionMixArchived}`);
    tags.push(`shown-session-mix:current=${counts.shownCurrentSession},archived=${counts.shownArchivedSession}`);
  }

  return `Memory routing note: ${tags.join(" ")}`;
}

function subtractTaggedCountMix(total: string | undefined, shown: string | undefined): string {
  const totalPairs = parseTaggedCountMix(total);
  if (totalPairs.length === 0) return "none";
  const shownMap = new Map(parseTaggedCountMix(shown));
  const hiddenPairs = totalPairs
    .map(([label, count]) => [label, Math.max(0, count - (shownMap.get(label) ?? 0))] as const)
    .filter(([, count]) => count > 0);
  if (hiddenPairs.length === 0) return "none";
  return hiddenPairs.map(([label, count]) => `${label}=${count}`).join(",");
}

function parseTaggedCountMix(value: string | undefined): Array<[string, number]> {
  if (!value || value === "none") return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [label, countText] = part.split("=");
      return [label ?? "", Number(countText ?? 0)] as [string, number];
    })
    .filter(([label, count]) => label.length > 0 && Number.isFinite(count));
}

function extractPalaceRelatedSeedRoom(seed: string | undefined): string | undefined {
  if (!seed || seed === "none") return undefined;
  const room = seed.split(":").at(-1)?.trim();
  return room ? room : undefined;
}

function orderMemorySectionGroups(
  truthMode: MemoryTruthMode,
  exactSections: string[],
  derivedSections: string[],
): MemorySectionGroup[] {
  const groups: MemorySectionGroup[] = [];
  const priority = inferMemorySectionPriority(truthMode);

  for (const kind of priority) {
    const lines = kind === "exact" ? exactSections : derivedSections;
    if (lines.length === 0) continue;
    groups.push({ kind, lines });
  }

  return groups;
}

function joinMemorySectionGroups(groups: MemorySectionGroup[]): string[] {
  const lines: string[] = [];
  for (const group of groups) {
    if (group.lines.length === 0) continue;
    if (lines.length > 0) lines.push("");
    lines.push(...group.lines);
  }
  return lines;
}

function orderDerivedSections(
  query: string,
  sections: Array<{ key: DerivedSectionKey; lines: string[] }>,
): string[] {
  const order = inferDerivedSectionPriority(query);
  const rank = new Map(order.map((key, index) => [key, index]));
  const ordered = [...sections].sort((left, right) => (rank.get(left.key) ?? 99) - (rank.get(right.key) ?? 99));
  const lines: string[] = [];
  for (const section of ordered) {
    if (section.lines.length === 0) continue;
    if (lines.length > 0) lines.push("");
    lines.push(...section.lines);
  }
  return lines;
}

function orderPalaceSections(query: string, sections: PalaceSection[]): PalaceSection[] {
  const order = inferPalaceRecallPriority(query);
  const rank = new Map(order.map((key, index) => [key, index]));
  return [...sections].sort((left, right) => (rank.get(left.key) ?? 99) - (rank.get(right.key) ?? 99));
}

function collectMempalaceWingCandidates(session: Pick<AgentSession, "tenantScope" | "metadata">): string[] {
  const candidates: string[] = [];
  const metadata = session.metadata ?? {};

  const workspacePrimaryTargets = Array.isArray(metadata.workspacePrimaryTargets)
    ? metadata.workspacePrimaryTargets.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  for (const target of workspacePrimaryTargets) {
    pushWingCandidate(candidates, target);
  }

  if (typeof metadata.workspaceName === "string" && metadata.workspaceName.trim().length > 0) {
    pushWingCandidate(candidates, metadata.workspaceName);
  }

  if (typeof session.tenantScope === "string" && session.tenantScope.trim().length > 0 && session.tenantScope !== "default") {
    pushWingCandidate(candidates, session.tenantScope);
  }

  return candidates;
}

function pushWingCandidate(target: string[], value: string): void {
  const normalized = value.trim();
  if (!normalized) return;
  if (!target.some((existing) => normalizeWingToken(existing) === normalizeWingToken(normalized))) {
    target.push(normalized);
  }
}

function normalizeWingToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function selectTunnelRooms(
  query: string,
  tunnels: Array<{ room: string; count: number }>,
  hall?: HallType,
): string[] {
  return rankTunnelRooms(query, tunnels, hall).map((tunnel) => tunnel.room);
}

export function rankTunnelRooms<T extends { room: string; count: number; halls?: string[]; wings?: string[] }>(
  query: string,
  tunnels: T[],
  hall?: HallType,
): T[] {
  const queryTokens = tokenizeRecallText(query);
  const normalizedQuery = normalizeWingToken(query);
  const maxCount = tunnels.reduce((max, tunnel) => Math.max(max, tunnel.count), 1);

  return [...tunnels].sort((left, right) => {
    const leftScore = scoreTunnelRoom(queryTokens, normalizedQuery, hall, left, maxCount);
    const rightScore = scoreTunnelRoom(queryTokens, normalizedQuery, hall, right, maxCount);
    return rightScore - leftScore || right.count - left.count || left.room.localeCompare(right.room);
  });
}

function drawerToSearchHit(drawer: Drawer): SearchHit {
  const importanceScore = Math.max(0, Math.min(1, (drawer.importance ?? 3) / 5));
  const emotionalScore = Math.max(0, Math.min(1, drawer.emotionalWeight ?? 0.5));
  return {
    id: drawer.id,
    text: drawer.content,
    wing: drawer.wing,
    room: drawer.room,
    hall: drawer.hall,
    sourceFile: drawer.sourceFile,
    similarity: Math.round((importanceScore * 0.75 + emotionalScore * 0.25) * 1000) / 1000,
    distance: 0,
    metadata: drawer.metadata,
  };
}

function drawerToRankedSearchHit(
  query: string,
  drawer: Drawer,
  hall: HallType | undefined,
): SearchHit {
  const base = drawerToSearchHit(drawer);
  const reasons = inferPalaceRecallReasons(query, base, hall);
  return {
    ...base,
    similarity: scoreDrawerForQuery(query, drawer, hall),
    metadata: {
      ...base.metadata,
      recallReasons: reasons,
    },
  };
}

function withRecallProvenance(
  hit: SearchHit,
  provenance: { hop?: number; viaRoom?: string; crossWing?: boolean; stage?: string },
): SearchHit {
  const existingReasons = Array.isArray(hit.metadata?.recallReasons)
    ? hit.metadata.recallReasons.filter((reason): reason is string => typeof reason === "string" && reason.length > 0)
    : [];
  const graphReasons = [
    ...(provenance.crossWing ? ["cross-wing"] : []),
    ...(Number.isFinite(provenance.hop)
      ? (provenance.hop === 1 ? ["graph-nearby"] : ["graph-broader"])
      : []),
  ];
  return {
    ...hit,
    metadata: {
      ...hit.metadata,
      recallReasons: [...new Set([...existingReasons, ...graphReasons])],
      ...(provenance.stage ? { recallStage: provenance.stage } : {}),
      ...(Number.isFinite(provenance.hop) ? { recallHop: provenance.hop } : {}),
      ...(provenance.viaRoom ? { recallViaRoom: provenance.viaRoom } : {}),
      ...(provenance.crossWing ? { recallCrossWing: true } : {}),
    },
  };
}

function rerankSearchHits(
  query: string,
  hits: SearchHit[],
  hall: HallType | undefined,
): SearchHit[] {
  return [...hits]
    .map((hit) => ({
      hit: {
        ...hit,
        similarity: scoreSearchHitForQuery(query, hit, hall),
        metadata: {
          ...hit.metadata,
          recallReasons: inferPalaceRecallReasons(query, hit, hall),
        },
      },
      score: scoreSearchHitForQuery(query, hit, hall),
    }))
    .sort((left, right) => right.score - left.score || left.hit.distance - right.hit.distance)
    .map((entry) => entry.hit);
}

function inferPalaceRecallReasons(
  query: string,
  hit: Pick<SearchHit, "text" | "wing" | "room" | "hall" | "sourceFile">,
  hall: HallType | undefined,
): string[] {
  const reasons: string[] = [];
  const queryTokens = tokenizeRecallText(query);
  const hitTokens = new Set(tokenizeRecallText([
    hit.text,
    hit.wing,
    hit.room,
    hit.hall,
    hit.sourceFile,
  ].join(" ")));
  const overlap = queryTokens.reduce((count, token) => count + (hitTokens.has(token) ? 1 : 0), 0);
  if (overlap > 0) reasons.push("keyword-overlap");
  if (hall && hit.hall === hall) reasons.push("hall-match");
  else if (hall && hit.hall && hit.hall !== hall) reasons.push("hall-fallback");
  if (scoreSourceHint(query, hit.sourceFile) >= 0.3) reasons.push("source-hint");
  return reasons;
}

function scoreDrawerForQuery(
  query: string,
  drawer: Drawer,
  hall: HallType | undefined,
): number {
  const queryTokens = tokenizeRecallText(query);
  const contentTokens = new Set(tokenizeRecallText([
    drawer.content,
    drawer.wing,
    drawer.room,
    drawer.hall,
    drawer.sourceFile,
  ].join(" ")));
  const overlap = queryTokens.reduce((count, token) => count + (contentTokens.has(token) ? 1 : 0), 0);
  const overlapScore = queryTokens.length > 0 ? overlap / queryTokens.length : 0;
  const hallBonus = hall && drawer.hall === hall
    ? (hasFactIntent(query) ? 0.25 : 0.1)
    : 0;
  const sourceBonus = Math.min(0.4, scoreSourceHint(query, drawer.sourceFile) * 0.5);
  const importanceScore = Math.max(0, Math.min(1, (drawer.importance ?? 3) / 5));
  const emotionalScore = Math.max(0, Math.min(1, drawer.emotionalWeight ?? 0.5));
  return Math.round((overlapScore * 0.55 + hallBonus + sourceBonus + importanceScore * 0.2 + emotionalScore * 0.05) * 1000) / 1000;
}

function scoreSearchHitForQuery(
  query: string,
  hit: SearchHit,
  hall: HallType | undefined,
): number {
  const queryTokens = tokenizeRecallText(query);
  const hitTokens = new Set(tokenizeRecallText([
    hit.text,
    hit.wing,
    hit.room,
    hit.hall,
    hit.sourceFile,
  ].join(" ")));
  const overlap = queryTokens.reduce((count, token) => count + (hitTokens.has(token) ? 1 : 0), 0);
  const overlapScore = queryTokens.length > 0 ? overlap / queryTokens.length : 0;
  const hallBonus = hall && hit.hall === hall
    ? (hasFactIntent(query) ? 0.25 : 0.1)
    : 0;
  const sourceBonus = Math.min(0.4, scoreSourceHint(query, hit.sourceFile) * 0.5);
  return Math.round((overlapScore * 0.55 + hallBonus + sourceBonus + hit.similarity * 0.2) * 1000) / 1000;
}

function scoreSourceHint(query: string, sourceFile: string | undefined): number {
  if (!sourceFile) return 0;
  const queryTokens = tokenizeSourceHintQuery(query);
  if (queryTokens.length === 0) return 0;
  const sourceTokens = new Set(tokenizeRecallText(sourceFile));
  const overlap = queryTokens.reduce((count, token) => count + (sourceTokens.has(token) ? 1 : 0), 0);
  const overlapScore = overlap / queryTokens.length;
  const normalizedQuery = normalizeWingToken(query);
  const normalizedSource = normalizeWingToken(sourceFile);
  const exactBonus = normalizedSource && (normalizedQuery.includes(normalizedSource) || normalizedSource.includes(normalizedQuery))
    ? 0.25
    : 0;
  return overlapScore + exactBonus;
}

function sourceHintHallCandidates(hall: HallType | undefined): Array<HallType | undefined> {
  const candidates: Array<HallType | undefined> = [hall];
  if (hall === "hall_advice") {
    candidates.push("hall_facts");
  }
  candidates.push(undefined);
  return candidates.filter((candidate, index, values) => values.indexOf(candidate) === index);
}

function tokenizeSourceHintQuery(query: string): string[] {
  const noise = new Set([
    "exact",
    "what",
    "should",
    "about",
    "related",
    "please",
    "show",
    "tell",
    "give",
    "with",
    "from",
    "into",
    "around",
    "need",
    "want",
    "would",
    "could",
  ]);
  return tokenizeRecallText(query).filter((token) => !noise.has(token));
}

function selectSourceFileHint(query: string, drawers: Drawer[]): string | undefined {
  if (drawers.length === 0) return undefined;
  const ranked = drawers
    .map((drawer) => ({ sourceFile: drawer.sourceFile, score: scoreSourceHint(query, drawer.sourceFile) }))
    .filter((entry) => entry.sourceFile && entry.score > 0)
    .sort((left, right) => right.score - left.score || left.sourceFile.localeCompare(right.sourceFile));
  const best = ranked[0];
  const second = ranked[1];
  if (!best?.sourceFile) return undefined;
  if (best.score < 0.25) return undefined;
  if (second && best.score - second.score < 0.1) return undefined;
  return best.sourceFile;
}

function inferSourceFileHintProvenance(
  query: string,
  sourceFile: string | undefined,
  scope: "wing" | "global" | undefined,
): string[] {
  if (!sourceFile) return ["default"];
  const queryTokens = new Set(tokenizeSourceHintQuery(query));
  const sourceTokens = tokenizeRecallText(sourceFile.replace(/\.[a-z0-9]+$/i, ""));
  const overlaps = sourceTokens.filter((token, index) => queryTokens.has(token) && sourceTokens.indexOf(token) === index);
  const signals: string[] = [];
  if (scope) signals.push(scope);
  return signals.length > 0 || overlaps.length > 0 ? [...signals, ...overlaps] : ["default"];
}

function inferRoomMatchProvenance(
  query: string,
  diagnostics: Pick<PalaceRecallDiagnostics, "inferredRoom" | "resolvedRoom" | "roomInference" | "inferredSourceFile">,
): string[] {
  const room = diagnostics.inferredRoom ?? diagnostics.resolvedRoom;
  if (!room || !diagnostics.roomInference) return ["default"];
  if (diagnostics.roomInference === "query") {
    return ["query", ...tokenizeRecallText(room)];
  }
  if (diagnostics.roomInference === "resolved_hit") {
    return ["resolved-hit", ...tokenizeRecallText(room)];
  }
  const queryTokens = new Set(tokenizeSourceHintQuery(query));
  const sourceTokens = diagnostics.inferredSourceFile
    ? tokenizeRecallText(diagnostics.inferredSourceFile.replace(/\.[a-z0-9]+$/i, ""))
    : [];
  const overlaps = sourceTokens.filter((token, index) => queryTokens.has(token) && sourceTokens.indexOf(token) === index);
  return overlaps.length > 0
    ? ["source_hint", ...overlaps]
    : ["source_hint", ...tokenizeRecallText(room)];
}

function tokenizeRecallText(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3);
}

function normalizeHallType(value: string | undefined): HallType | undefined {
  switch (value) {
    case "hall_facts":
    case "hall_events":
    case "hall_discoveries":
    case "hall_preferences":
    case "hall_advice":
      return value;
    default:
      return undefined;
  }
}

function scoreTunnelRoom(
  queryTokens: string[],
  normalizedQuery: string,
  hall: HallType | undefined,
  tunnel: { room: string; count: number; halls?: string[]; wings?: string[] },
  maxCount: number,
): number {
  const explicitBonus = normalizedQuery.includes(normalizeWingToken(tunnel.room)) ? 1 : 0;
  const tokenText = [
    tunnel.room,
    ...(tunnel.halls ?? []),
    ...(tunnel.wings ?? []),
  ].join(" ");
  const tunnelTokens = new Set(tokenizeRecallText(tokenText));
  const overlap = queryTokens.reduce((count, token) => count + (tunnelTokens.has(token) ? 1 : 0), 0);
  const overlapScore = queryTokens.length > 0 ? overlap / queryTokens.length : 0;
  const hallBonus = hall && tunnel.halls?.includes(hall) ? 0.4 : 0;
  const countScore = maxCount > 0 ? tunnel.count / maxCount : 0;
  return explicitBonus + overlapScore * 0.5 + hallBonus + countScore * 0.15;
}
