import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Octokit } from "octokit";
import { logger } from "@carapace/engine";

interface FileTransform {
  filePath: string;
  originalContent: string;
  newContent: string;
  diff: string;
  explanation: string;
}

interface ApplyRequest {
  repoUrl: string;
  transforms: FileTransform[];
  newFiles?: { path: string; content: string }[];
  filesToDelete?: string[];
  packageChanges?: {
    update: Record<string, string>;
    remove: string[];
    add: Record<string, string>;
  };
  planSummary?: string;
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: ApplyRequest = await request.json();
    const { repoUrl, transforms, newFiles, filesToDelete, packageChanges, planSummary } = body;

    if (!repoUrl || !transforms?.length) {
      return NextResponse.json(
        { error: "Missing repoUrl or transforms" },
        { status: 400 },
      );
    }

    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      return NextResponse.json(
        { error: "Invalid GitHub URL" },
        { status: 400 },
      );
    }

    // Get user's GitHub access token from their OAuth account
    const account = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: "github" },
    });

    if (!account?.access_token) {
      return NextResponse.json(
        { error: "No GitHub token found. Please re-authenticate with GitHub." },
        { status: 403 },
      );
    }

    const octokit = new Octokit({ auth: account.access_token });

    const { owner, repo } = parsed;

    // Step 1: Fork the repo (GitHub auto-deduplicates forks)
    let forkOwner: string;
    try {
      const { data: user } = await octokit.rest.users.getAuthenticated();
      forkOwner = user.login;

      // Check if user already has a fork
      try {
        await octokit.rest.repos.get({ owner: forkOwner, repo });
        // Fork already exists
      } catch {
        // Fork doesn't exist, create one
        await octokit.rest.repos.createFork({ owner, repo });
        // Wait a moment for GitHub to process the fork
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (err: any) {
      return NextResponse.json(
        { error: `Failed to fork repo: ${err.message}` },
        { status: 500 },
      );
    }

    // Step 2: Get the default branch ref
    const { data: forkRepo } = await octokit.rest.repos.get({
      owner: forkOwner,
      repo,
    });
    const defaultBranch = forkRepo.default_branch;

    const { data: ref } = await octokit.rest.git.getRef({
      owner: forkOwner,
      repo,
      ref: `heads/${defaultBranch}`,
    });

    // Step 3: Create a new branch
    const branchName = `codecleaner-upgrade-${Date.now()}`;
    await octokit.rest.git.createRef({
      owner: forkOwner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: ref.object.sha,
    });

    // Step 4: Apply all file changes
    let commitCount = 0;

    // Apply transforms (modified files)
    for (const transform of transforms) {
      try {
        // Get the current file to retrieve its SHA
        const { data: existing } = await octokit.rest.repos.getContent({
          owner: forkOwner,
          repo,
          path: transform.filePath,
          ref: branchName,
        });

        const sha = "sha" in existing ? existing.sha : undefined;

        await octokit.rest.repos.createOrUpdateFileContents({
          owner: forkOwner,
          repo,
          path: transform.filePath,
          message: `upgrade: ${transform.explanation.slice(0, 72)}`,
          content: Buffer.from(transform.newContent).toString("base64"),
          branch: branchName,
          sha,
        });
        commitCount++;
      } catch (err: any) {
        logger.error(`Failed to update ${transform.filePath}: ${err.message}`);
      }
    }

    // Apply new files
    if (newFiles?.length) {
      for (const file of newFiles) {
        try {
          await octokit.rest.repos.createOrUpdateFileContents({
            owner: forkOwner,
            repo,
            path: file.path,
            message: `upgrade: add ${file.path}`,
            content: Buffer.from(file.content).toString("base64"),
            branch: branchName,
          });
          commitCount++;
        } catch (err: any) {
          logger.error(`Failed to create ${file.path}: ${err.message}`);
        }
      }
    }

    // Delete files
    if (filesToDelete?.length) {
      for (const filePath of filesToDelete) {
        try {
          const { data: existing } = await octokit.rest.repos.getContent({
            owner: forkOwner,
            repo,
            path: filePath,
            ref: branchName,
          });
          const sha = "sha" in existing ? existing.sha : undefined;
          if (sha) {
            await octokit.rest.repos.deleteFile({
              owner: forkOwner,
              repo,
              path: filePath,
              message: `upgrade: remove ${filePath}`,
              sha,
              branch: branchName,
            });
            commitCount++;
          }
        } catch (err: any) {
          logger.error(`Failed to delete ${filePath}: ${err.message}`);
        }
      }
    }

    if (commitCount === 0) {
      return NextResponse.json(
        { error: "No file changes were applied" },
        { status: 400 },
      );
    }

    // Step 5: Create the Pull Request
    const prBody = [
      "## CodeCleaner Automated Upgrade",
      "",
      planSummary || "Automated code upgrade with security fixes, dependency updates, and improvements.",
      "",
      `### Changes Applied`,
      `- **${transforms.length}** files modified`,
      newFiles?.length ? `- **${newFiles.length}** new files created` : "",
      filesToDelete?.length ? `- **${filesToDelete.length}** files removed` : "",
      "",
      "### File Changes",
      ...transforms.map((t) => `- \`${t.filePath}\`: ${t.explanation}`),
      "",
      "---",
      "Generated by [CodeCleaner](https://github.com/apps/stealth-cleaner)",
    ]
      .filter(Boolean)
      .join("\n");

    const { data: pr } = await octokit.rest.pulls.create({
      owner,
      repo,
      title: `CodeCleaner: Automated Code Upgrade (${transforms.length} files)`,
      body: prBody,
      head: `${forkOwner}:${branchName}`,
      base: defaultBranch,
    });

    return NextResponse.json({
      prUrl: pr.html_url,
      prNumber: pr.number,
      forkUrl: `https://github.com/${forkOwner}/${repo}`,
      branch: branchName,
      filesChanged: commitCount,
    });
  } catch (error: any) {
    logger.error(`Apply upgrade error: ${(error as Error).message}`);
    return NextResponse.json(
      { error: error.message || "Failed to apply upgrade" },
      { status: 500 },
    );
  }
}
