import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { logger } from "@carapacesecurity/engine";
import { processPRReview } from "./processors/pr-review.js";
import { processFullScan } from "./processors/full-scan.js";
import { processBulkScan } from "./processors/bulk-scan.js";
import { processScheduledScan } from "./processors/scheduled-scan.js";
import { processFixPR } from "./processors/fix-pr.js";
import { processSlackScan } from "./processors/slack-scan.js";
import { syncSchedules } from "./lib/scheduler.js";
import { loadSecrets } from "./bootstrap-secrets.js";

async function main() {
  // Load API keys from Secrets Manager before starting workers
  await loadSecrets();

  const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });

  const prReviewWorker = new Worker("pr-review", processPRReview, {
    connection,
    concurrency: parseInt(process.env.PR_REVIEW_CONCURRENCY ?? "5", 10),
    lockDuration: 600_000,       // 10 min lock
    stalledInterval: 120_000,    // check every 2 min
    maxStalledCount: 2,
    limiter: {
      max: parseInt(process.env.PR_REVIEW_RATE_LIMIT ?? "10", 10),
      duration: 60_000,
    },
  });

  const fullScanWorker = new Worker("full-scan", processFullScan, {
    connection,
    concurrency: parseInt(process.env.FULL_SCAN_CONCURRENCY ?? "2", 10),
    lockDuration: 900_000,       // 15 min lock
    stalledInterval: 120_000,
    maxStalledCount: 2,
  });

  const bulkScanWorker = new Worker("bulk-scan", processBulkScan, {
    connection,
    concurrency: parseInt(process.env.BULK_SCAN_CONCURRENCY ?? "10", 10),
    lockDuration: 1_800_000,     // 30 min lock (bulk can be long)
    stalledInterval: 300_000,
    maxStalledCount: 2,
  });

  const scheduledScanWorker = new Worker("scheduled-scan", processScheduledScan, {
    connection,
    concurrency: parseInt(process.env.SCHEDULED_SCAN_CONCURRENCY ?? "2", 10),
    lockDuration: 900_000,
    stalledInterval: 120_000,
    maxStalledCount: 2,
  });

  const fixPRWorker = new Worker("fix-pr", processFixPR, {
    connection,
    concurrency: parseInt(process.env.FIX_PR_CONCURRENCY ?? "2", 10),
    lockDuration: 600_000,
    stalledInterval: 120_000,
    maxStalledCount: 2,
  });

  const slackScanWorker = new Worker("slack-scan", processSlackScan, {
    connection,
    concurrency: parseInt(process.env.SLACK_SCAN_CONCURRENCY ?? "3", 10),
    lockDuration: 600_000,
    stalledInterval: 120_000,
    maxStalledCount: 2,
  });

  // schedule-sync queue: used by the web API to trigger a re-sync of repeatable jobs
  const scheduledScanQueue = new Queue("scheduled-scan", {
    connection: { url: process.env.REDIS_URL || "redis://localhost:6379" },
  });

  const scheduleSyncWorker = new Worker(
    "schedule-sync",
    async () => {
      await syncSchedules(scheduledScanQueue);
    },
    { connection, concurrency: 1 },
  );

  prReviewWorker.on("completed", (job) => {
    logger.info(`PR review job ${job.id} completed for scan ${job.data.scanId}`);
  });

  prReviewWorker.on("failed", (job, err) => {
    logger.error(`PR review job ${job?.id} failed:`, err.message);
  });

  fullScanWorker.on("completed", (job) => {
    logger.info(`Full scan job ${job.id} completed for scan ${job.data.scanId}`);
  });

  fullScanWorker.on("failed", (job, err) => {
    logger.error(`Full scan job ${job?.id} failed:`, err.message);
  });

  bulkScanWorker.on("completed", (job) => {
    logger.info(`Bulk scan job ${job.id} completed for scan ${job.data.scanId}`);
  });

  bulkScanWorker.on("failed", (job, err) => {
    logger.error(`Bulk scan job ${job?.id} failed:`, err.message);
  });

  scheduledScanWorker.on("completed", (job) => {
    logger.info(`Scheduled scan job ${job.id} completed for repo ${job.data.repoId}`);
  });

  scheduledScanWorker.on("failed", (job, err) => {
    logger.error(`Scheduled scan job ${job?.id} failed:`, err.message);
  });

  fixPRWorker.on("completed", (job) => {
    logger.info(`Fix PR job ${job.id} completed for scan ${job.data.scanId}`);
  });

  fixPRWorker.on("failed", (job, err) => {
    logger.error(`Fix PR job ${job?.id} failed:`, err.message);
  });

  slackScanWorker.on("completed", (job) => {
    logger.info(`Slack scan job ${job.id} completed for ${job.data.repoFullName}`);
  });

  slackScanWorker.on("failed", (job, err) => {
    logger.error(`Slack scan job ${job?.id} failed:`, err.message);
  });

  scheduleSyncWorker.on("completed", (job) => {
    logger.info(`Schedule sync job ${job.id} completed`);
  });

  scheduleSyncWorker.on("failed", (job, err) => {
    logger.error(`Schedule sync job ${job?.id} failed:`, err.message);
  });

  // Stalled job handlers
  for (const [name, worker] of Object.entries({
    "pr-review": prReviewWorker,
    "full-scan": fullScanWorker,
    "bulk-scan": bulkScanWorker,
    "scheduled-scan": scheduledScanWorker,
    "fix-pr": fixPRWorker,
    "slack-scan": slackScanWorker,
  })) {
    worker.on("stalled", (jobId) => {
      logger.warn(`[${name}] Job ${jobId} stalled — will be retried`);
    });
  }

  // Sync schedules on startup
  try {
    await syncSchedules(scheduledScanQueue);
  } catch (err) {
    logger.error("[scheduler] Initial sync failed:", (err as Error).message);
  }

  logger.info("Carapace worker started");
  logger.info("Listening for pr-review, full-scan, bulk-scan, scheduled-scan, fix-pr, slack-scan, and schedule-sync jobs...");

  async function shutdown() {
    logger.info("Shutting down workers...");
    await prReviewWorker.close();
    await fullScanWorker.close();
    await bulkScanWorker.close();
    await scheduledScanWorker.close();
    await fixPRWorker.close();
    await slackScanWorker.close();
    await scheduleSyncWorker.close();
    await scheduledScanQueue.close();
    await connection.quit();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error("Worker failed to start:", err);
  process.exit(1);
});
