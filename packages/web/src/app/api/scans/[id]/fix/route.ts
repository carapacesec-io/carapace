import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getInstallationOctokit } from "@/lib/github";
import { applyFixes, logger, type FileFixInput } from "@carapace/engine";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const scan = await prisma.scan.findUnique({
      where: { id },
      include: {
        repo: true,
        findings: true,
      },
    });

    if (!scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    if (scan.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!scan.branch || !scan.commitSha) {
      return NextResponse.json(
        { error: "Scan has no associated branch or commit" },
        { status: 400 }
      );
    }

    // Filter to findings with fixDiff
    const fixable = scan.findings.filter(
      (f) => f.fixDiff && f.fixDiff.trim().length > 0
    );

    if (fixable.length === 0) {
      return NextResponse.json(
        { error: "No fixable findings in this scan" },
        { status: 400 }
      );
    }

    // Get GitHub installation token
    const octokit = await getInstallationOctokit(scan.repo.installationId);

    // Parse repo fullName into owner/repo
    const [owner, repo] = scan.repo.fullName.split("/");

    // Fetch current file contents for all unique paths
    const uniquePaths = [...new Set(fixable.map((f) => f.filePath))];
    const fileInputs: FileFixInput[] = [];

    for (const filePath of uniquePaths) {
      try {
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: filePath,
          ref: scan.commitSha,
        });

        if ("content" in data && data.encoding === "base64") {
          fileInputs.push({
            filePath,
            originalContent: Buffer.from(data.content, "base64").toString(
              "utf-8"
            ),
          });
        }
      } catch {
        // File not found or binary — skip
      }
    }

    if (fileInputs.length === 0) {
      return NextResponse.json(
        { error: "Could not fetch file contents from GitHub" },
        { status: 500 }
      );
    }

    // Convert DB findings to engine Finding format
    const engineFindings = fixable.map((f) => ({
      severity: f.severity.toLowerCase() as "critical" | "high" | "medium" | "low" | "info",
      category: f.category,
      title: f.title,
      description: f.description,
      filePath: f.filePath,
      startLine: f.startLine ?? 0,
      endLine: f.endLine ?? 0,
      codeSnippet: f.codeSnippet ?? "",
      suggestion: f.suggestion ?? "",
      fixDiff: f.fixDiff ?? "",
      ruleId: f.ruleId ?? "unknown",
    }));

    // Apply fixes
    const fixResult = applyFixes(engineFindings, fileInputs);

    if (fixResult.files.length === 0) {
      return NextResponse.json(
        {
          error: "No fixes could be applied (context mismatch)",
          skipped: fixResult.skipped.length,
        },
        { status: 422 }
      );
    }

    // Commit fixes to the branch using Git Trees API
    // 1. Create blobs
    const blobs = await Promise.all(
      fixResult.files.map(async (file) => {
        const { data } = await octokit.rest.git.createBlob({
          owner,
          repo,
          content: Buffer.from(file.newContent, "utf-8").toString("base64"),
          encoding: "base64",
        });
        return { path: file.filePath, sha: data.sha };
      })
    );

    // 2. Create tree
    const { data: tree } = await octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: scan.commitSha,
      tree: blobs.map((blob) => ({
        path: blob.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.sha,
      })),
    });

    // 3. Create commit
    const appliedCount = fixResult.files.reduce(
      (sum, f) => sum + f.appliedFindings.length,
      0
    );

    const { data: commit } = await octokit.rest.git.createCommit({
      owner,
      repo,
      message: `fix: apply ${appliedCount} fix(es) across ${fixResult.files.length} file(s) [carapace]`,
      tree: tree.sha,
      parents: [scan.commitSha],
    });

    // 4. Update branch ref
    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${scan.branch}`,
      sha: commit.sha,
    });

    return NextResponse.json({
      message: `Applied ${appliedCount} fix(es) across ${fixResult.files.length} file(s)`,
      commitSha: commit.sha,
      filesFixed: fixResult.files.length,
      findingsFixed: appliedCount,
      skipped: fixResult.skipped.length,
    });
  } catch (error) {
    logger.error(`Failed to apply fixes: ${(error as Error).message}`);
    return NextResponse.json(
      { error: "Failed to apply fixes" },
      { status: 500 }
    );
  }
}
