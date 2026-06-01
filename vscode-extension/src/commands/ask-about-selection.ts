import * as path from "path";
import * as vscode from "vscode";
import { askColony } from "../colony-client";

export function registerAskAboutSelection(
  outputChannel: vscode.OutputChannel,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "colony.askAboutSelection",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showWarningMessage(
          "Colony: open a file before asking about a selection.",
        );
        return;
      }

      const document = editor.document;
      const selectionText = editor.selection.isEmpty
        ? document.getText()
        : document.getText(editor.selection);

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      const workspaceRoot = workspaceFolder?.uri.fsPath ?? "";
      const relativePath = workspaceRoot
        ? path.relative(workspaceRoot, document.fileName)
        : document.fileName;

      const prompt = buildPrompt({
        relativePath,
        languageId: document.languageId,
        selection: selectionText,
      });

      let firstChunk = true;
      try {
        await askColony({
          prompt,
          onChunk: (chunk: string) => {
            if (firstChunk) {
              outputChannel.show(true);
              outputChannel.appendLine("");
              outputChannel.appendLine(
                `# Colony :: ${relativePath || "(unsaved)"}`,
              );
              outputChannel.appendLine("");
              firstChunk = false;
            }
            outputChannel.append(chunk);
          },
        });
        if (firstChunk) {
          // No chunks streamed; surface a single message so the user
          // sees something rather than silent success.
          outputChannel.show(true);
          outputChannel.appendLine("Colony: (no response received)");
        } else {
          outputChannel.appendLine("");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Colony: ${message}`);
      }
    },
  );
}

function buildPrompt(args: {
  relativePath: string;
  languageId: string;
  selection: string;
}): string {
  const header = args.relativePath
    ? `File: ${args.relativePath} (${args.languageId})`
    : `Language: ${args.languageId}`;
  return `${header}\n\nSelection:\n\`\`\`${args.languageId}\n${args.selection}\n\`\`\`\n\nPlease analyze the selection above.`;
}
