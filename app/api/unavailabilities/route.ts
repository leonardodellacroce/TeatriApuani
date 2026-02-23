import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getWorkModeFromRequest } from "@/lib/workMode";
import { notifyWorkerUnavailability, notifyAdminsUnavailabilityPending } from "@/lib/notifications";
import { formatUnavailabilityDateRange, formatUnavailabilityTimeRange } from "@/lib/unavailabilityTime";

const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"];

function isAdmin(session: { user?: unknown }) {
  const u = session?.user as { role?: string; isSuperAdmin?: boolean; isAdmin?: boolean; isResponsabile?: boolean } | undefined;
  if (!u) return false;
  const role = u.role || (u.isSuperAdmin ? "SUPER_ADMIN" : u.isAdmin ? "ADMIN" : u.isResponsabile ? "RESPONSABILE" : "");
  return ADMIN_ROLES.includes(role);
}

// GET /api/unavailabilities?userId=...&dateFrom=...&dateTo=...&all=true?userId=...&dateFrom=...&dateTo=...
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const userIdParam = searchParams.get("userId");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const all = searchParams.get("all") === "true";

  const userRole = (session?.user as any)?.role || ((session?.user as any)?.isSuperAdmin ? "SUPER_ADMIN" : (session?.user as any)?.isAdmin ? "ADMIN" : (session?.user as any)?.isResponsabile ? "RESPONSABILE" : "");
  const isAdminUser = isAdmin(session);
  const workMode = getWorkModeFromRequest(req);
  const isNonStandardWorker = ADMIN_ROLES.includes(userRole) && (session?.user as any)?.isWorker === true;
  const inWorkerMode = isNonStandardWorker && workMode === "worker";

  // Standard users (or admin in worker mode) see only their own
  // Admin in admin mode: all=true = tutti; userId = filtro; altrimenti tutti
  const where: any = {};
  const currentUserId = (session.user as any)?.id;
  if (inWorkerMode || !isAdminUser) {
    if (!currentUserId) return NextResponse.json({ error: "User ID not found" }, { status: 401 });
    where.userId = currentUserId;
  } else if (userIdParam && !all) {
    where.userId = userIdParam;
  }

  if (dateFrom) {
    where.dateEnd = { ...(where.dateEnd || {}), gte: new Date(dateFrom) };
  }
  if (dateTo) {
    where.dateStart = { ...(where.dateStart || {}), lte: new Date(dateTo) };
  }

  try {
    const list = await prisma.unavailability.findMany({
      where,
      orderBy: [{ dateStart: "asc" }],
      include: {
        user: {
          select: { id: true, name: true, cognome: true, code: true },
        },
      },
    });
    return NextResponse.json(list);
  } catch (e) {
    console.error("GET /api/unavailabilities error", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Server error", details: msg }, { status: 500 });
  }
}

