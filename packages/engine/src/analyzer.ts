/**
 * Main review orchestrator — Hybrid Static + AI Pipeline.
 *
 * Pipeline:
 *   1. Parse the unified diff into structured data
 *   2. Classify each file by language and blockchain chain
 *   3. Run static analysis tools (slither, semgrep, gitleaks) in parallel
 *   4. Select the relevant review rules
 *   5. Build system prompt with static findings as context
 *   6. Chunk the diff to fit within AI context windows
 *   7. Send each chunk to the AI client for analysis
 *   8. Merge static + AI findings, deduplicate, sort by severity
 */

import { parseDiff } from "./parsers/diff-parser.js";
import type { DiffFile } from "./parsers/diff-parser.js";
import { classifyFile, type FileClassification } from "./parsers/file-classifier.js";
import { splitIntoChunks } from "./parsers/chunk-splitter.js";
import { AIClient } from "./ai/client.js";
import { getSystemPrompt } from "./ai/prompts.js";
import { getRulesForChains, getAllRules, type Rule } from "./rules/registry.js";
import type { Finding, ReviewResult, Severity } from "./ai/schemas.js";
import type { AIProvider } from "./ai/provider.js";
import {
  runStaticAnalysis,
  formatStaticFindingsForAI,
  type StaticAnalysisResult,
} from "./static/runner.js";
import { getCweOwasp } from "./rules/cwe-mapping.js";
import { computeScore } from "./scoring.js";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalyzeParams {
  /** Raw unified diff string. */
  diff: string;
  /** Ruleset categories to enable (e.g. ["general", "solidity"]). */
  enabledRulesets: string[];
  /** Explicit chain targets to include rules for. */
  targetChains?: string[];
  /**
   * Pluggable AI provider. Takes precedence over `apiKey`.
   * Use `createProvider()` to build one from env vars.
   */
  provider?: AIProvider;
  /** Anthropic API key. If not provided (and no provider), only static analysis runs. */
  apiKey?: string;
  /** Max tokens per chunk sent to the AI model. Defaults to 12000. */
  maxChunkTokens?: number;
  /** Claude model to use. */
  model?: string;
  /**
   * Absolute path to the checked-out repo for static analysis.
   * If not provided, static analysis is skipped and only AI review runs.
   */
  repoPath?: string;
  /** Whether to skip AI analysis (static-only mode). */
  staticOnly?: boolean;
  /** Whether to skip static analysis (AI-only mode, legacy behavior). */
  skipStatic?: boolean;
  /** AI concurrency limit. Defaults to AI_CONCURRENCY env var or 3. */
  aiConcurrency?: number;
}

// ---------------------------------------------------------------------------
// Severity ordering (for sorting)
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract changed line ranges from parsed diff files.
 * Returns { "path/to/file": [[10,15], [30,40]] }
 */
function extractChangedLineRanges(
  files: DiffFile[],
): Record<string, [number, number][]> {
  const ranges: Record<string, [number, number][]> = {};

  for (const file of files) {
    const fileRanges: [number, number][] = [];

    for (const hunk of file.hunks) {
      let rangeStart = -1;
      let rangeEnd = -1;

      for (const change of hunk.changes) {
        if (change.type === "add") {
          if (rangeStart === -1) {
            rangeStart = change.lineNumber;
            rangeEnd = change.lineNumber;
          } else {
            rangeEnd = change.lineNumber;
          }
        } else {
          if (rangeStart !== -1) {
            fileRanges.push([rangeStart, rangeEnd]);
            rangeStart = -1;
            rangeEnd = -1;
          }
        }
      }

      if (rangeStart !== -1) {
        fileRanges.push([rangeStart, rangeEnd]);
      }
    }

    if (fileRanges.length > 0) {
      ranges[file.path] = fileRanges;
    }
  }

  return ranges;
}

/**
 * Reconstruct file content from a DiffFile's hunks (additions and context
 * lines) to feed into the file classifier for content-based detection.
 */
function reconstructContent(file: DiffFile): string {
  const lines: string[] = [];
  for (const hunk of file.hunks) {
    for (const change of hunk.changes) {
      if (change.type === "add" || change.type === "context") {
        lines.push(change.content);
      }
    }
  }
  return lines.join("\n");
}

/**
 * Serialize a DiffFile back into unified-diff text for the AI prompt.
 */
