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
exports.registerListMcpServers = registerListMcpServers;
const vscode = __importStar(require("vscode"));
const client_factory_1 = require("../client-factory");
const colony_client_1 = require("../colony-client");
function registerListMcpServers(context, outputChannel) {
    return vscode.commands.registerCommand("colony.listMcpServers", async () => {
        const client = (0, client_factory_1.buildColonyClient)(context);
        try {
            const servers = await client.listMcpServers();
            outputChannel.appendLine("=== Colony MCP Servers ===");
            if (servers.length === 0) {
                outputChannel.appendLine("(none configured)");
                outputChannel.appendLine("");
                outputChannel.appendLine("Add one via REST: POST " + client.baseUrl + "/api/v1/mcp/servers");
            }
            else {
                for (const server of servers) {
                    const trustBadge = server.trusted ? "[trusted]" : "[untrusted]";
                    outputChannel.appendLine(`  ${server.id}  [${server.kind}] ${trustBadge}`);
                    if (server.description) {
                        outputChannel.appendLine(`    ${server.description}`);
                    }
                    outputChannel.appendLine(`    endpoint: ${server.endpoint}`);
                }
            }
            outputChannel.show(true);
        }
        catch (err) {
            if (err instanceof colony_client_1.ColonyDaemonUnreachableError) {
                vscode.window.showWarningMessage(err.message);
            }
            else {
                vscode.window.showErrorMessage(`Failed to list MCP servers: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    });
}
//# sourceMappingURL=mcp-servers.js.map