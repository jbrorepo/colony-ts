/**
 * AAAK Dialect — Structured Symbolic Summary Format.
 *
 * 1:1 port of mempalace/dialect.py.
 *
 * A lossy summarization format that extracts entities, topics, key sentences,
 * emotions, and flags from plain text into a compact structured representation.
 * Any LLM reads it natively — no decoder required.
 *
 * FORMAT:
 *   Header:   FILE_NUM|PRIMARY_ENTITY|DATE|TITLE
 *   Zettel:   ZID:ENTITIES|topic_keywords|"key_quote"|WEIGHT|EMOTIONS|FLAGS
 *   Tunnel:   T:ZID<->ZID|label
 *   Arc:      ARC:emotion->emotion->emotion
 *
 * NOTE: AAAK is NOT lossless. The original text cannot be reconstructed from
 * AAAK output. It is a summary layer (closets) that points to the original
 * verbatim content (drawers).
 */

// ---------------------------------------------------------------------------
// Emotion codes (universal)
// ---------------------------------------------------------------------------

const EMOTION_CODES: Record<string, string> = {
  vulnerability: "vul", vulnerable: "vul",
  joy: "joy", joyful: "joy",
  fear: "fear", mild_fear: "fear",
  trust: "trust", trust_building: "trust",
  grief: "grief", raw_grief: "grief",
  wonder: "wonder", philosophical_wonder: "wonder",
  rage: "rage", anger: "rage",
  love: "love", devotion: "love",
  hope: "hope",
  despair: "despair", hopelessness: "despair",
  peace: "peace", relief: "relief",
  humor: "humor", dark_humor: "humor",
  tenderness: "tender",
  raw_honesty: "raw", brutal_honesty: "raw",
  self_doubt: "doubt",
  anxiety: "anx", exhaustion: "exhaust",
  conviction: "convict", quiet_passion: "passion",
  warmth: "warmth", curiosity: "curious",
  gratitude: "grat", frustration: "frust",
  confusion: "confuse", satisfaction: "satis",
  excitement: "excite", determination: "determ",
  surprise: "surprise",
};

// Keyword signals for emotion detection in plain text
const EMOTION_SIGNALS: Record<string, string> = {
  decided: "determ", prefer: "convict", worried: "anx",
  excited: "excite", frustrated: "frust", confused: "confuse",
  love: "love", hate: "rage", hope: "hope", fear: "fear",
  trust: "trust", happy: "joy", sad: "grief",
  surprised: "surprise", grateful: "grat", curious: "curious",
  wonder: "wonder", anxious: "anx", relieved: "relief",
  satisf: "satis", disappoint: "grief", concern: "anx",
};

// Keyword signals for flag detection
const FLAG_SIGNALS: Record<string, string> = {
  decided: "DECISION", chose: "DECISION", switched: "DECISION",
  migrated: "DECISION", replaced: "DECISION", "instead of": "DECISION",
  because: "DECISION",
  founded: "ORIGIN", created: "ORIGIN", started: "ORIGIN",
  born: "ORIGIN", launched: "ORIGIN", "first time": "ORIGIN",
  core: "CORE", fundamental: "CORE", essential: "CORE",
  principle: "CORE", belief: "CORE", always: "CORE", "never forget": "CORE",
  "turning point": "PIVOT", "changed everything": "PIVOT",
  realized: "PIVOT", breakthrough: "PIVOT", epiphany: "PIVOT",
  api: "TECHNICAL", database: "TECHNICAL", architecture: "TECHNICAL",
  deploy: "TECHNICAL", infrastructure: "TECHNICAL", algorithm: "TECHNICAL",
  framework: "TECHNICAL", server: "TECHNICAL", config: "TECHNICAL",
};

