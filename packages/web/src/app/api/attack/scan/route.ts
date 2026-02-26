import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateTargetUrl } from "@/lib/attack/validate-target";
import { runAuthAudit } from "@/lib/attack/auth-audit";
import { runApiScan } from "@/lib/attack/api-scan";
import { runFullPentest } from "@/lib/attack/full-pentest";
import { runRecon } from "@/lib/attack/recon";
import { withX402 } from "@/lib/x402-middleware";
import { createAttackScanAttestation } from "@/lib/eas";
import { logger } from "@carapacesecurity/engine";

const DEDUCTIONS: Record<string, number> = {
  CRITICAL: 15, HIGH: 8, MEDIUM: 3, LOW: 1, INFO: 0,
};

function computeScore(findings: { severity: string }[]) {
  let deducted = 0;
  for (const f of findings) deducted += DEDUCTIONS[f.severity] ?? 0;
  const score = Math.max(0, Math.min(100, 100 - deducted));
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 55 ? "D" : "F";
  return { score, grade };
}

async function handleScan(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { target, scanType = "RECON" } = body;

  if (!target || typeof target !== "string") {
    return NextResponse.json({ error: "target URL is required" }, { status: 400 });
  }

  const validation = validateTargetUrl(target);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const validTypes = ["RECON", "AUTH_AUDIT", "API_SCAN", "FULL_PENTEST"];
  if (!validTypes.includes(scanType)) {
    return NextResponse.json({ error: `Invalid scanType. Must be one of: ${validTypes.join(", ")}` }, { status: 400 });
  }

  // Create scan record
  const scan = await prisma.attackScan.create({
    data: {
      userId: session.user.id,
      targetUrl: target,
      scanType,
      status: "RUNNING",
    },
  });

  try {
    // Dispatch to the appropriate scan module
    let findings;
    switch (scanType) {
      case "AUTH_AUDIT":
        findings = await runAuthAudit(target);
        break;
      case "API_SCAN":
        findings = await runApiScan(target);
        break;
      case "FULL_PENTEST":
        findings = await runFullPentest(target);
        break;
      default:
        findings = await runRecon(target);
        break;
    }

    // Save findings
    if (findings.length > 0) {
      await prisma.attackFinding.createMany({
        data: findings.map((f) => ({
          scanId: scan.id,
          category: f.category,
          severity: f.severity,
          title: f.title,
          description: f.description,
          evidence: f.evidence,
          remediation: f.remediation,
        })),
      });
    }

    // Update scan status
    await prisma.attackScan.update({
      where: { id: scan.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        report: {
          target,
          scanType,
          findingsCount: findings.length,
          bySeverity: findings.reduce(
            (acc, f) => {
              acc[f.severity] = (acc[f.severity] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>,
          ),
        },
      },
    });

    // Fire-and-forget attestation
    const { score, grade } = computeScore(findings);
    createAttackScanAttestation({
      targetUrl: target,
      scanType,
      score,
      grade,
      findingCount: findings.length,
    })
      .then(async (uid) => {
        if (uid) {
          await prisma.attackScan.update({
            where: { id: scan.id },
            data: { attestationUid: uid },
          });
        }
      })
      .catch((err) =>
        logger.error("[attack-scan] Attestation failed (non-fatal): " + (err as Error).message),
      );

    return NextResponse.json({
      scanId: scan.id,
      target,
      findings,
      summary: `${scanType} scan completed. Found ${findings.length} issue(s).`,
    });
  } catch (error) {
    await prisma.attackScan.update({
      where: { id: scan.id },
      data: { status: "FAILED" },
    });
    logger.error(`${scanType} scan failed: ${(error as Error).message}`);
    return NextResponse.json(
      { error: "Scan failed" },
      { status: 500 },
    );
  }
}

const wrappedScan = withX402("$0.03", handleScan);

export async function POST(request: NextRequest) {
  return wrappedScan(request);
}
