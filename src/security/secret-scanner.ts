/**
 * Secret scanner.
 *
 * Ports colony/security/secret_scanner.py. Detects common credentials and
 * produces redacted text before content enters prompts, memory, or logs.
 */

export type SecretSeverity = "critical" | "high" | "medium" | "low";

export interface SecretPattern {
  name: string;
  pattern: RegExp;
  severity: SecretSeverity;
  redaction?: string;
}

export interface SecretFinding {
  patternName: string;
  severity: SecretSeverity;
  lineNumber: number;
  matchText: string;
  start: number;
  end: number;
}

export interface ScanResult {
  hasSecrets: boolean;
  findings: SecretFinding[];
  redactedText: string;
  findingCount: number;
}

const BUILTIN_PATTERNS: SecretPattern[] = [
  {
    name: "anthropic_key",
    pattern: /sk-ant-[A-Za-z0-9\-_]{10,}/g,
    severity: "critical",
  },
  {
    name: "openai_project_key",
    pattern: /sk-proj-[A-Za-z0-9\-_]{20,}/g,
    severity: "critical",
  },
  {
    name: "openai_key",
    pattern: /(?<![A-Za-z0-9_-])sk-[A-Za-z0-9]{32,}(?![A-Za-z0-9_-])/g,
    severity: "critical",
  },
  {
    name: "google_oauth_token",
    pattern: /ya29\.[A-Za-z0-9\-_]{20,}/g,
    severity: "critical",
  },
  {
    name: "groq_key",
    pattern: /gsk_[A-Za-z0-9]{20,}/g,
    severity: "critical",
  },
  {
    name: "aws_access_key",
    pattern: /(?<![A-Z0-9])AKIA[0-9A-Z]{16}(?![A-Z0-9])/g,
    severity: "critical",
  },
  {
    name: "aws_secret_key",
    pattern: /(?:aws[_-]?secret[_-]?access[_-]?key|secret_key)\s*[=:]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi,
    severity: "critical",
  },
  {
    name: "github_pat",
    pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}/g,
    severity: "critical",
  },
  {
    name: "github_fine_grained",
    pattern: /github_pat_[A-Za-z0-9_]{22,255}/g,
    severity: "critical",
  },
  {
    name: "stripe_secret_key",
    pattern: /sk_live_[A-Za-z0-9]{24,99}/g,
    severity: "critical",
  },
  {
    name: "stripe_test_key",
    pattern: /sk_test_[A-Za-z0-9]{24,99}/g,
    severity: "medium",
  },
  {
    name: "jwt",
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    severity: "high",
  },
  {
    name: "private_key",
    pattern: /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/g,
    severity: "critical",
  },
  {
    name: "basic_auth",
    pattern: /Authorization:\s*Basic\s+[A-Za-z0-9+/=]{10,}/gi,
    severity: "high",
  },
  {
    name: "bearer_token",
    pattern: /Authorization:\s*Bearer\s+[A-Za-z0-9._-]{20,}/gi,
    severity: "high",
  },
  {
    name: "postgres_uri",
    pattern: /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@[^\s]+/g,
    severity: "critical",
  },
  {
    name: "mysql_uri",
    pattern: /mysql:\/\/[^:\s]+:[^@\s]+@[^\s]+/g,
    severity: "critical",
  },
  {
    name: "mongodb_uri",
    pattern: /mongodb(?:\+srv)?:\/\/[^:\s]+:[^@\s]+@[^\s]+/g,
    severity: "critical",
  },
  {
    name: "generic_api_key",
    pattern: /(?:api[_-]?key|apikey|api[_-]?secret|api[_-]?token)\s*[=:]\s*['"]?([A-Za-z0-9_-]{20,})['"]?/gi,
    severity: "high",
  },
  {
    name: "password_assignment",
    pattern: /(?:password|passwd|pwd)\s*[=:]\s*['"]([^'"]{8,})['"]/gi,
    severity: "high",
  },
];

export class SecretScanner {
  private readonly enableRedaction: boolean;
  private readonly patterns: SecretPattern[];
  private scanCount = 0;
  private totalFindings = 0;

