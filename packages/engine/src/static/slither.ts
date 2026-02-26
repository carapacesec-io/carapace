/**
 * Slither integration — Solidity static analysis.
 *
 * Slither (by Trail of Bits) has 80+ detectors for common Solidity
 * vulnerabilities. We run it on the repo, parse JSON output, and map
 * findings to our schema — filtered to only changed lines.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { Severity } from "../ai/schemas.js";
import type { StaticFinding, ToolRunner, ToolRunnerOptions } from "./types.js";
import { logger } from "../logger.js";

const exec = promisify(execFile);

/** Map Slither impact levels to our severity. */
const IMPACT_MAP: Record<string, Severity> = {
  High: "critical",
  Medium: "high",
  Low: "medium",
  Informational: "info",
  Optimization: "info",
};

/** Map Slither confidence to our confidence. */
const CONFIDENCE_MAP: Record<string, StaticFinding["confidence"]> = {
  High: "high",
  Medium: "medium",
  Low: "low",
};

/** Map Slither detector names to human-readable categories. */
function detectorCategory(detectorId: string): string {
  const securityDetectors = new Set([
    "reentrancy-eth", "reentrancy-no-eth", "reentrancy-benign", "reentrancy-events",
    "suicidal", "unprotected-upgrade", "arbitrary-send-erc20", "arbitrary-send-eth",
    "controlled-delegatecall", "controlled-array-length", "tx-origin",
    "unchecked-transfer", "unchecked-lowlevel", "unchecked-send",
    "msg-value-loop", "delegatecall-loop", "reentrancy-unlimited-gas",
  ]);
  const gasDetectors = new Set([
    "constable-states", "external-function", "immutable-states",
    "var-read-using-this",
  ]);
  if (securityDetectors.has(detectorId)) return "security";
  if (gasDetectors.has(detectorId)) return "performance";
  return "quality";
}

/** Map well-known Slither detector IDs to our rule IDs. */
function mapRuleId(detectorId: string): string {
  const map: Record<string, string> = {
    "reentrancy-eth": "sol-reentrancy",
    "reentrancy-no-eth": "sol-reentrancy",
    "reentrancy-benign": "sol-reentrancy",
    "reentrancy-unlimited-gas": "sol-reentrancy",
    "tx-origin": "sol-tx-origin",
    "controlled-delegatecall": "sol-delegatecall-safety",
    "unchecked-transfer": "sol-unchecked-return",
    "unchecked-lowlevel": "sol-unchecked-return",
    "unchecked-send": "sol-unchecked-return",
    "arbitrary-send-erc20": "sol-access-control",
    "arbitrary-send-eth": "sol-access-control",
    "unprotected-upgrade": "sol-access-control",
    "suicidal": "sol-access-control",
  };
  return map[detectorId] ?? `slither-${detectorId}`;
}

interface SlitherResult {
  success: boolean;
  error: string | null;
  results?: {
    detectors?: SlitherDetector[];
  };
}

interface SlitherDetector {
  check: string;
  impact: string;
  confidence: string;
  description: string;
  elements: SlitherElement[];
  first_markdown_element?: string;
  markdown?: string;
}

interface SlitherElement {
  type: string;
  name: string;
  source_mapping: {
    filename_relative: string;
    filename_absolute: string;
    lines: number[];
    starting_column: number;
    ending_column: number;
  };
  type_specific_fields?: Record<string, unknown>;
}

function isInChangedLines(
  filePath: string,
  lines: number[],
  changedLineRanges: Record<string, [number, number][]>,
): boolean {
  const ranges = changedLineRanges[filePath];
  if (!ranges) return false;
  return lines.some((line) =>
    ranges.some(([start, end]) => line >= start && line <= end),
  );
}

export const slitherRunner: ToolRunner = {
  name: "slither",

  async isAvailable(): Promise<boolean> {
    try {
      await exec("slither", ["--version"], { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  },

  isRelevant(changedFiles: string[]): boolean {
    return changedFiles.some(
      (f) => f.endsWith(".sol") || f.endsWith(".vy"),
    );
  },

  async run(options: ToolRunnerOptions): Promise<StaticFinding[]> {
    const { repoPath, changedFiles, changedLineRanges, timeout = 120_000 } = options;

    // Find Solidity files in the changed set
    const solFiles = changedFiles.filter((f) => f.endsWith(".sol"));
    if (solFiles.length === 0) return [];

    // Run Slither on the repo root (it finds contracts automatically)
    let stdout: string;
    try {
      const result = await exec(
        "slither",
        [
          repoPath,
          "--json", "-",
          "--exclude-informational",
          "--exclude-optimization",
          "--exclude-low",
          "--no-fail",
        ],
        {
          timeout,
          maxBuffer: 50 * 1024 * 1024, // 50MB
          cwd: repoPath,
        },
      );
      stdout = result.stdout;
    } catch (err: unknown) {
      // Slither exits non-zero when it finds issues — that's expected
      const execErr = err as { stdout?: string; stderr?: string };
      if (execErr.stdout) {
        stdout = execErr.stdout;
      } else {
        logger.error(`[slither] Execution failed: ${execErr.stderr ?? err}`);
        return [];
      }
    }

    // Parse JSON output
    let parsed: SlitherResult;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      logger.error("[slither] Failed to parse JSON output");
      return [];
    }

    if (!parsed.results?.detectors) return [];

    // Map to our findings format, filtering to changed lines only
    const findings: StaticFinding[] = [];

    for (const detector of parsed.results.detectors) {
      // Find the primary element in a changed file
      const relevantElement = detector.elements.find((el) => {
        const relPath = el.source_mapping.filename_relative;
        return (
          solFiles.includes(relPath) &&
          isInChangedLines(relPath, el.source_mapping.lines, changedLineRanges)
        );
      });

      if (!relevantElement) continue;

      const mapping = relevantElement.source_mapping;
      const lines = mapping.lines;
      const startLine = Math.min(...lines);
      const endLine = Math.max(...lines);

      findings.push({
        tool: "slither",
        ruleId: mapRuleId(detector.check),
        severity: IMPACT_MAP[detector.impact] ?? "medium",
        category: detectorCategory(detector.check),
        title: `[Slither] ${detector.check.replace(/-/g, " ")}`,
        description: detector.description.trim(),
        filePath: mapping.filename_relative,
        startLine,
        endLine,
        codeSnippet: "",
        suggestion: "",
        fixDiff: "",
        confidence: CONFIDENCE_MAP[detector.confidence] ?? "medium",
      });
    }

    return findings;
  },
};
