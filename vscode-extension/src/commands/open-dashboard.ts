import * as vscode from "vscode";

export function registerOpenDashboard(): vscode.Disposable {
  return vscode.commands.registerCommand("colony.openDashboard", async () => {
    const config = vscode.workspace.getConfiguration("colony");
    const daemonUrl = config.get<string>("daemonUrl", "http://127.0.0.1:7878");
    await vscode.env.openExternal(vscode.Uri.parse(daemonUrl));
  });
}
