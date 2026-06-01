import * as vscode from "vscode";
import { ColonyClient } from "./colony-client";

const TOKEN_SECRET_KEY = "colony.daemonToken";

/**
 * Build a ColonyClient using:
 *   - colony.daemonUrl from VS Code settings
 *   - bearer token from SecretStorage (set via `Colony: Set Daemon Bearer Token`)
 */
export function buildColonyClient(context: vscode.ExtensionContext): ColonyClient {
  const config = vscode.workspace.getConfiguration("colony");
  const daemonUrl = config.get<string>("daemonUrl", "http://127.0.0.1:7878");

  return new ColonyClient({
    daemonUrl,
    getBearerToken: async () => await context.secrets.get(TOKEN_SECRET_KEY),
  });
}

export async function setStoredToken(
  context: vscode.ExtensionContext,
  token: string | undefined,
): Promise<void> {
  if (token && token.trim()) {
    await context.secrets.store(TOKEN_SECRET_KEY, token.trim());
  } else {
    await context.secrets.delete(TOKEN_SECRET_KEY);
  }
}

export async function getStoredToken(
  context: vscode.ExtensionContext,
): Promise<string | undefined> {
  return await context.secrets.get(TOKEN_SECRET_KEY);
}
