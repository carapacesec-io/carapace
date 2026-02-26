import type { Finding, ReviewResult, SecurityScoreOutput } from "@carapace/engine";
import { generateMarkdownReport, computeScore, getCweOwasp } from "@carapace/engine";

// ANSI escape codes — no dependencies needed
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";
const CYAN = "\x1b[36m";
const BG_RED = "\x1b[41m";
const BG_GREEN = "\x1b[42m";
const BG_YELLOW = "\x1b[43m";
const BG_BLUE = "\x1b[44m";
const WHITE = "\x1b[37m";

function c(color: string, text: string): string {
  return `${color}${text}${RESET}`;
}

function severityColor(severity: string): string {
  switch (severity) {
    case "critical": return BG_RED + WHITE;
    case "high": return RED;
    case "medium": return YELLOW;
    case "low": return BLUE;
    case "info": return DIM;
    default: return DIM;
  }
}

function severityBadge(severity: string): string {
  const label = severity.toUpperCase().padEnd(8);
  return c(severityColor(severity), ` ${label} `);
}

function gradeColor(grade: string): string {
  switch (grade) {
    case "A": return BG_GREEN + WHITE;
    case "B": return BG_BLUE + WHITE;
    case "C": return BG_YELLOW + WHITE;
    default: return BG_RED + WHITE;
  }
}

export interface FormatOptions {
  format: "table" | "json" | "markdown";
  noColor?: boolean;
}

export function formatResult(
  findings: Finding[],
  score: SecurityScoreOutput,
  options: FormatOptions,
): string {
  switch (options.format) {
    case "json":
      return formatJson(findings, score);
    case "markdown":
      return formatMarkdown(findings, score);
    case "table":
    default:
      return formatTable(findings, score);
  }
}

function formatJson(findings: Finding[], score: SecurityScoreOutput): string {
  return JSON.stringify({ score, findings }, null, 2);
}

function formatMarkdown(findings: Finding[], score: SecurityScoreOutput): string {
  return generateMarkdownReport(findings, score);
}

function formatTable(findings: Finding[], score: SecurityScoreOutput): string {
  const lines: string[] = [];

  // Score header
  lines.push("");
  lines.push(c(CYAN, "  ╔══════════════════════════════════════════╗"));
  lines.push(c(CYAN, "  ║") + c(BOLD, "          VEX SECURITY REPORT            ") + c(CYAN, "║"));
  lines.push(c(CYAN, "  ╚══════════════════════════════════════════╝"));
  lines.push("");

  // Score display
  const badge = c(gradeColor(score.grade), ` ${score.grade} `);
  lines.push(`  Score: ${c(BOLD, String(score.score))}${DIM}/100${RESET}  Grade: ${badge}`);
  lines.push("");

  // Breakdown bar
  const counts = score.breakdown;
  const parts: string[] = [];
  if (counts.critical > 0) parts.push(c(BG_RED + WHITE, ` CRITICAL ${counts.critical} `));
  if (counts.high > 0) parts.push(c(RED, `HIGH ${counts.high}`));
  if (counts.medium > 0) parts.push(c(YELLOW, `MEDIUM ${counts.medium}`));
  if (counts.low > 0) parts.push(c(DIM, `LOW ${counts.low}`));
  if (counts.info > 0) parts.push(c(DIM, `INFO ${counts.info}`));

  if (parts.length > 0) {
    lines.push(`  ${parts.join("  ")}`);
    lines.push("");
  }

  if (findings.length === 0) {
    lines.push(c(GREEN, "  No issues found."));
    lines.push("");
    return lines.join("\n");
  }

  // Group by severity
  const grouped = new Map<string, Finding[]>();
  for (const f of findings) {
    const sev = f.severity;
    if (!grouped.has(sev)) grouped.set(sev, []);
    grouped.get(sev)!.push(f);
  }

  const order = ["critical", "high", "medium", "low", "info"];
  for (const sev of order) {
    const group = grouped.get(sev);
    if (!group || group.length === 0) continue;

    lines.push(c(BOLD, `  ${sev.toUpperCase()} (${group.length})`));
    lines.push("");

    for (const f of group) {
      lines.push(`  ${severityBadge(f.severity)} ${c(BOLD, f.title)}`);
      if (f.filePath) {
        const loc = f.startLine ? `${f.filePath}:${f.startLine}` : f.filePath;
        lines.push(`              ${c(DIM, loc)}`);
      }
      if (f.description) {
        lines.push(`              ${f.description}`);
      }
      if (f.ruleId) {
        const mapping = getCweOwasp(f.ruleId);
        const tags: string[] = [];
        if (f.ruleId) tags.push(c(DIM, f.ruleId));
        if (mapping) {
          if (mapping.cweIds.length > 0) tags.push(c(MAGENTA, mapping.cweIds.join(", ")));
          if (mapping.owaspCategory) tags.push(c(CYAN, mapping.owaspCategory));
        }
        if (tags.length > 0) lines.push(`              ${tags.join("  ")}`);
      }
      lines.push("");
    }
  }

  lines.push(c(DIM, "  ─".repeat(22)));
  lines.push(`  ${findings.length} finding${findings.length === 1 ? "" : "s"} total`);
  lines.push("");

  return lines.join("\n");
}

export function formatRulesTable(
  rules: Array<{ id: string; name: string; severity: string; enabled: boolean }>,
): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(c(CYAN, "  ╔══════════════════════════════════════════╗"));
  lines.push(c(CYAN, "  ║") + c(BOLD, "             VEX RULES                  ") + c(CYAN, "║"));
  lines.push(c(CYAN, "  ╚══════════════════════════════════════════╝"));
  lines.push("");

  // Header
  const idW = 30;
  const nameW = 28;
  const sevW = 10;
  const cweW = 20;
  const owaspW = 16;

  lines.push(
    `  ${c(BOLD, "ID".padEnd(idW))}${c(BOLD, "NAME".padEnd(nameW))}${c(BOLD, "SEV".padEnd(sevW))}${c(BOLD, "CWE".padEnd(cweW))}${c(BOLD, "OWASP")}`,
  );
  lines.push(`  ${"─".repeat(idW + nameW + sevW + cweW + owaspW)}`);

  for (const rule of rules) {
    const mapping = getCweOwasp(rule.id);
    const cwe = mapping ? mapping.cweIds.slice(0, 2).join(", ") : "-";
    const owasp = mapping?.owaspCategory || "-";
    const sev = c(severityColor(rule.severity), rule.severity.padEnd(sevW));

    lines.push(
      `  ${c(DIM, rule.id.padEnd(idW))}${rule.name.slice(0, nameW - 2).padEnd(nameW)}${sev}${cwe.padEnd(cweW)}${owasp}`,
    );
  }

  lines.push("");
  lines.push(`  ${rules.length} rules total`);
  lines.push("");

  return lines.join("\n");
}
