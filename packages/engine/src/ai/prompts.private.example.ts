/**
 * OPEN-SOURCE STUB — Generic system prompt.
 *
 * Copy this file to `prompts.private.ts` to build the project.
 * For the full AI review prompts, obtain a license at https://carapacesec.io.
 */

import type { FileClassification } from "../parsers/file-classifier.js";

export function getSystemPrompt(
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

  return `You are a code reviewer. Analyze the code diff and report security issues, bugs, and quality problems.

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
      "description": "Detailed explanation",
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

Only report genuine issues in changed lines. Respond only with JSON.`;
}
