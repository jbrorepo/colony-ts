import * as vscode from "vscode";
import { buildColonyClient } from "../client-factory";
import { ColonyDaemonUnreachableError } from "../colony-client";

const POLL_INTERVAL_MS = 30_000;

/**
 * Shows daemon health in the status bar. Clicking the item opens the dashboard.
 * Lifecycle managed via the returned Disposable.
 */
export function registerHealthStatusBar(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
  item.command = "colony.openDashboard";
  item.tooltip = "Click to open the Colony dashboard";
  item.show();

  let cancelled = false;
  const refresh = async (): Promise<void> => {
    if (cancelled) return;
    const client = buildColonyClient(context);
    try {
      const health = await client.health();
      if (health.ok) {
        item.text = `$(rocket) Colony`;
        item.tooltip = `Daemon online — ${health.capabilities.length} capabilities`;
        item.backgroundColor = undefined;
      } else {
        item.text = `$(alert) Colony`;
        item.tooltip = "Daemon reachable but reporting not-ok";
        item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      }
    } catch (err) {
      if (err instanceof ColonyDaemonUnreachableError) {
        item.text = `$(plug) Colony`;
        item.tooltip = "Daemon not reachable — click to open dashboard URL";
      } else {
        item.text = `$(error) Colony`;
        item.tooltip = `Daemon error: ${err instanceof Error ? err.message : String(err)}`;
      }
      item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    }
  };

  // Initial check + interval
  void refresh();
  const interval = setInterval(() => void refresh(), POLL_INTERVAL_MS);

  return new vscode.Disposable(() => {
    cancelled = true;
    clearInterval(interval);
    item.dispose();
  });
}
