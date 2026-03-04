import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getNotificationTypeSetting } from "@/lib/notifications";

function isUserAssignedToAssignment(
  assignment: { userId: string | null; assignedUsers: string | null },
  userId: string
): boolean {
  if (assignment.userId === userId) return true;
  if (!assignment.assignedUsers) return false;
  try {
    const parsed = JSON.parse(assignment.assignedUsers);
    if (!Array.isArray(parsed)) return false;
    const found = parsed.some((u: unknown) => {
      if (typeof u === "string") return u === userId;
      if (u && typeof u === "object" && "userId" in u) return (u as { userId: string }).userId === userId;
      return false;
    });
    if (found) return true;
    return parsed.some(
      (u: unknown) =>
        u && typeof u === "object" && ((u as { id?: string }).id === userId || (u as { user_id?: string }).user_id === userId)
    );
  } catch {
    return false;
  }
}

// GET /api/cron/notify-daily-shift-reminder
// Chiamato da Vercel Cron ogni mattina alle 7:00 UTC
// Notifica i lavoratori che hanno turni nella giornata odierna.
export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET?.trim();
    const authHeader = req.headers.get("authorization");
    const url = new URL(req.url);
    const secretParam = url.searchParams.get("secret")?.trim();
    const valid =
      cronSecret &&
      (authHeader === `Bearer ${cronSecret}` || secretParam === cronSecret);
    if (!valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const setting = await getNotificationTypeSetting("DAILY_SHIFT_REMINDER");
    if (setting && !setting.isActive) {
      return NextResponse.json({ ok: true, created: 0, skipped: "type_disabled" });
    }

    // Oggi in Europe/Rome
    const todayStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const startOfDay = new Date(todayStr + "T00:00:00.000Z");
    const endOfDay = new Date(todayStr + "T23:59:59.999Z");

    // Assignment SHIFT per oggi
    const assignments = await prisma.assignment.findMany({
      where: {
        taskType: { is: { type: "SHIFT" } },
        workday: {
          date: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      },
      include: {
        workday: { select: { date: true } },
      },
    });

    // Lavoratori con almeno un turno oggi
    const workersWithShifts = new Set<string>();
    for (const a of assignments) {
      const getUserIds = (): string[] => {
        const ids: string[] = [];
        if (a.userId) ids.push(a.userId);
        if (a.assignedUsers) {
          try {
            const parsed = JSON.parse(a.assignedUsers);
            if (Array.isArray(parsed)) {
              parsed.forEach((u: unknown) => {
                const uid = typeof u === "string" ? u : (u as { userId?: string })?.userId;
                if (uid && !ids.includes(uid)) ids.push(uid);
              });
            }
          } catch {}
        }
        return ids;
      };
      for (const uid of getUserIds()) {
        if (isUserAssignedToAssignment(a, uid)) {
          workersWithShifts.add(uid);
        }
      }
    }

    // Solo utenti lavoratori attivi
    const workers = await prisma.user.findMany({
      where: {
        id: { in: Array.from(workersWithShifts) },
        isArchived: false,
        isActive: true,
        isWorker: true,
      },
      select: { id: true },
    });
    const workerIds = new Set(workers.map((w) => w.id));

    let created = 0;

    for (const userId of workerIds) {
      // Evita duplicati: non creare se esiste già una notifica oggi
      const existing = await prisma.notification.findFirst({
        where: {
          userId,
          type: "DAILY_SHIFT_REMINDER",
          createdAt: { gte: startOfDay },
        },
      });

      if (existing) continue;

      // Segna come lette le precedenti DAILY_SHIFT_REMINDER non lette (mostriamo solo l'ultima)
      await prisma.notification.updateMany({
        where: {
          userId,
          type: "DAILY_SHIFT_REMINDER",
          read: false,
        },
        data: { read: true },
      });

      await prisma.notification.create({
        data: {
          userId,
          type: "DAILY_SHIFT_REMINDER",
          title: "Promemoria turni giornalieri",
          message: "Hai turni oggi. Controlla i dettagli su I Miei Turni.",
          metadata: { date: todayStr },
          priority: setting?.priority ?? "MEDIUM",
          read: false,
        },
      });
      created++;
    }

    return NextResponse.json({
      ok: true,
      created,
      usersNotified: created,
      date: todayStr,
    });
  } catch (error) {
    console.error("Cron notify-daily-shift-reminder error:", error);
    return NextResponse.json(
      { error: "Cron failed", details: String(error) },
      { status: 500 }
    );
  }
}
