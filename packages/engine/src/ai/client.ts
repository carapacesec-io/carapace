/**
 * AI client wrapper.
 *
 * Handles communication with any AI provider through the pluggable
 * AIProvider interface. Parses structured output with Zod and handles
 * JSON extraction from model responses.
 *
 * Backward compatible: accepts either an AIProvider instance or a raw
 * API key string (which auto-creates an AnthropicProvider).
 */

import { z } from "zod";

import type { FileClassification } from "../parsers/file-classifier.js";
import { FindingSchema, type Finding } from "./schemas.js";
import type { AIProvider } from "./provider.js";
import { logger } from "../logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalyzeCodeParams {
  systemPrompt: string;
  diff: string;
  fileClassifications: FileClassification[];
  rules: string[];
}

export interface AnalyzeFileParams {
  systemPrompt: string;
  filePath: string;
  content: string;
  classification: FileClassification;
  rules: string[];
}

// ---------------------------------------------------------------------------
// Internal schemas for parsing AI response
// ---------------------------------------------------------------------------

const AIResponseSchema = z.object({
  findings: z.array(FindingSchema),
  summary: z.string(),
});

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class AIClient {
  private provider: AIProvider;

  /**
   * Create an AIClient.
   *
   * @overload New: pass an AIProvider directly.
   * @overload Legacy: pass an API key string to auto-create an AnthropicProvider.
   */
  constructor(providerOrApiKey: AIProvider | string, model?: string) {
    if (typeof providerOrApiKey === "string") {
      // Lazy import to avoid hard dependency on Anthropic SDK
      // We store a deferred provider that creates AnthropicProvider on first use
      const apiKey = providerOrApiKey;
      const modelStr = model;
      this.provider = {
        name: "anthropic-legacy",
        async complete(params) {
          const { AnthropicProvider } = await import("./providers/anthropic.js");
          const p = new AnthropicProvider(apiKey, modelStr);
          return p.complete(params);
        },
      };
    } else {
      this.provider = providerOrApiKey;
    }
  }

  /**
   * Send a diff chunk to the AI for analysis and return structured findings.
   */
  async analyzeCode(params: AnalyzeCodeParams): Promise<Finding[]> {
    const { systemPrompt, diff, fileClassifications } = params;

    // Build a concise file summary for additional context
    const filesSummary = fileClassifications
      .map(
        (fc) =>
          `- ${fc.language}${fc.chain ? ` (${fc.chain})` : ""}${fc.isSmartContract ? " [smart contract]" : ""}`,
      )
      .join("\n");

    const userMessage = `## Files in this diff

${filesSummary}

## Diff

\`\`\`diff
${diff}
\`\`\`

Review the above diff according to the system instructions and return your findings as JSON.`;

    const response = await this.provider.complete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      maxTokens: 8192,
    });

    const rawText = response.text.trim();
    if (!rawText) return [];

    // Parse the JSON from the response, stripping markdown fences if present
    let jsonStr = rawText;
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // If JSON parsing fails, try to find JSON object in the text
      const objectMatch = rawText.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          parsed = JSON.parse(objectMatch[0]);
        } catch {
          logger.error("Failed to parse AI response as JSON");
          return [];
        }
      } else {
        logger.error("No JSON found in AI response");
        return [];
      }
    }

    // Validate with Zod
    const result = AIResponseSchema.safeParse(parsed);
    if (!result.success) {
      logger.error(`AI response failed schema validation: ${result.error.message}`);
      // Try to salvage individual findings
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "findings" in parsed &&
        Array.isArray((parsed as { findings: unknown[] }).findings)
      ) {
        const validFindings: Finding[] = [];
        for (const f of (parsed as { findings: unknown[] }).findings) {
          const fResult = FindingSchema.safeParse(f);
          if (fResult.success) {
            validFindings.push(fResult.data);
          }
        }
        return validFindings;
      }
      return [];
    }

    return result.data.findings;
  }

  /**
   * Send a full source file to the AI for security review.
   */
  async analyzeFile(params: AnalyzeFileParams): Promise<Finding[]> {
    const { systemPrompt, filePath, content, classification } = params;

    const langInfo = `${classification.language}${classification.chain ? ` (${classification.chain})` : ""}${classification.isSmartContract ? " [smart contract]" : ""}`;

    const userMessage = `## File: ${filePath}

Language: ${langInfo}

\`\`\`
${content}
\`\`\`

Review this source file according to the system instructions and return your findings as JSON.`;

    const response = await this.provider.complete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      maxTokens: 8192,
    });

    const rawText = response.text.trim();
    if (!rawText) return [];

    let jsonStr = rawText;
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      const objectMatch = rawText.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          parsed = JSON.parse(objectMatch[0]);
        } catch {
          logger.error("Failed to parse AI response as JSON");
          return [];
        }
      } else {
        logger.error("No JSON found in AI response");
        return [];
      }
    }

    const result = AIResponseSchema.safeParse(parsed);
    if (!result.success) {
      logger.error(`AI response failed schema validation: ${result.error.message}`);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "findings" in parsed &&
        Array.isArray((parsed as { findings: unknown[] }).findings)
      ) {
        const validFindings: Finding[] = [];
        for (const f of (parsed as { findings: unknown[] }).findings) {
          const fResult = FindingSchema.safeParse(f);
          if (fResult.success) {
            validFindings.push(fResult.data);
          }
        }
        return validFindings;
      }
      return [];
    }

    return result.data.findings;
  }
}
