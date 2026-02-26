import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { getAgentIdentity, getReputation } from "@/lib/erc8004";
import { CWE_OWASP_MAP } from "@carapace/engine";
import { unstable_cache } from "next/cache";

export const dynamic = "force-dynamic";

const getCachedStats = unstable_cache(
  async () => {
    const agentId = process.env.ERC8004_AGENT_ID;
    const [
      totalScans,
      uniqueRepos,
      totalFindings,
      attestationCount,
      severityBreakdown,
      avgScoreResult,
      leaderboard,
      identity,
      reputation,
      dailyScans,
      languageBreakdown,
      topVulnTypes,
      autoFixCount,
    ] = await Promise.all([
      prisma.scan.count({ where: { status: "COMPLETED" } }),
      prisma.scan
        .groupBy({ by: ["repoId"], where: { status: "COMPLETED" } })
        .then((r) => r.length),
      prisma.finding.count(),
      prisma.scan.count({ where: { attestationUid: { not: null } } }),
      prisma.finding.groupBy({
        by: ["severity"],
        _count: { severity: true },
      }),
      prisma.scan.aggregate({
        where: { status: "COMPLETED", score: { not: null } },
        _avg: { score: true },
      }),
      prisma.scan.findMany({
        where: { status: "COMPLETED", score: { not: null } },
        orderBy: { score: "desc" },
        distinct: ["repoId"],
        take: 50,
        include: {
          repo: { select: { fullName: true, language: true } },
          _count: { select: { findings: true } },
        },
      }),
      getAgentIdentity(),
      agentId ? getReputation(agentId) : Promise.resolve({ average: 0, count: 0 }),
      prisma.$queryRaw<{ day: Date; count: bigint }[]>`
        SELECT DATE("createdAt") as day, COUNT(*)::bigint as count
        FROM "Scan"
        WHERE "status" = 'COMPLETED'
          AND "createdAt" > NOW() - INTERVAL '30 days'
        GROUP BY DATE("createdAt")
        ORDER BY day ASC
      `.catch(() => [] as { day: Date; count: bigint }[]),
      prisma.repo.groupBy({
        by: ["language"],
        where: { scans: { some: { status: "COMPLETED" } } },
        _count: { language: true },
        orderBy: { _count: { language: "desc" } },
        take: 10,
      }),
      prisma.finding.groupBy({
        by: ["ruleId"],
        _count: { ruleId: true },
        orderBy: { _count: { ruleId: "desc" } },
        where: { ruleId: { not: null } },
        take: 10,
      }),
      prisma.finding.count({
        where: { fixDiff: { not: null } },
      }),
    ]);
    return {
      totalScans,
      uniqueRepos,
      totalFindings,
      attestationCount,
      severityBreakdown,
      avgScoreResult,
      leaderboard: leaderboard.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      identity,
      reputation,
      dailyScans: (dailyScans as { day: Date; count: bigint }[]).map((d) => ({
        day: new Date(d.day).toISOString(),
        count: Number(d.count),
      })),
      languageBreakdown,
      topVulnTypes,
      autoFixCount,
      agentId: agentId ?? null,
    };
  },
  ["stats-page"],
  { revalidate: 300 }
);

function gradeColor(g: string): string {
  if (g === "A") return "text-emerald-600";
  if (g === "B") return "text-blue-600";
  if (g === "C") return "text-amber-600";
  if (g === "D") return "text-orange-600";
  return "text-red-600";
}

