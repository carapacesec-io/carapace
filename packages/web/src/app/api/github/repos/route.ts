import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getInstallationOctokit } from "@/lib/github";
import { logger } from "@carapace/engine";

/**
 * GET /api/github/repos
 *
 * Fetches all repos accessible via the user's GitHub App installations.
 * Returns both connected (in DB) and available (from GitHub) repos.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all repos this user has in DB (to know which are already connected)
    const connectedRepos = await prisma.repo.findMany({
      where: { userId: session.user.id },
      select: { githubId: true, installationId: true, isActive: true },
    });

    const connectedMap = new Map(
      connectedRepos.map((r) => [r.githubId, r])
    );

    // Get unique installation IDs from connected repos
    const installationIds = [
      ...new Set(connectedRepos.map((r) => r.installationId)),
    ];

    if (installationIds.length === 0) {
      return NextResponse.json({ repos: [], hasInstallation: false });
    }

    // Fetch repos from each installation
    const allRepos: Array<{
      githubId: number;
      fullName: string;
      language: string | null;
      defaultBranch: string;
      private: boolean;
      connected: boolean;
      active: boolean;
      installationId: number;
    }> = [];

    for (const installationId of installationIds) {
      try {
        const octokit = await getInstallationOctokit(installationId);
        const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({
          per_page: 100,
        });

        for (const repo of data.repositories) {
          const existing = connectedMap.get(repo.id);
          allRepos.push({
            githubId: repo.id,
            fullName: repo.full_name,
            language: repo.language ?? null,
            defaultBranch: repo.default_branch,
            private: repo.private,
            connected: !!existing,
            active: existing?.isActive ?? false,
            installationId,
          });
        }
      } catch (err) {
        logger.error(`Failed to fetch repos for installation ${installationId}: ${(err as Error).message}`);
      }
    }

    return NextResponse.json({ repos: allRepos, hasInstallation: true });
  } catch (error) {
    logger.error(`Failed to fetch GitHub repos: ${(error as Error).message}`);
    return NextResponse.json(
      { error: "Failed to fetch repos" },
      { status: 500 }
    );
  }
}
