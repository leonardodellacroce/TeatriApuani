import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isLocationArchived, checkEventStatus } from "@/lib/validation";
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
    const workday = await prisma.workday.findUnique({
      where: { id },
      include: {
        location: true,
        event: true,
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
    });
    
    // Aggiungi user solo se esiste e risolvi utenti assegnati ai turni
    // e prepara raccolta dutyIds per costruire mappa id->nome
    if (workday) {
      const dutyKeys = new Set<string>();
      for (const assignment of workday.assignments) {
        if (assignment.userId) {
          const user = await prisma.user.findUnique({
            where: { id: assignment.userId },
            select: {
              id: true,
              name: true,
              cognome: true,
              code: true,
            },
          });
          (assignment as any).user = user;
        } else {
          (assignment as any).user = null;
        }

        // Risolvi assignedUsers -> array di utenti
        const assignedUsersRaw = (assignment as any).assignedUsers as string | null | undefined;
        (assignment as any).assignedUsersResolved = [];
        (assignment as any).assignedUsersByDuty = {};
        if (assignedUsersRaw) {
          try {
            const parsed = JSON.parse(assignedUsersRaw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              // Support both [userId] and [{userId,dutyId}]
              const userIds: string[] = [];
              const dutyByUser: Record<string, string | null> = {};
              for (const item of parsed) {
                if (typeof item === 'string') {
                  userIds.push(item);
                  dutyByUser[item] = null;
                } else if (item && typeof item === 'object' && item.userId) {
                  userIds.push(item.userId);
                  dutyByUser[item.userId] = item.dutyId || null;
                }
              }
              const users = await prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, name: true, cognome: true, code: true },
              });
              (assignment as any).assignedUsersResolved = users;
              const byDuty: Record<string, any[]> = {};
              for (const u of users) {
                const d = dutyByUser[u.id];
                if (!d) continue;
                byDuty[d] = byDuty[d] || [];
                byDuty[d].push(u);
              }
              (assignment as any).assignedUsersByDuty = byDuty;
              Object.keys(byDuty).forEach((k) => dutyKeys.add(k));
            }
          } catch {
            // ignore
          }
        }

        // Raccogli dutyId anche da personnelRequests
        try {
          const prRaw = (assignment as any).personnelRequests as string | null | undefined;
          if (prRaw) {
            const arr = JSON.parse(prRaw);
            if (Array.isArray(arr)) {
              for (const it of arr) {
                const key = it?.dutyId || it?.code || it?.name || it?.duty;
                if (key && typeof key === 'string') dutyKeys.add(key);
              }
            }
          }
        } catch {}
      }

      // Costruisci mappa dutyId->name interrogando il DB
      try {
        const keys = Array.from(dutyKeys);
        if (keys.length > 0) {
          const duties = await prisma.duty.findMany({
            where: {
              OR: [
                { id: { in: keys } },
                { code: { in: keys } },
                { name: { in: keys } },
              ],
            },
            select: { id: true, code: true, name: true },
          });
          const map: Record<string, string> = {};
          duties.forEach((d) => {
            if (d.id) map[d.id] = d.name;
            if (d.code) map[d.code] = d.name;
            if (d.name) map[d.name] = d.name;
            if (d.name) map[d.name.toLowerCase?.()] = d.name;
          });
          (workday as any).dutyIdToName = map;

          // Enrich personnelRequests with dutyName for every assignment (server-side resolution)
          for (const assignment of workday.assignments) {
            try {
              const prRaw = (assignment as any).personnelRequests as string | null | undefined;
              if (!prRaw) continue;
              const arr = JSON.parse(prRaw);
              if (!Array.isArray(arr)) continue;
              const enriched = arr.map((it: any) => {
                const k = it?.dutyId || it?.code || it?.name || it?.duty;
                const dutyName = (k && (map[k] || (typeof k === 'string' ? map[k.toLowerCase?.()] : undefined))) || it?.dutyName || it?.name || it?.duty;
                return { ...it, dutyName };
              });
              (assignment as any).personnelRequests = JSON.stringify(enriched);
            } catch {}
          }
        }
      } catch {}
    }

    if (!workday) {
      return NextResponse.json({ error: "Workday not found" }, { status: 404 });
    }

    return NextResponse.json(workday);
  } catch (error) {
    console.error("Error fetching workday:", error);
    return NextResponse.json(
      { error: "Failed to fetch workday" },
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
    const isNonStandardWorker = (session.user as any).isWorker === true;
    if (isNonStandardWorker && getWorkModeFromRequest(request) === "worker") {
      return NextResponse.json({ error: "Forbidden - Passa in modalità amministratore per gestire le giornate" }, { status: 403 });
    }

    const { id } = await params;
    
    // Recupera il workday esistente per ottenere l'eventId
    const existingWorkday = await prisma.workday.findUnique({
      where: { id },
      select: { eventId: true },
    });
    
    if (!existingWorkday) {
      return NextResponse.json({ error: "Workday not found" }, { status: 404 });
    }
    
    // Verifica che l'evento associato esista e non sia passato
    const eventStatus = await checkEventStatus(existingWorkday.eventId);
    if (!eventStatus.exists) {
      return NextResponse.json(
        { error: "Evento associato non trovato" },
        { status: 404 }
      );
    }
    
    // Solo il SUPER_ADMIN può modificare workdays per eventi passati
    const isSuperAdmin = (session.user as any).isSuperAdmin === true;
    if (eventStatus.isPast && !isSuperAdmin) {
      return NextResponse.json(
        { error: "Non è possibile modificare giornate per eventi passati (solo Super Admin)" },
        { status: 403 }
      );
    }
    
    const body = await request.json();
    const { date, locationId, startTime, endTime, timeSpans, areaEnabledStates, areaShiftPreferences, notes } = body;
    
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
          { error: "Non è possibile utilizzare una location archiviata per modificare una giornata" },
          { status: 400 }
        );
      }
    }

    // Verifica quali campi stanno cercando di aggiornare (escludendo preferenze area)
    const fieldsToUpdate = Object.keys(body).filter(key => 
      body[key] !== undefined && 
      key !== 'areaEnabledStates' && 
      key !== 'areaShiftPreferences'
    );
    const isOnlyAreaPreferences = fieldsToUpdate.length === 0 && 
      (areaEnabledStates !== undefined || areaShiftPreferences !== undefined);
    
    console.log("PATCH workday:", {
      id,
      fieldsToUpdate,
      isOnlyAreaPreferences,
      userRole: session.user.role,
      areaEnabledStates: areaEnabledStates ? Object.keys(areaEnabledStates).length + " areas" : "none",
      areaShiftPreferences: areaShiftPreferences ? Object.keys(areaShiftPreferences).length + " areas" : "none"
    });
    
    // Permessi:
    // - Preferenze area (areaEnabledStates / areaShiftPreferences): consentite a SUPER_ADMIN, ADMIN, RESPONSABILE
    // - Qualsiasi altro campo: solo SUPER_ADMIN, ADMIN
    if (isOnlyAreaPreferences && !["SUPER_ADMIN", "ADMIN", "RESPONSABILE"].includes(session.user.role || "")) {
      console.log("Forbidden: user tried to update area preferences");
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (fieldsToUpdate.length > 0 && !["SUPER_ADMIN", "ADMIN"].includes(session.user.role || "")) {
      console.log("Forbidden: user tried to update restricted fields");
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updateData: any = {};
    
    if (date !== undefined) updateData.date = new Date(date);
    if (locationId !== undefined) updateData.locationId = locationId || null;
    if (startTime !== undefined) updateData.startTime = startTime || null;
    if (endTime !== undefined) updateData.endTime = endTime || null;
    if (timeSpans !== undefined) updateData.timeSpans = timeSpans ? JSON.stringify(timeSpans) : null;
    if (areaEnabledStates !== undefined) {
      updateData.areaEnabledStates = areaEnabledStates ? JSON.stringify(areaEnabledStates) : null;
    }
    if (areaShiftPreferences !== undefined) {
      updateData.areaShiftPreferences = areaShiftPreferences ? JSON.stringify(areaShiftPreferences) : null;
    }
    if (notes !== undefined) updateData.notes = notes || null;

    console.log("Update data:", updateData);
    console.log("Updating workday with ID:", id);

    try {
      const workday = await prisma.workday.update({
        where: { id },
        data: updateData,
        include: {
          location: true,
          event: true,
        },
      });

      console.log("Workday updated successfully");
      return NextResponse.json(workday);
    } catch (prismaError: any) {
      console.error("Prisma error updating workday:", prismaError);
      console.error("Error code:", prismaError?.code);
      console.error("Error message:", prismaError?.message);
      console.error("Error meta:", prismaError?.meta);
      throw prismaError;
    }
  } catch (error: any) {
    console.error("Error updating workday:", error);
    console.error("Error details:", {
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
      meta: error?.meta,
    });
    return NextResponse.json(
      { 
        error: "Failed to update workday",
        details: error?.message || String(error),
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
    const isNonStandardWorkerDel = (session.user as any).isWorker === true;
    if (isNonStandardWorkerDel && getWorkModeFromRequest(request) === "worker") {
      return NextResponse.json({ error: "Forbidden - Passa in modalità amministratore per gestire le giornate" }, { status: 403 });
    }

    // Solo ADMIN e SUPER_ADMIN possono eliminare giornate
    if (!["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    
    // Verifica che la giornata esista e recupera l'eventId
    const workday = await prisma.workday.findUnique({
      where: { id },
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
    
    // Solo il SUPER_ADMIN può eliminare workdays per eventi passati
    const isSuperAdmin = (session.user as any).isSuperAdmin === true;
    if (eventStatus.isPast && !isSuperAdmin) {
      return NextResponse.json(
        { error: "Non è possibile eliminare giornate per eventi passati (solo Super Admin)" },
        { status: 403 }
      );
    }

    await prisma.workday.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting workday:", error);
    return NextResponse.json(
      { error: "Failed to delete workday" },
      { status: 500 }
    );
  }
}

