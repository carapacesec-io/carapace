/**
 * AI-powered upgrade planner.
 *
 * Takes the project summary, dependency report, and audit results,
 * and generates a prioritized upgrade plan using AI.
 */

import type {
  ProjectSummary,
  DependencyReport,
  AuditReport,
  UpgradePlan,
  UpgradeItem,
} from "./types.js";
import type { AIProvider } from "../ai/provider.js";

function buildPlannerPrompt(
  summary: ProjectSummary,
  deps: DependencyReport,
  audit: AuditReport,
): string {
  // Summarize project
  const projectInfo = `
## Project: ${summary.name}
- Ecosystem: ${summary.ecosystem} (${summary.framework})
- Files: ${summary.totalFiles} (${summary.totalLines} lines)
- Languages: ${Object.entries(summary.filesByLanguage).map(([k, v]) => `${k}: ${v}`).join(", ")}
- Tests: ${summary.hasTests ? "Yes" : "No"}
- CI/CD: ${summary.hasCI ? "Yes" : "No"}
- Entry points: ${summary.entryPoints.join(", ") || "none detected"}
`;

  // Summarize dependencies
  const depIssues = deps.deps
    .filter((d) => d.isOutdated || d.isDeprecated || d.vulnerabilities.length > 0)
    .slice(0, 30)
    .map((d) => {
      const tags: string[] = [];
      if (d.vulnerabilities.length > 0) tags.push(`${d.vulnerabilities.length} CVE(s)`);
      if (d.isDeprecated) tags.push(`DEPRECATED → ${d.replacement ?? "?"}`);
      if (d.majorsBehind > 0) tags.push(`${d.majorsBehind} major(s) behind`);
      return `- ${d.name}@${d.currentVersion} → ${d.latestVersion} [${tags.join(", ")}]`;
    })
    .join("\n");

  const depSummary = `
## Dependencies (${deps.totalDeps} total)
- Outdated: ${deps.outdatedCount}
- Deprecated: ${deps.deprecatedCount}
- Vulnerable: ${deps.vulnerableCount}

${depIssues || "(all dependencies are up to date)"}
`;

  // Summarize audit
  const auditIssues = audit.issues
    .slice(0, 50)
    .map((i) => `- [${i.severity.toUpperCase()}] ${i.title} — ${i.filePath}:${i.startLine} — ${i.description.slice(0, 150)}`)
    .join("\n");

  const auditSummary = `
## Audit Results (${audit.stats.totalIssues} issues)
- By severity: ${Object.entries(audit.stats.bySeverity).map(([k, v]) => `${k}: ${v}`).join(", ")}
- By category: ${Object.entries(audit.stats.byCategory).map(([k, v]) => `${k}: ${v}`).join(", ")}
- Tools: ${audit.toolsRan.join(", ") || "none"}

${auditIssues || "(no issues found)"}
`;

  return `${projectInfo}\n${depSummary}\n${auditSummary}`;
}

/**
 * Generate an upgrade plan using AI.
 *
 * Accepts either an AIProvider or a legacy apiKey string.
 */
