import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getReputation } from "@/lib/erc8004";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const agentId = process.env.ERC8004_AGENT_ID;

  const [totalScans, totalFindings, totalRepos, criticalCount, attestationCount, recentScans, reputation] =
    await Promise.all([
      prisma.scan.count({ where: { userId } }),
      prisma.finding.count({
        where: { scan: { userId } },
      }),
      prisma.repo.count({ where: { userId, isActive: true } }),
      prisma.finding.count({
        where: { scan: { userId }, severity: "CRITICAL" },
      }),
      prisma.scan.count({
        where: { userId, attestationUid: { not: null } },
      }),
      prisma.scan.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          repo: { select: { fullName: true } },
          _count: { select: { findings: true } },
        },
      }),
      agentId ? getReputation(agentId) : Promise.resolve({ average: 0, count: 0 }),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back, {session?.user?.name ?? "Developer"}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Total Scans"
          value={String(totalScans)}
          description="All time"
        />
        <StatCard
          title="Findings"
          value={String(totalFindings)}
          description="Issues detected"
        />
        <StatCard
          title="Repositories"
          value={String(totalRepos)}
          description="Connected"
        />
        <StatCard
          title="Critical Issues"
          value={String(criticalCount)}
          description="Needs attention"
          highlight={criticalCount > 0}
        />
        <StatCard
          title="On-chain Attestations"
          value={String(attestationCount)}
          description="Verified on Base"
        />
        <StatCard
          title="Agent Reputation"
          value={reputation.count > 0 ? `${reputation.average}/100` : "N/A"}
          description={reputation.count > 0 ? `${reputation.count} rating${reputation.count !== 1 ? "s" : ""}` : "ERC-8004"}
        />
      </div>

      {totalScans === 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Get started with Carapace</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-zinc-950 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">1. Try the CLI</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-zinc-900 rounded-md px-3 py-2 mb-2">
                  <code className="text-xs text-emerald-400 font-mono">
                    npx carapace scan . --full
                  </code>
                </div>
                <p className="text-xs text-muted-foreground">
                  Scan any local project in seconds.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-950 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">2. Install GitHub App</CardTitle>
              </CardHeader>
              <CardContent>
                <Link
                  href="/repos"
                  className="inline-block text-xs text-emerald-400 underline underline-offset-2 hover:text-emerald-300 mb-2"
                >
                  Connect a repository
                </Link>
                <p className="text-xs text-muted-foreground">
                  Get automatic PR reviews on every push.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-950 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">3. Add GitHub Action</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-zinc-900 rounded-md px-3 py-2 mb-2 font-mono text-[10px] text-zinc-400 leading-relaxed">
                  <div>- uses: carapacesec/carapace-action@v1</div>
                  <div>&nbsp;&nbsp;with:</div>
                  <div>&nbsp;&nbsp;&nbsp;&nbsp;api-key: $&#123;&#123; secrets.CARAPACE_API_KEY &#125;&#125;</div>
                  <div>&nbsp;&nbsp;&nbsp;&nbsp;fail-on: high</div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Drop into any CI workflow.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Card className="bg-zinc-950 border-zinc-800">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentScans.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium">No scans yet</p>
              <p className="text-sm mt-1">
                Connect a repository and open a PR to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentScans.map((scan) => (
                <Link key={scan.id} href={`/scans/${scan.id}`}>
                  <div className="flex items-center justify-between rounded-lg border border-zinc-800 p-3 hover:border-zinc-700 transition-colors cursor-pointer">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">
                        {scan.repo.fullName}
                        {scan.prNumber && (
                          <span className="text-muted-foreground"> #{scan.prNumber}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {scan.prTitle ?? scan.type}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
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
                      <span className="text-xs text-muted-foreground">
                        {scan._count.findings} findings
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(scan.createdAt)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  description,
  highlight,
}: {
  title: string;
  value: string;
  description: string;
  highlight?: boolean;
}) {
  return (
    <Card className="bg-zinc-950 border-zinc-800">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${highlight ? "text-red-400" : ""}`}>
          {value}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
