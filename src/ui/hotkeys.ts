export interface ShortcutKeyLike {
  ctrl?: boolean;
}

export type SessionNavAction = "sessions" | "history" | "resume";

export const SESSION_NAV_LABEL = "Ctrl+J sessions | Ctrl+G history | Ctrl+R resume smart";

const SESSION_NAV_KEYS: Record<SessionNavAction, string> = {
  sessions: "j",
  history: "g",
  resume: "r",
};

export function resolveSessionNavAction(input: string, key: ShortcutKeyLike): SessionNavAction | null {
  if (!key.ctrl) {
    return null;
  }

  const lowerInput = input.toLowerCase();
  if (lowerInput === SESSION_NAV_KEYS.sessions) {
    return "sessions";
  }
  if (lowerInput === SESSION_NAV_KEYS.history) {
    return "history";
  }
  if (lowerInput === SESSION_NAV_KEYS.resume) {
    return "resume";
  }
  return null;
}
