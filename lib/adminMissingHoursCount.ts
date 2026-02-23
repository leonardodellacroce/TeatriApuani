import { prisma } from "@/lib/prisma";

/**
 * Conta i turni (assignment-user) con ore non inserite.
 * Finestra: 1° mese precedente → ieri compreso.
 */
export async function computeAdminMissingHoursCount(): Promise<number> {
  const now = new Date();
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  const todayStr = fmt(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const firstOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  firstOfPrevMonth.setUTCHours(0, 0, 0, 0);
  const endOfYesterday = new Date(yesterday);
  endOfYesterday.setUTCHours(23, 59, 59, 999);

  const assignments = await prisma.assignment.findMany({
    where: {
      taskType: { is: { type: "SHIFT" } },
      workday: {
        date: {
          gte: firstOfPrevMonth,
          lte: endOfYesterday,
        },
      },
    },
    include: {
      workday: { select: { date: true } },
      timeEntries: { select: { userId: true } },
    },
  });

  const getUserIds = (a: (typeof assignments)[0]): string[] => {
    const ids: string[] = [];
    if (a.userId) ids.push(a.userId);
    if (a.assignedUsers) {
      try {
        const parsed = JSON.parse(a.assignedUsers);
        if (Array.isArray(parsed)) {
          parsed.forEach((u: any) => {
            const uid = typeof u === "string" ? u : u?.userId;
            if (uid && !ids.includes(uid)) ids.push(uid);
          });
        }
      } catch {}
    }
    return ids;
  };

  let count = 0;
  for (const a of assignments) {
    const wdDate = a.workday.date;
    const dateStr = fmt(wdDate instanceof Date ? wdDate : new Date(String(wdDate)));
    if (dateStr >= todayStr) continue;

    const userIds = getUserIds(a);
    for (const uid of userIds) {
      const hasEntry = a.timeEntries.some((te) => te.userId === uid);
      if (!hasEntry) count++;
    }
  }

  return count;
}
