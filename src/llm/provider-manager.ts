/**
 * Provider Manager — registry of LLM provider instances.
 *
 * Resolves provider names to initialized LLMProvider instances.
 * Auto-initializes from ColonySettings on first access.
 */

import type { LLMProvider } from "./base";
import { LLMConfigError } from "./exceptions";
import { OllamaProvider } from "./providers/ollama";

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

export class ProviderManager {
  private _providers = new Map<string, LLMProvider>();
  private _initialized = false;

  /**
   * Register a provider instance by name.
   */
  register(name: string, provider: LLMProvider): void {
    this._providers.set(name, provider);
  }

  /**
   * Resolve a provider name to an initialized LLMProvider instance.
   * Throws LLMConfigError if the provider is not registered.
   */
  getProvider(name: string): LLMProvider {
    if (!this._initialized) {
      this._autoInit();
    }
    const provider = this._providers.get(name);
    if (!provider) {
      throw new LLMConfigError(
        `Unknown provider '${name}'. Available: ${[...this._providers.keys()].join(", ")}`,
        { provider: name },
      );
    }
    return provider;
  }

  /**
   * Check if a provider is registered.
   */
  hasProvider(name: string): boolean {
    if (!this._initialized) this._autoInit();
    return this._providers.has(name);
  }

  /**
   * Return all registered provider names.
   */
  listProviders(): string[] {
    if (!this._initialized) this._autoInit();
    return [...this._providers.keys()];
  }

  /**
   * Run health checks on all registered providers.
   */
  async healthCheckAll(): Promise<Record<string, boolean>> {
    if (!this._initialized) this._autoInit();
    const results: Record<string, boolean> = {};
    for (const [name, provider] of this._providers) {
      try {
        results[name] = await provider.healthCheck();
      } catch {
        results[name] = false;
      }
    }
    return results;
  }

  /**
   * Auto-initialize the default Ollama provider.
   * Additional providers (Anthropic, OpenAI) are registered lazily
   * when API keys are detected in environment variables.
   */
  private _autoInit(): void {
    if (this._initialized) return;
    this._initialized = true;

    // Always register Ollama (local-first, no API key needed).
    // "local" is the selector/config name used by the Python reference;
    // "ollama" is the concrete provider name used by the TS settings layer.
    if (!this._providers.has("ollama")) {
      this._providers.set("ollama", new OllamaProvider());
    }
    if (!this._providers.has("local")) {
      this._providers.set("local", new OllamaProvider({ providerName: "local" }));
    }

    // Conditionally register Anthropic if API key is present
    if (!this._providers.has("anthropic") && process.env.ANTHROPIC_API_KEY) {
      try {
        const { AnthropicProvider } = require("./providers/anthropic");
        this._providers.set("anthropic", new AnthropicProvider());
      } catch {
        // Anthropic init failed (e.g., invalid config); skip silently
      }
    }

    // Conditionally register Gemini if API key is present
    if (
      !this._providers.has("gemini") &&
      (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
    ) {
      try {
        const { GeminiProvider } = require("./providers/gemini");
        this._providers.set("gemini", new GeminiProvider());
      } catch {
        // Gemini init failed; skip silently
      }
    }

    // Conditionally register OpenAI if API key is present
    if (!this._providers.has("openai") && process.env.OPENAI_API_KEY) {
      try {
        const { OpenAICompatibleProvider } = require("./providers/openai-compatible");
        this._providers.set("openai", new OpenAICompatibleProvider());
      } catch {
        // OpenAI init failed; skip silently
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

export const providerManager = new ProviderManager();
