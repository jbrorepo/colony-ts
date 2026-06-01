/**
 * Render a unified diff between two arbitrary strings using the
 * Colony diff library directly (no daemon required).
 *
 * Run:
 *   bun run examples/03-diff-from-clipboard.ts
 */

import {
  generateUnifiedDiff,
  renderUnifiedDiffText,
} from "../src/diff/unified-diff";

const before = `
function greet(name) {
  console.log("Hello, " + name + "!");
}
greet("world");
`.trim();

const after = `
function greet(name: string): void {
  if (!name) throw new Error("name required");
  console.log(\`Hello, \${name}!\`);
}
greet("world");
`.trim();

const diff = generateUnifiedDiff(before, after, {
  filename: "greet.ts",
  contextLines: 2,
});

console.log("=== Stats ===");
console.log(diff.stats);
console.log("");
console.log("=== Unified diff ===");
console.log(renderUnifiedDiffText(diff));
console.log("");
console.log("=== Structured hunks ===");
for (const hunk of diff.hunks) {
  console.log(`Hunk at -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines}`);
  for (const line of hunk.lines) {
    const prefix =
      line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " ";
    const oldNo = line.oldLineNo?.toString().padStart(3, " ") ?? "   ";
    const newNo = line.newLineNo?.toString().padStart(3, " ") ?? "   ";
    console.log(`  ${oldNo} ${newNo} ${prefix}${line.text}`);
  }
}
