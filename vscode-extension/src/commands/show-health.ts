import * as vscode from "vscode";
import { buildColonyClient } from "../client-factory";
import { ColonyDaemonUnreachableError } from "../colony-client";

export function registerShowHealth(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
): vscode.Disposable {
  return vscode.commands.registerCommand("colony.showHealth", async () => {
    const client = buildColonyClient(context);
    try {
      const health = await client.health();
      outputChannel.appendLine("=== Colony Daemon Health ===");
      outputChannel.appendLine(`Daemon URL:  ${client.baseUrl}`);
      outputChannel.appendLine(`Status:      ${health.ok ? "OK" : "ERROR"}`);
      outputChannel.appendLine(`Started at:  ${health.startedAt ?? "(unknown)"}`);
      outputChannel.appendLine(`Capabilities (${health.capabilities.length}):`);
      for (const cap of health.capabilities) {
        outputChannel.appendLine(`  - ${cap}`);
      }
      outputChannel.show(true);
    } catch (err) {
      if (err instanceof ColonyDaemonUnreachableError) {
        vscode.window.showWarningMessage(err.message);
      } else {
        vscode.window.showErrorMessage(
          `Colony health check failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  });
}
