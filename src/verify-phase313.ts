import { SlashCommandParser } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function actionKind(result: ReturnType<SlashCommandParser["tryHandle"]>): string {
  return String(result.action?.kind ?? "");
}

const parser = new SlashCommandParser({
  plugins: {
    entries: [{ id: "local-tools", source: "bundled", installed: true, trusted: true }],
  },
});

const browserOpen = parser.tryHandle("/browser open https://example.com --approved");
assert(actionKind(browserOpen) === "browser_open", "approved browser open returns typed action");
assert(browserOpen.action && "url" in browserOpen.action && browserOpen.action.url === "https://example.com", "browser open action carries URL");
assert(JSON.stringify(browserOpen.action).includes("approved"), "browser open action carries approval boundary");

const browserClick = parser.tryHandle("/browser click #submit --approved");
assert(actionKind(browserClick) === "browser_click", "approved browser click returns typed action");
assert(browserClick.action && "selector" in browserClick.action && browserClick.action.selector === "#submit", "browser click action carries selector");

const workflowStart = parser.tryHandle("/workflow start qa");
assert(actionKind(workflowStart) === "start_workflow_recipe", "workflow start returns typed recipe action");
assert(workflowStart.action && "recipeId" in workflowStart.action && workflowStart.action.recipeId === "qa", "workflow action carries recipe id");

const githubCreate = parser.tryHandle("/github pr create run_123 --approved");
assert(actionKind(githubCreate) === "github_pr_create", "approved GitHub PR command returns typed action");
assert(githubCreate.action && "runId" in githubCreate.action && githubCreate.action.runId === "run_123", "GitHub action carries run id");
assert(!JSON.stringify(githubCreate.action).includes("ghp_"), "GitHub action carries no raw token");

const pluginActivate = parser.tryHandle("/plugins activate local-tools --approved");
assert(actionKind(pluginActivate) === "plugin_activate", "approved plugin activate returns typed action");
assert(pluginActivate.action && "pluginId" in pluginActivate.action && pluginActivate.action.pluginId === "local-tools", "plugin action carries plugin id");

const pluginDeactivate = parser.tryHandle("/plugins deactivate local-tools --approved");
assert(actionKind(pluginDeactivate) === "plugin_deactivate", "approved plugin deactivate returns typed action");

const blocked = parser.tryHandle("/plugins activate local-tools");
assert(actionKind(blocked) === "display", "unapproved plugin activation remains display-only");

console.log("Phase 313: market-parity typed command actions are GREEN.");
