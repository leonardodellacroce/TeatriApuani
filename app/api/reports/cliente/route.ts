import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Helper per calcolare le ore da un intervallo di tempo
function calculateHoursFromTimeRange(startTime: string | null, endTime: string | null): number {
  if (!startTime || !endTime) return 0;
  
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  
  let startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;
  
  // Gestisci turni notturni
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }
  
  return (endMinutes - startMinutes) / 60;
}

// Helper per calcolare le ore di pausa
function calculateBreakHours(
  hasScheduledBreak: boolean,
  breakStartTime: string | null,
  breakEndTime: string | null
): number {
  if (!hasScheduledBreak || !breakStartTime || !breakEndTime) return 0;
  return calculateHoursFromTimeRange(breakStartTime, breakEndTime);
}

// Helper per calcolare turni e straordinari per servizi a turno
function calculateShiftAndOvertime(
  hours: number,
  shiftHours: number | null
): { shifts: number; overtimeHours: number } {
  if (!shiftHours || shiftHours <= 0) {
    // Se non c'è una durata standard, considera tutto come ore
    return { shifts: 0, overtimeHours: hours };
  }
  
  if (hours <= shiftHours) {
    // Se le ore sono <= durata standard, conta come 1 turno
    return { shifts: 1, overtimeHours: 0 };
  } else {
    // Se le ore sono > durata standard, conta 1 turno + straordinari
    return { shifts: 1, overtimeHours: hours - shiftHours };
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const allowedRoles = ["SUPER_ADMIN", "ADMIN"];
    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const hoursType = searchParams.get("hoursType") || "actual"; // "scheduled" o "actual"
    const includeBreaksHourly = searchParams.get("includeBreaksHourly") !== "false"; // default true (solo per servizi orari; servizi a turno mai)
    const showBreakTimes = searchParams.get("showBreakTimes") !== "false"; // default true

    if (!clientId || !startDate || !endDate) {
      return NextResponse.json(
        { error: "clientId, startDate and endDate are required" },
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Recupera il nome del cliente PRIMA di tutto, così viene sempre restituito
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { 
        type: true,
        ragioneSociale: true,
        nome: true,
        cognome: true,
        code: true,
      },
    });

    // Calcola il nome da visualizzare
    let clientName: string | null = null;
    if (client) {
      if (client.type === "PRIVATO") {
        clientName = `${client.nome || ""} ${client.cognome || ""}`.trim();
      } else {
        clientName = client.ragioneSociale || null;
      }
      // Se il nome è vuoto, usa il codice come fallback
      if (!clientName || clientName === "") {
        clientName = client.code || null;
      }
    }

    // Trova gli eventi che hanno questo cliente
    const events = await prisma.event.findMany({
      where: {
        OR: [
          { clientIds: { contains: clientId } },
        ],
      },
      select: { id: true },
    });

    const eventIds = events.map(e => e.id);
    if (eventIds.length === 0) {
      return NextResponse.json({
        clientId,
        clientName: clientName,
        startDate,
        endDate,
        includeBreaksHourly,
        showBreakTimes,
        totalHours: 0,
        summaryByDuty: [],
        dailyDetails: [],
      });
    }

    // Trova i workdays in quell'intervallo per quegli eventi
    const workdays = await prisma.workday.findMany({
      where: {
        eventId: { in: eventIds },
        date: { gte: start, lte: end },
      },
      select: { 
        id: true,
        date: true,
        eventId: true,
        event: {
          select: {
            id: true,
            title: true,
          },
        },
        locationId: true,
        location: {
          select: {
            id: true,
            name: true,
            city: true,
          },
        },
      },
    });

    const workdayIds = workdays.map(w => w.id);
    if (workdayIds.length === 0) {
      return NextResponse.json({
        clientId,
        clientName: clientName,
        startDate,
        endDate,
        includeBreaksHourly,
        showBreakTimes,
        totalHours: 0,
        summaryByDuty: [],
        dailyDetails: [],
      });
    }

    // Recupera gli Assignment per questi workdays che hanno questo cliente
    const assignments = await prisma.assignment.findMany({
      where: {
        workdayId: { in: workdayIds },
        clientId: clientId,
        taskType: { is: { type: "SHIFT" } },
      },
      select: {
        id: true,
        workdayId: true,
        taskTypeId: true,
        taskType: {
          select: {
            id: true,
            name: true,
            isHourlyService: true,
            shiftHours: true,
          } as any,
        },
        startTime: true,
        endTime: true,
        hasScheduledBreak: true,
        scheduledBreakStartTime: true,
        scheduledBreakEndTime: true,
        assignedUsers: true,
        personnelRequests: true,
        timeEntries: {
          select: {
            userId: true,
            hoursWorked: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    // Mappa workdayId -> workday info
    const workdayInfoMap = new Map<string, {
      date: Date;
      eventId: string;
      eventTitle: string;
      locationId: string | null;
      locationName: string | null;
    }>();
    workdays.forEach(w => {
      const locationName = w.location 
        ? `${w.location.name}${w.location.city ? ` (${w.location.city})` : ''}`
        : null;
      workdayInfoMap.set(w.id, {
        date: w.date,
        eventId: w.eventId,
        eventTitle: w.event?.title || "Non specificato",
        locationId: w.locationId,
        locationName: locationName,
      });
    });

    // Raggruppa per mansione (duty) per il riepilogo
    const dutyHoursMap = new Map<string, { 
      dutyName: string; 
      dutyCode: string; 
      hours: number;
      shifts: number;
      overtimeHours: number;
    }>();
    let totalHours = 0;
    let totalShifts = 0;
    let totalOvertimeHours = 0;

    // Dettagli giornalieri: dateLocationEventKey -> taskTypeId -> Map<shiftKey, shiftData>
    // dateLocationEventKey = date_locationId_eventId per raggruppare per data + location + evento
    // shiftKey = startTime-endTime per raggruppare turni con stesso orario
    const dailyDetailsMap = new Map<string, {
      date: string;
      locationId: string | null;
      locationName: string | null;
      eventId: string;
      eventTitle: string;
      taskTypes: Map<string, Map<string, {
        startTime: string | null;
        endTime: string | null;
        hasScheduledBreak?: boolean;
        scheduledBreakStartTime?: string | null;
        scheduledBreakEndTime?: string | null;
        duties: Map<string, {
          dutyId: string;
          dutyName: string;
          dutyCode: string;
          numberOfPeople: number;
          totalHours: number;
        }>;
        totalHours: number;
        numberOfPeople: number;
        shifts?: number;
        overtimeHours?: number;
      }>>;
    }>();

    // Mappa per recuperare i nomi delle duty e taskType
    const dutyCache = new Map<string, { name: string; code: string }>();
    const taskTypeCache = new Map<string, { name: string; isHourlyService: boolean | null; shiftHours: number | null }>();

    for (const assignment of assignments) {
      const workdayInfo = workdayInfoMap.get(assignment.workdayId);
      if (!workdayInfo) continue;

      const dateKey = workdayInfo.date.toISOString().split('T')[0]; // YYYY-MM-DD
      // Crea una chiave univoca per data + location + evento
      const dateLocationEventKey = `${dateKey}_${workdayInfo.locationId || 'no-location'}_${workdayInfo.eventId}`;
      const taskTypeId = assignment.taskTypeId;
      const taskTypeName = (assignment as any).taskType?.name || "Non specificato";
      const taskTypeIsHourlyService = (assignment as any).taskType?.isHourlyService ?? true;
      const taskTypeShiftHours = (assignment as any).taskType?.shiftHours ?? null;
      const includeBreaksForAssignment = taskTypeIsHourlyService ? includeBreaksHourly : false; // servizi a turno: pause mai incluse
      
      // Salva il taskType nella cache
      if (!taskTypeCache.has(taskTypeId)) {
        taskTypeCache.set(taskTypeId, { 
          name: taskTypeName,
          isHourlyService: taskTypeIsHourlyService,
          shiftHours: taskTypeShiftHours,
        });
      }

      // Estrai dutyId da assignedUsers
      const assignmentUserDutyMap = new Map<string, string>();
      if (assignment.assignedUsers) {
        try {
          const parsed = JSON.parse(assignment.assignedUsers);
          if (Array.isArray(parsed)) {
            parsed.forEach((item: any) => {
              if (item?.userId && item?.dutyId) {
                assignmentUserDutyMap.set(item.userId, item.dutyId);
              }
            });
          }
        } catch {}
      }

      // Se non ci sono assignedUsers, prova a prendere da personnelRequests
      if (assignmentUserDutyMap.size === 0 && assignment.personnelRequests) {
        try {
          const parsed = JSON.parse(assignment.personnelRequests);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const firstDutyId = parsed[0]?.dutyId;
          if (firstDutyId) {
            ((assignment as any).timeEntries || []).forEach((te: any) => {
              assignmentUserDutyMap.set(te.userId, firstDutyId);
            });
          }
          }
        } catch {}
      }

      // Calcola le ore per questo assignment
      let assignmentHours = 0;
      let shiftHours = 0;

      if (hoursType === "actual") {
        // Ore effettive dai timeEntries
        const userHoursMap = new Map<string, number>();
        const timeEntriesList = (assignment as any).timeEntries || [];
        let actualStartTime: string | null = null;
        let actualEndTime: string | null = null;
        
        for (const timeEntry of timeEntriesList) {
          let hours = timeEntry.hoursWorked;
          const breakHours = assignment.hasScheduledBreak
            ? calculateBreakHours(
                assignment.hasScheduledBreak,
                assignment.scheduledBreakStartTime,
                assignment.scheduledBreakEndTime
              )
            : 0;
          
          if (includeBreaksForAssignment && breakHours > 0) {
            // Includi le pause: le ore nel time entry sono al netto, aggiungi la pausa
            hours = hours + breakHours;
          }
          
          userHoursMap.set(timeEntry.userId, hours);
          assignmentHours += hours;
          
          // Estrai orario effettivo dai time entries
          const st = timeEntry.startTime ? String(timeEntry.startTime) : null;
          const et = timeEntry.endTime ? String(timeEntry.endTime) : null;
          if (st) actualStartTime = actualStartTime == null ? st : (st < (actualStartTime as string) ? st : actualStartTime);
          if (et) actualEndTime = actualEndTime == null ? et : (et > (actualEndTime as string) ? et : actualEndTime);
        }
        
        // Ore effettive: ore medie per persona (per calcolo turni/straordinari)
        const totalActualHours = Array.from(userHoursMap.values()).reduce((a, b) => a + b, 0);
        shiftHours = userHoursMap.size > 0 ? totalActualHours / userHoursMap.size : 0;

        // Raggruppa per duty
        const dutyHoursInAssignment = new Map<string, number>();
        const dutyPeopleCount = new Map<string, number>();
        
        for (const [userId, hours] of userHoursMap.entries()) {
          const dutyId = assignmentUserDutyMap.get(userId) || "";
          const current = dutyHoursInAssignment.get(dutyId) || 0;
          dutyHoursInAssignment.set(dutyId, current + hours);
          
          const currentPeople = dutyPeopleCount.get(dutyId) || 0;
          dutyPeopleCount.set(dutyId, currentPeople + 1);
        }

        // Aggiungi ai dettagli giornalieri raggruppati per taskType
        const shiftKey = `${assignment.startTime || ""}-${assignment.endTime || ""}`;
        
        if (!dailyDetailsMap.has(dateLocationEventKey)) {
          dailyDetailsMap.set(dateLocationEventKey, {
            date: dateKey,
            locationId: workdayInfo.locationId,
            locationName: workdayInfo.locationName,
            eventId: workdayInfo.eventId,
            eventTitle: workdayInfo.eventTitle,
            taskTypes: new Map(),
          });
        }
        const dayData = dailyDetailsMap.get(dateLocationEventKey)!;
        
        if (!dayData.taskTypes.has(taskTypeId)) {
          dayData.taskTypes.set(taskTypeId, new Map());
        }
        const taskTypeMap = dayData.taskTypes.get(taskTypeId)!;
        
        if (!taskTypeMap.has(shiftKey)) {
          // Calcola turni e straordinari se è servizio a turno
          let shifts = 0;
          let overtimeHours = 0;
          const numberOfPeople = userHoursMap.size;
          const displayStartTime = (hoursType === "actual" && actualStartTime) ? actualStartTime : assignment.startTime;
          const displayEndTime = (hoursType === "actual" && actualEndTime) ? actualEndTime : assignment.endTime;
          // Ore totali nel dettaglio turno: ore × persone
          const shiftTotalHours = hoursType === "actual" ? totalActualHours : shiftHours * numberOfPeople;
          if (!taskTypeIsHourlyService) {
            // Calcola turni e straordinari per persona (usa ore effettive quando actual)
            const calc = calculateShiftAndOvertime(shiftHours, taskTypeShiftHours);
            shifts = calc.shifts * numberOfPeople;
            overtimeHours = calc.overtimeHours * numberOfPeople;
          }
          
          taskTypeMap.set(shiftKey, {
            startTime: displayStartTime,
            endTime: displayEndTime,
            hasScheduledBreak: assignment.hasScheduledBreak || false,
            scheduledBreakStartTime: assignment.scheduledBreakStartTime || null,
            scheduledBreakEndTime: assignment.scheduledBreakEndTime || null,
            duties: new Map(),
            totalHours: shiftTotalHours,
            numberOfPeople: numberOfPeople,
            shifts: shifts,
            overtimeHours: overtimeHours,
          });
        }
        const shift = taskTypeMap.get(shiftKey)!;
        
        // Aggiungi le mansioni a questo turno (ore per singola persona)
        for (const [dutyId, hours] of dutyHoursInAssignment.entries()) {
          if (!dutyCache.has(dutyId) && dutyId) {
            const duty = await prisma.duty.findUnique({
              where: { id: dutyId },
              select: { name: true, code: true },
            });
            if (duty) {
              dutyCache.set(dutyId, { name: duty.name, code: duty.code });
            }
          }

          const dutyInfo = dutyCache.get(dutyId) || { name: "Non specificato", code: "" };
          const peopleCount = dutyPeopleCount.get(dutyId) || 0;
          const hoursPerPerson = peopleCount > 0 ? hours / peopleCount : hours;
          
          shift.duties.set(dutyId, {
            dutyId,
            dutyName: dutyInfo.name,
            dutyCode: dutyInfo.code,
            numberOfPeople: peopleCount,
            totalHours: hoursPerPerson,
          });
        }

        // Aggiorna il riepilogo per duty
        for (const [dutyId, hours] of dutyHoursInAssignment.entries()) {
          const dutyInfo = dutyCache.get(dutyId) || { name: "Non specificato", code: "" };
          const peopleCount = dutyPeopleCount.get(dutyId) || 1;
          
          if (!dutyHoursMap.has(dutyId)) {
            dutyHoursMap.set(dutyId, {
              dutyName: dutyInfo.name,
              dutyCode: dutyInfo.code,
              hours: 0,
              shifts: 0,
              overtimeHours: 0,
            });
          }
          const dutyData = dutyHoursMap.get(dutyId)!;
          
          // Se è servizio a turno, calcola turni e straordinari
          if (!taskTypeIsHourlyService) {
            // hours è la somma totale delle ore per questa duty (già moltiplicata per persone)
            // Calcoliamo turni e straordinari per persona, poi moltiplichiamo per il numero di persone
            const hoursPerPerson = hours / peopleCount; // Ore per singola persona
            const { shifts: shiftsPerPerson, overtimeHours: overtimePerPerson } = calculateShiftAndOvertime(hoursPerPerson, taskTypeShiftHours);
            // Moltiplica per il numero di persone per questa duty
            const totalShiftsForDuty = shiftsPerPerson * peopleCount;
            const totalOvertimeForDuty = overtimePerPerson * peopleCount;
            dutyData.shifts += totalShiftsForDuty;
            dutyData.overtimeHours += totalOvertimeForDuty;
            totalShifts += totalShiftsForDuty;
            totalOvertimeHours += totalOvertimeForDuty;
          } else {
            // Se è servizio orario, conta solo le ore
            dutyData.hours += hours;
            totalHours += hours;
          }
        }
      } else {
        // Ore previste da startTime/endTime
        let hours = calculateHoursFromTimeRange(
          assignment.startTime,
          assignment.endTime
        );
        
        // Sottrai le pause se non incluse
        if (!includeBreaksForAssignment && assignment.hasScheduledBreak) {
          const breakHours = calculateBreakHours(
            assignment.hasScheduledBreak,
            assignment.scheduledBreakStartTime,
            assignment.scheduledBreakEndTime
          );
          hours = Math.max(0, hours - breakHours);
        }
        
        shiftHours = hours;
        assignmentHours = hours;
        
        // Distribuisci le ore tra gli utenti assegnati
        const assignedUserIds = new Set<string>();
        if (assignment.assignedUsers) {
          try {
            const parsed = JSON.parse(assignment.assignedUsers);
            if (Array.isArray(parsed)) {
              parsed.forEach((item: any) => {
                if (item?.userId) assignedUserIds.add(item.userId);
              });
            }
          } catch {}
        }
        
        const userCount = assignedUserIds.size > 0 ? assignedUserIds.size : Math.max(1, ((assignment as any).timeEntries || []).length);
        const hoursPerUser = hours / userCount;

        // Raggruppa per duty - conta le persone per ogni duty
        const dutyPeopleCount = new Map<string, number>();
        
        for (const userId of assignedUserIds.size > 0 ? assignedUserIds : ((assignment as any).timeEntries || []).map((te: any) => te.userId)) {
          const dutyId = assignmentUserDutyMap.get(userId) || "";
          const currentPeople = dutyPeopleCount.get(dutyId) || 0;
          dutyPeopleCount.set(dutyId, currentPeople + 1);
        }

        // Aggiungi ai dettagli giornalieri raggruppati per taskType
        const shiftKey = `${assignment.startTime || ""}-${assignment.endTime || ""}`;
        
        if (!dailyDetailsMap.has(dateLocationEventKey)) {
          dailyDetailsMap.set(dateLocationEventKey, {
            date: dateKey,
            locationId: workdayInfo.locationId,
            locationName: workdayInfo.locationName,
            eventId: workdayInfo.eventId,
            eventTitle: workdayInfo.eventTitle,
            taskTypes: new Map(),
          });
        }
        const dayData = dailyDetailsMap.get(dateLocationEventKey)!;
        
        if (!dayData.taskTypes.has(taskTypeId)) {
          dayData.taskTypes.set(taskTypeId, new Map());
        }
        const taskTypeMap = dayData.taskTypes.get(taskTypeId)!;
        
        if (!taskTypeMap.has(shiftKey)) {
          // Calcola turni e straordinari se è servizio a turno
          let shifts = 0;
          let overtimeHours = 0;
          if (!taskTypeIsHourlyService) {
            // Calcola turni e straordinari per persona, poi moltiplica per il numero di persone
            const calc = calculateShiftAndOvertime(shiftHours, taskTypeShiftHours);
            shifts = calc.shifts * userCount; // Moltiplica per il numero di persone
            overtimeHours = calc.overtimeHours * userCount; // Moltiplica anche gli straordinari
          }
          
          taskTypeMap.set(shiftKey, {
            startTime: assignment.startTime,
            endTime: assignment.endTime,
            hasScheduledBreak: assignment.hasScheduledBreak || false,
            scheduledBreakStartTime: assignment.scheduledBreakStartTime || null,
            scheduledBreakEndTime: assignment.scheduledBreakEndTime || null,
            duties: new Map(),
            totalHours: shiftHours * userCount,
            numberOfPeople: userCount,
            shifts: shifts,
            overtimeHours: overtimeHours,
          });
        }
        const shift = taskTypeMap.get(shiftKey)!;
        
        // Aggiungi le mansioni a questo turno (ore per singola persona)
        for (const [dutyId, peopleCount] of dutyPeopleCount.entries()) {
          if (!dutyCache.has(dutyId) && dutyId) {
            const duty = await prisma.duty.findUnique({
              where: { id: dutyId },
              select: { name: true, code: true },
            });
            if (duty) {
              dutyCache.set(dutyId, { name: duty.name, code: duty.code });
            }
          }

          const dutyInfo = dutyCache.get(dutyId) || { name: "Non specificato", code: "" };
          
          shift.duties.set(dutyId, {
            dutyId,
            dutyName: dutyInfo.name,
            dutyCode: dutyInfo.code,
            numberOfPeople: peopleCount,
            totalHours: hours,
          });
        }

        // Aggiorna il riepilogo per duty (somma le ore per persona)
        for (const [dutyId, peopleCount] of dutyPeopleCount.entries()) {
          const dutyInfo = dutyCache.get(dutyId) || { name: "Non specificato", code: "" };
          const totalHoursForDuty = hours * peopleCount;
          
          if (!dutyHoursMap.has(dutyId)) {
            dutyHoursMap.set(dutyId, {
              dutyName: dutyInfo.name,
              dutyCode: dutyInfo.code,
              hours: 0,
              shifts: 0,
              overtimeHours: 0,
            });
          }
          const dutyData = dutyHoursMap.get(dutyId)!;
          
          // Se è servizio a turno, calcola turni e straordinari
          if (!taskTypeIsHourlyService) {
            // totalHoursForDuty è già ore * persone, quindi calcoliamo turni per persona e moltiplichiamo
            const hoursPerPerson = hours; // Ore per singola persona (non moltiplicate)
            const { shifts: shiftsPerPerson, overtimeHours: overtimePerPerson } = calculateShiftAndOvertime(hoursPerPerson, taskTypeShiftHours);
            // Moltiplica per il numero di persone per questa duty
            const totalShiftsForDuty = shiftsPerPerson * peopleCount;
            const totalOvertimeForDuty = overtimePerPerson * peopleCount;
            dutyData.shifts += totalShiftsForDuty;
            dutyData.overtimeHours += totalOvertimeForDuty;
            totalShifts += totalShiftsForDuty;
            totalOvertimeHours += totalOvertimeForDuty;
          } else {
            // Se è servizio orario, conta solo le ore
            dutyData.hours += totalHoursForDuty;
            totalHours += totalHoursForDuty;
          }
        }
      }
    }

    // Converti il riepilogo per duty in array
    const summaryByDuty = Array.from(dutyHoursMap.values()).map(d => ({
      dutyCode: d.dutyCode,
      dutyName: d.dutyName,
      hours: d.hours,
      shifts: d.shifts,
      overtimeHours: d.overtimeHours,
    }));

    // Converti i dettagli giornalieri in array ordinato per data
    const dailyDetails: Array<{
      date: string;
      locationId: string | null;
      locationName: string | null;
      eventId: string;
      eventTitle: string;
      taskTypes: Array<{
        taskTypeId: string;
        taskTypeName: string;
        shifts: Array<{
          startTime: string | null;
          endTime: string | null;
          duties: Array<{
            dutyId: string;
            dutyName: string;
            dutyCode: string;
            numberOfPeople: number;
            totalHours: number;
          }>;
          totalHours: number;
          numberOfPeople: number;
        }>;
        totalHours: number;
      }>;
    }> = [];

    // Ordina per data, poi per location, poi per evento
    const sortedKeys = Array.from(dailyDetailsMap.keys()).sort((a, b) => {
      const [dateA, locA, evtA] = a.split('_');
      const [dateB, locB, evtB] = b.split('_');
      
      // Prima per data
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      // Poi per location
      if (locA !== locB) return (locA || '').localeCompare(locB || '');
      // Poi per evento
      return evtA.localeCompare(evtB);
    });
    
    for (const dateLocationEventKey of sortedKeys) {
      const dayData = dailyDetailsMap.get(dateLocationEventKey)!;
      const taskTypes: Array<{
        taskTypeId: string;
        taskTypeName: string;
        isHourlyService: boolean;
        shifts: Array<{
          startTime: string | null;
          endTime: string | null;
          duties: Array<{
            dutyId: string;
            dutyName: string;
            dutyCode: string;
            numberOfPeople: number;
            totalHours: number;
          }>;
          totalHours: number;
          numberOfPeople: number;
        }>;
        totalHours: number;
      }> = [];

      for (const [taskTypeId, taskTypeMap] of dayData.taskTypes.entries()) {
        const taskTypeInfo = taskTypeCache.get(taskTypeId) || { name: "Non specificato", isHourlyService: true };
        const         shifts: Array<{
          startTime: string | null;
          endTime: string | null;
          hasScheduledBreak?: boolean;
          scheduledBreakStartTime?: string | null;
          scheduledBreakEndTime?: string | null;
          duties: Array<{
            dutyId: string;
            dutyName: string;
            dutyCode: string;
            numberOfPeople: number;
            totalHours: number;
          }>;
          totalHours: number;
          numberOfPeople: number;
          shifts?: number;
          overtimeHours?: number;
        }> = [];

        for (const shift of taskTypeMap.values()) {
          const shiftData = shift as any;
          shifts.push({
            startTime: shift.startTime,
            endTime: shift.endTime,
            hasScheduledBreak: shiftData.hasScheduledBreak || false,
            scheduledBreakStartTime: shiftData.scheduledBreakStartTime || null,
            scheduledBreakEndTime: shiftData.scheduledBreakEndTime || null,
            duties: Array.from(shift.duties.values()),
            totalHours: shift.totalHours,
            numberOfPeople: shift.numberOfPeople,
            shifts: shiftData.shifts !== undefined ? shiftData.shifts : undefined,
            overtimeHours: shiftData.overtimeHours !== undefined ? shiftData.overtimeHours : undefined,
          });
        }

        // Ordina i turni per orario
        shifts.sort((a, b) => {
          const aStart = a.startTime || "";
          const bStart = b.startTime || "";
          return aStart.localeCompare(bStart);
        });

        const totalTaskTypeHours = shifts.reduce((sum, shift) => sum + shift.totalHours, 0);
        
        taskTypes.push({
          taskTypeId,
          taskTypeName: taskTypeInfo.name,
          isHourlyService: taskTypeInfo.isHourlyService ?? true,
          shifts,
          totalHours: totalTaskTypeHours,
        });
      }

      // Ordina per nome taskType
      taskTypes.sort((a, b) => a.taskTypeName.localeCompare(b.taskTypeName));

      dailyDetails.push({
        date: dayData.date,
        locationId: dayData.locationId,
        locationName: dayData.locationName,
        eventId: dayData.eventId,
        eventTitle: dayData.eventTitle,
        taskTypes,
      });
    }

    return NextResponse.json({
      clientId,
      clientName: clientName,
      startDate,
      endDate,
      includeBreaksHourly,
      showBreakTimes,
      totals: {
        hours: totalHours,
        shifts: totalShifts,
        overtimeHours: totalOvertimeHours,
      },
      summaryByDuty,
      dailyDetails,
    });
  } catch (error) {
    console.error("Error generating client report:", error);
    return NextResponse.json(
      { error: "Error generating report", details: String(error) },
      { status: 500 }
    );
  }
}
