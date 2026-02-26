import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createCodeReviewAttestation,
  createAttackScanAttestation,
  getAttestationUrl,
} from "@/lib/eas";

export async function POST(request: NextRequest) {
  // Validate internal API key
  const authHeader = request.headers.get("authorization");
  const expectedKey = process.env.CARAPACE_API_KEY;

  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { type, scanId } = body;

  if (!type || !scanId) {
    return NextResponse.json(
      { error: "type and scanId are required" },
      { status: 400 },
    );
  }

  let attestationUid: string | null = null;

  if (type === "code-review") {
    // Verify scan exists and pull trusted data from DB
    const scan = await prisma.scan.findUnique({
      where: { id: scanId },
      include: {
        repo: { select: { fullName: true } },
        _count: { select: { findings: true } },
      },
    });
    if (!scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }
    attestationUid = await createCodeReviewAttestation({
      repoFullName: scan.repo.fullName,
      commitSha: scan.commitSha ?? "",
      score: scan.score ?? 0,
      grade: scan.grade ?? "F",
      findingCount: scan._count.findings,
    });

    if (attestationUid) {
      await prisma.scan.update({
        where: { id: scanId },
        data: { attestationUid },
      });
    }
  } else if (type === "attack-scan") {
    // Verify attack scan exists and pull trusted data from DB
    const attackScan = await prisma.attackScan.findUnique({
      where: { id: scanId },
      include: { _count: { select: { findings: true } } },
    });
    if (!attackScan) {
      return NextResponse.json({ error: "Attack scan not found" }, { status: 404 });
    }
    attestationUid = await createAttackScanAttestation({
      targetUrl: attackScan.targetUrl,
      scanType: attackScan.scanType,
      score: body.score ?? 0,
      grade: body.grade ?? "F",
      findingCount: attackScan._count.findings,
    });

    if (attestationUid) {
      await prisma.attackScan.update({
        where: { id: scanId },
        data: { attestationUid },
      });
    }
  } else {
    return NextResponse.json(
      { error: "type must be 'code-review' or 'attack-scan'" },
      { status: 400 },
    );
  }

  if (!attestationUid) {
    return NextResponse.json(
      { error: "Attestation not created (EAS not configured or tx failed)" },
      { status: 503 },
    );
  }

  return NextResponse.json({
    attestationUid,
    url: getAttestationUrl(attestationUid),
  });
}
