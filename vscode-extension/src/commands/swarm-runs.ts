import * as vscode from "vscode";
import { buildColonyClient } from "../client-factory";
import { ColonyDaemonUnreachableError } from "../colony-client";

export function registerListSwarmRuns(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
): vscode.Disposable {
  return vscode.commands.registerCommand("colony.listSwarmRuns", async () => {
    const client = buildColonyClient(context);
    try {
      const runs = await client.listSwarmRuns();
      outputChannel.appendLine("=== Colony Swarm Runs ===");
      if (runs.length === 0) {
        outputChannel.appendLine("(no runs)");
      } else {
        for (const run of runs) {
          outputChannel.appendLine(
            `  ${run.runId}  [${run.status}]  ${run.title}`,
          );
          outputChannel.appendLine(`    objective: ${run.objective}`);
          outputChannel.appendLine(`    updated:   ${run.updatedAt}`);
        }
      }
      outputChannel.show(true);
    } catch (err) {
      if (err instanceof ColonyDaemonUnreachableError) {
        vscode.window.showWarningMessage(err.message);
      } else {
        vscode.window.showErrorMessage(
          `Failed to list swarm runs: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  });
}

export function registerStartSwarmRun(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
): vscode.Disposable {
  return vscode.commands.registerCommand("colony.startSwarmRun", async () => {
    const objective = await vscode.window.showInputBox({
      title: "Colony: Start Swarm Run",
      prompt: "Objective for the swarm (will run detached — poll for status).",
      placeHolder: "e.g. Add input validation to src/util/parse.ts",
      ignoreFocusOut: true,
    });
    if (!objective) return;

    const client = buildColonyClient(context);
    try {
      const run = await client.startSwarmRun({ objective, detached: true });
      outputChannel.appendLine(`=== Started swarm run: ${run.runId} ===`);
      outputChannel.appendLine(`Status:    ${run.status}`);
      outputChannel.appendLine(`Objective: ${run.objective}`);
      outputChannel.appendLine(`Poll with: Colony: List Swarm Runs`);
      outputChannel.show(true);
      vscode.window.showInformationMessage(
        `Swarm run started: ${run.runId} (detached). Use "Colony: List Swarm Runs" to poll.`,
      );
    } catch (err) {
      if (err instanceof ColonyDaemonUnreachableError) {
        vscode.window.showWarningMessage(err.message);
      } else {
        vscode.window.showErrorMessage(
          `Failed to start swarm run: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  });
}
