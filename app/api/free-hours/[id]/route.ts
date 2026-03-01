import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getWorkModeFromRequest } from "@/lib/workMode";
import { notifyAdminsFreeHoursChangedByWorker, notifyWorkerFreeHours } from "@/lib/notifications";

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Normalizza endTime quando il turno supera mezzanotte (es. 11:00-02:00 → end diventa 26:00). */
function normalizeEndMinutes(start: string, end: string): number {
  const startM = timeToMinutes(start);
  const endM = timeToMinutes(end);
  if (endM <= startM && startM > 0) return endM + 24 * 60; // oltre mezzanotte
  return endM;
}

function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  const aS = timeToMinutes(aStart);
  let aE = normalizeEndMinutes(aStart, aEnd);
  const bS = timeToMinutes(bStart);
  let bE = normalizeEndMinutes(bStart, bEnd);
  return aS < bE && bS < aE;
}

/** PATCH /api/free-hours/[id] - Modifica ore libere. Solo lavoratore proprietario, solo se PENDING. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as any).role || "";
    const isWorker = (session.user as any).isWorker === true;
    const workMode = getWorkModeFromRequest(req);

    if (!isWorker) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole) && workMode === "admin") {
      return NextResponse.json({ error: "Passa in modalità lavoratore" }, { status: 403 });
    }

    const { id } = await params;
    const entry = await prisma.freeHoursEntry.findUnique({
      where: { id },
      include: { user: { select: { name: true, cognome: true, companyId: true } } },
    });

    if (!entry) {
      return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    }
    if (entry.userId !== session.user.id) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }
    if (entry.status !== "PENDING") {
      return NextResponse.json({ error: "Non è possibile modificare ore già convertite" }, { status: 400 });
    }

    const body = await req.json();
    const { date, startTime, endTime, actualBreaks, notes, taskTypeId, dutyId, locationId } = body;

    if (!date || !startTime || !endTime) {
      return NextResponse.json(
        { error: "date, startTime e endTime sono obbligatori" },
        { status: 400 }
      );
    }

    const effectiveTaskTypeId = taskTypeId && typeof taskTypeId === "string" ? taskTypeId : entry.taskTypeId;
    if (!effectiveTaskTypeId) {
      return NextResponse.json(
        { error: "La tipologia di turno è obbligatoria" },
        { status: 400 }
      );
    }

    const taskType = await prisma.taskType.findFirst({
      where: { id: effectiveTaskTypeId, type: "SHIFT" },
      select: { id: true },
    });
    if (!taskType) {
      return NextResponse.json(
        { error: "Tipologia di turno non valida" },
        { status: 400 }
      );
    }

    const effectiveDutyId = dutyId && typeof dutyId === "string" ? dutyId : entry.dutyId;
    if (!effectiveDutyId) {
      return NextResponse.json(
        { error: "La mansione svolta è obbligatoria" },
        { status: 400 }
      );
    }

    const effectiveLocationId = locationId && typeof locationId === "string" ? locationId : entry.locationId;
    if (!effectiveLocationId) {
      return NextResponse.json(
        { error: "La location è obbligatoria" },
        { status: 400 }
      );
    }

    const duty = await prisma.duty.findUnique({
      where: { id: effectiveDutyId },
      select: { area: true },
    });
    const areaName = duty ? duty.area : entry.area;

    const breaks = Array.isArray(actualBreaks)
      ? actualBreaks.filter((b: unknown) => b && typeof b === "object" && "start" in b && "end" in b)
      : [];

    const calculateHours = (start: string, end: string, brks: Array<{ start: string; end: string }>): number => {
      let total = timeToMinutes(end) - timeToMinutes(start);
      for (const b of brks) {
        total -= Math.max(0, timeToMinutes(b.end) - timeToMinutes(b.start));
      }
      return Math.max(0, total) / 60;
    };

    const hoursWorked = calculateHours(startTime, endTime, breaks);
    if (hoursWorked <= 0) {
      return NextResponse.json(
        { error: "Le ore lavorate devono essere maggiori di zero" },
        { status: 400 }
      );
    }

    const dateStr = new Date(date).toISOString().slice(0, 10);

    // Validazione: sovrapposizione con TimeEntry (ore già inserite per eventi)
    const dayStart = new Date(dateStr + "T00:00:00.000Z");
    const dayEnd = new Date(dateStr + "T23:59:59.999Z");

    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        userId: session.user.id,
        date: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      select: { startTime: true, endTime: true },
    });

    for (const te of timeEntries) {
      const teStart = te.startTime || "00:00";
      const teEnd = te.endTime || "23:59";
      if (rangesOverlap(startTime, endTime, teStart, teEnd)) {
        return NextResponse.json(
          { error: "Le ore libere si sovrappongono con ore già inserite per questa data" },
          { status: 400 }
        );
      }
    }

    // Validazione: sovrapposizione con altre ore libere (PENDING) dello stesso lavoratore, escludendo questa
    const fhDayStart = new Date(dateStr + "T00:00:00.000Z");
    const fhDayEnd = new Date(dateStr + "T23:59:59.999Z");
    const existingFreeHours = await prisma.freeHoursEntry.findMany({
      where: {
        userId: session.user.id,
        status: "PENDING",
        id: { not: id },
        date: {
          gte: fhDayStart,
          lte: fhDayEnd,
        },
      },
      select: { startTime: true, endTime: true },
    });

    for (const fh of existingFreeHours) {
      const fhStart = fh.startTime || "00:00";
      const fhEnd = fh.endTime || "23:59";
      if (rangesOverlap(startTime, endTime, fhStart, fhEnd)) {
        return NextResponse.json(
          { error: "Le ore libere si sovrappongono con altre ore libere già inserite per questa data" },
          { status: 400 }
        );
      }
    }

    // Validazione: turni programmati (Assignment) senza ore ancora inserite (TimeEntry)
    const workdayDayStart = new Date(dateStr + "T00:00:00.000Z");
    const workdayDayEnd = new Date(dateStr + "T23:59:59.999Z");
    const workdays = await prisma.workday.findMany({
      where: { date: { gte: workdayDayStart, lte: workdayDayEnd } },
      include: {
        assignments: {
          where: { taskType: { type: "SHIFT" } },
          include: { timeEntries: { where: { userId: session.user.id }, select: { id: true } } },
        },
      },
    });

    const isUserAssigned = (a: { userId: string | null; assignedUsers: string | null }) => {
      if (a.userId === session.user.id) return true;
      if (!a.assignedUsers) return false;
      try {
        const arr = JSON.parse(a.assignedUsers) as Array<{ userId?: string }>;
        return Array.isArray(arr) && arr.some((x) => x.userId === session.user.id);
      } catch {
        return false;
      }
    };

    for (const wd of workdays) {
      for (const a of wd.assignments) {
        if (!isUserAssigned(a)) continue;
        if (a.timeEntries.length > 0) continue; // ha già inserito le ore
        const aStart = a.startTime || wd.startTime || "00:00";
        const aEnd = a.endTime || wd.endTime || "23:59";
        if (rangesOverlap(startTime, endTime, aStart, aEnd)) {
          return NextResponse.json(
            {
              error:
                "Hai turni programmati per questa data che non hai ancora valorizzato. Inserisci prima le ore per i turni assegnati in I miei turni.",
            },
            { status: 400 }
          );
        }
      }
    }

    const updated = await prisma.freeHoursEntry.update({
      where: { id },
      data: {
        date: new Date(dateStr + "T12:00:00.000Z"),
        locationId: effectiveLocationId,
        startTime,
        endTime,
        hoursWorked,
        taskTypeId: effectiveTaskTypeId,
        dutyId: effectiveDutyId,
        area: areaName,
        actualBreaks: breaks.length > 0 ? JSON.stringify(breaks) : null,
        notes: notes || null,
      },
    });

    const workerName = [entry.user?.name, entry.user?.cognome].filter(Boolean).join(" ") || "Lavoratore";
    const detail = `${dateStr} ${startTime}-${endTime} (${hoursWorked.toFixed(2)} ore)${notes ? `\nNote: ${notes}` : ""}`;
    notifyAdminsFreeHoursChangedByWorker(workerName, "MODIFIED", detail, entry.user?.companyId ?? null, id).catch((e) =>
      console.error("[free-hours] notifyAdminsFreeHoursChangedByWorker error:", e)
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/free-hours/[id] error:", error);
    return NextResponse.json({ error: "Errore nell'aggiornamento" }, { status: 500 });
  }
}

/** DELETE /api/free-hours/[id] - Elimina ore libere. Lavoratore proprietario o admin, solo se PENDING. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as any).role || "";
    const isAdmin = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole);
    const isWorker = (session.user as any).isWorker === true;
    const workMode = getWorkModeFromRequest(req);

    const { id } = await params;
    const entry = await prisma.freeHoursEntry.findUnique({
      where: { id },
      include: { user: { select: { name: true, cognome: true, companyId: true } } },
    });

    if (!entry) {
      return NextResponse.json({ error: "Non trovato" }, { status: 404 });
    }
    if (entry.status !== "PENDING") {
      return NextResponse.json({ error: "Non è possibile eliminare ore già convertite" }, { status: 400 });
    }

    // Admin in modalità admin può eliminare; altrimenti solo il lavoratore proprietario
    const canDeleteAsAdmin = isAdmin && workMode === "admin";
    const canDeleteAsOwner = isWorker && entry.userId === session.user.id && (workMode !== "admin" || !isAdmin);

    if (!canDeleteAsAdmin && !canDeleteAsOwner) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    const dateStr = entry.date.toISOString().slice(0, 10);
    const detail = `${dateStr} ${entry.startTime}-${entry.endTime} (${entry.hoursWorked.toFixed(2)} ore)${entry.notes ? `\nNote: ${entry.notes}` : ""}`;

    if (canDeleteAsAdmin) {
      notifyWorkerFreeHours(entry.userId, "DELETED", detail, { dateFrom: dateStr, dateTo: dateStr }).catch((e) =>
        console.error("[free-hours] notifyWorkerFreeHours DELETED error:", e)
      );
    } else {
      const workerName = [entry.user?.name, entry.user?.cognome].filter(Boolean).join(" ") || "Lavoratore";
      notifyAdminsFreeHoursChangedByWorker(workerName, "DELETED", detail, entry.user?.companyId ?? null, id).catch((e) =>
        console.error("[free-hours] notifyAdminsFreeHoursChangedByWorker error:", e)
      );
    }

    await prisma.freeHoursEntry.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/free-hours/[id] error:", error);
    return NextResponse.json({ error: "Errore nell'eliminazione" }, { status: 500 });
  }
}
