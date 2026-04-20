/**
 * Bash security classifier — classifies shell commands by risk level.
 *
 * 1:1 port of the BashSecurityClassifier from colony/runtime/tool_permissions.py.
 *
 * Operates on raw command strings and uses prefix matching, regex scanning,
 * and pipeline parsing to assign one of four risk levels:
 *   - "safe"           — Harmless read-only commands
 *   - "needs_approval" — Potentially state-modifying but not destructive
 *   - "dangerous"      — High potential for data loss / system damage
 *   - "blocked"        — Unconditionally prohibited
 */

// ---------------------------------------------------------------------------
// Prefix sets
// ---------------------------------------------------------------------------

/** Commands (or command prefixes) that are unconditionally safe. */
const SAFE_PREFIXES = new Set([
  "ls", "cat", "head", "tail", "wc", "echo", "pwd", "which", "env",
  "date", "whoami", "find", "file", "stat", "tree", "less", "more",
  "sort", "uniq", "diff", "grep", "awk", "sed",
  // git read-only sub-commands
  "git status", "git log", "git diff", "git branch", "git show",
  "git remote", "git tag", "git rev-parse", "git describe",
  "git stash list",
  // version / info queries
  "python --version", "python3 --version", "pip list", "pip show",
  "node --version", "npm list", "cargo --version", "go version",
  // shell builtins
  "cd", "test", "true", "false", "type", "command", "printf", "read",
]);

/** Command prefixes that are unconditionally blocked. */
const BLOCKED_PREFIXES = new Set([
  "sudo", "su", "mount", "umount", "dd", "mkfs", "fdisk",
  "shutdown", "reboot", "init", "systemctl", "service",
  "passwd", "useradd", "userdel", "usermod",
]);

// ---------------------------------------------------------------------------
// Dangerous patterns
// ---------------------------------------------------------------------------

const DANGEROUS_PATTERNS: Array<[RegExp, string]> = [
  [/rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|--force\s+)*\//, "Recursive forced deletion at filesystem root"],
  [/>\s*\/dev\/sd/, "Direct write to block device"],
  [/:\s*\(\s*\)\s*\{/, "Fork-bomb pattern"],
  [/\|\s*(sh|bash|zsh|dash|ksh)\b/, "Pipe to shell interpreter"],
  [/curl\s+.*\|\s*(sh|bash|zsh|dash)/, "Download-and-execute pattern"],
  [/wget\s+.*-O\s*-\s*\|/, "Download-and-execute via wget"],
  [/chmod\s+[-+]?[0-7]*[7][0-7]{2}\s+\//, "World-executable bit set on root path"],
  [/\brm\s+(-r|-rf|-fr|--recursive)\b/, "Recursive removal"],
  [/>\s*\/etc\//, "Redirect output into /etc"],
  [/kill\s+(-9|-SIGKILL|-KILL)\s+1\b/, "Kill PID 1 (init/systemd)"],
];

// ---------------------------------------------------------------------------
// Injection patterns
// ---------------------------------------------------------------------------

const INJECTION_PATTERNS: Array<[RegExp, string]> = [
  [/`[^`]+`/, "Command substitution via backticks"],
  [/\$\([^)]+\)/, "Command substitution via $(…)"],
  [/\beval\s+/, "Eval execution"],
  [/\bexec\s+/, "Exec replacement"],
  [/\bsource\s+/, "Shell source execution"],
  [/(?:^|;|&&|\|\|)\s*\.\s+[^\s.\/]/, "Dot-source execution"],
];

// ---------------------------------------------------------------------------
// Pipeline parsing
// ---------------------------------------------------------------------------

const CHAIN_RE = /\|\|?|&&|;/;

// ---------------------------------------------------------------------------
// Risk-level ordering
// ---------------------------------------------------------------------------

const LEVEL_ORDER: Record<string, number> = {
  safe: 0,
  needs_approval: 1,
  dangerous: 2,
  blocked: 3,
};

function maxLevel(a: string, b: string): string {
  return (LEVEL_ORDER[a] ?? 0) >= (LEVEL_ORDER[b] ?? 0) ? a : b;
}

// ---------------------------------------------------------------------------
// BashSecurityClassifier
// ---------------------------------------------------------------------------

export class BashSecurityClassifier {
  classify(command: string): string {
    if (!command || !command.trim()) return "safe";

    let worst = "safe";

    for (const segment of this.parsePipeline(command)) {
      const level = this._classifySegment(segment);
      worst = maxLevel(worst, level);
      if (worst === "blocked") break;
    }

    if (this.detectInjection(command) !== null) {
      worst = maxLevel(worst, "dangerous");
    }

    for (const [pattern] of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        worst = maxLevel(worst, "dangerous");
        break;
      }
    }

    return worst;
  }

  extractPrefix(command: string): string {
    const stripped = command.trim();
    const tokens = stripped.split(/\s+/);
    let start = 0;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].includes("=") && /^[A-Za-z_]\w*=/.test(tokens[i])) {
        start = i + 1;
      } else {
        break;
      }
    }
    const effective = start < tokens.length ? tokens.slice(start) : tokens;

    if (effective.length === 0) return "";

    if (effective.length >= 2) {
      const twoToken = `${effective[0]} ${effective[1]}`;
      if (SAFE_PREFIXES.has(twoToken) || BLOCKED_PREFIXES.has(twoToken)) {
        return twoToken;
      }
    }

    return effective[0];
  }

  detectInjection(command: string): string | null {
    for (const [pattern, description] of INJECTION_PATTERNS) {
      if (pattern.test(command)) return description;
    }
    return null;
  }

  parsePipeline(command: string): string[] {
    return command
      .split(CHAIN_RE)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  private _classifySegment(segment: string): string {
    const prefix = this.extractPrefix(segment);
    const base = prefix.split(/\s+/)[0] || "";

    if (BLOCKED_PREFIXES.has(prefix) || BLOCKED_PREFIXES.has(base)) {
      return "blocked";
    }

    if (base === "sed" && /\s-[a-zA-Z]*i/.test(segment)) {
      return "needs_approval";
    }

    for (const [pattern] of DANGEROUS_PATTERNS) {
      if (pattern.test(segment)) return "dangerous";
    }

    if (SAFE_PREFIXES.has(prefix) || SAFE_PREFIXES.has(base)) {
      return "safe";
    }

    return "needs_approval";
  }
}
