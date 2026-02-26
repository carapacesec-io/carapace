/**
 * Static analysis orchestrator.
 *
 * Runs all available tools in parallel, collects findings, filters to
 * changed lines only, deduplicates, and returns unified results.
 */

import type { Finding } from "../ai/schemas.js";
import type { StaticFinding, ToolRunner, ToolRunnerOptions } from "./types.js";
import { slitherRunner } from "./slither.js";
import { semgrepRunner } from "./semgrep.js";
import { gitleaksRunner } from "./gitleaks.js";
import { patternScannerRunner } from "./pattern-scanner.js";
import { dedupeFindings } from "../analyzer.js";
import { logger } from "../logger.js";

/** All registered tool runners. Pattern scanner always runs first (no external deps). */
const ALL_RUNNERS: ToolRunner[] = [
  patternScannerRunner,
  slitherRunner,
  semgrepRunner,
  gitleaksRunner,
];

export interface StaticAnalysisOptions {
  /** Absolute path to the repository root. */
  repoPath: string;
  /** Files that were changed in the PR (relative paths). */
  changedFiles: string[];
  /** Changed line ranges per file: { "path/to/file.sol": [[10,15], [30,40]] } */
  changedLineRanges: Record<string, [number, number][]>;
  /** Timeout per tool in ms. Defaults to 120000 (2 min). */
  toolTimeout?: number;
}

export interface StaticAnalysisResult {
  /** Findings mapped to our standard Finding schema. */
  findings: Finding[];
  /** Raw findings with tool metadata (for passing context to AI). */
  rawFindings: StaticFinding[];
  /** Which tools ran successfully. */
  toolsRan: string[];
  /** Which tools were skipped (not available or not relevant). */
  toolsSkipped: string[];
  /** Errors encountered. */
  errors: { tool: string; error: string }[];
}

/** Convert a StaticFinding to our standard Finding schema. */
function toFinding(sf: StaticFinding): Finding {
  return {
    severity: sf.severity,
    category: sf.category,
    title: sf.title,
    description: sf.description,
    filePath: sf.filePath,
    startLine: sf.startLine,
    endLine: sf.endLine,
    codeSnippet: sf.codeSnippet,
    suggestion: sf.suggestion,
    fixDiff: sf.fixDiff,
    ruleId: sf.ruleId,
  };
}

/**
 * Run all available static analysis tools in parallel.
 *
 * Returns findings filtered to changed lines only, deduplicated.
 */
export async function runStaticAnalysis(
  options: StaticAnalysisOptions,
): Promise<StaticAnalysisResult> {
  const { repoPath, changedFiles, changedLineRanges, toolTimeout = 120_000 } = options;

  const toolOptions: ToolRunnerOptions = {
    repoPath,
    changedFiles,
    changedLineRanges,
    timeout: toolTimeout,
  };

  const toolsRan: string[] = [];
  const toolsSkipped: string[] = [];
  const errors: { tool: string; error: string }[] = [];
  const allRawFindings: StaticFinding[] = [];

  // Check availability and relevance, then run in parallel
  const runPromises: Promise<void>[] = [];

  for (const runner of ALL_RUNNERS) {
    runPromises.push(
      (async () => {
        // Check if tool is installed
        const available = await runner.isAvailable();
        if (!available) {
          toolsSkipped.push(runner.name);
          return;
        }

        // Check if tool is relevant for these files
        if (!runner.isRelevant(changedFiles)) {
          toolsSkipped.push(runner.name);
          return;
        }

        // Run the tool
        try {
          logger.info(`[static] Running ${runner.name}...`);
          const startTime = Date.now();
          const findings = await runner.run(toolOptions);
          const elapsed = Date.now() - startTime;
          logger.info(
            `[static] ${runner.name} completed in ${elapsed}ms — ${findings.length} findings`,
          );
          toolsRan.push(runner.name);
          allRawFindings.push(...findings);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error(`[static] ${runner.name} failed: ${message}`);
          errors.push({ tool: runner.name, error: message });
        }
      })(),
    );
  }

  await Promise.all(runPromises);

  // Deduplicate
  const deduped = dedupeFindings(allRawFindings);

  // Convert to standard findings
  const findings = deduped.map(toFinding);

  return {
    findings,
    rawFindings: deduped,
    toolsRan,
    toolsSkipped,
    errors,
  };
}

/**
 * Format static findings as context for the AI prompt.
 * This helps the AI understand what static tools already caught,
 * so it can focus on higher-level issues and avoid duplicating.
 */
export function formatStaticFindingsForAI(rawFindings: StaticFinding[]): string {
  if (rawFindings.length === 0) return "";

  const lines: string[] = [
    "## Static Analysis Results",
    "",
    "The following issues were already detected by static analysis tools.",
    "Do NOT duplicate these findings. Instead, focus on higher-level issues",
    "that require reasoning: business logic errors, architectural problems,",
    "crypto-specific patterns, and cross-function/cross-file concerns.",
    "",
  ];

  for (const f of rawFindings) {
    lines.push(
      `- **[${f.tool}] ${f.severity.toUpperCase()}** ${f.filePath}:${f.startLine} — ${f.title}: ${f.description.slice(0, 200)}`,
    );
  }

  lines.push("");
  return lines.join("\n");
}