// Stop words for topic extraction
const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "about", "between",
  "through", "during", "before", "after", "above", "below", "up", "down",
  "out", "off", "over", "under", "again", "further", "then", "once",
  "here", "there", "when", "where", "why", "how", "all", "each", "every",
  "both", "few", "more", "most", "other", "some", "such", "no", "nor",
  "not", "only", "own", "same", "so", "than", "too", "very", "just",
  "don", "now", "and", "but", "or", "if", "while", "that", "this",
  "these", "those", "it", "its", "i", "we", "you", "he", "she", "they",
  "me", "him", "her", "us", "them", "my", "your", "his", "our", "their",
  "what", "which", "who", "whom", "also", "much", "many", "like",
  "because", "since", "get", "got", "use", "used", "using", "make",
  "made", "thing", "things", "way", "well", "really", "want", "need",
]);

// ---------------------------------------------------------------------------
// Dialect class
// ---------------------------------------------------------------------------

export class Dialect {
  private entityCodes: Record<string, string>;
  private skipNames: string[];

  constructor(opts?: {
    entities?: Record<string, string>;
    skipNames?: string[];
  }) {
    this.entityCodes = {};
    if (opts?.entities) {
      for (const [name, code] of Object.entries(opts.entities)) {
        this.entityCodes[name] = code;
        this.entityCodes[name.toLowerCase()] = code;
      }
    }
    this.skipNames = (opts?.skipNames ?? []).map((n) => n.toLowerCase());
  }

  /** Load entity mappings from a JSON config object. */
  static fromConfig(config: { entities?: Record<string, string>; skipNames?: string[] }): Dialect {
    return new Dialect(config);
  }

  // ── Entity/emotion encoding ───────────────────────────────────────────

  /** Convert a person/entity name to its short code. */
  encodeEntity(name: string): string | null {
    if (this.skipNames.some((s) => name.toLowerCase().includes(s))) return null;
    if (this.entityCodes[name]) return this.entityCodes[name];
    if (this.entityCodes[name.toLowerCase()]) return this.entityCodes[name.toLowerCase()];
    for (const [key, code] of Object.entries(this.entityCodes)) {
      if (key.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(key.toLowerCase())) {
        return code;
      }
    }
    // Auto-code: first 3 chars uppercase
    return name.slice(0, 3).toUpperCase();
  }

  /** Convert emotion list to compact codes. */
  encodeEmotions(emotions: string[]): string {
    const codes: string[] = [];
    for (const e of emotions) {
      const code = EMOTION_CODES[e] ?? e.slice(0, 4);
      if (!codes.includes(code)) codes.push(code);
    }
    return codes.slice(0, 3).join("+");
  }

  // ── Plain text compression ─────────────────────────────────────────────

  private _detectEmotions(text: string): string[] {
    const lower = text.toLowerCase();
    const detected: string[] = [];
    const seen = new Set<string>();
    for (const [keyword, code] of Object.entries(EMOTION_SIGNALS)) {
      if (lower.includes(keyword) && !seen.has(code)) {
        detected.push(code);
        seen.add(code);
      }
    }
    return detected.slice(0, 3);
  }

  private _detectFlags(text: string): string[] {
    const lower = text.toLowerCase();
    const detected: string[] = [];
    const seen = new Set<string>();
    for (const [keyword, flag] of Object.entries(FLAG_SIGNALS)) {
      if (lower.includes(keyword) && !seen.has(flag)) {
        detected.push(flag);
        seen.add(flag);
      }
    }
    return detected.slice(0, 3);
  }

