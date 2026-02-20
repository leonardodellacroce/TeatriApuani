import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getWorkModeFromRequest } from "@/lib/workMode";

// GET /api/time-entries/my-assignments - Lista assignments dell'utente senza time entry
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

    // Costruisci filtro date
    const dateFilter: any = {};
    if (startDate) {
      dateFilter.gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.lte = new Date(endDate);
    }

    // Recupera TUTTI gli assignments nel periodo (approccio più semplice e robusto)
    const allAssignments = await prisma.assignment.findMany({
      where: {
        ...(Object.keys(dateFilter).length > 0 && {
          workday: {
            date: dateFilter,
          },
        }),
      },
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
      orderBy: {
        workday: {
          date: "desc",
        },
      },
    });

    console.log(`[my-assignments] Total assignments in period: ${allAssignments.length}`);

    // Filtra in memoria per quelli assegnati all'utente
    const userAssignments = allAssignments.filter((a) => {
      // Controllo diretto su userId
      if (a.userId === userId) {
        return true;
      }
      
      // Controllo in assignedUsers (JSON array)
      if (a.assignedUsers) {
        try {
          const assignedUsers = JSON.parse(a.assignedUsers);
          if (Array.isArray(assignedUsers)) {
            // Supporta sia [userId] che [{userId, dutyId}]
            const found = assignedUsers.some((u: any) => {
              if (typeof u === 'string') {
                return u === userId;
              } else if (u && typeof u === 'object' && u.userId) {
                return u.userId === userId;
              }
              return false;
            });
            if (found) {
              console.log(`[my-assignments] Found user in assignedUsers for assignment ${a.id}:`, a.assignedUsers);
            }
            return found;
          }
        } catch (e) {
          console.error(`[my-assignments] Error parsing assignedUsers for assignment ${a.id}:`, e, a.assignedUsers);
          return false;
        }
      }
      
      return false;
    });
    
    console.log(`[my-assignments] User ${userId}: Found ${userAssignments.length} assignments assigned to user`);

    // Trova le time entries esistenti per questi assignments
    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        userId,
        assignmentId: {
          in: userAssignments.map((a) => a.id),
        },
      },
      select: {
        assignmentId: true,
      },
    });

    const existingAssignmentIds = new Set(timeEntries.map((te) => te.assignmentId));

    // Filtra assignments senza time entry
    const assignmentsWithoutEntry = userAssignments.filter(
      (a) => !existingAssignmentIds.has(a.id)
    );

    // Carica tutti i duty per mappare dutyId -> nome
    const allDuties = await prisma.duty.findMany({
      select: {
        id: true,
        name: true,
      },
    });
    const dutyMap = new Map(allDuties.map(d => [d.id, d.name]));

    // Arricchisci con calcolo ore programmate e nomi duty
    const enriched = assignmentsWithoutEntry.map((assignment) => {
      let plannedHours = 0;

      if (assignment.startTime && assignment.endTime) {
        const [startH, startM] = assignment.startTime.split(":").map(Number);
        const [endH, endM] = assignment.endTime.split(":").map(Number);
        const startMinutes = startH * 60 + startM;
        let endMinutes = endH * 60 + endM;
        
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

      return {
        ...assignment,
        plannedHours,
        dutyName,
      };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("Error fetching assignments:", error);
    return NextResponse.json(
      { error: "Failed to fetch assignments" },
      { status: 500 }
    );
  }
}

