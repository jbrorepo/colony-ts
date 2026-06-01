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

export const KEYBOARD_SHORTCUT_REFERENCE = `
╔══════════════════════════════════════════════════╗
║           COLONY KEYBOARD SHORTCUTS              ║
╠══════════════════════════════════════════════════╣
║  General                                         ║
║    ?              Show this reference             ║
║    /help          Full command list               ║
║    /exit          Exit The Colony                 ║
║                                                  ║
║  Run Control                                     ║
║    Ctrl+C         Cancel active run              ║
║    Esc            Cancel active run              ║
║                                                  ║
║  Approval (when run is waiting for approval)     ║
║    y              Allow this call once            ║
║    a              Allow this exact call always    ║
║    n              Deny this call                  ║
║    s              Inspect call details            ║
║    Esc            Cancel the run                  ║
║                                                  ║
║  Panels & Display                                ║
║    Ctrl+B         Toggle budget/cost panel        ║
║    PgUp / PgDn    Scroll message log              ║
║    Ctrl+L         Reset log scroll to bottom      ║
║                                                  ║
║  Session Navigation                              ║
║    Ctrl+J         Open session catalog            ║
║    Ctrl+G         Show smart history              ║
║    Ctrl+R         Resume last session             ║
║    /sessions      Browse saved sessions           ║
║    /resume        Resume by ID                    ║
║    /history       Show message history            ║
╚══════════════════════════════════════════════════╝
`.trim();

