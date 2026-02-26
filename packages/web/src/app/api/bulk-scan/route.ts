import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bulkScanQueue } from "@/lib/queue";
import {
  fetchTrendingRepos,
  fetchTopReposByStars,
  fetchReposBySearch,
  type RepoInfo,
} from "@/lib/bulk-scan/fetch-repos";

export async function POST(request: NextRequest) {
  // Admin-only via API key
  const authHeader = request.headers.get("authorization");
  const expectedKey = process.env.CARAPACE_API_KEY;

  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { source, repos, query, language, count = 50, name } = body;

  if (!source || !name) {
    return NextResponse.json(
      { error: "source and name are required" },
      { status: 400 },
    );
  }

  const bulkUserId = process.env.BULK_SCAN_USER_ID;
  if (!bulkUserId) {
    return NextResponse.json(
      { error: "BULK_SCAN_USER_ID is not configured" },
      { status: 500 },
    );
  }

  // Resolve repo list
  let repoList: RepoInfo[] = [];

  if (source === "manual-list") {
    if (!repos || !Array.isArray(repos) || repos.length === 0) {
      return NextResponse.json(
        { error: "repos array is required for manual-list source" },
        { status: 400 },
      );
    }
    repoList = repos.map((fullName: string) => ({
      fullName,
      githubId: 0,
      defaultBranch: "main",
      language: null,
    }));
  } else if (source === "github-trending") {
    repoList = await fetchTrendingRepos(language, count);
  } else if (source === "github-search") {
    if (!query) {
      return NextResponse.json(
        { error: "query is required for github-search source" },
        { status: 400 },
      );
    }
    repoList = await fetchReposBySearch(query, count);
  } else if (source === "github-stars") {
    repoList = await fetchTopReposByStars(language, count);
  } else {
    return NextResponse.json(
      { error: "source must be manual-list, github-trending, github-search, or github-stars" },
      { status: 400 },
    );
  }

  if (repoList.length === 0) {
    return NextResponse.json({ error: "No repos found" }, { status: 404 });
  }

  // Create BulkScanJob
  const bulkJob = await prisma.bulkScanJob.create({
    data: {
      name,
      source,
      repoList: repoList.map((r) => r.fullName),
      totalRepos: repoList.length,
    },
  });

  // Upsert repos and create scans
  const scanJobs: { scanId: string; repoFullName: string; defaultBranch: string }[] = [];

  for (const repoInfo of repoList) {
    // Upsert repo
    const repo = repoInfo.githubId > 0
      ? await prisma.repo.upsert({
          where: { githubId: repoInfo.githubId },
          update: { language: repoInfo.language, defaultBranch: repoInfo.defaultBranch },
          create: {
            userId: bulkUserId,
            installationId: 0,
            githubId: repoInfo.githubId,
            fullName: repoInfo.fullName,
            defaultBranch: repoInfo.defaultBranch,
            language: repoInfo.language,
            isActive: false,
          },
        })
      : await prisma.repo.upsert({
          where: { githubId: Math.abs(hashCode(repoInfo.fullName)) },
          update: {},
          create: {
            userId: bulkUserId,
            installationId: 0,
            githubId: Math.abs(hashCode(repoInfo.fullName)),
            fullName: repoInfo.fullName,
            defaultBranch: repoInfo.defaultBranch,
            language: repoInfo.language,
            isActive: false,
          },
        });

    // Create scan record
    const scan = await prisma.scan.create({
      data: {
        repoId: repo.id,
        userId: bulkUserId,
        type: "BULK_SCAN",
        status: "PENDING",
        branch: repoInfo.defaultBranch,
        bulkScanJobId: bulkJob.id,
      },
    });

    scanJobs.push({
      scanId: scan.id,
      repoFullName: repoInfo.fullName,
      defaultBranch: repoInfo.defaultBranch,
    });
  }

  // Enqueue all scans
  for (const job of scanJobs) {
    await bulkScanQueue.add(`bulk-${job.repoFullName}`, {
      scanId: job.scanId,
      repoFullName: job.repoFullName,
      defaultBranch: job.defaultBranch,
      bulkScanJobId: bulkJob.id,
      totalRepos: repoList.length,
    });
  }

  return NextResponse.json({
    jobId: bulkJob.id,
    totalRepos: repoList.length,
    repos: repoList.map((r) => r.fullName),
  });
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}
