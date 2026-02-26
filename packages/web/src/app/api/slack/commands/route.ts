import { NextRequest, NextResponse } from "next/server";
import { verifySlackSignature } from "@/lib/slack";
import { slackScanQueue } from "@/lib/queue";

export async function POST(request: NextRequest) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    return NextResponse.json(
      { error: "Slack not configured" },
      { status: 500 }
    );
  }

  const body = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  if (!verifySlackSignature(signingSecret, signature, timestamp, body)) {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  // Parse form-encoded body
  const params = new URLSearchParams(body);
  const command = params.get("command") ?? "";
  const text = (params.get("text") ?? "").trim();
  const responseUrl = params.get("response_url") ?? "";
  const channelId = params.get("channel_id") ?? "";

  if (command !== "/carapace") {
    return NextResponse.json({ text: "Unknown command" });
  }

  // Parse subcommand: "scan owner/repo"
  const parts = text.split(/\s+/);
  const subcommand = parts[0]?.toLowerCase();

  if (subcommand !== "scan" || !parts[1]) {
    return NextResponse.json({
      response_type: "ephemeral" as const,
      text: [
        "*Carapace Slack Commands:*",
        "`/carapace scan owner/repo` — Scan a repository",
        "`/carapace help` — Show this message",
      ].join("\n"),
    });
  }

  const repoFullName = parts[1];

  // Validate repo format
  if (!repoFullName.includes("/")) {
    return NextResponse.json({
      response_type: "ephemeral" as const,
      text: "Please provide the repository in `owner/repo` format.",
    });
  }

  // Enqueue scan job and respond immediately (Slack requires response within 3s)
  await slackScanQueue.add(
    `slack-scan-${repoFullName}`,
    {
      repoFullName,
      responseUrl,
      channelId,
    },
    { removeOnComplete: 100, removeOnFail: 50 }
  );

  return NextResponse.json({
    response_type: "in_channel" as const,
    text: `:mag: Scanning *${repoFullName}*... Results will be posted here shortly.`,
  });
}
