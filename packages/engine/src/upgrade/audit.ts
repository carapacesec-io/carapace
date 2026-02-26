/**
 * Full codebase auditor.
 *
 * Runs static analysis tools on the entire repo (not just diffs)
 * and produces a comprehensive audit report.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { Severity } from "../ai/schemas.js";
import type { AuditIssue, AuditReport, ProjectSummary } from "./types.js";

const exec = promisify(execFile);

// ── Slither full scan ───────────────────────────────────────────────────

async function runSlitherFullScan(
  repoPath: string,
  solFiles: string[],
): Promise<AuditIssue[]> {
  if (solFiles.length === 0) return [];

  const IMPACT_MAP: Record<string, Severity> = {
    High: "critical", Medium: "high", Low: "medium",
    Informational: "info", Optimization: "info",
  };

  try {
    let stdout: string;
    try {
      const result = await exec("slither", [repoPath, "--json", "-", "--no-fail"], {
        timeout: 180_000,
        maxBuffer: 50 * 1024 * 1024,
        cwd: repoPath,
      });
      stdout = result.stdout;
    } catch (err: any) {
      stdout = err.stdout ?? "";
      if (!stdout) return [];
    }

    const parsed = JSON.parse(stdout);
    const detectors = parsed?.results?.detectors ?? [];

    return detectors.map((d: any) => {
      const el = d.elements?.[0];
      const lines = el?.source_mapping?.lines ?? [0];
      return {
        category: "security" as const,
        severity: IMPACT_MAP[d.impact] ?? ("medium" as Severity),
        title: `[Slither] ${(d.check as string).replace(/-/g, " ")}`,
        description: (d.description as string).trim(),
        filePath: el?.source_mapping?.filename_relative ?? "",
        startLine: Math.min(...lines),
        endLine: Math.max(...lines),
        codeSnippet: "",
        source: "static" as const,
        tool: "slither",
      };
    });
  } catch {
    return [];
  }
}

// ── Semgrep full scan ───────────────────────────────────────────────────

async function runSemgrepFullScan(repoPath: string): Promise<AuditIssue[]> {
  const SEVERITY_MAP: Record<string, Severity> = {
    ERROR: "high", WARNING: "medium", INFO: "low",
  };

  try {
    let stdout: string;
    try {
      const result = await exec(
        "semgrep",
        ["--config", "p/security-audit", "--json", "--timeout", "30", repoPath],
        { timeout: 180_000, maxBuffer: 50 * 1024 * 1024, cwd: repoPath },
      );
      stdout = result.stdout;
    } catch (err: any) {
      stdout = err.stdout ?? "";
      if (!stdout) return [];
    }

    const parsed = JSON.parse(stdout);
    return (parsed.results ?? []).map((m: any) => ({
      category: m.extra?.metadata?.category ?? "security",
      severity: SEVERITY_MAP[m.extra?.severity] ?? ("medium" as Severity),
      title: `[Semgrep] ${m.check_id}`,
      description: m.extra?.message ?? "",
      filePath: path.relative(repoPath, m.path),
      startLine: m.start?.line ?? 0,
      endLine: m.end?.line ?? 0,
      codeSnippet: m.extra?.lines ?? "",
      source: "static" as const,
      tool: "semgrep",
    }));
  } catch {
    return [];
  }
}

// ── Gitleaks full scan ──────────────────────────────────────────────────

async function runGitleaksFullScan(repoPath: string): Promise<AuditIssue[]> {
  try {
    let stdout: string;
    try {
      const result = await exec(
        "gitleaks",
        ["detect", "--source", repoPath, "--report-format", "json", "--report-path", "/dev/stdout", "--no-git", "--no-banner"],
        { timeout: 60_000, maxBuffer: 20 * 1024 * 1024, cwd: repoPath },
      );
      stdout = result.stdout;
    } catch (err: any) {
      stdout = err.stdout ?? "";
      if (!stdout) return [];
    }

    if (!stdout.trim() || stdout.trim() === "[]") return [];

    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((leak: any) => {
      const secret = leak.Secret ?? "";
      const masked = secret.length > 8
        ? `${secret.slice(0, 4)}${"*".repeat(Math.min(secret.length - 8, 20))}${secret.slice(-4)}`
        : "***";

      return {
        category: "security" as const,
        severity: "critical" as Severity,
        title: `[Gitleaks] ${leak.Description ?? "Hardcoded secret"}`,
        description: `Secret detected: ${leak.Description}. Match: ${masked}. Remove and rotate immediately.`,
        filePath: leak.File ?? "",
        startLine: leak.StartLine ?? 0,
        endLine: leak.EndLine ?? 0,
        codeSnippet: leak.Match ?? "",
        source: "static" as const,
        tool: "gitleaks",
      };
    });
  } catch {
    return [];
  }
}

// ── Pattern-based checks (no external tools needed) ─────────────────────

function runPatternChecks(summary: ProjectSummary): AuditIssue[] {
  const issues: AuditIssue[] = [];

  // Check for missing tests
  if (!summary.hasTests) {
    issues.push({
      category: "code-quality" as any,
      severity: "medium",
      title: "No test files detected",
      description: "This project has no test directory or test files. Adding tests improves reliability and makes upgrades safer.",
      filePath: "",
      startLine: 0,
      endLine: 0,
      codeSnippet: "",
      source: "static",
    });
  }

  // Check for missing CI
  if (!summary.hasCI) {
    issues.push({
      category: "code-quality" as any,
      severity: "low",
      title: "No CI/CD configuration detected",
      description: "No GitHub Actions, GitLab CI, or other CI config found. Consider adding CI to automate testing and deployment.",
      filePath: "",
      startLine: 0,
      endLine: 0,
      codeSnippet: "",
      source: "static",
    });
  }

  return issues;
}

// ── Main ────────────────────────────────────────────────────────────────

/**
 * Run a full audit on the entire codebase.
 */
export async function auditCodebase(
  repoPath: string,
  summary: ProjectSummary,
): Promise<AuditReport> {
  const toolsRan: string[] = [];
  const allIssues: AuditIssue[] = [];

  // Determine which tools to run based on detected files
  const solFiles = summary.files.filter((f) => f.language === "solidity").map((f) => f.path);

  // Run tools in parallel
  const toolPromises: Promise<{ tool: string; issues: AuditIssue[] }>[] = [];

  // Slither for Solidity
  if (solFiles.length > 0) {
    toolPromises.push(
      runSlitherFullScan(repoPath, solFiles).then((issues) => ({ tool: "slither", issues })),
    );
  }

  // Semgrep for everything
  toolPromises.push(
    runSemgrepFullScan(repoPath).then((issues) => ({ tool: "semgrep", issues })),
  );

  // Gitleaks for secrets
  toolPromises.push(
    runGitleaksFullScan(repoPath).then((issues) => ({ tool: "gitleaks", issues })),
  );

  const results = await Promise.all(toolPromises);

  for (const { tool, issues } of results) {
    if (issues.length > 0) {
      toolsRan.push(tool);
      allIssues.push(...issues);
    }
  }

  // Pattern-based checks
  allIssues.push(...runPatternChecks(summary));

  // Build stats
  const bySeverity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  for (const issue of allIssues) {
    bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1;
    byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1;
  }

  return {
    issues: allIssues,
    toolsRan,
    stats: {
      totalIssues: allIssues.length,
      bySeverity,
      byCategory,
    },
  };
}
