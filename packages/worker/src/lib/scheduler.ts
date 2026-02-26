import { Queue } from "bullmq";
import { logger } from "@carapacesecurity/engine";
import { prisma } from "./prisma.js";

/**
 * Syncs BullMQ repeatable jobs with RepoSettings that have scheduleEnabled=true.
 * Removes repeatables for disabled repos, adds/updates for enabled ones.
 */
export async function syncSchedules(scheduledScanQueue: Queue): Promise<void> {
  const enabledRepos = await prisma.repoSettings.findMany({
    where: { scheduleEnabled: true, scheduleCron: { not: null } },
    include: { repo: { select: { id: true, fullName: true, isActive: true } } },
  });

  // Get current repeatable jobs
  const existingRepeatables = await scheduledScanQueue.getRepeatableJobs();
  const existingKeys = new Map(
    existingRepeatables.map((r) => [r.name, r]),
  );

  const desiredKeys = new Set<string>();

  for (const settings of enabledRepos) {
    if (!settings.repo.isActive) continue;

    const jobName = `scheduled-${settings.repoId}`;
    desiredKeys.add(jobName);

    const existing = existingKeys.get(jobName);
    const cronNeedsUpdate = existing && existing.pattern !== settings.scheduleCron;

    // Remove if cron changed
    if (existing && cronNeedsUpdate) {
      await scheduledScanQueue.removeRepeatableByKey(existing.key);
    }

    // Add if new or cron changed
    if (!existing || cronNeedsUpdate) {
      await scheduledScanQueue.add(
        jobName,
        { repoId: settings.repoId },
        {
          repeat: {
            pattern: settings.scheduleCron!,
            tz: settings.scheduleTimezone,
          },
          jobId: jobName,
        },
      );
    }
  }

  // Remove repeatables for repos that are no longer scheduled
  for (const repeatable of existingRepeatables) {
    if (!desiredKeys.has(repeatable.name)) {
      await scheduledScanQueue.removeRepeatableByKey(repeatable.key);
    }
  }

  logger.info(`[scheduler] Synced ${desiredKeys.size} scheduled scans`);
}
