import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@carapacesecurity/engine";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const repoId = searchParams.get("repoId");

    const where: { userId: string; repoId?: string } = {
      userId: session.user.id,
    };

    if (repoId) {
      // Verify the user owns this repo before filtering
      const repo = await prisma.repo.findUnique({
        where: { id: repoId },
      });

      if (!repo || repo.userId !== session.user.id) {
        return NextResponse.json({ error: "Repo not found" }, { status: 404 });
      }

      where.repoId = repoId;
    }

    const scans = await prisma.scan.findMany({
      where,
      include: {
        repo: {
          select: { fullName: true },
        },
        _count: {
          select: { findings: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(scans);
  } catch (error) {
    logger.error(`Failed to list scans: ${(error as Error).message}`);
    return NextResponse.json(
      { error: "Failed to list scans" },
      { status: 500 }
    );
  }
}
