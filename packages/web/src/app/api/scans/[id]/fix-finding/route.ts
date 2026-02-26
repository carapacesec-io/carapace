import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getInstallationOctokit } from "@/lib/github";
import { applyFixes, logger, type FileFixInput } from "@carapacesecurity/engine";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: scanId } = await params;
    const body = await request.json();
    const { findingId } = body as { findingId?: string };

    if (!findingId) {
      return NextResponse.json(
        { error: "Missing findingId" },
        { status: 400 }
      );
    }

    const scan = await prisma.scan.findUnique({
      where: { id: scanId },
      include: { repo: true },
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

    const finding = await prisma.finding.findUnique({
      where: { id: findingId },
    });

    if (!finding || finding.scanId !== scanId) {
      return NextResponse.json(
        { error: "Finding not found" },
        { status: 404 }
      );
    }

    if (!finding.fixDiff || finding.fixDiff.trim().length === 0) {
      return NextResponse.json(
        { error: "This finding has no fix available" },
        { status: 400 }
      );
    }

    // Get GitHub installation token
    const octokit = await getInstallationOctokit(scan.repo.installationId);
    const [owner, repo] = scan.repo.fullName.split("/");

    // Fetch file content
    const fileInputs: FileFixInput[] = [];
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: finding.filePath,
        ref: scan.commitSha,
      });

      if ("content" in data && data.encoding === "base64") {
        fileInputs.push({
          filePath: finding.filePath,
          originalContent: Buffer.from(data.content, "base64").toString(
            "utf-8"
          ),
        });
      }
    } catch {
      return NextResponse.json(
        { error: "Could not fetch file from GitHub" },
        { status: 500 }
      );
    }

    if (fileInputs.length === 0) {
      return NextResponse.json(
        { error: "Could not read file content" },
        { status: 500 }
      );
    }

    // Convert single finding to engine format
    const engineFindings = [
      {
        severity: finding.severity.toLowerCase() as
          | "critical"
          | "high"
          | "medium"
          | "low"
          | "info",
        category: finding.category,
        title: finding.title,
        description: finding.description,
        filePath: finding.filePath,
        startLine: finding.startLine ?? 0,
        endLine: finding.endLine ?? 0,
        codeSnippet: finding.codeSnippet ?? "",
        suggestion: finding.suggestion ?? "",
        fixDiff: finding.fixDiff,
        ruleId: finding.ruleId ?? "unknown",
      },
    ];

    const fixResult = applyFixes(engineFindings, fileInputs);

    if (fixResult.files.length === 0) {
      return NextResponse.json(
        { error: "Fix could not be applied (context mismatch)" },
        { status: 422 }
      );
    }

    // Commit the fix
    const file = fixResult.files[0];
    const { data: blob } = await octokit.rest.git.createBlob({
      owner,
      repo,
      content: Buffer.from(file.newContent, "utf-8").toString("base64"),
      encoding: "base64",
    });

    const { data: tree } = await octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: scan.commitSha,
      tree: [
        {
          path: file.filePath,
          mode: "100644" as const,
          type: "blob" as const,
          sha: blob.sha,
        },
      ],
    });

    const { data: commit } = await octokit.rest.git.createCommit({
      owner,
      repo,
      message: `fix: ${finding.title} [carapace]`,
      tree: tree.sha,
      parents: [scan.commitSha],
    });

    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${scan.branch}`,
      sha: commit.sha,
    });

    return NextResponse.json({
      message: `Fixed: ${finding.title}`,
      commitSha: commit.sha,
    });
  } catch (error) {
    logger.error(`Failed to apply single fix: ${(error as Error).message}`);
    return NextResponse.json(
      { error: "Failed to apply fix" },
      { status: 500 }
    );
  }
}
