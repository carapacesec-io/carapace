/**
 * Provider factory.
 *
 * Creates the appropriate AIProvider from environment-style configuration.
 */

import type { AIProvider } from "../provider.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { OllamaProvider } from "./ollama.js";
import { MockProvider } from "./mock.js";

export interface CreateProviderOptions {
  provider: "anthropic" | "openai" | "ollama" | "mock";
  apiKey?: string;
  model?: string;
  /** Ollama base URL (default http://localhost:11434). */
  ollamaUrl?: string;
}

/**
 * Create an AIProvider from a config object.
 *
 * ```ts
 * const provider = createProvider({ provider: "openai", apiKey: "sk-..." });
 * ```
 */
export function createProvider(options: CreateProviderOptions): AIProvider {
  switch (options.provider) {
    case "anthropic": {
      if (!options.apiKey) throw new Error("apiKey is required for Anthropic provider");
      return new AnthropicProvider(options.apiKey, options.model);
    }
    case "openai": {
      if (!options.apiKey) throw new Error("apiKey is required for OpenAI provider");
      return new OpenAIProvider(options.apiKey, options.model);
    }
    case "ollama": {
      return new OllamaProvider(options.ollamaUrl, options.model);
    }
    case "mock": {
      return new MockProvider();
    }
    default:
      throw new Error(`Unknown AI provider: ${options.provider}`);
  }
}

export { AnthropicProvider } from "./anthropic.js";
export { OpenAIProvider } from "./openai.js";
export { OllamaProvider } from "./ollama.js";
export { MockProvider } from "./mock.js";
