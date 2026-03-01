import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isLocationArchived, isEventPast } from "@/lib/validation";
import { isMonthClosed } from "@/lib/closedMonth";
import { isDateInPreviousMonth } from "@/lib/previousMonth";
import { getWorkModeFromRequest } from "@/lib/workMode";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        location: true,
        workdays: {
          include: {
            location: true,
            assignments: {
              include: {
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
          orderBy: {
            date: 'asc',
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Se l'utente non è ADMIN o SUPER_ADMIN, nascondi le informazioni del cliente
    // Anche RESPONSABILE, COORDINATORE e UTENTE non possono vedere i dati del cliente
    const isAdmin = ["SUPER_ADMIN", "ADMIN"].includes(session.user.role);
    if (!isAdmin) {
      event.clientName = null;
    }

    const closedMonthsResult = await prisma.closedMonth.findMany({ select: { year: true, month: true } }).catch(() => []);
    const closedMonths = Array.isArray(closedMonthsResult) ? closedMonthsResult : [];
    return NextResponse.json({ ...event, closedMonths });
  } catch (error) {
    console.error("Error fetching event:", error);
    return NextResponse.json(
      { error: "Failed to fetch event" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Solo ADMIN e SUPER_ADMIN possono modificare eventi
    if (!["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const isStandardUser = !["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(session.user.role as string);
    const isNonStandardWorker = !isStandardUser && (session.user as any).isWorker === true;
    if (isNonStandardWorker && getWorkModeFromRequest(request) === "worker") {
      return NextResponse.json({ error: "Forbidden - Passa in modalità amministratore per modificare eventi" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    // Verifica se l'evento esiste e ottieni i dati attuali
    const existingEvent = await prisma.event.findUnique({
      where: { id },
      select: { endDate: true, clientIds: true },
    });

    if (!existingEvent) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Verifica se l'evento è passato
    const eventIsPast = isEventPast(existingEvent.endDate);

    // Solo il SUPER_ADMIN può modificare eventi passati
    const isSuperAdmin = (session.user as any).isSuperAdmin === true;
    if (eventIsPast && !isSuperAdmin) {
      return NextResponse.json(
        { error: "Gli eventi passati possono essere modificati solo dal Super Admin" },
        { status: 403 }
      );
    }

    // Blocca qualsiasi modifica se una giornata dell'evento è in un mese chiuso (Super Admin può bypassare)
    const isSuperAdminForMonth = (session.user as any).isSuperAdmin === true || session.user.role === "SUPER_ADMIN";
    const workdays = await prisma.workday.findMany({
      where: { eventId: id },
      select: { date: true },
    });
    if (!isSuperAdminForMonth) {
      const isAdmin = session.user.role === "ADMIN";
      const isReopeningOnly = body.isClosed === false && Object.keys(body).every((k) => k === "isClosed" || body[k] === undefined);
      for (const wd of workdays) {
        const d = new Date(wd.date);
        const closed = await isMonthClosed(d.getFullYear(), d.getMonth() + 1);
        if (closed) {
          // ADMIN può riaprire solo eventi del mese precedente (e solo con isClosed: false, senza altre modifiche)
          const inPrevMonth = isDateInPreviousMonth(wd.date);
          if (!(isAdmin && body.isClosed === false && inPrevMonth)) {
            return NextResponse.json(
              { error: "Impossibile modificare: una giornata dell'evento è in un mese chiuso. L'Admin può riaprire solo eventi del mese precedente." },
              { status: 403 }
            );
          }
        }
      }
      // Se ADMIN riapre, non permettere altre modifiche oltre a isClosed
      if (isAdmin && body.isClosed === false) {
        const hasOtherChanges = ["title", "clientName", "clientIds", "locationId", "startDate", "endDate", "notes"].some(
          (k) => body[k] !== undefined
        );
        if (hasOtherChanges) {
          return NextResponse.json(
            { error: "L'Admin può solo riaprire l'evento, senza modificare altri campi" },
            { status: 403 }
          );
        }
      }
    }

    const { title, clientName, clientIds, locationId, startDate, endDate, notes, isClosed } = body;
    
    // Verifica che la location (se fornita) non sia archiviata
    if (locationId !== undefined && locationId !== null) {
      const locationArchived = await isLocationArchived(locationId);
      if (locationArchived === null) {
        return NextResponse.json(
          { error: "Location non trovata" },
          { status: 404 }
        );
      }
      if (locationArchived) {
        return NextResponse.json(
          { error: "Non è possibile utilizzare una location archiviata per modificare un evento" },
          { status: 400 }
        );
      }
    }

    const updateData: any = {};
    
    if (title !== undefined) updateData.title = title;
    if (clientName !== undefined) updateData.clientName = clientName;
    if (clientIds !== undefined) {
      // Gestisci clientIds come JSON array
      // NON permettere di impostare clientIds a null o array vuoto - almeno 1 cliente è obbligatorio
      let parsedClientIds: string[] = [];
      if (clientIds === null) {
        parsedClientIds = [];
      } else if (typeof clientIds === 'string') {
        const parsed = JSON.parse(clientIds);
        parsedClientIds = Array.isArray(parsed) ? parsed : [];
      } else if (Array.isArray(clientIds)) {
        parsedClientIds = clientIds;
      }
      
      // Solo aggiorna se ci sono clienti validi
      if (parsedClientIds.length > 0) {
        updateData.clientIds = JSON.stringify(parsedClientIds);
      } else {
        console.log('[PATCH /api/events] Ignoring empty clientIds - at least 1 client is required');
      }
    }
    if (locationId !== undefined) {
      updateData.locationId = locationId || null;
    }
    if (isClosed !== undefined) updateData.isClosed = isClosed;

    // Blocca apertura evento (isClosed: false) se una giornata è in un mese chiuso (Super Admin può bypassare)
    if (isClosed === false && !isSuperAdminForMonth) {
      const isAdmin = session.user.role === "ADMIN";
      for (const wd of workdays) {
        const d = new Date(wd.date);
        const closed = await isMonthClosed(d.getFullYear(), d.getMonth() + 1);
        if (closed) {
          // ADMIN può riaprire solo eventi le cui giornate in mesi chiusi sono tutte nel mese precedente
          const inPrevMonth = isDateInPreviousMonth(wd.date);
          if (!(isAdmin && inPrevMonth)) {
            return NextResponse.json(
              { error: "Impossibile riaprire: una giornata dell'evento è in un mese chiuso. L'Admin può riaprire solo eventi del mese precedente." },
              { status: 403 }
            );
          }
        }
      }
    }
    
    // Converti le date usando UTC esplicito per evitare problemi di timezone
    if (startDate !== undefined) {
      if (typeof startDate === 'string' && startDate.length === 10 && !startDate.includes('T')) {
        const [year, month, day] = startDate.split('-').map(Number);
        updateData.startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
      } else {
        updateData.startDate = new Date(startDate);
      }
    }
    
    if (endDate !== undefined) {
      if (typeof endDate === 'string' && endDate.length === 10 && !endDate.includes('T')) {
        const [year, month, day] = endDate.split('-').map(Number);
        // Crea la data di fine a mezzanotte del giorno indicato
        updateData.endDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
      } else {
        updateData.endDate = new Date(endDate);
      }
    }
    
    if (notes !== undefined) updateData.notes = notes;

    // Gestione cambiamenti clienti: reset selettivo solo per i clienti rimossi
    let removedClientIds: string[] = [];
    let newClientIds: string[] = [];
    
    if (clientIds !== undefined) {
      try {
        // Parse oldClientIds in modo sicuro
        let oldClientIds: string[] = [];
        if (existingEvent.clientIds && existingEvent.clientIds !== 'null') {
          try {
            const parsed = JSON.parse(existingEvent.clientIds);
            oldClientIds = Array.isArray(parsed) ? parsed : [];
          } catch {
            oldClientIds = [];
          }
        }
        
        // Gestisci null, stringa JSON, o array
        if (clientIds === null) {
          newClientIds = [];
        } else if (typeof clientIds === 'string') {
          const parsed = JSON.parse(clientIds);
          newClientIds = Array.isArray(parsed) ? parsed : [];
        } else if (Array.isArray(clientIds)) {
          newClientIds = clientIds;
        } else {
          newClientIds = [];
        }
        
        // Trova i clienti che sono stati rimossi
        removedClientIds = oldClientIds.filter(id => !newClientIds.includes(id));
        
        console.log('[PATCH /api/events] oldClientIds:', oldClientIds);
        console.log('[PATCH /api/events] newClientIds:', newClientIds);
        console.log('[PATCH /api/events] removedClientIds:', removedClientIds);
      } catch (parseError) {
        console.error('[PATCH /api/events] Error parsing clientIds:', parseError);
        throw parseError;
      }
    }

    const event = await prisma.event.update({
      where: { id },
      data: updateData,
      include: {
        location: true,
        workdays: {
          select: { id: true }
        }
      },
    });

    // Se stiamo chiudendo l'evento, chiudi automaticamente tutte le giornate associate
    if (isClosed === true) {
      await prisma.workday.updateMany({
        where: { eventId: id },
        data: { isOpen: false },
      });
    }

    const workdayIds = event.workdays.map(w => w.id);

    // Reset selettivo: resetta solo i turni con clienti rimossi
    if (removedClientIds.length > 0 && workdayIds.length > 0) {
      try {
        console.log('[PATCH /api/events] Resetting shifts with removed clients:', removedClientIds);
        
        const shiftsToReset = await prisma.assignment.findMany({
          where: {
            workdayId: { in: workdayIds },
            clientId: { in: removedClientIds }
          },
          select: { id: true }
        });
        
        if (shiftsToReset.length > 0) {
          await prisma.assignment.updateMany({
            where: { id: { in: shiftsToReset.map(s => s.id) } },
            data: { clientId: null }
          });
        }
      } catch (shiftUpdateError) {
        console.error('[PATCH /api/events] Error resetting shift clients:', shiftUpdateError);
      }
    }

    // Associa il primo cliente ai turni senza cliente (es. da conversione ore libere)
    if (newClientIds.length > 0 && workdayIds.length > 0) {
      try {
        const firstClientId = newClientIds[0];
        if (firstClientId) {
          await prisma.assignment.updateMany({
            where: {
              workdayId: { in: workdayIds },
              clientId: null
            },
            data: { clientId: firstClientId }
          });
        }
      } catch (e) {
        console.error('[PATCH /api/events] Error associating client to shifts:', e);
      }
    }

    // Aggiorna location delle giornate quando si imposta la location dell'evento (es. da conversione ore libere)
    if (locationId !== undefined && workdayIds.length > 0) {
      try {
        await prisma.workday.updateMany({
          where: { eventId: id },
          data: { locationId: locationId || null }
        });
      } catch (e) {
        console.error('[PATCH /api/events] Error updating workday locations:', e);
      }
    }

    return NextResponse.json(event);
  } catch (error) {
    console.error("Error updating event:", error);
    console.error("Error details:", {
      message: (error as any)?.message,
      code: (error as any)?.code,
      meta: (error as any)?.meta,
      stack: (error as any)?.stack,
    });
    return NextResponse.json(
      { 
        error: "Failed to update event",
        details: (error as any)?.message || String(error)
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Solo ADMIN e SUPERADMIN possono eliminare eventi
    const isAdmin = ["SUPER_ADMIN", "ADMIN"].includes(session.user.role || "") || (session.user as any).isAdmin === true;
    const isSuperAdmin = (session.user as any).isSuperAdmin === true;
    if (!isAdmin && !isSuperAdmin) {
      return NextResponse.json({ error: "Solo Admin e Super Admin possono eliminare eventi" }, { status: 403 });
    }
    const isNonStandardWorkerDel = (session.user as any).isWorker === true;
    if (isNonStandardWorkerDel && getWorkModeFromRequest(request) === "worker") {
      return NextResponse.json({ error: "Forbidden - Passa in modalità amministratore per eliminare eventi" }, { status: 403 });
    }

    const { id } = await params;
    
    // Verifica se l'evento esiste e ottieni i dati attuali
    const existingEvent = await prisma.event.findUnique({
      where: { id },
      select: { endDate: true, clientIds: true },
    });
    
    if (!existingEvent) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    
    // Verifica se l'evento è passato
    const eventIsPast = isEventPast(existingEvent.endDate);
    
    // Solo il SUPER_ADMIN può eliminare eventi passati
    if (eventIsPast && !isSuperAdmin) {
      return NextResponse.json(
        { error: "Gli eventi passati possono essere eliminati solo dal Super Admin" },
        { status: 403 }
      );
    }

    // Blocca eliminazione se una giornata dell'evento è in un mese chiuso (Super Admin può bypassare)
    const isSuperAdminForDelete = (session.user as any).isSuperAdmin === true || session.user.role === "SUPER_ADMIN";
    if (!isSuperAdminForDelete) {
      const workdaysForDelete = await prisma.workday.findMany({
        where: { eventId: id },
        select: { date: true },
      });
      for (const wd of workdaysForDelete) {
        const d = new Date(wd.date);
        const closed = await isMonthClosed(d.getFullYear(), d.getMonth() + 1);
        if (closed) {
          return NextResponse.json(
            { error: "Impossibile eliminare: una giornata dell'evento è in un mese chiuso" },
            { status: 403 }
          );
        }
      }
    }
    
    await prisma.event.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting event:", error);
    return NextResponse.json(
      { error: "Failed to delete event" },
      { status: 500 }
    );
  }
}

