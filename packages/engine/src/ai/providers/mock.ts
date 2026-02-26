/**
 * Mock AI provider for tests.
 *
 * Returns canned responses. No network calls, no dependencies.
 */

import type { AIProvider, AICompleteParams, AICompleteResult } from "../provider.js";

export interface MockResponse {
  /** Substring match on the user message to trigger this response. */
  match?: string;
  /** The response text to return. */
  text: string;
}

/**
 * Default response when no custom responses are configured.
 * Returns a valid empty-findings JSON so tests using the full pipeline
 * get a parseable result.
 */
const DEFAULT_RESPONSE = JSON.stringify({
  findings: [],
  summary: "No issues found (mock provider).",
});

export class MockProvider implements AIProvider {
  readonly name = "mock";
  private responses: MockResponse[];
  /** Number of times `complete` has been called. */
  public callCount = 0;
  /** Record of all calls for assertion. */
  public calls: AICompleteParams[] = [];

  constructor(responses?: MockResponse[]) {
    this.responses = responses ?? [];
  }

  async complete(params: AICompleteParams): Promise<AICompleteResult> {
    this.callCount++;
    this.calls.push(params);

    // Find a matching response by checking user messages
    const userContent = params.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n");

    for (const resp of this.responses) {
      if (!resp.match || userContent.includes(resp.match)) {
        return { text: resp.text };
      }
    }

    return { text: DEFAULT_RESPONSE };
  }
}
