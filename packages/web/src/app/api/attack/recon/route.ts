import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateTargetUrl } from "@/lib/attack/validate-target";
import { runRecon } from "@/lib/attack/recon";
import { withX402 } from "@/lib/x402-middleware";
import { logger } from "@carapacesecurity/engine";

async function handleRecon(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { target } = body;

  if (!target || typeof target !== "string") {
    return NextResponse.json({ error: "target URL is required" }, { status: 400 });
  }

  const validation = validateTargetUrl(target);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // Create scan record
  const scan = await prisma.attackScan.create({
    data: {
      userId: session.user.id,
      targetUrl: target,
      scanType: "RECON",
      status: "RUNNING",
    },
  });

  try {
    const reconFindings = await runRecon(target);

    // Save findings
    if (reconFindings.length > 0) {
      await prisma.attackFinding.createMany({
        data: reconFindings.map((f) => ({
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
          findingsCount: reconFindings.length,
          bySeverity: reconFindings.reduce(
            (acc, f) => {
              acc[f.severity] = (acc[f.severity] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>,
          ),
        },
      },
    });

    return NextResponse.json({
      scanId: scan.id,
      target,
      findings: reconFindings,
      summary: `Recon scan completed. Found ${reconFindings.length} issue(s).`,
    });
  } catch (error) {
    await prisma.attackScan.update({
      where: { id: scan.id },
      data: { status: "FAILED" },
    });
    logger.error(`Recon scan failed: ${(error as Error).message}`);
    return NextResponse.json(
      { error: "Scan failed" },
      { status: 500 },
    );
  }
}

const wrappedRecon = withX402("$0.01", handleRecon);

export async function POST(request: NextRequest) {
  return wrappedRecon(request);
}
