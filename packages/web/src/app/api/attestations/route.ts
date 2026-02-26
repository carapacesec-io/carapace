import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAttestationUrl } from "@/lib/eas";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const [scans, attackScans] = await Promise.all([
    prisma.scan.findMany({
      where: { userId, attestationUid: { not: null } },
      select: {
        id: true,
        type: true,
        attestationUid: true,
        createdAt: true,
        repo: { select: { fullName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.attackScan.findMany({
      where: { userId, attestationUid: { not: null } },
      select: {
        id: true,
        scanType: true,
        targetUrl: true,
        attestationUid: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const attestations = [
    ...scans.map((s) => ({
      scanId: s.id,
      type: s.type,
      repoFullName: s.repo.fullName,
      attestationUid: s.attestationUid!,
      attestationUrl: getAttestationUrl(s.attestationUid!),
      createdAt: s.createdAt,
    })),
    ...attackScans.map((s) => ({
      scanId: s.id,
      type: s.scanType,
      targetUrl: s.targetUrl,
      attestationUid: s.attestationUid!,
      attestationUrl: getAttestationUrl(s.attestationUid!),
      createdAt: s.createdAt,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return NextResponse.json({ attestations });
}
