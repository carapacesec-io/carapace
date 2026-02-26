import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

const statusColors: Record<string, string> = {
  PENDING: "secondary",
  RUNNING: "default",
  COMPLETED: "outline",
  FAILED: "destructive",
};

export default async function ScansPage() {
  const session = await auth();
  const scans = await prisma.scan.findMany({
    where: { userId: session!.user!.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      repo: { select: { fullName: true } },
      _count: { select: { findings: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Scans</h1>
        <p className="text-muted-foreground mt-1">
          Review history of all code scans
        </p>
      </div>

      {scans.length === 0 ? (
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="text-center py-12">
            <p className="text-lg font-medium">No scans yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Open a PR on a connected repository to trigger a scan.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {scans.map((scan) => (
            <Link key={scan.id} href={`/scans/${scan.id}`}>
              <Card className="bg-zinc-950 border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between py-4">
                  <div className="space-y-1">
                    <CardTitle className="text-base">
                      {scan.repo.fullName}
                      {scan.prNumber && (
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          #{scan.prNumber}
                        </span>
                      )}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {scan.prTitle ?? scan.type}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {scan.type === "SCHEDULED" && (
                      <Badge className="bg-purple-600 hover:bg-purple-500 text-white border-transparent">
                        SCHEDULED
                      </Badge>
                    )}
                    <Badge
                      variant={
                        (statusColors[scan.status] as "default") ?? "secondary"
                      }
                    >
                      {scan.status}
                    </Badge>
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
          ))}
        </div>
      )}
    </div>
  );
}
