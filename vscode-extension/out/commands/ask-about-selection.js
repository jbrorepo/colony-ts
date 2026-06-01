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
exports.registerAskAboutSelection = registerAskAboutSelection;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const colony_client_1 = require("../colony-client");
function registerAskAboutSelection(outputChannel) {
    return vscode.commands.registerCommand("colony.askAboutSelection", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            void vscode.window.showWarningMessage("Colony: open a file before asking about a selection.");
            return;
        }
        const document = editor.document;
        const selectionText = editor.selection.isEmpty
            ? document.getText()
            : document.getText(editor.selection);
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        const workspaceRoot = workspaceFolder?.uri.fsPath ?? "";
        const relativePath = workspaceRoot
            ? path.relative(workspaceRoot, document.fileName)
            : document.fileName;
        const prompt = buildPrompt({
            relativePath,
            languageId: document.languageId,
            selection: selectionText,
        });
        let firstChunk = true;
        try {
            await (0, colony_client_1.askColony)({
                prompt,
                onChunk: (chunk) => {
                    if (firstChunk) {
                        outputChannel.show(true);
                        outputChannel.appendLine("");
                        outputChannel.appendLine(`# Colony :: ${relativePath || "(unsaved)"}`);
                        outputChannel.appendLine("");
                        firstChunk = false;
                    }
                    outputChannel.append(chunk);
                },
            });
            if (firstChunk) {
                // No chunks streamed; surface a single message so the user
                // sees something rather than silent success.
                outputChannel.show(true);
                outputChannel.appendLine("Colony: (no response received)");
            }
            else {
                outputChannel.appendLine("");
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            void vscode.window.showErrorMessage(`Colony: ${message}`);
        }
    });
}
function buildPrompt(args) {
    const header = args.relativePath
        ? `File: ${args.relativePath} (${args.languageId})`
        : `Language: ${args.languageId}`;
    return `${header}\n\nSelection:\n\`\`\`${args.languageId}\n${args.selection}\n\`\`\`\n\nPlease analyze the selection above.`;
}
//# sourceMappingURL=ask-about-selection.js.map