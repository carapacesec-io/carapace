import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reviewQueue } from "@/lib/queue";
import { verifyWebhookSignature } from "@/lib/github";
import { logger } from "@carapace/engine";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get("x-hub-signature-256");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing signature header" },
        { status: 401 }
      );
    }

    const isValid = await verifyWebhookSignature(payload, signature);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const event = request.headers.get("x-github-event");
    const body = JSON.parse(payload);

    if (event === "pull_request") {
      return await handlePullRequestEvent(body);
    }

    if (event === "installation") {
      return await handleInstallationEvent(body);
    }

    return NextResponse.json({ message: "Event ignored" }, { status: 200 });
  } catch (error) {
    logger.error(`Webhook processing error: ${(error as Error).message}`);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function handlePullRequestEvent(body: {
  action: string;
  pull_request: {
    number: number;
    title: string;
    head: { sha: string; ref: string };
  };
  repository: { id: number; full_name: string };
  installation?: { id: number };
  sender?: { login: string; type: string };
}) {
  const { action, pull_request, repository } = body;

  if (!["opened", "synchronize", "reopened"].includes(action)) {
    return NextResponse.json(
      { message: "PR action ignored" },
      { status: 200 }
    );
  }

  // Bot loop prevention: skip if the event was triggered by a bot
  // (e.g. Carapace pushing auto-fix commits)
  if (body.sender?.type === "Bot") {
    return NextResponse.json(
      { message: "Bot event ignored (loop prevention)" },
      { status: 200 }
    );
  }

  const repo = await prisma.repo.findUnique({
    where: { githubId: repository.id },
  });

  if (!repo) {
    return NextResponse.json(
      { message: "Repository not connected" },
      { status: 200 }
    );
  }

  if (!repo.isActive) {
    return NextResponse.json(
      { message: "Repository is inactive" },
      { status: 200 }
    );
  }

  const scan = await prisma.scan.create({
    data: {
      repoId: repo.id,
      userId: repo.userId,
      type: "PR_REVIEW",
      status: "PENDING",
      prNumber: pull_request.number,
      prTitle: pull_request.title,
      commitSha: pull_request.head.sha,
      branch: pull_request.head.ref,
    },
  });

  const [owner, repoName] = repo.fullName.split("/");

  await reviewQueue.add(
    `pr-review-${repo.id}-${pull_request.number}`,
    {
      scanId: scan.id,
      repoId: repo.id,
      installationId: repo.installationId,
      owner,
      repo: repoName,
      prNumber: pull_request.number,
      commitSha: pull_request.head.sha,
      branch: pull_request.head.ref,
    },
    {
      jobId: `pr-${repo.id}-${pull_request.number}-${pull_request.head.sha}`,
    }
  );

  return NextResponse.json(
    { message: "Scan enqueued", scanId: scan.id },
    { status: 200 }
  );
}

async function handleInstallationEvent(body: {
  action: string;
  installation: { id: number; account: { login: string; id: number } };
  repositories?: Array<{ id: number; full_name: string }>;
}) {
  const { action, installation } = body;

  if (action === "created") {
    // Store the installation ID on the user's record if we can match by GitHub account
    const user = await prisma.user.findUnique({
      where: { githubId: String(installation.account.id) },
    });

    if (user) {
      // Mark any repos from this installation that we already track
      if (body.repositories) {
        for (const ghRepo of body.repositories) {
          await prisma.repo.upsert({
            where: { githubId: ghRepo.id },
            update: { installationId: installation.id, isActive: true },
            create: {
              userId: user.id,
              installationId: installation.id,
              githubId: ghRepo.id,
              fullName: ghRepo.full_name,
            },
          });
        }
      }
    }

    return NextResponse.json(
      { message: "Installation created" },
      { status: 200 }
    );
  }

  if (action === "deleted") {
    // Deactivate all repos associated with this installation
    await prisma.repo.updateMany({
      where: { installationId: installation.id },
      data: { isActive: false },
    });

    return NextResponse.json(
      { message: "Installation removed" },
      { status: 200 }
    );
  }

  return NextResponse.json(
    { message: "Installation action ignored" },
    { status: 200 }
  );
}
