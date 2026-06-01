"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerHealthStatusBar = registerHealthStatusBar;
const vscode = __importStar(require("vscode"));
const client_factory_1 = require("../client-factory");
const colony_client_1 = require("../colony-client");
const POLL_INTERVAL_MS = 30_000;
/**
 * Shows daemon health in the status bar. Clicking the item opens the dashboard.
 * Lifecycle managed via the returned Disposable.
 */
function registerHealthStatusBar(context) {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
    item.command = "colony.openDashboard";
    item.tooltip = "Click to open the Colony dashboard";
    item.show();
    let cancelled = false;
    const refresh = async () => {
        if (cancelled)
            return;
        const client = (0, client_factory_1.buildColonyClient)(context);
        try {
            const health = await client.health();
            if (health.ok) {
                item.text = `$(rocket) Colony`;
                item.tooltip = `Daemon online — ${health.capabilities.length} capabilities`;
                item.backgroundColor = undefined;
            }
            else {
                item.text = `$(alert) Colony`;
                item.tooltip = "Daemon reachable but reporting not-ok";
                item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
            }
        }
        catch (err) {
            if (err instanceof colony_client_1.ColonyDaemonUnreachableError) {
                item.text = `$(plug) Colony`;
                item.tooltip = "Daemon not reachable — click to open dashboard URL";
            }
            else {
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
//# sourceMappingURL=health-status-bar.js.map