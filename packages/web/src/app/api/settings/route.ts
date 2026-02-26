import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logger } from "@carapace/engine";

const updateSettingsSchema = z.object({
  severityThreshold: z
    .enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"])
    .optional(),
  autoReview: z.boolean().optional(),
  ignoredPaths: z.array(z.string()).optional(),
  enabledRulesets: z.array(z.string()).optional(),
  slackWebhookUrl: z.string().url().nullable().optional(),
  discordWebhookUrl: z.string().url().nullable().optional(),
  notifyOnScheduled: z.boolean().optional(),
  notifyOnCritical: z.boolean().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let settings = await prisma.userSettings.findUnique({
      where: { userId: session.user.id },
    });

    if (!settings) {
      settings = await prisma.userSettings.create({
        data: {
          userId: session.user.id,
        },
      });
    }

    return NextResponse.json({
      ...settings,
      slackWebhookUrl: settings.slackWebhookUrl
        ? "..." + settings.slackWebhookUrl.slice(-8)
        : null,
      discordWebhookUrl: settings.discordWebhookUrl
        ? "..." + settings.discordWebhookUrl.slice(-8)
        : null,
    });
  } catch (error) {
    logger.error(`Failed to get settings: ${(error as Error).message}`);
    return NextResponse.json(
      { error: "Failed to get settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = updateSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const settings = await prisma.userSettings.upsert({
      where: { userId: session.user.id },
      update: parsed.data,
      create: {
        userId: session.user.id,
        ...parsed.data,
      },
    });

    return NextResponse.json(settings);
  } catch (error) {
    logger.error(`Failed to update settings: ${(error as Error).message}`);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
