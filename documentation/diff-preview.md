# Diff Preview

Server-side unified diff library + REST endpoint + dashboard component.
Useful when you want to show "what changed" without committing or
applying anything yet.

## Library use

```typescript
import { generateUnifiedDiff, renderUnifiedDiffText } from "@colony/cli/diff";

const diff = generateUnifiedDiff("hello\nworld\n", "hello\nthere\n", {
  filename: "greet.txt",
  contextLines: 3,
});

// Structured form (for custom UIs)
console.log(diff.stats);  // { added: 1, removed: 1, hunkCount: 1 }
for (const hunk of diff.hunks) {
  for (const line of hunk.lines) {
    console.log(line.kind, line.text);  // "context"/"added"/"removed"
  }
}

// Plain text form (for terminals + `git apply`)
console.log(renderUnifiedDiffText(diff));
```

## REST endpoint

```http
POST /api/v1/diffs/preview
Content-Type: application/json

{
  "oldText": "hello\nworld\n",
  "newText": "hello\nthere\n",
  "filename": "greet.txt",
  "contextLines": 3
}
```

See [`rest-api.md#diff-preview`](rest-api.md#diff-preview).

## Dashboard component

The daemon's web dashboard at `http://localhost:7878/` has a "Diff
Preview" card with:

- Side-by-side "Before" / "After" textareas
- Filename + context-lines controls
- "Render diff" button
- Hunk-level Accept / Reject buttons (local-only for now; wiring to
  approval REST flow is on the roadmap)

## VS Code command

`Colony: Preview Diff (selection ↔ clipboard)` opens a new document
with the rendered diff. Useful workflow:

1. Copy the "before" version of a snippet to the clipboard
2. Edit the file
3. Select the new version
4. Run the command → see the diff in a new editor tab

## Algorithm

Hunt-McIlroy-style LCS line diff. O(m×n) time and space, capped at
`maxLines: 50_000` (configurable). Good enough for code edits up to
~10k lines; for larger inputs, write a custom Myers implementation or
pre-split into chunks.

## See also

- [REST API reference](rest-api.md) — endpoint spec
- [VS Code extension](vscode.md) — `Colony: Preview Diff` command
- [`src/__tests__/diff/unified-diff.test.ts`](../src/__tests__/diff/unified-diff.test.ts) — 25 tests
