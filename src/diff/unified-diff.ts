/**
 * Pure server-side unified-diff generator.
 *
 * Produces structured diff hunks suitable for both terminal rendering and
 * web-UI display with hunk-level accept/reject controls. No external
 * dependencies — implements a simple Hunt-McIlroy-style LCS line diff,
 * which is good enough for code edits up to ~10k lines.
 *
 * Output shape is intentionally structured (not just a string) so callers
 * can build interactive UIs on top:
 *   - Each Hunk has a position and a list of lines
 *   - Each Line is tagged context | added | removed
 *   - Hunks include the original line numbers for hunk-level operations
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DiffLineKind = "context" | "added" | "removed";

export interface DiffLine {
  kind: DiffLineKind;
  /** 1-indexed line number in the original (before) text; null for added lines. */
  oldLineNo: number | null;
  /** 1-indexed line number in the modified (after) text; null for removed lines. */
  newLineNo: number | null;
  text: string;
}

export interface DiffHunk {
  /** 1-indexed start line in the original. */
  oldStart: number;
  oldLines: number;
  /** 1-indexed start line in the modified. */
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface UnifiedDiff {
  /** Filename for header display (no path validation here — caller responsibility). */
  filename: string;
  /** True when oldText === newText (no hunks generated). */
  unchanged: boolean;
  hunks: DiffHunk[];
  /** Aggregate counts for quick UI summaries. */
  stats: {
    added: number;
    removed: number;
    hunkCount: number;
  };
}

export interface UnifiedDiffOptions {
  /** Number of context lines around each change. Default: 3 (industry standard). */
  contextLines?: number;
  /** Display filename in the result. Default: "file". */
  filename?: string;
  /** Maximum total lines processed; throws RangeError beyond this. Default: 50_000. */
  maxLines?: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateUnifiedDiff(
  oldText: string,
  newText: string,
  options: UnifiedDiffOptions = {},
): UnifiedDiff {
  const contextLines = Math.max(0, options.contextLines ?? 3);
  const filename = options.filename ?? "file";
  const maxLines = options.maxLines ?? 50_000;

  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);

  if (oldLines.length > maxLines || newLines.length > maxLines) {
    throw new RangeError(
      `Diff input exceeds maxLines=${maxLines} (old=${oldLines.length}, new=${newLines.length})`,
    );
  }

  if (oldText === newText) {
    return {
      filename,
      unchanged: true,
      hunks: [],
      stats: { added: 0, removed: 0, hunkCount: 0 },
    };
  }

  // Build the edit script via LCS, then group consecutive changes into hunks
  // with `contextLines` of surrounding unchanged lines.
  const editScript = buildEditScript(oldLines, newLines);
  const hunks = groupIntoHunks(editScript, contextLines);

  const stats = hunks.reduce(
    (acc, hunk) => {
      for (const line of hunk.lines) {
        if (line.kind === "added") acc.added++;
        else if (line.kind === "removed") acc.removed++;
      }
      return acc;
    },
    { added: 0, removed: 0, hunkCount: hunks.length },
  );

