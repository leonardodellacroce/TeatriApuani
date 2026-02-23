import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getNotificationTypeSetting } from "@/lib/notifications";

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

    const missingSetting = await getNotificationTypeSetting("MISSING_HOURS_REMINDER");
    if (missingSetting && !missingSetting.isActive) {
      return NextResponse.json({ ok: true, created: 0, skipped: "type_disabled" });
    }

    const meta = (missingSetting?.metadata as { giorniIndietro?: number; giorniEsclusi?: number }) ?? {};
    const giorniIndietro = Math.max(1, Math.min(365, meta.giorniIndietro ?? 60));
    const giorniEsclusi = Math.max(0, Math.min(7, meta.giorniEsclusi ?? 1));

    // Oggi in Europe/Rome
    const todayStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const today = new Date(todayStr + "T12:00:00.000Z");

    // startDate = oggi - giorniIndietro (inizio del periodo)
    const startDate = new Date(today);
    startDate.setUTCDate(startDate.getUTCDate() - giorniIndietro);
    startDate.setUTCHours(0, 0, 0, 0);

    // endDate = ieri - giorniEsclusi (es. giorniEsclusi=1 → non considerare ieri, per dare tempo di inserire le ore)
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const endDate = new Date(yesterday);
    endDate.setUTCDate(endDate.getUTCDate() - giorniEsclusi);
    endDate.setUTCHours(23, 59, 59, 999);

    // Utenti lavoratori: solo isWorker=true (anche admin che sono anche lavoratori)
    const workers = await prisma.user.findMany({
      where: {
        isArchived: false,
        isActive: true,
        isWorker: true,
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

    const debug = req.nextUrl.searchParams.get("debug") === "1";

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
    const debugSkipped: Array<{ userId: string; userName?: string; reason: string }> = [];

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

      if (existing) {
        if (debug) {
          const u = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, cognome: true },
          });
          debugSkipped.push({
            userId,
            userName: [u?.name, u?.cognome].filter(Boolean).join(" ") || undefined,
            reason: `Notifica già inviata nelle ultime 20 ore (${existing.createdAt.toISOString()})`,
          });
        }
        continue;
      }

      await prisma.notification.create({
        data: {
          userId,
          type: "MISSING_HOURS_REMINDER",
          title: "Orari da inserire",
          message,
          metadata: { dates: sortedDates },
          priority: missingSetting?.priority ?? "HIGH",
          read: false,
        },
      });
      created++;
    }

    const res: Record<string, unknown> = {
      ok: true,
      created,
      usersNotified: created,
    };
    if (debug) {
      res.debug = {
        todayStr,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        giorniIndietro,
        giorniEsclusi,
        workersCount: workerIds.size,
        assignmentsCount: assignments.length,
        missingByUserCount: missingByUser.size,
        missingByUserDetail: Object.fromEntries(
          Array.from(missingByUser.entries()).map(([uid, dates]) => [uid, Array.from(dates)])
        ),
        skippedDueToExisting: debugSkipped,
      };
    }
    return NextResponse.json(res);
  } catch (error) {
    console.error("Cron notify-missing-hours error:", error);
    return NextResponse.json(
      { error: "Cron failed", details: String(error) },
      { status: 500 }
    );
  }
}
