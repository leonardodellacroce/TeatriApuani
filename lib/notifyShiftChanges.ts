import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getNotificationTypeSetting } from "@/lib/notifications";

export type NotifyShiftChangesResult = {
  ok: boolean;
  created: number;
  updated: number;
  usersNotified: number;
  skipped?: string;
};

/** Esegue l'invio delle notifiche modifiche turni. Usato da cron e da admin. */
export async function runNotifyShiftChanges(): Promise<NotifyShiftChangesResult> {
  const setting = await getNotificationTypeSetting("SHIFT_CHANGES_REMINDER");
  if (setting && !setting.isActive) {
    return { ok: true, created: 0, updated: 0, usersNotified: 0, skipped: "type_disabled" };
  }

  const meta = (setting?.metadata as { daysAhead?: number }) ?? {};
  const daysAhead = Math.max(1, Math.min(90, meta.daysAhead ?? 30));

  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const startDate = new Date(todayStr + "T00:00:00.000Z");
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + daysAhead);

  const workers = await prisma.user.findMany({
    where: {
      isArchived: false,
      isActive: true,
      isWorker: true,
    },
    select: { id: true },
  });

  let created = 0;
  let updated = 0;

  for (const worker of workers) {
    const userId = worker.id;

    const lastRead = await prisma.notification.findFirst({
      where: {
        userId,
        type: "SHIFT_CHANGES_REMINDER",
        read: true,
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const since = lastRead?.createdAt ?? new Date(0);

    const lastSent = await prisma.notification.findFirst({
      where: {
        userId,
        type: "SHIFT_CHANGES_REMINDER",
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, read: true, message: true, metadata: true },
    });

    const changes = await prisma.assignmentChangeLog.findMany({
      where: {
        userId,
        workdayDate: { gte: startDate, lt: endDate },
        createdAt: { gt: since },
      },
      orderBy: { createdAt: "asc" },
    });

    if (changes.length === 0) {
      continue;
    }

    const lastSentAt = lastSent
      ? await prisma.notification.findUnique({
          where: { id: lastSent.id },
          select: { createdAt: true },
        })
      : null;
    const changesSinceLastSent = lastSentAt
      ? changes.filter((c) => c.createdAt > lastSentAt.createdAt)
      : changes;

    if (changesSinceLastSent.length === 0) {
      continue;
    }

    const message = buildShiftChangesMessage(
      lastSent && !lastSent.read ? changes : changesSinceLastSent
    );

    if (lastSent && !lastSent.read) {
      await prisma.notification.update({
        where: { id: lastSent.id },
        data: {
            message,
            metadata: { changeIds: changes.map((c) => c.id) } as Prisma.InputJsonValue,
          },
      });
      updated++;
    } else {
      await prisma.notification.create({
        data: {
          userId,
          type: "SHIFT_CHANGES_REMINDER",
          title: "Modifiche ai tuoi turni",
          message,
          metadata: { changeIds: changesSinceLastSent.map((c) => c.id) } as Prisma.InputJsonValue,
          priority: setting?.priority ?? "HIGH",
          read: false,
        },
      });
      created++;
    }
  }

  return {
    ok: true,
    created,
    updated,
    usersNotified: created + updated,
  };
}

function buildShiftChangesMessage(
  changes: Array<{
    action: string;
    workdayDate: Date;
    details: unknown;
  }>
): string {
  const lines: string[] = [];
  for (const c of changes) {
    const dateStr =
      c.workdayDate instanceof Date
        ? c.workdayDate.toISOString().slice(0, 10)
        : String(c.workdayDate).slice(0, 10);
    const [y, m, d] = dateStr.split("-");
    const formattedDate = `${d}/${m}/${y}`;

    const details = c.details as {
      eventTitle?: string;
      locationName?: string;
      taskTypeName?: string;
      startTime?: string | null;
      endTime?: string | null;
      area?: string | null;
    } | null;

    const eventPart = details?.eventTitle ?? "Evento";
    const locPart = details?.locationName ? `, ${details.locationName}` : "";
    const taskPart = details?.taskTypeName ? ` (${details.taskTypeName})` : "";
    const timePart =
      details?.startTime && details?.endTime
        ? ` ${details.startTime}-${details.endTime}`
        : "";

    let actionLabel: string;
    switch (c.action) {
      case "ADDED":
        actionLabel = "Inserito in turno";
        break;
      case "MODIFIED":
        actionLabel = "Turno modificato";
        break;
      case "REMOVED":
        actionLabel = "Rimosso da turno";
        break;
      default:
        actionLabel = c.action;
    }

    lines.push(`${formattedDate}: ${actionLabel} - ${eventPart}${locPart}${taskPart}${timePart}`);
  }
  return lines.join("\n");
}
