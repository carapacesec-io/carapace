import { Queue } from "bullmq";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export const reviewQueue = new Queue("pr-review", {
  connection: { url: redisUrl },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: 1000,
    removeOnFail: 500,
  },
});

export const scanQueue = new Queue("full-scan", {
  connection: { url: redisUrl },
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

export const bulkScanQueue = new Queue("bulk-scan", {
  connection: { url: redisUrl },
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: 2000,
    removeOnFail: 1000,
  },
});

export const scheduledScanQueue = new Queue("scheduled-scan", {
  connection: { url: redisUrl },
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

export const fixPRQueue = new Queue("fix-pr", {
  connection: { url: redisUrl },
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

export const slackScanQueue = new Queue("slack-scan", {
  connection: { url: redisUrl },
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const scheduleSyncQueue = new Queue("schedule-sync", {
  connection: { url: redisUrl },
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 10,
    removeOnFail: 10,
  },
});
