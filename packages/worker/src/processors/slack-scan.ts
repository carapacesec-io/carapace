import type { Job } from "bullmq";
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  patternScannerRunner,
  computeScore,
  discoverFiles,
  type Finding,
} from "@carapacesecurity/engine";

export interface SlackScanJobData {
  repoFullName: string;
  responseUrl: string;
  channelId: string;
}

export async function processSlackScan(
  job: Job<SlackScanJobData>
): Promise<{ score: number; grade: string; findingsCount: number }> {
  const { repoFullName, responseUrl } = job.data;
  const [owner, repo] = repoFullName.split("/");

  // Clone repo to temp dir
  const tmpDir = mkdtempSync(join(tmpdir(), "carapace-slack-"));

  try {
    // Validate owner/repo to prevent injection (alphanumeric, hyphens, dots, underscores only)
    if (!/^[a-zA-Z0-9._-]+$/.test(owner) || !/^[a-zA-Z0-9._-]+$/.test(repo)) {
      throw new Error(`Invalid repository name: ${repoFullName}`);
    }
    execFileSync(
      "git",
      ["clone", "--depth", "1", `https://github.com/${owner}/${repo}.git`, tmpDir],
      { timeout: 60_000, stdio: "pipe" }
    );

    // Discover files
    const files = await discoverFiles({ repoPath: tmpDir });
    const changedFiles = files.map((f) => f.relativePath);

    // Run pattern scanner
    const staticFindings = await patternScannerRunner.run({
      repoPath: tmpDir,
      changedFiles,
      changedLineRanges: {},
    });

    // Compute score
    const engineFindings: Finding[] = staticFindings.map((f) => ({
      severity: f.severity,
      category: f.category,
      title: f.title,
      description: f.description,
      filePath: f.filePath,
      startLine: f.startLine,
      endLine: f.endLine,
      codeSnippet: f.codeSnippet,
      suggestion: f.suggestion,
      fixDiff: f.fixDiff,
      ruleId: f.ruleId,
    }));

    const scoreResult = computeScore(engineFindings, changedFiles.length);

    // Build top 5 findings
    const topFindings = staticFindings
      .sort((a, b) => {
        const sevOrder = ["critical", "high", "medium", "low", "info"];
        return sevOrder.indexOf(a.severity) - sevOrder.indexOf(b.severity);
      })
      .slice(0, 5)
      .map((f) => ({
        severity: f.severity,
        title: f.title.replace("[Pattern] ", ""),
        ruleId: f.ruleId,
      }));

    // Determine message color
    const color =
      scoreResult.grade === "A" || scoreResult.grade === "B"
        ? "#10b981"
        : scoreResult.grade === "C"
          ? "#eab308"
          : "#ef4444";

    const gradeEmoji =
      scoreResult.grade === "A" || scoreResult.grade === "B"
        ? ":large_green_circle:"
        : scoreResult.grade === "C"
          ? ":large_yellow_circle:"
          : ":red_circle:";

    // Build findings text
    const findingsText =
      topFindings.length > 0
        ? topFindings
            .map(
              (f) =>
                `\u2022 \`${f.severity.toUpperCase()}\` ${f.title} _(${f.ruleId})_`
            )
            .join("\n")
        : "_No issues found — code looks clean!_";

    const baseUrl = process.env.NEXTAUTH_URL ?? "https://carapacesec.io";

    // Post results back to Slack
    await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        response_type: "in_channel",
        attachments: [
          {
            color,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `${gradeEmoji} *${repoFullName}* — Grade *${scoreResult.grade}* (${scoreResult.score}/100)\n${staticFindings.length} finding${staticFindings.length !== 1 ? "s" : ""} detected`,
                },
              },
              { type: "divider" },
              {
                type: "section",
                text: { type: "mrkdwn", text: findingsText },
              },
              {
                type: "actions",
                elements: [
                  {
                    type: "button",
                    text: {
                      type: "plain_text",
                      text: "View Full Report",
                      emoji: true,
                    },
                    url: `${baseUrl}/repos`,
                  },
                ],
              },
            ],
          },
        ],
      }),
    });

    return {
      score: scoreResult.score,
      grade: scoreResult.grade,
      findingsCount: staticFindings.length,
    };
  } catch (error) {
    // Post error back to Slack
    await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        response_type: "ephemeral",
        text: `:warning: Failed to scan *${repoFullName}*: ${error instanceof Error ? error.message : "Unknown error"}`,
      }),
    });
    throw error;
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
