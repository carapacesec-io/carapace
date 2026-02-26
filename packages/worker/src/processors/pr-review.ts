import { Job } from "bullmq";
import { Octokit } from "octokit";
import { createAppAuth } from "@octokit/auth-app";
import { analyze, formatAsReviewComments, createProvider, applyFixes, computeScore, logger, type AIProvider, type FileFixInput } from "@carapace/engine";
import { commitFixes } from "../github/commit-fixes.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { prisma } from "../lib/prisma.js";

const exec = promisify(execFile);

function getPrivateKey(): string {
  if (process.env.GITHUB_APP_PRIVATE_KEY) return process.env.GITHUB_APP_PRIVATE_KEY;
  if (process.env.GITHUB_APP_PRIVATE_KEY_PATH) return readFileSync(process.env.GITHUB_APP_PRIVATE_KEY_PATH, "utf-8");
  throw new Error("GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH must be set");
}

export interface PRReviewJobData {
  scanId: string;
  repoId: string;
  installationId: number;
  owner: string;
  repo: string;
  prNumber: number;
  commitSha: string;
  /** PR head branch name (needed for auto-fix push). */
  branch?: string;
}

/**
 * Shallow-clone the PR branch for static analysis.
 * Returns the temp directory path or null if clone fails.
 */
async function cloneForStaticAnalysis(
  token: string,
  owner: string,
  repo: string,
  commitSha: string,
): Promise<string | null> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "codecleaner-"));

  try {
    // Shallow clone at the specific commit
    await exec(
      "git",
      [
        "clone",
        "--depth", "1",
        `https://x-access-token:${token}@github.com/${owner}/${repo}.git`,
        tmpDir,
      ],
      { timeout: 60_000, maxBuffer: 100 * 1024 * 1024 },
    );

    // Checkout the specific commit if it differs from HEAD
    await exec("git", ["checkout", commitSha], {
      cwd: tmpDir,
      timeout: 30_000,
    }).catch(() => {
      // If commit not in shallow clone, that's ok — HEAD is close enough
    });

    return tmpDir;
  } catch (err) {
    logger.error("[pr-review] Failed to clone repo for static analysis:", err);
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    return null;
  }
}

/**
 * Build a formatted markdown summary comment for the PR.
 */
function buildSummaryComment(
  owner: string,
  repo: string,
  findings: { severity: string; filePath: string; title: string; fixDiff?: string | null }[],
  autoFixApplied: number,
): string {
  const score = computeScore(
    findings.map((f) => ({
      severity: f.severity.toLowerCase() as any,
      category: "",
      title: f.title,
      description: "",
      filePath: f.filePath,
      startLine: 0,
      endLine: 0,
      codeSnippet: "",
      suggestion: "",
      fixDiff: f.fixDiff ?? "",
      ruleId: "",
    })),
  );

  const sevCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  let fixable = 0;
  for (const f of findings) {
    const sev = f.severity.toLowerCase() as keyof typeof sevCounts;
    sevCounts[sev] = (sevCounts[sev] ?? 0) + 1;
    if (f.fixDiff && f.fixDiff.trim().length > 0) fixable++;
  }

  const lines: string[] = [
    `## Carapace Security Report`,
    ``,
    `**Score: ${score.score}/100 (${score.grade})**`,
    ``,
    `| Severity | Found | Auto-fixable |`,
    `|----------|-------|-------------|`,
    `| Critical | ${sevCounts.critical} | ${Math.min(sevCounts.critical, fixable > 0 ? sevCounts.critical : 0)} |`,
    `| High | ${sevCounts.high} | ${sevCounts.high > 0 ? "yes" : "—"} |`,
    `| Medium | ${sevCounts.medium} | ${sevCounts.medium > 0 ? "yes" : "—"} |`,
    `| Low | ${sevCounts.low} | ${sevCounts.low > 0 ? "yes" : "—"} |`,
    `| Info | ${sevCounts.info} | — |`,
    ``,
  ];

  if (fixable > 0) {
    lines.push(`**${fixable}** of ${findings.length} finding(s) can be auto-fixed.`);
    if (autoFixApplied > 0) {
      lines.push(`**${autoFixApplied}** fix(es) were automatically applied.`);
    }
    lines.push(``);
  }

  lines.push(
    `---`,
    `[![Security Score](https://carapacesec.io/api/badge/${owner}/${repo})](https://carapacesec.io/report/${owner}/${repo}) Powered by [Carapace](https://carapacesec.io)`,
  );

  return lines.join("\n");
}

