import { Job, Queue } from "bullmq";
import { logger } from "@carapacesecurity/engine";
import { prisma } from "../lib/prisma.js";
import { processFullScan, type FullScanJobData } from "./full-scan.js";
import { notifyScanCompletion, notifyCriticalFinding } from "../lib/notify.js";

const fixPRQueue = new Queue("fix-pr", {
  connection: { url: process.env.REDIS_URL || "redis://localhost:6379" },
});

export interface ScheduledScanJobData {
  repoId: string;
}

export async function processScheduledScan(job: Job<ScheduledScanJobData>) {
  const { repoId } = job.data;

  const repo = await prisma.repo.findUnique({
    where: { id: repoId },
    include: { settings: true },
  });

  if (!repo || !repo.isActive) {
    logger.info(`[scheduled-scan] Repo ${repoId} not found or inactive, skipping`);
    return;
  }

  const [owner, repoName] = repo.fullName.split("/");

  // Get previous completed scan for drift detection
  const previousScan = await prisma.scan.findFirst({
    where: { repoId, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    select: { score: true },
  });

  // Create scan record
  const scan = await prisma.scan.create({
    data: {
      repoId,
      userId: repo.userId,
      type: "SCHEDULED",
      status: "PENDING",
      branch: repo.defaultBranch,
    },
  });

  // Delegate to processFullScan
  const fullScanJob = {
    data: {
      scanId: scan.id,
      repoId,
      installationId: repo.installationId,
      owner,
      repo: repoName,
      branch: repo.defaultBranch,
    } satisfies FullScanJobData,
  } as Job<FullScanJobData>;

  // Copy job methods needed by processFullScan
  fullScanJob.id = job.id;
  fullScanJob.log = job.log.bind(job);
  fullScanJob.updateProgress = job.updateProgress.bind(job);

  await processFullScan(fullScanJob);

  // Fetch the completed scan with findings for notifications
  const completedScan = await prisma.scan.findUnique({
    where: { id: scan.id },
    include: {
      findings: { select: { severity: true, title: true, filePath: true } },
    },
  });

  if (!completedScan || completedScan.status !== "COMPLETED") return;

  // Update lastScheduledAt
  await prisma.repoSettings.update({
    where: { repoId },
    data: { lastScheduledAt: new Date() },
  });

  // Compute drift
  const drift = previousScan?.score != null && completedScan.score != null
    ? completedScan.score - previousScan.score
    : null;

  const criticalCount = completedScan.findings.filter((f) => f.severity === "CRITICAL").length;
  const highCount = completedScan.findings.filter((f) => f.severity === "HIGH").length;

  const baseUrl = process.env.NEXTAUTH_URL || "https://carapacesec.io";
  const scanUrl = `${baseUrl}/scans/${scan.id}`;

  // Send scan completion notification
  await notifyScanCompletion(repo.userId, {
    repoFullName: repo.fullName,
    score: completedScan.score ?? 0,
    grade: completedScan.grade ?? "?",
    findingsCount: completedScan.findings.length,
    criticalCount,
    highCount,
    drift,
    scanUrl,
  });

  // Send critical finding alerts
  const criticalFindings = completedScan.findings.filter(
    (f) => f.severity === "CRITICAL" || f.severity === "HIGH",
  );
  for (const finding of criticalFindings) {
    await notifyCriticalFinding(repo.userId, {
      repoFullName: repo.fullName,
      title: finding.title,
      severity: finding.severity,
      filePath: finding.filePath,
      scanUrl,
    });
  }

  // Enqueue fix PR job if autoFixPR is enabled and fixable findings exist
  if (repo.settings?.autoFixPR) {
    const fixableCount = await prisma.finding.count({
      where: {
        scanId: scan.id,
        fixDiff: { not: null },
      },
    });

    if (fixableCount > 0) {
      await fixPRQueue.add("fix-pr", { scanId: scan.id, repoId });
      logger.info(`[scheduled-scan] Enqueued fix-pr job for scan ${scan.id} (${fixableCount} fixable findings)`);
    }
  }

  logger.info(
    `[scheduled-scan] ${repo.fullName}: score=${completedScan.score}, grade=${completedScan.grade}, drift=${drift}, findings=${completedScan.findings.length}`,
  );
}
