import { logger } from "@carapace/engine";
import { prisma } from "./prisma.js";

interface ScanCompletionPayload {
  repoFullName: string;
  score: number;
  grade: string;
  findingsCount: number;
  criticalCount: number;
  highCount: number;
  drift: number | null; // score difference from previous scan
  scanUrl: string;
}

interface CriticalFindingPayload {
  repoFullName: string;
  title: string;
  severity: string;
  filePath: string;
  scanUrl: string;
}

function maskUrl(url: string): string {
  if (url.length <= 8) return "****";
  return "..." + url.slice(-8);
}

async function sendSlack(webhookUrl: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    logger.error("[notify] Slack webhook failed:", (err as Error).message);
  }
}

async function sendDiscord(webhookUrl: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    logger.error("[notify] Discord webhook failed:", (err as Error).message);
  }
}

function driftEmoji(drift: number | null): string {
  if (drift === null) return "";
  if (drift > 0) return ` (+${drift})`;
  if (drift < 0) return ` (${drift})`;
  return " (no change)";
}

function gradeEmoji(grade: string): string {
  if (grade === "A") return ":white_check_mark:";
  if (grade === "B") return ":large_blue_circle:";
  if (grade === "C") return ":warning:";
  if (grade === "D") return ":orange_circle:";
  return ":red_circle:";
}

export async function notifyScanCompletion(
  userId: string,
  payload: ScanCompletionPayload,
): Promise<void> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (!settings?.notifyOnScheduled) return;

  const driftStr = driftEmoji(payload.drift);
  const summary = `*${payload.repoFullName}* — Grade: *${payload.grade}* (${payload.score}/100)${driftStr}\nFindings: ${payload.findingsCount} (${payload.criticalCount} critical, ${payload.highCount} high)`;

  if (settings.slackWebhookUrl) {
    await sendSlack(settings.slackWebhookUrl, {
      text: `${gradeEmoji(payload.grade)} Scheduled Scan Complete`,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: summary },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "View Scan" },
              url: payload.scanUrl,
            },
          ],
        },
      ],
    });
  }

  if (settings.discordWebhookUrl) {
    await sendDiscord(settings.discordWebhookUrl, {
      embeds: [
        {
          title: `Scheduled Scan: ${payload.repoFullName}`,
          description: `**Grade:** ${payload.grade} (${payload.score}/100)${driftStr}\n**Findings:** ${payload.findingsCount} (${payload.criticalCount} critical, ${payload.highCount} high)`,
          color: payload.grade === "A" ? 0x10b981 : payload.grade === "F" ? 0xef4444 : 0xf59e0b,
          url: payload.scanUrl,
        },
      ],
    });
  }
}

export async function notifyCriticalFinding(
  userId: string,
  payload: CriticalFindingPayload,
): Promise<void> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (!settings?.notifyOnCritical) return;

  const text = `:rotating_light: *${payload.severity}* finding in *${payload.repoFullName}*\n*${payload.title}*\nFile: \`${payload.filePath}\``;

  if (settings.slackWebhookUrl) {
    await sendSlack(settings.slackWebhookUrl, {
      text: `${payload.severity} finding in ${payload.repoFullName}`,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "View Scan" },
              url: payload.scanUrl,
            },
          ],
        },
      ],
    });
  }

  if (settings.discordWebhookUrl) {
    await sendDiscord(settings.discordWebhookUrl, {
      embeds: [
        {
          title: `${payload.severity}: ${payload.title}`,
          description: `**Repo:** ${payload.repoFullName}\n**File:** \`${payload.filePath}\``,
          color: payload.severity === "CRITICAL" ? 0xef4444 : 0xf97316,
          url: payload.scanUrl,
        },
      ],
    });
  }
}

export { maskUrl };