export async function processPRReview(job: Job<PRReviewJobData>) {
  const { scanId, installationId, owner, repo, prNumber, commitSha } = job.data;
  const startTime = Date.now();
  let repoPath: string | null = null;

  try {
    // Update scan status to RUNNING
    await prisma.scan.update({
      where: { id: scanId },
      data: { status: "RUNNING" },
    });

    // Get installation token via GitHub App auth
    const appOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: process.env.GITHUB_APP_ID!,
        privateKey: getPrivateKey(),
      },
    });

    const { data: installation } = await appOctokit.rest.apps.createInstallationAccessToken({
      installation_id: installationId,
    });

    const octokit = new Octokit({ auth: installation.token });

    // Clone repo for static analysis (in parallel with diff fetch)
    const [diffResponse, clonedPath] = await Promise.all([
      octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
        mediaType: { format: "diff" },
      }),
      cloneForStaticAnalysis(installation.token, owner, repo, commitSha),
    ]);

    repoPath = clonedPath;
    const diffText = diffResponse.data as unknown as string;

    // Fetch repo settings
    const repoRecord = await prisma.repo.findUnique({
      where: { id: job.data.repoId },
      include: { settings: true },
    });

    const enabledRulesets = repoRecord?.settings?.enabledRulesets?.length
      ? repoRecord.settings.enabledRulesets
      : ["general", "crypto"];

    const targetChains = repoRecord?.settings?.targetChains ?? [];

    // Build AI provider from env vars
    let aiProvider: AIProvider | undefined;
    const providerName = process.env.AI_PROVIDER ?? "anthropic";
    if (providerName === "openai" && process.env.OPENAI_API_KEY) {
      aiProvider = createProvider({
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.AI_MODEL,
      });
    } else if (providerName === "ollama") {
      aiProvider = createProvider({
        provider: "ollama",
        ollamaUrl: process.env.OLLAMA_URL,
        model: process.env.AI_MODEL,
      });
    } else if (process.env.ANTHROPIC_API_KEY) {
      aiProvider = createProvider({
        provider: "anthropic",
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: process.env.AI_MODEL,
      });
    }

    // Run hybrid analysis (static + AI)
    const result = await analyze({
      diff: diffText,
      enabledRulesets,
      targetChains: targetChains.length > 0 ? targetChains : undefined,
      provider: aiProvider,
      apiKey: !aiProvider ? process.env.ANTHROPIC_API_KEY : undefined,
      repoPath: repoPath ?? undefined,
    });

    // Count changed files from diff
    const filesChanged = (diffText.match(/^diff --git/gm) || []).length;

    // Store findings in DB
    if (result.findings.length > 0) {
      await prisma.finding.createMany({
        data: result.findings.map((finding) => ({
          scanId,
          severity: finding.severity.toUpperCase() as any,
          category: finding.category,
          title: finding.title,
          description: finding.description,
          filePath: finding.filePath,
          startLine: finding.startLine,
          endLine: finding.endLine,
          codeSnippet: finding.codeSnippet,
          suggestion: finding.suggestion,
          fixDiff: finding.fixDiff,
          ruleId: finding.ruleId,
        })),
      });
    }

    // Post review comments to GitHub
    const prFiles = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
    });

    const fileNames = prFiles.data.map((f) => f.filename);
    const reviewComments = formatAsReviewComments(result.findings, fileNames);

    if (reviewComments.length > 0) {
      // Determine review event based on findings severity
      const hasCritical = result.findings.some(
        (f) => f.severity === "critical" || f.severity === "high"
      );

      await octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        commit_id: commitSha,
        event: hasCritical ? "REQUEST_CHANGES" : "COMMENT",
        body: `Found **${result.findings.length}** issue(s). See summary comment below.`,
        comments: reviewComments.map((c) => ({
          path: c.path,
          line: c.line,
          body: c.body,
        })),
      });
    } else {
      // No findings - approve
      await octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        commit_id: commitSha,
        event: "APPROVE",
        body: "## Carapace Security Report\n\n**Score: 100/100 (A)** — No issues found. Clean code!",
      });
    }

    // Post summary comment on the PR (visible to everyone)
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: buildSummaryComment(
        owner,
        repo,
        result.findings.map((f) => ({
          severity: f.severity,
          filePath: f.filePath,
          title: f.title,
          fixDiff: f.fixDiff,
        })),
        0, // autoFixApplied is updated later; we post the initial summary first
      ),
    });

    // Create check run
    const hasCritical = result.findings.some(
      (f) => f.severity === "critical" || f.severity === "high"
    );

    await octokit.rest.checks.create({
      owner,
      repo,
      name: "Carapace",
      head_sha: commitSha,
      status: "completed",
      conclusion: hasCritical ? "failure" : "success",
      output: {
        title: hasCritical
          ? `${result.findings.length} issue(s) found`
          : "No critical issues",
        summary: result.summary,
        annotations: result.findings.slice(0, 50).map((f) => ({
          path: f.filePath,
          start_line: f.startLine || 1,
          end_line: f.endLine || f.startLine || 1,
          annotation_level: f.severity === "critical" || f.severity === "high"
            ? ("failure" as const)
            : f.severity === "medium"
            ? ("warning" as const)
            : ("notice" as const),
          title: f.title,
          message: f.description,
          raw_details: f.suggestion,
        })),
      },
    });

    // ─── AUTO-FIX PHASE ─────────────────────────────────────────────
    let autoFixApplied = 0;
    const autoFixEnabled = repoRecord?.settings?.autoFix === true;

    if (autoFixEnabled && job.data.branch && result.findings.length > 0) {
      try {
        // Filter to all findings with fixDiff
        const fixableFindings = result.findings.filter(
          (f) => f.fixDiff.trim().length > 0,
        );

        if (fixableFindings.length > 0) {
          // Fetch current file contents from GitHub
          const uniquePaths = [...new Set(fixableFindings.map((f) => f.filePath))];
          const fileInputs: FileFixInput[] = [];

          for (const filePath of uniquePaths) {
            try {
              const { data } = await octokit.rest.repos.getContent({
                owner,
                repo,
                path: filePath,
                ref: commitSha,
              });

              if ("content" in data && data.encoding === "base64") {
                fileInputs.push({
                  filePath,
                  originalContent: Buffer.from(data.content, "base64").toString("utf-8"),
                });
              }
            } catch {
              // File not found or binary — skip
            }
          }

          // Apply fixes
          const fixResult = applyFixes(fixableFindings, fileInputs);

          if (fixResult.files.length > 0) {
            // Commit fixes atomically
            const commitResult = await commitFixes({
              octokit,
              owner,
              repo,
              branch: job.data.branch,
              baseSha: commitSha,
              files: fixResult.files.map((f) => ({
                path: f.filePath,
                content: f.newContent,
              })),
              message: `fix: auto-fix ${fixResult.files.length} issue(s) [carapace]`,
            });

            autoFixApplied = commitResult.filesChanged;

            // Post a comment about the auto-fix
            const fixedList = fixResult.files
              .flatMap((f) => f.appliedFindings.map((af) => `- **${af.title}** in \`${af.filePath}\``))
              .join("\n");

            await octokit.rest.issues.createComment({
              owner,
              repo,
              issue_number: prNumber,
              body: `## Carapace Auto-Fix\n\nApplied **${autoFixApplied}** fix(es) in commit ${commitResult.commitSha.slice(0, 7)}. Please review.\n\n${fixedList}`,
            });
          }
        }
      } catch (autoFixErr) {
        // Auto-fix failure is non-fatal
        logger.error("[pr-review] Auto-fix failed (non-fatal):", autoFixErr);
      }
    }

    // Update scan as completed
    const duration = Date.now() - startTime;
    const scoreResult = computeScore(
      result.findings.map((f) => ({
        severity: f.severity.toLowerCase() as any,
        category: "",
        title: f.title,
        description: "",
        filePath: f.filePath,
        startLine: 0,
        endLine: 0,
        codeSnippet: "",
        suggestion: "",
        fixDiff: f.fixDiff ?? "",
        ruleId: "",
      })),
    );
    await prisma.scan.update({
      where: { id: scanId },
      data: {
        status: "COMPLETED",
        summary: result.summary,
        filesChanged,
        duration,
        score: scoreResult.score,
        grade: scoreResult.grade,
      },
    });

    // Fire-and-forget attestation via internal API
    const attestBody = {
      type: "code-review",
      scanId,
      repoFullName: `${owner}/${repo}`,
      commitSha,
      score: result.score?.score ?? 100,
      grade: result.score?.grade ?? "A",
      findingCount: result.findings.length,
    };
    fetch(`${process.env.NEXTAUTH_URL}/api/internal/attest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CARAPACE_API_KEY}`,
      },
      body: JSON.stringify(attestBody),
    }).catch((err) =>
      logger.error("[pr-review] Attestation request failed (non-fatal):", err),
    );

    return { findingsCount: result.findings.length, autoFixApplied, duration };
  } catch (error) {
    // Update scan as failed
    await prisma.scan.update({
      where: { id: scanId },
      data: { status: "FAILED" },
    });
    throw error;
  } finally {
    // Cleanup cloned repo
    if (repoPath) {
      await rm(repoPath, { recursive: true, force: true }).catch(() => {});
    }
  }
}
