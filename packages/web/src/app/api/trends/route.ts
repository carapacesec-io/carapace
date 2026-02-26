import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DEDUCTIONS: Record<string, number> = {
  CRITICAL: 15,
  HIGH: 8,
  MEDIUM: 3,
  LOW: 1,
  INFO: 0,
};

function calcScore(findings: { severity: string }[]): number {
  let d = 0;
  for (const f of findings) d += DEDUCTIONS[f.severity] ?? 0;
  return Math.max(0, Math.min(100, 100 - d));
}

function calcGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 55) return "D";
  return "F";
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const repos = await prisma.repo.findMany({
    where: { userId: session.user.id },
    include: {
      scans: {
        where: { status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          findings: { select: { severity: true, ruleId: true } },
        },
      },
    },
  });

  // Per-repo timeline
  const repoTimelines = repos.map((repo) => {
    const timeline = [...repo.scans].reverse().map((scan) => {
      const score = scan.score ?? calcScore(scan.findings);
      return {
        date: scan.createdAt.toISOString(),
        score,
        grade: calcGrade(score),
        severityCounts: scan.findings.reduce(
          (acc, f) => {
            acc[f.severity] = (acc[f.severity] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        ),
      };
    });

    const latestScore = timeline.length > 0 ? timeline[timeline.length - 1].score : null;
    const firstScore = timeline.length > 1 ? timeline[0].score : null;
    const scoreDelta =
      latestScore !== null && firstScore !== null
        ? latestScore - firstScore
        : 0;

    return {
      id: repo.id,
      fullName: repo.fullName,
      language: repo.language,
      latestScore,
      latestGrade: latestScore !== null ? calcGrade(latestScore) : null,
      scoreDelta,
      timeline,
    };
  });

  // Portfolio score: weighted average of latest scores
  const reposWithScores = repoTimelines.filter((r) => r.latestScore !== null);
  const portfolioScore =
    reposWithScores.length > 0
      ? Math.round(
          reposWithScores.reduce((sum, r) => sum + r.latestScore!, 0) /
            reposWithScores.length
        )
      : null;
  const portfolioGrade = portfolioScore !== null ? calcGrade(portfolioScore) : null;

  // Biggest movers (by absolute score delta)
  const movers = [...repoTimelines]
    .filter((r) => r.scoreDelta !== 0)
    .sort((a, b) => Math.abs(b.scoreDelta) - Math.abs(a.scoreDelta))
    .slice(0, 5);

  // Top findings (most common rule IDs)
  const ruleIdCounts = new Map<string, number>();
  for (const repo of repos) {
    for (const scan of repo.scans.slice(0, 1)) {
      // Only count latest scan per repo
      for (const f of scan.findings) {
        if (f.ruleId) {
          ruleIdCounts.set(f.ruleId, (ruleIdCounts.get(f.ruleId) ?? 0) + 1);
        }
      }
    }
  }
  const topFindings = [...ruleIdCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ruleId, count]) => ({ ruleId, count }));

  return NextResponse.json({
    portfolioScore,
    portfolioGrade,
    repoTimelines,
    movers,
    topFindings,
  });
}
