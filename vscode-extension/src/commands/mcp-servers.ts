import * as vscode from "vscode";
import { buildColonyClient } from "../client-factory";
import { ColonyDaemonUnreachableError } from "../colony-client";

export function registerListMcpServers(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
): vscode.Disposable {
  return vscode.commands.registerCommand("colony.listMcpServers", async () => {
    const client = buildColonyClient(context);
    try {
      const servers = await client.listMcpServers();
      outputChannel.appendLine("=== Colony MCP Servers ===");
      if (servers.length === 0) {
        outputChannel.appendLine("(none configured)");
        outputChannel.appendLine("");
        outputChannel.appendLine(
          "Add one via REST: POST " + client.baseUrl + "/api/v1/mcp/servers",
        );
      } else {
        for (const server of servers) {
          const trustBadge = server.trusted ? "[trusted]" : "[untrusted]";
          outputChannel.appendLine(
            `  ${server.id}  [${server.kind}] ${trustBadge}`,
          );
          if (server.description) {
            outputChannel.appendLine(`    ${server.description}`);
          }
          outputChannel.appendLine(`    endpoint: ${server.endpoint}`);
        }
      }
      outputChannel.show(true);
    } catch (err) {
      if (err instanceof ColonyDaemonUnreachableError) {
        vscode.window.showWarningMessage(err.message);
      } else {
        vscode.window.showErrorMessage(
          `Failed to list MCP servers: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  });
}
