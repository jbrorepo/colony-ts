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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const ask_about_selection_1 = require("./commands/ask-about-selection");
const new_session_in_terminal_1 = require("./commands/new-session-in-terminal");
const set_token_1 = require("./commands/set-token");
const show_health_1 = require("./commands/show-health");
const swarm_runs_1 = require("./commands/swarm-runs");
const mcp_servers_1 = require("./commands/mcp-servers");
const preview_diff_1 = require("./commands/preview-diff");
const open_dashboard_1 = require("./commands/open-dashboard");
const health_status_bar_1 = require("./status/health-status-bar");
let outputChannel;
function activate(context) {
    outputChannel = vscode.window.createOutputChannel("Colony");
    context.subscriptions.push(outputChannel);
    // Legacy v0.1 commands (preserved for muscle memory)
    context.subscriptions.push((0, ask_about_selection_1.registerAskAboutSelection)(outputChannel));
    context.subscriptions.push((0, new_session_in_terminal_1.registerNewSessionInTerminal)());
    // v0.2 — REST-backed daemon integration
    context.subscriptions.push((0, set_token_1.registerSetToken)(context));
    context.subscriptions.push((0, show_health_1.registerShowHealth)(context, outputChannel));
    context.subscriptions.push((0, swarm_runs_1.registerListSwarmRuns)(context, outputChannel));
    context.subscriptions.push((0, swarm_runs_1.registerStartSwarmRun)(context, outputChannel));
    context.subscriptions.push((0, mcp_servers_1.registerListMcpServers)(context, outputChannel));
    context.subscriptions.push((0, preview_diff_1.registerPreviewDiff)(context));
    context.subscriptions.push((0, open_dashboard_1.registerOpenDashboard)());
    // Status bar — only when autoConnect=true
    const config = vscode.workspace.getConfiguration("colony");
    if (config.get("autoConnect", true)) {
        context.subscriptions.push((0, health_status_bar_1.registerHealthStatusBar)(context));
    }
}
function deactivate() {
    if (outputChannel) {
        outputChannel.dispose();
        outputChannel = undefined;
    }
}
//# sourceMappingURL=extension.js.map