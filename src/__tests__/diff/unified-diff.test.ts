import { describe, test, expect } from "bun:test";
import {
  generateUnifiedDiff,
  renderUnifiedDiffText,
} from "../../diff/unified-diff";

// ---------------------------------------------------------------------------
// Structural correctness
// ---------------------------------------------------------------------------

describe("generateUnifiedDiff — structure", () => {
  test("returns unchanged=true for identical text", () => {
    const diff = generateUnifiedDiff("hello\nworld\n", "hello\nworld\n");
    expect(diff.unchanged).toBe(true);
    expect(diff.hunks).toEqual([]);
    expect(diff.stats).toEqual({ added: 0, removed: 0, hunkCount: 0 });
  });

  test("returns unchanged=true for empty inputs", () => {
    const diff = generateUnifiedDiff("", "");
    expect(diff.unchanged).toBe(true);
  });

  test("includes the supplied filename in the result", () => {
    const diff = generateUnifiedDiff("a", "b", { filename: "src/foo.ts" });
    expect(diff.filename).toBe("src/foo.ts");
  });

  test("defaults filename to 'file' when not provided", () => {
    const diff = generateUnifiedDiff("a", "b");
    expect(diff.filename).toBe("file");
  });
});

// ---------------------------------------------------------------------------
// Simple change cases
// ---------------------------------------------------------------------------

