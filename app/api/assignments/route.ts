import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isUserArchived, checkEventStatus } from "@/lib/validation";
import { getWorkModeFromRequest } from "@/lib/workMode";

// Helper per validare che i turni rientrino negli orari delle attività
export async function validateShiftWithinActivities(
  workdayId: string,
  startTime: string,
  endTime: string,
  taskType: { type: string }
): Promise<{ valid: boolean; error?: string }> {
  // Valida solo i turni (SHIFT), non le attività
  if (taskType.type !== "SHIFT") {
    return { valid: true };
  }

  // Recupera tutte le attività della giornata
  const activities = await prisma.assignment.findMany({
    where: {
      workdayId,
    },
    include: {
      taskType: {
        select: {
          type: true,
        },
      },
    },
  });

  const activityAssignments = activities.filter(a => a.taskType?.type === "ACTIVITY");

  // Se non ci sono attività definite, non si possono creare turni
  if (activityAssignments.length === 0) {
    return {
      valid: false,
      error: "Non è possibile impostare turni senza attività definite per questa giornata",
    };
  }

  // Costruisci gli intervalli coperti dalle attività
  const activitySpans: Array<{ start: string; end: string }> = [];
  activityAssignments.forEach(a => {
    if (a.startTime && a.endTime) {
      activitySpans.push({ start: a.startTime, end: a.endTime });
    }
  });

  if (activitySpans.length === 0) {
    return {
      valid: false,
      error: "Non ci sono attività con orari definiti per questa giornata",
    };
  }

  // Converti orari in minuti
  const timeToMinutes = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const shiftStart = timeToMinutes(startTime);
  let shiftEnd = timeToMinutes(endTime);
  const shiftIsOvernight = shiftEnd <= shiftStart;
  if (shiftIsOvernight) {
    shiftEnd += 24 * 60;
  }

  // Verifica che l'inizio del turno sia dentro un'attività
  let startValid = false;
  for (const span of activitySpans) {
    const spanStart = timeToMinutes(span.start);
    let spanEnd = timeToMinutes(span.end);
    const isOvernight = spanEnd <= spanStart;
    if (isOvernight) {
      spanEnd += 24 * 60;
    }

    if (shiftStart >= spanStart && shiftStart <= spanEnd) {
      startValid = true;
      break;
    }
  }

  // Verifica che la fine del turno sia dentro un'attività
  let endValid = false;
  for (const span of activitySpans) {
    const spanStart = timeToMinutes(span.start);
    let spanEnd = timeToMinutes(span.end);
    const isOvernight = spanEnd <= spanStart;
    if (isOvernight) {
      spanEnd += 24 * 60;
    }

    if (shiftEnd >= spanStart && shiftEnd <= spanEnd) {
      endValid = true;
      break;
    }
  }

  const activityTimesStr = activitySpans.map(s => `${s.start} - ${s.end}`).join(', ');

  if (!startValid && !endValid) {
    return {
      valid: false,
      error: `Gli orari del turno (${startTime} - ${endTime}) sono completamente fuori dagli orari delle attività definite (${activityTimesStr})`,
    };
  }

  if (!startValid) {
    return {
      valid: false,
      error: `L'ora di inizio del turno (${startTime}) è fuori dagli orari delle attività definite (${activityTimesStr})`,
    };
  }

  if (!endValid) {
    return {
      valid: false,
      error: `L'ora di fine del turno (${endTime}) è fuori dagli orari delle attività definite (${activityTimesStr})`,
    };
  }

  return { valid: true };
}

