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
exports.buildColonyClient = buildColonyClient;
exports.setStoredToken = setStoredToken;
exports.getStoredToken = getStoredToken;
const vscode = __importStar(require("vscode"));
const colony_client_1 = require("./colony-client");
const TOKEN_SECRET_KEY = "colony.daemonToken";
/**
 * Build a ColonyClient using:
 *   - colony.daemonUrl from VS Code settings
 *   - bearer token from SecretStorage (set via `Colony: Set Daemon Bearer Token`)
 */
function buildColonyClient(context) {
    const config = vscode.workspace.getConfiguration("colony");
    const daemonUrl = config.get("daemonUrl", "http://127.0.0.1:7878");
    return new colony_client_1.ColonyClient({
        daemonUrl,
        getBearerToken: async () => await context.secrets.get(TOKEN_SECRET_KEY),
    });
}
async function setStoredToken(context, token) {
    if (token && token.trim()) {
        await context.secrets.store(TOKEN_SECRET_KEY, token.trim());
    }
    else {
        await context.secrets.delete(TOKEN_SECRET_KEY);
    }
}
async function getStoredToken(context) {
    return await context.secrets.get(TOKEN_SECRET_KEY);
}
//# sourceMappingURL=client-factory.js.map