  private _extractTopics(text: string, maxTopics = 3): string[] {
    const words = text.match(/[a-zA-Z][a-zA-Z_-]{2,}/g) ?? [];
    const freq: Record<string, number> = {};

    for (const w of words) {
      const lower = w.toLowerCase();
      if (STOP_WORDS.has(lower) || lower.length < 3) continue;
      freq[lower] = (freq[lower] ?? 0) + 1;
    }

    // Boost proper nouns and technical terms
    for (const w of words) {
      const lower = w.toLowerCase();
      if (STOP_WORDS.has(lower)) continue;
      if (w[0] === w[0].toUpperCase() && lower in freq) freq[lower] += 2;
      if (w.includes("_") || w.includes("-")) {
        if (lower in freq) freq[lower] += 2;
      }
    }

    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxTopics)
      .map(([w]) => w);
  }

  private _extractKeySentence(text: string): string {
    const sentences = text.split(/[.!?\n]+/).map((s) => s.trim()).filter((s) => s.length > 10);
    if (sentences.length === 0) return "";

    const decisionWords = new Set([
      "decided", "because", "instead", "prefer", "switched", "chose",
      "realized", "important", "key", "critical", "discovered", "learned",
      "conclusion", "solution", "reason", "why", "breakthrough", "insight",
    ]);

    const scored = sentences.map((s) => {
      let score = 0;
      const lower = s.toLowerCase();
      for (const w of decisionWords) {
        if (lower.includes(w)) score += 2;
      }
      if (s.length < 80) score += 1;
      if (s.length < 40) score += 1;
      if (s.length > 150) score -= 2;
      return { score, sentence: s };
    });

    scored.sort((a, b) => b.score - a.score);
    let best = scored[0].sentence;
    if (best.length > 55) best = best.slice(0, 52) + "...";
    return best;
  }

  private _detectEntitiesInText(text: string): string[] {
    const found: string[] = [];

    // Check known entities
    for (const [name, code] of Object.entries(this.entityCodes)) {
      if (!name.match(/^[a-z]/) && text.toLowerCase().includes(name.toLowerCase())) {
        if (!found.includes(code)) found.push(code);
      }
    }
    if (found.length > 0) return found;

    // Fallback: find capitalized words
    const words = text.split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      const clean = words[i].replace(/[^a-zA-Z]/g, "");
      if (
        clean.length >= 2 &&
        clean[0] === clean[0].toUpperCase() &&
        clean.slice(1) === clean.slice(1).toLowerCase() &&
        !STOP_WORDS.has(clean.toLowerCase())
      ) {
        const code = clean.slice(0, 3).toUpperCase();
        if (!found.includes(code)) found.push(code);
        if (found.length >= 3) break;
      }
    }
    return found;
  }

  /**
   * Compress plain text into AAAK Dialect format.
   *
   * This is lossy — the original text cannot be reconstructed.
   */
  compress(text: string, metadata?: Record<string, string>): string {
    const meta = metadata ?? {};

    const entities = this._detectEntitiesInText(text);
    const entityStr = entities.slice(0, 3).join("+") || "???";

    const topics = this._extractTopics(text);
    const topicStr = topics.slice(0, 3).join("_") || "misc";

    const quote = this._extractKeySentence(text);
    const quotePart = quote ? `"${quote}"` : "";

    const emotions = this._detectEmotions(text);
    const emotionStr = emotions.join("+");

    const flags = this._detectFlags(text);
    const flagStr = flags.join("+");

    const lines: string[] = [];

    // Header line (if metadata available)
    const source = meta.source_file ?? "";
    const wing = meta.wing ?? "";
    const room = meta.room ?? "";
    const date = meta.date ?? "";

    if (source || wing) {
      const headerParts = [
        wing || "?",
        room || "?",
        date || "?",
        source ? source.replace(/\.[^.]+$/, "") : "?",
      ];
      lines.push(headerParts.join("|"));
    }

    // Content line
    const parts = [`0:${entityStr}`, topicStr];
    if (quotePart) parts.push(quotePart);
    if (emotionStr) parts.push(emotionStr);
    if (flagStr) parts.push(flagStr);
    lines.push(parts.join("|"));

    return lines.join("\n");
  }

  /**
   * Decompress is not supported — AAAK is lossy.
   * This method returns the input as-is for display purposes.
   */
  decompress(aaakText: string): string {
    return aaakText;
  }

  /** Save entity mappings to a JSON config string. */
  exportConfig(): string {
    const canonical: Record<string, string> = {};
    const seenCodes = new Set<string>();
    for (const [name, code] of Object.entries(this.entityCodes)) {
      if (!seenCodes.has(code) && name[0] !== name[0].toLowerCase()) {
        canonical[name] = code;
        seenCodes.add(code);
      }
    }
    return JSON.stringify({ entities: canonical, skipNames: this.skipNames }, null, 2);
  }
}

// ---------------------------------------------------------------------------
// Convenience exports
// ---------------------------------------------------------------------------

/** Create a Dialect with entity auto-detection. */
export function createDialect(entities?: Record<string, string>): Dialect {
  return new Dialect({ entities });
}
