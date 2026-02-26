import { describe, it, expect } from "vitest";
import { generateMarkdownReport } from "../markdown-report.js";
import { computeScore } from "../../scoring.js";
import type { Finding } from "../../ai/schemas.js";

function makeFinding(
  overrides: Partial<Finding> & { severity: Finding["severity"] },
): Finding {
  return {
    category: "security",
    title: "Test Finding",
    description: "A test finding description",
    filePath: "src/app.ts",
    startLine: 10,
    endLine: 15,
    codeSnippet: "const x = 1;",
    suggestion: "Fix it",
    fixDiff: "",
    ruleId: "gen-security",
    ...overrides,
  };
}

describe("generateMarkdownReport", () => {
  it("includes executive summary section", () => {
    const findings: Finding[] = [];
    const score = computeScore(findings);
    const report = generateMarkdownReport(findings, score);
    expect(report).toContain("## Executive Summary");
    expect(report).toContain("100/100 (A)");
  });

  it("includes OWASP Top 10 Coverage section", () => {
    const findings: Finding[] = [];
    const score = computeScore(findings);
    const report = generateMarkdownReport(findings, score);
    expect(report).toContain("## OWASP Top 10 Coverage");
    expect(report).toContain("A01:2021");
    expect(report).toContain("A10:2021");
    expect(report).toContain("Broken Access Control");
    expect(report).toContain("Server-Side Request Forgery");
  });

  it("all 10 OWASP categories show Pass for zero findings", () => {
    const findings: Finding[] = [];
    const score = computeScore(findings);
    const report = generateMarkdownReport(findings, score);
    const passCount = (report.match(/\| Pass \|/g) ?? []).length;
    expect(passCount).toBe(10);
  });

  it("includes Findings by Severity section with findings", () => {
    const findings = [
      makeFinding({ severity: "critical", title: "SQL Injection", ruleId: "atk-sqli" }),
      makeFinding({ severity: "high", title: "XSS", ruleId: "atk-xss" }),
    ];
    const score = computeScore(findings);
    const report = generateMarkdownReport(findings, score);
    expect(report).toContain("## Findings by Severity");
    expect(report).toContain("### Critical (1)");
    expect(report).toContain("### High (1)");
    expect(report).toContain("SQL Injection");
    expect(report).toContain("XSS");
  });

  it("includes CWE tags in findings", () => {
    const findings = [
      makeFinding({ severity: "critical", title: "SQL Injection", ruleId: "atk-sqli" }),
    ];
    const score = computeScore(findings);
    const report = generateMarkdownReport(findings, score);
    expect(report).toContain("CWE-89");
  });

  it("includes OWASP tags in findings", () => {
    const findings = [
      makeFinding({ severity: "critical", title: "SQL Injection", ruleId: "atk-sqli" }),
    ];
    const score = computeScore(findings);
    const report = generateMarkdownReport(findings, score);
    expect(report).toContain("A03:2021-Injection");
  });

  it("includes Remediation Priorities section", () => {
    const findings = [
      makeFinding({ severity: "critical", title: "Critical Bug", ruleId: "atk-sqli" }),
      makeFinding({ severity: "medium", title: "Medium Issue", ruleId: "atk-no-rate-limiting" }),
    ];
    const score = computeScore(findings);
    const report = generateMarkdownReport(findings, score);
    expect(report).toContain("## Remediation Priorities");
    expect(report).toContain("1.");
    expect(report).toContain("2.");
  });

  it("skips remediation section when no actionable findings", () => {
    const findings = [
      makeFinding({ severity: "info", title: "Info Only", ruleId: "gen-code-quality" }),
    ];
    const score = computeScore(findings);
    const report = generateMarkdownReport(findings, score);
    expect(report).not.toContain("## Remediation Priorities");
  });

  it("uses provided project name and timestamp", () => {
    const findings: Finding[] = [];
    const score = computeScore(findings);
    const report = generateMarkdownReport(findings, score, {
      projectName: "MyApp",
      timestamp: "2026-02-20T00:00:00Z",
    });
    expect(report).toContain("# Security Report: MyApp");
    expect(report).toContain("2026-02-20T00:00:00Z");
  });

  it("accepts Date object for timestamp", () => {
    const findings: Finding[] = [];
    const score = computeScore(findings);
    const date = new Date("2026-01-15T12:00:00Z");
    const report = generateMarkdownReport(findings, score, {
      timestamp: date,
    });
    expect(report).toContain("2026-01-15T12:00:00.000Z");
  });

  it("includes severity count table in executive summary", () => {
    const findings = [
      makeFinding({ severity: "critical", ruleId: "atk-sqli" }),
      makeFinding({ severity: "high", ruleId: "atk-xss" }),
      makeFinding({ severity: "high", ruleId: "atk-ssrf" }),
    ];
    const score = computeScore(findings);
    const report = generateMarkdownReport(findings, score);
    expect(report).toContain("| Critical | 1 |");
    expect(report).toContain("| High | 2 |");
    expect(report).toContain("| Medium | 0 |");
  });

  it("shows OWASP Warn/Fail status for findings with OWASP mappings", () => {
    const findings = [
      makeFinding({ severity: "critical", ruleId: "atk-sqli" }),
      makeFinding({ severity: "critical", ruleId: "atk-xss" }),
      makeFinding({ severity: "critical", ruleId: "atk-command-injection" }),
    ];
    const score = computeScore(findings);
    const report = generateMarkdownReport(findings, score);
    // 3 injection findings → A03 should show Fail
    expect(report).toContain("A03:2021 Injection | 3 | Fail |");
  });

  it("ends with Carapace attribution", () => {
    const report = generateMarkdownReport([], computeScore([]));
    expect(report).toContain("Carapace Security Engine");
  });
});
