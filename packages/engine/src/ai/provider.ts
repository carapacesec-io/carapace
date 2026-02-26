/**
 * Pluggable AI provider interface.
 *
 * Any AI backend that can perform message-based completions implements this
 * interface. The engine never imports a specific SDK directly — it goes
 * through an AIProvider.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AICompleteParams {
  messages: AIMessage[];
  maxTokens: number;
  model?: string;
}

export interface AICompleteResult {
  text: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface AIProvider {
  /** Human-readable name for logs, e.g. "anthropic", "openai", "ollama". */
  readonly name: string;

  /**
   * Send a chat completion request and return the assistant's text response.
   * Implementations handle their own retry/rate-limit logic.
   */
  complete(params: AICompleteParams): Promise<AICompleteResult>;
}