function formatRuleId(ruleId: string): string {
  return ruleId
    .replace(/^cp-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

export default async function StatsPage() {
  const stats = await getCachedStats();
  const {
    totalScans, uniqueRepos, totalFindings, attestationCount,
    severityBreakdown, avgScoreResult, leaderboard, reputation,
    languageBreakdown, topVulnTypes, autoFixCount, agentId,
  } = stats;

  // Process severity breakdown
  const sevMap: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  for (const s of severityBreakdown) {
    sevMap[s.severity] = s._count.severity;
  }

  const avgScore = avgScoreResult._avg.score ? Math.round(avgScoreResult._avg.score) : 0;

  // Sparkline for daily scans
  const dailyData = stats.dailyScans.map((d) => ({
    day: new Date(d.day),
    count: d.count,
  }));
  const maxCount = Math.max(1, ...dailyData.map((d) => d.count));
  const chartWidth = 600;
  const chartHeight = 60;
  const sparklinePoints = dailyData.length > 0
    ? dailyData
        .map((d, i) => {
          const x = dailyData.length === 1 ? chartWidth / 2 : (i / (dailyData.length - 1)) * chartWidth;
          const y = chartHeight - (d.count / maxCount) * chartHeight;
          return `${x},${y}`;
        })
        .join(" ")
    : "";

  // Language breakdown colors
  const langColors = [
    "bg-emerald-500", "bg-blue-500", "bg-amber-500", "bg-violet-500", "bg-rose-500",
    "bg-cyan-500", "bg-orange-500", "bg-indigo-500", "bg-lime-500", "bg-pink-500",
  ];
  const totalLangRepos = languageBreakdown.reduce((sum, l) => sum + l._count.language, 0);

  return (
    <div className="min-h-screen bg-[#131313]">
      {/* Header */}
      <header className="border-b border-[#1e1e1e] bg-[#131313]">
        <div className="max-w-4xl mx-auto flex h-14 items-center justify-between px-6">
          <Link href="/" className="text-[17px] font-black text-[#ccc] tracking-tight flex items-center gap-2">
            <Image src="/logo.png" alt="Carapace" width={24} height={24} className="rounded" />
            carapace security
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/" className="text-[14px] text-[#666] hover:text-[#e0e0e0] transition-colors">Home</Link>
            <Link href="/playground" className="text-[14px] text-[#666] hover:text-[#e0e0e0] transition-colors">Playground</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl md:text-4xl font-black text-[#e0e0e0] tracking-tight mb-2">
          Platform Stats
        </h1>
        <p className="text-[#555] mb-8">
          Real-time security intelligence from the Carapace scanner network.
        </p>

        {/* Aggregate Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-10">
          {[
            { value: compact(totalScans), label: "Scans completed" },
            { value: compact(uniqueRepos), label: "Repos scanned" },
            { value: compact(totalFindings), label: "Findings detected" },
            { value: compact(autoFixCount), label: "Auto-fixes" },
            { value: String(attestationCount), label: "Attestations" },
            { value: `${avgScore}/100`, label: "Avg score" },
            { value: compact(sevMap.CRITICAL), label: "Critical" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-4 text-center"
            >
              <div className="text-2xl font-black text-[#e0e0e0] font-mono">{stat.value}</div>
              <div className="text-[11px] font-medium text-[#444] uppercase tracking-wider mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Severity Breakdown */}
        <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-5 mb-8">
          <h2 className="text-[11px] font-medium text-[#444] uppercase tracking-wider mb-3">Severity Breakdown</h2>
          <div className="grid grid-cols-5 gap-2">
            {(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const).map((sev) => (
              <div key={sev} className="text-center">
                <div
                  className={`text-xl font-black ${
                    sev === "CRITICAL"
                      ? "text-red-600"
                      : sev === "HIGH"
                      ? "text-orange-500"
                      : sev === "MEDIUM"
                      ? "text-amber-500"
                      : sev === "LOW"
                      ? "text-blue-500"
                      : "text-gray-400"
                  }`}
                >
                  {compact(sevMap[sev])}
                </div>
                <div className="text-[10px] text-[#444] font-medium">{sev}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Language Breakdown */}
        {languageBreakdown.length > 0 && (
          <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-5 mb-8">
            <h2 className="text-[11px] font-medium text-[#444] uppercase tracking-wider mb-4">Language Breakdown</h2>
            {/* Stacked bar */}
            <div className="flex rounded overflow-hidden h-6 mb-4">
              {languageBreakdown.map((l, i) => {
                const pct = totalLangRepos > 0 ? (l._count.language / totalLangRepos) * 100 : 0;
                return pct > 0 ? (
                  <div
                    key={l.language ?? "unknown"}
                    className={`${langColors[i % langColors.length]} transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${l.language ?? "Unknown"}: ${l._count.language} repos (${Math.round(pct)}%)`}
                  />
                ) : null;
              })}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-3">
              {languageBreakdown.map((l, i) => (
                <div key={l.language ?? "unknown"} className="flex items-center gap-1.5 text-[12px]">
                  <div className={`w-2.5 h-2.5 rounded-sm ${langColors[i % langColors.length]}`} />
                  <span className="text-[#555]">{l.language ?? "Unknown"}</span>
                  <span className="font-bold text-[#e0e0e0] font-mono">{l._count.language}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Most Common Vulnerabilities */}
        {topVulnTypes.length > 0 && (
          <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-5 mb-8">
            <h2 className="text-[11px] font-medium text-[#444] uppercase tracking-wider mb-4">Most Common Vulnerabilities</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b-2 border-[#1e1e1e] text-left">
                    <th className="py-2 pr-3 text-[11px] font-medium text-[#444] uppercase tracking-wider">Rule</th>
                    <th className="py-2 pr-3 text-[11px] font-medium text-[#444] uppercase tracking-wider text-right">Count</th>
                    <th className="py-2 text-[11px] font-medium text-[#444] uppercase tracking-wider">CWE</th>
                  </tr>
                </thead>
                <tbody>
                  {topVulnTypes.map((v) => {
                    const ruleId = v.ruleId ?? "";
                    const cweEntry = CWE_OWASP_MAP[ruleId];
                    const cweIds = cweEntry?.cweIds ?? [];
                    return (
                      <tr key={ruleId} className="border-b border-[#1e1e1e]">
                        <td className="py-2 pr-3 font-medium text-[#e0e0e0]">
                          {formatRuleId(ruleId)}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono font-bold text-[#e0e0e0]">
                          {compact(v._count.ruleId)}
                        </td>
                        <td className="py-2">
                          <div className="flex flex-wrap gap-1">
                            {cweIds.map((cwe) => (
                              <span key={cwe} className="text-[9px] font-mono bg-violet-500/15 text-violet-400 rounded px-1.5 py-0.5">
                                {cwe}
                              </span>
                            ))}
                            {cweIds.length === 0 && (
                              <span className="text-[10px] text-[#555]">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Scans Per Day */}
        {dailyData.length > 1 && (
          <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-5 mb-8">
            <h2 className="text-[11px] font-medium text-[#444] uppercase tracking-wider mb-3">Scans Per Day (Last 30 Days)</h2>
            <svg viewBox={`-10 -5 ${chartWidth + 20} ${chartHeight + 10}`} className="w-full h-20">
              <polyline
                fill="none"
                stroke="#4ade80"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={sparklinePoints}
              />
              {dailyData.map((d, i) => {
                const x = dailyData.length === 1 ? chartWidth / 2 : (i / (dailyData.length - 1)) * chartWidth;
                const y = chartHeight - (d.count / maxCount) * chartHeight;
                return (
                  <circle key={i} cx={x} cy={y} r="3" fill="#4ade80" stroke="#141414" strokeWidth="1.5" />
                );
              })}
            </svg>
            <div className="flex justify-between text-[10px] text-[#555] mt-1">
              {dailyData.length > 0 && (
                <>
                  <span>{dailyData[0].day.toLocaleDateString()}</span>
                  <span>{dailyData[dailyData.length - 1].day.toLocaleDateString()}</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Leaderboard */}
        {leaderboard.length > 0 && (
          <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-5 mb-8">
            <h2 className="text-[11px] font-medium text-[#444] uppercase tracking-wider mb-4">
              Top Repos by Security Score
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b-2 border-[#1e1e1e] text-left">
                    <th className="py-2 pr-3 text-[11px] font-medium text-[#444] uppercase tracking-wider">#</th>
                    <th className="py-2 pr-3 text-[11px] font-medium text-[#444] uppercase tracking-wider">Repository</th>
                    <th className="py-2 pr-3 text-[11px] font-medium text-[#444] uppercase tracking-wider">Language</th>
                    <th className="py-2 pr-3 text-[11px] font-medium text-[#444] uppercase tracking-wider text-right">Score</th>
                    <th className="py-2 pr-3 text-[11px] font-medium text-[#444] uppercase tracking-wider text-center">Grade</th>
                    <th className="py-2 pr-3 text-[11px] font-medium text-[#444] uppercase tracking-wider text-right">Findings</th>
                    <th className="py-2 text-[11px] font-medium text-[#444] uppercase tracking-wider text-center">Attested</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((scan, i) => (
                    <tr key={scan.id} className="border-b border-[#1e1e1e] hover:bg-[#1e1e1e]">
                      <td className="py-2 pr-3 text-[#555] font-mono">{i + 1}</td>
                      <td className="py-2 pr-3 font-medium text-[#e0e0e0]">
                        <Link
                          href={`/report/${scan.repo.fullName}`}
                          className="hover:text-white transition-colors"
                        >
                          {scan.repo.fullName}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-[#444]">{scan.repo.language ?? "—"}</td>
                      <td className="py-2 pr-3 text-right font-mono font-bold text-[#e0e0e0]">
                        {scan.score}
                      </td>
                      <td className={`py-2 pr-3 text-center font-black ${gradeColor(scan.grade ?? "")}`}>
                        {scan.grade ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-right text-[#555]">{scan._count.findings}</td>
                      <td className="py-2 text-center">
                        {scan.attestationUid ? (
                          <span className="text-[#4ade80] font-bold text-[11px]">Yes</span>
                        ) : (
                          <span className="text-[#555] text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ERC-8004 Agent Section */}
        <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-6 mb-8">
          <h2 className="text-[11px] font-medium text-[#444] uppercase tracking-wider mb-3">ERC-8004 Agent Identity</h2>
          <div className="space-y-2 text-[13px]">
            <div className="flex items-center gap-2">
              <span className="text-[#555] w-32">Agent Name:</span>
              <span className="font-bold text-[#e0e0e0] font-mono">Carapace Security</span>
            </div>
            {agentId && (
              <div className="flex items-center gap-2">
                <span className="text-[#555] w-32">NFT ID:</span>
                <span className="font-mono text-[#e0e0e0]">#{agentId}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[#555] w-32">On-chain Rating:</span>
              <span className="font-bold text-[#e0e0e0] font-mono">
                {reputation.count > 0
                  ? `${reputation.average}/100 (${reputation.count} rating${reputation.count !== 1 ? "s" : ""})`
                  : "No ratings yet"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#555] w-32">Registry:</span>
              <span className="text-[#444]">Base Mainnet (ERC-8004)</span>
            </div>
            <div className="mt-3">
              <a
                href="/.well-known/agent-card.json"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#e0e0e0] font-semibold underline decoration-[#e0e0e0]/40 hover:decoration-[#e0e0e0]/70 text-[12px]"
              >
                View Agent Card JSON
              </a>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <p className="text-[13px] text-[#444] mb-4">
            Powered by{" "}
            <Link href="/" className="text-[#e0e0e0] font-bold hover:underline">
              Carapace Security
            </Link>
            {" "}&middot; 120+ detection rules &middot; EAS attestations on Base
          </p>
          <Link href="/login">
            <button className="text-[14px] px-7 py-3 bg-[#e0e0e0] hover:bg-white text-[#131313] rounded-2xl font-bold transition-colors">
              Get Carapace Security for your repo
            </button>
          </Link>
        </div>
      </main>
    </div>
  );
}