  constructor(opts: {
    enableRedaction?: boolean;
    customPatterns?: SecretPattern[];
  } = {}) {
    this.enableRedaction = opts.enableRedaction ?? true;
    this.patterns = [...BUILTIN_PATTERNS, ...(opts.customPatterns ?? [])];
  }

  get patternCount(): number {
    return this.patterns.length;
  }

  addPattern(pattern: SecretPattern): void {
    this.patterns.push(pattern);
  }

  scan(text: string): ScanResult {
    if (!text) {
      this.scanCount++;
      return {
        hasSecrets: false,
        findings: [],
        redactedText: text,
        findingCount: 0,
      };
    }

    const findings: SecretFinding[] = [];
    const ranges: Array<{ start: number; end: number; label: string }> = [];

    for (const pattern of this.patterns) {
      pattern.pattern.lastIndex = 0;
      for (const match of text.matchAll(pattern.pattern)) {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        if (ranges.some((range) => overlaps(start, end, range.start, range.end))) {
          continue;
        }

        findings.push({
          patternName: pattern.name,
          severity: pattern.severity,
          lineNumber: text.slice(0, start).split("\n").length,
          matchText: preview(match[0]),
          start,
          end,
        });
        ranges.push({
          start,
          end,
          label: (pattern.redaction ?? "[REDACTED:{name}]").replace("{name}", pattern.name),
        });
      }
    }

    for (const entropyFinding of this.findHighEntropy(text, ranges)) {
      findings.push(entropyFinding.finding);
      ranges.push(entropyFinding.range);
    }

    this.scanCount++;
    this.totalFindings += findings.length;

    return {
      hasSecrets: findings.length > 0,
      findings,
      redactedText: this.enableRedaction ? redact(text, ranges) : text,
      findingCount: findings.length,
    };
  }

  scanMessages<T extends Record<string, unknown>>(messages: T[]): {
    messages: T[];
    findings: SecretFinding[];
  } {
    const allFindings: SecretFinding[] = [];
    const redactedMessages = messages.map((message) => {
      const clone = { ...message };
      const record = clone as Record<string, unknown>;
      if (typeof record.content === "string" && record.content) {
        const result = this.scan(record.content);
        if (result.hasSecrets) {
          record.content = result.redactedText;
          allFindings.push(...result.findings);
        }
      }
      return clone;
    });
    return { messages: redactedMessages, findings: allFindings };
  }

  getStats(): { scanCount: number; totalFindings: number; patternCount: number } {
    return {
      scanCount: this.scanCount,
      totalFindings: this.totalFindings,
      patternCount: this.patterns.length,
    };
  }

  private findHighEntropy(
    text: string,
    ranges: Array<{ start: number; end: number; label: string }>,
  ): Array<{ finding: SecretFinding; range: { start: number; end: number; label: string } }> {
    const results: Array<{ finding: SecretFinding; range: { start: number; end: number; label: string } }> = [];
    const candidates = text.matchAll(/\b[A-Za-z0-9+/=_-]{32,}\b/g);
    for (const match of candidates) {
      const token = match[0];
      const start = match.index ?? 0;
      const end = start + token.length;
      if (ranges.some((range) => overlaps(start, end, range.start, range.end))) continue;
      if (token.length < 40 && !/[+/=_-]/.test(token)) continue;
      if (shannonEntropy(token) < 4.5) continue;

      const finding: SecretFinding = {
        patternName: "high_entropy_token",
        severity: "medium",
        lineNumber: text.slice(0, start).split("\n").length,
        matchText: preview(token),
        start,
        end,
      };
      results.push({
        finding,
        range: { start, end, label: "[REDACTED:high_entropy_token]" },
      });
    }
    return results;
  }
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function preview(value: string): string {
  return value.length > 8 ? `${value.slice(0, 8)}...` : value;
}

function redact(text: string, ranges: Array<{ start: number; end: number; label: string }>): string {
  if (ranges.length === 0) return text;
  const sorted = [...ranges].sort((a, b) => b.start - a.start);
  let output = text;
  for (const range of sorted) {
    output = `${output.slice(0, range.start)}${range.label}${output.slice(range.end)}`;
  }
  return output;
}

function shannonEntropy(value: string): number {
  const counts = new Map<string, number>();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}
