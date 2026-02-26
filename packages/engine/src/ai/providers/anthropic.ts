/**
 * Anthropic (Claude) AI provider.
 *
 * Requires `@anthropic-ai/sdk` as an optional peer dependency.
 */

import type { AIProvider, AICompleteParams, AICompleteResult } from "../provider.js";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private apiKey: string;
  private defaultModel: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.defaultModel = model ?? DEFAULT_MODEL;
  }

  async complete(params: AICompleteParams): Promise<AICompleteResult> {
    // Dynamic import so the SDK is only loaded when this provider is used
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: this.apiKey });

    const model = params.model ?? this.defaultModel;

    // Split system message from conversation messages
    const systemMsg = params.messages.find((m) => m.role === "system");
    const conversationMsgs = params.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const response = await this.withRetry(async () => {
      return client.messages.create({
        model,
        max_tokens: params.maxTokens,
        system: systemMsg?.content,
        messages: conversationMsgs,
      });
    });

    const textBlock = response.content.find(
      (block: { type: string }) => block.type === "text",
    );
    if (!textBlock || textBlock.type !== "text") {
      return { text: "" };
    }

    return { text: (textBlock as { type: "text"; text: string }).text };
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        lastError = err;

        // Only retry on rate limit or server errors
        const status = (err as { status?: number }).status;
        const isRetryable = status === 429 || (status !== undefined && status >= 500);

        if (!isRetryable || attempt === MAX_RETRIES) throw err;

        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }
}
