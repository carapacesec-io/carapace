import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logger } from "@carapace/engine";

const updateAutoFixSchema = z.object({
  autoFix: z.boolean().optional(),
  autoFixPR: z.boolean().optional(),
  autoFixCategories: z.array(z.string()).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const repo = await prisma.repo.findUnique({
      where: { id },
      include: { settings: true },
    });

    if (!repo || repo.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const fixPRs = await prisma.fixPR.findMany({
      where: { repoId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return NextResponse.json({
      autoFix: repo.settings?.autoFix ?? false,
      autoFixPR: repo.settings?.autoFixPR ?? false,
      autoFixCategories: repo.settings?.autoFixCategories ?? [],
      fixPRs,
    });
  } catch (error) {
    logger.error(`Failed to get auto-fix settings: ${(error as Error).message}`);
    return NextResponse.json(
      { error: "Failed to get auto-fix settings" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const repo = await prisma.repo.findUnique({ where: { id } });
    if (!repo || repo.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateAutoFixSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { autoFix, autoFixPR, autoFixCategories } = parsed.data;

    const updateData: Record<string, unknown> = {};
    if (autoFix !== undefined) updateData.autoFix = autoFix;
    if (autoFixPR !== undefined) updateData.autoFixPR = autoFixPR;
    if (autoFixCategories !== undefined) updateData.autoFixCategories = autoFixCategories;

    const settings = await prisma.repoSettings.upsert({
      where: { repoId: id },
      update: updateData,
      create: {
        repoId: id,
        ...updateData,
      },
    });

    return NextResponse.json({
      autoFix: settings.autoFix,
      autoFixPR: settings.autoFixPR,
      autoFixCategories: settings.autoFixCategories,
    });
  } catch (error) {
    logger.error(`Failed to update auto-fix settings: ${(error as Error).message}`);
    return NextResponse.json(
      { error: "Failed to update auto-fix settings" },
      { status: 500 },
    );
  }
}
