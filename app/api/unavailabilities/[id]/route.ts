import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getWorkModeFromRequest } from "@/lib/workMode";

const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"];

function isAdmin(session: { user?: { role?: string } }) {
  return ADMIN_ROLES.includes(session?.user?.role || "");
}

function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function rangesOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && b1 < a2;
}

// GET /api/unavailabilities/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const workMode = getWorkModeFromRequest(req);
  const isNonStandardWorker = !["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(session?.user?.role || "") === false && (session?.user as any)?.isWorker === true;
  const inWorkerMode = isNonStandardWorker && workMode === "worker";

  const u = await prisma.unavailability.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, cognome: true, code: true } } },
  });
  if (!u) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const canAccess = u.userId === session.user?.id || (isAdmin(session) && !inWorkerMode);
  if (!canAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(u);
}

// PATCH /api/unavailabilities/[id] - update or approve
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const workMode = getWorkModeFromRequest(req);
  const isNonStandardWorker = !["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(session?.user?.role || "") === false && (session?.user as any)?.isWorker === true;
  const inWorkerMode = isNonStandardWorker && workMode === "worker";
  const isAdminUser = isAdmin(session);

  const u = await prisma.unavailability.findUnique({ where: { id } });
  if (!u) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const canEdit = u.userId === session.user?.id || isAdminUser;
  if (!canEdit || inWorkerMode) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { status: newStatus, dateStart, dateEnd, startTime, endTime, note } = body;

    const updates: any = {};
    let removedFromAssignments: string[] = [];
    if (newStatus === "APPROVED" && isAdminUser && u.status === "PENDING_APPROVAL") {
      updates.status = "APPROVED";
      // Rimuovi l'utente dai turni in conflitto
      const dStart = new Date(u.dateStart);
      const dEnd = new Date(u.dateEnd);
      dStart.setUTCHours(0, 0, 0, 0);
      dEnd.setUTCHours(23, 59, 59, 999);

      const workdays = await prisma.workday.findMany({
        where: {
          date: { gte: dStart, lte: dEnd },
        },
        select: { id: true, date: true },
      });

      for (const wd of workdays) {
        const assignments = await prisma.assignment.findMany({
          where: {
            workdayId: wd.id,
            taskType: { is: { type: "SHIFT" } },
            OR: [
              { userId: u.userId },
              { assignedUsers: { contains: u.userId } },
            ],
          },
        });

        for (const a of assignments) {
          const unavStart = u.startTime ? parseTimeToMinutes(u.startTime) : 0;
          const unavEnd = u.endTime ? parseTimeToMinutes(u.endTime) : 24 * 60;
          if (!a.startTime || !a.endTime) continue;
          const shiftStart = parseTimeToMinutes(a.startTime);
          let shiftEnd = parseTimeToMinutes(a.endTime);
          if (shiftEnd <= shiftStart) shiftEnd += 24 * 60;
          const uEnd = unavEnd <= unavStart ? unavEnd + 24 * 60 : unavEnd;
          if (!rangesOverlap(unavStart, uEnd, shiftStart, shiftEnd)) continue;

          // Rimuovi userId o dall'array assignedUsers
          if (a.userId === u.userId) {
            await prisma.assignment.update({
              where: { id: a.id },
              data: { userId: null },
            });
            removedFromAssignments.push(a.id);
            console.log(`[Unavailability] Rimosso userId da assignment ${a.id} (approvazione indisponibilità ${id})`);
          } else if (a.assignedUsers) {
            try {
              const arr = JSON.parse(a.assignedUsers) as Array<{ userId: string; dutyId?: string }>;
              const filtered = arr.filter((x) => x.userId !== u.userId);
              await prisma.assignment.update({
                where: { id: a.id },
                data: { assignedUsers: JSON.stringify(filtered) },
              });
              removedFromAssignments.push(a.id);
              console.log(`[Unavailability] Rimosso utente ${u.userId} da assignedUsers assignment ${a.id} (approvazione indisponibilità ${id})`);
            } catch (e) {
              console.error(`[Unavailability] Errore rimozione da assignment ${a.id}:`, e);
            }
          }
        }
      }
    }

    if (dateStart !== undefined) {
      const d = new Date(dateStart);
      d.setUTCHours(0, 0, 0, 0);
      updates.dateStart = d;
    }
    if (dateEnd !== undefined) {
      const d = new Date(dateEnd);
      d.setUTCHours(23, 59, 59, 999);
      updates.dateEnd = d;
    }
    if (startTime !== undefined) updates.startTime = startTime || null;
    if (endTime !== undefined) updates.endTime = endTime || null;
    if (note !== undefined) updates.note = note || null;

    const updated = await prisma.unavailability.update({
      where: { id },
      data: updates,
      include: { user: { select: { id: true, name: true, cognome: true, code: true } } },
    });
    const res: Record<string, unknown> = { ...updated };
    if (removedFromAssignments.length > 0) {
      res.removedFromAssignments = removedFromAssignments;
    }
    return NextResponse.json(res);
  } catch (e) {
    console.error("PATCH /api/unavailabilities error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/unavailabilities/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const workMode = getWorkModeFromRequest(req);
  const isNonStandardWorker = !["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(session?.user?.role || "") === false && (session?.user as any)?.isWorker === true;
  const inWorkerMode = isNonStandardWorker && workMode === "worker";
  const isAdminUser = isAdmin(session);

  const u = await prisma.unavailability.findUnique({ where: { id } });
  if (!u) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const canDelete = u.userId === session.user?.id || (isAdminUser && !inWorkerMode);
  if (!canDelete) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.unavailability.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
