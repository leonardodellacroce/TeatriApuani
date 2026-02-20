import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getWorkModeFromRequest } from "@/lib/workMode";

// GET /api/time-entries - Lista time entries dell'utente autenticato
// Solo utenti standard o abilitati come lavoratori (in modalità lavoratore se non-standard)
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
    const assignmentId = searchParams.get("assignmentId");

    // Costruisci filtro date
    const dateFilter: any = {};
    if (startDate) {
      dateFilter.gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.lte = new Date(endDate);
    }

    // Query base
    const where: any = {
      userId,
    };

    if (Object.keys(dateFilter).length > 0) {
      where.date = dateFilter;
    }

    if (assignmentId) {
      where.assignmentId = assignmentId;
    }

    const timeEntries = await prisma.timeEntry.findMany({
      where,
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
      orderBy: {
        date: "desc",
      },
    });

      // Carica tutti i duty per mappare dutyId -> nome
      const allDuties = await prisma.duty.findMany({
        select: {
          id: true,
          name: true,
        },
      });
      const dutyMap = new Map(allDuties.map(d => [d.id, d.name]));

      // Calcola ore programmate vs effettive
      const enriched = timeEntries.map((entry) => {
        const assignment = entry.assignment;
        let plannedHours = 0;

        // Calcola ore programmate da startTime/endTime
        if (assignment.startTime && assignment.endTime) {
          const [startH, startM] = assignment.startTime.split(":").map(Number);
          const [endH, endM] = assignment.endTime.split(":").map(Number);
          const startMinutes = startH * 60 + startM;
          let endMinutes = endH * 60 + endM;
          
          // Gestisci turni che passano mezzanotte
          if (endMinutes <= startMinutes) {
            endMinutes += 24 * 60;
          }
          
          plannedHours = (endMinutes - startMinutes) / 60;
        }

        // Estrai duty name solo per l'utente loggato da assignedUsers
        let dutyName: string | null = null;
        if (assignment.assignedUsers) {
          try {
            const assignedUsers = JSON.parse(assignment.assignedUsers);
            if (Array.isArray(assignedUsers)) {
              const userEntry = assignedUsers.find((u: any) => {
                if (typeof u === 'string') {
                  return u === userId;
                } else if (u && typeof u === 'object' && u.userId) {
                  return u.userId === userId;
                }
                return false;
              });
              if (userEntry && typeof userEntry === 'object' && userEntry.dutyId) {
                dutyName = dutyMap.get(userEntry.dutyId) || null;
              }
            }
          } catch (e) {
            // Ignora errori di parsing
          }
        }

        const difference = entry.hoursWorked - plannedHours;

        return {
          ...entry,
          plannedHours,
          difference,
          dutyName,
        };
      });

      return NextResponse.json(enriched);
  } catch (error) {
    console.error("Error fetching time entries:", error);
    return NextResponse.json(
      { error: "Failed to fetch time entries" },
      { status: 500 }
    );
  }
}

// POST /api/time-entries - Crea nuova time entry
export async function POST(req: NextRequest) {
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
    const body = await req.json();
    const { assignmentId, hoursWorked, startTime, endTime, hasTakenBreak, actualBreakStartTime, actualBreakEndTime, notes } = body;

    // Validazione input
    if (!assignmentId || !hoursWorked) {
      return NextResponse.json(
        { error: "assignmentId and hoursWorked are required" },
        { status: 400 }
      );
    }

    if (hoursWorked <= 0) {
      return NextResponse.json(
        { error: "hoursWorked must be greater than 0" },
        { status: 400 }
      );
    }

    // Verifica che l'utente sia assegnato a questo assignment
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        workday: true,
      },
    });

    if (!assignment) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 }
      );
    }

    // Verifica che l'utente sia assegnato
    if (assignment.userId !== userId) {
      // Controlla anche in assignedUsers (JSON array)
      let userAssigned = false;
      if (assignment.assignedUsers) {
        try {
          const assignedUsers = JSON.parse(assignment.assignedUsers);
          userAssigned = Array.isArray(assignedUsers) && 
            assignedUsers.some((u: any) => u.userId === userId);
        } catch (e) {
          // Ignora errori di parsing
        }
      }

      if (!userAssigned) {
        return NextResponse.json(
          { error: "You are not assigned to this assignment" },
          { status: 403 }
        );
      }
    }

    // Verifica che non esista già una time entry per questo assignment
    const existing = await prisma.timeEntry.findUnique({
      where: {
        assignmentId_userId: {
          assignmentId,
          userId,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Time entry already exists for this assignment. Use PATCH to update." },
        { status: 400 }
      );
    }

    // Validazione orari se presenti
    if (startTime && endTime) {
      const [startH, startM] = startTime.split(":").map(Number);
      const [endH, endM] = endTime.split(":").map(Number);
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

    // Validazione pausa se presente
    if (hasTakenBreak !== undefined && hasTakenBreak !== null) {
      if (hasTakenBreak === true && (!actualBreakStartTime || !actualBreakEndTime)) {
        return NextResponse.json(
          { error: "actualBreakStartTime and actualBreakEndTime are required when hasTakenBreak is true" },
          { status: 400 }
        );
      }
      
      if (actualBreakStartTime && actualBreakEndTime) {
        const [breakStartH, breakStartM] = actualBreakStartTime.split(":").map(Number);
        const [breakEndH, breakEndM] = actualBreakEndTime.split(":").map(Number);
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
        if (startTime && endTime) {
          const [startH, startM] = startTime.split(":").map(Number);
          const [endH, endM] = endTime.split(":").map(Number);
          const startMinutes = startH * 60 + startM;
          let endMinutes = endH * 60 + endM;
          
          if (endMinutes <= startMinutes) {
            endMinutes += 24 * 60;
          }
          
          if (breakStartMinutes < startMinutes || breakEndMinutes > endMinutes) {
            return NextResponse.json(
              { error: "Break time must be within work time range" },
              { status: 400 }
            );
          }
        }
      }
    }

    // Crea time entry
    const timeEntry = await prisma.timeEntry.create({
      data: {
        assignmentId,
        userId,
        date: assignment.workday.date,
        hoursWorked: parseFloat(hoursWorked),
        startTime: startTime || null,
        endTime: endTime || null,
        hasTakenBreak: hasTakenBreak !== undefined ? hasTakenBreak : null,
        actualBreakStartTime: actualBreakStartTime || null,
        actualBreakEndTime: actualBreakEndTime || null,
        notes: notes || null,
      },
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

    return NextResponse.json(timeEntry, { status: 201 });
  } catch (error: any) {
    console.error("Error creating time entry:", error);
    
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "Time entry already exists for this assignment" },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to create time entry", details: error.message },
      { status: 500 }
    );
  }
}

