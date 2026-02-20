import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isLocationArchived, checkEventStatus } from "@/lib/validation";
import { getWorkModeFromRequest } from "@/lib/workMode";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId");

    if (!eventId) {
      return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    }

    const workdays = await prisma.workday.findMany({
      where: { eventId },
      include: {
        location: true,
      },
      orderBy: {
        date: 'asc',
      },
    });

    return NextResponse.json(workdays);
  } catch (error) {
    console.error("Error fetching workdays:", error);
    return NextResponse.json(
      { error: "Failed to fetch workdays" },
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

    // Solo ADMIN e SUPER_ADMIN possono creare giornate
    if (!["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const isNonStandardWorker = (session.user as any).isWorker === true;
    if (isNonStandardWorker && getWorkModeFromRequest(request) === "worker") {
      return NextResponse.json({ error: "Forbidden - Passa in modalità amministratore per gestire le giornate" }, { status: 403 });
    }

    const body = await request.json();
    const { eventId, locationId, date, startTime, endTime, timeSpans, notes } = body;
    console.log("[POST /api/workdays] incoming", { eventId, locationId, date, startTime, endTime, timeSpans, notes });

    if (!eventId || !date) {
      return NextResponse.json(
        { error: "eventId and date are required" },
        { status: 400 }
      );
    }
    
    // Verifica che l'evento esista e non sia passato
    const eventStatus = await checkEventStatus(eventId);
    if (!eventStatus.exists) {
      return NextResponse.json(
        { error: "Evento non trovato" },
        { status: 404 }
      );
    }
    
    // Solo il SUPER_ADMIN può creare workdays per eventi passati
    const isSuperAdmin = (session.user as any).isSuperAdmin === true;
    if (eventStatus.isPast && !isSuperAdmin) {
      return NextResponse.json(
        { error: "Non è possibile creare giornate per eventi passati (solo Super Admin)" },
        { status: 403 }
      );
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
          { error: "Non è possibile utilizzare una location archiviata per creare una giornata" },
          { status: 400 }
        );
      }
    }

    // Normalizza la data alle 00:00:00 UTC del giorno selezionato
    let workdayDate = new Date(date);
    if (typeof date === 'string' && date.length === 10 && !date.includes('T')) {
      const [y, m, d] = date.split('-').map(Number);
      workdayDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    }
    
    // Se entrambi gli orari sono presenti e endTime < startTime, 
    // significa che finisce il giorno successivo
    if (startTime && endTime) {
      const [startHour, startMinute] = startTime.split(':').map(Number);
      const [endHour, endMinute] = endTime.split(':').map(Number);
      
      const startTotalMinutes = startHour * 60 + startMinute;
      const endTotalMinutes = endHour * 60 + endMinute;
      
      // Se l'orario di fine è precedente all'orario di inizio, significa che finisce il giorno dopo
      // In questo caso, la giornata è memorizzata con la data di inizio
      // Per calcolare la durata totale, bisogna aggiungere 24 ore all'orario di fine
    }

    const workday = await prisma.workday.create({
      data: {
        eventId,
        locationId: locationId || null,
        date: workdayDate,
        isOpen: true,
        startTime: startTime || null,
        endTime: endTime || null,
        timeSpans: timeSpans ? JSON.stringify(timeSpans) : null,
        notes: notes || null,
      },
    });

    return NextResponse.json(workday, { status: 201 });
  } catch (error: any) {
    console.error("Error creating workday:", error);
    return NextResponse.json(
      { error: "Failed to create workday", details: String(error?.message || error) },
      { status: 500 }
    );
  }
}

