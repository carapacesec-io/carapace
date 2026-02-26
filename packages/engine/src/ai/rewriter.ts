/**
 * Full-file rewrite module.
 *
 * Takes a source file together with its security/quality findings and asks
 * the AI provider to rewrite the entire file, fixing every reported issue
 * while preserving the original purpose and public API surface.
 */

import type { AIProvider } from "./provider.js";
import type { Finding } from "./schemas.js";
import { logger } from "../logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RewriteResult {
  filePath: string;
  originalContent: string;
  rewrittenContent: string;
  changesSummary: string[];
}

interface RewriteFileParams {
  provider: AIProvider;
  filePath: string;
  content: string;
  findings: Finding[];
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return `You are Carapace, an expert code rewriter specializing in security fixes and code quality improvements.

You will receive a source file and a list of findings (security issues, bugs, quality problems). Your task is to rewrite the entire file, fixing ALL listed findings while preserving the file's original purpose and public API.

## Rules

1. Fix every finding listed in the user message. Do not skip any.
2. Preserve the file's original purpose, exports, and public API surface exactly. External consumers must not break.
3. Apply modern best practices for the language/framework in use.
4. Do NOT add unnecessary comments, docstrings, or inline explanations that were not in the original file. Keep the comment style consistent with the original.
5. Do NOT remove existing comments that are still relevant after the fix.
6. Keep import ordering and code organization consistent with the original style.
7. If a finding suggests a specific fix, prefer that approach unless it conflicts with another finding or introduces a new issue.

## Response Format

Return ONLY the rewritten file inside a single code fence. Use the appropriate language identifier on the opening fence (e.g. \`\`\`typescript, \`\`\`python, \`\`\`solidity).

After the closing code fence, list each change you made as a bullet point. Each bullet should be one concise sentence describing what was changed and why. Prefix each with "- ".

Example response structure:

\`\`\`typescript
// ... rewritten file contents ...
\`\`\`

- Fixed reentrancy vulnerability by moving state update before external call
- Replaced unsafe cast with proper type guard
- Added input validation for user-supplied parameter`;
}

// ---------------------------------------------------------------------------
// Finding formatter
// ---------------------------------------------------------------------------

function formatFindings(findings: Finding[]): string {
  return findings
    .map((f, i) => {
      const lines =
        f.startLine === f.endLine
          ? `line ${f.startLine}`
          : `lines ${f.startLine}-${f.endLine}`;

      const cwe = f.cweIds?.length ? ` | CWE: ${f.cweIds.join(", ")}` : "";
      const owasp = f.owaspCategory ? ` | OWASP: ${f.owaspCategory}` : "";

      return `### Finding ${i + 1}: ${f.title}
- **Severity**: ${f.severity}
- **Category**: ${f.category}
- **Location**: ${lines}${cwe}${owasp}
- **Rule**: ${f.ruleId}
- **Description**: ${f.description}
- **Suggestion**: ${f.suggestion}
\`\`\`
${f.codeSnippet}
\`\`\``;
    })
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

function parseRewriteResponse(raw: string): {
  code: string;
  changes: string[];
} {
  // Extract the first code fence
  const fenceMatch = raw.match(/```[\w]*\s*\n([\s\S]*?)```/);
  if (!fenceMatch) {
    // Fallback: if no code fence found, treat everything up to the first
    // bullet list (or the whole response) as code
    const bulletIdx = raw.indexOf("\n- ");
    const code = bulletIdx === -1 ? raw.trim() : raw.slice(0, bulletIdx).trim();
    return { code, changes: [] };
  }

  const code = fenceMatch[1].trimEnd();

  // Everything after the closing fence is the change summary
  const afterFence = raw.slice(raw.indexOf("```", fenceMatch.index! + 3) + 3);

  // Extract bullet points
  const changes: string[] = [];
  const bulletRegex = /^- (.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = bulletRegex.exec(afterFence)) !== null) {
    changes.push(match[1].trim());
  }

  return { code, changes };
}

// ---------------------------------------------------------------------------
// Single-file rewrite
// ---------------------------------------------------------------------------

export async function rewriteFile(
  params: RewriteFileParams,
): Promise<RewriteResult> {
  const { provider, filePath, content, findings } = params;

  if (findings.length === 0) {
    logger.info(`No findings for ${filePath}, skipping rewrite`);
    return {
      filePath,
      originalContent: content,
      rewrittenContent: content,
      changesSummary: [],
    };
  }

  logger.info(
    `Rewriting ${filePath} — ${findings.length} finding(s) to fix [${provider.name}]`,
  );

  const systemPrompt = buildSystemPrompt();

  const userMessage = `## File: ${filePath}

\`\`\`
${content}
\`\`\`

## Findings to Fix (${findings.length})

${formatFindings(findings)}

Rewrite the file above, fixing every finding listed. Return the complete rewritten file in a single code fence followed by a bullet list of changes.`;

  // Use a generous token budget — we need to return an entire file
  const maxTokens = Math.max(8192, Math.ceil(content.length / 2));

  const response = await provider.complete({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    maxTokens,
  });

  const rawText = response.text.trim();
  if (!rawText) {
    logger.warn(`Empty AI response for ${filePath}, returning original`);
    return {
      filePath,
      originalContent: content,
      rewrittenContent: content,
      changesSummary: [],
    };
  }

  const { code, changes } = parseRewriteResponse(rawText);

  logger.info(
    `Rewrite complete for ${filePath}: ${changes.length} change(s) reported`,
  );

  return {
    filePath,
    originalContent: content,
    rewrittenContent: code,
    changesSummary: changes,
  };
}

// ---------------------------------------------------------------------------
// Multi-file rewrite with concurrency limit
// ---------------------------------------------------------------------------

export async function rewriteFiles(
  params: Omit<RewriteFileParams, "filePath" | "content" | "findings"> & {
    files: Array<{ filePath: string; content: string; findings: Finding[] }>;
  },
): Promise<RewriteResult[]> {
  const { provider, files } = params;
  const concurrency = 3;
  const results: RewriteResult[] = [];

  logger.info(
    `Starting batch rewrite: ${files.length} file(s), concurrency=${concurrency}`,
  );

  // Process files in chunks of `concurrency`
  for (let i = 0; i < files.length; i += concurrency) {
    const chunk = files.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((file) =>
        rewriteFile({
          provider,
          filePath: file.filePath,
          content: file.content,
          findings: file.findings,
        }),
      ),
    );
    results.push(...chunkResults);
  }

  const totalChanges = results.reduce(
    (sum, r) => sum + r.changesSummary.length,
    0,
  );
  logger.info(
    `Batch rewrite complete: ${results.length} file(s), ${totalChanges} total change(s)`,
  );

  return results;
}
