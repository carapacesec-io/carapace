/**
 * Markdown security report generator.
 *
 * Produces a standalone markdown document suitable for sharing with a CISO or
 * attaching to a compliance ticket.
 */

import type { Finding, Severity } from "../ai/schemas.js";
import type { SecurityScore } from "../scoring.js";
import type { CweOwaspEntry } from "../rules/cwe-mapping.js";
import { getCweOwasp } from "../rules/cwe-mapping.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReportOptions {
  projectName?: string;
  timestamp?: string | Date;
}

// ---------------------------------------------------------------------------
// OWASP Top 10 (2021) reference list
// ---------------------------------------------------------------------------

const OWASP_TOP_10: { id: string; name: string }[] = [
  { id: "A01:2021", name: "Broken Access Control" },
  { id: "A02:2021", name: "Cryptographic Failures" },
  { id: "A03:2021", name: "Injection" },
  { id: "A04:2021", name: "Insecure Design" },
  { id: "A05:2021", name: "Security Misconfiguration" },
  { id: "A06:2021", name: "Vulnerable and Outdated Components" },
  { id: "A07:2021", name: "Identification and Authentication Failures" },
  { id: "A08:2021", name: "Software and Data Integrity Failures" },
  { id: "A09:2021", name: "Security Logging and Monitoring Failures" },
  { id: "A10:2021", name: "Server-Side Request Forgery" },
];

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Severity[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
];

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a complete markdown security report.
 */
export function generateMarkdownReport(
  findings: Finding[],
  score: SecurityScore,
  options?: ReportOptions,
): string {
  const project = options?.projectName ?? "Project";
  const ts =
    options?.timestamp instanceof Date
      ? options.timestamp.toISOString()
      : options?.timestamp ?? new Date().toISOString();

  const sections: string[] = [];

  sections.push(`# Security Report: ${project}`);
  sections.push("");
  sections.push(`*Generated: ${ts}*`);
  sections.push("");

  // ── Executive Summary ──────────────────────────────────────────────────
  sections.push("## Executive Summary");
  sections.push("");
  sections.push(
    `**Security Score: ${score.score}/100 (${score.grade})**`,
  );
  sections.push("");

  sections.push("| Severity | Count |");
  sections.push("|----------|-------|");
  for (const sev of SEVERITY_ORDER) {
    const count = score.breakdown[sev].count;
    sections.push(`| ${SEVERITY_LABELS[sev]} | ${count} |`);
  }
  sections.push("");

  if (findings.length === 0) {
    sections.push("No issues found. The code changes look good.");
    sections.push("");
  }

  // ── OWASP Top 10 Coverage ─────────────────────────────────────────────
  sections.push("## OWASP Top 10 Coverage");
  sections.push("");

  // Count findings per OWASP category
  const owaspCounts = new Map<string, number>();
  for (const f of findings) {
    const entry: CweOwaspEntry = getCweOwasp(f.ruleId);
    if (entry.owaspCategory) {
      const prefix = entry.owaspCategory.slice(0, 8); // "A01:2021"
      owaspCounts.set(prefix, (owaspCounts.get(prefix) ?? 0) + 1);
    }
  }

  sections.push("| Category | Findings | Status |");
  sections.push("|----------|----------|--------|");
  for (const cat of OWASP_TOP_10) {
    const count = owaspCounts.get(cat.id) ?? 0;
    let status: string;
    if (count === 0) status = "Pass";
    else if (count <= 2) status = "Warn";
    else status = "Fail";
    sections.push(
      `| ${cat.id} ${cat.name} | ${count} | ${status} |`,
    );
  }
  sections.push("");

  // ── Findings by Severity ──────────────────────────────────────────────
  sections.push("## Findings by Severity");
  sections.push("");

  for (const sev of SEVERITY_ORDER) {
    const group = findings.filter((f) => f.severity === sev);
    if (group.length === 0) continue;

    sections.push(`### ${SEVERITY_LABELS[sev]} (${group.length})`);
    sections.push("");

    for (const f of group) {
      const entry = getCweOwasp(f.ruleId);
      const cweTag =
        entry.cweIds.length > 0 ? ` [${entry.cweIds.join(", ")}]` : "";
      const owaspTag = entry.owaspCategory
        ? ` | ${entry.owaspCategory}`
        : "";

      sections.push(`#### ${f.title}${cweTag}${owaspTag}`);
      sections.push("");
      sections.push(`- **Rule:** \`${f.ruleId}\``);
      sections.push(`- **File:** \`${f.filePath}:${f.startLine}\``);
      sections.push(`- **Description:** ${f.description}`);
      if (f.suggestion) {
        sections.push(`- **Suggestion:** ${f.suggestion}`);
      }
      sections.push("");
    }
  }

  // ── Remediation Priorities ────────────────────────────────────────────
  const actionable = findings.filter(
    (f) => f.severity === "critical" || f.severity === "high" || f.severity === "medium",
  );

  if (actionable.length > 0) {
    sections.push("## Remediation Priorities");
    sections.push("");

    let idx = 1;
    for (const f of actionable) {
      const entry = getCweOwasp(f.ruleId);
      const cweTag =
        entry.cweIds.length > 0 ? ` (${entry.cweIds.join(", ")})` : "";
      sections.push(
        `${idx}. **[${SEVERITY_LABELS[f.severity]}]** ${f.title}${cweTag} - \`${f.filePath}:${f.startLine}\``,
      );
      idx++;
    }
    sections.push("");
  }

  sections.push("---");
  sections.push("*Report generated by Carapace Security Engine*");
  sections.push("");

  return sections.join("\n");
}
