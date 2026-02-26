/**
 * OpenAI AI provider.
 *
 * Requires `openai` as an optional peer dependency.
 * Uses dynamic require/import to avoid build failures when the package isn't installed.
 */

import type { AIProvider, AICompleteParams, AICompleteResult } from "../provider.js";

const DEFAULT_MODEL = "gpt-4o";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function loadOpenAI(apiKey: string): Promise<{ create: (opts: any) => Promise<any> }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  let mod: any;
  try {
    // Try dynamic import (ESM)
    mod = await (Function('return import("openai")')() as Promise<any>);
  } catch {
    throw new Error(
      'OpenAI provider requires the "openai" package. Install it with: npm install openai',
    );
  }

  const OpenAI = mod.default ?? mod.OpenAI ?? mod;
  const client = new OpenAI({ apiKey });
  return {
    create: (opts: any) => client.chat.completions.create(opts),
  };
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  private apiKey: string;
  private defaultModel: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.defaultModel = model ?? DEFAULT_MODEL;
  }

  async complete(params: AICompleteParams): Promise<AICompleteResult> {
    const client = await loadOpenAI(this.apiKey);
    const model = params.model ?? this.defaultModel;

    const messages = params.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const response = await this.withRetry(async () => {
      return client.create({
        model,
        max_tokens: params.maxTokens,
        messages,
      });
    });

    const text = response.choices?.[0]?.message?.content ?? "";
    return { text };
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        lastError = err;

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
