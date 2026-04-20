/**
 * Derived memory artifact store.
 *
 * Stores compact, lossy memory artifacts that always point back to canonical
 * verbatim transcript turns. This is the "closet" layer on top of drawers.
 */

import { appendFile, mkdir, readdir } from "fs/promises";
import { randomUUID } from "crypto";
import { join } from "path";

import { compressTextCaveman } from "../llm/caveman-bridge";
import { Dialect } from "../mempalace/dialect";
import type { LoggedTurnRecord } from "./conversation-log";
import { getDataPath, settings } from "../settings";

export interface MemoryArtifact {
  artifactId: string;
  sessionId: string;
  createdAt: string;
  strategy: "caveman" | "aaak" | "hybrid";
  sourceTurnIds: string[];
  sourceRoles: string[];
  transcriptPath: string;
  verbatimExcerpt: string;
  verbatimChars: number;
  cavemanSummary: string;
  aaakSummary: string;
  metadata: Record<string, unknown>;
}

export interface ArtifactSearchHit {
  artifact: MemoryArtifact;
  score: number;
}

function safeSessionId(sessionId: string): string {
  return sessionId.replace(/[\\/]+/g, "_").replace(/\.\./g, "_");
}

function extractKeywords(text: string): Set<string> {
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [];
  return new Set(words);
}

function excerptTurns(turns: LoggedTurnRecord[], maxChars = 800): string {
  const text = turns
    .map((turn) => `[${turn.role}] ${turn.content}`)
    .join("\n");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 3)}...`;
}

export function createMemoryArtifact(input: {
  sessionId: string;
  transcriptPath: string;
  turns: LoggedTurnRecord[];
  metadata?: Record<string, unknown>;
}): MemoryArtifact | null {
  if (input.turns.length === 0) return null;

  const verbatimText = input.turns
    .map((turn) => `[${turn.role}] ${turn.content}`)
    .join("\n\n");
  const verbatimExcerpt = excerptTurns(input.turns);
  const dialect = new Dialect();
  const aaakSummary = dialect.compress(verbatimText, {
    wing: "session",
    room: safeSessionId(input.sessionId),
    source_file: safeSessionId(input.sessionId),
    date: new Date().toISOString().slice(0, 10),
  });
  const cavemanSummary = compressTextCaveman(verbatimText);

  return {
    artifactId: `art_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    sessionId: input.sessionId,
    createdAt: new Date().toISOString(),
    strategy: "hybrid",
    sourceTurnIds: input.turns.map((turn) => turn.turn_id),
    sourceRoles: input.turns.map((turn) => turn.role),
    transcriptPath: input.transcriptPath,
    verbatimExcerpt,
    verbatimChars: verbatimText.length,
    cavemanSummary,
    aaakSummary,
    metadata: { ...(input.metadata ?? {}) },
  };
}

export class MemoryArtifactStore {
  private readonly _baseDir: string;

  constructor(baseDir = join(getDataPath(settings), "memory-artifacts")) {
    this._baseDir = baseDir;
  }

  get baseDir(): string {
    return this._baseDir;
  }

  artifactPath(sessionId: string): string {
    return join(this._baseDir, `${safeSessionId(sessionId)}.jsonl`);
  }

  async appendArtifact(artifact: MemoryArtifact): Promise<void> {
    await mkdir(this._baseDir, { recursive: true });
    await appendFile(
      this.artifactPath(artifact.sessionId),
      `${JSON.stringify(artifact)}\n`,
      "utf8",
    );
  }

  async listArtifacts(sessionId: string): Promise<MemoryArtifact[]> {
    const file = Bun.file(this.artifactPath(sessionId));
    if (!(await file.exists())) return [];
    const text = await file.text();
    return parseArtifactLines(text).reverse();
  }

  async listAllArtifacts(): Promise<MemoryArtifact[]> {
    let entries;
    try {
      entries = await readdir(this._baseDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const artifacts: MemoryArtifact[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const text = await Bun.file(join(this._baseDir, entry.name)).text();
      artifacts.push(...parseArtifactLines(text));
    }
    return artifacts.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }

  async searchArtifacts(
    query: string,
    opts: { sessionId?: string; limit?: number } = {},
  ): Promise<ArtifactSearchHit[]> {
    const limit = opts.limit ?? 5;
    const artifacts = opts.sessionId
      ? await this.listArtifacts(opts.sessionId)
      : await this.listAllArtifacts();
    if (artifacts.length === 0) return [];

    const queryKeywords = extractKeywords(query);
    const scored = artifacts
      .map((artifact, index) => {
        const haystack = [
          artifact.verbatimExcerpt,
          artifact.cavemanSummary,
          artifact.aaakSummary,
          JSON.stringify(artifact.metadata),
        ].join("\n");
        const hayKeywords = extractKeywords(haystack);
        const overlap = [...queryKeywords].filter((keyword) => hayKeywords.has(keyword)).length;
        const recencyBoost = Math.max(0, 0.15 - index * 0.01);
        const score = overlap / Math.max(1, queryKeywords.size) + recencyBoost;
        return { artifact, score };
      })
      .filter((hit) => hit.score > 0);

    scored.sort((left, right) => right.score - left.score);
    return scored.slice(0, limit);
  }
}

function parseArtifactLines(text: string): MemoryArtifact[] {
  const artifacts: MemoryArtifact[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as MemoryArtifact;
      if (
        parsed
        && typeof parsed.artifactId === "string"
        && typeof parsed.sessionId === "string"
        && typeof parsed.createdAt === "string"
        && typeof parsed.verbatimExcerpt === "string"
      ) {
        artifacts.push(parsed);
      }
    } catch {
      // Ignore malformed JSONL rows.
    }
  }
  return artifacts;
}
