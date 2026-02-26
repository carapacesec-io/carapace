import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scheduleSyncQueue } from "@/lib/queue";
import { z } from "zod";
import { logger } from "@carapacesecurity/engine";

const cronRegex = /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/;

const updateScheduleSchema = z.object({
  scheduleEnabled: z.boolean(),
  scheduleCron: z
    .string()
    .regex(cronRegex, "Invalid cron expression")
    .nullable()
    .optional(),
  scheduleTimezone: z.string().default("UTC"),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const repo = await prisma.repo.findUnique({
      where: { id },
      include: { settings: true },
    });

    if (!repo || repo.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      scheduleEnabled: repo.settings?.scheduleEnabled ?? false,
      scheduleCron: repo.settings?.scheduleCron ?? null,
      scheduleTimezone: repo.settings?.scheduleTimezone ?? "UTC",
      lastScheduledAt: repo.settings?.lastScheduledAt ?? null,
    });
  } catch (error) {
    logger.error(`Failed to get schedule: ${(error as Error).message}`);
    return NextResponse.json(
      { error: "Failed to get schedule" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const repo = await prisma.repo.findUnique({ where: { id } });
    if (!repo || repo.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateScheduleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { scheduleEnabled, scheduleCron, scheduleTimezone } = parsed.data;

    // If enabling, require a cron expression
    if (scheduleEnabled && !scheduleCron) {
      return NextResponse.json(
        { error: "scheduleCron is required when enabling schedule" },
        { status: 400 },
      );
    }

    const settings = await prisma.repoSettings.upsert({
      where: { repoId: id },
      update: {
        scheduleEnabled,
        scheduleCron: scheduleEnabled ? scheduleCron : null,
        scheduleTimezone,
      },
      create: {
        repoId: id,
        scheduleEnabled,
        scheduleCron: scheduleEnabled ? scheduleCron : null,
        scheduleTimezone,
      },
    });

    // Enqueue a schedule-sync job so the worker re-syncs repeatable jobs
    await scheduleSyncQueue.add("sync", {});

    return NextResponse.json({
      scheduleEnabled: settings.scheduleEnabled,
      scheduleCron: settings.scheduleCron,
      scheduleTimezone: settings.scheduleTimezone,
      lastScheduledAt: settings.lastScheduledAt,
    });
  } catch (error) {
    logger.error(`Failed to update schedule: ${(error as Error).message}`);
    return NextResponse.json(
      { error: "Failed to update schedule" },
      { status: 500 },
    );
  }
}
