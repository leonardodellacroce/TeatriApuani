import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getWorkModeFromRequest } from "@/lib/workMode";
import {
  notifyWorkerUnavailability,
  notifyWorkerUnavailabilityApproved,
  notifyWorkerUnavailabilityRejected,
  notifyAdminsUnavailabilityChangedByWorker,
  hasWorkdaysInDateRange,
} from "@/lib/notifications";
import { formatUnavailabilityDateRange, formatUnavailabilityTimeRange } from "@/lib/unavailabilityTime";

const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"];

function isAdmin(session: { user?: unknown }) {
  const u = session?.user as { role?: string; isSuperAdmin?: boolean; isAdmin?: boolean; isResponsabile?: boolean } | undefined;
  if (!u) return false;
  const role = u.role || (u.isSuperAdmin ? "SUPER_ADMIN" : u.isAdmin ? "ADMIN" : u.isResponsabile ? "RESPONSABILE" : "");
  return ADMIN_ROLES.includes(role);
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
  const userRole = (session?.user as any)?.role || ((session?.user as any)?.isSuperAdmin ? "SUPER_ADMIN" : (session?.user as any)?.isAdmin ? "ADMIN" : (session?.user as any)?.isResponsabile ? "RESPONSABILE" : "");
  const isNonStandardWorker = ADMIN_ROLES.includes(userRole) && (session?.user as any)?.isWorker === true;
  const inWorkerMode = isNonStandardWorker && workMode === "worker";

  const u = await prisma.unavailability.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, cognome: true, code: true } } },
  });
  if (!u) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sessionUserId = (session?.user as any)?.id as string | undefined;
  const canAccess = (sessionUserId && u.userId === sessionUserId) || (isAdmin(session) && !inWorkerMode);
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
  const userRole = (session?.user as any)?.role || ((session?.user as any)?.isSuperAdmin ? "SUPER_ADMIN" : (session?.user as any)?.isAdmin ? "ADMIN" : (session?.user as any)?.isResponsabile ? "RESPONSABILE" : "");
  const isNonStandardWorker = ADMIN_ROLES.includes(userRole) && (session?.user as any)?.isWorker === true;
  const inWorkerMode = isNonStandardWorker && workMode === "worker";
  const isAdminUser = isAdmin(session);

  const u = await prisma.unavailability.findUnique({ where: { id } });
  if (!u) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sessionUserId = (session?.user as any)?.id as string | undefined;
  // Permetti: (1) utente modifica la propria, (2) admin in modalità admin modifica altre
  const isEditingOwn = sessionUserId && u.userId === sessionUserId;
  const canEdit = isEditingOwn || (isAdminUser && !inWorkerMode);
  if (!canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { status: newStatus, dateStart, dateEnd, startTime, endTime, note } = body;

    const updates: any = {};
    let removedFromAssignments: string[] = [];
    if (newStatus === "REJECTED" && isAdminUser && u.status === "PENDING_APPROVAL") {
      updates.status = "REJECTED";
      const periodStr = formatUnavailabilityDateRange(u.dateStart, u.dateEnd);
      const timeStr = formatUnavailabilityTimeRange(u.startTime, u.endTime);
      const detail = `Periodo: ${periodStr}\nOrario: ${timeStr}`;
      await notifyWorkerUnavailabilityRejected(u.userId, detail);
    } else if (newStatus === "APPROVED" && isAdminUser && u.status === "PENDING_APPROVAL") {
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
      const periodStr = formatUnavailabilityDateRange(u.dateStart, u.dateEnd);
      const timeStr = formatUnavailabilityTimeRange(u.startTime, u.endTime);
      const detail = `Periodo: ${periodStr}\nOrario: ${timeStr}`;
      await notifyWorkerUnavailabilityApproved(u.userId, detail);
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

    const updated =
      Object.keys(updates).length > 0
        ? await prisma.unavailability.update({
            where: { id },
            data: updates,
            include: { user: { select: { id: true, name: true, cognome: true, code: true } } },
          })
        : await prisma.unavailability.findUniqueOrThrow({
            where: { id },
            include: { user: { select: { id: true, name: true, cognome: true, code: true } } },
          });

    // Admin modifica indisponibilità di un dipendente → notifica il dipendente (priorità alta).
    // Notifica anche quando admin modifica la propria (admin+lavoratore): la notifica apparirà solo in area lavoratore.
    const hasDataUpdates =
      updates.dateStart !== undefined ||
      updates.dateEnd !== undefined ||
      updates.startTime !== undefined ||
      updates.endTime !== undefined ||
      updates.note !== undefined;
    const isStatusOnlyApprovalRejection =
      Object.keys(updates).length === 1 && (updates.status === "APPROVED" || updates.status === "REJECTED");
    const isAdminEditingAsAdmin = isAdminUser && !inWorkerMode;
    if (isAdminEditingAsAdmin && hasDataUpdates && !isStatusOnlyApprovalRejection) {
      try {
        const oldPeriod = formatUnavailabilityDateRange(u.dateStart, u.dateEnd);
        const newPeriod = formatUnavailabilityDateRange(updated.dateStart, updated.dateEnd);
        const oldTime = formatUnavailabilityTimeRange(u.startTime, u.endTime);
        const newTime = formatUnavailabilityTimeRange(updated.startTime, updated.endTime);
        const periodChanged = oldPeriod !== newPeriod;
        const timeChanged = oldTime !== newTime;
        const noteChanged = (u.note ?? "") !== (updated.note ?? "");
        let detail = "";
        if (periodChanged) {
          detail += `Periodo: ~~${oldPeriod}~~ ${newPeriod}`;
        } else {
          detail += `Periodo: ${newPeriod}`;
        }
        if (timeChanged) {
          detail += `\nOrario: ~~${oldTime}~~ ${newTime}`;
        } else {
          detail += `\nOrario: ${newTime}`;
        }
        if (noteChanged) {
          detail += `\nNote: ~~${u.note ?? "-"}~~ ${updated.note ?? "-"}`;
        } else if (updated.note) {
          detail += `\nNote: ${updated.note}`;
        }
        await notifyWorkerUnavailability(u.userId, "MODIFIED", 1, detail, `unav:${id}`);
      } catch (err) {
        console.error("[Unavailability] notifyWorkerUnavailability MODIFIED error:", err);
      }
    }

    // Dipendente modifica la propria indisponibilità in giornate con eventi → notifica admin
    // Includi anche admin+worker in modalità worker: la notifica arriverà quando passa in modalità admin
    const isWorkerEditingOwn = u.userId === sessionUserId && (inWorkerMode || !isAdminUser);
    if (isWorkerEditingOwn && Object.keys(updates).length > 0 && newStatus !== "APPROVED" && newStatus !== "REJECTED") {
      const hasWorkdays = await hasWorkdaysInDateRange(updated.dateStart, updated.dateEnd);
      if (hasWorkdays) {
        try {
          const worker = await prisma.user.findUnique({
            where: { id: u.userId },
            select: { name: true, cognome: true, companyId: true },
          });
          const workerName = [worker?.name, worker?.cognome].filter(Boolean).join(" ") || "Un dipendente";
          const oldPeriod = formatUnavailabilityDateRange(u.dateStart, u.dateEnd);
          const newPeriod = formatUnavailabilityDateRange(updated.dateStart, updated.dateEnd);
          const oldTime = formatUnavailabilityTimeRange(u.startTime, u.endTime);
          const newTime = formatUnavailabilityTimeRange(updated.startTime, updated.endTime);
          const periodChanged = oldPeriod !== newPeriod;
          const timeChanged = oldTime !== newTime;
          const noteChanged = (u.note ?? "") !== (updated.note ?? "");
          let detail = "";
          if (periodChanged) {
            detail += `Periodo: ~~${oldPeriod}~~ ${newPeriod}`;
          } else {
            detail += `Periodo: ${newPeriod}`;
          }
          if (timeChanged) {
            detail += `\nOrario: ~~${oldTime}~~ ${newTime}`;
          } else {
            detail += `\nOrario: ${newTime}`;
          }
          if (noteChanged) {
            detail += `\nNote: ~~${u.note ?? "-"}~~ ${updated.note ?? "-"}`;
          } else if (updated.note) {
            detail += `\nNote: ${updated.note}`;
          }
          await notifyAdminsUnavailabilityChangedByWorker(workerName, "MODIFIED", detail, worker?.companyId ?? undefined);
        } catch (err) {
          console.error("[Unavailability] notifyAdminsUnavailabilityChangedByWorker MODIFIED error:", err);
        }
      }
    }

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
  const userRole = (session?.user as any)?.role || ((session?.user as any)?.isSuperAdmin ? "SUPER_ADMIN" : (session?.user as any)?.isAdmin ? "ADMIN" : (session?.user as any)?.isResponsabile ? "RESPONSABILE" : "");
  const isNonStandardWorker = ADMIN_ROLES.includes(userRole) && (session?.user as any)?.isWorker === true;
  const inWorkerMode = isNonStandardWorker && workMode === "worker";
  const isAdminUser = isAdmin(session);

  const u = await prisma.unavailability.findUnique({ where: { id } });
  if (!u) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sessionUserId = (session?.user as any)?.id as string | undefined;
  const canDelete = u.userId === sessionUserId || (isAdminUser && !inWorkerMode);
  if (!canDelete) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Admin elimina indisponibilità → notifica il dipendente (anche se è la propria: apparirà solo in area lavoratore).
  if (isAdminUser && !inWorkerMode) {
    try {
      const periodStr = formatUnavailabilityDateRange(u.dateStart, u.dateEnd);
      const timeStr = formatUnavailabilityTimeRange(u.startTime, u.endTime);
      const detail = `Periodo: ${periodStr}\nOrario: ${timeStr}`;
      await notifyWorkerUnavailability(u.userId, "DELETED", 1, detail, `unav:${id}`);
    } catch (err) {
      console.error("[Unavailability] notifyWorkerUnavailability DELETED error:", err);
    }
  }

  // Dipendente elimina la propria indisponibilità in giornate con eventi → notifica admin
  // Includi anche admin+worker in modalità worker: la notifica arriverà quando passa in modalità admin
  const isWorkerDeletingOwn = u.userId === sessionUserId && (inWorkerMode || !isAdminUser);
  if (isWorkerDeletingOwn) {
    const hasWorkdays = await hasWorkdaysInDateRange(u.dateStart, u.dateEnd);
    if (hasWorkdays) {
      try {
        const worker = await prisma.user.findUnique({
          where: { id: u.userId },
          select: { name: true, cognome: true, companyId: true },
        });
        const workerName = [worker?.name, worker?.cognome].filter(Boolean).join(" ") || "Un dipendente";
        const periodStr = formatUnavailabilityDateRange(u.dateStart, u.dateEnd);
        const timeStr = formatUnavailabilityTimeRange(u.startTime, u.endTime);
        let detail = `Periodo: ${periodStr}\nOrario: ${timeStr}`;
        if (u.note) detail += `\nNote: ${u.note}`;
        await notifyAdminsUnavailabilityChangedByWorker(workerName, "DELETED", detail, worker?.companyId ?? undefined);
      } catch (err) {
        console.error("[Unavailability] notifyAdminsUnavailabilityChangedByWorker DELETED error:", err);
      }
    }
  }

  await prisma.unavailability.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
