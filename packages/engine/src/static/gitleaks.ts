/**
 * Gitleaks integration — secret detection.
 *
 * Scans for hardcoded secrets, API keys, private keys, passwords.
 * Maps findings to our schema, filtered to changed files/lines.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { StaticFinding, ToolRunner, ToolRunnerOptions } from "./types.js";
import { logger } from "../logger.js";

const exec = promisify(execFile);

interface GitleaksResult {
  Description: string;
  StartLine: number;
  EndLine: number;
  StartColumn: number;
  EndColumn: number;
  Match: string;
  Secret: string;
  File: string;
  SymlinkFile: string;
  Commit: string;
  Entropy: number;
  Author: string;
  Email: string;
  Date: string;
  Message: string;
  Tags: string[];
  RuleID: string;
  Fingerprint: string;
}

function isInChangedLines(
  startLine: number,
  endLine: number,
  changedLineRanges: [number, number][],
): boolean {
  return changedLineRanges.some(
    ([rangeStart, rangeEnd]) => startLine <= rangeEnd && endLine >= rangeStart,
  );
}

export const gitleaksRunner: ToolRunner = {
  name: "gitleaks",

  async isAvailable(): Promise<boolean> {
    try {
      await exec("gitleaks", ["version"], { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  },

  isRelevant(_changedFiles: string[]): boolean {
    // Secret detection is always relevant
    return true;
  },

  async run(options: ToolRunnerOptions): Promise<StaticFinding[]> {
    const { repoPath, changedFiles, changedLineRanges, timeout = 60_000 } = options;

    if (changedFiles.length === 0) return [];

    let stdout: string;
    try {
      const result = await exec(
        "gitleaks",
        [
          "detect",
          "--source", repoPath,
          "--report-format", "json",
          "--report-path", "/dev/stdout",
          "--no-git",
          "--no-banner",
        ],
        {
          timeout,
          maxBuffer: 20 * 1024 * 1024,
          cwd: repoPath,
        },
      );
      stdout = result.stdout;
    } catch (err: unknown) {
      // Gitleaks exits 1 when secrets found
      const execErr = err as { stdout?: string; stderr?: string; code?: number };
      if (execErr.stdout) {
        stdout = execErr.stdout;
      } else {
        logger.error(`[gitleaks] Execution failed: ${execErr.stderr ?? err}`);
        return [];
      }
    }

    if (!stdout.trim() || stdout.trim() === "[]") return [];

    let parsed: GitleaksResult[];
    try {
      parsed = JSON.parse(stdout);
    } catch {
      logger.error("[gitleaks] Failed to parse JSON output");
      return [];
    }

    if (!Array.isArray(parsed)) return [];

    const findings: StaticFinding[] = [];
    const changedFileSet = new Set(changedFiles);

    for (const leak of parsed) {
      const relPath = path.relative(repoPath, path.resolve(repoPath, leak.File));

      // Only report secrets in changed files
      if (!changedFileSet.has(relPath)) continue;

      // Only report secrets in changed lines
      const ranges = changedLineRanges[relPath];
      if (ranges && !isInChangedLines(leak.StartLine, leak.EndLine, ranges)) {
        continue;
      }

      // Mask the actual secret in the output
      const maskedSecret =
        leak.Secret.length > 8
          ? `${leak.Secret.slice(0, 4)}${"*".repeat(leak.Secret.length - 8)}${leak.Secret.slice(-4)}`
          : "***";

      findings.push({
        tool: "gitleaks",
        ruleId: `gitleaks-${leak.RuleID}`,
        severity: "critical",
        category: "security",
        title: `[Gitleaks] ${leak.Description}`,
        description: `Hardcoded secret detected: ${leak.Description}. Match: ${maskedSecret}. Remove this secret and rotate the credential immediately.`,
        filePath: relPath,
        startLine: leak.StartLine,
        endLine: leak.EndLine,
        codeSnippet: leak.Match,
        suggestion: "Remove the hardcoded secret. Use environment variables or a secrets manager instead.",
        fixDiff: "",
        confidence: "high",
      });
    }

    return findings;
  },
};
