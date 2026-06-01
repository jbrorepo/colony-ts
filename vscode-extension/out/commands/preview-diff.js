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
exports.registerPreviewDiff = registerPreviewDiff;
const vscode = __importStar(require("vscode"));
const client_factory_1 = require("../client-factory");
const colony_client_1 = require("../colony-client");
/**
 * Diffs the active editor's selection against the clipboard contents.
 * Useful for "I just edited this; show me what changed" without committing.
 */
function registerPreviewDiff(context) {
    return vscode.commands.registerCommand("colony.previewDiff", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("Open a file and select text first.");
            return;
        }
        const newText = editor.selection.isEmpty
            ? editor.document.getText()
            : editor.document.getText(editor.selection);
        const oldText = await vscode.env.clipboard.readText();
        if (!oldText) {
            vscode.window.showWarningMessage("Clipboard is empty. Copy the 'before' version, then run this command.");
            return;
        }
        const filename = editor.document.fileName.split(/[/\\]/).pop() ?? "selection";
        const client = (0, client_factory_1.buildColonyClient)(context);
        try {
            const diff = await client.previewDiff({ oldText, newText, filename });
            const doc = await vscode.workspace.openTextDocument({
                language: "diff",
                content: renderUnifiedDiff(diff),
            });
            await vscode.window.showTextDocument(doc, { preview: true });
        }
        catch (err) {
            if (err instanceof colony_client_1.ColonyDaemonUnreachableError) {
                vscode.window.showWarningMessage(err.message);
            }
            else {
                vscode.window.showErrorMessage(`Diff preview failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    });
}
function renderUnifiedDiff(diff) {
    if (diff.unchanged) {
        return `# No changes between clipboard and selection (${diff.filename})\n`;
    }
    const out = [`--- a/${diff.filename}`, `+++ b/${diff.filename}`];
    for (const hunk of diff.hunks) {
        out.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
        for (const line of hunk.lines) {
            const prefix = line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " ";
            out.push(`${prefix}${line.text}`);
        }
    }
    return out.join("\n") + "\n";
}
//# sourceMappingURL=preview-diff.js.map