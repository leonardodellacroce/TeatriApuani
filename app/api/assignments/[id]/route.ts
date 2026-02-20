import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isUserArchived, checkEventStatus } from "@/lib/validation";
import { getWorkModeFromRequest } from "@/lib/workMode";

// GET /api/assignments/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
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

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    return NextResponse.json(assignment);
  } catch (error) {
    console.error("Error fetching assignment:", error);
    return NextResponse.json(
      { error: "Error fetching assignment" },
      { status: 500 }
    );
  }
}

// PATCH /api/assignments/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id } = await params;
    
    // Recupera l'assignment esistente per ottenere workdayId, startTime, endTime
    const existingAssignment = await prisma.assignment.findUnique({
      where: { id },
      select: { workdayId: true, startTime: true, endTime: true },
    });
    
    if (!existingAssignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }
    
    // Recupera il workday per ottenere l'eventId
    const workday = await prisma.workday.findUnique({
      where: { id: existingAssignment.workdayId },
      select: { eventId: true },
    });
    
    if (!workday) {
      return NextResponse.json({ error: "Workday not found" }, { status: 404 });
    }
    
    // Verifica che l'evento associato esista e non sia passato
    const eventStatus = await checkEventStatus(workday.eventId);
    if (!eventStatus.exists) {
      return NextResponse.json(
        { error: "Evento associato non trovato" },
        { status: 404 }
      );
    }
    
    // Solo il SUPER_ADMIN può modificare assignments per eventi passati
    const isSuperAdmin = (session.user as any).isSuperAdmin === true;
    if (eventStatus.isPast && !isSuperAdmin) {
      return NextResponse.json(
        { error: "Non è possibile modificare assegnazioni per eventi passati (solo Super Admin)" },
        { status: 403 }
      );
    }
    
    const body = await req.json();
    const { userId, taskTypeId, clientId, startTime, endTime, area, personnelRequests, assignedUsers, note, hasScheduledBreak, scheduledBreakStartTime, scheduledBreakEndTime } = body;

    console.log("PATCH assignment:", { id, bodyKeys: Object.keys(body), personnelRequests });
    
    // Verifica che l'utente (se fornito) non sia archiviato
    if (userId !== undefined && userId !== null) {
      const userArchived = await isUserArchived(userId);
      if (userArchived === null) {
        return NextResponse.json(
          { error: "Utente non trovato" },
          { status: 404 }
        );
      }
      if (userArchived) {
        return NextResponse.json(
          { error: "Non è possibile assegnare un utente archiviato" },
          { status: 400 }
        );
      }
    }

    // Verifica quali campi stanno cercando di aggiornare
    const restrictedFields = ['userId', 'taskTypeId', 'startTime', 'endTime', 'area', 'note'];
    const fieldsToUpdate = Object.keys(body).filter(key => body[key] !== undefined && key !== 'personnelRequests' && key !== 'assignedUsers');
    const isOnlyPersonnelRequests = fieldsToUpdate.length === 0 && (personnelRequests !== undefined || assignedUsers !== undefined);
    
    // Permessi:
    // - Aggiornare solo personnelRequests/assignedUsers: consentito a SUPER_ADMIN, ADMIN, RESPONSABILE
    // - Qualsiasi altro campo: solo SUPER_ADMIN, ADMIN, RESPONSABILE
    const allowedManageRoles = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"];
    if (isOnlyPersonnelRequests && !allowedManageRoles.includes(session.user.role || "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (fieldsToUpdate.length > 0) {
      if (!allowedManageRoles.includes(session.user.role || "")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Se stanno modificando startTime o endTime, dobbiamo validare contro le attività
    if (startTime !== undefined || endTime !== undefined) {
      // Recupera l'assignment corrente per avere tutti i dati necessari
      const currentAssignment = await prisma.assignment.findUnique({
        where: { id },
        include: {
          taskType: {
            select: {
              type: true,
            },
          },
        },
      });

      if (!currentAssignment) {
        return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
      }

      // Usa i nuovi valori se forniti, altrimenti quelli esistenti
      const finalStartTime = startTime !== undefined ? startTime : currentAssignment.startTime;
      const finalEndTime = endTime !== undefined ? endTime : currentAssignment.endTime;
      const finalTaskType = taskTypeId !== undefined 
        ? await prisma.taskType.findUnique({ where: { id: taskTypeId }, select: { type: true } })
        : currentAssignment.taskType;

      if (!finalStartTime || !finalEndTime || !finalTaskType) {
        return NextResponse.json(
          { error: "Missing required time or task type information" },
          { status: 400 }
        );
      }

      // Valida che i turni rientrino negli orari delle attività
      const { validateShiftWithinActivities } = await import("@/app/api/assignments/route");
      const validation = await validateShiftWithinActivities(
        existingAssignment.workdayId,
        finalStartTime,
        finalEndTime,
        finalTaskType
      );

      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error },
          { status: 400 }
        );
      }
    }

    // Valida clientId se fornito o se si sta modificando un turno
    if (clientId !== undefined || taskTypeId !== undefined) {
      // Recupera l'assignment corrente e l'evento per validare il clientId
      const currentAssignment = await prisma.assignment.findUnique({
        where: { id },
        include: {
          workday: {
            select: {
              event: {
                select: {
                  clientIds: true
                }
              }
            }
          },
          taskType: {
            select: {
              type: true
            }
          }
        }
      });

      if (!currentAssignment) {
        return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
      }

      const finalTaskType = taskTypeId !== undefined 
        ? await prisma.taskType.findUnique({ where: { id: taskTypeId }, select: { type: true } })
        : currentAssignment.taskType;

      // Valida solo per i turni (SHIFT)
      if (finalTaskType?.type === "SHIFT") {
        const eventClientIds = currentAssignment.workday.event.clientIds 
          ? JSON.parse(currentAssignment.workday.event.clientIds) 
          : [];

        // Se non ci sono clienti, permetti comunque la modifica
        if (eventClientIds.length === 0) {
          // OK - nessun cliente
        } else if (eventClientIds.length > 1 && clientId !== undefined) {
          // Con 2+ clienti, verifica che il clientId sia valido
          if (clientId && !eventClientIds.includes(clientId)) {
            return NextResponse.json(
              { error: "Il cliente specificato non è associato all'evento" },
              { status: 400 }
            );
          }
        }
      }
    }

    // Validazione pausa se presente
    if (hasScheduledBreak !== undefined) {
      if (hasScheduledBreak === true) {
        if (!scheduledBreakStartTime || !scheduledBreakEndTime) {
          return NextResponse.json(
            { error: "scheduledBreakStartTime and scheduledBreakEndTime are required when hasScheduledBreak is true" },
            { status: 400 }
          );
        }
        
        // Verifica che la pausa sia dentro l'intervallo lavorativo
        const timeToMinutes = (timeStr: string): number => {
          const [hours, minutes] = timeStr.split(':').map(Number);
          return hours * 60 + minutes;
        };
        
        const finalStartTime = startTime !== undefined ? startTime : existingAssignment.startTime;
        const finalEndTime = endTime !== undefined ? endTime : existingAssignment.endTime;
        
        if (!finalStartTime || !finalEndTime) {
          return NextResponse.json(
            { error: "startTime and endTime must be set before setting a scheduled break" },
            { status: 400 }
          );
        }
        
        const breakStartMinutes = timeToMinutes(scheduledBreakStartTime);
        let breakEndMinutes = timeToMinutes(scheduledBreakEndTime);
        const shiftStartMinutes = timeToMinutes(finalStartTime);
        let shiftEndMinutes = timeToMinutes(finalEndTime);
        
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
      }
    }

    const updateData: any = {};
    if (userId !== undefined) updateData.userId = userId;
    if (taskTypeId !== undefined) updateData.taskTypeId = taskTypeId;
    if (clientId !== undefined) updateData.clientId = clientId;
    if (startTime !== undefined) updateData.startTime = startTime;
    if (endTime !== undefined) updateData.endTime = endTime;
    if (area !== undefined) updateData.area = area;
    if (hasScheduledBreak !== undefined) {
      updateData.hasScheduledBreak = hasScheduledBreak === true;
      updateData.scheduledBreakStartTime = hasScheduledBreak === true ? scheduledBreakStartTime : null;
      updateData.scheduledBreakEndTime = hasScheduledBreak === true ? scheduledBreakEndTime : null;
    }
    if (personnelRequests !== undefined) {
      // Accetta sia stringa JSON che oggetto/array e serializza
      let prValue: any = personnelRequests;
      if (typeof prValue !== 'string' && prValue !== null) {
        try { prValue = JSON.stringify(prValue); } catch { prValue = null; }
      }
      updateData.personnelRequests = prValue || null;
      console.log("Setting personnelRequests:", updateData.personnelRequests);
    }
    if (assignedUsers !== undefined) {
      // Normalizza array: mantieni un solo duty per utente (esclusività)
      let normalized: any = null;
      try {
        const parsed = typeof assignedUsers === 'string' ? JSON.parse(assignedUsers) : assignedUsers;
        if (Array.isArray(parsed)) {
          const byUser: Record<string, string> = {};
          for (const it of parsed) {
            if (it && typeof it === 'object' && it.userId && it.dutyId) {
              if (!byUser[it.userId]) byUser[it.userId] = it.dutyId; // prima occorrenza vince
            }
          }
          normalized = Object.entries(byUser).map(([userId, dutyId]) => ({ userId, dutyId }));
          
          // Verifica che nessuno degli utenti sia archiviato
          for (const [userId] of Object.entries(byUser)) {
            const userArchived = await isUserArchived(userId);
            if (userArchived === null) {
              return NextResponse.json(
                { error: `Utente ${userId} non trovato` },
                { status: 404 }
              );
            }
            if (userArchived) {
              return NextResponse.json(
                { error: "Non è possibile assegnare utenti archiviati" },
                { status: 400 }
              );
            }
          }
        }
      } catch {}
      const auValue = normalized ? JSON.stringify(normalized) : (typeof assignedUsers === 'string' ? assignedUsers : JSON.stringify(assignedUsers));
      updateData.assignedUsers = auValue || null;
      console.log("Setting assignedUsers (normalized)", updateData.assignedUsers);
    }
    if (note !== undefined) updateData.note = note;

    console.log("Update data:", updateData);

    try {
      const assignment = await prisma.assignment.update({
        where: { id },
        data: updateData,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
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

      console.log("Assignment updated successfully");
      return NextResponse.json(assignment);
    } catch (prismaError: any) {
      console.error("Prisma error:", prismaError);
      console.error("Error code:", prismaError?.code);
      console.error("Error message:", prismaError?.message);
      throw prismaError;
    }
  } catch (error: any) {
    console.error("Error updating assignment:", error);
    console.error("Error details:", {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
    });
    return NextResponse.json(
      { 
        error: "Error updating assignment",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

// DELETE /api/assignments/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowedRoles = ["SUPER_ADMIN", "ADMIN"];
  if (!allowedRoles.includes(session.user.role || "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    
    // Recupera l'assignment per ottenere il workdayId
    const assignment = await prisma.assignment.findUnique({
      where: { id },
      select: { workdayId: true },
    });
    
    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }
    
    // Recupera il workday per ottenere l'eventId
    const workday = await prisma.workday.findUnique({
      where: { id: assignment.workdayId },
      select: { eventId: true },
    });
    
    if (!workday) {
      return NextResponse.json({ error: "Workday not found" }, { status: 404 });
    }
    
    // Verifica che l'evento associato esista e non sia passato
    const eventStatus = await checkEventStatus(workday.eventId);
    if (!eventStatus.exists) {
      return NextResponse.json(
        { error: "Evento associato non trovato" },
        { status: 404 }
      );
    }
    
    // Solo il SUPER_ADMIN può eliminare assignments per eventi passati
    const isSuperAdmin = (session.user as any).isSuperAdmin === true;
    if (eventStatus.isPast && !isSuperAdmin) {
      return NextResponse.json(
        { error: "Non è possibile eliminare assegnazioni per eventi passati (solo Super Admin)" },
        { status: 403 }
      );
    }

    await prisma.assignment.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting assignment:", error);
    return NextResponse.json(
      { error: "Error deleting assignment" },
      { status: 500 }
    );
  }
}

