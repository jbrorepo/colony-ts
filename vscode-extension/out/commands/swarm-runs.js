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
exports.registerListSwarmRuns = registerListSwarmRuns;
exports.registerStartSwarmRun = registerStartSwarmRun;
const vscode = __importStar(require("vscode"));
const client_factory_1 = require("../client-factory");
const colony_client_1 = require("../colony-client");
function registerListSwarmRuns(context, outputChannel) {
    return vscode.commands.registerCommand("colony.listSwarmRuns", async () => {
        const client = (0, client_factory_1.buildColonyClient)(context);
        try {
            const runs = await client.listSwarmRuns();
            outputChannel.appendLine("=== Colony Swarm Runs ===");
            if (runs.length === 0) {
                outputChannel.appendLine("(no runs)");
            }
            else {
                for (const run of runs) {
                    outputChannel.appendLine(`  ${run.runId}  [${run.status}]  ${run.title}`);
                    outputChannel.appendLine(`    objective: ${run.objective}`);
                    outputChannel.appendLine(`    updated:   ${run.updatedAt}`);
                }
            }
            outputChannel.show(true);
        }
        catch (err) {
            if (err instanceof colony_client_1.ColonyDaemonUnreachableError) {
                vscode.window.showWarningMessage(err.message);
            }
            else {
                vscode.window.showErrorMessage(`Failed to list swarm runs: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    });
}
function registerStartSwarmRun(context, outputChannel) {
    return vscode.commands.registerCommand("colony.startSwarmRun", async () => {
        const objective = await vscode.window.showInputBox({
            title: "Colony: Start Swarm Run",
            prompt: "Objective for the swarm (will run detached — poll for status).",
            placeHolder: "e.g. Add input validation to src/util/parse.ts",
            ignoreFocusOut: true,
        });
        if (!objective)
            return;
        const client = (0, client_factory_1.buildColonyClient)(context);
        try {
            const run = await client.startSwarmRun({ objective, detached: true });
            outputChannel.appendLine(`=== Started swarm run: ${run.runId} ===`);
            outputChannel.appendLine(`Status:    ${run.status}`);
            outputChannel.appendLine(`Objective: ${run.objective}`);
            outputChannel.appendLine(`Poll with: Colony: List Swarm Runs`);
            outputChannel.show(true);
            vscode.window.showInformationMessage(`Swarm run started: ${run.runId} (detached). Use "Colony: List Swarm Runs" to poll.`);
        }
        catch (err) {
            if (err instanceof colony_client_1.ColonyDaemonUnreachableError) {
                vscode.window.showWarningMessage(err.message);
            }
            else {
                vscode.window.showErrorMessage(`Failed to start swarm run: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    });
}
//# sourceMappingURL=swarm-runs.js.map