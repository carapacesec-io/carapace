import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { CWE_OWASP_MAP } from "@carapacesecurity/engine";

const DEDUCTIONS: Record<string, number> = {
  CRITICAL: 15,
  HIGH: 8,
  MEDIUM: 3,
  LOW: 1,
  INFO: 0,
};

function computeScore(findings: { severity: string }[]): number {
  let d = 0;
  for (const f of findings) d += DEDUCTIONS[f.severity] ?? 0;
  return Math.max(0, Math.min(100, 100 - d));
}

function grade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 55) return "D";
  return "F";
}

function gradeColor(g: string): string {
  if (g === "A") return "text-emerald-400 border-emerald-500 bg-emerald-500/10";
  if (g === "B") return "text-blue-400 border-blue-500 bg-blue-500/10";
  if (g === "C") return "text-amber-400 border-amber-500 bg-amber-500/10";
  if (g === "D") return "text-orange-400 border-orange-500 bg-orange-500/10";
  return "text-red-400 border-red-500 bg-red-500/10";
}

function sevColor(sev: string): string {
  if (sev === "CRITICAL") return "bg-red-500 text-white";
  if (sev === "HIGH") return "bg-orange-400 text-white";
  if (sev === "MEDIUM") return "bg-amber-400 text-white";
  if (sev === "LOW") return "bg-blue-400 text-white";
  return "bg-gray-300 text-gray-700";
}

/** Parse a unified diff string into individual lines with their type. */
function parseDiffLines(
  diff: string,
): { type: "removed" | "added" | "context" | "header"; content: string }[] {
  const lines = diff.split("\n");
  const result: {
    type: "removed" | "added" | "context" | "header";
    content: string;
  }[] = [];

  for (const line of lines) {
    if (
      line.startsWith("---") ||
      line.startsWith("+++") ||
      line.startsWith("@@")
    ) {
      result.push({ type: "header", content: line });
    } else if (line.startsWith("-")) {
      result.push({ type: "removed", content: line.slice(1) });
    } else if (line.startsWith("+")) {
      result.push({ type: "added", content: line.slice(1) });
    } else if (line.startsWith(" ")) {
      result.push({ type: "context", content: line.slice(1) });
    } else if (line.length > 0) {
      result.push({ type: "context", content: line });
    }
  }

  return result;
}

