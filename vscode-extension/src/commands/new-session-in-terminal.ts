import * as vscode from "vscode";

export function registerNewSessionInTerminal(): vscode.Disposable {
  return vscode.commands.registerCommand(
    "colony.newSessionInTerminal",
    () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        void vscode.window.showWarningMessage(
          "Colony: open a workspace folder before starting a session.",
        );
        return;
      }

      const terminal = vscode.window.createTerminal({
        name: "Colony",
        cwd: folder.uri.fsPath,
      });
      terminal.sendText("bun run start", true);
      terminal.show(false);
    },
  );
}
