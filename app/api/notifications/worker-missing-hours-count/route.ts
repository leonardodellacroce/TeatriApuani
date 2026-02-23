import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/** Conta le date con ore mancanti per il lavoratore (date < oggi).
 * Finestra: 1° mese precedente → ieri. Usato per badge "I Miei Turni".
 */
export async function GET() {
  try {
    const session = await auth();
    const userId = (session?.user as any)?.id ?? session?.user?.id;
    if (!userId || typeof userId !== "string" || userId.trim() === "") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isWorker = (session?.user as any)?.isWorker === true;
    if (!isWorker) {
      return NextResponse.json({ hasMissing: false, count: 0 });
    }

    const now = new Date();
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Rome",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    const todayStr = fmt(now);

    const firstOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    firstOfPrevMonth.setUTCHours(0, 0, 0, 0);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setUTCHours(23, 59, 59, 999);

    const assignments = await prisma.assignment.findMany({
      where: {
        taskType: { is: { type: "SHIFT" } },
        workday: {
          date: {
            gte: firstOfPrevMonth,
            lte: yesterday,
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

    const missingDates = new Set<string>();
    for (const a of assignments) {
      if (!getUserIds(a).includes(userId)) continue;
      const hasEntry = a.timeEntries.some((te) => te.userId === userId);
      if (hasEntry) continue;

      const wdDate = a.workday.date;
      const dateStr = fmt(wdDate instanceof Date ? wdDate : new Date(String(wdDate)));
      if (dateStr >= todayStr) continue;
      missingDates.add(dateStr);
    }

    return NextResponse.json({
      hasMissing: missingDates.size > 0,
      count: missingDates.size,
    });
  } catch (error) {
    console.error("GET /api/notifications/worker-missing-hours-count error", error);
    return NextResponse.json({ hasMissing: false, count: 0 }, { status: 200 });
  }
}
