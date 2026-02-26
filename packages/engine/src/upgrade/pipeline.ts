/**
 * Upgrade pipeline — main orchestrator.
 *
 * Takes a repo URL, runs the full upgrade pipeline:
 * ingest → deps → audit → plan → transform
 */

import { rm } from "node:fs/promises";
import { ingestRepo, readRepoFiles } from "./ingest.js";
import { analyzeDependencies } from "./deps.js";
import { auditCodebase } from "./audit.js";
import { generateUpgradePlan, generateFallbackPlan } from "./planner.js";
import { transformFiles } from "./transformer.js";
import type { UpgradeOptions, UpgradeResult } from "./types.js";
import { logger } from "../logger.js";

/**
 * Run the full upgrade pipeline on a repository.
 */
export async function runUpgrade(options: UpgradeOptions): Promise<UpgradeResult> {
  const startTime = Date.now();
  let repoPath: string | null = null;

  try {
    // ── Phase 1: Ingest ──────────────────────────────────────────────
    logger.info("[upgrade] Phase 1: Ingesting repo...");
    const ingestion = await ingestRepo(options.repoUrl, options.branch);
    repoPath = ingestion.repoPath;
    const summary = ingestion.summary;

    logger.info(
      `[upgrade] Ingested: ${summary.name} — ${summary.totalFiles} files, ${summary.totalLines} lines, ` +
      `ecosystem: ${summary.ecosystem}, framework: ${summary.framework}`,
    );

    // ── Phase 2: Dependencies ────────────────────────────────────────
    logger.info("[upgrade] Phase 2: Analyzing dependencies...");
    const deps = await analyzeDependencies(repoPath, summary.ecosystems);
    logger.info(
      `[upgrade] Dependencies: ${deps.totalDeps} total, ${deps.outdatedCount} outdated, ` +
      `${deps.deprecatedCount} deprecated, ${deps.vulnerableCount} vulnerable`,
    );

    // ── Phase 3: Audit ───────────────────────────────────────────────
    logger.info("[upgrade] Phase 3: Auditing codebase...");
    const audit = await auditCodebase(repoPath, summary);
    logger.info(
      `[upgrade] Audit: ${audit.stats.totalIssues} issues from [${audit.toolsRan.join(", ")}]`,
    );

    // ── Phase 4: Plan ────────────────────────────────────────────────
    logger.info("[upgrade] Phase 4: Generating upgrade plan...");
    let plan;

    const aiSource = options.provider ?? options.apiKey;
    if (aiSource && !options.staticOnly) {
      // AI-powered planning
      plan = await generateUpgradePlan(
        summary,
        deps,
        audit,
        aiSource,
        options.model,
      );
    } else {
      // Fallback: rule-based plan from static data
      plan = generateFallbackPlan(deps, audit);
    }

    logger.info(
      `[upgrade] Plan: ${plan.totalItems} items, ${plan.autoFixableCount} auto-fixable`,
    );

    // If plan-only mode, skip transforms
    if (options.planOnly || !aiSource || options.staticOnly) {
      return {
        project: summary,
        dependencies: deps,
        audit,
        plan,
        transforms: { transforms: [], filesToDelete: [], newFiles: [] },
        duration: Date.now() - startTime,
      };
    }

    // ── Phase 5: Transform ───────────────────────────────────────────
    logger.info("[upgrade] Phase 5: Transforming code...");
    const transforms = await transformFiles(
      repoPath,
      plan,
      summary,
      deps,
      aiSource,
      options.model,
      options.maxTransformFiles ?? 20,
    );

    logger.info(
      `[upgrade] Transforms: ${transforms.transforms.length} files modified, ` +
      `${transforms.filesToDelete.length} deleted, ${transforms.newFiles.length} new`,
    );

    const duration = Date.now() - startTime;
    logger.info(`[upgrade] Complete in ${(duration / 1000).toFixed(1)}s`);

    return {
      project: summary,
      dependencies: deps,
      audit,
      plan,
      transforms,
      duration,
    };
  } finally {
    // Cleanup cloned repo
    if (repoPath) {
      await rm(repoPath, { recursive: true, force: true }).catch(() => {});
    }
  }
}
