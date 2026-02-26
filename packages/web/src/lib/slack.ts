import crypto from "crypto";

/**
 * Verify that a request came from Slack using the signing secret.
 * See: https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  // Reject requests older than 5 minutes
  const ts = parseInt(timestamp, 10);
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const baseString = `v0:${timestamp}:${body}`;
  const hmac = crypto
    .createHmac("sha256", signingSecret)
    .update(baseString)
    .digest("hex");
  const expected = `v0=${hmac}`;

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: Array<{
    type: string;
    text?: { type: string; text: string; emoji?: boolean };
    url?: string;
  }>;
}

/**
 * Build a Block Kit message for scan results.
 */
export function buildScanResultBlocks(opts: {
  repoFullName: string;
  score: number;
  grade: string;
  findingsCount: number;
  topFindings: Array<{ severity: string; title: string; ruleId: string }>;
  dashboardUrl: string;
}): SlackBlock[] {
  const gradeEmoji =
    opts.grade === "A" || opts.grade === "B"
      ? ":large_green_circle:"
      : opts.grade === "C"
        ? ":large_yellow_circle:"
        : ":red_circle:";

  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${gradeEmoji} *${opts.repoFullName}* — Grade *${opts.grade}* (${opts.score}/100)\n${opts.findingsCount} finding${opts.findingsCount !== 1 ? "s" : ""} detected`,
      },
    },
    { type: "divider" },
  ];

  if (opts.topFindings.length > 0) {
    const findingsText = opts.topFindings
      .slice(0, 5)
      .map(
        (f) =>
          `• \`${f.severity.toUpperCase()}\` ${f.title} _(${f.ruleId})_`
      )
      .join("\n");

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: findingsText },
    });
  }

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "View Full Report", emoji: true },
        url: opts.dashboardUrl,
      },
    ],
  });

  return blocks;
}

/**
 * Post a message to a Slack response URL (for slash command responses).
 */
export async function postToResponseUrl(
  responseUrl: string,
  payload: {
    text: string;
    blocks?: SlackBlock[];
    response_type?: "in_channel" | "ephemeral";
  }
): Promise<void> {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
