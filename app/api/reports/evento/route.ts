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
    return { shifts: 0, overtimeHours: hours };
  }
  if (hours <= shiftHours) {
    return { shifts: 1, overtimeHours: 0 };
  } else {
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
    const eventId = searchParams.get("eventId");
    const clientId = searchParams.get("clientId"); // Opzionale: filtra per cliente
    const hoursType = searchParams.get("hoursType") || "actual";
    const includeBreaksHourly = searchParams.get("includeBreaksHourly") !== "false"; // solo per servizi orari; servizi a turno mai
    const showBreakTimes = searchParams.get("showBreakTimes") !== "false"; // default true

    if (!eventId) {
      return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    }

    // Recupera l'evento
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        startDate: true,
        endDate: true,
        clientIds: true, // JSON array di ID clienti
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

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Recupera i workdays dell'evento
    const workdays = await prisma.workday.findMany({
      where: { eventId },
      select: {
        id: true,
        date: true,
      },
      orderBy: { date: "asc" },
    });

    const workdayIds = workdays.map(w => w.id);
    
    const locationName = event.location 
      ? `${event.location.name}${event.location.city ? ` (${event.location.city})` : ''}`
      : null;
    
    // Recupera i clienti associati all'evento
    let eventClients: Array<{ id: string; name: string }> = [];
    if (event.clientIds) {
      try {
        const clientIdsArray = JSON.parse(event.clientIds);
        if (Array.isArray(clientIdsArray) && clientIdsArray.length > 0) {
          const clients = await prisma.client.findMany({
            where: { id: { in: clientIdsArray } },
            select: {
              id: true,
              type: true,
              ragioneSociale: true,
              nome: true,
              cognome: true,
            },
          });
          
          eventClients = clients.map(client => {
            const name = client.type === "PRIVATO"
              ? `${client.nome || ""} ${client.cognome || ""}`.trim()
              : client.ragioneSociale || "";
            return {
              id: client.id,
              name: name || client.id, // Fallback all'ID se il nome è vuoto
            };
          });
        }
      } catch {}
    }
    
    if (workdayIds.length === 0) {
      return NextResponse.json({
        eventId,
        eventTitle: event.title,
        locationId: event.locationId,
        locationName: locationName,
        clients: eventClients,
        includeBreaksHourly,
        showBreakTimes,
        totalHours: 0,
        summaryByDuty: [],
        dailyDetails: [],
      });
    }

    // Costruisci il filtro per gli Assignment
    const assignmentWhere: any = {
      workdayId: { in: workdayIds },
      taskType: { is: { type: "SHIFT" } },
    };
    
    // Se è specificato un clientId, filtra per quel cliente
    if (clientId) {
      assignmentWhere.clientId = clientId;
    }
    
    // Recupera gli Assignment
    const assignments = await prisma.assignment.findMany({
      where: assignmentWhere,
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
          },
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

    // Mappa workdayId -> date
    const workdayDateMap = new Map<string, Date>();
    workdays.forEach(w => {
      workdayDateMap.set(w.id, w.date);
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

    // Dettagli giornalieri: data -> taskTypeId -> Map<shiftKey, shiftData>
    const dailyDetailsMap = new Map<string, Map<string, Map<string, {
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
    }>>>();

    // Mappa per recuperare i nomi delle duty e taskType
    const dutyCache = new Map<string, { name: string; code: string }>();
    const taskTypeCache = new Map<string, { name: string; isHourlyService: boolean | null; shiftHours: number | null }>();

    for (const assignment of assignments) {
      const workdayDate = workdayDateMap.get(assignment.workdayId);
      if (!workdayDate) continue;

      const dateKey = workdayDate.toISOString().split('T')[0]; // YYYY-MM-DD
      const taskTypeId = assignment.taskTypeId;
      const taskTypeName = assignment.taskType?.name || "Non specificato";
      const taskTypeIsHourlyService = assignment.taskType?.isHourlyService ?? true;
      const taskTypeShiftHours = assignment.taskType?.shiftHours ?? null;
      const includeBreaksForAssignment = taskTypeIsHourlyService ? includeBreaksHourly : false; // servizi a turno: pause mai incluse
      
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

      if (assignmentUserDutyMap.size === 0 && assignment.personnelRequests) {
        try {
          const parsed = JSON.parse(assignment.personnelRequests);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const firstDutyId = parsed[0]?.dutyId;
            if (firstDutyId) {
              assignment.timeEntries.forEach(te => {
                assignmentUserDutyMap.set(te.userId, firstDutyId);
              });
            }
          }
        } catch {}
      }

      let assignmentHours = 0;
      let shiftHours = 0;

      if (hoursType === "actual") {
        const userHoursMap = new Map<string, number>();
        let actualStartTime: string | null = null;
        let actualEndTime: string | null = null;
        
        for (const timeEntry of assignment.timeEntries) {
          let hours = timeEntry.hoursWorked;
          const breakHours = assignment.hasScheduledBreak
            ? calculateBreakHours(
                assignment.hasScheduledBreak,
                assignment.scheduledBreakStartTime,
                assignment.scheduledBreakEndTime
              )
            : 0;
          
          if (includeBreaksForAssignment && breakHours > 0) {
            hours = hours + breakHours;
          }
          
          userHoursMap.set(timeEntry.userId, hours);
          assignmentHours += hours;
          
          const st = timeEntry.startTime ? String(timeEntry.startTime) : null;
          const et = timeEntry.endTime ? String(timeEntry.endTime) : null;
          if (st) actualStartTime = actualStartTime == null ? st : (st < (actualStartTime as string) ? st : actualStartTime);
          if (et) actualEndTime = actualEndTime == null ? et : (et > (actualEndTime as string) ? et : actualEndTime);
        }
        
        const totalActualHours = Array.from(userHoursMap.values()).reduce((a, b) => a + b, 0);
        shiftHours = userHoursMap.size > 0 ? totalActualHours / userHoursMap.size : 0;

        const dutyHoursInAssignment = new Map<string, number>();
        const dutyPeopleCount = new Map<string, number>();
        
        for (const [userId, hours] of userHoursMap.entries()) {
          const dutyId = assignmentUserDutyMap.get(userId) || "";
          const current = dutyHoursInAssignment.get(dutyId) || 0;
          dutyHoursInAssignment.set(dutyId, current + hours);
          
          const currentPeople = dutyPeopleCount.get(dutyId) || 0;
          dutyPeopleCount.set(dutyId, currentPeople + 1);
        }

        const shiftKey = `${assignment.startTime || ""}-${assignment.endTime || ""}`;
        
        if (!dailyDetailsMap.has(dateKey)) {
          dailyDetailsMap.set(dateKey, new Map());
        }
        const dateMap = dailyDetailsMap.get(dateKey)!;
        
        if (!dateMap.has(taskTypeId)) {
          dateMap.set(taskTypeId, new Map());
        }
        const taskTypeMap = dateMap.get(taskTypeId)!;
        
        if (!taskTypeMap.has(shiftKey)) {
          let shifts = 0;
          let overtimeHours = 0;
          const numberOfPeople = userHoursMap.size;
          const displayStartTime = (hoursType === "actual" && actualStartTime) ? actualStartTime : assignment.startTime;
          const displayEndTime = (hoursType === "actual" && actualEndTime) ? actualEndTime : assignment.endTime;
          const shiftTotalHours = hoursType === "actual" ? totalActualHours : shiftHours * numberOfPeople;
          if (!taskTypeIsHourlyService) {
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
            shifts,
            overtimeHours,
          });
        }
        const shift = taskTypeMap.get(shiftKey)!;
        
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
          
          shift.duties.set(dutyId, {
            dutyId,
            dutyName: dutyInfo.name,
            dutyCode: dutyInfo.code,
            numberOfPeople: peopleCount,
            totalHours: hours,
          });
        }

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
          
          if (!taskTypeIsHourlyService) {
            const hoursPerPerson = hours / peopleCount;
            const { shifts: shiftsPerPerson, overtimeHours: overtimePerPerson } = calculateShiftAndOvertime(hoursPerPerson, taskTypeShiftHours);
            const totalShiftsForDuty = shiftsPerPerson * peopleCount;
            const totalOvertimeForDuty = overtimePerPerson * peopleCount;
            dutyData.shifts += totalShiftsForDuty;
            dutyData.overtimeHours += totalOvertimeForDuty;
            totalShifts += totalShiftsForDuty;
            totalOvertimeHours += totalOvertimeForDuty;
          } else {
            dutyData.hours += hours;
            totalHours += hours;
          }
        }
      } else {
        let hours = calculateHoursFromTimeRange(
          assignment.startTime,
          assignment.endTime
        );
        
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
        
        const userCount = assignedUserIds.size > 0 ? assignedUserIds.size : Math.max(1, assignment.timeEntries.length);
        const hoursPerUser = hours / userCount;

        const dutyPeopleCount = new Map<string, number>();
        
        for (const userId of assignedUserIds.size > 0 ? assignedUserIds : assignment.timeEntries.map(te => te.userId)) {
          const dutyId = assignmentUserDutyMap.get(userId) || "";
          const currentPeople = dutyPeopleCount.get(dutyId) || 0;
          dutyPeopleCount.set(dutyId, currentPeople + 1);
        }

        const shiftKey = `${assignment.startTime || ""}-${assignment.endTime || ""}`;
        
        if (!dailyDetailsMap.has(dateKey)) {
          dailyDetailsMap.set(dateKey, new Map());
        }
        const dateMap = dailyDetailsMap.get(dateKey)!;
        
        if (!dateMap.has(taskTypeId)) {
          dateMap.set(taskTypeId, new Map());
        }
        const taskTypeMap = dateMap.get(taskTypeId)!;
        
        if (!taskTypeMap.has(shiftKey)) {
          let shifts = 0;
          let overtimeHours = 0;
          if (!taskTypeIsHourlyService) {
            const calc = calculateShiftAndOvertime(shiftHours, taskTypeShiftHours);
            shifts = calc.shifts * userCount;
            overtimeHours = calc.overtimeHours * userCount;
          }
          
          taskTypeMap.set(shiftKey, {
            startTime: assignment.startTime,
            endTime: assignment.endTime,
            hasScheduledBreak: assignment.hasScheduledBreak || false,
            scheduledBreakStartTime: assignment.scheduledBreakStartTime || null,
            scheduledBreakEndTime: assignment.scheduledBreakEndTime || null,
            duties: new Map(),
            totalHours: shiftHours,
            numberOfPeople: userCount,
            shifts,
            overtimeHours,
          });
        }
        const shift = taskTypeMap.get(shiftKey)!;
        
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
          
          if (!taskTypeIsHourlyService) {
            const hoursPerPerson = hours;
            const { shifts: shiftsPerPerson, overtimeHours: overtimePerPerson } = calculateShiftAndOvertime(hoursPerPerson, taskTypeShiftHours);
            const totalShiftsForDuty = shiftsPerPerson * peopleCount;
            const totalOvertimeForDuty = overtimePerPerson * peopleCount;
            dutyData.shifts += totalShiftsForDuty;
            dutyData.overtimeHours += totalOvertimeForDuty;
            totalShifts += totalShiftsForDuty;
            totalOvertimeHours += totalOvertimeForDuty;
          } else {
            dutyData.hours += totalHoursForDuty;
            totalHours += totalHoursForDuty;
          }
        }
      }
    }

    const summaryByDuty = Array.from(dutyHoursMap.values()).map(d => ({
      dutyCode: d.dutyCode,
      dutyName: d.dutyName,
      hours: d.hours,
      shifts: d.shifts,
      overtimeHours: d.overtimeHours,
    }));

    const dailyDetails: Array<{
      date: string;
      taskTypes: Array<{
        taskTypeId: string;
        taskTypeName: string;
        isHourlyService?: boolean;
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

    const sortedDates = Array.from(dailyDetailsMap.keys()).sort();
    
    for (const dateKey of sortedDates) {
      const dateMap = dailyDetailsMap.get(dateKey)!;
      const taskTypes: Array<{
        taskTypeId: string;
        taskTypeName: string;
        isHourlyService?: boolean;
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

      for (const [taskTypeId, taskTypeMap] of dateMap.entries()) {
        const taskTypeInfo = taskTypeCache.get(taskTypeId) || { name: "Non specificato", isHourlyService: true, shiftHours: null };
        const shifts: Array<{
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

      taskTypes.sort((a, b) => a.taskTypeName.localeCompare(b.taskTypeName));

      dailyDetails.push({
        date: dateKey,
        taskTypes,
      });
    }

    return NextResponse.json({
      eventId,
      eventTitle: event.title,
      locationId: event.locationId,
      locationName: locationName,
      clients: eventClients,
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
    console.error("Error generating event report:", error);
    return NextResponse.json(
      { error: "Error generating report", details: String(error) },
      { status: 500 }
    );
  }
}
