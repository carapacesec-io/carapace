/**
 * Full-codebase scanner.
 *
 * Scans every source file in a project instead of reviewing a diff.
 * Reuses static analysis tools and AI review from the existing engine.
 *
 * Pipeline:
 *   1. Discover all source files (git ls-files or directory walk)
 *   2. Classify each file by language/chain
 *   3. Run static analysis tools on all files (no line-range filtering)
 *   4. Optionally send files to AI for deep review (chunked by token budget)
 *   5. Merge, dedupe, score, return ReviewResult
 */

import { readFileSync } from "node:fs";

import { classifyFile, type FileClassification } from "./parsers/file-classifier.js";
import { AIClient } from "./ai/client.js";
import { getFullFileSystemPrompt } from "./ai/prompts-full.js";
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
import { dedupeFindings } from "./analyzer.js";
import { discoverFiles, type DiscoveredFile } from "./full-scan-discovery.js";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FullScanParams {
  /** Path to the project root to scan. */
  targetPath: string;
  /** Ruleset categories to enable. */
  enabledRulesets?: string[];
  /** Pluggable AI provider. */
  provider?: AIProvider;
  /** API key (creates Anthropic provider if no provider given). */
  apiKey?: string;
  /** Model override. */
  model?: string;
  /** Skip AI analysis, run static tools only. */
  staticOnly?: boolean;
  /** Max files to scan. Default: 500. */
  maxFiles?: number;
  /** Max individual file size in KB. Default: 100. */
  maxFileSizeKB?: number;
  /** Max tokens per AI chunk. Default: 12000. */
  maxChunkTokens?: number;
  /** AI concurrency limit. Defaults to AI_CONCURRENCY env var or 3. */
  aiConcurrency?: number;
}

// ---------------------------------------------------------------------------
// Severity ordering
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function sortFindings(findings: Finding[]): Finding[] {
  return findings.slice().sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    const pathCmp = a.filePath.localeCompare(b.filePath);
    if (pathCmp !== 0) return pathCmp;
    return a.startLine - b.startLine;
  });
}

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
// Token estimation (rough: 1 token ~= 4 chars)
// ---------------------------------------------------------------------------

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

// ---------------------------------------------------------------------------
// Chunk files by token budget
// ---------------------------------------------------------------------------

interface FileChunk {
  files: Array<{ path: string; content: string; classification: FileClassification }>;
  tokenEstimate: number;
}

