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

    const userRole = (session.user as any).role || "";
    const isAdmin = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(userRole);
    const isStandardUser = !isAdmin;
    const isWorker = (session.user as any).isWorker === true;
    const isNonStandardWorker = !isStandardUser && isWorker;
    const workMode = getWorkModeFromRequest(req);

    if (!isAdmin && !isStandardUser && !isWorker) {
      return NextResponse.json({ error: "Forbidden - Accesso non consentito" }, { status: 403 });
    }
    if (!isAdmin && isNonStandardWorker && workMode === "admin") {
      return NextResponse.json({ error: "Forbidden - Passa in modalità lavoratore per accedere" }, { status: 403 });
    }

    const sessionUserId = session.user.id;
    const body = await req.json();
    const { assignmentId, userId: bodyUserId, hoursWorked, startTime, endTime, hasTakenBreak, actualBreakStartTime, actualBreakEndTime, actualBreaks, notes } = body;

    const userId = (isAdmin && bodyUserId) ? bodyUserId : sessionUserId;

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

    if (isAdmin && bodyUserId) {
      const targetUser = await prisma.user.findUnique({
        where: { id: bodyUserId },
        select: { companyId: true },
      });
      if (userRole === "RESPONSABILE") {
        const currentUser = await prisma.user.findUnique({
          where: { id: sessionUserId },
          select: { companyId: true },
        });
        if (!targetUser || !currentUser?.companyId || targetUser.companyId !== currentUser.companyId) {
          return NextResponse.json({ error: "Non autorizzato a inserire ore per questo dipendente" }, { status: 403 });
        }
      }
    }

    // Verifica che l'utente sia assegnato
    if (assignment.userId !== userId) {
      // Controlla anche in assignedUsers (JSON array)
      let userAssigned = false;
      if (assignment.assignedUsers) {
        try {
          const assignedUsers = JSON.parse(assignment.assignedUsers);
          userAssigned = Array.isArray(assignedUsers) &&
            assignedUsers.some((u: any) => (typeof u === "string" ? u === userId : u?.userId === userId));
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

    // Non consentire inserimento ore per turni futuri (oggi e passato consentiti)
    const workdayDate = assignment.workday?.date;
    if (workdayDate) {
      const d = workdayDate instanceof Date ? workdayDate : new Date(workdayDate);
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
          { error: "Non è possibile inserire ore per turni futuri" },
          { status: 400 }
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

    // Normalizza actualBreaks
    let breaksArray: Array<{ start: string; end: string }> = [];
    if (Array.isArray(actualBreaks) && actualBreaks.length > 0) {
      breaksArray = actualBreaks.filter((b: any) => b && typeof b.start === "string" && typeof b.end === "string");
    } else if (hasTakenBreak === true && actualBreakStartTime && actualBreakEndTime) {
      breaksArray = [{ start: actualBreakStartTime, end: actualBreakEndTime }];
    }

    if (breaksArray.length > 0 && startTime && endTime) {
      const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
      const startMin = toMin(startTime);
      let endMin = toMin(endTime);
      if (endMin <= startMin) endMin += 24 * 60;
      for (const b of breaksArray) {
        let bs = toMin(b.start);
        let be = toMin(b.end);
        if (be <= bs) be += 24 * 60;
        if (bs < startMin || be > endMin) {
          return NextResponse.json({ error: "Ogni pausa deve essere dentro l'orario di lavoro" }, { status: 400 });
        }
      }
    }

    const { serializeBreaks } = await import("@/lib/breaks");
    const timeEntry = await prisma.timeEntry.create({
      data: {
        assignmentId,
        userId,
        date: assignment.workday.date,
        hoursWorked: parseFloat(hoursWorked),
        startTime: startTime || null,
        endTime: endTime || null,
        hasTakenBreak: breaksArray.length > 0 ? true : (hasTakenBreak ?? null),
        actualBreakStartTime: breaksArray[0]?.start ?? null,
        actualBreakEndTime: breaksArray[0]?.end ?? null,
        actualBreaks: serializeBreaks(breaksArray),
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

