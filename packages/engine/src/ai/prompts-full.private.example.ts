/**
 * OPEN-SOURCE STUB — Generic full-file system prompt.
 *
 * Copy this file to `prompts-full.private.ts` to build the project.
 */

import type { FileClassification } from "../parsers/file-classifier.js";

export function getFullFileSystemPrompt(
  _classifications: FileClassification[],
  ruleDescriptions: string[],
  staticAnalysisContext?: string,
): string {
  const rulesBlock = ruleDescriptions
    .map((desc, i) => `${i + 1}. ${desc}`)
    .join("\n");

  const staticSection = staticAnalysisContext
    ? `\n${staticAnalysisContext}\n`
    : "";

  return `You are a code reviewer analyzing a complete source file for security issues.

${staticSection}
## Active Rules

${rulesBlock}

## Output Format

Respond with a JSON object:
\`\`\`json
{
  "findings": [
    {
      "severity": "critical" | "high" | "medium" | "low" | "info",
      "category": "string",
      "title": "Short title",
      "description": "Why this is a problem",
      "filePath": "path/to/file",
      "startLine": 1,
      "endLine": 1,
      "codeSnippet": "code",
      "suggestion": "How to fix",
      "fixDiff": "diff",
      "ruleId": "rule-id"
    }
  ],
  "summary": "Brief summary"
}
\`\`\`

Only report genuine issues. Respond only with JSON.`;
}