function chunkFiles(
  files: Array<{ path: string; content: string; classification: FileClassification }>,
  maxTokens: number,
): FileChunk[] {
  const chunks: FileChunk[] = [];
  let current: FileChunk = { files: [], tokenEstimate: 0 };

  for (const file of files) {
    const fileTokens = estimateTokens(file.content);

    // If a single file exceeds the budget, send it alone
    if (fileTokens > maxTokens) {
      if (current.files.length > 0) {
        chunks.push(current);
        current = { files: [], tokenEstimate: 0 };
      }
      chunks.push({ files: [file], tokenEstimate: fileTokens });
      continue;
    }

    // Would adding this file exceed the budget?
    if (current.tokenEstimate + fileTokens > maxTokens) {
      chunks.push(current);
      current = { files: [], tokenEstimate: 0 };
    }

    current.files.push(file);
    current.tokenEstimate += fileTokens;
  }

  if (current.files.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function analyzeFullScan(params: FullScanParams): Promise<ReviewResult> {
  const {
    targetPath,
    enabledRulesets = ["general", "attack", "quality"],
    provider,
    apiKey,
    model,
    staticOnly = false,
    maxFiles = 500,
    maxFileSizeKB = 100,
    maxChunkTokens = 12_000,
    aiConcurrency,
  } = params;

  // 1. Discover files
  logger.info("[full-scan] Discovering files...");
  const discovered = discoverFiles(targetPath, { maxFiles, maxFileSizeKB });

  if (discovered.length === 0) {
    return { findings: [], summary: "No source files found to scan." };
  }

  logger.info(`[full-scan] Found ${discovered.length} source files`);

  // 2. Classify files
  const classifications = new Map<string, FileClassification>();
  for (const df of discovered) {
    classifications.set(df.relativePath, classifyFile(df.relativePath));
  }

  // 3. Run static analysis — pass all files with empty line ranges (no filtering)
  logger.info("[full-scan] Running static analysis...");
  const changedFiles = discovered.map((f) => f.relativePath);
  const changedLineRanges: Record<string, [number, number][]> = {};
  // Empty changedLineRanges = report everything found

  let staticResult: StaticAnalysisResult | null = null;
  try {
    staticResult = await runStaticAnalysis({
      repoPath: targetPath,
      changedFiles,
      changedLineRanges,
    });

    logger.info(
      `[full-scan] Static analysis: ${staticResult.findings.length} findings from [${staticResult.toolsRan.join(", ")}]`,
    );
  } catch (err) {
    logger.error(`[full-scan] Static analysis failed: ${err}`);
  }

  // If static-only or no AI provider, return static findings
  if (staticOnly || (!provider && !apiKey)) {
    const staticFindings = staticResult?.findings ?? [];
    const sorted = sortFindings(staticFindings);
    const enriched = enrichFindings(sorted);
    const score = computeScore(enriched, discovered.length);

    return {
      findings: enriched,
      summary: buildSummary(enriched, discovered.length, staticResult?.toolsRan),
      score,
    };
  }

  // ─── AI ANALYSIS PHASE ─────────────────────────────────────────────

  // 4. Select rules
  const detectedChains = new Set<string>();
  for (const cls of classifications.values()) {
    if (cls.chain) detectedChains.add(cls.chain);
  }

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
    const cweTag = entry.cweIds.length > 0 ? ` [${entry.cweIds.join(", ")}]` : "";
    return `[${r.id}] ${r.name} (${r.severity})${cweTag}: ${r.description}`;
  });

  // 5. Build system prompt
  const allClassifications = [...classifications.values()];
  const staticContext = staticResult
    ? formatStaticFindingsForAI(staticResult.rawFindings)
    : "";
  const systemPrompt = getFullFileSystemPrompt(
    allClassifications,
    ruleDescriptions,
    staticContext,
  );

  // 6. Read file contents and chunk by token budget
  const fileContents: Array<{
    path: string;
    content: string;
    classification: FileClassification;
  }> = [];

  for (const df of discovered) {
    try {
      const content = readFileSync(df.absolutePath, "utf-8");
      const cls = classifications.get(df.relativePath)!;
      fileContents.push({ path: df.relativePath, content, classification: cls });
    } catch {
      // unreadable — skip
    }
  }

  const systemPromptTokens = Math.ceil(systemPrompt.length / 3);
  const effectiveBudget = maxChunkTokens - systemPromptTokens - 500;
  const chunks = chunkFiles(fileContents, Math.max(effectiveBudget, 1000));
  logger.info(`[full-scan] Sending ${fileContents.length} files in ${chunks.length} AI chunks`);

  // 7. Send each chunk to AI
  const client = provider
    ? new AIClient(provider)
    : new AIClient(apiKey!, model);
  const aiFindings: Finding[] = [];

  const CONCURRENCY = aiConcurrency ?? parseInt(process.env.AI_CONCURRENCY ?? "3", 10);
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (chunk) => {
        // For single-file chunks, use analyzeFile
        if (chunk.files.length === 1) {
          const f = chunk.files[0];
          return client.analyzeFile({
            systemPrompt,
            filePath: f.path,
            content: f.content,
            classification: f.classification,
            rules: ruleDescriptions,
          });
        }

        // For multi-file chunks, concatenate and use analyzeFile with combined content
        const combined = chunk.files
          .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
          .join("\n\n");
        const firstClassification = chunk.files[0].classification;

        return client.analyzeFile({
          systemPrompt,
          filePath: chunk.files.map((f) => f.path).join(", "),
          content: combined,
          classification: firstClassification,
          rules: ruleDescriptions,
        });
      }),
    );

    for (const findings of batchResults) {
      aiFindings.push(...findings);
    }
  }

  // ─── MERGE PHASE ───────────────────────────────────────────────────

  const staticFindings = staticResult?.findings ?? [];
  const allFindings = [...staticFindings, ...aiFindings];
  const deduped = dedupeFindings(allFindings);
  const sorted = sortFindings(deduped);
  const enriched = enrichFindings(sorted);
  const score = computeScore(enriched, discovered.length);
  const summary = buildSummary(enriched, discovered.length, staticResult?.toolsRan);

  return { findings: enriched, summary, score };
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
    return `Scanned ${fileCount} file${fileCount !== 1 ? "s" : ""}. No issues found.`;
  }

  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.filter((f) => f.severity === "high").length;
  const mediumCount = findings.filter((f) => f.severity === "medium").length;
  const lowCount = findings.filter(
    (f) => f.severity === "low" || f.severity === "info",
  ).length;

  const parts: string[] = [
    `Scanned ${fileCount} files. Found ${findings.length} issue${findings.length !== 1 ? "s" : ""}`,
  ];
  if (criticalCount > 0) parts.push(`${criticalCount} critical`);
  if (highCount > 0) parts.push(`${highCount} high`);
  if (mediumCount > 0) parts.push(`${mediumCount} medium`);
  if (lowCount > 0) parts.push(`${lowCount} low/info`);

  let summary = `${parts.join(", ")}.`;

  if (toolsRan && toolsRan.length > 0) {
    summary += ` Static analysis: ${toolsRan.join(", ")}.`;
  }

  return summary;
}
