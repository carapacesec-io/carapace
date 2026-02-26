import { NextRequest, NextResponse } from "next/server";
import { runUpgrade, logger } from "@carapace/engine";
import { withX402 } from "@/lib/x402-middleware";

async function handleUpgrade(request: NextRequest) {
  try {
    const body = await request.json();
    const { repoUrl, branch, planOnly, staticOnly } = body;

    if (!repoUrl || typeof repoUrl !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'repoUrl' field" },
        { status: 400 },
      );
    }

    // Validate it's a real GitHub URL (strict check)
    let parsed: URL;
    try {
      parsed = new URL(repoUrl);
    } catch {
      return NextResponse.json(
        { error: "Invalid repo URL." },
        { status: 400 },
      );
    }
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "github.com" ||
      !parsed.pathname.match(/^\/[\w.-]+\/[\w.-]+\/?$/)
    ) {
      return NextResponse.json(
        { error: "Invalid repo URL. Must be https://github.com/owner/repo." },
        { status: 400 },
      );
    }

    const result = await runUpgrade({
      repoUrl: repoUrl.endsWith(".git") ? repoUrl : `${repoUrl}.git`,
      branch: branch ?? undefined,
      apiKey: process.env.ANTHROPIC_API_KEY,
      planOnly: planOnly ?? false,
      staticOnly: staticOnly ?? !process.env.ANTHROPIC_API_KEY,
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error(`Upgrade API error: ${(error as Error).message}`);
    return NextResponse.json(
      { error: "Upgrade failed. Check server logs." },
      { status: 500 },
    );
  }
}

const wrappedUpgrade = withX402("$0.05", handleUpgrade);

export async function POST(request: NextRequest) {
  return wrappedUpgrade(request);
}
