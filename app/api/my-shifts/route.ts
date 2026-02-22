import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getWorkModeFromRequest } from "@/lib/workMode";

// GET /api/my-shifts?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Ritorna i TURNI (taskType.type === "SHIFT") assegnati all'utente loggato nel range date,
// includendo info workday/event/location, mansione (solo dell'utente loggato) e pausa prevista.
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isStandardUser = !["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes((session.user as any).role || "");
    const isWorker = (session.user as any).isWorker === true;
    const isNonStandardWorker = !isStandardUser && isWorker;
    const workMode = getWorkModeFromRequest(req);

    if (!isStandardUser && !isWorker) {
      return NextResponse.json({ error: "Forbidden - Accesso non consentito" }, { status: 403 });
    }
    if (isNonStandardWorker && workMode === "admin") {
      return NextResponse.json({ error: "Forbidden - Passa in modalità lavoratore per accedere" }, { status: 403 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const dateFilter: any = {};
    if (startDate) {
      const d = new Date(startDate);
      d.setUTCHours(0, 0, 0, 0);
      dateFilter.gte = d;
    }
    if (endDate) {
      const d = new Date(endDate);
      d.setUTCHours(23, 59, 59, 999);
      dateFilter.lte = d;
    }

    // Carica solo SHIFT nel periodo; filtro assegnazione utente in memoria (assignedUsers è JSON string).
    const allShiftAssignments = await prisma.assignment.findMany({
      where: {
        taskType: { is: { type: "SHIFT" } },
        ...(Object.keys(dateFilter).length > 0 && {
          workday: { date: dateFilter },
        }),
      },
      include: {
        workday: {
          include: {
            event: { select: { id: true, title: true } },
            location: { select: { id: true, name: true } },
          },
        },
        taskType: { select: { id: true, name: true, type: true } },
        timeEntries: {
          where: { userId },
          select: {
            id: true,
            hoursWorked: true,
            startTime: true,
            endTime: true,
            notes: true,
            hasTakenBreak: true,
            actualBreakStartTime: true,
            actualBreakEndTime: true,
            actualBreaks: true,
            date: true,
          },
        },
      },
      orderBy: [{ workday: { date: "desc" } }, { startTime: "asc" }],
    });

    const userAssignments = allShiftAssignments.filter((a) => {
      if (a.userId === userId) return true;
      if (!a.assignedUsers) return false;
      try {
        const parsed = JSON.parse(a.assignedUsers);
        if (!Array.isArray(parsed)) return false;
        const found = parsed.some((u: any) => {
          if (typeof u === "string") return u === userId;
          if (u && typeof u === "object" && u.userId) return u.userId === userId;
          return false;
        });
        if (found) return true;
        // Fallback: assignedUsers potrebbe avere struttura diversa (es. id invece di userId)
        return parsed.some((u: any) => u && typeof u === "object" && (u.id === userId || u.user_id === userId));
      } catch {
        return false;
      }
    });

    // Mappa dutyId -> name
    const allDuties = await prisma.duty.findMany({
      select: { id: true, name: true },
    });
    const dutyMap = new Map(allDuties.map((d) => [d.id, d.name]));

    const enriched = userAssignments.map((assignment) => {
      let dutyName: string | null = null;
      if (assignment.assignedUsers) {
        try {
          const parsed = JSON.parse(assignment.assignedUsers);
          if (Array.isArray(parsed)) {
            const userEntry = parsed.find((u: any) => {
              if (typeof u === "string") return u === userId;
              if (u && typeof u === "object" && u.userId) return u.userId === userId;
              return false;
            });
            if (userEntry && typeof userEntry === "object" && userEntry.dutyId) {
              dutyName = dutyMap.get(userEntry.dutyId) || null;
            }
          }
        } catch {}
      }

      const timeEntry = assignment.timeEntries?.[0] ?? null;
      return {
        id: assignment.id,
        workdayId: assignment.workdayId,
        userId: assignment.userId,
        taskTypeId: assignment.taskTypeId,
        clientId: assignment.clientId,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        area: assignment.area,
        personnelRequests: assignment.personnelRequests,
        assignedUsers: assignment.assignedUsers,
        note: assignment.note,
        hasScheduledBreak: assignment.hasScheduledBreak,
        scheduledBreakStartTime: assignment.scheduledBreakStartTime,
        scheduledBreakEndTime: assignment.scheduledBreakEndTime,
        scheduledBreaks: assignment.scheduledBreaks,
        dutyName,
        workday: assignment.workday
          ? {
              date: assignment.workday.date instanceof Date ? assignment.workday.date.toISOString() : assignment.workday.date,
              event: assignment.workday.event,
              location: assignment.workday.location,
            }
          : null,
        taskType: assignment.taskType,
        timeEntry: timeEntry
          ? {
              id: timeEntry.id,
              hoursWorked: timeEntry.hoursWorked,
              startTime: timeEntry.startTime,
              endTime: timeEntry.endTime,
              notes: timeEntry.notes,
              hasTakenBreak: timeEntry.hasTakenBreak,
              actualBreakStartTime: timeEntry.actualBreakStartTime,
              actualBreakEndTime: timeEntry.actualBreakEndTime,
              actualBreaks: timeEntry.actualBreaks,
              date: timeEntry.date instanceof Date ? timeEntry.date.toISOString() : timeEntry.date,
            }
          : null,
      };
    });

    return NextResponse.json({ shifts: enriched });
  } catch (error) {
    console.error("Error fetching my shifts:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Failed to fetch shifts", details: msg }, { status: 500 });
  }
}


