import { executeCommand, SlashCommandParser, type CommandExecutionHandlers } from "./gateway";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function baseHandlers(messages: string[], errors: string[]): CommandExecutionHandlers {
  return {
    submitChat: () => {},
    exitApp: () => {},
    resetSession: () => {},
    requestCompaction: () => {},
    setBudgetCap: () => {},
    showSystemMessage: (message) => messages.push(message),
    showErrorMessage: (message) => errors.push(message),
  };
}

const parser = new SlashCommandParser({
  plugins: {
    entries: [{ id: "local-tools", source: "bundled", installed: true, trusted: true }],
  },
});

{
  const messages: string[] = [];
  const errors: string[] = [];
  const calls: string[] = [];
  const handled = await executeCommand(parser.tryHandle("/browser open https://example.com --approved"), {
    ...baseHandlers(messages, errors),
    requestBrowserOpen: (url) => {
      calls.push(url);
      return `browser host accepted ${url}`;
    },
  });
  assert(handled, "browser open command is handled");
  assert(calls[0] === "https://example.com", "browser open handler receives URL");
  assert(messages.some((message) => message.includes("Browser open approved.")), "browser open command output is shown");
  assert(messages.some((message) => message.includes("browser host accepted https://example.com")), "browser open handler result is shown");
  assert(errors.length === 0, "browser open handler emits no errors");
}

{
  const messages: string[] = [];
  const errors: string[] = [];
  const handled = await executeCommand(parser.tryHandle("/browser open https://example.com --approved"), baseHandlers(messages, errors));
  assert(handled, "browser open remains handled without host handler");
  assert(messages.length === 1, "missing browser host handler is display-only");
  assert(errors.length === 0, "missing browser host handler is not an error");
}

{
  const messages: string[] = [];
  const errors: string[] = [];
  const calls: Array<{ selector: string; text: string }> = [];
  await executeCommand(parser.tryHandle("/browser type #q hello world --approved"), {
    ...baseHandlers(messages, errors),
    requestBrowserType: (selector, text) => {
      calls.push({ selector, text });
      return "typed";
    },
  });
  assert(calls[0]?.selector === "#q", "browser type handler receives selector");
  assert(calls[0]?.text === "hello world", "browser type handler receives text");
}

{
  const messages: string[] = [];
  const errors: string[] = [];
  const calls: string[] = [];
  await executeCommand(parser.tryHandle("/workflow start qa"), {
    ...baseHandlers(messages, errors),
    startWorkflowRecipe: (recipeId) => {
      calls.push(recipeId);
      return `workflow host accepted ${recipeId}`;
    },
  });
  assert(calls[0] === "qa", "workflow start handler receives recipe id");
  assert(messages.some((message) => message.includes("workflow host accepted qa")), "workflow handler result is shown");
}

{
  const messages: string[] = [];
  const errors: string[] = [];
  const calls: string[] = [];
  await executeCommand(parser.tryHandle("/github pr create run_123 --approved"), {
    ...baseHandlers(messages, errors),
    createGitHubPullRequest: (runId) => {
      calls.push(runId);
      return `pr host accepted ${runId}`;
    },
  });
  assert(calls[0] === "run_123", "GitHub PR handler receives run id");
  assert(!JSON.stringify(calls).includes("ghp_"), "GitHub PR handler call carries no raw token");
  assert(messages.some((message) => message.includes("pr host accepted run_123")), "GitHub PR handler result is shown");
}

{
  const messages: string[] = [];
  const errors: string[] = [];
  const calls: string[] = [];
  await executeCommand(parser.tryHandle("/plugins activate local-tools --approved"), {
    ...baseHandlers(messages, errors),
    activatePlugin: (pluginId) => {
      calls.push(`activate:${pluginId}`);
      return "plugin activated";
    },
    deactivatePlugin: (pluginId) => {
      calls.push(`deactivate:${pluginId}`);
      return "plugin deactivated";
    },
  });
  await executeCommand(parser.tryHandle("/plugins deactivate local-tools --approved"), {
    ...baseHandlers(messages, errors),
    activatePlugin: (pluginId) => {
      calls.push(`activate:${pluginId}`);
      return "plugin activated";
    },
    deactivatePlugin: (pluginId) => {
      calls.push(`deactivate:${pluginId}`);
      return "plugin deactivated";
    },
  });
  assert(calls.includes("activate:local-tools"), "plugin activate handler receives plugin id");
  assert(calls.includes("deactivate:local-tools"), "plugin deactivate handler receives plugin id");
}

{
  const messages: string[] = [];
  const errors: string[] = [];
  await executeCommand(parser.tryHandle("/github pr create run_123 --approved"), {
    ...baseHandlers(messages, errors),
    createGitHubPullRequest: () => {
      throw new Error("host failed with token ghp_secret123");
    },
  });
  assert(errors.length === 1, "host handler failure is surfaced as one error");
  assert(!errors[0]?.includes("ghp_secret123"), "host handler failure is redacted");
}

console.log("Phase 314: typed market-parity executor handoffs are GREEN.");
