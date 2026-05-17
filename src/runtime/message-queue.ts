export interface QueuedUserMessage {
  content: string;
  timestamp: number;
}

export interface EnqueueUserMessageResult {
  accepted: boolean;
  duplicate: boolean;
  replaced: boolean;
  queuedCount: number;
  queuedPreview: string | null;
}

export interface UserMessageQueue {
  enqueue: (content: string) => EnqueueUserMessageResult;
  dequeue: () => QueuedUserMessage | null;
  peek: () => QueuedUserMessage | null;
  clear: () => void;
  depth: () => number;
}

export interface UserMessageQueueOptions {
  dedupTtlMs?: number;
}

function normalizeQueueContent(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function queuePreview(content: string): string | null {
  const normalized = normalizeQueueContent(content);
  if (!normalized) return null;
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

export function createUserMessageQueue(
  options: UserMessageQueueOptions = {},
): UserMessageQueue {
  const dedupTtlMs = Math.max(0, options.dedupTtlMs ?? 5000);
  let pending: QueuedUserMessage | null = null;
  let lastAcceptedContent = "";
  let lastAcceptedAt = 0;

  return {
    enqueue(content: string): EnqueueUserMessageResult {
      const normalized = normalizeQueueContent(content);
      if (!normalized) {
        return {
          accepted: false,
          duplicate: false,
          replaced: false,
          queuedCount: pending ? 1 : 0,
          queuedPreview: pending ? queuePreview(pending.content) : null,
        };
      }

      const now = Date.now();
      if (
        normalized === lastAcceptedContent
        && now - lastAcceptedAt < dedupTtlMs
      ) {
        return {
          accepted: false,
          duplicate: true,
          replaced: false,
          queuedCount: pending ? 1 : 0,
          queuedPreview: pending ? queuePreview(pending.content) : null,
        };
      }

      const replaced = pending !== null;
      pending = {
        content: normalized,
        timestamp: now,
      };
      lastAcceptedContent = normalized;
      lastAcceptedAt = now;
      return {
        accepted: true,
        duplicate: false,
        replaced,
        queuedCount: 1,
        queuedPreview: queuePreview(normalized),
      };
    },

    dequeue(): QueuedUserMessage | null {
      const next = pending;
      pending = null;
      return next;
    },

    peek(): QueuedUserMessage | null {
      return pending ? { ...pending } : null;
    },

    clear(): void {
      pending = null;
    },

    depth(): number {
      return pending ? 1 : 0;
    },
  };
}
