import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Admin-only via API key
  const authHeader = request.headers.get("authorization");
  const expectedKey = process.env.CARAPACE_API_KEY;

  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const job = await prisma.bulkScanJob.findUnique({
    where: { id },
    include: {
      scans: {
        select: {
          id: true,
          status: true,
          score: true,
          grade: true,
          duration: true,
          repo: { select: { fullName: true, language: true } },
          _count: { select: { findings: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    name: job.name,
    status: job.status,
    source: job.source,
    totalRepos: job.totalRepos,
    completedRepos: job.completedRepos,
    failedRepos: job.failedRepos,
    progress: job.totalRepos > 0
      ? Math.round(((job.completedRepos + job.failedRepos) / job.totalRepos) * 100)
      : 0,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    scans: job.scans.map((s) => ({
      id: s.id,
      repo: s.repo.fullName,
      language: s.repo.language,
      status: s.status,
      score: s.score,
      grade: s.grade,
      findings: s._count.findings,
      duration: s.duration,
    })),
  });
}
