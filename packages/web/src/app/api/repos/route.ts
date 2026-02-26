import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logger } from "@carapacesecurity/engine";

const connectRepoSchema = z.object({
  installationId: z.number(),
  githubId: z.number(),
  fullName: z.string(),
  language: z.string().nullable().optional(),
  defaultBranch: z.string().default("main"),
});

const disconnectRepoSchema = z.object({
  repoId: z.string(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const repos = await prisma.repo.findMany({
      where: { userId: session.user.id },
      include: {
        _count: {
          select: { scans: true },
        },
        settings: {
          select: { scheduleEnabled: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(repos);
  } catch (error) {
    logger.error(`Failed to list repos: ${(error as Error).message}`);
    return NextResponse.json(
      { error: "Failed to list repos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = connectRepoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { installationId, githubId, fullName, language, defaultBranch } =
      parsed.data;

    // Check if repo is already connected
    const existing = await prisma.repo.findUnique({
      where: { githubId },
    });

    if (existing) {
      if (existing.userId !== session.user.id) {
        return NextResponse.json(
          { error: "Repository is connected to another account" },
          { status: 409 }
        );
      }

      // Re-activate if previously disconnected
      const repo = await prisma.repo.update({
        where: { githubId },
        data: {
          installationId,
          fullName,
          language: language ?? null,
          defaultBranch,
          isActive: true,
        },
      });

      return NextResponse.json(repo);
    }

    const repo = await prisma.repo.create({
      data: {
        userId: session.user.id,
        installationId,
        githubId,
        fullName,
        language: language ?? null,
        defaultBranch,
      },
    });

    return NextResponse.json(repo, { status: 201 });
  } catch (error) {
    logger.error(`Failed to connect repo: ${(error as Error).message}`);
    return NextResponse.json(
      { error: "Failed to connect repo" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = disconnectRepoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { repoId } = parsed.data;

    const repo = await prisma.repo.findUnique({
      where: { id: repoId },
    });

    if (!repo) {
      return NextResponse.json({ error: "Repo not found" }, { status: 404 });
    }

    if (repo.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.repo.update({
      where: { id: repoId },
      data: { isActive: false },
    });

    return NextResponse.json({ message: "Repo disconnected" });
  } catch (error) {
    logger.error(`Failed to disconnect repo: ${(error as Error).message}`);
    return NextResponse.json(
      { error: "Failed to disconnect repo" },
      { status: 500 }
    );
  }
}
