import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/badge/:owner/:repo
 *
 * Returns a dynamic SVG badge showing the repo's security grade.
 * No auth required — designed for public embedding in READMEs.
 *
 * Usage: ![Security](https://carapacesec.io/api/badge/owner/repo)
 */

const GRADE_COLORS: Record<string, string> = {
  A: "#059669", // emerald-600
  B: "#2563eb", // blue-600
  C: "#d97706", // amber-600
  D: "#ea580c", // orange-600
  F: "#dc2626", // red-600
};

const DEDUCTIONS: Record<string, number> = {
  CRITICAL: 15,
  HIGH: 8,
  MEDIUM: 3,
  LOW: 1,
  INFO: 0,
};

function computeGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 55) return "D";
  return "F";
}

function renderBadge(grade: string, score: number): string {
  const color = GRADE_COLORS[grade] || GRADE_COLORS.F;
  const labelWidth = 68;
  const valueWidth = 52;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="24" role="img" aria-label="security: ${grade} ${score}">
  <title>security: ${grade} ${score}/100</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".2"/>
    <stop offset="1" stop-opacity=".15"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="24" rx="4" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="24" fill="#1a1a1a"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="24" fill="${color}"/>
    <rect width="${totalWidth}" height="24" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,sans-serif" font-size="11" font-weight="bold">
    <text x="${labelWidth / 2}" y="16.5" fill="#fff">security</text>
    <text x="${labelWidth + valueWidth / 2}" y="16.5" fill="#fff">${grade} ${score}</text>
  </g>
</svg>`;
}

function renderUnknownBadge(): string {
  const labelWidth = 68;
  const valueWidth = 52;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="24" role="img" aria-label="security: ?">
  <title>security: not scanned</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".2"/>
    <stop offset="1" stop-opacity=".15"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="24" rx="4" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="24" fill="#1a1a1a"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="24" fill="#999"/>
    <rect width="${totalWidth}" height="24" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,sans-serif" font-size="11" font-weight="bold">
    <text x="${labelWidth / 2}" y="16.5" fill="#fff">security</text>
    <text x="${labelWidth + valueWidth / 2}" y="16.5" fill="#fff">?</text>
  </g>
</svg>`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo: repoName } = await params;
  const fullName = `${owner}/${repoName}`;

  // Find the repo
  const repo = await prisma.repo.findFirst({
    where: { fullName },
  });

  if (!repo) {
    return new NextResponse(renderUnknownBadge(), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  }

  // Get the latest completed scan with findings
  const latestScan = await prisma.scan.findFirst({
    where: { repoId: repo.id, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    include: { findings: { select: { severity: true } } },
  });

  if (!latestScan) {
    return new NextResponse(renderUnknownBadge(), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  }

  // Compute score from findings
  let totalDeducted = 0;
  for (const f of latestScan.findings) {
    totalDeducted += DEDUCTIONS[f.severity] ?? 0;
  }
  const score = Math.max(0, Math.min(100, 100 - totalDeducted));
  const grade = computeGrade(score);

  return new NextResponse(renderBadge(grade, score), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
