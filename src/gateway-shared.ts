import type { SerializedMessage } from "./runtime/message";

export function readString(obj: unknown, keys: string[], fallback = ""): string {
  if (!obj || typeof obj !== "object") return fallback;
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (value != null) return String(value);
  }
  return fallback;
}

export function historyTimestampBoundary(
  history: SerializedMessage[],
  mode: "first" | "latest",
  fallback = "",
): string {
  let selectedValue = "";
  let selectedTime = 0;

  for (const message of history) {
    const timestamp = readString(message, ["timestamp"]);
    if (!timestamp) continue;
    const parsed = Date.parse(timestamp);
    if (!Number.isFinite(parsed)) continue;
    if (!selectedValue) {
      selectedValue = timestamp;
      selectedTime = parsed;
      continue;
    }
    if (mode === "first" ? parsed < selectedTime : parsed > selectedTime) {
      selectedValue = timestamp;
      selectedTime = parsed;
    }
  }

  return selectedValue || fallback;
}

export function readNumber(obj: unknown, keys: string[], fallback = 0): number {
  if (!obj || typeof obj !== "object") return fallback;
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return fallback;
}

export function messageCount(session: unknown): number {
  if (!session || typeof session !== "object") return 0;
  const record = session as Record<string, unknown>;
  const history = record.history;
  const messages = record.messages;
  if (Array.isArray(history)) return history.length;
  if (Array.isArray(messages)) return messages.length;
  const count = record.messageCount ?? record.message_count;
  return typeof count === "number" ? count : 0;
}

export function sessionHistory(session: unknown): SerializedMessage[] {
  if (!session || typeof session !== "object") return [];
  const record = session as Record<string, unknown>;
  const history = record.history;
  if (!Array.isArray(history)) return [];
  return history.filter((message): message is SerializedMessage => (
    typeof message === "object"
    && message !== null
    && typeof (message as Record<string, unknown>).type === "string"
  ));
}

export function clearSessionHistory(session: unknown): boolean {
  if (!session || typeof session !== "object") return false;
  const record = session as Record<string, unknown>;
  const target = Array.isArray(record.history)
    ? record.history
    : Array.isArray(record.messages)
      ? record.messages
      : null;
  if (!target) return false;
  const first = target[0] as Record<string, unknown> | undefined;
  const firstType = String(first?.type ?? first?.role ?? "");
  const preserved = first && firstType === "system" ? [first] : [];
  target.splice(0, target.length, ...preserved);
  return true;
}