describe("generateUnifiedDiff — single-line changes", () => {
  test("detects a single added line", () => {
    const diff = generateUnifiedDiff("a\nb\n", "a\nb\nc\n");
    expect(diff.unchanged).toBe(false);
    expect(diff.stats.added).toBe(1);
    expect(diff.stats.removed).toBe(0);
    expect(diff.hunks).toHaveLength(1);

    const addedLines = diff.hunks[0].lines.filter((l) => l.kind === "added");
    expect(addedLines).toHaveLength(1);
    expect(addedLines[0].text).toBe("c");
  });

  test("detects a single removed line", () => {
    const diff = generateUnifiedDiff("a\nb\nc\n", "a\nc\n");
    expect(diff.stats.removed).toBe(1);
    expect(diff.stats.added).toBe(0);

    const removedLines = diff.hunks[0].lines.filter((l) => l.kind === "removed");
    expect(removedLines[0].text).toBe("b");
  });

  test("detects a modified line as remove+add pair", () => {
    const diff = generateUnifiedDiff("hello\nworld\n", "hello\nthere\n");
    expect(diff.stats.removed).toBe(1);
    expect(diff.stats.added).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Context handling
// ---------------------------------------------------------------------------

describe("generateUnifiedDiff — context lines", () => {
  test("includes 3 lines of context by default", () => {
    const oldText = ["1", "2", "3", "4", "CHANGE_OLD", "5", "6", "7", "8"].join("\n");
    const newText = ["1", "2", "3", "4", "CHANGE_NEW", "5", "6", "7", "8"].join("\n");
    const diff = generateUnifiedDiff(oldText, newText);

    expect(diff.hunks).toHaveLength(1);
    const hunk = diff.hunks[0];
    const contextLines = hunk.lines.filter((l) => l.kind === "context");
    // 3 lines before + 3 lines after = 6 context lines
    expect(contextLines.length).toBeGreaterThanOrEqual(5);
    expect(contextLines.length).toBeLessThanOrEqual(7);
  });

  test("respects contextLines=0", () => {
    const diff = generateUnifiedDiff(
      "1\n2\nOLD\n4\n5\n",
      "1\n2\nNEW\n4\n5\n",
      { contextLines: 0 },
    );
    const contextLines = diff.hunks[0].lines.filter((l) => l.kind === "context");
    expect(contextLines).toHaveLength(0);
  });

  test("respects contextLines=1", () => {
    const diff = generateUnifiedDiff(
      "1\n2\n3\nOLD\n5\n6\n7\n",
      "1\n2\n3\nNEW\n5\n6\n7\n",
      { contextLines: 1 },
    );
    const contextLines = diff.hunks[0].lines.filter((l) => l.kind === "context");
    expect(contextLines).toHaveLength(2); // 1 before, 1 after
  });
});

// ---------------------------------------------------------------------------
// Hunk grouping
// ---------------------------------------------------------------------------

describe("generateUnifiedDiff — multi-hunk grouping", () => {
  test("separates distant changes into multiple hunks", () => {
    const oldText = [
      "header",
      "a", "b", "c", "d", "e",
      "OLD_TOP",
      "f", "g", "h", "i", "j", "k", "l", "m", "n",
      "OLD_BOTTOM",
      "o", "p", "q", "r", "s",
      "footer",
    ].join("\n");
    const newText = [
      "header",
      "a", "b", "c", "d", "e",
      "NEW_TOP",
      "f", "g", "h", "i", "j", "k", "l", "m", "n",
      "NEW_BOTTOM",
      "o", "p", "q", "r", "s",
      "footer",
    ].join("\n");
    const diff = generateUnifiedDiff(oldText, newText);

    expect(diff.hunks.length).toBe(2);
    expect(diff.stats.added).toBe(2);
    expect(diff.stats.removed).toBe(2);
  });

  test("merges close changes into a single hunk", () => {
    const oldText = "a\nb\nOLD1\nc\nOLD2\nd\ne\n";
    const newText = "a\nb\nNEW1\nc\nNEW2\nd\ne\n";
    const diff = generateUnifiedDiff(oldText, newText, { contextLines: 3 });

    // The two changes are only 1 line apart — they should merge
    expect(diff.hunks).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Line numbering
// ---------------------------------------------------------------------------

describe("generateUnifiedDiff — line numbers", () => {
  test("context lines have both oldLineNo and newLineNo", () => {
    const diff = generateUnifiedDiff("a\nb\nc\n", "a\nb\nd\n");
    const context = diff.hunks[0].lines.filter((l) => l.kind === "context");
    for (const line of context) {
      expect(line.oldLineNo).not.toBeNull();
      expect(line.newLineNo).not.toBeNull();
    }
  });

  test("added lines have newLineNo but null oldLineNo", () => {
    const diff = generateUnifiedDiff("a\nb\n", "a\nb\nc\n");
    const added = diff.hunks[0].lines.find((l) => l.kind === "added");
    expect(added).toBeDefined();
    expect(added!.oldLineNo).toBeNull();
    expect(added!.newLineNo).toBe(3);
  });

  test("removed lines have oldLineNo but null newLineNo", () => {
    const diff = generateUnifiedDiff("a\nb\nc\n", "a\nc\n");
    const removed = diff.hunks[0].lines.find((l) => l.kind === "removed");
    expect(removed).toBeDefined();
    expect(removed!.oldLineNo).toBe(2);
    expect(removed!.newLineNo).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("generateUnifiedDiff — edge cases", () => {
  test("addition to an empty file", () => {
    const diff = generateUnifiedDiff("", "new content\n");
    expect(diff.stats.added).toBe(1);
    expect(diff.stats.removed).toBe(0);
  });

  test("deletion to empty file", () => {
    const diff = generateUnifiedDiff("delete me\n", "");
    expect(diff.stats.added).toBe(0);
    expect(diff.stats.removed).toBe(1);
  });

  test("text without trailing newline behaves like with trailing newline", () => {
    const withNl = generateUnifiedDiff("a\n", "b\n");
    const noNl = generateUnifiedDiff("a", "b");
    expect(withNl.stats).toEqual(noNl.stats);
  });

  test("throws RangeError beyond maxLines", () => {
    const bigText = Array.from({ length: 200 }, (_, i) => `line-${i}`).join("\n");
    expect(() => generateUnifiedDiff(bigText, "small", { maxLines: 100 })).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// Text rendering
// ---------------------------------------------------------------------------

describe("renderUnifiedDiffText", () => {
  test("returns empty string when unchanged", () => {
    const diff = generateUnifiedDiff("same\n", "same\n");
    expect(renderUnifiedDiffText(diff)).toBe("");
  });

  test("includes file headers", () => {
    const diff = generateUnifiedDiff("a\n", "b\n", { filename: "src/foo.ts" });
    const rendered = renderUnifiedDiffText(diff);
    expect(rendered).toContain("--- a/src/foo.ts");
    expect(rendered).toContain("+++ b/src/foo.ts");
  });

  test("includes hunk header in standard format", () => {
    const diff = generateUnifiedDiff("a\n", "b\n");
    const rendered = renderUnifiedDiffText(diff);
    expect(rendered).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/);
  });

  test("prefixes added lines with +", () => {
    const diff = generateUnifiedDiff("a\nb\n", "a\nb\nc\n");
    const rendered = renderUnifiedDiffText(diff);
    expect(rendered).toContain("+c");
  });

  test("prefixes removed lines with -", () => {
    const diff = generateUnifiedDiff("a\nb\nc\n", "a\nc\n");
    const rendered = renderUnifiedDiffText(diff);
    expect(rendered).toContain("-b");
  });

  test("prefixes context lines with a space", () => {
    const diff = generateUnifiedDiff("a\nb\nc\n", "a\nb\nd\n");
    const rendered = renderUnifiedDiffText(diff);
    expect(rendered).toMatch(/^ a$/m);
    expect(rendered).toMatch(/^ b$/m);
  });
});