// GET /api/assignments?userId=...&date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const dateStr = searchParams.get("date");

    if (!userId || !dateStr) {
      return NextResponse.json(
        { error: "Missing userId or date" },
        { status: 400 }
      );
    }
    // calcola inizio/fine giornata
    // Calcolo range giorno (locale) -> [startOfDay, nextStartOfDay)
    const start = new Date(dateStr);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    // trova tutte le giornate e relativi turni dell'utente in quel giorno
    const workdays = await prisma.workday.findMany({
      where: {
        date: { gte: start, lt: end },
      },
      select: { 
        id: true, 
        location: { select: { id: true, name: true } },
        event: { select: { id: true, title: true } }
      },
    });
    const wdIds = workdays.map((w) => w.id);
    if (wdIds.length === 0) return NextResponse.json([]);

    const assignments = await prisma.assignment.findMany({
      where: {
        workdayId: { in: wdIds },
        taskType: { is: { type: "SHIFT" } },
        OR: [
          { assignedUsers: { contains: userId } },
          { userId: userId },
        ],
      },
      select: {
        id: true,
        workdayId: true,
        startTime: true,
        endTime: true,
        area: true,
      },
    });

    const mapLoc: Record<string, string> = {};
    const mapEvent: Record<string, string> = {};
    workdays.forEach((w) => {
      mapLoc[w.id] = (w as any).location?.name || "";
      mapEvent[w.id] = (w as any).event?.title || "";
    });

    const result = assignments.map((a) => ({
      id: a.id,
      workdayId: a.workdayId,
      locationName: mapLoc[a.workdayId] || "",
      eventTitle: mapEvent[a.workdayId] || "",
      startTime: a.startTime,
      endTime: a.endTime,
      area: a.area,
    }));

    return NextResponse.json(result);
  } catch (e) {
    console.error("GET /api/assignments error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/assignments
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowedRoles = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"];
  if (!allowedRoles.includes(session.user.role || "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const isNonStandardWorker = (session.user as any).isWorker === true;
  if (isNonStandardWorker && getWorkModeFromRequest(req) === "worker") {
    return NextResponse.json({ error: "Forbidden - Passa in modalità amministratore per gestire le assegnazioni" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { workdayId, userId, taskTypeId, clientId, startTime, endTime, area, note, hasScheduledBreak, scheduledBreakStartTime, scheduledBreakEndTime } = body;

    console.log("[POST /api/assignments] Request body:", { workdayId, taskTypeId, startTime, endTime, area, hasScheduledBreak });

    if (!workdayId || !taskTypeId || !startTime || !endTime || !area) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verifica che workdayId e taskTypeId esistano
    const [workday, taskType] = await Promise.all([
      prisma.workday.findUnique({ 
        where: { id: workdayId },
        select: { 
          id: true, 
          eventId: true,
          event: {
            select: {
              clientIds: true
            }
          }
        }
      }),
      prisma.taskType.findUnique({ where: { id: taskTypeId } }),
    ]);

    if (!workday) {
      return NextResponse.json({ error: "Workday not found" }, { status: 404 });
    }
    if (!taskType) {
      return NextResponse.json({ error: "TaskType not found" }, { status: 404 });
    }
    
    // Valida clientId per i turni (SHIFT) - solo se fornito
    if (taskType.type === "SHIFT" && clientId) {
      const eventClientIds = workday.event?.clientIds ? JSON.parse(workday.event.clientIds) : [];
      
      // Se è fornito un clientId, verifica che sia tra quelli dell'evento
      if (eventClientIds.length > 0 && !eventClientIds.includes(clientId)) {
        return NextResponse.json(
          { error: "Il cliente specificato non è associato all'evento" },
          { status: 400 }
        );
      }
    }
    
    // Verifica che l'evento associato esista e non sia passato
    const eventStatus = await checkEventStatus(workday.eventId);
    if (!eventStatus.exists) {
      return NextResponse.json(
        { error: "Evento associato non trovato" },
        { status: 404 }
      );
    }
    
    // Solo il SUPER_ADMIN può creare assignments per eventi passati
    const isSuperAdmin = (session.user as any).isSuperAdmin === true;
    if (eventStatus.isPast && !isSuperAdmin) {
      return NextResponse.json(
        { error: "Non è possibile creare assegnazioni per eventi passati (solo Super Admin)" },
        { status: 403 }
      );
    }

    // Verifica userId solo se fornito
    let user = null;
    if (userId) {
      user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      
      // Verifica che l'utente non sia archiviato
      const userArchived = await isUserArchived(userId);
      if (userArchived) {
        return NextResponse.json(
          { error: "Non è possibile assegnare un utente archiviato" },
          { status: 400 }
        );
      }
    }

    // Valida che i turni rientrino negli orari delle attività
    const validation = await validateShiftWithinActivities(
      workdayId,
      startTime,
      endTime,
      taskType
    );
    
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Validazione pausa se presente
    if (hasScheduledBreak === true) {
      if (!scheduledBreakStartTime || !scheduledBreakEndTime) {
        return NextResponse.json(
          { error: "scheduledBreakStartTime and scheduledBreakEndTime are required when hasScheduledBreak is true" },
          { status: 400 }
        );
      }
      
      // Verifica che la pausa sia dentro l'intervallo lavorativo
      const timeToMinutes = (timeStr: string): number => {
        if (!timeStr || typeof timeStr !== 'string') {
          throw new Error(`Invalid time string: ${timeStr}`);
        }
        const [hours, minutes] = timeStr.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) {
          throw new Error(`Invalid time format: ${timeStr}`);
        }
        return hours * 60 + minutes;
      };
      
      try {
        const breakStartMinutes = timeToMinutes(scheduledBreakStartTime);
        let breakEndMinutes = timeToMinutes(scheduledBreakEndTime);
        const shiftStartMinutes = timeToMinutes(startTime);
        let shiftEndMinutes = timeToMinutes(endTime);
        
        if (breakEndMinutes <= breakStartMinutes) {
          breakEndMinutes += 24 * 60;
        }
        if (shiftEndMinutes <= shiftStartMinutes) {
          shiftEndMinutes += 24 * 60;
        }
        
        if (breakEndMinutes <= breakStartMinutes) {
          return NextResponse.json(
            { error: "scheduledBreakEndTime must be after scheduledBreakStartTime" },
            { status: 400 }
          );
        }
        
        if (breakStartMinutes < shiftStartMinutes || breakEndMinutes > shiftEndMinutes) {
          return NextResponse.json(
            { error: "Scheduled break must be within work time range" },
            { status: 400 }
          );
        }
      } catch (e: any) {
        return NextResponse.json(
          { error: `Invalid time format: ${e.message}` },
          { status: 400 }
        );
      }
    }

    // Prepara i dati per la creazione, gestendo correttamente i campi opzionali
    const assignmentData: any = {
      workdayId,
      userId: userId || null,
      taskTypeId,
      clientId: clientId || null,
      startTime,
      endTime,
      area,
      note: note || null,
      hasScheduledBreak: Boolean(hasScheduledBreak === true),
    };
    
    // Aggiungi i campi pausa solo se hasScheduledBreak è true
    if (hasScheduledBreak === true) {
      assignmentData.scheduledBreakStartTime = scheduledBreakStartTime || null;
      assignmentData.scheduledBreakEndTime = scheduledBreakEndTime || null;
    } else {
      assignmentData.scheduledBreakStartTime = null;
      assignmentData.scheduledBreakEndTime = null;
    }

    console.log("[POST /api/assignments] Creating assignment with data:", assignmentData);

    const assignment = await prisma.assignment.create({
      data: assignmentData,
      include: {
        ...(userId && {
          user: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        }),
        taskType: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
          },
        },
      },
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    console.error("Error creating assignment:", error);
    console.error("Error details:", {
      message: (error as any)?.message,
      code: (error as any)?.code,
      meta: (error as any)?.meta,
      stack: (error as any)?.stack,
    });
    return NextResponse.json(
      { 
        error: "Error creating assignment",
        details: (error as any)?.message || String(error),
        code: (error as any)?.code,
      },
      { status: 500 }
    );
  }
}