function serializeFileDiff(file: DiffFile): string {
  const parts: string[] = [`--- a/${file.oldPath}`, `+++ b/${file.path}`];
  for (const hunk of file.hunks) {
    parts.push(
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    );
    for (const change of hunk.changes) {
      const prefix =
        change.type === "add" ? "+" : change.type === "delete" ? "-" : " ";
      parts.push(`${prefix}${change.content}`);
    }
  }
  return parts.join("\n");
}

/**
 * Deduplicate findings by (filePath, startLine, ruleId).
 * Generic — works for both Finding and StaticFinding.
 */
export function dedupeFindings<T extends { filePath: string; startLine: number; ruleId: string; severity: string }>(
  findings: T[],
): T[] {
  const SEVERITY_RANK: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };
  const best = new Map<string, T>();
  for (const f of findings) {
    const key = `${f.filePath}:${f.startLine}:${f.ruleId}`;
    const existing = best.get(key);
    if (!existing || (SEVERITY_RANK[f.severity] ?? 99) < (SEVERITY_RANK[existing.severity] ?? 99)) {
      best.set(key, f);
    }
  }
  return [...best.values()];
}

/**
 * Sort findings by severity (critical first) then by file path and line.
 */
function sortFindings(findings: Finding[]): Finding[] {
  return findings.slice().sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    const pathCmp = a.filePath.localeCompare(b.filePath);
    if (pathCmp !== 0) return pathCmp;
    return a.startLine - b.startLine;
  });
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function analyze(params: AnalyzeParams): Promise<ReviewResult> {
  const {
    diff,
    enabledRulesets,
    targetChains,
    provider,
    apiKey,
    maxChunkTokens = 12_000,
    model,
    repoPath,
    staticOnly = false,
    skipStatic = false,
    aiConcurrency,
  } = params;

  // 1. Parse the diff
  const parsed = parseDiff(diff);
  if (parsed.files.length === 0) {
    return { findings: [], summary: "No files found in the diff." };
  }

  // 2. Classify files
  const classifications: Map<string, FileClassification> = new Map();
  for (const file of parsed.files) {
    const content = reconstructContent(file);
    classifications.set(file.path, classifyFile(file.path, content));
  }

  // 3. Determine chains (from classification + explicit targets)
  const detectedChains = new Set<string>();
  for (const cls of classifications.values()) {
    if (cls.chain) detectedChains.add(cls.chain);
  }
  if (targetChains) {
    for (const chain of targetChains) {
      detectedChains.add(chain);
    }
  }

  // ─── STATIC ANALYSIS PHASE ───────────────────────────────────────────
  let staticResult: StaticAnalysisResult | null = null;

  if (!skipStatic && repoPath) {
    logger.info("[analyzer] Running static analysis...");
    const changedFiles = parsed.files.map((f) => f.path);
    const changedLineRanges = extractChangedLineRanges(parsed.files);

    staticResult = await runStaticAnalysis({
      repoPath,
      changedFiles,
      changedLineRanges,
    });

    logger.info(
      `[analyzer] Static analysis done: ${staticResult.findings.length} findings from [${staticResult.toolsRan.join(", ")}]`,
    );

    if (staticResult.errors.length > 0) {
      for (const err of staticResult.errors) {
        logger.error(`[analyzer] ${err.tool} error: ${err.error}`);
      }
    }
  }

  // If static-only mode, return static findings immediately
  if (staticOnly || (!provider && !apiKey)) {
    const staticFindings = staticResult?.findings ?? [];
    const sorted = sortFindings(staticFindings);
    const enriched = enrichFindings(sorted);
    const score = computeScore(enriched, parsed.files.length);

    return {
      findings: enriched,
      summary: buildSummary(enriched, parsed.files.length, staticResult?.toolsRan),
      score,
    };
  }

  // ─── AI ANALYSIS PHASE ───────────────────────────────────────────────

  // 4. Select rules
  let rules: Rule[];
  if (detectedChains.size > 0) {
    rules = getRulesForChains([...detectedChains]);
  } else {
    rules = getAllRules().filter((r) => !r.chain);
  }

  if (enabledRulesets.length > 0) {
    const enabledSet = new Set(enabledRulesets);
    rules = rules.filter((r) => {
      if (enabledSet.has(r.category)) return true;
      if (r.chain && enabledSet.has(r.chain)) return true;
      if (!r.chain && enabledSet.has("general")) return true;
      return false;
    });
  }

  rules = rules.filter((r) => r.enabled);

  const ruleDescriptions = rules.map((r) => {
    const entry = getCweOwasp(r.id);
    const cweTag =
      entry.cweIds.length > 0 ? ` [${entry.cweIds.join(", ")}]` : "";
    return `[${r.id}] ${r.name} (${r.severity})${cweTag}: ${r.description}`;
  });

  // 5. Build system prompt with static analysis context
  const allClassifications = [...classifications.values()];
  const staticContext = staticResult
    ? formatStaticFindingsForAI(staticResult.rawFindings)
    : "";
  const systemPrompt = getSystemPrompt(
    allClassifications,
    ruleDescriptions,
    staticContext,
  );

  // 6. Chunk the diff (subtract system prompt tokens from budget)
  const systemPromptTokens = Math.ceil(systemPrompt.length / 3);
  const effectiveBudget = maxChunkTokens - systemPromptTokens - 500;
  const chunks = splitIntoChunks(parsed.files, Math.max(effectiveBudget, 1000));

  // 7. Call AI for each chunk (in parallel with concurrency limit)
  const client = provider
    ? new AIClient(provider)
    : new AIClient(apiKey!, model);
  const aiFindings: Finding[] = [];

  const CONCURRENCY = aiConcurrency ?? parseInt(process.env.AI_CONCURRENCY ?? "3", 10);
  let aiFailed = false;
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    try {
      const batchResults = await Promise.all(
        batch.map(async (chunk) => {
          const chunkDiff = chunk.files
            .map((f) => serializeFileDiff(f))
            .join("\n\n");

          const chunkClassifications = chunk.files
            .map((f) => classifications.get(f.path))
            .filter((c): c is FileClassification => c !== undefined);

          return client.analyzeCode({
            systemPrompt,
            diff: chunkDiff,
            fileClassifications: chunkClassifications,
            rules: ruleDescriptions,
          });
        }),
      );

      for (const findings of batchResults) {
        aiFindings.push(...findings);
      }
    } catch (err) {
      logger.error(`[analyzer] AI analysis failed for batch ${i / CONCURRENCY + 1}: ${(err as Error).message}`);
      aiFailed = true;
    }
  }

  if (aiFailed && aiFindings.length === 0) {
    logger.warn("[analyzer] AI analysis failed entirely — returning static findings only");
  }

  // ─── MERGE PHASE ─────────────────────────────────────────────────────

  // 8. Merge static + AI findings
  const staticFindings = staticResult?.findings ?? [];
  const allFindings = [...staticFindings, ...aiFindings];

  // 9. Dedupe and sort
  const deduped = dedupeFindings(allFindings);
  const sorted = sortFindings(deduped);

  // 10. Enrich with CWE/OWASP and compute score
  const enriched = enrichFindings(sorted);
  const score = computeScore(enriched, parsed.files.length);

  // 11. Build summary
  const summary = buildSummary(enriched, parsed.files.length, staticResult?.toolsRan);

  return { findings: enriched, summary, score };
}

