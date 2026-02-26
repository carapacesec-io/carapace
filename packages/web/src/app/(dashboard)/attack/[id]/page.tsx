import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const severityColors: Record<string, string> = {
  CRITICAL: "text-red-400 bg-red-500/10 border-red-500/20",
  HIGH: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  MEDIUM: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  LOW: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  INFO: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
};

const severityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

export default async function AttackReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const { id } = await params;

  const scan = await prisma.attackScan.findFirst({
    where: { id, userId: session.user.id },
    include: { findings: true },
  });

  if (!scan) notFound();

  // Sort findings by severity
  const sortedFindings = [...scan.findings].sort(
    (a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity),
  );

  // Severity breakdown
  const bySeverity: Record<string, number> = {};
  for (const f of scan.findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Attack Report</h1>
        <p className="text-muted-foreground mt-1">
          {scan.scanType} scan of {scan.targetUrl}
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {severityOrder.map((sev) => (
          <Card key={sev} className="bg-zinc-950 border-zinc-800">
            <CardContent className="pt-4 pb-4 text-center">
              <div className={`text-2xl font-bold font-mono ${
                sev === "CRITICAL" ? "text-red-500" :
                sev === "HIGH" ? "text-orange-500" :
                sev === "MEDIUM" ? "text-yellow-400" :
                sev === "LOW" ? "text-blue-400" : "text-zinc-400"
              }`}>
                {bySeverity[sev] || 0}
              </div>
              <div className="text-[11px] text-zinc-500 uppercase tracking-wider mt-1">{sev}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Scan metadata */}
      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm">Scan Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-zinc-500">Target</dt>
              <dd className="text-zinc-100 font-mono text-xs mt-1 break-all">{scan.targetUrl}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Type</dt>
              <dd className="text-zinc-100 mt-1">{scan.scanType}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Status</dt>
              <dd className="text-zinc-100 mt-1">{scan.status}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Date</dt>
              <dd className="text-zinc-100 mt-1">{scan.createdAt.toLocaleString()}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Attestation badge */}
      {scan.attestationUid && (
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6 text-emerald-400"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Attested on Base</p>
              <p className="text-xs text-muted-foreground">
                Permanent on-chain security record
              </p>
            </div>
            <a
              href={`https://base.easscan.org/attestation/view/${scan.attestationUid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
            >
              View on EAS
            </a>
          </CardContent>
        </Card>
      )}

      {/* Findings */}
      <div>
        <h2 className="text-xl font-semibold mb-4">
          Findings ({scan.findings.length})
        </h2>
        {sortedFindings.length === 0 ? (
          <Card className="bg-zinc-950 border-zinc-800">
            <CardContent className="pt-6">
              <p className="text-sm text-zinc-400">No findings detected.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {sortedFindings.map((finding) => (
              <Card key={finding.id} className="bg-zinc-950 border-zinc-800">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wider mt-0.5 ${severityColors[finding.severity] ?? severityColors.INFO}`}>
                      {finding.severity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-zinc-100">{finding.title}</p>
                        <span className="text-[10px] font-mono text-zinc-600">{finding.category}</span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">{finding.description}</p>
                      {finding.evidence && (
                        <pre className="mt-2 rounded bg-zinc-900 border border-zinc-800 p-2 text-[11px] font-mono text-zinc-400 overflow-x-auto whitespace-pre-wrap">
                          {finding.evidence}
                        </pre>
                      )}
                      {finding.remediation && (
                        <div className="mt-2 rounded bg-zinc-800 border border-zinc-700 p-2">
                          <p className="text-xs text-zinc-400">{finding.remediation}</p>
                        </div>
                      )}
                      {finding.cvss && (
                        <p className="mt-1 text-[11px] text-zinc-500 font-mono">CVSS: {finding.cvss}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
