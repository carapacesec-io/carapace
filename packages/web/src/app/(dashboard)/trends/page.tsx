import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

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

function gradeColor(g: string): string {
  if (g === "A") return "text-emerald-400";
  if (g === "B") return "text-blue-400";
  if (g === "C") return "text-amber-400";
  if (g === "D") return "text-orange-400";
  return "text-red-400";
}

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;
const SEV_COLORS: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH: "#f97316",
  MEDIUM: "#eab308",
  LOW: "#3b82f6",
  INFO: "#71717a",
};

export default async function TrendsPage() {
  const session = await auth();
  if (!session?.user?.id) notFound();

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

  // Build per-repo timeline data
  const repoTimelines = repos.map((repo) => {
    const timeline = [...repo.scans].reverse().map((scan) => {
      const score = scan.score ?? calcScore(scan.findings);
      const sevCounts: Record<string, number> = {};
      for (const f of scan.findings) {
        sevCounts[f.severity] = (sevCounts[f.severity] || 0) + 1;
      }
      return { date: scan.createdAt, score, grade: calcGrade(score), sevCounts };
    });

    const latestScore =
      timeline.length > 0 ? timeline[timeline.length - 1].score : null;
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

  // Portfolio score
  const reposWithScores = repoTimelines.filter((r) => r.latestScore !== null);
  const portfolioScore =
    reposWithScores.length > 0
      ? Math.round(
          reposWithScores.reduce((sum, r) => sum + r.latestScore!, 0) /
            reposWithScores.length
        )
      : null;
  const portfolioGrade =
    portfolioScore !== null ? calcGrade(portfolioScore) : null;

  // Biggest movers
  const movers = [...repoTimelines]
    .filter((r) => r.scoreDelta !== 0)
    .sort((a, b) => Math.abs(b.scoreDelta) - Math.abs(a.scoreDelta))
    .slice(0, 5);

  // Top findings across latest scans
  const ruleIdCounts = new Map<string, number>();
  for (const repo of repos) {
    const latestScan = repo.scans[0];
    if (!latestScan) continue;
    for (const f of latestScan.findings) {
      if (f.ruleId) {
        ruleIdCounts.set(f.ruleId, (ruleIdCounts.get(f.ruleId) ?? 0) + 1);
      }
    }
  }
  const topFindings = [...ruleIdCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Category breakdown from latest scans
  const categoryCounts: Record<string, Record<string, number>> = {};
  for (const rt of repoTimelines) {
    if (rt.timeline.length === 0) continue;
    const latest = rt.timeline[rt.timeline.length - 1];
    categoryCounts[rt.fullName] = latest.sevCounts;
  }

  // SVG chart constants
  const chartWidth = 600;
  const chartHeight = 200;

  // Colors for each repo line
  const LINE_COLORS = [
    "#10b981",
    "#3b82f6",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
    "#84cc16",
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Trends</h1>

      {/* Portfolio score */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Portfolio Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            {portfolioScore !== null && portfolioGrade !== null ? (
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-4xl font-black ${gradeColor(portfolioGrade)}`}
                >
                  {portfolioGrade}
                </span>
                <span className="text-lg text-muted-foreground">
                  {portfolioScore}/100
                </span>
              </div>
            ) : (
              <div className="text-2xl text-muted-foreground">--</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Repositories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{repos.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Scans
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {repos.reduce((sum, r) => sum + r.scans.length, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Score timeline chart */}
      {repoTimelines.some((r) => r.timeline.length > 1) && (
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Score Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <svg
              viewBox={`-30 -10 ${chartWidth + 50} ${chartHeight + 30}`}
              className="w-full h-52"
            >
              {/* Y-axis grid */}
              {[0, 25, 50, 75, 100].map((v) => {
                const y = chartHeight - (v / 100) * chartHeight;
                return (
                  <g key={v}>
                    <line
                      x1="0"
                      y1={y}
                      x2={chartWidth}
                      y2={y}
                      stroke="#27272a"
                      strokeWidth="1"
                    />
                    <text
                      x="-8"
                      y={y + 4}
                      fill="#52525b"
                      fontSize="10"
                      textAnchor="end"
                    >
                      {v}
                    </text>
                  </g>
                );
              })}

              {/* Lines per repo */}
              {repoTimelines.map((rt, ri) => {
                if (rt.timeline.length < 2) return null;
                const maxPts = rt.timeline.length;
                const color = LINE_COLORS[ri % LINE_COLORS.length];
                const points = rt.timeline
                  .map((d, i) => {
                    const x = (i / (maxPts - 1)) * chartWidth;
                    const y = chartHeight - (d.score / 100) * chartHeight;
                    return `${x},${y}`;
                  })
                  .join(" ");
                return (
                  <polyline
                    key={rt.id}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={points}
                    opacity="0.8"
                  />
                );
              })}
            </svg>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-2">
              {repoTimelines
                .filter((r) => r.timeline.length > 1)
                .map((rt, ri) => (
                  <div key={rt.id} className="flex items-center gap-1.5">
                    <div
                      className="w-3 h-0.5 rounded"
                      style={{
                        backgroundColor:
                          LINE_COLORS[ri % LINE_COLORS.length],
                      }}
                    />
                    <span className="text-[11px] text-zinc-400">
                      {rt.fullName}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category breakdown */}
      {Object.keys(categoryCounts).length > 0 && (
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Severity Breakdown (Latest Scan)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {repoTimelines
                .filter((rt) => rt.timeline.length > 0)
                .map((rt) => {
                  const latest = rt.timeline[rt.timeline.length - 1];
                  const total = Object.values(latest.sevCounts).reduce(
                    (s, c) => s + c,
                    0
                  );
                  if (total === 0) return null;
                  return (
                    <div key={rt.id}>
                      <div className="flex items-center justify-between mb-1">
                        <Link
                          href={`/repos/${rt.id}`}
                          className="text-sm hover:underline"
                        >
                          {rt.fullName}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {total} findings
                        </span>
                      </div>
                      <div className="flex h-4 rounded overflow-hidden bg-zinc-800">
                        {SEVERITY_ORDER.map((sev) => {
                          const count = latest.sevCounts[sev] ?? 0;
                          if (count === 0) return null;
                          const pct = (count / total) * 100;
                          return (
                            <div
                              key={sev}
                              style={{
                                width: `${pct}%`,
                                backgroundColor: SEV_COLORS[sev],
                              }}
                              title={`${sev}: ${count}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Legend */}
            <div className="flex gap-4 mt-4">
              {SEVERITY_ORDER.map((sev) => (
                <div key={sev} className="flex items-center gap-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: SEV_COLORS[sev] }}
                  />
                  <span className="text-[11px] text-zinc-400 capitalize">
                    {sev.toLowerCase()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Two-column: Movers + Top findings */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Biggest movers */}
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Biggest Movers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {movers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Not enough data yet
              </p>
            ) : (
              <div className="space-y-3">
                {movers.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between"
                  >
                    <Link
                      href={`/repos/${m.id}`}
                      className="text-sm hover:underline truncate max-w-[200px]"
                    >
                      {m.fullName}
                    </Link>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-mono font-bold ${m.scoreDelta > 0 ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {m.scoreDelta > 0 ? "+" : ""}
                        {m.scoreDelta}
                      </span>
                      {m.latestGrade && (
                        <Badge variant="outline" className="text-xs">
                          {m.latestGrade}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top findings */}
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Most Common Findings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topFindings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet</p>
            ) : (
              <div className="space-y-2">
                {topFindings.map(([ruleId, count]) => (
                  <div
                    key={ruleId}
                    className="flex items-center justify-between"
                  >
                    <span className="text-xs font-mono text-zinc-400 truncate max-w-[200px]">
                      {ruleId}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {count}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-repo score table */}
      {repoTimelines.length > 0 && (
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              All Repositories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {repoTimelines.map((rt) => (
                <Link key={rt.id} href={`/repos/${rt.id}`}>
                  <div className="flex items-center justify-between py-2 px-3 rounded hover:bg-zinc-900 transition-colors">
                    <div className="flex items-center gap-3">
                      {rt.latestGrade && (
                        <span
                          className={`text-lg font-black ${gradeColor(rt.latestGrade)}`}
                        >
                          {rt.latestGrade}
                        </span>
                      )}
                      <span className="text-sm">{rt.fullName}</span>
                      {rt.language && (
                        <Badge variant="secondary" className="text-[10px]">
                          {rt.language}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {rt.latestScore !== null && (
                        <span className="text-sm font-mono text-muted-foreground">
                          {rt.latestScore}/100
                        </span>
                      )}
                      {rt.scoreDelta !== 0 && (
                        <span
                          className={`text-xs font-mono ${rt.scoreDelta > 0 ? "text-emerald-400" : "text-red-400"}`}
                        >
                          {rt.scoreDelta > 0 ? "+" : ""}
                          {rt.scoreDelta}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
