import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAppOctokit, getInstallationOctokit } from "@/lib/github";
import { logger } from "@carapacesecurity/engine";

/**
 * GET /api/github/setup?installation_id=XXX&setup_action=install
 *
 * GitHub App installation callback. After a user installs the GitHub App,
 * GitHub redirects here. We link the installation to the user and import
 * their repos.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    // Not logged in — redirect to login with a callback
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  const installationId = request.nextUrl.searchParams.get("installation_id");
  const setupAction = request.nextUrl.searchParams.get("setup_action");

  if (!installationId) {
    return NextResponse.redirect(new URL("/repos?error=missing_installation", request.url));
  }

  try {
    const numericInstallationId = parseInt(installationId, 10);

    // Fetch repos from this installation
    const octokit = await getInstallationOctokit(numericInstallationId);
    const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({
      per_page: 100,
    });

    // Upsert each repo
    for (const ghRepo of data.repositories) {
      await prisma.repo.upsert({
        where: { githubId: ghRepo.id },
        update: {
          installationId: numericInstallationId,
          fullName: ghRepo.full_name,
          language: ghRepo.language ?? null,
          defaultBranch: ghRepo.default_branch,
          isActive: true,
        },
        create: {
          userId: session.user.id,
          installationId: numericInstallationId,
          githubId: ghRepo.id,
          fullName: ghRepo.full_name,
          language: ghRepo.language ?? null,
          defaultBranch: ghRepo.default_branch,
        },
      });
    }

    // Redirect to repos page with success
    return NextResponse.redirect(
      new URL(`/repos?installed=${data.repositories.length}`, request.url)
    );
  } catch (error) {
    logger.error(`GitHub App setup error: ${(error as Error).message}`);
    return NextResponse.redirect(new URL("/repos?error=setup_failed", request.url));
  }
}
