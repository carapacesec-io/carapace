/**
 * Semgrep integration — polyglot static analysis.
 *
 * Runs Semgrep with our custom crypto rules + community security packs.
 * Parses JSON output and maps to our Finding schema.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { Severity } from "../ai/schemas.js";
import type { StaticFinding, ToolRunner, ToolRunnerOptions } from "./types.js";
import { logger } from "../logger.js";

const exec = promisify(execFile);

/** Map Semgrep severity to ours. */
const SEVERITY_MAP: Record<string, Severity> = {
  ERROR: "high",
  WARNING: "medium",
  INFO: "low",
};

function isInChangedLines(
  line: number,
  changedLineRanges: [number, number][],
): boolean {
  return changedLineRanges.some(([start, end]) => line >= start && line <= end);
}

interface SemgrepResult {
  results: SemgrepMatch[];
  errors: unknown[];
}

interface SemgrepMatch {
  check_id: string;
  path: string;
  start: { line: number; col: number };
  end: { line: number; col: number };
  extra: {
    message: string;
    severity: string;
    metadata?: {
      category?: string;
      confidence?: string;
      cwe?: string[];
      fix?: string;
      references?: string[];
    };
    fix?: string;
    lines: string;
  };
}

/** Our custom Semgrep rules for crypto security. */
export function getSemgrepRulesYaml(): string {
  return `rules:
  # ─── Solidity: Reentrancy ───
  - id: cc-sol-reentrancy-external-call-before-state
    patterns:
      - pattern: |
          (bool $SUCCESS, ) = $ADDR.call{value: $AMT}($DATA);
          ...
          $STATE[$KEY] -= $VAL;
      - pattern-not-inside: |
          function $F(...) ... nonReentrant ...{ ... }
    message: "External call before state update — classic reentrancy pattern. Move state update before the .call()."
    languages: [solidity]
    severity: ERROR
    metadata:
      category: security
      confidence: HIGH

  # ─── Solidity: tx.origin for auth ───
  - id: cc-sol-tx-origin-auth
    patterns:
      - pattern: require(tx.origin == $ADDR, ...)
      - pattern: |
          if (tx.origin != $ADDR) { ... }
    message: "Using tx.origin for authorization is unsafe — vulnerable to phishing attacks. Use msg.sender instead."
    languages: [solidity]
    severity: ERROR
    metadata:
      category: security
      confidence: HIGH

  # ─── Solidity: Unchecked low-level call ───
  - id: cc-sol-unchecked-call
    patterns:
      - pattern: $ADDR.call{...}(...);
      - pattern-not: (bool $S, ) = $ADDR.call{...}(...);
    message: "Return value of low-level .call() is not checked. This can silently fail."
    languages: [solidity]
    severity: ERROR
    metadata:
      category: security
      confidence: HIGH

  # ─── Solidity: Unprotected selfdestruct ───
  - id: cc-sol-unprotected-selfdestruct
    pattern: selfdestruct($ADDR)
    message: "selfdestruct found — ensure this function has proper access control."
    languages: [solidity]
    severity: ERROR
    metadata:
      category: security
      confidence: MEDIUM

  # ─── Solidity: Unsafe delegatecall ───
  - id: cc-sol-unsafe-delegatecall
    pattern: $ADDR.delegatecall(...)
    message: "delegatecall to potentially untrusted address. Verify the target is a known, trusted contract."
    languages: [solidity]
    severity: ERROR
    metadata:
      category: security
      confidence: MEDIUM

  # ─── Solidity: Block.timestamp manipulation ───
  - id: cc-sol-timestamp-dependence
    patterns:
      - pattern: require(block.timestamp $OP $VAL, ...)
    message: "Reliance on block.timestamp can be manipulated by miners within ~15s. Avoid for critical time checks."
    languages: [solidity]
    severity: WARNING
    metadata:
      category: security
      confidence: MEDIUM

  # ─── General: Hardcoded private key ───
  - id: cc-gen-hardcoded-private-key
    patterns:
      - pattern-regex: "(0x)?[0-9a-fA-F]{64}"
      - metavariable-regex:
          metavariable: $0
          regex: "(private|secret|key|priv|sk).*=.*(0x)?[0-9a-fA-F]{64}"
    message: "Possible hardcoded private key detected. Never commit private keys to source control."
    languages: [generic]
    severity: ERROR
    metadata:
      category: security
      confidence: MEDIUM

  # ─── TypeScript/JS: eval usage ───
  - id: cc-gen-eval-usage
    pattern: eval(...)
    message: "Use of eval() is a code injection risk. Use safer alternatives."
    languages: [javascript, typescript]
    severity: ERROR
    metadata:
      category: security
      confidence: HIGH

  # ─── TypeScript/JS: SQL injection ───
  - id: cc-gen-sql-injection
    patterns:
      - pattern: $DB.query(\`...\${$INPUT}...\`)
      - pattern: $DB.query("..." + $INPUT + "...")
    message: "Potential SQL injection — user input is concatenated into a query string. Use parameterized queries."
    languages: [javascript, typescript]
    severity: ERROR
    metadata:
      category: security
      confidence: MEDIUM

  # ─── Python: subprocess shell=True ───
  - id: cc-gen-subprocess-shell
    pattern: subprocess.call(..., shell=True, ...)
    message: "subprocess with shell=True is vulnerable to command injection. Use shell=False with a list of arguments."
    languages: [python]
    severity: ERROR
    metadata:
      category: security
      confidence: HIGH

  # ─── Solidity: Floating pragma ───
  - id: cc-sol-floating-pragma
    pattern-regex: "pragma solidity \\^"
    message: "Floating pragma detected. Pin the Solidity version for production deployments (e.g., pragma solidity 0.8.24)."
    languages: [solidity]
    severity: WARNING
    metadata:
      category: quality
      confidence: HIGH

  # ─── Solidity: Missing zero-address check ───
  - id: cc-sol-missing-zero-check
    patterns:
      - pattern: |
          function $F(..., address $ADDR, ...) ... {
            ...
          }
      - pattern-not-inside: |
          require($ADDR != address(0), ...);
    message: "No zero-address validation on address parameter. Add a require($ADDR != address(0)) check."
    languages: [solidity]
    severity: WARNING
    metadata:
      category: security
      confidence: LOW
`;
}

