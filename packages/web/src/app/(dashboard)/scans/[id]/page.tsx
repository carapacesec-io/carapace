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
import { ApplyFixesButton } from "./apply-fixes-button";
import { FixButton } from "./fix-button";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const severityVariant: Record<
  string,
  "critical" | "high" | "medium" | "low" | "info"
> = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  INFO: "info",
};

const DEDUCTIONS: Record<string, number> = {
  CRITICAL: 15,
  HIGH: 8,
  MEDIUM: 3,
  LOW: 1,
  INFO: 0,
};

function computeScore(findings: { severity: string }[]): {
  score: number;
  grade: string;
} {
  let totalDeducted = 0;
  for (const f of findings) {
    totalDeducted += DEDUCTIONS[f.severity] ?? 0;
  }
  const score = Math.max(0, Math.min(100, 100 - totalDeducted));

  let grade: string;
  if (score >= 90) grade = "A";
  else if (score >= 80) grade = "B";
  else if (score >= 70) grade = "C";
  else if (score >= 55) grade = "D";
  else grade = "F";

  return { score, grade };
}

const GRADE_COLORS: Record<string, string> = {
  A: "text-emerald-400 border-emerald-400",
  B: "text-green-400 border-green-400",
  C: "text-yellow-400 border-yellow-400",
  D: "text-orange-400 border-orange-400",
  F: "text-red-400 border-red-400",
};

