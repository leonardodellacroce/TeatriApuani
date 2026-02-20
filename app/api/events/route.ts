import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isLocationArchived } from "@/lib/validation";
import { getWorkModeFromRequest } from "@/lib/workMode";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const events = await prisma.event.findMany({
      include: {
        location: true,
        workdays: {
          include: {
            location: true,
            assignments: {
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
                    id: true,
                    name: true,
                    type: true,
                    color: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        startDate: 'desc',
      },
    });

    // Risolvi assignedUsers (JSON) con i nomi degli utenti per la vista Programma
    const allAssignedUserIds = new Set<string>();
    events.forEach((event) => {
      event.workdays?.forEach((wd: any) => {
        wd.assignments?.forEach((a: any) => {
          if (a.assignedUsers) {
            try {
              const parsed = JSON.parse(a.assignedUsers);
              if (Array.isArray(parsed)) {
                parsed.forEach((item: any) => {
                  const uid = typeof item === "string" ? item : item?.userId;
                  if (uid) allAssignedUserIds.add(uid);
                });
              }
            } catch {}
          }
        });
      });
    });

    const usersMap = new Map<string, { name: string; cognome: string; code: string }>();
    if (allAssignedUserIds.size > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: Array.from(allAssignedUserIds) } },
        select: { id: true, name: true, cognome: true, code: true },
      });
      users.forEach((u) => {
        usersMap.set(u.id, {
          name: u.name || "",
          cognome: u.cognome || "",
          code: u.code || "",
        });
      });
    }

    events.forEach((event) => {
      event.workdays?.forEach((wd: any) => {
        wd.assignments?.forEach((a: any) => {
          if (a.assignedUsers) {
            try {
              const parsed = JSON.parse(a.assignedUsers);
              if (Array.isArray(parsed)) {
                (a as any).assignedUsersResolved = parsed
                  .map((item: any) => {
                    const uid = typeof item === "string" ? item : item?.userId;
                    if (!uid) return null;
                    const u = usersMap.get(uid);
                    if (!u) return null;
                    return { userId: uid, ...u };
                  })
                  .filter(Boolean);
              }
            } catch {}
          }
        });
      });
    });

    // Se l'utente non è ADMIN o SUPER_ADMIN, nascondi le informazioni del cliente
    // Anche RESPONSABILE, COORDINATORE e UTENTE non possono vedere i dati del cliente
    const isAdmin = ["SUPER_ADMIN", "ADMIN"].includes(session.user.role);
    if (!isAdmin) {
      events.forEach(event => {
        event.clientName = null;
      });
    }

    return NextResponse.json(events);
  } catch (error) {
    console.error("Error fetching events:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Solo ADMIN e SUPER_ADMIN possono creare eventi
    if (!["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const isNonStandardWorker = (session.user as any).isWorker === true;
    if (isNonStandardWorker && getWorkModeFromRequest(request) === "worker") {
      return NextResponse.json({ error: "Forbidden - Passa in modalità amministratore per creare eventi" }, { status: 403 });
    }

    const body = await request.json();
    const { title, clientName, clientIds, locationId, startDate, endDate, notes } = body;

    if (!title || !startDate || !endDate) {
      return NextResponse.json(
        { error: "Title, startDate, and endDate are required" },
        { status: 400 }
      );
    }

    // Gestisci sia clientIds (nuovo formato) che clientName (vecchio formato per retrocompatibilità)
    let finalClientIds: string | null = null;
    if (clientIds) {
      let parsedClientIds: string[] = [];
      if (typeof clientIds === 'string') {
        const parsed = JSON.parse(clientIds);
        parsedClientIds = Array.isArray(parsed) ? parsed : [];
      } else if (Array.isArray(clientIds)) {
        parsedClientIds = clientIds;
      }
      
      // Solo imposta se ci sono clienti validi
      if (parsedClientIds.length > 0) {
        finalClientIds = JSON.stringify(parsedClientIds);
      }
    }

    // Verifica che la location (se fornita) non sia archiviata
    if (locationId) {
      const locationArchived = await isLocationArchived(locationId);
      if (locationArchived === null) {
        return NextResponse.json(
          { error: "Location non trovata" },
          { status: 404 }
        );
      }
      if (locationArchived) {
        return NextResponse.json(
          { error: "Non è possibile utilizzare una location archiviata per creare un evento" },
          { status: 400 }
        );
      }
    }

    // Converti le date in DateTime usando UTC esplicito per evitare problemi di timezone
    let startDateTime = new Date(startDate);
    // Se la stringa è solo una data (formato YYYY-MM-DD), crea una data in UTC
    if (typeof startDate === 'string' && startDate.length === 10 && !startDate.includes('T')) {
      const [year, month, day] = startDate.split('-').map(Number);
      startDateTime = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    }
    
    let endDateTime = new Date(endDate);
    // Se la stringa è solo una data (formato YYYY-MM-DD), crea una data in UTC
    if (typeof endDate === 'string' && endDate.length === 10 && !endDate.includes('T')) {
      const [year, month, day] = endDate.split('-').map(Number);
      // Crea la data di fine a mezzanotte del giorno indicato
      endDateTime = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    }

    const event = await prisma.event.create({
      data: {
        title,
        clientName: clientName || null, // Mantieni per retrocompatibilità
        clientIds: finalClientIds,
        locationId: locationId || null,
        startDate: startDateTime,
        endDate: endDateTime,
        notes: notes || null,
      },
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error("Error creating event:", error);
    return NextResponse.json(
      { error: "Failed to create event", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

