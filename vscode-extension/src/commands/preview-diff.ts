import * as vscode from "vscode";
import { buildColonyClient } from "../client-factory";
import { ColonyDaemonUnreachableError } from "../colony-client";

/**
 * Diffs the active editor's selection against the clipboard contents.
 * Useful for "I just edited this; show me what changed" without committing.
 */
export function registerPreviewDiff(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  return vscode.commands.registerCommand("colony.previewDiff", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("Open a file and select text first.");
      return;
    }
    const newText = editor.selection.isEmpty
      ? editor.document.getText()
      : editor.document.getText(editor.selection);
    const oldText = await vscode.env.clipboard.readText();
    if (!oldText) {
      vscode.window.showWarningMessage(
        "Clipboard is empty. Copy the 'before' version, then run this command.",
      );
      return;
    }
    const filename = editor.document.fileName.split(/[/\\]/).pop() ?? "selection";

    const client = buildColonyClient(context);
    try {
      const diff = await client.previewDiff({ oldText, newText, filename });
      const doc = await vscode.workspace.openTextDocument({
        language: "diff",
        content: renderUnifiedDiff(diff),
      });
      await vscode.window.showTextDocument(doc, { preview: true });
    } catch (err) {
      if (err instanceof ColonyDaemonUnreachableError) {
        vscode.window.showWarningMessage(err.message);
      } else {
        vscode.window.showErrorMessage(
          `Diff preview failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  });
}

function renderUnifiedDiff(diff: {
  filename: string;
  unchanged: boolean;
  hunks: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: Array<{ kind: "context" | "added" | "removed"; text: string }>;
  }>;
}): string {
  if (diff.unchanged) {
    return `# No changes between clipboard and selection (${diff.filename})\n`;
  }
  const out: string[] = [`--- a/${diff.filename}`, `+++ b/${diff.filename}`];
  for (const hunk of diff.hunks) {
    out.push(
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    );
    for (const line of hunk.lines) {
      const prefix =
        line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " ";
      out.push(`${prefix}${line.text}`);
    }
  }
  return out.join("\n") + "\n";
}
