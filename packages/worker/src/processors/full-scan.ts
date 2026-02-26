import { Job } from "bullmq";
import { Octokit } from "octokit";
import { createAppAuth } from "@octokit/auth-app";
import { analyze, computeScore } from "@carapacesecurity/engine";
import { readFileSync } from "node:fs";
import { prisma } from "../lib/prisma.js";

function getPrivateKey(): string {
  if (process.env.GITHUB_APP_PRIVATE_KEY) return process.env.GITHUB_APP_PRIVATE_KEY;
  if (process.env.GITHUB_APP_PRIVATE_KEY_PATH) return readFileSync(process.env.GITHUB_APP_PRIVATE_KEY_PATH, "utf-8");
  throw new Error("GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH must be set");
}

export interface FullScanJobData {
  scanId: string;
  repoId: string;
  installationId: number;
  owner: string;
  repo: string;
  branch: string;
}

export async function processFullScan(job: Job<FullScanJobData>) {
  const { scanId, installationId, owner, repo, branch } = job.data;
  const startTime = Date.now();

  try {
    await prisma.scan.update({
      where: { id: scanId },
      data: { status: "RUNNING" },
    });

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

    // Get the latest commit to compare against empty tree
    const { data: commit } = await octokit.rest.repos.getCommit({
      owner,
      repo,
      ref: branch,
      mediaType: { format: "diff" },
    });

    const diffText = commit as unknown as string;

    const repoRecord = await prisma.repo.findUnique({
      where: { id: job.data.repoId },
      include: { settings: true },
    });

    const enabledRulesets = repoRecord?.settings?.enabledRulesets?.length
      ? repoRecord.settings.enabledRulesets
      : ["general", "crypto"];

    const result = await analyze({
      diff: diffText,
      enabledRulesets,
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

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

    const duration = Date.now() - startTime;
    const scoreResult = result.score ?? computeScore(result.findings);
    await prisma.scan.update({
      where: { id: scanId },
      data: {
        status: "COMPLETED",
        summary: result.summary,
        duration,
        score: scoreResult.score,
        grade: scoreResult.grade,
      },
    });

    // Fire-and-forget attestation via internal API
    fetch(`${process.env.NEXTAUTH_URL}/api/internal/attest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CARAPACE_API_KEY}`,
      },
      body: JSON.stringify({
        type: "code-review",
        scanId,
        repoFullName: `${owner}/${repo}`,
        commitSha: branch,
        score: scoreResult.score,
        grade: scoreResult.grade,
        findingCount: result.findings.length,
      }),
    }).catch((err) =>
      console.error("[full-scan] Attestation request failed (non-fatal):", err),
    );

    return { findingsCount: result.findings.length, duration };
  } catch (error) {
    await prisma.scan.update({
      where: { id: scanId },
      data: { status: "FAILED" },
    });
    throw error;
  }
}
