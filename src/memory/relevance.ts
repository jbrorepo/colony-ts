/**
 * Generative memory relevance scoring.
 *
 * Cheap reranking layer that can sit behind keyword retrieval when a side
 * query model is available. Falls back to the original candidate order.
 */

const DEFAULT_TOP_N = 5;
const SIDE_QUERY_TIMEOUT_MS = 10_000;

const SELECTOR_SYSTEM_PROMPT = [
  "You select Colony memories relevant to a user's immediate query.",
  "Return JSON only: {\"selected\": [\"topic a\", \"topic b\"]}.",
  "Only choose memories clearly useful right now. Up to 5.",
].join(" ");

export interface RelevantMemory {
  topic: string;
  content: string;
  caste: string;
  filePath: string;
  score?: number;
}

export async function filterRelevantMemories(
  userQuery: string,
  candidateMemories: RelevantMemory[],
  llmCall?: ((systemPrompt: string, userContent: string) => Promise<string> | string) | null,
  topN = DEFAULT_TOP_N,
  timeoutMs = SIDE_QUERY_TIMEOUT_MS,
): Promise<RelevantMemory[]> {
  if (candidateMemories.length === 0) return [];
  if (!llmCall) return candidateMemories.slice(0, topN);

  const topicMap = new Map<string, RelevantMemory>();
  const manifest = candidateMemories
    .map((memory, index) => {
      const topic = memory.topic || `memory_${index}`;
      topicMap.set(topic, memory);
      const description = memory.content.slice(0, 200).replace(/\s+/g, " ").trim();
      return `- ${topic}: ${description}`;
    })
    .join("\n");

  const userContent = `Query: ${userQuery}\n\nAvailable memories:\n${manifest}`;

  try {
    const result = await promiseWithTimeout(
      Promise.resolve(llmCall(SELECTOR_SYSTEM_PROMPT, userContent)),
      timeoutMs,
    );
    const parsed = JSON.parse(result) as { selected?: string[] };
    const selectedTopics = Array.isArray(parsed.selected) ? parsed.selected : [];
    if (selectedTopics.length === 0) return [];

    const selected: RelevantMemory[] = [];
    for (const topic of selectedTopics) {
      const memory = topicMap.get(topic);
      if (memory) selected.push(memory);
    }
    return selected.slice(0, topN);
  } catch {
    return candidateMemories.slice(0, topN);
  }
}

export function filterRelevantMemoriesSync(
  _userQuery: string,
  candidateMemories: RelevantMemory[],
  _llmCall?: ((systemPrompt: string, userContent: string) => Promise<string> | string) | null,
  topN = DEFAULT_TOP_N,
): RelevantMemory[] {
  return candidateMemories.slice(0, topN);
}

async function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