/** Parse a unified diff string into individual lines with their type. */
function parseDiffLines(
  diff: string
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
      // Fallback for lines without prefix (treat as context)
      result.push({ type: "context", content: line });
    }
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export default async function ScanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const scan = await prisma.scan.findUnique({
    where: { id },
    include: {
      repo: { select: { fullName: true } },
      findings: { orderBy: { severity: "asc" } },
    },
  });

  if (!scan || scan.userId !== session!.user!.id) {
    notFound();
  }

  const severityCounts = scan.findings.reduce(
    (acc, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const hasFixableFindings =
    scan.branch && scan.findings.some((f) => f.fixDiff);

  const { score, grade } =
    scan.findings.length > 0
      ? computeScore(scan.findings)
      : { score: 100, grade: "A" };

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/*  Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold">{scan.repo.fullName}</h1>
            {scan.prNumber && (
              <span className="text-2xl text-muted-foreground">
                #{scan.prNumber}
              </span>
            )}
          </div>
          <p className="text-muted-foreground">
            {scan.prTitle ?? scan.type} &middot;{" "}
            <Badge
              variant={
                scan.status === "COMPLETED"
                  ? "default"
                  : scan.status === "FAILED"
                    ? "destructive"
                    : "secondary"
              }
            >
              {scan.status}
            </Badge>
            {scan.duration && (
              <span className="ml-2">
                {(scan.duration / 1000).toFixed(1)}s
              </span>
            )}
          </p>
        </div>

        {hasFixableFindings && <ApplyFixesButton scanId={scan.id} />}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/*  Summary                                                            */}
      {/* ------------------------------------------------------------------ */}
      {scan.summary && (
        <Card className="bg-zinc-950 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {scan.summary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/*  Severity breakdown                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex gap-3 flex-wrap">
        {(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const).map((sev) =>
          severityCounts[sev] ? (
            <Badge key={sev} variant={severityVariant[sev]}>
              {sev}: {severityCounts[sev]}
            </Badge>
          ) : null
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/*  Security Score                                                     */}
      {/* ------------------------------------------------------------------ */}
      {scan.status === "COMPLETED" && (
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="flex items-center gap-6 py-6">
            <div
              className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 ${GRADE_COLORS[grade] ?? "text-zinc-400 border-zinc-400"}`}
            >
              <span className="text-3xl font-bold">{grade}</span>
            </div>
            <div>
              <p className="text-2xl font-bold">{score}/100</p>
              <p className="text-sm text-muted-foreground">
                Security Score &middot; {scan.findings.length} finding
                {scan.findings.length !== 1 ? "s" : ""}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/*  Attestation Badge                                                  */}
      {/* ------------------------------------------------------------------ */}
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

      {/* ------------------------------------------------------------------ */}
      {/*  Findings                                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold">
          Findings ({scan.findings.length})
        </h2>

        {scan.findings.length === 0 ? (
          <Card className="bg-zinc-950 border-zinc-800">
            <CardContent className="py-8 text-center text-muted-foreground">
              No issues found. Code looks good!
            </CardContent>
          </Card>
        ) : (
          scan.findings.map((finding) => {
            const diffLines = finding.fixDiff
              ? parseDiffLines(finding.fixDiff)
              : null;

            return (
              <Card
                key={finding.id}
                className="bg-zinc-950 border-zinc-800"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={severityVariant[finding.severity]}>
                          {finding.severity}
                        </Badge>
                        <Badge variant="outline">{finding.category}</Badge>
                      </div>
                      <CardTitle className="text-base">
                        {finding.title}
                      </CardTitle>
                    </div>
                    {finding.fixDiff && scan.branch && (
                      <FixButton
                        scanId={scan.id}
                        findingId={finding.id}
                        fixDiff={finding.fixDiff}
                      />
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {finding.description}
                  </p>

                  <div className="text-xs text-muted-foreground font-mono">
                    {finding.filePath}
                    {finding.startLine && `:${finding.startLine}`}
                    {finding.endLine && `-${finding.endLine}`}
                  </div>

                  {/* ---------- Before / After diff view ---------- */}
                  {diffLines ? (
                    <div className="rounded-lg border border-zinc-800 overflow-hidden">
                      {/* Diff header */}
                      <div className="flex items-center gap-3 bg-zinc-900/70 px-4 py-2 text-xs text-muted-foreground border-b border-zinc-800">
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500/80" />
                          Before
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                          After
                        </span>
                      </div>

                      {/* Diff body */}
                      <pre className="bg-zinc-900 text-sm overflow-x-auto">
                        <code>
                          {diffLines.map((line, i) => {
                            if (line.type === "header") {
                              return (
                                <div
                                  key={i}
                                  className="bg-zinc-800/50 text-zinc-500 px-4 py-0.5 select-none"
                                >
                                  <span className="inline-block w-10 text-right mr-3 text-zinc-600 select-none">
                                    &nbsp;
                                  </span>
                                  {line.content}
                                </div>
                              );
                            }

                            if (line.type === "removed") {
                              return (
                                <div
                                  key={i}
                                  className="bg-red-500/10 text-red-400 px-4 py-0.5"
                                >
                                  <span className="inline-block w-10 text-right mr-3 text-red-400/50 select-none">
                                    -
                                  </span>
                                  {line.content}
                                </div>
                              );
                            }

                            if (line.type === "added") {
                              return (
                                <div
                                  key={i}
                                  className="bg-emerald-500/10 text-emerald-400 px-4 py-0.5"
                                >
                                  <span className="inline-block w-10 text-right mr-3 text-emerald-400/50 select-none">
                                    +
                                  </span>
                                  {line.content}
                                </div>
                              );
                            }

                            // context line
                            return (
                              <div
                                key={i}
                                className="text-zinc-400 px-4 py-0.5"
                              >
                                <span className="inline-block w-10 text-right mr-3 text-zinc-600 select-none">
                                  &nbsp;
                                </span>
                                {line.content}
                              </div>
                            );
                          })}
                        </code>
                      </pre>
                    </div>
                  ) : (
                    /* Fallback: plain code snippet when no diff is available */
                    finding.codeSnippet && (
                      <pre className="rounded-lg bg-zinc-900 p-4 text-sm overflow-x-auto">
                        <code>{finding.codeSnippet}</code>
                      </pre>
                    )
                  )}

                  {/* ---------- Suggestion ---------- */}
                  {finding.suggestion && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                      <p className="text-xs font-medium text-primary mb-2">
                        Suggested Fix
                      </p>
                      <p className="text-sm">{finding.suggestion}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
