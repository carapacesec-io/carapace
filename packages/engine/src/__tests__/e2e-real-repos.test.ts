/**
 * E2E tests — clone real-world intentionally-vulnerable repos and validate
 * that the static scanner catches the bugs they are known to contain.
 *
 * These tests run `analyzeFullScan({ staticOnly: true })` — no AI key needed.
 * They are slow (clone + scan) so we use a generous per-test timeout.
 */

import { describe, it, expect, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { analyzeFullScan } from "../full-scan.js";
import type { Finding, ReviewResult } from "../ai/schemas.js";
import type { Severity } from "../ai/schemas.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cloneRepo(repoUrl: string): string {
  const dir = mkdtempSync(join(tmpdir(), "e2e-repo-"));
  execSync(`git clone --depth 1 ${repoUrl} ${dir}`, {
    stdio: "pipe",
    timeout: 60_000,
  });
  return dir;
}

function cleanupDir(dir: string) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

function ruleIds(findings: Finding[]): string[] {
  return [...new Set(findings.map((f) => f.ruleId))];
}

function severityCounts(findings: Finding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  }
  return counts;
}

function logSummary(name: string, result: ReviewResult) {
  const counts = severityCounts(result.findings);
  const ids = ruleIds(result.findings);
  console.log(`\n── ${name} ──`);
  console.log(`  Findings: ${result.findings.length}`);
  console.log(`  Severity: ${JSON.stringify(counts)}`);
  console.log(`  Rule IDs: ${ids.join(", ")}`);
  if (result.score) {
    console.log(`  Score: ${result.score.score} (${result.score.grade})`);
  }
  console.log(`  Summary: ${result.summary}`);
}

// ---------------------------------------------------------------------------
// Repo configurations — thresholds calibrated against actual scan results
// ---------------------------------------------------------------------------

interface RepoConfig {
  name: string;
  url: string;
  /** Expected rule IDs — at least one of these must fire. */
  expectedRules: string[];
  /** Minimum total findings. */
  minFindings: number;
  /** Expected to have at least one finding at these severity levels. */
  expectedSeverities: Severity[];
  /** Must have at least this many distinct severity levels. */
  minDistinctSeverities: number;
  /** Max files to scan (keeps test fast). */
  maxFiles: number;
}

const REPOS: RepoConfig[] = [
  {
    name: "juice-shop",
    url: "https://github.com/juice-shop/juice-shop.git",
    expectedRules: [
      "cp-sec-sql-injection",
      "cp-sec-hardcoded-secret",
      "cp-sec-insecure-random",
      "cp-sec-md5-sha1",
      "cp-sec-http-no-tls",
    ],
    minFindings: 50,
    expectedSeverities: ["critical", "high"],
    minDistinctSeverities: 4,
    maxFiles: 300,
  },
  {
    name: "DVWA",
    url: "https://github.com/digininja/DVWA.git",
    expectedRules: [
      "cp-sec-php-sqli",
      "cp-sec-php-file-include",
      "cp-sec-hardcoded-secret",
      "cp-sec-eval",
      "cp-sec-xss-innerhtml",
    ],
    minFindings: 50,
    expectedSeverities: ["critical", "high"],
    minDistinctSeverities: 4,
    maxFiles: 300,
  },
  {
    name: "WebGoat",
    url: "https://github.com/WebGoat/WebGoat.git",
    expectedRules: [
      "cp-sec-java-sqli",
      "cp-sec-java-deserialization",
      "cp-sec-hardcoded-secret",
      "cp-sec-http-no-tls",
    ],
    minFindings: 20,
    expectedSeverities: ["critical", "medium"],
    minDistinctSeverities: 3,
    maxFiles: 300,
  },
  {
    name: "crAPI",
    url: "https://github.com/OWASP/crAPI.git",
    expectedRules: [
      "cp-sec-hardcoded-secret",
      "cp-sec-http-no-tls",
      "cp-sec-hardcoded-ip",
    ],
    minFindings: 50,
    expectedSeverities: ["critical"],
    minDistinctSeverities: 2,
    maxFiles: 300,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("E2E: Real public repos", () => {
  const tmpDirs: string[] = [];

  afterAll(() => {
    for (const dir of tmpDirs) {
      cleanupDir(dir);
    }
  });

  for (const repo of REPOS) {
    it(`detects known vulnerabilities in ${repo.name}`, { timeout: 120_000 }, async () => {
      // 1. Clone
      console.log(`Cloning ${repo.name}...`);
      const dir = cloneRepo(repo.url);
      tmpDirs.push(dir);

      // 2. Scan
      console.log(`Scanning ${repo.name} (maxFiles: ${repo.maxFiles})...`);
      const result = await analyzeFullScan({
        targetPath: dir,
        staticOnly: true,
        maxFiles: repo.maxFiles,
      });

      logSummary(repo.name, result);

      // 3. Basic structure assertions
      expect(result).toBeDefined();
      expect(result.findings).toBeDefined();
      expect(Array.isArray(result.findings)).toBe(true);
      expect(result.summary).toBeTruthy();

      // 4. Minimum findings threshold
      expect(result.findings.length).toBeGreaterThanOrEqual(repo.minFindings);

      // 5. At least one expected rule ID fires
      const foundRules = ruleIds(result.findings);
      const matchedRules = repo.expectedRules.filter((r) =>
        foundRules.includes(r),
      );
      expect(
        matchedRules.length,
        `Expected at least one of [${repo.expectedRules.join(", ")}] to fire in ${repo.name}, ` +
          `but only found: [${foundRules.join(", ")}]`,
      ).toBeGreaterThanOrEqual(1);

      // 6. Specific severity levels present
      const counts = severityCounts(result.findings);
      for (const sev of repo.expectedSeverities) {
        expect(
          counts[sev] ?? 0,
          `Expected at least one ${sev}-severity finding in ${repo.name}`,
        ).toBeGreaterThanOrEqual(1);
      }

      // 7. Severity distribution — not all one level
      const distinctSeverities = Object.keys(counts).length;
      expect(
        distinctSeverities,
        `Expected at least ${repo.minDistinctSeverities} distinct severity levels in ${repo.name}`,
      ).toBeGreaterThanOrEqual(repo.minDistinctSeverities);

      // 8. Score exists and is low for a vulnerable app
      if (result.score) {
        expect(result.score.score).toBeLessThanOrEqual(90);
        expect(result.score.score).toBeGreaterThanOrEqual(0);
      }

      // 9. No crash — if we got here, the scanner handled all files without throwing
    });
  }
});
