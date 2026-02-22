import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/cron/notify-missing-hours
// Chiamato da Vercel Cron ogni giorno alle 8:00 (Europe/Rome)
// Notifica i lavoratori che non hanno inserito le ore per i turni passati.
// Finestra: dal 1° del mese precedente a ieri.
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Oggi in Europe/Rome, ieri
    const now = new Date();
    const romeOffset = 60; // UTC+1 in winter, UTC+2 in summer - semplificato
    const todayRome = new Date(now.getTime() + romeOffset * 60 * 1000);
    const yesterday = new Date(todayRome);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setUTCHours(23, 59, 59, 999);

    // 1° del mese precedente
    const firstOfPrevMonth = new Date(todayRome.getFullYear(), todayRome.getMonth() - 1, 1);
    firstOfPrevMonth.setUTCHours(0, 0, 0, 0);

    const startDate = firstOfPrevMonth;
    const endDate = yesterday;

    // Utenti lavoratori: standard (non admin) O isWorker, esclusi disattivati e archiviati
    const workers = await prisma.user.findMany({
      where: {
        isArchived: false,
        isActive: true,
        OR: [
          {
            isSuperAdmin: false,
            isAdmin: false,
            isResponsabile: false,
          },
          { isWorker: true },
        ],
      },
      select: { id: true },
    });
    const workerIds = new Set(workers.map((w) => w.id));

    // Assignment SHIFT nel periodo, con workday e timeEntries
    const assignments = await prisma.assignment.findMany({
      where: {
        taskType: { is: { type: "SHIFT" } },
        workday: {
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
      },
      include: {
        workday: { select: { date: true } },
        timeEntries: { select: { userId: true } },
      },
    });

    // Oggi in Europe/Rome - solo turni precedenti a oggi
    const todayStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const missingByUser = new Map<string, Set<string>>();

    for (const a of assignments) {
      const wdDate = a.workday.date;
      const dateStr =
        wdDate instanceof Date
          ? wdDate.toISOString().slice(0, 10)
          : String(wdDate).slice(0, 10);

      if (dateStr >= todayStr) continue; // Escludi oggi e futuro

      const getUserIds = (): string[] => {
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

      const userIds = getUserIds();
      for (const uid of userIds) {
        if (!workerIds.has(uid)) continue;
        const hasEntry = a.timeEntries.some((te) => te.userId === uid);
        if (!hasEntry) {
          if (!missingByUser.has(uid)) {
            missingByUser.set(uid, new Set());
          }
          missingByUser.get(uid)!.add(dateStr);
        }
      }
    }

    let created = 0;

    for (const [userId, dates] of missingByUser) {
      if (dates.size === 0) continue;

      const sortedDates = Array.from(dates).sort();
      const formattedDates = sortedDates.map((d) => {
        const [y, m, day] = d.split("-");
        return `${day}/${m}/${y}`;
      });
      const message = `Hai ore non ancora inserite per i turni del ${formattedDates.join(", ")}. Inseriscile da I Miei Turni.`;

      // Evita duplicati: non creare se esiste già una notifica dello stesso tipo nelle ultime 20 ore
      const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000);
      const existing = await prisma.notification.findFirst({
        where: {
          userId,
          type: "MISSING_HOURS_REMINDER",
          createdAt: { gte: twentyHoursAgo },
        },
      });

      if (!existing) {
        await prisma.notification.create({
          data: {
            userId,
            type: "MISSING_HOURS_REMINDER",
            title: "Orari da inserire",
            message,
            metadata: { dates: sortedDates },
            read: false,
          },
        });
        created++;
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      usersNotified: created,
    });
  } catch (error) {
    console.error("Cron notify-missing-hours error:", error);
    return NextResponse.json(
      { error: "Cron failed", details: String(error) },
      { status: 500 }
    );
  }
}
