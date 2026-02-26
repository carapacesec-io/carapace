import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { submitFeedback, isERC8004Configured } from "@/lib/erc8004";
import { logger } from "@carapace/engine";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { scanId, rating, tags } = body;

  if (!scanId || typeof rating !== "number" || rating < 0 || rating > 100) {
    return NextResponse.json(
      { error: "scanId and rating (0-100) are required" },
      { status: 400 },
    );
  }

  // Verify scan belongs to user and is completed
  const scan = await prisma.scan.findFirst({
    where: { id: scanId, userId: session.user.id, status: "COMPLETED" },
  });

  if (!scan) {
    return NextResponse.json(
      { error: "Scan not found or not completed" },
      { status: 404 },
    );
  }

  // Check for duplicate feedback
  const existing = await prisma.feedback.findFirst({
    where: { userId: session.user.id, scanId },
  });

  if (existing) {
    return NextResponse.json(
      { error: "Feedback already submitted for this scan" },
      { status: 409 },
    );
  }

  const tag1 = tags?.[0] ?? null;
  const tag2 = tags?.[1] ?? null;
  let txHash: string | null = null;

  // Submit on-chain if configured
  const agentId = process.env.ERC8004_AGENT_ID;
  if (isERC8004Configured() && agentId) {
    try {
      txHash = await submitFeedback({
        agentId,
        value: rating,
        tag1: tag1 ?? "",
        tag2: tag2 ?? "",
      });
    } catch (err) {
      logger.error(`[feedback] On-chain submission failed (non-fatal): ${(err as Error).message}`);
    }
  }

  // Store in database
  const feedback = await prisma.feedback.create({
    data: {
      userId: session.user.id,
      scanId,
      rating,
      tag1,
      tag2,
      txHash,
    },
  });

  return NextResponse.json({
    id: feedback.id,
    onChain: !!txHash,
    txHash,
  });
}