  return {
    filename,
    unchanged: false,
    hunks,
    stats,
  };
}

/**
 * Render a UnifiedDiff as a plain unified-diff text block (the format `diff
 * -u` produces). Useful for terminal display or feeding to `git apply`.
 */
export function renderUnifiedDiffText(diff: UnifiedDiff): string {
  if (diff.unchanged) return "";

  const lines: string[] = [
    `--- a/${diff.filename}`,
    `+++ b/${diff.filename}`,
  ];

  for (const hunk of diff.hunks) {
    lines.push(
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    );
    for (const line of hunk.lines) {
      const prefix = line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " ";
      lines.push(`${prefix}${line.text}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// LCS edit script construction
// ---------------------------------------------------------------------------

/**
 * Internal edit-script step. Each step is "keep old", "delete old", or
 * "insert new". We assemble these into hunks afterward.
 */
interface EditStep {
  kind: "keep" | "remove" | "add";
  oldIndex: number | null; // 0-indexed
  newIndex: number | null; // 0-indexed
  text: string;
}

function buildEditScript(oldLines: string[], newLines: string[]): EditStep[] {
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS length table. For large inputs this is O(m*n); acceptable
  // up to the maxLines guardrail above.
  const dp: Uint32Array[] = [];
  for (let i = 0; i <= m; i++) {
    dp.push(new Uint32Array(n + 1));
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Walk back from (m, n) to reconstruct the edit script.
  const steps: EditStep[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      steps.push({
        kind: "keep",
        oldIndex: i - 1,
        newIndex: j - 1,
        text: oldLines[i - 1],
      });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      steps.push({
        kind: "remove",
        oldIndex: i - 1,
        newIndex: null,
        text: oldLines[i - 1],
      });
      i--;
    } else {
      steps.push({
        kind: "add",
        oldIndex: null,
        newIndex: j - 1,
        text: newLines[j - 1],
      });
      j--;
    }
  }
  while (i > 0) {
    steps.push({
      kind: "remove",
      oldIndex: i - 1,
      newIndex: null,
      text: oldLines[i - 1],
    });
    i--;
  }
  while (j > 0) {
    steps.push({
      kind: "add",
      oldIndex: null,
      newIndex: j - 1,
      text: newLines[j - 1],
    });
    j--;
  }

  return steps.reverse();
}

// ---------------------------------------------------------------------------
// Grouping into hunks with surrounding context
// ---------------------------------------------------------------------------

function groupIntoHunks(steps: EditStep[], contextLines: number): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let pending: DiffLine[] = [];
  let pendingHasChange = false;
  let pendingOldStart = 0;
  let pendingNewStart = 0;
  let trailingContext = 0;

  const flushHunk = (): void => {
    if (!pendingHasChange) {
      pending = [];
      pendingHasChange = false;
      return;
    }
    let oldLines = 0;
    let newLines = 0;
    for (const line of pending) {
      if (line.oldLineNo !== null) oldLines++;
      if (line.newLineNo !== null) newLines++;
    }
    hunks.push({
      oldStart: pendingOldStart,
      oldLines,
      newStart: pendingNewStart,
      newLines,
      lines: pending,
    });
    pending = [];
    pendingHasChange = false;
  };

  for (let idx = 0; idx < steps.length; idx++) {
    const step = steps[idx];
    const diffLine: DiffLine = {
      kind: step.kind === "keep" ? "context" : step.kind === "add" ? "added" : "removed",
      oldLineNo: step.oldIndex !== null ? step.oldIndex + 1 : null,
      newLineNo: step.newIndex !== null ? step.newIndex + 1 : null,
      text: step.text,
    };

    if (step.kind === "keep") {
      if (!pendingHasChange) {
        // Pre-change context — keep at most `contextLines` lines
        pending.push(diffLine);
        if (pending.length > contextLines) {
          pending.shift();
        }
        // Track the line numbers for when a change starts
        if (pending.length > 0) {
          pendingOldStart = pending[0].oldLineNo ?? 1;
          pendingNewStart = pending[0].newLineNo ?? 1;
        }
      } else {
        // Post-change context
        pending.push(diffLine);
        trailingContext++;
        // If we've collected 2*contextLines of trailing context with no
        // more changes, flush and start fresh — anything beyond is gap.
        if (trailingContext >= contextLines * 2) {
          // Drop the extra trailing lines we don't want in this hunk
          const excess = pending.length;
          let countdown = contextLines;
          const trimmed: DiffLine[] = [];
          for (let k = excess - 1; k >= 0; k--) {
            const ln = pending[k];
            if (ln.kind === "context" && countdown > 0) {
              trimmed.unshift(ln);
              countdown--;
            } else {
              break;
            }
          }
          // Truncate pending to drop the extras beyond `contextLines`
          while (pending.length > 0 && pending[pending.length - 1].kind === "context") {
            pending.pop();
          }
          for (const ln of trimmed) pending.push(ln);
          flushHunk();
          trailingContext = 0;
        }
      }
    } else {
      // A real change (add or remove)
      if (!pendingHasChange) {
        // Lock in the hunk start now (use the first line in the pending
        // context, or the current step if there's none)
        if (pending.length > 0) {
          pendingOldStart = pending[0].oldLineNo ?? diffLine.oldLineNo ?? 1;
          pendingNewStart = pending[0].newLineNo ?? diffLine.newLineNo ?? 1;
        } else {
          pendingOldStart = diffLine.oldLineNo ?? 1;
          pendingNewStart = diffLine.newLineNo ?? 1;
        }
        pendingHasChange = true;
      }
      pending.push(diffLine);
      trailingContext = 0;
    }
  }

  flushHunk();
  return hunks;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitLines(text: string): string[] {
  if (text === "") return [];
  // Preserve final-newline semantics: "a\nb" → ["a", "b"], "a\nb\n" → ["a", "b"]
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}
