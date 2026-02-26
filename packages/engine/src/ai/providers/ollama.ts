/**
 * Ollama AI provider.
 *
 * Uses Ollama's OpenAI-compatible API via native fetch. No external
 * dependencies required.
 */

import type { AIProvider, AICompleteParams, AICompleteResult } from "../provider.js";

const DEFAULT_URL = "http://localhost:11434";
const DEFAULT_MODEL = "llama3";

export class OllamaProvider implements AIProvider {
  readonly name = "ollama";
  private baseUrl: string;
  private defaultModel: string;

  constructor(baseUrl?: string, model?: string) {
    this.baseUrl = (baseUrl ?? DEFAULT_URL).replace(/\/$/, "");
    this.defaultModel = model ?? DEFAULT_MODEL;
  }

  async complete(params: AICompleteParams): Promise<AICompleteResult> {
    const model = params.model ?? this.defaultModel;

    const messages = params.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: params.maxTokens,
        stream: false,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Ollama API error ${response.status}: ${body.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const text = data.choices?.[0]?.message?.content ?? "";
    return { text };
  }
}
