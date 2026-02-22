import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getWorkModeFromRequest } from "@/lib/workMode";

function checkWorkerAccess(session: any, req: NextRequest): NextResponse | null {
  const userRole = (session.user as any).role || "";
  const isAdmin = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole);
  if (isAdmin) return null; // Admin possono sempre accedere (per correzione ore)
  const isStandardUser = !isAdmin;
  const isWorker = (session.user as any).isWorker === true;
  const isNonStandardWorker = !isStandardUser && isWorker;
  const workMode = getWorkModeFromRequest(req);
  if (!isStandardUser && !isWorker) {
    return NextResponse.json({ error: "Forbidden - Accesso non consentito" }, { status: 403 });
  }
  if (isNonStandardWorker && workMode === "admin") {
    return NextResponse.json({ error: "Forbidden - Passa in modalità lavoratore per accedere" }, { status: 403 });
  }
  return null;
}

// GET /api/time-entries/[id] - Dettaglio singola time entry
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const accessError = checkWorkerAccess(session, req);
    if (accessError) return accessError;

    const { id } = await params;
    const userId = session.user.id;

    const timeEntry = await prisma.timeEntry.findUnique({
      where: { id },
      include: {
        assignment: {
          include: {
            workday: {
              include: {
                event: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
                location: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            taskType: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
        },
      },
    });

    if (!timeEntry) {
      return NextResponse.json(
        { error: "Time entry not found" },
        { status: 404 }
      );
    }

    // Solo il proprietario può vedere
    if (timeEntry.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(timeEntry);
  } catch (error) {
    console.error("Error fetching time entry:", error);
    return NextResponse.json(
      { error: "Failed to fetch time entry" },
      { status: 500 }
    );
  }
}

// PATCH /api/time-entries/[id] - Modifica time entry
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const accessError = checkWorkerAccess(session, req);
    if (accessError) return accessError;

    const { id } = await params;
    const userId = session.user.id;
    const body = await req.json();
    const { hoursWorked, startTime, endTime, hasTakenBreak, actualBreakStartTime, actualBreakEndTime, actualBreaks, notes } = body;

    const existing = await prisma.timeEntry.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Time entry not found" },
        { status: 404 }
      );
    }

    const userRole = (session.user as any).role || "";
    const isAdmin = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole);
    const canEditOthers = isAdmin && existing.userId !== userId;

    if (!canEditOthers && existing.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (canEditOthers && userRole === "RESPONSABILE") {
      const targetUser = await prisma.user.findUnique({
        where: { id: existing.userId },
        select: { companyId: true },
      });
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true },
      });
      if (!targetUser || !currentUser?.companyId || targetUser.companyId !== currentUser.companyId) {
        return NextResponse.json({ error: "Non autorizzato a modificare ore di questo dipendente" }, { status: 403 });
      }
    }

    // Non consentire modifica ore per turni futuri (oggi e passato consentiti)
    const shiftDate = existing.date;
    const d = shiftDate instanceof Date ? shiftDate : new Date(shiftDate);
    const dateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const todayStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    if (dateStr > todayStr) {
      return NextResponse.json(
        { error: "Non è possibile modificare ore per turni futuri" },
        { status: 400 }
      );
    }

    // Validazione
    const updateData: any = {};
    
    if (hoursWorked !== undefined) {
      if (hoursWorked <= 0) {
        return NextResponse.json(
          { error: "hoursWorked must be greater than 0" },
          { status: 400 }
        );
      }
      updateData.hoursWorked = parseFloat(hoursWorked);
    }

    if (startTime !== undefined) updateData.startTime = startTime || null;
    if (endTime !== undefined) updateData.endTime = endTime || null;

    // actualBreaks: array o legacy
    let breaksArray: Array<{ start: string; end: string }> | null = null;
    if (actualBreaks !== undefined) {
      if (Array.isArray(actualBreaks) && actualBreaks.length > 0) {
        breaksArray = actualBreaks.filter((b: any) => b && typeof b.start === "string" && typeof b.end === "string");
      } else {
        breaksArray = [];
      }
    } else if (hasTakenBreak !== undefined) {
      if (hasTakenBreak === true && actualBreakStartTime && actualBreakEndTime) {
        breaksArray = [{ start: actualBreakStartTime, end: actualBreakEndTime }];
      } else {
        breaksArray = [];
      }
    }

    if (breaksArray !== null) {
      const { serializeBreaks } = await import("@/lib/breaks");
      updateData.hasTakenBreak = breaksArray.length > 0 ? true : null;
      updateData.actualBreakStartTime = breaksArray[0]?.start ?? null;
      updateData.actualBreakEndTime = breaksArray[0]?.end ?? null;
      updateData.actualBreaks = serializeBreaks(breaksArray);
    }

    const finalStartTime = startTime !== undefined ? startTime : existing.startTime;
    const finalEndTime = endTime !== undefined ? endTime : existing.endTime;
    let finalBreaks: Array<{ start: string; end: string }> = [];
    if (breaksArray !== null) {
      finalBreaks = breaksArray;
    } else if (existing.actualBreaks) {
      try {
        const parsed = JSON.parse(existing.actualBreaks);
        finalBreaks = Array.isArray(parsed) ? parsed.filter((b: any) => b?.start && b?.end) : [];
      } catch {}
    }

    if (finalBreaks.length > 0 && finalStartTime && finalEndTime) {
      const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
      const startMin = toMin(finalStartTime);
      let endMin = toMin(finalEndTime);
      if (endMin <= startMin) endMin += 24 * 60;
      for (const b of finalBreaks) {
        let bs = toMin(b.start);
        let be = toMin(b.end);
        if (be <= bs) be += 24 * 60;
        if (bs < startMin || be > endMin) {
          return NextResponse.json({ error: "Ogni pausa deve essere dentro l'orario di lavoro" }, { status: 400 });
        }
      }
    }

    // Validazione orari se entrambi presenti
    const finalStartTimeForValidation = updateData.startTime !== undefined ? updateData.startTime : existing.startTime;
    const finalEndTimeForValidation = updateData.endTime !== undefined ? updateData.endTime : existing.endTime;
    
    if (finalStartTimeForValidation && finalEndTimeForValidation) {
      const [startH, startM] = finalStartTimeForValidation.split(":").map(Number);
      const [endH, endM] = finalEndTimeForValidation.split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      let endMinutes = endH * 60 + endM;
      
      if (endMinutes <= startMinutes) {
        endMinutes += 24 * 60; // Gestisci turni oltre mezzanotte
      }
      
      if (endMinutes <= startMinutes) {
        return NextResponse.json(
          { error: "endTime must be after startTime" },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.timeEntry.update({
      where: { id },
      data: updateData,
      include: {
        assignment: {
          include: {
            workday: {
              include: {
                event: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
                location: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            taskType: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Error updating time entry:", error);
    return NextResponse.json(
      { error: "Failed to update time entry", details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/time-entries/[id] - Elimina time entry
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const accessError = checkWorkerAccess(session, req);
    if (accessError) return accessError;

    const { id } = await params;
    const userId = session.user.id;

    const existing = await prisma.timeEntry.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Time entry not found" },
        { status: 404 }
      );
    }

    const userRole = (session.user as any).role || "";
    const isAdmin = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole);
    const canDeleteOthers = isAdmin && existing.userId !== userId;

    if (!canDeleteOthers && existing.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (canDeleteOthers && userRole === "RESPONSABILE") {
      const targetUser = await prisma.user.findUnique({
        where: { id: existing.userId },
        select: { companyId: true },
      });
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { companyId: true },
      });
      if (!targetUser || !currentUser?.companyId || targetUser.companyId !== currentUser.companyId) {
        return NextResponse.json({ error: "Non autorizzato a eliminare ore di questo dipendente" }, { status: 403 });
      }
    }

    // Non consentire eliminazione ore per turni futuri (oggi e passato consentiti)
    const shiftDate = existing.date;
    const d = shiftDate instanceof Date ? shiftDate : new Date(shiftDate);
    const dateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const todayStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    if (dateStr > todayStr) {
      return NextResponse.json(
        { error: "Non è possibile eliminare ore per turni futuri" },
        { status: 400 }
      );
    }

    await prisma.timeEntry.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting time entry:", error);
    return NextResponse.json(
      { error: "Failed to delete time entry" },
      { status: 500 }
    );
  }
}

