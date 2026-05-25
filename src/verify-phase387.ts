/**
 * Phase 387 — Ollama reasoning passthrough.
 *
 * Reasoning-capable Ollama models (Gemma 4 family, etc.) return their
 * chain-of-thought under `message.thinking` while `message.content` may be
 * empty (especially when the response is truncated by num_predict). Earlier
 * builds silently dropped this field, so an empty content string was the
 * only signal the rest of the system saw — even though the model had
 * actually produced hundreds of tokens of output.
 *
 * This verifier stubs `globalThis.fetch` to return a canned Ollama response
 * with both `content` and `thinking`, and asserts:
 *   1. LLMResponse.reasoning carries the thinking text through unchanged.
 *   2. LLMResponse.content is unaffected (no accidental concatenation).
 *   3. When content is empty and thinking is present, reasoning is still
 *      populated (the Gemma-empty-content case).
 *   4. When neither thinking nor content is present, reasoning is undefined
 *      (not an empty string — undefined is the documented "no signal" form).
 *   5. The downstream LLMResponse type still has the optional reasoning slot
 *      so future provider implementations can populate it without a breaking
 *      change.
 */

import { OllamaProvider } from "./llm/providers/ollama";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const originalFetch = globalThis.fetch;

function installStubFetch(payload: Record<string, unknown>): void {
  // Cast through unknown because Bun's `typeof fetch` includes a
  // `preconnect` static property the stub doesn't need to provide for
  // OllamaProvider.complete()'s single call site.
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof globalThis.fetch;
}

function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}

async function runCase(
  label: string,
  payload: Record<string, unknown>,
): Promise<{ content: string; reasoning: string | undefined; finishReason: string }> {
  installStubFetch(payload);
  try {
    const provider = new OllamaProvider({ baseUrl: "http://stub.test" });
    const resp = await provider.complete(
      [{ role: "user", content: "hello" }],
      { model: "test-model" },
    );
    return {
      content: resp.content,
      reasoning: resp.reasoning,
      finishReason: resp.finishReason,
    };
  } finally {
    restoreFetch();
  }
}

// Case 1: content + thinking both present → both should pass through cleanly.
{
  const r = await runCase("content+thinking", {
    model: "test-model",
    message: {
      role: "assistant",
      content: "Final answer.",
      thinking: "Step 1: parse. Step 2: respond.",
    },
    done: true,
    done_reason: "stop",
    prompt_eval_count: 5,
    eval_count: 10,
  });
  assert(r.content === "Final answer.", `content+thinking: content was '${r.content}'`);
  assert(
    r.reasoning === "Step 1: parse. Step 2: respond.",
    `content+thinking: reasoning was '${r.reasoning}'`,
  );
  assert(r.finishReason === "stop", `content+thinking: finishReason was '${r.finishReason}'`);
}

// Case 2: Gemma-style empty content + thinking truncated by length.
{
  const reasoningText =
    "Thinking Process:\n1. Analyze the request.\n2. Draft a numbered plan.\n3. Run out of token budget mid-draft...";
  const r = await runCase("gemma-empty-content", {
    model: "gemma4:latest",
    message: {
      role: "assistant",
      content: "",
      thinking: reasoningText,
    },
    done: true,
    done_reason: "length",
    prompt_eval_count: 74,
    eval_count: 400,
  });
  assert(r.content === "", `gemma: content should be empty, was '${r.content}'`);
  assert(r.reasoning === reasoningText, `gemma: reasoning lost or mutated`);
  assert(
    r.finishReason === "length",
    `gemma: finishReason should be 'length', was '${r.finishReason}'`,
  );
}

// Case 3: no thinking, no content → reasoning must be undefined (not "").
{
  const r = await runCase("no-thinking-no-content", {
    model: "test-model",
    message: { role: "assistant", content: "" },
    done: true,
    done_reason: "stop",
    prompt_eval_count: 1,
    eval_count: 0,
  });
  assert(r.content === "", `no-thinking: content was '${r.content}'`);
  assert(
    r.reasoning === undefined,
    `no-thinking: reasoning should be undefined, was ${JSON.stringify(r.reasoning)}`,
  );
}

// Case 4: thinking present but empty string → reasoning must be undefined
// (we only surface non-empty reasoning to keep the "no signal" form unambiguous).
{
  const r = await runCase("empty-thinking-string", {
    model: "test-model",
    message: { role: "assistant", content: "ok", thinking: "" },
    done: true,
    done_reason: "stop",
    prompt_eval_count: 1,
    eval_count: 1,
  });
  assert(r.content === "ok", `empty-thinking: content was '${r.content}'`);
  assert(
    r.reasoning === undefined,
    `empty-thinking: reasoning should be undefined, was ${JSON.stringify(r.reasoning)}`,
  );
}

// Case 5: non-string thinking (defensive) → reasoning must be undefined.
{
  const r = await runCase("non-string-thinking", {
    model: "test-model",
    message: { role: "assistant", content: "ok", thinking: { unexpected: true } },
    done: true,
    done_reason: "stop",
    prompt_eval_count: 1,
    eval_count: 1,
  });
  assert(r.content === "ok", `non-string-thinking: content was '${r.content}'`);
  assert(
    r.reasoning === undefined,
    `non-string-thinking: reasoning should be undefined, was ${JSON.stringify(r.reasoning)}`,
  );
}

// Case 6: LLMResponse type-shape sanity — additive optional field still optional.
{
  const { createLLMResponse } = await import("./llm/models");
  const minimal = createLLMResponse("hi", "m", "p");
  assert(
    !("reasoning" in minimal) || minimal.reasoning === undefined,
    "createLLMResponse default leaves reasoning undefined",
  );
  const withReasoning = createLLMResponse("hi", "m", "p", { reasoning: "trace" });
  assert(
    withReasoning.reasoning === "trace",
    "createLLMResponse threads reasoning through when supplied",
  );
}

console.log(
  "Phase 387: Ollama provider surfaces message.thinking as LLMResponse.reasoning across content/empty/truncated cases.",
);