export async function generateUpgradePlan(
  summary: ProjectSummary,
  deps: DependencyReport,
  audit: AuditReport,
  apiKeyOrProvider: string | AIProvider,
  model?: string,
): Promise<UpgradePlan> {
  const context = buildPlannerPrompt(summary, deps, audit);

  const systemPrompt = `You are CodeCleaner Upgrade Planner. You analyze codebases and create prioritized upgrade plans.

Given a project summary, dependency report, and audit results, generate a structured upgrade plan.

RULES:
1. Prioritize: security fixes > vulnerability patches > deprecated deps > modernization > code quality
2. Each item should be specific and actionable
3. Mark items as autoFixable if they can be done mechanically (dep updates, simple pattern replacements)
4. Assess risk honestly — dep major version bumps are "medium" or "high" risk
5. Group related changes (e.g., all dep updates together)
6. Maximum 30 items — focus on what matters most

Respond ONLY with valid JSON matching this schema:
{
  "summary": "2-3 sentence overview of the upgrade strategy",
  "items": [
    {
      "id": "upgrade-001",
      "type": "security-fix" | "dependency-update" | "bug-fix" | "modernization" | "performance" | "code-quality" | "deprecation-fix",
      "priority": 1,
      "severity": "critical" | "high" | "medium" | "low" | "info",
      "title": "Short title",
      "description": "What to do and why",
      "affectedFiles": ["file1.ts", "file2.ts"],
      "risk": "low" | "medium" | "high",
      "effort": "trivial" | "small" | "medium" | "large",
      "autoFixable": true
    }
  ]
}`;

  let text: string;

  if (typeof apiKeyOrProvider === "string") {
    // Legacy path: use Anthropic SDK directly
    const { AnthropicProvider } = await import("../ai/providers/anthropic.js");
    const provider = new AnthropicProvider(apiKeyOrProvider, model);
    const result = await provider.complete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Analyze this project and generate an upgrade plan:\n\n${context}` },
      ],
      maxTokens: 8192,
      model,
    });
    text = result.text;
  } else {
    const result = await apiKeyOrProvider.complete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Analyze this project and generate an upgrade plan:\n\n${context}` },
      ],
      maxTokens: 8192,
      model,
    });
    text = result.text;
  }

  // Strip markdown fences if present
  const jsonStr = text.replace(/^```json?\s*\n?/m, "").replace(/\n?```\s*$/m, "");

  try {
    const parsed = JSON.parse(jsonStr);

    const items: UpgradeItem[] = (parsed.items ?? []).map((item: any, i: number) => ({
      id: item.id ?? `upgrade-${String(i + 1).padStart(3, "0")}`,
      type: item.type ?? "code-quality",
      priority: item.priority ?? i + 1,
      severity: item.severity ?? "medium",
      title: item.title ?? "Unknown upgrade",
      description: item.description ?? "",
      affectedFiles: item.affectedFiles ?? [],
      risk: item.risk ?? "medium",
      effort: item.effort ?? "medium",
      autoFixable: item.autoFixable ?? false,
    }));

    return {
      summary: parsed.summary ?? "Upgrade plan generated.",
      totalItems: items.length,
      items,
      autoFixableCount: items.filter((i) => i.autoFixable).length,
    };
  } catch {
    // Fallback: generate plan from raw data
    return generateFallbackPlan(deps, audit);
  }
}

/**
 * Generate a basic plan without AI (from static analysis + deps only).
 */
export function generateFallbackPlan(
  deps: DependencyReport,
  audit: AuditReport,
): UpgradePlan {
  const items: UpgradeItem[] = [];
  let priority = 1;

  // Security vulnerabilities from deps
  for (const dep of deps.deps.filter((d) => d.vulnerabilities.length > 0)) {
    items.push({
      id: `upgrade-${String(priority).padStart(3, "0")}`,
      type: "security-fix",
      priority: priority++,
      severity: dep.vulnerabilities[0].severity,
      title: `Fix ${dep.vulnerabilities.length} CVE(s) in ${dep.name}`,
      description: `Update ${dep.name} from ${dep.currentVersion} to ${dep.latestVersion} to fix known vulnerabilities.`,
      affectedFiles: ["package.json"],
      risk: "medium",
      effort: "small",
      autoFixable: true,
    });
  }

  // Audit critical/high issues
  for (const issue of audit.issues.filter((i) => i.severity === "critical" || i.severity === "high")) {
    items.push({
      id: `upgrade-${String(priority).padStart(3, "0")}`,
      type: "security-fix",
      priority: priority++,
      severity: issue.severity,
      title: issue.title,
      description: issue.description,
      affectedFiles: issue.filePath ? [issue.filePath] : [],
      risk: "low",
      effort: "small",
      autoFixable: false,
    });
  }

  // Deprecated deps
  for (const dep of deps.deps.filter((d) => d.isDeprecated)) {
    items.push({
      id: `upgrade-${String(priority).padStart(3, "0")}`,
      type: "deprecation-fix",
      priority: priority++,
      severity: "medium",
      title: `Replace deprecated ${dep.name}`,
      description: `${dep.name} is deprecated. ${dep.replacement ? `Replace with ${dep.replacement}.` : "Find an alternative."}`,
      affectedFiles: ["package.json"],
      risk: "medium",
      effort: "medium",
      autoFixable: false,
    });
  }

  // Outdated deps (major versions behind)
  for (const dep of deps.deps.filter((d) => d.majorsBehind >= 2 && !d.isDeprecated)) {
    items.push({
      id: `upgrade-${String(priority).padStart(3, "0")}`,
      type: "dependency-update",
      priority: priority++,
      severity: "low",
      title: `Update ${dep.name} (${dep.majorsBehind} majors behind)`,
      description: `Update ${dep.name} from ${dep.currentVersion} to ${dep.latestVersion}.`,
      affectedFiles: ["package.json"],
      risk: "high",
      effort: "medium",
      autoFixable: false,
    });
  }

  return {
    summary: `Found ${items.length} upgrade items: ${deps.vulnerableCount} security fixes, ${deps.deprecatedCount} deprecated replacements, ${audit.stats.totalIssues} code issues.`,
    totalItems: items.length,
    items: items.slice(0, 30),
    autoFixableCount: items.filter((i) => i.autoFixable).length,
  };
}
