/**
 * Hybrid memory recall.
 *
 * Merges exact transcript recall with derived compact artifacts. Exact text is
 * always labeled as verbatim truth; derived recalls are explicitly labeled as
 * compressed context helpers.
 */

import type { LoggedTurnRecord } from "./conversation-log";
import { ConversationLogger } from "./conversation-log";
import type { ArtifactSearchHit, MemoryArtifact } from "./artifact-store";
import { MemoryArtifactStore } from "./artifact-store";

export interface MemoryResult {
  content: string;
  source: "conversation" | "artifact";
  score: number;
  sessionId: string;
  role: string;
  exact: boolean;
  artifactId?: string;
  metadata: Record<string, unknown>;
}

export class HybridMemory {
  private readonly _conversations: ConversationLogger;
  private readonly _artifacts: MemoryArtifactStore;

  constructor(opts: {
    conversationLogger?: ConversationLogger;
    artifactStore?: MemoryArtifactStore;
  } = {}) {
    this._conversations = opts.conversationLogger ?? new ConversationLogger();
    this._artifacts = opts.artifactStore ?? new MemoryArtifactStore();
  }

  get conversationLogger(): ConversationLogger {
    return this._conversations;
  }

  get artifactStore(): MemoryArtifactStore {
    return this._artifacts;
  }

  async recall(
    query: string,
    opts: {
      strategy?: "conversation" | "artifact" | "hybrid";
      topK?: number;
      sessionId?: string;
    } = {},
  ): Promise<MemoryResult[]> {
    const strategy = opts.strategy ?? "hybrid";
    const topK = opts.topK ?? 5;
    const results: MemoryResult[] = [];

    if (strategy === "conversation" || strategy === "hybrid") {
      results.push(...await this._recallConversation(query, opts.sessionId, topK));
    }

    if (strategy === "artifact" || strategy === "hybrid") {
      results.push(...await this._recallArtifacts(query, opts.sessionId, topK));
    }

    results.sort((left, right) => right.score - left.score);
    return results.slice(0, topK);
  }

  private async _recallConversation(query: string, sessionId: string | undefined, topK: number): Promise<MemoryResult[]> {
    const sessionIds = sessionId
      ? [sessionId, ...(await this._conversations.listSessions()).filter((id) => id !== sessionId)]
      : await this._conversations.listSessions();
    const queryKeywords = extractKeywords(query);
    const hits: MemoryResult[] = [];

    for (const currentSessionId of sessionIds) {
      const history = await this._conversations.getHistory(currentSessionId, 0);
      const scored = history
        .map((match, index) => ({
          match,
          index,
          score: scoreConversationMatch(match.content, queryKeywords),
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score);

      for (const [index, entry] of scored.slice(0, topK).entries()) {
        hits.push(this._mapConversationHit(
          entry.match,
          currentSessionId,
          index,
          currentSessionId === sessionId,
          entry.score,
        ));
      }
    }

    hits.sort((left, right) => right.score - left.score);
    return hits.slice(0, topK);
  }

  private async _recallArtifacts(query: string, sessionId: string | undefined, topK: number): Promise<MemoryResult[]> {
    const hits = await this._artifacts.searchArtifacts(query, { sessionId, limit: topK });
    return hits.map((hit) => this._mapArtifactHit(hit));
  }

  private _mapConversationHit(
    match: LoggedTurnRecord,
    sessionId: string,
    index: number,
    currentSession: boolean,
    lexicalScore: number,
  ): MemoryResult {
    const base = Math.max(0.2, lexicalScore - index * 0.05);
    return {
      content: `[${match.role}] ${match.content}`,
      source: "conversation",
      score: currentSession ? base + 0.2 : base,
      sessionId,
      role: match.role,
      exact: true,
      metadata: { ...match.metadata, timestamp: match.timestamp, turnId: match.turn_id },
    };
  }

  private _mapArtifactHit(hit: ArtifactSearchHit): MemoryResult {
    const artifact = hit.artifact;
    return {
      content: [
        `Derived compact recall. Not verbatim.`,
        `Caveman: ${artifact.cavemanSummary}`,
        `AAAK: ${artifact.aaakSummary}`,
        `Source excerpt: ${artifact.verbatimExcerpt}`,
      ].join("\n"),
      source: "artifact",
      score: hit.score,
      sessionId: artifact.sessionId,
      role: "system",
      exact: false,
      artifactId: artifact.artifactId,
      metadata: {
        ...artifact.metadata,
        sourceTurnIds: [...artifact.sourceTurnIds],
        transcriptPath: artifact.transcriptPath,
        createdAt: artifact.createdAt,
      },
    };
  }
}

function extractKeywords(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []);
}

function scoreConversationMatch(content: string, queryKeywords: Set<string>): number {
  if (queryKeywords.size === 0) return 0;
  const contentKeywords = extractKeywords(content);
  const overlap = [...queryKeywords].filter((keyword) => contentKeywords.has(keyword)).length;
  return overlap / queryKeywords.size;
}
