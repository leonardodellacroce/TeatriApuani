import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getWorkModeFromRequest } from "@/lib/workMode";

function checkWorkerAccess(session: any, req: NextRequest): NextResponse | null {
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
    const { hoursWorked, startTime, endTime, hasTakenBreak, actualBreakStartTime, actualBreakEndTime, notes } = body;

    // Verifica che la time entry esista e appartenga all'utente
    const existing = await prisma.timeEntry.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Time entry not found" },
        { status: 404 }
      );
    }

    if (existing.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    if (hasTakenBreak !== undefined) updateData.hasTakenBreak = hasTakenBreak !== null ? hasTakenBreak : null;
    // Se hasTakenBreak è false, forza i valori della pausa a null per rimuoverli completamente
    if (hasTakenBreak === false) {
      updateData.actualBreakStartTime = null;
      updateData.actualBreakEndTime = null;
    } else {
      // Altrimenti, aggiorna solo se sono stati passati esplicitamente
      if (actualBreakStartTime !== undefined) {
        updateData.actualBreakStartTime = actualBreakStartTime || null;
      }
      if (actualBreakEndTime !== undefined) {
        updateData.actualBreakEndTime = actualBreakEndTime || null;
      }
    }
    if (notes !== undefined) updateData.notes = notes || null;

    // Validazione pausa se presente
    const finalHasTakenBreak = hasTakenBreak !== undefined ? hasTakenBreak : existing.hasTakenBreak;
    const finalActualBreakStartTime = actualBreakStartTime !== undefined ? actualBreakStartTime : existing.actualBreakStartTime;
    const finalActualBreakEndTime = actualBreakEndTime !== undefined ? actualBreakEndTime : existing.actualBreakEndTime;
    
    if (finalHasTakenBreak === true && (!finalActualBreakStartTime || !finalActualBreakEndTime)) {
      return NextResponse.json(
        { error: "actualBreakStartTime and actualBreakEndTime are required when hasTakenBreak is true" },
        { status: 400 }
      );
    }
    
    if (finalActualBreakStartTime && finalActualBreakEndTime) {
      const [breakStartH, breakStartM] = finalActualBreakStartTime.split(":").map(Number);
      const [breakEndH, breakEndM] = finalActualBreakEndTime.split(":").map(Number);
      const breakStartMinutes = breakStartH * 60 + breakStartM;
      let breakEndMinutes = breakEndH * 60 + breakEndM;
      
      if (breakEndMinutes <= breakStartMinutes) {
        breakEndMinutes += 24 * 60;
      }
      
      if (breakEndMinutes <= breakStartMinutes) {
        return NextResponse.json(
          { error: "actualBreakEndTime must be after actualBreakStartTime" },
          { status: 400 }
        );
      }
      
      // Verifica che la pausa sia dentro l'intervallo lavorativo
      const finalStartTime = startTime !== undefined ? startTime : existing.startTime;
      const finalEndTime = endTime !== undefined ? endTime : existing.endTime;
      
      if (finalStartTime && finalEndTime) {
        const [startH, startM] = finalStartTime.split(":").map(Number);
        const [endH, endM] = finalEndTime.split(":").map(Number);
        const startMinutes = startH * 60 + startM;
        let endMinutes = endH * 60 + endM;
        
        const workSpansMidnight = endMinutes <= startMinutes;
        if (workSpansMidnight) {
          endMinutes += 24 * 60;
        }
        
        // Normalizza la pausa nello stesso modo del turno se attraversa mezzanotte
        let normalizedBreakStart = breakStartMinutes;
        let normalizedBreakEnd = breakEndMinutes;
        
        // Se il turno attraversa mezzanotte, normalizza anche la pausa
        if (workSpansMidnight) {
          // Se la pausa inizia prima di mezzanotte ma il turno attraversa mezzanotte,
          // la pausa potrebbe essere nel giorno successivo
          if (normalizedBreakStart < startMinutes) {
            normalizedBreakStart += 24 * 60;
          }
          if (normalizedBreakEnd < normalizedBreakStart && normalizedBreakEnd < startMinutes) {
            normalizedBreakEnd += 24 * 60;
          }
        }
        
        if (normalizedBreakStart < startMinutes || normalizedBreakEnd > endMinutes) {
          return NextResponse.json(
            { error: "Break time must be within work time range" },
            { status: 400 }
          );
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

    // Verifica che la time entry esista e appartenga all'utente
    const existing = await prisma.timeEntry.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Time entry not found" },
        { status: 404 }
      );
    }

    if (existing.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