export const semgrepRunner: ToolRunner = {
  name: "semgrep",

  async isAvailable(): Promise<boolean> {
    try {
      await exec("semgrep", ["--version"], { timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  },

  isRelevant(_changedFiles: string[]): boolean {
    // Semgrep works for any language
    return true;
  },

  async run(options: ToolRunnerOptions): Promise<StaticFinding[]> {
    const { repoPath, changedFiles, changedLineRanges, timeout = 120_000 } = options;

    if (changedFiles.length === 0) return [];

    // Write custom rules to a temp file
    const tmpDir = path.join(os.tmpdir(), `codecleaner-semgrep-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    const rulesPath = path.join(tmpDir, "rules.yaml");
    await writeFile(rulesPath, getSemgrepRulesYaml(), "utf-8");

    // Build target file list (only scan changed files)
    const targetFiles = changedFiles.map((f) => path.join(repoPath, f));

    try {
      let stdout: string;
      try {
        const result = await exec(
          "semgrep",
          [
            "--config", rulesPath,
            "--config", "p/security-audit",
            "--json",
            "--no-git-ignore",
            "--timeout", "30",
            ...targetFiles,
          ],
          {
            timeout,
            maxBuffer: 50 * 1024 * 1024,
            cwd: repoPath,
          },
        );
        stdout = result.stdout;
      } catch (err: unknown) {
        // Semgrep exits non-zero when it finds issues
        const execErr = err as { stdout?: string; stderr?: string };
        if (execErr.stdout) {
          stdout = execErr.stdout;
        } else {
          logger.error(`[semgrep] Execution failed: ${execErr.stderr ?? err}`);
          return [];
        }
      }

      let parsed: SemgrepResult;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        logger.error("[semgrep] Failed to parse JSON output");
        return [];
      }

      const findings: StaticFinding[] = [];

      for (const match of parsed.results) {
        // Get relative path
        const relPath = path.relative(repoPath, match.path);

        // Filter to changed lines only
        const ranges = changedLineRanges[relPath];
        if (ranges && !isInChangedLines(match.start.line, ranges)) {
          continue;
        }

        const ruleId = match.check_id.startsWith("cc-")
          ? match.check_id
          : `semgrep-${match.check_id}`;

        findings.push({
          tool: "semgrep",
          ruleId,
          severity: SEVERITY_MAP[match.extra.severity] ?? "medium",
          category: match.extra.metadata?.category ?? "security",
          title: `[Semgrep] ${match.check_id}`,
          description: match.extra.message,
          filePath: relPath,
          startLine: match.start.line,
          endLine: match.end.line,
          codeSnippet: match.extra.lines ?? "",
          suggestion: match.extra.fix ?? "",
          fixDiff: "",
          confidence: (match.extra.metadata?.confidence?.toLowerCase() as StaticFinding["confidence"]) ?? "medium",
        });
      }

      return findings;
    } finally {
      // Cleanup temp rules
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  },
};
