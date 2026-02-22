import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getWorkModeFromRequest } from "@/lib/workMode";

const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"];

function isAdmin(session: { user?: { role?: string } }) {
  return ADMIN_ROLES.includes(session?.user?.role || "");
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

  const isAdminUser = isAdmin(session);
  const workMode = getWorkModeFromRequest(req);
  const isNonStandardWorker = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(session?.user?.role || "") && (session?.user as any)?.isWorker === true;
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

  const workMode = getWorkModeFromRequest(req);
  const isStandardUser = !ADMIN_ROLES.includes(session?.user?.role || "");
  const isNonStandardWorker = !isStandardUser && (session?.user as any)?.isWorker === true;
  const inWorkerMode = isNonStandardWorker && workMode === "worker";
  const isAdminUser = isAdmin(session);

  try {
    const body = await req.json();
    const { userId: targetUserId, dateStart, dateEnd, startTime, endTime, note } = body;

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

    // Verifica conflitti con turni assegnati
    const assignments = await prisma.assignment.findMany({
      where: {
        taskType: { is: { type: "SHIFT" } },
        OR: [
          { userId: effectiveUserId },
          { assignedUsers: { contains: effectiveUserId } },
        ],
      },
      include: {
        workday: { select: { date: true } },
      },
    });

    const hasConflict = assignments.some((a) => {
      const wdDate = new Date(a.workday.date);
      const wdDateStr = wdDate.toISOString().split("T")[0];
      const wdDateOnly = new Date(wdDateStr);
      if (wdDateOnly < dStart || wdDateOnly > dEnd) return false;

      if (!a.startTime || !a.endTime) return true;

      const unavStart = startTime ? parseTimeToMinutes(startTime) : 0;
      const unavEnd = endTime ? parseTimeToMinutes(endTime) : 24 * 60;
      const shiftStart = parseTimeToMinutes(a.startTime);
      let shiftEnd = parseTimeToMinutes(a.endTime);
      if (shiftEnd <= shiftStart) shiftEnd += 24 * 60;

      const uEnd = unavEnd <= unavStart ? unavEnd + 24 * 60 : unavEnd;
      return rangesOverlap(unavStart, uEnd, shiftStart, shiftEnd);
    });

    const status = hasConflict ? "PENDING_APPROVAL" : "APPROVED";

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

    return NextResponse.json({ ...unavailability, hasConflict }, { status: 201 });
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
