import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/repos/:id/timeline
 *
 * Returns score history for a repo — one data point per completed scan.
 * Used by the dashboard sparkline chart.
 */

const DEDUCTIONS: Record<string, number> = {
  CRITICAL: 15,
  HIGH: 8,
  MEDIUM: 3,
  LOW: 1,
  INFO: 0,
};

function computeScore(findings: { severity: string }[]): number {
  let totalDeducted = 0;
  for (const f of findings) {
    totalDeducted += DEDUCTIONS[f.severity] ?? 0;
  }
  return Math.max(0, Math.min(100, 100 - totalDeducted));
}

function computeGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 55) return "D";
  return "F";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership
  const repo = await prisma.repo.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!repo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get all completed scans with findings (last 50)
  const scans = await prisma.scan.findMany({
    where: { repoId: id, status: "COMPLETED" },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      type: true,
      prNumber: true,
      findings: { select: { severity: true } },
    },
  });

  const timeline = scans.map((scan) => {
    const score = computeScore(scan.findings);
    return {
      scanId: scan.id,
      date: scan.createdAt.toISOString(),
      score,
      grade: computeGrade(score),
      findingsCount: scan.findings.length,
      type: scan.type,
      prNumber: scan.prNumber,
    };
  });

  return NextResponse.json({ repoId: id, fullName: repo.fullName, timeline });
}
