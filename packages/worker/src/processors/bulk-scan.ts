import { Job } from "bullmq";
import { analyzeFullScan, logger } from "@carapacesecurity/engine";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { prisma } from "../lib/prisma.js";

const exec = promisify(execFile);

export interface BulkScanJobData {
  scanId: string;
  repoFullName: string;
  defaultBranch: string;
  bulkScanJobId: string;
  totalRepos: number;
}

export async function processBulkScan(job: Job<BulkScanJobData>) {
  const { scanId, repoFullName, defaultBranch, bulkScanJobId, totalRepos } = job.data;
  const startTime = Date.now();
  let repoPath: string | null = null;

  try {
    await prisma.scan.update({
      where: { id: scanId },
      data: { status: "RUNNING" },
    });

    // Mark job as RUNNING if it's still PENDING
    await prisma.bulkScanJob.updateMany({
      where: { id: bulkScanJobId, status: "PENDING" },
      data: { status: "RUNNING" },
    });

    // Shallow clone
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "carapace-bulk-"));
    repoPath = tmpDir;

    const token = process.env.GITHUB_BULK_SCAN_PAT;
    const cloneUrl = token
      ? `https://x-access-token:${token}@github.com/${repoFullName}.git`
      : `https://github.com/${repoFullName}.git`;

    await exec(
      "git",
      ["clone", "--depth", "1", "--branch", defaultBranch, cloneUrl, tmpDir],
      { timeout: 120_000, maxBuffer: 100 * 1024 * 1024 },
    );

    // Run static-only full scan
    const result = await analyzeFullScan({
      targetPath: tmpDir,
      staticOnly: true,
      enabledRulesets: ["general", "crypto", "quality"],
    });

    // Store findings
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

    // Update scan as completed
    const duration = Date.now() - startTime;
    const score = result.score?.score ?? 100;
    const grade = result.score?.grade ?? "A";

    await prisma.scan.update({
      where: { id: scanId },
      data: {
        status: "COMPLETED",
        summary: result.summary,
        duration,
        score,
        grade,
      },
    });

    // Fire-and-forget attestation
    if (process.env.NEXTAUTH_URL && process.env.CARAPACE_API_KEY) {
      fetch(`${process.env.NEXTAUTH_URL}/api/internal/attest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.CARAPACE_API_KEY}`,
        },
        body: JSON.stringify({
          type: "code-review",
          scanId,
          repoFullName,
          commitSha: defaultBranch,
          score,
          grade,
          findingCount: result.findings.length,
        }),
      }).catch((err) =>
        logger.error("[bulk-scan] Attestation request failed (non-fatal):", err),
      );
    }

    // Update bulk job progress
    const updated = await prisma.bulkScanJob.update({
      where: { id: bulkScanJobId },
      data: { completedRepos: { increment: 1 } },
    });

    // Check if job is done
    if (updated.completedRepos + updated.failedRepos >= totalRepos) {
      await prisma.bulkScanJob.update({
        where: { id: bulkScanJobId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }

    return { findingsCount: result.findings.length, duration, score, grade };
  } catch (error) {
    // Mark scan as failed
    await prisma.scan.update({
      where: { id: scanId },
      data: { status: "FAILED" },
    });

    // Increment failed count on bulk job
    const updated = await prisma.bulkScanJob.update({
      where: { id: bulkScanJobId },
      data: { failedRepos: { increment: 1 } },
    });

    // Check if job is done
    if (updated.completedRepos + updated.failedRepos >= totalRepos) {
      await prisma.bulkScanJob.update({
        where: { id: bulkScanJobId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }

    throw error;
  } finally {
    if (repoPath) {
      await rm(repoPath, { recursive: true, force: true }).catch(() => {});
    }
  }
}
