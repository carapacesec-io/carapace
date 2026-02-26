import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import ScheduleControl from "./schedule-control";
import AutoFixControl from "./auto-fix-control";

const DEDUCTIONS: Record<string, number> = {
  CRITICAL: 15, HIGH: 8, MEDIUM: 3, LOW: 1, INFO: 0,
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

export default async function RepoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const repo = await prisma.repo.findUnique({
    where: { id },
    include: {
      settings: true,
      scans: {
        where: { status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          findings: { select: { severity: true } },
          _count: { select: { findings: true } },
        },
      },
      _count: { select: { scans: true } },
    },
  });

  if (!repo || repo.userId !== session!.user!.id) {
    notFound();
  }

  const totalFindings = await prisma.finding.count({
    where: { scan: { repoId: id } },
  });

  const criticalFindings = await prisma.finding.count({
    where: { scan: { repoId: id }, severity: "CRITICAL" },
  });

  // Compute current score from latest scan
  const latestScan = repo.scans[0];
  const currentScore = latestScan ? calcScore(latestScan.findings) : null;
  const currentGrade = currentScore !== null ? calcGrade(currentScore) : null;

  // Build timeline data (oldest first)
  const timelineData = [...repo.scans].reverse().map((scan) => {
    const score = calcScore(scan.findings);
    return {
      date: scan.createdAt,
      score,
      grade: calcGrade(score),
      findingsCount: scan.findings.length,
    };
  });

  // SVG sparkline
  const chartWidth = 500;
  const chartHeight = 60;
  const maxPts = timelineData.length;
  const sparklinePoints = timelineData
    .map((d, i) => {
      const x = maxPts === 1 ? chartWidth / 2 : (i / (maxPts - 1)) * chartWidth;
      const y = chartHeight - (d.score / 100) * chartHeight;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{repo.fullName}</h1>
          <div className="flex items-center gap-2 mt-1">
            {repo.language && (
              <Badge variant="secondary">{repo.language}</Badge>
            )}
            <Badge variant={repo.isActive ? "default" : "outline"}>
              {repo.isActive ? "Active" : "Paused"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Score + Stats Row */}
      <div className="grid gap-4 md:grid-cols-4">
        {/* Security Grade */}
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Security Grade
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentGrade ? (
              <div className="flex items-baseline gap-2">
                <span className={`text-4xl font-black ${gradeColor(currentGrade)}`}>
                  {currentGrade}
                </span>
                <span className="text-lg text-muted-foreground">{currentScore}/100</span>
              </div>
            ) : (
              <div className="text-2xl text-muted-foreground">—</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Scans
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{repo._count.scans}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Findings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalFindings}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Critical Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {criticalFindings}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Score Timeline */}
      {timelineData.length > 1 && (
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Score Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <svg viewBox={`-5 -5 ${chartWidth + 10} ${chartHeight + 10}`} className="w-full h-20">
              {/* Grid */}
              <line x1="0" y1={chartHeight * 0.1} x2={chartWidth} y2={chartHeight * 0.1} stroke="#27272a" strokeWidth="1" />
              <line x1="0" y1={chartHeight * 0.5} x2={chartWidth} y2={chartHeight * 0.5} stroke="#27272a" strokeWidth="1" />
              <line x1="0" y1={chartHeight * 0.9} x2={chartWidth} y2={chartHeight * 0.9} stroke="#27272a" strokeWidth="1" />
              {/* Area fill */}
              <polygon
                points={`0,${chartHeight} ${sparklinePoints} ${chartWidth},${chartHeight}`}
                fill="url(#scoreGradient)"
                opacity="0.15"
              />
              <defs>
                <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Line */}
              <polyline
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={sparklinePoints}
              />
              {/* Dots */}
              {timelineData.map((d, i) => {
                const x = maxPts === 1 ? chartWidth / 2 : (i / (maxPts - 1)) * chartWidth;
                const y = chartHeight - (d.score / 100) * chartHeight;
                return (
                  <circle key={i} cx={x} cy={y} r="3" fill="#10b981" stroke="#09090b" strokeWidth="2" />
                );
              })}
            </svg>
            <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
              <span>{timelineData[0].date.toLocaleDateString()}</span>
              <span>{timelineData[timelineData.length - 1].date.toLocaleDateString()}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Badge Embed */}
      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Security Badge
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">Add to your README for public visibility:</p>
          <div className="bg-zinc-900 rounded border border-zinc-800 px-3 py-2 font-mono text-[11px] text-zinc-400 break-all select-all">
            {`[![Security Score](https://carapacesec.io/api/badge/${repo.fullName})](https://carapacesec.io/report/${repo.fullName})`}
          </div>
        </CardContent>
      </Card>

      {/* Scheduled Scans */}
      <ScheduleControl repoId={id} />

      {/* Auto-Fix */}
      <AutoFixControl repoId={id} />

      {/* Recent Scans */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Recent Scans</h2>
        {repo.scans.length === 0 ? (
          <Card className="bg-zinc-950 border-zinc-800">
            <CardContent className="py-8 text-center text-muted-foreground">
              No scans yet for this repository.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {repo.scans.map((scan) => {
              const scanScore = calcScore(scan.findings);
              const scanGrade = calcGrade(scanScore);
              return (
                <Link key={scan.id} href={`/scans/${scan.id}`}>
                  <Card className="bg-zinc-950 border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer">
                    <CardHeader className="flex flex-row items-center justify-between py-4">
                      <div className="flex items-center gap-3">
                        <span className={`text-lg font-black ${gradeColor(scanGrade)}`}>{scanGrade}</span>
                        <div>
                          <CardTitle className="text-base">
                            {scan.prTitle ?? scan.type}
                            {scan.prNumber && (
                              <span className="text-muted-foreground font-normal ml-2">
                                #{scan.prNumber}
                              </span>
                            )}
                          </CardTitle>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono text-muted-foreground">
                          {scanScore}/100
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {scan._count.findings} findings
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {scan.createdAt.toLocaleDateString()}
                        </span>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
