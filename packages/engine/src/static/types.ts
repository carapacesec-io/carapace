/**
 * Shared types for static analysis tool integrations.
 */

import type { Severity } from "../ai/schemas.js";

/** A finding produced by a static analysis tool (before mapping to our schema). */
export interface StaticFinding {
  tool: string;
  ruleId: string;
  severity: Severity;
  category: string;
  title: string;
  description: string;
  filePath: string;
  startLine: number;
  endLine: number;
  codeSnippet: string;
  suggestion: string;
  fixDiff: string;
  /** Confidence: "high" = deterministic tool, "medium" = heuristic, "low" = pattern match */
  confidence: "high" | "medium" | "low";
}

/** Options passed to every tool runner. */
export interface ToolRunnerOptions {
  /** Absolute path to the repository root. */
  repoPath: string;
  /** Files that were changed in the PR (relative paths). */
  changedFiles: string[];
  /** Changed line ranges per file: { "path/to/file.sol": [[10,15], [30,40]] } */
  changedLineRanges: Record<string, [number, number][]>;
  /** Timeout in ms for tool execution. */
  timeout?: number;
}

/** Interface that every tool runner must implement. */
export interface ToolRunner {
  /** Tool name (e.g., "slither", "semgrep", "gitleaks"). */
  name: string;
  /** Check if the tool is installed and available. */
  isAvailable(): Promise<boolean>;
  /** Check if this tool is relevant for the given files. */
  isRelevant(changedFiles: string[]): boolean;
  /** Run analysis and return findings. */
  run(options: ToolRunnerOptions): Promise<StaticFinding[]>;
}
