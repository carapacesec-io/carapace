import { Job } from "bullmq";
import { Octokit } from "octokit";
import { createAppAuth } from "@octokit/auth-app";
import { applyFixes, logger, type FileFixInput } from "@carapace/engine";
import { readFileSync } from "node:fs";
import { prisma } from "../lib/prisma.js";
import { commitFixes } from "../github/commit-fixes.js";

function getPrivateKey(): string {
  if (process.env.GITHUB_APP_PRIVATE_KEY) return process.env.GITHUB_APP_PRIVATE_KEY;
  if (process.env.GITHUB_APP_PRIVATE_KEY_PATH) return readFileSync(process.env.GITHUB_APP_PRIVATE_KEY_PATH, "utf-8");
  throw new Error("GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH must be set");
}

export interface FixPRJobData {
  scanId: string;
  repoId: string;
}

export async function processFixPR(job: Job<FixPRJobData>) {
  const { scanId, repoId } = job.data;

  // 1. Load scan with findings (filter to fixDiff non-empty)
  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    include: {
      findings: true,
      repo: { include: { settings: true } },
    },
  });

  if (!scan || !scan.repo) {
    logger.info(`[fix-pr] Scan ${scanId} or repo not found, skipping`);
    return;
  }

  const repo = scan.repo;
  const settings = repo.settings;

  // 2. Filter to fixable findings
  let fixable = scan.findings.filter(
    (f) => f.fixDiff && f.fixDiff.trim().length > 0,
  );

  if (fixable.length === 0) {
    logger.info(`[fix-pr] No fixable findings for scan ${scanId}`);
    return;
  }

  // 3. Filter by autoFixCategories if set
  if (settings?.autoFixCategories && settings.autoFixCategories.length > 0) {
    fixable = fixable.filter((f) =>
      settings.autoFixCategories.includes(f.category),
    );
    if (fixable.length === 0) {
      logger.info(`[fix-pr] No findings matching autoFixCategories for scan ${scanId}`);
      return;
    }
  }

  // 4. Check for existing open carapace fix PRs — skip to avoid PR spam
  const existingFixPR = await prisma.fixPR.findFirst({
    where: { repoId, status: "OPEN" },
  });

  if (existingFixPR) {
    logger.info(`[fix-pr] Open fix PR #${existingFixPR.prNumber} already exists for repo ${repoId}, skipping`);
    return;
  }

  // 5. Get installation Octokit
  const [owner, repoName] = repo.fullName.split("/");

  const appOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: process.env.GITHUB_APP_ID!,
      privateKey: getPrivateKey(),
    },
  });

  const { data: installation } = await appOctokit.rest.apps.createInstallationAccessToken({
    installation_id: repo.installationId,
  });

  const octokit = new Octokit({ auth: installation.token });

  // 6. Fetch file contents from GitHub at HEAD of defaultBranch
  const uniquePaths = [...new Set(fixable.map((f) => f.filePath))];
  const fileInputs: FileFixInput[] = [];

  for (const filePath of uniquePaths) {
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo: repoName,
        path: filePath,
        ref: repo.defaultBranch,
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

  if (fileInputs.length === 0) {
    logger.info(`[fix-pr] Could not fetch file contents for scan ${scanId}`);
    return;
  }

  // 7. Convert DB findings to engine Finding format and apply fixes
  const engineFindings = fixable.map((f) => ({
    severity: f.severity.toLowerCase() as "critical" | "high" | "medium" | "low" | "info",
    category: f.category,
    title: f.title,
    description: f.description,
    filePath: f.filePath,
    startLine: f.startLine ?? 0,
    endLine: f.endLine ?? 0,
    codeSnippet: f.codeSnippet ?? "",
    suggestion: f.suggestion ?? "",
    fixDiff: f.fixDiff ?? "",
    ruleId: f.ruleId ?? "unknown",
  }));

  const fixResult = applyFixes(engineFindings, fileInputs);

  if (fixResult.files.length === 0) {
    logger.info(`[fix-pr] No fixes could be applied for scan ${scanId} (${fixResult.skipped.length} skipped)`);
    return;
  }

  // 8. Get HEAD SHA of default branch
  const { data: refData } = await octokit.rest.git.getRef({
    owner,
    repo: repoName,
    ref: `heads/${repo.defaultBranch}`,
  });
  const baseSha = refData.object.sha;

  // 9. Create branch
  const branchName = `carapace/fix-${scanId.slice(0, 8)}`;
  await octokit.rest.git.createRef({
    owner,
    repo: repoName,
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  });

  // 10. Commit fixes to new branch
  const appliedCount = fixResult.files.reduce(
    (sum, f) => sum + f.appliedFindings.length,
    0,
  );

  await commitFixes({
    octokit,
    owner,
    repo: repoName,
    branch: branchName,
    baseSha,
    files: fixResult.files.map((f) => ({
      path: f.filePath,
      content: f.newContent,
    })),
    message: `fix: auto-fix ${appliedCount} issue(s) across ${fixResult.files.length} file(s) [carapace]`,
  });

  // 11. Build PR body
  const scanDate = scan.createdAt.toISOString().split("T")[0];
  const findingsTable = fixResult.files
    .flatMap((f) =>
      f.appliedFindings.map((finding) => {
        const sev = finding.severity.toUpperCase();
        return `| ${sev} | ${finding.title} | ${finding.filePath} | ${finding.startLine} |`;
      }),
    )
    .join("\n");

  const prBody = [
    "## Carapace Auto-Fix",
    "",
    `Automated fixes from scan on ${scanDate}.`,
    "",
    "| Severity | Issue | File | Line |",
    "|----------|-------|------|------|",
    findingsTable,
    "",
    `**${appliedCount} issue(s) fixed across ${fixResult.files.length} file(s).**`,
    "",
    "> This PR was automatically generated by [Carapace](https://carapacesec.io).",
    "> Review carefully before merging.",
  ].join("\n");

  // 12. Open PR
  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo: repoName,
    title: `Carapace: Auto-fix ${appliedCount} issue(s)`,
    body: prBody,
    head: branchName,
    base: repo.defaultBranch,
  });

  // 13. Save FixPR record
  await prisma.fixPR.create({
    data: {
      repoId,
      scanId,
      prNumber: pr.number,
      prUrl: pr.html_url,
      branch: branchName,
      filesFixed: fixResult.files.length,
      findingsFixed: appliedCount,
      status: "OPEN",
    },
  });

  logger.info(
    `[fix-pr] Created PR #${pr.number} for ${repo.fullName}: ${appliedCount} fixes across ${fixResult.files.length} files`,
  );

  return {
    prNumber: pr.number,
    prUrl: pr.html_url,
    filesFixed: fixResult.files.length,
    findingsFixed: appliedCount,
  };
}