// ---------------------------------------------------------------------------
// CWE/OWASP enrichment
// ---------------------------------------------------------------------------

function enrichFindings(findings: Finding[]): Finding[] {
  return findings.map((f) => {
    const entry = getCweOwasp(f.ruleId);
    return {
      ...f,
      cweIds: entry.cweIds.length > 0 ? entry.cweIds : undefined,
      owaspCategory: entry.owaspCategory,
    };
  });
}

// ---------------------------------------------------------------------------
// Summary builder
// ---------------------------------------------------------------------------

function buildSummary(
  findings: Finding[],
  fileCount: number,
  toolsRan?: string[],
): string {
  if (findings.length === 0) {
    return "No issues found. The code changes look good.";
  }

  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.filter((f) => f.severity === "high").length;
  const mediumCount = findings.filter((f) => f.severity === "medium").length;
  const lowCount = findings.filter(
    (f) => f.severity === "low" || f.severity === "info",
  ).length;

  const parts: string[] = [
    `Found ${findings.length} issue${findings.length !== 1 ? "s" : ""}`,
  ];
  if (criticalCount > 0) parts.push(`${criticalCount} critical`);
  if (highCount > 0) parts.push(`${highCount} high`);
  if (mediumCount > 0) parts.push(`${mediumCount} medium`);
  if (lowCount > 0) parts.push(`${lowCount} low/info`);

  let summary = `${parts.join(", ")} across ${fileCount} file${fileCount !== 1 ? "s" : ""}.`;

  if (toolsRan && toolsRan.length > 0) {
    summary += ` Static analysis: ${toolsRan.join(", ")}.`;
  }

  return summary;
}
