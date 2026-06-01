import * as vscode from "vscode";
import { registerAskAboutSelection } from "./commands/ask-about-selection";
import { registerNewSessionInTerminal } from "./commands/new-session-in-terminal";
import { registerSetToken } from "./commands/set-token";
import { registerShowHealth } from "./commands/show-health";
import { registerListSwarmRuns, registerStartSwarmRun } from "./commands/swarm-runs";
import { registerListMcpServers } from "./commands/mcp-servers";
import { registerPreviewDiff } from "./commands/preview-diff";
import { registerOpenDashboard } from "./commands/open-dashboard";
import { registerHealthStatusBar } from "./status/health-status-bar";

let outputChannel: vscode.OutputChannel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel("Colony");
  context.subscriptions.push(outputChannel);

  // Legacy v0.1 commands (preserved for muscle memory)
  context.subscriptions.push(registerAskAboutSelection(outputChannel));
  context.subscriptions.push(registerNewSessionInTerminal());

  // v0.2 — REST-backed daemon integration
  context.subscriptions.push(registerSetToken(context));
  context.subscriptions.push(registerShowHealth(context, outputChannel));
  context.subscriptions.push(registerListSwarmRuns(context, outputChannel));
  context.subscriptions.push(registerStartSwarmRun(context, outputChannel));
  context.subscriptions.push(registerListMcpServers(context, outputChannel));
  context.subscriptions.push(registerPreviewDiff(context));
  context.subscriptions.push(registerOpenDashboard());

  // Status bar — only when autoConnect=true
  const config = vscode.workspace.getConfiguration("colony");
  if (config.get<boolean>("autoConnect", true)) {
    context.subscriptions.push(registerHealthStatusBar(context));
  }
}

export function deactivate(): void {
  if (outputChannel) {
    outputChannel.dispose();
    outputChannel = undefined;
  }
}
