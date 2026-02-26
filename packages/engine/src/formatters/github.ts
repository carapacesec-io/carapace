/**
 * GitHub PR review comment formatter.
 *
 * Converts engine findings into the format expected by the GitHub Pull Request
 * Review Comments API.
 */

import type { Finding, Severity } from "../ai/schemas.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitHubReviewComment {
  path: string;
  line: number;
  side: "RIGHT";
  body: string;
}

// ---------------------------------------------------------------------------
// Severity badges
// ---------------------------------------------------------------------------

const SEVERITY_BADGES: Record<Severity, string> = {
  critical: "🔴 **Critical**",
  high: "🟠 **High**",
  medium: "🟡 **Medium**",
  low: "🔵 **Low**",
  info: "ℹ️ **Info**",
};

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

function formatCommentBody(finding: Finding): string {
  const badge = SEVERITY_BADGES[finding.severity];
  const parts: string[] = [];

  // Header
  parts.push(`${badge} | ${finding.title}`);
  parts.push("");

  // Description
  parts.push(finding.description);
  parts.push("");

  // Category and rule
  parts.push(`**Category:** ${finding.category} | **Rule:** \`${finding.ruleId}\``);
  if (finding.cweIds && finding.cweIds.length > 0) {
    const owaspSuffix = finding.owaspCategory
      ? ` | **OWASP:** ${finding.owaspCategory}`
      : "";
    parts.push(`**CWE:** ${finding.cweIds.join(", ")}${owaspSuffix}`);
  }
  parts.push("");

  // Suggestion
  if (finding.suggestion) {
    parts.push("**Suggestion:**");
    parts.push(finding.suggestion);
    parts.push("");
  }

  // Fix diff as a GitHub suggestion block when possible
  if (finding.fixDiff) {
    // If the fixDiff looks like it contains replacement code (not a full diff),
    // wrap it in a suggestion block.
    if (
      !finding.fixDiff.startsWith("---") &&
      !finding.fixDiff.startsWith("@@")
    ) {
      parts.push("```suggestion");
      parts.push(finding.fixDiff);
      parts.push("```");
    } else {
      parts.push("**Suggested fix:**");
      parts.push("```diff");
      parts.push(finding.fixDiff);
      parts.push("```");
    }
  }

  return parts.join("\n");
}

/**
 * Convert findings into GitHub review comments, filtering to only files
 * present in the PR.
 */
export function formatAsReviewComments(
  findings: Finding[],
  prFiles: string[],
): GitHubReviewComment[] {
  const prFileSet = new Set(prFiles);
  const comments: GitHubReviewComment[] = [];

  for (const finding of findings) {
    // Only create comments for files that are part of the PR
    if (!prFileSet.has(finding.filePath)) continue;

    comments.push({
      path: finding.filePath,
      line: finding.endLine > 0 ? finding.endLine : finding.startLine,
      side: "RIGHT",
      body: formatCommentBody(finding),
    });
  }

  return comments;
}
