import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Solo ADMIN, SUPER_ADMIN e RESPONSABILE possono vedere i report
    const allowedRoles = ["SUPER_ADMIN", "ADMIN", "RESPONSABILE"];
    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const eventId = searchParams.get("eventId");
    const clientId = searchParams.get("clientId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const userIdsParam = searchParams.get("userIds");

    const userIds = userIdsParam ? userIdsParam.split(',').filter(Boolean) : [];

    // Costruisci le condizioni di filtro per i workdays
    let workdayWhere: any = {};

    if (type === "event") {
      if (!eventId) {
        return NextResponse.json({ error: "eventId is required for event type" }, { status: 400 });
      }
      workdayWhere.eventId = eventId;
    } else if (type === "date-range") {
      if (!startDate || !endDate) {
        return NextResponse.json({ error: "startDate and endDate are required for date-range type" }, { status: 400 });
      }
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      workdayWhere.date = {
        gte: start,
        lte: end,
      };
    } else if (type === "client") {
      if (!clientId) {
        return NextResponse.json({ error: "clientId is required for client type" }, { status: 400 });
      }
      // Per i clienti, dobbiamo filtrare gli eventi che hanno questo cliente
      const eventsWithClient = await prisma.event.findMany({
        where: {
          OR: [
            { clientIds: { contains: clientId } },
            { clientName: { contains: clientId } }, // Fallback per retrocompatibilità
          ],
        },
        select: { id: true },
      });
      const eventIds = eventsWithClient.map(e => e.id);
      if (eventIds.length === 0) {
        return NextResponse.json({
          summary: [],
          details: [],
        });
      }
      workdayWhere.eventId = { in: eventIds };
    } else {
      return NextResponse.json({ error: "Invalid type. Must be 'event', 'date-range', or 'client'" }, { status: 400 });
    }

    // Recupera i workdays che corrispondono ai filtri
    const workdays = await prisma.workday.findMany({
      where: workdayWhere,
      select: {
        id: true,
        date: true,
        event: {
          select: {
            id: true,
            title: true,
            clientIds: true,
            clientName: true,
          },
        },
      },
    });

    const workdayIds = workdays.map(w => w.id);

    if (workdayIds.length === 0) {
      return NextResponse.json({
        summary: [],
        details: [],
      });
    }

    // Recupera tutti gli Assignment per questi workdays (solo turni)
    const allAssignments = await prisma.assignment.findMany({
      where: {
        workdayId: { in: workdayIds },
        taskType: {
          type: "SHIFT", // Solo turni, non attività
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            cognome: true,
            code: true,
          },
        },
        taskType: {
          select: {
            name: true,
          },
        },
        workday: {
          select: {
            date: true,
            event: {
              select: {
                id: true,
                title: true,
                clientIds: true,
                clientName: true,
              },
            },
          },
        },
        timeEntries: {
          select: {
            userId: true,
            hoursWorked: true,
            startTime: true,
            endTime: true,
            notes: true,
          },
        },
      },
    });

    // Filtra gli Assignment in base agli utenti selezionati
    let assignments = allAssignments;
    if (userIds.length > 0) {
      assignments = allAssignments.filter(assignment => {
        // Controlla userId diretto
        if (assignment.userId && userIds.includes(assignment.userId)) {
          return true;
        }
        
        // Controlla assignedUsers
        if (assignment.assignedUsers) {
          try {
            const parsed = JSON.parse(assignment.assignedUsers);
            if (Array.isArray(parsed)) {
              return parsed.some((item: any) => {
                const uid = typeof item === 'string' ? item : item?.userId;
                return uid && userIds.includes(uid);
              });
            }
          } catch {
            // Ignora errori di parsing
          }
        }
        
        return false;
      });
    }

    // Se c'è un filtro per cliente, filtra anche gli Assignment
    if (type === "client" && clientId) {
      const filteredAssignments = assignments.filter(a => {
        if (a.clientId === clientId) return true;
        // Verifica anche negli eventi
        const eventClientIds = a.workday.event.clientIds 
          ? JSON.parse(a.workday.event.clientIds) 
          : [];
        return eventClientIds.includes(clientId);
      });
      assignments.splice(0, assignments.length, ...filteredAssignments);
    }

    // Costruisci i dettagli del report
    const details: any[] = [];
    const userHoursMap = new Map<string, { hours: number; shifts: number }>();

    for (const assignment of assignments) {
      const workday = assignment.workday;
      const event = workday.event;
      
      // Determina il nome del cliente
      let clientName: string | null = null;
      if (assignment.clientId) {
        const client = await prisma.client.findUnique({
          where: { id: assignment.clientId },
          select: { ragioneSociale: true },
        });
        clientName = client?.ragioneSociale || null;
      } else if (event.clientName) {
        clientName = event.clientName;
      }

      // Gestisci utenti da userId o assignedUsers
      const toUserLike = (u: { id: string; name: string | null; cognome: string | null; code: string }) =>
        ({ id: u.id, name: u.name ?? "", cognome: u.cognome ?? "", code: u.code });
      const usersToProcess: Array<{ id: string; name: string; cognome: string; code: string }> = [];
      
      if (assignment.userId && assignment.user) {
        usersToProcess.push(toUserLike(assignment.user));
      }
      
      // Aggiungi utenti da assignedUsers
      if (assignment.assignedUsers) {
        try {
          const parsed = JSON.parse(assignment.assignedUsers);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              const uid = typeof item === 'string' ? item : item?.userId;
              if (uid) {
                const user = await prisma.user.findUnique({
                  where: { id: uid },
                  select: { id: true, name: true, cognome: true, code: true },
                });
                if (user && !usersToProcess.find(u => u.id === user.id)) {
                  usersToProcess.push(toUserLike(user));
                }
              }
            }
          }
        } catch {
          // Ignora errori di parsing
        }
      }

      // Se ci sono filtri per utenti, filtra
      if (userIds.length > 0) {
        const filtered = usersToProcess.filter(u => userIds.includes(u.id));
        if (filtered.length === 0) continue;
        usersToProcess.splice(0, usersToProcess.length, ...filtered);
      }

      for (const user of usersToProcess) {
        // Trova le time entries per questo utente e assignment
        const timeEntry = assignment.timeEntries.find(te => te.userId === user.id);
        
        const hoursWorked = timeEntry?.hoursWorked || 0;
        const actualStartTime = timeEntry?.startTime || null;
        const actualEndTime = timeEntry?.endTime || null;
        const notes = timeEntry?.notes || null;

        // Aggiorna il riepilogo per utente
        if (!userHoursMap.has(user.id)) {
          userHoursMap.set(user.id, { hours: 0, shifts: 0 });
        }
        const userData = userHoursMap.get(user.id)!;
        userData.hours += hoursWorked;
        userData.shifts += 1;

        details.push({
          date: workday.date.toISOString(),
          userId: user.id,
          userName: `${user.name || ''} ${user.cognome || ''}`.trim(),
          userCode: user.code,
          eventId: event.id,
          eventTitle: event.title,
          clientId: assignment.clientId,
          clientName: clientName,
          assignmentId: assignment.id,
          scheduledStartTime: assignment.startTime,
          scheduledEndTime: assignment.endTime,
          actualStartTime: actualStartTime,
          actualEndTime: actualEndTime,
          hoursWorked: hoursWorked,
          area: assignment.area,
          taskTypeName: assignment.taskType.name,
          notes: notes,
        });
      }
    }

    // Costruisci il riepilogo
    const summary = Array.from(userHoursMap.entries()).map(([userId, data]) => {
      const user = details.find(d => d.userId === userId);
      return {
        userId,
        userName: user?.userName || "",
        userCode: user?.userCode || "",
        totalHours: data.hours,
        shiftsCount: data.shifts,
      };
    });

    // Ordina i dettagli per data e utente
    details.sort((a, b) => {
      const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateCompare !== 0) return dateCompare;
      return a.userCode.localeCompare(b.userCode);
    });

    return NextResponse.json({
      summary,
      details,
    });
  } catch (error) {
    console.error("Error generating report:", error);
    return NextResponse.json(
      { error: "Error generating report", details: String(error) },
      { status: 500 }
    );
  }
}

