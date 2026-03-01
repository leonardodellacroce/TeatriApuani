import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getWorkModeFromRequest } from "@/lib/workMode";
import { notifyAdminsFreeHoursAdded } from "@/lib/notifications";

function parseBreaks(actualBreaks: unknown, fallbackStart?: string | null, fallbackEnd?: string | null): Array<{ start: string; end: string }> {
  if (actualBreaks && typeof actualBreaks === "string") {
    try {
      const parsed = JSON.parse(actualBreaks);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((b: unknown) => b && typeof b === "object" && "start" in b && "end" in b)
          .map((b: { start: string; end: string }) => ({ start: b.start, end: b.end }));
      }
    } catch {}
  }
  if (fallbackStart && fallbackEnd) return [{ start: fallbackStart, end: fallbackEnd }];
  return [];
}

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

/** GET /api/free-hours - Lista ore libere. Worker: proprie, Admin: filtrate per preferenze. */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as any).role || "";
    const isAdmin = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole);
    const isWorker = (session.user as any).isWorker === true;
    const isNonStandardWorker = !["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole) && isWorker;
    const workMode = getWorkModeFromRequest(req);

    // Solo lavoratori (o admin in modalità lavoratore) possono vedere le proprie
    if (!isAdmin && !isWorker) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (isNonStandardWorker && workMode === "admin") {
      return NextResponse.json({ error: "Forbidden - Passa in modalità lavoratore" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const status = searchParams.get("status"); // PENDING | CONVERTED
    const userId = searchParams.get("userId"); // Solo admin per filtrare

    const where: Record<string, unknown> = {};

    if (isAdmin && userId && userId !== "all") {
      where.userId = userId;
    } else if (!isAdmin) {
      where.userId = session.user.id;
    }

    if (status) where.status = status;
    else where.status = "PENDING"; // default: solo pending

    if (startDate || endDate) {
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (startDate) dateFilter.gte = new Date(startDate + "T00:00:00.000Z");
      if (endDate) dateFilter.lte = new Date(endDate + "T23:59:59.999Z");
      where.date = dateFilter;
    }

    // Admin: filtra per preferenze companyIds
    if (isAdmin && (!userId || userId === "all")) {
      try {
        const pref = await prisma.adminNotificationPreference.findUnique({
          where: { userId: session.user.id },
        });
        const companyIds = pref?.companyIds
          ? (JSON.parse(pref.companyIds) as string[])
          : [];
        if (Array.isArray(companyIds) && companyIds.length > 0) {
          where.companyId = { in: companyIds };
        }
      } catch {
        // ignora preferenze non valide
      }
    }

    const entries = await prisma.freeHoursEntry.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, cognome: true, code: true } },
        taskType: { select: { id: true, name: true } },
        duty: { select: { id: true, name: true, area: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: {
        date: "desc",
      },
    });

    return NextResponse.json(entries);
  } catch (error) {
    console.error("GET /api/free-hours error:", error);
    return NextResponse.json(
      { error: "Errore nel recupero", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/** POST /api/free-hours - Crea ore libere. Solo lavoratori. */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as any).role || "";
    const isAdmin = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole);
    const isWorker = (session.user as any).isWorker === true;
    const workMode = getWorkModeFromRequest(req);

    // Solo lavoratori (admin-as-worker può inserire per sé)
    if (!isWorker) {
      return NextResponse.json({ error: "Solo i lavoratori possono inserire ore libere" }, { status: 403 });
    }
    if (isAdmin && workMode === "admin") {
      return NextResponse.json({ error: "Passa in modalità lavoratore per inserire ore libere" }, { status: 403 });
    }

    const userId = session.user.id;
    const body = await req.json();
    const { date, startTime, endTime, actualBreaks, notes, taskTypeId, dutyId, locationId } = body;

    if (!date || !startTime || !endTime) {
      return NextResponse.json(
        { error: "date, startTime e endTime sono obbligatori" },
        { status: 400 }
      );
    }
    if (!taskTypeId || typeof taskTypeId !== "string") {
      return NextResponse.json(
        { error: "La tipologia di turno è obbligatoria" },
        { status: 400 }
      );
    }
    if (!dutyId || typeof dutyId !== "string") {
      return NextResponse.json(
        { error: "La mansione svolta è obbligatoria" },
        { status: 400 }
      );
    }
    if (!locationId || typeof locationId !== "string") {
      return NextResponse.json(
        { error: "La location è obbligatoria" },
        { status: 400 }
      );
    }

    const taskType = await prisma.taskType.findFirst({
      where: { id: taskTypeId, type: "SHIFT" },
      select: { id: true, areas: true },
    });
    if (!taskType) {
      return NextResponse.json(
        { error: "Tipologia di turno non valida" },
        { status: 400 }
      );
    }

    const duty = await prisma.duty.findUnique({
      where: { id: dutyId },
      select: { area: true },
    });
    if (!duty) {
      return NextResponse.json(
        { error: "Mansione non valida" },
        { status: 400 }
      );
    }
    const areaName = duty.area;

    const breaks = Array.isArray(actualBreaks)
      ? actualBreaks.filter((b: unknown) => b && typeof b === "object" && "start" in b && "end" in b)
      : parseBreaks(actualBreaks);

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

    const dateObj = new Date(date);
    const dateStr = dateObj.toISOString().slice(0, 10);

    // Validazione: sovrapposizione con TimeEntry del lavoratore (ore già inserite per eventi)
    const dayStart = new Date(dateStr + "T00:00:00.000Z");
    const dayEnd = new Date(dateStr + "T23:59:59.999Z");

    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        userId,
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

    // Validazione: sovrapposizione con altre ore libere (PENDING) dello stesso lavoratore
    const freeHoursDayStart = new Date(dateStr + "T00:00:00.000Z");
    const freeHoursDayEnd = new Date(dateStr + "T23:59:59.999Z");
    const existingFreeHours = await prisma.freeHoursEntry.findMany({
      where: {
        userId,
        status: "PENDING",
        date: {
          gte: freeHoursDayStart,
          lte: freeHoursDayEnd,
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
          include: { timeEntries: { where: { userId }, select: { id: true } } },
        },
      },
    });

    const isUserAssigned = (a: { userId: string | null; assignedUsers: string | null }) => {
      if (a.userId === userId) return true;
      if (!a.assignedUsers) return false;
      try {
        const arr = JSON.parse(a.assignedUsers) as Array<{ userId?: string }>;
        return Array.isArray(arr) && arr.some((x) => x.userId === userId);
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

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, name: true, cognome: true },
    });

    const entry = await prisma.freeHoursEntry.create({
      data: {
        userId,
        companyId: user?.companyId ?? null,
        locationId,
        date: new Date(dateStr + "T12:00:00.000Z"),
        startTime,
        endTime,
        hoursWorked,
        taskTypeId,
        dutyId,
        area: areaName,
        actualBreaks: breaks.length > 0 ? JSON.stringify(breaks) : null,
        notes: notes || null,
        status: "PENDING",
      },
      include: {
        user: { select: { name: true, cognome: true } },
      },
    });

    const workerName = [entry.user.name, entry.user.cognome].filter(Boolean).join(" ") || "Lavoratore";
    const detail = `${dateStr} ${startTime}-${endTime} (${hoursWorked.toFixed(2)} ore)`;
    notifyAdminsFreeHoursAdded(workerName, detail, entry.id, user?.companyId ?? null).catch((e) =>
      console.error("[free-hours] notifyAdminsFreeHoursAdded error:", e)
    );

    return NextResponse.json(entry);
  } catch (error) {
    console.error("POST /api/free-hours error:", error);
    return NextResponse.json(
      { error: "Errore nella creazione", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