// POST /api/unavailabilities
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session?.user as any)?.role || ((session?.user as any)?.isSuperAdmin ? "SUPER_ADMIN" : (session?.user as any)?.isAdmin ? "ADMIN" : (session?.user as any)?.isResponsabile ? "RESPONSABILE" : "");
  const workMode = getWorkModeFromRequest(req);
  const isStandardUser = !ADMIN_ROLES.includes(userRole);
  const isNonStandardWorker = !isStandardUser && (session?.user as any)?.isWorker === true;
  const inWorkerMode = isNonStandardWorker && workMode === "worker";
  const isAdminUser = isAdmin(session);

  try {
    const body = await req.json();
    const { userId: targetUserId, dateStart, dateEnd, startTime, endTime, note, confirmConflict } = body;

    const effectiveUserId = isAdminUser && !inWorkerMode && targetUserId ? targetUserId : (session.user as any)?.id;
    if (!effectiveUserId) return NextResponse.json({ error: "User ID not found" }, { status: 401 });

    if (!dateStart || !dateEnd) {
      return NextResponse.json({ error: "dateStart e dateEnd sono obbligatori" }, { status: 400 });
    }

    const dStart = new Date(dateStart);
    const dEnd = new Date(dateEnd);
    dStart.setUTCHours(0, 0, 0, 0);
    dEnd.setUTCHours(23, 59, 59, 999);

    if (dEnd < dStart) {
      return NextResponse.json({ error: "dateEnd deve essere >= dateStart" }, { status: 400 });
    }

    // Verifica conflitti con turni assegnati (userId principale + assignedUsers in JSON)
    const assignmentsByUser = await prisma.assignment.findMany({
      where: {
        taskType: { is: { type: "SHIFT" } },
        userId: effectiveUserId,
      },
      include: { workday: { select: { date: true } } },
    });

    const assignmentsByAssigned = await prisma.assignment.findMany({
      where: {
        taskType: { is: { type: "SHIFT" } },
        assignedUsers: { not: null },
      },
      include: { workday: { select: { date: true } } },
    });

    const inAssignedUsers = (a: { assignedUsers: string | null }) => {
      if (!a.assignedUsers) return false;
      try {
        const arr = JSON.parse(a.assignedUsers) as Array<{ userId?: string }>;
        return arr.some((x) => x.userId === effectiveUserId);
      } catch {
        return a.assignedUsers.includes(effectiveUserId);
      }
    };

    const assignments = [
      ...assignmentsByUser,
      ...assignmentsByAssigned.filter((a) => inAssignedUsers(a) && a.userId !== effectiveUserId),
    ];

    // Data workday in formato YYYY-MM-DD (timezone Rome per coerenza con UI italiana)
    const toDateStrRome = (d: Date) =>
      d.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
    const unavDateStartStr = toDateStrRome(dStart);
    const unavDateEndStr = toDateStrRome(dEnd);

    const hasConflict = assignments.some((a) => {
      const wdDate = new Date(a.workday.date);
      const wdDateStr = toDateStrRome(wdDate);
      if (wdDateStr < unavDateStartStr || wdDateStr > unavDateEndStr) return false;

      if (!a.startTime || !a.endTime) return true;

      const unavStart = startTime ? parseTimeToMinutes(startTime) : 0;
      const unavEnd = endTime ? parseTimeToMinutes(endTime) : 24 * 60;
      const shiftStart = parseTimeToMinutes(a.startTime);
      let shiftEnd = parseTimeToMinutes(a.endTime);
      if (shiftEnd <= shiftStart) shiftEnd += 24 * 60;

      const uEnd = unavEnd <= unavStart ? unavEnd + 24 * 60 : unavEnd;
      return rangesOverlap(unavStart, uEnd, shiftStart, shiftEnd);
    });

    // Admin con conflitto: richiedi conferma prima di creare
    if (hasConflict && isAdminUser && !inWorkerMode && !confirmConflict) {
      return NextResponse.json(
        {
          hasConflict: true,
          message: "L'utente è già in turno in quel periodo. Vuoi procedere comunque? L'indisponibilità verrà creata e il dipendente rimosso dai turni in conflitto.",
        },
        { status: 409 }
      );
    }

    // PENDING_APPROVAL solo se: conflitto E utente agisce come lavoratore (non admin in modalità admin)
    const actingAsAdmin = isAdminUser && !inWorkerMode;
    const status = hasConflict && !actingAsAdmin ? "PENDING_APPROVAL" : "APPROVED";

    const unavailability = await prisma.unavailability.create({
      data: {
        userId: effectiveUserId,
        dateStart: dStart,
        dateEnd: dEnd,
        startTime: startTime || null,
        endTime: endTime || null,
        status,
        note: note || null,
      },
      include: {
        user: {
          select: { id: true, name: true, cognome: true, code: true },
        },
      },
    });

    // Se admin ha confermato conflitto: rimuovi dipendente dai turni in conflitto
    let removedFromAssignments: string[] = [];
    if (hasConflict && isAdminUser && confirmConflict && status === "APPROVED") {
      const workdays = await prisma.workday.findMany({
        where: { date: { gte: dStart, lte: dEnd } },
        select: { id: true, date: true },
      });
      const unavStart = startTime ? parseTimeToMinutes(startTime) : 0;
      const unavEnd = endTime ? parseTimeToMinutes(endTime) : 24 * 60;
      const uEnd = unavEnd <= unavStart ? unavEnd + 24 * 60 : unavEnd;

      for (const wd of workdays) {
        const byUser = await prisma.assignment.findMany({
          where: {
            workdayId: wd.id,
            taskType: { is: { type: "SHIFT" } },
            userId: effectiveUserId,
          },
        });
        const byAssigned = await prisma.assignment.findMany({
          where: {
            workdayId: wd.id,
            taskType: { is: { type: "SHIFT" } },
            assignedUsers: { not: null },
          },
        });
        const byAssignedFiltered = byAssigned.filter(
          (a) =>
            a.userId !== effectiveUserId &&
            (() => {
              if (!a.assignedUsers) return false;
              try {
                const arr = JSON.parse(a.assignedUsers) as Array<{ userId?: string }>;
                return arr.some((x) => x.userId === effectiveUserId);
              } catch {
                return a.assignedUsers.includes(effectiveUserId);
              }
            })()
        );
        const shiftAssignments = [...byUser, ...byAssignedFiltered];
        for (const a of shiftAssignments) {
          if (!a.startTime || !a.endTime) continue;
          const shiftStart = parseTimeToMinutes(a.startTime);
          let shiftEnd = parseTimeToMinutes(a.endTime);
          if (shiftEnd <= shiftStart) shiftEnd += 24 * 60;
          if (!rangesOverlap(unavStart, uEnd, shiftStart, shiftEnd)) continue;

          if (a.userId === effectiveUserId) {
            await prisma.assignment.update({
              where: { id: a.id },
              data: { userId: null },
            });
            removedFromAssignments.push(a.id);
          } else if (a.assignedUsers) {
            try {
              const arr = JSON.parse(a.assignedUsers) as Array<{ userId: string; dutyId?: string }>;
              const filtered = arr.filter((x) => x.userId !== effectiveUserId);
              await prisma.assignment.update({
                where: { id: a.id },
                data: { assignedUsers: JSON.stringify(filtered) },
              });
              removedFromAssignments.push(a.id);
            } catch {}
          }
        }
      }
    }

    if (isAdminUser && !inWorkerMode && targetUserId) {
      const periodStr = formatUnavailabilityDateRange(unavailability.dateStart, unavailability.dateEnd);
      const timeStr = formatUnavailabilityTimeRange(unavailability.startTime, unavailability.endTime);
      let detail = `Periodo: ${periodStr}\nOrario: ${timeStr}`;
      if (unavailability.note) detail += `\nNote: ${unavailability.note}`;
      await notifyWorkerUnavailability(effectiveUserId, "CREATED", 1, detail);
    }
    if (hasConflict && !actingAsAdmin) {
      try {
        const workerName = unavailability.user
          ? `${unavailability.user.name || ""} ${unavailability.user.cognome || ""}`.trim() || unavailability.user.code || "Un dipendente"
          : "Un dipendente";
        const worker = await prisma.user.findUnique({
          where: { id: effectiveUserId },
          select: { companyId: true },
        });
        await notifyAdminsUnavailabilityPending(workerName, undefined, worker?.companyId);
      } catch (err) {
        console.error("[Unavailability] notifyAdminsUnavailabilityPending error:", err);
      }
    }

    return NextResponse.json(
      { ...unavailability, hasConflict, removedFromAssignments: removedFromAssignments.length ? removedFromAssignments : undefined },
      { status: 201 }
    );
  } catch (e) {
    console.error("POST /api/unavailabilities error", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Server error", details: msg }, { status: 500 });
  }
}

function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function rangesOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && b1 < a2;
}
