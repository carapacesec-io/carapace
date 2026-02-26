import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@carapacesecurity/engine";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const scan = await prisma.scan.findUnique({
      where: { id },
      include: {
        repo: {
          select: { fullName: true, language: true },
        },
        findings: {
          orderBy: [{ severity: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    if (!scan.userId || scan.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(scan);
  } catch (error) {
    logger.error(`Failed to get scan: ${(error as Error).message}`);
    return NextResponse.json(
      { error: "Failed to get scan" },
      { status: 500 }
    );
  }
}
