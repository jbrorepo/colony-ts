import { describe, test, expect } from "bun:test";

// Import only the model list — provider constructor needs a live API key.
// We test it by inspecting exports, not by constructing the class.
import { AnthropicProvider } from "../../llm/providers/anthropic";

describe("AnthropicProvider model catalog (P0-1)", () => {
  // Build a minimal provider with a fake key to inspect listModels()
  let provider: AnthropicProvider;
  try {
    provider = new AnthropicProvider({ apiKey: "sk-ant-fake-key-for-tests" });
  } catch {
    // If constructor throws for some reason, tests will fail individually below
  }

  const models = () => provider?.listModels() ?? [];

  test("current claude-sonnet-4-6 is present", () => {
    expect(models().some((m) => m.modelId === "claude-sonnet-4-6")).toBe(true);
  });

  test("current claude-haiku-4-5-20251001 is present", () => {
    expect(models().some((m) => m.modelId === "claude-haiku-4-5-20251001")).toBe(true);
  });

  test("claude-opus-4-6 is present", () => {
    expect(models().some((m) => m.modelId === "claude-opus-4-6")).toBe(true);
  });

  test("legacy models kept for backwards compat", () => {
    expect(models().some((m) => m.modelId === "claude-sonnet-4-5-20250929")).toBe(true);
    expect(models().some((m) => m.modelId === "claude-haiku-4-5-20250929")).toBe(true);
  });

  test("all models report anthropic as provider", () => {
    for (const m of models()) {
      expect(m.provider).toBe("anthropic");
    }
  });

  test("all models support streaming and tool use", () => {
    for (const m of models()) {
      expect(m.supportsStreaming).toBe(true);
      expect(m.supportsToolUse).toBe(true);
    }
  });
});

describe("AnthropicProvider default model (P0-1)", () => {
  test("default model is claude-sonnet-4-6", () => {
    // Access _defaultModel via any-cast since it's private — acceptable in tests
    const p = new AnthropicProvider({ apiKey: "sk-ant-fake" }) as unknown as { _defaultModel: string };
    expect(p._defaultModel).toBe("claude-sonnet-4-6");
  });

  test("custom defaultModel override is respected", () => {
    const p = new AnthropicProvider({ apiKey: "sk-ant-fake", defaultModel: "claude-opus-4-6" }) as unknown as { _defaultModel: string };
    expect(p._defaultModel).toBe("claude-opus-4-6");
  });
});