export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo: repoName } = await params;
  const fullName = `${owner}/${repoName}`;

  const repo = await prisma.repo.findFirst({ where: { fullName } });
  if (!repo) notFound();

  // Last 20 completed scans
  const scans = await prisma.scan.findMany({
    where: { repoId: repo.id, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      findings: {
        select: {
          severity: true,
          category: true,
          title: true,
          description: true,
          filePath: true,
          startLine: true,
          endLine: true,
          fixDiff: true,
          ruleId: true,
          codeSnippet: true,
        },
        orderBy: { severity: "asc" },
      },
    },
  });

  if (scans.length === 0) notFound();

  const latest = scans[0];
  const score = computeScore(latest.findings);
  const g = grade(score);
  const gc = gradeColor(g);

  // Severity counts
  const sevCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  for (const f of latest.findings) {
    sevCounts[f.severity as keyof typeof sevCounts] =
      (sevCounts[f.severity as keyof typeof sevCounts] ?? 0) + 1;
  }

  // Summary stats
  const fixableCount = latest.findings.filter((f) => f.fixDiff).length;
  const cweCount = latest.findings.filter(
    (f) => f.ruleId && CWE_OWASP_MAP[f.ruleId]?.cweIds?.length,
  ).length;

  // Score timeline (oldest first for the chart)
  const timelineData = [...scans].reverse().map((s) => {
    const sc = computeScore(s.findings);
    return { date: s.createdAt, score: sc, grade: grade(sc) };
  });

  // Sparkline SVG points
  const maxPts = timelineData.length;
  const chartWidth = 600;
  const chartHeight = 80;
  const points = timelineData
    .map((d, i) => {
      const x = maxPts === 1 ? chartWidth / 2 : (i / (maxPts - 1)) * chartWidth;
      const y = chartHeight - (d.score / 100) * chartHeight;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="min-h-screen bg-[#131313]">
      {/* Header */}
      <header className="border-b border-[#1e1e1e] bg-[#131313]">
        <div className="max-w-3xl mx-auto flex h-14 items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-[17px] font-black text-[#ccc] tracking-tight">
            <Image src="/logo.png" alt="Carapace" width={24} height={24} className="rounded" />
            carapace
          </Link>
          <span className="text-[13px] text-[#444]">Public Security Report</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Repo + Grade */}
        <div className="flex items-center gap-5 mb-8">
          <div className={`flex-shrink-0 w-20 h-20 rounded border ${gc} flex items-center justify-center`}>
            <span className="text-4xl font-black">{g}</span>
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#e0e0e0] tracking-tight">{fullName}</h1>
            <p className="text-[15px] text-[#555] mt-1">
              Score: <span className="font-bold text-[#e0e0e0]">{score}/100</span> &middot;{" "}
              {latest.findings.length} finding{latest.findings.length !== 1 ? "s" : ""} &middot;{" "}
              Last scanned {latest.createdAt.toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Summary stats bar */}
        <div className="flex flex-wrap gap-3 mb-8 text-[13px]">
          <span className="bg-[#141414] border border-[#1e1e1e] rounded-full px-3 py-1 text-[#555]">
            <span className="font-bold text-[#e0e0e0]">{latest.findings.length}</span> findings
          </span>
          <span className="bg-[#141414] border border-[#1e1e1e] rounded-full px-3 py-1 text-[#555]">
            <span className="font-bold text-emerald-400">{fixableCount}</span> auto-fixable
          </span>
          <span className="bg-[#141414] border border-[#1e1e1e] rounded-full px-3 py-1 text-[#555]">
            <span className="font-bold text-[#e0e0e0]">{cweCount}</span> with CWE mapping
          </span>
        </div>

        {/* Badge embed */}
        <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-4 mb-8">
          <p className="text-[12px] font-bold text-[#e0e0e0] mb-2">Add this badge to your README:</p>
          <div className="bg-[#131313] border border-[#1e1e1e] rounded px-3 py-2 font-mono text-[11px] text-[#555] break-all select-all">
            {`[![Security Score](https://carapacesec.io/api/badge/${fullName})](https://carapacesec.io/report/${fullName})`}
          </div>
        </div>

        {/* Severity breakdown */}
        <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-5 mb-8">
          <h2 className="text-[15px] font-bold text-[#e0e0e0] mb-3">Severity Breakdown</h2>
          <div className="grid grid-cols-5 gap-2">
            {(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const).map((sev) => (
              <div key={sev} className="text-center">
                <div className={`text-xl font-black ${
                  sev === "CRITICAL" ? "text-red-600" :
                  sev === "HIGH" ? "text-orange-500" :
                  sev === "MEDIUM" ? "text-amber-500" :
                  sev === "LOW" ? "text-blue-500" :
                  "text-gray-400"
                }`}>
                  {sevCounts[sev]}
                </div>
                <div className="text-[10px] text-[#444] font-medium">{sev}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Score Timeline */}
        {timelineData.length > 1 && (
          <div className="bg-[#141414] border border-[#1e1e1e] rounded-2xl p-5 mb-8">
            <h2 className="text-[15px] font-bold text-[#e0e0e0] mb-3">Score Over Time</h2>
            <svg viewBox={`-10 -10 ${chartWidth + 20} ${chartHeight + 20}`} className="w-full h-24">
              {/* Grid lines */}
              <line x1="0" y1={chartHeight * 0.1} x2={chartWidth} y2={chartHeight * 0.1} stroke="#1e1e1e" strokeWidth="1" />
              <line x1="0" y1={chartHeight * 0.5} x2={chartWidth} y2={chartHeight * 0.5} stroke="#1e1e1e" strokeWidth="1" />
              <line x1="0" y1={chartHeight * 0.9} x2={chartWidth} y2={chartHeight * 0.9} stroke="#1e1e1e" strokeWidth="1" />
              {/* Line */}
              <polyline
                fill="none"
                stroke="#e0e0e0"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points}
              />
              {/* Dots */}
              {timelineData.map((d, i) => {
                const x = maxPts === 1 ? chartWidth / 2 : (i / (maxPts - 1)) * chartWidth;
                const y = chartHeight - (d.score / 100) * chartHeight;
                return (
                  <circle key={i} cx={x} cy={y} r="4" fill="#e0e0e0" stroke="#fff" strokeWidth="2" />
                );
              })}
            </svg>
            <div className="flex justify-between text-[10px] text-[#555] mt-1">
              <span>{timelineData[0].date.toLocaleDateString()}</span>
              <span>{timelineData[timelineData.length - 1].date.toLocaleDateString()}</span>
            </div>
          </div>
        )}

        {/* Detailed Findings */}
        {latest.findings.length > 0 && (
          <div className="mb-8">
            <h2 className="text-[17px] font-bold text-[#e0e0e0] mb-4">
              Findings ({latest.findings.length})
            </h2>
            <div className="space-y-4">
              {latest.findings.map((f, i) => {
                const cweEntry = f.ruleId ? CWE_OWASP_MAP[f.ruleId] : undefined;
                const cweIds = cweEntry?.cweIds ?? [];
                const owaspCat = cweEntry?.owaspCategory;
                const hasDiff = !!f.fixDiff;
                const expanded = i < 10;

                return (
                  <details key={i} open={expanded} className="bg-[#141414] border border-[#1e1e1e] rounded-2xl group">
                    <summary className="cursor-pointer p-4 flex flex-wrap items-center gap-2">
                      <span className={`text-[9px] font-mono font-bold rounded px-1.5 py-0.5 ${sevColor(f.severity)}`}>
                        {f.severity}
                      </span>
                      <span className="text-[13px] font-medium text-[#e0e0e0] flex-1 min-w-0">
                        {f.title}
                      </span>
                      {cweIds.map((cwe) => (
                        <span key={cwe} className="text-[9px] font-mono bg-violet-500/15 text-violet-400 rounded px-1.5 py-0.5">
                          {cwe}
                        </span>
                      ))}
                      {owaspCat && (
                        <span className="text-[9px] font-mono bg-amber-500/15 text-amber-400 rounded px-1.5 py-0.5">
                          {owaspCat}
                        </span>
                      )}
                      {hasDiff && (
                        <span className="text-[9px] font-bold bg-emerald-500/15 text-emerald-400 rounded px-1.5 py-0.5">
                          FIX AVAILABLE
                        </span>
                      )}
                    </summary>

                    <div className="border-t border-[#1e1e1e] p-4 space-y-3">
                      {f.description && (
                        <p className="text-[13px] text-[#bbb] leading-relaxed">{f.description}</p>
                      )}

                      {f.filePath && (
                        <p className="text-[12px] font-mono text-[#444]">
                          {f.filePath}{f.startLine ? `:${f.startLine}` : ""}
                          {f.endLine && f.endLine !== f.startLine ? `-${f.endLine}` : ""}
                        </p>
                      )}

                      {/* Fix diff */}
                      {f.fixDiff && (
                        <div className="rounded border border-[#1e1e1e] overflow-hidden">
                          <div className="bg-[#222] px-3 py-1.5 text-[10px] font-bold text-[#444] border-b border-[#1e1e1e]">
                            Suggested Fix
                          </div>
                          <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
                            <pre className="text-[12px] leading-5 min-w-0">
                              {parseDiffLines(f.fixDiff).map((line, li) => (
                                <div
                                  key={li}
                                  className={
                                    line.type === "removed"
                                      ? "bg-red-500/10 text-red-400 px-3"
                                      : line.type === "added"
                                      ? "bg-emerald-500/10 text-emerald-400 px-3"
                                      : line.type === "header"
                                      ? "bg-[#222] text-[#444] px-3"
                                      : "text-[#555] px-3"
                                  }
                                >
                                  <code>
                                    {line.type === "removed" ? "- " : line.type === "added" ? "+ " : line.type === "header" ? "" : "  "}
                                    {line.content}
                                  </code>
                                </div>
                              ))}
                            </pre>
                          </div>
                        </div>
                      )}

                      {/* Code snippet fallback */}
                      {!f.fixDiff && f.codeSnippet && (
                        <div className="rounded border border-[#1e1e1e] overflow-hidden">
                          <div className="bg-[#222] px-3 py-1.5 text-[10px] font-bold text-[#444] border-b border-[#1e1e1e]">
                            Code
                          </div>
                          <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
                            <pre className="text-[12px] leading-5 px-3 py-2 text-[#bbb]">
                              <code>{f.codeSnippet}</code>
                            </pre>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-[10px] text-[#555]">
                        {f.category && <span>{f.category}</span>}
                        {f.ruleId && <span>&middot; {f.ruleId}</span>}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="text-center mt-12">
          <p className="text-[13px] text-[#444] mb-4">
            Powered by{" "}
            <Link href="/" className="text-[#ccc] font-bold hover:underline">
              Carapace
            </Link>
            {" "}&middot; 120+ detection rules &middot; Every PR
          </p>
          <Link href="/login">
            <button className="text-[14px] px-7 py-3 bg-[#e0e0e0] hover:bg-white text-[#131313] rounded font-bold transition-colors">
              Get Carapace for your repo
            </button>
          </Link>
        </div>
      </main>
    </div>
  );
}
