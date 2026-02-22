import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// POST /api/admin/notify-missing-hours
// Notifica manuale: crea MISSING_HOURS_REMINDER per i dipendenti con ore non inserite
// nel periodo e con i filtri passati (come nella tabella Turni e Ore).
// Solo ADMIN, SUPER_ADMIN, RESPONSABILE.
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole =
      (session.user as any).role ||
      ((session.user as any).isSuperAdmin ? "SUPER_ADMIN" : (session.user as any).isAdmin ? "ADMIN" : (session.user as any).isResponsabile ? "RESPONSABILE" : "");
    const allowedRoles = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"];
    if (!allowedRoles.includes(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let companyIdFilter: string | null = null;
    if (userRole === "RESPONSABILE") {
      const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { companyId: true },
      });
      if (!currentUser?.companyId) {
        return NextResponse.json({ error: "Non sei associato ad un'azienda" }, { status: 403 });
      }
      companyIdFilter = currentUser.companyId;
    }

    const body = await req.json().catch(() => ({}));
    const startDate = body.startDate as string | undefined;
    const endDate = body.endDate as string | undefined;
    const userIdFilter = body.userId as string | undefined;
    const onlyMissingHours = body.onlyMissingHours === true;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate e endDate sono obbligatori" },
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);

    // Utenti lavoratori (come nel cron), esclusi disattivati e archiviati
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
        ...(companyIdFilter && { companyId: companyIdFilter }),
      },
      select: { id: true },
    });
    const workerIds = new Set(workers.map((w) => w.id));

    const assignments = await prisma.assignment.findMany({
      where: {
        taskType: { is: { type: "SHIFT" } },
        workday: {
          date: {
            gte: start,
            lte: end,
          },
        },
      },
      include: {
        workday: { select: { date: true } },
        timeEntries: { select: { userId: true } },
      },
    });

    // Solo turni precedenti a oggi (Europe/Rome)
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
        if (userIdFilter && uid !== userIdFilter) continue;
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
    const failed: string[] = [];
    for (const [userId, dates] of missingByUser) {
      if (dates.size === 0) continue;
      if (!userId || typeof userId !== "string" || userId.trim() === "") continue;

      const sortedDates = Array.from(dates).sort();
      const formattedDates = sortedDates.map((d) => {
        const [y, m, day] = d.split("-");
        return `${day}/${m}/${y}`;
      });
      const message = `Hai ore non ancora inserite per i turni del ${formattedDates.join(", ")}. Inseriscile da I Miei Turni.`;

      try {
        await prisma.notification.create({
          data: {
            userId: userId.trim(),
            type: "MISSING_HOURS_REMINDER",
            title: "Orari da inserire",
            message,
            metadata: { dates: sortedDates },
            read: false,
          },
        });
        created++;
      } catch (err) {
        console.error(`Failed to create notification for user ${userId}:`, err);
        failed.push(userId);
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      usersNotified: created,
      ...(failed.length > 0 && {
        failed: failed.length,
        failedUserIds: process.env.NODE_ENV === "development" ? failed : undefined,
      }),
    });
  } catch (error) {
    console.error("Admin notify-missing-hours error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json(
      {
        error: "Operazione fallita",
        details: msg,
        ...(process.env.NODE_ENV === "development" && stack && { stack }),
      },
      { status: 500 }
    );
  }
}
